// Learner progress + rewards. Persisted in localStorage (and exportable as a
// file, because browser storage can be wiped).
//
// Reward design (why it's built this way):
//  * XP for every task -> constant small wins.
//  * Levels named after the bank career ladder -> progress you can feel.
//  * Daily goal + streak -> the "practice whenever I'm home" habit.
//  * Stars / keyboard-only bonus -> nudges toward muscle memory, not mouse-clicking.
//  * Spaced repetition (Leitner boxes) for shortcuts -> the ones you miss come back more often.

export interface DrillStat {
  box: number; // 0..5
  seen: number;
  correct: number;
  bestMs: number;
  lastAt: number;
}

export interface LessonRecord {
  at: number;
  stars: number;
  keyboardOnly: boolean;
  hintsUsed: number;
}

export interface ProgressState {
  version: 1;
  name: string;
  xp: number;
  tasks: Record<string, string[]>; // lessonId -> completed task ids
  lessons: Record<string, LessonRecord>;
  quizBest: Record<string, number>; // moduleId -> best %
  drills: Record<string, DrillStat>;
  drillCorrect: number;
  achievements: Record<string, number>;
  days: Record<string, number>; // 'YYYY-MM-DD' -> xp earned that day
  dailyGoal: number;
  sound: boolean;
}

export interface Level {
  n: number;
  title: string;
  min: number;
}

export const LEVELS: Level[] = [
  { n: 1, title: 'Intern', min: 0 },
  { n: 2, title: 'Summer Analyst', min: 120 },
  { n: 3, title: 'Analyst I', min: 300 },
  { n: 4, title: 'Analyst II', min: 550 },
  { n: 5, title: 'Senior Analyst', min: 850 },
  { n: 6, title: 'Associate', min: 1250 },
  { n: 7, title: 'Senior Associate', min: 1750 },
  { n: 8, title: 'Vice President', min: 2400 },
  { n: 9, title: 'Director', min: 3200 },
  { n: 10, title: 'Managing Director', min: 4200 },
  { n: 11, title: 'Excel Hero', min: 5500 },
];

export function levelOf(xp: number) {
  let cur = LEVELS[0];
  for (const l of LEVELS) if (xp >= l.min) cur = l;
  const next = LEVELS.find((l) => l.min > xp) ?? null;
  const pct = next ? (xp - cur.min) / (next.min - cur.min) : 1;
  return { cur, next, pct };
}

export interface Achievement {
  id: string;
  name: string;
  desc: string;
  icon: string;
}

export const ACHIEVEMENTS: Achievement[] = [
  { id: 'first_task', name: 'First Cell', desc: 'Complete your first task.', icon: '🌱' },
  { id: 'first_lesson', name: 'On the Desk', desc: 'Complete your first lesson.', icon: '📗' },
  { id: 'five_lessons', name: 'Getting Reps In', desc: 'Complete 5 lessons.', icon: '🏋️' },
  { id: 'twenty_lessons', name: 'Workhorse', desc: 'Complete 20 lessons.', icon: '🐎' },
  { id: 'keyboard_ninja', name: 'Keyboard Ninja', desc: 'Finish a lesson without touching the mouse.', icon: '🥷' },
  { id: 'no_hints', name: 'No Training Wheels', desc: 'Finish a lesson without using any hints.', icon: '🚲' },
  { id: 'lookup_legend', name: 'Lookup Legend', desc: 'Complete every VLOOKUP Mastery lesson.', icon: '🔎' },
  { id: 'cross_file', name: 'Cross-File Wizard', desc: 'Complete every Across Sheets & Files lesson.', icon: '🧙' },
  { id: 'data_janitor', name: 'Data Janitor', desc: 'Complete the data-cleaning module.', icon: '🧹' },
  { id: 'pivot_pro', name: 'Pivot Pro', desc: 'Complete the PivotTables module.', icon: '🔄' },
  { id: 'array_ace', name: 'Array Ace', desc: 'Complete the Dynamic Arrays module.', icon: '🌊' },
  { id: 'banker', name: "Banker's Toolkit", desc: 'Complete the Banking Analytics module.', icon: '🏦' },
  { id: 'quiz_pass', name: 'Passed!', desc: 'Score 80%+ on a module quiz.', icon: '✅' },
  { id: 'quiz_perfect', name: 'Perfect Score', desc: 'Score 100% on a module quiz.', icon: '💯' },
  { id: 'quiz_all', name: 'Certified', desc: 'Pass every module quiz with 80%+.', icon: '🎓' },
  { id: 'drill_25', name: 'Muscle Memory', desc: 'Get 25 shortcut drills right.', icon: '⌨️' },
  { id: 'drill_250', name: 'Shortcut Machine', desc: 'Get 250 shortcut drills right.', icon: '🤖' },
  { id: 'speed_demon', name: 'Speed Demon', desc: 'Average under 1.5s in a 15+ drill session with 90% accuracy.', icon: '⚡' },
  { id: 'drill_master', name: 'Shortcut Sensei', desc: 'Move 20 shortcuts to the top mastery box.', icon: '🥋' },
  { id: 'streak_3', name: 'Habit Forming', desc: 'Practice 3 days in a row.', icon: '🔥' },
  { id: 'streak_7', name: 'One Week Strong', desc: 'Practice 7 days in a row.', icon: '📆' },
  { id: 'streak_30', name: 'Unstoppable', desc: 'Practice 30 days in a row.', icon: '🏆' },
  { id: 'goal_crusher', name: 'Goal Crusher', desc: 'Hit 3× your daily XP goal in one day.', icon: '🎯' },
  { id: 'project_1', name: 'Shipped It', desc: 'Complete a capstone project.', icon: '🚀' },
  { id: 'project_all', name: 'Deal Closed', desc: 'Complete every capstone project.', icon: '🤝' },
  { id: 'night_owl', name: 'Night Owl', desc: 'Practice after 10 pm.', icon: '🦉' },
  { id: 'early_bird', name: 'Early Bird', desc: 'Practice before 7 am.', icon: '🐦' },
  { id: 'level_6', name: 'Promoted: Associate', desc: 'Reach Associate level.', icon: '👔' },
  { id: 'level_8', name: 'Promoted: VP', desc: 'Reach Vice President level.', icon: '💼' },
  { id: 'hero', name: 'Zero to Hero', desc: 'Complete every lesson and project.', icon: '🦸' },
];

const KEY = 'xlhero.progress.v1';

export function today(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function fresh(): ProgressState {
  return { version: 1, name: '', xp: 0, tasks: {}, lessons: {}, quizBest: {}, drills: {}, drillCorrect: 0, achievements: {}, days: {}, dailyGoal: 60, sound: true };
}

export interface RewardEvent {
  xp: number;
  label: string;
  levelUp?: Level;
  achievements: Achievement[];
}

export class Progress {
  state: ProgressState;
  private listeners = new Set<() => void>();
  private rewardListeners = new Set<(e: RewardEvent) => void>();
  version = 0;
  /** module/lesson lookups are injected to avoid an import cycle */
  catalog: { moduleLessons: Record<string, string[]>; moduleIds: string[]; projectIds: string[]; allLessonIds: string[] } = { moduleLessons: {}, moduleIds: [], projectIds: [], allLessonIds: [] };

  constructor() {
    this.state = this.loadState();
  }
  private loadState(): ProgressState {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) return { ...fresh(), ...JSON.parse(raw) };
    } catch {
      /* private mode etc. */
    }
    return fresh();
  }
  save() {
    try {
      localStorage.setItem(KEY, JSON.stringify(this.state));
    } catch {
      /* ignore */
    }
    this.version++;
    this.listeners.forEach((f) => f());
  }
  subscribe = (f: () => void) => {
    this.listeners.add(f);
    return () => {
      this.listeners.delete(f);
    };
  };
  getVersion = () => this.version;
  onReward(f: (e: RewardEvent) => void) {
    this.rewardListeners.add(f);
    return () => {
      this.rewardListeners.delete(f);
    };
  }

  // ---------- derived ----------
  get level() {
    return levelOf(this.state.xp);
  }
  get todayXp() {
    return this.state.days[today()] ?? 0;
  }
  streak(): number {
    let n = 0;
    const d = new Date();
    // today counts if practiced; otherwise streak continues from yesterday
    if (!this.state.days[today(d)]) d.setDate(d.getDate() - 1);
    while (this.state.days[today(d)]) {
      n++;
      d.setDate(d.getDate() - 1);
    }
    return n;
  }
  lessonDone(id: string) {
    return !!this.state.lessons[id];
  }
  taskDone(lessonId: string, taskId: string) {
    return !!this.state.tasks[lessonId]?.includes(taskId);
  }

  // ---------- awarding ----------
  private addXp(xp: number, label: string, extra: Achievement[] = []) {
    const before = levelOf(this.state.xp).cur;
    this.state.xp += xp;
    const k = today();
    this.state.days[k] = (this.state.days[k] ?? 0) + xp;
    const after = levelOf(this.state.xp).cur;
    const ach = [...extra, ...this.checkAchievements()];
    this.save();
    const ev: RewardEvent = { xp, label, achievements: ach, levelUp: after.n > before.n ? after : undefined };
    this.rewardListeners.forEach((f) => f(ev));
    return ev;
  }

  completeTask(lessonId: string, taskId: string, xp: number): RewardEvent | null {
    const list = (this.state.tasks[lessonId] ??= []);
    if (list.includes(taskId)) return null; // replays don't farm XP
    list.push(taskId);
    return this.addXp(xp, 'Task complete');
  }

  completeLesson(lessonId: string, rec: Omit<LessonRecord, 'at' | 'stars'>, bonus: number): RewardEvent {
    const prev = this.state.lessons[lessonId];
    const stars = 1 + (rec.hintsUsed === 0 ? 1 : 0) + (rec.keyboardOnly ? 1 : 0);
    const best = prev ? Math.max(prev.stars, stars) : stars;
    this.state.lessons[lessonId] = { at: Date.now(), stars: best, keyboardOnly: rec.keyboardOnly || !!prev?.keyboardOnly, hintsUsed: rec.hintsUsed };
    const extra: Achievement[] = [];
    if (rec.keyboardOnly) extra.push(...this.grant('keyboard_ninja'));
    if (rec.hintsUsed === 0) extra.push(...this.grant('no_hints'));
    // first completion gets the full bonus; improving stars later gets a smaller one
    const xp = prev ? (stars > prev.stars ? 15 : 0) : bonus + (rec.keyboardOnly ? 25 : 0) + (rec.hintsUsed === 0 ? 10 : 0);
    return this.addXp(xp, prev ? 'Lesson replayed' : 'Lesson complete!', extra);
  }

  quizResult(moduleId: string, pct: number, correct: number): RewardEvent {
    const prev = this.state.quizBest[moduleId] ?? 0;
    this.state.quizBest[moduleId] = Math.max(prev, pct);
    const extra: Achievement[] = [];
    if (pct >= 80) extra.push(...this.grant('quiz_pass'));
    if (pct === 100) extra.push(...this.grant('quiz_perfect'));
    const xp = Math.max(0, correct * 8 - (prev >= pct ? correct * 6 : 0)) + (pct === 100 && prev < 100 ? 40 : 0);
    return this.addXp(xp, `Quiz: ${pct}%`, extra);
  }

  drill(cmd: string, ok: boolean, ms: number): void {
    const d = (this.state.drills[cmd] ??= { box: 0, seen: 0, correct: 0, bestMs: 0, lastAt: 0 });
    d.seen++;
    d.lastAt = Date.now();
    if (ok) {
      d.correct++;
      d.box = Math.min(5, d.box + 1);
      d.bestMs = d.bestMs ? Math.min(d.bestMs, ms) : ms;
      this.state.drillCorrect++;
    } else d.box = Math.max(0, d.box - 2);
  }
  drillSession(correct: number, total: number, avgMs: number): RewardEvent {
    const extra: Achievement[] = [];
    if (total >= 15 && avgMs < 1500 && correct / total >= 0.9) extra.push(...this.grant('speed_demon'));
    return this.addXp(correct * 3 + (correct === total && total >= 10 ? 15 : 0), `Dojo: ${correct}/${total}`, extra);
  }

  private grant(id: string): Achievement[] {
    if (this.state.achievements[id]) return [];
    const a = ACHIEVEMENTS.find((x) => x.id === id);
    if (!a) return [];
    this.state.achievements[id] = Date.now();
    return [a];
  }

  checkAchievements(): Achievement[] {
    const s = this.state;
    const out: Achievement[] = [];
    const g = (id: string, cond: boolean) => cond && out.push(...this.grant(id));
    const nLessons = Object.keys(s.lessons).length;
    g('first_task', Object.values(s.tasks).some((t) => t.length > 0));
    g('first_lesson', nLessons >= 1);
    g('five_lessons', nLessons >= 5);
    g('twenty_lessons', nLessons >= 20);
    const modDone = (prefix: string) => {
      const ids = this.catalog.moduleLessons[Object.keys(this.catalog.moduleLessons).find((k) => k.startsWith(prefix)) ?? ''] ?? [];
      return ids.length > 0 && ids.every((id) => s.lessons[id]);
    };
    g('lookup_legend', modDone('m09'));
    g('cross_file', modDone('m11'));
    g('data_janitor', modDone('m06'));
    g('pivot_pro', modDone('m13'));
    g('array_ace', modDone('m14'));
    g('banker', modDone('m15'));
    g('quiz_all', this.catalog.moduleIds.length > 0 && this.catalog.moduleIds.every((m) => (s.quizBest[m] ?? 0) >= 80));
    g('drill_25', s.drillCorrect >= 25);
    g('drill_250', s.drillCorrect >= 250);
    g('drill_master', Object.values(s.drills).filter((d) => d.box >= 5).length >= 20);
    const st = this.streak();
    g('streak_3', st >= 3);
    g('streak_7', st >= 7);
    g('streak_30', st >= 30);
    g('goal_crusher', this.todayXp >= s.dailyGoal * 3);
    const projDone = this.catalog.projectIds.filter((id) => s.lessons[id]).length;
    g('project_1', projDone >= 1);
    g('project_all', this.catalog.projectIds.length > 0 && projDone === this.catalog.projectIds.length);
    const h = new Date().getHours();
    g('night_owl', h >= 22);
    g('early_bird', h < 7 && h >= 4);
    const lv = levelOf(s.xp).cur.n;
    g('level_6', lv >= 6);
    g('level_8', lv >= 8);
    g('hero', this.catalog.allLessonIds.length > 0 && this.catalog.allLessonIds.every((id) => s.lessons[id]));
    return out;
  }

  setName(n: string) {
    this.state.name = n;
    this.save();
  }
  setGoal(n: number) {
    this.state.dailyGoal = n;
    this.save();
  }
  toggleSound() {
    this.state.sound = !this.state.sound;
    this.save();
  }
  exportJson() {
    return JSON.stringify(this.state, null, 2);
  }
  importJson(text: string) {
    const obj = JSON.parse(text);
    if (obj?.version !== 1) throw new Error('Not a progress file');
    this.state = { ...fresh(), ...obj };
    this.save();
  }
  reset() {
    this.state = fresh();
    this.save();
  }
}

export const progress = new Progress();
