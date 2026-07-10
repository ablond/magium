import { beforeEach, describe, expect, it, vi } from 'vitest'
import { digestHistory } from '../src/lib/story/digest'
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
      chapters: [{ id: 'ch1', key: 'b1ch1', sourceFile: 'chapters/ch1.magium', sceneCount: 4 }],
      sceneToChapter: {
        'Ch1-Intro1': 'ch1',
        'Ch1-Checkpoint': 'ch1',
        'B2-Ch02a-Soundproof': 'ch1',
        'B2-Ch02a-Deal-conclusion': 'ch1',
      },
    },
    locale: 'en',
    chapters: {
      ch1: {
        formatVersion: 1,
        chapterId: 'ch1',
        sourceFile: 'chapters/ch1.magium',
        sceneOrder: [
          'Ch1-Intro1',
          'Ch1-Checkpoint',
          'B2-Ch02a-Soundproof',
          'B2-Ch02a-Deal-conclusion',
        ],
        scenes: {
          'Ch1-Intro1': {
            id: 'Ch1-Intro1',
            blocks: [],
            choices: [
              {
                id: 'c-checkpoint',
                messageId: 'choice.checkpoint',
                target: 'Ch1-Checkpoint',
                setVariables: [{ variable: 'v_checkpoint_route', mode: 'set', value: 1 }],
                special: 'checkpoint_save',
                conditions: null,
              },
              {
                id: 'c-lessathi-setup',
                messageId: 'choice.lessathiSetup',
                target: 'B2-Ch02a-Soundproof',
                setVariables: [{ variable: 'v_b2_ch2_tell_servant', mode: 'set', value: 1 }],
                special: null,
                conditions: null,
              },
            ],
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
          'B2-Ch02a-Soundproof': {
            id: 'B2-Ch02a-Soundproof',
            blocks: [],
            choices: [
              {
                id: 'B2-Ch02a-Soundproof:c1',
                messageId: 'choice.lessathiLie',
                target: 'B2-Ch02a-Deal-conclusion',
                setVariables: [
                  { variable: 'v_current_scene', mode: 'set', value: 'B2-Ch02a-Deal-conclusion' },
                  { variable: 'v_b2_ch2_deal', mode: 'set', value: 1 },
                ],
                special: null,
                conditions: null,
              },
              {
                id: 'B2-Ch02a-Soundproof:c3',
                messageId: 'choice.lessathiRefusal',
                target: 'B2-Ch02a-Deal-conclusion',
                setVariables: [
                  { variable: 'v_current_scene', mode: 'set', value: 'B2-Ch02a-Deal-conclusion' },
                  { variable: 'v_b2_ch2_deal', mode: 'set', value: 2 },
                ],
                special: null,
                conditions: {
                  raw: 'v_b2_ch2_tell_servant == 1',
                  anyOf: [{
                    allOf: [{
                      type: 'comparison',
                      variable: 'v_b2_ch2_tell_servant',
                      operator: '==',
                      value: 1,
                    }],
                  }],
                },
              },
            ],
            setVariables: [],
            achievements: [],
          },
          'B2-Ch02a-Deal-conclusion': {
            id: 'B2-Ch02a-Deal-conclusion',
            blocks: [],
            choices: [{
              id: 'c-checkpoint-after-deal',
              messageId: 'choice.checkpointAfterDeal',
              target: 'Ch1-Checkpoint',
              setVariables: [{ variable: 'v_checkpoint_route', mode: 'set', value: 2 }],
              special: 'checkpoint_save',
              conditions: null,
            }],
            setVariables: [{
              id: 'enter-deal-conclusion',
              variable: 'v_deal_conclusion_entered',
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

async function makeLessathiState(options: {
  contentVersion?: string
  legacyRefusal?: boolean
  checkpoint?: boolean
  slotId?: string
} = {}) {
  const context = makeContext()
  let state = enterCurrentScene(
    context,
    createInitialState(options.contentVersion ?? CONTENT_VERSION, 'en', options.slotId ?? 'autosave'),
  )
  const setupChoice = renderCurrentScene(context, state).choices.find((choice) => choice.id === 'c-lessathi-setup')
  if (!setupChoice) throw new Error('Expected lessathi setup choice')
  state = await applyChoice(context, state, setupChoice)

  const refusal = renderCurrentScene(context, state).choices.find(
    (choice) => choice.id === 'B2-Ch02a-Soundproof:c3',
  )
  if (!refusal) throw new Error('Expected lessathi refusal choice')
  const selectedChoice = options.legacyRefusal
    ? {
        ...refusal,
        setVariables: refusal.setVariables.map((assignment) =>
          assignment.variable === 'v_b2_ch2_deal' ? { ...assignment, value: 1 } : { ...assignment }
        ),
      }
    : refusal
  state = await applyChoice(context, state, selectedChoice)

  if (options.checkpoint) {
    const checkpointChoice = renderCurrentScene(context, state).choices.find(
      (choice) => choice.id === 'c-checkpoint-after-deal',
    )
    if (!checkpointChoice) throw new Error('Expected post-deal checkpoint choice')
    state = await applyChoice(context, state, checkpointChoice)
  }

  return state
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

  it('migrates the legacy false refusal to the equivalent lie choice on same-version import', async () => {
    const legacy = await makeLessathiState({ legacyRefusal: true })
    const legacyDigest = legacy.historyDigest
    const raw = await exportSave(legacy, 'portable-secret')
    resetStorage()

    const imported = await importSave(raw, 'portable-secret', CONTENT_VERSION, contextForScene)
    const stored = await loadGameState('autosave')

    expect(imported.currentSceneId).toBe(legacy.currentSceneId)
    expect(imported.variables).toEqual(legacy.variables)
    expect(imported.achievements).toEqual(legacy.achievements)
    expect(imported.variables.v_b2_ch2_deal).toBe(1)
    expect(imported.history[1]).toMatchObject({
      type: 'choice',
      sceneId: 'B2-Ch02a-Soundproof',
      choiceId: 'B2-Ch02a-Soundproof:c1',
      target: 'B2-Ch02a-Deal-conclusion',
      assignments: expect.arrayContaining([
        { variable: 'v_b2_ch2_deal', mode: 'set', value: 1 },
      ]),
    })
    expect(imported.historyDigest).not.toBe(legacyDigest)
    expect(stored?.history).toEqual(imported.history)
    expect(stored?.historyDigest).toBe(imported.historyDigest)
  })

  it('rebuilds a post-refusal checkpoint with the migrated history digest', async () => {
    const legacy = await makeLessathiState({ legacyRefusal: true, checkpoint: true })
    const legacyCheckpointDigest = legacy.checkpoint?.historyDigest
    const raw = await exportSave(legacy, 'portable-secret')
    resetStorage()

    const imported = await importSave(raw, 'portable-secret', 'content-v2', contextForScene)

    expect(imported.currentSceneId).toBe(legacy.currentSceneId)
    expect(imported.variables).toEqual(legacy.variables)
    expect(imported.checkpoint).not.toBeNull()
    expect(imported.checkpoint?.historyLength).toBe(3)
    expect(imported.checkpoint?.historyDigest).not.toBe(legacyCheckpointDigest)
    expect(imported.checkpoint?.historyDigest).toBe(
      await digestHistory(imported.history.slice(0, imported.checkpoint?.historyLength)),
    )
  })

  it('keeps a corrected refusal unchanged', async () => {
    const corrected = await makeLessathiState()
    const raw = await exportSave(corrected, 'portable-secret')
    resetStorage()

    const imported = await importSave(raw, 'portable-secret', CONTENT_VERSION, contextForScene)

    expect(imported.variables.v_b2_ch2_deal).toBe(2)
    expect(imported.history[1]).toEqual(corrected.history[1])
    expect(imported.historyDigest).toBe(corrected.historyDigest)
  })

  it('rejects a legacy false refusal whose original history digest is invalid', async () => {
    const legacy = await makeLessathiState({ legacyRefusal: true })
    const raw = await exportSave({ ...legacy, historyDigest: 'tampered-history' }, 'portable-secret')
    resetStorage()

    await expect(importSave(raw, 'portable-secret', CONTENT_VERSION, contextForScene))
      .rejects.toThrow(SAVE_IMPORT_ERROR_MESSAGES.tamper)
    expect(stores.saves.size).toBe(0)
  })

  it('rejects an incomplete legacy refusal event even with a matching digest', async () => {
    const legacy = await makeLessathiState({ legacyRefusal: true })
    const history = legacy.history.map((event, index) => index === 1 && event.type === 'choice'
      ? { ...event, assignments: event.assignments.slice(0, 1) }
      : event)
    const raw = await exportSave({
      ...legacy,
      history,
      historyDigest: await digestHistory(history),
    }, 'portable-secret')
    resetStorage()

    await expect(importSave(raw, 'portable-secret', CONTENT_VERSION, contextForScene))
      .rejects.toThrow(SAVE_IMPORT_ERROR_MESSAGES.tamper)
    expect(stores.saves.size).toBe(0)
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

  it('migrates legacy false refusals from autosaves and named local saves', async () => {
    for (const slotId of ['autosave', 'manual-test']) {
      resetStorage()
      const legacy = await makeLessathiState({ legacyRefusal: true, slotId })
      await saveGameState(legacy, slotId === 'manual-test' ? { label: 'After the deal' } : {})

      const loaded = await loadGameState(slotId, { contentVersion: CONTENT_VERSION, contextForScene })
      const stored = await loadGameState(slotId)

      expect(loaded?.variables.v_b2_ch2_deal).toBe(1)
      expect(loaded?.history[1]).toMatchObject({ choiceId: 'B2-Ch02a-Soundproof:c1' })
      expect(stored?.history).toEqual(loaded?.history)
      expect(stored?.historyDigest).toBe(loaded?.historyDigest)
    }
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
