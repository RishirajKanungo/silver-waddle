// godot.pixelscale: what the window does to a 320×180 pixel-art game. The game is drawn at its
// real resolution into an offscreen canvas, then scaled to a simulated window exactly as Godot's
// stretch settings would (mode viewport, aspect keep, scale mode integer or fractional, texture
// filter nearest or linear). The loupe shows 120×72 real screen pixels magnified 4×, so you can
// count how many screen pixels each game pixel gets.
import { useEffect, useMemo, useRef, useState } from 'react';
import type { VizSpec } from '../../content/types';
import { drawFrame, animFrame, SHEETS, theme } from '../game';
import { Slider, SegControl, Toggle, Readout, FigureLayout } from '../kit';
import { CodeBlock } from '../../ui/GameCells';
import { useFrameLoop } from './common';
import './godot.css';

const GW = 320, GH = 180;
const LW = 120, LH = 72, MAG = 4; // loupe: screen pixels shown, magnification
const CX = 160, CY = 88; // loupe centre in game pixels
const PRESETS: [number, number][] = [
  [1280, 720],
  [1366, 768],
  [1600, 900],
  [1920, 1080],
  [1280, 800],
];

type ScaleMode = 'integer' | 'fractional';
type Filter = 'nearest' | 'linear';

export function scaleFor(winW: number, winH: number, mode: ScaleMode) {
  const s = Math.min(winW / GW, winH / GH);
  return mode === 'integer' ? Math.max(1, Math.floor(s)) : s;
}

function drawGame(ctx: CanvasRenderingContext2D, heroX: number, t: number) {
  ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = '#5a8f4e';
  ctx.fillRect(0, 0, GW, GH);
  const tiles = SHEETS['tiles_overworld'];
  const grass = tiles?.tiles?.grass ?? 0;
  const grass2 = tiles?.tiles?.grass2 ?? grass;
  if (tiles) for (let y = 0; y < GH; y += 16) for (let x = 0; x < GW; x += 16) drawFrame(ctx, 'tiles_overworld', (x * 7 + y * 3) % 5 === 0 ? grass2 : grass, x, y);
  // a path and a 1-pixel test pattern: alternating columns and rows are the hardest case for scaling
  ctx.fillStyle = '#c9b27a';
  ctx.fillRect(96, 100, 128, 14);
  for (let i = 0; i < 48; i++) {
    ctx.fillStyle = i % 2 ? '#1b1b26' : '#f4f1e6';
    ctx.fillRect(136 + i, 104, 1, 6);
  }
  for (let j = 0; j < 8; j++) {
    ctx.fillStyle = j % 2 ? '#1b1b26' : '#f4f1e6';
    ctx.fillRect(186, 102 + j, 6, 1);
  }
  ctx.fillStyle = '#1b1b26';
  ctx.fillRect(128, 60, 1, 40); // a 1-px post
  const anim = 'walk_side';
  if (SHEETS['hero']) drawFrame(ctx, 'hero', animFrame('hero', anim, t), Math.round(heroX), 100, { anchored: true });
  else {
    ctx.fillStyle = '#3b6fd8';
    ctx.fillRect(Math.round(heroX) - 6, 78, 12, 22);
  }
}

export function PixelScale({ spec }: { spec: VizSpec }) {
  const [winW, setWinW] = useState<number>((spec.winW as number) ?? 1366);
  const [winH, setWinH] = useState<number>((spec.winH as number) ?? 768);
  const [mode, setMode] = useState<ScaleMode>((spec.mode as ScaleMode) ?? 'fractional');
  const [filter, setFilter] = useState<Filter>((spec.filter as Filter) ?? 'nearest');
  const [moving, setMoving] = useState(true);
  const [grid, setGrid] = useState(true);
  const loupeRef = useRef<HTMLCanvasElement>(null);
  const overRef = useRef<HTMLCanvasElement>(null);
  const st = useRef({ heroX: 150, dir: 1, t: 0, acc: 0 }).current;
  const off = useMemo(() => {
    const game = document.createElement('canvas');
    game.width = GW;
    game.height = GH;
    const small = document.createElement('canvas');
    small.width = LW;
    small.height = LH;
    return { game, small, img: small.getContext('2d')!.createImageData(LW, LH) };
  }, []);

  const s = scaleFor(winW, winH, mode);
  const contentW = GW * s, contentH = GH * s;
  const barX = (winW - contentW) / 2, barY = (winH - contentH) / 2;

  const render = () => {
    const gctx = off.game.getContext('2d', { willReadFrequently: true })!;
    drawGame(gctx, st.heroX, st.t);
    const src = gctx.getImageData(0, 0, GW, GH).data;
    const out = off.img.data;
    const X0 = Math.floor(CX * s) - LW / 2, Y0 = Math.floor(CY * s) - LH / 2;
    for (let y = 0; y < LH; y++) {
      for (let x = 0; x < LW; x++) {
        const o = (y * LW + x) * 4;
        if (filter === 'nearest') {
          const gx = Math.min(GW - 1, Math.max(0, Math.floor((X0 + x + 0.5) / s)));
          const gy = Math.min(GH - 1, Math.max(0, Math.floor((Y0 + y + 0.5) / s)));
          const i = (gy * GW + gx) * 4;
          out[o] = src[i];
          out[o + 1] = src[i + 1];
          out[o + 2] = src[i + 2];
          out[o + 3] = 255;
        } else {
          // bilinear: sample between the four nearest texel centres
          const u = (X0 + x + 0.5) / s - 0.5, v = (Y0 + y + 0.5) / s - 0.5;
          const x0 = Math.floor(u), y0 = Math.floor(v);
          const fx = u - x0, fy = v - y0;
          const cx0 = Math.min(GW - 1, Math.max(0, x0)), cx1 = Math.min(GW - 1, Math.max(0, x0 + 1));
          const cy0 = Math.min(GH - 1, Math.max(0, y0)), cy1 = Math.min(GH - 1, Math.max(0, y0 + 1));
          for (let c = 0; c < 3; c++) {
            const a = src[(cy0 * GW + cx0) * 4 + c], b = src[(cy0 * GW + cx1) * 4 + c];
            const d = src[(cy1 * GW + cx0) * 4 + c], e = src[(cy1 * GW + cx1) * 4 + c];
            out[o + c] = (a * (1 - fx) + b * fx) * (1 - fy) + (d * (1 - fx) + e * fx) * fy;
          }
          out[o + 3] = 255;
        }
      }
    }
    off.small.getContext('2d')!.putImageData(off.img, 0, 0);
    const lc = loupeRef.current?.getContext('2d');
    if (lc) {
      const th = theme(lc.canvas);
      lc.imageSmoothingEnabled = false;
      lc.fillStyle = th.bg;
      lc.fillRect(0, 0, lc.canvas.width, lc.canvas.height);
      lc.drawImage(off.small, 0, 0, LW * MAG, LH * MAG);
      // game-pixel boundaries and the ruler of widths
      const firstG = Math.floor(X0 / s);
      const rulerY = LH * MAG + 4;
      lc.font = '10px monospace';
      lc.textAlign = 'center';
      lc.textBaseline = 'middle';
      const common = mode === 'integer' ? s : Math.floor(s);
      for (let g = firstG; g * s < X0 + LW + s; g++) {
        const a = Math.max(0, Math.ceil(g * s - 0.5) - X0), b = Math.min(LW, Math.ceil((g + 1) * s - 0.5) - X0);
        if (b <= 0 || a >= LW) continue;
        const w = Math.ceil((g + 1) * s - 0.5) - Math.ceil(g * s - 0.5);
        if (grid && filter === 'nearest' && s >= 2) {
          lc.fillStyle = 'rgba(255,255,255,0.28)';
          lc.fillRect(a * MAG, 0, 1, LH * MAG);
        }
        lc.fillStyle = w === common ? th.bg2 : th.warn;
        lc.fillRect(a * MAG + 1, rulerY, (b - a) * MAG - 2, 18);
        if ((b - a) * MAG >= 10) {
          lc.fillStyle = w === common ? th.fg : th.bg;
          lc.fillText(String(w), ((a + b) / 2) * MAG, rulerY + 9);
        }
      }
      if (grid && filter === 'nearest' && s >= 2) {
        const firstR = Math.floor(Y0 / s);
        lc.fillStyle = 'rgba(255,255,255,0.28)';
        for (let g = firstR; g * s < Y0 + LH + s; g++) {
          const a = Math.ceil(g * s - 0.5) - Y0;
          if (a > 0 && a < LH) lc.fillRect(0, a * MAG, LW * MAG, 1);
        }
      }
    }
    const oc = overRef.current?.getContext('2d');
    if (oc) {
      const th = theme(oc.canvas);
      const W = oc.canvas.width, H = oc.canvas.height;
      oc.fillStyle = th.bg;
      oc.fillRect(0, 0, W, H);
      const k = Math.min((W - 8) / winW, (H - 8) / winH);
      const ox = (W - winW * k) / 2, oy = (H - winH * k) / 2;
      oc.fillStyle = '#000';
      oc.fillRect(ox, oy, winW * k, winH * k);
      oc.imageSmoothingEnabled = true;
      oc.drawImage(off.game, ox + barX * k, oy + barY * k, contentW * k, contentH * k);
      // where the loupe looks
      const X0w = barX + Math.floor(CX * s) - LW / 2, Y0w = barY + Math.floor(CY * s) - LH / 2;
      oc.strokeStyle = th.accent;
      oc.lineWidth = 1.5;
      oc.strokeRect(ox + X0w * k, oy + Y0w * k, Math.max(3, LW * k), Math.max(3, LH * k));
      oc.strokeStyle = th.line;
      oc.strokeRect(ox + 0.5, oy + 0.5, winW * k - 1, winH * k - 1);
    }
  };

  useFrameLoop(loupeRef, (dt) => {
    if (moving) {
      st.t += dt;
      st.heroX += st.dir * 9 * dt;
      if (st.heroX > 200) st.dir = -1;
      if (st.heroX < 130) st.dir = 1;
    }
    render();
  });
  useEffect(render);

  const lo = Math.floor(s + 1e-9), hi = Math.ceil(s - 1e-9);
  const widths = filter === 'linear' ? 'blended (no hard edges)' : lo === hi ? `${lo} px each` : `${lo} or ${hi} px (uneven)`;
  const code = `[display]
window/size/viewport_width=320
window/size/viewport_height=180
window/size/window_width_override=1280
window/size/window_height_override=720
window/stretch/mode="viewport"
window/stretch/scale_mode="${mode}"

[rendering]
textures/canvas_textures/default_texture_filter=${filter === 'nearest' ? 0 : 1}`;

  return (
    <FigureLayout
      side={
        <>
          <SegControl label="scale mode" value={mode} onChange={setMode} options={[{ v: 'integer', label: 'integer' }, { v: 'fractional', label: 'fractional' }]} />
          <SegControl label="texture filter" value={filter} onChange={setFilter} options={[{ v: 'nearest', label: 'Nearest' }, { v: 'linear', label: 'Linear' }]} />
          <SegControl
            label="window"
            value={`${winW}x${winH}`}
            onChange={(v: string) => {
              const [a, b] = v.split('x').map(Number);
              setWinW(a);
              setWinH(b);
            }}
            options={PRESETS.map(([a, b]) => ({ v: `${a}x${b}`, label: `${a}×${b}` }))}
          />
          <Slider label="width" value={winW} min={320} max={1920} step={2} onChange={setWinW} fmt={(v) => v.toFixed(0)} />
          <Slider label="height" value={winH} min={180} max={1200} step={2} onChange={setWinH} fmt={(v) => v.toFixed(0)} />
          <Toggle label="Kai walks" value={moving} onChange={setMoving} />
          <Toggle label="game-pixel grid" value={grid} onChange={setGrid} />
          <canvas ref={overRef} width={232} height={150} className="godot-overview" aria-label="the whole window, with black bars and the loupe area outlined" />
          <Readout
            rows={[
              ['\\text{scale } s', mode === 'integer' ? `${s}×` : `${s.toFixed(3)}×`],
              ['\\text{game image}', `${Math.round(contentW)}×${Math.round(contentH)}`],
              ['\\text{bars (each side)}', `${Math.round(barX)} | ${Math.round(barY)} px`],
              ['\\text{1 game px}', widths],
            ]}
          />
        </>
      }
      below={<CodeBlock code={code} file="project.godot (excerpt)" lang="cfg" compact />}
    >
      <div className="godot-col">
        <canvas ref={loupeRef} width={LW * MAG} height={LH * MAG + 26} className="godot-loupe" aria-label="loupe: 120 by 72 screen pixels around the hero, magnified 4 times, with the width of each game pixel listed below" />
        <div className="godot-note">Loupe: 120×72 real screen pixels, magnified 4×. The strip underneath gives each game column's width in screen pixels; orange marks the odd ones.</div>
      </div>
    </FigureLayout>
  );
}
