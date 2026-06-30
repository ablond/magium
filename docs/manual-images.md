# Images Manuelles Book 1

## Objectif

Le workflow images est volontairement manuel et simple :

- aucun RAG ;
- aucune API OpenAI ;
- aucune cle API ;
- aucune generation automatique en CI ;
- prompts Markdown publics et courts ;
- images finales stockees une seule fois sous `public/visuals/book1`.

Les portraits servent de references visuelles pour produire les illustrations de chapitre dans ChatGPT Images. En v1, seules les illustrations de chapitre sont affichees dans le lecteur.

## Structure

```text
public/visuals/book1/
  characters/<character-id>/
    portrait.md
    portrait.webp
  chapters/<chapter-id>/
    illustration.md
    illustration.webp
```

`portrait.webp` et `illustration.webp` peuvent manquer temporairement. Les prompts doivent exister et rester courts. Comme tout ce dossier est public et copie dans `dist/`, les Markdown ne doivent jamais contenir de longs extraits du texte original.

## Commandes

```bash
pnpm images:prompts -- --book 1
pnpm images:check -- --book 1
```

`images:prompts` lit les textes canoniques anglais du Book 1 et verifie les ancres manuelles definies dans `tools/images/book1-config.mjs`. Ces ancres couvrent aussi les descriptions avant revelation du nom, par exemple Kate et Eiden.

`images:check` verifie la structure, refuse les anciens marqueurs `evidenceRefs`, RAG, embeddings, `.magium`, chemins source bruts et copies longues du texte canonique. Il accepte l'absence des WebP pour permettre de travailler par etapes.

## Workflow Manuel ChatGPT

1. Lancer `pnpm images:prompts -- --book 1`.
2. Relire et corriger les `portrait.md` si necessaire.
3. Dans ChatGPT Images, coller le bloc `Prompt ChatGPT` du personnage.
4. Telecharger l'image, convertir en WebP si besoin, puis sauvegarder sous `public/visuals/book1/characters/<id>/portrait.webp`.
5. Ouvrir un `illustration.md` de chapitre.
6. Joindre dans ChatGPT les portraits listes dans `Character References To Attach`.
7. Coller le bloc `Prompt ChatGPT` du chapitre.
8. Sauvegarder l'image finale sous `public/visuals/book1/chapters/<chapter-id>/illustration.webp`.
9. Lancer :

```bash
pnpm images:check -- --book 1
pnpm content:all
pnpm check
pnpm test
pnpm build
```

## Regles De Prompt

- Reformuler les faits canoniques au lieu de copier des paragraphes.
- Garder les prompts lisibles et courts.
- Ne pas ajouter `evidenceRefs`, sourceRefs, chunks RAG, embeddings ou metadata API.
- Pour un personnage non humain, le prompt doit le dire explicitement.
- Les portraits doivent etre des references plein pied : full body, tete aux pieds, pieds visibles, pose 3/4 debout, pas de buste ou cadrage coupe.
- Le style cible est `grounded realistic fantasy adventure illustration` : fantasy realiste, lisible, sobrement cinematographique, pas grimdark par defaut.
- Quand un detail physique manque dans le canon mais qu'une reference stable est necessaire, l'ajout doit etre marque comme choix de design dans `tools/images/book1-config.mjs`.
- Pour une illustration de chapitre, utiliser les portraits existants comme references strictes.
- Si ChatGPT contredit un fait canonique, corriger le Markdown puis regenerer l'image manuellement.

## Methode De Construction Des Portraits

Tous les portraits Book 1 doivent suivre le meme niveau de construction que Barry et Daren. La methode appliquee est :

1. Repartir des textes canoniques anglais du Book 1, puis chercher les indices visuels, d'equipement et d'attitude lies au personnage.
2. Garder des ancres courtes et tracables dans `tools/images/book1-config.mjs`, sans copier de longs passages narratifs.
3. Separer les faits certains et les choix visuels :
   - `Canon:` pour ce que le texte confirme ;
   - `Design choice:` pour les details ajoutes afin d'obtenir une reference visuelle stable quand le canon reste vague.
4. Rediger un prompt final qui decrit le personnage des pieds a la tete, son equipement visible, son attitude et ce qu'il faut eviter.

Pour Barry, les ancres retenues sont notamment `ordinary guy`, `my stat device`, `stat booster`, `strapped my crossbow to the back of my backpack`, `my dagger` et `my stat booster's screen`. Elles justifient les faits canoniques suivants : Barry a vingt-huit ans, vient du Western Continent, reste un homme ordinaire, porte un stat booster/stat device avec ecran, utilise un sac a dos enchante, attache une arbalete au sac et garde une dague.

Les details que le texte ne fixe pas clairement, comme la coupe de cheveux, la barbe legere, la tenue exacte ou la finition du sac, sont marques comme `Design choice`. Ils doivent rester sobres, coherents avec le canon et utiles pour ChatGPT Images. Pour Barry, cela donne un voyageur moyen, pratique, prudent, pas un heros en armure, pas un noble, pas un sorcier sombre et pas un personnage moderne.

Daren applique la meme methode, mais avec beaucoup plus de details canoniques explicites. Les ancres utiles incluent `healer in armor`, `heavy armor`, `head is bald`, `skin is dark`, `mid forties`, `scar on his forehead`, `use a sword and a shield` et `white light appear all around him`. Elles imposent un homme a peau sombre, chauve, d'environ milieu de quarantaine, avec une cicatrice en X sur le front, en armure lourde, avec epee, bouclier et magie blanche lumineuse.

Pour Daren, les choix de design doivent seulement preciser la finition visuelle : armure lourde pratique et usee par le voyage, posture protectrice, lumiere blanche de soin/protection. Ne pas transformer Daren en jeune chevalier, en paladin angelique surcharge, en pretre en robe ou en sorcier sombre.

Les autres personnages Book 1 utilisent maintenant cette meme structure `Canon:` / `Design choice:` / `Avoid:`. Les corrections canoniques importantes a conserver sont :

- Azarius est le Sage de l'Ouest : vieil homme d'environ quatre-vingts ans, longue barbe blanche, baton, robes et chapeau de mage traditionnels. Ne pas lui donner les robes rouges ni le style feu de Felran.
- Illuna et Petal sont la meme personne : Petal est le surnom d'Illuna.
- Flower et Illuna/Petal partagent exactement le meme corps de fillette ; seules l'expression, l'attitude et la couleur des yeux changent.
- Arraka est representee dans le Book 1 par l'amulette, pas par un corps humain separe.
- Molan est le faon d'Elaria, pas un renard.
- Eleya et Leo doivent rester des animaux naturels fantasy, pas des humanoides.
- Eleya est la renarde canonique : utiliser `Eleya, the golden fox`, pas un second personnage renard.
- Taurus existe comme taureau lieutenant d'Eleya, mais il est portrait-only pour l'instant et ne doit pas etre ajoute automatiquement aux prompts d'illustrations de chapitre.

Quand un prompt semble pauvre ou faux, corriger d'abord `tools/images/book1-config.mjs`, relancer `pnpm images:prompts -- --book 1`, puis relire le Markdown public genere avant de regenerer l'image dans ChatGPT.

## Runtime

Le lecteur utilise une map statique dans `src/lib/visuals/book1.ts`. Si le setting `Illustrations` est actif et que l'image du chapitre existe, elle s'affiche entre les resultats de stat check et le texte de scene. Si le fichier WebP manque ou ne charge pas, l'image est masquee sans bloquer la lecture.
