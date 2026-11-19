import { md, type Drill } from '../content/types';

const sci = (x: number, d = 3) => {
  const e = Math.floor(Math.log10(x));
  const k = 10 ** (d - 1);
  const m = Math.round((x / 10 ** e) * k) / k;
  return `${m}\\times 10^{${e}}`;
};
const grp = (x: number) => x.toLocaleString('en-US').replace(/,/g, '{,}');

export const DRILLS: Drill[] = [
  {
    id: 'llm-ppl',
    module: 'llm02',
    title: 'Loss and perplexity',
    skill: 'Convert between next-token loss in nats and perplexity.',
    gen: (r) => {
      if (r.next() < 0.5) {
        const k = r.int(2, 64);
        const L = Math.round(Math.log(k) * 1000) / 1000;
        return {
          prompt: md`A model's mean next-token loss is ${L} nats. What is its perplexity?`,
          answer: { kind: 'number', value: Math.exp(L), tol: 2e-3 },
          solution: md`$\operatorname{PPL} = e^{${L}} \approx ${Math.exp(L).toFixed(2)}$: as uncertain as a uniform choice among about ${k} tokens.`,
        };
      }
      const ppl = r.pick([2, 4, 5, 8, 10, 12, 16, 20, 32, 50, 100]);
      return {
        prompt: md`A model has perplexity ${ppl}. What is its mean next-token loss in nats? (Enter 3 decimals or an expression like \`ln(${ppl})\`.)`,
        answer: { kind: 'number', value: Math.log(ppl), tol: 1e-3 },
        solution: md`$\mathcal L = \ln ${ppl} \approx ${Math.log(ppl).toFixed(3)}$ nats, or $\log_2 ${ppl} \approx ${Math.log2(ppl).toFixed(3)}$ bits.`,
      };
    },
  },
  {
    id: 'llm-chinchilla',
    module: 'llm02',
    title: 'Compute-optimal model size',
    skill: 'Solve C = 6ND with D = 20N for N.',
    gen: (r) => {
      const N = r.pick([1, 2, 5, 10, 30, 70, 100]) * 1e9;
      const C = 120 * N * N;
      return {
        prompt: md`A training budget is $C = ${sci(C)}$ FLOPs. Using $C \approx 6ND$ and 20 tokens per parameter, what is the compute-optimal parameter count $N^*$?`,
        answer: { kind: 'number', value: N, tol: 2e-3 },
        inputHint: 'e.g. 7e9',
        solution: md`$C = 6N\cdot 20N = 120N^2$, so $N^* = \sqrt{C/120} = \sqrt{${sci(C / 120)}} = ${sci(N)}$, trained on $D^* = 20N^* = ${sci(20 * N)}$ tokens.`,
      };
    },
  },
  {
    id: 'llm-lora',
    module: 'llm02',
    title: 'LoRA parameter count',
    skill: 'Count r(d + k) and compare it with dk.',
    gen: (r) => {
      const d = r.pick([1024, 2048, 4096, 8192]);
      const k = r.pick([1024, 2048, 4096, 8192, 14336]);
      const rank = r.pick([4, 8, 16, 32, 64]);
      const lora = rank * (d + k);
      return {
        prompt: md`LoRA with rank $r = ${rank}$ is applied to a $${d}\times ${k}$ weight matrix. How many trainable parameters does the adapter have?`,
        answer: { kind: 'number', value: lora },
        solution: md`$r(d + k) = ${rank}\cdot ${d + k} = ${grp(lora)}$, against $dk = ${grp(d * k)}$ for the full matrix: ${((100 * lora) / (d * k)).toFixed(2)}%.`,
      };
    },
  },
  {
    id: 'llm-zero',
    module: 'llm02',
    title: 'Training memory per GPU',
    skill: 'Apply 16 bytes per parameter and the ZeRO sharding rules.',
    gen: (r) => {
      const N = r.pick([1, 3, 7, 13, 30, 70]);
      const G = r.pick([4, 8, 16, 32, 64]);
      const st = r.int(0, 3);
      const w = st >= 3 ? (2 * N) / G : 2 * N;
      const g = st >= 2 ? (2 * N) / G : 2 * N;
      const o = st >= 1 ? (12 * N) / G : 12 * N;
      const tot = w + g + o;
      const name = ['plain data parallelism', 'ZeRO-1', 'ZeRO-2', 'ZeRO-3'][st];
      return {
        prompt: md`A ${N}B-parameter model is trained with mixed-precision Adam on ${G} GPUs using ${name}. How many GB per GPU do weights, gradients and optimizer states take (ignore activations)?`,
        answer: { kind: 'number', value: tot, tol: 1e-3 },
        inputHint: 'GB',
        solution: md`Weights ${st >= 3 ? `$2N/G$` : `$2N$`} $= ${+w.toFixed(4)}$, gradients ${st >= 2 ? `$2N/G$` : `$2N$`} $= ${+g.toFixed(4)}$, Adam states ${st >= 1 ? `$12N/G$` : `$12N$`} $= ${+o.toFixed(4)}$. Total ${+tot.toFixed(4)} GB.`,
      };
    },
  },
];
