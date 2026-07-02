# Déploiement Coolify

## Build Depuis GitHub App

Le chemin principal de déploiement Coolify est un build Dockerfile depuis le dépôt connecté par GitHub App.

Configuration Coolify :

- source : repository GitHub `ablond/magium` via GitHub App ;
- build pack : `Dockerfile` ;
- Dockerfile : `Dockerfile` à la racine ;
- base directory : racine du dépôt ;
- port exposé : `8080` ;
- variables runtime : aucune ;
- build args optionnels si contributions publiques activées : `VITE_MAGIUM_CONTRIBUTIONS_API_URL`, `VITE_MAGIUM_TURNSTILE_SITE_KEY` ;
- volumes persistants : aucun.

Le Dockerfile construit l'app avec Node 22 et pnpm, exécute `pnpm build`, puis copie uniquement `dist/` dans une image `nginxinc/nginx-unprivileged:stable-alpine`.

Pré-requis côté builder Coolify :

- accès réseau à `raduprv/Magium` pendant `pnpm build`, car `content:import` vérifie `main` ;
- accès réseau au registre npm et aux images Docker de base.

## Stack Local Docker Compose

Le stack local complet se lance depuis la racine :

```bash
docker compose up -d
```

Services :

- PWA Vite dev : `http://localhost:5173`
- Translation API : `http://localhost:8090`
- PostgreSQL 18 : `localhost:5432`

Valeurs locales par défaut :

- base/user/password PostgreSQL : `magium_translation`
- token admin API : `dev-admin-token`
- Turnstile API désactivé : `TURNSTILE_DISABLED=1`

Le compose local utilise `postgres:18-alpine` et monte son volume sur `/var/lib/postgresql`, conformément au layout Docker PostgreSQL 18. Ce volume ne doit pas réutiliser un ancien volume PostgreSQL 17 monté sur `/var/lib/postgresql/data`.

Le fichier `.env.example` documente les overrides possibles sans être requis. Pour reset la base locale :

```bash
docker compose down -v
```

## Service Coolify Translation API

Les contributions publiques utilisent une application Coolify séparée de la PWA.

Configuration Coolify :

- source : même repository GitHub ;
- build pack : `Dockerfile` ;
- base directory : `services/translation-api` ;
- Dockerfile : `Dockerfile` ;
- port exposé : `8090` ;
- healthcheck HTTP : `/health` ;
- base PostgreSQL : service PostgreSQL Coolify séparé.

Variables obligatoires :

```text
DATABASE_URL=postgres://...
ADMIN_TOKEN=...
ADMIN_PASSWORD=...
ADMIN_SESSION_SECRET=...
PUBLIC_API_URL=https://tr.magium.app
PUBLIC_WEB_URL=https://magium.app
ALLOWED_ORIGIN=https://magium.app
TURNSTILE_SECRET_KEY=...
EMAIL_CONSENT_SECRET=...
ADMIN_COOKIE_SECURE=1
```

Variables optionnelles :

```text
SMTP_URL=smtp://<BREVO_SMTP_LOGIN_URL_ENCODED>:<BREVO_SMTP_KEY_URL_ENCODED>@smtp-relay.brevo.com:587
EMAIL_FROM=Magium <no-reply@magium.app>
EMAIL_WEBHOOK_URL=https://...
EMAIL_WEBHOOK_TOKEN=...
GITHUB_TOKEN_FOR_DISPATCH=...
GITHUB_REPOSITORY_TARGET=ablond/magium
GITHUB_WORKFLOW_FILE=translation-changeset-pr.yml
GITHUB_REF_NAME=main
PSEUDONYM_BLOCKLIST=...
ADMIN_SESSION_TTL_HOURS=8
```

L'interface mainteneur est servie par le service API sur `/admin`. En production, utiliser un `ADMIN_PASSWORD` long, un `ADMIN_SESSION_SECRET` aléatoire et `ADMIN_COOKIE_SECURE=1`. `ADMIN_TOKEN` reste réservé aux scripts et intégrations.

Configurer `SMTP_URL` Brevo pour activer le suivi email en production. Sans transport email, l'API refuse les propositions qui demandent une notification afin de ne pas stocker une adresse inutilisable. `EMAIL_WEBHOOK_URL` reste disponible hors prod ou intégration spécifique, mais est prioritaire sur SMTP s'il est défini.

Configuration Brevo production attendue :

```text
SMTP_URL=smtp://<BREVO_SMTP_LOGIN_URL_ENCODED>:<BREVO_SMTP_KEY_URL_ENCODED>@smtp-relay.brevo.com:587
EMAIL_FROM=Magium <no-reply@magium.app>
```

Avant activation publique, vérifier dans Brevo que `no-reply@magium.app` ou le domaine `magium.app` est autorisé. Les identifiants SMTP Brevo doivent rester uniquement dans Coolify, jamais dans le dépôt. Encoder le login et la clé SMTP dans l'URL si leurs caractères l'exigent.

Pour relier la PWA production à cette API, configurer sur le build PWA :

```text
VITE_MAGIUM_CONTRIBUTIONS_API_URL=https://tr.magium.app
VITE_MAGIUM_TURNSTILE_SITE_KEY=...
```

## Checklist Production Contributions

Référence complète : [docs/translation-contributions-system.md](./translation-contributions-system.md).

PWA Coolify :

- application séparée de l'API ;
- Dockerfile racine ;
- port `8080` ;
- domaine production `magium.app` ;
- build args `VITE_MAGIUM_CONTRIBUTIONS_API_URL` et `VITE_MAGIUM_TURNSTILE_SITE_KEY` si les contributions sont activées ;
- `VITE_MAGIUM_CONTRIBUTIONS_API_URL=https://tr.magium.app` ;
- le site key Turnstile doit autoriser `magium.app` ;
- aucune variable runtime ni volume.

Translation API Coolify :

- application séparée ;
- base directory `services/translation-api` ;
- Dockerfile `Dockerfile` ;
- port `8090` ;
- domaine production `tr.magium.app` ;
- admin mainteneur `https://tr.magium.app/admin` ;
- healthcheck `/health` ;
- PostgreSQL Coolify séparé avec `DATABASE_URL` injecté dans l'API ;
- `ADMIN_COOKIE_SECURE=1` obligatoire en production HTTPS ;
- `PUBLIC_API_URL=https://tr.magium.app`, joignable par GitHub Actions ;
- `PUBLIC_WEB_URL=https://magium.app` ;
- `ALLOWED_ORIGIN=https://magium.app` ;
- `TURNSTILE_SECRET_KEY` côté API doit correspondre au site key utilisé au build PWA ;
- `EMAIL_CONSENT_SECRET` et `ADMIN_SESSION_SECRET` doivent être longs et aléatoires ;
- `SMTP_URL` doit pointer vers Brevo SMTP en production ;
- `EMAIL_FROM` doit valoir `Magium <no-reply@magium.app>` ;
- le sender `no-reply@magium.app` ou le domaine `magium.app` doit être vérifié dans Brevo ;
- `ADMIN_PASSWORD` sert uniquement à l'interface `/admin` ;
- `ADMIN_TOKEN` sert aux scripts et au workflow GitHub.

GitHub dispatch PR :

- dans l'API, configurer `GITHUB_TOKEN_FOR_DISPATCH`, `GITHUB_REPOSITORY_TARGET`, `GITHUB_WORKFLOW_FILE`, `GITHUB_REF_NAME` ;
- le token recommandé est un fine-grained PAT limité au repo cible avec permission repository `Actions: Read and write` ;
- dans GitHub Actions, ajouter le secret `MAGIUM_TRANSLATION_API_TOKEN` avec la même valeur que `ADMIN_TOKEN` côté API ;
- vérifier que `.github/workflows/translation-changeset-pr.yml` est présent et actif sur la branche cible ;
- ne pas utiliser `http://localhost:8090` en production : le workflow GitHub doit joindre `PUBLIC_API_URL` depuis Internet.

Email :

- configurer soit `SMTP_URL`, soit `EMAIL_WEBHOOK_URL` pour autoriser le suivi email ;
- en production, préférer Brevo SMTP avec `smtp-relay.brevo.com:587` ;
- sans transport email, l'API refuse une proposition demandant le suivi et ne stocke pas l'adresse ;
- ne jamais afficher l'email brut dans l'admin ; il est supprimé après rejet, stale ou publication.

## Image GHCR Optionnelle

Le dépôt garde aussi un flux de publication manuelle vers GitHub Container Registry :

```text
ghcr.io/ablond/magium
```

Tags produits par défaut :

- `YYYYMMDD-HHMMSS` en UTC pour une version immutable ;
- `latest` pour le déploiement courant.

Ce flux sert si l'on veut déployer une image préconstruite plutôt que laisser Coolify builder depuis GitHub. Le conteneur expose toujours `8080`, ne lit aucune variable d'environnement runtime et n'utilise aucun volume. Les sauvegardes restent côté navigateur, dans IndexedDB.

## Build Et Publication

Pré-requis local :

- Docker avec Buildx ;
- accès réseau à `raduprv/Magium` pendant `pnpm build`, car `content:import` vérifie `main` ;
- authentification GHCR locale si publication : `docker login ghcr.io`.

Commandes :

```bash
pnpm check
pnpm test
pnpm build
pnpm docker:build-prod
pnpm docker:push-prod
```

`pnpm docker:build-prod` construit l'image finale localement et valide :

- absence de `.magium` ;
- absence de JSON canonique brut ;
- absence de `node_modules` et de `.env*` ;
- absence d'extraits source bruts évidents ;
- réponse HTTP sur `/`, `/sw.js`, `/manifest.webmanifest` ;
- fallback SPA vers `index.html`.

`pnpm docker:push-prod` refait la même validation, pousse `ghcr.io/ablond/magium:<timestamp>` et `ghcr.io/ablond/magium:latest`, puis inspecte les tags publiés.

Variables utiles :

```bash
MAGIUM_IMAGE=ghcr.io/ablond/magium
MAGIUM_TAG=20260627-180000
MAGIUM_PLATFORM=linux/amd64
```

`MAGIUM_PLATFORM` vaut `linux/amd64` par défaut. La validation runtime locale nécessite une plateforme exécutable sur la machine courante.
En mode sans push, la plateforme doit donc correspondre à la machine locale. En mode push, le script valide d'abord une image locale, puis build et publie la plateforme demandée si elle est différente.

## Configuration Coolify Par Image Préconstruite

Alternative au build GitHub App : créer une application de type Docker Image / image préconstruite :

- image : `ghcr.io/ablond/magium` ;
- tag : `latest` ou un tag timestamp ;
- port exposé : `8080` ;
- variables d'environnement : aucune ;
- volumes persistants : aucun.

Si le package GHCR est privé, se connecter au serveur Coolify avec l'utilisateur utilisé par Coolify pour Docker, puis authentifier GHCR :

```bash
echo "$GH_TOKEN" | docker login ghcr.io -u "$USERNAME" --password-stdin
```

Le token doit permettre de lire le package. Coolify détecte ensuite les identifiants Docker côté serveur pour tirer l'image.

Références :

- https://coolify.io/docs/applications
- https://coolify.io/docs/applications/ci-cd/github/actions
- https://coolify.io/docs/knowledge-base/docker/registry

## Limites

- Le flux GitHub App laisse Coolify builder l'image depuis le `Dockerfile` racine.
- Il n'y a pas de webhook Coolify automatique dans le flux GHCR manuel.
- L'image finale sert les bundles Vite générés ; elle ne contient pas les sources d'archive ni les JSON canoniques.
- Une publication GHCR doit être faite après un commit poussé, afin que le tag GHCR corresponde à l'état Git livré.
