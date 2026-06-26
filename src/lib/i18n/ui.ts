import type { LocaleCode } from '../story/types'

export const FALLBACK_UI_LOCALE = 'en'
export const DEFAULT_UI_LOCALES = ['en', 'fr']

export type UiMessageParams = Record<string, string | number | boolean>

export function resolveUiLocale(
  preferred: LocaleCode | null | undefined,
  browserLanguages: readonly string[],
  availableLocales: readonly LocaleCode[] = DEFAULT_UI_LOCALES,
  fallback: LocaleCode = FALLBACK_UI_LOCALE,
): LocaleCode {
  const available = normalizeAvailableLocales(availableLocales)
  const preferredMatch = matchLocale(preferred, available)
  if (preferredMatch) return preferredMatch

  for (const language of browserLanguages) {
    const browserMatch = matchLocale(language, available)
    if (browserMatch) return browserMatch
  }

  return available.has(fallback) ? fallback : [...available][0] ?? fallback
}

export function translateUi(
  messages: Record<string, string>,
  key: string,
  params: UiMessageParams = {},
  fallback?: string,
): string {
  return formatUiMessage(messages[key] ?? fallback ?? `[${key}]`, params)
}

export function formatUiMessage(template: string, params: UiMessageParams = {}): string {
  return template.replace(/\{([A-Za-z0-9_.-]+)\}/g, (match, key: string) => {
    const value = params[key]
    return value === undefined ? match : String(value)
  })
}

function normalizeAvailableLocales(locales: readonly LocaleCode[]) {
  return new Set(locales.map((locale) => locale.toLowerCase()))
}

function matchLocale(locale: LocaleCode | null | undefined, available: Set<string>): LocaleCode | null {
  if (!locale) return null
  const normalized = locale.toLowerCase()
  if (available.has(normalized)) return normalized

  const base = normalized.split('-')[0]
  return available.has(base) ? base : null
}
