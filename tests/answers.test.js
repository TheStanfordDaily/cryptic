const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { test } = require('node:test');
const vm = require('node:vm');

const source = readFileSync(require.resolve('../game.js'), 'utf8');

// Minimal DOM: enough for loadPuzzle() + buildAnswerTiles().
function makeElement() {
  const el = {
    children: [], classList: new Set(), dataset: {}, style: {},
    set innerHTML(_) { el.children = []; },
    appendChild(c) { el.children.push(c); },
    setAttribute() {},
    addEventListener() {},
  };
  el.classList.add = el.classList.add.bind(el.classList);
  el.classList.remove = () => {};
  el.classList.toggle = (c, on) => on ? el.classList.add(c) : el.classList.delete(c);
  return el;
}

function load(answer, innerWidth = 1024) {
  const d = Buffer.from(JSON.stringify({ clue: 'clue', answer })).toString('base64');
  const tiles = makeElement();
  const context = vm.createContext({
    URLSearchParams, atob,
    window: { location: { search: `?d=${encodeURIComponent(d)}` }, innerWidth },
    document: {
      querySelectorAll: () => [],
      addEventListener() {},
      createElement: makeElement,
      getElementById: id => id === 'answer-tiles' ? tiles : makeElement(),
    },
  });
  vm.runInContext(source.replace(/\ninit\(\);\s*$/, ''), context);
  vm.runInContext('puzzle = loadPuzzle(); if (puzzle) buildAnswerTiles();', context);
  return { puzzle: vm.runInContext('puzzle', context), tiles };
}

// Container → lines → (words | spaces) → (tiles | hyphens), as nested arrays of names.
const shape = el => el.children.map(c => c.children.length ? shape(c) : [...c.classList][0].replace('ans-', ''));
const lineText = (tiles, puzzle) => {
  // Rebuild each line's text from tile indices, e.g. ['A TALE OF', 'TWO CITIES']
  return tiles.children.map(line => line.children.map(w =>
    w.classList.has('ans-space') ? ' ' :
    w.children.map(t => t.classList.has('ans-hyphen') ? '-' : puzzle.answer[t.dataset.index]).join('')
  ).join(''));
};
const tileSize = tiles => parseInt(tiles.children[0].children[0].children[0].style.cssText.match(/width:(\d+)px/)[1]);

test('single-word answers are unchanged', () => {
  const { puzzle, tiles } = load('liane');
  assert.equal(puzzle.answer, 'LIANE');
  assert.equal(puzzle.display, 'LIANE');
  assert.deepEqual(shape(tiles), [[['tile', 'tile', 'tile', 'tile', 'tile']]]);
});

test('single-word sizing matches the original formula', () => {
  for (const [word, width] of [['LIANE', 1024], ['LIANE', 320], ['EXTRAORDINARILY', 375], ['EXTRAORDINARILY', 1024], ['TREE', 375]]) {
    const n = word.length, maxW = Math.min(460, width - 48);
    const expected = Math.min(56, Math.floor((maxW - 7 * (n - 1)) / n));
    assert.equal(tileSize(load(word, width).tiles), expected, `${word} @ ${width}px`);
  }
});

test('multi-word answers keep word breaks for display but not for guessing', () => {
  const { puzzle, tiles } = load('Ice  cream');
  assert.equal(puzzle.answer, 'ICECREAM');
  assert.equal(puzzle.display, 'ICE CREAM');
  assert.deepEqual(lineText(tiles, puzzle), ['ICE CREAM']);
});

test('hyphenated answers render a dash between parts', () => {
  const { puzzle, tiles } = load('mother-in-law');
  assert.equal(puzzle.answer, 'MOTHERINLAW');
  assert.equal(puzzle.display, 'MOTHER-IN-LAW');
  assert.deepEqual(lineText(tiles, puzzle), ['MOTHER-IN-LAW']);
});

test('mixed spaces and hyphens', () => {
  const { puzzle, tiles } = load(' well-to-do  folk- ');
  assert.equal(puzzle.answer, 'WELLTODOFOLK');
  assert.equal(puzzle.display, 'WELL-TO-DO FOLK');
  assert.deepEqual(lineText(tiles, puzzle), ['WELL-TO-DO FOLK']);
});

test('tile indices run across words and lines so typing flows between them', () => {
  for (const [answer, width] of [['ab cd', 1024], ['A TALE OF TWO CITIES', 375]]) {
    const { puzzle, tiles } = load(answer, width);
    const idx = [];
    const walk = el => el.children.forEach(c => c.classList.has('ans-tile') ? idx.push(c.dataset.index) : walk(c));
    walk(tiles);
    assert.deepEqual(idx, [...puzzle.answer].map((_, i) => i));
  }
});

test('long phrases break between words when tiles would get too small', () => {
  const nd = load('NATURAL DISASTER', 375);
  assert.deepEqual(lineText(nd.tiles, nd.puzzle), ['NATURAL', 'DISASTER']);
  assert.ok(tileSize(nd.tiles) >= 30);
});

test('wrapped lines pack several words and stay within the height budget', () => {
  for (const width of [320, 375, 520, 1024]) {
    const { puzzle, tiles } = load('A TALE OF TWO CITIES', width);
    const lines = lineText(tiles, puzzle);
    const size = tileSize(tiles);
    assert.ok(lines.length <= 3, `${width}px: ${lines.length} lines`);
    assert.ok(lines.length * size + (lines.length - 1) * 5 <= 100, `${width}px: too tall`);
    assert.equal(lines.join(' '), 'A TALE OF TWO CITIES');
  }
});

test('short phrases that fit stay on one line', () => {
  const { puzzle, tiles } = load('ICE CREAM', 375);
  assert.deepEqual(lineText(tiles, puzzle), ['ICE CREAM']);
});

test('answers with no letters are rejected', () => {
  assert.equal(load(' - ').puzzle, null);
  assert.equal(load('123').puzzle, null);
});

test('old-format puzzles (letters only) still load', () => {
  const { puzzle, tiles } = load('TREE');
  assert.equal(puzzle.answer, 'TREE');
  assert.equal(shape(tiles).length, 1);
});
