// godot.layers: collision layers and masks as bits. Pick two objects from Shardbound's setup, toggle
// their layer and mask bits, and read who collides with or detects whom, with the integers Godot
// stores and the GDScript that sets them.
import { useState } from 'react';
import type { VizSpec } from '../../content/types';
import { Readout, FigureLayout, Btn } from '../kit';
import { CodeBlock } from '../../ui/GameCells';
import { bitsValue, binary } from './common';
import './godot.css';

export const LAYER_NAMES = ['world', 'player', 'party', 'enemy', 'player_hitbox', 'enemy_hitbox', 'interactable', 'pickup'];

type Kind = 'CharacterBody2D' | 'StaticBody2D' | 'Area2D';
interface Obj {
  name: string;
  kind: Kind;
  layer: number[];
  mask: number[];
  note: string;
}
const PRESETS: Obj[] = [
  { name: 'Kai (player body)', kind: 'CharacterBody2D', layer: [2], mask: [1], note: 'moves with move_and_slide and stops at the world' },
  { name: 'Slime (enemy body)', kind: 'CharacterBody2D', layer: [4], mask: [1], note: 'an enemy body; walls stop it' },
  { name: 'Wall (TileMapLayer)', kind: 'StaticBody2D', layer: [1], mask: [], note: 'tile collisions live on layer 1' },
  { name: 'Coin', kind: 'Area2D', layer: [8], mask: [2], note: 'reports bodies on the player layer' },
  { name: "Kai's sword Hitbox", kind: 'Area2D', layer: [5], mask: [], note: 'only exists to be found' },
  { name: 'Slime Hurtbox', kind: 'Area2D', layer: [4], mask: [5], note: "looks for the player's hitboxes" },
  { name: 'Chest', kind: 'StaticBody2D', layer: [1, 7], mask: [], note: 'solid, and interactable' },
  { name: "Kai's interact area", kind: 'Area2D', layer: [], mask: [7], note: 'finds things you can talk to or open' },
];

function relation(a: Obj, b: Obj): { ok: boolean; text: string } {
  const sees = a.mask.some((l) => b.layer.includes(l));
  const shared = a.mask.filter((l) => b.layer.includes(l)).map((l) => LAYER_NAMES[l - 1]);
  if (a.kind === 'StaticBody2D') return { ok: false, text: `${a.name} never moves, so its mask does nothing here.` };
  if (a.kind === 'CharacterBody2D') {
    if (b.kind === 'Area2D') return { ok: false, text: `Bodies pass through areas. Only the area can report the overlap.` };
    return sees ? { ok: true, text: `${a.name} is blocked by ${b.name} (mask ∋ ${shared.join(', ')}).` } : { ok: false, text: `${a.name} walks through ${b.name}: no layer of B is in A's mask.` };
  }
  const sig = b.kind === 'Area2D' ? 'area_entered' : 'body_entered';
  return sees ? { ok: true, text: `${a.name} emits ${sig}(${b.name}) (mask ∋ ${shared.join(', ')}).` } : { ok: false, text: `${a.name} ignores ${b.name}: no layer of B is in A's mask.` };
}

function BitGrid({ obj, onChange, label }: { obj: Obj; onChange: (o: Obj) => void; label: string }) {
  const flip = (which: 'layer' | 'mask', l: number) => {
    const cur = obj[which];
    onChange({ ...obj, [which]: cur.includes(l) ? cur.filter((x) => x !== l) : [...cur, l].sort((x, y) => x - y) });
  };
  return (
    <div className="godot-bits">
      <div className="godot-bits-head">
        <b>{label}</b>
        <select
          value={PRESETS.findIndex((p) => p.name === obj.name)}
          onChange={(e) => onChange({ ...PRESETS[Number(e.target.value)] })}
          aria-label={`${label}: preset`}
        >
          {PRESETS.map((p, i) => (
            <option key={p.name} value={i}>
              {p.name}
            </option>
          ))}
          {PRESETS.findIndex((p) => p.name === obj.name) < 0 && <option value={-1}>{obj.name}</option>}
        </select>
        <span className="godot-kind">{obj.kind}</span>
      </div>
      <table className="godot-bit-table">
        <thead>
          <tr>
            <th />
            {LAYER_NAMES.map((n, i) => (
              <th key={n} title={n}>
                <span className="godot-layer-no">{i + 1}</span>
                <span className="godot-layer-name">{n}</span>
              </th>
            ))}
            <th>value</th>
          </tr>
        </thead>
        <tbody>
          {(['layer', 'mask'] as const).map((w) => (
            <tr key={w}>
              <td className="godot-row-k">{w === 'layer' ? 'collision_layer' : 'collision_mask'}</td>
              {LAYER_NAMES.map((n, i) => (
                <td key={n}>
                  <button className={'godot-bit' + (obj[w].includes(i + 1) ? ' on' : '')} onClick={() => flip(w, i + 1)} aria-pressed={obj[w].includes(i + 1)} aria-label={`${label} ${w} ${i + 1} ${n}`}>
                    {obj[w].includes(i + 1) ? '1' : '0'}
                  </button>
                </td>
              ))}
              <td className="godot-val">{bitsValue(obj[w])}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="godot-note">{obj.note}</div>
    </div>
  );
}

export function Layers({ spec }: { spec: VizSpec }) {
  const [a, setA] = useState<Obj>({ ...PRESETS[(spec.a as number) ?? 0] });
  const [b, setB] = useState<Obj>({ ...PRESETS[(spec.b as number) ?? 3] });
  const ab = relation(a, b), ba = relation(b, a);
  const line = (o: Obj, v: string) => `${v}.collision_layer = ${bitsValue(o.layer)}  # ${binary(bitsValue(o.layer))}: ${o.layer.map((l) => LAYER_NAMES[l - 1]).join(', ') || 'none'}
${v}.collision_mask = ${bitsValue(o.mask)}  # ${binary(bitsValue(o.mask))}: ${o.mask.map((l) => LAYER_NAMES[l - 1]).join(', ') || 'none'}`;
  const code = `# A: ${a.name}
${line(a, 'a')}
# B: ${b.name}
${line(b, 'b')}
# the same, one bit at a time (layer numbers start at 1):
a.set_collision_mask_value(${a.mask[0] ?? 1}, true)`;
  return (
    <FigureLayout
      side={
        <>
          <Readout
            title="A → B"
            rows={[['', <span className={ab.ok ? 'godot-yes' : 'godot-no'}>{ab.ok ? 'yes' : 'no'}</span>]]}
          />
          <div className="godot-note">{ab.text}</div>
          <Readout title="B → A" rows={[['', <span className={ba.ok ? 'godot-yes' : 'godot-no'}>{ba.ok ? 'yes' : 'no'}</span>]]} />
          <div className="godot-note">{ba.text}</div>
          <Btn
            onClick={() => {
              setA(b);
              setB(a);
            }}
          >
            Swap A and B
          </Btn>
        </>
      }
      below={<CodeBlock code={code} compact />}
    >
      <div className="godot-col">
        <BitGrid obj={a} onChange={setA} label="A" />
        <BitGrid obj={b} onChange={setB} label="B" />
      </div>
    </FigureLayout>
  );
}
