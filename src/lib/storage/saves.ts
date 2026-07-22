import { replayAndResolveState } from '../story/engine'
import type { GameState, StoryContext } from '../story/types'
import { base64ToBytes, bytesToBase64, decryptJson, derivePassphraseKey, encryptJson, getLocalSaveKey, type EncryptedBox } from './crypto'
import { idbAll, idbDelete, idbGet, idbPut } from './idb'

export const SAVE_ASSOCIATED_DATA = 'magium-save-v1'

export const SAVE_IMPORT_ERROR_MESSAGES = {
  unsupported: 'Unsupported save file',
  localOnly: 'This file was not protected for transfer',
  exportPasswordRequired: 'Export password is required',
  passwordRequired: 'This backup needs the password used when it was exported',
  passwordOrCorrupt: 'Wrong password or damaged save file',
  contentVersion: 'This save cannot be replayed with this content version',
  tamper: 'This save file does not match a playable playthrough',
  debug: 'Debug saves cannot be exported',
} as const

export type SaveImportErrorCode = keyof typeof SAVE_IMPORT_ERROR_MESSAGES

export class SaveImportError extends Error {
  code: SaveImportErrorCode

  constructor(code: SaveImportErrorCode) {
    super(SAVE_IMPORT_ERROR_MESSAGES[code])
    this.name = 'SaveImportError'
    this.code = code
  }
}

export type StoredSaveRecord = {
  slotId: string
  label?: string
  createdAt?: string
  updatedAt: string
  storageUpdatedAt?: string
  contentVersion: string
  encrypted: EncryptedBox
}

export type SaveSummary = {
  slotId: string
  label: string | null
  updatedAt: string
  storageUpdatedAt: string
  contentVersion: string
  currentSceneId: string | null
}

export type SyncableSave = {
  slotId: string
  label: string | null
  createdAt: string
  storageUpdatedAt: string
  state: GameState
}

export type SaveContainer = {
  kind: 'magium-save'
  version: 1
  encryption: 'local-key' | 'pbkdf2'
  salt?: string
  associatedData: string
  encrypted: EncryptedBox
}

export type SaveReplayOptions = {
  contentVersion: string
  contextForScene: (sceneId: string) => Promise<StoryContext>
}

export async function saveGameState(
  state: GameState,
  options: { label?: string; createdAt?: string; storageUpdatedAt?: string } = {},
): Promise<void> {
  const existing = await idbGet<StoredSaveRecord>('saves', state.slotId)
  const key = await getLocalSaveKey()
  const encrypted = await encryptJson(state, key, SAVE_ASSOCIATED_DATA)
  const label = normalizeLabel(options.label) ?? existing?.label
  await idbPut<StoredSaveRecord>('saves', {
    slotId: state.slotId,
    label,
    createdAt: options.createdAt ?? existing?.createdAt ?? state.createdAt,
    updatedAt: state.updatedAt,
    storageUpdatedAt: options.storageUpdatedAt ?? state.updatedAt,
    contentVersion: state.contentVersion,
    encrypted,
  })
}

export async function listSaveSummaries(): Promise<SaveSummary[]> {
  const records = await idbAll<StoredSaveRecord>('saves')
  const key = await getLocalSaveKey()
  const summaries = await Promise.all(records.map(async (record) => {
    const state = await decryptRecordForSummary(record, key)
    return {
      slotId: record.slotId,
      label: record.label ?? null,
      updatedAt: record.updatedAt,
      storageUpdatedAt: record.storageUpdatedAt ?? record.updatedAt,
      contentVersion: record.contentVersion,
      currentSceneId: state?.currentSceneId ?? null,
    }
  }))
  return summaries
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
}

export async function loadGameState(slotId: string, replayOptions?: SaveReplayOptions): Promise<GameState | null> {
  const records = await idbAll<StoredSaveRecord>('saves')
  const record = records.find((candidate) => candidate.slotId === slotId)
  if (!record) {
    return null
  }
  const key = await getLocalSaveKey()
  const state = await decryptJson<GameState>(record.encrypted, key, SAVE_ASSOCIATED_DATA)
  if (!replayOptions) {
    return state
  }
  return resolveStoredStateForRuntime(state, replayOptions)
}

export async function deleteSave(slotId: string): Promise<void> {
  await idbDelete('saves', slotId)
}

export async function renameSave(slotId: string, label: string): Promise<void> {
  const record = await idbGet<StoredSaveRecord>('saves', slotId)
  if (!record) return
  await idbPut<StoredSaveRecord>('saves', {
    ...record,
    label: normalizeLabel(label),
    storageUpdatedAt: new Date().toISOString(),
  })
}

export async function listSyncableSaves(): Promise<SyncableSave[]> {
  const records = await idbAll<StoredSaveRecord>('saves')
  const key = await getLocalSaveKey()
  const saves: SyncableSave[] = []
  for (const record of records) {
    const state = await decryptRecordForSummary(record, key)
    if (!state || !isGameStateShape(state) || isDebugDirtyState(state)) continue
    saves.push({
      slotId: record.slotId,
      label: record.label ?? null,
      createdAt: record.createdAt ?? state.createdAt,
      storageUpdatedAt: record.storageUpdatedAt ?? record.updatedAt,
      state,
    })
  }
  return saves
}

export async function restoreSyncedSave(
  save: SyncableSave,
  replayOptions: SaveReplayOptions,
): Promise<GameState | null> {
  if (!isGameStateShape(save.state) || isDebugDirtyState(save.state) || save.state.slotId !== save.slotId) {
    return null
  }
  const replayed = await resolveReplay(replayOptions.contextForScene, save.state, replayOptions.contentVersion)
  if (!replayed) return null
  await saveGameState(replayed, {
    label: save.label ?? undefined,
    createdAt: save.createdAt,
    storageUpdatedAt: save.storageUpdatedAt,
  })
  return replayed
}

export async function exportSave(state: GameState, passphrase: string): Promise<string> {
  if (isDebugDirtyState(state)) {
    throw new SaveImportError('debug')
  }

  const trimmed = passphrase.trim()
  if (!trimmed) {
    throw new SaveImportError('exportPasswordRequired')
  }
  const salt = crypto.getRandomValues(new Uint8Array(16))
  const key = await derivePassphraseKey(trimmed, salt)
  const container: SaveContainer = {
    kind: 'magium-save',
    version: 1,
    encryption: 'pbkdf2',
    salt: bytesToBase64(salt),
    associatedData: SAVE_ASSOCIATED_DATA,
    encrypted: await encryptJson(state, key, SAVE_ASSOCIATED_DATA),
  }
  return JSON.stringify(container, null, 2)
}

export async function importSave(
  raw: string,
  passphrase: string,
  expectedContentVersion: string,
  contextForScene: (sceneId: string) => Promise<StoryContext>,
): Promise<GameState> {
  const container = parseSaveContainer(raw)
  const state = await decryptSaveContainer(container, passphrase)
  if (!isGameStateShape(state)) {
    throw new SaveImportError('unsupported')
  }
  if (isDebugDirtyState(state)) {
    throw new SaveImportError('debug')
  }
  const replayed = await resolveReplay(contextForScene, state, expectedContentVersion)
  if (!replayed) {
    throw new SaveImportError(state.contentVersion === expectedContentVersion ? 'tamper' : 'contentVersion')
  }
  await saveGameState(replayed)
  return replayed
}

function parseSaveContainer(raw: string): SaveContainer {
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    throw new SaveImportError('unsupported')
  }

  if (!isSaveContainer(parsed)) {
    throw new SaveImportError('unsupported')
  }

  return parsed
}

async function decryptSaveContainer(container: SaveContainer, passphrase: string): Promise<unknown> {
  const trimmedPassphrase = passphrase.trim()
  if (container.encryption === 'pbkdf2' && !trimmedPassphrase) {
    throw new SaveImportError('passwordRequired')
  }

  try {
    const key = container.encryption === 'pbkdf2'
      ? await derivePassphraseKey(trimmedPassphrase, base64ToBytes(container.salt ?? ''))
      : await getLocalSaveKey()
    return await decryptJson<unknown>(container.encrypted, key, container.associatedData)
  } catch {
    throw new SaveImportError(container.encryption === 'local-key' ? 'localOnly' : 'passwordOrCorrupt')
  }
}

async function resolveStoredStateForRuntime(
  state: GameState,
  replayOptions: SaveReplayOptions,
): Promise<GameState | null> {
  if (!isGameStateShape(state)) {
    return null
  }
  if (isDebugDirtyState(state)) {
    return state.contentVersion === replayOptions.contentVersion ? state : null
  }
  const replayed = await resolveReplay(replayOptions.contextForScene, state, replayOptions.contentVersion)
  if (!replayed) {
    return null
  }
  await saveGameState(replayed)
  return replayed
}

async function resolveReplay(
  contextForScene: (sceneId: string) => Promise<StoryContext>,
  state: GameState,
  targetContentVersion: string,
): Promise<GameState | null> {
  try {
    return await replayAndResolveState(contextForScene, state, targetContentVersion)
  } catch {
    return null
  }
}

async function decryptRecordForSummary(record: StoredSaveRecord, key: CryptoKey): Promise<GameState | null> {
  try {
    return await decryptJson<GameState>(record.encrypted, key, SAVE_ASSOCIATED_DATA)
  } catch {
    return null
  }
}

function normalizeLabel(label: string | undefined): string | undefined {
  const trimmed = label?.trim()
  return trimmed || undefined
}

function isSaveContainer(value: unknown): value is SaveContainer {
  return isRecord(value) &&
    value.kind === 'magium-save' &&
    value.version === 1 &&
    (value.encryption === 'local-key' || value.encryption === 'pbkdf2') &&
    value.associatedData === SAVE_ASSOCIATED_DATA &&
    isEncryptedBox(value.encrypted) &&
    (value.encryption === 'local-key' || typeof value.salt === 'string')
}

function isEncryptedBox(value: unknown): value is EncryptedBox {
  return isRecord(value) &&
    value.version === 1 &&
    value.algorithm === 'AES-GCM' &&
    typeof value.iv === 'string' &&
    typeof value.ciphertext === 'string'
}

function isGameStateShape(value: unknown): value is GameState {
  return isRecord(value) &&
    value.schemaVersion === 1 &&
    typeof value.contentVersion === 'string' &&
    typeof value.slotId === 'string' &&
    typeof value.locale === 'string' &&
    typeof value.currentSceneId === 'string' &&
    isRecord(value.variables) &&
    isRecord(value.achievements) &&
    Array.isArray(value.history) &&
    typeof value.historyDigest === 'string' &&
    typeof value.createdAt === 'string' &&
    typeof value.updatedAt === 'string' &&
    (value.debug === undefined || isDebugMetadata(value.debug))
}

function isDebugDirtyState(state: GameState): boolean {
  return state.debug?.dirty === true
}

function isDebugMetadata(value: unknown): value is GameState['debug'] {
  return isRecord(value) &&
    value.dirty === true &&
    typeof value.lastAction === 'string' &&
    typeof value.updatedAt === 'string'
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}
