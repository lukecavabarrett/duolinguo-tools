#!/usr/bin/env python3
"""Scrape Duolingo course structure (sections/units/skills/words) via the API.

Requires a JWT token from your browser cookies (jwt_token on duolingo.com).

Usage:
    python scripts/scrape_course_structure.py <jwt_token> [username]

Output: data/course_structure.json
"""
import json, sys, urllib.request

if len(sys.argv) < 3:
    print("Usage: python scripts/scrape_course_structure.py <jwt_token> <username>")
    sys.exit(1)

jwt = sys.argv[1]
username = sys.argv[2]
headers = {"Authorization": f"Bearer {jwt}"}

def api_get(url):
    req = urllib.request.Request(url, headers=headers)
    with urllib.request.urlopen(req) as resp:
        return json.loads(resp.read())

# Get user ID
print(f"Fetching user info for {username}...")
user_info = api_get(f"https://www.duolingo.com/api/1/users/show?username={username}")
user_id = user_info["id"]

# 1. Old API: skills with word lists
print("Fetching skills (old API)...")
skills_data = user_info["language_data"]
# Use the first language (usually the active one)
lang = list(skills_data.keys())[0]
skills = skills_data[lang]["skills"]
skills_by_id = {s["id"]: s for s in skills}
print(f"  {len(skills)} skills, {sum(len(s.get('words', [])) for s in skills)} total words")

# 2. New API: path with sections/units
print("Fetching course structure (new API)...")
course_data = api_get(f"https://www.duolingo.com/2017-06-30/users/{user_id}?fields=currentCourse")
sections = course_data["currentCourse"]["pathSectioned"]

result = []
for si, sec in enumerate(sections):
    section_units = []
    for unit in sec["units"]:
        skill_name = None
        skill_id = None
        teaching_objective = None
        cefr = None
        for lv in unit["levels"]:
            if lv.get("type") == "skill":
                debug = lv.get("debugName", "")
                if "," in debug:
                    skill_name = debug.split(",")[0].strip()
                cd = lv.get("pathLevelClientData", {})
                meta = lv.get("pathLevelMetadata", {})
                if not skill_id:
                    skill_id = cd.get("skillId") or meta.get("skillId")
                if not teaching_objective and cd.get("teachingObjective"):
                    teaching_objective = cd["teachingObjective"]
                if not cefr and cd.get("cefr"):
                    cefr = cd["cefr"].get("level", "")
        if not skill_name:
            continue

        words = []
        if skill_id and skill_id in skills_by_id:
            words = skills_by_id[skill_id].get("words", [])

        section_units.append({
            "unit": unit["unitIndex"],
            "skill": skill_name,
            "objective": teaching_objective or "",
            "cefr": cefr or "",
            "words": words,
        })
    result.append({"section": si, "units": section_units})

out_path = "data/course_structure.json"
with open(out_path, "w") as f:
    json.dump(result, f, indent=2, ensure_ascii=False)

total_units = sum(len(s["units"]) for s in result)
total_words = sum(len(u["words"]) for s in result for u in s["units"])
print(f"\nSaved {out_path}: {len(result)} sections, {total_units} units, {total_words} words")
