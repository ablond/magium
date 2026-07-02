import crypto from 'node:crypto'
import { moderatePseudonym } from './moderation.js'

const HASH_RE = /^[a-f0-9]{64}$/i
const LOCALE_RE = /^[a-z]{2}(?:-[a-z0-9]+)?$/i
const ID_RE = /^[A-Za-z0-9_.:-]+$/
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const TARGET_TYPES = new Set(['choice', 'paragraph'])
const PARAGRAPH_BREAK_RE = /\r?\n(?:[ \t]*\r?\n)+/
const PUBLIC_STATUS_FIELDS = [
  'publicId',
  'status',
  'locale',
  'chapterId',
  'updatedAt',
]

export function normalizeProposalInput(input, options = {}) {
  const now = options.now ?? new Date()
  const body = input && typeof input === 'object' ? input : {}
  const errors = []
  const required = [
    'contentVersion',
    'locale',
    'chapterId',
    'sceneId',
    'messageId',
    'targetType',
    'currentTextHash',
    'sourceTextHash',
    'proposedText',
  ]

  for (const key of required) {
    if (!stringValue(body[key])) errors.push(`${key} is required`)
  }

  const locale = stringValue(body.locale)
  const targetType = stringValue(body.targetType)
  const segmentIndex = integerValue(body.segmentIndex)
  const segmentCount = integerValue(body.segmentCount)
  const hasCurrentText = typeof body.currentText === 'string'
  const currentText = hasCurrentText ? body.currentText : ''
  const currentTextHash = stringValue(body.currentTextHash).toLowerCase()
  const sourceTextHash = stringValue(body.sourceTextHash).toLowerCase()
  const proposedText = stringValue(body.proposedText)
  const note = stringValue(body.note)
  const email = stringValue(body.email).toLowerCase()
  const notifyRequested = Boolean(body.notifyRequested) && email.length > 0
  const creditRequested = Boolean(body.creditRequested)
  const pseudonymModeration = moderatePseudonym(body.pseudonym, options.pseudonymBlocklist ?? [])
  const pseudonym = pseudonymModeration.value ?? ''

  if (locale && !LOCALE_RE.test(locale)) errors.push('locale is invalid')
  if (targetType && !TARGET_TYPES.has(targetType)) errors.push('targetType is invalid')
  if (targetType === 'paragraph') {
    if (segmentIndex === null) errors.push('segmentIndex is required for paragraph proposals')
    if (segmentCount === null) errors.push('segmentCount is required for paragraph proposals')
    if (segmentIndex !== null && segmentIndex < 0) errors.push('segmentIndex is invalid')
    if (segmentCount !== null && segmentCount < 1) errors.push('segmentCount is invalid')
    if (segmentIndex !== null && segmentCount !== null && segmentIndex >= segmentCount) errors.push('segmentIndex must be lower than segmentCount')
    if (PARAGRAPH_BREAK_RE.test(proposedText.trim())) errors.push('paragraph proposals must contain a single paragraph')
  }
  if (currentTextHash && !HASH_RE.test(currentTextHash)) errors.push('currentTextHash is invalid')
  if (sourceTextHash && !HASH_RE.test(sourceTextHash)) errors.push('sourceTextHash is invalid')
  if (hasCurrentText && currentText.length > 12000) errors.push('currentText is too long')
  if (hasCurrentText && currentTextHash && hashSecret(currentText) !== currentTextHash) errors.push('currentText does not match currentTextHash')
  for (const key of ['chapterId', 'sceneId', 'messageId']) {
    const value = stringValue(body[key])
    if (value && !ID_RE.test(value)) errors.push(`${key} is invalid`)
  }
  if (proposedText.length > 12000) errors.push('proposedText is too long')
  if (note.length > 2000) errors.push('note is too long')
  if (email && !EMAIL_RE.test(email)) errors.push('email is invalid')
  if (notifyRequested && !email) errors.push('email is required for notifications')
  if (creditRequested && !pseudonym) errors.push('pseudonym is required for credits')
  if (!pseudonymModeration.ok) errors.push(pseudonymModeration.reason)

  if (errors.length) {
    const error = new Error(errors.join('; '))
    error.statusCode = 400
    throw error
  }

  return {
    id: options.id ?? crypto.randomUUID(),
    publicId: options.publicId ?? randomPublicId(),
    status: 'pending',
    contentVersion: stringValue(body.contentVersion),
    locale,
    chapterId: stringValue(body.chapterId),
    sceneId: stringValue(body.sceneId),
    messageId: stringValue(body.messageId),
    targetType,
    segmentIndex: targetType === 'paragraph' ? segmentIndex : null,
    segmentCount: targetType === 'paragraph' ? segmentCount : null,
    currentText,
    currentTextHash,
    sourceTextHash,
    proposedText,
    finalText: null,
    note,
    pseudonym,
    creditRequested,
    creditApproved: false,
    moderatorNote: '',
    changesetId: null,
    email: notifyRequested ? email : '',
    emailConfirmed: false,
    emailConfirmationRequired: notifyRequested,
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
  }
}

export function reviewProposal(proposal, input, options = {}) {
  const decision = stringValue(input?.decision)
  const now = options.now ?? new Date()
  const next = { ...proposal, updatedAt: now.toISOString() }

  if (decision === 'reject') {
    next.status = 'rejected'
    next.finalText = null
    next.moderatorNote = stringValue(input?.moderatorNote)
    return next
  }

  if (decision === 'stale') {
    next.status = 'stale'
    next.finalText = null
    next.moderatorNote = stringValue(input?.moderatorNote)
    return next
  }

  if (decision !== 'accept') {
    const error = new Error('decision must be accept, reject, or stale')
    error.statusCode = 400
    throw error
  }

  const finalText = stringValue(input?.finalText || proposal.proposedText)
  if (!finalText) {
    const error = new Error('finalText is required')
    error.statusCode = 400
    throw error
  }
  if (proposal.targetType === 'paragraph' && PARAGRAPH_BREAK_RE.test(finalText.trim())) {
    const error = new Error('paragraph proposals must contain a single paragraph')
    error.statusCode = 400
    throw error
  }
  next.status = 'accepted'
  next.finalText = finalText
  next.creditApproved = Boolean(input?.creditApproved) && Boolean(proposal.pseudonym)
  next.moderatorNote = stringValue(input?.moderatorNote)
  return next
}

export function buildPublicStatus(proposal) {
  const status = {
    publicId: proposal.publicId,
    status: proposal.status,
    locale: proposal.locale,
    chapterId: proposal.chapterId,
    updatedAt: proposal.updatedAt,
  }
  return Object.fromEntries(PUBLIC_STATUS_FIELDS.map((field) => [field, status[field]]))
}

export function buildChangeset(proposals, input, options = {}) {
  const now = options.now ?? new Date()
  const title = stringValue(input?.title)
  if (!title) {
    const error = new Error('title is required')
    error.statusCode = 400
    throw error
  }
  const seen = new Set()
  const items = []
  for (const proposal of proposals) {
    if (proposal.status !== 'accepted') {
      const error = new Error(`proposal ${proposal.publicId} is not accepted`)
      error.statusCode = 400
      throw error
    }
    const key = changesetItemKey(proposal)
    if (seen.has(key)) {
      const error = new Error(`changeset has multiple final texts for ${key}`)
      error.statusCode = 400
      throw error
    }
    seen.add(key)
    items.push({
      proposalId: proposal.id,
      publicId: proposal.publicId,
      locale: proposal.locale,
      chapterId: proposal.chapterId,
      messageId: proposal.messageId,
      targetType: proposal.targetType,
      segmentIndex: proposal.segmentIndex,
      segmentCount: proposal.segmentCount,
      currentTextHash: proposal.currentTextHash,
      finalText: proposal.finalText,
      credit: proposal.creditApproved && proposal.pseudonym ? proposal.pseudonym : '',
    })
  }
  return {
    id: options.id ?? crypto.randomUUID(),
    publicId: options.publicId ?? randomPublicId('cs'),
    title,
    status: 'ready',
    items,
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
  }
}

export function randomEmailToken() {
  return crypto.randomBytes(32).toString('base64url')
}

export function hashSecret(value) {
  return crypto.createHash('sha256').update(String(value)).digest('hex')
}

function randomPublicId(prefix = 'tr') {
  return `${prefix}_${crypto.randomBytes(8).toString('base64url')}`
}

function stringValue(value) {
  return typeof value === 'string' ? value.trim() : ''
}

function integerValue(value) {
  if (value === undefined || value === null || value === '') return null
  const number = Number(value)
  return Number.isInteger(number) ? number : null
}

function changesetItemKey(proposal) {
  const target = proposal.targetType === 'paragraph'
    ? `paragraph:${proposal.segmentIndex}`
    : `${proposal.targetType}:whole`
  return `${proposal.locale}/${proposal.chapterId}/${proposal.messageId}/${target}`
}
