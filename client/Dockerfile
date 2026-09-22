# =============================================================================
#  前台（Nuxt 4 SSR）多阶段构建
#
#  和 server 的镜像思路一致：builder 装全量依赖并产出 `.output`，
#  runner 只拷 `.output` 就跑 —— Nitro 的输出是自包含的（依赖已打包进产物），
#  所以运行阶段**不需要 node_modules**，镜像能压到 ~200MB。
# =============================================================================

# ---------- Stage 1: 构建 ----------
FROM node:24-alpine AS builder

WORKDIR /app

# 国内网络直连官方源会长时间无响应，镜像源写在 .npmrc 里，必须先拷进来
COPY package*.json .npmrc* ./

# --ignore-scripts 跳过 postinstall 的 `nuxt prepare`：
# 此时 nuxt.config.ts 与 app/ 都还没拷进来，prepare 会失败。
# 真正的 prepare 由后面的 `nuxt build` 内部触发，不影响产物。
RUN npm ci --no-audit --no-fund --ignore-scripts

COPY . .

RUN npm run build

# ---------- Stage 2: 运行 ----------
FROM node:24-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
# 容器里必须监听 0.0.0.0，否则只有容器内部能连到（宿主机/nginx 都进不来）
ENV HOST=0.0.0.0
ENV NITRO_HOST=0.0.0.0
ENV PORT=3001
ENV NITRO_PORT=3001

# Nitro 产物自带运行时依赖
COPY --from=builder /app/.output ./.output

# 不用 root 跑服务
USER node

EXPOSE 3001

# 拿首页做健康检查：它同时验证了「Node 在听」和「SSR 渲染没崩」
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3001/').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", ".output/server/index.mjs"]
