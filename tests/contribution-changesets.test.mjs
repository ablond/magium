import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { applyTranslationChangeset, hashText, validateChangeset } from '../tools/contributions/changesets.mjs'

async function createLocaleFixture() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'magium-changeset-'))
  const localeRoot = path.join(root, 'content/story-locales/fr')
  await fs.mkdir(localeRoot, { recursive: true })
  await fs.writeFile(path.join(localeRoot, 'ch1.json'), `${JSON.stringify({
    locale: 'fr',
    chapterId: 'ch1',
    messages: {
      'ch1.p1': 'Ancien texte',
      'ch1.p2': 'Texte intact',
      'ch1.multi': 'Premier paragraphe\n\nDeuxième paragraphe\n\nTroisième paragraphe',
    },
  }, null, 2)}\n`)
  return root
}

describe('translation changesets', () => {
  it('applies one final text to a whole message id when no segment is targeted', async () => {
    const root = await createLocaleFixture()
    const result = await applyTranslationChangeset({
      root,
      changeset: {
        id: 'cs_1',
        title: 'FR ch1',
        items: [{
          locale: 'fr',
          chapterId: 'ch1',
          messageId: 'ch1.p1',
          currentTextHash: hashText('Ancien texte'),
          finalText: 'Texte corrigé',
        }],
      },
    })

    const bundle = JSON.parse(await fs.readFile(path.join(root, 'content/story-locales/fr/ch1.json'), 'utf8'))
    expect(result.stale).toEqual([])
    expect(bundle.messages['ch1.p1']).toBe('Texte corrigé')
    expect(bundle.messages['ch1.p2']).toBe('Texte intact')
  })

  it('applies one paragraph segment without changing neighbouring paragraphs', async () => {
    const root = await createLocaleFixture()
    const result = await applyTranslationChangeset({
      root,
      changeset: {
        id: 'cs_1',
        title: 'FR ch1',
        items: [{
          locale: 'fr',
          chapterId: 'ch1',
          messageId: 'ch1.multi',
          targetType: 'paragraph',
          segmentIndex: 1,
          segmentCount: 3,
          currentTextHash: hashText('Deuxième paragraphe'),
          finalText: 'Deuxième paragraphe corrigé',
        }],
      },
    })

    const bundle = JSON.parse(await fs.readFile(path.join(root, 'content/story-locales/fr/ch1.json'), 'utf8'))
    expect(result.stale).toEqual([])
    expect(bundle.messages['ch1.multi']).toBe('Premier paragraphe\n\nDeuxième paragraphe corrigé\n\nTroisième paragraphe')
  })

  it('applies several segments from the same message in one pass', async () => {
    const root = await createLocaleFixture()
    const result = await applyTranslationChangeset({
      root,
      changeset: {
        id: 'cs_1',
        title: 'FR ch1',
        items: [
          {
            locale: 'fr',
            chapterId: 'ch1',
            messageId: 'ch1.multi',
            targetType: 'paragraph',
            segmentIndex: 0,
            segmentCount: 3,
            currentTextHash: hashText('Premier paragraphe'),
            finalText: 'Premier paragraphe corrigé',
          },
          {
            locale: 'fr',
            chapterId: 'ch1',
            messageId: 'ch1.multi',
            targetType: 'paragraph',
            segmentIndex: 2,
            segmentCount: 3,
            currentTextHash: hashText('Troisième paragraphe'),
            finalText: 'Troisième paragraphe corrigé',
          },
        ],
      },
    })

    const bundle = JSON.parse(await fs.readFile(path.join(root, 'content/story-locales/fr/ch1.json'), 'utf8'))
    expect(result.stale).toEqual([])
    expect(bundle.messages['ch1.multi']).toBe('Premier paragraphe corrigé\n\nDeuxième paragraphe\n\nTroisième paragraphe corrigé')
  })

  it('allows different segments from the same message and refuses duplicate final texts for the same segment', () => {
    expect(() => validateChangeset({
      items: [
        { locale: 'fr', chapterId: 'ch1', messageId: 'ch1.multi', targetType: 'paragraph', segmentIndex: 0, finalText: 'A' },
        { locale: 'fr', chapterId: 'ch1', messageId: 'ch1.multi', targetType: 'paragraph', segmentIndex: 1, finalText: 'B' },
      ],
    })).not.toThrow()

    expect(() => validateChangeset({
      items: [
        { locale: 'fr', chapterId: 'ch1', messageId: 'ch1.multi', targetType: 'paragraph', segmentIndex: 1, finalText: 'A' },
        { locale: 'fr', chapterId: 'ch1', messageId: 'ch1.multi', targetType: 'paragraph', segmentIndex: 1, finalText: 'B' },
      ],
    })).toThrow(/multiple final texts/)
  })

  it('refuses paragraph changeset items that introduce a paragraph separator', () => {
    expect(() => validateChangeset({
      items: [
        {
          locale: 'fr',
          chapterId: 'ch1',
          messageId: 'ch1.multi',
          targetType: 'paragraph',
          segmentIndex: 1,
          finalText: 'Un paragraphe\n\nUn autre paragraphe',
        },
      ],
    })).toThrow(/single paragraph/)
  })

  it('does not write partial files when one item is stale', async () => {
    const root = await createLocaleFixture()
    const result = await applyTranslationChangeset({
      root,
      changeset: {
        items: [
          {
            locale: 'fr',
            chapterId: 'ch1',
            messageId: 'ch1.p1',
            currentTextHash: hashText('Ancien texte'),
            finalText: 'Texte corrigé',
          },
          {
            locale: 'fr',
            chapterId: 'ch1',
            messageId: 'ch1.p2',
            currentTextHash: hashText('Déjà modifié ailleurs'),
            finalText: 'Texte concurrent',
          },
        ],
      },
    })

    const bundle = JSON.parse(await fs.readFile(path.join(root, 'content/story-locales/fr/ch1.json'), 'utf8'))
    expect(result.stale).toHaveLength(1)
    expect(bundle.messages['ch1.p1']).toBe('Ancien texte')
    expect(bundle.messages['ch1.p2']).toBe('Texte intact')
  })

  it('marks a paragraph stale when only the targeted segment hash no longer matches', async () => {
    const root = await createLocaleFixture()
    const result = await applyTranslationChangeset({
      root,
      changeset: {
        items: [
          {
            locale: 'fr',
            chapterId: 'ch1',
            messageId: 'ch1.multi',
            targetType: 'paragraph',
            segmentIndex: 1,
            segmentCount: 3,
            currentTextHash: hashText('Deuxième paragraphe ancien'),
            finalText: 'Deuxième paragraphe corrigé',
          },
        ],
      },
    })

    const bundle = JSON.parse(await fs.readFile(path.join(root, 'content/story-locales/fr/ch1.json'), 'utf8'))
    expect(result.stale).toHaveLength(1)
    expect(result.stale[0].reason).toBe('hash-mismatch')
    expect(bundle.messages['ch1.multi']).toBe('Premier paragraphe\n\nDeuxième paragraphe\n\nTroisième paragraphe')
  })

  it('keeps a paragraph applicable when neighbouring segments changed but the targeted segment is unchanged', async () => {
    const root = await createLocaleFixture()
    const file = path.join(root, 'content/story-locales/fr/ch1.json')
    const bundle = JSON.parse(await fs.readFile(file, 'utf8'))
    bundle.messages['ch1.multi'] = 'Premier paragraphe déjà modifié\n\nDeuxième paragraphe\n\nTroisième paragraphe déjà modifié'
    await fs.writeFile(file, `${JSON.stringify(bundle, null, 2)}\n`)

    const result = await applyTranslationChangeset({
      root,
      changeset: {
        items: [
          {
            locale: 'fr',
            chapterId: 'ch1',
            messageId: 'ch1.multi',
            targetType: 'paragraph',
            segmentIndex: 1,
            segmentCount: 3,
            currentTextHash: hashText('Deuxième paragraphe'),
            finalText: 'Deuxième paragraphe corrigé',
          },
        ],
      },
    })

    const updatedBundle = JSON.parse(await fs.readFile(file, 'utf8'))
    expect(result.stale).toEqual([])
    expect(updatedBundle.messages['ch1.multi']).toBe('Premier paragraphe déjà modifié\n\nDeuxième paragraphe corrigé\n\nTroisième paragraphe déjà modifié')
  })
})
