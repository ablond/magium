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
5. desktop 1280 x 720 : le rail gauche affiche `Lire`, `Stats`, `Sauvegardes`, `Succès`, `Paramètres`, `À propos` en mode FR, le header lecteur ne montre plus de badge de succès ni de sauvegarde auto, la zone de lecture utilise Literata sur une largeur confortable et un espacement inter-paragraphes dense, façon livre, sans chevauchement entre lignes ou dialogues, les scenes du livre 1 utilisent les packs narratifs `fr/ch1` à `fr/ch11b`, les dialogues courts comme `ch5.Ch5_Intro.p2` sont rendus en plusieurs vrais paragraphes DOM plutôt qu'en un seul gros `<p>`, et le rail gauche ainsi que le panneau droit ouvert restent visibles pendant un scroll long ;
6. mobile 390 x 844 : la navigation reste compacte, le récit garde un rythme dense et lisible en FR et EN sans chevauchement UI/texte, et les panneaux s'ouvrent en overlay au-dessus du récit avec fermeture par bouton, fond cliquable et touche `Escape`, sans repousser le contenu vers le bas ;
7. la lettrine du premier paragraphe alphabetique monte legerement au-dessus de la ligne et ne semble pas tomber dans le paragraphe ;
8. le panneau Sauvegardes affiche `autosave` et explique autosave, routes nommees, export local-only sans mot de passe, export portable avec mot de passe, import et erreurs inline sans jargon technique ;
9. le panneau Stats est vide au debut, puis affiche les stats de base apres `Ch2-Stats` avec compteur de points, valeur/max, boutons `+/-`, confirmation, effacement et aide courte sous les boutons ;
10. a `Ch2-Stats`, le max manuel est `3`, le bouton `+` se desactive quand une stat atteint le max ou quand il ne reste plus de points, et `-` ne retire que le brouillon non confirme ;
11. confirmer une allocation decremente `v_available_points`, sauvegarde, puis garde les points confirmes non retirables par le panneau ;
12. le choix narratif `special:stats` avance vers la scene cible puis ouvre le panneau, et le bouton Stats permet aussi d'investir plus tard ;
13. apres le passage original qui affecte `v_max_stat = 4`, le panneau affiche le max `4` ;
14. les stats d'aura apparaissent apres l'introduction de `B3-Ch04a`, tandis que `Magical Power` et `Magical Knowledge` restent invisibles ;
15. apres un choix menant a un test de stat, le resultat apparait avant le texte de scene, puis viennent le contenu et les prochains choix, avec succes/echec et niveau localises ;
16. le panneau Paramètres contient la bascule globale FR/EN, thème, taille du texte, contraste, révélation de scène et toggle Illustrations ;
17. le toggle Illustrations masque/affiche l'image de moment apres la scene correspondante sans changer la partie ;
18. une image de moment absente ou non chargeable ne bloque pas la lecture ;
19. le panneau À propos affiche l'attribution, les liens source/licence et les changements de l'adaptation ;
20. changer FR/EN ne reset pas la scene courante, ne modifie pas l'historique, et met bien `GameState.locale` sur la langue choisie ;
21. IndexedDB contient un objet `encrypted`, pas les variables en clair ;
22. export sans phrase de passe produit un `.magium-save` local-only qui est refuse proprement dans un autre stockage navigateur ;
23. export avec phrase de passe produit un `.magium-save` portable ;
24. import avec la meme phrase de passe restaure la progression si le `contentVersion` courant correspond ;
25. mauvais mot de passe, fichier incompatible, `contentVersion` different, ou stat / `v_available_points` incoherent affichent une erreur claire dans le panneau et ne modifient pas la sauvegarde locale.
26. sous `pnpm dev`, le rail affiche un panneau `Debug` ;
27. le panneau Debug permet de sauter vers une scene d'un autre chapitre et applique les `setVariables` d'entree de scene ;
28. un choix masque par ses conditions peut etre applique depuis Debug sans ajouter d'evenement `history` ;
29. les boutons undo/redo Debug fonctionnent apres un choix normal, un jump debug et une edition de stats ;
30. l'edition debug de `v_available_points`, `v_available_points_aux`, `v_max_stat`, d'une stat et de sa variable `_aux` est sauvegardee localement puis rechargeable via un slot nomme ;
31. apres une modification debug, le panneau Sauvegardes bloque l'export `.magium-save` avec une erreur claire et laisse la save locale utilisable ;
32. apres `pnpm build` puis `pnpm preview`, le bouton Debug n'apparait pas.

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
- `output/visual/api-inputs/`
- `output/visual/api-runs/`
- `output/visual/originals/`
- `output/visual/staging/`
- exports `.magium-save` de test.

Ces chemins sont ignores par `.gitignore`.
