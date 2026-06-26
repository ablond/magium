# AGENTS.md

Ce fichier est le point d'entree pour tout agent IA qui reprend le projet.

## Objectif Produit

Construire une PWA jouable de Magium a partir des textes originaux, avec :

- contenu original archive et verifiable ;
- runtime qui ne sert pas les `.magium` ni les JSON canoniques bruts ;
- moteur de jeu client-side ;
- i18n multi-langues preparee ;
- sauvegardes locales chiffrees, exportables sans compte ;
- interface immersive, sombre, arcane, lisible sur mobile et desktop.

## Etat Actuel A Respecter

- La source de verite contenu est `raduprv/Magium@main`, capturee au commit courant dans `content/archive/original/current.json`.
- Les fichiers `.magium` sont archives pour audit et regeneration, mais ne sont jamais lus directement par l'app.
- Le runtime lit seulement des paquets generes sous `src/generated`.
- Ces paquets sont compresses, encodes, decoupes par chapitre/langue, et verifies par SHA-256 avant decompression.
- Les sauvegardes sont stockees dans IndexedDB sous forme AES-GCM, pas en clair dans localStorage.
- localStorage ne doit contenir que des preferences UI non critiques.

## Commandes De Verification Obligatoires

Avant de considerer une iteration terminee :

```bash
pnpm check
pnpm test
pnpm build
```

`pnpm build` execute aussi :

- `pnpm content:all`
- `vite build`
- `pnpm dist:check`

`dist:check` doit rester vert : aucun `.magium`, aucun JSON canonique brut, aucun extrait source brut evident dans `dist/`.

## Documentation Obligatoire

La documentation fait partie du produit. Elle doit etre maintenue, corrigee et synchronisee a chaque iteration.

Si une modification change une commande, un flux, une structure de fichier, une limite de securite, un comportement UI, le pipeline contenu, le modele i18n ou les sauvegardes, mettre a jour la documentation dans le meme changement.

Ne pas laisser une doc connue comme fausse, incomplete ou ambigue. Si une verification montre que la doc ne correspond plus au comportement reel, corriger la doc avant de terminer.

Fichiers a considerer en priorite :

- `README.md` pour la vue d'ensemble et les commandes ;
- `AGENTS.md` pour les consignes de reprise par agents IA ;
- `docs/architecture.md` pour les decisions systeme ;
- `docs/content-pipeline.md` pour import, parsing, canonicalisation et packs ;
- `docs/runtime-engine.md` pour le moteur ;
- `docs/saves-and-anti-tamper.md` pour stockage, chiffrement et limites ;
- `docs/i18n.md` pour le modele de traduction ;
- `docs/verification.md` pour les checks attendus.

## Fichiers Generes Ou Immuables

Ne pas editer a la main :

- `content/archive/original/**`
- `content/canonical/v1/**`
- `src/generated/**`

Pour changer ces fichiers, modifier les scripts sous `tools/content/`, puis lancer :

```bash
pnpm content:all
```

## Pipeline Contenu

Ordre attendu :

1. `content:import`
   - resolve `raduprv/Magium@main` en SHA exact ;
   - archive `README.md`, `LICENSE`, `chapters/**` ;
   - genere `manifest.json` avec tailles et SHA-256 ;
   - verifie qu'il y a 54 `.magium`.
2. `content:archive:check`
   - relit l'archive et compare les hash.
3. `content:parse`
   - parse les `.magium` ;
   - ecrit le graphe logique dans `content/canonical/v1/story`;
   - ecrit les messages anglais dans `content/canonical/v1/locales/en`;
   - genere les paquets runtime TS sous `src/generated`.
4. `content:validate`
   - verifie messages, targets, achievements, scene map, et absence de fuite brute dans les paquets generes.

## Invariants Architecture

- Le graphe logique ne doit pas dependre d'une langue.
- Les traductions futures ne doivent jamais modifier :
  - scene IDs ;
  - choice targets ;
  - variable names ;
  - conditions ;
  - assignments ;
  - specials ;
  - achievement variables.
- Ajouter une langue signifie ajouter des messages pour les memes `messageId`.
- Le fallback runtime est `en`.
- Les chunks runtime doivent rester lazy-loades par chapitre/langue.

## Anti-Triche Et Sauvegardes

Objectif realiste : resistance et detection, pas securite absolue.

Contraintes :

- utiliser IndexedDB pour les saves ;
- chiffrer avec Web Crypto AES-GCM ;
- authentifier les donnees via AES-GCM additionalData ;
- maintenir un `historyDigest` chaine ;
- verifier un import par replay du parcours ;
- rejeter une sauvegarde decryptee si son etat ne correspond pas a un chemin jouable.

Ne pas :

- stocker variables/stats/achievements en clair ;
- ajouter un fallback localStorage pour les donnees de jeu ;
- accepter un import seulement parce qu'il se decrypte.

## UI / UX

Premiere vue = experience jouable, pas landing page.

Direction :

- fantasy sombre, arcane, epique ;
- texte prioritaire ;
- commandes compactes ;
- lisible mobile ;
- pas de decorations qui cassent la lecture ;
- pas de texte qui chevauche ses conteneurs.

Apres changement UI, verifier au moins :

- desktop 1280 x 720 ;
- mobile environ 390 x 844 ;
- scene avec paragraphe long ;
- scene qui commence par `...` ;
- panneau sauvegardes ;
- panneau Abilities avant/apres revelation ;
- panneau achievements ;
- panneau settings/about.

## Pieges Connus

- Le dev server Vite peut voir `src/generated` changer pendant `content:all` et produire des erreurs HMR temporaires. Si cela arrive, relancer la page apres regeneration. Le build propre reste la reference.
- `content:import` prend `main` a jour, puis epingle le SHA exact dans le manifest. Ce n'est pas un vieux commit historique.
- Les fichiers `logic.txt` originaux peuvent aider a auditer, mais la source runtime principale est `.magium`.
- L'app est 100% client. Un utilisateur determine avec DevTools peut toujours patcher le code execute ; ne pas promettre une anti-triche absolue sans backend.

## Prochaines Iterations Logiques

- UI de selection de chapitre/livre.
- Amelioration de la gestion des stats et stat checks.
- Workflow i18n : export XLIFF/JSON de traduction, import, coverage report.
- Tests navigateur automatises pour export/import et offline.
- Gestion plus fine des saves incompatibles lors d'un changement de `contentVersion`.
