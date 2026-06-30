import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  BOOK1_CHAPTERS,
  BOOK1_CHARACTERS,
  checkBook1ManualImages,
  generateBook1Prompts,
} from "../tools/images/manual-images.mjs";

async function createTempVisualRoot() {
  return fs.mkdtemp(path.join(os.tmpdir(), "magium-visuals-"));
}

async function createCanonicalFixture() {
  const canonicalRoot = await fs.mkdtemp(path.join(os.tmpdir(), "magium-canonical-"));
  const allAnchors = BOOK1_CHARACTERS.flatMap((character) => character.anchors).join(" | ");
  for (const chapter of BOOK1_CHAPTERS) {
    const file = path.join(canonicalRoot, "locales/en", `${chapter.id}.json`);
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, `${JSON.stringify({
      locale: "en",
      chapterId: chapter.id,
      messages: {
        [`${chapter.id}.fixture.p1`]: chapter.id === "ch1" ? allAnchors : `Fixture text for ${chapter.id}`,
      },
    }, null, 2)}\n`);
  }
  return canonicalRoot;
}

async function readText(file) {
  return fs.readFile(file, "utf8");
}

describe("manual Book 1 image prompts", () => {
  it("generates one public Markdown prompt per configured character and chapter", async () => {
    const visualRoot = await createTempVisualRoot();
    const canonicalRoot = await createCanonicalFixture();
    const result = await generateBook1Prompts({ visualRoot, canonicalRoot });

    expect(result.characters).toBe(BOOK1_CHARACTERS.length);
    expect(result.chapters).toBe(BOOK1_CHAPTERS.length);

    for (const character of BOOK1_CHARACTERS) {
      await expect(fs.stat(path.join(visualRoot, "characters", character.id, "portrait.md"))).resolves.toBeTruthy();
    }
    for (const chapter of BOOK1_CHAPTERS) {
      await expect(fs.stat(path.join(visualRoot, "chapters", chapter.id, "illustration.md"))).resolves.toBeTruthy();
    }
  });

  it("keeps prompts short, paraphrased and free of old RAG/evidence markers", async () => {
    const visualRoot = await createTempVisualRoot();
    const canonicalRoot = await createCanonicalFixture();
    await generateBook1Prompts({ visualRoot, canonicalRoot });
    const check = await checkBook1ManualImages({ visualRoot, canonicalRoot });

    expect(check.prompts).toBe(BOOK1_CHARACTERS.length + BOOK1_CHAPTERS.length);
    expect(check.images).toBe(0);
    expect(check.missingImages).toBe(BOOK1_CHARACTERS.length + BOOK1_CHAPTERS.length);

    const kate = await readText(path.join(visualRoot, "characters/kate/portrait.md"));
    expect(kate).not.toContain("evidenceRefs");
    expect(kate).not.toContain(".magium");
    expect(kate).toContain("slim, tall figure");
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

  it("generates a detailed full-body Barry reference prompt", async () => {
    const visualRoot = await createTempVisualRoot();
    const canonicalRoot = await createCanonicalFixture();
    await generateBook1Prompts({ visualRoot, canonicalRoot });

    const barry = await readText(path.join(visualRoot, "characters/barry/portrait.md"));

    expect(barry).toContain("full-body");
    expect(barry).toContain("head to toe");
    expect(barry).toContain("feet visible");
    expect(barry).toContain("stat booster");
    expect(barry).toContain("stat device");
    expect(barry).toContain("backpack");
    expect(barry).toContain("crossbow");
    expect(barry).toContain("dagger");
    expect(barry).toContain("grounded realistic fantasy adventure illustration");
    expect(barry).not.toContain("half-body or bust");
    expect(barry).not.toContain("dark fantasy illustration");
  });

  it("uses grounded full-body portrait direction for character prompts", async () => {
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
  });

  it("generates a detailed canon-grounded Daren reference prompt", async () => {
    const visualRoot = await createTempVisualRoot();
    const canonicalRoot = await createCanonicalFixture();
    await generateBook1Prompts({ visualRoot, canonicalRoot });

    const daren = await readText(path.join(visualRoot, "characters/daren/portrait.md"));

    expect(daren).toContain("dark-skinned human man");
    expect(daren).toContain("mid forties");
    expect(daren).toContain("bald");
    expect(daren).toContain("X-shaped scar");
    expect(daren).toContain("heavy armor");
    expect(daren).toContain("enchanted sword and shield");
    expect(daren).toContain("bright white light");
    expect(daren).toContain("protective barriers");
    expect(daren).toContain("Avoid: young knight, hair");
    expect(daren).not.toContain("dark sorcerer");
  });

  it("enriches the remaining Book 1 portrait prompts with concrete visible details", async () => {
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

  it("adds Taurus as a portrait-only character for now", async () => {
    const visualRoot = await createTempVisualRoot();
    const canonicalRoot = await createCanonicalFixture();
    await generateBook1Prompts({ visualRoot, canonicalRoot });

    const taurus = await readText(path.join(visualRoot, "characters/taurus/portrait.md"));
    const chapter8 = await readText(path.join(visualRoot, "chapters/ch8/illustration.md"));

    expect(taurus).toContain("Taurus");
    expect(taurus).toContain("bull lieutenant");
    expect(taurus).toContain("Use an animal portrait, not a human portrait.");
    expect(taurus).not.toContain("humanoid bull-man portrait");
    expect(chapter8).not.toContain("public/visuals/book1/characters/taurus/portrait.webp");
  });

  it("treats Petal as Illuna's nickname instead of a separate portrait", async () => {
    const visualRoot = await createTempVisualRoot();
    const canonicalRoot = await createCanonicalFixture();
    await generateBook1Prompts({ visualRoot, canonicalRoot });

    const ids = BOOK1_CHARACTERS.map((character) => character.id);
    const illuna = await readText(path.join(visualRoot, "characters/illuna/portrait.md"));
    const flower = await readText(path.join(visualRoot, "characters/flower/portrait.md"));
    const chapter9 = await readText(path.join(visualRoot, "chapters/ch9/illustration.md"));

    expect(ids).not.toContain("petal");
    await expect(fs.stat(path.join(visualRoot, "characters/petal/portrait.md"))).rejects.toThrow();
    expect(illuna).toContain("Illuna (aka Petal)");
    expect(illuna).toContain("Petal is Illuna's nickname, not a separate character");
    expect(flower).toContain("Same body design as Illuna/Petal");
    expect(chapter9).toContain("public/visuals/book1/characters/illuna/portrait.webp");
    expect(chapter9).toContain("never as two separate visible people in the same moment");
    expect(chapter9).not.toContain("public/visuals/book1/characters/petal/portrait.webp");
  });

  it("uses non-human prompts for dragon and animal characters", async () => {
    const visualRoot = await createTempVisualRoot();
    const canonicalRoot = await createCanonicalFixture();
    await generateBook1Prompts({ visualRoot, canonicalRoot });

    const tyrath = await readText(path.join(visualRoot, "characters/tyrath/portrait.md"));
    const elaria = await readText(path.join(visualRoot, "characters/elaria/portrait.md"));
    const molan = await readText(path.join(visualRoot, "characters/molan/portrait.md"));

    expect(tyrath).toContain("A dragon, never a human portrait.");
    expect(elaria).toContain("Use an animal portrait, not a human portrait.");
    expect(molan).toContain("Use an animal portrait, not a human portrait.");
  });

  it("references character portraits from chapter prompts", async () => {
    const visualRoot = await createTempVisualRoot();
    const canonicalRoot = await createCanonicalFixture();
    await generateBook1Prompts({ visualRoot, canonicalRoot });

    const chapter2 = await readText(path.join(visualRoot, "chapters/ch2/illustration.md"));
    const chapter6 = await readText(path.join(visualRoot, "chapters/ch6/illustration.md"));

    expect(chapter2).toContain("public/visuals/book1/characters/kate/portrait.webp");
    expect(chapter2).toContain("public/visuals/book1/characters/daren/portrait.webp");
    expect(chapter6).toContain("public/visuals/book1/characters/tyrath/portrait.webp");
  });

  it("rejects stale public character directories outside the manual config", async () => {
    const visualRoot = await createTempVisualRoot();
    const canonicalRoot = await createCanonicalFixture();
    await generateBook1Prompts({ visualRoot, canonicalRoot });
    await fs.mkdir(path.join(visualRoot, "characters/petal"), { recursive: true });
    await fs.writeFile(path.join(visualRoot, "characters/petal/portrait.md"), "# stale\n");

    await expect(checkBook1ManualImages({ visualRoot, canonicalRoot })).rejects.toThrow(/Unexpected visual directory.*petal/);
  });
});
