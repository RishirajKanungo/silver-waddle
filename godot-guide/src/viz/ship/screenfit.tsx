// ship.screenfit — how a 320×180 game fills real screens. Godot's stretch mode "viewport" renders
// at 320×180 and scales the image; scale_mode "integer" keeps every game pixel the same size and
// adds black bars, "fractional" fills more of the screen but makes pixels uneven. The readout gives
// the physical size of the HUD font on the chosen screen, the number that decides legibility on a
// 7-inch Steam Deck.
import { useEffect, useMemo, useRef, useState } from 'react';
import type { VizSpec } from '../../content/types';
import { SegControl, Readout, FigureLayout } from '../kit';
import { CodeBlock } from '../../ui/GameCells';
import { drawFrame, animFrame, SHEETS, text, rect } from '../game';

const GW = 320, GH = 180;
const SCREENS = [
  { id: 'deck', label: 'Steam Deck', w: 1280, h: 800, inch: 7 },
  { id: 'laptop', label: 'laptop 14"', w: 1366, h: 768, inch: 14 },
  { id: 'fhd', label: '1080p 24"', w: 1920, h: 1080, inch: 24 },
  { id: 'qhd', label: '1440p 27"', w: 2560, h: 1440, inch: 27 },
  { id: 'mac', label: '2560×1600 16"', w: 2560, h: 1600, inch: 16 },
  { id: 'uhd', label: '4K 27"', w: 3840, h: 2160, inch: 27 },
] as const;
type ScreenId = (typeof SCREENS)[number]['id'];

export function ScreenFit({ spec }: { spec: VizSpec }) {
  const [sid, setSid] = useState<ScreenId>((spec.screen as ScreenId) ?? 'deck');
  const [mode, setMode] = useState<'integer' | 'fractional'>('integer');
  const [glyph, setGlyph] = useState<7 | 14>(7);
  const scr = SCREENS.find((s) => s.id === sid)!;
  const raw = Math.min(scr.w / GW, scr.h / GH);
  const scale = mode === 'integer' ? Math.max(1, Math.floor(raw)) : raw;
  const aw = Math.round(GW * scale), ah = Math.round(GH * scale);
  const barX = (scr.w - aw) / 2, barY = (scr.h - ah) / 2;
  const ppi = Math.hypot(scr.w, scr.h) / scr.inch;
  const glyphPx = glyph * scale;
  const glyphMm = (glyphPx / ppi) * 25.4;
  const widths = mode === 'integer' ? `${scale} px each` : `${Math.floor(scale)} or ${Math.ceil(scale)} px (uneven)`;

  // preview: the screen drawn to fit 480 px wide, with the game area and bars
  const cv = useRef<HTMLCanvasElement>(null);
  const game = useRef<HTMLCanvasElement | null>(null);
  useEffect(() => {
    let raf = 0;
    const t0 = performance.now();
    const loop = () => {
      raf = requestAnimationFrame(loop);
      const c = cv.current;
      if (!c) return;
      const ctx = c.getContext('2d')!;
      game.current ??= Object.assign(document.createElement('canvas'), { width: GW, height: GH });
      const g = game.current.getContext('2d')!;
      g.imageSmoothingEnabled = false;
      const t = (performance.now() - t0) / 1000;
      // a tiny scene at 320×180
      rect(g, 0, 0, GW, GH, '#5a8f4e');
      const ts = SHEETS['tiles_overworld'];
      if (ts) {
        const tt = ts.tiles ?? {};
        const grass = [tt.grass ?? 0, tt.grass2 ?? tt.grass ?? 0, tt.grass3 ?? tt.grass ?? 0];
        for (let y = 0; y < GH; y += 16) for (let x = 0; x < GW; x += 16) drawFrame(g, 'tiles_overworld', grass[((x * 7 + y * 13) / 16) % 3 | 0], x, y);
      }
      if (SHEETS['hero']) drawFrame(g, 'hero', animFrame('hero', 'walk_side', t), 150, 110, { anchored: true });
      if (SHEETS['slime']) drawFrame(g, 'slime', animFrame('slime', 'idle', t), 200, 112, { anchored: true });
      rect(g, 4, 4, 92, 22, 'rgba(10,12,30,0.8)');
      text(g, 'KAI  HP 120', 8, 13, '#ffffff');
      text(g, 'ATB', 8, 23, '#9fd0ff');
      rect(g, 30, 18, 60, 4, '#33405a');
      rect(g, 30, 18, 40, 4, '#5fd0ff');
      // screen
      const pw = c.width, ph = c.height;
      const k = Math.min(pw / scr.w, ph / scr.h);
      const sw = scr.w * k, sh = scr.h * k;
      const ox = (pw - sw) / 2, oy = (ph - sh) / 2;
      ctx.clearRect(0, 0, pw, ph);
      ctx.fillStyle = '#000';
      ctx.fillRect(ox, oy, sw, sh);
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(game.current, ox + barX * k, oy + barY * k, aw * k, ah * k);
      ctx.strokeStyle = '#888';
      ctx.strokeRect(ox + 0.5, oy + 0.5, sw - 1, sh - 1);
    };
    loop();
    return () => cancelAnimationFrame(raf);
  }, [scr, aw, ah, barX, barY]);

  const code = useMemo(
    () => `; project.godot (excerpt). Set these in Project Settings > Display > Window.
[display]

window/size/viewport_width=320
window/size/viewport_height=180
window/size/window_width_override=1280
window/size/window_height_override=720
window/stretch/mode="viewport"
window/stretch/aspect="keep"
window/stretch/scale_mode="${mode}"
`,
    [mode],
  );

  return (
    <FigureLayout
      side={
        <>
          <SegControl label="screen" value={sid} options={SCREENS.map((s) => ({ v: s.id, label: s.label }))} onChange={setSid} />
          <SegControl label="scale_mode" value={mode} options={[{ v: 'integer', label: 'integer' }, { v: 'fractional', label: 'fractional' }]} onChange={setMode} />
          <SegControl label="HUD text" value={glyph} options={[{ v: 7, label: '7 px (1×)' }, { v: 14, label: '14 px (2×)' }]} onChange={setGlyph} />
          <Readout
            rows={[
              ['\\text{screen}', `${scr.w}×${scr.h}, ${ppi.toFixed(0)} ppi`],
              ['\\text{scale}', mode === 'integer' ? `${scale}×` : `${scale.toFixed(3)}×`],
              ['\\text{game area}', `${aw}×${ah}`],
              ['\\text{bars}', `${barX.toFixed(0)} px sides, ${barY.toFixed(0)} px top/bottom`],
              ['\\text{game pixel}', widths],
              ['\\text{capital letter}', `${glyphPx.toFixed(0)} px = ${glyphMm.toFixed(1)} mm`],
            ]}
          />
        </>
      }
      below={<CodeBlock code={code} file="project.godot" lang="cfg" compact />}
    >
      <canvas ref={cv} width={480} height={300} style={{ width: '100%', maxWidth: 480, height: 'auto', imageRendering: 'pixelated' }} aria-label="preview of the game on the chosen screen, with black bars" />
    </FigureLayout>
  );
}
