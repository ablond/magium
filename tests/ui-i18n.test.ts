import { describe, expect, it } from 'vitest'
import { formatUiMessage, resolveUiLocale, translateUi } from '../src/lib/i18n/ui'

describe('UI i18n', () => {
  it('prefers saved locale before browser locale', () => {
    expect(resolveUiLocale('en', ['fr-FR'], ['en', 'fr'])).toBe('en')
    expect(resolveUiLocale('fr', ['en-US'], ['en', 'fr'])).toBe('fr')
  })

  it('falls back from browser regional locale to supported base locale', () => {
    expect(resolveUiLocale(null, ['fr-FR', 'en-US'], ['en', 'fr'])).toBe('fr')
    expect(resolveUiLocale('es', ['de-DE'], ['en', 'fr'])).toBe('en')
  })

  it('interpolates known placeholders and leaves unknown placeholders intact', () => {
    expect(formatUiMessage('Saved {slotId} in {place}', { slotId: 'manual-1' })).toBe('Saved manual-1 in {place}')
    expect(translateUi({ saved: '{slotId} saved' }, 'saved', { slotId: 'manual-1' })).toBe('manual-1 saved')
    expect(translateUi({}, 'missing', {}, 'Fallback {value}')).toBe('Fallback {value}')
  })
})
