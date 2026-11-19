import { md, type Drill } from '../content/types';

export const DRILLS: Drill[] = [
  {
    id: 'llm-kvcache',
    module: 'llm03',
    title: 'KV-cache size',
    skill: 'Compute 2·L·n_kv·d_h·T·B·bytes and convert to GiB.',
    gen: (r) => {
      const L = r.pick([16, 32, 40, 64, 80]);
      const nkv = r.pick([1, 2, 4, 8, 16]);
      const dh = r.pick([64, 128]);
      const T = r.pick([2048, 4096, 8192, 32768]);
      const B = r.pick([1, 2, 4, 8]);
      const by = r.pick([1, 2]);
      const per = 2 * L * nkv * dh * by;
      const tot = per * T * B;
      const gib = tot / 2 ** 30;
      return {
        prompt: md`$L = ${L}$ layers, $n_{kv} = ${nkv}$ KV heads with $d_h = ${dh}$, a ${by * 8}-bit cache, batch $B = ${B}$ of $T = ${T}$ tokens each. KV-cache size in GiB ($2^{30}$ bytes)?`,
        answer: { kind: 'number', value: gib, tol: 1e-4 },
        inputHint: 'GiB, fractions allowed',
        solution: md`Per token: $2\cdot ${L}\cdot ${nkv}\cdot ${dh}\cdot ${by} = ${per}$ bytes $= ${per / 1024}$ KiB. Times $T\cdot B = ${T * B}$ tokens: $${tot}$ bytes $= ${+gib.toFixed(6)}$ GiB.`,
      };
    },
  },
  {
    id: 'llm-topp',
    module: 'llm03',
    title: 'Top-p set',
    skill: 'Find the nucleus and renormalize.',
    gen: (r) => {
      // five distinct probabilities in twentieths, sorted descending
      let parts: number[] = [];
      do {
        const cuts = [r.int(1, 19), r.int(1, 19), r.int(1, 19), r.int(1, 19)].sort((a, b) => a - b);
        parts = [cuts[0], cuts[1] - cuts[0], cuts[2] - cuts[1], cuts[3] - cuts[2], 20 - cuts[3]].sort((a, b) => b - a);
      } while (new Set(parts).size < 5 || parts.some((x) => x === 0));
      const t = r.int(10, 18);
      let cum = 0, m = 0;
      while (cum < t) cum += parts[m++];
      const kept = parts.slice(0, m);
      const s = kept.reduce((a, b) => a + b, 0);
      const fmt = (x: number) => String(x / 20);
      return {
        prompt: md`Next-token probabilities, sorted: $(${parts.map(fmt).join(', ')})$. Apply top-$p$ with $p = ${t / 20}$. Enter the renormalized probabilities of the kept tokens (fractions are fine).`,
        answer: { kind: 'vector', value: kept.map((x) => x / s), tol: 2e-3 },
        solution: md`Cumulative sums: $${parts.slice(0, m).map((_, i) => fmt(parts.slice(0, i + 1).reduce((a, b) => a + b, 0))).join(', ')}$; the first to reach ${t / 20} is token ${m}, so ${m} token${m > 1 ? 's are' : ' is'} kept. Divide by their mass ${s / 20}: $(${kept.map((x) => `${x}/${s}`).join(', ')})$.`,
      };
    },
  },
  {
    id: 'llm-int8',
    module: 'llm03',
    title: 'Symmetric int8 codes',
    skill: 'Compute s = max|w|/127 and q = round(w/s).',
    gen: (r) => {
      const s = r.pick([0.01, 0.02, 0.05]);
      const n = [127 * (r.next() < 0.5 ? 1 : -1), r.int(-120, 120), r.int(-120, 120), r.int(-120, 120)];
      const deltas = [0, ...[0, 0, 0].map(() => r.pick([-0.4, -0.3, -0.2, -0.1, 0.1, 0.2, 0.3, 0.4]))];
      const order = r.shuffle([0, 1, 2, 3]);
      const codes = order.map((i) => n[i]);
      const w = order.map((i) => Math.round(s * (n[i] + deltas[i]) * 1e6) / 1e6);
      const mx = Math.max(...w.map(Math.abs));
      return {
        prompt: md`Quantize $\bw = (${w.join(', ')})$ to int8 with symmetric absmax scaling. Enter the integer codes.`,
        answer: { kind: 'vector', value: codes },
        solution: md`$s = \max|w|/127 = ${mx}/127 = ${s}$. $q = \operatorname{round}(w/s) = (${w.map((x) => +(x / s).toFixed(4)).join(', ')}) \to (${codes.join(', ')})$. Each error is at most $s/2 = ${s / 2}$.`,
      };
    },
  },
];
