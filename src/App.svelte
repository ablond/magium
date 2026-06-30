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
    Plus,
    RotateCcw,
    Save,
    ScrollText,
    Settings,
    ShieldCheck,
    SlidersHorizontal,
    Trophy,
    Upload,
    X,
  } from '@lucide/svelte'
  import { onMount } from 'svelte'
  import ArcaneSigil from './lib/ArcaneSigil.svelte'
  import { loadContextForScene, loadIndex, loadStoryChapter, loadUiLocale } from './lib/content/packedContent'
  import { DEFAULT_UI_LOCALES, resolveUiLocale, translateUi as t } from './lib/i18n/ui'
  import { splitDisplayParagraphs } from './lib/reader/displayParagraphs'
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
  import { deleteSave, exportSave, importSave, listSaveSummaries, loadGameState, saveGameState, SAVE_IMPORT_ERROR_MESSAGES, type SaveSummary } from './lib/storage/saves'
  import { getBook1SceneVisual } from './lib/visuals/book1'

  type Panel = 'none' | 'saves' | 'abilities' | 'achievements' | 'settings' | 'about' | 'debug'
  type DebugValueKind = 'number' | 'string' | 'boolean'
  type DebugSnapshot = {
    label: string
    state: GameState
  }

  const isDebugBuild = import.meta.env.DEV
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
    'This browser does not support runtime content decompression': 'errors.decompressionUnsupported',
    [SAVE_IMPORT_ERROR_MESSAGES.contentVersion]: 'errors.saveContentVersion',
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
  let runtimeContentVersion = ''
  let manualSlotId = 'manual-1'
  let settings: ReaderSettings = { ...defaultReaderSettings }
  let statDraft: Record<string, number> = {}
  let importInput: HTMLInputElement
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

  $: chapterTitle = state
    ? describeScene(state.currentSceneId, uiMessages)
    : t(uiMessages, 'reader.chapterTitle', { book: '1', chapter: 1 }, 'Book 1 - Chapter 1')
  $: visibleStatVariables = state ? revealedStatVariables(state) : []
  $: stats = state && context ? readStats(state.variables, context.statsLocale.messages, visibleStatVariables, statDraft) : []
  $: availableStatPoints = state ? readAvailableStatPoints(state.variables) : 0
  $: draftedStatPoints = Object.values(statDraft).reduce((sum, amount) => sum + amount, 0)
  $: remainingStatPoints = Math.max(0, availableStatPoints - draftedStatPoints)
  $: momentVisual = settings.illustrations && state ? getBook1SceneVisual(state.currentSceneId) : null
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
      context = await loadContextForScene(index.initialSceneId, settings.locale)
      const loaded = await loadGameState('autosave')
      if (loaded?.contentVersion === index.contentVersion) {
        context = await loadContextForScene(loaded.currentSceneId, loaded.locale, context)
        state = loaded
      } else {
        state = enterCurrentScene(context, createInitialState(index.contentVersion, settings.locale))
        await saveGameState(state)
      }
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
      if (choice.target) {
        context = await loadContextForScene(choice.target, state.locale, context)
      }
      const debugSnapshot = captureDebugSnapshot(`Choice ${choice.id}`)
      state = await applyChoice(context, state, choice)
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
    const slotId = manualSlotId.trim() || 'manual-1'
    state = { ...state, slotId, updatedAt: new Date().toISOString() }
    await saveGameState(state)
    state = { ...state, slotId: 'autosave', updatedAt: new Date().toISOString() }
    await saveGameState(state)
    await refresh()
    panelStatus = t(uiMessages, 'status.saved', { slotId }, `Saved ${slotId}`)
  }

  async function removeSlot(slotId: string) {
    if (slotId === 'autosave') return
    await deleteSave(slotId)
    await refresh()
  }

  async function restoreLastCheckpoint() {
    if (!state || !context || !state.checkpoint) return
    clearStatus()
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
      anchor.download = `${state.slotId}-${new Date().toISOString().slice(0, 10)}.magium-save`
      anchor.click()
      URL.revokeObjectURL(url)
      panelStatus = passphrase.trim()
        ? t(uiMessages, 'status.exportPortable', {}, 'Portable backup exported')
        : t(uiMessages, 'status.exportLocal', {}, 'Backup exported for this browser')
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
      context = await loadContextForScene(imported.currentSceneId, imported.locale, context ?? undefined)
      state = imported
      resetStatDraft()
      await refresh()
      panelStatus = t(uiMessages, 'status.imported', {}, 'Save imported and ready')
    } catch (caught) {
      panelError = formatCaughtError(caught)
    } finally {
      saveBusy = 'none'
      if (importInput) importInput.value = ''
    }
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
    if (event.key !== 'Escape' || activePanel === 'none') return
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
  }

  function clearSaveFeedback() {
    panelError = ''
    panelStatus = ''
    error = ''
    status = ''
  }

  function canUseDropCap(text: string) {
    return /^[A-Za-z]/.test(text.trim())
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
  <meta name="theme-color" content="#120f14" />
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

        <article class="scene">
          {#each displayParagraphs as paragraph, index (paragraph.id)}
            <p
              class:typewriter={settings.typewriter && index === displayParagraphs.length - 1}
              class:dropcap={index === 0 && canUseDropCap(paragraph.text)}
            >{paragraph.text}</p>
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
            <button disabled={busy} on:click={() => choose(choice)}>
              <ScrollText size={18} />
              <span>{choice.text}</span>
            </button>
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
          <p class="panel-copy">{t(uiMessages, 'saves.copy', {}, 'The game saves after every choice. Named saves let you keep several routes. Export without a password only restores in this browser; add a password for a portable backup you can import in prod or another browser. Import resumes a compatible backup.')}</p>
          <div class="panel-actions">
            <button disabled={saveBusy !== 'none'} on:click={startNewGame}><RotateCcw size={17} /> {t(uiMessages, 'saves.newGame', {}, 'New game')}</button>
            <button disabled={!state.checkpoint || saveBusy !== 'none'} on:click={restoreLastCheckpoint}><Library size={17} /> {t(uiMessages, 'saves.checkpoint', {}, 'Checkpoint')}</button>
          </div>
          <label>
            {t(uiMessages, 'saves.saveName', {}, 'Save name')}
            <input bind:value={manualSlotId} disabled={saveBusy !== 'none'} />
          </label>
          <button class="wide" disabled={saveBusy !== 'none'} on:click={saveManualSlot}><Save size={17} /> {t(uiMessages, 'saves.saveNamedRoute', {}, 'Save named route')}</button>
          <div class="save-list">
            {#each saveSummaries as save}
              <div class="save-row">
                <button disabled={saveBusy !== 'none'} on:click={() => loadSlot(save.slotId)}>
                  <strong>{save.slotId}</strong>
                  <span>{new Date(save.updatedAt).toLocaleString(settings.uiLocale)}</span>
                </button>
                {#if save.slotId !== 'autosave'}
                  <button class="icon-danger" disabled={saveBusy !== 'none'} title={t(uiMessages, 'saves.deleteSave', {}, 'Delete save')} aria-label={t(uiMessages, 'saves.deleteSave', {}, 'Delete save')} on:click={() => removeSlot(save.slotId)}>×</button>
                {/if}
              </div>
            {/each}
          </div>
          {#if state.debug?.dirty}
            <p class="notice panel-notice error" role="status">{t(uiMessages, 'saves.debugLocalOnly', {}, 'This route was changed with Debug and can only stay in local browser saves.')}</p>
          {/if}
          <label>
            {t(uiMessages, 'saves.backupPassword', {}, 'Backup password')}
            <span class="help">{t(uiMessages, 'saves.backupPasswordHelp', {}, 'Leave it empty for a backup that only restores in this browser.')}</span>
            <input type="password" bind:value={passphrase} autocomplete="new-password" disabled={saveBusy !== 'none'} />
          </label>
          <button class="wide" disabled={saveBusy !== 'none'} on:click={downloadSave}>
            <Download size={17} />
            {saveBusy === 'export' ? t(uiMessages, 'saves.exporting', {}, 'Exporting...') : t(uiMessages, 'saves.exportBackup', {}, 'Export backup')}
          </button>
          <label>
            {t(uiMessages, 'saves.restorePassword', {}, 'Restore password')}
            <span class="help">{t(uiMessages, 'saves.restorePasswordHelp', {}, 'Use the same password you chose when exporting the backup.')}</span>
            <input type="password" bind:value={importPassphrase} autocomplete="current-password" disabled={saveBusy !== 'none'} />
          </label>
          <input class="file-input" bind:this={importInput} type="file" accept=".magium-save,application/json" disabled={saveBusy !== 'none'} on:change={importSelectedSave} />
          <button class="wide" disabled={saveBusy !== 'none'} on:click={() => importInput?.click()}>
            <Upload size={17} />
            {saveBusy === 'import' ? t(uiMessages, 'saves.importing', {}, 'Importing...') : t(uiMessages, 'saves.importBackup', {}, 'Import backup')}
          </button>
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
              <div class:locked={!state?.achievements[achievement.variable]} class="achievement">
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
          <div class="segmented">
            <button class:active={settings.theme === 'dark'} on:click={() => updateSettings({ theme: 'dark' })}>{t(uiMessages, 'settings.dark', {}, 'Dark')}</button>
            <button class:active={settings.theme === 'light'} on:click={() => updateSettings({ theme: 'light' })}>{t(uiMessages, 'settings.light', {}, 'Light')}</button>
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
            <input type="checkbox" checked={settings.typewriter} on:change={(event) => updateSettings({ typewriter: event.currentTarget.checked })} />
            <span>
              {t(uiMessages, 'settings.sceneReveal', {}, 'Scene reveal')}
              <span class="help">{t(uiMessages, 'settings.sceneRevealHelp', {}, 'Fade in the newest paragraph when a scene opens.')}</span>
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
            <strong>{state.debug?.dirty ? t(uiMessages, 'debug.dirty', {}, 'Debug save') : t(uiMessages, 'debug.clean', {}, 'Clean route')}</strong>
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
            <p class="meta">{t(uiMessages, 'about.changes', {}, 'Changes: French translation, UI adaptation, technical restructuring, additional interface features.')}</p>
          </div>
        {/if}
      </aside>
    {/if}
  </main>
{/if}
