# Architecture

## Vue D'Ensemble

Le projet est une PWA statique. Il n'y a pas de backend, pas de compte utilisateur, pas de stockage cloud.

Le systeme est decoupe en quatre couches :

1. Sources archivees
   - fichiers originaux `.magium` et donnees associees ;
   - conserves pour audit, regeneration et preuve de provenance.
2. Contenu canonique
   - JSON lisible, normalise, genere depuis les sources ;
   - separe logique et messages.
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
```

## Choix Techniques

- Svelte + Vite + TypeScript : app statique, rapide a iterer.
- Pas de SvelteKit pour l'instant : aucune route serveur ni SSR necessaire.
- IndexedDB natif : stockage local plus adapte que localStorage pour des blobs chiffrés et clés CryptoKey.
- Web Crypto API : AES-GCM, PBKDF2, SHA-256 sans dependance externe.
- Runtime packs en modules TS : pas de `.json` public et lazy loading par import dynamique.

## Reperes De Code

- UI principale : `src/App.svelte`
- Style global : `src/app.css`
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
