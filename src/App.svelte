<script lang="ts">
  import {
    BookOpen,
    Download,
    Library,
    RotateCcw,
    Save,
    ScrollText,
    Settings,
    ShieldCheck,
    SlidersHorizontal,
    Trophy,
    Upload,
  } from '@lucide/svelte'
  import { onMount } from 'svelte'
  import ArcaneSigil from './lib/ArcaneSigil.svelte'
  import { loadContextForScene, loadIndex, loadUiLocale } from './lib/content/packedContent'
  import { DEFAULT_UI_LOCALES, resolveUiLocale, translateUi as t } from './lib/i18n/ui'
  import { applyChoice, createInitialState, enterCurrentScene, renderCurrentScene, restoreCheckpoint } from './lib/story/engine'
  import { AURA_STAT_VARIABLES, BASE_STAT_VARIABLES, readStats } from './lib/story/stats'
  import type { Choice, GameState, RenderedScene, Settings as ReaderSettings, StoryContext } from './lib/story/types'
  import { deleteSave, exportSave, importSave, listSaveSummaries, loadGameState, saveGameState, type SaveSummary } from './lib/storage/saves'

  type Panel = 'none' | 'saves' | 'abilities' | 'achievements' | 'settings' | 'about'

  const defaultSettings: ReaderSettings = {
    theme: 'dark',
    textScale: 1,
    highContrast: false,
    typewriter: false,
    locale: 'en',
    uiLocale: 'en',
  }

  const errorMessageKeys: Record<string, string> = {
    'Choice is not available from the current state': 'errors.choiceUnavailable',
    'This browser does not support runtime content decompression': 'errors.decompressionUnsupported',
    'This save file does not match a playable route': 'errors.saveTamper',
    'Unsupported save file': 'errors.unsupportedSave',
  }

  let context: StoryContext | null = null
  let state: GameState | null = null
  let rendered: RenderedScene | null = null
  let uiMessages: Record<string, string> = {}
  let availableUiLocales = [...DEFAULT_UI_LOCALES]
  let saveSummaries: SaveSummary[] = []
  let activePanel: Panel = 'none'
  let loading = true
  let busy = false
  let error = ''
  let status = ''
  let passphrase = ''
  let importPassphrase = ''
  let manualSlotId = 'manual-1'
  let settings: ReaderSettings = { ...defaultSettings }
  let importInput: HTMLInputElement

  $: achievementCount = rendered?.unlockedAchievements.length ?? 0
  $: chapterTitle = state
    ? describeScene(state.currentSceneId, uiMessages)
    : t(uiMessages, 'reader.chapterTitle', { book: '1', chapter: 1 }, 'Book 1 - Chapter 1')
  $: visibleStatVariables = state ? revealedStatVariables(state) : []
  $: stats = state ? readStats(state.variables, visibleStatVariables) : []

  onMount(async () => {
    try {
      settings = loadReaderSettings()
      applyReaderSettings(settings)
      const index = await loadIndex()
      availableUiLocales = index.uiLocales.length ? index.uiLocales : [...DEFAULT_UI_LOCALES]
      settings = {
        ...settings,
        uiLocale: resolveUiLocale(settings.uiLocale, [], availableUiLocales, index.defaultLocale),
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

  async function refresh() {
    if (!state) return
    context = await loadContextForScene(state.currentSceneId, state.locale, context ?? undefined)
    rendered = renderCurrentScene(context, state)
    saveSummaries = await listSaveSummaries()
  }

  async function choose(choice: Choice) {
    if (!state || !context || busy) return
    try {
      busy = true
      error = ''
      if (choice.special === 'saves' && !choice.target) {
        activePanel = 'saves'
        return
      }
      if (choice.target) {
        context = await loadContextForScene(choice.target, state.locale, context)
      }
      state = await applyChoice(context, state, choice)
      if (choice.special === 'stats') activePanel = 'abilities'
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
    state = enterCurrentScene(context, createInitialState(state.contentVersion, settings.locale))
    await saveGameState(state)
    await refresh()
    activePanel = 'none'
  }

  async function loadSlot(slotId: string) {
    const loaded = await loadGameState(slotId)
    if (!loaded) return
    context = await loadContextForScene(loaded.currentSceneId, loaded.locale, context ?? undefined)
    state = loaded
    await refresh()
    activePanel = 'none'
  }

  async function saveManualSlot() {
    if (!state) return
    const slotId = manualSlotId.trim() || 'manual-1'
    state = { ...state, slotId, updatedAt: new Date().toISOString() }
    await saveGameState(state)
    state = { ...state, slotId: 'autosave', updatedAt: new Date().toISOString() }
    await saveGameState(state)
    await refresh()
    status = t(uiMessages, 'status.saved', { slotId }, `Saved ${slotId}`)
  }

  async function removeSlot(slotId: string) {
    if (slotId === 'autosave') return
    await deleteSave(slotId)
    await refresh()
  }

  async function restoreLastCheckpoint() {
    if (!state || !context || !state.checkpoint) return
    context = await loadContextForScene(state.checkpoint.currentSceneId, state.locale, context)
    state = restoreCheckpoint(context, state)
    await saveGameState(state)
    await refresh()
    activePanel = 'none'
  }

  async function downloadSave() {
    if (!state) return
    const exported = await exportSave(state, passphrase)
    const blob = new Blob([exported], { type: 'application/vnd.magium.save+json' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `${state.slotId}-${new Date().toISOString().slice(0, 10)}.magium-save`
    anchor.click()
    URL.revokeObjectURL(url)
    status = passphrase.trim()
      ? t(uiMessages, 'status.exportPortable', {}, 'Portable backup exported')
      : t(uiMessages, 'status.exportLocal', {}, 'Backup exported for this browser')
  }

  async function importSelectedSave(event: Event) {
    const file = (event.currentTarget as HTMLInputElement).files?.[0]
    if (!file) return
    try {
      const raw = await file.text()
      const imported = await importSave(raw, importPassphrase, async (sceneId) => {
        context = await loadContextForScene(sceneId, settings.locale, context ?? undefined)
        return context
      })
      context = await loadContextForScene(imported.currentSceneId, imported.locale, context ?? undefined)
      state = imported
      await refresh()
      status = t(uiMessages, 'status.imported', {}, 'Save imported and ready')
      activePanel = 'none'
    } catch (caught) {
      error = formatCaughtError(caught)
    } finally {
      if (importInput) importInput.value = ''
    }
  }

  function updateSettings(next: Partial<ReaderSettings>) {
    settings = { ...settings, ...next }
    persistReaderSettings(settings)
    applyReaderSettings(settings)
  }

  async function updateUiLocale(uiLocale: string) {
    try {
      const nextMessages = (await loadUiLocale(uiLocale)).messages
      settings = { ...settings, uiLocale }
      persistReaderSettings(settings)
      applyReaderSettings(settings)
      uiMessages = nextMessages
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
      const migratedUiLocale = typeof stored.uiLocale === 'string'
        ? stored.uiLocale
        : typeof stored.locale === 'string'
          ? stored.locale
          : undefined
      return {
        ...defaultSettings,
        ...stored,
        locale: defaultSettings.locale,
        uiLocale: resolveUiLocale(migratedUiLocale, browserLanguages()),
      }
    } catch {
      return { ...defaultSettings, uiLocale: resolveUiLocale(null, browserLanguages()) }
    }
  }

  function persistReaderSettings(next: ReaderSettings) {
    localStorage.setItem('magium.readerSettings', JSON.stringify(next))
  }

  function browserLanguages() {
    return navigator.languages?.length ? navigator.languages : [navigator.language]
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

  function togglePanel(panel: Exclude<Panel, 'none'>) {
    activePanel = activePanel === panel ? 'none' : panel
  }

  function revealedStatVariables(next: GameState) {
    const revealed = new Set<string>()
    const hasBaseStats = hasReachedScene(next, ['Ch2-Stats', 'Ch2-Stats-spent'])
    const hasAuraStats = hasReachedScene(next, ['B3-Ch04a-Introduction', 'B3-Ch04a-Introduction2', 'B3-Ch04a-Stats-spent'])
    if (hasBaseStats || hasAuraStats) {
      BASE_STAT_VARIABLES.forEach((variable) => revealed.add(variable))
    }
    if (hasAuraStats) {
      AURA_STAT_VARIABLES.forEach((variable) => revealed.add(variable))
    }
    return [...revealed]
  }

  function hasReachedScene(next: GameState, sceneIds: string[]) {
    const targets = new Set(sceneIds)
    return targets.has(next.currentSceneId) ||
      next.history.some((event) => targets.has(event.sceneId) || targets.has(event.target))
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
      <button class:active={activePanel === 'none'} title={t(uiMessages, 'nav.read', {}, 'Read')} aria-label={t(uiMessages, 'nav.read', {}, 'Read')} on:click={() => activePanel = 'none'}>
        <BookOpen size={19} />
        <span class="nav-label">{t(uiMessages, 'nav.read', {}, 'Read')}</span>
      </button>
      <button class:active={activePanel === 'abilities'} title={t(uiMessages, 'nav.abilities', {}, 'Abilities')} aria-label={t(uiMessages, 'nav.abilities', {}, 'Abilities')} on:click={() => togglePanel('abilities')}>
        <SlidersHorizontal size={19} />
        <span class="nav-label">{t(uiMessages, 'nav.abilities', {}, 'Abilities')}</span>
      </button>
      <button class:active={activePanel === 'saves'} title={t(uiMessages, 'nav.saves', {}, 'Saves')} aria-label={t(uiMessages, 'nav.saves', {}, 'Saves')} on:click={() => togglePanel('saves')}>
        <Save size={19} />
        <span class="nav-label">{t(uiMessages, 'nav.saves', {}, 'Saves')}</span>
      </button>
      <button class:active={activePanel === 'achievements'} title={t(uiMessages, 'nav.achievements', {}, 'Achievements')} aria-label={t(uiMessages, 'nav.achievements', {}, 'Achievements')} on:click={() => togglePanel('achievements')}>
        <Trophy size={19} />
        <span class="nav-label">{t(uiMessages, 'nav.achievements', {}, 'Achievements')}</span>
      </button>
      <button class:active={activePanel === 'settings'} title={t(uiMessages, 'nav.settings', {}, 'Settings')} aria-label={t(uiMessages, 'nav.settings', {}, 'Settings')} on:click={() => togglePanel('settings')}>
        <Settings size={19} />
        <span class="nav-label">{t(uiMessages, 'nav.settings', {}, 'Settings')}</span>
      </button>
      <button class:active={activePanel === 'about'} title={t(uiMessages, 'nav.about', {}, 'About')} aria-label={t(uiMessages, 'nav.about', {}, 'About')} on:click={() => togglePanel('about')}>
        <ShieldCheck size={19} />
        <span class="nav-label">{t(uiMessages, 'nav.about', {}, 'About')}</span>
      </button>
    </aside>

    <section class="reader" aria-live="polite">
      <header class="reader-header">
        <div>
          <p class="eyebrow">{t(uiMessages, 'reader.eyebrow', {}, 'Magium')}</p>
          <h1>{chapterTitle}</h1>
        </div>
        <div class="reader-status">
          <span><Trophy size={15} /> {achievementCount}</span>
          <span><Save size={15} /> {t(uiMessages, 'reader.autosave', {}, 'Autosave')}</span>
        </div>
      </header>

      {#if rendered && state}
        <article class="scene">
          {#each rendered.paragraphs as paragraph, index}
            <p
              class:typewriter={settings.typewriter && index === rendered.paragraphs.length - 1}
              class:dropcap={index === 0 && canUseDropCap(paragraph.text)}
            >{paragraph.text}</p>
          {/each}
        </article>

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
        <p class="notice error">{error}</p>
      {:else if status}
        <p class="notice">{status}</p>
      {/if}
    </section>

    {#if activePanel !== 'none'}
      <aside class="panel">
        {#if activePanel === 'saves' && state}
          <h2>{t(uiMessages, 'saves.title', {}, 'Saves')}</h2>
          <p class="panel-copy">{t(uiMessages, 'saves.copy', {}, 'The game saves after every choice. Named saves let you keep several routes. Export creates a backup file; add a password if you want to restore it in another browser. Import resumes a compatible backup.')}</p>
          <div class="panel-actions">
            <button on:click={startNewGame}><RotateCcw size={17} /> {t(uiMessages, 'saves.newGame', {}, 'New game')}</button>
            <button disabled={!state.checkpoint} on:click={restoreLastCheckpoint}><Library size={17} /> {t(uiMessages, 'saves.checkpoint', {}, 'Checkpoint')}</button>
          </div>
          <label>
            {t(uiMessages, 'saves.saveName', {}, 'Save name')}
            <input bind:value={manualSlotId} />
          </label>
          <button class="wide" on:click={saveManualSlot}><Save size={17} /> {t(uiMessages, 'saves.saveNamedRoute', {}, 'Save named route')}</button>
          <div class="save-list">
            {#each saveSummaries as save}
              <div class="save-row">
                <button on:click={() => loadSlot(save.slotId)}>
                  <strong>{save.slotId}</strong>
                  <span>{new Date(save.updatedAt).toLocaleString(settings.uiLocale)}</span>
                </button>
                {#if save.slotId !== 'autosave'}
                  <button class="icon-danger" title={t(uiMessages, 'saves.deleteSave', {}, 'Delete save')} aria-label={t(uiMessages, 'saves.deleteSave', {}, 'Delete save')} on:click={() => removeSlot(save.slotId)}>×</button>
                {/if}
              </div>
            {/each}
          </div>
          <label>
            {t(uiMessages, 'saves.backupPassword', {}, 'Backup password')}
            <span class="help">{t(uiMessages, 'saves.backupPasswordHelp', {}, 'Leave it empty for a backup that only restores in this browser.')}</span>
            <input type="password" bind:value={passphrase} autocomplete="new-password" />
          </label>
          <button class="wide" on:click={downloadSave}><Download size={17} /> {t(uiMessages, 'saves.exportBackup', {}, 'Export backup')}</button>
          <label>
            {t(uiMessages, 'saves.restorePassword', {}, 'Restore password')}
            <span class="help">{t(uiMessages, 'saves.restorePasswordHelp', {}, 'Use the same password you chose when exporting the backup.')}</span>
            <input type="password" bind:value={importPassphrase} autocomplete="current-password" />
          </label>
          <input class="file-input" bind:this={importInput} type="file" accept=".magium-save,application/json" on:change={importSelectedSave} />
          <button class="wide" on:click={() => importInput?.click()}><Upload size={17} /> {t(uiMessages, 'saves.importBackup', {}, 'Import backup')}</button>
        {:else if activePanel === 'abilities'}
          <h2>{t(uiMessages, 'abilities.title', {}, 'Abilities')}</h2>
          {#if stats.length}
            <div class="stat-list">
              {#each stats as stat}
                <div class="stat-row">
                  <span>{stat.label}</span>
                  <strong>{stat.value}</strong>
                </div>
              {/each}
            </div>
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
            <p class="field-label">{t(uiMessages, 'settings.language', {}, 'Interface language')}</p>
            <div class="segmented">
              {#if availableUiLocales.includes('fr')}
                <button class:active={settings.uiLocale === 'fr'} on:click={() => updateUiLocale('fr')}>{t(uiMessages, 'settings.languageFrench', {}, 'French')}</button>
              {/if}
              {#if availableUiLocales.includes('en')}
                <button class:active={settings.uiLocale === 'en'} on:click={() => updateUiLocale('en')}>{t(uiMessages, 'settings.languageEnglish', {}, 'English')}</button>
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
