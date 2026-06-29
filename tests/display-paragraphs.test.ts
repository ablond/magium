import { describe, expect, it } from 'vitest'
import { splitDisplayParagraphs } from '../src/lib/reader/displayParagraphs'

describe('display paragraphs', () => {
  it('splits story text on blank lines into real display paragraphs', () => {
    expect(splitDisplayParagraphs([
      {
        id: 'ch5.Ch5_Intro.p2',
        text: '« Daren ! »\n\nPas de réponse.\n\n« Hé, Daren ! »',
      },
    ])).toEqual([
      { id: 'ch5.Ch5_Intro.p2:1', sourceId: 'ch5.Ch5_Intro.p2', text: '« Daren ! »' },
      { id: 'ch5.Ch5_Intro.p2:2', sourceId: 'ch5.Ch5_Intro.p2', text: 'Pas de réponse.' },
      { id: 'ch5.Ch5_Intro.p2:3', sourceId: 'ch5.Ch5_Intro.p2', text: '« Hé, Daren ! »' },
    ])
  })

  it('keeps single line breaks inside a display paragraph', () => {
    expect(splitDisplayParagraphs([
      {
        id: 'block',
        text: 'first line\nsecond line\n\nnext paragraph',
      },
    ])).toEqual([
      { id: 'block:1', sourceId: 'block', text: 'first line\nsecond line' },
      { id: 'block:2', sourceId: 'block', text: 'next paragraph' },
    ])
  })

  it('filters empty fragments and keeps stable fragment ids', () => {
    expect(splitDisplayParagraphs([
      {
        id: 'scene:p1',
        text: '\n\n  Alpha  \n  \n\n  Beta  \n\n',
      },
      {
        id: 'scene:p2',
        text: 'Gamma',
      },
    ])).toEqual([
      { id: 'scene:p1:1', sourceId: 'scene:p1', text: 'Alpha' },
      { id: 'scene:p1:2', sourceId: 'scene:p1', text: 'Beta' },
      { id: 'scene:p2:1', sourceId: 'scene:p2', text: 'Gamma' },
    ])
  })
})
