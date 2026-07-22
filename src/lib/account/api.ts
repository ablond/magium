import type { EncryptedBox } from '../storage/crypto'

export type AccountAuthResponse = {
  token: string
  username: string
  encryptionSalt: string
  expiresAt: string
}

export type CloudSyncRecord = {
  recordId: string
  updatedAt: string
  deleted: boolean
  encrypted: EncryptedBox | null
}

export async function registerAccount(apiUrl: string, username: string, password: string): Promise<AccountAuthResponse> {
  return request<AccountAuthResponse>(apiUrl, '/v1/accounts/register', {
    method: 'POST',
    body: JSON.stringify({ username, password }),
  })
}

export async function loginAccount(apiUrl: string, username: string, password: string): Promise<AccountAuthResponse> {
  return request<AccountAuthResponse>(apiUrl, '/v1/accounts/login', {
    method: 'POST',
    body: JSON.stringify({ username, password }),
  })
}

export async function logoutAccount(apiUrl: string, token: string): Promise<void> {
  await request(apiUrl, '/v1/account/logout', { method: 'POST', token })
}

export async function fetchCloudRecords(apiUrl: string, token: string): Promise<CloudSyncRecord[]> {
  const response = await request<{ records: CloudSyncRecord[] }>(apiUrl, '/v1/account/sync', { token })
  return response.records
}

export async function putCloudRecords(
  apiUrl: string,
  token: string,
  records: CloudSyncRecord[],
): Promise<CloudSyncRecord[]> {
  const response = await request<{ records: CloudSyncRecord[] }>(apiUrl, '/v1/account/sync', {
    method: 'PUT',
    token,
    body: JSON.stringify({ records }),
  })
  return response.records
}

async function request<T = unknown>(
  apiUrl: string,
  path: string,
  options: { method?: string; body?: string; token?: string },
): Promise<T> {
  const response = await fetch(`${apiUrl.replace(/\/$/, '')}${path}`, {
    method: options.method ?? 'GET',
    headers: {
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}),
    },
    body: options.body,
  })
  const body = await response.json().catch(() => ({})) as { error?: string }
  if (!response.ok) {
    throw new AccountApiError(response.status, body.error || 'Account service is unavailable')
  }
  return body as T
}

export class AccountApiError extends Error {
  statusCode: number

  constructor(statusCode: number, message: string) {
    super(message)
    this.name = 'AccountApiError'
    this.statusCode = statusCode
  }
}
