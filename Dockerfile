# check=skip=SecretsUsedInArgOrEnv
# Vite embeds only public client settings. Runtime secrets stay in Coolify.
FROM node:24-alpine AS build

WORKDIR /app
ENV PNPM_HOME=/pnpm
ENV PATH="${PNPM_HOME}:${PATH}"

RUN corepack enable && corepack prepare pnpm@11.9.0 --activate

COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

COPY . .
ARG VITE_MAGIUM_API_URL="/"
ARG VITE_MAGIUM_TURNSTILE_SITE_KEY=""
ENV VITE_MAGIUM_API_URL="${VITE_MAGIUM_API_URL}"
ENV VITE_MAGIUM_TURNSTILE_SITE_KEY="${VITE_MAGIUM_TURNSTILE_SITE_KEY}"
RUN pnpm build

FROM node:24-alpine AS server-deps

WORKDIR /app/services/translation-api
ENV PNPM_HOME=/pnpm
ENV PATH="${PNPM_HOME}:${PATH}"

RUN corepack enable && corepack prepare pnpm@11.9.0 --activate

COPY services/translation-api/package.json services/translation-api/pnpm-lock.yaml ./
RUN pnpm install --prod --frozen-lockfile

FROM node:24-alpine AS prod

WORKDIR /app
ENV NODE_ENV=production
ENV PORT=8080
ENV STATIC_DIR=/app/dist

COPY --from=server-deps /app/services/translation-api/node_modules ./services/translation-api/node_modules
COPY services/translation-api/package.json ./services/translation-api/package.json
COPY services/translation-api/src ./services/translation-api/src
COPY services/translation-api/admin ./services/translation-api/admin
COPY services/translation-api/migrations ./services/translation-api/migrations
COPY services/translation-api/schema.sql ./services/translation-api/schema.sql
COPY --from=build /app/dist ./dist

RUN chown -R node:node /app
USER node

EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 CMD node -e "fetch('http://127.0.0.1:8080/health').then((response) => process.exit(response.ok ? 0 : 1)).catch(() => process.exit(1))"

CMD ["node", "services/translation-api/src/server.js"]
