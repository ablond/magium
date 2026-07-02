# Système De Contributions Publiques De Traduction

Ce document est la référence technique de reprise pour le système de contributions publiques de traduction de Magium. Il décrit ce qui existe, comment le lancer, comment le déployer, comment l'exploiter, et comment diagnostiquer les pannes courantes.

La documentation produit plus courte reste dans [docs/contributions.md](./contributions.md). Les commandes de vérification restent dans [docs/verification.md](./verification.md). Le déploiement Coolify reste dans [docs/deployment-coolify.md](./deployment-coolify.md).

## 1. Vue D'ensemble

Le runtime jeu reste une PWA statique. Les contributions publiques passent par un service API séparé, avec revue mainteneur et PR GitHub avant toute intégration.

Flux end-to-end :

```text
Lecteur PWA
  -> active Corrections de traduction dans Settings
  -> icône stylo de correction sur paragraphe/choix
  -> POST /v1/translation-proposals
  -> services/translation-api + PostgreSQL
  -> /admin mainteneur
  -> accept/reject/stale
  -> changeset mainteneur
  -> workflow_dispatch GitHub
  -> tools/contributions/apply-changeset.mjs
  -> pnpm content:all + check + test + build
  -> PR GitHub unique
  -> merge/publication
  -> notification email optionnelle puis suppression email
```

Rôles :

- Joueur : propose une correction depuis un paragraphe ou un choix visible, sans compte.
- Mainteneur : relit, compare le diff, accepte/rejette/marque obsolète, groupe en changeset, déclenche la PR.
- PWA : affiche le formulaire, calcule les hashes, gère Turnstile et le stockage local opt-in.
- Translation API : valide, stocke, protège l'admin, envoie les emails, expose les changesets, déclenche GitHub.
- PostgreSQL : stocke propositions, contacts email temporaires, consentements email anonymisés et changesets.
- GitHub Actions : applique le changeset aux sources éditables, régénère et ouvre une PR.
- Coolify : héberge la PWA statique et l'API comme deux applications distinctes.

Limites V1 :

- pas de compte utilisateur ;
- pas de vote public ;
- pas de traduction collaborative d'une nouvelle langue complète ;
- pas de PR par proposition individuelle ;
- pas de merge automatique dans `content/story-locales/**` ;
- le bouton joueur corrige un seul paragraphe affiché ou un choix entier ;
- le split/merge de paragraphes n'est pas supporté depuis le formulaire joueur.

## 2. Lancement Local

Le stack local complet se lance depuis la racine :

```bash
docker compose up -d --build
```

Services :

- PWA Vite dev : `http://localhost:5173`
- Translation API : `http://localhost:8090`
- Admin mainteneur : `http://localhost:8090/admin`
- Mailpit : `http://localhost:8025`
- PostgreSQL 18 : `localhost:5432`

Valeurs locales non secrètes :

- `ADMIN_TOKEN=dev-admin-token`
- `ADMIN_PASSWORD=dev-admin-password`
- `ADMIN_SESSION_SECRET=dev-admin-session-secret`
- `TURNSTILE_DISABLED=1`
- `SMTP_URL=smtp://mailpit:1025`
- `EMAIL_FROM=Magium <no-reply@magium.app>`
- base/user/password PostgreSQL : `magium_translation`

Reset complet de la base locale :

```bash
docker compose down -v
```

Le compose local utilise `postgres:18-alpine` et un volume `magium_postgres18_data` monté sur `/var/lib/postgresql`. Ne pas réutiliser directement un ancien volume PostgreSQL 17 : l'image Docker PostgreSQL 18 utilise un layout de données différent.

Arrêt sans supprimer le volume PostgreSQL :

```bash
docker compose down
```

Le fichier [.env.example](../.env.example) documente les overrides locaux. Il n'est pas nécessaire de le copier pour démarrer le stack, car `docker-compose.yml` fournit des valeurs de développement.

Si un ancien volume PostgreSQL 18 existe, `schema.sql` est rejoué uniquement à l'initialisation du volume. Le service API applique aussi les colonnes de compatibilité au démarrage avec `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` pour éviter une panne sur une base locale déjà créée.

## 3. Modèle De Données

Tables principales :

- `translation_proposals` : proposition publique et métadonnées de routage.
- `translation_proposal_contacts` : email brut temporaire d'une proposition, séparé de la proposition.
- `translation_email_consents` : preuve de consentement réutilisable, sans email brut.
- `translation_changesets` : lot mainteneur de propositions acceptées.

Champs importants d'une proposition :

- `public_id` : identifiant public API/admin, jamais affiché dans l'UX joueur.
- `status` : `pending`, `accepted`, `changeset`, `rejected` ou `stale`.
- `content_version`, `locale`, `chapter_id`, `scene_id`, `message_id` : routage technique.
- `target_type` : `paragraph` ou `choice`.
- `segment_index`, `segment_count` : cible exacte pour un paragraphe affiché.
- `current_text` : texte cible affiché au moment de la proposition, limité au paragraphe ou choix.
- `current_text_hash` : SHA-256 du texte cible affiché.
- `source_text_hash` : SHA-256 du segment source anglais correspondant quand disponible.
- `proposed_text` : correction proposée par le lecteur.
- `final_text` : version retenue par le mainteneur si acceptée.
- `note` : commentaire lecteur optionnel.
- `pseudonym`, `credit_requested`, `credit_approved` : crédit facultatif et modérable.
- `moderator_note` : note mainteneur.
- `changeset_id` : lien vers un changeset après regroupement.

Compatibilité :

- Les anciennes propositions sans `current_text` restent listables.
- L'admin affiche alors `Texte d'origine indisponible pour cette proposition`.
- Le diff visuel est désactivé seulement pour ces anciennes propositions.

Données personnelles :

- Le pseudo est facultatif, public uniquement si le contributeur demande un crédit et si le mainteneur l'approuve.
- L'email est facultatif, stocké séparément, jamais affiché dans l'admin, et supprimé après rejet, stale ou publication.
- Le consentement email réutilisable ne stocke pas l'email brut : seulement un HMAC de l'email normalisé et un hash du jeton navigateur.

## 4. API Publique

Routes publiques :

- `POST /v1/translation-proposals`
- `GET /v1/translation-proposals/:publicId/status`
- `GET|POST /v1/translation-proposals/:publicId/confirm-email`
- `GET /health`

Payload principal `POST /v1/translation-proposals` :

```json
{
  "contentVersion": "magium-...",
  "locale": "fr",
  "chapterId": "ch1",
  "sceneId": "Ch1-Intro1",
  "messageId": "ch1.Ch1_Intro1.p1",
  "targetType": "paragraph",
  "segmentIndex": 0,
  "segmentCount": 5,
  "currentText": "Texte affiche au joueur",
  "currentTextHash": "sha256-hex",
  "sourceTextHash": "sha256-hex",
  "proposedText": "Texte corrige",
  "note": "commentaire optionnel",
  "pseudonym": "pseudo optionnel",
  "creditRequested": false,
  "email": "lecteur@example.test",
  "notifyRequested": false,
  "emailConsentId": "optionnel",
  "emailConsentToken": "optionnel",
  "captchaToken": "turnstile-token"
}
```

Règles de validation :

- `contentVersion`, `locale`, `chapterId`, `sceneId`, `messageId`, `targetType`, `currentTextHash`, `sourceTextHash` et `proposedText` sont requis.
- `targetType` vaut `paragraph` ou `choice`.
- Une proposition `paragraph` exige `segmentIndex` et `segmentCount`.
- Une proposition `paragraph` ne peut pas contenir un séparateur de paragraphe `\n\n` dans `proposedText`.
- `proposedText` et `currentText` sont limités à 12000 caractères.
- Si `currentText` est fourni, son SHA-256 doit correspondre à `currentTextHash`.
- `currentTextHash` et `sourceTextHash` doivent être des SHA-256 hexadecimaux.
- `chapterId`, `sceneId` et `messageId` acceptent seulement des IDs techniques attendus.
- Si `notifyRequested` est vrai, un email valide et un transport email configure sont requis.
- Si `creditRequested` est vrai, un pseudo valide et non modéré est requis.
- Turnstile est obligatoire sauf si `TURNSTILE_DISABLED=1` ou `NODE_ENV=test`.

Reponse de création :

```json
{
  "publicId": "tr_...",
  "status": "pending",
  "emailConfirmationRequired": false,
  "notificationStatus": "none"
}
```

`notificationStatus` vaut :

- `none` : pas de suivi email demande.
- `confirmation_sent` : email de confirmation envoyé.
- `confirmed` : consentement navigateur réutilisé, contact confirme directement.

La PWA ne montre pas `publicId` au joueur.

## 5. Interface Admin

L'admin web est servi par le service API, pas par la PWA :

- `GET /admin`
- `GET /admin/assets/admin.css`
- `GET /admin/assets/admin.js`
- `GET /admin/session`
- `POST /admin/login`
- `POST /admin/logout`

Authentification :

- `ADMIN_PASSWORD` sert au login humain.
- `ADMIN_SESSION_SECRET` signe le cookie de session.
- Le cookie `magium_translation_admin` est `HttpOnly`, `SameSite=Strict`, `Path=/`, avec TTL `ADMIN_SESSION_TTL_HOURS`.
- En HTTPS production, `ADMIN_COOKIE_SECURE=1` doit être configure.
- Les actions mutantes via cookie exigent `x-admin-csrf`.
- `ADMIN_TOKEN` reste supporte pour les scripts via `Authorization: Bearer ...`.
- Les tentatives de login sont rate-limitées par IP via `ADMIN_LOGIN_RATE_LIMIT_WINDOW_MS` et `ADMIN_LOGIN_RATE_LIMIT_MAX`.
- Par défaut, l'IP de rate limit est l'adresse socket. `TRUST_PROXY=1` autorise l'utilisation du premier `X-Forwarded-For` uniquement si le reverse proxy écrase ou nettoie ce header.
- Les bodies JSON sont limités par `MAX_JSON_BODY_BYTES` avant parsing, avec `131072` octets par défaut.

Routes admin API :

- `GET /v1/admin/proposals?status=pending|accepted|changeset|rejected|stale`
- `POST /v1/admin/proposals/:publicId/review`
- `POST /v1/admin/proposals/bulk-review`
- `GET /v1/admin/changesets?status=ready|dispatched|published|stale`
- `POST /v1/admin/changesets`
- `GET /v1/admin/changesets/:publicId`
- `GET /v1/admin/changesets/:publicId/export`
- `POST /v1/admin/changesets/:publicId/dispatch-pr`
- `POST /v1/admin/changesets/:publicId/stale`
- `POST /v1/admin/changesets/:publicId/published`

L'admin permet :

- filtrer les propositions par statut ;
- regrouper visuellement par `locale/chapterId/messageId/segmentIndex` ;
- voir le texte d'origine cible ;
- voir un diff visuel origine/proposition ;
- modifier uniquement la version finale retenue ;
- accepter, rejeter ou marquer obsolète ;
- sélectionner des propositions en attente pour les refuser ou les marquer obsolètes en lot ;
- approuver ou masquer un crédit pseudo ;
- sélectionner des propositions acceptées ;
- bloquer côté UI deux propositions sur la même cible ;
- créer un changeset ;
- lister et exporter les changesets ;
- déclencher la PR GitHub ;
- marquer un changeset publié ou stale.

Diff visuel :

- Le package `diff` est utilisé côté API avec `diffWordsWithSpace`.
- La réponse admin contient `diffParts`.
- L'UI affiche les ajouts en vert, suppressions en rouge barré, modifications en orange.
- Le diff est une aide de revue, pas une source de vérité.
- La source de vérité du lot reste `finalText`.

Statuts :

- `pending` : proposition reçue, pas encore traitée.
- `accepted` : proposition acceptée avec `finalText`, disponible pour changeset.
- `changeset` : proposition incluse dans un changeset.
- `rejected` : proposition refusée, email de contact supprimé.
- `stale` : proposition ou changeset obsolète, email de contact supprimé.
- `ready` : changeset créé, pas encore dispatch.
- `dispatched` : dispatch GitHub demandé.
- `published` : changeset publié, notifications envoyées, contacts supprimés.

## 6. Emails Et Confidentialité

Transport email :

- Si `EMAIL_WEBHOOK_URL` est défini, l'API envoie un JSON `{ from, to, subject, text, html }` à ce webhook HTTP.
- Sinon, si `SMTP_URL` est défini, l'API utilise Nodemailer/SMTP avec une version texte et une version HTML.
- Sinon, le suivi email est refusé et l'adresse n'est pas stockée.
- En production, le transport retenu est Brevo SMTP via `smtp-relay.brevo.com:587`, avec `EMAIL_FROM=Magium <no-reply@magium.app>`.
- Le sender `no-reply@magium.app` ou le domaine `magium.app` doit être vérifié/autorisé dans Brevo avant activation publique.
- Les identifiants SMTP Brevo doivent être stockés uniquement dans Coolify et URL-encodés dans `SMTP_URL`.

Local :

- Docker Compose configure `SMTP_URL=smtp://mailpit:1025`.
- Docker Compose configure `EMAIL_FROM=Magium <no-reply@magium.app>`.
- Les emails sont visibles sur `http://localhost:8025`.
- Aucun email local ne sort vers Internet.

Double opt-in navigateur :

1. Première proposition avec email : l'API crée un contact non confirmé et envoie un lien.
2. Le lien appelle `/confirm-email`.
3. L'API confirme le contact, crée un consentement email et redirige vers `PUBLIC_WEB_URL`.
4. La redirection contient un fragment local `translation-email-consent`.
5. La PWA affiche une notice visible de confirmation après retour sur le lecteur, puis nettoie le fragment de l'URL.
6. Si le lien est ouvert dans le même navigateur que la proposition initiale, la PWA stocke le jeton de consentement en IndexedDB, sans stocker l'email brut dans ce consentement.
7. Les propositions suivantes avec le même email depuis le même navigateur réutilisent le jeton pendant un an glissant.

Stores locaux PWA :

- `magium.readerSettings` dans `localStorage` : contient `translationContributions`, désactivé par défaut, pour afficher ou masquer les icônes stylo quand l'URL API est configurée.
- `contributionProfile` : pseudo/email mémorisés uniquement si l'utilisateur coche l'option.
- consentements email : jetons de consentement confirmés, supprimables par le bouton d'effacement local.

Suppression :

- Rejet ou stale unitaire : suppression immédiate du contact email, sans notification.
- Rejet ou stale en lot : notification groupée des contacts confirmés par email normalisé, puis suppression.
- Publication : notification groupée des contacts confirmés par email normalisé, puis suppression.
- Consentements expirés : purge opportuniste.

Les emails de clôture et de publication sont des digests par destinataire : si un même email confirmé porte plusieurs propositions dans le même traitement, un seul message est envoyé. Les emails publics restent volontairement sobres et ne contiennent pas `messageId`, `sceneId`, hash, segment ou identifiant interne visible.

Modération pseudo :

- Le pseudo est facultatif.
- Il peut être refuse ou masque s'il est illégal, violent, haineux, sexuellement explicite, pédopornographique, contient du doxxing, de l'usurpation, une URL/email, ou un terme configure dans `PSEUDONYM_BLOCKLIST`.

## 7. GitHub PR Automation

Le bouton `Creer la PR` appelle :

```text
POST /v1/admin/changesets/:publicId/dispatch-pr
```

L'API appelle ensuite l'endpoint GitHub :

```text
POST /repos/{owner}/{repo}/actions/workflows/{workflow_id}/dispatches
```

Inputs envoyes au workflow :

- `changeset_id` : `publicId` du changeset.
- `api_url` : `PUBLIC_API_URL` de l'API.

Variables API requises pour le dispatch :

```text
GITHUB_TOKEN_FOR_DISPATCH=...
GITHUB_REPOSITORY_TARGET=ablond/magium
GITHUB_WORKFLOW_FILE=translation-changeset-pr.yml
GITHUB_REF_NAME=main
PUBLIC_API_URL=https://tr.magium.app
```

Token GitHub recommande :

- fine-grained personal access token ;
- limite au repo `ablond/magium` ;
- permission repository `Actions: Read and write`.

La permission `Actions: write` est requise par GitHub pour l'endpoint "Create a workflow dispatch event" :

- https://docs.github.com/rest/actions/workflows#create-a-workflow-dispatch-event

Secret GitHub Actions requis dans le repo :

```text
MAGIUM_TRANSLATION_API_TOKEN=<valeur de ADMIN_TOKEN cote translation-api>
```

Workflow :

- fichier : `.github/workflows/translation-changeset-pr.yml`
- trigger : `workflow_dispatch`
- permissions : `contents: write`, `pull-requests: write`
- étapes :
  1. checkout ;
  2. setup Node 24 LTS + pnpm ;
  3. fetch du changeset via API admin ;
  4. application du changeset ;
  5. `pnpm content:all`, `pnpm check`, `pnpm test`, `pnpm build` ;
  6. commit, push branche `translation/<changeset_id>`, PR vers `main`.

Application du changeset :

- outil : `tools/contributions/apply-changeset.mjs`
- source modifiee : `content/story-locales/<locale>/<chapter>.json`
- pour `targetType: "choice"` : remplace le texte du choix cible ;
- pour `targetType: "paragraph"` : remplace seulement le segment `segmentIndex` dans la valeur complète du `messageId` ;
- preserve les autres paragraphes et les separateurs existants ;
- compare `currentTextHash` au texte courant éditable ;
- si le hash ne correspond plus, produit un rapport stale et le workflow marque le changeset stale via l'API.

Important :

- GitHub Actions doit pouvoir joindre `PUBLIC_API_URL` depuis Internet, donc `https://tr.magium.app` en production.
- Un `PUBLIC_API_URL=http://localhost:8090` ne fonctionne pas pour une vraie PR GitHub.
- `GITHUB_TOKEN_FOR_DISPATCH` et `MAGIUM_TRANSLATION_API_TOKEN` sont deux secrets différents.

## 8. Deploiement Coolify

Le déploiement production a deux applications Coolify :

1. PWA statique Magium sur `https://magium.app`.
2. Translation API et admin mainteneur sur `https://tr.magium.app`.

### PWA

Configuration :

- source : repo GitHub via GitHub App ;
- build pack : Dockerfile ;
- Dockerfile : `Dockerfile` à la racine ;
- base directory : racine ;
- port : `8080` ;
- domaine production : `magium.app` ;
- volume : aucun.

Build args si les contributions sont activées :

```text
VITE_MAGIUM_CONTRIBUTIONS_API_URL=https://tr.magium.app
VITE_MAGIUM_TURNSTILE_SITE_KEY=...
```

### Translation API

Configuration :

- source : même repo GitHub ;
- build pack : Dockerfile ;
- base directory : `services/translation-api` ;
- Dockerfile : `Dockerfile` ;
- port : `8090` ;
- domaine production : `tr.magium.app` ;
- admin mainteneur : `https://tr.magium.app/admin` ;
- healthcheck : `/health` ;
- base PostgreSQL : service Coolify séparé.

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

Variables optionnelles mais recommandees selon les fonctions activées :

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
ADMIN_LOGIN_RATE_LIMIT_WINDOW_MS=900000
ADMIN_LOGIN_RATE_LIMIT_MAX=5
RATE_LIMIT_WINDOW_MS=60000
RATE_LIMIT_MAX=20
MAX_JSON_BODY_BYTES=131072
TRUST_PROXY=0
```

Checklist production :

- `PUBLIC_API_URL=https://tr.magium.app`.
- `PUBLIC_WEB_URL=https://magium.app`.
- `ALLOWED_ORIGIN=https://magium.app`.
- l'admin mainteneur est disponible sur `https://tr.magium.app/admin`.
- `ADMIN_COOKIE_SECURE=1` est obligatoire en production HTTPS.
- `MAX_JSON_BODY_BYTES=131072` limite les requêtes JSON avant parsing.
- `TRUST_PROXY=0` reste le défaut sûr ; n'utiliser `TRUST_PROXY=1` que derrière un proxy qui nettoie `X-Forwarded-For`.
- `TURNSTILE_SECRET_KEY` côté API correspond au site key PWA et le domaine `magium.app` est autorisé dans Cloudflare Turnstile.
- `EMAIL_CONSENT_SECRET` est aleatoire et long.
- `SMTP_URL` utilise Brevo en production : `smtp://<BREVO_SMTP_LOGIN_URL_ENCODED>:<BREVO_SMTP_KEY_URL_ENCODED>@smtp-relay.brevo.com:587`.
- `EMAIL_FROM` vaut `Magium <no-reply@magium.app>`.
- Le sender `no-reply@magium.app` ou le domaine `magium.app` est vérifie dans Brevo avant ouverture publique.
- `ADMIN_SESSION_SECRET` est aleatoire et long.
- `ADMIN_PASSWORD` est un mot de passe humain fort.
- `ADMIN_TOKEN` est un token long, reserve scripts/workflows.
- `MAGIUM_TRANSLATION_API_TOKEN` côté GitHub Actions vaut `ADMIN_TOKEN`.
- `GITHUB_TOKEN_FOR_DISPATCH` a `Actions: Read and write` sur le repo cible.
- `GITHUB_REPOSITORY_TARGET` vaut `ablond/magium`.

## 9. Depannage

### `GitHub dispatch is not configured`

Cause : `GITHUB_TOKEN_FOR_DISPATCH` ou `GITHUB_REPOSITORY_TARGET` est vide côté API.

Correction :

```text
GITHUB_TOKEN_FOR_DISPATCH=<token-github>
GITHUB_REPOSITORY_TARGET=ablond/magium
GITHUB_WORKFLOW_FILE=translation-changeset-pr.yml
GITHUB_REF_NAME=main
```

Redemarrer le service API après modification.

### `GitHub workflow dispatch failed: 401`

Causes probables :

- token GitHub invalide ;
- token expire ;
- token non autorisé sur le repo cible.

Vérifier le token dans Coolify et sa portee repo.

### `GitHub workflow dispatch failed: 403`

Causes probables :

- permission `Actions: Read and write` absente ;
- organisation GitHub bloque l'usage du token ;
- workflow désactivé.

Vérifier les permissions du fine-grained PAT et l'état du workflow.

### Dispatch OK mais workflow GitHub echoue au fetch changeset

Causes probables :

- `PUBLIC_API_URL` n'est pas accessible depuis GitHub Actions ;
- `PUBLIC_API_URL` pointe vers `localhost` ;
- secret GitHub `MAGIUM_TRANSLATION_API_TOKEN` absent ou différent de `ADMIN_TOKEN` ;
- `ALLOWED_ORIGIN` ne concerne pas les appels serveur GitHub, mais un reverse proxy peut bloquer.

### `email notifications are not configured`

Cause : utilisateur demande le suivi email mais ni `SMTP_URL` ni `EMAIL_WEBHOOK_URL` n'est configuré.

Correction : configurer un transport email ou laisser le suivi email désactivé.

### Aucun email visible en local

Vérifier :

- `SMTP_URL=smtp://mailpit:1025` dans le conteneur API ;
- `EMAIL_FROM=Magium <no-reply@magium.app>` dans le conteneur API ;
- Mailpit accessible sur `http://localhost:8025` ;
- l'utilisateur a coche le suivi email ;
- le mail n'a pas été evite par consentement email déjà confirme.

### Brevo refuse l'authentification SMTP

Causes probables :

- login SMTP Brevo incorrect ;
- clé SMTP Brevo incorrecte ou revoquee ;
- login ou clé non URL-encodés dans `SMTP_URL` ;
- `SMTP_URL` ne pointe pas vers `smtp-relay.brevo.com:587`.

Correction : régénérer/vérifier les identifiants SMTP dans Brevo, les stocker uniquement dans Coolify, puis redémarrer le service API.

### Brevo refuse l'expéditeur

Causes probables :

- `EMAIL_FROM` ne vaut pas `Magium <no-reply@magium.app>` ;
- le sender `no-reply@magium.app` n'est pas vérifie ;
- le domaine `magium.app` n'est pas authentifié/validé dans Brevo.

Correction : vérifier le sender ou authentifier le domaine dans Brevo avant activation publique.

### Email absent des logs transactionnels Brevo

Vérifier :

- la production utilise bien `SMTP_URL` Brevo, pas Mailpit ;
- `EMAIL_WEBHOOK_URL` n'est pas configure par erreur, car il est prioritaire sur SMTP ;
- l'utilisateur a demande le suivi email ;
- le consentement navigateur n'a pas evite un nouvel email de confirmation ;
- les logs du conteneur API ne montrent pas une erreur SMTP.

### Turnstile refuse les propositions

Vérifier :

- PWA : `VITE_MAGIUM_TURNSTILE_SITE_KEY` ;
- API : `TURNSTILE_SECRET_KEY` ;
- domaine autorisé dans Cloudflare Turnstile ;
- en local/test uniquement : `TURNSTILE_DISABLED=1`.

### Schema PostgreSQL ancien

Symptome : erreur sur une colonne manquante comme `current_text`, `segment_index` ou `segment_count`.

Corrections :

- redémarrer l'API pour laisser les `ALTER TABLE ... IF NOT EXISTS` de compatibilité s'appliquer ;
- en local, appliquer le schema ou repartir de zero :

```bash
docker compose exec -T postgres psql -U magium_translation -d magium_translation -f /docker-entrypoint-initdb.d/001-translation-api.sql
docker compose down -v
```

### Proposition obsolète

Cause : le texte cible éditable ne correspond plus à `currentTextHash`.

Comportement attendu :

- ne pas forcer l'application ;
- marquer proposition/changeset `stale` ;
- demander une nouvelle proposition si nécessaire.

### Le diff admin est absent

Causes probables :

- ancienne proposition sans `current_text` ;
- `currentText` n'était pas envoyé par l'ancienne PWA ;
- proposition créée avant l'ajout du diff visuel.

Comportement attendu : l'admin reste utilisable, avec seulement le texte propose et la version finale éditable.

## 10. Tests Et Validation

Validation repo obligatoire :

```bash
pnpm check
pnpm test
pnpm build
```

Si Docker, Coolify, l'API ou le packaging sont touches :

```bash
docker compose config
docker build -f services/translation-api/Dockerfile services/translation-api
pnpm docker:build-prod
```

Validation locale complète :

```bash
docker compose up -d --build
curl http://localhost:5173
curl http://localhost:8090/health
curl http://localhost:8090/admin
curl -H "Authorization: Bearer dev-admin-token" http://localhost:8090/v1/admin/proposals
curl http://localhost:8025
docker compose down
```

Recette navigateur PWA :

- ouvrir `http://localhost:5173` ;
- ouvrir Settings et activer `Corrections de traduction` ;
- vérifier que les icônes stylo grises apparaissent sur les paragraphes et choix ;
- cliquer sur l'icône stylo d'un paragraphe multi-paragraphes ;
- vérifier que seul le paragraphe cliqué est affiché et prérempli ;
- vérifier qu'aucun ID technique n'est visible ;
- envoyer une proposition anonyme ;
- vérifier le succès sans `TR_...`, sans `publicId`, sans reçu.

Recette navigateur admin :

- ouvrir `http://localhost:8090/admin` ;
- se connecter avec `dev-admin-password` ;
- vérifier la liste des propositions ;
- vérifier le texte d'origine, le diff proposé et la version finale éditable ;
- accepter/rejeter/marquer obsolète ;
- filtrer `accepted` ;
- créer un changeset ;
- exporter le JSON ;
- tester `Créer la PR` :
  - en local sans GitHub configuré : message lisible `GitHub dispatch is not configured` ;
  - en production configurée : statut `PR demandée`, puis run GitHub Actions.

Recette email locale :

- envoyer une proposition avec email et suivi coché ;
- ouvrir `http://localhost:8025` ;
- vérifier l'email de confirmation ;
- cliquer le lien ;
- vérifier que la PWA revient sur le lecteur avec une notice visible de confirmation ;
- vérifier que l'URL ne contient plus `translation-email-consent` ;
- vérifier que la PWA stocke le consentement quand le lien a été ouvert dans le même navigateur que la proposition initiale ;
- envoyer une nouvelle proposition avec le même email depuis le même navigateur ;
- vérifier qu'aucun nouvel email de confirmation n'est envoyé.

Tests couverts :

- `tests/contribution-payload.test.ts` : payload PWA, champs techniques invisibles.
- `tests/contribution-email-consent.test.ts` : consentement navigateur.
- `tests/contribution-changesets.test.mjs` : application de segments, stale, conflits.
- `services/translation-api/tests/proposals.node.mjs` : validation proposal, currentText/hash, paragraphes.
- `services/translation-api/tests/privacy-flow.node.mjs` : email, consentement, suppression.
- `services/translation-api/tests/admin-flow.node.mjs` : session admin, CSRF, changesets.
- `services/translation-api/tests/admin-diff.node.mjs` : diff admin.

Ne pas lancer `pnpm images:check -- --book 1` pour une itération qui ne touche pas les images Book 1.

## Fichiers A Connaitre

- `src/App.svelte` : UI joueur, modal contribution.
- `src/lib/contributions/payload.ts` : construction payload et hash PWA.
- `src/lib/contributions/storage.ts` : profil local opt-in et consentement email.
- `src/lib/contributions/turnstile.ts` : intégration Turnstile.
- `services/translation-api/src/server.js` : routes API/admin.
- `services/translation-api/src/proposals.js` : validation et transitions propositions.
- `services/translation-api/src/admin-auth.js` : session admin, cookie, CSRF.
- `services/translation-api/src/admin-diff.js` : diff visuel admin.
- `services/translation-api/src/email-consents.js` : consentement email.
- `services/translation-api/src/mailer.js` : SMTP/webhook email.
- `services/translation-api/src/github.js` : workflow dispatch GitHub.
- `services/translation-api/schema.sql` : schema PostgreSQL.
- `services/translation-api/admin/` : UI admin vanilla.
- `tools/contributions/apply-changeset.mjs` : application JSON et stale.
- `.github/workflows/translation-changeset-pr.yml` : PR automation.
- `docker-compose.yml` : stack local complet.
- `docs/contributions.md` : doc produit/fonctionnelle.
- `public/legal/contributions.html` : page publique données/contributions.
