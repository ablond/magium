import { idbGet, idbSet } from './idb'

const LOCAL_KEY_ID = 'local-aes-gcm-v1'
const encoder = new TextEncoder()
const decoder = new TextDecoder()

export type EncryptedBox = {
  version: 1
  algorithm: 'AES-GCM'
  iv: string
  ciphertext: string
}

export async function getLocalSaveKey(): Promise<CryptoKey> {
  const existing = await idbGet<CryptoKey>('keys', LOCAL_KEY_ID)
  if (existing) {
    return existing
  }
  const key = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt'])
  await idbSet('keys', LOCAL_KEY_ID, key)
  return key
}

export async function encryptJson(value: unknown, key: CryptoKey, associatedData: string): Promise<EncryptedBox> {
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const plaintext = encoder.encode(JSON.stringify(value))
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv, additionalData: encoder.encode(associatedData) },
    key,
    plaintext,
  )
  return {
    version: 1,
    algorithm: 'AES-GCM',
    iv: bytesToBase64(iv),
    ciphertext: bytesToBase64(new Uint8Array(ciphertext)),
  }
}

export async function decryptJson<T>(box: EncryptedBox, key: CryptoKey, associatedData: string): Promise<T> {
  const plaintext = await crypto.subtle.decrypt(
    {
      name: 'AES-GCM',
      iv: toArrayBuffer(base64ToBytes(box.iv)),
      additionalData: encoder.encode(associatedData),
    },
    key,
    toArrayBuffer(base64ToBytes(box.ciphertext)),
  )
  return JSON.parse(decoder.decode(plaintext)) as T
}

export async function derivePassphraseKey(passphrase: string, salt: Uint8Array): Promise<CryptoKey> {
  const baseKey = await crypto.subtle.importKey('raw', encoder.encode(passphrase), 'PBKDF2', false, ['deriveKey'])
  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: toArrayBuffer(salt),
      iterations: 250_000,
      hash: 'SHA-256',
    },
    baseKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  )
}

export function bytesToBase64(bytes: Uint8Array): string {
  let binary = ''
  for (const byte of bytes) {
    binary += String.fromCharCode(byte)
  }
  return btoa(binary)
}

export function base64ToBytes(value: string): Uint8Array {
  const binary = atob(value)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i)
  }
  return bytes
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer
}
