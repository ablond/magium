# Pipeline Contenu

## Objectif

Transformer les fichiers originaux en contenu standard et verifiable, sans perdre la possibilite d'auditer les sources.

Le pipeline produit :

- une archive brute immuable ;
- un JSON canonique lisible ;
- des paquets runtime compresses et verifies ;
- un index global du contenu.

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
```

Le graphe `story/<chapterId>.json` contient la logique :

- scene order ;
- scenes ;
- paragraph blocks avec `messageId` ;
- choices avec `messageId`, target, assignments, special ;
- conditions en AST ;
- set variables ;
- achievements par scene.

La locale `locales/en/<chapterId>.json` contient les textes originaux :

- paragraphes ;
- libelles de choix ;
- textes d'achievement embarques dans une scene.

`locales/en/achievements.json` contient les titres/captions du catalogue d'achievements.

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
- messages presents pour tous les `messageId` ;
- achievements connus ;
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
