import { md, type Drill } from '../content/types';

export const DRILLS: Drill[] = [
  {
    id: 'r06-playtime-format',
    module: 'r06',
    title: 'Play time on a save slot',
    skill: 'seconds to h:mm:ss with integer division and mod',
    gen: (rng) => {
      const s = rng.int(30, 40000) + rng.pick([0, 0.4, 0.9]);
      const t = Math.floor(s);
      const h = Math.floor(t / 3600), m = Math.floor(t / 60) % 60, sec = t % 60;
      const out = `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
      return {
        prompt: md`A save's \`playtime\` is ${s} seconds. What does \`"%d:%02d:%02d" % [s / 3600, (s / 60) % 60, s % 60]\` show, with \`s = int(playtime)\`?`,
        answer: { kind: 'text', value: [out] },
        inputHint: 'h:mm:ss',
        solution: md`$s = ${t}$. Hours $\lfloor ${t}/3600 \rfloor = ${h}$; minutes $\lfloor ${t}/60 \rfloor \bmod 60 = ${m}$; seconds $${t} \bmod 60 = ${sec}$. Result: \`${out}\`.`,
      };
    },
  },
  {
    id: 'r06-autosave-gap',
    module: 'r06',
    title: 'Autosave gap',
    skill: 'g = r · ceil(I / r); saves per hour = 3600 / g',
    gen: (rng) => {
      const r = rng.pick([20, 25, 30, 35, 40, 45, 50, 60]);
      const I = rng.pick([45, 60, 90, 120]);
      const g = r * Math.ceil(I / r - 1e-9);
      return {
        prompt: md`Rooms change every ${r} s of play time and room autosaves are throttled to at most one per ${I} s. Enter the gap between autosaves in seconds, then the number of autosaves per hour.`,
        answer: { kind: 'vector', value: [g, 3600 / g], tol: 1e-3 },
        inputHint: 'gap, per hour',
        solution: md`Saves happen at the first room change at least ${I} s after the last one: $g = ${r} \lceil ${I}/${r} \rceil = ${r} \times ${Math.ceil(I / r - 1e-9)} = ${g}$ s, so $3600/${g} = ${(3600 / g).toFixed(2)}$ per hour.`,
      };
    },
  },
  {
    id: 'r06-migration-steps',
    module: 'r06',
    title: 'Migrations in the chain',
    skill: 'a save at version a loaded by version b runs b − a migrations',
    gen: (rng) => {
      const b = rng.int(3, 9);
      const a = rng.int(1, b - 1);
      const names = Array.from({ length: b - a }, (_, i) => `_v${a + i}_to_v${a + i + 1}`);
      return {
        prompt: md`The game's save format is at version ${b}. A player loads a version-${a} save. How many migration functions run?`,
        answer: { kind: 'number', value: b - a },
        solution: md`One step per version: ${names.map((n) => `\`${n}\``).join(', ')}. That is $${b} - ${a} = ${b - a}$.`,
      };
    },
  },
];
