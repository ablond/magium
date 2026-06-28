# Traduction Française

## Registre Et Ton

La narration française conserve la première personne de Barry : directe, introspective, parfois ironique, avec un registre accessible plutôt que solennel. Le texte doit rester fluide et littéraire sans effacer le côté oral du narrateur.

Principes retenus :

- préserver les phrases longues quand elles portent l'élan ou la panique ;
- garder les répétitions utiles, notamment dans les moments de tension ;
- traduire les répliques dans un français naturel, avec des contractions de ton quand le personnage est familier ou agressif ;
- conserver les noms propres anglais : Barry, Daren, Cutthroat Dave, Olmnar, Varathia, Magium, Eastern Continent, Northern Continent, Western Continent.

## Figures De Style Caractéristiques

- Opposition courage/stupidité : rendue par une formulation proche, `la frontière entre le courage et la stupidité`.
- Accumulations introspectives : conservées avec des segments coordonnés plutôt que fortement résumés.
- Hyperboles de tournoi et de magie : maintenues sans les neutraliser.
- Répétitions de tension : `C’était juste. C’était vraiment juste.` conserve la redite de `That was close`.
- Humour de décalage : Barry reste lucide et légèrement auto-dérisoire, surtout face au sérieux héroïque de Daren.

## Glossaire

| Original | Français | Note |
| --- | --- | --- |
| stillwater | sans-aura | Choix stabilisé à partir de `ch2`. Le terme reste techniquement imparfait, car les `stillwaters` ont une aura indiscernable de celle d'un humain ordinaire plutôt qu'une absence totale d'aura, mais il est court, lisible, déjà établi dans `ch1`, et fonctionne comme nom de caste. |
| mage | mage | Terme fantasy standard. |
| shield spell | sort de bouclier | Terme transparent, à réutiliser. |
| white magic | magie blanche | Terme fantasy standard. |
| throwing knives / daggers | couteaux de lancer / dagues | Choix selon le contexte de la phrase source. |
| checkpoint | point de contrôle | Terme UI et récit cohérent. |
| stat device / stat booster | appareil de stats | Forme stabilisée dans `ch3` pour éviter `amplificateur` ou `dispositif`, trop techniques et moins cohérents avec `ch1`/`ch2`. |
| abilities | Stats | Libellé UI FR retenu pour le panneau des stats. Les identifiants techniques `abilities.*` restent en anglais. |
| common language | langue commune | Langue des humains, à distinguer des langues anciennes. |
| golden fox | renard doré / grande renarde | `renard doré` quand Barry/Daren en parlent comme figure encore vague ; `grande renarde` dans la bouche d'Elaria quand elle parle de sa protectrice. |
| Northern Continent / Western Continent | Northern Continent / Western Continent | Noms propres conservés en anglais, comme `Eastern Continent`. |
| Strength | Force | Stat. |
| Toughness | Résistance | Stat. |
| Speed | Vitesse | Stat. |
| Reflexes | Réflexes | Stat. |
| Hearing | Ouïe | Stat. |
| Observation | Observation | Stat. |
| Ancient languages | Langues anciennes | Stat. |
| Combat technique | Technique de combat | Stat. |
| Premonition | Prémonition | Stat. |
| Bluff | Bluff | Stat, terme intégré en français. |
| Magical sense | Sens magique | Stat. |
| Aura hardening | Renforcement d’aura | Stat. |
| Magical power | Puissance magique | Stat. |
| Magical knowledge | Connaissances magiques | Stat. |

## Unités Et Distances

Les distances impériales sont traduites dans un système métrique naturel, avec un arrondi idiomatique plutôt qu'une conversion mécanique. L'objectif est que le texte sonne français sans donner une précision artificielle.

- `100 feet` vaut environ `30 mètres`, mais la formulation dépend du contexte.
- `a few hundred feet` devient `à une centaine de mètres`, pas `quelques centaines de pieds`.
- `a few feet` devient souvent `à quelques pas`, ou `à deux ou trois mètres` si la mesure importe.
- `fifty foot giants` devient `des géants de quinze mètres`.
- `five foot seven` devient `un mètre soixante-dix`.
- `five mile radius` devient `un rayon d'environ huit kilomètres`.

## Tutoiement / Vouvoiement

| Relation | Choix | Justification |
| --- | --- | --- |
| Barry -> Cutthroat Dave | Tu | Menace directe, combat, aucun respect social. |
| Cutthroat Dave -> Barry/Daren | Tu | Agressivité et mépris. |
| Barry -> Daren | Tu | Relation de compagnonnage rapide après le sauvetage. |
| Daren -> Barry | Tu | Ton protecteur puis familier. |
| Voix féminine inconnue -> Daren | Vous | Politesse initiale envers une figure légendaire. |

## Adaptations Notables

- `stillwater` est rendu par `sans-aura` : le terme est volontairement conservé malgré son imperfection technique pour préserver la continuité avec `ch1` et garder un nom de caste immédiatement lisible.
- `codswallop` devient `baratin` : effet oral et méprisant conservé sans anglicisme.
- `out of your hair` devient `te débarrasser le plancher` : expression idiomatique française naturelle dans la bouche de Cutthroat Dave.
- `A clean mouth and an honest hand...` devient `Bouche propre et main honnête...` : tournure proverbiale conservée, sans chercher un proverbe français préexistant inexact.
- `a few hundred feet from my location` devient `à une centaine de mètres de ma position` : conversion métrique arrondie, naturelle en français.

## Méthode De Traduction Ch3

Le chapitre 3 a été traduit avec Codex en mode GPT-5.5, effort moyen, sans fast mode. La source anglaise canonique `content/canonical/v1/locales/en/ch3.json` a été découpée en 18 lots de traduction d'environ 12 000 caractères maximum, puis chaque lot a été demandé comme JSON strict avec les mêmes `messageId`.

Chaque lot a été validé avant fusion :

- JSON parseable ;
- `locale: "fr"` et `chapterId: "ch3"` ;
- aucune clé manquante ou supplémentaire par rapport au lot anglais ;
- noms propres et glossaire projet préservés.

Une passe de QA éditoriale fait partie intégrante de la traduction `ch3` et doit être faite avant de considérer le chapitre terminé. Elle couvre :

- scan mécanique des guillemets, incises de dialogue, guillemets déséquilibrés, restes anglais, unités impériales, termes interdits ou instables (`stillwater`, `amplificateur de stats`, `maximiser`) ;
- comparaison stricte des clés entre `content/canonical/v1/locales/en/ch3.json` et `content/story-locales/fr/ch3.json` ;
- relecture ciblée du début de chapitre, de la scène de choix des stats, des scènes Elaria/Molan/renard doré, de la scène Kate/Daren nocturne, du combat contre les arbalétriers et des retours de branche ;
- corrections de ton pour garder Barry direct, oral et légèrement ironique sans rendre la narration trop soutenue ;
- normalisation des noms propres de continents et des termes récurrents stabilisés dans le glossaire.

Le fichier final éditable est `content/story-locales/fr/ch3.json`. Les sorties générées sous `content/canonical/v1/locales/fr/ch3.json` et `src/generated/packs/locales__fr__ch3.ts` viennent uniquement de `pnpm content:all`.

## Points Ouverts

- Les noms propres de continents (`Eastern Continent`, `Northern Continent`, `Western Continent`) sont conservés en anglais conformément aux règles du projet, même quand la source varie entre majuscule et minuscule.
- Les titres d'achievements futurs devront arbitrer au cas par cas entre fidélité littérale et effet humoristique équivalent.
