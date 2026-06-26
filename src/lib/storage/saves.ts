import { replayAndValidate } from '../story/engine'
import type { GameState, StoryContext } from '../story/types'
import { base64ToBytes, bytesToBase64, decryptJson, derivePassphraseKey, encryptJson, getLocalSaveKey, type EncryptedBox } from './crypto'
import { idbAll, idbDelete, idbPut } from './idb'

const SAVE_ASSOCIATED_DATA = 'magium-save-v1'

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
  contextForScene: (sceneId: string) => Promise<StoryContext>,
): Promise<GameState> {
  const container = JSON.parse(raw) as SaveContainer
  if (container.kind !== 'magium-save' || container.version !== 1) {
    throw new Error('Unsupported save container')
  }
  const key = container.encryption === 'pbkdf2'
    ? await derivePassphraseKey(passphrase, base64ToBytes(container.salt ?? ''))
    : await getLocalSaveKey()
  const state = await decryptJson<GameState>(container.encrypted, key, container.associatedData)
  const valid = await replayAndValidate(contextForScene, state)
  if (!valid) {
    throw new Error('Save was decrypted but failed progression validation')
  }
  await saveGameState(state)
  return state
}
