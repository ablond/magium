import { describe, expect, it } from 'vitest'
import { migrateReaderSettings } from '../src/lib/settings/readerSettings'

describe('reader settings migration', () => {
  it('enables illustrations, keeps contribution controls hidden, and drops legacy scene reveal settings when migrating older saved settings', () => {
    const migrated = migrateReaderSettings({ locale: 'fr', typewriter: true } as Parameters<typeof migrateReaderSettings>[0] & { typewriter: boolean }, ['en-US'])

    expect(migrated).toMatchObject({
      locale: 'fr',
      uiLocale: 'fr',
      illustrations: true,
      translationContributions: false,
    })
    expect(migrated).not.toHaveProperty('typewriter')
  })

  it('preserves an explicit illustrations toggle value', () => {
    expect(migrateReaderSettings({ locale: 'en', illustrations: false }, ['fr-FR'])).toMatchObject({
      locale: 'en',
      uiLocale: 'en',
      illustrations: false,
    })
  })

  it('preserves an explicit translation contribution toggle value', () => {
    expect(migrateReaderSettings({ locale: 'en', translationContributions: true }, ['fr-FR'])).toMatchObject({
      locale: 'en',
      uiLocale: 'en',
      translationContributions: true,
    })

    expect(migrateReaderSettings({ locale: 'en', translationContributions: false }, ['fr-FR'])).toMatchObject({
      locale: 'en',
      uiLocale: 'en',
      translationContributions: false,
    })
  })
})
