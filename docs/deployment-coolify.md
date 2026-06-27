# Déploiement Coolify

## Build Depuis GitHub App

Le chemin principal de déploiement Coolify est un build Dockerfile depuis le dépôt connecté par GitHub App.

Configuration Coolify :

- source : repository GitHub `ablond/magium` via GitHub App ;
- build pack : `Dockerfile` ;
- Dockerfile : `Dockerfile` à la racine ;
- base directory : racine du dépôt ;
- port exposé : `8080` ;
- variables d'environnement : aucune ;
- volumes persistants : aucun.

Le Dockerfile construit l'app avec Node 22 et pnpm, exécute `pnpm build`, puis copie uniquement `dist/` dans une image `nginxinc/nginx-unprivileged:stable-alpine`.

Pré-requis côté builder Coolify :

- accès réseau à `raduprv/Magium` pendant `pnpm build`, car `content:import` vérifie `main` ;
- accès réseau au registre npm et aux images Docker de base.

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

## Configuration Coolify Par Image Preconstruite

Alternative au build GitHub App : créer une application de type Docker Image / image préconstruite :

- image : `ghcr.io/ablond/magium` ;
- tag : `latest` ou un tag timestamp ;
- port expose : `8080` ;
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
- Une publication GHCR doit etre faite après un commit poussé, afin que le tag GHCR corresponde à l'état Git livré.
