const CONTROL_CHARS = /[\u0000-\u001f\u007f]/
const URL_LIKE = /\b(?:https?:\/\/|www\.|[a-z0-9.-]+\.[a-z]{2,}\/)/i
const EMAIL_LIKE = /\S+@\S+\.\S+/

export function moderatePseudonym(pseudonym, blocklist = []) {
  const value = String(pseudonym ?? '').trim()
  if (!value) {
    return { ok: true, value: '' }
  }
  if (value.length > 48) {
    return { ok: false, reason: 'Pseudonym is too long' }
  }
  if (CONTROL_CHARS.test(value)) {
    return { ok: false, reason: 'Pseudonym contains invalid characters' }
  }
  if (URL_LIKE.test(value) || EMAIL_LIKE.test(value)) {
    return { ok: false, reason: 'Pseudonym cannot contain contact details or links' }
  }

  const normalized = value.toLocaleLowerCase('fr-FR')
  for (const entry of blocklist) {
    const blocked = String(entry ?? '').trim().toLocaleLowerCase('fr-FR')
    if (blocked && normalized.includes(blocked)) {
      return { ok: false, reason: 'Pseudonym requires moderation' }
    }
  }

  return { ok: true, value }
}
