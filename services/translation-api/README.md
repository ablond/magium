# Magium Server

This directory contains the single production server for Magium. One Node
process serves:

- the built PWA from `dist/`;
- `/v1/accounts/*` and `/v1/account/*`;
- `/v1/translation-proposals/*`;
- `/v1/admin/*` and the maintainer UI under `/admin`;
- `/health`.

The directory keeps its historical name to avoid a broad path-only move, but it
is no longer a standalone translation microservice. The root Dockerfile is the
only production image.

## Dependencies And Tests

```bash
pnpm --dir services/translation-api install --frozen-lockfile
pnpm test:server
```

`tests/unified-server.node.mjs` verifies that the PWA, accounts, contributions,
and admin routes are exposed by the same HTTP server. Account-specific modules
live under `src/account/`; translation and admin modules remain under `src/`.

## Database

The server requires one PostgreSQL database in production. `src/database.js`
runs every SQL file under `migrations/` in lexical order, guarded by a
PostgreSQL advisory lock. Applied migration filenames are recorded in
`magium_schema_migrations`.

The initial migration is idempotent and may run against:

- an empty database;
- an existing translation database;
- a database where account tables already exist.

`schema.sql` is a readable snapshot of the current application tables. Runtime
startup uses `migrations/`, not a Docker entrypoint mount.

## Runtime Configuration

Required in production:

```text
DATABASE_URL=postgres://...
PUBLIC_URL=https://magium.app
ADMIN_TOKEN=...
ADMIN_PASSWORD=...
ADMIN_SESSION_SECRET=...
TURNSTILE_SECRET_KEY=...
EMAIL_CONSENT_SECRET=...
```

Common optional variables:

```text
PORT=8080
STATIC_DIR=/app/dist
ADMIN_COOKIE_SECURE=1
ADMIN_SESSION_TTL_HOURS=8
SESSION_TTL_DAYS=30
AUTH_RATE_LIMIT_WINDOW_MS=900000
AUTH_RATE_LIMIT_MAX=10
AUTH_MAX_JSON_BODY_BYTES=16384
MAX_SYNC_BODY_BYTES=5000000
MAX_SYNC_RECORDS=500
RATE_LIMIT_WINDOW_MS=60000
RATE_LIMIT_MAX=20
MAX_JSON_BODY_BYTES=131072
TRUST_PROXY=0
SMTP_URL=smtp://...
EMAIL_FROM=Magium <no-reply@magium.app>
GITHUB_TOKEN_FOR_DISPATCH=...
GITHUB_REPOSITORY_TARGET=ablond/magium
GITHUB_WORKFLOW_FILE=translation-changeset-pr.yml
GITHUB_REF_NAME=main
```

`PUBLIC_API_URL` and `PUBLIC_WEB_URL` remain supported for the split local Vite
development topology. Production should use the single `PUBLIC_URL`.

## Security Boundaries

- Production refuses to start without `DATABASE_URL`.
- Account passwords are salted and hashed with `scrypt`.
- Only SHA-256 session-token hashes are stored in PostgreSQL.
- Cloud records are encrypted in the browser; the server must never receive a
  plaintext game state, label, history, variable, or achievement identifier.
- Admin browser sessions use `HttpOnly` cookies and CSRF protection.
- Translation follow-up emails stay outside public proposal/admin payloads and
  are deleted after their documented lifecycle.
- Static serving is restricted to `STATIC_DIR`; unknown `/v1/*` paths return a
  JSON 404 and never fall back to `index.html`.
