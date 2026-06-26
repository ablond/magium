import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { ARCHIVE_ROOT } from "./constants.mjs";

export async function ensureDir(dir) {
  await fs.mkdir(dir, { recursive: true });
}

export async function pathExists(target) {
  try {
    await fs.access(target);
    return true;
  } catch {
    return false;
  }
}

export async function readJson(file) {
  return JSON.parse(await fs.readFile(file, "utf8"));
}

export async function writeJson(file, value) {
  await ensureDir(path.dirname(file));
  await fs.writeFile(file, `${JSON.stringify(value, null, 2)}\n`);
}

export async function writeText(file, value) {
  await ensureDir(path.dirname(file));
  await fs.writeFile(file, value);
}

export function sha256Hex(input) {
  return crypto.createHash("sha256").update(input).digest("hex");
}

export function base64(input) {
  return Buffer.from(input).toString("base64");
}

export async function githubJson(url) {
  const response = await fetch(url, {
    headers: {
      "Accept": "application/vnd.github+json",
      "User-Agent": "magium-pwa-content-pipeline",
    },
  });
  if (!response.ok) {
    throw new Error(`GitHub request failed ${response.status}: ${url}`);
  }
  return response.json();
}

export async function githubBuffer(url) {
  const response = await fetch(url, {
    headers: { "User-Agent": "magium-pwa-content-pipeline" },
  });
  if (!response.ok) {
    throw new Error(`GitHub raw request failed ${response.status}: ${url}`);
  }
  return Buffer.from(await response.arrayBuffer());
}

export function naturalCompare(a, b) {
  return a.localeCompare(b, "en", { numeric: true, sensitivity: "base" });
}

export async function latestArchivePointer() {
  const pointerPath = path.join(ARCHIVE_ROOT, "current.json");
  return readJson(pointerPath);
}

export async function latestArchiveRoot() {
  const pointer = await latestArchivePointer();
  return path.join(ARCHIVE_ROOT, pointer.sourceCommit);
}

export async function walkFiles(root) {
  const files = [];
  async function visit(dir) {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        await visit(fullPath);
      } else if (entry.isFile()) {
        files.push(fullPath);
      }
    }
  }
  if (await pathExists(root)) {
    await visit(root);
  }
  return files.sort(naturalCompare);
}

export function stableStringify(value) {
  return JSON.stringify(sortObject(value));
}

function sortObject(value) {
  if (Array.isArray(value)) {
    return value.map(sortObject);
  }
  if (!value || typeof value !== "object") {
    return value;
  }
  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .map((key) => [key, sortObject(value[key])]),
  );
}
