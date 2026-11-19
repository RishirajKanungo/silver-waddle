// godot.tresedit: edit a data resource the way the Inspector does and read the .tres text Godot
// would save. Fields equal to the script's default are left out of the file, enums are stored as
// integers, other resources become ext_resource references.
import { useMemo, useRef, useState } from 'react';
import type { VizSpec } from '../../content/types';
import { SegControl, Slider, Readout, FigureLayout, Toggle } from '../kit';
import { CodeBlock } from '../../ui/GameCells';
import { drawFrame, animFrame, SHEETS } from '../game';
import { useFrameLoop } from './common';
import './godot.css';

const ELEMENTS = ['NONE', 'FIRE', 'ICE', 'LIGHTNING', 'EARTH'];
const TARGETS = ['SELF', 'ONE_ENEMY', 'ALL_ENEMIES', 'ONE_ALLY', 'ALL_ALLIES'];

type Field =
  | { key: string; kind: 'string' | 'multiline'; def: string }
  | { key: string; kind: 'int' | 'float'; def: number; min: number; max: number; step: number }
  | { key: string; kind: 'enum'; def: number; values: string[]; enumName: string }
  | { key: string; kind: 'stringname'; def: string; values: string[] }
  | { key: string; kind: 'res'; def: string; values: string[]; type: string };

interface Schema {
  cls: string;
  script: string;
  dir: string;
  fields: Field[];
  records: Record<string, Record<string, string | number>>;
  sprite: (rec: string) => [string, string];
}

const SCHEMAS: Record<'enemy' | 'ability', Schema> = {
  enemy: {
    cls: 'EnemyData',
    script: 'res://scripts/resources/enemy_data.gd',
    dir: 'resources/enemies',
    fields: [
      { key: 'display_name', kind: 'string', def: '' },
      { key: 'max_hp', kind: 'int', def: 10, min: 1, max: 400, step: 1 },
      { key: 'attack', kind: 'int', def: 5, min: 0, max: 60, step: 1 },
      { key: 'defense', kind: 'int', def: 0, min: 0, max: 40, step: 1 },
      { key: 'speed', kind: 'float', def: 40, min: 10, max: 120, step: 5 },
      { key: 'weakness', kind: 'enum', def: 0, values: ELEMENTS, enumName: 'Element.Type' },
      { key: 'stagger_max', kind: 'int', def: 100, min: 10, max: 300, step: 5 },
      { key: 'xp_reward', kind: 'int', def: 0, min: 0, max: 200, step: 1 },
      { key: 'gold_reward', kind: 'int', def: 0, min: 0, max: 200, step: 1 },
      { key: 'drop_item', kind: 'res', def: '', values: ['', 'res://resources/items/potion.tres', 'res://resources/items/ether.tres'], type: 'ItemData' },
      { key: 'drop_chance', kind: 'float', def: 0, min: 0, max: 1, step: 0.05 },
    ],
    records: {
      slime: { display_name: 'Slime', max_hp: 30, attack: 6, defense: 0, speed: 30, weakness: 1, stagger_max: 60, xp_reward: 4, gold_reward: 3, drop_item: 'res://resources/items/potion.tres', drop_chance: 0.25 },
      bat: { display_name: 'Bat', max_hp: 18, attack: 5, defense: 0, speed: 70, weakness: 3, stagger_max: 40, xp_reward: 5, gold_reward: 2, drop_item: '', drop_chance: 0 },
      skeleton: { display_name: 'Skeleton', max_hp: 60, attack: 12, defense: 4, speed: 40, weakness: 4, stagger_max: 100, xp_reward: 12, gold_reward: 8, drop_item: 'res://resources/items/ether.tres', drop_chance: 0.1 },
    },
    sprite: (r) => [r, r === 'bat' ? 'fly' : 'idle'],
  },
  ability: {
    cls: 'AbilityData',
    script: 'res://scripts/resources/ability_data.gd',
    dir: 'resources/abilities',
    fields: [
      { key: 'display_name', kind: 'string', def: '' },
      { key: 'description', kind: 'multiline', def: '' },
      { key: 'atb_cost', kind: 'int', def: 1, min: 0, max: 2, step: 1 },
      { key: 'mp_cost', kind: 'int', def: 0, min: 0, max: 60, step: 1 },
      { key: 'power', kind: 'int', def: 10, min: 0, max: 200, step: 5 },
      { key: 'element', kind: 'enum', def: 0, values: ELEMENTS, enumName: 'Element.Type' },
      { key: 'target', kind: 'enum', def: 1, values: TARGETS, enumName: 'AbilityData.Target' },
      { key: 'animation', kind: 'stringname', def: 'cast', values: ['cast', 'attack_side', 'attack_down', 'guard'] },
    ],
    records: {
      fire: { display_name: 'Fire', description: 'Hurls a fireball at one enemy.', atb_cost: 1, mp_cost: 6, power: 40, element: 1, target: 1, animation: 'cast' },
      cure: { display_name: 'Cure', description: 'Restores HP to one ally.', atb_cost: 1, mp_cost: 8, power: 30, element: 0, target: 3, animation: 'cast' },
      triple_slash: { display_name: 'Triple Slash', description: 'Three fast cuts.', atb_cost: 2, mp_cost: 0, power: 70, element: 0, target: 1, animation: 'attack_side' },
    },
    sprite: (r) => (r === 'triple_slash' ? ['hero', 'attack_side'] : ['mage', 'cast']),
  },
};

const UIDS = ['uid://bq3w8n1kd5xye', 'uid://c7hy2m0spa4tr', 'uid://dk4ve6x1qw0mz', 'uid://b8n2fq7rj3lsu'];
const q = (s: string) => '"' + s.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n') + '"';

export function tresText(schema: Schema, rec: string, v: Record<string, string | number>) {
  const ext: { type: string; path: string; id: string }[] = [{ type: 'Script', path: schema.script, id: '1_k2m4p' }];
  if (schema.cls === 'EnemyData') ext.push({ type: 'SpriteFrames', path: `res://assets/enemies/${rec}_frames.tres`, id: '2_r7c1x' });
  const props: string[] = [`script = ExtResource("1_k2m4p")`];
  const omitted: string[] = [];
  for (const f of schema.fields) {
    const val = v[f.key];
    if (val === f.def) {
      omitted.push(f.key);
      continue;
    }
    if (f.kind === 'string' || f.kind === 'multiline') props.push(`${f.key} = ${q(String(val))}`);
    else if (f.kind === 'int' || f.kind === 'enum') props.push(`${f.key} = ${Math.round(Number(val))}`);
    else if (f.kind === 'float') props.push(`${f.key} = ${Number.isInteger(Number(val)) ? Number(val).toFixed(1) : String(Math.round(Number(val) * 1000) / 1000)}`);
    else if (f.kind === 'stringname') props.push(`${f.key} = &${q(String(val))}`);
    else if (f.kind === 'res') {
      const id = `${ext.length + 1}_${String(val).includes('potion') ? 'p0t1n' : 'e7h3r'}`;
      ext.push({ type: 'Resource', path: String(val), id });
      props.push(`${f.key} = ExtResource("${id}")`);
    }
  }
  if (schema.cls === 'EnemyData') props.push(`sprite_frames = ExtResource("2_r7c1x")`);
  const head = `[gd_resource type="Resource" script_class="${schema.cls}" load_steps=${ext.length + 1} format=3 uid="${UIDS[0]}"]`;
  const exts = ext.map((e, i) => `[ext_resource type="${e.type}" uid="${UIDS[(i + 1) % UIDS.length]}" path="${e.path}" id="${e.id}"]`);
  return { text: [head, '', ...exts, '', '[resource]', ...props, ''].join('\n'), omitted };
}

export function TresEdit({ spec }: { spec: VizSpec }) {
  const kind = (spec.schema as 'enemy' | 'ability') ?? 'enemy';
  const schema = SCHEMAS[kind];
  const names = Object.keys(schema.records);
  const [rec, setRec] = useState(names[0]);
  const [vals, setVals] = useState<Record<string, Record<string, string | number>>>(() => JSON.parse(JSON.stringify(schema.records)));
  const [showDefaults, setShowDefaults] = useState(false);
  const v = vals[rec];
  const set = (k: string, x: string | number) => setVals({ ...vals, [rec]: { ...v, [k]: x } });
  const { text, omitted } = useMemo(() => tresText(schema, rec, v), [schema, rec, v]);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const clock = useRef(0);
  useFrameLoop(canvasRef, (dt) => {
    clock.current += dt;
    const ctx = canvasRef.current?.getContext('2d');
    if (!ctx) return;
    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = '#3a4a3a';
    ctx.fillRect(0, 0, 48, 40);
    const [sheet, anim] = schema.sprite(rec);
    if (SHEETS[sheet]) drawFrame(ctx, sheet, animFrame(sheet, anim, clock.current), 24, 36, { anchored: true });
    else {
      ctx.fillStyle = '#9bd36b';
      ctx.fillRect(16, 20, 16, 16);
    }
  });

  const n = (k: string) => Number(v[k]);
  const derived: [string, string][] =
    kind === 'enemy'
      ? (() => {
          const dmg = Math.max(1, 12 - n('defense'));
          const hits = Math.ceil(n('max_hp') / dmg);
          const p = n('drop_chance');
          return [
            ['\\text{Kai hits for}', `max(1, 12 − ${n('defense')}) = ${dmg}`],
            ['\\text{hits to defeat}', `⌈${n('max_hp')} / ${dmg}⌉ = ${hits}`],
            ['\\text{drop in 5 kills}', v.drop_item ? `${((1 - (1 - p) ** 5) * 100).toFixed(1)} %` : 'no drop'],
            ['\\text{gold per HP}', (n('gold_reward') / n('max_hp')).toFixed(2)],
          ];
        })()
      : [
          ['\\text{power per ATB bar}', n('atb_cost') ? (n('power') / n('atb_cost')).toFixed(1) : '∞'],
          ['\\text{power per MP}', n('mp_cost') ? (n('power') / n('mp_cost')).toFixed(1) : 'free'],
        ];

  return (
    <FigureLayout
      side={
        <>
          <div className="godot-row">
            <canvas ref={canvasRef} width={48} height={40} className="godot-sprite" aria-label="preview of the creature that uses this data" />
            <div className="godot-note">
              <b>{String(v.display_name) || '(no name)'}</b>
              <br />
              {schema.dir}/{rec}.tres
            </div>
          </div>
          <Readout rows={derived} title="what the numbers mean" />
          <Toggle label="list fields left at their default" value={showDefaults} onChange={setShowDefaults} />
          {showDefaults && <div className="godot-note">Not written to the file (equal to the default in the script): {omitted.length ? omitted.join(', ') : 'none'}.</div>}
        </>
      }
      below={<CodeBlock code={text} file={`${schema.dir}/${rec}.tres`} lang="tscn" compact />}
    >
      <div className="godot-col">
        <SegControl value={rec} onChange={setRec} options={names.map((k) => ({ v: k, label: String(vals[k].display_name) || k }))} />
        <div className="godot-inspector" role="group" aria-label={`Inspector for ${schema.cls}`}>
          <div className="godot-insp-head">{schema.cls}</div>
          {schema.fields.map((f) => {
            const val = v[f.key];
            const changed = val !== f.def;
            const lab = (
              <span className={'godot-insp-k' + (changed ? ' changed' : '')} title={changed ? 'differs from the default: saved in the file' : 'default: not saved'}>
                {f.key.replace(/_/g, ' ')}
              </span>
            );
            let input: React.ReactNode;
            if (f.kind === 'string') input = <input value={String(val)} onChange={(e) => set(f.key, e.target.value)} aria-label={f.key} />;
            else if (f.kind === 'multiline') input = <textarea rows={2} value={String(val)} onChange={(e) => set(f.key, e.target.value)} aria-label={f.key} />;
            else if (f.kind === 'int' || f.kind === 'float')
              input = <Slider value={Number(val)} min={f.min} max={f.max} step={f.step} onChange={(x) => set(f.key, x)} fmt={(x) => (f.kind === 'int' ? x.toFixed(0) : x.toFixed(2))} />;
            else if (f.kind === 'enum')
              input = (
                <select value={Number(val)} onChange={(e) => set(f.key, Number(e.target.value))} aria-label={f.key}>
                  {f.values.map((x, i) => (
                    <option key={x} value={i}>
                      {x} ({i})
                    </option>
                  ))}
                </select>
              );
            else if (f.kind === 'stringname' || f.kind === 'res')
              input = (
                <select value={String(val)} onChange={(e) => set(f.key, e.target.value)} aria-label={f.key}>
                  {f.values.map((x) => (
                    <option key={x} value={x}>
                      {x === '' ? '<empty>' : f.kind === 'stringname' ? `&"${x}"` : x.split('/').pop()}
                    </option>
                  ))}
                </select>
              );
            return (
              <div key={f.key} className="godot-insp-row">
                {lab}
                <span className="godot-insp-v">{input}</span>
                <button className="godot-revert" onClick={() => set(f.key, f.def)} disabled={!changed} title="revert to default" aria-label={`revert ${f.key}`}>
                  ↺
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </FigureLayout>
  );
}
