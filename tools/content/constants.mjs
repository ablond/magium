import path from "node:path";

export const SOURCE_OWNER = "raduprv";
export const SOURCE_REPO = "Magium";
export const SOURCE_REF = process.env.MAGIUM_SOURCE_REF || "main";
export const SOURCE_BASE_URL = `https://github.com/${SOURCE_OWNER}/${SOURCE_REPO}`;
export const ARCHIVE_ROOT = path.resolve("content/archive/original");
export const CANONICAL_ROOT = path.resolve("content/canonical/v1");
export const GENERATED_ROOT = path.resolve("src/generated");
export const PUBLIC_ROOT = path.resolve("public");
export const RUNTIME_FORMAT_VERSION = 1;
export const INITIAL_SCENE_ID = "Ch1-Intro1";
export const DEFAULT_LOCALE = "en";
