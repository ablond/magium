export type ContributionTargetType = 'choice' | 'paragraph'

export type TranslationContributionTarget = {
  contentVersion: string
  locale: string
  chapterId: string
  sceneId: string
  messageId: string
  targetType: ContributionTargetType
  segmentIndex?: number
  segmentCount?: number
  currentText: string
  sourceText: string
  currentTextHash: string
  sourceTextHash: string
}

export type TranslationContributionDraft = {
  proposedText: string
  note: string
  pseudonym: string
  creditRequested: boolean
  email: string
  notifyRequested: boolean
  emailConsentId?: string
  emailConsentToken?: string
}

export type TranslationProposalPayload = Omit<TranslationContributionTarget, 'sourceText'> & {
  proposedText: string
  note?: string
  pseudonym?: string
  creditRequested: boolean
  email?: string
  notifyRequested: boolean
  emailConsentId?: string
  emailConsentToken?: string
  captchaToken: string
}

export async function hashContributionText(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('')
}

export function buildTranslationProposalPayload(
  target: TranslationContributionTarget,
  draft: TranslationContributionDraft,
  captchaToken: string,
): TranslationProposalPayload {
  const proposedText = draft.proposedText.trim()
  const note = draft.note.trim()
  const pseudonym = draft.pseudonym.trim()
  const email = draft.email.trim()
  const creditRequested = draft.creditRequested && pseudonym.length > 0
  const notifyRequested = draft.notifyRequested && email.length > 0

  return {
    contentVersion: target.contentVersion,
    locale: target.locale,
    chapterId: target.chapterId,
    sceneId: target.sceneId,
    messageId: target.messageId,
    targetType: target.targetType,
    ...(target.segmentIndex !== undefined ? { segmentIndex: target.segmentIndex } : {}),
    ...(target.segmentCount !== undefined ? { segmentCount: target.segmentCount } : {}),
    currentText: target.currentText,
    currentTextHash: target.currentTextHash,
    sourceTextHash: target.sourceTextHash,
    proposedText,
    ...(note ? { note } : {}),
    ...(pseudonym ? { pseudonym } : {}),
    creditRequested,
    ...(email ? { email } : {}),
    notifyRequested,
    ...(notifyRequested && draft.emailConsentId && draft.emailConsentToken
      ? { emailConsentId: draft.emailConsentId, emailConsentToken: draft.emailConsentToken }
      : {}),
    captchaToken,
  }
}

export function isTechnicalContributionField(label: string): boolean {
  return ['chapterId', 'contentVersion', 'currentTextHash', 'messageId', 'sceneId', 'segmentCount', 'segmentIndex', 'sourceTextHash'].includes(label)
}
