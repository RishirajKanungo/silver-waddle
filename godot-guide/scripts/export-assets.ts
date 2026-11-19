// Export every sprite sheet and sound defined in src/art/data/*.ts into the Godot starter project.
//   npm run assets      (node --experimental-strip-types scripts/export-assets.ts)
// PNGs are written with a minimal encoder (zlib from Node), sounds as 16-bit mono 44.1 kHz WAV.
import { registerHooks } from 'node:module';
import { deflateSync } from 'node:zlib';
import { mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import type { ArtModule, RGBAImage, SheetDef, SoundDef } from '../src/art/types.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
export const ROOT = resolve(HERE, '..');
export const DATA_DIR = join(ROOT, 'src/art/data');
export const STARTER = join(ROOT, 'godot/starter');
export const SAMPLE_RATE = 44100;

// The data modules use extension-less relative imports (as Vite and tsc expect). Node needs the
// file extension, so resolve './lib' to './lib.ts' when the bare specifier is not found.
registerHooks({
  resolve(specifier, context, nextResolve) {
    try {
      return nextResolve(specifier, context);
    } catch (e) {
      if (/^\.\.?\//.test(specifier) && !/\.[cm]?[jt]s$/.test(specifier)) return nextResolve(specifier + '.ts', context);
      throw e;
    }
  },
});

// ---------------------------------------------------------------------------------------------- PNG
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(buf: Uint8Array) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type: string, data: Uint8Array) {
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, 'ascii');
  Buffer.from(data).copy(out, 8);
  out.writeUInt32BE(crc32(out.subarray(4, 8 + data.length)), 8 + data.length);
  return out;
}
/** Encode an RGBA image as a truecolour+alpha PNG (filter 0 per row, zlib level 9). */
export function encodePNG(img: RGBAImage): Buffer {
  const { w, h, data } = img;
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (w * 4 + 1)] = 0;
    Buffer.from(data.buffer, data.byteOffset + y * w * 4, w * 4).copy(raw, y * (w * 4 + 1) + 1);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', new Uint8Array(0)),
  ]);
}

// ---------------------------------------------------------------------------------------------- WAV
/** 16-bit PCM mono WAV. Samples are clamped to [-1, 1]. */
export function encodeWAV(samples: Float32Array, sampleRate = SAMPLE_RATE): Buffer {
  const n = samples.length;
  const buf = Buffer.alloc(44 + n * 2);
  buf.write('RIFF', 0, 'ascii');
  buf.writeUInt32LE(36 + n * 2, 4);
  buf.write('WAVE', 8, 'ascii');
  buf.write('fmt ', 12, 'ascii');
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20); // PCM
  buf.writeUInt16LE(1, 22); // mono
  buf.writeUInt32LE(sampleRate, 24);
  buf.writeUInt32LE(sampleRate * 2, 28);
  buf.writeUInt16LE(2, 32);
  buf.writeUInt16LE(16, 34);
  buf.write('data', 36, 'ascii');
  buf.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++) {
    const s = Math.max(-1, Math.min(1, samples[i] || 0));
    buf.writeInt16LE(Math.round(s * 32767), 44 + i * 2);
  }
  return buf;
}

// ---------------------------------------------------------------------------------------------- load
/** Import every data module that exports ART (helper modules without ART are skipped). */
export async function loadModules(): Promise<{ file: string; art: ArtModule; icon?: () => RGBAImage }[]> {
  const files = readdirSync(DATA_DIR)
    .filter((f) => f.endsWith('.ts') && !f.endsWith('.test.ts') && !f.endsWith('.d.ts'))
    .sort();
  const out: { file: string; art: ArtModule; icon?: () => RGBAImage }[] = [];
  for (const f of files) {
    const m = (await import(pathToFileURL(join(DATA_DIR, f)).href)) as { ART?: ArtModule; PROJECT_ICON?: () => RGBAImage };
    if (m.ART) out.push({ file: f, art: m.ART, icon: m.PROJECT_ICON });
  }
  return out;
}

// ---------------------------------------------------------------------------------------------- docs
const LICENSE = `Shardbound starter assets
=========================

All images and sounds in this folder are original work, drawn and synthesized in code for the
"Godot 4 game development" guide (the Shardbound course). They are dedicated to the public domain
under CC0 1.0 Universal.

You can copy, modify, distribute and use them, including for commercial games, without asking
permission and without attribution (credit is appreciated but not required).

CC0 1.0 Universal (CC0 1.0) Public Domain Dedication
https://creativecommons.org/publicdomain/zero/1.0/

The person who associated a work with this deed has dedicated the work to the public domain by
waiving all of his or her rights to the work worldwide under copyright law, including all related
and neighboring rights, to the extent allowed by law. You can copy, modify, distribute and perform
the work, even for commercial purposes, all without asking permission.

In no way are the patent or trademark rights of any person affected by CC0, nor are the rights that
other persons may have in the work or in how the work is used, such as publicity or privacy rights.
Unless expressly stated otherwise, the person who associated a work with this deed makes no
warranties about the work, and disclaims liability for all uses of the work, to the fullest extent
permitted by applicable law. When using or citing the work, you should not imply endorsement by the
author or the affirmer.
`;

function readme(sheets: SheetDef[], sounds: SoundDef[]) {
  const L: string[] = [];
  L.push('# Shardbound assets', '');
  L.push('Original pixel art and sound for the Shardbound starter project, generated by `npm run assets` from', '`src/art/data/*.ts` in the guide. Released as CC0 (see `LICENSE.txt`).', '');
  L.push('## Importing', '');
  L.push('- The project already sets **Rendering > Textures > Canvas Textures > Default Texture Filter** to *Nearest*, so pixels stay crisp.');
  L.push('- Sprite sheets are grids. In a `SpriteFrames` resource use *Add frames from sprite sheet* and enter the grid size from the table (horizontal × vertical).');
  L.push('- Frame indices are row-major: `index = row * columns + column`. Side-facing animations face **right**; set `flip_h` for left.');
  L.push('- Characters have their pivot at the feet (`origin`). Set the `AnimatedSprite2D` offset to `-origin` (or `centered = false` and `offset = -origin`).');
  L.push('- Tilesets are 16×16 tiles, 16 per row. Create a `TileSet` with tile size 16×16 and add the PNG as an atlas source.');
  L.push('');
  const kinds: [string, string][] = [['character', 'Party'], ['npc', 'People'], ['enemy', 'Enemies'], ['tileset', 'Tilesets'], ['object', 'Objects'], ['fx', 'Effects'], ['ui', 'Interface'], ['icon', 'Icons'], ['font', 'Font']];
  for (const [k, title] of kinds) {
    const list = sheets.filter((s) => s.kind === k);
    if (!list.length) continue;
    L.push(`## ${title}`, '');
    for (const s of list) {
      L.push(`### \`${s.id}\`: ${s.title}`, '');
      L.push(`- File: \`${s.file}\` (${s.frameW * s.cols}×${s.frameH * s.rows} px)`);
      L.push(`- Frames: ${s.frameW}×${s.frameH} px, grid ${s.cols} × ${s.rows}${s.origin ? `, origin (${s.origin[0]}, ${s.origin[1]})` : ''}`);
      if (s.notes) L.push(`- ${s.notes}`);
      if (s.anims && Object.keys(s.anims).length) {
        L.push('', '| animation | frames | fps | loop |', '|---|---|---|---|');
        for (const [n, a] of Object.entries(s.anims)) L.push(`| \`${n}\` | ${a.frames.join(', ')} | ${a.fps} | ${a.loop ? 'yes' : 'no'} |`);
      }
      if (s.tiles && Object.keys(s.tiles).length && s.kind !== 'font') {
        L.push('', '<details><summary>Named tiles (index: column, row)</summary>', '');
        L.push(Object.entries(s.tiles).map(([n, i]) => `\`${n}\` = ${i} (${i % s.cols}, ${Math.floor(i / s.cols)})`).join(' · '));
        L.push('', '</details>');
      }
      if (s.kind === 'font') L.push('- Glyph for character code `c` is frame `c - 32` (printable ASCII 32–126).');
      L.push('');
    }
  }
  for (const [k, title] of [['sfx', 'Sound effects'], ['music', 'Music']] as const) {
    const list = sounds.filter((s) => s.kind === k);
    if (!list.length) continue;
    L.push(`## ${title}`, '', '| id | file | length | notes |', '|---|---|---|---|');
    for (const s of list) L.push(`| \`${s.id}\` | \`${s.file}\` | ${s.seconds.toFixed(2)} s | ${s.notes ?? ''} |`);
    L.push('');
  }
  if (sounds.some((s) => s.kind === 'music'))
    L.push('Music files loop seamlessly: in the import dock set **Loop Mode** to *Forward* (or enable `loop` on the `AudioStreamWAV`) and re-import.', '');
  return L.join('\n');
}

// ---------------------------------------------------------------------------------------------- main
async function main() {
  const mods = await loadModules();
  const sheets: SheetDef[] = [];
  const sounds: SoundDef[] = [];
  const seen = new Set<string>();
  let bytes = 0;
  for (const { file, art } of mods) {
    for (const s of art.sheets) {
      if (seen.has(s.def.id)) throw new Error(`duplicate id ${s.def.id} (${file})`);
      seen.add(s.def.id);
      const img = s.render();
      if (img.w !== s.def.cols * s.def.frameW || img.h !== s.def.rows * s.def.frameH) throw new Error(`${s.def.id}: rendered ${img.w}×${img.h}, expected ${s.def.cols * s.def.frameW}×${s.def.rows * s.def.frameH}`);
      const out = join(STARTER, s.def.file);
      mkdirSync(dirname(out), { recursive: true });
      const png = encodePNG(img);
      writeFileSync(out, png);
      bytes += png.length;
      sheets.push(s.def);
    }
    for (const s of art.sounds ?? []) {
      if (seen.has(s.def.id)) throw new Error(`duplicate id ${s.def.id} (${file})`);
      seen.add(s.def.id);
      const out = join(STARTER, s.def.file);
      mkdirSync(dirname(out), { recursive: true });
      const wav = encodeWAV(s.render(SAMPLE_RATE));
      writeFileSync(out, wav);
      bytes += wav.length;
      sounds.push(s.def);
    }
  }
  writeFileSync(join(STARTER, 'assets/LICENSE.txt'), LICENSE);
  writeFileSync(join(STARTER, 'assets/README.md'), readme(sheets, sounds));
  // the project icon (res://icon.png) comes from the module that exports PROJECT_ICON
  const iconMod = mods.find((m) => m.icon);
  if (iconMod?.icon) writeFileSync(join(STARTER, 'icon.png'), encodePNG(iconMod.icon()));
  console.log(`exported ${sheets.length} sheets and ${sounds.length} sounds (${(bytes / 1024).toFixed(0)} KiB) to ${STARTER}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
