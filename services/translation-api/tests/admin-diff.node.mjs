import test from 'node:test'
import assert from 'node:assert/strict'
import { buildTextDiffParts } from '../src/admin-diff.js'

test('builds an empty diff when original text is unavailable', () => {
  assert.deepEqual(buildTextDiffParts('', 'Texte propose'), [])
})

test('marks additions while preserving spaces and punctuation', () => {
  assert.deepEqual(buildTextDiffParts('Bonjour, monde.', 'Bonjour, beau monde.'), [
    { type: 'equal', text: 'Bonjour, ' },
    { type: 'added', text: 'beau ' },
    { type: 'equal', text: 'monde.' },
  ])
})

test('marks pure removals', () => {
  assert.deepEqual(buildTextDiffParts('Bonjour, très vieux monde.', 'Bonjour, monde.'), [
    { type: 'equal', text: 'Bonjour, ' },
    { type: 'removed', text: 'très vieux ' },
    { type: 'equal', text: 'monde.' },
  ])
})

test('marks replacements as changed proposed text', () => {
  assert.deepEqual(buildTextDiffParts('Bonjour, vieux monde.', 'Bonjour, nouveau monde.'), [
    { type: 'equal', text: 'Bonjour, ' },
    { type: 'changed', text: 'nouveau' },
    { type: 'equal', text: ' monde.' },
  ])
})

test('keeps identical text as one equal part', () => {
  assert.deepEqual(buildTextDiffParts('Même texte.', 'Même texte.'), [
    { type: 'equal', text: 'Même texte.' },
  ])
})
