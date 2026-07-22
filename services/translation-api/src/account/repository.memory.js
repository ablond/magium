export function createAccountMemoryRepository() {
  const users = new Map()
  const sessions = new Map()
  const records = new Map()

  return {
    async createUser(user) {
      if (users.has(user.usernameNormalized)) return null
      users.set(user.usernameNormalized, structuredClone(user))
      return structuredClone(user)
    },

    async getUserByNormalizedUsername(usernameNormalized) {
      const user = users.get(usernameNormalized)
      return user ? structuredClone(user) : null
    },

    async createSession(session) {
      sessions.set(session.tokenHash, structuredClone(session))
    },

    async getSessionByTokenHash(tokenHash, now) {
      const session = sessions.get(tokenHash)
      if (!session || session.expiresAt <= now) return null
      const user = [...users.values()].find((candidate) => candidate.id === session.userId)
      return user ? { ...structuredClone(session), user: structuredClone(user) } : null
    },

    async deleteSessionByTokenHash(tokenHash) {
      sessions.delete(tokenHash)
    },

    async deleteExpiredSessions(now) {
      for (const [tokenHash, session] of sessions) {
        if (session.expiresAt <= now) sessions.delete(tokenHash)
      }
    },

    async listSyncRecords(userId) {
      return [...records.values()]
        .filter((record) => record.userId === userId)
        .sort((left, right) => left.recordId.localeCompare(right.recordId))
        .map((record) => structuredClone(record))
    },

    async upsertSyncRecords(userId, incoming) {
      for (const record of incoming) {
        const key = `${userId}:${record.recordId}`
        const existing = records.get(key)
        if (!existing || record.updatedAt > existing.updatedAt) {
          records.set(key, structuredClone({ ...record, userId }))
        }
      }
      return this.listSyncRecords(userId)
    },
  }
}
