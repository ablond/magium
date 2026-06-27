import type { PrimitiveValue } from './types'

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
]

export const AURA_STAT_VARIABLES = [
  'v_bluff',
  'v_magical_sense',
  'v_aura_hardening',
]

export function statMessageId(variable: string) {
  return `stat.${variable}`
}

export function readStats(
  variables: Record<string, PrimitiveValue>,
  messages: Record<string, string>,
  visibleVariables: readonly string[] = STAT_VARIABLES,
) {
  return visibleVariables.map((variable) => ({
    variable,
    label: messages[statMessageId(variable)] ?? variable,
    value: Number(variables[variable] ?? 0),
  }))
}
