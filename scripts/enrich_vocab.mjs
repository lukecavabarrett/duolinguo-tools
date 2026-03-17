// Enrich scraped vocab data with kana readings via kuroshiro.
// Called by build.py: reads data/scraped/vocab_data.json → writes data/enriched/vocab_data.json
// Manual overrides take precedence over kuroshiro for known-bad readings.

import KuroshiroModule from 'kuroshiro';
import KuromojiAnalyzer from 'kuroshiro-analyzer-kuromoji';
const Kuroshiro = KuroshiroModule.default || KuroshiroModule;
import { readFileSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const data = JSON.parse(readFileSync(join(root, 'data/scraped/vocab_data.json'), 'utf8'));

// Manual overrides for kanji with ambiguous readings.
// Key: "jp|skill", value: { kana, romaji? }
const OVERRIDES = {
  '時|Mealtime': { kana: 'じ', romaji: 'ji' },
};

const kuroshiro = new Kuroshiro();
await kuroshiro.init(new KuromojiAnalyzer());

let overridden = 0;
for (const word of data.words) {
  const key = `${word.jp}|${word.skill}`;
  const override = OVERRIDES[key];

  if (override) {
    word.kana = override.kana;
    if (override.romaji) word.romaji = override.romaji;
    overridden++;
  } else {
    word.kana = await kuroshiro.convert(word.jp, { to: 'hiragana' });
  }
}

writeFileSync(join(root, 'data/enriched/vocab_data.json'), JSON.stringify(data, null, 1), 'utf8');
console.log(`  Enriched ${data.words.length} words (${overridden} overrides).`);
