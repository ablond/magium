# Verification

## Suite Obligatoire

```bash
pnpm check
pnpm test
pnpm build
```

Ces commandes doivent passer avant de terminer une iteration.

Si Docker, Coolify ou le packaging de production changent, ajouter :

```bash
pnpm docker:build-prod
```

Si une publication est demandee, finir avec :

```bash
pnpm docker:push-prod
```

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

`pnpm docker:build-prod` :

- build l'image `ghcr.io/ablond/magium:<timestamp>` localement ;
- verifie le filesystem runtime ;
- demarre le conteneur nginx unprivileged sur un port local temporaire ;
- verifie `/`, `/sw.js`, `/manifest.webmanifest` et le fallback SPA.

`pnpm docker:push-prod` :

- execute les memes controles ;
- pousse `ghcr.io/ablond/magium:<timestamp>` et `ghcr.io/ablond/magium:latest` ;
- inspecte les tags publies avec `docker buildx imagetools inspect`.

## Checks Contenu

```bash
pnpm content:all
```

Doit confirmer :

- archive a jour ou import effectue ;
- 54 `.magium` ;
- 278 fichiers archives au commit actuel ;
- 54 chapitres generes ;
- 136 achievements ;
- packs UI `locales/en/ui` et `locales/fr/ui` generes et cles UI synchronisees ;
- packs story FR du livre 1 (`locales/fr/ch1` à `locales/fr/ch11b`), `locales/fr/achievements`, `locales/en/stats` et `locales/fr/stats` generes et valides, avec achievements FR couverts pour le livre 1 ;
- assignments canoniques en `mode: "set" | "add"` ;
- aucune condition `choice(...) if (...)` embarquee dans `target`, `special` ou `setVariables`.

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
4. si le navigateur prefere `fr`, l'interface et le livre 1 démarrent en francais ; sinon utiliser Settings pour basculer sur `Français` ;
5. desktop 1280 x 720 : le rail gauche affiche `Lire`, `Stats`, `Sauvegardes`, `Succès`, `Paramètres`, `À propos` en mode FR, le header lecteur ne montre plus de badge de succès ni de sauvegarde auto, la zone de lecture utilise Literata sur une largeur confortable et plus dense, les scenes du livre 1 utilisent les packs narratifs `fr/ch1` à `fr/ch11b`, et le rail gauche ainsi que le panneau droit ouvert restent visibles pendant un scroll long ;
6. mobile 390 x 844 : la navigation reste compacte, il n'y a pas de chevauchement UI/texte en FR et EN, et les panneaux s'ouvrent en overlay au-dessus du récit avec fermeture par bouton, fond cliquable et touche `Escape`, sans repousser le contenu vers le bas ;
7. la lettrine du premier paragraphe alphabetique monte legerement au-dessus de la ligne et ne semble pas tomber dans le paragraphe ;
8. le panneau Sauvegardes affiche `autosave` et explique autosave, routes nommees, export, mot de passe et import sans jargon technique ;
9. le panneau Stats est vide au debut, puis affiche les stats de base apres `Ch2-Stats` avec compteur de points, valeur/max, boutons `+/-`, confirmation, effacement et aide courte sous les boutons ;
10. a `Ch2-Stats`, le max manuel est `3`, le bouton `+` se desactive quand une stat atteint le max ou quand il ne reste plus de points, et `-` ne retire que le brouillon non confirme ;
11. confirmer une allocation decremente `v_available_points`, sauvegarde, puis garde les points confirmes non retirables par le panneau ;
12. le choix narratif `special:stats` avance vers la scene cible puis ouvre le panneau, et le bouton Stats permet aussi d'investir plus tard ;
13. apres le passage original qui affecte `v_max_stat = 4`, le panneau affiche le max `4` ;
14. les stats d'aura apparaissent apres l'introduction de `B3-Ch04a`, tandis que `Magical Power` et `Magical Knowledge` restent invisibles ;
15. apres un choix menant a un test de stat, le resultat apparait avant le texte de scene, puis viennent le contenu et les prochains choix, avec succes/echec et niveau localises ;
16. le panneau Paramètres contient la bascule globale FR/EN, thème, taille du texte, contraste et révélation de scène ;
17. le panneau À propos affiche l'attribution, les liens source/licence et les changements de l'adaptation ;
18. changer FR/EN ne reset pas la scene courante, ne modifie pas l'historique, et met bien `GameState.locale` sur la langue choisie ;
19. IndexedDB contient un objet `encrypted`, pas les variables en clair ;
20. export avec phrase de passe produit `.magium-save` ;
21. import avec la meme phrase de passe restaure la progression ;
22. un import dont une stat ou `v_available_points` ne correspond pas au replay est rejete.

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

## Controle Image Docker

Le script Docker doit rejeter :

- `.magium` dans le filesystem runtime ;
- JSON canonique brut dans le filesystem runtime ;
- `node_modules` ;
- `.env*` ;
- extrait source brut evident comme `ID: Ch1-Intro1` ou `chapters/ch1.magium`.

L'image finale attendue sert uniquement le contenu de `dist/` via nginx sur le port `8080`.

## Artefacts Locaux

Ne pas committer :

- `dist/`
- `node_modules/`
- `.playwright-cli/`
- `output/playwright/`
- exports `.magium-save` de test.

Ces chemins sont ignores par `.gitignore`.
