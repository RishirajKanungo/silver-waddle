// godot.sharedres: the shared-resource bug. Two slimes use the same stats resource; hit one and see
// what happens to the other, then fix it with duplicate(), Local to Scene, or by keeping run-time
// state (hp) on the node and only definitions (max_hp) in the resource.
import { useMemo, useRef, useState } from 'react';
import type { VizSpec } from '../../content/types';
import { SegControl, FigureLayout, Btn } from '../kit';
import { CodeBlock } from '../../ui/GameCells';
import { drawFrame, animFrame, animLength, SHEETS, rect, text, bar, playSound } from '../game';
import { useFrameLoop } from './common';
import './godot.css';

type Mode = 'shared' | 'duplicate' | 'local' | 'split';
const MAX = 30, DMG = 8;
interface Res {
  id: number;
  hp: number;
}
interface Slime {
  name: string;
  res: number;
  hp: number; // used in 'split' mode
  flash: number;
  pop: number;
  hurtT: number;
  deadT: number;
}

const CODE: Record<Mode, string> = {
  shared: `class_name Slime
extends CharacterBody2D

## slime_stats.tres, assigned in the Inspector of slime.tscn.
@export var stats: EnemyStats


func take_damage(amount: int) -> void:
	stats.hp -= amount  # changes the one resource every slime shares
	if stats.hp <= 0:
		queue_free()`,
  duplicate: `class_name Slime
extends CharacterBody2D

@export var stats: EnemyStats


func _ready() -> void:
	# Replace the shared resource with this slime's own copy.
	stats = stats.duplicate()


func take_damage(amount: int) -> void:
	stats.hp -= amount
	if stats.hp <= 0:
		queue_free()`,
  local: `class_name Slime
extends CharacterBody2D

## slime_stats.tres with Resource > Local to Scene enabled in the
## Inspector: every instance of slime.tscn gets its own copy.
@export var stats: EnemyStats


func take_damage(amount: int) -> void:
	stats.hp -= amount
	if stats.hp <= 0:
		queue_free()`,
  split: `class_name Slime
extends CharacterBody2D

## Shared, read-only definition: max_hp, attack, drops...
@export var data: EnemyData
## Run-time state belongs to this node.
var hp: int


func _ready() -> void:
	hp = data.max_hp


func take_damage(amount: int) -> void:
	hp -= amount
	if hp <= 0:
		queue_free()`,
};

export function SharedRes({ spec }: { spec: VizSpec }) {
  const [mode, setMode] = useState<Mode>((spec.mode as Mode) ?? 'shared');
  const nextId = useRef(2);
  const mk = (name: string, m: Mode, res: Res[]): Slime => {
    let id = 1;
    if (m === 'duplicate' || m === 'local') {
      id = nextId.current++;
      res.push({ id, hp: m === 'duplicate' ? res[0].hp : res[0].hp }); // both copy the file's values (the original is never hit)
    }
    return { name, res: id, hp: MAX, flash: 0, pop: 0, hurtT: -1, deadT: -1 };
  };
  const init = (m: Mode) => {
    nextId.current = 2;
    const res: Res[] = [{ id: 1, hp: MAX }];
    const slimes = [mk('Slime A', m, res), mk('Slime B', m, res)];
    return { res, slimes };
  };
  const [world, setWorld] = useState(() => init(mode));
  const w = useRef(world);
  w.current = world;
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const clock = useRef(0);
  const heroAtk = useRef(-1);

  const hpOf = (s: Slime) => (mode === 'split' ? s.hp : (world.res.find((r) => r.id === s.res)?.hp ?? 0));

  const hit = (k: number) => {
    const res = world.res.map((r) => ({ ...r }));
    const slimes = world.slimes.map((s) => ({ ...s }));
    const s = slimes[k];
    const cur = mode === 'split' ? s.hp : res.find((r) => r.id === s.res)!.hp;
    if (cur <= 0) return;
    if (mode === 'split') s.hp -= DMG;
    else res.find((r) => r.id === s.res)!.hp -= DMG;
    s.flash = 1;
    s.pop = 1;
    s.hurtT = clock.current;
    heroAtk.current = clock.current;
    playSound('sfx_hit', 0.4);
    setWorld({ res, slimes });
  };
  const spawn = () => {
    if (world.slimes.length >= 3) return;
    const res = world.res.map((r) => ({ ...r }));
    const s = mk('Slime C', mode, res);
    setWorld({ res, slimes: [...world.slimes, s] });
  };

  useFrameLoop(canvasRef, (dt) => {
    clock.current += dt;
    const ctx = canvasRef.current?.getContext('2d');
    if (!ctx) return;
    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = '#5a8f4e';
    ctx.fillRect(0, 0, 320, 100);
    const tiles = SHEETS['tiles_overworld'];
    if (tiles) for (let y = 0; y < 100; y += 16) for (let x = 0; x < 320; x += 16) drawFrame(ctx, 'tiles_overworld', tiles.tiles?.grass ?? 0, x, y);
    const t = clock.current;
    const atk = t - heroAtk.current < 0.3 && heroAtk.current >= 0;
    if (SHEETS['hero']) drawFrame(ctx, 'hero', animFrame('hero', atk ? 'attack_side' : 'idle_side', atk ? t - heroAtk.current : t), 40, 74, { anchored: true });
    else rect(ctx, 34, 52, 12, 22, '#3b6fd8');
    w.current.slimes.forEach((s, k) => {
      const x = 130 + k * 70, y = 74;
      const hp = mode === 'split' ? s.hp : (w.current.res.find((r) => r.id === s.res)?.hp ?? 0);
      const dead = hp <= 0;
      if (dead && s.deadT < 0) s.deadT = t;
      const hurt = s.hurtT >= 0 && t - s.hurtT < 0.25;
      const anim = dead ? 'die' : hurt ? 'hurt' : 'idle';
      const at = dead ? t - s.deadT : hurt ? t - s.hurtT : t + k * 0.3;
      const fading = dead && t - s.deadT > Math.max(0.4, animLength('slime', 'die'));
      if (SHEETS['slime']) drawFrame(ctx, 'slime', animFrame('slime', anim, at), x, y, { anchored: true, flash: s.flash, alpha: fading ? 0.35 : 1 });
      else rect(ctx, x - 7, y - 10, 14, 10, dead ? '#335533' : '#7bd36b');
      s.flash = Math.max(0, s.flash - dt * 6);
      bar(ctx, x - 14, y - 26, 28, 3, hp / MAX, dead ? '#666' : '#e04a4a', 'rgba(0,0,0,0.6)');
      text(ctx, `${Math.max(0, hp)}/${MAX}`, x, y - 30, '#ffffff', 'center');
      text(ctx, s.name, x, y + 12, '#ffffff', 'center');
      if (s.pop > 0) {
        text(ctx, `-${DMG}`, x + 10, y - 34 - (1 - s.pop) * 10, '#ffd65a', 'center');
        s.pop = Math.max(0, s.pop - dt * 1.5);
      }
    });
  });

  const switchMode = (m: Mode) => {
    setMode(m);
    setWorld(init(m));
  };
  const resBoxes = mode === 'split' ? [{ id: 1, hp: MAX }] : world.res.filter((r) => r.id === 1 ? mode === 'shared' : true).filter((r) => world.slimes.some((s) => s.res === r.id));
  const code = useMemo(() => CODE[mode], [mode]);
  const Wd = 520;
  const slimeX = (k: number) => 20 + k * 120;
  const resX = (k: number) => 20 + k * 120;
  return (
    <FigureLayout
      side={
        <>
          <SegControl
            label="setup"
            value={mode}
            onChange={switchMode}
            options={[
              { v: 'shared', label: 'shared' },
              { v: 'duplicate', label: 'duplicate()' },
              { v: 'local', label: 'Local to Scene' },
              { v: 'split', label: 'hp on the node' },
            ]}
          />
          {world.slimes.map((s, k) => (
            <Btn key={s.name} onClick={() => hit(k)} disabled={hpOf(s) <= 0}>
              Hit {s.name} (−{DMG})
            </Btn>
          ))}
          <Btn onClick={spawn} disabled={world.slimes.length >= 3}>
            Spawn Slime C
          </Btn>
          <Btn onClick={() => setWorld(init(mode))}>Reset</Btn>
        </>
      }
      below={<CodeBlock code={code} file="scripts/enemies/slime.gd" compact />}
    >
      <div className="godot-col">
        <div className="game-screen">
          <canvas ref={canvasRef} width={320} height={100} style={{ aspectRatio: '320 / 100' }} aria-label="Kai and the slimes with their HP bars" />
        </div>
        <svg viewBox={`0 0 ${Wd} 150`} className="godot-svg" role="img" aria-label="which resource each slime points to">
          <defs>
            <marker id="gsr-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto">
              <path d="M0,0 L10,5 L0,10 z" className="godot-arrowhead" />
            </marker>
          </defs>
          {world.slimes.map((s, k) => {
            const ri = mode === 'split' ? 0 : resBoxes.findIndex((r) => r.id === s.res);
            return (
              <g key={s.name}>
                <rect x={slimeX(k)} y={8} width={104} height={34} rx={4} className="godot-box" />
                <text x={slimeX(k) + 8} y={23} className="godot-box-title">
                  {s.name}
                </text>
                <text x={slimeX(k) + 8} y={36} className="godot-svg-small">
                  {mode === 'split' ? `hp = ${Math.max(0, s.hp)}` : 'node'}
                </text>
                {ri >= 0 && <line x1={slimeX(k) + 52} y1={42} x2={resX(ri) + 52} y2={86} className="godot-edge signal" markerEnd="url(#gsr-arrow)" />}
              </g>
            );
          })}
          {resBoxes.map((r, k) => (
            <g key={r.id}>
              <rect x={resX(k)} y={88} width={104} height={40} rx={4} className={'godot-box auto' + (world.slimes.filter((s) => s.res === r.id).length > 1 && mode !== 'split' ? ' err' : '')} />
              <text x={resX(k) + 8} y={103} className="godot-box-title">
                {mode === 'split' ? 'EnemyData' : 'EnemyStats'} #{r.id}
              </text>
              <text x={resX(k) + 8} y={117} className="godot-svg-small">
                {mode === 'split' ? `max_hp = ${MAX}` : `hp = ${Math.max(0, r.hp)}`}
              </text>
            </g>
          ))}
          <rect x={400} y={88} width={110} height={40} rx={4} className="godot-box file" />
          <text x={408} y={103} className="godot-box-title">
            {mode === 'split' ? 'slime.tres' : 'slime_stats.tres'}
          </text>
          <text x={408} y={117} className="godot-svg-small">
            on disk: {mode === 'split' ? 'max_hp' : 'hp'} = {MAX}
          </text>
        </svg>
      </div>
    </FigureLayout>
  );
}
