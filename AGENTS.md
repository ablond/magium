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
- Les textes d'interface source sont dans `content/ui-locales/en.json` et `content/ui-locales/fr.json`, puis generes en packs runtime `locales/<locale>/ui`.
- Les traductions narratives source sont dans `content/story-locales/<locale>/*.json`, puis generees en packs runtime `locales/<locale>/<bundle>`.
- Le choix de langue Settings pilote `settings.uiLocale`, `settings.locale` et `GameState.locale`. Un chapitre absent dans la locale choisie retombe sur `en`.
- Les images Book 1 ont un workflow principal manuel ChatGPT : portraits, prompts de moments et WebP sous `public/visuals/book1`, sans RAG ni embeddings. Un chemin API OpenAI optionnel existe uniquement pour finir les illustrations manquantes via planches de references locales et Batch API.
- Le toggle Settings `settings.illustrations` affiche les illustrations de moments apres la scene declencheuse quand elles existent.
- Le panneau Debug existe uniquement sous `pnpm dev` / `import.meta.env.DEV` pour explorer scenes, choix, stats et variables. Un etat marque `debug.dirty` peut etre sauvegarde localement, mais ne doit jamais etre exportable en `.magium-save`.
- Les sauvegardes sont stockees dans IndexedDB sous forme AES-GCM, pas en clair dans localStorage.
- localStorage ne doit contenir que des preferences UI non critiques.

## Commandes De Verification Obligatoires

Avant de considerer une iteration terminee :

```bash
pnpm check
pnpm test
pnpm build
```

Si une iteration touche les prompts, assets ou l'affichage d'images Book 1, lancer aussi :

```bash
pnpm images:check -- --book 1
```

`pnpm build` execute aussi :

- `pnpm content:all`
- `vite build`
- `pnpm dist:check`

`dist:check` doit rester vert : aucun `.magium`, aucun JSON canonique brut, aucun extrait source brut evident dans `dist/`.

Si une iteration touche Docker, Coolify ou le packaging de production, lancer aussi :

```bash
pnpm docker:build-prod
```

Si l'objectif demande une publication d'image, aller jusqu'a :

```bash
pnpm docker:push-prod
```

L'image publiee manuellement est `ghcr.io/ablond/magium`, avec un tag timestamp UTC `YYYYMMDD-HHMMSS` et `latest`. Le deploiement Coolify principal peut aussi builder directement le `Dockerfile` a la racine via GitHub App.

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
- `docs/manual-images.md` pour les portraits, illustrations et prompts ChatGPT manuels ;
- `docs/deployment-coolify.md` pour Docker, GHCR et Coolify ;
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

Exceptions source : `content/ui-locales/*.json` et `content/story-locales/**/*.json` sont editables a la main. Les copies sous `content/canonical/v1/locales/**` et les packs sous `src/generated` restent generes.

Exception images : `public/visuals/book1/**/portrait.md` et `public/visuals/book1/**/illustration.md` sont generes par `pnpm images:prompts -- --book 1`, puis peuvent etre ajustes manuellement. Les fichiers WebP correspondants sont ajoutes manuellement apres generation dans ChatGPT Images, ou ponctuellement via le chemin API optionnel documente dans `docs/manual-images.md`.

## Packaging Docker Et Coolify

- Le Dockerfile de production est a la racine pour le build pack Dockerfile de Coolify via GitHub App. Il construit l'app avec pnpm, puis copie uniquement `dist/` dans une image `nginxinc/nginx-unprivileged` exposee sur le port `8080`.
- Le runtime Coolify peut builder depuis le depot. Le flux `pnpm docker:push-prod` reste un chemin optionnel pour publier une image preconstruite `ghcr.io/ablond/magium`.
- Ne pas copier `content/archive`, `content/canonical`, `src/generated` source, `node_modules`, `.env*` ou des exports `.magium-save` dans l'image finale.
- `.dockerignore` doit exclure les fichiers locaux sensibles ou volumineux, mais ne doit pas casser le build `pnpm build` dans le stage builder.
- `tools/docker/build-prod-push.sh` valide le filesystem de l'image, demarre le conteneur, teste `/`, `/sw.js`, `/manifest.webmanifest` et le fallback SPA avant push.
- Coolify doit utiliser le build pack Dockerfile, chemin `Dockerfile`, port expose `8080`, sans volume et sans variable d'environnement runtime. Si le deploiement utilise le package GHCR prive au lieu du build GitHub App, le serveur Coolify doit etre authentifie avec `docker login ghcr.io`.

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
   - copie les bundles UI depuis `content/ui-locales` vers `content/canonical/v1/locales/<locale>/ui.json` ;
   - copie les traductions narratives depuis `content/story-locales` vers `content/canonical/v1/locales/<locale>/` ;
   - genere les paquets runtime TS sous `src/generated`.
4. `content:validate`
   - verifie messages, targets, achievements, scene map, couverture stricte des cles UI/story/stats, packs generes, et absence de fuite brute dans les paquets generes.

## Pipeline Images Manuel Book 1

Ordre attendu :

1. `pnpm images:prompts -- --book 1`
   - lit les textes canoniques anglais du Book 1 ;
   - verifie les ancres manuelles de `tools/images/book1-config.mjs`, notamment les descriptions avant revelation du nom ;
   - ecrit des prompts Markdown courts sous `public/visuals/book1`.
2. Relire/corriger les prompts publics.
3. Generer les portraits dans ChatGPT Images, puis sauvegarder `portrait.webp`.
4. Pour preparer les dossiers ChatGPT, lancer `pnpm images:stage -- --book 1`. La commande stage tous les moments Book 1 par defaut ; utiliser `--moment <moment-id>` ou `--chapter <chapter-id>` pour limiter le scope.
5. Joindre dans ChatGPT les portraits renommes du dossier `output/visual/staging/book1/<moment-id>/references/`, coller `prompt.md`, puis sauvegarder `illustration.webp` sous `public/visuals/book1/moments/<moment-id>/`.
6. Si des PNG/JPG ont ete ajoutes depuis ChatGPT, lancer `pnpm images:normalize -- --book 1` pour creer les `illustration.webp` et archiver les originaux.
7. Pour le chemin API optionnel : `pnpm images:refsheets -- --book 1 --missing`, puis `OPENAI_API_KEY=... pnpm images:generate:api -- --book 1 --missing --batch --quality high --reference-mode sheets`. Recuperer ensuite le batch avec la commande `--retrieve` affichee par le script.
8. `pnpm images:check -- --book 1`
   - verifie la structure publique ;
   - refuse `evidenceRefs`, RAG, embeddings, marqueurs `.magium`, anciens dossiers `chapters` et copies longues du texte canonique ;
   - accepte les WebP manquants pendant la production.

Ne pas ajouter de RAG ni embeddings. Ne jamais committer de cle API ; `OPENAI_API_KEY` doit rester dans l'environnement local. Les manifests et planches API sous `output/visual/api-inputs/` et `output/visual/api-runs/` sont locaux et ignores par Git.

Pour enrichir les portraits ou moments, suivre la methode documentee dans `docs/manual-images.md`. Tous les personnages Book 1 doivent garder le niveau de detail applique a Barry et Daren : ancres canoniques courtes, separation explicite `Canon:` / `Design choice:` / `Avoid:`, portrait plein pied, equipement ou anatomie visible et style fantasy realiste sobre. Les moments doivent decrire lieu, architecture, materiaux, personnages anonymes, composition, continuite d'equipement et compatibilite multi-chemins quand la scene contient des conditions. Conserver les corrections canoniques deja verifiees : Azarius n'est pas Felran, Molan est un faon, Illuna et Petal sont la meme personne, Flower et Illuna partagent le meme corps mais ne doivent jamais etre attaches ensemble a un meme moment, Arraka est representee par l'amulette/aura et jamais attachee comme personnage de moment, Eleya est la renarde canonique, Taurus reste un animal naturel, Barry n'a pas d'arbalete avant `Ch6-Packing`, son stat device doit etre explicitement en main ou cache dans chaque moment, son sac reste ordinaire avant l'enchantement de Daren et ne montre glow/inventaire que sur demande, Barry part sans sac pour `ch11a-beggars-district-trap` et `ch11b-*`, Daren est visible et affaibli dans `ch1-cutthroat-dave`, et aucun portrait ne doit etre attache a un moment si le personnage n'est pas visible dans son `triggerSceneId`.

## Invariants Architecture

- Le graphe logique ne doit pas dependre d'une langue.
- Les images ne modifient pas le graphe logique, les sauvegardes ou le replay anti-triche.
- Les illustrations de moments sont resolues par une map statique `sceneId -> moment` et masquees si le WebP manque.
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
- Les stats et achievements affiches doivent suivre `GameState.locale`, avec fallback anglais par bundle absent.
- Les assignments canoniques sont explicites : `mode: "set"` remplace, `mode: "add"` additionne. Les valeurs source signees `+N` / `-N` sont des deltas.
- `v_max_stat` pilote le plafond manuel des stats (`3` par defaut, `4` quand le contenu original le definit). Les boosts narratifs peuvent depasser ce plafond, mais pas l'allocation UI.
- `history` contient des evenements types `choice` et `stats`; le replay doit verifier les allocations de stats, les points disponibles et les plafonds.

## Anti-Triche Et Sauvegardes

Objectif realiste : resistance et detection, pas securite absolue.

Contraintes :

- utiliser IndexedDB pour les saves ;
- chiffrer avec Web Crypto AES-GCM ;
- authentifier les donnees via AES-GCM additionalData ;
- maintenir un `historyDigest` chaine ;
- verifier un import par replay du parcours ;
- rejouer aussi les allocations de stats ;
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
- resultat de stat check apres un choix narratif, localise FR/EN ;
- panneau sauvegardes ;
- panneau Stats avant/apres revelation, allocation, max 3 puis 4, stats aura ;
- panneau achievements ;
- panneau settings/about ;
- panneau Debug visible en dev seulement, absent du build prod, avec jump de scene, choix caches, edition stats/variables, undo/redo et export bloque apres modification debug ;
- toggle Illustrations et image de moment presente/absente ;
- bascule de langue FR/EN sans reset de partie, avec récit et stats traduits quand le pack existe.

## Pieges Connus

- Le dev server Vite peut voir `src/generated` changer pendant `content:all` et produire des erreurs HMR temporaires. Si cela arrive, relancer la page apres regeneration. Le build propre reste la reference.
- `content:import` prend `main` a jour, puis epingle le SHA exact dans le manifest. Ce n'est pas un vieux commit historique.
- Les fichiers `logic.txt` originaux peuvent aider a auditer, mais la source runtime principale est `.magium`.
- L'app est 100% client. Un utilisateur determine avec DevTools peut toujours patcher le code execute ; ne pas promettre une anti-triche absolue sans backend.

## Prochaines Iterations Logiques

- UI de selection de chapitre/livre.
- Tests navigateur automatises pour les resultats de stat checks post-choix.
- Workflow i18n narratif : export XLIFF/JSON de traduction, import, coverage report.
- Tests navigateur automatises pour export/import et offline.
- Gestion plus fine des saves incompatibles lors d'un changement de `contentVersion`.
