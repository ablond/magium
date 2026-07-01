# Sauvegardes Et Anti-Tamper

## Objectif

Stocker la progression sans compte utilisateur, tout en evitant :

- variables en clair dans localStorage ;
- modification manuelle simple des stats ;
- import d'un fichier de sauvegarde incoherent.

## Stockage Local

Fichiers :

- `src/lib/storage/idb.ts`
- `src/lib/storage/crypto.ts`
- `src/lib/storage/saves.ts`
- `src/lib/storage/achievementProgress.ts`

Base IndexedDB :

```text
magium-pwa
```

Object stores :

- `achievementProgress`
- `keys`
- `saves`

`achievementProgress` stocke la collection globale des succes sous forme d'un record chiffré.
`keys` stocke la clé AES-GCM locale.
`saves` stocke des `StoredSaveRecord` chiffrés.

## Pourquoi IndexedDB

IndexedDB permet :

- stocker des `CryptoKey` non exportables ;
- stocker des objets chiffrés sans passer par localStorage ;
- gerer plusieurs slots.

localStorage est reserve aux preferences UI non critiques.

## Chiffrement Local

`getLocalSaveKey()` :

- cherche `local-aes-gcm-v1` dans IndexedDB ;
- sinon genere une clé AES-GCM 256 bits ;
- stocke la clé avec `extractable: false`.

`encryptJson()` :

- serialise l'objet en JSON ;
- genere un IV 96 bits ;
- chiffre avec AES-GCM ;
- utilise `additionalData = "magium-save-v1"`.

Si un octet du ciphertext, de l'IV ou de l'additionalData change, le decrypt doit echouer.

## Slots

Autosave :

- slot `autosave` ;
- mis a jour apres chaque choix et apres chaque allocation de stats confirmee.

Slots manuels :

- crees depuis le panneau Sauvegardes comme sauvegardes locales nommables et renommables ;
- identifies par un `slotId` interne stable qui n'est pas affiche tel quel au joueur ;
- stockes dans le meme object store ;
- chaque record reste chiffre.

## Progression Globale Des Succes

`GameState.achievements` reste volontairement scope a la partie courante, car le replay d'import compare ce champ avec l'etat reconstruit depuis `history`. Un retour checkpoint ou une nouvelle partie peut donc retirer un succes de `GameState` sans le retirer au joueur.

La collection visible dans le panneau Succès vit dans `achievementProgress` :

- un seul record `global` ;
- payload chiffre avec la clé AES-GCM locale ;
- `additionalData = "magium-achievement-progress-v1"` ;
- variables de succes stockees seulement dans le payload chiffre.

Au demarrage, si aucun record global n'existe, l'app migre les succes trouves dans les saves locales chiffrees non-debug. Les etats `debug.dirty` sont ignores et ne peuvent pas alimenter la progression globale.

Un `.magium-save` exporte reste une sauvegarde de partie. Il n'embarque pas la collection globale de succes. Apres un import valide par replay, les succes prouves par l'etat importe sont fusionnes dans `achievementProgress`.

## Saves Debug Locales

Le mode Debug local peut modifier directement la scene, les choix, les stats, les compteurs et les variables. Des qu'une operation debug touche l'etat, le payload chiffre contient :

```ts
debug?: {
  dirty: true
  lastAction: string
  updatedAt: string
}
```

Ces etats restent autorises dans IndexedDB et dans les saves nommees locales, car ils servent a explorer rapidement le graphe depuis `pnpm dev`. Ils ne sont pas rejouables par `history`, puisque les helpers debug ne creent pas d'evenements `choice` ou `stats` et ne recalculent pas `historyDigest`.

Contraintes :

- `exportSave()` refuse tout etat `debug.dirty` ;
- l'UI affiche que la sauvegarde debug reste locale ;
- `importSave()` rejette aussi un payload fabrique avec `debug.dirty`.

Ne pas transformer ce mode en contournement exportable du replay anti-tamper. Si une exploration debug doit devenir une partie jouable, il faut la rejouer avec les choix et allocations normales.

## UX Du Panneau Sauvegardes

Le panneau separe les usages joueur :

- la sauvegarde automatique indique que la partie courante est sauvegardee apres chaque choix et allocation de stats ;
- les sauvegardes locales permettent de creer, charger, renommer et supprimer des points de sauvegarde sans mot de passe ;
- le point de controle reste une action separee, avec un libelle de chapitre lisible ;
- la section Transfert affiche seulement deux actions, exporter ou importer une sauvegarde ;
- les champs de mot de passe n'apparaissent qu'apres avoir choisi exporter ou importer.

L'UI ne doit pas afficher `slotId`, `local-key`, `pbkdf2`, `prod` ou des scene IDs comme `Ch12`. Elle affiche un nom de sauvegarde, une date et un chapitre lisible comme `Livre 1 - Chapitre 12`.

Les statuts visibles restent orientes joueur, par exemple `Fichier de sauvegarde telecharge` ou `Sauvegarde importee et prete`.

## Export

L'export produit un fichier `.magium-save` qui est un conteneur JSON :

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

Depuis l'UI joueur, l'export demande toujours une phrase de passe :

- derive une clé PBKDF2 SHA-256 ;
- 250 000 iterations ;
- salt 16 octets ;
- produit un fichier transferable entre navigateurs et appareils si le `contentVersion` est identique.

Le mode `local-key` reste seulement accepte pour rejeter proprement d'anciens fichiers ou des fichiers non transferables ; l'UI ne cree plus d'export sans phrase de passe.

Sans phrase de passe, `exportSave()` refuse l'export.

## Import

L'import :

1. parse le conteneur ;
2. derive ou recupere la clé ;
3. decrypte ;
4. verifie que le `contentVersion` de la sauvegarde correspond au runtime courant ;
5. rejoue `history` depuis le debut ;
6. compare l'etat obtenu a l'etat decrypte ;
7. sauvegarde seulement si la validation passe.

Une sauvegarde decryptee mais incoherente doit etre rejetee.

`history` contient deux types d'evenements :

- `choice` : choix narratif visible au moment du replay ;
- `stats` : allocation manuelle de points.

Le replay des allocations verifie que la stat etait visible, qu'elle etait allouable, que `v_available_points` suffisait, et que la valeur finale ne depassait pas `v_max_stat`. Il reconstruit aussi les variables `_aux` et les compteurs de points. Une sauvegarde qui modifie directement une stat ou un compteur est donc rejetee si elle ne correspond pas au chemin rejoue.

Le `historyDigest` part de `magium:v2:initial`. Ce digest reste stable tant que le format d'historique ne change pas ; l'invalidation des sauvegardes incompatibles passe aussi par le `contentVersion`, qui inclut le format runtime courant et change quand le graphe genere change. Une sauvegarde exportee doit donc etre chiffree avec phrase de passe et viser le meme `contentVersion`.

Les erreurs affichees cote UI doivent rester comprehensibles et visibles dans le panneau Sauvegardes, par exemple `Fichier de sauvegarde non pris en charge`, `Mot de passe incorrect ou fichier de sauvegarde endommage`, `Cette sauvegarde appartient a une autre version du contenu` ou `Ce fichier de sauvegarde ne correspond pas a une partie jouable`.

## Donnees Non Chiffrees Acceptables

Dans IndexedDB `saves`, le record expose seulement :

- `slotId`
- `label`
- `createdAt`
- `updatedAt`
- `contentVersion`
- `encrypted`

Ces metadonnees servent a lister et renommer les sauvegardes. Le `label` est un nom saisi par le joueur ; il ne doit pas contenir d'etat de jeu.

Dans IndexedDB `achievementProgress`, le record expose seulement :

- `id`
- `createdAt`
- `updatedAt`
- `contentVersion`
- `encrypted`

Les variables de succes ne doivent pas apparaitre en clair dans ce record.

Ne pas ajouter :

- `currentSceneId` en clair ;
- variables ;
- stats ;
- achievements ;
- digest ;
- history.

## Limites Connues

Sans backend :

- le code client peut etre modifie ;
- la clé locale vit dans le navigateur ;
- DevTools peut observer le runtime apres dechiffrement ;
- on ne peut pas empecher un utilisateur determine de tricher.

Ce qui est garanti par l'implementation :

- pas de manipulation triviale de localStorage ;
- pas de variables de jeu en clair ;
- detection des fichiers exportes modifies ;
- detection d'un etat incompatible avec un chemin jouable ;
- detection des stats et compteurs de points incompatibles avec le replay.
