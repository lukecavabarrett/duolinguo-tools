#!/usr/bin/env python3
"""Build the flashcard app for a configured course."""

from __future__ import annotations

import argparse
import json
import os
from pathlib import Path
import subprocess
import sys
import time


ROOT = Path(__file__).resolve().parent
DEFAULT_COURSE_ID = "en-ja"


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
    parser.add_argument("--force", action="store_true", help="Reserved for future scrape refresh support")
    parser.add_argument("--output", help="Optional extra output path for the generated HTML")
    return parser.parse_args()


def load_course_config(course_id: str) -> dict:
    path = ROOT / "courses" / f"{course_id}.json"
    if not path.exists():
        print(f"Course config not found: {path}")
        sys.exit(1)
    with path.open("r", encoding="utf-8") as f:
        return json.load(f)


def resolve_course(args: argparse.Namespace) -> tuple[str, dict]:
    course_id = args.course or f"{args.from_lang}-{args.to_lang}"
    course = load_course_config(course_id)
    return course_id, course


def main() -> None:
    os.chdir(ROOT)
    args = parse_args()
    course_id, course = resolve_course(args)
    t0 = time.time()

    enrich_script = course.get("enrichScript")
    if enrich_script:
        s = step("Enriching vocab")
        result = subprocess.run(
            ["node", enrich_script, course["inputVocabPath"], course["enrichedVocabPath"]],
            capture_output=True,
            text=True,
        )
        if result.returncode != 0:
            fail(result)
        done(s, result.stdout.strip())

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

    with (ROOT / course["enrichedVocabPath"]).open("r", encoding="utf-8") as f:
        vocab = json.load(f)

    audio_prefix = course.get("audioPrefix", "")
    skill_map = {skill: i for i, skill in enumerate(vocab["skills"])}
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

    columnar = {
        "skills": vocab["skills"],
        "audioPrefix": audio_prefix,
        "columns": columns,
    }
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
        with cluster_path.open("r", encoding="utf-8") as f:
            cluster_json = json.dumps(json.load(f), ensure_ascii=False, separators=(",", ":"))
    else:
        cluster_json = "{}"

    output = html.replace("APP_JS_PLACEHOLDER", app_js)
    output = output.replace("VOCAB_DATA_PLACEHOLDER", vocab_json)
    output = output.replace("CLUSTER_DATA_PLACEHOLDER", cluster_json)
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
