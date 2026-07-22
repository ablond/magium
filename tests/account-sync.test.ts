import { beforeEach, describe, expect, it, vi } from 'vitest'
import { storeAccountSession, markCloudSaveDeleted } from '../src/lib/account/storage'
import { synchronizeAccount } from '../src/lib/account/sync'
import { bytesToBase64 } from '../src/lib/storage/crypto'
import { loadAchievementProgress, recordAchievementUnlocks } from '../src/lib/storage/achievementProgress'
import { deleteSave, loadGameState, saveGameState } from '../src/lib/storage/saves'
import { createInitialState, enterCurrentScene } from '../src/lib/story/engine'
import type { StoryContext } from '../src/lib/story/types'

type MockStoreName = 'account' | 'achievementProgress' | 'keys' | 'saves'

const stores = vi.hoisted(() => ({
  account: new Map<string, unknown>(),
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
    idbDelete: async (storeName: MockStoreName, key: IDBValidKey) => store(storeName).delete(String(key)),
    idbGet: async (storeName: MockStoreName, key: IDBValidKey) => store(storeName).get(String(key)),
    idbPut: async (storeName: MockStoreName, value: { id?: string; slotId?: string }) => {
      const key = value.id ?? value.slotId
      if (!key) throw new Error('Missing mock key')
      store(storeName).set(key, value)
    },
    idbSet: async (storeName: MockStoreName, key: IDBValidKey, value: unknown) => {
      store(storeName).set(String(key), value)
    },
  }
})

const CONTENT_VERSION = 'content-v1'
const API_URL = 'https://accounts.example.test'
let remoteRecords: unknown[] = []

beforeEach(() => {
  for (const store of Object.values(stores)) store.clear()
  remoteRecords = []
  vi.stubGlobal('fetch', vi.fn(async (_url: string, options?: RequestInit) => {
    if ((options?.method ?? 'GET') === 'PUT') {
      remoteRecords = (JSON.parse(String(options?.body)) as { records: unknown[] }).records
    }
    return new Response(JSON.stringify({ records: remoteRecords }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    })
  }))
})

describe('account save synchronization', () => {
  it('uploads opaque encrypted saves and restores them on a fresh device', async () => {
    const context = makeContext()
    const now = '2026-07-22T10:00:00.000Z'
    const state = {
      ...enterCurrentScene(context, createInitialState(CONTENT_VERSION, 'en')),
      updatedAt: now,
    }
    await saveGameState(state)
    await recordAchievementUnlocks(['v_ac_secret'], CONTENT_VERSION)
    const session = await storeAccountSession({
      token: 'session-token',
      username: 'Barry',
      encryptionSalt: bytesToBase64(new Uint8Array(16).fill(7)),
      expiresAt: '2099-01-01T00:00:00.000Z',
    }, 'magium-secret')

    await synchronizeAccount(API_URL, session, replayOptions(context))

    const serialized = JSON.stringify(remoteRecords)
    expect(serialized).not.toContain('v_secret_progress')
    expect(serialized).not.toContain('v_ac_secret')
    expect(remoteRecords).toHaveLength(2)

    stores.saves.clear()
    stores.achievementProgress.clear()
    await synchronizeAccount(API_URL, session, replayOptions(context), { preferRemote: true })

    expect((await loadGameState('autosave'))?.variables.v_secret_progress).toBe(7)
    expect((await loadAchievementProgress()).achievements.v_ac_secret).toBe(true)
  })

  it('uploads a tombstone instead of resurrecting a deleted named save', async () => {
    const context = makeContext()
    const state = {
      ...enterCurrentScene(context, createInitialState(CONTENT_VERSION, 'en', 'manual-test')),
      updatedAt: '2020-07-22T09:00:00.000Z',
    }
    await saveGameState(state, { label: 'Before the arena' })
    const session = await storeAccountSession({
      token: 'session-token',
      username: 'Daren',
      encryptionSalt: bytesToBase64(new Uint8Array(16).fill(4)),
      expiresAt: '2099-01-01T00:00:00.000Z',
    }, 'another-secret')
    await synchronizeAccount(API_URL, session, replayOptions(context))

    await deleteSave('manual-test')
    await markCloudSaveDeleted(session.username, 'manual-test')
    await synchronizeAccount(API_URL, session, replayOptions(context))

    expect(remoteRecords).toEqual(expect.arrayContaining([
      expect.objectContaining({ recordId: 'save:manual-test', deleted: true, encrypted: null }),
    ]))
  })
})

function replayOptions(context: StoryContext) {
  return {
    contentVersion: CONTENT_VERSION,
    contextForScene: async () => context,
  }
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
            setVariables: [{
              id: 'enter-progress',
              variable: 'v_secret_progress',
              mode: 'set',
              value: 7,
              conditions: null,
            }],
            achievements: [],
          },
        },
      },
    },
    locales: { ch1: { locale: 'en', chapterId: 'ch1', messages: {} } },
    achievements: { formatVersion: 1, achievements: [] },
    achievementLocale: { locale: 'en', messages: {} },
    statsLocale: { locale: 'en', messages: {} },
  }
}
