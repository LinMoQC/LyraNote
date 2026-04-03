# ========================
# Base
# ========================
FROM node:20-alpine AS base
RUN corepack enable

# ========================
# Dependencies
# ========================
FROM base AS deps
WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/monitoring/package.json ./apps/monitoring/

RUN printf '%s\n' 'node-linker=hoisted' > .npmrc
RUN pnpm install --frozen-lockfile --filter @lyranote/monitoring...

# ========================
# Builder
# ========================
FROM base AS builder
WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/monitoring/node_modules ./apps/monitoring/node_modules
COPY apps/monitoring ./apps/monitoring

ARG NEXT_PUBLIC_API_BASE_URL=/api/v1
ARG MONITORING_BASE_PATH=/ops
ENV NEXT_PUBLIC_API_BASE_URL=${NEXT_PUBLIC_API_BASE_URL}
ENV MONITORING_BASE_PATH=${MONITORING_BASE_PATH}
ENV NODE_ENV=production

RUN pnpm --filter @lyranote/monitoring build

# ========================
# Runner
# ========================
FROM node:20-alpine AS runner
RUN corepack enable

WORKDIR /app
ENV NODE_ENV=production
ENV HOSTNAME=0.0.0.0

COPY --from=builder /app/apps/monitoring/.next/standalone ./
COPY --from=builder /app/apps/monitoring/.next/static ./apps/monitoring/.next/static

EXPOSE 3000

CMD ["node", "apps/monitoring/server.js"]
