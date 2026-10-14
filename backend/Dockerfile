FROM node:24-alpine AS builder

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build && npm prune --omit=dev

FROM node:24-alpine

WORKDIR /app

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/src/db/schema.sql ./dist/db/schema.sql
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./

# Data lives in PostgreSQL, nothing is written to disk: run unprivileged.
# docker-compose adds a read-only root filesystem, no capabilities and
# no-new-privileges on top.
USER node

EXPOSE 8080

ENV PORT=8080
ENV NODE_ENV=production
ENV TZ=Europe/Paris
# `npm run db:fixtures` inside the container: the root filesystem is read-only,
# only /tmp (tmpfs) is writable for npm's cache and logs.
ENV npm_config_cache=/tmp/.npm
ENV npm_config_update_notifier=false

CMD ["node", "dist/index.js"]
