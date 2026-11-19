// godot.signalflow: step through who calls whom when Kai picks up a coin, with a global Events bus
// or with direct calls, and through "call down, signal up" between a Player and its Sword. Click a
// connection to disconnect it, remove the HUD or the Player, and see which design survives.
import { useEffect, useMemo, useState } from 'react';
import type { VizSpec } from '../../content/types';
import { SegControl, Toggle, Readout, FigureLayout, usePlayer } from '../kit';
import { CodeBlock } from '../../ui/GameCells';
import { playSound } from '../game';
import './godot.css';

type Sc = 'bus' | 'direct' | 'updown';
interface Box {
  id: string;
  label: string;
  sub: string;
  x: number;
  y: number;
  auto?: boolean;
}
interface Edge {
  id: string;
  from: string;
  to: string;
  label: string;
  kind: 'signal' | 'call' | 'physics';
  toggle?: boolean;
  /** sideways shift in px, for two edges between the same boxes */
  off?: number;
}
interface Step {
  box: string;
  edge?: string;
  text: string;
  depth: number;
  error?: boolean;
  effect?: 'gold' | 'label' | 'sound' | 'atb';
}

const BW = 128, BH = 40;

function scenario(sc: Sc, on: Record<string, boolean>, hud: boolean, parentOk: boolean) {
  let boxes: Box[], edges: Edge[], code: string;
  const steps: Step[] = [];
  if (sc === 'updown') {
    boxes = [
      { id: 'player', label: parentOk ? 'Player' : 'TestRoom', sub: parentOk ? 'CharacterBody2D' : 'Node2D, no Player', x: 100, y: 30 },
      { id: 'sword', label: 'Sword', sub: 'Node2D, child', x: 100, y: 170 },
      { id: 'slime', label: 'Slime Hurtbox', sub: 'Area2D', x: 370, y: 170 },
      { id: 'hud', label: 'ATB bar', sub: 'HUD', x: 370, y: 30 },
    ];
    edges = [
      { id: 'down', from: 'player', to: 'sword', label: 'sword.swing()', kind: 'call', off: -24 },
      { id: 'hit', from: 'slime', to: 'sword', label: 'area_entered', kind: 'physics' },
      { id: 'up', from: 'sword', to: 'player', label: on.getParent ? 'get_parent().on_hit()' : 'hit_landed signal', kind: on.getParent ? 'call' : 'signal', off: 24 },
      { id: 'atb', from: 'player', to: 'hud', label: 'atb_changed signal', kind: 'signal' },
    ];
    if (parentOk) steps.push({ box: 'player', text: 'Player._physics_process: attack pressed, so it calls down: sword.swing(). A parent may hold references to its own children.', depth: 0 }, { box: 'sword', edge: 'down', text: 'Sword.swing() plays the slash and enables its hitbox.', depth: 1 });
    else steps.push({ box: 'sword', text: 'In a test room, a debug key calls sword.swing() directly.', depth: 0 });
    steps.push({ box: 'sword', edge: 'hit', text: "The hitbox overlaps the slime's hurtbox: physics emits area_entered and Sword._on_area_entered runs.", depth: 0 });
    if (on.getParent) {
      if (parentOk) steps.push({ box: 'player', edge: 'up', text: 'Sword calls get_parent().on_hit(target). It works, but only while its parent has an on_hit method. ATB += 10.', depth: 1, effect: 'atb' });
      else steps.push({ box: 'player', edge: 'up', text: "Error: Invalid call. Nonexistent function 'on_hit' in base 'Node2D'. The sword assumed who its parent is.", depth: 1, error: true });
    } else {
      steps.push({ box: 'sword', edge: 'up', text: 'Sword emits hit_landed(target). It does not know or care who is listening.', depth: 1 });
      if (parentOk) steps.push({ box: 'player', edge: 'up', text: 'Player._on_sword_hit_landed(target) runs: it connected to its child in _ready. ATB += 10.', depth: 2, effect: 'atb' });
      else steps.push({ box: 'sword', text: 'Nobody is connected, so emit() does nothing and returns. The sword works anywhere.', depth: 2 });
    }
    if (parentOk) steps.push({ box: 'hud', edge: 'atb', text: 'Player emits atb_changed(atb); the HUD bar, which connected to it, redraws. Signals go up and sideways; calls go down.', depth: 1 });
    code = on.getParent
      ? `extends Node2D
## sword.gd: reaches up to its parent. Fragile.


func _on_area_entered(area: Area2D) -> void:
	get_parent().on_hit(area)`
      : `extends Node2D
## sword.gd: signals up. Works under any parent, or none.

signal hit_landed(target: Area2D)


func _on_area_entered(area: Area2D) -> void:
	hit_landed.emit(area)`;
    return { boxes, edges, steps, code };
  }
  boxes = [
    { id: 'kai', label: 'Kai', sub: 'CharacterBody2D', x: 10, y: 206 },
    { id: 'coin', label: 'Coin', sub: 'Area2D', x: 10, y: 112 },
    ...(sc === 'bus' ? [{ id: 'events', label: 'Events', sub: 'autoload: signal bus', x: 214, y: 112, auto: true }] : []),
    ...(hud ? [{ id: 'label', label: 'CoinLabel', sub: 'Label in HUD', x: 382, y: 14 }] : []),
    { id: 'state', label: 'GameState', sub: 'autoload', x: 382, y: 112, auto: true },
    { id: 'audio', label: 'Audio', sub: 'autoload', x: 382, y: 210, auto: true },
  ];
  edges = [{ id: 'enter', from: 'kai', to: 'coin', label: 'body_entered', kind: 'physics' }];
  steps.push({ box: 'coin', edge: 'enter', text: "Kai's body overlaps the coin (mask: player). Physics emits body_entered(Kai), and Coin._on_body_entered runs.", depth: 0 });
  if (sc === 'bus') {
    edges.push({ id: 'emit', from: 'coin', to: 'events', label: 'emit(1)', kind: 'signal' });
    edges.push({ id: 'c_state', from: 'events', to: 'state', label: '1st', kind: 'signal', toggle: true });
    edges.push({ id: 'c_audio', from: 'events', to: 'audio', label: '2nd', kind: 'signal', toggle: true });
    if (hud) edges.push({ id: 'c_label', from: 'events', to: 'label', label: '3rd', kind: 'signal', toggle: true });
    steps.push({ box: 'events', edge: 'emit', text: 'Coin calls Events.coin_collected.emit(1). emit() calls every connected handler right now, in the order they connected, before it returns.', depth: 1 });
    if (on.c_state) steps.push({ box: 'state', edge: 'c_state', text: 'GameState._on_coin_collected(1): gold += 1. Autoloads are ready before the main scene, so they connected first.', depth: 2, effect: 'gold' });
    if (on.c_audio) steps.push({ box: 'audio', edge: 'c_audio', text: 'Audio._on_coin_collected(1): plays sfx_coin.', depth: 2, effect: 'sound' });
    if (hud && on.c_label) steps.push({ box: 'label', edge: 'c_label', text: 'CoinLabel._on_coin_collected(1): text = "Coins: 1". It connected in its own _ready.', depth: 2, effect: 'label' });
    if (!hud) steps.push({ box: 'events', text: 'No HUD in this scene, so one listener fewer. Nothing breaks: a signal with no listeners is fine.', depth: 2 });
    steps.push({ box: 'coin', text: 'emit() returns. Coin calls queue_free() and disappears at the end of the frame.', depth: 1 });
    code = `extends Area2D
## coin.gd: announces the pickup on the bus. Knows nothing about the HUD.

@export var value := 1


func _on_body_entered(_body: Node2D) -> void:
	Events.coin_collected.emit(value)
	queue_free()`;
  } else {
    if (hud) edges.push({ id: 'd_label', from: 'coin', to: 'label', label: 'get_node().add_coins()', kind: 'call' });
    else edges.push({ id: 'd_label', from: 'coin', to: 'coin', label: '', kind: 'call' });
    edges.push({ id: 'd_state', from: 'coin', to: 'state', label: 'GameState.gold += 1', kind: 'call' });
    edges.push({ id: 'd_audio', from: 'coin', to: 'audio', label: 'Audio.play_sfx()', kind: 'call' });
    if (hud) {
      steps.push({ box: 'label', edge: 'd_label', text: 'Coin calls get_node("/root/Main/HUD/CoinLabel").add_coins(1). The coin must know where the HUD lives.', depth: 1, effect: 'label' });
      steps.push({ box: 'state', edge: 'd_state', text: 'Coin changes GameState.gold directly.', depth: 1, effect: 'gold' });
      steps.push({ box: 'audio', edge: 'd_audio', text: 'Coin asks Audio to play sfx_coin.', depth: 1, effect: 'sound' });
      steps.push({ box: 'coin', text: 'Coin calls queue_free(). It works, as long as this exact tree exists.', depth: 1 });
    } else {
      steps.push({ box: 'coin', text: 'Error: Node not found: "/root/Main/HUD/CoinLabel". Then: Attempt to call function \'add_coins\' in base \'null instance\'. The debugger stops the game here; gold and sound never happen.', depth: 1, error: true });
    }
    code = `extends Area2D
## coin.gd: calls everyone itself. Breaks when the tree changes.

@export var value := 1


func _on_body_entered(_body: Node2D) -> void:
	get_node("/root/Main/HUD/CoinLabel").add_coins(value)
	GameState.gold += value
	Audio.play_sfx("coin")
	queue_free()`;
  }
  return { boxes, edges, steps, code };
}

export function SignalFlow({ spec }: { spec: VizSpec }) {
  const [sc, setSc] = useState<Sc>((spec.scenario as Sc) ?? 'bus');
  const [on, setOn] = useState<Record<string, boolean>>({ c_state: true, c_audio: true, c_label: true, getParent: false });
  const [hud, setHud] = useState(true);
  const [parentOk, setParentOk] = useState(true);
  const { boxes, edges, steps, code } = useMemo(() => scenario(sc, on, hud, parentOk), [sc, on, hud, parentOk]);
  const { i, setI, controls } = usePlayer(steps.length, { interval: 1200 });
  const step = steps[Math.min(i, steps.length - 1)];
  const reached = steps.slice(0, i + 1);
  const gold = reached.filter((s) => s.effect === 'gold').length;
  const coins = reached.filter((s) => s.effect === 'label').length;
  const atb = reached.filter((s) => s.effect === 'atb').length * 10;
  useEffect(() => {
    if (step?.effect === 'sound') playSound('sfx_coin');
  }, [step]);
  useEffect(() => setI(0), [sc, on, hud, parentOk, setI]);
  const box = (id: string) => boxes.find((b) => b.id === id);
  const center = (b: Box): [number, number] => [b.x + BW / 2, b.y + BH / 2];
  const edgeEnds = (e: Edge): [number, number, number, number] | null => {
    const a = box(e.from), b = box(e.to);
    if (!a || !b || a === b) return null;
    let [ax, ay] = center(a), [bx, by] = center(b);
    // shift sideways (in screen terms: vertical edges move left/right, others up/down)
    const o = e.off ?? 0;
    if (Math.abs(bx - ax) < Math.abs(by - ay)) {
      ax += o;
      bx += o;
    } else {
      ay += o;
      by += o;
    }
    const clip = (cx: number, cy: number, dx: number, dy: number) => {
      const tx = dx ? BW / 2 / Math.abs(dx) : Infinity, ty = dy ? BH / 2 / Math.abs(dy) : Infinity;
      const t = Math.min(tx, ty);
      return [cx + dx * t, cy + dy * t];
    };
    const [x1, y1] = clip(ax, ay, bx - ax, by - ay);
    const [x2, y2] = clip(bx, by, ax - bx, ay - by);
    return [x1, y1, x2, y2];
  };
  const labelAt = (x1: number, y1: number, x2: number, y2: number, off = 0): { x: number; y: number; anchor: 'start' | 'middle' | 'end' } => {
    const dx = x2 - x1, dy = y2 - y1;
    if (Math.abs(dx) < Math.abs(dy) * 0.3) return { x: (x1 + x2) / 2 + (off < 0 ? -6 : 6), y: (y1 + y2) / 2 + 3, anchor: off < 0 ? 'end' : 'start' };
    if (Math.abs(dy) < 4) return { x: (x1 + x2) / 2, y: (y1 + y2) / 2 - 6, anchor: 'middle' };
    const t = 0.7;
    return { x: x1 + dx * t - 4, y: y1 + dy * t + (dy < 0 ? -6 : 12), anchor: 'end' };
  };
  const toggles = edges.filter((e) => e.toggle);
  return (
    <FigureLayout
      side={
        <>
          <SegControl
            label="design"
            value={sc}
            onChange={setSc}
            options={[
              { v: 'bus', label: 'Events bus' },
              { v: 'direct', label: 'direct calls' },
              { v: 'updown', label: 'call down, signal up' },
            ]}
          />
          {sc !== 'updown' && <Toggle label="the scene has a HUD" value={hud} onChange={setHud} />}
          {sc === 'updown' && (
            <>
              <Toggle label="Sword calls get_parent() instead" value={on.getParent} onChange={(v) => setOn({ ...on, getParent: v })} />
              <Toggle label="Sword is a child of Player" value={parentOk} onChange={setParentOk} />
            </>
          )}
          {toggles.map((e) => (
            <Toggle key={e.id} label={`connected: Events → ${box(e.to)?.label}`} value={on[e.id]} onChange={(v) => setOn({ ...on, [e.id]: v })} />
          ))}
          <Readout
            rows={
              sc === 'updown'
                ? [['\\text{ATB}', String(atb)]]
                : [
                    ['\\text{GameState.gold}', String(gold)],
                    ['\\text{CoinLabel}', hud ? `Coins: ${coins}` : 'not in scene'],
                  ]
            }
          />
        </>
      }
      below={<CodeBlock code={code} file={sc === 'updown' ? 'scripts/sword.gd' : 'scripts/coin.gd'} compact />}
    >
      <div className="godot-col">
        {controls}
        <svg viewBox="0 0 520 260" className="godot-svg" role="img" aria-label="signal and call diagram">
          <defs>
            <marker id="gsf-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="9" markerHeight="9" markerUnits="userSpaceOnUse" orient="auto">
              <path d="M0,0 L10,5 L0,10 z" className="godot-arrowhead" />
            </marker>
          </defs>
          {edges.map((e) => {
            const p = edgeEnds(e);
            if (!p) return null;
            const [x1, y1, x2, y2] = p;
            const disc = e.toggle && !on[e.id];
            const hot = step?.edge === e.id;
            const cls = ['godot-edge', e.kind, hot ? 'hot' : '', disc ? 'off' : ''].join(' ');
            const lab = labelAt(x1, y1, x2, y2, e.off);
            return (
              <g key={e.id} onClick={e.toggle ? () => setOn({ ...on, [e.id]: !on[e.id] }) : undefined} style={e.toggle ? { cursor: 'pointer' } : undefined}>
                <line x1={x1} y1={y1} x2={x2} y2={y2} className={cls} markerEnd="url(#gsf-arrow)" />
                {e.toggle && <line x1={x1} y1={y1} x2={x2} y2={y2} stroke="transparent" strokeWidth={14} />}
                <text x={lab.x} y={lab.y} textAnchor={lab.anchor} className={'godot-svg-small godot-edge-label' + (hot ? ' hot' : '')}>
                  {disc ? 'disconnected' : e.label}
                </text>
              </g>
            );
          })}
          {boxes.map((b) => {
            const hot = step?.box === b.id;
            return (
              <g key={b.id}>
                <rect x={b.x} y={b.y} width={BW} height={BH} rx={5} className={'godot-box' + (hot ? (step.error ? ' err' : ' hot') : '') + (b.auto ? ' auto' : '')} />
                <text x={b.x + 8} y={b.y + 17} className="godot-box-title">
                  {b.label}
                </text>
                <text x={b.x + 8} y={b.y + 31} className="godot-svg-small">
                  {b.sub}
                </text>
              </g>
            );
          })}
        </svg>
        <ol className="godot-stack" aria-label="call stack">
          {reached.map((s, k) => (
            <li key={k} className={(k === i ? 'on ' : '') + (s.error ? 'err' : '')} style={{ marginLeft: s.depth * 16 }}>
              {s.text}
            </li>
          ))}
        </ol>
      </div>
    </FigureLayout>
  );
}
