# Book 3 French Translation QA

Scope: the complete archived Book 3 narrative, from `b3ch1` through
`b3ch12b`, plus the 53 Book 3 achievement titles and captions.

## Source And Coverage

- Upstream archive commit: `0f472bc7193c60bb29ccb1efb7425df8b8defcbe`.
- French chapter sources added under `content/story-locales/fr/`: 25.
- Narrative `messageId` values covered: 3,485.
- Displayed paragraph segments preserved: 14,965.
- English source volume: 579,567 words.
- Controlled chronological translation batches: 113, each containing at most
  about 6,000 English source words and never crossing a chapter boundary.
- Book 3 achievement messages added: 106, representing 53 titles and 53
  captions from archived `achievements3.json`.

The chapter batching inventory is reproducible from the canonical English
message order. A word is one Unicode lexical token; apostrophes and hyphens
inside a token do not split contractions or compounds. Messages are added in
order to the current batch until the next complete message would exceed 6,000
words, then a new batch begins. A batch never crosses a chapter boundary; the
largest resulting batch contains 5,999 source words.

| Chapter | English words | Batches |
| --- | ---: | ---: |
| `b3ch1` | 21,472 | 4 |
| `b3ch2a` | 19,119 | 4 |
| `b3ch2b` | 20,137 | 4 |
| `b3ch2c` | 17,029 | 3 |
| `b3ch3a` | 25,500 | 5 |
| `b3ch3b` | 18,678 | 4 |
| `b3ch4a` | 19,934 | 4 |
| `b3ch4b` | 20,708 | 4 |
| `b3ch5a` | 23,372 | 5 |
| `b3ch5b` | 15,257 | 3 |
| `b3ch6a` | 29,506 | 6 |
| `b3ch6b` | 32,769 | 6 |
| `b3ch6c` | 7,820 | 2 |
| `b3ch7a` | 29,166 | 5 |
| `b3ch8a` | 16,888 | 3 |
| `b3ch8b` | 21,529 | 4 |
| `b3ch9a` | 24,073 | 5 |
| `b3ch9b` | 29,879 | 6 |
| `b3ch9c` | 25,014 | 5 |
| `b3ch10a` | 33,060 | 6 |
| `b3ch10b` | 22,602 | 4 |
| `b3ch10c` | 22,284 | 4 |
| `b3ch11a` | 30,819 | 6 |
| `b3ch12a` | 23,136 | 5 |
| `b3ch12b` | 29,816 | 6 |
| **Total** | **579,567** | **113** |

## Translation And Adaptation Method

- Translation was performed inside Codex only. No external translation API,
  SaaS translator, direct API-keyed LLM call, or machine-translation service
  received the narrative text.
- Before each batch, the surrounding scenes, alternatives, and chapter graph
  were consulted to identify the speaker, addressee, emotional state, prior
  references, consequences, and achievement context.
- The first pass established meaning, facts, causality, humor, irony, and
  subtext. The second pass rewrote that meaning as idiomatic French, allowing
  sentence restructuring where French rhythm required it without shortening or
  inventing content.
- Every batch was reread first as standalone French, then compared again with
  the English source to catch omissions, softened meaning, added information,
  and broken jokes.
- A final cross-chapter reread was divided into three non-overlapping ranges to
  check recurring terms, character voices, dialogue tags, and repeated player
  choices independently of the initial translation pass.

Character voice targets:

- Barry remains direct, oral, introspective, and lightly ironic;
- Daren remains heroic, earnest, and serious without becoming stiff;
- Arraka remains cutting, provocative, and deliberately excessive;
- Hadrik remains familiar and spontaneous;
- Flower remains lively and emotionally transparent;
- Leila remains concise;
- Meridith remains formal;
- the Superviseur keeps a repetitive, bureaucratic, mechanical register.

## Stabilized Book 3 Decisions

- `Overseer` -> `Superviseur`;
- `Overseer protocol` -> `protocole du Superviseur`;
- `king of the underground` -> `roi des souterrains`;
- `Southern Continent`, `Eastern Continent`, `Northern Continent`, and
  `Western Continent` remain English proper names;
- `Beacon of Hope`, `seredium`, and proper names remain unchanged;
- established terms remain `sans-aura`, `Hiver immobile`, `appareil de stats`,
  `émetteur`, `plan éthéré`, `plan terrestre`, and `plan magique`;
- the nomenclature joke deliberately preserves Breynan's `drowns`, Melindra's
  `droons`, Albert's `drowns` / `droynes`, and Billy Bob's final `DRONES`
  correction;
- repeated choices use `Charger depuis le dernier point de contrôle`, `Charger
  une partie`, and the established `Investir les points...` wording;
- nested quotations use French `‹ ... ›`, never English `“...”`.

Achievement titles and captions are adapted for their player-facing effect,
not translated word for word. `v_ac_b3_ch9_prize` is included even though it is
absent from the current story graphs. No achievement was invented for
`v_ac_b3_ch9_consolation`. The 52 titles that do appear in chapter messages are
checked against their translated achievement keys.

`One Dagger Man` is deliberately kept in English: the recognizable echo of
`One-Punch Man` carries the joke, whereas a literal French title would erase
the reference.

## Structural And Editorial QA

The source and generated-content checks enforce:

- valid JSON, `locale: "fr"`, and the exact English `chapterId`;
- exact key order and equality, with no missing, extra, renamed, or empty
  message;
- exact blank-line segment parity for every displayed paragraph;
- all 25 generated canonical locales and runtime packs, plus the French
  achievement pack and pack registry;
- exact coverage of the 53 archived Book 3 achievement variables;
- stable spelling and contextual presence for `Beacon of Hope`, continent
  names, `seredium`, `Superviseur`, and `protocole du Superviseur`, while still
  allowing natural French pronouns instead of mechanically repeating nouns;
- the intentional `drowns` / `droons` / `droynes` / `DRONES` sequence;
- consistent repeated save/loading and stat-allocation choices;
- no English curly quotations, straight ASCII apostrophes, artificial
  first-person `...é-je` / `réponds-je` tags, untranslated imperial units, or
  checked literal calques such as rendering `before long` as `avant longtemps`
  or `couldn't live with myself` as `vivre avec moi-même`.

The final delivery gate runs:

```bash
pnpm content:all
pnpm check
pnpm test
pnpm build
git diff --check
```

Browser QA covers early, middle, and final Book 3 scenes, including dialogue,
humor, combat, exposition, achievements, stat checks, desktop and mobile
reading, and a French/English switch that must preserve the current game state.

## Final Validation Results

Validation was recorded on 2026-07-23 against the archive pinned to
`0f472bc7193c60bb29ccb1efb7425df8b8defcbe`.

| Check | Result |
| --- | --- |
| `pnpm content:all` | Passed: 278 archived files, 54 `.magium` files, 54 canonical chapters, and 136 achievements validated. |
| `pnpm check` | Passed: zero Svelte errors, zero Svelte warnings, and TypeScript validation successful. |
| `pnpm test` | Passed: 14 test files / 90 application tests and 44 unified-server tests. |
| `pnpm build` | Passed: 340 modules built; every French Book 3 pack emitted; `dist:check` found no raw `.magium` or canonical JSON asset. |
| `git diff --check` | Passed with no whitespace error. |

The final structural and editorial scan covered all 25 files, 3,485 message
IDs, 14,965 displayed paragraph segments, and 16,484 total segments. It also
confirmed all 106 Book 3 achievement keys for 53 variables, including
`v_ac_b3_ch9_prize`, with no invented `v_ac_b3_ch9_consolation` entry. The 52
achievement titles embedded in story messages match the achievement catalogue.

The final scan found zero empty values, key-order differences, segmentation
differences, divergent translations for identical repeated English values,
ASCII apostrophes in Book 3, English quotation marks, checked imperial units,
artificial dialogue tags, targeted literal calques, teleportation vibration
calques, or banned glossary variants. A separate EN/FR reread of `b3ch9a`
through `b3ch12b` covered 1,364 keys; its last exhaustive pass covered all 206
keys in `b3ch12b` and revalidated every resulting correction.

## Browser Verification Results

The final generated packs were checked in the development player after a clean
reload:

- `B3-Ch02b-Weird` at 1280 x 720 verified an early dialogue-heavy humorous
  scene, Billy Bob's voice, and the `droons` joke without clipping;
- `B3-Ch06b-Robed` verified combat, death choices, and the localized result
  `Renforcement d’aura : échec · niveau 3`;
- `B3-Ch09c-Maintenance` verified exposition and the mechanical voice of the
  Superviseur, including `protocole du Superviseur` and `roi des souterrains`;
- the achievements panel displayed Book 3 adaptations including `One Dagger
  Man` and `L’art de déléguer` with their French captions;
- `B3-Ch12b-Together2` verified final-chapter combat and the corrected
  separation between Eiden's dialogue and the surrounding narration;
- the same final scene was checked at 390 x 844: the article measured 358 px
  both for its client width and scroll width, with no text overlap or clipping;
- switching FR -> EN -> FR while on `B3-Ch09c-Maintenance` kept the same scene
  and game state while updating story, navigation, settings, and choices;
- a final clean reload produced no application error in the browser console.

The temporary Vite HMR warning that can occur while `content:all` replaces
generated files was cleared by the required post-generation reload and did not
recur on the final clean load.
