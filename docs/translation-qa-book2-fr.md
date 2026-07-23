# Book 2 French Translation QA

Scope: complete Book 2 runtime narrative, `b2ch1` through `b2ch11c`, plus the
48 Book 2 achievement titles and captions.

## Coverage

- Chapter files added under `content/story-locales/fr/`: 17.
- Narrative message keys covered: 2517.
- Achievement message keys added: 96, derived from archived `achievements2.json`
  and shaped as `achievement.v_ac_b2_ch...{title,caption}`.
- Existing Book 1 French achievement keys were preserved.

## Translation Method

- Translation was performed locally with Codex only, without DeepL, Google
  Translate, external translation SaaS, direct OpenAI API calls, or API-keyed
  translation tooling.
- The English Book 2 locale files were split into 75 controlled batches of at
  most about 6000 source words.
- Each batch was validated before assembly for JSON parse, exact input/output
  key equality, no extra keys, and no empty translated values.
- The final assembled files were revalidated against
  `content/canonical/v1/locales/en/b2ch*.json` for `locale`, `chapterId`, and
  strict `messageId` parity.

## Book 2 Register

Proper names are preserved by default, including `Leila`, `Melindra`, `Bruce`,
`Wilhelm`, `Nolderan`, `Fyron`, `Talmak`, `Velgos`, `Meridith`, `Selkram`,
`Olivia`, `Venard`, `Jason`, `Wilbert`, `Heksol`, `Claire`, `Met-Zek`, and
`Tilirius`.

Recurring stabilized terms:

- `glowing pinecone` -> `pomme de pin lumineuse`;
- `transceiver` -> `émetteur`;
- `dwarven ale` -> `ale naine`;
- `stillwater` -> `sans-aura`;
- `still winter` -> `Hiver immobile`;
- `stat device` / `stat booster` -> `appareil de stats`;
- `trampler` -> `piétineur`;
- `revenant` -> `revenant` / `revenante` according to agreement.

## QA Checklist

Structural checks:

- all 17 Book 2 FR files parse as JSON;
- all files use `locale: "fr"`;
- all files keep the English `chapterId`;
- all files have exactly the same `messages` keys as their English source;
- Book 2 achievement translations cover every variable from archived
  `achievements2.json`;
- this Book 2 pass extended the i18n tests from Book 1 to Book 1 + Book 2
  French narrative and achievement coverage; later books extend the same
  checks independently.

Current scan result:

- no remaining forbidden terms from the Book 1 trap list;
- no remaining `Stillwater` / `stillwater` common-term leftovers;
- no detected straight double quotes in translated values;
- no detected unbalanced French guillemets;
- no detected calqued first-person tags from the checked list;
- no detected lowercase `hiver immobile` occurrences.

Editorial scans to keep running after future corrections:

- English leftovers and straight quotes;
- bad French guillemet punctuation or dialogue tags;
- `coupe-gorge`, `Vraiment, maintenant`, `Oh dieux`, `Mes dieux`,
  `avant longtemps`;
- literal imperial-distance renderings when French can be naturalized;
- `amplificateur de stats` or `dispositif de stats`;
- lowercase or generic uses of `Hiver immobile` where the event/code phrase is
  intended;
- `Stillwater` / `stillwater` left untranslated outside proper source quoting.

## Follow-Up Risk

This pass is structurally complete and uses the Book 1 rules immediately, but
Book 2 is large enough that a later human-quality reread should still focus on
branch continuity, voice consistency across repeated scenes, and achievement
jokes where a literal title may not be the best French player-facing title.
