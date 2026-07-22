import { createHash, randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto'
import { promisify } from 'node:util'

const scrypt = promisify(scryptCallback)
const USERNAME_PATTERN = /^[a-zA-Z0-9._-]+$/

export function normalizeCredentials(input) {
  const username = String(input?.username ?? '').trim()
  const password = String(input?.password ?? '')
  if (username.length < 3 || username.length > 32 || !USERNAME_PATTERN.test(username)) {
    throw httpError(400, 'Username must use 3 to 32 letters, numbers, dots, underscores, or hyphens')
  }
  if (password.length < 6 || password.length > 256) {
    throw httpError(400, 'Password must use 6 to 256 characters')
  }
  return {
    username,
    usernameNormalized: username.toLocaleLowerCase('en-US'),
    password,
  }
}

export async function hashPassword(password, salt = randomBytes(16).toString('base64')) {
  const derived = await scrypt(password, salt, 64)
  return {
    salt,
    hash: Buffer.from(derived).toString('base64'),
  }
}

export async function verifyPassword(password, salt, expectedHash) {
  const derived = Buffer.from(await scrypt(password, salt, 64))
  const expected = Buffer.from(expectedHash, 'base64')
  return expected.length === derived.length && timingSafeEqual(expected, derived)
}

export function randomSessionToken() {
  return randomBytes(32).toString('base64url')
}

export function hashSessionToken(token) {
  return createHash('sha256').update(token).digest('hex')
}

export function randomEncryptionSalt() {
  return randomBytes(16).toString('base64')
}

export function httpError(statusCode, message) {
  const error = new Error(message)
  error.statusCode = statusCode
  return error
}
