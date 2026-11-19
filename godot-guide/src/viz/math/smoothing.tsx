// math.smoothing: three follow cameras running at 30, 60 and 144 frames per second.
//   naive:     position = position.lerp(target, weight)                      (once per frame)
//   exp-decay: position = position.lerp(target, 1.0 - exp(-sharpness * delta))
// With the naive version the 144 fps camera hugs Kai and the 30 fps one lags; with exp-decay all three agree.
import { useMemo, useRef, useState } from 'react';
import type { VizSpec } from '../../content/types';
import { GameCanvas, Keys, text, drawFrame, animFrame, type Input } from '../game';
import { Slider, SegControl, Readout, FigureLayout, LinePlot, type Series } from '../kit';
import { CodeBlock } from '../../ui/GameCells';
import { grass, hud, f, gf, clamp, type V } from './common';

const W = 320, H = 180;
const RATES = [30, 60, 144] as const;
const COLORS = ['#ff6b5a', '#ffd65a', '#6fb8ff'];
const PLOT_COLORS = ['var(--c-err)', 'var(--warn)', 'var(--c-u)'];
type Method = 'naive' | 'exp';

export function SmoothingLab({ spec }: { spec: VizSpec }) {
  const [method, setMethod] = useState<Method>((spec.method as Method) ?? 'naive');
  const [w, setW] = useState(0.1);
  const [k, setK] = useState(-60 * Math.log(1 - 0.1));
  const p = useRef({ method, w, k });
  p.current = { method, w, k };
  const s = useRef({ kai: [160, 100] as V, face: 'down', flip: false, moving: false, t: 0, cams: RATES.map(() => [160, 90] as V), acc: RATES.map(() => 0), n: 0 }).current;
  const [lag, setLag] = useState([0, 0, 0]);

  const update = (dt: number, input: Input) => {
    const [ix, iy] = input.vector();
    s.moving = ix !== 0 || iy !== 0;
    s.kai = [clamp(s.kai[0] + ix * 110 * dt, 12, W - 12), clamp(s.kai[1] + iy * 110 * dt, 28, H - 6)];
    if (s.moving) {
      if (Math.abs(ix) > Math.abs(iy)) {
        s.face = 'side';
        s.flip = ix < 0;
      } else s.face = iy < 0 ? 'up' : 'down';
    }
    const target: V = [s.kai[0], s.kai[1] - 12];
    const { method, w, k } = p.current;
    RATES.forEach((F, i) => {
      s.acc[i] += dt;
      const step = 1 / F;
      while (s.acc[i] >= step - 1e-9) {
        const weight = method === 'naive' ? w : 1 - Math.exp(-k * step);
        const c = s.cams[i];
        s.cams[i] = [c[0] + (target[0] - c[0]) * weight, c[1] + (target[1] - c[1]) * weight];
        s.acc[i] -= step;
      }
    });
    s.t += dt;
    if (++s.n % 6 === 0) setLag(s.cams.map((c) => Math.hypot(target[0] - c[0], target[1] - c[1])));
  };

  const draw = (ctx: CanvasRenderingContext2D) => {
    grass(ctx, drawFrame);
    drawFrame(ctx, 'hero', animFrame('hero', (s.moving ? 'walk_' : 'idle_') + s.face, s.t), s.kai[0], s.kai[1], { anchored: true, flipH: s.flip });
    // each camera's view, drawn as a 96×54 frame (the 320×180 screen at 30% size) centred on the camera
    s.cams.forEach((c, i) => {
      ctx.strokeStyle = COLORS[i];
      ctx.lineWidth = 1;
      ctx.strokeRect(Math.round(c[0] - 48) + 0.5, Math.round(c[1] - 27) + 0.5, 96, 54);
      ctx.fillStyle = COLORS[i];
      ctx.fillRect(Math.round(c[0]) - 1, Math.round(c[1]) - 1, 3, 3);
    });
    const target: V = [s.kai[0], s.kai[1] - 12];
    hud(
      ctx,
      RATES.map((F, i) => [`${F} fps lag ${Math.hypot(target[0] - s.cams[i][0], target[1] - s.cams[i][1]).toFixed(1)} px`, COLORS[i]] as [string, string]),
      2,
      2,
      'left',
      text,
    );
  };

  // step response: the target jumps by 100 px at t = 0
  const plot = useMemo<Series[]>(() => {
    const out: Series[] = [];
    if (method === 'exp')
      out.push({
        pts: Array.from({ length: 101 }, (_, i) => [i / 100, 100 * (1 - Math.exp((-k * i) / 100))] as [number, number]),
        color: 'var(--muted)',
        dashed: true,
        label: '100(1 − e^(−kt))',
        width: 1.5,
      });
    RATES.forEach((F, i) => {
      const pts: [number, number][] = [];
      let c = 0;
      for (let n = 0; n <= F; n++) {
        pts.push([n / F, c]);
        const weight = method === 'naive' ? w : 1 - Math.exp(-k / F);
        c += (100 - c) * weight;
      }
      out.push({ pts, color: PLOT_COLORS[i], label: `${F} fps`, width: 1.8 });
    });
    return out;
  }, [method, w, k]);

  const remain = (F: number, t: number) => (method === 'naive' ? Math.pow(1 - w, F * t) : Math.exp(-k * t));
  const code =
    method === 'naive'
      ? `extends Camera2D

@export var target: Node2D
@export var weight := ${gf(w, 2)}  # per frame: the result depends on the frame rate


func _process(_delta: float) -> void:
	global_position = global_position.lerp(target.global_position, weight)
`
      : `extends Camera2D

@export var target: Node2D
@export var sharpness := ${gf(k, 2)}  ## 1/s. Half the gap closes every ln(2)/sharpness = ${f(Math.LN2 / k, 3)} s


func _process(delta: float) -> void:
	var weight := 1.0 - exp(-sharpness * delta)
	global_position = global_position.lerp(target.global_position, weight)
`;
  return (
    <FigureLayout
      side={
        <>
          <SegControl
            label="method"
            value={method}
            onChange={setMethod}
            options={[
              { v: 'naive', label: 'lerp(weight)' },
              { v: 'exp', label: '1 − exp(−k·delta)' },
            ]}
          />
          {method === 'naive' ? <Slider label="weight" value={w} min={0.02} max={0.5} step={0.01} onChange={setW} fmt={(v) => v.toFixed(2)} /> : <Slider label="sharpness k" value={k} min={1} max={30} step={0.25} onChange={setK} fmt={(v) => v.toFixed(2)} />}
          <Readout
            rows={[
              ...RATES.map((F, i) => [`\\text{${F} fps lag (px)}`, f(lag[i], 1)] as [string, string]),
              ...RATES.map((F) => [`\\text{gap left after 0.25 s, ${F} fps}`, `${f(remain(F, 0.25) * 100, 1)}%`] as [string, string]),
              method === 'naive' ? ['k \\text{ matching at 60 fps}', f(-60 * Math.log(1 - w), 2)] : ['t_{1/2} = \\ln 2 / k', `${f(Math.LN2 / k, 3)} s`],
            ]}
          />
        </>
      }
      below={
        <div className="math-stack">
          <LinePlot series={plot} x={[0, 1]} y={[0, 105]} xlabel="time after the target jumps 100 px (s)" ylabel="camera (px)" legend="br" height={220} />
          <CodeBlock code={code} file="scripts/math/follow_camera.gd" compact />
        </div>
      }
    >
      <GameCanvas width={W} height={H} update={update} draw={draw} touchButtons={['up', 'down', 'left', 'right']} keysHint={<Keys items={[['WASD / arrows', 'move Kai']]} />} label="three follow cameras at 30, 60 and 144 fps; move Kai with WASD or arrow keys" />
    </FigureLayout>
  );
}
