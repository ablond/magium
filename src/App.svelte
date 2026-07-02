<script lang="ts">
  import {
    BookOpen,
    Bug,
    ChevronsRight,
    CircleCheck,
    CircleX,
    Download,
    Library,
    Minus,
    Pencil,
    Plus,
    RotateCcw,
    Save,
    ScrollText,
    Settings,
    ShieldCheck,
    SlidersHorizontal,
    Trophy,
    Trash2,
    Upload,
    X,
  } from '@lucide/svelte'
  import { onMount } from 'svelte'
  import ArcaneSigil from './lib/ArcaneSigil.svelte'
  import { loadContextForScene, loadIndex, loadLocaleChapter, loadStoryChapter, loadUiLocale } from './lib/content/packedContent'
  import { submitTranslationProposal } from './lib/contributions/api'
  import {
    buildTranslationProposalPayload,
    hashContributionText,
    type TranslationContributionDraft,
    type TranslationContributionTarget,
  } from './lib/contributions/payload'
  import {
    applyContributionEmailConsent,
    clearContributionEmailState,
    clearContributionProfile,
    loadContributionEmailConsent,
    loadContributionProfile,
    parseContributionEmailConsentFragment,
    removeContributionEmailConsentFragment,
    saveContributionEmailConsentForEmail,
    saveContributionProfile,
    savePendingContributionEmailConsent,
  } from './lib/contributions/storage'
  import { requestTurnstileToken } from './lib/contributions/turnstile'
  import { DEFAULT_UI_LOCALES, resolveUiLocale, translateUi as t } from './lib/i18n/ui'
  import { DISPLAY_PARAGRAPH_BREAK, splitDisplayParagraphs, splitDisplayText, type DisplayParagraph } from './lib/reader/displayParagraphs'
  import { defaultReaderSettings, migrateReaderSettings } from './lib/settings/readerSettings'
  import {
    applyChoice,
    applyStatAllocation,
    createInitialState,
    debugApplyChoice,
    debugDeleteVariable,
    debugJumpToScene,
    debugSetVariable,
    enterCurrentScene,
    readNewlyUnlockedAchievements,
    renderCurrentScene,
    restoreCheckpoint,
  } from './lib/story/engine'
  import {
    AVAILABLE_POINTS_AUX_VARIABLE,
    AVAILABLE_POINTS_VARIABLE,
    MAX_STAT_VARIABLE,
    readAvailableStatPoints,
    readNumericVariable,
    readStats,
    revealedStatVariables,
    STAT_VARIABLES,
    statAuxVariable,
  } from './lib/story/stats'
  import type {
    AchievementDefinition,
    Choice,
    ContentIndex,
    GameState,
    PrimitiveValue,
    RenderedScene,
    Settings as ReaderSettings,
    StatAllocationDelta,
    StoryChapter,
    StoryContext,
  } from './lib/story/types'
  import {
    filterNewAchievementUnlocks,
    loadAchievementProgress,
    mergeAchievementProgressFromState,
    recordAchievementUnlocks,
    type AchievementProgress,
  } from './lib/storage/achievementProgress'
  import { deleteSave, exportSave, importSave, listSaveSummaries, loadGameState, renameSave, saveGameState, SAVE_IMPORT_ERROR_MESSAGES, type SaveSummary } from './lib/storage/saves'
  import { getBook1SceneVisual } from './lib/visuals/book1'

  type Panel = 'none' | 'saves' | 'abilities' | 'achievements' | 'settings' | 'about' | 'debug'
  type DebugValueKind = 'number' | 'string' | 'boolean'
  type SaveTransferMode = 'none' | 'export' | 'import'
  type DebugSnapshot = {
    label: string
    state: GameState
  }

  const isDebugBuild = import.meta.env.DEV
  const contributionApiUrl = (import.meta.env.VITE_MAGIUM_CONTRIBUTIONS_API_URL ?? '').trim()
  const turnstileSiteKey = (import.meta.env.VITE_MAGIUM_TURNSTILE_SITE_KEY ?? '').trim()
  const maxDebugSnapshots = 80
  const debugNumericVariables = [
    ...STAT_VARIABLES,
    AVAILABLE_POINTS_VARIABLE,
    AVAILABLE_POINTS_AUX_VARIABLE,
    MAX_STAT_VARIABLE,
  ] as const

  const errorMessageKeys: Record<string, string> = {
    'Choice is not available from the current state': 'errors.choiceUnavailable',
    'No stat points selected': 'errors.noStatPointsSelected',
    'Not enough stat points available': 'errors.notEnoughStatPoints',
    'No checkpoint is available': 'errors.noCheckpointAvailable',
    'This browser does not support runtime content decompression': 'errors.decompressionUnsupported',
    [SAVE_IMPORT_ERROR_MESSAGES.contentVersion]: 'errors.saveContentVersion',
    [SAVE_IMPORT_ERROR_MESSAGES.exportPasswordRequired]: 'errors.saveExportPasswordRequired',
    [SAVE_IMPORT_ERROR_MESSAGES.localOnly]: 'errors.saveLocalOnly',
    [SAVE_IMPORT_ERROR_MESSAGES.passwordOrCorrupt]: 'errors.savePasswordOrCorrupt',
    [SAVE_IMPORT_ERROR_MESSAGES.passwordRequired]: 'errors.savePasswordRequired',
    [SAVE_IMPORT_ERROR_MESSAGES.tamper]: 'errors.saveTamper',
    [SAVE_IMPORT_ERROR_MESSAGES.debug]: 'errors.saveDebug',
    'Stat is not available for allocation': 'errors.statUnavailable',
    'Stat maximum reached': 'errors.statMaximumReached',
    'Debug boolean values must be true or false': 'errors.debugBoolean',
    'Debug numeric values must be finite numbers': 'errors.debugNumber',
    [SAVE_IMPORT_ERROR_MESSAGES.unsupported]: 'errors.unsupportedSave',
  }

  let context: StoryContext | null = null
  let state: GameState | null = null
  let rendered: RenderedScene | null = null
  $: displayParagraphs = rendered ? splitDisplayParagraphs(rendered.paragraphs) : []
  let uiMessages: Record<string, string> = {}
  let availableLanguages = [...DEFAULT_UI_LOCALES]
  let saveSummaries: SaveSummary[] = []
  let activePanel: Panel = 'none'
  let loading = true
  let busy = false
  let saveBusy: 'none' | 'export' | 'import' = 'none'
  let error = ''
  let status = ''
  let panelError = ''
  let panelStatus = ''
  let passphrase = ''
  let importPassphrase = ''
  let saveTransferMode: SaveTransferMode = 'none'
  let runtimeContentVersion = ''
  let manualSaveName = ''
  let editingSaveId = ''
  let editingSaveName = ''
  let pendingDeleteSave: SaveSummary | null = null
  let settings: ReaderSettings = { ...defaultReaderSettings }
  let statDraft: Record<string, number> = {}
  let achievementProgress: AchievementProgress = {
    schemaVersion: 1,
    contentVersion: null,
    achievements: {},
    createdAt: '',
    updatedAt: '',
  }
  let recentUnlockedAchievements: AchievementDefinition[] = []
  let importInput: HTMLInputElement | null = null
  let panelElement: HTMLElement | null = null
  let panelCloseButton: HTMLButtonElement | null = null
  let lastPanelTrigger: HTMLElement | null = null
  let hiddenMomentVisuals: Record<string, true> = {}
  let isMobilePanel = false
  let focusedPanel: Panel = 'none'
  let debugChapterCache: Record<string, StoryChapter> = {}
  let debugChapterId = ''
  let debugSceneId = ''
  let debugVariableName = ''
  let debugVariableKind: DebugValueKind = 'number'
  let debugVariableValue = '0'
  let debugUndoStack: DebugSnapshot[] = []
  let debugRedoStack: DebugSnapshot[] = []
  let contributionTarget: TranslationContributionTarget | null = null
  let contributionDraft: TranslationContributionDraft = createEmptyContributionDraft()
  let rememberContributionProfile = false
  let contributionBusy = false
  let contributionError = ''
  let contributionStatus = ''
  let contributionSubmitted = false

  $: chapterTitle = state
    ? describeScene(state.currentSceneId, uiMessages)
    : t(uiMessages, 'reader.chapterTitle', { book: '1', chapter: 1 }, 'Book 1 - Chapter 1')
  $: visibleStatVariables = state ? revealedStatVariables(state) : []
  $: stats = state && context ? readStats(state.variables, context.statsLocale.messages, visibleStatVariables, statDraft) : []
  $: availableStatPoints = state ? readAvailableStatPoints(state.variables) : 0
  $: draftedStatPoints = Object.values(statDraft).reduce((sum, amount) => sum + amount, 0)
  $: remainingStatPoints = Math.max(0, availableStatPoints - draftedStatPoints)
  $: browserThemeColor = themeColorFor(settings.theme)
  $: momentVisual = settings.illustrations && state ? getBook1SceneVisual(state.currentSceneId, state.variables) : null
  $: visibleMomentVisual = momentVisual && !hiddenMomentVisuals[momentVisual.src] ? momentVisual : null
  $: debugChapters = context?.index.chapters ?? []
  $: debugChapter = debugChapterId
    ? debugChapterCache[debugChapterId] ?? context?.chapters[debugChapterId] ?? null
    : null
  $: debugSceneIds = debugChapter?.sceneOrder ?? []
  $: debugAllChoices = rendered?.scene.choices ?? []
  $: debugVisibleChoiceIds = new Set((rendered?.choices ?? []).map((choice) => choice.id))
  $: debugStatRows = state && context
    ? readStats(state.variables, context.statsLocale.messages, debugNumericVariables)
    : []
  $: debugVariables = state
    ? Object.entries(state.variables).sort(([left], [right]) => left.localeCompare(right))
    : []
  $: panelLabel = getPanelLabel(activePanel)
  $: if (!isDebugBuild && activePanel === 'debug') {
    activePanel = 'none'
  }
  $: if (typeof document !== 'undefined') {
    document.body.classList.toggle('panel-modal-open', activePanel !== 'none' && isMobilePanel)
  }
  $: if (activePanel !== 'none' && isMobilePanel && focusedPanel !== activePanel) {
    focusedPanel = activePanel
    queueMicrotask(() => panelCloseButton?.focus({ preventScroll: true }))
  }
  $: if (activePanel === 'none') {
    focusedPanel = 'none'
  }
  $: if (activePanel !== 'saves' && saveTransferMode !== 'none') {
    saveTransferMode = 'none'
  }

  onMount(async () => {
    try {
      settings = loadReaderSettings()
      applyReaderSettings(settings)
      const index = await loadIndex()
      runtimeContentVersion = index.contentVersion
      availableLanguages = resolveAvailableLanguages(index.uiLocales, index.storyLocales, index.defaultLocale)
      const language = resolveUiLocale(settings.locale || settings.uiLocale, [], availableLanguages, index.defaultLocale)
      settings = {
        ...settings,
        locale: language,
        uiLocale: language,
      }
      persistReaderSettings(settings)
      uiMessages = (await loadUiLocale(settings.uiLocale)).messages
      applyReaderSettings(settings)
      const emailConsentPayload = parseContributionEmailConsentFragment(window.location.hash)
      if (emailConsentPayload) {
        await applyContributionEmailConsent(emailConsentPayload)
        removeContributionEmailConsentFragment(window.location, window.history)
      }
      const contributionProfile = await loadContributionProfile()
      if (contributionProfile) {
        contributionDraft = {
          ...contributionDraft,
          pseudonym: contributionProfile.pseudonym,
          email: contributionProfile.email,
          creditRequested: contributionProfile.pseudonym.length > 0,
          notifyRequested: contributionProfile.email.length > 0,
        }
        rememberContributionProfile = true
      }
      context = await loadContextForScene(index.initialSceneId, settings.locale)
      const loaded = await loadGameState('autosave')
      if (loaded?.contentVersion === index.contentVersion) {
        context = await loadContextForScene(loaded.currentSceneId, loaded.locale, context)
        state = loaded
      } else {
        state = enterCurrentScene(context, createInitialState(index.contentVersion, settings.locale))
        await saveGameState(state)
      }
      achievementProgress = await loadAchievementProgress()
      achievementProgress = await mergeAchievementProgressFromState(state)
      await refresh()
    } catch (caught) {
      error = formatCaughtError(caught)
    } finally {
      loading = false
    }
  })

  onMount(() => {
    const query = window.matchMedia('(max-width: 980px)')
    const updateMobilePanel = () => {
      isMobilePanel = query.matches
    }

    updateMobilePanel()
    query.addEventListener('change', updateMobilePanel)

    return () => {
      query.removeEventListener('change', updateMobilePanel)
      document.body.classList.remove('panel-modal-open')
    }
  })

  async function refresh() {
    if (!state) return
    context = await loadContextForScene(state.currentSceneId, state.locale, context ?? undefined)
    rendered = renderCurrentScene(context, state)
    rememberLoadedDebugChapters()
    syncDebugSelection()
    saveSummaries = await listSaveSummaries()
  }

  async function choose(choice: Choice) {
    if (!state || !context || busy) return
    try {
      busy = true
      error = ''
      clearStatus()
      if (choice.special === 'saves' && !choice.target) {
        openPanel('saves')
        return
      }
      if (choice.special === 'checkpoint_load' || choice.special === 'restart') {
        achievementProgress = await mergeAchievementProgressFromState(state)
      }
      if (choice.special === 'checkpoint_load') {
        if (!state.checkpoint) throw new Error('No checkpoint is available')
        context = await loadContextForScene(state.checkpoint.currentSceneId, state.locale, context)
      } else if (choice.target) {
        context = await loadContextForScene(choice.target, state.locale, context)
      }
      const debugSnapshot = captureDebugSnapshot(`Choice ${choice.id}`)
      const previousState = state
      const previousAchievementProgress = achievementProgress
      const nextState = await applyChoice(context, state, choice)
      const newlyUnlocked = nextState.debug?.dirty
        ? []
        : readNewlyUnlockedAchievements(context, previousState, nextState)
      recentUnlockedAchievements = filterNewAchievementUnlocks(previousAchievementProgress, newlyUnlocked)
      state = nextState
      if (recentUnlockedAchievements.length > 0) {
        achievementProgress = await recordAchievementUnlocks(
          recentUnlockedAchievements.map((achievement) => achievement.variable),
          state.contentVersion,
        )
      }
      pushDebugUndo(debugSnapshot)
      resetStatDraft()
      if (choice.special === 'stats') openPanel('abilities')
      await saveGameState(state)
      await refresh()
      window.scrollTo({ top: 0, behavior: 'smooth' })
    } catch (caught) {
      error = formatCaughtError(caught)
    } finally {
      busy = false
    }
  }

  async function startNewGame() {
    if (!context || !state) return
    clearStatus()
    achievementProgress = await mergeAchievementProgressFromState(state)
    state = enterCurrentScene(context, createInitialState(state.contentVersion, settings.locale))
    resetStatDraft()
    await saveGameState(state)
    await refresh()
    closePanel({ restoreFocus: false })
  }

  async function loadSlot(slotId: string) {
    clearStatus()
    const loaded = await loadGameState(slotId)
    if (!loaded) return
    context = await loadContextForScene(loaded.currentSceneId, loaded.locale, context ?? undefined)
    state = loaded
    resetStatDraft()
    await refresh()
    closePanel({ restoreFocus: false })
  }

  async function saveManualSlot() {
    if (!state) return
    clearSaveFeedback()
    const now = new Date().toISOString()
    const slotId = `manual-${Date.now().toString(36)}`
    const label = manualSaveName.trim()
    const snapshot = { ...state, slotId, updatedAt: now }
    await saveGameState(snapshot, { label })
    state = { ...state, updatedAt: now }
    await saveGameState(state)
    manualSaveName = ''
    await refresh()
    panelStatus = t(uiMessages, 'status.saved', { saveName: label || formatDefaultSaveTitle(now) }, 'Save created')
  }

  function requestRemoveSlot(save: SaveSummary) {
    clearSaveFeedback()
    pendingDeleteSave = save
  }

  function cancelRemoveSlot() {
    pendingDeleteSave = null
  }

  async function confirmRemoveSlot() {
    if (!pendingDeleteSave) return
    const slotId = pendingDeleteSave.slotId
    pendingDeleteSave = null
    await removeSlot(slotId)
  }

  async function removeSlot(slotId: string) {
    if (slotId === 'autosave') return
    clearSaveFeedback()
    await deleteSave(slotId)
    await refresh()
    panelStatus = t(uiMessages, 'status.deleted', {}, 'Save deleted')
  }

  function startRenameSlot(save: SaveSummary) {
    clearSaveFeedback()
    editingSaveId = save.slotId
    editingSaveName = save.label ?? saveTitle(save)
  }

  function cancelRenameSlot() {
    editingSaveId = ''
    editingSaveName = ''
  }

  async function confirmRenameSlot(slotId: string) {
    clearSaveFeedback()
    await renameSave(slotId, editingSaveName)
    editingSaveId = ''
    editingSaveName = ''
    await refresh()
    panelStatus = t(uiMessages, 'status.renamed', {}, 'Save renamed')
  }

  async function restoreLastCheckpoint() {
    if (!state || !context || !state.checkpoint) return
    clearStatus()
    achievementProgress = await mergeAchievementProgressFromState(state)
    context = await loadContextForScene(state.checkpoint.currentSceneId, state.locale, context)
    state = restoreCheckpoint(context, state)
    resetStatDraft()
    await saveGameState(state)
    await refresh()
    closePanel({ restoreFocus: false })
  }

  async function downloadSave() {
    if (!state || saveBusy !== 'none') return
    try {
      saveBusy = 'export'
      clearSaveFeedback()
      const exported = await exportSave(state, passphrase)
      const blob = new Blob([exported], { type: 'application/vnd.magium.save+json' })
      const url = URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = saveFileName(state.currentSceneId)
      anchor.click()
      URL.revokeObjectURL(url)
      panelStatus = t(uiMessages, 'status.exported', {}, 'Save file downloaded')
      passphrase = ''
      saveTransferMode = 'none'
    } catch (caught) {
      panelError = formatCaughtError(caught)
    } finally {
      saveBusy = 'none'
    }
  }

  async function importSelectedSave(event: Event) {
    const file = (event.currentTarget as HTMLInputElement).files?.[0]
    if (!file || !state || saveBusy !== 'none') return
    try {
      saveBusy = 'import'
      clearSaveFeedback()
      const raw = await file.text()
      const imported = await importSave(raw, importPassphrase, runtimeContentVersion || state.contentVersion, async (sceneId) => {
        context = await loadContextForScene(sceneId, settings.locale, context ?? undefined)
        return context
      })
      achievementProgress = await mergeAchievementProgressFromState(imported)
      context = await loadContextForScene(imported.currentSceneId, imported.locale, context ?? undefined)
      state = imported
      resetStatDraft()
      await refresh()
      panelStatus = t(uiMessages, 'status.imported', {}, 'Save imported and ready')
      importPassphrase = ''
      saveTransferMode = 'none'
    } catch (caught) {
      panelError = formatCaughtError(caught)
    } finally {
      saveBusy = 'none'
      if (importInput) importInput.value = ''
    }
  }

  function showSaveTransfer(mode: SaveTransferMode) {
    clearSaveFeedback()
    saveTransferMode = mode
    if (mode !== 'export') passphrase = ''
    if (mode !== 'import') importPassphrase = ''
  }

  function chooseImportFile() {
    clearSaveFeedback()
    if (!importPassphrase.trim()) {
      panelError = t(uiMessages, 'errors.savePasswordRequired', {}, 'Enter the export password for this save')
      return
    }
    importInput?.click()
  }

  function updateSettings(next: Partial<ReaderSettings>) {
    settings = { ...settings, ...next }
    persistReaderSettings(settings)
    applyReaderSettings(settings)
  }

  function hideMomentVisual(src: string) {
    hiddenMomentVisuals = { ...hiddenMomentVisuals, [src]: true }
  }

  async function updateLanguage(locale: string) {
    try {
      clearStatus()
      const nextMessages = (await loadUiLocale(locale)).messages
      let nextState = state
      if (state) {
        context = await loadContextForScene(state.currentSceneId, locale, context ?? undefined)
        nextState = { ...state, locale, updatedAt: new Date().toISOString() }
      }
      settings = { ...settings, locale, uiLocale: locale }
      persistReaderSettings(settings)
      applyReaderSettings(settings)
      uiMessages = nextMessages
      state = nextState
      resetStatDraft()
      if (state) {
        await saveGameState(state)
        await refresh()
      }
      error = ''
    } catch (caught) {
      error = formatCaughtError(caught)
    }
  }

  function applyReaderSettings(next: ReaderSettings) {
    document.documentElement.dataset.theme = next.theme
    document.documentElement.dataset.contrast = next.highContrast ? 'high' : 'normal'
    document.documentElement.lang = next.uiLocale
    document.documentElement.style.setProperty('--reader-scale', String(next.textScale))
    document.querySelector<HTMLMetaElement>('meta[name="theme-color"]')?.setAttribute('content', themeColorFor(next.theme))
  }

  function themeColorFor(theme: ReaderSettings['theme']) {
    return theme === 'light' ? '#efe6d4' : '#120f14'
  }

  function loadReaderSettings(): ReaderSettings {
    try {
      const stored = JSON.parse(localStorage.getItem('magium.readerSettings') ?? '{}') as Partial<ReaderSettings>
      return migrateReaderSettings(stored, browserLanguages())
    } catch {
      const locale = resolveUiLocale(null, browserLanguages())
      return { ...defaultReaderSettings, locale, uiLocale: locale }
    }
  }

  function persistReaderSettings(next: ReaderSettings) {
    localStorage.setItem('magium.readerSettings', JSON.stringify(next))
  }

  function browserLanguages() {
    return navigator.languages?.length ? navigator.languages : [navigator.language]
  }

  function resolveAvailableLanguages(uiLocales: string[], storyLocales: string[], fallback: string) {
    const storySet = new Set(storyLocales.length ? storyLocales : [fallback])
    const candidates = (uiLocales.length ? uiLocales : [fallback]).filter((locale) => storySet.has(locale))
    return candidates.length ? candidates : [fallback]
  }

  function describeScene(sceneId: string, messages: Record<string, string>) {
    const match = sceneId.match(/^(?:B(?<book>\d+)-)?Ch(?<chapter>\d+)/)
    if (!match?.groups) return sceneId
    const book = match.groups.book ?? '1'
    const chapter = Number(match.groups.chapter)
    return t(messages, 'reader.chapterTitle', { book, chapter }, `Book ${book} - Chapter ${chapter}`)
  }

  function saveTitle(save: SaveSummary) {
    if (save.slotId === 'autosave') {
      return t(uiMessages, 'saves.autosaveTitle', {}, 'Automatic save')
    }
    return save.label ?? formatDefaultSaveTitle(save.updatedAt)
  }

  function formatDefaultSaveTitle(updatedAt: string) {
    return t(uiMessages, 'saves.defaultSaveName', { date: formatSaveDateTime(updatedAt) }, `Save from ${formatSaveDateTime(updatedAt)}`)
  }

  function saveChapter(save: SaveSummary) {
    return save.currentSceneId
      ? describeScene(save.currentSceneId, uiMessages)
      : t(uiMessages, 'saves.unknownChapter', {}, 'Chapter unavailable')
  }

  function formatSaveDateTime(value: string) {
    const date = new Date(value)
    if (Number.isNaN(date.getTime())) return value
    return date.toLocaleString(settings.uiLocale, {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  function checkpointTitle() {
    return state?.checkpoint
      ? describeScene(state.checkpoint.currentSceneId, uiMessages)
      : t(uiMessages, 'saves.noCheckpoint', {}, 'No checkpoint available')
  }

  function saveFileName(sceneId: string) {
    const chapter = describeScene(sceneId, uiMessages)
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
    return `magium-${chapter || 'save'}-${new Date().toISOString().slice(0, 10)}.magium-save`
  }

  function achievementText(messageId: string) {
    return context?.achievementLocale.messages[messageId] ?? messageId
  }

  function getPanelLabel(panel: Panel) {
    switch (panel) {
      case 'saves':
        return t(uiMessages, 'saves.title', {}, 'Saves')
      case 'abilities':
        return t(uiMessages, 'abilities.title', {}, 'Abilities')
      case 'achievements':
        return t(uiMessages, 'achievements.title', {}, 'Achievements')
      case 'settings':
        return t(uiMessages, 'settings.title', {}, 'Settings')
      case 'about':
        return t(uiMessages, 'about.title', {}, 'About')
      case 'debug':
        return t(uiMessages, 'debug.title', {}, 'Debug')
      default:
        return t(uiMessages, 'reader.eyebrow', {}, 'Magium')
    }
  }

  function openPanel(panel: Exclude<Panel, 'none'>, trigger?: HTMLElement | null) {
    lastPanelTrigger = trigger ?? lastPanelTrigger
    activePanel = panel
  }

  function closePanel(options: { restoreFocus?: boolean } = {}) {
    const restoreFocus = options.restoreFocus ?? true
    const trigger = lastPanelTrigger
    pendingDeleteSave = null
    activePanel = 'none'
    if (restoreFocus && trigger) {
      requestAnimationFrame(() => trigger.focus({ preventScroll: true }))
    }
  }

  function togglePanel(panel: Exclude<Panel, 'none'>, event?: MouseEvent) {
    const trigger = event?.currentTarget instanceof HTMLElement ? event.currentTarget : null
    if (activePanel === panel) {
      lastPanelTrigger = trigger ?? lastPanelTrigger
      closePanel()
      return
    }
    openPanel(panel, trigger)
  }

  function handleWindowKeydown(event: KeyboardEvent) {
    if (event.key !== 'Escape') return
    if (contributionTarget) {
      event.preventDefault()
      closeContributionModal()
      return
    }
    if (pendingDeleteSave) {
      event.preventDefault()
      cancelRemoveSlot()
      return
    }
    if (activePanel === 'none') return
    event.preventDefault()
    closePanel()
  }

  function handlePanelKeydown(event: KeyboardEvent) {
    if (!isMobilePanel || event.key !== 'Tab' || !panelElement) return
    const focusable = Array.from(
      panelElement.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
      ),
    ).filter((element) => element.offsetParent !== null)
    const first = focusable[0]
    const last = focusable[focusable.length - 1]
    if (!first || !last) return

    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault()
      last.focus()
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault()
      first.focus()
    }
  }

  function increaseStat(variable: string) {
    if (busy || remainingStatPoints <= 0) return
    const stat = stats.find((candidate) => candidate.variable === variable)
    if (!stat || stat.value >= stat.max) return
    statDraft = { ...statDraft, [variable]: (statDraft[variable] ?? 0) + 1 }
  }

  function decreaseStat(variable: string) {
    if (busy) return
    const current = statDraft[variable] ?? 0
    if (current <= 0) return
    const next = { ...statDraft }
    if (current === 1) {
      delete next[variable]
    } else {
      next[variable] = current - 1
    }
    statDraft = next
  }

  async function confirmStatAllocation() {
    if (!state || busy || draftedStatPoints <= 0) return
    const deltas: StatAllocationDelta[] = Object.entries(statDraft)
      .filter(([, amount]) => amount > 0)
      .map(([variable, amount]) => ({ variable, amount }))
    if (!deltas.length) return

    try {
      busy = true
      error = ''
      const debugSnapshot = captureDebugSnapshot('Stats allocation')
      state = await applyStatAllocation(state, deltas)
      pushDebugUndo(debugSnapshot)
      resetStatDraft()
      await saveGameState(state)
      await refresh()
      status = t(uiMessages, 'status.statsAllocated', {}, 'Stats updated')
    } catch (caught) {
      error = formatCaughtError(caught)
    } finally {
      busy = false
    }
  }

  async function selectDebugChapter(chapterId: string) {
    debugChapterId = chapterId
    const chapter = await ensureDebugChapter(chapterId)
    debugSceneId = chapter.sceneOrder[0] ?? ''
  }

  async function jumpToDebugScene() {
    if (!state || !debugSceneId || busy) return
    try {
      busy = true
      clearSaveFeedback()
      const debugSnapshot = captureDebugSnapshot(`Jump to ${debugSceneId}`)
      context = await loadContextForScene(debugSceneId, state.locale, context ?? undefined)
      state = debugJumpToScene(context, state, debugSceneId)
      pushDebugUndo(debugSnapshot)
      resetStatDraft()
      await saveGameState(state)
      await refresh()
      panelStatus = t(uiMessages, 'debug.statusJumped', { sceneId: debugSceneId }, `Jumped to ${debugSceneId}`)
      window.scrollTo({ top: 0, behavior: 'smooth' })
    } catch (caught) {
      panelError = formatCaughtError(caught)
    } finally {
      busy = false
    }
  }

  async function applyDebugChoice(choice: Choice) {
    if (!state || busy) return
    try {
      busy = true
      clearSaveFeedback()
      const targetSceneId = choice.special === 'restart'
        ? context?.index.initialSceneId
        : choice.target || state.currentSceneId
      if (!targetSceneId) return
      const debugSnapshot = captureDebugSnapshot(`Debug choice ${choice.id}`)
      context = await loadContextForScene(targetSceneId, state.locale, context ?? undefined)
      state = debugApplyChoice(context, state, choice)
      pushDebugUndo(debugSnapshot)
      resetStatDraft()
      await saveGameState(state)
      await refresh()
      panelStatus = t(uiMessages, 'debug.statusChoice', { choiceId: choice.id }, `Applied ${choice.id}`)
      window.scrollTo({ top: 0, behavior: 'smooth' })
    } catch (caught) {
      panelError = formatCaughtError(caught)
    } finally {
      busy = false
    }
  }

  async function setDebugNumericVariable(variable: string, value: number, syncAux = false) {
    if (!state || busy || !Number.isFinite(value)) return
    try {
      busy = true
      clearSaveFeedback()
      const normalized = Math.trunc(value)
      const debugSnapshot = captureDebugSnapshot(`Set ${variable}`)
      let next = debugSetVariable(state, variable, normalized, `Set ${variable} to ${normalized}`)
      if (syncAux && isPrimaryStatVariable(variable)) {
        next.variables[statAuxVariable(variable)] = normalized
      }
      state = next
      pushDebugUndo(debugSnapshot)
      resetStatDraft()
      await saveGameState(state)
      await refresh()
      panelStatus = t(uiMessages, 'debug.statusVariable', { variable }, `${variable} updated`)
    } catch (caught) {
      panelError = formatCaughtError(caught)
    } finally {
      busy = false
    }
  }

  async function adjustDebugNumericVariable(variable: string, amount: number, syncAux = false) {
    if (!state) return
    await setDebugNumericVariable(variable, readNumericVariable(state.variables, variable) + amount, syncAux)
  }

  async function setDebugVariableFromForm() {
    if (!state || busy) return
    const variable = debugVariableName.trim()
    if (!variable) {
      panelError = t(uiMessages, 'debug.errorVariableName', {}, 'Enter a variable name')
      return
    }

    try {
      busy = true
      clearSaveFeedback()
      const value = parseDebugValue(debugVariableValue, debugVariableKind)
      const debugSnapshot = captureDebugSnapshot(`Set ${variable}`)
      state = debugSetVariable(state, variable, value, `Set ${variable}`)
      pushDebugUndo(debugSnapshot)
      resetStatDraft()
      await saveGameState(state)
      await refresh()
      panelStatus = t(uiMessages, 'debug.statusVariable', { variable }, `${variable} updated`)
    } catch (caught) {
      panelError = formatCaughtError(caught)
    } finally {
      busy = false
    }
  }

  async function deleteDebugVariableFromForm() {
    if (!state || busy) return
    const variable = debugVariableName.trim()
    if (!variable) {
      panelError = t(uiMessages, 'debug.errorVariableName', {}, 'Enter a variable name')
      return
    }

    try {
      busy = true
      clearSaveFeedback()
      const debugSnapshot = captureDebugSnapshot(`Delete ${variable}`)
      state = debugDeleteVariable(state, variable)
      pushDebugUndo(debugSnapshot)
      resetStatDraft()
      await saveGameState(state)
      await refresh()
      panelStatus = t(uiMessages, 'debug.statusVariableDeleted', { variable }, `${variable} deleted`)
    } catch (caught) {
      panelError = formatCaughtError(caught)
    } finally {
      busy = false
    }
  }

  async function undoDebugChange() {
    if (!state || !debugUndoStack.length || busy) return
    const snapshot = debugUndoStack[debugUndoStack.length - 1]
    debugUndoStack = debugUndoStack.slice(0, -1)
    debugRedoStack = pushDebugSnapshot(debugRedoStack, {
      label: snapshot.label,
      state: cloneGameState(state),
    })
    await restoreDebugSnapshot(snapshot)
    panelStatus = t(uiMessages, 'debug.statusUndo', { label: snapshot.label }, `Undid ${snapshot.label}`)
  }

  async function redoDebugChange() {
    if (!state || !debugRedoStack.length || busy) return
    const snapshot = debugRedoStack[debugRedoStack.length - 1]
    debugRedoStack = debugRedoStack.slice(0, -1)
    debugUndoStack = pushDebugSnapshot(debugUndoStack, {
      label: snapshot.label,
      state: cloneGameState(state),
    })
    await restoreDebugSnapshot(snapshot)
    panelStatus = t(uiMessages, 'debug.statusRedo', { label: snapshot.label }, `Redid ${snapshot.label}`)
  }

  async function restoreDebugSnapshot(snapshot: DebugSnapshot) {
    try {
      busy = true
      clearSaveFeedback()
      context = await loadContextForScene(snapshot.state.currentSceneId, snapshot.state.locale, context ?? undefined)
      state = cloneGameState(snapshot.state)
      resetStatDraft()
      await saveGameState(state)
      await refresh()
      window.scrollTo({ top: 0, behavior: 'smooth' })
    } catch (caught) {
      panelError = formatCaughtError(caught)
    } finally {
      busy = false
    }
  }

  function captureDebugSnapshot(label: string): DebugSnapshot | null {
    if (!isDebugBuild || !state) return null
    return {
      label,
      state: cloneGameState(state),
    }
  }

  function pushDebugUndo(snapshot: DebugSnapshot | null) {
    if (!snapshot) return
    debugUndoStack = pushDebugSnapshot(debugUndoStack, snapshot)
    debugRedoStack = []
  }

  function pushDebugSnapshot(stack: DebugSnapshot[], snapshot: DebugSnapshot) {
    return [...stack, snapshot].slice(-maxDebugSnapshots)
  }

  function cloneGameState(next: GameState): GameState {
    return JSON.parse(JSON.stringify(next)) as GameState
  }

  function rememberLoadedDebugChapters() {
    if (!context) return
    debugChapterCache = { ...debugChapterCache, ...context.chapters }
  }

  function syncDebugSelection() {
    if (!state || !context) return
    const chapterId = context.index.sceneToChapter[state.currentSceneId]
    if (!chapterId) return
    debugChapterId = chapterId
    debugSceneId = state.currentSceneId
  }

  async function ensureDebugChapter(chapterId: string) {
    const existing = debugChapterCache[chapterId] ?? context?.chapters[chapterId]
    if (existing) return existing
    const chapter = await loadStoryChapter(chapterId)
    debugChapterCache = { ...debugChapterCache, [chapterId]: chapter }
    return chapter
  }

  function parseDebugValue(raw: string, kind: DebugValueKind): PrimitiveValue {
    const trimmed = raw.trim()
    if (kind === 'string') {
      return raw
    }
    if (kind === 'boolean') {
      if (['true', '1', 'yes', 'oui'].includes(trimmed.toLowerCase())) return true
      if (['false', '0', 'no', 'non'].includes(trimmed.toLowerCase())) return false
      throw new Error('Debug boolean values must be true or false')
    }
    const value = Number(trimmed)
    if (!Number.isFinite(value)) {
      throw new Error('Debug numeric values must be finite numbers')
    }
    return Math.trunc(value)
  }

  function isPrimaryStatVariable(variable: string) {
    return (STAT_VARIABLES as readonly string[]).includes(variable)
  }

  function debugChapterLabel(chapter: ContentIndex['chapters'][number]) {
    return `${chapter.key} (${chapter.id})`
  }

  function debugChoiceText(choice: Choice) {
    if (!state || !context) return choice.messageId
    const chapterId = context.index.sceneToChapter[state.currentSceneId]
    return chapterId
      ? context.locales[chapterId]?.messages[choice.messageId] ?? `[${choice.messageId}]`
      : `[${choice.messageId}]`
  }

  function formatDebugVariableValue(value: PrimitiveValue) {
    return typeof value === 'string' ? `"${value}"` : String(value)
  }

  function resetStatDraft() {
    statDraft = {}
  }

  function clearStatus() {
    status = ''
    recentUnlockedAchievements = []
  }

  function clearSaveFeedback() {
    panelError = ''
    panelStatus = ''
    error = ''
    status = ''
    recentUnlockedAchievements = []
  }

  function canUseDropCap(text: string) {
    return /^[A-Za-z]/.test(text.trim())
  }

  function createEmptyContributionDraft(): TranslationContributionDraft {
    return {
      proposedText: '',
      note: '',
      pseudonym: '',
      creditRequested: false,
      email: '',
      notifyRequested: false,
    }
  }

  async function openParagraphContribution(paragraph: DisplayParagraph) {
    if (!rendered) return
    const block = rendered.scene.blocks.find((candidate) => candidate.id === paragraph.sourceId)
    if (!block) return
    await openContributionTarget('paragraph', block.messageId, paragraph)
  }

  async function openChoiceContribution(choice: Choice) {
    await openContributionTarget('choice', choice.messageId)
  }

  async function openContributionTarget(targetType: TranslationContributionTarget['targetType'], messageId: string, paragraph?: DisplayParagraph) {
    if (!state || !context) return
    contributionError = ''
    contributionStatus = ''
    contributionSubmitted = false
    const chapterId = context.index.sceneToChapter[state.currentSceneId]
    if (!chapterId) return
    const currentBundle = context.locales[chapterId]
    const sourceBundle = await loadLocaleChapter(chapterId, 'en')
    const currentMessageText = currentBundle.messages[messageId] ?? ''
    const sourceMessageText = sourceBundle.messages[messageId] ?? ''
    const sourceSegments = splitDisplayText(sourceMessageText)
    const currentText = paragraph ? paragraph.text : currentMessageText
    const sourceText = paragraph ? (sourceSegments[paragraph.segmentIndex] ?? '') : sourceMessageText
    contributionTarget = {
      contentVersion: state.contentVersion,
      locale: state.locale,
      chapterId,
      sceneId: state.currentSceneId,
      messageId,
      targetType,
      ...(paragraph ? { segmentIndex: paragraph.segmentIndex, segmentCount: paragraph.segmentCount } : {}),
      currentText,
      sourceText,
      currentTextHash: await hashContributionText(currentText),
      sourceTextHash: await hashContributionText(sourceText),
    }
    contributionDraft = {
      ...contributionDraft,
      proposedText: currentText,
      note: '',
    }
  }

  function closeContributionModal() {
    if (contributionSubmitted) {
      contributionDraft = {
        ...contributionDraft,
        proposedText: '',
        note: '',
      }
    }
    contributionTarget = null
    contributionError = ''
    contributionStatus = ''
    contributionSubmitted = false
  }

  async function submitContribution() {
    if (!contributionTarget || contributionBusy) return
    contributionError = ''
    contributionStatus = ''
    contributionSubmitted = false

    if (!contributionDraft.proposedText.trim()) {
      contributionError = t(uiMessages, 'contribution.errorEmpty', {}, 'Enter a proposed correction.')
      return
    }

    if (contributionDraft.proposedText.trim() === contributionTarget.currentText.trim()) {
      contributionError = t(uiMessages, 'contribution.errorUnchanged', {}, 'Change the text before sending a proposal.')
      return
    }

    if (contributionTarget.targetType === 'paragraph' && DISPLAY_PARAGRAPH_BREAK.test(contributionDraft.proposedText.trim())) {
      contributionError = t(uiMessages, 'contribution.errorParagraphBreak', {}, 'Send one paragraph at a time. Remove the blank line or open another paragraph correction.')
      return
    }

    if (contributionDraft.creditRequested && !contributionDraft.pseudonym.trim()) {
      contributionError = t(uiMessages, 'contribution.errorPseudonym', {}, 'Enter a pseudonym or turn off credits.')
      return
    }

    if (contributionDraft.notifyRequested && !contributionDraft.email.trim()) {
      contributionError = t(uiMessages, 'contribution.errorEmail', {}, 'Enter an email address or turn off notifications.')
      return
    }

    if (!contributionApiUrl) {
      contributionError = t(uiMessages, 'contribution.errorUnavailable', {}, 'Translation contributions are not configured on this build.')
      return
    }

    try {
      contributionBusy = true
      const captchaToken = await requestTurnstileToken(turnstileSiteKey)
      const emailConsent = contributionDraft.notifyRequested && contributionDraft.email.trim()
        ? await loadContributionEmailConsent(contributionDraft.email)
        : null
      const draft = {
        ...contributionDraft,
        ...(emailConsent ? { emailConsentId: emailConsent.id, emailConsentToken: emailConsent.token } : {}),
      }
      const payload = buildTranslationProposalPayload(contributionTarget, draft, captchaToken)
      const response = await submitTranslationProposal(contributionApiUrl, payload)
      if (rememberContributionProfile) {
        await saveContributionProfile({
          pseudonym: contributionDraft.pseudonym.trim(),
          email: contributionDraft.email.trim(),
        })
      } else {
        await clearContributionProfile()
      }
      if (response.notificationStatus === 'confirmation_sent' && contributionDraft.email.trim()) {
        await savePendingContributionEmailConsent(response.publicId, contributionDraft.email)
      }
      if (response.notificationStatus === 'confirmed' && emailConsent && response.emailConsentExpiresAt) {
        await saveContributionEmailConsentForEmail(contributionDraft.email, {
          id: emailConsent.id,
          token: emailConsent.token,
          expiresAt: response.emailConsentExpiresAt,
        })
      }
      contributionSubmitted = true
      contributionStatus = contributionSuccessMessage(response.notificationStatus)
    } catch (caught) {
      contributionError = formatCaughtError(caught)
    } finally {
      contributionBusy = false
    }
  }

  async function eraseContributionProfile() {
    await clearContributionProfile()
    await clearContributionEmailState()
    contributionDraft = {
      ...contributionDraft,
      pseudonym: '',
      email: '',
      creditRequested: false,
      notifyRequested: false,
    }
    rememberContributionProfile = false
    contributionSubmitted = false
    contributionStatus = t(uiMessages, 'contribution.statusProfileCleared', {}, 'Contribution details were erased from this device.')
  }

  function contributionSuccessMessage(notificationStatus: 'none' | 'confirmation_sent' | 'confirmed') {
    if (notificationStatus === 'confirmation_sent') {
      return t(uiMessages, 'contribution.statusEmailConfirmationSent', {}, 'Proposal sent. A confirmation email has just been sent.')
    }
    if (notificationStatus === 'confirmed') {
      return t(uiMessages, 'contribution.statusEmailConfirmed', {}, 'Proposal sent. You will receive an email when it has been reviewed.')
    }
    return t(uiMessages, 'contribution.statusSent', {}, 'Proposal sent. Thank you for the correction.')
  }

  function formatCaughtError(caught: unknown) {
    const message = caught instanceof Error ? caught.message : String(caught)
    const key = errorMessageKeys[message]
    return key ? t(uiMessages, key, {}, message) : message
  }
</script>

<svelte:window on:keydown={handleWindowKeydown} />

<svelte:head>
  <title>Magium</title>
  <meta name="theme-color" content={browserThemeColor} />
  <link rel="manifest" href="/manifest.webmanifest" />
</svelte:head>

{#if loading}
  <main class="boot">
    <ArcaneSigil />
    <p>{t(uiMessages, 'boot.opening', {}, 'Opening the tournament...')}</p>
  </main>
{:else if error && !state}
  <main class="boot">
    <ArcaneSigil />
    <p>{error}</p>
  </main>
{:else}
  <main class="shell" class:panel-open={activePanel !== 'none'}>
    <aside class="brand-rail" aria-label="Magium">
      <div class="brand-mark"><ArcaneSigil /></div>
      <button class:active={activePanel === 'none'} title={t(uiMessages, 'nav.read', {}, 'Read')} aria-label={t(uiMessages, 'nav.read', {}, 'Read')} on:click={() => closePanel({ restoreFocus: false })}>
        <BookOpen size={19} />
        <span class="nav-label">{t(uiMessages, 'nav.read', {}, 'Read')}</span>
      </button>
      <button class:active={activePanel === 'abilities'} title={t(uiMessages, 'nav.abilities', {}, 'Abilities')} aria-label={t(uiMessages, 'nav.abilities', {}, 'Abilities')} on:click={(event) => togglePanel('abilities', event)}>
        <SlidersHorizontal size={19} />
        <span class="nav-label">{t(uiMessages, 'nav.abilities', {}, 'Abilities')}</span>
      </button>
      <button class:active={activePanel === 'saves'} title={t(uiMessages, 'nav.saves', {}, 'Saves')} aria-label={t(uiMessages, 'nav.saves', {}, 'Saves')} on:click={(event) => togglePanel('saves', event)}>
        <Save size={19} />
        <span class="nav-label">{t(uiMessages, 'nav.saves', {}, 'Saves')}</span>
      </button>
      <button class:active={activePanel === 'achievements'} title={t(uiMessages, 'nav.achievements', {}, 'Achievements')} aria-label={t(uiMessages, 'nav.achievements', {}, 'Achievements')} on:click={(event) => togglePanel('achievements', event)}>
        <Trophy size={19} />
        <span class="nav-label">{t(uiMessages, 'nav.achievements', {}, 'Achievements')}</span>
      </button>
      <button class:active={activePanel === 'settings'} title={t(uiMessages, 'nav.settings', {}, 'Settings')} aria-label={t(uiMessages, 'nav.settings', {}, 'Settings')} on:click={(event) => togglePanel('settings', event)}>
        <Settings size={19} />
        <span class="nav-label">{t(uiMessages, 'nav.settings', {}, 'Settings')}</span>
      </button>
      <button class:active={activePanel === 'about'} title={t(uiMessages, 'nav.about', {}, 'About')} aria-label={t(uiMessages, 'nav.about', {}, 'About')} on:click={(event) => togglePanel('about', event)}>
        <ShieldCheck size={19} />
        <span class="nav-label">{t(uiMessages, 'nav.about', {}, 'About')}</span>
      </button>
      {#if isDebugBuild}
        <button class:active={activePanel === 'debug'} title={t(uiMessages, 'nav.debug', {}, 'Debug')} aria-label={t(uiMessages, 'nav.debug', {}, 'Debug')} on:click={(event) => togglePanel('debug', event)}>
          <Bug size={19} />
          <span class="nav-label">{t(uiMessages, 'nav.debug', {}, 'Debug')}</span>
        </button>
      {/if}
    </aside>

    <section class="reader">
      <header class="reader-header">
        <div>
          <p class="eyebrow">{t(uiMessages, 'reader.eyebrow', {}, 'Magium')}</p>
          <h1>{chapterTitle}</h1>
        </div>
      </header>

      {#if rendered && state}
        {#if rendered.statChecks.length}
          <div class="stat-checks" aria-label={t(uiMessages, 'statChecks.aria', {}, 'Stat check results')}>
            {#each rendered.statChecks as statCheck}
              <div class:success={statCheck.outcome === 'success'} class:failure={statCheck.outcome === 'failure'} class="stat-check">
                {#if statCheck.outcome === 'success'}
                  <CircleCheck size={16} />
                  <span>{t(uiMessages, 'statChecks.success', { stat: statCheck.label, level: statCheck.level }, `${statCheck.label}: success - level ${statCheck.level}`)}</span>
                {:else}
                  <CircleX size={16} />
                  <span>{t(uiMessages, 'statChecks.failure', { stat: statCheck.label, level: statCheck.level }, `${statCheck.label}: failure - level ${statCheck.level}`)}</span>
                {/if}
              </div>
            {/each}
          </div>
        {/if}

        {#if recentUnlockedAchievements.length}
          <div class="achievement-unlocks" role="status" aria-live="polite" aria-label={t(uiMessages, 'achievements.unlocked', {}, 'Achievement unlocked')}>
            {#each recentUnlockedAchievements as achievement}
              <div class="achievement-unlock">
                <Trophy size={17} />
                <div>
                  <span>{t(uiMessages, 'achievements.unlocked', {}, 'Achievement unlocked')}</span>
                  <strong>{achievementText(achievement.titleMessageId)}</strong>
                  <small>{achievementText(achievement.captionMessageId)}</small>
                </div>
              </div>
            {/each}
          </div>
        {/if}

        <article class="scene">
          {#each displayParagraphs as paragraph, index (paragraph.id)}
            <div class="contribution-line">
              <p
                class:dropcap={index === 0 && canUseDropCap(paragraph.text)}
              >{paragraph.text}</p>
              <button
                type="button"
                class="text-correction"
                title={t(uiMessages, 'contribution.propose', {}, 'Propose a correction')}
                aria-label={t(uiMessages, 'contribution.proposeParagraph', {}, 'Propose a correction for this paragraph')}
                on:click={() => openParagraphContribution(paragraph)}
              >
                <Pencil size={14} />
              </button>
            </div>
          {/each}
        </article>

        {#if visibleMomentVisual}
          <figure class="moment-visual">
            <img
              src={visibleMomentVisual.src}
              alt={t(uiMessages, 'visual.momentAlt', { title: visibleMomentVisual.title }, `Illustration for ${visibleMomentVisual.title}`)}
              loading="lazy"
              decoding="async"
              on:error={() => hideMomentVisual(visibleMomentVisual.src)}
            />
          </figure>
        {/if}

        <div class="choices" aria-label={t(uiMessages, 'choices.aria', {}, 'Choices')}>
          {#each rendered.choices as choice}
            <div class="choice-row">
              <button disabled={busy} on:click={() => choose(choice)}>
                <ScrollText size={18} />
                <span>{choice.text}</span>
              </button>
              <button
                type="button"
                class="text-correction choice-correction"
                title={t(uiMessages, 'contribution.propose', {}, 'Propose a correction')}
                aria-label={t(uiMessages, 'contribution.proposeChoice', {}, 'Propose a correction for this choice')}
                on:click={() => openChoiceContribution(choice)}
              >
                <Pencil size={14} />
              </button>
            </div>
          {/each}
        </div>
      {/if}

      {#if error}
        <p class="notice error" role="alert">{error}</p>
      {:else if status}
        <p class="notice" role="status" aria-live="polite">{status}</p>
      {/if}
    </section>

    {#if activePanel !== 'none'}
      <button type="button" class="panel-scrim" aria-label={t(uiMessages, 'panel.close', {}, 'Close panel')} on:click={() => closePanel()}></button>
      <aside
        bind:this={panelElement}
        class="panel"
        role={isMobilePanel ? 'dialog' : 'complementary'}
        aria-modal={isMobilePanel ? 'true' : undefined}
        aria-label={panelLabel}
        on:keydown={handlePanelKeydown}
      >
        <button
          bind:this={panelCloseButton}
          type="button"
          class="panel-close"
          title={t(uiMessages, 'panel.close', {}, 'Close panel')}
          aria-label={t(uiMessages, 'panel.close', {}, 'Close panel')}
          on:click={() => closePanel()}
        >
          <X size={18} />
        </button>
        {#if activePanel === 'saves' && state}
          <h2>{t(uiMessages, 'saves.title', {}, 'Saves')}</h2>
          <p class="panel-copy">{t(uiMessages, 'saves.copy', {}, 'The game saves automatically after every choice. Use local saves to keep several playthroughs, and export only when you want a file to keep or move elsewhere.')}</p>

          <section class="save-section">
            <div class="save-section-heading">
              <h3>{t(uiMessages, 'saves.autosaveTitle', {}, 'Automatic save')}</h3>
              <p>{t(uiMessages, 'saves.autosaveCopy', {}, 'Your current playthrough is saved after every choice and stat allocation.')}</p>
            </div>
            <div class="save-summary">
              <strong>{chapterTitle}</strong>
              <span>{formatSaveDateTime(state.updatedAt)}</span>
            </div>
            <button class="wide" disabled={saveBusy !== 'none'} on:click={startNewGame}><RotateCcw size={17} /> {t(uiMessages, 'saves.newGame', {}, 'New game')}</button>
          </section>

          <section class="save-section">
            <div class="save-section-heading">
              <h3>{t(uiMessages, 'saves.localTitle', {}, 'Local saves')}</h3>
              <p>{t(uiMessages, 'saves.localCopy', {}, 'Create a local save before an important choice, then load or rename it later.')}</p>
            </div>
            <label>
              {t(uiMessages, 'saves.saveName', {}, 'Save name')}
              <input bind:value={manualSaveName} placeholder={t(uiMessages, 'saves.saveNamePlaceholder', {}, 'Optional')} disabled={saveBusy !== 'none'} />
            </label>
            <button class="wide" disabled={saveBusy !== 'none'} on:click={saveManualSlot}><Save size={17} /> {t(uiMessages, 'saves.createSave', {}, 'Create save')}</button>
            <div class="save-list">
              {#each saveSummaries as save}
                <div class="save-row" class:active-save={state.slotId === save.slotId}>
                  {#if editingSaveId === save.slotId}
                    <div class="save-edit">
                      <label>
                        {t(uiMessages, 'saves.renameLabel', {}, 'Save name')}
                        <input bind:value={editingSaveName} disabled={saveBusy !== 'none'} />
                      </label>
                      <div class="save-edit-actions">
                        <button disabled={saveBusy !== 'none'} on:click={() => confirmRenameSlot(save.slotId)}><CircleCheck size={16} /> {t(uiMessages, 'saves.renameConfirm', {}, 'Save')}</button>
                        <button disabled={saveBusy !== 'none'} on:click={cancelRenameSlot}><X size={16} /> {t(uiMessages, 'saves.renameCancel', {}, 'Cancel')}</button>
                      </div>
                    </div>
                  {:else}
                    <button class="save-load" disabled={saveBusy !== 'none'} on:click={() => loadSlot(save.slotId)}>
                      <strong>{saveTitle(save)}</strong>
                      <span>{saveChapter(save)}</span>
                      <small>{formatSaveDateTime(save.updatedAt)}</small>
                      {#if state.slotId === save.slotId}
                        <em>{t(uiMessages, 'saves.current', {}, 'Current')}</em>
                      {/if}
                    </button>
                    {#if save.slotId !== 'autosave'}
                      <div class="save-row-actions">
                        <button class="icon-action" disabled={saveBusy !== 'none'} title={t(uiMessages, 'saves.rename', {}, 'Rename')} aria-label={t(uiMessages, 'saves.rename', {}, 'Rename')} on:click={() => startRenameSlot(save)}>
                          <Pencil size={16} />
                        </button>
                        <button class="icon-action icon-danger" disabled={saveBusy !== 'none'} title={t(uiMessages, 'saves.deleteSave', {}, 'Delete save')} aria-label={t(uiMessages, 'saves.deleteSave', {}, 'Delete save')} on:click={() => requestRemoveSlot(save)}>
                          <Trash2 size={16} />
                        </button>
                      </div>
                    {/if}
                  {/if}
                </div>
              {/each}
            </div>
          </section>

          <section class="save-section">
            <div class="save-section-heading">
              <h3>{t(uiMessages, 'saves.checkpoint', {}, 'Checkpoint')}</h3>
              <p>{checkpointTitle()}</p>
            </div>
            <button class="wide" disabled={!state.checkpoint || saveBusy !== 'none'} on:click={restoreLastCheckpoint}><Library size={17} /> {t(uiMessages, 'saves.returnCheckpoint', {}, 'Return to checkpoint')}</button>
          </section>

          {#if state.debug?.dirty}
            <p class="notice panel-notice error" role="status">{t(uiMessages, 'saves.debugLocalOnly', {}, 'This save was changed with Debug and can only stay in local saves.')}</p>
          {/if}

          <section class="save-section">
            <div class="save-section-heading">
              <h3>{t(uiMessages, 'saves.transferTitle', {}, 'Transfer')}</h3>
              <p>{t(uiMessages, 'saves.transferCopy', {}, 'Export or import a save file. A password is only needed for these file actions.')}</p>
            </div>
            <div class="panel-actions">
              <button class:active={saveTransferMode === 'export'} disabled={saveBusy !== 'none'} on:click={() => showSaveTransfer('export')}><Download size={17} /> {t(uiMessages, 'saves.exportBackup', {}, 'Export save')}</button>
              <button class:active={saveTransferMode === 'import'} disabled={saveBusy !== 'none'} on:click={() => showSaveTransfer('import')}><Upload size={17} /> {t(uiMessages, 'saves.importBackup', {}, 'Import save')}</button>
            </div>
            {#if saveTransferMode === 'export'}
              <div class="save-transfer">
                <p class="help">{t(uiMessages, 'saves.exportHelp', {}, 'Choose a password to protect this file. You will need it to import the save elsewhere.')}</p>
                <label>
                  {t(uiMessages, 'saves.backupPassword', {}, 'Export password')}
                  <input type="password" bind:value={passphrase} autocomplete="new-password" disabled={saveBusy !== 'none'} />
                </label>
                <button class="wide" disabled={saveBusy !== 'none'} on:click={downloadSave}>
                  <Download size={17} />
                  {saveBusy === 'export' ? t(uiMessages, 'saves.exporting', {}, 'Exporting...') : t(uiMessages, 'saves.downloadBackup', {}, 'Download save')}
                </button>
              </div>
            {:else if saveTransferMode === 'import'}
              <div class="save-transfer">
                <p class="help">{t(uiMessages, 'saves.importHelp', {}, 'Use the password chosen when the save was exported.')}</p>
                <label>
                  {t(uiMessages, 'saves.restorePassword', {}, 'Import password')}
                  <input type="password" bind:value={importPassphrase} autocomplete="current-password" disabled={saveBusy !== 'none'} />
                </label>
                <input class="file-input" bind:this={importInput} type="file" accept=".magium-save,application/json" disabled={saveBusy !== 'none'} on:change={importSelectedSave} />
                <button class="wide" disabled={saveBusy !== 'none'} on:click={chooseImportFile}>
                  <Upload size={17} />
                  {saveBusy === 'import' ? t(uiMessages, 'saves.importing', {}, 'Importing...') : t(uiMessages, 'saves.chooseImportFile', {}, 'Choose save file')}
                </button>
              </div>
            {/if}
          </section>
          {#if panelError}
            <p class="notice panel-notice error" role="alert">{panelError}</p>
          {:else if panelStatus}
            <p class="notice panel-notice" role="status" aria-live="polite">{panelStatus}</p>
          {/if}
        {:else if activePanel === 'abilities'}
          <h2>{t(uiMessages, 'abilities.title', {}, 'Abilities')}</h2>
          {#if stats.length}
            <div class="stat-summary">
              <span>{t(uiMessages, 'abilities.points', {}, 'Points available')}</span>
              <strong>{remainingStatPoints}/{availableStatPoints}</strong>
            </div>
            <div class="stat-list">
              {#each stats as stat}
                <div class:overmax={stat.overMax} class="stat-row">
                  <span class="stat-label">{stat.label}</span>
                  <span class="stat-meter">
                    <strong>{stat.value}</strong>
                    <span>/{stat.max}</span>
                    {#if stat.pending > 0}
                      <em>+{stat.pending}</em>
                    {/if}
                  </span>
                  <div class="stat-controls">
                    <button
                      class="icon-stepper"
                      disabled={busy || stat.pending <= 0}
                      title={t(uiMessages, 'abilities.decrease', { stat: stat.label }, `Decrease ${stat.label}`)}
                      aria-label={t(uiMessages, 'abilities.decrease', { stat: stat.label }, `Decrease ${stat.label}`)}
                      on:click={() => decreaseStat(stat.variable)}
                    >
                      <Minus size={15} />
                    </button>
                    <button
                      class="icon-stepper"
                      disabled={busy || remainingStatPoints <= 0 || stat.value >= stat.max}
                      title={t(uiMessages, 'abilities.increase', { stat: stat.label }, `Increase ${stat.label}`)}
                      aria-label={t(uiMessages, 'abilities.increase', { stat: stat.label }, `Increase ${stat.label}`)}
                      on:click={() => increaseStat(stat.variable)}
                    >
                      <Plus size={15} />
                    </button>
                  </div>
                </div>
              {/each}
            </div>
            <div class="stat-actions">
              <button disabled={busy || draftedStatPoints <= 0} on:click={confirmStatAllocation}>
                {t(uiMessages, 'abilities.confirm', {}, 'Confirm')}
              </button>
              <button disabled={busy || draftedStatPoints <= 0} on:click={resetStatDraft}>
                {t(uiMessages, 'abilities.clear', {}, 'Clear')}
              </button>
            </div>
            <p class="panel-copy stat-help">{t(uiMessages, 'abilities.help', {}, 'Use + to prepare a point allocation. Use - to cancel a prepared point. Once confirmed, points are spent and cannot be removed from this panel.')}</p>
          {:else}
            <p class="empty-state">{t(uiMessages, 'abilities.empty', {}, 'Your abilities will appear here after Barry checks the stat device.')}</p>
          {/if}
        {:else if activePanel === 'achievements'}
          <h2>{t(uiMessages, 'achievements.title', {}, 'Achievements')}</h2>
          <div class="achievement-list">
            {#each context?.achievements.achievements ?? [] as achievement}
              <div class:locked={!achievementProgress.achievements[achievement.variable]} class="achievement">
                <strong>{achievementText(achievement.titleMessageId)}</strong>
                <span>{achievementText(achievement.captionMessageId)}</span>
              </div>
            {/each}
          </div>
        {:else if activePanel === 'settings'}
          <h2>{t(uiMessages, 'settings.title', {}, 'Settings')}</h2>
          <p class="panel-copy">{t(uiMessages, 'settings.copy', {}, 'These choices only affect reading comfort. The story and your progress stay the same.')}</p>
          <div class="setting-group">
            <p class="field-label">{t(uiMessages, 'settings.language', {}, 'Language')}</p>
            <div class="segmented">
              {#if availableLanguages.includes('fr')}
                <button class:active={settings.locale === 'fr'} on:click={() => updateLanguage('fr')}>{t(uiMessages, 'settings.languageFrench', {}, 'French')}</button>
              {/if}
              {#if availableLanguages.includes('en')}
                <button class:active={settings.locale === 'en'} on:click={() => updateLanguage('en')}>{t(uiMessages, 'settings.languageEnglish', {}, 'English')}</button>
              {/if}
            </div>
          </div>
          <div class="setting-group">
            <p class="field-label">{t(uiMessages, 'settings.theme', {}, 'Theme')}</p>
            <div class="segmented">
              <button class:active={settings.theme === 'dark'} on:click={() => updateSettings({ theme: 'dark' })}>{t(uiMessages, 'settings.dark', {}, 'Dark')}</button>
              <button class:active={settings.theme === 'light'} on:click={() => updateSettings({ theme: 'light' })}>{t(uiMessages, 'settings.light', {}, 'Light')}</button>
            </div>
          </div>
          <label>
            {t(uiMessages, 'settings.textSize', {}, 'Text size')}
            <span class="help">{t(uiMessages, 'settings.textSizeHelp', {}, 'Adjust the story text for longer reading sessions.')}</span>
            <input type="range" min="0.88" max="1.24" step="0.04" bind:value={settings.textScale} on:input={() => updateSettings({ textScale: Number(settings.textScale) })} />
          </label>
          <label class="toggle">
            <input type="checkbox" checked={settings.highContrast} on:change={(event) => updateSettings({ highContrast: event.currentTarget.checked })} />
            <span>
              {t(uiMessages, 'settings.highContrast', {}, 'High contrast')}
              <span class="help">{t(uiMessages, 'settings.highContrastHelp', {}, 'Make text and controls stand out more strongly.')}</span>
            </span>
          </label>
          <label class="toggle">
            <input type="checkbox" checked={settings.illustrations} on:change={(event) => updateSettings({ illustrations: event.currentTarget.checked })} />
            <span>
              {t(uiMessages, 'settings.illustrations', {}, 'Illustrations')}
              <span class="help">{t(uiMessages, 'settings.illustrationsHelp', {}, 'Show moment illustrations after the matching scene when they are available.')}</span>
            </span>
          </label>
        {:else if activePanel === 'debug' && isDebugBuild && state}
          <h2>{t(uiMessages, 'debug.title', {}, 'Debug')}</h2>
          <div class:dirty={state.debug?.dirty} class="debug-state">
            <strong>{state.debug?.dirty ? t(uiMessages, 'debug.dirty', {}, 'Debug save') : t(uiMessages, 'debug.clean', {}, 'Clean save')}</strong>
            <span>{state.debug?.dirty ? state.debug.lastAction : state.currentSceneId}</span>
          </div>
          <div class="debug-toolbar">
            <button disabled={busy || !debugUndoStack.length} on:click={undoDebugChange}>
              <RotateCcw size={16} />
              {t(uiMessages, 'debug.undo', {}, 'Undo')}
            </button>
            <button disabled={busy || !debugRedoStack.length} on:click={redoDebugChange}>
              <ChevronsRight size={16} />
              {t(uiMessages, 'debug.redo', {}, 'Redo')}
            </button>
          </div>

          <section class="debug-section">
            <h3>{t(uiMessages, 'debug.navigation', {}, 'Navigation')}</h3>
            <label>
              {t(uiMessages, 'debug.chapter', {}, 'Chapter')}
              <select bind:value={debugChapterId} disabled={busy} on:change={(event) => selectDebugChapter(event.currentTarget.value)}>
                {#each debugChapters as chapter}
                  <option value={chapter.id}>{debugChapterLabel(chapter)}</option>
                {/each}
              </select>
            </label>
            <label>
              {t(uiMessages, 'debug.scene', {}, 'Scene')}
              <select bind:value={debugSceneId} disabled={busy || !debugSceneIds.length}>
                {#each debugSceneIds as sceneId}
                  <option value={sceneId}>{sceneId}</option>
                {/each}
              </select>
            </label>
            <button class="wide" disabled={busy || !debugSceneId} on:click={jumpToDebugScene}>
              <ChevronsRight size={17} />
              {t(uiMessages, 'debug.jump', {}, 'Jump')}
            </button>
          </section>

          <section class="debug-section">
            <h3>{t(uiMessages, 'debug.choices', {}, 'Choices')}</h3>
            <div class="debug-choice-list">
              {#each debugAllChoices as choice}
                <div class:hidden-choice={!debugVisibleChoiceIds.has(choice.id)} class="debug-choice-row">
                  <button disabled={busy} on:click={() => applyDebugChoice(choice)}>
                    <ScrollText size={16} />
                    <span>{debugChoiceText(choice)}</span>
                  </button>
                  <dl>
                    <div><dt>{t(uiMessages, 'debug.choiceId', {}, 'ID')}</dt><dd>{choice.id}</dd></div>
                    <div><dt>{t(uiMessages, 'debug.choiceTarget', {}, 'Target')}</dt><dd>{choice.target || '-'}</dd></div>
                    <div><dt>{t(uiMessages, 'debug.choiceSpecial', {}, 'Special')}</dt><dd>{choice.special || '-'}</dd></div>
                  </dl>
                  <code>{choice.conditions?.raw ?? t(uiMessages, 'debug.always', {}, 'always')}</code>
                </div>
              {:else}
                <p class="empty-state">{t(uiMessages, 'debug.noChoices', {}, 'No choices on this scene.')}</p>
              {/each}
            </div>
          </section>

          <section class="debug-section">
            <h3>{t(uiMessages, 'debug.stats', {}, 'Stats and counters')}</h3>
            <div class="debug-stat-list">
              {#each debugStatRows as stat}
                <div class="debug-stat-row">
                  <span>{stat.label}</span>
                  <div class="debug-number-controls">
                    <button
                      class="icon-stepper"
                      disabled={busy}
                      title={t(uiMessages, 'debug.decreaseVariable', { variable: stat.variable }, `Decrease ${stat.variable}`)}
                      aria-label={t(uiMessages, 'debug.decreaseVariable', { variable: stat.variable }, `Decrease ${stat.variable}`)}
                      on:click={() => adjustDebugNumericVariable(stat.variable, -1, isPrimaryStatVariable(stat.variable))}
                    >
                      <Minus size={15} />
                    </button>
                    <input
                      type="number"
                      value={stat.baseValue}
                      disabled={busy}
                      aria-label={stat.variable}
                      on:change={(event) => setDebugNumericVariable(stat.variable, Number(event.currentTarget.value), isPrimaryStatVariable(stat.variable))}
                    />
                    <button
                      class="icon-stepper"
                      disabled={busy}
                      title={t(uiMessages, 'debug.increaseVariable', { variable: stat.variable }, `Increase ${stat.variable}`)}
                      aria-label={t(uiMessages, 'debug.increaseVariable', { variable: stat.variable }, `Increase ${stat.variable}`)}
                      on:click={() => adjustDebugNumericVariable(stat.variable, 1, isPrimaryStatVariable(stat.variable))}
                    >
                      <Plus size={15} />
                    </button>
                  </div>
                  <code>{stat.variable}</code>
                </div>
              {/each}
            </div>
          </section>

          <section class="debug-section">
            <h3>{t(uiMessages, 'debug.variables', {}, 'Variables')}</h3>
            <label>
              {t(uiMessages, 'debug.variableName', {}, 'Variable')}
              <input list="debug-variable-names" bind:value={debugVariableName} disabled={busy} />
              <datalist id="debug-variable-names">
                {#each debugVariables as [name]}
                  <option value={name}></option>
                {/each}
              </datalist>
            </label>
            <div class="debug-variable-edit">
              <select bind:value={debugVariableKind} disabled={busy} aria-label={t(uiMessages, 'debug.variableType', {}, 'Type')}>
                <option value="number">{t(uiMessages, 'debug.typeNumber', {}, 'Number')}</option>
                <option value="string">{t(uiMessages, 'debug.typeString', {}, 'String')}</option>
                <option value="boolean">{t(uiMessages, 'debug.typeBoolean', {}, 'Boolean')}</option>
              </select>
              <input bind:value={debugVariableValue} disabled={busy} aria-label={t(uiMessages, 'debug.variableValue', {}, 'Value')} />
            </div>
            <div class="debug-toolbar">
              <button disabled={busy} on:click={setDebugVariableFromForm}>{t(uiMessages, 'debug.setVariable', {}, 'Set')}</button>
              <button class="danger-action" disabled={busy} on:click={deleteDebugVariableFromForm}>{t(uiMessages, 'debug.deleteVariable', {}, 'Delete')}</button>
            </div>
            <div class="debug-variable-list">
              {#each debugVariables as [name, value]}
                <button
                  disabled={busy}
                  on:click={() => {
                    debugVariableName = name
                    debugVariableKind = typeof value === 'number' ? 'number' : typeof value === 'boolean' ? 'boolean' : 'string'
                    debugVariableValue = String(value)
                  }}
                >
                  <span>{name}</span>
                  <code>{formatDebugVariableValue(value)}</code>
                </button>
              {/each}
            </div>
          </section>

          {#if panelError}
            <p class="notice panel-notice error" role="alert">{panelError}</p>
          {:else if panelStatus}
            <p class="notice panel-notice" role="status" aria-live="polite">{panelStatus}</p>
          {/if}
        {:else if activePanel === 'about'}
          <h2>{t(uiMessages, 'about.title', {}, 'About')}</h2>
          <div class="about-list">
            <p class="meta">{t(uiMessages, 'about.basedOn', {}, 'Based on "Magium" by Cristian Mihailescu / Chris Michael Wilson.')}</p>
            <p class="meta">{t(uiMessages, 'about.license', {}, 'Original story/data licensed under Creative Commons Attribution 4.0 International (CC BY 4.0).')}</p>
            <p class="meta">{t(uiMessages, 'about.translation', {}, 'French translation and adaptation by Foobar, 2026.')}</p>
            <p class="meta">{t(uiMessages, 'about.unofficial', {}, "This is an unofficial adaptation and is not endorsed by the original author's estate or the Magium community maintainers.")}</p>
            <p class="meta">{t(uiMessages, 'about.sourceLabel', {}, 'Source:')} <a href="https://github.com/raduprv/Magium" rel="noreferrer" target="_blank">https://github.com/raduprv/Magium</a></p>
            <p class="meta">{t(uiMessages, 'about.licenseLabel', {}, 'License:')} <a href="https://creativecommons.org/licenses/by/4.0/" rel="noreferrer" target="_blank">https://creativecommons.org/licenses/by/4.0/</a></p>
            <p class="meta">{t(uiMessages, 'about.privacyLabel', {}, 'Contribution privacy:')} <a href="/legal/contributions.html" rel="noreferrer" target="_blank">/legal/contributions.html</a></p>
            <p class="meta">{t(uiMessages, 'about.changes', {}, 'Changes: French translation, UI adaptation, technical restructuring, additional interface features.')}</p>
          </div>
        {/if}
      </aside>
    {/if}

    {#if pendingDeleteSave}
      <button type="button" class="confirm-scrim" aria-label={t(uiMessages, 'saves.deleteConfirmCancel', {}, 'Cancel')} on:click={cancelRemoveSlot}></button>
      <div class="confirm-modal" role="dialog" aria-modal="true" aria-label={t(uiMessages, 'saves.deleteConfirmTitle', {}, 'Delete this save?')} tabindex="-1">
        <h3>{t(uiMessages, 'saves.deleteConfirmTitle', {}, 'Delete this save?')}</h3>
        <p>{t(uiMessages, 'saves.deleteConfirmCopy', {}, 'This only removes the local save. Your automatic save stays available.')}</p>
        <div class="save-summary">
          <strong>{saveTitle(pendingDeleteSave)}</strong>
          <span>{saveChapter(pendingDeleteSave)}</span>
        </div>
        <div class="confirm-actions">
          <button disabled={saveBusy !== 'none'} on:click={cancelRemoveSlot}>{t(uiMessages, 'saves.deleteConfirmCancel', {}, 'Cancel')}</button>
          <button class="icon-danger" disabled={saveBusy !== 'none'} on:click={confirmRemoveSlot}>
            <Trash2 size={16} />
            {t(uiMessages, 'saves.deleteConfirmAction', {}, 'Delete save')}
          </button>
        </div>
      </div>
    {/if}

    {#if contributionTarget}
      <button type="button" class="confirm-scrim" aria-label={t(uiMessages, 'contribution.close', {}, 'Close contribution form')} on:click={closeContributionModal}></button>
      <div class="contribution-modal" role="dialog" aria-modal="true" aria-label={t(uiMessages, 'contribution.title', {}, 'Propose a correction')} tabindex="-1">
        <div class="contribution-modal-heading">
          <div>
            <p class="eyebrow">{contributionTarget.targetType === 'choice' ? t(uiMessages, 'contribution.targetChoice', {}, 'Choice') : t(uiMessages, 'contribution.targetParagraph', {}, 'Paragraph')}</p>
            <h3>{t(uiMessages, 'contribution.title', {}, 'Propose a correction')}</h3>
          </div>
          <button
            type="button"
            class="icon-action"
            title={t(uiMessages, 'contribution.close', {}, 'Close contribution form')}
            aria-label={t(uiMessages, 'contribution.close', {}, 'Close contribution form')}
            on:click={closeContributionModal}
          >
            <X size={16} />
          </button>
        </div>

        {#if contributionSubmitted}
          <div class="contribution-success" role="status" aria-live="polite">
            <CircleCheck size={26} />
            <p>{contributionStatus}</p>
            <button type="button" on:click={closeContributionModal}>{t(uiMessages, 'contribution.closeSuccess', {}, 'Close')}</button>
          </div>
        {:else}
          <div class="contribution-reference">
            <strong>{t(uiMessages, 'contribution.currentText', {}, 'Current text')}</strong>
            <p>{contributionTarget.currentText}</p>
          </div>
          {#if contributionTarget.sourceText && contributionTarget.sourceText !== contributionTarget.currentText}
            <div class="contribution-reference">
              <strong>{t(uiMessages, 'contribution.sourceText', {}, 'English source')}</strong>
              <p>{contributionTarget.sourceText}</p>
            </div>
          {/if}

          <label>
            {t(uiMessages, 'contribution.proposedText', {}, 'Proposed correction')}
            <textarea bind:value={contributionDraft.proposedText} rows="7" disabled={contributionBusy}></textarea>
          </label>
          <label>
            {t(uiMessages, 'contribution.note', {}, 'Comment for the maintainers')}
            <textarea bind:value={contributionDraft.note} rows="3" placeholder={t(uiMessages, 'contribution.notePlaceholder', {}, 'Optional')} disabled={contributionBusy}></textarea>
          </label>

          <div class="contribution-fields">
            <label>
              {t(uiMessages, 'contribution.pseudonym', {}, 'Pseudonym for credits')}
              <input type="text" bind:value={contributionDraft.pseudonym} placeholder={t(uiMessages, 'contribution.optional', {}, 'Optional')} disabled={contributionBusy} />
            </label>
            <label>
              {t(uiMessages, 'contribution.email', {}, 'Email for follow-up')}
              <input type="email" bind:value={contributionDraft.email} placeholder={t(uiMessages, 'contribution.optional', {}, 'Optional')} disabled={contributionBusy} />
            </label>
          </div>

          <label class="toggle">
            <input type="checkbox" bind:checked={contributionDraft.creditRequested} disabled={contributionBusy || !contributionDraft.pseudonym.trim()} />
            <span>
              {t(uiMessages, 'contribution.creditRequested', {}, 'Credit this pseudonym if the contribution is retained')}
              <span class="help">{t(uiMessages, 'contribution.creditHelp', {}, 'Pseudonyms can be moderated before publication if they are illegal, abusive, explicit, impersonating, or otherwise unsuitable.')}</span>
            </span>
          </label>
          <label class="toggle">
            <input type="checkbox" bind:checked={contributionDraft.notifyRequested} disabled={contributionBusy || !contributionDraft.email.trim()} />
            <span>
              {t(uiMessages, 'contribution.notifyRequested', {}, 'Notify me by email about this proposal')}
              <span class="help">{t(uiMessages, 'contribution.notifyHelp', {}, 'The first email confirmation is saved in this browser for one year. The email is used only for follow-up and is deleted after rejection or publication.')}</span>
            </span>
          </label>
          <label class="toggle">
            <input type="checkbox" bind:checked={rememberContributionProfile} disabled={contributionBusy} />
            <span>
              {t(uiMessages, 'contribution.rememberProfile', {}, 'Remember pseudonym and email on this device')}
              <span class="help">{t(uiMessages, 'contribution.rememberHelp', {}, 'Stored locally in this browser only. You can erase it at any time.')}</span>
            </span>
          </label>

          <p class="help contribution-privacy">{t(uiMessages, 'contribution.privacy', {}, 'You can contribute anonymously. Technical IDs are sent to route the proposal, but they are not shown here. Bot protection runs before submission.')}</p>

          <div class="contribution-actions">
            <button disabled={contributionBusy} on:click={closeContributionModal}>{t(uiMessages, 'contribution.cancel', {}, 'Cancel')}</button>
            <button disabled={contributionBusy} on:click={submitContribution}>
              <Pencil size={16} />
              {contributionBusy ? t(uiMessages, 'contribution.sending', {}, 'Sending...') : t(uiMessages, 'contribution.submit', {}, 'Send proposal')}
            </button>
          </div>
          <button class="contribution-clear" disabled={contributionBusy} on:click={eraseContributionProfile}>
            <Trash2 size={15} />
            {t(uiMessages, 'contribution.clearProfile', {}, 'Erase saved contribution details')}
          </button>

          {#if contributionError}
            <p class="notice panel-notice error" role="alert">{contributionError}</p>
          {:else if contributionStatus}
            <p class="notice panel-notice" role="status" aria-live="polite">{contributionStatus}</p>
          {/if}
        {/if}
      </div>
    {/if}
  </main>
{/if}
