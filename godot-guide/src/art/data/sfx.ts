// Sound effects, synthesized from the chiptune voices in ./synth.
import type { ArtModule, SoundDef } from '../types';
import { hz, sfx, type Tone } from './synth';

type Entry = NonNullable<ArtModule['sounds']>[number];
function S(id: string, title: string, seconds: number, tones: Tone[], notes?: string): Entry {
  const def: SoundDef = { id, kind: 'sfx', title, file: `assets/audio/sfx/${id.replace(/^sfx_/, '')}.wav`, seconds, notes };
  return { def, render: sfx(seconds, tones) };
}
/** quick arpeggio: notes at a fixed spacing */
const run = (notes: string[], gap: number, base: Partial<Tone>, t0 = 0): Tone[] =>
  notes.map((n, i) => ({ wave: 'square', duty: 0.25, vol: 0.4, a: 0.002, d: 0.05, s: 0.6, r: 0.06, dur: gap * 0.9, ...base, t: t0 + i * gap, f0: hz(n) }) as Tone);

export const ART: ArtModule = {
  sheets: [],
  sounds: [
    S('sfx_swing', 'Sword swing', 0.2, [
      { wave: 'noise', f0: 9000, dur: 0.12, vol: 0.8, a: 0.03, d: 0.06, s: 0.3, r: 0.06, lp: 900, lp1: 5000, seed: 3 },
      { wave: 'square', duty: 0.125, f0: 520, f1: 260, dur: 0.08, vol: 0.12, a: 0.01, d: 0.06, s: 0.2, r: 0.03 },
    ], 'A filtered-noise whoosh. Play at the start of the strike frame.'),
    S('sfx_hit', 'Hit', 0.18, [
      { wave: 'noise', f0: 7000, dur: 0.05, vol: 0.9, a: 0.001, d: 0.04, s: 0.2, r: 0.05, lp: 3500, seed: 5 },
      { wave: 'square', duty: 0.5, f0: 240, f1: 70, dur: 0.1, vol: 0.5, a: 0.001, d: 0.08, s: 0.3, r: 0.04 },
    ], 'A punchy thump for a landed blow.'),
    S('sfx_crit', 'Critical hit', 0.4, [
      { wave: 'noise', f0: 9000, dur: 0.06, vol: 1, a: 0.001, d: 0.05, s: 0.2, r: 0.06, lp: 5000, seed: 6 },
      { wave: 'square', duty: 0.5, f0: 300, f1: 60, dur: 0.12, vol: 0.55, a: 0.001, d: 0.1, s: 0.3, r: 0.04 },
      { wave: 'square', duty: 0.25, t: 0.05, f0: hz('E6'), dur: 0.25, vol: 0.25, a: 0.002, d: 0.1, s: 0.4, r: 0.08, arp: [0, 7, 12], arpRate: 0.03 },
    ], 'A heavier hit with a bright ringing sparkle.'),
    S('sfx_hurt', 'Player hurt', 0.28, [
      { wave: 'square', duty: 0.5, f0: 520, f1: 130, dur: 0.22, vol: 0.5, a: 0.002, d: 0.1, s: 0.5, r: 0.05, vib: [30, 1.2] },
      { wave: 'noise', f0: 4000, dur: 0.05, vol: 0.4, a: 0.001, d: 0.04, s: 0, r: 0.02, seed: 8 },
    ], 'A falling, wobbling buzz.'),
    S('sfx_jump', 'Jump', 0.2, [{ wave: 'square', duty: 0.125, f0: 280, f1: 880, dur: 0.15, vol: 0.45, a: 0.002, d: 0.05, s: 0.7, r: 0.05 }]),
    S('sfx_land', 'Land', 0.14, [
      { wave: 'noise', f0: 3000, dur: 0.05, vol: 0.7, a: 0.001, d: 0.05, s: 0.1, r: 0.05, lp: 1200, seed: 9 },
      { wave: 'triangle', f0: 140, f1: 50, dur: 0.08, vol: 0.7, a: 0.001, d: 0.07, s: 0.2, r: 0.04 },
    ]),
    S('sfx_dash', 'Dash', 0.24, [
      { wave: 'noise', f0: 10000, dur: 0.18, vol: 0.7, a: 0.01, d: 0.1, s: 0.4, r: 0.05, lp: 600, lp1: 6000, seed: 10 },
      { wave: 'square', duty: 0.125, f0: 200, f1: 600, dur: 0.12, vol: 0.15, a: 0.005, d: 0.1, s: 0.2, r: 0.04 },
    ]),
    S('sfx_coin', 'Coin', 0.35, [
      { wave: 'square', duty: 0.5, f0: hz('B5'), dur: 0.06, vol: 0.35, a: 0.001, d: 0.02, s: 0.9, r: 0.005 },
      { wave: 'square', duty: 0.5, t: 0.065, f0: hz('E6'), dur: 0.12, vol: 0.35, a: 0.001, d: 0.2, s: 0.3, r: 0.12 },
    ], 'The classic two-note pickup.'),
    S('sfx_chest', 'Chest open', 0.8, [
      ...run(['G4', 'C5', 'E5', 'G5'], 0.07, { duty: 0.5, vol: 0.32 }),
      { wave: 'square', duty: 0.25, t: 0.28, f0: hz('C6'), dur: 0.3, vol: 0.32, a: 0.002, d: 0.1, s: 0.6, r: 0.2, vib: [6, 0.2, 0.1] },
      { wave: 'triangle', t: 0.28, f0: hz('C4'), dur: 0.3, vol: 0.4, a: 0.002, d: 0.1, s: 0.6, r: 0.2 },
    ], 'A rising fanfare for treasure.'),
    S('sfx_menu_move', 'Menu move', 0.05, [{ wave: 'square', duty: 0.25, f0: 1250, dur: 0.025, vol: 0.3, a: 0.001, d: 0.02, s: 0.5, r: 0.01 }]),
    S('sfx_menu_select', 'Menu select', 0.15, [
      { wave: 'square', duty: 0.25, f0: hz('A5'), dur: 0.04, vol: 0.32, a: 0.001, d: 0.03, s: 0.7, r: 0.01 },
      { wave: 'square', duty: 0.25, t: 0.05, f0: hz('E6'), dur: 0.06, vol: 0.32, a: 0.001, d: 0.05, s: 0.5, r: 0.03 },
    ]),
    S('sfx_menu_back', 'Menu back', 0.13, [
      { wave: 'square', duty: 0.25, f0: hz('E5'), dur: 0.04, vol: 0.32, a: 0.001, d: 0.03, s: 0.7, r: 0.01 },
      { wave: 'square', duty: 0.25, t: 0.05, f0: hz('A4'), dur: 0.05, vol: 0.32, a: 0.001, d: 0.04, s: 0.5, r: 0.02 },
    ]),
    S('sfx_cast', 'Spell cast', 0.65, [
      { wave: 'square', duty: 0.125, f0: hz('C5'), f1: hz('C6'), dur: 0.5, vol: 0.3, a: 0.05, d: 0.1, s: 0.7, r: 0.12, arp: [0, 4, 7, 11], arpRate: 0.04, vib: [7, 0.3] },
      { wave: 'triangle', f0: hz('C4'), f1: hz('G4'), dur: 0.5, vol: 0.35, a: 0.08, d: 0.1, s: 0.7, r: 0.12 },
      { wave: 'noise', t: 0.2, f0: 15000, dur: 0.3, vol: 0.12, a: 0.05, d: 0.2, s: 0.3, r: 0.1, hp: 6000, seed: 12 },
    ], 'A rising shimmer while magic gathers.'),
    S('sfx_fire', 'Fire spell', 0.55, [
      { wave: 'noise', f0: 2500, dur: 0.4, vol: 0.9, a: 0.01, d: 0.15, s: 0.6, r: 0.12, lp: 3000, lp1: 500, seed: 13 },
      { wave: 'square', duty: 0.5, f0: 180, f1: 60, dur: 0.35, vol: 0.25, a: 0.01, d: 0.2, s: 0.4, r: 0.1, vib: [22, 1.5] },
    ], 'A roaring, crackling burst.'),
    S('sfx_ice', 'Ice spell', 0.6, [
      ...run(['B6', 'F#6', 'D6', 'B5', 'F#5'], 0.06, { wave: 'triangle', vol: 0.5, r: 0.15 }),
      { wave: 'noise', f0: 16000, dur: 0.4, vol: 0.18, a: 0.002, d: 0.3, s: 0.1, r: 0.1, hp: 7000, seed: 14 },
      { wave: 'square', duty: 0.125, t: 0.02, f0: hz('B6'), dur: 0.3, vol: 0.12, a: 0.002, d: 0.2, s: 0.3, r: 0.15, vib: [14, 0.4] },
    ], 'Glassy falling chimes and frosty hiss.'),
    S('sfx_heal', 'Heal', 0.85, [
      ...run(['C5', 'E5', 'G5', 'C6', 'E6'], 0.08, { wave: 'triangle', vol: 0.5, r: 0.25 }),
      ...run(['G5', 'C6', 'E6', 'G6'], 0.08, { duty: 0.125, vol: 0.14, r: 0.25 }, 0.04),
    ], 'A gentle rising major arpeggio.'),
    S('sfx_explosion', 'Explosion', 1.0, [
      { wave: 'noise', f0: 4000, dur: 0.75, vol: 1, a: 0.002, d: 0.3, s: 0.4, r: 0.25, lp: 3500, lp1: 160, seed: 15 },
      { wave: 'triangle', f0: 110, f1: 32, dur: 0.6, vol: 0.9, a: 0.002, d: 0.3, s: 0.5, r: 0.2 },
    ]),
    S('sfx_stagger', 'Stagger', 0.65, [
      { wave: 'square', duty: 0.25, f0: hz('E5'), f1: hz('A4'), dur: 0.5, vol: 0.3, a: 0.005, d: 0.1, s: 0.7, r: 0.1, vib: [9, 1.4] },
      ...run(['E7', 'B6', 'E7', 'B6'], 0.12, { wave: 'triangle', vol: 0.2, dur: 0.05, r: 0.05 }, 0.05),
    ], 'A dizzy wobble with twinkling stars: the enemy is open to punishment.'),
    S('sfx_atb_ready', 'ATB ready', 0.3, [
      { wave: 'square', duty: 0.25, f0: hz('E6'), dur: 0.05, vol: 0.3, a: 0.001, d: 0.04, s: 0.6, r: 0.02 },
      { wave: 'square', duty: 0.25, t: 0.06, f0: hz('B6'), dur: 0.12, vol: 0.3, a: 0.001, d: 0.1, s: 0.4, r: 0.1 },
      { wave: 'triangle', t: 0.06, f0: hz('B5'), dur: 0.12, vol: 0.3, a: 0.001, d: 0.1, s: 0.4, r: 0.1 },
    ], 'A bright ping when a party member\'s turn gauge fills.'),
    S('sfx_levelup', 'Level up', 1.3, [
      ...run(['C5', 'E5', 'G5', 'C6'], 0.09, { duty: 0.5, vol: 0.3 }),
      ...run(['E4', 'G4', 'C5', 'E5'], 0.09, { wave: 'triangle', vol: 0.4 }),
      { wave: 'square', duty: 0.5, t: 0.4, f0: hz('C6'), dur: 0.6, vol: 0.3, a: 0.002, d: 0.1, s: 0.7, r: 0.25, vib: [6, 0.25, 0.15] },
      { wave: 'square', duty: 0.25, t: 0.4, f0: hz('G5'), dur: 0.6, vol: 0.18, a: 0.002, d: 0.1, s: 0.7, r: 0.25 },
      { wave: 'triangle', t: 0.4, f0: hz('C4'), dur: 0.6, vol: 0.45, a: 0.002, d: 0.1, s: 0.7, r: 0.25 },
    ], 'A short victory fanfare.'),
    S('sfx_footstep', 'Footstep', 0.07, [
      { wave: 'noise', f0: 2200, dur: 0.025, vol: 0.8, a: 0.001, d: 0.025, s: 0.1, r: 0.02, lp: 1600, seed: 16 },
      { wave: 'triangle', f0: 120, f1: 80, dur: 0.03, vol: 0.4, a: 0.001, d: 0.03, s: 0.1, r: 0.02 },
    ], 'Soft and short: play on the walk frames where a foot lands, with a little random pitch.'),
  ],
};
