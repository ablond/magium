import http from 'node:http'
import { readFile } from 'node:fs/promises'
import { URL } from 'node:url'
import { createAdminAuth } from './admin-auth.js'
import { buildTextDiffParts } from './admin-diff.js'
import { buildEmailConsentRedirectUrl, createEmailConsent, extendEmailConsent, randomConsentToken, verifyEmailConsent } from './email-consents.js'
import { dispatchChangesetWorkflow } from './github.js'
import { DEFAULT_EMAIL_FROM, confirmationEmail, createMailer, proposalsClosedEmail, proposalsPublishedEmail } from './mailer.js'
import { buildChangeset, buildPublicStatus, hashSecret, normalizeProposalInput, randomEmailToken, reviewProposal } from './proposals.js'
import { createMemoryRepository } from './repository.memory.js'
import { createPostgresRepository } from './repository.postgres.js'
import { verifyTurnstileToken } from './turnstile.js'

const config = readConfig()
const repository = await createRepository(config)
const mailer = await createMailer(config)
const adminAuth = createAdminAuth(config)
const rateLimiter = createRateLimiter(config.rateLimitWindowMs, config.rateLimitMax)
const loginRateLimiter = createRateLimiter(config.adminLoginRateLimitWindowMs, config.adminLoginRateLimitMax)

const server = http.createServer(async (request, response) => {
  try {
    await route(request, response)
  } catch (caught) {
    writeError(response, caught)
  }
})

if (process.argv[1] === new URL(import.meta.url).pathname) {
  server.listen(config.port, () => {
    console.info(`[translation-api] listening on :${config.port}`)
  })
}

export { server }

async function route(request, response) {
  const url = new URL(request.url ?? '/', `http://${request.headers.host ?? 'localhost'}`)
  writeCorsHeaders(response)
  if (request.method === 'OPTIONS') {
    response.writeHead(204)
    response.end()
    return
  }

  if (request.method === 'GET' && url.pathname === '/health') {
    writeJson(response, 200, { status: 'ok' })
    return
  }

  if (request.method === 'GET' && (url.pathname === '/admin' || url.pathname === '/admin/')) {
    await serveAdminIndex(response)
    return
  }

  if (request.method === 'GET' && url.pathname.startsWith('/admin/assets/')) {
    await serveAdminAsset(response, url.pathname)
    return
  }

  if (request.method === 'GET' && url.pathname === '/admin/session') {
    getAdminSession(request, response)
    return
  }

  if (request.method === 'POST' && url.pathname === '/admin/login') {
    await loginAdmin(request, response)
    return
  }

  if (request.method === 'POST' && url.pathname === '/admin/logout') {
    logoutAdmin(request, response)
    return
  }

  if (request.method === 'POST' && url.pathname === '/v1/translation-proposals') {
    await createTranslationProposal(request, response)
    return
  }

  const statusMatch = url.pathname.match(/^\/v1\/translation-proposals\/([^/]+)\/status$/)
  if (request.method === 'GET' && statusMatch) {
    await getTranslationProposalStatus(response, statusMatch[1])
    return
  }

  const confirmMatch = url.pathname.match(/^\/v1\/translation-proposals\/([^/]+)\/confirm-email$/)
  if ((request.method === 'POST' || request.method === 'GET') && confirmMatch) {
    await confirmTranslationEmail(request, response, confirmMatch[1], url)
    return
  }

  if (url.pathname.startsWith('/v1/admin/')) {
    const auth = requireAdmin(request)
    if (auth.type === 'session' && request.method !== 'GET') {
      requireAdminCsrf(request, auth.session)
    }
    await routeAdmin(request, response, url)
    return
  }

  writeJson(response, 404, { error: 'Not found' })
}

async function createTranslationProposal(request, response) {
  const ip = clientIp(request)
  const now = new Date()
  rateLimiter.assert(ip)
  const body = await readJson(request)
  await verifyTurnstileToken({
    token: body.captchaToken,
    secretKey: config.turnstileSecretKey,
    remoteIp: ip,
    disabled: config.turnstileDisabled,
  })
  const proposal = normalizeProposalInput(body, { pseudonymBlocklist: config.pseudonymBlocklist, now })
  let contact = null
  let token = ''
  let notificationStatus = 'none'
  let emailConsentExpiresAt = ''
  if (proposal.email) {
    requireEmailNotificationsConfigured()
    await repository.deleteExpiredEmailConsents(now.toISOString())
    const existingConsent = await getReusableEmailConsent({
      email: proposal.email,
      consentId: body.emailConsentId,
      consentToken: body.emailConsentToken,
      now,
    })
    if (existingConsent) {
      const extendedConsent = extendEmailConsent(existingConsent, now)
      await repository.saveEmailConsent(extendedConsent)
      contact = {
        proposalId: proposal.id,
        email: proposal.email,
        tokenHash: extendedConsent.tokenHash,
        confirmedAt: now.toISOString(),
        createdAt: proposal.createdAt,
      }
      notificationStatus = 'confirmed'
      emailConsentExpiresAt = extendedConsent.expiresAt
    } else {
      token = randomEmailToken()
      contact = {
        proposalId: proposal.id,
        email: proposal.email,
        tokenHash: hashSecret(token),
        confirmedAt: null,
        createdAt: proposal.createdAt,
      }
      notificationStatus = 'confirmation_sent'
    }
  }
  await repository.createProposal(proposal, contact)
  if (contact && notificationStatus === 'confirmation_sent') {
    await mailer.send(confirmationEmail({
      to: contact.email,
      confirmUrl: `${config.publicApiUrl}/v1/translation-proposals/${encodeURIComponent(proposal.publicId)}/confirm-email?token=${encodeURIComponent(token)}`,
    }))
  }
  writeJson(response, 201, {
    publicId: proposal.publicId,
    status: proposal.status,
    emailConfirmationRequired: notificationStatus === 'confirmation_sent',
    notificationStatus,
    ...(emailConsentExpiresAt ? { emailConsentExpiresAt } : {}),
  })
}

async function getTranslationProposalStatus(response, publicId) {
  const proposal = await repository.getProposalByPublicId(publicId)
  if (!proposal) {
    writeJson(response, 404, { error: 'Proposal not found' })
    return
  }
  writeJson(response, 200, buildPublicStatus(proposal))
}

async function confirmTranslationEmail(request, response, publicId, url) {
  const now = new Date()
  const body = request.method === 'POST' ? await readJson(request) : {}
  const token = String(body.token ?? url.searchParams.get('token') ?? '')
  const proposal = await repository.getProposalByPublicId(publicId)
  if (!proposal) {
    writeJson(response, 404, { error: 'Proposal not found' })
    return
  }
  const contact = await repository.getContactByProposalId(proposal.id)
  if (!contact || contact.tokenHash !== hashSecret(token)) {
    writeJson(response, 400, { error: 'Invalid confirmation token' })
    return
  }
  requireEmailNotificationsConfigured()
  await repository.confirmContact(proposal.id, now.toISOString())
  const consentToken = randomConsentToken()
  const consent = createEmailConsent({
    email: contact.email,
    secret: config.emailConsentSecret,
    token: consentToken,
    now,
  })
  await repository.saveEmailConsent(consent)
  if (request.method === 'GET') {
    response.writeHead(302, {
      location: buildEmailConsentRedirectUrl({
        publicWebUrl: config.publicWebUrl,
        publicId,
        consent,
        token: consentToken,
      }),
    })
    response.end()
  } else {
    writeJson(response, 200, {
      status: 'confirmed',
      emailConsent: {
        publicId,
        id: consent.id,
        token: consentToken,
        expiresAt: consent.expiresAt,
      },
    })
  }
}

async function serveAdminIndex(response) {
  const html = await readFile(new URL('../admin/index.html', import.meta.url))
  writeResponse(response, 200, html, {
    'content-type': 'text/html; charset=utf-8',
    'cache-control': 'no-store',
  })
}

async function serveAdminAsset(response, pathname) {
  const asset = ADMIN_ASSETS.get(pathname)
  if (!asset) {
    writeJson(response, 404, { error: 'Admin asset not found' })
    return
  }
  const body = await readFile(asset.url)
  writeResponse(response, 200, body, {
    'content-type': asset.contentType,
    'cache-control': 'no-store',
  })
}

function getAdminSession(request, response) {
  const session = adminAuth.readSession(request.headers.cookie)
  if (!session) {
    writeJson(response, 200, { authenticated: false, adminConfigured: adminAuth.enabled })
    return
  }
  writeJson(response, 200, {
    authenticated: true,
    csrfToken: session.csrf,
    expiresAt: new Date(session.exp).toISOString(),
  })
}

async function loginAdmin(request, response) {
  loginRateLimiter.assert(`admin-login:${clientIp(request)}`)
  if (!adminAuth.enabled) {
    const error = new Error('Admin web authentication is not configured')
    error.statusCode = 503
    throw error
  }
  const body = await readJson(request)
  if (!adminAuth.verifyPassword(body.password)) {
    const error = new Error('Invalid admin password')
    error.statusCode = 401
    throw error
  }
  const session = adminAuth.createSession()
  writeJson(response, 200, {
    authenticated: true,
    csrfToken: session.csrfToken,
    expiresAt: session.expiresAt,
  }, {
    'set-cookie': session.cookie,
  })
}

function logoutAdmin(request, response) {
  const session = adminAuth.readSession(request.headers.cookie)
  if (session) adminAuth.revokeSession(session)
  writeJson(response, 200, { authenticated: false }, {
    'set-cookie': adminAuth.clearCookie(),
  })
}

async function routeAdmin(request, response, url) {
  if (request.method === 'GET' && url.pathname === '/v1/admin/proposals') {
    const proposals = await repository.listProposals({ status: url.searchParams.get('status') || undefined })
    writeJson(response, 200, { proposals: proposals.map(redactAdminProposal) })
    return
  }

  if (request.method === 'GET' && url.pathname === '/v1/admin/changesets') {
    const changesets = await repository.listChangesets({ status: url.searchParams.get('status') || undefined })
    writeJson(response, 200, { changesets: changesets.map(redactChangesetSummary) })
    return
  }

  const reviewMatch = url.pathname.match(/^\/v1\/admin\/proposals\/([^/]+)\/review$/)
  if (request.method === 'POST' && reviewMatch) {
    const proposal = await requireProposal(reviewMatch[1])
    const next = reviewProposal(proposal, await readJson(request))
    await repository.updateProposal(next)
    if (next.status === 'rejected' || next.status === 'stale') {
      await repository.deleteContact(next.id)
    }
    writeJson(response, 200, { proposal: redactAdminProposal(next) })
    return
  }

  if (request.method === 'POST' && url.pathname === '/v1/admin/proposals/bulk-review') {
    const result = await bulkReviewProposals(await readJson(request))
    writeJson(response, 200, result)
    return
  }

  if (request.method === 'POST' && url.pathname === '/v1/admin/changesets') {
    const body = await readJson(request)
    const proposals = []
    for (const publicId of body.proposalPublicIds ?? []) {
      proposals.push(await requireProposal(publicId))
    }
    const changeset = buildChangeset(proposals, body)
    await repository.createChangeset(changeset)
    writeJson(response, 201, { changeset: redactChangeset(changeset) })
    return
  }

  const changesetMatch = url.pathname.match(/^\/v1\/admin\/changesets\/([^/]+)$/)
  if (request.method === 'GET' && changesetMatch) {
    const changeset = await requireChangeset(changesetMatch[1])
    writeJson(response, 200, { changeset: redactChangeset(changeset) })
    return
  }

  const exportMatch = url.pathname.match(/^\/v1\/admin\/changesets\/([^/]+)\/export$/)
  if (request.method === 'GET' && exportMatch) {
    const changeset = await requireChangeset(exportMatch[1])
    writeJson(response, 200, exportChangeset(changeset))
    return
  }

  const dispatchMatch = url.pathname.match(/^\/v1\/admin\/changesets\/([^/]+)\/dispatch-pr$/)
  if (request.method === 'POST' && dispatchMatch) {
    const changeset = await requireChangeset(dispatchMatch[1])
    await dispatchChangesetWorkflow(config, changeset)
    const next = { ...changeset, status: 'dispatched', updatedAt: new Date().toISOString() }
    await repository.updateChangeset(next)
    writeJson(response, 200, { changeset: redactChangeset(next) })
    return
  }

  const staleMatch = url.pathname.match(/^\/v1\/admin\/changesets\/([^/]+)\/stale$/)
  if (request.method === 'POST' && staleMatch) {
    const changeset = await requireChangeset(staleMatch[1])
    const next = { ...changeset, status: 'stale', updatedAt: new Date().toISOString() }
    await repository.updateChangeset(next)
    writeJson(response, 200, { changeset: redactChangeset(next) })
    return
  }

  const publishedMatch = url.pathname.match(/^\/v1\/admin\/changesets\/([^/]+)\/published$/)
  if (request.method === 'POST' && publishedMatch) {
    const changeset = await requireChangeset(publishedMatch[1])
    const contacts = await repository.listChangesetContacts(changeset.id)
    const notification = await notifyGroupedContacts({
      contacts,
      status: 'published',
      changesetTitle: changeset.title,
    })
    await repository.deleteContactsForChangeset(changeset.id)
    const next = { ...changeset, status: 'published', updatedAt: new Date().toISOString() }
    await repository.updateChangeset(next)
    writeJson(response, 200, {
      changeset: redactChangeset(next),
      notified: notification.notifiedRecipients,
      ...notification,
    })
    return
  }

  writeJson(response, 404, { error: 'Admin route not found' })
}

async function bulkReviewProposals(body) {
  const decision = typeof body?.decision === 'string' ? body.decision : ''
  if (decision !== 'reject' && decision !== 'stale') {
    const error = new Error('decision must be reject or stale for bulk review')
    error.statusCode = 400
    throw error
  }
  const proposalPublicIds = [...new Set((Array.isArray(body?.proposalPublicIds) ? body.proposalPublicIds : [])
    .map((publicId) => String(publicId).trim())
    .filter(Boolean))]
  if (!proposalPublicIds.length) {
    const error = new Error('proposalPublicIds is required')
    error.statusCode = 400
    throw error
  }

  const nextProposals = []
  const contacts = []
  for (const publicId of proposalPublicIds) {
    const proposal = await requireProposal(publicId)
    if (proposal.status !== 'pending') {
      const error = new Error(`proposal ${proposal.publicId} is not pending`)
      error.statusCode = 400
      throw error
    }
    const next = reviewProposal(proposal, {
      decision,
      moderatorNote: typeof body?.moderatorNote === 'string' ? body.moderatorNote : '',
    })
    const contact = await repository.getContactByProposalId(proposal.id)
    if (contact?.confirmedAt) contacts.push({ proposal: next, contact })
    nextProposals.push(next)
  }

  const notification = await notifyGroupedContacts({
    contacts,
    status: decision === 'stale' ? 'stale' : 'rejected',
  })
  for (const proposal of nextProposals) {
    await repository.updateProposal(proposal)
    await repository.deleteContact(proposal.id)
  }

  return {
    proposals: nextProposals.map(redactAdminProposal),
    notified: notification.notifiedRecipients,
    ...notification,
  }
}

async function notifyGroupedContacts({ contacts, status, changesetTitle = '' }) {
  const groups = groupContactsByEmail(contacts)
  for (const group of groups) {
    await mailer.send(status === 'published'
      ? proposalsPublishedEmail({
        to: group.to,
        proposalCount: group.entries.length,
        changesetTitle,
      })
      : proposalsClosedEmail({
        to: group.to,
        status,
        proposalCount: group.entries.length,
      }))
  }
  return {
    notifiedRecipients: groups.length,
    notifiedProposals: groups.reduce((total, group) => total + group.entries.length, 0),
  }
}

function groupContactsByEmail(contacts) {
  const groups = new Map()
  for (const entry of contacts) {
    const normalizedEmail = normalizeNotificationEmail(entry.contact?.email)
    if (!normalizedEmail) continue
    if (!groups.has(normalizedEmail)) {
      groups.set(normalizedEmail, {
        to: String(entry.contact.email).trim(),
        entries: [],
      })
    }
    groups.get(normalizedEmail).entries.push(entry)
  }
  return [...groups.values()]
}

function normalizeNotificationEmail(email) {
  return String(email ?? '').trim().toLowerCase()
}

async function requireProposal(publicId) {
  const proposal = await repository.getProposalByPublicId(publicId)
  if (!proposal) {
    const error = new Error('Proposal not found')
    error.statusCode = 404
    throw error
  }
  return proposal
}

async function requireChangeset(publicId) {
  const changeset = await repository.getChangesetByPublicId(publicId)
  if (!changeset) {
    const error = new Error('Changeset not found')
    error.statusCode = 404
    throw error
  }
  return changeset
}

function exportChangeset(changeset) {
  return {
    id: changeset.publicId,
    title: changeset.title,
    items: changeset.items.map((item) => ({
      publicId: item.publicId,
      locale: item.locale,
      chapterId: item.chapterId,
      messageId: item.messageId,
      targetType: item.targetType,
      segmentIndex: item.segmentIndex,
      segmentCount: item.segmentCount,
      currentTextHash: item.currentTextHash,
      finalText: item.finalText,
      credit: item.credit,
    })),
  }
}

function redactAdminProposal(proposal) {
  return {
    id: proposal.publicId,
    status: proposal.status,
    locale: proposal.locale,
    chapterId: proposal.chapterId,
    sceneId: proposal.sceneId,
    messageId: proposal.messageId,
    targetType: proposal.targetType,
    segmentIndex: proposal.segmentIndex,
    segmentCount: proposal.segmentCount,
    currentText: proposal.currentText ?? '',
    currentTextHash: proposal.currentTextHash,
    sourceTextHash: proposal.sourceTextHash,
    proposedText: proposal.proposedText,
    diffParts: buildTextDiffParts(proposal.currentText ?? '', proposal.proposedText),
    finalText: proposal.finalText,
    note: proposal.note,
    pseudonym: proposal.pseudonym,
    creditRequested: proposal.creditRequested,
    creditApproved: proposal.creditApproved,
    moderatorNote: proposal.moderatorNote,
    changesetId: proposal.changesetId,
    createdAt: proposal.createdAt,
    updatedAt: proposal.updatedAt,
  }
}

function redactChangeset(changeset) {
  return {
    id: changeset.publicId,
    title: changeset.title,
    status: changeset.status,
    branchName: changeset.branchName ?? '',
    pullRequestUrl: changeset.pullRequestUrl ?? '',
    items: changeset.items,
    createdAt: changeset.createdAt,
    updatedAt: changeset.updatedAt,
  }
}

function redactChangesetSummary(changeset) {
  return {
    id: changeset.publicId,
    title: changeset.title,
    status: changeset.status,
    branchName: changeset.branchName ?? '',
    pullRequestUrl: changeset.pullRequestUrl ?? '',
    itemCount: changeset.itemCount ?? changeset.items?.length ?? 0,
    createdAt: changeset.createdAt,
    updatedAt: changeset.updatedAt,
  }
}

function requireAdmin(request) {
  const token = request.headers.authorization?.replace(/^Bearer\s+/i, '')
  if (!config.adminToken || token !== config.adminToken) {
    const session = adminAuth.readSession(request.headers.cookie)
    if (session) return { type: 'session', session }
    const error = new Error('Unauthorized')
    error.statusCode = 401
    throw error
  }
  return { type: 'token' }
}

function requireAdminCsrf(request, session) {
  const csrfToken = request.headers['x-admin-csrf']
  if (adminAuth.verifyCsrf(session, Array.isArray(csrfToken) ? csrfToken[0] : csrfToken)) return
  const error = new Error('Invalid admin CSRF token')
  error.statusCode = 403
  throw error
}

function requireEmailNotificationsConfigured() {
  if (mailer.enabled && config.publicWebUrl && config.emailConsentSecret) return
  const error = new Error('Email notifications are not configured')
  error.statusCode = 400
  throw error
}

async function getReusableEmailConsent({ email, consentId, consentToken, now }) {
  if (!consentId || !consentToken) return null
  const consent = await repository.getEmailConsentById(String(consentId))
  if (!verifyEmailConsent({
    consent,
    email,
    token: String(consentToken),
    secret: config.emailConsentSecret,
    now,
  })) {
    return null
  }
  return consent
}

function readConfig() {
  return {
    port: Number(process.env.PORT ?? 8090),
    databaseUrl: process.env.DATABASE_URL ?? '',
    adminToken: process.env.ADMIN_TOKEN ?? '',
    adminPassword: process.env.ADMIN_PASSWORD ?? '',
    adminSessionSecret: process.env.ADMIN_SESSION_SECRET ?? '',
    adminCookieSecure: process.env.ADMIN_COOKIE_SECURE === '1',
    adminSessionTtlHours: Number(process.env.ADMIN_SESSION_TTL_HOURS ?? 8),
    adminLoginRateLimitWindowMs: Number(process.env.ADMIN_LOGIN_RATE_LIMIT_WINDOW_MS ?? 15 * 60 * 1000),
    adminLoginRateLimitMax: Number(process.env.ADMIN_LOGIN_RATE_LIMIT_MAX ?? 5),
    publicApiUrl: (process.env.PUBLIC_API_URL ?? `http://localhost:${process.env.PORT ?? 8090}`).replace(/\/+$/, ''),
    publicWebUrl: (process.env.PUBLIC_WEB_URL ?? '').replace(/\/+$/, ''),
    allowedOrigin: process.env.ALLOWED_ORIGIN ?? '*',
    turnstileSecretKey: process.env.TURNSTILE_SECRET_KEY ?? '',
    turnstileDisabled: process.env.TURNSTILE_DISABLED === '1' || process.env.NODE_ENV === 'test',
    pseudonymBlocklist: (process.env.PSEUDONYM_BLOCKLIST ?? '').split(',').map((item) => item.trim()).filter(Boolean),
    rateLimitWindowMs: Number(process.env.RATE_LIMIT_WINDOW_MS ?? 60000),
    rateLimitMax: Number(process.env.RATE_LIMIT_MAX ?? 20),
    maxJsonBodyBytes: readPositiveIntegerEnv('MAX_JSON_BODY_BYTES', 131072),
    trustProxy: process.env.TRUST_PROXY === '1',
    smtpUrl: process.env.SMTP_URL ?? '',
    emailWebhookUrl: process.env.EMAIL_WEBHOOK_URL ?? '',
    emailWebhookToken: process.env.EMAIL_WEBHOOK_TOKEN ?? '',
    emailFrom: process.env.EMAIL_FROM ?? DEFAULT_EMAIL_FROM,
    emailConsentSecret: process.env.EMAIL_CONSENT_SECRET ?? '',
    githubToken: process.env.GITHUB_TOKEN_FOR_DISPATCH ?? '',
    githubRepository: process.env.GITHUB_REPOSITORY_TARGET ?? '',
    githubWorkflowFile: process.env.GITHUB_WORKFLOW_FILE ?? 'translation-changeset-pr.yml',
    githubRef: process.env.GITHUB_REF_NAME ?? 'main',
  }
}

async function createRepository(nextConfig) {
  if (nextConfig.databaseUrl) {
    return createPostgresRepository(nextConfig.databaseUrl)
  }
  return createMemoryRepository()
}

async function readJson(request) {
  const chunks = []
  let size = 0
  for await (const chunk of request) {
    size += chunk.byteLength
    if (size > config.maxJsonBodyBytes) {
      const error = new Error('JSON body is too large')
      error.statusCode = 413
      throw error
    }
    chunks.push(chunk)
  }
  if (!chunks.length) return {}
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'))
  } catch {
    const error = new Error('Invalid JSON body')
    error.statusCode = 400
    throw error
  }
}

function writeJson(response, statusCode, payload, headers = {}) {
  writeResponse(response, statusCode, JSON.stringify(payload), { 'content-type': 'application/json; charset=utf-8', ...headers })
}

function writeResponse(response, statusCode, body, headers = {}) {
  response.writeHead(statusCode, headers)
  response.end(body)
}

function writeError(response, caught) {
  const statusCode = Number.isInteger(caught?.statusCode) ? caught.statusCode : 500
  writeJson(response, statusCode, { error: caught instanceof Error ? caught.message : 'Internal error' })
}

function writeCorsHeaders(response) {
  response.setHeader('access-control-allow-origin', config.allowedOrigin)
  response.setHeader('access-control-allow-methods', 'GET,POST,OPTIONS')
  response.setHeader('access-control-allow-headers', 'content-type,authorization,x-admin-csrf')
  response.setHeader('access-control-allow-credentials', 'true')
}

function clientIp(request) {
  const socketAddress = request.socket.remoteAddress ?? ''
  if (!config.trustProxy) {
    return socketAddress
  }
  const forwarded = request.headers['x-forwarded-for']
  const forwardedValue = Array.isArray(forwarded) ? forwarded[0] : forwarded
  return String(forwardedValue ?? '').split(',')[0].trim() || socketAddress
}

function readPositiveIntegerEnv(name, fallback) {
  const value = Number(process.env[name] ?? fallback)
  return Number.isInteger(value) && value > 0 ? value : fallback
}

function createRateLimiter(windowMs, maxHits) {
  const hits = new Map()
  return {
    assert(key) {
      const now = Date.now()
      const windowStart = now - windowMs
      const current = (hits.get(key) ?? []).filter((timestamp) => timestamp >= windowStart)
      if (current.length >= maxHits) {
        const error = new Error('Too many contribution attempts')
        error.statusCode = 429
        throw error
      }
      current.push(now)
      hits.set(key, current)
    },
  }
}

const ADMIN_ASSETS = new Map([
  ['/admin/assets/admin.css', {
    url: new URL('../admin/assets/admin.css', import.meta.url),
    contentType: 'text/css; charset=utf-8',
  }],
  ['/admin/assets/admin.js', {
    url: new URL('../admin/assets/admin.js', import.meta.url),
    contentType: 'text/javascript; charset=utf-8',
  }],
])
