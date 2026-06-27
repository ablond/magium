import { CONTENT_PACKAGE_LOADERS, type ContentPackageKey } from '../../generated/contentPacks'
import type {
  AchievementCatalog,
  ContentIndex,
  LocaleBundle,
  LocaleCode,
  StoryChapter,
  StoryContext,
} from '../story/types'

const cache = new Map<string, unknown>()

export async function loadIndex(): Promise<ContentIndex> {
  return loadPackage('index')
}

export async function loadAchievements(): Promise<AchievementCatalog> {
  return loadPackage('achievements')
}

export async function loadAchievementLocale(locale: LocaleCode): Promise<LocaleBundle> {
  const base = await loadPackage<LocaleBundle>('locales/en/achievements')
  const localeKey = `locales/${locale}/achievements` as ContentPackageKey
  if (locale !== 'en' && localeKey in CONTENT_PACKAGE_LOADERS) {
    return mergeLocaleBundles(base, await loadPackage(localeKey), locale)
  }
  return base
}

export async function loadStatsLocale(locale: LocaleCode): Promise<LocaleBundle> {
  const base = await loadPackage<LocaleBundle>('locales/en/stats' as ContentPackageKey)
  const localeKey = `locales/${locale}/stats` as ContentPackageKey
  if (locale !== 'en' && localeKey in CONTENT_PACKAGE_LOADERS) {
    return mergeLocaleBundles(base, await loadPackage(localeKey), locale)
  }
  return base
}

export async function loadUiLocale(locale: LocaleCode): Promise<LocaleBundle> {
  const localeKey = `locales/${locale}/ui` as ContentPackageKey
  if (localeKey in CONTENT_PACKAGE_LOADERS) {
    return loadPackage(localeKey)
  }
  return loadPackage('locales/en/ui' as ContentPackageKey)
}

export async function loadStoryChapter(chapterId: string): Promise<StoryChapter> {
  return loadPackage(`story/${chapterId}` as ContentPackageKey)
}

export async function loadLocaleChapter(chapterId: string, locale: LocaleCode): Promise<LocaleBundle> {
  const localeKey = `locales/${locale}/${chapterId}` as ContentPackageKey
  if (localeKey in CONTENT_PACKAGE_LOADERS) {
    return loadPackage(localeKey)
  }
  return loadPackage(`locales/en/${chapterId}` as ContentPackageKey)
}

export async function loadContextForScene(
  sceneId: string,
  locale: LocaleCode,
  previous?: StoryContext,
): Promise<StoryContext> {
  const index = previous?.index ?? await loadIndex()
  const chapterId = index.sceneToChapter[sceneId]
  if (!chapterId) {
    throw new Error(`Unknown scene ${sceneId}`)
  }

  const chapters = { ...(previous?.chapters ?? {}) }
  const canReuseLocaleBundles = previous?.locale === locale
  const locales = canReuseLocaleBundles ? { ...(previous?.locales ?? {}) } : {}
  if (!chapters[chapterId]) {
    chapters[chapterId] = await loadStoryChapter(chapterId)
  }
  if (!locales[chapterId]) {
    locales[chapterId] = await loadLocaleChapter(chapterId, locale)
  }

  return {
    locale,
    index,
    chapters,
    locales,
    achievements: previous?.achievements ?? await loadAchievements(),
    achievementLocale: canReuseLocaleBundles && previous?.achievementLocale
      ? previous.achievementLocale
      : await loadAchievementLocale(locale),
    statsLocale: canReuseLocaleBundles && previous?.statsLocale
      ? previous.statsLocale
      : await loadStatsLocale(locale),
  }
}

export function mergeLocaleBundles(base: LocaleBundle, override: LocaleBundle, locale: LocaleCode): LocaleBundle {
  return {
    ...base,
    locale,
    messages: {
      ...base.messages,
      ...override.messages,
    },
  }
}

async function loadPackage<T>(key: ContentPackageKey): Promise<T> {
  if (cache.has(key)) {
    return cache.get(key) as T
  }
  const loader = CONTENT_PACKAGE_LOADERS[key]
  if (!loader) {
    throw new Error(`Missing content package ${key}`)
  }
  const pack = await loader()
  const compressed = base64ToBytes(pack.data)
  const actualHash = await sha256Hex(compressed)
  if (actualHash !== pack.sha256) {
    throw new Error(`Content package integrity check failed for ${key}`)
  }
  const jsonBytes = await gunzip(compressed)
  const parsed = JSON.parse(new TextDecoder().decode(jsonBytes)) as T
  cache.set(key, parsed)
  return parsed
}

function base64ToBytes(value: string): Uint8Array {
  const binary = atob(value)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i)
  }
  return bytes
}

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', toArrayBuffer(bytes))
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('')
}

async function gunzip(bytes: Uint8Array): Promise<Uint8Array> {
  if (!('DecompressionStream' in globalThis)) {
    throw new Error('This browser does not support runtime content decompression')
  }
  const stream = new Blob([toArrayBuffer(bytes)]).stream().pipeThrough(new DecompressionStream('gzip'))
  return new Uint8Array(await new Response(stream).arrayBuffer())
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer
}
