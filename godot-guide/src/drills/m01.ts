import { md, type Drill } from '../content/types';

const TRIPLES: [number, number, number][] = [[3, 4, 5], [5, 12, 13], [8, 15, 17], [7, 24, 25], [6, 8, 10], [9, 12, 15], [12, 16, 20]];
const r3 = (x: number) => Math.round(x * 1000) / 1000;
const p = (x: number) => (x < 0 ? `(${x})` : String(x));
const FACINGS: { v: [number, number]; name: string }[] = [
  { v: [1, 0], name: 'right' },
  { v: [-1, 0], name: 'left' },
  { v: [0, 1], name: 'down the screen' },
  { v: [0, -1], name: 'up the screen' },
];

export const DRILLS: Drill[] = [
  {
    id: 'm01-length-normalize',
    module: 'm01',
    title: 'Length and normalize',
    skill: 'Pythagoras for the length, then divide each component by it.',
    gen: (r) => {
      const [a, b, c] = r.pick(TRIPLES);
      const swap = r.next() < 0.5;
      const k = r.pick([1, 2, 3]);
      const x = (swap ? b : a) * k * r.pick([1, -1]), y = (swap ? a : b) * k * r.pick([1, -1]);
      const L = c * k;
      return {
        prompt: md`Compute \`Vector2(${x}, ${y}).length()\` and \`.normalized()\`. Enter [length, x, y].`,
        answer: { kind: 'vector', value: [L, x / L, y / L] },
        inputHint: 'length, nx, ny',
        solution: md`$\sqrt{${p(x)}^2 + ${p(y)}^2} = \sqrt{${x * x + y * y}} = ${L}$. Normalized: $(${x}/${L},\ ${y}/${L}) = (${r3(x / L)}, ${r3(y / L)})$.`,
      };
    },
  },
  {
    id: 'm01-cone-test',
    module: 'm01',
    title: 'Vision cone test',
    skill: 'Normalize the displacement, dot it with the facing, compare with cos(half angle).',
    gen: (r) => {
      const f = r.pick(FACINGS);
      const [a, b, c] = r.pick(TRIPLES.slice(0, 4));
      const k = r.pick([2, 3, 4]);
      const d: [number, number] = r.next() < 0.5 ? [a * k * r.pick([1, -1]), b * k * r.pick([1, -1])] : [b * k * r.pick([1, -1]), a * k * r.pick([1, -1])];
      const L = c * k;
      const cone = r.pick([60, 90, 120, 150]);
      const dt = (f.v[0] * d[0] + f.v[1] * d[1]) / L;
      const th = Math.cos(((cone / 2) * Math.PI) / 180);
      const yes = dt >= th;
      return {
        prompt: md`A guard faces ${f.name}, \`facing = Vector2(${f.v[0]}, ${f.v[1]})\`. Kai is at displacement $(${d[0]}, ${d[1]})$ from it. Is Kai inside a ${cone}° vision cone (ignore range)? Answer yes or no.`,
        answer: { kind: 'text', value: yes ? ['yes', 'y'] : ['no', 'n'] },
        inputHint: 'yes / no',
        solution: md`$|\mathbf{d}| = ${L}$, so $\hat{\mathbf{f}}\cdot\hat{\mathbf{d}} = ${f.v[0] * d[0] + f.v[1] * d[1]}/${L} = ${r3(dt)}$. The threshold is $\cos ${cone / 2}° \approx ${r3(th)}$, so **${yes ? 'yes' : 'no'}**.`,
      };
    },
  },
  {
    id: 'm01-cross-side',
    module: 'm01',
    title: 'Left or right?',
    skill: "Sign of facing.cross(to_target): positive is clockwise on screen, the character's right (Godot's y points down).",
    gen: (r) => {
      const f = r.pick(FACINGS);
      let d: [number, number] = [0, 0];
      let c = 0;
      while (c === 0) {
        d = [r.nz(-6, 6) * 4, r.nz(-6, 6) * 4];
        c = f.v[0] * d[1] - f.v[1] * d[0];
      }
      const side = c > 0 ? 'right' : 'left';
      return {
        prompt: md`A character faces ${f.name}, \`facing = Vector2(${f.v[0]}, ${f.v[1]})\`. A target is at displacement $(${d[0]}, ${d[1]})$ (Godot coordinates, y down). Is it on the character's left or right?`,
        answer: { kind: 'text', value: [side] },
        inputHint: 'left / right',
        solution: md`$f_x d_y - f_y d_x = ${p(f.v[0])}\cdot${p(d[1])} - ${p(f.v[1])}\cdot${p(d[0])} = ${c}$. ${c > 0 ? 'Positive: clockwise on screen, the right-hand side.' : 'Negative: counter-clockwise on screen, the left-hand side.'}`,
      };
    },
  },
  {
    id: 'm01-transform-point',
    module: 'm01',
    title: 'Local to global',
    skill: 'global = p.x × x_axis + p.y × y_axis + origin.',
    gen: (r) => {
      const rot = r.pick([0, 90, 180, -90]);
      const cs = Math.round(Math.cos((rot * Math.PI) / 180)), sn = Math.round(Math.sin((rot * Math.PI) / 180));
      const o: [number, number] = [r.int(2, 20) * 5, r.int(2, 16) * 5];
      const l: [number, number] = [r.int(-4, 4) * 4, r.int(-4, 4) * 2];
      const x: [number, number] = [cs, sn], y: [number, number] = [-sn, cs];
      const g: [number, number] = [l[0] * x[0] + l[1] * y[0] + o[0], l[0] * x[1] + l[1] * y[1] + o[1]];
      return {
        prompt: md`A node has \`global_position = Vector2(${o[0]}, ${o[1]})\` and \`global_rotation_degrees = ${rot}\`, scale 1. Where is its local point $(${l[0]}, ${l[1]})$ in global coordinates?`,
        answer: { kind: 'vector', value: g },
        inputHint: 'x, y',
        solution: md`Axes: $\mathbf{x} = (${x[0]}, ${x[1]})$, $\mathbf{y} = (${y[0]}, ${y[1]})$. $${p(l[0])}\mathbf{x} + ${p(l[1])}\mathbf{y} + (${o[0]}, ${o[1]}) = (${g[0]}, ${g[1]})$.`,
      };
    },
  },
];
