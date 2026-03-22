#!/usr/bin/env python3
"""Build the flashcard app for a configured or synthesized course."""

from __future__ import annotations

import argparse
import hashlib
from html import escape, unescape
import json
import os
from pathlib import Path
import re
import subprocess
import sys
import time
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen


ROOT = Path(__file__).resolve().parent
DEFAULT_BRAND_SUBTITLE = "Duolingo Flashcards"
DEFAULT_AUDIO_PREFIX = "https://d1vq87e9lcf771.cloudfront.net/"
DEFAULT_SCRAPE_BEHAVIOR = "default"
JAPANESE_SCRAPE_BEHAVIOR = "ja"
LANGUAGE_FLAGS = {
    "en": "🇺🇸",
    "es": "🇪🇸",
    "fr": "🇫🇷",
    "de": "🇩🇪",
    "it": "🇮🇹",
    "ja": "🇯🇵",
    "pt": "🇵🇹",
}


def step(name: str) -> float:
    print(f"{name}...", end=" ", flush=True)
    return time.time()


def done(start: float, detail: str = "") -> None:
    elapsed = time.time() - start
    print(f"done ({elapsed:.2f}s){' — ' + detail if detail else ''}")


def fingerprint(*parts: str, length: int = 12) -> str:
    digest = hashlib.sha256()
    for part in parts:
        digest.update(part.encode("utf-8"))
        digest.update(b"\0")
    return digest.hexdigest()[:length]


def fail(result: subprocess.CompletedProcess[str]) -> None:
    print("FAILED")
    output = (result.stdout or "") + (result.stderr or "")
    if output.strip():
        print(output)
    sys.exit(1)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--from", dest="from_lang", help="Source language code")
    parser.add_argument("--to", dest="to_lang", help="Target language code")
    parser.add_argument("--course", help="Override course id, e.g. en-ja")
    parser.add_argument("--target", choices=["standalone", "site", "all"], default="all", help="Build target")
    parser.add_argument("--force", action="store_true", help="Re-scrape vocab even if cached data exists")
    parser.add_argument("--output", help="Optional extra output path for the standalone HTML")
    args = parser.parse_args()
    if args.course:
        return args
    if args.from_lang and args.to_lang:
        return args
    parser.error("Specify either --course <from-to> or both --from <lang> and --to <lang>.")


def write_text(path: Path, text: str) -> Path:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(text, encoding="utf-8")
    return path


def write_json(path: Path, data: dict) -> Path:
    return write_text(path, json.dumps(data, ensure_ascii=False, indent=1) + "\n")


def read_json(path: Path) -> dict:
    with path.open("r", encoding="utf-8") as f:
        return json.load(f)


def split_course_id(course_id: str) -> tuple[str, str]:
    if "-" not in course_id:
        print(f"Invalid course id {course_id!r}: expected <from>-<to>")
        sys.exit(1)
    return tuple(course_id.split("-", 1))


def load_course_config(course_id: str) -> dict | None:
    path = ROOT / "courses" / f"{course_id}.json"
    if not path.exists():
        return None
    with path.open("r", encoding="utf-8") as f:
        return json.load(f)


def language_flag(lang: str) -> str:
    return LANGUAGE_FLAGS.get(lang.lower(), "")


def make_default_course_config(course_id: str, from_lang: str, to_lang: str) -> dict:
    data_root = Path("data") / "courses" / course_id
    build_root = Path("build") / "courses" / course_id
    return {
        "courseId": course_id,
        "title": f"{to_lang.upper()} Flash",
        "brandTitle": to_lang.upper(),
        "brandSubtitle": DEFAULT_BRAND_SUBTITLE,
        "brandIcon": language_flag(to_lang) or to_lang.upper(),
        "fromLang": from_lang,
        "toLang": to_lang,
        "targetPack": "ja" if to_lang == "ja" else "default",
        "storagePrefix": f"flashcards:{course_id}",
        "fetchPath": str(build_root / "enriched" / "vocab_data.json"),
        "wordAudioMode": "remote",
        "labels": {
            "from": from_lang.upper(),
            "to": to_lang.upper(),
            "fromShort": from_lang.upper(),
            "toShort": to_lang.upper(),
        },
        "audioPrefix": DEFAULT_AUDIO_PREFIX,
        "inputVocabPath": str(data_root / "scraped" / "vocab_data.json"),
        "enrichedVocabPath": str(build_root / "enriched" / "vocab_data.json"),
        "scrapeBehavior": JAPANESE_SCRAPE_BEHAVIOR if to_lang == "ja" else DEFAULT_SCRAPE_BEHAVIOR,
        "packFormat": "generic",
    }


def resolve_course(args: argparse.Namespace) -> tuple[dict, bool]:
    course_id = args.course or f"{args.from_lang}-{args.to_lang}"
    explicit_course = load_course_config(course_id)
    if explicit_course is not None:
        return explicit_course, True
    from_lang, to_lang = split_course_id(course_id)
    return make_default_course_config(course_id, from_lang, to_lang), False


def fetch_text(url: str) -> str:
    request = Request(url, headers={"User-Agent": "Mozilla/5.0 (compatible; duolinguo-tools/1.0)"})
    try:
        with urlopen(request, timeout=30) as response:
            charset = response.headers.get_content_charset() or "utf-8"
            return response.read().decode(charset, errors="replace")
    except HTTPError as exc:
        print(f"Failed to fetch {url}: HTTP {exc.code}")
        sys.exit(1)
    except URLError as exc:
        print(f"Failed to fetch {url}: {exc.reason}")
        sys.exit(1)


def clean_html_text(raw: str) -> str:
    text = re.sub(r"<[^>]+>", "", raw)
    text = unescape(text)
    return re.sub(r"\s+", " ", text).strip()


def split_meanings(raw: str) -> list[str]:
    return [part.strip() for part in clean_html_text(raw).split(",") if part.strip()]


def parse_duome_header(html: str) -> tuple[str, str]:
    match = re.search(r"<h3[^>]*>(.*?)</h3>", html, re.S)
    if not match:
        return "", ""
    heading = clean_html_text(match.group(1))
    if " from " not in heading:
        return "", ""
    to_label, from_label = heading.split(" from ", 1)
    return from_label.strip(), to_label.strip()


def parse_duome_vocab_entries(html: str) -> tuple[list[str], list[dict]]:
    block_match = re.search(r'<div id="words"><ul class="plain list">(.*?)</ul></div>', html, re.S)
    if not block_match:
        print("Failed to parse Duome vocabulary page: word list not found")
        sys.exit(1)

    skills: list[str] = []
    entries: list[dict] = []
    current_skill = ""
    for match in re.finditer(r"<li(?P<attrs>[^>]*)>(?P<body>.*?)</li>", block_match.group(1), re.S):
        attrs = match.group("attrs") or ""
        item = match.group("body")
        if "path-section-delimiter" in attrs or "path-section-delimiter" in item:
            skill_match = re.search(r"<span[^>]*>(.*?)</span>", item, re.S)
            if not skill_match:
                continue
            current_skill = clean_html_text(skill_match.group(1))
            if current_skill:
                skills.append(current_skill)
            continue

        if not current_skill:
            continue

        target_match = re.search(r'<span class="_blue wA">(.*?)</span>', item, re.S)
        meanings_match = re.search(r'<span class="cCCC wT"> - (.*?)</span>', item, re.S)
        if not target_match or not meanings_match:
            continue

        target_text = clean_html_text(target_match.group(1))
        meanings = split_meanings(meanings_match.group(1))
        reading_match = re.search(r'<span class="cCCC">\s*-\s*\[(.*?)\]</span>', item, re.S)
        reading = clean_html_text(reading_match.group(1)) if reading_match else ""
        audio_match = re.search(r'data-src="([^"]+)"', item)
        audio = unescape(audio_match.group(1)).strip() if audio_match else ""

        entries.append({
            "skill": current_skill,
            "target": target_text,
            "meanings": meanings,
            "reading": reading,
            "audio": audio,
        })

    if not entries:
        print("Failed to parse Duome vocabulary page: no words found")
        sys.exit(1)

    return skills, entries


def apply_scrape_behavior(skills: list[str], entries: list[dict], scrape_behavior: str) -> dict:
    words: list[dict] = []
    for entry in entries:
        if scrape_behavior == JAPANESE_SCRAPE_BEHAVIOR:
            words.append({
                "skill": entry["skill"],
                "jp": entry["target"],
                "romaji": entry["reading"],
                "en": entry["meanings"],
                "audio": entry["audio"],
            })
            continue

        words.append({
            "skill": entry["skill"],
            "to": entry["target"],
            "from": entry["meanings"],
            "audio": entry["audio"],
        })

    return {"skills": skills, "words": words}


def fetch_duome_vocab(from_lang: str, to_lang: str, scrape_behavior: str) -> tuple[dict, dict]:
    url = f"https://duome.eu/vocabulary/{from_lang}/{to_lang}/skills"
    html = fetch_text(url)
    skills, entries = parse_duome_vocab_entries(html)
    vocab = apply_scrape_behavior(skills, entries, scrape_behavior)
    from_label, to_label = parse_duome_header(html)
    meta = {
        "url": url,
        "fromLabel": from_label or from_lang.upper(),
        "toLabel": to_label or to_lang.upper(),
        "scrapeBehavior": scrape_behavior,
    }
    return vocab, meta


def scrape_meta_path_for(course: dict) -> Path:
    return (ROOT / course["inputVocabPath"]).with_name("meta.json")


def cached_scrape_meta(course: dict) -> dict:
    path = scrape_meta_path_for(course)
    if path.exists():
        return read_json(path)
    return {
        "url": f"https://duome.eu/vocabulary/{course['fromLang']}/{course['toLang']}/skills",
        "fromLabel": course["labels"]["from"],
        "toLabel": course["labels"]["to"],
        "scrapeBehavior": course.get("scrapeBehavior", DEFAULT_SCRAPE_BEHAVIOR),
    }


def load_or_fetch_scraped_vocab(course: dict, force: bool) -> tuple[dict, dict, bool]:
    scraped_path = ROOT / course["inputVocabPath"]
    meta_path = scrape_meta_path_for(course)
    scrape_behavior = course.get("scrapeBehavior", DEFAULT_SCRAPE_BEHAVIOR)

    if scraped_path.exists() and not force:
        scrape_meta = cached_scrape_meta(course)
        if scrape_meta.get("scrapeBehavior") in (None, scrape_behavior):
            return read_json(scraped_path), scrape_meta, False

    vocab, scrape_meta = fetch_duome_vocab(course["fromLang"], course["toLang"], scrape_behavior)
    write_json(scraped_path, vocab)
    write_json(meta_path, scrape_meta)
    return vocab, scrape_meta, True


def course_config_detail(course: dict, explicit: bool) -> str:
    if explicit:
        return f"explicit ({Path('courses') / (course['courseId'] + '.json')})"
    return f"synthesized default ({course['fromLang']} -> {course['toLang']})"


def scrape_detail(course: dict, scrape_meta: dict, fetched: bool, forced: bool) -> str:
    vocab_path = Path(course["inputVocabPath"])
    if fetched:
        reason = "forced refresh" if forced else "fresh scrape"
        return f"{reason} -> {vocab_path} from {scrape_meta['url']}"
    return f"reused cache {vocab_path}"


def enrich_detail(course: dict) -> str:
    output_path = Path(course["enrichedVocabPath"])
    enrich_script = course.get("enrichScript")
    if enrich_script:
        return f"generated {output_path} via {enrich_script}"
    return f"passthrough copy -> {output_path}"


def hydrate_course_labels(course: dict, scrape_meta: dict, explicit: bool) -> dict:
    if explicit:
        return course
    from_label = scrape_meta["fromLabel"]
    to_label = scrape_meta["toLabel"]
    return {
        **course,
        "title": f"{to_label} Flash",
        "brandTitle": to_label,
        "brandSubtitle": DEFAULT_BRAND_SUBTITLE,
        "brandIcon": course["toLang"].upper(),
        "labels": {
            "from": from_label,
            "to": to_label,
            "fromShort": course["fromLang"].upper(),
            "toShort": course["toLang"].upper(),
        },
    }


def normalize_aliases(primary: str, aliases) -> list[str]:
    if isinstance(aliases, list):
        values = aliases
    elif aliases not in (None, ""):
        values = [aliases]
    else:
        values = []

    seen: set[str] = set()
    out: list[str] = []
    for raw in [primary, *values]:
        value = str(raw or "").strip()
        if not value:
            continue
        key = value.lower()
        if key in seen:
            continue
        seen.add(key)
        out.append(value)
    return out


def alias_extras(primary: str, aliases: list[str]) -> list[str]:
    primary_key = str(primary or "").strip().lower()
    return [value for value in aliases if value and value.lower() != primary_key]


def normalize_generic_words(vocab: dict) -> list[dict]:
    words: list[dict] = []
    for raw in vocab["words"]:
        from_aliases = normalize_aliases("", raw.get("from", []))
        from_text = from_aliases[0] if from_aliases else ""
        to_text = str(raw.get("to", "") or "")
        to_aliases = normalize_aliases("", raw.get("toAliases", []))
        words.append({
            "skill": str(raw["skill"]),
            "from": {
                "text": from_text,
                "aliases": from_aliases,
            },
            "to": {
                "text": to_text,
                "aliases": to_aliases,
                "reading": str(raw.get("toReading", "") or ""),
                "transliteration": str(raw.get("toTransliteration", "") or ""),
            },
            "audio": str(raw.get("audio", "") or ""),
        })
    return words


def build_generic_columnar(vocab: dict, audio_prefix: str) -> dict:
    words = normalize_generic_words(vocab)
    skill_map = {skill: idx for idx, skill in enumerate(vocab["skills"])}
    columns = {
        "fromText": [],
        "fromAliases": {},
        "toText": [],
        "toReading": [],
        "toTransliteration": [],
        "audio": [],
        "skill": [],
    }
    to_aliases: dict[str, list[str]] = {}

    for idx, word in enumerate(words):
        columns["fromText"].append(word["from"]["text"])
        from_aliases = alias_extras(word["from"]["text"], word["from"]["aliases"])
        if from_aliases:
            columns["fromAliases"][str(idx)] = from_aliases
        columns["toText"].append(word["to"]["text"])
        extra_target_aliases = alias_extras(word["to"]["text"], word["to"]["aliases"])
        if extra_target_aliases:
            to_aliases[str(idx)] = extra_target_aliases
        columns["toReading"].append(word["to"]["reading"])
        columns["toTransliteration"].append(word["to"]["transliteration"])
        audio = word["audio"]
        if audio_prefix and audio.startswith(audio_prefix):
            audio = audio[len(audio_prefix):]
        columns["audio"].append(audio)
        columns["skill"].append(skill_map[word["skill"]])

    if to_aliases:
        columns["toAliases"] = to_aliases

    return {
        "skills": vocab["skills"],
        "audioPrefix": audio_prefix,
        "columns": columns,
    }


def build_legacy_japanese_columnar(vocab: dict, audio_prefix: str) -> dict:
    skill_map = {skill: idx for idx, skill in enumerate(vocab["skills"])}
    columns = {
        "jp": [],
        "kana": [],
        "romaji": [],
        "en": [],
        "audio": [],
        "skill": [],
    }

    for word in vocab["words"]:
        columns["jp"].append(word["jp"])
        columns["kana"].append(word.get("kana", ""))
        columns["romaji"].append(word.get("romaji", ""))
        columns["en"].append(word["en"])
        audio = word.get("audio", "")
        if audio_prefix and audio.startswith(audio_prefix):
            audio = audio[len(audio_prefix):]
        columns["audio"].append(audio)
        columns["skill"].append(skill_map[word["skill"]])

    return {
        "skills": vocab["skills"],
        "audioPrefix": audio_prefix,
        "columns": columns,
    }


def runtime_course(course: dict, *, fetch_path: str | None = None) -> dict:
    return {
        "courseId": course["courseId"],
        "title": course["title"],
        "brandTitle": course["brandTitle"],
        "brandSubtitle": course["brandSubtitle"],
        "brandIcon": course["brandIcon"],
        "fromLang": course["fromLang"],
        "toLang": course["toLang"],
        "targetPack": course["targetPack"],
        "storagePrefix": course["storagePrefix"],
        "fetchPath": fetch_path or course["fetchPath"],
        "wordAudioMode": course.get("wordAudioMode", "remote"),
        "labels": course["labels"],
    }


def pack_vocab(course: dict, vocab: dict) -> dict:
    audio_prefix = course.get("audioPrefix", "")
    if course.get("packFormat") == "legacy-ja":
        return build_legacy_japanese_columnar(vocab, audio_prefix)
    return build_generic_columnar(vocab, audio_prefix)


def build_runtime_vocab(course: dict, raw_vocab: dict) -> dict:
    enrich_script = course.get("enrichScript")
    if not enrich_script:
        write_json(ROOT / course["enrichedVocabPath"], raw_vocab)
        return raw_vocab

    s = step("Enriching vocab")
    result = subprocess.run(
        ["node", enrich_script, course["inputVocabPath"], course["enrichedVocabPath"]],
        capture_output=True,
        text=True,
    )
    if result.returncode != 0:
        fail(result)
    done(s, result.stdout.strip())
    return read_json(ROOT / course["enrichedVocabPath"])


def render_html(
    template: str,
    *,
    course: dict,
    app_js: str,
    course_json: str,
    vocab_json: str,
    cluster_json: str,
    version_tag: str,
    pwa: bool,
    embed_vocab: bool,
) -> str:
    pwa_head = ""
    pwa_bootstrap = ""
    if pwa:
        pwa_head = "\n  ".join([
            '<link rel="manifest" href="manifest.webmanifest">',
            f'<meta name="application-name" content="{course["title"]}">',
            f'<meta name="apple-mobile-web-app-title" content="{course["title"]}">',
        ])
        pwa_bootstrap = """<script>
if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('service-worker.js').catch(err => console.warn('Service worker registration failed', err));
  });
}
</script>"""

    output = template.replace("APP_TITLE_PLACEHOLDER", course["title"])
    output = output.replace("APP_LANG_PLACEHOLDER", course["toLang"])
    output = output.replace("APP_JS_PLACEHOLDER", app_js)
    output = output.replace("COURSE_DATA_PLACEHOLDER", course_json)
    output = output.replace("VOCAB_DATA_PLACEHOLDER", vocab_json if embed_vocab else "null")
    output = output.replace("CLUSTER_DATA_PLACEHOLDER", cluster_json)
    output = output.replace("GIT_VERSION_PLACEHOLDER", version_tag)
    output = output.replace("PWA_HEAD_PLACEHOLDER", pwa_head)
    output = output.replace("PWA_BOOTSTRAP_PLACEHOLDER", pwa_bootstrap)
    return output


def build_manifest(course: dict) -> str:
    manifest = {
        "name": course["title"],
        "short_name": course["title"],
        "lang": course["toLang"],
        "start_url": "./",
        "scope": "./",
        "display": "standalone",
        "background_color": "#131F24",
        "theme_color": "#58CC02",
        "icons": [
            {
                "src": "icon.svg",
                "sizes": "any",
                "type": "image/svg+xml",
                "purpose": "any",
            }
        ],
    }
    return json.dumps(manifest, ensure_ascii=False, indent=2) + "\n"


def build_icon_svg(course: dict) -> str:
    icon_text = course.get("brandIcon") or course["labels"]["toShort"]
    return f"""<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <rect width="512" height="512" rx="96" fill="#58CC02"/>
  <circle cx="256" cy="256" r="168" fill="#ffffff" opacity="0.14"/>
  <text x="256" y="282" text-anchor="middle" font-size="190">{escape(icon_text)}</text>
</svg>
"""


def build_service_worker(course_id: str, cache_tag: str) -> str:
    cache_name = f"flashcards-{course_id}-{cache_tag}"
    app_shell = ["./", "./index.html", "./manifest.webmanifest", "./icon.svg", "./vocab-data.json"]
    return f"""const CACHE_NAME = {cache_name!r};
const APP_SHELL = {json.dumps(app_shell, ensure_ascii=False)};

self.addEventListener('install', event => {{
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
}});

self.addEventListener('activate', event => {{
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(key => key !== CACHE_NAME && key.startsWith('flashcards-')).map(key => caches.delete(key))))
      .then(() => self.clients.claim())
  );
}});

self.addEventListener('fetch', event => {{
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === 'navigate') {{
    event.respondWith((async () => {{
      try {{
        const response = await fetch(request);
        const cache = await caches.open(CACHE_NAME);
        cache.put('./index.html', response.clone());
        return response;
      }} catch (error) {{
        return (await caches.match(request)) || (await caches.match('./index.html'));
      }}
    }})());
    return;
  }}

  event.respondWith((async () => {{
    const cached = await caches.match(request);
    if (cached) return cached;
    try {{
      const response = await fetch(request);
      if (response && response.ok) {{
        const cache = await caches.open(CACHE_NAME);
        cache.put(request, response.clone());
      }}
      return response;
    }} catch (error) {{
      return Response.error();
    }}
  }})());
}});
"""


def build_course_chooser_html(courses: list[dict]) -> str:
    def chooser_icon(course: dict) -> str:
        target_icon = course.get("brandIcon") or language_flag(course["toLang"]) or course["labels"]["toShort"]
        source_icon = language_flag(course["fromLang"])
        badge = f'<div class="course-icon-badge">{escape(source_icon)}</div>' if source_icon else ""
        return f"""<div class="course-icon-wrap">
          <div class="course-icon-main">{escape(target_icon)}</div>
          {badge}
        </div>"""

    cards = "\n".join(
        f"""      <a class="course-card" href="courses/{escape(course['courseId'])}/">
        {chooser_icon(course)}
        <div class="course-title">{escape(course['title'])}</div>
        <div class="course-sub">{escape(course['labels']['from'])} → {escape(course['labels']['to'])}</div>
      </a>"""
        for course in courses
    )
    return f"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Flashcard Courses</title>
  <style>
    *{{box-sizing:border-box;margin:0;padding:0}}
    body{{min-height:100vh;background:#131F24;color:#fff;font-family:"Nunito",-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;padding:2rem}}
    main{{max-width:880px;margin:0 auto}}
    h1{{font-size:2rem;font-weight:800;margin-bottom:.5rem}}
    p{{color:#8BA5B0;margin-bottom:1.5rem}}
    .grid{{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:1rem}}
    .course-card{{display:block;background:#1B2B32;border:1px solid #2B4A56;border-radius:16px;padding:1.25rem;text-decoration:none;color:inherit;box-shadow:0 4px 0 rgba(0,0,0,.2)}}
    .course-card:hover{{transform:translateY(-1px)}}
    .course-icon-wrap{{position:relative;width:3rem;height:3rem;margin-bottom:.75rem}}
    .course-icon-main{{font-size:2.2rem;line-height:1}}
    .course-icon-badge{{position:absolute;top:-.15rem;right:-.2rem;font-size:.95rem;line-height:1;background:#131F24;border:1px solid #2B4A56;border-radius:999px;padding:.08rem .16rem;box-shadow:0 2px 0 rgba(0,0,0,.2)}}
    .course-title{{font-size:1.05rem;font-weight:800;margin-bottom:.25rem}}
    .course-sub{{color:#8BA5B0;font-size:.92rem}}
  </style>
</head>
<body>
  <main>
    <h1>Flashcard Courses</h1>
    <p>Select a course. Each course page can be installed and used offline after the first online load.</p>
    <div class="grid">
{cards}
    </div>
  </main>
</body>
</html>
"""


def update_site_chooser(site_root: Path) -> None:
    course_json_paths = sorted((site_root / "courses").glob("*/course.json"))
    courses = [read_json(path) for path in course_json_paths]
    if not courses:
        return
    write_text(site_root / "index.html", build_course_chooser_html(courses))


def main() -> None:
    os.chdir(ROOT)
    args = parse_args()
    course, explicit_course = resolve_course(args)
    course_id = course["courseId"]
    t0 = time.time()

    raw_vocab, scrape_meta, fetched = load_or_fetch_scraped_vocab(course, args.force)
    course = hydrate_course_labels(course, scrape_meta, explicit_course)
    print(f"Course config: {course_config_detail(course, explicit_course)}")
    print(f"Scraped vocab: {scrape_detail(course, scrape_meta, fetched, args.force)}")
    print(f"Source stats: {len(raw_vocab['words'])} words, {len(raw_vocab['skills'])} skills")

    vocab = build_runtime_vocab(course, raw_vocab)
    print(f"Enriched vocab: {enrich_detail(course)}")

    s = step("Type checking")
    result = subprocess.run(["npx", "tsc", "--noEmit"], capture_output=True, text=True)
    if result.returncode != 0:
        fail(result)
    done(s)

    s = step("Bundling JS")
    result = subprocess.run(
        [
            "npx",
            "esbuild",
            "src/app.ts",
            "--bundle",
            "--minify",
            "--format=iife",
            "--target=es2020",
        ],
        capture_output=True,
        text=True,
    )
    if result.returncode != 0:
        fail(result)
    app_js = result.stdout
    app_kb = len(app_js.encode("utf-8")) / 1024
    done(s, f"{app_kb:.1f} KB")

    packed_vocab = pack_vocab(course, vocab)
    vocab_json = json.dumps(packed_vocab, ensure_ascii=False, separators=(",", ":"))

    with (ROOT / "src" / "template.html").open("r", encoding="utf-8") as f:
        template = f.read()

    cluster_path = ROOT / course.get("clusterPath", "")
    if course.get("clusterPath") and cluster_path.exists():
        cluster_json = json.dumps(read_json(cluster_path), ensure_ascii=False, separators=(",", ":"))
    else:
        cluster_json = "{}"

    version_course_json = json.dumps(
        runtime_course(course, fetch_path="<runtime>"),
        ensure_ascii=False,
        separators=(",", ":"),
    )
    app_version = fingerprint(course_id, app_js, vocab_json, cluster_json, version_course_json, length=7)

    built_paths: list[Path] = []

    if args.target in ("standalone", "all"):
        standalone_course_json = json.dumps(runtime_course(course), ensure_ascii=False, separators=(",", ":"))
        standalone_html = render_html(
            template,
            course=course,
            app_js=app_js,
            course_json=standalone_course_json,
            vocab_json=vocab_json,
            cluster_json=cluster_json,
            version_tag=app_version,
            pwa=False,
            embed_vocab=True,
        )

        standalone_path = write_text(ROOT / "dist" / course_id / "standalone.html", standalone_html)
        built_paths.append(standalone_path)

        if args.output:
            extra_output = write_text((ROOT / args.output).resolve(), standalone_html)
            built_paths.append(extra_output)

    if args.target in ("site", "all"):
        site_root = ROOT / "dist" / "site"
        course_dir = site_root / "courses" / course_id
        site_course = runtime_course(course, fetch_path="./vocab-data.json")
        site_course_json = json.dumps(site_course, ensure_ascii=False, separators=(",", ":"))
        manifest_text = build_manifest(course)
        icon_svg = build_icon_svg(course)
        site_html = render_html(
            template,
            course=course,
            app_js=app_js,
            course_json=site_course_json,
            vocab_json=vocab_json,
            cluster_json=cluster_json,
            version_tag=app_version,
            pwa=True,
            embed_vocab=False,
        )
        site_cache_tag = fingerprint(course_id, site_html, vocab_json, site_course_json, manifest_text, icon_svg)

        built_paths.append(write_text(course_dir / "index.html", site_html))
        built_paths.append(write_text(course_dir / "vocab-data.json", json.dumps(packed_vocab, ensure_ascii=False, separators=(",", ":"))))
        built_paths.append(write_json(course_dir / "course.json", site_course))
        built_paths.append(write_text(course_dir / "manifest.webmanifest", manifest_text))
        built_paths.append(write_text(course_dir / "icon.svg", icon_svg))
        built_paths.append(write_text(course_dir / "service-worker.js", build_service_worker(course_id, site_cache_tag)))

        update_site_chooser(site_root)
        chooser_path = site_root / "index.html"
        if chooser_path.exists():
            built_paths.append(chooser_path)

    size_kb = len(vocab_json.encode("utf-8")) / 1024
    total = time.time() - t0
    rel_paths = ", ".join(str(path.relative_to(ROOT)) for path in built_paths)
    print(f"\nBuilt {rel_paths}")
    print(f"Version: {app_version}")
    print(f"JS: {app_kb:.1f} KB, packed vocab: {size_kb:.0f} KB, target: {args.target}")
    print(f"Words: {len(vocab['words'])}, Skills: {len(vocab['skills'])}, Course: {course_id}")
    print(f"Total: {total:.2f}s")


if __name__ == "__main__":
    main()
