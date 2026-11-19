// math.bezier: quadratic and cubic Bezier curves by De Casteljau's repeated lerp, in Godot coordinates.
// Drag the control points; scrub or play t; compare even-t sampling with even spacing along the curve.
import { useEffect, useMemo, useRef, useState } from 'react';
import type { VizSpec } from '../../content/types';
import { Handle, Path, Point, Seg, Arrow, Slider, Toggle, SegControl, Readout, FigureLayout } from '../kit';
import { CodeBlock } from '../../ui/GameCells';
import { animFrame } from '../game';
import { GPlane, P, G, lerpV, sub, len, f, gv, vs, PlaneSprite, type V } from './common';

type Kind = 'quadratic' | 'cubic';

/** De Casteljau: lerp neighbouring points until one is left. Returns every level (for drawing). */
function casteljau(pts: V[], t: number): V[][] {
  const levels: V[][] = [pts];
  let cur = pts;
  while (cur.length > 1) {
    const next: V[] = [];
    for (let i = 0; i + 1 < cur.length; i++) next.push(lerpV(cur[i], cur[i + 1], t));
    levels.push(next);
    cur = next;
  }
  return levels;
}
const at = (pts: V[], t: number) => casteljau(pts, t).at(-1)![0];

export function BezierLab({ spec }: { spec: VizSpec }) {
  const [kind, setKind] = useState<Kind>((spec.kind as Kind) ?? 'quadratic');
  const [q, setQ] = useState<V[]>([[16, 84], [70, 8], [144, 64]]);
  const [c, setC] = useState<V[]>([[16, 84], [30, 10], [130, 10], [144, 64]]);
  const [t, setT] = useState(0.5);
  const [play, setPlay] = useState(false);
  const [construction, setConstruction] = useState(true);
  const [even, setEven] = useState(false);
  const pts = kind === 'quadratic' ? q : c;
  const setPts = kind === 'quadratic' ? setQ : setC;
  const clock = useRef(0);
  useEffect(() => {
    if (!play) return;
    let raf = 0, last = performance.now();
    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      clock.current += Math.min(0.1, (now - last) / 1000);
      last = now;
      setT((clock.current % 1.6) / 1.4 > 1 ? 1 : (clock.current % 1.6) / 1.4);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [play]);

  // arc-length table for even spacing (what Curve2D baking does)
  const table = useMemo(() => {
    const N = 200;
    const out: { t: number; s: number }[] = [{ t: 0, s: 0 }];
    let prev = pts[0], s = 0;
    for (let i = 1; i <= N; i++) {
      const p = at(pts, i / N);
      s += len(sub(p, prev));
      out.push({ t: i / N, s });
      prev = p;
    }
    return out;
  }, [pts]);
  const total = table.at(-1)!.s;
  const tAtDistance = (d: number) => {
    let i = 1;
    while (i < table.length - 1 && table[i].s < d) i++;
    const a = table[i - 1], b = table[i];
    return a.t + ((b.t - a.t) * (d - a.s)) / (b.s - a.s || 1);
  };
  const curve = useMemo(() => Array.from({ length: 101 }, (_, i) => P(at(pts, i / 100))), [pts]);
  const dots = Array.from({ length: 11 }, (_, i) => at(pts, even ? tAtDistance((total * i) / 10) : i / 10));
  const tt = even ? tAtDistance(total * t) : t;
  const levels = casteljau(pts, tt);
  const B = levels.at(-1)![0];
  const tangent = sub(levels.at(-2)![1], levels.at(-2)![0]); // direction of motion at t
  const names = kind === 'quadratic' ? ['p0', 'p1', 'p2'] : ['p0', 'p1', 'p2', 'p3'];
  const colors = ['var(--c-u)', 'var(--c-v)', 'var(--c-k)'];

  const code =
    kind === 'quadratic'
      ? `var p0 := ${gv(pts[0], 0)}  # start (Lyra)
var p1 := ${gv(pts[1], 0)}  # control point: pulls the path, is not reached
var p2 := ${gv(pts[2], 0)}  # end (the target)
var t := ${f(tt, 2)}
var a := p0.lerp(p1, t)       # ${vs(levels[1][0], 1)}
var b := p1.lerp(p2, t)       # ${vs(levels[1][1], 1)}
var point := a.lerp(b, t)     # ${vs(B, 1)}`
      : `var p0 := ${gv(pts[0], 0)}
var p1 := ${gv(pts[1], 0)}
var p2 := ${gv(pts[2], 0)}
var p3 := ${gv(pts[3], 0)}
var t := ${f(tt, 2)}
# Godot's built-in cubic Bezier (the same three rounds of lerp):
p0.bezier_interpolate(p1, p2, p3, t)   # ${vs(B, 1)}`;

  return (
    <FigureLayout
      side={
        <>
          <SegControl
            label="curve"
            value={kind}
            onChange={setKind}
            options={[
              { v: 'quadratic', label: 'quadratic' },
              { v: 'cubic', label: 'cubic' },
            ]}
          />
          <Slider label={even ? 'distance fraction' : 't'} value={t} min={0} max={1} step={0.01} onChange={(v) => { setPlay(false); setT(v); }} fmt={(v) => v.toFixed(2)} />
          <Toggle label="play" value={play} onChange={setPlay} />
          <Toggle label="show construction (lerps)" value={construction} onChange={setConstruction} />
          <Toggle label="even spacing along the curve" value={even} onChange={setEven} />
          <Readout
            rows={[
              ['t', f(tt, 3)],
              ['B(t)', vs(B, 1)],
              ["\\text{direction } B'(t)", vs([tangent[0] / (len(tangent) || 1), tangent[1] / (len(tangent) || 1)], 2)],
              ['\\text{curve length}', `${f(total, 1)} px`],
            ]}
          />
          <div className="math-note">The 11 dots are at t = 0, 0.1, …, 1{even ? ', re-timed so that they are equally far apart along the curve' : ': notice they bunch up where the curve bends'}.</div>
        </>
      }
      below={<CodeBlock code={code} compact />}
    >
      <GPlane x={[0, 160]} y={[0, 100]} step={20} ariaLabel="Bezier curve with draggable control points">
        <Path pts={pts.map(P)} color="var(--muted)" width={1} dashed />
        <Path pts={curve} color="var(--c-w)" width={3} />
        {dots.map((d, i) => (
          <Point key={'d' + i} at={P(d)} r={2.5} color="var(--c-w)" />
        ))}
        {construction &&
          levels.slice(1, -1).map((lv, k) => (
            <g key={k}>
              {lv.length > 1 && lv.slice(1).map((p, i) => <Seg key={i} a={P(lv[i])} b={P(p)} color={colors[k % 3]} width={1.5} />)}
              {lv.map((p, i) => (
                <Point key={'p' + i} at={P(p)} r={3} color={colors[k % 3]} />
              ))}
            </g>
          ))}
        <PlaneSprite at={P(pts[0])} id="mage" frame={animFrame('mage', 'idle_side', 0)} k={2} />
        <PlaneSprite at={P([pts.at(-1)![0], pts.at(-1)![1] + 4])} id="slime" frame={animFrame('slime', 'idle', 0)} k={2} />
        <Arrow from={P(B)} to={P([B[0] + (tangent[0] / (len(tangent) || 1)) * 14, B[1] + (tangent[1] / (len(tangent) || 1)) * 14])} color="var(--c-err)" width={2} />
        <Point at={P(B)} r={5} color="var(--c-err)" />
        {pts.map((p, i) => (
          <Handle key={i} at={P(p)} onChange={(np) => setPts(pts.map((o, j) => (j === i ? G(np) : o)))} snap={2} color="var(--fg)" r={5} text={names[i]} label={`control point ${names[i]}`} />
        ))}
      </GPlane>
    </FigureLayout>
  );
}
