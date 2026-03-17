// ══════════════════════════════════════════════════════
//  TYPE DEFINITIONS
// ══════════════════════════════════════════════════════

export interface Word {
  jp: string;
  kana: string;
  romaji: string;
  en: string[];
  audio: string;
  skill: string;
}

export interface VocabData {
  skills: string[];
  words: Word[];
}

export interface ParsedColumnarData {
  columns: {
    jp: string[];
    kana: string[];
    romaji: string[];
    en: string[][];
    audio: string[];
    skill: number[];
  };
  skills: string[];
  audioPrefix: string;
}

export interface ExerciseType {
  id: string;
  direction: 'jp2en' | 'en2jp';
  mode: 'choice' | 'type';
  difficulty: number;
  audioOnly: boolean;
  label: string;
}

export interface HistoryEntry {
  seen: number;
  correct: number;
  interval: number;
  ease: number;
  due: number;
}

export type History = Record<string, HistoryEntry>;

export interface Settings {
  macronVowels: boolean;
  ignoreHyphens: boolean;
  romajiVariants: boolean;
  showRomaji: boolean;
  unlockAll: boolean;
}

export interface AppState {
  screen: string;
  username: string;
  exerciseMode: string;
  direction: string;
  exerciseType: ExerciseType;
  skillIdx: number;
  deck: Word[];
  cards: Word[];
  idx: number;
  showRomaji: boolean;
  answered: boolean;
  lastCorrect: boolean | null;
  currentAnswer: string;
  correctCount: number;
  wrongCount: number;
  history: History;
  choices: string[];
  selectedChoice: number | null;
  settings: Settings;
  _recentTypes: string[];
  noAudio: boolean;
  practiceScope: string;
  _streak: number;
  practiceDeck: Word[];
}
