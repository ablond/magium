type TurnstileApi = {
  execute: (widgetId: string) => void
  remove: (widgetId: string) => void
  render: (container: HTMLElement, options: Record<string, unknown>) => string
}

declare global {
  interface Window {
    turnstile?: TurnstileApi
  }
}

const SCRIPT_ID = 'magium-turnstile'
const SCRIPT_SRC = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'

let loadingScript: Promise<TurnstileApi> | null = null

export async function requestTurnstileToken(siteKey: string): Promise<string> {
  if (!siteKey) return ''
  const turnstile = await loadTurnstile()
  const container = document.createElement('div')
  container.className = 'turnstile-hidden'
  document.body.append(container)

  return await new Promise((resolve, reject) => {
    let widgetId = ''
    const timeout = window.setTimeout(() => {
      cleanup()
      reject(new Error('Turnstile verification timed out'))
    }, 20000)

    const cleanup = () => {
      window.clearTimeout(timeout)
      if (widgetId) {
        turnstile.remove(widgetId)
      }
      container.remove()
    }

    widgetId = turnstile.render(container, {
      sitekey: siteKey,
      size: 'invisible',
      execution: 'execute',
      callback: (token: string) => {
        cleanup()
        resolve(token)
      },
      'error-callback': () => {
        cleanup()
        reject(new Error('Turnstile verification failed'))
      },
      'expired-callback': () => {
        cleanup()
        reject(new Error('Turnstile verification expired'))
      },
    })
    turnstile.execute(widgetId)
  })
}

function loadTurnstile(): Promise<TurnstileApi> {
  if (window.turnstile) return Promise.resolve(window.turnstile)
  if (loadingScript) return loadingScript

  loadingScript = new Promise((resolve, reject) => {
    const existing = document.getElementById(SCRIPT_ID) as HTMLScriptElement | null
    if (existing) {
      existing.addEventListener('load', () => resolveTurnstile(resolve, reject), { once: true })
      existing.addEventListener('error', () => reject(new Error('Turnstile script failed to load')), { once: true })
      return
    }

    const script = document.createElement('script')
    script.id = SCRIPT_ID
    script.src = SCRIPT_SRC
    script.async = true
    script.defer = true
    script.addEventListener('load', () => resolveTurnstile(resolve, reject), { once: true })
    script.addEventListener('error', () => reject(new Error('Turnstile script failed to load')), { once: true })
    document.head.append(script)
  })

  return loadingScript
}

function resolveTurnstile(resolve: (api: TurnstileApi) => void, reject: (error: Error) => void) {
  if (window.turnstile) {
    resolve(window.turnstile)
  } else {
    reject(new Error('Turnstile API is unavailable'))
  }
}
