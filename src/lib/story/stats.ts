import type { AtomicCondition, ConditionExpression, GameState, PrimitiveValue, StatCheckResult } from './types'

export const STAT_VARIABLES = [
  'v_strength',
  'v_toughness',
  'v_agility',
  'v_reflexes',
  'v_hearing',
  'v_perception',
  'v_ancient_languages',
  'v_combat_technique',
  'v_premonition',
  'v_bluff',
  'v_magical_sense',
  'v_aura_hardening',
  'v_magical_power',
  'v_magical_knowledge',
] as const

export const BASE_STAT_VARIABLES = [
  'v_strength',
  'v_toughness',
  'v_agility',
  'v_reflexes',
  'v_hearing',
  'v_perception',
  'v_ancient_languages',
  'v_combat_technique',
  'v_premonition',
] as const

export const AURA_STAT_VARIABLES = [
  'v_bluff',
  'v_magical_sense',
  'v_aura_hardening',
] as const

export const ALLOCATABLE_STAT_VARIABLES = [
  ...BASE_STAT_VARIABLES,
  ...AURA_STAT_VARIABLES,
] as const

export const DEFAULT_MAX_STAT = 3
export const MAX_STAT_VARIABLE = 'v_max_stat'
export const AVAILABLE_POINTS_VARIABLE = 'v_available_points'
export const AVAILABLE_POINTS_AUX_VARIABLE = 'v_available_points_aux'

export type StatRow = {
  variable: string
  label: string
  value: number
  baseValue: number
  pending: number
  max: number
  overMax: boolean
}

export function statMessageId(variable: string) {
  return `stat.${variable}`
}

export function statAuxVariable(variable: string) {
  return `${variable}_aux`
}

export function isAllocatableStatVariable(variable: string): variable is typeof ALLOCATABLE_STAT_VARIABLES[number] {
  return (ALLOCATABLE_STAT_VARIABLES as readonly string[]).includes(variable)
}

export function readNumericVariable(variables: Record<string, PrimitiveValue>, variable: string) {
  const value = variables[variable]
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : 0
  }
  if (typeof value === 'string' && /^[-+]?\d+$/.test(value)) {
    return Number(value)
  }
  return 0
}

export function readStatMax(variables: Record<string, PrimitiveValue>) {
  const max = readNumericVariable(variables, MAX_STAT_VARIABLE)
  return max > 0 ? Math.floor(max) : DEFAULT_MAX_STAT
}

export function readAvailableStatPoints(variables: Record<string, PrimitiveValue>) {
  return Math.max(0, Math.floor(readNumericVariable(variables, AVAILABLE_POINTS_VARIABLE)))
}

export function revealedStatVariables(state: GameState) {
  const revealed = new Set<string>()
  const hasBaseStats = hasReachedScene(state, ['Ch2-Stats', 'Ch2-Stats-spent'])
  const hasAuraStats = hasReachedScene(state, ['B3-Ch04a-Introduction', 'B3-Ch04a-Introduction2', 'B3-Ch04a-Stats-spent'])
  if (hasBaseStats || hasAuraStats) {
    BASE_STAT_VARIABLES.forEach((variable) => revealed.add(variable))
  }
  if (hasAuraStats) {
    AURA_STAT_VARIABLES.forEach((variable) => revealed.add(variable))
  }
  return [...revealed]
}

export function isStatVisible(state: GameState, variable: string) {
  return revealedStatVariables(state).includes(variable)
}

export function readStats(
  variables: Record<string, PrimitiveValue>,
  messages: Record<string, string>,
  visibleVariables: readonly string[] = STAT_VARIABLES,
  draft: Record<string, number> = {},
): StatRow[] {
  const max = readStatMax(variables)
  return visibleVariables.map((variable) => ({
    variable,
    label: messages[statMessageId(variable)] ?? variable,
    value: readNumericVariable(variables, variable) + Math.max(0, Math.floor(draft[variable] ?? 0)),
    baseValue: readNumericVariable(variables, variable),
    pending: Math.max(0, Math.floor(draft[variable] ?? 0)),
    max,
    overMax: readNumericVariable(variables, variable) > max,
  }))
}

export function readStatCheckResults(
  primaryConditions: ConditionExpression[],
  fallbackConditions: ConditionExpression[],
  variables: Record<string, PrimitiveValue>,
  messages: Record<string, string>,
  hintConditions: ConditionExpression[] = [...primaryConditions, ...fallbackConditions],
): StatCheckResult[] {
  const thresholdHints = collectThresholdHints(hintConditions)
  const primary = collectStatCheckResults(primaryConditions, variables, messages, thresholdHints)
  return primary.length
    ? primary
    : collectStatCheckResults(fallbackConditions, variables, messages, thresholdHints)
}

function hasReachedScene(state: GameState, sceneIds: string[]) {
  const targets = new Set(sceneIds)
  return targets.has(state.currentSceneId) ||
    state.history.some((event) => {
      if (targets.has(event.sceneId)) {
        return true
      }
      return event.type === 'choice' && targets.has(event.target)
    })
}

function collectStatCheckResults(
  conditions: ConditionExpression[],
  variables: Record<string, PrimitiveValue>,
  messages: Record<string, string>,
  thresholdHints: Map<string, number>,
) {
  const results: StatCheckResult[] = []
  const seen = new Set<string>()
  for (const condition of conditions) {
    if (!condition) {
      continue
    }
    for (const group of condition.anyOf) {
      if (!group.allOf.every((atomic) => atomicMatches(atomic, variables))) {
        continue
      }
      for (const atomic of group.allOf) {
        const result = statCheckFromAtomic(atomic, variables, messages, thresholdHints)
        if (!result) {
          continue
        }
        const key = `${result.variable}:${result.outcome}:${result.level}`
        if (seen.has(key)) {
          continue
        }
        seen.add(key)
        results.push(result)
      }
    }
  }
  return results
}

function collectThresholdHints(conditions: ConditionExpression[]) {
  const hints = new Map<string, number>()
  for (const condition of conditions) {
    if (!condition) {
      continue
    }
    for (const group of condition.anyOf) {
      for (const atomic of group.allOf) {
        const candidate = successLevelFromAtomic(atomic)
        if (!candidate) {
          continue
        }
        const current = hints.get(candidate.variable)
        if (!current || candidate.level < current) {
          hints.set(candidate.variable, candidate.level)
        }
      }
    }
  }
  return hints
}

function statCheckFromAtomic(
  condition: AtomicCondition,
  variables: Record<string, PrimitiveValue>,
  messages: Record<string, string>,
  thresholdHints: Map<string, number>,
): StatCheckResult | null {
  const success = successLevelFromAtomic(condition)
  if (success) {
    return buildStatCheckResult(success.variable, 'success', success.level, variables, messages)
  }

  const failure = failureLevelFromAtomic(condition, thresholdHints)
  if (failure) {
    return buildStatCheckResult(failure.variable, 'failure', failure.level, variables, messages)
  }

  return null
}

function successLevelFromAtomic(condition: AtomicCondition) {
  if (condition.type !== 'comparison' || !isStatVariable(condition.variable)) {
    return null
  }
  const expected = numericConditionValue(condition.value)
  if (expected === null) {
    return null
  }
  if ((condition.operator === '>=' || condition.operator === '==') && expected > 0) {
    return { variable: condition.variable, level: expected }
  }
  if (condition.operator === '>' && expected >= 0) {
    return { variable: condition.variable, level: expected + 1 }
  }
  return null
}

function failureLevelFromAtomic(condition: AtomicCondition, thresholdHints: Map<string, number>) {
  if (condition.type !== 'comparison' || !isStatVariable(condition.variable)) {
    return null
  }
  const expected = numericConditionValue(condition.value)
  if (expected === null) {
    return null
  }
  if (condition.operator === '<' && expected > 0) {
    return { variable: condition.variable, level: expected }
  }
  if (condition.operator === '<=' && expected >= 0) {
    return { variable: condition.variable, level: expected + 1 }
  }
  if (condition.operator === '==' && expected === 0) {
    const level = thresholdHints.get(condition.variable)
    return level ? { variable: condition.variable, level } : null
  }
  return null
}

function buildStatCheckResult(
  variable: string,
  outcome: StatCheckResult['outcome'],
  level: number,
  variables: Record<string, PrimitiveValue>,
  messages: Record<string, string>,
): StatCheckResult {
  return {
    variable,
    label: messages[statMessageId(variable)] ?? variable,
    outcome,
    level,
    actual: readNumericVariable(variables, variable),
  }
}

function atomicMatches(condition: AtomicCondition, variables: Record<string, PrimitiveValue>) {
  if (condition.type === 'true') {
    return true
  }
  if (condition.type === 'false') {
    return false
  }

  const actual = normalizeComparableValue(variables[condition.variable] ?? 0)
  const expected = normalizeComparableValue(condition.value)
  switch (condition.operator) {
    case '<':
      return Number(actual) < Number(expected)
    case '>':
      return Number(actual) > Number(expected)
    case '<=':
      return Number(actual) <= Number(expected)
    case '>=':
      return Number(actual) >= Number(expected)
    case '==':
      return actual == expected
    case '!=':
      return actual != expected
  }
}

function numericConditionValue(value: PrimitiveValue) {
  const normalized = normalizeComparableValue(value)
  if (typeof normalized !== 'number' || !Number.isFinite(normalized)) {
    return null
  }
  return normalized
}

function normalizeComparableValue(value: PrimitiveValue) {
  if (typeof value === 'string' && /^[-+]?\d+$/.test(value)) {
    return Number(value)
  }
  return value
}

function isStatVariable(variable: string) {
  return (STAT_VARIABLES as readonly string[]).includes(variable)
}
