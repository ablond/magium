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
- locale achievements ;
- locale stats.

Le chargement est lazy. Un nouveau chapitre n'est importe que lorsque le joueur atteint une scene qui y appartient. Si la locale de récit demandée ne possède pas encore le chapitre, le chargeur retombe sur `en` pour ce chapitre.

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
  history: GameHistoryEvent[]
  historyDigest: string
  createdAt: string
  updatedAt: string
}
```

`locale` porte la langue de lecture active. Changer de langue ne modifie pas l'historique ni le `historyDigest`; il recharge seulement les packs de textes.

`variables` porte les variables Magium (`v_current_scene`, stats, flags, achievements, compteurs de points).

`history` contient des evenements types :

- `type: "choice"` pour les choix narratifs ;
- `type: "stats"` pour les allocations manuelles de points de stats.

Il sert a valider les imports par replay.

`historyDigest` est un hash chaine initialise avec `magium:v2:initial` pour detecter les modifications triviales. Le format runtime V2 invalide les anciennes sauvegardes incompatibles.

## Assignations De Variables

Les assignations canoniques sont explicites :

```ts
type VariableAssignment = {
  variable: string
  mode: 'set' | 'add'
  value: PrimitiveValue
}
```

- `mode: "set"` remplace la valeur courante ;
- `mode: "add"` ajoute un delta numerique a la valeur courante.

Dans les `.magium`, les valeurs signees comme `v_available_points = +3` ou `set(v_hearing,-3)` deviennent des deltas `add`. Les valeurs non signees comme `v_max_stat = 4` restent des `set`.

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
- deduit les resultats de stat checks visibles apres l'arrivee dans la scene ;
- renvoie les achievements debloques.

Les blocs narratifs canoniques peuvent contenir plusieurs alineas separes par des lignes vides. Le lecteur les decoupe au rendu en vrais paragraphes DOM, sans modifier le graphe logique ni les packs de contenu.

Le rendu ne modifie pas l'etat.

## Illustrations De Moments

Les illustrations Book 1 ne font pas partie du moteur de scene. `src/App.svelte` lit `state.currentSceneId`, puis resout une image statique avec `src/lib/visuals/book1.ts`.

Le setting `settings.illustrations` est une preference UI locale, activee par defaut a la migration. Quand elle est activee, l'image `/visuals/book1/moments/<moment-id>/illustration.webp` s'affiche apres le texte de la scene declencheuse et avant les choix. Si le WebP manque ou echoue au chargement, l'UI le masque et la lecture continue.

Ces images ne modifient pas `GameState`, `history`, `historyDigest`, le replay anti-tamper ou le chargement des packs narratifs.

## Stat Checks Post-Choix

Les tests de stats ne sont jamais affiches sur un choix avant que le joueur clique. Le moteur les deduit seulement depuis la scene courante, apres application du choix et entree dans la scene cible.

`RenderedScene.statChecks` contient les resultats affichables :

```ts
type StatCheckResult = {
  variable: string
  label: string
  outcome: 'success' | 'failure'
  level: number
  actual: number
}
```

La detection utilise les conditions canoniques du `.magium` :

- `>= N`, `== N` et `> N-1` sur une variable de stat connue donnent une reussite niveau `N` ;
- `< N`, `<= N-1`, et `== 0` avec seuil frere inferable donnent un echec niveau `N` ;
- les conditions non-stat sont ignorees dans l'affichage, mais restent necessaires pour savoir si le paragraphe est visible ;
- les doublons `variable/outcome/level` sont supprimes.

Les conditions des paragraphes visibles sont prioritaires. Les conditions des choix visibles ne sont utilisees qu'en secours si aucun paragraphe visible ne porte le resultat, pour les scenes ou le contenu original expose le check dans la branche suivante. Les `logic.txt` originaux peuvent aider a auditer les seuils, mais ne deviennent pas une source runtime.

## Affichage Des Stats

Le moteur conserve toutes les variables de stats dans `GameState.variables`, mais l'UI ne les montre pas toutes des le depart.

Dans `src/App.svelte`, le panneau affiche `Stats` en francais. Son identifiant interne reste `abilities` pour eviter un refactor technique sans impact joueur. Il revele :

- aucune stat avant que Barry atteigne `Ch2-Stats` ;
- les stats de base apres `Ch2-Stats` ou `Ch2-Stats-spent` ;
- `Bluff`, `Magical sense` et `Aura hardening` apres l'introduction aura de `B3-Ch04a`.

`Magical Power` et `Magical Knowledge` restent verrouillees et invisibles tant que le contenu original ne les rend pas jouables.

Le plafond manuel vient de `v_max_stat` :

- `3` par defaut ;
- `4` quand le contenu original affecte `v_max_stat = 4`.

Les points disponibles viennent de `v_available_points`. L'allocation manuelle incrémente la stat, incrémente sa variable `_aux`, puis decremente `v_available_points` et `v_available_points_aux`. Les boosts narratifs peuvent depasser le plafond, mais le panneau ne permet pas d'ajouter manuellement au-dessus de `v_max_stat`.

Les libelles de stats viennent de `locales/<locale>/stats`, avec fallback `en`. Les entrees non introduites par le contenu actuel restent invisibles, meme si elles existent dans la liste des variables de stats.

## Application D'Un Choix

`applyChoice(context, state, choice)` :

1. verifie que le choix est visible depuis l'etat courant ;
2. gere `special:restart` ;
3. applique les assignments du choix en respectant `set` ou `add` ;
4. ajoute un evenement `type: "choice"` dans `history` ;
5. etend `historyDigest` ;
6. change `currentSceneId` ;
7. cree un checkpoint si `special:checkpoint_save` ;
8. entre dans la nouvelle scene.

## Allocation De Stats

`applyStatAllocation(state, deltas)` :

1. fusionne les deltas par variable ;
2. verifie que chaque stat est visible et allouable ;
3. verifie que le total ne depasse pas `v_available_points` ;
4. verifie que chaque stat reste sous `v_max_stat` ;
5. applique atomiquement les deltas de stat, `_aux`, `v_available_points` et `v_available_points_aux` ;
6. ajoute un evenement `type: "stats"` dans `history` ;
7. etend `historyDigest`.

Le panneau UI ne peut retirer que les points du brouillon non confirme. Les points deja confirmes ne sont modifiables que par un retour checkpoint ou une nouvelle partie.

## Mode Debug Local

Le mode debug est un outil local de developpement expose uniquement par `src/App.svelte` quand `import.meta.env.DEV` vaut `true`, donc sous `pnpm dev`. Il ne doit pas apparaitre dans un build de production.

Le panneau Debug permet :

- de sauter vers une scene depuis `ContentIndex.chapters` et le `sceneOrder` du chapitre charge ;
- d'appliquer les choix de la scene courante, y compris ceux masques par leurs conditions ;
- de modifier les stats, compteurs et variables primitives ;
- d'annuler ou retablir les changements de la session courante via une pile en memoire.

Les helpers debug restent separes du moteur normal :

- `debugJumpToScene(context, state, sceneId)` met `currentSceneId` et `v_current_scene`, puis entre dans la scene cible ;
- `debugApplyChoice(context, state, choice)` applique les assignments et la cible du choix sans verifier sa visibilite ;
- `debugSetVariable(state, variable, value)` et `debugDeleteVariable(state, variable)` modifient directement `variables`.

Ces operations ne creent aucun evenement `history` et ne recalculent pas `historyDigest`. Elles marquent l'etat avec `GameState.debug = { dirty: true, lastAction, updatedAt }`. Un etat debug peut rester dans IndexedDB et dans les saves nommees locales, mais ne doit pas etre exporte en `.magium-save`.

## Specials Supportes Actuellement

- `restart`
- `checkpoint_save`
- `saves` cote UI quand le target est vide
- `stats` cote UI pour ouvrir le panneau Stats

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
2. rejoue chaque evenement de `saved.history` ;
3. verifie que chaque choix etait disponible et que chaque allocation respectait stats visibles, plafond et points disponibles ;
4. recharge la scene cible avant d'entrer dans un nouveau chapitre ;
5. compare scene courante, variables, achievements et `historyDigest`.

Cette validation est utilisee a l'import de sauvegarde.

Limite : un attaquant qui modifie le code client peut contourner ce controle. Sans backend, c'est une barriere contre la manipulation triviale, pas une preuve cryptographique globale.
