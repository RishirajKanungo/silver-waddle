import { describe, it, expect } from 'vitest';
import { newCard, review, retrievability, isDue, previews } from './srs';

const DAY = 86400000;

describe('spaced repetition', () => {
  it('intervals grow with good recalls and shrink on lapses', () => {
    let t = 0;
    let c = newCard('a', 'l', t);
    const intervals: number[] = [];
    for (let i = 0; i < 5; i++) {
      t = c.due;
      c = review(c, 3, t);
      intervals.push((c.due - t) / DAY);
    }
    for (let i = 1; i < intervals.length; i++) expect(intervals[i]).toBeGreaterThan(intervals[i - 1]);
    expect(intervals[4]).toBeGreaterThan(20);
    t = c.due;
    const lapsed = review(c, 1, t);
    expect((lapsed.due - t) / DAY).toBeLessThan(intervals[4] / 3);
    expect(lapsed.lapses).toBe(1);
  });
  it('predicts ~90% recall at the due date', () => {
    const c = review(newCard('a', 'l', 0), 3, 0);
    expect(retrievability(c, c.due)).toBeCloseTo(0.9, 1);
    expect(isDue(c, c.due - 1)).toBe(false);
    expect(isDue(c, c.due)).toBe(true);
  });
  it('easy > good > hard', () => {
    const c = newCard('a', 'l', 0);
    const [h, g, e] = [2, 3, 4].map((r) => review(c, r as 2 | 3 | 4, c.due).due);
    expect(h).toBeLessThan(g);
    expect(g).toBeLessThan(e);
  });
});

it('first review: the four buttons give clearly different intervals', () => {
  const t0 = Date.UTC(2026, 0, 1);
  const c = newCard('x', 'l', t0);
  const at = t0 + 0.5 * 86400000;
  expect(previews(c, at)).toEqual(['2 h', '1 d', '3 d', '6 d']);
});
