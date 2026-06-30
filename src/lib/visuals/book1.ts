export type ChapterVisual = {
  chapterId: string
  chapterLabel: string
  src: string
}

export const BOOK1_CHAPTER_VISUALS: Record<string, ChapterVisual> = {
  ch1: chapterVisual('ch1', '1'),
  ch2: chapterVisual('ch2', '2'),
  ch3: chapterVisual('ch3', '3'),
  ch4: chapterVisual('ch4', '4'),
  ch5: chapterVisual('ch5', '5'),
  ch6: chapterVisual('ch6', '6'),
  ch7: chapterVisual('ch7', '7'),
  ch8: chapterVisual('ch8', '8'),
  ch9: chapterVisual('ch9', '9'),
  ch10: chapterVisual('ch10', '10'),
  ch11a: chapterVisual('ch11a', '11A'),
  ch11b: chapterVisual('ch11b', '11B'),
}

export function getBook1ChapterVisual(chapterId: string | null | undefined) {
  return chapterId ? BOOK1_CHAPTER_VISUALS[chapterId] ?? null : null
}

function chapterVisual(chapterId: string, chapterLabel: string): ChapterVisual {
  return {
    chapterId,
    chapterLabel,
    src: `/visuals/book1/chapters/${chapterId}/illustration.webp`,
  }
}
