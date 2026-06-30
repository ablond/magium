import { describe, expect, it } from 'vitest'
import { migrateReaderSettings } from '../src/lib/settings/readerSettings'

describe('reader settings migration', () => {
  it('enables illustrations when migrating older saved settings', () => {
    expect(migrateReaderSettings({ locale: 'fr', typewriter: true }, ['en-US'])).toMatchObject({
      locale: 'fr',
      uiLocale: 'fr',
      typewriter: true,
      illustrations: true,
    })
  })

  it('preserves an explicit illustrations toggle value', () => {
    expect(migrateReaderSettings({ locale: 'en', illustrations: false }, ['fr-FR'])).toMatchObject({
      locale: 'en',
      uiLocale: 'en',
      illustrations: false,
    })
  })
})
