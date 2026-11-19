import { md, type Drill } from '../content/types';
import type { Rng } from '../math/rng';

interface T {
  name: string;
  kids: T[];
}
const NAMES = ['World', 'HUD', 'Party', 'Enemies', 'Props', 'Kai', 'Lyra', 'Slime', 'Bat', 'Chest', 'Label', 'Sword'];

function tree(r: Rng): T {
  const names = r.shuffle(NAMES);
  let k = 0;
  const make = (depth: number): T => {
    const n: T = { name: names[k++], kids: [] };
    const want = depth === 0 ? 3 : depth === 1 ? r.int(0, 2) : r.int(0, 1);
    for (let i = 0; i < want && k < names.length && depth < 3; i++) n.kids.push(make(depth + 1));
    return n;
  };
  const root: T = { name: 'Main', kids: [] };
  for (let i = 0; i < 2; i++) root.kids.push(make(1));
  return root;
}
const post = (n: T): string[] => [...n.kids.flatMap(post), n.name];
const pre = (n: T): string[] => [n.name, ...n.kids.flatMap(pre)];
function chain(n: T, target: string, acc: string[] = []): string[] | null {
  const here = [...acc, n.name];
  if (n.name === target) return here;
  for (const c of n.kids) {
    const r = chain(c, target, here);
    if (r) return r;
  }
  return null;
}
function show(n: T, depth = 0): string {
  return '    '.repeat(depth) + n.name + '\n' + n.kids.map((c) => show(c, depth + 1)).join('');
}

export const DRILLS: Drill[] = [
  {
    id: 'g03-ready-order',
    module: 'g03',
    title: 'Ready and enter-tree order',
    skill: '_enter_tree is parents first (pre-order); _ready is children first (post-order).',
    gen: (r) => {
      const t = tree(r);
      const all = pre(t);
      const target = r.pick(all.slice(1));
      const e = pre(t).indexOf(target) + 1, rd = post(t).indexOf(target) + 1;
      return {
        prompt: md`In this tree (indentation shows children, siblings in order), in which position does \`${target}\` run \`_enter_tree\`, and in which \`_ready\`? Count from 1.

\`\`\`text
${show(t)}\`\`\``,
        answer: { kind: 'vector', value: [e, rd] },
        inputHint: 'enter position, ready position',
        solution: md`Enter-tree order (pre-order): ${pre(t).join(', ')}, so ${e}. Ready order (post-order): ${post(t).join(', ')}, so ${rd}.`,
      };
    },
  },
  {
    id: 'g03-relative-path',
    module: 'g03',
    title: 'Relative node paths',
    skill: 'Go up with .. to the common ancestor, then down by names.',
    gen: (r) => {
      const t = tree(r);
      const names = pre(t).slice(1);
      let a = r.pick(names), b = r.pick(names);
      while (b === a) b = r.pick(names);
      const ca = chain(t, a)!, cb = chain(t, b)!;
      let i = 0;
      while (i < ca.length && i < cb.length && ca[i] === cb[i]) i++;
      const path = [...Array(ca.length - i).fill('..'), ...cb.slice(i)].join('/');
      return {
        prompt: md`In this tree, write the relative node path from \`${a}\` to \`${b}\`.

\`\`\`text
${show(t)}\`\`\``,
        answer: { kind: 'text', value: [path, './' + path] },
        inputHint: 'e.g. ../HUD/Label',
        solution: md`\`${a}\` is at /root/${ca.join('/')}, \`${b}\` at /root/${cb.join('/')}. The common ancestor is \`${ca[i - 1]}\`: up ${ca.length - i} time(s), then down: \`${path}\`.`,
      };
    },
  },
  {
    id: 'g03-pause-timer',
    module: 'g03',
    title: 'Timers and pausing',
    skill: 'create_timer(t) keeps counting during a pause; create_timer(t, false) stops while paused.',
    gen: (r) => {
      const t = r.pick([1, 1.5, 2, 3, 4]);
      const start = r.pick([0.2, 0.5, 0.8]);
      const dur = r.pick([2, 5, 10]);
      const always = r.next() < 0.5;
      const fire = always || start >= t ? t : t + dur;
      return {
        prompt: md`At t = 0 a script awaits \`get_tree().create_timer(${t}${always ? '' : ', false'}).timeout\`. At t = ${start} s the game is paused for ${dur} s. At what time (s) does the timer fire?`,
        answer: { kind: 'number', value: fire },
        solution: always
          ? md`With the default \`process_always = true\` the timer ignores the pause and fires at ${t} s.`
          : md`With \`false\` it stops counting for the ${dur} s pause: $${t} + ${dur} = ${t + dur}$ s.`,
      };
    },
  },
];
