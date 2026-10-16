# syntax=docker/dockerfile:1

# Frizzy — image produksi berbasis Next.js `output: "standalone"`.
# Tiga tahap: deps (cache dependensi) -> builder (pnpm build) -> runner (ramping, non-root).

# ---------------------------------------------------------------------------
# 1. deps — pasang dependensi saja agar lapisan ini bisa di-cache.
# ---------------------------------------------------------------------------
FROM node:22-alpine AS deps
RUN apk add --no-cache libc6-compat
# Aktifkan corepack; versi pnpm diambil dari field `packageManager` di package.json.
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0
RUN corepack enable
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

# ---------------------------------------------------------------------------
# 2. builder — kompilasi aplikasi.
# ---------------------------------------------------------------------------
FROM node:22-alpine AS builder
RUN apk add --no-cache libc6-compat
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0
RUN corepack enable
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
# node_modules dari tahap deps (tidak tertimpa `COPY . .` karena .dockerignore).
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN pnpm build

# ---------------------------------------------------------------------------
# 3. runner — hanya server standalone + aset statis. Tanpa jaringan saat jalan.
# ---------------------------------------------------------------------------
FROM node:22-alpine AS runner
RUN apk add --no-cache libc6-compat
WORKDIR /app

ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0

# Jalankan sebagai pengguna non-root.
RUN addgroup -S -g 1001 nodejs \
 && adduser -S -u 1001 -G nodejs nextjs

# Aset publik (font self-host, ikon, dll).
COPY --from=builder /app/public ./public
# Server standalone berisi server.js + node_modules runtime minimal.
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
# Aset statis yang dihasilkan build (harus berada di .next/static).
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs
EXPOSE 3000
CMD ["node", "server.js"]
