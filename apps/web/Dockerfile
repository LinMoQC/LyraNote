FROM node:20-alpine AS base
RUN corepack enable

# ── 依赖安装层（利用 Docker 缓存）──────────────────────────────────
FROM base AS deps
WORKDIR /app

# 复制 monorepo 根配置和工作区声明
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./

# 仅复制 web 包的 package.json（供 pnpm 计算依赖树）
COPY apps/web/package.json ./apps/web/

# 只安装 web 包的依赖，跳过其他工作区
RUN pnpm install --frozen-lockfile --filter @lyranote/web...

# ── 构建层 ─────────────────────────────────────────────────────────
FROM base AS builder
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/web/node_modules ./apps/web/node_modules

# 复制 web 源码
COPY apps/web ./apps/web

ARG NEXT_PUBLIC_API_BASE_URL=/api/v1
ENV NEXT_PUBLIC_API_BASE_URL=${NEXT_PUBLIC_API_BASE_URL}
ENV NODE_ENV=production

RUN cd apps/web && pnpm build

# ── 运行层（最小镜像）──────────────────────────────────────────────
FROM node:20-alpine AS runner
RUN corepack enable
WORKDIR /app

ENV NODE_ENV=production

COPY --from=builder /app/apps/web/.next/standalone ./
COPY --from=builder /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=builder /app/apps/web/public ./apps/web/public

EXPOSE 3000

CMD ["node", "apps/web/server.js"]
