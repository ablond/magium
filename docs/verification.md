# Verification

## Required Suite

Use Node.js 24 LTS with `pnpm@11.9.0`, as in CI and Docker builds.

```bash
pnpm install
pnpm --dir services/translation-api install --frozen-lockfile
pnpm check
pnpm test
pnpm build
```

These commands must pass before an iteration is considered complete. The
unified server keeps its production dependencies under
`services/translation-api`; install that dependency set in addition to root
dependencies before `pnpm test` on a fresh checkout.

Dependabot version PRs intentionally use a cooldown. pnpm 11 also enforces a
minimum release age by default; if CI fails with
`ERR_PNPM_MINIMUM_RELEASE_AGE_VIOLATION`, rerun after the waiting window
instead of disabling this protection.

If the iteration touches Book 1 prompts, assets, tools, or image display, add:

```bash
pnpm images:check -- --book 1
pnpm images:test
```

If Docker, Coolify, or production packaging changes, add:

```bash
docker compose config
pnpm docker:build-prod
```

If publication is requested, finish with:

```bash
pnpm docker:push-prod
```

## What Each Command Checks

`pnpm check`:

- `svelte-check`;
- app TypeScript;
- Vite TypeScript config.

`pnpm test`:

- regenerates content through `content:all`;
- runs Vitest excluding manual Book 1 tests that depend on `ffmpeg`;
- covers parser, engine, i18n, storage, account synchronization, and contribution changesets;
- also runs the Node tests for the unified PWA/account/contribution server.

`pnpm build`:

- regenerates and validates content;
- builds with Vite;
- runs `dist:check`.

`pnpm images:check -- --book 1`:

- verifies public Book 1 prompts and WebP assets;
- rejects RAG markers, embeddings, `evidenceRefs`, `.magium`, and long canonical text copies;
- accepts missing WebP files during manual image production.

`pnpm images:test`:

- regenerates content through `content:all`;
- runs `tests/manual-images.test.mjs`;
- covers Book 1 prompts, ChatGPT staging, API reference sheets, and OpenAI Batch JSONL;
- requires `ffmpeg` to generate WebP reference sheets.

`pnpm images:stage -- --book 1`:

- prepares every local Git-ignored folder under `output/visual/staging/book1/<moment-id>/` by default;
- copies `prompt.md` and renamed reference portraits under `references/<character-id>.webp`;
- lets the right images be attached in ChatGPT without manual `portrait.webp` filename work;
- also accepts `--moment <id>` or `--chapter <id>` to limit staging.

`pnpm images:normalize -- --book 1`:

- converts PNG/JPG moment images to `illustration.webp` with `ffmpeg`;
- moves originals under `output/visual/originals/book1/moments/`;
- leaves `public/visuals/book1/moments/` with only `illustration.md` and `illustration.webp`.

`pnpm images:refsheets -- --book 1 --missing`:

- prepares local reference sheets under `output/visual/api-inputs/book1/<moment-id>/`;
- groups up to four portraits per sheet to reduce API costs;
- implicitly rejects canonical errors locked by config: no `arraka.webp`, no `flower.webp` + `illuna.webp` pair on the same moment;
- requires `ffmpeg` to compose WebP sheets.

`pnpm images:generate:api -- --book 1 --missing --batch --quality high --reference-mode sheets`:

- optional advanced path requiring `OPENAI_API_KEY` in the environment;
- prepares and submits an OpenAI `/v1/images/edits` batch with `gpt-image-2`, WebP, and `quality=high`;
- prints the `--retrieve` command to rerun when the batch finishes;
- keeps manifests and temporary outputs under `output/visual/api-runs/`, ignored by Git.

`pnpm docker:build-prod`:

- builds `ghcr.io/ablond/magium:<timestamp>` locally;
- verifies the public runtime filesystem;
- starts a temporary PostgreSQL and the production Node image;
- checks migrations, `/health`, account registration, `/`, `/sw.js`,
  `/manifest.webmanifest`, API 404 behavior, and SPA fallback.

`docker compose config`:

- verifies syntax for the local Vite PWA, unified app, one PostgreSQL, and Mailpit stack;
- confirms local default values are enough without a `.env` file.

For a local server, contribution, or account change, also verify:

```bash
docker compose up -d --build
curl http://localhost:5173
curl http://localhost:8090/health
curl http://localhost:8090/admin
curl -H "Authorization: Bearer dev-admin-token" http://localhost:8090/v1/admin/proposals
curl -H 'Content-Type: application/json' \
  -d '{"username":"local-player","password":"local-secret"}' \
  http://localhost:8090/v1/accounts/register
curl http://localhost:8025
docker compose down
```

Then use two clean browser contexts:

1. create an account in the Saves panel and advance the story;
2. create and rename a named save, then unlock an achievement if practical;
3. connect the same account in the second context and verify autosave, named save, label, and achievement restoration;
4. delete the named save in one context, synchronize both, and verify that it is not recreated;
5. take the unified app offline, make another choice, and verify the local save still succeeds;
6. restart the app and verify the pending local progression synchronizes;
7. confirm a Debug-dirty save never appears on the second device.

For a maintainer-admin change, also check in a browser:

- `/admin` shows the login form outside a session;
- `dev-admin-password` opens the local dashboard;
- proposal detail shows original text and proposed diff;
- a proposal can be accepted/rejected/marked stale from the UI;
- one or more accepted proposals can be grouped into a changeset;
- the UI blocks selecting two competing proposals on the same segment.

For a complete translation contribution acceptance pass, also verify:

- PWA `http://localhost:5173`: with `Translation corrections` disabled, no pencil is visible on paragraphs or choices and layout keeps no empty column;
- Settings: enable `Translation corrections`, then verify grey discreet pencil icons appear on a paragraph and a choice;
- multi-paragraph block: the modal displays only the clicked paragraph, prefilled in the correction field;
- no `publicId`, `messageId`, `sceneId`, `chapterId`, `contentVersion`, `segmentIndex`, or technical hash is visible in the player UX;
- anonymous submission: simple success without `TR_...` and without a receipt to keep;
- local email submission: confirmation email visible in Mailpit at `http://localhost:8025`;
- Mailpit shows sender `Magium <no-reply@magium.app>`;
- confirmation link click: PWA returns to reader with a visible confirmation notice below the reader title, URL cleaned without `translation-email-consent`, and browser consent stored if the link is opened in the same browser as the initial submission;
- second proposal with the same email from the same browser: no second confirmation email;
- admin `http://localhost:8090/admin`: original text visible, proposed diff readable, only final version editable;
- acceptance then changeset creation: export JSON accessible;
- selecting two proposals on the same `locale/chapterId/messageId/segmentIndex` target blocked UI-side and rejected API-side;
- `Create PR` locally without GitHub configured: readable `GitHub dispatch is not configured`;
- `Create PR` in configured environment: GitHub workflow launched, one PR created after `pnpm content:all`, `pnpm check`, `pnpm test`, `pnpm build`; this workflow does not depend on `ffmpeg`;
- marking `published`: grouped notifications by recipient if contacts are confirmed, then raw emails deleted;
- batch rejection or stale: one notification per confirmed recipient, then raw emails deleted;
- single `rejected` or `stale`: raw emails deleted without notification.

`pnpm docker:push-prod`:

- runs the same checks;
- pushes `ghcr.io/ablond/magium:<timestamp>` and `ghcr.io/ablond/magium:latest`;
- inspects published tags with `docker buildx imagetools inspect`.

## Content Checks

```bash
pnpm content:all
```

Must confirm:

- archive up to date or import performed;
- 54 `.magium` files;
- 278 archived files at the current commit;
- 54 generated chapters;
- 136 achievements;
- generated UI packs `locales/en/ui` and `locales/fr/ui` with synchronized UI keys;
- generated and valid Book 1 and Book 2 FR story packs (`locales/fr/ch1` through `locales/fr/ch11b`, then `locales/fr/b2ch1` through `locales/fr/b2ch11c`), `locales/fr/achievements`, `locales/en/stats`, and `locales/fr/stats`, with FR achievements covered for Book 1 and Book 2;
- canonical assignments in `mode: "set" | "add"`;
- `Ch11b-Credits` absent from runtime content, with `Ch11b-Ending` pointing directly to `B2-Ch01a-Intro` through `checkpoint_save`;
- no `choice(...) if (...)` condition embedded in `target`, `special`, or `setVariables`;
- short public Book 1 image prompts under `public/visuals/book1`, without RAG, embeddings, `evidenceRefs`, `.magium`, old `chapters` paths, or long canonical text copies;
- no moment prompt attaches `arraka.webp`, or `flower.webp` and `illuna.webp` together.

Counts may change if `raduprv/Magium@main` changes. In that case, update docs
only after deliberate verification.

## Recommended Browser Checks

With the server:

```bash
pnpm dev --host 127.0.0.1
```

Verify:

1. the page loads directly into Book 1 chapter 1;
2. clicking `Excited` displays the next scene;
3. reloading the page resumes progress;
4. if the browser prefers `fr`, the interface and available Book 1 and Book 2 story text start in French; otherwise use Settings to switch to `Français`;
5. desktop 1280 x 720: the left rail displays `Lire`, `Stats`, `Sauvegardes`, `Succès`, `Paramètres`, `À propos` in FR without cutting labels, the reader header no longer shows achievement or autosave badges, the reading area uses Literata at a comfortable width and dense book-like paragraph spacing, with no line/dialogue overlap, Book 1 scenes use narrative packs `fr/ch1` through `fr/ch11b`, Book 2 scenes use narrative packs `fr/b2ch1` through `fr/b2ch11c`, short dialogue such as `ch5.Ch5_Intro.p2` renders as several real DOM paragraphs instead of one large `<p>`, and the left rail and open right panel stay visible during long scroll;
6. mobile 390 x 844: navigation remains compact, story remains dense and readable in FR and EN without UI/text overlap, and panels open as overlays above the story with close button, clickable backdrop, and `Escape`, without pushing content down;
7. the drop cap for the first alphabetical paragraph rises slightly above the line and does not look like it falls into the paragraph;
8. the Saves panel clearly separates autosave, local saves, checkpoint, and transfer; it does not show `autosave`, `slotId`, `Ch12`, `route`, `prod`, `local-key`, or `pbkdf2` to the player;
9. the Stats panel is empty at the start, then shows base stats after `Ch2-Stats` with point counter, value/max, `+/-` buttons, confirmation, clearing, and short help below buttons;
10. at `Ch2-Stats`, manual max is `3`, `+` disables when a stat reaches max or no point remains, and `-` removes only unconfirmed draft points;
11. confirming an allocation decrements `v_available_points`, saves, then keeps confirmed points non-removable by the panel;
12. the narrative choice `special:stats` advances to the target scene and then opens the panel, and the Stats button also allows investing later;
13. after the original passage that assigns `v_max_stat = 4`, the panel shows max `4`;
14. aura stats appear after the `B3-Ch04a` introduction, while `Magical Power` and `Magical Knowledge` remain invisible;
15. after a choice leading to a stat check, the result appears before scene text, followed by content and next choices, with localized success/failure and level;
16. when a choice unlocks an achievement new for the browser, a compact `Succès obtenu` / `Achievement unlocked` notice appears before the text with the achievement title and caption, then does not reappear after reload, import, language switch, new game, or opening the Achievements panel;
17. on a death scene, the death achievement remains visible in the Achievements panel after `Load from last checkpoint` or new game, while checkpoint restore exits the death scene, saves restored autosave, and does not keep the failed branch in history;
18. the Settings panel contains `Langue` and `Thème`, the global FR/EN switch, theme, text size, contrast, Illustrations toggle, and, if the contribution API URL is configured, the `Corrections de traduction` toggle unchecked by default; in light theme, rail, nav buttons, panels, fields, notices, and active states remain readable on desktop and mobile, then gain contrast with `High contrast` active;
19. the Illustrations toggle hides/shows the moment image after the matching scene without changing the game;
20. a missing or unloadable moment image does not block reading;
21. the About panel shows attribution, source/license links, and adaptation changes;
22. switching FR/EN does not reset the current scene, does not modify history, and sets `GameState.locale` to the selected language;
23. with `Translation corrections` enabled, a paragraph or choice pencil opens a form without showing `messageId`, `sceneId`, `chapterId`, `contentVersion`, `segmentIndex`, or technical hash to the player; on a multi-paragraph block, the form shows and prefills only the clicked paragraph;
24. the contribution form can be submitted without pseudonym or email, keeps a robust error if the API is not configured, and explains that email/pseudonym are optional;
25. if an email is entered, the notification checkbox remains explicit and text states that first confirmation is remembered in this browser for one year, then email is deleted after the proposal is rejected, marked stale, or published;
26. if a pseudonym is entered, the credit checkbox remains explicit and text states that the pseudonym can be moderated;
27. local pseudonym/email memory happens only if `Remember pseudonym and email on this device` is checked, and the clear button empties the `contributionProfile` store;
28. after contribution submission, the modal shows only player-facing success without `publicId`, without receipt to keep, and with a `Close` button;
29. IndexedDB contains `encrypted` objects for `saves` and `achievementProgress`, without plaintext variables, stats, or achievement names;
30. creating, loading, renaming, and deleting a local save keeps readable player labels, with chapter displayed as `Book 1 - Chapter 12` rather than a technical ID;
31. clicking `Export save` opens the password field only then; without a password, the file is not downloaded;
32. export with passphrase produces a `.magium-save` whose filename contains `magium`, readable chapter, and date;
33. clicking `Import save` opens the password field and file choice only then;
34. import with the same passphrase restores progress when replay is compatible, even if the save was created with an older `contentVersion`; an exact legacy Book 2 false refusal is rewritten to the equivalent lie choice without changing the current scene or variables;
35. wrong password, incompatible file, non-replayable older `contentVersion`, or incoherent stat / `v_available_points` displays a clear panel error and does not modify the local save;
36. under `pnpm dev`, the rail shows a `Debug` panel;
37. the Debug panel can jump to a scene from another chapter and applies scene-entry `setVariables`;
38. a choice hidden by conditions can be applied from Debug without adding a `history` event;
39. Debug undo/redo buttons work after a normal choice, debug jump, and stat edit;
40. debug editing of `v_available_points`, `v_available_points_aux`, `v_max_stat`, one stat, and its `_aux` variable is saved locally and reloadable through a named slot;
41. after a debug modification, the Saves panel blocks `.magium-save` export with a clear error and keeps the local save usable;
42. after `pnpm build` then `pnpm preview`, the Debug button does not appear.

## IndexedDB Verification Example

In the browser console:

```js
const dbReq = indexedDB.open('magium-pwa')
const db = await new Promise((resolve, reject) => {
  dbReq.onsuccess = () => resolve(dbReq.result)
  dbReq.onerror = () => reject(dbReq.error)
})
const savesTx = db.transaction('saves', 'readonly')
const saves = await new Promise((resolve, reject) => {
  const req = savesTx.objectStore('saves').getAll()
  req.onsuccess = () => resolve(req.result)
  req.onerror = () => reject(req.error)
})
const achievementTx = db.transaction('achievementProgress', 'readonly')
const achievementProgress = await new Promise((resolve, reject) => {
  const req = achievementTx.objectStore('achievementProgress').getAll()
  req.onsuccess = () => resolve(req.result)
  req.onerror = () => reject(req.error)
})
console.log({ saves, achievementProgress })
```

Expected:

- `slotId`, `label`, `createdAt`, `updatedAt`, `contentVersion` visible;
- `encrypted.iv` and `encrypted.ciphertext` visible;
- no plaintext `currentSceneId`, stats, variables, or achievement names.

## Dist Check

`pnpm dist:check` must reject:

- `.magium` in `dist`;
- raw canonical JSON in `dist`;
- obvious raw source text in public assets.

This check is deliberately conservative. If a false positive appears, fix the
check carefully instead of removing it.

## Docker Image Check

The Docker script must reject from the public `dist/` tree:

- `.magium` in the runtime filesystem;
- raw canonical JSON in the runtime filesystem;
- `.env*`;
- obvious raw source excerpts such as `ID: Ch1-Intro1` or `chapters/ch1.magium`.

The expected final image runs one Node process on port `8080`. Production
dependencies are allowed inside the image, but the static handler must expose
only `/app/dist`.

## Local Artifacts

Do not commit:

- `dist/`
- `node_modules/`
- `.playwright-cli/`
- `output/playwright/`
- `output/visual/api-inputs/`
- `output/visual/api-runs/`
- `output/visual/originals/`
- `output/visual/staging/`
- test `.magium-save` exports.

These paths are ignored by `.gitignore`.
