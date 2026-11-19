// godot.scenetree: a manipulable scene tree.
//  mode 'paths': instance slime.tscn / coin.tscn at run time, free nodes, click a node to read its
//    absolute path, its path relative to another node, its groups, and the ready order of what you
//    just added.
//  mode 'pause': set each node's process_mode, pause the tree, and see which nodes still process.
import { useRef, useState } from 'react';
import type { VizSpec } from '../../content/types';
import { SegControl, Readout, FigureLayout, Btn } from '../kit';
import { CodeBlock } from '../../ui/GameCells';
import { useFrameLoop } from './common';
import './godot.css';

interface N {
  key: string;
  name: string;
  type: string;
  parent: string | null;
  groups?: string[];
  scene?: string; // root of an instanced scene
  inside?: string; // node that belongs to an instanced scene
  unique?: boolean;
}
const INITIAL: N[] = [
  { key: 'root', name: 'root', type: 'Window', parent: null },
  { key: 'main', name: 'Main', type: 'Node2D', parent: 'root' },
  { key: 'world', name: 'World', type: 'Node2D', parent: 'main' },
  { key: 'player', name: 'Player', type: 'CharacterBody2D', parent: 'world', groups: ['party'] },
  { key: 'psprite', name: 'Sprite', type: 'AnimatedSprite2D', parent: 'player' },
  { key: 'enemies', name: 'Enemies', type: 'Node2D', parent: 'world' },
  { key: 's1', name: 'Slime', type: 'CharacterBody2D', parent: 'enemies', groups: ['enemies'], scene: 'slime.tscn' },
  { key: 's1a', name: 'AnimatedSprite2D', type: 'AnimatedSprite2D', parent: 's1', inside: 'slime.tscn' },
  { key: 's1c', name: 'CollisionShape2D', type: 'CollisionShape2D', parent: 's1', inside: 'slime.tscn' },
  { key: 'coins', name: 'Coins', type: 'Node2D', parent: 'world' },
  { key: 'hud', name: 'HUD', type: 'CanvasLayer', parent: 'main' },
  { key: 'label', name: 'CoinLabel', type: 'Label', parent: 'hud', unique: true },
];

const kids = (ns: N[], k: string) => ns.filter((n) => n.parent === k);
function pre(ns: N[], k = 'root'): N[] {
  const n = ns.find((x) => x.key === k);
  return n ? [n, ...kids(ns, k).flatMap((c) => pre(ns, c.key))] : [];
}
const depthOf = (ns: N[], k: string): number => {
  const p = ns.find((x) => x.key === k)?.parent;
  return p ? depthOf(ns, p) + 1 : 0;
};
const chain = (ns: N[], k: string): N[] => {
  const n = ns.find((x) => x.key === k);
  return n ? [...(n.parent ? chain(ns, n.parent) : []), n] : [];
};
export function absPath(ns: N[], k: string) {
  return '/' + chain(ns, k).map((n) => n.name).join('/');
}
export function relPath(ns: N[], from: string, to: string) {
  const a = chain(ns, from), b = chain(ns, to);
  let i = 0;
  while (i < a.length && i < b.length && a[i].key === b[i].key) i++;
  const parts = [...Array(a.length - i).fill('..'), ...b.slice(i).map((n) => n.name)];
  return parts.length ? parts.join('/') : '.';
}
const dollar = (p: string) => (/^[A-Za-z_][\w]*(\/[A-Za-z_][\w]*)*$/.test(p) ? `$${p}` : `$"${p}"`);

function PathsTree() {
  const [ns, setNs] = useState<N[]>(INITIAL);
  const [sel, setSel] = useState('s1');
  const [from, setFrom] = useState('player');
  const [ready, setReady] = useState<Record<string, number>>({});
  const [code, setCode] = useState(`const SLIME_SCENE := preload("res://scenes/enemies/slime.tscn")


func spawn_slime(at: Vector2) -> void:
	var slime := SLIME_SCENE.instantiate()
	slime.position = at
	$World/Enemies.add_child(slime)`);
  const counter = useRef(2);

  const spawn = (scene: 'slime' | 'coin') => {
    const parent = scene === 'slime' ? 'enemies' : 'coins';
    const base = scene === 'slime' ? 'Slime' : 'Coin';
    const taken = kids(ns, parent).some((n) => n.name === base);
    const name = taken ? `@${base}@${counter.current++}` : base;
    const key = `${scene}${counter.current++}`;
    const sceneFile = `${scene}.tscn`;
    const add: N[] = [
      { key, name, type: scene === 'slime' ? 'CharacterBody2D' : 'Area2D', parent, groups: [scene === 'slime' ? 'enemies' : 'pickups'], scene: sceneFile },
      { key: key + 'a', name: 'AnimatedSprite2D', type: 'AnimatedSprite2D', parent: key, inside: sceneFile },
      { key: key + 'c', name: 'CollisionShape2D', type: 'CollisionShape2D', parent: key, inside: sceneFile },
    ];
    setNs([...ns, ...add]);
    setReady({ [key + 'a']: 1, [key + 'c']: 2, [key]: 3 });
    setSel(key);
    const C = scene === 'slime' ? 'SLIME_SCENE' : 'COIN_SCENE';
    const path = scene === 'slime' ? 'scenes/enemies/slime.tscn' : 'scenes/pickups/coin.tscn';
    setCode(`const ${C} := preload("res://${path}")


func spawn_${scene}(at: Vector2) -> void:
	var node := ${C}.instantiate()   # _init runs for each node in the scene
	node.position = at                    # set before add_child, so _ready sees it
	$World/${scene === 'slime' ? 'Enemies' : 'Coins'}.add_child(node)   # _enter_tree, then _ready (children first)
	# added as "${name}"${taken ? ': a sibling already has the name, so Godot generated one' : ''}`);
  };
  const free = () => {
    if (sel === 'root' || sel === 'main') return;
    const gone = new Set(pre(ns, sel).map((n) => n.key));
    const p = absPath(ns, sel);
    const rel = relPath(ns, 'main', sel);
    setNs(ns.filter((n) => !gone.has(n.key)));
    if (gone.has(from)) setFrom('main');
    setSel(ns.find((n) => n.key === sel)?.parent ?? 'main');
    setReady({});
    setCode(`# from Main's script; the node is removed at the end of the frame
${dollar(rel)}.queue_free()   # ${p}`);
  };
  const reset = () => {
    setNs(INITIAL);
    setSel('s1');
    setFrom('player');
    setReady({});
  };
  const target = ns.find((n) => n.key === sel) ?? ns[1];
  const fromNode = ns.find((n) => n.key === from) ?? ns[1];
  const rel = relPath(ns, from, sel);
  const groupCount = (g: string) => ns.filter((n) => n.groups?.includes(g)).length;
  const fromInside = fromNode.inside ?? fromNode.scene;
  const canUnique = target.unique && !fromInside;
  return (
    <FigureLayout
      side={
        <>
          <Btn onClick={() => spawn('slime')}>Instance slime.tscn</Btn>
          <Btn onClick={() => spawn('coin')}>Instance coin.tscn</Btn>
          <Btn onClick={free} disabled={sel === 'root' || sel === 'main'}>
            queue_free() selected
          </Btn>
          <Btn onClick={reset}>Reset</Btn>
          <label className="godot-field">
            <span>path from</span>
            <select value={from} onChange={(e) => setFrom(e.target.value)} aria-label="path from node">
              {pre(ns)
                .filter((n) => n.key !== 'root')
                .map((n) => (
                  <option key={n.key} value={n.key}>
                    {n.name}
                  </option>
                ))}
            </select>
          </label>
          <Readout
            rows={[
              ['\\text{absolute}', <code>{absPath(ns, sel)}</code>],
              ['\\text{from ' + fromNode.name.replace(/[@_]/g, '') + '}', <code>{rel}</code>],
              ['\\text{in GDScript}', <code>{canUnique ? `%${target.name}` : dollar(rel)}</code>],
              ['\\text{groups}', target.groups?.join(', ') || 'none'],
              ['\\text{in group enemies}', `${groupCount('enemies')} nodes`],
            ]}
          />
        </>
      }
      below={<CodeBlock code={code} file="scripts/main.gd (excerpt)" compact />}
    >
      <div className="godot-tree" role="tree" aria-label="scene tree, click a node to select it">
        {pre(ns).map((n) => (
          <button
            key={n.key}
            className={['godot-tree-row', n.key === sel ? 'active' : '', n.key === from ? 'from' : '', n.inside ? 'inside' : ''].join(' ')}
            style={{ paddingLeft: 8 + depthOf(ns, n.key) * 18 }}
            onClick={() => setSel(n.key)}
            role="treeitem"
            aria-selected={n.key === sel}
          >
            <span className="godot-tree-name">
              {n.unique ? '%' : ''}
              {n.name}
            </span>
            <span className="godot-tree-type">{n.type}</span>
            {n.scene && <span className="godot-chip scene">{n.scene}</span>}
            {n.groups?.map((g) => (
              <span key={g} className="godot-chip group">
                {g}
              </span>
            ))}
            {ready[n.key] && <span className="godot-chip ready">_ready #{ready[n.key]}</span>}
            {n.key === from && <span className="godot-chip from">from</span>}
          </button>
        ))}
      </div>
    </FigureLayout>
  );
}

// ------------------------------------------------------------------ pause mode
type PM = 'inherit' | 'pausable' | 'when_paused' | 'always' | 'disabled';
const PM_LABEL: Record<PM, string> = { inherit: 'Inherit', pausable: 'Pausable', when_paused: 'When Paused', always: 'Always', disabled: 'Disabled' };
const PM_CONST: Record<PM, string> = { inherit: 'PROCESS_MODE_INHERIT', pausable: 'PROCESS_MODE_PAUSABLE', when_paused: 'PROCESS_MODE_WHEN_PAUSED', always: 'PROCESS_MODE_ALWAYS', disabled: 'PROCESS_MODE_DISABLED' };
interface P {
  key: string;
  name: string;
  type: string;
  parent: string | null;
}
const PTREE: P[] = [
  { key: 'main', name: 'Main', type: 'Node2D', parent: null },
  { key: 'world', name: 'World', type: 'Node2D', parent: 'main' },
  { key: 'player', name: 'Player', type: 'CharacterBody2D', parent: 'world' },
  { key: 'slime', name: 'Slime', type: 'CharacterBody2D', parent: 'world' },
  { key: 'hud', name: 'HUD', type: 'CanvasLayer', parent: 'main' },
  { key: 'menu', name: 'PauseMenu', type: 'Control', parent: 'hud' },
  { key: 'music', name: 'Music', type: 'AudioStreamPlayer', parent: 'main' },
];
export function effective(modes: Record<string, PM>, k: string): Exclude<PM, 'inherit'> {
  const m = modes[k] ?? 'inherit';
  if (m !== 'inherit') return m;
  const p = PTREE.find((x) => x.key === k)?.parent;
  return p ? effective(modes, p) : 'pausable';
}
export const processes = (eff: Exclude<PM, 'inherit'>, paused: boolean) => eff === 'always' || (eff === 'pausable' && !paused) || (eff === 'when_paused' && paused);

function PauseTree() {
  const [modes, setModes] = useState<Record<string, PM>>({});
  const [paused, setPaused] = useState(false);
  const [msg, setMsg] = useState('Press "pause" to ask PauseMenu to pause the game.');
  const counts = useRef<Record<string, number>>({});
  const [, force] = useState(0);
  const ref = useRef<HTMLDivElement>(null);
  const acc = useRef(0);
  useFrameLoop(ref, (dt) => {
    acc.current += dt;
    let changed = false;
    while (acc.current >= 1 / 60) {
      acc.current -= 1 / 60;
      for (const n of PTREE) if (processes(effective(modes, n.key), paused)) counts.current[n.key] = (counts.current[n.key] ?? 0) + 1;
      changed = true;
    }
    if (changed) force((v) => (v + 1) % 1000000);
  });
  const menuRuns = processes(effective(modes, 'menu'), paused);
  const press = () => {
    if (!menuRuns) {
      setMsg(paused ? 'Nothing happens. PauseMenu is paused too, so its _unhandled_input never runs: the game is stuck.' : 'Nothing happens. PauseMenu only processes while paused, so it never sees the key that would pause.');
      return;
    }
    setPaused(!paused);
    setMsg(!paused ? 'PauseMenu set get_tree().paused = true and showed itself.' : 'PauseMenu set get_tree().paused = false and hid itself.');
  };
  const depth = (k: string): number => {
    const p = PTREE.find((x) => x.key === k)?.parent;
    return p ? depth(p) + 1 : 0;
  };
  const menuMode = modes.menu ?? 'inherit';
  const code = `extends Control
## PauseMenu. In the Inspector: Process > Mode = ${PM_LABEL[menuMode]}
## (the same as process_mode = ${PM_CONST[menuMode]}).


func _ready() -> void:
	hide()


func _unhandled_input(event: InputEvent) -> void:
	if event.is_action_pressed("pause"):
		get_tree().paused = not get_tree().paused
		visible = get_tree().paused
		get_viewport().set_input_as_handled()`;
  return (
    <FigureLayout
      side={
        <>
          <Btn primary onClick={press}>
            press "pause" (Esc)
          </Btn>
          <div className={'godot-note ' + (msg.startsWith('Nothing') ? 'godot-no' : '')}>{msg}</div>
          <Readout rows={[['\\texttt{get\\_tree().paused}', <code>{String(paused)}</code>]]} />
          <Btn onClick={() => { setPaused(false); setMsg('Unpaused from the debugger.'); }} disabled={!paused}>
            force unpause (debugger)
          </Btn>
          <Btn onClick={() => { setModes({}); setPaused(false); counts.current = {}; setMsg('Reset.'); }}>Reset</Btn>
        </>
      }
      below={<CodeBlock code={code} file="ui/pause_menu.gd" compact />}
    >
      <div className="godot-tree" ref={ref} role="tree" aria-label="scene tree with process modes">
        {PTREE.map((n) => {
          const eff = effective(modes, n.key);
          const on = processes(eff, paused);
          return (
            <div key={n.key} className={'godot-tree-row godot-pm-row' + (on ? ' running' : ' stopped')} style={{ paddingLeft: 8 + depth(n.key) * 18 }} role="treeitem">
              <span className={'godot-led' + (on ? ' on' : '')} aria-hidden="true" />
              <span className="godot-tree-name">{n.name}</span>
              <select value={modes[n.key] ?? 'inherit'} onChange={(e) => setModes({ ...modes, [n.key]: e.target.value as PM })} aria-label={`${n.name} process mode`}>
                {(Object.keys(PM_LABEL) as PM[]).map((m) => (
                  <option key={m} value={m}>
                    {PM_LABEL[m]}
                  </option>
                ))}
              </select>
              <span className="godot-tree-type">{(modes[n.key] ?? 'inherit') === 'inherit' ? `→ ${PM_LABEL[eff]}` : ''}</span>
              <span className="godot-tree-count">{counts.current[n.key] ?? 0}</span>
            </div>
          );
        })}
      </div>
    </FigureLayout>
  );
}

export function SceneTreeFig({ spec }: { spec: VizSpec }) {
  return spec.mode === 'pause' ? <PauseTree /> : <PathsTree />;
}
