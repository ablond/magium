# Moteur Runtime

## Responsabilite

Le moteur transforme un `GameState` et un `StoryContext` en scene affichable, puis applique les choix du joueur.

Fichiers :

- `src/lib/story/engine.ts`
- `src/lib/story/conditions.ts`
- `src/lib/story/digest.ts`
- `src/lib/story/types.ts`

## Chargement

`src/lib/content/packedContent.ts` charge :

- `index`
- chapitre contenant la scene courante ;
- locale du chapitre ;
- achievements ;
- locale achievements.

Le chargement est lazy. Un nouveau chapitre n'est importe que lorsque le joueur atteint une scene qui y appartient.

## GameState

Modele principal :

```ts
type GameState = {
  schemaVersion: 1
  contentVersion: string
  slotId: string
  locale: string
  currentSceneId: string
  variables: Record<string, PrimitiveValue>
  achievements: Record<string, true>
  checkpoint: CheckpointState | null
  history: ChoiceHistoryEvent[]
  historyDigest: string
  createdAt: string
  updatedAt: string
}
```

`variables` porte les variables Magium (`v_current_scene`, stats, flags, achievements).

`history` contient les choix pris. Il sert a valider les imports par replay.

`historyDigest` est un hash chaine pour detecter les modifications triviales.

## Entree Dans Une Scene

`enterCurrentScene(context, state)` :

1. trouve la scene ;
2. applique les `setVariables` dont les conditions sont vraies ;
3. debloque les achievements dont la variable vaut `1` ;
4. met a jour `updatedAt`.

Attention : appeler cette fonction apres creation d'un nouvel etat ou apres application d'un choix.

## Rendu D'Une Scene

`renderCurrentScene(context, state)` :

- filtre les paragraphes par conditions ;
- filtre les choix par conditions ;
- remplace les `messageId` par le texte de la locale chargee ;
- renvoie les achievements debloques.

Le rendu ne modifie pas l'etat.

## Affichage Des Abilities

Le moteur conserve toutes les variables de stats dans `GameState.variables`, mais l'UI ne les montre pas toutes des le depart.

Dans `src/App.svelte`, le panneau `Abilities` revele :

- aucune ability avant que Barry atteigne `Ch2-Stats` ;
- les abilities de base apres `Ch2-Stats` ou `Ch2-Stats-spent` ;
- `Bluff`, `Magical sense` et `Aura hardening` apres l'introduction aura de `B3-Ch04a`.

Les entrees non introduites par le contenu actuel restent invisibles, meme si elles existent dans `STAT_LABELS`.

## Application D'Un Choix

`applyChoice(context, state, choice)` :

1. verifie que le choix est visible depuis l'etat courant ;
2. gere `special:restart` ;
3. applique les assignments du choix ;
4. ajoute un evenement dans `history` ;
5. etend `historyDigest` ;
6. change `currentSceneId` ;
7. cree un checkpoint si `special:checkpoint_save` ;
8. entre dans la nouvelle scene.

## Specials Supportes Actuellement

- `restart`
- `checkpoint_save`
- `saves` cote UI quand le target est vide
- `stats` cote UI pour ouvrir le panneau `Abilities`

D'autres `special:*` peuvent exister dans le corpus. Si une nouvelle valeur doit avoir un effet moteur, l'ajouter dans `applyChoice` et couvrir par test.

## Conditions

`evaluateCondition` supporte :

- `true`
- `false`
- comparaisons `<`, `>`, `<=`, `>=`, `==`, `!=`
- OR de groupes AND via `anyOf/allOf`.

Les valeurs absentes valent `0` pour les comparaisons, comme dans le comportement historique attendu.

## Replay Anti-Tamper

`replayAndValidate(contextForScene, saved)` :

1. repart de `Ch1-Intro1` ;
2. rejoue chaque choix de `saved.history` ;
3. verifie que chaque choix etait disponible ;
4. compare scene courante, variables, achievements et `historyDigest`.

Cette validation est utilisee a l'import de sauvegarde.

Limite : un attaquant qui modifie le code client peut contourner ce controle. Sans backend, c'est une barriere contre la manipulation triviale, pas une preuve cryptographique globale.
