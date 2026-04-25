# ========================
# Base
# ========================
FROM node:20-alpine AS base
RUN corepack enable

# ========================
# Dependencies（利用缓存）
# ========================
FROM base AS deps
WORKDIR /app

# 根配置
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./

# 复制 web 与其 workspace 依赖的包声明，确保 pnpm 能解析本地 workspace 链接
COPY apps/web/package.json ./apps/web/
COPY packages/api-client/package.json ./packages/api-client/
COPY packages/types/package.json ./packages/types/
COPY packages/ui/package.json ./packages/ui/

# Hoisted node_modules so Next standalone output has real files (pnpm symlinks break in runner).
RUN printf '%s\n' 'node-linker=hoisted' > .npmrc

# 安装 web 依赖
RUN pnpm install --frozen-lockfile --filter @lyranote/web...

# ========================
# Builder（构建 Next.js）
# ========================
FROM base AS builder
WORKDIR /app

# pnpm --filter 需要 workspace 清单
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./

# 拷贝依赖
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/web/node_modules ./apps/web/node_modules

# 拷贝 web 与其 workspace 依赖源码，保证 node_modules 中的 workspace 链接有真实目标
COPY apps/web ./apps/web
COPY packages/api-client ./packages/api-client
COPY packages/types ./packages/types
COPY packages/ui ./packages/ui

# Next 在解析 packages/* 源码里的二级依赖时会从仓库根继续向上查找 node_modules。
# 为 builder 显式补根级 workspace 链接，避免仅在 apps/web/node_modules 下可见。
RUN mkdir -p ./node_modules/@lyranote \
  && ln -sfn ../../packages/api-client ./node_modules/@lyranote/api-client \
  && ln -sfn ../../packages/types ./node_modules/@lyranote/types \
  && ln -sfn ../../packages/ui ./node_modules/@lyranote/ui

# 构建参数
ARG NEXT_PUBLIC_API_BASE_URL=/api/v1
ENV NEXT_PUBLIC_API_BASE_URL=${NEXT_PUBLIC_API_BASE_URL}
ENV NODE_ENV=production

# 构建（hoisted 依赖时 next 在 /app/node_modules/.bin，需在仓库根执行）
RUN pnpm --filter @lyranote/web build

# ========================
# Runner（最小运行时）
# ========================
FROM node:20-alpine AS runner
RUN corepack enable

WORKDIR /app
ENV NODE_ENV=production
# Docker 会注入 HOSTNAME=容器短 ID；Next 用它做 listen 时往往只绑定该名字解析到的网卡 IP，127.0.0.1 健康检查会连不上
ENV HOSTNAME=0.0.0.0

# 关键：standalone 输出
COPY --from=builder /app/apps/web/.next/standalone ./

# 静态资源（必须）
COPY --from=builder /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=builder /app/apps/web/public ./apps/web/public

# 端口
EXPOSE 3000

# Monorepo standalone: server.js lives under apps/web（与 outputFileTracingRoot 一致）
CMD ["node", "apps/web/server.js"]
