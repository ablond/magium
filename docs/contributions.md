# Contributions Publiques De Traduction

## Objectif

Permettre à un lecteur de proposer une correction de traduction depuis la PWA, sans compte et sans exposer les fichiers sources au runtime.

La référence technique exhaustive pour reprendre ou faire évoluer ce sous-système est [docs/translation-contributions-system.md](./translation-contributions-system.md). Ce document-ci reste la vue produit/fonctionnelle.

Le flux est privacy-first :

- contribution anonyme par défaut ;
- pseudo facultatif uniquement pour les crédits ;
- email facultatif uniquement pour le suivi ;
- confirmation email initiale avant toute notification, réutilisable un an dans le même navigateur ;
- suppression de l'email après refus ou publication ;
- proposition revue par un mainteneur avant intégration ;
- intégration par changeset puis pull request GitHub.

## Surface PWA

La PWA affiche un petit bouton de correction sur les paragraphes et choix visibles. Pour un texte narratif, le bouton cible le paragraphe affiché, pas tout le bloc `messageId` si celui-ci contient plusieurs paragraphes séparés par une ligne vide. Le formulaire montre uniquement ce segment courant, la source anglaise du même segment quand elle diffère, puis les champs de contribution.

Les IDs techniques ne sont pas affichés au joueur, mais le payload contient :

- `contentVersion`
- `locale`
- `chapterId`
- `sceneId`
- `messageId`
- `targetType`
- `segmentIndex` et `segmentCount` pour `targetType: "paragraph"`
- `currentText`, limité au paragraphe ou choix affiché au moment de la proposition
- `currentTextHash`
- `sourceTextHash`

Ces champs servent uniquement à router, vérifier et revoir la proposition. `currentText` n'est pas un bloc source complet : il permet à l'admin mainteneur d'afficher le texte d'origine cible et un diff visuel avec le texte proposé.

Une correction de paragraphe ne peut pas contenir de séparateur de paragraphe `\n\n`. Le bouton joueur sert à corriger un paragraphe affiché à la fois ; une correction éditoriale complète d'un bloc multi-paragraphes reste un cas mainteneur/manual.

Variables de build PWA :

```text
VITE_MAGIUM_CONTRIBUTIONS_API_URL=https://tr.magium.app
VITE_MAGIUM_TURNSTILE_SITE_KEY=...
```

Si l'URL API n'est pas configurée, le formulaire affiche une erreur et n'envoie rien.

En local Docker, `docker compose up -d` lance la PWA en mode Vite dev avec :

- PWA : `http://localhost:5173`
- API : `http://localhost:8090`
- admin mainteneur : `http://localhost:8090/admin`
- Turnstile désactivé côté API par `TURNSTILE_DISABLED=1`
- token admin : `dev-admin-token`
- mot de passe admin : `dev-admin-password`

## API De Contribution

Le service vit sous `services/translation-api`. Il est séparé de l'image PWA statique et peut être déployé comme service Coolify distinct avec PostgreSQL.

La route `GET /health` retourne `{ "status": "ok" }` pour Docker Compose et Coolify.

Routes publiques :

- `POST /v1/translation-proposals`
- `GET /v1/translation-proposals/:publicId/status`
- `POST /v1/translation-proposals/:publicId/confirm-email`

Routes admin protégées par `ADMIN_TOKEN` ou par une session web mainteneur :

- `GET /v1/admin/proposals`
- `POST /v1/admin/proposals/:publicId/review`
- `POST /v1/admin/changesets`
- `GET /v1/admin/changesets`
- `GET /v1/admin/changesets/:publicId`
- `GET /v1/admin/changesets/:publicId/export`
- `POST /v1/admin/changesets/:publicId/dispatch-pr`
- `POST /v1/admin/changesets/:publicId/stale`
- `POST /v1/admin/changesets/:publicId/published`

Interface mainteneur :

- `GET /admin` sert une interface web simple depuis le service API ;
- `POST /admin/login`, `GET /admin/session` et `POST /admin/logout` gèrent une session cookie `HttpOnly`, `SameSite=Strict` ;
- les actions mutantes depuis l'interface web utilisent un jeton CSRF ; les scripts peuvent continuer à utiliser `Authorization: Bearer ADMIN_TOKEN`.
- le détail d'une proposition affiche le texte d'origine, un diff entre origine et proposition, puis la version finale retenue éditable.

Variables API production obligatoires :

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
ADMIN_SESSION_TTL_HOURS=8
```

Variables API production optionnelles :

```text
SMTP_URL=smtp://<BREVO_SMTP_LOGIN_URL_ENCODED>:<BREVO_SMTP_KEY_URL_ENCODED>@smtp-relay.brevo.com:587
EMAIL_FROM=Magium <no-reply@magium.app>
EMAIL_WEBHOOK_URL=https://...
EMAIL_WEBHOOK_TOKEN=...
GITHUB_TOKEN_FOR_DISPATCH=...
GITHUB_REPOSITORY_TARGET=owner/repo
GITHUB_WORKFLOW_FILE=translation-changeset-pr.yml
GITHUB_REF_NAME=main
PSEUDONYM_BLOCKLIST=...
```

Transport email :

- `EMAIL_WEBHOOK_URL` défini : l'API envoie le contenu du mail en JSON `{ from, to, subject, text }` vers ce webhook ;
- sinon `SMTP_URL` défini : l'API envoie via SMTP avec Nodemailer ;
- sinon le suivi email est refusé, sans stocker l'adresse.

En production, `SMTP_URL` doit pointer vers Brevo SMTP (`smtp-relay.brevo.com:587`) et `EMAIL_FROM` doit valoir `Magium <no-reply@magium.app>`. Le sender `no-reply@magium.app` ou le domaine `magium.app` doit être vérifié dans Brevo avant activation publique.

Domaines production :

- application de lecture : `https://magium.app` ;
- API de contribution et admin mainteneur : `https://tr.magium.app`, avec admin sur `https://tr.magium.app/admin` ;
- `ALLOWED_ORIGIN` doit rester strictement `https://magium.app`.

En local Docker, le compose configure `SMTP_URL=smtp://mailpit:1025` et `EMAIL_FROM=Magium <no-reply@magium.app>`. Les emails sont visibles dans Mailpit sur `http://localhost:8025` et ne sortent pas vers Internet.

## Revue Et Changesets

Une proposition ne crée jamais une PR seule. Le mainteneur accepte, rejette ou marque obsolète les propositions, puis crée un changeset.

Règles :

- un changeset ne peut contenir qu'une seule version finale par cible `locale/chapterId/messageId/target` ;
- pour un paragraphe, la cible est `segmentIndex`, donc plusieurs corrections du même `messageId` peuvent cohabiter si elles touchent des segments différents ;
- les propositions concurrentes sur le même segment ou le même choix doivent être résolues dans l'interface de revue ;
- le diff mainteneur est une aide de revue, pas une source de vérité ; la version finale éditable reste celle qui entre dans le changeset ;
- une proposition de paragraphe dont le hash du segment courant ne correspond plus devient obsolète, même si le reste du message est encore valide ;
- le pseudo crédité reste soumis à modération.

## GitHub Actions

Le workflow `.github/workflows/translation-changeset-pr.yml` est déclenche par `workflow_dispatch`.

Il :

1. récupère le changeset depuis l'API ;
2. applique les corrections dans `content/story-locales/<locale>/<chapter>.json` avec `tools/contributions/apply-changeset.mjs`, en remplaçant seulement le segment visé pour une correction de paragraphe ;
3. refuse tout lot partiellement obsolète ;
4. lance `pnpm content:all`, `pnpm check`, `pnpm test`, `pnpm build` ;
5. ouvre une PR unique pour le lot.

Secret GitHub attendu :

```text
MAGIUM_TRANSLATION_API_TOKEN
```

## Données Personnelles

L'email est stocké séparément de la proposition et ne devient actif qu'après confirmation par lien. La première confirmation crée aussi un jeton local dans le navigateur, valable un an glissant pour le même email saisi depuis ce navigateur. Le serveur conserve seulement un HMAC de l'email et un hash du jeton, jamais l'email brut dans cette preuve de consentement.

L'email brut de contact est supprimé :

- immédiatement si la proposition est rejetée ou marquée obsolète ;
- après notification quand le changeset accepté est publié.

Le formulaire joueur affiche seulement un message de succès après envoi. Il ne demande pas au lecteur de conserver un reçu et n'affiche pas le `publicId` de la proposition.

Le pseudo n'est public que si le contributeur demande explicitement un crédit et si le mainteneur l'approuve. Les pseudos illégaux, violents, haineux, sexuellement explicites, pédopornographiques, de doxxing, d'usurpation ou manifestement inadaptés doivent être refusés ou masqués.

La page publique `/legal/contributions.html` résume ces règles pour les lecteurs. L'éditeur de l'instance publique doit compléter ses mentions légales avant activation du formulaire.
