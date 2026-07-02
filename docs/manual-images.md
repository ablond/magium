# Images Manuelles Book 1

## Objectif

Le workflow principal reste volontairement manuel et simple :

- aucun RAG ;
- aucune génération automatique en CI ;
- prompts Markdown publics et reformulés ;
- portraits et illustrations finales stockés une seule fois sous `public/visuals/book1`.

Un chemin API OpenAI optionnel existe uniquement pour finir des illustrations manquantes. Il utilise `gpt-image-2`, des planches de références locales et `OPENAI_API_KEY` depuis l'environnement. Il ne remplace pas le workflow manuel et ne doit pas tourner en CI.

Les portraits servent de références visuelles. Les illustrations affichables ne sont plus liées à un chapitre entier : elles illustrent des moments précis du Book 1 et sont affichées après la scène déclencheuse, afin d'éviter les spoilers de début de chapitre.

## Structure

```text
public/visuals/book1/
  characters/<character-id>/
    portrait.md
    portrait.webp
  moments/<moment-id>/
    illustration.md
    illustration.webp
```

`portrait.webp` et `illustration.webp` peuvent manquer temporairement. Les prompts doivent exister et rester publics, courts côté citations, sans longs extraits du texte original.

Les anciens dossiers `public/visuals/book1/chapters/` ne sont plus valides. `pnpm images:check -- --book 1` les refuse pour éviter de revenir au modèle spoiler "une image par chapitre".

## Commandes

```bash
pnpm images:prompts -- --book 1
pnpm images:stage -- --book 1
pnpm images:stage -- --book 1 --moment ch10-pit-rescue
pnpm images:stage -- --book 1 --chapter ch10
pnpm images:stage -- --book 1 --all
pnpm images:normalize -- --book 1
pnpm images:refsheets -- --book 1 --missing
pnpm images:generate:api -- --book 1 --missing --batch --quality high --reference-mode sheets
pnpm images:check -- --book 1
pnpm images:test
```

`images:prompts` lit les textes canoniques anglais du Book 1, vérifie les ancres manuelles des portraits et les `triggerSceneId` des moments, puis régénère les Markdown publics sous `public/visuals/book1`.

`images:stage` copie dans `output/visual/staging/book1/<moment-id>/` :

- `prompt.md` ;
- `README.md` ;
- `references/<character-id>.webp` pour chaque portrait à joindre dans ChatGPT.

`images:normalize` convertit les PNG/JPG de moments placés dans `public/visuals/book1/moments/<moment-id>/` en `illustration.webp`, puis archive les originaux sous `output/visual/originals/book1/moments/`.

`images:refsheets` crée des planches de références non publiques sous `output/visual/api-inputs/book1/<moment-id>/`, jusqu'à quatre portraits par planche, sans texte incrusté. Le manifeste associe chaque position à un personnage. Cette commande nécessite `ffmpeg`.

`images:generate:api` est le chemin avancé OpenAI. Par défaut avec `--batch`, il prépare et soumet un batch `/v1/images/edits`; la commande affiche ensuite la commande de récupération à relancer quand le batch est terminé. `--quality high` correspond au choix qualitatif premium côté API, `--quality medium` reste disponible pour réduire le coût. `--sync` utilise l'endpoint direct multipart si un batch n'est pas souhaité.

`images:check` vérifie la structure, refuse les anciens marqueurs `evidenceRefs`, RAG, embeddings, `.magium`, anciens chemins `chapters`, chemins source bruts et copies longues du texte canonique. Il accepte l'absence des `illustration.webp` pour permettre une production progressive.

`images:test` exécute les tests du pipeline images Book 1, séparés de `pnpm test` pour ne pas imposer `ffmpeg` aux workflows non image. Il vérifie notamment les prompts, le staging ChatGPT, les planches de références API et le JSONL OpenAI Batch. Cette commande nécessite `ffmpeg`.

Certains `triggerSceneId` peuvent avoir plusieurs variantes de moment quand une scène commune dépend d'un choix majeur. Dans ce cas, chaque variante garde son propre dossier `moments/<moment-id>/`, son prompt et son WebP. Le runtime choisit la variante avec les variables de `GameState`, puis masque l'image si le WebP de cette variante manque encore.

## Workflow Manuel ChatGPT

1. Lancer `pnpm images:prompts -- --book 1`.
2. Relire et corriger les `portrait.md` ou `illustration.md` si nécessaire.
3. Pour un portrait, coller le bloc `Prompt ChatGPT` du personnage dans ChatGPT Images, puis sauvegarder le résultat en `public/visuals/book1/characters/<id>/portrait.webp`.
4. Pour préparer tous les dossiers ChatGPT d'un coup, lancer `pnpm images:stage -- --book 1`. Pour limiter la préparation, utiliser `--moment <moment-id>` ou `--chapter <chapter-id>`.
5. Dans ChatGPT Images, joindre tous les fichiers `references/*.webp` du dossier stage.
6. Coller le bloc `Prompt ChatGPT` de `prompt.md`.
7. Sauvegarder l'image finale sous `public/visuals/book1/moments/<moment-id>/illustration.webp`.
8. Lancer :

```bash
pnpm images:check -- --book 1
pnpm images:test
pnpm content:all
pnpm check
pnpm test
pnpm build
```

## Workflow API Optionnel

Ce flux sert quand les limites de ChatGPT empêchent de charger de nouvelles références, ou quand il reste beaucoup de moments à produire.

1. Exporter la clé dans le shell, jamais dans le repo :

```bash
export OPENAI_API_KEY=...
```

2. Préparer les planches des moments sans image :

```bash
pnpm images:refsheets -- --book 1 --missing
```

3. Soumettre un batch économique :

```bash
pnpm images:generate:api -- --book 1 --missing --batch --quality high --reference-mode sheets
```

4. Quand le batch est terminé, relancer la commande `--retrieve` affichée par le script. Les WebP sont écrits directement sous `public/visuals/book1/moments/<moment-id>/illustration.webp`.

Les fichiers `output/visual/api-inputs/` et `output/visual/api-runs/` sont locaux et ignorés par Git. Le Batch API a un délai asynchrone et un coût séparé du compte ChatGPT. Références officielles : [Batch API](https://developers.openai.com/api/docs/guides/batch), [Image generation](https://developers.openai.com/api/docs/guides/image-generation), [Pricing](https://developers.openai.com/api/docs/pricing).

## Règles De Prompt

- Reformuler les faits canoniques au lieu de copier des paragraphes.
- Décrire précisément lieu, architecture, matériaux, lumière, positions, action, personnages anonymes et continuité d'équipement.
- Pour tout moment dont la scène contient plusieurs branches conditionnelles, ajouter une note `Path compatibility` dans `tools/images/book1-config.mjs`.
- Une illustration de moment doit rester vraie pour tous les chemins qui atteignent son `triggerSceneId`. Si une branche montre Barry caché, une autre exposé, ou une autre blessé, le prompt doit illustrer l'invariant commun plutôt qu'un seul résultat.
- Si une scène commune ne peut pas être illustrée correctement pour tous les chemins, créer des variantes conditionnelles explicites plutôt qu'une image fausse pour une branche.
- Vérifier que le `triggerSceneId` montre déjà le personnage, l'équipement ou l'événement illustré. Ne pas attacher un portrait de référence ni annoncer visuellement une action qui n'apparaît que dans une scène suivante.
- Si une scène déclencheuse est trop tôt dans la chronologie, déplacer le moment vers le bon `triggerSceneId` ou rendre l'image plus sobre et strictement compatible avec ce qui est déjà visible.
- Ne pas ajouter `evidenceRefs`, sourceRefs, chunks RAG, embeddings ou metadata API.
- Pour un personnage non humain, le prompt doit le dire explicitement.
- Les portraits doivent être des références plein pied : full body, tête aux pieds, pieds visibles, pose 3/4 debout, pas de buste ou cadrage coupé.
- Le style cible est `grounded realistic fantasy adventure illustration` : fantasy réaliste, lisible, sobrement cinématographique, pas grimdark par défaut.
- Ne pas assombrir, brumer ou rendre hostile un environnement neutre si le canon ne le demande pas. La tension doit venir des personnages, de leurs postures et de leurs auras quand c'est le cas, pas d'un décor `dark fantasy` inventé.
- Pour une illustration de moment, utiliser les portraits stagés comme références strictes, mais respecter les overrides de scène.
- Quand un détail physique manque dans le canon mais qu'une référence stable est nécessaire, l'ajout doit être marqué comme choix de design dans `tools/images/book1-config.mjs`.
- Si ChatGPT contredit un fait canonique, corriger la config, relancer `pnpm images:prompts -- --book 1`, puis régénérer l'image manuellement.

## Continuités Importantes

- Barry n'a pas d'arbalète avant `Ch6-Packing`. Les prompts avant ce moment doivent demander de retirer ou masquer l'arbalète même si le portrait de référence la montre.
- À partir de `ch6-barry-packing-crossbow`, l'arbalète peut être visible, sanglée au sac à dos.
- Le stat device de Barry doit être explicite dans chaque prompt de moment où Barry apparaît : soit il est en main parce que le canon le dit, soit il reste dans sa poche/masqué. Ne jamais laisser ChatGPT le placer en main par simple réutilisation du portrait.
- Le sac de Barry est ordinaire jusqu'à la séquence `Ch6-Packing`. Dans `ch6-barry-packing-crossbow`, le sac commence ordinaire puis Daren peut l'enchanter : un glow contenu est autorisé uniquement comme effet du sort de Daren, pas comme propriété permanente du sac et pas comme écran d'inventaire.
- Après l'enchantement du chapitre 6, le sac reste extérieurement ordinaire sauf scène dédiée. Ne montrer un glow, des coutures magiques ou un écran d'inventaire que pour un moment qui le demande explicitement, par exemple `ch9-enchanted-backpack`.
- Dans la séquence de ville après la nuit chez Rose, Barry part sans son sac à dos. Les moments `ch11a-beggars-district-trap` et `ch11b-*` ne doivent donc pas afficher son sac, son arbalète ou un inventaire de sac.
- `ch1-cutthroat-dave` doit montrer Daren affaibli près de Dave, mais ne doit pas forcer Barry à être cloué à l'arbre : ce détail dépend du choix joueur.
- `ch3-barry-tree-lift` doit rester une scène autour du fallen tree et d'une tentative tactique, sans prouver que Barry a réussi à soulever l'arbre.
- `Ch11b-Ending` a deux variantes : `ch11b-golmyck-announcement` uniquement quand `v_ch11_saved_rose` vaut `1`, et `ch11b-golmyck-announcement-no-rose` quand Rose n'est pas sauvée. La variante no-Rose ne doit jamais attacher `rose.webp` ni montrer Rose vivante.
- Illuna et Petal sont la même personne : Petal est le surnom d'Illuna.
- Flower et Illuna/Petal partagent exactement le même corps de fillette ; seules l'expression, l'attitude et la couleur des yeux changent.
- Un moment ne doit jamais attacher `flower.webp` et `illuna.webp` ensemble. Choisir l'état visible du corps partagé pour la scène, puis le décrire clairement.
- `ch8-hydra-room` ne doit pas attacher Flower : elle est appelée à travers l'ouverture du toit, mais elle n'est pas visible dans la pièce.
- `ch8-control-room` doit montrer Flower comme état visible du corps partagé, Eleya et Leo dans la salle ; ne pas attacher Illuna pour ce moment.
- `ch9-flower-illuna-origin` parle d'Illuna/Petal, mais ne l'affiche pas physiquement et ne doit pas attacher `illuna.webp`.
- Arraka est représentée dans le Book 1 par l'amulette ou son aura, pas par un corps humain séparé. Ne pas attacher `arraka.webp` à une illustration de moment.
- Molan est le faon d'Elaria, pas un renard.
- Eleya est la renarde canonique : utiliser `Eleya, the golden fox`, pas un second personnage renard.
- Eleya, Leo, Taurus, Elaria et Molan restent des animaux naturels fantasy, pas des humanoïdes.
- Tyrath reste un dragon, jamais un humain ou un dragonborn.

## Méthode De Construction Des Portraits

Tous les portraits Book 1 suivent le niveau de construction appliqué à Barry et Daren :

1. Repartir des textes canoniques anglais du Book 1, puis chercher les indices visuels, d'équipement et d'attitude liés au personnage.
2. Garder des ancres courtes et traçables dans `tools/images/book1-config.mjs`, sans copier de longs passages narratifs.
3. Séparer les faits certains et les choix visuels :
   - `Canon:` pour ce que le texte confirme ;
   - `Design choice:` pour les détails ajoutés afin d'obtenir une référence visuelle stable quand le canon reste vague ;
   - `Avoid:` pour les erreurs fréquentes à bloquer.
4. Rédiger un prompt final qui décrit le personnage des pieds à la tête, son équipement visible, son attitude et ce qu'il faut éviter.

Pour Barry, les ancres retenues incluent `ordinary guy`, `my stat device`, `stat booster`, `strapped my crossbow to the back of my backpack`, `my dagger`, `my stat booster's screen`, `backpack starts to glow` et `since Daren enchanted it`. La config de moments corrige ensuite la chronologie : l'arbalète n'apparaît pas avant `Ch6-Packing`, le sac n'est visiblement enchanté que si la scène le demande, et le stat device reste caché sauf mention canonique contraire.

Pour Daren, les ancres incluent `healer in armor`, `heavy armor`, `head is bald`, `skin is dark`, `mid forties`, `scar on his forehead`, `use a sword and a shield` et `white light appear all around him`. Elles imposent un homme à peau sombre, chauve, d'environ milieu de quarantaine, avec une cicatrice en X sur le front, armure lourde, épée, bouclier et magie blanche lumineuse.

## Runtime

Le lecteur utilise une map statique dans `src/lib/visuals/book1.ts`. Cette map relie un `sceneId` canonique à un `moment-id`, ou à plusieurs variantes conditionnelles quand une scène finale dépend d'une variable narrative importante.

Quand `settings.illustrations` est actif, `src/App.svelte` cherche une illustration pour `state.currentSceneId` et `state.variables`. Si `/visuals/book1/moments/<moment-id>/illustration.webp` existe, elle s'affiche après le texte de la scène et avant les choix. Si le WebP manque ou échoue au chargement, l'image est masquée sans bloquer la lecture.

Ces images ne modifient pas `GameState`, `history`, `historyDigest`, le replay anti-tamper ou le chargement des packs narratifs.
