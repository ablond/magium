import http from 'node:http'
import { randomUUID } from 'node:crypto'
import { URL } from 'node:url'
import {
  hashPassword,
  hashSessionToken,
  httpError,
  normalizeCredentials,
  randomEncryptionSalt,
  randomSessionToken,
  verifyPassword,
} from './auth.js'
import { createAccountMemoryRepository } from './repository.memory.js'

export function createAccountServer({ config = readAccountConfig(), repository = createAccountMemoryRepository() } = {}) {
  const accountRouter = createAccountRouter({ config, repository })

  return http.createServer(async (request, response) => {
    try {
      const url = new URL(request.url ?? '/', `http://${request.headers.host ?? 'localhost'}`)
      writeCorsHeaders(request, response, config)
      if (request.method === 'OPTIONS') {
        response.writeHead(204)
        response.end()
        return
      }
      if (request.method === 'GET' && url.pathname === '/health') {
        writeJson(response, 200, { status: 'ok' })
        return
      }
      if (await accountRouter(request, response, url)) return
      writeJson(response, 404, { error: 'Not found' })
    } catch (caught) {
      writeError(response, caught)
    }
  })
}

export function createAccountRouter({ config = readAccountConfig(), repository = createAccountMemoryRepository() } = {}) {
  const authRateLimiter = createRateLimiter(config.authRateLimitWindowMs, config.authRateLimitMax)
  return async (request, response, url = new URL(request.url ?? '/', `http://${request.headers.host ?? 'localhost'}`)) => {
    if (!isAccountPath(url.pathname)) return false
    await route(request, response, url, { config, repository, authRateLimiter })
    return true
  }
}

async function route(request, response, url, dependencies) {
  const { config, repository, authRateLimiter } = dependencies

  if (request.method === 'POST' && url.pathname === '/v1/accounts/register') {
    authRateLimiter.assert(clientIp(request, config))
    const credentials = normalizeCredentials(await readJson(request, config.maxJsonBodyBytes))
    const password = await hashPassword(credentials.password)
    const now = new Date()
    const user = await repository.createUser({
      id: randomUUID(),
      username: credentials.username,
      usernameNormalized: credentials.usernameNormalized,
      passwordSalt: password.salt,
      passwordHash: password.hash,
      encryptionSalt: randomEncryptionSalt(),
      createdAt: now.toISOString(),
    })
    if (!user) throw httpError(409, 'Username is already in use')
    writeJson(response, 201, await issueSession(repository, user, now, config.sessionTtlDays))
    return
  }

  if (request.method === 'POST' && url.pathname === '/v1/accounts/login') {
    authRateLimiter.assert(clientIp(request, config))
    const credentials = normalizeCredentials(await readJson(request, config.maxJsonBodyBytes))
    const user = await repository.getUserByNormalizedUsername(credentials.usernameNormalized)
    if (!user || !(await verifyPassword(credentials.password, user.passwordSalt, user.passwordHash))) {
      throw httpError(401, 'Invalid username or password')
    }
    const now = new Date()
    writeJson(response, 200, await issueSession(repository, user, now, config.sessionTtlDays))
    return
  }

  if (url.pathname.startsWith('/v1/account')) {
    const session = await requireSession(request, repository)
    if (request.method === 'GET' && url.pathname === '/v1/account') {
      writeJson(response, 200, publicAccount(session))
      return
    }
    if (request.method === 'POST' && url.pathname === '/v1/account/logout') {
      await repository.deleteSessionByTokenHash(session.tokenHash)
      writeJson(response, 200, { authenticated: false })
      return
    }
    if (request.method === 'GET' && url.pathname === '/v1/account/sync') {
      writeJson(response, 200, { records: await repository.listSyncRecords(session.userId) })
      return
    }
    if (request.method === 'PUT' && url.pathname === '/v1/account/sync') {
      const body = await readJson(request, config.maxSyncBodyBytes)
      const records = normalizeSyncRecords(body?.records, config.maxSyncRecords)
      writeJson(response, 200, { records: await repository.upsertSyncRecords(session.userId, records) })
      return
    }
  }

  writeJson(response, 404, { error: 'Not found' })
}

function isAccountPath(pathname) {
  return pathname === '/v1/accounts/register' ||
    pathname === '/v1/accounts/login' ||
    pathname === '/v1/account' ||
    pathname.startsWith('/v1/account/')
}

async function issueSession(repository, user, now, ttlDays) {
  await repository.deleteExpiredSessions(now.toISOString())
  const token = randomSessionToken()
  const session = {
    id: randomUUID(),
    userId: user.id,
    tokenHash: hashSessionToken(token),
    createdAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + ttlDays * 86_400_000).toISOString(),
  }
  await repository.createSession(session)
  return {
    token,
    username: user.username,
    encryptionSalt: user.encryptionSalt,
    expiresAt: session.expiresAt,
  }
}

async function requireSession(request, repository) {
  const authorization = String(request.headers.authorization ?? '')
  const match = authorization.match(/^Bearer\s+(.+)$/i)
  if (!match) throw httpError(401, 'Authentication required')
  const tokenHash = hashSessionToken(match[1])
  const session = await repository.getSessionByTokenHash(tokenHash, new Date().toISOString())
  if (!session) throw httpError(401, 'Session expired')
  return session
}

function publicAccount(session) {
  return {
    username: session.user.username,
    encryptionSalt: session.user.encryptionSalt,
    expiresAt: session.expiresAt,
  }
}

function normalizeSyncRecords(value, maxRecords) {
  if (!Array.isArray(value) || value.length > maxRecords) {
    throw httpError(400, `records must contain at most ${maxRecords} items`)
  }
  const ids = new Set()
  return value.map((input) => {
    const recordId = String(input?.recordId ?? '')
    const updatedAt = String(input?.updatedAt ?? '')
    const deleted = input?.deleted === true
    if (!/^[a-z0-9:_-]{1,96}$/i.test(recordId) || ids.has(recordId)) {
      throw httpError(400, 'Invalid or duplicate sync record ID')
    }
    ids.add(recordId)
    if (!isIsoDate(updatedAt)) throw httpError(400, 'Invalid sync record date')
    const encrypted = deleted ? null : normalizeEncryptedBox(input?.encrypted)
    return { recordId, updatedAt, deleted, encrypted }
  })
}

function normalizeEncryptedBox(value) {
  if (!value || value.version !== 1 || value.algorithm !== 'AES-GCM' ||
    typeof value.iv !== 'string' || value.iv.length > 64 ||
    typeof value.ciphertext !== 'string' || value.ciphertext.length > 1_500_000) {
    throw httpError(400, 'Invalid encrypted sync record')
  }
  return {
    version: 1,
    algorithm: 'AES-GCM',
    iv: value.iv,
    ciphertext: value.ciphertext,
  }
}

function isIsoDate(value) {
  const date = new Date(value)
  return Number.isFinite(date.getTime()) && date.toISOString() === value
}

async function readJson(request, maxBytes) {
  let total = 0
  const chunks = []
  for await (const chunk of request) {
    total += chunk.length
    if (total > maxBytes) throw httpError(413, 'JSON body is too large')
    chunks.push(chunk)
  }
  if (!chunks.length) return {}
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'))
  } catch {
    throw httpError(400, 'Invalid JSON body')
  }
}

function writeCorsHeaders(request, response, config) {
  const origin = String(request.headers.origin ?? '')
  if (origin && config.allowedOrigins.includes(origin)) {
    response.setHeader('access-control-allow-origin', origin)
    response.setHeader('vary', 'Origin')
  }
  response.setHeader('access-control-allow-headers', 'Authorization, Content-Type')
  response.setHeader('access-control-allow-methods', 'GET, POST, PUT, OPTIONS')
  response.setHeader('cache-control', 'no-store')
  response.setHeader('x-content-type-options', 'nosniff')
}

function writeJson(response, statusCode, body) {
  response.writeHead(statusCode, { 'content-type': 'application/json; charset=utf-8' })
  response.end(JSON.stringify(body))
}

function writeError(response, caught) {
  const statusCode = Number(caught?.statusCode) || 500
  if (statusCode >= 500) console.error(caught)
  writeJson(response, statusCode, { error: statusCode >= 500 ? 'Internal server error' : String(caught.message) })
}

function clientIp(request, config) {
  if (config.trustProxy) {
    const forwarded = String(request.headers['x-forwarded-for'] ?? '').split(',')[0]?.trim()
    if (forwarded) return forwarded
  }
  return request.socket.remoteAddress ?? 'unknown'
}

function createRateLimiter(windowMs, max) {
  const buckets = new Map()
  return {
    assert(key) {
      const now = Date.now()
      const bucket = buckets.get(key)
      if (!bucket || bucket.resetAt <= now) {
        buckets.set(key, { count: 1, resetAt: now + windowMs })
        return
      }
      bucket.count += 1
      if (bucket.count > max) throw httpError(429, 'Too many authentication attempts')
    },
  }
}

export function readAccountConfig() {
  return {
    port: integerEnv('PORT', 8080),
    databaseUrl: process.env.DATABASE_URL ?? '',
    allowedOrigins: String(process.env.ALLOWED_ORIGIN ?? 'http://localhost:5173')
      .split(',').map((value) => value.trim()).filter(Boolean),
    sessionTtlDays: integerEnv('SESSION_TTL_DAYS', 30),
    authRateLimitWindowMs: integerEnv('AUTH_RATE_LIMIT_WINDOW_MS', 900_000),
    authRateLimitMax: integerEnv('AUTH_RATE_LIMIT_MAX', 10),
    maxJsonBodyBytes: integerEnv('MAX_JSON_BODY_BYTES', 16_384),
    maxSyncBodyBytes: integerEnv('MAX_SYNC_BODY_BYTES', 5_000_000),
    maxSyncRecords: integerEnv('MAX_SYNC_RECORDS', 500),
    trustProxy: process.env.TRUST_PROXY === '1',
  }
}

function integerEnv(name, fallback) {
  const value = Number(process.env[name] ?? fallback)
  return Number.isSafeInteger(value) && value > 0 ? value : fallback
}
