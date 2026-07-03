# Coolify Deployment

## Build From GitHub App

The primary Coolify deployment path is a Dockerfile build from the repository
connected through the GitHub App.

Coolify configuration:

- source: GitHub repository `ablond/magium` through GitHub App;
- build pack: `Dockerfile`;
- Dockerfile: root `Dockerfile`;
- base directory: repository root;
- exposed port: `8080`;
- runtime variables: none;
- optional build args when public contributions are enabled: `VITE_MAGIUM_CONTRIBUTIONS_API_URL`, `VITE_MAGIUM_TURNSTILE_SITE_KEY`;
- persistent volumes: none.

The Dockerfile builds the app with Node 24 LTS and pnpm, runs `pnpm build`, and
copies only `dist/` into `nginxinc/nginx-unprivileged:stable-alpine`.

Coolify builder prerequisites:

- network access to `raduprv/Magium` during `pnpm build`, because `content:import` verifies `main`;
- network access to the npm registry and base Docker images.

## Local Docker Compose Stack

Start the full local stack from the repository root:

```bash
docker compose up -d
```

Services:

- PWA Vite dev: `http://localhost:5173`
- Translation API: `http://localhost:8090`
- PostgreSQL 18: `localhost:5432`

Default local values:

- PostgreSQL database/user/password: `magium_translation`
- API admin token: `dev-admin-token`
- API Turnstile disabled: `TURNSTILE_DISABLED=1`

The local compose stack uses `postgres:18-alpine` and mounts its volume at
`/var/lib/postgresql`, matching the Docker PostgreSQL 18 layout. Do not reuse
an older PostgreSQL 17 volume mounted at `/var/lib/postgresql/data`.

`.env.example` documents optional overrides but is not required. To reset the
local database:

```bash
docker compose down -v
```

## Translation API Coolify Service

Public contributions use a Coolify application separate from the PWA.

Coolify configuration:

- source: same GitHub repository;
- build pack: `Dockerfile`;
- base directory: `services/translation-api`;
- Dockerfile: `Dockerfile`;
- exposed port: `8090`;
- HTTP healthcheck: `/health`;
- PostgreSQL: separate Coolify PostgreSQL service.

Required variables:

```text
DATABASE_URL=postgres://...
ADMIN_TOKEN=...
ADMIN_PASSWORD=...
ADMIN_SESSION_SECRET=...
PUBLIC_API_URL=https://tr.magium.app
PUBLIC_WEB_URL=https://magium.app
ALLOWED_ORIGIN=https://magium.app
TURNSTILE_SECRET_KEY=...
EMAIL_CONSENT_SECRET=...
ADMIN_COOKIE_SECURE=1
```

Optional variables:

```text
SMTP_URL=smtp://<BREVO_SMTP_LOGIN_URL_ENCODED>:<BREVO_SMTP_KEY_URL_ENCODED>@smtp-relay.brevo.com:587
EMAIL_FROM=Magium <no-reply@magium.app>
EMAIL_WEBHOOK_URL=https://...
EMAIL_WEBHOOK_TOKEN=...
GITHUB_TOKEN_FOR_DISPATCH=...
GITHUB_REPOSITORY_TARGET=ablond/magium
GITHUB_WORKFLOW_FILE=translation-changeset-pr.yml
GITHUB_REF_NAME=main
PSEUDONYM_BLOCKLIST=...
ADMIN_SESSION_TTL_HOURS=8
ADMIN_LOGIN_RATE_LIMIT_WINDOW_MS=900000
ADMIN_LOGIN_RATE_LIMIT_MAX=5
RATE_LIMIT_WINDOW_MS=60000
RATE_LIMIT_MAX=20
MAX_JSON_BODY_BYTES=131072
TRUST_PROXY=0
```

The maintainer interface is served by the API service at `/admin`. In
production, use a long `ADMIN_PASSWORD`, a random `ADMIN_SESSION_SECRET`, and
`ADMIN_COOKIE_SECURE=1`. `ADMIN_TOKEN` remains reserved for scripts and
integrations.

Keep `MAX_JSON_BODY_BYTES=131072` to reject excessive JSON bodies before
parsing. Keep `TRUST_PROXY=0` unless the front Coolify proxy overwrites or
cleans `X-Forwarded-For` before the container; only then may `TRUST_PROXY=1`
let rate limiting use the forwarded client IP.

Configure Brevo `SMTP_URL` to enable email follow-up in production. Without an
email transport, the API refuses proposals that request notification so it does
not store an unusable address. `EMAIL_WEBHOOK_URL` remains available outside
production or for a specific integration, and takes priority over SMTP when set.

Expected Brevo production configuration:

```text
SMTP_URL=smtp://<BREVO_SMTP_LOGIN_URL_ENCODED>:<BREVO_SMTP_KEY_URL_ENCODED>@smtp-relay.brevo.com:587
EMAIL_FROM=Magium <no-reply@magium.app>
```

Before public activation, verify in Brevo that `no-reply@magium.app` or the
`magium.app` domain is authorized. Brevo SMTP credentials must stay only in
Coolify, never in the repository. URL-encode the login and SMTP key if their
characters require it.

To connect the production PWA to this API, configure the PWA build with:

```text
VITE_MAGIUM_CONTRIBUTIONS_API_URL=https://tr.magium.app
VITE_MAGIUM_TURNSTILE_SITE_KEY=...
```

## Production Contributions Checklist

Full reference: [docs/translation-contributions-system.md](./translation-contributions-system.md).

PWA Coolify:

- separate application from the API;
- root Dockerfile;
- port `8080`;
- production domain `magium.app`;
- build args `VITE_MAGIUM_CONTRIBUTIONS_API_URL` and `VITE_MAGIUM_TURNSTILE_SITE_KEY` if contributions are enabled;
- `VITE_MAGIUM_CONTRIBUTIONS_API_URL=https://tr.magium.app`;
- Turnstile site key must allow `magium.app`;
- no runtime variable and no volume.

Translation API Coolify:

- separate application;
- base directory `services/translation-api`;
- Dockerfile `Dockerfile`;
- port `8090`;
- production domain `tr.magium.app`;
- maintainer admin `https://tr.magium.app/admin`;
- healthcheck `/health`;
- separate Coolify PostgreSQL with `DATABASE_URL` injected into the API;
- `ADMIN_COOKIE_SECURE=1` required for HTTPS production;
- `PUBLIC_API_URL=https://tr.magium.app`, reachable by GitHub Actions;
- `PUBLIC_WEB_URL=https://magium.app`;
- `ALLOWED_ORIGIN=https://magium.app`;
- API `TURNSTILE_SECRET_KEY` must match the PWA site key used at build time;
- `MAX_JSON_BODY_BYTES=131072`;
- `TRUST_PROXY=0`, or `TRUST_PROXY=1` only if the proxy cleans `X-Forwarded-For`;
- `EMAIL_CONSENT_SECRET` and `ADMIN_SESSION_SECRET` must be long and random;
- `SMTP_URL` must point to Brevo SMTP in production;
- `EMAIL_FROM` must be `Magium <no-reply@magium.app>`;
- `no-reply@magium.app` or the `magium.app` domain must be verified in Brevo;
- `ADMIN_PASSWORD` is only for the `/admin` interface;
- `ADMIN_TOKEN` is for scripts and GitHub workflow use.

GitHub PR dispatch:

- in the API, configure `GITHUB_TOKEN_FOR_DISPATCH`, `GITHUB_REPOSITORY_TARGET`, `GITHUB_WORKFLOW_FILE`, `GITHUB_REF_NAME`;
- the recommended token is a fine-grained PAT limited to the target repo with repository permission `Actions: Read and write`;
- in GitHub Actions, add secret `MAGIUM_TRANSLATION_API_TOKEN` with the same value as API-side `ADMIN_TOKEN`;
- verify `.github/workflows/translation-changeset-pr.yml` exists and is active on the target branch;
- do not use `http://localhost:8090` in production: the GitHub workflow must reach `PUBLIC_API_URL` from the Internet.

Email:

- configure either `SMTP_URL` or `EMAIL_WEBHOOK_URL` to allow email follow-up;
- in production, prefer Brevo SMTP with `smtp-relay.brevo.com:587`;
- without email transport, the API refuses a proposal requesting follow-up and does not store the address;
- never display raw email in admin; it is deleted after rejection, stale, or publication.

## Optional GHCR Image

The repository also keeps a manual publication flow to GitHub Container
Registry:

```text
ghcr.io/ablond/magium
```

Default tags:

- `YYYYMMDD-HHMMSS` in UTC for an immutable version;
- `latest` for the current deployment.

Use this flow if you want to deploy a prebuilt image instead of letting Coolify
build from GitHub. The container still exposes `8080`, reads no runtime
environment variable, and uses no volume. Saves remain browser-side in
IndexedDB.

## Build And Publication

Local prerequisites:

- Docker with Buildx;
- network access to `raduprv/Magium` during `pnpm build`, because `content:import` verifies `main`;
- local GHCR authentication for publication: `docker login ghcr.io`.

Commands:

```bash
pnpm check
pnpm test
pnpm build
pnpm docker:build-prod
pnpm docker:push-prod
```

`pnpm docker:build-prod` builds the final image locally and validates:

- no `.magium`;
- no raw canonical JSON;
- no `node_modules` or `.env*`;
- no obvious raw source excerpts;
- HTTP response on `/`, `/sw.js`, `/manifest.webmanifest`;
- SPA fallback to `index.html`.

`pnpm docker:push-prod` repeats the same validation, pushes
`ghcr.io/ablond/magium:<timestamp>` and `ghcr.io/ablond/magium:latest`, then
inspects the published tags.

Useful variables:

```bash
MAGIUM_IMAGE=ghcr.io/ablond/magium
MAGIUM_TAG=20260627-180000
MAGIUM_PLATFORM=linux/amd64
```

`MAGIUM_PLATFORM` defaults to `linux/amd64`. Local runtime validation requires
a platform executable on the current machine. In non-push mode, the platform
must therefore match the local machine. In push mode, the script validates a
local image first, then builds and publishes the requested platform if it
differs.

## Coolify Configuration With A Prebuilt Image

Alternative to the GitHub App build: create a Docker Image / prebuilt image
application:

- image: `ghcr.io/ablond/magium`;
- tag: `latest` or a timestamp tag;
- exposed port: `8080`;
- environment variables: none;
- persistent volumes: none.

If the GHCR package is private, connect to the Coolify server as the user used
by Coolify for Docker, then authenticate GHCR:

```bash
echo "$GH_TOKEN" | docker login ghcr.io -u "$USERNAME" --password-stdin
```

The token must be able to read the package. Coolify then detects the
server-side Docker credentials when pulling the image.

References:

- https://coolify.io/docs/applications
- https://coolify.io/docs/applications/ci-cd/github/actions
- https://coolify.io/docs/knowledge-base/docker/registry

## Limits

- The GitHub App flow lets Coolify build the image from the root `Dockerfile`.
- There is no automatic Coolify webhook in the manual GHCR flow.
- The final image serves generated Vite bundles; it does not contain archived sources or canonical JSON.
- GHCR publication should happen after a pushed commit so the GHCR tag matches the delivered Git state.
