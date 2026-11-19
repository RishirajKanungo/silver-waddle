// rpg.ui_nineslice — drag a panel and see how a nine-slice (NinePatchRect / StyleBoxTexture) draws it (r05-1).
// Mirrors ui/make_theme.gd's _panel_box(): texture_margin_* (how the 24×24 image is cut), content_margin_*
// (where children go), axis stretch (stretch or tile). Compare with a plain stretched TextureRect.
import { useEffect, useMemo, useRef, useState } from 'react';
import type { VizSpec } from '../../content/types';
import { theme, rect, text, sheetCanvas, playSound } from '../game';
import { Slider, Toggle, Readout, FigureLayout, SegControl } from '../kit';
import { CodeBlock } from '../../ui/GameCells';
import { W, H, drawNine, CHAR_W } from './common';

const PX = 16, PY = 14; // panel's top-left corner (game px)
const LINES = ['Items', 'Equip', 'Shards', 'Save', 'Resume'];

export function NineSliceFigure(_: { spec: VizSpec }) {
  const [w, setW] = useState(150);
  const [h, setH] = useState(76);
  const [m, setM] = useState(8);
  const [c, setC] = useState(6);
  const [mode, setMode] = useState<'nine' | 'stretch'>('nine');
  const [tile, setTile] = useState(false);
  const [slices, setSlices] = useState(true);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drag = useRef(false);
  const minW = Math.max(4, 2 * m), minH = Math.max(4, 2 * m);
  const maxW = W - PX - 70, maxH = H - PY - 6;

  useEffect(() => {
    // keep the size legal when the margin grows (a NinePatchRect's minimum size is the sum of its margins)
    if (w < minW) setW(minW);
    if (h < minH) setH(minH);
  }, [minW, minH, w, h]);

  useEffect(() => {
    const cv = canvasRef.current;
    const ctx = cv?.getContext('2d');
    if (!cv || !ctx) return;
    const th = theme(cv);
    ctx.imageSmoothingEnabled = false;
    // a dim checkerboard so transparent pixels and the panel edge are visible
    for (let y = 0; y < H; y += 8)
      for (let x = 0; x < W; x += 8) {
        ctx.fillStyle = ((x + y) / 8) % 2 ? '#2c2840' : '#33304a';
        ctx.fillRect(x, y, 8, 8);
      }
    // the panel
    if (mode === 'nine') drawNine(ctx, PX, PY, w, h, { margin: m, tile });
    else ctx.drawImage(sheetCanvas('ui_panel'), 0, 0, 24, 24, PX, PY, w, h);
    // content: menu labels clipped to the content rectangle
    const cx = PX + c, cy = PY + c, cw = w - 2 * c, ch = h - 2 * c;
    let overflow = false;
    ctx.save();
    ctx.beginPath();
    ctx.rect(cx, cy, Math.max(0, cw), Math.max(0, ch));
    ctx.clip();
    LINES.forEach((s, i) => {
      const by = cy + 8 + i * 10;
      if (by > cy + ch || s.length * CHAR_W > cw) overflow = true;
      text(ctx, s, cx + 2, by, '#fbf6e6');
    });
    ctx.restore();
    if (slices && mode === 'nine') {
      ctx.save();
      ctx.setLineDash([2, 2]);
      ctx.strokeStyle = th.accent;
      ctx.lineWidth = 1;
      const mx = Math.min(m, w / 2), my = Math.min(m, h / 2);
      for (const x of [PX + mx, PX + w - mx]) {
        ctx.beginPath();
        ctx.moveTo(x + 0.5, PY - 4);
        ctx.lineTo(x + 0.5, PY + h + 4);
        ctx.stroke();
      }
      for (const y of [PY + my, PY + h - my]) {
        ctx.beginPath();
        ctx.moveTo(PX - 4, y + 0.5);
        ctx.lineTo(PX + w + 4, y + 0.5);
        ctx.stroke();
      }
      ctx.strokeStyle = '#eebb3e';
      ctx.setLineDash([1, 2]);
      ctx.strokeRect(cx + 0.5, cy + 0.5, Math.max(0, cw - 1), Math.max(0, ch - 1));
      ctx.restore();
    }
    // the drag handle
    rect(ctx, PX + w - 3, PY + h - 3, 6, 6, '#fbf6e6');
    rect(ctx, PX + w - 2, PY + h - 2, 4, 4, th.accent);
    // source texture inset at 2×, with the slice lines
    const ix = W - 60, iy = 12, s = 2;
    rect(ctx, ix - 3, iy - 3, 24 * s + 6, 24 * s + 18, 'rgba(0,0,0,0.55)');
    ctx.drawImage(sheetCanvas('ui_panel'), 0, 0, 24, 24, ix, iy, 24 * s, 24 * s);
    ctx.save();
    ctx.strokeStyle = th.accent;
    ctx.setLineDash([2, 2]);
    for (const v of [m, 24 - m]) {
      ctx.beginPath();
      ctx.moveTo(ix + v * s + 0.5, iy - 2);
      ctx.lineTo(ix + v * s + 0.5, iy + 24 * s + 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(ix - 2, iy + v * s + 0.5);
      ctx.lineTo(ix + 24 * s + 2, iy + v * s + 0.5);
      ctx.stroke();
    }
    ctx.restore();
    text(ctx, 'panel.png', ix, iy + 24 * s + 12, '#c0bed4');
    if (overflow) text(ctx, 'clipped', PX + w + 6, PY + h - 2, '#f8925e');
  }, [w, h, m, c, mode, tile, slices]);

  const toLogical = (e: React.PointerEvent) => {
    const r = canvasRef.current!.getBoundingClientRect();
    return [((e.clientX - r.left) * W) / r.width, ((e.clientY - r.top) * H) / r.height];
  };
  const clampSize = (nw: number, nh: number) => {
    setW(Math.round(Math.max(minW, Math.min(maxW, nw))));
    setH(Math.round(Math.max(minH, Math.min(maxH, nh))));
  };
  const onDown = (e: React.PointerEvent) => {
    const [x, y] = toLogical(e);
    if (Math.abs(x - (PX + w)) < 10 && Math.abs(y - (PY + h)) < 10) {
      drag.current = true;
      (e.target as Element).setPointerCapture(e.pointerId);
    }
  };
  const onMove = (e: React.PointerEvent) => {
    if (!drag.current) return;
    const [x, y] = toLogical(e);
    clampSize(x - PX, y - PY);
  };
  const onUp = () => {
    if (drag.current) playSound('sfx_menu_move', 0.3);
    drag.current = false;
  };
  const onKey = (e: React.KeyboardEvent) => {
    const step = e.shiftKey ? 8 : 1;
    const d: Record<string, [number, number]> = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
    const v = d[e.key];
    if (!v) return;
    e.preventDefault();
    clampSize(w + v[0], h + v[1]);
  };

  const ew = w - 2 * m, eh = h - 2 * m;
  const code = useMemo(
    () => `var box := StyleBoxTexture.new()
box.texture = preload("res://assets/ui/panel.png")
box.texture_margin_left = ${m}
box.texture_margin_top = ${m}
box.texture_margin_right = ${m}
box.texture_margin_bottom = ${m}
box.content_margin_left = ${c}
box.content_margin_top = ${c}
box.content_margin_right = ${c}
box.content_margin_bottom = ${c}
box.axis_stretch_horizontal = StyleBoxTexture.${tile ? 'AXIS_STRETCH_MODE_TILE' : 'AXIS_STRETCH_MODE_STRETCH'}
box.axis_stretch_vertical = StyleBoxTexture.${tile ? 'AXIS_STRETCH_MODE_TILE' : 'AXIS_STRETCH_MODE_STRETCH'}
theme.set_stylebox("panel", "PanelContainer", box)
# panel size ${w}×${h}: corners ${m}×${m}, top/bottom edges ${ew}×${m}, sides ${m}×${eh}, centre ${ew}×${eh}`,
    [m, c, tile, w, h, ew, eh],
  );

  return (
    <FigureLayout
      side={
        <>
          <SegControl label="draw as" value={mode} options={[{ v: 'nine', label: 'nine-slice' }, { v: 'stretch', label: 'TextureRect (stretch)' }]} onChange={setMode} />
          <Slider label="patch margin" value={m} min={1} max={12} step={1} onChange={setM} fmt={(v) => v.toFixed(0) + ' px'} />
          <Slider label="content margin" value={c} min={0} max={14} step={1} onChange={setC} fmt={(v) => v.toFixed(0) + ' px'} />
          <Toggle label="tile edges and centre" value={tile} onChange={setTile} />
          <Toggle label="show slices" value={slices} onChange={setSlices} />
          <Readout
            rows={[
              ['w \\times h', `${w} × ${h}`],
              ['\\text{corners}', `4 × ${m}×${m}`],
              ['\\text{edges}', `${ew}×${m}, ${m}×${eh}`],
              ['\\text{centre}', `${ew}×${eh}`],
              ['\\text{centre scale}', `${(ew / Math.max(1, 24 - 2 * m)).toFixed(1)}× , ${(eh / Math.max(1, 24 - 2 * m)).toFixed(1)}×`],
              ['\\text{min size } 2m', `${2 * m}×${2 * m}`],
              ['\\text{content}', `${Math.max(0, w - 2 * c)}×${Math.max(0, h - 2 * c)}`],
            ]}
          />
        </>
      }
      below={<CodeBlock code={code} file="ui/make_theme.gd (excerpt)" compact />}
    >
      <div className="world-stack">
        <canvas
          ref={canvasRef}
          width={W}
          height={H}
          className="world-canvas"
          tabIndex={0}
          aria-label="nine-slice panel: drag the bottom-right handle, or focus and use the arrow keys, to resize"
          onPointerDown={onDown}
          onPointerMove={onMove}
          onPointerUp={onUp}
          onPointerCancel={onUp}
          onKeyDown={onKey}
          style={{ cursor: 'nwse-resize', maxWidth: 640 }}
        />
        <div className="world-note">Drag the handle at the panel's corner, or click the drawing and use the arrow keys (Shift for 8 px steps).</div>
      </div>
    </FigureLayout>
  );
}
