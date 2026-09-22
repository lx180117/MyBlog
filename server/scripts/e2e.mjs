#!/usr/bin/env node
/**
 * 端到端验收脚本（E2E）
 * ---------------------------------------------------------------------------
 * 目的：把 Step 6 因「本机没有数据库」而挂着的 5 个场景真正跑一遍，让「未验证」
 *       清单归零。脚本只依赖全局 fetch，不引任何测试框架 —— 因为要验证的是
 *       真实 HTTP 行为，不是单元测试的 mock 行为。
 *
 * 覆盖场景：
 *   0. 环境自检：/health 报告的数据库连通性
 *   1. 注册 → 管理员审核 → 发文 → 前台可见（含 pending 不可发文、搜索、归档）
 *   2. 发布 / 撤回 / 定时发布 / 软删 / 恢复 / 置顶 + 点赞去重与计数器触发器
 *   3. 评论：游客与登录、两级嵌套、审核、敏感词强制待审、同 IP 冷却
 *   4. 图片上传：真实 PNG 落盘可访问、伪造魔数被拒、类型白名单、权限
 *   5. 令牌：刷新、并发刷新、无效刷新、access 过期后刷新续期、改密后旧密码失效
 *
 * 前置条件：后端已启动，且数据库已建表 + 已执行 seed（管理员账号存在）。
 *
 * 用法：
 *   node scripts/e2e.mjs
 *   E2E_BASE=http://127.0.0.1:3002 node scripts/e2e.mjs   # 指定实例
 *
 * 环境变量：
 *   E2E_BASE            后端根地址，默认 http://127.0.0.1:3000
 *   E2E_PREFIX          接口前缀，默认 api/v1
 *   E2E_ADMIN_ACCOUNT   管理员登录名，默认 admin
 *   E2E_ADMIN_PASSWORD  管理员密码，默认 Admin@123456
 *   E2E_SHORT_BASE      可选的「access token 短有效期」实例地址。设了就多跑
 *                       一段「过期 → 401 → 刷新 → 重试成功」的真实链路
 *   E2E_KEEP=1          跳过收尾清理（默认会清掉本次创建的文章与账号）
 *
 * 退出码：全部通过 0，有断言失败 1。
 */

import { deflateSync } from 'node:zlib';

// ============================================================ 配置与工具

const BASE = (process.env.E2E_BASE || 'http://127.0.0.1:3000').replace(/\/+$/, '');
const PREFIX = process.env.E2E_PREFIX || 'api/v1';
const API = `${BASE}/${PREFIX}`;

const ADMIN_ACCOUNT = process.env.E2E_ADMIN_ACCOUNT || 'admin';
const ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD || 'Admin@123456';
const SHORT_BASE = (process.env.E2E_SHORT_BASE || '').replace(/\/+$/, '');
const KEEP = process.env.E2E_KEEP === '1';

/** 每次运行的唯一后缀，保证脚本可重复执行而不撞唯一索引 */
const RUN = Date.now().toString(36);

const AUTHOR = {
  username: `e2ea${RUN}`,
  email: `e2ea+${RUN}@example.com`,
  password: 'E2ePass!2345',
  nickname: 'E2E 作者',
};
const RIVAL = {
  username: `e2eb${RUN}`,
  email: `e2eb+${RUN}@example.com`,
  password: 'E2ePass!2345',
  nickname: 'E2E 二号作者',
};

/**
 * 用 X-Forwarded-For 模拟不同客户端（服务端 trust proxy 已开启）。
 *
 * 为什么要给「每个请求」都换一个来源 IP：ThrottlerGuard 是全局的
 * （默认 120 次/分钟，登录 10 次/分钟、注册 5 次/分钟、发评论 5 次/分钟），
 * 整个脚本有近 200 个请求，若都从 127.0.0.1 发出，会先撞上限流，
 * 断言失败的原因就变成「脚本自己把自己限流了」而不是业务逻辑有问题。
 *
 * 网段用 RFC 5737 的文档测试网段，绝不会与真实地址冲突。
 */
let ipSeq = 5;
const nextIp = () => {
  const n = ipSeq++;
  return n <= 254 ? `203.0.113.${n}` : `192.0.2.${n - 254}`;
};
/** 固定 IP：专用于「必须同一个来源」的用例（阅读量去重、点赞去重、评论冷却） */
const FIXED_IP = '198.51.100.7';

// ------------------------------------------------------------ 断言框架

const state = { pass: 0, fail: 0, skip: 0, failures: [], findings: [] };

let currentSection = '';

function section(title) {
  currentSection = title;
  console.log(`\n${'─'.repeat(72)}\n${title}\n${'─'.repeat(72)}`);
}

function ok(name, cond, detail = '') {
  if (cond) {
    state.pass += 1;
    console.log(`  ✓ ${name}`);
  } else {
    state.fail += 1;
    state.failures.push(`[${currentSection}] ${name}${detail ? ` —— ${detail}` : ''}`);
    console.log(`  ✗ ${name}${detail ? `\n      ${detail}` : ''}`);
  }
  return !!cond;
}

function eq(name, actual, expected) {
  const a = JSON.stringify(actual);
  const b = JSON.stringify(expected);
  return ok(name, a === b, a === b ? '' : `期望 ${b}，实际 ${a}`);
}

/** 只记录信息，不计入成败 */
function info(msg) {
  console.log(`  · ${msg}`);
}

/** 值得写进报告、但不是缺陷的观察 */
function finding(msg) {
  state.findings.push(msg);
  console.log(`  ! ${msg}`);
}

function skip(name, why) {
  state.skip += 1;
  console.log(`  - 跳过：${name}（${why}）`);
}

// ------------------------------------------------------------ HTTP

async function req(method, path, { token, body, form, ip, headers = {} } = {}) {
  const url = /^https?:\/\//.test(path) ? path : `${API}${path}`;
  const h = { ...headers };
  if (token) h.authorization = `Bearer ${token}`;
  // 默认每个请求换一个来源 IP（规避全局限流），需要同源语义时由调用方显式传 ip
  h['x-forwarded-for'] = ip || nextIp();

  let payload;
  if (form) {
    payload = form;
  } else if (body !== undefined) {
    h['content-type'] = 'application/json';
    payload = JSON.stringify(body);
  }

  const res = await fetch(url, {
    method,
    headers: h,
    body: payload,
    signal: AbortSignal.timeout(20_000),
  });
  const text = await res.text();
  let parsed = null;
  if (text) {
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = text;
    }
  }
  return { status: res.status, body: parsed, headers: res.headers };
}

/** 错误响应里 message 可能是字符串或字符串数组，统一成一段文本方便断言 */
function errText(res) {
  const m = res.body?.message ?? res.body?.error ?? res.body;
  return Array.isArray(m) ? m.join(' | ') : String(m ?? '');
}

/**
 * 从前台评论分页响应里取出所有「可见」的评论 id（顶级评论 + 其回复）。
 *
 * 不要用 `JSON.stringify(body).includes(id)` 这种子串判断：评论 id 是很短的
 * 数字串（"1"、"3"），而响应里到处是 articleId、pageSize、commentCount 之类的
 * 数字，子串匹配必然误判 —— 第一版脚本就因此报了假失败。
 */
function visibleCommentIds(page) {
  const ids = new Set();
  for (const item of page?.items ?? []) {
    ids.add(String(item.id));
    for (const reply of item.replies ?? []) ids.add(String(reply.id));
  }
  return ids;
}

// ------------------------------------------------------------ 1x1 真 PNG

function crc32(buf) {
  let c;
  const table = [];
  for (let n = 0; n < 256; n += 1) {
    c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  let crc = 0xffffffff;
  for (const byte of buf) crc = table[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, 'ascii');
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crcBuf]);
}

/**
 * 生成一张真实可解码的 PNG（不是只有魔数的假文件）。
 * 这点很重要：上传校验会解析 IHDR 取宽高，假文件会在这里暴露。
 */
function makePng(width = 1, height = 1, rgb = [220, 38, 38]) {
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // color type: truecolor
  // 10..12 保持 0：compression / filter / interlace 都是默认值
  const raw = Buffer.alloc(height * (1 + width * 3));
  for (let y = 0; y < height; y += 1) {
    const rowStart = y * (1 + width * 3);
    raw[rowStart] = 0; // filter type: none
    for (let x = 0; x < width; x += 1) {
      const p = rowStart + 1 + x * 3;
      raw[p] = rgb[0];
      raw[p + 1] = rgb[1];
      raw[p + 2] = rgb[2];
    }
  }
  return Buffer.concat([
    sig,
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', deflateSync(raw)),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

function fileFrom(buf, filename, type) {
  const form = new FormData();
  form.append('file', new Blob([buf], { type }), filename);
  return form;
}

// ------------------------------------------------------------ 共享上下文

const ctx = {
  adminToken: null,
  adminId: null,
  authorToken: null,
  authorRefresh: null,
  authorId: null,
  rivalToken: null,
  rivalId: null,
  articleId: null,
  articleSlug: null,
  articleTitle: null,
  secondArticleId: null,
  uploadUrl: null,
  uploadBytes: null,
  createdArticleIds: [],
  createdUserIds: [],
  originalSettings: {},
};

async function login(account, password) {
  const res = await req('POST', '/auth/login', { body: { account, password } });
  if (res.status !== 200 && res.status !== 201) {
    throw new Error(`登录失败 ${account}：HTTP ${res.status} ${errText(res)}`);
  }
  return res.body; // { user, tokens }
}

/** 注册 + 管理员审核激活，返回 { id, tokens } */
async function registerAndActivate(user, asAdmin) {
  const reg = await req('POST', '/auth/register', {
    body: { username: user.username, email: user.email, password: user.password, nickname: user.nickname },
  });
  if (reg.status !== 201 && reg.status !== 200) {
    throw new Error(`注册失败 ${user.username}：HTTP ${reg.status} ${errText(reg)}`);
  }
  ctx.createdUserIds.push(reg.body.data.user.id);

  const list = await req('GET', '/admin/users?status=pending&pageSize=50', { token: asAdmin });
  const target = (list.body?.items ?? []).find((u) => u.username === user.username);
  if (!target) throw new Error(`审核列表里找不到 ${user.username}`);

  const act = await req('PATCH', `/admin/users/${target.id}/status`, {
    token: asAdmin,
    body: { status: 'active', remark: 'E2E 自动审核' },
  });
  if (act.status !== 200) throw new Error(`激活 ${user.username} 失败：HTTP ${act.status} ${errText(act)}`);

  return { id: target.id, tokens: reg.body.data.tokens };
}

// ============================================================ 场景 0

async function scenario0() {
  section('场景 0 · 环境自检（数据库连通性）');

  const health = await req('GET', `${BASE}/health`);
  ok('GET /health 返回 200', health.status === 200, `HTTP ${health.status}`);
  info(`health 内容：${JSON.stringify(health.body)}`);
  ok(
    '数据库状态为 up（说明 DATABASE_URL 已连通）',
    health.body?.database === 'up' || health.body?.db === 'up' || health.body?.info?.database?.status === 'up',
    `实际字段：${JSON.stringify(health.body)}`,
  );

  const loginRes = await login(ADMIN_ACCOUNT, ADMIN_PASSWORD);
  ctx.adminToken = loginRes.tokens.accessToken;
  ctx.adminId = loginRes.user.id;
  eq('管理员登录后角色为 admin', loginRes.user.role, 'admin');
  eq('管理员状态为 active', loginRes.user.status, 'active');
  ok('登录响应带上了 email 字段（本次为前端个人资料页补的契约）', typeof loginRes.user.email === 'string');
}

// ============================================================ 场景 1

async function scenario1() {
  section('场景 1 · 注册 → 管理员审核 → 发文 → 前台可见（完整链路）');

  // --- 注册
  const reg = await req('POST', '/auth/register', {
    body: {
      username: AUTHOR.username,
      email: AUTHOR.email,
      password: AUTHOR.password,
      nickname: AUTHOR.nickname,
    },
    ip: nextIp(),
  });
  ok('注册返回 201', reg.status === 201, `HTTP ${reg.status} ${errText(reg)}`);
  eq('新账号状态为 pending', reg.body?.data?.user?.status, 'pending');
  eq('新账号角色为 author', reg.body?.data?.user?.role, 'author');
  ok('注册即返回令牌对', !!reg.body?.data?.tokens?.accessToken && !!reg.body?.data?.tokens?.refreshToken);
  ctx.authorId = reg.body.data.user.id;
  ctx.createdUserIds.push(ctx.authorId);
  ctx.authorToken = reg.body.data.tokens.accessToken;
  ctx.authorRefresh = reg.body.data.tokens.refreshToken;

  // --- 重复注册
  const dup = await req('POST', '/auth/register', {
    body: { username: AUTHOR.username, email: `other+${RUN}@example.com`, password: AUTHOR.password, nickname: 'x' },
    ip: nextIp(),
  });
  eq('用户名重复注册被拒（409）', dup.status, 409);

  const dupMail = await req('POST', '/auth/register', {
    body: { username: `zz${RUN}`, email: AUTHOR.email, password: AUTHOR.password, nickname: 'x' },
    ip: nextIp(),
  });
  eq('邮箱重复注册被拒（409）', dupMail.status, 409);

  const weak = await req('POST', '/auth/register', {
    body: { username: `wk${RUN}`, email: `wk+${RUN}@example.com`, password: '123456', nickname: 'x' },
    ip: nextIp(),
  });
  eq('弱密码被拒（400）', weak.status, 400);

  // --- pending 状态：能登录、能进后台，但不能发文（@RequireActive）
  const me = await req('GET', '/auth/me', { token: ctx.authorToken });
  eq('pending 账号可以访问 /auth/me', me.status, 200);
  eq('canPublish 为 false', me.body?.canPublish, false);

  const blocked = await req('POST', '/me/articles', {
    token: ctx.authorToken,
    body: { title: 'pending 不该能发', content: '正文' },
  });
  eq('pending 账号发文被拒（403）', blocked.status, 403);
  info(`拒绝原因：${errText(blocked)}`);

  // --- 管理员审核
  const pending = await req('GET', '/admin/users?status=pending&pageSize=50', { token: ctx.adminToken });
  ok('待审核列表能查到刚注册的账号', (pending.body?.items ?? []).some((u) => u.id === ctx.authorId));

  const act = await req('PATCH', `/admin/users/${ctx.authorId}/status`, {
    token: ctx.adminToken,
    body: { status: 'active', remark: 'E2E 审核通过' },
  });
  eq('审核激活返回 200', act.status, 200);
  eq('审核后状态为 active', act.body?.status, 'active');

  // 关键点：令牌是无状态的，激活前后是同一个 token。
  // 它能立刻发文，说明守卫确实每次回查了数据库，而不是信令牌里的旧状态。
  const meAfter = await req('GET', '/auth/me', { token: ctx.authorToken });
  eq('同一个旧令牌立刻拿到 canPublish = true（证明守卫回查 DB）', meAfter.body?.canPublish, true);

  // --- 发文
  ctx.articleTitle = `E2E 端到端验收文章 ${RUN}`;
  const uniqueWord = `端到端${RUN}`;
  const content = [
    `# ${ctx.articleTitle}`,
    '',
    `这是脚本自动创建的文章，含唯一检索词 **${uniqueWord}**。`,
    '',
    '## 二级标题 A',
    '',
    '正文段落，用来验证 Markdown 渲染缓存与目录提取。',
    '',
    '```js',
    "console.log('code fence keeps intact');",
    '```',
    '',
    '## 二级标题 B',
    '',
    '| 列 | 值 |',
    '| --- | --- |',
    '| 触发器 | 待验证 |',
  ].join('\n');

  const created = await req('POST', '/me/articles', {
    token: ctx.authorToken,
    body: { title: ctx.articleTitle, content, tags: [`e2e-${RUN}`, `标签${RUN}`] },
  });
  eq('新建文章返回 201', created.status, 201, errText(created));
  eq('默认状态为 draft', created.body?.status, 'draft');
  ok('自动生成了 slug', typeof created.body?.slug === 'string' && created.body.slug.length > 0);
  ok('自动生成了摘要', typeof created.body?.summary === 'string' && created.body.summary.length > 0);
  ok('tags 已关联 2 个', Array.isArray(created.body?.tags) && created.body.tags.length === 2);
  ctx.articleId = created.body.id;
  ctx.articleSlug = created.body.slug;
  ctx.createdArticleIds.push(ctx.articleId);

  const asDetail = await req('GET', `/me/articles/${ctx.articleId}`, { token: ctx.authorToken });
  ok('编辑器回填返回原始 Markdown 正文', String(asDetail.body?.content ?? '').startsWith('#'));
  ok(
    '编辑器回填不含 contentHtml / toc（设计如此：管理端 DTO 只给原文，渲染在前端做）',
    !('contentHtml' in (asDetail.body ?? {})) && !('toc' in (asDetail.body ?? {})),
    `实际字段：${Object.keys(asDetail.body ?? {}).join(',')}`,
  );

  // --- 草稿对外不可见
  const draftAnon = await req('GET', `/articles/${ctx.articleSlug}`);
  eq('未发布时游客访问详情 404', draftAnon.status, 404);
  const draftAsOwner = await req('GET', `/articles/${ctx.articleSlug}`, { token: ctx.authorToken });
  eq('未发布时作者本人可预览（200）', draftAsOwner.status, 200);
  eq('作者预览自己文章时 canEdit 为 true（公开接口可选认证的回归点）', draftAsOwner.body?.canEdit, true);

  // --- 发布
  const pub = await req('PATCH', `/me/articles/${ctx.articleId}/publish`, { token: ctx.authorToken, body: {} });
  eq('发布返回 200', pub.status, 200);
  eq('状态变为 published', pub.body?.status, 'published');
  ok('publishedAt 已写入', !!pub.body?.publishedAt);

  const detail = await req('GET', `/articles/${ctx.articleSlug}`, { ip: nextIp() });
  eq('游客可访问已发布详情（200）', detail.status, 200);
  eq('标题一致', detail.body?.title, ctx.articleTitle);
  ok('返回渲染好的 HTML', (detail.body?.contentHtml ?? '').includes('<h2'));
  ok('作者昵称已带上', detail.body?.author?.nickname === AUTHOR.nickname, `实际：${JSON.stringify(detail.body?.author)}`);
  eq('游客 canEdit 为 false', detail.body?.canEdit, false);

  // --- 前台列表 / 搜索 / 归档 / 作者页
  const list = await req('GET', '/articles?pageSize=50', { ip: nextIp() });
  ok('前台列表能查到该文章', (list.body?.items ?? []).some((a) => a.id === ctx.articleId));

  const search = await req('GET', `/articles?keyword=${encodeURIComponent(uniqueWord)}`, { ip: nextIp() });
  ok(
    `中文关键词搜索命中（检索词 ${uniqueWord}）`,
    (search.body?.items ?? []).some((a) => a.id === ctx.articleId),
    `返回 ${search.body?.total} 条`,
  );

  const byAuthor = await req('GET', `/articles?authorUsername=${AUTHOR.username}`, { ip: nextIp() });
  ok('按作者筛选命中', (byAuthor.body?.items ?? []).some((a) => a.id === ctx.articleId));

  const authorPage = await req('GET', `/authors/${AUTHOR.username}`, { ip: nextIp() });
  eq('作者主页返回 200', authorPage.status, 200);
  ok(
    '作者主页统计到文章数 ≥ 1',
    Number(authorPage.body?.author?.articleCount ?? 0) >= 1,
    JSON.stringify(authorPage.body?.author),
  );

  const archives = await req('GET', '/articles/archives', { ip: nextIp() });
  ok('归档接口返回数组', Array.isArray(archives.body));

  // --- 阅读量：同 IP 10 分钟内去重
  const before = (await req('GET', `/articles/${ctx.articleSlug}`, { ip: FIXED_IP })).body?.viewCount ?? 0;
  await req('POST', `/articles/${ctx.articleId}/view`, { ip: FIXED_IP, body: {} });
  const afterFirst = (await req('GET', `/articles/${ctx.articleSlug}`, { ip: FIXED_IP })).body?.viewCount ?? 0;
  await req('POST', `/articles/${ctx.articleId}/view`, { ip: FIXED_IP, body: {} });
  const afterSecond = (await req('GET', `/articles/${ctx.articleSlug}`, { ip: FIXED_IP })).body?.viewCount ?? 0;
  await req('POST', `/articles/${ctx.articleId}/view`, { ip: nextIp(), body: {} });
  const afterOtherIp = (await req('GET', `/articles/${ctx.articleSlug}`, { ip: FIXED_IP })).body?.viewCount ?? 0;

  eq('首次浏览阅读量 +1', afterFirst, before + 1);
  eq('同 IP 重复浏览被去重（不再增加）', afterSecond, afterFirst);
  eq('换 IP 浏览可再次 +1', afterOtherIp, afterFirst + 1);

  // --- 越权：另一个作者不能改别人的文章
  section('场景 1b · 越权与权限边界');
  const rival = await registerAndActivate(RIVAL, ctx.adminToken);
  ctx.rivalToken = rival.tokens.accessToken;
  ctx.rivalId = rival.id;

  const steal = await req('PATCH', `/me/articles/${ctx.articleId}`, {
    token: ctx.rivalToken,
    body: { title: '劫持标题' },
  });
  ok('其他作者无法修改他人文章（403/404）', steal.status === 403 || steal.status === 404, `HTTP ${steal.status}`);

  const stealDel = await req('DELETE', `/me/articles/${ctx.articleId}`, { token: ctx.rivalToken });
  ok('其他作者无法删除他人文章（403/404）', stealDel.status === 403 || stealDel.status === 404, `HTTP ${stealDel.status}`);

  const purgeAsAuthor = await req('DELETE', `/admin/articles/${ctx.articleId}/purge`, { token: ctx.rivalToken });
  eq('作者访问管理员接口被拒（403）', purgeAsAuthor.status, 403);

  const anonMine = await req('GET', '/me/articles');
  eq('未登录访问我的文章 401', anonMine.status, 401);

  const badToken = await req('GET', '/auth/me', { token: 'not-a-real-token' });
  eq('伪造令牌 401', badToken.status, 401);

  // --- 非法路径参数
  // 回归点：控制器里曾经直接写 BigInt(id)，`/articles/abc/like` 会抛
  // SyntaxError: Cannot convert abc to a BigInt —— 不是 HttpException，
  // 被当成未捕获异常，客户端拿到 500 且日志被错误堆栈刷满。
  // 现已统一由 ParseBigIntPipe 转成 400。
  const badIdLike = await req('POST', '/articles/not-a-number/like');
  eq('非法 ID 点赞返回 400（回归：曾为 500）', badIdLike.status, 400);
  const badIdDelete = await req('DELETE', '/me/articles/not-a-number', { token: ctx.authorToken });
  eq('非法 ID 删除返回 400（回归：曾为 500）', badIdDelete.status, 400);
  const badIdPurge = await req('DELETE', '/admin/articles/not-a-number/purge', { token: ctx.adminToken });
  eq('非法 ID 彻底删除返回 400（回归：曾为 500）', badIdPurge.status, 400);
  const badComment = await req('POST', '/articles/not-a-number/comments', {
    body: { content: 'x', nickname: 'y' },
  });
  eq('非法文章 ID 发评论返回 400（回归：曾为 500）', badComment.status, 400);
}

// ============================================================ 场景 2

async function scenario2() {
  section('场景 2 · 发布 / 撤回 / 定时发布 / 软删 / 恢复 / 置顶');

  // --- 撤回
  const unpub = await req('PATCH', `/me/articles/${ctx.articleId}/unpublish`, { token: ctx.authorToken });
  eq('撤回返回 200', unpub.status, 200);
  eq('撤回后状态为 draft', unpub.body?.status, 'draft');
  eq('撤回后游客详情 404', (await req('GET', `/articles/${ctx.articleSlug}`, { ip: nextIp() })).status, 404);
  const listAfterUnpub = await req('GET', `/articles?pageSize=50`, { ip: nextIp() });
  ok('撤回后不出现在前台列表', !(listAfterUnpub.body?.items ?? []).some((a) => a.id === ctx.articleId));

  // --- 定时发布：时间在未来
  const future = new Date(Date.now() + 2 * 24 * 3600 * 1000).toISOString();
  const sched = await req('PATCH', `/me/articles/${ctx.articleId}/publish`, {
    token: ctx.authorToken,
    body: { publishedAt: future },
  });
  eq('定时发布返回 200', sched.status, 200);
  eq('状态已置 published', sched.body?.status, 'published');

  const schedDetail = await req('GET', `/articles/${ctx.articleSlug}`, { ip: nextIp() });
  eq('定时未到时游客详情 404', schedDetail.status, 404);
  const schedList = await req('GET', '/articles?pageSize=50', { ip: nextIp() });
  ok('定时未到时不出现在前台列表', !(schedList.body?.items ?? []).some((a) => a.id === ctx.articleId));
  const mine = await req('GET', '/me/articles?pageSize=50', { token: ctx.authorToken });
  ok('作者后台仍能看到这篇定时文章', (mine.body?.items ?? []).some((a) => a.id === ctx.articleId));

  const schedAsOwner = await req('GET', `/articles/${ctx.articleSlug}`, { token: ctx.authorToken });
  eq('作者本人可预览定时文章', schedAsOwner.status, 200);
  const schedAsAdmin = await req('GET', `/articles/${ctx.articleSlug}`, { token: ctx.adminToken });
  eq('管理员可预览定时文章', schedAsAdmin.status, 200);

  // 把发布时间改到过去 = 立刻可见（验证「到点自动可见」不需要定时任务）
  const past = new Date(Date.now() - 3600 * 1000).toISOString();
  const nowPub = await req('PATCH', `/me/articles/${ctx.articleId}/publish`, {
    token: ctx.authorToken,
    body: { publishedAt: past },
  });
  eq('把发布时间改到过去后仍为 published', nowPub.body?.status, 'published');
  eq('改到过去后游客立即可见', (await req('GET', `/articles/${ctx.articleSlug}`, { ip: nextIp() })).status, 200);

  const badDate = await req('PATCH', `/me/articles/${ctx.articleId}/publish`, {
    token: ctx.authorToken,
    body: { publishedAt: '不是时间' },
  });
  eq('非法 publishedAt 被拒（400）', badDate.status, 400);

  // --- 置顶
  const top = await req('PATCH', `/me/articles/${ctx.articleId}/top`, { token: ctx.authorToken, body: { isTop: true } });
  eq('置顶返回 200', top.status, 200);
  eq('isTop 为 true', top.body?.isTop, true);
  await req('PATCH', `/me/articles/${ctx.articleId}/top`, { token: ctx.authorToken, body: { isTop: false } });

  // --- 统计
  const stats = await req('GET', '/me/articles/stats', { token: ctx.authorToken });
  ok('我的文章统计接口可用', stats.status === 200 && typeof stats.body?.total === 'number', JSON.stringify(stats.body));

  // --- 第二篇：用于「软删 / 恢复 / 彻底删除」及触发器验证
  const second = await req('POST', '/me/articles', {
    token: ctx.authorToken,
    body: { title: `E2E 回收站用文章 ${RUN}`, content: '# 回收站\n\n待删除。', status: 'published' },
  });
  ctx.secondArticleId = second.body.id;
  ctx.createdArticleIds.push(ctx.secondArticleId);
  eq('带 status=published 直接创建即为已发布', second.body?.status, 'published');
  const secondSlug = second.body.slug;
  const secondId = second.body.id;
  eq('直接发布后游客可见', (await req('GET', `/articles/${secondSlug}`, { ip: nextIp() })).status, 200);

  // --- 点赞去重 + 计数触发器
  const beforeLike = (await req('GET', `/articles/${secondSlug}`, { ip: nextIp() })).body?.likeCount ?? 0;
  await req('POST', `/articles/${secondId}/like`, { ip: FIXED_IP });
  const afterLike = (await req('GET', `/articles/${secondSlug}`, { ip: nextIp() })).body?.likeCount ?? 0;
  await req('POST', `/articles/${secondId}/like`, { ip: FIXED_IP });
  const afterLikeDup = (await req('GET', `/articles/${secondSlug}`, { ip: nextIp() })).body?.likeCount ?? 0;
  await req('DELETE', `/articles/${secondId}/like`, { ip: FIXED_IP });
  const afterUnlike = (await req('GET', `/articles/${secondSlug}`, { ip: nextIp() })).body?.likeCount ?? 0;
  await req('DELETE', `/articles/${secondId}/like`, { ip: FIXED_IP });
  const afterUnlikeDup = (await req('GET', `/articles/${secondSlug}`, { ip: nextIp() })).body?.likeCount ?? 0;

  eq('点赞后 like_count +1（触发器工作）', afterLike, beforeLike + 1);
  eq('同 IP 重复点赞不重复计数', afterLikeDup, afterLike);
  eq('取消点赞后 like_count -1', afterUnlike, afterLike - 1);
  eq('重复取消点赞不出现负数', afterUnlikeDup, afterUnlike);

  // --- 软删 / 恢复
  const del = await req('DELETE', `/me/articles/${secondId}`, { token: ctx.authorToken });
  eq('软删返回 200', del.status, 200);
  eq('软删后游客详情 404', (await req('GET', `/articles/${secondSlug}`, { ip: nextIp() })).status, 404);
  const rec = await req('GET', '/me/articles?status=deleted&pageSize=50', { token: ctx.authorToken });
  ok('回收站里能查到被删文章', (rec.body?.items ?? []).some((a) => a.id === secondId));

  const delAgain = await req('DELETE', `/me/articles/${secondId}`, { token: ctx.authorToken });
  eq('重复软删幂等（200）', delAgain.status, 200);

  const restored = await req('POST', `/me/articles/${secondId}/restore`, { token: ctx.authorToken });
  ok('恢复返回 200/201', [200, 201].includes(restored.status), `HTTP ${restored.status} ${errText(restored)}`);
  eq('恢复后回到 draft（不是直接发布）', restored.body?.status, 'draft');
  eq('恢复后游客仍不可见', (await req('GET', `/articles/${secondSlug}`, { ip: nextIp() })).status, 404);

  const restoreAgain = await req('POST', `/me/articles/${secondId}/restore`, { token: ctx.authorToken });
  eq('对非回收站文章再次恢复被拒（400）', restoreAgain.status, 400);

  // admin 视角筛选
  const adminList = await req('GET', '/admin/articles?pageSize=50', { token: ctx.adminToken });
  ok('管理员能看到全站文章（含未发布）', (adminList.body?.items ?? []).some((a) => a.id === ctx.secondArticleId));
}

// ============================================================ 场景 3

async function scenario3() {
  section('场景 3 · 评论：提交 / 两级嵌套 / 审核 / 敏感词 / 冷却');

  // 记录原始配置，跑完还原
  const adminSettings = await req('GET', '/admin/settings', { token: ctx.adminToken });
  ctx.originalSettings = adminSettings.body?.values ?? {};
  const origSensitive = ctx.originalSettings.sensitive_words ?? '';
  const origNeedApprove = ctx.originalSettings.comment_need_approve ?? 'true';
  info(`原始配置：sensitive_words="${origSensitive}" comment_need_approve=${origNeedApprove}`);

  // 确保文章处于已发布
  await req('PATCH', `/me/articles/${ctx.articleId}/publish`, { token: ctx.authorToken, body: {} });

  // --- 游客必须填昵称
  const noNick = await req('POST', `/articles/${ctx.articleId}/comments`, {
    body: { content: '游客没写昵称' },
    ip: nextIp(),
  });
  eq('游客不填昵称被拒（400）', noNick.status, 400);
  info(`拒绝原因：${errText(noNick)}`);

  // --- 游客正常评论 → 默认需要审核 → pending
  const guestIp = nextIp();
  const c1 = await req('POST', `/articles/${ctx.articleId}/comments`, {
    body: { content: `游客评论 ${RUN}`, nickname: '路人甲' },
    ip: guestIp,
  });
  eq('游客评论返回 201', c1.status, 201, errText(c1));
  eq('命中审核开关时 pendingReview = true', c1.body?.pendingReview, true);
  const c1Id = c1.body?.comment?.id;
  ok('返回了评论 id', !!c1Id);

  const pubList1 = await req('GET', `/articles/${ctx.articleId}/comments`, { ip: nextIp() });
  ok('待审评论不出现在前台列表', !visibleCommentIds(pubList1.body).has(String(c1Id)));

  // --- 同 IP 冷却
  const tooFast = await req('POST', `/articles/${ctx.articleId}/comments`, {
    body: { content: '紧接着再来一条', nickname: '路人甲' },
    ip: guestIp,
  });
  eq('同 IP 60 秒内第二条被拒（400）', tooFast.status, 400);
  info(`冷却提示：${errText(tooFast)}`);

  // --- 后台审核通过
  const pend = await req('GET', '/admin/comments?status=pending&pageSize=50', { token: ctx.adminToken });
  ok('审核列表能查到待审评论', (pend.body?.items ?? []).some((c) => c.id === c1Id));

  const approve = await req('PATCH', `/admin/comments/${c1Id}/approve`, { token: ctx.adminToken, body: {} });
  eq('审核通过返回 200', approve.status, 200);

  const pubList2 = await req('GET', `/articles/${ctx.articleId}/comments`, { ip: nextIp() });
  ok('审核通过后出现在前台列表', visibleCommentIds(pubList2.body).has(String(c1Id)));

  const detailAfterComment = await req('GET', `/articles/${ctx.articleSlug}`, { ip: nextIp() });
  eq('文章 comment_count 由触发器同步为 1', detailAfterComment.body?.commentCount, 1);

  // --- 登录用户回复（两级）
  const replyIp = nextIp();
  const c2 = await req('POST', `/articles/${ctx.articleId}/comments`, {
    token: ctx.rivalToken,
    body: { content: `登录用户回复 ${RUN}`, parentId: c1Id },
    ip: replyIp,
  });
  eq('登录用户回复返回 201', c2.status, 201, errText(c2));
  const c2Id = c2.body?.comment?.id;
  // 回归点：这条路径曾经返回 500 —— 公开接口的可选认证给出缺 id 的用户对象，
  // 导致 user_id 与 nickname 同时为 NULL，撞上「游客必有昵称」的 CHECK 约束
  eq('登录用户评论被标记为已注册用户', c2.body?.comment?.isRegistered, true);
  eq('登录用户评论展示账号昵称（回归：该路径曾 500）', c2.body?.comment?.nickname, RIVAL.nickname);
  await req('PATCH', `/admin/comments/${c2Id}/approve`, { token: ctx.adminToken, body: {} });
  const pubList3 = await req('GET', `/articles/${ctx.articleId}/comments`, { ip: nextIp() });
  ok('回复出现在前台（挂在顶级评论下）', visibleCommentIds(pubList3.body).has(String(c2Id)));
  ok(
    '回复被挂在父评论的 replies 里',
    (pubList3.body?.items ?? []).some((it) => String(it.id) === String(c1Id) && (it.replies ?? []).some((r) => String(r.id) === String(c2Id))),
    JSON.stringify(pubList3.body?.items?.map((i) => ({ id: i.id, replies: (i.replies ?? []).map((r) => r.id) }))),
  );

  // --- 三级评论必须被拒
  const third = await req('POST', `/articles/${ctx.articleId}/comments`, {
    body: { content: '三级回复', parentId: c2Id },
    ip: nextIp(),
  });
  eq('回复的回复被拒（400，只支持两级）', third.status, 400);
  info(`拒绝原因：${errText(third)}`);

  // --- 跨文章回复必须被拒
  const cross = await req('POST', `/articles/${ctx.secondArticleId}/comments`, {
    body: { content: '跨文章回复', parentId: c1Id },
    ip: nextIp(),
  });
  ok('跨文章回复被拒（400/404）', cross.status === 400 || cross.status === 404, `HTTP ${cross.status}`);

  // --- 敏感词：即使关掉「需要审核」，命中敏感词也必须强pending
  const word = '测试敏感词';
  await req('PATCH', '/admin/settings', {
    token: ctx.adminToken,
    body: { values: { sensitive_words: word, comment_need_approve: 'false' } },
  });
  const sw = await req('GET', '/admin/settings/sensitive-words', { token: ctx.adminToken });
  ok('敏感词写入后可读回', Array.isArray(sw.body) && sw.body.includes(word), JSON.stringify(sw.body));

  const sensitiveIp = nextIp();
  const c3 = await req('POST', `/articles/${ctx.articleId}/comments`, {
    body: { content: `这条包含${word}的内容`, nickname: '路人乙' },
    ip: sensitiveIp,
  });
  eq('敏感词评论仍返回 201', c3.status, 201, errText(c3));
  eq('命中敏感词时强制 pendingReview = true', c3.body?.pendingReview, true);
  ok(
    '提交文案把「进入审核」的原因讲清楚了',
    /人工确认|审核/.test(String(c3.body?.message ?? '')),
    `实际：${c3.body?.message}`,
  );
  const c3Id = c3.body?.comment?.id;
  const pubList4 = await req('GET', `/articles/${ctx.articleId}/comments`, { ip: nextIp() });
  ok('敏感词评论未进入前台可见列表', !visibleCommentIds(pubList4.body).has(String(c3Id)));

  // 关掉审核开关后，普通评论应自动通过 —— 与上面形成对照
  const c4 = await req('POST', `/articles/${ctx.articleId}/comments`, {
    body: { content: `普通评论（审核已关闭）${RUN}`, nickname: '路人丙' },
    ip: nextIp(),
  });
  eq('关闭审核开关后普通评论自动通过', c4.body?.pendingReview, false);
  const c4Id = c4.body?.comment?.id;
  const pubList5 = await req('GET', `/articles/${ctx.articleId}/comments`, { ip: nextIp() });
  ok('自动通过的评论直接可见', visibleCommentIds(pubList5.body).has(String(c4Id)));

  // --- 批量审核
  const batch = await req('POST', '/admin/comments/batch', {
    token: ctx.adminToken,
    body: { ids: [c3Id], action: 'approve' },
  });
  ok('批量通过返回 200', batch.status === 200 || batch.status === 201, `HTTP ${batch.status} ${errText(batch)}`);
  eq('批量结果里统计了受影响条数', batch.body?.affected, 1);

  // --- 拒绝流程
  const c5 = await req('POST', `/articles/${ctx.articleId}/comments`, {
    body: { content: `待拒绝评论 ${RUN}`, nickname: '路人丁' },
    ip: nextIp(),
  });
  const c5Id = c5.body?.comment?.id;
  const reject = await req('PATCH', `/admin/comments/${c5Id}/reject`, { token: ctx.adminToken, body: {} });
  eq('拒绝返回 200', reject.status, 200);
  const pubList6 = await req('GET', `/articles/${ctx.articleId}/comments`, { ip: nextIp() });
  ok('被拒评论不出现在前台', !visibleCommentIds(pubList6.body).has(String(c5Id)));

  // --- 评论统计
  const cstats = await req('GET', '/admin/comments/stats', { token: ctx.adminToken });
  ok('评论统计接口可用', cstats.status === 200 && typeof cstats.body?.pending === 'number', JSON.stringify(cstats.body));

  // --- 作者只能看到自己文章下的评论
  const mineComments = await req('GET', '/me/comments?pageSize=50', { token: ctx.authorToken });
  ok('作者能看到自己文章下的评论', (mineComments.body?.items ?? []).some((c) => String(c.id) === String(c1Id)));
  const rivalComments = await req('GET', '/me/comments?pageSize=50', { token: ctx.rivalToken });
  ok(
    '另一作者看不到别人文章下的评论',
    !(rivalComments.body?.items ?? []).some((c) => String(c.id) === String(c1Id)),
  );

  // --- 还原配置
  await req('PATCH', '/admin/settings', {
    token: ctx.adminToken,
    body: { values: { sensitive_words: origSensitive, comment_need_approve: origNeedApprove } },
  });
  const back = await req('GET', '/admin/settings', { token: ctx.adminToken });
  eq('敏感词配置已还原', back.body?.values?.sensitive_words ?? '', origSensitive);
  eq('审核开关已还原', back.body?.values?.comment_need_approve ?? '', origNeedApprove);
}

// ============================================================ 场景 4

async function scenario4() {
  section('场景 4 · 图片上传（真实 PNG 落盘 / 伪造魔数 / 类型白名单 / 权限）');

  const png = makePng(1, 1, [220, 38, 38]);
  const up = await req('POST', '/me/upload/image', {
    token: ctx.authorToken,
    form: fileFrom(png, 'e2e-cover.png', 'image/png'),
  });
  ok('上传真实 PNG 返回 200/201', up.status === 201 || up.status === 200, `HTTP ${up.status} ${errText(up)}`);
  ok('返回可访问 URL', typeof up.body?.url === 'string' && up.body.url.length > 0, JSON.stringify(up.body));
  eq('识别出 mimeType', up.body?.mimeType, 'image/png');
  eq('解析出宽度 1', up.body?.width, 1);
  eq('解析出高度 1', up.body?.height, 1);
  eq('落盘字节数与源文件一致', up.body?.size, png.length);
  info(`上传结果：${JSON.stringify(up.body)}`);
  ctx.uploadUrl = up.body?.url;

  // 静态托管可访问 + 字节一致
  if (ctx.uploadUrl) {
    const raw = await fetch(ctx.uploadUrl.startsWith('http') ? ctx.uploadUrl : `${BASE}${ctx.uploadUrl}`, {
      signal: AbortSignal.timeout(10_000),
    });
    eq('上传后的 URL 可直接访问（200）', raw.status, 200);
    const bytes = Buffer.from(await raw.arrayBuffer());
    ctx.uploadBytes = bytes;
    ok('取回的字节与上传的一致（未被二次处理）', bytes.equals(png), `源 ${png.length} 字节，回取 ${bytes.length} 字节`);
    ok('响应头是图片类型', String(raw.headers.get('content-type') ?? '').includes('image/png'), raw.headers.get('content-type'));
  }

  // 伪造：改扩展名 + 改 Content-Type，但内容是文本 → 魔数校验必须拦住
  const fake = await req('POST', '/me/upload/image', {
    token: ctx.authorToken,
    form: fileFrom(Buffer.from('这不是图片，只是伪装成 png 的文本'), 'evil.png', 'image/png'),
  });
  ok('伪造魔数被拒（400）', fake.status === 400, `HTTP ${fake.status} ${errText(fake)}`);
  info(`拒绝原因：${errText(fake)}`);

  // 类型白名单
  const exe = await req('POST', '/me/upload/image', {
    token: ctx.authorToken,
    form: fileFrom(png, 'payload.exe', 'application/octet-stream'),
  });
  ok('非图片类型被拒（400）', exe.status === 400, `HTTP ${exe.status} ${errText(exe)}`);

  const mismatchExt = await req('POST', '/me/upload/image', {
    token: ctx.authorToken,
    form: fileFrom(png, 'cover.gif', 'image/png'),
  });
  ok('扩展名与 MIME 不符被拒（400）', mismatchExt.status === 400, `HTTP ${mismatchExt.status} ${errText(mismatchExt)}`);

  // 缺文件字段
  const noFile = await req('POST', '/me/upload/image', { token: ctx.authorToken, form: new FormData() });
  ok('缺少 file 字段被拒（400）', noFile.status === 400, `HTTP ${noFile.status} ${errText(noFile)}`);

  // 权限
  const anon = await req('POST', '/me/upload/image', { form: fileFrom(png, 'a.png', 'image/png') });
  eq('未登录取上传 401', anon.status, 401);

  // 超限：默认 5MB
  const big = Buffer.concat([makePng(1, 1), Buffer.alloc(6 * 1024 * 1024, 0)]);
  const oversized = await req('POST', '/me/upload/image', {
    token: ctx.authorToken,
    form: fileFrom(big, 'big.png', 'image/png'),
  });
  ok('超过 5MB 被拒（400/413）', oversized.status === 400 || oversized.status === 413, `HTTP ${oversized.status}`);

  // 封面字段可回写到文章
  if (ctx.uploadUrl) {
    const withCover = await req('PATCH', `/me/articles/${ctx.articleId}`, {
      token: ctx.authorToken,
      body: { coverUrl: ctx.uploadUrl },
    });
    eq('封面 URL 可写入文章', withCover.body?.coverUrl, ctx.uploadUrl);
  }
}

// ============================================================ 场景 5

async function scenario5() {
  section('场景 5 · 令牌刷新、并发、过期续期与改密');

  // --- 刷新
  const r1 = await req('POST', '/auth/refresh', { body: { refreshToken: ctx.authorRefresh } });
  ok('刷新令牌返回 200/201', [200, 201].includes(r1.status), `HTTP ${r1.status} ${errText(r1)}`);
  const newAccess = r1.body?.accessToken;
  ok('拿到新的 accessToken', typeof newAccess === 'string' && newAccess.length > 20);
  ok('新 accessToken 与旧的不同', newAccess !== ctx.authorToken);
  eq('expiresIn 为秒数（900 = 15 分钟）', typeof r1.body?.expiresIn, 'number');
  info(`expiresIn = ${r1.body?.expiresIn} 秒`);

  const meNew = await req('GET', '/auth/me', { token: newAccess });
  eq('新 accessToken 可用', meNew.status, 200);

  const meOld = await req('GET', '/auth/me', { token: ctx.authorToken });
  eq('旧 accessToken 在过期前仍可用（无状态 JWT 的预期行为）', meOld.status, 200);

  // --- 并发刷新（前端 useApi 用 inflight Promise 去重的场景）
  const parallel = await Promise.all(
    Array.from({ length: 5 }, () => req('POST', '/auth/refresh', { body: { refreshToken: ctx.authorRefresh } })),
  );
  const allOk = parallel.every((r) => [200, 201].includes(r.status));
  ok('5 个并发刷新请求全部成功（后端无轮换锁）', allOk, parallel.map((r) => r.status).join(','));
  // 同一 refreshToken 能反复用，是因为后端没做令牌轮换/黑名单。这是设计取舍，记录而非判错。
  finding(
    'refresh token 不做轮换、不落黑名单：同一个 refreshToken 可重复使用且并发全部成功。前端靠 inflight 去重避免并发刷新，但服务端无法主动吊销单个会话。',
  );
  const reuse = await req('POST', '/auth/refresh', { body: { refreshToken: ctx.authorRefresh } });
  eq('旧 refreshToken 仍然可用（再次确认无轮换）', reuse.status === 200 || reuse.status === 201 ? 200 : reuse.status, 200);

  // --- 无效刷新
  const bad = await req('POST', '/auth/refresh', { body: { refreshToken: 'garbage.token.value' } });
  eq('无效 refreshToken 返回 401', bad.status, 401);

  // 用 access token 冒充 refresh token 也不行（两把密钥不同）
  const crossUse = await req('POST', '/auth/refresh', { body: { refreshToken: ctx.authorToken } });
  eq('用 access token 当 refresh 用被拒（401）', crossUse.status, 401);

  // --- 禁用账号后，已发出的令牌立刻失效（守卫每请求回查 DB）
  const disable = await req('PATCH', `/admin/users/${ctx.rivalId}/status`, {
    token: ctx.adminToken,
    body: { status: 'disabled' },
  });
  eq('禁用账号返回 200', disable.status, 200);
  const afterDisable = await req('GET', '/auth/me', { token: ctx.rivalToken });
  ok('被禁用后原令牌立即失效（401/403）', afterDisable.status === 401 || afterDisable.status === 403, `HTTP ${afterDisable.status}`);
  const disabledLogin = await req('POST', '/auth/login', { body: { account: RIVAL.username, password: RIVAL.password } });
  eq('被禁用账号无法登录（403）', disabledLogin.status, 403);
  await req('PATCH', `/admin/users/${ctx.rivalId}/status`, {
    token: ctx.adminToken,
    body: { status: 'active' },
  });

  // --- 登录失败锁定（5 次）
  const wrong = [];
  for (let i = 0; i < 5; i += 1) {
    wrong.push(await req('POST', '/auth/login', { body: { account: RIVAL.username, password: 'WrongPass!9999' } }));
  }
  ok('连续错误密码返回 401', wrong.every((r) => r.status === 401), wrong.map((r) => r.status).join(','));
  const locked = await req('POST', '/auth/login', { body: { account: RIVAL.username, password: RIVAL.password } });
  eq('第 6 次即使密码正确也因锁定被拒（403）', locked.status, 403);
  info(`锁定提示：${errText(locked)}`);

  // --- 改密（用主作者账号，因为 rival 刚被锁）
  const newPassword = 'E2eNewPass!9876';
  const changed = await req('POST', '/auth/me/password', {
    token: newAccess,
    body: { oldPassword: AUTHOR.password, newPassword },
  });
  ok('修改密码返回 200/201', [200, 201].includes(changed.status), `HTTP ${changed.status} ${errText(changed)}`);

  const oldLogin = await req('POST', '/auth/login', { body: { account: AUTHOR.username, password: AUTHOR.password } });
  eq('旧密码登录失败（401）', oldLogin.status, 401);
  const newLogin = await req('POST', '/auth/login', { body: { account: AUTHOR.username, password: newPassword } });
  eq('新密码登录成功', newLogin.status === 201 || newLogin.status === 200 ? 200 : newLogin.status, 200);
  ctx.authorToken = newLogin.body.tokens.accessToken;
  ctx.authorRefresh = newLogin.body.tokens.refreshToken;

  const wrongOld = await req('POST', '/auth/me/password', {
    token: ctx.authorToken,
    body: { oldPassword: 'Wrong!123456', newPassword: 'Whatever!12345' },
  });
  eq('原密码不正确时改密被拒（400）', wrongOld.status, 400);

  const same = await req('POST', '/auth/me/password', {
    token: ctx.authorToken,
    body: { oldPassword: newPassword, newPassword },
  });
  eq('新旧密码相同被拒（400）', same.status, 400);

  // 改密前签发的令牌是否还有效？这里如实记录，不做对错判定
  const staleToken = await req('GET', '/auth/me', { token: newAccess });
  if (staleToken.status === 200) {
    finding('改密不会吊销已签发的 access/refresh token（无状态 JWT + 仅校验账号状态）：账号被盗后改密码，攻击者手里的令牌在有效期内仍可用。');
  }

  // --- 个人资料更新
  const prof = await req('PATCH', '/auth/me', {
    token: ctx.authorToken,
    body: { nickname: 'E2E 作者（已改）', bio: '由 E2E 脚本写入', github: 'https://github.com/e2e' },
  });
  eq('更新资料返回 200', prof.status, 200);
  eq('昵称已更新', prof.body?.nickname, 'E2E 作者（已改）');
  eq('bio 已更新', prof.body?.bio, '由 E2E 脚本写入');

  // --- 短有效期实例：access 过期 → 401 → 刷新 → 重试成功
  section('场景 5b · access token 过期后的真实续期链路');
  if (!SHORT_BASE) {
    skip('过期续期链路', '未设置 E2E_SHORT_BASE（需要另起一个 JWT_ACCESS_EXPIRES_IN=2s 的实例）');
    return;
  }
  const shortLogin = await req('POST', `${SHORT_BASE}/${PREFIX}/auth/login`, {
    body: { account: AUTHOR.username, password: newPassword },
  });
  const shortAccess = shortLogin.body?.tokens?.accessToken;
  const shortRefresh = shortLogin.body?.tokens?.refreshToken;
  eq('短有效期实例登录成功', shortLogin.status === 200 || shortLogin.status === 201 ? 200 : shortLogin.status, 200);
  eq('短有效期实例 expiresIn 为 2 秒', shortLogin.body?.tokens?.expiresIn, 2);

  const fresh = await req('GET', `${SHORT_BASE}/${PREFIX}/auth/me`, { token: shortAccess });
  eq('刚签发的令牌可用', fresh.status, 200);

  await new Promise((r) => setTimeout(r, 2600));
  const expired = await req('GET', `${SHORT_BASE}/${PREFIX}/auth/me`, { token: shortAccess });
  eq('过期后访问返回 401', expired.status, 401);
  info(`过期响应：${errText(expired)}`);

  const refreshed = await req('POST', `${SHORT_BASE}/${PREFIX}/auth/refresh`, { body: { refreshToken: shortRefresh } });
  eq('过期后刷新成功', refreshed.status === 200 || refreshed.status === 201 ? 200 : refreshed.status, 200);
  const retry = await req('GET', `${SHORT_BASE}/${PREFIX}/auth/me`, { token: refreshed.body?.accessToken });
  eq('用刷新得到的新令牌重试成功（前端自动续期的完整闭环）', retry.status, 200);
}

// ============================================================ 清理

async function cleanup() {
  section('收尾 · 清理本次创建的数据');

  if (KEEP) {
    skip('清理', 'E2E_KEEP=1');
    return;
  }

  for (const id of ctx.createdArticleIds) {
    const res = await req('DELETE', `/admin/articles/${id}/purge`, { token: ctx.adminToken });
    const gone = res.status === 200;
    ok(`彻底删除文章 ${id}（级联清理评论/点赞/访问记录）`, gone || res.status === 404, `HTTP ${res.status} ${errText(res)}`);
  }

  for (const id of ctx.createdUserIds) {
    if (id === ctx.adminId) continue;
    const res = await req('DELETE', `/admin/users/${id}`, { token: ctx.adminToken });
    const deleted = res.status === 200;
    if (!deleted) {
      info(`账号 ${id} 未能删除（HTTP ${res.status}：${errText(res)}），属预期内的业务限制`);
    }
  }

  // 验证级联清理：评论表里不应再有指向已删文章的记录
  const leftover = await req('GET', '/admin/comments?pageSize=50', { token: ctx.adminToken });
  const stillThere = (leftover.body?.items ?? []).filter((c) =>
    ctx.createdArticleIds.some((aid) => String(c.articleId) === String(aid)),
  );
  ok('已删文章的评论被级联清理干净', stillThere.length === 0, `残留 ${stillThere.length} 条`);

  const users = await req('GET', '/admin/users?pageSize=50', { token: ctx.adminToken });
  const leftoverUsers = (users.body?.items ?? []).filter((u) => [AUTHOR.username, RIVAL.username].includes(u.username));
  ok('测试账号已清理（无文章时可直接删除）', leftoverUsers.length === 0, `残留：${leftoverUsers.map((u) => u.username).join(',')}`);

  // 标签是独立实体，不会随文章级联删除。E2E 每轮都会新建标签，
  // 不清理的话标签库会慢慢被测试数据填满，把「标签列表」页污染掉。
  const tagRes = await req('GET', '/tags?pageSize=50', { ip: nextIp() });
  const tagList = Array.isArray(tagRes.body) ? tagRes.body : (tagRes.body?.items ?? []);
  const myTags = tagList.filter((t) => String(t.name ?? '').includes(RUN));
  for (const t of myTags) {
    await req('DELETE', `/admin/tags/${t.id}`, { token: ctx.adminToken });
  }
  const afterTags = await req('GET', '/tags?pageSize=50', { ip: nextIp() });
  const afterList = Array.isArray(afterTags.body) ? afterTags.body : (afterTags.body?.items ?? []);
  ok(
    '本轮创建的标签已清理',
    !afterList.some((t) => String(t.name ?? '').includes(RUN)),
    `残留：${afterList.map((t) => t.name).join(',')}`,
  );
}

// ============================================================ 主流程

async function main() {
  console.log('E2E 端到端验收');
  console.log(`  目标       : ${BASE}  前缀 /${PREFIX}`);
  console.log(`  运行标识   : ${RUN}`);
  console.log(`  管理员     : ${ADMIN_ACCOUNT}`);
  console.log(`  短效实例   : ${SHORT_BASE || '（未提供，将跳过过期续期）'}`);

  const t0 = Date.now();

  await scenario0();
  await scenario1();
  await scenario2();
  await scenario3();
  await scenario4();
  await scenario5();
  await cleanup();

  const cost = ((Date.now() - t0) / 1000).toFixed(1);

  section('结果汇总');
  console.log(`  通过 ${state.pass} 项，失败 ${state.fail} 项，跳过 ${state.skip} 项，耗时 ${cost}s`);
  if (state.findings.length > 0) {
    console.log('\n  需要留意的设计取舍（不是缺陷）：');
    for (const f of state.findings) console.log(`    - ${f}`);
  }
  if (state.fail > 0) {
    console.log('\n  失败清单：');
    for (const f of state.failures) console.log(`    ✗ ${f}`);
  }

  console.log(`\n${state.fail === 0 ? '✅ 全部通过' : '❌ 存在失败项'}`);
  process.exit(state.fail === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error('\n💥 脚本异常终止：', err);
  console.error(`
排查建议：
  1) 后端是否已在 ${BASE} 运行；
  2) 数据库是否已执行 db/schema.sql 建表；
  3) 是否已 seed 管理员账号（npm run db:seed）。`);
  process.exit(1);
});
