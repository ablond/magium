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
const book3FrenchChapters = [
  "b3ch1",
  "b3ch2a",
  "b3ch2b",
  "b3ch2c",
  "b3ch3a",
  "b3ch3b",
  "b3ch4a",
  "b3ch4b",
  "b3ch5a",
  "b3ch5b",
  "b3ch6a",
  "b3ch6b",
  "b3ch6c",
  "b3ch7a",
  "b3ch8a",
  "b3ch8b",
  "b3ch9a",
  "b3ch9b",
  "b3ch9c",
  "b3ch10a",
  "b3ch10b",
  "b3ch10c",
  "b3ch11a",
  "b3ch12a",
  "b3ch12b",
];
const frenchChapters = [...book1FrenchChapters, ...book2FrenchChapters, ...book3FrenchChapters];
const paragraphBreak = /\r?\n(?:[ \t]*\r?\n)+/;

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

  it("preserves Book 3 paragraph segmentation for targeted translation corrections", async () => {
    let messageCount = 0;
    let englishSegmentCount = 0;
    let frenchSegmentCount = 0;

    for (const chapterId of book3FrenchChapters) {
      const en = await readJson(`content/canonical/v1/locales/en/${chapterId}.json`);
      const fr = await readJson(`content/canonical/v1/locales/fr/${chapterId}.json`);
      expect(Object.keys(fr.messages), chapterId).toEqual(Object.keys(en.messages));
      expect(
        Object.entries(fr.messages).filter(
          ([, frenchText]) => typeof frenchText !== "string" || frenchText.trim() === "",
        ),
        chapterId,
      ).toEqual([]);
      for (const [messageId, frenchText] of Object.entries(fr.messages)) {
        expect(
          (frenchText.match(/«/g) ?? []).length,
          `${chapterId}/${messageId} outer guillemets`,
        ).toBe((frenchText.match(/»/g) ?? []).length);
        expect(
          (frenchText.match(/‹/g) ?? []).length,
          `${chapterId}/${messageId} inner guillemets`,
        ).toBe((frenchText.match(/›/g) ?? []).length);
      }
      messageCount += Object.keys(en.messages).length;

      for (const [messageId, englishText] of Object.entries(en.messages)) {
        if (!/\.p\d+$/.test(messageId)) continue;
        const englishSegments = englishText.split(paragraphBreak).filter((segment) => segment.trim());
        const frenchSegments = fr.messages[messageId].split(paragraphBreak).filter((segment) => segment.trim());
        englishSegmentCount += englishSegments.length;
        frenchSegmentCount += frenchSegments.length;
        expect(frenchSegments.length, `${chapterId}/${messageId}`).toBe(englishSegments.length);
      }
    }

    expect(messageCount).toBe(3_485);
    expect(englishSegmentCount).toBe(14_965);
    expect(frenchSegmentCount).toBe(14_965);
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
    const choices = story.scenes["B2-Ch02a-Soundproof"].choices;
    const lie = choices.find(
      (choice) => choice.messageId === "b2ch2.B2_Ch02a_Soundproof.c1",
    );
    const refusal = choices.find(
      (choice) => choice.messageId === "b2ch2.B2_Ch02a_Soundproof.c3",
    );

    expect(lie.setVariables).toContainEqual({ variable: "v_b2_ch2_deal", mode: "set", value: 1 });
    expect(refusal.setVariables).toContainEqual({ variable: "v_b2_ch2_deal", mode: "set", value: 2 });
    expect(refusal.target).toBe(lie.target);
  });

  it("keeps Book 2 and Book 3 stillwater, Still Winter, and Beacon terminology distinct", async () => {
    const winterMismatches = [];
    const book3StillwaterMismatches = [];
    const malformedArtifacts = [];
    const malformedPattern = /\bde le (?:sans-aura|Beacon)\b|l['’]sans-aura\b|\bpendant le sans-aura\b/iu;

    for (const chapterId of [...book2FrenchChapters, ...book3FrenchChapters]) {
      const en = await readJson(`content/canonical/v1/locales/en/${chapterId}.json`);
      const fr = await readJson(`content/canonical/v1/locales/fr/${chapterId}.json`);

      for (const [messageId, englishText] of Object.entries(en.messages)) {
        const frenchText = fr.messages[messageId];
        const englishWinterCount = (englishText.match(/\bstill winter\b/gi) ?? []).length;
        const frenchWinterCount = (frenchText.match(/Hiver immobile/g) ?? []).length;

        const isBook3 = book3FrenchChapters.includes(chapterId);
        if (
          (!isBook3 && englishWinterCount !== frenchWinterCount) ||
          (isBook3 && englishWinterCount > 0 && frenchWinterCount === 0)
        ) {
          winterMismatches.push({ chapterId, messageId, englishWinterCount, frenchWinterCount });
        }
        if (isBook3 && /\bstillwaters?\b/i.test(englishText) && !/sans-aura/i.test(frenchText)) {
          book3StillwaterMismatches.push({ chapterId, messageId });
        }
        if (malformedPattern.test(frenchText)) {
          malformedArtifacts.push({ chapterId, messageId });
        }
      }
    }

    expect(winterMismatches).toEqual([]);
    expect(book3StillwaterMismatches).toEqual([]);
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

  it("keeps Book 3 protocol and proper-name terminology stable", async () => {
    const mismatches = [];
    const glossaryTerms = [
      { source: /\bdwarven ale\b/i, target: /\bale naine\b/i, term: "dwarven ale" },
    ];

    for (const chapterId of book3FrenchChapters) {
      const en = await readJson(`content/canonical/v1/locales/en/${chapterId}.json`);
      const fr = await readJson(`content/canonical/v1/locales/fr/${chapterId}.json`);

      for (const [messageId, englishText] of Object.entries(en.messages)) {
        const frenchText = fr.messages[messageId];
        for (const { source, target, term } of glossaryTerms) {
          if (source.test(englishText) && !target.test(frenchText)) {
            mismatches.push({ chapterId, messageId, term });
          }
        }
        if (/\bbefore long\b/i.test(englishText) && /avant longtemps/i.test(frenchText)) {
          mismatches.push({ chapterId, messageId, term: "before long" });
        }
        const terms = ["Beacon of Hope", "Southern Continent", "Eastern Continent", "Northern Continent", "Western Continent", "seredium"];
        for (const term of terms) {
          const sourceCount = (englishText.match(new RegExp(`\\b${term}\\b`, "gi")) ?? []).length;
          const translatedCount = (frenchText.match(new RegExp(`\\b${term}\\b`, "gi")) ?? []).length;
          if (sourceCount > 0 && translatedCount === 0) {
            mismatches.push({ chapterId, messageId, term, sourceCount, translatedCount });
          }
        }

        const overseerCount = (englishText.match(/\boverseer\b/gi) ?? []).length;
        const supervisorCount = (frenchText.match(/\bSuperviseur\b/g) ?? []).length;
        if ((overseerCount > 0 && supervisorCount === 0) || /\boverseer\b/i.test(frenchText)) {
          mismatches.push({ chapterId, messageId, term: "Overseer/Superviseur", overseerCount, supervisorCount });
        }

        const overseerProtocolCount = (englishText.match(/\bOverseer protocol\b/gi) ?? []).length;
        const supervisorProtocolCount = (frenchText.match(/\bprotocole du Superviseur\b/gi) ?? []).length;
        if (overseerProtocolCount > 0 && supervisorProtocolCount === 0) {
          mismatches.push({ chapterId, messageId, term: "Overseer protocol", overseerProtocolCount, supervisorProtocolCount });
        }
      }
    }

    expect(mismatches).toEqual([]);

    const b3ch2b = await readJson("content/canonical/v1/locales/fr/b3ch2b.json");
    const b3ch2c = await readJson("content/canonical/v1/locales/fr/b3ch2c.json");
    const b3ch4a = await readJson("content/canonical/v1/locales/fr/b3ch4a.json");
    const b3ch9c = await readJson("content/canonical/v1/locales/fr/b3ch9c.json");
    const b3ch12a = await readJson("content/canonical/v1/locales/fr/b3ch12a.json");
    expect(b3ch2b.messages["b3ch2b.B3_Ch02b_Weird.p1"]).toContain("droons");
    expect(b3ch2c.messages["b3ch2c.B3_Ch02c_Alice.p1"]).toMatch(/\bdrowns\b[\s\S]*\bdroons\b[\s\S]*\bdrowns\b[\s\S]*\bdroynes\b/);
    expect(b3ch2c.messages["b3ch2c.B3_Ch02c_Transceiver.p1"]).toContain("émetteur");
    expect(b3ch4a.messages["b3ch4a.B3_Ch04a_Attention.p1"]).toMatch(/\bdroons\b[\s\S]*\bDRONES\b[\s\S]*\bdrones\b/);
    expect(b3ch9c.messages["b3ch9c.B3_Ch09c_Maintenance.p1"]).toContain("roi des souterrains");
    expect(b3ch9c.messages["b3ch9c.B3_Ch09c_Maintenance.p1"]).toContain("protocole du Superviseur");
    expect(b3ch12a.messages["b3ch12a.B3_Ch12a_Hermit.p1"]).toContain("plan éthéré");
    expect(b3ch12a.messages["b3ch12a.B3_Ch12a_Hermit.p1"]).toContain("appareil de stats");
    expect(b3ch12a.messages["b3ch12a.B3_Ch12a_Manner.p1"]).toContain("Renforcement d’aura");

    const combinedBook3 = JSON.stringify(
      await Promise.all(
        book3FrenchChapters.map(async (chapterId) =>
          (await readJson(`content/canonical/v1/locales/fr/${chapterId}.json`)).messages,
        ),
      ),
    );
    expect(combinedBook3).not.toMatch(/\b(?:amplificateur|dispositif) de stats\b/i);
    expect(combinedBook3).not.toMatch(/\bbière naine\b/i);
    expect(combinedBook3).not.toMatch(/\boverseer\b/i);
    expect(combinedBook3).not.toContain("'");
    expect(combinedBook3).not.toContain('\\"');
    expect(combinedBook3).not.toMatch(/[“”]/);
    expect(combinedBook3).not.toMatch(/\b[\p{L}]+é-je\b/u);
    expect(combinedBook3).not.toMatch(/\bréponds-je\b/i);
    expect(combinedBook3).not.toMatch(/(?<!-)--(?!-)/);
    expect(combinedBook3).not.toMatch(
      /vibr(?:e|ent|er|ant|ation)[^.?!\n]{0,100}bruyamment/iu,
    );
    expect(combinedBook3).not.toMatch(
      /vivre avec moi-même|(?:Oh,? |Mes )dieux|Vraiment, maintenant/i,
    );
    expect(combinedBook3).not.toMatch(
      /\b(?:mile|miles|yard|yards|feet|foot|inch|inches)\b/i,
    );
  });

  it("keeps repeated Book 3 player choices consistent", async () => {
    const repeatedChoices = new Map([
      ["Load from last checkpoint", "Charger depuis le dernier point de contrôle"],
      ["Load game", "Charger une partie"],
      ["Invest points now", "Investir les points maintenant"],
      [
        "Invest points later(by pressing the stats button on the top of the screen)",
        "Investir les points plus tard (en appuyant sur le bouton Stats en haut de l’écran)",
      ],
    ]);

    for (const chapterId of book3FrenchChapters) {
      const en = await readJson(`content/canonical/v1/locales/en/${chapterId}.json`);
      const fr = await readJson(`content/canonical/v1/locales/fr/${chapterId}.json`);

      for (const [messageId, englishText] of Object.entries(en.messages)) {
        const expectedFrench = repeatedChoices.get(englishText);
        if (expectedFrench === undefined) continue;
        expect(fr.messages[messageId], `${chapterId}/${messageId}`).toBe(expectedFrench);
      }
    }
  });

  it("generates complete stat locales and Book 1 through Book 3 French achievement overrides", async () => {
    const enStats = await readJson("content/canonical/v1/locales/en/stats.json");
    const frStats = await readJson("content/canonical/v1/locales/fr/stats.json");
    const frAchievements = await readJson("content/canonical/v1/locales/fr/achievements.json");
    const generated = await fs.readFile(path.join(root, "src/generated/contentPacks.ts"), "utf8");

    expect(Object.keys(frStats.messages).sort()).toEqual(Object.keys(enStats.messages).sort());
    expect(frStats.messages["stat.v_strength"]).toBe("Force");
    const expectedAchievementKeys = await readAchievementKeys(["achievements1.json", "achievements2.json", "achievements3.json"]);

    expect(Object.keys(frAchievements.messages).sort()).toEqual(expectedAchievementKeys);
    const book3AchievementKeys = await readAchievementKeys(["achievements3.json"]);
    const book3AchievementVariables = new Set(
      book3AchievementKeys.map((key) => key.replace(/^achievement\./, "").replace(/\.(?:caption|title)$/, "")),
    );
    const book3AchievementMessages = Object.fromEntries(
      book3AchievementKeys.map((key) => [key, frAchievements.messages[key]]),
    );
    expect(book3AchievementKeys).toHaveLength(106);
    expect(book3AchievementVariables.size).toBe(53);
    expect(
      Object.entries(book3AchievementMessages).filter(
        ([, value]) => typeof value !== "string" || value.trim() === "",
      ),
    ).toEqual([]);
    expect(JSON.stringify(book3AchievementMessages)).not.toContain("'");
    expect(frAchievements.messages["achievement.v_ac_ch6_immersion.title"]).toBe("Immersion totale");
    expect(frAchievements.messages["achievement.v_ac_ch6_immersion.caption"]).toBe("Vivre de tes propres yeux ce que voit ton personnage.");
    expect(frAchievements.messages["achievement.v_ac_b2_ch1_distance.title"]).toBe("Longue distance");
    expect(frAchievements.messages["achievement.v_ac_b2_ch8_trivia.title"]).toBe("Anecdotes sur les sans-aura");
    expect(frAchievements.messages["achievement.v_ac_b3_ch9_prize.title"]).toBe("Prix de consolation");
    expect(frAchievements.messages["achievement.v_ac_b3_ch9_targets.caption"]).toContain("Superviseur");
    expect(frAchievements.messages["achievement.v_ac_b3_ch12_dagger.title"]).toBe("One Dagger Man");
    expect(frAchievements.messages["achievement.v_ac_b3_ch12_average.title"]).toBe("(Plus que) Monsieur Tout-le-monde");
    expect(frAchievements.messages["achievement.v_ac_b3_ch9_consolation.title"]).toBeUndefined();
    expect(generated).toContain('"locales/fr/achievements"');
    expect(generated).toContain('"locales/fr/stats"');
  });

  it("uses the localized Book 3 achievement titles inside chapter messages", async () => {
    const frAchievements = await readJson("content/canonical/v1/locales/fr/achievements.json");
    let embeddedAchievementCount = 0;

    for (const chapterId of book3FrenchChapters) {
      const fr = await readJson(`content/canonical/v1/locales/fr/${chapterId}.json`);
      const story = await readJson(`content/canonical/v1/story/${chapterId}.json`);

      for (const scene of Object.values(story.scenes)) {
        for (const achievement of scene.achievements) {
          expect(fr.messages[achievement.messageId], `${chapterId}/${achievement.messageId}`).toBe(
            frAchievements.messages[`achievement.${achievement.variable}.title`],
          );
          embeddedAchievementCount += 1;
        }
      }
    }

    // v_ac_b3_ch9_prize is present in achievements3.json but intentionally absent
    // from the story graphs, so 52 of the 53 Book 3 titles are embedded in chapters.
    expect(embeddedAchievementCount).toBe(52);
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
