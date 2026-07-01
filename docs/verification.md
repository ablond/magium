# Verification

## Suite Obligatoire

```bash
pnpm images:check -- --book 1
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

`pnpm images:check -- --book 1` :

- verifie les prompts publics et les assets WebP Book 1 ;
- refuse les marqueurs RAG, embeddings, `evidenceRefs`, `.magium` et copies longues du texte canonique ;
- accepte les WebP manquants pendant la generation manuelle des images.

`pnpm images:stage -- --book 1` :

- prepare par defaut tous les dossiers locaux ignores par Git sous `output/visual/staging/book1/<moment-id>/` ;
- copie `prompt.md` et les portraits de reference renommes sous `references/<character-id>.webp` ;
- permet de joindre les bonnes images dans ChatGPT sans manipulation manuelle des noms `portrait.webp`.
- accepte aussi `--moment <id>` ou `--chapter <id>` pour limiter le staging.

`pnpm images:normalize -- --book 1` :

- convertit les PNG/JPG de moments en `illustration.webp` avec `ffmpeg` ;
- deplace les originaux sous `output/visual/originals/book1/moments/` ;
- laisse `public/visuals/book1/moments/` avec seulement `illustration.md` et `illustration.webp`.

`pnpm images:refsheets -- --book 1 --missing` :

- prepare des planches de reference locales sous `output/visual/api-inputs/book1/<moment-id>/` ;
- regroupe jusqu'a quatre portraits par planche pour reduire les couts API ;
- refuse implicitement les erreurs canoniques verrouillees par la config : pas de `arraka.webp`, pas de couple `flower.webp` + `illuna.webp` sur un meme moment.

`pnpm images:generate:api -- --book 1 --missing --batch --quality high --reference-mode sheets` :

- chemin avance optionnel qui exige `OPENAI_API_KEY` dans l'environnement ;
- prepare et soumet un batch OpenAI `/v1/images/edits` avec `gpt-image-2`, WebP et `quality=high` ;
- affiche la commande `--retrieve` a relancer quand le batch est termine ;
- garde les manifests et outputs temporaires sous `output/visual/api-runs/`, ignores par Git.

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
- `Ch11b-Credits` absent du contenu runtime, avec `Ch11b-Ending` qui pointe directement vers `B2-Ch01a-Intro` en `checkpoint_save` ;
- aucune condition `choice(...) if (...)` embarquee dans `target`, `special` ou `setVariables`.
- prompts images Book 1 publics courts sous `public/visuals/book1`, sans RAG, embeddings, `evidenceRefs`, `.magium`, anciens chemins `chapters` ou copie longue du texte canonique.
- aucun prompt de moment n'attache `arraka.webp`, ni `flower.webp` et `illuna.webp` ensemble.

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
5. desktop 1280 x 720 : le rail gauche affiche `Lire`, `Stats`, `Sauvegardes`, `Succès`, `Paramètres`, `À propos` en mode FR sans couper les libellés, le header lecteur ne montre plus de badge de succès ni de sauvegarde auto, la zone de lecture utilise Literata sur une largeur confortable et un espacement inter-paragraphes dense, façon livre, sans chevauchement entre lignes ou dialogues, les scenes du livre 1 utilisent les packs narratifs `fr/ch1` à `fr/ch11b`, les dialogues courts comme `ch5.Ch5_Intro.p2` sont rendus en plusieurs vrais paragraphes DOM plutôt qu'en un seul gros `<p>`, et le rail gauche ainsi que le panneau droit ouvert restent visibles pendant un scroll long ;
6. mobile 390 x 844 : la navigation reste compacte, le récit garde un rythme dense et lisible en FR et EN sans chevauchement UI/texte, et les panneaux s'ouvrent en overlay au-dessus du récit avec fermeture par bouton, fond cliquable et touche `Escape`, sans repousser le contenu vers le bas ;
7. la lettrine du premier paragraphe alphabetique monte legerement au-dessus de la ligne et ne semble pas tomber dans le paragraphe ;
8. le panneau Sauvegardes separe clairement sauvegarde automatique, sauvegardes locales, point de controle et transfert ; il n'affiche pas `autosave`, `slotId`, `Ch12`, `route`, `prod`, `local-key` ou `pbkdf2` au joueur ;
9. le panneau Stats est vide au debut, puis affiche les stats de base apres `Ch2-Stats` avec compteur de points, valeur/max, boutons `+/-`, confirmation, effacement et aide courte sous les boutons ;
10. a `Ch2-Stats`, le max manuel est `3`, le bouton `+` se desactive quand une stat atteint le max ou quand il ne reste plus de points, et `-` ne retire que le brouillon non confirme ;
11. confirmer une allocation decremente `v_available_points`, sauvegarde, puis garde les points confirmes non retirables par le panneau ;
12. le choix narratif `special:stats` avance vers la scene cible puis ouvre le panneau, et le bouton Stats permet aussi d'investir plus tard ;
13. apres le passage original qui affecte `v_max_stat = 4`, le panneau affiche le max `4` ;
14. les stats d'aura apparaissent apres l'introduction de `B3-Ch04a`, tandis que `Magical Power` et `Magical Knowledge` restent invisibles ;
15. apres un choix menant a un test de stat, le resultat apparait avant le texte de scene, puis viennent le contenu et les prochains choix, avec succes/echec et niveau localises ;
16. quand un choix debloque un succes nouveau pour le navigateur, une notice compacte `Succès obtenu` / `Achievement unlocked` apparait avant le texte avec le titre et la caption du succes, puis ne se reaffiche pas apres reload, import, changement de langue, nouvelle partie ou ouverture du panneau Succès ;
17. sur une scene de mort, le succes de mort reste visible dans le panneau Succès apres `Load from last checkpoint` ou nouvelle partie, tandis que le checkpoint restaure quitte la scene de mort, sauvegarde l'autosave restauree et ne conserve pas la branche echouee dans l'historique ;
18. le panneau Paramètres contient les libelles `Langue` et `Thème`, la bascule globale FR/EN, thème, taille du texte, contraste et toggle Illustrations ; en thème clair, le rail, les boutons de navigation, les panneaux, les champs, les notices et les états actifs restent lisibles sur desktop et mobile, puis gagnent encore en contraste avec `High contrast` actif ;
19. le toggle Illustrations masque/affiche l'image de moment apres la scene correspondante sans changer la partie ;
20. une image de moment absente ou non chargeable ne bloque pas la lecture ;
21. le panneau À propos affiche l'attribution, les liens source/licence et les changements de l'adaptation ;
22. changer FR/EN ne reset pas la scene courante, ne modifie pas l'historique, et met bien `GameState.locale` sur la langue choisie ;
23. IndexedDB contient des objets `encrypted` pour `saves` et `achievementProgress`, sans variables, stats ou noms de succes en clair ;
24. creer, charger, renommer et supprimer une sauvegarde locale garde des libelles joueur lisibles, avec chapitre affiche comme `Livre 1 - Chapitre 12` plutot qu'un ID technique ;
25. cliquer `Exporter une sauvegarde` ouvre seulement alors le champ de mot de passe ; sans mot de passe, le fichier n'est pas telecharge ;
26. export avec phrase de passe produit un `.magium-save` dont le nom de fichier contient `magium`, le chapitre lisible et la date ;
27. cliquer `Importer une sauvegarde` ouvre seulement alors le champ de mot de passe et le choix de fichier ;
28. import avec la meme phrase de passe restaure la progression si le `contentVersion` courant correspond ;
29. mauvais mot de passe, fichier incompatible, `contentVersion` different, ou stat / `v_available_points` incoherent affichent une erreur claire dans le panneau et ne modifient pas la sauvegarde locale.
30. sous `pnpm dev`, le rail affiche un panneau `Debug` ;
31. le panneau Debug permet de sauter vers une scene d'un autre chapitre et applique les `setVariables` d'entree de scene ;
32. un choix masque par ses conditions peut etre applique depuis Debug sans ajouter d'evenement `history` ;
33. les boutons undo/redo Debug fonctionnent apres un choix normal, un jump debug et une edition de stats ;
34. l'edition debug de `v_available_points`, `v_available_points_aux`, `v_max_stat`, d'une stat et de sa variable `_aux` est sauvegardee localement puis rechargeable via un slot nomme ;
35. apres une modification debug, le panneau Sauvegardes bloque l'export `.magium-save` avec une erreur claire et laisse la save locale utilisable ;
36. apres `pnpm build` puis `pnpm preview`, le bouton Debug n'apparait pas.

## Exemple De Verification IndexedDB

Dans la console navigateur :

```js
const dbReq = indexedDB.open('magium-pwa')
const db = await new Promise((resolve, reject) => {
  dbReq.onsuccess = () => resolve(dbReq.result)
  dbReq.onerror = () => reject(dbReq.error)
})
const savesTx = db.transaction('saves', 'readonly')
const saves = await new Promise((resolve, reject) => {
  const req = savesTx.objectStore('saves').getAll()
  req.onsuccess = () => resolve(req.result)
  req.onerror = () => reject(req.error)
})
const achievementTx = db.transaction('achievementProgress', 'readonly')
const achievementProgress = await new Promise((resolve, reject) => {
  const req = achievementTx.objectStore('achievementProgress').getAll()
  req.onsuccess = () => resolve(req.result)
  req.onerror = () => reject(req.error)
})
console.log({ saves, achievementProgress })
```

Attendu :

- `slotId`, `label`, `createdAt`, `updatedAt`, `contentVersion` visibles ;
- `encrypted.iv` et `encrypted.ciphertext` visibles ;
- pas de `currentSceneId`, stats, variables ou noms de succes en clair.

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
- `output/visual/api-inputs/`
- `output/visual/api-runs/`
- `output/visual/originals/`
- `output/visual/staging/`
- exports `.magium-save` de test.

Ces chemins sont ignores par `.gitignore`.
