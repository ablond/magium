import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createInitialState, enterCurrentScene } from '../src/lib/story/engine'
import type { AchievementDefinition, StoryContext } from '../src/lib/story/types'
import {
  filterNewAchievementUnlocks,
  loadAchievementProgress,
  mergeAchievementProgressFromState,
  recordAchievementUnlocks,
} from '../src/lib/storage/achievementProgress'
import { saveGameState } from '../src/lib/storage/saves'

type MockStoreName = 'achievementProgress' | 'keys' | 'saves'

const stores = vi.hoisted(() => ({
  achievementProgress: new Map<string, unknown>(),
  keys: new Map<string, unknown>(),
  saves: new Map<string, unknown>(),
}))

vi.mock('../src/lib/storage/idb', () => {
  function store(storeName: MockStoreName) {
    return stores[storeName]
  }

  return {
    idbAll: async (storeName: MockStoreName) => Array.from(store(storeName).values()),
    idbDelete: async (storeName: MockStoreName, key: IDBValidKey) => {
      store(storeName).delete(String(key))
    },
    idbGet: async (storeName: MockStoreName, key: IDBValidKey) => store(storeName).get(String(key)),
    idbPut: async (storeName: MockStoreName, value: { id?: string; slotId?: string }) => {
      const key = value.id ?? value.slotId
      if (!key) throw new Error('Missing mock IDB key')
      store(storeName).set(key, value)
    },
    idbSet: async (storeName: MockStoreName, key: IDBValidKey, value: unknown) => {
      store(storeName).set(String(key), value)
    },
  }
})

const CONTENT_VERSION = 'content-v1'

const startAchievement: AchievementDefinition = {
  id: 'v_ac_start',
  variable: 'v_ac_start',
  chapterKey: 'b1ch1',
  titleMessageId: 'achievement.v_ac_start.title',
  captionMessageId: 'achievement.v_ac_start.caption',
}

const deathAchievement: AchievementDefinition = {
  id: 'v_ac_death',
  variable: 'v_ac_death',
  chapterKey: 'b1ch1',
  titleMessageId: 'achievement.v_ac_death.title',
  captionMessageId: 'achievement.v_ac_death.caption',
}

function makeContext(): StoryContext {
  return {
    index: {
      formatVersion: 1,
      contentVersion: CONTENT_VERSION,
      sourceCommit: 'test',
      defaultLocale: 'en',
      initialSceneId: 'Ch1-Intro1',
      uiLocales: ['en'],
      storyLocales: ['en'],
      chapters: [{ id: 'ch1', key: 'b1ch1', sourceFile: 'chapters/ch1.magium', sceneCount: 1 }],
      sceneToChapter: { 'Ch1-Intro1': 'ch1' },
    },
    locale: 'en',
    chapters: {
      ch1: {
        formatVersion: 1,
        chapterId: 'ch1',
        sourceFile: 'chapters/ch1.magium',
        sceneOrder: ['Ch1-Intro1'],
        scenes: {
          'Ch1-Intro1': {
            id: 'Ch1-Intro1',
            blocks: [],
            choices: [],
            setVariables: [],
            achievements: [],
          },
        },
      },
    },
    locales: {
      ch1: {
        locale: 'en',
        chapterId: 'ch1',
        messages: {},
      },
    },
    achievements: {
      formatVersion: 1,
      achievements: [startAchievement, deathAchievement],
    },
    achievementLocale: {
      locale: 'en',
      messages: {},
    },
    statsLocale: {
      locale: 'en',
      messages: {},
    },
  }
}

function makeState() {
  return enterCurrentScene(makeContext(), createInitialState(CONTENT_VERSION, 'en'))
}

function resetStorage() {
  stores.achievementProgress.clear()
  stores.keys.clear()
  stores.saves.clear()
}

describe('achievement progress storage', () => {
  beforeEach(() => {
    resetStorage()
  })

  it('keeps unlocked achievements outside a restarted game state', async () => {
    const progress = await recordAchievementUnlocks(['v_ac_start'], CONTENT_VERSION)
    const restarted = createInitialState(CONTENT_VERSION, 'en')

    expect(progress.achievements.v_ac_start).toBe(true)
    expect(restarted.achievements.v_ac_start).toBeUndefined()
    expect((await loadAchievementProgress()).achievements.v_ac_start).toBe(true)
  })

  it('filters already-global achievements from unlock notices', async () => {
    const progress = await recordAchievementUnlocks(['v_ac_start'], CONTENT_VERSION)

    expect(filterNewAchievementUnlocks(progress, [startAchievement])).toEqual([])
    expect(filterNewAchievementUnlocks(progress, [startAchievement, deathAchievement])).toEqual([deathAchievement])
  })

  it('does not expose achievement variable names in the IndexedDB record', async () => {
    await recordAchievementUnlocks(['v_ac_start'], CONTENT_VERSION)

    const record = stores.achievementProgress.get('global')

    expect(record).toMatchObject({ id: 'global', contentVersion: CONTENT_VERSION })
    expect(JSON.stringify(record)).not.toContain('v_ac_start')
  })

  it('migrates achievements from encrypted local saves and skips debug-dirty states', async () => {
    await saveGameState({
      ...makeState(),
      slotId: 'manual-clean',
      achievements: { v_ac_start: true },
    })
    await saveGameState({
      ...makeState(),
      slotId: 'manual-debug',
      achievements: { v_ac_death: true },
      debug: {
        dirty: true,
        lastAction: 'Set v_ac_death',
        updatedAt: new Date().toISOString(),
      },
    })

    const progress = await loadAchievementProgress()

    expect(progress.achievements.v_ac_start).toBe(true)
    expect(progress.achievements.v_ac_death).toBeUndefined()
  })

  it('does not merge achievements from debug-dirty states', async () => {
    const progress = await mergeAchievementProgressFromState({
      ...makeState(),
      achievements: { v_ac_death: true },
      debug: {
        dirty: true,
        lastAction: 'Set v_ac_death',
        updatedAt: new Date().toISOString(),
      },
    })

    expect(progress.achievements.v_ac_death).toBeUndefined()
    expect(stores.achievementProgress.size).toBe(0)
  })
})
