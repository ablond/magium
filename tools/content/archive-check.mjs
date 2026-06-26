import fs from "node:fs/promises";
import path from "node:path";
import { latestArchiveRoot, readJson, sha256Hex } from "./utils.mjs";

async function main() {
  const archiveRoot = await latestArchiveRoot();
  const manifest = await readJson(path.join(archiveRoot, "manifest.json"));
  let magiumCount = 0;

  for (const entry of manifest.files) {
    const filePath = path.join(archiveRoot, entry.path);
    const buffer = await fs.readFile(filePath);
    const actual = sha256Hex(buffer);
    if (actual !== entry.sha256) {
      throw new Error(`Archive hash mismatch for ${entry.path}`);
    }
    if (entry.path.endsWith(".magium")) {
      magiumCount += 1;
    }
  }

  if (magiumCount !== 54) {
    throw new Error(`Archive expected 54 .magium files, found ${magiumCount}`);
  }

  console.log(`Archive verified: ${manifest.files.length} files, ${magiumCount} .magium files`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
