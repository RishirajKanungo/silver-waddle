// combat.hit_curves: the two curves behind k01-2's feel.
//   mode 'shake'    : trauma added by hits, linear decay, offset = max_offset * trauma^p * noise
//   mode 'knockback': slide distance under linear friction (v²/2f) against exponential decay (v0/k)
import { useEffect, useMemo, useRef, useState } from 'react';
import type { VizSpec } from '../../content/types';
import { FigureLayout, Slider, SegControl, Readout, Toggle, LinePlot, Btn } from '../kit';
import { rect } from '../game';
import { drawChar, drawFloor, drawShadow, noise1, sfx } from './common';

const PW = 160, PH = 72;

function ShakeCurves() {
  const [decay, setDecay] = useState(1.5);
  const [maxOff, setMaxOff] = useState(6);
  const [power, setPower] = useState<number>(2);
  const sim = useRef({ trauma: 0, t: 0, hist: [] as [number, number][], ox: 0, oy: 0, peak: 0 }).current;
  const [, force] = useState(0);
  const cv = useRef<HTMLCanvasElement>(null);
  const P = useRef({ decay, maxOff, power });
  P.current = { decay, maxOff, power };

  useEffect(() => {
    let raf = 0, last = performance.now(), acc = 0, n = 0;
    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      acc += Math.min(0.1, (now - last) / 1000);
      last = now;
      while (acc >= 1 / 60) {
        acc -= 1 / 60;
        const p = P.current;
        sim.t += 1 / 60;
        sim.trauma = Math.max(0, sim.trauma - p.decay / 60);
        const s = Math.pow(sim.trauma, p.power);
        sim.ox = Math.round(p.maxOff * s * noise1(sim.t * 30));
        sim.oy = Math.round(p.maxOff * (4 / 6) * s * noise1(sim.t * 30 + 100));
        sim.peak = Math.max(sim.peak * 0.995, Math.abs(sim.ox), Math.abs(sim.oy));
        sim.hist.push([sim.t, sim.trauma]);
        if (sim.hist.length > 180) sim.hist.shift();
        if (++n % 3 === 0) force((v) => v + 1);
      }
      const c = cv.current;
      if (!c) return;
      const ctx = c.getContext('2d')!;
      ctx.imageSmoothingEnabled = false;
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, PW, PH);
      ctx.save();
      ctx.translate(sim.ox, sim.oy);
      drawFloor(ctx, PW, PH, 'dungeon');
      drawShadow(ctx, 60, 58);
      drawChar(ctx, 'hero', 'attack_side', 0, 60, 58, { frame: undefined });
      drawShadow(ctx, 96, 58);
      drawChar(ctx, 'skeleton', sim.trauma > 0.05 ? 'hurt' : 'idle', sim.t, 96, 58, { flip: true });
      ctx.restore();
      // a fixed frame so the camera motion is visible against something
      rect(ctx, 0, 0, PW, PH, 'rgba(255,255,255,0.5)', true);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [sim]);

  const add = (a: number) => {
    sim.trauma = Math.min(1, sim.trauma + a);
    sfx(true, a > 0.3 ? 'sfx_crit' : 'sfx_hit', 0.35);
  };
  const t0 = sim.hist.length ? sim.hist[0][0] : 0;
  const tr = sim.hist.map(([t, v]) => [t - t0, v] as [number, number]);
  const sh = sim.hist.map(([t, v]) => [t - t0, Math.pow(v, power)] as [number, number]);
  return (
    <FigureLayout
      side={
        <>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <Btn onClick={() => add(0.2)}>light hit +0.2</Btn>
            <Btn primary onClick={() => add(0.45)}>heavy hit +0.45</Btn>
          </div>
          <Slider label="decay (per s)" value={decay} min={0.5} max={4} step={0.1} onChange={setDecay} />
          <Slider label="max_offset.x (px)" value={maxOff} min={1} max={12} step={1} onChange={setMaxOff} />
          <SegControl label="exponent p" value={power} options={[1, 2, 3].map((v) => ({ v, label: String(v) }))} onChange={setPower} />
          <Readout
            rows={[
              ['\\text{trauma}', sim.trauma.toFixed(2)],
              ['\\text{trauma}^p', Math.pow(sim.trauma, power).toFixed(3)],
              ['\\text{offset}', `(${sim.ox}, ${sim.oy}) px`],
              ['\\text{lasts}', `${(sim.trauma / decay).toFixed(2)} s more`],
            ]}
          />
        </>
      }
    >
      <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'center' }}>
        <canvas ref={cv} width={PW} height={PH} style={{ width: '100%', maxWidth: 400, imageRendering: 'pixelated', borderRadius: 4 }} aria-label="camera preview" />
        <LinePlot
          width={520}
          height={210}
          x={[0, 3]}
          y={[0, 1]}
          xlabel="seconds (last 3 s)"
          ylabel="amount"
          legend="tr"
          series={[
            { pts: tr.length > 1 ? tr : [[0, 0], [3, 0]], color: 'var(--c-v)', label: 'trauma' },
            { pts: sh.length > 1 ? sh : [[0, 0], [3, 0]], color: 'var(--c-u)', label: `trauma^${power}` },
          ]}
        />
      </div>
    </FigureLayout>
  );
}

function KnockbackCurves() {
  const [v0, setV0] = useState(180);
  const [f, setF] = useState(900);
  const [exp, setExp] = useState(false);
  const [t, setT] = useState(-1);
  const cv = useRef<HTMLCanvasElement>(null);
  const dLin = (v0 * v0) / (2 * f), tLin = v0 / f;
  // exponential decay with the same initial deceleration: k = f / v0, so distance v0/k = v0²/f
  const k = f / v0, dExp = v0 / k;
  const xLin = (tt: number) => (tt >= tLin ? dLin : v0 * tt - 0.5 * f * tt * tt);
  const xExp = (tt: number) => (v0 / k) * (1 - Math.exp(-k * tt));
  const T = Math.max(0.6, exp ? Math.log(v0 / 2) / k : tLin * 1.4);

  const series = useMemo(() => {
    const n = 120;
    const lin: [number, number][] = [], ex: [number, number][] = [];
    for (let i = 0; i <= n; i++) {
      const tt = (i / n) * T;
      lin.push([tt, xLin(tt)]);
      ex.push([tt, xExp(tt)]);
    }
    return { lin, ex };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [v0, f, T]);

  useEffect(() => {
    if (t < 0) return;
    if (t > T) return;
    const id = requestAnimationFrame(() => setT((v) => v + 1 / 60));
    return () => cancelAnimationFrame(id);
  }, [t, T]);

  useEffect(() => {
    const c = cv.current;
    if (!c) return;
    const ctx = c.getContext('2d')!;
    ctx.imageSmoothingEnabled = false;
    drawFloor(ctx, PW, PH, 'dungeon');
    const tt = Math.max(0, t);
    const scale = Math.min(1, 90 / Math.max(dLin, exp ? dExp : 0, 1));
    drawShadow(ctx, 30, exp ? 34 : 52);
    drawChar(ctx, 'hero', 'attack_side', 0, 30, exp ? 34 : 52, {});
    const x1 = 50 + xLin(tt) * scale;
    drawShadow(ctx, x1, exp ? 34 : 52);
    drawChar(ctx, 'skeleton', t >= 0 && t < tLin ? 'hurt' : 'idle', 0, x1, exp ? 34 : 52, { flip: true });
    if (exp) {
      const x2 = 50 + xExp(tt) * scale;
      drawShadow(ctx, x2, 66);
      drawChar(ctx, 'skeleton', 'idle', 0, x2, 66, { flip: true, alpha: 0.75 });
    }
    rect(ctx, 50 + dLin * scale, exp ? 36 : 54, 1, 3, '#f8925e');
  }, [t, dLin, dExp, exp, xLin, xExp, tLin]);

  return (
    <FigureLayout
      side={
        <>
          <Slider label="knockback speed v (px/s)" value={v0} min={40} max={300} step={5} onChange={setV0} />
          <Slider label="knockback_friction f (px/s²)" value={f} min={200} max={3000} step={50} onChange={setF} />
          <Toggle label="compare exponential decay" value={exp} onChange={setExp} />
          <Btn primary onClick={() => setT(0)}>
            Play the hit
          </Btn>
          <Readout
            rows={[
              ['d = v^2/2f', `${dLin.toFixed(1)} px`],
              ['t = v/f', `${tLin.toFixed(3)} s`],
              ...(exp ? ([['d_{\\exp} = v/k', `${dExp.toFixed(1)} px (k = ${k.toFixed(2)})`]] as [string, string][]) : []),
            ]}
          />
        </>
      }
    >
      <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'center' }}>
        <canvas ref={cv} width={PW} height={PH} style={{ width: '100%', maxWidth: 400, imageRendering: 'pixelated', borderRadius: 4 }} aria-label="knockback preview" />
        <LinePlot
          width={520}
          height={220}
          x={[0, T]}
          xlabel="seconds after the hit"
          ylabel="pixels pushed"
          legend="br"
          vlines={[{ x: tLin, color: 'var(--c-v)', label: 'stops' }, ...(t >= 0 && t <= T ? [{ x: t, color: 'var(--muted)' }] : [])]}
          series={[{ pts: series.lin, color: 'var(--c-v)', label: 'linear friction' }, ...(exp ? [{ pts: series.ex, color: 'var(--c-u)', label: 'exponential, same start', dashed: true }] : [])]}
        />
      </div>
    </FigureLayout>
  );
}

export function HitCurves({ spec }: { spec: VizSpec }) {
  return spec.mode === 'knockback' ? <KnockbackCurves /> : <ShakeCurves />;
}
