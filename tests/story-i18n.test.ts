import { describe, expect, it } from 'vitest'
import { mergeLocaleBundles } from '../src/lib/content/packedContent'
import { readStats } from '../src/lib/story/stats'

describe('story i18n', () => {
  it('merges partial translated achievement bundles over English fallback', () => {
    const merged = mergeLocaleBundles(
      {
        locale: 'en',
        messages: {
          'achievement.v_ac_ch1_die.title': 'Off to a good start',
          'achievement.v_ac_ch2.title': 'Later',
        },
      },
      {
        locale: 'fr',
        messages: {
          'achievement.v_ac_ch1_die.title': 'Ça commence bien',
        },
      },
      'fr',
    )

    expect(merged.locale).toBe('fr')
    expect(merged.messages['achievement.v_ac_ch1_die.title']).toBe('Ça commence bien')
    expect(merged.messages['achievement.v_ac_ch2.title']).toBe('Later')
  })

  it('reads stat labels from the active story locale messages', () => {
    expect(readStats(
      { v_strength: 2, v_agility: 3 },
      {
        'stat.v_strength': 'Force',
        'stat.v_agility': 'Vitesse',
      },
      ['v_strength', 'v_agility'],
    )).toEqual([
      { variable: 'v_strength', label: 'Force', value: 2, baseValue: 2, pending: 0, max: 3, overMax: false },
      { variable: 'v_agility', label: 'Vitesse', value: 3, baseValue: 3, pending: 0, max: 3, overMax: false },
    ])
  })
})
