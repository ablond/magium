# Pipeline Contenu

## Objectif

Transformer les fichiers originaux en contenu standard et vérifiable, sans perdre la possibilité d'auditer les sources.

Le pipeline produit :

- une archive brute immuable ;
- un JSON canonique lisible ;
- des bundles UI canoniques depuis les sources traduisibles locales ;
- des bundles story i18n canoniques depuis les sources traduisibles locales ;
- des paquets runtime compressés et vérifiés ;
- un index global du contenu.

Les images Book 1 ne font pas partie de ce pipeline de contenu. Elles utilisent le workflow manuel documenté dans `docs/manual-images.md` et les scripts `pnpm images:prompts -- --book 1`, `pnpm images:stage -- --book 1`, `pnpm images:normalize -- --book 1` et `pnpm images:check -- --book 1`. `images:stage` prépare tous les moments par défaut ; `--moment <id>` et `--chapter <id>` limitent le scope. Le chemin OpenAI optionnel utilise `pnpm images:refsheets -- --book 1 --missing` et `pnpm images:generate:api -- --book 1 --missing --batch --quality high --reference-mode sheets`; ses fichiers restent sous `output/visual/` et n'entrent pas dans le contenu canonique.

## Archive Brute

Chemin :

```text
content/archive/original/<sourceCommit>/
```

Contenu archive :

- `README.md`
- `LICENSE`
- `chapters/**`
- `manifest.json`

Le manifest contient :

- repository source ;
- ref demandée (`main` par défaut) ;
- commit exact ;
- date d'import ;
- licence logiciel et données ;
- liste des fichiers ;
- taille ;
- SHA-256.

Le pointeur courant est :

```text
content/archive/original/current.json
```

## Source GitHub

Par défaut, `content:import` utilise :

```text
raduprv/Magium@main
```

Le script résout `main` en SHA exact. C'est volontaire : on bénéficie des fixes de `main`, tout en gardant une build reproductible.

Pour forcer une autre ref :

```bash
MAGIUM_SOURCE_REF=<sha-ou-branch> pnpm content:import
```

Pour forcer un retéléchargement même si le SHA courant existe déjà :

```bash
MAGIUM_FORCE_IMPORT=1 pnpm content:import
```

## Format Canonique

Chemin :

```text
content/canonical/v1/
```

Fichiers principaux :

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
locales/fr/achievements.json
locales/fr/stats.json
locales/fr/ui.json
```

Le graphe `story/<chapterId>.json` contient la logique :

- scène order ;
- scènes ;
- paragraph blocks avec `messageId` ;
- choices avec `messageId`, target, assignments explicites, special ;
- conditions en AST ;
- set variables ;
- achievements par scène.

Depuis le format runtime V2, et dans les versions suivantes, chaque assignment à la forme :

```json
{ "variable": "v_available_points", "mode": "add", "value": 3 }
```

`mode: "set"` affecte une valeur absolue. `mode: "add"` ajoute un delta numérique. Les valeurs signées dans les sources (`+3`, `-3`) deviennent des deltas, ce qui est obligatoire pour les points de stats et les boosts narratifs. Une valeur non signée comme `v_max_stat = 4` reste une affectation absolue.

La locale `locales/en/<chapterId>.json` contient les textes originaux :

- paragraphes ;
- libellés de choix ;
- textes d'achievement embarqués dans une scène.

`locales/en/achievements.json` contient les titres/captions du catalogue d'achievements.

## Adaptations Produit Du Runtime

L'archive brute reste une copie vérifiable des sources originales. Les adaptations produit se font après parsing, avant l'écriture canonique et les packs runtime.

Le runtime supprime volontairement `Ch11b-Credits`, l'ancien écran commercial de fin du livre 1. `Ch11b-Ending` conserve le dernier texte narratif et son unique bouton pointe directement vers `B2-Ch01a-Intro` avec `special: checkpoint_save`, `v_b1_saved_stats = 1`, `v_chapter_save_counter = 5` et `v_checkpoint_rich = 1`. Les textes de paiement, jetons, IAP, redémarrage et chargement de cette page ne doivent pas être régénérés dans les packs runtime.

Les sources UI sont les fichiers éditables :

```text
content/ui-locales/en.json
content/ui-locales/fr.json
```

`content:parse` les copie dans `content/canonical/v1/locales/<locale>/ui.json`, ajoute les locales disponibles dans `index.uiLocales`, puis génère les packs runtime `locales/<locale>/ui`.

Les sources story i18n sont les fichiers éditables :

```text
content/story-locales/en/stats.json
content/story-locales/fr/ch1.json
content/story-locales/fr/ch2.json
content/story-locales/fr/ch3.json
content/story-locales/fr/ch4.json
content/story-locales/fr/ch5.json
...
content/story-locales/fr/ch11b.json
content/story-locales/fr/achievements.json
content/story-locales/fr/stats.json
```

`content:parse` les copie dans `content/canonical/v1/locales/<locale>/`, ajoute les locales disponibles dans `index.storyLocales`, puis génère les packs runtime `locales/<locale>/<bundle>`. Les fichiers de chapitre doivent avoir exactement les mêmes `messageId` que `en`. Les achievements traduits peuvent être partiels par rapport au catalogue complet, mais doivent couvrir strictement les chapitres traduits par la locale. Les stats doivent être complètes pour chaque locale de récit.

Les corrections publiques de traduction ne changent pas ce modèle. Le service `services/translation-api` stocke uniquement des propositions. Une correction de paragraphe cible un segment affiché dans un `messageId` et le changeset remplace uniquement ce segment dans la valeur JSON complète. Un changeset accepté est appliqué par `tools/contributions/apply-changeset.mjs` sur les sources éditables `content/story-locales/<locale>/<chapter>.json`, puis le pipeline régénère canonique et packs. Aucun endpoint public ne doit servir `content/canonical` ou `src/generated` comme JSON brut.

## Conditions

Les conditions `.magium` sont parsées vers :

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

`anyOf` représente les `||`.
`allOf` représente les `&&`.

`True` devient `null`.
`False` devient `{ "anyOf": [] }`.

Les lignes `choice(...) if (...)` doivent garder quatre données séparées : target, assignments, `special` et condition. Le parser coupe le `if` après la parenthèse finale du choix pour éviter que la condition soit avalée dans `target`, `special` ou `setVariables`.

## Paquets Runtime

Chemin :

```text
src/generated/
```

Ces fichiers sont générés par `build-canonical.mjs`.

`src/generated/contentPacks.ts` expose une table de loaders dynamiques.
Chaque pack sous `src/generated/packs/` contient :

- encoding `base64+gzip` ;
- SHA-256 du blob compressé ;
- taille ;
- données encodées.

Le runtime :

1. importe dynamiquement le pack nécessaire ;
2. décode base64 ;
3. vérifie SHA-256 ;
4. décompresse gzip ;
5. parse JSON.

## Validation

`pnpm content:validate` vérifie :

- 54 fichiers `.magium` archivés ;
- scène order cohérent ;
- targets existantes ou special explicite ;
- assignments explicites avec `mode: "set" | "add"` ;
- absence de condition `if` accidentellement embarquée dans un assignment ou un `special` ;
- messages présents pour tous les `messageId` ;
- achievements connus ;
- clés UI identiques entre `en` et les autres locales UI ;
- présence des packs `locales/<locale>/ui` dans `src/generated/contentPacks.ts` ;
- clés strictes des chapitres traduits par rapport à `en` ;
- clés stats identiques entre `en` et les autres locales de récit ;
- clés achievements traduites pour les chapitres couverts et packs story présents ;
- pas d'indice de `.magium` brut dans `src/generated/contentPacks.ts`.

`pnpm dist:check` vérifie après build :

- aucun `.magium` dans `dist/` ;
- aucun JSON canonique brut dans `dist/` ;
- pas d'extrait source brut évident.

## Modification Du Parser

Si un fichier `.magium` ne parse pas :

1. ne pas corriger le fichier archive ;
2. inspecter la syntaxe originale ;
3. modifier `tools/content/parser.mjs` ;
4. ajouter/adapter un test dans `tests/parser.test.mjs` ;
5. relancer `pnpm content:all && pnpm test`.
