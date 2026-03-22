// ══════════════════════════════════════════════════════
//  TYPE DEFINITIONS
// ══════════════════════════════════════════════════════

export type Direction = 'to2from' | 'from2to';

export interface CardSide {
  text: string;
  aliases: string[];
  reading?: string;
  transliteration?: string;
}

export interface Word {
  id: string;
  skill: string;
  from: CardSide;
  to: CardSide;
  audio: string;
}

export interface VocabData {
  skills: string[];
  words: Word[];
}

export type AliasColumn = string[][] | Record<string, string[]>;

export interface ParsedColumnarData {
  columns: {
    id?: string[];
    fromText: string[];
    fromAliases?: AliasColumn;
    toText: string[];
    toAliases?: AliasColumn;
    toReading: string[];
    toTransliteration: string[];
    audio: string[];
    skill: number[];
  };
  skills: string[];
  audioPrefix: string;
}

export interface LegacyParsedColumnarData {
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

export interface CourseLabels {
  from: string;
  to: string;
  fromShort: string;
  toShort: string;
}

export interface CourseConfig {
  courseId: string;
  title: string;
  brandTitle: string;
  brandSubtitle: string;
  brandIcon: string;
  fromLang: string;
  toLang: string;
  targetPack: string;
  storagePrefix: string;
  fetchPath: string;
  wordAudioMode: 'remote' | 'local' | 'embedded';
  labels: CourseLabels;
}

export interface ExerciseType {
  id: string;
  direction: Direction;
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
  alwaysShowInfo: boolean;
}

export interface AppState {
  screen: string;
  username: string;
  exerciseMode: string;
  direction: Direction;
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
