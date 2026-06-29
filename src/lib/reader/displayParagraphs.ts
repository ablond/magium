export type SourceParagraph = {
  id: string
  text: string
}

export type DisplayParagraph = {
  id: string
  sourceId: string
  text: string
}

const PARAGRAPH_BREAK = /\r?\n(?:[ \t]*\r?\n)+/

export function splitDisplayParagraphs(paragraphs: SourceParagraph[]): DisplayParagraph[] {
  return paragraphs.flatMap((paragraph) =>
    paragraph.text
      .split(PARAGRAPH_BREAK)
      .map((text) => text.trim())
      .filter(Boolean)
      .map((text, index) => ({
        id: `${paragraph.id}:${index + 1}`,
        sourceId: paragraph.id,
        text,
      })),
  )
}
