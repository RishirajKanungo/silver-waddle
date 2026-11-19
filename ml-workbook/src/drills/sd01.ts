import { md, type Drill } from '../content/types';

const comma = (x: number) => Math.round(x).toLocaleString('en-US').replace(/,/g, '{,}');
const r3 = (x: number) => Math.round(x * 1000) / 1000;

export const DRILLS: Drill[] = [
  {
    id: 'sd-qps',
    module: 'sd01',
    title: 'Peak QPS from daily users',
    skill: 'Turn daily active users and requests per user into average and peak requests per second.',
    gen: (r) => {
      const dau = r.pick([10, 20, 40, 50, 100, 200, 300]); // millions
      const per = r.pick([5, 8, 10, 20, 30, 50]);
      const peak = r.pick([2, 3]);
      const avg = (dau * 1e6 * per) / 86400;
      const val = avg * peak;
      return {
        prompt: md`A service has ${dau} million daily active users, each making ${per} requests a day. Peak traffic is ${peak} times the daily average. Estimate the peak requests per second, using 86,400 seconds per day. Answers within 2% are accepted.`,
        answer: { kind: 'number', value: val, tol: 0.02 },
        inputHint: 'a number, e.g. 23000',
        solution: md`Requests per day: $${dau}\times10^6 \times ${per} = ${comma(dau * 1e6 * per)}$. Average: $${comma(dau * 1e6 * per)} \div 86{,}400 \approx ${comma(avg)}$ per second. Peak: $${comma(avg)} \times ${peak} \approx ${comma(val)}$ QPS. A quick check: $86{,}400 \approx 10^5$, so the average is roughly $${comma((dau * 1e6 * per) / 1e5)}$, about 14% low.`,
      };
    },
  },
  {
    id: 'sd-embmem',
    module: 'sd01',
    title: 'Embedding table size',
    skill: 'Items × dimension × bytes per number, converted to GB.',
    gen: (r) => {
      const n = r.pick([1, 5, 10, 20, 50, 100, 200, 500]); // millions
      const d = r.pick([64, 128, 256, 512, 768]);
      const [dt, bytes] = r.pick([['float32', 4], ['float16', 2], ['int8', 1]] as [string, number][]);
      const gb = (n * 1e6 * d * bytes) / 1e9;
      return {
        prompt: md`Store ${n} million ${d}-dimensional embeddings in ${dt}. How many GB ($10^9$ bytes) is that?`,
        answer: { kind: 'number', value: gb },
        solution: md`$${n}\times10^6 \times ${d} \times ${bytes}\ \text{bytes} = ${comma(n * 1e6 * d * bytes)}$ bytes $= ${r3(gb)}$ GB. ${dt} uses ${bytes} byte${bytes > 1 ? 's' : ''} per number.`,
      };
    },
  },
  {
    id: 'sd-prk',
    module: 'sd01',
    title: 'Precision@k and recall@k',
    skill: 'Count relevant results in the top k, then divide by k and by the total number of relevant items.',
    gen: (r) => {
      const L = 8;
      const rel: number[] = Array.from({ length: L }, () => (r.next() < 0.4 ? 1 : 0));
      if (!rel.some((x) => x)) rel[r.int(0, L - 1)] = 1;
      const inList = rel.reduce((s, x) => s + x, 0);
      const R = inList + r.int(0, 3);
      const k = r.pick([3, 5]);
      const hits = rel.slice(0, k).reduce((s, x) => s + x, 0);
      return {
        prompt: md`A system returns 8 results. Their relevance, in rank order, is $(${rel.join(', ')})$, where 1 means relevant. The collection contains ${R} relevant items in total. Enter $[\text{precision@}${k}, \text{recall@}${k}]$.`,
        answer: { kind: 'vector', value: [hits / k, hits / R] },
        inputHint: 'two numbers, fractions allowed',
        solution: md`The top ${k} are $(${rel.slice(0, k).join(', ')})$, containing ${hits} relevant item${hits === 1 ? '' : 's'}. Precision@${k} $= ${hits}/${k} = ${r3(hits / k)}$. Recall@${k} $= ${hits}/${R} = ${r3(hits / R)}$: the denominator is all relevant items, not only those returned.`,
      };
    },
  },
  {
    id: 'sd-ndcg',
    module: 'sd01',
    title: 'NDCG on a short list',
    skill: 'Gains 2^r − 1, discounts 1/log2(i+1), and normalization by the ideal ordering.',
    gen: (r) => {
      const L = r.pick([3, 3, 4]);
      let rels = Array.from({ length: L }, () => r.int(0, 3));
      if (!rels.some((x) => x)) rels[0] = 1;
      // avoid an already-ideal list most of the time
      const ideal = [...rels].sort((a, b) => b - a);
      if (ideal.every((x, i) => x === rels[i]) && r.next() < 0.8) rels = [...ideal].reverse();
      const disc = [1, 1 / Math.log2(3), 0.5, 1 / Math.log2(5)];
      const g = (x: number) => 2 ** x - 1;
      const dcg = rels.reduce((s, x, i) => s + g(x) * disc[i], 0);
      const idcg = [...rels].sort((a, b) => b - a).reduce((s, x, i) => s + g(x) * disc[i], 0);
      const terms = (xs: number[]) => xs.map((x, i) => `${g(x)}(${r3(disc[i])})`).join(' + ');
      return {
        prompt: md`Results with relevance grades $(${rels.join(', ')})$ in rank order. Compute NDCG@${L} with gain $2^r - 1$. Discounts $1/\log_2(i+1)$ for $i = 1, 2, 3, 4$: $1,\ 0.631,\ 0.5,\ 0.431$.`,
        answer: { kind: 'number', value: dcg / idcg, tol: 3e-3 },
        solution: md`Gains: $(${rels.map(g).join(', ')})$. DCG $= ${terms(rels)} = ${r3(dcg)}$. Ideal order $(${[...rels].sort((a, b) => b - a).join(', ')})$: IDCG $= ${terms([...rels].sort((a, b) => b - a))} = ${r3(idcg)}$. NDCG $= ${r3(dcg)}/${r3(idcg)} = ${r3(dcg / idcg)}$.`,
      };
    },
  },
];
