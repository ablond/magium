import { diffWordsWithSpace } from 'diff'

export function buildTextDiffParts(currentText, proposedText) {
  if (!currentText) return []
  const changes = diffWordsWithSpace(currentText, proposedText)
  const parts = []

  for (let index = 0; index < changes.length; index += 1) {
    const part = changes[index]
    const next = changes[index + 1]

    if (part.removed && next?.added) {
      parts.push({ type: 'changed', text: next.value })
      index += 1
      continue
    }

    if (part.added && next?.removed) {
      parts.push({ type: 'changed', text: part.value })
      index += 1
      continue
    }

    parts.push({
      type: part.added ? 'added' : part.removed ? 'removed' : 'equal',
      text: part.value,
    })
  }

  return parts.filter((part) => part.text.length > 0)
}
