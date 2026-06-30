import { stageBook1MomentImages } from "./manual-images.mjs";

const args = parseArgs(process.argv.slice(2));

if (args.book !== "1") {
  console.error("Only --book 1 is supported by the manual image staging pipeline.");
  process.exitCode = 1;
} else {
  stageBook1MomentImages({
    momentId: args.moment,
    chapterId: args.chapter,
    all: args.all,
  })
    .then((result) => {
      console.log(`Staged ${result.moments} Book 1 moment prompt set(s) under ${result.outputRoot}`);
      for (const staged of result.staged) {
        console.log(`- ${staged.id}: ${staged.references.length} reference image(s)`);
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
  };
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === "--") continue;
    if (value === "--book") args.book = argv[++index] ?? "";
    else if (value === "--moment") args.moment = argv[++index] ?? "";
    else if (value === "--chapter") args.chapter = argv[++index] ?? "";
    else if (value === "--all") args.all = true;
    else throw new Error(`Unknown images:stage argument: ${value}`);
  }
  return args;
}
