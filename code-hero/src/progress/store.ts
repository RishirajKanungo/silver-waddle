// Progress, rewards and retention state. Persisted to localStorage, exportable as a code.
//
// Reward design — tuned for retention, not just "more XP":
//  * Spaced reviews pay the most per minute, and on-time reviews pay a bonus.
//  * Predicting BEFORE running pays even when wrong (attempting is what builds memory).
//  * First-try and no-hint bonuses reward real recall over peeking.
//  * Streak multiplier (up to 1.5x) + streak freezes so one missed day doesn't kill motivation.
//  * Daily quests + a variable "mystery chest" make showing up every day feel good.
//  * Boss rounds move you through a FAANG-style interview pipeline toward an "offer".

import { CardState, Rating, newCard, review, retrievability, isDue } from './srs';

export interface Level {
  n: number;
  title: string;
  min: number;
}
export const LEVELS: Level[] = [
  { n: 1, title: 'Curious Coder', min: 0 },
  { n: 2, title: 'Intern', min: 150 },
  { n: 3, title: 'New Grad · L3', min: 400 },
  { n: 4, title: 'SWE II · L4', min: 800 },
  { n: 5, title: 'Senior · L5', min: 1400 },
  { n: 6, title: 'Staff · L6', min: 2200 },
  { n: 7, title: 'Senior Staff · L7', min: 3300 },
  { n: 8, title: 'Principal · L8', min: 4700 },
  { n: 9, title: 'Distinguished · L9', min: 6500 },
  { n: 10, title: 'Fellow · L10', min: 9000 },
];
export function levelOf(xp: number) {
  let cur = LEVELS[0];
  for (const l of LEVELS) if (xp >= l.min) cur = l;
  const next = LEVELS.find((l) => l.min > xp) ?? null;
  return { cur, next, pct: next ? (xp - cur.min) / (next.min - cur.min) : 1 };
}

export const PIPELINE = {
  sql: ['Recruiter screen', 'SQL phone screen', 'Onsite: SQL round 1', 'Onsite: SQL round 2', 'Onsite: analytics case', 'Onsite: advanced SQL', 'Hiring committee', 'Team match', 'Offer 🎉'],
  python: ['Recruiter screen', 'Coding phone screen', 'Onsite: coding 1', 'Onsite: coding 2', 'Onsite: data structures', 'Onsite: algorithms', 'Hiring committee', 'Team match', 'Offer 🎉'],
};

export interface Achievement {
  id: string;
  name: string;
  desc: string;
  icon: string;
}
export const ACHIEVEMENTS: Achievement[] = [
  { id: 'first_run', name: 'Hello, World', desc: 'Run your first piece of code.', icon: '👋' },
  { id: 'first_lesson', name: 'Notebook Opened', desc: 'Finish your first lesson.', icon: '📓' },
  { id: 'lessons_5', name: 'Momentum', desc: 'Finish 5 lessons.', icon: '🚀' },
  { id: 'lessons_15', name: 'Deep Work', desc: 'Finish 15 lessons.', icon: '🧠' },
  { id: 'lessons_all', name: 'Curriculum Complete', desc: 'Finish every lesson.', icon: '🏁' },
  { id: 'oracle', name: 'Oracle', desc: 'Predict 10 outputs correctly on the first try.', icon: '🔮' },
  { id: 'oracle_50', name: 'Seer', desc: 'Predict 50 outputs correctly on the first try.', icon: '🧿' },
  { id: 'no_hints', name: 'Unassisted', desc: 'Pass 10 challenges without hints.', icon: '🦾' },
  { id: 'review_25', name: 'Spaced Out', desc: 'Complete 25 spaced reviews.', icon: '🗓️' },
  { id: 'review_200', name: 'Memory Palace', desc: 'Complete 200 spaced reviews.', icon: '🏛️' },
  { id: 'review_ontime_7', name: 'Right on Time', desc: 'Clear your review queue 7 different days.', icon: '⏰' },
  { id: 'streak_3', name: 'Three-peat', desc: '3-day streak.', icon: '🔥' },
  { id: 'streak_7', name: 'Week Warrior', desc: '7-day streak.', icon: '📆' },
  { id: 'streak_30', name: 'Unstoppable', desc: '30-day streak.', icon: '🌋' },
  { id: 'gym_1', name: 'First Rep', desc: 'Solve an Interview Gym problem.', icon: '🏋️' },
  { id: 'gym_10', name: 'Grinder', desc: 'Solve 10 Interview Gym problems.', icon: '⚙️' },
  { id: 'gym_hard', name: 'Hard Mode', desc: 'Solve a Hard problem.', icon: '💎' },
  { id: 'speedrun', name: 'Under the Clock', desc: 'Solve a gym problem in under half its time budget.', icon: '⏱️' },
  { id: 'boss_1', name: 'Advanced to Onsite', desc: 'Pass your first interview round (boss).', icon: '🎯' },
  { id: 'offer_sql', name: 'SQL Offer', desc: 'Complete the SQL interview pipeline.', icon: '🗄️' },
  { id: 'offer_py', name: 'Python Offer', desc: 'Complete the Python interview pipeline.', icon: '🐍' },
  { id: 'explainer', name: 'Feynman', desc: 'Write 10 explain-it-back notes.', icon: '✍️' },
  { id: 'visual', name: 'Watcher', desc: 'Step through 20 visualizations to the end.', icon: '👀' },
  { id: 'debugger', name: 'Bug Squasher', desc: 'Fix a failing challenge after 3+ attempts.', icon: '🐞' },
  { id: 'quests_10', name: 'Quest Giver', desc: 'Complete 10 daily quests.', icon: '📜' },
  { id: 'level_5', name: 'Senior Status', desc: 'Reach Senior (L5).', icon: '🎖️' },
  { id: 'night', name: 'Night Owl', desc: 'Study after 10 pm.', icon: '🦉' },
  { id: 'morning', name: 'Early Bird', desc: 'Study before 7 am.', icon: '🌅' },
];

export type QuestKind = 'review' | 'lesson' | 'gym' | 'predict' | 'viz' | 'nohint' | 'explain' | 'xp';
export interface Quest {
  kind: QuestKind;
  target: number;
  label: string;
  gems: number;
}
const QUEST_POOL: Quest[] = [
  { kind: 'review', target: 10, label: 'Review 10 flashcards', gems: 15 },
  { kind: 'review', target: 20, label: 'Review 20 flashcards', gems: 25 },
  { kind: 'lesson', target: 1, label: 'Finish a lesson', gems: 20 },
  { kind: 'gym', target: 1, label: 'Solve an Interview Gym problem', gems: 20 },
  { kind: 'predict', target: 5, label: 'Make 5 correct predictions', gems: 15 },
  { kind: 'viz', target: 3, label: 'Step through 3 visualizations to the end', gems: 10 },
  { kind: 'nohint', target: 2, label: 'Pass 2 challenges without hints', gems: 20 },
  { kind: 'explain', target: 1, label: 'Write an explain-it-back note', gems: 10 },
  { kind: 'xp', target: 100, label: 'Earn 100 XP', gems: 15 },
];

export const THEMES = [
  { id: 'default', name: 'Studio', cost: 0 },
  { id: 'midnight', name: 'Midnight', cost: 80 },
  { id: 'sunset', name: 'Sunset', cost: 120 },
  { id: 'matrix', name: 'Terminal', cost: 150 },
  { id: 'paper', name: 'Paper', cost: 100 },
];

export interface DayLog {
  xp: number;
  reviews: number;
  lessons: number;
  gym: number;
  predict: number;
  viz: number;
  nohint: number;
  explain: number;
  questsDone: number[];
  chest?: boolean;
  queueCleared?: boolean;
}

export interface State {
  v: 1;
  name: string;
  xp: number;
  gems: number;
  freezes: number;
  goal: number;
  days: Record<string, DayLog>;
  frozenDays: string[];
  lessons: Record<string, { done: boolean; at: number; stars: number }>;
  cellsDone: Record<string, Record<string, boolean>>; // lessonId -> cellKey -> true
  code: Record<string, string>; // saved editor contents per cell/problem
  notes: Record<string, { text: string; at: number; prompt: string }>;
  cards: Record<string, CardState>;
  gym: Record<string, { solved: boolean; best?: number; attempts: number; at?: number }>;
  boss: Record<string, { passed: boolean; at?: number; best?: number }>;
  achievements: Record<string, number>;
  counters: { predictFirst: number; noHint: number; reviews: number; viz: number; quests: number; runs: number; queueClearDays: number };
  theme: string;
  ownedThemes: string[];
  sound: boolean;
}

export const dayKey = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const KEY = 'codehero.progress.v1';

function fresh(): State {
  return {
    v: 1, name: '', xp: 0, gems: 20, freezes: 1, goal: 80, days: {}, frozenDays: [], lessons: {}, cellsDone: {}, code: {}, notes: {}, cards: {}, gym: {}, boss: {}, achievements: {},
    counters: { predictFirst: 0, noHint: 0, reviews: 0, viz: 0, quests: 0, runs: 0, queueClearDays: 0 },
    theme: 'default', ownedThemes: ['default'], sound: true,
  };
}

export interface Reward {
  xp: number;
  gems: number;
  label: string;
  levelUp?: Level;
  achievements: Achievement[];
  combo?: number;
  chest?: { gems: number; xp: number };
}

function hashStr(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

export class Progress {
  s: State;
  version = 0;
  combo = 0;
  private comboAt = 0;
  /** A combo is consecutive correct answers *in one sitting*: it lapses after 5 quiet minutes. */
  private bumpCombo(correct: boolean) {
    const now = Date.now();
    if (now - this.comboAt > 5 * 60000) this.combo = 0;
    this.comboAt = now;
    this.combo = correct ? this.combo + 1 : 0;
  }
  private subs = new Set<() => void>();
  private rewardSubs = new Set<(r: Reward) => void>();
  catalog: { lessonIds: string[]; sqlBoss: string[]; pyBoss: string[] } = { lessonIds: [], sqlBoss: [], pyBoss: [] };

  constructor() {
    this.s = this.load();
    this.applyStreakFreeze();
  }
  private load(): State {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) return { ...fresh(), ...JSON.parse(raw) };
    } catch {
      /* storage unavailable */
    }
    return fresh();
  }
  save() {
    try {
      localStorage.setItem(KEY, JSON.stringify(this.s));
    } catch {
      /* ignore */
    }
    this.version++;
    this.subs.forEach((f) => f());
  }
  subscribe = (f: () => void) => {
    this.subs.add(f);
    return () => {
      this.subs.delete(f);
    };
  };
  getVersion = () => this.version;
  onReward(f: (r: Reward) => void) {
    this.rewardSubs.add(f);
    return () => {
      this.rewardSubs.delete(f);
    };
  }

  // ---------------- derived ----------------
  today(): DayLog {
    const k = dayKey();
    return (this.s.days[k] ??= { xp: 0, reviews: 0, lessons: 0, gym: 0, predict: 0, viz: 0, nohint: 0, explain: 0, questsDone: [] });
  }
  streak(): number {
    let n = 0;
    const d = new Date();
    const active = (k: string) => (this.s.days[k]?.xp ?? 0) > 0 || this.s.frozenDays.includes(k);
    if (!active(dayKey(d))) d.setDate(d.getDate() - 1);
    while (active(dayKey(d))) {
      n++;
      d.setDate(d.getDate() - 1);
    }
    return n;
  }
  multiplier() {
    return 1 + Math.min(this.streak(), 10) * 0.05;
  }
  get level() {
    return levelOf(this.s.xp);
  }
  /** If yesterday was missed but the day before was active, spend a freeze to keep the streak. */
  private applyStreakFreeze() {
    const y = new Date();
    y.setDate(y.getDate() - 1);
    const yk = dayKey(y);
    const yy = new Date();
    yy.setDate(yy.getDate() - 2);
    const yyk = dayKey(yy);
    const active = (k: string) => (this.s.days[k]?.xp ?? 0) > 0 || this.s.frozenDays.includes(k);
    if (!active(yk) && active(yyk) && this.s.freezes > 0) {
      this.s.freezes--;
      this.s.frozenDays.push(yk);
      this.save();
    }
  }
  quests(): Quest[] {
    const h = hashStr(dayKey());
    const picks: Quest[] = [];
    const pool = [...QUEST_POOL];
    let x = h;
    while (picks.length < 3 && pool.length) {
      const i = x % pool.length;
      const q = pool.splice(i, 1)[0];
      if (!picks.some((p) => p.kind === q.kind)) picks.push(q);
      x = Math.imul(x ^ 0x9e3779b9, 2654435761) >>> 0;
    }
    return picks;
  }
  questProgress(q: Quest): number {
    const t = this.today();
    const v = { review: t.reviews, lesson: t.lessons, gym: t.gym, predict: t.predict, viz: t.viz, nohint: t.nohint, explain: t.explain, xp: t.xp }[q.kind];
    return Math.min(q.target, v);
  }
  dueCards(now = Date.now()) {
    return Object.values(this.s.cards).filter((c) => isDue(c, now));
  }
  lessonMemory(lessonId: string): number | null {
    const cs = Object.values(this.s.cards).filter((c) => c.lessonId === lessonId);
    if (!cs.length) return null;
    return cs.reduce((a, c) => a + retrievability(c), 0) / cs.length;
  }

  // ---------------- awarding ----------------
  private give(xp: number, gems: number, label: string, extra: Achievement[] = []): Reward {
    const before = levelOf(this.s.xp).cur;
    const mult = this.multiplier();
    const gained = Math.round(xp * mult);
    this.s.xp += gained;
    this.s.gems += gems;
    const t = this.today();
    t.xp += gained;
    const after = levelOf(this.s.xp).cur;
    const rw: Reward = { xp: gained, gems, label, achievements: [...extra], combo: this.combo >= 3 ? this.combo : undefined };
    if (after.n > before.n) {
      rw.levelUp = after;
      this.s.gems += 25;
      rw.gems += 25;
    }
    // quests
    for (const [i, q] of this.quests().entries()) {
      if (!t.questsDone.includes(i) && this.questProgress(q) >= q.target) {
        t.questsDone.push(i);
        this.s.gems += q.gems;
        rw.gems += q.gems;
        this.s.counters.quests++;
        rw.label += ` · Quest done: ${q.label} (+${q.gems}💎)`;
      }
    }
    if (t.questsDone.length >= 3 && !t.chest) {
      t.chest = true;
      // variable reward: the mystery chest
      const roll = Math.random();
      const chest = roll < 0.6 ? { gems: 15, xp: 20 } : roll < 0.9 ? { gems: 30, xp: 40 } : { gems: 75, xp: 100 };
      this.s.gems += chest.gems;
      this.s.xp += chest.xp;
      t.xp += chest.xp;
      rw.chest = chest;
    }
    rw.achievements.push(...this.checkAchievements());
    this.save();
    if (gained > 0 || rw.gems > 0 || rw.achievements.length) this.rewardSubs.forEach((f) => f(rw));
    return rw;
  }

  markCell(lessonId: string, cellKey: string) {
    const m = (this.s.cellsDone[lessonId] ??= {});
    const first = !m[cellKey];
    m[cellKey] = true;
    return first;
  }
  cellDone(lessonId: string, cellKey: string) {
    return !!this.s.cellsDone[lessonId]?.[cellKey];
  }

  predicted(lessonId: string, cellKey: string, correct: boolean) {
    if (!this.markCell(lessonId, cellKey)) return null;
    this.bumpCombo(correct);
    if (correct) {
      this.s.counters.predictFirst++;
      this.today().predict++;
    }
    return this.give(correct ? 10 + (this.combo >= 5 ? 5 : 0) : 3, 0, correct ? 'Correct prediction' : 'Prediction attempted — now you know!');
  }
  challengePassed(lessonId: string, cellKey: string, opts: { hints: number; attempts: number; xp?: number }) {
    if (!this.markCell(lessonId, cellKey)) return null;
    const base = opts.xp ?? 25;
    const firstTry = opts.attempts <= 1 ? 10 : 0;
    const noHint = opts.hints === 0 ? 5 : 0;
    const extra: Achievement[] = [];
    if (opts.hints === 0) {
      this.s.counters.noHint++;
      this.today().nohint++;
    }
    if (opts.attempts >= 3) extra.push(...this.grant('debugger'));
    this.bumpCombo(true);
    return this.give(base + firstTry + noHint, 0, `Challenge passed${firstTry ? ' first try!' : ''}`, extra);
  }
  quizAnswered(lessonId: string, cellKey: string, correct: boolean) {
    if (!this.markCell(lessonId, cellKey)) return null;
    this.bumpCombo(correct);
    return this.give(correct ? 8 : 2, 0, correct ? 'Quiz correct' : 'Quiz attempted');
  }
  simpleCell(lessonId: string, cellKey: string, xp: number, label: string) {
    if (!this.markCell(lessonId, cellKey)) return null;
    return this.give(xp, 0, label);
  }
  vizWatched(lessonId: string, cellKey: string) {
    if (!this.markCell(lessonId, cellKey)) return null;
    this.s.counters.viz++;
    this.today().viz++;
    return this.give(4, 0, 'Visualization watched');
  }
  ran() {
    this.s.counters.runs++;
    if (this.s.counters.runs === 1) {
      const a = this.grant('first_run');
      this.save();
      if (a.length) this.rewardSubs.forEach((f) => f({ xp: 0, gems: 0, label: '', achievements: a }));
    }
  }
  saveNote(id: string, prompt: string, text: string) {
    const first = !this.s.notes[id];
    this.s.notes[id] = { text, prompt, at: Date.now() };
    if (first && text.trim().length >= 20) {
      this.today().explain++;
      return this.give(6, 0, 'Explained in your own words');
    }
    this.save();
    return null;
  }
  lessonCompleted(lessonId: string, cardIds: string[], stars: number, bonus: number) {
    const prev = this.s.lessons[lessonId];
    this.s.lessons[lessonId] = { done: true, at: Date.now(), stars: Math.max(stars, prev?.stars ?? 0) };
    for (const id of cardIds) if (!this.s.cards[id]) this.s.cards[id] = newCard(id, lessonId);
    if (prev?.done) {
      this.save();
      return null;
    }
    this.today().lessons++;
    return this.give(bonus, 5, 'Lesson complete!');
  }
  reviewed(cardId: string, rating: Rating) {
    const c = this.s.cards[cardId];
    if (!c) return null;
    const wasDue = c.due <= Date.now();
    this.s.cards[cardId] = review(c, rating);
    this.s.counters.reviews++;
    const t = this.today();
    t.reviews++;
    this.bumpCombo(rating >= 3);
    const extra: Achievement[] = [];
    if (!this.dueCards().length && !t.queueCleared && t.reviews > 0) {
      t.queueCleared = true;
      this.s.counters.queueClearDays++;
    }
    return this.give(rating === 1 ? 2 : wasDue ? 5 : 3, 0, rating === 1 ? 'Review (it will come back soon)' : wasDue ? 'On-time review' : 'Review', extra);
  }
  gymSolved(id: string, difficulty: 'Easy' | 'Medium' | 'Hard', seconds: number, budgetMin: number, hints: number) {
    const g = (this.s.gym[id] ??= { solved: false, attempts: 0 });
    const first = !g.solved;
    g.solved = true;
    g.at = Date.now();
    g.best = g.best ? Math.min(g.best, seconds) : seconds;
    const extra: Achievement[] = [];
    if (seconds < budgetMin * 30) extra.push(...this.grant('speedrun'));
    if (difficulty === 'Hard') extra.push(...this.grant('gym_hard'));
    if (!first) {
      this.save();
      return this.give(5, 0, 'Re-solved (great spaced practice)', extra);
    }
    this.today().gym++;
    const base = { Easy: 20, Medium: 40, Hard: 70 }[difficulty];
    const speed = seconds < budgetMin * 60 ? Math.round(base * 0.25) : 0;
    return this.give(base + speed + (hints === 0 ? 10 : 0), difficulty === 'Hard' ? 15 : 5, `${difficulty} problem solved${speed ? ' (beat the clock!)' : ''}`, extra);
  }
  gymAttempt(id: string) {
    const g = (this.s.gym[id] ??= { solved: false, attempts: 0 });
    g.attempts++;
    this.save();
  }
  bossPassed(moduleId: string, seconds: number) {
    const b = (this.s.boss[moduleId] ??= { passed: false });
    const first = !b.passed;
    b.passed = true;
    b.at = Date.now();
    b.best = b.best ? Math.min(b.best, seconds) : seconds;
    if (!first) {
      this.save();
      return null;
    }
    return this.give(150, 50, 'Interview round passed — advancing to the next stage!', this.grant('boss_1'));
  }
  pipelineStage(track: 'sql' | 'python') {
    const ids = track === 'sql' ? this.catalog.sqlBoss : this.catalog.pyBoss;
    return ids.filter((m) => this.s.boss[m]?.passed).length;
  }

  // ---------------- shop ----------------
  buyFreeze() {
    if (this.s.gems < 50 || this.s.freezes >= 2) return false;
    this.s.gems -= 50;
    this.s.freezes++;
    this.save();
    return true;
  }
  buyTheme(id: string) {
    const t = THEMES.find((x) => x.id === id);
    if (!t) return false;
    if (this.s.ownedThemes.includes(id)) {
      this.s.theme = id;
      this.save();
      return true;
    }
    if (this.s.gems < t.cost) return false;
    this.s.gems -= t.cost;
    this.s.ownedThemes.push(id);
    this.s.theme = id;
    this.save();
    return true;
  }

  // ---------------- achievements ----------------
  private grant(id: string): Achievement[] {
    if (this.s.achievements[id]) return [];
    const a = ACHIEVEMENTS.find((x) => x.id === id);
    if (!a) return [];
    this.s.achievements[id] = Date.now();
    return [a];
  }
  checkAchievements(): Achievement[] {
    const s = this.s;
    const out: Achievement[] = [];
    const g = (id: string, c: boolean) => c && out.push(...this.grant(id));
    const done = Object.values(s.lessons).filter((l) => l.done).length;
    g('first_lesson', done >= 1);
    g('lessons_5', done >= 5);
    g('lessons_15', done >= 15);
    g('lessons_all', this.catalog.lessonIds.length > 0 && this.catalog.lessonIds.every((id) => s.lessons[id]?.done));
    g('oracle', s.counters.predictFirst >= 10);
    g('oracle_50', s.counters.predictFirst >= 50);
    g('no_hints', s.counters.noHint >= 10);
    g('review_25', s.counters.reviews >= 25);
    g('review_200', s.counters.reviews >= 200);
    g('review_ontime_7', s.counters.queueClearDays >= 7);
    const st = this.streak();
    g('streak_3', st >= 3);
    g('streak_7', st >= 7);
    g('streak_30', st >= 30);
    const solved = Object.values(s.gym).filter((x) => x.solved).length;
    g('gym_1', solved >= 1);
    g('gym_10', solved >= 10);
    g('offer_sql', this.catalog.sqlBoss.length > 0 && this.catalog.sqlBoss.every((m) => s.boss[m]?.passed));
    g('offer_py', this.catalog.pyBoss.length > 0 && this.catalog.pyBoss.every((m) => s.boss[m]?.passed));
    g('explainer', Object.keys(s.notes).length >= 10);
    g('visual', s.counters.viz >= 20);
    g('quests_10', s.counters.quests >= 10);
    g('level_5', levelOf(s.xp).cur.n >= 5);
    const h = new Date().getHours();
    g('night', h >= 22);
    g('morning', h >= 4 && h < 7);
    return out;
  }

  exportCode() {
    return btoa(unescape(encodeURIComponent(JSON.stringify(this.s))));
  }
  importCode(code: string) {
    const obj = JSON.parse(decodeURIComponent(escape(atob(code.trim()))));
    if (obj?.v !== 1) throw new Error('not a progress code');
    this.s = { ...fresh(), ...obj };
    this.save();
  }
  reset() {
    this.s = fresh();
    this.save();
  }
}

export const progress = new Progress();
