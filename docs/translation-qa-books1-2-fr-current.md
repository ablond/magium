# Relecture EN-FR Des Livres 1 Et 2

Date: 2026-07-05

Portée: sources françaises éditables actuelles sous `content/story-locales/fr/`,
livre 1 (`ch1` à `ch11b`) puis livre 2 (`b2ch1` à `b2ch11c`).

Statut: corrections appliquées aux JSON source FR le 2026-07-05, puis
propagées aux fichiers générés via le pipeline. Les fichiers générés
`content/canonical/v1/**` et `src/generated/**` n'ont pas été modifiés à la main.

## Méthode

- Relecture dans l'ordre demandé: livre 1, puis livre 2.
- Comparaison des messages anglais `content/canonical/v1/locales/en/<chapter>.json`
  avec les traductions sources `content/story-locales/fr/<chapter>.json`.
- Vérification ciblée des familles déjà stabilisées dans `docs/translation-fr.md`:
  faux amis, calques, incises de dialogue, ponctuation française, terminologie.
- Les occurrences répétées dans des branches parallèles sont groupées: le même
  passage peut apparaître dans plusieurs `messageId` avec le même correctif.

## Synthèse

Le livre 1 ne présente pas de nouveau contresens lourd dans les familles
contrôlées. Les corrections retenues concernent un calque stylistique répété
deux fois et six incises de dialogue calquées sur l'anglais.

Le livre 2 demandait une passe d'application avant livraison: les problèmes
majoritaires étaient syntaxiques et typographiques, mais ils nuisaient fortement
à la naturalité de la lecture. Les trois familles prioritaires corrigées sont:

- 167 messages avec incise fautive ou artificielle du type `demandé-je`,
  `lui demandé-je`, `crié-je`, `lancé-je`, `commencé-je`, `murmuré-je`;
- 196 messages avec ponctuation de dialogue anglaise avant guillemet fermant;
- 18 messages avec un verbe de parole placé après la réplique selon l'ordre
  anglais (`"...?" je demande`, `"...!" je dis`, etc.).

La passe d'application a aussi corrigé les variantes équivalentes détectées
après élargissement du scan, par exemple `je lui réponds`, `je lui lance`,
`me dit`, `nous interrompt`, `m'écrit` ou `fait` après guillemet.

## Livre 1

### L1-001 - `socialize with the group`

Messages concernés: `ch9.Ch9_Acting.p1`, `ch9.Ch9_Developed.p1`

Catégorie: maladresse stylistique et terminologique.

Original EN:

> "Oh, she said that she wanted to socialize with the group, so I handed her to Hadrik for a while..."

Traduction existante:

> « Oh, elle a dit qu'elle voulait socialiser avec le groupe, alors je l'ai confiée à Hadrik pour un moment... »

Correction appliquée:

> « Oh, elle a dit qu'elle voulait se mêler un peu au groupe, alors je l'ai confiée à Hadrik pour un moment... »

Justification:

`Socialiser avec le groupe` reste compréhensible, mais sonne sociologique et
calque l'anglais. `Se mêler un peu au groupe` garde le sens concret et oral de
la réplique de Flower.

### L1-002 - Incise interrompue dans `ch8.Ch8_Intro2.p1`

Message concerné: `ch8.Ch8_Intro2.p1`

Catégorie: erreur syntaxique / calque de dialogue.

Original EN:

> "Wait, are those--" I start to ask her, but she interrupts me.

Traduction existante:

> « Attends, ce sont-- » je commence à lui demander, mais elle me coupe.

Correction appliquée:

> Je commence à lui demander : « Attends, ce sont-- », mais elle me coupe.

Justification:

`» je commence...` reproduit l'ordre anglais de l'incise. La reformulation
place l'action avant la réplique interrompue et garde le rythme de la scène.

### L1-003 - Verbe de parole après réplique

Messages concernés: `ch6.Ch6_Stats.p1`, `ch6.Ch6_Stats.p2`,
`ch6.Ch6_Stats_spent.p1`, `ch6.Ch6_Stats_spent.p2`, `ch7.Ch7_Promised.p1`

Catégorie: erreur syntaxique / calque de dialogue.

Original EN:

> "I suppose..." I answer her.

Traduction existante:

> « Je suppose... » je lui réponds.

Correction appliquée:

> « Je suppose... » lui dis-je.

Justification:

`» je lui réponds` place le verbe de parole dans l'ordre anglais. L'incise
française `lui dis-je` est plus naturelle et évite une rupture syntaxique.

## Livre 2

### L2-001 - `realistically speaking`

Message concerné: `b2ch7.B2_Ch07a_Related.p1`

Catégorie: faux ami / maladresse stylistique.

Original EN:

> "I'm all for pinning the blame on some vague non-corporeal entity that I've never met before, but realistically speaking, Barry is probably right."

Traduction existante:

> « Je suis toujours partant pour rejeter la faute sur une vague entité incorporelle que je n'ai jamais rencontrée, mais réalistement, Barry a probablement raison. »

Correction appliquée:

> « Je suis toujours partant pour rejeter la faute sur une vague entité incorporelle que je n'ai jamais rencontrée, mais si on est réalistes, Barry a probablement raison. »

Justification:

`Réalistement` est rare et sent le calque de `realistically`. La reformulation
`si on est réalistes` est idiomatique, orale, et colle mieux à Daren.

### L2-002 - Incise `demandé-je`

Messages concernés: voir annexe `B2-Incises`.

Catégorie: erreur grammaticale et syntaxique.

Original EN:

> "In what way?" I ask.

Traduction existante:

> « Comment ça ? » demandé-je.

Correction appliquée:

> Je demande : « Comment ça ? »

Justification:

`Demandé-je` est une inversion artificielle dans ce registre, et la forme
renforce le calque anglais. En narration au présent, l'ordre naturel est
`Je demande : « ... »`, ou une incise simple si elle reste fluide.

### L2-003 - Incise `lui demandé-je`

Messages concernés: voir annexe `B2-Incises`.

Catégorie: erreur grammaticale et syntaxique.

Original EN:

> "Is there something special about this wall?" I ask her.

Traduction existante:

> « Il a quelque chose de spécial, ce mur ? » lui demandé-je.

Correction appliquée:

> Je lui demande : « Il a quelque chose de spécial, ce mur ? »

Justification:

Le complément indirect devant l'inversion (`lui demandé-je`) est raide et non
naturel. La phrase française gagne en clarté si l'incise passe avant la réplique.

### L2-004 - Incise `crié-je`

Messages concernés: voir annexe `B2-Incises`.

Catégorie: erreur grammaticale et syntaxique.

Original EN:

> "Hey, Kate!" I shout loudly, to make sure that she hears me.

Traduction existante:

> « Hé, Kate ! » crié-je assez fort pour être sûr qu'elle m'entende.

Correction appliquée:

> Je crie assez fort pour être sûr qu'elle m'entende : « Hé, Kate ! »

Justification:

`Crié-je` est une inversion très littéraire et sonne faux dans la voix directe
de Barry. Placer l'action avant la réplique garde le rythme et la spontanéité.

### L2-005 - Incise `lancé-je`

Messages concernés: voir annexe `B2-Incises`.

Catégorie: erreur grammaticale et syntaxique.

Original EN:

> "What's the matter?" I say, but I fall silent...

Traduction existante:

> « Qu'est-ce qu'il y a ? » lancé-je, mais je me tais aussitôt...

Correction appliquée:

> Je lance en ouvrant la porte : « Qu'est-ce qu'il y a ? » Mais je me tais aussitôt...

Justification:

`Lancé-je` plaque une incise anglaise sur un verbe français qui fonctionne mieux
en phrase narrative. La correction garde le geste brusque sans forme artificielle.

### L2-006 - Incise `commencé-je`

Messages concernés: voir annexe `B2-Incises`.

Catégorie: erreur grammaticale et syntaxique.

Original EN:

> "Is there something you--" I start to say, but the girl interrupts me.

Traduction existante:

> « Est-ce qu'il y a quelque chose que tu... » commencé-je, mais la fille m'interrompt.

Correction appliquée:

> Je commence à demander : « Est-ce qu'il y a quelque chose que tu... », mais la fille m'interrompt.

Justification:

`Commencé-je` est une inversion maladroite. Le français naturel préfère déplacer
le verbe avant la réplique, surtout quand la parole est interrompue.

### L2-007 - Incise `murmuré-je`

Messages concernés: voir annexe `B2-Incises`.

Catégorie: erreur grammaticale et syntaxique.

Original EN:

> "Relax," I whisper to Daren.

Traduction existante:

> « Détends-toi, murmuré-je à Daren. Mon marché avec Eiden est déjà annulé... »

Correction appliquée:

> Je murmure à Daren : « Détends-toi. Mon marché avec Eiden est déjà annulé... »

Justification:

L'incise inverse `murmuré-je` ralentit la phrase et attire l'attention sur la
forme. La correction préserve le ton bas de Barry sans effet littéraire parasite.

### L2-008 - Verbe de parole après réplique

Messages concernés: voir annexe `B2-PostQuote`.

Catégorie: erreur syntaxique / calque de dialogue.

Original EN:

> "What's going on here?" I ask Leila.

Traduction existante:

> « Qu'est-ce qui se passe, ici ? » je demande à Leila.

Correction appliquée:

> Je demande à Leila : « Qu'est-ce qui se passe, ici ? »

Justification:

L'ordre `» je demande` est un calque direct de l'anglais. En français narratif
au présent, l'incise doit être reformulée ou placée avant la réplique.

### L2-009 - `je dis` après réplique

Messages concernés: voir annexe `B2-PostQuote`.

Catégorie: erreur syntaxique / maladresse stylistique.

Original EN:

> "Leila, could you take care of those two cobras?" I say.

Traduction existante:

> « Leila, est-ce que tu peux t'occuper de ces deux cobras ? » je dis.

Correction appliquée:

> Je dis : « Leila, est-ce que tu peux t'occuper de ces deux cobras ? Pendant ce temps, je vais m'occuper des piétineurs. »

Justification:

`Je dis` après guillemet est une structure anglaise. La phrase française devient
plus fluide si l'annonce de parole précède la réplique complète.

### L2-010 - Virgule anglaise avant guillemet fermant

Messages concernés: voir annexe `B2-Ponctuation`.

Catégorie: erreur typographique et syntaxique.

Original EN:

> "Rose," Daren says.

Traduction existante:

> « Rose, » dit Daren.

Correction appliquée:

> « Rose », dit Daren.

Justification:

En typographie française, la virgule de l'incise ne reste pas à l'intérieur du
guillemet fermant comme en anglais. Ce motif revient dans tout le livre 2.

### L2-011 - Virgule anglaise avec `je dis`

Messages concernés: voir annexe `B2-Ponctuation`.

Catégorie: erreur typographique et syntaxique.

Original EN:

> "Okay, I have a plan," I say. "But we'll need to work together."

Traduction existante:

> « D'accord, j'ai un plan, » je dis. « Mais il va falloir travailler ensemble. »

Correction appliquée:

> Je dis : « D'accord, j'ai un plan. Mais il va falloir travailler ensemble. »

Justification:

La virgule avant `»` et `je dis` après la réplique combinent deux calques de
ponctuation/dialogue. Une seule phrase introductive corrige la typographie et
rend la réplique plus naturelle.

## Vérification Après Application

- `pnpm content:all`: OK.
- `pnpm check`: OK.
- `pnpm test`: OK.
- `pnpm build`: OK.
- `git diff --check`: OK.
- Scan ciblé final: 0 occurrence restante pour `socialiser avec le groupe`,
  `réalistement`, les incises fautives `demandé-je` / `crié-je` / `lancé-je` /
  `commencé-je` / `murmuré-je`, les incises `» je ...`, les virgules avant
  guillemet fermant `, »`, et les guillemets fermants sans espace avant virgule.

## Annexes D'Occurrences

### L1-Socialiser

- `ch9`: `ch9.Ch9_Acting.p1`, `ch9.Ch9_Developed.p1`

### L1-Incises

- `ch6`: `ch6.Ch6_Stats.p1`, `ch6.Ch6_Stats.p2`,
  `ch6.Ch6_Stats_spent.p1`, `ch6.Ch6_Stats_spent.p2`
- `ch7`: `ch7.Ch7_Promised.p1`
- `ch8`: `ch8.Ch8_Intro2.p1`

### B2-Réalistement

- `b2ch7`: `b2ch7.B2_Ch07a_Related.p1`

### B2-Incises

Occurrences détectées: 167 messages.

- `b2ch1`: `b2ch1.B2_Ch01a_Discussing.p1`, `b2ch1.B2_Ch01a_Married.p1`, `b2ch1.B2_Ch01a_Bricks.p1`, `b2ch1.B2_Ch01a_Asking.p1`, `b2ch1.B2_Ch01a_Value.p1`, `b2ch1.B2_Ch01a_Innocent.p1`, `b2ch1.B2_Ch01a_Innocent.p3`
- `b2ch2`: `b2ch2.B2_Ch02a_Intro.p1`, `b2ch2.B2_Ch02a_Intro2.p1`, `b2ch2.B2_Ch02a_Intro2.p2`, `b2ch2.B2_Ch02a_Intro2.p3`, `b2ch2.B2_Ch02a_Tell_servant.p1`, `b2ch2.B2_Ch02a_Tell_servant.p2`, `b2ch2.B2_Ch02a_Tell_servant.p3`, `b2ch2.B2_Ch02a_Gems.p1`, `b2ch2.B2_Ch02a_Cell.p1`, `b2ch2.B2_Ch02a_Bulky.p4`, `b2ch2.B2_Ch02a_Fist.p1`, `b2ch2.B2_Ch02a_Fist.p3`, `b2ch2.B2_Ch02a_Recreation.p3`, `b2ch2.B2_Ch02a_Recreation.p4`, `b2ch2.B2_Ch02a_Princess.p1`, `b2ch2.B2_Ch02a_Private.p2`, `b2ch2.B2_Ch02a_Outcasts.p1`, `b2ch2.B2_Ch02a_Nineteen.p1`, `b2ch2.B2_Ch02a_Nineteen.p2`, `b2ch2.B2_Ch02a_Backup.p1`, `b2ch2.B2_Ch02a_Better.p1`, `b2ch2.B2_Ch02a_Deal.p1`, `b2ch2.B2_Ch02a_Soundproof.p1`, `b2ch2.B2_Ch02a_Refuse_threat.p1`, `b2ch2.B2_Ch02a_Knocks.p1`, `b2ch2.B2_Ch02a_Answer.p1`, `b2ch2.B2_Ch02a_Passage.p1`, `b2ch2.B2_Ch02a_Dragging.p1`, `b2ch2.B2_Ch02a_Natural.p1`, `b2ch2.B2_Ch02a_Natural.p2`, `b2ch2.B2_Ch02a_Hiding.p1`, `b2ch2.B2_Ch02a_Tunnels.p2`, `b2ch2.B2_Ch02a_Acrobatic.p1`, `b2ch2.B2_Ch02a_Trolls.p1`, `b2ch2.B2_Ch02a_Ending.p1`
- `b2ch3`: `b2ch3.B2_Ch03a_Intro2.p1`, `b2ch3.B2_Ch03a_Bodies.p1`, `b2ch3.B2_Ch03a_Eyesight.p1`, `b2ch3.B2_Ch03a_Eyesight.p2`, `b2ch3.B2_Ch03a_Eyesight.p3`, `b2ch3.B2_Ch03a_Adapt.p1`, `b2ch3.B2_Ch03a_Earlier.p1`, `b2ch3.B2_Ch03a_Blamed.p1`, `b2ch3.B2_Ch03a_Originate.p1`, `b2ch3.B2_Ch03a_Supposed.p1`, `b2ch3.B2_Ch03a_Friend.p1`, `b2ch3.B2_Ch03a_Again.p1`, `b2ch3.B2_Ch03a_Postpone.p1`, `b2ch3.B2_Ch03a_Stars.p1`
- `b2ch4a`: `b2ch4a.B2_Ch04a_Meeting.p1`, `b2ch4a.B2_Ch04a_Technically.p1`, `b2ch4a.B2_Ch04a_Fat.p1`, `b2ch4a.B2_Ch04a_Means.p1`, `b2ch4a.B2_Ch04a_Worried.p1`, `b2ch4a.B2_Ch04a_Change.p1`, `b2ch4a.B2_Ch04a_Matter.p1`, `b2ch4a.B2_Ch04a_Cards.p1`, `b2ch4a.B2_Ch04a_Reunion.p1`, `b2ch4a.B2_Ch04a_Reunion.p2`, `b2ch4a.B2_Ch04a_Himself.p3`, `b2ch4a.B2_Ch04a_Lullaby.p1`, `b2ch4a.B2_Ch04a_Silence.p1`, `b2ch4a.B2_Ch04a_Silence.p3`
- `b2ch4b`: `b2ch4b.B2_Ch04b_Wilhelm_lessathi.p3`, `b2ch4b.B2_Ch04b_Wilhelm_charge.p5`, `b2ch4b.B2_Ch04b_Wilhelm_team.p3`, `b2ch4b.B2_Ch04b_Wilhelm_team.p4`, `b2ch4b.B2_Ch04b_Insane.p1`, `b2ch4b.B2_Ch04b_Promised.p1`
- `b2ch5a`: `b2ch5a.B2_Ch05a_Flammable.p1`, `b2ch5a.B2_Ch05a_Heard.p2`
- `b2ch5b`: `b2ch5b.B2_Ch05b_Lose.p1`, `b2ch5b.B2_Ch05b_Cargo.p1`, `b2ch5b.B2_Ch05b_Cargo.p2`, `b2ch5b.B2_Ch05b_Death.p2`, `b2ch5b.B2_Ch05b_Gunner.p2`
- `b2ch6`: `b2ch6.B2_Ch06a_Intro2.p1`, `b2ch6.B2_Ch06a_Payback.p1`, `b2ch6.B2_Ch06a_Mixture.p1`, `b2ch6.B2_Ch06a_Talkative.p1`, `b2ch6.B2_Ch06a_Message.p1`
- `b2ch7`: `b2ch7.B2_Ch07a_No_Help.p5`, `b2ch7.B2_Ch07a_Map.p3`, `b2ch7.B2_Ch07a_Papers.p3`, `b2ch7.B2_Ch07a_Premonition.p3`, `b2ch7.B2_Ch07a_Handle.p1`, `b2ch7.B2_Ch07a_Climb.p1`, `b2ch7.B2_Ch07a_Tailored.p1`, `b2ch7.B2_Ch07a_Tailored.p2`, `b2ch7.B2_Ch07a_Tailored.p3`, `b2ch7.B2_Ch07a_Tailored.p4`
- `b2ch8`: `b2ch8.B2_Ch08a_Retreat.p1`, `b2ch8.B2_Ch08a_Retreat.p2`, `b2ch8.B2_Ch08a_Inspiring.p1`, `b2ch8.B2_Ch08a_Funny.p1`, `b2ch8.B2_Ch08a_Image.p3`, `b2ch8.B2_Ch08a_Civilized.p1`, `b2ch8.B2_Ch08a_Terrified.p1`, `b2ch8.B2_Ch08a_Unnoticed.p1`, `b2ch8.B2_Ch08a_Energizer2.p1`, `b2ch8.B2_Ch08a_Energizer3.p1`
- `b2ch9a`: `b2ch9a.B2_Ch09a_Dog.p4`, `b2ch9a.B2_Ch09a_Dog.p5`, `b2ch9a.B2_Ch09a_Dismantling.p1`, `b2ch9a.B2_Ch09a_Kick.p1`, `b2ch9a.B2_Ch09a_Energizer_path.p2`, `b2ch9a.B2_Ch09a_Energizer_path.p3`, `b2ch9a.B2_Ch09a_Energizer_path3.p1`, `b2ch9a.B2_Ch09a_Furiously.p1`, `b2ch9a.B2_Ch09a_Biscuits.p1`, `b2ch9a.B2_Ch09a_Biscuits.p2`
- `b2ch9b`: `b2ch9b.B2_Ch09b_Freezing.p1`, `b2ch9b.B2_Ch09b_Freezing.p2`, `b2ch9b.B2_Ch09b_Weaver.p1`, `b2ch9b.B2_Ch09b_Weaver.p2`, `b2ch9b.B2_Ch09b_Met_zek.p1`, `b2ch9b.B2_Ch09b_Met_zek.p2`
- `b2ch10a`: `b2ch10a.B2_Ch10a_Fortune.p1`, `b2ch10a.B2_Ch10a_Weakness.p1`, `b2ch10a.B2_Ch10a_Currents.p1`, `b2ch10a.B2_Ch10a_Currents.p2`, `b2ch10a.B2_Ch10a_Currents.p3`, `b2ch10a.B2_Ch10a_Bribe.p1`, `b2ch10a.B2_Ch10a_Bribe2.p1`, `b2ch10a.B2_Ch10a_Plan.p1`, `b2ch10a.B2_Ch10a_Plan.p2`
- `b2ch10b`: `b2ch10b.B2_Ch10b_Henchmen2.p1`, `b2ch10b.B2_Ch10b_Run_dwarves.p3`, `b2ch10b.B2_Ch10b_Fly_dwarves.p3`, `b2ch10b.B2_Ch10b_Run_elf.p2`
- `b2ch11a`: `b2ch11a.B2_Ch11a_Keep.p2`, `b2ch11a.B2_Ch11a_Attention.p1`, `b2ch11a.B2_Ch11a_Eventually.p1`, `b2ch11a.B2_Ch11a_Eliminated.p2`, `b2ch11a.B2_Ch11a_Eliminated.p3`, `b2ch11a.B2_Ch11a_Transparent.p1`, `b2ch11a.B2_Ch11a_Transparent.p2`, `b2ch11a.B2_Ch11a_Transparent.p5`, `b2ch11a.B2_Ch11a_Transparent.p6`, `b2ch11a.B2_Ch11a_Transparent.p7`, `b2ch11a.B2_Ch11a_Destination.p1`, `b2ch11a.B2_Ch11a_Destination.p2`, `b2ch11a.B2_Ch11a_Underground.p1`, `b2ch11a.B2_Ch11a_Bored.p1`, `b2ch11a.B2_Ch11a_Understand.p1`
- `b2ch11b`: `b2ch11b.B2_Ch11b_Warning.p1`, `b2ch11b.B2_Ch11b_Switching.p1`, `b2ch11b.B2_Ch11b_Reunion.p1`, `b2ch11b.B2_Ch11b_Scared.p1`, `b2ch11b.B2_Ch11b_Panicking.p1`, `b2ch11b.B2_Ch11b_Uneasy.p1`
- `b2ch11c`: `b2ch11c.B2_Ch11c_Herbalist.p1`, `b2ch11c.B2_Ch11c_Practice.p1`, `b2ch11c.B2_Ch11c_Channel.p4`, `b2ch11c.B2_Ch11c_Explain.p3`, `b2ch11c.B2_Ch11c_Items.p2`, `b2ch11c.B2_Ch11c_Against.p1`, `b2ch11c.B2_Ch11c_Threat.p1`, `b2ch11c.B2_Ch11c_Vacation.p1`, `b2ch11c.B2_Ch11c_Ending.p1`

### B2-PostQuote

Occurrences détectées dans le rapport initial: 18 messages. La passe
d'application a aussi corrigé les variantes équivalentes `je lui réponds`,
`je lui lance`, `je leur crie` et `je lui crie`, dont cinq messages en livre 1.

- `b2ch4a`: `b2ch4a.B2_Ch04a_Himself.p1`, `b2ch4a.B2_Ch04a_Himself.p2`
- `b2ch4b`: `b2ch4b.B2_Ch04b_Strength_check.p2`, `b2ch4b.B2_Ch04b_Strength_check.p3`, `b2ch4b.B2_Ch04b_Ending.p1`
- `b2ch6`: `b2ch6.B2_Ch06a_Distinction.p2`, `b2ch6.B2_Ch06a_Distinction.p3`, `b2ch6.B2_Ch06a_Shopping.p1`, `b2ch6.B2_Ch06a_Absorbed.p3`, `b2ch6.B2_Ch06a_Amass.p1`, `b2ch6.B2_Ch06a_Amass.p2`, `b2ch6.B2_Ch06a_Funnel.p1`, `b2ch6.B2_Ch06a_Nest.p1`, `b2ch6.B2_Ch06a_Threaten.p1`, `b2ch6.B2_Ch06a_Wait.p1`
- `b2ch10b`: `b2ch10b.B2_Ch10b_Vague.p1`, `b2ch10b.B2_Ch10b_Immediately.p1`, `b2ch10b.B2_Ch10b_Confirm.p1`

### B2-Ponctuation

Occurrences détectées dans le rapport initial: 196 messages. La passe
d'application a aussi corrigé les autres verbes d'incise relevant du même motif
typographique, comme `fait`, `me dit`, `m'écrit`, `nous interrompt` et
`j'entends ... dire`.

- `b2ch1`: `b2ch1.B2_Ch01a_Innocent.p4`, `b2ch1.B2_Ch01a_Innocent.p5`, `b2ch1.B2_Ch01a_Innocent.p6`, `b2ch1.B2_Ch01a_Creator.p1`, `b2ch1.B2_Ch01a_Creator3.p1`, `b2ch1.B2_Ch01a_Agree.p1`, `b2ch1.B2_Ch01a_Castles.p1`, `b2ch1.B2_Ch01a_Events.p1`, `b2ch1.B2_Ch01a_Shapeshift.p1`, `b2ch1.B2_Ch01a_Apology.p1`, `b2ch1.B2_Ch01a_Documents.p1`
- `b2ch3`: `b2ch3.B2_Ch03a_Intro.p1`, `b2ch3.B2_Ch03a_Intro2.p1`, `b2ch3.B2_Ch03a_Escaped.p1`, `b2ch3.B2_Ch03a_Weaklings.p1`, `b2ch3.B2_Ch03a_Seriously.p1`, `b2ch3.B2_Ch03a_Half.p1`, `b2ch3.B2_Ch03a_Bodies.p1`, `b2ch3.B2_Ch03a_Eyesight.p4`, `b2ch3.B2_Ch03a_Tiger.p1`, `b2ch3.B2_Ch03a_Protection.p1`, `b2ch3.B2_Ch03a_Straight.p1`, `b2ch3.B2_Ch03a_Confusing.p1`
- `b2ch4a`: `b2ch4a.B2_Ch04a_Intro.p1`, `b2ch4a.B2_Ch04a_Hiding.p1`, `b2ch4a.B2_Ch04a_Owner.p1`, `b2ch4a.B2_Ch04a_Meeting.p1`, `b2ch4a.B2_Ch04a_Technically.p1`, `b2ch4a.B2_Ch04a_Change.p1`, `b2ch4a.B2_Ch04a_Troll.p1`, `b2ch4a.B2_Ch04a_Matter.p1`, `b2ch4a.B2_Ch04a_Information.p1`, `b2ch4a.B2_Ch04a_Cards.p1`, `b2ch4a.B2_Ch04a_Lips.p1`
- `b2ch4b`: `b2ch4b.B2_Ch04b_Wilhelm_charge.p6`, `b2ch4b.B2_Ch04b_Wilhelm_charge.p7`, `b2ch4b.B2_Ch04b_Wilhelm_charge.p8`, `b2ch4b.B2_Ch04b_Manticore_first.p1`, `b2ch4b.B2_Ch04b_Manticore_first.p3`, `b2ch4b.B2_Ch04b_Manticore_first.p5`, `b2ch4b.B2_Ch04b_Strength_check.p1`, `b2ch4b.B2_Ch04b_Strength_check.p2`, `b2ch4b.B2_Ch04b_Strength_check.p3`, `b2ch4b.B2_Ch04b_Cobras.p4`, `b2ch4b.B2_Ch04b_Leila_tramplers.p1`, `b2ch4b.B2_Ch04b_Lure.p1`, `b2ch4b.B2_Ch04b_Lure.p2`, `b2ch4b.B2_Ch04b_Over.p1`, `b2ch4b.B2_Ch04b_Wilhelm_final.p1`, `b2ch4b.B2_Ch04b_Wilhelm_final.p2`, `b2ch4b.B2_Ch04b_Collection.p1`, `b2ch4b.B2_Ch04b_Griffins.p1`, `b2ch4b.B2_Ch04b_Griffins.p2`, `b2ch4b.B2_Ch04b_Hearing2.p2`, `b2ch4b.B2_Ch04b_Hearing2.p3`, `b2ch4b.B2_Ch04b_Killed1.p1`, `b2ch4b.B2_Ch04b_Killed3.p2`, `b2ch4b.B2_Ch04b_Killed3.p3`, `b2ch4b.B2_Ch04b_Killed3.p4`, `b2ch4b.B2_Ch04b_Spared1.p1`, `b2ch4b.B2_Ch04b_Balance.p1`, `b2ch4b.B2_Ch04b_Balance.p2`
- `b2ch5a`: `b2ch5a.B2_Ch05a_Mage.p1`, `b2ch5a.B2_Ch05a_Mage_Without.p1`, `b2ch5a.B2_Ch05a_Mage_Cell1.p1`, `b2ch5a.B2_Ch05a_Mage_Rampage.p1`, `b2ch5a.B2_Ch05a_Troll_dead.p1`, `b2ch5a.B2_Ch05a_Troll_Aftermath.p4`, `b2ch5a.B2_Ch05a_Troll_Aftermath.p8`
- `b2ch6`: `b2ch6.B2_Ch06a_Distinction.p2`, `b2ch6.B2_Ch06a_Distinction.p3`, `b2ch6.B2_Ch06a_Shopping.p1`, `b2ch6.B2_Ch06a_Absorbed.p1`, `b2ch6.B2_Ch06a_Absorbed.p3`, `b2ch6.B2_Ch06a_Amass.p1`, `b2ch6.B2_Ch06a_Amass.p2`, `b2ch6.B2_Ch06a_Elf.p1`, `b2ch6.B2_Ch06a_Elf.p2`, `b2ch6.B2_Ch06a_Elf.p3`, `b2ch6.B2_Ch06a_Funnel.p1`, `b2ch6.B2_Ch06a_Nest.p1`, `b2ch6.B2_Ch06a_Threaten.p1`, `b2ch6.B2_Ch06a_Wait.p1`
- `b2ch7`: `b2ch7.B2_Ch07a_Intro2.p1`, `b2ch7.B2_Ch07a_Possibility.p1`, `b2ch7.B2_Ch07a_Incorrectly.p1`, `b2ch7.B2_Ch07a_Related.p1`, `b2ch7.B2_Ch07a_Overload.p1`, `b2ch7.B2_Ch07a_Oaf.p1`, `b2ch7.B2_Ch07a_Dizziness.p1`, `b2ch7.B2_Ch07a_Adjustments.p1`, `b2ch7.B2_Ch07a_Adjustments.p2`, `b2ch7.B2_Ch07a_Adjustments.p3`, `b2ch7.B2_Ch07a_Clashing.p1`, `b2ch7.B2_Ch07a_Defeatist.p1`, `b2ch7.B2_Ch07a_Bow.p1`, `b2ch7.B2_Ch07a_Myself.p1`, `b2ch7.B2_Ch07a_Job.p1`, `b2ch7.B2_Ch07a_Screw.p1`, `b2ch7.B2_Ch07a_Winter.p1`, `b2ch7.B2_Ch07a_Handle.p1`, `b2ch7.B2_Ch07a_Precautionary.p1`, `b2ch7.B2_Ch07a_Volunteered.p1`, `b2ch7.B2_Ch07a_Tailored.p1`, `b2ch7.B2_Ch07a_Tailored.p2`, `b2ch7.B2_Ch07a_Tailored.p3`, `b2ch7.B2_Ch07a_Tailored.p4`, `b2ch7.B2_Ch07a_Tailored.p5`, `b2ch7.B2_Ch07a_Mansion.p1`, `b2ch7.B2_Ch07a_Mansion.p2`, `b2ch7.B2_Ch07a_Mansion.p3`, `b2ch7.B2_Ch07a_Mansion.p4`, `b2ch7.B2_Ch07a_Ending.p1`, `b2ch7.B2_Ch07a_Ending.p2`, `b2ch7.B2_Ch07a_Ending.p3`
- `b2ch8`: `b2ch8.B2_Ch08a_Trailing.p1`, `b2ch8.B2_Ch08a_Trailing.p2`, `b2ch8.B2_Ch08a_Stuck.p1`, `b2ch8.B2_Ch08a_Alright.p1`, `b2ch8.B2_Ch08a_Retreat.p1`, `b2ch8.B2_Ch08a_Retreat.p2`, `b2ch8.B2_Ch08a_Dispatches.p1`, `b2ch8.B2_Ch08a_Composition.p1`, `b2ch8.B2_Ch08a_Stronger.p1`, `b2ch8.B2_Ch08a_Inspiring.p1`, `b2ch8.B2_Ch08a_Uphold.p1`, `b2ch8.B2_Ch08a_Serve.p1`, `b2ch8.B2_Ch08a_Types.p1`, `b2ch8.B2_Ch08a_Capabilities.p1`, `b2ch8.B2_Ch08a_Bothered.p1`
- `b2ch9a`: `b2ch9a.B2_Ch09a_Feelings.p1`, `b2ch9a.B2_Ch09a_Feelings2.p1`, `b2ch9a.B2_Ch09a_Feelings2.p2`, `b2ch9a.B2_Ch09a_Feelings3.p1`, `b2ch9a.B2_Ch09a_Feelings3.p2`, `b2ch9a.B2_Ch09a_Feelings3.p3`, `b2ch9a.B2_Ch09a_Vicinity.p1`, `b2ch9a.B2_Ch09a_Biscuits.p2`, `b2ch9a.B2_Ch09a_Biscuits2.p1`, `b2ch9a.B2_Ch09a_Biscuits2.p2`, `b2ch9a.B2_Ch09a_Biscuits2.p3`, `b2ch9a.B2_Ch09a_Biscuits2.p4`, `b2ch9a.B2_Ch09a_Biscuits2.p5`, `b2ch9a.B2_Ch09a_Drying.p1`, `b2ch9a.B2_Ch09a_Oath.p1`, `b2ch9a.B2_Ch09a_Oath.p2`, `b2ch9a.B2_Ch09a_Downhill.p1`
- `b2ch10b`: `b2ch10b.B2_Ch10b_Misinterpreting.p3`, `b2ch10b.B2_Ch10b_Empty.p1`, `b2ch10b.B2_Ch10b_Secret.p1`, `b2ch10b.B2_Ch10b_Boost.p3`, `b2ch10b.B2_Ch10b_Boost.p4`, `b2ch10b.B2_Ch10b_Details.p1`, `b2ch10b.B2_Ch10b_Details.p2`, `b2ch10b.B2_Ch10b_Details.p3`, `b2ch10b.B2_Ch10b_Except.p2`, `b2ch10b.B2_Ch10b_Except.p3`
- `b2ch11a`: `b2ch11a.B2_Ch11a_Eliminated.p2`, `b2ch11a.B2_Ch11a_Eliminated.p3`, `b2ch11a.B2_Ch11a_Transparent.p1`, `b2ch11a.B2_Ch11a_Transparent.p2`, `b2ch11a.B2_Ch11a_Transparent.p5`, `b2ch11a.B2_Ch11a_Transparent.p6`, `b2ch11a.B2_Ch11a_Transparent.p7`, `b2ch11a.B2_Ch11a_Luggage.p1`
- `b2ch11b`: `b2ch11b.B2_Ch11b_Individual.p3`, `b2ch11b.B2_Ch11b_Collar.p1`, `b2ch11b.B2_Ch11b_Convincing.p1`
- `b2ch11c`: `b2ch11c.B2_Ch11c_Herbalist.p2`, `b2ch11c.B2_Ch11c_Herbalist.p3`, `b2ch11c.B2_Ch11c_Herbalist.p4`, `b2ch11c.B2_Ch11c_Encourage.p1`, `b2ch11c.B2_Ch11c_Encourage.p2`, `b2ch11c.B2_Ch11c_Encourage.p3`, `b2ch11c.B2_Ch11c_Encourage.p4`, `b2ch11c.B2_Ch11c_Practice.p1`, `b2ch11c.B2_Ch11c_Slowing.p1`, `b2ch11c.B2_Ch11c_Slowing.p2`, `b2ch11c.B2_Ch11c_Slowing.p3`, `b2ch11c.B2_Ch11c_Hesitation.p1`, `b2ch11c.B2_Ch11c_Defend.p1`, `b2ch11c.B2_Ch11c_Defend.p2`, `b2ch11c.B2_Ch11c_Defend.p3`, `b2ch11c.B2_Ch11c_Mountain.p1`, `b2ch11c.B2_Ch11c_Shelter.p1`, `b2ch11c.B2_Ch11c_Shelter.p2`, `b2ch11c.B2_Ch11c_Shelter.p3`, `b2ch11c.B2_Ch11c_Shelter.p4`, `b2ch11c.B2_Ch11c_Shelter.p5`, `b2ch11c.B2_Ch11c_Shelter.p6`, `b2ch11c.B2_Ch11c_Shelter.p7`, `b2ch11c.B2_Ch11c_Avalanche.p1`, `b2ch11c.B2_Ch11c_Ezzeloff.p1`, `b2ch11c.B2_Ch11c_Threat.p1`, `b2ch11c.B2_Ch11c_Vacation.p1`, `b2ch11c.B2_Ch11c_Dave.p1`
