# Architecture

## Overview

The playable runtime remains a local-first PWA: no account or network is
required to play, save, or replay. In production, one Node server serves the
built PWA plus optional accounts, cloud synchronization, translation
contributions, and the maintainer admin. One external PostgreSQL stores both
feature families in separate tables.

The system is split into these layers:

1. Archived sources
   - Original `.magium` files and associated upstream data.
   - Kept for audit, regeneration, and provenance.
2. Canonical content
   - Readable normalized JSON generated from sources.
   - Separates story logic, narrative messages, and UI messages.
3. Runtime packs
   - Generated TypeScript modules containing `base64+gzip` blobs.
   - Loaded dynamically by chapter and language.
   - Verified by SHA-256 before use.
4. Application
   - Scene engine.
   - I18n.
   - Encrypted local storage.
   - PWA UI.
   - Optional display of Book 1 moment illustrations.
5. Production server
   - Vite build and one Node runtime image exposed on `8080`.
   - Same-origin PWA, account routes, contribution routes, `/admin`, and `/health`.
   - Automatic idempotent PostgreSQL migrations.
6. PostgreSQL
   - `translation_*` tables for proposals, contacts, consents, and changesets.
   - `user_*` tables for scrypt password hashes, hashed sessions, and opaque encrypted records.
   - Independent Coolify resource with its own backups and lifecycle.

## Data Flow

```text
raduprv/Magium@main
  -> tools/content/import-original.mjs
  -> content/archive/original/<sha>/
  -> tools/content/build-canonical.mjs
  -> content/canonical/v1/
  -> src/generated/
  -> src/lib/content/packedContent.ts
  -> src/lib/story/engine.ts
  -> src/App.svelte

content/ui-locales/*.json
  -> tools/content/build-canonical.mjs
  -> content/canonical/v1/locales/<locale>/ui.json
  -> src/generated/packs/locales__<locale>__ui.ts
  -> src/lib/i18n/ui.ts
  -> src/App.svelte

content/story-locales/<locale>/*.json
  -> tools/content/build-canonical.mjs
  -> content/canonical/v1/locales/<locale>/
  -> src/generated/packs/locales__<locale>__*.ts
  -> src/lib/content/packedContent.ts
  -> src/App.svelte

content/canonical/v1/{locales/en,story}/ch*.json
  -> tools/images/generate-prompts.mjs
  -> public/visuals/book1/**/{portrait,illustration}.md
  -> tools/images/stage-chatgpt.mjs
  -> output/visual/staging/book1/<moment-id>/
  -> manual ChatGPT Images generation
  -> public/visuals/book1/**/*.webp
  -> src/lib/visuals/book1.ts
  -> src/App.svelte

PWA contribution form
  -> same-origin Magium server
  -> shared PostgreSQL translation tables + optional contacts
  -> maintainer changeset
  -> .github/workflows/translation-changeset-pr.yml
  -> tools/contributions/apply-changeset.mjs
  -> content/story-locales/<locale>/<chapter>.json
  -> pnpm content:all && pnpm check && pnpm test && pnpm build
  -> GitHub pull request

PWA account section
  -> same-origin Magium server registration/login
  -> PBKDF2 account key in the browser
  -> AES-GCM save and achievement records
  -> PostgreSQL opaque sync records
  -> another browser login
  -> local decryption + replay validation
  -> encrypted IndexedDB saves
```

## Technical Choices

- Svelte + Vite + TypeScript: fast static app iteration.
- No SvelteKit for now: no server routes or SSR are needed.
- Native IndexedDB: better than localStorage for encrypted blobs and CryptoKey storage.
- Global achievements: encrypted local IndexedDB collection, separate from `GameState.achievements`, so restarts/checkpoints do not lose unlocked achievements while anti-tamper replay stays strict.
- Web Crypto API: AES-GCM, PBKDF2, and SHA-256 without extra dependencies.
- Accounts: optional username/password service; server passwords use salted `scrypt`, raw session tokens are stored only by the client, and PostgreSQL keeps only token hashes.
- Cloud saves: one browser-derived non-exportable AES-GCM key per account, per-record encryption with associated data, per-save last-write-wins merge, deletion tombstones, and replay validation after download.
- Runtime packs as TS modules: no public `.json` files and lazy loading through dynamic imports.
- Global language setting: FR/EN updates UI shell, `GameState.locale`, available narrative text, achievements, and stats. Missing translated chapters fall back to `en`.
- Translation contributions: anonymous-by-default PWA form, configurable Cloudflare Turnstile, optional confirmed email, optional credit pseudonym, one GitHub PR per changeset.
- Book 1 images: manual ChatGPT workflow, no RAG, no embeddings. Public prompts stay short and paraphrased; portraits live under `public/visuals/book1/characters`, displayable illustrations under `public/visuals/book1/moments`.
- Production Docker: the root `Dockerfile` builds the PWA and one Node runtime. The runtime serves only `dist/` as public files, exposes `8080`, and connects to one external PostgreSQL.

## Code Landmarks

- Main UI: `src/App.svelte`
- Global styles: `src/app.css`
- UI i18n sources: `content/ui-locales/*.json`
- Story i18n sources: `content/story-locales/**/*.json`
- Unified production server, account modules, migrations, and maintainer UI: `services/translation-api`
- Account client and synchronization: `src/lib/account/*.ts`
- Translation changeset application: `tools/contributions/apply-changeset.mjs`
- UI i18n helper: `src/lib/i18n/ui.ts`
- Runtime loader: `src/lib/content/packedContent.ts`
- Engine: `src/lib/story/engine.ts`
- Stats: `src/lib/story/stats.ts`
- Conditions: `src/lib/story/conditions.ts`
- Types: `src/lib/story/types.ts`
- Saves: `src/lib/storage/saves.ts`
- Global achievement progress: `src/lib/storage/achievementProgress.ts`
- Encryption: `src/lib/storage/crypto.ts`
- Content pipeline: `tools/content/*.mjs`
- Manual image pipeline: `tools/images/*.mjs`, `public/visuals/book1`
- Production Docker: `Dockerfile`, `tools/docker/build-prod-push.sh`

## Important Contracts

- `content/archive` and `content/canonical` are not runtime assets.
- `public/` must contain only public, non-sensitive assets.
- Markdown prompts under `public/visuals` are public: no long story excerpts, no sensitive data, no API key.
- The build must not expose `.magium` files.
- The app may display original story text, but it must come from runtime packs and not from a directly downloadable raw file.
- The PWA may send a correction proposal to the API, but the API must never become a runtime translation source. The final source remains `content/story-locales/**` after PR.
- The PWA may use the same-origin account routes for optional synchronization, but local play and local saves must remain functional when the server is absent or offline.
- Account routes must never receive plaintext `GameState`, variables, history, save labels, or achievement identifiers. They store independently encrypted records only.
- Cloud saves must pass replay/migration validation before entering the local save store. `debug.dirty` saves must never be synchronized.
- Contribution emails are temporary personal data: optional, confirmed before notification, not public, and deleted after grouped rejection/stale/publication notification.
- Canonical UI JSON follows the same rule: the app loads compressed `locales/<locale>/ui` packs, not raw JSON files.
- Canonical story i18n JSON follows the same rule: the app loads compressed `locales/<locale>/<bundle>` packs, not raw JSON files.
- The final Docker image may contain production server dependencies, but public static serving is restricted to `dist/`. It must not contain `content/archive`, `content/canonical`, `.env*`, `.magium-save` exports, or `.magium` sources.
- The engine stores choices and stat allocations in typed `history` events, then validates imports by replay.
- Canonical assignments declare `mode: "set"` or `mode: "add"`; the runtime must not reinterpret deltas from raw strings.
