const STATUS_OPTIONS = ['pending', 'accepted', 'changeset', 'rejected', 'stale', 'all']
const CHANGESET_STATUS_OPTIONS = ['ready', 'dispatched', 'published', 'stale', 'all']

const state = {
  authenticated: false,
  adminConfigured: true,
  csrfToken: '',
  expiresAt: '',
  view: 'proposals',
  proposalStatus: 'pending',
  changesetStatus: 'all',
  proposals: [],
  changesets: [],
  selectedProposalIds: new Set(),
  activeProposalId: '',
  activeChangesetId: '',
  activeChangeset: null,
  exportJson: '',
  notice: null,
}

const app = document.querySelector('#app')

init().catch((error) => {
  state.notice = { type: 'error', message: formatError(error) }
  render()
})

async function init() {
  const session = await request('/admin/session')
  applySession(session)
  if (state.authenticated) await loadCurrentView()
  render()
}

function applySession(session) {
  state.authenticated = Boolean(session.authenticated)
  state.adminConfigured = session.adminConfigured !== false
  state.csrfToken = session.csrfToken || ''
  state.expiresAt = session.expiresAt || ''
}

async function request(path, options = {}) {
  const headers = { accept: 'application/json', ...(options.headers || {}) }
  const init = {
    method: options.method || 'GET',
    credentials: 'same-origin',
    headers,
  }
  if (options.body !== undefined) {
    headers['content-type'] = 'application/json'
    init.body = JSON.stringify(options.body)
  }
  if (init.method !== 'GET' && state.csrfToken && path.startsWith('/v1/admin/')) {
    headers['x-admin-csrf'] = state.csrfToken
  }
  const response = await fetch(path, init)
  const text = await response.text()
  const payload = text ? JSON.parse(text) : {}
  if (!response.ok) {
    throw new Error(payload.error || `HTTP ${response.status}`)
  }
  return payload
}

async function login(password) {
  const session = await request('/admin/login', { method: 'POST', body: { password } })
  applySession(session)
  state.notice = { type: 'success', message: 'Connexion mainteneur ouverte.' }
  await loadCurrentView()
  render()
}

async function logout() {
  await request('/admin/logout', { method: 'POST' })
  state.authenticated = false
  state.csrfToken = ''
  state.selectedProposalIds.clear()
  state.notice = null
  render()
}

async function loadCurrentView() {
  if (state.view === 'changesets') {
    await loadChangesets()
    return
  }
  await loadProposals()
}

async function loadProposals() {
  const query = state.proposalStatus === 'all' ? '' : `?status=${encodeURIComponent(state.proposalStatus)}`
  const payload = await request(`/v1/admin/proposals${query}`)
  state.proposals = payload.proposals || []
  if (!state.proposals.some((proposal) => proposal.id === state.activeProposalId)) {
    state.activeProposalId = state.proposals[0]?.id || ''
  }
  for (const id of [...state.selectedProposalIds]) {
    const proposal = state.proposals.find((item) => item.id === id)
    if (!proposal || proposal.status !== 'accepted') state.selectedProposalIds.delete(id)
  }
}

async function loadChangesets() {
  const query = state.changesetStatus === 'all' ? '' : `?status=${encodeURIComponent(state.changesetStatus)}`
  const payload = await request(`/v1/admin/changesets${query}`)
  state.changesets = payload.changesets || []
  if (!state.changesets.some((changeset) => changeset.id === state.activeChangesetId)) {
    state.activeChangesetId = state.changesets[0]?.id || ''
    state.activeChangeset = null
  }
  if (state.activeChangesetId && !state.activeChangeset) {
    await openChangeset(state.activeChangesetId, false)
  }
}

async function openChangeset(id, shouldRender = true) {
  const payload = await request(`/v1/admin/changesets/${encodeURIComponent(id)}`)
  state.activeChangesetId = id
  state.activeChangeset = payload.changeset
  state.exportJson = ''
  if (shouldRender) render()
}

function render() {
  if (!state.authenticated) {
    renderLogin()
    return
  }
  app.innerHTML = `
    <header class="topbar">
      <div>
        <h1>Admin traductions</h1>
        <small>Session jusqu'a ${escapeHtml(formatDate(state.expiresAt))}</small>
      </div>
      <nav class="tabs" aria-label="Navigation admin">
        <button class="${state.view === 'proposals' ? 'active' : ''}" data-view="proposals">Propositions</button>
        <button class="${state.view === 'changesets' ? 'active' : ''}" data-view="changesets">Changesets</button>
        <button data-action="logout">Deconnexion</button>
      </nav>
    </header>
    ${noticeHtml()}
    ${state.view === 'changesets' ? changesetsViewHtml() : proposalsViewHtml()}
  `
  bindCommonEvents()
  if (state.view === 'changesets') bindChangesetEvents()
  else bindProposalEvents()
}

function renderLogin() {
  app.innerHTML = `
    <section class="login-page">
      <form class="login-panel stack" data-login-form>
        <div>
          <h1>Admin traductions</h1>
          <p>Connecte-toi avec le mot de passe mainteneur configure sur le service API.</p>
        </div>
        ${state.adminConfigured ? '' : '<p class="notice error">ADMIN_PASSWORD et ADMIN_SESSION_SECRET ne sont pas configures.</p>'}
        ${noticeHtml()}
        <input type="text" name="username" autocomplete="username" value="maintainer" hidden />
        <label>
          Mot de passe
          <input type="password" name="password" autocomplete="current-password" required autofocus />
        </label>
        <button type="submit" class="primary">Se connecter</button>
      </form>
    </section>
  `
  app.querySelector('[data-login-form]')?.addEventListener('submit', async (event) => {
    event.preventDefault()
    state.notice = null
    const password = new FormData(event.currentTarget).get('password')
    try {
      await login(password)
    } catch (error) {
      state.notice = { type: 'error', message: formatError(error) }
      renderLogin()
    }
  })
}

function proposalsViewHtml() {
  const active = state.proposals.find((proposal) => proposal.id === state.activeProposalId) || null
  return `
    <section class="workspace">
      <div class="panel">
        <div class="panel-header">
          <h2>Propositions</h2>
          <label>
            Statut
            <select data-proposal-filter>
              ${STATUS_OPTIONS.map((status) => `<option value="${status}" ${status === state.proposalStatus ? 'selected' : ''}>${statusLabel(status)}</option>`).join('')}
            </select>
          </label>
        </div>
        <div class="list">
          ${state.proposals.length ? proposalGroupsHtml() : '<p class="empty">Aucune proposition pour ce filtre.</p>'}
        </div>
        ${selectionHtml()}
      </div>
      <div class="panel">
        <div class="panel-header">
          <h2>Detail</h2>
          ${active ? `<span class="badge ${active.status}">${statusLabel(active.status)}</span>` : ''}
        </div>
        ${active ? proposalDetailHtml(active) : '<p class="empty detail">Sélectionne une proposition.</p>'}
      </div>
    </section>
  `
}

function proposalGroupsHtml() {
  const groups = groupBy(state.proposals, proposalTargetKey)
  return [...groups.entries()].map(([key, proposals]) => `
    <section class="group">
      <div class="group-title">
        <span>${escapeHtml(key)}</span>
        <span>${proposals.length} proposition${proposals.length > 1 ? 's' : ''}</span>
      </div>
      ${proposals.map(proposalRowHtml).join('')}
    </section>
  `).join('')
}

function proposalRowHtml(proposal) {
  const canSelect = proposal.status === 'accepted'
  return `
    <div class="row ${proposal.id === state.activeProposalId ? 'selected' : ''}">
      <input type="checkbox" data-select-proposal="${escapeAttr(proposal.id)}" ${canSelect ? '' : 'disabled'} ${state.selectedProposalIds.has(proposal.id) ? 'checked' : ''} aria-label="Sélectionner pour changeset" />
      <button class="row-main" type="button" data-open-proposal="${escapeAttr(proposal.id)}">
        <strong>${escapeHtml(proposal.id)} - ${escapeHtml(proposal.locale)}/${escapeHtml(proposal.chapterId)}</strong>
        <span class="snippet">${escapeHtml(shortText(proposal.proposedText))}</span>
      </button>
      <span class="badge ${proposal.status}">${statusLabel(proposal.status)}</span>
    </div>
  `
}

function proposalDetailHtml(proposal) {
  const finalText = proposal.finalText || proposal.proposedText
  return `
    <form class="detail" data-review-form>
      <div class="detail-grid">
        ${kv('ID', proposal.id)}
        ${kv('Cible', proposalTargetKey(proposal))}
        ${kv('Scène', proposal.sceneId)}
        ${kv('Hash courant', proposal.currentTextHash)}
      </div>
      <section class="text-panel">
        <h3>Texte d'origine</h3>
        ${proposal.currentText
          ? `<p>${escapeHtml(proposal.currentText)}</p>`
          : `<p class="empty">Texte d'origine indisponible pour cette proposition.</p>`}
      </section>
      <section class="text-panel">
        <h3>Diff proposé</h3>
        ${proposal.currentText && proposal.diffParts?.length
          ? `<p class="diff-view">${proposalDiffHtml(proposal.diffParts)}</p>`
          : `<p>${escapeHtml(proposal.proposedText)}</p>`}
      </section>
      <label>
        Version finale retenue
        <textarea name="finalText">${escapeHtml(finalText)}</textarea>
      </label>
      <label>
        Commentaire lecteur
        <textarea readonly>${escapeHtml(proposal.note || '')}</textarea>
      </label>
      <div class="detail-grid">
        ${kv('Pseudo', proposal.pseudonym || 'Aucun')}
        ${kv('Crédit demandé', proposal.creditRequested ? 'Oui' : 'Non')}
      </div>
      <label>
        Note de modération
        <textarea name="moderatorNote">${escapeHtml(proposal.moderatorNote || '')}</textarea>
      </label>
      <label>
        <span>
          <input type="checkbox" name="creditApproved" ${proposal.creditApproved ? 'checked' : ''} ${proposal.pseudonym ? '' : 'disabled'} />
          Créditer ce pseudo
        </span>
      </label>
      <div class="actions">
        <button type="button" class="primary" data-review="accept">Accepter</button>
        <button type="button" class="danger" data-review="reject">Rejeter</button>
        <button type="button" data-review="stale">Marquer obsolète</button>
      </div>
    </form>
  `
}

function proposalDiffHtml(parts) {
  return parts.map((part) => `<span class="diff-${escapeAttr(part.type)}">${escapeHtml(part.text)}</span>`).join('')
}

function selectionHtml() {
  const selected = [...state.selectedProposalIds]
  const duplicate = selectedDuplicateKey()
  return `
    <div class="selection-bar">
      <strong>${selected.length} proposition${selected.length > 1 ? 's' : ''} acceptée${selected.length > 1 ? 's' : ''} sélectionnée${selected.length > 1 ? 's' : ''}</strong>
      ${duplicate ? `<p class="notice error">Conflit sur ${escapeHtml(duplicate)} : un changeset ne peut garder qu'une version finale par segment.</p>` : ''}
      <label>
        Titre du changeset
        <input type="text" data-changeset-title placeholder="Corrections FR chapitre 1" />
      </label>
      <div class="actions">
        <button type="button" class="primary" data-create-changeset ${selected.length && !duplicate ? '' : 'disabled'}>Créer un changeset</button>
        <button type="button" data-clear-selection ${selected.length ? '' : 'disabled'}>Vider la sélection</button>
      </div>
    </div>
  `
}

function changesetsViewHtml() {
  return `
    <section class="workspace">
      <div class="panel">
        <div class="panel-header">
          <h2>Changesets</h2>
          <label>
            Statut
            <select data-changeset-filter>
              ${CHANGESET_STATUS_OPTIONS.map((status) => `<option value="${status}" ${status === state.changesetStatus ? 'selected' : ''}>${statusLabel(status)}</option>`).join('')}
            </select>
          </label>
        </div>
        <div class="list">
          ${state.changesets.length ? state.changesets.map(changesetRowHtml).join('') : '<p class="empty">Aucun changeset pour ce filtre.</p>'}
        </div>
      </div>
      <div class="panel">
        <div class="panel-header">
          <h2>Detail changeset</h2>
          ${state.activeChangeset ? `<span class="badge ${state.activeChangeset.status}">${statusLabel(state.activeChangeset.status)}</span>` : ''}
        </div>
        ${state.activeChangeset ? changesetDetailHtml(state.activeChangeset) : '<p class="empty detail">Sélectionne un changeset.</p>'}
      </div>
    </section>
  `
}

function changesetRowHtml(changeset) {
  return `
    <button class="row ${changeset.id === state.activeChangesetId ? 'selected' : ''}" type="button" data-open-changeset="${escapeAttr(changeset.id)}">
      <span></span>
      <span class="row-main">
        <strong class="change-title">${escapeHtml(changeset.title)}</strong>
        <span class="snippet">${escapeHtml(changeset.id)} - ${changeset.itemCount} correction${changeset.itemCount > 1 ? 's' : ''}</span>
      </span>
      <span class="badge ${changeset.status}">${statusLabel(changeset.status)}</span>
    </button>
  `
}

function changesetDetailHtml(changeset) {
  return `
    <div class="detail">
      <div class="detail-grid">
        ${kv('ID', changeset.id)}
        ${kv('Titre', changeset.title)}
        ${kv('Statut', changeset.status)}
        ${kv('PR', changeset.pullRequestUrl || 'Aucune')}
      </div>
      <div class="actions">
        <button type="button" data-export-changeset>Exporter JSON</button>
        <button type="button" class="primary" data-dispatch-pr>Créer la PR</button>
        <button type="button" data-mark-published>Marquer publié</button>
        <button type="button" class="danger" data-mark-stale>Marquer stale</button>
      </div>
      <section class="group">
        <div class="group-title">
          <span>Corrections</span>
          <span>${changeset.items.length}</span>
        </div>
        ${changeset.items.map((item) => `
          <div class="row">
            <span></span>
            <span class="row-main">
              <strong>${escapeHtml(item.publicId)} - ${escapeHtml(item.locale)}/${escapeHtml(item.chapterId)}</strong>
              <span class="snippet">${escapeHtml(item.messageId)} ${item.segmentIndex === null ? '' : `#${item.segmentIndex + 1}`}</span>
            </span>
            <span class="badge">${escapeHtml(item.credit || 'sans crédit')}</span>
          </div>
        `).join('')}
      </section>
      ${state.exportJson ? `<pre class="export-box">${escapeHtml(state.exportJson)}</pre>` : ''}
    </div>
  `
}

function bindCommonEvents() {
  app.querySelectorAll('[data-view]').forEach((button) => {
    button.addEventListener('click', async () => {
      state.view = button.dataset.view
      state.notice = null
      await loadCurrentView()
      render()
    })
  })
  app.querySelector('[data-action="logout"]')?.addEventListener('click', () => runAction(logout))
}

function bindProposalEvents() {
  app.querySelector('[data-proposal-filter]')?.addEventListener('change', async (event) => {
    state.proposalStatus = event.target.value
    state.notice = null
    await loadProposals()
    render()
  })
  app.querySelectorAll('[data-open-proposal]').forEach((button) => {
    button.addEventListener('click', () => {
      state.activeProposalId = button.dataset.openProposal
      render()
    })
  })
  app.querySelectorAll('[data-select-proposal]').forEach((checkbox) => {
    checkbox.addEventListener('change', () => {
      if (checkbox.checked) state.selectedProposalIds.add(checkbox.dataset.selectProposal)
      else state.selectedProposalIds.delete(checkbox.dataset.selectProposal)
      render()
    })
  })
  app.querySelectorAll('[data-review]').forEach((button) => {
    button.addEventListener('click', () => runAction(() => reviewActiveProposal(button.dataset.review)))
  })
  app.querySelector('[data-create-changeset]')?.addEventListener('click', () => runAction(createChangeset))
  app.querySelector('[data-clear-selection]')?.addEventListener('click', () => {
    state.selectedProposalIds.clear()
    render()
  })
}

function bindChangesetEvents() {
  app.querySelector('[data-changeset-filter]')?.addEventListener('change', async (event) => {
    state.changesetStatus = event.target.value
    state.activeChangeset = null
    state.notice = null
    await loadChangesets()
    render()
  })
  app.querySelectorAll('[data-open-changeset]').forEach((button) => {
    button.addEventListener('click', () => runAction(() => openChangeset(button.dataset.openChangeset)))
  })
  app.querySelector('[data-export-changeset]')?.addEventListener('click', () => runAction(exportActiveChangeset))
  app.querySelector('[data-dispatch-pr]')?.addEventListener('click', () => runAction(() => changesetAction('dispatch-pr')))
  app.querySelector('[data-mark-published]')?.addEventListener('click', () => runAction(() => changesetAction('published')))
  app.querySelector('[data-mark-stale]')?.addEventListener('click', () => runAction(() => changesetAction('stale')))
}

async function runAction(action) {
  state.notice = null
  try {
    await action()
  } catch (error) {
    state.notice = { type: 'error', message: formatError(error) }
  }
  render()
}

async function reviewActiveProposal(decision) {
  const proposal = state.proposals.find((item) => item.id === state.activeProposalId)
  if (!proposal) throw new Error('Aucune proposition sélectionnée.')
  const form = app.querySelector('[data-review-form]')
  const formData = new FormData(form)
  const body = {
    decision,
    moderatorNote: String(formData.get('moderatorNote') || ''),
  }
  if (decision === 'accept') {
    body.finalText = String(formData.get('finalText') || '')
    body.creditApproved = formData.get('creditApproved') === 'on'
  }
  await request(`/v1/admin/proposals/${encodeURIComponent(proposal.id)}/review`, { method: 'POST', body })
  state.notice = { type: 'success', message: `Proposition ${statusLabel(decision === 'accept' ? 'accepted' : decision)}.` }
  await loadProposals()
}

async function createChangeset() {
  const duplicate = selectedDuplicateKey()
  if (duplicate) throw new Error(`Conflit sur ${duplicate}.`)
  const title = app.querySelector('[data-changeset-title]')?.value?.trim()
  if (!title) throw new Error('Titre du changeset requis.')
  const proposalPublicIds = [...state.selectedProposalIds]
  if (!proposalPublicIds.length) throw new Error('Sélectionne au moins une proposition acceptée.')
  const payload = await request('/v1/admin/changesets', {
    method: 'POST',
    body: { title, proposalPublicIds },
  })
  state.selectedProposalIds.clear()
  state.view = 'changesets'
  state.activeChangesetId = payload.changeset.id
  state.activeChangeset = payload.changeset
  state.notice = { type: 'success', message: 'Changeset créé.' }
  await loadChangesets()
}

async function exportActiveChangeset() {
  if (!state.activeChangesetId) throw new Error('Aucun changeset sélectionné.')
  const payload = await request(`/v1/admin/changesets/${encodeURIComponent(state.activeChangesetId)}/export`)
  state.exportJson = JSON.stringify(payload, null, 2)
}

async function changesetAction(action) {
  if (!state.activeChangesetId) throw new Error('Aucun changeset sélectionné.')
  const payload = await request(`/v1/admin/changesets/${encodeURIComponent(state.activeChangesetId)}/${action}`, { method: 'POST', body: {} })
  state.activeChangeset = payload.changeset
  state.notice = { type: 'success', message: `Changeset mis à jour (${statusLabel(payload.changeset.status)}).` }
  await loadChangesets()
}

function selectedDuplicateKey() {
  const seen = new Set()
  for (const id of state.selectedProposalIds) {
    const proposal = state.proposals.find((item) => item.id === id)
    if (!proposal) continue
    const key = proposalTargetKey(proposal)
    if (seen.has(key)) return key
    seen.add(key)
  }
  return ''
}

function proposalTargetKey(proposal) {
  const segment = proposal.segmentIndex === null || proposal.segmentIndex === undefined
    ? 'choice'
    : `segment ${proposal.segmentIndex + 1}/${proposal.segmentCount}`
  return `${proposal.locale}/${proposal.chapterId}/${proposal.messageId}/${segment}`
}

function groupBy(items, getKey) {
  const groups = new Map()
  for (const item of items) {
    const key = getKey(item)
    groups.set(key, [...(groups.get(key) || []), item])
  }
  return groups
}

function kv(label, value) {
  return `<div class="kv"><span>${escapeHtml(label)}</span><strong>${escapeHtml(String(value ?? ''))}</strong></div>`
}

function noticeHtml() {
  if (!state.notice) return ''
  return `<p class="notice ${state.notice.type === 'error' ? 'error' : 'success'}">${escapeHtml(state.notice.message)}</p>`
}

function statusLabel(status) {
  return {
    all: 'Tous',
    pending: 'En attente',
    accepted: 'Acceptée',
    changeset: 'En lot',
    rejected: 'Rejetée',
    stale: 'Obsolète',
    ready: 'Prêt',
    dispatched: 'PR demandée',
    published: 'Publié',
    reject: 'rejetée',
  }[status] || status
}

function shortText(value) {
  const text = String(value || '').replace(/\s+/g, ' ').trim()
  return text.length > 180 ? `${text.slice(0, 180)}...` : text
}

function formatDate(value) {
  if (!value) return ''
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString('fr-FR')
}

function formatError(error) {
  return error instanceof Error ? error.message : String(error)
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;')
}

function escapeAttr(value) {
  return escapeHtml(value)
}
