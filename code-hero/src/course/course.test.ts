// Content validation. Every lesson must be correct and solvable:
//  - Python snippets produce the same output as real CPython
//  - every "predict the output" answer is the true output
//  - every challenge's reference solution passes and its starter does NOT
//  - SQL snippets run on their dataset
import { describe, it, expect, beforeAll } from 'vitest';
import { execFileSync } from 'node:child_process';
import { MODULES, PROBLEMS } from './index';
import { Interp } from '../py/interp';
import { loadSql, runFresh } from '../sql/engine';
import { DATASETS } from '../sql/datasets';
import { gradePy, gradeSql } from './grade';
import type { Card, Cell, Challenge, Lesson } from './types';

beforeAll(async () => {
  await loadSql();
});

function cpython(src: string) {
  try {
    return { out: execFileSync('python3', ['-c', src], { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'], env: { ...process.env, PYTHONHASHSEED: '0' } }), err: '' };
  } catch (e) {
    const x = e as { stdout: string; stderr: string };
    return { out: x.stdout ?? '', err: x.stderr ?? 'failed' };
  }
}

function sqlPredictValue(dataset: string, sql: string): string[] {
  const r = runFresh(dataset, sql);
  if (r.error || !r.last) return [];
  const vals = [String(r.last.rows.length), `${r.last.rows.length} rows`, `${r.last.rows.length} row`];
  if (r.last.rows.length === 1 && r.last.columns.length === 1) vals.push(String(r.last.rows[0][0]));
  return vals;
}

function checkChallenge(ch: Challenge, dataset: string | undefined, where: string) {
  if (ch.lang === 'sql') {
    expect(dataset, `${where}: SQL challenge needs a dataset`).toBeTruthy();
    const good = gradeSql(ch, dataset!, ch.solution);
    expect(good.pass, `${where}: solution fails its own check — ${good.message}`).toBe(true);
    const bad = gradeSql(ch, dataset!, ch.starter);
    expect(bad.pass, `${where}: starter already passes (no challenge)`).toBe(false);
  } else {
    expect(ch.py && (ch.py.tests.length || ch.py.stdout), `${where}: needs py tests`).toBeTruthy();
    const good = gradePy(ch, ch.solution);
    expect(good.pass, `${where}: solution fails — ${good.message} ${JSON.stringify(good.tests?.filter((t) => !t.pass))} ${good.run?.error ?? ''}`).toBe(true);
    const bad = gradePy(ch, ch.starter);
    expect(bad.pass, `${where}: starter already passes`).toBe(false);
    // the reference solution must also run under real CPython
    const harness = ch.solution + '\n' + (ch.py?.tests ?? []).map((t) => `print(repr(${t}))`).join('\n');
    const ref = cpython(harness);
    expect(ref.err, `${where}: solution fails in CPython: ${ref.err}`).toBe('');
    const ours = new Interp().run(harness);
    expect(ours.stdout, `${where}: our interpreter disagrees with CPython`).toBe(ref.out);
  }
}

function checkCell(c: Cell, l: Lesson, i: number) {
  const where = `${l.id} cell ${i} (${c.kind})`;
  if (c.kind === 'code') {
    if (c.lang === 'python') {
      const ours = new Interp().run(c.code);
      const ref = cpython(c.code);
      if (c.error) {
        expect(ours.error, `${where}: expected an error`).toBeTruthy();
        expect(ref.err, `${where}: CPython didn't error`).not.toBe('');
        expect(ours.error!.trim().split('\n').pop(), `${where}: error differs from CPython`).toBe(ref.err.trim().split('\n').pop());
      } else {
        expect(ours.error, `${where}: ${ours.error}`).toBeNull();
        expect(ref.err, `${where}: CPython error: ${ref.err}`).toBe('');
        expect(ours.stdout, `${where}: output differs from CPython`).toBe(ref.out);
      }
      if (c.predict && c.predict.fromOutput !== false) {
        expect(c.predict.options[c.predict.answer], `${where}: predict answer is not the real output`).toBe(ref.out.trim());
      }
      if (c.trace) {
        const t = new Interp().run(c.code, { trace: true });
        expect(t.trace.length, `${where}: trace empty`).toBeGreaterThan(1);
      }
    } else {
      expect(l.dataset, `${where}: SQL lesson needs dataset`).toBeTruthy();
      const r = runFresh(l.dataset!, c.code);
      if (c.error) expect(r.error, `${where}: expected SQL error`).toBeTruthy();
      else expect(r.error, `${where}: ${r.error}`).toBeNull();
      if (c.predict && c.predict.fromOutput) {
        expect(sqlPredictValue(l.dataset!, c.code), `${where}: predict answer mismatch`).toContain(c.predict.options[c.predict.answer]);
      }
    }
    if (c.predict) expect(c.predict.answer).toBeLessThan(c.predict.options.length);
  }
  if (c.kind === 'challenge') checkChallenge(c, l.dataset, where);
  if (c.kind === 'quiz') expect(c.answer, where).toBeLessThan(c.options.length);
  if (c.kind === 'viz') {
    const v = c.viz;
    if (v.type === 'pipeline') expect(runFresh(l.dataset!, v.sql).error, where).toBeNull();
    if (v.type === 'trace') {
      const r = new Interp().run(v.code, { trace: true });
      expect(r.error, `${where}: ${r.error}`).toBeNull();
      expect(cpython(v.code).out, `${where}: differs from CPython`).toBe(r.stdout);
    }
    if (v.type === 'join' || v.type === 'groupby' || v.type === 'window') {
      expect(l.dataset, where).toBeTruthy();
      const tables = v.type === 'join' ? [v.left, v.right] : [v.table];
      for (const t of tables) expect(runFresh(l.dataset!, `SELECT * FROM ${t}`).error, `${where}: table ${t}`).toBeNull();
    }
  }
}

function checkCard(card: Card, where: string) {
  if (card.kind === 'predict') {
    const ref = cpython(card.code);
    expect(ref.err, `${where}: ${ref.err}`).toBe('');
    expect(new Interp().run(card.code).stdout, `${where}: interpreter differs`).toBe(ref.out);
    expect(card.options[card.answer], `${where}: card answer is not the real output`).toBe(ref.out.trim());
  }
  if (card.kind === 'sql') {
    expect(DATASETS[card.dataset], where).toBeTruthy();
    expect(runFresh(card.dataset, card.solution).error, where).toBeNull();
  }
  if (card.kind === 'cloze') {
    const blanks = (card.text.match(/\{\{\}\}/g) ?? []).length;
    expect(blanks, `${where}: cloze needs {{}} blanks matching answers`).toBe(card.answers.length);
  }
}

describe('course content', () => {
  it('has both tracks', () => {
    expect(MODULES.some((m) => m.track === 'sql')).toBe(true);
    expect(MODULES.some((m) => m.track === 'python')).toBe(true);
  });
  const ids = new Set<string>();
  for (const m of MODULES) {
    describe(`${m.id} ${m.title}`, () => {
      for (const l of m.lessons) {
        it(l.id, () => {
          expect(ids.has(l.id), 'duplicate id ' + l.id).toBe(false);
          ids.add(l.id);
          expect(l.track).toBe(m.track);
          if (l.dataset) expect(DATASETS[l.dataset], 'unknown dataset ' + l.dataset).toBeTruthy();
          expect(l.cards.length, `${l.id}: needs flashcards`).toBeGreaterThanOrEqual(3);
          expect(l.cells.filter((c) => c.kind === 'challenge').length, `${l.id}: needs a challenge`).toBeGreaterThan(0);
          l.cells.forEach((c, i) => checkCell(c, l, i));
          l.cards.forEach((card, i) => checkCard(card, `${l.id} card ${i}`));
        });
      }
      it('boss problems exist', () => {
        for (const id of m.boss) expect(PROBLEMS.find((p) => p.id === id), `${m.id}: unknown boss problem ${id}`).toBeTruthy();
      });
    });
  }
  describe('interview gym', () => {
    for (const p of PROBLEMS) {
      it(p.id, () => {
        if (p.track === 'sql') expect(DATASETS[p.dataset ?? ''], p.id).toBeTruthy();
        checkChallenge(p.challenge, p.dataset, p.id);
      });
    }
  });
});
