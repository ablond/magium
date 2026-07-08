import { beforeEach, describe, expect, it, vi } from 'vitest'
import { applyChoice, createInitialState, enterCurrentScene, renderCurrentScene } from '../src/lib/story/engine'
import type { StoryContext } from '../src/lib/story/types'
import { encryptJson, getLocalSaveKey } from '../src/lib/storage/crypto'
import { exportSave, importSave, listSaveSummaries, loadGameState, renameSave, saveGameState, SAVE_IMPORT_ERROR_MESSAGES } from '../src/lib/storage/saves'

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
      chapters: [{ id: 'ch1', key: 'b1ch1', sourceFile: 'chapters/ch1.magium', sceneCount: 2 }],
      sceneToChapter: { 'Ch1-Intro1': 'ch1', 'Ch1-Checkpoint': 'ch1' },
    },
    locale: 'en',
    chapters: {
      ch1: {
        formatVersion: 1,
        chapterId: 'ch1',
        sourceFile: 'chapters/ch1.magium',
        sceneOrder: ['Ch1-Intro1', 'Ch1-Checkpoint'],
        scenes: {
          'Ch1-Intro1': {
            id: 'Ch1-Intro1',
            blocks: [],
            choices: [{
              id: 'c-checkpoint',
              messageId: 'choice.checkpoint',
              target: 'Ch1-Checkpoint',
              setVariables: [{ variable: 'v_checkpoint_route', mode: 'set', value: 1 }],
              special: 'checkpoint_save',
              conditions: null,
            }],
            setVariables: [],
            achievements: [],
          },
          'Ch1-Checkpoint': {
            id: 'Ch1-Checkpoint',
            blocks: [],
            choices: [],
            setVariables: [{
              id: 'enter-checkpoint',
              variable: 'v_checkpoint_entered',
              mode: 'set',
              value: 1,
              conditions: null,
            }],
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

function makeState(contentVersion = CONTENT_VERSION) {
  return enterCurrentScene(makeContext(), createInitialState(contentVersion, 'en'))
}

async function makeCheckpointState(contentVersion = CONTENT_VERSION) {
  const context = makeContext()
  const initial = enterCurrentScene(context, createInitialState(contentVersion, 'en'))
  const checkpointChoice = renderCurrentScene(context, initial).choices.find((choice) => choice.id === 'c-checkpoint')
  if (!checkpointChoice) {
    throw new Error('Expected checkpoint choice')
  }
  return applyChoice(context, initial, checkpointChoice)
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

  it('rejects export without a passphrase', async () => {
    await expect(exportSave(makeState(), ''))
      .rejects.toThrow(SAVE_IMPORT_ERROR_MESSAGES.exportPasswordRequired)
  })

  it('rejects legacy local-key backups after the source browser key is gone', async () => {
    const key = await getLocalSaveKey()
    const raw = JSON.stringify({
      kind: 'magium-save',
      version: 1,
      encryption: 'local-key',
      associatedData: 'magium-save-v1',
      encrypted: await encryptJson(makeState(), key, 'magium-save-v1'),
    })
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

  it('imports a replay-compatible save from an older content version and stores the current version', async () => {
    const raw = await exportSave(makeState('content-v0'), 'portable-secret')
    resetStorage()

    const imported = await importSave(raw, 'portable-secret', 'content-v2', contextForScene)
    const stored = await loadGameState('autosave')

    expect(imported.contentVersion).toBe('content-v2')
    expect(stored?.contentVersion).toBe('content-v2')
  })

  it('rejects an older content-version save when replay cannot reproduce the decrypted state', async () => {
    const state = makeState('content-v0')
    const raw = await exportSave({
      ...state,
      variables: {
        ...state.variables,
        v_strength: 99,
      },
    }, 'portable-secret')
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

  it('rebuilds imported checkpoints from replay instead of trusting the decrypted payload', async () => {
    const state = await makeCheckpointState('content-v0')
    const raw = await exportSave({
      ...state,
      checkpoint: state.checkpoint
        ? {
            ...state.checkpoint,
            currentSceneId: 'Ch1-Intro1',
            variables: { v_current_scene: 'Ch1-Intro1', v_strength: 99 },
            historyLength: 0,
            historyDigest: 'tampered-checkpoint',
          }
        : null,
    }, 'portable-secret')
    resetStorage()

    const imported = await importSave(raw, 'portable-secret', 'content-v2', contextForScene)

    expect(imported.contentVersion).toBe('content-v2')
    expect(imported.currentSceneId).toBe('Ch1-Checkpoint')
    expect(imported.variables.v_checkpoint_entered).toBe(1)
    expect(imported.checkpoint).toMatchObject({
      currentSceneId: 'Ch1-Checkpoint',
      historyLength: 1,
    })
    expect(imported.checkpoint?.variables.v_strength).toBeUndefined()
    expect(imported.checkpoint?.historyDigest).not.toBe('tampered-checkpoint')
  })

  it('rejects export for debug-dirty local states', async () => {
    await expect(exportSave({
      ...makeState(),
      debug: {
        dirty: true,
        lastAction: 'Set v_strength',
        updatedAt: new Date().toISOString(),
      },
    }, 'portable-secret')).rejects.toThrow(SAVE_IMPORT_ERROR_MESSAGES.debug)
  })

  it('rejects imported debug-dirty payloads before storing them', async () => {
    const key = await getLocalSaveKey()
    const state = {
      ...makeState(),
      debug: {
        dirty: true as const,
        lastAction: 'Jumped to Ch2-DebugSet',
        updatedAt: new Date().toISOString(),
      },
    }
    const raw = JSON.stringify({
      kind: 'magium-save',
      version: 1,
      encryption: 'local-key',
      associatedData: 'magium-save-v1',
      encrypted: await encryptJson(state, key, 'magium-save-v1'),
    })

    await expect(importSave(raw, '', CONTENT_VERSION, contextForScene))
      .rejects.toThrow(SAVE_IMPORT_ERROR_MESSAGES.debug)
    expect(stores.saves.size).toBe(0)
  })

  it('rejects malformed files', async () => {
    await expect(importSave('not json', '', CONTENT_VERSION, contextForScene))
      .rejects.toThrow(SAVE_IMPORT_ERROR_MESSAGES.unsupported)
  })

  it('lists save summaries with display labels and decrypted scene metadata', async () => {
    await saveGameState({
      ...makeState(),
      slotId: 'manual-test',
    }, { label: 'Before the duel' })

    const summaries = await listSaveSummaries()

    expect(summaries).toHaveLength(1)
    expect(summaries[0]).toMatchObject({
      slotId: 'manual-test',
      label: 'Before the duel',
      currentSceneId: 'Ch1-Intro1',
      contentVersion: CONTENT_VERSION,
    })
  })

  it('loads and upgrades a compatible older local autosave', async () => {
    await saveGameState(makeState('content-v0'))

    const loaded = await loadGameState('autosave', { contentVersion: 'content-v2', contextForScene })
    const summaries = await listSaveSummaries()

    expect(loaded?.contentVersion).toBe('content-v2')
    expect(summaries[0]).toMatchObject({
      slotId: 'autosave',
      contentVersion: 'content-v2',
      currentSceneId: 'Ch1-Intro1',
    })
  })

  it('loads and upgrades a compatible older named local save', async () => {
    await saveGameState({
      ...makeState('content-v0'),
      slotId: 'manual-test',
    }, { label: 'Before the duel' })

    const loaded = await loadGameState('manual-test', { contentVersion: 'content-v2', contextForScene })
    const summaries = await listSaveSummaries()

    expect(loaded?.contentVersion).toBe('content-v2')
    expect(summaries[0]).toMatchObject({
      slotId: 'manual-test',
      label: 'Before the duel',
      contentVersion: 'content-v2',
      currentSceneId: 'Ch1-Intro1',
    })
  })

  it('renames a local save without changing the encrypted game state', async () => {
    await saveGameState({
      ...makeState(),
      slotId: 'manual-test',
    }, { label: 'Before the duel' })

    await renameSave('manual-test', 'After the duel')

    const summaries = await listSaveSummaries()
    expect(summaries[0].label).toBe('After the duel')
    expect(summaries[0].currentSceneId).toBe('Ch1-Intro1')
  })
})
