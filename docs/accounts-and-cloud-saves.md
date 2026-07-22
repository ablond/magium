# Accounts And Cloud Saves

## Product Contract

Accounts are optional. The PWA remains playable offline and local saves keep
working when the account service is absent or unavailable.

The first account version deliberately provides only:

- registration with a username and password;
- login with the same username and password;
- a 30-day bearer session stored on the device;
- encrypted synchronization of autosave, named saves, deletions, and global achievements;
- logout without deleting local progress.

It does not collect an email address and does not provide password recovery,
password change, account deletion, social login, or device/session management.
The UI must say clearly that a lost password cannot be recovered.

Usernames use 3 to 32 ASCII letters, numbers, dots, underscores, or hyphens.
They are unique and compared case-insensitively. Passwords use 6 to 256
characters.

## Components

- `src/lib/account/api.ts`: HTTP client.
- `src/lib/account/storage.ts`: encrypted local session and deletion metadata.
- `src/lib/account/sync.ts`: client encryption, merge, replay validation, and upload.
- `services/translation-api/src/account/`: account routes, authentication, and repositories inside the unified Magium server.
- `services/translation-api/migrations/`: shared PostgreSQL migrations for account and translation tables.

The PWA enables the account section only when
`VITE_MAGIUM_API_URL` is present at build time. The production image sets it to
`/`, so account requests use the same `magium.app` origin as the PWA.

## Registration And Login

`POST /v1/accounts/register` and `POST /v1/accounts/login` accept:

```json
{
  "username": "Barry_01",
  "password": "a user password"
}
```

On registration, the server creates:

- a random 16-byte password salt;
- a 64-byte `scrypt` password hash;
- a separate random 16-byte client-encryption salt;
- a random 32-byte bearer token for the initial session.

Only the SHA-256 hash of the bearer token is stored in PostgreSQL. The raw
token is returned once to the PWA. Sessions expire after 30 days by default.
Authentication endpoints are rate-limited in memory per client IP.

Production must be served only over HTTPS. Passwords pass through the unified
server during registration/login, but are never stored as plaintext.

## Client-Side Encryption

After a successful registration or login, the browser derives a non-exportable
AES-GCM key with PBKDF2 SHA-256, 250,000 iterations, the account password, and
the server-provided encryption salt.

The local `account` IndexedDB store contains:

- the username and session expiry;
- the bearer token encrypted with the existing device-local AES-GCM key;
- the non-exportable account synchronization `CryptoKey`;
- per-account deletion tombstones.

The password is not persisted. The account key is stored as a non-exportable
`CryptoKey`, so a page reload can continue synchronizing without asking for the
password again. A new device derives the same key after a normal login.

Every cloud record is encrypted independently with AES-GCM and associated data
`magium-cloud-record-v1:<recordId>`. The server stores only the record ID,
timestamp, deletion flag, and encrypted box. It does not receive plaintext
`GameState`, variables, history, labels, or achievement identifiers.

## Synced Data

Records use these internal IDs:

- `save:<slotId>` for autosave and named saves;
- `achievements:global` for the global achievement collection.

This internal vocabulary is not displayed to the player.

Before upload, saves are decrypted locally. `debug.dirty` states are excluded
and can never enter cloud synchronization. Cloud saves downloaded on another
device must pass the same replay/migration path as local loads and portable
imports before they are stored locally.

Achievements are union-merged so a checkpoint rollback or a second device
cannot remove a previously unlocked achievement.

## Merge And Deletion Rules

Synchronization is local-first:

1. download all current opaque records;
2. compare each save independently with the local encrypted store;
3. restore a newer remote save only after decryption and replay validation;
4. union-merge achievements;
5. upload the resulting local records;
6. keep a deletion tombstone so another device cannot recreate a removed named save.

The first explicit login on a device prefers existing remote versions for
matching save IDs. This prevents the fresh local autosave created before login
from overwriting an older but meaningful remote playthrough. New local named
saves with different IDs are still uploaded.

Normal later conflicts use last-write-wins by ISO timestamp for each save.
This intentionally simple V1 trusts reasonably synchronized device clocks. It
does not offer a conflict-resolution UI.

Local save writes schedule a non-blocking synchronization after 750 ms. The
PWA also syncs when it becomes visible and exposes a manual Synchronize button.
Network failures never block a local save.

## API Routes

- `GET /health`
- `POST /v1/accounts/register`
- `POST /v1/accounts/login`
- `GET /v1/account`
- `POST /v1/account/logout`
- `GET /v1/account/sync`
- `PUT /v1/account/sync`

Every `/v1/account*` route requires `Authorization: Bearer <token>`, except
registration and login.

The sync write accepts at most 500 records and a 5 MB JSON body by default.
An encrypted record ciphertext is capped at 1.5 million characters.

## Known Limits

- There is no password recovery. Losing the password means losing access to the account and its encrypted cloud data.
- There is no password change because changing it would require rewrapping or re-encrypting the client key.
- There is no account deletion or session/device list yet.
- Conflict resolution is timestamp-based and has no manual chooser.
- The server does not make client-side anti-tamper absolute. A modified client can still upload arbitrary ciphertext under its own account.
- The browser storage is device-wide rather than partitioned into several local user profiles. This V1 is designed for one primary Magium account per browser profile.

These limits are acceptable for the requested basic account layer, but must be
revisited before presenting the system as a high-security identity platform.
