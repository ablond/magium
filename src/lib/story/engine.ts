import { evaluateCondition } from './conditions'
import { extendHistoryDigest, INITIAL_HISTORY_DIGEST } from './digest'
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

export async function applyChoice(context: StoryContext, state: GameState, choice: Choice): Promise<GameState> {
  const currentRendered = renderCurrentScene(context, state)
  if (!currentRendered.choices.some((visibleChoice) => visibleChoice.id === choice.id)) {
    throw new Error('Choice is not available from the current state')
  }

  if (choice.special === 'restart') {
    return enterCurrentScene(context, createInitialState(state.contentVersion, state.locale, state.slotId))
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
  let context = await contextForScene('Ch1-Intro1')
  let state = enterCurrentScene(context, createInitialState(saved.contentVersion, saved.locale, saved.slotId))

  for (const event of saved.history) {
    if (!isHistoryEvent(event)) {
      return false
    }
    if (state.currentSceneId !== event.sceneId) {
      return false
    }
    if (event.type === 'stats') {
      try {
        state = await applyStatAllocation(state, event.deltas)
      } catch {
        return false
      }
      continue
    }
    context = await contextForScene(state.currentSceneId)
    const rendered = renderCurrentScene(context, state)
    const choice = rendered.choices.find((candidate) => candidate.id === event.choiceId)
    if (!choice) {
      return false
    }
    if (choice.target) {
      context = await contextForScene(choice.target)
    }
    state = await applyChoice(context, state, choice)
  }

  return state.currentSceneId === saved.currentSceneId &&
    state.historyDigest === saved.historyDigest &&
    stableVariablesEqual(state.variables, saved.variables) &&
    stableAchievementsEqual(state.achievements, saved.achievements)
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
