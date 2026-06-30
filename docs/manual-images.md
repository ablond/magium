# Images Manuelles Book 1

## Objectif

Le workflow images reste volontairement manuel et simple :

- aucun RAG ;
- aucune API OpenAI ;
- aucune cle API ;
- aucune generation automatique en CI ;
- prompts Markdown publics et reformules ;
- portraits et illustrations finales stockes une seule fois sous `public/visuals/book1`.

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
pnpm images:stage -- --book 1 --moment ch10-pit-rescue
pnpm images:stage -- --book 1 --chapter ch10
pnpm images:stage -- --book 1 --all
pnpm images:check -- --book 1
```

`images:prompts` lit les textes canoniques anglais du Book 1, verifie les ancres manuelles des portraits et les `triggerSceneId` des moments, puis regenere les Markdown publics sous `public/visuals/book1`.

`images:stage` copie dans `output/visual/staging/book1/<moment-id>/` :

- `prompt.md` ;
- `README.md` ;
- `references/<character-id>.webp` pour chaque portrait a joindre dans ChatGPT.

`images:check` verifie la structure, refuse les anciens marqueurs `evidenceRefs`, RAG, embeddings, `.magium`, anciens chemins `chapters`, chemins source bruts et copies longues du texte canonique. Il accepte l'absence des `illustration.webp` pour permettre une production progressive.

## Workflow Manuel ChatGPT

1. Lancer `pnpm images:prompts -- --book 1`.
2. Relire et corriger les `portrait.md` ou `illustration.md` si necessaire.
3. Pour un portrait, coller le bloc `Prompt ChatGPT` du personnage dans ChatGPT Images, puis sauvegarder le resultat en `public/visuals/book1/characters/<id>/portrait.webp`.
4. Pour une illustration, lancer par exemple `pnpm images:stage -- --book 1 --moment ch10-pit-rescue`.
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

## Regles De Prompt

- Reformuler les faits canoniques au lieu de copier des paragraphes.
- Decrire precisement lieu, architecture, materiaux, lumiere, positions, action, personnages anonymes et continuite d'equipement.
- Ne pas ajouter `evidenceRefs`, sourceRefs, chunks RAG, embeddings ou metadata API.
- Pour un personnage non humain, le prompt doit le dire explicitement.
- Les portraits doivent etre des references plein pied : full body, tete aux pieds, pieds visibles, pose 3/4 debout, pas de buste ou cadrage coupe.
- Le style cible est `grounded realistic fantasy adventure illustration` : fantasy realiste, lisible, sobrement cinematographique, pas grimdark par defaut.
- Pour une illustration de moment, utiliser les portraits stages comme references strictes, mais respecter les overrides de scene.
- Quand un detail physique manque dans le canon mais qu'une reference stable est necessaire, l'ajout doit etre marque comme choix de design dans `tools/images/book1-config.mjs`.
- Si ChatGPT contredit un fait canonique, corriger la config, relancer `pnpm images:prompts -- --book 1`, puis regenerer l'image manuellement.

## Continuites Importantes

- Barry n'a pas d'arbalete avant `Ch6-Packing`. Les prompts avant ce moment doivent demander de retirer ou masquer l'arbalete meme si le portrait de reference la montre.
- A partir de `ch6-barry-packing-crossbow`, l'arbalete peut etre visible, sanglee au sac a dos.
- Illuna et Petal sont la meme personne : Petal est le surnom d'Illuna.
- Flower et Illuna/Petal partagent exactement le meme corps de fillette ; seules l'expression, l'attitude et la couleur des yeux changent.
- Arraka est representee dans le Book 1 par l'amulette, pas par un corps humain separe.
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

Pour Barry, les ancres retenues incluent `ordinary guy`, `my stat device`, `stat booster`, `strapped my crossbow to the back of my backpack`, `my dagger` et `my stat booster's screen`. La config de moments corrige ensuite la chronologie : l'arbalete n'apparait pas avant `Ch6-Packing`.

Pour Daren, les ancres incluent `healer in armor`, `heavy armor`, `head is bald`, `skin is dark`, `mid forties`, `scar on his forehead`, `use a sword and a shield` et `white light appear all around him`. Elles imposent un homme a peau sombre, chauve, d'environ milieu de quarantaine, avec une cicatrice en X sur le front, armure lourde, epee, bouclier et magie blanche lumineuse.

## Runtime

Le lecteur utilise une map statique dans `src/lib/visuals/book1.ts`. Cette map relie un `sceneId` canonique a un `moment-id`.

Quand `settings.illustrations` est actif, `src/App.svelte` cherche une illustration pour `state.currentSceneId`. Si `/visuals/book1/moments/<moment-id>/illustration.webp` existe, elle s'affiche apres le texte de la scene et avant les choix. Si le WebP manque ou echoue au chargement, l'image est masquee sans bloquer la lecture.

Ces images ne modifient pas `GameState`, `history`, `historyDigest`, le replay anti-tamper ou le chargement des packs narratifs.
