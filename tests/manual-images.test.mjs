import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  BOOK1_CHARACTERS,
  BOOK1_MOMENTS,
  checkBook1ManualImages,
  generateBook1Prompts,
  stageBook1MomentImages,
} from "../tools/images/manual-images.mjs";

const WEBP_FIXTURE = Buffer.from("524946460400000057454250", "hex");

async function createTempVisualRoot() {
  return fs.mkdtemp(path.join(os.tmpdir(), "magium-visuals-"));
}

async function createCanonicalFixture() {
  const canonicalRoot = await fs.mkdtemp(path.join(os.tmpdir(), "magium-canonical-"));
  const allAnchors = BOOK1_CHARACTERS.flatMap((character) => character.anchors).join(" | ");
  const momentsByChapter = new Map();
  for (const moment of BOOK1_MOMENTS) {
    momentsByChapter.set(moment.chapterId, [...(momentsByChapter.get(moment.chapterId) ?? []), moment]);
  }

  for (const chapterId of [
    "ch1",
    "ch2",
    "ch3",
    "ch4",
    "ch5",
    "ch6",
    "ch7",
    "ch8",
    "ch9",
    "ch10",
    "ch11a",
    "ch11b",
  ]) {
    const localeFile = path.join(canonicalRoot, "locales/en", `${chapterId}.json`);
    await fs.mkdir(path.dirname(localeFile), { recursive: true });
    await fs.writeFile(localeFile, `${JSON.stringify({
      locale: "en",
      chapterId,
      messages: {
        [`${chapterId}.fixture.p1`]: chapterId === "ch1" ? allAnchors : `Fixture text for ${chapterId}`,
      },
    }, null, 2)}\n`);

    const sceneIds = [...new Set((momentsByChapter.get(chapterId) ?? []).map((moment) => moment.triggerSceneId))];
    const storyFile = path.join(canonicalRoot, "story", `${chapterId}.json`);
    await fs.mkdir(path.dirname(storyFile), { recursive: true });
    await fs.writeFile(storyFile, `${JSON.stringify({
      formatVersion: 1,
      chapterId,
      sceneOrder: sceneIds,
      scenes: Object.fromEntries(sceneIds.map((sceneId) => [sceneId, { id: sceneId, blocks: [], choices: [] }])),
    }, null, 2)}\n`);
  }

  return canonicalRoot;
}

async function readText(file) {
  return fs.readFile(file, "utf8");
}

async function writeReferencePortraits(visualRoot, characterIds) {
  for (const characterId of characterIds) {
    const file = path.join(visualRoot, "characters", characterId, "portrait.webp");
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, WEBP_FIXTURE);
  }
}

describe("manual Book 1 image prompts", () => {
  it("generates one public Markdown prompt per configured character and moment", async () => {
    const visualRoot = await createTempVisualRoot();
    const canonicalRoot = await createCanonicalFixture();
    const result = await generateBook1Prompts({ visualRoot, canonicalRoot });

    expect(result.characters).toBe(BOOK1_CHARACTERS.length);
    expect(result.moments).toBe(BOOK1_MOMENTS.length);

    for (const character of BOOK1_CHARACTERS) {
      await expect(fs.stat(path.join(visualRoot, "characters", character.id, "portrait.md"))).resolves.toBeTruthy();
    }
    for (const moment of BOOK1_MOMENTS) {
      await expect(fs.stat(path.join(visualRoot, "moments", moment.id, "illustration.md"))).resolves.toBeTruthy();
    }
  });

  it("keeps prompts short, paraphrased and free of old RAG/evidence markers", async () => {
    const visualRoot = await createTempVisualRoot();
    const canonicalRoot = await createCanonicalFixture();
    await generateBook1Prompts({ visualRoot, canonicalRoot });
    const check = await checkBook1ManualImages({ visualRoot, canonicalRoot });

    expect(check.prompts).toBe(BOOK1_CHARACTERS.length + BOOK1_MOMENTS.length);
    expect(check.images).toBe(0);
    expect(check.missingImages).toBe(BOOK1_CHARACTERS.length + BOOK1_MOMENTS.length);

    const kate = await readText(path.join(visualRoot, "characters/kate/portrait.md"));
    const moment = await readText(path.join(visualRoot, "moments/ch10-pit-rescue/illustration.md"));
    expect(kate).not.toContain("evidenceRefs");
    expect(moment).not.toContain("evidenceRefs");
    expect(moment).not.toContain(".magium");
    expect(moment).not.toContain("public/visuals/book1/chapters");
  });

  it("captures pre-name visual anchors for Kate and Eiden", async () => {
    const visualRoot = await createTempVisualRoot();
    const canonicalRoot = await createCanonicalFixture();
    await generateBook1Prompts({ visualRoot, canonicalRoot });

    const kate = await readText(path.join(visualRoot, "characters/kate/portrait.md"));
    const eiden = await readText(path.join(visualRoot, "characters/eiden/portrait.md"));

    expect(kate).toContain("long black hair");
    expect(kate).toContain("green, hooded cloak");
    expect(eiden).toContain("boy with his eyes closed");
    expect(eiden).toContain("hands in his pockets");
  });

  it("generates detailed full-body character reference prompts", async () => {
    const visualRoot = await createTempVisualRoot();
    const canonicalRoot = await createCanonicalFixture();
    await generateBook1Prompts({ visualRoot, canonicalRoot });

    for (const character of BOOK1_CHARACTERS) {
      const prompt = await readText(path.join(visualRoot, "characters", character.id, "portrait.md"));
      expect(prompt).toContain("grounded realistic fantasy adventure illustration");
      expect(prompt).toContain("full body, head to toe, feet visible");
      expect(prompt).not.toContain("half-body or bust");
      expect(prompt).not.toContain("dark fantasy illustration");
    }

    const barry = await readText(path.join(visualRoot, "characters/barry/portrait.md"));
    expect(barry).toContain("stat booster");
    expect(barry).toContain("stat device");
    expect(barry).toContain("backpack");
    expect(barry).toContain("crossbow");
    expect(barry).toContain("dagger");

    const daren = await readText(path.join(visualRoot, "characters/daren/portrait.md"));
    expect(daren).toContain("dark-skinned human man");
    expect(daren).toContain("mid forties");
    expect(daren).toContain("bald");
    expect(daren).toContain("X-shaped scar");
    expect(daren).toContain("enchanted sword and shield");
  });

  it("keeps the enriched Book 1 portrait facts and canon corrections", async () => {
    const visualRoot = await createTempVisualRoot();
    const canonicalRoot = await createCanonicalFixture();
    await generateBook1Prompts({ visualRoot, canonicalRoot });

    const expectations = {
      kate: ["long black hair", "green hooded cloak", "floating ice swords"],
      rose: ["long auburn hair", "light-brown eyes", "auburn dress"],
      hadrik: ["shapeshifted into a dwarf", "black beard", "leather armor"],
      flower: ["golden amulet", "oversized clown-like pants", "bare feet"],
      illuna: ["Illuna (aka Petal)", "bright blue eyes", "same body as Flower"],
      eiden: ["late teens", "loose pants and a loose tunic", "hands in his pockets"],
      arraka: ["golden amulet", "three women", "not make her a normal separate human"],
      tyrath: ["armored scales", "dangerous claws", "fire breath"],
      "cutthroat-dave": ["stained white shirt", "belt full of throwing knives", "untrimmed black beard"],
      azarius: ["almost eighty years old", "long white beard", "Felran, not Azarius"],
      diane: ["short blond hair", "burn scar on her left arm", "electrical currents"],
      eleya: ["Eleya is the golden fox", "spirit fox", "normal fox", "not a humanoid woman"],
      leo: ["leopard follower", "trusted lieutenants", "not anthropomorphic"],
      taurus: ["bull lieutenant", "trusted lieutenants", "Eleya", "furious look", "minotaur"],
      golmyck: ["messy hair", "protection goggles", "oil-stained lab coat"],
      suzie: ["eight-year-old sister", "pocket virtual pet toy", "muffins"],
      zack: ["black robes", "snake tattoo on his bald head", "God of Death"],
      elaria: ["female deer", "front hoof", "Use an animal portrait"],
      molan: ["deer fawn", "not a fox", "Use an animal portrait"],
    };

    for (const [characterId, requiredText] of Object.entries(expectations)) {
      const prompt = await readText(path.join(visualRoot, "characters", characterId, "portrait.md"));
      expect(prompt).toContain("Canon:");
      expect(prompt).toContain("Design choice:");
      expect(prompt).toContain("Avoid:");
      for (const text of requiredText) {
        expect(prompt).toContain(text);
      }
    }
  });

  it("generates detailed moment prompts with references and no chapter illustration wording", async () => {
    const visualRoot = await createTempVisualRoot();
    const canonicalRoot = await createCanonicalFixture();
    await generateBook1Prompts({ visualRoot, canonicalRoot });

    const ch1 = await readText(path.join(visualRoot, "moments/ch1-forest-arrival/illustration.md"));
    const ch6 = await readText(path.join(visualRoot, "moments/ch6-barry-packing-crossbow/illustration.md"));
    const ch10 = await readText(path.join(visualRoot, "moments/ch10-pit-rescue/illustration.md"));

    expect(ch1).toContain("Attached references:");
    expect(ch1).toContain("`barry.webp` = Barry");
    expect(ch1).toContain("remove the crossbow completely");
    expect(ch1).toContain("no crossbow");
    expect(ch6).toContain("first moment where Barry's crossbow should appear");
    expect(ch6).toContain("`barry.webp` = Barry");
    expect(ch10).toContain("`daren.webp` = Daren");
    expect(ch10).toContain("Illuna rescues Daren");
    expect(ch10).toContain("Only one Flower/Illuna body");
    expect(ch10).not.toContain("Create one wide chapter illustration");
  });

  it("keeps Petal as Illuna's nickname and uses one shared body in moment prompts", async () => {
    const visualRoot = await createTempVisualRoot();
    const canonicalRoot = await createCanonicalFixture();
    await generateBook1Prompts({ visualRoot, canonicalRoot });

    const ids = BOOK1_CHARACTERS.map((character) => character.id);
    const illuna = await readText(path.join(visualRoot, "characters/illuna/portrait.md"));
    const flower = await readText(path.join(visualRoot, "characters/flower/portrait.md"));
    const moment = await readText(path.join(visualRoot, "moments/ch9-flower-illuna-origin/illustration.md"));

    expect(ids).not.toContain("petal");
    await expect(fs.stat(path.join(visualRoot, "characters/petal/portrait.md"))).rejects.toThrow();
    expect(illuna).toContain("Illuna (aka Petal)");
    expect(illuna).toContain("Petal is Illuna's nickname, not a separate character");
    expect(flower).toContain("Same body design as Illuna/Petal");
    expect(moment).toContain("never show them as two separate visible people");
    expect(moment).not.toContain("petal.webp");
  });

  it("includes Taurus in Eleya's judgment moment as a natural bull", async () => {
    const visualRoot = await createTempVisualRoot();
    const canonicalRoot = await createCanonicalFixture();
    await generateBook1Prompts({ visualRoot, canonicalRoot });

    const taurus = await readText(path.join(visualRoot, "characters/taurus/portrait.md"));
    const moment = await readText(path.join(visualRoot, "moments/ch8-eleya-judgment/illustration.md"));

    expect(taurus).toContain("Taurus");
    expect(taurus).toContain("bull lieutenant");
    expect(taurus).toContain("Use an animal portrait, not a human portrait.");
    expect(moment).toContain("`taurus.webp` = Taurus");
    expect(moment).toContain("natural animals, disciplined lieutenants");
    expect(moment).toContain("No humanoid fox woman, no minotaur Taurus");
  });

  it("stages ChatGPT-ready prompts with renamed portrait references", async () => {
    const visualRoot = await createTempVisualRoot();
    const outputRoot = await fs.mkdtemp(path.join(os.tmpdir(), "magium-staging-"));
    const canonicalRoot = await createCanonicalFixture();
    await generateBook1Prompts({ visualRoot, canonicalRoot });
    await writeReferencePortraits(visualRoot, ["arraka", "barry", "daren", "eiden", "flower", "hadrik", "illuna", "kate", "rose"]);

    const result = await stageBook1MomentImages({
      visualRoot,
      outputRoot,
      chapterId: "ch10",
    });

    expect(result.moments).toBe(5);
    await expect(fs.stat(path.join(outputRoot, "ch10-pit-rescue/prompt.md"))).resolves.toBeTruthy();
    await expect(fs.stat(path.join(outputRoot, "ch10-pit-rescue/references/daren.webp"))).resolves.toBeTruthy();
    await expect(fs.stat(path.join(outputRoot, "ch10-pit-rescue/references/illuna.webp"))).resolves.toBeTruthy();
  });

  it("rejects stale public directories outside the manual config", async () => {
    const visualRoot = await createTempVisualRoot();
    const canonicalRoot = await createCanonicalFixture();
    await generateBook1Prompts({ visualRoot, canonicalRoot });
    await fs.mkdir(path.join(visualRoot, "characters/petal"), { recursive: true });
    await fs.writeFile(path.join(visualRoot, "characters/petal/portrait.md"), "# stale\n");

    await expect(checkBook1ManualImages({ visualRoot, canonicalRoot })).rejects.toThrow(/Unexpected visual directory.*petal/);
  });

  it("rejects the stale chapter illustration directory", async () => {
    const visualRoot = await createTempVisualRoot();
    const canonicalRoot = await createCanonicalFixture();
    await generateBook1Prompts({ visualRoot, canonicalRoot });
    await fs.mkdir(path.join(visualRoot, "chapters/ch1"), { recursive: true });
    await fs.writeFile(path.join(visualRoot, "chapters/ch1/illustration.md"), "# stale\n");

    await expect(checkBook1ManualImages({ visualRoot, canonicalRoot })).rejects.toThrow(/Stale chapter visual directory/);
  });
});
