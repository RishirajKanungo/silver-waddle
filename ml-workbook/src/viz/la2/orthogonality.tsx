// la06 figures: orthonormal coordinates, orthogonal matrices, projection onto a plane,
// least-squares line fit, Gram–Schmidt step by step, and a conditioning preview.
import { useMemo, useState } from 'react';
import type { VizSpec } from '../../content/types';
import { Plane, Arrow, Handle, Poly, InfLine, Seg, Label, Path, Point, Slider, Readout, FigureLayout, SegControl, Toggle, usePlayer, MatGrid, Md, TeX, TGrid, Space3D, Arrow3, Seg3, PlanePatch, Point3 } from '../kit';
import type { P3 } from '../kit';
import { dot, norm, sub, scale, add, cross, type Mat } from '../../math/linalg';
import { f2, vt, mt, rad, deg, rot2, mv2, mm2, det2, svd2, type P2 } from './util';
import './la2.css';

// keep TeX inside template strings intact (same as md``)
const md0 = String.raw;

const angleBetween = (a: number[], b: number[]) => {
  const na = norm(a), nb = norm(b);
  if (na < 1e-9 || nb < 1e-9) return NaN;
  return deg(Math.acos(Math.max(-1, Math.min(1, dot(a, b) / (na * nb)))));
};

/** small right-angle marker at p between unit directions d1, d2 (world units s) */
function RightAngle({ p, d1, d2, s = 0.25, color = 'var(--muted)' }: { p: P2; d1: P2; d2: P2; s?: number; color?: string }) {
  const a: P2 = [p[0] + s * d1[0], p[1] + s * d1[1]];
  const c: P2 = [p[0] + s * d2[0], p[1] + s * d2[1]];
  const b: P2 = [a[0] + s * d2[0], a[1] + s * d2[1]];
  return <Path pts={[a, b, c]} color={color} width={1.3} />;
}

// ------------------------------------------------------------------ la.onb-coords
/**
 * Coordinates in an orthonormal basis are dot products. Rotate the basis (θ), drag x.
 * In 'skewed' mode the second basis vector is not perpendicular and dot products no longer reconstruct x.
 * params: x, theta (degrees), mode ('orthonormal' | 'skewed')
 */
function OnbCoords({ spec }: { spec: VizSpec }) {
  const [x, setX] = useState<P2>((spec.x as P2) ?? [2.5, 1]);
  const [th, setTh] = useState((spec.theta as number) ?? 30);
  const [mode, setMode] = useState<'orthonormal' | 'skewed'>((spec.mode as 'orthonormal') ?? 'orthonormal');
  const t = rad(th);
  const q1: P2 = [Math.cos(t), Math.sin(t)];
  const t2 = mode === 'orthonormal' ? t + Math.PI / 2 : t + rad(55);
  const q2: P2 = [Math.cos(t2), Math.sin(t2)];
  const c1 = dot(q1, x), c2 = dot(q2, x);
  const p1 = scale(q1, c1) as P2, p2 = scale(q2, c2) as P2;
  const rec = add(p1, p2) as P2;
  const ok = norm(sub(rec, x)) < 1e-6;
  const R = 3.5;
  return (
    <FigureLayout
      side={
        <>
          <SegControl value={mode} onChange={setMode} options={[{ v: 'orthonormal', label: 'orthonormal' }, { v: 'skewed', label: 'not orthogonal' }]} />
          <Slider tex="\theta" value={th} min={-90} max={90} step={1} onChange={setTh} fmt={(v) => v + '°'} />
          <Readout
            rows={[
              ['\\mathbf{q}_1\\cdot\\mathbf{q}_2', f2(dot(q1, q2))],
              ['c_1 = \\mathbf{q}_1\\cdot\\mathbf{x}', f2(c1)],
              ['c_2 = \\mathbf{q}_2\\cdot\\mathbf{x}', f2(c2)],
              ['c_1\\mathbf{q}_1 + c_2\\mathbf{q}_2', '$' + vt(rec)],
              ['\\mathbf{x}', '$' + vt(x)],
              ['c_1^2 + c_2^2', f2(c1 * c1 + c2 * c2)],
              ['\\lVert\\mathbf{x}\\rVert^2', f2(dot(x, x))],
            ]}
          />
          <div className="small">
            {ok ? (
              <>The two shadows add back up to <TeX>{'\\mathbf{x}'}</TeX>, and <TeX>{'c_1^2+c_2^2 = \\lVert\\mathbf{x}\\rVert^2'}</TeX> (Pythagoras).</>
            ) : (
              <>The basis is not orthogonal: the shadows <TeX>{'c_i\\mathbf{q}_i'}</TeX> no longer add up to <TeX>{'\\mathbf{x}'}</TeX> (orange dashed).</>
            )}
          </div>
        </>
      }
    >
      <Plane x={[-R, R]} y={[-R, R]} width={420}>
        <InfLine d={q1} color="var(--c-i)" dashed opacity={0.45} />
        <InfLine d={q2} color="var(--c-j)" dashed opacity={0.45} />
        <Seg a={x} b={p1} color="var(--c-i)" dashed opacity={0.8} />
        <Seg a={x} b={p2} color="var(--c-j)" dashed opacity={0.8} />
        <Seg a={[0, 0]} b={p1} color="var(--c-i)" width={6} opacity={0.35} />
        <Seg a={[0, 0]} b={p2} color="var(--c-j)" width={6} opacity={0.35} />
        {mode === 'orthonormal' && <RightAngle p={[0, 0]} d1={q1} d2={q2} s={0.22} />}
        {!ok && <Arrow to={rec} color="var(--c-v)" dashed width={2} />}
        <Arrow to={q1} color="var(--c-i)" width={3} />
        <Arrow to={q2} color="var(--c-j)" width={3} />
        <Label at={[1.45 * q1[0], 1.45 * q1[1]]} tex="\mathbf{q}_1" color="var(--c-i)" />
        <Label at={[1.45 * q2[0], 1.45 * q2[1]]} tex="\mathbf{q}_2" color="var(--c-j)" />
        <Point at={p1} r={3.5} color="var(--c-i)" />
        <Point at={p2} r={3.5} color="var(--c-j)" />
        <Arrow to={x} color="var(--c-u)" />
        <Handle at={x} onChange={setX} color="var(--c-u)" snap={0.25} tex="\mathbf{x}" label="x" />
      </Plane>
    </FigureLayout>
  );
}

// ------------------------------------------------------------------ la.ortho-q
const F_SHAPE: P2[] = ([[0.3, 0.3], [0.3, 2.3], [1.6, 2.3], [1.6, 1.9], [0.7, 1.9], [0.7, 1.45], [1.35, 1.45], [1.35, 1.05], [0.7, 1.05], [0.7, 0.3]] as P2[]).map(([x, y]) => [x - 2.8, y - 0.2] as P2);
/**
 * Orthogonal matrices preserve lengths and angles. Modes: rotation by θ, reflection across the line at angle θ,
 * and a shear for contrast. Drag u and v.
 * params: mode ('rotation' | 'reflection' | 'shear'), theta (deg), u, v
 */
function OrthoQ({ spec }: { spec: VizSpec }) {
  const [mode, setMode] = useState<'rotation' | 'reflection' | 'shear'>((spec.mode as 'rotation') ?? 'rotation');
  const [th, setTh] = useState((spec.theta as number) ?? 40);
  const [k, setK] = useState(0.8);
  const [u, setU] = useState<P2>((spec.u as P2) ?? [2, 0.5]);
  const [v, setV] = useState<P2>((spec.v as P2) ?? [0.5, 1.5]);
  const t = rad(th);
  const Q: Mat =
    mode === 'rotation'
      ? rot2(t)
      : mode === 'reflection'
        ? [
            [Math.cos(2 * t), Math.sin(2 * t)],
            [Math.sin(2 * t), -Math.cos(2 * t)],
          ]
        : [
            [1, k],
            [0, 1],
          ];
  const QtQ = mm2([[Q[0][0], Q[1][0]], [Q[0][1], Q[1][1]]], Q);
  const Qu = mv2(Q, u), Qv = mv2(Q, v);
  const R = 3.5;
  return (
    <FigureLayout
      side={
        <>
          <SegControl value={mode} onChange={setMode} options={[{ v: 'rotation', label: 'rotation' }, { v: 'reflection', label: 'reflection' }, { v: 'shear', label: 'shear' }]} />
          {mode !== 'shear' ? <Slider tex="\theta" value={th} min={-180} max={180} step={1} onChange={setTh} fmt={(x) => x + '°'} /> : <Slider tex="k" value={k} min={-1.5} max={1.5} step={0.1} onChange={setK} />}
          <Readout
            rows={[
              [mode === 'shear' ? 'A' : 'Q', '$' + mt(Q)],
              [mode === 'shear' ? 'A^{\\top}A' : 'Q^{\\top}Q', '$' + mt(QtQ)],
              ['\\det', f2(det2(Q))],
              ['\\lVert\\mathbf{u}\\rVert \\to \\lVert Q\\mathbf{u}\\rVert', `${f2(norm(u))} → ${f2(norm(Qu))}`],
              ['\\lVert\\mathbf{v}\\rVert \\to \\lVert Q\\mathbf{v}\\rVert', `${f2(norm(v))} → ${f2(norm(Qv))}`],
              ['\\text{angle}', `${f2(angleBetween(u, v), 1)}° → ${f2(angleBetween(Qu, Qv), 1)}°`],
            ]}
          />
          <div className="small">
            {mode === 'shear'
              ? 'A shear is not orthogonal: its columns are not unit and perpendicular, so lengths and angles change.'
              : mode === 'rotation'
                ? 'det = +1: a rotation keeps the F readable.'
                : 'det = −1: a reflection mirrors the F, but lengths and angles still survive.'}
          </div>
        </>
      }
    >
      <Plane x={[-R, R]} y={[-R, R]} width={420}>
        {mode === 'reflection' && <InfLine d={[Math.cos(t), Math.sin(t)]} color="var(--muted)" dashed width={2} />}
        <Poly pts={F_SHAPE} fill="var(--muted)" fillOpacity={0.12} stroke="var(--muted)" dashed />
        <Poly pts={F_SHAPE.map((p) => mv2(Q, p))} fill="var(--c-w)" fillOpacity={0.22} stroke="var(--c-w)" />
        <Arrow to={Qu} color="var(--c-u)" width={3} />
        <Arrow to={Qv} color="var(--c-v)" width={3} />
        <Label at={Qu} tex="Q\mathbf{u}" color="var(--c-u)" dx={Qu[0] >= 0 ? 22 : -22} dy={Qu[1] >= 0 ? 12 : -12} />
        <Label at={Qv} tex="Q\mathbf{v}" color="var(--c-v)" dx={Qv[0] >= 0 ? 22 : -22} dy={Qv[1] >= 0 ? 12 : -12} />
        <Arrow to={u} color="var(--c-u)" width={2} dashed opacity={0.6} />
        <Arrow to={v} color="var(--c-v)" width={2} dashed opacity={0.6} />
        <Handle at={u} onChange={setU} color="var(--c-u)" snap={0.25} tex="\mathbf{u}" label="u" />
        <Handle at={v} onChange={setV} color="var(--c-v)" snap={0.25} tex="\mathbf{v}" label="v" />
      </Plane>
    </FigureLayout>
  );
}

// ------------------------------------------------------------------ la.proj-plane3d
const sub3 = (a: P3, b: P3): P3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const add3 = (a: P3, b: P3): P3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sc3 = (a: P3, k: number): P3 => [a[0] * k, a[1] * k, a[2] * k];
const unit3 = (a: P3): P3 => {
  const n = Math.hypot(...a);
  return n < 1e-12 ? [0, 0, 0] : sc3(a, 1 / n);
};
/**
 * Projection of b onto the plane Col A (A is 3×2). Sliders move b; the residual e = b − p is drawn in red
 * with a right-angle marker. Readouts show x̂ from the normal equations and Aᵀe = 0.
 * params: a1, a2 (3-vectors, columns of A), b
 */
function ProjPlane3D({ spec }: { spec: VizSpec }) {
  const a1 = (spec.a1 as P3) ?? [1, 0, 1];
  const a2 = (spec.a2 as P3) ?? [0, 1, 1];
  const [b, setB] = useState<P3>((spec.b as P3) ?? [1, 3, 0]);
  const AtA = [
    [dot(a1, a1), dot(a1, a2)],
    [dot(a2, a1), dot(a2, a2)],
  ];
  const Atb = [dot(a1, b), dot(a2, b)];
  const d = det2(AtA);
  const xh = [(AtA[1][1] * Atb[0] - AtA[0][1] * Atb[1]) / d, (-AtA[1][0] * Atb[0] + AtA[0][0] * Atb[1]) / d];
  const p = add3(sc3(a1, xh[0]), sc3(a2, xh[1]));
  const e = sub3(b, p);
  const en = Math.hypot(...e);
  const eu = unit3(e);
  const tIn = unit3(Math.hypot(...p) > 0.3 ? sc3(p, -1) : a1);
  const h = 0.28;
  const m1 = add3(p, sc3(eu, h)), m2 = add3(add3(p, sc3(eu, h)), sc3(tIn, h)), m3 = add3(p, sc3(tIn, h));
  const setI = (i: number) => (val: number) => setB((old) => old.map((x, j) => (j === i ? val : x)) as P3);
  return (
    <FigureLayout
      side={
        <>
          <Slider tex="b_1" value={b[0]} min={-3} max={3} step={0.25} onChange={setI(0)} />
          <Slider tex="b_2" value={b[1]} min={-3} max={3} step={0.25} onChange={setI(1)} />
          <Slider tex="b_3" value={b[2]} min={-3} max={3} step={0.25} onChange={setI(2)} />
          <Readout
            rows={[
              ['A^{\\top}A', '$' + mt(AtA)],
              ['A^{\\top}\\mathbf{b}', '$' + vt(Atb)],
              ['\\hat{\\mathbf{x}}', '$' + vt(xh)],
              ['\\mathbf{p} = A\\hat{\\mathbf{x}}', '$' + vt(p)],
              ['\\mathbf{e} = \\mathbf{b}-\\mathbf{p}', '$' + vt(e)],
              ['A^{\\top}\\mathbf{e}', '$' + vt([dot(a1, e), dot(a2, e)])],
              ['\\lVert\\mathbf{e}\\rVert', f2(en)],
            ]}
          />
          <div className="small">{en < 1e-6 ? <>b lies in the plane: it is its own projection and the residual is zero.</> : <>The residual is perpendicular to both columns, so <TeX>{'A^{\\top}\\mathbf{e} = \\mathbf{0}'}</TeX>.</>}</div>
        </>
      }
    >
      <Space3D range={3.2} width={460} height={400} yaw0={(spec.yaw as number) ?? -0.2} pitch0={(spec.pitch as number) ?? 0.4} floor={false}>
        <PlanePatch u={a1} v={a2} s={1.6} fill="var(--c-w)" opacity={0.12} />
        <Arrow3 to={a1} color="var(--c-i)" tex="\mathbf{a}_1" />
        <Arrow3 to={a2} color="var(--c-j)" tex="\mathbf{a}_2" />
        <Seg3 a={[0, 0, 0]} b={p} color="var(--c-w)" width={3} />
        <Arrow3 to={p} color="var(--c-w)" tex="\mathbf{p}" />
        {en > 1e-6 && <Seg3 a={p} b={b} color="var(--c-err)" width={3} />}
        {en > 0.35 && <Seg3 a={m1} b={m2} color="var(--muted)" width={1.2} />}
        {en > 0.35 && <Seg3 a={m2} b={m3} color="var(--muted)" width={1.2} />}
        <Arrow3 to={b} color="var(--c-u)" tex="\mathbf{b}" />
        <Point3 at={p} color="var(--c-w)" r={3.5} />
      </Space3D>
    </FigureLayout>
  );
}

// ------------------------------------------------------------------ la.lsq-line
/**
 * Least-squares line through draggable points. Residuals drawn in red; the normal equations
 * AᵀA [c, m] = Aᵀy update live. Optional: try your own line and compare the sum of squared errors.
 * params: points (list of [x, y])
 */
function LsqLine({ spec }: { spec: VizSpec }) {
  const [pts, setPts] = useState<P2[]>((spec.points as P2[]) ?? [[0, 1], [1, 1.5], [2, 3.5], [4, 4], [5, 6]]);
  const [own, setOwn] = useState(false);
  const [oc, setOc] = useState(1);
  const [om, setOm] = useState(0.5);
  const n = pts.length;
  const Sx = pts.reduce((s, p) => s + p[0], 0), Sy = pts.reduce((s, p) => s + p[1], 0);
  const Sxx = pts.reduce((s, p) => s + p[0] * p[0], 0), Sxy = pts.reduce((s, p) => s + p[0] * p[1], 0);
  const D = n * Sxx - Sx * Sx;
  const ok = Math.abs(D) > 1e-9;
  const c = ok ? (Sxx * Sy - Sx * Sxy) / D : NaN;
  const m = ok ? (n * Sxy - Sx * Sy) / D : NaN;
  const res = pts.map((p) => p[1] - (c + m * p[0]));
  const sse = res.reduce((s, r) => s + r * r, 0);
  const sseOwn = pts.reduce((s, p) => s + (p[1] - (oc + om * p[0])) ** 2, 0);
  return (
    <FigureLayout
      side={
        <>
          <Readout
            title="normal equations"
            rows={[
              ['A^{\\top}A', '$' + mt([[n, Sx], [Sx, Sxx]])],
              ['A^{\\top}\\mathbf{y}', '$' + vt([Sy, Sxy])],
              ['\\hat c,\\ \\hat m', ok ? `${f2(c, 3)}, ${f2(m, 3)}` : 'not unique'],
              ['\\textstyle\\sum e_i', ok ? f2(res.reduce((s, r) => s + r, 0), 3) : '–'],
              ['\\textstyle\\sum x_i e_i', ok ? f2(res.reduce((s, r, i) => s + r * pts[i][0], 0), 3) : '–'],
              ['\\text{SSE} = \\lVert\\mathbf{e}\\rVert^2', ok ? f2(sse, 3) : '–'],
            ]}
          />
          <Toggle label="try your own line" value={own} onChange={setOwn} />
          {own && (
            <>
              <Slider tex="c" value={oc} min={-3} max={6} step={0.05} onChange={setOc} />
              <Slider tex="m" value={om} min={-2} max={3} step={0.05} onChange={setOm} />
              <Readout rows={[['\\text{your SSE}', f2(sseOwn, 3)]]} />
            </>
          )}
          {!ok && <div className="small">All points have the same x: the columns of A are parallel and the line is not unique.</div>}
          <div className="muted small">Drag the points. Hold Alt for fine positions.</div>
        </>
      }
    >
      <Plane x={[-1, 7]} y={[-1, 7]} width={420} xLabel="x" yLabel="y">
        {ok && pts.map((p, i) => <Seg key={'r' + i} a={p} b={[p[0], c + m * p[0]]} color="var(--c-err)" width={2.5} />)}
        {ok && <InfLine p={[0, c]} d={[1, m]} color="var(--c-w)" width={2.5} />}
        {own && <InfLine p={[0, oc]} d={[1, om]} color="var(--c-v)" width={2} dashed />}
        {pts.map((p, i) => (
          <Handle key={i} at={p} onChange={(q) => setPts((old) => old.map((o, j) => (j === i ? q : o)))} color="var(--c-u)" snap={0.25} label={`point ${i + 1}`} />
        ))}
      </Plane>
    </FigureLayout>
  );
}

// ------------------------------------------------------------------ la.gram-schmidt
const GS_PRESETS: Record<string, P3[]> = {
  standard: [[2, 1, 0], [1, 2, 1], [0, 1, 2]],
  'nearly dependent': [[2, 1, 0], [1, 2, 1], [1.6, 1.9, 0.75]],
};
/**
 * Gram–Schmidt on three vectors in R^3, one move per frame. R fills in as the steps run.
 * params: preset ('standard' | 'nearly dependent')
 */
function GramSchmidt({ spec }: { spec: VizSpec }) {
  const [preset, setPreset] = useState<string>((spec.preset as string) ?? 'standard');
  const A = GS_PRESETS[preset] ?? GS_PRESETS.standard;
  const g = useMemo(() => {
    const [a1, a2, a3] = A;
    const r11 = Math.hypot(...a1);
    const q1 = sc3(a1, 1 / r11);
    const r12 = dot(q1, a2);
    const s2 = sc3(q1, r12);
    const e2 = sub3(a2, s2);
    const r22 = Math.hypot(...e2);
    const q2 = sc3(e2, 1 / r22);
    const r13 = dot(q1, a3), r23 = dot(q2, a3);
    const s3 = add3(sc3(q1, r13), sc3(q2, r23));
    const e3 = sub3(a3, s3);
    const r33 = Math.hypot(...e3);
    const q3 = sc3(e3, 1 / r33);
    return { a1, a2, a3, q1, q2, q3, r11, r12, r22, r13, r23, r33, s2, e2, s3, e3 };
  }, [A]);
  const STEPS = [
    md0`Start with three independent vectors $\mathbf{a}_1, \mathbf{a}_2, \mathbf{a}_3$.`,
    md0`Normalize the first: $\mathbf{q}_1 = \mathbf{a}_1 / \lVert\mathbf{a}_1\rVert$, so $r_{11} = \lVert\mathbf{a}_1\rVert$.`,
    md0`Shadow of $\mathbf{a}_2$ on $\mathbf{q}_1$: $r_{12} = \mathbf{q}_1\cdot\mathbf{a}_2$.`,
    md0`Remove it: $\mathbf{e}_2 = \mathbf{a}_2 - r_{12}\mathbf{q}_1$ is orthogonal to $\mathbf{q}_1$.`,
    md0`Normalize: $\mathbf{q}_2 = \mathbf{e}_2/r_{22}$ with $r_{22} = \lVert\mathbf{e}_2\rVert$.`,
    md0`Shadow of $\mathbf{a}_3$ on the plane of $\mathbf{q}_1, \mathbf{q}_2$: $r_{13}\mathbf{q}_1 + r_{23}\mathbf{q}_2$.`,
    md0`Remove it: $\mathbf{e}_3 = \mathbf{a}_3 - r_{13}\mathbf{q}_1 - r_{23}\mathbf{q}_2$.`,
    md0`Normalize: $\mathbf{q}_3 = \mathbf{e}_3 / r_{33}$. Now $A = QR$ with $R$ upper triangular.`,
  ];
  const { i, controls } = usePlayer(STEPS.length, { interval: 1600 });
  const N = NaN;
  const Rm = [
    [i >= 1 ? g.r11 : N, i >= 2 ? g.r12 : N, i >= 5 ? g.r13 : N],
    [0, i >= 4 ? g.r22 : N, i >= 5 ? g.r23 : N],
    [0, 0, i >= 7 ? g.r33 : N],
  ];
  const hl: [number, number][] = i === 1 ? [[0, 0]] : i === 2 ? [[0, 1]] : i === 4 ? [[1, 1]] : i === 5 ? [[0, 2], [1, 2]] : i === 7 ? [[2, 2]] : [];
  return (
    <FigureLayout
      side={
        <>
          <SegControl value={preset} onChange={setPreset} options={Object.keys(GS_PRESETS).map((k) => ({ v: k, label: k }))} />
          <div className="la2-step">
            <Md text={STEPS[i]} />
          </div>
          <MatGrid m={Rm} fmt={(v) => f2(v)} cells={hl} caption={<TeX>{'R'}</TeX>} />
          <Readout
            rows={[
              ['\\mathbf{q}_1', i >= 1 ? '$' + vt(g.q1) : '·'],
              ['\\mathbf{q}_2', i >= 4 ? '$' + vt(g.q2) : '·'],
              ['\\mathbf{q}_3', i >= 7 ? '$' + vt(g.q3) : '·'],
            ]}
          />
        </>
      }
      below={controls}
    >
      <Space3D range={3} width={440} height={380} yaw0={-0.6} pitch0={0.4}>
        {(i === 5 || i === 6) && <PlanePatch u={g.q1} v={g.q2} s={2} fill="var(--c-w)" opacity={0.1} />}
        <Arrow3 to={g.a1} color="var(--c-u)" tex="\mathbf{a}_1" width={i >= 1 ? 1.5 : 2.5} />
        <Arrow3 to={g.a2} color="var(--c-v)" tex="\mathbf{a}_2" width={i >= 4 ? 1.5 : 2.5} />
        <Arrow3 to={g.a3} color="var(--c-k)" tex="\mathbf{a}_3" width={i >= 7 ? 1.5 : 2.5} />
        {(i === 2 || i === 3) && <Seg3 a={g.a2} b={g.s2} color="var(--muted)" dashed />}
        {(i === 2 || i === 3) && <Seg3 a={[0, 0, 0]} b={g.s2} color="var(--c-v)" width={6} opacity={0.35} />}
        {(i === 3 || i === 4) && <Arrow3 from={i === 3 ? g.s2 : [0, 0, 0]} to={i === 3 ? g.a2 : g.e2} color="var(--c-err)" tex={i === 3 ? '\\mathbf{e}_2' : undefined} />}
        {(i === 5 || i === 6) && <Seg3 a={g.a3} b={g.s3} color="var(--muted)" dashed />}
        {(i === 5 || i === 6) && <Seg3 a={[0, 0, 0]} b={g.s3} color="var(--c-k)" width={6} opacity={0.35} />}
        {(i === 6 || i === 7) && <Arrow3 from={i === 6 ? g.s3 : [0, 0, 0]} to={i === 6 ? g.a3 : g.e3} color="var(--c-err)" tex={i === 6 ? '\\mathbf{e}_3' : undefined} />}
        {i >= 1 && <Arrow3 to={g.q1} color="var(--c-w)" width={4} tex="\mathbf{q}_1" />}
        {i >= 4 && <Arrow3 to={g.q2} color="var(--c-w)" width={4} tex="\mathbf{q}_2" />}
        {i >= 7 && <Arrow3 to={g.q3} color="var(--c-w)" width={4} tex="\mathbf{q}_3" />}
      </Space3D>
    </FigureLayout>
  );
}

// ------------------------------------------------------------------ la.cond-preview
/**
 * Solving A x = b when the columns of A are nearly parallel. φ is the angle between the columns.
 * Drag b slightly away from b₀ = a₁ + a₂ (whose solution is x = (1, 1)) and watch x move.
 * params: phi (degrees)
 */
function CondPreview({ spec }: { spec: VizSpec }) {
  const [phi, setPhi] = useState((spec.phi as number) ?? 60);
  const p = rad(phi);
  const A: Mat = [
    [1, Math.cos(p)],
    [0, Math.sin(p)],
  ];
  const b0 = mv2(A, [1, 1]);
  const [db, setDb] = useState<P2>([0.15, 0.1]);
  const b: P2 = [b0[0] + db[0], b0[1] + db[1]];
  const dA = det2(A);
  const x: P2 = [(A[1][1] * b[0] - A[0][1] * b[1]) / dA, (-A[1][0] * b[0] + A[0][0] * b[1]) / dA];
  const { S } = svd2(A);
  const kappa = S[0] / S[1];
  const dx = Math.hypot(x[0] - 1, x[1] - 1);
  return (
    <FigureLayout
      side={
        <>
          <Slider tex="\varphi" value={phi} min={2} max={90} step={1} onChange={(v) => { setPhi(v); }} fmt={(v) => v + '°'} />
          <Readout
            rows={[
              ['\\mathbf{x}\\ \\text{for}\\ \\mathbf{b}_0', '$' + vt([1, 1])],
              ['\\mathbf{x}\\ \\text{for}\\ \\mathbf{b}', '$' + vt(x)],
              ['\\lVert\\Delta\\mathbf{b}\\rVert', f2(Math.hypot(...db), 3)],
              ['\\lVert\\Delta\\mathbf{x}\\rVert', f2(dx, 3)],
              ['\\sigma_1, \\sigma_2', `${f2(S[0], 3)}, ${f2(S[1], 3)}`],
              ['\\kappa(A) = \\sigma_1/\\sigma_2', f2(kappa, 1)],
              ['\\kappa(A^{\\top}A) = \\kappa(A)^2', f2(kappa * kappa, 1)],
            ]}
          />
          <div className="small">
            The grid is the image of the integer grid under <TeX>A</TeX>: the solution <TeX>{'\\mathbf{x}'}</TeX> is read off as grid coordinates of <TeX>{'\\mathbf{b}'}</TeX>. Thin cells mean a small move of <TeX>{'\\mathbf{b}'}</TeX> changes those coordinates a lot.
          </div>
        </>
      }
    >
      <Plane x={[-1, 4]} y={[-1.5, 2.5]} width={430} gridStep={1} ticks={false}>
        <TGrid M={A} extent={12} step={1} />
        <Arrow to={[A[0][0], A[1][0]]} color="var(--c-i)" tex="\mathbf{a}_1" width={3} />
        <Arrow to={[A[0][1], A[1][1]]} color="var(--c-j)" tex="\mathbf{a}_2" width={3} labelAt={0.9} />
        <Arrow from={[0, 0]} to={[x[0] * A[0][0], x[0] * A[1][0]]} color="var(--c-i)" dashed width={2} />
        <Arrow from={[x[0] * A[0][0], x[0] * A[1][0]]} to={b} color="var(--c-j)" dashed width={2} />
        <Point at={b0} color="var(--muted)" hollow />
        <Label at={b0} tex="\mathbf{b}_0" color="var(--muted)" dx={-16} dy={-16} />
        <Handle at={b} onChange={(q) => setDb([q[0] - b0[0], q[1] - b0[1]])} color="var(--c-u)" snap={0.05} tex="\mathbf{b}" label="b" />
      </Plane>
    </FigureLayout>
  );
}

export const orthoViz = {
  'la.onb-coords': { component: OnbCoords, doc: 'Coordinates in an orthonormal basis are dot products; skewed mode shows the failure. params x, theta (deg), mode' },
  'la.ortho-q': {
    component: OrthoQ,
    validate: (s: VizSpec) => (s.mode && !['rotation', 'reflection', 'shear'].includes(s.mode as string) ? 'mode must be rotation | reflection | shear' : null),
    doc: 'Rotation/reflection preserve lengths and angles (QᵀQ = I); shear does not. params mode, theta, u, v',
  },
  'la.proj-plane3d': {
    component: ProjPlane3D,
    validate: (s: VizSpec) => {
      for (const k of ['a1', 'a2', 'b']) if (s[k] !== undefined && !(Array.isArray(s[k]) && (s[k] as unknown[]).length === 3)) return `${k} must be a 3-vector`;
      const a1 = (s.a1 as P3) ?? [1, 0, 1], a2 = (s.a2 as P3) ?? [0, 1, 1];
      return Math.hypot(...cross(a1, a2)) < 1e-9 ? 'a1 and a2 must be independent' : null;
    },
    doc: 'Projection of b onto the plane spanned by a1, a2 in 3-D; residual and normal equations. params a1, a2, b',
  },
  'la.lsq-line': {
    component: LsqLine,
    validate: (s: VizSpec) => (s.points !== undefined && !(Array.isArray(s.points) && (s.points as unknown[]).length >= 2) ? 'points: at least two [x, y]' : null),
    doc: 'Least-squares line through draggable points with residuals and live normal equations. params points',
  },
  'la.gram-schmidt': {
    component: GramSchmidt,
    validate: (s: VizSpec) => (s.preset && !(s.preset as string in GS_PRESETS) ? 'unknown preset' : null),
    doc: "Gram–Schmidt in R^3 step by step, R filling in. params preset ('standard' | 'nearly dependent')",
  },
  'la.cond-preview': { component: CondPreview, doc: 'Nearly parallel columns: small change in b, large change in x; κ(A) and κ(AᵀA). params phi (deg)' },
};
