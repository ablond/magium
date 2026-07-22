import { createReadStream } from 'node:fs'
import { stat } from 'node:fs/promises'
import { extname, resolve, sep } from 'node:path'
import { pipeline } from 'node:stream/promises'

const MIME_TYPES = new Map([
  ['.css', 'text/css; charset=utf-8'],
  ['.html', 'text/html; charset=utf-8'],
  ['.ico', 'image/x-icon'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.png', 'image/png'],
  ['.svg', 'image/svg+xml'],
  ['.webmanifest', 'application/manifest+json; charset=utf-8'],
  ['.webp', 'image/webp'],
  ['.woff2', 'font/woff2'],
])

export async function serveStatic(request, response, url, { staticDir }) {
  if (request.method !== 'GET' && request.method !== 'HEAD') return false

  let pathname
  try {
    pathname = decodeURIComponent(url.pathname)
  } catch {
    return false
  }

  const root = resolve(staticDir)
  const requestedPath = pathname === '/' ? '/index.html' : pathname
  let filePath = safeResolve(root, requestedPath)
  let file = filePath ? await fileStat(filePath) : null

  if (!file?.isFile() && shouldUseSpaFallback(pathname)) {
    filePath = resolve(root, 'index.html')
    file = await fileStat(filePath)
  }
  if (!filePath || !file?.isFile()) return false

  response.statusCode = 200
  response.setHeader('content-type', MIME_TYPES.get(extname(filePath).toLowerCase()) ?? 'application/octet-stream')
  response.setHeader('content-length', String(file.size))
  response.setHeader('last-modified', file.mtime.toUTCString())
  response.setHeader('x-content-type-options', 'nosniff')
  response.setHeader('cache-control', cacheControl(pathname, filePath))
  if (request.method === 'HEAD') {
    response.end()
    return true
  }
  await pipeline(createReadStream(filePath), response)
  return true
}

function safeResolve(root, pathname) {
  const candidate = resolve(root, `.${pathname}`)
  return candidate === root || candidate.startsWith(`${root}${sep}`) ? candidate : null
}

async function fileStat(pathname) {
  try {
    return await stat(pathname)
  } catch (error) {
    if (error?.code === 'ENOENT' || error?.code === 'ENOTDIR') return null
    throw error
  }
}

function shouldUseSpaFallback(pathname) {
  return !pathname.startsWith('/assets/') && !extname(pathname)
}

function cacheControl(pathname, filePath) {
  if (pathname.startsWith('/assets/')) return 'public, max-age=31536000, immutable'
  if (pathname === '/sw.js' || filePath.endsWith(`${sep}index.html`)) return 'no-store'
  return 'no-cache'
}
