import type { AchievementDefinition, GameState } from '../story/types'
import { decryptJson, encryptJson, getLocalSaveKey, type EncryptedBox } from './crypto'
import { idbAll, idbGet, idbPut } from './idb'
import { SAVE_ASSOCIATED_DATA, type StoredSaveRecord } from './saves'

const ACHIEVEMENT_PROGRESS_ID = 'global'
const ACHIEVEMENT_PROGRESS_ASSOCIATED_DATA = 'magium-achievement-progress-v1'

export type AchievementProgress = {
  schemaVersion: 1
  contentVersion: string | null
  achievements: Record<string, true>
  createdAt: string
  updatedAt: string
}

type StoredAchievementProgressRecord = {
  id: typeof ACHIEVEMENT_PROGRESS_ID
  contentVersion: string | null
  createdAt: string
  updatedAt: string
  encrypted: EncryptedBox
}

export async function loadAchievementProgress(): Promise<AchievementProgress> {
  const stored = await loadStoredAchievementProgress()
  if (stored) {
    return stored
  }

  const migrated = await migrateAchievementProgressFromSaves()
  if (Object.keys(migrated.achievements).length > 0) {
    await storeAchievementProgress(migrated)
  }
  return migrated
}

export async function recordAchievementUnlocks(
  variables: Iterable<string>,
  contentVersion: string,
): Promise<AchievementProgress> {
  const progress = await loadAchievementProgress()
  const achievements = { ...progress.achievements }
  let changed = false

  for (const variable of normalizeAchievementVariables(variables)) {
    if (!achievements[variable]) {
      achievements[variable] = true
      changed = true
    }
  }

  if (!changed) {
    return progress
  }

  const now = new Date().toISOString()
  const next: AchievementProgress = {
    ...progress,
    contentVersion,
    achievements,
    updatedAt: now,
  }
  await storeAchievementProgress(next)
  return next
}

export async function mergeAchievementProgressFromState(state: GameState): Promise<AchievementProgress> {
  if (state.debug?.dirty) {
    return loadAchievementProgress()
  }
  return recordAchievementUnlocks(Object.keys(state.achievements), state.contentVersion)
}

export function filterNewAchievementUnlocks(
  progress: AchievementProgress,
  achievements: AchievementDefinition[],
): AchievementDefinition[] {
  return achievements.filter((achievement) => !progress.achievements[achievement.variable])
}

async function loadStoredAchievementProgress(): Promise<AchievementProgress | null> {
  const record = await idbGet<StoredAchievementProgressRecord>('achievementProgress', ACHIEVEMENT_PROGRESS_ID)
  if (!record) {
    return null
  }

  try {
    const key = await getLocalSaveKey()
    const progress = await decryptJson<AchievementProgress>(
      record.encrypted,
      key,
      ACHIEVEMENT_PROGRESS_ASSOCIATED_DATA,
    )
    return isAchievementProgress(progress) ? progress : null
  } catch {
    return null
  }
}

async function migrateAchievementProgressFromSaves(): Promise<AchievementProgress> {
  const now = new Date().toISOString()
  const achievements: Record<string, true> = {}
  let contentVersion: string | null = null

  try {
    const records = await idbAll<StoredSaveRecord>('saves')
    const key = await getLocalSaveKey()
    for (const record of records) {
      const state = await decryptSaveRecord(record, key)
      if (!state || state.debug?.dirty) {
        continue
      }
      contentVersion = state.contentVersion
      for (const variable of Object.keys(state.achievements)) {
        achievements[variable] = true
      }
    }
  } catch {
    // A failed migration must not block the reader. Future normal unlocks will recreate the record.
  }

  return {
    schemaVersion: 1,
    contentVersion,
    achievements,
    createdAt: now,
    updatedAt: now,
  }
}

async function decryptSaveRecord(record: StoredSaveRecord, key: CryptoKey): Promise<GameState | null> {
  try {
    const state = await decryptJson<GameState>(record.encrypted, key, SAVE_ASSOCIATED_DATA)
    return isGameStateLike(state) ? state : null
  } catch {
    return null
  }
}

async function storeAchievementProgress(progress: AchievementProgress): Promise<void> {
  const key = await getLocalSaveKey()
  await idbPut<StoredAchievementProgressRecord>('achievementProgress', {
    id: ACHIEVEMENT_PROGRESS_ID,
    contentVersion: progress.contentVersion,
    createdAt: progress.createdAt,
    updatedAt: progress.updatedAt,
    encrypted: await encryptJson(progress, key, ACHIEVEMENT_PROGRESS_ASSOCIATED_DATA),
  })
}

function normalizeAchievementVariables(variables: Iterable<string>): string[] {
  return [...new Set([...variables].map((variable) => variable.trim()).filter(Boolean))]
}

function isAchievementProgress(value: unknown): value is AchievementProgress {
  return isRecord(value) &&
    value.schemaVersion === 1 &&
    (typeof value.contentVersion === 'string' || value.contentVersion === null) &&
    isRecord(value.achievements) &&
    typeof value.createdAt === 'string' &&
    typeof value.updatedAt === 'string'
}

function isGameStateLike(value: unknown): value is GameState {
  return isRecord(value) &&
    value.schemaVersion === 1 &&
    typeof value.contentVersion === 'string' &&
    isRecord(value.achievements) &&
    (value.debug === undefined || isRecord(value.debug))
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}
