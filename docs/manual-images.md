# Images Manuelles Book 1

## Objectif

Le workflow principal reste volontairement manuel et simple :

- aucun RAG ;
- aucune generation automatique en CI ;
- prompts Markdown publics et reformules ;
- portraits et illustrations finales stockes une seule fois sous `public/visuals/book1`.

Un chemin API OpenAI optionnel existe uniquement pour finir des illustrations manquantes. Il utilise `gpt-image-2`, des planches de references locales et `OPENAI_API_KEY` depuis l'environnement. Il ne remplace pas le workflow manuel et ne doit pas tourner en CI.

Les portraits servent de references visuelles. Les illustrations affichables ne sont plus liees a un chapitre entier : elles illustrent des moments precis du Book 1 et sont affichees apres la scene declencheuse, afin d'eviter les spoilers de debut de chapitre.

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

`portrait.webp` et `illustration.webp` peuvent manquer temporairement. Les prompts doivent exister et rester publics, courts cote citations, sans longs extraits du texte original.

Les anciens dossiers `public/visuals/book1/chapters/` ne sont plus valides. `pnpm images:check -- --book 1` les refuse pour eviter de revenir au modele spoiler "une image par chapitre".

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
```

`images:prompts` lit les textes canoniques anglais du Book 1, verifie les ancres manuelles des portraits et les `triggerSceneId` des moments, puis regenere les Markdown publics sous `public/visuals/book1`.

`images:stage` copie dans `output/visual/staging/book1/<moment-id>/` :

- `prompt.md` ;
- `README.md` ;
- `references/<character-id>.webp` pour chaque portrait a joindre dans ChatGPT.

`images:normalize` convertit les PNG/JPG de moments places dans `public/visuals/book1/moments/<moment-id>/` en `illustration.webp`, puis archive les originaux sous `output/visual/originals/book1/moments/`.

`images:refsheets` cree des planches de references non publiques sous `output/visual/api-inputs/book1/<moment-id>/`, jusqu'a quatre portraits par planche, sans texte incruste. Le manifeste associe chaque position a un personnage.

`images:generate:api` est le chemin avance OpenAI. Par defaut avec `--batch`, il prepare et soumet un batch `/v1/images/edits`; la commande affiche ensuite la commande de recuperation a relancer quand le batch est termine. `--quality high` correspond au choix qualitatif premium cote API, `--quality medium` reste disponible pour reduire le cout. `--sync` utilise l'endpoint direct multipart si un batch n'est pas souhaite.

`images:check` verifie la structure, refuse les anciens marqueurs `evidenceRefs`, RAG, embeddings, `.magium`, anciens chemins `chapters`, chemins source bruts et copies longues du texte canonique. Il accepte l'absence des `illustration.webp` pour permettre une production progressive.

Certains `triggerSceneId` peuvent avoir plusieurs variantes de moment quand une scene commune depend d'un choix majeur. Dans ce cas, chaque variante garde son propre dossier `moments/<moment-id>/`, son prompt et son WebP. Le runtime choisit la variante avec les variables de `GameState`, puis masque l'image si le WebP de cette variante manque encore.

## Workflow Manuel ChatGPT

1. Lancer `pnpm images:prompts -- --book 1`.
2. Relire et corriger les `portrait.md` ou `illustration.md` si necessaire.
3. Pour un portrait, coller le bloc `Prompt ChatGPT` du personnage dans ChatGPT Images, puis sauvegarder le resultat en `public/visuals/book1/characters/<id>/portrait.webp`.
4. Pour preparer tous les dossiers ChatGPT d'un coup, lancer `pnpm images:stage -- --book 1`. Pour limiter la preparation, utiliser `--moment <moment-id>` ou `--chapter <chapter-id>`.
5. Dans ChatGPT Images, joindre tous les fichiers `references/*.webp` du dossier stage.
6. Coller le bloc `Prompt ChatGPT` de `prompt.md`.
7. Sauvegarder l'image finale sous `public/visuals/book1/moments/<moment-id>/illustration.webp`.
8. Lancer :

```bash
pnpm images:check -- --book 1
pnpm content:all
pnpm check
pnpm test
pnpm build
```

## Workflow API Optionnel

Ce flux sert quand les limites de ChatGPT empechent de charger de nouvelles references, ou quand il reste beaucoup de moments a produire.

1. Exporter la cle dans le shell, jamais dans le repo :

```bash
export OPENAI_API_KEY=...
```

2. Preparer les planches des moments sans image :

```bash
pnpm images:refsheets -- --book 1 --missing
```

3. Soumettre un batch economique :

```bash
pnpm images:generate:api -- --book 1 --missing --batch --quality high --reference-mode sheets
```

4. Quand le batch est termine, relancer la commande `--retrieve` affichee par le script. Les WebP sont ecrits directement sous `public/visuals/book1/moments/<moment-id>/illustration.webp`.

Les fichiers `output/visual/api-inputs/` et `output/visual/api-runs/` sont locaux et ignores par Git. Le Batch API a un delai asynchrone et un cout separe du compte ChatGPT. References officielles : [Batch API](https://developers.openai.com/api/docs/guides/batch), [Image generation](https://developers.openai.com/api/docs/guides/image-generation), [Pricing](https://developers.openai.com/api/docs/pricing).

## Regles De Prompt

- Reformuler les faits canoniques au lieu de copier des paragraphes.
- Decrire precisement lieu, architecture, materiaux, lumiere, positions, action, personnages anonymes et continuite d'equipement.
- Pour tout moment dont la scene contient plusieurs branches conditionnelles, ajouter une note `Path compatibility` dans `tools/images/book1-config.mjs`.
- Une illustration de moment doit rester vraie pour tous les chemins qui atteignent son `triggerSceneId`. Si une branche montre Barry cache, une autre expose, ou une autre blesse, le prompt doit illustrer l'invariant commun plutot qu'un seul resultat.
- Si une scene commune ne peut pas etre illustree correctement pour tous les chemins, creer des variantes conditionnelles explicites plutot qu'une image fausse pour une branche.
- Verifier que le `triggerSceneId` montre deja le personnage, l'equipement ou l'evenement illustre. Ne pas attacher un portrait de reference ni annoncer visuellement une action qui n'apparait que dans une scene suivante.
- Si une scene declencheuse est trop tot dans la chronologie, deplacer le moment vers le bon `triggerSceneId` ou rendre l'image plus sobre et strictement compatible avec ce qui est deja visible.
- Ne pas ajouter `evidenceRefs`, sourceRefs, chunks RAG, embeddings ou metadata API.
- Pour un personnage non humain, le prompt doit le dire explicitement.
- Les portraits doivent etre des references plein pied : full body, tete aux pieds, pieds visibles, pose 3/4 debout, pas de buste ou cadrage coupe.
- Le style cible est `grounded realistic fantasy adventure illustration` : fantasy realiste, lisible, sobrement cinematographique, pas grimdark par defaut.
- Ne pas assombrir, brumer ou rendre hostile un environnement neutre si le canon ne le demande pas. La tension doit venir des personnages, de leurs postures et de leurs auras quand c'est le cas, pas d'un decor `dark fantasy` invente.
- Pour une illustration de moment, utiliser les portraits stages comme references strictes, mais respecter les overrides de scene.
- Quand un detail physique manque dans le canon mais qu'une reference stable est necessaire, l'ajout doit etre marque comme choix de design dans `tools/images/book1-config.mjs`.
- Si ChatGPT contredit un fait canonique, corriger la config, relancer `pnpm images:prompts -- --book 1`, puis regenerer l'image manuellement.

## Continuites Importantes

- Barry n'a pas d'arbalete avant `Ch6-Packing`. Les prompts avant ce moment doivent demander de retirer ou masquer l'arbalete meme si le portrait de reference la montre.
- A partir de `ch6-barry-packing-crossbow`, l'arbalete peut etre visible, sanglee au sac a dos.
- Le stat device de Barry doit etre explicite dans chaque prompt de moment ou Barry apparait : soit il est en main parce que le canon le dit, soit il reste dans sa poche/masque. Ne jamais laisser ChatGPT le placer en main par simple reutilisation du portrait.
- Le sac de Barry est ordinaire jusqu'a la sequence `Ch6-Packing`. Dans `ch6-barry-packing-crossbow`, le sac commence ordinaire puis Daren peut l'enchanter : un glow contenu est autorise uniquement comme effet du sort de Daren, pas comme propriete permanente du sac et pas comme ecran d'inventaire.
- Apres l'enchantement du chapitre 6, le sac reste exterieurement ordinaire sauf scene dediee. Ne montrer un glow, des coutures magiques ou un ecran d'inventaire que pour un moment qui le demande explicitement, par exemple `ch9-enchanted-backpack`.
- Dans la sequence de ville apres la nuit chez Rose, Barry part sans son sac a dos. Les moments `ch11a-beggars-district-trap` et `ch11b-*` ne doivent donc pas afficher son sac, son arbalete ou un inventaire de sac.
- `ch1-cutthroat-dave` doit montrer Daren affaibli pres de Dave, mais ne doit pas forcer Barry a etre cloue a l'arbre : ce detail depend du choix joueur.
- `ch3-barry-tree-lift` doit rester une scene autour du fallen tree et d'une tentative tactique, sans prouver que Barry a reussi a soulever l'arbre.
- `Ch11b-Ending` a deux variantes : `ch11b-golmyck-announcement` uniquement quand `v_ch11_saved_rose` vaut `1`, et `ch11b-golmyck-announcement-no-rose` quand Rose n'est pas sauvee. La variante no-Rose ne doit jamais attacher `rose.webp` ni montrer Rose vivante.
- Illuna et Petal sont la meme personne : Petal est le surnom d'Illuna.
- Flower et Illuna/Petal partagent exactement le meme corps de fillette ; seules l'expression, l'attitude et la couleur des yeux changent.
- Un moment ne doit jamais attacher `flower.webp` et `illuna.webp` ensemble. Choisir l'etat visible du corps partage pour la scene, puis le decrire clairement.
- `ch8-hydra-room` ne doit pas attacher Flower : elle est appelee a travers l'ouverture du toit, mais elle n'est pas visible dans la piece.
- `ch8-control-room` doit montrer Flower comme etat visible du corps partage, Eleya et Leo dans la salle ; ne pas attacher Illuna pour ce moment.
- `ch9-flower-illuna-origin` parle d'Illuna/Petal, mais ne l'affiche pas physiquement et ne doit pas attacher `illuna.webp`.
- Arraka est representee dans le Book 1 par l'amulette ou son aura, pas par un corps humain separe. Ne pas attacher `arraka.webp` a une illustration de moment.
- Molan est le faon d'Elaria, pas un renard.
- Eleya est la renarde canonique : utiliser `Eleya, the golden fox`, pas un second personnage renard.
- Eleya, Leo, Taurus, Elaria et Molan restent des animaux naturels fantasy, pas des humanoides.
- Tyrath reste un dragon, jamais un humain ou un dragonborn.

## Methode De Construction Des Portraits

Tous les portraits Book 1 suivent le niveau de construction applique a Barry et Daren :

1. Repartir des textes canoniques anglais du Book 1, puis chercher les indices visuels, d'equipement et d'attitude lies au personnage.
2. Garder des ancres courtes et tracables dans `tools/images/book1-config.mjs`, sans copier de longs passages narratifs.
3. Separer les faits certains et les choix visuels :
   - `Canon:` pour ce que le texte confirme ;
   - `Design choice:` pour les details ajoutes afin d'obtenir une reference visuelle stable quand le canon reste vague ;
   - `Avoid:` pour les erreurs frequentes a bloquer.
4. Rediger un prompt final qui decrit le personnage des pieds a la tete, son equipement visible, son attitude et ce qu'il faut eviter.

Pour Barry, les ancres retenues incluent `ordinary guy`, `my stat device`, `stat booster`, `strapped my crossbow to the back of my backpack`, `my dagger`, `my stat booster's screen`, `backpack starts to glow` et `since Daren enchanted it`. La config de moments corrige ensuite la chronologie : l'arbalete n'apparait pas avant `Ch6-Packing`, le sac n'est visiblement enchante que si la scene le demande, et le stat device reste cache sauf mention canonique contraire.

Pour Daren, les ancres incluent `healer in armor`, `heavy armor`, `head is bald`, `skin is dark`, `mid forties`, `scar on his forehead`, `use a sword and a shield` et `white light appear all around him`. Elles imposent un homme a peau sombre, chauve, d'environ milieu de quarantaine, avec une cicatrice en X sur le front, armure lourde, epee, bouclier et magie blanche lumineuse.

## Runtime

Le lecteur utilise une map statique dans `src/lib/visuals/book1.ts`. Cette map relie un `sceneId` canonique a un `moment-id`, ou a plusieurs variantes conditionnelles quand une scene finale depend d'une variable narrative importante.

Quand `settings.illustrations` est actif, `src/App.svelte` cherche une illustration pour `state.currentSceneId` et `state.variables`. Si `/visuals/book1/moments/<moment-id>/illustration.webp` existe, elle s'affiche apres le texte de la scene et avant les choix. Si le WebP manque ou echoue au chargement, l'image est masquee sans bloquer la lecture.

Ces images ne modifient pas `GameState`, `history`, `historyDigest`, le replay anti-tamper ou le chargement des packs narratifs.
