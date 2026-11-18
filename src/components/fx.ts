// Celebration effects: confetti + tiny synthesized sounds (no audio files).

import { progress } from '../progress/progress';

let audio: AudioContext | null = null;

export function sound(kind: 'ok' | 'bad' | 'level' | 'tick' | 'done') {
  if (!progress.state.sound) return;
  try {
    audio ??= new AudioContext();
    const a = audio;
    const notes: Record<string, [number, number][]> = {
      ok: [[660, 0], [880, 0.07]],
      bad: [[220, 0], [180, 0.08]],
      tick: [[1200, 0]],
      done: [[523, 0], [659, 0.09], [784, 0.18], [1047, 0.27]],
      level: [[392, 0], [523, 0.1], [659, 0.2], [784, 0.3], [1047, 0.42], [1319, 0.55]],
    };
    for (const [f, t] of notes[kind]) {
      const o = a.createOscillator();
      const g = a.createGain();
      o.type = kind === 'bad' ? 'square' : 'triangle';
      o.frequency.value = f;
      g.gain.setValueAtTime(0.0001, a.currentTime + t);
      g.gain.exponentialRampToValueAtTime(kind === 'tick' ? 0.04 : 0.12, a.currentTime + t + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, a.currentTime + t + (kind === 'tick' ? 0.05 : 0.22));
      o.connect(g).connect(a.destination);
      o.start(a.currentTime + t);
      o.stop(a.currentTime + t + 0.3);
    }
  } catch {
    /* no audio */
  }
}

export function confetti(intensity = 1) {
  if (typeof document === 'undefined') return;
  const c = document.createElement('canvas');
  c.className = 'confetti';
  c.width = window.innerWidth;
  c.height = window.innerHeight;
  document.body.appendChild(c);
  const ctx = c.getContext('2d')!;
  const colors = ['#217346', '#33C481', '#FFC000', '#4472C4', '#ED7D31', '#A9D08E', '#FF5C8A'];
  const n = Math.round(160 * intensity);
  const parts = Array.from({ length: n }, () => ({
    x: c.width / 2 + (Math.random() - 0.5) * c.width * 0.4,
    y: c.height * 0.35,
    vx: (Math.random() - 0.5) * 16,
    vy: -Math.random() * 16 - 4,
    w: 6 + Math.random() * 6,
    h: 8 + Math.random() * 8,
    r: Math.random() * Math.PI,
    vr: (Math.random() - 0.5) * 0.4,
    color: colors[Math.floor(Math.random() * colors.length)],
  }));
  let frame = 0;
  const tick = () => {
    frame++;
    ctx.clearRect(0, 0, c.width, c.height);
    for (const p of parts) {
      p.vy += 0.45;
      p.vx *= 0.99;
      p.x += p.vx;
      p.y += p.vy;
      p.r += p.vr;
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.r);
      ctx.fillStyle = p.color;
      ctx.globalAlpha = Math.max(0, 1 - frame / 160);
      ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
      ctx.restore();
    }
    if (frame < 160) requestAnimationFrame(tick);
    else c.remove();
  };
  requestAnimationFrame(tick);
}
