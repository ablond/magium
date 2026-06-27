# Magium PWA

Application PWA moderne pour jouer a Magium depuis les textes originaux du depot `raduprv/Magium`.

Le récit V1 démarre en anglais original, avec le chapitre 1 jouable en français. Le choix de langue FR/EN dans les settings pilote l'interface, le récit disponible et les libellés de stats, avec fallback anglais pour les chapitres non encore traduits.

## Etat Actuel

- App Svelte + Vite + TypeScript, sans backend.
- Source de contenu : `raduprv/Magium@main`, resolu au commit archive courant.
- Archive brute hashée sous `content/archive/original/<sourceCommit>/`.
- JSON canonique lisible sous `content/canonical/v1/`.
- Paquets runtime compresses et verifies sous `src/generated/`.
- Sauvegarde locale chiffrée dans IndexedDB, export/import `.magium-save`.
- PWA installable avec service worker.
- UI de lecture directe avec rail desktop libellé, panneau Abilities a revelation progressive, sauvegardes expliquees en langage joueur, settings de confort, attribution About et sélection globale FR/EN.

## Commandes

```bash
pnpm install
pnpm content:all
pnpm check
pnpm test
pnpm build
pnpm dev --host 127.0.0.1
```

Commandes de contenu :

```bash
pnpm content:import          # capture raduprv/Magium@main et archive les sources
pnpm content:archive:check   # reverifie les SHA-256 de l'archive
pnpm content:parse           # regenere le JSON canonique et les paquets runtime
pnpm content:validate        # verifie graphe, messages, targets et absence de fuite brute
pnpm dist:check              # verifie dist apres build
```

## Structure

```text
content/archive/original/   Sources originales archivees, immuables.
content/canonical/v1/       JSON canonique lisible, genere.
content/ui-locales/         Sources traduisibles du shell UI.
content/story-locales/      Sources traduisibles du récit, achievements et stats.
content/schemas/            Schemas documentaires.
src/generated/              Paquets runtime generes, compresses, importes par l'app.
src/lib/content/            Chargeur de paquets et verification d'integrite.
src/lib/i18n/               Resolution de locale UI et interpolation.
src/lib/story/              Types, moteur de jeu, conditions, stats, digest.
src/lib/storage/            IndexedDB, chiffrement, export/import.
tools/content/              Pipeline import, parse, pack, validate.
tests/                      Tests parser et moteur.
docs/                       Documentation technique detaillee.
```

## Documentation

- [AGENTS.md](./AGENTS.md) : consignes prioritaires pour les futures iterations par agents IA.
- [Architecture](./docs/architecture.md) : vue d'ensemble du systeme.
- [Pipeline contenu](./docs/content-pipeline.md) : archive, parsing, JSON canonique, runtime packs.
- [Moteur runtime](./docs/runtime-engine.md) : scenes, choix, conditions, achievements.
- [Sauvegardes et anti-tamper](./docs/saves-and-anti-tamper.md) : IndexedDB, AES-GCM, export/import, limites.
- [I18n](./docs/i18n.md) : modele de traduction UI et narrative.
- [Traduction FR](./docs/translation-fr.md) : glossaire et critères de traduction.
- [Verification](./docs/verification.md) : commandes, checks, tests navigateur.

## Regles Importantes

- Ne jamais modifier a la main les fichiers sous `content/archive/original`, `content/canonical/v1` ou `src/generated`.
- Les textes UI se modifient dans `content/ui-locales/*.json`, puis se régénèrent avec `pnpm content:all`.
- Les traductions du récit, des achievements et des stats se modifient dans `content/story-locales/<locale>/*.json`, puis se régénèrent avec `pnpm content:all`.
- Ne jamais mettre de `.magium` ni de JSON canonique dans `public/`.
- L'app runtime ne doit pas lire les `.magium` directement.
- La documentation doit etre maintenue et corrigee a chaque changement qui modifie commandes, architecture, pipeline, UI, sauvegardes, i18n ou limites de securite.
- Toute modification du parser, du moteur, du stockage ou du pipeline doit etre suivie de `pnpm check`, `pnpm test` et `pnpm build`.
- L'anti-triche est une resistance client-side, pas une garantie absolue sans backend.
- L'UI joueur ne doit pas exposer de vocabulaire d'implementation inutile ; garder les details techniques dans la documentation.
