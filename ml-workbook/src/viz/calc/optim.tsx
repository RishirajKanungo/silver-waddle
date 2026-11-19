// calc03 figures: entropy and KL, softmax cross-entropy, gradient descent in 1-D and 2-D,
// minibatch gradient noise, optimizers racing, learning-rate schedules.
import { useEffect, useMemo, useRef, useState, type PointerEvent as RPE } from 'react';
import type { VizSpec } from '../../content/types';
import { Plane, Arrow, Handle, Path, Point, Curve, Contours, LinePlot, Slider, Readout, FigureLayout, SegControl, Toggle, TeX, usePlayer, type P2 } from '../kit';
import { Rng } from '../../math/rng';
import { fx, ff, check, isNum, isPair, clamp, linspace } from './util';
import { Dots } from './prob';
import './calc.css';

// ------------------------------------------------------------------ entropy and KL

const OUT = ['a', 'b', 'c', 'd'];
type Dist = number[];
const lg = (x: number, unit: 'bits' | 'nats') => (unit === 'bits' ? Math.log2(x) : Math.log(x));
function H(p: Dist, unit: 'bits' | 'nats') { return -p.reduce((s, x) => s + (x > 0 ? x * lg(x, unit) : 0), 0); }
function CE(p: Dist, q: Dist, unit: 'bits' | 'nats') {
  let s = 0;
  for (let i = 0; i < p.length; i++) if (p[i] > 0) s += q[i] > 0 ? -p[i] * lg(q[i], unit) : Infinity;
  return s;
}
const KLd = (p: Dist, q: Dist, unit: 'bits' | 'nats') => CE(p, q, unit) - H(p, unit);
function setProb(d: Dist, i: number, t: number): Dist {
  t = clamp(Math.round(t * 1000) / 1000, 0, 1);
  const rest = 1 - d[i];
  return d.map((x, j) => (j === i ? t : rest < 1e-9 ? (1 - t) / (d.length - 1) : (x * (1 - t)) / rest));
}

/** two side-by-side draggable bar groups for p and q */
function DragBars({ p, q, onP, onQ }: { p: Dist; q: Dist; onP: (d: Dist) => void; onQ: (d: Dist) => void }) {
  const W = 440, Hh = 250, L = 34, B = 26, T = 12;
  const svg = useRef<SVGSVGElement>(null);
  const [drag, setDrag] = useState<{ which: 'p' | 'q'; i: number } | null>(null);
  const gw = (W - L - 8) / p.length;
  const sy = (v: number) => Hh - B - v * (Hh - B - T);
  const toV = (e: RPE) => {
    const s = svg.current;
    if (!s) return 0;
    const pt = s.createSVGPoint();
    pt.x = e.clientX; pt.y = e.clientY;
    const m = s.getScreenCTM();
    if (!m) return 0;
    const y = pt.matrixTransform(m.inverse()).y;
    return (Hh - B - y) / (Hh - B - T);
  };
  const move = (e: RPE) => {
    if (!drag) return;
    const v = toV(e);
    if (drag.which === 'p') onP(setProb(p, drag.i, v));
    else onQ(setProb(q, drag.i, v));
  };
  const key = (which: 'p' | 'q', i: number) => (e: React.KeyboardEvent) => {
    const d = which === 'p' ? p : q;
    const dv = e.key === 'ArrowUp' ? 0.02 : e.key === 'ArrowDown' ? -0.02 : 0;
    if (!dv) return;
    e.preventDefault();
    (which === 'p' ? onP : onQ)(setProb(d, i, d[i] + dv));
  };
  return (
    <svg ref={svg} viewBox={`0 0 ${W} ${Hh}`} className="plane calc-bars" style={{ maxWidth: W }} onPointerMove={move} onPointerUp={() => setDrag(null)} onPointerLeave={() => setDrag(null)}>
      <rect width={W} height={Hh} className="pl-bg" />
      {[0, 0.25, 0.5, 0.75, 1].map((v) => (
        <g key={v}>
          <line x1={L} x2={W - 8} y1={sy(v)} y2={sy(v)} className="pl-grid" />
          <text x={L - 6} y={sy(v) + 4} textAnchor="end" className="pl-tick">{v}</text>
        </g>
      ))}
      <line x1={L} x2={W - 8} y1={sy(0)} y2={sy(0)} className="pl-axis" />
      {p.map((_, i) => {
        const x0 = L + i * gw;
        const bw = gw * 0.34;
        const xs = [x0 + gw * 0.13, x0 + gw * 0.53];
        return (
          <g key={i}>
            {(['p', 'q'] as const).map((w, k) => {
              const v = (w === 'p' ? p : q)[i];
              const col = w === 'p' ? 'var(--c-u)' : 'var(--c-v)';
              return (
                <g key={w}>
                  <rect x={xs[k]} y={sy(v)} width={bw} height={sy(0) - sy(v)} rx={2} style={{ fill: col, opacity: 0.85 }} />
                  <rect x={xs[k]} y={sy(v) - 3} width={bw} height={6} rx={2} style={{ fill: col }} />
                  <text x={xs[k] + bw / 2} y={sy(v) - 7} textAnchor="middle" className="pl-tick">{fx(v, 3)}</text>
                  <rect
                    x={xs[k] - 2}
                    y={T - 6}
                    width={bw + 4}
                    height={Hh - B - T + 12}
                    className="calc-bar-hit"
                    tabIndex={0}
                    role="slider"
                    aria-label={`${w}(${OUT[i]})`}
                    aria-valuenow={v}
                    onKeyDown={key(w, i)}
                    onPointerDown={(e) => { (e.target as Element).setPointerCapture?.(e.pointerId); setDrag({ which: w, i }); (w === 'p' ? onP : onQ)(setProb(w === 'p' ? p : q, i, toV(e))); }}
                  />
                </g>
              );
            })}
            <text x={x0 + gw / 2} y={Hh - 8} textAnchor="middle" className="pl-tick">{OUT[i]}</text>
          </g>
        );
      })}
    </svg>
  );
}

/**
 * calc.entropy — two editable distributions p (blue) and q (orange) over four outcomes. Drag bar
 * tops (or focus a bar and use the arrow keys). Live H(p), H(q), H(p,q), KL(p‖q), KL(q‖p), in bits or nats.
 * params: p, q (arrays of 4 probabilities), unit ('bits'|'nats')
 */
function Entropy({ spec }: { spec: VizSpec }) {
  const [p, setP] = useState<Dist>((spec.p as Dist) ?? [0.5, 0.25, 0.125, 0.125]);
  const [q, setQ] = useState<Dist>((spec.q as Dist) ?? [0.25, 0.25, 0.25, 0.25]);
  const [unit, setUnit] = useState<'bits' | 'nats'>((spec.unit as 'bits' | 'nats') ?? 'bits');
  const f = (x: number) => ff(x, 3);
  const terms = p.map((pi, i) => (pi > 0 ? (q[i] > 0 ? pi * lg(pi / q[i], unit) : Infinity) : 0));
  return (
    <FigureLayout
      side={
        <>
          <SegControl value={unit} onChange={setUnit} options={[{ v: 'bits', label: 'bits (log₂)' }, { v: 'nats', label: 'nats (ln)' }]} />
          <Readout
            rows={[
              ['H(p)', f(H(p, unit))],
              ['H(q)', f(H(q, unit))],
              ['H(p, q) = -\\sum p_i\\log q_i', f(CE(p, q, unit))],
              ['\\KL(p\\,\\|\\,q)', f(KLd(p, q, unit))],
              ['\\KL(q\\,\\|\\,p)', f(KLd(q, p, unit))],
            ]}
          />
          <table className="calc-table">
            <thead>
              <tr><th>outcome</th>{OUT.map((o) => <th key={o}>{o}</th>)}</tr>
            </thead>
            <tbody>
              <tr><td>p log(p/q)</td>{terms.map((t, i) => <td key={i}>{ff(t, 2)}</td>)}</tr>
            </tbody>
          </table>
          <div className="calc-row">
            <button onClick={() => setQ([...p])}>q = p</button>
            <button onClick={() => setQ([0.25, 0.25, 0.25, 0.25])}>q uniform</button>
            <button onClick={() => { setP([0.5, 0.25, 0.125, 0.125]); setQ([0.5, 0.3, 0.2, 0]); }}>q misses d</button>
          </div>
          <div className="calc-note">Single terms of the KL sum can be negative; the sum never is. <TeX>{'H(p, q) = H(p) + \\KL(p\\,\\|\\,q)'}</TeX>.</div>
        </>
      }
    >
      <div className="calc-stack">
        <div className="calc-legend">
          <span><i style={{ background: 'var(--c-u)' }} />p (true distribution)</span>
          <span><i style={{ background: 'var(--c-v)' }} />q (model)</span>
          <span className="muted">drag the bars</span>
        </div>
        <DragBars p={p} q={q} onP={setP} onQ={setQ} />
      </div>
    </FigureLayout>
  );
}

// ------------------------------------------------------------------ softmax cross-entropy

const CLASSES = ['cat', 'dog', 'bird'];

/** vertical bars with signed values and labels */
function SignedBars({ vals, labels, colors, range, width = 300, height = 150, fmt = (v: number) => ff(v, 2) }: { vals: number[]; labels: string[]; colors: string[]; range: [number, number]; width?: number; height?: number; fmt?: (v: number) => string }) {
  const L = 8, B = 22, T = 16;
  const bw = (width - L * 2) / vals.length;
  const sy = (v: number) => T + ((range[1] - v) / (range[1] - range[0])) * (height - B - T);
  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="bars calc-bars" style={{ maxWidth: width }}>
      <rect width={width} height={height} className="pl-bg" />
      <line x1={L} x2={width - L} y1={sy(0)} y2={sy(0)} className="pl-axis" />
      {vals.map((v, i) => {
        const x = L + i * bw + bw * 0.2, w = bw * 0.6;
        const y0 = sy(0), y1 = sy(clamp(v, range[0], range[1]));
        return (
          <g key={i}>
            <rect x={x} y={Math.min(y0, y1)} width={w} height={Math.abs(y1 - y0)} rx={2} style={{ fill: colors[i] }} />
            <text x={x + w / 2} y={v >= 0 ? y1 - 4 : y1 + 12} textAnchor="middle" className="pl-tick">{fmt(v)}</text>
            <text x={x + w / 2} y={height - 6} textAnchor="middle" className="pl-tick">{labels[i]}</text>
          </g>
        );
      })}
    </svg>
  );
}

/**
 * calc.xent — a 3-class softmax: logit sliders and the true class; probabilities, the loss −log p_y
 * and its gradient p − onehot(y) with respect to the logits.
 * params: z (3 logits), y (0..2)
 */
function XEnt({ spec }: { spec: VizSpec }) {
  const z0 = (spec.z as number[]) ?? [2, 1, 0];
  const [z, setZ] = useState<number[]>(z0);
  const [y, setY] = useState((spec.y as number) ?? 1);
  const mx = Math.max(...z);
  const e = z.map((v) => Math.exp(v - mx));
  const Z = e.reduce((s, v) => s + v, 0);
  const p = e.map((v) => v / Z);
  const loss = -Math.log(p[y]);
  const grad = p.map((v, i) => v - (i === y ? 1 : 0));
  const curve = linspace(0.005, 1, 200).map((t) => [t, -Math.log(t)] as [number, number]);
  return (
    <FigureLayout
      side={
        <>
          <SegControl value={y} onChange={setY} options={CLASSES.map((c, i) => ({ v: i, label: `y = ${c}` }))} />
          {z.map((v, i) => <Slider key={i} tex={`z_{\\text{${CLASSES[i]}}}`} value={v} min={-4} max={4} step={0.1} onChange={(t) => setZ(z.map((w, j) => (j === i ? t : w)))} />)}
          <Readout
            rows={[
              ['p_y = \\softmax(\\mathbf{z})_y', ff(p[y], 3)],
              ['\\text{loss} = -\\ln p_y\\ \\text{(nats)}', ff(loss, 3)],
              ['\\partial L/\\partial \\mathbf{z} = \\mathbf{p} - \\mathbf{e}_y', `(${grad.map((g) => ff(g, 2)).join(', ')})`],
            ]}
          />
          <div className="calc-note">Gradient descent subtracts the gradient: it raises the true class's logit by 1 − p_y and lowers each other logit by its probability. Adding the same constant to every logit changes nothing.</div>
        </>
      }
      below={
        <div className="calc-stack">
          <div className="calc-plotk">loss −ln p as a function of the probability given to the true class</div>
          <LinePlot series={[{ pts: curve, color: 'var(--c-err)' }]} x={[0, 1]} y={[0, 5.5]} width={520} height={160} xlabel="p_y">
            {(sx, sy) => <circle cx={sx(p[y])} cy={sy(Math.min(loss, 5.5))} r={5} style={{ fill: 'var(--c-err)' }} />}
          </LinePlot>
        </div>
      }
    >
      <div className="calc-twin">
        <div>
          <span className="calc-twin-k">probabilities p = softmax(z)</span>
          <SignedBars vals={p} labels={CLASSES} colors={p.map((_, i) => (i === y ? 'var(--c-w)' : 'var(--c-u)'))} range={[0, 1]} width={240} height={170} fmt={(v) => ff(v, 3)} />
        </div>
        <div>
          <span className="calc-twin-k">gradient p − e_y</span>
          <SignedBars vals={grad} labels={CLASSES} colors={grad.map((g) => (g < 0 ? 'var(--c-w)' : 'var(--c-err)'))} range={[-1, 1]} width={240} height={170} />
        </div>
      </div>
    </FigureLayout>
  );
}

// ------------------------------------------------------------------ gradient descent in 1-D

/**
 * calc.gd1d — gradient descent on f(x) = (λ/2)x². Each step multiplies x by (1 − ηλ).
 * params: eta, lambda, x0
 */
function GD1D({ spec }: { spec: VizSpec }) {
  const [eta, setEta] = useState((spec.eta as number) ?? 0.3);
  const [lam, setLam] = useState((spec.lambda as number) ?? 1);
  const x0 = (spec.x0 as number) ?? 2.5;
  const K = 25;
  const xs: number[] = [x0];
  for (let k = 0; k < K; k++) xs.push(xs[k] * (1 - eta * lam));
  const r = 1 - eta * lam;
  const f = (x: number) => 0.5 * lam * x * x;
  let regime: string, col: string;
  if (Math.abs(r) >= 1 + 1e-9) { regime = 'diverges: |1 − ηλ| > 1, each step overshoots further'; col = 'var(--bad)'; }
  else if (Math.abs(Math.abs(r) - 1) < 1e-9) { regime = r > 0 ? 'stuck: η = 0' : 'bounces forever between ±x₀: ηλ = 2 exactly'; col = 'var(--warn)'; }
  else if (r < 0) { regime = 'converges while oscillating: 1 < ηλ < 2'; col = 'var(--warn)'; }
  else if (r < 0.05) { regime = 'converges in about one step: ηλ ≈ 1'; col = 'var(--ok)'; }
  else if (r > 0.8) { regime = 'converges slowly: η is small for this curvature'; col = 'var(--warn)'; }
  else { regime = 'converges monotonically'; col = 'var(--ok)'; }
  const R = 4;
  const pts = xs.filter((x) => Math.abs(x) <= R * 1.5).map((x) => [x, f(x)] as P2);
  const err = xs.map((x, k) => [k, Math.max(Math.abs(x), 1e-12)] as [number, number]);
  return (
    <FigureLayout
      side={
        <>
          <Slider tex="\eta" value={eta} min={0} max={2.5} step={0.01} onChange={setEta} />
          <Slider tex="\lambda" value={lam} min={0.25} max={3} step={0.05} onChange={setLam} />
          <Readout
            rows={[
              ['x_{k+1} = (1 - \\eta\\lambda)\\,x_k', ''],
              ['1 - \\eta\\lambda', ff(r, 3)],
              ['\\text{stable if } \\eta < 2/\\lambda', ff(2 / lam, 3)],
              ['|x_{25}|', Math.abs(xs[K]) > 1e6 ? '> 10⁶' : ff(Math.abs(xs[K]), 5)],
            ]}
          />
          <div className="calc-msg" style={{ color: col }}><b>{regime}</b></div>
        </>
      }
      below={
        <div className="calc-stack">
          <div className="calc-plotk">distance to the minimum |x_k| (log scale)</div>
          <LinePlot series={[{ pts: err, color: 'var(--c-u)' }, { pts: err, color: 'var(--c-u)', scatter: true }]} x={[0, K]} y={[1e-6, 1e4]} logY width={520} height={150} xlabel="step k" hlines={[{ y: x0 }]} />
        </div>
      }
    >
      <Plane x={[-R, R]} y={[-0.5, 6]} width={440} height={300} gridStep={1}>
        <Curve f={f} color="var(--fg)" width={2.2} />
        <Path pts={pts} color="var(--c-v)" width={1.5} />
        {pts.map((p, k) => <Point key={k} at={p} r={k === 0 ? 5 : 3.2} color={k === 0 ? 'var(--fg)' : 'var(--c-v)'} />)}
      </Plane>
    </FigureLayout>
  );
}

// ------------------------------------------------------------------ gradient descent in 2-D

interface Prob2 { f: (x: number, y: number) => number; g: (x: number, y: number) => P2; X: [number, number]; Y: [number, number]; lmax: number; levels?: number[] }
function quadProb(kappa: number, angle = Math.PI / 6): Prob2 & { lmin: number; dirs: [P2, P2] } {
  const c = Math.cos(angle), s = Math.sin(angle);
  const l1 = 1, l2 = 1 / kappa; // steep direction (c, s), shallow direction (−s, c)
  const f = (x: number, y: number) => { const u = c * x + s * y, v = -s * x + c * y; return 0.5 * (l1 * u * u + l2 * v * v); };
  const g = (x: number, y: number): P2 => { const u = c * x + s * y, v = -s * x + c * y; const gu = l1 * u, gv = l2 * v; return [c * gu - s * gv, s * gu + c * gv]; };
  return { f, g, X: [-3, 3], Y: [-3, 3], lmax: 1, lmin: l2, dirs: [[c, s], [-s, c]] };
}
const WELLS: Prob2 = {
  f: (x, y) => 0.5 * (x * x - 1) ** 2 + y * y,
  g: (x, y) => [2 * x * (x * x - 1), 2 * y],
  X: [-2, 2], Y: [-2, 2], lmax: 4,
  levels: [0.02, 0.08, 0.2, 0.35, 0.5, 0.7, 1, 1.5, 2.2, 3, 4.5],
};

/**
 * calc.gd — gradient descent paths on a contour plot. 'quad': a quadratic with condition number κ
 * (largest curvature 1). 'wells': a non-convex function with two minima and a saddle at the origin.
 * Drag the start point.
 * params: fn ('quad'|'wells'), eta, kappa, start, steps, lockFn
 */
function GD2D({ spec }: { spec: VizSpec }) {
  const [fk, setFk] = useState((spec.fn as string) ?? 'quad');
  const [eta, setEta] = useState((spec.eta as number) ?? 1);
  const [kappa, setKappa] = useState((spec.kappa as number) ?? 10);
  const [start, setStart] = useState<P2>((spec.start as P2) ?? [-2.5, 1.5]);
  const [steps, setSteps] = useState((spec.steps as number) ?? 100);
  const P = useMemo(() => (fk === 'quad' ? quadProb(kappa) : WELLS), [fk, kappa]);
  const path = useMemo(() => {
    const out: P2[] = [start];
    let [x, y] = start;
    for (let k = 0; k < steps; k++) {
      const [gx, gy] = P.g(x, y);
      x -= eta * gx; y -= eta * gy;
      if (!Number.isFinite(x) || Math.abs(x) > 1e6 || Math.abs(y) > 1e6) break;
      out.push([x, y]);
    }
    return out;
  }, [P, eta, start, steps]);
  const vals = path.map(([x, y]) => P.f(x, y));
  const fEnd = vals[vals.length - 1];
  const diverged = path.length < steps + 1 || fEnd > vals[0] * 10;
  const hit = vals.findIndex((v) => v < 1e-6 * Math.max(vals[0], 1e-12));
  const end = path[path.length - 1];
  const gEnd = P.g(end[0], end[1]);
  const atSaddle = fk === 'wells' && Math.hypot(...gEnd) < 1e-3 && Math.abs(end[0]) < 0.05;
  const lossPts = vals.map((v, k) => [k, Math.max(v, 1e-12)] as [number, number]);
  const q = fk === 'quad' ? (P as ReturnType<typeof quadProb>) : null;
  return (
    <FigureLayout
      side={
        <>
          {!spec.lockFn && <SegControl value={fk} onChange={(v) => { setFk(v); setStart(v === 'quad' ? [-2.5, 1.5] : [0.05, 1.8]); setEta(v === 'quad' ? 1 : 0.1); }} options={[{ v: 'quad', label: 'quadratic' }, { v: 'wells', label: 'two wells' }]} />}
          <Slider tex="\eta" value={eta} min={0.01} max={fk === 'quad' ? 2.2 : 0.6} step={0.01} onChange={setEta} />
          {fk === 'quad' && <Slider tex="\kappa" value={kappa} min={1} max={50} step={1} onChange={setKappa} />}
          <Slider label="steps" value={steps} min={1} max={400} step={1} onChange={setSteps} />
          <Readout
            rows={[
              ...(q ? ([['\\lambda_{\\max},\\ \\lambda_{\\min}', `${ff(1, 2)}, ${ff(q.lmin, 3)}`], ['\\eta\\lambda_{\\max}\\ (\\text{stable} < 2)', ff(eta, 2)]] as [string, string][]) : ([['\\eta\\lambda_{\\max}\\ (\\lambda_{\\max} = 4)', ff(4 * eta, 2)]] as [string, string][])),
              ['f(\\mathbf{x}_0) \\to f(\\mathbf{x}_{\\text{end}})', `${ff(vals[0], 3)} → ${fEnd > 1e6 ? '> 10⁶' : ff(fEnd, 5)}`],
              ['\\text{steps to } f < 10^{-6}f_0', hit >= 0 ? String(hit) : '—'],
            ]}
          />
          <div className="calc-msg">
            {diverged ? <b style={{ color: 'var(--bad)' }}>Diverging: η is above 2/λmax, so the steep direction overshoots more each step.</b> : atSaddle ? <b style={{ color: 'var(--warn)' }}>Stuck at the saddle point: the gradient is zero there, but it is not a minimum.</b> : fk === 'quad' && kappa > 1 && eta <= 2 ? <>The steep direction settles quickly; the shallow one shrinks by only <TeX>{`1 - \\eta\\lambda_{\\min} = ${ff(1 - eta / kappa, 3)}`}</TeX> per step.</> : <>Drag the start point.</>}
          </div>
        </>
      }
      below={
        <div className="calc-stack">
          <div className="calc-plotk">f(x_k) (log scale)</div>
          <LinePlot series={[{ pts: lossPts, color: 'var(--c-v)' }]} x={[0, Math.max(steps, 1)]} y={[1e-10, Math.max(10, vals[0] * 2)]} logY width={520} height={150} xlabel="step k" />
        </div>
      }
    >
      <Plane x={P.X} y={P.Y} width={420}>
        <Contours f={P.f} levels={P.levels} n={70} />
        {q && <Arrow from={[0, 0]} to={[q.dirs[0][0] * 0.9, q.dirs[0][1] * 0.9]} color="var(--muted)" width={1.5} />}
        {q && <Arrow from={[0, 0]} to={[q.dirs[1][0] * 1.6, q.dirs[1][1] * 1.6]} color="var(--muted)" width={1.5} />}
        <Path pts={path} color="var(--c-v)" width={1.8} />
        <Dots pts={path.slice(1)} r={2.4} color="var(--c-v)" opacity={0.9} />
        {fk === 'wells' && <Point at={[0, 0]} r={4} color="var(--warn)" hollow />}
        <Handle at={start} onChange={setStart} color="var(--fg)" snap={0.05} tex="\mathbf{x}_0" />
      </Plane>
    </FigureLayout>
  );
}

// ------------------------------------------------------------------ minibatch gradient noise

/**
 * calc.minibatch — linear regression y ≈ w x + b on 200 points. In the (w, b) plane: loss contours,
 * the full-batch negative gradient at a draggable θ, and 30 minibatch negative gradients for batch size B.
 * params: theta, logB
 */
function Minibatch({ spec }: { spec: VizSpec }) {
  const [theta, setTheta] = useState<P2>((spec.theta as P2) ?? [0, -1]);
  const [lb, setLb] = useState((spec.logB as number) ?? Math.log2(8));
  const [seed, setSeed] = useState(3);
  const B = Math.round(2 ** lb);
  const data = useMemo(() => {
    const r = new Rng(17);
    return Array.from({ length: 200 }, () => { const x = r.normal(); return [x, 2 * x + 1 + 0.8 * r.normal()] as P2; });
  }, []);
  const n = data.length;
  const loss = useMemo(() => (w: number, b: number) => { let s = 0; for (const [x, y] of data) s += (w * x + b - y) ** 2; return s / n; }, [data, n]);
  const grad = (w: number, b: number, idx: number[]): P2 => {
    let gw = 0, gb = 0;
    for (const i of idx) { const [x, y] = data[i]; const e = w * x + b - y; gw += 2 * e * x; gb += 2 * e; }
    return [gw / idx.length, gb / idx.length];
  };
  const all = useMemo(() => data.map((_, i) => i), [data]);
  const full = grad(theta[0], theta[1], all);
  const batches = useMemo(() => {
    const r = new Rng(seed * 101 + B);
    return Array.from({ length: 30 }, () => r.shuffle(all).slice(0, B));
  }, [seed, B, all]);
  const gs = batches.map((idx) => grad(theta[0], theta[1], idx));
  const mean: P2 = [gs.reduce((s, g) => s + g[0], 0) / gs.length, gs.reduce((s, g) => s + g[1], 0) / gs.length];
  const spread = gs.reduce((s, g) => s + (g[0] - full[0]) ** 2 + (g[1] - full[1]) ** 2, 0) / gs.length;
  // per-example variance (exact), to compare with spread ≈ (σ²/B)(n − B)/(n − 1)
  const per = all.map((i) => grad(theta[0], theta[1], [i]));
  const s2 = per.reduce((s, g) => s + (g[0] - full[0]) ** 2 + (g[1] - full[1]) ** 2, 0) / n;
  const theory = (s2 / B) * ((n - B) / (n - 1));
  const k = 0.12;
  const levels = useMemo(() => [0.7, 0.9, 1.3, 2, 3, 4.5, 6.5, 9, 12, 16, 21].map((v) => v), []);
  return (
    <FigureLayout
      side={
        <>
          <Slider label="batch size B" value={lb} min={0} max={Math.log2(200)} step={0.01} onChange={setLb} fmt={() => String(B)} />
          <div className="calc-row"><button onClick={() => setSeed(seed + 1)}>new batches</button></div>
          <Readout
            rows={[
              ['\\nabla L(\\boldsymbol\\theta)\\ \\text{(full batch)}', `(${ff(full[0])}, ${ff(full[1])})`],
              ['\\text{mean of 30 minibatch } \\mathbf{g}', `(${ff(mean[0])}, ${ff(mean[1])})`],
              ['\\text{avg } \\lVert\\mathbf{g} - \\nabla L\\rVert^2', ff(spread, 3)],
              ['\\text{theory } \\tfrac{\\sigma^2}{B}\\tfrac{n - B}{n - 1}', ff(theory, 3)],
            ]}
          />
          <div className="calc-note">Each thin arrow is the negative gradient of one random minibatch. They scatter around the full-batch arrow (thick) and average to it: the minibatch gradient is unbiased. The scatter shrinks like 1/B, and vanishes at B = n = 200.</div>
        </>
      }
    >
      <Plane x={[-1, 5]} y={[-2, 4]} width={420} xLabel="w" yLabel="b">
        <Contours f={loss} levels={levels} n={60} />
        {gs.map((g, i) => <Arrow key={i} from={theta} to={[theta[0] - k * g[0], theta[1] - k * g[1]]} color="var(--c-v)" width={1.2} opacity={0.55} />)}
        <Arrow from={theta} to={[theta[0] - k * full[0], theta[1] - k * full[1]]} color="var(--c-u)" width={3.2} tex="-\nabla L" labelAt={0.6} />
        <Point at={[2, 1]} r={3} color="var(--muted)" hollow />
        <Handle at={theta} onChange={setTheta} color="var(--fg)" snap={0.1} tex="\boldsymbol\theta" />
      </Plane>
    </FigureLayout>
  );
}

// ------------------------------------------------------------------ optimizers racing

type OptName = 'sgd' | 'mom' | 'rms' | 'adam';
const OPTS: { id: OptName; label: string; color: string }[] = [
  { id: 'sgd', label: 'GD / SGD', color: 'var(--c-u)' },
  { id: 'mom', label: 'momentum', color: 'var(--c-v)' },
  { id: 'rms', label: 'RMSProp', color: 'var(--c-k)' },
  { id: 'adam', label: 'Adam', color: 'var(--c-w)' },
];
interface RaceProb { f: (x: number, y: number) => number; g: (x: number, y: number) => P2; X: [number, number]; Y: [number, number]; start: P2; lr: Record<OptName, number>; T: number; noise: number; levels: number[]; min: P2; width: number }
const RAV_A = [0.1, 10];
const RACE: Record<string, RaceProb> = {
  ravine: {
    f: (x, y) => 0.5 * (RAV_A[0] * x * x + RAV_A[1] * y * y),
    g: (x, y) => [RAV_A[0] * x, RAV_A[1] * y],
    X: [-3, 3], Y: [-1.5, 1.5], start: [-2.8, 1], lr: { sgd: 0.15, mom: 0.02, rms: 0.02, adam: 0.05 }, T: 300, noise: 1,
    levels: [0.01, 0.04, 0.1, 0.2, 0.4, 0.7, 1.1, 1.6, 2.4, 3.5, 5, 7.5], min: [0, 0], width: 480,
  },
  rosen: {
    f: (x, y) => (1 - x) ** 2 + 100 * (y - x * x) ** 2,
    g: (x, y) => [-2 * (1 - x) - 400 * x * (y - x * x), 200 * (y - x * x)],
    X: [-2, 2], Y: [-1, 3], start: [-1.2, 1], lr: { sgd: 0.0015, mom: 0.0005, rms: 0.005, adam: 0.05 }, T: 1000, noise: 10,
    levels: [0.1, 0.5, 1.5, 4, 10, 25, 60, 150, 400, 1000], min: [1, 1], width: 420,
  },
};
function runOpt(o: OptName, P: RaceProb, lr: number, noise: number, seed: number): P2[] {
  const r = new Rng(seed);
  let [x, y] = P.start;
  let m: P2 = [0, 0], v: P2 = [0, 0];
  const out: P2[] = [[x, y]];
  for (let t = 1; t <= P.T; t++) {
    let [gx, gy] = P.g(x, y);
    if (noise > 0) { gx += noise * r.normal(); gy += noise * r.normal(); }
    if (o === 'sgd') { x -= lr * gx; y -= lr * gy; }
    else if (o === 'mom') { m = [0.9 * m[0] + gx, 0.9 * m[1] + gy]; x -= lr * m[0]; y -= lr * m[1]; }
    else if (o === 'rms') { v = [0.9 * v[0] + 0.1 * gx * gx, 0.9 * v[1] + 0.1 * gy * gy]; x -= (lr * gx) / (Math.sqrt(v[0]) + 1e-8); y -= (lr * gy) / (Math.sqrt(v[1]) + 1e-8); }
    else {
      m = [0.9 * m[0] + 0.1 * gx, 0.9 * m[1] + 0.1 * gy];
      v = [0.999 * v[0] + 0.001 * gx * gx, 0.999 * v[1] + 0.001 * gy * gy];
      const c1 = 1 - 0.9 ** t, c2 = 1 - 0.999 ** t;
      x -= (lr * (m[0] / c1)) / (Math.sqrt(v[0] / c2) + 1e-8);
      y -= (lr * (m[1] / c1)) / (Math.sqrt(v[1] / c2) + 1e-8);
    }
    if (!Number.isFinite(x) || !Number.isFinite(y) || Math.abs(x) > 1e4 || Math.abs(y) > 1e4) break;
    out.push([x, y]);
  }
  return out;
}

/**
 * calc.optim — GD, momentum, RMSProp and Adam race on an ill-conditioned ravine or on the Rosenbrock
 * function. Each optimizer has a hand-tuned learning rate; one slider scales all of them. Optional
 * gradient noise imitates minibatches. Play animates the paths; loss curves below.
 * params: problem ('ravine'|'rosen'), lockProblem
 */
function Optim({ spec }: { spec: VizSpec }) {
  const [pk, setPk] = useState((spec.problem as string) ?? 'ravine');
  const P = RACE[pk];
  const [lm, setLm] = useState(0);
  const [noise, setNoise] = useState(0);
  const [on, setOn] = useState<Record<OptName, boolean>>({ sgd: true, mom: true, rms: true, adam: true });
  const mult = 2 ** lm;
  const runs = useMemo(() => OPTS.map((o, i) => runOpt(o.id, P, P.lr[o.id] * mult, noise * P.noise, 7 + i)), [P, mult, noise]);
  const frames = 50;
  const { i, setI, controls } = usePlayer(frames, { interval: 80 });
  useEffect(() => setI(frames - 1), [pk]); // eslint-disable-line react-hooks/exhaustive-deps
  const upto = Math.round((P.T * (i + 1)) / frames);
  const H = Math.round((P.width * (P.Y[1] - P.Y[0])) / (P.X[1] - P.X[0]));
  const fmin = 1e-12;
  const series = OPTS.map((o, k) => ({ pts: runs[k].slice(0, upto + 1).map((p, t) => [t, Math.max(P.f(p[0], p[1]), fmin)] as [number, number]), color: o.color, label: o.label })).filter((_, k) => on[OPTS[k].id]);
  const fmt = (v: number) => (v < 1e-4 ? v.toExponential(1) : ff(v, 4));
  return (
    <FigureLayout
      side={
        <>
          {!spec.lockProblem && <SegControl value={pk} onChange={setPk} options={[{ v: 'ravine', label: 'ravine (κ = 100)' }, { v: 'rosen', label: 'Rosenbrock' }]} />}
          <Slider label="lr multiplier" value={lm} min={-3} max={3} step={0.25} onChange={setLm} fmt={() => `×${fx(mult, 3)}`} />
          <Slider label="gradient noise" value={noise} min={0} max={2} step={0.05} onChange={setNoise} />
          <Readout
            rows={OPTS.map((o, k) => {
              const run = runs[k];
              const p = run[Math.min(upto, run.length - 1)];
              const done = run.length < P.T + 1 && upto >= run.length - 1;
              return [`\\text{${o.label}}\\ (\\eta = ${fx(P.lr[o.id] * mult, 5)})`, <span style={{ color: o.color, fontWeight: 600 }}>{done ? 'diverged' : fmt(P.f(p[0], p[1]))}</span>] as [string, React.ReactNode];
            })}
            title={`loss after ${upto} steps`}
          />
          <div className="calc-row">
            {OPTS.map((o) => (
              <Toggle key={o.id} label={<span style={{ color: o.color }}>{o.label}</span>} value={on[o.id]} onChange={(v) => setOn({ ...on, [o.id]: v })} />
            ))}
          </div>
        </>
      }
      below={
        <div className="calc-stack">
          {controls}
          <div className="calc-plotk">loss f(x_t) − f* (log scale)</div>
          <LinePlot series={series.length ? series : [{ pts: [[0, 1]], color: 'transparent' }]} x={[0, P.T]} y={[1e-10, pk === 'rosen' ? 1e2 : 1e1]} logY width={520} height={170} xlabel="step t" legend={false} />
        </div>
      }
    >
      <Plane x={P.X} y={P.Y} width={P.width} height={H}>
        <Contours f={P.f} levels={P.levels} n={80} />
        <Point at={P.min} r={4} color="var(--fg)" hollow />
        {OPTS.map((o, k) => on[o.id] && <Path key={o.id} pts={runs[k].slice(0, upto + 1)} color={o.color} width={1.8} opacity={0.9} />)}
        {OPTS.map((o, k) => { if (!on[o.id]) return null; const run = runs[k]; const p = run[Math.min(upto, run.length - 1)]; return <Point key={o.id} at={p} r={4.5} color={o.color} />; })}
        <Point at={P.start} r={4} color="var(--fg)" />
      </Plane>
    </FigureLayout>
  );
}

// ------------------------------------------------------------------ learning-rate schedules

/**
 * calc.schedule — learning rate against training step for constant, step decay, linear decay and
 * cosine decay, each with optional linear warmup.
 * params: kind ('constant'|'step'|'linear'|'cosine'), warmup (fraction), minRatio
 */
function Schedule({ spec }: { spec: VizSpec }) {
  const [kind, setKind] = useState((spec.kind as string) ?? 'cosine');
  const [wu, setWu] = useState((spec.warmup as number) ?? 0.05);
  const [mr, setMr] = useState((spec.minRatio as number) ?? 0.1);
  const [t, setT] = useState(3000);
  const T = 10000, peak = 3e-4;
  const W = Math.round(wu * T);
  const lr = (s: number) => {
    if (s < W) return (peak * (s + 1)) / W;
    const u = (s - W) / Math.max(1, T - W);
    const lo = mr * peak;
    if (kind === 'constant') return peak;
    if (kind === 'step') return peak * (s < 0.5 * T ? 1 : s < 0.75 * T ? 0.1 : 0.01);
    if (kind === 'linear') return peak - (peak - lo) * u;
    return lo + 0.5 * (peak - lo) * (1 + Math.cos(Math.PI * u));
  };
  const pts = linspace(0, T - 1, 400).map((s) => [s, lr(Math.round(s))] as [number, number]);
  return (
    <FigureLayout
      side={
        <>
          <SegControl value={kind} onChange={setKind} options={[{ v: 'constant', label: 'constant' }, { v: 'step', label: 'step' }, { v: 'linear', label: 'linear' }, { v: 'cosine', label: 'cosine' }]} />
          <Slider label="warmup" value={wu} min={0} max={0.2} step={0.01} onChange={setWu} fmt={(v) => `${fx(100 * v, 0)}%`} />
          {(kind === 'linear' || kind === 'cosine') && <Slider label="final / peak" value={mr} min={0} max={0.5} step={0.01} onChange={setMr} />}
          <Slider label="step t" value={t} min={0} max={T - 1} step={10} onChange={setT} fmt={(v) => String(v)} />
          <Readout
            rows={[
              ['\\text{peak } \\eta,\\ \\text{total steps}', `3e-4, ${T.toLocaleString('en-US')}`],
              ['\\text{warmup steps}', String(W)],
              ['\\eta(t)', lr(t).toExponential(2)],
            ]}
          />
          {kind === 'cosine' && <div className="calc-note"><TeX>{'\\eta(t) = \\eta_{\\min} + \\tfrac12(\\eta_{\\max} - \\eta_{\\min})(1 + \\cos(\\pi u))'}</TeX>, where <TeX>u</TeX> is the fraction of post-warmup training done.</div>}
        </>
      }
    >
      <LinePlot series={[{ pts, color: 'var(--c-u)', width: 2.5 }]} x={[0, T]} y={[0, peak * 1.1]} width={440} height={260} xlabel="training step" ylabel="learning rate" vlines={[{ x: t, color: 'var(--c-v)' }, ...(W > 0 ? [{ x: W }] : [])]}>
        {(sx, sy) => <circle cx={sx(t)} cy={sy(lr(t))} r={5} style={{ fill: 'var(--c-v)' }} />}
      </LinePlot>
    </FigureLayout>
  );
}

const isDist = (v: unknown) => Array.isArray(v) && v.length === 4 && v.every(isNum) && Math.abs((v as number[]).reduce((s, x) => s + x, 0) - 1) < 1e-6;

export const optimViz = {
  'calc.entropy': { component: Entropy, validate: (s: VizSpec) => check(s, { p: isDist, q: isDist }, { unit: ['bits', 'nats'] }), doc: 'Two draggable 4-outcome distributions; H(p), H(q), H(p,q), KL both ways. params p, q, unit' },
  'calc.xent': { component: XEnt, validate: (s: VizSpec) => check(s, { z: (v) => Array.isArray(v) && v.length === 3 && v.every(isNum), y: (v) => v === 0 || v === 1 || v === 2 }), doc: '3-class softmax cross-entropy: probabilities, loss, gradient p − e_y. params z, y' },
  'calc.gd1d': { component: GD1D, validate: (s: VizSpec) => check(s, { eta: isNum, lambda: isNum, x0: isNum }), doc: 'GD on (λ/2)x²: regimes by ηλ. params eta, lambda, x0' },
  'calc.gd': { component: GD2D, validate: (s: VizSpec) => check(s, { eta: isNum, kappa: isNum, start: isPair, steps: isNum }, { fn: ['quad', 'wells'] }), doc: 'GD paths on an ill-conditioned quadratic or a two-well function with a saddle. params fn, eta, kappa, start, steps, lockFn' },
  'calc.minibatch': { component: Minibatch, validate: (s: VizSpec) => check(s, { theta: isPair, logB: isNum }), doc: 'Minibatch vs full-batch gradients for linear regression in (w, b). params theta, logB' },
  'calc.optim': { component: Optim, validate: (s: VizSpec) => check(s, {}, { problem: Object.keys(RACE) }), doc: 'SGD, momentum, RMSProp, Adam racing on a ravine or Rosenbrock. params problem, lockProblem' },
  'calc.schedule': { component: Schedule, validate: (s: VizSpec) => check(s, { warmup: isNum, minRatio: isNum }, { kind: ['constant', 'step', 'linear', 'cosine'] }), doc: 'Learning-rate schedules with warmup. params kind, warmup, minRatio' },
};
