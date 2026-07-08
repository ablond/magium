# Magium PWA

Modern PWA for playing Magium from the original texts in
`raduprv/Magium`.

The V1 story starts from the original English text, with all of Book 1 and
Book 2 playable in French (`ch1` through `ch11b`, then `b2ch1` through
`b2ch11c`). The FR/EN language setting drives the interface, available story
text, stat labels, achievements, and fallback to English when a translated
chapter is not available.

## Current State

- Svelte + Vite + TypeScript app, with no backend required for the playable runtime.
- Optional standalone service in `services/translation-api` for receiving and moderating public translation correction proposals.
- Content source: `raduprv/Magium@main`, resolved to the currently archived source commit.
- Raw source archive hashed under `content/archive/original/<sourceCommit>/`.
- Readable canonical JSON under `content/canonical/v1/`.
- Compressed and verified runtime packs under `src/generated/`.
- Local AES-GCM encrypted saves in IndexedDB, named local saves, and password-protected `.magium-save` export/import.
- Global achievement progress stored locally in encrypted IndexedDB, separate from the current playthrough so achievements survive restarts and checkpoint rollbacks.
- Installable PWA with service worker.
- Direct reading UI with desktop navigation rail, progressive Stats panel, Saves panel split between autosave/local saves/checkpoint/transfer, comfort settings, Illustrations toggle, About attribution, and global FR/EN language selection.
- Local Debug mode under `pnpm dev` for exploring scenes, choices, stats, and variables; debug-dirty saves stay local to the browser and cannot be exported as `.magium-save`.
- Manual ChatGPT image workflow for Book 1: character portraits and moment illustrations with public prompts under `public/visuals/book1`.
- Optional OpenAI API path for missing illustrations, using local reference sheets and Batch API, with no RAG or embeddings.

## Commands

Use Node.js 24 LTS with `pnpm@11.9.0`, matching CI and Docker builds.

```bash
pnpm install
pnpm --dir services/translation-api install --frozen-lockfile
pnpm content:all
pnpm images:prompts -- --book 1
pnpm images:stage -- --book 1
pnpm images:normalize -- --book 1
pnpm images:refsheets -- --book 1 --missing
pnpm images:check -- --book 1
pnpm images:test
pnpm check
pnpm test
pnpm build
pnpm dev --host 127.0.0.1
pnpm docker:build-prod
pnpm docker:push-prod
```

`pnpm test` also runs the Node tests for `services/translation-api`. On a fresh
checkout outside Docker Compose, install the root dependencies and the service
dependencies before running the full validation suite.

Local Docker commands:

```bash
docker compose up -d       # PWA Vite dev server, contribution API, PostgreSQL, Mailpit
docker compose down        # stop services and keep the database
docker compose down -v     # fully reset the local database
```

With the local compose stack:

- PWA: `http://localhost:5173`
- Contribution API: `http://localhost:8090`
- Maintainer admin: `http://localhost:8090/admin`
- Local Mailpit: `http://localhost:8025`
- Local admin token: `dev-admin-token`
- Local admin password: `dev-admin-password`
- PostgreSQL 18: `localhost:5432`, database/user/password `magium_translation`

The local compose stack mounts PostgreSQL 18 data at `/var/lib/postgresql`.
This layout is incompatible with the older local PostgreSQL 17 volume mounted
at `/var/lib/postgresql/data`; use `docker compose down -v` to start from a
clean local database.

Content commands:

```bash
pnpm content:import          # capture raduprv/Magium@main and archive sources
pnpm content:archive:check   # recheck archive SHA-256 values
pnpm content:parse           # regenerate canonical JSON and runtime packs
pnpm content:validate        # validate graph, messages, targets, and raw leak checks
pnpm dist:check              # verify dist after build
```

Manual Book 1 image commands:

```bash
pnpm images:prompts -- --book 1 # regenerate public Markdown prompts
pnpm images:stage -- --book 1 # stage every Book 1 moment for ChatGPT
pnpm images:stage -- --book 1 --moment ch10-pit-rescue # stage one moment
pnpm images:stage -- --book 1 --chapter ch10 # stage every moment in a chapter
pnpm images:normalize -- --book 1 # convert PNG/JPG moment images to illustration.webp and archive originals
pnpm images:refsheets -- --book 1 --missing # prepare local API reference sheets
pnpm images:generate:api -- --book 1 --missing --batch --quality high --reference-mode sheets # optional advanced OpenAI path
pnpm images:check -- --book 1   # verify public prompts and WebP structure
pnpm images:test                 # test the Book 1 image pipeline; requires ffmpeg
```

Production Docker commands:

```bash
pnpm docker:build-prod       # build the final image and validate its local runtime
pnpm docker:push-prod        # build, validate, push ghcr.io/ablond/magium:<timestamp> and :latest
```

The root `Dockerfile` lets Coolify build directly from the GitHub App with the
Dockerfile build pack. The production image exposes port `8080`, needs no
runtime environment variables, and uses no volume. Manual pushes to
`ghcr.io/ablond/magium` remain available if a prebuilt image deployment is
preferred.

If public translation contributions are enabled in production, pass
`VITE_MAGIUM_CONTRIBUTIONS_API_URL` and `VITE_MAGIUM_TURNSTILE_SITE_KEY` as PWA
Dockerfile build arguments. The API service remains a separate Coolify
application based on `services/translation-api/Dockerfile`, with PostgreSQL.

## Structure

```text
docker-compose.yml           Local PWA dev, contribution API, PostgreSQL, and Mailpit stack.
.env.example                 Optional local Docker Compose overrides.
docker/                      Runtime nginx image configuration.
content/archive/original/    Original archived sources, immutable.
content/canonical/v1/        Readable canonical JSON, generated.
content/ui-locales/          Translatable UI shell sources.
content/story-locales/       Translatable story, achievement, and stat sources.
content/schemas/             Documentation schemas.
public/visuals/book1/        Public prompts and Book 1 WebP images.
public/legal/                Public contribution, privacy, and moderation page.
src/generated/               Generated compressed runtime packs imported by the app.
services/translation-api/    Standalone translation contribution API with PostgreSQL schema.
src/lib/content/             Pack loader and integrity verification.
src/lib/contributions/       Payloads, Turnstile, and local contribution opt-in storage.
src/lib/i18n/                UI locale resolution and interpolation.
src/lib/story/               Types, game engine, conditions, stats, digest.
src/lib/storage/             IndexedDB, encryption, export/import.
tools/content/               Import, parse, pack, and validate pipeline.
tools/docker/                GHCR image build, validation, and publication.
tests/                       Parser, engine, i18n, contribution, and storage tests.
docs/                        Detailed technical documentation.
```

## Documentation

- [AGENTS.md](./AGENTS.md): priority instructions for future AI-agent iterations.
- [License and notices](./NOTICE.md): MIT application code, Magium attribution, and CC BY 4.0 content notice.
- [Contributing](./CONTRIBUTING.md): PR workflow, required checks, and generated/content rules.
- [Security](./SECURITY.md): private vulnerability reporting.
- [Architecture](./docs/architecture.md): system overview.
- [Content pipeline](./docs/content-pipeline.md): archive, parsing, canonical JSON, and runtime packs.
- [Runtime engine](./docs/runtime-engine.md): scenes, choices, conditions, stats, achievements.
- [Saves and anti-tamper](./docs/saves-and-anti-tamper.md): IndexedDB, AES-GCM, export/import, limits.
- [I18n](./docs/i18n.md): UI and narrative translation model.
- [French translation guide](./docs/translation-fr.md): glossary, criteria, and Codex-only chapter translation workflow.
- [Book 2 French QA](./docs/translation-qa-book2-fr.md): durable register, coverage, and scan record for the Book 2 French pass.
- [Public contributions](./docs/contributions.md): PWA translation corrections, batch review, and GitHub PR flow.
- [Translation contribution system](./docs/translation-contributions-system.md): full PWA/API/PostgreSQL/email/admin/GitHub/Coolify handoff reference.
- [Manual images](./docs/manual-images.md): ChatGPT Images prompts, portraits, and Book 1 illustrations.
- [Coolify deployment](./docs/deployment-coolify.md): GitHub App Dockerfile builds, optional GHCR image, and Coolify configuration.
- [Verification](./docs/verification.md): expected commands, checks, and browser scenarios.

## License And Attribution

The application code, tooling, tests, documentation, and deployment
configuration authored in this repository are released under the MIT License.
See [LICENSE](./LICENSE).

The Magium story and data imported from `raduprv/Magium` remain under the
license stated by upstream: Creative Commons Attribution 4.0 International
(CC BY 4.0). The original archives, canonical content, generated runtime packs,
and narrative translations derived from those texts are not covered by the MIT
license for this project's application code. See [NOTICE.md](./NOTICE.md).

This project is an unofficial adaptation and is not endorsed by the original
author's estate or by the Magium community maintainers.

## Translation Contributions: Quick Handoff

The playable PWA runtime stays static, but public translation corrections use a
separate `services/translation-api` service with PostgreSQL, local Mailpit, a
web admin, and a GitHub PR workflow.

Locally:

```bash
docker compose up -d --build
```

Useful URLs:

- PWA: `http://localhost:5173`
- API: `http://localhost:8090`
- Maintainer admin: `http://localhost:8090/admin`
- Mailpit: `http://localhost:8025`

Non-secret local access:

- web admin password: `dev-admin-password`
- script admin token: `dev-admin-token`

Readers can submit anonymous corrections from a visible paragraph or choice
after enabling `Translation corrections` in Settings. Pencil icons are hidden
by default, and fully absent when the contribution API URL is not configured.
Maintainers review proposals in `/admin`, compare the visual diff,
accept/reject/mark stale, create a changeset, and dispatch a GitHub PR when the
workflow is configured. The full technical reference is
[docs/translation-contributions-system.md](./docs/translation-contributions-system.md).

## Important Rules

- Never manually edit files under `content/archive/original`, `content/canonical/v1`, or `src/generated`.
- UI text is edited in `content/ui-locales/*.json`, then regenerated with `pnpm content:all`.
- Story, achievement, and stat translations are edited in `content/story-locales/<locale>/*.json`, then regenerated with `pnpm content:all`.
- Public correction proposals are never applied directly: they go through `services/translation-api`, a maintainer changeset, `tools/contributions/apply-changeset.mjs`, and a validated GitHub PR.
- Contribution follow-up emails are optional, confirmed by link, reusable for one year per browser via a local token, stored separately, and deleted after rejection or publication; optional credit pseudonyms remain moderated.
- The local compose stack provides non-secret values for contribution testing: `docker compose up -d`, PWA on `5173`, API on `8090`, web admin on `/admin`, Mailpit on `8025`, admin token `dev-admin-token`, admin password `dev-admin-password`.
- Book 1 prompts/images are managed with `pnpm images:prompts -- --book 1`, `pnpm images:stage -- --book 1`, `pnpm images:normalize -- --book 1`, `pnpm images:check -- --book 1`, then `pnpm images:test`; `--moment <id>` and `--chapter <id>` limit staging when needed. `pnpm images:test` requires `ffmpeg`. Do not add RAG or embeddings.
- The API image path is advanced and optional: `pnpm images:refsheets -- --book 1 --missing`, then `pnpm images:generate:api -- --book 1 --missing --batch --quality high --reference-mode sheets`. Keep the key in `OPENAI_API_KEY`, never in the repo. Local outputs under `output/visual/api-inputs/` and `output/visual/api-runs/` are ignored by Git.
- Book 1 portraits must remain full-body prompts with rich physical detail, clothing, equipment/anatomy, attitude, short `Canon:` facts, restrained `Design choice:` additions, and `Avoid:` guardrails.
- Book 1 illustrations are moments triggered by `sceneId`, not chapter-open images. They appear after the matching scene and may be missing during production.
- Each moment illustration must stay compatible with every path that reaches its `sceneId`; conditional scenes use a `Path compatibility` note in the image config.
- Preserve canonical image corrections: Azarius is not Felran; Molan is a fawn; Illuna and Petal are the same person; Flower and Illuna share the same body but must never be attached together to the same moment; Arraka is represented by the amulet/aura and never attached as a moment character; Eleya is the canonical fox; Taurus remains a natural animal; Barry has no crossbow before `Ch6-Packing`; his stat device must be explicitly in hand or hidden in every moment; his backpack remains ordinary before Daren enchants it and only shows glow/inventory when requested; Barry leaves without his backpack for `ch11a-beggars-district-trap` and `ch11b-*`; Daren is visible and weakened in `ch1-cutthroat-dave`; no portrait may be attached to a moment if the character is not visible in its `triggerSceneId`.
- Never put `.magium` files or raw canonical JSON in `public/`.
- Markdown under `public/visuals` is public: keep it short and paraphrased, without long excerpts from the original story.
- The runtime app must not read `.magium` files directly.
- Documentation must be maintained whenever commands, architecture, pipeline, UI, saves, i18n, deployment, or security limits change.
- Parser, engine, storage, or pipeline changes require `pnpm check`, `pnpm test`, and `pnpm build`. Book 1 image tooling, prompt, or asset changes also require `pnpm images:check -- --book 1` and `pnpm images:test`.
- Docker or deployment changes also require `pnpm docker:build-prod`; requested Docker/container image publication must go through `pnpm docker:push-prod`.
- Anti-tamper is client-side resistance, not an absolute guarantee without a backend.
- Player UI must not expose unnecessary implementation vocabulary; keep technical details in documentation.
