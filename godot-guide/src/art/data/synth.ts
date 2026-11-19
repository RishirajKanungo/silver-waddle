// A tiny deterministic chiptune synth: square / triangle / saw / sine / noise oscillators, ADSR
// envelopes, exponential pitch sweeps, vibrato, arpeggios and one-pole filters, plus a step
// sequencer for note data. Everything is pure and seeded, so a sound renders identically every time.

export type Wave = 'square' | 'triangle' | 'saw' | 'sine' | 'noise';

export interface Tone {
  wave: Wave;
  /** start time in seconds */
  t?: number;
  /** duration of the note (before the release) in seconds */
  dur: number;
  /** frequency in Hz at the start; `f1` at the end of `dur` (exponential sweep) */
  f0: number;
  f1?: number;
  /** square duty cycle (0.125, 0.25, 0.5) */
  duty?: number;
  vol?: number;
  /** ADSR: attack, decay, sustain level (0..1), release, all in seconds except s */
  a?: number;
  d?: number;
  s?: number;
  r?: number;
  /** vibrato [rate Hz, depth semitones, delay s] */
  vib?: [number, number, number?];
  /** arpeggio: semitone offsets cycled every `arpRate` seconds */
  arp?: number[];
  arpRate?: number;
  /** noise: sample-and-hold rate in Hz (higher = brighter); defaults to f0 */
  seed?: number;
  /** one-pole filters (Hz) */
  lp?: number;
  lp1?: number;
  hp?: number;
}

export const midi = (n: number) => 440 * Math.pow(2, (n - 69) / 12);
const NOTE: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
/** 'C4', 'F#3', 'Bb5' -> MIDI number */
export function noteNum(s: string): number {
  const m = /^([A-G])([#b]?)(-?\d)$/.exec(s);
  if (!m) throw new Error('bad note ' + s);
  return 12 * (Number(m[3]) + 1) + NOTE[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0);
}
export const hz = (s: string) => midi(noteNum(s));

function lcg(seed: number) {
  let a = (seed * 2654435761) >>> 0 || 1;
  return () => {
    a ^= a << 13;
    a >>>= 0;
    a ^= a >>> 17;
    a ^= a << 5;
    a >>>= 0;
    return (a / 4294967296) * 2 - 1;
  };
}

function env(t: number, o: Tone) {
  const a = o.a ?? 0.005, d = o.d ?? 0.05, s = o.s ?? 0.7, r = o.r ?? 0.05;
  if (t < 0) return 0;
  if (t < a) return t / a;
  if (t < a + d) return 1 - (1 - s) * ((t - a) / d);
  if (t < o.dur) return s;
  const level = o.dur < a ? o.dur / a : o.dur < a + d ? 1 - (1 - s) * ((o.dur - a) / d) : s;
  return Math.max(0, level * (1 - (t - o.dur) / r));
}

/** Add one tone into `buf`. With `wrap`, samples past the end wrap to the start (seamless loops). */
export function addTone(buf: Float32Array, sr: number, o: Tone, wrap = false) {
  const start = Math.round((o.t ?? 0) * sr);
  const total = o.dur + (o.r ?? 0.05);
  const n = Math.round(total * sr);
  const f1 = o.f1 ?? o.f0;
  const vol = o.vol ?? 0.5;
  const duty = o.duty ?? 0.5;
  const rnd = lcg(o.seed ?? 1);
  let phase = 0, held = rnd(), lpY = 0, hpY = 0, hpX = 0, nphase = 0;
  for (let i = 0; i < n; i++) {
    const t = i / sr;
    const k = Math.min(1, t / Math.max(1e-6, o.dur));
    let f = o.f0 * Math.pow(f1 / o.f0, k);
    if (o.arp?.length) f *= Math.pow(2, o.arp[Math.floor(t / (o.arpRate ?? 0.05)) % o.arp.length] / 12);
    if (o.vib && t > (o.vib[2] ?? 0)) f *= Math.pow(2, (o.vib[1] * Math.sin(2 * Math.PI * o.vib[0] * t)) / 12);
    let v: number;
    if (o.wave === 'noise') {
      nphase += f / sr;
      if (nphase >= 1) {
        nphase -= Math.floor(nphase);
        held = rnd();
      }
      v = held;
    } else {
      phase = (phase + f / sr) % 1;
      if (o.wave === 'square') v = phase < duty ? 1 : -1;
      else if (o.wave === 'triangle') v = 4 * Math.abs(phase - 0.5) - 1;
      else if (o.wave === 'saw') v = 2 * phase - 1;
      else v = Math.sin(2 * Math.PI * phase);
    }
    if (o.lp) {
      const cut = o.lp1 ? o.lp * Math.pow(o.lp1 / o.lp, k) : o.lp;
      const al = 1 - Math.exp((-2 * Math.PI * cut) / sr);
      lpY += al * (v - lpY);
      v = lpY;
    }
    if (o.hp) {
      const rc = 1 / (2 * Math.PI * o.hp), al = rc / (rc + 1 / sr);
      const y = al * (hpY + v - hpX);
      hpX = v;
      hpY = y;
      v = y;
    }
    let idx = start + i;
    if (idx >= buf.length) {
      if (!wrap) break;
      idx %= buf.length;
    }
    buf[idx] += v * vol * env(t, o);
  }
}

/** Scale so the peak sits at `peak` (never amplifies silence), and clamp to [-1, 1]. */
export function normalize(buf: Float32Array, peak = 0.89) {
  let m = 0;
  for (let i = 0; i < buf.length; i++) m = Math.max(m, Math.abs(buf[i]));
  const g = m > 1e-9 ? peak / m : 1;
  for (let i = 0; i < buf.length; i++) buf[i] = Math.max(-1, Math.min(1, buf[i] * g));
  return buf;
}
/** Short fades at both ends so one-shots never click. */
export function fadeEdges(buf: Float32Array, sr: number, ms = 3) {
  const n = Math.min(buf.length >> 1, Math.round((sr * ms) / 1000));
  for (let i = 0; i < n; i++) {
    buf[i] *= i / n;
    buf[buf.length - 1 - i] *= i / n;
  }
  return buf;
}

/** Render a one-shot from a list of tones. */
export function sfx(seconds: number, tones: Tone[]) {
  return (sr: number) => {
    const buf = new Float32Array(Math.round(seconds * sr));
    for (const t of tones) addTone(buf, sr, t);
    normalize(buf);
    // balance loudness: bright square tones are much louder than noise at the same peak
    let rms = 0;
    for (let i = 0; i < buf.length; i++) rms += buf[i] * buf[i];
    rms = Math.sqrt(rms / buf.length);
    if (rms > 0.26) for (let i = 0; i < buf.length; i++) buf[i] *= 0.26 / rms;
    return fadeEdges(buf, sr);
  };
}

// --------------------------------------------------------------------------------------- sequencer
export interface Voice {
  wave: Wave;
  duty?: number;
  vol: number;
  a?: number;
  d?: number;
  s?: number;
  r?: number;
  vib?: [number, number, number?];
  lp?: number;
  /** semitone transpose */
  tr?: number;
  /** fraction of the note length that sounds (staccato < 1) */
  gate?: number;
}
export interface Track {
  voice: Voice;
  /** whitespace-separated tokens: a note (C4, F#3, Bb5), '.' to hold, '-' or '_' for a rest */
  notes: string;
  /** sixteenth-notes per token (1 = 16ths, 2 = 8ths, 4 = quarters) */
  step: number;
}
export interface DrumTrack {
  /** tokens per 16th: k kick, s snare, h closed hat, o open hat, t low tom, x crash, '.' rest; combine with '+' */
  hits: string;
  vol: number;
}
export interface Song {
  bpm: number;
  bars: number;
  tracks: Track[];
  drums?: DrumTrack;
}
export const songSeconds = (s: Song) => (s.bars * 4 * 60) / s.bpm;

export function renderSong(song: Song) {
  return (sr: number) => {
    const sec = songSeconds(song);
    const buf = new Float32Array(Math.round(sec * sr));
    const six = 60 / song.bpm / 4; // seconds per sixteenth
    let seed = 1;
    for (const tr of song.tracks) {
      const toks = tr.notes.split(/\s+/).filter(Boolean);
      const total = (song.bars * 16) / tr.step;
      if (toks.length !== total) throw new Error(`track has ${toks.length} tokens, expected ${total}`);
      for (let i = 0; i < toks.length; i++) {
        const tok = toks[i];
        if (tok === '.' || tok === '-' || tok === '_') continue;
        let len = 1;
        while (i + len < toks.length && toks[i + len] === '.') len++;
        const v = tr.voice;
        const dur = len * tr.step * six * (v.gate ?? 0.92);
        addTone(buf, sr, { wave: v.wave, duty: v.duty, vol: v.vol, a: v.a ?? 0.004, d: v.d ?? 0.08, s: v.s ?? 0.6, r: v.r ?? 0.04, vib: v.vib, lp: v.lp, t: i * tr.step * six, dur, f0: midi(noteNum(tok) + (v.tr ?? 0)), seed: seed++ }, true);
      }
    }
    if (song.drums) {
      const toks = song.drums.hits.split(/\s+/).filter(Boolean);
      if (toks.length !== song.bars * 16) throw new Error(`drums have ${toks.length} tokens, expected ${song.bars * 16}`);
      toks.forEach((tok, i) => {
        if (tok === '.') return;
        for (const h of tok.split('+')) for (const tone of drum(h, i * six, song.drums!.vol, i)) addTone(buf, sr, tone, true);
      });
    }
    return normalize(buf, 0.85);
  };
}

/** Drum voices built from the oscillators above. */
export function drum(kind: string, t: number, vol: number, seed = 1): Tone[] {
  switch (kind) {
    case 'k':
      return [
        { wave: 'triangle', t, f0: 160, f1: 42, dur: 0.11, vol: vol * 1.3, a: 0.001, d: 0.08, s: 0.3, r: 0.04 },
        { wave: 'noise', t, f0: 6000, dur: 0.01, vol: vol * 0.3, a: 0.001, d: 0.01, s: 0, r: 0.005, seed },
      ];
    case 's':
      return [
        { wave: 'noise', t, f0: 9000, dur: 0.1, vol: vol * 0.7, a: 0.001, d: 0.09, s: 0.1, r: 0.05, hp: 900, seed },
        { wave: 'triangle', t, f0: 220, f1: 150, dur: 0.06, vol: vol * 0.5, a: 0.001, d: 0.05, s: 0.2, r: 0.02 },
      ];
    case 'h':
      return [{ wave: 'noise', t, f0: 16000, dur: 0.02, vol: vol * 0.28, a: 0.001, d: 0.02, s: 0, r: 0.01, hp: 5000, seed }];
    case 'o':
      return [{ wave: 'noise', t, f0: 14000, dur: 0.12, vol: vol * 0.25, a: 0.001, d: 0.12, s: 0.2, r: 0.06, hp: 4000, seed }];
    case 't':
      return [{ wave: 'triangle', t, f0: 200, f1: 90, dur: 0.14, vol: vol * 0.9, a: 0.001, d: 0.12, s: 0.2, r: 0.05 }];
    case 'r': // rim / woodblock
      return [{ wave: 'square', duty: 0.5, t, f0: 1700, f1: 1500, dur: 0.015, vol: vol * 0.25, a: 0.001, d: 0.015, s: 0, r: 0.01, lp: 3000 }];
    case 'x':
      return [{ wave: 'noise', t, f0: 12000, dur: 0.5, vol: vol * 0.35, a: 0.001, d: 0.4, s: 0.15, r: 0.3, hp: 2500, seed }];
    default:
      throw new Error('unknown drum ' + kind);
  }
}
