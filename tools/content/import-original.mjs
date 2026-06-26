import fs from "node:fs/promises";
import path from "node:path";
import {
  ARCHIVE_ROOT,
  SOURCE_BASE_URL,
  SOURCE_OWNER,
  SOURCE_REF,
  SOURCE_REPO,
} from "./constants.mjs";
import {
  ensureDir,
  githubBuffer,
  githubJson,
  pathExists,
  readJson,
  sha256Hex,
  writeJson,
} from "./utils.mjs";

const apiBase = `https://api.github.com/repos/${SOURCE_OWNER}/${SOURCE_REPO}`;

async function main() {
  const commit = await githubJson(`${apiBase}/commits/${SOURCE_REF}`);
  const sourceCommit = commit.sha;
  const archiveRoot = path.join(ARCHIVE_ROOT, sourceCommit);
  const currentPath = path.join(ARCHIVE_ROOT, "current.json");
  const manifestPath = path.join(archiveRoot, "manifest.json");

  if (!process.env.MAGIUM_FORCE_IMPORT && await pathExists(currentPath) && await pathExists(manifestPath)) {
    const current = await readJson(currentPath);
    if (current.sourceCommit === sourceCommit) {
      const manifest = await readJson(manifestPath);
      console.log(`Archive already current for ${SOURCE_OWNER}/${SOURCE_REPO}@${sourceCommit} (${manifest.files.length} files)`);
      return;
    }
  }

  const tree = await githubJson(`${apiBase}/git/trees/${sourceCommit}?recursive=1`);

  const sourceFiles = tree.tree
    .filter((entry) => entry.type === "blob")
    .filter((entry) => entry.path === "README.md" || entry.path === "LICENSE" || entry.path.startsWith("chapters/"))
    .sort((a, b) => a.path.localeCompare(b.path, "en", { numeric: true }));

  if (sourceFiles.length === 0) {
    throw new Error("No source files found in original Magium repository");
  }

  const entries = [];
  await ensureDir(archiveRoot);

  for (const file of sourceFiles) {
    const rawUrl = `https://raw.githubusercontent.com/${SOURCE_OWNER}/${SOURCE_REPO}/${sourceCommit}/${file.path}`;
    const buffer = await githubBuffer(rawUrl);
    const destination = path.join(archiveRoot, file.path);
    await ensureDir(path.dirname(destination));
    await fs.writeFile(destination, buffer);
    entries.push({
      path: file.path,
      size: buffer.byteLength,
      sha256: sha256Hex(buffer),
    });
  }

  const magiumCount = entries.filter((entry) => entry.path.endsWith(".magium")).length;
  const manifest = {
    source: {
      repository: SOURCE_BASE_URL,
      ref: SOURCE_REF,
      commit: sourceCommit,
      importedAt: new Date().toISOString(),
    },
    license: {
      software: "MIT",
      data: "CC BY 4.0, as stated in the original repository README",
    },
    counts: {
      files: entries.length,
      magiumFiles: magiumCount,
    },
    files: entries,
  };

  await writeJson(path.join(archiveRoot, "manifest.json"), manifest);
  await writeJson(path.join(ARCHIVE_ROOT, "current.json"), {
    sourceCommit,
    archivePath: path.relative(process.cwd(), archiveRoot),
  });

  if (magiumCount !== 54) {
    throw new Error(`Expected 54 .magium files, found ${magiumCount}`);
  }

  console.log(`Archived ${entries.length} files from ${SOURCE_OWNER}/${SOURCE_REPO}@${sourceCommit}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
