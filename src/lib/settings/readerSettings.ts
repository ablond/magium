import { resolveUiLocale } from '../i18n/ui'
import type { Settings as ReaderSettings } from '../story/types'

export const defaultReaderSettings: ReaderSettings = {
  theme: 'dark',
  textScale: 1,
  highContrast: false,
  typewriter: false,
  illustrations: true,
  locale: 'en',
  uiLocale: 'en',
}

export function migrateReaderSettings(
  stored: Partial<ReaderSettings>,
  browserLanguages: readonly string[],
): ReaderSettings {
  const migratedUiLocale = typeof stored.uiLocale === 'string'
    ? stored.uiLocale
    : typeof stored.locale === 'string'
      ? stored.locale
      : undefined
  const locale = resolveUiLocale(migratedUiLocale, browserLanguages)

  return {
    ...defaultReaderSettings,
    ...stored,
    illustrations: typeof stored.illustrations === 'boolean' ? stored.illustrations : defaultReaderSettings.illustrations,
    locale,
    uiLocale: locale,
  }
}
