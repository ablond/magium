import { generateBook1Prompts } from "./manual-images.mjs";

const book = readBookArg();

if (book !== "1") {
  console.error("Only --book 1 is supported by the manual image prompt pipeline.");
  process.exitCode = 1;
} else {
  generateBook1Prompts()
    .then((result) => {
      console.log(`Generated ${result.characters} character prompts and ${result.moments} moment prompts under ${result.visualRoot}`);
    })
    .catch((error) => {
      console.error(error);
      process.exitCode = 1;
    });
}

function readBookArg() {
  const index = process.argv.indexOf("--book");
  if (index === -1) return "1";
  return process.argv[index + 1];
}
