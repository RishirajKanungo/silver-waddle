// Differential test: our interpreter vs real CPython on the same programs.
import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import { Interp } from './interp';
import { CORPUS, ERROR_CORPUS } from './corpus';

function cpython(src: string): { out: string; err: string } {
  try {
    const out = execFileSync('python3', ['-c', src], { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'], env: { ...process.env, PYTHONHASHSEED: '0' } });
    return { out, err: '' };
  } catch (e) {
    const x = e as { stdout: string; stderr: string };
    return { out: x.stdout, err: x.stderr };
  }
}

describe('interpreter matches CPython', () => {
  for (const [name, src] of Object.entries(CORPUS)) {
    it(name, () => {
      const ref = cpython(src);
      expect(ref.err, 'reference program itself failed').toBe('');
      const r = new Interp().run(src);
      expect(r.error).toBeNull();
      expect(r.stdout).toBe(ref.out);
    });
  }
  for (const [name, src] of Object.entries(ERROR_CORPUS)) {
    it('error: ' + name, () => {
      const ref = cpython(src);
      const refLast = ref.err.trim().split('\n').pop();
      const r = new Interp().run(src);
      expect(r.error).not.toBeNull();
      expect(r.error!.trim().split('\n').pop()).toBe(refLast);
    });
  }
});

describe('tracing', () => {
  it('records frames, heap and calls', () => {
    const src = `class Node:\n    def __init__(self, v):\n        self.v = v\n        self.next = None\na = Node(1)\nb = Node(2)\na.next = b\nnums = [1, 2]\ndef f(n):\n    return n * 2\nx = f(3)`;
    const r = new Interp().run(src, { trace: true });
    expect(r.error).toBeNull();
    const last = r.trace[r.trace.length - 1];
    const g = last.frames[0];
    const names = g.vars.map((v) => v[0]);
    expect(names).toEqual(expect.arrayContaining(['Node', 'a', 'b', 'nums', 'f', 'x']));
    const a = g.vars.find((v) => v[0] === 'a')![1];
    expect(a.t).toBe('ref');
    const obj = last.heap[(a as { id: number }).id];
    expect(obj.kind).toBe('instance');
    expect(obj.attrs!.find((x) => x[0] === 'next')![1].t).toBe('ref');
    expect(r.calls.some((c) => c.name === 'f' && c.ret === '6')).toBe(true);
    expect(r.trace.some((s) => s.frames.length === 2 && s.frames[1].name === 'f')).toBe(true);
  });
  it('stops infinite loops', () => {
    const r = new Interp().run('while True:\n    pass', { maxSteps: 10000 });
    expect(r.errorType).toBe('TimeoutError');
  });
  it('echoes last expression like a notebook', () => {
    const r = new Interp().run('x = [1, 2]\nx + [3]', { echoLast: true });
    expect(r.lastValue).toBe('[1, 2, 3]');
  });
  it('syntax errors are friendly', () => {
    const r = new Interp().run('def f(:\n  pass');
    expect(r.errorType).toBe('SyntaxError');
  });
});

describe('trace mode is faithful', () => {
  for (const [name, src] of Object.entries(CORPUS)) {
    it('trace: ' + name, () => {
      const plain = new Interp().run(src);
      const traced = new Interp().run(src, { trace: true, maxTrace: 100000 });
      expect(traced.stdout).toBe(plain.stdout);
      expect(traced.trace.length).toBeGreaterThan(0);
    });
  }
  it('performance', () => {
    const t = Date.now();
    const r = new Interp().run('total = 0\nfor i in range(300000):\n    total += i % 7\nprint(total)');
    const ms = Date.now() - t;
    console.log('300k-iteration loop:', ms, 'ms');
    expect(r.stdout.trim()).toBe(String([...Array(300000).keys()].reduce((a, i) => a + (i % 7), 0)));
    expect(ms).toBeLessThan(8000);
  });
});
