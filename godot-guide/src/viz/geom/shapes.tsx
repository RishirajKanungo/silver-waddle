// math.collisionShapes: drag two shapes and watch the overlap test the lesson writes in GDScript.
// Modes: rect (Rect2.intersects), circle (distance² against (r1 + r2)²), rectcircle (clamp to the
// closest point) and sat (oriented boxes, separating axis test on four axes).
import { useMemo, useState } from 'react';
import type { VizSpec } from '../../content/types';
import { FigureLayout, Readout, Slider, SegControl } from '../kit';
import { CodeBlock } from '../../ui/GameCells';
import { useSvgDrag, type V2, sub, dot, norm, clamp, obbCorners, project, vec } from './util';

type Mode = 'rect' | 'circle' | 'rectcircle' | 'sat';
const W = 320, H = 180;

export function CollisionShapes({ spec }: { spec: VizSpec }) {
  const [mode, setMode] = useState<Mode>((spec.mode as Mode) ?? 'rect');
  const [a, setA] = useState<V2>([120, 90]);
  const [b, setB] = useState<V2>([196, 84]);
  const [ra, setRa] = useState(22);
  const [rb, setRb] = useState(30);
  const [rotA, setRotA] = useState(20);
  const [rotB, setRotB] = useState(-35);
  const [axisIdx, setAxisIdx] = useState(0);
  const { svgProps, begin } = useSvgDrag((id, p) => {
    const q: V2 = [clamp(Math.round(p[0]), 0, W), clamp(Math.round(p[1]), 0, H)];
    if (id === 'a') setA(q);
    else setB(q);
  });
  // rect sizes (half extents) are fixed so the numbers stay readable
  const ahw = 32, ahh = 20, bhw = 24, bhh = 28;

  const r = useMemo(() => {
    if (mode === 'rect') {
      const A = { px: a[0] - ahw, py: a[1] - ahh, ex: a[0] + ahw, ey: a[1] + ahh };
      const B = { px: b[0] - bhw, py: b[1] - bhh, ex: b[0] + bhw, ey: b[1] + bhh };
      const c = [A.px < B.ex, B.px < A.ex, A.py < B.ey, B.py < A.ey];
      const hit = c.every(Boolean);
      const ox = Math.min(A.ex, B.ex) - Math.max(A.px, B.px);
      const oy = Math.min(A.ey, B.ey) - Math.max(A.py, B.py);
      // minimum push: move B out along the axis with the smaller overlap
      const push: V2 = ox < oy ? [b[0] >= a[0] ? ox : -ox, 0] : [0, b[1] >= a[1] ? oy : -oy];
      return { kind: 'rect' as const, A, B, c, hit, ox, oy, push };
    }
    if (mode === 'circle') {
      const d2 = (b[0] - a[0]) ** 2 + (b[1] - a[1]) ** 2;
      const rs = ra + rb;
      const hit = d2 < rs * rs;
      const d = Math.sqrt(d2);
      const n = norm(sub(b, a));
      return { kind: 'circle' as const, d2, d, rs, hit, pen: rs - d, n };
    }
    if (mode === 'rectcircle') {
      const px = a[0] - ahw, py = a[1] - ahh, ex = a[0] + ahw, ey = a[1] + ahh;
      const closest: V2 = [clamp(b[0], px, ex), clamp(b[1], py, ey)];
      const d2 = (b[0] - closest[0]) ** 2 + (b[1] - closest[1]) ** 2;
      return { kind: 'rectcircle' as const, closest, d2, hit: d2 < rb * rb, inside: d2 === 0 };
    }
    const ca = obbCorners(a, ahw, ahh, (rotA * Math.PI) / 180);
    const cb = obbCorners(b, bhw, bhh, (rotB * Math.PI) / 180);
    const edgeNormal = (c: V2[], i: number): V2 => {
      const e = sub(c[(i + 1) % 4], c[i]);
      return norm([-e[1], e[0]]);
    };
    const axes: V2[] = [edgeNormal(ca, 0), edgeNormal(ca, 1), edgeNormal(cb, 0), edgeNormal(cb, 1)];
    const rows = axes.map((ax) => {
      const pa = project(ca, ax), pb = project(cb, ax);
      const overlap = Math.min(pa[1], pb[1]) - Math.max(pa[0], pb[0]);
      return { ax, pa, pb, overlap };
    });
    const hit = rows.every((x) => x.overlap > 0);
    return { kind: 'sat' as const, ca, cb, rows, hit };
  }, [mode, a, b, ra, rb, rotA, rotB]);

  const hitCol = r.hit ? 'var(--c-err)' : 'var(--c-w)';
  const colA = 'var(--c-u)', colB = 'var(--c-v)';

  const code = useMemo(() => {
    if (r.kind === 'rect')
      return `# Rect2(position, size): position is the top-left corner
var a := Rect2(${r.A.px}, ${r.A.py}, ${ahw * 2}, ${ahh * 2})
var b := Rect2(${r.B.px}, ${r.B.py}, ${bhw * 2}, ${bhh * 2})
# a.intersects(b) is these four comparisons:
var hit := a.position.x < b.end.x and b.position.x < a.end.x \\
		and a.position.y < b.end.y and b.position.y < a.end.y
print(hit)  # ${r.hit}`;
    if (r.kind === 'circle')
      return `var a_pos := Vector2(${a[0]}, ${a[1]})
var b_pos := Vector2(${b[0]}, ${b[1]})
var ra := ${ra.toFixed(1)}
var rb := ${rb.toFixed(1)}
# compare squared distances: no square root needed
var hit := a_pos.distance_squared_to(b_pos) < (ra + rb) * (ra + rb)
print(hit)  # ${r.d2.toFixed(0)} < ${(r.rs * r.rs).toFixed(0)} is ${r.hit}`;
    if (r.kind === 'rectcircle')
      return `var rect := Rect2(${a[0] - ahw}, ${a[1] - ahh}, ${ahw * 2}, ${ahh * 2})
var center := Vector2(${b[0]}, ${b[1]})
var radius := ${rb.toFixed(1)}
# the point of the rectangle closest to the circle's centre
var closest := center.clamp(rect.position, rect.end)  # ${vec(r.closest, (v) => v.toFixed(0))}
var hit := center.distance_squared_to(closest) < radius * radius
print(hit)  # ${r.hit}`;
    return `## Separating axis test for two convex polygons (arrays of corners).
func sat_overlap(a: PackedVector2Array, b: PackedVector2Array) -> bool:
	for poly in [a, b]:
		for i in poly.size():
			var edge: Vector2 = poly[(i + 1) % poly.size()] - poly[i]
			var axis := Vector2(-edge.y, edge.x).normalized()
			var a_min := INF
			var a_max := -INF
			for p in a:
				a_min = minf(a_min, p.dot(axis))
				a_max = maxf(a_max, p.dot(axis))
			var b_min := INF
			var b_max := -INF
			for p in b:
				b_min = minf(b_min, p.dot(axis))
				b_max = maxf(b_max, p.dot(axis))
			if a_max <= b_min or b_max <= a_min:
				return false  # found a gap: separated
	return true  # no gap on any axis: overlapping  (now: ${r.hit})`;
  }, [r, a, b, ra, rb]);

  const grid = [];
  for (let x = 16; x < W; x += 16) grid.push(<line key={'x' + x} x1={x} x2={x} y1={0} y2={H} className="pl-grid" />);
  for (let y = 16; y < H; y += 16) grid.push(<line key={'y' + y} y1={y} y2={y} x1={0} x2={W} className="pl-grid" />);

  const handle = (id: 'a' | 'b', p: V2) => ({ onPointerDown: (e: React.PointerEvent) => begin(id, e, p) });

  let shapes: React.ReactNode = null;
  let rows: [string, React.ReactNode][] = [];
  let compare: React.ReactNode = null;
  if (r.kind === 'rect') {
    shapes = (
      <>
        <rect x={r.A.px} y={r.A.py} width={ahw * 2} height={ahh * 2} className="geom-shape" style={{ fill: colA, stroke: colA }} {...handle('a', a)} />
        <rect x={r.B.px} y={r.B.py} width={bhw * 2} height={bhh * 2} className="geom-shape" style={{ fill: colB, stroke: colB }} {...handle('b', b)} />
        {r.hit && <rect x={Math.max(r.A.px, r.B.px)} y={Math.max(r.A.py, r.B.py)} width={r.ox} height={r.oy} style={{ fill: 'var(--c-err)', opacity: 0.35 }} pointerEvents="none" />}
        {r.hit && <line x1={b[0]} y1={b[1]} x2={b[0] + r.push[0]} y2={b[1] + r.push[1]} className="geom-arrow" style={{ stroke: 'var(--c-err)' }} markerEnd="url(#geom-head-err)" />}
        {/* x and y intervals drawn on the axes */}
        <line x1={r.A.px} x2={r.A.ex} y1={H - 6} y2={H - 6} style={{ stroke: colA, strokeWidth: 4 }} />
        <line x1={r.B.px} x2={r.B.ex} y1={H - 11} y2={H - 11} style={{ stroke: colB, strokeWidth: 4 }} />
        <line y1={r.A.py} y2={r.A.ey} x1={5} x2={5} style={{ stroke: colA, strokeWidth: 4 }} />
        <line y1={r.B.py} y2={r.B.ey} x1={10} x2={10} style={{ stroke: colB, strokeWidth: 4 }} />
      </>
    );
    const lbl = ['a.position.x < b.end.x', 'b.position.x < a.end.x', 'a.position.y < b.end.y', 'b.position.y < a.end.y'];
    const nums = [`${r.A.px} < ${r.B.ex}`, `${r.B.px} < ${r.A.ex}`, `${r.A.py} < ${r.B.ey}`, `${r.B.py} < ${r.A.ey}`];
    compare = (
      <table className="geom-table">
        <tbody>
          {lbl.map((l, i) => (
            <tr key={i}>
              <td>
                <code>{l}</code>
              </td>
              <td>{nums[i]}</td>
              <td className={r.c[i] ? 'geom-yes' : 'geom-no'}>{r.c[i] ? 'true' : 'false'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    );
    rows.push(['\\text{overlap } x, y', r.hit ? `${r.ox}, ${r.oy} px` : 'none']);
    if (r.hit) rows.push(['\\text{push out}', vec(r.push, (v) => v.toFixed(0))]);
  } else if (r.kind === 'circle') {
    shapes = (
      <>
        <circle cx={a[0]} cy={a[1]} r={ra} className="geom-shape" style={{ fill: colA, stroke: colA }} {...handle('a', a)} />
        <circle cx={b[0]} cy={b[1]} r={rb} className="geom-shape" style={{ fill: colB, stroke: colB }} {...handle('b', b)} />
        <line x1={a[0]} y1={a[1]} x2={b[0]} y2={b[1]} style={{ stroke: hitCol, strokeWidth: 1.5, strokeDasharray: '4 3' }} pointerEvents="none" />
        {r.hit && r.d > 0.01 && <line x1={b[0]} y1={b[1]} x2={b[0] + r.n[0] * r.pen} y2={b[1] + r.n[1] * r.pen} className="geom-arrow" style={{ stroke: 'var(--c-err)' }} markerEnd="url(#geom-head-err)" />}
      </>
    );
    rows = [
      ['d = |b - a|', `${r.d.toFixed(1)} px`],
      ['r_a + r_b', `${r.rs.toFixed(1)} px`],
      ['d^2 \\;<\\; (r_a + r_b)^2', <span key="c" className={r.hit ? 'geom-yes' : 'geom-no'}>{`${r.d2.toFixed(0)} < ${(r.rs * r.rs).toFixed(0)} ${r.hit}`}</span>],
      ['\\text{penetration}', r.hit ? `${r.pen.toFixed(1)} px` : 'none'],
    ];
  } else if (r.kind === 'rectcircle') {
    shapes = (
      <>
        <rect x={a[0] - ahw} y={a[1] - ahh} width={ahw * 2} height={ahh * 2} className="geom-shape" style={{ fill: colA, stroke: colA }} {...handle('a', a)} />
        <circle cx={b[0]} cy={b[1]} r={rb} className="geom-shape" style={{ fill: colB, stroke: colB }} {...handle('b', b)} />
        <line x1={b[0]} y1={b[1]} x2={r.closest[0]} y2={r.closest[1]} style={{ stroke: hitCol, strokeWidth: 1.5, strokeDasharray: '4 3' }} pointerEvents="none" />
        <circle cx={r.closest[0]} cy={r.closest[1]} r={3} style={{ fill: hitCol }} pointerEvents="none" />
      </>
    );
    rows = [
      ['\\text{closest}', vec(r.closest, (v) => v.toFixed(0))],
      ['|c - \\text{closest}|', `${Math.sqrt(r.d2).toFixed(1)} px`],
      ['\\text{radius}', `${rb.toFixed(1)} px`],
      ['\\text{hit}', <span key="h" className={r.hit ? 'geom-yes' : 'geom-no'}>{String(r.hit)}{r.inside ? ' (centre inside)' : ''}</span>],
    ];
  } else {
    const sel = r.rows[axisIdx];
    // draw the selected axis as a line through the middle of the figure, with both projections
    // the axis line passes between the two shapes; projections are drawn on it, A just above B
    const o: V2 = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    const base = dot(o, sel.ax);
    const at = (s: number): V2 => [o[0] + sel.ax[0] * (s - base), o[1] + sel.ax[1] * (s - base)];
    const perp: V2 = [-sel.ax[1], sel.ax[0]];
    const shift = (p: V2, k: number): V2 => [p[0] + perp[0] * k, p[1] + perp[1] * k];
    const pa0 = shift(at(sel.pa[0]), -3), pa1 = shift(at(sel.pa[1]), -3);
    const pb0 = shift(at(sel.pb[0]), 3), pb1 = shift(at(sel.pb[1]), 3);
    const far0 = shift(at(base - 400), 0), far1 = shift(at(base + 400), 0);
    shapes = (
      <>
        <polygon points={r.ca.map((p) => p.join(',')).join(' ')} className="geom-shape" style={{ fill: colA, stroke: colA }} {...handle('a', a)} />
        <polygon points={r.cb.map((p) => p.join(',')).join(' ')} className="geom-shape" style={{ fill: colB, stroke: colB }} {...handle('b', b)} />
        <line x1={far0[0]} y1={far0[1]} x2={far1[0]} y2={far1[1]} style={{ stroke: 'var(--axis)', strokeWidth: 1 }} pointerEvents="none" />
        <line x1={pa0[0]} y1={pa0[1]} x2={pa1[0]} y2={pa1[1]} style={{ stroke: colA, strokeWidth: 5 }} pointerEvents="none" />
        <line x1={pb0[0]} y1={pb0[1]} x2={pb1[0]} y2={pb1[1]} style={{ stroke: colB, strokeWidth: 5 }} pointerEvents="none" />
        {[...r.ca, ...r.cb].map((p, i) => {
          const q = shift(at(dot(p, sel.ax)), i < 4 ? -3 : 3);
          return <line key={i} x1={p[0]} y1={p[1]} x2={q[0]} y2={q[1]} style={{ stroke: i < 4 ? colA : colB, strokeWidth: 0.6, strokeDasharray: '2 2', opacity: 0.6 }} pointerEvents="none" />;
        })}
      </>
    );
    rows = r.rows.map((x, i) => [`\\text{axis } ${i + 1}${i < 2 ? ' (A)' : ' (B)'}`, <span key={i} className={x.overlap > 0 ? 'geom-yes' : 'geom-no'}>{x.overlap > 0 ? `overlap ${x.overlap.toFixed(1)}` : `gap ${(-x.overlap).toFixed(1)}`}</span>]);
    rows.push(['\\text{result}', <b key="r" className={r.hit ? 'geom-no' : 'geom-yes'}>{r.hit ? 'colliding' : 'separated'}</b>]);
  }

  return (
    <FigureLayout
      side={
        <>
          <SegControl
            value={mode}
            onChange={setMode}
            options={[
              { v: 'rect', label: 'box/box' },
              { v: 'circle', label: 'circles' },
              { v: 'rectcircle', label: 'box/circle' },
              { v: 'sat', label: 'rotated' },
            ]}
          />
          {mode === 'circle' && <Slider label="radius a" value={ra} min={6} max={60} step={1} onChange={setRa} fmt={(v) => v.toFixed(0)} />}
          {(mode === 'circle' || mode === 'rectcircle') && <Slider label="radius b" value={rb} min={6} max={60} step={1} onChange={setRb} fmt={(v) => v.toFixed(0)} />}
          {mode === 'sat' && (
            <>
              <Slider label="rotate A" value={rotA} min={-90} max={90} step={1} onChange={setRotA} fmt={(v) => v.toFixed(0) + '°'} />
              <Slider label="rotate B" value={rotB} min={-90} max={90} step={1} onChange={setRotB} fmt={(v) => v.toFixed(0) + '°'} />
              <SegControl label="show axis" value={axisIdx} onChange={setAxisIdx} options={[0, 1, 2, 3].map((i) => ({ v: i, label: String(i + 1) }))} />
            </>
          )}
          <Readout rows={rows} title={r.hit ? 'overlapping' : 'not overlapping'} />
          <div className="geom-note">Drag either shape. Coordinates are game pixels, y grows downward as in Godot.</div>
        </>
      }
      below={
        <>
          {compare}
          <CodeBlock code={code} file={mode === 'sat' ? 'scripts/sat.gd' : undefined} compact />
        </>
      }
    >
      <svg viewBox={`0 0 ${W} ${H}`} className="geom-svg" {...svgProps} role="img" aria-label="two shapes to drag and test for overlap">
        <defs>
          <marker id="geom-head-err" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse">
            <path d="M0,0 L10,5 L0,10 z" style={{ fill: 'var(--c-err)' }} />
          </marker>
        </defs>
        <rect width={W} height={H} className="pl-bg" />
        {grid}
        {shapes}
        <text x={a[0]} y={a[1] + 4} textAnchor="middle" className="geom-tag" pointerEvents="none">A</text>
        <text x={b[0]} y={b[1] + 4} textAnchor="middle" className="geom-tag" pointerEvents="none">B</text>
        <rect x={0.5} y={0.5} width={W - 1} height={H - 1} style={{ fill: 'none', stroke: r.hit ? 'var(--c-err)' : 'var(--line)', strokeWidth: r.hit ? 2 : 1 }} pointerEvents="none" />
      </svg>
    </FigureLayout>
  );
}
