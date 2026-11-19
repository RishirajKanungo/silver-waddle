// math.transform: a three-level hierarchy Kai → WeaponPivot → SwordHitbox, the way the lesson builds it.
// Each node's Transform2D (x axis, y axis, origin) is shown as a 2×3 matrix; the hitbox's global
// transform is their product. A draggable enemy point is converted with to_local for a hit test.
import { useMemo, useState } from 'react';
import type { VizSpec } from '../../content/types';
import { Handle, Poly, Seg, Arrow, Label, Slider, Toggle, Readout, FigureLayout, MatGrid, usePlane } from '../kit';
import { CodeBlock } from '../../ui/GameCells';
import { animFrame } from '../game';
import { GPlane, P, G, f, rad, spriteURL, sheetInfo, type V } from './common';

interface T {
  x: V;
  y: V;
  o: V;
}
const make = (pos: V, rot: number, sc: V): T => ({ x: [Math.cos(rot) * sc[0], Math.sin(rot) * sc[0]], y: [-Math.sin(rot) * sc[1], Math.cos(rot) * sc[1]], o: pos });
const apply = (t: T, p: V): V => [t.x[0] * p[0] + t.y[0] * p[1] + t.o[0], t.x[1] * p[0] + t.y[1] * p[1] + t.o[1]];
const basis = (t: T, p: V): V => [t.x[0] * p[0] + t.y[0] * p[1], t.x[1] * p[0] + t.y[1] * p[1]];
const compose = (a: T, b: T): T => ({ x: basis(a, b.x), y: basis(a, b.y), o: apply(a, b.o) });
function inverse(t: T): T {
  const det = t.x[0] * t.y[1] - t.y[0] * t.x[1];
  const ix: V = [t.y[1] / det, -t.x[1] / det];
  const iy: V = [-t.y[0] / det, t.x[0] / det];
  const inv: T = { x: ix, y: iy, o: [0, 0] };
  const o = basis(inv, t.o);
  return { ...inv, o: [-o[0], -o[1]] };
}
const mat = (t: T) => [
  [t.x[0], t.y[0], t.o[0]],
  [t.x[1], t.y[1], t.o[1]],
];
const fm = (v: number) => (Math.abs(v) < 0.005 ? '0' : Number.isInteger(Math.round(v * 100) / 100) ? String(Math.round(v)) : v.toFixed(2));

/** Draw a sprite frame under a Transform2D, inside a GPlane. */
function SpriteAt({ t, id, frame }: { t: T; id: string; frame: number }) {
  const { k, x, y } = usePlane();
  const x0 = x[0], yg0 = -y[1];
  const { fw, fh, origin } = sheetInfo(id);
  const m = `matrix(${k * t.x[0]},${k * t.x[1]},${k * t.y[0]},${k * t.y[1]},${k * (t.o[0] - x0)},${k * (t.o[1] - yg0)})`;
  return <image href={spriteURL(id, frame)} x={-origin[0]} y={-origin[1]} width={fw} height={fh} transform={m} className="math-sprite" style={{ imageRendering: 'pixelated' }} />;
}

export function TransformLab({ spec }: { spec: VizSpec }) {
  const [kaiPos, setKaiPos] = useState<V>([56, 64]);
  const [kaiRot, setKaiRot] = useState(0);
  const [kaiScale, setKaiScale] = useState(1);
  const [flip, setFlip] = useState(false);
  const [aim, setAim] = useState((spec.aim as number) ?? 30);
  const [reach, setReach] = useState(14);
  const [enemy, setEnemy] = useState<V>([74, 70]);

  const kai = make(kaiPos, rad(kaiRot), [kaiScale * (flip ? -1 : 1), kaiScale]);
  const pivot = make([0, -8], rad(aim), [1, 1]);
  const hit = make([reach, 0], 0, [1, 1]);
  const pivotG = compose(kai, pivot);
  const hitG = compose(pivotG, hit);
  const local = apply(inverse(hitG), enemy);
  const inside = Math.abs(local[0]) <= 8 && Math.abs(local[1]) <= 4;
  const corners: V[] = [[-8, -4], [8, -4], [8, 4], [-8, 4]].map((c) => apply(hitG, c as V));
  const axisLen = 12;

  const code = useMemo(
    () => `# Kai (Node2D)              position (${f(kaiPos[0], 0)}, ${f(kaiPos[1], 0)}), rotation ${kaiRot}°, scale (${f(kaiScale * (flip ? -1 : 1))}, ${f(kaiScale)})
#   WeaponPivot (Node2D)    position (0, -8), rotation ${aim}°
#     SwordHitbox (Area2D)  position (${reach}, 0)
var hitbox: Area2D = $WeaponPivot/SwordHitbox
hitbox.position                     # (${reach}.00, 0.00): local, relative to WeaponPivot
hitbox.global_position              # (${f(hitG.o[0])}, ${f(hitG.o[1])})
hitbox.to_local(enemy_position)     # (${f(local[0])}, ${f(local[1])}): ${inside ? 'inside' : 'outside'} the 16×8 box`,
    [kaiPos, kaiRot, kaiScale, flip, aim, reach, hitG, local, inside],
  );

  return (
    <FigureLayout
      side={
        <>
          <Slider label="pivot rotation°" value={aim} min={-180} max={180} step={5} onChange={setAim} fmt={(v) => v.toFixed(0)} />
          <Slider label="hitbox x" value={reach} min={0} max={24} step={1} onChange={setReach} fmt={(v) => v.toFixed(0)} />
          <Slider label="Kai rotation°" value={kaiRot} min={-90} max={90} step={5} onChange={setKaiRot} fmt={(v) => v.toFixed(0)} />
          <Slider label="Kai scale" value={kaiScale} min={0.5} max={2} step={0.25} onChange={setKaiScale} fmt={(v) => v.toFixed(2)} />
          <Toggle label="flip Kai (scale.x = −1)" value={flip} onChange={setFlip} />
          <Readout
            rows={[
              ['\\text{hitbox.position}', `(${reach}, 0)`],
              ['\\text{hitbox.global\\_position}', `(${f(hitG.o[0], 0)}, ${f(hitG.o[1], 0)})`],
              ['\\text{enemy (global)}', `(${f(enemy[0], 0)}, ${f(enemy[1], 0)})`],
              ['\\text{to\\_local(enemy)}', `(${f(local[0], 1)}, ${f(local[1], 1)})`],
            ]}
          />
          <div className="math-note">
            <span className={'math-badge ' + (inside ? 'bad' : 'ok')}>{inside ? 'hit' : 'miss'}</span> Drag Kai's feet and the slime. In the hitbox's own space the box is always |x| ≤ 8 and |y| ≤ 4.
          </div>
        </>
      }
      below={
        <div className="math-stack">
          <div className="math-mats">
            <div className="math-mat">
              <MatGrid m={mat(kai)} fmt={fm} colLabels={['x', 'y', 'origin']} />
              Kai.transform
            </div>
            <span className="math-op">×</span>
            <div className="math-mat">
              <MatGrid m={mat(pivot)} fmt={fm} colLabels={['x', 'y', 'origin']} />
              WeaponPivot.transform
            </div>
            <span className="math-op">×</span>
            <div className="math-mat">
              <MatGrid m={mat(hit)} fmt={fm} colLabels={['x', 'y', 'origin']} />
              SwordHitbox.transform
            </div>
            <span className="math-op">=</span>
            <div className="math-mat">
              <MatGrid m={mat(hitG)} fmt={fm} colLabels={['x', 'y', 'origin']} cols={[2]} />
              SwordHitbox.global_transform
            </div>
          </div>
          <CodeBlock code={code} compact />
        </div>
      }
    >
      <GPlane x={[-8, 136]} y={[-8, 100]} step={16} ariaLabel="transform hierarchy">
        <SpriteAt t={kai} id="hero" frame={animFrame('hero', 'idle_side', 0)} />
        <SpriteAt t={make(enemy, 0, [1, 1])} id="slime" frame={animFrame('slime', 'idle', 0)} />
        <Poly pts={corners.map(P)} fill={inside ? 'var(--c-err)' : 'var(--c-v)'} fillOpacity={0.3} stroke={inside ? 'var(--c-err)' : 'var(--c-v)'} width={2} />
        {/* Kai's axes */}
        <Arrow from={P(kai.o)} to={P(apply(kai, [axisLen, 0]))} color="var(--c-u)" width={2} />
        <Arrow from={P(kai.o)} to={P(apply(kai, [0, axisLen]))} color="var(--c-w)" width={2} />
        {/* pivot axes */}
        <Seg a={P(kai.o)} b={P(pivotG.o)} color="var(--muted)" dashed />
        <Arrow from={P(pivotG.o)} to={P(apply(pivotG, [axisLen, 0]))} color="var(--c-u)" width={1.5} opacity={0.8} />
        <Arrow from={P(pivotG.o)} to={P(apply(pivotG, [0, axisLen]))} color="var(--c-w)" width={1.5} opacity={0.8} />
        <Label at={P(apply(pivotG, [0, -5]))} text="pivot" color="var(--muted)" />
        <Label at={P(apply(hitG, [0, -9]))} text="hitbox" color="var(--c-v)" />
        <Handle at={P(kaiPos)} onChange={(p) => setKaiPos(G(p))} snap={2} color="var(--c-u)" label="Kai position" />
        <Handle at={P(enemy)} onChange={(p) => setEnemy(G(p))} snap={1} color="var(--c-err)" r={4} label="enemy position" />
      </GPlane>
    </FigureLayout>
  );
}
