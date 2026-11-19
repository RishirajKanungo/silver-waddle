// Progress: what you've worked through, and a spaced-repetition schedule for everything worth
// remembering — flashcards, pen-and-paper problems (re-solve later), drills and interview questions.
import { newCard, review as srsReview, retrievability, isDue, type CardState, type Rating } from './srs';
import type { Area, Lesson, Module } from '../content/types';

const KEY = 'godot-rpg.progress.v1';
const DAY = 86400000;

export type ProblemStatus = 'solved' | 'partial' | 'missed';
export type ItemKind = 'card' | 'problem' | 'drill' | 'question';
export const itemKey = (kind: ItemKind, id: string) => `${kind[0]}:${id}`;
export const parseKey = (k: string): { kind: ItemKind; id: string } => {
  const kind = ({ c: 'card', p: 'problem', d: 'drill', q: 'question' } as const)[k[0] as 'c'];
  return { kind, id: k.slice(2) };
};

interface DayLog {
  reviews: number;
  cells: number;
  problems: number;
  drills: number;
}
export interface State {
  v: 1;
  cells: Record<string, Record<string, 1>>; // lessonId -> cell index -> done
  lessons: Record<string, { at: number }>;
  srs: Record<string, CardState>;
  problems: Record<string, { status: ProblemStatus; at: number; attempts: number; answered?: boolean }>;
  drills: Record<string, { attempts: number; correct: number; recent: number[] }>; // recent: 1/0
  notes: Record<string, { prompt: string; text: string; at: number; lessonId: string }>;
  days: Record<string, DayLog>;
  code: Record<string, string>;
  theme: 'system' | 'light' | 'dark';
}

const fresh = (): State => ({ v: 1, cells: {}, lessons: {}, srs: {}, problems: {}, drills: {}, notes: {}, days: {}, code: {}, theme: 'system' });

export const dayKey = (t = Date.now()) => {
  const d = new Date(t);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

class Progress {
  s: State;
  private version = 0;
  private subs = new Set<() => void>();
  constructor() {
    this.s = this.load();
  }
  private load(): State {
    try {
      const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(KEY) : null;
      if (raw) return { ...fresh(), ...JSON.parse(raw) };
    } catch {
      /* storage unavailable: work in memory */
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

  private today(): DayLog {
    const k = dayKey();
    return (this.s.days[k] ??= { reviews: 0, cells: 0, problems: 0, drills: 0 });
  }

  // ---------------- lessons
  isCellDone(lessonId: string, i: number) {
    return !!this.s.cells[lessonId]?.[i];
  }
  markCell(lessonId: string, i: number) {
    const c = (this.s.cells[lessonId] ??= {});
    if (c[i]) return;
    c[i] = 1;
    this.today().cells++;
    this.save();
  }
  lessonDone(id: string) {
    return !!this.s.lessons[id];
  }
  /** Completing a lesson schedules its cards; the module's interview questions join the deck too. */
  completeLesson(lesson: Lesson, module: Module, questionIds: string[]) {
    if (!this.s.lessons[lesson.id]) this.s.lessons[lesson.id] = { at: Date.now() };
    for (const c of lesson.cards) {
      const k = itemKey('card', c.id);
      if (!this.s.srs[k]) this.s.srs[k] = newCard(k, module.id);
    }
    const last = module.lessons[module.lessons.length - 1]?.id === lesson.id;
    if (last)
      for (const q of questionIds) {
        const k = itemKey('question', q);
        if (!this.s.srs[k]) this.s.srs[k] = newCard(k, module.id);
      }
    this.save();
  }
  saveNote(key: string, lessonId: string, prompt: string, text: string) {
    this.s.notes[key] = { prompt, text, at: Date.now(), lessonId };
    this.save();
  }

  // ---------------- problems (pen & paper)
  gradeProblem(id: string, moduleId: string, status: ProblemStatus, answered?: boolean) {
    const p = this.s.problems[id];
    this.s.problems[id] = { status, at: Date.now(), attempts: (p?.attempts ?? 0) + 1, answered: answered ?? p?.answered };
    this.today().problems++;
    // schedule a re-solve: missed → soon, partial → in a day or two, solved → in a few days
    const k = itemKey('problem', id);
    const rating: Rating = status === 'solved' ? 3 : status === 'partial' ? 2 : 1;
    this.s.srs[k] = srsReview(this.s.srs[k] ?? newCard(k, moduleId), rating);
    this.save();
  }

  // ---------------- drills
  drillResult(id: string, moduleId: string, correct: boolean) {
    const d = (this.s.drills[id] ??= { attempts: 0, correct: 0, recent: [] });
    d.attempts++;
    if (correct) d.correct++;
    d.recent = [...d.recent, correct ? 1 : 0].slice(-20);
    this.today().drills++;
    const k = itemKey('drill', id);
    if (!this.s.srs[k]) this.s.srs[k] = newCard(k, moduleId);
    this.save();
  }
  drillAccuracy(id: string) {
    const d = this.s.drills[id];
    if (!d || !d.recent.length) return null;
    return d.recent.reduce((a, b) => a + b, 0) / d.recent.length;
  }

  // ---------------- interview questions (practised outside the review queue)
  practisedQuestion(id: string, moduleId: string, rating: Rating) {
    const k = itemKey('question', id);
    this.s.srs[k] = srsReview(this.s.srs[k] ?? newCard(k, moduleId), rating);
    this.today().reviews++;
    this.save();
  }

  // ---------------- reviews
  due(now = Date.now()) {
    return Object.values(this.s.srs).filter((c) => isDue(c, now));
  }
  reviewed(key: string, rating: Rating) {
    const c = this.s.srs[key];
    if (!c) return;
    this.s.srs[key] = srsReview(c, rating);
    this.today().reviews++;
    this.save();
  }

  // ---------------- stats
  /** Retention of a module's items: mean predicted recall of everything scheduled, or null if nothing yet */
  moduleRetention(moduleId: string, now = Date.now()) {
    const items = Object.values(this.s.srs).filter((c) => c.group === moduleId);
    if (!items.length) return null;
    return items.reduce((a, c) => a + retrievability(c, now), 0) / items.length;
  }
  /**
   * Readiness for one interview area: of all items in that area across the course, how much you
   * have learned and still remember. coverage = learned/total, retention = mean recall of learned.
   */
  areaReadiness(area: Area, allItems: { key: string; areas: Area[] }[], now = Date.now()) {
    const inArea = allItems.filter((i) => i.areas.includes(area));
    if (!inArea.length) return { coverage: 0, retention: 0, score: 0, total: 0, learned: 0 };
    const learned = inArea.filter((i) => this.s.srs[i.key]);
    const retention = learned.length ? learned.reduce((a, i) => a + retrievability(this.s.srs[i.key], now), 0) / learned.length : 0;
    const coverage = learned.length / inArea.length;
    return { coverage, retention, score: coverage * retention, total: inArea.length, learned: learned.length };
  }
  streak(now = Date.now()) {
    let n = 0;
    for (let t = now; ; t -= DAY) {
      const d = this.s.days[dayKey(t)];
      const active = d && d.reviews + d.cells + d.problems + d.drills > 0;
      if (active) n++;
      else if (t !== now) break;
      if (n > 3650) break;
    }
    return n;
  }
  forecast(days = 14, now = Date.now()) {
    return Array.from({ length: days }, (_, d) => {
      const end = new Date(now);
      end.setHours(23, 59, 59, 999);
      end.setDate(end.getDate() + d);
      const start = new Date(end);
      start.setDate(start.getDate() - 1);
      return Object.values(this.s.srs).filter((c) => (d === 0 ? c.due <= end.getTime() : c.due > start.getTime() && c.due <= end.getTime())).length;
    });
  }

  // ---------------- settings & transfer
  setTheme(t: State['theme']) {
    this.s.theme = t;
    this.save();
  }
  exportCode() {
    return btoa(unescape(encodeURIComponent(JSON.stringify(this.s))));
  }
  importCode(code: string) {
    const s = JSON.parse(decodeURIComponent(escape(atob(code.trim()))));
    if (s?.v !== 1) throw new Error('bad code');
    this.s = { ...fresh(), ...s };
    this.save();
  }
  reset() {
    this.s = fresh();
    this.save();
  }
}

export const progress = new Progress();
export { retrievability };
export type { Rating, CardState };
