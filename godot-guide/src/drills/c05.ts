import { md, type Drill } from '../content/types';

export const DRILLS: Drill[] = [
  {
    id: 'c05-flag-combos',
    module: 'c05',
    title: 'Flags versus states',
    skill: 'counting state combinations',
    gen: (rng) => {
      const n = rng.int(3, 7);
      const all = 2 ** n, designed = n + 1;
      return {
        prompt: md`A character script has ${n} boolean action flags, and the design allows at most one action at a time. How many flag combinations exist, and how many of them are undesigned? Enter both.`,
        answer: { kind: 'vector', value: [all, all - designed] },
        inputHint: 'all, undesigned',
        solution: md`$2^{${n}} = ${all}$ combinations. Designed: none set, or exactly one of ${n}: $${designed}$. Undesigned: $${all} - ${designed} = ${all - designed}$.`,
      };
    },
  },
  {
    id: 'c05-mask-bits',
    module: 'c05',
    title: 'Collision layers to a mask value',
    skill: 'collision-mask bits',
    gen: (rng) => {
      const names = ['world', 'player', 'party', 'enemy', 'player_hitbox', 'enemy_hitbox', 'interactable', 'pickup'];
      const k = rng.int(1, 3);
      const layers = rng.shuffle([1, 2, 3, 4, 5, 6, 7, 8]).slice(0, k).sort((a, b) => a - b);
      const value = layers.reduce((s, l) => s + 2 ** (l - 1), 0);
      return {
        prompt: md`What integer is a \`collision_mask\` that contains ${layers.map((l) => `layer ${l} (\`${names[l - 1]}\`)`).join(', ')}?`,
        answer: { kind: 'number', value },
        solution: md`Layer $k$ is bit $k-1$, value $2^{k-1}$: ${layers.map((l) => `$2^{${l - 1}} = ${2 ** (l - 1)}$`).join(', ')}. Sum: ${value}.`,
      };
    },
  },
  {
    id: 'c05-buffer-age',
    module: 'c05',
    title: 'Is the buffered press still alive?',
    skill: 'input buffer in ticks',
    gen: (rng) => {
      const buffer = rng.pick([0.1, 0.12, 0.15, 0.2]);
      const B = Math.round(buffer * 60);
      const p = rng.int(1, 12), c = p + rng.int(1, 14);
      const age = c - p;
      return {
        prompt: md`\`buffer_time = ${buffer}\` s. Attack is pressed on tick ${p}; the first state that reads \`wants_attack\` runs on tick ${c}. How old is the press in ticks, and is it still honoured (1 = yes, 0 = no)? Enter both.`,
        answer: { kind: 'vector', value: [age, age <= B ? 1 : 0] },
        inputHint: 'age, 1 or 0',
        solution: md`Age $= ${c} - ${p} = ${age}$ ticks. The buffer is $${buffer} \times 60 = ${B}$ ticks, so the press is ${age <= B ? 'honoured' : 'expired'}.`,
      };
    },
  },
];
