export type LocaleCode = string

export type PrimitiveValue = string | number | boolean

export type ComparisonOperator = '<' | '>' | '<=' | '>=' | '==' | '!='

export type AtomicCondition =
  | { type: 'true' }
  | { type: 'false' }
  | { type: 'comparison'; variable: string; operator: ComparisonOperator; value: PrimitiveValue }

export type ConditionExpression = {
  raw: string
  anyOf: Array<{ allOf: AtomicCondition[] }>
} | null

export type VariableAssignment = {
  variable: string
  value: PrimitiveValue
}

export type ParagraphBlock = {
  id: string
  type: 'paragraph'
  messageId: string
  conditions: ConditionExpression
}

export type Choice = {
  id: string
  messageId: string
  target: string
  setVariables: VariableAssignment[]
  special: string | null
  conditions: ConditionExpression
}

export type SceneAchievement = {
  id: string
  messageId: string
  variable: string
}

export type Scene = {
  id: string
  blocks: ParagraphBlock[]
  choices: Choice[]
  setVariables: Array<VariableAssignment & { id: string; conditions: ConditionExpression }>
  achievements: SceneAchievement[]
}

export type StoryChapter = {
  formatVersion: number
  chapterId: string
  sourceFile: string
  sceneOrder: string[]
  scenes: Record<string, Scene>
}

export type LocaleBundle = {
  locale: LocaleCode
  chapterId?: string
  messages: Record<string, string>
}

export type AchievementDefinition = {
  id: string
  variable: string
  chapterKey: string
  titleMessageId: string
  captionMessageId: string
}

export type AchievementCatalog = {
  formatVersion: number
  achievements: AchievementDefinition[]
}

export type ContentIndex = {
  formatVersion: number
  contentVersion: string
  sourceCommit: string
  defaultLocale: LocaleCode
  initialSceneId: string
  chapters: Array<{ id: string; key: string; sourceFile: string; sceneCount: number }>
  sceneToChapter: Record<string, string>
}

export type ChoiceHistoryEvent = {
  sceneId: string
  choiceId: string
  target: string
  special: string | null
  assignments: VariableAssignment[]
}

export type CheckpointState = {
  currentSceneId: string
  variables: Record<string, PrimitiveValue>
  achievements: Record<string, true>
  historyDigest: string
}

export type GameState = {
  schemaVersion: 1
  contentVersion: string
  slotId: string
  locale: LocaleCode
  currentSceneId: string
  variables: Record<string, PrimitiveValue>
  achievements: Record<string, true>
  checkpoint: CheckpointState | null
  history: ChoiceHistoryEvent[]
  historyDigest: string
  createdAt: string
  updatedAt: string
}

export type RenderedScene = {
  scene: Scene
  paragraphs: Array<{ id: string; text: string }>
  choices: Array<Choice & { text: string }>
  unlockedAchievements: AchievementDefinition[]
}

export type StoryContext = {
  index: ContentIndex
  chapters: Record<string, StoryChapter>
  locales: Record<string, LocaleBundle>
  achievements: AchievementCatalog
  achievementLocale: LocaleBundle
}

export type Settings = {
  theme: 'dark' | 'light'
  textScale: number
  highContrast: boolean
  typewriter: boolean
  locale: LocaleCode
}
