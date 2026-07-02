import type { TranslationProposalPayload } from './payload'

export type TranslationProposalResponse = {
  publicId: string
  status: string
  emailConfirmationRequired: boolean
  notificationStatus: 'none' | 'confirmation_sent' | 'confirmed'
  emailConsentExpiresAt?: string
}

export type TranslationProposalStatus = {
  publicId: string
  status: string
  locale: string
  chapterId: string
  updatedAt: string
}

export async function submitTranslationProposal(
  apiBaseUrl: string,
  payload: TranslationProposalPayload,
): Promise<TranslationProposalResponse> {
  const response = await fetch(`${trimApiBaseUrl(apiBaseUrl)}/v1/translation-proposals`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  })
  return readJsonResponse<TranslationProposalResponse>(response)
}

export async function loadTranslationProposalStatus(
  apiBaseUrl: string,
  publicId: string,
): Promise<TranslationProposalStatus> {
  const response = await fetch(`${trimApiBaseUrl(apiBaseUrl)}/v1/translation-proposals/${encodeURIComponent(publicId)}/status`)
  return readJsonResponse<TranslationProposalStatus>(response)
}

function trimApiBaseUrl(apiBaseUrl: string): string {
  return apiBaseUrl.replace(/\/+$/, '')
}

async function readJsonResponse<T>(response: Response): Promise<T> {
  const payload = await response.json().catch(() => ({})) as { error?: string }
  if (!response.ok) {
    throw new Error(payload.error || `Contribution API returned ${response.status}`)
  }
  return payload as T
}
