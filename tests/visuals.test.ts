import { describe, expect, it } from 'vitest'
import { getBook1ChapterVisual } from '../src/lib/visuals/book1'

describe('Book 1 chapter visuals', () => {
  it('returns stable public WebP paths for Book 1 chapters', () => {
    expect(getBook1ChapterVisual('ch1')).toEqual({
      chapterId: 'ch1',
      chapterLabel: '1',
      src: '/visuals/book1/chapters/ch1/illustration.webp',
    })
    expect(getBook1ChapterVisual('ch11b')?.src).toBe('/visuals/book1/chapters/ch11b/illustration.webp')
  })

  it('returns null outside the configured Book 1 chapters', () => {
    expect(getBook1ChapterVisual(null)).toBeNull()
    expect(getBook1ChapterVisual('b2ch1')).toBeNull()
  })
})
