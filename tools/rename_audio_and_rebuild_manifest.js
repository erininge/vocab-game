#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

const ROOT_DIR = path.resolve(__dirname, "..");
const AUDIO_DIR = path.join(ROOT_DIR, "Audio");
const OUTPUT_PATH = path.join(AUDIO_DIR, "audio-manifest.json");

const IGNORED_FILES = new Set([".DS_Store"]);
const MAX_FILENAME_LENGTH = 80;

function isIgnoredEntry(name) {
  return name === "__MACOSX" || IGNORED_FILES.has(name) || name.startsWith("._");
}

function containsIgnoredSegment(filePath) {
  return filePath.split(path.sep).some((segment) => segment === "__MACOSX");
}

function listVoiceFolders() {
  return fs
    .readdirSync(AUDIO_DIR, { withFileTypes: true })
    .filter((dirent) => dirent.isDirectory())
    .map((dirent) => dirent.name)
    .filter((name) => !isIgnoredEntry(name))
    .sort((a, b) => a.localeCompare(b, "en"));
}

function extractTextFromFilename(filename) {
  const base = filename.replace(/\.wav$/i, "");
  const lastUnderscore = base.lastIndexOf("_");
  const rawText = lastUnderscore === -1 ? base : base.slice(lastUnderscore + 1);
  try {
    return decodeURIComponent(rawText).normalize("NFC").trim();
  } catch (error) {
    console.warn(`Warning: Failed to decode text from ${filename}: ${error.message}`);
    return rawText.normalize("NFC").trim();
  }
}

function sanitizeFilename(text) {
  const normalized = (text || "").normalize("NFC").trim();
  const withUnderscore = normalized.replace(/\s+/g, "_");
  const withoutInvalid = withUnderscore
    .replace(/[\/\\?%*:|"<>]/g, "")
    .replace(/[\u0000-\u001F\u007F]/g, "");
  const filtered = Array.from(withoutInvalid)
    .filter((char) => /[A-Za-z0-9\u3040-\u30FF\u3400-\u4DBF\u4E00-\u9FFFー_]/.test(char))
    .join("");
  const trimmed = Array.from(filtered).slice(0, MAX_FILENAME_LENGTH).join("");
  return trimmed || "untitled";
}

function toManifestPath(voiceFolder, filename) {
  return `./Audio/${voiceFolder}/${filename}`.replace(/\\/g, "/");
}

function walkWavFiles(dir) {
  const results = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (isIgnoredEntry(entry.name)) continue;
    const fullPath = path.join(dir, entry.name);
    if (containsIgnoredSegment(fullPath)) continue;
    if (entry.isDirectory()) {
      results.push(...walkWavFiles(fullPath));
      continue;
    }
    if (!entry.isFile()) continue;
    if (!entry.name.toLowerCase().endsWith(".wav")) continue;
    results.push(fullPath);
  }
  return results;
}

function ensureUniqueFilename(baseName, usedNames, targetDir) {
  let candidate = `${baseName}.wav`;
  if (!usedNames.has(candidate) && !fs.existsSync(path.join(targetDir, candidate))) {
    usedNames.add(candidate);
    return { filename: candidate, suffix: null };
  }
  let counter = 2;
  while (counter < 1000) {
    candidate = `${baseName}__${counter}.wav`;
    if (!usedNames.has(candidate) && !fs.existsSync(path.join(targetDir, candidate))) {
      usedNames.add(candidate);
      return { filename: candidate, suffix: counter };
    }
    counter += 1;
  }
  throw new Error(`Unable to find unique filename for ${baseName}`);
}

function renameAudioFiles() {
  const manifest = {};
  const collisions = [];
  const duplicates = [];

  const voiceFolders = listVoiceFolders();
  if (voiceFolders.length === 0) {
    throw new Error("No voice folders found in Audio/.");
  }

  for (const voiceFolder of voiceFolders) {
    const voiceDir = path.join(AUDIO_DIR, voiceFolder);
    const usedNames = new Set(
      fs
        .readdirSync(voiceDir, { withFileTypes: true })
        .filter((dirent) => dirent.isFile())
        .map((dirent) => dirent.name),
    );
    const files = walkWavFiles(voiceDir).sort((a, b) => a.localeCompare(b, "en"));

    for (const filePath of files) {
      const filename = path.basename(filePath);
      if (isIgnoredEntry(filename)) continue;
      const textKey = extractTextFromFilename(filename);
      if (!textKey) continue;

      const baseName = sanitizeFilename(textKey);
      const { filename: newFilename, suffix } = ensureUniqueFilename(
        baseName,
        usedNames,
        voiceDir,
      );
      if (suffix) {
        collisions.push({ voiceFolder, original: filename, renamed: newFilename });
      }

      const newPath = path.join(voiceDir, newFilename);
      if (path.resolve(filePath) !== path.resolve(newPath)) {
        fs.renameSync(filePath, newPath);
      }

      if (!manifest[textKey]) manifest[textKey] = {};
      if (manifest[textKey][voiceFolder]) {
        duplicates.push({
          textKey,
          voiceFolder,
          kept: manifest[textKey][voiceFolder],
          extra: toManifestPath(voiceFolder, newFilename),
        });
        continue;
      }
      manifest[textKey][voiceFolder] = toManifestPath(voiceFolder, newFilename);
    }
  }

  const sortedKeys = Object.keys(manifest).sort((a, b) => a.localeCompare(b, "ja"));
  const sortedManifest = {};
  for (const key of sortedKeys) {
    const voiceEntries = manifest[key];
    const sortedVoiceKeys = Object.keys(voiceEntries).sort((a, b) =>
      a.localeCompare(b, "en"),
    );
    sortedManifest[key] = {};
    for (const voiceKey of sortedVoiceKeys) {
      sortedManifest[key][voiceKey] = voiceEntries[voiceKey];
    }
  }

  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(sortedManifest, null, 2) + "\n");

  if (collisions.length > 0) {
    console.warn("Filename collisions detected (suffix added):");
    for (const entry of collisions) {
      console.warn(`- ${entry.voiceFolder}: ${entry.original} -> ${entry.renamed}`);
    }
  }

  if (duplicates.length > 0) {
    console.warn("Duplicate text keys detected (keeping first):");
    for (const dup of duplicates) {
      console.warn(
        `- ${dup.textKey} / ${dup.voiceFolder}: kept ${dup.kept}, skipped ${dup.extra}`,
      );
    }
  }

  console.log(`Manifest updated: ${path.relative(ROOT_DIR, OUTPUT_PATH)}`);
}

renameAudioFiles();
