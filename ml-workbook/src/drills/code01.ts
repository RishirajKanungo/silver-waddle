import { md, type Drill } from '../content/types';

const sci = (x: number) => {
  const e = Math.floor(Math.log10(x));
  const a = Math.round((x / 10 ** e) * 100) / 100;
  return a === 1 ? `10^{${e}}` : `${a} \\times 10^{${e}}`;
};
const cm = (x: number) => x.toLocaleString('en-US').replace(/,/g, '{,}');
const sh = (s: number[]) => `(${s.join(', ')}${s.length === 1 ? ',' : ''})`;

export const DRILLS: Drill[] = [
  {
    id: 'code-shapes',
    module: 'code01',
    title: 'NumPy output shapes',
    skill: 'Predict the shape of a matrix product, a broadcast or a reduction before running it.',
    gen: (r) => {
      const n = r.pick([2, 3, 4, 5, 8, 10, 32]);
      const m = r.pick([3, 6, 7, 16, 20]);
      const d = r.pick([4, 5, 12, 64, 128]);
      const b = r.pick([2, 4, 8]);
      const kind = r.int(0, 6);
      let expr = '', shapes = '', out: number[] = [], why = '';
      if (kind === 0) {
        expr = 'A @ B.T';
        shapes = `\`A.shape = ${sh([n, d])}\`, \`B.shape = ${sh([m, d])}\``;
        out = [n, m];
        why = `\`B.T\` is ${sh([d, m])}; the inner dimensions ${d} match and disappear: ${sh([n, d])} @ ${sh([d, m])} → ${sh(out)}.`;
      } else if (kind === 1) {
        expr = 'X @ W';
        shapes = `\`X.shape = ${sh([b, n, d])}\`, \`W.shape = ${sh([d, m])}\``;
        out = [b, n, m];
        why = `\`@\` multiplies the last two axes and broadcasts the leading ones: ${sh([n, d])} @ ${sh([d, m])} → ${sh([n, m])}, with the batch axis ${b} kept.`;
      } else if (kind === 2) {
        expr = 'a[:, None] + c[None, :]';
        shapes = `\`a.shape = ${sh([n])}\`, \`c.shape = ${sh([m])}\``;
        out = [n, m];
        why = `${sh([n, 1])} + ${sh([1, m])}: each size-1 axis stretches to match the other, giving ${sh(out)}.`;
      } else if (kind === 3) {
        expr = 'X - X.mean(axis=0)';
        shapes = `\`X.shape = ${sh([n, d])}\``;
        out = [n, d];
        why = `\`X.mean(axis=0)\` is ${sh([d])}, which broadcasts against the last axis of ${sh([n, d])}. The result keeps X's shape.`;
      } else if (kind === 4) {
        const keep = r.next() < 0.5;
        expr = `X.sum(axis=-1${keep ? ', keepdims=True' : ''})`;
        shapes = `\`X.shape = ${sh([b, n, d])}\``;
        out = keep ? [b, n, 1] : [b, n];
        why = keep ? `Reducing the last axis with \`keepdims=True\` leaves it as size 1: ${sh(out)}, ready to broadcast back against X.` : `Reducing the last axis removes it: ${sh(out)}.`;
      } else if (kind === 5) {
        expr = 'X[:, None, :] - Y[None, :, :]';
        shapes = `\`X.shape = ${sh([n, d])}\`, \`Y.shape = ${sh([m, d])}\``;
        out = [n, m, d];
        why = `${sh([n, 1, d])} − ${sh([1, m, d])} broadcasts to ${sh(out)}: every pair of rows, every feature. It uses $nmd$ memory, which is why the norm identity is preferred for distances.`;
      } else {
        expr = 'np.eye(C)[y]';
        shapes = `\`y.shape = ${sh([n])}\` with integer labels, \`C = ${m}\``;
        out = [n, m];
        why = `Indexing the rows of the ${m} × ${m} identity with ${n} labels picks ${n} one-hot rows: ${sh(out)}.`;
      }
      return {
        prompt: md`${shapes}. What is the shape of \`${expr}\`? Enter the dimensions separated by commas.`,
        answer: { kind: 'vector', value: out },
        inputHint: 'e.g. 4, 7',
        solution: md`${why}`,
      };
    },
  },
  {
    id: 'code-attn-shapes',
    module: 'code01',
    title: 'Multi-head attention shapes',
    skill: 'Track (B, T, D) through head splitting, scores and merging.',
    gen: (r) => {
      const B = r.pick([1, 2, 4, 8]);
      const T = r.pick([16, 64, 128, 512]);
      const H = r.pick([4, 8, 12, 16]);
      const dk = r.pick([32, 64, 128]);
      const D = H * dk;
      const which = r.int(0, 3);
      const items: [string, number[], string][] = [
        ['Q after splitting heads, `X @ Wq` reshaped to (B, T, H, d) and with axes 1 and 2 swapped', [B, H, T, dk], `$d = D/H = ${D}/${H} = ${dk}$, and the head axis moves in front of the sequence axis: (B, H, T, d).`],
        ['the attention scores `Q @ K.swapaxes(-1, -2)`', [B, H, T, T], `(B, H, T, d) @ (B, H, d, T) → (B, H, T, T): one score per query–key pair, per head.`],
        ['the per-head output `A @ V`', [B, H, T, dk], `Weights (B, H, T, T) @ values (B, H, T, d) → (B, H, T, d).`],
        ['the output after merging heads, before the output projection', [B, T, D], `Swap back to (B, T, H, d) and reshape to (B, T, H·d) = (B, T, ${D}).`],
      ];
      const [what, out, why] = items[which];
      return {
        prompt: md`Multi-head self-attention with batch $B = ${B}$, sequence length $T = ${T}$, model width $D = ${D}$ and $H = ${H}$ heads. What is the shape of ${what}? Enter the dimensions separated by commas.`,
        answer: { kind: 'vector', value: out },
        inputHint: 'e.g. 2, 8, 128, 64',
        solution: md`${why}`,
      };
    },
  },
  {
    id: 'code-cost',
    module: 'code01',
    title: 'Memory and FLOPs of array operations',
    skill: 'Bytes = entries × bytes per entry; a (m, k) @ (k, n) product costs 2mkn FLOPs.',
    gen: (r) => {
      if (r.next() < 0.5) {
        const m = r.pick([1000, 2000, 5000, 10000, 50000]);
        const n = r.pick([1000, 10000, 100000, 1000000]);
        const [dt, bytes] = r.pick([['float32', 4], ['float64', 8]] as [string, number][]);
        const mb = (m * n * bytes) / 1e6;
        return {
          prompt: md`A ${dt} distance matrix between ${m.toLocaleString('en-US')} queries and ${n.toLocaleString('en-US')} points. How many MB ($10^6$ bytes) does it take?`,
          answer: { kind: 'number', value: mb },
          solution: md`$${cm(m)} \times ${cm(n)} = ${sci(m * n)}$ entries $\times\ ${bytes}$ bytes $= ${cm(mb)}$ MB${mb >= 1000 ? ` (${(mb / 1000).toLocaleString('en-US')} GB)` : ''}.`,
        };
      }
      const m = r.pick([128, 256, 512, 1024, 2048]);
      const k = r.pick([256, 512, 1024, 4096]);
      const n = r.pick([256, 1024, 4096]);
      const g = (2 * m * k * n) / 1e9;
      return {
        prompt: md`How many GFLOPs ($10^9$ floating-point operations) does a $(${m}, ${k})\,@\,(${k}, ${n})$ matrix product take, counting a multiply-add as 2? Answers within 1% are accepted.`,
        answer: { kind: 'number', value: g, tol: 0.01 },
        solution: md`The output has $${m} \times ${n}$ entries, each a dot product of length ${k}: $2 \times ${m} \times ${k} \times ${n} = ${cm(2 * m * k * n)}$ FLOPs $\approx ${Math.round(g * 1000) / 1000}$ GFLOPs.`,
      };
    },
  },
  {
    id: 'code-auc-pairs',
    module: 'code01',
    title: 'AUC by counting pairs',
    skill: 'Count, for every positive, the negatives it outscores; divide by the number of pairs.',
    gen: (r) => {
      const scores = r.shuffle([1, 2, 3, 4, 5, 6, 7, 8, 9]).slice(0, 6);
      const pos = scores.slice(0, 3).sort((a, b) => b - a);
      const neg = scores.slice(3).sort((a, b) => b - a);
      const wins = pos.map((p) => neg.filter((q) => p > q).length);
      const U = wins.reduce((s, x) => s + x, 0);
      return {
        prompt: md`Positives score $${pos.join(', ')}$ and negatives score $${neg.join(', ')}$. Compute the ROC-AUC. Fractions are fine.`,
        answer: { kind: 'number', value: U / 9 },
        inputHint: 'e.g. 7/9',
        solution: md`Negatives below each positive: ${pos.map((p, i) => `$${p}$: ${wins[i]}`).join(', ')}. Correctly ordered pairs $U = ${U}$ of $3 \times 3 = 9$, so AUC $= ${U}/9 \approx ${Math.round((U / 9) * 1000) / 1000}$.`,
      };
    },
  },
];
