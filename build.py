#!/usr/bin/env python3
"""Build a self-contained HTML flashcard app by embedding vocab_data.json into index.html."""
import json, os

os.chdir(os.path.dirname(os.path.abspath(__file__)))

with open('vocab_data.json', 'r') as f:
    vocab = json.load(f)

# Compact JSON to reduce file size
vocab_json = json.dumps(vocab, ensure_ascii=False, separators=(',', ':'))

with open('index.html', 'r') as f:
    html = f.read()

# Replace placeholder with actual data
output = html.replace('VOCAB_DATA_PLACEHOLDER', vocab_json)

with open('jp-flashcards.html', 'w') as f:
    f.write(output)

size_kb = len(output.encode('utf-8')) / 1024
print(f"Built jp-flashcards.html ({size_kb:.0f} KB)")
print(f"Words: {len(vocab['words'])}")
print(f"Skills: {len(vocab['skills'])}")
