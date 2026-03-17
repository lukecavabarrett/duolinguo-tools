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
- **Adaptive progression** — skills unlock automatically as you master earlier words (see below)
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

```bash
npm install
python3 build.py
```

The build pipeline: enriches scraped vocab with kana readings (wanakana + kuroshiro), type-checks and bundles TypeScript, then embeds everything into `jp-flashcards.html`.

## Progression algorithm

The app uses a strength-based progression system that automatically paces the user through the curriculum.

**Word strength** is computed on the fly from existing history — no new state stored:

```
strength = (correct / seen) * min(seen, 10) / 10
```

This ramps from 0 to the word's accuracy over the first 10 exposures. A word answered correctly twice isn't considered "mastered" (strength = 0.2) — it needs consistent accuracy over multiple sessions.

**Current level** is the highest skill index where ALL words have strength >= 0.7. The user advances by getting every word in a skill to 0.7+ strength, and can regress if accuracy drops.

**Session construction** picks 15 cards in priority order:
1. **Weak words** — seen words with strength < 0.7 (need reinforcement)
2. **Due words** — words whose spaced repetition interval has expired
3. **New words** — unseen words from the next skill in sequence

This naturally handles edge cases:
- **Cold start**: all words are new, session fills from skill 1
- **Returning after days**: many due words surface, review before new material
- **Struggling**: weak words keep appearing until mastered, blocking progression
- **Experienced users**: can toggle "Unlock all skills" in settings for manual control

## Next steps

- **Smarter distractor selection** — choose wrong answers that are semantically closer or from the same category, rather than just same-skill random picks
- ~~**Better wrong-answer banner**~~ ✓ — context-aware: skips info already on the card, shows all English meanings
- ~~**Fuzzy matching for typed answers**~~ ✓ — accepts `o`/`ō`/`ou`/`oo`, Hepburn/Nihon-shiki variants, hyphens, etc.
- ~~**Improved progress algorithm**~~ ✓ — strength-based progression with automatic skill unlocking
- ~~**Layout**~~ ✓ - the continue button should not move the rest of the content up
- ~~**Can't listen now**~~ ✓ — tap to skip all audio exercises for the rest of the session
- ~~**Settings**~~ ✓ — dedicated settings screen with back navigation, replaces homepage button clutter
- **Stories** - This feature is large and for the future. Using https://duome.eu/stories/en/ja to add 2 features: sentences and stories.
- ~~**Unit-specific practice**~~ ✓ — "Unit only" toggle to practice a single skill
- ~~**Feedback**~~ ✓ — Duolingo 5-correct-answers sound + streak banner animation
- ~~**Fonts**~~ ✓ - when selecting among jp options, use a nicer font
- ~~**Skill progression**~~ ✓ - change formula to compute skill percentage to make it more gradual
- **Kanji practice** - maybe we should be able to have kanji<->kana exercises - and distractors should be based on kana similarity
- **Multilingual** - This feature is large and for the future. Separate in this repo what is language agnostic and what is language specific, and make it so we can build the app specifying two languages (native, learn). Then for each learned language, we will have some modules that handle special stuff (jp is a good example because it has a lot of special behaviour). This is really not needed, and mostly just a flex - we should do this only if it does not hinder the jp usage.


## Bugs
- ~~after a skill reach 70%, we cannot practice it further, so we will never reach 100%.~~ ✓ — new words capped at half remaining session slots; reinforcement from past skills fills the rest
- similarily, when practicing a specific skill, we cannot pick a mastered one
- ~~typing issues - pasupoto, juichi.~~ ✓
- ~~kana issues - o'clock is rendered into kana as "toki" when it should be ji.~~ ✓ — switched to wanakana (romaji → kana) with kuroshiro fallback