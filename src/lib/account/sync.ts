import { decryptJson, encryptJson } from '../storage/crypto'
import {
  loadAchievementProgress,
  mergeAchievementProgressFromSync,
  type AchievementProgress,
} from '../storage/achievementProgress'
import {
  deleteSave,
  listSyncableSaves,
  restoreSyncedSave,
  type SaveReplayOptions,
  type SyncableSave,
} from '../storage/saves'
import { fetchCloudRecords, putCloudRecords, type CloudSyncRecord } from './api'
import {
  loadCloudSaveTombstones,
  replaceCloudSaveTombstones,
  type AccountSession,
} from './storage'

const CLOUD_ACHIEVEMENTS_ID = 'achievements:global'

type CloudSavePayload = {
  kind: 'save'
  version: 1
  save: Omit<SyncableSave, 'storageUpdatedAt'>
}

type CloudAchievementsPayload = {
  kind: 'achievements'
  version: 1
  progress: AchievementProgress
}

export type AccountSyncResult = {
  syncedAt: string
  restoredSlotIds: string[]
  achievementProgress: AchievementProgress
}

export async function synchronizeAccount(
  apiUrl: string,
  session: AccountSession,
  replayOptions: SaveReplayOptions,
  options: { preferRemote?: boolean } = {},
): Promise<AccountSyncResult> {
  const remoteRecords = await fetchCloudRecords(apiUrl, session.token)
  const localSaves = await listSyncableSaves()
  const localById = new Map(localSaves.map((save) => [saveRecordId(save.slotId), save]))
  const tombstones = await loadCloudSaveTombstones(session.username)
  const restoredSlotIds: string[] = []

  for (const record of remoteRecords) {
    if (!record.recordId.startsWith('save:')) continue
    const slotId = record.recordId.slice('save:'.length)
    const local = localById.get(record.recordId)
    const localUpdatedAt = laterDate(local?.storageUpdatedAt, tombstones[slotId])
    if (!options.preferRemote && localUpdatedAt && record.updatedAt <= localUpdatedAt) continue

    if (record.deleted) {
      await deleteSave(slotId)
      tombstones[slotId] = record.updatedAt
      localById.delete(record.recordId)
      continue
    }
    if (!record.encrypted) continue
    const payload = await decryptCloudPayload<CloudSavePayload>(session, record)
    if (!isCloudSavePayload(payload) || payload.save.slotId !== slotId) continue
    const restored = await restoreSyncedSave({
      ...payload.save,
      storageUpdatedAt: record.updatedAt,
    }, replayOptions)
    if (!restored) continue
    delete tombstones[slotId]
    restoredSlotIds.push(slotId)
  }

  const remoteAchievements = remoteRecords.find((record) => record.recordId === CLOUD_ACHIEVEMENTS_ID)
  if (remoteAchievements?.encrypted && !remoteAchievements.deleted) {
    const payload = await decryptCloudPayload<CloudAchievementsPayload>(session, remoteAchievements)
    if (isCloudAchievementsPayload(payload)) {
      await mergeAchievementProgressFromSync(payload.progress)
    }
  }

  const outgoing = await buildLocalRecords(session, tombstones)
  await putCloudRecords(apiUrl, session.token, outgoing)
  await replaceCloudSaveTombstones(session.username, tombstones)
  return {
    syncedAt: new Date().toISOString(),
    restoredSlotIds,
    achievementProgress: await loadAchievementProgress(),
  }
}

async function buildLocalRecords(
  session: AccountSession,
  tombstones: Record<string, string>,
): Promise<CloudSyncRecord[]> {
  const records: CloudSyncRecord[] = []
  const saves = await listSyncableSaves()
  for (const save of saves) {
    const deletedAt = tombstones[save.slotId]
    if (deletedAt && deletedAt >= save.storageUpdatedAt) continue
    if (deletedAt) delete tombstones[save.slotId]
    const recordId = saveRecordId(save.slotId)
    records.push({
      recordId,
      updatedAt: save.storageUpdatedAt,
      deleted: false,
      encrypted: await encryptJson({
        kind: 'save',
        version: 1,
        save: {
          slotId: save.slotId,
          label: save.label,
          createdAt: save.createdAt,
          state: save.state,
        },
      }, session.syncKey, associatedData(recordId)),
    })
  }
  for (const [slotId, updatedAt] of Object.entries(tombstones)) {
    records.push({ recordId: saveRecordId(slotId), updatedAt, deleted: true, encrypted: null })
  }

  const progress = await loadAchievementProgress()
  records.push({
    recordId: CLOUD_ACHIEVEMENTS_ID,
    updatedAt: progress.updatedAt,
    deleted: false,
    encrypted: await encryptJson({
      kind: 'achievements',
      version: 1,
      progress,
    }, session.syncKey, associatedData(CLOUD_ACHIEVEMENTS_ID)),
  })
  return records
}

async function decryptCloudPayload<T>(session: AccountSession, record: CloudSyncRecord): Promise<T> {
  try {
    if (!record.encrypted) throw new Error('Missing encrypted record')
    return await decryptJson<T>(record.encrypted, session.syncKey, associatedData(record.recordId))
  } catch {
    throw new Error('Cloud saves cannot be decrypted with this account password')
  }
}

function associatedData(recordId: string): string {
  return `magium-cloud-record-v1:${recordId}`
}

function saveRecordId(slotId: string): string {
  return `save:${slotId}`
}

function laterDate(left: string | undefined, right: string | undefined): string | undefined {
  if (!left) return right
  if (!right) return left
  return left >= right ? left : right
}

function isCloudSavePayload(value: unknown): value is CloudSavePayload {
  return isRecord(value) && value.kind === 'save' && value.version === 1 && isRecord(value.save)
}

function isCloudAchievementsPayload(value: unknown): value is CloudAchievementsPayload {
  return isRecord(value) && value.kind === 'achievements' && value.version === 1 && isRecord(value.progress)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}
