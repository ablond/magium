import crypto from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'

const PARAGRAPH_BREAK_RE = /(\r?\n(?:[ \t]*\r?\n)+)/g
const PARAGRAPH_BREAK_TEST_RE = /\r?\n(?:[ \t]*\r?\n)+/

export async function applyTranslationChangeset({ root, changeset }) {
  validateChangeset(changeset)
  const grouped = groupByLocaleChapter(changeset.items)
  const stale = []
  const updated = []
  const pendingWrites = []

  for (const [groupKey, items] of grouped) {
    const [locale, chapterId] = groupKey.split('/')
    const file = path.join(root, 'content', 'story-locales', locale, `${chapterId}.json`)
    const bundle = JSON.parse(await fs.readFile(file, 'utf8'))

    for (const item of items) {
      const currentText = bundle.messages?.[item.messageId]
      if (typeof currentText !== 'string') {
        stale.push({ ...item, reason: 'missing-message' })
        continue
      }
      const replacement = replaceChangesetItemText(currentText, item)
      if (!replacement.ok) {
        stale.push({ ...item, ...replacement.stale })
        continue
      }
      bundle.messages[item.messageId] = replacement.text
      updated.push({ ...item, file })
    }
    pendingWrites.push({ file, bundle })
  }

  if (!stale.length) {
    for (const write of pendingWrites) {
      await fs.writeFile(write.file, `${JSON.stringify(write.bundle, null, 2)}\n`)
    }
  }

  return { stale, updated }
}

export function validateChangeset(changeset) {
  if (!changeset || typeof changeset !== 'object') {
    throw new Error('changeset must be an object')
  }
  if (!Array.isArray(changeset.items)) {
    throw new Error('changeset.items must be an array')
  }
  const seen = new Set()
  for (const item of changeset.items) {
    for (const field of ['locale', 'chapterId', 'messageId', 'finalText']) {
      if (typeof item[field] !== 'string' || !item[field].trim()) {
        throw new Error(`changeset item is missing ${field}`)
      }
    }
    if (item.targetType === 'paragraph') {
      if (!Number.isInteger(item.segmentIndex) || item.segmentIndex < 0) {
        throw new Error('paragraph changeset item is missing segmentIndex')
      }
      if (PARAGRAPH_BREAK_TEST_RE.test(item.finalText.trim())) {
        throw new Error('paragraph changeset item must contain a single paragraph')
      }
    }
    const key = changesetItemKey(item)
    if (seen.has(key)) {
      throw new Error(`changeset contains multiple final texts for ${key}`)
    }
    seen.add(key)
  }
}

export function hashText(text) {
  return crypto.createHash('sha256').update(String(text), 'utf8').digest('hex')
}

function replaceChangesetItemText(currentText, item) {
  if (item.targetType === 'paragraph') {
    const segmented = splitMessageSegments(currentText)
    const segment = segmented.segments[item.segmentIndex]
    if (!segment) {
      return { ok: false, stale: { reason: 'missing-segment' } }
    }
    const currentHash = hashText(segment.text.trim())
    if (item.currentTextHash && currentHash !== item.currentTextHash) {
      return { ok: false, stale: { reason: 'hash-mismatch', actualHash: currentHash } }
    }
    segmented.parts[segment.partIndex] = item.finalText
    return { ok: true, text: segmented.parts.join('') }
  }

  const currentHash = hashText(currentText)
  if (item.currentTextHash && currentHash !== item.currentTextHash) {
    return { ok: false, stale: { reason: 'hash-mismatch', actualHash: currentHash } }
  }
  return { ok: true, text: item.finalText }
}

function splitMessageSegments(text) {
  const parts = String(text).split(PARAGRAPH_BREAK_RE)
  const segments = []
  for (let index = 0; index < parts.length; index += 2) {
    if (parts[index].trim()) {
      segments.push({ partIndex: index, text: parts[index] })
    }
  }
  return { parts, segments }
}

function changesetItemKey(item) {
  const target = item.targetType === 'paragraph'
    ? `paragraph:${item.segmentIndex}`
    : `${item.targetType ?? 'message'}:whole`
  return `${item.locale}/${item.chapterId}/${item.messageId}/${target}`
}

function groupByLocaleChapter(items) {
  const groups = new Map()
  for (const item of items) {
    const key = `${item.locale}/${item.chapterId}`
    groups.set(key, [...(groups.get(key) ?? []), item])
  }
  return groups
}
