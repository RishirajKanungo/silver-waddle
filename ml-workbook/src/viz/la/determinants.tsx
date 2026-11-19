// Figures for la05: determinants as signed area and volume, cofactor expansion, Jacobians, Gaussian log-det.
import { useMemo, useState } from 'react';
import type { VizSpec } from '../../content/types';
import { Plane, Arrow, Handle, Poly, Path, TGrid, Label, Readout, FigureLayout, SegControl, Slider, Toggle, MatGrid, TeX, usePlayer, Space3D, Arrow3, Poly3, Seg3, type P2, type P3 } from '../kit';
import { add, det, inv, matvec, type Mat } from '../../math/linalg';
import { toFMat, fdet } from '../../math/frac';
import { nf, pn, bm, isMat, isVec } from './shared25';
import './la25.css';

// ------------------------------------------------------------------ la.det2d

/** an arc with an arrowhead from angle t0 to t1 (radians) at radius r */
function OrientArc({ t0, t1, r, color }: { t0: number; t1: number; r: number; color: string }) {
  const pts: P2[] = Array.from({ length: 24 }, (_, i) => {
    const t = t0 + ((t1 - t0) * i) / 23;
    return [r * Math.cos(t), r * Math.sin(t)];
  });
  return (
    <>
      <Path pts={pts.slice(0, -2)} color={color} width={2} />
      <Arrow from={pts[pts.length - 3]} to={pts[pts.length - 1]} color={color} width={2} />
    </>
  );
}

/**
 * la.det2d — the unit square goes to the parallelogram on A's columns; its signed area is det A.
 * params: matrix (2×2), circle (bool: also map the unit disc)
 */
function Det2D({ spec }: { spec: VizSpec }) {
  const M0 = (spec.matrix as Mat) ?? [
    [2, 0.5],
    [0.5, 1.5],
  ];
  const [a1, setA1] = useState<P2>([M0[0][0], M0[1][0]]);
  const [a2, setA2] = useState<P2>([M0[0][1], M0[1][1]]);
  const [circle, setCircle] = useState(!!spec.circle);
  const A: Mat = [
    [a1[0], a2[0]],
    [a1[1], a2[1]],
  ];
  const d = a1[0] * a2[1] - a1[1] * a2[0];
  const flat = Math.abs(d) < 1e-9;
  const col = flat ? 'var(--muted)' : d > 0 ? 'var(--c-w)' : 'var(--c-err)';
  const th1 = Math.atan2(a1[1], a1[0]);
  let dth = Math.atan2(a2[1], a2[0]) - th1;
  while (dth > Math.PI) dth -= 2 * Math.PI;
  while (dth < -Math.PI) dth += 2 * Math.PI;
  const ell: P2[] = Array.from({ length: 73 }, (_, i) => matvec(A, [Math.cos((i / 72) * 2 * Math.PI), Math.sin((i / 72) * 2 * Math.PI)]) as P2);
  const R = 4;
  return (
    <FigureLayout
      side={
        <>
          <Readout
            rows={[
              ['A', '$' + bm(A)],
              ['\\det A', nf(d)],
              ['\\text{area of image}', nf(Math.abs(d))],
              ...(circle ? ([['\\text{disc area } \\pi \\to \\pi\\lvert\\det A\\rvert', nf(Math.PI * Math.abs(d))]] as [string, string][]) : []),
            ]}
          />
          <div className="la-tex">
            <TeX>{`ad - bc = ${pn(a1[0])}\\cdot${pn(a2[1])} - ${pn(a2[0])}\\cdot${pn(a1[1])} = ${nf(d)}`}</TeX>
          </div>
          <div className="la-note">
            {flat && <span className="la-warn">det A = 0: the square is squashed flat. The columns are parallel and A has no inverse.</span>}
            {!flat && d > 0 && <span className="la-ok">Positive: orientation kept. Going from Aî to Aĵ is a counterclockwise turn, as from î to ĵ.</span>}
            {!flat && d < 0 && <span className="la-bad">Negative: orientation flipped. Going from Aî to Aĵ is now a clockwise turn, like a mirror image.</span>}
          </div>
          <Toggle label="also map the unit disc" value={circle} onChange={setCircle} />
          <div className="muted small">Drag the tips of Aî (green) and Aĵ (red). The dashed square is the unit square, area 1.</div>
        </>
      }
    >
      <Plane x={[-R, R]} y={[-R, R]} width={440}>
        <TGrid M={A} extent={10} opacity={0.45} />
        <Poly
          pts={[
            [0, 0],
            [1, 0],
            [1, 1],
            [0, 1],
          ]}
          fill="none"
          fillOpacity={0}
          stroke="var(--muted)"
          width={1.5}
          dashed
        />
        <Poly pts={[[0, 0], a1, add(a1, a2) as P2, a2]} fill={col} fillOpacity={0.25} stroke={col} width={2} />
        {circle && <Poly pts={ell} fill="var(--c-k)" fillOpacity={0.12} stroke="var(--c-k)" width={2} />}
        {!flat && <OrientArc t0={th1} t1={th1 + dth} r={0.55} color={col} />}
        {!flat && <Label at={[(a1[0] + a2[0]) / 2, (a1[1] + a2[1]) / 2]} tex={nf(d)} color={col} />}
        <Arrow to={a1} color="var(--c-i)" width={3} tex="A\hat\imath" labelAt={0.45} />
        <Arrow to={a2} color="var(--c-j)" width={3} tex="A\hat\jmath" labelAt={0.45} />
        <Handle at={a1} onChange={setA1} color="var(--c-i)" snap={0.25} label="A i-hat" />
        <Handle at={a2} onChange={setA2} color="var(--c-j)" snap={0.25} label="A j-hat" />
      </Plane>
    </FigureLayout>
  );
}

// ------------------------------------------------------------------ la.det3d

/**
 * la.det3d — the unit cube goes to the parallelepiped on the columns; its signed volume is det A.
 * params: c1, c2 (fixed columns), c3 (initial third column; adjustable with sliders)
 */
function Det3D({ spec }: { spec: VizSpec }) {
  const c1 = (spec.c1 as P3) ?? [2, 0, 0];
  const c2 = (spec.c2 as P3) ?? [0.5, 2, 0];
  const c30 = (spec.c3 as P3) ?? [0.5, 0.5, 1.5];
  const [x, setX] = useState(c30[0]);
  const [y, setY] = useState(c30[1]);
  const [z, setZ] = useState(c30[2]);
  const c3: P3 = [x, y, z];
  const A: Mat = [0, 1, 2].map((i) => [c1[i], c2[i], c3[i]]);
  const d = det(A);
  const flat = Math.abs(d) < 1e-9;
  const col = flat ? 'var(--muted)' : d > 0 ? 'var(--c-w)' : 'var(--c-err)';
  const o: P3 = [0, 0, 0];
  const s = (...vs: P3[]) => vs.reduce((acc, v) => add(acc, v) as P3, o);
  const faces: P3[][] = [
    [o, c1, s(c1, c2), c2],
    [c3, s(c1, c3), s(c1, c2, c3), s(c2, c3)],
    [o, c1, s(c1, c3), c3],
    [c2, s(c1, c2), s(c1, c2, c3), s(c2, c3)],
    [o, c2, s(c2, c3), c3],
    [c1, s(c1, c2), s(c1, c2, c3), s(c1, c3)],
  ];
  const cube: [P3, P3][] = [];
  const V: P3[] = [
    [0, 0, 0],
    [1, 0, 0],
    [0, 1, 0],
    [0, 0, 1],
    [1, 1, 0],
    [1, 0, 1],
    [0, 1, 1],
    [1, 1, 1],
  ];
  for (let i = 0; i < 8; i++) for (let j = i + 1; j < 8; j++) if (V[i].reduce((t, v, k) => t + Math.abs(v - V[j][k]), 0) === 1) cube.push([V[i], V[j]]);
  return (
    <FigureLayout
      side={
        <>
          <div className="small muted">
            Third column <TeX>{'\\mathbf{a}_3'}</TeX>:
          </div>
          <Slider tex="a_{13}" value={x} min={-2} max={2} step={0.25} onChange={setX} />
          <Slider tex="a_{23}" value={y} min={-2} max={2} step={0.25} onChange={setY} />
          <Slider tex="a_{33}" value={z} min={-2} max={2} step={0.25} onChange={setZ} />
          <Readout
            rows={[
              ['A', '$' + bm(A)],
              ['\\det A', nf(d)],
              ['\\text{volume}', nf(Math.abs(d))],
            ]}
          />
          <div className="la-note">
            {flat && <span className="la-warn">det A = 0: the box is flat. The three columns lie in one plane.</span>}
            {!flat && d > 0 && <span className="la-ok">Positive: a right-handed box, like î, ĵ, k̂.</span>}
            {!flat && d < 0 && <span className="la-bad">Negative: the box is a mirror image (left-handed). Try a₃₃ below 0.</span>}
          </div>
        </>
      }
    >
      <Space3D range={3} label="parallelepiped">
        {cube.map(([a, b], k) => (
          <Seg3 key={k} a={a} b={b} color="var(--muted)" width={1} dashed opacity={0.7} />
        ))}
        {faces.map((f, k) => (
          <Poly3 key={k} pts={f} fill={col} opacity={0.1} stroke={col} />
        ))}
        <Arrow3 to={c1} color="var(--c-i)" tex="\mathbf{a}_1" />
        <Arrow3 to={c2} color="var(--c-j)" tex="\mathbf{a}_2" />
        <Arrow3 to={c3} color="var(--c-k)" tex="\mathbf{a}_3" />
      </Space3D>
    </FigureLayout>
  );
}

// ------------------------------------------------------------------ la.cofactor

type Line = 'r0' | 'r1' | 'r2' | 'c0' | 'c1' | 'c2';

/**
 * la.cofactor — cofactor expansion of a 3×3 determinant along any row or column, one term per step.
 * params: matrix (3×3 integers), line ('r0' … 'c2', default 'r0')
 */
function Cofactor({ spec }: { spec: VizSpec }) {
  const [line, setLine] = useState<Line>((spec.line as Line) ?? 'r0');
  return (
    <div className="la-wide">
      <CofactorInner key={line} A={spec.matrix as Mat} line={line} setLine={setLine} />
    </div>
  );
}

function CofactorInner({ A, line, setLine }: { A: Mat; line: Line; setLine: (l: Line) => void }) {
  const { i: k, controls } = usePlayer(4, { interval: 1800 });
  const along = line[0] === 'r' ? 'row' : 'column';
  const idx = +line[1];
  const pos = (t: number): [number, number] => (along === 'row' ? [idx, t] : [t, idx]);
  const minor = (r: number, c: number): Mat => A.filter((_, i) => i !== r).map((row) => row.filter((_, j) => j !== c));
  const terms = [0, 1, 2].map((t) => {
    const [r, c] = pos(t);
    const Mi = minor(r, c);
    const dm = Mi[0][0] * Mi[1][1] - Mi[0][1] * Mi[1][0];
    const sgn = (r + c) % 2 === 0 ? 1 : -1;
    return { r, c, Mi, dm, sgn, cof: sgn * dm, term: A[r][c] * sgn * dm };
  });
  const total = terms.reduce((s, t) => s + t.term, 0);
  const exact = fdet(toFMat(A)).toNumber();
  const cur = k < 3 ? terms[k] : null;
  const dim: [number, number][] = cur
    ? [0, 1, 2].flatMap((a) => [0, 1, 2].map((b) => [a, b] as [number, number])).filter(([a, b]) => (a === cur.r || b === cur.c) && !(a === cur.r && b === cur.c))
    : [];
  const signs = [
    [1, -1, 1],
    [-1, 1, -1],
    [1, -1, 1],
  ];
  const sumTeX = terms
    .slice(0, cur ? k + 1 : 3)
    .map((t) => `${pn(A[t.r][t.c])}\\cdot${pn(t.cof)}`)
    .join(' + ');
  const zeros = terms.filter((t) => A[t.r][t.c] === 0).length;
  return (
    <FigureLayout
      below={
        <>
          <SegControl
            value={line}
            onChange={setLine}
            label="expand along"
            options={(['r0', 'r1', 'r2', 'c0', 'c1', 'c2'] as Line[]).map((v) => ({ v, label: (v[0] === 'r' ? 'row ' : 'col ') + (+v[1] + 1) }))}
          />
          {controls}
        </>
      }
    >
      <div className="la-rr">
        <div className="la-mm">
          <div className="la-mm-col">
            <MatGrid m={A} cells={cur ? [[cur.r, cur.c]] : []} dim={dim} rows={!cur && along === 'row' ? [idx] : []} cols={!cur && along === 'column' ? [idx] : []} />
            <span className="la-mm-name">
              <TeX>{'A'}</TeX>
            </span>
          </div>
          {cur && (
            <>
              <div className="la-mm-col">
                <MatGrid m={cur.Mi} />
                <span className="la-mm-name">
                  <TeX>{`M_{${cur.r + 1}${cur.c + 1}}`}</TeX> (cross out row {cur.r + 1}, column {cur.c + 1})
                </span>
              </div>
              <div className="la-mm-col">
                <MatGrid m={signs} fmt={(v) => (v > 0 ? '+' : '−')} cells={[[cur.r, cur.c]]} />
                <span className="la-mm-name">sign pattern</span>
              </div>
            </>
          )}
        </div>
        <div className="la-box la-tex" style={{ textAlign: 'center' }}>
          {cur ? (
            <TeX
              display
            >{`C_{${cur.r + 1}${cur.c + 1}} = (-1)^{${cur.r + 1}+${cur.c + 1}}\\det M_{${cur.r + 1}${cur.c + 1}} = ${cur.sgn > 0 ? '+' : '-'}(${pn(cur.Mi[0][0])}\\cdot${pn(cur.Mi[1][1])} - ${pn(cur.Mi[0][1])}\\cdot${pn(cur.Mi[1][0])}) = ${nf(cur.cof)}`}</TeX>
          ) : (
            <TeX display>{`\\det A = ${sumTeX} = ${nf(total)}`}</TeX>
          )}
          {cur && <TeX display>{`\\text{so far: } ${sumTeX} = ${nf(terms.slice(0, k + 1).reduce((s, t) => s + t.term, 0))}`}</TeX>}
        </div>
        <div className="muted small" style={{ textAlign: 'center' }}>
          {cur
            ? `Term ${k + 1} of 3: entry a${cur.r + 1}${cur.c + 1} = ${nf(A[cur.r][cur.c])} times its cofactor.`
            : `Every row and column gives the same value, ${nf(exact)}. ${zeros ? `This ${along} has ${zeros} zero entr${zeros > 1 ? 'ies' : 'y'}, which saves work.` : 'Expanding along a row or column with zeros saves work.'}`}
        </div>
      </div>
    </FigureLayout>
  );
}

// ------------------------------------------------------------------ la.jacobian

type MapName = 'polar' | 'additive' | 'affine';
interface MapDef {
  label: string;
  f: (u: P2) => P2;
  J: (u: P2) => Mat;
  inX: [number, number];
  inY: [number, number];
  out: number;
  names: [string, string];
  plain: [string, string];
  p0: P2;
}
const MAPS: Record<MapName, MapDef> = {
  polar: {
    label: 'polar coordinates',
    f: ([r, t]) => [r * Math.cos(t), r * Math.sin(t)],
    J: ([r, t]) => [
      [Math.cos(t), -r * Math.sin(t)],
      [Math.sin(t), r * Math.cos(t)],
    ],
    inX: [0, 3.2],
    inY: [0, 3.2],
    out: 3.4,
    names: ['r', '\\theta'],
    plain: ['r', 'θ'],
    p0: [1.5, 0.8],
  },
  additive: {
    label: 'additive coupling',
    f: ([a, b]) => [a, b + Math.sin(1.5 * a)],
    J: ([a]) => [
      [1, 0],
      [1.5 * Math.cos(1.5 * a), 1],
    ],
    inX: [-2.5, 2.5],
    inY: [-2.5, 2.5],
    out: 3.5,
    names: ['z_1', 'z_2'],
    plain: ['z₁', 'z₂'],
    p0: [0.5, 0.5],
  },
  affine: {
    label: 'affine coupling',
    f: ([a, b]) => [a, b * Math.exp(0.35 * a)],
    J: ([a, b]) => [
      [1, 0],
      [0.35 * b * Math.exp(0.35 * a), Math.exp(0.35 * a)],
    ],
    inX: [-2.5, 2.5],
    inY: [-2.5, 2.5],
    out: 6,
    names: ['z_1', 'z_2'],
    plain: ['z₁', 'z₂'],
    p0: [1, 1],
  },
};

const shoelace = (pts: P2[]) => Math.abs(pts.reduce((s, p, i) => s + p[0] * pts[(i + 1) % pts.length][1] - pts[(i + 1) % pts.length][0] * p[1], 0)) / 2;

/**
 * la.jacobian — a nonlinear map, a small square at a draggable point, its curved image, and the Jacobian's parallelogram.
 * params: map ('polar' | 'additive' | 'affine'), maps (subset to offer)
 */
function Jacobian({ spec }: { spec: VizSpec }) {
  const offered = (spec.maps as MapName[]) ?? (['polar', 'additive', 'affine'] as MapName[]);
  const [name, setName] = useState<MapName>((spec.map as MapName) ?? offered[0]);
  const m = MAPS[name];
  const [p, setP] = useState<P2>(m.p0);
  const [h, setH] = useState(0.4);
  const choose = (n: MapName) => {
    setName(n);
    setP(MAPS[n].p0);
  };
  const gridLines = useMemo(() => {
    const out: P2[][] = [];
    const [x0, x1] = m.inX,
      [y0, y1] = m.inY;
    for (let k = 0; k <= 8; k++) {
      const xv = x0 + ((x1 - x0) * k) / 8,
        yv = y0 + ((y1 - y0) * k) / 8;
      out.push(Array.from({ length: 41 }, (_, i) => m.f([xv, y0 + ((y1 - y0) * i) / 40])));
      out.push(Array.from({ length: 41 }, (_, i) => m.f([x0 + ((x1 - x0) * i) / 40, yv])));
    }
    return out;
  }, [m]);
  const sq: P2[] = [];
  const N = 12;
  const corners: P2[] = [p, [p[0] + h, p[1]], [p[0] + h, p[1] + h], [p[0], p[1] + h]];
  for (let e = 0; e < 4; e++)
    for (let i = 0; i < N; i++) {
      const a = corners[e],
        b = corners[(e + 1) % 4];
      sq.push([a[0] + ((b[0] - a[0]) * i) / N, a[1] + ((b[1] - a[1]) * i) / N]);
    }
  const img = sq.map(m.f);
  const J = m.J(p);
  const fp = m.f(p);
  const lin = corners.map((c) => add(fp, matvec(J, [c[0] - p[0], c[1] - p[1]])) as P2);
  const dJ = det(J);
  const area = shoelace(img);
  const R = m.out;
  return (
    <div className="la-wide">
      <FigureLayout
        below={
          <div className="la-rr">
            <div className="la-mm">
              {offered.length > 1 && <SegControl value={name} onChange={choose} options={offered.map((v) => ({ v, label: MAPS[v].label }))} />}
              <Slider label="square side h" value={h} min={0.1} max={0.8} step={0.05} onChange={setH} width={260} />
            </div>
            <div className="la-mm">
              <Readout
                rows={[
                  ['J = \\partial(y_1, y_2)/\\partial(' + m.names.join(', ') + ')', '$' + bm(J)],
                  ['\\det J', nf(dJ, 3)],
                ]}
              />
              <Readout
                rows={[
                  ['\\text{input area } h^2', nf(h * h, 4)],
                  ['\\text{image area}', nf(area, 4)],
                  ['\\text{image area} / h^2', nf(area / (h * h), 3)],
                ]}
              />
            </div>
            <div className="muted small" style={{ textAlign: 'center' }}>
              Drag the point. As h shrinks, the curved image (filled) approaches the parallelogram J·square (dashed), and the area ratio approaches |det J|.
            </div>
          </div>
        }
      >
        <div className="la-two">
          <div className="la-panel">
            <span className="la-panel-title">
              input <TeX>{`(${m.names.join(', ')})`}</TeX>
            </span>
            <Plane x={m.inX} y={m.inY} width={300} xLabel={m.plain[0]} yLabel={m.plain[1]}>
              <Poly pts={corners} fill="var(--c-u)" fillOpacity={0.3} stroke="var(--c-u)" width={1.5} />
              <Handle
                at={p}
                onChange={(q) => setP([Math.max(m.inX[0], Math.min(m.inX[1] - h, q[0])), Math.max(m.inY[0], Math.min(m.inY[1] - h, q[1]))])}
                color="var(--c-u)"
                snap={0.05}
                label="corner of the square"
              />
            </Plane>
          </div>
          <div className="la-panel">
            <span className="la-panel-title">output: the image of the grid</span>
            <Plane x={[-R, R]} y={[-R, R]} width={300} xLabel="y₁" yLabel="y₂">
              {gridLines.map((g, i) => (
                <Path key={i} pts={g} color="var(--c-grid-t)" width={1} />
              ))}
              <Poly pts={img} fill="var(--c-u)" fillOpacity={0.3} stroke="var(--c-u)" width={1.5} />
              <Poly pts={lin} fill="none" fillOpacity={0} stroke="var(--c-v)" width={2} dashed />
            </Plane>
          </div>
        </div>
      </FigureLayout>
    </div>
  );
}

// ------------------------------------------------------------------ la.gauss2d

/**
 * la.gauss2d — a 2-D Gaussian N(0, Σ): contour ellipses, det Σ as squared area scale, and the log-density at a point.
 * params: s1, s2, rho, x
 */
function Gauss2D({ spec }: { spec: VizSpec }) {
  const [s1, setS1] = useState((spec.s1 as number) ?? 1.5);
  const [s2, setS2] = useState((spec.s2 as number) ?? 0.8);
  const [rho, setRho] = useState((spec.rho as number) ?? 0.6);
  const [x, setX] = useState<P2>((spec.x as P2) ?? [1, 1]);
  const S: Mat = [
    [s1 * s1, rho * s1 * s2],
    [rho * s1 * s2, s2 * s2],
  ];
  const dS = det(S);
  const Si = inv(S)!;
  const maha = x[0] * (Si[0][0] * x[0] + Si[0][1] * x[1]) + x[1] * (Si[1][0] * x[0] + Si[1][1] * x[1]);
  const logp = -0.5 * (2 * Math.log(2 * Math.PI) + Math.log(dS) + maha);
  const L: Mat = [
    [s1, 0],
    [rho * s2, s2 * Math.sqrt(1 - rho * rho)],
  ];
  const ellipse = (k: number): P2[] => Array.from({ length: 73 }, (_, i) => matvec(L, [k * Math.cos((i / 72) * 2 * Math.PI), k * Math.sin((i / 72) * 2 * Math.PI)]) as P2);
  const circle = (k: number): P2[] => Array.from({ length: 73 }, (_, i) => [k * Math.cos((i / 72) * 2 * Math.PI), k * Math.sin((i / 72) * 2 * Math.PI)]);
  return (
    <FigureLayout
      side={
        <>
          <Slider tex="\sigma_1" value={s1} min={0.3} max={2} step={0.05} onChange={setS1} />
          <Slider tex="\sigma_2" value={s2} min={0.3} max={2} step={0.05} onChange={setS2} />
          <Slider tex="\rho" value={rho} min={-0.95} max={0.95} step={0.05} onChange={setRho} />
          <Readout
            rows={[
              ['\\Sigma', '$' + bm(S)],
              ['\\det\\Sigma', nf(dS, 3)],
              ['\\log\\det\\Sigma', nf(Math.log(dS), 3)],
              ['\\text{1-}\\sigma\\text{ ellipse area } \\pi\\sqrt{\\det\\Sigma}', nf(Math.PI * Math.sqrt(dS), 3)],
              ['\\mathbf{x}\\T\\Sigma^{-1}\\mathbf{x}', nf(maha, 3)],
              ['\\log p(\\mathbf{x})', nf(logp, 3)],
            ]}
          />
          <div className="muted small">
            <TeX>{'\\log p = -\\tfrac12\\big(2\\log 2\\pi + \\log\\det\\Sigma + \\mathbf{x}\\T\\Sigma^{-1}\\mathbf{x}\\big)'}</TeX>. Drag x. Push ρ toward ±1 and watch det Σ go to 0.
          </div>
        </>
      }
    >
      <Plane x={[-4, 4]} y={[-4, 4]} width={420}>
        <Path pts={circle(1)} color="var(--muted)" width={1.2} dashed closed />
        <Poly pts={ellipse(1)} fill="var(--c-u)" fillOpacity={0.14} stroke="var(--c-u)" width={2} />
        <Path pts={ellipse(2)} color="var(--c-u)" width={1.5} closed opacity={0.6} />
        <Arrow to={x} color="var(--c-v)" width={2} />
        <Handle at={x} onChange={setX} color="var(--c-v)" snap={0.1} label="x" tex="\mathbf{x}" />
      </Plane>
    </FigureLayout>
  );
}

// ------------------------------------------------------------------ registry

const okName = <T extends string>(v: unknown, lib: Record<T, unknown>) => v === undefined || (typeof v === 'string' && v in lib);

export const determinantsViz = {
  'la.det2d': {
    component: Det2D,
    validate: (s: VizSpec) => (s.matrix === undefined || isMat(s.matrix, 2, 2) ? null : 'matrix must be 2×2'),
    doc: 'Unit square → parallelogram; signed area = det, orientation colored, optional unit disc. params matrix, circle',
  },
  'la.det3d': {
    component: Det3D,
    validate: (s: VizSpec) => (['c1', 'c2', 'c3'].every((k) => s[k] === undefined || isVec(s[k], 3)) ? null : 'c1, c2, c3 must be 3-vectors'),
    doc: 'Unit cube → parallelepiped; signed volume = det; sliders for the third column. params c1, c2, c3',
  },
  'la.cofactor': {
    component: Cofactor,
    validate: (s: VizSpec) => (isMat(s.matrix, 3, 3) && (s.matrix as Mat).flat().every(Number.isInteger) ? null : '3×3 integer matrix required'),
    doc: "Cofactor expansion of a 3×3 determinant along any row or column, step by step. params matrix, line ('r0'…'c2')",
  },
  'la.jacobian': {
    component: Jacobian,
    validate: (s: VizSpec) => (okName(s.map, MAPS) && (s.maps === undefined || (Array.isArray(s.maps) && s.maps.every((v) => okName(v, MAPS)))) ? null : 'unknown map'),
    doc: 'Local area scaling of a nonlinear map by |det J|: polar coordinates, additive and affine coupling layers. params map, maps',
  },
  'la.gauss2d': {
    component: Gauss2D,
    doc: '2-D Gaussian: contour ellipses, det Σ, log det Σ, Mahalanobis distance and log density at a draggable x. params s1, s2, rho, x',
  },
};
