import { describe, expect, it } from 'vitest'
import { BOOK1_SCENE_VISUALS, getBook1SceneVisual } from '../src/lib/visuals/book1'

describe('Book 1 moment visuals', () => {
  it('returns stable public WebP paths for configured scene moments', () => {
    expect(getBook1SceneVisual('Ch1-Intro2')).toEqual({
      sceneId: 'Ch1-Intro2',
      momentId: 'ch1-forest-arrival',
      title: 'Barry arrives in Varathia',
      src: '/visuals/book1/moments/ch1-forest-arrival/illustration.webp',
    })
    expect(getBook1SceneVisual('Ch10-Teleport')?.src).toBe('/visuals/book1/moments/ch10-pit-rescue/illustration.webp')
  })

  it('selects the final Rose visual variant from story variables', () => {
    expect(getBook1SceneVisual('Ch11b-Ending', { v_ch11_saved_rose: 1 })?.momentId).toBe(
      'ch11b-golmyck-announcement',
    )
    expect(getBook1SceneVisual('Ch11b-Ending', { v_ch11_saved_rose: 0 })?.momentId).toBe(
      'ch11b-golmyck-announcement-no-rose',
    )
    expect(getBook1SceneVisual('Ch11b-Ending')?.momentId).toBe('ch11b-golmyck-announcement-no-rose')
  })

  it('returns null outside the configured Book 1 trigger scenes', () => {
    expect(getBook1SceneVisual(null)).toBeNull()
    expect(getBook1SceneVisual('Ch1-Intro1')).toBeNull()
    expect(getBook1SceneVisual('b2ch1')).toBeNull()
  })

  it('keeps the v1 moment set broad enough for Book 1 without using chapter paths', () => {
    expect(Object.keys(BOOK1_SCENE_VISUALS).length).toBeGreaterThanOrEqual(40)
    const visuals = Object.values(BOOK1_SCENE_VISUALS).flatMap((entry) => (Array.isArray(entry) ? entry : [entry]))
    for (const visual of visuals) {
      expect(visual.src).toContain('/visuals/book1/moments/')
      expect(visual.src).not.toContain('/chapters/')
    }
  })
})
