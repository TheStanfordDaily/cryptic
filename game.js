// =============================================================
//  Cardinal Cryptic — Game Logic
// =============================================================

const STORAGE_PREFIX = 'cryptic_state_';
const MAX_GUESSES    = 5;

// ---- URL params ------------------------------------------------
function getParams() {
  const p = new URLSearchParams(window.location.search);
  return {
    d:   p.get('d'),
    num: p.get('p') ? parseInt(p.get('p'), 10) : 0,
  };
}

function loadPuzzle() {
  const { d, num } = getParams();
  if (!d) return null;
  try {
    const obj = JSON.parse(atob(d));
    if (!obj.clue || !obj.answer) return null;
    // Normalize def/ind/fod to arrays (supports both old string and new array format)
    const toArr = v => Array.isArray(v) ? v.filter(Boolean) : (v ? [v] : []);
    return {
      clue:   obj.clue,
      answer: obj.answer.toUpperCase().replace(/[^A-Z]/g, ''),
      def:    toArr(obj.def),
      ind:    toArr(obj.ind),
      fod:    toArr(obj.fod),
      exp:    obj.exp || '',
      num,
    };
  } catch { return null; }
}

// ---- Game state ------------------------------------------------
let puzzle        = null;
let solved        = false;
let gameOver      = false;   // true when out of guesses
let inputLocked   = false;
let attempts      = 0;
let hintsRevealed = new Set();
let currentInput  = [];

function storageKey() {
  const id = puzzle.num || simpleHash(puzzle.clue);
  return `${STORAGE_PREFIX}${id}`;
}

function simpleHash(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (Math.imul(31, h) + str.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}

function saveState() {
  try {
    localStorage.setItem(storageKey(), JSON.stringify({
      solved,
      gameOver,
      attempts,
      hintsRevealed: [...hintsRevealed],
      currentInput:  (solved || gameOver) ? [] : currentInput,
    }));
  } catch {}
}

function loadState() {
  try {
    const raw = localStorage.getItem(storageKey());
    if (!raw) return;
    const s = JSON.parse(raw);

    attempts = s.attempts || 0;
    if (Array.isArray(s.hintsRevealed)) {
      s.hintsRevealed.forEach(h => hintsRevealed.add(h));
    }

    if (s.solved) {
      solved = true;
      fillTilesCorrect();
      lockInput();
      hintsRevealed.forEach(type => applyHintMenuStyle(type));
      renderClueHighlights();
      renderHintLegend();
      updateGuessCounter();
    } else if (s.gameOver) {
      gameOver = true;
      lockInput();
      hintsRevealed.forEach(type => applyHintMenuStyle(type));
      renderClueHighlights();
      renderHintLegend();
      updateGuessCounter();
    } else {
      if (Array.isArray(s.currentInput) && s.currentInput.length) {
        currentInput = s.currentInput;
        syncTiles();
      }
      hintsRevealed.forEach(type => applyHintMenuStyle(type));
      renderClueHighlights();
      renderHintLegend();
      updateGuessCounter();
    }
  } catch {}
}

// ---- Build tiles -----------------------------------------------
function buildAnswerTiles() {
  const container = document.getElementById('answer-tiles');
  container.innerHTML = '';
  const n    = puzzle.answer.length;
  const maxW = Math.min(460, window.innerWidth - 48);
  const gap  = 7;
  const size = Math.min(56, Math.floor((maxW - gap * (n - 1)) / n));
  const fs   = Math.max(0.88, size / 34).toFixed(2) + 'rem';

  for (let i = 0; i < n; i++) {
    const tile = document.createElement('div');
    tile.classList.add('ans-tile');
    tile.dataset.index = i;
    tile.style.cssText = `width:${size}px; height:${size}px; font-size:${fs};`;
    container.appendChild(tile);
  }
}

function syncTiles() {
  document.querySelectorAll('.ans-tile').forEach((tile, i) => {
    const ch = currentInput[i] || '';
    tile.textContent = ch;
    tile.classList.toggle('filled', !!ch);
    tile.classList.remove('correct', 'wrong');
  });
}

function fillTilesCorrect() {
  document.querySelectorAll('.ans-tile').forEach((tile, i) => {
    tile.textContent = puzzle.answer[i];
    tile.classList.remove('filled', 'wrong');
    tile.classList.add('correct');
  });
}

function fillTilesWrong() {
  document.querySelectorAll('.ans-tile').forEach((tile, i) => {
    tile.textContent = currentInput[i] || '';
    tile.classList.remove('filled', 'correct');
    if (currentInput[i]) tile.classList.add('wrong');
  });
}

function shakeTiles() {
  const container = document.getElementById('answer-tiles');
  container.classList.remove('shake');
  void container.offsetWidth;
  container.classList.add('shake');
  container.addEventListener('animationend', () => container.classList.remove('shake'), { once: true });
}

// ---- Guess counter ---------------------------------------------
function updateGuessCounter() {
  const el = document.getElementById('guess-counter');
  if (solved || gameOver) { el.classList.add('hidden'); return; }
  if (attempts === 0)     { el.classList.add('hidden'); return; }

  const remaining = MAX_GUESSES - attempts;
  el.textContent  = remaining === 1
    ? '1 guess remaining'
    : `${remaining} guesses remaining`;
  el.classList.toggle('urgent', remaining === 1);
  el.classList.remove('hidden');
}

// ---- Keyboard-driven input ------------------------------------
function addLetter(letter) {
  if (inputLocked || currentInput.length >= puzzle.answer.length) return;
  const tile = document.querySelectorAll('.ans-tile')[currentInput.length];
  currentInput.push(letter);
  tile.textContent = letter;
  tile.classList.add('filled');
  tile.classList.remove('correct', 'wrong', 'pop');
  void tile.offsetWidth;
  tile.classList.add('pop');
  saveState();
}

function deleteLetter() {
  if (inputLocked || currentInput.length === 0) return;
  currentInput.pop();
  const tile = document.querySelectorAll('.ans-tile')[currentInput.length];
  tile.textContent = '';
  tile.classList.remove('filled', 'pop');
  saveState();
}

function handleKey(key) {
  if      (key === 'ENTER')      submitAnswer();
  else if (key === 'BACKSPACE')  deleteLetter();
  else if (/^[A-Z]$/.test(key)) addLetter(key);
}

function lockInput() {
  inputLocked = true;
  document.querySelectorAll('.key').forEach(k => k.disabled = true);
  document.querySelectorAll('#hints-menu .dropdown-item').forEach(b => b.disabled = true);
  document.getElementById('btn-open-breakdown').classList.remove('hidden');
}

// ---- Submit ----------------------------------------------------
function submitAnswer() {
  if (inputLocked) return;
  if (currentInput.length < puzzle.answer.length) {
    showToast('Not enough letters');
    shakeTiles();
    return;
  }

  const guess = currentInput.join('');
  if (guess === puzzle.answer) {
    handleWin();
    return;
  }

  attempts++;
  shakeTiles();

  if (attempts >= MAX_GUESSES) {
    handleLoss();
  } else {
    saveState();
    const remaining = MAX_GUESSES - attempts;
    showToast(
      remaining === 1 ? 'Not quite — last guess!' : `Not quite — ${remaining} guesses left`,
      1800
    );
    currentInput = [];
    syncTiles();
    updateGuessCounter();
  }
}

function handleWin() {
  solved = true;
  saveState();
  lockInput();
  fillTilesCorrect();

  document.querySelectorAll('.ans-tile').forEach((tile, i) =>
    setTimeout(() => tile.classList.add('bounce'), i * 80)
  );

  showToast('Brilliant!', 2200);

  setTimeout(() => {
    ['def', 'ind', 'fod'].forEach(t => { if (puzzle[t].length) hintsRevealed.add(t); });
    renderClueHighlights();
    renderHintLegend();
  }, 500);

  setTimeout(() => openBreakdownModal(true), 1600);
}

function handleLoss() {
  gameOver = true;
  saveState();
  lockInput();
  fillTilesWrong();

  setTimeout(() => {
    ['def', 'ind', 'fod'].forEach(t => { if (puzzle[t].length) hintsRevealed.add(t); });
    renderClueHighlights();
    renderHintLegend();
  }, 300);

  setTimeout(() => openBreakdownModal(false), 900);
}

// ---- Breakdown modal ------------------------------------------
function openBreakdownModal(won) {
  const status  = document.getElementById('breakdown-status');
  const content = document.getElementById('breakdown-content');

  status.textContent = won ? `Solved in ${attempts + 1} guess${attempts + 1 === 1 ? '' : 'es'}!` : 'Better luck next time!';
  status.className   = won ? 'won' : 'lost';

  const labels = { def: 'Definition', ind: 'Indicator', fod: 'Fodder' };
  const parts  = ['def', 'ind', 'fod']
    .filter(t => puzzle[t].length)
    .map(t => {
      const display = puzzle[t].map(p => `"${escHtml(p)}"`).join(', ');
      return `<div class="exp-part">
        <span class="exp-badge ${t}">${labels[t]}</span>
        <span class="exp-part-text">${display}</span>
      </div>`;
    })
    .join('');

  content.innerHTML = `
    <span class="exp-answer">${escHtml(puzzle.answer)}</span>
    ${parts ? `<div class="exp-parts">${parts}</div>` : ''}
    ${puzzle.exp ? `<div class="exp-full">${escHtml(puzzle.exp)}</div>` : ''}
  `;

  openModal('breakdown');
}

// ---- Hints menu -----------------------------------------------
function setupHintsMenu() {
  const wrapper = document.getElementById('hints-menu-wrapper');
  const toggle  = document.getElementById('btn-hints-menu');
  const menu    = document.getElementById('hints-menu');

  wrapper.classList.remove('hidden');

  toggle.addEventListener('click', e => {
    e.stopPropagation();
    const open = menu.classList.toggle('open');
    toggle.setAttribute('aria-expanded', open);
  });

  document.addEventListener('click', () => {
    menu.classList.remove('open');
    toggle.setAttribute('aria-expanded', 'false');
  });

  menu.addEventListener('click', e => e.stopPropagation());

  document.querySelectorAll('#hints-menu .dropdown-item').forEach(btn => {
    const type = btn.dataset.type;
    if (!puzzle[type].length) {
      btn.disabled = true;
      btn.title = 'Not available for this clue';
    }
    btn.addEventListener('click', () => {
      revealHint(type);
      menu.classList.remove('open');
      toggle.setAttribute('aria-expanded', 'false');
    });
  });

  hintsRevealed.forEach(type => applyHintMenuStyle(type));
}

function revealHint(type) {
  if (hintsRevealed.has(type) || inputLocked || !puzzle[type].length) return;
  hintsRevealed.add(type);
  applyHintMenuStyle(type);
  renderClueHighlights();
  renderHintLegend();
  saveState();
}

function applyHintMenuStyle(type) {
  const btn = document.getElementById(`menu-hint-${type}`);
  if (!btn) return;
  const labels = { def: 'Definition ✓', ind: 'Indicator ✓', fod: 'Fodder ✓' };
  btn.textContent = labels[type];
  btn.classList.add(`revealed-${type}`);
  btn.disabled = true;
}

// ---- Clue rendering with highlights ---------------------------
function renderClue() {
  document.getElementById('clue-display').textContent = puzzle.clue;
}

function renderClueHighlights() {
  const text = puzzle.clue;
  if (!hintsRevealed.size) {
    document.getElementById('clue-display').textContent = text;
    return;
  }

  const charType = new Array(text.length).fill(null);
  const mark = (parts, type) => {
    parts.forEach(substr => {
      const idx = text.toLowerCase().indexOf(substr.toLowerCase());
      if (idx < 0) return;
      for (let i = idx; i < idx + substr.length; i++) charType[i] = type;
    });
  };

  if (hintsRevealed.has('fod')) mark(puzzle.fod, 'fod');
  if (hintsRevealed.has('ind')) mark(puzzle.ind, 'ind');
  if (hintsRevealed.has('def')) mark(puzzle.def, 'def');

  let html = '', curType = null;
  for (let i = 0; i < text.length; i++) {
    if (charType[i] !== curType) {
      if (curType !== null) html += '</span>';
      if (charType[i] !== null) html += `<span class="hl-${charType[i]}">`;
      curType = charType[i];
    }
    html += escHtml(text[i]);
  }
  if (curType !== null) html += '</span>';

  document.getElementById('clue-display').innerHTML = html;
}

function renderHintLegend() {
  const legend = document.getElementById('hint-legend');
  if (!hintsRevealed.size) { legend.classList.add('hidden'); return; }

  const labels = { def: 'Definition', ind: 'Indicator', fod: 'Fodder' };
  legend.innerHTML = [...hintsRevealed]
    .map(type => {
      const display = puzzle[type].map(p => `"${escHtml(p)}"`).join(', ');
      return `<div class="legend-item">
        <div class="legend-dot ${type}"></div>
        <span class="legend-label">${labels[type]}</span>
        <span class="legend-text">${display}</span>
      </div>`;
    })
    .join('');
  legend.classList.remove('hidden');
}

// ---- Toast ----------------------------------------------------
function showToast(message, duration = 1800) {
  const container = document.getElementById('toast-container');
  const toast = document.createElement('div');
  toast.classList.add('toast');
  toast.textContent = message;
  toast.style.animationDuration = `${duration / 1000}s`;
  container.appendChild(toast);
  setTimeout(() => toast.remove(), duration);
}

// ---- Utility --------------------------------------------------
function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ---- Modals ---------------------------------------------------
function openModal(name)  { document.getElementById(`modal-${name}`).classList.remove('hidden'); }
function closeModal(name) { document.getElementById(`modal-${name}`).classList.add('hidden'); }

document.querySelectorAll('.modal-close').forEach(btn =>
  btn.addEventListener('click', () => closeModal(btn.dataset.modal))
);
document.querySelectorAll('.modal').forEach(modal =>
  modal.addEventListener('click', e => {
    if (e.target === modal) closeModal(modal.id.replace('modal-', ''));
  })
);

// ---- Global event listeners -----------------------------------
document.addEventListener('keydown', e => {
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  if      (e.key === 'Backspace')      handleKey('BACKSPACE');
  else if (e.key === 'Enter')          handleKey('ENTER');
  else if (/^[A-Za-z]$/.test(e.key))  handleKey(e.key.toUpperCase());
});

document.getElementById('keyboard').addEventListener('click', e => {
  const key = e.target.closest('.key');
  if (key) handleKey(key.dataset.key);
});

document.getElementById('btn-open-breakdown').addEventListener('click', () =>
  openBreakdownModal(solved)
);
document.getElementById('btn-start-over').addEventListener('click', () => {
  try { localStorage.removeItem(storageKey()); } catch {}
  location.reload();
});

// ---- Init -----------------------------------------------------
function init() {
  puzzle = loadPuzzle();

  if (!puzzle) {
    document.getElementById('no-puzzle').classList.remove('hidden');
    return;
  }

  if (puzzle.num) {
    document.getElementById('puzzle-label').textContent = `Puzzle #${puzzle.num}`;
  }

  document.getElementById('clue-card').classList.remove('hidden');
  document.getElementById('answer-area').classList.remove('hidden');

  renderClue();
  buildAnswerTiles();
  setupHintsMenu();
  loadState();
}

init();
