FROM node:22-bookworm-slim AS dependencies
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM dependencies AS builder
COPY . .
ARG DATABASE_URL=postgresql://build:build@localhost:5432/build
ARG SESSION_SECRET=build-only-session-secret-not-used-at-runtime
RUN DATABASE_URL="$DATABASE_URL" SESSION_SECRET="$SESSION_SECRET" npm run build

FROM node:22-bookworm-slim AS web
ENV NODE_ENV=production
ENV HOSTNAME=0.0.0.0
WORKDIR /app
RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates openssl \
  && rm -rf /var/lib/apt/lists/*
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public
RUN rm -f .env .env.*
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 CMD node -e "fetch('http://127.0.0.1:3000/api/health').then(response => process.exit(response.ok ? 0 : 1)).catch(() => process.exit(1))"
CMD ["node", "server.js"]

FROM builder AS worker
ENV NODE_ENV=production
CMD ["npm", "run", "dev:worker"]
