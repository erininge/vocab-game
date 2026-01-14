/* Kat's Vocab Garden (PWA)
   - Loads vocab JSONs from Vocabulary/
   - Category == filename (without extension)
   - Lessons follow the python structure: { level, lessons: { "1": [ {kana, kanji, en:[...], ...}, ... ] } }
*/

const APP_VERSION = "v0.3.8";
const STAR_STORAGE_KEY = "vocabGardenStarred";
const AUDIO_VOICE_FOLDERS = {
  "Female 1": "Female option 1",
  "Female 2": "Female option 2",
  "Male 1": "Male option 1",
  "Male 2": "Male option 2",
};

const els = {
  versionLine: document.getElementById("versionLine"),
  footerLine: document.getElementById("footerLine"),
  installBtn: document.getElementById("installBtn"),

  screenHome: document.getElementById("screenHome"),
  screenQuiz: document.getElementById("screenQuiz"),
  screenDone: document.getElementById("screenDone"),

  levelSelect: document.getElementById("levelSelect"),
  questionMode: document.getElementById("questionMode"),
  answerMode: document.getElementById("answerMode"),
  practiceMode: document.getElementById("practiceMode"),
  displayMode: document.getElementById("displayMode"),
  qCount: document.getElementById("qCount"),
  voiceSelect: document.getElementById("voiceSelect"),
  audioEnabled: document.getElementById("audioEnabled"),
  audioVolume: document.getElementById("audioVolume"),
  audioVolumeValue: document.getElementById("audioVolumeValue"),
  practiceHelp: document.getElementById("practiceHelp"),

  lessonHelp: document.getElementById("lessonHelp"),
  lessonBox: document.getElementById("lessonBox"),

  startBtn: document.getElementById("startBtn"),

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
};

let deferredInstallPrompt = null;

function setFooter(text) {
  els.footerLine.textContent = text;
}

function show(screen) {
  els.screenHome.hidden = screen !== "home";
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

const DEFAULT_AUDIO_VOLUME = 80;

let AUDIO_MANIFEST = null;
let audioSessionConfigured = false;
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

async function configureAudioSession() {
  if (audioSessionConfigured) return;
  const session = navigator.audioSession;
  if (!session) return;
  try {
    if ("type" in session) {
      session.type = "ambient";
    }
    if (typeof session.setActive === "function") {
      await session.setActive(true);
    }
    audioSessionConfigured = true;
  } catch (e) {
    // Ignore unsupported audio session configuration.
  }
}

function manifestLookup(manifest, key, voiceFolder) {
  if (!manifest) return null;
  const entry = manifest[key];
  if (!entry) return null;
  const rel = entry[voiceFolder];
  if (!rel) return null;
  return rel.startsWith("./") ? rel : ("./" + rel.replace(/^\/+/, ""));
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

function renderLessonPills(lessonKeys) {
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
    span.textContent = `Lesson ${k}`;
    label.appendChild(cb);
    label.appendChild(span);
    els.lessonBox.appendChild(label);
  }
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
    if (mode === "mixed") dir = Math.random() < 0.5 ? "jp2en" : "en2jp";

    const question = { dir, card };
    if (settings.answerMode === "multiple_choice") {
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

  const settings = state.settings;
  const dispMode = settings.displayMode;

  // header meta
  const cat = categoryLabel(state.currentFile);
  els.quizMeta.textContent = `${cat} • Lesson ${card._lesson} • ${state.idx + 1}/${state.questions.length}`;

  clearFeedback();
  els.nextBtn.disabled = true;
  els.submitBtn.disabled = false;

  // prompt + subprompt
  if (dir === "jp2en") {
    els.promptLine.textContent = getDisplayJP(card, dispMode);
    els.subpromptLine.textContent = "Type the English meaning (or pick one).";
  } else {
    // pick an English prompt (first meaning)
    els.promptLine.textContent = (card.en || [])[0] || "(no English provided)";
    els.subpromptLine.textContent = "Type the Japanese (kana or kanji accepted), or pick one.";
  }

  // answer UI
  els.answerArea.innerHTML = "";
  state.lastAnswer = { mode: settings.answerMode, value: null };

  if (settings.answerMode === "multiple_choice") {
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
}

function currentAnswerValue() {
  if (state.settings.answerMode === "multiple_choice") {
    return state.lastAnswer.value || "";
  }
  const input = els.answerArea.querySelector("input");
  return input ? input.value : "";
}

async function tryPlayAudio(question) {
  if (!state.settings.audioEnabled) return;
  await configureAudioSession();

  const { card } = question;
  const voice = state.settings.voice || "Female 1";
  const voiceFolder = AUDIO_VOICE_FOLDERS[voice] || AUDIO_VOICE_FOLDERS["Female 1"];
  const volume = typeof state.settings.audioVolume === "number" ? state.settings.audioVolume : 1;
  const normalizedVolume = Math.max(0, Math.min(1, volume));

  // mimic python resolver: try kana, kanji, variants
  const candidates = [];
  if (card.kana) candidates.push(card.kana);
  if (card.kanji) candidates.push(card.kanji);
  if (Array.isArray(card.kana_variants)) candidates.push(...card.kana_variants);

  const norm = (s) => normalizeJapanese(s);

  const tried = new Set();
  const manifest = await loadAudioManifest();
  for (const c of candidates) {
    const n = norm(c);
    if (!n || tried.has(n)) continue;
    tried.add(n);

    // Official pack
    // Prefer User recordings (optional), then manifest-mapped official audio, then legacy guessed path
    const user = `./UserAudio/${encodeURIComponent(voiceFolder)}/${encodeURIComponent(n)}.wav`;

    const byRaw = manifestLookup(manifest, c, voiceFolder);
    const byNorm = manifestLookup(manifest, n, voiceFolder);
    const legacy = `./Audio/${encodeURIComponent(voiceFolder)}/${encodeURIComponent(n)}.wav`;
    const official = byRaw || byNorm || legacy;

    for (const url of [user, official]) {
      try {
        const audio = new Audio(url);
        audio.playsInline = true;
        audio.volume = normalizedVolume;
        audio.setAttribute("playsinline", "");
        audio.setAttribute("webkit-playsinline", "");
        audio.preload = "auto";
        // Wait for load; if it errors, try next
        await new Promise((resolve, reject) => {
          const t = setTimeout(() => reject(new Error("timeout")), 2500);
          audio.addEventListener("canplaythrough", () => { clearTimeout(t); resolve(true); }, { once: true });
          audio.addEventListener("error", () => { clearTimeout(t); reject(new Error("error")); }, { once: true });
        });
        await audio.play();
        return;
      } catch (e) {
        // try next candidate
      }
    }
  }
}

function finishQuiz() {
  show("done");
  els.scoreLine.textContent = `Score: ${state.correct}/${state.questions.length} (wrong: ${state.wrong})`;
  setFooter(`Finished • ${new Date().toLocaleString()}`);
}

function checkAnswer() {
  const q = state.questions[state.idx];
  const userRaw = currentAnswerValue();

  // no blank submissions
  if (!String(userRaw || "").trim()) return;

  els.submitBtn.disabled = true;

  if (state.settings.answerMode === "multiple_choice") {
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

  await registerSW();
  wireInstall();
  state.starred = loadStarred();

  const updateAudioVolumeLabel = () => {
    const value = Number(els.audioVolume.value || 0);
    els.audioVolumeValue.textContent = `${value}%`;
  };

  const syncAudioControls = () => {
    const enabled = els.audioEnabled.checked;
    els.audioVolume.disabled = !enabled;
    els.audioVolumeValue.classList.toggle("muted", !enabled);
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
      if (cfg.audioVoice) els.voiceSelect.value = cfg.audioVoice;
      if (typeof cfg.audioEnabled === "boolean") els.audioEnabled.checked = cfg.audioEnabled;
      if (typeof cfg.audioVolume === "number") {
        const volumePercent = cfg.audioVolume <= 1 ? Math.round(cfg.audioVolume * 100) : cfg.audioVolume;
        els.audioVolume.value = String(Math.max(0, Math.min(100, volumePercent)));
      }
    }
  } catch (e) {}

  if (!els.audioVolume.value) {
    els.audioVolume.value = String(DEFAULT_AUDIO_VOLUME);
  }
  updateAudioVolumeLabel();
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

  els.startBtn.addEventListener("click", async () => {
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
      voice: els.voiceSelect.value,
      audioVolume: Number(els.audioVolume.value || DEFAULT_AUDIO_VOLUME) / 100,
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

  els.playBtn.addEventListener("click", async () => {
    try {
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
  els.audioVolume.addEventListener("input", updateAudioVolumeLabel);
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
      return;
    }

    renderLessonPills(lessonKeys);
    els.lessonHelp.textContent = "Select lessons (default: all).";
    els.startBtn.disabled = false;
  } catch (e) {
    els.lessonHelp.textContent = "Could not load that vocab file.";
    els.lessonBox.innerHTML = "";
  }
}

bootstrap();
