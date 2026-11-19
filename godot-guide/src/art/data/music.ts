// Looping music written as note data for the step sequencer in ./synth. Each song has a lead melody,
// a harmony or arpeggio voice, a triangle bass and noise/triangle drums. Notes that ring past the end
// of the loop wrap around to the start, so the files loop seamlessly.
import type { ArtModule } from '../types';
import { noteNum, renderSong, songSeconds, type Song } from './synth';

const NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const name = (n: number) => NAMES[n % 12] + (Math.floor(n / 12) - 1);
const up = (note: string, semis: number) => name(noteNum(note) + semis);
const rep = (s: string, n: number) => Array(n).fill(s).join(' ');

/** a bar of 8th-note bass: root, root, octave, root, fifth, -, octave, - */
const bass8 = (r: string) => [r, '.', up(r, 12), r, up(r, 7), '.', up(r, 12), '.'].join(' ');
/** a bar of driving 16th-note bass */
const bass16 = (r: string) => [r, '-', r, up(r, 12), r, '-', r, up(r, 12), r, '-', r, up(r, 12), r, '-', up(r, 12), r].join(' ');
/** 16th-note arpeggio over a triad, 4 notes repeated 4 times */
const arp16 = (notes: string[]) => rep(notes.join(' '), 4);

// ======================================================================================== town
// F major, 96 BPM, 8 bars (20 s). Calm: a singing square lead, broken chords, walking triangle bass.
const TOWN: Song = {
  bpm: 96,
  bars: 8,
  tracks: [
    {
      voice: { wave: 'square', duty: 0.25, vol: 0.3, a: 0.01, d: 0.15, s: 0.55, r: 0.12, vib: [5.5, 0.18, 0.12] },
      step: 2,
      notes: `
        A4 . . C5 F5 . E5 .     D5 . C5 . G4 . . .
        F4 . G4 A4 Bb4 . A4 G4  A4 . . . G4 . . .
        A4 . . C5 F5 . G5 .     A5 . G5 F5 D5 . . .
        D5 . C5 Bb4 A4 . G4 .   F4 . . . . . - -`,
    },
    {
      voice: { wave: 'square', duty: 0.125, vol: 0.12, a: 0.005, d: 0.12, s: 0.3, r: 0.06 },
      step: 2,
      notes: `
        F4 A4 C5 A4 F4 A4 C5 A4   E4 G4 C5 G4 E4 G4 C5 G4
        D4 F4 Bb4 F4 D4 F4 Bb4 F4 E4 G4 C5 G4 E4 G4 C5 G4
        F4 A4 C5 A4 F4 A4 C5 A4   D4 F4 A4 F4 D4 F4 A4 F4
        D4 F4 Bb4 F4 E4 G4 C5 G4  F4 A4 C5 A4 F4 A4 C5 A4`,
    },
    {
      voice: { wave: 'triangle', vol: 0.5, a: 0.005, d: 0.2, s: 0.6, r: 0.08, gate: 0.85 },
      step: 4,
      notes: `
        F2 . C3 .   C2 . G2 .   Bb1 . F2 .   C2 . G2 E2
        F2 . C3 .   D2 . A2 .   Bb1 . C2 .   F2 . C2 .`,
    },
  ],
  drums: { vol: 0.45, hits: rep('k . h . r . h . k . h . r . h h', 7) + ' k . h . r . h . k . r . r . r r' },
};

// ======================================================================================== field
// D mixolydian/major, 140 BPM, 12 bars (about 20.6 s). Adventurous: I - bVII - IV - I, then a lift
// through vi and V before turning around.
const FIELD_CHORDS = ['D2', 'C2', 'G2', 'D2', 'D2', 'C2', 'G2', 'A2', 'B2', 'G2', 'A2', 'A2'];
const STAB: Record<string, string> = {
  D2: '- F#4 - A4 - F#4 - A4',
  C2: '- E4 - G4 - E4 - G4',
  G2: '- D4 - G4 - D4 - G4',
  A2: '- C#4 - E4 - C#4 - E4',
  B2: '- D4 - F#4 - D4 - F#4',
};
const FIELD: Song = {
  bpm: 140,
  bars: 12,
  tracks: [
    {
      voice: { wave: 'square', duty: 0.5, vol: 0.28, a: 0.005, d: 0.1, s: 0.6, r: 0.06, vib: [6, 0.15, 0.1] },
      step: 2,
      notes: `
        D5 . . A4 D5 . E5 F#5   G5 . E5 . C5 . E5 .
        D5 . . B4 G4 . A4 B4    A4 . . . F#4 . A4 .
        D5 . . A4 D5 . E5 F#5   G5 . A5 . G5 E5 C5 .
        B4 . D5 . G5 . F#5 E5   E5 . . . C#5 . E5 .
        F#5 . . D5 B4 . D5 F#5  G5 . F#5 . E5 . D5 .
        E5 . . F#5 E5 . C#5 .   A4 . . . . . - -`,
    },
    { voice: { wave: 'square', duty: 0.25, vol: 0.13, a: 0.002, d: 0.06, s: 0.3, r: 0.03, gate: 0.6 }, step: 2, notes: FIELD_CHORDS.map((c) => STAB[c]).join(' ') },
    { voice: { wave: 'triangle', vol: 0.55, a: 0.003, d: 0.1, s: 0.7, r: 0.04, gate: 0.8 }, step: 2, notes: FIELD_CHORDS.map(bass8).join(' ') },
  ],
  drums: {
    vol: 0.5,
    hits: 'k+x . h . s . h k k . h . s . h . ' + rep('k . h . s . h k k . h . s . h .', 10) + ' k . h . s . s . t . t t s s s s',
  },
};

// ======================================================================================== battle
// A minor, 160 BPM, 8 bars (12 s). Driving: 16th-note octave bass, a fast arpeggio and a backbeat.
const BATTLE_CHORDS: [string, string[]][] = [
  ['A1', ['A4', 'C5', 'E5', 'A5']],
  ['A1', ['A4', 'C5', 'E5', 'A5']],
  ['F1', ['F4', 'A4', 'C5', 'F5']],
  ['G1', ['G4', 'B4', 'D5', 'G5']],
  ['A1', ['A4', 'C5', 'E5', 'A5']],
  ['A1', ['A4', 'C5', 'E5', 'A5']],
  ['F1', ['F4', 'A4', 'C5', 'F5']],
  ['E1', ['E4', 'G#4', 'B4', 'E5']],
];
const BATTLE: Song = {
  bpm: 160,
  bars: 8,
  tracks: [
    {
      voice: { wave: 'square', duty: 0.5, vol: 0.3, a: 0.003, d: 0.08, s: 0.65, r: 0.05, vib: [7, 0.15, 0.15] },
      step: 2,
      notes: `
        A4 . E5 . A5 . G5 E5   F5 . E5 D5 E5 . . .
        C5 . F5 . A5 . G5 F5   G5 . . D5 B4 . D5 .
        A5 . G5 . E5 . A5 .    C6 . B5 A5 G5 . E5 .
        F5 . A5 . C6 . A5 F5   G#5 . E5 . B4 . D5 E5`,
    },
    { voice: { wave: 'square', duty: 0.125, vol: 0.1, a: 0.001, d: 0.04, s: 0.4, r: 0.02, gate: 0.7 }, step: 1, notes: BATTLE_CHORDS.map(([, c]) => arp16(c)).join(' ') },
    { voice: { wave: 'triangle', vol: 0.6, a: 0.002, d: 0.05, s: 0.8, r: 0.02, gate: 0.7 }, step: 1, notes: BATTLE_CHORDS.map(([r]) => bass16(r)).join(' ') },
  ],
  drums: {
    vol: 0.55,
    hits: 'k+x . h k s . h . k k h . s . h h ' + rep('k . h k s . h . k k h . s . h h', 6) + ' k . h k s . h . s s t . t t s s',
  },
};

type Entry = NonNullable<ArtModule['sounds']>[number];
function M(id: string, title: string, song: Song, notes: string): Entry {
  return { def: { id, kind: 'music', title, file: `assets/audio/music/${id.replace(/^music_/, '')}.wav`, seconds: songSeconds(song), notes }, render: renderSong(song) };
}

export const ART: ArtModule = {
  sheets: [],
  sounds: [
    M('music_town', 'Town theme', TOWN, 'F major, 96 BPM, 8 bars. Calm and warm; loops seamlessly.'),
    M('music_field', 'Field theme', FIELD, 'D major, 140 BPM, 12 bars. Adventurous; loops seamlessly.'),
    M('music_battle', 'Battle theme', BATTLE, 'A minor, 160 BPM, 8 bars. Driving 16th-note bass; loops seamlessly.'),
  ],
};
