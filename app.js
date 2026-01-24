/* Kat's Vocab Garden (PWA)
   - Loads vocab JSONs from Vocabulary/
   - Category == filename (without extension)
   - Lessons follow the python structure: { level, lessons: { "1": [ {kana, kanji, en:[...], ...}, ... ] } }
*/

const APP_VERSION = "v0.3.42";
const STAR_STORAGE_KEY = "vocabGardenStarred";
const AUDIO_VOICE_DEFAULT = "Female option 1";
const FIXED_AUDIO_VOLUME = 2.5;
const SILENT_AUDIO_URI = "data:audio/wav;base64,UklGRiYAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQIAAAAAAA==";

const els = {
  versionLine: document.getElementById("versionLine"),
  footerLine: document.getElementById("footerLine"),
  selectionCount: document.getElementById("selectionCount"),
  installBtn: document.getElementById("installBtn"),

  screenHome: document.getElementById("screenHome"),
  screenVocab: document.getElementById("screenVocab"),
  screenExport: document.getElementById("screenExport"),
  screenQuiz: document.getElementById("screenQuiz"),
  screenDone: document.getElementById("screenDone"),

  levelSelect: document.getElementById("levelSelect"),
  questionMode: document.getElementById("questionMode"),
  answerMode: document.getElementById("answerMode"),
  practiceMode: document.getElementById("practiceMode"),
  displayMode: document.getElementById("displayMode"),
  qCount: document.getElementById("qCount"),
  audioEnabled: document.getElementById("audioEnabled"),
  audioVoice: document.getElementById("audioVoice"),
  testAudioBtn: document.getElementById("testAudioBtn"),
  practiceHelp: document.getElementById("practiceHelp"),

  lessonHelp: document.getElementById("lessonHelp"),
  lessonBox: document.getElementById("lessonBox"),

  startBtn: document.getElementById("startBtn"),
  viewVocabBtn: document.getElementById("viewVocabBtn"),

  quizMeta: document.getElementById("quizMeta"),
  promptLine: document.getElementById("promptLine"),
  subpromptLine: document.getElementById("subpromptLine"),
  answerArea: document.getElementById("answerArea"),
  feedback: document.getElementById("feedback"),
  submitBtn: document.getElementById("submitBtn"),
  nextBtn: document.getElementById("nextBtn"),
  playBtn: document.getElementById("playBtn"),
  starBtn: document.getElementById("starBtn"),
  quitBtn: document.getElementById("quitBtn"),

  scoreLine: document.getElementById("scoreLine"),
  backHomeBtn: document.getElementById("backHomeBtn"),

  vocabMeta: document.getElementById("vocabMeta"),
  vocabList: document.getElementById("vocabList"),
  vocabHelp: document.getElementById("vocabHelp"),
  backFromVocabBtn: document.getElementById("backFromVocabBtn"),

  exportMissingAudioBtn: document.getElementById("exportMissingAudioBtn"),
  exportVoice: document.getElementById("exportVoice"),
  exportList: document.getElementById("exportList"),
  exportMeta: document.getElementById("exportMeta"),
  exportHelp: document.getElementById("exportHelp"),
  downloadExportBtn: document.getElementById("downloadExportBtn"),
  backFromExportBtn: document.getElementById("backFromExportBtn"),
};

let deferredInstallPrompt = null;

function setFooter(text) {
  els.footerLine.textContent = text;
}

function setSelectionCount(text) {
  if (!els.selectionCount) return;
  els.selectionCount.textContent = text;
}

function show(screen) {
  els.screenHome.hidden = screen !== "home";
  els.screenVocab.hidden = screen !== "vocab";
  if (els.screenExport) els.screenExport.hidden = screen !== "export";
  els.screenQuiz.hidden = screen !== "quiz";
  els.screenDone.hidden = screen !== "done";
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

function normalizeEnglish(s) {
  return (s || "")
    .toLowerCase()
    .replace(/\(.*?\)/g, "")             // drop parenthetical hints
    .replace(/['".,!?;:]/g, " ")         // punctuation -> space
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeJapanese(s) {
  // Keep it simple but robust (works well with kana/kanji typing + mobile IME quirks)
  return (s || "")
    .normalize("NFC")
    .replace(/\(.*?\)/g, "")
    .replace(/[\s、。・，．!！?？「」『』【】\[\]{}（）()"'’“”\-–—]/g, "")
    .trim();
}

let AUDIO_MANIFEST = null;
let audioSessionConfigured = false;
let activeAudio = null;
let audioPlayer = null;
let audioNodes = null;
let audioContext = null;
let audioPlayToken = 0;
let audioPrimed = false;
async function loadAudioManifest() {
  if (AUDIO_MANIFEST) return AUDIO_MANIFEST;
  try {
    const res = await fetch("./Audio/audio-manifest.json", { cache: "no-store" });
    if (!res.ok) throw new Error("missing");
    AUDIO_MANIFEST = await res.json();
  } catch (e) {
    AUDIO_MANIFEST = {}; // graceful fallback
  }
  return AUDIO_MANIFEST;
}

function resolveVoiceFolder(manifest, preferred) {
  if (!manifest || !preferred) return preferred;
  const entries = Object.values(manifest);
  for (const entry of entries) {
    if (entry && entry[preferred]) return preferred;
  }
  const available = new Set();
  for (const entry of entries) {
    if (!entry || typeof entry !== "object") continue;
    for (const key of Object.keys(entry)) {
      if (key) available.add(key);
    }
  }
  const fallback = [...available][0];
  if (fallback && fallback !== preferred) {
    console.warn(`Audio voice "${preferred}" not found, using "${fallback}" instead.`);
  }
  return fallback || preferred;
}

function getPreferredAudioVoice() {
  if (state.settings && state.settings.audioVoice) return state.settings.audioVoice;
  if (els.audioVoice && els.audioVoice.value) return els.audioVoice.value;
  return AUDIO_VOICE_DEFAULT;
}

function listAvailableVoices(manifest) {
  const available = new Set();
  if (!manifest) return [];
  for (const entry of Object.values(manifest)) {
    if (!entry || typeof entry !== "object") continue;
    for (const key of Object.keys(entry)) {
      if (key) available.add(key);
    }
  }
  return [...available].sort((a, b) => a.localeCompare(b));
}

async function configureAudioSession() {
  if (audioSessionConfigured) return;
  const session = navigator.audioSession;
  if (!session) return;
  try {
    if ("type" in session) {
      session.type = "ambient";
    }
    audioSessionConfigured = true;
  } catch (e) {
    // Ignore unsupported audio session configuration.
  }
}

function clearActiveAudio(audio) {
  if (audio && audio === activeAudio) {
    activeAudio = null;
  }
}

function stopActiveAudio() {
  if (!activeAudio) return;
  const audio = activeAudio;
  clearActiveAudio(audio);
  if (!audio.paused) {
    audio.pause();
  }
  try {
    audio.currentTime = 0;
  } catch (e) {}
}

function waitForPlayableAudio(audio) {
  if (audio.readyState >= 2) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const onReady = () => resolve();
    const onError = () => reject(new Error("error"));
    audio.addEventListener("canplay", onReady, { once: true });
    audio.addEventListener("loadeddata", onReady, { once: true });
    audio.addEventListener("error", onError, { once: true });
  });
}

async function ensureAudioContext() {
  if (!window.AudioContext && !window.webkitAudioContext) return null;
  if (!audioContext) {
    audioContext = new (window.AudioContext || window.webkitAudioContext)();
  }
  if (audioContext.state === "suspended") {
    try {
      await audioContext.resume();
    } catch (e) {
      // ignore resume failures
    }
  }
  return audioContext;
}

async function primeAudioPlayback() {
  if (!els.audioEnabled || !els.audioEnabled.checked) return;
  const volume = Math.max(0, FIXED_AUDIO_VOLUME);
  if (volume <= 0) return;
  await configureAudioSession();
  if (volume > 1) {
    await ensureAudioNodes();
  } else {
    await ensureAudioContext();
  }
  await warmAudioPlayer();
}

async function warmAudioPlayer() {
  if (audioPrimed) return;
  const player = getAudioPlayer();
  const previousSrc = player.src;
  const previousMuted = player.muted;
  const previousVolume = player.volume;
  player.muted = true;
  player.volume = 0;
  player.src = SILENT_AUDIO_URI;
  player.load();
  let played = false;
  try {
    await player.play();
    played = true;
  } catch (e) {
    // Some platforms still block; we'll try again on next gesture.
  }
  try {
    player.pause();
  } catch (e) {}
  try {
    player.currentTime = 0;
  } catch (e) {}
  player.muted = previousMuted;
  player.volume = previousVolume;
  if (previousSrc) {
    player.src = previousSrc;
    player.load();
  } else {
    player.removeAttribute("src");
  }
  if (played) {
    audioPrimed = true;
  }
}

function getAudioPlayer() {
  if (!audioPlayer) {
    audioPlayer = new Audio();
    audioPlayer.playsInline = true;
    audioPlayer.setAttribute("playsinline", "");
    audioPlayer.setAttribute("webkit-playsinline", "");
    audioPlayer.preload = "auto";
  }
  return audioPlayer;
}

async function ensureAudioNodes() {
  const context = await ensureAudioContext();
  if (!context) return null;
  if (!audioNodes) {
    const player = getAudioPlayer();
    const source = context.createMediaElementSource(player);
    const gainNode = context.createGain();
    source.connect(gainNode);
    gainNode.connect(context.destination);
    audioNodes = { source, gainNode };
  }
  return audioNodes;
}

async function playAudioFromUrl(url, normalizedVolume) {
  const token = ++audioPlayToken;
  stopActiveAudio();
  const audio = getAudioPlayer();
  audio.pause();
  try {
    audio.currentTime = 0;
  } catch (e) {}
  audio.src = url;
  audio.load();
  const volume = Math.max(0, Number(normalizedVolume) || 0);
  if (volume > 1) {
    const nodes = await ensureAudioNodes();
    if (nodes) {
      nodes.gainNode.gain.value = volume;
      audio.volume = 1;
    } else {
      audio.volume = 1;
    }
  } else if (audioNodes) {
    audioNodes.gainNode.gain.value = Math.min(1, volume);
    audio.volume = 1;
  } else {
    audio.volume = Math.min(1, volume);
  }
  const handleEnded = () => {
    clearActiveAudio(audio);
  };
  activeAudio = audio;
  audio.addEventListener("ended", handleEnded, { once: true });
  audio.addEventListener("pause", handleEnded, { once: true });
  await Promise.race([
    waitForPlayableAudio(audio),
    new Promise((resolve) => setTimeout(resolve, 8000)),
  ]);
  if (token !== audioPlayToken) return;
  try {
    audio.currentTime = 0;
  } catch (e) {}
  await audio.play();
}

function normalizeAudioUrl(rel) {
  if (!rel) return null;
  const normalized = rel.startsWith("./") ? rel : ("./" + rel.replace(/^\/+/, ""));
  return encodeURI(normalized);
}

function manifestLookup(manifest, key, voiceFolder) {
  if (!manifest) return null;
  const entry = manifest[key];
  if (!entry) return null;
  const rel = entry[voiceFolder];
  if (!rel) return null;
  return normalizeAudioUrl(rel);
}


function pickOne(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

async function registerSW() {
  if (!("serviceWorker" in navigator)) return;
  try {
    await navigator.serviceWorker.register("./sw.js");
  } catch (e) {
    console.warn("SW registration failed", e);
  }
}

function wireInstall() {
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferredInstallPrompt = e;
    els.installBtn.hidden = false;
  });

  els.installBtn.addEventListener("click", async () => {
    if (!deferredInstallPrompt) return;
    deferredInstallPrompt.prompt();
    await deferredInstallPrompt.userChoice;
    deferredInstallPrompt = null;
    els.installBtn.hidden = true;
  });
}

// --- Vocab discovery ---
// Prefer GitHub API auto-discovery for easy adding of JSON files.
// Falls back to Vocabulary/vocab-manifest.json if API is unavailable.
function inferGitHubRepo() {
  const host = window.location.hostname; // <user>.github.io
  const parts = host.split(".");
  const isGhPages = parts.length >= 3 && parts[1] === "github" && parts[2] === "io";
  if (!isGhPages) return null;

  const user = parts[0];
  const pathSeg = window.location.pathname.replace(/^\/+/, "").split("/")[0];
  const repo = pathSeg || ""; // if user site, repo is empty
  if (!repo) return null; // user site uncommon; skip
  return { user, repo };
}

async function listVocabFiles() {
  // 1) GitHub API
  const gh = inferGitHubRepo();
  if (gh) {
    try {
      const url = `https://api.github.com/repos/${gh.user}/${gh.repo}/contents/Vocabulary`;
      const res = await fetch(url, { headers: { "Accept": "application/vnd.github+json" } });
      if (res.ok) {
        const data = await res.json();
        const files = (data || [])
          .filter(x => x && x.type === "file" && typeof x.name === "string" && x.name.endsWith(".json"))
          .map(x => x.name)
          .filter(n => n !== "vocab-manifest.json")
          .sort((a,b) => a.localeCompare(b));
        if (files.length) return files;
      }
    } catch (e) {
      // ignore
    }
  }

  // 2) Local manifest fallback
  try {
    const res = await fetch("./Vocabulary/vocab-manifest.json");
    if (!res.ok) throw new Error("manifest fetch failed");
    const data = await res.json();
    const files = (data.files || []).filter(n => typeof n === "string" && n.endsWith(".json"));
    return files;
  } catch (e) {
    return [];
  }
}

async function loadVocabFile(filename) {
  const res = await fetch(`./Vocabulary/${encodeURIComponent(filename)}`);
  if (!res.ok) throw new Error(`Failed to load ${filename}`);
  return await res.json();
}

function categoryLabel(filename) {
  return filename.replace(/\.json$/i, "");
}

function lessonLabel(vocabData, key) {
  const names = vocabData?.lessonNames || {};
  return names[String(key)] || `Lesson ${key}`;
}

function renderLessonPills(vocabData, lessonKeys) {
  els.lessonBox.innerHTML = "";
  const sorted = [...lessonKeys].sort((a,b) => Number(a) - Number(b));
  for (const k of sorted) {
    const id = `lesson_${k}`;
    const label = document.createElement("label");
    label.className = "pill";
    label.htmlFor = id;
    const cb = document.createElement("input");
    cb.type = "checkbox";
    cb.id = id;
    cb.value = k;
    cb.checked = true;
    const span = document.createElement("span");
    span.textContent = lessonLabel(vocabData, k);
    label.appendChild(cb);
    label.appendChild(span);
    els.lessonBox.appendChild(label);
  }
}

function countSelectedWords(vocabData, lessonList) {
  if (!vocabData || !lessonList) return 0;
  const lessons = vocabData.lessons || {};
  return lessonList.reduce((sum, lk) => {
    const words = lessons[String(lk)] || [];
    return sum + words.length;
  }, 0);
}

function updateSelectionFooter() {
  const lessonList = selectedLessons();
  const totalWords = countSelectedWords(state.vocabData, lessonList);
  const label = totalWords === 1 ? "word" : "words";
  setSelectionCount(`Selected: ${totalWords} ${label}`);
}

function selectedLessons() {
  const cbs = [...els.lessonBox.querySelectorAll("input[type=checkbox]")];
  return cbs.filter(c => c.checked).map(c => c.value);
}

function getDisplayJP(card, mode) {
  const kana = card.kana || "";
  const kanji = card.kanji || "";
  if (mode === "kana") return kana || kanji || "";
  if (mode === "kanji") return kanji || kana || "";
  // both
  if (kana && kanji && kana !== kanji) return `${kana}  (${kanji})`;
  return kana || kanji || "";
}

function getDisplayEN(card) {
  const enList = Array.isArray(card.en) ? card.en.filter(Boolean) : [];
  return enList.length ? enList.join(", ") : "(no English provided)";
}

function renderVocabList(pool, file, vocabData) {
  if (!els.vocabList) return;
  els.vocabList.innerHTML = "";
  const sorted = [...pool].sort((a, b) => {
    const lessonDiff = Number(a._lesson) - Number(b._lesson);
    if (lessonDiff !== 0) return lessonDiff;
    const jpA = `${a.kana || ""}${a.kanji || ""}`;
    const jpB = `${b.kana || ""}${b.kanji || ""}`;
    const jpDiff = jpA.localeCompare(jpB, "ja");
    if (jpDiff !== 0) return jpDiff;
    return getDisplayEN(a).localeCompare(getDisplayEN(b));
  });

  for (const card of sorted) {
    const row = document.createElement("div");
    row.className = "vocabRow";

    const star = document.createElement("span");
    const starred = isStarred(card, file);
    star.className = "vocabStar";
    star.textContent = starred ? "⭐" : "☆";
    star.title = starred ? "Starred" : "Not starred";

    const info = document.createElement("div");
    info.className = "vocabInfo";

    const term = document.createElement("div");
    term.className = "vocabTerm";
    term.textContent = getDisplayJP(card, "both") || "(no JP provided)";

    const meaning = document.createElement("div");
    meaning.className = "vocabMeaning";
    meaning.textContent = getDisplayEN(card);

    info.appendChild(term);
    info.appendChild(meaning);

    const lesson = document.createElement("div");
    lesson.className = "vocabLesson";
    lesson.textContent = lessonLabel(vocabData, card._lesson);

    row.appendChild(star);
    row.appendChild(info);
    row.appendChild(lesson);
    els.vocabList.appendChild(row);
  }
}

async function openVocabPreview() {
  if (!els.vocabMeta || !els.vocabHelp) return;
  els.vocabHelp.textContent = "";
  els.vocabMeta.textContent = "";
  if (els.vocabList) {
    els.vocabList.innerHTML = "";
  }

  const file = els.levelSelect.value;
  const lessonList = selectedLessons();
  if (!lessonList.length) {
    els.vocabHelp.textContent = "Select at least one lesson to view vocab.";
    show("vocab");
    return;
  }

  try {
    let vocabData = state.vocabData;
    if (!vocabData || file !== state.currentFile) {
      vocabData = await loadVocabFile(file);
    }
    state.currentFile = file;
    state.vocabData = vocabData;

    const pool = buildPool(vocabData, lessonList, file);
    const lessonLabelCount = lessonList.length === 1 ? "lesson" : "lessons";
    const wordLabel = pool.length === 1 ? "word" : "words";
    els.vocabMeta.textContent = `${categoryLabel(file)} • ${lessonList.length} ${lessonLabelCount} • ${pool.length} ${wordLabel}`;

    if (!pool.length) {
      els.vocabHelp.textContent = "No vocab found for the selected lessons.";
      show("vocab");
      return;
    }

    renderVocabList(pool, file, vocabData);
    show("vocab");
  } catch (e) {
    els.vocabHelp.textContent = "Could not load vocab for that category.";
    show("vocab");
  }
}

// --- Quiz engine ---
let state = {
  files: [],
  currentFile: null,
  vocabData: null,
  pool: [],
  questions: [],
  idx: 0,
  correct: 0,
  wrong: 0,
  lastAnswer: null,
  settings: null,
  starred: new Set(),
};

function cardKey(card, file) {
  const en = Array.isArray(card.en) ? card.en.join("|") : "";
  return [file || "", card._lesson || "", card.kana || "", card.kanji || "", en].join("::");
}

function resolveStarKey(card, file) {
  if (!card) return "";
  const keyFile = file || state.currentFile || "";
  if (card._starKey && card._starKeyFile === keyFile) return card._starKey;
  const key = cardKey(card, keyFile);
  card._starKey = key;
  card._starKeyFile = keyFile;
  return key;
}

function loadStarred() {
  try {
    const raw = localStorage.getItem(STAR_STORAGE_KEY);
    const data = raw ? JSON.parse(raw) : [];
    if (Array.isArray(data)) return new Set(data.filter(Boolean));
  } catch (e) {}
  return new Set();
}

function saveStarred(set) {
  try {
    localStorage.setItem(STAR_STORAGE_KEY, JSON.stringify([...set]));
  } catch (e) {}
}

function isStarred(card, file) {
  const key = resolveStarKey(card, file);
  return state.starred.has(key);
}

function setStarred(card, shouldStar, file) {
  const key = resolveStarKey(card, file);
  if (shouldStar) {
    state.starred.add(key);
  } else {
    state.starred.delete(key);
  }
  saveStarred(state.starred);
}

function updateStarButton(card, file) {
  if (!els.starBtn) return;
  const starred = isStarred(card, file);
  els.starBtn.textContent = starred ? "⭐" : "☆";
  els.starBtn.classList.toggle("starred", starred);
  els.starBtn.setAttribute("aria-pressed", starred ? "true" : "false");
  els.starBtn.title = starred ? "Starred for review" : "Mark for review";
}

function buildPool(vocabData, lessonList, file) {
  const pool = [];
  const lessons = vocabData.lessons || {};
  for (const lk of lessonList) {
    const words = lessons[String(lk)] || [];
    for (const w of words) {
      const card = {
        ...w,
        _lesson: String(lk),
        level: vocabData.level || categoryLabel(file || state.currentFile),
      };
      card._starKey = resolveStarKey(card, file);
      pool.push(card);
    }
  }
  return pool;
}

function buildQuestions(pool, settings) {
  const qCount = Math.max(5, Math.min(200, Number(settings.qCount || 20)));
  const out = [];
  const used = new Set();

  // If pool is smaller than requested, allow repeats
  while (out.length < qCount) {
    const card = pickOne(pool);
    const key = `${card._lesson}|${card.kana}|${card.kanji}|${(card.en||[]).join("|")}`;
    if (pool.length >= qCount) {
      if (used.has(key)) continue;
      used.add(key);
    }

    const mode = settings.questionMode;
    let dir = mode;
    const listening = mode === "listening";
    if (mode === "mixed") dir = Math.random() < 0.5 ? "jp2en" : "en2jp";
    if (listening) dir = "jp2en";

    const answerMode = settings.answerMode === "mixed"
      ? (Math.random() < 0.5 ? "typing" : "multiple_choice")
      : settings.answerMode;

    const question = { dir, card, answerMode, listening };
    if (answerMode === "multiple_choice") {
      const { choices, correctText } = makeChoices(question, pool);
      question.choices = choices;
      question.correctText = correctText;
    }
    out.push(question);
  }
  return out;
}

function makeChoices(question, pool) {
  // returns { choices:[...], correctText:"..." }
  const { dir, card } = question;

  if (dir === "jp2en") {
    const correct = normalizeEnglish((card.en || [])[0] || "");
    const correctDisplay = (card.en || []).join(", ");
    const distractors = shuffle(pool)
      .filter(p => p !== card && (p.en || []).length)
      .slice(0, 20);

    const opts = new Set([correctDisplay]);
    for (const d of distractors) {
      const txt = (d.en || []).join(", ");
      if (txt && normalizeEnglish(txt) !== correct) opts.add(txt);
      if (opts.size >= 4) break;
    }
    const choices = shuffle([...opts]).slice(0, 4);
    // Ensure at least 2 choices
    return { choices, correctText: correctDisplay };
  }

  // en2jp
  const correctDisplay = getDisplayJP(card, "both");
  const correctN = normalizeJapanese(card.kana || card.kanji || "");
  const distractors = shuffle(pool)
    .filter(p => p !== card)
    .slice(0, 30);

  const opts = new Set([correctDisplay]);
  for (const d of distractors) {
    const txt = getDisplayJP(d, "both");
    const n = normalizeJapanese(d.kana || d.kanji || "");
    if (txt && n && n !== correctN) opts.add(txt);
    if (opts.size >= 4) break;
  }
  const choices = shuffle([...opts]).slice(0, 4);
  return { choices, correctText: correctDisplay };
}

function gradeTyping(question, userRaw) {
  const { dir, card } = question;

  if (dir === "jp2en") {
    const user = normalizeEnglish(userRaw);
    const expected = (card.en || []).map(normalizeEnglish).filter(Boolean);
    const ok = expected.includes(user);
    return { ok, expectedDisplay: (card.en || []).join(", ") };
  }

  const user = normalizeJapanese(userRaw);
  const expected = [];

  if (card.kana) expected.push(normalizeJapanese(card.kana));
  if (card.kanji) expected.push(normalizeJapanese(card.kanji));
  if (Array.isArray(card.kana_variants)) {
    for (const v of card.kana_variants) expected.push(normalizeJapanese(v));
  }
  const exp = expected.filter(Boolean);
  const ok = exp.includes(user);
  return { ok, expectedDisplay: getDisplayJP(card, "both") };
}

function setFeedback(ok, expectedDisplay) {
  els.feedback.hidden = false;
  els.feedback.innerHTML = ok
    ? `<strong>✅ Correct</strong>`
    : `<strong>❌ Not quite</strong><div class="muted" style="margin-top:6px">Correct answer: <b>${escapeHtml(expectedDisplay)}</b></div>`;
}

function clearFeedback() {
  els.feedback.hidden = true;
  els.feedback.textContent = "";
}

function escapeHtml(str) {
  return (str || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function renderQuestion() {
  const q = state.questions[state.idx];
  const { dir, card } = q;
  const answerMode = q.answerMode || state.settings.answerMode;

  const settings = state.settings;
  const dispMode = settings.displayMode;

  // header meta
  const cat = categoryLabel(state.currentFile);
  const lessonName = lessonLabel(state.vocabData, card._lesson);
  els.quizMeta.textContent = `${cat} • ${lessonName} • ${state.idx + 1}/${state.questions.length}`;

  clearFeedback();
  els.nextBtn.disabled = true;
  els.submitBtn.disabled = false;

  // prompt + subprompt
  if (dir === "jp2en") {
    if (q.listening) {
      els.promptLine.textContent = "🔊";
      els.subpromptLine.textContent = state.settings.audioEnabled
        ? "Listen to the audio and answer in English."
        : "Enable audio to hear the prompt.";
    } else {
      els.promptLine.textContent = getDisplayJP(card, dispMode);
      els.subpromptLine.textContent = "Type the English meaning (or pick one).";
    }
  } else {
    // pick an English prompt (first meaning)
    els.promptLine.textContent = (card.en || [])[0] || "(no English provided)";
    els.subpromptLine.textContent = "Type the Japanese (kana or kanji accepted), or pick one.";
  }

  // answer UI
  els.answerArea.innerHTML = "";
  state.lastAnswer = { mode: answerMode, value: null };

  if (answerMode === "multiple_choice") {
    const choices = q.choices || makeChoices(q, state.pool).choices;
    const wrap = document.createElement("div");
    wrap.className = "choiceList";

    for (const c of choices) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "choiceBtn";
      btn.textContent = c;
      btn.addEventListener("click", () => {
        for (const b of wrap.querySelectorAll(".choiceBtn")) b.classList.remove("selected");
        btn.classList.add("selected");
        state.lastAnswer.value = c;
      });
      wrap.appendChild(btn);
    }
    els.answerArea.appendChild(wrap);
  } else {
    const input = document.createElement("input");
    input.type = "text";
    input.className = "answerInput";
    input.placeholder = dir === "jp2en" ? "English…" : "Japanese…";
    input.autocomplete = "off";
    input.setAttribute("autocomplete", "off");
    input.autocapitalize = "off";
    input.autocorrect = "off";
    input.inputMode = "text";
    input.spellcheck = false;
    input.name = `vocab-answer-${state.idx}-${dir}`;
    input.value = "";
    input.defaultValue = "";
    input.setAttribute("value", "");
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        els.submitBtn.click();
      }
    });
    els.answerArea.appendChild(input);
    input.focus();
  }

  // audio availability
  els.playBtn.disabled = !state.settings.audioEnabled;
  updateStarButton(card, state.currentFile);

  if (q.listening && state.settings.audioEnabled) {
    setTimeout(() => { tryPlayAudio(q).catch(() => {}); }, 0);
  }
}

function currentAnswerValue(question) {
  const answerMode = question.answerMode || state.settings.answerMode;
  if (answerMode === "multiple_choice") {
    return state.lastAnswer.value || "";
  }
  const input = els.answerArea.querySelector("input");
  return input ? input.value : "";
}

async function tryPlayAudio(question) {
  if (!state.settings.audioEnabled) return;
  await configureAudioSession();

  const { card } = question;
  const normalizedVolume = Math.max(0, FIXED_AUDIO_VOLUME);
  if (normalizedVolume === 0) return;

  // mimic python resolver: try kana, kanji, variants
  const candidates = [];
  if (card.kana) candidates.push(card.kana);
  if (card.kanji) candidates.push(card.kanji);
  if (Array.isArray(card.kana_variants)) candidates.push(...card.kana_variants);

  const norm = (s) => normalizeJapanese(s);

  const tried = new Set();
  const manifest = await loadAudioManifest();
  const voiceFolder = resolveVoiceFolder(manifest, getPreferredAudioVoice());
  for (const c of candidates) {
    const n = norm(c);
    if (!n || tried.has(n)) continue;
    tried.add(n);

    // Official pack
    // Prefer User recordings (optional), then manifest-mapped official audio, then legacy guessed path
    const user = normalizeAudioUrl(
      `./UserAudio/${encodeURIComponent(voiceFolder)}/${encodeURIComponent(n)}.wav`,
    );

    const byRaw = manifestLookup(manifest, c, voiceFolder);
    const byNorm = manifestLookup(manifest, n, voiceFolder);
    const legacy = normalizeAudioUrl(
      `./Audio/${encodeURIComponent(voiceFolder)}/${encodeURIComponent(n)}.wav`,
    );
    const official = byRaw || byNorm || legacy;

    for (const url of [user, official]) {
      try {
        await playAudioFromUrl(url, normalizedVolume);
        return;
      } catch (e) {
        // try next candidate
      }
    }
  }
}

async function playRandomSampleAudio() {
  const normalizedVolume = Math.max(0, FIXED_AUDIO_VOLUME);
  if (normalizedVolume === 0) {
    setFooter("Audio is muted.");
    return;
  }
  const manifest = await loadAudioManifest();
  const voiceFolder = resolveVoiceFolder(manifest, getPreferredAudioVoice());
  const keys = manifest
    ? Object.keys(manifest).filter((key) => manifest[key] && manifest[key][voiceFolder])
    : [];
  if (!keys.length) {
    setFooter("No audio samples found.");
    return;
  }
  const key = pickOne(keys);
  const url = manifestLookup(manifest, key, voiceFolder);
  if (!url) {
    setFooter("No audio sample found for this voice.");
    return;
  }
  try {
    await playAudioFromUrl(url, normalizedVolume);
  } catch (e) {
    setFooter("Audio sample failed to play.");
  }
}

async function populateAudioVoices(preferred) {
  if (!els.audioVoice) return;
  await populateVoiceSelect(els.audioVoice, preferred);
}

async function populateVoiceSelect(select, preferred) {
  if (!select) return;
  const manifest = await loadAudioManifest();
  const voices = listAvailableVoices(manifest);
  if (!voices.length) {
    voices.push(AUDIO_VOICE_DEFAULT);
  }
  select.innerHTML = "";
  for (const voice of voices) {
    const option = document.createElement("option");
    option.value = voice;
    option.textContent = voice;
    select.appendChild(option);
  }
  const resolved = resolveVoiceFolder(manifest, preferred || AUDIO_VOICE_DEFAULT);
  if (resolved && voices.includes(resolved)) {
    select.value = resolved;
  } else {
    select.value = voices[0];
  }
}

async function populateExportVoices(preferred) {
  if (!els.exportVoice) return;
  await populateVoiceSelect(els.exportVoice, preferred);
}

function getAudioCandidates(card) {
  const terms = new Set();
  if (card.kana) terms.add(card.kana);
  if (Array.isArray(card.kana_variants)) {
    for (const variant of card.kana_variants) {
      if (variant) terms.add(variant);
    }
  }
  if (!terms.size && card.kanji) terms.add(card.kanji);
  return [...terms].map(t => String(t).trim()).filter(Boolean);
}

function listMissingAudioTerms(pool, manifest, voiceFolder) {
  const missing = new Set();
  if (!Array.isArray(pool)) return [];
  for (const card of pool) {
    const terms = getAudioCandidates(card);
    for (const term of terms) {
      if (!manifest || !manifest[term] || !manifest[term][voiceFolder]) {
        missing.add(term);
      }
    }
  }
  return [...missing].sort((a, b) => a.localeCompare(b, "ja"));
}

async function updateMissingAudioExport() {
  if (!els.exportList || !els.exportHelp || !els.exportMeta) return;
  els.exportHelp.textContent = "";
  els.exportMeta.textContent = "";
  els.exportList.value = "";

  const file = els.levelSelect.value;
  const lessonList = selectedLessons();
  if (!lessonList.length) {
    els.exportHelp.textContent = "Select at least one lesson to export missing audio.";
    return;
  }

  try {
    let vocabData = state.vocabData;
    if (!vocabData || file !== state.currentFile) {
      vocabData = await loadVocabFile(file);
    }
    state.currentFile = file;
    state.vocabData = vocabData;

    const manifest = await loadAudioManifest();
    const voice = resolveVoiceFolder(manifest, els.exportVoice?.value || getPreferredAudioVoice());
    if (els.exportVoice) els.exportVoice.value = voice;

    const pool = buildPool(vocabData, lessonList, file);
    const missing = listMissingAudioTerms(pool, manifest, voice);

    const lessonLabelCount = lessonList.length === 1 ? "lesson" : "lessons";
    const itemLabel = missing.length === 1 ? "item" : "items";
    els.exportMeta.textContent = `${categoryLabel(file)} • ${lessonList.length} ${lessonLabelCount} • ${missing.length} ${itemLabel} missing (${voice})`;

    if (!missing.length) {
      els.exportHelp.textContent = "Nice! No missing audio found for the selected voice.";
    }

    els.exportList.value = missing.join("\n");
  } catch (e) {
    els.exportHelp.textContent = "Could not load vocab or audio manifest.";
  }
}

async function openMissingAudioExport() {
  await updateMissingAudioExport();
  show("export");
}

function downloadMissingAudioList() {
  if (!els.exportList) return;
  const text = els.exportList.value || "";
  if (!text.trim()) {
    setFooter("No missing audio to download.");
    return;
  }
  const file = els.levelSelect.value || "vocab";
  const voice = els.exportVoice ? els.exportVoice.value : "voice";
  const safeCategory = categoryLabel(file).replace(/[^\w.-]+/g, "-");
  const safeVoice = String(voice).replace(/[^\w.-]+/g, "-");
  const filename = `missing-audio-${safeCategory}-${safeVoice}.txt`;
  const blob = new Blob([text.trim() + "\n"], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function finishQuiz() {
  show("done");
  els.scoreLine.textContent = `Score: ${state.correct}/${state.questions.length} (wrong: ${state.wrong})`;
  setFooter(`Finished • ${new Date().toLocaleString()}`);
}

function checkAnswer() {
  const q = state.questions[state.idx];
  const userRaw = currentAnswerValue(q);

  // no blank submissions
  if (!String(userRaw || "").trim()) return;

  els.submitBtn.disabled = true;

  if ((q.answerMode || state.settings.answerMode) === "multiple_choice") {
    const correctText = q.correctText || makeChoices(q, state.pool).correctText;
    const ok = String(userRaw) === String(correctText);

    if (ok) state.correct += 1;
    else state.wrong += 1;

    setFeedback(ok, correctText);
    els.nextBtn.disabled = false;
    return;
  }

  const { ok, expectedDisplay } = gradeTyping(q, userRaw);

  if (ok) state.correct += 1;
  else state.wrong += 1;

  setFeedback(ok, expectedDisplay);
  els.nextBtn.disabled = false;
}

function nextQuestion() {
  state.idx += 1;
  if (state.idx >= state.questions.length) {
    finishQuiz();
  } else {
    renderQuestion();
  }
}

// --- Setup / loading ---
async function bootstrap() {
  els.versionLine.textContent = `PWA • ${APP_VERSION}`;
  setFooter(`Ready • ${APP_VERSION}`);
  setSelectionCount("Selected: 0 words");

  await registerSW();
  wireInstall();
  state.starred = loadStarred();
  let preferredAudioVoice = AUDIO_VOICE_DEFAULT;

  const syncAudioControls = () => {
    const enabled = els.audioEnabled.checked;
    if (els.testAudioBtn) {
      els.testAudioBtn.disabled = !enabled;
    }
    if (els.audioVoice) {
      els.audioVoice.disabled = !enabled;
    }
  };

  // Load default config (optional)
  try {
    const res = await fetch("./config.json");
    if (res.ok) {
      const cfg = await res.json();
      if (cfg.questionMode) els.questionMode.value = cfg.questionMode;
      if (cfg.answerMode) els.answerMode.value = cfg.answerMode;
      if (cfg.displayMode) els.displayMode.value = cfg.displayMode;
      if (typeof cfg.questionsPerQuiz === "number") els.qCount.value = String(cfg.questionsPerQuiz);
      if (typeof cfg.audioEnabled === "boolean") els.audioEnabled.checked = cfg.audioEnabled;
      if (cfg.audioVoice) preferredAudioVoice = cfg.audioVoice;
    }
  } catch (e) {}

  await populateAudioVoices(preferredAudioVoice);
  await populateExportVoices(preferredAudioVoice);
  syncAudioControls();

  // Discover vocab files
  els.levelSelect.innerHTML = "";
  const files = await listVocabFiles();
  state.files = files;

  if (!files.length) {
    els.lessonHelp.textContent = "No vocab JSON files found. Put files in Vocabulary/ and refresh.";
    els.startBtn.disabled = true;
    return;
  }

  for (const f of files) {
    const opt = document.createElement("option");
    opt.value = f;
    opt.textContent = categoryLabel(f);
    els.levelSelect.appendChild(opt);
  }

  // default selection: N5_vocab.json if present else first
  const defaultFile = files.find(f => f.toLowerCase() === "n5_vocab.json") || files[0];
  els.levelSelect.value = defaultFile;

  await onCategoryChange();

  els.levelSelect.addEventListener("change", onCategoryChange);
  els.lessonBox.addEventListener("change", () => {
    updateSelectionFooter();
    if (els.screenExport && !els.screenExport.hidden) {
      updateMissingAudioExport();
    }
  });
  if (els.viewVocabBtn) {
    els.viewVocabBtn.addEventListener("click", openVocabPreview);
  }
  if (els.exportMissingAudioBtn) {
    els.exportMissingAudioBtn.addEventListener("click", openMissingAudioExport);
  }

  els.startBtn.addEventListener("click", async () => {
    await primeAudioPlayback();
    const file = els.levelSelect.value;
    const qCount = Number(els.qCount.value || 20);
    els.practiceHelp.textContent = "";

    const lessonList = selectedLessons();
    if (!lessonList.length) return;

    let vocabData = state.vocabData;
    if (!vocabData || file !== state.currentFile) {
      vocabData = await loadVocabFile(file);
    }

    let pool = buildPool(vocabData, lessonList, file);
    if (!pool.length) return;

    const practiceMode = els.practiceMode.value;
    if (practiceMode === "starred") {
      pool = pool.filter((card) => state.starred.has(resolveStarKey(card, file)));
      if (!pool.length) {
        els.practiceHelp.textContent = "No starred items yet. Star some cards to practice them here.";
        return;
      }
    }

    const settings = {
      questionMode: els.questionMode.value,
      answerMode: els.answerMode.value,
      practiceMode,
      displayMode: els.displayMode.value,
      qCount,
      audioEnabled: els.audioEnabled.checked,
      audioVoice: els.audioVoice ? els.audioVoice.value : AUDIO_VOICE_DEFAULT,
    };

    state.currentFile = file;
    state.vocabData = vocabData;
    state.pool = pool;
    state.questions = buildQuestions(pool, settings);
    state.settings = settings;
    state.idx = 0;
    state.correct = 0;
    state.wrong = 0;

    show("quiz");
    renderQuestion();
    setFooter(`In quiz • ${APP_VERSION}`);
  });

  els.submitBtn.addEventListener("click", checkAnswer);
  els.nextBtn.addEventListener("click", nextQuestion);
  els.quitBtn.addEventListener("click", () => {
    show("home");
    setFooter(`Quit • ${APP_VERSION}`);
  });
  els.backHomeBtn.addEventListener("click", () => {
    show("home");
    setFooter(`Ready • ${APP_VERSION}`);
  });
  if (els.backFromVocabBtn) {
    els.backFromVocabBtn.addEventListener("click", () => {
      show("home");
    });
  }
  if (els.backFromExportBtn) {
    els.backFromExportBtn.addEventListener("click", () => {
      show("home");
    });
  }
  if (els.downloadExportBtn) {
    els.downloadExportBtn.addEventListener("click", downloadMissingAudioList);
  }
  if (els.exportVoice) {
    els.exportVoice.addEventListener("change", () => {
      if (els.screenExport && !els.screenExport.hidden) {
        updateMissingAudioExport();
      }
    });
  }

  els.playBtn.addEventListener("click", async () => {
    try {
      await primeAudioPlayback();
      const q = state.questions[state.idx];
      await tryPlayAudio(q);
    } catch (e) {}
  });

  els.starBtn.addEventListener("click", () => {
    const q = state.questions[state.idx];
    if (!q) return;
    const card = q.card;
    setStarred(card, !isStarred(card, state.currentFile), state.currentFile);
    updateStarButton(card, state.currentFile);
  });

  els.audioEnabled.addEventListener("change", syncAudioControls);
  if (els.testAudioBtn) {
    els.testAudioBtn.addEventListener("click", async () => {
      if (!els.audioEnabled.checked) return;
      try {
        await primeAudioPlayback();
        await playRandomSampleAudio();
      } catch (e) {}
    });
  }
}

async function onCategoryChange() {
  const file = els.levelSelect.value;
  els.lessonHelp.textContent = "Loading lessons…";
  els.startBtn.disabled = true;
  els.practiceHelp.textContent = "";

  try {
    const vocabData = await loadVocabFile(file);
    state.currentFile = file;
    state.vocabData = vocabData;

    const lessonKeys = Object.keys(vocabData.lessons || {});
    if (!lessonKeys.length) {
      els.lessonHelp.textContent = "No lessons found in this file.";
      els.lessonBox.innerHTML = "";
      setSelectionCount("Selected: 0 words");
      return;
    }

    renderLessonPills(vocabData, lessonKeys);
    els.lessonHelp.textContent = "Select lessons (default: all).";
    els.startBtn.disabled = false;
    updateSelectionFooter();
    if (els.screenExport && !els.screenExport.hidden) {
      updateMissingAudioExport();
    }
  } catch (e) {
    els.lessonHelp.textContent = "Could not load that vocab file.";
    els.lessonBox.innerHTML = "";
    setSelectionCount("Selected: 0 words");
    if (els.screenExport && !els.screenExport.hidden) {
      updateMissingAudioExport();
    }
  }
}

bootstrap();
