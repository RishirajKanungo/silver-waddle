// Controls shared by every figure: sliders, segmented choices, a step/play player,
// numeric matrix editing, and a small readout panel.
import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { TeX } from '../../ui/Markup';

export function Slider({ label, tex, value, min, max, step = 0.01, onChange, fmt, width }: { label?: string; tex?: string; value: number; min: number; max: number; step?: number; onChange: (v: number) => void; fmt?: (v: number) => string; width?: number }) {
  const id = useId();
  return (
    <label className="ctl-slider" htmlFor={id} style={width ? { width } : undefined}>
      <span className="ctl-label">{tex ? <TeX>{tex}</TeX> : label}</span>
      <input id={id} type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(parseFloat(e.target.value))} />
      <span className="ctl-val">{fmt ? fmt(value) : round(value, step)}</span>
    </label>
  );
}
const round = (v: number, step: number) => {
  const d = Math.max(0, -Math.floor(Math.log10(step)));
  return v.toFixed(Math.min(d, 4));
};

export function Seg<T extends string | number>({ value, options, onChange, label }: { value: T; options: { v: T; label: ReactNode }[]; onChange: (v: T) => void; label?: string }) {
  return (
    <div className="ctl-seg" role="radiogroup" aria-label={label}>
      {label && <span className="ctl-label">{label}</span>}
      {options.map((o) => (
        <button key={String(o.v)} role="radio" aria-checked={o.v === value} className={o.v === value ? 'on' : ''} onClick={() => onChange(o.v)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Toggle({ label, value, onChange }: { label: ReactNode; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="ctl-toggle">
      <input type="checkbox" checked={value} onChange={(e) => onChange(e.target.checked)} />
      <span>{label}</span>
    </label>
  );
}

/** Step through n frames: ⏮ ◀ ▶/❚❚ ▶| with a scrubber. */
export function usePlayer(n: number, { interval = 700, loop = false, autoStart = false } = {}) {
  const [i, setI] = useState(0);
  const [playing, setPlaying] = useState(autoStart);
  const timer = useRef<number | null>(null);
  useEffect(() => {
    if (!playing) return;
    timer.current = window.setInterval(() => {
      setI((v) => {
        if (v >= n - 1) {
          if (loop) return 0;
          setPlaying(false);
          return v;
        }
        return v + 1;
      });
    }, interval);
    return () => {
      if (timer.current) window.clearInterval(timer.current);
    };
  }, [playing, n, interval, loop]);
  useEffect(() => {
    if (i > n - 1) setI(Math.max(0, n - 1));
  }, [n, i]);
  const controls = (
    <div className="ctl-player">
      <button onClick={() => { setPlaying(false); setI(0); }} disabled={i === 0} aria-label="first step" title="first step">
        ⏮
      </button>
      <button onClick={() => { setPlaying(false); setI(Math.max(0, i - 1)); }} disabled={i === 0} aria-label="previous step" title="previous step">
        ‹
      </button>
      <button className="primary" onClick={() => (i >= n - 1 ? (setI(0), setPlaying(true)) : setPlaying(!playing))} aria-label={playing ? 'pause' : 'play'}>
        {playing ? 'Pause' : i >= n - 1 ? 'Replay' : 'Play'}
      </button>
      <button onClick={() => { setPlaying(false); setI(Math.min(n - 1, i + 1)); }} disabled={i >= n - 1} aria-label="next step" title="next step">
        ›
      </button>
      <input type="range" min={0} max={Math.max(0, n - 1)} value={i} onChange={(e) => { setPlaying(false); setI(parseInt(e.target.value)); }} aria-label="step" />
      <span className="ctl-count">
        {i + 1}/{n}
      </span>
    </div>
  );
  return { i, setI, playing, setPlaying, controls };
}

/** Editable matrix of numbers (arrow keys / typing). */
export function MatrixEdit({ value, onChange, step = 0.5, label, min = -9, max = 9 }: { value: number[][]; onChange: (m: number[][]) => void; step?: number; label?: string; min?: number; max?: number }) {
  return (
    <div className="ctl-matrix" aria-label={label}>
      {label && <span className="ctl-label">{label}</span>}
      <div className="mat-bracket" style={{ gridTemplateColumns: `repeat(${value[0].length}, auto)` }}>
        {value.map((row, i) =>
          row.map((x, j) => (
            <input
              key={i + '-' + j}
              type="number"
              step={step}
              min={min}
              max={max}
              value={Number.isFinite(x) ? Math.round(x * 1000) / 1000 : 0}
              aria-label={`${label ?? 'matrix'} entry ${i + 1},${j + 1}`}
              onChange={(e) => {
                const v = parseFloat(e.target.value);
                if (!Number.isFinite(v)) return;
                onChange(value.map((r, a) => r.map((y, b) => (a === i && b === j ? v : y))));
              }}
            />
          )),
        )}
      </div>
    </div>
  );
}

/** Small key–value readout: rows of [TeX label, value]. */
export function Readout({ rows, title }: { rows: [string, ReactNode][]; title?: string }) {
  return (
    <div className="readout">
      {title && <div className="readout-title">{title}</div>}
      {rows.map(([k, v], i) => (
        <div key={i} className="readout-row">
          <span className="readout-k">
            <TeX>{k}</TeX>
          </span>
          <span className="readout-v">{typeof v === 'string' && v.startsWith('$') ? <TeX>{v.slice(1)}</TeX> : v}</span>
        </div>
      ))}
    </div>
  );
}

/** Figure layout: drawing on the left, controls and readouts on the right (stacks on phones). */
export function FigureLayout({ children, side, below }: { children: ReactNode; side?: ReactNode; below?: ReactNode }) {
  return (
    <div className="fig">
      <div className="fig-main">
        <div className="fig-draw">{children}</div>
        {side && <div className="fig-side">{side}</div>}
      </div>
      {below && <div className="fig-below">{below}</div>}
    </div>
  );
}

export function Btn({ children, onClick, primary, disabled, title }: { children: ReactNode; onClick: () => void; primary?: boolean; disabled?: boolean; title?: string }) {
  return (
    <button className={primary ? 'primary' : ''} onClick={onClick} disabled={disabled} title={title}>
      {children}
    </button>
  );
}
