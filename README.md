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
- **Wrong-answer info banner** — context-aware: shows only new info per exercise type
- **"Can't listen now"** — skip audio exercises for the rest of the session
- **Fuzzy typed answers** — romaji variants, macron vowels, and common romanization differences accepted
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
- ~~**Better wrong-answer banner**~~ ✓ — context-aware: skips info already on the card, shows all English meanings
- ~~**Fuzzy matching for typed answers**~~ ✓ — accepts `o`/`ō`/`ou`/`oo`, Hepburn/Nihon-shiki variants, hyphens, etc.
- **Improved progress algorithm** — iterate on the SM-2 variant to better model long-term retention and adapt session difficulty
- **Layout** - the continue button should not move the rest of the content up
- ~~**Can't listen now**~~ ✓ — tap to skip all audio exercises for the rest of the session
- **Settings** - rather than keep adding buttons to homepage (reset progress, info etc) we should organizing those in a smarter way that does not overcrowd the homepage.
- **Stories** - This feature is large and for the future. Using https://duome.eu/stories/en/ja to add 2 features: sentences and stories.
- **Unit-specific practice** - maybe I'd like to have the option to practice a specific unit
- **Feedback** - incorporate https://www.myinstants.com/en/instant/duolingo-5-correct-answers-41764/ for 5 correct in a row, maybe with a nice animation
