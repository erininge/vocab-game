// Kat's Vocab Garden — v0.2 (adds audio support)
//
// How audio works:
// - Each vocab item MAY include:  "audio": "audio/filename.wav"
// - iPhone requires audio playback to be triggered after a user gesture.
//   (Tapping Start/Play/Check counts.)

const $ = (sel) => document.querySelector(sel);

const screens = {
  home: $("#screen-home"),
  game: $("#screen-game"),
};

const btnStart = $("#btn-start");
const btnQuit = $("#btn-quit");
const btnNext = $("#btn-next");
const form = $("#answer-form");
const input = $("#answer");
const feedback = $("#feedback");
const promptEl = $("#prompt");
const hintEl = $("#hint");
const progressPill = $("#progress-pill");
const modePill = $("#mode-pill");

const playAudioBtn = $("#playAudioBtn");

// Data
let vocab = [];
let idx = 0;
let total = 0;
let current = null;

// Audio
let audioObj = null;

// ---------- helpers ----------
function show(el) { el.classList.remove("hidden"); }
function hide(el) { el.classList.add("hidden"); }

function setScreen(name) {
  if (name === "home") {
    show(screens.home);
    hide(screens.game);
  } else {
    hide(screens.home);
    show(screens.game);
  }
}

function normalizeAnswer(s) {
  // simple smart grading baseline: trim, lower, remove extra spaces
  // (we can expand later to match your Python version)
  return (s ?? "")
    .toString()
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function pickModeLabel() {
  // starter app is JP → EN
  modePill.textContent = "JP → EN";
}

function updateProgress() {
  progressPill.textContent = `${Math.min(idx + 1, total)} / ${total}`;
}

function getPromptText(item) {
  // Prefer kanji if present; otherwise kana
  const jp = (item.kanji && item.kanji.trim()) ? item.kanji : item.kana;
  return jp || "…";
}

function getExpectedAnswers(item) {
  // In your JSON, "en" is an array.
  // We'll accept ANY of the English answers.
  const en = Array.isArray(item.en) ? item.en : [];
  return en.map(normalizeAnswer).filter(Boolean);
}

function setPlayButtonEnabled(enabled) {
  playAudioBtn.disabled = !enabled;
  // Optional: visually hint
  playAudioBtn.style.opacity = enabled ? "1" : "0.5";
}

function loadCurrentAudio(item) {
  // Kill previous audio reference
  audioObj = null;

  if (item && typeof item.audio === "string" && item.audio.trim()) {
    // Create new audio object
    audioObj = new Audio(item.audio);
    setPlayButtonEnabled(true);
  } else {
    setPlayButtonEnabled(false);
  }
}

function renderCard() {
  current = vocab[idx];
  if (!current) return;

  promptEl.textContent = getPromptText(current);

  // Hint line (optional). We'll show kana if kanji is shown.
  const showingKanji = current.kanji && current.kanji.trim();
  hintEl.textContent = showingKanji ? `(${current.kana || ""})` : "";

  feedback.textContent = "";
  input.value = "";
  input.focus();

  hide(btnNext);

  updateProgress();
  pickModeLabel();

  loadCurrentAudio(current);
}

// ---------- audio ----------
async function playCurrentAudio() {
  if (!audioObj) return;
  try {
    // Reset to start each time
    audioObj.currentTime = 0;
    await audioObj.play();
  } catch (err) {
    // iOS sometimes blocks if no gesture; here user clicked Play so it should work.
    console.warn("Audio play failed:", err);
    feedback.textContent = "Audio couldn’t play (Safari restriction). Tap Start/Play again.";
  }
}

// ---------- game flow ----------
async function startGame() {
  // Load vocab JSON
  // (This matches the starter: data/N5_vocab.json)
  const res = await fetch("data/N5_vocab.json");
  vocab = await res.json();

  // Basic safety
  if (!Array.isArray(vocab) || vocab.length === 0) {
    alert("No vocab loaded. Check data/N5_vocab.json");
    return;
  }

  idx = 0;
  total = vocab.length;

  setScreen("game");
  renderCard();
}

function quitGame() {
  setScreen("home");
}

// ---------- events ----------
btnStart.addEventListener("click", startGame);
btnQuit.addEventListener("click", quitGame);

btnNext.addEventListener("click", () => {
  idx++;
  if (idx >= total) {
    feedback.textContent = "Done! 🎉";
    hide(btnNext);
    setPlayButtonEnabled(false);
    return;
  }
  renderCard();
});

playAudioBtn.addEventListener("click", playCurrentAudio);

form.addEventListener("submit", (e) => {
  e.preventDefault();
  if (!current) return;

  const user = normalizeAnswer(input.value);
  const expected = getExpectedAnswers(current);

  if (!user) {
    feedback.textContent = "Type an answer first 🙂";
    return;
  }

  const correct = expected.includes(user);

  if (correct) {
    feedback.textContent = "✅ Correct!";
  } else {
    // Show all accepted answers
    feedback.textContent = `❌ Not quite. Accepted: ${expected.join(", ")}`;
  }

  show(btnNext);
});

// Start on home screen
setScreen("home");
