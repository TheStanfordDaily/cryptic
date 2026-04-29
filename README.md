# Cardinal Cryptic Embed Guide

How to create and embed a daily cryptic clue in WordPress.

---

## 1. Open the puzzle generator

Open `generate.html` in any browser. Fill in the following fields:

### Required

- **Clue** — the full cryptic clue, including the answer length in parentheses at the end.
  Example: `Confused alien (5)`
- **Answer** — the solution in capital letters, no spaces or hyphens.
  Example: `LIANE`
- **Puzzle #** — increment by one each day.

### Clue structure (for hints)

These fields power the hint system. Each field supports a single part or multiple non-contiguous parts, written as quoted strings:

```
"word"
"part one", "part two"
```

- **Definition** — the word or phrase in the clue that directly defines the answer (like a dictionary entry). Usually the first or last element of the clue.
- **Indicator** — the word(s) that signal which wordplay device is being used (e.g. `"confused"` signals an anagram).
- **Fodder** — the letters being manipulated. If they are split across the clue, quote each group separately: `"cat", "door"`.

Each quoted part must appear verbatim in the clue text — the generator will warn you if any part is not found.

- **Explanation** — a plain-English description of how the wordplay works. Shown to the solver after they answer correctly or run out of guesses.
  Example: `Anagram of ALIEN, indicated by "confused", gives LIANE.`

---

## 2. Generate and copy the embed code

Click **Generate Embed Code**. Use the **Open preview ↗** link to check that the puzzle looks correct before publishing.

Click **Copy** to copy the HTML snippet.

---

## 3. Embed in WordPress

In the WordPress block editor, add a **Custom HTML** block and paste the copied snippet. It looks like this:

```html
<div style="max-width:520px; margin:0 auto;">
  <iframe
    src="https://thestanforddaily.github.io/cryptic/?d=...&p=1"
    width="100%"
    height="640"
    frameborder="0"
    style="border:none; border-radius:8px;"
    title="Cardinal Cryptic #1"
    allow="clipboard-write">
  </iframe>
</div>
```

---

## How the game works

Players see a single cryptic clue and the answer length. They have **5 guesses** to type the correct answer using the on-screen or physical keyboard.

- The **lightbulb menu** (header, top-left) offers three progressive hints:
  - **Definition** — highlights the definition part of the clue in amber
  - **Indicator** — highlights the wordplay indicator in red
  - **Fodder** — highlights the letter fodder in green
- After solving or exhausting all guesses, a **Clue Breakdown** popup shows the answer, the labeled clue parts, and the full explanation.
- The breakdown can be reopened at any time via the notes icon in the header.
- Progress is saved automatically per puzzle number so players can return to a puzzle in progress.
