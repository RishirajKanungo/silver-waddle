// combat.atbtactical: three ways to build tactical mode in Godot, side by side.
//   A  Engine.time_scale = 0.1           everything slows, the menu's own animations too
//   B  get_tree().paused = true          the world stops; the menu needs PROCESS_MODE_ALWAYS
//   C  Engine.time_scale = 0.1 and the menu's tweens call set_ignore_time_scale()
// Press L (or the button) to open the menu, move its cursor with up/down, and watch what keeps moving.
import { useRef, useState } from 'react';
import type { VizSpec } from '../../content/types';
import { GameCanvas, Keys, rect, type Input } from '../game';
import { Slider, SegControl, Toggle, FigureLayout, Btn } from '../kit';
import { CodeBlock } from '../../ui/GameCells';
import { PAL, sprite, panel, stext, floor, shadow, effect } from './combatDraw';
import './combat.css';

type Approach = 'scale' | 'pause' | 'mixed';
const W = 320, H = 120;
const ITEMS = ['Fire', 'Blizzard', 'Cure'];

export function Tactical({ spec }: { spec: VizSpec }) {
  const [approach, setApproach] = useState<Approach>((spec.approach as Approach) ?? 'scale');
  const [scale, setScale] = useState(0.1);
  const [always, setAlways] = useState(true);
  const [open, setOpen] = useState(false);
  const st = useRef({ world: 0, menuT: 0, ball: 0, boom: -1, timer: 2, slimeT: 0, cursor: 0, stuck: false, real: 0, openReal: 0, openWorld: 0 }).current;
  const [, setTick] = useState(0);
  const frame = useRef(0);

  // speeds while the menu is open (the table always shows these)
  const openWorld = approach === 'pause' ? 0 : scale;
  const openMenu = approach === 'scale' ? scale : approach === 'pause' ? (always ? 1 : 0) : 1;
  const openInput = approach !== 'pause' || always;
  const worldScale = open ? openWorld : 1;
  const menuScale = open ? openMenu : 1;
  const menuInput = !open || openInput;

  const toggle = () => {
    if (open && !menuInput) {
      // a paused menu without PROCESS_MODE_ALWAYS never sees the key: the game is stuck
      st.stuck = true;
      return;
    }
    setOpen(!open);
    st.openReal = 0;
    st.openWorld = 0;
    st.stuck = false;
  };

  const update = (dt: number, input: Input) => {
    st.real += dt;
    const wdt = dt * worldScale;
    st.world += wdt;
    st.menuT += dt * menuScale;
    if (open) {
      st.openReal += dt;
      st.openWorld += wdt;
    }
    // fireball: 1.2 s of battle time from Lyra to the slime, then an explosion
    if (st.boom >= 0) {
      st.boom += wdt;
      if (st.boom > 0.5) {
        st.boom = -1;
        st.ball = 0;
      }
    } else {
      st.ball += wdt / 1.2;
      if (st.ball >= 1) {
        st.ball = 1;
        st.boom = 0;
      }
    }
    // the slime's attack Timer (wait_time 2 s)
    st.timer -= wdt;
    if (st.timer <= 0) st.timer += 2;
    st.slimeT += wdt;
    if (input.justPressed('tactical')) toggle();
    if (open && menuInput) {
      if (input.justPressed('down')) st.cursor = (st.cursor + 1) % ITEMS.length;
      if (input.justPressed('up')) st.cursor = (st.cursor + ITEMS.length - 1) % ITEMS.length;
    }
    if (++frame.current % 8 === 0) setTick((n) => n + 1);
  };

  const draw = (ctx: CanvasRenderingContext2D) => {
    floor(ctx, 0, 0, W, H);
    const lx = 50, ly = 84, sx = 262, sy = 84;
    shadow(ctx, lx, ly, 12);
    sprite(ctx, 'mage', 'cast', (st.world % 0.8) * 1.2, lx, ly, { color: '#a35ad1' });
    shadow(ctx, sx, sy, 14);
    sprite(ctx, 'slime', 'idle', st.slimeT, sx, sy, { flip: true, color: '#58b86a', size: [12, 9] });
    if (st.boom < 0) {
      const x = lx + 10 + (sx - lx - 16) * st.ball;
      const y = ly - 12 - Math.sin(st.ball * Math.PI) * 14;
      rect(ctx, x - 3, y - 3, 6, 6, 'rgba(255,138,61,0.55)');
      rect(ctx, x - 2, y - 2, 4, 4, '#ffd65a');
    } else effect(ctx, 'fx_explosion', st.boom, 0.5, sx, sy - 6);
    // Timer ring over the slime
    ctx.strokeStyle = 'rgba(255,255,255,0.25)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(sx, sy - 22, 5, 0, Math.PI * 2);
    ctx.stroke();
    ctx.strokeStyle = PAL.hurt;
    ctx.beginPath();
    ctx.arc(sx, sy - 22, 5, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * (1 - st.timer / 2));
    ctx.stroke();
    stext(ctx, `battle t ${st.world.toFixed(1)} s`, 6, 10, PAL.white);
    stext(ctx, `real t ${st.real.toFixed(1)} s`, 6, 20, PAL.grey);
    if (open) {
      ctx.fillStyle = 'rgba(24,36,92,0.35)';
      ctx.fillRect(0, 0, W, H);
      panel(ctx, 104, 22, 100, 48);
      ITEMS.forEach((it, i) => {
        const y = 36 + i * 11;
        if (i === st.cursor) {
          // the cursor nudges left and right: a looping tween in menu time
          const nudge = Math.round((Math.sin(st.menuT * 10) + 1) * 1.5);
          stext(ctx, '>', 112 + nudge, y, PAL.white);
        }
        stext(ctx, it, 124, y, i === st.cursor ? PAL.weak : PAL.white);
      });
      stext(ctx, approach === 'pause' ? 'PAUSED' : `TACTICAL x${scale.toFixed(2)}`, W - 6, 10, PAL.atb, 'right');
      if (st.stuck) stext(ctx, 'menu ignores input: stuck', W / 2, 112, PAL.hurt, 'center');
    } else stext(ctx, 'L: open tactical mode', W - 6, 10, PAL.grey, 'right');
  };

  const sp = (v: number) => (v === 0 ? <span className="off">stopped</span> : v === 1 ? <span className="on">×1</span> : <span className="slow">×{v.toFixed(2)}</span>);
  const rows: [string, string, number | 'input'][] = [
    ['Lyra, Slime', 'CharacterBody2D, _physics_process', openWorld],
    ['Fireball', 'Area2D moved in _physics_process', openWorld],
    ['AttackTimer', 'Timer, wait_time 2 s', openWorld],
    ['AnimatedSprite2D', 'sprite animation', openWorld],
    ['TacticalMenu input', '_unhandled_input', openInput ? 1 : 0],
    ['Cursor tween', 'create_tween() on the menu', openMenu],
  ];
  const code =
    approach === 'scale'
      ? `func open_tactical() -> void:
	Engine.time_scale = ${scale.toFixed(2)}
	menu.show()

func close_tactical() -> void:
	Engine.time_scale = 1.0
	menu.hide()`
      : approach === 'pause'
        ? `# TacticalMenu: Inspector > Process > Mode = ${always ? 'Always' : 'Inherit (bug: it pauses too)'}
func open_tactical() -> void:
	get_tree().paused = true
	menu.show()

func close_tactical() -> void:
	get_tree().paused = false
	menu.hide()`
        : `func open_tactical() -> void:
	Engine.time_scale = ${scale.toFixed(2)}
	menu.show()
	# menu animations run on real time
	cursor_tween = create_tween().set_loops().set_ignore_time_scale()
	cursor_tween.tween_property(cursor, "position:x", 3.0, 0.15).as_relative()
	cursor_tween.tween_property(cursor, "position:x", -3.0, 0.15).as_relative()`;

  return (
    <FigureLayout
      side={
        <>
          <SegControl
            label="approach"
            value={approach}
            onChange={(a) => {
              setApproach(a);
              st.stuck = false;
            }}
            options={[
              { v: 'scale', label: 'time_scale' },
              { v: 'pause', label: 'pause' },
              { v: 'mixed', label: 'scale + ignore' },
            ]}
          />
          {approach !== 'pause' ? (
            <Slider label="Engine.time_scale while open" value={scale} min={0.05} max={1} step={0.05} onChange={setScale} fmt={(v) => v.toFixed(2)} />
          ) : (
            <Toggle label="menu process_mode = ALWAYS" value={always} onChange={(v) => { setAlways(v); st.stuck = false; }} />
          )}
          <div className="combat-btns">
            <Btn primary onClick={toggle}>{open ? 'Close tactical' : 'Open tactical'}</Btn>
            {st.stuck && <Btn onClick={() => { setOpen(false); st.stuck = false; }}>Unstick</Btn>}
          </div>
          <table className="combat-table">
            <thead>
              <tr>
                <th>node</th>
                <th>while the menu is open</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(([n, what, v]) => (
                <tr key={n} title={what}>
                  <td>{n}</td>
                  <td>{v === 'input' ? '' : sp(v)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="combat-note">
            Menu open {st.openReal.toFixed(1)} s real time = {st.openWorld.toFixed(2)} s of battle.
          </p>
        </>
      }
      below={<CodeBlock compact file="scripts/battle/tactical_mode.gd (excerpt)" code={code} />}
    >
      <GameCanvas width={W} height={H} update={update} draw={draw} touchButtons={['up', 'down', 'tactical']} keysHint={<Keys items={[['L / Tab', 'open or close'], ['↑↓', 'move the cursor']]} />} label="tactical mode comparison: press L to open the menu, arrows to move the cursor" />
    </FigureLayout>
  );
}
