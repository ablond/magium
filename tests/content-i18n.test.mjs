import fs from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();

async function readJson(relativePath) {
  return JSON.parse(await fs.readFile(path.join(root, relativePath), "utf8"));
}

describe("generated content i18n", () => {
  it("generates the French chapter 1 locale with full key coverage", async () => {
    const index = await readJson("content/canonical/v1/index.json");
    const en = await readJson("content/canonical/v1/locales/en/ch1.json");
    const fr = await readJson("content/canonical/v1/locales/fr/ch1.json");
    const generated = await fs.readFile(path.join(root, "src/generated/contentPacks.ts"), "utf8");

    expect(index.storyLocales).toContain("fr");
    expect(fr.locale).toBe("fr");
    expect(fr.chapterId).toBe("ch1");
    expect(Object.keys(fr.messages).sort()).toEqual(Object.keys(en.messages).sort());
    expect(generated).toContain('"locales/fr/ch1"');
  });

  it("generates complete stat locales and partial French achievement overrides", async () => {
    const enStats = await readJson("content/canonical/v1/locales/en/stats.json");
    const frStats = await readJson("content/canonical/v1/locales/fr/stats.json");
    const frAchievements = await readJson("content/canonical/v1/locales/fr/achievements.json");
    const generated = await fs.readFile(path.join(root, "src/generated/contentPacks.ts"), "utf8");

    expect(Object.keys(frStats.messages).sort()).toEqual(Object.keys(enStats.messages).sort());
    expect(frStats.messages["stat.v_strength"]).toBe("Force");
    expect(Object.keys(frAchievements.messages).sort()).toEqual([
      "achievement.v_ac_ch1_coward.caption",
      "achievement.v_ac_ch1_coward.title",
      "achievement.v_ac_ch1_die.caption",
      "achievement.v_ac_ch1_die.title",
      "achievement.v_ac_ch1_honesty.caption",
      "achievement.v_ac_ch1_honesty.title",
    ]);
    expect(generated).toContain('"locales/fr/achievements"');
    expect(generated).toContain('"locales/fr/stats"');
  });
});
