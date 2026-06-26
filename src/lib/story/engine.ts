import { evaluateCondition } from './conditions'
import { extendHistoryDigest, INITIAL_HISTORY_DIGEST } from './digest'
import type {
  AchievementDefinition,
  Choice,
  ChoiceHistoryEvent,
  GameState,
  PrimitiveValue,
  RenderedScene,
  Scene,
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
      next.variables[assignment.variable] = assignment.value
    }
  }
  unlockSceneAchievements(context, scene, next)
  next.updatedAt = new Date().toISOString()
  return next
}

export function renderCurrentScene(context: StoryContext, state: GameState): RenderedScene {
  const scene = findScene(context, state.currentSceneId)
  const locale = context.locales[context.index.sceneToChapter[state.currentSceneId]]
  const paragraphs = scene.blocks
    .filter((block) => evaluateCondition(block.conditions, state.variables))
    .map((block) => ({ id: block.id, text: locale.messages[block.messageId] ?? `[${block.messageId}]` }))
  const choices = scene.choices
    .filter((choice) => evaluateCondition(choice.conditions, state.variables))
    .map((choice) => ({ ...choice, text: locale.messages[choice.messageId] ?? `[${choice.messageId}]` }))

  return {
    scene,
    paragraphs,
    choices,
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
    next.variables[assignment.variable] = assignment.value
  }

  const event: ChoiceHistoryEvent = {
    sceneId: state.currentSceneId,
    choiceId: choice.id,
    target: choice.target,
    special: choice.special,
    assignments: choice.setVariables,
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

export function restoreCheckpoint(context: StoryContext, state: GameState): GameState {
  if (!state.checkpoint) {
    return state
  }
  return enterCurrentScene(context, {
    ...cloneState(state),
    currentSceneId: state.checkpoint.currentSceneId,
    variables: { ...state.checkpoint.variables },
    achievements: { ...state.checkpoint.achievements },
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
    if (state.currentSceneId !== event.sceneId) {
      return false
    }
    context = await contextForScene(state.currentSceneId)
    const rendered = renderCurrentScene(context, state)
    const choice = rendered.choices.find((candidate) => candidate.id === event.choiceId)
    if (!choice) {
      return false
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
      historyDigest: state.checkpoint.historyDigest,
    } : null,
    history: state.history.map((event) => ({
      ...event,
      assignments: event.assignments.map((assignment) => ({ ...assignment })),
    })),
  }
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
