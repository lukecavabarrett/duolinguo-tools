#!/usr/bin/env python3
"""Scrape Duolingo stories for Japanese from duome.eu and save as JSON."""
import json, re, time, urllib.request, html

def fetch(url, retries=3):
    for i in range(retries):
        try:
            req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
            with urllib.request.urlopen(req, timeout=60) as r:
                return r.read().decode('utf-8')
        except Exception as e:
            print(f'  Retry {i+1}/{retries}: {e}')
            time.sleep(3)
    return None

def parse_story(raw_html, meta):
    story = {
        'id': meta['id'],
        'en_title': meta['en_title'],
        'ja_title': meta['ja_title'],
        'level': meta['level'],
        'url': meta['url'],
        'lines': [],
        'challenges': [],
    }

    # Extract title audio
    m = re.search(r'class="story-title".*?data-src="([^"]+)"', raw_html)
    if m:
        story['title_audio'] = m.group(1)

    # Extract character images used in this story
    chars = list(dict.fromkeys(re.findall(r'<img class="character"[^>]*src="([^"]+)"', raw_html)))
    story['characters'] = chars

    # Extract storylines (dialogue + narration)
    for block in re.findall(r'<div class="storyline">(.*?)(?=<div class="storyline">|<div class="story-challenge|<span class="sound")', raw_html, re.DOTALL):
        # Extract character image
        cm = re.search(r'<img class="character"[^>]*src="([^"]+)"', block)
        char_img = cm.group(1) if cm else ''
        # Extract audio
        am = re.search(r'data-src="([^"]+)"', block)
        audio = am.group(1) if am else ''
        # Extract text content
        tm = re.search(r'<div\s+class="(?:phrase|prose)">(.*?)</div>', block, re.DOTALL)
        if not tm:
            continue
        text_html = tm.group(1)

        # Extract hints (words with English translations)
        hints = []
        for h in re.finditer(r'title="([^"]*)"[^>]*>([^<]+)</span>', text_html):
            title = html.unescape(h.group(1))
            word = h.group(2).strip()
            # Parse "english [romaji]" from title
            tm = re.match(r'(.+?)\s*\[(.+?)\]', title)
            if tm:
                hints.append({'ja': word, 'en': tm.group(1).strip(), 'romaji': tm.group(2).strip()})
            else:
                hints.append({'ja': word, 'en': title})

        # Get plain text (strip HTML tags)
        plain = re.sub(r'<[^>]+>', '', text_html).strip()
        # Clean up whitespace around punctuation
        plain = re.sub(r'\s+', ' ', plain).strip()

        line = {'text': plain}
        if audio:
            line['audio'] = audio
        if char_img:
            line['character'] = char_img
        if hints:
            line['hints'] = hints

        story['lines'].append(line)

    # Extract challenges/questions
    for m in re.finditer(
        r'<div class="story-challenge"><small>(.*?)</small></div>',
        raw_html, re.DOTALL
    ):
        challenge_html = m.group(1)
        if not challenge_html.strip():
            continue
        # Get question text
        q_text = re.sub(r'<[^>]+>', '', challenge_html.split('<li>')[0]).strip()
        # Get answer options
        options = re.findall(r'<span class="selectable-word">([^<]+)</span>', challenge_html)
        if q_text or options:
            story['challenges'].append({'question': q_text, 'options': options})

    return story

# Load index
with open('stories_index.json') as f:
    index = json.load(f)

print(f'Scraping {len(index)} stories...')
stories = []
for i, meta in enumerate(index):
    print(f'[{i+1}/{len(index)}] {meta["en_title"]}...')
    raw = fetch(meta['url'])
    if raw:
        story = parse_story(raw, meta)
        stories.append(story)
        print(f'  {len(story["lines"])} lines, {len(story["challenges"])} challenges')
    else:
        print(f'  FAILED')
    time.sleep(1)  # Be polite

with open('stories_data.json', 'w', encoding='utf-8') as f:
    json.dump(stories, f, ensure_ascii=False, indent=2)

print(f'\nDone! Saved {len(stories)} stories to stories_data.json')
total_lines = sum(len(s['lines']) for s in stories)
total_challenges = sum(len(s['challenges']) for s in stories)
print(f'Total: {total_lines} lines, {total_challenges} challenges')
