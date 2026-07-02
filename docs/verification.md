# Vérification

## Suite Obligatoire

```bash
pnpm images:check -- --book 1
pnpm check
pnpm test
pnpm build
```

Ces commandes doivent passer avant de terminer une itération.

Si Docker, Coolify ou le packaging de production changent, ajouter :

```bash
docker compose config
pnpm docker:build-prod
```

Si une publication est demandée, finir avec :

```bash
pnpm docker:push-prod
```

## Ce Que Vérifie Chaque Commande

`pnpm check` :

- `svelte-check` ;
- TypeScript app ;
- TypeScript config Vite.

`pnpm test` :

- régénère le contenu via `content:all` ;
- exécute Vitest ;
- couvre parser, moteur, i18n et changesets de contribution ;
- exécute aussi les tests Node du service `services/translation-api`.

`pnpm build` :

- régénère et valide le contenu ;
- build Vite ;
- lance `dist:check`.

`pnpm images:check -- --book 1` :

- vérifie les prompts publics et les assets WebP Book 1 ;
- refuse les marqueurs RAG, embeddings, `evidenceRefs`, `.magium` et copies longues du texte canonique ;
- accepte les WebP manquants pendant la génération manuelle des images.

`pnpm images:stage -- --book 1` :

- prépare par défaut tous les dossiers locaux ignorés par Git sous `output/visual/staging/book1/<moment-id>/` ;
- copie `prompt.md` et les portraits de référence renommés sous `references/<character-id>.webp` ;
- permet de joindre les bonnes images dans ChatGPT sans manipulation manuelle des noms `portrait.webp`.
- accepte aussi `--moment <id>` ou `--chapter <id>` pour limiter le staging.

`pnpm images:normalize -- --book 1` :

- convertit les PNG/JPG de moments en `illustration.webp` avec `ffmpeg` ;
- déplace les originaux sous `output/visual/originals/book1/moments/` ;
- laisse `public/visuals/book1/moments/` avec seulement `illustration.md` et `illustration.webp`.

`pnpm images:refsheets -- --book 1 --missing` :

- prépare des planches de référence locales sous `output/visual/api-inputs/book1/<moment-id>/` ;
- regroupe jusqu'à quatre portraits par planche pour réduire les coûts API ;
- refuse implicitement les erreurs canoniques verrouillées par la config : pas de `arraka.webp`, pas de couple `flower.webp` + `illuna.webp` sur un même moment.

`pnpm images:generate:api -- --book 1 --missing --batch --quality high --reference-mode sheets` :

- chemin avancé optionnel qui exige `OPENAI_API_KEY` dans l'environnement ;
- prépare et soumet un batch OpenAI `/v1/images/edits` avec `gpt-image-2`, WebP et `quality=high` ;
- affiche la commande `--retrieve` à relancer quand le batch est terminé ;
- garde les manifests et outputs temporaires sous `output/visual/api-runs/`, ignorés par Git.

`pnpm docker:build-prod` :

- build l'image `ghcr.io/ablond/magium:<timestamp>` localement ;
- vérifie le filesystem runtime ;
- démarre le conteneur nginx unprivileged sur un port local temporaire ;
- vérifie `/`, `/sw.js`, `/manifest.webmanifest` et le fallback SPA.

`docker compose config` :

- vérifie la syntaxe du stack local PWA dev, API contribution, PostgreSQL et Mailpit ;
- confirme que les valeurs locales par défaut suffisent sans fichier `.env`.

Pour une modification du stack local contribution, vérifier aussi :

```bash
docker build -f services/translation-api/Dockerfile services/translation-api
docker compose up -d --build
curl http://localhost:5173
curl http://localhost:8090/health
curl http://localhost:8090/admin
curl -H "Authorization: Bearer dev-admin-token" http://localhost:8090/v1/admin/proposals
curl http://localhost:8025
docker compose down
```

Pour une modification de l'admin mainteneur, vérifier aussi dans un navigateur :

- `/admin` affiche le formulaire de connexion hors session ;
- `dev-admin-password` ouvre le dashboard local ;
- le détail d'une proposition affiche le texte d'origine et le diff proposé ;
- une proposition peut être acceptée/rejetée/marquée obsolète depuis l'UI ;
- une ou plusieurs propositions acceptées peuvent être groupées en changeset ;
- l'UI bloque la sélection de deux propositions concurrentes sur le même segment.

Pour une recette complète du système de contributions traduction, vérifier aussi :

- PWA `http://localhost:5173` : bouton `Proposer une correction` visible sur un paragraphe et sur un choix ;
- bloc multi-paragraphes : le modal affiche seulement le paragraphe cliqué, prérempli dans la correction ;
- aucun `publicId`, `messageId`, `sceneId`, `chapterId`, `contentVersion`, `segmentIndex` ni hash technique visible dans l'UX joueur ;
- envoi anonyme : succès simple sans `TR_...`, sans reçu à conserver ;
- envoi avec email local : email de confirmation visible dans Mailpit `http://localhost:8025` ;
- Mailpit affiche l'expéditeur `Magium <no-reply@magium.app>` ;
- clic du lien de confirmation : retour PWA avec URL nettoyée et consentement navigateur stocké ;
- deuxième proposition avec le même email depuis le même navigateur : pas de deuxième email de confirmation ;
- admin `http://localhost:8090/admin` : texte d'origine visible, diff proposé lisible, version finale seule éditable ;
- acceptation puis création de changeset : export JSON accessible ;
- sélection de deux propositions sur la même cible `locale/chapterId/messageId/segmentIndex` bloquée côté UI et refusée côté API ;
- bouton `Créer la PR` en local sans GitHub configuré : erreur lisible `GitHub dispatch is not configured` ;
- bouton `Créer la PR` en environnement configuré : workflow GitHub lancé, PR unique créée après `pnpm content:all`, `pnpm check`, `pnpm test`, `pnpm build` ;
- marquage `published` : notifications envoyées si contacts confirmés, puis emails bruts supprimés ;
- marquage `rejected` ou `stale` : emails bruts supprimés.

`pnpm docker:push-prod` :

- exécute les mêmes contrôles ;
- pousse `ghcr.io/ablond/magium:<timestamp>` et `ghcr.io/ablond/magium:latest` ;
- inspecte les tags publiés avec `docker buildx imagetools inspect`.

## Checks Contenu

```bash
pnpm content:all
```

Doit confirmer :

- archive à jour ou import effectue ;
- 54 `.magium` ;
- 278 fichiers archives au commit actuel ;
- 54 chapitres générés ;
- 136 achievements ;
- packs UI `locales/en/ui` et `locales/fr/ui` générés et clés UI synchronisees ;
- packs story FR du livre 1 (`locales/fr/ch1` à `locales/fr/ch11b`), `locales/fr/achievements`, `locales/en/stats` et `locales/fr/stats` générés et valides, avec achievements FR couverts pour le livre 1 ;
- assignments canoniques en `mode: "set" | "add"` ;
- `Ch11b-Credits` absent du contenu runtime, avec `Ch11b-Ending` qui pointe directement vers `B2-Ch01a-Intro` en `checkpoint_save` ;
- aucune condition `choice(...) if (...)` embarquee dans `target`, `special` ou `setVariables`.
- prompts images Book 1 publics courts sous `public/visuals/book1`, sans RAG, embeddings, `evidenceRefs`, `.magium`, anciens chemins `chapters` ou copie longue du texte canonique.
- aucun prompt de moment n'attache `arraka.webp`, ni `flower.webp` et `illuna.webp` ensemble.

Les nombres peuvent evoluer si `raduprv/Magium@main` change. Dans ce cas, adapter la doc seulement après vérification consciente.

## Checks Navigateur Recommandes

Avec le serveur :

```bash
pnpm dev --host 127.0.0.1
```

Vérifier :

1. la page charge directement le livre 1 chapitre 1 ;
2. cliquer `Excited` affiche la scène suivante ;
3. recharger la page reprend la progression ;
4. si le navigateur préfère `fr`, l'interface et le livre 1 démarrent en français ; sinon utiliser Settings pour basculer sur `Français` ;
5. desktop 1280 x 720 : le rail gauche affiche `Lire`, `Stats`, `Sauvegardes`, `Succès`, `Paramètres`, `À propos` en mode FR sans couper les libellés, le header lecteur ne montre plus de badge de succès ni de sauvegarde auto, la zone de lecture utilise Literata sur une largeur confortable et un espacement inter-paragraphes dense, façon livre, sans chevauchement entre lignes ou dialogues, les scènes du livre 1 utilisent les packs narratifs `fr/ch1` à `fr/ch11b`, les dialogues courts comme `ch5.Ch5_Intro.p2` sont rendus en plusieurs vrais paragraphes DOM plutôt qu'en un seul gros `<p>`, et le rail gauche ainsi que le panneau droit ouvert restent visibles pendant un scroll long ;
6. mobile 390 x 844 : la navigation reste compacte, le récit garde un rythme dense et lisible en FR et EN sans chevauchement UI/texte, et les panneaux s'ouvrent en overlay au-dessus du récit avec fermeture par bouton, fond cliquable et touche `Escape`, sans repousser le contenu vers le bas ;
7. la lettrine du premier paragraphe alphabétique monte légèrement au-dessus de la ligne et ne semble pas tomber dans le paragraphe ;
8. le panneau Sauvegardes séparé clairement sauvegarde automatique, sauvegardes locales, point de contrôle et transfert ; il n'affiche pas `autosave`, `slotId`, `Ch12`, `route`, `prod`, `local-key` ou `pbkdf2` au joueur ;
9. le panneau Stats est vide au début, puis affiche les stats de base après `Ch2-Stats` avec compteur de points, valeur/max, boutons `+/-`, confirmation, effacement et aide courte sous les boutons ;
10. à `Ch2-Stats`, le max manuel est `3`, le bouton `+` se désactive quand une stat atteint le max ou quand il ne reste plus de points, et `-` ne retire que le brouillon non confirmé ;
11. confirmer une allocation décrémente `v_available_points`, sauvegarde, puis garde les points confirmés non retirables par le panneau ;
12. le choix narratif `special:stats` avance vers la scène cible puis ouvre le panneau, et le bouton Stats permet aussi d'investir plus tard ;
13. après le passage original qui affecte `v_max_stat = 4`, le panneau affiche le max `4` ;
14. les stats d'aura apparaissent après l'introduction de `B3-Ch04a`, tandis que `Magical Power` et `Magical Knowledge` restent invisibles ;
15. après un choix menant à un test de stat, le résultat apparaît avant le texte de scène, puis viennent le contenu et les prochains choix, avec succès/échec et niveau localisés ;
16. quand un choix débloque un succès nouveau pour le navigateur, une notice compacte `Succès obtenu` / `Achievement unlocked` apparaît avant le texte avec le titre et la caption du succès, puis ne se réaffiche pas après reload, import, changement de langue, nouvelle partie ou ouverture du panneau Succès ;
17. sur une scène de mort, le succès de mort reste visible dans le panneau Succès après `Load from last checkpoint` ou nouvelle partie, tandis que le checkpoint restaure quitte la scène de mort, sauvegarde l'autosave restaurée et ne conserve pas la branche échouée dans l'historique ;
18. le panneau Paramètres contient les libellés `Langue` et `Thème`, la bascule globale FR/EN, thème, taille du texte, contraste et toggle Illustrations ; en thème clair, le rail, les boutons de navigation, les panneaux, les champs, les notices et les états actifs restent lisibles sur desktop et mobile, puis gagnent encore en contraste avec `High contrast` actif ;
19. le toggle Illustrations masque/affiche l'image de moment après la scène correspondante sans changer la partie ;
20. une image de moment absente ou non chargeable ne bloque pas la lecture ;
21. le panneau À propos affiche l'attribution, les liens source/licence et les changements de l'adaptation ;
22. changer FR/EN ne reset pas la scène courante, ne modifie pas l'historique, et met bien `GameState.locale` sur la langue choisie ;
23. le bouton de correction d'un paragraphe ou choix ouvre un formulaire sans afficher `messageId`, `sceneId`, `chapterId`, `contentVersion`, `segmentIndex` ni hash technique au joueur ; sur un bloc multi-paragraphes, le formulaire montre et préremplit uniquement le paragraphe cliqué ;
24. le formulaire de contribution peut être envoyé sans pseudo ni email, affiche une erreur si l'API n'est pas configurée, et explique que l'email/pseudo sont facultatifs ;
25. si un email est renseigné, la case de notification reste explicite et le texte indique que la première confirmation est mémorisée dans ce navigateur pendant un an, puis que l'email est supprimé après refus ou publication ;
26. si un pseudo est renseigné, la case de crédit reste explicite et le texte indique que le pseudo peut être modéré ;
27. la mémorisation locale du pseudo/email ne se fait que si `Mémoriser pseudo et email sur cet appareil` est coché, et le bouton d'effacement vide le store `contributionProfile` ;
28. après envoi d'une contribution, le modal affiche seulement un succès joueur sans `publicId`, sans reçu à conserver, et avec un bouton `Fermer` ;
29. IndexedDB contient des objets `encrypted` pour `saves` et `achievementProgress`, sans variables, stats ou noms de succès en clair ;
30. créer, charger, renommer et supprimer une sauvegarde locale garde des libellés joueur lisibles, avec chapitre affiché comme `Livre 1 - Chapitre 12` plutôt qu'un ID technique ;
31. cliquer `Exporter une sauvegarde` ouvre seulement alors le champ de mot de passe ; sans mot de passe, le fichier n'est pas téléchargé ;
32. export avec phrase de passe produit un `.magium-save` dont le nom de fichier contient `magium`, le chapitre lisible et la date ;
33. cliquer `Importer une sauvegarde` ouvre seulement alors le champ de mot de passe et le choix de fichier ;
34. import avec la même phrase de passe restaure la progression si le `contentVersion` courant correspond ;
35. mauvais mot de passe, fichier incompatible, `contentVersion` différent, ou stat / `v_available_points` incohérent affichent une erreur claire dans le panneau et ne modifient pas la sauvegarde locale.
36. sous `pnpm dev`, le rail affiche un panneau `Debug` ;
37. le panneau Debug permet de sauter vers une scène d'un autre chapitre et applique les `setVariables` d'entrée de scène ;
38. un choix masqué par ses conditions peut être appliqué depuis Debug sans ajouter d'événement `history` ;
39. les boutons undo/redo Debug fonctionnent après un choix normal, un jump debug et une édition de stats ;
40. l'édition debug de `v_available_points`, `v_available_points_aux`, `v_max_stat`, d'une stat et de sa variable `_aux` est sauvegardée localement puis rechargeable via un slot nommé ;
41. après une modification debug, le panneau Sauvegardes bloque l'export `.magium-save` avec une erreur claire et laisse la save locale utilisable ;
42. après `pnpm build` puis `pnpm preview`, le bouton Debug n'apparaît pas.

## Exemple De Vérification IndexedDB

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
- pas de `currentSceneId`, stats, variables ou noms de succès en clair.

## Controle Dist

`pnpm dist:check` doit rejeter :

- `.magium` dans `dist` ;
- JSON canonique brut dans `dist` ;
- texte brut source évident dans des assets publics.

Ce check est volontairement conservateur. Si un faux positif apparaît, corriger le check avec prudence plutôt que le supprimer.

## Controle Image Docker

Le script Docker doit rejeter :

- `.magium` dans le filesystem runtime ;
- JSON canonique brut dans le filesystem runtime ;
- `node_modules` ;
- `.env*` ;
- extrait source brut évident comme `ID: Ch1-Intro1` ou `chapters/ch1.magium`.

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

Ces chemins sont ignorés par `.gitignore`.
