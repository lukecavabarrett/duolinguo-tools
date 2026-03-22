import type { Settings, Word } from '../types';
import { defaultTargetPack, type TargetPack } from './base';

const esc = (s: unknown): string => String(s || '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;');

function hasKanji(s: string): boolean {
  return /[\u4e00-\u9fff]/.test(s);
}

function rubyWord(text: string, reading: string): string {
  if (!hasKanji(text) || !reading || reading === text) return esc(text);

  const segments = text.match(/[\u4e00-\u9fff\u3005]+|[^\u4e00-\u9fff\u3005]+/g);
  if (!segments || segments.length === 1) {
    return `<ruby>${esc(text)}<rp>(</rp><rt>${esc(reading)}</rt><rp>)</rp></ruby>`;
  }

  let remaining = reading;
  let html = '';
  for (const seg of segments) {
    if (!hasKanji(seg)) {
      const idx = remaining.indexOf(seg);
      if (idx === -1) {
        return `<ruby>${esc(text)}<rp>(</rp><rt>${esc(reading)}</rt><rp>)</rp></ruby>`;
      }
      if (idx > 0) {
        html += `<rt>${esc(remaining.slice(0, idx))}</rt><rp>)</rp></ruby>`;
      }
      html += esc(seg);
      remaining = remaining.slice(idx + seg.length);
    } else {
      html += `<ruby>${esc(seg)}<rp>(</rp>`;
    }
  }
  if (hasKanji(segments[segments.length - 1])) {
    html += `<rt>${esc(remaining)}</rt><rp>)</rp></ruby>`;
  }
  return html;
}

function fuzzyNorm(s: string, settings: Settings): string {
  let r = s.trim().toLowerCase().replace(/['']/g, "'").replace(/[.!?,;:]+$/, '');
  if (settings.ignoreHyphens) r = r.replace(/[-\s]+/g, '');
  if (settings.macronVowels) r = r.replace(/ā/g, 'a').replace(/ī/g, 'i').replace(/ū/g, 'u').replace(/ē/g, 'e').replace(/ō/g, 'o');
  if (settings.romajiVariants) {
    r = r.replace(/sya/g, 'sha').replace(/syu/g, 'shu').replace(/syo/g, 'sho');
    r = r.replace(/tya/g, 'cha').replace(/tyu/g, 'chu').replace(/tyo/g, 'cho');
    r = r.replace(/zya/g, 'ja').replace(/zyu/g, 'ju').replace(/zyo/g, 'jo');
    r = r.replace(/\bsi\b|si(?=[aeiou])/g, 'shi').replace(/\bti\b|ti(?=[aeiou])/g, 'chi');
    r = r.replace(/\btu\b|tu(?=[aeiou])/g, 'tsu').replace(/\bhu\b|hu(?=[aeiou])/g, 'fu');
    r = r.replace(/\bzi\b|zi(?=[aeiou])/g, 'ji');
    r = r.replace(/oo/g, 'ou');
  }
  return r;
}

export const japaneseTargetPack: TargetPack = {
  ...defaultTargetPack,
  id: 'ja',
  showTransliterationLabel: 'Show romaji by default',
  transliterationRevealHint: 'tap word for romaji',
  getLeniencyToggles() {
    return [
      {
        key: 'macronVowels',
        label: 'Macron vowels',
        description: 'ō → ou, ā → aa, ī → ii, ū → uu, ē → ee',
      },
      {
        key: 'romajiVariants',
        label: 'Romanization variants',
        description: 'shi ↔ si, chi ↔ ti, tsu ↔ tu, fu ↔ hu, oo ↔ ou',
      },
    ];
  },
  getReverseTypePlaceholder(): string {
    return 'Type the Japanese (romaji or kana)...';
  },
  renderTarget(word: Word): string {
    return rubyWord(word.to.text, word.to.reading || '');
  },
  getTargetAnswerSet(word: Word, settings: Settings): Set<string> {
    const accepted = new Set<string>();
    if (word.to.transliteration) accepted.add(fuzzyNorm(word.to.transliteration, settings));
    if (word.to.text) accepted.add(word.to.text.trim().toLowerCase());
    if (word.to.reading) accepted.add(word.to.reading.trim().toLowerCase());
    for (const alias of word.to.aliases || []) accepted.add(fuzzyNorm(alias, settings));
    return accepted;
  },
  normalizeTargetInput(input: string, settings: Settings): string {
    return fuzzyNorm(input, settings);
  },
  formatTargetAnswer(word: Word): string {
    return word.to.transliteration
      ? `${word.to.text} (${word.to.transliteration})`
      : word.to.text;
  },
  getTtsText(word: Word): string {
    return word.to.text;
  },
  getTtsLang(): string | null {
    return 'ja-JP';
  },
};
