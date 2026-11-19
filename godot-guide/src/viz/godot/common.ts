// Helpers shared by the Godot-foundations figures: an animation-frame loop that pauses when the
// figure is off screen, and small formatting utilities.
import { useEffect, useRef } from 'react';

/** Calls cb(dtSeconds) on every animation frame while `el` is visible. dt is clamped to 0.1 s. */
export function useFrameLoop(el: React.RefObject<Element | null>, cb: (dt: number) => void) {
  const fn = useRef(cb);
  fn.current = cb;
  useEffect(() => {
    let raf = 0;
    let last = performance.now();
    let visible = true;
    const node = el.current;
    let io: IntersectionObserver | undefined;
    if (node && typeof IntersectionObserver !== 'undefined') {
      io = new IntersectionObserver((es) => (visible = es[0]?.isIntersecting ?? true), { threshold: 0.02 });
      io.observe(node);
    }
    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      if (!visible || document.hidden) return;
      fn.current(dt);
    };
    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      io?.disconnect();
    };
  }, [el]);
}

/** 2^(layer-1) summed: the integer Godot stores in collision_layer / collision_mask */
export const bitsValue = (layers: number[]) => layers.reduce((s, l) => s + 2 ** (l - 1), 0);

export const binary = (v: number, width = 8) => v.toString(2).padStart(width, '0');
