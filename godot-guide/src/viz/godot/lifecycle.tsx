// godot.lifecycle: step through the order in which Godot calls a script's virtual methods for a
// small scene tree: _init, _enter_tree (parents first), _ready (children first), _physics_process
// and _process each frame, a node spawned with add_child mid-frame, and queue_free with _exit_tree.
import { useMemo, useState } from 'react';
import type { VizSpec } from '../../content/types';
import { SegControl, FigureLayout, usePlayer } from '../kit';
import { CodeBlock } from '../../ui/GameCells';
import './godot.css';

interface TNode {
  id: string;
  type: string;
  parent: string | null;
  script: boolean;
}
const BASE: TNode[] = [
  { id: 'Main', type: 'Node2D', parent: null, script: true },
  { id: 'World', type: 'Node2D', parent: 'Main', script: false },
  { id: 'Player', type: 'CharacterBody2D', parent: 'World', script: true },
  { id: 'Sprite', type: 'AnimatedSprite2D', parent: 'Player', script: false },
  { id: 'Hitbox', type: 'Area2D', parent: 'Player', script: true },
  { id: 'Slime', type: 'CharacterBody2D', parent: 'World', script: true },
  { id: 'HUD', type: 'CanvasLayer', parent: 'Main', script: false },
  { id: 'CoinLabel', type: 'Label', parent: 'HUD', script: true },
];
const PHYS = ['Player', 'Slime'];
const PROC = ['Main', 'Player'];

type Scenario = 'startup' | 'spawn' | 'free';
interface Ev {
  node: string;
  call: string;
  phase: string;
  note?: string;
  /** nodes in the tree after this event */
  tree: string[];
  /** nodes that exist but are not in the tree yet */
  floating?: string[];
  depth?: number;
}

const children = (nodes: TNode[], id: string) => nodes.filter((n) => n.parent === id);
function preorder(nodes: TNode[], id = 'Main'): string[] {
  return [id, ...children(nodes, id).flatMap((c) => preorder(nodes, c.id))];
}
function postorder(nodes: TNode[], id = 'Main'): string[] {
  return [...children(nodes, id).flatMap((c) => postorder(nodes, c.id)), id];
}

function buildEvents(sc: Scenario): { evs: Ev[]; nodes: TNode[] } {
  const scripted = (ids: string[], nodes: TNode[]) => ids.filter((i) => nodes.find((n) => n.id === i)?.script);
  const all = BASE.map((n) => n.id);
  const evs: Ev[] = [];
  const frame = (k: number, tree: string[], phys: string[], proc: string[], hooks: Record<string, Ev[]> = {}) => {
    phys.forEach((n, i) => evs.push({ node: n, call: '_physics_process(0.0167)', phase: `frame ${k}: physics tick`, note: i === 0 ? 'Physics ticks due this frame run first, nodes in tree order.' : undefined, tree }));
    proc.forEach((n, i) => {
      evs.push({ node: n, call: '_process(delta)', phase: `frame ${k}: process`, note: i === 0 ? 'Then _process once per rendered frame, again in tree order (top to bottom).' : undefined, tree });
      for (const e of hooks[n] ?? []) evs.push(e);
    });
  };
  if (sc === 'startup') {
    const nodes = BASE;
    scripted(preorder(nodes), nodes).forEach((n, i) =>
      evs.push({ node: n, call: '_init()', phase: 'instantiate main.tscn', note: i === 0 ? 'Each node is constructed, parents before children. Its name and @export values from the scene are not assigned yet.' : undefined, tree: [], floating: all }),
    );
    scripted(preorder(nodes), nodes).forEach((n, i) =>
      evs.push({ node: n, call: '_enter_tree()', phase: 'add to the scene tree', note: i === 0 ? 'Entering the tree goes top-down: a parent enters before its children.' : undefined, tree: all }),
    );
    scripted(postorder(nodes), nodes).forEach((n, i) =>
      evs.push({ node: n, call: '_ready()', phase: 'ready', note: i === 0 ? '_ready goes bottom-up: every child is ready before its parent. @onready variables are assigned just before each _ready.' : n === 'Main' ? 'Main is last, so in Main._ready the whole scene is ready to use.' : undefined, tree: all }),
    );
    frame(1, all, PHYS, PROC);
    frame(2, all, PHYS, PROC);
    return { evs, nodes };
  }
  if (sc === 'spawn') {
    const nodes = [...BASE.slice(0, 6), { id: 'Slime2', type: 'CharacterBody2D', parent: 'World', script: true }, ...BASE.slice(6)];
    const before = all;
    const after = nodes.map((n) => n.id);
    frame(1, before, PHYS, PROC, {
      Main: [
        { node: 'Slime2', call: '_init()', phase: 'frame 1: inside Main._process', note: 'SLIME.instantiate() constructs the new slime right now, in the middle of Main._process.', tree: before, floating: ['Slime2'] },
        { node: 'Slime2', call: '_enter_tree()', phase: 'frame 1: inside add_child()', note: 'add_child() puts it in the tree immediately...', tree: after },
        { node: 'Slime2', call: '_ready()', phase: 'frame 1: inside add_child()', note: '...and readies it before add_child() returns. Main._process then continues on the next line.', tree: after },
      ],
    });
    frame(2, after, ['Player', 'Slime', 'Slime2'], PROC);
    return { evs, nodes };
  }
  // free
  const nodes = BASE;
  const without = all.filter((n) => !['Player', 'Sprite', 'Hitbox'].includes(n));
  frame(1, all, PHYS, ['Main'], {
    Main: [],
  });
  evs[evs.length - 1].note = 'Main._process sees Kai fall into a pit and calls player.queue_free().';
  evs.push({ node: 'Player', call: '_process(delta)', phase: 'frame 1: process', note: 'Kai still runs this frame: queue_free only marks the node. It is deleted after processing ends.', tree: all });
  evs.push({ node: 'Hitbox', call: '_exit_tree()', phase: 'frame 1: end of frame', note: 'Leaving the tree goes bottom-up: children first.', tree: all.filter((n) => n !== 'Hitbox') });
  evs.push({ node: 'Player', call: '_exit_tree()', phase: 'frame 1: end of frame', note: 'Then the node itself, and then the whole branch is freed. References to it are now invalid.', tree: without });
  frame(2, without, ['Slime'], ['Main']);
  return { evs, nodes };
}

const PROBE = `extends Node
## Attach to any node to print its lifecycle in the Output panel.


func _init() -> void:
	print("_init (name not assigned yet)")


func _enter_tree() -> void:
	print(name, " _enter_tree")


func _ready() -> void:
	print(name, " _ready")


func _exit_tree() -> void:
	print(name, " _exit_tree")`;

export function Lifecycle({ spec }: { spec: VizSpec }) {
  const [sc, setSc] = useState<Scenario>((spec.scenario as Scenario) ?? 'startup');
  const { evs, nodes } = useMemo(() => buildEvents(sc), [sc]);
  const { i, setI, controls } = usePlayer(evs.length, { interval: 900 });
  const ev = evs[Math.min(i, evs.length - 1)];
  const order = preorder(nodes);
  const depth = (id: string): number => {
    const p = nodes.find((n) => n.id === id)?.parent;
    return p ? depth(p) + 1 : 0;
  };
  const doneCalls = (id: string) => evs.slice(0, i + 1).filter((e) => e.node === id).length;
  return (
    <FigureLayout
      side={
        <>
          <SegControl
            label="scenario"
            value={sc}
            onChange={(v: Scenario) => {
              setSc(v);
              setI(0);
            }}
            options={[
              { v: 'startup', label: 'start the game' },
              { v: 'spawn', label: 'add_child' },
              { v: 'free', label: 'queue_free' },
            ]}
          />
          <ol className="godot-log" aria-label="calls so far">
            {evs.slice(0, i + 1).map((e, k) => (
              <li key={k} className={k === i ? 'on' : ''}>
                <span className="godot-log-n">{k + 1}</span> {e.node}.{e.call}
              </li>
            ))}
          </ol>
        </>
      }
      below={<CodeBlock code={PROBE} file="scripts/lifecycle_probe.gd" compact />}
    >
      <div className="godot-col">
        {controls}
        <div className="godot-phase">{ev.phase}</div>
        <div className="godot-tree" role="tree" aria-label="scene tree">
          {order.map((id) => {
            const n = nodes.find((x) => x.id === id)!;
            const inTree = ev.tree.includes(id);
            const floating = ev.floating?.includes(id);
            const cls = ['godot-tree-row', id === ev.node ? 'active' : '', !inTree ? (floating ? 'floating' : 'gone') : '', n.script ? '' : 'noscript'].join(' ');
            return (
              <div key={id} className={cls} style={{ paddingLeft: 8 + depth(id) * 18 }} role="treeitem">
                <span className="godot-tree-name">{id}</span>
                <span className="godot-tree-type">{n.type}</span>
                {n.script ? <span className="godot-chip">script</span> : <span className="godot-chip dim">no script</span>}
                {n.script && <span className="godot-tree-count">{doneCalls(id)} calls</span>}
                {id === ev.node && <span className="godot-call">{ev.call}</span>}
              </div>
            );
          })}
        </div>
        <div className="godot-callnote">
          <b>
            {ev.node}.{ev.call}
          </b>
          {ev.note ? <> {ev.note}</> : null}
        </div>
      </div>
    </FigureLayout>
  );
}
