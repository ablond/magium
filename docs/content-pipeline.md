# Pipeline Contenu

## Objectif

Transformer les fichiers originaux en contenu standard et verifiable, sans perdre la possibilite d'auditer les sources.

Le pipeline produit :

- une archive brute immuable ;
- un JSON canonique lisible ;
- des bundles UI canoniques depuis les sources traduisibles locales ;
- des bundles story i18n canoniques depuis les sources traduisibles locales ;
- des paquets runtime compresses et verifies ;
- un index global du contenu.

Les images Book 1 ne font pas partie de ce pipeline de contenu. Elles utilisent le workflow manuel documente dans `docs/manual-images.md` et les scripts `pnpm images:prompts -- --book 1`, `pnpm images:stage -- --book 1`, `pnpm images:normalize -- --book 1` et `pnpm images:check -- --book 1`. `images:stage` prepare tous les moments par defaut ; `--moment <id>` et `--chapter <id>` limitent le scope. Le chemin OpenAI optionnel utilise `pnpm images:refsheets -- --book 1 --missing` et `pnpm images:generate:api -- --book 1 --missing --batch --quality high --reference-mode sheets`; ses fichiers restent sous `output/visual/` et n'entrent pas dans le contenu canonique.

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
- ref demandee (`main` par defaut) ;
- commit exact ;
- date d'import ;
- licence logiciel et donnees ;
- liste des fichiers ;
- taille ;
- SHA-256.

Le pointeur courant est :

```text
content/archive/original/current.json
```

## Source GitHub

Par defaut, `content:import` utilise :

```text
raduprv/Magium@main
```

Le script resolve `main` en SHA exact. C'est volontaire : on beneficie des fixes de `main`, tout en gardant une build reproductible.

Pour forcer une autre ref :

```bash
MAGIUM_SOURCE_REF=<sha-ou-branch> pnpm content:import
```

Pour forcer un retelechargement meme si le SHA courant existe deja :

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

- scene order ;
- scenes ;
- paragraph blocks avec `messageId` ;
- choices avec `messageId`, target, assignments explicites, special ;
- conditions en AST ;
- set variables ;
- achievements par scene.

Depuis le format runtime V2, et dans les versions suivantes, chaque assignment a la forme :

```json
{ "variable": "v_available_points", "mode": "add", "value": 3 }
```

`mode: "set"` affecte une valeur absolue. `mode: "add"` ajoute un delta numerique. Les valeurs signees dans les sources (`+3`, `-3`) deviennent des deltas, ce qui est obligatoire pour les points de stats et les boosts narratifs. Une valeur non signee comme `v_max_stat = 4` reste une affectation absolue.

La locale `locales/en/<chapterId>.json` contient les textes originaux :

- paragraphes ;
- libelles de choix ;
- textes d'achievement embarques dans une scene.

`locales/en/achievements.json` contient les titres/captions du catalogue d'achievements.

## Adaptations Produit Du Runtime

L'archive brute reste une copie verifiable des sources originales. Les adaptations produit se font apres parsing, avant l'ecriture canonique et les packs runtime.

Le runtime supprime volontairement `Ch11b-Credits`, l'ancien ecran commercial de fin du livre 1. `Ch11b-Ending` conserve le dernier texte narratif et son unique bouton pointe directement vers `B2-Ch01a-Intro` avec `special: checkpoint_save`, `v_b1_saved_stats = 1`, `v_chapter_save_counter = 5` et `v_checkpoint_rich = 1`. Les textes de paiement, jetons, IAP, redemarrage et chargement de cette page ne doivent pas etre regeneres dans les packs runtime.

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

## Conditions

Les conditions `.magium` sont parsees vers :

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

`anyOf` represente les `||`.
`allOf` represente les `&&`.

`True` devient `null`.
`False` devient `{ "anyOf": [] }`.

Les lignes `choice(...) if (...)` doivent garder quatre donnees separees : target, assignments, `special` et condition. Le parser coupe le `if` apres la parenthese finale du choix pour eviter que la condition soit avalee dans `target`, `special` ou `setVariables`.

## Paquets Runtime

Chemin :

```text
src/generated/
```

Ces fichiers sont generes par `build-canonical.mjs`.

`src/generated/contentPacks.ts` expose une table de loaders dynamiques.
Chaque pack sous `src/generated/packs/` contient :

- encoding `base64+gzip` ;
- SHA-256 du blob compresse ;
- taille ;
- donnees encodees.

Le runtime :

1. importe dynamiquement le pack necessaire ;
2. decode base64 ;
3. verifie SHA-256 ;
4. decompresse gzip ;
5. parse JSON.

## Validation

`pnpm content:validate` verifie :

- 54 fichiers `.magium` archives ;
- scene order coherent ;
- targets existantes ou special explicite ;
- assignments explicites avec `mode: "set" | "add"` ;
- absence de condition `if` accidentellement embarquee dans un assignment ou un `special` ;
- messages presents pour tous les `messageId` ;
- achievements connus ;
- cles UI identiques entre `en` et les autres locales UI ;
- presence des packs `locales/<locale>/ui` dans `src/generated/contentPacks.ts` ;
- cles strictes des chapitres traduits par rapport a `en` ;
- cles stats identiques entre `en` et les autres locales de récit ;
- cles achievements traduites pour les chapitres couverts et packs story presents ;
- pas d'indice de `.magium` brut dans `src/generated/contentPacks.ts`.

`pnpm dist:check` verifie apres build :

- aucun `.magium` dans `dist/` ;
- aucun JSON canonique brut dans `dist/` ;
- pas d'extrait source brut evident.

## Modification Du Parser

Si un fichier `.magium` ne parse pas :

1. ne pas corriger le fichier archive ;
2. inspecter la syntaxe originale ;
3. modifier `tools/content/parser.mjs` ;
4. ajouter/adapter un test dans `tests/parser.test.mjs` ;
5. relancer `pnpm content:all && pnpm test`.
