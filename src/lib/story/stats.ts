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

export function readStats(variables: Record<string, PrimitiveValue>) {
  return Object.entries(STAT_LABELS).map(([variable, label]) => ({
    variable,
    label,
    value: Number(variables[variable] ?? 0),
  }))
}
