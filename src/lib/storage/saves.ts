import { replayAndValidate } from '../story/engine'
import type { GameState, StoryContext } from '../story/types'
import { base64ToBytes, bytesToBase64, decryptJson, derivePassphraseKey, encryptJson, getLocalSaveKey, type EncryptedBox } from './crypto'
import { idbAll, idbDelete, idbPut } from './idb'

const SAVE_ASSOCIATED_DATA = 'magium-save-v1'

export const SAVE_IMPORT_ERROR_MESSAGES = {
  unsupported: 'Unsupported save file',
  localOnly: 'This backup only restores in the browser that exported it',
  passwordRequired: 'This backup needs the password used when it was exported',
  passwordOrCorrupt: 'Wrong password or damaged save file',
  contentVersion: 'This save was made for a different content version',
  tamper: 'This save file does not match a playable route',
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
  updatedAt: string
  contentVersion: string
  encrypted: EncryptedBox
}

export type SaveSummary = {
  slotId: string
  updatedAt: string
  contentVersion: string
}

export type SaveContainer = {
  kind: 'magium-save'
  version: 1
  encryption: 'local-key' | 'pbkdf2'
  salt?: string
  associatedData: string
  encrypted: EncryptedBox
}

export async function saveGameState(state: GameState): Promise<void> {
  const key = await getLocalSaveKey()
  const encrypted = await encryptJson(state, key, SAVE_ASSOCIATED_DATA)
  await idbPut<StoredSaveRecord>('saves', {
    slotId: state.slotId,
    updatedAt: state.updatedAt,
    contentVersion: state.contentVersion,
    encrypted,
  })
}

export async function listSaveSummaries(): Promise<SaveSummary[]> {
  const records = await idbAll<StoredSaveRecord>('saves')
  return records
    .map(({ slotId, updatedAt, contentVersion }) => ({ slotId, updatedAt, contentVersion }))
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
}

export async function loadGameState(slotId: string): Promise<GameState | null> {
  const records = await idbAll<StoredSaveRecord>('saves')
  const record = records.find((candidate) => candidate.slotId === slotId)
  if (!record) {
    return null
  }
  const key = await getLocalSaveKey()
  return decryptJson<GameState>(record.encrypted, key, SAVE_ASSOCIATED_DATA)
}

export async function deleteSave(slotId: string): Promise<void> {
  await idbDelete('saves', slotId)
}

export async function exportSave(state: GameState, passphrase: string): Promise<string> {
  const trimmed = passphrase.trim()
  const salt = crypto.getRandomValues(new Uint8Array(16))
  const key = trimmed
    ? await derivePassphraseKey(trimmed, salt)
    : await getLocalSaveKey()
  const container: SaveContainer = {
    kind: 'magium-save',
    version: 1,
    encryption: trimmed ? 'pbkdf2' : 'local-key',
    salt: trimmed ? bytesToBase64(salt) : undefined,
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
  if (state.contentVersion !== expectedContentVersion) {
    throw new SaveImportError('contentVersion')
  }
  const valid = await validateReplay(contextForScene, state)
  if (!valid) {
    throw new SaveImportError('tamper')
  }
  await saveGameState(state)
  return state
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

async function validateReplay(
  contextForScene: (sceneId: string) => Promise<StoryContext>,
  state: GameState,
): Promise<boolean> {
  try {
    return await replayAndValidate(contextForScene, state)
  } catch {
    return false
  }
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
    typeof value.updatedAt === 'string'
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}
