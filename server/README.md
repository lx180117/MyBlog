# 博客平台 · 后端服务

> **Step 5 交付物** ｜ 技术栈：Node.js 24 LTS + NestJS 11 + Prisma 6 + PostgreSQL 18
> 对应文档：`../docs/01-需求规格说明.md`（需求 v2）、`../docs/02-技术选型.md`、`../db/schema.sql`（数据库定义）

---

## 一、快速开始（本地开发）

```bash
# 1. 安装依赖
npm install

# 2. 准备配置
cp .env.example .env
#    然后用 `openssl rand -hex 32` 生成两个不同的密钥填进 JWT_ACCESS_SECRET / JWT_REFRESH_SECRET

# 3. 建库建表（用 DDL 脚本，不用 prisma migrate，原因见下文「设计取舍」第 1 条）
createdb blog
psql -U postgres -d blog -f ../db/schema.sql

# 4. 生成 Prisma Client
npx prisma generate

# 5. 初始化管理员与分类
npm run db:seed
#    默认账号 admin / Admin@123456，登录后请立即修改

# 6. 启动
npm run start:dev
```

启动后：

| 地址 | 说明 |
| --- | --- |
| `http://localhost:3000/api/v1/docs` | Swagger UI（交互式接口文档） |
| `http://localhost:3000/api/v1/openapi.json` | 原始 OpenAPI JSON（前端可直接生成 SDK） |
| `http://localhost:3000/health` | 健康检查（含数据库连通性） |
| `http://localhost:3000/sitemap.xml` | 站点地图 |
| `http://localhost:3000/rss.xml` | RSS 订阅源 |

## 二、常用命令

```bash
npm run start:dev        # 开发模式（热重载）
npm run build            # 编译到 dist/
npm run start:prod       # 生产模式启动
npm run lint             # 仅做类型检查（tsc --noEmit），不开 eslint 也能拦住大部分低级错误
npm run prisma:generate  # 改完 schema.prisma 后重新生成 Client
npm run db:seed          # 初始化/补齐基础数据（幂等，可重复执行）
npm run openapi:export   # 导出静态 openapi.json —— Step 6 生成前端的输入文件
```

## 三、生产部署（Docker Compose 单机）

> **完整步骤见 `docs/07-部署指南.md`**（含 HTTPS、备份、更新、排错对照表）。
> 下面是速查版。

编排包含 4 个服务：`postgres` / `api` / `client`（前端 Nuxt SSR）/ `nginx`。

```bash
cp .env.example .env       # 至少要改 SITE_URL、两个 JWT 密钥、数据库密码
docker compose up -d --build

# 首次部署：建表（等 postgres 变成 healthy 再执行）
docker compose exec -T postgres psql -U blog -d blog < ../db/schema.sql

# 初始化管理员与基础分类（dist/seed.js 由 npm run build 一并产出，生产不需要 ts-node）
docker compose exec api node dist/seed.js

# 查看日志
docker compose logs -f api
```

要求：**2 核 2G / 40GB 起步**（常驻内存约 800MB～1.2GB），Docker 24+。

### 部署时最容易踩的两个点

1. **`SITE_URL` 是必填的**（写在 `.env` 里，是站点对外地址，如 `https://blog.example.com`）。
   编排用它推导 `SITE_BASE_URL` / `UPLOAD_BASE_URL` / `CORS_ORIGINS` 与前端的 `NUXT_PUBLIC_SITE_URL`，
   保证只改一处。**没设的话 compose 会直接报错退出** —— 故意的：漏设会让 sitemap、canonical、
   图片链接全部指向 localhost，而站点表面上还打得开，很难发现。

2. **浏览器与 SSR 的 API 地址是分开配的**。浏览器走同源 `/api/v1`（Nginx 转发，免 CORS、
   不写死域名）；SSR 在 Node 里解析不了相对路径，必须用绝对地址 `http://api:3000/api/v1`。
   对应变量 `NUXT_PUBLIC_API_BASE` 与 `NUXT_API_BASE_SERVER`，编排里已配好。

HTTPS：证书放 `./certs`，打开 `docker-compose.yml` 里 443 的注释并改 `nginx.conf`
（80 跳 443 + 新增 443 server 块）。注意两个 server 块都要保留那套 `location`，
否则 HTTPS 下 `/api` 会 404 —— 细节见部署指南第八节。

---

## 四、目录结构

```
src/
├── main.ts                     # 入口：全局配置、Swagger UI、启动
├── swagger.ts                  # OpenAPI 文档配置（被 main 与导出脚本共用）
├── app.module.ts               # 根模块；全局 Guard / Filter / Interceptor 在此注册
├── health.controller.ts        # 健康检查
├── prisma/                     # PrismaService（全局模块）
├── common/
│   ├── decorators/             # @Public @Roles @RequireActive @CurrentUser @ClientIp
│   ├── guards/                 # JwtAuthGuard（含公开接口的可选认证）、RolesGuard
│   ├── interceptors/           # SerializeInterceptor（BigInt → string）
│   ├── filters/                # AllExceptionsFilter（统一错误结构 + Prisma 错误映射）
│   ├── dto/                    # 分页 DTO、通用响应 DTO、分页 Swagger 装饰器
│   └── utils/                  # slug、Markdown 渲染与净化、摘要与 TOC 提取
└── modules/
    ├── auth/                   # 注册、登录、令牌刷新、资料、密码哈希
    ├── users/                  # 作者主页、用户审核与角色管理
    ├── articles/               # 文章 CRUD、发布流转、搜索、归档、点赞、阅读量
    ├── taxonomy/               # 分类与标签（含标签合并）
    ├── comments/               # 两级评论、审核、反垃圾
    ├── settings/               # 站点配置（KV + 30 秒缓存）
    ├── upload/                 # 图片上传（三道校验）
    ├── stats/                  # 仪表盘与站点概览
    └── feed/                   # sitemap.xml / robots.txt / rss.xml
```

## 五、关键设计取舍

这一节记录「为什么这么做」，因为这些决定不写下来，后面维护的人很容易好心改错。

### 1. 数据库结构以 `db/schema.sql` 为准，不用 `prisma migrate`

DDL 里有 **函数索引、部分索引、触发器、视图**（例如中文搜索依赖 `pg_trgm` 的 GIN 索引、
两级评论依赖触发器强制约束），这些都是 Prisma Schema 表达不了的。如果用 `prisma migrate`
管理表结构，它会在第一次 migrate 时把这些对象当成「漂移」而尝试删掉。

所以：`schema.prisma` 只用来**生成类型安全的 Client**，表结构的真实来源永远是 `schema.sql`。
部署顺序固定为 `psql -f db/schema.sql` → `prisma generate`。

**`prisma db push` 同样不能用**，这一条是实测出来的，不是推测。2026-09-18 在一个临时库
（先执行 `schema.sql`，再跑 `prisma db push --accept-data-loss`）对比对象数量：

| 对象 | push 前 | push 后 | 结果 |
| --- | --- | --- | --- |
| 表 | 9 | 9 | 不变 |
| 视图 | 1 | 1 | 保留 |
| 触发器 | 13 | 13 | 保留 |
| 索引 | 39 | **36** | 丢 3 个 |

丢掉的 23 个手写索引里，20 个被 Prisma 用自己命名的等价索引重建，剩下 3 个彻底消失
且不会自动补回 —— 恰好是**全部搜索索引**：

- `idx_articles_search_vector`（tsvector GIN，英文全文检索）
- `idx_articles_title_trgm`（pg_trgm GIN，中文标题模糊搜索）
- `idx_articles_summary_trgm`（pg_trgm GIN，中文摘要模糊搜索）

也就是说，在已有库上跑一次 `npm run prisma:push`，中文搜索就退化成全表扫描，而且过程里
**没有任何报错或警告**。`package.json` 保留该脚本只是为了让 schema 变更时能对着空库推一遍
做本地试玩，生产库上不要执行。

### 2. 主键 BIGINT 全程用字符串传输

`JSON.stringify(BigInt)` 会直接抛 `TypeError`。更隐蔽的是：如果为了绕开这个错误把 id 转成
`Number`，超过 2^53 之后会**静默丢精度** —— 表现是「取详情时偶尔拿到别人的数据」。

`SerializeInterceptor` 统一把 BigInt 序列化为字符串，接口出入参也一律用字符串，前后端都不会踩这个坑。

### 3. 密码用 Node 内置 scrypt，而不是需求里写的 argon2

`argon2` 是原生模块，安装时要编译或下载预编译二进制，在 Windows / 内网无外网的生产机上
经常失败或装出 ABI 不匹配的版本。密码哈希是登录链路第一环，它跑不起来就全站登不进去。

改用内置 `crypto.scrypt`（OWASP 推荐算法之一，memory-hard，无 bcrypt 的 72 字节截断问题），
参数 N=32768 / r=8 / p=1。存储格式带算法前缀 `scrypt$N$r$p$salt$hash`，
**日后要换回 argon2id 只需在 `PasswordService.verify` 里按前缀分派**，老用户下次登录时
逐步重哈希即可，不需要强制所有人改密码。

### 4. JWT 校验时回查数据库

纯 JWT 是无状态的，代价是：管理员禁用某人之后，只要他的 token 没到期就**依然能发文**。
本项目规模小（≤20 作者、1000 PV/日），一次主键查询完全可以接受，换来「禁用与降级立即生效」。
日后 QPS 上涨，正确做法是给这一步加 Redis 缓存，而不是删掉这次查询。

### 5. 中文搜索走 `pg_trgm`，不是 `tsvector`

PostgreSQL 的 `tsvector` 用 `simple` 配置**不做中文分词**，整句中文会变成一个 token，
搜「数据库」匹配不到「数据库设计」。`pg_jieba` / `zhparser` 要额外编译安装。

因此：标题与摘要用 `ILIKE` + `pg_trgm` 三元组索引（对中文有效，且是 PG 自带扩展），
正文用 `tsvector`（对英文有效），两者取并集后按 `ts_rank` 排序。
这是整个项目唯一必须写原生 SQL 的地方，参数全部走 `$queryRaw` 占位符插值，无注入风险。

### 6. 定时发布不需要定时任务

前台查询固定带 `published_at <= now()` 条件，所以「设为已发布 + 未来时间」的文章
在前台天然不可见，到点自动出现。少一个定时任务就少一处「任务挂了但没人发现」的故障点。

代价是后台列表里这类文章状态显示为 `published`，需要看 `publishedAt` 才知道是待发布 ——
`ArticleStatsDto` 里的 `scheduled` 字段就是为此准备的。

### 7. 冗余计数的维护分工是写死的

| 字段 | 维护方 | 原因 |
| --- | --- | --- |
| `comment_count` | 数据库触发器 | 状态流转复杂（待审/通过/拒绝/删除），触发器最可靠 |
| `like_count` | 数据库触发器 | 由去重表的增删驱动 |
| `view_count` | 应用层 `+1` | 读写太频繁，挂触发器不划算 |

**分工不写清楚，将来一定会重复计数** —— 所以 `ArticlesService` 与 `CommentsService` 里
都没有手写 `comment_count` 的赋值。

### 8. `@RequireActive()` 独立于 `@Roles()`

注册后账号是 `pending`，但角色已经是 `author`。如果只校验角色，待审核用户能立刻发文。
所以写操作额外要求 `status = active`；而「看自己的空文章列表」这类只读操作对待审核用户放行。

### 9. 上传做了文件头魔数校验

扩展名与 Content-Type 都能被伪造。`UploadService` 会读文件前 16 字节比对真实魔数，
不一致直接拒绝并记日志。上传目录若被错误地配成可执行，改个扩展名的恶意文件就是存储型 XSS。

### 10. 路由前缀按角色分区，避免参数路由抢匹配

`/articles/:slug` 与 `/articles/mine` 这类冲突，靠「把具体路径写在参数路由之前」能绕开，
但任何人在中间插一条路由就会静默失效（`mine` 被当成 slug，返回 404）。
所以管理接口改用**不同前缀**：作者是 `/me/articles`，管理员是 `/admin/articles`。

---

## 六、与需求文档的差异汇总

| 项 | 需求原文 | 实现 | 原因 |
| --- | --- | --- | --- |
| 密码哈希 | argon2 | scrypt（Node 内置） | 避免原生模块编译失败卡死登录链路；格式带前缀，可平滑迁移 |
| 定时发布 | 「到点自动转已发布」 | 查询条件 `published_at <= now()` | 语义等价但不需要定时任务 |
| 文章点赞 | 按 IP + 文章去重 | 新增 `article_likes` 表承载去重 | 只有 `like_count` 一个数字无法判断「某 IP 点过没」 |
| 邮件找回密码 | v1 不做 | 管理员后台重置 + 随机密码 | 与需求一致，额外做了「不能禁用最后一个管理员」等防呆 |

## 七、端到端验收（E2E）

`scripts/e2e.mjs` 是一份不依赖测试框架的验收脚本（只用全局 `fetch`），跑的是真实 HTTP
与真实数据库，覆盖 170 条断言：

| 场景 | 覆盖内容 |
| --- | --- |
| 0 · 环境自检 | `/health` 的数据库连通性、管理员登录 |
| 1 · 主链路 | 注册 → 重复注册/弱密码被拒 → pending 不可发文 → 管理员审核 → 发文 → 发布 → 前台可见 → 搜索/归档/作者页 → 阅读量同 IP 去重 |
| 1b · 权限边界 | 越权改/删他人文章、作者访问管理接口、伪造令牌、非法 ID |
| 2 · 文章状态机 | 撤回 / 定时发布（未来时间不可见、改到过去立即可见）/ 置顶 / 软删 / 恢复 / 彻底删除，以及点赞去重与计数触发器 |
| 3 · 评论 | 游客必填昵称、两级嵌套、三级被拒、跨文章回复被拒、审核通过/拒绝/批量、敏感词强制待审、同 IP 冷却 |
| 4 · 上传 | 真实 PNG 落盘且回取字节一致、伪造魔数被拒、扩展名与 MIME 不符被拒、超 5MB 被拒、权限 |
| 5 · 令牌 | 刷新、5 路并发刷新、无效/错用令牌、禁用账号即刻失效、登录失败锁定、改密、资料更新 |
| 5b · 过期续期 | 用 `JWT_ACCESS_EXPIRES_IN=2s` 的实例跑「过期 → 401 → 刷新 → 重试成功」闭环 |

```bash
# 启动数据库（本机没有 Docker 时用免安装二进制，见 db/local-pg.sh）
bash ../db/local-pg.sh start

# 主实例
npm run build && node dist/main.js

# 可选：另起一个 access token 2 秒过期的实例，用于过期续期链路
PORT=3002 JWT_ACCESS_EXPIRES_IN=2s node dist/main.js

# 跑验收
E2E_SHORT_BASE=http://127.0.0.1:3002 npm run test:e2e

# 想留现场排查，加上 E2E_KEEP=1 跳过收尾清理
```

两点设计上的注意：

- **每个请求换一个来源 IP**（走 `X-Forwarded-For`，服务端 `trust proxy` 已开）。因为限流守卫是
  全局的（120 次/分钟，登录 10 次/分钟），整个脚本近 200 个请求若都从 `127.0.0.1` 发出，
  会先撞上限流，失败原因就变成「脚本把自己限流了」而不是业务有问题。只有必须同源的用例
  （阅读量去重、点赞去重、评论冷却）才固定用同一个 IP。
- **脚本自主清理**：创建的账号、文章、标签、敏感词配置都会还原/删除，跑完数据库回到
  种子状态（`users=1 articles=0 comments=0 tags=0`），可反复执行。

## 八、下一步

导出 `openapi.json` 后交付给 **Step 6** 生成前端页面：

```bash
npm run openapi:export     # 产出 ./openapi.json
```

该文件已包含全部 60+ 个操作的请求/响应模型、枚举取值与字段说明，可直接作为
前端代码生成或 AI 生成页面的输入。
