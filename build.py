#!/usr/bin/env python3
"""Build a self-contained HTML flashcard app by embedding vocab_data.json into index.html."""
import json, os, subprocess, sys

os.chdir(os.path.dirname(os.path.abspath(__file__)))

# 1. Type check
print("Running tsc...")
result = subprocess.run(['npx', 'tsc', '--noEmit'], capture_output=True, text=True)
if result.returncode != 0:
    print("TypeScript errors:")
    print(result.stdout + result.stderr)
    sys.exit(1)
print("  Type check passed.")

# 2. Bundle with esbuild
print("Running esbuild...")
result = subprocess.run([
    'npx', 'esbuild', 'src/app.ts',
    '--bundle', '--minify', '--format=iife',
    '--target=es2020',
], capture_output=True, text=True)
if result.returncode != 0:
    print("esbuild errors:")
    print(result.stderr)
    sys.exit(1)
app_js = result.stdout
app_kb = len(app_js.encode('utf-8')) / 1024
print(f"  Bundled JS: {app_kb:.1f} KB")

# 3. Prepare vocab data (columnar format for smaller JSON)
with open('vocab_data.json', 'r') as f:
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

# 4. Read template, embed JS + vocab
with open('index.html', 'r') as f:
    html = f.read()

output = html.replace('APP_JS_PLACEHOLDER', app_js)
output = output.replace('VOCAB_DATA_PLACEHOLDER', vocab_json)

with open('jp-flashcards.html', 'w') as f:
    f.write(output)

size_kb = len(output.encode('utf-8')) / 1024
data_kb = len(vocab_json.encode('utf-8')) / 1024
print(f"\nBuilt jp-flashcards.html ({size_kb:.0f} KB, JS: {app_kb:.1f} KB, data: {data_kb:.0f} KB)")
print(f"Words: {len(vocab['words'])}")
print(f"Skills: {len(vocab['skills'])}")
