import { describe, expect, it } from "vitest";
import { parseChoiceLine, parseConditionExpression, parseMagiumChapter } from "../tools/content/parser.mjs";

describe("magium parser", () => {
  it("parses quoted choices, assignments, and specials", () => {
    const choice = parseChoiceLine('choice(""I see no reason."", Ch1-Cutthroat Dave, v_current_scene = Ch1-Cutthroat Dave, special:checkpoint_save)');
    expect(choice.text).toBe('"I see no reason."');
    expect(choice.target).toBe("Ch1-Cutthroat Dave");
    expect(choice.setVariables).toEqual([{ variable: "v_current_scene", value: "Ch1-Cutthroat Dave" }]);
    expect(choice.special).toBe("checkpoint_save");
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
