import { md, type Drill } from '../content/types';

export const DRILLS: Drill[] = [
  {
    id: 'r04-typewriter-time',
    module: 'r04',
    title: 'Typewriter time',
    skill: 'T = n/c + k p for a dialogue line',
    gen: (rng) => {
      const n = rng.pick([48, 60, 72, 84, 90, 96, 120, 144]);
      const c = rng.pick([20, 24, 30, 40, 48, 60]);
      const k = rng.int(0, 5);
      const p = rng.pick([0.05, 0.1, 0.12, 0.15, 0.2, 0.25]);
      const T = n / c + k * p;
      return {
        prompt: md`A dialogue line has ${n} characters, ${k} of them pause characters such as \`.\` or \`,\` (none at the very end). The box types ${c} characters per second and pauses ${p} s after each pause character. How many seconds until the line is fully typed?`,
        answer: { kind: 'number', value: T },
        solution: md`$T = n/c + k\,p = ${n}/${c} + ${k} \times ${p} = ${(n / c).toFixed(3)} + ${(k * p).toFixed(2)} = ${T.toFixed(3)}$ s.`,
      };
    },
  },
  {
    id: 'r04-visible-ratio',
    module: 'r04',
    title: 'Visible characters after t seconds',
    skill: 'visible_characters = int(c · t), visible_ratio = visible / n',
    gen: (rng) => {
      const c = rng.pick([20, 25, 30, 40, 50]);
      const n = rng.pick([60, 80, 100, 120, 150]);
      const t = rng.pick([0.4, 0.6, 0.8, 1.0, 1.2, 1.5, 2.0]);
      const vis = Math.min(n, Math.floor(c * t + 1e-9));
      const ratio = vis / n;
      return {
        prompt: md`A ${n}-character line with no pause characters types at ${c} characters per second. After ${t} s, what are \`visible_characters\` and \`visible_ratio\`? Enter both, the count first.`,
        answer: { kind: 'vector', value: [vis, ratio], tol: 1e-3 },
        inputHint: 'e.g. 24, 0.3',
        solution: md`\`_progress\` $= ${c} \times ${t} = ${(c * t).toFixed(2)}$, so \`visible_characters\` $= ${vis}$ (the integer part, capped at ${n}) and \`visible_ratio\` $= ${vis}/${n} = ${ratio.toFixed(4)}$.`,
      };
    },
  },
  {
    id: 'r04-layer-bits',
    module: 'r04',
    title: 'Collision layers to a mask',
    skill: 'sum of 2^(layer − 1) over the layers a body detects',
    gen: (rng) => {
      const names = ['world', 'player', 'party', 'enemy', 'player_hitbox', 'enemy_hitbox', 'interactable', 'pickup'];
      const count = rng.int(1, 3);
      const layers = rng.shuffle([1, 2, 3, 4, 5, 6, 7, 8]).slice(0, count).sort((a, b) => a - b);
      const mask = layers.reduce((s, l) => s + 2 ** (l - 1), 0);
      return {
        prompt: md`An \`Area2D\` must detect layers ${layers.map((l) => `${l} (\`${names[l - 1]}\`)`).join(', ')}. What integer is its \`collision_mask\`?`,
        answer: { kind: 'number', value: mask },
        solution: md`Layer $n$ is bit $n-1$, value $2^{n-1}$: ${layers.map((l) => `$2^{${l - 1}} = ${2 ** (l - 1)}$`).join(', ')}. The sum is ${mask}.`,
      };
    },
  },
  {
    id: 'r04-eased-pan',
    module: 'r04',
    title: 'Peak speed of an eased camera pan',
    skill: 'smoothstep peak speed = 1.5 d / T',
    gen: (rng) => {
      const d = rng.pick([60, 90, 120, 160, 200, 240]);
      const T = rng.pick([0.8, 1, 1.2, 1.5, 2, 2.5]);
      const v = (1.5 * d) / T;
      return {
        prompt: md`A cutscene camera pans ${d} px in ${T} s with a smoothstep (ease-in-out) curve. What is its peak speed in px/s?`,
        answer: { kind: 'number', value: v },
        solution: md`Average speed is $${d}/${T} = ${(d / T).toFixed(2)}$ px/s. Smoothstep's slope peaks at $\tfrac32$ in the middle, so $v_{\text{peak}} = 1.5 \times ${(d / T).toFixed(2)} = ${v.toFixed(2)}$ px/s.`,
      };
    },
  },
];
