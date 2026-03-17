import type { Word, VocabData, ParsedColumnarData, ExerciseType, HistoryEntry, History, Settings, AppState } from './types';

// ══════════════════════════════════════════════════════
//  DATA LOADING
// ══════════════════════════════════════════════════════
let DATA: VocabData = { skills: [], words: [] };

function expandColumnar(parsed: ParsedColumnarData): VocabData {
  const c = parsed.columns;
  const len = c.jp.length;
  const words = new Array(len);
  for (let i = 0; i < len; i++) {
    words[i] = {
      jp: c.jp[i],
      kana: c.kana[i],
      romaji: c.romaji[i],
      en: c.en[i],
      audio: c.audio[i] ? parsed.audioPrefix + c.audio[i] : '',
      skill: parsed.skills[c.skill[i]]
    };
  }
  return { skills: parsed.skills, words };
}

function parseVocabData(parsed: any): VocabData {
  if (parsed && parsed.columns) return expandColumnar(parsed);
  return parsed;
}

(function loadData() {
  const el = document.getElementById('vocab-data');
  if (el) {
    try {
      const parsed = JSON.parse(el.textContent);
      if (parsed && parsed.skills) { DATA = parseVocabData(parsed); return; }
    } catch(e) {}
  }
  // Fallback: try fetching vocab_data.json (works when served, not file://)
  fetch('vocab_data.json')
    .then(r => r.json())
    .then(d => { DATA = parseVocabData(d); render(); })
    .catch(() => console.warn('No vocab data found'));
})();

const SESSION_SIZE = 15;

// ══════════════════════════════════════════════════════
//  SKILL CLUSTERS (for smarter distractor selection)
// ══════════════════════════════════════════════════════
const SKILL_CLUSTERS: Record<string, string> = {};
function _cluster(tag: string, ...skills: string[]) {
  for (const s of skills) SKILL_CLUSTERS[s] = tag;
}
_cluster('food', 'Cafe', 'Mealtime', 'Restaurant', 'Restaur. 2', 'Restaur.3', 'Restaurant 1', 'Restaurant 2', 'Restaurant 3', 'Pastries', 'Cooking', 'Cooking 1', 'Cooking 2', 'Cooking 3', 'Cooking 4', 'Cooking 5', 'Food', 'Food 2', 'Food 3', 'Seafood', 'Conbini', 'Convenience Store');
_cluster('clothes', 'Clothes', 'Clothes 1', 'Clothes 2', 'Clothes3', 'Clothes 3', 'Clothes 4', 'Shopping 1', 'Shopping 2');
_cluster('travel', 'Travel', 'Travel 2', 'Transport', 'Transportation 1', 'Transportation 2', 'Transportation 4', 'Station', 'Station 2', 'Sights', 'Directions', 'Direction 2', 'Direction 4', 'The Airport', 'The Train', 'Cruise', 'Hotel', 'Hotel 2', 'Hotel 3', 'Ryokan', 'Vacation', 'Past Trip');
_cluster('nature', 'Weather', 'Weather 1', 'Weather 2', 'Weather 3', 'Seasons', 'Four Seasons', 'Nature 1', 'Nature 2', 'Nature 3', 'Nature 4', 'Nature 5', 'Nature 6', 'Nature 7', 'Outdoors', 'Sakura');
_cluster('people', 'People', 'People 2', 'People 3', 'My Family', 'Family 2', 'Family 3', 'Family 4', 'Neighbors', 'New Friend', 'Meet Up', 'Growing Up');
_cluster('school', 'School', 'University', 'Univ.2', 'College', 'College 2', 'Classroom', 'Classroom 2', 'Classroom 3', 'Education', 'Education 2', 'Education 3');
_cluster('work', 'Occupation', 'Office', 'WorkPlace', 'Work 1', 'Work 2', 'Work 3', 'Work 4', 'Work 5');
_cluster('health', 'Sick Day', 'Clinic', 'The Clinic', 'The Clinic 2', 'Doctor', 'The Dentist', 'Health 1', 'Health 2', 'Health 3', 'The Gym', 'Hair Salon');
_cluster('home', 'New Home', 'New Home 2', 'Home 1', 'Home 3', 'Home 4', 'Chores');
_cluster('hobbies', 'Hobbies', 'Hobbies 2', 'Hobby 1', 'Hobby 2', 'Hobby 3', 'Games', 'Events', 'Events 1', 'Concert', 'The Arts 1', 'The Arts 2', 'Bookstore', 'Theme Park', 'Olympic Games');
_cluster('feelings', 'Feelings 1', 'Feelings 2', 'Feelings 3', 'Feelings 4', 'Feelings 5', 'Desires 1', 'Desires 2');
_cluster('money', 'Money 1', 'Money 2', 'Money 3', 'Money 4');
_cluster('time', 'Time', 'Dates', 'Routines', 'Routines 2', 'Weekend', 'Plans 1', 'Plans 2', 'Date Plans');
_cluster('politics', 'Politics 1', 'Politics 2', 'Law 1', 'Law 2', 'Law 3', 'Society', 'Authority');
_cluster('science', 'Computers', 'Tech 1', 'Tech 2', 'Science 1', 'Science 2', 'Science 3', 'Space');
_cluster('places', 'Countries', 'In Town', 'The City', 'Geography 1', 'Geography 2', 'The Farm');
_cluster('social', 'Greetings', 'Welcome', 'Introduction 3', 'Visiting', 'Birthday', 'Birthday 2', 'Wedding', 'Invitation', 'Gifts', 'Favors', 'Honorifics 1', 'Honorifics 3');
_cluster('animals', 'AnimalCafe', 'Zoo', 'Animals');
_cluster('conflict', 'Emergency', 'Emergency 1', 'Emergency 2', 'Conflict 1', 'Conflict 2');

function getCluster(skill: string): string {
  return SKILL_CLUSTERS[skill] || skill;
}

// ══════════════════════════════════════════════════════
//  EXERCISE TYPES
// ══════════════════════════════════════════════════════
const EXERCISE_TYPES: ExerciseType[] = [
  { id: 'jp2en_choice', direction: 'jp2en', mode: 'choice', difficulty: 1,   audioOnly: false, label: 'JP → EN choice' },
  { id: 'audio_choice', direction: 'jp2en', mode: 'choice', difficulty: 1.5, audioOnly: true,  label: 'Listen → EN choice' },
  { id: 'en2jp_choice', direction: 'en2jp', mode: 'choice', difficulty: 2,   audioOnly: false, label: 'EN → JP choice' },
  { id: 'jp2en_type',   direction: 'jp2en', mode: 'type',   difficulty: 3,   audioOnly: false, label: 'JP → EN type' },
  { id: 'en2jp_type',   direction: 'en2jp', mode: 'type',   difficulty: 4,   audioOnly: false, label: 'EN → JP type' },
];

function pickExerciseType(card: Word): ExerciseType {
  // For non-mixed modes, return a fixed exercise type
  if (S.exerciseMode !== 'mixed') {
    const mode = S.exerciseMode; // 'choice' or 'type'
    const dir = S.direction;
    return EXERCISE_TYPES.find(t => t.mode === mode && t.direction === dir && !t.audioOnly) || EXERCISE_TYPES[0];
  }

  // Use wordStrength to determine eligible exercise types
  const str = wordStrength(card);
  let maxDiff;
  if (str === 0) maxDiff = 1.5;       // unseen: JP→EN choice only
  else if (str < 0.3) maxDiff = 2;    // seen: + EN→JP choice
  else if (str < 0.5) maxDiff = 3;    // some practice: + JP→EN type
  else maxDiff = 4;                   // moderate: all types

  let eligible = EXERCISE_TYPES.filter(t => t.difficulty <= maxDiff);
  if (eligible.length === 0) eligible = [EXERCISE_TYPES[0]];

  // Audio-only type requires card.audio; also respect "can't listen now"
  if (!card.audio || S.noAudio) eligible = eligible.filter(t => !t.audioOnly);

  // Avoid repeating same type 3x in a row
  if (S._recentTypes && S._recentTypes.length >= 2) {
    const last2 = S._recentTypes.slice(-2);
    if (last2[0] === last2[1]) {
      const filtered = eligible.filter(t => t.id !== last2[0]);
      if (filtered.length > 0) eligible = filtered;
    }
  }

  // Weighted random: bias toward harder types for variety
  const weights = eligible.map(t => t.difficulty);
  const totalW = weights.reduce((a, b) => a + b, 0);
  let r = Math.random() * totalW;
  let pick = eligible[0];
  for (let i = 0; i < eligible.length; i++) {
    r -= weights[i];
    if (r <= 0) { pick = eligible[i]; break; }
  }

  // Track recent types
  if (!S._recentTypes) S._recentTypes = [];
  S._recentTypes.push(pick.id);
  if (S._recentTypes.length > 3) S._recentTypes.shift();

  return pick;
}

// ══════════════════════════════════════════════════════
//  LOCAL STORAGE
// ══════════════════════════════════════════════════════
const LS = {
  get(k: string): string | null { try { return localStorage.getItem(k) } catch(e) { return null } },
  set(k: string, v: string): void { try { localStorage.setItem(k,v) } catch(e) {} },
};

function loadSaved() {
  S.username = LS.get('jf_username') || '';
  // Backward compat: old 'choice'/'type' values map to exerciseMode
  const savedMode = LS.get('jf_mode') || 'mixed';
  if (savedMode === 'mixed' || savedMode === 'choice' || savedMode === 'type') {
    S.exerciseMode = savedMode;
  } else {
    S.exerciseMode = 'mixed';
  }
  S.direction = LS.get('jf_direction') || 'jp2en';
  S.skillIdx = parseInt(LS.get('jf_skillIdx') || '10', 10);
  try { S.history = JSON.parse(LS.get('jf_history') || '{}'); } catch(e) { S.history = {}; }
  try { Object.assign(S.settings, JSON.parse(LS.get('jf_settings') || '{}')); } catch(e) {}
}

function saveState() {
  LS.set('jf_username', S.username);
  LS.set('jf_mode', S.exerciseMode);
  LS.set('jf_direction', S.direction);
  LS.set('jf_skillIdx', String(S.skillIdx));
  LS.set('jf_history', JSON.stringify(S.history));
  LS.set('jf_settings', JSON.stringify(S.settings));
}

// ══════════════════════════════════════════════════════
//  AUDIO
// ══════════════════════════════════════════════════════
let _audioCtx: AudioContext | null = null;
function getAudioCtx(): AudioContext {
  if (!_audioCtx) _audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
  return _audioCtx;
}

function playAudio(word: Word): void {
  if (word.audio) {
    const a = new Audio(word.audio);
    a.play().catch(() => fallbackTTS(word.jp));
  } else {
    fallbackTTS(word.jp);
  }
}

function fallbackTTS(text: string): void {
  if (!('speechSynthesis' in window)) return;
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = 'ja-JP';
  u.rate = 0.85;
  speechSynthesis.speak(u);
}

// Preload Duolingo correct/wrong sounds
const CORRECT_SOUND_URL = 'https://www.myinstants.com/media/sounds/duolingo-correct.mp3';
const WRONG_SOUND_URL = 'https://www.myinstants.com/media/sounds/duolingo-wrong.mp3';
const LESSON_COMPLETE_URL = 'https://www.myinstants.com/media/sounds/duolingo-complete-lesson-sound-effect.mp3';
const STREAK_SOUND_URL = 'https://www.myinstants.com/media/sounds/duolingo-5-correct-answers.mp3';
const _correctAudio = new Audio(CORRECT_SOUND_URL);
const _wrongAudio = new Audio(WRONG_SOUND_URL);
const _lessonCompleteAudio = new Audio(LESSON_COMPLETE_URL);
const _streakAudio = new Audio(STREAK_SOUND_URL);

function _fallbackCorrectTone() {
  try {
    const ctx = getAudioCtx();
    const t = ctx.currentTime;
    [587.33, 784].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const osc2 = ctx.createOscillator();
      const gain = ctx.createGain();
      const start = t + i * 0.12;
      osc.type = 'sine'; osc.frequency.value = freq;
      osc2.type = 'sine'; osc2.frequency.value = freq * 2;
      const mix = ctx.createGain(); mix.gain.value = 0.15;
      osc2.connect(mix); mix.connect(gain); osc.connect(gain);
      gain.connect(ctx.destination);
      gain.gain.setValueAtTime(0, start);
      gain.gain.linearRampToValueAtTime(0.22, start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, start + 0.3);
      osc.start(start); osc.stop(start + 0.3);
      osc2.start(start); osc2.stop(start + 0.3);
    });
  } catch(e) {}
}

function _fallbackWrongTone() {
  try {
    const ctx = getAudioCtx();
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    const osc2 = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(280, t);
    osc.frequency.exponentialRampToValueAtTime(200, t + 0.15);
    osc2.type = 'sine';
    osc2.frequency.setValueAtTime(276, t);
    osc2.frequency.exponentialRampToValueAtTime(196, t + 0.15);
    osc.connect(gain); osc2.connect(gain);
    gain.connect(ctx.destination);
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(0.18, t + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.2);
    osc.start(t); osc.stop(t + 0.22);
    osc2.start(t); osc2.stop(t + 0.22);
  } catch(e) {}
}

function playCorrectSound() {
  const a = _correctAudio.cloneNode() as HTMLAudioElement;
  a.play().catch(() => _fallbackCorrectTone());
}

function playWrongSound() {
  const a = _wrongAudio.cloneNode() as HTMLAudioElement;
  a.play().catch(() => _fallbackWrongTone());
}

// ══════════════════════════════════════════════════════
//  DECK & CARD SELECTION (SM-2 inspired)
// ══════════════════════════════════════════════════════
// ── Progression Algorithm ──
// Each word has a "strength" score: (correct / seen) * min(seen, 10) / 10
// This ramps from 0 to accuracy over the first 10 exposures, preventing
// a word answered correctly once from being considered "mastered."
// Strength decays when a word is overdue, reaching 0 at 2x its interval
// past the due date — so stale words naturally lose strength over time.
//
// The user's "level" is the highest skill where ALL words have strength >= 0.7.
// Sessions prioritize: (1) weak words (strength < 0.7), (2) due words
// (spaced repetition interval expired), (3) new words from the next skill.
// This naturally paces the user — they only advance when earlier words are solid,
// and returning after time away means review before new material.
function wordStrength(card: Word): number {
  const h = S.history[cardId(card)];
  if (!h || h.seen === 0) return 0;
  const accuracy = (h.correct / h.seen) * Math.min(h.seen, 10) / 10;
  if (h.due && Date.now() > h.due) {
    const overdueDays = (Date.now() - h.due) / 86400000;
    return accuracy * Math.max(0, 1 - overdueDays / (h.interval * 2));
  }
  return accuracy;
}

function getCurrentLevel(): number {
  for (let i = 0; i < DATA.skills.length; i++) {
    const words = DATA.words.filter(w => w.skill === DATA.skills[i]);
    if (!words.length) continue;
    if (words.some(w => wordStrength(w) < 0.7)) return i - 1;
  }
  return DATA.skills.length - 1;
}

function seedProgress(maxSkillIdx: number): void {
  const now = Date.now();
  const skills = DATA.skills.slice(0, maxSkillIdx + 1);
  for (const word of DATA.words) {
    if (!skills.includes(word.skill)) continue;
    const id = cardId(word);
    S.history[id] = { seen: 10, correct: 10, interval: 7, ease: 2.5, due: now + 7 * 86400000 };
  }
  saveState();
}

function buildDeck(maxSkillIdx: number): Word[] {
  const activeSkills = DATA.skills.slice(0, maxSkillIdx + 1);
  return DATA.words.filter(w => activeSkills.includes(w.skill));
}

function buildUnitDeck(skillIdx: number): Word[] {
  const skill = DATA.skills[skillIdx];
  return DATA.words.filter(w => w.skill === skill);
}

function selectCards(deck: Word[]): Word[] {
  if (!deck.length) return [];
  const now = Date.now();
  const level = S.settings.unlockAll ? DATA.skills.length - 1 : getCurrentLevel();
  const nextSkill = DATA.skills[level + 1];

  // 1. Weak words — seen but not strong enough
  const weak = deck.filter(card => {
    const h = S.history[cardId(card)];
    return h && h.seen > 0 && wordStrength(card) < 0.7;
  }).sort((a, b) => wordStrength(a) - wordStrength(b));

  // 2. Due words — strong but interval expired
  const due = deck.filter(card => {
    const h = S.history[cardId(card)];
    return h && h.seen > 0 && wordStrength(card) >= 0.7 && now > h.due;
  }).sort((a, b) => {
    const ha = S.history[cardId(a)], hb = S.history[cardId(b)];
    return (ha.due || 0) - (hb.due || 0); // most overdue first
  });

  // 3. New words — unseen, from the next skill to learn
  const newWords = nextSkill
    ? DATA.words.filter(w => w.skill === nextSkill && !S.history[cardId(w)]?.seen)
    : [];

  const session = [];
  const used = new Set();
  for (const pool of [weak, due, newWords]) {
    for (const card of pool) {
      if (session.length >= SESSION_SIZE) break;
      const id = cardId(card);
      if (!used.has(id)) { session.push(card); used.add(id); }
    }
  }
  return shuffle(session);
}

function cardId(card: Word): string {
  return card.jp + '|' + card.skill;
}

function shuffle<T>(arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function buildChoices(correct: Word, deck: Word[], direction: string): string[] {
  const cid = cardId(correct);
  const getAnswer = direction === 'jp2en' ? (c: Word) => c.en[0] : (c: Word) => c.jp;
  const correctAnswer = getAnswer(correct);

  // Build a set of all meanings that would be "correct" to avoid ambiguous distractors
  let correctSet;
  if (direction === 'jp2en') {
    // All English meanings of the correct word (lowercased for comparison)
    correctSet = new Set(correct.en.map(e => e.toLowerCase()));
  } else {
    correctSet = new Set([correct.jp.toLowerCase()]);
    if (correct.kana) correctSet.add(correct.kana.toLowerCase());
  }

  // Three-tier distractor priority: same skill → same cluster → any
  const others = deck.filter(c => cardId(c) !== cid);
  const correctCluster = getCluster(correct.skill);
  const tier1 = shuffle(others.filter(c => c.skill === correct.skill));
  const tier2 = shuffle(others.filter(c => c.skill !== correct.skill && getCluster(c.skill) === correctCluster));
  const tier3 = shuffle(others.filter(c => getCluster(c.skill) !== correctCluster));

  const distractors: string[] = [];
  const seen = new Set([correctAnswer.toLowerCase()]);
  for (const c of [...tier1, ...tier2, ...tier3]) {
    if (distractors.length >= 3) break;
    const ans = getAnswer(c);
    const ansLower = ans.toLowerCase();
    // Skip if this answer overlaps with any of the correct card's meanings
    if (seen.has(ansLower)) continue;
    if (correctSet.has(ansLower)) continue;
    if (direction === 'jp2en' && c.en.some(e => correctSet.has(e.toLowerCase()))) continue;
    distractors.push(ans);
    seen.add(ansLower);
  }

  return shuffle([correctAnswer, ...distractors]);
}

// ══════════════════════════════════════════════════════
//  STATE
// ══════════════════════════════════════════════════════
const S: AppState = {
  screen: 'profile',
  username: '',
  exerciseMode: 'mixed',
  direction: 'jp2en',
  exerciseType: EXERCISE_TYPES[0],
  skillIdx: 10,
  deck: [],
  cards: [],
  idx: 0,
  showRomaji: false,
  answered: false,
  lastCorrect: null,
  currentAnswer: '',
  correctCount: 0,
  wrongCount: 0,
  history: {},
  choices: [],
  selectedChoice: null,
  _keyHandler: null,
  _recentTypes: [],
  noAudio: false,
  practiceScope: 'all',
  _streak: 0,
  practiceDeck: [],
  settings: { macronVowels: true, ignoreHyphens: true, romajiVariants: false, showRomaji: false, unlockAll: false },
};

// ══════════════════════════════════════════════════════
//  RENDER
// ══════════════════════════════════════════════════════
const esc = (s: any): string => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function render(partial?: string): void {
  const app = document.getElementById('app')!;
  if (partial === 'answer') {
    const el = document.querySelector('.answer-area') || document.querySelector('.choices');
    if (el) el.outerHTML = S.exerciseType.mode === 'choice' ? tplChoices() : tplType();
    const badge = document.querySelector('.score-badge');
    if (badge) badge.innerHTML = `<span class="c">${S.correctCount}</span> / <span class="w">${S.wrongCount}</span>`;
    bind();
    return;
  }
  switch (S.screen) {
    case 'profile':  app.innerHTML = tplProfile(); break;
    case 'study':    app.innerHTML = tplStudy(); break;
    case 'summary':  app.innerHTML = tplSummary(); break;
    case 'progress': app.innerHTML = tplProgress(); break;
    case 'settings': app.innerHTML = tplSettings(); break;
  }
  bind();
}

// ── Profile ──
function tplProfile() {
  const level = getCurrentLevel();
  const nextSkill = DATA.skills[level + 1];
  const deck = S.settings.unlockAll ? buildDeck(S.skillIdx) : buildDeck(level + 1);

  // Dropdown for unlockAll mode
  let skillSelectHtml = '';
  if (S.settings.unlockAll) {
    let opts = '';
    let lastSection = '';
    DATA.skills.forEach((sk, i) => {
      const sec = Math.floor(i / 40) + 1;
      const secLabel = `Section ${sec}`;
      if (secLabel !== lastSection) {
        if (lastSection) opts += '</optgroup>';
        opts += `<optgroup label="${secLabel}">`;
        lastSection = secLabel;
      }
      opts += `<option value="${i}"${i === S.skillIdx ? ' selected' : ''}>${i + 1}. ${esc(sk)}</option>`;
    });
    if (lastSection) opts += '</optgroup>';
    skillSelectHtml = `<div class="field">
      <div class="label">Study up to...</div>
      <select id="skill-select">${opts}</select>
    </div>`;
  }

  const levelInfo = S.settings.unlockAll
    ? ''
    : `<div class="field">
        <div class="label">Current level</div>
        <div class="deck-info">${level < 0
          ? 'Starting fresh — let\'s learn <strong>' + esc(DATA.skills[0]) + '</strong>!'
          : 'Mastered through <strong>' + esc(DATA.skills[level]) + '</strong>' +
            (nextSkill ? ' — next up: <strong>' + esc(nextSkill) + '</strong>' : ' — all skills complete!')
        }</div>
      </div>`;

  return `<div class="screen anim">
    <button class="btn-gear" id="btn-settings"><svg viewBox="0 0 24 24" width="22" height="22"><path fill="var(--dim)" d="M19.14 12.94c.04-.31.06-.63.06-.94 0-.31-.02-.63-.06-.94l2.03-1.58a.49.49 0 00.12-.61l-1.92-3.32a.49.49 0 00-.59-.22l-2.39.96a7.04 7.04 0 00-1.62-.94l-.36-2.54a.48.48 0 00-.48-.41h-3.84a.48.48 0 00-.48.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96a.49.49 0 00-.59.22L2.74 8.87a.48.48 0 00.12.61l2.03 1.58c-.04.31-.06.63-.06.94 0 .31.02.63.06.94l-2.03 1.58a.49.49 0 00-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.26.41.48.41h3.84c.24 0 .44-.17.48-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32a.49.49 0 00-.12-.61l-2.03-1.58zM12 15.6A3.6 3.6 0 1112 8.4a3.6 3.6 0 010 7.2z"/></svg></button>
    <div class="logo-wrap">
      <div class="logo-icon">🇯🇵</div>
      <div class="logo-title">日本語</div>
      <div class="logo-sub">Duolingo Flashcards</div>
    </div>

    <div class="field">
      <div class="label">Your name</div>
      <input type="text" id="uname" value="${esc(S.username)}"
        placeholder="e.g. Luca" autocomplete="off" autocorrect="off" autocapitalize="words" spellcheck="false">
    </div>

    ${levelInfo}
    ${skillSelectHtml}

    <div class="field">
      <div class="label">Exercise mode</div>
      <div class="mode-toggle">
        <button class="mode-btn${S.exerciseMode === 'mixed' ? ' active' : ''}" data-mode="mixed">Mixed</button>
        <button class="mode-btn${S.exerciseMode === 'choice' ? ' active' : ''}" data-mode="choice">Choice</button>
        <button class="mode-btn${S.exerciseMode === 'type' ? ' active' : ''}" data-mode="type">Type</button>
      </div>
    </div>

    <div class="field" id="dir-field" style="${S.exerciseMode === 'mixed' ? 'display:none' : ''}">
      <div class="label">Direction</div>
      <div class="dir-toggle">
        <button class="dir-btn${S.direction === 'jp2en' ? ' active' : ''}" data-dir="jp2en">JP → EN</button>
        <button class="dir-btn${S.direction === 'en2jp' ? ' active' : ''}" data-dir="en2jp">EN → JP</button>
      </div>
    </div>

    ${S.settings.unlockAll ? `<div class="field">
      <div class="label">Practice scope</div>
      <div class="mode-toggle">
        <button class="mode-btn${S.practiceScope === 'all' ? ' active' : ''}" data-scope="all">All words</button>
        <button class="mode-btn${S.practiceScope === 'unit' ? ' active' : ''}" data-scope="unit">Unit only</button>
      </div>
      <div class="deck-info" id="scope-info">${S.practiceScope === 'unit'
        ? `<strong>${buildUnitDeck(S.skillIdx).length}</strong> words in <strong>${esc(DATA.skills[S.skillIdx])}</strong>`
        : `<strong>${deck.length}</strong> words through <strong>${esc(DATA.skills[S.skillIdx])}</strong>`
      }</div>
    </div>` : ''}

    <button class="btn btn-green" id="btn-start">START</button>
    <button class="btn btn-outline gap" id="btn-progress">View Progress</button>
    <p class="note">Progress saved locally on this device.</p>
  </div>`;
}

// ── Settings ──
function importSkillOpts(): string {
  let opts = '';
  let lastSection = '';
  DATA.skills.forEach((sk, i) => {
    const sec = Math.floor(i / 40) + 1;
    const secLabel = `Section ${sec}`;
    if (secLabel !== lastSection) {
      if (lastSection) opts += '</optgroup>';
      opts += `<optgroup label="${secLabel}">`;
      lastSection = secLabel;
    }
    opts += `<option value="${i}">${i + 1}. ${esc(sk)}</option>`;
  });
  if (lastSection) opts += '</optgroup>';
  return opts;
}

function tplSettings() {
  const st = S.settings;
  const wordCount = DATA.words ? DATA.words.length : '?';
  const skillCount = DATA.skills ? DATA.skills.length : '?';
  let lsBytes = 0;
  try { for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (k) lsBytes += (k.length + (localStorage.getItem(k) || '').length) * 2; } } catch(e) {}
  const lsKB = (lsBytes / 1024).toFixed(1);
  const appSize = document.documentElement.outerHTML.length;
  const appKB = (appSize / 1024).toFixed(0);
  const tog = (key: string, on: boolean) => `<div class="toggle-switch${on ? ' on' : ''}" data-toggle="${key}"></div>`;
  return `<div class="screen anim">
    <div class="settings-header">
      <button class="settings-back" id="btn-settings-back">←</button>
      <div class="settings-title">Settings</div>
    </div>

    <div class="field">
      <div class="label">Typing leniency</div>
      <div class="toggle-row">
        <div><div class="toggle-label">Macron vowels</div><div class="toggle-sub">ō → ou, ā → aa, ī → ii, ū → uu, ē → ee</div></div>
        ${tog('macronVowels', st.macronVowels)}
      </div>
      <div class="toggle-row">
        <div><div class="toggle-label">Ignore hyphens & spaces</div><div class="toggle-sub">e.g. "ice cream" matches "icecream"</div></div>
        ${tog('ignoreHyphens', st.ignoreHyphens)}
      </div>
      <div class="toggle-row">
        <div><div class="toggle-label">Romanization variants</div><div class="toggle-sub">shi ↔ si, chi ↔ ti, tsu ↔ tu, fu ↔ hu, oo ↔ ou</div></div>
        ${tog('romajiVariants', st.romajiVariants)}
      </div>
    </div>

    <div class="field">
      <div class="label">Display</div>
      <div class="toggle-row">
        <div><div class="toggle-label">Show romaji by default</div><div class="toggle-sub">${st.showRomaji ? 'Visible on every card' : 'Tap the word to reveal'}</div></div>
        ${tog('showRomaji', st.showRomaji)}
      </div>
    </div>

    <div class="field">
      <div class="label">Progression</div>
      <div class="toggle-row">
        <div><div class="toggle-label">Unlock all skills</div><div class="toggle-sub">${st.unlockAll ? 'Manual skill selection enabled' : 'Skills unlock as you learn'}</div></div>
        ${tog('unlockAll', st.unlockAll)}
      </div>
    </div>

    <div class="field">
      <div class="label">Set starting level</div>
      <div class="toggle-sub" style="margin-bottom:.4rem">Coming from Duolingo? Mark earlier words as learned.</div>
      <select id="import-select">${importSkillOpts()}</select>
      <button class="btn btn-outline gap" id="btn-import" style="margin-top:.4rem">Set starting level</button>
    </div>

    <div class="field" style="margin-top:2rem">
      <button class="btn btn-outline" id="btn-reset" style="color:var(--red);border-color:var(--red)">Reset Progress</button>
      <button class="btn btn-outline gap" id="btn-nuke" style="color:var(--red);border-color:var(--red)">Delete All Data</button>
    </div>

    <div class="app-info">
      ${wordCount} words · ${skillCount} skills<br>
      App size: ${appKB} KB · Saved data: ${lsKB} KB<br>
      v1.0
    </div>
  </div>`;
}

// ── Study ──
function hasKanji(s: string): boolean {
  return /[\u4e00-\u9fff]/.test(s);
}

function rubyWord(jp: string, kana: string): string {
  // If word has kanji and kana differs, wrap in ruby annotation
  if (hasKanji(jp) && kana && kana !== jp) {
    return `<ruby>${esc(jp)}<rp>(</rp><rt>${esc(kana)}</rt><rp>)</rp></ruby>`;
  }
  return esc(jp);
}

function cardTop() {
  const card = S.cards[S.idx];
  const et = S.exerciseType;
  const pct = (S.idx / Math.max(S.cards.length, 1)) * 100;
  const cardCls = 'card' + (S.answered ? (S.lastCorrect ? ' correct' : ' wrong') : '');
  const isReverse = et.direction === 'en2jp';
  const isAudio = et.audioOnly;

  const speakerSvg = '<svg viewBox="0 0 24 24"><path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"/></svg>';

  let mainWordHtml;
  if (isAudio) {
    // Audio-only: large speaker, no text
    mainWordHtml = '';
  } else if (isReverse) {
    mainWordHtml = esc(card.en[0].charAt(0).toUpperCase() + card.en[0].slice(1));
  } else {
    mainWordHtml = rubyWord(card.jp, card.kana);
  }

  const romajiVis = S.showRomaji ? 'visible' : 'hidden';
  const hintVis = S.showRomaji ? 'gone' : '';
  const showRomajiArea = !isReverse && !isAudio && card.romaji;

  return `
    <div class="study-header">
      <button class="btn-close" id="btn-quit">✕</button>
      <div class="prog-bar-wrap"><div class="prog-fill" style="width:${pct}%"></div></div>
      <span class="score-badge"><span class="c">${S.correctCount}</span> / <span class="w">${S.wrongCount}</span></span>
    </div>
    <div class="${cardCls}" id="flashcard">
      ${isAudio ? `
        <div style="text-align:center;padding:1rem 0">
          <div class="audio-viz" id="audio-viz">
            <button class="btn-speaker" id="btn-speak" style="width:64px;height:64px">${speakerSvg}</button>
            <div class="audio-bars">
              <span style="height:40%"></span><span style="height:70%"></span><span style="height:55%"></span>
              <span style="height:90%"></span><span style="height:60%"></span><span style="height:80%"></span>
              <span style="height:45%"></span><span style="height:75%"></span><span style="height:50%"></span>
            </div>
          </div>
          <div style="margin-top:.75rem;font-size:.82rem;font-weight:700;color:var(--dim)">What does this mean?</div>
          ${!S.answered ? '<button class="btn-no-audio" id="btn-no-audio">Can\'t listen now</button>' : ''}
        </div>
      ` : `
        <div class="word-row">
          ${isReverse ? '' : `<button class="btn-speaker" id="btn-speak">${speakerSvg}</button>`}
          <div class="word-main${isReverse ? ' word-en' : ''}" id="word-tap">${mainWordHtml}</div>
        </div>
        ${showRomajiArea ? `<div class="romaji-line ${romajiVis}" id="rom">${esc(card.romaji)}</div>
        <div class="romaji-hint ${hintVis}" id="rom-hint">tap word for romaji</div>` : ''}
      `}
    </div>`;
}

function wordInfoBanner(card: Word, exerciseType: ExerciseType): string {
  const speakerSvg = '<svg viewBox="0 0 24 24"><path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02z"/></svg>';
  const jpHtml = hasKanji(card.jp) && card.kana && card.kana !== card.jp
    ? `<ruby>${esc(card.jp)}<rp>(</rp><rt>${esc(card.kana)}</rt><rp>)</rp></ruby>`
    : esc(card.jp);
  const dir = exerciseType ? exerciseType.direction : null;
  const isAudio = exerciseType ? exerciseType.audioOnly : false;
  const showJp = dir !== 'jp2en' || isAudio;
  return `<div class="word-info-banner">
    ${showJp ? `<div class="wib-row">
      <span class="wib-jp">${jpHtml}</span>
      <button class="wib-play" id="btn-wib-play">${speakerSvg}</button>
    </div>` : `<div class="wib-row"><button class="wib-play" id="btn-wib-play">${speakerSvg}</button></div>`}
    ${card.romaji ? `<div class="wib-romaji">${esc(card.romaji)}</div>` : ''}
    <div class="wib-en">${esc(card.en.join(', '))}</div>
  </div>`;
}

function tplStudy() {
  return `<div class="screen anim">${cardTop()}${S.exerciseType.mode === 'choice' ? tplChoices() : tplType()}</div>`;
}

function tplType() {
  const card = S.cards[S.idx];
  const isReverse = S.exerciseType.direction === 'en2jp';
  const placeholder = isReverse ? 'Type the Japanese (romaji or kana)...' : 'Type the English meaning...';
  const inpCls = 'answer-input' + (S.answered ? (S.lastCorrect ? ' correct' : ' wrong') : '');

  let correctDisplay;
  if (isReverse) {
    correctDisplay = `${card.jp} (${card.romaji})`;
  } else {
    correctDisplay = card.en[0];
  }

  const fb = S.answered
    ? (S.lastCorrect
      ? `<div class="feedback c">Correct!</div>`
      : `<div class="feedback w">Incorrect</div>${wordInfoBanner(card, S.exerciseType)}`)
    : '<div class="feedback"></div>';

  const action = S.answered
    ? `<button class="btn-next" id="btn-next">${S.idx + 1 < S.cards.length ? 'CONTINUE' : 'FINISH'}</button>`
    : `<button class="btn-check" id="btn-check"${!S.currentAnswer ? ' disabled' : ''}>CHECK</button>
       <button class="btn-skip" id="btn-skip">SKIP</button>`;

  return `<div class="answer-area">
    <input class="${inpCls}" type="text" id="ans"
      placeholder="${placeholder}" value="${esc(S.currentAnswer)}"
      ${S.answered ? 'disabled' : ''}
      autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false">
    ${fb}${action}
  </div>`;
}

function tplChoices() {
  const card = S.cards[S.idx];
  const isReverse = S.exerciseType.direction === 'en2jp';
  const correctAnswer = isReverse ? card.jp : card.en[0];

  return `<div class="choices">
    ${S.choices.map((opt, i) => {
      let cls = 'choice-btn';
      if (S.answered) {
        if (opt === correctAnswer) cls += S.selectedChoice === i ? ' choice-correct' : ' choice-missed';
        else if (i === S.selectedChoice) cls += ' choice-wrong';
      }
      const display = !isReverse && opt ? opt.charAt(0).toUpperCase() + opt.slice(1) : opt;
      return `<button class="${cls}" data-idx="${i}" ${S.answered ? 'disabled' : ''}>
        ${esc(display)}
      </button>`;
    }).join('')}
    ${S.answered && !S.lastCorrect ? wordInfoBanner(S.cards[S.idx], S.exerciseType) : ''}
    ${S.answered ? `<button class="btn-next" id="btn-next" style="margin-top:.4rem">${S.idx + 1 < S.cards.length ? 'CONTINUE' : 'FINISH'}</button>` : ''}
  </div>`;
}

// ── Summary ──
function tplSummary() {
  const total = S.correctCount + S.wrongCount;
  const pct = total ? Math.round(S.correctCount / total * 100) : 0;
  const iconClass = pct >= 80 ? 'great' : pct >= 55 ? 'good' : 'keep';
  const emoji = pct >= 80 ? '🏆' : pct >= 55 ? '👏' : '💪';
  const title = pct >= 80 ? 'Amazing!' : pct >= 55 ? 'Good work!' : 'Keep practicing!';

  return `<div class="screen anim">
    <div class="sum-icon ${iconClass}">${emoji}</div>
    <div class="sum-title">${title}</div>
    <div class="sum-sub">${esc(S.username || 'Learner')} · ${S.exerciseMode === 'mixed' ? 'Mixed' : (S.direction === 'jp2en' ? 'JP→EN' : 'EN→JP')}</div>
    <div class="sum-pct">${pct}<span>%</span></div>
    <div class="stat-grid">
      <div class="stat-box c"><div class="v">${S.correctCount}</div><div class="l">Correct</div></div>
      <div class="stat-box w"><div class="v">${S.wrongCount}</div><div class="l">Wrong</div></div>
    </div>
    <div class="sum-note">Harder words will appear more often next time.</div>
    <button class="btn btn-green" id="btn-again">NEW SESSION</button>
    ${S.exerciseMode !== 'mixed' ? `<button class="btn btn-outline gap" id="btn-switch">Switch to ${S.exerciseMode === 'choice' ? 'Type answer' : 'Multiple choice'}</button>` : ''}
    <button class="btn btn-outline gap" id="btn-profile">Change settings</button>
  </div>`;
}

// ── Progress ──
function tplProgress() {
  const level = getCurrentLevel();
  const rows = DATA.skills.map((skill, i) => {
    const skillWords = DATA.words.filter(w => w.skill === skill);
    if (!skillWords.length) return '';
    const strengths = skillWords.map(w => wordStrength(w));
    const avg = strengths.reduce((a, b) => a + b, 0) / strengths.length;
    const min = Math.min(...strengths);
    const pct = Math.round((0.7 * avg + 0.3 * min) * 100);
    const mastered = i <= level;
    const isNext = i === level + 1;
    const opacity = mastered || isNext ? '' : 'opacity:.4';
    const label = mastered ? ' ✓' : '';
    return `<div class="skill-row" style="${opacity}">
      <span class="skill-name">${i + 1}. ${esc(skill)}${label}</span>
      <div class="skill-bar-wrap"><div class="skill-bar-fill" style="width:${pct}%"></div></div>
      <span class="skill-pct">${pct}%</span>
    </div>`;
  }).join('');

  return `<div class="screen anim">
    <button class="prog-back" id="btn-prog-back">← Back</button>
    <div class="prog-screen-title">Progress by Skill</div>
    <div class="skill-list">${rows}</div>
  </div>`;
}

// ══════════════════════════════════════════════════════
//  BIND
// ══════════════════════════════════════════════════════
function bind(): void {
  const $ = (id: string) => document.getElementById(id);

  if (S.screen === 'profile') {
    function updateScopeInfo() {
      const si = $('scope-info');
      if (!si) return;
      const sk = DATA.skills[S.skillIdx] || '';
      if (S.practiceScope === 'unit') {
        si.innerHTML = `<strong>${buildUnitDeck(S.skillIdx).length}</strong> words in <strong>${esc(sk)}</strong>`;
      } else {
        si.innerHTML = `<strong>${buildDeck(S.skillIdx).length}</strong> words through <strong>${esc(sk)}</strong>`;
      }
    }

    $('skill-select')?.addEventListener('change', e => {
      S.skillIdx = parseInt((e.target as HTMLSelectElement).value, 10);
      updateScopeInfo();
    });

    document.querySelectorAll<HTMLElement>('[data-scope]').forEach(btn => {
      btn.addEventListener('click', () => {
        S.practiceScope = btn.dataset.scope!;
        document.querySelectorAll<HTMLElement>('[data-scope]').forEach(b => b.classList.toggle('active', b.dataset.scope === S.practiceScope));
        updateScopeInfo();
      });
    });

    document.querySelectorAll<HTMLElement>('.mode-btn:not([data-scope])').forEach(btn => {
      btn.addEventListener('click', () => {
        if (btn.dataset.mode) {
          S.exerciseMode = btn.dataset.mode;
          document.querySelectorAll<HTMLElement>('.mode-btn:not([data-scope])').forEach(b => {
            if (b.dataset.mode) b.classList.toggle('active', b.dataset.mode === S.exerciseMode);
          });
          const dirField = document.getElementById('dir-field');
          if (dirField) dirField.style.display = S.exerciseMode === 'mixed' ? 'none' : '';
        }
      });
    });

    document.querySelectorAll<HTMLElement>('.dir-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        S.direction = btn.dataset.dir!;
        document.querySelectorAll<HTMLElement>('.dir-btn').forEach(b => b.classList.toggle('active', b.dataset.dir === S.direction));
      });
    });

    $('btn-start')?.addEventListener('click', () => {
      const v = (($('uname') as HTMLInputElement)?.value || '').trim();
      if (v) S.username = v;
      if (S.settings.unlockAll) {
        S.skillIdx = parseInt(($('skill-select') as HTMLSelectElement)?.value || '10', 10);
        saveState();
        const fullDeck = buildDeck(S.skillIdx);
        const practiceDeck = S.practiceScope === 'unit' ? buildUnitDeck(S.skillIdx) : fullDeck;
        startSession(practiceDeck, fullDeck);
      } else {
        saveState();
        const level = getCurrentLevel();
        const fullDeck = buildDeck(level + 1);
        startSession(fullDeck, fullDeck);
      }
    });

    $('btn-progress')?.addEventListener('click', () => { S.screen = 'progress'; render(); });
    $('btn-settings')?.addEventListener('click', () => { S.screen = 'settings'; render(); });
  }

  if (S.screen === 'settings') {
    $('btn-settings-back')?.addEventListener('click', () => { S.screen = 'profile'; render(); });

    $('btn-import')?.addEventListener('click', () => {
      const sel = $('import-select') as HTMLSelectElement | null;
      if (!sel) return;
      const idx = parseInt(sel.value, 10);
      const skill = DATA.skills[idx];
      if (!confirm(`Start from "${skill}"? All earlier words will be marked as learned.`)) return;
      seedProgress(idx - 1);
      render();
    });

    document.querySelectorAll<HTMLElement>('[data-toggle]').forEach(el => {
      el.addEventListener('click', () => {
        const key = el.dataset.toggle as keyof Settings;
        (S.settings as any)[key] = !S.settings[key];
        el.classList.toggle('on', S.settings[key] as boolean);
        const sub = el.parentElement?.querySelector('.toggle-sub');
        if (key === 'showRomaji' && sub) sub.textContent = S.settings[key] ? 'Visible on every card' : 'Tap the word to reveal';
        if (key === 'unlockAll' && sub) sub.textContent = S.settings[key] ? 'Manual skill selection enabled' : 'Skills unlock as you learn';
        saveState();
      });
    });

    $('btn-reset')?.addEventListener('click', () => {
      if (!confirm('Reset all learning progress? Your settings and name will be kept.')) return;
      S.history = {};
      S.skillIdx = 10;
      saveState();
      render();
    });

    $('btn-nuke')?.addEventListener('click', () => {
      if (!confirm('Delete ALL data? This removes progress, settings, name — everything. Cannot be undone.')) return;
      try { localStorage.clear(); } catch(e) {}
      try { document.cookie.split(';').forEach(c => { document.cookie = c.trim().split('=')[0] + '=;expires=Thu,01 Jan 1970 00:00:00 GMT;path=/'; }); } catch(e) {}
      location.reload();
    });
  }

  if (S.screen === 'study') {
    const ans = $('ans') as HTMLInputElement | null;
    $('btn-quit')?.addEventListener('click', () => { S.screen = 'profile'; render(); });
    $('btn-speak')?.addEventListener('click', () => playAudio(S.cards[S.idx]));
    $('btn-wib-play')?.addEventListener('click', () => playAudio(S.cards[S.idx]));
    $('word-tap')?.addEventListener('click', () => {
      if (!S.showRomaji) {
        S.showRomaji = true;
        $('rom')?.classList.remove('hidden');
        $('rom')?.classList.add('visible');
        $('rom-hint')?.classList.add('gone');
      }
    });

    // "Can't listen now" — skip audio exercises for rest of session
    $('btn-no-audio')?.addEventListener('click', () => {
      S.noAudio = true;
      S.exerciseType = pickExerciseType(S.cards[S.idx]);
      if (S.exerciseType.mode === 'choice') S.choices = buildChoices(S.cards[S.idx], S.deck, S.exerciseType.direction);
      render();
    });

    // Auto-play audio for audio-only cards
    if (S.exerciseType.audioOnly && !S.answered) {
      setTimeout(() => playAudio(S.cards[S.idx]), 150);
    }

    if (S.exerciseType.mode === 'type') {
      if (!S.answered) {
        $('btn-check')?.addEventListener('click', submitType);
        $('btn-skip')?.addEventListener('click', skipCard);
        ans?.addEventListener('keydown', e => { if (e.key === 'Enter' && ans.value.trim()) { S.currentAnswer = ans.value; submitType(); } });
        ans?.addEventListener('input', e => {
          S.currentAnswer = (e.target as HTMLInputElement).value;
          const btn = $('btn-check') as HTMLButtonElement | null;
          if (btn) btn.disabled = !(e.target as HTMLInputElement).value.trim();
        });
        setTimeout(() => ans?.focus(), 80);
      } else {
        $('btn-next')?.addEventListener('click', next);
        document.addEventListener('keydown', function onE(e) {
          if (e.key === 'Enter') { document.removeEventListener('keydown', onE); next(); }
        });
      }
    }

    if (S.exerciseType.mode === 'choice') {
      if (!S.answered) {
        document.querySelectorAll('.choice-btn').forEach((btn, i) => {
          btn.addEventListener('click', () => submitChoice(i));
        });
        S._keyHandler = e => {
          const map: Record<string, number> = { a: 0, b: 1, c: 2, d: 3, '1': 0, '2': 1, '3': 2, '4': 3 };
          const idx = map[e.key.toLowerCase()];
          if (idx !== undefined && !S.answered) submitChoice(idx);
        };
        document.addEventListener('keydown', S._keyHandler);
      } else {
        if (S._keyHandler) { document.removeEventListener('keydown', S._keyHandler); S._keyHandler = null; }
        $('btn-next')?.addEventListener('click', next);
        document.addEventListener('keydown', function onE(e) {
          if (e.key === 'Enter') { document.removeEventListener('keydown', onE); next(); }
        });
      }
    }
  }

  if (S.screen === 'summary') {
    $('btn-again')?.addEventListener('click', () => startSession(S.practiceDeck, S.deck));
    $('btn-switch')?.addEventListener('click', () => {
      S.exerciseMode = S.exerciseMode === 'choice' ? 'type' : 'choice';
      saveState();
      startSession(S.practiceDeck, S.deck);
    });
    $('btn-profile')?.addEventListener('click', () => { S.screen = 'profile'; render(); });
  }

  if (S.screen === 'progress') {
    $('btn-prog-back')?.addEventListener('click', () => { S.screen = 'profile'; render(); });
  }
}

// ══════════════════════════════════════════════════════
//  ACTIONS
// ══════════════════════════════════════════════════════
function startSession(deck: Word[], distractorPool?: Word[]): void {
  if (S._keyHandler) { document.removeEventListener('keydown', S._keyHandler); S._keyHandler = null; }
  S.practiceDeck = deck;
  S.deck = distractorPool || deck;
  S.cards = selectCards(deck);
  S._recentTypes = [];
  S.noAudio = false;
  S.idx = 0;
  S.answered = false;
  S.lastCorrect = null;
  S.currentAnswer = '';
  S.correctCount = 0;
  S.wrongCount = 0;
  S.showRomaji = S.settings.showRomaji;
  S.selectedChoice = null;
  S.exerciseType = pickExerciseType(S.cards[0]);
  S.choices = S.exerciseType.mode === 'choice' ? buildChoices(S.cards[0], S.deck, S.exerciseType.direction) : [];
  S.screen = 'study';
  render();
}

function recordAnswer(card: Word, ok: boolean): void {
  S.answered = true;
  S.lastCorrect = ok;
  const id = cardId(card);
  if (!S.history[id]) S.history[id] = { seen: 0, correct: 0, interval: 1, ease: 2.5, due: 0 };
  const h = S.history[id];
  h.seen++;

  if (ok) {
    S.correctCount++;
    h.correct++;
    // SM-2 inspired: increase interval
    h.interval = Math.min(h.interval * h.ease, 365);
    h.ease = Math.min(h.ease + 0.1, 3.0);
  } else {
    S.wrongCount++;
    // Reset interval on failure
    h.interval = 1;
    h.ease = Math.max(h.ease - 0.2, 1.3);
  }
  h.due = Date.now() + h.interval * 86400000;
  saveState();

  // Streak tracking
  if (ok) { S._streak++; } else { S._streak = 0; }

  // Sound effect
  if (ok && S._streak > 0 && S._streak % 5 === 0) {
    const a = _streakAudio.cloneNode() as HTMLAudioElement; a.play().catch(() => {});
    showStreakBanner(S._streak);
  } else if (ok) playCorrectSound(); else playWrongSound();
  // Haptic feedback on mobile
  try { navigator.vibrate?.(ok ? 30 : [50, 30, 50]); } catch(e) {}
}

function fuzzyNorm(s: string): string {
  let r = s.trim().toLowerCase().replace(/['']/g, "'").replace(/[.!?,;:]+$/, '');
  const st = S.settings;
  if (st.ignoreHyphens) r = r.replace(/[-\s]+/g, '');
  if (st.macronVowels) r = r.replace(/ā/g,'a').replace(/ī/g,'i').replace(/ū/g,'u').replace(/ē/g,'e').replace(/ō/g,'o');
  if (st.romajiVariants) {
    r = r.replace(/sya/g,'sha').replace(/syu/g,'shu').replace(/syo/g,'sho');
    r = r.replace(/tya/g,'cha').replace(/tyu/g,'chu').replace(/tyo/g,'cho');
    r = r.replace(/zya/g,'ja').replace(/zyu/g,'ju').replace(/zyo/g,'jo');
    r = r.replace(/\bsi\b|si(?=[aeiou])/g,'shi').replace(/\bti\b|ti(?=[aeiou])/g,'chi');
    r = r.replace(/\btu\b|tu(?=[aeiou])/g,'tsu').replace(/\bhu\b|hu(?=[aeiou])/g,'fu');
    r = r.replace(/\bzi\b|zi(?=[aeiou])/g,'ji');
    r = r.replace(/oo/g, 'ou');
  }
  return r;
}

function submitType() {
  const el = document.getElementById('ans') as HTMLInputElement | null;
  if (!el || S.answered) return;
  const card = S.cards[S.idx];
  const basicNorm = (s: string) => s.trim().toLowerCase().replace(/^to /, '').replace(/['']/g, "'");
  const isReverse = S.exerciseType.direction === 'en2jp';

  let ok;
  if (isReverse) {
    // Accept romaji or kana (fuzzy romaji matching)
    const input = fuzzyNorm(el.value);
    ok = input === fuzzyNorm(card.romaji || '') || el.value.trim() === card.jp || el.value.trim() === (card.kana || '');
  } else {
    const input = fuzzyNorm(el.value);
    ok = !!el.value.trim() && card.en.some(a => fuzzyNorm(a) === input || basicNorm(a) === basicNorm(el.value));
  }

  S.currentAnswer = el.value;
  recordAnswer(card, ok);
  render('answer');
  animateCard(ok);
}

function submitChoice(i: number): void {
  if (S.answered) return;
  const card = S.cards[S.idx];
  const isReverse = S.exerciseType.direction === 'en2jp';
  const correctAnswer = isReverse ? card.jp : card.en[0];
  S.selectedChoice = i;
  recordAnswer(card, S.choices[i] === correctAnswer);
  render('answer');
  animateCard(S.lastCorrect);
}

function skipCard() {
  const card = S.cards[S.idx];
  S.currentAnswer = '';
  recordAnswer(card, false);
  render('answer');
  animateCard(false);
}

function showStreakBanner(count: number): void {
  const el = document.createElement('div');
  el.className = 'streak-banner';
  el.textContent = `🔥 ${count} in a row!`;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 1700);
}

function animateCard(ok: boolean | null): void {
  const fc = document.getElementById('flashcard');
  if (!fc) return;
  if (!ok) fc.classList.add('shake');
}

function next() {
  if (S._keyHandler) { document.removeEventListener('keydown', S._keyHandler); S._keyHandler = null; }
  S.idx++;
  S.answered = false;
  S.lastCorrect = null;
  S.currentAnswer = '';
  S.selectedChoice = null;
  S.showRomaji = S.settings.showRomaji;
  if (S.idx >= S.cards.length) {
    S.screen = 'summary';
    const a = _lessonCompleteAudio.cloneNode() as HTMLAudioElement;
    a.play().catch(() => {});
    render();
    return;
  }
  S.exerciseType = pickExerciseType(S.cards[S.idx]);
  if (S.exerciseType.mode === 'choice') S.choices = buildChoices(S.cards[S.idx], S.deck, S.exerciseType.direction);
  render();
}

// ══════════════════════════════════════════════════════
//  INIT
// ══════════════════════════════════════════════════════
loadSaved();
render();
