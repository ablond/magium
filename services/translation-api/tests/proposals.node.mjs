import test from 'node:test'
import assert from 'node:assert/strict'
import { buildChangeset, hashSecret, normalizeProposalInput, reviewProposal } from '../src/proposals.js'

const basePayload = {
  contentVersion: 'magium-test',
  locale: 'fr',
  chapterId: 'ch1',
  sceneId: 'Ch1-Intro1',
  messageId: 'ch1.Ch1_Intro1.p1',
  targetType: 'paragraph',
  segmentIndex: 0,
  segmentCount: 1,
  currentTextHash: 'a'.repeat(64),
  sourceTextHash: 'b'.repeat(64),
  proposedText: 'Texte corrigé',
}

test('normalizes an anonymous proposal by default', () => {
  const proposal = normalizeProposalInput(basePayload, { id: 'proposal-1', publicId: 'tr_public' })

  assert.equal(proposal.publicId, 'tr_public')
  assert.equal(proposal.status, 'pending')
  assert.equal(proposal.segmentIndex, 0)
  assert.equal(proposal.segmentCount, 1)
  assert.equal(proposal.currentText, '')
  assert.equal(proposal.email, '')
  assert.equal(proposal.creditRequested, false)
})

test('stores current text when provided and validates it against the current hash', () => {
  const currentText = 'Texte actuel'
  const proposal = normalizeProposalInput({
    ...basePayload,
    currentText,
    currentTextHash: hashSecret(currentText),
  })

  assert.equal(proposal.currentText, currentText)
  assert.throws(() => normalizeProposalInput({
    ...basePayload,
    currentText,
    currentTextHash: 'a'.repeat(64),
  }), /currentText does not match currentTextHash/)
})

test('requires segment metadata for paragraph proposals', () => {
  const { segmentIndex, segmentCount, ...payload } = basePayload
  assert.throws(() => normalizeProposalInput(payload), /segmentIndex is required/)
})

test('rejects paragraph proposals that contain multiple paragraphs', () => {
  assert.throws(() => normalizeProposalInput({
    ...basePayload,
    proposedText: 'Un paragraphe\n\nUn autre paragraphe',
  }), /single paragraph/)
})

test('rejects accepted paragraph final texts that contain multiple paragraphs', () => {
  const proposal = normalizeProposalInput(basePayload)

  assert.throws(() => reviewProposal(proposal, {
    decision: 'accept',
    finalText: 'Un paragraphe\n\nUn autre paragraphe',
  }), /single paragraph/)
})

test('requires an email only when notifications are requested', () => {
  const proposal = normalizeProposalInput({
    ...basePayload,
    email: 'reader@example.test',
    notifyRequested: true,
  })

  assert.equal(proposal.email, 'reader@example.test')
  assert.equal(proposal.emailConfirmationRequired, true)
})

test('rejects credit requests without a usable pseudonym', () => {
  assert.throws(() => normalizeProposalInput({
    ...basePayload,
    creditRequested: true,
    pseudonym: '',
  }), /pseudonym is required/)
})

test('rejects moderated pseudonyms through the configured blocklist', () => {
  assert.throws(() => normalizeProposalInput({
    ...basePayload,
    creditRequested: true,
    pseudonym: 'badword-reader',
  }, { pseudonymBlocklist: ['badword'] }), /moderation/)
})

test('builds a changeset from accepted proposals and rejects duplicate segment ids', () => {
  const accepted = reviewProposal(normalizeProposalInput(basePayload, { id: 'proposal-1', publicId: 'tr_1' }), {
    decision: 'accept',
    finalText: 'Texte final',
  })
  const acceptedSecondSegment = reviewProposal(normalizeProposalInput({
    ...basePayload,
    segmentIndex: 1,
    segmentCount: 2,
  }, { id: 'proposal-2', publicId: 'tr_2' }), {
    decision: 'accept',
    finalText: 'Autre texte final',
  })
  const changeset = buildChangeset([accepted], { title: 'FR ch1' }, { id: 'changeset-1', publicId: 'cs_1' })

  assert.equal(changeset.publicId, 'cs_1')
  assert.equal(changeset.items[0].finalText, 'Texte final')
  assert.equal(changeset.items[0].segmentIndex, 0)
  assert.doesNotThrow(() => buildChangeset([accepted, acceptedSecondSegment], { title: 'different segments' }))

  assert.throws(() => buildChangeset([accepted, { ...accepted, id: 'proposal-2', publicId: 'tr_2' }], { title: 'duplicate' }), /multiple final texts/)
})
