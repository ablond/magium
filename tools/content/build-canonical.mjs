import fs from "node:fs/promises";
import path from "node:path";
import zlib from "node:zlib";
import {
  CANONICAL_ROOT,
  DEFAULT_LOCALE,
  GENERATED_ROOT,
  INITIAL_SCENE_ID,
  RUNTIME_FORMAT_VERSION,
  STORY_LOCALES_ROOT,
  UI_LOCALES_ROOT,
} from "./constants.mjs";
import { chapterIdFromFileName, chapterKeyFromFileName, parseMagiumChapter } from "./parser.mjs";
import {
  base64,
  ensureDir,
  latestArchivePointer,
  latestArchiveRoot,
  naturalCompare,
  readJson,
  sha256Hex,
  stableStringify,
  writeJson,
  writeText,
} from "./utils.mjs";

const BOOK1_ENDING_SCENE_ID = "Ch11b-Ending";
const BOOK1_CREDITS_SCENE_ID = "Ch11b-Credits";
const BOOK2_INTRO_SCENE_ID = "B2-Ch01a-Intro";
const BOOK1_TO_BOOK2_ASSIGNMENTS = [
  { variable: "v_b1_saved_stats", mode: "set", value: 1 },
  { variable: "v_current_scene", mode: "set", value: BOOK2_INTRO_SCENE_ID },
  { variable: "v_chapter_save_counter", mode: "set", value: 5 },
  { variable: "v_checkpoint_rich", mode: "set", value: 1 },
];

async function main() {
  const archiveRoot = await latestArchiveRoot();
  const pointer = await latestArchivePointer();
  const chaptersRoot = path.join(archiveRoot, "chapters");
  const chapterFiles = (await fs.readdir(chaptersRoot))
    .filter((file) => file.endsWith(".magium"))
    .sort(naturalCompare);

  if (chapterFiles.length !== 54) {
    throw new Error(`Expected 54 .magium files, found ${chapterFiles.length}`);
  }

  await fs.rm(CANONICAL_ROOT, { recursive: true, force: true });
  await ensureDir(path.join(CANONICAL_ROOT, "story"));
  await ensureDir(path.join(CANONICAL_ROOT, "locales", DEFAULT_LOCALE));

  const contentVersion = `${pointer.sourceCommit.slice(0, 12)}-v${RUNTIME_FORMAT_VERSION}`;
  const index = {
    formatVersion: RUNTIME_FORMAT_VERSION,
    contentVersion,
    sourceCommit: pointer.sourceCommit,
    defaultLocale: DEFAULT_LOCALE,
    initialSceneId: INITIAL_SCENE_ID,
    uiLocales: [],
    storyLocales: [DEFAULT_LOCALE],
    chapters: [],
    sceneToChapter: {},
  };

  for (const fileName of chapterFiles) {
    const chapterId = chapterIdFromFileName(fileName);
    const sourceFile = `chapters/${fileName}`;
    const source = await fs.readFile(path.join(chaptersRoot, fileName), "utf8");
    const parsed = parseMagiumChapter(source, { chapterId, sourceFile });
    applyRuntimeContentAdaptations(parsed, { chapterId, sourceFile });

    index.chapters.push({
      id: chapterId,
      key: chapterKeyFromFileName(fileName),
      sourceFile,
      sceneCount: parsed.story.sceneOrder.length,
    });

    for (const sceneId of parsed.story.sceneOrder) {
      if (index.sceneToChapter[sceneId]) {
        throw new Error(`Duplicate scene id across chapters: ${sceneId}`);
      }
      index.sceneToChapter[sceneId] = chapterId;
    }

    await writeJson(path.join(CANONICAL_ROOT, "story", `${chapterId}.json`), parsed.story);
    await writeJson(path.join(CANONICAL_ROOT, "locales", DEFAULT_LOCALE, `${chapterId}.json`), {
      locale: DEFAULT_LOCALE,
      chapterId,
      messages: parsed.messages,
    });
  }

  const { achievements, achievementMessages } = await parseAchievements(archiveRoot);
  await writeJson(path.join(CANONICAL_ROOT, "achievements.json"), {
    formatVersion: RUNTIME_FORMAT_VERSION,
    achievements,
  });
  await writeJson(path.join(CANONICAL_ROOT, "locales", DEFAULT_LOCALE, "achievements.json"), {
    locale: DEFAULT_LOCALE,
    messages: achievementMessages,
  });

  index.uiLocales = await writeCanonicalUiLocales();
  const storyLocalePacks = await writeCanonicalStoryLocales(index);

  await writeJson(path.join(CANONICAL_ROOT, "index.json"), index);
  await writeRuntimePacks({ index, chapterFiles, uiLocales: index.uiLocales, storyLocalePacks });

  console.log(`Canonical content generated for ${chapterFiles.length} chapters`);
}

function applyRuntimeContentAdaptations(parsed, { chapterId, sourceFile }) {
  if (chapterId === "ch11b") {
    pruneBook1CreditsGate(parsed, sourceFile);
  }
}

function pruneBook1CreditsGate(parsed, sourceFile) {
  const { story, messages } = parsed;
  const ending = story.scenes[BOOK1_ENDING_SCENE_ID];
  const credits = story.scenes[BOOK1_CREDITS_SCENE_ID];
  if (!ending || !credits) {
    throw new Error(`${sourceFile}: expected Book 1 ending and credits scenes before pruning`);
  }
  if (ending.choices.length !== 1 || ending.choices[0].target !== BOOK1_CREDITS_SCENE_ID) {
    throw new Error(`${sourceFile}: expected ${BOOK1_ENDING_SCENE_ID} to lead only to ${BOOK1_CREDITS_SCENE_ID}`);
  }

  const proceedChoice = credits.choices.find((choice) =>
    choice.target === BOOK2_INTRO_SCENE_ID && choice.special === "checkpoint_save"
  );
  if (!proceedChoice) {
    throw new Error(`${sourceFile}: expected ${BOOK1_CREDITS_SCENE_ID} to contain a checkpoint transition to book 2`);
  }
  assertAssignmentsEqual(
    proceedChoice.setVariables,
    BOOK1_TO_BOOK2_ASSIGNMENTS,
    `${sourceFile}: unexpected Book 1 to Book 2 transition assignments`,
  );

  const endingChoice = ending.choices[0];
  endingChoice.target = proceedChoice.target;
  endingChoice.setVariables = proceedChoice.setVariables.map((assignment) => ({ ...assignment }));
  endingChoice.special = proceedChoice.special;
  messages[endingChoice.messageId] = messages[proceedChoice.messageId] ?? messages[endingChoice.messageId];

  story.sceneOrder = story.sceneOrder.filter((sceneId) => sceneId !== BOOK1_CREDITS_SCENE_ID);
  delete story.scenes[BOOK1_CREDITS_SCENE_ID];

  for (const block of credits.blocks) {
    delete messages[block.messageId];
  }
  for (const choice of credits.choices) {
    delete messages[choice.messageId];
  }
  for (const achievement of credits.achievements) {
    delete messages[achievement.messageId];
  }
}

function assertAssignmentsEqual(actual, expected, context) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(context);
  }
}

async function writeCanonicalUiLocales() {
  const files = (await fs.readdir(UI_LOCALES_ROOT))
    .filter((file) => file.endsWith(".json"))
    .sort(naturalCompare);
  const locales = [];

  for (const file of files) {
    const locale = file.replace(/\.json$/, "");
    const bundle = await readJson(path.join(UI_LOCALES_ROOT, file));
    if (bundle.locale !== locale) {
      throw new Error(`UI locale ${file} declares locale "${bundle.locale}"`);
    }
    if (!bundle.messages || typeof bundle.messages !== "object" || Array.isArray(bundle.messages)) {
      throw new Error(`UI locale ${file} must contain a messages object`);
    }
    await ensureDir(path.join(CANONICAL_ROOT, "locales", locale));
    await writeJson(path.join(CANONICAL_ROOT, "locales", locale, "ui.json"), bundle);
    locales.push(locale);
  }

  if (!locales.includes(DEFAULT_LOCALE)) {
    throw new Error(`Missing default UI locale ${DEFAULT_LOCALE}`);
  }

  return [
    DEFAULT_LOCALE,
    ...locales.filter((locale) => locale !== DEFAULT_LOCALE),
  ];
}

async function writeCanonicalStoryLocales(index) {
  const packs = [];
  const entries = await fs.readdir(STORY_LOCALES_ROOT, { withFileTypes: true }).catch((error) => {
    if (error.code === "ENOENT") return [];
    throw error;
  });
  const localeDirs = entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort(naturalCompare);
  const storyLocales = new Set([DEFAULT_LOCALE]);
  const chapterIds = new Set(index.chapters.map((chapter) => chapter.id));

  for (const locale of localeDirs) {
    const localeRoot = path.join(STORY_LOCALES_ROOT, locale);
    const files = (await fs.readdir(localeRoot))
      .filter((file) => file.endsWith(".json"))
      .sort(naturalCompare);
    if (!files.length) continue;

    await ensureDir(path.join(CANONICAL_ROOT, "locales", locale));

    for (const file of files) {
      const bundleName = file.replace(/\.json$/, "");
      if (locale === DEFAULT_LOCALE && bundleName !== "stats") {
        throw new Error(`Default story locale source may only override stats, got ${locale}/${file}`);
      }
      if (!["achievements", "stats"].includes(bundleName) && !chapterIds.has(bundleName)) {
        throw new Error(`Unknown story locale bundle ${locale}/${file}`);
      }
      const bundle = await readJson(path.join(localeRoot, file));
      if (bundle.locale !== locale) {
        throw new Error(`Story locale ${locale}/${file} declares locale "${bundle.locale}"`);
      }
      if (bundleName !== "achievements" && bundleName !== "stats" && bundle.chapterId !== bundleName) {
        throw new Error(`Story locale ${locale}/${file} declares chapterId "${bundle.chapterId}"`);
      }
      if (!bundle.messages || typeof bundle.messages !== "object" || Array.isArray(bundle.messages)) {
        throw new Error(`Story locale ${locale}/${file} must contain a messages object`);
      }

      await writeJson(path.join(CANONICAL_ROOT, "locales", locale, file), bundle);
      packs.push(`locales/${locale}/${bundleName}`);
      storyLocales.add(locale);
    }
  }

  index.storyLocales = [
    DEFAULT_LOCALE,
    ...[...storyLocales].filter((locale) => locale !== DEFAULT_LOCALE).sort(naturalCompare),
  ];
  return packs;
}

async function parseAchievements(archiveRoot) {
  const chaptersRoot = path.join(archiveRoot, "chapters");
  const files = ["achievements1.json", "achievements2.json", "achievements3.json"];
  const achievements = [];
  const achievementMessages = {};

  for (const file of files) {
    const raw = await readJson(path.join(chaptersRoot, file));
    for (const [chapterKey, chapterAchievements] of Object.entries(raw)) {
      for (const achievement of chapterAchievements) {
        const id = achievement.variable;
        achievements.push({
          id,
          variable: achievement.variable,
          chapterKey,
          titleMessageId: `achievement.${id}.title`,
          captionMessageId: `achievement.${id}.caption`,
        });
        achievementMessages[`achievement.${id}.title`] = achievement.title;
        achievementMessages[`achievement.${id}.caption`] = achievement.caption;
      }
    }
  }

  return { achievements, achievementMessages };
}

async function writeRuntimePacks({ index, chapterFiles, uiLocales, storyLocalePacks }) {
  await fs.rm(GENERATED_ROOT, { recursive: true, force: true });
  await ensureDir(path.join(GENERATED_ROOT, "packs"));
  const entries = [];
  await writePackModule("index", await packFile(path.join(CANONICAL_ROOT, "index.json")));
  entries.push("index");
  await writePackModule("achievements", await packFile(path.join(CANONICAL_ROOT, "achievements.json")));
  entries.push("achievements");
  for (const locale of uiLocales) {
    await writePackModule(`locales/${locale}/ui`, await packFile(
      path.join(CANONICAL_ROOT, "locales", locale, "ui.json"),
    ));
    entries.push(`locales/${locale}/ui`);
  }
  await writePackModule("locales/en/achievements", await packFile(
    path.join(CANONICAL_ROOT, "locales", DEFAULT_LOCALE, "achievements.json"),
  ));
  entries.push("locales/en/achievements");
  for (const key of storyLocalePacks) {
    await writePackModule(key, await packFile(path.join(CANONICAL_ROOT, `${key}.json`)));
    entries.push(key);
  }

  for (const fileName of chapterFiles) {
    const chapterId = chapterIdFromFileName(fileName);
    await writePackModule(`story/${chapterId}`, await packFile(path.join(CANONICAL_ROOT, "story", `${chapterId}.json`)));
    entries.push(`story/${chapterId}`);
    await writePackModule(`locales/en/${chapterId}`, await packFile(
      path.join(CANONICAL_ROOT, "locales", DEFAULT_LOCALE, `${chapterId}.json`),
    ));
    entries.push(`locales/en/${chapterId}`);
  }

  const loaderLines = entries.map((key) =>
    `  ${JSON.stringify(key)}: () => import('./packs/${safePackName(key)}').then((module) => module.PACKAGE),`,
  );
  const source = [
    "/* This file is generated by tools/content/build-canonical.mjs. Do not edit by hand. */",
    "export type RuntimePackage = { encoding: 'base64+gzip'; sha256: string; bytes: number; data: string }",
    `export const CONTENT_VERSION = ${JSON.stringify(index.contentVersion)}`,
    `export const RUNTIME_FORMAT_VERSION = ${RUNTIME_FORMAT_VERSION}`,
    "export const CONTENT_PACKAGE_LOADERS = {",
    ...loaderLines,
    "} as const satisfies Record<string, () => Promise<RuntimePackage>>",
    "export type ContentPackageKey = keyof typeof CONTENT_PACKAGE_LOADERS",
    "",
  ].join("\n");

  await writeText(path.join(GENERATED_ROOT, "contentPacks.ts"), source);
}

async function writePackModule(key, pack) {
  const source = [
    "import type { RuntimePackage } from '../contentPacks'",
    `export const PACKAGE = ${JSON.stringify(pack)} as const satisfies RuntimePackage`,
    "",
  ].join("\n");
  await writeText(path.join(GENERATED_ROOT, "packs", `${safePackName(key)}.ts`), source);
}

function safePackName(key) {
  return key.replace(/[^A-Za-z0-9_-]/g, "__");
}

async function packFile(filePath) {
  const parsed = JSON.parse(await fs.readFile(filePath, "utf8"));
  const canonical = Buffer.from(stableStringify(parsed));
  const compressed = zlib.gzipSync(canonical, { level: 9 });
  return {
    encoding: "base64+gzip",
    sha256: sha256Hex(compressed),
    bytes: compressed.byteLength,
    data: base64(compressed),
  };
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
