# =============================================================================
#  多阶段构建
#  builder 阶段装全量依赖并编译；runtime 阶段只装生产依赖 + 编译产物，
#  typescript / @nestjs/cli / jest 这些开发期工具不进生产镜像。
#
#  体积（2026-09-20 在服务器上实测，别照抄网上的估值）：
#    镜像内容 759MB，其中 node_modules 341MB、npm 缓存 209MB、Prisma 缓存 35MB。
#    修掉下面那条 RUN 里的缓存清理后，能省掉约 245MB。
#    注意 `docker images` 报的 SIZE（1.08GB）比容器内 `du -sh /`（759MB）大，
#    两者口径不同：前者含基础镜像层与 attestation 清单，看体积构成要以容器内为准。
# =============================================================================

# ---------- Stage 1: 构建 ----------
FROM node:24-alpine AS builder

WORKDIR /app

# 先只复制 manifest：只要依赖没变，这一层就能命中缓存，
# 否则每次改一行业务代码都要重装一遍依赖
COPY package*.json ./
COPY prisma ./prisma

RUN npm ci --no-audit --no-fund

# Prisma Client 必须在编译前生成，否则 tsc 找不到 @prisma/client 的类型
RUN npx prisma generate

COPY tsconfig*.json nest-cli.json ./
COPY src ./src
COPY scripts ./scripts

# nest build 会把 src/seed.ts 一并编译成 dist/seed.js，
# 所以生产镜像里不需要 ts-node 也能跑初始化脚本
RUN npm run build

# ---------- Stage 2: 运行 ----------
FROM node:24-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production

# 只装生产依赖。
# `npx prisma generate` 会把 Prisma 引擎下到 ~/.cache，npm 自身则把包缓存留在
# ~/.npm/_cacache —— 这两个都是纯粹的构建残留，不清理就会**永久留在镜像层里**
# （实测 209MB + 35MB）。必须在同一条 RUN 里删，跨层删除是删不掉的。
COPY package*.json ./
COPY prisma ./prisma
RUN npm ci --omit=dev --no-audit --no-fund \
 && npx prisma generate \
 && rm -rf /root/.npm /root/.cache

COPY --from=builder /app/dist ./dist

# 订阅源死链自检脚本。部署指南让用户跑
#   docker compose exec api node scripts/check-feed-links.mjs
# 但 runner 阶段原先只拷了 dist，脚本不在镜像里 → 报 MODULE_NOT_FOUND。
# 它只用 Node 内置的 fetch，不需要任何依赖，拷进来即可。
# 只拷这一个文件：e2e.mjs 那类测试脚本不该进生产镜像。
COPY scripts/check-feed-links.mjs ./scripts/check-feed-links.mjs

# 上传目录必须先建好并交给非 root 用户 —— 具名卷第一次初始化时会**继承镜像里
# 该目录的属主**，否则容器里的 node 用户写不进去，图片上传会失败。
#
# 这里刻意不用 `chown -R node:node /app`：node_modules 有几十万个文件，
# 在虚拟机的 overlayfs 上递归改属主实测要 **334 秒**，占了整个镜像构建时间的一大半，
# 而且每次改代码触发重建都要重跑一遍。运行期真正需要写权限的只有 uploads，
# dist / node_modules / prisma 全是只读。
RUN mkdir -p /app/uploads && chown node:node /app/uploads

# 不用 root 跑服务：容器逃逸时的影响面小一个数量级
USER node

EXPOSE 3000

# 健康检查走 /health（它不带 API 版本前缀，见 main.ts 的 setGlobalPrefix exclude）
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "dist/main.js"]
