import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { createAccountMemoryRepository } from '../src/account/repository.memory.js'
import { createAccountServer } from '../src/account/router.js'

const repository = createAccountMemoryRepository()
const server = createAccountServer({
  repository,
  config: {
    allowedOrigins: ['http://localhost:5173'],
    sessionTtlDays: 30,
    authRateLimitWindowMs: 60_000,
    authRateLimitMax: 20,
    maxJsonBodyBytes: 16_384,
    maxSyncBodyBytes: 1_000_000,
    maxSyncRecords: 100,
    trustProxy: false,
  },
})

let baseUrl = ''

before(async () => {
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  baseUrl = `http://127.0.0.1:${address.port}`
})

after(async () => {
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()))
})

test('registers, logs in case-insensitively, syncs opaque records, and logs out', async () => {
  const registration = await request('/v1/accounts/register', {
    method: 'POST',
    body: { username: 'Barry_01', password: 'magium-secret' },
  })
  assert.equal(registration.response.status, 201)
  assert.equal(registration.body.username, 'Barry_01')
  assert.equal(typeof registration.body.token, 'string')
  assert.equal(typeof registration.body.encryptionSalt, 'string')

  const duplicate = await request('/v1/accounts/register', {
    method: 'POST',
    body: { username: 'barry_01', password: 'another-secret' },
  })
  assert.equal(duplicate.response.status, 409)

  const login = await request('/v1/accounts/login', {
    method: 'POST',
    body: { username: 'BARRY_01', password: 'magium-secret' },
  })
  assert.equal(login.response.status, 200)

  const encrypted = {
    version: 1,
    algorithm: 'AES-GCM',
    iv: 'opaque-iv',
    ciphertext: 'opaque-ciphertext',
  }
  const sync = await request('/v1/account/sync', {
    method: 'PUT',
    token: login.body.token,
    body: {
      records: [{
        recordId: 'save:autosave',
        updatedAt: '2026-07-22T10:00:00.000Z',
        deleted: false,
        encrypted,
      }],
    },
  })
  assert.equal(sync.response.status, 200)
  assert.deepEqual(sync.body.records[0].encrypted, encrypted)

  const stale = await request('/v1/account/sync', {
    method: 'PUT',
    token: login.body.token,
    body: {
      records: [{
        recordId: 'save:autosave',
        updatedAt: '2026-07-22T09:00:00.000Z',
        deleted: true,
      }],
    },
  })
  assert.equal(stale.body.records[0].deleted, false)

  const logout = await request('/v1/account/logout', { method: 'POST', token: login.body.token })
  assert.equal(logout.response.status, 200)
  const unauthorized = await request('/v1/account/sync', { token: login.body.token })
  assert.equal(unauthorized.response.status, 401)
})

test('rejects weak credentials and malformed encrypted records', async () => {
  const weak = await request('/v1/accounts/register', {
    method: 'POST',
    body: { username: 'no spaces', password: '123' },
  })
  assert.equal(weak.response.status, 400)

  const registration = await request('/v1/accounts/register', {
    method: 'POST',
    body: { username: 'Daren', password: 'long-enough' },
  })
  const malformed = await request('/v1/account/sync', {
    method: 'PUT',
    token: registration.body.token,
    body: {
      records: [{
        recordId: 'save:autosave',
        updatedAt: 'not-a-date',
        deleted: false,
        encrypted: {},
      }],
    },
  })
  assert.equal(malformed.response.status, 400)
})

async function request(path, options = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    method: options.method ?? 'GET',
    headers: {
      ...(options.body ? { 'content-type': 'application/json' } : {}),
      ...(options.token ? { authorization: `Bearer ${options.token}` } : {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  })
  return { response, body: await response.json() }
}
