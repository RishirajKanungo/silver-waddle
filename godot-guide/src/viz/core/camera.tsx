// core.camera: a Camera2D lab in a room twice the size of the screen. Mirrors the c04-3 GameCamera:
//   the camera node goes to the player plus a look-ahead that eases toward velocity / walk_speed ×
//   look_ahead; drag margins hold the view still until the node leaves the drag rectangle; position
//   smoothing eases the view toward it; limits clamp the view to the room. Mode 'screens' instead
//   moves screen by screen. The overlay draws the drag box, the target and the look-ahead.
import { useMemo, useRef, useState } from 'react';
import type { VizSpec } from '../../content/types';
import { GameCanvas, Keys, text, rect, drawFrame, SHEETS, type Input } from '../game';
import { Slider, Toggle, Readout, FigureLayout, SegControl } from '../kit';
import { CodeBlock } from '../../ui/GameCells';
import { type Box, moveToward2, feetHit, drawChar, drawGrass, drawShadow } from './motionkit';

const W = 320, H = 180, WW = 640, WH = 360, MAX = 90;
const SOLID: Box[] = [
  [0, 0, WW, 16],
  [0, WH - 16, WW, 16],
  [0, 0, 16, WH],
  [WW - 16, 0, 16, WH],
];
// landmarks: trees (trunk bases) and a pond
const TREES: [number, number][] = [
  [80, 80], [200, 140], [120, 260], [300, 60], [420, 120], [520, 220], [360, 300], [580, 90], [260, 220], [470, 320],
];
const POND: Box = [384, 176, 96, 64];
for (const [x, y] of TREES) SOLID.push([x - 5, y - 5, 10, 5]);
SOLID.push(POND);

export function CameraLab({ spec }: { spec: VizSpec }) {
  const [mode, setMode] = useState<'follow' | 'screens'>((spec.mode as 'follow' | 'screens') ?? 'follow');
  const [smoothing, setSmoothing] = useState(5);
  const [smoothOn, setSmoothOn] = useState(true);
  const [drag, setDrag] = useState(0.2);
  const [look, setLook] = useState(24);
  const [limits, setLimits] = useState(true);
  const [overlay, setOverlay] = useState(true);
  const s = useRef({ x: 120, y: 120, vx: 0, vy: 0, facing: 'down' as 'down' | 'up' | 'side', flip: false, t: 0 }).current;
  const cam = useRef({ lookX: 0, lookY: 0, nodeX: 120, nodeY: 120, dragX: 120, dragY: 120, cx: 160, cy: 90 }).current;
  const [ro, setRo] = useState({ cx: 0, cy: 0, off: 0, limited: false });
  const n = useRef(0);

  const update = (dt: number, input: Input) => {
    const [ix, iy] = input.vector();
    moveToward2(s, ix * MAX, iy * MAX, (ix || iy ? 1200 : 1600) * dt);
    s.x += s.vx * dt;
    if (feetHit(SOLID, s.x, s.y)) {
      s.x -= s.vx * dt;
      s.vx = 0;
    }
    s.y += s.vy * dt;
    if (feetHit(SOLID, s.x, s.y)) {
      s.y -= s.vy * dt;
      s.vy = 0;
    }
    if (ix || iy) {
      if (Math.abs(ix) > Math.abs(iy)) {
        s.facing = 'side';
        s.flip = ix < 0;
      } else s.facing = iy < 0 ? 'up' : 'down';
    }
    s.t += dt;

    let wantX: number, wantY: number;
    if (mode === 'follow') {
      // GameCamera._physics_process: look-ahead eases toward the velocity direction
      const k = 1 - Math.exp(-3 * dt);
      let lx = (s.vx / MAX) * look, ly = (s.vy / MAX) * look;
      const len = Math.hypot(lx, ly);
      if (len > look) {
        lx *= look / len;
        ly *= look / len;
      }
      cam.lookX += (lx - cam.lookX) * k;
      cam.lookY += (ly - cam.lookY) * k;
      cam.nodeX = s.x + cam.lookX;
      cam.nodeY = s.y - 12 + cam.lookY;
      // drag margins: the view centre only moves when the node leaves the drag box
      const mx = drag * (W / 2), my = drag * (H / 2);
      cam.dragX = Math.min(Math.max(cam.dragX, cam.nodeX - mx), cam.nodeX + mx);
      cam.dragY = Math.min(Math.max(cam.dragY, cam.nodeY - my), cam.nodeY + my);
      wantX = cam.dragX;
      wantY = cam.dragY;
    } else {
      // screen by screen: the view centre is the centre of the screen the player is in
      wantX = Math.floor(s.x / W) * W + W / 2;
      wantY = Math.floor((s.y - 6) / H) * H + H / 2;
      cam.nodeX = wantX;
      cam.nodeY = wantY;
    }
    if (smoothOn) {
      const k = 1 - Math.exp(-smoothing * dt);
      cam.cx += (wantX - cam.cx) * k;
      cam.cy += (wantY - cam.cy) * k;
    } else {
      cam.cx = wantX;
      cam.cy = wantY;
    }
    let limited = false;
    if (limits) {
      const cx = Math.min(Math.max(cam.cx, W / 2), WW - W / 2), cy = Math.min(Math.max(cam.cy, H / 2), WH - H / 2);
      limited = cx !== cam.cx || cy !== cam.cy;
      cam.cx = cx;
      cam.cy = cy;
    }
    if (++n.current % 6 === 0) setRo({ cx: cam.cx, cy: cam.cy, off: Math.hypot(s.x - cam.cx, s.y - 12 - cam.cy), limited });
  };

  const draw = (ctx: CanvasRenderingContext2D) => {
    // pixel snapping: the view is drawn at whole pixels, like snap_2d_transforms_to_pixel
    const ox = Math.round(cam.cx - W / 2), oy = Math.round(cam.cy - H / 2);
    ctx.fillStyle = '#1a1424';
    ctx.fillRect(0, 0, W, H);
    ctx.save();
    ctx.beginPath();
    ctx.rect(-ox, -oy, WW, WH);
    ctx.clip();
    drawGrass(ctx, WW, WH, ox, oy);
    ctx.restore();
    const t = SHEETS['tiles_overworld']?.tiles ?? {};
    // pond
    const [px, py, pw, ph] = POND;
    for (let y = py; y < py + ph; y += 16)
      for (let x = px; x < px + pw; x += 16) {
        const k = (y === py ? 't' : y === py + ph - 16 ? 'b' : '') + (x === px ? 'l' : x === px + pw - 16 ? 'r' : '');
        const id = t['water_' + (k || 'c')];
        if (id !== undefined) drawFrame(ctx, 'tiles_overworld', id, x - ox, y - oy);
        else rect(ctx, x - ox, y - oy, 16, 16, '#2e6aa8');
      }
    // walls
    for (const [x, y, w, h] of SOLID.slice(0, 4)) {
      rect(ctx, x - ox, y - oy, w, h, '#4b4a5c');
      rect(ctx, x - ox, y - oy, w, 2, '#6f6d84');
    }
    // trees and the player, y-sorted
    const items: [number, () => void][] = TREES.map(([x, y]) => [
      y,
      () => {
        drawShadow(ctx, x - ox, y - oy, 9, 3);
        if (t.tree_tl !== undefined) {
          drawFrame(ctx, 'tiles_overworld', t.tree_tl, x - 16 - ox, y - 30 - oy);
          drawFrame(ctx, 'tiles_overworld', t.tree_tr, x - ox, y - 30 - oy);
          drawFrame(ctx, 'tiles_overworld', t.tree_bl, x - 16 - ox, y - 14 - oy);
          drawFrame(ctx, 'tiles_overworld', t.tree_br, x - ox, y - 14 - oy);
        } else rect(ctx, x - 10 - ox, y - 28 - oy, 20, 28, '#276838');
      },
    ]);
    items.push([
      s.y,
      () => {
        drawShadow(ctx, s.x - ox, s.y - oy);
        drawChar(ctx, 'hero', (Math.hypot(s.vx, s.vy) > 5 ? 'walk_' : 'idle_') + s.facing, s.t, s.x - ox, s.y - oy, { flip: s.flip });
      },
    ]);
    items.sort((a, b) => a[0] - b[0]);
    for (const [, d] of items) d();
    if (overlay) {
      if (mode === 'follow') {
        const mx = drag * (W / 2), my = drag * (H / 2);
        ctx.save();
        ctx.setLineDash([3, 2]);
        rect(ctx, cam.dragX - mx - ox, cam.dragY - my - oy, 2 * mx + 1, 2 * my + 1, 'rgba(255,240,154,0.9)', true);
        ctx.restore();
        ctx.strokeStyle = '#9aeaee';
        ctx.beginPath();
        ctx.moveTo(s.x - ox + 0.5, s.y - 12 - oy + 0.5);
        ctx.lineTo(cam.nodeX - ox + 0.5, cam.nodeY - oy + 0.5);
        ctx.stroke();
        rect(ctx, cam.nodeX - ox - 1, cam.nodeY - oy - 1, 3, 3, '#9aeaee');
      }
      // the view centre
      rect(ctx, W / 2 - 3, H / 2, 7, 1, '#ffffff');
      rect(ctx, W / 2, H / 2 - 3, 1, 7, '#ffffff');
      // minimap
      const mx0 = W - 86, my0 = 6, sc = 1 / 8;
      rect(ctx, mx0 - 1, my0 - 1, WW * sc + 2, WH * sc + 2, 'rgba(0,0,0,0.6)');
      rect(ctx, mx0, my0, WW * sc, WH * sc, '#3d6b39');
      rect(ctx, mx0 + px * sc, my0 + py * sc, pw * sc, ph * sc, '#2e6aa8');
      if (mode === 'screens')
        for (let k = 1; k < WW / W; k++) rect(ctx, mx0 + k * W * sc, my0, 1, WH * sc, 'rgba(255,255,255,0.35)');
      if (mode === 'screens') rect(ctx, mx0, my0 + H * sc, WW * sc, 1, 'rgba(255,255,255,0.35)');
      rect(ctx, mx0 + ox * sc, my0 + oy * sc, W * sc, H * sc, '#ffffff', true);
      rect(ctx, mx0 + s.x * sc - 1, my0 + s.y * sc - 1, 2, 2, '#fff09a');
      text(ctx, 'room 640x360', mx0, my0 + WH * sc + 9, '#ffffff');
    }
  };

  const code = useMemo(
    () =>
      mode === 'follow'
        ? `# Camera2D Inspector (scenes/test_room.tscn)
position_smoothing_enabled = ${smoothOn}
position_smoothing_speed = ${smoothing.toFixed(1)}
drag_horizontal_enabled = ${drag > 0}
drag_vertical_enabled = ${drag > 0}
drag_left_margin = ${drag.toFixed(2)}   # and right, top, bottom
# limits: ${limits ? 'fit_to(room) sets them to the room rectangle (0, 0, 640, 360)' : 'off (the defaults are huge numbers)'}

# scripts/game_camera.gd
@export var look_ahead := ${look.toFixed(1)}
@export var look_ahead_rate := 3.0
@export var walk_speed := 90.0`
        : `# Screen-by-screen: the camera jumps to the screen the player is in
var screen := Vector2(320, 180)
var cell := (target.global_position / screen).floor()
global_position = cell * screen + screen / 2.0
position_smoothing_enabled = ${smoothOn}   # a short pan between screens`,
    [mode, smoothing, smoothOn, drag, look, limits],
  );

  return (
    <FigureLayout
      side={
        <>
          <SegControl
            label="mode"
            value={mode}
            onChange={setMode}
            options={[
              { v: 'follow', label: 'follow' },
              { v: 'screens', label: 'screen by screen' },
            ]}
          />
          <Toggle label="position smoothing" value={smoothOn} onChange={setSmoothOn} />
          <Slider label="smoothing speed" value={smoothing} min={1} max={15} step={0.5} onChange={setSmoothing} fmt={(v) => v.toFixed(1)} />
          {mode === 'follow' && (
            <>
              <Slider label="drag margin" value={drag} min={0} max={0.5} step={0.05} onChange={setDrag} fmt={(v) => v.toFixed(2)} />
              <Slider label="look_ahead" value={look} min={0} max={48} step={2} onChange={setLook} fmt={(v) => v.toFixed(0) + ' px'} />
            </>
          )}
          <Toggle label="limits = room bounds" value={limits} onChange={setLimits} />
          <Toggle label="debug overlay and minimap" value={overlay} onChange={setOverlay} />
          <Readout
            rows={[
              ['\\text{view centre}', `(${ro.cx.toFixed(0)}, ${ro.cy.toFixed(0)})`],
              ['\\text{Kai to centre}', `${ro.off.toFixed(1)} px`],
              ['\\text{held by limits}', ro.limited ? 'yes' : 'no'],
              ['\\text{drag box}', `${(2 * drag * (W / 2)).toFixed(0)}×${(2 * drag * (H / 2)).toFixed(0)} px`],
            ]}
          />
        </>
      }
      below={<CodeBlock code={code} lang="text" file="camera settings" compact />}
    >
      <GameCanvas
        width={W}
        height={H}
        update={update}
        draw={draw}
        touchButtons={['up', 'down', 'left', 'right']}
        keysHint={<Keys items={[['WASD / arrows', 'move']]} />}
        label="camera lab: walk around a room twice the size of the screen"
      />
    </FigureLayout>
  );
}
