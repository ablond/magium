import { createBook1ReferenceSheets } from "./manual-images.mjs";

const args = parseArgs(process.argv.slice(2));

if (args.book !== "1") {
  console.error("Only --book 1 is supported by the image reference sheet pipeline.");
  process.exitCode = 1;
} else {
  createBook1ReferenceSheets({
    momentId: args.moment,
    chapterId: args.chapter,
    all: args.all,
    missing: args.missing,
  })
    .then((result) => {
      console.log(`Prepared ${result.moments} Book 1 API reference sheet set(s) under ${result.outputRoot}`);
      for (const staged of result.staged) {
        console.log(`- ${staged.id}: ${staged.sheets.length} sheet(s)`);
      }
    })
    .catch((error) => {
      console.error(error);
      process.exitCode = 1;
    });
}

function parseArgs(argv) {
  const args = {
    book: "1",
    moment: "",
    chapter: "",
    all: false,
    missing: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === "--") continue;
    if (value === "--book") args.book = argv[++index] ?? "";
    else if (value === "--moment") args.moment = argv[++index] ?? "";
    else if (value === "--chapter") args.chapter = argv[++index] ?? "";
    else if (value === "--all") args.all = true;
    else if (value === "--missing") args.missing = true;
    else throw new Error(`Unknown images:refsheets argument: ${value}`);
  }
  return args;
}
