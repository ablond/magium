# French Translation Guide

## Register And Tone

The French narration keeps Barry's first-person voice: direct, introspective,
sometimes ironic, and accessible rather than solemn. The text should remain
fluid and literary without erasing the narrator's spoken quality.

Chosen principles:

- preserve long sentences when they carry momentum or panic;
- keep useful repetitions, especially during tense moments;
- translate dialogue into natural French, with more contracted or colloquial tone when the character is familiar or aggressive;
- keep English proper names: Barry, Daren, Cutthroat Dave, Olmnar, Varathia, Magium, Eastern Continent, Northern Continent, Western Continent;
- keep `Cutthroat` and `Cutthroat Dave` as proper names when they designate the character; do not translate them as `coupe-gorge`.

## Characteristic Style Patterns

- Courage/stupidity opposition: rendered close to `la frontière entre le courage et la stupidité`.
- Introspective accumulations: preserved through coordinated segments rather than strong summarization.
- Tournament and magic hyperbole: kept instead of neutralized.
- Tension repetitions: `C'était juste. C'était vraiment juste.` preserves the repeated force of `That was close`.
- Deadpan humor: Barry stays lucid and lightly self-deprecating, especially when facing Daren's heroic seriousness.

## Glossary

| Original | French | Note |
| --- | --- | --- |
| stillwater | sans-aura | Stabilized choice from `ch2`. The term remains technically imperfect, because `stillwaters` have an aura indistinguishable from an ordinary human's rather than no aura at all, but it is short, readable, already established in `ch1`, and works as a caste name. |
| mage | mage | Standard fantasy term. |
| shield spell | sort de bouclier | Transparent term to reuse. |
| white magic | magie blanche | Standard fantasy term. |
| throwing knives / daggers | couteaux de lancer / dagues | Choose according to source context. |
| checkpoint | point de contrôle | Coherent UI and narrative term. |
| stat device / stat booster | appareil de stats | Stabilized in `ch3` to avoid `amplificateur` or `dispositif`, which are too technical and less coherent with `ch1`/`ch2`. |
| abilities | Stats | French UI label retained for the stats panel. Technical IDs `abilities.*` stay in English. |
| common language | langue commune | Human language, distinct from ancient languages. |
| golden fox | renard doré / grande renarde | `renard doré` when Barry/Daren talk about a still-vague figure; `grande renarde` when Elaria speaks of her protector. |
| still winter | Hiver immobile | Event name and coded phrase introduced by Eiden in `ch4`. Capitalize when the expression designates the event. |
| transceiver | émetteur | Stabilized in Book 1 and reused for Daren's enchanted devices in Book 2. |
| dwarven ale | ale naine | Keep `ale`, not `bière`, for continuity with Book 1. |
| glowing pinecone | pomme de pin lumineuse | Book 2 tournament objective. |
| revenant | revenant / revenante | Inflect naturally by body or entity when French agreement requires it. |
| trampler | piétineur | Book 2 arena creature. |
| oildrip | suintenoire | Stabilized in `ch11a` for the Sparrow district health crisis. |
| time weaver | tisseur / tisseuse du temps | Use feminine `tisseuse du temps` for Rose. |
| dragon hunter | chasseur de dragons | Caste/function term, naturally inflected in plural. |
| ethereal | éthéré | Magical adjective, especially for intangible beings or effects. |
| Northern Continent / Western Continent | Northern Continent / Western Continent | Proper names kept in English, like `Eastern Continent`. |
| Strength | Force | Stat. |
| Toughness | Résistance | Stat. |
| Speed | Vitesse | Stat. |
| Reflexes | Réflexes | Stat. |
| Hearing | Ouïe | Stat. |
| Observation | Observation | Stat. |
| Ancient languages | Langues anciennes | Stat. |
| Combat technique | Technique de combat | Stat. |
| Premonition | Prémonition | Stat. |
| Bluff | Bluff | Stat, already natural in French. |
| Magical sense | Sens magique | Stat. |
| Aura hardening | Renforcement d'aura | Stat. |
| Magical power | Puissance magique | Stat. |
| Magical knowledge | Connaissances magiques | Stat. |

## Units And Distances

Imperial distances are translated into natural metric phrasing, with idiomatic
rounding instead of mechanical conversion. The goal is for the text to sound
French without fake precision.

- `100 feet` is about `30 mètres`, but phrasing depends on context.
- `a few hundred feet` becomes `à une centaine de mètres`, not `quelques centaines de pieds`.
- `a few feet` often becomes `à quelques pas`, or `à deux ou trois mètres` if the measure matters.
- `fifty foot giants` becomes `des géants de quinze mètres`.
- `five foot seven` becomes `un mètre soixante-dix`.
- `five mile radius` becomes `un rayon d'environ huit kilomètres`.

## Tu / Vous

| Relation | Choice | Reason |
| --- | --- | --- |
| Barry -> Cutthroat Dave | Tu | Direct threat, combat, no social respect. |
| Cutthroat Dave -> Barry/Daren | Tu | Aggression and contempt. |
| Barry -> Daren | Tu | Fast companionship after the rescue. |
| Daren -> Barry | Tu | Protective, then familiar tone. |
| Unknown female voice -> Daren | Vous | Initial politeness toward a legendary figure. |

## Notable Adaptations

- `stillwater` becomes `sans-aura`: the term is deliberately kept despite technical imperfection to preserve continuity with `ch1` and keep a caste name immediately readable.
- `codswallop` becomes `baratin`: oral, contemptuous effect preserved without anglicism.
- `out of your hair` becomes `te débarrasser le plancher`: natural French idiom in Cutthroat Dave's voice.
- `A clean mouth and an honest hand...` becomes `Parler vrai et agir droit ouvre bien des portes.`: proverbial effect preserved without a clumsy literal calque.
- `a few hundred feet from my location` becomes `à une centaine de mètres de ma position`: rounded, natural metric conversion.
- `Remember the still winter` becomes `Souvenez-vous de l'Hiver immobile`: deliberately solemn phrase, to keep stable in later chapters.

## Stabilized Editorial Corrections

These corrections come from the Book 1 QA pass. They serve as guardrails for
future translations and rereads.

French dialogue tags:

- avoid calques such as `», je dis`, `», je lui dis`, `», je dis à Kate`, `», je demande`, `», je lui demande`, `», je demande à Daren`, `», je continue` when they are dialogue tags;
- use natural French forms: `», dis-je`, `», lui dis-je`, `», dis-je à Kate`, preserving agreement and addressee;
- for `I ask`, prefer a natural reformulation such as `Je lui demande : « ... »` or `Je demande à Daren : « ... »` if inversion sounds too stiff;
- for `I continue`, prefer `Je poursuis : « ... »` when the French tag sounds calqued;
- avoid inverted passé composé forms such as `demandé-je`, `lui demandé-je`, `crié-je`, `commencé-je`; prefer a sentence before the line or, occasionally, a correct literary inversion such as `demandai-je` if register justifies it;
- for other tag verbs, check case by case: use inversion if it remains natural, or reformulate if it sounds too literary or artificial;
- for a line split by a tag, prefer `« Kate », dis-je, « tu as une minute ? »` over `« Kate », je dis. « Tu as une minute ? »`;
- normalize dialogue typography: no straight English quotes in FR sources, and no English comma before a closing guillemet such as `« Oui, » dit-elle`;
- do not mechanically correct internal narrative uses such as `je dis seulement`, `je me dis`, `je dis ça`, or a sentence where Barry truly describes the action of speaking outside a tag.

Already corrected formulations:

- `I hear he has...` in reported-rumor context becomes `il paraît qu'il a...`, not `j'entends dire...` or `j'imagine...`.
- `I dare you` in an oral provocation should not become the stiff `Je te défie`; use a natural line such as `Répète un peu ça, pour voir.`
- When Daren spontaneously asks for a `slide`, `toboggan` may remain in his line, but physical narration should use `rampe de glace`, not `glissade de glace`.
- `custom-made slide` in the same scene becomes `la rampe faite sur mesure`, not `le toboggan fabriqué sur mesure`.
- `I think I'm starting to root for you!` becomes `Je crois que je commence à être de votre côté !`, not `Je crois que je commence à vous soutenir !`.
- `before long` should not be mechanically translated as `avant longtemps`; prefer contextually `bientôt`, `peu après`, or a reformulation that keeps natural movement.
- `Oh gods` / `Oh, gods` / `Oh my gods` should not become `Oh dieux`, `Oh, dieux`, `Oh mes dieux`, or `Mes dieux`; choose by context from `Par les dieux`, `Par tous les dieux`, `Oh non`, `Pitié`, or `Oh là là`.
- When `sir` is used by a traumatized character as a servile reflex toward any authority figure, avoid gender-mechanical `monsieur`; prefer `maître` to preserve the submission effect, even facing a woman or child.
- `Really, now...` should not become `Vraiment, maintenant...`; prefer by tone `Sérieusement ?`, `Ah oui ?`, `Non mais sérieusement ?`, or an equivalent reformulation.
- `shut the world out` / `shut the whole world out` should not become `fermer le monde`; choose `se couper du monde`, `se fermer aux autres`, or an equivalent reformulation.
- `That's gonna happen` may be sarcastic; do not automatically translate it as `Ça va sûrement arriver`, and prefer a line such as `Même pas en rêve` when the character clearly refuses.
- `take a deep breath and think...` should not mechanically become `prendre une inspiration avant de réfléchir`; prefer `souffler/respirer un grand coup et réfléchir...` when calming tension.
- `I'm saying` / `I mean` should not mechanically become `je dis que` when used only to clarify or intensify; reformulate the insistence in natural French.
- `couldn't live with myself` / `could never live with myself` should not become `vivre avec moi-même`; prefer by tone `je ne me le pardonnerais jamais`, `je m'en voudrais toute ma vie`, or equivalent.
- `it turns out that...` should not mechanically become `il se révèle que...`; prefer by context `on comprend alors que...`, `il devient clair que...`, `nous découvrons que...`, or equivalent.
- `all of your lives` should not mechanically become `toutes vos vies` when addressing a group; prefer by tone `vos vies à tous`, `que vous y laissiez tous la vie`, or equivalent.
- `remember correctly` should not mechanically become `se souvenir correctement` in dialogue; prefer by context `c'est exact`, `tu as bonne mémoire`, `si je me souviens bien`, or equivalent.
- `actually` should not mechanically become `vraiment` when it only reinforces surprise or disbelief; often French structure is enough, otherwise prefer by register `carrément`, `bel et bien`, `en fait`, or equivalent.
- `shake off` should not mechanically become `secouer` for an effect, fear, spell, or sensation; prefer by context `se libérer de`, `se débarrasser de`, `surmonter`, `reprendre le dessus`, or equivalent.
- `wishful thinking` should not mechanically become `ressembler à du vœu pieux`; prefer by context `relever du vœu pieux`, `prendre ses désirs pour des réalités`, or equivalent.
- `X upon X` should not mechanically become `X et encore X`; prefer a natural intensifier such as `de véritables montagnes de`, `une quantité impressionnante de`, `à perte de vue`, or equivalent.
- `right back` in return sense should not become `directement en arrière`; prefer `directement chez nous`, `aussitôt dehors`, `immédiatement de retour`, or a contextual reformulation.
- `none of our business` should not mechanically become `nos affaires`; prefer `ça ne nous regarde pas`, especially when the line is repeated with indignation.
- `premises` should not automatically become `locaux` in fantasy context; prefer `enceinte`, `abords`, `forteresse`, `bâtiment`, or concrete place description.
- `mass murder` should not become `massacre de masse`; prefer `massacre`, `meurtre de masse`, or a more oral phrase matching the voice.
- `realistically` should not automatically become `Réalistement`; prefer `en réalité`, `dans les faits`, `si on est réalistes`, or a less adverbial sentence.
- `it appears that...` should not mechanically become `il apparaît que...` when Barry observes something visible; prefer `on dirait que`, `il semble que`, or a direct sentence.

## Generic Chapter Translation Workflow

This workflow is required for every chapter translated into French. Replace
`<chapterId>` with the real chapter identifier, for example `ch4`, `ch11a`, or
`b2ch1`.

Authorized translation tool:

- perform narrative translation, achievements, and editorial QA inside Codex;
- do not send Magium texts to DeepL, Google Translate, a direct OpenAI API, another external LLM, a translation SaaS service, or any tool requiring an external API key;
- do not use an API key to bypass a translation service limit;
- keep translation batches in the Codex workspace, using local repository sources as reference;
- local documentation searches remain allowed, but they must not transmit the complete source text to an external provider.

Preparation:

- read the canonical English source `content/canonical/v1/locales/en/<chapterId>.json`;
- record the exact number of `messages` keys and keep the `messageId` list as the coverage reference;
- read `content/canonical/v1/story/<chapterId>.json` to identify achievements, important characters, choices, stat checks, and long scenes;
- never manually edit `content/archive/original/**`, `content/canonical/v1/**`, or `src/generated/**`.

Narrative translation:

- create or update `content/story-locales/fr/<chapterId>.json` with `locale: "fr"`, `chapterId: "<chapterId>"`, and exactly the same `messages` keys as the English locale;
- translate in controlled Codex-only batches small enough to review before merging;
- keep every `messageId` intact, without adding, deleting, or renaming keys;
- translate only player-visible text: do not change scene IDs, choice targets, variables, conditions, assignments, specials, stat checks, or chapter logic;
- systematically apply this document's register, glossary, naturalized units, and tu/vous rules.

Chapter achievements:

- search `content/canonical/v1/story/<chapterId>.json` for every achievement variable referenced by the chapter; Book 1 uses variables shaped like `v_ac_ch...`, while Book 2 uses `v_ac_b2_ch...`;
- for each variable, translate `achievement.<variable>.title` and `achievement.<variable>.caption` from `content/canonical/v1/locales/en/achievements.json`;
- add these translations to `content/story-locales/fr/achievements.json` without deleting already translated achievements;
- keep the title short and natural, and the caption faithful to the English effect or joke;
- prefer natural player-facing French over calque, with coherent `tu` / `ta` / `ton` address when the achievement speaks directly to the player.

Required structural QA:

- verify that the FR source JSON parses;
- verify `locale`, `chapterId`, key count, and strict key equality with `en/<chapterId>.json`;
- verify no extra key, no missing key, and no modified `messageId`;
- verify that chapter achievements present in the story graph have their FR `title` and `caption` keys;
- update i18n tests and status docs if public FR coverage changes.

Required editorial QA:

- scan for obvious English leftovers, straight quotes, unbalanced French guillemets, badly punctuated dialogue tags, double spaces, and stray spaces;
- scan calqued first-person dialogue tags, especially `», je dis`, `», je lui dis`, `», je dis à`, `», je demande`, `», je lui demande`, `», je demande à`, `», je continue`, then correct only real tag cases;
- scan forbidden or unstable terms: `stillwater`, `eau calme`, `amplificateur de stats`, `dispositif de stats`, `maximiser`, non-naturalized imperial units;
- scan stabilized Book 1 corrections when context matches: `j'entends dire`, `Je te défie`, `glissade de glace`, `toboggan fabriqué sur mesure`, `Je crois que je commence à vous soutenir`, `Oh dieux`, lowercase `hiver immobile`;
- verify preserved English proper names, especially continents, characters, places, races, and titles already stabilized;
- reread at least the chapter opening, one long scene, one choice scene, one scene with key characters, one tension or combat scene, and the end or alternative branches;
- correct passages that are too literal, too formal, or too neutral so Barry remains direct, oral, introspective, and lightly ironic;
- add to the glossary any new recurring term stabilized during translation.

Generation and validation:

- run `pnpm content:all` after every translatable source change;
- confirm that `content/canonical/v1/locales/fr/<chapterId>.json` and `src/generated/packs/locales__fr__<chapterId>.ts` are generated by the pipeline;
- always run `pnpm check`, `pnpm test`, and `pnpm build`;
- consider the translation complete only if `pnpm build` also keeps `dist:check` green.

## Translated Chapter Log

- `ch3`: translated with Codex in GPT-5.5 mode, medium effort, no fast mode; source split into 18 controlled batches; structural and editorial QA completed; terms stabilized during this chapter: `appareil de stats`, `langue commune`, `renard doré` / `grande renarde`, keeping `Northern Continent` and `Western Continent`.
- `ch4`: translated locally with Codex, without external translation service; 108 messages covered; achievements `v_ac_ch4_noble`, `v_ac_ch4_cutthroat`, and `v_ac_ch4_kneed` translated; stabilized term: `still winter` -> `Hiver immobile`.
- `ch5` through `ch11b`: translated locally with Codex, without external translation service; 1429 messages covered; achievements `v_ac_ch5_*` through `v_ac_ch11_*` translated; Book 1 is now covered in French, with English fallback only for untranslated chapters outside Book 1.
- `b2ch1` through `b2ch11c`: translated locally with Codex in 75 controlled batches, without external translation service; 2517 messages covered; 48 Book 2 achievements translated through their `v_ac_b2_ch...` variables; Book 1 and Book 2 are now covered in French, with English fallback only for untranslated later books.

## Open Points

- Continent proper names (`Eastern Continent`, `Northern Continent`, `Western Continent`) remain in English under project rules, even when the source varies capitalization.
- Book 3 achievement titles will need case-by-case arbitration between literal fidelity and equivalent humorous effect.
