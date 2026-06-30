import { checkBook1ManualImages } from "./manual-images.mjs";

const book = readBookArg();

if (book !== "1") {
  console.error("Only --book 1 is supported by the manual image check.");
  process.exitCode = 1;
} else {
  checkBook1ManualImages()
    .then((result) => {
      console.log(`Checked ${result.prompts} visual prompts and ${result.images} WebP images (${result.missingImages} images missing but allowed).`);
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
