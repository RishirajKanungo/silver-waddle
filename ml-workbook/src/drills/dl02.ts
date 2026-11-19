import { md, type Drill } from '../content/types';

const vt = (xs: (number | string)[]) => `(${xs.join(', ')})`;
const frac = (num: number, den: number) => {
  const g = (a: number, b: number): number => (b ? g(b, a % b) : Math.abs(a));
  const d = g(num, den) || 1;
  const n = num / d, m = den / d;
  return m === 1 ? String(n) : `${n < 0 ? '-' : ''}\\tfrac{${Math.abs(n)}}{${m}}`;
};

export const DRILLS: Drill[] = [
  {
    id: 'dl-dropout-scale',
    module: 'dl02',
    title: 'Inverted dropout',
    skill: 'Kept units are divided by 1 − p; the expectation is unchanged.',
    gen: (r) => {
      const p = r.pick([0.1, 0.2, 0.25, 0.5, 0.75, 0.8]);
      const h = r.int(1, 9) * (p === 0.75 || p === 0.25 ? 3 : 1);
      const q = r.pick(['kept', 'kept', 'mean', 'noscale']);
      if (q === 'kept')
        return {
          prompt: md`Inverted dropout with $p = ${p}$ (drop probability). A unit with activation $${h}$ is kept. What value does the next layer receive?`,
          answer: { kind: 'number', value: h / (1 - p) },
          solution: md`$${h}/(1 - ${p}) = ${h}/${Math.round((1 - p) * 100) / 100} = ${Math.round((h / (1 - p)) * 1e4) / 1e4}$.`,
        };
      if (q === 'mean')
        return {
          prompt: md`Inverted dropout with $p = ${p}$. A unit's activation is $${h}$. What is its expected value over the random mask during training?`,
          answer: { kind: 'number', value: h },
          solution: md`$(1-p)\cdot\frac{${h}}{1-p} + p\cdot 0 = ${h}$: inverted dropout is unbiased.`,
        };
      return {
        prompt: md`Dropout with $p = ${p}$ but **without** the $1/(1-p)$ scale. A unit's activation is $${h}$. What is its expected value during training?`,
        answer: { kind: 'number', value: (1 - p) * h },
        solution: md`$(1 - p)\cdot${h} = ${Math.round((1 - p) * h * 1e4) / 1e4}$. At evaluation the unit outputs $${h}$, a mismatch of a factor $1/(1-p)$.`,
      };
    },
  },
  {
    id: 'dl-cosine-lr',
    module: 'dl02',
    title: 'Warmup and cosine learning rate',
    skill: 'Locate t in the warmup or decay phase, compute p, then apply the formula.',
    gen: (r) => {
      const peak = r.pick([1e-3, 6e-4, 3e-4, 2e-4]);
      const minF = r.pick([0, 0.1]);
      const minLr = Number((peak * minF).toPrecision(3));
      const Tw = r.pick([500, 1000, 2000]);
      const D = r.pick([3000, 6000, 12000]);
      const T = Tw + D;
      const phase = r.pick(['warm', 'cos', 'cos', 'cos']);
      let t: number, eta: number, sol: string;
      if (phase === 'warm') {
        const f = r.pick([0.25, 0.5, 0.75]);
        t = Tw * f;
        eta = peak * f;
        sol = md`$t < T_w$: $\eta = \eta_{\max}\,t/T_w = ${peak}\cdot${f} = ${eta.toPrecision(3)}$.`;
      } else {
        const [pn, pd] = r.pick([[0, 1], [1, 3], [1, 2], [2, 3], [1, 1]] as [number, number][]);
        t = Tw + (D * pn) / pd;
        const c = [1, 0.5, 0, -0.5, -1][[0, 1 / 3, 1 / 2, 2 / 3, 1].indexOf(pn / pd)];
        eta = minLr + 0.5 * (peak - minLr) * (1 + c);
        sol = md`$p = (t - T_w)/(T - T_w) = ${frac(pn, pd)}$, $\cos(\pi p) = ${c}$, so $\eta = ${minLr} + \tfrac12(${peak} - ${minLr})(1 + ${c < 0 ? `(${c})` : c}) = ${Number(eta.toPrecision(4))}$.`;
      }
      return {
        prompt: md`Linear warmup for $T_w = ${Tw}$ steps to $\eta_{\max} = ${peak}$, then cosine decay to $\eta_{\min} = ${minLr}$ at $T = ${T}$. What is $\eta$ at step $t = ${t}$?`,
        answer: { kind: 'number', value: eta, tol: Math.max(1e-9, Math.abs(eta) * 1e-3) },
        solution: sol,
        inputHint: 'e.g. 1.5e-4',
      };
    },
  },
  {
    id: 'dl-layernorm',
    module: 'dl02',
    title: 'LayerNorm by hand',
    skill: 'Subtract the mean, divide by the population standard deviation.',
    gen: (r) => {
      const pats: [number[], number][] = [
        [[5, -1, -1, -3], 3],
        [[1, -5, 3, 1], 3],
        [[2, 2, -2, -2], 2],
        [[3, 3, -3, -3], 3],
        [[4, -4, 0, 0, 0, 0, 0, 0], 2],
      ];
      const [dev0, sd] = r.pick(pats);
      const flip = r.next() < 0.5 ? -1 : 1;
      const dev = r.shuffle(dev0.map((v) => v * flip));
      const k = r.pick([1, 1, 2]);
      const mu = r.int(-3, 4);
      const x = dev.map((v) => mu + k * v);
      return {
        prompt: md`Apply LayerNorm ($\gamma = 1$, $\beta = 0$, $\epsilon = 0$) to $\bx = ${vt(x)}$.`,
        answer: { kind: 'vector', value: dev.map((v) => v / sd) },
        solution: md`Mean $\mu = ${mu}$; deviations $${vt(dev.map((v) => k * v))}$; variance $= ${k * k * sd * sd}$ (mean of the squared deviations), so $\sigma = ${k * sd}$. Result: $${vt(dev.map((v) => frac(v, sd)))}$.`,
        inputHint: 'a vector, e.g. [1, -1/3, 0]',
      };
    },
  },
  {
    id: 'dl-clip',
    module: 'dl02',
    title: 'Clipping by global norm',
    skill: 'Norm of all gradients together; scale by c / norm if it exceeds c.',
    gen: (r) => {
      const [a, b, c] = r.pick([[3, 4, 12], [2, 3, 6], [1, 2, 2], [4, 4, 7], [2, 6, 9]] as [number, number, number][]);
      const n = Math.sqrt(a * a + b * b + c * c);
      const m = r.pick([1, 2]);
      const g1 = [a * m, b * m], g2 = [c * m];
      const norm = n * m;
      const cl = r.pick([norm / 2, norm / 4, norm * 2, norm / 2]);
      const s = Math.min(1, cl / norm);
      return {
        prompt: md`Two parameter tensors have gradients $\bg_1 = ${vt(g1)}$ and $\bg_2 = ${vt(g2)}$. Clip them together to a global norm of at most $c = ${cl}$. Give the clipped $\bg_1$.`,
        answer: { kind: 'vector', value: g1.map((v) => v * s) },
        solution: md`$\lVert\bg\rVert = \sqrt{${g1[0] ** 2} + ${g1[1] ** 2} + ${g2[0] ** 2}} = ${norm}$. ${s < 1 ? `Scale $= ${cl}/${norm} = ${s}$, so $\\bg_1 \\to ${vt(g1.map((v) => v * s))}$.` : `It is already below $c$, so nothing changes.`}`,
      };
    },
  },
];
