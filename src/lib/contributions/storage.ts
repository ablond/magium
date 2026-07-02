import { idbClear, idbDelete, idbGet, idbSet } from '../storage/idb'

const PROFILE_KEY = 'current'
const EMAIL_CONSENT_FRAGMENT_KEY = 'translation-email-consent'

export type ContributionProfile = {
  pseudonym: string
  email: string
  updatedAt: string
}

export type ContributionEmailConsent = {
  emailHash: string
  id: string
  token: string
  expiresAt: string
  updatedAt: string
}

export type ContributionEmailConsentPayload = {
  publicId: string
  id: string
  token: string
  expiresAt: string
}

type PendingContributionEmailConsent = {
  publicId: string
  emailHash: string
  createdAt: string
}

export async function loadContributionProfile(): Promise<ContributionProfile | null> {
  return await idbGet<ContributionProfile>('contributionProfile', PROFILE_KEY) ?? null
}

export async function saveContributionProfile(profile: Omit<ContributionProfile, 'updatedAt'>): Promise<void> {
  await idbSet('contributionProfile', PROFILE_KEY, {
    ...profile,
    updatedAt: new Date().toISOString(),
  })
}

export async function clearContributionProfile(): Promise<void> {
  await idbDelete('contributionProfile', PROFILE_KEY)
}

export async function loadContributionEmailConsent(email: string): Promise<ContributionEmailConsent | null> {
  const emailHash = await hashContributionEmail(email)
  const consent = await idbGet<ContributionEmailConsent>('contributionEmailConsents', emailHash)
  if (!consent) return null
  if (new Date(consent.expiresAt).getTime() <= Date.now()) {
    await idbDelete('contributionEmailConsents', emailHash)
    return null
  }
  return consent
}

export async function savePendingContributionEmailConsent(publicId: string, email: string): Promise<void> {
  const emailHash = await hashContributionEmail(email)
  await idbSet<PendingContributionEmailConsent>('contributionEmailPending', publicId, {
    publicId,
    emailHash,
    createdAt: new Date().toISOString(),
  })
}

export async function applyContributionEmailConsent(payload: ContributionEmailConsentPayload): Promise<boolean> {
  const pending = await idbGet<PendingContributionEmailConsent>('contributionEmailPending', payload.publicId)
  if (!pending) return false
  await saveContributionEmailConsentForHash(pending.emailHash, payload)
  await idbDelete('contributionEmailPending', payload.publicId)
  return true
}

export async function saveContributionEmailConsentForEmail(email: string, payload: Omit<ContributionEmailConsentPayload, 'publicId'>): Promise<void> {
  await saveContributionEmailConsentForHash(await hashContributionEmail(email), payload)
}

export async function clearContributionEmailState(): Promise<void> {
  await idbClear('contributionEmailConsents')
  await idbClear('contributionEmailPending')
}

export function parseContributionEmailConsentFragment(hash: string): ContributionEmailConsentPayload | null {
  const fragment = hash.startsWith('#') ? hash.slice(1) : hash
  const params = new URLSearchParams(fragment)
  const encoded = params.get(EMAIL_CONSENT_FRAGMENT_KEY)
  if (!encoded) return null
  try {
    const payload = JSON.parse(encoded) as Partial<ContributionEmailConsentPayload>
    if (
      typeof payload.publicId === 'string' &&
      typeof payload.id === 'string' &&
      typeof payload.token === 'string' &&
      typeof payload.expiresAt === 'string'
    ) {
      return {
        publicId: payload.publicId,
        id: payload.id,
        token: payload.token,
        expiresAt: payload.expiresAt,
      }
    }
  } catch {
    return null
  }
  return null
}

export function removeContributionEmailConsentFragment(location: Location, history: History): void {
  const fragment = location.hash.startsWith('#') ? location.hash.slice(1) : location.hash
  const params = new URLSearchParams(fragment)
  if (!params.has(EMAIL_CONSENT_FRAGMENT_KEY)) return
  params.delete(EMAIL_CONSENT_FRAGMENT_KEY)
  const nextHash = params.toString()
  const nextUrl = `${location.pathname}${location.search}${nextHash ? `#${nextHash}` : ''}`
  history.replaceState(null, '', nextUrl)
}

export async function hashContributionEmail(email: string): Promise<string> {
  const normalizedEmail = email.trim().toLowerCase()
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(normalizedEmail))
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('')
}

async function saveContributionEmailConsentForHash(emailHash: string, payload: Omit<ContributionEmailConsentPayload, 'publicId'>): Promise<void> {
  await idbSet<ContributionEmailConsent>('contributionEmailConsents', emailHash, {
    emailHash,
    id: payload.id,
    token: payload.token,
    expiresAt: payload.expiresAt,
    updatedAt: new Date().toISOString(),
  })
}
