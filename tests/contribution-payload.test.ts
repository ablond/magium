import { describe, expect, it } from 'vitest'
import { buildTranslationProposalPayload, hashContributionText, isTechnicalContributionField, type TranslationContributionTarget } from '../src/lib/contributions/payload'

const target: TranslationContributionTarget = {
  contentVersion: 'magium-test',
  locale: 'fr',
  chapterId: 'ch1',
  sceneId: 'Ch1-Intro1',
  messageId: 'ch1.Ch1_Intro1.p1',
  targetType: 'paragraph',
  segmentIndex: 2,
  segmentCount: 5,
  currentText: 'Texte actuel',
  sourceText: 'Current text',
  currentTextHash: 'a'.repeat(64),
  sourceTextHash: 'b'.repeat(64),
}

describe('translation contribution payloads', () => {
  it('builds a trimmed payload with optional identity fields only when requested', () => {
    const payload = buildTranslationProposalPayload(target, {
      proposedText: '  Texte corrigé  ',
      note: '  plus naturel ',
      pseudonym: '  Lecteur ',
      creditRequested: true,
      email: '  reader@example.test ',
      notifyRequested: true,
    }, 'captcha-token')

    expect(payload).toMatchObject({
      proposedText: 'Texte corrigé',
      note: 'plus naturel',
      pseudonym: 'Lecteur',
      creditRequested: true,
      email: 'reader@example.test',
      notifyRequested: true,
      captchaToken: 'captcha-token',
      segmentIndex: 2,
      segmentCount: 5,
      currentText: 'Texte actuel',
    })
  })

  it('does not request credits or notifications when pseudonym and email are blank', () => {
    const payload = buildTranslationProposalPayload(target, {
      proposedText: 'Texte corrigé',
      note: '',
      pseudonym: '',
      creditRequested: true,
      email: '',
      notifyRequested: true,
    }, '')

    expect(payload.creditRequested).toBe(false)
    expect(payload.notifyRequested).toBe(false)
    expect(payload).not.toHaveProperty('pseudonym')
    expect(payload).not.toHaveProperty('email')
  })

  it('adds a reusable email consent only when email notifications are requested', () => {
    const payload = buildTranslationProposalPayload(target, {
      proposedText: 'Texte corrigé',
      note: '',
      pseudonym: '',
      creditRequested: false,
      email: 'reader@example.test',
      notifyRequested: true,
      emailConsentId: 'ec_local',
      emailConsentToken: 'token',
    }, '')

    expect(payload).toMatchObject({
      email: 'reader@example.test',
      notifyRequested: true,
      emailConsentId: 'ec_local',
      emailConsentToken: 'token',
    })
  })

  it('hashes text with SHA-256 hex and treats internal routing fields as technical', async () => {
    await expect(hashContributionText('Texte actuel')).resolves.toMatch(/^[a-f0-9]{64}$/)
    expect(isTechnicalContributionField('messageId')).toBe(true)
    expect(isTechnicalContributionField('segmentIndex')).toBe(true)
    expect(isTechnicalContributionField('pseudonym')).toBe(false)
  })
})
