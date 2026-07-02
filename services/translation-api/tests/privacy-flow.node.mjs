import test from 'node:test'
import assert from 'node:assert/strict'
import { createEmailConsent, extendEmailConsent, randomConsentToken, verifyEmailConsent } from '../src/email-consents.js'
import { DEFAULT_EMAIL_FROM, buildOutboundEmail, createMailer } from '../src/mailer.js'
import { buildChangeset, hashSecret, normalizeProposalInput, reviewProposal } from '../src/proposals.js'
import { createMemoryRepository } from '../src/repository.memory.js'
import { verifyTurnstileToken } from '../src/turnstile.js'

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

test('health endpoint reports service availability', async () => {
  await withServer({}, async (port) => {
    const response = await fetch(`http://127.0.0.1:${port}/health`)
    assert.equal(response.status, 200)
    assert.deepEqual(await response.json(), { status: 'ok' })
  })
})

test('email transport is disabled when no SMTP or webhook is configured', async () => {
  const mailer = await createMailer({ smtpUrl: '', emailWebhookUrl: '' })
  assert.equal(mailer.enabled, false)
})

test('outbound emails use the Magium sender by default and keep configured overrides', () => {
  assert.equal(DEFAULT_EMAIL_FROM, 'Magium <no-reply@magium.app>')
  assert.deepEqual(
    buildOutboundEmail({
      config: {},
      message: { to: 'reader@example.test', subject: 'Subject', text: 'Body' },
    }),
    {
      from: 'Magium <no-reply@magium.app>',
      to: 'reader@example.test',
      subject: 'Subject',
      text: 'Body',
    },
  )
  assert.equal(
    buildOutboundEmail({
      config: { emailFrom: 'Magium Test <test@example.invalid>' },
      message: { to: 'reader@example.test', subject: 'Subject', text: 'Body' },
    }).from,
    'Magium Test <test@example.invalid>',
  )
})

test('email webhook payload includes the configured sender', async () => {
  const previousFetch = globalThis.fetch
  let requestPayload
  globalThis.fetch = async (_url, options) => {
    requestPayload = JSON.parse(options.body)
    return new Response('{}', { status: 200 })
  }
  try {
    const mailer = await createMailer({
      smtpUrl: '',
      emailWebhookUrl: 'https://email-webhook.example.test/send',
      emailWebhookToken: 'token',
      emailFrom: 'Magium <no-reply@magium.app>',
    })
    await mailer.send({ to: 'reader@example.test', subject: 'Subject', text: 'Body' })
    assert.deepEqual(requestPayload, {
      from: 'Magium <no-reply@magium.app>',
      to: 'reader@example.test',
      subject: 'Subject',
      text: 'Body',
    })
  } finally {
    globalThis.fetch = previousFetch
  }
})

test('email requests are rejected when email notifications are not configured', async () => {
  await withServer({
    TURNSTILE_DISABLED: '1',
    SMTP_URL: '',
    EMAIL_WEBHOOK_URL: '',
    PUBLIC_WEB_URL: '',
    EMAIL_CONSENT_SECRET: '',
    DATABASE_URL: '',
  }, async (port) => {
    const response = await fetch(`http://127.0.0.1:${port}/v1/translation-proposals`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        ...basePayload,
        email: 'reader@example.test',
        notifyRequested: true,
      }),
    })
    const payload = await response.json()
    assert.equal(response.status, 400)
    assert.match(payload.error, /Email notifications are not configured/)
  })
})

test('turnstile validation is mandatory unless explicitly disabled', async () => {
  await assert.rejects(
    verifyTurnstileToken({ token: '', secretKey: 'secret', disabled: false }),
    /captchaToken is required/,
  )
  await assert.doesNotReject(
    verifyTurnstileToken({ token: '', secretKey: '', disabled: true }),
  )
})

test('email consent stores no raw email and is reusable until expiration', async () => {
  const now = new Date('2026-07-02T10:00:00.000Z')
  const token = randomConsentToken()
  const consent = createEmailConsent({
    email: 'Reader@Example.test',
    secret: 'test-secret',
    id: 'ec_test',
    token,
    now,
  })

  assert.equal(consent.id, 'ec_test')
  assert.equal(consent.email, undefined)
  assert.notEqual(consent.emailHmac, 'reader@example.test')
  assert.equal(verifyEmailConsent({
    consent,
    email: 'reader@example.test',
    token,
    secret: 'test-secret',
    now,
  }), true)
  assert.equal(verifyEmailConsent({
    consent,
    email: 'other@example.test',
    token,
    secret: 'test-secret',
    now,
  }), false)
  assert.equal(verifyEmailConsent({
    consent,
    email: 'reader@example.test',
    token,
    secret: 'test-secret',
    now: new Date('2027-07-03T10:00:00.000Z'),
  }), false)

  const extended = extendEmailConsent(consent, new Date('2026-08-02T10:00:00.000Z'))
  assert.equal(new Date(extended.expiresAt).getTime() > new Date(consent.expiresAt).getTime(), true)
})

test('expired email consents are purged from the repository', async () => {
  const repository = createMemoryRepository()
  const active = createEmailConsent({
    email: 'active@example.test',
    secret: 'test-secret',
    id: 'ec_active',
    token: 'active-token',
    now: new Date('2026-07-02T10:00:00.000Z'),
  })
  const expired = {
    ...createEmailConsent({
      email: 'expired@example.test',
      secret: 'test-secret',
      id: 'ec_expired',
      token: 'expired-token',
      now: new Date('2025-07-01T10:00:00.000Z'),
    }),
    expiresAt: '2026-07-01T10:00:00.000Z',
  }
  await repository.saveEmailConsent(active)
  await repository.saveEmailConsent(expired)

  assert.equal(await repository.deleteExpiredEmailConsents('2026-07-02T10:00:00.000Z'), 1)
  assert.equal((await repository.getEmailConsentById('ec_active')).id, 'ec_active')
  assert.equal(await repository.getEmailConsentById('ec_expired'), null)
})

test('email contact is separated, confirmed by token, and deleted on rejection', async () => {
  const repository = createMemoryRepository()
  const proposal = normalizeProposalInput({
    ...basePayload,
    email: 'reader@example.test',
    notifyRequested: true,
  }, { id: 'proposal-1', publicId: 'tr_1' })
  await repository.createProposal(proposal, {
    proposalId: proposal.id,
    email: proposal.email,
    tokenHash: hashSecret('token'),
    confirmedAt: null,
    createdAt: proposal.createdAt,
  })

  const contact = await repository.getContactByProposalId(proposal.id)
  assert.equal(contact.email, 'reader@example.test')
  await repository.confirmContact(proposal.id, new Date().toISOString())
  const rejected = reviewProposal(proposal, { decision: 'reject' })
  await repository.updateProposal(rejected)
  await repository.deleteContact(rejected.id)

  assert.equal(await repository.getContactByProposalId(proposal.id), null)
})

test('confirmed contacts are deleted after changeset publication cleanup', async () => {
  const repository = createMemoryRepository()
  const proposal = reviewProposal(normalizeProposalInput({
    ...basePayload,
    email: 'reader@example.test',
    notifyRequested: true,
  }, { id: 'proposal-1', publicId: 'tr_1' }), {
    decision: 'accept',
    finalText: 'Texte final',
  })
  await repository.createProposal(proposal, {
    proposalId: proposal.id,
    email: 'reader@example.test',
    tokenHash: hashSecret('token'),
    confirmedAt: new Date().toISOString(),
    createdAt: proposal.createdAt,
  })
  const changeset = buildChangeset([proposal], { title: 'FR ch1' }, { id: 'changeset-1', publicId: 'cs_1' })
  await repository.createChangeset(changeset)

  assert.equal((await repository.listChangesetContacts(changeset.id)).length, 1)
  await repository.deleteContactsForChangeset(changeset.id)
  assert.equal((await repository.listChangesetContacts(changeset.id)).length, 0)
})

async function withServer(env, callback) {
  const previous = new Map()
  for (const [key, value] of Object.entries(env)) {
    previous.set(key, process.env[key])
    process.env[key] = value
  }
  const { server } = await import(`../src/server.js?test=${Date.now()}-${Math.random()}`)
  await new Promise((resolve) => server.listen(0, resolve))
  try {
    const address = server.address()
    const port = typeof address === 'object' && address ? address.port : 0
    await callback(port)
  } finally {
    await new Promise((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve())
    })
    for (const [key, value] of previous) {
      if (value === undefined) {
        delete process.env[key]
      } else {
        process.env[key] = value
      }
    }
  }
}
