// core.pixelRamp: design a colour ramp. A flat ramp changes only brightness; a hue-shifted ramp also
// turns shadows toward blue-violet and highlights toward yellow. Both shade the same test blob, and
// the hue-shifted ramp can replace one ramp of a real sprite (a palette swap, as p01's shader does).
import { useEffect, useMemo, useRef, useState } from 'react';
import type { VizSpec } from '../../content/types';
import { Slider, Readout, FigureLayout, Toggle } from '../kit';
import { CodeBlock } from '../../ui/GameCells';
import { SHEETS, sheetCanvas } from '../../art';
import { firstFrame } from './util';

type RGB = [number, number, number];
const hsv2rgb = (h: number, s: number, v: number): RGB => {
  h = ((h % 360) + 360) % 360;
  const c = v * s, x = c * (1 - Math.abs(((h / 60) % 2) - 1)), m = v - c;
  const [r, g, b] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
  return [Math.round((r + m) * 255), Math.round((g + m) * 255), Math.round((b + m) * 255)];
};
const rgb2hsv = ([r, g, b]: RGB): [number, number, number] => {
  const R = r / 255, G = g / 255, B = b / 255;
  const mx = Math.max(R, G, B), mn = Math.min(R, G, B), d = mx - mn;
  let h = 0;
  if (d) h = mx === R ? 60 * (((G - B) / d) % 6) : mx === G ? 60 * ((B - R) / d + 2) : 60 * ((R - G) / d + 4);
  return [(h + 360) % 360, mx ? d / mx : 0, mx];
};
const hex = (c: RGB) => '#' + c.map((v) => v.toString(16).padStart(2, '0')).join('');
const luma = (c: RGB) => 0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2];
/** GBA colours are 15-bit: 5 bits (32 levels) per channel. */
const to15 = (c: RGB): RGB => c.map((v) => Math.round((Math.round((v / 255) * 31) * 255) / 31)) as RGB;
/** Move hue h toward target by at most amt degrees along the shorter arc. */
const toward = (h: number, target: number, amt: number) => {
  const d = ((target - h + 540) % 360) - 180;
  return h + Math.sign(d) * Math.min(Math.abs(d), amt);
};

export function makeRamp(n: number, hue: number, sat: number, vLo: number, vHi: number, shift: number, satEnds: number, hueShifted: boolean): RGB[] {
  return Array.from({ length: n }, (_, i) => {
    const t = n === 1 ? 0.5 : i / (n - 1);
    const v = vLo + (vHi - vLo) * t;
    const far = Math.abs(2 * t - 1); // 0 in the middle of the ramp, 1 at the ends
    const h = hueShifted ? toward(hue, t > 0.5 ? 60 : 255, shift * far) : hue;
    const s = hueShifted ? Math.max(0, Math.min(1, sat + satEnds * far * (t > 0.5 ? -1 : 0.5))) : sat;
    return hsv2rgb(h, s, v);
  });
}

// a 24×20 blob (like a slime) lit from the top-left, quantised into n bands
function blobBand(x: number, y: number, n: number): number {
  const cx = 12, cy = 12, rx = 11, ry = 8.5;
  const dx = (x + 0.5 - cx) / rx, dy = (y + 0.5 - cy) / ry;
  const r2 = dx * dx + dy * dy;
  if (r2 > 1 || y > 19) return -1;
  const nz = Math.sqrt(Math.max(0, 1 - r2));
  const light = Math.max(0, -0.5 * dx - 0.6 * dy + 0.62 * nz);
  return Math.min(n - 1, Math.floor(light * n * 1.05));
}

function useCanvas(draw: (ctx: CanvasRenderingContext2D) => void, deps: unknown[]) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const ctx = ref.current?.getContext('2d');
    if (ctx) {
      ctx.imageSmoothingEnabled = false;
      draw(ctx);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return ref;
}

export function PaletteRamp({ spec }: { spec: VizSpec }) {
  const [n, setN] = useState((spec.steps as number) ?? 4);
  const [hue, setHue] = useState((spec.hue as number) ?? 140);
  const [sat, setSat] = useState(0.6);
  const [vLo, setVLo] = useState(0.22);
  const [vHi, setVHi] = useState(0.92);
  const [shift, setShift] = useState((spec.shift as number) ?? 30);
  const [satEnds, setSatEnds] = useState(0.2);
  const [gba, setGba] = useState(false);
  const [outline, setOutline] = useState(true);
  const fix = (c: RGB) => (gba ? to15(c) : c);
  const flat = useMemo(() => makeRamp(n, hue, sat, vLo, vHi, shift, satEnds, false).map(fix), [n, hue, sat, vLo, vHi, shift, satEnds, gba]); // eslint-disable-line react-hooks/exhaustive-deps
  const shifted = useMemo(() => makeRamp(n, hue, sat, vLo, vHi, shift, satEnds, true).map(fix), [n, hue, sat, vLo, vHi, shift, satEnds, gba]); // eslint-disable-line react-hooks/exhaustive-deps

  const K = 6;
  const blobRef = useCanvas(
    (ctx) => {
      ctx.clearRect(0, 0, 60 * K, 22 * K);
      [flat, shifted].forEach((ramp, j) => {
        const ox = j * 30;
        for (let y = 0; y < 22; y++)
          for (let x = 0; x < 26; x++) {
            let b = blobBand(x - 1, y - 1, ramp.length);
            if (b < 0 && outline) {
              // 1 px outline: a transparent pixel next to the blob takes the darkest colour of the ramp
              const nb = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([a, c]) => blobBand(x - 1 + a, y - 1 + c, ramp.length) >= 0);
              if (nb) b = -2;
            }
            if (b === -1) continue;
            const col = b === -2 ? ramp[0].map((v) => Math.round(v * 0.55)) as RGB : ramp[b];
            ctx.fillStyle = hex(col);
            ctx.fillRect((ox + x) * K, y * K, K, K);
          }
      });
    },
    [flat, shifted, outline],
  );

  // the sprite: find the colours of its first idle frame and group them by hue
  const def = SHEETS['hero'];
  const frame = firstFrame('hero', 'idle_down');
  const spriteColors = useMemo(() => {
    if (!def) return [] as RGB[];
    const src = sheetCanvas('hero');
    const ctx = src.getContext('2d');
    if (!ctx) return [];
    const fx = (frame % def.cols) * def.frameW, fy = Math.floor(frame / def.cols) * def.frameH;
    const data = ctx.getImageData(fx, fy, def.frameW, def.frameH).data;
    const seen = new Map<string, RGB>();
    for (let i = 0; i < data.length; i += 4) if (data[i + 3] > 0) seen.set(`${data[i]},${data[i + 1]},${data[i + 2]}`, [data[i], data[i + 1], data[i + 2]]);
    return [...seen.values()].sort((a, b) => rgb2hsv(a)[0] - rgb2hsv(b)[0]);
  }, [def, frame]);
  const [pick, setPick] = useState(-1);
  const pickIdx = pick >= 0 && pick < spriteColors.length ? pick : spriteColors.findIndex((c) => rgb2hsv(c)[1] > 0.35 && rgb2hsv(c)[2] > 0.3);
  // the source ramp: every sprite colour with a similar hue and some saturation, dark to light
  const source = useMemo(() => {
    if (pickIdx < 0) return [] as RGB[];
    const [h0] = rgb2hsv(spriteColors[pickIdx]);
    return spriteColors
      .filter((c) => {
        const [h, s] = rgb2hsv(c);
        return s > 0.2 && Math.abs(((h - h0 + 540) % 360) - 180) < 22;
      })
      .sort((a, b) => luma(a) - luma(b));
  }, [spriteColors, pickIdx]);
  const mapping = useMemo(() => {
    const m = new Map<string, RGB>();
    source.forEach((c, i) => {
      const t = source.length === 1 ? 0.5 : i / (source.length - 1);
      m.set(c.join(','), shifted[Math.round(t * (shifted.length - 1))]);
    });
    return m;
  }, [source, shifted]);

  const SK = 4;
  const spriteRef = useCanvas(
    (ctx) => {
      if (!def) return;
      const w = def.frameW, h = def.frameH;
      ctx.clearRect(0, 0, w * SK * 2 + 16, h * SK);
      const src = sheetCanvas('hero').getContext('2d');
      if (!src) return;
      const fx = (frame % def.cols) * w, fy = Math.floor(frame / def.cols) * h;
      const data = src.getImageData(fx, fy, w, h).data;
      for (let y = 0; y < h; y++)
        for (let x = 0; x < w; x++) {
          const i = (y * w + x) * 4;
          if (!data[i + 3]) continue;
          const c: RGB = [data[i], data[i + 1], data[i + 2]];
          ctx.fillStyle = hex(c);
          ctx.fillRect(x * SK, y * SK, SK, SK);
          ctx.fillStyle = hex(mapping.get(c.join(',')) ?? c);
          ctx.fillRect(w * SK + 16 + x * SK, y * SK, SK, SK);
        }
    },
    [def, frame, mapping],
  );

  const pairs = source.map((c) => [c, mapping.get(c.join(','))!] as [RGB, RGB]).slice(0, 6);
  const glsl = (c: RGB) => `vec4(${c.map((v) => (v / 255).toFixed(3)).join(', ')}, 1.0)`;
  const shader = `shader_type canvas_item;
// Palette swap: replace the ${pairs.length} colours of one ramp with a new ramp.
${pairs.map(([a], i) => `uniform vec4 from_${i} : source_color = ${glsl(a)};  // ${hex(a)}`).join('\n')}
${pairs.map(([, b], i) => `uniform vec4 to_${i} : source_color = ${glsl(b)};  // ${hex(b)}`).join('\n')}

vec3 swap(vec3 c, vec3 from_c, vec3 to_c) {
	return distance(c, from_c) < 0.01 ? to_c : c;
}

void fragment() {
	vec4 c = texture(TEXTURE, UV);
	vec3 rgb = c.rgb;
${pairs.map((_, i) => `\trgb = swap(rgb, from_${i}.rgb, to_${i}.rgb);`).join('\n')}
	COLOR = vec4(rgb, c.a);
}`;

  const contrast = shifted.slice(1).map((c, i) => (luma(c) - luma(shifted[i])).toFixed(0));
  return (
    <FigureLayout
      side={
        <>
          <Slider label="hue" value={hue} min={0} max={359} step={1} onChange={setHue} fmt={(v) => v.toFixed(0) + '°'} />
          <Slider label="saturation" value={sat} min={0} max={1} step={0.01} onChange={setSat} fmt={(v) => v.toFixed(2)} />
          <Slider label="steps" value={n} min={3} max={7} step={1} onChange={setN} fmt={(v) => v.toFixed(0)} />
          <Slider label="darkest" value={vLo} min={0.05} max={0.6} step={0.01} onChange={setVLo} fmt={(v) => v.toFixed(2)} />
          <Slider label="lightest" value={vHi} min={0.5} max={1} step={0.01} onChange={setVHi} fmt={(v) => v.toFixed(2)} />
          <Slider label="hue shift" value={shift} min={0} max={60} step={1} onChange={setShift} fmt={(v) => v.toFixed(0) + '°'} />
          <Slider label="sat. at ends" value={satEnds} min={-0.3} max={0.5} step={0.01} onChange={setSatEnds} fmt={(v) => v.toFixed(2)} />
          <Toggle label="GBA 15-bit colour" value={gba} onChange={setGba} />
          <Toggle label="1 px outline" value={outline} onChange={setOutline} />
          <Readout rows={[['\\Delta\\text{luma between steps}', contrast.join(', ')]]} />
        </>
      }
      below={<CodeBlock code={shader} file="assets/shaders/palette_swap.gdshader" lang="shader" compact />}
    >
      <div className="geom-ramp">
        {[
          ['flat ramp (brightness only)', flat],
          ['hue-shifted ramp', shifted],
        ].map(([label, ramp]) => (
          <div key={label as string} className="geom-ramp-row">
            <span className="ctl-label">{label as string}</span>
            <div className="geom-swatches">
              {(ramp as RGB[]).map((c, i) => (
                <span key={i} className="geom-swatch" style={{ background: hex(c) }} title={hex(c)}>
                  <i>{hex(c)}</i>
                </span>
              ))}
            </div>
          </div>
        ))}
        <canvas ref={blobRef} width={56 * K} height={22 * K} className="geom-pixels" aria-label="the same blob shaded with the flat ramp (left) and the hue-shifted ramp (right)" />
        {def ? (
          <>
            <div className="ctl-label">Kai's colours (click one to pick the ramp to replace):</div>
            <div className="geom-swatches small">
              {spriteColors.map((c, i) => (
                <button key={i} className={'geom-swatch' + (source.includes(c) ? ' in' : '') + (i === pickIdx ? ' on' : '')} style={{ background: hex(c) }} onClick={() => setPick(i)} title={hex(c)} aria-label={`colour ${hex(c)}`} />
              ))}
            </div>
            <canvas ref={spriteRef} width={def.frameW * SK * 2 + 16} height={def.frameH * SK} className="geom-pixels" aria-label="Kai before and after the palette swap" />
          </>
        ) : (
          <div className="geom-note">Kai's sheet is not available yet; the sprite swap appears once the art is in.</div>
        )}
      </div>
    </FigureLayout>
  );
}
