import crypto from 'node:crypto'

export const ADMIN_SESSION_COOKIE = 'magium_translation_admin'

export function createAdminAuth(config = {}) {
  const password = String(config.adminPassword ?? '')
  const secret = String(config.adminSessionSecret ?? '')
  const configuredTtlHours = Number(config.adminSessionTtlHours ?? 8)
  const ttlHours = Number.isFinite(configuredTtlHours) && configuredTtlHours > 0 ? configuredTtlHours : 8
  const ttlMs = ttlHours * 60 * 60 * 1000
  const cookieSecure = Boolean(config.adminCookieSecure)
  const revokedSessions = new Map()

  return {
    enabled: Boolean(password && secret),
    verifyPassword(candidate) {
      if (!password || !secret) return false
      return secureEqualHex(hashValue(candidate), hashValue(password))
    },
    createSession(now = new Date()) {
      requireConfigured(password, secret)
      purgeRevokedSessions(revokedSessions, now)
      const expiresAt = new Date(now.getTime() + ttlMs)
      const payload = {
        v: 1,
        sid: crypto.randomBytes(16).toString('base64url'),
        csrf: crypto.randomBytes(24).toString('base64url'),
        exp: expiresAt.getTime(),
      }
      const encoded = encodePayload(payload)
      const value = `${encoded}.${sign(encoded, secret)}`
      return {
        session: payload,
        csrfToken: payload.csrf,
        expiresAt: expiresAt.toISOString(),
        cookie: buildSessionCookie(value, ttlMs, cookieSecure),
      }
    },
    readSession(cookieHeader, now = new Date()) {
      if (!password || !secret) return null
      purgeRevokedSessions(revokedSessions, now)
      const cookieValue = parseCookies(cookieHeader)[ADMIN_SESSION_COOKIE]
      if (!cookieValue) return null
      const [encoded, signature] = cookieValue.split('.')
      if (!encoded || !signature || !secureEqualHex(signature, sign(encoded, secret))) return null
      const payload = decodePayload(encoded)
      if (!payload || payload.v !== 1 || !payload.sid || !payload.csrf || !Number.isFinite(payload.exp)) return null
      if (payload.exp <= now.getTime()) return null
      if (revokedSessions.has(payload.sid)) return null
      return payload
    },
    verifyCsrf(session, token) {
      return Boolean(session?.csrf && token && secureEqualString(session.csrf, String(token)))
    },
    revokeSession(session, now = new Date()) {
      if (!session?.sid || !Number.isFinite(session.exp)) return
      purgeRevokedSessions(revokedSessions, now)
      revokedSessions.set(session.sid, session.exp)
    },
    clearCookie() {
      return clearSessionCookie(cookieSecure)
    },
  }
}

function requireConfigured(password, secret) {
  if (password && secret) return
  const error = new Error('Admin web authentication is not configured')
  error.statusCode = 503
  throw error
}

function encodePayload(payload) {
  return Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url')
}

function decodePayload(encoded) {
  try {
    return JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8'))
  } catch {
    return null
  }
}

function sign(value, secret) {
  return crypto.createHmac('sha256', secret).update(value).digest('hex')
}

function hashValue(value) {
  return crypto.createHash('sha256').update(String(value), 'utf8').digest('hex')
}

function buildSessionCookie(value, ttlMs, secure) {
  return [
    `${ADMIN_SESSION_COOKIE}=${value}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Strict',
    `Max-Age=${Math.floor(ttlMs / 1000)}`,
    secure ? 'Secure' : '',
  ].filter(Boolean).join('; ')
}

function clearSessionCookie(secure) {
  return [
    `${ADMIN_SESSION_COOKIE}=`,
    'Path=/',
    'HttpOnly',
    'SameSite=Strict',
    'Max-Age=0',
    secure ? 'Secure' : '',
  ].filter(Boolean).join('; ')
}

function parseCookies(cookieHeader) {
  const cookies = {}
  for (const part of String(cookieHeader ?? '').split(';')) {
    const [name, ...rawValue] = part.trim().split('=')
    if (!name || rawValue.length === 0) continue
    cookies[name] = rawValue.join('=')
  }
  return cookies
}

function purgeRevokedSessions(revokedSessions, now) {
  const timestamp = now.getTime()
  for (const [sid, expiresAt] of revokedSessions.entries()) {
    if (expiresAt <= timestamp) revokedSessions.delete(sid)
  }
}

function secureEqualString(left, right) {
  return secureEqualHex(hashValue(left), hashValue(right))
}

function secureEqualHex(left, right) {
  if (!/^[a-f0-9]+$/i.test(left) || !/^[a-f0-9]+$/i.test(right)) return false
  const leftBuffer = Buffer.from(left, 'hex')
  const rightBuffer = Buffer.from(right, 'hex')
  return leftBuffer.length === rightBuffer.length && crypto.timingSafeEqual(leftBuffer, rightBuffer)
}
