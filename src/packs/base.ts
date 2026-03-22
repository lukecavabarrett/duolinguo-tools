import type { Settings, Word } from '../types';

const esc = (s: unknown): string => String(s || '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;');

function normalizeBasic(input: string): string {
  return input.trim().toLowerCase();
}

export interface TargetPack {
  id: string;
  showTransliterationLabel: string;
  transliterationRevealHint: string;
  renderTarget(word: Word): string;
  renderTargetProgress(word: Word): string;
  getTargetAnswerSet(word: Word, settings: Settings): Set<string>;
  normalizeTargetInput(input: string, settings: Settings): string;
  formatTargetAnswer(word: Word): string;
  getTtsText(word: Word): string;
  getTtsLang(): string | null;
}

export const defaultTargetPack: TargetPack = {
  id: 'default',
  showTransliterationLabel: 'Show transliteration by default',
  transliterationRevealHint: 'tap word for transliteration',
  renderTarget(word: Word): string {
    return esc(word.to.text);
  },
  renderTargetProgress(word: Word): string {
    const reading = word.to.reading && word.to.reading !== word.to.text
      ? ` <span class="skill-word-kana">(${esc(word.to.reading)})</span>`
      : '';
    return `<span class="skill-word-jp">${esc(word.to.text)}${reading}</span>`;
  },
  getTargetAnswerSet(word: Word): Set<string> {
    const accepted = [word.to.text, ...(word.to.aliases || [])];
    return new Set(accepted.map(value => normalizeBasic(value)));
  },
  normalizeTargetInput(input: string): string {
    return normalizeBasic(input);
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
    return null;
  },
};
