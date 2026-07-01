import { resolveUiLocale } from '../i18n/ui'
import type { Settings as ReaderSettings } from '../story/types'

export const defaultReaderSettings: ReaderSettings = {
  theme: 'dark',
  textScale: 1,
  highContrast: false,
  illustrations: true,
  locale: 'en',
  uiLocale: 'en',
}

type LegacyReaderSettings = Partial<ReaderSettings> & {
  typewriter?: unknown
}

export function migrateReaderSettings(
  stored: Partial<ReaderSettings>,
  browserLanguages: readonly string[],
): ReaderSettings {
  const sanitized = { ...(stored as LegacyReaderSettings) }
  delete sanitized.typewriter
  const migratedUiLocale = typeof stored.uiLocale === 'string'
    ? stored.uiLocale
    : typeof stored.locale === 'string'
      ? stored.locale
      : undefined
  const locale = resolveUiLocale(migratedUiLocale, browserLanguages)

  return {
    ...defaultReaderSettings,
    ...sanitized,
    illustrations: typeof stored.illustrations === 'boolean' ? stored.illustrations : defaultReaderSettings.illustrations,
    locale,
    uiLocale: locale,
  }
}
