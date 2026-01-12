// v0.1 "baby step" PWA vocab game

const $ = (id) => document.getElementById(id);

const screenHome = $('screen-home');
const screenGame = $('screen-game');
const btnStart = $('btn-start');
const btnNext = $('btn-next');
const btnQuit = $('btn-quit');

const promptEl = $('prompt');
const hintEl = $('hint');
const feedbackEl = $('feedback');
const answerForm = $('answer-form');
const answerInput = $('answer');

const modePill = $('mode-pill');
const progressPill = $('progress-pill');

let deck = [];        // array of cards
let idx = 0;
let revealed = false;

// --- smart-ish grading (matches your "ignore punctuation/parentheses" vibe) ---
function normalizeSpaces(s) {
  return String(s ?? '').replace(/\s+/g, ' ').trim();
}

function normalizeEn(s) {
  s = normalizeSpaces(s).toLowerCase();
  // keep letters/numbers/spaces + basic apostrophes/hyphens
  s = s.replace(/[^a-z0-9\s\-']/g, '');
  s = s.replace(/\s+/g, ' ').trim();
  return s;
}

function enVariants(answer) {
  if (answer == null) return new Set();
  let s = String(answer);

  // drop parentheticals
  s = s.replace(/\([^)]*\)/g, '');

  // split common multi-answer delimiters
  let parts = [s];
  if (/[;,/]|\sor\s/i.test(s)) {
    const tmp = s.replace(/\sor\s/gi, ';').replace(/[,/]/g, ';');
    parts = tmp.split(';').map(p => p.trim()).filter(Boolean);
  }

  const out = new Set();
  for (const p of parts) {
    let base = normalizeEn(p).replace(/[.!?]+$/g, '').trim();
    if (!base) continue;

    // optional apostrophes
    base = base.replace(/i'm/g, 'im').replace(/you're/g, 'youre').replace(/it's/g, 'its').replace(/that's/g, 'thats');
    base = base.replace(/'/g, '');

    const space = base.replace(/-/g, ' ').trim();
    const nospace = space.replace(/\s+/g, '');

    out.add(space);
    out.add(nospace);

    // tiny alias set
    if (nospace === 'usa' || nospace === 'us' || nospace === 'unitedstates' || nospace === 'unitedstate') {
      out.add('usa'); out.add('us'); out.add('united states'); out.add('unitedstates'); out.add('america');
    }
  }
  return out;
}

function isCorrectEn(user, acceptedList) {
  const u = normalizeEn(user).replace(/'/g,'');
  const uSpace = u.replace(/-/g,' ').trim();
  const uNo = uSpace.replace(/\s+/g,'');

  for (const acc of acceptedList) {
    const vars = enVariants(acc);
    if (vars.has(uSpace) || vars.has(uNo)) return true;
  }
  return false;
}

async function loadDeck() {
  // For now: N5 lesson 1 only (we'll expand later)
  const res = await fetch('./data/N5_vocab.json');
  const json = await res.json();

  const lesson1 = json.lessons?.['1'] ?? [];
  deck = lesson1.map((c) => ({
    kana: c.kana,
    kanji: c.kanji,
    en: Array.isArray(c.en) ? c.en : [c.en]
  }));

  // shuffle
  deck.sort(() => Math.random() - 0.5);

  idx = 0;
}

function showScreen(which) {
  if (which === 'home') {
    screenHome.classList.remove('hidden');
    screenGame.classList.add('hidden');
  } else {
    screenHome.classList.add('hidden');
    screenGame.classList.remove('hidden');
  }
}

function setFeedback(text, ok) {
  feedbackEl.textContent = text;
  feedbackEl.className = 'feedback ' + (ok ? 'good' : 'bad');
}

function showCard() {
  const card = deck[idx];
  revealed = false;
  btnNext.classList.add('hidden');
  feedbackEl.textContent = '';
  feedbackEl.className = 'feedback';
  answerInput.value = '';
  answerInput.focus();

  // Mode for v0.1: JP -> EN
  modePill.textContent = 'JP → EN';
  progressPill.textContent = `${idx + 1} / ${deck.length}`;

  // Display preference for now: kana + (kanji)
  const jp = card.kanji ? `${card.kana}（${card.kanji}）` : card.kana;
  promptEl.textContent = jp;
  hintEl.textContent = '';
}

function endGame() {
  promptEl.textContent = 'Done! 🎉';
  hintEl.textContent = 'Baby step complete. Next we add: settings, more lessons, audio, streaks.';
  answerInput.value = '';
  btnNext.classList.add('hidden');
}

answerForm.addEventListener('submit', (e) => {
  e.preventDefault();
  if (!deck.length) return;

  const card = deck[idx];
  const user = answerInput.value;

  const ok = isCorrectEn(user, card.en);
  if (ok) {
    setFeedback('✅ Correct!', true);
    btnNext.classList.remove('hidden');
    revealed = true;
  } else {
    setFeedback('❌ Not quite. Try again.', false);
    // tiny hint after wrong attempt
    hintEl.textContent = `Hint: one answer is “${card.en[0]}”`;
  }
});

btnNext.addEventListener('click', () => {
  if (!revealed) return;
  idx += 1;
  if (idx >= deck.length) {
    endGame();
    return;
  }
  showCard();
});

btnQuit.addEventListener('click', () => {
  showScreen('home');
});

btnStart.addEventListener('click', async () => {
  btnStart.disabled = true;
  btnStart.textContent = 'Loading…';
  await loadDeck();
  showScreen('game');
  showCard();
  btnStart.disabled = false;
  btnStart.textContent = 'Start';
});

// Register service worker (offline support)
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./service-worker.js').catch(() => {});
  });
}
