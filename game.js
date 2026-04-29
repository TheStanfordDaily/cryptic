const STORAGE_PREFIX = 'cryptic_state_';
const MAX_GUESSES    = 5;
const HINT_TYPES     = ['def', 'ind', 'fod'];
const HINT_LABELS    = { def: 'Definition', ind: 'Indicator', fod: 'Fodder' };

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

let puzzle        = null;
let solved        = false;
let gameOver      = false;
let attempts      = 0;
let hintsRevealed = new Set();
let currentInput  = [];
let tiles         = null;

const elToastContainer = document.getElementById('toast-container');
const elClueDisplay    = document.getElementById('clue-display');
const elAnswerTiles    = document.getElementById('answer-tiles');
const elGuessCounter   = document.getElementById('guess-counter');

function storageKey() {
  return `${STORAGE_PREFIX}${puzzle.num || simpleHash(puzzle.clue)}`;
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
    } else if (s.gameOver) {
      gameOver = true;
      lockInput();
    } else if (Array.isArray(s.currentInput) && s.currentInput.length) {
      currentInput = s.currentInput;
      syncTiles();
    }

    hintsRevealed.forEach(type => applyHintMenuStyle(type));
    renderClueHighlights();
    renderHintLegend();
    updateGuessCounter();
  } catch {}
}

function buildAnswerTiles() {
  elAnswerTiles.innerHTML = '';
  const n    = puzzle.answer.length;
  const maxW = Math.min(460, window.innerWidth - 48);
  const gap  = 7;
  const size = Math.min(56, Math.floor((maxW - gap * (n - 1)) / n));
  const fs   = Math.max(0.88, size / 34).toFixed(2) + 'rem';

  const frag = document.createDocumentFragment();
  for (let i = 0; i < n; i++) {
    const tile = document.createElement('div');
    tile.classList.add('ans-tile');
    tile.dataset.index = i;
    tile.style.cssText = `width:${size}px; height:${size}px; font-size:${fs};`;
    frag.appendChild(tile);
  }
  elAnswerTiles.appendChild(frag);
  tiles = [...elAnswerTiles.querySelectorAll('.ans-tile')];
}

function forEachTile(fn) {
  tiles.forEach(fn);
}

function syncTiles() {
  forEachTile((tile, i) => {
    const ch = currentInput[i] || '';
    tile.textContent = ch;
    tile.classList.toggle('filled', !!ch);
    tile.classList.remove('correct', 'wrong');
  });
}

function fillTilesCorrect() {
  forEachTile((tile, i) => {
    tile.textContent = puzzle.answer[i];
    tile.classList.remove('filled', 'wrong');
    tile.classList.add('correct');
  });
}

function fillTilesWrong() {
  forEachTile((tile, i) => {
    tile.textContent = currentInput[i] || '';
    tile.classList.remove('filled', 'correct');
    if (currentInput[i]) tile.classList.add('wrong');
  });
}

function shakeTiles() {
  elAnswerTiles.classList.remove('shake');
  void elAnswerTiles.offsetWidth;
  elAnswerTiles.classList.add('shake');
  elAnswerTiles.addEventListener('animationend', () => elAnswerTiles.classList.remove('shake'), { once: true });
}

function updateGuessCounter() {
  if (solved || gameOver || attempts === 0) { elGuessCounter.classList.add('hidden'); return; }

  const remaining = MAX_GUESSES - attempts;
  elGuessCounter.textContent = remaining === 1
    ? '1 guess remaining'
    : `${remaining} guesses remaining`;
  elGuessCounter.classList.toggle('urgent', remaining === 1);
  elGuessCounter.classList.remove('hidden');
}

function addLetter(letter) {
  if (solved || gameOver || currentInput.length >= puzzle.answer.length) return;
  const tile = tiles[currentInput.length];
  currentInput.push(letter);
  tile.textContent = letter;
  tile.classList.add('filled');
  tile.classList.remove('correct', 'wrong', 'pop');
  void tile.offsetWidth;
  tile.classList.add('pop');
  saveState();
}

function deleteLetter() {
  if (solved || gameOver || currentInput.length === 0) return;
  currentInput.pop();
  const tile = tiles[currentInput.length];
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
  document.querySelectorAll('.key').forEach(k => k.disabled = true);
  document.querySelectorAll('#hints-menu .dropdown-item').forEach(b => b.disabled = true);
  document.getElementById('btn-open-breakdown').classList.remove('hidden');
}

function submitAnswer() {
  if (solved || gameOver) return;
  if (currentInput.length < puzzle.answer.length) {
    showToast('Not enough letters');
    shakeTiles();
    return;
  }

  attempts++;
  const guess = currentInput.join('');

  if (guess === puzzle.answer) {
    handleWin();
    return;
  }

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

function revealAllHints() {
  HINT_TYPES.forEach(t => { if (puzzle[t].length) hintsRevealed.add(t); });
  renderClueHighlights();
  renderHintLegend();
}

function handleWin() {
  solved = true;
  saveState();
  lockInput();
  fillTilesCorrect();

  forEachTile((tile, i) =>
    setTimeout(() => tile.classList.add('bounce'), i * 80)
  );

  showToast('Brilliant!', 2200);
  setTimeout(revealAllHints, 500);
  setTimeout(() => openBreakdownModal(true), 1600);
}

function handleLoss() {
  gameOver = true;
  saveState();
  lockInput();
  fillTilesWrong();
  setTimeout(revealAllHints, 300);
  setTimeout(() => openBreakdownModal(false), 900);
}

function openBreakdownModal(won) {
  const status  = document.getElementById('breakdown-status');
  const content = document.getElementById('breakdown-content');

  status.textContent = won ? `Solved in ${attempts} guess${attempts === 1 ? '' : 'es'}!` : 'Better luck next time!';
  status.className   = won ? 'won' : 'lost';

  const parts = HINT_TYPES
    .filter(t => puzzle[t].length)
    .map(t => {
      const display = puzzle[t].map(p => `"${escHtml(p)}"`).join(', ');
      return `<div class="exp-part">
        <span class="exp-badge ${t}">${HINT_LABELS[t]}</span>
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
  if (hintsRevealed.has(type) || solved || gameOver || !puzzle[type].length) return;
  hintsRevealed.add(type);
  applyHintMenuStyle(type);
  renderClueHighlights();
  renderHintLegend();
  saveState();
}

function applyHintMenuStyle(type) {
  const btn = document.getElementById(`menu-hint-${type}`);
  if (!btn) return;
  btn.textContent = `${HINT_LABELS[type]} ✓`;
  btn.classList.add(`revealed-${type}`);
  btn.disabled = true;
}

function renderClue() {
  elClueDisplay.textContent = puzzle.clue;
}

function renderClueHighlights() {
  const text = puzzle.clue;
  if (!hintsRevealed.size) {
    elClueDisplay.textContent = text;
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

  elClueDisplay.innerHTML = html;
}

function renderHintLegend() {
  const legend = document.getElementById('hint-legend');
  if (!hintsRevealed.size) { legend.classList.add('hidden'); return; }

  legend.innerHTML = [...hintsRevealed]
    .map(type => {
      const display = puzzle[type].map(p => `"${escHtml(p)}"`).join(', ');
      return `<div class="legend-item">
        <div class="legend-dot ${type}"></div>
        <span class="legend-label">${HINT_LABELS[type]}</span>
        <span class="legend-text">${display}</span>
      </div>`;
    })
    .join('');
  legend.classList.remove('hidden');
}

function showToast(message, duration = 1800) {
  const toast = document.createElement('div');
  toast.classList.add('toast');
  toast.textContent = message;
  toast.style.animationDuration = `${duration / 1000}s`;
  elToastContainer.appendChild(toast);
  setTimeout(() => toast.remove(), duration);
}

function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

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

function init() {
  puzzle = loadPuzzle();

  if (!puzzle) {
    document.getElementById('no-puzzle').classList.remove('hidden');
    return;
  }

  document.getElementById('clue-card').classList.remove('hidden');
  document.getElementById('answer-area').classList.remove('hidden');

  renderClue();
  buildAnswerTiles();
  setupHintsMenu();
  loadState();
}

init();
