import type { PrimitiveValue } from './types'

export const STAT_LABELS: Record<string, string> = {
  v_strength: 'Strength',
  v_toughness: 'Toughness',
  v_agility: 'Speed',
  v_reflexes: 'Reflexes',
  v_hearing: 'Hearing',
  v_perception: 'Observation',
  v_ancient_languages: 'Ancient languages',
  v_combat_technique: 'Combat technique',
  v_premonition: 'Premonition',
  v_bluff: 'Bluff',
  v_magical_sense: 'Magical sense',
  v_aura_hardening: 'Aura hardening',
  v_magical_power: 'Magical power',
  v_magical_knowledge: 'Magical knowledge',
}

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

export function readStats(variables: Record<string, PrimitiveValue>, visibleVariables = Object.keys(STAT_LABELS)) {
  return visibleVariables.map((variable) => ({
    variable,
    label: STAT_LABELS[variable] ?? variable,
    value: Number(variables[variable] ?? 0),
  }))
}
