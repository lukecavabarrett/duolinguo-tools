#!/usr/bin/env python3
"""Build a self-contained HTML flashcard app by embedding vocab_data.json into index.html."""
import json, os

os.chdir(os.path.dirname(os.path.abspath(__file__)))

with open('vocab_data.json', 'r') as f:
    vocab = json.load(f)

# Find common audio URL prefix
AUDIO_PREFIX = 'https://d1vq87e9lcf771.cloudfront.net/'

# Build skill index map
skill_map = {s: i for i, s in enumerate(vocab['skills'])}

# Convert to columnar format
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

with open('index.html', 'r') as f:
    html = f.read()

# Replace placeholder with actual data
output = html.replace('VOCAB_DATA_PLACEHOLDER', vocab_json)

with open('jp-flashcards.html', 'w') as f:
    f.write(output)

size_kb = len(output.encode('utf-8')) / 1024
data_kb = len(vocab_json.encode('utf-8')) / 1024
print(f"Built jp-flashcards.html ({size_kb:.0f} KB, data: {data_kb:.0f} KB)")
print(f"Words: {len(vocab['words'])}")
print(f"Skills: {len(vocab['skills'])}")
