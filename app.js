// Kat's Vocab Garden — v0.3 (debug Start + show errors on screen)

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
const homeError = $("#home-error");

const promptEl = $("#prompt");
const hintEl = $("#hint");
const progressPill = $("#progress-pill");
const modePill = $("#mode-pill");

const playAudioBtn = $("#playAudioBtn");

let vocab = [];
let idx = 0;
let total = 0;
let current = null;

let audioObj = null;

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
  return (s ?? "")
    .toString()
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function pickModeLabel() {
  modePill.textContent = "JP → EN";
}

function updateProgress() {
  progressPill.textContent = `${Math.min(idx + 1, total)} / ${total}`;
}

function getPromptText(item) {
  const jp = (item.kanji && item.kanji.trim()) ? item.kanji : item.kana;
  return jp || "…";
}

function getExpectedAnswers(item) {
  const en = Array.isArray(item.en) ? item.en : [];
  return en.map(normalizeAnswer).filter(Boolean);
}

function setPlayButtonEnabled(enabled) {
  playAudioBtn.disabled = !enabled;
  playAudioBtn.style.opacity = enabled ? "1" : "0.5";
}

function loadCurrentAudio(item) {
  audioObj = null;
  if (item && typeof item.audio === "string" && item.audio.trim()) {
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

async function playCurrentAudio() {
  if (!audioObj) return;
  try {
    audioObj.currentTime = 0;
    await audioObj.play();
  } catch (err) {
    console.warn("Audio play failed:", err);
    feedback.textContent = "Audio couldn’t play. Try tapping 🔊 Play again.";
  }
}

async function startGame() {
  homeError.textContent = "";
  btnStart.textContent = "Loading…";
  btnStart.disabled = true;

  try {
    // If this fails, we'll show the error on-screen.
    const res = await fetch("data/N5_vocab.json", { cache: "no-store" });

    if (!res.ok) {
      throw new Error(`Could not load vocab JSON (HTTP ${res.status}).`);
    }

    const data = await res.json();

    if (!Array.isArray(data) || data
