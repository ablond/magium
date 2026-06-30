import fs from "node:fs/promises";
import path from "node:path";
import { BOOK1_CHAPTER_IDS, BOOK1_CHARACTERS, BOOK1_MOMENTS, BOOK1_VISUAL_ROOT } from "./book1-config.mjs";
import { ensureDir, pathExists, walkFiles } from "../content/utils.mjs";

const MAX_PROMPT_BYTES = 24_000;
const LONG_SOURCE_COPY_LENGTH = 180;
const FORBIDDEN_PROMPT_PATTERNS = [
  /evidenceRefs/i,
  /\bRAG\b/i,
  /embedding/i,
  /OPENAI_API_KEY/i,
  /\.magium\b/i,
  /\bID:\s*Ch\d/i,
  /public\/visuals\/book1\/chapters/i,
];

export { BOOK1_CHARACTERS, BOOK1_MOMENTS };

export async function generateBook1Prompts({
  root = process.cwd(),
  canonicalRoot = path.join(root, "content/canonical/v1"),
  visualRoot = path.join(root, BOOK1_VISUAL_ROOT),
} = {}) {
  const corpus = await loadBook1Corpus(canonicalRoot);
  const sceneIndex = await loadBook1SceneIndex(canonicalRoot);
  const charactersById = new Map(BOOK1_CHARACTERS.map((character) => [character.id, character]));

  for (const character of BOOK1_CHARACTERS) {
    const anchors = findAnchors(corpus, character.anchors);
    const file = path.join(visualRoot, "characters", character.id, "portrait.md");
    await writeIfChanged(file, renderCharacterPrompt(character, anchors));
  }

  for (const moment of BOOK1_MOMENTS) {
    assertKnownCharacters(moment.characters, charactersById, moment.id);
    assertKnownScene(moment, sceneIndex);
    const file = path.join(visualRoot, "moments", moment.id, "illustration.md");
    await writeIfChanged(file, renderMomentPrompt(moment, charactersById));
  }

  return {
    characters: BOOK1_CHARACTERS.length,
    moments: BOOK1_MOMENTS.length,
    visualRoot,
  };
}

export async function checkBook1ManualImages({
  root = process.cwd(),
  canonicalRoot = path.join(root, "content/canonical/v1"),
  visualRoot = path.join(root, BOOK1_VISUAL_ROOT),
} = {}) {
  const corpus = await loadBook1Corpus(canonicalRoot);
  const sceneIndex = await loadBook1SceneIndex(canonicalRoot);
  const markdownFiles = [];
  const optionalImages = [];
  const characterIds = new Set(BOOK1_CHARACTERS.map((character) => character.id));
  const momentIds = new Set(BOOK1_MOMENTS.map((moment) => moment.id));

  await assertOnlyExpectedDirs(path.join(visualRoot, "characters"), characterIds);
  await assertNoDirectory(path.join(visualRoot, "chapters"));
  await assertOnlyExpectedDirs(path.join(visualRoot, "moments"), momentIds);

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

  for (const moment of BOOK1_MOMENTS) {
    assertKnownScene(moment, sceneIndex);
    const dir = path.join(visualRoot, "moments", moment.id);
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
    missingImages: BOOK1_CHARACTERS.length + BOOK1_MOMENTS.length - optionalImages.length,
  };
}

export async function stageBook1MomentImages({
  root = process.cwd(),
  visualRoot = path.join(root, BOOK1_VISUAL_ROOT),
  outputRoot = path.join(root, "output/visual/staging/book1"),
  momentId,
  chapterId,
  all = false,
} = {}) {
  const charactersById = new Map(BOOK1_CHARACTERS.map((character) => [character.id, character]));
  const moments = selectMoments({ momentId, chapterId, all });

  await ensureDir(outputRoot);

  const staged = [];
  for (const moment of moments) {
    assertKnownCharacters(moment.characters, charactersById, moment.id);
    const publicPrompt = path.join(visualRoot, "moments", moment.id, "illustration.md");
    await assertFile(publicPrompt);

    const stageDir = path.join(outputRoot, moment.id);
    const referencesDir = path.join(stageDir, "references");
    await fs.rm(stageDir, { recursive: true, force: true });
    await ensureDir(referencesDir);
    await fs.copyFile(publicPrompt, path.join(stageDir, "prompt.md"));

    const references = [];
    for (const characterId of moment.characters) {
      const source = path.join(visualRoot, "characters", characterId, "portrait.webp");
      await assertFile(source);
      const targetName = `${characterId}.webp`;
      await fs.copyFile(source, path.join(referencesDir, targetName));
      references.push(targetName);
    }

    await fs.writeFile(path.join(stageDir, "README.md"), renderStageReadme(moment, references));
    staged.push({ id: moment.id, chapterId: moment.chapterId, prompt: path.join(stageDir, "prompt.md"), references });
  }

  return {
    moments: staged.length,
    outputRoot,
    staged,
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

export async function loadBook1SceneIndex(canonicalRoot) {
  const sceneIndex = new Map();
  for (const chapterId of BOOK1_CHAPTER_IDS) {
    const file = path.join(canonicalRoot, "story", `${chapterId}.json`);
    const chapter = JSON.parse(await fs.readFile(file, "utf8"));
    const sceneIds = chapter.sceneOrder ?? Object.keys(chapter.scenes ?? {});
    sceneIndex.set(chapterId, new Set(sceneIds));
  }
  return sceneIndex;
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
    "Use this as a stable reference portrait for later moment illustrations.",
    "```",
    "",
  ].join("\n");
}

export function renderMomentPrompt(moment, charactersById = new Map(BOOK1_CHARACTERS.map((character) => [character.id, character]))) {
  const references = moment.characters.map((characterId) => {
    const character = charactersById.get(characterId);
    if (!character) throw new Error(`Unknown character "${characterId}" in ${moment.id}`);
    return { id: characterId, name: character.name };
  });
  const specialNotes = sharedBodyAndAmuletNotes(moment.characters);

  return [
    `# ${moment.title} - Book 1 Moment Illustration`,
    "",
    "Public manual prompt for ChatGPT Images. Attach the listed portraits before generating the moment illustration.",
    "",
    "## Target File",
    "",
    "`illustration.webp`",
    "",
    "## Moment",
    "",
    `- Chapter: \`${moment.chapterId}\``,
    `- Trigger scene: \`${moment.triggerSceneId}\``,
    `- Moment id: \`${moment.id}\``,
    "",
    "## Character References To Attach",
    "",
    ...references.map((reference) => `- ${reference.name}: \`public/visuals/book1/characters/${reference.id}/portrait.webp\` as \`${reference.id}.webp\``),
    "",
    "## Scene Facts",
    "",
    ...sectionLines("Setting", moment.settingFacts),
    ...sectionLines("Action", moment.actionFacts),
    ...sectionLines("Materials and architecture", moment.materialDetails),
    ...sectionLines("Unnamed figures", moment.unnamedCharacters),
    ...sectionLines("Composition", moment.composition),
    ...sectionLines("Timeline overrides", moment.timelineOverrides),
    ...sectionLines("Avoid", moment.avoid),
    ...specialNotes.map((note) => `- Special: ${note}`),
    "",
    "## Prompt ChatGPT",
    "",
    "```text",
    `Create one Book 1 moment illustration for Magium: ${moment.title}.`,
    "",
    "Attached references:",
    ...references.map((reference) => `- \`${reference.id}.webp\` = ${reference.name}`),
    "",
    "Use the attached references for stable identity, species, body shape, clothing and magical aura, but obey the scene-specific overrides below.",
    "",
    "Scene-specific overrides:",
    ...moment.timelineOverrides.map((fact) => `- ${fact}`),
    ...specialNotes.map((note) => `- ${note}`),
    "",
    "Scene design:",
    ...moment.settingFacts.map((fact) => `- Setting: ${fact}`),
    ...moment.actionFacts.map((fact) => `- Action: ${fact}`),
    ...moment.materialDetails.map((fact) => `- Materials/architecture: ${fact}`),
    ...moment.unnamedCharacters.map((fact) => `- Unnamed/background figures: ${fact}`),
    ...moment.composition.map((fact) => `- Composition: ${fact}`),
    "",
    "Visual direction:",
    "- grounded realistic fantasy adventure illustration",
    "- wide 16:9 landscape, readable on mobile, strong focal point, no UI frame",
    "- cinematic but restrained lighting, coherent scale between characters, detailed materials and environment",
    "- prioritize canonical accuracy and continuity over extra ornament",
    "",
    "Avoid:",
    ...moment.avoid.map((fact) => `- ${fact}`),
    "- no logo, no watermark, no readable text",
    "```",
    "",
  ].join("\n");
}

function renderStageReadme(moment, references) {
  return [
    `# ${moment.id}`,
    "",
    "1. Upload every file in `references/` to ChatGPT Images.",
    "2. Open `prompt.md` and paste the `Prompt ChatGPT` block.",
    "3. Save the generated image as `illustration.webp` in the public moment folder:",
    "",
    `\`public/visuals/book1/moments/${moment.id}/illustration.webp\``,
    "",
    "Reference files staged:",
    "",
    ...references.map((reference) => `- \`references/${reference}\``),
    "",
  ].join("\n");
}

function selectMoments({ momentId, chapterId, all }) {
  if (momentId) {
    const moment = BOOK1_MOMENTS.find((candidate) => candidate.id === momentId);
    if (!moment) throw new Error(`Unknown Book 1 image moment: ${momentId}`);
    return [moment];
  }
  if (chapterId) {
    const moments = BOOK1_MOMENTS.filter((candidate) => candidate.chapterId === chapterId);
    if (!moments.length) throw new Error(`No Book 1 image moments configured for chapter: ${chapterId}`);
    return moments;
  }
  if (all) return BOOK1_MOMENTS;
  throw new Error("Choose one staging scope: --moment <id>, --chapter <chapter-id>, or --all.");
}

function articleFor(value) {
  return /^[aeiou]/i.test(value) ? "an" : "a";
}

function assertKnownCharacters(characterIds, charactersById, ownerId) {
  for (const characterId of characterIds) {
    if (!charactersById.has(characterId)) {
      throw new Error(`${ownerId} references unknown visual character "${characterId}"`);
    }
  }
}

function assertKnownScene(moment, sceneIndex) {
  const sceneIds = sceneIndex.get(moment.chapterId);
  if (!sceneIds?.has(moment.triggerSceneId)) {
    throw new Error(`Book 1 visual moment ${moment.id} references unknown scene ${moment.chapterId}/${moment.triggerSceneId}`);
  }
}

function sharedBodyAndAmuletNotes(characterIds) {
  const notes = [];
  const hasFlower = characterIds.includes("flower");
  const hasIlluna = characterIds.includes("illuna");
  if (hasFlower || hasIlluna) {
    notes.push(
      "Flower and Illuna (aka Petal) share one little girl's body; never show them as two separate visible people in the same moment.",
    );
  }
  if (hasFlower && hasIlluna) {
    notes.push(
      "Use Flower and Illuna portraits as alternate expression and eye-state references for the same body, not as two separate character references.",
    );
  }
  if (characterIds.includes("arraka")) {
    notes.push("Arraka is represented through the golden amulet or its aura unless the scene explicitly says otherwise.");
  }
  return notes;
}

function sectionLines(label, values) {
  if (!values.length) return [`- ${label}: none`];
  return values.map((value) => `- ${label}: ${value}`);
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

async function assertNoDirectory(dir) {
  const stat = await fs.stat(dir).catch(() => null);
  if (stat?.isDirectory()) {
    throw new Error(`Stale chapter visual directory is no longer supported: ${dir}`);
  }
}

async function assertFile(file) {
  const stat = await fs.stat(file).catch(() => null);
  if (!stat?.isFile()) {
    throw new Error(`Missing visual file: ${file}`);
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
