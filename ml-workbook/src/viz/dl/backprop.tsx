import { useMemo, useState } from 'react';
import type { VizSpec } from '../../content/types';
import { LinePlot, Slider, Readout, FigureLayout, SegControl, usePlayer, MatGrid, TeX } from '../kit';
import { fmt, sig, sigmoid } from './util';
import './dl.css';

// ------------------------------------------------------------------ shared SVG node drawing

function GNode({ x, y, label, value, grad, active, r = 24, dim }: { x: number; y: number; label: string; value?: string; grad?: string; active?: boolean; r?: number; dim?: boolean }) {
  return (
    <g className={'dl-gnode' + (active ? ' on' : '') + (dim ? ' dim' : '')}>
      <circle cx={x} cy={y} r={r} />
      <text x={x} y={y - r - 7} textAnchor="middle" className="dl-gname">
        {label}
      </text>
      {value !== undefined && (
        <text x={x} y={y + 5} textAnchor="middle" className="dl-gval">
          {value}
        </text>
      )}
      {grad !== undefined && (
        <text x={x} y={y + r + 16} textAnchor="middle" className="dl-ggrad">
          {grad}
        </text>
      )}
    </g>
  );
}

function GEdge({ a, b, r = 24, active, back, label, glabel, t = 0.45, dim }: { a: [number, number]; b: [number, number]; r?: number; active?: boolean; back?: boolean; label?: string; glabel?: string; t?: number; dim?: boolean }) {
  const dx = b[0] - a[0], dy = b[1] - a[1];
  const L = Math.hypot(dx, dy) || 1;
  const ux = dx / L, uy = dy / L;
  const x1 = a[0] + ux * r, y1 = a[1] + uy * r, x2 = b[0] - ux * (r + 4), y2 = b[1] - uy * (r + 4);
  const mx = x1 + (x2 - x1) * t, my = y1 + (y2 - y1) * t;
  const head = back ? [x1, y1, -ux, -uy] : [x2, y2, ux, uy];
  const [hx, hy, hux, huy] = head;
  return (
    <g className={'dl-gedge' + (active ? (back ? ' back' : ' on') : '') + (dim ? ' dim' : '')}>
      <line x1={x1} y1={y1} x2={x2} y2={y2} />
      <polygon points={`${hx},${hy} ${hx - hux * 9 - huy * 4.5},${hy - huy * 9 + hux * 4.5} ${hx - hux * 9 + huy * 4.5},${hy - huy * 9 - hux * 4.5}`} />
      {label && (
        <text x={mx - uy * 11} y={my + ux * 11 + 4} textAnchor="middle" className="dl-elabel">
          {label}
        </text>
      )}
      {glabel && (
        <text x={mx + uy * 13} y={my - ux * 13 + 4} textAnchor="middle" className="dl-eglabel">
          {glabel}
        </text>
      )}
    </g>
  );
}

// ------------------------------------------------------------------ dl.chaingraph

type Op = 'in' | 'mul' | 'add' | 'sub' | 'sig' | 'halfsq';
interface GN {
  id: string;
  tex: string; // TeX name used in formulas
  name: string; // plain-text name drawn on the node
  op: Op;
  args: string[];
  pos: [number, number];
}
const GRAPHS: Record<string, { nodes: GN[]; inputs: Record<string, number>; out: string; title: string }> = {
  shared: {
    title: 'f = (xy + z)·x',
    out: 'f',
    inputs: { x: 2, y: -1, z: 3 },
    nodes: [
      { id: 'x', tex: 'x', name: 'x', op: 'in', args: [], pos: [50, 60] },
      { id: 'y', tex: 'y', name: 'y', op: 'in', args: [], pos: [50, 160] },
      { id: 'z', tex: 'z', name: 'z', op: 'in', args: [], pos: [50, 250] },
      { id: 'a', tex: 'a', name: 'a = x·y', op: 'mul', args: ['x', 'y'], pos: [190, 150] },
      { id: 'b', tex: 'b', name: 'b = a + z', op: 'add', args: ['a', 'z'], pos: [310, 200] },
      { id: 'f', tex: 'f', name: 'f = b·x', op: 'mul', args: ['b', 'x'], pos: [430, 110] },
    ],
  },
  neuron: {
    title: 'L = ½(σ(wx + b) − t)²',
    out: 'L',
    inputs: { w: 2, x: -1, b: 1, t: 1 },
    nodes: [
      { id: 'w', tex: 'w', name: 'w', op: 'in', args: [], pos: [40, 50] },
      { id: 'x', tex: 'x', name: 'x', op: 'in', args: [], pos: [40, 135] },
      { id: 'b', tex: 'b', name: 'b', op: 'in', args: [], pos: [40, 225] },
      { id: 'm', tex: 'm', name: 'm = w·x', op: 'mul', args: ['w', 'x'], pos: [140, 90] },
      { id: 'z', tex: 'z', name: 'z = m + b', op: 'add', args: ['m', 'b'], pos: [230, 160] },
      { id: 'a', tex: 'a', name: 'a = σ(z)', op: 'sig', args: ['z'], pos: [320, 110] },
      { id: 't', tex: 't', name: 't', op: 'in', args: [], pos: [320, 240] },
      { id: 'd', tex: 'd', name: 'd = a − t', op: 'sub', args: ['a', 't'], pos: [405, 170] },
      { id: 'L', tex: 'L', name: 'L = ½d²', op: 'halfsq', args: ['d'], pos: [470, 80] },
    ],
  },
};

function evalOp(op: Op, v: number[]): number {
  switch (op) {
    case 'mul':
      return v[0] * v[1];
    case 'add':
      return v[0] + v[1];
    case 'sub':
      return v[0] - v[1];
    case 'sig':
      return sigmoid(v[0]);
    case 'halfsq':
      return 0.5 * v[0] * v[0];
    default:
      return v[0];
  }
}
/** local derivative ∂node/∂arg_i, as a number and as a TeX expression */
function localGrad(n: GN, i: number, val: Record<string, number>): [number, string] {
  const a = n.args.map((k) => val[k]);
  switch (n.op) {
    case 'mul':
      return [a[1 - i], `${n.args[1 - i]}`];
    case 'add':
      return [1, '1'];
    case 'sub':
      return [i === 0 ? 1 : -1, i === 0 ? '1' : '-1'];
    case 'sig': {
      const s = val[n.id];
      return [s * (1 - s), `${n.tex}(1-${n.tex})`];
    }
    case 'halfsq':
      return [a[0], n.args[0]];
    default:
      return [1, '1'];
  }
}

const d4 = (x: number) => fmt(x, 4);
const par = (s: string) => (s.startsWith('-') ? `(${s})` : s);

/**
 * dl.chaingraph — forward then backward pass on a small computational graph, one edge per step.
 * A variable used twice (x in the 'shared' graph) collects the sum of its two gradient contributions.
 * params: graph ('shared'|'neuron'), inputs (object of input values)
 */
function ChainGraph({ spec }: { spec: VizSpec }) {
  const gname = (spec.graph as string) ?? 'shared';
  const G = GRAPHS[gname] ?? GRAPHS.shared;
  const [inp, setInp] = useState<Record<string, number>>({ ...G.inputs, ...((spec.inputs as Record<string, number>) ?? {}) });
  const { val, steps } = useMemo(() => {
    const val: Record<string, number> = {};
    type Step = { kind: 'fwd' | 'seed' | 'bwd'; node: string; arg?: string; argIdx?: number; tex: string; grads: Record<string, number>; done: Set<string>; edge?: [string, string] };
    const steps: Step[] = [];
    const done = new Set<string>();
    steps.push({ kind: 'fwd', node: '', tex: '\\text{Inputs are set. Forward pass: compute each node from its inputs.}', grads: {}, done: new Set(done) });
    for (const n of G.nodes) {
      if (n.op === 'in') {
        val[n.id] = inp[n.id];
        done.add(n.id);
      }
    }
    steps[0].done = new Set(done);
    for (const n of G.nodes) {
      if (n.op === 'in') continue;
      val[n.id] = evalOp(n.op, n.args.map((k) => val[k]));
      done.add(n.id);
      const opTex: Record<Op, string> = { mul: `${n.args[0]}\\cdot ${n.args[1]}`, add: `${n.args[0]} + ${n.args[1]}`, sub: `${n.args[0]} - ${n.args[1]}`, sig: `\\sigma(${n.args[0]})`, halfsq: `\\tfrac12 ${n.args[0]}^2`, in: '' };
      steps.push({ kind: 'fwd', node: n.id, tex: `${n.tex} = ${opTex[n.op]} = ${d4(val[n.id])}`, grads: {}, done: new Set(done) });
    }
    const grads: Record<string, number> = { [G.out]: 1 };
    const bdone = new Set<string>([G.out]);
    steps.push({ kind: 'seed', node: G.out, tex: `\\text{Backward pass. Seed: } \\pd{${G.out}}{${G.out}} = 1`, grads: { ...grads }, done: new Set(bdone) });
    const order = [...G.nodes].reverse().filter((n) => n.op !== 'in');
    for (const n of order) {
      n.args.forEach((k, i) => {
        const [lg, lgTex] = localGrad(n, i, val);
        const before = grads[k];
        const contrib = grads[n.id] * lg;
        grads[k] = (before ?? 0) + contrib;
        bdone.add(k);
        const up = `\\pd{${G.out}}{${n.tex}}`;
        const head = before === undefined ? `\\pd{${G.out}}{${k}} = ` : `\\pd{${G.out}}{${k}} \\mathrel{+}= `;
        const tail = before === undefined ? '' : `\\quad\\Rightarrow\\quad \\pd{${G.out}}{${k}} = ${d4(before)} + ${par(d4(contrib))} = ${d4(grads[k])}`;
        steps.push({
          kind: 'bwd',
          node: k,
          arg: k,
          argIdx: i,
          edge: [k, n.id],
          tex: `${head}${up}\\cdot\\pd{${n.tex}}{${k}} = ${d4(grads[n.id])}\\cdot ${par(d4(lg))} = ${d4(contrib)}${!['1', '-1'].includes(lgTex) ? `\\quad(\\textstyle\\pd{${n.tex}}{${k}} = ${lgTex})` : ''}${tail}`,
          grads: { ...grads },
          done: new Set(bdone),
        });
      });
    }
    return { val, steps };
  }, [G, inp]);
  const { i, controls } = usePlayer(steps.length, { interval: 1100 });
  const st = steps[Math.min(i, steps.length - 1)];
  const nodeById = Object.fromEntries(G.nodes.map((n) => [n.id, n]));
  const fwdDone = st.kind === 'fwd' ? st.done : new Set(G.nodes.map((n) => n.id));
  const shared = G.nodes.filter((n) => G.nodes.filter((m) => m.args.includes(n.id)).length > 1).map((n) => n.id);
  return (
    <FigureLayout
      side={
        <>
          <div className="small muted">{G.title}</div>
          {Object.keys(G.inputs).map((k) => (
            <Slider key={k} tex={k} value={inp[k]} min={-3} max={3} step={0.5} onChange={(v) => setInp({ ...inp, [k]: v })} />
          ))}
          <Readout
            title="final gradients"
            rows={Object.keys(G.inputs).map((k) => [`\\partial ${G.out}/\\partial ${k}`, st.kind !== 'fwd' && st.grads[k] !== undefined && st.done.has(k) ? d4(st.grads[k]) : '?'] as [string, string])}
          />
          {shared.length > 0 && (
            <div className="small">
              <TeX>{shared[0]}</TeX> feeds two nodes, so its gradient is the <b>sum</b> of the two paths.
            </div>
          )}
        </>
      }
      below={
        <div className="dl-full">
          {controls}
          <div className="dl-steptex">
            <TeX>{st.tex}</TeX>
          </div>
        </div>
      }
    >
      <svg viewBox="0 0 500 300" className="dl-graph" style={{ maxWidth: 500 }}>
        {G.nodes.flatMap((n) =>
          n.args.map((k) => {
            const a = nodeById[k].pos, b = n.pos;
            const isFwd = st.kind === 'fwd' && st.node === n.id;
            const isBwd = st.kind === 'bwd' && st.edge?.[0] === k && st.edge?.[1] === n.id;
            return <GEdge key={k + '>' + n.id} a={a} b={b} active={isFwd || isBwd} back={isBwd} dim={!fwdDone.has(n.id)} />;
          }),
        )}
        {G.nodes.map((n) => {
          const g = st.kind !== 'fwd' && st.done.has(n.id) ? st.grads[n.id] : undefined;
          return (
            <GNode
              key={n.id}
              x={n.pos[0]}
              y={n.pos[1]}
              label={n.name}
              value={fwdDone.has(n.id) ? d4(val[n.id]).replace(/^(-?\d+\.\d{2})\d+$/, '$1') : ''}
              grad={g !== undefined ? 'grad ' + fmt(g, 3) : undefined}
              active={st.node === n.id}
            />
          );
        })}
      </svg>
    </FigureLayout>
  );
}

// ------------------------------------------------------------------ dl.backprop

type HAct = 'relu' | 'sigmoid' | 'tanh';
const HA: Record<HAct, { f: (z: number) => number; d: (z: number) => number; name: string }> = {
  relu: { f: (z) => Math.max(0, z), d: (z) => (z > 0 ? 1 : 0), name: '\\relu' },
  sigmoid: { f: sigmoid, d: (z) => sigmoid(z) * (1 - sigmoid(z)), name: '\\sigma' },
  tanh: { f: Math.tanh, d: (z) => 1 - Math.tanh(z) ** 2, name: '\\tanh' },
};

/**
 * dl.backprop — a 2-2-1 network. Forward values node by node, then gradients flowing back edge by edge,
 * then one SGD step. Output is linear with squared error ½(ŷ − y)², or sigmoid with binary cross-entropy.
 * params: x [2], W1 [[2],[2]], b1 [2], W2 [2], b2, y, act ('relu'|'sigmoid'|'tanh'), loss ('mse'|'bce'), lr
 */
function Backprop({ spec }: { spec: VizSpec }) {
  const act = (spec.act as HAct) ?? 'relu';
  const lossK = (spec.loss as 'mse' | 'bce') ?? 'mse';
  const [lr, setLr] = useState((spec.lr as number) ?? 0.05);
  const [x, setX] = useState<number[]>((spec.x as number[]) ?? [1, 2]);
  const [y, setY] = useState((spec.y as number) ?? 4);
  const W1 = (spec.W1 as number[][]) ?? [[1, 1], [1, -1]];
  const b1 = (spec.b1 as number[]) ?? [0, 0];
  const W2 = (spec.W2 as number[]) ?? [2, -1];
  const b2 = (spec.b2 as number) ?? -1;
  const A = HA[act];
  const c = useMemo(() => {
    const z1 = [0, 1].map((j) => W1[j][0] * x[0] + W1[j][1] * x[1] + b1[j]);
    const h = z1.map(A.f);
    const z2 = W2[0] * h[0] + W2[1] * h[1] + b2;
    const yhat = lossK === 'bce' ? sigmoid(z2) : z2;
    const L = lossK === 'bce' ? -(y * Math.log(yhat) + (1 - y) * Math.log(1 - yhat)) : 0.5 * (yhat - y) ** 2;
    const d2 = yhat - y; // both cases: dL/dz2
    const gW2 = h.map((hj) => d2 * hj);
    const gh = W2.map((w) => w * d2);
    const d1 = gh.map((g, j) => g * A.d(z1[j]));
    const gW1 = d1.map((dj) => x.map((xk) => dj * xk));
    const gx = [0, 1].map((k) => d1[0] * W1[0][k] + d1[1] * W1[1][k]);
    const nW1 = W1.map((r, j) => r.map((w, k) => w - lr * gW1[j][k]));
    const nb1 = b1.map((b, j) => b - lr * d1[j]);
    const nW2 = W2.map((w, j) => w - lr * gW2[j]);
    const nb2 = b2 - lr * d2;
    const nz1 = [0, 1].map((j) => nW1[j][0] * x[0] + nW1[j][1] * x[1] + nb1[j]);
    const nh = nz1.map(A.f);
    const nz2 = nW2[0] * nh[0] + nW2[1] * nh[1] + nb2;
    const ny = lossK === 'bce' ? sigmoid(nz2) : nz2;
    const nL = lossK === 'bce' ? -(y * Math.log(ny) + (1 - y) * Math.log(1 - ny)) : 0.5 * (ny - y) ** 2;
    return { z1, h, z2, yhat, L, d2, gW2, gh, d1, gW1, gx, nW1, nb1, nW2, nb2, nL };
  }, [x, y, W1, b1, W2, b2, A, lossK, lr]);
  const f = (v: number) => fmt(v, 3);
  const out = lossK === 'bce' ? '\\hat y = \\sigma(z_2)' : '\\hat y = z_2';
  const lossTex = lossK === 'bce' ? 'L = -y\\ln\\hat y-(1-y)\\ln(1-\\hat y)' : 'L = \\tfrac12(\\hat y - y)^2';
  // the step list
  type S = { tex: string; fwd: number; g?: string[] };
  const steps: S[] = [
    { tex: `\\text{Input } \\bx = (${f(x[0])}, ${f(x[1])}),\\ \\text{target } y = ${f(y)}`, fwd: 0 },
    { tex: `z_{1,1} = ${f(W1[0][0])}\\cdot${f(x[0])} + ${f(W1[0][1])}\\cdot${f(x[1])} + ${f(b1[0])} = ${f(c.z1[0])},\\quad h_1 = ${A.name}(z_{1,1}) = ${f(c.h[0])}`, fwd: 1 },
    { tex: `z_{1,2} = ${f(W1[1][0])}\\cdot${f(x[0])} + ${f(W1[1][1])}\\cdot${f(x[1])} + ${f(b1[1])} = ${f(c.z1[1])},\\quad h_2 = ${A.name}(z_{1,2}) = ${f(c.h[1])}`, fwd: 2 },
    { tex: `z_2 = ${f(W2[0])}\\cdot${f(c.h[0])} + ${f(W2[1])}\\cdot${f(c.h[1])} + ${f(b2)} = ${f(c.z2)},\\quad ${out} = ${f(c.yhat)}`, fwd: 3 },
    { tex: `${lossTex} = ${f(c.L)}`, fwd: 4 },
    { tex: `\\delta_2 = \\pd{L}{z_2} = \\hat y - y = ${f(c.yhat)} - ${f(y)} = ${f(c.d2)}`, fwd: 5, g: ['d2'] },
    { tex: `\\pd{L}{w^{(2)}_1} = \\delta_2\\, h_1 = ${f(c.d2)}\\cdot${f(c.h[0])} = ${f(c.gW2[0])}`, fwd: 5, g: ['d2', 'gW2_0'] },
    { tex: `\\pd{L}{w^{(2)}_2} = \\delta_2\\, h_2 = ${f(c.d2)}\\cdot${f(c.h[1])} = ${f(c.gW2[1])}`, fwd: 5, g: ['d2', 'gW2_0', 'gW2_1'] },
    { tex: `\\pd{L}{h_1} = w^{(2)}_1\\,\\delta_2 = ${f(W2[0])}\\cdot${f(c.d2)} = ${f(c.gh[0])},\\quad \\pd{L}{h_2} = ${f(W2[1])}\\cdot${f(c.d2)} = ${f(c.gh[1])}`, fwd: 5, g: ['d2', 'gW2_0', 'gW2_1', 'gh'] },
    { tex: `\\delta_{1,j} = \\pd{L}{h_j}\\,${A.name}'(z_{1,j}):\\quad ${f(c.gh[0])}\\cdot${f(A.d(c.z1[0]))} = ${f(c.d1[0])},\\quad ${f(c.gh[1])}\\cdot${f(A.d(c.z1[1]))} = ${f(c.d1[1])}`, fwd: 5, g: ['d2', 'gW2_0', 'gW2_1', 'gh', 'd1'] },
    { tex: `\\pd{L}{W^{(1)}_{1k}} = \\delta_{1,1}\\,x_k:\\quad ${f(c.d1[0])}\\cdot(${f(x[0])}, ${f(x[1])}) = (${f(c.gW1[0][0])}, ${f(c.gW1[0][1])})`, fwd: 5, g: ['d2', 'gW2_0', 'gW2_1', 'gh', 'd1', 'gW1_0'] },
    { tex: `\\pd{L}{W^{(1)}_{2k}} = \\delta_{1,2}\\,x_k:\\quad ${f(c.d1[1])}\\cdot(${f(x[0])}, ${f(x[1])}) = (${f(c.gW1[1][0])}, ${f(c.gW1[1][1])})`, fwd: 5, g: ['d2', 'gW2_0', 'gW2_1', 'gh', 'd1', 'gW1_0', 'gW1_1'] },
    { tex: `\\text{SGD with } \\eta = ${lr}:\\ \\theta \\leftarrow \\theta - \\eta\\,\\nabla_\\theta L.\\ \\text{New loss } ${f(c.nL)} \\text{ (was } ${f(c.L)})`, fwd: 6, g: ['d2', 'gW2_0', 'gW2_1', 'gh', 'd1', 'gW1_0', 'gW1_1'] },
  ];
  const { i, controls } = usePlayer(steps.length, { interval: 1300 });
  const s = steps[i];
  const g = new Set(s.g ?? []);
  const P = { x1: [55, 60], x2: [55, 225], h1: [225, 60], h2: [225, 225], y: [375, 142], L: [470, 142] } as Record<string, [number, number]>;
  const upd = s.fwd === 6;
  const Wd = upd ? c.nW1 : W1;
  const W2d = upd ? c.nW2 : W2;
  return (
    <FigureLayout
      side={
        <>
          <Slider tex="x_1" value={x[0]} min={-2} max={2} step={0.5} onChange={(v) => setX([v, x[1]])} />
          <Slider tex="x_2" value={x[1]} min={-2} max={2} step={0.5} onChange={(v) => setX([x[0], v])} />
          <Slider tex="y" value={y} min={lossK === 'bce' ? 0 : -4} max={lossK === 'bce' ? 1 : 6} step={lossK === 'bce' ? 1 : 0.5} onChange={setY} />
          <SegControl label="η" value={lr} onChange={setLr} options={[0.01, 0.05, 0.1].map((v) => ({ v, label: String(v) }))} />
          <div className="small muted">
            hidden <TeX>{A.name}</TeX>, {lossK === 'bce' ? 'sigmoid output, cross-entropy' : 'linear output, squared error'}
          </div>
          <MatGrid m={g.has('gW1_0') ? [c.gW1[0], g.has('gW1_1') ? c.gW1[1] : [NaN, NaN]] : [[NaN, NaN], [NaN, NaN]]} caption={<TeX>{'\\partial L/\\partial W^{(1)} = \\boldsymbol\\delta_1\\bx\\T'}</TeX>} />
          <MatGrid m={[g.has('gW2_0') ? [c.gW2[0], g.has('gW2_1') ? c.gW2[1] : NaN] : [NaN, NaN]]} caption={<TeX>{'\\partial L/\\partial W^{(2)} = \\delta_2\\,\\bh\\T'}</TeX>} />
        </>
      }
      below={
        <div className="dl-full">
          {controls}
          <div className="dl-steptex">
            <TeX>{s.tex}</TeX>
          </div>
        </div>
      }
    >
      <svg viewBox="0 0 510 290" className="dl-graph" style={{ maxWidth: 510 }}>
        {(['x1', 'x2'] as const).flatMap((xi, k) =>
          (['h1', 'h2'] as const).map((hj, j) => (
            <GEdge
              key={xi + hj}
              a={P[xi]}
              b={P[hj]}
              t={j === k ? 0.45 : 0.2}
              label={'w=' + fmt(Wd[j][k], 2)}
              glabel={g.has('gW1_' + j) ? 'g=' + fmt(c.gW1[j][k], 2) : undefined}
              active={(s.fwd === j + 1 && i > 0 && i < 4) || (i === 10 + j)}
              back={i === 10 + j}
            />
          )),
        )}
        {(['h1', 'h2'] as const).map((hj, j) => (
          <GEdge key={hj} a={P[hj]} b={P.y} t={0.4} label={'w=' + fmt(W2d[j], 2)} glabel={g.has('gW2_' + j) ? 'g=' + fmt(c.gW2[j], 2) : undefined} active={s.fwd === 3 || i === 6 + j || i === 8} back={i === 6 + j || i === 8} />
        ))}
        <GEdge a={P.y} b={P.L} active={s.fwd === 4 || i === 5} back={i === 5} />
        <GNode x={P.x1[0]} y={P.x1[1]} label="x₁" value={fmt(x[0], 2)} />
        <GNode x={P.x2[0]} y={P.x2[1]} label="x₂" value={fmt(x[1], 2)} />
        <GNode x={P.h1[0]} y={P.h1[1]} label={'h₁   (z=' + (s.fwd >= 1 ? fmt(c.z1[0], 2) : '?') + ')'} value={s.fwd >= 1 ? fmt(c.h[0], 2) : ''} grad={g.has('d1') ? 'δ=' + fmt(c.d1[0], 2) : g.has('gh') ? '∂h=' + fmt(c.gh[0], 2) : undefined} active={s.fwd === 1 && i === 1} dim={s.fwd < 1} />
        <GNode x={P.h2[0]} y={P.h2[1]} label={'h₂   (z=' + (s.fwd >= 2 ? fmt(c.z1[1], 2) : '?') + ')'} value={s.fwd >= 2 ? fmt(c.h[1], 2) : ''} grad={g.has('d1') ? 'δ=' + fmt(c.d1[1], 2) : g.has('gh') ? '∂h=' + fmt(c.gh[1], 2) : undefined} active={i === 2} dim={s.fwd < 2} />
        <GNode x={P.y[0]} y={P.y[1]} label="ŷ" value={s.fwd >= 3 ? fmt(c.yhat, 2) : ''} grad={g.has('d2') ? 'δ₂=' + fmt(c.d2, 2) : undefined} active={i === 3 || i === 5} dim={s.fwd < 3} />
        <GNode x={P.L[0]} y={P.L[1]} label="L" value={s.fwd >= 4 ? fmt(upd ? c.nL : c.L, 3) : ''} active={i === 4 || upd} dim={s.fwd < 4} r={22} />
        <text x={8} y={284} className="dl-legend-t">
          black: forward values and weights · red: gradients
        </text>
      </svg>
    </FigureLayout>
  );
}

// ------------------------------------------------------------------ dl.gradcheck

const GC_F: Record<string, { f: (x: number) => number; d: (x: number) => number; x: number; tex: string }> = {
  exp: { f: Math.exp, d: Math.exp, x: 1, tex: 'f(x) = e^x,\\ x = 1' },
  sin: { f: Math.sin, d: Math.cos, x: 1, tex: 'f(x) = \\sin x,\\ x = 1' },
  cube: { f: (x) => x * x * x, d: (x) => 3 * x * x, x: 2, tex: 'f(x) = x^3,\\ x = 2' },
};

/**
 * dl.gradcheck — finite-difference error versus step size ε on log–log axes, computed in float64.
 * Forward difference error ~ ε (truncation) + u/ε (rounding); central difference ~ ε² + u/ε.
 * params: fn ('exp'|'sin'|'cube'), logEps (initial log10 ε)
 */
function GradCheck({ spec }: { spec: VizSpec }) {
  const [fn, setFn] = useState((spec.fn as string) ?? 'exp');
  const [le, setLe] = useState((spec.logEps as number) ?? -4);
  const F = GC_F[fn] ?? GC_F.exp;
  const exact = F.d(F.x);
  const err = (e: number, central: boolean) => {
    const est = central ? (F.f(F.x + e) - F.f(F.x - e)) / (2 * e) : (F.f(F.x + e) - F.f(F.x)) / e;
    return { est, rel: Math.abs(est - exact) / Math.abs(exact) };
  };
  const curves = useMemo(() => {
    const fw: [number, number][] = [], ce: [number, number][] = [];
    for (let k = 0; k <= 220; k++) {
      const le = -13 + (12 * k) / 220;
      const e = 10 ** le;
      fw.push([le, Math.log10(Math.max(1e-17, err(e, false).rel))]);
      ce.push([le, Math.log10(Math.max(1e-17, err(e, true).rel))]);
    }
    return { fw, ce };
  }, [fn]); // eslint-disable-line react-hooks/exhaustive-deps
  const eps = 10 ** le;
  const a = err(eps, false), b = err(eps, true);
  return (
    <FigureLayout
      side={
        <>
          <SegControl value={fn} onChange={setFn} options={[{ v: 'exp', label: 'eˣ' }, { v: 'sin', label: 'sin x' }, { v: 'cube', label: 'x³' }]} />
          <Slider tex="\log_{10}\varepsilon" value={le} min={-12} max={-1} step={0.25} onChange={setLe} />
          <Readout
            rows={[
              [F.tex, ''],
              ["f'(x)\\ \\text{exact}", fmt(exact, 10)],
              ['\\text{forward}', fmt(a.est, 10)],
              ['\\text{central}', fmt(b.est, 10)],
              ['\\text{rel. err fwd}', sig(a.rel, 2)],
              ['\\text{rel. err central}', sig(b.rel, 2)],
            ]}
          />
          <div className="small">
            Right side of each V: truncation error, slope 1 (forward) or 2 (central). Left side: floating-point cancellation, growing like <TeX>{'u/\\varepsilon'}</TeX> with <TeX>{'u\\approx 1.1\\times10^{-16}'}</TeX>.
          </div>
        </>
      }
    >
      <LinePlot
        series={[
          { pts: curves.fw, color: 'var(--c-v)', label: 'forward (f(x+ε) − f(x)) / ε' },
          { pts: curves.ce, color: 'var(--c-u)', label: 'central (f(x+ε) − f(x−ε)) / 2ε' },
        ]}
        x={[-13, -1]}
        y={[-17, 0]}
        height={300}
        xlabel="log₁₀ ε"
        ylabel="log₁₀ relative error"
        vlines={[{ x: le, color: 'var(--accent)' }]}
      />
    </FigureLayout>
  );
}

export const backpropViz = {
  'dl.chaingraph': {
    component: ChainGraph,
    validate: (s: VizSpec) => (s.graph === undefined || s.graph === 'shared' || s.graph === 'neuron' ? null : "graph must be 'shared' or 'neuron'"),
    doc: "Forward/backward stepper on a small computational graph. params graph ('shared' f=(xy+z)x | 'neuron' L=½(σ(wx+b)−t)²), inputs",
  },
  'dl.backprop': {
    component: Backprop,
    validate: (s: VizSpec) => (s.W1 !== undefined && !(Array.isArray(s.W1) && (s.W1 as unknown[]).length === 2) ? 'W1 must be 2×2' : null),
    doc: "2-2-1 network backprop stepper with an SGD step. params x, W1, b1, W2, b2, y, act ('relu'|'sigmoid'|'tanh'), loss ('mse'|'bce'), lr",
  },
  'dl.gradcheck': {
    component: GradCheck,
    validate: (s: VizSpec) => (s.fn === undefined || ['exp', 'sin', 'cube'].includes(s.fn as string) ? null : 'unknown fn'),
    doc: "Finite-difference error vs ε (forward and central). params fn ('exp'|'sin'|'cube'), logEps",
  },
};

