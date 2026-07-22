import assert from 'node:assert/strict'
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { after, before, test } from 'node:test'
import { hashSecret } from '../src/proposals.js'
import { runMigrations } from '../src/database.js'

const staticDir = await mkdtemp(join(tmpdir(), 'magium-server-static-'))
await mkdir(join(staticDir, 'assets'))
await writeFile(join(staticDir, 'index.html'), '<!doctype html><div id="app"></div>')
await writeFile(join(staticDir, 'sw.js'), 'const CACHE_NAME = "test"')
await writeFile(join(staticDir, 'manifest.webmanifest'), '{"name":"Magium"}')
await writeFile(join(staticDir, 'assets', 'app.js'), 'console.log("magium")')

Object.assign(process.env, {
  NODE_ENV: 'test',
  STATIC_DIR: staticDir,
  TURNSTILE_DISABLED: '1',
  ADMIN_TOKEN: 'unified-admin-token',
})

const { server } = await import(`../src/server.js?unified=${Date.now()}`)
let baseUrl = ''

before(async () => {
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  baseUrl = `http://127.0.0.1:${address.port}`
})

after(async () => {
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()))
  await rm(staticDir, { recursive: true, force: true })
})

test('one server exposes static PWA, account, contribution, and admin routes', async () => {
  const home = await fetch(`${baseUrl}/`)
  assert.equal(home.status, 200)
  assert.match(await home.text(), /id="app"/)
  assert.equal(home.headers.get('cache-control'), 'no-store')

  const asset = await fetch(`${baseUrl}/assets/app.js`, { method: 'HEAD' })
  assert.equal(asset.status, 200)
  assert.equal(asset.headers.get('cache-control'), 'public, max-age=31536000, immutable')
  assert.equal(await asset.text(), '')

  const fallback = await fetch(`${baseUrl}/book/1/chapter/1`)
  assert.equal(fallback.status, 200)
  assert.match(await fallback.text(), /id="app"/)

  const unknownApi = await fetch(`${baseUrl}/v1/not-a-real-route`)
  assert.equal(unknownApi.status, 404)
  assert.deepEqual(await unknownApi.json(), { error: 'Not found' })

  const registration = await postJson('/v1/accounts/register', {
    username: 'unified-user',
    password: 'unified-password',
  })
  assert.equal(registration.status, 201)
  assert.equal(registration.body.username, 'unified-user')
  assert.equal(typeof registration.body.token, 'string')

  const currentText = 'Texte original'
  const proposal = await postJson('/v1/translation-proposals', {
    contentVersion: 'magium-test',
    locale: 'fr',
    chapterId: 'ch1',
    sceneId: 'Ch1-Intro1',
    messageId: 'ch1.Ch1_Intro1.p1',
    targetType: 'paragraph',
    segmentIndex: 0,
    segmentCount: 1,
    currentText,
    currentTextHash: hashSecret(currentText),
    sourceTextHash: 'b'.repeat(64),
    proposedText: 'Texte original corrigé',
    captchaToken: '',
  })
  assert.equal(proposal.status, 201)
  assert.equal(proposal.body.status, 'pending')

  const admin = await fetch(`${baseUrl}/v1/admin/proposals`, {
    headers: { authorization: 'Bearer unified-admin-token' },
  })
  assert.equal(admin.status, 200)
  const adminBody = await admin.json()
  assert.equal(adminBody.proposals.length, 1)

  const health = await fetch(`${baseUrl}/health`)
  assert.deepEqual(await health.json(), { status: 'ok' })
})

test('migration runner skips an existing migration and applies the next one transactionally', async () => {
  const migrationsDir = await mkdtemp(join(tmpdir(), 'magium-migrations-'))
  await writeFile(join(migrationsDir, '001-existing.sql'), 'SELECT 1;')
  await writeFile(join(migrationsDir, '002-next.sql'), 'SELECT 2;')
  const queries = []
  const client = {
    async query(sql, parameters = []) {
      queries.push({ sql: String(sql).trim(), parameters })
      if (String(sql).includes('SELECT name FROM magium_schema_migrations')) {
        return { rows: [{ name: '001-existing.sql' }] }
      }
      return { rows: [] }
    },
    release() {},
  }
  await runMigrations({ connect: async () => client }, { migrationsDir: pathToFileURL(`${migrationsDir}/`) })
  assert.equal(queries.some(({ sql }) => sql === 'SELECT 1;'), false)
  assert.equal(queries.some(({ sql }) => sql === 'SELECT 2;'), true)
  assert.equal(queries.filter(({ sql }) => sql === 'BEGIN').length, 1)
  assert.equal(queries.filter(({ sql }) => sql === 'COMMIT').length, 1)
  assert.deepEqual(
    queries.find(({ sql }) => sql.startsWith('INSERT INTO magium_schema_migrations')).parameters,
    ['002-next.sql'],
  )
  await rm(migrationsDir, { recursive: true, force: true })
})

test('initial migration remains compatible with pre-existing translation tables', async () => {
  const migration = await readFile(new URL('../migrations/001_initial.sql', import.meta.url), 'utf8')
  assert.match(migration, /CREATE TABLE IF NOT EXISTS translation_proposals/)
  assert.match(migration, /ALTER TABLE translation_proposals ADD COLUMN IF NOT EXISTS current_text/)
  assert.match(migration, /CREATE TABLE IF NOT EXISTS user_accounts/)
  assert.match(migration, /CREATE TABLE IF NOT EXISTS user_sync_records/)
})

async function postJson(pathname, body) {
  const response = await fetch(`${baseUrl}${pathname}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
  return {
    status: response.status,
    body: await response.json(),
  }
}
