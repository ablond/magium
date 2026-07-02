# Architecture

## Vue D'Ensemble

Le runtime jouable est une PWA statique. Il n'y a pas de backend, pas de compte utilisateur, pas de stockage cloud pour jouer, sauvegarder ou relire une partie.

Un service séparé optionnel existe pour les contributions publiques de traduction. Il ne fait pas partie du runtime jeu, ne sert pas les JSON canoniques bruts, et ne publie jamais une correction sans revue mainteneur et PR GitHub. Son interface mainteneur est servie par le service API sur `/admin`, protégée par mot de passe serveur, cookie `HttpOnly` et CSRF ; la PWA joueur reste statique.

Le système est découpé en quatre couches :

1. Sources archivées
   - fichiers originaux `.magium` et données associées ;
   - conservés pour audit, régénération et preuve de provenance.
2. Contenu canonique
   - JSON lisible, normalisé, généré depuis les sources ;
   - séparé logique, messages narratifs et messages UI.
3. Paquets runtime
   - modules TypeScript générés contenant des blobs `base64+gzip` ;
   - chargés dynamiquement par chapitre/langue ;
   - vérifiés par SHA-256 avant utilisation.
4. Application
   - moteur de scène ;
   - i18n ;
   - stockage chiffré ;
   - UI PWA ;
   - affichage optionnel des illustrations de moments Book 1.
5. Image de production
   - build Vite sous Node/pnpm ;
   - copie de `dist/` seulement dans nginx unprivileged ;
   - service statique exposé sur `8080` pour Coolify.
6. Service contribution traduction
   - API Node séparée sous `services/translation-api` ;
   - stockage PostgreSQL des propositions et emails confirmés ;
   - revue par lots, dispatch GitHub Actions et PR unique par changeset.

## Flux De Données

```text
raduprv/Magium@main
  -> tools/content/import-original.mjs
  -> content/archive/original/<sha>/
  -> tools/content/build-canonical.mjs
  -> content/canonical/v1/
  -> src/generated/
  -> src/lib/content/packedContent.ts
  -> src/lib/story/engine.ts
  -> src/App.svelte

content/ui-locales/*.json
  -> tools/content/build-canonical.mjs
  -> content/canonical/v1/locales/<locale>/ui.json
  -> src/generated/packs/locales__<locale>__ui.ts
  -> src/lib/i18n/ui.ts
  -> src/App.svelte

content/story-locales/<locale>/*.json
  -> tools/content/build-canonical.mjs
  -> content/canonical/v1/locales/<locale>/
  -> src/generated/packs/locales__<locale>__*.ts
  -> src/lib/content/packedContent.ts
  -> src/App.svelte

content/canonical/v1/{locales/en,story}/ch*.json
  -> tools/images/generate-prompts.mjs
  -> public/visuals/book1/**/{portrait,illustration}.md
  -> tools/images/stage-chatgpt.mjs
  -> output/visual/staging/book1/<moment-id>/
  -> génération manuelle ChatGPT Images
  -> public/visuals/book1/**/*.webp
  -> src/lib/visuals/book1.ts
  -> src/App.svelte

PWA contribution form
  -> services/translation-api
  -> PostgreSQL proposals + optional contacts
  -> maintainer changeset
  -> .github/workflows/translation-changeset-pr.yml
  -> tools/contributions/apply-changeset.mjs
  -> content/story-locales/<locale>/<chapter>.json
  -> pnpm content:all && pnpm check && pnpm test && pnpm build
  -> GitHub pull request
```

## Choix Techniques

- Svelte + Vite + TypeScript : app statique, rapide à itérer.
- Pas de SvelteKit pour l'instant : aucune route serveur ni SSR nécessaire.
- IndexedDB natif : stockage local plus adapté que localStorage pour des blobs chiffrés et clés CryptoKey.
- Succès globaux : collection locale chiffrée dans IndexedDB, séparée de `GameState.achievements` pour survivre aux restart/checkpoints sans affaiblir le replay anti-tamper.
- Web Crypto API : AES-GCM, PBKDF2, SHA-256 sans dépendance externe.
- Runtime packs en modules TS : pas de `.json` public et lazy loading par import dynamique.
- Langue globale : le setting FR/EN met à jour le shell UI, `GameState.locale`, les textes narratifs disponibles, les achievements et les stats. Les chapitres non traduits retombent sur `en`.
- Contributions de traduction : formulaire anonyme par défaut dans la PWA, Cloudflare Turnstile configurable, email optionnel avec confirmation, pseudo optionnel pour crédits, API séparée et PR GitHub par changeset.
- Images Book 1 : workflow manuel ChatGPT, sans RAG, sans embeddings et sans API OpenAI. Les prompts publics restent courts et paraphrasés, les portraits vivent sous `public/visuals/book1/characters` et les illustrations affichables sous `public/visuals/book1/moments`.
- Docker de production : le `Dockerfile` racine est compatible avec le build pack Dockerfile de Coolify via GitHub App. Le stage builder exécute `pnpm build`, puis le stage runtime `nginxinc/nginx-unprivileged` ne contient que les assets publics de `dist/` et expose le port `8080`.

## Repères De Code

- UI principale : `src/App.svelte`
- Style global : `src/app.css`
- Sources UI i18n : `content/ui-locales/*.json`
- Sources story i18n : `content/story-locales/**/*.json`
- Contribution API : `services/translation-api`
- Interface mainteneur contributions : `services/translation-api` sur `/admin`
- Application des changesets traduction : `tools/contributions/apply-changeset.mjs`
- Helper UI i18n : `src/lib/i18n/ui.ts`
- Chargeur runtime : `src/lib/content/packedContent.ts`
- Moteur : `src/lib/story/engine.ts`
- Stats : `src/lib/story/stats.ts`
- Conditions : `src/lib/story/conditions.ts`
- Types : `src/lib/story/types.ts`
- Sauvegardes : `src/lib/storage/saves.ts`
- Progression globale des succès : `src/lib/storage/achievementProgress.ts`
- Chiffrement : `src/lib/storage/crypto.ts`
- Pipeline : `tools/content/*.mjs`
- Pipeline images manuel : `tools/images/*.mjs`, `public/visuals/book1`
- Docker production : `Dockerfile`, `docker/nginx.conf`, `tools/docker/build-prod-push.sh`

## Contrats Importants

- `content/archive` et `content/canonical` ne sont pas des assets runtime.
- `public/` ne doit contenir que des assets publics non sensibles.
- Les prompts Markdown sous `public/visuals` sont publics : pas de longs extraits narratifs, pas de données sensibles, pas de clé API.
- Le build ne doit pas exposer de fichier `.magium`.
- L'app peut afficher les textes originaux, évidemment, mais ils doivent venir des paquets runtime et pas d'un fichier brut directement téléchargeable.
- La PWA peut envoyer une proposition de correction à l'API, mais l'API ne doit jamais devenir une source runtime de traduction. La source finale reste `content/story-locales/**` après PR.
- Les emails de contribution sont des données personnelles temporaires : optionnels, confirmés avant notification, non publics et supprimés après notification groupée de refus, d'obsolescence ou de publication.
- Les JSON UI canoniques suivent la même règle : l'app charge les packs compressés `locales/<locale>/ui`, pas les fichiers JSON bruts.
- Les JSON story i18n canoniques suivent la même règle : l'app charge les packs compressés `locales/<locale>/<bundle>`, pas les fichiers JSON bruts.
- L'image Docker finale doit servir uniquement le résultat `dist/`; elle ne doit pas contenir `content/archive`, `content/canonical`, `node_modules`, `.env*`, exports `.magium-save` ou sources `.magium`.
- Le moteur stocke les choix et allocations de stats dans `history` sous forme d'événements types, puis valide les imports par replay.
- Les assignments canoniques déclarent `mode: "set"` ou `mode: "add"` ; le runtime ne doit pas réinterpréter les deltas depuis des chaînes brutes.
