# Verification

## Suite Obligatoire

```bash
pnpm check
pnpm test
pnpm build
```

Ces commandes doivent passer avant de terminer une iteration.

## Ce Que Verifie Chaque Commande

`pnpm check` :

- `svelte-check` ;
- TypeScript app ;
- TypeScript config Vite.

`pnpm test` :

- regenere le contenu via `content:all` ;
- execute Vitest ;
- couvre parser et moteur.

`pnpm build` :

- regenere et valide le contenu ;
- build Vite ;
- lance `dist:check`.

## Checks Contenu

```bash
pnpm content:all
```

Doit confirmer :

- archive a jour ou import effectue ;
- 54 `.magium` ;
- 278 fichiers archives au commit actuel ;
- 54 chapitres generes ;
- 136 achievements.

Les nombres peuvent evoluer si `raduprv/Magium@main` change. Dans ce cas, adapter la doc seulement apres verification consciente.

## Checks Navigateur Recommandes

Avec le serveur :

```bash
pnpm dev --host 127.0.0.1
```

Verifier :

1. la page charge directement le livre 1 chapitre 1 ;
2. cliquer `Excited` affiche la scene suivante ;
3. recharger la page reprend la progression ;
4. le panneau Saves affiche `autosave` ;
5. IndexedDB contient un objet `encrypted`, pas les variables en clair ;
6. export avec phrase de passe produit `.magium-save` ;
7. import avec la meme phrase de passe restaure la progression ;
8. mobile 390 x 844 : pas de chevauchement UI/texte ;
9. desktop 1280 x 720 : lecture et panneaux utilisables.

## Exemple De Verification IndexedDB

Dans la console navigateur :

```js
const dbReq = indexedDB.open('magium-pwa')
const db = await new Promise((resolve, reject) => {
  dbReq.onsuccess = () => resolve(dbReq.result)
  dbReq.onerror = () => reject(dbReq.error)
})
const tx = db.transaction('saves', 'readonly')
const saves = await new Promise((resolve, reject) => {
  const req = tx.objectStore('saves').getAll()
  req.onsuccess = () => resolve(req.result)
  req.onerror = () => reject(req.error)
})
console.log(saves)
```

Attendu :

- `slotId`, `updatedAt`, `contentVersion` visibles ;
- `encrypted.iv` et `encrypted.ciphertext` visibles ;
- pas de `currentSceneId`, stats ou variables en clair.

## Controle Dist

`pnpm dist:check` doit rejeter :

- `.magium` dans `dist` ;
- JSON canonique brut dans `dist` ;
- texte brut source evident dans des assets publics.

Ce check est volontairement conservateur. Si un faux positif apparait, corriger le check avec prudence plutot que le supprimer.

## Artefacts Locaux

Ne pas committer :

- `dist/`
- `node_modules/`
- `.playwright-cli/`
- `output/playwright/`
- exports `.magium-save` de test.

Ces chemins sont ignores par `.gitignore`.
