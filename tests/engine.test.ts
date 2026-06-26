import { describe, expect, it } from 'vitest'
import { applyChoice, createInitialState, enterCurrentScene, renderCurrentScene, replayAndValidate } from '../src/lib/story/engine'
import type { StoryContext } from '../src/lib/story/types'

function makeContext(): StoryContext {
  return {
    index: {
      formatVersion: 1,
      contentVersion: 'test',
      sourceCommit: 'test',
      defaultLocale: 'en',
      initialSceneId: 'Ch1-Intro1',
      uiLocales: ['en', 'fr'],
      chapters: [{ id: 'ch1', key: 'b1ch1', sourceFile: 'chapters/ch1.magium', sceneCount: 2 }],
      sceneToChapter: { 'Ch1-Intro1': 'ch1', 'Ch1-Intro2': 'ch1' },
    },
    chapters: {
      ch1: {
        formatVersion: 1,
        chapterId: 'ch1',
        sourceFile: 'chapters/ch1.magium',
        sceneOrder: ['Ch1-Intro1', 'Ch1-Intro2'],
        scenes: {
          'Ch1-Intro1': {
            id: 'Ch1-Intro1',
            blocks: [{ id: 'p1', type: 'paragraph', messageId: 'p1', conditions: null }],
            choices: [{
              id: 'c1',
              messageId: 'c1',
              target: 'Ch1-Intro2',
              setVariables: [{ variable: 'v_ac_start', value: 1 }],
              special: null,
              conditions: null,
            }],
            setVariables: [],
            achievements: [],
          },
          'Ch1-Intro2': {
            id: 'Ch1-Intro2',
            blocks: [{ id: 'p2', type: 'paragraph', messageId: 'p2', conditions: null }],
            choices: [],
            setVariables: [],
            achievements: [{ id: 'a1', messageId: 'a1', variable: 'v_ac_start' }],
          },
        },
      },
    },
    locales: {
      ch1: { locale: 'en', chapterId: 'ch1', messages: { p1: 'Start', c1: 'Continue', p2: 'Arrived', a1: 'A beginning' } },
    },
    achievements: {
      formatVersion: 1,
      achievements: [{
        id: 'v_ac_start',
        variable: 'v_ac_start',
        chapterKey: 'b1ch1',
        titleMessageId: 'achievement.v_ac_start.title',
        captionMessageId: 'achievement.v_ac_start.caption',
      }],
    },
    achievementLocale: {
      locale: 'en',
      messages: {
        'achievement.v_ac_start.title': 'A beginning',
        'achievement.v_ac_start.caption': 'Moved forward.',
      },
    },
  }
}

describe('story engine', () => {
  it('applies choices, unlocks achievements, and validates replay', async () => {
    const context = makeContext()
    let state = enterCurrentScene(context, createInitialState('test', 'en'))
    const rendered = renderCurrentScene(context, state)

    state = await applyChoice(context, state, rendered.choices[0])

    expect(state.currentSceneId).toBe('Ch1-Intro2')
    expect(state.achievements.v_ac_start).toBe(true)
    expect(await replayAndValidate(async () => context, state)).toBe(true)

    const tampered = { ...state, variables: { ...state.variables, v_strength: 99 } }
    expect(await replayAndValidate(async () => context, tampered)).toBe(false)
  })
})
