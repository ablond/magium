# Magium Translation API

Service séparé pour recevoir, modérer et grouper les propositions publiques de correction de traduction.

La PWA reste statique. Ce service ne sert pas le contenu narratif brut ; il reçoit seulement des propositions ciblées par hash, identifiants techniques, et le segment affiché nécessaire à la revue mainteneur.

La référence de reprise complète du sous-système est [../../docs/translation-contributions-system.md](../../docs/translation-contributions-system.md). Ce README reste une fiche courte propre au service.

## Variables

```text
PORT=8090
DATABASE_URL=postgres://...
PUBLIC_API_URL=https://tr.magium.app
PUBLIC_WEB_URL=https://magium.app
ALLOWED_ORIGIN=https://magium.app
ADMIN_TOKEN=...
ADMIN_PASSWORD=...
ADMIN_SESSION_SECRET=...
ADMIN_COOKIE_SECURE=1
ADMIN_SESSION_TTL_HOURS=8
TURNSTILE_SECRET_KEY=...
PSEUDONYM_BLOCKLIST=...
SMTP_URL=smtp://<BREVO_SMTP_LOGIN_URL_ENCODED>:<BREVO_SMTP_KEY_URL_ENCODED>@smtp-relay.brevo.com:587
EMAIL_FROM=Magium <no-reply@magium.app>
EMAIL_WEBHOOK_URL=https://...
EMAIL_WEBHOOK_TOKEN=...
EMAIL_CONSENT_SECRET=...
GITHUB_TOKEN_FOR_DISPATCH=...
GITHUB_REPOSITORY_TARGET=owner/repo
GITHUB_WORKFLOW_FILE=translation-changeset-pr.yml
GITHUB_REF_NAME=main
```

`TURNSTILE_DISABLED=1` est réservé au développement local et aux tests.

## Local Docker

Depuis la racine du dépôt :

```bash
docker compose up -d
```

Le stack lance :

- PWA Vite dev : `http://localhost:5173`
- API : `http://localhost:8090`
- Admin mainteneur : `http://localhost:8090/admin`
- PostgreSQL 18 : `localhost:5432`
- Mailpit : `http://localhost:8025`

Valeurs locales par défaut :

- `ADMIN_TOKEN=dev-admin-token`
- `ADMIN_PASSWORD=dev-admin-password`
- `ADMIN_SESSION_SECRET=dev-admin-session-secret`
- `TURNSTILE_DISABLED=1`
- `DATABASE_URL=postgres://magium_translation:magium_translation@postgres:5432/magium_translation`
- `SMTP_URL=smtp://mailpit:1025`
- `EMAIL_FROM=Magium <no-reply@magium.app>`
- `EMAIL_CONSENT_SECRET=dev-email-consent-secret`

Reset complet :

```bash
docker compose down -v
```

Le compose local utilise `postgres:18-alpine` avec un volume monté sur `/var/lib/postgresql`. Ce layout est différent de PostgreSQL 17 ; supprimer l'ancien volume local avant de repartir sur PostgreSQL 18.

Healthcheck :

```bash
curl http://localhost:8090/health
```

## Docker Coolify

Le service API a son propre Dockerfile :

```bash
docker build -f services/translation-api/Dockerfile services/translation-api
```

Dans Coolify, créer une application séparée :

- base directory : `services/translation-api`
- Dockerfile : `Dockerfile`
- port : `8090`
- PostgreSQL : service séparé

En production, renseigner au minimum `DATABASE_URL`, `ADMIN_TOKEN`, `ADMIN_PASSWORD`, `ADMIN_SESSION_SECRET`, `PUBLIC_API_URL=https://tr.magium.app`, `PUBLIC_WEB_URL=https://magium.app`, `ALLOWED_ORIGIN=https://magium.app`, `TURNSTILE_SECRET_KEY` et `EMAIL_CONSENT_SECRET`. Pour activer les notifications email, configurer aussi Brevo SMTP via `SMTP_URL` et `EMAIL_FROM=Magium <no-reply@magium.app>`. Pour l'admin web `https://tr.magium.app/admin`, mettre `ADMIN_COOKIE_SECURE=1`.

Configuration Brevo attendue :

```text
SMTP_URL=smtp://<BREVO_SMTP_LOGIN_URL_ENCODED>:<BREVO_SMTP_KEY_URL_ENCODED>@smtp-relay.brevo.com:587
EMAIL_FROM=Magium <no-reply@magium.app>
```

Vérifier dans Brevo que le sender `no-reply@magium.app` ou le domaine `magium.app` est autorisé avant activation publique. Les identifiants SMTP Brevo doivent rester dans Coolify.

## Flux

1. La PWA envoie `POST /v1/translation-proposals`.
2. Si un email est fourni, le service envoie un lien de confirmation, sauf si un jeton navigateur confirme déjà cet email.
3. Le mainteneur traite les propositions via `GET /admin` ou via les routes admin protégées par `ADMIN_TOKEN`.
4. Les propositions acceptées sont regroupées dans un changeset.
5. `POST /v1/admin/changesets/<id>/dispatch-pr` déclenche le workflow GitHub.
6. Après publication, `POST /v1/admin/changesets/<id>/published` notifie les emails confirmés puis les supprime.

Si aucun transport email n'est configuré, les propositions demandant une notification sont refusées sans stockage de l'adresse.

Si `EMAIL_WEBHOOK_URL` est utilisé hors prod, le payload envoyé contient `{ from, to, subject, text }` avec `from=Magium <no-reply@magium.app>` par défaut.

La confirmation email crée un consentement réutilisable un an par navigateur. La table de consentement ne stocke pas l'email brut : seulement un HMAC de l'email normalisé et un hash du jeton navigateur.

## Routes publiques

- `POST /v1/translation-proposals`
- `GET /v1/translation-proposals/:publicId/status`
- `POST /v1/translation-proposals/:publicId/confirm-email`

## Routes admin

- `GET /v1/admin/proposals`
- `POST /v1/admin/proposals/:publicId/review`
- `POST /v1/admin/changesets`
- `GET /v1/admin/changesets`
- `GET /v1/admin/changesets/:publicId`
- `GET /v1/admin/changesets/:publicId/export`
- `POST /v1/admin/changesets/:publicId/dispatch-pr`
- `POST /v1/admin/changesets/:publicId/stale`
- `POST /v1/admin/changesets/:publicId/published`

## Interface Web Mainteneur

`GET /admin` sert une interface web sans framework pour lister les propositions, accepter/rejeter/marquer obsolète, créer un changeset, exporter un changeset, déclencher la PR, puis marquer un lot publié ou stale.

Le détail d'une proposition affiche le texte d'origine cible, un diff visuel origine/proposition, et une version finale retenue éditable. Les anciennes propositions qui ne contiennent pas encore le texte d'origine restent visibles, mais sans diff.

L'interface utilise `ADMIN_PASSWORD` pour ouvrir une session cookie `HttpOnly` signée avec `ADMIN_SESSION_SECRET`. Les actions POST effectuées avec cookie exigent le jeton CSRF renvoyé par `/admin/session`. Les appels machine peuvent continuer à utiliser `Authorization: Bearer ADMIN_TOKEN`.

## Base De Données

Exécuter `schema.sql` sur la base PostgreSQL avant le premier démarrage.
