export type SourceParagraph = {
  id: string
  text: string
}

export type DisplayParagraph = {
  id: string
  sourceId: string
  segmentIndex: number
  segmentCount: number
  text: string
}

export const DISPLAY_PARAGRAPH_BREAK = /\r?\n(?:[ \t]*\r?\n)+/

export function splitDisplayText(text: string): string[] {
  return text
    .split(DISPLAY_PARAGRAPH_BREAK)
    .map((segment) => segment.trim())
    .filter(Boolean)
}

export function splitDisplayParagraphs(paragraphs: SourceParagraph[]): DisplayParagraph[] {
  return paragraphs.flatMap((paragraph) => {
    const segments = splitDisplayText(paragraph.text)
    return segments
      .map((text, index) => ({
        id: `${paragraph.id}:${index + 1}`,
        sourceId: paragraph.id,
        segmentIndex: index,
        segmentCount: segments.length,
        text,
      }))
  })
}
