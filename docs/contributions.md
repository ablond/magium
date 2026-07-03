# Public Translation Contributions

## Goal

Allow a reader to suggest a translation correction from the PWA, without an
account and without exposing source files to the runtime.

The exhaustive technical handoff for maintaining or evolving this subsystem is
[docs/translation-contributions-system.md](./translation-contributions-system.md).
This document stays focused on product and functional behavior.

The flow is privacy-first:

- anonymous contribution by default;
- optional pseudonym only for credits;
- optional email only for follow-up;
- initial email confirmation before any notification, reusable for one year in the same browser;
- grouped notification per recipient when proposals are rejected or marked stale in batch, or published;
- email deletion after closing or publication notification;
- maintainer review before integration;
- integration through a changeset and GitHub pull request.

## PWA Surface

The PWA may show a discreet pencil icon on visible paragraphs and choices. This
surface is opt-in: icons are hidden by default, fully absent when
`VITE_MAGIUM_CONTRIBUTIONS_API_URL` is not configured, and visible only when the
reader enables `Translation corrections` in Settings. For narrative text, the
icon targets the displayed paragraph, not the whole `messageId` block when that
block contains multiple paragraphs separated by blank lines. The form shows
only that current segment, the corresponding English source segment when it
differs, and contribution fields.

Technical IDs are not shown to the player, but the payload contains:

- `contentVersion`
- `locale`
- `chapterId`
- `sceneId`
- `messageId`
- `targetType`
- `segmentIndex` and `segmentCount` for `targetType: "paragraph"`
- `currentText`, limited to the displayed paragraph or choice at submission time
- `currentTextHash`
- `sourceTextHash`

These fields are used only to route, verify, and review the proposal.
`currentText` is not a complete source block; it lets the maintainer admin show
the exact original target text and a visual diff against the proposed text.

A paragraph correction cannot contain a paragraph separator `\n\n`. The player
icon corrects one displayed paragraph at a time; full editorial rewrites of
multi-paragraph blocks remain a maintainer/manual case.

PWA build variables:

```text
VITE_MAGIUM_CONTRIBUTIONS_API_URL=https://tr.magium.app
VITE_MAGIUM_TURNSTILE_SITE_KEY=...
```

If the API URL is not configured, the Settings option and pencil icons are not
rendered. The form still keeps robust submission checks and sends nothing
without an API.

Local Docker with `docker compose up -d` starts:

- PWA: `http://localhost:5173`
- API: `http://localhost:8090`
- maintainer admin: `http://localhost:8090/admin`
- Turnstile disabled API-side through `TURNSTILE_DISABLED=1`
- admin token: `dev-admin-token`
- admin password: `dev-admin-password`

## Contribution API

The service lives under `services/translation-api`. It is separate from the
static PWA image and can be deployed as a distinct Coolify service with
PostgreSQL.

`GET /health` returns `{ "status": "ok" }` for Docker Compose and Coolify.

Public routes:

- `POST /v1/translation-proposals`
- `GET /v1/translation-proposals/:publicId/status`
- `GET|POST /v1/translation-proposals/:publicId/confirm-email`

After the reader clicks the email confirmation link, the API redirects to the
PWA. The reader must see a visible confirmation in the reader UI, without a
technical identifier, and the consent fragment must be removed from the URL.
When the link is opened in the same browser that submitted the initial
proposal, the PWA also stores local consent to avoid another confirmation email
for one year.

Admin routes protected by `ADMIN_TOKEN` or by a maintainer web session:

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

Maintainer interface:

- `GET /admin` serves a simple web interface from the API service;
- `POST /admin/login`, `GET /admin/session`, and `POST /admin/logout` manage an `HttpOnly`, `SameSite=Strict` cookie session;
- mutating web UI actions use a CSRF token; scripts may keep using `Authorization: Bearer ADMIN_TOKEN`;
- proposal detail shows original target text, a diff between original/proposal, and an editable final retained version.

Required production API variables:

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
ADMIN_SESSION_TTL_HOURS=8
```

Optional production API variables:

```text
SMTP_URL=smtp://<BREVO_SMTP_LOGIN_URL_ENCODED>:<BREVO_SMTP_KEY_URL_ENCODED>@smtp-relay.brevo.com:587
EMAIL_FROM=Magium <no-reply@magium.app>
EMAIL_WEBHOOK_URL=https://...
EMAIL_WEBHOOK_TOKEN=...
GITHUB_TOKEN_FOR_DISPATCH=...
GITHUB_REPOSITORY_TARGET=owner/repo
GITHUB_WORKFLOW_FILE=translation-changeset-pr.yml
GITHUB_REF_NAME=main
PSEUDONYM_BLOCKLIST=...
```

Email transport:

- if `EMAIL_WEBHOOK_URL` is set, the API sends mail content as JSON `{ from, to, subject, text, html }` to that webhook;
- otherwise, if `SMTP_URL` is set, the API sends text and HTML mail through SMTP with Nodemailer;
- otherwise, email follow-up is refused and the address is not stored.

In production, `SMTP_URL` should point to Brevo SMTP
(`smtp-relay.brevo.com:587`) and `EMAIL_FROM` should be
`Magium <no-reply@magium.app>`. The sender `no-reply@magium.app` or the
`magium.app` domain must be verified in Brevo before public activation.

Production domains:

- reading app: `https://magium.app`;
- contribution API and maintainer admin: `https://tr.magium.app`, with admin at `https://tr.magium.app/admin`;
- `ALLOWED_ORIGIN` must remain strictly `https://magium.app`.

In local Docker, compose sets `SMTP_URL=smtp://mailpit:1025` and
`EMAIL_FROM=Magium <no-reply@magium.app>`. Emails are visible in Mailpit at
`http://localhost:8025` and do not leave the machine.

## Review And Changesets

A proposal never creates a PR by itself. The maintainer accepts, rejects, or
marks proposals stale, then creates a changeset.

Rules:

- accepting a proposal does not send an immediate email; mail is sent only when the changeset is marked published;
- publication groups confirmed contacts by normalized email, with one email per recipient even if several corrections in the batch belong to them;
- rejections and stale markings can be processed in batch from admin to send one closing mail per recipient;
- a changeset may contain only one final version per `locale/chapterId/messageId/target`;
- for a paragraph, the target is `segmentIndex`, so multiple corrections for the same `messageId` may coexist if they touch different segments;
- competing proposals on the same segment or choice must be resolved in the review UI;
- the maintainer diff is a review aid, not a source of truth; the editable final version is what enters the changeset;
- a paragraph proposal whose current segment hash no longer matches becomes stale, even if the rest of the message is still valid;
- credited pseudonyms remain subject to moderation.

## GitHub Actions

`.github/workflows/translation-changeset-pr.yml` is triggered by
`workflow_dispatch`.

It:

1. fetches the changeset from the API;
2. applies corrections to `content/story-locales/<locale>/<chapter>.json` with `tools/contributions/apply-changeset.mjs`, replacing only the targeted segment for paragraph corrections;
3. rejects any partially stale batch;
4. runs `pnpm content:all`, `pnpm check`, `pnpm test`, and `pnpm build`;
5. opens one PR for the batch.

Expected GitHub secret:

```text
MAGIUM_TRANSLATION_API_TOKEN
```

## Personal Data

Email is stored separately from the proposal and becomes active only after link
confirmation. The first confirmation also creates a local browser token, valid
for one rolling year for the same email entered from that browser. The server
keeps only an HMAC of the normalized email and a hash of the token, never the
raw email in that consent proof.

Raw contact email is deleted:

- after grouped notification if the proposal is rejected or marked stale in batch;
- immediately, without notification, if a proposal is rejected or marked stale through the legacy single action;
- after notification when the accepted changeset is published.

The player form shows only a success message after submission. It does not ask
the reader to keep a receipt and does not display the proposal `publicId`.

The pseudonym is public only if the contributor explicitly asks for credit and
the maintainer approves it. Illegal, violent, hateful, sexually explicit,
child-sexual-abuse, doxxing, impersonation, or otherwise clearly inappropriate
pseudonyms must be rejected or hidden.

The public page `/legal/contributions.html` summarizes these rules for readers.
The public instance operator must complete its legal notices before enabling the
form publicly.
