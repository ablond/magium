# Manual Book 1 Images

## Goal

The primary workflow intentionally stays manual and simple:

- no RAG;
- no automatic generation in CI;
- public paraphrased Markdown prompts;
- final portraits and illustrations stored once under `public/visuals/book1`.

An optional OpenAI API path exists only to finish missing illustrations. It
uses `gpt-image-2`, local reference sheets, and `OPENAI_API_KEY` from the
environment. It does not replace the manual workflow and must not run in CI.

Portraits are visual references. Displayable illustrations are no longer tied
to an entire chapter: they illustrate precise Book 1 moments and are shown
after the trigger scene, avoiding chapter-opening spoilers.

## Structure

```text
public/visuals/book1/
  characters/<character-id>/
    portrait.md
    portrait.webp
  moments/<moment-id>/
    illustration.md
    illustration.webp
```

`portrait.webp` and `illustration.webp` may be temporarily missing. Prompts
must exist and stay public, with short citation-like anchors and no long
excerpts from the original text.

Old `public/visuals/book1/chapters/` folders are no longer valid.
`pnpm images:check -- --book 1` rejects them to prevent returning to the
spoiler-prone "one image per chapter" model.

## Commands

```bash
pnpm images:prompts -- --book 1
pnpm images:stage -- --book 1
pnpm images:stage -- --book 1 --moment ch10-pit-rescue
pnpm images:stage -- --book 1 --chapter ch10
pnpm images:stage -- --book 1 --all
pnpm images:normalize -- --book 1
pnpm images:refsheets -- --book 1 --missing
pnpm images:generate:api -- --book 1 --missing --batch --quality high --reference-mode sheets
pnpm images:check -- --book 1
pnpm images:test
```

`images:prompts` reads canonical English Book 1 text, verifies manual portrait
anchors and moment `triggerSceneId` values, then regenerates public Markdown
under `public/visuals/book1`.

`images:stage` copies to `output/visual/staging/book1/<moment-id>/`:

- `prompt.md`;
- `README.md`;
- `references/<character-id>.webp` for every portrait to attach in ChatGPT.

`images:normalize` converts PNG/JPG moment files placed in
`public/visuals/book1/moments/<moment-id>/` to `illustration.webp`, then
archives originals under `output/visual/originals/book1/moments/`.

`images:refsheets` creates non-public reference sheets under
`output/visual/api-inputs/book1/<moment-id>/`, with up to four portraits per
sheet and no embedded text. The manifest maps each position to a character.
This command requires `ffmpeg`.

`images:generate:api` is the advanced OpenAI path. By default, with `--batch`,
it prepares and submits a `/v1/images/edits` batch; the command then prints the
retrieval command to rerun after the batch completes. `--quality high` is the
premium quality choice for the API, and `--quality medium` remains available to
reduce cost. `--sync` uses the direct multipart endpoint when a batch is not
wanted.

`images:check` verifies structure and rejects old `evidenceRefs`, RAG,
embeddings, `.magium`, old `chapters` paths, raw source paths, and long copies
of canonical text. Missing `illustration.webp` files are accepted to allow
progressive production.

`images:test` runs the Book 1 image pipeline tests, separate from `pnpm test`
so non-image workflows do not require `ffmpeg`. It covers prompts, ChatGPT
staging, API reference sheets, and OpenAI Batch JSONL. This command requires
`ffmpeg`.

Some `triggerSceneId` values may have multiple moment variants when a common
scene depends on a major choice. Each variant keeps its own
`moments/<moment-id>/` folder, prompt, and WebP. The runtime chooses the
variant from `GameState` variables, then hides the image if that variant's WebP
is still missing.

## Manual ChatGPT Workflow

1. Run `pnpm images:prompts -- --book 1`.
2. Review and correct `portrait.md` or `illustration.md` when needed.
3. For a portrait, paste the character's `Prompt ChatGPT` block into ChatGPT Images, then save the result as `public/visuals/book1/characters/<id>/portrait.webp`.
4. To prepare every ChatGPT folder at once, run `pnpm images:stage -- --book 1`. To limit preparation, use `--moment <moment-id>` or `--chapter <chapter-id>`.
5. In ChatGPT Images, attach every `references/*.webp` file from the staging folder.
6. Paste the `Prompt ChatGPT` block from `prompt.md`.
7. Save the final image as `public/visuals/book1/moments/<moment-id>/illustration.webp`.
8. Run:

```bash
pnpm images:check -- --book 1
pnpm images:test
pnpm content:all
pnpm check
pnpm test
pnpm build
```

## Optional API Workflow

Use this flow when ChatGPT limits prevent loading new references, or when many
moments remain to produce.

1. Export the key in the shell, never in the repository:

```bash
export OPENAI_API_KEY=...
```

2. Prepare sheets for missing moments:

```bash
pnpm images:refsheets -- --book 1 --missing
```

3. Submit an economical batch:

```bash
pnpm images:generate:api -- --book 1 --missing --batch --quality high --reference-mode sheets
```

4. When the batch completes, rerun the `--retrieve` command printed by the
script. WebP files are written directly to
`public/visuals/book1/moments/<moment-id>/illustration.webp`.

`output/visual/api-inputs/` and `output/visual/api-runs/` are local and ignored
by Git. The Batch API is asynchronous and billed separately from the ChatGPT
account. Official references: [Batch API](https://developers.openai.com/api/docs/guides/batch),
[Image generation](https://developers.openai.com/api/docs/guides/image-generation),
[Pricing](https://developers.openai.com/api/docs/pricing).

## Prompt Rules

- Paraphrase canonical facts instead of copying paragraphs.
- Describe place, architecture, materials, light, positions, action, anonymous characters, and equipment continuity precisely.
- For any moment whose scene contains several conditional branches, add a `Path compatibility` note in `tools/images/book1-config.mjs`.
- A moment illustration must remain true for every path that reaches its `triggerSceneId`. If one branch has Barry hidden, another exposed, or another injured, the prompt must illustrate the shared invariant rather than one result.
- If a common scene cannot be illustrated correctly for every path, create explicit conditional variants instead of one false image for a branch.
- Verify that the `triggerSceneId` already shows the character, equipment, or event being illustrated. Do not attach a portrait reference or visually announce an action that appears only in a later scene.
- If a trigger scene is too early chronologically, move the moment to the right `triggerSceneId` or make the image more restrained and strictly compatible with what is already visible.
- Do not add `evidenceRefs`, sourceRefs, RAG chunks, embeddings, or API metadata.
- For a non-human character, state that explicitly in the prompt.
- Portraits must be full-body references: full body, head to toe, visible feet, standing 3/4 pose, not a bust or cropped framing.
- Target style is `grounded realistic fantasy adventure illustration`: realistic fantasy, readable, restrained cinematic feel, not grimdark by default.
- Do not darken, fog, or make a neutral environment hostile unless canon requires it. Tension should come from characters, posture, and auras when relevant, not from invented `dark fantasy` scenery.
- For a moment illustration, use staged portraits as strict references while respecting scene overrides.
- When canon lacks a physical detail but a stable reference is needed, mark the addition as a design choice in `tools/images/book1-config.mjs`.
- If ChatGPT contradicts a canonical fact, correct the config, rerun `pnpm images:prompts -- --book 1`, then regenerate the image manually.

## Important Continuity

- Barry has no crossbow before `Ch6-Packing`. Earlier prompts must ask to remove or hide the crossbow even if the portrait reference shows it.
- From `ch6-barry-packing-crossbow`, the crossbow may be visible, strapped to the backpack.
- Barry's stat device must be explicit in every moment prompt where Barry appears: either in hand because canon says so, or in his pocket/hidden. Never let ChatGPT place it in hand by reusing the portrait.
- Barry's backpack is ordinary until the `Ch6-Packing` sequence. In `ch6-barry-packing-crossbow`, the backpack starts ordinary and Daren may enchant it: a contained glow is allowed only as Daren's spell effect, not as a permanent backpack property and not as an inventory screen.
- After the chapter 6 enchantment, the backpack remains externally ordinary unless a scene specifically calls for otherwise. Show glow, magical seams, or an inventory screen only for a moment that explicitly needs it, such as `ch9-enchanted-backpack`.
- In the city sequence after the night at Rose's house, Barry leaves without his backpack. `ch11a-beggars-district-trap` and `ch11b-*` moments must not show his backpack, crossbow, or backpack inventory.
- `ch1-cutthroat-dave` must show Daren weakened near Dave, but must not force Barry to be nailed to the tree; that detail depends on the player choice.
- `ch3-barry-tree-lift` must remain a scene around the fallen tree and a tactical attempt, without proving that Barry succeeded in lifting the tree.
- `Ch11b-Ending` has two variants: `ch11b-golmyck-announcement` only when `v_ch11_saved_rose` is `1`, and `ch11b-golmyck-announcement-no-rose` when Rose is not saved. The no-Rose variant must never attach `rose.webp` or show Rose alive.
- Illuna and Petal are the same person: Petal is Illuna's nickname.
- Flower and Illuna/Petal share exactly the same little girl's body; only expression, attitude, and eye color change.
- A moment must never attach `flower.webp` and `illuna.webp` together. Choose the visible state of the shared body for the scene and describe it clearly.
- `ch8-hydra-room` must not attach Flower: she is called through the roof opening, but she is not visible in the room.
- `ch8-control-room` must show Flower as the visible state of the shared body, with Eleya and Leo in the room; do not attach Illuna for this moment.
- `ch9-flower-illuna-origin` talks about Illuna/Petal but does not physically show her and must not attach `illuna.webp`.
- Arraka is represented in Book 1 by the amulet or its aura, not by a separate human body. Do not attach `arraka.webp` to a moment illustration.
- Molan is Elaria's fawn, not a fox.
- Eleya is the canonical fox: use `Eleya, the golden fox`, not a second fox character.
- Eleya, Leo, Taurus, Elaria, and Molan remain natural fantasy animals, not humanoids.
- Tyrath remains a dragon, never a human or dragonborn.

## Portrait Construction Method

All Book 1 portraits follow the construction level applied to Barry and Daren:

1. Start from canonical English Book 1 text, then search for visual, equipment, and attitude clues tied to the character.
2. Keep short, traceable anchors in `tools/images/book1-config.mjs`, without copying long narrative passages.
3. Separate confirmed facts from visual choices:
   - `Canon:` for what the text confirms;
   - `Design choice:` for details added to get a stable visual reference when canon is vague;
   - `Avoid:` for frequent errors to block.
4. Write a final prompt that describes the character from head to toe, visible equipment, attitude, and what to avoid.

For Barry, retained anchors include `ordinary guy`, `my stat device`,
`stat booster`, `strapped my crossbow to the back of my backpack`, `my dagger`,
`my stat booster's screen`, `backpack starts to glow`, and
`since Daren enchanted it`. Moment config then corrects chronology: the
crossbow does not appear before `Ch6-Packing`, the backpack is visibly
enchanted only when the scene needs it, and the stat device stays hidden unless
canon says otherwise.

For Daren, anchors include `healer in armor`, `heavy armor`, `head is bald`,
`skin is dark`, `mid forties`, `scar on his forehead`,
`use a sword and a shield`, and `white light appear all around him`. They lock
a dark-skinned, bald man in his mid-forties, with an X-shaped forehead scar,
heavy armor, sword, shield, and bright white healing magic.

## Runtime

The reader uses a static map in `src/lib/visuals/book1.ts`. This map links a
canonical `sceneId` to a `moment-id`, or to several conditional variants when a
final scene depends on an important narrative variable.

When `settings.illustrations` is active, `src/App.svelte` looks up an
illustration for `state.currentSceneId` and `state.variables`. If
`/visuals/book1/moments/<moment-id>/illustration.webp` exists, it appears after
the scene text and before choices. If the WebP is missing or fails to load, the
image is hidden without blocking reading.

These images do not modify `GameState`, `history`, `historyDigest`,
anti-tamper replay, or narrative pack loading.
