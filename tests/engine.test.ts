import { describe, expect, it } from 'vitest'
import {
  applyChoice,
  applyStatAllocation,
  createInitialState,
  debugApplyChoice,
  debugDeleteVariable,
  debugJumpToScene,
  debugSetVariable,
  enterCurrentScene,
  renderCurrentScene,
  replayAndValidate,
} from '../src/lib/story/engine'
import type { ComparisonOperator, ConditionExpression, StoryContext } from '../src/lib/story/types'

function condition(...comparisons: ReadonlyArray<readonly [string, ComparisonOperator, number]>): ConditionExpression {
  return {
    raw: comparisons.map(([variable, operator, value]) => `${variable} ${operator} ${value}`).join(' && '),
    anyOf: [{
      allOf: comparisons.map(([variable, operator, value]) => ({
        type: 'comparison' as const,
        variable,
        operator,
        value,
      })),
    }],
  }
}

function makeContext(): StoryContext {
  return {
    index: {
      formatVersion: 1,
      contentVersion: 'test',
      sourceCommit: 'test',
      defaultLocale: 'en',
      initialSceneId: 'Ch1-Intro1',
      uiLocales: ['en', 'fr'],
      storyLocales: ['en', 'fr'],
      chapters: [{ id: 'ch1', key: 'b1ch1', sourceFile: 'chapters/ch1.magium', sceneCount: 5 }],
      sceneToChapter: {
        'Ch1-Intro1': 'ch1',
        'Ch2-Stats': 'ch1',
        'Ch2-Avoid2': 'ch1',
        'Ch2-ChoiceOnly': 'ch1',
        'Ch2-DebugSet': 'ch1',
      },
    },
    locale: 'en',
    chapters: {
      ch1: {
        formatVersion: 1,
        chapterId: 'ch1',
        sourceFile: 'chapters/ch1.magium',
        sceneOrder: ['Ch1-Intro1', 'Ch2-Stats', 'Ch2-Avoid2', 'Ch2-ChoiceOnly', 'Ch2-DebugSet'],
        scenes: {
          'Ch1-Intro1': {
            id: 'Ch1-Intro1',
            blocks: [{ id: 'p1', type: 'paragraph', messageId: 'p1', conditions: null }],
            choices: [{
              id: 'c1',
              messageId: 'c1',
              target: 'Ch2-Stats',
              setVariables: [
                { variable: 'v_ac_start', mode: 'set', value: 1 },
                { variable: 'v_available_points', mode: 'add', value: 3 },
                { variable: 'v_available_points_aux', mode: 'add', value: 3 },
              ],
              special: 'stats',
              conditions: null,
            }],
            setVariables: [],
            achievements: [],
          },
          'Ch2-Stats': {
            id: 'Ch2-Stats',
            blocks: [{ id: 'p2', type: 'paragraph', messageId: 'p2', conditions: null }],
            choices: [],
            setVariables: [],
            achievements: [{ id: 'a1', messageId: 'a1', variable: 'v_ac_start' }],
          },
          'Ch2-Avoid2': {
            id: 'Ch2-Avoid2',
            blocks: [
              { id: 'p3', type: 'paragraph', messageId: 'p3', conditions: condition(['v_agility', '>', 0]) },
              { id: 'p4', type: 'paragraph', messageId: 'p4', conditions: condition(['v_reflexes', '>', 0]) },
              { id: 'p5', type: 'paragraph', messageId: 'p5', conditions: condition(['v_agility', '==', 0], ['v_reflexes', '==', 0], ['v_toughness', '>', 2], ['v_story_flag', '==', 1]) },
              { id: 'p6', type: 'paragraph', messageId: 'p6', conditions: condition(['v_toughness', '>', 2]) },
            ],
            choices: [],
            setVariables: [],
            achievements: [],
          },
          'Ch2-ChoiceOnly': {
            id: 'Ch2-ChoiceOnly',
            blocks: [{ id: 'p7', type: 'paragraph', messageId: 'p7', conditions: null }],
            choices: [{
              id: 'c2',
              messageId: 'c2',
              target: 'Ch2-Stats',
              setVariables: [],
              special: null,
              conditions: condition(['v_strength', '>=', 2]),
            }],
            setVariables: [],
            achievements: [],
          },
          'Ch2-DebugSet': {
            id: 'Ch2-DebugSet',
            blocks: [{ id: 'p8', type: 'paragraph', messageId: 'p8', conditions: null }],
            choices: [],
            setVariables: [{
              id: 'set-debug',
              variable: 'v_debug_scene_entered',
              mode: 'set',
              value: 1,
              conditions: null,
            }],
            achievements: [],
          },
        },
      },
    },
    locales: {
      ch1: {
        locale: 'en',
        chapterId: 'ch1',
        messages: {
          p1: 'Start',
          c1: 'Continue',
          p2: 'Arrived',
          p3: 'You dodge.',
          p4: 'You react.',
          p5: 'You endure.',
          p6: 'You still endure.',
          p7: 'Choose your next move.',
          p8: 'Debug landing.',
          c2: 'Continue',
          a1: 'A beginning',
        },
      },
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
    statsLocale: {
      locale: 'en',
      messages: {
        'stat.v_strength': 'Strength',
        'stat.v_agility': 'Speed',
        'stat.v_reflexes': 'Reflexes',
        'stat.v_toughness': 'Toughness',
      },
    },
  }
}

describe('story engine', () => {
  it('applies additive choice assignments, unlocks achievements, and validates replay', async () => {
    const context = makeContext()
    let state = enterCurrentScene(context, createInitialState('test', 'en'))
    const rendered = renderCurrentScene(context, state)

    state = await applyChoice(context, state, rendered.choices[0])

    expect(state.currentSceneId).toBe('Ch2-Stats')
    expect(state.variables.v_available_points).toBe(3)
    expect(state.variables.v_available_points_aux).toBe(3)
    expect(state.achievements.v_ac_start).toBe(true)
    expect(await replayAndValidate(async () => context, state)).toBe(true)

    const tampered = { ...state, variables: { ...state.variables, v_strength: 99 } }
    expect(await replayAndValidate(async () => context, tampered)).toBe(false)
  })

  it('reports post-choice stat check success from visible paragraphs', () => {
    const context = makeContext()
    const state = {
      ...createInitialState('test', 'en'),
      currentSceneId: 'Ch2-Avoid2',
      variables: { v_current_scene: 'Ch2-Avoid2', v_agility: 1, v_reflexes: 0, v_toughness: 0 },
    }

    expect(renderCurrentScene(context, state).statChecks).toEqual([
      { variable: 'v_agility', label: 'Speed', outcome: 'success', level: 1, actual: 1 },
    ])
  })

  it('reports inferred failures and deduplicated successes after the choice', () => {
    const context = makeContext()
    const state = {
      ...createInitialState('test', 'en'),
      currentSceneId: 'Ch2-Avoid2',
      variables: {
        v_current_scene: 'Ch2-Avoid2',
        v_agility: 0,
        v_reflexes: 0,
        v_toughness: 3,
        v_story_flag: 1,
      },
    }

    expect(renderCurrentScene(context, state).statChecks).toEqual([
      { variable: 'v_agility', label: 'Speed', outcome: 'failure', level: 1, actual: 0 },
      { variable: 'v_reflexes', label: 'Reflexes', outcome: 'failure', level: 1, actual: 0 },
      { variable: 'v_toughness', label: 'Toughness', outcome: 'success', level: 3, actual: 3 },
    ])
  })

  it('falls back to visible choice conditions when paragraphs do not expose a stat check', () => {
    const context = makeContext()
    const state = {
      ...createInitialState('test', 'en'),
      currentSceneId: 'Ch2-ChoiceOnly',
      variables: { v_current_scene: 'Ch2-ChoiceOnly', v_strength: 2 },
    }

    expect(renderCurrentScene(context, state).statChecks).toEqual([
      { variable: 'v_strength', label: 'Strength', outcome: 'success', level: 2, actual: 2 },
    ])
  })

  it('allocates stats without exceeding max or removing committed points', async () => {
    const context = makeContext()
    let state = enterCurrentScene(context, createInitialState('test', 'en'))
    state = await applyChoice(context, state, renderCurrentScene(context, state).choices[0])

    state = await applyStatAllocation(state, [{ variable: 'v_strength', amount: 2 }])

    expect(state.variables.v_strength).toBe(2)
    expect(state.variables.v_strength_aux).toBe(2)
    expect(state.variables.v_available_points).toBe(1)
    expect(state.variables.v_available_points_aux).toBe(1)
    expect(state.history.map((event) => event.type)).toEqual(['choice', 'stats'])
    await expect(applyStatAllocation(state, [{ variable: 'v_strength', amount: 2 }])).rejects.toThrow('Not enough stat points available')
    await expect(applyStatAllocation(state, [{ variable: 'v_agility', amount: 2 }])).rejects.toThrow('Not enough stat points available')
  })

  it('enforces dynamic max stat for manual allocation', async () => {
    const context = makeContext()
    let state = enterCurrentScene(context, createInitialState('test', 'en'))
    state = await applyChoice(context, state, renderCurrentScene(context, state).choices[0])

    const capped = {
      ...state,
      variables: {
        ...state.variables,
        v_available_points: 4,
        v_available_points_aux: 4,
      },
    }
    await expect(applyStatAllocation(capped, [{ variable: 'v_strength', amount: 4 }])).rejects.toThrow('Stat maximum reached')

    const upgraded = {
      ...state,
      variables: {
        ...state.variables,
        v_max_stat: 4,
        v_available_points: 4,
        v_available_points_aux: 4,
      },
    }
    const allocated = await applyStatAllocation(upgraded, [{ variable: 'v_strength', amount: 4 }])
    expect(allocated.variables.v_strength).toBe(4)
    expect(allocated.variables.v_available_points).toBe(0)
  })

  it('replays valid stat allocation and rejects tampered stats or point counters', async () => {
    const context = makeContext()
    let state = enterCurrentScene(context, createInitialState('test', 'en'))
    state = await applyChoice(context, state, renderCurrentScene(context, state).choices[0])
    state = await applyStatAllocation(state, [{ variable: 'v_strength', amount: 1 }])

    expect(await replayAndValidate(async () => context, state)).toBe(true)
    expect(await replayAndValidate(async () => context, {
      ...state,
      variables: { ...state.variables, v_strength: 2 },
    })).toBe(false)
    expect(await replayAndValidate(async () => context, {
      ...state,
      variables: { ...state.variables, v_available_points: 3 },
    })).toBe(false)
  })

  it('jumps directly to a scene in debug and applies scene entry variables without adding history', () => {
    const context = makeContext()
    const state = enterCurrentScene(context, createInitialState('test', 'en'))

    const jumped = debugJumpToScene(context, state, 'Ch2-DebugSet')

    expect(jumped.currentSceneId).toBe('Ch2-DebugSet')
    expect(jumped.variables.v_current_scene).toBe('Ch2-DebugSet')
    expect(jumped.variables.v_debug_scene_entered).toBe(1)
    expect(jumped.history).toHaveLength(0)
    expect(jumped.historyDigest).toBe(state.historyDigest)
    expect(jumped.debug).toMatchObject({ dirty: true, lastAction: 'Jumped to Ch2-DebugSet' })
  })

  it('applies hidden choices in debug without changing replay history', () => {
    const context = makeContext()
    const state = {
      ...enterCurrentScene(context, createInitialState('test', 'en')),
      currentSceneId: 'Ch2-ChoiceOnly',
      variables: { v_current_scene: 'Ch2-ChoiceOnly', v_strength: 0 },
    }
    const hiddenChoice = context.chapters.ch1.scenes['Ch2-ChoiceOnly'].choices[0]

    expect(renderCurrentScene(context, state).choices).toHaveLength(0)
    const next = debugApplyChoice(context, state, hiddenChoice)

    expect(next.currentSceneId).toBe('Ch2-Stats')
    expect(next.history).toHaveLength(0)
    expect(next.historyDigest).toBe(state.historyDigest)
    expect(next.debug).toMatchObject({ dirty: true, lastAction: 'Applied choice c2' })
  })

  it('edits stats, counters, and arbitrary variables in debug without replay events', () => {
    const context = makeContext()
    let state = enterCurrentScene(context, createInitialState('test', 'en'))

    state = debugSetVariable(state, 'v_strength', 4)
    state = debugSetVariable(state, 'v_strength_aux', 4)
    state = debugSetVariable(state, 'v_available_points', 9)
    state = debugSetVariable(state, 'v_available_points_aux', 9)
    state = debugSetVariable(state, 'v_max_stat', 4)
    state = debugSetVariable(state, 'v_debug_flag', true)
    state = debugDeleteVariable(state, 'v_debug_flag')

    expect(state.variables.v_strength).toBe(4)
    expect(state.variables.v_strength_aux).toBe(4)
    expect(state.variables.v_available_points).toBe(9)
    expect(state.variables.v_available_points_aux).toBe(9)
    expect(state.variables.v_max_stat).toBe(4)
    expect(state.variables.v_debug_flag).toBeUndefined()
    expect(state.history).toHaveLength(0)
    expect(state.debug).toMatchObject({ dirty: true, lastAction: 'Deleted v_debug_flag' })
  })
})
