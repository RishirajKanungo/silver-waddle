// math.collisionLayers: the course's eight named physics layers as bits. Toggle each object's layer
// ("what I am") and mask ("what I scan") and see, in the matrix, which pairs block or detect each
// other, and what changed relative to the course's setup.
import { useMemo, useState } from 'react';
import type { VizSpec } from '../../content/types';
import { SegControl, Readout } from '../kit';
import { CodeBlock } from '../../ui/GameCells';

export const LAYER_NAMES = ['world', 'player', 'party', 'enemy', 'player_hitbox', 'enemy_hitbox', 'interactable', 'pickup'];
type Kind = 'character' | 'static' | 'area' | 'ray';
interface Obj {
  name: string;
  node: string;
  kind: Kind;
  layer: number;
  mask: number;
}
const bits = (...ns: number[]) => ns.reduce((acc, n) => acc | (1 << (n - 1)), 0);

const COURSE: Obj[] = [
  { name: 'Kai body', node: 'CharacterBody2D', kind: 'character', layer: bits(2), mask: bits(1) },
  { name: 'Lyra body', node: 'CharacterBody2D', kind: 'character', layer: bits(3), mask: bits(1) },
  { name: 'Slime body', node: 'CharacterBody2D', kind: 'character', layer: bits(4), mask: bits(1, 4) },
  { name: 'Wall tiles', node: 'TileMapLayer', kind: 'static', layer: bits(1), mask: 0 },
  { name: 'Kai sword', node: 'Hitbox (Area2D)', kind: 'area', layer: bits(5), mask: 0 },
  { name: 'Slime hurtbox', node: 'Hurtbox (Area2D)', kind: 'area', layer: 0, mask: bits(5) },
  { name: 'Slime bite', node: 'Hitbox (Area2D)', kind: 'area', layer: bits(6), mask: 0 },
  { name: 'Kai hurtbox', node: 'Hurtbox (Area2D)', kind: 'area', layer: 0, mask: bits(6) },
  { name: 'Chest', node: 'Area2D', kind: 'area', layer: bits(7), mask: 0 },
  { name: 'Coin', node: 'Area2D', kind: 'area', layer: bits(8), mask: bits(2) },
  { name: 'Kai interact ray', node: 'RayCast2D', kind: 'ray', layer: 0, mask: bits(1, 7) },
];
const PRESETS: Record<string, Obj[]> = {
  course: COURSE,
  // a new node in Godot starts on layer 1 with mask 1
  defaults: COURSE.map((o) => ({ ...o, layer: o.kind === 'ray' ? 0 : 1, mask: 1 })),
  bug: COURSE.map((o) => (o.name === 'Slime hurtbox' ? { ...o, mask: bits(6) } : o.name === 'Coin' ? { ...o, mask: bits(3) } : o)),
};

type Rel = '' | 'block' | 'detect' | 'na' | 'self';
function relation(r: Obj, t: Obj, ri: number, ti: number): Rel {
  if (ri === ti) return 'self';
  if (r.kind === 'static' || t.kind === 'ray') return 'na';
  if (r.kind === 'character') {
    if (t.kind === 'area') return 'na';
    return r.mask & t.layer ? 'block' : '';
  }
  // areas and rays: detect bodies and (monitorable) areas whose layer is in their mask
  return r.mask & t.layer ? 'detect' : '';
}
const bin = (v: number) => '0b' + v.toString(2).padStart(8, '0');
const names = (v: number) => LAYER_NAMES.filter((_, i) => v & (1 << i)).join(', ') || 'none';

export function CollisionLayers({ spec }: { spec: VizSpec }) {
  const [objs, setObjs] = useState<Obj[]>(() => PRESETS[(spec.preset as string) ?? 'course'] ?? COURSE);
  const [sel, setSel] = useState(5);
  const [hover, setHover] = useState<[number, number] | null>(null);
  const toggle = (i: number, field: 'layer' | 'mask', bit: number) => setObjs((os) => os.map((o, k) => (k === i ? { ...o, [field]: o[field] ^ (1 << bit) } : o)));

  const matrix = useMemo(() => objs.map((r, ri) => objs.map((t, ti) => relation(r, t, ri, ti))), [objs]);
  const intended = useMemo(() => COURSE.map((r, ri) => COURSE.map((t, ti) => relation(r, t, ri, ti))), []);
  const diffs = useMemo(() => {
    const out: { text: string; kind: 'extra' | 'missing' }[] = [];
    matrix.forEach((row, ri) =>
      row.forEach((rel, ti) => {
        const want = intended[ri][ti];
        if (rel === want || rel === 'na' || rel === 'self') return;
        const verb = (x: Rel) => (x === 'block' ? 'is blocked by' : 'detects');
        if (rel && !want) out.push({ kind: 'extra', text: `${objs[ri].name} ${verb(rel)} ${objs[ti].name}` });
        if (!rel && want) out.push({ kind: 'missing', text: `${objs[ri].name} no longer ${verb(want)} ${objs[ti].name}` });
      }),
    );
    return out;
  }, [matrix, intended, objs]);

  const o = objs[sel];
  const maskLines = LAYER_NAMES.map((n, i) => (o.mask & (1 << i) ? `set_collision_mask_value(${i + 1}, true)  # ${n}` : null)).filter(Boolean);
  const code = o.node === 'TileMapLayer' ? `# ${o.name}: ${o.node}
# Tiles get their layer from the TileSet (Inspector: Tile Set > Physics Layers > Collision Layer).
tile_set.set_physics_layer_collision_layer(0, ${o.layer})  # ${bin(o.layer)}: ${names(o.layer)}
tile_set.set_physics_layer_collision_mask(0, ${o.mask})  # static: nothing to scan` :
    `# ${o.name}: ${o.node}\n` +
    (o.kind === 'ray' ? '' : `collision_layer = ${o.layer}  # ${bin(o.layer)}: ${names(o.layer)}\n`) +
    `collision_mask = ${o.mask}  # ${bin(o.mask)}: ${names(o.mask)}\n` +
    (o.kind === 'ray' ? 'collide_with_areas = true  # the chest is an Area2D\n' : '') +
    (maskLines.length ? `# the same mask, one layer number at a time (layer n is bit 1 << (n - 1)):\ncollision_mask = 0\n${maskLines.join('\n')}` : '');

  const cellTxt: Record<Rel, string> = { '': '', block: 'B', detect: 'D', na: '·', self: '' };
  return (
    <div className="fig geom-layers">
      <div className="geom-legend">
        {LAYER_NAMES.map((n, i) => (
          <span key={n}>
            <b>{i + 1}</b> {n}
          </span>
        ))}
      </div>
      <div className="geom-scroll">
        <table className="geom-bits">
          <thead>
            <tr>
              <th>object</th>
              <th colSpan={8}>layer: what I am</th>
              <th>int</th>
              <th colSpan={8}>mask: what I scan</th>
              <th>int</th>
            </tr>
            <tr className="geom-bitnums">
              <th />
              {LAYER_NAMES.map((n, i) => (
                <th key={'l' + i} title={n}>
                  {i + 1}
                </th>
              ))}
              <th />
              {LAYER_NAMES.map((n, i) => (
                <th key={'m' + i} title={n}>
                  {i + 1}
                </th>
              ))}
              <th />
            </tr>
          </thead>
          <tbody>
            {objs.map((ob, i) => (
              <tr key={ob.name} className={(i === sel ? 'sel ' : '') + (hover && (hover[0] === i || hover[1] === i) ? 'hl' : '')}>
                <th className="geom-objname" onClick={() => setSel(i)}>
                  <span className="geom-idx">{i + 1}</span> {ob.name}
                  <span className="geom-node">{ob.node}</span>
                </th>
                {LAYER_NAMES.map((n, b) => (
                  <td key={'l' + b}>
                    {ob.kind === 'ray' ? (
                      <span className="geom-bit na">·</span>
                    ) : (
                      <button className={'geom-bit' + (ob.layer & (1 << b) ? ' on' : '')} onClick={() => { toggle(i, 'layer', b); setSel(i); }} aria-label={`${ob.name} layer ${b + 1} ${n}`} aria-pressed={!!(ob.layer & (1 << b))} />
                    )}
                  </td>
                ))}
                <td className="geom-int">{ob.kind === 'ray' ? '' : ob.layer}</td>
                {LAYER_NAMES.map((n, b) => (
                  <td key={'m' + b}>
                    {ob.kind === 'static' ? (
                      <span className="geom-bit na">·</span>
                    ) : (
                      <button className={'geom-bit mask' + (ob.mask & (1 << b) ? ' on' : '')} onClick={() => { toggle(i, 'mask', b); setSel(i); }} aria-label={`${ob.name} mask ${b + 1} ${n}`} aria-pressed={!!(ob.mask & (1 << b))} />
                    )}
                  </td>
                ))}
                <td className="geom-int">{ob.kind === 'static' ? '' : ob.mask}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="fig-main">
        <div className="geom-scroll">
          <table className="geom-matrix" onMouseLeave={() => setHover(null)}>
            <thead>
              <tr>
                <th className="geom-corner">row scans column</th>
                {objs.map((_, ti) => (
                  <th key={ti} title={objs[ti].name}>
                    {ti + 1}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {matrix.map((row, ri) => (
                <tr key={ri}>
                  <th onClick={() => setSel(ri)}>
                    <span className="geom-idx">{ri + 1}</span> {objs[ri].name}
                  </th>
                  {row.map((rel, ti) => {
                    const want = intended[ri][ti];
                    const changed = rel !== want && rel !== 'na' && rel !== 'self';
                    return (
                      <td key={ti} className={`geom-rel ${rel || 'none'}${changed ? ' changed' : ''}`} onMouseEnter={() => setHover([ri, ti])} title={`${objs[ri].name} → ${objs[ti].name}`}>
                        {cellTxt[rel]}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
          <div className="geom-note">
            <b>B</b> the row body is blocked by the column (its mask has the column's layer). <b>D</b> the row area or ray detects the column. <b>·</b> does not apply (static bodies do not scan; bodies pass through areas). Red cells differ from the course setup.
          </div>
        </div>
        <div className="fig-side">
          <SegControl
            label="preset"
            value={''}
            onChange={(v: string) => setObjs(PRESETS[v])}
            options={[
              { v: 'course', label: 'course' },
              { v: 'defaults', label: 'all on 1' },
              { v: 'bug', label: 'buggy' },
            ]}
          />
          {hover && hover[0] !== hover[1] && (
            <Readout
              title={`${objs[hover[0]].name} → ${objs[hover[1]].name}`}
              rows={[
                ['\\text{row mask}', bin(objs[hover[0]].mask)],
                ['\\text{column layer}', bin(objs[hover[1]].layer)],
                ['\\text{mask \\& layer}', bin(objs[hover[0]].mask & objs[hover[1]].layer)],
              ]}
            />
          )}
          <div className={'geom-diffs' + (diffs.length ? ' bad' : '')}>
            {diffs.length === 0 ? (
              <span>Matches the course setup: every hit, pickup and wall works, and nothing hits itself.</span>
            ) : (
              <>
                <b>{diffs.length} change{diffs.length > 1 ? 's' : ''} from the course setup</b>
                <ul>
                  {diffs.slice(0, 8).map((d, i) => (
                    <li key={i} className={d.kind}>
                      {d.text}
                    </li>
                  ))}
                  {diffs.length > 8 && <li>and {diffs.length - 8} more</li>}
                </ul>
              </>
            )}
          </div>
        </div>
      </div>
      <CodeBlock code={code} compact />
    </div>
  );
}
