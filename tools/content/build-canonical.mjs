import fs from "node:fs/promises";
import path from "node:path";
import zlib from "node:zlib";
import {
  CANONICAL_ROOT,
  DEFAULT_LOCALE,
  GENERATED_ROOT,
  INITIAL_SCENE_ID,
  RUNTIME_FORMAT_VERSION,
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
    chapters: [],
    sceneToChapter: {},
  };

  for (const fileName of chapterFiles) {
    const chapterId = chapterIdFromFileName(fileName);
    const sourceFile = `chapters/${fileName}`;
    const source = await fs.readFile(path.join(chaptersRoot, fileName), "utf8");
    const parsed = parseMagiumChapter(source, { chapterId, sourceFile });

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

  await writeJson(path.join(CANONICAL_ROOT, "index.json"), index);
  await writeRuntimePacks({ index, chapterFiles, achievements, achievementMessages });

  console.log(`Canonical content generated for ${chapterFiles.length} chapters`);
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

async function writeRuntimePacks({ index, chapterFiles }) {
  await fs.rm(GENERATED_ROOT, { recursive: true, force: true });
  await ensureDir(path.join(GENERATED_ROOT, "packs"));
  const entries = [];
  await writePackModule("index", await packFile(path.join(CANONICAL_ROOT, "index.json")));
  entries.push("index");
  await writePackModule("achievements", await packFile(path.join(CANONICAL_ROOT, "achievements.json")));
  entries.push("achievements");
  await writePackModule("locales/en/achievements", await packFile(
    path.join(CANONICAL_ROOT, "locales", DEFAULT_LOCALE, "achievements.json"),
  ));
  entries.push("locales/en/achievements");

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
