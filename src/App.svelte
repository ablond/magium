<script lang="ts">
  import {
    BookOpen,
    Download,
    FileKey,
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
  import { loadContextForScene, loadIndex } from './lib/content/packedContent'
  import { applyChoice, createInitialState, enterCurrentScene, renderCurrentScene, restoreCheckpoint } from './lib/story/engine'
  import { readStats } from './lib/story/stats'
  import type { Choice, GameState, RenderedScene, Settings as ReaderSettings, StoryContext } from './lib/story/types'
  import { deleteSave, exportSave, importSave, listSaveSummaries, loadGameState, saveGameState, type SaveSummary } from './lib/storage/saves'

  type Panel = 'none' | 'saves' | 'stats' | 'achievements' | 'settings' | 'about'

  const defaultSettings: ReaderSettings = {
    theme: 'dark',
    textScale: 1,
    highContrast: false,
    typewriter: false,
    locale: 'en',
  }

  let context: StoryContext | null = null
  let state: GameState | null = null
  let rendered: RenderedScene | null = null
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
  $: chapterTitle = state ? describeScene(state.currentSceneId) : 'Book 1 - Chapter 1'
  $: stats = state ? readStats(state.variables) : []

  onMount(async () => {
    try {
      settings = loadReaderSettings()
      applyReaderSettings(settings)
      const index = await loadIndex()
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
      error = caught instanceof Error ? caught.message : String(caught)
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
      if (choice.special === 'stats') activePanel = 'stats'
      await saveGameState(state)
      await refresh()
      window.scrollTo({ top: 0, behavior: 'smooth' })
    } catch (caught) {
      error = caught instanceof Error ? caught.message : String(caught)
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
    status = `Saved ${slotId}`
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
      ? 'Encrypted portable save exported'
      : 'Encrypted local-key save exported'
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
      status = 'Save imported and validated'
      activePanel = 'none'
    } catch (caught) {
      error = caught instanceof Error ? caught.message : String(caught)
    } finally {
      if (importInput) importInput.value = ''
    }
  }

  function updateSettings(next: Partial<ReaderSettings>) {
    settings = { ...settings, ...next }
    localStorage.setItem('magium.readerSettings', JSON.stringify(settings))
    applyReaderSettings(settings)
  }

  function applyReaderSettings(next: ReaderSettings) {
    document.documentElement.dataset.theme = next.theme
    document.documentElement.dataset.contrast = next.highContrast ? 'high' : 'normal'
    document.documentElement.style.setProperty('--reader-scale', String(next.textScale))
  }

  function loadReaderSettings(): ReaderSettings {
    try {
      return { ...defaultSettings, ...JSON.parse(localStorage.getItem('magium.readerSettings') ?? '{}') }
    } catch {
      return { ...defaultSettings }
    }
  }

  function describeScene(sceneId: string) {
    const match = sceneId.match(/^(?:B(?<book>\d+)-)?Ch(?<chapter>\d+)/)
    if (!match?.groups) return sceneId
    return `Book ${match.groups.book ?? '1'} - Chapter ${Number(match.groups.chapter)}`
  }

  function achievementText(messageId: string) {
    return context?.achievementLocale.messages[messageId] ?? messageId
  }

  function canUseDropCap(text: string) {
    return /^[A-Za-z]/.test(text.trim())
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
    <p>Opening the tournament...</p>
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
      <button class:active={activePanel === 'none'} title="Read" aria-label="Read" on:click={() => activePanel = 'none'}>
        <BookOpen size={19} />
      </button>
      <button class:active={activePanel === 'stats'} title="Stats" aria-label="Stats" on:click={() => activePanel = activePanel === 'stats' ? 'none' : 'stats'}>
        <SlidersHorizontal size={19} />
      </button>
      <button class:active={activePanel === 'saves'} title="Saves" aria-label="Saves" on:click={() => activePanel = activePanel === 'saves' ? 'none' : 'saves'}>
        <Save size={19} />
      </button>
      <button class:active={activePanel === 'achievements'} title="Achievements" aria-label="Achievements" on:click={() => activePanel = activePanel === 'achievements' ? 'none' : 'achievements'}>
        <Trophy size={19} />
      </button>
      <button class:active={activePanel === 'settings'} title="Settings" aria-label="Settings" on:click={() => activePanel = activePanel === 'settings' ? 'none' : 'settings'}>
        <Settings size={19} />
      </button>
      <button class:active={activePanel === 'about'} title="About" aria-label="About" on:click={() => activePanel = activePanel === 'about' ? 'none' : 'about'}>
        <ShieldCheck size={19} />
      </button>
    </aside>

    <section class="reader" aria-live="polite">
      <header class="reader-header">
        <div>
          <p class="eyebrow">Magium</p>
          <h1>{chapterTitle}</h1>
        </div>
        <div class="reader-status">
          <span><Trophy size={15} /> {achievementCount}</span>
          <span><FileKey size={15} /> encrypted</span>
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

        <div class="choices" aria-label="Choices">
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
          <h2>Saves</h2>
          <div class="panel-actions">
            <button on:click={startNewGame}><RotateCcw size={17} /> New game</button>
            <button disabled={!state.checkpoint} on:click={restoreLastCheckpoint}><Library size={17} /> Checkpoint</button>
          </div>
          <label>
            Slot name
            <input bind:value={manualSlotId} />
          </label>
          <button class="wide" on:click={saveManualSlot}><Save size={17} /> Save slot</button>
          <div class="save-list">
            {#each saveSummaries as save}
              <div class="save-row">
                <button on:click={() => loadSlot(save.slotId)}>
                  <strong>{save.slotId}</strong>
                  <span>{new Date(save.updatedAt).toLocaleString()}</span>
                </button>
                {#if save.slotId !== 'autosave'}
                  <button class="icon-danger" title="Delete save" aria-label="Delete save" on:click={() => removeSlot(save.slotId)}>×</button>
                {/if}
              </div>
            {/each}
          </div>
          <label>
            Export passphrase
            <input type="password" bind:value={passphrase} autocomplete="new-password" />
          </label>
          <button class="wide" on:click={downloadSave}><Download size={17} /> Export</button>
          <label>
            Import passphrase
            <input type="password" bind:value={importPassphrase} autocomplete="current-password" />
          </label>
          <input class="file-input" bind:this={importInput} type="file" accept=".magium-save,application/json" on:change={importSelectedSave} />
          <button class="wide" on:click={() => importInput?.click()}><Upload size={17} /> Import</button>
        {:else if activePanel === 'stats'}
          <h2>Stats</h2>
          <div class="stat-list">
            {#each stats as stat}
              <div class="stat-row">
                <span>{stat.label}</span>
                <strong>{stat.value}</strong>
              </div>
            {/each}
          </div>
        {:else if activePanel === 'achievements'}
          <h2>Achievements</h2>
          <div class="achievement-list">
            {#each context?.achievements.achievements ?? [] as achievement}
              <div class:locked={!state?.achievements[achievement.variable]} class="achievement">
                <strong>{achievementText(achievement.titleMessageId)}</strong>
                <span>{achievementText(achievement.captionMessageId)}</span>
              </div>
            {/each}
          </div>
        {:else if activePanel === 'settings'}
          <h2>Settings</h2>
          <div class="segmented">
            <button class:active={settings.theme === 'dark'} on:click={() => updateSettings({ theme: 'dark' })}>Dark</button>
            <button class:active={settings.theme === 'light'} on:click={() => updateSettings({ theme: 'light' })}>Light</button>
          </div>
          <label>
            Text size
            <input type="range" min="0.88" max="1.24" step="0.04" bind:value={settings.textScale} on:input={() => updateSettings({ textScale: Number(settings.textScale) })} />
          </label>
          <label class="toggle">
            <input type="checkbox" checked={settings.highContrast} on:change={(event) => updateSettings({ highContrast: event.currentTarget.checked })} />
            High contrast
          </label>
          <label class="toggle">
            <input type="checkbox" checked={settings.typewriter} on:change={(event) => updateSettings({ typewriter: event.currentTarget.checked })} />
            Scene reveal
          </label>
        {:else if activePanel === 'about'}
          <h2>Archive</h2>
          <p class="meta">Source: raduprv/Magium@{context?.index.sourceCommit.slice(0, 12)}</p>
          <p class="meta">Runtime: {context?.index.contentVersion}</p>
          <p class="meta">Original data is archived with SHA-256 manifests and transformed into compressed runtime packs.</p>
          <p class="meta">Software license: MIT. Story data: CC BY 4.0 as stated by the original repository.</p>
        {/if}
      </aside>
    {/if}
  </main>
{/if}
