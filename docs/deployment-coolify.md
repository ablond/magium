# Coolify Deployment

## Production Topology

Magium uses exactly two production resources:

1. one application built from the root `Dockerfile`;
2. one PostgreSQL database.

The application serves the PWA, accounts, cloud synchronization, translation
proposals, and `/admin` on the same `magium.app` origin. No account or
translation subdomain is required. PostgreSQL remains a separate resource so
its volume, backups, upgrades, and recovery do not depend on the application
container.

## Coolify Application

Create one application with:

- source: GitHub repository `ablond/magium` through the GitHub App;
- build pack: `Dockerfile`;
- base directory: repository root;
- Dockerfile: `Dockerfile`;
- exposed port: `8080`;
- domain: `https://magium.app`;
- persistent application volume: none;
- healthcheck: `/health`.

The Dockerfile builds the Vite PWA and produces one Node 24 runtime image. The
runtime image contains `dist/`, the API/admin code, and SQL migrations. It does
not contain the archive or canonical content trees.

The default public API base embedded in the image is `/`, so browser requests
stay on `magium.app`. The only optional public build argument is:

```text
VITE_MAGIUM_TURNSTILE_SITE_KEY=...
```

## PostgreSQL

Create one PostgreSQL 18 resource and inject its internal connection URL into
the application:

```text
DATABASE_URL=postgres://...
```

On every startup, the application takes a PostgreSQL advisory lock and applies
new files from `services/translation-api/migrations/` exactly once. This
supports both an empty database and an existing translation database. Do not
mount `schema.sql` as a Docker entrypoint file.

Back up PostgreSQL independently through Coolify. Never put database files in
the application container or attach its volume to `/app`.

## Runtime Variables

Required for the full production feature set:

```text
DATABASE_URL=postgres://...
PUBLIC_URL=https://magium.app
ADMIN_TOKEN=<long random token>
ADMIN_PASSWORD=<long random password>
ADMIN_SESSION_SECRET=<long random secret>
ADMIN_COOKIE_SECURE=1
TURNSTILE_SECRET_KEY=...
EMAIL_CONSENT_SECRET=<long random secret>
```

Accounts and synchronization:

```text
SESSION_TTL_DAYS=30
AUTH_RATE_LIMIT_WINDOW_MS=900000
AUTH_RATE_LIMIT_MAX=10
AUTH_MAX_JSON_BODY_BYTES=16384
MAX_SYNC_BODY_BYTES=5000000
MAX_SYNC_RECORDS=500
```

Translation contributions and notifications:

```text
SMTP_URL=smtp://<BREVO_LOGIN>:<BREVO_KEY>@smtp-relay.brevo.com:587
EMAIL_FROM=Magium <no-reply@magium.app>
GITHUB_TOKEN_FOR_DISPATCH=...
GITHUB_REPOSITORY_TARGET=ablond/magium
GITHUB_WORKFLOW_FILE=translation-changeset-pr.yml
GITHUB_REF_NAME=main
```

Optional operational controls:

```text
ADMIN_SESSION_TTL_HOURS=8
ADMIN_LOGIN_RATE_LIMIT_WINDOW_MS=900000
ADMIN_LOGIN_RATE_LIMIT_MAX=5
RATE_LIMIT_WINDOW_MS=60000
RATE_LIMIT_MAX=20
MAX_JSON_BODY_BYTES=131072
TRUST_PROXY=0
PSEUDONYM_BLOCKLIST=...
```

Keep `TRUST_PROXY=0` unless the Coolify proxy is confirmed to overwrite and
sanitize `X-Forwarded-For`. `TURNSTILE_DISABLED=1` is forbidden in production.

## Fresh Deployment

1. Create PostgreSQL and enable its Coolify backups.
2. Create the application from the root Dockerfile.
3. Configure `DATABASE_URL`, `PUBLIC_URL`, and production secrets.
4. Attach `magium.app`, expose port `8080`, and deploy.
5. Confirm that startup logs report no migration error.
6. Verify `/health`, `/`, `/sw.js`, `/manifest.webmanifest`, `/admin`, account
   registration/login/sync, and one public translation proposal.

No manual schema import and no API subdomain are needed.

## Migration From The Previous Split Topology

This repository prepares the migration but does not modify existing Coolify
resources automatically.

1. Back up both old PostgreSQL databases before changing an application or
   domain. Keep the old services stopped but recoverable until final approval.
2. Use the existing translation PostgreSQL as the unified database when it
   contains production proposals. Point the new application `DATABASE_URL` to
   it. Automatic migrations preserve translation tables and add account tables.
3. If the old account database contains real users, export only
   `user_accounts`, `user_sessions`, and `user_sync_records`, then restore their
   data into the unified database after its migrations have run. Inspect
   conflicts before retrying; never use a destructive restore option.
4. Deploy the unified application on a temporary Coolify URL and verify the PWA,
   admin, existing proposals, account login, and cloud synchronization.
5. Move `magium.app` to the unified application and repeat the health and user
   flow checks.
6. Retain database dumps and old resources until the observation period is
   complete. Deletion of old applications/databases is a separate explicit
   operation, not part of this code iteration.

Useful verification query after startup:

```sql
SELECT name, applied_at
FROM magium_schema_migrations
ORDER BY name;
```

The unified database must contain both the `translation_*` tables and the
`user_*` tables.

## Local Docker Stack

```bash
docker compose up -d --build
```

Local endpoints:

- Vite PWA: `http://localhost:5173`;
- unified production-style app/API: `http://localhost:8090`;
- admin through Vite: `http://localhost:5173/admin`;
- admin directly: `http://localhost:8090/admin`;
- PostgreSQL 18: `localhost:5432`, database/user/password `magium_translation`;
- Mailpit: `http://localhost:8025`.

The Vite server proxies `/v1`, `/admin`, and `/health` to the unified app, so
the PWA exercises the same-origin production contract during local browser
tests.

```bash
docker compose down      # keep PostgreSQL data
docker compose down -v   # destructive local reset
```

## Optional GHCR Publication

Coolify should normally build from the GitHub App and root Dockerfile. GHCR
remains an optional alternative:

```bash
pnpm docker:build-prod
pnpm docker:push-prod
```

The validation script builds the production image, starts a temporary
PostgreSQL, verifies migrations, static routes, SPA fallback, API 404 behavior,
health, and account registration before any push.
