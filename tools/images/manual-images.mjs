import fs from "node:fs/promises";
import path from "node:path";
import { BOOK1_CHAPTER_IDS, BOOK1_CHAPTERS, BOOK1_CHARACTERS, BOOK1_VISUAL_ROOT } from "./book1-config.mjs";
import { ensureDir, pathExists, walkFiles } from "../content/utils.mjs";

const MAX_PROMPT_BYTES = 18_000;
const LONG_SOURCE_COPY_LENGTH = 180;
const FORBIDDEN_PROMPT_PATTERNS = [
  /evidenceRefs/i,
  /\bRAG\b/i,
  /embedding/i,
  /OPENAI_API_KEY/i,
  /\.magium\b/i,
  /\bID:\s*Ch\d/i,
  /chapters\/ch\d/i,
];

export { BOOK1_CHAPTERS, BOOK1_CHARACTERS };

export async function generateBook1Prompts({
  root = process.cwd(),
  canonicalRoot = path.join(root, "content/canonical/v1"),
  visualRoot = path.join(root, BOOK1_VISUAL_ROOT),
} = {}) {
  const corpus = await loadBook1Corpus(canonicalRoot);
  const charactersById = new Map(BOOK1_CHARACTERS.map((character) => [character.id, character]));

  for (const character of BOOK1_CHARACTERS) {
    const anchors = findAnchors(corpus, character.anchors);
    const file = path.join(visualRoot, "characters", character.id, "portrait.md");
    await writeIfChanged(file, renderCharacterPrompt(character, anchors));
  }

  for (const chapter of BOOK1_CHAPTERS) {
    assertKnownCharacters(chapter.characters, charactersById, chapter.id);
    const file = path.join(visualRoot, "chapters", chapter.id, "illustration.md");
    await writeIfChanged(file, renderChapterPrompt(chapter, charactersById));
  }

  return {
    characters: BOOK1_CHARACTERS.length,
    chapters: BOOK1_CHAPTERS.length,
    visualRoot,
  };
}

export async function checkBook1ManualImages({
  root = process.cwd(),
  canonicalRoot = path.join(root, "content/canonical/v1"),
  visualRoot = path.join(root, BOOK1_VISUAL_ROOT),
} = {}) {
  const corpus = await loadBook1Corpus(canonicalRoot);
  const markdownFiles = [];
  const optionalImages = [];
  const characterIds = new Set(BOOK1_CHARACTERS.map((character) => character.id));
  const chapterIds = new Set(BOOK1_CHAPTERS.map((chapter) => chapter.id));

  await assertOnlyExpectedDirs(path.join(visualRoot, "characters"), characterIds);
  await assertOnlyExpectedDirs(path.join(visualRoot, "chapters"), chapterIds);

  for (const character of BOOK1_CHARACTERS) {
    const dir = path.join(visualRoot, "characters", character.id);
    await assertDir(dir);
    const promptFile = path.join(dir, "portrait.md");
    await assertFile(promptFile);
    await assertPromptSafe(promptFile, corpus);
    markdownFiles.push(promptFile);

    const portraitFile = path.join(dir, "portrait.webp");
    if (await pathExists(portraitFile)) {
      await assertWebp(portraitFile);
      optionalImages.push(portraitFile);
    }
    await assertOnlyExpectedFiles(dir, new Set(["portrait.md", "portrait.webp"]));
  }

  for (const chapter of BOOK1_CHAPTERS) {
    const dir = path.join(visualRoot, "chapters", chapter.id);
    await assertDir(dir);
    const promptFile = path.join(dir, "illustration.md");
    await assertFile(promptFile);
    await assertPromptSafe(promptFile, corpus);
    markdownFiles.push(promptFile);

    const illustrationFile = path.join(dir, "illustration.webp");
    if (await pathExists(illustrationFile)) {
      await assertWebp(illustrationFile);
      optionalImages.push(illustrationFile);
    }
    await assertOnlyExpectedFiles(dir, new Set(["illustration.md", "illustration.webp"]));
  }

  return {
    prompts: markdownFiles.length,
    images: optionalImages.length,
    missingImages: BOOK1_CHARACTERS.length + BOOK1_CHAPTERS.length - optionalImages.length,
  };
}

export async function loadBook1Corpus(canonicalRoot) {
  const messages = [];
  for (const chapterId of BOOK1_CHAPTER_IDS) {
    const file = path.join(canonicalRoot, "locales/en", `${chapterId}.json`);
    const bundle = JSON.parse(await fs.readFile(file, "utf8"));
    for (const [messageId, text] of Object.entries(bundle.messages)) {
      messages.push({ chapterId, messageId, text: String(text) });
    }
  }
  return messages;
}

export function findAnchors(corpus, anchors) {
  return anchors.map((anchor) => {
    const found = corpus.find((entry) => entry.text.toLowerCase().includes(anchor.toLowerCase()));
    if (!found) {
      throw new Error(`Book 1 visual anchor not found: "${anchor}"`);
    }
    return {
      anchor,
      messageId: found.messageId,
    };
  });
}

export function renderCharacterPrompt(character, anchors) {
  return [
    `# ${character.name} - Book 1 Portrait`,
    "",
    "Public manual prompt for ChatGPT Images. Keep this file short and paraphrased because it is served from `public/`.",
    "",
    "## Target File",
    "",
    "`portrait.webp`",
    "",
    "## Canon Notes",
    "",
    ...character.facts.map((fact) => `- ${fact}`),
    "",
    "## Verified Anchors",
    "",
    ...anchors.map((anchor) => `- ${anchor.messageId}: ${anchor.anchor}`),
    "",
    "## Prompt ChatGPT",
    "",
    "```text",
    `Create a reusable full-body Book 1 character portrait for ${character.name}, ${articleFor(character.kind)} ${character.kind}.`,
    `Role: ${character.role}.`,
    "",
    "Canon and design constraints:",
    ...character.facts.map((fact) => `- ${fact}`),
    "",
    "Visual direction:",
    "- grounded realistic fantasy adventure illustration, readable and character-focused",
    "- full body, head to toe, feet visible, standing 3/4 reference pose, clear silhouette",
    "- neutral dark natural background, cinematic but restrained lighting, detailed clothing and gear",
    "- no bust portrait, no cropped portrait, no text, no logo, no watermark, no modern items unless explicitly listed above",
    "- prioritize canonical accuracy over extra ornament",
    "",
    "Use this as a stable reference portrait for later chapter illustrations.",
    "```",
    "",
  ].join("\n");
}

export function renderChapterPrompt(chapter, charactersById = new Map(BOOK1_CHARACTERS.map((character) => [character.id, character]))) {
  const references = chapter.characters.map((characterId) => {
    const character = charactersById.get(characterId);
    if (!character) throw new Error(`Unknown character "${characterId}" in ${chapter.id}`);
    return { id: characterId, name: character.name };
  });
  const sharedBodyNotes = [];
  if (chapter.characters.includes("flower") && chapter.characters.includes("illuna")) {
    sharedBodyNotes.push(
      "Flower and Illuna (aka Petal) share one little girl's body; use their portraits as alternate expression and eye-state references, never as two separate visible people in the same moment.",
    );
  }

  return [
    `# Book 1 Chapter ${chapter.label} - ${chapter.title}`,
    "",
    "Public manual prompt for ChatGPT Images. Attach the listed portraits before generating the chapter illustration.",
    "",
    "## Target File",
    "",
    "`illustration.webp`",
    "",
    "## Character References To Attach",
    "",
    ...references.map((reference) => `- ${reference.name}: \`public/visuals/book1/characters/${reference.id}/portrait.webp\``),
    "",
    "## Scene Direction",
    "",
    `- ${chapter.scene}`,
    "- Use the attached portraits as strict identity references.",
    ...sharedBodyNotes.map((note) => `- ${note}`),
    "- If a referenced portrait is missing, generate it first from its `portrait.md`.",
    "",
    "## Prompt ChatGPT",
    "",
    "```text",
    `Create one wide chapter illustration for Magium Book 1, Chapter ${chapter.label}: ${chapter.title}.`,
    "",
    `Scene: ${chapter.scene}`,
    "",
    "Use the attached character portraits as strict references for identity, clothing, species and magical aura. Keep non-human characters non-human.",
    ...sharedBodyNotes,
    "Composition: grounded realistic fantasy adventure scene, 16:9 landscape, readable on mobile, strong focal point, no UI frame.",
    "Style: painterly but restrained, cinematic lighting, coherent scale between characters, no text, no logo, no watermark.",
    "Avoid adding characters who are not listed in the references unless they are anonymous background figures required by the scene.",
    "```",
    "",
  ].join("\n");
}

function articleFor(value) {
  return /^[aeiou]/i.test(value) ? "an" : "a";
}

function assertKnownCharacters(characterIds, charactersById, chapterId) {
  for (const characterId of characterIds) {
    if (!charactersById.has(characterId)) {
      throw new Error(`Chapter ${chapterId} references unknown visual character "${characterId}"`);
    }
  }
}

async function writeIfChanged(file, content) {
  await ensureDir(path.dirname(file));
  const current = await fs.readFile(file, "utf8").catch(() => null);
  if (current === content) return false;
  await fs.writeFile(file, content);
  return true;
}

async function assertDir(dir) {
  const stat = await fs.stat(dir).catch(() => null);
  if (!stat?.isDirectory()) {
    throw new Error(`Missing visual directory: ${dir}`);
  }
}

async function assertFile(file) {
  const stat = await fs.stat(file).catch(() => null);
  if (!stat?.isFile()) {
    throw new Error(`Missing visual prompt: ${file}`);
  }
}

async function assertOnlyExpectedFiles(dir, expectedNames) {
  const files = await walkFiles(dir);
  for (const file of files) {
    const relative = path.relative(dir, file);
    if (!expectedNames.has(relative)) {
      throw new Error(`Unexpected visual file in ${dir}: ${relative}`);
    }
  }
}

async function assertOnlyExpectedDirs(dir, expectedNames) {
  await assertDir(dir);
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isDirectory()) {
      throw new Error(`Unexpected visual entry in ${dir}: ${entry.name}`);
    }
    if (!expectedNames.has(entry.name)) {
      throw new Error(`Unexpected visual directory in ${dir}: ${entry.name}`);
    }
  }
}

async function assertPromptSafe(file, corpus) {
  const content = await fs.readFile(file, "utf8");
  if (Buffer.byteLength(content, "utf8") > MAX_PROMPT_BYTES) {
    throw new Error(`Visual prompt is too large: ${file}`);
  }
  for (const pattern of FORBIDDEN_PROMPT_PATTERNS) {
    if (pattern.test(content)) {
      throw new Error(`Forbidden visual prompt content in ${file}: ${pattern}`);
    }
  }

  const normalizedContent = normalizeText(content);
  for (const entry of corpus) {
    for (const fragment of sourceFragments(entry.text)) {
      if (normalizedContent.includes(fragment)) {
        throw new Error(`Visual prompt appears to copy a long source fragment in ${file} from ${entry.messageId}`);
      }
    }
  }
}

async function assertWebp(file) {
  const buffer = await fs.readFile(file);
  const isWebp = buffer.length >= 12
    && buffer.subarray(0, 4).toString("ascii") === "RIFF"
    && buffer.subarray(8, 12).toString("ascii") === "WEBP";
  if (!isWebp) {
    throw new Error(`Visual image is not a WebP file: ${file}`);
  }
}

function sourceFragments(text) {
  return String(text)
    .split(/\n{2,}/)
    .map(normalizeText)
    .filter((fragment) => fragment.length >= LONG_SOURCE_COPY_LENGTH)
    .map((fragment) => fragment.slice(0, LONG_SOURCE_COPY_LENGTH));
}

function normalizeText(value) {
  return String(value).replace(/\s+/g, " ").trim();
}
