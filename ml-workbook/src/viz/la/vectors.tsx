import { useState } from 'react';
import type { VizSpec } from '../../content/types';
import { Plane, Arrow, Handle, Poly, InfLine, Seg, Label, Path, Point, Slider, Readout, FigureLayout, SegControl, TeX, type P2 } from '../kit';
import { dot, norm, add, scale } from '../../math/linalg';

const f2 = (x: number) => (Math.round(x * 100) / 100).toString().replace(/^-0$/, '0');
const vt = (v: number[]) => `\\begin{bmatrix}${f2(v[0])}\\\\${f2(v[1])}\\end{bmatrix}`;

/**
 * la.vectors — drag u and v.
 *   mode 'add'   : u + v drawn tip-to-tail and as the parallelogram diagonal
 *   mode 'scale' : c·u with a slider for c (including negative c)
 *   mode 'combo' : a·u + b·v with sliders; the span of {u, v} is shaded (a line when dependent)
 * params: mode, u, v, a, b, range
 */
function Vectors({ spec }: { spec: VizSpec }) {
  const initialMode = (spec.mode as 'add' | 'scale' | 'combo') ?? 'add';
  const [mode, setMode] = useState(initialMode);
  const [u, setU] = useState<P2>((spec.u as P2) ?? [3, 1]);
  const [v, setV] = useState<P2>((spec.v as P2) ?? [1, 2]);
  const [a, setA] = useState((spec.a as number) ?? 1);
  const [b, setB] = useState((spec.b as number) ?? 1);
  const [c, setC] = useState(1.5);
  const R = (spec.range as number) ?? 6;
  const det = u[0] * v[1] - u[1] * v[0];
  const dependent = Math.abs(det) < 1e-9;
  const sum = add(u, v) as P2;
  const cu = scale(u, c) as P2;
  const combo = add(scale(u, a), scale(v, b)) as P2;
  return (
    <FigureLayout
      side={
        <>
          {spec.lockMode ? null : (
            <SegControl
              value={mode}
              onChange={setMode}
              options={[
                { v: 'add', label: 'u + v' },
                { v: 'scale', label: 'c·u' },
                { v: 'combo', label: 'a·u + b·v' },
              ]}
            />
          )}
          {mode === 'scale' && <Slider tex="c" value={c} min={-2} max={2.5} step={0.1} onChange={setC} />}
          {mode === 'combo' && (
            <>
              <Slider tex="a" value={a} min={-2} max={2} step={0.1} onChange={setA} />
              <Slider tex="b" value={b} min={-2} max={2} step={0.1} onChange={setB} />
            </>
          )}
          <Readout
            rows={[
              ['\\mathbf{u}', '$' + vt(u)],
              ['\\mathbf{v}', '$' + vt(v)],
              ...(mode === 'add' ? ([['\\mathbf{u}+\\mathbf{v}', '$' + vt(sum)]] as [string, string][]) : []),
              ...(mode === 'scale' ? ([[`${f2(c)}\\,\\mathbf{u}`, '$' + vt(cu)]] as [string, string][]) : []),
              ...(mode === 'combo' ? ([[`${f2(a)}\\mathbf{u}+${f2(b)}\\mathbf{v}`, '$' + vt(combo)]] as [string, string][]) : []),
            ]}
          />
          {mode === 'combo' && (
            <div className="small">
              {dependent ? (
                <>
                  <b>u and v are parallel.</b> Every combination lands on one line: the span is a line, not the plane.
                </>
              ) : (
                <>
                  u and v point in different directions, so some choice of <TeX>a, b</TeX> reaches <b>every</b> point of the plane.
                </>
              )}
            </div>
          )}
          <div className="muted small">Drag the arrow tips. Hold Alt for fine positions.</div>
        </>
      }
    >
      <Plane x={[-R, R]} y={[-R, R]} width={440}>
        {mode === 'combo' &&
          (dependent ? (
            <InfLine d={norm(u) > 1e-9 ? u : v} color="var(--c-w)" width={6} opacity={0.25} />
          ) : (
            <Poly pts={[[-99, -99], [99, -99], [99, 99], [-99, 99]]} fill="var(--c-w)" fillOpacity={0.06} />
          ))}
        {mode === 'add' && (
          <>
            <Poly pts={[[0, 0], u, sum, v]} fill="var(--c-w)" fillOpacity={0.08} />
            <Arrow from={u} to={sum} color="var(--c-v)" dashed width={2} />
            <Arrow from={v} to={sum} color="var(--c-u)" dashed width={2} opacity={0.5} />
            <Arrow to={sum} color="var(--c-w)" tex="\mathbf{u}+\mathbf{v}" labelAt={0.45} />
          </>
        )}
        {mode === 'scale' && (
          <>
            <InfLine d={u} color="var(--c-u)" dashed opacity={0.35} />
            <Arrow to={cu} color="var(--c-w)" width={5} opacity={0.75} tex={`${f2(c)}\\mathbf{u}`} labelAt={0.85} />
          </>
        )}
        {mode === 'combo' && (
          <>
            <Arrow to={scale(u, a) as P2} color="var(--c-u)" dashed width={2} />
            <Arrow from={scale(u, a) as P2} to={combo} color="var(--c-v)" dashed width={2} />
            <Arrow to={combo} color="var(--c-w)" tex="a\mathbf{u}+b\mathbf{v}" labelAt={0.4} />
          </>
        )}
        <Arrow to={u} color="var(--c-u)" tex="\mathbf{u}" />
        {mode !== 'scale' && <Arrow to={v} color="var(--c-v)" tex="\mathbf{v}" />}
        <Handle at={u} onChange={setU} color="var(--c-u)" snap={0.5} label="u" />
        {mode !== 'scale' && <Handle at={v} onChange={setV} color="var(--c-v)" snap={0.5} label="v" />}
      </Plane>
    </FigureLayout>
  );
}

/**
 * la.dot — dot product as "length of u times the signed length of v's shadow on u".
 * Shows the projection of v onto u, the angle, and colors the shadow by sign.
 * params: u, v, showCos (bool)
 */
function DotProduct({ spec }: { spec: VizSpec }) {
  const [u, setU] = useState<P2>((spec.u as P2) ?? [4, 1]);
  const [v, setV] = useState<P2>((spec.v as P2) ?? [1.5, 3]);
  const R = 5;
  const d = dot(u, v);
  const nu = norm(u), nv = norm(v);
  const cos = nu && nv ? d / (nu * nv) : 0;
  const theta = Math.acos(Math.max(-1, Math.min(1, cos)));
  const k = nu ? d / (nu * nu) : 0;
  const p = scale(u, k) as P2;
  const sign = Math.abs(d) < 1e-9 ? 0 : Math.sign(d);
  const col = sign > 0 ? 'var(--c-w)' : sign < 0 ? 'var(--c-err)' : 'var(--muted)';
  // angle arc
  const a0 = Math.atan2(u[1], u[0]), a1 = Math.atan2(v[1], v[0]);
  let da = a1 - a0;
  while (da > Math.PI) da -= 2 * Math.PI;
  while (da < -Math.PI) da += 2 * Math.PI;
  const arc: P2[] = Array.from({ length: 30 }, (_, i) => {
    const t = a0 + (da * i) / 29;
    return [0.9 * Math.cos(t), 0.9 * Math.sin(t)];
  });
  return (
    <FigureLayout
      side={
        <>
          <Readout
            rows={[
              ['\\mathbf{u}\\cdot\\mathbf{v} = u_1v_1+u_2v_2', `${f2(u[0])}·${f2(v[0])} + ${f2(u[1])}·${f2(v[1])} = ${f2(d)}`],
              ['\\lVert\\mathbf{u}\\rVert,\\ \\lVert\\mathbf{v}\\rVert', `${f2(nu)}, ${f2(nv)}`],
              ['\\theta', `${f2((theta * 180) / Math.PI)}°`],
              ['\\cos\\theta = \\frac{\\mathbf{u}\\cdot\\mathbf{v}}{\\lVert\\mathbf{u}\\rVert\\lVert\\mathbf{v}\\rVert}', f2(cos)],
              ['\\operatorname{proj}_{\\mathbf{u}}\\mathbf{v}', '$' + vt(p)],
            ]}
          />
          <div className="small">
            {sign > 0 && 'Angle below 90°: the shadow points along u, so the dot product is positive.'}
            {sign === 0 && 'Exactly 90°: no shadow at all. u · v = 0 means u and v are orthogonal.'}
            {sign < 0 && 'Angle above 90°: the shadow points against u, so the dot product is negative.'}
          </div>
          <div className="muted small">Drag both tips. Try to make the dot product exactly 0.</div>
        </>
      }
    >
      <Plane x={[-R, R]} y={[-R, R]} width={440}>
        <InfLine d={u} color="var(--c-u)" dashed opacity={0.3} />
        <Seg a={v} b={p} color="var(--muted)" dashed />
        <Seg a={[0, 0]} b={p} color={col} width={7} opacity={0.55} />
        <Path pts={arc} color="var(--muted)" width={1.5} />
        <Label at={[1.25 * Math.cos(a0 + da / 2), 1.25 * Math.sin(a0 + da / 2)]} tex="\theta" color="var(--muted)" />
        <Arrow to={u} color="var(--c-u)" tex="\mathbf{u}" />
        <Arrow to={v} color="var(--c-v)" tex="\mathbf{v}" />
        <Point at={p} r={3.5} color={col} />
        <Handle at={u} onChange={setU} color="var(--c-u)" snap={0.5} label="u" />
        <Handle at={v} onChange={setV} color="var(--c-v)" snap={0.5} label="v" />
      </Plane>
    </FigureLayout>
  );
}

/**
 * la.norms — the unit "circles" of the L1, L2 and L∞ norms, and a draggable point x with all three norms.
 * params: x, show ('all' | 'l1' | 'l2' | 'linf')
 */
function Norms({ spec }: { spec: VizSpec }) {
  const [x, setX] = useState<P2>((spec.x as P2) ?? [0.8, 0.6]);
  const [r, setR] = useState(1);
  const l1 = Math.abs(x[0]) + Math.abs(x[1]);
  const l2 = Math.hypot(x[0], x[1]);
  const li = Math.max(Math.abs(x[0]), Math.abs(x[1]));
  const circle: P2[] = Array.from({ length: 121 }, (_, i) => [r * Math.cos((i / 120) * 2 * Math.PI), r * Math.sin((i / 120) * 2 * Math.PI)]);
  return (
    <FigureLayout
      side={
        <>
          <Slider tex="r" value={r} min={0.5} max={1.8} step={0.05} onChange={setR} />
          <Readout
            rows={[
              ['\\lVert\\mathbf{x}\\rVert_1 = |x_1|+|x_2|', f2(l1)],
              ['\\lVert\\mathbf{x}\\rVert_2 = \\sqrt{x_1^2+x_2^2}', f2(l2)],
              ['\\lVert\\mathbf{x}\\rVert_\\infty = \\max|x_i|', f2(li)],
            ]}
          />
          <div className="small">
            Each outline is the set of points at distance <TeX>r</TeX> from the origin under one norm. A point is inside a shape exactly when that norm is below <TeX>r</TeX>. For every <TeX>{'\\mathbf{x}'}</TeX>: <TeX>{'\\lVert\\mathbf{x}\\rVert_\\infty \\le \\lVert\\mathbf{x}\\rVert_2 \\le \\lVert\\mathbf{x}\\rVert_1'}</TeX>.
          </div>
        </>
      }
    >
      <Plane x={[-2, 2]} y={[-2, 2]} width={400} gridStep={0.5}>
        <Poly pts={[[r, 0], [0, r], [-r, 0], [0, -r]]} fill="var(--c-v)" fillOpacity={0.08} stroke="var(--c-v)" width={2} />
        <Path pts={circle} color="var(--c-u)" width={2} closed />
        <Poly pts={[[r, r], [-r, r], [-r, -r], [r, -r]]} fill="none" fillOpacity={0} stroke="var(--c-w)" width={2} />
        <Label at={[0.05, r + 0.12]} text="L1" color="var(--c-v)" anchor="start" />
        <Label at={[r * 0.72 + 0.05, r * 0.72 + 0.1]} text="L2" color="var(--c-u)" anchor="start" />
        <Label at={[r + 0.05, r + 0.1]} text="L∞" color="var(--c-w)" anchor="start" />
        <Arrow to={x} color="var(--fg)" width={2} />
        <Handle at={x} onChange={setX} color="var(--fg)" snap={0.05} tex="\mathbf{x}" />
      </Plane>
    </FigureLayout>
  );
}

export const vectorsViz = {
  'la.vectors': { component: Vectors, doc: "Drag u, v. mode: 'add' | 'scale' | 'combo' (span shading). params u, v, a, b, range, lockMode" },
  'la.dot': { component: DotProduct, doc: 'Dot product as projection; angle, cosine, sign. params u, v' },
  'la.norms': { component: Norms, doc: 'L1/L2/L∞ unit balls with a draggable x. params x' },
};
