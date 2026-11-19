// Small shared pieces for the rpg.* figures: animated portraits, item icons from the `icons`
// sheet (with name aliases so the figures work whatever the art agent calls each icon), and a
// listing that highlights the lines that are "running".
import { useEffect, useRef } from 'react';
import { SHEETS, drawFrame, animFrame } from '../game';
import './rpg.css';

/** An animated sprite in a small canvas (party portraits, enemies). */
export function Sprite({ sheet, anim, scale = 2, flip = false, frame, size, title }: { sheet: string; anim?: string; scale?: number; flip?: boolean; frame?: number; size?: [number, number]; title?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const def = SHEETS[sheet];
  const fw = def?.frameW ?? 32, fh = def?.frameH ?? 32;
  const w = size?.[0] ?? fw * scale, h = size?.[1] ?? fh * scale;
  useEffect(() => {
    let raf = 0;
    const t0 = performance.now();
    const loop = () => {
      const c = ref.current;
      if (!c) return;
      const ctx = c.getContext('2d')!;
      ctx.clearRect(0, 0, c.width, c.height);
      ctx.imageSmoothingEnabled = false;
      const t = (performance.now() - t0) / 1000;
      const f = frame ?? (anim ? animFrame(sheet, anim, t) : 0);
      drawFrame(ctx, sheet, f, (w - fw * scale) / 2, h - fh * scale, { scale, flipH: flip });
      if (anim && frame === undefined) raf = requestAnimationFrame(loop);
    };
    loop();
    return () => cancelAnimationFrame(raf);
  }, [sheet, anim, scale, flip, frame, w, h, fw, fh]);
  return <canvas ref={ref} width={w} height={h} className="rpg-sprite" style={{ width: w, height: h }} aria-label={title ?? sheet} />;
}

// Icon names the figures ask for, each with the spellings the icons sheet might use.
const ICON_ALIASES: Record<string, string[]> = {
  potion: ['potion', 'potion_red', 'hp_potion', 'health_potion'],
  ether: ['ether', 'potion_blue', 'mp_potion', 'mana_potion'],
  hi_potion: ['hi_potion', 'potion_big', 'potion_green', 'potion'],
  antidote: ['antidote', 'herb', 'potion_green', 'leaf'],
  phoenix: ['phoenix', 'feather', 'phoenix_down', 'revive'],
  gel: ['gel', 'slime_gel', 'slime', 'goo', 'material'],
  bone: ['bone', 'bones', 'skull'],
  wing: ['wing', 'bat_wing', 'feather'],
  ore: ['ore', 'stone', 'rock', 'gem'],
  key: ['key', 'key_gold', 'old_key'],
  map: ['map', 'scroll', 'letter'],
  coin: ['coin', 'gold', 'coins', 'money'],
  shard: ['shard', 'gem', 'crystal', 'materia'],
  sword: ['sword', 'weapon'],
  staff: ['staff', 'rod', 'wand'],
  mace: ['mace', 'hammer', 'club'],
  armour: ['armour', 'armor', 'chest', 'mail', 'shield'],
  robe: ['robe', 'cloth', 'armour', 'armor'],
  ring: ['ring'],
  amulet: ['amulet', 'necklace', 'charm', 'ring'],
  chest: ['chest', 'chest_closed'],
};
function hash(s: string) {
  let h = 0;
  for (const ch of s) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return h;
}
/** The frame index of an icon in the `icons` sheet. Falls back to a stable frame per name. */
export function iconFrame(name: string): number {
  const def = SHEETS['icons'];
  const tiles = def?.tiles;
  if (tiles) {
    for (const a of ICON_ALIASES[name] ?? [name]) if (tiles[a] !== undefined) return tiles[a];
    if (tiles[name] !== undefined) return tiles[name];
  }
  const n = Math.max(1, (def?.cols ?? 8) * (def?.rows ?? 4));
  return hash(name) % n;
}

/** A 16×16 icon from the icons sheet, drawn at an integer scale. */
export function Icon({ name, scale = 2, title }: { name: string; scale?: number; title?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const def = SHEETS['icons'];
  const fw = def?.frameW ?? 16, fh = def?.frameH ?? 16;
  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const ctx = c.getContext('2d')!;
    ctx.clearRect(0, 0, c.width, c.height);
    ctx.imageSmoothingEnabled = false;
    drawFrame(ctx, 'icons', iconFrame(name), 0, 0, { scale });
  }, [name, scale]);
  return <canvas ref={ref} width={fw * scale} height={fh * scale} className="rpg-icon" style={{ width: fw * scale, height: fh * scale }} aria-label={title ?? name} />;
}

/** A GDScript listing with some lines highlighted (the ones the current step runs). */
export function LiveListing({ lines, active, file, comments }: { lines: string[]; active: Set<number>; file: string; comments?: Record<number, string> }) {
  const pre = useRef<HTMLPreElement>(null);
  const first = Math.min(...active);
  useEffect(() => {
    // keep the running lines visible inside the scrolling listing (without scrolling the page)
    const el = pre.current;
    const row = el?.children[first] as HTMLElement | undefined;
    if (!el || !row) return;
    const top = row.offsetTop;
    if (top < el.scrollTop || top > el.scrollTop + el.clientHeight - 60) el.scrollTop = Math.max(0, top - 40);
  }, [first]);
  return (
    <div className="rpg-listing" role="region" aria-label={file}>
      <div className="rpg-listing-head">{file}</div>
      <pre ref={pre}>
        {lines.map((l, i) => (
          <div key={i} className={'rpg-ll' + (active.has(i) ? ' on' : '')}>
            <span className="rpg-ln">{i + 1}</span>
            <span className="rpg-lc">{l.replace(/\t/g, '    ') || ' '}</span>
            {comments?.[i] && active.has(i) && <span className="rpg-lnote">{comments[i]}</span>}
          </div>
        ))}
      </pre>
    </div>
  );
}

/** Signed difference formatted for "+3" / "−2". */
export const signed = (d: number) => (d > 0 ? `+${d}` : d < 0 ? `−${-d}` : '0');
