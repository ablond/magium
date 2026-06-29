import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createInitialState, enterCurrentScene } from '../src/lib/story/engine'
import type { StoryContext } from '../src/lib/story/types'
import { exportSave, importSave, SAVE_IMPORT_ERROR_MESSAGES } from '../src/lib/storage/saves'

const stores = vi.hoisted(() => ({
  keys: new Map<string, unknown>(),
  saves: new Map<string, unknown>(),
}))

vi.mock('../src/lib/storage/idb', () => {
  function store(storeName: 'keys' | 'saves') {
    return stores[storeName]
  }

  return {
    idbAll: async (storeName: 'keys' | 'saves') => Array.from(store(storeName).values()),
    idbDelete: async (storeName: 'keys' | 'saves', key: IDBValidKey) => {
      store(storeName).delete(String(key))
    },
    idbGet: async (storeName: 'keys' | 'saves', key: IDBValidKey) => store(storeName).get(String(key)),
    idbPut: async (storeName: 'keys' | 'saves', value: { slotId: string }) => {
      store(storeName).set(value.slotId, value)
    },
    idbSet: async (storeName: 'keys' | 'saves', key: IDBValidKey, value: unknown) => {
      store(storeName).set(String(key), value)
    },
  }
})

const CONTENT_VERSION = 'content-v1'

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
      achievements: [],
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

async function contextForScene() {
  return makeContext()
}

function resetStorage() {
  stores.keys.clear()
  stores.saves.clear()
}

describe('save export/import', () => {
  beforeEach(() => {
    resetStorage()
  })

  it('imports a passphrase-protected backup into a fresh browser store', async () => {
    const raw = await exportSave(makeState(), 'portable-secret')
    resetStorage()

    const imported = await importSave(raw, 'portable-secret', CONTENT_VERSION, contextForScene)

    expect(imported.currentSceneId).toBe('Ch1-Intro1')
    expect(stores.saves.has('autosave')).toBe(true)
  })

  it('rejects a local-key backup after the source browser key is gone', async () => {
    const raw = await exportSave(makeState(), '')
    resetStorage()

    await expect(importSave(raw, '', CONTENT_VERSION, contextForScene))
      .rejects.toThrow(SAVE_IMPORT_ERROR_MESSAGES.localOnly)
    expect(stores.saves.size).toBe(0)
  })

  it('rejects a passphrase backup without the right password', async () => {
    const raw = await exportSave(makeState(), 'portable-secret')
    resetStorage()

    await expect(importSave(raw, 'wrong-secret', CONTENT_VERSION, contextForScene))
      .rejects.toThrow(SAVE_IMPORT_ERROR_MESSAGES.passwordOrCorrupt)
    expect(stores.saves.size).toBe(0)
  })

  it('rejects a passphrase backup when the password is missing', async () => {
    const raw = await exportSave(makeState(), 'portable-secret')
    resetStorage()

    await expect(importSave(raw, '', CONTENT_VERSION, contextForScene))
      .rejects.toThrow(SAVE_IMPORT_ERROR_MESSAGES.passwordRequired)
    expect(stores.saves.size).toBe(0)
  })

  it('rejects a save from a different content version before storing it', async () => {
    const raw = await exportSave(makeState(), 'portable-secret')
    resetStorage()

    await expect(importSave(raw, 'portable-secret', 'content-v2', contextForScene))
      .rejects.toThrow(SAVE_IMPORT_ERROR_MESSAGES.contentVersion)
    expect(stores.saves.size).toBe(0)
  })

  it('rejects a decrypted save whose state does not replay cleanly', async () => {
    const state = makeState()
    const raw = await exportSave({
      ...state,
      variables: {
        ...state.variables,
        v_strength: 99,
      },
    }, 'portable-secret')
    resetStorage()

    await expect(importSave(raw, 'portable-secret', CONTENT_VERSION, contextForScene))
      .rejects.toThrow(SAVE_IMPORT_ERROR_MESSAGES.tamper)
    expect(stores.saves.size).toBe(0)
  })

  it('rejects malformed files', async () => {
    await expect(importSave('not json', '', CONTENT_VERSION, contextForScene))
      .rejects.toThrow(SAVE_IMPORT_ERROR_MESSAGES.unsupported)
  })
})
