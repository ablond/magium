export const INITIAL_HISTORY_DIGEST = 'magium:v1:initial'

export async function sha256Hex(value: string): Promise<string> {
  const encoded = new TextEncoder().encode(value)
  const digest = await crypto.subtle.digest('SHA-256', encoded)
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('')
}

export async function extendHistoryDigest(previous: string, event: unknown): Promise<string> {
  return sha256Hex(`${previous}|${stableStringify(event)}`)
}

export function stableStringify(value: unknown): string {
  return JSON.stringify(sortObject(value))
}

function sortObject(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortObject)
  }
  if (!value || typeof value !== 'object') {
    return value
  }
  return Object.fromEntries(
    Object.keys(value as Record<string, unknown>)
      .sort()
      .map((key) => [key, sortObject((value as Record<string, unknown>)[key])]),
  )
}
