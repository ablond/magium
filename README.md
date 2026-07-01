# Magium PWA

Application PWA moderne pour jouer a Magium depuis les textes originaux du depot `raduprv/Magium`.

Le récit V1 démarre en anglais original, avec le livre 1 complet jouable en français (`ch1` à `ch11b`). Le choix de langue FR/EN dans les settings pilote l'interface, le récit disponible et les libellés de stats, avec fallback anglais pour les chapitres non encore traduits.

## Etat Actuel

- App Svelte + Vite + TypeScript, sans backend.
- Source de contenu : `raduprv/Magium@main`, resolu au commit archive courant.
- Archive brute hashée sous `content/archive/original/<sourceCommit>/`.
- JSON canonique lisible sous `content/canonical/v1/`.
- Paquets runtime compresses et verifies sous `src/generated/`.
- Sauvegarde locale chiffrée dans IndexedDB, sauvegardes locales nommables et export/import `.magium-save` protege par mot de passe.
- Succès globaux conservés localement dans IndexedDB chiffré, séparés de la partie courante pour survivre aux nouvelles parties et aux retours checkpoint.
- PWA installable avec service worker.
- UI de lecture directe avec rail desktop libellé, panneau Stats a revelation progressive avec allocation de points, panneau Sauvegardes separe entre sauvegardes locales, point de controle et transfert, settings de confort, toggle Illustrations, attribution About et sélection globale FR/EN.
- Mode Debug local sous `pnpm dev` pour explorer scenes, choix, stats et variables ; les saves marquees debug restent locales au navigateur et ne s'exportent pas en `.magium-save`.
- Images Book 1 en workflow manuel ChatGPT : portraits et illustrations de moments avec prompts publics sous `public/visuals/book1`.
- Chemin API OpenAI optionnel pour les illustrations manquantes, via planches de references locales et Batch API, sans RAG ni embeddings.

## Commandes

```bash
pnpm install
pnpm content:all
pnpm images:prompts -- --book 1
pnpm images:stage -- --book 1
pnpm images:normalize -- --book 1
pnpm images:refsheets -- --book 1 --missing
pnpm images:check -- --book 1
pnpm check
pnpm test
pnpm build
pnpm dev --host 127.0.0.1
pnpm docker:build-prod
pnpm docker:push-prod
```

Commandes de contenu :

```bash
pnpm content:import          # capture raduprv/Magium@main et archive les sources
pnpm content:archive:check   # reverifie les SHA-256 de l'archive
pnpm content:parse           # regenere le JSON canonique et les paquets runtime
pnpm content:validate        # verifie graphe, messages, targets et absence de fuite brute
pnpm dist:check              # verifie dist apres build
```

Commandes images manuelles Book 1 :

```bash
pnpm images:prompts -- --book 1 # regenere les prompts Markdown publics
pnpm images:stage -- --book 1 # prepare tous les moments Book 1 pour ChatGPT
pnpm images:stage -- --book 1 --moment ch10-pit-rescue # prepare prompt + portraits renommes pour ChatGPT
pnpm images:stage -- --book 1 --chapter ch10 # prepare tous les moments d'un chapitre
pnpm images:normalize -- --book 1 # convertit PNG/JPG de moments en illustration.webp et archive les originaux
pnpm images:refsheets -- --book 1 --missing # prepare les planches de references API locales
pnpm images:generate:api -- --book 1 --missing --batch --quality high --reference-mode sheets # chemin avance OpenAI optionnel
pnpm images:check -- --book 1   # verifie prompts publics et WebP presents
```

Commandes Docker de production :

```bash
pnpm docker:build-prod       # build l'image finale et valide son contenu/runtime localement
pnpm docker:push-prod        # build, valide, pousse ghcr.io/ablond/magium:<timestamp> et :latest
```

Le `Dockerfile` est a la racine du depot pour que Coolify puisse builder directement depuis la GitHub App avec le build pack Dockerfile. L'image de production expose le port `8080`, ne demande aucune variable d'environnement runtime et n'utilise aucun volume. Le push manuel vers `ghcr.io/ablond/magium` reste disponible si un deploiement par image preconstruite est souhaite.

## Structure

```text
docker/                     Configuration nginx de l'image runtime.
content/archive/original/   Sources originales archivees, immuables.
content/canonical/v1/       JSON canonique lisible, genere.
content/ui-locales/         Sources traduisibles du shell UI.
content/story-locales/      Sources traduisibles du récit, achievements et stats.
content/schemas/            Schemas documentaires.
public/visuals/book1/       Prompts publics et images WebP Book 1.
src/generated/              Paquets runtime generes, compresses, importes par l'app.
src/lib/content/            Chargeur de paquets et verification d'integrite.
src/lib/i18n/               Resolution de locale UI et interpolation.
src/lib/story/              Types, moteur de jeu, conditions, stats, digest.
src/lib/storage/            IndexedDB, chiffrement, export/import.
tools/content/              Pipeline import, parse, pack, validate.
tools/docker/               Build, validation et publication de l'image GHCR.
tests/                      Tests parser et moteur.
docs/                       Documentation technique detaillee.
```

## Documentation

- [AGENTS.md](./AGENTS.md) : consignes prioritaires pour les futures iterations par agents IA.
- [Architecture](./docs/architecture.md) : vue d'ensemble du systeme.
- [Pipeline contenu](./docs/content-pipeline.md) : archive, parsing, JSON canonique, runtime packs.
- [Moteur runtime](./docs/runtime-engine.md) : scenes, choix, conditions, stats, achievements.
- [Sauvegardes et anti-tamper](./docs/saves-and-anti-tamper.md) : IndexedDB, AES-GCM, export/import, limites.
- [I18n](./docs/i18n.md) : modele de traduction UI et narrative.
- [Traduction FR](./docs/translation-fr.md) : glossaire, critères et workflow agent IA Codex-only pour traduire un chapitre.
- [Images manuelles](./docs/manual-images.md) : prompts ChatGPT Images, portraits et illustrations Book 1.
- [Déploiement Coolify](./docs/deployment-coolify.md) : build Dockerfile via GitHub App, image GHCR optionnelle et configuration Coolify.
- [Verification](./docs/verification.md) : commandes, checks, tests navigateur.

## Regles Importantes

- Ne jamais modifier a la main les fichiers sous `content/archive/original`, `content/canonical/v1` ou `src/generated`.
- Les textes UI se modifient dans `content/ui-locales/*.json`, puis se régénèrent avec `pnpm content:all`.
- Les traductions du récit, des achievements et des stats se modifient dans `content/story-locales/<locale>/*.json`, puis se régénèrent avec `pnpm content:all`.
- Les prompts/images Book 1 se gerent avec `pnpm images:prompts -- --book 1`, `pnpm images:stage -- --book 1`, `pnpm images:normalize -- --book 1` puis `pnpm images:check -- --book 1`; `--moment <id>` et `--chapter <id>` limitent le staging si besoin. Ne pas ajouter de RAG ni embeddings.
- Le chemin API est avance et optionnel : `pnpm images:refsheets -- --book 1 --missing`, puis `pnpm images:generate:api -- --book 1 --missing --batch --quality high --reference-mode sheets`. La cle reste dans `OPENAI_API_KEY`, jamais dans le repo. Les outputs locaux `output/visual/api-inputs/` et `output/visual/api-runs/` restent ignores par Git.
- Les portraits Book 1 doivent rester des prompts plein pied riches en details physiques, vestimentaires, equipement/anatomie et attitude, avec faits `Canon:`, choix sobres `Design choice:` et garde-fous `Avoid:`.
- Les illustrations Book 1 sont des moments declenches par `sceneId`, pas des images de debut de chapitre. Elles s'affichent apres la scene correspondante et peuvent manquer pendant la production.
- Chaque illustration de moment doit rester coherente avec tous les chemins qui atteignent son `sceneId`; les scenes conditionnelles utilisent une note `Path compatibility` dans la config images.
- Corrections canoniques images a preserver : Azarius n'est pas Felran, Molan est un faon, Illuna et Petal sont la meme personne, Flower et Illuna partagent le meme corps mais ne doivent jamais etre attaches ensemble a un meme moment, Arraka est representee par l'amulette/aura et jamais attachee comme personnage de moment, Eleya est la renarde canonique, Taurus reste un animal naturel, Barry n'a pas d'arbalete avant `Ch6-Packing`, son stat device doit etre explicitement en main ou cache dans chaque moment, son sac reste ordinaire avant l'enchantement de Daren et ne montre glow/inventaire que sur demande, Barry part sans sac pour `ch11a-beggars-district-trap` et `ch11b-*`, Daren est visible et affaibli dans `ch1-cutthroat-dave`, et aucun portrait ne doit etre attache a un moment si le personnage n'est pas visible dans son `triggerSceneId`.
- Ne jamais mettre de `.magium` ni de JSON canonique dans `public/`.
- Les Markdown sous `public/visuals` sont publics : ils doivent rester courts et reformules, sans longs extraits du récit original.
- L'app runtime ne doit pas lire les `.magium` directement.
- La documentation doit etre maintenue et corrigee a chaque changement qui modifie commandes, architecture, pipeline, UI, sauvegardes, i18n ou limites de securite.
- Toute modification du parser, du moteur, du stockage ou du pipeline doit etre suivie de `pnpm check`, `pnpm test` et `pnpm build`.
- Toute modification du packaging Docker ou du déploiement doit aussi etre suivie de `pnpm docker:build-prod`; une publication demandee doit aller jusqu'a `pnpm docker:push-prod`.
- L'anti-triche est une resistance client-side, pas une garantie absolue sans backend.
- L'UI joueur ne doit pas exposer de vocabulaire d'implementation inutile ; garder les details techniques dans la documentation.
