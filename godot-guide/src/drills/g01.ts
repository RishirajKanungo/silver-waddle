import { md, type Drill } from '../content/types';

const LAYERS = ['world', 'player', 'party', 'enemy', 'player_hitbox', 'enemy_hitbox', 'interactable', 'pickup'];
const WINDOWS: [number, number][] = [
  [1280, 720], [1366, 768], [1440, 900], [1536, 864], [1600, 900], [1680, 1050], [1920, 1080], [1920, 1200],
  [2560, 1080], [2560, 1440], [2560, 1600], [3440, 1440], [3840, 2160], [1280, 800], [1024, 768], [800, 600],
];

export const DRILLS: Drill[] = [
  {
    id: 'g01-integer-scale',
    module: 'g01',
    title: 'Integer scale and black bars',
    skill: 'Take the floor of the smaller ratio, then split the leftover pixels between the two bars.',
    gen: (r) => {
      const [W, H] = r.pick(WINDOWS);
      const s = Math.max(1, Math.floor(Math.min(W / 320, H / 180)));
      const bx = (W - 320 * s) / 2, by = (H - 180 * s) / 2;
      return {
        prompt: md`A 320×180 game runs in a ${W}×${H} window with integer scaling. Give the scale, the width of one side bar and the height of one top bar.`,
        answer: { kind: 'vector', value: [s, bx, by] },
        inputHint: 'scale, side bar, top bar',
        solution: md`$\min(${W}/320,\ ${H}/180) = \min(${(W / 320).toFixed(3)}, ${(H / 180).toFixed(3)})$, floor $s = ${s}$. The image is ${320 * s}×${180 * s}: side bars $(${W} - ${320 * s})/2 = ${bx}$, top bars $(${H} - ${180 * s})/2 = ${by}$.`,
      };
    },
  },
  {
    id: 'g01-mask-bits',
    module: 'g01',
    title: 'Collision layer integers',
    skill: 'Layer n is worth 2^(n-1); add the values of the chosen layers.',
    gen: (r) => {
      const k = r.int(1, 3);
      const chosen = r.shuffle([1, 2, 3, 4, 5, 6, 7, 8]).slice(0, k).sort((a, b) => a - b);
      const v = chosen.reduce((s, n) => s + 2 ** (n - 1), 0);
      return {
        prompt: md`What integer does Godot store for a mask with the layers ${chosen.map((n) => `\`${LAYERS[n - 1]}\` (${n})`).join(', ')}?`,
        answer: { kind: 'number', value: v },
        solution: md`${chosen.map((n) => `$2^{${n - 1}} = ${2 ** (n - 1)}$`).join(', ')}; the sum is ${v} (binary \`${v.toString(2).padStart(8, '0')}\`).`,
      };
    },
  },
  {
    id: 'g01-frames-ms',
    module: 'g01',
    title: 'Frames and milliseconds',
    skill: 'One frame at f Hz lasts 1000/f ms.',
    gen: (r) => {
      const hz = r.pick([60, 60, 60, 30, 120, 144]);
      if (r.next() < 0.5) {
        const n = r.int(2, 30);
        return {
          prompt: md`How many milliseconds are ${n} frames at ${hz} Hz?`,
          answer: { kind: 'number', value: (n * 1000) / hz },
          solution: md`$${n} \times 1000/${hz} = ${((n * 1000) / hz).toFixed(2)}$ ms.`,
        };
      }
      const ms = r.pick([50, 100, 150, 200, 250, 300, 400, 500]);
      const f = Math.ceil((ms * hz) / 1000 - 1e-9);
      return {
        prompt: md`A window must last at least ${ms} ms. How many whole frames is that at ${hz} Hz (round up)?`,
        answer: { kind: 'number', value: f },
        solution: md`$${ms}/1000 \times ${hz} = ${((ms * hz) / 1000).toFixed(2)}$, rounded up: ${f} frames.`,
      };
    },
  },
  {
    id: 'g01-per-frame-speed',
    module: 'g01',
    title: 'Speed without delta',
    skill: 'A fixed step of k px per frame moves k × fps px per second; with delta the speed is the same at any fps.',
    gen: (r) => {
      const k = r.pick([1, 1.5, 2, 3, 4]);
      const fps = r.pick([30, 60, 75, 120, 144, 165, 240]);
      return {
        prompt: md`A script does \`position.x += ${k}\` in \`_process\`. How fast (px/s) does the node move at ${fps} fps, and what \`speed\` would \`position.x += speed * delta\` need to match it at 60 fps?`,
        answer: { kind: 'vector', value: [k * fps, k * 60] },
        inputHint: 'px/s at that fps, speed',
        solution: md`$${k} \times ${fps} = ${k * fps}$ px/s. At 60 fps the step means $${k} \times 60 = ${k * 60}$ px/s, so \`speed = ${k * 60}\`.`,
      };
    },
  },
];
