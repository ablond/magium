import fs from "node:fs/promises";
import path from "node:path";
import { walkFiles } from "./utils.mjs";

async function main() {
  const distRoot = path.resolve("dist");
  const files = await walkFiles(distRoot);
  for (const file of files) {
    if (file.endsWith(".magium")) {
      throw new Error(`Raw .magium file leaked into dist: ${path.relative(distRoot, file)}`);
    }
    if (file.endsWith(".json") && !file.endsWith("manifest.webmanifest")) {
      throw new Error(`Unexpected JSON asset in dist: ${path.relative(distRoot, file)}`);
    }
    const stat = await fs.stat(file);
    if (stat.size < 2_000_000) {
      const content = await fs.readFile(file, "utf8").catch(() => "");
      if (content.includes("ID: Ch1-Intro1") || content.includes("chapters/ch1.magium")) {
        throw new Error(`Raw story content leaked into dist: ${path.relative(distRoot, file)}`);
      }
    }
  }
  console.log("Dist verified: no raw .magium or canonical JSON assets");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
