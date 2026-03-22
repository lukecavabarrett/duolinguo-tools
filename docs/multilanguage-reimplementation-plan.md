# Multilanguage Reimplementation Plan

This restart uses `11f9838` as the baseline. The current Japanese app is the reference product, not just a feature set. Every slice must preserve the `en-ja` app's visual layout, interaction behavior, and output size profile unless a change is explicitly intended and reviewed.

## Goals

- Keep the current `en-ja` experience stable.
- Make the build generic enough to support `python3 build.py --from <src> --to <dst>`.
- Allow build-time specialization for courses like Japanese without mixing those concerns into the generic runtime.
- Keep offline behavior explicit:
  - standalone self-contained HTML
  - served/PWA variant for GitHub Pages later

## Non-Goals For Early Slices

- No UI redesign.
- No font changes.
- No runtime study-flow changes.
- No stories integration.
- No local mirroring of Duolingo CDN audio.

## Invariants

For `en-ja`, after each implementation commit:

- `python3 build.py` succeeds.
- The generated app still looks and behaves like the baseline.
- The main study card layout is unchanged.
- The standalone bundle size stays in the same rough range as the baseline unless the slice explicitly targets packaging/output behavior.

## Architecture Rules

- Runtime packs are runtime-only.
  - Rendering, answer matching, transliteration, TTS behavior.
- Scraping is build-time.
  - Shared scraper first.
  - Optional course-specific scrape behavior layered on top.
- Enrichment is build-time.
  - Japanese kana generation stays outside the browser runtime.
- Runtime data shape is generic.
  - Course-specific raw data may exist before normalization.

## Repository Layout

The reimplementation should make a clear distinction between:

- committed source-of-truth data
- generated intermediate build data
- generated deploy artifacts

### Source Tree To Keep In Git

```text
courses/
  en-ja.json
  <course-id>.json

data/
  courses/
    en-ja/
      scraped/
        vocab_data.json
        meta.json
      manual/
        skill_clusters.json
        overrides.json
      unused/
        course_structure.json
        stories/
          stories_index.json
          stories_data.json
    <course-id>/
      scraped/
        vocab_data.json
        meta.json
      manual/
        ...
      unused/
        ...

docs/
scripts/
src/
```

Meaning of each area:

- `courses/`
  - build configuration per specialized course
  - source language, target language, field mapping, scrape behavior, enrich hook, labels, packaging policy
- `data/courses/<course-id>/scraped/`
  - committed cached raw scrape results
  - this is the build input snapshot we want to preserve in Git
- `data/courses/<course-id>/manual/`
  - committed non-generated data that is curated or hand-maintained
  - examples:
    - `skill_clusters.json`
    - explicit overrides
    - manually curated aliases
- `data/courses/<course-id>/unused/`
  - committed archived data that belongs to the course but is not used by the active app yet
  - examples:
    - Japanese stories scrape
    - Japanese course structure scrape

### Generated Build Data To Keep Out Of Git

```text
build/
  courses/
    <course-id>/
      enriched/
        vocab_data.json
      packed/
        vocab-data.json
```

Meaning:

- `build/courses/<course-id>/enriched/`
  - deterministic build intermediates
  - generated from scraped data plus enrich hooks
  - should not be committed by default
- `build/courses/<course-id>/packed/`
  - compact runtime payload prepared for embedding or serving
  - should not be committed by default

### Generated Deploy Outputs To Keep Out Of Git By Default

```text
dist/
  <course-id>/
    standalone.html
    site/
      index.html
      vocab-data.json
      manifest.webmanifest
      service-worker.js
```

Meaning:

- `dist/` is local build output
- `dist/` is not source of truth
- `dist/` should not be committed by default

If GitHub Pages is later deployed directly from repository contents, that publication step should be treated as a release concern, not the source-of-truth layout for the repo itself.

## Data Retention Policy

### Keep In Git

- specialized course configs in `courses/`
- raw scraped vocab snapshots in `data/courses/<course-id>/scraped/`
- scrape metadata such as source URL / timestamp / labels in `meta.json`
- curated course-owned files in `data/courses/<course-id>/manual/`
- archived but still valuable course-owned data in `data/courses/<course-id>/unused/`

### Do Not Keep In Git

- generated enriched vocab files
- generated packed runtime payloads
- local `dist/` build outputs
- downloaded third-party CDN audio binaries
- temporary experiments for courses that are not intentionally being added to the repo

### Rationale

- scraped vocab is the cached source snapshot the user asked to keep in the repo
- enriched and packed data are reproducible from committed inputs plus scripts
- keeping generated data out of Git reduces duplication and avoids repository bloat
- keeping unused but valuable course data in `unused/` prevents accidental loss without mixing it into the active build

## Data Contracts

### Baseline Japanese Raw Scrape

When scraping is introduced, `en-ja` must preserve the existing raw data contract. The Japanese scraped file must remain field-identical to the current baseline shape:

```json
{
  "skills": ["Basics", "People"],
  "words": [
    {
      "skill": "Basics",
      "jp": "おちゃ",
      "romaji": "ocha",
      "en": ["green teas", "green tea", "tea", "teas"],
      "audio": "https://d1vq87e9lcf771.cloudfront.net/..."
    }
  ]
}
```

Acceptance rule for the scrape slice:

- introducing the shared scraper must not change Japanese field names
- introducing the shared scraper must not change Japanese field meanings
- Japanese enrich input must remain compatible with the current `scripts/enrich_vocab.mjs`

### Baseline Japanese Enriched Data

The Japanese enrich step adds `kana` and keeps the rest of the raw fields:

```json
{
  "skills": ["Basics", "People"],
  "words": [
    {
      "skill": "Basics",
      "jp": "おちゃ",
      "kana": "おちゃ",
      "romaji": "ocha",
      "en": ["green teas", "green tea", "tea", "teas"],
      "audio": "https://d1vq87e9lcf771.cloudfront.net/..."
    }
  ]
}
```

### Generic Raw Scrape For Non-Specialized Courses

For generic pairs such as `en-es`, the planned raw scrape shape is:

```json
{
  "skills": ["Introduction", "Travel"],
  "words": [
    {
      "skill": "Introduction",
      "to": "agua",
      "from": ["water"],
      "audio": "https://d1vq87e9lcf771.cloudfront.net/..."
    }
  ]
}
```

Optional fields may be added later when a course needs them:

- `toReading`
- `toTransliteration`
- `fromAliases`
- `toAliases`

### Packed Runtime Data

The final build output should keep a compact packed format rather than embedding full word objects. The baseline Japanese packing today is columnar:

```json
{
  "skills": ["Basics", "People"],
  "audioPrefix": "https://d1vq87e9lcf771.cloudfront.net/",
  "columns": {
    "jp": ["おちゃ", "ください"],
    "kana": ["おちゃ", "ください"],
    "romaji": ["ocha", "kudasai"],
    "en": [["green tea", "tea"], ["please"]],
    "audio": ["beaja/...", "beaja/..."],
    "skill": [0, 0]
  }
}
```

During reimplementation, if we move to a more generic packed format, the transport still needs to stay compact and the Japanese bundle size must be compared against the baseline after each relevant slice.

## Output Packaging

### Standalone HTML

- One course per file.
- Build embeds:
  - app JS bundle
  - course config
  - packed vocab data
  - optional auxiliary packed data such as clusters
- No network request is required for the app shell or vocab itself.

Recommended naming:

- `dist/<course-id>/standalone.html`

### GitHub Pages / Served Build

- One course per served directory.
- Build emits:
  - `index.html`
  - `vocab-data.json`
  - `manifest.webmanifest`
  - `service-worker.js`
  - optional static assets
- `index.html` should stay shell-only and fetch `vocab-data.json` from the same course directory.

Recommended layout:

- `/courses/<course-id>/index.html`
- `/courses/<course-id>/vocab-data.json`
- `/courses/<course-id>/manifest.webmanifest`
- `/courses/<course-id>/service-worker.js`

## Offline And Storage Model

### Standalone HTML

- Primary use case:
  - desktop browsers
  - Android browsers
- Explicitly not the preferred iOS path.
- Offline works because the full app and vocab are inside one HTML file.
- Remote CDN word audio is still online-only unless later replaced by another policy.
- LocalStorage behavior:
  - keys must be namespaced by course, for example `flashcards:<course-id>:history`
  - there is no in-app course switcher in standalone mode
  - the selected course is implicit in the file the user opened

### GitHub Pages / Served Build

- Primary use case:
  - normal browser usage
  - iOS-compatible served version
- Offline works after the first successful online load through the service worker.
- The service worker caches the app shell and that course's `vocab-data.json`.
- Remote CDN word audio remains online-only by default.
- LocalStorage behavior:
  - same key scheme as standalone: `flashcards:<course-id>:...`
  - multiple courses can coexist on the same origin without clobbering each other
  - service-worker caches should also be course-scoped

## GitHub Pages Course Selection

The plan should use a landing page at the site root rather than one giant multi-course app.

Recommended flow:

- `/index.html` is a course chooser page
- it lists published courses such as `en-ja`, `en-es`, `en-it`
- selecting a course navigates to `/courses/<course-id>/`
- each course page is its own app shell and owns its own cache and localStorage namespace

Why this is preferred:

- direct links and bookmarks per course
- smaller per-course payloads
- simpler service-worker scope
- cleaner localStorage separation

## Planned Slices

### 1. Docs And Guardrails

- Add this plan.
- Record the baseline verification command and expected output shape.

### 2. Course Config For `en-ja` Only

- Introduce a minimal course config file for `en-ja`.
- Keep current build output and runtime behavior unchanged.
- No generic `en-es` build yet.

Acceptance:

- `build.py` still builds the exact Japanese app.
- No HTML/CSS/JS behavioral drift.

### 3. Per-Course Data Layout

- Move Japanese committed source data under `data/courses/en-ja/`.
- Split source data from generated intermediates.
- Put generated enriched data under `build/courses/en-ja/`.
- Keep the runtime output unchanged.

Acceptance:

- `en-ja` build still matches baseline behavior.
- No new generic runtime abstractions yet.
- committed Japanese source data is clearly separated from generated data.

### 4. Generic Build CLI

- Add `--from`, `--to`, and `--course`.
- Resolve `en-ja` through config.
- Keep explicit configs only at this stage.

Acceptance:

- `python3 build.py --from en --to ja` works and produces the same Japanese app.

### 5. Shared Generic Normalization

- Introduce a neutral runtime schema internally.
- Keep the transport/output as close to baseline as possible.
- Do not change the Japanese UI.

Acceptance:

- `en-ja` still renders identically.
- Runtime tests/manual checks pass.

### 6. Generic Duome Scrape Path

- Add a shared Duome vocabulary scrape path for generic pairs.
- Cache scraped data under `data/courses/<course-id>/scraped/`.
- Add `--force` to refresh the scrape.
- Keep Japanese raw scraped data compatible with the baseline shape.

Acceptance:

- `python3 build.py --from en --to es` works from Duome.
- `python3 build.py --from en --to es --force` refreshes cache.
- `en-ja` scrape output is field-compatible with the baseline raw Japanese data.

### 7. Build-Time Specialization Hooks

- Add course-level build-time hooks:
  - scrape behavior
  - enrich step
  - field mapping
- Use these for Japanese.

Acceptance:

- Japanese-specific data handling is explicit in config/build-time hooks.
- Generic pairs do not need Japanese logic.

### 8. Served/PWA Variant

- Add `--target standalone|site|all`.
- Add `vocab-data.json`, manifest, and service worker for the served variant.
- Keep standalone as the baseline artifact.
- Add a GitHub Pages course chooser at the site root.
- Publish per-course apps under `/courses/<course-id>/`.

Acceptance:

- `en-ja` standalone still feels unchanged.
- Site build works online and app shell works offline after first load.
- User can choose the course from the GitHub Pages root page.

### 9. Offline Audio Policy

- Remote Duolingo CDN audio on demand when online.
- Device/browser TTS fallback offline.
- No CDN mirroring in the default build.

Acceptance:

- Offline behavior is explicit and documented.

## Verification Checklist Per Commit

- Run the build command for `en-ja`.
- Open the generated app and check:
  - profile screen layout
  - study card layout
  - Japanese target word placement
  - romaji reveal block
  - answer feedback banner
  - summary/progress/settings screens
- If the slice touches generic builds, also run a non-Japanese build such as `en-es`.
- If the slice touches scraping, diff the Japanese scraped/enriched data contract against the baseline.
- If the slice touches deploy modes, check:
  - standalone still works with no server
  - served build still works from a local static server
  - offline behavior matches the intended mode
  - localStorage keys remain course-scoped

## Stop Conditions

Pause and reassess if any slice:

- changes the Japanese UI unexpectedly
- increases standalone size significantly without a packaging reason
- leaks Japanese-specific logic into the generic runtime path
- makes the build or runtime harder to reason about than the baseline
