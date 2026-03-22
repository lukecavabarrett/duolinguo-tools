# duolinguo-tools

A flashcard app builder for Duolingo vocabulary courses.

The repo still ships Japanese as the reference course, but there is no default build artifact or default published course. Every build is explicit:

```bash
python3 build.py --course en-ja --target all
python3 build.py --from en --to ja --target all
python3 build.py --from en --to es --target all
```

Course data is cached per pair under `data/courses/<course-id>/`, generated intermediates live under `build/courses/<course-id>/`, and deploy artifacts are emitted under `dist/`.

## Features

- **Reference Japanese course** with 2,325 words across 221 skills, scraped from [duome.eu](https://duome.eu/vocabulary/en/ja/skills)
- **Generic cached Duome scrape flow** for other course pairs
- **Audio** from Duolingo's CDN on demand
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
- **Two deploy modes**:
  - standalone self-contained HTML
  - served/PWA site for GitHub Pages-style hosting
- **Per-course progress saved** in localStorage

## Usage

- `dist/<course-id>/standalone.html` is the portable self-contained build for a specific course.
- `dist/site/index.html` is the served course chooser for the GitHub Pages/PWA variant.

## Building from source

```bash
nvm use
npm install
python3 build.py --course en-ja --target all
```

This repo targets Node 24 for both local development and GitHub Actions.

Common commands:

```bash
python3 build.py --course en-ja --target standalone
python3 build.py --course en-ja --target site
python3 build.py --course en-ja --target all
python3 build.py --from en --to ja --target standalone
python3 build.py --from en --to ja --target site
python3 build.py --from en --to ja --target all
python3 build.py --from en --to ja --target all --force
```

What the build does:
- resolves a specialized course config from `courses/<course-id>.json`, or synthesizes a default config for generic pairs
- reuses cached scraped vocab from `data/courses/<course-id>/scraped/vocab_data.json`
- re-scrapes from Duome when `--force` is provided
- runs build-time enrichment when the course needs it (`en-ja` adds kana)
- type-checks and bundles the TypeScript app
- emits standalone and/or served/PWA outputs

Output layout:

```text
data/
  courses/<course-id>/scraped/
build/
  courses/<course-id>/enriched/
dist/
  <course-id>/standalone.html
  site/
    index.html
    courses/<course-id>/
      index.html
      vocab-data.json
      course.json
      manifest.webmanifest
      icon.svg
      service-worker.js
```

## Offline behavior

### Standalone HTML

- `dist/<course-id>/standalone.html` embeds the app shell, course config, clusters, and packed vocab data in one file.
- This is the best fully portable artifact for desktop browsers and Android Chrome.
- On iOS, opening a self-contained local HTML file is still not a reliable primary path.
- Word audio is **not** mirrored into the file. When online, the app plays Duolingo CDN audio on demand. When offline, it falls back to browser/device TTS.

### Served / GitHub Pages / PWA

- `dist/site/index.html` is the root course chooser.
- Each course lives at `dist/site/courses/<course-id>/`.
- Each course page ships a service worker and manifest, so after the first online load it can work offline as an installed PWA or cached site.
- Offline served usage caches the app shell and `vocab-data.json` for that course.
- Duolingo CDN word audio is still fetched on demand when online; offline playback falls back to browser/device TTS.

## Local storage

- Progress is stored per course, not globally.
- The Japanese reference course keeps the legacy `jf_*` keys for continuity.
- Generic courses use a course-specific storage prefix, so progress for `en-ja` and `en-es` does not collide.

## Course selection on the served site

- The served build writes a root chooser page at `dist/site/index.html`.
- That chooser links to each built course under `dist/site/courses/<course-id>/`.
- In practice, for GitHub Pages you publish the contents of `dist/site/`.
- The repo's Pages workflow builds all explicit course configs under `courses/*.json` and publishes the resulting chooser plus course folders.

## GitHub Pages publishing

- GitHub Pages should publish `dist/site/`, not the repo root.
- The recommended setup is a GitHub Actions workflow that:
  - installs Node and Python
  - runs `python3 build.py --course <course-id> --target site` for each checked-in course config
  - uploads `dist/site/` as the Pages artifact
  - deploys that artifact with the official Pages actions
- This means generated site files do not need to be committed to git.
- Standalone builds remain local artifacts under `dist/<course-id>/standalone.html`.

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

- ~~**Smarter distractor selection**~~ ✓ — clustered courses use same-cluster distractors; other courses prefer same-skill then nearby-skill distractors
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
- **Session mix heuristic** — rethink the current “new words get at most 50% of the remaining slots” rule
- **Kanji practice** - maybe we should be able to have kanji<->kana exercises - and distractors should be based on kana similarity


## Bugs
- ~~after a skill reach 70%, we cannot practice it further, so we will never reach 100%.~~ ✓ — new words capped at half remaining session slots; reinforcement from past skills fills the rest
- ~~similarily, when practicing a specific skill, we cannot pick a mastered one~~ ✓ — reinforcement pool now includes strong-but-not-due words
- ~~typing issues - pasupoto, juichi.~~ ✓
- ~~kana issues - o'clock is rendered into kana as "toki" when it should be ji.~~ ✓ — switched to wanakana (romaji → kana) with kuroshiro fallback
