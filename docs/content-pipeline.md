# Content Pipeline

## Goal

Transform the original files into standard, verifiable content without losing
the ability to audit the sources.

The pipeline produces:

- an immutable raw archive;
- readable canonical JSON;
- canonical UI bundles from local translatable sources;
- canonical story i18n bundles from local translatable sources;
- compressed and verified runtime packs;
- a global content index.

Book 1 images are not part of this content pipeline. They use the manual
workflow documented in `docs/manual-images.md` and the commands
`pnpm images:prompts -- --book 1`, `pnpm images:stage -- --book 1`,
`pnpm images:normalize -- --book 1`, and `pnpm images:check -- --book 1`.
`images:stage` prepares every moment by default; `--moment <id>` and
`--chapter <id>` limit the scope. The optional OpenAI path uses
`pnpm images:refsheets -- --book 1 --missing` and
`pnpm images:generate:api -- --book 1 --missing --batch --quality high --reference-mode sheets`;
its files stay under `output/visual/` and never enter canonical content.

## Raw Archive

Path:

```text
content/archive/original/<sourceCommit>/
```

Archived content:

- `README.md`
- `LICENSE`
- `chapters/**`
- `manifest.json`

The manifest contains:

- source repository;
- requested ref (`main` by default);
- exact commit;
- import date;
- software and data license metadata;
- file list;
- size;
- SHA-256.

The current pointer is:

```text
content/archive/original/current.json
```

## GitHub Source

By default, `content:import` uses:

```text
raduprv/Magium@main
```

The script resolves `main` to an exact SHA. This is intentional: the project
benefits from upstream fixes while keeping a reproducible build.

To force another ref:

```bash
MAGIUM_SOURCE_REF=<sha-or-branch> pnpm content:import
```

To force a re-download even if the current SHA already exists:

```bash
MAGIUM_FORCE_IMPORT=1 pnpm content:import
```

## Canonical Format

Path:

```text
content/canonical/v1/
```

Main files:

```text
index.json
achievements.json
story/<chapterId>.json
locales/en/<chapterId>.json
locales/en/achievements.json
locales/en/stats.json
locales/en/ui.json
locales/fr/ch1.json
locales/fr/ch2.json
locales/fr/ch3.json
locales/fr/ch4.json
locales/fr/ch5.json
...
locales/fr/ch11b.json
locales/fr/b2ch1.json
...
locales/fr/b2ch11c.json
locales/fr/b3ch1.json
...
locales/fr/b3ch12b.json
locales/fr/achievements.json
locales/fr/stats.json
locales/fr/ui.json
```

`story/<chapterId>.json` contains logic:

- scene order;
- scenes;
- paragraph blocks with `messageId`;
- choices with `messageId`, target, explicit assignments, and special value;
- conditions as AST;
- set variables;
- achievements unlocked by scene.

Since runtime format V2, and in later versions, every assignment has this shape:

```json
{ "variable": "v_available_points", "mode": "add", "value": 3 }
```

`mode: "set"` assigns an absolute value. `mode: "add"` adds a numeric delta.
Signed source values (`+3`, `-3`) become deltas, which is required for stat
points and narrative boosts. An unsigned value such as `v_max_stat = 4`
remains an absolute assignment.

`locales/en/<chapterId>.json` contains the original texts:

- paragraphs;
- choice labels;
- achievement text embedded in a scene.

`locales/en/achievements.json` contains achievement catalog titles and captions.

## Runtime Product Adaptations

The raw archive remains a verifiable copy of upstream sources. Product
adaptations are applied after parsing, before writing canonical content and
runtime packs.

The runtime intentionally removes `Ch11b-Credits`, the old commercial screen at
the end of Book 1. `Ch11b-Ending` keeps the final narrative text and its single
button points directly to `B2-Ch01a-Intro` with `special: checkpoint_save`,
`v_b1_saved_stats = 1`, `v_chapter_save_counter = 5`, and
`v_checkpoint_rich = 1`. Payment, token, IAP, restart, and loading text from
that page must not be regenerated into runtime packs.

The Book 2 choice `Refuse the lessathi's offer` is also repaired in the runtime
graph. In the archived source, one conditional refusal branch sets the
acceptance outcome; the runtime keeps the original label and routes it to the
ordinary refusal outcome instead.

This graph correction advances the generated runtime format to V4. Saves made
before the correction recorded that false refusal as choice `c3` with the same
assignments as the lie/acceptance choice `c1`. Save replay migrates only that
exact historical event to `c1`, preserving the consequences already played
while new refusals continue to use the corrected outcome.

Editable UI sources:

```text
content/ui-locales/en.json
content/ui-locales/fr.json
```

`content:parse` copies them to
`content/canonical/v1/locales/<locale>/ui.json`, adds available locales to
`index.uiLocales`, and generates runtime packs `locales/<locale>/ui`.

Editable story i18n sources:

```text
content/story-locales/en/stats.json
content/story-locales/fr/ch1.json
content/story-locales/fr/ch2.json
content/story-locales/fr/ch3.json
content/story-locales/fr/ch4.json
content/story-locales/fr/ch5.json
...
content/story-locales/fr/ch11b.json
content/story-locales/fr/b2ch1.json
...
content/story-locales/fr/b2ch11c.json
content/story-locales/fr/b3ch1.json
...
content/story-locales/fr/b3ch12b.json
content/story-locales/fr/achievements.json
content/story-locales/fr/stats.json
```

`content:parse` copies them to `content/canonical/v1/locales/<locale>/`, adds
available story languages to `index.storyLocales`, and generates runtime packs
`locales/<locale>/<bundle>`. Chapter files must have exactly the same
`messageId` keys as `en`. Translated achievements may be partial relative to
the full catalog, but must strictly cover translated chapters for that locale.
Stats must be complete for every story locale.

Public translation corrections do not change this model. The
The contribution subsystem in the unified Magium server stores proposals only. A paragraph
correction targets one visible segment inside a `messageId`; the changeset
replaces only that segment in the complete JSON value. An accepted changeset is
applied by `tools/contributions/apply-changeset.mjs` to editable sources under
`content/story-locales/<locale>/<chapter>.json`, then the pipeline regenerates
canonical content and packs. No public endpoint may serve `content/canonical`
or `src/generated` as raw JSON.

## Conditions

`.magium` conditions are parsed into:

```json
{
  "raw": "v_strength >= 2 && v_bluff != 1",
  "anyOf": [
    {
      "allOf": [
        { "type": "comparison", "variable": "v_strength", "operator": ">=", "value": 2 },
        { "type": "comparison", "variable": "v_bluff", "operator": "!=", "value": 1 }
      ]
    }
  ]
}
```

`anyOf` represents `||`.
`allOf` represents `&&`.

`True` becomes `null`.
`False` becomes `{ "anyOf": [] }`.

`choice(...) if (...)` lines must keep four separate pieces of data: target,
assignments, `special`, and condition. The parser cuts the `if` after the final
choice parenthesis to avoid swallowing the condition into `target`, `special`,
or `setVariables`.

## Runtime Packs

Path:

```text
src/generated/
```

These files are generated by `build-canonical.mjs`.

`src/generated/contentPacks.ts` exposes a dynamic loader table. Each pack under
`src/generated/packs/` contains:

- `base64+gzip` encoding;
- SHA-256 of the compressed blob;
- size;
- encoded data.

The runtime:

1. dynamically imports the required pack;
2. decodes base64;
3. verifies SHA-256;
4. decompresses gzip;
5. parses JSON.

## Validation

`pnpm content:validate` checks:

- 54 archived `.magium` files;
- coherent scene order;
- existing targets or explicit special values;
- explicit assignments with `mode: "set" | "add"`;
- no condition `if` accidentally embedded in an assignment or `special`;
- messages present for every `messageId`;
- known achievements;
- identical UI keys between `en` and other UI locales;
- `locales/<locale>/ui` packs present in `src/generated/contentPacks.ts`;
- strict translated chapter keys against `en`;
- identical stat keys between `en` and other story locales;
- translated achievement keys for covered chapters and corresponding story packs;
- no raw `.magium` hint in `src/generated/contentPacks.ts`.

`pnpm dist:check` verifies after build:

- no `.magium` in `dist/`;
- no raw canonical JSON in `dist/`;
- no obvious raw source excerpt.

## Parser Changes

If a `.magium` file does not parse:

1. do not patch the archived file;
2. inspect the original syntax;
3. modify `tools/content/parser.mjs`;
4. add or update a test in `tests/parser.test.mjs`;
5. rerun `pnpm content:all && pnpm test`.
