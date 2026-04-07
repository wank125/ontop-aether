# ── Stage 1: Build ──────────────────────────────────────
FROM node:20-slim AS builder

RUN corepack enable && corepack prepare pnpm@9 --activate

WORKDIR /app

COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

COPY . .

RUN pnpm next build

# ── Stage 2: Serve with nginx ──────────────────────────
FROM nginx:alpine

COPY --from=builder /app/out /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Override default nginx port
RUN sed -i 's/listen 80/listen 5000/' /etc/nginx/nginx.conf || true

EXPOSE 5000

CMD ["nginx", "-g", "daemon off;"]
