# duolinguo-tools

A self-contained HTML flashcard app for studying Japanese vocabulary from Duolingo. No server, no build step required to use — just open `jp-flashcards.html` in any browser (including Android Chrome).

## Features

- **2,325 words** across 221 skills, scraped from [duome.eu](https://duome.eu/vocabulary/en/ja/skills)
- **Audio** from Duolingo's CDN for every word
- **Mixed exercise mode** (default) — exercise type varies per card based on familiarity:
  - JP → EN multiple choice
  - EN → JP multiple choice
  - Audio-only (listen and pick the meaning)
  - JP → EN type answer
  - EN → JP type answer
- **Forced modes** — lock to multiple choice or type answer if preferred
- **SM-2 inspired spaced repetition** — harder words appear more often
- **Furigana** — kana readings above kanji via ruby annotations
- **Romaji** — hidden by default, tap the word to reveal (resets per card)
- **Wrong-answer info banner** — shows full word details on mistakes
- **Duolingo-style UI** — dark theme, green accents, raised buttons, sound effects
- **Offline-capable** — everything embedded in a single HTML file
- **Progress saved** in localStorage

## Usage

Open `jp-flashcards.html` in any browser. That's it.

## Building from source

The distributable file is built by embedding `vocab_data.json` into `index.html`:

```bash
python3 build.py
```

To re-enrich the vocabulary data (add kana/romaji via kuroshiro):

```bash
npm install
node enrich_vocab.mjs
```

## Next steps

- **Smarter distractor selection** — choose wrong answers that are semantically closer or from the same category, rather than just same-skill random picks
- **Better wrong-answer banner** — the explanation shown after a wrong answer is too crammed; redesign the layout to be clearer and more readable
- **Fuzzy matching for typed answers** — accept minor differences like `o` vs `ō`, `ou` vs `oo`, missing hyphens, etc.
- **Improved progress algorithm** — iterate on the SM-2 variant to better model long-term retention and adapt session difficulty
- **Layout** - the continue button should not move the rest of the content up
- **Reset Progress feature** - to implement
