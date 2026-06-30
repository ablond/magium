import { normalizeBook1MomentIllustrations } from "./manual-images.mjs";

const book = readBookArg();

if (book !== "1") {
  console.error("Only --book 1 is supported by the image normalization pipeline.");
  process.exitCode = 1;
} else {
  normalizeBook1MomentIllustrations()
    .then((result) => {
      console.log(`Converted ${result.converted.length} Book 1 PNG/JPG illustration(s) to WebP.`);
      console.log(`Archived originals under ${result.originalsRoot}`);
      for (const item of result.converted) {
        console.log(`- ${item.id}: ${item.target}`);
      }
      if (result.skipped.length) {
        console.log(`Skipped ${result.skipped.length} moment(s) without PNG/JPG source.`);
      }
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
