#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

const ROOT_DIR = path.resolve(__dirname, "..");
const AUDIO_DIR = path.join(ROOT_DIR, "Audio");
const OUTPUT_PATH = path.join(AUDIO_DIR, "audio-manifest.json");

const IGNORED_FILES = new Set([".DS_Store"]);

function isIgnoredEntry(name) {
  return name === "__MACOSX" || IGNORED_FILES.has(name) || name.startsWith("._");
}

function listVoiceFolders() {
  return fs
    .readdirSync(AUDIO_DIR, { withFileTypes: true })
    .filter((dirent) => dirent.isDirectory())
    .map((dirent) => dirent.name)
    .filter((name) => !isIgnoredEntry(name))
    .sort((a, b) => a.localeCompare(b, "en"));
}

function extractKey(filename) {
  const base = filename.replace(/\.wav$/i, "");
  const lastUnderscore = base.lastIndexOf("_");
  const rawKey = lastUnderscore === -1 ? base : base.slice(lastUnderscore + 1);
  try {
    return decodeURIComponent(rawKey).normalize("NFC");
  } catch (error) {
    console.warn(`Warning: Failed to decode key from ${filename}: ${error.message}`);
    return rawKey.normalize("NFC");
  }
}

function toRelativePath(fullPath) {
  return path.relative(ROOT_DIR, fullPath).split(path.sep).join("/");
}

function choosePreferredPath(existingPath, candidatePath) {
  if (!existingPath) return candidatePath;
  if (candidatePath.length < existingPath.length) return candidatePath;
  return existingPath;
}

function rebuildManifest() {
  const manifest = {};
  const duplicates = [];

  const voiceFolders = listVoiceFolders();
  if (voiceFolders.length === 0) {
    throw new Error("No voice folders found in Audio/.");
  }

  for (const voiceFolder of voiceFolders) {
    const voiceDir = path.join(AUDIO_DIR, voiceFolder);
    const entries = fs.readdirSync(voiceDir, { withFileTypes: true });

    for (const entry of entries) {
      if (!entry.isFile()) continue;
      if (isIgnoredEntry(entry.name)) continue;
      if (!entry.name.toLowerCase().endsWith(".wav")) continue;

      const key = extractKey(entry.name);
      const relativePath = toRelativePath(path.join(voiceDir, entry.name));

      if (!manifest[key]) {
        manifest[key] = {};
      }

      const existingPath = manifest[key][voiceFolder];
      const preferredPath = choosePreferredPath(existingPath, relativePath);

      if (existingPath && preferredPath !== existingPath) {
        duplicates.push({ key, voiceFolder, existingPath, relativePath });
      } else if (existingPath && preferredPath === existingPath) {
        duplicates.push({ key, voiceFolder, existingPath, relativePath });
      }

      manifest[key][voiceFolder] = preferredPath;
    }
  }

  const sortedKeys = Object.keys(manifest).sort((a, b) => a.localeCompare(b, "ja"));
  const sortedManifest = {};
  for (const key of sortedKeys) {
    const voiceEntries = manifest[key];
    const sortedVoiceKeys = Object.keys(voiceEntries).sort((a, b) =>
      a.localeCompare(b, "en")
    );
    sortedManifest[key] = {};
    for (const voiceKey of sortedVoiceKeys) {
      sortedManifest[key][voiceKey] = voiceEntries[voiceKey];
    }
  }

  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(sortedManifest, null, 2) + "\n");

  if (duplicates.length > 0) {
    console.warn("Duplicate key+voiceFolder mappings detected:");
    for (const dup of duplicates) {
      console.warn(
        `- ${dup.key} / ${dup.voiceFolder}: kept ${dup.existingPath}, saw ${dup.relativePath}`
      );
    }
  }

  console.log(`Manifest updated: ${path.relative(ROOT_DIR, OUTPUT_PATH)}`);
}

rebuildManifest();
