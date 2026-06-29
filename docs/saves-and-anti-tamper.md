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

Base IndexedDB :

```text
magium-pwa
```

Object stores :

- `keys`
- `saves`

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

- crees depuis le panneau Saves sous forme de routes nommees ;
- stockes dans le meme object store ;
- chaque record reste chiffre.

## UX Du Panneau Saves

Le panneau explique le comportement sans vocabulaire technique :

- la progression est sauvegardee apres chaque choix ;
- les saves nommees servent a conserver plusieurs routes ;
- l'export sans mot de passe cree un fichier restaurable seulement dans ce navigateur ;
- un mot de passe rend ce fichier portable vers un autre navigateur ou la production ;
- l'import reprend seulement un backup compatible avec la version de contenu courante.

Les statuts visibles restent orientes joueur, par exemple `Portable backup exported` ou `Save imported and ready`.

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

Avec phrase de passe :

- derive une clé PBKDF2 SHA-256 ;
- 250 000 iterations ;
- salt 16 octets ;
- export portable entre navigateurs, entre local et prod, si le `contentVersion` est identique.

Sans phrase de passe :

- utilise la clé locale ;
- utile comme backup local, mais pas portable vers un autre navigateur sans la clé locale.

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

Le `historyDigest` part de `magium:v2:initial`. Ce changement, combine au `contentVersion` runtime V2, invalide les anciennes sauvegardes dont l'historique ne contient pas les evenements types. Une sauvegarde exportee depuis local vers prod doit donc etre chiffree avec phrase de passe et viser le meme `contentVersion`.

Les erreurs affichees cote UI doivent rester comprehensibles et visibles dans le panneau Saves, par exemple `Unsupported save file`, `This backup only restores in the browser that exported it`, `Wrong password or damaged save file`, `This save was made for a different content version` ou `This save file does not match a playable route`.

## Donnees Non Chiffrees Acceptables

Dans IndexedDB `saves`, le record expose seulement :

- `slotId`
- `updatedAt`
- `contentVersion`
- `encrypted`

Ces metadonnees servent a lister les slots.

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
