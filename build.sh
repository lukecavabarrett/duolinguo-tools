#!/bin/bash
# Build a self-contained HTML flashcard app by embedding vocab_data.json into index.html
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

VOCAB_JSON=$(cat vocab_data.json)
# Replace placeholder in index.html with actual data
sed "s|VOCAB_DATA_PLACEHOLDER|$(echo "$VOCAB_JSON" | python3 -c "import sys,json; print(json.dumps(sys.stdin.read()))" | sed 's/^"//;s/"$//')|" index.html > jp-flashcards.html

echo "Built jp-flashcards.html ($(wc -c < jp-flashcards.html | tr -d ' ') bytes)"
echo "Words: $(python3 -c "import json; d=json.load(open('vocab_data.json')); print(len(d['words']))")"
echo "Skills: $(python3 -c "import json; d=json.load(open('vocab_data.json')); print(len(d['skills']))")"
