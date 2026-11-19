// combat.frame: frame data of one attack, frame by frame. Sliders for startup, active, recovery and
// the cancel frame; a scrubbable strip of frames; Kai's sprite and hitbox at the selected frame; and
// the AnimationPlayer keys (in seconds) that produce exactly this timing.
import { useEffect, useRef, useState } from 'react';
import type { VizSpec } from '../../content/types';
import { FigureLayout, Slider, SegControl, Readout } from '../kit';
import { drawChar, drawFloor, drawShadow, frameAt, boxOutline } from './common';
import { COMBO, PHASE_COL } from './hit';

const BUFFER = 9;

export function FrameData({ spec }: { spec: VizSpec }) {
  const [preset, setPreset] = useState<number>((spec.hit as number) ?? 0);
  const p = COMBO[preset];
  const [startup, setStartup] = useState(p.startup);
  const [active, setActive] = useState(p.active);
  const [recovery, setRecovery] = useState(p.recovery);
  const [cancel, setCancel] = useState(p.cancel > 90 ? 0 : p.cancel);
  const [f, setF] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [slow, setSlow] = useState<'1' | '4'>('4');
  const total = startup + active + recovery;
  const cv = useRef<HTMLCanvasElement>(null);

  const choose = (k: number) => {
    const c = COMBO[k];
    setPreset(k);
    setStartup(c.startup);
    setActive(c.active);
    setRecovery(c.recovery);
    setCancel(c.cancel > 90 ? 0 : c.cancel);
    setF(0);
  };
  const fc = Math.min(f, total - 1);
  const phase = fc < startup ? 1 : fc < startup + active ? 2 : 3;

  useEffect(() => {
    if (!playing) return;
    let raf = 0, last = performance.now(), acc = 0;
    const step = (1 / 60) * Number(slow);
    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      acc += Math.min(0.1, (now - last) / 1000);
      last = now;
      while (acc >= step) {
        acc -= step;
        setF((v) => (v + 1) % total);
      }
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [playing, slow, total]);

  useEffect(() => {
    const c = cv.current;
    if (!c) return;
    const ctx = c.getContext('2d')!;
    ctx.imageSmoothingEnabled = false;
    drawFloor(ctx, 112, 48, 'dungeon');
    const k = phase === 1 ? 0 : phase === 2 ? 0.3 : fc < startup + active + recovery / 2 ? 0.55 : 0.8;
    drawShadow(ctx, 40, 42);
    drawChar(ctx, 'hero', 'attack_side', 0, 40, 42, { frame: frameAt('hero', 'attack_side', k) });
    drawShadow(ctx, 70, 42);
    drawChar(ctx, 'skeleton', phase === 2 ? 'hurt' : 'idle', 0, 70, 42, { flip: true, flash: phase === 2 ? 0.7 : 0 });
    boxOutline(ctx, [45, 26, 16, 14], phase === 2 ? '#ff5a4a' : 'rgba(255,90,74,0.35)', phase === 2 ? 'rgba(255,90,74,0.3)' : undefined);
    boxOutline(ctx, [64, 20, 12, 22], '#5aa0ff');
  }, [fc, phase, startup, active, recovery]);

  // frame strip geometry
  const X0 = 10, SW = 500, cw = SW / total;
  const t = (n: number) => (n / 60).toFixed(4);
  const keys: [string, [number, string][]][] = [
    ['AnimatedSprite2D:frame', [[0, '0'], [startup, '1'], [startup + active, '2'], [startup + active + Math.round(recovery / 2), '3']]],
    ['HitboxPivot/Hitbox/CollisionShape2D:disabled', [[0, 'true'], [startup, 'false'], [startup + active, 'true']]],
    ['Audio: sfx_swing', [[Math.max(0, startup - 1), 'play']]],
  ];
  const winA = cancel ? Math.max(0, cancel - BUFFER) : 0, winB = total - 1;

  return (
    <FigureLayout
      side={
        <>
          <SegControl label="preset" value={preset} options={COMBO.map((_, k) => ({ v: k, label: `hit ${k + 1}` }))} onChange={choose} />
          <Slider label="startup" value={startup} min={1} max={24} step={1} onChange={(v) => (setStartup(v), setF(0))} />
          <Slider label="active" value={active} min={1} max={10} step={1} onChange={(v) => (setActive(v), setF(0))} />
          <Slider label="recovery" value={recovery} min={2} max={36} step={1} onChange={(v) => (setRecovery(v), setF(0))} />
          <Slider label="cancel_frame (0 = none)" value={cancel} min={0} max={total} step={1} onChange={setCancel} />
          <Readout
            rows={[
              ['\\text{total}', `${total} f = ${((total * 1000) / 60).toFixed(0)} ms`],
              ['\\text{hitbox on}', `${t(startup)}..${t(startup + active)} s`],
              ['\\text{repeat rate}', `${(60 / (cancel || total)).toFixed(2)} /s`],
              ['\\text{input window}', cancel ? `frames ${winA}..${winB}` : 'none'],
            ]}
          />
        </>
      }
      below={
        <div className="arch-below-full">
          <div className="ctl-player">
            <button onClick={() => (setPlaying(false), setF(Math.max(0, fc - 1)))} aria-label="previous frame">‹</button>
            <button className="primary" onClick={() => setPlaying(!playing)}>{playing ? 'Pause' : 'Play'}</button>
            <button onClick={() => (setPlaying(false), setF((fc + 1) % total))} aria-label="next frame">›</button>
            <input type="range" min={0} max={total - 1} value={fc} onChange={(e) => (setPlaying(false), setF(parseInt(e.target.value)))} aria-label="frame" />
            <span className="ctl-count">frame {fc}</span>
          </div>
          <SegControl
            label="speed"
            value={slow}
            options={[
              { v: '1', label: 'real time' },
              { v: '4', label: '1/4 speed' },
            ]}
            onChange={setSlow}
          />
          <div className="arch-panel" style={{ width: '100%', boxSizing: 'border-box' }}>
            <div className="arch-panel-title">AnimationPlayer "{COMBO[preset].name}": length {t(total)} s, step 0.0167 s</div>
            {keys.map(([track, ks]) => (
              <div key={track} style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'baseline' }}>
                <span className="arch-row" style={{ minWidth: 0 }}><span className="k">{track}</span></span>
                {ks.map(([fr, v]) => (
                  <span key={fr + v} className={'arch-chip' + (fc >= fr && (ks.find((x) => x[0] > fr)?.[0] ?? 999) > fc ? ' on' : '')}>
                    {t(fr)} s: {v}
                  </span>
                ))}
              </div>
            ))}
          </div>
        </div>
      }
    >
      <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'center' }}>
        <canvas ref={cv} width={112} height={48} style={{ width: '100%', maxWidth: 336, imageRendering: 'pixelated', borderRadius: 4 }} aria-label="Kai at the selected frame" />
        <svg className="arch-diagram" viewBox="0 0 520 96" role="img" aria-label={`frame strip, ${total} frames`}>
          {Array.from({ length: total }, (_, n) => {
            const ph = n < startup ? 1 : n < startup + active ? 2 : 3;
            return <rect key={n} x={X0 + n * cw} y={20} width={Math.max(1, cw - 1)} height={26} fill={PHASE_COL[ph]} opacity={n === fc ? 1 : 0.75} style={{ cursor: 'pointer' }} onClick={() => (setPlaying(false), setF(n))} />;
          })}
          <rect x={X0 + fc * cw - 1} y={14} width={cw + 1} height={38} fill="none" stroke="var(--fg)" strokeWidth={2} />
          <text x={X0} y={12} className="arch-small">0</text>
          <text x={X0 + startup * cw} y={12} className="arch-small" textAnchor="middle">{startup}</text>
          <text x={X0 + (startup + active) * cw} y={12} className="arch-small" textAnchor="middle">{startup + active}</text>
          <text x={X0 + total * cw} y={12} className="arch-small" textAnchor="end">{total}</text>
          {cancel > 0 && cancel < total && (
            <>
              <line x1={X0 + cancel * cw} x2={X0 + cancel * cw} y1={16} y2={58} stroke="var(--accent)" strokeWidth={2} />
              <text x={X0 + cancel * cw + 3} y={60} className="arch-small" style={{ fill: 'var(--accent)' }}>cancel_frame</text>
              <line x1={X0 + winA * cw} x2={X0 + total * cw} y1={74} y2={74} stroke="var(--accent)" strokeWidth={2} />
              <text x={X0 + winA * cw} y={88} className="arch-small">presses here continue the string (buffer 9 f)</text>
            </>
          )}
        </svg>
      </div>
    </FigureLayout>
  );
}
