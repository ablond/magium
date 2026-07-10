import fs from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const book1FrenchChapters = ["ch1", "ch2", "ch3", "ch4", "ch5", "ch6", "ch7", "ch8", "ch9", "ch10", "ch11a", "ch11b"];
const book2FrenchChapters = [
  "b2ch1",
  "b2ch2",
  "b2ch3",
  "b2ch4a",
  "b2ch4b",
  "b2ch5a",
  "b2ch5b",
  "b2ch6",
  "b2ch7",
  "b2ch8",
  "b2ch9a",
  "b2ch9b",
  "b2ch10a",
  "b2ch10b",
  "b2ch11a",
  "b2ch11b",
  "b2ch11c",
];
const frenchChapters = [...book1FrenchChapters, ...book2FrenchChapters];

async function readJson(relativePath) {
  return JSON.parse(await fs.readFile(path.join(root, relativePath), "utf8"));
}

async function readAchievementKeys(achievementFiles) {
  const currentArchive = await readJson("content/archive/original/current.json");
  const keys = new Set();

  for (const achievementFile of achievementFiles) {
    const achievements = await readJson(`${currentArchive.archivePath}/chapters/${achievementFile}`);

    for (const chapterAchievements of Object.values(achievements)) {
      for (const achievement of chapterAchievements) {
        keys.add(`achievement.${achievement.variable}.caption`);
        keys.add(`achievement.${achievement.variable}.title`);
      }
    }
  }

  return [...keys].sort();
}

describe("generated content i18n", () => {
  it("generates French chapter locales with full key coverage", async () => {
    const index = await readJson("content/canonical/v1/index.json");
    const generated = await fs.readFile(path.join(root, "src/generated/contentPacks.ts"), "utf8");

    expect(index.storyLocales).toContain("fr");
    for (const chapterId of frenchChapters) {
      const en = await readJson(`content/canonical/v1/locales/en/${chapterId}.json`);
      const fr = await readJson(`content/canonical/v1/locales/fr/${chapterId}.json`);

      expect(fr.locale).toBe("fr");
      expect(fr.chapterId).toBe(chapterId);
      expect(Object.keys(fr.messages).sort()).toEqual(Object.keys(en.messages).sort());
      expect(generated).toContain(`"locales/fr/${chapterId}"`);
    }
  });

  it("prunes the obsolete Book 1 credits gate from runtime content", async () => {
    const index = await readJson("content/canonical/v1/index.json");
    const story = await readJson("content/canonical/v1/story/ch11b.json");
    const en = await readJson("content/canonical/v1/locales/en/ch11b.json");
    const fr = await readJson("content/canonical/v1/locales/fr/ch11b.json");
    const endingChoice = story.scenes["Ch11b-Ending"].choices[0];

    expect(index.sceneToChapter["Ch11b-Credits"]).toBeUndefined();
    expect(story.sceneOrder).not.toContain("Ch11b-Credits");
    expect(story.scenes["Ch11b-Credits"]).toBeUndefined();
    expect(Object.keys(en.messages).some((key) => key.includes("Ch11b_Credits"))).toBe(false);
    expect(Object.keys(fr.messages).some((key) => key.includes("Ch11b_Credits"))).toBe(false);

    expect(story.scenes["Ch11b-Ending"].choices).toHaveLength(1);
    expect(en.messages["ch11b.Ch11b_Ending.c1"]).toBe("Proceed to book 2");
    expect(fr.messages["ch11b.Ch11b_Ending.c1"]).toBe("Continuer vers le livre 2");
    expect(endingChoice.target).toBe("B2-Ch01a-Intro");
    expect(endingChoice.special).toBe("checkpoint_save");
    expect(endingChoice.setVariables).toEqual([
      { variable: "v_b1_saved_stats", mode: "set", value: 1 },
      { variable: "v_current_scene", mode: "set", value: "B2-Ch01a-Intro" },
      { variable: "v_chapter_save_counter", mode: "set", value: 5 },
      { variable: "v_checkpoint_rich", mode: "set", value: 1 },
    ]);
  });

  it("keeps the Book 2 lessathi refusal on the refusal outcome", async () => {
    const story = await readJson("content/canonical/v1/story/b2ch2.json");
    const refusal = story.scenes["B2-Ch02a-Soundproof"].choices.find(
      (choice) => choice.messageId === "b2ch2.B2_Ch02a_Soundproof.c3",
    );

    expect(refusal.setVariables).toContainEqual({ variable: "v_b2_ch2_deal", mode: "set", value: 2 });
  });

  it("keeps Book 2 stillwater, Still Winter, and Beacon terminology distinct", async () => {
    const winterMismatches = [];
    const malformedArtifacts = [];
    const malformedPattern = /\bde le (?:sans-aura|Beacon)\b|l['’]sans-aura\b|\bpendant le sans-aura\b/iu;

    for (const chapterId of book2FrenchChapters) {
      const en = await readJson(`content/canonical/v1/locales/en/${chapterId}.json`);
      const fr = await readJson(`content/canonical/v1/locales/fr/${chapterId}.json`);

      for (const [messageId, englishText] of Object.entries(en.messages)) {
        const frenchText = fr.messages[messageId];
        const englishWinterCount = (englishText.match(/\bstill winter\b/gi) ?? []).length;
        const frenchWinterCount = (frenchText.match(/Hiver immobile/g) ?? []).length;

        if (englishWinterCount !== frenchWinterCount) {
          winterMismatches.push({ chapterId, messageId, englishWinterCount, frenchWinterCount });
        }
        if (malformedPattern.test(frenchText)) {
          malformedArtifacts.push({ chapterId, messageId });
        }
      }
    }

    expect(winterMismatches).toEqual([]);
    expect(malformedArtifacts).toEqual([]);

    const b2ch2 = await readJson("content/canonical/v1/locales/fr/b2ch2.json");
    const b2ch6 = await readJson("content/canonical/v1/locales/fr/b2ch6.json");
    expect(b2ch2.messages["b2ch2.B2_Ch02a_Natural.p1"]).toContain("parler du Beacon of Hope");
    expect(b2ch2.messages["b2ch2.B2_Ch02a_Tunnels.p1"]).toContain("parlé du Beacon of Hope");
    expect(JSON.stringify(b2ch2.messages)).not.toMatch(/Lueur d['’]Espoir/);
    expect(b2ch6.messages["b2ch6.B2_Ch06a_Intro.p1"]).toContain(
      "Tu es cette sans-aura qui suivait constamment Eiden et la renarde pendant l’Hiver immobile !",
    );
  });

  it("generates complete stat locales and Book 1 and Book 2 French achievement overrides", async () => {
    const enStats = await readJson("content/canonical/v1/locales/en/stats.json");
    const frStats = await readJson("content/canonical/v1/locales/fr/stats.json");
    const frAchievements = await readJson("content/canonical/v1/locales/fr/achievements.json");
    const generated = await fs.readFile(path.join(root, "src/generated/contentPacks.ts"), "utf8");

    expect(Object.keys(frStats.messages).sort()).toEqual(Object.keys(enStats.messages).sort());
    expect(frStats.messages["stat.v_strength"]).toBe("Force");
    const expectedAchievementKeys = await readAchievementKeys(["achievements1.json", "achievements2.json"]);

    expect(Object.keys(frAchievements.messages).sort()).toEqual(expectedAchievementKeys);
    expect(frAchievements.messages["achievement.v_ac_ch6_immersion.title"]).toBe("Immersion totale");
    expect(frAchievements.messages["achievement.v_ac_ch6_immersion.caption"]).toBe("Vivre de tes propres yeux ce que voit ton personnage.");
    expect(frAchievements.messages["achievement.v_ac_b2_ch1_distance.title"]).toBe("Longue distance");
    expect(frAchievements.messages["achievement.v_ac_b2_ch8_trivia.title"]).toBe("Anecdotes sur les sans-aura");
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
    expect(enUi.messages["achievements.unlocked"]).toBe("Achievement unlocked");
    expect(frUi.messages["achievements.unlocked"]).toBe("Succès obtenu");
    expect(enUi.messages["statChecks.success"]).toContain("success");
    expect(enUi.messages["statChecks.failure"]).toContain("failure");
    expect(frUi.messages["statChecks.success"]).toContain("réussite");
    expect(frUi.messages["statChecks.failure"]).toContain("échec");
  });

  it("preserves Cutthroat Dave as a proper name in French story locales", async () => {
    const ch4 = await readJson("content/canonical/v1/locales/fr/ch4.json");
    const ch5 = await readJson("content/canonical/v1/locales/fr/ch5.json");
    const combined = JSON.stringify({ ch4: ch4.messages, ch5: ch5.messages });

    expect(combined).not.toMatch(/coupe-gorge/i);
    expect(ch4.messages["ch4.Ch4_Barry_vs_Dave.p1"]).toContain("Cutthroat");
    expect(ch4.messages["ch4.Ch4_Persuade.p1"]).toContain("Cutthroat Dave finir sa phrase");
    expect(ch5.messages["ch5.Ch5_Intro.p3"]).toContain("Où est Cutthroat Dave ?");
  });
});
