import { readdir, readFile } from 'node:fs/promises'
import { setTimeout as wait } from 'node:timers/promises'
import pg from 'pg'

const MIGRATION_LOCK_ID = 1_296_147_709
const DEFAULT_MIGRATIONS_DIR = new URL('../migrations/', import.meta.url)

export async function createDatabase(databaseUrl, options = {}) {
  if (!databaseUrl) return null
  const pool = new pg.Pool({ connectionString: databaseUrl })
  try {
    await waitForDatabase(pool, options)
    await runMigrations(pool, options)
    return pool
  } catch (error) {
    await pool.end()
    throw error
  }
}

async function waitForDatabase(pool, { connectionAttempts = 15, connectionDelayMs = 1_000 } = {}) {
  let lastError
  for (let attempt = 1; attempt <= connectionAttempts; attempt += 1) {
    try {
      await pool.query('SELECT 1')
      return
    } catch (error) {
      lastError = error
      if (attempt < connectionAttempts) await wait(connectionDelayMs)
    }
  }
  throw lastError
}

export async function runMigrations(pool, { migrationsDir = DEFAULT_MIGRATIONS_DIR } = {}) {
  const client = await pool.connect()
  let locked = false
  let inTransaction = false
  try {
    await client.query('SELECT pg_advisory_lock($1)', [MIGRATION_LOCK_ID])
    locked = true
    await client.query(`
      CREATE TABLE IF NOT EXISTS magium_schema_migrations (
        name text PRIMARY KEY,
        applied_at timestamptz NOT NULL DEFAULT now()
      )
    `)
    const { rows } = await client.query('SELECT name FROM magium_schema_migrations')
    const applied = new Set(rows.map((row) => row.name))
    const migrationNames = (await readdir(migrationsDir))
      .filter((name) => /^\d+[-_].+\.sql$/.test(name))
      .sort()

    for (const name of migrationNames) {
      if (applied.has(name)) continue
      const sql = await readFile(new URL(name, migrationsDir), 'utf8')
      await client.query('BEGIN')
      inTransaction = true
      await client.query(sql)
      await client.query('INSERT INTO magium_schema_migrations (name) VALUES ($1)', [name])
      await client.query('COMMIT')
      inTransaction = false
    }
  } catch (error) {
    if (inTransaction) await client.query('ROLLBACK')
    throw error
  } finally {
    if (locked) await client.query('SELECT pg_advisory_unlock($1)', [MIGRATION_LOCK_ID])
    client.release()
  }
}
