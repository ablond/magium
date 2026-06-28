import fs from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();

async function readJson(relativePath) {
  return JSON.parse(await fs.readFile(path.join(root, relativePath), "utf8"));
}

describe("generated content i18n", () => {
  it("generates French chapter locales with full key coverage", async () => {
    const index = await readJson("content/canonical/v1/index.json");
    const generated = await fs.readFile(path.join(root, "src/generated/contentPacks.ts"), "utf8");

    expect(index.storyLocales).toContain("fr");
    for (const chapterId of ["ch1", "ch2", "ch3"]) {
      const en = await readJson(`content/canonical/v1/locales/en/${chapterId}.json`);
      const fr = await readJson(`content/canonical/v1/locales/fr/${chapterId}.json`);

      expect(fr.locale).toBe("fr");
      expect(fr.chapterId).toBe(chapterId);
      expect(Object.keys(fr.messages).sort()).toEqual(Object.keys(en.messages).sort());
      expect(generated).toContain(`"locales/fr/${chapterId}"`);
    }
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
      "achievement.v_ac_ch2_master.caption",
      "achievement.v_ac_ch2_master.title",
      "achievement.v_ac_ch2_nails.caption",
      "achievement.v_ac_ch2_nails.title",
      "achievement.v_ac_ch2_talker.caption",
      "achievement.v_ac_ch2_talker.title",
      "achievement.v_ac_ch2_unlikely.caption",
      "achievement.v_ac_ch2_unlikely.title",
      "achievement.v_ac_ch3_army.caption",
      "achievement.v_ac_ch3_army.title",
      "achievement.v_ac_ch3_close.caption",
      "achievement.v_ac_ch3_close.title",
      "achievement.v_ac_ch3_message.caption",
      "achievement.v_ac_ch3_message.title",
    ]);
    expect(generated).toContain('"locales/fr/achievements"');
    expect(generated).toContain('"locales/fr/stats"');
  });

  it("uses Stats as the French player-facing label for the abilities panel", async () => {
    const enUi = await readJson("content/canonical/v1/locales/en/ui.json");
    const frUi = await readJson("content/canonical/v1/locales/fr/ui.json");

    expect(frUi.messages["nav.abilities"]).toBe("Stats");
    expect(frUi.messages["abilities.title"]).toBe("Stats");
    expect(frUi.messages["abilities.empty"]).toContain("Tes stats apparaîtront");
    expect(enUi.messages["abilities.help"]).toContain("Use +");
    expect(frUi.messages["abilities.help"]).toContain("Utilise +");
    expect(frUi.messages["abilities.help"]).not.toContain("route");
    expect(enUi.messages["statChecks.success"]).toContain("success");
    expect(enUi.messages["statChecks.failure"]).toContain("failure");
    expect(frUi.messages["statChecks.success"]).toContain("réussite");
    expect(frUi.messages["statChecks.failure"]).toContain("échec");
  });
});
