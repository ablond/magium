import { base64ToBytes, decryptJson, derivePassphraseKey, encryptJson, getLocalSaveKey, type EncryptedBox } from '../storage/crypto'
import { idbDelete, idbGet, idbSet } from '../storage/idb'
import type { AccountAuthResponse } from './api'

const SESSION_ID = 'session-v1'
const SESSION_ASSOCIATED_DATA = 'magium-account-session-v1'

export type AccountSession = {
  username: string
  token: string
  expiresAt: string
  syncKey: CryptoKey
}

type StoredAccountSession = {
  username: string
  expiresAt: string
  encryptedToken: EncryptedBox
  syncKey: CryptoKey
}

type AccountSyncMetadata = {
  username: string
  tombstones: Record<string, string>
}

export async function storeAccountSession(auth: AccountAuthResponse, password: string): Promise<AccountSession> {
  const localKey = await getLocalSaveKey()
  const syncKey = await derivePassphraseKey(password, base64ToBytes(auth.encryptionSalt))
  await idbSet<StoredAccountSession>('account', SESSION_ID, {
    username: auth.username,
    expiresAt: auth.expiresAt,
    encryptedToken: await encryptJson({ token: auth.token }, localKey, SESSION_ASSOCIATED_DATA),
    syncKey,
  })
  return {
    username: auth.username,
    token: auth.token,
    expiresAt: auth.expiresAt,
    syncKey,
  }
}

export async function restoreAccountSession(): Promise<AccountSession | null> {
  const stored = await idbGet<StoredAccountSession>('account', SESSION_ID)
  if (!stored) return null
  if (new Date(stored.expiresAt).getTime() <= Date.now()) {
    await clearAccountSession()
    return null
  }
  try {
    const localKey = await getLocalSaveKey()
    const payload = await decryptJson<{ token: string }>(stored.encryptedToken, localKey, SESSION_ASSOCIATED_DATA)
    if (!payload.token || !stored.syncKey) return null
    return {
      username: stored.username,
      token: payload.token,
      expiresAt: stored.expiresAt,
      syncKey: stored.syncKey,
    }
  } catch {
    await clearAccountSession()
    return null
  }
}

export async function clearAccountSession(): Promise<void> {
  await idbDelete('account', SESSION_ID)
}

export async function markCloudSaveDeleted(username: string, slotId: string): Promise<void> {
  const metadata = await loadSyncMetadata(username)
  metadata.tombstones[slotId] = new Date().toISOString()
  await saveSyncMetadata(metadata)
}

export async function loadCloudSaveTombstones(username: string): Promise<Record<string, string>> {
  return { ...(await loadSyncMetadata(username)).tombstones }
}

export async function replaceCloudSaveTombstones(username: string, tombstones: Record<string, string>): Promise<void> {
  const entries = Object.entries(tombstones)
    .sort((left, right) => right[1].localeCompare(left[1]))
    .slice(0, 400)
  await saveSyncMetadata({ username, tombstones: Object.fromEntries(entries) })
}

async function loadSyncMetadata(username: string): Promise<AccountSyncMetadata> {
  return await idbGet<AccountSyncMetadata>('account', metadataId(username)) ?? { username, tombstones: {} }
}

async function saveSyncMetadata(metadata: AccountSyncMetadata): Promise<void> {
  await idbSet('account', metadataId(metadata.username), metadata)
}

function metadataId(username: string): string {
  return `sync-v1:${username.toLocaleLowerCase('en-US')}`
}
