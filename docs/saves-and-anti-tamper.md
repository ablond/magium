# Saves And Anti-Tamper

## Goal

Store progress without a user account while avoiding:

- plaintext variables in localStorage;
- simple manual stat modification;
- importing an incoherent save file.

## Local Storage

Files:

- `src/lib/storage/idb.ts`
- `src/lib/storage/crypto.ts`
- `src/lib/storage/saves.ts`
- `src/lib/storage/achievementProgress.ts`

IndexedDB database:

```text
magium-pwa
```

Object stores:

- `achievementProgress`
- `keys`
- `saves`

`achievementProgress` stores the global achievement collection as one encrypted
record.
`keys` stores the local AES-GCM key.
`saves` stores encrypted `StoredSaveRecord` values.

## Why IndexedDB

IndexedDB can:

- store non-exportable `CryptoKey` values;
- store encrypted objects without localStorage;
- manage several slots.

localStorage is reserved for non-critical UI preferences.

## Local Encryption

`getLocalSaveKey()`:

- looks for `local-aes-gcm-v1` in IndexedDB;
- otherwise generates a 256-bit AES-GCM key;
- stores the key with `extractable: false`.

`encryptJson()`:

- serializes the object to JSON;
- generates a 96-bit IV;
- encrypts with AES-GCM;
- uses `additionalData = "magium-save-v1"`.

If one byte of ciphertext, IV, or additionalData changes, decryption must fail.

## Slots

Autosave:

- slot `autosave`;
- updated after every choice and every confirmed stat allocation.

Manual slots:

- created from the Saves panel as local saves that can be named and renamed;
- identified by a stable internal `slotId` that is not shown raw to the player;
- stored in the same object store;
- each record remains encrypted.

## Global Achievement Progress

`GameState.achievements` is intentionally scoped to the current playthrough,
because import replay compares this field with state reconstructed from
`history`. A checkpoint rollback or new game may therefore remove an
achievement from `GameState` without removing it from the player's collection.

The collection visible in the Achievements panel lives in `achievementProgress`:

- one `global` record;
- payload encrypted with the local AES-GCM key;
- `additionalData = "magium-achievement-progress-v1"`;
- achievement variables stored only in the encrypted payload.

On startup, if no global record exists, the app migrates achievements found in
encrypted non-debug local saves. `debug.dirty` states are ignored and cannot
feed global progress.

A `.magium-save` export remains a playthrough save. It does not include the
global achievement collection. After an import validated by replay, achievements
proved by the imported state are merged into `achievementProgress`.

## Local Debug Saves

Local Debug mode can directly change scene, choices, stats, counters, and
variables. As soon as a debug operation touches state, the encrypted payload
contains:

```ts
debug?: {
  dirty: true
  lastAction: string
  updatedAt: string
}
```

These states remain allowed in IndexedDB and named local saves because they are
useful for exploring the graph from `pnpm dev`. They are not replayable through
`history`, because debug helpers do not create `choice` or `stats` events and
do not recalculate `historyDigest`.

Constraints:

- `exportSave()` refuses every `debug.dirty` state;
- the UI states that the debug save remains local;
- `importSave()` also rejects a crafted payload with `debug.dirty`.

Do not turn this mode into an exportable bypass of anti-tamper replay. If a
debug exploration should become a playable save, replay it through normal
choices and allocations.

## Saves Panel UX

The panel separates player use cases:

- autosave states that the current game is saved after every choice and stat allocation;
- local saves allow creating, loading, renaming, and deleting save points without a password;
- checkpoint remains a separate action with a readable chapter label;
- Transfer shows only two actions, export or import a save;
- password fields appear only after choosing export or import.

The UI must not show `slotId`, `local-key`, `pbkdf2`, `prod`, or scene IDs such
as `Ch12`. It shows a save name, a date, and a readable chapter like
`Book 1 - Chapter 12`.

Visible statuses stay player-oriented, for example `Save file downloaded` or
`Save imported and ready`.

## Export

Export produces a `.magium-save` JSON container:

```ts
type SaveContainer = {
  kind: 'magium-save'
  version: 1
  encryption: 'local-key' | 'pbkdf2'
  salt?: string
  associatedData: string
  encrypted: EncryptedBox
}
```

From the player UI, export always asks for a passphrase:

- derives a PBKDF2 SHA-256 key;
- 250,000 iterations;
- 16-byte salt;
- produces a file transferable between browsers and devices when its playthrough
  history can be replayed by the current runtime.

`local-key` mode remains accepted only to reject old or non-transferable files
cleanly; the UI no longer creates exports without a passphrase.

Without a passphrase, `exportSave()` refuses export.

## Import

Import:

1. parses the container;
2. derives or retrieves the key;
3. decrypts;
4. replays `history` from the start on the current runtime;
5. compares the reconstructed state with the decrypted state;
6. stores the replayed state with the current `contentVersion` only if validation passes.

A decrypted but incoherent save must be rejected. A different `contentVersion`
is not rejected by itself: older saves are accepted when replay proves that the
path, variables, stats, achievements, and checkpoint remain compatible with the
current graph.

`history` contains two event types:

- `choice`: narrative choice visible at replay time;
- `stats`: manual point allocation.

Stat allocation replay verifies that the stat was visible, allocatable,
supported by enough `v_available_points`, and did not exceed `v_max_stat`. It
also reconstructs `_aux` variables and point counters. A save that directly
modifies a stat or counter is therefore rejected if it does not match the
replayed path.

`historyDigest` starts from `magium:v2:initial`. This digest remains stable as
long as the history format does not change. `contentVersion` identifies the
runtime content that created the save, but restore is optimistic: import and
local load first try to replay the save against the current runtime, then
rewrite the stored state with the current `contentVersion` if replay succeeds.
This keeps UX, copy, translation, and compatible content updates from breaking
player saves while still rejecting paths that no longer exist or no longer
produce the same state.

UI-side errors must stay understandable and visible in the Saves panel, for
example `Unsupported save file`, `Wrong password or damaged save file`,
`This save cannot be replayed with this content version`, or
`This save file does not match a playable game`.

## Acceptable Unencrypted Data

In the IndexedDB `saves` store, the record exposes only:

- `slotId`
- `label`
- `createdAt`
- `updatedAt`
- `contentVersion`
- `encrypted`

These metadata fields are used to list and rename saves. `label` is a name
entered by the player; it must not contain game state.

In the IndexedDB `achievementProgress` store, the record exposes only:

- `id`
- `createdAt`
- `updatedAt`
- `contentVersion`
- `encrypted`

Achievement variables must not appear in plaintext in this record.

Do not add:

- plaintext `currentSceneId`;
- variables;
- stats;
- achievements;
- digest;
- history.

## Known Limits

Without a backend:

- client code can be modified;
- the local key lives in the browser;
- DevTools can observe runtime data after decryption;
- a determined user cannot be prevented from cheating.

What the implementation guarantees:

- no trivial localStorage manipulation;
- no plaintext game variables;
- detection of modified exported files;
- detection of state incompatible with a playable path;
- detection of stats and point counters incompatible with replay.
