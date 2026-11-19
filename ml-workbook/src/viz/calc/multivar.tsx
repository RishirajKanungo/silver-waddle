// calc01 figures: partial derivatives, gradients, Jacobians, computational graphs, Hessians, Taylor.
import { useMemo, useState } from 'react';
import type { VizSpec } from '../../content/types';
import { Plane, Arrow, Handle, Point, Seg, InfLine, Path, Poly, Contours, Heat, Curve, LinePlot, Slider, Readout, FigureLayout, SegControl, Toggle, TeX, usePlayer, type P2 } from '../kit';
import { eigSym } from '../../math/linalg';
import { fx, ff, tmat, check, isNum, isPair, clamp } from './util';
import './calc.css';

// ------------------------------------------------------------------ functions of two variables

export interface Fn2 {
  tex: string;
  gradTex: string;
  f: (x: number, y: number) => number;
  g: (x: number, y: number) => P2;
  /** drawing scale for the gradient arrow */
  scale: number;
}
export const FN2: Record<string, Fn2> = {
  quad: { tex: 'x^2 + 2y^2', gradTex: '(2x,\\ 4y)', f: (x, y) => x * x + 2 * y * y, g: (x, y) => [2 * x, 4 * y], scale: 0.25 },
  saddle: { tex: 'x^2 - y^2', gradTex: '(2x,\\ -2y)', f: (x, y) => x * x - y * y, g: (x, y) => [2 * x, -2 * y], scale: 0.3 },
  wave: { tex: '\\sin x\\,\\cos y', gradTex: '(\\cos x\\cos y,\\ -\\sin x\\sin y)', f: (x, y) => Math.sin(x) * Math.cos(y), g: (x, y) => [Math.cos(x) * Math.cos(y), -Math.sin(x) * Math.sin(y)], scale: 1 },
  poly: { tex: 'x^2y + 3y', gradTex: '(2xy,\\ x^2 + 3)', f: (x, y) => x * x * y + 3 * y, g: (x, y) => [2 * x * y, x * x + 3], scale: 0.18 },
};
const FN2_KEYS = Object.keys(FN2);
const fnOptions = (keys: string[]) => keys.map((k) => ({ v: k, label: <TeX>{FN2[k].tex}</TeX> }));

/** contour levels: quantile-spaced, symmetric for sign-changing functions */
function levelsFor(f: (x: number, y: number) => number, R: number, k = 12): number[] {
  const vals: number[] = [];
  for (let i = 0; i <= 40; i++) for (let j = 0; j <= 40; j++) vals.push(f(-R + (2 * R * j) / 40, -R + (2 * R * i) / 40));
  vals.sort((a, b) => a - b);
  const q = (t: number) => vals[Math.floor(t * (vals.length - 1))];
  return Array.from({ length: k }, (_, i) => q((i + 0.5) / k));
}

/**
 * calc.gradient — contour plot, draggable point p, the gradient arrow, a unit direction u (angle slider),
 * the directional derivative, and the linear (tangent-plane) prediction of f at p + h u.
 * params: fn ('quad'|'saddle'|'wave'|'poly'), p, theta (degrees), h, lockFn
 */
function Gradient({ spec }: { spec: VizSpec }) {
  const [fk, setFk] = useState((spec.fn as string) ?? 'quad');
  const [p, setP] = useState<P2>((spec.p as P2) ?? [1.5, 1]);
  const [th, setTh] = useState((spec.theta as number) ?? 120);
  const [h, setH] = useState((spec.h as number) ?? 0.5);
  const [showLevel, setShowLevel] = useState(true);
  const F = FN2[fk];
  const R = 3;
  const levels = useMemo(() => levelsFor(F.f, R), [F]);
  const fp = F.f(p[0], p[1]);
  const g = F.g(p[0], p[1]);
  const gn = Math.hypot(g[0], g[1]);
  const rad = (th * Math.PI) / 180;
  const u: P2 = [Math.cos(rad), Math.sin(rad)];
  const Du = g[0] * u[0] + g[1] * u[1];
  const q: P2 = [p[0] + h * u[0], p[1] + h * u[1]];
  const lin = fp + h * Du;
  const tru = F.f(q[0], q[1]);
  const thg = ((Math.atan2(g[1], g[0]) * 180) / Math.PI + 360) % 360;
  const dAng = Math.abs((((th - thg) % 360) + 540) % 360 - 180);
  const curve = useMemo(() => Array.from({ length: 121 }, (_, i) => [i * 3, gn * Math.cos(((i * 3 - thg) * Math.PI) / 180)] as [number, number]), [gn, thg]);
  let msg: React.ReactNode;
  if (gn < 1e-6) msg = <>The gradient is zero here: a <b>critical point</b>. Every directional derivative is 0.</>;
  else if (dAng < 4) msg = <><b>u points along the gradient.</b> This is the steepest ascent: <TeX>{'D_{\\mathbf{u}}f = \\lVert\\nabla f\\rVert'}</TeX>.</>;
  else if (Math.abs(dAng - 180) < 4) msg = <><b>u points against the gradient:</b> steepest descent, <TeX>{'D_{\\mathbf{u}}f = -\\lVert\\nabla f\\rVert'}</TeX>.</>;
  else if (Math.abs(dAng - 90) < 4) msg = <><b>u is tangent to the level set.</b> Moving along it does not change f to first order: <TeX>{'D_{\\mathbf{u}}f = 0'}</TeX>.</>;
  else msg = <>The angle between u and the gradient is {fx(dAng, 0)}°, so <TeX>{`D_{\\mathbf{u}}f = \\lVert\\nabla f\\rVert\\cos(${fx(dAng, 0)}^\\circ)`}</TeX>.</>;
  return (
    <FigureLayout
      side={
        <>
          {!spec.lockFn && <SegControl value={fk} onChange={setFk} options={fnOptions(FN2_KEYS)} />}
          <Slider label="direction θ" value={th} min={0} max={359} step={1} onChange={setTh} fmt={(v) => `${v}°`} />
          <Slider tex="h" value={h} min={0} max={1.5} step={0.05} onChange={setH} />
          <Readout
            rows={[
              ['f(x,y)', '$' + F.tex],
              ['\\mathbf{p}', `(${ff(p[0])}, ${ff(p[1])})`],
              ['\\nabla f(\\mathbf{p})', `(${ff(g[0])}, ${ff(g[1])})`],
              ['\\lVert\\nabla f\\rVert', ff(gn)],
              ['D_{\\mathbf{u}}f = \\nabla f\\cdot\\mathbf{u}', ff(Du)],
              ['f(\\mathbf{p})', ff(fp, 3)],
              ['f(\\mathbf{p}) + h\\,D_{\\mathbf{u}}f', ff(lin, 3)],
              ['f(\\mathbf{p}+h\\mathbf{u})', ff(tru, 3)],
            ]}
          />
          <div className="calc-msg">{msg}</div>
          <Toggle label="level set through p" value={showLevel} onChange={setShowLevel} />
          <div className="calc-note">Drag p. The gradient arrow is drawn at {F.scale}× its length; u has length 1.</div>
        </>
      }
      below={
        <div className="calc-stack">
          <div className="calc-plotk">directional derivative as a function of the direction θ</div>
          <LinePlot series={[{ pts: curve, color: 'var(--c-v)' }]} x={[0, 360]} y={[-Math.max(gn, 0.5) * 1.1, Math.max(gn, 0.5) * 1.1]} width={520} height={150} xlabel="θ (degrees)" hlines={[{ y: 0 }]}>
            {(sx, sy) => (
              <>
                {gn > 1e-6 && <line x1={sx(thg)} x2={sx(thg)} y1={sy(-gn * 1.1)} y2={sy(gn * 1.1)} style={{ stroke: 'var(--c-u)', strokeWidth: 2 }} />}
                <circle cx={sx(th)} cy={sy(Du)} r={5} style={{ fill: 'var(--c-v)' }} />
              </>
            )}
          </LinePlot>
        </div>
      }
    >
      <Plane x={[-R, R]} y={[-R, R]} width={440}>
        <Contours f={F.f} levels={levels} />
        {showLevel && <Contours f={F.f} levels={[fp]} color="var(--accent)" width={2.2} n={90} />}
        {gn > 1e-6 && <InfLine p={p} d={[-g[1], g[0]]} color="var(--accent)" dashed opacity={0.5} />}
        <Seg a={p} b={q} color="var(--c-v)" width={1.5} dashed />
        {gn > 1e-6 && <Arrow from={p} to={[p[0] + F.scale * g[0], p[1] + F.scale * g[1]]} color="var(--c-u)" tex="\nabla f" labelAt={0.75} />}
        <Arrow from={p} to={[p[0] + u[0], p[1] + u[1]]} color="var(--c-v)" tex="\mathbf{u}" labelAt={0.8} width={2.2} />
        <Point at={q} r={4} color="var(--c-v)" hollow />
        <Handle at={p} onChange={setP} color="var(--fg)" snap={0.25} tex="\mathbf{p}" />
      </Plane>
    </FigureLayout>
  );
}

/**
 * calc.partials — a partial derivative is the slope of a one-variable slice.
 * Left: contours with the horizontal and vertical lines through p. Below: the two slices with tangent lines.
 * params: fn, p, lockFn
 */
function Partials({ spec }: { spec: VizSpec }) {
  const [fk, setFk] = useState((spec.fn as string) ?? 'poly');
  const [p, setP] = useState<P2>((spec.p as P2) ?? [1, 0.5]);
  const F = FN2[fk];
  const R = 3;
  const levels = useMemo(() => levelsFor(F.f, R), [F]);
  const [gx, gy] = F.g(p[0], p[1]);
  const fp = F.f(p[0], p[1]);
  const N = 120;
  const sliceX = Array.from({ length: N + 1 }, (_, i) => { const t = -R + (2 * R * i) / N; return [t, F.f(t, p[1])] as [number, number]; });
  const sliceY = Array.from({ length: N + 1 }, (_, i) => { const t = -R + (2 * R * i) / N; return [t, F.f(p[0], t)] as [number, number]; });
  const tanX: [number, number][] = [[p[0] - 1, fp - gx], [p[0] + 1, fp + gx]];
  const tanY: [number, number][] = [[p[1] - 1, fp - gy], [p[1] + 1, fp + gy]];
  return (
    <FigureLayout
      side={
        <>
          {!spec.lockFn && <SegControl value={fk} onChange={setFk} options={fnOptions(FN2_KEYS)} />}
          <Readout
            rows={[
              ['f(x,y)', '$' + F.tex],
              ['\\mathbf{p} = (x_0, y_0)', `(${ff(p[0])}, ${ff(p[1])})`],
              ['f(\\mathbf{p})', ff(fp, 3)],
              ['\\partial f/\\partial x\\,(\\mathbf{p})', ff(gx, 3)],
              ['\\partial f/\\partial y\\,(\\mathbf{p})', ff(gy, 3)],
              ['\\nabla f', '$' + F.gradTex],
            ]}
          />
          <div className="calc-note">
            Blue: hold <TeX>y = y_0</TeX> fixed and vary <TeX>x</TeX>. Orange: hold <TeX>x = x_0</TeX> fixed and vary <TeX>y</TeX>. Each partial derivative is the slope of the dashed tangent in its slice.
          </div>
        </>
      }
      below={
        <div className="calc-twin">
          <div>
            <span className="calc-twin-k">slice f(x, y₀), slope ∂f/∂x = {ff(gx)}</span>
            <LinePlot series={[{ pts: sliceX, color: 'var(--c-u)' }, { pts: tanX, color: 'var(--c-u)', dashed: true, width: 1.5 }]} x={[-R, R]} width={250} height={170} xlabel="x" vlines={[{ x: p[0] }]}>
              {(sx, sy) => <circle cx={sx(p[0])} cy={sy(fp)} r={4} style={{ fill: 'var(--c-u)' }} />}
            </LinePlot>
          </div>
          <div>
            <span className="calc-twin-k">slice f(x₀, y), slope ∂f/∂y = {ff(gy)}</span>
            <LinePlot series={[{ pts: sliceY, color: 'var(--c-v)' }, { pts: tanY, color: 'var(--c-v)', dashed: true, width: 1.5 }]} x={[-R, R]} width={250} height={170} xlabel="y" vlines={[{ x: p[1] }]}>
              {(sx, sy) => <circle cx={sx(p[1])} cy={sy(fp)} r={4} style={{ fill: 'var(--c-v)' }} />}
            </LinePlot>
          </div>
        </div>
      }
    >
      <Plane x={[-R, R]} y={[-R, R]} width={400}>
        <Contours f={F.f} levels={levels} />
        <InfLine p={p} d={[1, 0]} color="var(--c-u)" width={2} opacity={0.7} />
        <InfLine p={p} d={[0, 1]} color="var(--c-v)" width={2} opacity={0.7} />
        <Handle at={p} onChange={setP} color="var(--fg)" snap={0.25} tex="\mathbf{p}" />
      </Plane>
    </FigureLayout>
  );
}

// ------------------------------------------------------------------ Jacobian of a map R^2 -> R^2

interface Map2 {
  tex: string;
  F: (x: number, y: number) => P2;
  J: (x: number, y: number) => [[number, number], [number, number]];
  inX: [number, number];
  inY: [number, number];
  out: number;
  inLabels: [string, string];
}
const MAPS: Record<string, Map2> = {
  warp: {
    tex: 'F(x,y) = (x + \\tfrac12\\sin y,\\ y + \\tfrac12\\sin x)',
    F: (x, y) => [x + 0.5 * Math.sin(y), y + 0.5 * Math.sin(x)],
    J: (x, y) => [[1, 0.5 * Math.cos(y)], [0.5 * Math.cos(x), 1]],
    inX: [-3, 3], inY: [-3, 3], out: 3.6, inLabels: ['x', 'y'],
  },
  square: {
    tex: 'F(x,y) = (x^2 - y^2,\\ 2xy)',
    F: (x, y) => [x * x - y * y, 2 * x * y],
    J: (x, y) => [[2 * x, -2 * y], [2 * y, 2 * x]],
    inX: [-2, 2], inY: [-2, 2], out: 4.2, inLabels: ['x', 'y'],
  },
  polar: {
    tex: 'F(r,\\theta) = (r\\cos\\theta,\\ r\\sin\\theta)',
    F: (r, t) => [r * Math.cos(t), r * Math.sin(t)],
    J: (r, t) => [[Math.cos(t), -r * Math.sin(t)], [Math.sin(t), r * Math.cos(t)]],
    inX: [0, 3], inY: [-1.5, 1.5], out: 3.2, inLabels: ['r', 'θ'],
  },
};

function shoelace(pts: P2[]) {
  let s = 0;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i], b = pts[(i + 1) % pts.length];
    s += a[0] * b[1] - a[1] * b[0];
  }
  return s / 2;
}

/**
 * calc.jacobian — a small square around p and its image under a nonlinear map F, next to the
 * parallelogram J·square. As the square shrinks, the image looks more and more like the parallelogram.
 * params: map ('warp'|'square'|'polar'), p, eps, lockMap
 */
function Jacobian({ spec }: { spec: VizSpec }) {
  const [mk, setMk] = useState((spec.map as string) ?? 'warp');
  const M = MAPS[mk];
  const [p, setP] = useState<P2>((spec.p as P2) ?? [1, 0.5]);
  const [eps, setEps] = useState((spec.eps as number) ?? 0.6);
  const pc: P2 = [clamp(p[0], M.inX[0], M.inX[1]), clamp(p[1], M.inY[0], M.inY[1])];
  const J = M.J(pc[0], pc[1]);
  const detJ = J[0][0] * J[1][1] - J[0][1] * J[1][0];
  const Fp = M.F(pc[0], pc[1]);
  const e = eps / 2;
  const corners: P2[] = [[pc[0] - e, pc[1] - e], [pc[0] + e, pc[1] - e], [pc[0] + e, pc[1] + e], [pc[0] - e, pc[1] + e]];
  const boundary: P2[] = [];
  for (let k = 0; k < 4; k++) {
    const a = corners[k], b = corners[(k + 1) % 4];
    for (let i = 0; i < 20; i++) boundary.push([a[0] + ((b[0] - a[0]) * i) / 20, a[1] + ((b[1] - a[1]) * i) / 20]);
  }
  const img = boundary.map(([x, y]) => M.F(x, y));
  const lin = corners.map(([x, y]) => {
    const d = [x - pc[0], y - pc[1]];
    return [Fp[0] + J[0][0] * d[0] + J[0][1] * d[1], Fp[1] + J[1][0] * d[0] + J[1][1] * d[1]] as P2;
  });
  const areaRatio = Math.abs(shoelace(img)) / (eps * eps);
  const grid = useMemo(() => {
    const lines: P2[][] = [];
    const [x0, x1] = M.inX, [y0, y1] = M.inY;
    const nx = 8, ny = 8;
    for (let i = 0; i <= nx; i++) { const x = x0 + ((x1 - x0) * i) / nx; lines.push(Array.from({ length: 41 }, (_, k) => M.F(x, y0 + ((y1 - y0) * k) / 40))); }
    for (let j = 0; j <= ny; j++) { const y = y0 + ((y1 - y0) * j) / ny; lines.push(Array.from({ length: 41 }, (_, k) => M.F(x0 + ((x1 - x0) * k) / 40, y))); }
    return lines;
  }, [M]);
  const inGrid = useMemo(() => {
    const lines: [P2, P2][] = [];
    const [x0, x1] = M.inX, [y0, y1] = M.inY;
    for (let i = 0; i <= 8; i++) { const x = x0 + ((x1 - x0) * i) / 8; lines.push([[x, y0], [x, y1]]); }
    for (let j = 0; j <= 8; j++) { const y = y0 + ((y1 - y0) * j) / 8; lines.push([[x0, y], [x1, y]]); }
    return lines;
  }, [M]);
  const pad = 0.15;
  return (
    <FigureLayout
      side={
        <>
          {!spec.lockMap && <SegControl value={mk} onChange={(v) => { setMk(v); setP(v === 'polar' ? [1.5, 0.5] : [1, 0.5]); }} options={[{ v: 'warp', label: 'warp' }, { v: 'square', label: 'z²' }, { v: 'polar', label: 'polar' }]} />}
          <Slider label="square side ε" value={eps} min={0.05} max={1} step={0.05} onChange={setEps} />
          <Readout
            rows={[
              ['', '$' + M.tex],
              [`(${M.inLabels[0] === 'r' ? 'r,\\theta' : 'x,y'})`, `(${ff(pc[0])}, ${ff(pc[1])})`],
              ['J_F', '$' + tmat(J)],
              ['\\det J_F', ff(detJ, 3)],
              ['\\text{area(image)}/\\varepsilon^2', ff(areaRatio, 3)],
            ]}
          />
          <div className="calc-note">Green: the true image of the square. Dashed orange: the square pushed through the Jacobian. Shrink ε: the two shapes match, and the area ratio approaches <TeX>{'|\\det J_F|'}</TeX>.</div>
        </>
      }
    >
      <div className="calc-twin">
        <div>
          <span className="calc-twin-k">input: drag the point</span>
          <Plane x={[M.inX[0] - pad, M.inX[1] + pad]} y={[M.inY[0] - pad, M.inY[1] + pad]} width={250} xLabel={M.inLabels[0]} yLabel={M.inLabels[1]}>
            {inGrid.map(([a, b], i) => <Seg key={i} a={a} b={b} color="var(--c-grid-t)" width={1} />)}
            <Poly pts={corners} fill="var(--c-w)" fillOpacity={0.3} stroke="var(--c-w)" width={1.5} />
            <Handle at={pc} onChange={setP} color="var(--fg)" snap={0.05} bounds={{ x: M.inX, y: M.inY }} label="p" />
          </Plane>
        </div>
        <div>
          <span className="calc-twin-k">output: F of the grid and of the square</span>
          <Plane x={[-M.out, M.out]} y={[-M.out, M.out]} width={250}>
            {grid.map((l, i) => <Path key={i} pts={l} color="var(--c-grid-t)" width={1} />)}
            <Path pts={img} closed color="var(--c-w)" fill="var(--c-w)" width={1.5} opacity={0.85} />
            <Path pts={lin} closed color="var(--c-v)" width={2} dashed />
            <Point at={Fp} r={3} color="var(--fg)" />
          </Plane>
        </div>
      </div>
    </FigureLayout>
  );
}

// ------------------------------------------------------------------ computational graph

type NodeId = 'x' | 'y' | 'a' | 'b' | 'c' | 'f';
const NODES: { id: NodeId; at: [number, number]; name: string; op: string }[] = [
  { id: 'x', at: [52, 70], name: 'x', op: 'input' },
  { id: 'y', at: [52, 215], name: 'y', op: 'input' },
  { id: 'b', at: [198, 70], name: 'b', op: 'sin x' },
  { id: 'a', at: [198, 190], name: 'a', op: 'x · y' },
  { id: 'c', at: [334, 130], name: 'c', op: 'a + b' },
  { id: 'f', at: [466, 130], name: 'f', op: 'c²' },
];
const EDGES: { from: NodeId; to: NodeId; local: string }[] = [
  { from: 'x', to: 'b', local: 'cos x' },
  { from: 'x', to: 'a', local: 'y' },
  { from: 'y', to: 'a', local: 'x' },
  { from: 'b', to: 'c', local: '1' },
  { from: 'a', to: 'c', local: '1' },
  { from: 'c', to: 'f', local: '2c' },
];
const NW = 92, NH = 58;

interface Frame {
  text: string; // TeX-free markdown-ish plain text with inline TeX segments split by $
  shown: Partial<Record<NodeId, boolean>>;
  adj: Partial<Record<NodeId, number>>;
  dot: Partial<Record<NodeId, number>>;
  on: NodeId[];
  edges: { from: NodeId; to: NodeId; dir: 'fwd' | 'bwd' }[];
}

/** split "text $tex$ text" into TeX/plain spans */
function Mixed({ s }: { s: string }) {
  const parts = s.split('$');
  return <>{parts.map((t, i) => (i % 2 ? <TeX key={i}>{t}</TeX> : <span key={i}>{t}</span>))}</>;
}

/**
 * calc.compgraph — f = (x y + sin x)^2 as a computational graph. Step through the forward pass
 * (values, blue) and the backward pass (adjoints = ∂f/∂node, orange), or through forward-mode
 * differentiation with a seed on x or on y.
 * params: x, y, mode ('reverse'|'fwdx'|'fwdy'), lockMode
 */
function CompGraph({ spec }: { spec: VizSpec }) {
  const [x, setX] = useState((spec.x as number) ?? 1);
  const [y, setY] = useState((spec.y as number) ?? 2);
  const [mode, setMode] = useState((spec.mode as string) ?? 'reverse');
  const v = { x, y, a: x * y, b: Math.sin(x), c: x * y + Math.sin(x), f: (x * y + Math.sin(x)) ** 2 };
  const n = (z: number) => ff(z, 3);
  const frames = useMemo<Frame[]>(() => {
    const all: Partial<Record<NodeId, boolean>> = { x: true, y: true, a: true, b: true, c: true, f: true };
    const fwd: Frame[] = [];
    if (mode === 'reverse') {
      fwd.push({ text: `Forward pass. Start from the inputs $x = ${n(x)}$, $y = ${n(y)}$.`, shown: { x: true, y: true }, adj: {}, dot: {}, on: ['x', 'y'], edges: [] });
      fwd.push({ text: `$a = x\\,y = ${n(v.a)}$. Each node stores its value for the backward pass.`, shown: { x: true, y: true, a: true }, adj: {}, dot: {}, on: ['a'], edges: [{ from: 'x', to: 'a', dir: 'fwd' }, { from: 'y', to: 'a', dir: 'fwd' }] });
      fwd.push({ text: `$b = \\sin x = ${n(v.b)}$.`, shown: { x: true, y: true, a: true, b: true }, adj: {}, dot: {}, on: ['b'], edges: [{ from: 'x', to: 'b', dir: 'fwd' }] });
      fwd.push({ text: `$c = a + b = ${n(v.c)}$.`, shown: { x: true, y: true, a: true, b: true, c: true }, adj: {}, dot: {}, on: ['c'], edges: [{ from: 'a', to: 'c', dir: 'fwd' }, { from: 'b', to: 'c', dir: 'fwd' }] });
      fwd.push({ text: `$f = c^2 = ${n(v.f)}$. The forward pass is done.`, shown: all, adj: {}, dot: {}, on: ['f'], edges: [{ from: 'c', to: 'f', dir: 'fwd' }] });
      const fb = 1, cb = 2 * v.c, ab = cb, bb = cb, xb1 = bb * Math.cos(x), yb = ab * x, xb = xb1 + ab * y;
      fwd.push({ text: `Backward pass. Seed the output: $\\bar f = \\partial f/\\partial f = 1$.`, shown: all, adj: { f: fb }, dot: {}, on: ['f'], edges: [] });
      fwd.push({ text: `$\\bar c = \\bar f\\cdot \\partial f/\\partial c = 1\\cdot 2c = ${n(cb)}$.`, shown: all, adj: { f: fb, c: cb }, dot: {}, on: ['c'], edges: [{ from: 'c', to: 'f', dir: 'bwd' }] });
      fwd.push({ text: `$c = a + b$ passes its adjoint unchanged to both inputs: $\\bar a = \\bar b = \\bar c\\cdot 1 = ${n(cb)}$.`, shown: all, adj: { f: fb, c: cb, a: ab, b: bb }, dot: {}, on: ['a', 'b'], edges: [{ from: 'a', to: 'c', dir: 'bwd' }, { from: 'b', to: 'c', dir: 'bwd' }] });
      fwd.push({ text: `From $b = \\sin x$: $x$ receives $\\bar b\\cos x = ${n(xb1)}$. This is only part of $\\bar x$.`, shown: all, adj: { f: fb, c: cb, a: ab, b: bb, x: xb1 }, dot: {}, on: ['x'], edges: [{ from: 'x', to: 'b', dir: 'bwd' }] });
      fwd.push({ text: `From $a = x y$: $\\bar y = \\bar a\\,x = ${n(yb)}$, and $x$ receives $\\bar a\\,y$. Contributions along different paths **add**: $\\bar x = ${n(xb1)} + ${n(ab * y)} = ${n(xb)}$.`, shown: all, adj: { f: fb, c: cb, a: ab, b: bb, x: xb, y: yb }, dot: {}, on: ['x', 'y'], edges: [{ from: 'x', to: 'a', dir: 'bwd' }, { from: 'y', to: 'a', dir: 'bwd' }] });
      fwd.push({ text: `Done. One backward pass gave both partials: $\\nabla f = (\\bar x, \\bar y) = (${n(xb)}, ${n(yb)})$. Check: $2c(y + \\cos x) = ${n(2 * v.c * (y + Math.cos(x)))}$, $2c\\,x = ${n(2 * v.c * x)}$.`, shown: all, adj: { f: fb, c: cb, a: ab, b: bb, x: xb, y: yb }, dot: {}, on: ['x', 'y'], edges: [] });
      return fwd;
    }
    const sx = mode === 'fwdx' ? 1 : 0, sy = 1 - sx;
    const ad = sx * y + x * sy, bd = Math.cos(x) * sx, cd = ad + bd, fd = 2 * v.c * cd;
    const wrt = mode === 'fwdx' ? 'x' : 'y';
    fwd.push({ text: `Forward mode, seeded on ${wrt}: carry each value together with its derivative with respect to ${wrt}. Seed $\\dot x = ${sx}$, $\\dot y = ${sy}$.`, shown: { x: true, y: true }, adj: {}, dot: { x: sx, y: sy }, on: ['x', 'y'], edges: [] });
    fwd.push({ text: `$a = xy$, $\\dot a = \\dot x\\,y + x\\,\\dot y = ${n(ad)}$ (product rule).`, shown: { x: true, y: true, a: true }, adj: {}, dot: { x: sx, y: sy, a: ad }, on: ['a'], edges: [{ from: 'x', to: 'a', dir: 'fwd' }, { from: 'y', to: 'a', dir: 'fwd' }] });
    fwd.push({ text: `$b = \\sin x$, $\\dot b = \\cos x\\cdot\\dot x = ${n(bd)}$.`, shown: { x: true, y: true, a: true, b: true }, adj: {}, dot: { x: sx, y: sy, a: ad, b: bd }, on: ['b'], edges: [{ from: 'x', to: 'b', dir: 'fwd' }] });
    fwd.push({ text: `$c = a + b$, $\\dot c = \\dot a + \\dot b = ${n(cd)}$.`, shown: { x: true, y: true, a: true, b: true, c: true }, adj: {}, dot: { x: sx, y: sy, a: ad, b: bd, c: cd }, on: ['c'], edges: [{ from: 'a', to: 'c', dir: 'fwd' }, { from: 'b', to: 'c', dir: 'fwd' }] });
    fwd.push({ text: `$f = c^2$, $\\dot f = 2c\\,\\dot c = ${n(fd)}$. This is $\\partial f/\\partial ${wrt}$ only. The other partial needs a second forward pass with the other seed.`, shown: all, adj: {}, dot: { x: sx, y: sy, a: ad, b: bd, c: cd, f: fd }, on: ['f'], edges: [{ from: 'c', to: 'f', dir: 'fwd' }] });
    return fwd;
  }, [mode, x, y]); // eslint-disable-line react-hooks/exhaustive-deps
  const { i, controls } = usePlayer(frames.length, { interval: 1300 });
  const fr = frames[Math.min(i, frames.length - 1)];
  const pos = (id: NodeId) => NODES.find((nd) => nd.id === id)!.at;
  const sym = mode === 'reverse' ? '̄' : '̇';
  return (
    <FigureLayout
      side={
        <>
          {!spec.lockMode && (
            <SegControl value={mode} onChange={setMode} options={[{ v: 'reverse', label: 'reverse' }, { v: 'fwdx', label: 'fwd, seed x' }, { v: 'fwdy', label: 'fwd, seed y' }]} />
          )}
          <Slider tex="x" value={x} min={-2} max={2} step={0.1} onChange={setX} />
          <Slider tex="y" value={y} min={-2} max={3} step={0.1} onChange={setY} />
          <Readout
            rows={[
              ['f = (xy + \\sin x)^2', n(v.f)],
              ['\\partial f/\\partial x = 2c(y + \\cos x)', n(2 * v.c * (y + Math.cos(x)))],
              ['\\partial f/\\partial y = 2c\\,x', n(2 * v.c * x)],
            ]}
          />
          <div className="calc-note">{mode === 'reverse' ? 'Blue: values (forward). Orange: adjoints, the derivative of f with respect to each node (backward). Orange edge labels are the local derivatives ∂child/∂parent.' : 'Blue: values. Orange: derivatives with respect to the seeded input, carried forward alongside the values.'}</div>
        </>
      }
      below={
        <div style={{ width: '100%' }}>
          {controls}
          <div className="calc-step">
            <Mixed s={fr.text.replace(/\*\*(.*?)\*\*/g, '$1')} />
          </div>
        </div>
      }
    >
      <svg viewBox="0 0 520 270" className="plane calc-graph" style={{ maxWidth: 520 }} role="img" aria-label="computational graph">
        <rect x={0} y={0} width={520} height={270} className="pl-bg" />
        <defs>
          <marker id="calc-arr" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
            <path d="M0,0 L10,5 L0,10 z" style={{ fill: 'var(--axis)' }} />
          </marker>
        </defs>
        {EDGES.map((e) => {
          const a = pos(e.from), b = pos(e.to);
          const x1 = a[0] + NW / 2, x2 = b[0] - NW / 2;
          const y1 = a[1], y2 = b[1];
          const hl = fr.edges.find((z) => z.from === e.from && z.to === e.to);
          const mx = (x1 + x2) / 2, my = (y1 + y2) / 2;
          const showLocal = mode === 'reverse' && (hl?.dir === 'bwd' || i === frames.length - 1);
          return (
            <g key={e.from + e.to}>
              <path d={`M${x1},${y1} C${mx},${y1} ${mx},${y2} ${x2},${y2}`} className={'calc-edge' + (hl ? ' ' + hl.dir : '')} markerEnd="url(#calc-arr)" />
              {showLocal && (
                <text x={mx} y={my + 4} textAnchor="middle" className="calc-edge-k">
                  {e.local}
                </text>
              )}
            </g>
          );
        })}
        {NODES.map((nd) => {
          const [cx, cy] = nd.at;
          const shown = fr.shown[nd.id];
          const adj = mode === 'reverse' ? fr.adj[nd.id] : fr.dot[nd.id];
          const on = fr.on.includes(nd.id);
          return (
            <g key={nd.id}>
              <rect x={cx - NW / 2} y={cy - NH / 2} width={NW} height={NH} rx={8} className={'calc-node' + (on ? ' on' : shown ? ' done' : '')} />
              <text x={cx - NW / 2 + 8} y={cy - NH / 2 + 16} className="calc-node-k">
                {nd.name}
              </text>
              <text x={cx + NW / 2 - 8} y={cy - NH / 2 + 16} textAnchor="end" className="calc-node-op">
                {nd.op}
              </text>
              {shown && (
                <text x={cx - NW / 2 + 8} y={cy + 5} className="calc-node-val">
                  {'= ' + ff(v[nd.id], 3)}
                </text>
              )}
              {adj !== undefined && (
                <text x={cx - NW / 2 + 8} y={cy + 22} className="calc-node-adj">
                  {nd.name + sym + ' = ' + ff(adj, 3)}
                </text>
              )}
            </g>
          );
        })}
      </svg>
    </FigureLayout>
  );
}

// ------------------------------------------------------------------ Hessian / quadratic forms

/**
 * calc.hessian — f(x) = xᵀ A x for an editable 2×2 A (not necessarily symmetric).
 * Shows contours and a heat map, the gradient (A + Aᵀ)p at a draggable point, and the eigenvectors of
 * the Hessian H = A + Aᵀ, with the classification (minimum, maximum, saddle, flat valley).
 * params: A (2×2), p, lockAsym (hide separate a12/a21 sliders)
 */
function Hessian({ spec }: { spec: VizSpec }) {
  const A0 = (spec.A as number[][]) ?? [[1, 0.5], [0.5, 2]];
  const [a11, setA11] = useState(A0[0][0]);
  const [a12, setA12] = useState(A0[0][1]);
  const [a21, setA21] = useState(A0[1][0]);
  const [a22, setA22] = useState(A0[1][1]);
  const [p, setP] = useState<P2>((spec.p as P2) ?? [1.5, 1]);
  const sym = !!spec.lockAsym;
  const A = [[a11, a12], [sym ? a12 : a21, a22]];
  const H = [[2 * A[0][0], A[0][1] + A[1][0]], [A[0][1] + A[1][0], 2 * A[1][1]]];
  const f = useMemo(() => (x: number, y: number) => A[0][0] * x * x + (A[0][1] + A[1][0]) * x * y + A[1][1] * y * y, [a11, a12, a21, a22, sym]); // eslint-disable-line react-hooks/exhaustive-deps
  const R = 3;
  const levels = useMemo(() => {
    const big = Math.max(Math.abs(f(R, R)), Math.abs(f(R, -R)), Math.abs(f(R, 0)), Math.abs(f(0, R)), 1);
    const out: number[] = [];
    for (let k = 1; k <= 7; k++) { const L = (big * (k / 7) ** 2) * 0.9; out.push(L, -L); }
    out.push(0);
    return out;
  }, [f]);
  const { values, V } = eigSym(H);
  const [l1, l2] = values;
  const tol = 1e-9;
  let kind: string, col: string;
  if (l1 > tol) { kind = 'positive definite: a minimum, strictly convex'; col = 'var(--ok)'; }
  else if (l2 < -tol) { kind = 'negative definite: a maximum, concave'; col = 'var(--bad)'; }
  else if (l1 < -tol && l2 > tol) { kind = 'indefinite: a saddle point, not convex'; col = 'var(--warn)'; }
  else if (l1 >= -tol) { kind = 'positive semidefinite: a flat valley, convex but not strictly'; col = 'var(--ok)'; }
  else { kind = 'negative semidefinite: a flat ridge'; col = 'var(--bad)'; }
  const g: P2 = [H[0][0] * p[0] + H[0][1] * p[1], H[1][0] * p[0] + H[1][1] * p[1]];
  const range = Math.max(...levels.map(Math.abs));
  const ev = (k: number): P2 => [V[0][k], V[1][k]];
  return (
    <FigureLayout
      side={
        <>
          <Slider tex="A_{11}" value={a11} min={-3} max={3} step={0.25} onChange={setA11} />
          <Slider tex={sym ? 'A_{12}=A_{21}' : 'A_{12}'} value={a12} min={-3} max={3} step={0.25} onChange={setA12} />
          {!sym && <Slider tex="A_{21}" value={a21} min={-3} max={3} step={0.25} onChange={setA21} />}
          <Slider tex="A_{22}" value={a22} min={-3} max={3} step={0.25} onChange={setA22} />
          <Readout
            rows={[
              ['A', '$' + tmat(A)],
              ['H = A + A^\\top', '$' + tmat(H)],
              ['\\lambda_1, \\lambda_2\\ (H)', `${ff(l1)}, ${ff(l2)}`],
              ['\\nabla f(\\mathbf{p}) = H\\mathbf{p}', `(${ff(g[0])}, ${ff(g[1])})`],
            ]}
          />
          <div className="calc-msg" style={{ color: col }}>
            <b>H is {kind}.</b>
          </div>
          {!sym && <div className="calc-note">Change <TeX>{'A_{12}'}</TeX> and <TeX>{'A_{21}'}</TeX> while keeping their sum fixed: the picture does not move. Only the symmetric part of A matters.</div>}
        </>
      }
    >
      <Plane x={[-R, R]} y={[-R, R]} width={420}>
        <Heat f={f} res={36} range={[-range, range]} scheme="div" opacity={0.45} />
        <Contours f={f} levels={levels} n={60} />
        <Arrow to={[1.6 * ev(0)[0], 1.6 * ev(0)[1]]} color={l1 >= 0 ? 'var(--c-w)' : 'var(--c-err)'} tex="\mathbf{q}_1" width={2.2} labelAt={0.9} />
        <Arrow to={[1.6 * ev(1)[0], 1.6 * ev(1)[1]]} color={l2 >= 0 ? 'var(--c-w)' : 'var(--c-err)'} tex="\mathbf{q}_2" width={2.2} labelAt={0.9} />
        <Arrow from={p} to={[p[0] + 0.15 * g[0], p[1] + 0.15 * g[1]]} color="var(--c-u)" tex="\nabla f" labelAt={0.8} />
        <Handle at={p} onChange={setP} color="var(--fg)" snap={0.25} tex="\mathbf{p}" />
      </Plane>
    </FigureLayout>
  );
}

// ------------------------------------------------------------------ Taylor expansion in 1-D

interface Fn1 { tex: string; f: (x: number) => number; d1: (x: number) => number; d2: (x: number) => number; x: [number, number]; y: [number, number] }
const sig = (x: number) => 1 / (1 + Math.exp(-x));
const FN1: Record<string, Fn1> = {
  softplus: { tex: '\\ln(1 + e^x)', f: (x) => Math.log1p(Math.exp(x)), d1: sig, d2: (x) => sig(x) * (1 - sig(x)), x: [-4, 4], y: [-1.5, 4.5] },
  quartic: { tex: '\\tfrac14 x^4 - x^2', f: (x) => x ** 4 / 4 - x * x, d1: (x) => x ** 3 - 2 * x, d2: (x) => 3 * x * x - 2, x: [-2.6, 2.6], y: [-2, 3] },
  cos: { tex: '\\cos x', f: Math.cos, d1: (x) => -Math.sin(x), d2: (x) => -Math.cos(x), x: [-4, 4], y: [-2, 2] },
};

/**
 * calc.taylor — first- and second-order Taylor approximations of f around x₀, and their error at x₀ + h.
 * params: fn ('softplus'|'quartic'|'cos'), x0, h, lockFn
 */
function Taylor({ spec }: { spec: VizSpec }) {
  const [fk, setFk] = useState((spec.fn as string) ?? 'quartic');
  const F = FN1[fk];
  const [x0, setX0] = useState((spec.x0 as number) ?? 0.5);
  const [h, setH] = useState((spec.h as number) ?? 0.4);
  const f0 = F.f(x0), d1 = F.d1(x0), d2 = F.d2(x0);
  const T1 = (x: number) => f0 + d1 * (x - x0);
  const T2 = (x: number) => f0 + d1 * (x - x0) + 0.5 * d2 * (x - x0) ** 2;
  const xe = x0 + h;
  const xs = clamp(x0, F.x[0], F.x[1]);
  return (
    <FigureLayout
      side={
        <>
          {!spec.lockFn && <SegControl value={fk} onChange={setFk} options={Object.keys(FN1).map((k) => ({ v: k, label: <TeX>{FN1[k].tex}</TeX> }))} />}
          <Slider tex="x_0" value={x0} min={F.x[0] + 0.4} max={F.x[1] - 0.4} step={0.05} onChange={setX0} />
          <Slider tex="h" value={h} min={-1.5} max={1.5} step={0.05} onChange={setH} />
          <div className="calc-legend">
            <span><i style={{ background: 'var(--fg)' }} />f</span>
            <span><i style={{ background: 'var(--c-u)' }} />1st order</span>
            <span><i style={{ background: 'var(--c-v)' }} />2nd order</span>
          </div>
          <Readout
            rows={[
              ['f(x_0)', ff(f0, 3)],
              ["f'(x_0)", ff(d1, 3)],
              ["f''(x_0)", ff(d2, 3)],
              ['f(x_0 + h)', ff(F.f(xe), 4)],
              ["\\text{1st order: } f + f'h", ff(T1(xe), 4)],
              ["\\text{2nd order: } {+}\\tfrac12 f''h^2", ff(T2(xe), 4)],
              ['\\text{error, 1st order}', ff(F.f(xe) - T1(xe), 4)],
              ['\\text{error, 2nd order}', ff(F.f(xe) - T2(xe), 4)],
            ]}
          />
          <div className="calc-msg">
            {d2 > 1e-9 ? <>Here <TeX>{"f''(x_0) > 0"}</TeX>: the parabola opens upward and f curves above its tangent line, locally convex.</> : d2 < -1e-9 ? <>Here <TeX>{"f''(x_0) < 0"}</TeX>: the parabola opens downward and f curves below its tangent, locally concave.</> : <>Here <TeX>{"f''(x_0) = 0"}</TeX>: an inflection point; the quadratic term vanishes.</>}
          </div>
          <div className="calc-note">Halve h and watch the errors: the first-order error shrinks about 4×, the second-order error about 8×.</div>
        </>
      }
    >
      <Plane x={F.x} y={F.y} width={440} height={320} gridStep={1}>
        <Curve f={F.f} color="var(--fg)" width={2.5} />
        <Curve f={T1} color="var(--c-u)" dashed width={2} />
        <Curve f={T2} color="var(--c-v)" width={2} />
        <Seg a={[xe, F.f(xe)]} b={[xe, T1(xe)]} color="var(--c-u)" width={3} opacity={0.6} />
        <Seg a={[xe, F.f(xe)]} b={[xe, T2(xe)]} color="var(--c-v)" width={5} opacity={0.6} />
        <Point at={[xe, F.f(xe)]} r={3.5} color="var(--fg)" hollow />
        <Point at={[xs, f0]} r={5} color="var(--fg)" />
      </Plane>
    </FigureLayout>
  );
}

export const multivarViz = {
  'calc.gradient': { component: Gradient, validate: (s: VizSpec) => check(s, { p: isPair, theta: isNum, h: isNum }, { fn: FN2_KEYS }), doc: 'Contours + draggable p, gradient arrow, direction slider with D_u f, linear prediction at p + h u. params fn (quad|saddle|wave|poly), p, theta, h, lockFn' },
  'calc.partials': { component: Partials, validate: (s: VizSpec) => check(s, { p: isPair }, { fn: FN2_KEYS }), doc: 'Partial derivatives as slopes of slices through p. params fn, p, lockFn' },
  'calc.jacobian': { component: Jacobian, validate: (s: VizSpec) => check(s, { p: isPair, eps: isNum }, { map: Object.keys(MAPS) }), doc: 'Image of a small square under a nonlinear map vs the Jacobian parallelogram. params map (warp|square|polar), p, eps, lockMap' },
  'calc.compgraph': { component: CompGraph, validate: (s: VizSpec) => check(s, { x: isNum, y: isNum }, { mode: ['reverse', 'fwdx', 'fwdy'] }), doc: 'Step-through computational graph of f = (xy + sin x)^2: forward values, backward adjoints, or forward mode. params x, y, mode, lockMode' },
  'calc.hessian': { component: Hessian, validate: (s: VizSpec) => (s.A !== undefined && !(Array.isArray(s.A) && s.A.length === 2) ? 'A must be 2×2' : check(s, { p: isPair })), doc: 'f = xᵀAx: contours, Hessian A + Aᵀ eigenvectors, classification, gradient at p. params A, p, lockAsym' },
  'calc.taylor': { component: Taylor, validate: (s: VizSpec) => check(s, { x0: isNum, h: isNum }, { fn: Object.keys(FN1) }), doc: '1st/2nd-order Taylor approximations around x0 and their errors at x0 + h. params fn (softplus|quartic|cos), x0, h, lockFn' },
};

