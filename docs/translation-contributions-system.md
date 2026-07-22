# Public Translation Contribution System

This document is the technical handoff reference for Magium's public
translation contribution system. It describes what exists, how to run it, how
to deploy it, how to operate it, and how to diagnose common failures.

The shorter product documentation is in [docs/contributions.md](./contributions.md).
Verification commands are in [docs/verification.md](./verification.md).
Coolify deployment is in [docs/deployment-coolify.md](./deployment-coolify.md).

## 1. Overview

The game remains a local-first PWA. In production, the built PWA and public
contribution routes are served by the same Magium Node application, with
maintainer review and GitHub PR before any integration.

End-to-end flow:

```text
PWA reader
  -> enables Translation corrections in Settings
  -> correction pencil on paragraph/choice
  -> POST /v1/translation-proposals
  -> same-origin Magium server + PostgreSQL
  -> maintainer /admin
  -> accept/reject/stale
  -> maintainer changeset
  -> GitHub workflow_dispatch
  -> tools/contributions/apply-changeset.mjs
  -> pnpm content:all + check + test + build
  -> single GitHub PR
  -> merge/publication
  -> optional email notification, then email deletion
```

Roles:

- Reader: proposes a correction from a visible paragraph or choice, without an account.
- Maintainer: reviews, compares diff, accepts/rejects/marks stale, groups into a changeset, dispatches the PR.
- PWA: displays the form, computes hashes, handles Turnstile and local opt-in storage.
- Magium server: serves the PWA, validates contributions, protects admin, sends emails, exposes changesets, and triggers GitHub.
- PostgreSQL: stores proposals, temporary email contacts, anonymized email consents, and changesets.
- GitHub Actions: applies the changeset to editable sources, regenerates, and opens a PR.
- Coolify: hosts one Magium application and one PostgreSQL resource.

V1 limits:

- contribution submission does not require an account;
- no public voting;
- no collaborative translation of a complete new language;
- no PR per individual proposal;
- no automatic merge into `content/story-locales/**`;
- the player button corrects one displayed paragraph or one complete choice;
- paragraph split/merge is not supported from the player form.

## 2. Local Startup

Start the full local stack from the repository root:

```bash
docker compose up -d --build
```

Services:

- PWA Vite dev: `http://localhost:5173`
- Unified app/API: `http://localhost:8090`
- Maintainer admin: `http://localhost:8090/admin`
- Mailpit: `http://localhost:8025`
- PostgreSQL 18: `localhost:5432`

Non-secret local values:

- `ADMIN_TOKEN=dev-admin-token`
- `ADMIN_PASSWORD=dev-admin-password`
- `ADMIN_SESSION_SECRET=dev-admin-session-secret`
- `TURNSTILE_DISABLED=1`
- `SMTP_URL=smtp://mailpit:1025`
- `EMAIL_FROM=Magium <no-reply@magium.app>`
- PostgreSQL database/user/password: `magium_translation`

Full local database reset:

```bash
docker compose down -v
```

The local compose stack uses `postgres:18-alpine` and a
`magium_postgres18_data` volume mounted at `/var/lib/postgresql`. Do not
directly reuse an older PostgreSQL 17 volume: the PostgreSQL 18 Docker image
uses a different data layout.

Stop without removing the PostgreSQL volume:

```bash
docker compose down
```

[.env.example](../.env.example) documents local overrides. It is not required
to copy it before starting the stack because `docker-compose.yml` provides
development defaults.

The server runs ordered, idempotent migrations at every startup. Existing
translation tables are preserved while account tables and missing compatibility
columns are added.

## 3. Data Model

Main tables:

- `translation_proposals`: public proposal and routing metadata.
- `translation_proposal_contacts`: temporary raw email for a proposal, separate from the proposal.
- `translation_email_consents`: reusable consent proof, without raw email.
- `translation_changesets`: maintainer batch of accepted proposals.

Important proposal fields:

- `public_id`: public API/admin identifier, never shown in the player UX.
- `status`: `pending`, `accepted`, `changeset`, `rejected`, or `stale`.
- `content_version`, `locale`, `chapter_id`, `scene_id`, `message_id`: technical routing.
- `target_type`: `paragraph` or `choice`.
- `segment_index`, `segment_count`: exact target for a displayed paragraph.
- `current_text`: target text displayed when the proposal was made, limited to paragraph or choice.
- `current_text_hash`: SHA-256 of the displayed target text.
- `source_text_hash`: SHA-256 of the matching English source segment when available.
- `proposed_text`: correction proposed by the reader.
- `final_text`: version retained by the maintainer when accepted.
- `note`: optional reader comment.
- `pseudonym`, `credit_requested`, `credit_approved`: optional and moderated credit.
- `moderator_note`: maintainer note.
- `changeset_id`: link to a changeset after grouping.

Compatibility:

- Old proposals without `current_text` remain listable.
- Admin then displays `Original text unavailable for this proposal`.
- The visual diff is disabled only for those older proposals.

Personal data:

- Pseudonym is optional and public only when the contributor requests credit and the maintainer approves it.
- Email is optional, stored separately, never displayed in admin, and deleted after rejection, stale, or publication.
- Reusable email consent does not store raw email: only an HMAC of normalized email and a browser token hash.

## 4. Public API

Public routes:

- `POST /v1/translation-proposals`
- `GET /v1/translation-proposals/:publicId/status`
- `GET|POST /v1/translation-proposals/:publicId/confirm-email`
- `GET /health`

Main `POST /v1/translation-proposals` payload:

```json
{
  "contentVersion": "magium-...",
  "locale": "fr",
  "chapterId": "ch1",
  "sceneId": "Ch1-Intro1",
  "messageId": "ch1.Ch1_Intro1.p1",
  "targetType": "paragraph",
  "segmentIndex": 0,
  "segmentCount": 5,
  "currentText": "Text shown to the player",
  "currentTextHash": "sha256-hex",
  "sourceTextHash": "sha256-hex",
  "proposedText": "Corrected text",
  "note": "optional comment",
  "pseudonym": "optional pseudonym",
  "creditRequested": false,
  "email": "reader@example.test",
  "notifyRequested": false,
  "emailConsentId": "optional",
  "emailConsentToken": "optional",
  "captchaToken": "turnstile-token"
}
```

Validation rules:

- `contentVersion`, `locale`, `chapterId`, `sceneId`, `messageId`, `targetType`, `currentTextHash`, `sourceTextHash`, and `proposedText` are required.
- `targetType` is `paragraph` or `choice`.
- A `paragraph` proposal requires `segmentIndex` and `segmentCount`.
- A `paragraph` proposal cannot contain a paragraph separator `\n\n` in `proposedText`.
- `proposedText` and `currentText` are limited to 12000 characters.
- If `currentText` is provided, its SHA-256 must match `currentTextHash`.
- `currentTextHash` and `sourceTextHash` must be hexadecimal SHA-256 strings.
- `chapterId`, `sceneId`, and `messageId` accept only expected technical IDs.
- If `notifyRequested` is true, a valid email and configured email transport are required.
- If `creditRequested` is true, a valid non-moderated pseudonym is required.
- Turnstile is required unless `TURNSTILE_DISABLED=1` or `NODE_ENV=test`.

Creation response:

```json
{
  "publicId": "tr_...",
  "status": "pending",
  "emailConfirmationRequired": false,
  "notificationStatus": "none"
}
```

`notificationStatus` values:

- `none`: no email follow-up requested.
- `confirmation_sent`: confirmation email sent.
- `confirmed`: reusable browser consent used, contact directly confirmed.

The PWA does not show `publicId` to the player.

## 5. Admin Interface

The web admin is served by the API service, not by the PWA:

- `GET /admin`
- `GET /admin/assets/admin.css`
- `GET /admin/assets/admin.js`
- `GET /admin/session`
- `POST /admin/login`
- `POST /admin/logout`

Authentication:

- `ADMIN_PASSWORD` is for human login.
- `ADMIN_SESSION_SECRET` signs the session cookie.
- Cookie `magium_translation_admin` is `HttpOnly`, `SameSite=Strict`, `Path=/`, with TTL `ADMIN_SESSION_TTL_HOURS`.
- In HTTPS production, `ADMIN_COOKIE_SECURE=1` must be configured.
- Mutating actions through cookie require `x-admin-csrf`.
- `ADMIN_TOKEN` remains supported for scripts through `Authorization: Bearer ...`.
- Login attempts are rate-limited by IP through `ADMIN_LOGIN_RATE_LIMIT_WINDOW_MS` and `ADMIN_LOGIN_RATE_LIMIT_MAX`.
- By default, the rate-limit IP is the socket address. `TRUST_PROXY=1` allows using the first `X-Forwarded-For` only if the reverse proxy overwrites or cleans this header.
- JSON bodies are limited before parsing by `MAX_JSON_BODY_BYTES`, defaulting to `131072` bytes.

Admin API routes:

- `GET /v1/admin/proposals?status=pending|accepted|changeset|rejected|stale`
- `POST /v1/admin/proposals/:publicId/review`
- `POST /v1/admin/proposals/bulk-review`
- `GET /v1/admin/changesets?status=ready|dispatched|published|stale`
- `POST /v1/admin/changesets`
- `GET /v1/admin/changesets/:publicId`
- `GET /v1/admin/changesets/:publicId/export`
- `POST /v1/admin/changesets/:publicId/dispatch-pr`
- `POST /v1/admin/changesets/:publicId/stale`
- `POST /v1/admin/changesets/:publicId/published`

Admin supports:

- filtering proposals by status;
- visual grouping by `locale/chapterId/messageId/segmentIndex`;
- viewing target original text;
- viewing a visual original/proposal diff;
- editing only the retained final version;
- accepting, rejecting, or marking stale;
- selecting pending proposals for batch rejection or stale marking;
- approving or hiding pseudonym credit;
- selecting accepted proposals;
- blocking two proposals on the same target in the UI;
- creating a changeset;
- listing and exporting changesets;
- dispatching the GitHub PR;
- marking a changeset published or stale.

Visual diff:

- API side uses the `diff` package with `diffWordsWithSpace`.
- Admin responses contain `diffParts`.
- UI displays additions in green, deletions in red strikethrough, modifications in orange.
- The diff is a review aid, not a source of truth.
- The batch source of truth remains `finalText`.

Statuses:

- `pending`: proposal received, not reviewed.
- `accepted`: proposal accepted with `finalText`, available for changeset.
- `changeset`: proposal included in a changeset.
- `rejected`: proposal rejected, email contact deleted.
- `stale`: proposal or changeset stale, email contact deleted.
- `ready`: changeset created, not dispatched.
- `dispatched`: GitHub dispatch requested.
- `published`: changeset published, notifications sent, contacts deleted.

## 6. Email And Privacy

Email transport:

- If `EMAIL_WEBHOOK_URL` is set, the API sends JSON `{ from, to, subject, text, html }` to that HTTP webhook.
- Otherwise, if `SMTP_URL` is set, the API uses Nodemailer/SMTP with text and HTML versions.
- Otherwise, email follow-up is refused and the address is not stored.
- In production, the selected transport is Brevo SMTP through `smtp-relay.brevo.com:587`, with `EMAIL_FROM=Magium <no-reply@magium.app>`.
- Sender `no-reply@magium.app` or domain `magium.app` must be verified/authorized in Brevo before public activation.
- Brevo SMTP credentials must be stored only in Coolify and URL-encoded in `SMTP_URL`.

Local:

- Docker Compose sets `SMTP_URL=smtp://mailpit:1025`.
- Docker Compose sets `EMAIL_FROM=Magium <no-reply@magium.app>`.
- Emails are visible at `http://localhost:8025`.
- No local email leaves the machine.

Browser double opt-in:

1. First proposal with email: the API creates an unconfirmed contact and sends a link.
2. The link calls `/confirm-email`.
3. The API confirms the contact, creates email consent, and redirects to `PUBLIC_URL`.
4. The redirect contains a local `translation-email-consent` fragment.
5. The PWA shows a visible confirmation notice after returning to the reader, then cleans the URL fragment.
6. If the link is opened in the same browser as the initial proposal, the PWA stores the consent token in IndexedDB without storing raw email in this consent.
7. Later proposals with the same email from the same browser reuse the token for one rolling year.

PWA local stores:

- `magium.readerSettings` in `localStorage`: contains `translationContributions`, disabled by default, to show or hide pencil icons when the API URL is configured.
- `contributionProfile`: pseudonym/email remembered only if the user opts in.
- email consents: confirmed consent tokens, removable through the local clear button.

Deletion:

- Single rejection or stale marking: immediate email contact deletion, without notification.
- Batch rejection or stale: grouped notification for confirmed contacts by normalized email, then deletion.
- Publication: grouped notification for confirmed contacts by normalized email, then deletion.
- Expired consents: opportunistic purge.

Closing and publication emails are digests per recipient: if the same confirmed
email has several proposals in the same processing batch, only one message is
sent. Public emails deliberately stay restrained and do not expose `messageId`,
`sceneId`, hash, segment, or visible internal identifier.

Pseudonym moderation:

- Pseudonym is optional.
- It can be rejected or hidden if illegal, violent, hateful, sexually explicit, child-sexual-abuse material, doxxing, impersonation, a URL/email, or a term configured in `PSEUDONYM_BLOCKLIST`.

## 7. GitHub PR Automation

The `Create PR` button calls:

```text
POST /v1/admin/changesets/:publicId/dispatch-pr
```

The API then calls GitHub:

```text
POST /repos/{owner}/{repo}/actions/workflows/{workflow_id}/dispatches
```

Workflow inputs:

- `changeset_id`: changeset `publicId`.
- `api_url`: public `PUBLIC_URL`.

API variables required for dispatch:

```text
GITHUB_TOKEN_FOR_DISPATCH=...
GITHUB_REPOSITORY_TARGET=ablond/magium
GITHUB_WORKFLOW_FILE=translation-changeset-pr.yml
GITHUB_REF_NAME=main
PUBLIC_URL=https://magium.app
```

Recommended GitHub token:

- fine-grained personal access token;
- limited to repository `ablond/magium`;
- repository permission `Actions: Read and write`.

GitHub requires `Actions: write` for the "Create a workflow dispatch event"
endpoint:

- https://docs.github.com/rest/actions/workflows#create-a-workflow-dispatch-event

Required GitHub Actions secret in the repository:

```text
MAGIUM_TRANSLATION_API_TOKEN=<translation-api ADMIN_TOKEN value>
```

Workflow:

- file: `.github/workflows/translation-changeset-pr.yml`
- trigger: `workflow_dispatch`
- permissions: `contents: write`, `pull-requests: write`
- steps:
  1. checkout;
  2. setup Node 24 LTS + pnpm;
  3. fetch changeset through the admin API;
  4. apply changeset;
  5. `pnpm content:all`, `pnpm check`, `pnpm test`, `pnpm build`;
  6. commit, push branch `translation/<changeset_id>`, PR to `main`.

Changeset application:

- tool: `tools/contributions/apply-changeset.mjs`
- modified source: `content/story-locales/<locale>/<chapter>.json`
- for `targetType: "choice"`: replace the target choice text;
- for `targetType: "paragraph"`: replace only `segmentIndex` inside the full `messageId` value;
- preserve other paragraphs and existing separators;
- compare `currentTextHash` against current editable text;
- if the hash no longer matches, produce a stale report and have the workflow mark the changeset stale through the API.

Important:

- GitHub Actions must reach the public API URL from the Internet, therefore `https://magium.app` in production.
- `PUBLIC_URL=http://localhost:8090` does not work for a real GitHub PR.
- `GITHUB_TOKEN_FOR_DISPATCH` and `MAGIUM_TRANSLATION_API_TOKEN` are two different secrets.

## 8. Coolify Deployment

Production deployment has exactly one Coolify application plus one PostgreSQL.
The application uses the root Dockerfile, port `8080`, domain `magium.app`, no
application volume, and `/health`. The admin is available at
`https://magium.app/admin`.

Public build arguments:

```text
VITE_MAGIUM_API_URL=/
VITE_MAGIUM_TURNSTILE_SITE_KEY=...
```

Required variables:

```text
DATABASE_URL=postgres://...
ADMIN_TOKEN=...
ADMIN_PASSWORD=...
ADMIN_SESSION_SECRET=...
PUBLIC_URL=https://magium.app
TURNSTILE_SECRET_KEY=...
EMAIL_CONSENT_SECRET=...
ADMIN_COOKIE_SECURE=1
```

Optional variables, depending on enabled functions:

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

Production checklist:

- `PUBLIC_URL=https://magium.app`.
- Maintainer admin available at `https://magium.app/admin`.
- `ADMIN_COOKIE_SECURE=1` required in HTTPS production.
- `MAX_JSON_BODY_BYTES=131072` limits JSON requests before parsing.
- `TRUST_PROXY=0` remains the safe default; use `TRUST_PROXY=1` only behind a proxy that cleans `X-Forwarded-For`.
- API `TURNSTILE_SECRET_KEY` matches the PWA site key and domain `magium.app` is allowed in Cloudflare Turnstile.
- `EMAIL_CONSENT_SECRET` is long and random.
- Production `SMTP_URL` uses Brevo: `smtp://<BREVO_SMTP_LOGIN_URL_ENCODED>:<BREVO_SMTP_KEY_URL_ENCODED>@smtp-relay.brevo.com:587`.
- `EMAIL_FROM` is `Magium <no-reply@magium.app>`.
- Sender `no-reply@magium.app` or domain `magium.app` is verified in Brevo before public opening.
- `ADMIN_SESSION_SECRET` is long and random.
- `ADMIN_PASSWORD` is a strong human password.
- `ADMIN_TOKEN` is a long token reserved for scripts/workflows.
- GitHub Actions `MAGIUM_TRANSLATION_API_TOKEN` equals `ADMIN_TOKEN`.
- `GITHUB_TOKEN_FOR_DISPATCH` has `Actions: Read and write` on the target repo.
- `GITHUB_REPOSITORY_TARGET` is `ablond/magium`.

## 9. Troubleshooting

### `GitHub dispatch is not configured`

Cause: `GITHUB_TOKEN_FOR_DISPATCH` or `GITHUB_REPOSITORY_TARGET` is empty
API-side.

Fix:

```text
GITHUB_TOKEN_FOR_DISPATCH=<github-token>
GITHUB_REPOSITORY_TARGET=ablond/magium
GITHUB_WORKFLOW_FILE=translation-changeset-pr.yml
GITHUB_REF_NAME=main
```

Restart the API service after changing variables.

### `GitHub workflow dispatch failed: 401`

Likely causes:

- invalid GitHub token;
- expired token;
- token not authorized on the target repository.

Check the token in Coolify and its repository scope.

### `GitHub workflow dispatch failed: 403`

Likely causes:

- missing `Actions: Read and write` permission;
- GitHub organization blocks token use;
- workflow disabled.

Check the fine-grained PAT permissions and workflow state.

### Dispatch OK But GitHub Workflow Fails Fetching Changeset

Likely causes:

- `PUBLIC_URL` is not reachable from GitHub Actions;
- `PUBLIC_URL` points to `localhost`;
- GitHub secret `MAGIUM_TRANSLATION_API_TOKEN` is absent or differs from `ADMIN_TOKEN`;
- the Coolify proxy or access policy blocks GitHub server calls.

### `email notifications are not configured`

Cause: user requested email follow-up but neither `SMTP_URL` nor
`EMAIL_WEBHOOK_URL` is configured.

Fix: configure an email transport or leave email follow-up disabled.

### No Email Visible Locally

Check:

- `SMTP_URL=smtp://mailpit:1025` inside the API container;
- `EMAIL_FROM=Magium <no-reply@magium.app>` inside the API container;
- Mailpit reachable at `http://localhost:8025`;
- user checked email follow-up;
- mail was not skipped by already confirmed email consent.

### Brevo Rejects SMTP Authentication

Likely causes:

- wrong Brevo SMTP login;
- wrong or revoked Brevo SMTP key;
- login or key not URL-encoded in `SMTP_URL`;
- `SMTP_URL` does not point to `smtp-relay.brevo.com:587`.

Fix: regenerate/verify SMTP credentials in Brevo, store them only in Coolify,
then restart the API service.

### Brevo Rejects Sender

Likely causes:

- `EMAIL_FROM` is not `Magium <no-reply@magium.app>`;
- sender `no-reply@magium.app` is not verified;
- domain `magium.app` is not authenticated/validated in Brevo.

Fix: verify the sender or authenticate the domain in Brevo before public
activation.

### Email Missing From Brevo Transactional Logs

Check:

- production really uses Brevo `SMTP_URL`, not Mailpit;
- `EMAIL_WEBHOOK_URL` is not configured by mistake, because it takes priority over SMTP;
- user requested email follow-up;
- browser consent did not skip a new confirmation email;
- API container logs do not show an SMTP error.

### Turnstile Rejects Proposals

Check:

- PWA: `VITE_MAGIUM_TURNSTILE_SITE_KEY`;
- API: `TURNSTILE_SECRET_KEY`;
- allowed domain in Cloudflare Turnstile;
- local/test only: `TURNSTILE_DISABLED=1`.

### Old PostgreSQL Schema

Symptom: missing column error such as `current_text`, `segment_index`, or
`segment_count`.

Fixes:

- restart the unified app so ordered migrations can run;
- inspect applied migrations or start from zero locally:

```bash
docker compose exec -T postgres psql -U magium_translation -d magium_translation -c 'SELECT name, applied_at FROM magium_schema_migrations ORDER BY name'
docker compose down -v
```

### Stale Proposal

Cause: editable target text no longer matches `currentTextHash`.

Expected behavior:

- do not force application;
- mark proposal/changeset `stale`;
- ask for a new proposal if needed.

### Admin Diff Missing

Likely causes:

- old proposal without `current_text`;
- `currentText` was not sent by the older PWA;
- proposal created before visual diff was added.

Expected behavior: admin stays usable, with only proposed text and editable
final version.

## 10. Tests And Validation

Required repository validation:

```bash
pnpm check
pnpm test
pnpm build
```

If Docker, Coolify, the API, or packaging is touched:

```bash
docker compose config
pnpm docker:build-prod
```

Full local validation:

```bash
docker compose up -d --build
curl http://localhost:5173
curl http://localhost:8090/health
curl http://localhost:8090/admin
curl -H "Authorization: Bearer dev-admin-token" http://localhost:8090/v1/admin/proposals
curl http://localhost:8025
docker compose down
```

PWA browser acceptance:

- open `http://localhost:5173`;
- open Settings and enable `Translation corrections`;
- verify grey pencil icons appear on paragraphs and choices;
- click a pencil on a multi-paragraph block;
- verify only the clicked paragraph is shown and prefilled;
- verify no technical ID is visible;
- submit an anonymous proposal;
- verify success without `TR_...`, `publicId`, or receipt.

Admin browser acceptance:

- open `http://localhost:8090/admin`;
- log in with `dev-admin-password`;
- verify the proposal list;
- verify original text, proposed diff, and editable final version;
- accept/reject/mark stale;
- filter `accepted`;
- create a changeset;
- export JSON;
- test `Create PR`:
  - locally without GitHub configured: readable `GitHub dispatch is not configured`;
  - in configured production: `PR requested`, then GitHub Actions run.

Local email acceptance:

- submit a proposal with email follow-up checked;
- open `http://localhost:8025`;
- verify the confirmation email;
- click the link;
- verify the PWA returns to the reader with a visible confirmation notice;
- verify the URL no longer contains `translation-email-consent`;
- verify the PWA stores consent when the link was opened in the same browser as the initial proposal;
- submit another proposal with the same email from the same browser;
- verify no new confirmation email is sent.

Covered tests:

- `tests/contribution-payload.test.ts`: PWA payload, invisible technical fields.
- `tests/contribution-email-consent.test.ts`: browser consent.
- `tests/contribution-changesets.test.mjs`: segment application, stale, conflicts.
- `services/translation-api/tests/proposals.node.mjs`: proposal validation, currentText/hash, paragraphs.
- `services/translation-api/tests/privacy-flow.node.mjs`: email, consent, deletion.
- `services/translation-api/tests/admin-flow.node.mjs`: admin session, CSRF, changesets.
- `services/translation-api/tests/admin-diff.node.mjs`: admin diff.
- `services/translation-api/tests/unified-server.node.mjs`: same-origin static/account/contribution/admin server and migration behavior.

Do not run `pnpm images:check -- --book 1` for an iteration that does not touch
Book 1 images.

## Files To Know

- `src/App.svelte`: reader UI, contribution modal.
- `src/lib/contributions/payload.ts`: PWA payload and hash construction.
- `src/lib/contributions/storage.ts`: local opt-in profile and email consent.
- `src/lib/contributions/turnstile.ts`: Turnstile integration.
- `services/translation-api/src/server.js`: API/admin routes.
- `services/translation-api/src/database.js`: shared PostgreSQL pool and automatic migrations.
- `services/translation-api/src/account/`: account authentication, routes, and repositories.
- `services/translation-api/src/proposals.js`: proposal validation and transitions.
- `services/translation-api/src/admin-auth.js`: admin session, cookie, CSRF.
- `services/translation-api/src/admin-diff.js`: admin visual diff.
- `services/translation-api/src/email-consents.js`: email consent.
- `services/translation-api/src/mailer.js`: SMTP/webhook email.
- `services/translation-api/src/github.js`: GitHub workflow dispatch.
- `services/translation-api/migrations/`: runtime PostgreSQL migrations.
- `services/translation-api/schema.sql`: readable schema snapshot.
- `services/translation-api/admin/`: vanilla admin UI.
- `tools/contributions/apply-changeset.mjs`: JSON application and stale detection.
- `.github/workflows/translation-changeset-pr.yml`: PR automation.
- `docker-compose.yml`: full local stack.
- `docs/contributions.md`: product/functional documentation.
- `public/legal/contributions.html`: public data/contribution page.
