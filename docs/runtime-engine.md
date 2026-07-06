# Runtime Engine

## Responsibility

The engine transforms a `GameState` and `StoryContext` into a renderable scene,
then applies player choices.

Files:

- `src/lib/story/engine.ts`
- `src/lib/story/conditions.ts`
- `src/lib/story/digest.ts`
- `src/lib/story/types.ts`

## Loading

`src/lib/content/packedContent.ts` loads:

- `index`
- the chapter containing the current scene;
- the chapter locale;
- achievements;
- achievement locale;
- stat locale.

Loading is lazy. A new chapter is imported only when the player reaches a scene
inside it. If the requested story locale does not yet have that chapter, the
loader falls back to `en` for that chapter.

## GameState

Main model:

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

`locale` carries the active reading language. Changing language does not modify
history or `historyDigest`; it only reloads text packs.

`variables` carries Magium variables (`v_current_scene`, stats, flags,
achievements, point counters).

`achievements` is scoped to the current playthrough. It is used for immediate
rendering and anti-tamper replay, so it rolls back to an older snapshot on
`checkpoint_load` and clears on `restart`. The collection visible in the
Achievements panel is persisted separately by
`src/lib/storage/achievementProgress.ts`, in encrypted IndexedDB, to preserve
achievements between playthroughs like the original app.

`history` contains typed events:

- `type: "choice"` for narrative choices;
- `type: "stats"` for manual stat point allocations.

It is used to validate imported saves by replay.

`historyDigest` is a chained hash initialized with `magium:v2:initial` to
detect trivial modifications. `contentVersion` includes the current runtime
format and invalidates incompatible saves when the generated graph changes.

## Variable Assignments

Canonical assignments are explicit:

```ts
type VariableAssignment = {
  variable: string
  mode: 'set' | 'add'
  value: PrimitiveValue
}
```

- `mode: "set"` replaces the current value;
- `mode: "add"` adds a numeric delta to the current value.

In `.magium`, signed values such as `v_available_points = +3` or
`set(v_hearing,-3)` become `add` deltas. Unsigned values such as
`v_max_stat = 4` remain `set`.

## Entering A Scene

`enterCurrentScene(context, state)`:

1. finds the scene;
2. applies `setVariables` whose conditions are true;
3. unlocks achievements whose variable is `1`;
4. updates `updatedAt`.

Call this after creating a new state or after applying a choice.

## Rendering A Scene

`renderCurrentScene(context, state)`:

- filters paragraphs by condition;
- filters choices by condition;
- replaces `messageId` with loaded locale text;
- derives visible stat check results after arriving in the scene;
- returns newly unlocked achievements.

Canonical narrative blocks may contain several paragraphs separated by blank
lines. The reader splits them into real DOM paragraphs at render time without
changing the logic graph or content packs.

Rendering does not mutate state.

`readNewlyUnlockedAchievements(context, previousState, nextState)` compares two
states already produced by the engine and returns only achievements absent from
`previousState.achievements` but present in `nextState.achievements`. The
reader UI then filters these against encrypted global progress before showing a
temporary `Achievement unlocked` / `Succès obtenu` notice, without changing
`history` or anti-tamper replay.

## Moment Illustrations

Book 1 illustrations are not part of the scene engine. `src/App.svelte` reads
`state.currentSceneId` and `state.variables`, then resolves a static image with
`src/lib/visuals/book1.ts`.

`settings.illustrations` is a local UI preference enabled by default on
migration. When active, `/visuals/book1/moments/<moment-id>/illustration.webp`
appears after the trigger scene text and before choices. If several variants
exist for the same `sceneId`, the map may choose a variant with a simple
condition on game variables, for example `Ch11b-Ending` based on
`v_ch11_saved_rose`. If the WebP is missing or fails to load, the UI hides it
and reading continues.

These images do not modify `GameState`, `history`, `historyDigest`,
anti-tamper replay, or narrative pack loading.

## Post-Choice Stat Checks

Stat checks are never displayed on a choice before the player clicks. The engine
derives them only from the current scene, after choice application and entry
into the target scene.

`RenderedScene.statChecks` contains displayable results:

```ts
type StatCheckResult = {
  variable: string
  label: string
  outcome: 'success' | 'failure'
  level: number
  actual: number
}
```

Detection uses canonical `.magium` conditions:

- `>= N`, `== N`, and `> N-1` on a known stat variable produce a level `N` success;
- `< N`, `<= N-1`, and `== 0` with an inferable sibling threshold produce a level `N` failure;
- non-stat conditions are ignored for display but still required to know whether the paragraph is visible;
- duplicate `variable/outcome/level` results are removed.

Visible paragraph conditions have priority. Visible choice conditions are used
only as fallback if no visible paragraph carries the result, for scenes where
the original content exposes the check in the following branch. Original
`logic.txt` files can help audit thresholds, but do not become a runtime source.

## Stats Display

The engine keeps all stat variables in `GameState.variables`, but the UI does
not reveal all of them from the start.

In `src/App.svelte`, the French panel label is `Stats`. The internal identifier
remains `abilities` to avoid a technical refactor with no player impact. It
reveals:

- no stat before Barry reaches `Ch2-Stats`;
- base stats after `Ch2-Stats` or `Ch2-Stats-spent`;
- `Bluff`, `Magical sense`, and `Aura hardening` after the aura introduction in `B3-Ch04a`.

`Magical Power` and `Magical Knowledge` remain locked and invisible until the
original content makes them playable.

The manual cap comes from `v_max_stat`:

- `3` by default;
- `4` when the original content assigns `v_max_stat = 4`.

Available points come from `v_available_points`. Manual allocation increments
the stat, increments its `_aux` variable, then decrements `v_available_points`
and `v_available_points_aux`. Narrative boosts may exceed the cap, but the
panel does not allow manual additions above `v_max_stat`.

Stat labels come from `locales/<locale>/stats`, with `en` fallback. Entries not
yet introduced by current content remain invisible even if they exist in the
stat variable list.

## Applying A Choice

`applyChoice(context, state, choice)`:

1. verifies that the choice is visible from the current state;
2. handles `special:restart`;
3. handles `special:checkpoint_load` by restoring `GameState.checkpoint` without applying choice assignments or adding a history event;
4. applies choice assignments with `set` or `add`;
5. appends a `type: "choice"` event to `history`;
6. extends `historyDigest`;
7. changes `currentSceneId`;
8. creates a checkpoint if `special:checkpoint_save`;
9. enters the new scene.

## Stat Allocation

`applyStatAllocation(state, deltas)`:

1. merges deltas by variable;
2. verifies that each stat is visible and allocatable;
3. verifies that the total does not exceed `v_available_points`;
4. verifies that each stat remains under `v_max_stat`;
5. atomically applies stat deltas, `_aux`, `v_available_points`, and `v_available_points_aux`;
6. appends a `type: "stats"` event to `history`;
7. extends `historyDigest`.

The UI panel can remove only unconfirmed draft points. Confirmed points can be
changed only by returning to a checkpoint or starting a new game.

## Local Debug Mode

Debug mode is a local development tool exposed only by `src/App.svelte` when
`import.meta.env.DEV` is `true`, therefore under `pnpm dev`. It must not appear
in a production build.

The Debug panel can:

- jump to a scene from `ContentIndex.chapters` and the loaded chapter `sceneOrder`;
- apply current-scene choices, including choices hidden by conditions;
- edit stats, counters, and primitive variables;
- undo or redo current-session changes through an in-memory stack.

Debug helpers stay separate from the normal engine:

- `debugJumpToScene(context, state, sceneId)` sets `currentSceneId` and `v_current_scene`, then enters the target scene;
- `debugApplyChoice(context, state, choice)` applies assignments and target without checking visibility;
- `debugSetVariable(state, variable, value)` and `debugDeleteVariable(state, variable)` directly modify `variables`.

These operations do not create `history` events and do not recalculate
`historyDigest`. They mark the state with
`GameState.debug = { dirty: true, lastAction, updatedAt }`. A debug state may
remain in IndexedDB and named local saves, but must not be exported as
`.magium-save`.

## Currently Supported Specials

- `restart`
- `checkpoint_save`
- `checkpoint_load`
- `saves` on the UI side when target is empty
- `stats` on the UI side to open the Stats panel

Other `special:*` values may exist in the corpus. If a new value needs engine
behavior, add it in `applyChoice` and cover it with tests.

## Conditions

`evaluateCondition` supports:

- `true`
- `false`
- comparisons `<`, `>`, `<=`, `>=`, `==`, `!=`
- OR of AND groups through `anyOf/allOf`.

Missing values count as `0` for comparisons, matching expected historical
behavior.

## Anti-Tamper Replay

`replayAndResolveState(contextForScene, saved, targetContentVersion)`:

1. starts again from `Ch1-Intro1`;
2. replays every event in `saved.history`;
3. verifies that every choice was available and every stat allocation respected visible stats, caps, and available points;
4. reloads the target scene before entering a new chapter;
5. compares current scene, variables, playthrough-scoped achievements, and `historyDigest`.
6. returns the replayed state stamped with `targetContentVersion` when the save is compatible.

`replayAndValidate(contextForScene, saved)` remains as a boolean wrapper around
the same logic. Save import and local save loading use the resolved state, so a
save from an older `contentVersion` can survive compatible runtime/content
updates while a path that no longer replays is still rejected.

Global achievement progress is not part of this comparison. A valid import may
enrich it after successful replay, but a `.magium-save` remains a playthrough
save, not a complete achievement collection export.

Limit: an attacker who modifies client code can bypass this control. Without a
backend, it is a barrier against trivial manipulation, not a global
cryptographic proof.
