# AGENTS.md

This file is the entry point for any AI agent resuming work on the project.

## Product Goal

Build a playable Magium PWA from the original texts, with:

- archived and verifiable original content;
- a runtime that does not serve `.magium` files or raw canonical JSON;
- a client-side game engine;
- prepared multi-language i18n;
- encrypted local saves that can be exported without an account;
- optional username/password accounts with client-encrypted cross-device save synchronization;
- an immersive dark arcane interface, readable on mobile and desktop.

## Current State To Respect

- The content source of truth is `raduprv/Magium@main`, captured at the current commit in `content/archive/original/current.json`.
- `.magium` files are archived for audit and regeneration, but are never read directly by the app.
- The runtime reads only generated packs under `src/generated`.
- These packs are compressed, encoded, split by chapter/language, and verified by SHA-256 before decompression.
- The pipeline keeps the original archive intact, but applies runtime product adaptations. `Ch11b-Credits`, the old commercial screen at the end of Book 1, is removed from runtime packs; `Ch11b-Ending` must offer a direct transition to Book 2 through a checkpoint.
- Source UI text lives in `content/ui-locales/en.json` and `content/ui-locales/fr.json`, then is generated into runtime packs `locales/<locale>/ui`.
- Narrative translation sources live in `content/story-locales/<locale>/*.json`, then are generated into runtime packs `locales/<locale>/<bundle>`.
- The French narrative currently covers every available chapter of Book 1, Book 2, and Book 3, from `ch1` through `b3ch12b`, together with all 136 achievement titles and captions.
- The Settings language choice drives `settings.uiLocale`, `settings.locale`, and `GameState.locale`. A chapter missing in the selected locale falls back to `en`.
- The PWA can offer a translation correction from a visible paragraph or choice. Pencil icons are hidden by default and appear only when the unified API URL is configured and the reader enables `settings.translationContributions` in Settings. For narrative text, the player target is the displayed paragraph (`segmentIndex` in the `messageId`), not the complete multi-paragraph block. A contribution never directly modifies runtime or source files.
- Public corrections are anonymous by default. Pseudonym and email are optional; pseudonym is used only for requested credits and remains moderated, while email is used only for confirmed follow-up and must be deleted after rejection or publication.
- An accepted proposal must be grouped into a maintainer changeset, applied to `content/story-locales/<locale>/<chapter>.json`, regenerated with `pnpm content:all`, validated, and delivered by GitHub PR. Never create one PR per individual proposal.
- Book 1 images use a primary manual ChatGPT workflow: portraits, moment prompts, and WebP files under `public/visuals/book1`, with no RAG or embeddings. An optional OpenAI API path exists only to finish missing illustrations through local reference sheets and Batch API.
- The Settings toggle `settings.illustrations` displays moment illustrations after the trigger scene when they exist. Some shared `sceneId` values can choose a conditional variant with game variables, for example `Ch11b-Ending` based on `v_ch11_saved_rose`.
- The Debug panel exists only under `pnpm dev` / `import.meta.env.DEV` to explore scenes, choices, stats, and variables. A state marked `debug.dirty` can be saved locally, but must never be exportable as `.magium-save`.
- Saves are stored in IndexedDB as AES-GCM encrypted data, not plaintext localStorage.
- The global achievement collection is also stored in IndexedDB as AES-GCM encrypted data, separate from `GameState.achievements`. `GameState.achievements` remains the replayable state of the current playthrough and can roll back with restart/checkpoint.
- The Saves panel must remain player-facing: autosave, named/renamable local saves, checkpoint, then transfer. Do not show `slotId`, raw scene IDs, `route`, `prod`, `local-key`, or `pbkdf2` in the player UX.
- Local saves do not ask for a password. `.magium-save` export/import asks for a password only in the dedicated flow after clicking Export or Import.
- Accounts are optional and use only an identifier plus password. There is no email, password recovery, password change, account deletion, social login, or device management in V1.
- The unified server under `services/translation-api` serves the PWA, account routes, contribution routes, and admin from one process. One shared PostgreSQL keeps account and translation tables logically separated.
- Cloud synchronization covers non-debug autosave/named saves, deletion tombstones, and global achievements. Every downloaded save must pass replay/migration before local storage. Network failures must never block local saving.
- Replay migrates the exact historical Book 2 false-refusal event (`B2-Ch02a-Soundproof:c3` with `v_b2_ch2_deal = 1`) to the equivalent lie/acceptance event `c1` before validation. Keep this migration exact, verify the original history digest first, and do not broaden it to arbitrary saved assignments.
- localStorage must contain only non-critical UI preferences.

## Required Verification Commands

Before considering an iteration complete:

```bash
pnpm check
pnpm test
pnpm build
```

If an iteration touches Book 1 prompts, assets, or image display, also run:

```bash
pnpm images:check -- --book 1
pnpm images:test
```

`pnpm images:test` covers Vitest tests for the Book 1 image pipeline, including
reference sheets and OpenAI Batch JSONL. It requires `ffmpeg` and is not
included in `pnpm test`, so translation workflows do not depend on image tools.

`pnpm build` also runs:

- `pnpm content:all`
- `vite build`
- `pnpm dist:check`

`dist:check` must stay green: no `.magium`, no raw canonical JSON, and no
obvious raw source excerpt in `dist/`.

If an iteration touches Docker, Coolify, or production packaging, also run:

```bash
pnpm docker:build-prod
```

If the objective asks for Docker/container image publication, continue through:

```bash
pnpm docker:push-prod
```

The manually published container image is `ghcr.io/ablond/magium`, with a UTC timestamp
tag `YYYYMMDD-HHMMSS` and `latest`. The main Coolify deployment may also build
the root `Dockerfile` directly through the GitHub App.

To verify the local Docker stack, use `docker compose up -d --build`, then test
`http://localhost:5173`, `http://localhost:8090/health`, registration/login/sync,
one public proposal, and an admin route with the local token `dev-admin-token`.
`docker compose down -v` resets the local PostgreSQL database.

## Required Documentation

Documentation is part of the product. It must be maintained, corrected, and
synchronized at every iteration.

If a change modifies a command, flow, file structure, security limit, UI
behavior, content pipeline, i18n model, or save behavior, update documentation
in the same change.

Do not leave known documentation false, incomplete, or ambiguous. If
verification shows that documentation no longer matches real behavior, correct
the documentation before finishing.

Priority files:

- `README.md` for overview and commands;
- `AGENTS.md` for AI-agent handoff instructions;
- `docs/architecture.md` for system decisions;
- `docs/content-pipeline.md` for import, parsing, canonicalization, and packs;
- `docs/runtime-engine.md` for the engine;
- `docs/saves-and-anti-tamper.md` for storage, encryption, and limits;
- `docs/accounts-and-cloud-saves.md` for account, session, client encryption, sync, conflict, and recovery limits;
- `docs/i18n.md` for the translation model;
- `docs/contributions.md` for public proposals, privacy, review API, and changesets;
- `docs/translation-contributions-system.md` as the exhaustive technical handoff for the translation contribution subsystem, including PWA, API, PostgreSQL, Mailpit, email double opt-in, maintainer admin, diff, changesets, GitHub PR workflow, local Docker, and Coolify;
- `docs/manual-images.md` for manual ChatGPT portraits, illustrations, and prompts;
- `docs/deployment-coolify.md` for Docker, GHCR, and Coolify;
- `docs/verification.md` for expected checks.

## Generated Or Immutable Files

Do not edit by hand:

- `content/archive/original/**`
- `content/canonical/v1/**`
- `src/generated/**`

To change those files, modify scripts under `tools/content/`, then run:

```bash
pnpm content:all
```

Source exceptions: `content/ui-locales/*.json` and
`content/story-locales/**/*.json` are editable by hand. Copies under
`content/canonical/v1/locales/**` and packs under `src/generated` remain
generated.

Image exception: `public/visuals/book1/**/portrait.md` and
`public/visuals/book1/**/illustration.md` are generated by
`pnpm images:prompts -- --book 1`, then may be adjusted manually. Matching WebP
files are added manually after ChatGPT Images generation, or occasionally
through the optional API path documented in `docs/manual-images.md`.

## Docker And Coolify Packaging

- The production Dockerfile is at the repository root for Coolify's Dockerfile build pack through GitHub App. It builds the PWA, then packages `dist/` and the unified Node server in one image exposed on port `8080`.
- The root Dockerfile embeds `VITE_MAGIUM_API_URL=/` and accepts the public `VITE_MAGIUM_TURNSTILE_SITE_KEY` build arg. All secrets remain runtime variables.
- Coolify runtime can build from the repository. `pnpm docker:push-prod` remains an optional path for publishing a prebuilt image `ghcr.io/ablond/magium`.
- Production is exactly one Magium application plus one external PostgreSQL. The application runs automatic idempotent migrations at startup and refuses to start without `DATABASE_URL` in production.
- The local compose stack runs the PWA in Vite dev mode, the unified app, one PostgreSQL, and Mailpit. Local values are non-secret and must not be copied to production.
- Do not copy `content/archive`, `content/canonical`, source `src/generated`, `.env*`, or `.magium-save` exports into the final image. Production server dependencies may remain, but public static serving must be restricted to `dist/`.
- `.dockerignore` must exclude sensitive or bulky local files, but must not break `pnpm build` in the builder stage.
- `tools/docker/build-prod-push.sh` validates the image filesystem, starts the container, tests `/`, `/sw.js`, `/manifest.webmanifest`, and SPA fallback before push.
- Coolify must use the root Dockerfile build pack, exposed port `8080`, no application volume, one `magium.app` domain, and one PostgreSQL `DATABASE_URL`. If deployment uses the private GHCR package instead of the GitHub App build, authenticate the Coolify server with `docker login ghcr.io`.

## Content Pipeline

Expected order:

1. `content:import`
   - resolve `raduprv/Magium@main` to an exact SHA;
   - archive `README.md`, `LICENSE`, `chapters/**`;
   - generate `manifest.json` with sizes and SHA-256;
   - verify that there are 54 `.magium` files.
2. `content:archive:check`
   - reread the archive and compare hashes.
3. `content:parse`
   - parse `.magium` files;
   - write the logic graph to `content/canonical/v1/story`;
   - write English messages to `content/canonical/v1/locales/en`;
   - copy UI bundles from `content/ui-locales` to `content/canonical/v1/locales/<locale>/ui.json`;
   - copy narrative translations from `content/story-locales` to `content/canonical/v1/locales/<locale>/`;
   - generate TS runtime packs under `src/generated`.
4. `content:validate`
   - verify messages, targets, achievements, scene map, strict UI/story/stat key coverage, generated packs, and no raw leak in generated packs.

## Public Translation Contributions

Before modifying this subsystem, read `docs/translation-contributions-system.md`.
It is the handoff reference for routes, environment variables, PostgreSQL
schema, statuses, email, admin, changesets, GitHub dispatch, local Docker, and
Coolify. `docs/contributions.md` remains the product/functional view.

- When `settings.translationContributions` is enabled and the API URL is configured, the PWA shows discreet pencil icons on visible paragraphs and choices. The player modal must display and prefill only the clicked paragraph; choices are still corrected as a whole. Do not show the player `messageId`, `sceneId`, `chapterId`, `contentVersion`, `segmentIndex`, hash, or other routing detail.
- PWA build variables are `VITE_MAGIUM_API_URL` and `VITE_MAGIUM_TURNSTILE_SITE_KEY`.
- The unified server exposes `/health`, uses one PostgreSQL in production, and can run locally with `docker compose up -d`. It must not serve canonical files or generated packs as public JSON.
- The documented default captcha is Cloudflare Turnstile in invisible/non-interactive mode, with required API-side Siteverify validation. `TURNSTILE_DISABLED=1` is only for dev/test.
- Admin routes must stay protected by `ADMIN_TOKEN` for scripts, or by the `/admin` maintainer web session with `HttpOnly` cookie and CSRF for mutating actions. Local compose uses `dev-admin-token` and `dev-admin-password`, non-secret values that are forbidden in production.
- A public proposal remains in the database until review. The maintainer can accept, reject, or mark stale; acceptance produces an editable final version, not an automatic merge.
- Competing proposals for the same choice or same `locale/chapterId/messageId/segmentIndex` must be resolved in the review tool. A changeset may contain several corrections for the same `messageId` if `segmentIndex` differs.
- Maintainer admin may display `currentText` and a visual diff to help review, but only the retained final version is editable and integrated into the changeset. Older proposals without `currentText` must remain viewable without a diff.
- `tools/contributions/apply-changeset.mjs` rejects a changeset if `currentTextHash` no longer matches the current editable source text. For a paragraph, compare the target segment hash and replace only that segment in the complete JSON value. Mark the changeset/proposals `stale` instead of forcing.
- `.github/workflows/translation-changeset-pr.yml` must run `pnpm content:all`, `pnpm check`, `pnpm test`, and `pnpm build` before creating the PR. `pnpm test` excludes manual Book 1 tests that generate WebP files with `ffmpeg`.
- Follow-up emails must stay separate from public proposals, confirmed by token, hidden from public admin/PR surfaces, and deleted after rejection, stale, or publication. Follow-up consent is reusable for one year per browser through a local token; server-side, store only an email HMAC and token hash for this consent, never the raw email.
- Credit pseudonyms are public only if requested by the contributor and approved by the maintainer. Reject or hide illegal, violent, hateful, sexually explicit, child-sexual-abuse, doxxing, impersonation, or clearly inappropriate pseudonyms.
- The public page `/legal/contributions.html` must stay coherent with this behavior. Complete the public instance legal notices before public activation.

## Manual Book 1 Image Pipeline

Expected order:

1. `pnpm images:prompts -- --book 1`
   - reads canonical English Book 1 text;
   - verifies manual anchors in `tools/images/book1-config.mjs`, including descriptions before name reveal;
   - writes short Markdown prompts under `public/visuals/book1`.
2. Review/correct public prompts.
3. Generate portraits in ChatGPT Images, then save `portrait.webp`.
4. To prepare ChatGPT folders, run `pnpm images:stage -- --book 1`. The command stages every Book 1 moment by default; use `--moment <moment-id>` or `--chapter <chapter-id>` to limit scope.
5. Attach renamed portraits from `output/visual/staging/book1/<moment-id>/references/` in ChatGPT, paste `prompt.md`, then save `illustration.webp` under `public/visuals/book1/moments/<moment-id>/`.
6. If PNG/JPG files were added from ChatGPT, run `pnpm images:normalize -- --book 1` to create `illustration.webp` and archive originals.
7. For the optional API path: `pnpm images:refsheets -- --book 1 --missing`, then `OPENAI_API_KEY=... pnpm images:generate:api -- --book 1 --missing --batch --quality high --reference-mode sheets`. Retrieve the batch with the `--retrieve` command printed by the script.
8. `pnpm images:test`
   - requires `ffmpeg`;
   - verifies prompts, character references, API reference sheets, and OpenAI Batch JSONL;
   - remains separate from `pnpm test` so non-image workflows do not require `ffmpeg`.
9. `pnpm images:check -- --book 1`
   - verifies public structure;
   - rejects `evidenceRefs`, RAG, embeddings, `.magium` markers, old `chapters` folders, and long canonical text copies;
   - accepts missing WebP files during production.

Do not add RAG or embeddings. Never commit an API key; `OPENAI_API_KEY` must
stay in the local environment. API manifests and sheets under
`output/visual/api-inputs/` and `output/visual/api-runs/` are local and ignored
by Git.

To enrich portraits or moments, follow `docs/manual-images.md`. Every Book 1
character must keep the detail level applied to Barry and Daren: short
canonical anchors, explicit `Canon:` / `Design choice:` / `Avoid:` separation,
full-body portrait, visible equipment or anatomy, and restrained realistic
fantasy style. Moments must describe place, architecture, materials, anonymous
characters, composition, equipment continuity, and multi-path compatibility
when the scene contains conditions. Preserve verified canonical corrections:
Azarius is not Felran, Molan is a fawn, Illuna and Petal are the same person,
Flower and Illuna share the same body but must never be attached together to
the same moment, Arraka is represented by the amulet/aura and never attached as
a moment character, Eleya is the canonical fox, Taurus remains a natural
animal, Barry has no crossbow before `Ch6-Packing`, his stat device must be
explicitly in hand or hidden in every moment, his backpack remains ordinary
before Daren enchants it and shows glow/inventory only when requested, Barry
leaves without a backpack for `ch11a-beggars-district-trap` and `ch11b-*`,
Daren is visible and weakened in `ch1-cutthroat-dave`, `Ch11b-Ending` must use
the no-Rose variant when `v_ch11_saved_rose` is not `1`, and no portrait may be
attached to a moment if the character is not visible in its `triggerSceneId`.

## Architecture Invariants

- The logic graph must not depend on a language.
- Images do not modify the logic graph, saves, or anti-cheat replay.
- Moment illustrations are resolved by a static `sceneId -> moment` map, with possible conditional variants by game variables, and hidden if the WebP is missing.
- Future translations must never modify:
  - scene IDs;
  - choice targets;
  - variable names;
  - conditions;
  - assignments;
  - specials;
  - achievement variables.
- Adding a language means adding messages for the same `messageId` keys.
- Runtime fallback is `en`.
- Runtime chunks must remain lazy-loaded by chapter/language.
- Displayed stats and achievements must follow `GameState.locale`, with English fallback when a bundle is absent.
- Canonical assignments are explicit: `mode: "set"` replaces, `mode: "add"` increments. Signed source values `+N` / `-N` are deltas.
- `v_max_stat` drives the manual stat cap (`3` by default, `4` when original content defines it). Narrative boosts may exceed this cap, but UI allocation may not.
- `history` contains typed `choice` and `stats` events; replay must verify stat allocations, available points, and caps.

## Anti-Cheat And Saves

Realistic goal: resistance and detection, not absolute security.

Constraints:

- use IndexedDB for saves;
- encrypt with Web Crypto AES-GCM;
- keep global achievements in an encrypted store separate from saves;
- authenticate data through AES-GCM additionalData;
- maintain a chained `historyDigest`;
- verify import and compatible content-version upgrades by replaying the path;
- also replay stat allocations;
- reject a decrypted save if its state does not match a playable path;
- keep account bearer tokens encrypted in IndexedDB and store only their hashes on the server;
- encrypt every cloud record in the browser with account-derived AES-GCM and record-specific additionalData;
- keep `debug.dirty` states out of cloud synchronization;

Do not:

- store variables/stats/achievements in plaintext;
- add a localStorage fallback for game data;
- feed global achievements from a `debug.dirty` state;
- accept an import only because it decrypts;
- send plaintext game states, histories, variables, save labels, or achievement identifiers to account routes.

## UI / UX

First view = playable experience, not a landing page.

Direction:

- dark, arcane, epic fantasy;
- text first;
- compact controls;
- readable on mobile;
- no decoration that breaks reading;
- no text overlapping containers.

After UI changes, verify at least:

- desktop 1280 x 720;
- mobile around 390 x 844;
- scene with a long paragraph;
- scene starting with `...`;
- stat check result after a narrative choice, localized FR/EN;
- Saves panel with optional account registration/login/sync, autosave, local saves, renaming, checkpoint, export/import with password shown only in the transfer flow;
- Stats panel before/after reveal, allocation, max 3 then 4, aura stats;
- achievements panel, including keeping a death achievement after checkpoint rollback or new game;
- settings/about panels;
- Debug panel visible only in dev and absent from production build, with scene jump, hidden choices, stat/variable editing, undo/redo, and export blocked after debug modification;
- Illustrations toggle and present/missing moment image;
- FR/EN language switch without resetting the game, with story and stats translated when the pack exists.

## Known Pitfalls

- The Vite dev server can see `src/generated` change during `content:all` and produce temporary HMR errors. If this happens, reload the page after regeneration. The clean build remains the reference.
- `content:import` takes the current `main`, then pins the exact SHA in the manifest. It is not an old historical commit.
- Original `logic.txt` files can help audit behavior, but the main runtime source is `.magium`.
- The game engine and validation remain client-side even when optional accounts are enabled. A determined user with DevTools can patch executed code; do not promise absolute anti-cheat merely because ciphertext is synchronized through a backend.

## Logical Next Iterations

- Chapter/book selection UI.
- Browser automation tests for post-choice stat check results.
- Narrative i18n workflow: XLIFF/JSON translation export, import, coverage report.
- Browser automation tests for export/import and offline behavior.
- Browser automation tests for replay-compatible save import after a `contentVersion` change.
