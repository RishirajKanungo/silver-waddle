// Celebration effects: confetti + tiny synthesized sounds (no audio files).
import { progress } from '../progress/store';

let audio: AudioContext | null = null;
export function sound(kind: 'ok' | 'bad' | 'level' | 'tick' | 'done' | 'chest') {
  if (!progress.s.sound) return;
  try {
    audio ??= new AudioContext();
    const a = audio;
    const notes: Record<string, [number, number][]> = {
      ok: [[660, 0], [990, 0.07]],
      bad: [[240, 0], [200, 0.09]],
      tick: [[1200, 0]],
      done: [[523, 0], [659, 0.08], [784, 0.16], [1047, 0.26]],
      level: [[392, 0], [523, 0.1], [659, 0.2], [784, 0.3], [1047, 0.42], [1319, 0.55]],
      chest: [[880, 0], [1175, 0.1], [1568, 0.2], [2093, 0.32]],
    };
    for (const [f, t] of notes[kind]) {
      const o = a.createOscillator();
      const g = a.createGain();
      o.type = kind === 'bad' ? 'square' : 'triangle';
      o.frequency.value = f;
      g.gain.setValueAtTime(0.0001, a.currentTime + t);
      g.gain.exponentialRampToValueAtTime(kind === 'tick' ? 0.03 : 0.1, a.currentTime + t + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, a.currentTime + t + 0.22);
      o.connect(g).connect(a.destination);
      o.start(a.currentTime + t);
      o.stop(a.currentTime + t + 0.3);
    }
  } catch {
    /* no audio available */
  }
}

export function confetti(intensity = 1) {
  if (typeof document === 'undefined' || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
  const c = document.createElement('canvas');
  c.className = 'confetti';
  c.width = window.innerWidth;
  c.height = window.innerHeight;
  document.body.appendChild(c);
  const ctx = c.getContext('2d')!;
  const colors = ['#7c5cff', '#22c1a6', '#ffb020', '#ff5c8a', '#3fa7ff', '#9be15d'];
  const parts = Array.from({ length: Math.round(150 * intensity) }, () => ({
    x: c.width / 2 + (Math.random() - 0.5) * c.width * 0.3, y: c.height * 0.4,
    vx: (Math.random() - 0.5) * 15, vy: -Math.random() * 15 - 4, w: 5 + Math.random() * 6, h: 7 + Math.random() * 8,
    r: Math.random() * 3, vr: (Math.random() - 0.5) * 0.4, color: colors[Math.floor(Math.random() * colors.length)],
  }));
  let frame = 0;
  const tick = () => {
    frame++;
    ctx.clearRect(0, 0, c.width, c.height);
    for (const p of parts) {
      p.vy += 0.42;
      p.x += p.vx;
      p.y += p.vy;
      p.r += p.vr;
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.r);
      ctx.fillStyle = p.color;
      ctx.globalAlpha = Math.max(0, 1 - frame / 150);
      ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
      ctx.restore();
    }
    if (frame < 150) requestAnimationFrame(tick);
    else c.remove();
  };
  requestAnimationFrame(tick);
}
