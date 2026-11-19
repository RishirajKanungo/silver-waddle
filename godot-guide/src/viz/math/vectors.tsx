// math.vectors: a draggable vector playground in Godot's y-down coordinates.
//   mode 'basic': a + b, b - a, a.normalized(), a.lerp(b, t), with lengths.
//   mode 'dot':   a.dot(b), a.cross(b), a.angle_to(b), b.project(a) and v.slide(n), with the front half-plane shaded.
import { useMemo, useState } from 'react';
import type { VizSpec } from '../../content/types';
import { Arrow, Handle, Path, Point, Poly, Seg, Label, ParamCurve, Slider, SegControl, Readout, FigureLayout } from '../kit';
import { CodeBlock } from '../../ui/GameCells';
import { GPlane, P, G, add, sub, mul, dot, cross, len, norm, lerpV, deg, f, gv, vs, type V } from './common';

type Show = 'sum' | 'diff' | 'unit' | 'lerp';
type DotShow = 'project' | 'slide';

const XR: [number, number] = [-6, 6];
const YR: [number, number] = [-4.5, 4.5];
const snap = 0.5;

export function VectorPlayground({ spec }: { spec: VizSpec }) {
  const mode = (spec.mode as 'basic' | 'dot') ?? 'basic';
  const [a, setA] = useState<V>((spec.a as V) ?? (mode === 'dot' ? [3, 0] : [3, -1]));
  const [b, setB] = useState<V>((spec.b as V) ?? (mode === 'dot' ? [2, 2] : [1, 2]));
  const [show, setShow] = useState<Show>('sum');
  const [dshow, setDshow] = useState<DotShow>('project');
  const [t, setT] = useState(0.25);

  return mode === 'basic' ? (
    <Basic a={a} b={b} setA={setA} setB={setB} show={show} setShow={setShow} t={t} setT={setT} />
  ) : (
    <DotView a={a} b={b} setA={setA} setB={setB} show={dshow} setShow={setDshow} />
  );
}

interface Props {
  a: V;
  b: V;
  setA: (v: V) => void;
  setB: (v: V) => void;
}

function Basic({ a, b, setA, setB, show, setShow, t, setT }: Props & { show: Show; setShow: (s: Show) => void; t: number; setT: (t: number) => void }) {
  const s = add(a, b), d = sub(b, a), u = norm(a), l = lerpV(a, b, t);
  const rows: [string, string][] = [
    ['\\mathbf{a}', vs(a, 1)],
    ['\\mathbf{b}', vs(b, 1)],
    ['|\\mathbf{a}| = \\sqrt{a_x^2 + a_y^2}', f(len(a))],
  ];
  if (show === 'sum') rows.push(['\\mathbf{a} + \\mathbf{b}', vs(s, 1)], ['|\\mathbf{a} + \\mathbf{b}|', f(len(s))]);
  if (show === 'diff') rows.push(['\\mathbf{b} - \\mathbf{a}', vs(d, 1)], ['|\\mathbf{b} - \\mathbf{a}| \\text{ (distance)}', f(len(d))]);
  if (show === 'unit') rows.push(['\\hat{\\mathbf{a}} = \\mathbf{a}/|\\mathbf{a}|', vs(u)], ['|\\hat{\\mathbf{a}}|', f(len(u))]);
  if (show === 'lerp') rows.push(['\\mathbf{a} + (\\mathbf{b} - \\mathbf{a})\\,t', vs(l)]);

  const code = useMemo(() => {
    const head = `var a := ${gv(a)}\nvar b := ${gv(b)}\n`;
    if (show === 'sum') return head + `var c := a + b            # ${vs(s, 1)}\nc.length()                # ${f(len(s))}`;
    if (show === 'diff') return head + `var to_b := b - a         # ${vs(d, 1)}: from the tip of a to the tip of b\nto_b.length()             # ${f(len(d))}, same as a.distance_to(b)\na.direction_to(b)         # ${vs(norm(d))}`;
    if (show === 'unit') return head + `a.length()                # ${f(len(a))}\na.normalized()            # ${vs(u)}\na.normalized().length()   # ${len(a) > 0 ? '1.00' : '0.00 (a zero vector stays zero)'}`;
    return head + `a.lerp(b, ${f(t)})          # ${vs(l)}: ${Math.round(t * 100)}% of the way from a to b`;
  }, [a, b, show, t, s, d, u, l]);

  return (
    <FigureLayout
      side={
        <>
          <SegControl
            label="show"
            value={show}
            onChange={setShow}
            options={[
              { v: 'sum', label: 'a + b' },
              { v: 'diff', label: 'b − a' },
              { v: 'unit', label: 'normalize' },
              { v: 'lerp', label: 'lerp' },
            ]}
          />
          {show === 'lerp' && <Slider label="weight t" value={t} min={0} max={1} step={0.05} onChange={setT} />}
          <Readout rows={rows} />
          <div className="math-note">Drag the tips of a and b. Coordinates are Godot's: x grows to the right, y grows downward.</div>
        </>
      }
      below={<CodeBlock code={code} compact />}
    >
      <GPlane x={XR} y={YR} ariaLabel="vector playground">
        {show === 'sum' && (
          <>
            <Seg a={P(a)} b={P(s)} color="var(--c-v)" dashed opacity={0.6} />
            <Seg a={P(b)} b={P(s)} color="var(--c-u)" dashed opacity={0.6} />
            <Arrow to={P(s)} color="var(--c-w)" label="a + b" labelAt={0.75} />
          </>
        )}
        {show === 'diff' && <Arrow from={P(a)} to={P(b)} color="var(--c-w)" label="b − a" />}
        {show === 'unit' && (
          <>
            <ParamCurve f={(th) => [Math.cos(th), Math.sin(th)]} color="var(--muted)" width={1} dashed />
            <Arrow to={P(u)} color="var(--c-w)" width={3.5} label="â" labelAt={1.1} />
          </>
        )}
        {show === 'lerp' && (
          <>
            <Seg a={P(a)} b={P(b)} color="var(--muted)" dashed />
            <Point at={P(l)} color="var(--c-w)" label={`lerp t=${f(t)}`} />
          </>
        )}
        <Arrow to={P(a)} color="var(--c-u)" />
        <Arrow to={P(b)} color="var(--c-v)" />
        <Handle at={P(a)} onChange={(p) => setA(G(p))} snap={snap} color="var(--c-u)" text="a" label="vector a" />
        <Handle at={P(b)} onChange={(p) => setB(G(p))} snap={snap} color="var(--c-v)" text="b" label="vector b" />
      </GPlane>
    </FigureLayout>
  );
}

function DotView({ a, b, setA, setB, show, setShow }: Props & { show: DotShow; setShow: (s: DotShow) => void }) {
  const ua = norm(a);
  const d = dot(a, b), c = cross(a, b);
  const ang = Math.atan2(c, d); // Vector2.angle_to
  const proj = mul(ua, dot(b, ua)); // b.project(a)
  const slid = sub(b, mul(ua, dot(b, ua))); // b.slide(n) with n = â
  const side = Math.abs(c) < 1e-9 ? 'on the line of a' : c > 0 ? 'clockwise from a (its right)' : 'counter-clockwise from a (its left)';
  const front = d > 1e-9 ? 'in front of a' : d < -1e-9 ? 'behind a' : 'exactly beside a';
  // front half-plane: points p with a·p > 0, drawn as a large polygon
  const perp: V = [-ua[1], ua[0]];
  const R = 20;
  const half = [add(mul(perp, R), [0, 0]), add(add(mul(perp, R), mul(ua, R)), [0, 0]), add(mul(perp, -R), mul(ua, R)), mul(perp, -R)].map(P);
  // angle arc from a to b, radius 0.8 (Godot coordinates, then mapped)
  const a0 = Math.atan2(ua[1], ua[0]);
  const arc: [number, number][] = [];
  for (let i = 0; i <= 30; i++) {
    const th = a0 + (ang * i) / 30;
    arc.push(P([0.8 * Math.cos(th), 0.8 * Math.sin(th)]));
  }
  const code = useMemo(
    () =>
      `var a := ${gv(a)}   # facing\nvar b := ${gv(b)}   # toward the target\n` +
      `a.dot(b)                    # ${f(d)}: ${front}\n` +
      `a.cross(b)                  # ${f(c)}: b is ${side}\n` +
      `rad_to_deg(a.angle_to(b))   # ${f(deg(ang), 1)}\n` +
      (show === 'project' ? `b.project(a)                # ${vs(proj)}: the part of b along a` : `b.slide(a.normalized())     # ${vs(slid)}: b with the part along the normal removed`),
    [a, b, d, c, ang, proj, slid, show, front, side],
  );
  return (
    <FigureLayout
      side={
        <>
          <SegControl
            label="show"
            value={show}
            onChange={setShow}
            options={[
              { v: 'project', label: 'project' },
              { v: 'slide', label: 'slide' },
            ]}
          />
          <Readout
            rows={[
              ['\\mathbf{a}\\cdot\\mathbf{b} = a_xb_x + a_yb_y', f(d)],
              ['|\\mathbf{a}||\\mathbf{b}|\\cos\\theta', f(len(a) * len(b) * Math.cos(ang))],
              ['\\theta \\text{ (angle\\_to)}', `${f(deg(ang), 1)}°`],
              ['\\hat{\\mathbf{a}}\\cdot\\hat{\\mathbf{b}} = \\cos\\theta', f(Math.cos(ang))],
              ['\\mathbf{a}\\times\\mathbf{b} = a_xb_y - a_yb_x', f(c)],
              show === 'project' ? ['\\text{project}', vs(proj)] : ['\\text{slide}', vs(slid)],
            ]}
          />
          <div className="math-note">
            b is <b>{front}</b> and <b>{side}</b>. The shaded half-plane is where the dot product with a is positive.
            {show === 'slide' && ' In slide mode a is a wall normal: the grey line is the wall, and slide keeps only the part of b along it.'}
          </div>
        </>
      }
      below={<CodeBlock code={code} compact />}
    >
      <GPlane x={XR} y={YR} ariaLabel="dot and cross product playground">
        <Poly pts={half} fill="var(--c-u)" fillOpacity={0.08} />
        {show === 'project' && (
          <>
            <Seg a={P(b)} b={P(proj)} color="var(--muted)" dashed />
            <Arrow to={P(proj)} color="var(--c-w)" width={3.5} label="project" labelAt={0.5} />
          </>
        )}
        {show === 'slide' && (
          <>
            <Seg a={P(mul(perp, -10))} b={P(mul(perp, 10))} color="var(--muted)" width={3} opacity={0.6} />
            <Seg a={P(b)} b={P(slid)} color="var(--muted)" dashed />
            <Arrow to={P(slid)} color="var(--c-w)" width={3.5} label="slide" labelAt={0.5} />
          </>
        )}
        {len(a) > 0 && len(b) > 0 && <Path pts={arc} color="var(--c-k)" width={1.6} />}
        {len(a) > 0 && len(b) > 0 && <Label at={P(mul(norm(add(ua, norm(b))), 1.25))} text={`${f(deg(ang), 0)}°`} color="var(--c-k)" />}
        <Arrow to={P(a)} color="var(--c-u)" />
        <Arrow to={P(b)} color="var(--c-v)" />
        <Handle at={P(a)} onChange={(p) => setA(G(p))} snap={snap} color="var(--c-u)" text={show === 'slide' ? 'n' : 'a'} label="vector a" />
        <Handle at={P(b)} onChange={(p) => setB(G(p))} snap={snap} color="var(--c-v)" text="b" label="vector b" />
      </GPlane>
    </FigureLayout>
  );
}
