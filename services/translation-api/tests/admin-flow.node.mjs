import test from 'node:test'
import assert from 'node:assert/strict'
import { createAdminAuth } from '../src/admin-auth.js'
import { hashSecret } from '../src/proposals.js'

const currentText = 'Texte original'

const basePayload = {
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
  proposedText: 'Texte original corrige',
  captchaToken: '',
}

test('admin page is served by the translation API', async () => {
  await withServer({}, async (port) => {
    const response = await fetch(`http://127.0.0.1:${port}/admin`)
    const html = await response.text()
    assert.equal(response.status, 200)
    assert.match(html, /Admin traductions/)
    assert.match(html, /\/admin\/assets\/admin.js/)
  })
})

test('admin login rejects invalid passwords and sets a secure session cookie for valid passwords', async () => {
  await withServer(adminEnv(), async (port) => {
    const rejected = await postJson(port, '/admin/login', { password: 'wrong-password' })
    assert.equal(rejected.status, 401)

    const accepted = await postJson(port, '/admin/login', { password: 'dev-admin-password' })
    assert.equal(accepted.status, 200)
    assert.equal(accepted.body.authenticated, true)
    assert.equal(typeof accepted.body.csrfToken, 'string')
    const cookie = accepted.headers.get('set-cookie')
    assert.match(cookie, /magium_translation_admin=/)
    assert.match(cookie, /HttpOnly/)
    assert.match(cookie, /SameSite=Strict/)
    assert.match(cookie, /Path=\//)
  })
})

test('admin session expires and logout revokes the current cookie', async () => {
  const auth = createAdminAuth({
    adminPassword: 'secret',
    adminSessionSecret: 'session-secret',
    adminSessionTtlHours: 1 / 3600000,
  })
  const now = new Date('2026-07-02T10:00:00.000Z')
  const session = auth.createSession(now)
  assert.ok(auth.readSession(session.cookie, now))
  assert.equal(auth.readSession(session.cookie, new Date('2026-07-02T10:00:02.000Z')), null)

  await withServer(adminEnv(), async (port) => {
    const login = await postJson(port, '/admin/login', { password: 'dev-admin-password' })
    const cookie = login.headers.get('set-cookie')
    const current = await getJson(port, '/admin/session', { cookie })
    assert.equal(current.status, 200)
    assert.equal(current.body.authenticated, true)

    const logout = await postJson(port, '/admin/logout', {}, { cookie })
    assert.equal(logout.status, 200)
    assert.match(logout.headers.get('set-cookie'), /Max-Age=0/)

    const afterLogout = await getJson(port, '/v1/admin/proposals', { cookie })
    assert.equal(afterLogout.status, 401)
  })
})

test('admin API keeps bearer token access and accepts session cookie with CSRF', async () => {
  await withServer(adminEnv(), async (port) => {
    const bearer = await getJson(port, '/v1/admin/proposals', {
      authorization: 'Bearer dev-admin-token',
    })
    assert.equal(bearer.status, 200)

    const created = await postJson(port, '/v1/translation-proposals', basePayload)
    assert.equal(created.status, 201)

    const login = await postJson(port, '/admin/login', { password: 'dev-admin-password' })
    const cookie = login.headers.get('set-cookie')
    const csrfToken = login.body.csrfToken

    const proposals = await getJson(port, '/v1/admin/proposals', { cookie })
    assert.equal(proposals.status, 200)
    assert.equal(proposals.body.proposals.length, 1)
    assert.equal(proposals.body.proposals[0].currentText, currentText)
    assert.ok(proposals.body.proposals[0].diffParts.some((part) => part.type === 'added' || part.type === 'changed'))
    const publicId = proposals.body.proposals[0].id

    const rejectedCsrf = await postJson(port, `/v1/admin/proposals/${publicId}/review`, {
      decision: 'accept',
      finalText: 'Texte final',
    }, { cookie })
    assert.equal(rejectedCsrf.status, 403)

    const accepted = await postJson(port, `/v1/admin/proposals/${publicId}/review`, {
      decision: 'accept',
      finalText: 'Texte final',
    }, { cookie, csrfToken })
    assert.equal(accepted.status, 200)
    assert.equal(accepted.body.proposal.status, 'accepted')

    const changeset = await postJson(port, '/v1/admin/changesets', {
      title: 'Lot test',
      proposalPublicIds: [publicId],
    }, { cookie, csrfToken })
    assert.equal(changeset.status, 201)

    const changesets = await getJson(port, '/v1/admin/changesets', { cookie })
    assert.equal(changesets.status, 200)
    assert.equal(changesets.body.changesets.length, 1)
    assert.equal(changesets.body.changesets[0].itemCount, 1)
  })
})

test('admin login is rate limited by IP', async () => {
  await withServer({
    ...adminEnv(),
    ADMIN_LOGIN_RATE_LIMIT_MAX: '2',
  }, async (port) => {
    assert.equal((await postJson(port, '/admin/login', { password: 'bad-1' })).status, 401)
    assert.equal((await postJson(port, '/admin/login', { password: 'bad-2' })).status, 401)
    assert.equal((await postJson(port, '/admin/login', { password: 'bad-3' })).status, 429)
  })
})

function adminEnv() {
  return {
    TURNSTILE_DISABLED: '1',
    DATABASE_URL: '',
    ADMIN_TOKEN: 'dev-admin-token',
    ADMIN_PASSWORD: 'dev-admin-password',
    ADMIN_SESSION_SECRET: 'dev-admin-session-secret',
    ADMIN_SESSION_TTL_HOURS: '8',
    ADMIN_LOGIN_RATE_LIMIT_WINDOW_MS: '900000',
    ADMIN_LOGIN_RATE_LIMIT_MAX: '5',
  }
}

async function getJson(port, path, headers = {}) {
  const response = await fetch(`http://127.0.0.1:${port}${path}`, {
    headers: requestHeaders(headers),
  })
  return responseWithBody(response)
}

async function postJson(port, path, body, headers = {}) {
  const response = await fetch(`http://127.0.0.1:${port}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...requestHeaders(headers) },
    body: JSON.stringify(body),
  })
  return responseWithBody(response)
}

function requestHeaders({ cookie, csrfToken, authorization } = {}) {
  return {
    ...(cookie ? { cookie } : {}),
    ...(csrfToken ? { 'x-admin-csrf': csrfToken } : {}),
    ...(authorization ? { authorization } : {}),
  }
}

async function responseWithBody(response) {
  const text = await response.text()
  return {
    status: response.status,
    headers: response.headers,
    body: text ? JSON.parse(text) : {},
  }
}

async function withServer(env, callback) {
  const previous = new Map()
  for (const [key, value] of Object.entries(env)) {
    previous.set(key, process.env[key])
    process.env[key] = value
  }
  const { server } = await import(`../src/server.js?adminTest=${Date.now()}-${Math.random()}`)
  await new Promise((resolve) => server.listen(0, resolve))
  try {
    const address = server.address()
    const port = typeof address === 'object' && address ? address.port : 0
    await callback(port)
  } finally {
    await new Promise((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve())
    })
    for (const [key, value] of previous) {
      if (value === undefined) {
        delete process.env[key]
      } else {
        process.env[key] = value
      }
    }
  }
}
