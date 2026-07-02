# check=skip=SecretsUsedInArgOrEnv
# Vite embeds the Turnstile site key as a public client setting; the secret key stays only on the API.
FROM node:24-alpine AS build

WORKDIR /app
ENV PNPM_HOME=/pnpm
ENV PATH="${PNPM_HOME}:${PATH}"

RUN corepack enable && corepack prepare pnpm@11.9.0 --activate

COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

COPY . .
ARG VITE_MAGIUM_CONTRIBUTIONS_API_URL=""
ARG VITE_MAGIUM_TURNSTILE_SITE_KEY=""
ENV VITE_MAGIUM_CONTRIBUTIONS_API_URL="${VITE_MAGIUM_CONTRIBUTIONS_API_URL}"
ENV VITE_MAGIUM_TURNSTILE_SITE_KEY="${VITE_MAGIUM_TURNSTILE_SITE_KEY}"
RUN pnpm build

FROM nginxinc/nginx-unprivileged:stable-alpine AS prod

COPY docker/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 8080
