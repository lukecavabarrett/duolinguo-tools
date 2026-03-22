#!/usr/bin/env python3
"""Build the flashcard app for a configured or synthesized course."""

from __future__ import annotations

import argparse
from html import unescape
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
DEFAULT_COURSE_ID = "en-ja"
DEFAULT_BRAND_SUBTITLE = "Duolingo Flashcards"
DEFAULT_AUDIO_PREFIX = "https://d1vq87e9lcf771.cloudfront.net/"
DEFAULT_SCRAPE_BEHAVIOR = "default"
JAPANESE_SCRAPE_BEHAVIOR = "ja"


def step(name: str) -> float:
    print(f"{name}...", end=" ", flush=True)
    return time.time()


def done(start: float, detail: str = "") -> None:
    elapsed = time.time() - start
    print(f"done ({elapsed:.2f}s){' — ' + detail if detail else ''}")


def fail(result: subprocess.CompletedProcess[str]) -> None:
    print("FAILED")
    output = (result.stdout or "") + (result.stderr or "")
    if output.strip():
        print(output)
    sys.exit(1)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--from", dest="from_lang", default="en", help="Source language code")
    parser.add_argument("--to", dest="to_lang", default="ja", help="Target language code")
    parser.add_argument("--course", help="Override course id, e.g. en-ja")
    parser.add_argument("--force", action="store_true", help="Re-scrape vocab even if cached data exists")
    parser.add_argument("--output", help="Optional extra output path for the generated HTML")
    return parser.parse_args()


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


def make_default_course_config(course_id: str, from_lang: str, to_lang: str) -> dict:
    data_root = Path("data") / "courses" / course_id
    build_root = Path("build") / "courses" / course_id
    return {
        "courseId": course_id,
        "title": f"{to_lang.upper()} Flash",
        "brandTitle": to_lang.upper(),
        "brandSubtitle": DEFAULT_BRAND_SUBTITLE,
        "brandIcon": to_lang.upper(),
        "fromLang": from_lang,
        "toLang": to_lang,
        "targetPack": "ja" if to_lang == "ja" else "default",
        "storagePrefix": f"flashcards:{course_id}",
        "fetchPath": str(build_root / "enriched" / "vocab_data.json"),
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


def runtime_course(course: dict) -> dict:
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
        "fetchPath": course["fetchPath"],
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


def main() -> None:
    os.chdir(ROOT)
    args = parse_args()
    course, explicit_course = resolve_course(args)
    course_id = course["courseId"]
    t0 = time.time()

    raw_vocab, scrape_meta, fetched = load_or_fetch_scraped_vocab(course, args.force)
    course = hydrate_course_labels(course, scrape_meta, explicit_course)
    if fetched:
        print(
            f"Loaded vocab cache... done ({time.time() - t0:.2f}s) — "
            f"{len(raw_vocab['words'])} words, {len(raw_vocab['skills'])} skills from {scrape_meta['url']}"
        )

    vocab = build_runtime_vocab(course, raw_vocab)

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

    columnar = pack_vocab(course, vocab)
    vocab_json = json.dumps(columnar, ensure_ascii=False, separators=(",", ":"))

    with (ROOT / "src" / "template.html").open("r", encoding="utf-8") as f:
        html = f.read()

    git_hash = subprocess.run(
        ["git", "rev-parse", "--short", "HEAD"],
        capture_output=True,
        text=True,
    ).stdout.strip() or "dev"

    cluster_path = ROOT / course.get("clusterPath", "")
    if course.get("clusterPath") and cluster_path.exists():
        cluster_json = json.dumps(read_json(cluster_path), ensure_ascii=False, separators=(",", ":"))
    else:
        cluster_json = "{}"

    course_json = json.dumps(runtime_course(course), ensure_ascii=False, separators=(",", ":"))

    output = html.replace("APP_JS_PLACEHOLDER", app_js)
    output = output.replace("VOCAB_DATA_PLACEHOLDER", vocab_json)
    output = output.replace("CLUSTER_DATA_PLACEHOLDER", cluster_json)
    output = output.replace("COURSE_DATA_PLACEHOLDER", course_json)
    output = output.replace("GIT_VERSION_PLACEHOLDER", git_hash)

    output_path = ROOT / "index.html"
    output_path.write_text(output, encoding="utf-8")
    if args.output:
        extra_output = (ROOT / args.output).resolve()
        extra_output.parent.mkdir(parents=True, exist_ok=True)
        extra_output.write_text(output, encoding="utf-8")

    size_kb = len(output.encode("utf-8")) / 1024
    data_kb = len(vocab_json.encode("utf-8")) / 1024
    total = time.time() - t0
    print(f"\nBuilt {output_path.relative_to(ROOT)} ({size_kb:.0f} KB, JS: {app_kb:.1f} KB, data: {data_kb:.0f} KB)")
    print(f"Words: {len(vocab['words'])}, Skills: {len(vocab['skills'])}, Course: {course_id}")
    print(f"Total: {total:.2f}s")


if __name__ == "__main__":
    main()
