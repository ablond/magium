# Architecture

## Overview

The playable runtime is a static PWA. There is no backend, account system, or
cloud storage required to play, save, or replay a game.

An optional standalone service handles public translation contributions. It is
not part of the game runtime, does not serve raw canonical JSON, and never
publishes a correction without maintainer review and a GitHub PR. Its
maintainer UI is served by the API service at `/admin`, protected by a server
password, `HttpOnly` cookie, and CSRF. The reader-facing PWA remains static.

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
5. Production image
   - Vite build under Node/pnpm.
   - Only `dist/` is copied into `nginxinc/nginx-unprivileged`.
   - Static service exposed on `8080` for Coolify.
6. Translation contribution service
   - Standalone Node API under `services/translation-api`.
   - PostgreSQL storage for proposals and confirmed email contacts.
   - Batch review, GitHub Actions dispatch, and one PR per changeset.

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
  -> services/translation-api
  -> PostgreSQL proposals + optional contacts
  -> maintainer changeset
  -> .github/workflows/translation-changeset-pr.yml
  -> tools/contributions/apply-changeset.mjs
  -> content/story-locales/<locale>/<chapter>.json
  -> pnpm content:all && pnpm check && pnpm test && pnpm build
  -> GitHub pull request
```

## Technical Choices

- Svelte + Vite + TypeScript: fast static app iteration.
- No SvelteKit for now: no server routes or SSR are needed.
- Native IndexedDB: better than localStorage for encrypted blobs and CryptoKey storage.
- Global achievements: encrypted local IndexedDB collection, separate from `GameState.achievements`, so restarts/checkpoints do not lose unlocked achievements while anti-tamper replay stays strict.
- Web Crypto API: AES-GCM, PBKDF2, and SHA-256 without extra dependencies.
- Runtime packs as TS modules: no public `.json` files and lazy loading through dynamic imports.
- Global language setting: FR/EN updates UI shell, `GameState.locale`, available narrative text, achievements, and stats. Missing translated chapters fall back to `en`.
- Translation contributions: anonymous-by-default PWA form, configurable Cloudflare Turnstile, optional confirmed email, optional credit pseudonym, separate API, one GitHub PR per changeset.
- Book 1 images: manual ChatGPT workflow, no RAG, no embeddings. Public prompts stay short and paraphrased; portraits live under `public/visuals/book1/characters`, displayable illustrations under `public/visuals/book1/moments`.
- Production Docker: the root `Dockerfile` is compatible with Coolify's Dockerfile build pack through the GitHub App. The builder runs `pnpm build`; the runtime stage contains only public `dist/` assets and exposes `8080`.

## Code Landmarks

- Main UI: `src/App.svelte`
- Global styles: `src/app.css`
- UI i18n sources: `content/ui-locales/*.json`
- Story i18n sources: `content/story-locales/**/*.json`
- Contribution API: `services/translation-api`
- Contribution maintainer UI: `services/translation-api` on `/admin`
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
- Production Docker: `Dockerfile`, `docker/nginx.conf`, `tools/docker/build-prod-push.sh`

## Important Contracts

- `content/archive` and `content/canonical` are not runtime assets.
- `public/` must contain only public, non-sensitive assets.
- Markdown prompts under `public/visuals` are public: no long story excerpts, no sensitive data, no API key.
- The build must not expose `.magium` files.
- The app may display original story text, but it must come from runtime packs and not from a directly downloadable raw file.
- The PWA may send a correction proposal to the API, but the API must never become a runtime translation source. The final source remains `content/story-locales/**` after PR.
- Contribution emails are temporary personal data: optional, confirmed before notification, not public, and deleted after grouped rejection/stale/publication notification.
- Canonical UI JSON follows the same rule: the app loads compressed `locales/<locale>/ui` packs, not raw JSON files.
- Canonical story i18n JSON follows the same rule: the app loads compressed `locales/<locale>/<bundle>` packs, not raw JSON files.
- The final Docker image must serve only `dist/`; it must not contain `content/archive`, `content/canonical`, `node_modules`, `.env*`, `.magium-save` exports, or `.magium` sources.
- The engine stores choices and stat allocations in typed `history` events, then validates imports by replay.
- Canonical assignments declare `mode: "set"` or `mode: "add"`; the runtime must not reinterpret deltas from raw strings.
