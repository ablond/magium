import fs from "node:fs/promises";
import path from "node:path";
import { CANONICAL_ROOT } from "./constants.mjs";
import { latestArchiveRoot, readJson } from "./utils.mjs";

async function main() {
  const archiveRoot = await latestArchiveRoot();
  const archiveManifest = await readJson(path.join(archiveRoot, "manifest.json"));
  const magiumCount = archiveManifest.files.filter((entry) => entry.path.endsWith(".magium")).length;
  if (magiumCount !== 54) {
    throw new Error(`Expected 54 archived .magium files, found ${magiumCount}`);
  }

  const index = await readJson(path.join(CANONICAL_ROOT, "index.json"));
  const achievementCatalog = await readJson(path.join(CANONICAL_ROOT, "achievements.json"));
  const achievementLocale = await readJson(path.join(CANONICAL_ROOT, "locales/en/achievements.json"));
  const achievementIds = new Set(achievementCatalog.achievements.map((achievement) => achievement.id));
  const generated = await fs.readFile(path.resolve("src/generated/contentPacks.ts"), "utf8");

  await validateUiLocales(index, generated);
  await validateStoryLocales(index, achievementLocale, generated);

  for (const achievement of achievementCatalog.achievements) {
    assertMessage(achievementLocale.messages, achievement.titleMessageId, "achievement title");
    assertMessage(achievementLocale.messages, achievement.captionMessageId, "achievement caption");
  }

  for (const chapter of index.chapters) {
    const story = await readJson(path.join(CANONICAL_ROOT, "story", `${chapter.id}.json`));
    const locale = await readJson(path.join(CANONICAL_ROOT, "locales/en", `${chapter.id}.json`));
    const localScenes = new Set(story.sceneOrder);

    for (const sceneId of story.sceneOrder) {
      const scene = story.scenes[sceneId];
      if (!scene) {
        throw new Error(`${chapter.id}: scene order references missing scene ${sceneId}`);
      }
      for (const block of scene.blocks) {
        assertMessage(locale.messages, block.messageId, `${chapter.id}/${sceneId} paragraph`);
      }
      for (const choice of scene.choices) {
        assertMessage(locale.messages, choice.messageId, `${chapter.id}/${sceneId} choice`);
        assertAssignments(choice.setVariables, `${chapter.id}/${sceneId} choice ${choice.id}`);
        if (!choice.target && !choice.special) {
          throw new Error(`${chapter.id}/${sceneId}: choice ${choice.id} has no target or special`);
        }
        if (choice.target && !index.sceneToChapter[choice.target]) {
          throw new Error(`${chapter.id}/${sceneId}: choice ${choice.id} targets missing scene ${choice.target}`);
        }
        if (typeof choice.special === "string" && choice.special.includes(") if ")) {
          throw new Error(`${chapter.id}/${sceneId}: choice ${choice.id} has a condition embedded in special`);
        }
      }
      assertAssignments(scene.setVariables, `${chapter.id}/${sceneId} scene assignments`);
      for (const achievement of scene.achievements) {
        assertMessage(locale.messages, achievement.messageId, `${chapter.id}/${sceneId} scene achievement`);
        if (!achievementIds.has(achievement.variable)) {
          throw new Error(`${chapter.id}/${sceneId}: unknown achievement variable ${achievement.variable}`);
        }
      }
    }

    if (localScenes.size !== Object.keys(story.scenes).length) {
      throw new Error(`${chapter.id}: scene order and scene map length mismatch`);
    }
  }

  if (generated.includes("ID: Ch1-Intro1") || generated.includes(".magium")) {
    throw new Error("Generated runtime content appears to contain raw .magium text");
  }

  console.log(`Content validated: ${index.chapters.length} chapters, ${achievementCatalog.achievements.length} achievements`);
}

async function validateStoryLocales(index, achievementLocale, generated) {
  if (!Array.isArray(index.storyLocales) || index.storyLocales.length === 0) {
    throw new Error("Index must declare storyLocales");
  }
  if (!index.storyLocales.includes("en")) {
    throw new Error("Index storyLocales must include en");
  }

  const baseStats = await readJson(path.join(CANONICAL_ROOT, "locales/en/stats.json"));
  validateLocaleBundle(baseStats, "en stats");
  const baseStatKeys = Object.keys(baseStats.messages).sort();
  const chapterIds = new Set(index.chapters.map((chapter) => chapter.id));
  const achievementKeys = Object.keys(achievementLocale.messages).sort();

  for (const locale of index.storyLocales) {
    const stats = await readJson(path.join(CANONICAL_ROOT, "locales", locale, "stats.json"));
    validateLocaleBundle(stats, `${locale} stats`);
    if (stats.locale !== locale) {
      throw new Error(`${locale} stats bundle declares locale ${stats.locale}`);
    }
    assertSameMessageKeys(baseStatKeys, Object.keys(stats.messages).sort(), `${locale} stats`);
    assertGeneratedPack(generated, `locales/${locale}/stats`);

    if (locale === "en") continue;

    const localeRoot = path.join(CANONICAL_ROOT, "locales", locale);
    const files = (await fs.readdir(localeRoot))
      .filter((file) => file.endsWith(".json"))
      .sort();

    for (const file of files) {
      const bundleName = file.replace(/\.json$/, "");
      if (bundleName === "ui" || bundleName === "stats") continue;

      const bundle = await readJson(path.join(localeRoot, file));
      validateLocaleBundle(bundle, `${locale}/${bundleName}`);
      if (bundle.locale !== locale) {
        throw new Error(`${locale}/${bundleName} declares locale ${bundle.locale}`);
      }

      if (bundleName === "achievements") {
        assertSubsetMessageKeys(achievementKeys, Object.keys(bundle.messages).sort(), `${locale} achievements`);
      } else {
        if (!chapterIds.has(bundleName)) {
          throw new Error(`${locale}/${file} is not a known chapter locale`);
        }
        if (bundle.chapterId !== bundleName) {
          throw new Error(`${locale}/${file} declares chapterId ${bundle.chapterId}`);
        }
        const base = await readJson(path.join(CANONICAL_ROOT, "locales/en", file));
        assertSameMessageKeys(Object.keys(base.messages).sort(), Object.keys(bundle.messages).sort(), `${locale}/${bundleName}`);
      }
      assertGeneratedPack(generated, `locales/${locale}/${bundleName}`);
    }
  }
}

async function validateUiLocales(index, generated) {
  if (!Array.isArray(index.uiLocales) || index.uiLocales.length === 0) {
    throw new Error("Index must declare uiLocales");
  }
  if (!index.uiLocales.includes("en")) {
    throw new Error("Index uiLocales must include en");
  }

  const base = await readJson(path.join(CANONICAL_ROOT, "locales/en/ui.json"));
  validateLocaleBundle(base, "en UI");
  const baseKeys = Object.keys(base.messages).sort();

  for (const locale of index.uiLocales) {
    const bundle = await readJson(path.join(CANONICAL_ROOT, "locales", locale, "ui.json"));
    validateLocaleBundle(bundle, `${locale} UI`);
    if (bundle.locale !== locale) {
      throw new Error(`${locale} UI bundle declares locale ${bundle.locale}`);
    }
    assertSameMessageKeys(baseKeys, Object.keys(bundle.messages).sort(), `${locale} UI`);
    assertGeneratedPack(generated, `locales/${locale}/ui`);
  }
}

function validateLocaleBundle(bundle, context) {
  if (!bundle.messages || typeof bundle.messages !== "object" || Array.isArray(bundle.messages)) {
    throw new Error(`${context} locale must contain a messages object`);
  }
  for (const [key, value] of Object.entries(bundle.messages)) {
    if (typeof value !== "string") {
      throw new Error(`${context} message ${key} must be a string`);
    }
  }
}

function assertSameMessageKeys(expected, actual, context) {
  const missing = expected.filter((key) => !actual.includes(key));
  const extra = actual.filter((key) => !expected.includes(key));
  if (missing.length || extra.length) {
    throw new Error(`${context} keys mismatch: missing [${missing.join(", ")}], extra [${extra.join(", ")}]`);
  }
}

function assertSubsetMessageKeys(expected, actual, context) {
  const missingFromBase = actual.filter((key) => !expected.includes(key));
  if (missingFromBase.length) {
    throw new Error(`${context} contains unknown keys [${missingFromBase.join(", ")}]`);
  }
}

function assertGeneratedPack(generated, key) {
  if (!generated.includes(JSON.stringify(key))) {
    throw new Error(`Missing generated content pack ${key}`);
  }
}

function assertAssignments(assignments, context) {
  if (!Array.isArray(assignments)) {
    throw new Error(`${context} assignments must be an array`);
  }
  for (const assignment of assignments) {
    if (!assignment || typeof assignment !== "object" || Array.isArray(assignment)) {
      throw new Error(`${context} contains invalid assignment`);
    }
    if (typeof assignment.variable !== "string" || !assignment.variable) {
      throw new Error(`${context} contains assignment without a variable`);
    }
    if (assignment.mode !== "set" && assignment.mode !== "add") {
      throw new Error(`${context} assignment for ${assignment.variable} must declare mode set/add`);
    }
    if (assignment.mode === "add" && typeof assignment.value !== "number") {
      throw new Error(`${context} assignment for ${assignment.variable} adds a non-numeric value`);
    }
    if (typeof assignment.value === "string" && assignment.value.includes(") if ")) {
      throw new Error(`${context} assignment for ${assignment.variable} has a condition embedded in its value`);
    }
  }
}

function assertMessage(messages, id, context) {
  if (!Object.prototype.hasOwnProperty.call(messages, id)) {
    throw new Error(`Missing ${context} message: ${id}`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
