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

# 只复制 web 包声明（减少依赖安装范围）
COPY apps/web/package.json ./apps/web/

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

# 拷贝源码
COPY apps/web ./apps/web

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

# 关键：standalone 输出
COPY --from=builder /app/apps/web/.next/standalone ./

# 静态资源（必须）
COPY --from=builder /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=builder /app/apps/web/public ./apps/web/public

# 端口
EXPOSE 3000

# Monorepo standalone: server.js lives under apps/web（与 outputFileTracingRoot 一致）
CMD ["node", "apps/web/server.js"]