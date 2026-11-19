// core.pixelSnap: sub-pixel movement in a low-resolution viewport. An 80×45 game view scaled ×4.
// Kai walks at a fraction of a pixel per frame. Compare drawing positions rounded on screen (each
// object rounded after the camera is subtracted), rounded in the world (sprite and camera snapped to
// whole pixels first), and a high-resolution render (canvas_items stretch: sub-pixel steps become
// screen pixels). The strip at the bottom plots the drawn position minus the true position.
import { useMemo, useRef, useState } from 'react';
import type { VizSpec } from '../../content/types';
import { GameCanvas, clear, rect, text, drawFrame, animFrame, SHEETS } from '../game';
import { Slider, Readout, FigureLayout, SegControl } from '../kit';
import { CodeBlock } from '../../ui/GameCells';

const W = 320, H = 180, S = 4, VW = W / S, VH = H / S;
type Draw = 'screen' | 'world' | 'hires';
type Cam = 'fixed' | 'follow' | 'smooth';

export function SnapLab({ spec }: { spec: VizSpec }) {
  const [speed, setSpeed] = useState((spec.speed as number) ?? 0.3);
  const [drawMode, setDrawMode] = useState<Draw>((spec.draw as Draw) ?? 'screen');
  const [cam, setCam] = useState<Cam>((spec.camera as Cam) ?? 'smooth');
  const st = useRef({ x: 20, cam: 0, t: 0, frame: 0 }).current;
  const errHist = useRef<number[]>([]).current; // drawn - true, in game px
  const relHist = useRef<number[]>([]).current; // drawn position relative to the ground
  const low = useRef<HTMLCanvasElement | null>(null);
  const [ro, setRo] = useState({ back: 0, cadence: '' });

  const update = (dt: number) => {
    st.t += dt;
    st.x += speed; // px per frame, like position.x += speed in _physics_process
    if (cam === 'fixed') {
      st.cam = 0;
      if (st.x > VW + 20) st.x -= VW + 40;
    } else if (cam === 'follow') st.cam = st.x - VW / 2;
    else st.cam += (st.x - VW / 2 - st.cam) * 0.1; // position smoothing, lags behind
    // the positions the renderer would use
    let sprite: number, ground: number;
    if (drawMode === 'screen') {
      sprite = Math.round(st.x - st.cam);
      ground = Math.round(-st.cam);
    } else if (drawMode === 'world') {
      sprite = Math.round(st.x) - Math.round(st.cam);
      ground = -Math.round(st.cam);
    } else {
      sprite = Math.round((st.x - st.cam) * S) / S;
      ground = Math.round(-st.cam * S) / S;
    }
    const rel = sprite - ground;
    errHist.push(rel - st.x);
    relHist.push(rel);
    if (errHist.length > 150) {
      errHist.shift();
      relHist.shift();
    }
    if (++st.frame % 10 === 0) {
      // backward steps: the sprite moved left relative to the ground while walking right
      let back = 0;
      const steps: number[] = [];
      let lastStep = -1;
      for (let i = 1; i < relHist.length; i++) {
        const d = relHist[i] - relHist[i - 1];
        if (d < -0.01 && d > -5) back++;
        if (d > 0.01 && d < 5) {
          if (lastStep >= 0) steps.push(i - lastStep);
          lastStep = i;
        }
      }
      setRo({ back, cadence: drawMode === 'hires' ? 'every frame (1/4 px)' : steps.slice(-8).join(', ') });
    }
  };

  const drawWorld = (ctx: CanvasRenderingContext2D, k: number, groundPx: number, spritePx: number) => {
    // ground: grass tiles plus a dot every 8 px, so relative motion is easy to judge
    const tiles = SHEETS['tiles_overworld'];
    const grass = tiles?.tiles?.grass ?? 0;
    const start = Math.floor(-groundPx / 16) * 16 - 16;
    for (let x = start; x < start + VW + 48; x += 16)
      for (let y = 0; y < VH; y += 16) {
        if (tiles) drawFrame(ctx, 'tiles_overworld', grass, (x + groundPx) * k, y * k, { scale: k });
        else rect(ctx, (x + groundPx) * k, y * k, 16 * k, 16 * k, ((x / 16) & 1) ^ ((y / 16) & 1) ? '#4f9e3e' : '#57a845');
      }
    const d0 = Math.floor(-groundPx / 8) * 8 - 8;
    for (let x = d0; x < d0 + VW + 16; x += 8) rect(ctx, (x + groundPx) * k, 38 * k, k, k, '#1a1424');
    const sy = 36;
    if (SHEETS['hero']) drawFrame(ctx, 'hero', animFrame('hero', 'walk_side', st.t), spritePx * k, sy * k, { anchored: true, scale: k });
    else rect(ctx, (spritePx - 6) * k, (sy - 18) * k, 12 * k, 18 * k, '#2e4a9c');
  };

  const draw = (ctx: CanvasRenderingContext2D) => {
    const rel = relHist[relHist.length - 1] ?? st.x;
    if (drawMode === 'hires') {
      clear(ctx, '#000');
      const ground = Math.round(-st.cam * S) / S;
      drawWorld(ctx, S, ground, rel + ground);
    } else {
      if (!low.current) {
        low.current = document.createElement('canvas');
        low.current.width = VW;
        low.current.height = VH;
      }
      const lc = low.current.getContext('2d')!;
      lc.imageSmoothingEnabled = false;
      clear(lc, '#000');
      const ground = drawMode === 'screen' ? Math.round(-st.cam) : -Math.round(st.cam);
      drawWorld(lc, 1, ground, rel + ground);
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(low.current, 0, 0, W, H);
    }
    // error strip: drawn position minus true position, last 150 frames
    const y0 = H - 22;
    rect(ctx, 0, y0 - 18, W, 40, 'rgba(10,8,20,0.78)');
    rect(ctx, 0, y0, W, 1, 'rgba(255,255,255,0.25)');
    text(ctx, 'drawn - true (px): +1', 4, y0 - 10, '#c0bed4');
    text(ctx, '-1', 4, y0 + 18, '#c0bed4');
    for (let i = 0; i < errHist.length; i++) {
      const e = errHist[i];
      const back = i > 0 && relHist[i] - relHist[i - 1] < -0.01 && relHist[i] - relHist[i - 1] > -5;
      rect(ctx, 40 + i * 1.8, y0 - e * 12, 2, 2, back ? '#ff6b6b' : '#ffd65a');
    }
  };

  const code = useMemo(
    () =>
      drawMode === 'world'
        ? `extends Camera2D
## Follows a target but only ever sits on whole pixels, so the target and the
## ground are rounded the same way and the target cannot wobble against it.

@export var target: Node2D
@export var smoothing := 0.1  # fraction of the distance closed per frame

var _exact := Vector2.ZERO


func _ready() -> void:
	position_smoothing_enabled = false  # we smooth ourselves, then round
	_exact = target.global_position


func _physics_process(_delta: float) -> void:
	_exact = _exact.lerp(target.global_position, smoothing)
	global_position = _exact.round()`
        : drawMode === 'screen'
          ? `extends CharacterBody2D
## ${speed.toFixed(2)} px per physics frame = ${(speed * 60).toFixed(0)} px/s. In a 320x180 viewport the sprite can
## only be drawn at whole pixels, so it steps 1 px every ${(1 / speed).toFixed(1)} frames on average.

@export var speed := ${(speed * 60).toFixed(1)}


func _physics_process(_delta: float) -> void:
	velocity = Vector2.RIGHT * speed
	move_and_slide()`
          : `# project.godot: render at window resolution instead of 320x180
[display]
window/size/viewport_width=320
window/size/viewport_height=180
window/stretch/mode="canvas_items"
window/stretch/scale_mode="integer"`,
    [drawMode, speed],
  );

  return (
    <FigureLayout
      side={
        <>
          <Slider label="px / frame" value={speed} min={0.05} max={2} step={0.05} onChange={setSpeed} fmt={(v) => v.toFixed(2)} />
          <SegControl label="camera" value={cam} onChange={setCam} options={[{ v: 'fixed', label: 'fixed' }, { v: 'follow', label: 'follow' }, { v: 'smooth', label: 'smoothed' }]} />
          <SegControl
            label="draw"
            value={drawMode}
            onChange={setDrawMode}
            options={[
              { v: 'screen', label: 'round on screen' },
              { v: 'world', label: 'snap in world' },
              { v: 'hires', label: 'high-res' },
            ]}
          />
          <Readout
            rows={[
              ['\\text{speed}', `${(speed * 60).toFixed(0)} px/s`],
              ['\\text{frames per 1 px step}', ro.cadence || '...'],
              ['\\text{backward steps (2.5 s)}', <span key="b" className={ro.back ? 'geom-no' : 'geom-yes'}>{ro.back}</span>],
            ]}
          />
        </>
      }
      below={<CodeBlock code={code} file={drawMode === 'world' ? 'scripts/pixel_camera.gd' : drawMode === 'screen' ? 'scripts/walker.gd' : 'project.godot'} lang={drawMode === 'hires' ? 'cfg' : 'gdscript'} compact />}
    >
      <GameCanvas width={W} height={H} update={update} draw={draw} label="sub-pixel movement in an 80 by 45 pixel view scaled four times" prompt="Click to focus" />
    </FigureLayout>
  );
}
