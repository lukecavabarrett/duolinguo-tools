// Enrich scraped vocab data with kana readings.
// Called by build.py: reads input vocab JSON → writes enriched vocab JSON
//
// Strategy — best of both worlds, no regressions:
// 1. Words already in kana: use jp directly (preserves katakana)
// 2. Kanji words: run both wanakana (romaji → kana) and kuroshiro (kanji → kana)
//    - If wanakana fails (bad romaji): use kuroshiro
//    - If kuroshiro has issues (ambiguous kanji like 時): use wanakana
//    - Otherwise: prefer kuroshiro for long-vowel accuracy (ō → おう vs おお),
//      but use wanakana when they agree (ignoring long-vowel differences)

import { toHiragana, isKana } from 'wanakana';
import KuroshiroModule from 'kuroshiro';
import KuromojiAnalyzer from 'kuroshiro-analyzer-kuromoji';
const Kuroshiro = KuroshiroModule.default || KuroshiroModule;
import { mkdirSync, readFileSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const inputPath = args[0] ? join(root, args[0]) : join(root, 'data/scraped/vocab_data.json');
const outputPath = args[1] ? join(root, args[1]) : join(root, 'data/enriched/vocab_data.json');
const data = JSON.parse(readFileSync(inputPath, 'utf8'));

function normalizeRomaji(s) {
  let r = s;
  // Expand macron vowels (ō → ou matches Japanese hiragana convention)
  r = r.replace(/ā/g, 'aa').replace(/ī/g, 'ii').replace(/ū/g, 'uu').replace(/ē/g, 'ee').replace(/ō/g, 'ou');
  // mb/mp → nb/np
  r = r.replace(/m([bp])/g, 'n$1');
  // tch → cch
  r = r.replace(/tch/g, 'cch');
  // dz → z
  r = r.replace(/dz/g, 'z');
  return r;
}

function isAllKana(s) {
  return isKana(s.replace(/々/g, ''));
}

// Normalize long vowels for comparison: おう/おお → お, etc.
function normalizeLongVowels(s) {
  return s.replace(/([あかさたなはまやらわがざだばぱ])あ/g, '$1')
          .replace(/([いきしちにひみりぎじぢびぴ])い/g, '$1')
          .replace(/([うくすつぬふむゆるぐずづぶぷ])う/g, '$1')
          .replace(/([えけせてねへめれげぜでべぺ])え/g, '$1')
          .replace(/([おこそとのほもよろごぞどぼぽ])[おう]/g, '$1');
}

const kuroshiro = new Kuroshiro();
await kuroshiro.init(new KuromojiAnalyzer());

// Romaji corrections for wanakana (scraped romaji is ambiguous or wrong for these)
// Key: "jp|skill", value: corrected romaji
const ROMAJI_FIXES = {
  "本や|Bookstore": "hon'ya",  // honya is ambiguous: ほにゃ vs ほんや
};

let fromJp = 0, fromWanakana = 0, fromKuroshiro = 0;
const disagreements = [];
for (const word of data.words) {
  if (isAllKana(word.jp)) {
    word.kana = word.jp;
    fromJp++;
    continue;
  }

  const key = `${word.jp}|${word.skill}`;
  const romaji = ROMAJI_FIXES[key] || word.romaji;
  const wkResult = toHiragana(normalizeRomaji(romaji));
  const wkFailed = /[a-zA-Z]/.test(wkResult);
  const kkResult = await kuroshiro.convert(word.jp, { to: 'hiragana' });
  const kkHasLatin = /[a-zA-Z]/.test(kkResult);

  if (wkFailed) {
    // Wanakana failed — use kuroshiro
    word.kana = kkResult;
    fromKuroshiro++;
  } else if (kkHasLatin) {
    // Kuroshiro failed — use wanakana
    word.kana = wkResult;
    fromWanakana++;
  } else if (normalizeLongVowels(wkResult) === normalizeLongVowels(kkResult)) {
    // They agree (ignoring long vowel spelling) — use kuroshiro for vowel accuracy
    word.kana = kkResult;
    fromKuroshiro++;
  } else {
    // They disagree on the reading itself
    const wkHasSpaces = wkResult.includes(' ');
    const kkHasKatakana = /[\u30A0-\u30FF]/.test(kkResult);

    if (kkHasKatakana && !kkHasLatin) {
      // Kuroshiro left mixed katakana (but no Latin) — wanakana's all-hiragana is better
      word.kana = wkResult;
      fromWanakana++;
    } else if (wkHasSpaces) {
      // Wanakana has spaces (bad romaji from scrape) — trust kuroshiro
      word.kana = kkResult;
      fromKuroshiro++;
    } else {
      // Genuine disagreement, clean romaji — prefer wanakana (respects scraped reading)
      word.kana = wkResult;
      fromWanakana++;
      disagreements.push(`  ${word.jp} [${word.skill}] romaji=${word.romaji} → wk=${wkResult} kk=${kkResult}`);
    }
  }
}

mkdirSync(dirname(outputPath), { recursive: true });
writeFileSync(outputPath, JSON.stringify(data, null, 1), 'utf8');
const parts = [`${data.words.length} words`, `${fromJp} kana-passthrough`, `${fromWanakana} wanakana`, `${fromKuroshiro} kuroshiro`];
if (disagreements.length) parts.push(`${disagreements.length} disagreements`);
console.log(`  Enriched ${parts.join(', ')}.`);
if (disagreements.length) {
  console.error('  Disagreements (kuroshiro preferred, review romaji):');
  for (const d of disagreements) console.error(d);
}
