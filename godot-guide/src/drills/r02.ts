import { md, type Drill } from '../content/types';

const xpToNext = (l: number, a: number, k: number) => Math.round(a * Math.pow(l, k));

export const DRILLS: Drill[] = [
  {
    id: 'r02-xp-to-next',
    module: 'r02',
    title: 'XP to the next level',
    skill: 'round(a · L^k)',
    gen: (rng) => {
      const a = rng.pick([20, 25, 30, 40, 50]);
      const k = rng.pick([1.5, 2]);
      const l = k === 2 ? rng.int(2, 12) : rng.pick([4, 9, 16, 25]);
      const v = xpToNext(l, a, k);
      return {
        prompt: md`$\text{xp}(L) = \operatorname{round}(${a}\,L^{${k}})$. XP from level ${l} to ${l + 1}?`,
        answer: { kind: 'number', value: v },
        solution: md`$${l}^{${k}} = ${Math.pow(l, k)}$, times ${a} is ${v}.`,
      };
    },
  },
  {
    id: 'r02-fights-per-level',
    module: 'r02',
    title: 'Fights per level',
    skill: 'ceil(xp(L) / XP per fight)',
    gen: (rng) => {
      const l = rng.int(2, 14);
      const need = xpToNext(l, 25, 1.5);
      const per = rng.pick([22, 42, 70, 30, 55]);
      const f = Math.ceil(need / per);
      return {
        prompt: md`Level ${l} needs ${need} XP to the next level. Each fight gives ${per} XP. How many fights does that level take?`,
        answer: { kind: 'number', value: f },
        solution: md`$${need} / ${per} = ${(need / per).toFixed(2)}$, so ${f} fights (round up: a partial fight still has to be fought).`,
      };
    },
  },
  {
    id: 'r02-battles-to-shard-level',
    module: 'r02',
    title: 'Battles to a shard level',
    skill: 'AP threshold / (AP per battle × growth)',
    gen: (rng) => {
      const th = rng.pick([150, 200, 300, 400, 500, 600, 900, 1200]);
      const ap = rng.pick([6, 9, 16, 19]);
      const g = rng.pick([1, 1, 2, 3]);
      const b = Math.ceil(th / (ap * g));
      return {
        prompt: md`A shard needs ${th} AP for its next level and has 0. Each battle gives ${ap} AP and the socket has ×${g} growth. Battles needed?`,
        answer: { kind: 'number', value: b },
        solution: md`${ap} × ${g} = ${ap * g} AP per battle; $${th} / ${ap * g} = ${(th / (ap * g)).toFixed(2)}$, so ${b} battles.`,
      };
    },
  },
  {
    id: 'r02-cone-test',
    module: 'r02',
    title: 'Inside the cone?',
    skill: 'normalized dot product against cos(half-angle)',
    gen: (rng) => {
      const x = rng.int(10, 60), y = rng.int(-40, 40);
      const deg = rng.pick([20, 30, 45, 60]);
      const len = Math.hypot(x, y);
      const dot = x / len;
      const inside = dot >= Math.cos((deg * Math.PI) / 180) && len <= 64;
      return {
        prompt: md`A cone from the origin aims along $(1, 0)$ with half-angle ${deg}° and length 64. Is the point $(${x}, ${y})$ inside? Answer 1 for yes, 0 for no.`,
        answer: { kind: 'number', value: inside ? 1 : 0 },
        solution: md`Length $${len.toFixed(2)}$ ${len <= 64 ? '≤' : '>'} 64. $\hat{\mathbf{v}}\cdot\hat{\mathbf{d}} = ${x}/${len.toFixed(2)} = ${dot.toFixed(3)}$ against $\cos ${deg}° = ${Math.cos((deg * Math.PI) / 180).toFixed(3)}$: ${inside ? 'inside' : 'outside'}.`,
      };
    },
  },
];
