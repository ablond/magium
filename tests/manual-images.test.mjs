import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  BOOK1_CHARACTERS,
  BOOK1_MOMENTS,
  checkBook1ManualImages,
  createBook1ReferenceSheets,
  generateBook1Prompts,
  prepareBook1ImageBatch,
  stageBook1MomentImages,
} from "../tools/images/manual-images.mjs";

const WEBP_FIXTURE = Buffer.from("UklGRiIAAABXRUJQVlA4IBYAAAAwAQCdASoBAAEADsD+JaQAA3AA/vuUAAA=", "base64");

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
    const cutthroatDave = await readText(path.join(visualRoot, "moments/ch1-cutthroat-dave/illustration.md"));
    const kateAppears = await readText(path.join(visualRoot, "moments/ch2-kate-appears/illustration.md"));
    const roseScream = await readText(path.join(visualRoot, "moments/ch5-rose-scream/illustration.md"));
    const ch6Prep = await readText(path.join(visualRoot, "moments/ch6-cave-prep/illustration.md"));
    const tree = await readText(path.join(visualRoot, "moments/ch3-barry-tree-lift/illustration.md"));
    const ch6 = await readText(path.join(visualRoot, "moments/ch6-barry-packing-crossbow/illustration.md"));
    const dianeTension = await readText(path.join(visualRoot, "moments/ch7-diane-tension/illustration.md"));
    const hydraRoom = await readText(path.join(visualRoot, "moments/ch8-hydra-room/illustration.md"));
    const controlRoom = await readText(path.join(visualRoot, "moments/ch8-control-room/illustration.md"));
    const flowerOrigin = await readText(path.join(visualRoot, "moments/ch9-flower-illuna-origin/illustration.md"));
    const ch9Backpack = await readText(path.join(visualRoot, "moments/ch9-enchanted-backpack/illustration.md"));
    const ogreTrap = await readText(path.join(visualRoot, "moments/ch9-ogre-ambush/illustration.md"));
    const afterOgres = await readText(path.join(visualRoot, "moments/ch10-after-ogres/illustration.md"));
    const eidenConfrontation = await readText(
      path.join(visualRoot, "moments/ch10-eiden-confrontation/illustration.md"),
    );
    const beggarsDistrict = await readText(
      path.join(visualRoot, "moments/ch11a-beggars-district-trap/illustration.md"),
    );
    const ch11b = await readText(path.join(visualRoot, "moments/ch11b-golmyck-announcement/illustration.md"));
    const ch10 = await readText(path.join(visualRoot, "moments/ch10-pit-rescue/illustration.md"));

    expect(ch1).toContain("Attached references:");
    expect(ch1).toContain("`barry.webp` = Barry");
    expect(ch1).toContain("remove the crossbow completely");
    expect(ch1).toContain("no crossbow");
    expect(ch1).toContain("Barry's stat device must stay in his pocket or hidden");
    expect(ch1).toContain("Barry's backpack is not enchanted yet");
    expect(ch1).toContain("danger comes from distant explosions");
    expect(ch1).not.toContain("dangerous wilderness");
    expect(cutthroatDave).toContain("`daren.webp` = Daren");
    expect(cutthroatDave).toContain("defeated and weakened in heavy armor");
    expect(cutthroatDave).toContain("shield on the ground");
    expect(cutthroatDave).toContain("sword barely held");
    expect(cutthroatDave).toContain("three route variants");
    expect(cutthroatDave).not.toContain("pinned at the shoulder");
    expect(cutthroatDave).not.toContain("no Daren unless hidden");
    expect(kateAppears).toContain("Ordinary Varathian forest clearing");
    expect(kateAppears).toContain("neutral natural forest light");
    expect(kateAppears).toContain("not through a darkened environment");
    expect(kateAppears).toContain("No dark fantasy forest");
    expect(kateAppears).not.toContain("Night forest clearing");
    expect(kateAppears).not.toContain("dark trunks");
    expect(kateAppears).not.toContain("cold air");
    expect(roseScream).not.toContain("`rose.webp`");
    expect(roseScream).toContain("Do not identify Rose visually");
    expect(roseScream).toContain("No close heroic rescue pose yet");
    expect(ch6Prep).not.toContain("`elaria.webp`");
    expect(ch6Prep).not.toContain("`molan.webp`");
    expect(ch6Prep).toContain("Sunny cave entrance");
    expect(ch6Prep).toContain("no Elaria or Molan");
    expect(tree).toContain("Barry faces the fallen tree tactic");
    expect(tree).toContain("success, failure and not-trying variants");
    expect(tree).toContain("Do not put Barry's stat device in his hand here");
    expect(tree).not.toContain("Barry lifts the tree");
    expect(ch6).toContain("first moment where Barry's crossbow should appear");
    expect(ch6).toContain("Barry's stat device stays in his pocket here");
    expect(ch6).toContain("`daren.webp` = Daren");
    expect(ch6).toContain("Daren enchants the backpack");
    expect(ch6).toContain("contained glow on the backpack is allowed only as Daren's spell");
    expect(ch6).not.toContain("Daren's backpack enchantment can happen in this scene or shortly after");
    expect(ch6).not.toContain("Barry's backpack is still treated as ordinary-looking");
    expect(ch6).toContain("`barry.webp` = Barry");
    expect(ch6).not.toContain("`elaria.webp`");
    expect(ch6).not.toContain("`molan.webp`");
    expect(dianeTension).not.toContain("`diane.webp`");
    expect(dianeTension).toContain("Diane herself is not visible yet");
    expect(dianeTension).toContain("No visible Diane yet");
    expect(hydraRoom).not.toContain("`flower.webp`");
    expect(hydraRoom).toContain("Flower through the roof opening");
    expect(hydraRoom).toContain("No visible Flower in the room");
    expect(controlRoom).toContain("`leo.webp` = Leo");
    expect(controlRoom).not.toContain("`illuna.webp`");
    expect(controlRoom).toContain("Flower is the visible state");
    expect(controlRoom).toContain("Eleya the golden fox and Leo the leopard");
    expect(flowerOrigin).not.toContain("`illuna.webp`");
    expect(flowerOrigin).toContain("Illuna/Petal is discussed, not physically shown");
    expect(flowerOrigin).toContain("No Illuna reference image attached");
    expect(ch9Backpack).toContain("Trigger scene: `Ch9-Backpack`");
    expect(ch9Backpack).toContain("`kate.webp` = Kate");
    expect(ch9Backpack).not.toContain("`flower.webp`");
    expect(ch9Backpack).toContain("Kate shows him how to make the item-list screen appear");
    expect(ch9Backpack).toContain("magical inventory belongs to the backpack");
    expect(ch9Backpack).toContain("rare scenes where a restrained magical inventory screen");
    expect(ogreTrap).toContain("No visible ogres yet");
    expect(ogreTrap).toContain("wide open wooden gate");
    expect(ogreTrap).toContain("muffled warning noises");
    expect(afterOgres).toContain("do not invent moon, stars or dramatic night sky details");
    expect(afterOgres).not.toContain("almost full moon");
    expect(afterOgres).not.toContain("Moonlit night camp");
    expect(eidenConfrontation).toContain("`rose.webp` = Rose");
    expect(eidenConfrontation).toContain("Rose struggles for breath");
    expect(eidenConfrontation).toContain("shattered plates");
    expect(beggarsDistrict).not.toContain("`zack.webp`");
    expect(beggarsDistrict).toContain("Zack is not visible in this trigger scene");
    expect(beggarsDistrict).toContain("No Zack yet");
    expect(ch11b).toContain("Barry is not carrying his backpack");
    expect(ch11b).toContain("do not show his backpack, crossbow");
    expect(ch10).toContain("`daren.webp` = Daren");
    expect(ch10).toContain("The lower chamber regrouping");
    expect(ch10).toContain("Only one Flower/Illuna body");
    expect(ch10).not.toContain("Create one wide chapter illustration");
  });

  it("makes Barry's stat device and backpack state explicit in every Barry moment", async () => {
    const visualRoot = await createTempVisualRoot();
    const canonicalRoot = await createCanonicalFixture();
    await generateBook1Prompts({ visualRoot, canonicalRoot });

    const statDeviceInHand = new Set(["ch6-tyrath-arrival", "ch6-time-weaver"]);
    const notCarryingBackpack = new Set([
      "ch11a-beggars-district-trap",
      "ch11b-clone-ambush",
      "ch11b-skeletal-dragon",
      "ch11b-zack-sacrifice",
      "ch11b-golmyck-announcement",
    ]);

    for (const moment of BOOK1_MOMENTS.filter((candidate) => candidate.characters.includes("barry"))) {
      const prompt = await readText(path.join(visualRoot, "moments", moment.id, "illustration.md"));
      expect(prompt).toContain("Barry equipment continuity");
      if (statDeviceInHand.has(moment.id)) {
        expect(prompt).toContain("Barry's stat device is explicitly in his hand");
      } else {
        expect(prompt).toContain("Barry's stat device must stay in his pocket or hidden");
      }

      if (notCarryingBackpack.has(moment.id)) {
        expect(prompt).toContain("Barry is not carrying his backpack");
        expect(prompt).toContain("do not show his backpack, crossbow");
      }
    }
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

  it("does not attach Arraka or both shared-body states to moment prompts", async () => {
    const visualRoot = await createTempVisualRoot();
    const canonicalRoot = await createCanonicalFixture();
    await generateBook1Prompts({ visualRoot, canonicalRoot });

    for (const moment of BOOK1_MOMENTS) {
      expect(moment.characters, `${moment.id} must not attach Arraka`).not.toContain("arraka");
      expect(
        moment.characters.includes("flower") && moment.characters.includes("illuna"),
        `${moment.id} must choose one Flower/Illuna visible state`,
      ).toBe(false);

      const prompt = await readText(path.join(visualRoot, "moments", moment.id, "illustration.md"));
      expect(prompt).not.toContain("`arraka.webp`");
      expect(prompt.includes("`flower.webp`") && prompt.includes("`illuna.webp`")).toBe(false);
    }

    const cage = await readText(path.join(visualRoot, "moments/ch9-illuna-golden-cage/illustration.md"));
    expect(cage).toContain("`illuna.webp` = Illuna");
    expect(cage).not.toContain("`flower.webp`");
    expect(cage).toContain("Arraka is represented through Flower/Illuna's golden amulet or its aura");

    const confrontation = await readText(path.join(visualRoot, "moments/ch10-eiden-confrontation/illustration.md"));
    expect(confrontation).toContain("`flower.webp` = Flower");
    expect(confrontation).not.toContain("`illuna.webp`");
    expect(confrontation).not.toContain("`arraka.webp`");
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

  it("creates API reference sheets without Arraka or duplicate Flower/Illuna bodies", async () => {
    const visualRoot = await createTempVisualRoot();
    const outputRoot = await fs.mkdtemp(path.join(os.tmpdir(), "magium-refsheets-"));
    await writeReferencePortraits(visualRoot, BOOK1_CHARACTERS.map((character) => character.id));

    const result = await createBook1ReferenceSheets({
      visualRoot,
      outputRoot,
      momentId: "ch10-eiden-confrontation",
    });

    expect(result.moments).toBe(1);
    const manifest = JSON.parse(await fs.readFile(path.join(outputRoot, "ch10-eiden-confrontation/manifest.json"), "utf8"));
    const mappedIds = manifest.sheets.flatMap((sheet) => sheet.references.map((reference) => reference.id));
    expect(mappedIds).toContain("flower");
    expect(mappedIds).not.toContain("illuna");
    expect(mappedIds).not.toContain("arraka");
    expect(manifest.prompt).toContain("top-left = Barry");
    expect(manifest.prompt).toContain("Flower (flower)");
    expect(manifest.prompt).not.toContain("Arraka (arraka)");
    for (const sheet of manifest.sheets) {
      await expect(fs.stat(path.join(outputRoot, "ch10-eiden-confrontation", sheet.file))).resolves.toBeTruthy();
    }
  });

  it("prepares OpenAI Batch JSONL for missing moments with reference sheets", async () => {
    const visualRoot = await createTempVisualRoot();
    const inputRoot = await fs.mkdtemp(path.join(os.tmpdir(), "magium-api-inputs-"));
    const outputRoot = await fs.mkdtemp(path.join(os.tmpdir(), "magium-api-runs-"));
    await writeReferencePortraits(visualRoot, BOOK1_CHARACTERS.map((character) => character.id));

    const result = await prepareBook1ImageBatch({
      visualRoot,
      inputRoot,
      outputRoot,
      momentId: "ch10-eiden-confrontation",
      missing: true,
      quality: "high",
      size: "1536x1024",
    });

    expect(result.requests).toBe(1);
    const jsonl = await readText(result.batchFile);
    const request = JSON.parse(jsonl.trim());
    expect(request.custom_id).toBe("book1:ch10-eiden-confrontation");
    expect(request.url).toBe("/v1/images/edits");
    expect(request.body.model).toBe("gpt-image-2");
    expect(request.body.quality).toBe("high");
    expect(request.body.size).toBe("1536x1024");
    expect(request.body.output_format).toBe("webp");
    expect(request.body.images.length).toBe(2);
    expect(request.body.images[0].image_url).toMatch(/^data:image\/webp;base64,/);
    expect(request.body.images[1].image_url).toMatch(/^data:image\/webp;base64,/);
    expect(request.body.prompt).toContain("top-left = Barry");
    expect(request.body.prompt).toContain("Flower (flower)");
    expect(request.body.prompt).not.toContain("Arraka (arraka)");
    expect(request.body.prompt).not.toContain("Illuna (illuna)");
  });

  it("stages all Book 1 moments by default when no moment or chapter is provided", async () => {
    const visualRoot = await createTempVisualRoot();
    const outputRoot = await fs.mkdtemp(path.join(os.tmpdir(), "magium-staging-all-"));
    const canonicalRoot = await createCanonicalFixture();
    await generateBook1Prompts({ visualRoot, canonicalRoot });
    await writeReferencePortraits(visualRoot, BOOK1_CHARACTERS.map((character) => character.id));

    const result = await stageBook1MomentImages({ visualRoot, outputRoot });

    expect(result.moments).toBe(BOOK1_MOMENTS.length);
    await expect(fs.stat(path.join(outputRoot, "ch1-forest-arrival/prompt.md"))).resolves.toBeTruthy();
    await expect(fs.stat(path.join(outputRoot, "ch11b-golmyck-announcement/prompt.md"))).resolves.toBeTruthy();
  });

  it("stages the corrected Cutthroat Dave moment with Daren as a reference", async () => {
    const visualRoot = await createTempVisualRoot();
    const outputRoot = await fs.mkdtemp(path.join(os.tmpdir(), "magium-staging-"));
    const canonicalRoot = await createCanonicalFixture();
    await generateBook1Prompts({ visualRoot, canonicalRoot });
    await writeReferencePortraits(visualRoot, ["barry", "cutthroat-dave", "daren"]);

    const result = await stageBook1MomentImages({
      visualRoot,
      outputRoot,
      momentId: "ch1-cutthroat-dave",
    });

    expect(result.moments).toBe(1);
    await expect(fs.stat(path.join(outputRoot, "ch1-cutthroat-dave/references/barry.webp"))).resolves.toBeTruthy();
    await expect(fs.stat(path.join(outputRoot, "ch1-cutthroat-dave/references/cutthroat-dave.webp"))).resolves.toBeTruthy();
    await expect(fs.stat(path.join(outputRoot, "ch1-cutthroat-dave/references/daren.webp"))).resolves.toBeTruthy();
  });

  it("declares path compatibility notes for real conditional trigger scenes", async () => {
    for (const moment of BOOK1_MOMENTS) {
      const story = JSON.parse(await fs.readFile(path.join("content/canonical/v1/story", `${moment.chapterId}.json`), "utf8"));
      const scene = story.scenes[moment.triggerSceneId];
      const hasConditionalContent = [...(scene.blocks ?? []), ...(scene.choices ?? [])].some((entry) => entry.conditions);
      if (hasConditionalContent) {
        expect(moment.pathCompatibility, `${moment.id} needs path compatibility notes`).toBeDefined();
        expect(moment.pathCompatibility.length, `${moment.id} needs path compatibility notes`).toBeGreaterThan(0);
      }
    }
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
