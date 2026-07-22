import pg from 'pg'

export async function createAccountPostgresRepository(databaseUrl) {
  const pool = new pg.Pool({ connectionString: databaseUrl })
  await pool.query('SELECT 1')
  return createAccountPostgresRepositoryFromPool(pool, { ownsPool: true })
}

export function createAccountPostgresRepositoryFromPool(pool, { ownsPool = false } = {}) {
  return {
    async createUser(user) {
      const result = await pool.query(
        `INSERT INTO user_accounts (
           id, username, username_normalized, password_salt, password_hash, encryption_salt, created_at
         ) VALUES ($1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT (username_normalized) DO NOTHING
         RETURNING *`,
        [user.id, user.username, user.usernameNormalized, user.passwordSalt, user.passwordHash, user.encryptionSalt, user.createdAt],
      )
      return result.rows[0] ? mapUser(result.rows[0]) : null
    },

    async getUserByNormalizedUsername(usernameNormalized) {
      const result = await pool.query('SELECT * FROM user_accounts WHERE username_normalized = $1', [usernameNormalized])
      return result.rows[0] ? mapUser(result.rows[0]) : null
    },

    async createSession(session) {
      await pool.query(
        `INSERT INTO user_sessions (id, user_id, token_hash, created_at, expires_at)
         VALUES ($1, $2, $3, $4, $5)`,
        [session.id, session.userId, session.tokenHash, session.createdAt, session.expiresAt],
      )
    },

    async getSessionByTokenHash(tokenHash, now) {
      const result = await pool.query(
        `SELECT
           s.id AS session_id, s.user_id, s.token_hash, s.created_at AS session_created_at, s.expires_at,
           u.id, u.username, u.username_normalized, u.password_salt, u.password_hash, u.encryption_salt, u.created_at
         FROM user_sessions s
         JOIN user_accounts u ON u.id = s.user_id
         WHERE s.token_hash = $1 AND s.expires_at > $2`,
        [tokenHash, now],
      )
      const row = result.rows[0]
      if (!row) return null
      return {
        id: row.session_id,
        userId: row.user_id,
        tokenHash: row.token_hash,
        createdAt: toIso(row.session_created_at),
        expiresAt: toIso(row.expires_at),
        user: mapUser(row),
      }
    },

    async deleteSessionByTokenHash(tokenHash) {
      await pool.query('DELETE FROM user_sessions WHERE token_hash = $1', [tokenHash])
    },

    async deleteExpiredSessions(now) {
      await pool.query('DELETE FROM user_sessions WHERE expires_at <= $1', [now])
    },

    async listSyncRecords(userId) {
      const result = await pool.query(
        `SELECT record_id, updated_at, deleted, encrypted
         FROM user_sync_records
         WHERE user_id = $1
         ORDER BY record_id`,
        [userId],
      )
      return result.rows.map(mapSyncRecord)
    },

    async upsertSyncRecords(userId, records) {
      const client = await pool.connect()
      try {
        await client.query('BEGIN')
        for (const record of records) {
          await client.query(
            `INSERT INTO user_sync_records (user_id, record_id, updated_at, deleted, encrypted)
             VALUES ($1, $2, $3, $4, $5)
             ON CONFLICT (user_id, record_id) DO UPDATE SET
               updated_at = EXCLUDED.updated_at,
               deleted = EXCLUDED.deleted,
               encrypted = EXCLUDED.encrypted
             WHERE EXCLUDED.updated_at > user_sync_records.updated_at`,
            [userId, record.recordId, record.updatedAt, record.deleted, record.encrypted ? JSON.stringify(record.encrypted) : null],
          )
        }
        await client.query('COMMIT')
      } catch (error) {
        await client.query('ROLLBACK')
        throw error
      } finally {
        client.release()
      }
      return this.listSyncRecords(userId)
    },

    async close() {
      if (ownsPool) await pool.end()
    },
  }
}

function mapUser(row) {
  return {
    id: row.id,
    username: row.username,
    usernameNormalized: row.username_normalized,
    passwordSalt: row.password_salt,
    passwordHash: row.password_hash,
    encryptionSalt: row.encryption_salt,
    createdAt: toIso(row.created_at),
  }
}

function mapSyncRecord(row) {
  return {
    recordId: row.record_id,
    updatedAt: toIso(row.updated_at),
    deleted: row.deleted,
    encrypted: row.encrypted ?? null,
  }
}

function toIso(value) {
  return value instanceof Date ? value.toISOString() : String(value)
}
