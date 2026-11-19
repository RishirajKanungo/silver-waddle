// core.pixelAnim: animation timing on a 60 Hz clock. Pick a sheet and an animation, set a uniform FPS
// or hold each frame for its own number of ticks, step through frames, turn on onion skinning, and
// see where each frame sits on the sheet (frame index, column and row for Sprite2D.hframes/vframes).
import { useEffect, useMemo, useRef, useState } from 'react';
import type { VizSpec } from '../../content/types';
import { GameCanvas, clear, rect, text, line, drawFrame, SHEETS, sheetCanvas } from '../game';
import { Slider, Toggle, Readout, FigureLayout, SegControl } from '../kit';
import { CodeBlock } from '../../ui/GameCells';

const W = 320, H = 180;
export const ANIM_SHEETS = ['hero', 'mage', 'guard', 'slime', 'bat', 'skeleton', 'golem'];
// animation names from the course's asset list, used before the art exists
const FALLBACK: Record<string, string[]> = {
  hero: ['idle_down', 'walk_down', 'walk_side', 'attack_side', 'dash_side', 'jump_side', 'cast', 'hurt'],
  mage: ['idle_down', 'walk_down', 'walk_side', 'attack_side', 'cast', 'hurt'],
  guard: ['idle_down', 'walk_down', 'walk_side', 'attack_side', 'guard', 'hurt'],
  slime: ['idle', 'hop', 'hurt', 'die'],
  bat: ['fly', 'hurt'],
  skeleton: ['idle', 'walk', 'windup', 'attack', 'hurt', 'die'],
  golem: ['idle', 'walk', 'windup', 'slam', 'hurt', 'stagger'],
};

function animInfo(sheet: string, anim: string) {
  const a = SHEETS[sheet]?.anims?.[anim];
  return a ? { frames: a.frames, fps: a.fps, loop: a.loop } : { frames: [0, 1, 2, 3], fps: 8, loop: true };
}

export function AnimTiming({ spec }: { spec: VizSpec }) {
  const [sheet, setSheet] = useState((spec.sheet as string) ?? 'hero');
  const anims = SHEETS[sheet]?.anims ? Object.keys(SHEETS[sheet].anims!) : FALLBACK[sheet] ?? ['idle'];
  const [anim, setAnim] = useState((spec.anim as string) ?? 'attack_side');
  const cur = anims.includes(anim) ? anim : anims[0];
  const info = animInfo(sheet, cur);
  const [timing, setTiming] = useState<'fps' | 'holds'>((spec.timing as 'fps' | 'holds') ?? 'fps');
  const [fps, setFps] = useState(info.fps);
  const [holds, setHolds] = useState<number[]>(() => info.frames.map(() => Math.max(1, Math.round(60 / info.fps))));
  const [onion, setOnion] = useState(false);
  const [playing, setPlaying] = useState(true);
  const [loop, setLoop] = useState(true);
  const st = useRef({ idx: 0, tick: 0 });
  // reset timing when the animation changes
  useEffect(() => {
    const i = animInfo(sheet, cur);
    setFps(i.fps);
    setHolds(i.frames.map(() => Math.max(1, Math.round(60 / i.fps))));
    st.current = { idx: 0, tick: 0 };
  }, [sheet, cur]);
  const [shown, setShown] = useState(0);

  const n = info.frames.length;
  const holdOf = (i: number) => (timing === 'fps' ? 60 / fps : holds[i] ?? 1);
  const cycle = Array.from({ length: n }, (_, i) => holdOf(i)).reduce((a, b) => a + b, 0);

  const update = () => {
    if (!playing) return;
    const s = st.current;
    s.tick += 1;
    if (s.tick >= holdOf(s.idx)) {
      s.tick -= holdOf(s.idx);
      if (s.idx + 1 < n) s.idx++;
      else if (loop) s.idx = 0;
      else s.tick = 0;
    }
    if (s.idx !== shown) setShown(s.idx);
  };
  const stepBy = (d: number) => {
    setPlaying(false);
    st.current = { idx: (st.current.idx + d + n) % n, tick: 0 };
    setShown(st.current.idx);
  };

  const def = SHEETS[sheet];
  const fw = def?.frameW ?? 32, fh = def?.frameH ?? 32;
  const scale = Math.max(1, Math.min(4, Math.floor(150 / Math.max(fw, fh))));
  const draw = (ctx: CanvasRenderingContext2D) => {
    clear(ctx, '#2a2838');
    // checkerboard behind the sprite, like an art program
    const bx = 12, by = 12, bw = 156, bh = 156;
    for (let y = 0; y < bh; y += 8) for (let x = 0; x < bw; x += 8) rect(ctx, bx + x, by + y, 8, 8, ((x + y) / 8) % 2 ? '#3a3850' : '#34324a');
    const s = st.current;
    const ox = bx + bw / 2, oy = by + bh - 20; // the node's origin: the feet
    const origin = def?.origin ?? [fw / 2, fh];
    const at = (frame: number, opts: Parameters<typeof drawFrame>[5] = {}) => drawFrame(ctx, sheet, frame, ox - origin[0] * scale, oy - origin[1] * scale, { scale, ...opts });
    if (onion && n > 1) {
      at(info.frames[(s.idx - 1 + n) % n], { alpha: 0.35, flash: 1, flashColor: '#ff6b6b' });
      at(info.frames[(s.idx + 1) % n], { alpha: 0.35, flash: 1, flashColor: '#6bb6ff' });
    }
    at(info.frames[s.idx]);
    // origin marker
    line(ctx, ox - 6, oy + 0.5, ox + 6, oy + 0.5, '#ffd65a');
    line(ctx, ox + 0.5, oy - 6, ox + 0.5, oy + 6, '#ffd65a');
    text(ctx, 'origin', ox + 8, oy + 10, '#ffd65a');
    // timeline: one block per frame, width proportional to its hold in ticks
    const tx = 180, tw = 128;
    text(ctx, `${cur}`, tx, 22, '#ffffff');
    text(ctx, `${cycle.toFixed(1)} ticks = ${((cycle / 60) * 1000).toFixed(0)} ms`, tx, 34, '#c0bed4');
    let x = tx;
    const k = tw / Math.max(cycle, 1);
    for (let i = 0; i < n; i++) {
      const w = holdOf(i) * k;
      rect(ctx, x, 44, Math.max(1, w - 1), 18, i === s.idx ? '#ffd65a' : '#5a5876');
      if (w > 9) text(ctx, String(i), x + w / 2, 57, i === s.idx ? '#1a1424' : '#ffffff', 'center');
      x += w;
    }
    // playhead
    let ph = tx;
    for (let i = 0; i < s.idx; i++) ph += holdOf(i) * k;
    ph += s.tick * k;
    rect(ctx, ph, 40, 1, 26, '#ffffff');
    // the 60-tick ruler under it: one mark per tick, a long one every 10
    for (let t = 0; t <= Math.min(cycle, 120); t++) {
      const px = tx + t * k;
      if (px > tx + tw) break;
      rect(ctx, px, 68, 1, t % 10 === 0 ? 5 : 2, '#9a96b0');
    }
    text(ctx, 'ticks (1/60 s)', tx, 84, '#9a96b0');
    text(ctx, `frame ${s.idx}: hold ${holdOf(s.idx).toFixed(1)}`, tx, 104, '#ffffff');
    text(ctx, `sheet index ${info.frames[s.idx]}`, tx, 116, '#c0bed4');
    if (def) text(ctx, `col ${info.frames[s.idx] % def.cols}, row ${Math.floor(info.frames[s.idx] / def.cols)}`, tx, 128, '#c0bed4');
  };

  const frame = info.frames[shown] ?? 0;
  const code = useMemo(() => {
    const hs = Array.from({ length: n }, (_, i) => Math.round(holdOf(i) * 100) / 100);
    return `## Build "${cur}" from the ${sheet} sheet, with each frame held for its own number of ticks.
const FRAME_SIZE := Vector2i(${fw}, ${fh})
const COLUMNS := ${def?.cols ?? 8}


func build_animation(frames: SpriteFrames, sheet: Texture2D) -> void:
	var anim := &"${cur}"
	var indices: Array[int] = [${info.frames.join(', ')}]
	var holds: Array[float] = [${hs.join(', ')}]
	frames.add_animation(anim)
	frames.set_animation_speed(anim, 60.0)  # 1 duration unit = 1 tick at 60 FPS
	frames.set_animation_loop(anim, ${loop})
	for i in indices.size():
		var atlas := AtlasTexture.new()
		atlas.atlas = sheet
		var cell := Vector2i(indices[i] % COLUMNS, indices[i] / COLUMNS)
		atlas.region = Rect2(Vector2(cell * FRAME_SIZE), Vector2(FRAME_SIZE))
		frames.add_frame(anim, atlas, holds[i])`;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [n, timing, fps, holds, cur, sheet, loop, fw, fh]);

  return (
    <FigureLayout
      side={
        <>
          <label className="geom-select">
            <span className="ctl-label">sheet</span>
            <select value={sheet} onChange={(e) => setSheet(e.target.value)}>
              {ANIM_SHEETS.map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </label>
          <label className="geom-select">
            <span className="ctl-label">animation</span>
            <select value={cur} onChange={(e) => setAnim(e.target.value)}>
              {anims.map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </label>
          <SegControl value={timing} onChange={setTiming} options={[{ v: 'fps', label: 'uniform FPS' }, { v: 'holds', label: 'hold per frame' }]} />
          {timing === 'fps' ? (
            <Slider label="FPS" value={fps} min={2} max={30} step={1} onChange={setFps} fmt={(v) => `${v.toFixed(0)}`} />
          ) : (
            <div className="geom-holds">
              {holds.map((h, i) => (
                <div key={i} className={i === shown ? 'on' : ''}>
                  <span>f{i}</span>
                  <button onClick={() => setHolds(holds.map((x, k) => (k === i ? Math.max(1, x - 1) : x)))} aria-label={`frame ${i} shorter`}>
                    −
                  </button>
                  <b>{h}</b>
                  <button onClick={() => setHolds(holds.map((x, k) => (k === i ? Math.min(30, x + 1) : x)))} aria-label={`frame ${i} longer`}>
                    +
                  </button>
                </div>
              ))}
            </div>
          )}
          <div className="geom-btns">
            <button onClick={() => stepBy(-1)} aria-label="previous frame">‹ frame</button>
            <button className="primary" onClick={() => setPlaying(!playing)}>
              {playing ? 'Pause' : 'Play'}
            </button>
            <button onClick={() => stepBy(1)} aria-label="next frame">frame ›</button>
          </div>
          <Toggle label="onion skin (red: previous, blue: next)" value={onion} onChange={setOnion} />
          <Toggle label="loop" value={loop} onChange={setLoop} />
          <Readout
            rows={[
              ['\\text{frame}', `${shown + 1} of ${n} (sheet index ${frame})`],
              ['\\text{hold}', `${holdOf(shown).toFixed(1)} ticks = ${((holdOf(shown) / 60) * 1000).toFixed(0)} ms`],
              ['\\text{cycle}', `${((cycle / 60) * 1000).toFixed(0)} ms`],
              ['\\text{frame\\_coords}', def ? `(${frame % def.cols}, ${Math.floor(frame / def.cols)})` : 'art loading'],
            ]}
          />
        </>
      }
      below={
        <>
          <SheetGrid sheet={sheet} frames={info.frames} current={frame} />
          <CodeBlock code={code} file="scripts/tools/build_frames.gd" compact />
        </>
      }
    >
      <GameCanvas width={W} height={H} update={update} draw={draw} label="animation timing: the selected animation playing on a 60 tick per second clock" prompt="Click to focus" />
    </FigureLayout>
  );
}

/** The whole sheet with a grid; frames of the animation are outlined, the current one filled. */
function SheetGrid({ sheet, frames, current }: { sheet: string; frames: number[]; current: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const def = SHEETS[sheet];
  const fw = def?.frameW ?? 32, fh = def?.frameH ?? 32, cols = def?.cols ?? 8, rows = def?.rows ?? 2;
  const s = 2;
  useEffect(() => {
    const c = ref.current;
    const ctx = c?.getContext('2d');
    if (!c || !ctx) return;
    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = '#2a2838';
    ctx.fillRect(0, 0, c.width, c.height);
    ctx.drawImage(sheetCanvas(sheet), 0, 0, cols * fw * s, rows * fh * s);
    ctx.strokeStyle = 'rgba(255,255,255,0.18)';
    for (let x = 0; x <= cols; x++) ctx.strokeRect(x * fw * s + 0.5, 0, 0, rows * fh * s);
    for (let y = 0; y <= rows; y++) ctx.strokeRect(0, y * fh * s + 0.5, cols * fw * s, 0);
    for (const f of frames) {
      ctx.strokeStyle = f === current ? '#ffd65a' : 'rgba(255,214,90,0.45)';
      ctx.lineWidth = f === current ? 2 : 1;
      ctx.strokeRect((f % cols) * fw * s + 1, Math.floor(f / cols) * fh * s + 1, fw * s - 2, fh * s - 2);
    }
    ctx.lineWidth = 1;
    // keep the current frame's row in view inside the scrolling box
    const box = c.parentElement;
    if (box) {
      const y = Math.floor(current / cols) * fh * s;
      if (y < box.scrollTop || y + fh * s > box.scrollTop + box.clientHeight) box.scrollTop = Math.max(0, y - fh * s);
    }
  }, [sheet, frames, current, fw, fh, cols, rows]);
  return (
    <div className="geom-sheet">
      <div className="ctl-label">
        sheet: {cols} columns × {rows} rows of {fw}×{fh} px (Sprite2D: hframes = {cols}, vframes = {rows})
      </div>
      <div className="geom-sheet-scroll">
        <canvas ref={ref} width={cols * fw * s} height={rows * fh * s} />
      </div>
    </div>
  );
}
