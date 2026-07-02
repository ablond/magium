import crypto from 'node:crypto'

export const EMAIL_CONSENT_TTL_MS = 365 * 24 * 60 * 60 * 1000

export function createEmailConsent({ email, secret, id, token, now = new Date() }) {
  const normalizedEmail = normalizeEmail(email)
  if (!normalizedEmail) throw new Error('email is required')
  if (!secret) throw new Error('EMAIL_CONSENT_SECRET is required')
  const createdAt = now.toISOString()
  return {
    id: id ?? randomConsentId(),
    emailHmac: emailHmac(normalizedEmail, secret),
    tokenHash: hashConsentToken(token),
    confirmedAt: createdAt,
    lastUsedAt: createdAt,
    expiresAt: new Date(now.getTime() + EMAIL_CONSENT_TTL_MS).toISOString(),
  }
}

export function extendEmailConsent(consent, now = new Date()) {
  return {
    ...consent,
    lastUsedAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + EMAIL_CONSENT_TTL_MS).toISOString(),
  }
}

export function verifyEmailConsent({ consent, email, token, secret, now = new Date() }) {
  if (!consent || !email || !token || !secret) return false
  if (new Date(consent.expiresAt).getTime() <= now.getTime()) return false
  if (consent.emailHmac !== emailHmac(email, secret)) return false
  return secureEqualHex(consent.tokenHash, hashConsentToken(token))
}

export function emailHmac(email, secret) {
  return crypto.createHmac('sha256', secret).update(normalizeEmail(email)).digest('hex')
}

export function hashConsentToken(token) {
  return crypto.createHash('sha256').update(String(token), 'utf8').digest('hex')
}

export function normalizeEmail(email) {
  return String(email ?? '').trim().toLowerCase()
}

export function randomConsentToken() {
  return crypto.randomBytes(32).toString('base64url')
}

export function randomConsentId() {
  return `ec_${crypto.randomBytes(12).toString('base64url')}`
}

export function buildEmailConsentRedirectUrl({ publicWebUrl, publicId, consent, token }) {
  const payload = encodeURIComponent(JSON.stringify({
    publicId,
    id: consent.id,
    token,
    expiresAt: consent.expiresAt,
  }))
  const base = String(publicWebUrl).replace(/\/+$/, '')
  return `${base}/#translation-email-consent=${payload}`
}

function secureEqualHex(left, right) {
  if (!/^[a-f0-9]+$/i.test(left) || !/^[a-f0-9]+$/i.test(right)) return false
  const leftBuffer = Buffer.from(left, 'hex')
  const rightBuffer = Buffer.from(right, 'hex')
  return leftBuffer.length === rightBuffer.length && crypto.timingSafeEqual(leftBuffer, rightBuffer)
}
