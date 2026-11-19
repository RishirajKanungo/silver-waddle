// ship.shaders — a canvas_item shader playground. Each effect is a fragment() function written in
// TypeScript that runs once per pixel of Kai's current frame, exactly like the Godot shader shown
// below the figure (same uniform names, same order of operations). Hover a pixel to see UV, the
// TEXTURE sample and the COLOR the shader writes. Press J to animate the effect's main uniform.
import { useMemo, useRef, useState } from 'react';
import type { VizSpec } from '../../content/types';
import { GameCanvas, Keys, clear, rect, text, drawFrame, animFrame, SHEETS, type Input } from '../game';
import { Slider, SegControl, Toggle, Readout, FigureLayout } from '../kit';
import { CodeBlock } from '../../ui/GameCells';
import { frameSampler, sheetPixels, valueNoise, hexToRgb, rgbToHsl, hslToRgb, rgbToHex, vec4, clamp01, mix, type RGBA } from './common';
import './ship.css';

export type Effect = 'flash' | 'outline' | 'palette' | 'dissolve' | 'ripple';
export const EFFECTS: Effect[] = ['flash', 'outline', 'palette', 'dissolve', 'ripple'];

const W = 320, H = 180;
const M = 3; // margin around the 32×32 frame so outlines have room
const ZX = 10, ZY = 18, ZS = 4; // zoom panel position and scale

interface Params {
  flashColor: string;
  flashAmount: number;
  flashTime: number;
  outlineColor: string;
  width: number;
  diagonals: boolean;
  swaps: number[]; // indices into the palette
  hue: number; // degrees
  tolerance: number;
  progress: number;
  edgeWidth: number;
  edgeColor: string;
  noiseScale: number;
  amplitude: number;
  wavelength: number;
  speed: number;
}

/** The sprite's colours, most common first (for the palette swap). */
function spritePalette(): { rgb: [number, number, number]; count: number }[] {
  const def = SHEETS['hero'];
  if (!def) return [];
  const f = frameSampler('hero', animFrame('hero', 'idle_down', 0));
  const map = new Map<string, { rgb: [number, number, number]; count: number }>();
  for (let y = 0; y < f.fh; y++)
    for (let x = 0; x < f.fw; x++) {
      const p = f.at(x, y);
      if (p[3] < 0.5) continue;
      const key = rgbToHex(p[0], p[1], p[2]);
      const e = map.get(key);
      if (e) e.count++;
      else map.set(key, { rgb: [p[0], p[1], p[2]], count: 1 });
    }
  return [...map.values()].sort((a, b) => b.count - a.count).slice(0, 10);
}

function shiftHue(rgb: [number, number, number], deg: number): [number, number, number] {
  const [h, s, l] = rgbToHsl(...rgb);
  return hslToRgb(h + deg / 360, Math.max(s, 0.25), l);
}

/** The shader source, with the learner's current values as uniform defaults. */
export function shaderSource(effect: Effect, p: Params, palette: { rgb: [number, number, number] }[]): string {
  if (effect === 'flash') {
    const [r, g, b] = hexToRgb(p.flashColor);
    return `shader_type canvas_item;

// Hit flash. A script animates flash_amount from 1 to 0.
uniform vec4 flash_color : source_color = ${vec4(r, g, b)};
uniform float flash_amount : hint_range(0.0, 1.0) = ${p.flashAmount.toFixed(2)};

void fragment() {
	// COLOR arrives as the texture sample times the node's modulate.
	COLOR.rgb = mix(COLOR.rgb, flash_color.rgb, flash_amount);
}
`;
  }
  if (effect === 'outline') {
    const [r, g, b] = hexToRgb(p.outlineColor);
    return `shader_type canvas_item;

uniform vec4 outline_color : source_color = ${vec4(r, g, b)};
uniform int width : hint_range(0, 3) = ${p.width};
uniform bool diagonals = ${p.diagonals};

void fragment() {
	vec4 base = texture(TEXTURE, UV);
	// n = the most opaque neighbour within 'width' pixels
	float n = 0.0;
	for (int i = 1; i <= width; i++) {
		vec2 o = TEXTURE_PIXEL_SIZE * float(i);
		n = max(n, texture(TEXTURE, UV + vec2(o.x, 0.0)).a);
		n = max(n, texture(TEXTURE, UV - vec2(o.x, 0.0)).a);
		n = max(n, texture(TEXTURE, UV + vec2(0.0, o.y)).a);
		n = max(n, texture(TEXTURE, UV - vec2(0.0, o.y)).a);
		if (diagonals) {
			n = max(n, texture(TEXTURE, UV + o).a);
			n = max(n, texture(TEXTURE, UV - o).a);
			n = max(n, texture(TEXTURE, UV + vec2(o.x, -o.y)).a);
			n = max(n, texture(TEXTURE, UV + vec2(-o.x, o.y)).a);
		}
	}
	// opaque pixels keep the sprite; empty pixels next to the sprite get the outline
	vec4 outline = vec4(outline_color.rgb, n * outline_color.a);
	COLOR = mix(outline, base, base.a);
}
`;
  }
  if (effect === 'palette') {
    const pairs = [0, 1, 2].map((k) => {
      const i = p.swaps[k];
      const from = i !== undefined && palette[i] ? palette[i].rgb : ([0, 0, 0] as [number, number, number]);
      const to = i !== undefined && palette[i] ? shiftHue(palette[i].rgb, p.hue) : from;
      return { from, to, used: i !== undefined && !!palette[i] };
    });
    const decl = pairs
      .map((q, k) => `uniform vec4 from_${k + 1} : source_color = ${q.used ? vec4(...q.from) : vec4(0, 0, 0, 0)};\nuniform vec4 to_${k + 1} : source_color = ${q.used ? vec4(...q.to) : vec4(0, 0, 0, 0)};`)
      .join('\n');
    return `shader_type canvas_item;

// Swap up to three colours. Pixel art uses few exact colours, so a small tolerance is enough.
${decl}
uniform float tolerance : hint_range(0.0, 0.2) = ${p.tolerance.toFixed(3)};

void fragment() {
	vec4 c = texture(TEXTURE, UV);
	if (distance(c.rgb, from_1.rgb) < tolerance) {
		c.rgb = to_1.rgb;
	} else if (distance(c.rgb, from_2.rgb) < tolerance) {
		c.rgb = to_2.rgb;
	} else if (distance(c.rgb, from_3.rgb) < tolerance) {
		c.rgb = to_3.rgb;
	}
	COLOR = c;
}
`;
  }
  if (effect === 'dissolve') {
    const [r, g, b] = hexToRgb(p.edgeColor);
    return `shader_type canvas_item;

// noise_texture: a NoiseTexture2D (FastNoiseLite) in the Inspector.
uniform sampler2D noise_texture : filter_nearest, repeat_enable;
uniform float progress : hint_range(0.0, 1.0) = ${p.progress.toFixed(2)};
uniform float edge_width : hint_range(0.0, 0.3) = ${p.edgeWidth.toFixed(2)};
uniform vec4 edge_color : source_color = ${vec4(r, g, b)};

void fragment() {
	vec4 c = texture(TEXTURE, UV);
	float n = texture(noise_texture, UV).r;
	// a pixel survives while its noise value is at least progress
	float alive = step(progress, n);
	// survivors just above the threshold glow; sign() turns the edge off at progress 0
	float edge = alive * (1.0 - step(progress + edge_width, n)) * sign(progress);
	c.rgb = mix(c.rgb, edge_color.rgb, edge);
	c.a *= alive;
	COLOR = c;
}
`;
  }
  return `shader_type canvas_item;

uniform float amplitude_px : hint_range(0.0, 4.0) = ${p.amplitude.toFixed(1)};
uniform float wavelength_px : hint_range(2.0, 32.0) = ${p.wavelength.toFixed(1)};
uniform float speed : hint_range(0.0, 10.0) = ${p.speed.toFixed(1)};

void fragment() {
	// work in texture pixels so the wave is measured in pixels, not UV
	float row = UV.y / TEXTURE_PIXEL_SIZE.y;
	float shift_px = amplitude_px * sin(TAU * row / wavelength_px + TIME * speed);
	// whole pixels only, so the art stays crisp
	shift_px = round(shift_px);
	COLOR = texture(TEXTURE, UV + vec2(shift_px * TEXTURE_PIXEL_SIZE.x, 0.0));
}
`;
}

export function ShaderLab({ spec }: { spec: VizSpec }) {
  const only = spec.effect as Effect | undefined;
  const [effect, setEffect] = useState<Effect>(only ?? (spec.start as Effect | undefined) ?? 'flash');
  const [p, setP] = useState<Params>({
    flashColor: '#ffffff',
    flashAmount: 0,
    flashTime: 0.1,
    outlineColor: '#1a0f29',
    width: 1,
    diagonals: false,
    swaps: [],
    hue: 150,
    tolerance: 0.02,
    progress: 0.35,
    edgeWidth: 0.08,
    edgeColor: '#ff8c26',
    noiseScale: 6,
    amplitude: 1,
    wavelength: 8,
    speed: 3,
  });
  const set = <K extends keyof Params>(k: K) => (v: Params[K]) => setP((o) => ({ ...o, [k]: v }));
  const [anim, setAnim] = useState<'idle_down' | 'walk_side' | 'attack_side'>('idle_down');
  const palette = useMemo(spritePalette, [SHEETS['hero']]); // eslint-disable-line react-hooks/exhaustive-deps

  // animated uniform (J): flash_amount pulse or dissolve play, -1 when not playing
  const pulse = useRef({ t: -1 });
  const clock = useRef(0);
  const off = useRef<HTMLCanvasElement | null>(null);
  const img = useRef<ImageData | null>(null);
  const hover = useRef<{ x: number; y: number } | null>(null);
  const [probe, setProbe] = useState<{ x: number; y: number; tex: RGBA; out: RGBA; extra?: string } | null>(null);
  const frameN = useRef(0);
  const pRef = useRef(p);
  pRef.current = p;

  const fragment = useMemo(() => {
    // returns a function computing COLOR for frame pixel (x, y) given the sampler and live uniforms
    return (f: ReturnType<typeof frameSampler>, x: number, y: number, live: { flash: number; progress: number; time: number }, out: RGBA) => {
      const q = pRef.current;
      const base = f.at(x, y);
      let r = base[0], g = base[1], b = base[2], a = base[3];
      if (effect === 'flash') {
        const [fr, fg, fb] = hexToRgb(q.flashColor);
        r = mix(r, fr, live.flash);
        g = mix(g, fg, live.flash);
        b = mix(b, fb, live.flash);
      } else if (effect === 'outline') {
        let n = 0;
        for (let i = 1; i <= q.width; i++) {
          n = Math.max(n, f.at(x + i, y)[3], f.at(x - i, y)[3], f.at(x, y + i)[3], f.at(x, y - i)[3]);
          if (q.diagonals) n = Math.max(n, f.at(x + i, y + i)[3], f.at(x - i, y - i)[3], f.at(x + i, y - i)[3], f.at(x - i, y + i)[3]);
        }
        const bb = f.at(x, y);
        const [orr, og, ob] = hexToRgb(q.outlineColor);
        // COLOR = mix(outline, base, base.a)
        r = mix(orr, bb[0], bb[3]);
        g = mix(og, bb[1], bb[3]);
        b = mix(ob, bb[2], bb[3]);
        a = mix(n, bb[3], bb[3]);
      } else if (effect === 'palette') {
        for (let k = 0; k < 3; k++) {
          const i = q.swaps[k];
          if (i === undefined || !palette[i]) continue;
          const from = palette[i].rgb;
          if (Math.hypot(r - from[0], g - from[1], b - from[2]) < q.tolerance) {
            [r, g, b] = shiftHue(from, q.hue);
            break;
          }
        }
      } else if (effect === 'dissolve') {
        const u = (x + 0.5) / f.fw, v = (y + 0.5) / f.fh;
        const n = valueNoise(u * q.noiseScale, v * q.noiseScale);
        const alive = n >= live.progress ? 1 : 0;
        const edge = alive * (n >= live.progress + q.edgeWidth ? 0 : 1) * Math.sign(live.progress);
        const [er, eg, eb] = hexToRgb(q.edgeColor);
        r = mix(r, er, edge);
        g = mix(g, eg, edge);
        b = mix(b, eb, edge);
        a *= alive;
      } else {
        const row = y + 0.5;
        const shift = Math.round(q.amplitude * Math.sin((2 * Math.PI * row) / q.wavelength + live.time * q.speed));
        const s = f.at(x + shift, y);
        r = s[0];
        g = s[1];
        b = s[2];
        a = s[3];
      }
      out[0] = clamp01(r);
      out[1] = clamp01(g);
      out[2] = clamp01(b);
      out[3] = clamp01(a);
      return out;
    };
  }, [effect, palette]);

  const live = { flash: 0, progress: 0, time: 0 };
  const computeLive = () => {
    const q = pRef.current;
    live.time = clock.current;
    live.flash = q.flashAmount;
    live.progress = q.progress;
    const t = pulse.current.t;
    if (t >= 0) {
      if (effect === 'flash') live.flash = Math.max(0, 1 - t / q.flashTime); // tween_property(..., 0.0, flash_time)
      if (effect === 'dissolve') live.progress = Math.min(1, t / 1.0);
    }
    return live;
  };

  const update = (dt: number, input: Input) => {
    clock.current += dt;
    if (input.justPressed('attack')) pulse.current.t = 0;
    if (pulse.current.t >= 0) {
      pulse.current.t += dt;
      const end = effect === 'flash' ? pRef.current.flashTime + 0.25 : effect === 'dissolve' ? 1.6 : 0;
      if (pulse.current.t > end) pulse.current.t = -1;
    }
  };

  const draw = (ctx: CanvasRenderingContext2D) => {
    clear(ctx, '#1b1d29');
    const frame = animFrame('hero', anim, clock.current);
    const f = frameSampler('hero', frame);
    const R = f.fw + 2 * M, RH = f.fh + 2 * M;
    if (!off.current) off.current = document.createElement('canvas');
    const oc = off.current;
    if (oc.width !== R || oc.height !== RH) {
      oc.width = R;
      oc.height = RH;
      img.current = null;
    }
    const octx = oc.getContext('2d')!;
    img.current ??= octx.createImageData(R, RH);
    const data = img.current.data;
    const lv = computeLive();
    const out: RGBA = [0, 0, 0, 0];
    sheetPixels('hero');
    for (let y = 0; y < RH; y++)
      for (let x = 0; x < R; x++) {
        fragment(f, x - M, y - M, lv, out);
        const i = (y * R + x) * 4;
        data[i] = out[0] * 255;
        data[i + 1] = out[1] * 255;
        data[i + 2] = out[2] * 255;
        data[i + 3] = out[3] * 255;
      }
    octx.putImageData(img.current, 0, 0);

    // zoom panel: checkerboard shows transparency, the frame border shows the quad Godot draws
    for (let y = 0; y < RH; y++)
      for (let x = 0; x < R; x++) rect(ctx, ZX + x * ZS, ZY + y * ZS, ZS, ZS, (x + y) % 2 ? '#2b2e3d' : '#323648');
    ctx.drawImage(oc, 0, 0, R, RH, ZX, ZY, R * ZS, RH * ZS);
    ctx.strokeStyle = 'rgba(255,255,255,0.35)';
    ctx.setLineDash([2, 2]);
    ctx.strokeRect(ZX + M * ZS + 0.5, ZY + M * ZS + 0.5, f.fw * ZS - 1, f.fh * ZS - 1);
    ctx.setLineDash([]);
    const hv = hover.current;
    if (hv) rect(ctx, ZX + (hv.x + M) * ZS, ZY + (hv.y + M) * ZS, ZS, ZS, '#ffd65a', true);
    text(ctx, 'x4, dashed = frame', ZX, ZY - 6, '#c9cbe0');

    // in-game view on grass, at 2x and 1x
    const gx = 184, gy = 18, gw = 128, gh = 150;
    rect(ctx, gx, gy, gw, gh, '#5a8f4e');
    if (SHEETS['tiles_overworld']) {
      const g = SHEETS['tiles_overworld'].tiles?.grass ?? 0;
      ctx.save();
      ctx.beginPath();
      ctx.rect(gx, gy, gw, gh);
      ctx.clip();
      for (let y = gy; y < gy + gh; y += 16) for (let x = gx; x < gx + gw; x += 16) drawFrame(ctx, 'tiles_overworld', g, x, y);
      ctx.restore();
    }
    ctx.drawImage(oc, 0, 0, R, RH, gx + 14, gy + 30, R * 2, RH * 2);
    ctx.drawImage(oc, 0, 0, R, RH, gx + 92, gy + 62, R, RH);
    if (SHEETS['slime']) drawFrame(ctx, 'slime', animFrame('slime', 'idle', clock.current), gx + 92, gy + 118);
    text(ctx, 'in game x2, x1', gx, gy - 6, '#c9cbe0');
    if (effect === 'flash' || effect === 'dissolve') text(ctx, 'J: play', ZX, H - 6, '#8f93b0');

    // probe readout ~10 times a second
    if (++frameN.current % 6 === 0) {
      if (hv) {
        const tex = [...f.at(hv.x, hv.y)] as RGBA;
        const o2 = [...fragment(f, hv.x, hv.y, lv, [0, 0, 0, 0])] as RGBA;
        const u = (hv.x + 0.5) / f.fw, v = (hv.y + 0.5) / f.fh;
        const extra = effect === 'dissolve' ? `noise ${valueNoise(u * pRef.current.noiseScale, v * pRef.current.noiseScale).toFixed(2)} vs progress ${lv.progress.toFixed(2)}` : effect === 'flash' ? `flash_amount ${lv.flash.toFixed(2)}` : undefined;
        setProbe({ x: hv.x, y: hv.y, tex, out: o2, extra });
      } else if (probe) setProbe(null);
    }
  };

  const onMove = (e: React.MouseEvent) => {
    const c = (e.currentTarget as HTMLElement).querySelector('canvas');
    if (!c) return;
    const r = c.getBoundingClientRect();
    const gx = ((e.clientX - r.left) / r.width) * W, gy = ((e.clientY - r.top) / r.height) * H;
    const x = Math.floor((gx - ZX) / ZS) - M, y = Math.floor((gy - ZY) / ZS) - M;
    const fw = SHEETS['hero']?.frameW ?? 16;
    hover.current = x >= -M && y >= -M && x < fw + M && y < fw + M ? { x, y } : null;
  };

  const code = shaderSource(effect, p, palette);
  const fmtC = (c: RGBA) => `(${c.map((v) => v.toFixed(2)).join(', ')})`;
  const frames60 = Math.round(p.flashTime * 60);

  return (
    <FigureLayout
      side={
        <>
          {!only && <SegControl value={effect} options={EFFECTS.map((e) => ({ v: e, label: e }))} onChange={(v) => { setEffect(v); pulse.current.t = -1; }} />}
          <SegControl label="anim" value={anim} options={[{ v: 'idle_down', label: 'idle' }, { v: 'walk_side', label: 'walk' }, { v: 'attack_side', label: 'attack' }]} onChange={setAnim} />
          {effect === 'flash' && (
            <>
              <SegControl label="flash_color" value={p.flashColor} options={[{ v: '#ffffff', label: 'white' }, { v: '#ff3b3b', label: 'red' }, { v: '#ffe066', label: 'gold' }]} onChange={set('flashColor')} />
              <Slider label="flash_amount" value={p.flashAmount} min={0} max={1} step={0.01} onChange={set('flashAmount')} />
              <Slider label="flash_time" value={p.flashTime} min={0.03} max={0.4} step={0.01} onChange={set('flashTime')} fmt={(v) => v.toFixed(2) + ' s'} />
            </>
          )}
          {effect === 'outline' && (
            <>
              <SegControl label="outline_color" value={p.outlineColor} options={[{ v: '#1a0f29', label: 'ink' }, { v: '#ffffff', label: 'white' }, { v: '#ffcc33', label: 'gold' }]} onChange={set('outlineColor')} />
              <Slider label="width" value={p.width} min={0} max={3} step={1} onChange={set('width')} fmt={(v) => v + ' px'} />
              <Toggle label="diagonals (8 neighbours)" value={p.diagonals} onChange={set('diagonals')} />
            </>
          )}
          {effect === 'palette' && (
            <>
              <div className="ship-swatches" role="group" aria-label="sprite palette: pick up to three colours to swap">
                {palette.length === 0 && <span className="ship-muted">the sprite has not loaded yet</span>}
                {palette.map((c, i) => {
                  const k = p.swaps.indexOf(i);
                  return (
                    <button
                      key={i}
                      className={'ship-swatch' + (k >= 0 ? ' on' : '')}
                      style={{ background: rgbToHex(...c.rgb) }}
                      title={`${rgbToHex(...c.rgb)} (${c.count} px)`}
                      aria-pressed={k >= 0}
                      onClick={() => set('swaps')(k >= 0 ? p.swaps.filter((s) => s !== i) : [...p.swaps, i].slice(-3))}
                    >
                      {k >= 0 ? k + 1 : ''}
                    </button>
                  );
                })}
              </div>
              <Slider label="hue shift" value={p.hue} min={0} max={359} step={1} onChange={set('hue')} fmt={(v) => v + '°'} />
              <Slider label="tolerance" value={p.tolerance} min={0} max={0.2} step={0.005} onChange={set('tolerance')} />
            </>
          )}
          {effect === 'dissolve' && (
            <>
              <Slider label="progress" value={p.progress} min={0} max={1} step={0.01} onChange={set('progress')} />
              <Slider label="edge_width" value={p.edgeWidth} min={0} max={0.3} step={0.01} onChange={set('edgeWidth')} />
              <Slider label="noise scale" value={p.noiseScale} min={2} max={16} step={1} onChange={set('noiseScale')} />
              <SegControl label="edge" value={p.edgeColor} options={[{ v: '#ff8c26', label: 'ember' }, { v: '#7fe7ff', label: 'ice' }, { v: '#b46bff', label: 'void' }]} onChange={set('edgeColor')} />
            </>
          )}
          {effect === 'ripple' && (
            <>
              <Slider label="amplitude_px" value={p.amplitude} min={0} max={4} step={0.5} onChange={set('amplitude')} />
              <Slider label="wavelength_px" value={p.wavelength} min={2} max={32} step={1} onChange={set('wavelength')} />
              <Slider label="speed" value={p.speed} min={0} max={10} step={0.5} onChange={set('speed')} />
            </>
          )}
          <Readout
            title={probe ? `pixel (${probe.x}, ${probe.y})` : 'hover the zoomed sprite'}
            rows={
              probe
                ? ([
                    ['\\text{UV}', `(${((probe.x + 0.5) / 32).toFixed(3)}, ${((probe.y + 0.5) / 32).toFixed(3)})`],
                    ['\\text{TEXTURE}', fmtC(probe.tex)],
                    ['\\text{COLOR}', fmtC(probe.out)],
                    ...(probe.extra ? ([['', probe.extra]] as [string, string][]) : []),
                  ] as [string, string][])
                : effect === 'flash'
                  ? [['\\text{flash\\_time}', `${p.flashTime.toFixed(2)} s = ${frames60} frames`]]
                  : effect === 'ripple'
                    ? [['\\text{period}', `${(p.speed > 0 ? (2 * Math.PI) / p.speed : 0).toFixed(2)} s`]]
                    : [['\\text{pixels}', `${(32 + 2 * M) ** 2} per frame`]]
            }
          />
        </>
      }
      below={<CodeBlock code={code} file={`assets/shaders/${effect === 'flash' ? 'hit_flash' : effect === 'palette' ? 'palette_swap' : effect}.gdshader`} lang="shader" compact />}
    >
      <div className="ship-hover" onMouseMove={onMove} onMouseLeave={() => (hover.current = null)}>
        <GameCanvas
          width={W}
          height={H}
          update={update}
          draw={draw}
          prompt="Click, then J to play"
          keysHint={<Keys items={[['J', effect === 'flash' ? 'hit (flash)' : effect === 'dissolve' ? 'play dissolve' : 'nothing for this effect'], ['mouse', 'probe a pixel']]} />}
          label="shader playground: Kai's sprite with a canvas_item shader applied"
        />
      </div>
    </FigureLayout>
  );
}
