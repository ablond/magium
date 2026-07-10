import { evaluateCondition } from './conditions'
import { digestHistory, extendHistoryDigest, INITIAL_HISTORY_DIGEST, stableStringify } from './digest'
import {
  AVAILABLE_POINTS_AUX_VARIABLE,
  AVAILABLE_POINTS_VARIABLE,
  isAllocatableStatVariable,
  readAvailableStatPoints,
  readNumericVariable,
  readStatCheckResults,
  readStatMax,
  revealedStatVariables,
  statAuxVariable,
} from './stats'
import type {
  AchievementDefinition,
  Choice,
  ChoiceHistoryEvent,
  GameHistoryEvent,
  GameState,
  PrimitiveValue,
  RenderedScene,
  Scene,
  StatAllocationDelta,
  StatAllocationHistoryEvent,
  StoryContext,
  VariableAssignment,
} from './types'

const BOOK2_LESSATHI_DEAL_SCENE_ID = 'B2-Ch02a-Soundproof'
const BOOK2_LESSATHI_DEAL_CONCLUSION_SCENE_ID = 'B2-Ch02a-Deal-conclusion'
const BOOK2_LESSATHI_FALSE_REFUSAL_CHOICE_ID = `${BOOK2_LESSATHI_DEAL_SCENE_ID}:c3`
const BOOK2_LESSATHI_LIE_CHOICE_ID = `${BOOK2_LESSATHI_DEAL_SCENE_ID}:c1`
const BOOK2_LESSATHI_LEGACY_REFUSAL_EVENT: ChoiceHistoryEvent = {
  type: 'choice',
  sceneId: BOOK2_LESSATHI_DEAL_SCENE_ID,
  choiceId: BOOK2_LESSATHI_FALSE_REFUSAL_CHOICE_ID,
  target: BOOK2_LESSATHI_DEAL_CONCLUSION_SCENE_ID,
  special: null,
  assignments: [
    { variable: 'v_current_scene', mode: 'set', value: BOOK2_LESSATHI_DEAL_CONCLUSION_SCENE_ID },
    { variable: 'v_b2_ch2_deal', mode: 'set', value: 1 },
  ],
}
const BOOK2_LESSATHI_LIE_EVENT: ChoiceHistoryEvent = {
  ...BOOK2_LESSATHI_LEGACY_REFUSAL_EVENT,
  choiceId: BOOK2_LESSATHI_LIE_CHOICE_ID,
}

export function createInitialState(contentVersion: string, locale: string, slotId = 'autosave'): GameState {
  const now = new Date().toISOString()
  return {
    schemaVersion: 1,
    contentVersion,
    slotId,
    locale,
    currentSceneId: 'Ch1-Intro1',
    variables: { v_current_scene: 'Ch1-Intro1' },
    achievements: {},
    checkpoint: null,
    history: [],
    historyDigest: INITIAL_HISTORY_DIGEST,
    createdAt: now,
    updatedAt: now,
  }
}

export function enterCurrentScene(context: StoryContext, state: GameState): GameState {
  const scene = findScene(context, state.currentSceneId)
  const next = cloneState(state)
  for (const assignment of scene.setVariables) {
    if (evaluateCondition(assignment.conditions, next.variables)) {
      applyVariableAssignment(next.variables, assignment)
    }
  }
  unlockSceneAchievements(context, scene, next)
  next.updatedAt = new Date().toISOString()
  return next
}

export function renderCurrentScene(context: StoryContext, state: GameState): RenderedScene {
  const scene = findScene(context, state.currentSceneId)
  const locale = context.locales[context.index.sceneToChapter[state.currentSceneId]]
  const visibleBlocks = scene.blocks.filter((block) => evaluateCondition(block.conditions, state.variables))
  const visibleChoices = scene.choices.filter((choice) => evaluateCondition(choice.conditions, state.variables))
  const paragraphs = visibleBlocks
    .map((block) => ({ id: block.id, text: locale.messages[block.messageId] ?? `[${block.messageId}]` }))
  const choices = visibleChoices
    .map((choice) => ({ ...choice, text: locale.messages[choice.messageId] ?? `[${choice.messageId}]` }))

  return {
    scene,
    paragraphs,
    choices,
    statChecks: readStatCheckResults(
      visibleBlocks.map((block) => block.conditions),
      visibleChoices.map((choice) => choice.conditions),
      state.variables,
      context.statsLocale.messages,
      [
        ...scene.blocks.map((block) => block.conditions),
        ...scene.choices.map((choice) => choice.conditions),
      ],
    ),
    unlockedAchievements: unlockedAchievementDefinitions(context, state),
  }
}

export function readNewlyUnlockedAchievements(
  context: StoryContext,
  previousState: GameState,
  nextState: GameState,
): AchievementDefinition[] {
  return context.achievements.achievements.filter((achievement) =>
    !previousState.achievements[achievement.variable] &&
    Boolean(nextState.achievements[achievement.variable])
  )
}

export async function applyChoice(context: StoryContext, state: GameState, choice: Choice): Promise<GameState> {
  const currentRendered = renderCurrentScene(context, state)
  if (!currentRendered.choices.some((visibleChoice) => visibleChoice.id === choice.id)) {
    throw new Error('Choice is not available from the current state')
  }

  if (choice.special === 'restart') {
    return enterCurrentScene(context, createInitialState(state.contentVersion, state.locale, state.slotId))
  }

  if (choice.special === 'checkpoint_load') {
    if (!state.checkpoint) {
      throw new Error('No checkpoint is available')
    }
    return restoreCheckpoint(context, state)
  }

  const next = cloneState(state)
  for (const assignment of choice.setVariables) {
    applyVariableAssignment(next.variables, assignment)
  }

  const event: ChoiceHistoryEvent = {
    type: 'choice',
    sceneId: state.currentSceneId,
    choiceId: choice.id,
    target: choice.target,
    special: choice.special,
    assignments: choice.setVariables.map(cloneAssignment),
  }

  next.history = [...next.history, event]
  next.historyDigest = await extendHistoryDigest(state.historyDigest, event)

  if (choice.target) {
    next.currentSceneId = choice.target
    next.variables.v_current_scene = choice.target
  }

  if (choice.special === 'checkpoint_save') {
    next.checkpoint = snapshotCheckpoint(next)
  }

  next.updatedAt = new Date().toISOString()
  return enterCurrentScene(context, next)
}

export async function applyStatAllocation(state: GameState, deltas: StatAllocationDelta[]): Promise<GameState> {
  const normalizedDeltas = normalizeStatAllocationDeltas(deltas)
  if (!normalizedDeltas.length) {
    throw new Error('No stat points selected')
  }

  const visibleStats = new Set(revealedStatVariables(state))
  const max = readStatMax(state.variables)
  const availablePoints = readAvailableStatPoints(state.variables)
  const total = normalizedDeltas.reduce((sum, delta) => sum + delta.amount, 0)
  if (total > availablePoints) {
    throw new Error('Not enough stat points available')
  }

  for (const delta of normalizedDeltas) {
    if (!isAllocatableStatVariable(delta.variable) || !visibleStats.has(delta.variable)) {
      throw new Error('Stat is not available for allocation')
    }
    const currentValue = readNumericVariable(state.variables, delta.variable)
    if (currentValue + delta.amount > max) {
      throw new Error('Stat maximum reached')
    }
  }

  const assignments: VariableAssignment[] = []
  for (const delta of normalizedDeltas) {
    assignments.push({ variable: delta.variable, mode: 'add', value: delta.amount })
    assignments.push({ variable: statAuxVariable(delta.variable), mode: 'add', value: delta.amount })
  }
  assignments.push({ variable: AVAILABLE_POINTS_VARIABLE, mode: 'add', value: -total })
  assignments.push({ variable: AVAILABLE_POINTS_AUX_VARIABLE, mode: 'add', value: -total })

  const next = cloneState(state)
  for (const assignment of assignments) {
    applyVariableAssignment(next.variables, assignment)
  }

  const event: StatAllocationHistoryEvent = {
    type: 'stats',
    sceneId: state.currentSceneId,
    deltas: normalizedDeltas,
    assignments: assignments.map(cloneAssignment),
  }

  next.history = [...next.history, event]
  next.historyDigest = await extendHistoryDigest(state.historyDigest, event)
  next.updatedAt = new Date().toISOString()
  return next
}

export function debugJumpToScene(context: StoryContext, state: GameState, sceneId: string): GameState {
  const next = markDebugState(state, `Jumped to ${sceneId}`)
  next.currentSceneId = sceneId
  next.variables.v_current_scene = sceneId
  return enterCurrentScene(context, next)
}

export function debugApplyChoice(context: StoryContext, state: GameState, choice: Choice): GameState {
  if (choice.special === 'restart') {
    return enterCurrentScene(
      context,
      markDebugState(
        createInitialState(state.contentVersion, state.locale, state.slotId),
        `Applied restart choice ${choice.id}`,
      ),
    )
  }

  const next = markDebugState(state, `Applied choice ${choice.id}`)
  for (const assignment of choice.setVariables) {
    applyVariableAssignment(next.variables, assignment)
  }

  if (choice.target) {
    next.currentSceneId = choice.target
    next.variables.v_current_scene = choice.target
  }

  if (choice.special === 'checkpoint_save') {
    next.checkpoint = snapshotCheckpoint(next)
  }

  return choice.target ? enterCurrentScene(context, next) : next
}

export function debugSetVariable(
  state: GameState,
  variable: string,
  value: PrimitiveValue,
  lastAction = `Set ${variable}`,
): GameState {
  const next = markDebugState(state, lastAction)
  next.variables[variable] = value
  return next
}

export function debugDeleteVariable(state: GameState, variable: string): GameState {
  const next = markDebugState(state, `Deleted ${variable}`)
  delete next.variables[variable]
  return next
}

export function restoreCheckpoint(context: StoryContext, state: GameState): GameState {
  if (!state.checkpoint) {
    return state
  }
  return enterCurrentScene(context, {
    ...cloneState(state),
    currentSceneId: state.checkpoint.currentSceneId,
    variables: { ...state.checkpoint.variables },
    achievements: { ...state.checkpoint.achievements },
    history: cloneState(state).history.slice(0, state.checkpoint.historyLength),
    historyDigest: state.checkpoint.historyDigest,
    updatedAt: new Date().toISOString(),
  })
}

export async function replayAndValidate(
  contextForScene: (sceneId: string) => Promise<StoryContext>,
  saved: GameState,
): Promise<boolean> {
  return (await replayAndResolveState(contextForScene, saved)) !== null
}

export async function replayAndResolveState(
  contextForScene: (sceneId: string) => Promise<StoryContext>,
  saved: GameState,
  targetContentVersion = saved.contentVersion,
): Promise<GameState | null> {
  const migratedSaved = await migrateSavedStateForReplay(saved)
  if (!migratedSaved) {
    return null
  }
  let context = await contextForScene('Ch1-Intro1')
  let state = enterCurrentScene(context, createInitialState(targetContentVersion, migratedSaved.locale, migratedSaved.slotId))

  for (const event of migratedSaved.history) {
    if (!isHistoryEvent(event)) {
      return null
    }
    if (state.currentSceneId !== event.sceneId) {
      return null
    }
    if (event.type === 'stats') {
      try {
        state = await applyStatAllocation(state, event.deltas)
      } catch {
        return null
      }
      continue
    }
    context = await contextForScene(state.currentSceneId)
    const rendered = renderCurrentScene(context, state)
    const choice = rendered.choices.find((candidate) => candidate.id === event.choiceId)
    if (!choice) {
      return null
    }
    if (choice.target) {
      context = await contextForScene(choice.target)
    }
    state = await applyChoice(context, state, choice)
  }

  const isValid = state.currentSceneId === migratedSaved.currentSceneId &&
    state.historyDigest === migratedSaved.historyDigest &&
    stableVariablesEqual(state.variables, migratedSaved.variables) &&
    stableAchievementsEqual(state.achievements, migratedSaved.achievements)
  if (!isValid) {
    return null
  }

  return {
    ...state,
    contentVersion: targetContentVersion,
    createdAt: migratedSaved.createdAt,
    updatedAt: migratedSaved.updatedAt,
  }
}

async function migrateSavedStateForReplay(saved: GameState): Promise<GameState | null> {
  const legacyEventIndexes = saved.history
    .map((event, index) => isLegacyBook2LessathiRefusalEvent(event) ? index : -1)
    .filter((index) => index >= 0)
  if (!legacyEventIndexes.length) {
    return saved
  }

  if (await digestHistory(saved.history) !== saved.historyDigest) {
    return null
  }

  const legacyIndexSet = new Set(legacyEventIndexes)
  const history = saved.history.map((event, index) =>
    legacyIndexSet.has(index) ? cloneHistoryEvent(BOOK2_LESSATHI_LIE_EVENT) : cloneHistoryEvent(event)
  )
  const historyDigest = await digestHistory(history)
  const checkpointIncludesMigration = saved.checkpoint && legacyEventIndexes.some(
    (index) => index < saved.checkpoint!.historyLength,
  )
  const checkpoint = checkpointIncludesMigration && saved.checkpoint
    ? {
        ...saved.checkpoint,
        historyDigest: await digestHistory(history.slice(0, saved.checkpoint.historyLength)),
      }
    : saved.checkpoint

  return {
    ...saved,
    checkpoint,
    history,
    historyDigest,
  }
}

function isLegacyBook2LessathiRefusalEvent(event: GameHistoryEvent): boolean {
  return stableStringify(event) === stableStringify(BOOK2_LESSATHI_LEGACY_REFUSAL_EVENT)
}

export function findScene(context: StoryContext, sceneId: string): Scene {
  const chapterId = context.index.sceneToChapter[sceneId]
  const scene = chapterId ? context.chapters[chapterId]?.scenes[sceneId] : null
  if (!scene) {
    throw new Error(`Scene not loaded: ${sceneId}`)
  }
  return scene
}

function unlockSceneAchievements(context: StoryContext, scene: Scene, state: GameState) {
  for (const achievement of scene.achievements) {
    if (Number(state.variables[achievement.variable] ?? 0) === 1) {
      state.achievements[achievement.variable] = true
    }
  }
  for (const achievement of context.achievements.achievements) {
    if (Number(state.variables[achievement.variable] ?? 0) === 1) {
      state.achievements[achievement.variable] = true
    }
  }
}

function unlockedAchievementDefinitions(context: StoryContext, state: GameState): AchievementDefinition[] {
  return context.achievements.achievements.filter((achievement) => state.achievements[achievement.variable])
}

function snapshotCheckpoint(state: GameState) {
  return {
    currentSceneId: state.currentSceneId,
    variables: { ...state.variables },
    achievements: { ...state.achievements },
    historyLength: state.history.length,
    historyDigest: state.historyDigest,
  }
}

function markDebugState(state: GameState, lastAction: string): GameState {
  const now = new Date().toISOString()
  return {
    ...cloneState(state),
    debug: {
      dirty: true,
      lastAction,
      updatedAt: now,
    },
    updatedAt: now,
  }
}

function cloneState(state: GameState): GameState {
  return {
    ...state,
    variables: { ...state.variables },
    achievements: { ...state.achievements },
    checkpoint: state.checkpoint ? {
      currentSceneId: state.checkpoint.currentSceneId,
      variables: { ...state.checkpoint.variables },
      achievements: { ...state.checkpoint.achievements },
      historyLength: state.checkpoint.historyLength,
      historyDigest: state.checkpoint.historyDigest,
    } : null,
    history: state.history.map(cloneHistoryEvent),
    debug: state.debug ? { ...state.debug } : undefined,
  }
}

function applyVariableAssignment(variables: Record<string, PrimitiveValue>, assignment: VariableAssignment) {
  if (assignment.mode === 'add') {
    if (typeof assignment.value !== 'number' || !Number.isFinite(assignment.value)) {
      throw new Error(`Cannot add non-numeric value to ${assignment.variable}`)
    }
    variables[assignment.variable] = readNumericVariable(variables, assignment.variable) + assignment.value
    return
  }
  variables[assignment.variable] = assignment.value
}

function normalizeStatAllocationDeltas(deltas: StatAllocationDelta[]) {
  const merged = new Map<string, number>()
  for (const delta of deltas) {
    if (!Number.isInteger(delta.amount) || delta.amount <= 0) {
      throw new Error('Stat allocation must use positive whole points')
    }
    merged.set(delta.variable, (merged.get(delta.variable) ?? 0) + delta.amount)
  }
  return [...merged.entries()].map(([variable, amount]) => ({ variable, amount }))
}

function isHistoryEvent(event: unknown): event is GameHistoryEvent {
  if (!event || typeof event !== 'object') {
    return false
  }
  const candidate = event as Partial<GameHistoryEvent>
  if (candidate.type === 'choice') {
    return typeof candidate.sceneId === 'string' &&
      typeof candidate.choiceId === 'string' &&
      typeof candidate.target === 'string' &&
      Array.isArray(candidate.assignments)
  }
  if (candidate.type === 'stats') {
    return typeof candidate.sceneId === 'string' &&
      Array.isArray(candidate.deltas) &&
      Array.isArray(candidate.assignments)
  }
  return false
}

function cloneHistoryEvent(event: GameHistoryEvent): GameHistoryEvent {
  if (event.type === 'stats') {
    return {
      ...event,
      deltas: event.deltas.map((delta) => ({ ...delta })),
      assignments: event.assignments.map(cloneAssignment),
    }
  }
  return {
    ...event,
    assignments: event.assignments.map(cloneAssignment),
  }
}

function cloneAssignment(assignment: VariableAssignment): VariableAssignment {
  return { ...assignment }
}

function stableVariablesEqual(a: Record<string, PrimitiveValue>, b: Record<string, PrimitiveValue>) {
  return JSON.stringify(sortObject(a)) === JSON.stringify(sortObject(b))
}

function stableAchievementsEqual(a: Record<string, true>, b: Record<string, true>) {
  return JSON.stringify(sortObject(a)) === JSON.stringify(sortObject(b))
}

function sortObject(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortObject)
  }
  if (!value || typeof value !== 'object') {
    return value
  }
  return Object.fromEntries(
    Object.keys(value as Record<string, unknown>)
      .sort()
      .map((key) => [key, sortObject((value as Record<string, unknown>)[key])]),
  )
}
