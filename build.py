#!/usr/bin/env python3
"""Build a self-contained HTML flashcard app.

Pipeline: enrich vocab → type-check → bundle JS → embed into template → jp-flashcards.html
"""
import json, os, subprocess, sys, time

os.chdir(os.path.dirname(os.path.abspath(__file__)))
t0 = time.time()

def step(name):
    """Print step name and return a timer to print elapsed time."""
    print(f"{name}...", end=' ', flush=True)
    start = time.time()
    return start

def done(start, detail=''):
    elapsed = time.time() - start
    print(f"done ({elapsed:.2f}s){' — ' + detail if detail else ''}")

# 1. Enrich vocab (scraped → enriched via kuroshiro + overrides)
s = step("Enriching vocab")
result = subprocess.run(['node', 'scripts/enrich_vocab.mjs'], capture_output=True, text=True)
if result.returncode != 0:
    print("FAILED")
    print(result.stdout + result.stderr)
    sys.exit(1)
# Extract detail from enrich output (e.g. "Enriched 2325 words (1 overrides).")
enrich_detail = result.stdout.strip().lstrip()
done(s, enrich_detail)

# 2. Type check
s = step("Type checking")
result = subprocess.run(['npx', 'tsc', '--noEmit'], capture_output=True, text=True)
if result.returncode != 0:
    print("FAILED")
    print(result.stdout + result.stderr)
    sys.exit(1)
done(s)

# 3. Bundle with esbuild
s = step("Bundling JS")
result = subprocess.run([
    'npx', 'esbuild', 'src/app.ts',
    '--bundle', '--minify', '--format=iife',
    '--target=es2020',
], capture_output=True, text=True)
if result.returncode != 0:
    print("FAILED")
    print(result.stderr)
    sys.exit(1)
app_js = result.stdout
app_kb = len(app_js.encode('utf-8')) / 1024
done(s, f"{app_kb:.1f} KB")

# 4. Prepare vocab data (columnar format for smaller JSON)
with open('data/enriched/vocab_data.json', 'r') as f:
    vocab = json.load(f)

AUDIO_PREFIX = 'https://d1vq87e9lcf771.cloudfront.net/'
skill_map = {s: i for i, s in enumerate(vocab['skills'])}

columns = {
    'jp': [],
    'kana': [],
    'romaji': [],
    'en': [],
    'audio': [],
    'skill': [],
}

for w in vocab['words']:
    columns['jp'].append(w['jp'])
    columns['kana'].append(w.get('kana', ''))
    columns['romaji'].append(w.get('romaji', ''))
    columns['en'].append(w['en'])
    audio = w.get('audio', '')
    if audio.startswith(AUDIO_PREFIX):
        audio = audio[len(AUDIO_PREFIX):]
    columns['audio'].append(audio)
    columns['skill'].append(skill_map[w['skill']])

columnar = {
    'skills': vocab['skills'],
    'audioPrefix': AUDIO_PREFIX,
    'columns': columns,
}

vocab_json = json.dumps(columnar, ensure_ascii=False, separators=(',', ':'))

# 5. Read template, embed JS + vocab
with open('src/template.html', 'r') as f:
    html = f.read()

git_hash = subprocess.run(['git', 'rev-parse', '--short', 'HEAD'], capture_output=True, text=True).stdout.strip() or 'dev'

output = html.replace('APP_JS_PLACEHOLDER', app_js)
output = output.replace('VOCAB_DATA_PLACEHOLDER', vocab_json)
output = output.replace('GIT_VERSION_PLACEHOLDER', git_hash)

with open('jp-flashcards.html', 'w') as f:
    f.write(output)

size_kb = len(output.encode('utf-8')) / 1024
data_kb = len(vocab_json.encode('utf-8')) / 1024
total = time.time() - t0
print(f"\nBuilt jp-flashcards.html ({size_kb:.0f} KB, JS: {app_kb:.1f} KB, data: {data_kb:.0f} KB)")
print(f"Words: {len(vocab['words'])}, Skills: {len(vocab['skills'])}")
print(f"Total: {total:.2f}s")
