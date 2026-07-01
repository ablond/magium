import { describe, expect, it } from "vitest";
import { parseChoiceLine, parseConditionExpression, parseMagiumChapter, parseSetLine } from "../tools/content/parser.mjs";

describe("magium parser", () => {
  it("parses quoted choices, assignments, and specials", () => {
    const choice = parseChoiceLine('choice(""I see no reason."", Ch1-Cutthroat Dave, v_current_scene = Ch1-Cutthroat Dave, special:checkpoint_save)');
    expect(choice.text).toBe('"I see no reason."');
    expect(choice.target).toBe("Ch1-Cutthroat Dave");
    expect(choice.setVariables).toEqual([{ variable: "v_current_scene", mode: "set", value: "Ch1-Cutthroat Dave" }]);
    expect(choice.special).toBe("checkpoint_save");
  });

  it("keeps choice targets, assignments, specials, and conditions separated", () => {
    const choice = parseChoiceLine('choice("Continue", B3-Ch10b-Ideal, v_current_scene = B3-Ch10b-Ideal, v_available_points = +3, special:stats) if (v_b3_ch1_unlock == 2)');

    expect(choice.target).toBe("B3-Ch10b-Ideal");
    expect(choice.special).toBe("stats");
    expect(choice.setVariables).toEqual([
      { variable: "v_current_scene", mode: "set", value: "B3-Ch10b-Ideal" },
      { variable: "v_available_points", mode: "add", value: 3 },
    ]);
    expect(choice.conditions).toEqual({
      raw: "(v_b3_ch1_unlock == 2)",
      anyOf: [{ allOf: [{ type: "comparison", variable: "v_b3_ch1_unlock", operator: "==", value: 2 }] }],
    });
  });

  it("parses empty-target checkpoint load choices", () => {
    const choice = parseChoiceLine('choice("Load from last checkpoint", , v_chapter_save_counter = 5, special:checkpoint_load)');

    expect(choice.text).toBe("Load from last checkpoint");
    expect(choice.target).toBe("");
    expect(choice.setVariables).toEqual([{ variable: "v_chapter_save_counter", mode: "set", value: 5 }]);
    expect(choice.special).toBe("checkpoint_load");
  });

  it("does not treat quoted ') if' text as a choice condition", () => {
    const choice = parseChoiceLine('choice("What happens ) if I ask?", Ch1-Intro2, v_current_scene = Ch1-Intro2)');

    expect(choice.text).toBe("What happens ) if I ask?");
    expect(choice.target).toBe("Ch1-Intro2");
    expect(choice.conditions).toBeNull();
  });

  it("parses signed numeric assignments as deltas", () => {
    expect(parseChoiceLine('choice("Continue", Ch2-Stats, v_available_points = +3, v_max_stat = 4)').setVariables).toEqual([
      { variable: "v_available_points", mode: "add", value: 3 },
      { variable: "v_max_stat", mode: "set", value: 4 },
    ]);
    expect(parseSetLine("set(v_hearing,-3)")).toMatchObject({ variable: "v_hearing", mode: "add", value: -3 });
  });

  it("parses boolean and grouped conditions", () => {
    expect(parseConditionExpression("False")).toEqual({ raw: "False", anyOf: [] });
    expect(parseConditionExpression("(v_strength >= 2 && v_bluff != 1) || v_speed == 3")).toEqual({
      raw: "(v_strength >= 2 && v_bluff != 1) || v_speed == 3",
      anyOf: [
        {
          allOf: [
            { type: "comparison", variable: "v_strength", operator: ">=", value: 2 },
            { type: "comparison", variable: "v_bluff", operator: "!=", value: 1 },
          ],
        },
        { allOf: [{ type: "comparison", variable: "v_speed", operator: "==", value: 3 }] },
      ],
    });
  });

  it("splits story logic from messages", () => {
    const parsed = parseMagiumChapter(
      `ID: Ch1-Intro1
TEXT:

Opening text.

choice("Excited", Ch1-Intro2, v_current_scene = Ch1-Intro2, v_feeling = 1)

ID: Ch1-Intro2
TEXT:

#if(v_feeling == 1) {
Second scene.
}
achievement("A beginning",v_ac_start)
choice("Restart", Ch1-Intro1, v_current_scene = Ch1-Intro1, special:restart)
`,
      { chapterId: "ch1", sourceFile: "inline.magium" },
    );

    expect(parsed.story.sceneOrder).toEqual(["Ch1-Intro1", "Ch1-Intro2"]);
    expect(Object.values(parsed.messages)).toContain("Opening text.");
    expect(Object.values(parsed.messages)).toContain("Excited");
    expect(parsed.story.scenes["Ch1-Intro2"].achievements[0].variable).toBe("v_ac_start");
  });
});
