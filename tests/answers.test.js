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

const kinds = el => el.children.map(c =>
  c.classList.has('ans-word') ? kinds(c) : [...c.classList][0].replace('ans-', ''));

test('single-word answers are unchanged', () => {
  const { puzzle, tiles } = load('liane');
  assert.equal(puzzle.answer, 'LIANE');
  assert.equal(puzzle.display, 'LIANE');
  assert.deepEqual(kinds(tiles), [['tile', 'tile', 'tile', 'tile', 'tile']]);
});

test('multi-word answers keep word breaks for display but not for guessing', () => {
  const { puzzle, tiles } = load('Ice  cream');
  assert.equal(puzzle.answer, 'ICECREAM');
  assert.equal(puzzle.display, 'ICE CREAM');
  const k = kinds(tiles);
  assert.equal(k.length, 3);
  assert.equal(k[0].length, 3);
  assert.equal(k[1], 'space');
  assert.equal(k[2].length, 5);
  assert.ok(!tiles.classList.has('wrap'));
});

test('hyphenated answers render a dash between parts', () => {
  const { puzzle, tiles } = load('mother-in-law');
  assert.equal(puzzle.answer, 'MOTHERINLAW');
  assert.equal(puzzle.display, 'MOTHER-IN-LAW');
  assert.deepEqual(kinds(tiles)[0].filter(x => x === 'hyphen').length, 2);
});

test('tile indices run across words so typing flows between them', () => {
  const { tiles } = load('ab cd');
  const idx = tiles.children.filter(c => c.classList.has('ans-word'))
    .flatMap(w => w.children.map(t => t.dataset.index));
  assert.deepEqual(idx, [0, 1, 2, 3]);
});

test('long phrases wrap one word per line on narrow screens', () => {
  const { tiles } = load('NATURAL DISASTER', 375);
  assert.ok(tiles.classList.has('wrap'));
  assert.ok(!kinds(tiles).includes('space'));
  const size = parseInt(tiles.children[0].children[0].style.cssText.match(/width:(\d+)px/)[1]);
  assert.ok(size >= 30, `tile size ${size}px should stay readable`);
});

test('answers with no letters are rejected', () => {
  assert.equal(load(' - ').puzzle, null);
});
