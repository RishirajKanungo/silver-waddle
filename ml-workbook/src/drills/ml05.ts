import { md, type Drill } from '../content/types';

const num = (x: number, d = 4) => String(Math.round(x * 10 ** d) / 10 ** d);

export const DRILLS: Drill[] = [
  {
    id: 'ml-knn-vote',
    module: 'ml05',
    title: 'The k-NN vote',
    skill: 'Rank points by distance to the query and count the labels of the k nearest.',
    gen: (r) => {
      let pts: { p: [number, number]; y: number; d2: number }[] = [];
      for (;;) {
        pts = Array.from({ length: 6 }, () => {
          const p: [number, number] = [r.int(-4, 4), r.int(-4, 4)];
          return { p, y: r.int(0, 1), d2: p[0] * p[0] + p[1] * p[1] };
        });
        const ds = pts.map((q) => q.d2);
        if (new Set(ds).size === 6 && !ds.includes(0)) break;
      }
      const k = r.pick([3, 5]);
      const sorted = [...pts].sort((a, b) => a.d2 - b.d2);
      const votes = sorted.slice(0, k).reduce((s, q) => s + q.y, 0);
      const pred = votes > k / 2 ? 1 : 0;
      return {
        prompt: md`Query at the origin. Labelled points: ${pts.map((q) => `$(${q.p.join(', ')})$ class ${q.y}`).join('; ')}. With Euclidean distance and $k = ${k}$, enter the number of class-1 votes and the predicted class.`,
        answer: { kind: 'vector', value: [votes, pred] },
        inputHint: 'votes, class',
        solution: md`Squared distances (enough for ranking): ${sorted.map((q) => `$(${q.p.join(', ')})$: ${q.d2}`).join(', ')}. The ${k} nearest have labels $${sorted.slice(0, k).map((q) => q.y).join(', ')}$: ${votes} vote${votes === 1 ? '' : 's'} for class 1, so predict class ${pred}.`,
      };
    },
  },
  {
    id: 'ml-kmeans-step',
    module: 'ml05',
    title: 'One k-means iteration in 1-D',
    skill: 'Assign each point to the nearest centre, then move each centre to the mean of its points.',
    gen: (r) => {
      for (;;) {
        const xs = Array.from({ length: 6 }, () => r.int(0, 20)).sort((a, b) => a - b);
        const c = [r.int(0, 10), r.int(8, 20)];
        if (c[0] === c[1]) continue;
        const tie = xs.some((x) => Math.abs(x - c[0]) === Math.abs(x - c[1]));
        if (tie) continue;
        const lab = xs.map((x) => (Math.abs(x - c[0]) < Math.abs(x - c[1]) ? 0 : 1));
        if (!lab.includes(0) || !lab.includes(1)) continue;
        const nc = [0, 1].map((j) => {
          const m = xs.filter((_, i) => lab[i] === j);
          return m.reduce((s, x) => s + x, 0) / m.length;
        });
        return {
          prompt: md`1-D points $${xs.join(', ')}$ and centres $\mu_1 = ${c[0]}$, $\mu_2 = ${c[1]}$. Do one assign step and one update step of k-means. Enter the new $\mu_1, \mu_2$.`,
          answer: { kind: 'vector', value: nc, tol: 1e-3 },
          inputHint: 'two numbers',
          solution: md`Nearest centre: cluster 1 gets $\{${xs.filter((_, i) => lab[i] === 0).join(', ')}\}$, cluster 2 gets $\{${xs.filter((_, i) => lab[i] === 1).join(', ')}\}$. New centres are the means: $\mu_1 = ${num(nc[0])}$, $\mu_2 = ${num(nc[1])}$.`,
        };
      }
    },
  },
  {
    id: 'ml-silhouette',
    module: 'ml05',
    title: 'Silhouette of a point',
    skill: 'a = mean distance within the cluster, b = smallest mean distance to another cluster, s = (b − a)/max(a, b).',
    gen: (r) => {
      const own = Array.from({ length: r.pick([2, 3]) }, () => r.int(1, 6));
      const B = [r.int(1, 9), r.int(1, 9)], C = [r.int(1, 9), r.int(1, 9)];
      const mean = (a: number[]) => a.reduce((s, x) => s + x, 0) / a.length;
      const a = mean(own), b = Math.min(mean(B), mean(C));
      const s = (b - a) / Math.max(a, b);
      return {
        prompt: md`A point's distances to the other members of its own cluster are $${own.join(', ')}$. Its distances to the members of cluster B are $${B.join(', ')}$, and to cluster C are $${C.join(', ')}$. Compute its silhouette value.`,
        answer: { kind: 'number', value: s, tol: 1e-3 },
        solution: md`$a = ${num(a)}$. Mean distances: to B $${num(mean(B))}$, to C $${num(mean(C))}$, so $b = ${num(b)}$. $s = (b - a)/\max(a, b) = (${num(b)} - ${num(a)})/${num(Math.max(a, b))} = ${num(s)}$.${s < 0 ? ' Negative: the point is closer to another cluster than to its own.' : ''}`,
      };
    },
  },
];
