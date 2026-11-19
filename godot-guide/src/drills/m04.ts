import { md, type Drill } from '../content/types';

const LAYERS = ['world', 'player', 'party', 'enemy', 'player_hitbox', 'enemy_hitbox', 'interactable', 'pickup'];

export const DRILLS: Drill[] = [
  {
    id: 'm04-mask-encode',
    module: 'm04',
    title: 'Layers to a mask integer',
    skill: 'collision-mask bits',
    gen: (rng) => {
      const k = rng.int(2, 3);
      const picks = rng.shuffle([1, 2, 3, 4, 5, 6, 7, 8]).slice(0, k).sort((a, b) => a - b);
      const value = picks.reduce((a, n) => a + 2 ** (n - 1), 0);
      return {
        prompt: md`A node scans the layers ${picks.map((n) => `\`${LAYERS[n - 1]}\` (${n})`).join(', ')}. What integer is its \`collision_mask\`?`,
        answer: { kind: 'number', value },
        solution: md`Layer $n$ is worth $2^{n-1}$: ${picks.map((n) => `$2^{${n - 1}} = ${2 ** (n - 1)}$`).join(', ')}. Sum: ${value}.`,
      };
    },
  },
  {
    id: 'm04-mask-decode',
    module: 'm04',
    title: 'A mask integer to layers',
    skill: 'collision-mask bits',
    gen: (rng) => {
      const k = rng.int(2, 3);
      const picks = rng.shuffle([1, 2, 3, 4, 5, 6, 7, 8]).slice(0, k).sort((a, b) => a - b);
      const value = picks.reduce((a, n) => a + 2 ** (n - 1), 0);
      const desc = [...picks].reverse();
      return {
        prompt: md`\`collision_mask = ${value}\`. Which layer numbers (1 to 8) does it scan? Enter them as a list.`,
        answer: { kind: 'set', value: picks },
        inputHint: 'e.g. 1, 4',
        solution: md`Take out the largest powers of two: $${value} = ${desc.map((n) => 2 ** (n - 1)).join(' + ')}$, which are bits ${desc.map((n) => n - 1).join(', ')}, so layers ${picks.join(', ')} (${picks.map((n) => `\`${LAYERS[n - 1]}\``).join(', ')}).`,
      };
    },
  },
  {
    id: 'm04-bounce',
    module: 'm04',
    title: 'Bounce a velocity off a wall',
    skill: 'reflection v - 2(v·n)n',
    gen: (rng) => {
      const normals: [number, number][] = [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ];
      const n = rng.pick(normals);
      // a velocity moving into the surface: negative component along n
      let vx = rng.nz(-12, 12) * 10;
      let vy = rng.nz(-12, 12) * 10;
      if (vx * n[0] + vy * n[1] > 0) {
        if (n[0]) vx = -vx;
        else vy = -vy;
      }
      const d = vx * n[0] + vy * n[1];
      const out = [vx - 2 * d * n[0], vy - 2 * d * n[1]];
      return {
        prompt: md`A shard with $\mathbf{v} = (${vx}, ${vy})$ px/s hits a wall with normal $\mathbf{n} = (${n[0]}, ${n[1]})$. Velocity after a mirror bounce?`,
        answer: { kind: 'vector', value: out },
        inputHint: 'e.g. 30, -40',
        solution: md`$\mathbf{v}\cdot\mathbf{n} = ${d}$. $\mathbf{v} - 2(${d})\mathbf{n} = (${out[0]}, ${out[1]})$: the component along the normal flips sign, the other is unchanged.`,
      };
    },
  },
  {
    id: 'm04-aabb-overlap',
    module: 'm04',
    title: 'Overlap of two boxes',
    skill: 'AABB overlap depth',
    gen: (rng) => {
      const ax = rng.int(0, 10) * 4, ay = rng.int(0, 10) * 4, aw = rng.int(3, 8) * 4, ah = rng.int(3, 8) * 4;
      const ox = rng.int(1, aw / 4 - 1) * 4, oy = rng.int(1, ah / 4 - 1) * 4;
      const bw = rng.int(3, 8) * 4, bh = rng.int(3, 8) * 4;
      const bx = ax + aw - ox, by = ay + ah - oy;
      const dx = Math.min(ax + aw, bx + bw) - Math.max(ax, bx);
      const dy = Math.min(ay + ah, by + bh) - Math.max(ay, by);
      return {
        prompt: md`\`Rect2(${ax}, ${ay}, ${aw}, ${ah})\` and \`Rect2(${bx}, ${by}, ${bw}, ${bh})\`. Overlap on x and on y, in px?`,
        answer: { kind: 'vector', value: [dx, dy] },
        inputHint: 'x, y',
        solution: md`x: $\min(${ax + aw}, ${bx + bw}) - \max(${ax}, ${bx}) = ${dx}$. y: $\min(${ay + ah}, ${by + bh}) - \max(${ay}, ${by}) = ${dy}$. The shortest push-out is along ${dx <= dy ? 'x' : 'y'}.`,
      };
    },
  },
];
