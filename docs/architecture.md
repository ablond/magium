# Architecture

## Vue D'Ensemble

Le projet est une PWA statique. Il n'y a pas de backend, pas de compte utilisateur, pas de stockage cloud.

Le systeme est decoupe en quatre couches :

1. Sources archivees
   - fichiers originaux `.magium` et donnees associees ;
   - conserves pour audit, regeneration et preuve de provenance.
2. Contenu canonique
   - JSON lisible, normalise, genere depuis les sources ;
   - separe logique, messages narratifs et messages UI.
3. Paquets runtime
   - modules TypeScript generes contenant des blobs `base64+gzip` ;
   - charges dynamiquement par chapitre/langue ;
   - verifies par SHA-256 avant utilisation.
4. Application
   - moteur de scene ;
   - i18n ;
   - stockage chiffre ;
   - UI PWA.

## Flux De Donnees

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
```

## Choix Techniques

- Svelte + Vite + TypeScript : app statique, rapide a iterer.
- Pas de SvelteKit pour l'instant : aucune route serveur ni SSR necessaire.
- IndexedDB natif : stockage local plus adapte que localStorage pour des blobs chiffrés et clés CryptoKey.
- Web Crypto API : AES-GCM, PBKDF2, SHA-256 sans dependance externe.
- Runtime packs en modules TS : pas de `.json` public et lazy loading par import dynamique.
- Langue globale : le setting FR/EN met a jour le shell UI, `GameState.locale`, les textes narratifs disponibles, les achievements et les stats. Les chapitres non traduits retombent sur `en`.

## Reperes De Code

- UI principale : `src/App.svelte`
- Style global : `src/app.css`
- Sources UI i18n : `content/ui-locales/*.json`
- Sources story i18n : `content/story-locales/**/*.json`
- Helper UI i18n : `src/lib/i18n/ui.ts`
- Chargeur runtime : `src/lib/content/packedContent.ts`
- Moteur : `src/lib/story/engine.ts`
- Conditions : `src/lib/story/conditions.ts`
- Types : `src/lib/story/types.ts`
- Sauvegardes : `src/lib/storage/saves.ts`
- Chiffrement : `src/lib/storage/crypto.ts`
- Pipeline : `tools/content/*.mjs`

## Contrats Importants

- `content/archive` et `content/canonical` ne sont pas des assets runtime.
- `public/` ne doit contenir que des assets publics non sensibles.
- Le build ne doit pas exposer de fichier `.magium`.
- L'app peut afficher les textes originaux, evidemment, mais ils doivent venir des paquets runtime et pas d'un fichier brut directement telechargeable.
- Les JSON UI canoniques suivent la même règle : l'app charge les packs compressés `locales/<locale>/ui`, pas les fichiers JSON bruts.
- Les JSON story i18n canoniques suivent la même règle : l'app charge les packs compressés `locales/<locale>/<bundle>`, pas les fichiers JSON bruts.
