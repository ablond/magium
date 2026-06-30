import fs from "node:fs/promises";
import { spawn } from "node:child_process";
import path from "node:path";
import { BOOK1_CHAPTER_IDS, BOOK1_CHARACTERS, BOOK1_MOMENTS, BOOK1_VISUAL_ROOT } from "./book1-config.mjs";
import { ensureDir, pathExists, walkFiles } from "../content/utils.mjs";

const MAX_PROMPT_BYTES = 24_000;
const LONG_SOURCE_COPY_LENGTH = 180;
const REFERENCE_SHEET_SIZE = 1536;
const REFERENCE_SHEET_CELL_SIZE = REFERENCE_SHEET_SIZE / 2;
const VALID_IMAGE_QUALITIES = new Set(["low", "medium", "high", "auto"]);
const VALID_IMAGE_SIZES = new Set(["1024x1024", "1024x1536", "1536x1024", "auto"]);
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
    assertMomentReferenceRules(moment);
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
    assertMomentReferenceRules(moment);
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

export async function normalizeBook1MomentIllustrations({
  root = process.cwd(),
  visualRoot = path.join(root, BOOK1_VISUAL_ROOT),
  originalsRoot = path.join(root, "output/visual/originals/book1/moments"),
} = {}) {
  const converted = [];
  const skipped = [];

  for (const moment of BOOK1_MOMENTS) {
    const dir = path.join(visualRoot, "moments", moment.id);
    const target = path.join(dir, "illustration.webp");
    const candidateNames = [`${moment.id}.png`, `${moment.id}.jpg`, `${moment.id}.jpeg`, "illustration.png", "illustration.jpg", "illustration.jpeg"];
    const source = await firstExisting(candidateNames.map((name) => path.join(dir, name)));
    if (!source) {
      skipped.push(moment.id);
      continue;
    }

    await assertFile(source);
    await ensureDir(path.dirname(target));
    await runFfmpeg([
      "-y",
      "-i",
      source,
      "-map_metadata",
      "-1",
      "-c:v",
      "libwebp",
      "-quality",
      "92",
      "-compression_level",
      "6",
      target,
    ]);
    await assertWebp(target);

    const archiveDir = path.join(originalsRoot, moment.id);
    await ensureDir(archiveDir);
    await fs.rename(source, path.join(archiveDir, path.basename(source)));
    converted.push({ id: moment.id, target, original: path.join(archiveDir, path.basename(source)) });
  }

  return { converted, skipped, visualRoot, originalsRoot };
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
    assertMomentReferenceRules(moment);
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

export async function createBook1ReferenceSheets({
  root = process.cwd(),
  visualRoot = path.join(root, BOOK1_VISUAL_ROOT),
  outputRoot = path.join(root, "output/visual/api-inputs/book1"),
  momentId,
  chapterId,
  all = false,
  missing = false,
} = {}) {
  const charactersById = new Map(BOOK1_CHARACTERS.map((character) => [character.id, character]));
  const moments = [];
  for (const moment of selectMoments({ momentId, chapterId, all })) {
    if (missing && await pathExists(path.join(visualRoot, "moments", moment.id, "illustration.webp"))) continue;
    moments.push(moment);
  }
  const staged = [];

  await ensureDir(outputRoot);

  for (const moment of moments) {
    assertKnownCharacters(moment.characters, charactersById, moment.id);
    assertMomentReferenceRules(moment);

    const momentDir = path.join(outputRoot, moment.id);
    const sheetsDir = path.join(momentDir, "references");
    await fs.rm(momentDir, { recursive: true, force: true });
    await ensureDir(sheetsDir);

    const references = moment.characters.map((characterId) => {
      const character = charactersById.get(characterId);
      return {
        id: characterId,
        name: character.name,
        source: path.join(visualRoot, "characters", characterId, "portrait.webp"),
      };
    });
    for (const reference of references) {
      await assertFile(reference.source);
    }

    const sheets = [];
    for (let index = 0; index < references.length; index += 4) {
      const sheetReferences = references.slice(index, index + 4);
      const sheetIndex = sheets.length + 1;
      const sheetName = `refs-${String(sheetIndex).padStart(2, "0")}.webp`;
      const sheetPath = path.join(sheetsDir, sheetName);
      await renderReferenceSheet(sheetReferences, sheetPath);
      sheets.push({
        file: path.relative(momentDir, sheetPath),
        references: sheetReferences.map((reference, referenceIndex) => ({
          id: reference.id,
          name: reference.name,
          position: sheetPosition(referenceIndex),
        })),
      });
    }

    const prompt = renderApiPrompt(moment, charactersById, sheets);
    const manifest = {
      book: 1,
      momentId: moment.id,
      chapterId: moment.chapterId,
      triggerSceneId: moment.triggerSceneId,
      title: moment.title,
      target: path.join(BOOK1_VISUAL_ROOT, "moments", moment.id, "illustration.webp"),
      sheets,
      prompt,
    };

    await fs.writeFile(path.join(momentDir, "prompt.txt"), `${prompt}\n`);
    await fs.writeFile(path.join(momentDir, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
    staged.push({ id: moment.id, chapterId: moment.chapterId, sheets: sheets.map((sheet) => sheet.file), prompt: path.join(momentDir, "prompt.txt") });
  }

  return { moments: staged.length, outputRoot, staged };
}

export async function prepareBook1ImageBatch({
  root = process.cwd(),
  visualRoot = path.join(root, BOOK1_VISUAL_ROOT),
  inputRoot = path.join(root, "output/visual/api-inputs/book1"),
  outputRoot = path.join(root, "output/visual/api-runs/book1"),
  momentId,
  chapterId,
  all = false,
  missing = true,
  quality = "high",
  size = "1536x1024",
  referenceMode = "sheets",
} = {}) {
  if (referenceMode !== "sheets") {
    throw new Error(`Unsupported API reference mode: ${referenceMode}`);
  }
  assertImageOptions({ quality, size });

  const selectedMoments = selectMoments({ momentId, chapterId, all });
  const moments = [];
  for (const moment of selectedMoments) {
    const illustration = path.join(visualRoot, "moments", moment.id, "illustration.webp");
    if (missing && await pathExists(illustration)) continue;
    moments.push(moment);
  }

  if (moments.length === 0) {
    return { requests: 0, outputRoot, batchFile: "", runManifestFile: "" };
  }

  await createBook1ReferenceSheets({ root, visualRoot, outputRoot: inputRoot, momentId, chapterId, all, missing });

  const runId = new Date().toISOString().replace(/[:.]/g, "-");
  const runDir = path.join(outputRoot, runId);
  await ensureDir(runDir);

  const lines = [];
  const requests = [];
  for (const moment of moments) {
    const manifestFile = path.join(inputRoot, moment.id, "manifest.json");
    const manifest = JSON.parse(await fs.readFile(manifestFile, "utf8"));
    const imageDataUrls = [];
    for (const sheet of manifest.sheets) {
      const sheetPath = path.join(inputRoot, moment.id, sheet.file);
      const buffer = await fs.readFile(sheetPath);
      imageDataUrls.push(`data:image/webp;base64,${buffer.toString("base64")}`);
    }
    const body = {
      model: "gpt-image-2",
      prompt: manifest.prompt,
      images: imageDataUrls.map((imageUrl) => ({ image_url: imageUrl })),
      n: 1,
      quality,
      size,
      output_format: "webp",
    };
    const request = {
      custom_id: `book1:${moment.id}`,
      method: "POST",
      url: "/v1/images/edits",
      body,
    };
    lines.push(JSON.stringify(request));
    requests.push({
      customId: request.custom_id,
      momentId: moment.id,
      target: path.join(visualRoot, "moments", moment.id, "illustration.webp"),
      manifest: manifestFile,
      sheets: manifest.sheets.map((sheet) => path.join(inputRoot, moment.id, sheet.file)),
    });
  }

  const batchFile = path.join(runDir, "batch-input.jsonl");
  const runManifestFile = path.join(runDir, "run-manifest.json");
  await fs.writeFile(batchFile, `${lines.join("\n")}\n`);
  await fs.writeFile(runManifestFile, `${JSON.stringify({
    createdAt: new Date().toISOString(),
    model: "gpt-image-2",
    endpoint: "/v1/images/edits",
    quality,
    size,
    outputFormat: "webp",
    referenceMode,
    requests,
  }, null, 2)}\n`);

  return { requests: requests.length, outputRoot: runDir, batchFile, runManifestFile };
}

export async function submitBook1ImageBatch({
  apiKey = process.env.OPENAI_API_KEY,
  batchFile,
  runManifestFile,
  completionWindow = "24h",
} = {}) {
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is required to submit an OpenAI image batch.");
  }
  if (!batchFile) throw new Error("--batch-file is required to submit a prepared image batch.");
  if (!runManifestFile) throw new Error("--run-manifest is required to submit a prepared image batch.");

  const inputFile = await uploadOpenAiFile({ apiKey, file: batchFile, purpose: "batch" });
  const batch = await openAiJson({
    apiKey,
    pathName: "/v1/batches",
    method: "POST",
    body: {
      input_file_id: inputFile.id,
      endpoint: "/v1/images/edits",
      completion_window: completionWindow,
      metadata: { workflow: "magium-book1-image-moments" },
    },
  });

  const manifest = JSON.parse(await fs.readFile(runManifestFile, "utf8"));
  manifest.openai = {
    submittedAt: new Date().toISOString(),
    inputFileId: inputFile.id,
    batchId: batch.id,
    status: batch.status,
  };
  await fs.writeFile(runManifestFile, `${JSON.stringify(manifest, null, 2)}\n`);

  return { batch, inputFile, runManifestFile };
}

export async function retrieveBook1ImageBatch({
  apiKey = process.env.OPENAI_API_KEY,
  batchId,
  runManifestFile,
} = {}) {
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is required to retrieve an OpenAI image batch.");
  }
  if (!batchId) throw new Error("--batch-id is required to retrieve an image batch.");
  if (!runManifestFile) throw new Error("--run-manifest is required to retrieve an image batch.");

  const batch = await openAiJson({ apiKey, pathName: `/v1/batches/${batchId}` });
  if (batch.status !== "completed") {
    return { batch, completed: false, written: [] };
  }
  if (!batch.output_file_id) {
    if (batch.error_file_id) {
      const errorText = await downloadOpenAiFileContent({ apiKey, fileId: batch.error_file_id });
      const errorFile = path.join(path.dirname(runManifestFile), "batch-errors.jsonl");
      await fs.writeFile(errorFile, errorText);

      const manifest = JSON.parse(await fs.readFile(runManifestFile, "utf8"));
      manifest.openai = {
        ...(manifest.openai ?? {}),
        retrievedAt: new Date().toISOString(),
        errorFileId: batch.error_file_id,
        errorFile,
        status: batch.status,
      };
      await fs.writeFile(runManifestFile, `${JSON.stringify(manifest, null, 2)}\n`);

      const failed = batch.request_counts?.failed ?? "unknown";
      throw new Error(
        `OpenAI batch ${batchId} completed with ${failed} failed request(s) and no output_file_id. ` +
          `Error file saved to ${errorFile}. First error: ${summarizeBatchErrorText(errorText)}`,
      );
    }
    throw new Error(`OpenAI batch ${batchId} completed without output_file_id or error_file_id.`);
  }

  const outputText = await downloadOpenAiFileContent({ apiKey, fileId: batch.output_file_id });
  const outputFile = path.join(path.dirname(runManifestFile), "batch-output.jsonl");
  await fs.writeFile(outputFile, outputText);
  let errorFile = "";
  let errorSummary = "";
  if (batch.error_file_id) {
    const errorText = await downloadOpenAiFileContent({ apiKey, fileId: batch.error_file_id });
    errorFile = path.join(path.dirname(runManifestFile), "batch-errors.jsonl");
    errorSummary = summarizeBatchErrorText(errorText);
    await fs.writeFile(errorFile, errorText);
  }

  const manifest = JSON.parse(await fs.readFile(runManifestFile, "utf8"));
  const requestsByCustomId = new Map(manifest.requests.map((request) => [request.customId, request]));
  const written = [];
  for (const line of outputText.split(/\n+/).filter(Boolean)) {
    const result = JSON.parse(line);
    const request = requestsByCustomId.get(result.custom_id);
    if (!request) continue;
    if (result.error) {
      throw new Error(`OpenAI batch request ${result.custom_id} failed: ${JSON.stringify(result.error)}`);
    }
    if (result.response?.status_code && result.response.status_code >= 400) {
      throw new Error(`OpenAI batch request ${result.custom_id} failed with HTTP ${result.response.status_code}: ${JSON.stringify(result.response.body)}`);
    }
    const imageBase64 = result.response?.body?.data?.[0]?.b64_json;
    if (!imageBase64) {
      throw new Error(`OpenAI batch request ${result.custom_id} did not return data[0].b64_json.`);
    }
    await ensureDir(path.dirname(request.target));
    await fs.writeFile(request.target, Buffer.from(imageBase64, "base64"));
    await assertWebp(request.target);
    written.push(request.target);
  }

  manifest.openai = {
    ...(manifest.openai ?? {}),
    retrievedAt: new Date().toISOString(),
    outputFileId: batch.output_file_id,
    ...(batch.error_file_id ? { errorFileId: batch.error_file_id, errorFile, errorSummary } : {}),
    status: batch.status,
    written,
  };
  await fs.writeFile(runManifestFile, `${JSON.stringify(manifest, null, 2)}\n`);

  return { batch, completed: true, written, errorFile, errorSummary, failed: batch.request_counts?.failed ?? 0 };
}

export async function generateBook1ImagesSync({
  apiKey = process.env.OPENAI_API_KEY,
  root = process.cwd(),
  visualRoot = path.join(root, BOOK1_VISUAL_ROOT),
  inputRoot = path.join(root, "output/visual/api-inputs/book1"),
  momentId,
  chapterId,
  all = false,
  missing = true,
  quality = "high",
  size = "1536x1024",
  referenceMode = "sheets",
} = {}) {
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is required to generate images with the OpenAI API.");
  }
  if (referenceMode !== "sheets") {
    throw new Error(`Unsupported API reference mode: ${referenceMode}`);
  }
  assertImageOptions({ quality, size });

  await createBook1ReferenceSheets({ root, visualRoot, outputRoot: inputRoot, momentId, chapterId, all, missing });

  const generated = [];
  for (const moment of selectMoments({ momentId, chapterId, all })) {
    const target = path.join(visualRoot, "moments", moment.id, "illustration.webp");
    if (missing && await pathExists(target)) continue;
    const manifest = JSON.parse(await fs.readFile(path.join(inputRoot, moment.id, "manifest.json"), "utf8"));
    const imageFiles = manifest.sheets.map((sheet) => path.join(inputRoot, moment.id, sheet.file));
    const imageBase64 = await editImageSync({ apiKey, prompt: manifest.prompt, imageFiles, quality, size });
    await ensureDir(path.dirname(target));
    await fs.writeFile(target, Buffer.from(imageBase64, "base64"));
    await assertWebp(target);
    generated.push(target);
  }

  return { generated };
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
  const specialNotes = sharedBodyAndAmuletNotes(moment);
  const barryEquipmentNotes = barryEquipmentContinuityNotes(moment);

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
    ...sectionLines("Path compatibility", moment.pathCompatibility ?? []),
    ...(barryEquipmentNotes.length ? sectionLines("Barry equipment continuity", barryEquipmentNotes) : []),
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
    ...(moment.pathCompatibility?.length ? ["", "Path compatibility:", ...moment.pathCompatibility.map((fact) => `- ${fact}`)] : []),
    ...(barryEquipmentNotes.length ? ["", "Barry equipment continuity:", ...barryEquipmentNotes.map((fact) => `- ${fact}`)] : []),
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

function barryEquipmentContinuityNotes(moment) {
  if (!moment.characters.includes("barry")) return [];

  const notes = [];
  const statDeviceMode = moment.barryEquipment?.statDevice ?? "pocket";
  if (statDeviceMode === "in-hand") {
    notes.push(
      "Barry's stat device is explicitly in his hand for this scene; show it as a small old virtual-pet-like magical organizer with an abstract glowing screen and no readable text.",
    );
  } else if (statDeviceMode === "nearby") {
    notes.push(
      "Barry's stat device may be a separate nearby object for this scene, but it must not look like a modern phone and must not become the main focus.",
    );
  } else {
    notes.push(
      "Barry's stat device must stay in his pocket or hidden for this scene; do not put the device in his hands and do not make it a focal prop.",
    );
  }

  const backpackMode = moment.barryEquipment?.backpack ?? inferBarryBackpackMode(moment.id);
  if (backpackMode === "ordinary") {
    notes.push(
      "Barry's backpack is not enchanted yet for this visual moment; show a plain weathered travel backpack with no magical glow, no magical seams and no inventory screen.",
    );
  } else if (backpackMode === "transition") {
    notes.push(
      "Barry's backpack starts ordinary in this scene and Daren enchants it here; a contained glow on the backpack is allowed only as Daren's spell, but do not show the later inventory screen yet.",
    );
  } else if (backpackMode === "enchanted-visible") {
    notes.push(
      "Barry's backpack is now enchanted by Daren; this is one of the rare scenes where a restrained magical inventory screen or soft backpack glow is allowed.",
    );
  } else if (backpackMode === "not-carried") {
    notes.push(
      "Barry is not carrying his backpack in this city sequence; do not show his backpack, crossbow, backpack glow or backpack inventory screen at all.",
    );
  } else {
    notes.push(
      "Barry's backpack has been enchanted by Daren since chapter 6, but it should still look like an ordinary weathered backpack from the outside; no glow or inventory screen unless this prompt explicitly asks for it.",
    );
  }

  return notes;
}

function inferBarryBackpackMode(momentId) {
  const transitionIndex = BOOK1_MOMENTS.findIndex((moment) => moment.id === "ch6-barry-packing-crossbow");
  const momentIndex = BOOK1_MOMENTS.findIndex((moment) => moment.id === momentId);
  if (momentId === "ch6-barry-packing-crossbow") return "transition";
  if (momentIndex >= 0 && transitionIndex >= 0 && momentIndex < transitionIndex) return "ordinary";
  return "enchanted-ordinary";
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
  return BOOK1_MOMENTS;
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

function assertMomentReferenceRules(moment) {
  if (moment.characters.includes("arraka")) {
    throw new Error(`${moment.id} must represent Arraka through the amulet/aura, not as an attached character reference`);
  }
  if (moment.characters.includes("flower") && moment.characters.includes("illuna")) {
    throw new Error(`${moment.id} must choose either Flower or Illuna as the visible shared-body state, not both`);
  }
}

function assertKnownScene(moment, sceneIndex) {
  const sceneIds = sceneIndex.get(moment.chapterId);
  if (!sceneIds?.has(moment.triggerSceneId)) {
    throw new Error(`Book 1 visual moment ${moment.id} references unknown scene ${moment.chapterId}/${moment.triggerSceneId}`);
  }
}

function sharedBodyAndAmuletNotes(moment) {
  const characterIds = moment.characters;
  const notes = [];
  const hasFlower = characterIds.includes("flower");
  const hasIlluna = characterIds.includes("illuna");
  if (hasFlower || hasIlluna) {
    notes.push(
      "Flower and Illuna (aka Petal) share one little girl's body; never show them as two separate visible people in the same moment.",
    );
  }
  if (momentMentionsArraka(moment)) {
    notes.push("Arraka is represented through Flower/Illuna's golden amulet or its aura, never as a separate visible body.");
  }
  return notes;
}

function momentMentionsArraka(moment) {
  const text = [
    ...(moment.settingFacts ?? []),
    ...(moment.actionFacts ?? []),
    ...(moment.materialDetails ?? []),
    ...(moment.unnamedCharacters ?? []),
    ...(moment.composition ?? []),
    ...(moment.timelineOverrides ?? []),
    ...(moment.pathCompatibility ?? []),
    ...(moment.avoid ?? []),
  ].join(" ");
  return /\bArraka\b/i.test(text);
}

function renderApiPrompt(moment, charactersById, sheets) {
  const specialNotes = sharedBodyAndAmuletNotes(moment);
  const barryEquipmentNotes = barryEquipmentContinuityNotes(moment);

  return [
    `Create one Book 1 moment illustration for Magium: ${moment.title}.`,
    "",
    "Attached reference sheets:",
    ...sheets.flatMap((sheet) => [
      `- \`${path.basename(sheet.file)}\`:`,
      ...sheet.references.map((reference) => `  - ${reference.position} = ${reference.name} (${reference.id})`),
    ]),
    "",
    "Use the reference sheets for stable identity, species, body shape, clothing and magical aura. Do not copy the sheet layout into the final image; create one coherent 16:9 scene.",
    "",
    "Scene-specific overrides:",
    ...moment.timelineOverrides.map((fact) => `- ${fact}`),
    ...(moment.pathCompatibility?.length ? ["", "Path compatibility:", ...moment.pathCompatibility.map((fact) => `- ${fact}`)] : []),
    ...(barryEquipmentNotes.length ? ["", "Barry equipment continuity:", ...barryEquipmentNotes.map((fact) => `- ${fact}`)] : []),
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
  ].join("\n");
}

async function renderReferenceSheet(references, target) {
  if (references.length < 1 || references.length > 4) {
    throw new Error(`A reference sheet must contain 1 to 4 references, got ${references.length}`);
  }

  const { width, height, cellWidth, cellHeight } = sheetGeometry(references.length);
  const args = ["-y", "-f", "lavfi", "-i", `color=c=0x161616:s=${width}x${height}`];
  for (const reference of references) {
    args.push("-i", reference.source);
  }

  const filters = [];
  for (let index = 0; index < references.length; index += 1) {
    filters.push(
      `[${index + 1}:v]scale=${cellWidth}:${cellHeight}:force_original_aspect_ratio=decrease,pad=${cellWidth}:${cellHeight}:(ow-iw)/2:(oh-ih)/2:color=0x202020[ref${index}]`,
    );
  }

  let base = "[0:v]";
  for (let index = 0; index < references.length; index += 1) {
    const position = sheetCoordinates(index, references.length, cellWidth, cellHeight);
    const output = index === references.length - 1 ? "[out]" : `[tmp${index}]`;
    filters.push(`${base}[ref${index}]overlay=${position.x}:${position.y}${output}`);
    base = output;
  }

  await ensureDir(path.dirname(target));
  await runFfmpeg([
    ...args,
    "-filter_complex",
    filters.join(";"),
    "-map",
    "[out]",
    "-frames:v",
    "1",
    "-c:v",
    "libwebp",
    "-quality",
    "90",
    "-compression_level",
    "6",
    target,
  ]);
  await assertWebp(target);
}

function sheetGeometry(count) {
  if (count === 1) return { width: 1024, height: 1024, cellWidth: 1024, cellHeight: 1024 };
  if (count === 2) return { width: REFERENCE_SHEET_SIZE, height: REFERENCE_SHEET_CELL_SIZE, cellWidth: REFERENCE_SHEET_CELL_SIZE, cellHeight: REFERENCE_SHEET_CELL_SIZE };
  return { width: REFERENCE_SHEET_SIZE, height: REFERENCE_SHEET_SIZE, cellWidth: REFERENCE_SHEET_CELL_SIZE, cellHeight: REFERENCE_SHEET_CELL_SIZE };
}

function sheetCoordinates(index, count, cellWidth, cellHeight) {
  if (count === 1) return { x: 0, y: 0 };
  return {
    x: index % 2 === 0 ? 0 : cellWidth,
    y: index < 2 ? 0 : cellHeight,
  };
}

function sheetPosition(index) {
  return ["top-left", "top-right", "bottom-left", "bottom-right"][index];
}

function assertImageOptions({ quality, size }) {
  if (!VALID_IMAGE_QUALITIES.has(quality)) {
    throw new Error(`Unsupported image quality "${quality}". Expected one of: ${[...VALID_IMAGE_QUALITIES].join(", ")}`);
  }
  if (!VALID_IMAGE_SIZES.has(size)) {
    throw new Error(`Unsupported image size "${size}". Expected one of: ${[...VALID_IMAGE_SIZES].join(", ")}`);
  }
}

async function firstExisting(files) {
  for (const file of files) {
    if (await pathExists(file)) return file;
  }
  return null;
}

async function runFfmpeg(args) {
  await new Promise((resolve, reject) => {
    const child = spawn("ffmpeg", args, { stdio: ["ignore", "pipe", "pipe"] });
    let stderr = "";
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`ffmpeg failed with exit code ${code}: ${stderr.trim()}`));
      }
    });
  });
}

async function editImageSync({ apiKey, prompt, imageFiles, quality, size }) {
  const form = new FormData();
  form.append("model", "gpt-image-2");
  form.append("prompt", prompt);
  form.append("n", "1");
  form.append("quality", quality);
  form.append("size", size);
  form.append("output_format", "webp");
  for (const imageFile of imageFiles) {
    const buffer = await fs.readFile(imageFile);
    form.append("image[]", new Blob([buffer], { type: "image/webp" }), path.basename(imageFile));
  }

  const response = await fetch("https://api.openai.com/v1/images/edits", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}` },
    body: form,
  });
  const body = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(`OpenAI image edit failed ${response.status}: ${JSON.stringify(body)}`);
  }
  const imageBase64 = body?.data?.[0]?.b64_json;
  if (!imageBase64) {
    throw new Error(`OpenAI image edit response did not include data[0].b64_json: ${JSON.stringify(body)}`);
  }
  return imageBase64;
}

async function uploadOpenAiFile({ apiKey, file, purpose }) {
  const form = new FormData();
  const buffer = await fs.readFile(file);
  form.append("purpose", purpose);
  form.append("file", new Blob([buffer], { type: "application/jsonl" }), path.basename(file));
  const response = await fetch("https://api.openai.com/v1/files", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}` },
    body: form,
  });
  const body = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(`OpenAI file upload failed ${response.status}: ${JSON.stringify(body)}`);
  }
  return body;
}

async function openAiJson({ apiKey, pathName, method = "GET", body }) {
  const response = await fetch(`https://api.openai.com${pathName}`, {
    method,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(`OpenAI request failed ${response.status} ${pathName}: ${JSON.stringify(json)}`);
  }
  return json;
}

async function downloadOpenAiFileContent({ apiKey, fileId }) {
  const response = await fetch(`https://api.openai.com/v1/files/${fileId}/content`, {
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`OpenAI file download failed ${response.status}: ${text}`);
  }
  return text;
}

function summarizeBatchErrorText(errorText) {
  const firstLine = errorText.split(/\n+/).find(Boolean);
  if (!firstLine) return "empty error file";
  try {
    const parsed = JSON.parse(firstLine);
    return parsed.response?.body?.error?.message ?? parsed.error?.message ?? JSON.stringify(parsed).slice(0, 400);
  } catch {
    return firstLine.slice(0, 400);
  }
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
