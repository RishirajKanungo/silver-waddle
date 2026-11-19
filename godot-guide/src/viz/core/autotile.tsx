// core.autotile: paint water onto grass and see which tile each cell gets from its peering bits.
// Three terrain modes, as in a Godot TileSet terrain set:
//   'corners' (Match Corners): each cell's tile is chosen by which of its 4 corners are water. Painting
//     a cell makes its 4 corners water, so its 8 neighbours turn into transition tiles. Drawn with the
//     real 15+1-tile water terrain from tiles_overworld.
//   'sides' (Match Sides): 4 side bits, 16 tiles. 'blob' (Match Corners and Sides): 8 bits with a corner
//     only counting when both sides next to it are water, 47 tiles. These two are drawn procedurally.
import { useEffect, useMemo, useRef, useState } from 'react';
import type { VizSpec } from '../../content/types';
import { drawFrame, SHEETS, theme } from '../game';
import { SegControl, Readout, FigureLayout, Toggle } from '../kit';
import { CodeBlock } from '../../ui/GameCells';
import './motion.css';

const CW = 14, CH = 8, T = 16;
type Mode = 'corners' | 'sides' | 'blob';

// corner bits: TL=1, TR=2, BL=4, BR=8 (water at that corner)
const CORNER_TILE: Record<number, string> = {
  0: 'grass', 15: 'water_c', 8: 'water_tl', 4: 'water_tr', 2: 'water_bl', 1: 'water_br', 12: 'water_t', 3: 'water_b', 10: 'water_l', 5: 'water_r',
  7: 'water_inner_tl', 11: 'water_inner_tr', 13: 'water_inner_bl', 14: 'water_inner_br', 9: 'water_diag_a', 6: 'water_diag_b',
};
// neighbour bits for sides/blob: N=1, E=2, S=4, W=8, NE=16, SE=32, SW=64, NW=128
const NB: [number, number, number][] = [
  [0, -1, 1], [1, 0, 2], [0, 1, 4], [-1, 0, 8], [1, -1, 16], [1, 1, 32], [-1, 1, 64], [-1, -1, 128],
];
/** In blob mode a corner only counts when both sides next to it are water (that is what reduces 256 to 47). */
function reduceBlob(m: number) {
  let r = m & 15;
  if (m & 16 && m & 1 && m & 2) r |= 16;
  if (m & 32 && m & 2 && m & 4) r |= 32;
  if (m & 64 && m & 4 && m & 8) r |= 64;
  if (m & 128 && m & 8 && m & 1) r |= 128;
  return r;
}
const BLOB_SET = (() => {
  const s = new Set<number>();
  for (let m = 0; m < 256; m++) s.add(reduceBlob(m));
  return [...s].sort((a, b) => a - b);
})();

const START = [
  '..............',
  '..##..........',
  '..####....#...',
  '...###...###..',
  '....#.....#...',
  '..........##..',
  '..............',
  '..............',
];

export function AutotileLab({ spec }: { spec: VizSpec }) {
  const [mode, setMode] = useState<Mode>((spec.mode as Mode) ?? 'corners');
  const [cells, setCells] = useState<boolean[]>(() => START.join('').split('').map((c) => c === '#'));
  const [erase, setErase] = useState(false);
  const [showBits, setShowBits] = useState(true);
  const [sel, setSel] = useState<[number, number]>([3, 3]);
  const cv = useRef<HTMLCanvasElement>(null);
  const painting = useRef<boolean | null>(null);

  const at = (x: number, y: number) => x >= 0 && y >= 0 && x < CW && y < CH && cells[y * CW + x];
  // corners mode: a corner is water when any painted cell touches it (painting a cell sets its 4 corners)
  const cornerWater = (vx: number, vy: number) => at(vx - 1, vy - 1) || at(vx, vy - 1) || at(vx - 1, vy) || at(vx, vy);
  const cornerMask = (x: number, y: number) => (cornerWater(x, y) ? 1 : 0) | (cornerWater(x + 1, y) ? 2 : 0) | (cornerWater(x, y + 1) ? 4 : 0) | (cornerWater(x + 1, y + 1) ? 8 : 0);
  const nbMask = (x: number, y: number) => NB.reduce((m, [dx, dy, b]) => (at(x + dx, y + dy) ? m | b : m), 0);
  const cellMask = (x: number, y: number) => (mode === 'corners' ? cornerMask(x, y) : mode === 'sides' ? nbMask(x, y) & 15 : reduceBlob(nbMask(x, y)));
  const isTerrain = (x: number, y: number) => (mode === 'corners' ? cornerMask(x, y) !== 0 : at(x, y));

  useEffect(() => {
    const ctx = cv.current?.getContext('2d');
    if (!ctx) return;
    const th = theme(cv.current);
    ctx.imageSmoothingEnabled = false;
    const tiles = SHEETS['tiles_overworld']?.tiles ?? {};
    const grass = (x: number, y: number) => {
      if (tiles.grass !== undefined) drawFrame(ctx, 'tiles_overworld', [tiles.grass, tiles.grass2 ?? tiles.grass, tiles.grass3 ?? tiles.grass][(x * 7 + y * 13) % 3], x * T, y * T);
      else {
        ctx.fillStyle = (x + y) % 2 ? '#5a8f4e' : '#548848';
        ctx.fillRect(x * T, y * T, T, T);
      }
    };
    for (let y = 0; y < CH; y++)
      for (let x = 0; x < CW; x++) {
        const m = cellMask(x, y);
        if (mode === 'corners') {
          const name = CORNER_TILE[m];
          if (m === 0 || tiles[name] === undefined) grass(x, y);
          if (m !== 0 && tiles[name] !== undefined) drawFrame(ctx, 'tiles_overworld', tiles[name], x * T, y * T);
          else if (m !== 0) drawQuads(ctx, x, y, m);
        } else {
          grass(x, y);
          if (at(x, y)) drawShape(ctx, x, y, m, mode);
        }
      }
    // grid and the selected cell's bits
    ctx.fillStyle = 'rgba(0,0,0,0.18)';
    for (let x = 1; x < CW; x++) ctx.fillRect(x * T, 0, 1, CH * T);
    for (let y = 1; y < CH; y++) ctx.fillRect(0, y * T, CW * T, 1);
    const [sx, sy] = sel;
    ctx.strokeStyle = th.accent;
    ctx.lineWidth = 1;
    ctx.strokeRect(sx * T + 0.5, sy * T + 0.5, T - 1, T - 1);
    if (showBits && isTerrain(sx, sy)) {
      const m = cellMask(sx, sy);
      const dot = (px: number, py: number, on: boolean) => {
        ctx.fillStyle = on ? '#fff09a' : '#1a1424';
        ctx.fillRect(sx * T + px - 1, sy * T + py - 1, 3, 3);
      };
      if (mode === 'corners') {
        dot(1, 1, !!(m & 1));
        dot(14, 1, !!(m & 2));
        dot(1, 14, !!(m & 4));
        dot(14, 14, !!(m & 8));
      } else {
        dot(8, 1, !!(m & 1));
        dot(14, 8, !!(m & 2));
        dot(8, 14, !!(m & 4));
        dot(1, 8, !!(m & 8));
        if (mode === 'blob') {
          dot(14, 1, !!(m & 16));
          dot(14, 14, !!(m & 32));
          dot(1, 14, !!(m & 64));
          dot(1, 1, !!(m & 128));
        }
      }
    }
  });

  const cellAt = (e: React.PointerEvent): [number, number] | null => {
    const r = cv.current!.getBoundingClientRect();
    const x = Math.floor(((e.clientX - r.left) / r.width) * CW), y = Math.floor(((e.clientY - r.top) / r.height) * CH);
    return x >= 0 && y >= 0 && x < CW && y < CH ? [x, y] : null;
  };
  const paint = (c: [number, number], v: boolean) => {
    setSel(c);
    setCells((old) => {
      const i = c[1] * CW + c[0];
      if (old[i] === v) return old;
      const n = old.slice();
      n[i] = v;
      return n;
    });
  };

  const [sx, sy] = sel;
  const m = cellMask(sx, sy);
  const terrain = isTerrain(sx, sy);
  const used = useMemo(() => {
    const s = new Set<number>();
    for (let y = 0; y < CH; y++) for (let x = 0; x < CW; x++) if (isTerrain(x, y)) s.add(cellMask(x, y));
    return s.size;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cells, mode]);
  const total = mode === 'corners' ? 15 : mode === 'sides' ? 16 : 47;
  const tileName = mode === 'corners' ? (m ? CORNER_TILE[m] : 'grass') : mode === 'sides' ? `sides #${m}` : `blob #${BLOB_SET.indexOf(m)}`;
  const bitCells: [string, number | null][] =
    mode === 'corners'
      ? [['TL', 1], ['', null], ['TR', 2], ['', null], ['self', -1], ['', null], ['BL', 4], ['', null], ['BR', 8]]
      : [['NW', mode === 'blob' ? 128 : null], ['N', 1], ['NE', mode === 'blob' ? 16 : null], ['W', 8], ['self', -1], ['E', 2], ['SW', mode === 'blob' ? 64 : null], ['S', 4], ['SE', mode === 'blob' ? 32 : null]];

  const code = `# scripts/water_painter.gd (attach to the TileMapLayer)
extends TileMapLayer

const WATER_SET := 0   # terrain set index in the TileSet
const WATER := 0       # terrain index inside that set (${mode === 'corners' ? 'Match Corners' : mode === 'sides' ? 'Match Sides' : 'Match Corners and Sides'})

func paint_water(cells: Array[Vector2i]) -> void:
	# Godot picks, for these cells and their neighbours, the tiles whose peering bits match.
	set_cells_terrain_connect(cells, WATER_SET, WATER)
`;

  return (
    <FigureLayout
      side={
        <>
          <SegControl
            label="mode"
            value={mode}
            onChange={setMode}
            options={[
              { v: 'corners', label: 'corners' },
              { v: 'sides', label: 'sides' },
              { v: 'blob', label: 'corners + sides' },
            ]}
          />
          <Toggle label="erase instead of paint" value={erase} onChange={setErase} />
          <Toggle label="show peering bits on the selected cell" value={showBits} onChange={setShowBits} />
          <div className="core-m-row">
            <div className="core-m-bits" aria-label="peering bits of the selected cell">
              {bitCells.map(([l, b], i) => (
                <span key={i} className={b === -1 ? (terrain ? 'self' : '') : b === null ? 'off' : m & b ? 'on' : ''}>
                  {b === -1 ? (mode === 'corners' ? '' : terrain ? 'W' : 'G') : l}
                </span>
              ))}
            </div>
            <div className="core-m-note">
              cell ({sx}, {sy})<br />
              bits {m.toString(2).padStart(mode === 'blob' ? 8 : 4, '0')}
              <br />
              <b>{terrain ? tileName : 'grass (not terrain)'}</b>
            </div>
          </div>
          <Readout
            rows={[
              ['\\text{tiles a full set needs}', String(total)],
              ['\\text{different tiles on the map}', String(used)],
            ]}
          />
        </>
      }
      below={<CodeBlock code={code} file="scripts/water_painter.gd" compact />}
    >
      <canvas
        ref={cv}
        width={CW * T}
        height={CH * T}
        className="core-m-svg"
        style={{ imageRendering: 'pixelated', maxWidth: 520, cursor: 'crosshair' }}
        aria-label="autotiling grid: click or drag to paint water"
        onPointerDown={(e) => {
          const c = cellAt(e);
          if (!c) return;
          (e.target as Element).setPointerCapture?.(e.pointerId);
          painting.current = !erase;
          paint(c, !erase);
        }}
        onPointerMove={(e) => {
          if (painting.current === null) return;
          const c = cellAt(e);
          if (c) paint(c, painting.current);
        }}
        onPointerUp={() => (painting.current = null)}
        onPointerCancel={() => (painting.current = null)}
      />
    </FigureLayout>
  );
}

const WATER = '#2e6aa8', SHORE = '#dcb47a', FOAM = '#9aeaee';
/** corners mode without art: fill the water quarter of each wet corner */
function drawQuads(ctx: CanvasRenderingContext2D, x: number, y: number, m: number) {
  ctx.fillStyle = WATER;
  if (m & 1) ctx.fillRect(x * T, y * T, 8, 8);
  if (m & 2) ctx.fillRect(x * T + 8, y * T, 8, 8);
  if (m & 4) ctx.fillRect(x * T, y * T + 8, 8, 8);
  if (m & 8) ctx.fillRect(x * T + 8, y * T + 8, 8, 8);
}
/** sides/blob: the water shape implied by the bits, with a sandy shore where a side is dry */
function drawShape(ctx: CanvasRenderingContext2D, x: number, y: number, m: number, mode: Mode) {
  const X = x * T, Y = y * T;
  ctx.fillStyle = SHORE;
  ctx.fillRect(X + 2, Y + 2, 12, 12);
  ctx.fillStyle = WATER;
  ctx.fillRect(X + 4, Y + 4, 8, 8);
  if (m & 1) ctx.fillRect(X + 4, Y, 8, 4);
  if (m & 2) ctx.fillRect(X + 12, Y + 4, 4, 8);
  if (m & 4) ctx.fillRect(X + 4, Y + 12, 8, 4);
  if (m & 8) ctx.fillRect(X, Y + 4, 4, 8);
  const corner = (bit: number, s1: number, s2: number, cx: number, cy: number) => {
    const full = mode === 'blob' ? m & bit : m & s1 && m & s2 && 0;
    if (m & s1 && m & s2) {
      ctx.fillStyle = full ? WATER : SHORE;
      ctx.fillRect(X + cx, Y + cy, 4, 4);
      if (!full) {
        ctx.fillStyle = WATER;
        ctx.fillRect(X + cx + (cx ? 0 : 2), Y + cy + (cy ? 0 : 2), 2, 2);
      }
    }
  };
  corner(16, 1, 2, 12, 0);
  corner(32, 2, 4, 12, 12);
  corner(64, 4, 8, 0, 12);
  corner(128, 8, 1, 0, 0);
  // shore foam on dry sides
  ctx.fillStyle = FOAM;
  if (!(m & 1)) ctx.fillRect(X + 4, Y + 4, 8, 1);
  if (!(m & 4)) ctx.fillRect(X + 4, Y + 11, 8, 1);
  if (!(m & 8)) ctx.fillRect(X + 4, Y + 4, 1, 8);
  if (!(m & 2)) ctx.fillRect(X + 11, Y + 4, 1, 8);
}
