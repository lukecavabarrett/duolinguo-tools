// Enrich vocab_data.json with kana readings and romaji using kuroshiro
import KuroshiroModule from 'kuroshiro';
import KuromojiAnalyzer from 'kuroshiro-analyzer-kuromoji';
const Kuroshiro = KuroshiroModule.default || KuroshiroModule;
import { readFileSync, writeFileSync } from 'fs';

const data = JSON.parse(readFileSync('vocab_data.json', 'utf8'));

const kuroshiro = new Kuroshiro();
await kuroshiro.init(new KuromojiAnalyzer());

let enriched = 0;
for (const word of data.words) {
  const jp = word.jp;

  // Generate kana reading
  const kana = await kuroshiro.convert(jp, { to: 'hiragana' });
  word.kana = kana;

  // Generate romaji if missing
  if (!word.romaji) {
    const romaji = await kuroshiro.convert(jp, { to: 'romaji' });
    word.romaji = romaji;
    enriched++;
  }
}

writeFileSync('vocab_data.json', JSON.stringify(data, null, 1), 'utf8');
console.log(`Done. Enriched ${enriched} words with romaji. All ${data.words.length} words now have kana.`);

// Print a few samples
for (const w of data.words.slice(0, 5)) {
  console.log(`  ${w.jp} → kana: ${w.kana}, romaji: ${w.romaji}, en: ${w.en[0]}`);
}
