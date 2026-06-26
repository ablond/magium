const comparisonOperators = ["<=", ">=", "==", "!=", "<", ">"];

export function chapterIdFromFileName(fileName) {
  return fileName.replace(/\.magium$/i, "");
}

export function chapterKeyFromFileName(fileName) {
  const id = chapterIdFromFileName(fileName);
  return id.startsWith("ch") ? `b1${id}` : id;
}

export function parseMagiumChapter(source, { chapterId, sourceFile }) {
  const lines = source.replace(/\r\n/g, "\n").split("\n");
  const story = {
    formatVersion: 1,
    chapterId,
    sourceFile,
    sceneOrder: [],
    scenes: {},
  };
  const messages = {};

  let scene = null;
  let paragraphLines = [];
  let activeCondition = null;
  let skipTextBlank = false;
  let paragraphIndex = 0;
  let choiceIndex = 0;
  let setIndex = 0;
  let achievementIndex = 0;

  function requireScene(lineNumber) {
    if (!scene) {
      throw new Error(`${sourceFile}:${lineNumber}: content before first scene ID`);
    }
  }

  function sceneSafeId() {
    return scene.id.replace(/[^A-Za-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
  }

  function messageId(kind, index) {
    return `${chapterId}.${sceneSafeId()}.${kind}${index}`;
  }

  function flushParagraph() {
    if (!scene) {
      paragraphLines = [];
      return;
    }
    const text = paragraphLines.join("\n").replace(/\n{3,}/g, "\n\n").trim();
    paragraphLines = [];
    if (!text) {
      return;
    }
    paragraphIndex += 1;
    const id = `${scene.id}:p${paragraphIndex}`;
    const idMessage = messageId("p", paragraphIndex);
    scene.blocks.push({
      id,
      type: "paragraph",
      messageId: idMessage,
      conditions: activeCondition,
    });
    messages[idMessage] = text;
  }

  function closeScene() {
    if (!scene) {
      return;
    }
    flushParagraph();
    if (story.scenes[scene.id]) {
      throw new Error(`${sourceFile}: duplicate scene id ${scene.id}`);
    }
    story.sceneOrder.push(scene.id);
    story.scenes[scene.id] = scene;
  }

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    const lineNumber = i + 1;

    if (line.startsWith("ID: ")) {
      closeScene();
      const id = line.slice(4).trim();
      scene = {
        id,
        blocks: [],
        choices: [],
        setVariables: [],
        achievements: [],
      };
      paragraphLines = [];
      activeCondition = null;
      skipTextBlank = false;
      paragraphIndex = 0;
      choiceIndex = 0;
      setIndex = 0;
      achievementIndex = 0;
      continue;
    }

    if (line === "TEXT:") {
      requireScene(lineNumber);
      skipTextBlank = true;
      continue;
    }

    if (skipTextBlank && line.trim() === "") {
      skipTextBlank = false;
      continue;
    }
    skipTextBlank = false;

    const ifMatch = line.match(/^#if\((?<condition>.*)\)\s*\{$/);
    if (ifMatch) {
      requireScene(lineNumber);
      flushParagraph();
      activeCondition = parseConditionExpression(ifMatch.groups.condition);
      continue;
    }

    if (line.trim() === "}") {
      requireScene(lineNumber);
      flushParagraph();
      activeCondition = null;
      continue;
    }

    if (line.startsWith("choice(")) {
      requireScene(lineNumber);
      flushParagraph();
      choiceIndex += 1;
      const parsed = parseChoiceLine(line, sourceFile, lineNumber);
      const id = `${scene.id}:c${choiceIndex}`;
      const idMessage = messageId("c", choiceIndex);
      scene.choices.push({
        id,
        messageId: idMessage,
        target: parsed.target,
        setVariables: parsed.setVariables,
        special: parsed.special,
        conditions: parsed.conditions,
      });
      messages[idMessage] = parsed.text;
      continue;
    }

    if (line.startsWith("set(")) {
      requireScene(lineNumber);
      flushParagraph();
      setIndex += 1;
      scene.setVariables.push({
        id: `${scene.id}:s${setIndex}`,
        ...parseSetLine(line, sourceFile, lineNumber),
      });
      continue;
    }

    if (line.startsWith("achievement(")) {
      requireScene(lineNumber);
      flushParagraph();
      achievementIndex += 1;
      const parsed = parseAchievementLine(line, sourceFile, lineNumber);
      const id = `${scene.id}:a${achievementIndex}`;
      const idMessage = messageId("a", achievementIndex);
      scene.achievements.push({
        id,
        messageId: idMessage,
        variable: parsed.variable,
      });
      messages[idMessage] = parsed.text;
      continue;
    }

    paragraphLines.push(line);
  }

  closeScene();
  return { story, messages };
}

export function parseChoiceLine(line, sourceFile = "inline", lineNumber = 1) {
  const match = line.match(/^choice\((?<body>.*)\)(?: if (?<condition>.*))?$/);
  if (!match) {
    throw new Error(`${sourceFile}:${lineNumber}: invalid choice syntax`);
  }
  const { text, rest } = parseLeadingQuotedText(match.groups.body, sourceFile, lineNumber);
  const tokens = splitChoiceArgs(rest);
  const target = tokens.shift() || "";
  const setVariables = [];
  let special = null;

  for (const token of tokens) {
    if (!token) {
      continue;
    }
    if (token.startsWith("special:")) {
      special = token.slice("special:".length).trim();
      continue;
    }
    const assignment = parseAssignment(token);
    if (!assignment) {
      throw new Error(`${sourceFile}:${lineNumber}: invalid choice assignment "${token}"`);
    }
    setVariables.push(assignment);
  }

  return {
    text,
    target: target.trim(),
    setVariables,
    special,
    conditions: match.groups.condition ? parseConditionExpression(match.groups.condition) : null,
  };
}

export function parseSetLine(line, sourceFile = "inline", lineNumber = 1) {
  const match = line.match(/^set\((?<variable>[^,]+),(?<value>[+\-]?\d+)\)(?: if (?<condition>.*))?$/);
  if (!match) {
    throw new Error(`${sourceFile}:${lineNumber}: invalid set syntax`);
  }
  return {
    variable: match.groups.variable.trim(),
    value: parseValue(match.groups.value.trim()),
    conditions: match.groups.condition ? parseConditionExpression(match.groups.condition) : null,
  };
}

export function parseAchievementLine(line, sourceFile = "inline", lineNumber = 1) {
  const match = line.match(/^achievement\((?<body>.*)\)$/);
  if (!match) {
    throw new Error(`${sourceFile}:${lineNumber}: invalid achievement syntax`);
  }
  const { text, rest } = parseLeadingQuotedText(match.groups.body, sourceFile, lineNumber);
  const variable = rest.replace(/^,/, "").trim();
  if (!variable) {
    throw new Error(`${sourceFile}:${lineNumber}: achievement missing variable`);
  }
  return { text, variable };
}

export function parseConditionExpression(source) {
  const normalized = trimOuterParens(source.trim());
  if (!normalized || normalized === "True") {
    return null;
  }
  if (normalized === "False") {
    return { raw: source.trim(), anyOf: [] };
  }
  return {
    raw: source.trim(),
    anyOf: splitByTopLevelOperator(normalized, "||").map((orPart) => ({
      allOf: splitByTopLevelOperator(trimOuterParens(orPart.trim()), "&&").map((andPart) =>
        parseAtomicCondition(trimOuterParens(andPart.trim())),
      ),
    })),
  };
}

function parseAtomicCondition(source) {
  if (source === "True") {
    return { type: "true" };
  }
  if (source === "False") {
    return { type: "false" };
  }
  for (const operator of comparisonOperators) {
    const parts = source.split(` ${operator} `);
    if (parts.length === 2) {
      return {
        type: "comparison",
        variable: parts[0].trim(),
        operator,
        value: parseValue(parts[1].trim()),
      };
    }
  }
  throw new Error(`Unsupported condition: ${source}`);
}

function parseLeadingQuotedText(body, sourceFile, lineNumber) {
  if (!body.startsWith('"')) {
    throw new Error(`${sourceFile}:${lineNumber}: expected quoted text`);
  }
  let text = "";
  for (let i = 1; i < body.length; i += 1) {
    const char = body[i];
    if (char === '"') {
      const next = body[i + 1];
      if (next === "," || next === undefined) {
        return {
          text,
          rest: body.slice(next === "," ? i + 2 : i + 1).trim(),
        };
      }
      text += '"';
      continue;
    }
    text += char;
  }
  throw new Error(`${sourceFile}:${lineNumber}: unterminated quoted text`);
}

function splitChoiceArgs(rest) {
  if (!rest) {
    return [];
  }
  return rest.split(",").map((token) => token.trim());
}

function parseAssignment(token) {
  const match = token.match(/^(?<variable>\w+)\s*=\s*(?<value>.+)$/);
  if (!match) {
    return null;
  }
  return {
    variable: match.groups.variable,
    value: parseValue(match.groups.value.trim()),
  };
}

function parseValue(value) {
  if (/^[+\-]?\d+$/.test(value)) {
    return Number(value);
  }
  return value;
}

function trimOuterParens(value) {
  let next = value.trim();
  while (next.startsWith("(") && next.endsWith(")") && enclosesWholeExpression(next)) {
    next = next.slice(1, -1).trim();
  }
  return next;
}

function enclosesWholeExpression(value) {
  let depth = 0;
  for (let i = 0; i < value.length; i += 1) {
    if (value[i] === "(") {
      depth += 1;
    } else if (value[i] === ")") {
      depth -= 1;
      if (depth === 0 && i < value.length - 1) {
        return false;
      }
    }
  }
  return depth === 0;
}

function splitByTopLevelOperator(value, operator) {
  const parts = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < value.length; i += 1) {
    if (value[i] === "(") {
      depth += 1;
    } else if (value[i] === ")") {
      depth -= 1;
    } else if (depth === 0 && value.slice(i, i + operator.length) === operator) {
      parts.push(value.slice(start, i).trim());
      start = i + operator.length;
      i += operator.length - 1;
    }
  }
  parts.push(value.slice(start).trim());
  return parts.filter(Boolean);
}
