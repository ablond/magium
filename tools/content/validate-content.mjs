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
        if (!choice.target && !choice.special) {
          throw new Error(`${chapter.id}/${sceneId}: choice ${choice.id} has no target or special`);
        }
        if (choice.target && !index.sceneToChapter[choice.target]) {
          throw new Error(`${chapter.id}/${sceneId}: choice ${choice.id} targets missing scene ${choice.target}`);
        }
      }
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

  const generated = await fs.readFile(path.resolve("src/generated/contentPacks.ts"), "utf8");
  if (generated.includes("ID: Ch1-Intro1") || generated.includes(".magium")) {
    throw new Error("Generated runtime content appears to contain raw .magium text");
  }

  console.log(`Content validated: ${index.chapters.length} chapters, ${achievementCatalog.achievements.length} achievements`);
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
