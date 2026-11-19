// Differential tests: our numpy subset vs real NumPy (python3 + numpy) on the same programs.
import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import { Interp } from './interp';
import { NP_CORPUS } from './numpy-corpus';

function cpython(src: string): { out: string; err: string } {
  try {
    const out = execFileSync('python3', ['-c', src], { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'], env: { ...process.env, PYTHONHASHSEED: '0', PYTHONWARNINGS: 'ignore' } });
    return { out, err: '' };
  } catch (e) {
    const x = e as { stdout: string; stderr: string };
    return { out: x.stdout, err: x.stderr };
  }
}

/** first differing line, for readable failures */
function firstDiff(ours: string, ref: string): string {
  const a = ours.split('\n'), b = ref.split('\n');
  for (let i = 0; i < Math.max(a.length, b.length); i++) if (a[i] !== b[i]) return `line ${i + 1}\n  ours:  ${JSON.stringify(a[i])}\n  numpy: ${JSON.stringify(b[i])}`;
  return '';
}

describe('numpy subset matches real NumPy', () => {
  for (const [name, src] of Object.entries(NP_CORPUS)) {
    it(name, () => {
      const ref = cpython(src);
      expect(ref.err, 'reference program itself failed').toBe('');
      const r = new Interp().run(src);
      expect(r.error).toBeNull();
      expect(firstDiff(r.stdout, ref.out)).toBe('');
      expect(r.stdout).toBe(ref.out);
    });
  }
});

describe('numpy errors match real NumPy tracebacks', () => {
  const cases: Record<string, string> = {
    broadcast: 'import numpy as np\nnp.ones(3) + np.ones(4)',
    matmul: 'import numpy as np\nnp.ones((2, 3)) @ np.ones((2, 3))',
    reshape: 'import numpy as np\nnp.arange(6).reshape(4)',
    index: 'import numpy as np\nnp.arange(3)[5]',
    singular: 'import numpy as np\nnp.linalg.inv(np.zeros((2, 2)))',
    truth: 'import numpy as np\nif np.array([1, 2]):\n    pass',
    axis: 'import numpy as np\nnp.zeros((2, 2)).sum(axis=3)',
    casting: 'import numpy as np\na = np.arange(3)\na += 0.5',
  };
  for (const [name, src] of Object.entries(cases)) {
    it(name, () => {
      const ref = cpython(src);
      const refLast = ref.err.trim().split('\n').pop();
      const r = new Interp().run(src);
      expect(r.error).not.toBeNull();
      expect(r.error!.trim().split('\n').pop()).toBe(refLast);
    });
  }
  it('LinAlgError type name', () => {
    const r = new Interp().run('import numpy as np\nnp.linalg.solve(np.zeros((2, 2)), np.ones(2))');
    expect(r.errorType).toBe('LinAlgError');
    expect(r.errorMessage).toBe('Singular matrix');
  });
  it('unsupported features fail loudly', () => {
    for (const [src, msg] of [
      ['np.random.default_rng(0).exponential()', 'Generator.exponential'],
      ['np.histogram([1, 2])', 'numpy.histogram'],
      ['np.zeros(3, dtype=np.float32)', 'float32'],
      ['np.array(["a", "b"])', 'strings'],
      ['np.linalg.eig(np.array([[0.0, -1.0], [1.0, 0.0]]))', 'complex'],
    ]) {
      const r = new Interp().run('import numpy as np\n' + src);
      expect(r.errorType).toBe('NotImplementedError');
      expect(r.errorMessage).toContain(msg);
    }
  });
});

describe('numpy tracer + performance', () => {
  it('snapshots ndarrays for the visualizer', () => {
    const r = new Interp().run('import numpy as np\na = np.arange(6).reshape(2, 3) / 4\nb = np.zeros(1000)\nc = a.sum()\nd = np.array([True, False])', { trace: true });
    expect(r.error).toBeNull();
    const last = r.trace[r.trace.length - 1];
    const vars = Object.fromEntries(last.frames[0].vars);
    const a = last.heap[(vars.a as { id: number }).id];
    expect(a.kind).toBe('ndarray');
    expect(a.shape).toEqual([2, 3]);
    expect(a.dtype).toBe('float64');
    expect(a.values).toEqual(['0.', '0.25', '0.5', '0.75', '1.', '1.25']);
    expect(a.truncated).toBe(false);
    const b = last.heap[(vars.b as { id: number }).id];
    expect(b.values!.length).toBe(400);
    expect(b.truncated).toBe(true);
    expect(vars.c).toEqual({ t: 'prim', type: 'float64', repr: '3.75' });
    expect(last.heap[(vars.d as { id: number }).id].values).toEqual(['True', 'False']);
  });
  it('trace mode does not change numpy output', () => {
    for (const name of ['views_and_setitem', 'ml_softmax_xent', 'random_legacy']) {
      const src = NP_CORPUS[name];
      expect(new Interp().run(src, { trace: true, maxTrace: 100000 }).stdout).toBe(new Interp().run(src).stdout);
    }
  });
  it('200x200 matmul is fast', () => {
    const src = 'import numpy as np\nnp.random.seed(0)\nA = np.random.rand(200, 200)\nB = np.random.rand(200, 200)\nC = A @ B\nprint(C.shape)';
    const r0 = new Interp().run('import numpy as np\nnp.random.seed(0)\nA = np.random.rand(200, 200)\nB = np.random.rand(200, 200)');
    expect(r0.error).toBeNull();
    const t = Date.now();
    const r = new Interp().run(src);
    const ms = Date.now() - t;
    console.log('200x200 @ (incl. setup):', ms, 'ms');
    expect(r.stdout).toBe('(200, 200)\n');
    expect(ms).toBeLessThan(400);
    // the product itself
    const I = new Interp();
    I.run('import numpy as np\nnp.random.seed(0)\nA = np.random.rand(200, 200)\nB = np.random.rand(200, 200)');
    const t2 = Date.now();
    const r2 = I.run('import numpy as np\nA = np.ones((200, 200))\nC = A @ A\nprint(C[0, 0])');
    console.log('200x200 @:', Date.now() - t2, 'ms');
    expect(r2.stdout).toBe('200.0\n');
    expect(Date.now() - t2).toBeLessThan(100);
  });
  it('gradient descent loop is fast', () => {
    const src = `import numpy as np
np.random.seed(0)
X = np.random.randn(200, 5)
w_true = np.arange(5.0)
y = X @ w_true + 0.1 * np.random.randn(200)
w = np.zeros(5)
for i in range(50):
    grad = 2 * X.T @ (X @ w - y) / len(y)
    w -= 0.1 * grad
print(np.round(w, 2))`;
    const t = Date.now();
    const r = new Interp().run(src);
    const ms = Date.now() - t;
    console.log('GD 50 iters on 200x5:', ms, 'ms');
    expect(r.error).toBeNull();
    expect(r.stdout).toBe(cpython(src).out);
    expect(ms).toBeLessThan(1000);
  });
});
