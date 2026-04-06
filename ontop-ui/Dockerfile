# ── Stage 1: Build ──────────────────────────────────────
FROM node:20-slim AS builder

RUN corepack enable && corepack prepare pnpm@9 --activate

WORKDIR /app

COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

COPY . .

ENV BACKEND_URL=http://backend:8000
RUN pnpm next build && \
    pnpm exec tsup src/server.ts --format cjs --platform node --target node20 --outDir dist

# ── Stage 2: Production deps only ──────────────────────
FROM builder AS prod-deps

RUN pnpm install --frozen-lockfile --prod

# ── Stage 3: Run ───────────────────────────────────────
FROM node:20-slim

WORKDIR /app

COPY --from=builder /app/.next/ .next/
COPY --from=builder /app/public/ public/
COPY --from=builder /app/dist/ dist/
COPY --from=prod-deps /app/node_modules/ node_modules/
COPY --from=builder /app/package.json .

ENV COZE_PROJECT_ENV=PROD
ENV PORT=5000
ENV BACKEND_URL=http://backend:8000

EXPOSE 5000

CMD ["node", "dist/server.js"]
