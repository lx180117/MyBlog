/**
 * 前端调用的接口路径 vs openapi.json 的一致性检查。
 *
 * 为什么需要它：`api.get('/me/articles')` 里的路径是**普通字符串**，
 * TypeScript 管不到 —— 写成 `/me/article`（少个 s）、或者后端把路径改成
 * `/admin/comments/{id}/approve` 而前端还在用 `/approve/{id}`，
 * 类型检查、构建、甚至页面首屏都是好的，只有点下去才会 404。
 *
 * 这个脚本把「方法 + 路径」两边归一化后做集合比对：
 *   - 前端调用了 openapi 里没有的接口 → 报错退出（构建前的守门员）
 *   - openapi 有但前端没用到的接口 → 只提示（后台不一定用得上全部接口）
 *   - 路径里带变量的（`${row.id}` 或 `props.endpoint`）→ 单独列出，人工确认
 *
 * 归一化规则：`{id}` 与 `${row.id}` 都化成 `:param`，再剥掉 /api/v1 前缀
 * （前端的 baseURL 已经带了前缀）。含变量的段按通配匹配，
 * 但段数必须一致 —— 这样「多一段/少一段」仍然会被抓出来。
 *
 * 覆盖不到的三种情况（都在报告里单独列出，不做静默忽略）：
 *   ① 路径整个来自变量，如 `api.get(props.endpoint)`
 *   ② 用原生 `$fetch` 直接请求的接口（useApi 里的 /auth/refresh 就是这样，
 *      它绕过了封装以避免 401 刷新递归）
 *   ③ 后端输出的 XML / 文本端点（/rss.xml、/sitemap.xml、/robots.txt）
 *      —— 它们由页脚和 RssLink 直接以链接形式引用，不走 api 封装
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const clientRoot = resolve(here, '..');
const appDir = join(clientRoot, 'app');
const specPath = resolve(clientRoot, '..', 'server', 'openapi.json');

const METHODS = { get: 'GET', post: 'POST', patch: 'PATCH', del: 'DELETE' };

/** `/api/v1/articles/{slug}` → `/articles/:param` */
function normalizeSpecPath(route) {
  return route
    .replace(/^\/api\/v1/, '')
    .replace(/\{[^}]+\}/g, ':param')
    .replace(/\/$/, '');
}

/** 前端源码里的路径字面量：`/me/articles/${row.id}/publish` → `/me/articles/:param/publish` */
function normalizeCallPath(raw) {
  return raw.replace(/\$\{[^}]*\}/g, ':param').replace(/\/$/, '');
}

/* ---------------------------------------------------------------- 读契约 */

const spec = JSON.parse(readFileSync(specPath, 'utf8'));
const known = new Set();
for (const [route, ops] of Object.entries(spec.paths)) {
  for (const method of Object.keys(ops)) {
    const upper = method.toUpperCase();
    if (!Object.values(METHODS).includes(upper)) continue;
    known.add(`${upper} ${normalizeSpecPath(route)}`);
  }
}

/**
 * 两边都归一化成「方法 + 段数组」后再比。
 * 含变量的段视作通配，但**段数必须相等** ——
 * 少了 `/approve` 这一段（或者多了）就会被判成不匹配，这正是要抓的错误。
 */
function split(key) {
  const [method, route] = key.split(' ');
  return { method, segments: route.split('/') };
}

/** candidate 能否覆盖 specKey */
function covers(candidateKey, specKey) {
  const a = split(candidateKey);
  const b = split(specKey);
  if (a.method !== b.method) return false;
  if (a.segments.length !== b.segments.length) return false;
  return a.segments.every((segment, index) => {
    const other = b.segments[index];
    return segment === other || segment === ':param' || other === ':param';
  });
}

/* ---------------------------------------------------------------- 扫源码 */

/**
 * 匹配三种调用形态：
 *   api.get('/articles')
 *   api.patch(`/me/articles/${row.id}/publish`, {})
 *   api.get<Paginated<X>>(props.endpoint, ...)   ← 第一参是变量
 *
 * 泛型里用 `[^()]*?` 而不是 `[^;()]*?`：TS 的对象类型参数经常写成分号分隔
 * （`api.del<{ ok: boolean; msg: string }>(...)`），把分号排除掉会让这类调用
 * 完全扫不到 —— 而它们恰恰是最容易写错路径的地方。
 */
const CALL_RE =
  /api\.(get|post|patch|del)\s*(?:<[^()]*?>)?\s*\(\s*(?:([`'"])([^`'"]+)\2|([A-Za-z_$][\w$.]*))/g;

const files = [];
(function walk(dir) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full);
    else if (/\.(ts|vue)$/.test(entry)) files.push(full);
  }
})(appDir);

const used = new Map(); // "GET /path" -> 出现的文件
const withVariables = new Map(); // "GET /x/:param/..." -> 文件（含变量段，已宽松匹配）
const fromVariables = []; // 路径整个来自变量，静态不可校验

for (const file of files) {
  const source = readFileSync(file, 'utf8');
  const relative = file.slice(clientRoot.length + 1).replace(/\\/g, '/');

  for (const match of source.matchAll(CALL_RE)) {
    const method = METHODS[match[1]];
    const literal = match[3];
    const identifier = match[4];

    // 第一参不是字面量：路径来自变量（如 props.endpoint），静态检查覆盖不到
    if (!literal) {
      fromVariables.push(`${relative} → ${method} ${identifier}`);
      continue;
    }

    if (!literal.startsWith('/')) {
      fromVariables.push(`${relative} → ${method} ${literal}`);
      continue;
    }

    const hasVariableSegment = literal.includes('${');
    const key = `${method} ${normalizeCallPath(literal)}`;
    const bucket = hasVariableSegment ? withVariables : used;
    if (!bucket.has(key)) bucket.set(key, []);
    bucket.get(key).push(relative);
  }
}

/* ---------------------------------------------------------------- 比对 */

const candidates = [...used.keys(), ...withVariables.keys()];
const knownList = [...known];

const missing = [...used, ...withVariables].filter(
  ([key]) => !knownList.some((specKey) => covers(key, specKey)),
);

const unused = knownList.filter(
  (specKey) => !candidates.some((candidateKey) => covers(candidateKey, specKey)),
);

console.log(`契约：${known.size} 个接口（来源 server/openapi.json）`);
console.log(
  `前端：字面量路径 ${used.size} 个 + 含变量段 ${withVariables.size} 个 + 全变量 ${fromVariables.length} 处\n`,
);

if (withVariables.size) {
  console.log('— 含变量的路径（已按段数 + 通配逐段校验）：');
  for (const [key, where] of withVariables) console.log(`   ${key}   ← ${where[0]}`);
  console.log('');
}

if (fromVariables.length) {
  console.log('— 路径来自变量的调用（本脚本无法校验，需人工确认）：');
  for (const item of fromVariables) console.log(`   ${item}`);
  console.log('');
}

if (unused.length) {
  console.log(`— openapi 有但前端未使用（${unused.length} 个，通常正常）：`);
  for (const key of unused) console.log(`   ${key}`);
  console.log('');
}

if (missing.length) {
  console.error(`✗ 前端调用了 openapi 中不存在的接口（${missing.length} 个）：`);
  for (const [key, where] of missing) {
    console.error(`   ${key}`);
    for (const file of where) console.error(`      ← ${file}`);
  }
  process.exit(1);
}

console.log('✓ 前端所有接口调用都能在 openapi.json 里找到对应项');
