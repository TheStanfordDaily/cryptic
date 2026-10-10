const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { test } = require('node:test');
const vm = require('node:vm');

const source = readFileSync(require.resolve('../game.js'), 'utf8');

function render(clue, parts, hints) {
  const display = { textContent: '', innerHTML: '' };
  const element = { addEventListener() {}, classList: { remove() {} } };
  const context = vm.createContext({
    URLSearchParams,
    window: { location: { search: '' } },
    document: {
      querySelectorAll: () => [],
      addEventListener() {},
      getElementById: id => id === 'clue-display' ? display : element,
    },
    fixture: { clue, def: [], ind: [], fod: [], ...parts },
    hints,
  });
  vm.runInContext(source, context);
  vm.runInContext('puzzle = fixture; hintsRevealed = new Set(hints); renderClueHighlights();', context);
  return display;
}

test('a shared phrase retains both definition and fodder roles', () => {
  const { innerHTML } = render('Some phrase (4)', { def: ['Some phrase'], fod: ['some phrase'] }, ['fod', 'def']);
  assert.equal(innerHTML, '<span class="hl-def hl-fod" title="Definition + Fodder">Some phrase</span> (4)');
});

test('partial overlaps split at role boundaries', () => {
  const { innerHTML } = render('red green blue', { def: ['red green'], fod: ['green blue'] }, ['def', 'fod']);
  assert.equal(innerHTML, '<span class="hl-def" title="Definition">red </span><span class="hl-def hl-fod" title="Definition + Fodder">green</span><span class="hl-fod" title="Fodder"> blue</span>');
});

test('all role combinations retain each role without duplicates', () => {
  for (const hints of [['def', 'ind'], ['ind', 'fod'], ['def', 'ind', 'fod']]) {
    const { innerHTML } = render('shared', { def: ['shared', 'shared'], ind: ['shared'], fod: ['shared'] }, hints);
    for (const type of hints) assert.equal(innerHTML.split(`hl-${type}`).length - 1, 1);
  }
});

test('unrevealed roles stay hidden', () => {
  const parts = { def: ['shared'], fod: ['shared'] };
  assert.equal(render('shared', parts, []).textContent, 'shared');
  assert.equal(render('shared', parts, ['fod']).innerHTML, '<span class="hl-fod" title="Fodder">shared</span>');
});

test('disjoint parts and HTML escaping still work', () => {
  const { innerHTML } = render('<red> & blue', { def: ['<red>'], fod: ['blue', 'missing'] }, ['def', 'fod']);
  assert.equal(innerHTML, '<span class="hl-def" title="Definition">&lt;red&gt;</span> &amp; <span class="hl-fod" title="Fodder">blue</span>');
});
