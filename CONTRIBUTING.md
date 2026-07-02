# Contributing

Thanks for helping improve this Magium PWA. Contributions are welcome through
pull requests, with maintainer review required before merge.

## Before You Start

- Open an issue first for broad product, architecture, legal, save-format, or
  content-pipeline changes.
- Keep PRs focused and explain the user-visible behavior being changed.
- Do not commit secrets, `.env*` files, local save exports, API outputs, or
  generated image run artifacts.
- Do not send Magium source text to external translation services or API-based
  translators unless a maintainer explicitly approves that workflow.

## Local Setup

```bash
pnpm install
pnpm --dir services/translation-api install --frozen-lockfile
pnpm content:all
pnpm check
pnpm test
pnpm build
```

The default test suite intentionally excludes the manual Book 1 image pipeline
tests because they require `ffmpeg`.

## Generated And Immutable Files

Do not edit these paths by hand:

- `content/archive/original/**`
- `content/canonical/v1/**`
- `src/generated/**`

To change runtime content, edit the relevant source files or scripts, then run:

```bash
pnpm content:all
```

Editable source content includes:

- `content/ui-locales/*.json`
- `content/story-locales/**/*.json`

## Images

If a PR touches Book 1 image prompts, image tooling, or public image assets, run:

```bash
pnpm images:check -- --book 1
pnpm images:test
```

Do not add RAG, embeddings, long story excerpts, source `.magium` files, or raw
canonical JSON to public image assets.

## Translation Contributions

Public translation corrections should go through the contribution workflow:

1. Submit or review proposals through `services/translation-api`.
2. Group accepted proposals into a maintainer changeset.
3. Apply the changeset to `content/story-locales/<locale>/<chapter>.json`.
4. Regenerate content and open a validated PR.

Do not create one PR per public proposal.

## Pull Request Checklist

Before opening a PR:

- Run `pnpm check`.
- Run `pnpm test`.
- Run `pnpm build`.
- Update documentation when behavior, commands, architecture, UI, saves, i18n,
  deployment, or security limits change.
- Run image checks when image prompts/assets/tooling change.
- Confirm the PR does not include secrets or local-only files.
