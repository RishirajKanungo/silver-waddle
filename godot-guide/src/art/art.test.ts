// Checks every sprite sheet and sound registered by src/art/data/*.ts: sizes, animation frames,
// tile indices, font coverage and sound sanity. Also pins the catalog the lessons rely on.
import { describe, it, expect } from 'vitest';
import { SHEETS, SOUNDS, renderSheet, renderSound } from './index';

const SR = 44100;

const REQUIRED_SHEETS: Record<string, string[]> = {
  hero: [], mage: [], guard: [],
  villager: ['idle_down', 'walk_down', 'walk_up', 'walk_side'],
  villager2: ['idle_down', 'walk_down', 'walk_up', 'walk_side'],
  slime: ['idle', 'hop', 'hurt', 'die'],
  bat: ['fly', 'hurt'],
  skeleton: ['idle', 'walk', 'windup', 'attack', 'hurt', 'die'],
  golem: ['idle', 'walk', 'windup', 'slam', 'hurt', 'stagger'],
  tiles_overworld: [], tiles_dungeon: [], tiles_platform: [],
  objects: ['save_crystal', 'coin'],
  fx_slash: ['play'], fx_hit: ['play'], fx_dust: ['play'], fx_fireball: ['play'], fx_ice: ['play'], fx_explosion: ['play'], fx_heal: ['play'], fx_stagger: ['play'], fx_levelup: ['play'],
  ui_panel: [], ui_cursor: [], ui_bars: [], icons: [], font_pixel: [],
};
const PARTY_ANIMS: Record<string, number> = {
  idle_down: 2, idle_up: 2, idle_side: 2,
  walk_down: 4, walk_up: 4, walk_side: 4,
  attack_down: 4, attack_up: 4, attack_side: 4,
  dash_down: 2, dash_up: 2, dash_side: 2,
  jump_down: 2, jump_side: 2,
  cast: 3, ko: 1, guard: 1,
};
const ENEMY_COUNTS: Record<string, Record<string, number>> = {
  slime: { idle: 3, hop: 4, hurt: 1, die: 4 },
  bat: { fly: 4, hurt: 1 },
  skeleton: { idle: 2, walk: 4, windup: 2, attack: 3, hurt: 1, die: 4 },
  golem: { idle: 2, walk: 4, windup: 3, slam: 3, hurt: 1, stagger: 2 },
};
const FX: Record<string, [number, number]> = {
  fx_slash: [32, 4], fx_hit: [16, 4], fx_dust: [16, 4], fx_fireball: [16, 4], fx_ice: [16, 4],
  fx_explosion: [32, 6], fx_heal: [16, 6], fx_stagger: [16, 4], fx_levelup: [32, 6],
};
const ICONS = ['sword', 'staff', 'mace', 'shield', 'helmet', 'armor', 'boots', 'ring', 'amulet', 'potion', 'ether', 'revive_feather', 'key', 'coin', 'bag', 'shard_fire', 'shard_ice', 'shard_bolt', 'shard_heal', 'shard_wind', 'shard_earth', 'gear_slot', 'skill_scroll', 'map'];
const SFX = ['sfx_swing', 'sfx_hit', 'sfx_crit', 'sfx_hurt', 'sfx_jump', 'sfx_land', 'sfx_dash', 'sfx_coin', 'sfx_chest', 'sfx_menu_move', 'sfx_menu_select', 'sfx_menu_back', 'sfx_cast', 'sfx_fire', 'sfx_ice', 'sfx_heal', 'sfx_explosion', 'sfx_stagger', 'sfx_atb_ready', 'sfx_levelup', 'sfx_footstep'];

const rendered = new Map<string, ReturnType<typeof renderSheet>>();
const img = (id: string) => {
  if (!rendered.has(id)) rendered.set(id, renderSheet(id));
  return rendered.get(id)!;
};
/** true if any pixel of frame `f` is not fully transparent */
function frameHasPixels(id: string, f: number) {
  const d = SHEETS[id];
  const im = img(id)!;
  const x0 = (f % d.cols) * d.frameW, y0 = Math.floor(f / d.cols) * d.frameH;
  for (let y = y0; y < y0 + d.frameH; y++) for (let x = x0; x < x0 + d.frameW; x++) if (im.data[(y * im.w + x) * 4 + 3] > 0) return true;
  return false;
}

describe('catalog', () => {
  it('has every required sheet and animation', () => {
    for (const [id, anims] of Object.entries(REQUIRED_SHEETS)) {
      expect(SHEETS[id], id).toBeTruthy();
      for (const a of anims) expect(SHEETS[id].anims?.[a], `${id}.${a}`).toBeTruthy();
    }
  });
  it('party sheets have the full move set with the right frame counts', () => {
    for (const id of ['hero', 'mage', 'guard']) {
      const d = SHEETS[id];
      expect(d.kind).toBe('character');
      expect([d.frameW, d.frameH]).toEqual([32, 32]);
      expect(d.origin).toBeTruthy();
      for (const [a, n] of Object.entries(PARTY_ANIMS)) expect(d.anims?.[a]?.frames.length, `${id}.${a}`).toBe(n);
      expect(d.anims!.hurt.frames.length).toBeGreaterThanOrEqual(1);
      expect(d.anims!.hurt.frames.length).toBeLessThanOrEqual(2);
      expect(d.anims!.walk_down.fps).toBeGreaterThanOrEqual(6);
      expect(d.anims!.walk_down.fps).toBeLessThanOrEqual(10);
      expect(d.anims!.attack_side.fps).toBeGreaterThanOrEqual(12);
      expect(d.anims!.attack_side.fps).toBeLessThanOrEqual(15);
    }
  });
  it('enemies have the specified sizes and frame counts', () => {
    expect([SHEETS.slime.frameW, SHEETS.bat.frameW, SHEETS.skeleton.frameW, SHEETS.golem.frameW]).toEqual([16, 16, 32, 48]);
    for (const [id, anims] of Object.entries(ENEMY_COUNTS)) for (const [a, n] of Object.entries(anims)) expect(SHEETS[id].anims?.[a]?.frames.length, `${id}.${a}`).toBe(n);
  });
  it('effects have one play animation with the specified frames', () => {
    for (const [id, [size, n]] of Object.entries(FX)) {
      const d = SHEETS[id];
      expect(d.kind).toBe('fx');
      expect([d.frameW, d.frameH]).toEqual([size, size]);
      expect(Object.keys(d.anims ?? {})).toEqual(['play']);
      expect(d.anims!.play.frames.length, id).toBe(n);
    }
  });
  it('tilesets are 16×16 with 16 columns and name the key tiles', () => {
    for (const id of ['tiles_overworld', 'tiles_dungeon', 'tiles_platform']) {
      const d = SHEETS[id];
      expect([d.frameW, d.frameH, d.cols]).toEqual([16, 16, 16]);
      expect(Object.keys(d.tiles ?? {}).length).toBeGreaterThan(10);
    }
    const ow = SHEETS.tiles_overworld.tiles!;
    for (const n of ['grass', 'grass2', 'grass3', 'flowers', 'tall_grass', 'path_c', 'path_tl', 'path_inner_tl', 'water', 'water_f2', 'water_f3', 'water_tl', 'cliff_t', 'cliff_face', 'cliff_base', 'stairs', 'tree_tl', 'tree_br', 'bush', 'rock', 'fence_m', 'bridge_m'])
      expect(ow[n], n).toBeDefined();
    // the three water frames sit in a row
    expect([ow.water_f2 - ow.water, ow.water_f3 - ow.water]).toEqual([1, 2]);
    const dg = SHEETS.tiles_dungeon.tiles!;
    for (const n of ['floor', 'floor2', 'wall_top_c', 'wall_face', 'wall_top_tl', 'pit_c', 'pit_t', 'stairs_down', 'door_closed', 'door_open', 'spikes_down', 'spikes_up', 'plate_up', 'plate_down', 'floor_cracked', 'torch', 'torch_f2'])
      expect(dg[n], n).toBeDefined();
    const pf = SHEETS.tiles_platform.tiles!;
    for (const n of ['ground_top', 'ground', 'ground_top_l', 'ground_r', 'oneway_m', 'ladder', 'spikes', 'bricks_bg', 'crate']) expect(pf[n], n).toBeDefined();
  });
  it('objects, icons and UI pieces are named', () => {
    const o = SHEETS.objects.tiles!;
    for (const n of ['chest_closed', 'chest_open', 'pot', 'crate', 'sign', 'lever_off', 'lever_on', 'save_crystal', 'coin', 'heart', 'key', 'switch_off', 'switch_on']) expect(o[n], n).toBeDefined();
    expect(SHEETS.objects.anims!.save_crystal.frames.length).toBe(4);
    expect(SHEETS.objects.anims!.coin.frames.length).toBe(4);
    for (const n of ICONS) expect(SHEETS.icons.tiles?.[n], n).toBeDefined();
    expect([SHEETS.ui_panel.frameW, SHEETS.ui_panel.frameH]).toEqual([24, 24]);
    expect([SHEETS.ui_cursor.frameW, SHEETS.ui_cursor.frameH]).toEqual([8, 8]);
    expect(Object.values(SHEETS.ui_cursor.anims!)[0].frames.length).toBe(2);
    expect([SHEETS.ui_bars.frameW, SHEETS.ui_bars.frameH, SHEETS.ui_bars.rows]).toEqual([48, 6, 7]);
  });
});

describe('sheets', () => {
  for (const id of Object.keys(SHEETS)) {
    it(`${id} renders at cols*frameW × rows*frameH`, () => {
      const d = SHEETS[id];
      const im = img(id);
      expect(im, id).toBeTruthy();
      expect(im!.w).toBe(d.cols * d.frameW);
      expect(im!.h).toBe(d.rows * d.frameH);
      expect(im!.data.length).toBe(im!.w * im!.h * 4);
      expect(d.file).toMatch(/^assets\/.+\.png$/);
    });
    it(`${id}: animation frames are in range and never empty`, () => {
      const d = SHEETS[id];
      const n = d.cols * d.rows;
      for (const [name, a] of Object.entries(d.anims ?? {})) {
        expect(a.frames.length, name).toBeGreaterThan(0);
        expect(a.fps, name).toBeGreaterThan(0);
        for (const f of a.frames) {
          expect(Number.isInteger(f) && f >= 0 && f < n, `${id}.${name} frame ${f}`).toBe(true);
          expect(frameHasPixels(id, f), `${id}.${name} frame ${f} is fully transparent`).toBe(true);
        }
      }
    });
    it(`${id}: tile indices are in range`, () => {
      const d = SHEETS[id];
      const n = d.cols * d.rows;
      for (const [name, i] of Object.entries(d.tiles ?? {})) expect(Number.isInteger(i) && i >= 0 && i < n, `${id} tile ${name} = ${i}`).toBe(true);
      if (d.kind !== 'font') for (const [name, i] of Object.entries(d.tiles ?? {})) expect(frameHasPixels(id, i), `${id} tile ${name} is empty`).toBe(true);
    });
  }
  it('every pixel is fully opaque or fully transparent (crisp pixel art)', () => {
    for (const id of Object.keys(SHEETS)) {
      const im = img(id)!;
      for (let i = 3; i < im.data.length; i += 4) if (im.data[i] !== 0 && im.data[i] !== 255) throw new Error(`${id} has partial alpha`);
    }
  });
  it('the font covers printable ASCII 32–126 with visible glyphs', () => {
    const d = SHEETS.font_pixel;
    expect([d.frameW, d.frameH]).toEqual([6, 8]);
    for (let c = 32; c <= 126; c++) {
      const ch = String.fromCharCode(c);
      const i = d.tiles?.[ch];
      expect(i, `glyph ${JSON.stringify(ch)}`).toBeDefined();
      expect(i! >= 0 && i! < d.cols * d.rows).toBe(true);
      if (ch !== ' ') expect(frameHasPixels('font_pixel', i!), `glyph ${ch} is empty`).toBe(true);
    }
    // glyphs are distinct
    const seen = new Set<string>();
    const im = img('font_pixel')!;
    for (let c = 33; c <= 126; c++) {
      const i = d.tiles![String.fromCharCode(c)];
      let key = '';
      for (let y = 0; y < 8; y++) for (let x = 0; x < 6; x++) key += im.data[(((Math.floor(i / 16) * 8 + y) * im.w + (i % 16) * 6 + x) * 4) + 3] ? '#' : '.';
      expect(seen.has(key), `glyph ${String.fromCharCode(c)} duplicates another`).toBe(false);
      seen.add(key);
    }
  });
  it('renders deterministically', () => {
    for (const id of ['hero', 'tiles_overworld', 'golem']) expect(Buffer.from(renderSheet(id)!.data).equals(Buffer.from(img(id)!.data))).toBe(true);
  });
});

describe('sounds', () => {
  it('has every required sound effect and the three music loops', () => {
    for (const id of SFX) expect(SOUNDS[id]?.kind, id).toBe('sfx');
    for (const id of ['music_town', 'music_field', 'music_battle']) expect(SOUNDS[id]?.kind, id).toBe('music');
    const len = (id: string) => SOUNDS[id].seconds;
    expect(len('music_town')).toBeGreaterThanOrEqual(16);
    expect(len('music_town')).toBeLessThanOrEqual(24);
    expect(len('music_field')).toBeGreaterThanOrEqual(16);
    expect(len('music_field')).toBeLessThanOrEqual(24);
    expect(len('music_battle')).toBeGreaterThanOrEqual(12);
    expect(len('music_battle')).toBeLessThanOrEqual(16);
  });
  for (const id of Object.keys(SOUNDS)) {
    it(`${id}: length, range and level`, () => {
      const d = SOUNDS[id];
      expect(d.file).toMatch(d.kind === 'music' ? /^assets\/audio\/music\/.+\.wav$/ : /^assets\/audio\/sfx\/.+\.wav$/);
      const s = renderSound(id, SR)!;
      expect(Math.abs(s.length - d.seconds * SR)).toBeLessThanOrEqual(1);
      let peak = 0, sum = 0;
      for (const v of s) {
        if (!Number.isFinite(v)) throw new Error(`${id}: non-finite sample`);
        peak = Math.max(peak, Math.abs(v));
        sum += v * v;
      }
      expect(peak).toBeLessThanOrEqual(1);
      expect(peak).toBeGreaterThan(0.1);
      expect(Math.sqrt(sum / s.length)).toBeGreaterThan(0.01);
      // deterministic
      expect(renderSound(id, SR)!.every((v, i) => v === s[i])).toBe(true);
    });
  }
  it('music loops join without a click', () => {
    for (const id of ['music_town', 'music_field', 'music_battle']) {
      const s = renderSound(id, SR)!;
      expect(Math.abs(s[s.length - 1] - s[0]), id).toBeLessThan(0.2);
    }
  });
});
