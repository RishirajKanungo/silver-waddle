// Spaced repetition (a compact FSRS-style scheduler).
//
// Why: new material is forgotten along a curve. Each successful recall at the
// right moment flattens that curve ("stability" grows), so reviews get rarer.
// We model recall probability as R(t) = (1 + t / (9·S))^-1, which is ~90% when
// t = S. A card is "due" when its predicted recall drops to ~90%.

export type Rating = 1 | 2 | 3 | 4; // Again, Hard, Good, Easy

export interface CardState {
  id: string;
  lessonId: string;
  stability: number; // days
  difficulty: number; // 1 (easy) .. 10 (hard)
  reps: number;
  lapses: number;
  last: number; // ms epoch of last review
  due: number; // ms epoch
}

const DAY = 86400000;

export function retrievability(c: CardState, now = Date.now()): number {
  const t = Math.max(0, (now - c.last) / DAY);
  return 1 / (1 + t / (9 * c.stability));
}

export function newCard(id: string, lessonId: string, now = Date.now()): CardState {
  // first review shortly after learning: the most important spacing step
  return { id, lessonId, stability: 0.5, difficulty: 5, reps: 0, lapses: 0, last: now, due: now + 0.5 * DAY };
}

export function review(c: CardState, rating: Rating, now = Date.now()): CardState {
  const R = retrievability(c, now);
  let { stability: S, difficulty: D } = c;
  D = Math.min(10, Math.max(1, D + (rating === 1 ? 1.2 : rating === 2 ? 0.4 : rating === 4 ? -0.6 : -0.1)));
  if (rating === 1) {
    S = Math.max(0.15, S * 0.35);
    return { ...c, stability: S, difficulty: D, reps: c.reps + 1, lapses: c.lapses + 1, last: now, due: now + Math.max(10 * 60000, S * DAY * 0.5) };
  }
  if (c.reps === 0) {
    // First review after the lesson: like FSRS, use a fixed starting ladder so the four
    // buttons mean clearly different things (Hard = tomorrow, Good = a few days, Easy = a week).
    S = { 2: 1, 3: 2.5, 4: 6 }[rating];
    return { ...c, stability: S, difficulty: D, reps: 1, lapses: c.lapses, last: now, due: now + S * DAY };
  }
  const growth = { 2: 1.25, 3: 2.6, 4: 3.8 }[rating];
  // harder cards grow slower; recalling when R was low (it was "almost forgotten") grows more
  S = S * (1 + (growth - 1) * ((11 - D) / 10) * (1 + 1.2 * (1 - R)));
  S = Math.min(S, 365);
  return { ...c, stability: S, difficulty: D, reps: c.reps + 1, lapses: c.lapses, last: now, due: now + S * DAY };
}

export const isDue = (c: CardState, now = Date.now()) => c.due <= now;
export const isLeech = (c: CardState) => c.lapses >= 3;

/** Human description of when a card comes back. */
export function intervalLabel(c: CardState, now = Date.now()) {
  const d = (c.due - now) / DAY;
  if (d < 1 / 24) return `${Math.max(1, Math.round(d * 1440))} min`;
  if (d < 23.5 / 24) return `${Math.round(d * 24)} h`;
  if (d < 30) return `${Math.round(d)} d`;
  return `${Math.round(d / 30)} mo`;
}

/** Preview the next interval for each rating (shown on the rating buttons). */
export function previews(c: CardState, now = Date.now()) {
  return ([1, 2, 3, 4] as Rating[]).map((r) => intervalLabel(review(c, r, now), now));
}
