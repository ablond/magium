# Magium Translation API

Standalone service for receiving, moderating, and grouping public translation
correction proposals.

The PWA stays static. This service does not serve raw narrative content; it
receives only proposals targeted by hash, technical identifiers, and the
displayed segment needed for maintainer review.

The complete subsystem handoff reference is
[../../docs/translation-contributions-system.md](../../docs/translation-contributions-system.md).
This README remains a short service-specific sheet.

## Variables

```text
PORT=8090
DATABASE_URL=postgres://...
PUBLIC_API_URL=https://tr.magium.app
PUBLIC_WEB_URL=https://magium.app
ALLOWED_ORIGIN=https://magium.app
ADMIN_TOKEN=...
ADMIN_PASSWORD=...
ADMIN_SESSION_SECRET=...
ADMIN_COOKIE_SECURE=1
ADMIN_SESSION_TTL_HOURS=8
ADMIN_LOGIN_RATE_LIMIT_WINDOW_MS=900000
ADMIN_LOGIN_RATE_LIMIT_MAX=5
RATE_LIMIT_WINDOW_MS=60000
RATE_LIMIT_MAX=20
MAX_JSON_BODY_BYTES=131072
TRUST_PROXY=0
TURNSTILE_SECRET_KEY=...
PSEUDONYM_BLOCKLIST=...
SMTP_URL=smtp://<BREVO_SMTP_LOGIN_URL_ENCODED>:<BREVO_SMTP_KEY_URL_ENCODED>@smtp-relay.brevo.com:587
EMAIL_FROM=Magium <no-reply@magium.app>
EMAIL_WEBHOOK_URL=https://...
EMAIL_WEBHOOK_TOKEN=...
EMAIL_CONSENT_SECRET=...
GITHUB_TOKEN_FOR_DISPATCH=...
GITHUB_REPOSITORY_TARGET=owner/repo
GITHUB_WORKFLOW_FILE=translation-changeset-pr.yml
GITHUB_REF_NAME=main
```

`TURNSTILE_DISABLED=1` is reserved for local development and tests.
`MAX_JSON_BODY_BYTES` defaults to `131072` and limits JSON bodies before
parsing.
`TRUST_PROXY=0` is the safe default: rate limiting uses the socket address. Set
`TRUST_PROXY=1` only behind a reverse proxy that overwrites or cleans
`X-Forwarded-For`.

## Local Docker

From the repository root:

```bash
docker compose up -d
```

The stack starts:

- PWA Vite dev: `http://localhost:5173`
- API: `http://localhost:8090`
- Maintainer admin: `http://localhost:8090/admin`
- PostgreSQL 18: `localhost:5432`
- Mailpit: `http://localhost:8025`

Default local values:

- `ADMIN_TOKEN=dev-admin-token`
- `ADMIN_PASSWORD=dev-admin-password`
- `ADMIN_SESSION_SECRET=dev-admin-session-secret`
- `TURNSTILE_DISABLED=1`
- `DATABASE_URL=postgres://magium_translation:magium_translation@postgres:5432/magium_translation`
- `SMTP_URL=smtp://mailpit:1025`
- `EMAIL_FROM=Magium <no-reply@magium.app>`
- `EMAIL_CONSENT_SECRET=dev-email-consent-secret`
- `MAX_JSON_BODY_BYTES=131072`
- `TRUST_PROXY=0`

Full reset:

```bash
docker compose down -v
```

The local compose stack uses `postgres:18-alpine` with a volume mounted at
`/var/lib/postgresql`. This layout differs from PostgreSQL 17; delete the old
local volume before restarting with PostgreSQL 18.

Healthcheck:

```bash
curl http://localhost:8090/health
```

## Docker Coolify

The API service has its own Dockerfile:

```bash
docker build -f services/translation-api/Dockerfile services/translation-api
```

In Coolify, create a separate application:

- base directory: `services/translation-api`
- Dockerfile: `Dockerfile`
- port: `8090`
- PostgreSQL: separate service

In production, set at least `DATABASE_URL`, `ADMIN_TOKEN`, `ADMIN_PASSWORD`,
`ADMIN_SESSION_SECRET`, `PUBLIC_API_URL=https://tr.magium.app`,
`PUBLIC_WEB_URL=https://magium.app`, `ALLOWED_ORIGIN=https://magium.app`,
`TURNSTILE_SECRET_KEY`, and `EMAIL_CONSENT_SECRET`. To enable email
notifications, also configure Brevo SMTP through `SMTP_URL` and
`EMAIL_FROM=Magium <no-reply@magium.app>`. For the web admin at
`https://tr.magium.app/admin`, set `ADMIN_COOKIE_SECURE=1`. Keep
`MAX_JSON_BODY_BYTES=131072`. Keep `TRUST_PROXY=0` unless Coolify or the front
proxy guarantees that `X-Forwarded-For` is cleaned before reaching the
container.

Expected Brevo configuration:

```text
SMTP_URL=smtp://<BREVO_SMTP_LOGIN_URL_ENCODED>:<BREVO_SMTP_KEY_URL_ENCODED>@smtp-relay.brevo.com:587
EMAIL_FROM=Magium <no-reply@magium.app>
```

Verify in Brevo that sender `no-reply@magium.app` or domain `magium.app` is
authorized before public activation. Brevo SMTP credentials must stay in
Coolify.

## Flow

1. The PWA sends `POST /v1/translation-proposals`.
2. If an email is provided, the service sends a confirmation link unless a browser token already confirms that email.
3. The maintainer handles proposals through `GET /admin` or through admin routes protected by `ADMIN_TOKEN`.
4. Accepted proposals are grouped into a changeset.
5. `POST /v1/admin/changesets/<id>/dispatch-pr` triggers the GitHub workflow.
6. After publication, `POST /v1/admin/changesets/<id>/published` notifies confirmed emails per recipient and then deletes them.

Rejections and stale markings can also be applied in batch with
`POST /v1/admin/proposals/bulk-review`. In that case, confirmed contacts are
grouped by normalized email to avoid multiple emails to the same person.

If no email transport is configured, proposals requesting notification are
rejected without storing the address.

If `EMAIL_WEBHOOK_URL` is used outside production, the sent payload contains
`{ from, to, subject, text, html }` with
`from=Magium <no-reply@magium.app>` by default. SMTP transport also sends both
`text` and `html` versions.

Email confirmation creates reusable consent for one year per browser. The
consent table does not store raw email: only an HMAC of normalized email and a
browser token hash.

## Public Routes

- `POST /v1/translation-proposals`
- `GET /v1/translation-proposals/:publicId/status`
- `GET|POST /v1/translation-proposals/:publicId/confirm-email`

## Admin Routes

- `GET /v1/admin/proposals`
- `POST /v1/admin/proposals/:publicId/review`
- `POST /v1/admin/proposals/bulk-review`
- `POST /v1/admin/changesets`
- `GET /v1/admin/changesets`
- `GET /v1/admin/changesets/:publicId`
- `GET /v1/admin/changesets/:publicId/export`
- `POST /v1/admin/changesets/:publicId/dispatch-pr`
- `POST /v1/admin/changesets/:publicId/stale`
- `POST /v1/admin/changesets/:publicId/published`

## Maintainer Web Interface

`GET /admin` serves a framework-free web interface for listing proposals,
accepting, rejecting, marking proposals as stale, batch-processing rejection or
stale marking for pending proposals, creating a changeset, exporting a changeset,
triggering the PR, and then marking a batch published or stale.

A proposal detail shows the target original text, a visual original/proposal
diff, and an editable retained final version. Older proposals that do not yet
contain original text remain visible, without diff.

The interface uses `ADMIN_PASSWORD` to open a signed `HttpOnly` cookie session
with `ADMIN_SESSION_SECRET`. POST actions performed with a cookie require the
CSRF token returned by `/admin/session`. Machine calls may keep using
`Authorization: Bearer ADMIN_TOKEN`.

## Database

Run `schema.sql` on PostgreSQL before the first startup.
