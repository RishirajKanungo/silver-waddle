// The asset contract shared by lessons, figures and the PNG/WAV exporter.
// Every asset is original to this guide (CC0). Pixel data lives in src/art/data/*.ts and is pure
// (no DOM), so the same code renders previews in the browser and writes PNGs for Godot.

export type AssetKind = 'character' | 'enemy' | 'npc' | 'tileset' | 'object' | 'fx' | 'ui' | 'icon' | 'font';

export interface AnimDef {
  /** frame indices into the sheet, row-major (index = row * cols + col) */
  frames: number[];
  fps: number;
  loop: boolean;
}

export interface SheetDef {
  id: string;
  kind: AssetKind;
  title: string;
  /** path inside the Godot starter project, e.g. 'assets/characters/kai.png' */
  file: string;
  frameW: number;
  frameH: number;
  cols: number;
  rows: number;
  /** named animations, e.g. walk_down, walk_up, walk_side (faces right; flip for left) */
  anims?: Record<string, AnimDef>;
  /** pivot inside a frame (usually the feet), in frame pixels */
  origin?: [number, number];
  /** one or two sentences: what it is and how to import/use it */
  notes?: string;
  /** for tilesets: names of notable tiles by index */
  tiles?: Record<string, number>;
}

export interface SoundDef {
  id: string;
  kind: 'sfx' | 'music';
  title: string;
  /** path inside the Godot starter project, e.g. 'assets/audio/sfx/hit.wav' */
  file: string;
  seconds: number;
  notes?: string;
}

export interface RGBAImage {
  w: number;
  h: number;
  data: Uint8ClampedArray; // RGBA, row-major
}

/** what an art data module exports */
export interface ArtModule {
  sheets: { def: SheetDef; render: () => RGBAImage }[];
  sounds?: { def: SoundDef; render: (sampleRate: number) => Float32Array }[];
}
