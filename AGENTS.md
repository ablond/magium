# AGENTS.md

Ce fichier est le point d'entrée pour tout agent IA qui reprend le projet.

## Objectif Produit

Construire une PWA jouable de Magium à partir des textes originaux, avec :

- contenu original archivé et vérifiable ;
- runtime qui ne sert pas les `.magium` ni les JSON canoniques bruts ;
- moteur de jeu client-side ;
- i18n multi-langues préparée ;
- sauvegardes locales chiffrées, exportables sans compte ;
- interface immersive, sombre, arcane, lisible sur mobile et desktop.

## État Actuel À Respecter

- La source de vérité contenu est `raduprv/Magium@main`, capturée au commit courant dans `content/archive/original/current.json`.
- Les fichiers `.magium` sont archivés pour audit et régénération, mais ne sont jamais lus directement par l'app.
- Le runtime lit seulement des paquets générés sous `src/generated`.
- Ces paquets sont compressés, encodés, découpés par chapitre/langue, et vérifiés par SHA-256 avant décompression.
- Le pipeline garde l'archive originale intacte, mais applique les adaptations produit nécessaires au runtime. `Ch11b-Credits`, l'ancien écran commercial de fin du livre 1, est supprimé des paquets runtime ; `Ch11b-Ending` doit proposer directement le passage au livre 2 via un checkpoint.
- Les textes d'interface source sont dans `content/ui-locales/en.json` et `content/ui-locales/fr.json`, puis générés en packs runtime `locales/<locale>/ui`.
- Les traductions narratives source sont dans `content/story-locales/<locale>/*.json`, puis générées en packs runtime `locales/<locale>/<bundle>`.
- Le choix de langue Settings pilote `settings.uiLocale`, `settings.locale` et `GameState.locale`. Un chapitre absent dans la locale choisie retombe sur `en`.
- La PWA peut proposer une correction de traduction depuis un paragraphe ou choix visible. Pour les textes narratifs, la cible joueur est le paragraphe affiché (`segmentIndex` dans le `messageId`), pas le bloc multi-paragraphes complet. Cette contribution part vers un service séparé `services/translation-api`; elle ne modifie jamais directement le runtime ni les sources.
- Les corrections publiques sont anonymes par défaut. Pseudo et email sont facultatifs, le pseudo sert uniquement aux crédits demandés et reste modérable, l'email sert uniquement au suivi confirmé puis doit être supprimé après refus ou publication.
- Une proposition acceptée doit être groupée dans un changeset mainteneur, appliquée à `content/story-locales/<locale>/<chapter>.json`, régénérée avec `pnpm content:all`, validée, puis livrée par PR GitHub. Ne jamais créer une PR par proposition individuelle.
- Les images Book 1 ont un workflow principal manuel ChatGPT : portraits, prompts de moments et WebP sous `public/visuals/book1`, sans RAG ni embeddings. Un chemin API OpenAI optionnel existe uniquement pour finir les illustrations manquantes via planches de références locales et Batch API.
- Le toggle Settings `settings.illustrations` affiche les illustrations de moments après la scène déclencheuse quand elles existent. Certains `sceneId` communs peuvent choisir une variante conditionnelle avec les variables de jeu, par exemple `Ch11b-Ending` selon `v_ch11_saved_rose`.
- Le panneau Debug existe uniquement sous `pnpm dev` / `import.meta.env.DEV` pour explorer scènes, choix, stats et variables. Un état marqué `debug.dirty` peut être sauvegardé localement, mais ne doit jamais être exportable en `.magium-save`.
- Les sauvegardes sont stockées dans IndexedDB sous forme AES-GCM, pas en clair dans localStorage.
- La collection globale des succès est aussi stockée dans IndexedDB sous forme AES-GCM, séparément de `GameState.achievements`. `GameState.achievements` reste l'état rejouable de la partie courante et peut revenir en arrière avec restart/checkpoint.
- Le panneau Sauvegardes doit rester joueur : sauvegarde automatique, sauvegardes locales nommables/renommables, point de contrôle, puis transfert. Ne pas afficher `slotId`, IDs de scène bruts, `route`, `prod`, `local-key` ou `pbkdf2` dans l'UX joueur.
- Les sauvegardes locales ne demandent pas de mot de passe. L'export/import `.magium-save` demande un mot de passe uniquement dans le flux dédié après clic sur Exporter ou Importer.
- localStorage ne doit contenir que des préférences UI non critiques.

## Commandes De Vérification Obligatoires

Avant de considérer une itération terminée :

```bash
pnpm check
pnpm test
pnpm build
```

Si une itération touche les prompts, assets ou l'affichage d'images Book 1, lancer aussi :

```bash
pnpm images:check -- --book 1
pnpm images:test
```

`pnpm images:test` couvre les tests Vitest du pipeline images Book 1, notamment les planches de références et le JSONL OpenAI Batch. Il nécessite `ffmpeg` et n'est pas inclus dans `pnpm test`, pour que les workflows de traduction ne dépendent pas des outils images.

`pnpm build` exécute aussi :

- `pnpm content:all`
- `vite build`
- `pnpm dist:check`

`dist:check` doit rester vert : aucun `.magium`, aucun JSON canonique brut, aucun extrait source brut évident dans `dist/`.

Si une itération touche Docker, Coolify ou le packaging de production, lancer aussi :

```bash
pnpm docker:build-prod
```

Si l'objectif demande une publication d'image, aller jusqu'à :

```bash
pnpm docker:push-prod
```

L'image publiée manuellement est `ghcr.io/ablond/magium`, avec un tag timestamp UTC `YYYYMMDD-HHMMSS` et `latest`. Le déploiement Coolify principal peut aussi builder directement le `Dockerfile` à la racine via GitHub App.

Pour vérifier le stack local Docker, utiliser `docker compose up -d --build`, puis tester `http://localhost:5173`, `http://localhost:8090/health`, une proposition publique et une route admin avec le token local `dev-admin-token`. `docker compose down -v` reset la base PostgreSQL locale.

## Documentation Obligatoire

La documentation fait partie du produit. Elle doit être maintenue, corrigée et synchronisée à chaque itération.

Si une modification change une commande, un flux, une structure de fichier, une limite de sécurité, un comportement UI, le pipeline contenu, le modèle i18n ou les sauvegardes, mettre à jour la documentation dans le même changement.

Ne pas laisser une doc connue comme fausse, incomplète ou ambiguë. Si une vérification montre que la doc ne correspond plus au comportement réel, corriger la doc avant de terminer.

Fichiers à considérer en priorité :

- `README.md` pour la vue d'ensemble et les commandes ;
- `AGENTS.md` pour les consignes de reprise par agents IA ;
- `docs/architecture.md` pour les décisions système ;
- `docs/content-pipeline.md` pour import, parsing, canonicalisation et packs ;
- `docs/runtime-engine.md` pour le moteur ;
- `docs/saves-and-anti-tamper.md` pour stockage, chiffrement et limites ;
- `docs/i18n.md` pour le modèle de traduction ;
- `docs/contributions.md` pour propositions publiques, privacy, API de revue et changesets ;
- `docs/translation-contributions-system.md` comme source de reprise technique exhaustive du sous-système contributions traduction, incluant PWA, API, PostgreSQL, Mailpit, double opt-in email, admin mainteneur, diff, changesets, workflow GitHub PR, Docker local et Coolify ;
- `docs/manual-images.md` pour les portraits, illustrations et prompts ChatGPT manuels ;
- `docs/deployment-coolify.md` pour Docker, GHCR et Coolify ;
- `docs/verification.md` pour les checks attendus.

## Fichiers Générés Ou Immuables

Ne pas éditer à la main :

- `content/archive/original/**`
- `content/canonical/v1/**`
- `src/generated/**`

Pour changer ces fichiers, modifier les scripts sous `tools/content/`, puis lancer :

```bash
pnpm content:all
```

Exceptions source : `content/ui-locales/*.json` et `content/story-locales/**/*.json` sont éditables à la main. Les copies sous `content/canonical/v1/locales/**` et les packs sous `src/generated` restent générés.

Exception images : `public/visuals/book1/**/portrait.md` et `public/visuals/book1/**/illustration.md` sont générés par `pnpm images:prompts -- --book 1`, puis peuvent être ajustés manuellement. Les fichiers WebP correspondants sont ajoutés manuellement après génération dans ChatGPT Images, ou ponctuellement via le chemin API optionnel documenté dans `docs/manual-images.md`.

## Packaging Docker Et Coolify

- Le Dockerfile de production est à la racine pour le build pack Dockerfile de Coolify via GitHub App. Il construit l'app avec pnpm, puis copie uniquement `dist/` dans une image `nginxinc/nginx-unprivileged` exposée sur le port `8080`.
- Le Dockerfile racine accepte les build args `VITE_MAGIUM_CONTRIBUTIONS_API_URL` et `VITE_MAGIUM_TURNSTILE_SITE_KEY` pour activer le formulaire de contribution dans l'image PWA. Les valeurs par défaut restent vides.
- Le runtime Coolify peut builder depuis le dépôt. Le flux `pnpm docker:push-prod` reste un chemin optionnel pour publier une image préconstruite `ghcr.io/ablond/magium`.
- Le service `services/translation-api` a son propre Dockerfile et doit être déployé comme application Coolify séparée du runtime PWA, avec une base PostgreSQL séparée.
- Le compose local lance la PWA en mode Vite dev, l'API de contribution et PostgreSQL. Les valeurs locales sont non secrètes et ne doivent pas être recopiées en production.
- Ne pas copier `content/archive`, `content/canonical`, `src/generated` source, `node_modules`, `.env*` ou des exports `.magium-save` dans l'image finale.
- `.dockerignore` doit exclure les fichiers locaux sensibles ou volumineux, mais ne doit pas casser le build `pnpm build` dans le stage builder.
- `tools/docker/build-prod-push.sh` valide le filesystem de l'image, démarre le conteneur, teste `/`, `/sw.js`, `/manifest.webmanifest` et le fallback SPA avant push.
- Coolify PWA doit utiliser le build pack Dockerfile, chemin `Dockerfile`, port exposé `8080`, sans volume et sans variable d'environnement runtime. Si le déploiement utilise le package GHCR privé au lieu du build GitHub App, le serveur Coolify doit être authentifié avec `docker login ghcr.io`.

## Pipeline Contenu

Ordre attendu :

1. `content:import`
   - resolve `raduprv/Magium@main` en SHA exact ;
   - archive `README.md`, `LICENSE`, `chapters/**` ;
   - génère `manifest.json` avec tailles et SHA-256 ;
   - vérifie qu'il y a 54 `.magium`.
2. `content:archive:check`
   - relit l'archive et compare les hash.
3. `content:parse`
   - parse les `.magium` ;
   - écrit le graphe logique dans `content/canonical/v1/story`;
   - écrit les messages anglais dans `content/canonical/v1/locales/en`;
   - copie les bundles UI depuis `content/ui-locales` vers `content/canonical/v1/locales/<locale>/ui.json` ;
   - copie les traductions narratives depuis `content/story-locales` vers `content/canonical/v1/locales/<locale>/` ;
   - génère les paquets runtime TS sous `src/generated`.
4. `content:validate`
   - vérifie messages, targets, achievements, scène map, couverture stricte des clés UI/story/stats, packs générés, et absence de fuite brute dans les paquets générés.

## Contributions Publiques De Traduction

Avant de modifier ce sous-système, lire `docs/translation-contributions-system.md`. C'est la référence de reprise pour les routes, variables d'environnement, schéma PostgreSQL, statuts, email, admin, changesets, GitHub dispatch, Docker local et Coolify. `docs/contributions.md` reste la vue produit/fonctionnelle.

- La PWA affiche des boutons `Proposer une correction` sur les paragraphes et choix visibles. Le modal joueur doit afficher et préremplir uniquement le paragraphe cliqué ; les choix restent corrigés en entier. Ne pas afficher au joueur `messageId`, `sceneId`, `chapterId`, `contentVersion`, `segmentIndex`, hash ou autre détail de routage.
- Les variables de build PWA sont `VITE_MAGIUM_CONTRIBUTIONS_API_URL` et `VITE_MAGIUM_TURNSTILE_SITE_KEY`.
- Le service `services/translation-api` est séparé du runtime PWA, exposé `/health`, utilise PostgreSQL en production, et peut être lancé localement avec `docker compose up -d`. Il ne doit pas servir les fichiers canoniques ou les packs générés comme JSON public.
- Le captcha par défaut documenté est Cloudflare Turnstile en mode invisible/non interactif, avec validation obligatoire côté API via Siteverify. `TURNSTILE_DISABLED=1` est réservé au dev/test.
- Les routes admin doivent rester protégées par `ADMIN_TOKEN` pour les scripts, ou par la session web mainteneur de `/admin` avec cookie `HttpOnly` et CSRF pour les actions mutantes. Le compose local utilise `dev-admin-token` et `dev-admin-password`, valeurs non secrètes interdites en production.
- Une proposition publique reste en base jusqu'à revue. Le mainteneur peut accepter, rejeter ou marquer obsolète ; l'acceptation produit une version finale éditable, pas un merge automatique.
- Les propositions concurrentes sur un même choix ou un même segment `locale/chapterId/messageId/segmentIndex` doivent être résolues dans l'outil de revue. Un changeset peut contenir plusieurs corrections du même `messageId` si les `segmentIndex` sont différents.
- L'admin mainteneur peut afficher `currentText` et un diff visuel pour aider la revue, mais seule la version finale retenue est éditable et intégrée au changeset. Les anciennes propositions sans `currentText` doivent rester consultables sans diff.
- `tools/contributions/apply-changeset.mjs` refuse un changeset si `currentTextHash` ne correspond plus au texte source éditable courant. Pour un paragraphe, comparer le hash du segment cible et remplacer uniquement ce segment dans la valeur JSON complète. Dans ce cas, marquer le changeset/propositions `stale` au lieu de forcer.
- Le workflow `.github/workflows/translation-changeset-pr.yml` doit lancer `pnpm content:all`, `pnpm check`, `pnpm test` et `pnpm build` avant de créer la PR. `pnpm test` exclut les tests manuels Book 1 qui génèrent des WebP avec `ffmpeg`.
- Les emails de suivi doivent rester séparés des propositions publiques, confirmés par token, non affichés dans l'admin public/PR, et supprimés après rejet, stale ou publication. Le consentement de suivi est réutilisable un an par navigateur via un jeton local ; côté serveur, ne stocker pour ce consentement qu'un HMAC d'email et un hash de jeton, jamais l'email brut.
- Les pseudos de crédit sont publics seulement si le contributeur l'a demandé et si le mainteneur les approuve. Refuser ou masquer les pseudos illégaux, violents, haineux, sexuellement explicites, pédopornographiques, de doxxing, d'usurpation ou manifestement inadaptés.
- La page publique `/legal/contributions.html` doit rester cohérente avec ce comportement. Compléter les mentions légales de l'instance avant activation publique.

## Pipeline Images Manuel Book 1

Ordre attendu :

1. `pnpm images:prompts -- --book 1`
   - lit les textes canoniques anglais du Book 1 ;
   - vérifie les ancres manuelles de `tools/images/book1-config.mjs`, notamment les descriptions avant révélation du nom ;
   - écrit des prompts Markdown courts sous `public/visuals/book1`.
2. Relire/corriger les prompts publics.
3. Générer les portraits dans ChatGPT Images, puis sauvegarder `portrait.webp`.
4. Pour préparer les dossiers ChatGPT, lancer `pnpm images:stage -- --book 1`. La commande stage tous les moments Book 1 par défaut ; utiliser `--moment <moment-id>` ou `--chapter <chapter-id>` pour limiter le scope.
5. Joindre dans ChatGPT les portraits renommés du dossier `output/visual/staging/book1/<moment-id>/references/`, coller `prompt.md`, puis sauvegarder `illustration.webp` sous `public/visuals/book1/moments/<moment-id>/`.
6. Si des PNG/JPG ont été ajoutés depuis ChatGPT, lancer `pnpm images:normalize -- --book 1` pour créer les `illustration.webp` et archiver les originaux.
7. Pour le chemin API optionnel : `pnpm images:refsheets -- --book 1 --missing`, puis `OPENAI_API_KEY=... pnpm images:generate:api -- --book 1 --missing --batch --quality high --reference-mode sheets`. Récupérer ensuite le batch avec la commande `--retrieve` affichée par le script.
8. `pnpm images:test`
   - nécessite `ffmpeg` ;
   - vérifie les prompts, les références personnages, les planches de références API et le JSONL OpenAI Batch ;
   - reste séparé de `pnpm test` pour ne pas imposer `ffmpeg` aux workflows non image.
9. `pnpm images:check -- --book 1`
   - vérifie la structure publique ;
   - refuse `evidenceRefs`, RAG, embeddings, marqueurs `.magium`, anciens dossiers `chapters` et copies longues du texte canonique ;
   - accepte les WebP manquants pendant la production.

Ne pas ajouter de RAG ni embeddings. Ne jamais committer de clé API ; `OPENAI_API_KEY` doit rester dans l'environnement local. Les manifests et planches API sous `output/visual/api-inputs/` et `output/visual/api-runs/` sont locaux et ignorés par Git.

Pour enrichir les portraits ou moments, suivre la méthode documentée dans `docs/manual-images.md`. Tous les personnages Book 1 doivent garder le niveau de détail appliqué à Barry et Daren : ancres canoniques courtes, séparation explicite `Canon:` / `Design choice:` / `Avoid:`, portrait plein pied, équipement ou anatomie visible et style fantasy réaliste sobre. Les moments doivent décrire lieu, architecture, matériaux, personnages anonymes, composition, continuité d'équipement et compatibilité multi-chemins quand la scène contient des conditions. Conserver les corrections canoniques déjà vérifiées : Azarius n'est pas Felran, Molan est un faon, Illuna et Petal sont la même personne, Flower et Illuna partagent le même corps mais ne doivent jamais être attachés ensemble à un même moment, Arraka est représentée par l'amulette/aura et jamais attachée comme personnage de moment, Eleya est la renarde canonique, Taurus reste un animal naturel, Barry n'a pas d'arbalète avant `Ch6-Packing`, son stat device doit être explicitement en main ou caché dans chaque moment, son sac reste ordinaire avant l'enchantement de Daren et ne montre glow/inventaire que sur demande, Barry part sans sac pour `ch11a-beggars-district-trap` et `ch11b-*`, Daren est visible et affaibli dans `ch1-cutthroat-dave`, `Ch11b-Ending` doit utiliser la variante sans Rose quand `v_ch11_saved_rose` n'est pas `1`, et aucun portrait ne doit être attaché à un moment si le personnage n'est pas visible dans son `triggerSceneId`.

## Invariants Architecture

- Le graphe logique ne doit pas dépendre d'une langue.
- Les images ne modifient pas le graphe logique, les sauvegardes ou le replay anti-triche.
- Les illustrations de moments sont résolues par une map statique `sceneId -> moment`, avec variantes conditionnelles possibles par variables de jeu, et masquées si le WebP manque.
- Les traductions futures ne doivent jamais modifier :
  - scène IDs ;
  - choice targets ;
  - variable names ;
  - conditions ;
  - assignments ;
  - specials ;
  - achievement variables.
- Ajouter une langue signifie ajouter des messages pour les mêmes `messageId`.
- Le fallback runtime est `en`.
- Les chunks runtime doivent rester lazy-loadés par chapitre/langue.
- Les stats et achievements affichés doivent suivre `GameState.locale`, avec fallback anglais par bundle absent.
- Les assignments canoniques sont explicites : `mode: "set"` remplace, `mode: "add"` additionne. Les valeurs source signées `+N` / `-N` sont des deltas.
- `v_max_stat` pilote le plafond manuel des stats (`3` par défaut, `4` quand le contenu original le définit). Les boosts narratifs peuvent dépasser ce plafond, mais pas l'allocation UI.
- `history` contient des événements types `choice` et `stats`; le replay doit vérifier les allocations de stats, les points disponibles et les plafonds.

## Anti-Triche Et Sauvegardes

Objectif réaliste : résistance et détection, pas sécurité absolue.

Contraintes :

- utiliser IndexedDB pour les saves ;
- chiffrer avec Web Crypto AES-GCM ;
- conserver les succès globaux dans un store chiffré séparé des saves ;
- authentifier les données via AES-GCM additionalData ;
- maintenir un `historyDigest` chaîne ;
- vérifier un import par replay du parcours ;
- rejouer aussi les allocations de stats ;
- rejeter une sauvegarde déchiffrée si son état ne correspond pas à un chemin jouable.

Ne pas :

- stocker variables/stats/achievements en clair ;
- ajouter un fallback localStorage pour les données de jeu ;
- alimenter les succès globaux depuis un état `debug.dirty` ;
- accepter un import seulement parce qu'il se déchiffre.

## UI / UX

Première vue = expérience jouable, pas landing page.

Direction :

- fantasy sombre, arcane, épique ;
- texte prioritaire ;
- commandes compactes ;
- lisible mobile ;
- pas de décorations qui cassent la lecture ;
- pas de texte qui chevauche ses conteneurs.

Après changement UI, vérifier au moins :

- desktop 1280 x 720 ;
- mobile environ 390 x 844 ;
- scène avec paragraphe long ;
- scène qui commence par `...` ;
- résultat de stat check après un choix narratif, localisé FR/EN ;
- panneau Sauvegardes avec sauvegarde automatique, sauvegardes locales, renommage, point de contrôle, export/import avec mot de passe affiché seulement dans le flux de transfert ;
- panneau Stats avant/après révélation, allocation, max 3 puis 4, stats aura ;
- panneau achievements, y compris conservation d'un succès de mort après retour checkpoint ou nouvelle partie ;
- panneau settings/about ;
- panneau Debug visible en dev seulement, absent du build prod, avec jump de scène, choix cachés, édition stats/variables, undo/redo et export bloqué après modification debug ;
- toggle Illustrations et image de moment présente/absente ;
- bascule de langue FR/EN sans reset de partie, avec récit et stats traduits quand le pack existe.

## Pièges Connus

- Le dev server Vite peut voir `src/generated` changer pendant `content:all` et produire des erreurs HMR temporaires. Si cela arrive, relancer la page après régénération. Le build propre reste la référence.
- `content:import` prend `main` à jour, puis épingle le SHA exact dans le manifest. Ce n'est pas un vieux commit historique.
- Les fichiers `logic.txt` originaux peuvent aider à auditer, mais la source runtime principale est `.magium`.
- L'app est 100% client. Un utilisateur déterminé avec DevTools peut toujours patcher le code exécuté ; ne pas promettre une anti-triche absolue sans backend.

## Prochaines Itérations Logiques

- UI de sélection de chapitre/livre.
- Tests navigateur automatisés pour les résultats de stat checks post-choix.
- Workflow i18n narratif : export XLIFF/JSON de traduction, import, coverage report.
- Tests navigateur automatisés pour export/import et offline.
- Gestion plus fine des saves incompatibles lors d'un changement de `contentVersion`.
