# Magium PWA

Application PWA moderne pour jouer à Magium depuis les textes originaux du dépôt `raduprv/Magium`.

Le récit V1 démarre en anglais original, avec le livre 1 complet jouable en français (`ch1` à `ch11b`). Le choix de langue FR/EN dans les settings pilote l'interface, le récit disponible et les libellés de stats, avec fallback anglais pour les chapitres non encore traduits.

## État Actuel

- App Svelte + Vite + TypeScript, sans backend pour le runtime jouable.
- Service séparé optionnel `services/translation-api` pour recevoir et modérer les propositions publiques de correction de traduction.
- Source de contenu : `raduprv/Magium@main`, résolu au commit archive courant.
- Archive brute hashée sous `content/archive/original/<sourceCommit>/`.
- JSON canonique lisible sous `content/canonical/v1/`.
- Paquets runtime compressés et vérifiés sous `src/generated/`.
- Sauvegarde locale chiffrée dans IndexedDB, sauvegardes locales nommables et export/import `.magium-save` protégé par mot de passe.
- Succès globaux conservés localement dans IndexedDB chiffré, séparés de la partie courante pour survivre aux nouvelles parties et aux retours checkpoint.
- PWA installable avec service worker.
- UI de lecture directe avec rail desktop libellé, panneau Stats à révélation progressive avec allocation de points, panneau Sauvegardes séparé entre sauvegardes locales, point de contrôle et transfert, settings de confort, toggle Illustrations, attribution About et sélection globale FR/EN.
- Mode Debug local sous `pnpm dev` pour explorer scènes, choix, stats et variables ; les saves marquées debug restent locales au navigateur et ne s'exportent pas en `.magium-save`.
- Images Book 1 en workflow manuel ChatGPT : portraits et illustrations de moments avec prompts publics sous `public/visuals/book1`.
- Chemin API OpenAI optionnel pour les illustrations manquantes, via planches de références locales et Batch API, sans RAG ni embeddings.

## Commandes

```bash
pnpm install
pnpm --dir services/translation-api install --frozen-lockfile
pnpm content:all
pnpm images:prompts -- --book 1
pnpm images:stage -- --book 1
pnpm images:normalize -- --book 1
pnpm images:refsheets -- --book 1 --missing
pnpm images:check -- --book 1
pnpm images:test
pnpm check
pnpm test
pnpm build
pnpm dev --host 127.0.0.1
pnpm docker:build-prod
pnpm docker:push-prod
```

`pnpm test` lance aussi les tests Node de `services/translation-api`. Sur un checkout frais hors Docker Compose, installer les dépendances racine puis celles du service API avant la suite de validation complète.

Commandes Docker locales :

```bash
docker compose up -d       # PWA Vite dev, API de contribution, PostgreSQL, Mailpit
docker compose down        # arrête les services en gardant la base
docker compose down -v     # reset complet de la base locale
```

Avec le compose local :

- PWA : `http://localhost:5173`
- API contribution : `http://localhost:8090`
- Admin mainteneur : `http://localhost:8090/admin`
- Mailpit local : `http://localhost:8025`
- token admin local : `dev-admin-token`
- mot de passe admin local : `dev-admin-password`
- PostgreSQL 18 : `localhost:5432`, base/user/password `magium_translation`

Le compose local monte le volume PostgreSQL 18 sur `/var/lib/postgresql`. Ce layout est incompatible avec l'ancien volume local PostgreSQL 17 monté sur `/var/lib/postgresql/data`; utiliser `docker compose down -v` pour repartir d'une base locale propre.

Commandes de contenu :

```bash
pnpm content:import          # capture raduprv/Magium@main et archive les sources
pnpm content:archive:check   # revérifie les SHA-256 de l'archive
pnpm content:parse           # régénère le JSON canonique et les paquets runtime
pnpm content:validate        # vérifie graphe, messages, targets et absence de fuite brute
pnpm dist:check              # vérifie dist après build
```

Commandes images manuelles Book 1 :

```bash
pnpm images:prompts -- --book 1 # régénère les prompts Markdown publics
pnpm images:stage -- --book 1 # prépare tous les moments Book 1 pour ChatGPT
pnpm images:stage -- --book 1 --moment ch10-pit-rescue # prépare prompt + portraits renommés pour ChatGPT
pnpm images:stage -- --book 1 --chapter ch10 # prépare tous les moments d'un chapitre
pnpm images:normalize -- --book 1 # convertit PNG/JPG de moments en illustration.webp et archive les originaux
pnpm images:refsheets -- --book 1 --missing # prépare les planches de références API locales
pnpm images:generate:api -- --book 1 --missing --batch --quality high --reference-mode sheets # chemin avancé OpenAI optionnel
pnpm images:check -- --book 1   # vérifie prompts publics et WebP présents
pnpm images:test                 # teste le pipeline images Book 1 ; nécessite ffmpeg
```

Commandes Docker de production :

```bash
pnpm docker:build-prod       # build l'image finale et valide son contenu/runtime localement
pnpm docker:push-prod        # build, valide, pousse ghcr.io/ablond/magium:<timestamp> et :latest
```

Le `Dockerfile` est à la racine du dépôt pour que Coolify puisse builder directement depuis la GitHub App avec le build pack Dockerfile. L'image de production expose le port `8080`, ne demande aucune variable d'environnement runtime et n'utilise aucun volume. Le push manuel vers `ghcr.io/ablond/magium` reste disponible si un déploiement par image préconstruite est souhaité.

Si les contributions publiques sont activées en production, passer les variables de build `VITE_MAGIUM_CONTRIBUTIONS_API_URL` et `VITE_MAGIUM_TURNSTILE_SITE_KEY` au build Dockerfile de la PWA. Le service API reste une application Coolify séparée basée sur `services/translation-api/Dockerfile`, avec PostgreSQL.

## Structure

```text
docker-compose.yml           Stack local PWA dev, API contribution et PostgreSQL.
.env.example                 Overrides locaux optionnels pour Docker Compose.
docker/                     Configuration nginx de l'image runtime.
content/archive/original/   Sources originales archivées, immuables.
content/canonical/v1/       JSON canonique lisible, généré.
content/ui-locales/         Sources traduisibles du shell UI.
content/story-locales/      Sources traduisibles du récit, achievements et stats.
content/schemas/            Schemas documentaires.
public/visuals/book1/       Prompts publics et images WebP Book 1.
public/legal/               Page publique contributions, données personnelles et modération.
src/generated/              Paquets runtime générés, compressés, importés par l'app.
services/translation-api/   API séparée de contribution traduction, avec schéma PostgreSQL.
src/lib/content/            Chargeur de paquets et vérification d'intégrité.
src/lib/contributions/      Payloads, Turnstile et stockage local opt-in des contributions.
src/lib/i18n/               Résolution de locale UI et interpolation.
src/lib/story/              Types, moteur de jeu, conditions, stats, digest.
src/lib/storage/            IndexedDB, chiffrement, export/import.
tools/content/              Pipeline import, parse, pack, validate.
tools/docker/               Build, validation et publication de l'image GHCR.
tests/                      Tests parser et moteur.
docs/                       Documentation technique détaillée.
```

## Documentation

- [AGENTS.md](./AGENTS.md) : consignes prioritaires pour les futures itérations par agents IA.
- [Architecture](./docs/architecture.md) : vue d'ensemble du système.
- [Pipeline contenu](./docs/content-pipeline.md) : archive, parsing, JSON canonique, runtime packs.
- [Moteur runtime](./docs/runtime-engine.md) : scènes, choix, conditions, stats, achievements.
- [Sauvegardes et anti-tamper](./docs/saves-and-anti-tamper.md) : IndexedDB, AES-GCM, export/import, limites.
- [I18n](./docs/i18n.md) : modèle de traduction UI et narrative.
- [Traduction FR](./docs/translation-fr.md) : glossaire, critères et workflow agent IA Codex-only pour traduire un chapitre.
- [Contributions publiques](./docs/contributions.md) : corrections de traduction depuis la PWA, revue par lots et PR GitHub.
- [Système contributions traduction](./docs/translation-contributions-system.md) : reprise technique exhaustive du sous-système PWA/API/PostgreSQL/email/admin/GitHub/Coolify.
- [Images manuelles](./docs/manual-images.md) : prompts ChatGPT Images, portraits et illustrations Book 1.
- [Déploiement Coolify](./docs/deployment-coolify.md) : build Dockerfile via GitHub App, image GHCR optionnelle et configuration Coolify.
- [Vérification](./docs/verification.md) : commandes, checks, tests navigateur.

## Contribution Traduction : Reprise Rapide

Le runtime PWA reste statique, mais les corrections publiques de traduction utilisent un service séparé `services/translation-api` avec PostgreSQL, Mailpit local, admin web et workflow GitHub PR.

En local :

```bash
docker compose up -d --build
```

URLs utiles :

- PWA : `http://localhost:5173`
- API : `http://localhost:8090`
- Admin mainteneur : `http://localhost:8090/admin`
- Mailpit : `http://localhost:8025`

Accès local non secret :

- mot de passe admin web : `dev-admin-password`
- token admin script : `dev-admin-token`

Le lecteur peut proposer une correction anonymement depuis un paragraphe ou un choix visible. Le mainteneur traite les propositions dans `/admin`, compare le diff visuel, accepte/rejette/marque obsolète, crée un changeset, puis déclenche une PR GitHub si le dispatch est configuré. La référence technique complète est [docs/translation-contributions-system.md](./docs/translation-contributions-system.md).

## Règles Importantes

- Ne jamais modifier à la main les fichiers sous `content/archive/original`, `content/canonical/v1` ou `src/generated`.
- Les textes UI se modifient dans `content/ui-locales/*.json`, puis se régénèrent avec `pnpm content:all`.
- Les traductions du récit, des achievements et des stats se modifient dans `content/story-locales/<locale>/*.json`, puis se régénèrent avec `pnpm content:all`.
- Les propositions publiques de correction ne sont jamais appliquées directement : elles passent par `services/translation-api`, un changeset mainteneur, `tools/contributions/apply-changeset.mjs`, puis une PR GitHub validée.
- Les emails de suivi de contribution sont optionnels, confirmés par lien, réutilisables un an par navigateur via un jeton local, stockés séparément et supprimés après refus ou publication ; les pseudos optionnels de crédit restent modérables.
- Le compose local fournit des valeurs non secrètes pour tester les contributions : `docker compose up -d`, PWA sur `5173`, API sur `8090`, admin web sur `/admin`, Mailpit sur `8025`, token admin `dev-admin-token`, mot de passe admin `dev-admin-password`.
- Les prompts/images Book 1 se gèrent avec `pnpm images:prompts -- --book 1`, `pnpm images:stage -- --book 1`, `pnpm images:normalize -- --book 1`, `pnpm images:check -- --book 1` puis `pnpm images:test`; `--moment <id>` et `--chapter <id>` limitent le staging si besoin. `pnpm images:test` nécessite `ffmpeg`. Ne pas ajouter de RAG ni embeddings.
- Le chemin API est avancé et optionnel : `pnpm images:refsheets -- --book 1 --missing`, puis `pnpm images:generate:api -- --book 1 --missing --batch --quality high --reference-mode sheets`. La clé reste dans `OPENAI_API_KEY`, jamais dans le repo. Les outputs locaux `output/visual/api-inputs/` et `output/visual/api-runs/` restent ignorés par Git.
- Les portraits Book 1 doivent rester des prompts plein pied riches en détails physiques, vestimentaires, équipement/anatomie et attitude, avec faits `Canon:`, choix sobres `Design choice:` et garde-fous `Avoid:`.
- Les illustrations Book 1 sont des moments déclenchés par `sceneId`, pas des images de début de chapitre. Elles s'affichent après la scène correspondante et peuvent manquer pendant la production.
- Chaque illustration de moment doit rester cohérente avec tous les chemins qui atteignent son `sceneId`; les scènes conditionnelles utilisent une note `Path compatibility` dans la config images.
- Corrections canoniques images à préserver : Azarius n'est pas Felran, Molan est un faon, Illuna et Petal sont la même personne, Flower et Illuna partagent le même corps mais ne doivent jamais être attachés ensemble à un même moment, Arraka est représentée par l'amulette/aura et jamais attachée comme personnage de moment, Eleya est la renarde canonique, Taurus reste un animal naturel, Barry n'a pas d'arbalète avant `Ch6-Packing`, son stat device doit être explicitement en main ou caché dans chaque moment, son sac reste ordinaire avant l'enchantement de Daren et ne montre glow/inventaire que sur demande, Barry part sans sac pour `ch11a-beggars-district-trap` et `ch11b-*`, Daren est visible et affaibli dans `ch1-cutthroat-dave`, et aucun portrait ne doit être attaché à un moment si le personnage n'est pas visible dans son `triggerSceneId`.
- Ne jamais mettre de `.magium` ni de JSON canonique dans `public/`.
- Les Markdown sous `public/visuals` sont publics : ils doivent rester courts et reformulés, sans longs extraits du récit original.
- L'app runtime ne doit pas lire les `.magium` directement.
- La documentation doit être maintenue et corrigée à chaque changement qui modifie commandes, architecture, pipeline, UI, sauvegardes, i18n ou limites de sécurité.
- Toute modification du parser, du moteur, du stockage ou du pipeline doit être suivie de `pnpm check`, `pnpm test` et `pnpm build`. Toute modification des outils, prompts ou assets images Book 1 doit aussi être suivie de `pnpm images:check -- --book 1` et `pnpm images:test`.
- Toute modification du packaging Docker ou du déploiement doit aussi être suivie de `pnpm docker:build-prod`; une publication demandée doit aller jusqu'à `pnpm docker:push-prod`.
- L'anti-triche est une résistance client-side, pas une garantie absolue sans backend.
- L'UI joueur ne doit pas exposer de vocabulaire d'implémentation inutile ; garder les détails techniques dans la documentation.
