// A small game loop in a canvas, for figures you play: fixed-timestep updates (like Godot's
// _physics_process at 60 Hz), pixel-perfect upscaling, keyboard + touch input that is only
// captured while the figure has focus, and automatic pausing when it is off screen.
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Input, ACTION_KEYS, type Action } from './input';

export interface GameApi {
  /** logical width/height in game pixels */
  w: number;
  h: number;
  /** seconds since the figure started (paused time excluded) */
  time: number;
}

export interface GameCanvasProps {
  /** logical resolution, e.g. 320×180 (Godot viewport size) */
  width: number;
  height: number;
  /** fixed update rate in Hz (Godot physics default: 60) */
  hz?: number;
  /** speed multiplier (time scale) */
  timeScale?: number;
  update: (dt: number, input: Input, api: GameApi) => void;
  draw: (ctx: CanvasRenderingContext2D, api: GameApi) => void;
  /** which on-screen buttons to show on touch devices */
  touchButtons?: Action[];
  /** text on the click-to-focus overlay */
  prompt?: string;
  /** keys hint shown under the canvas */
  keysHint?: ReactNode;
  /** freeze updates (drawing continues) */
  paused?: boolean;
  /** max CSS width */
  maxWidth?: number;
  className?: string;
  label?: string;
}

export function GameCanvas({ width, height, hz = 60, timeScale = 1, update, draw, touchButtons = [], prompt = 'Click to play', keysHint, paused = false, maxWidth = 640, className, label = 'interactive game figure' }: GameCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const input = useRef(new Input()).current;
  const [focused, setFocused] = useState(false);
  const visible = useRef(true);
  const cb = useRef({ update, draw, timeScale, paused });
  cb.current = { update, draw, timeScale, paused };
  const api = useRef<GameApi>({ w: width, h: height, time: 0 }).current;
  api.w = width;
  api.h = height;

  useEffect(() => {
    const el = wrapRef.current;
    if (!el || typeof IntersectionObserver === 'undefined') return;
    const io = new IntersectionObserver((es) => (visible.current = es[0]?.isIntersecting ?? true), { threshold: 0.05 });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    let raf = 0;
    let last = performance.now();
    let acc = 0;
    const step = 1 / hz;
    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      const ctx = canvasRef.current?.getContext('2d');
      if (!ctx) return;
      let elapsed = Math.min(0.1, (now - last) / 1000);
      last = now;
      if (!visible.current || document.hidden) return;
      if (!cb.current.paused) {
        acc += elapsed * cb.current.timeScale;
        let n = 0;
        while (acc >= step && n < 8) {
          cb.current.update(step, input, api);
          input.endStep(step);
          api.time += step;
          acc -= step;
          n++;
        }
      } else elapsed = 0;
      ctx.imageSmoothingEnabled = false;
      cb.current.draw(ctx, api);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [hz, input, api]);

  const onKey = (down: boolean) => (e: React.KeyboardEvent) => {
    const action = ACTION_KEYS[e.key.length === 1 ? e.key.toLowerCase() : e.key];
    if (!action) return;
    e.preventDefault();
    if (down) input.press(action);
    else input.release(action);
  };

  return (
    <div className={'game ' + (className ?? '')} ref={wrapRef} style={{ maxWidth }}>
      <div className="game-screen">
        <canvas
          ref={canvasRef}
          width={width}
          height={height}
          tabIndex={0}
          aria-label={label}
          onKeyDown={onKey(true)}
          onKeyUp={onKey(false)}
          onFocus={() => setFocused(true)}
          onBlur={() => {
            setFocused(false);
            input.releaseAll();
          }}
          style={{ aspectRatio: `${width} / ${height}` }}
        />
        {!focused && (
          <button className="game-focus" onClick={() => canvasRef.current?.focus()}>
            {prompt}
          </button>
        )}
      </div>
      {touchButtons.length > 0 && <TouchPad input={input} buttons={touchButtons} />}
      {keysHint && <div className="game-keys">{keysHint}</div>}
    </div>
  );
}

function TouchPad({ input, buttons }: { input: Input; buttons: Action[] }) {
  const hold = (a: Action) => ({
    onPointerDown: (e: React.PointerEvent) => {
      (e.target as Element).setPointerCapture?.(e.pointerId);
      input.press(a);
    },
    onPointerUp: () => input.release(a),
    onPointerCancel: () => input.release(a),
    onPointerLeave: () => input.release(a),
  });
  return (
    <div className="game-touch" aria-hidden="true">
      <div className="dpad">
        <button className="up" {...hold('up')}>▲</button>
        <button className="left" {...hold('left')}>◀</button>
        <button className="right" {...hold('right')}>▶</button>
        <button className="down" {...hold('down')}>▼</button>
      </div>
      <div className="tbtns">
        {buttons.filter((b) => !['up', 'down', 'left', 'right'].includes(b)).map((b) => (
          <button key={b} {...hold(b)}>
            {b}
          </button>
        ))}
      </div>
    </div>
  );
}

/** Keyboard legend: [['←↑↓→ / WASD', 'move'], ['J', 'attack']] */
export function Keys({ items }: { items: [string, string][] }) {
  return (
    <span className="keys-legend">
      {items.map(([k, v]) => (
        <span key={k}>
          <kbd>{k}</kbd> {v}
        </span>
      ))}
    </span>
  );
}
