// rpg.menu_focus — gamepad focus in the pause menu (r05-2). Mirrors ui/pause_menu.gd:
//   open(): paused = true; _focus_silently(items_button)
//   ui_cancel: back() → focus returns to _return_to (Items) or the menu closes
//   Items: _set_grid_focusable(true); _focus_silently(slot 0)
//   _wire_grid(): explicit focus_neighbor_* with wrap (posmod); without them, the figure searches the
//   nearest focusable control in the pressed direction (an approximation of Godot's fallback search).
import { useMemo, useRef, useState } from 'react';
import type { VizSpec } from '../../content/types';
import { GameCanvas, Keys, theme, rect, text, drawFrame, playSound, SHEETS, type Input } from '../game';
import { Toggle, Readout, FigureLayout } from '../kit';
import { CodeBlock } from '../../ui/GameCells';
import { W, H, drawNine, drawCursor, drawGround, drawActor } from './common';

interface Ctl {
  id: string;
  label: string;
  x: number;
  y: number;
  w: number;
  h: number;
  kind: 'command' | 'slot';
  icon?: string;
  desc?: string;
}
const COMMANDS = ['Items', 'Equip', 'Shards', 'Save', 'Resume'];
const ITEMS: [string, string, string][] = [
  ['potion', 'Potion', 'Restores 50 HP.'],
  ['ether', 'Ether', 'Restores 20 MP.'],
  ['revive_feather', 'Revival Feather', 'Revives a fallen ally.'],
  ['potion', 'Greater Potion', 'Restores 150 HP.'],
  ['sword', 'Iron Sword', 'Kai. ATK +6.'],
  ['staff', 'Oak Staff', 'Lyra. MAG +5.'],
  ['mace', 'Flanged Mace', 'Bram. ATK +7.'],
  ['shield', 'Buckler', 'Bram. DEF +4.'],
  ['helmet', 'Leather Cap', 'DEF +2.'],
  ['armor', 'Chain Vest', 'DEF +5.'],
  ['ring', 'Silver Ring', 'MAG +2.'],
  ['amulet', 'Moon Charm', 'Resist ice.'],
];
const COLS = 4;
const CMD_X = 8, CMD_Y = 8;
const GRID_X = 96, GRID_Y = 22, SLOT = 22, GAP = 6;
const CTLS: Ctl[] = [
  ...COMMANDS.map((label, i) => ({ id: 'cmd' + i, label, x: CMD_X + 6, y: CMD_Y + 6 + i * 12, w: 60, h: 12, kind: 'command' as const })),
  ...ITEMS.map(([icon, label, desc], i) => ({
    id: 'slot' + i,
    label,
    icon,
    desc,
    x: GRID_X + (i % COLS) * (SLOT + GAP),
    y: GRID_Y + Math.floor(i / COLS) * (SLOT + GAP),
    w: SLOT,
    h: SLOT,
    kind: 'slot' as const,
  })),
];
const BY_ID = Object.fromEntries(CTLS.map((c) => [c.id, c]));
type Dir = 'left' | 'right' | 'up' | 'down';
const DIRS: Dir[] = ['left', 'up', 'right', 'down'];
const DV: Record<Dir, [number, number]> = { left: [-1, 0], right: [1, 0], up: [0, -1], down: [0, 1] };
const GODOT_NAME: Record<Dir, string> = { left: 'focus_neighbor_left', up: 'focus_neighbor_top', right: 'focus_neighbor_right', down: 'focus_neighbor_bottom' };
const posmod = (a: number, n: number) => ((a % n) + n) % n;

/** _wire_grid() and the command list's wrap, as explicit neighbours. null = stay put. */
function explicitNeighbour(c: Ctl, d: Dir, wrap: boolean): string | null {
  if (c.kind === 'command') {
    const i = parseInt(c.id.slice(3));
    if (d === 'left' || d === 'right') return null;
    const j = i + (d === 'down' ? 1 : -1);
    if (j < 0 || j >= COMMANDS.length) return wrap ? 'cmd' + posmod(j, COMMANDS.length) : null;
    return 'cmd' + j;
  }
  const i = parseInt(c.id.slice(4));
  const n = ITEMS.length, rows = Math.ceil(n / COLS);
  const r = Math.floor(i / COLS), col = i % COLS;
  const [dx, dy] = DV[d];
  let nr = r + dy, nc = col + dx;
  if (nr < 0 || nr >= rows || nc < 0 || nc >= COLS) {
    if (!wrap) return null;
    nr = posmod(nr, rows);
    nc = posmod(nc, COLS);
  }
  return 'slot' + Math.min(nr * COLS + nc, n - 1);
}
/** fallback: the nearest focusable control whose rectangle lies in that direction */
function searchNeighbour(c: Ctl, d: Dir, focusable: (x: Ctl) => boolean): string | null {
  const [dx, dy] = DV[d];
  const cx = c.x + c.w / 2, cy = c.y + c.h / 2;
  let best: string | null = null, bestScore = Infinity;
  for (const o of CTLS) {
    if (o === c || !focusable(o)) continue;
    // must be beyond the focused control's edge in that direction
    const beyond = dx < 0 ? o.x + o.w <= c.x + 1 : dx > 0 ? o.x >= c.x + c.w - 1 : dy < 0 ? o.y + o.h <= c.y + 1 : o.y >= c.y + c.h - 1;
    if (!beyond) continue;
    const ox = o.x + o.w / 2, oy = o.y + o.h / 2;
    const along = (ox - cx) * dx + (oy - cy) * dy;
    const across = Math.abs((ox - cx) * dy) + Math.abs((oy - cy) * dx);
    const score = along + 2 * across;
    if (score < bestScore) {
      bestScore = score;
      best = o.id;
    }
  }
  return best;
}

interface Menu {
  open: boolean;
  focus: string;
  submenu: boolean;
  returnTo: string | null;
  message: string;
  bump: number; // seconds left of the "no neighbour" nudge
  bumpDir: Dir;
  clock: number;
  lastAction: string;
}

export function MenuFocusFigure(_: { spec: VizSpec }) {
  const [explicit, setExplicit] = useState(true);
  const [wrap, setWrap] = useState(true);
  const [lockGrid, setLockGrid] = useState(true);
  const [sounds, setSounds] = useState(true);
  const P = useRef({ explicit, wrap, lockGrid, sounds });
  P.current = { explicit, wrap, lockGrid, sounds };
  const s = useRef<Menu>({ open: true, focus: 'cmd0', submenu: false, returnTo: null, message: '', bump: 0, bumpDir: 'left', clock: 0, lastAction: 'open()' }).current;
  const cancelReq = useRef(false);
  const [, setTick] = useState(0);
  const frame = useRef(0);

  const sfx = (id: string) => P.current.sounds && playSound(id, 0.45);
  const focusable = (c: Ctl) => (c.kind === 'command' ? true : !P.current.lockGrid || s.submenu);
  const neighbour = (c: Ctl, d: Dir) => (P.current.explicit ? explicitNeighbour(c, d, P.current.wrap) : searchNeighbour(c, d, focusable));

  const update = (dt: number, input: Input) => {
    s.clock += dt;
    s.bump = Math.max(0, s.bump - dt);
    const cancel = cancelReq.current || input.justPressed('dash');
    cancelReq.current = false;
    if (!s.open) {
      if (cancel || input.justPressed('interact')) {
        s.open = true;
        s.submenu = false;
        s.returnTo = null;
        s.focus = 'cmd0'; // _focus_silently(items_button): no move sound
        s.lastAction = 'open(): paused, focus Items (silently)';
        s.message = '';
      }
    } else if (cancel) {
      sfx('sfx_menu_back');
      if (s.returnTo) {
        s.focus = s.returnTo;
        s.lastAction = 'ui_cancel: back to ' + BY_ID[s.returnTo].label;
        s.returnTo = null;
        s.submenu = false;
      } else {
        s.open = false;
        s.lastAction = 'ui_cancel: close(), unpaused';
      }
      s.message = '';
    } else if (input.justPressed('interact') || input.justPressed('jump')) {
      const c = BY_ID[s.focus];
      sfx('sfx_menu_select');
      if (c.id === 'cmd0') {
        s.returnTo = 'cmd0';
        s.submenu = true;
        s.focus = 'slot0';
        s.lastAction = 'ui_accept on Items: open the grid, focus slot 0 (silently)';
      } else if (c.id === 'cmd4') {
        s.open = false;
        s.lastAction = 'ui_accept on Resume: close()';
      } else if (c.kind === 'slot') {
        s.message = 'Used ' + c.label + '.';
        s.lastAction = 'ui_accept on ' + c.label;
      } else {
        s.message = c.label + ' is not in this demo.';
        s.lastAction = 'ui_accept on ' + c.label;
      }
    } else {
      for (const d of DIRS)
        if (input.justPressed(d)) {
          const c = BY_ID[s.focus];
          const n = neighbour(c, d);
          if (n && n !== s.focus && focusable(BY_ID[n])) {
            s.focus = n;
            sfx('sfx_menu_move');
            s.lastAction = `ui_${d}: ${c.label} → ${BY_ID[n].label}`;
            // leaving the grid by geometry also leaves the submenu
            if (BY_ID[n].kind === 'command' && s.submenu) {
              s.submenu = false;
              s.returnTo = null;
            }
          } else {
            s.bump = 0.12;
            s.bumpDir = d;
            s.lastAction = `ui_${d}: no neighbour, focus stays`;
          }
        }
    }
    if (++frame.current % 5 === 0) setTick((x) => x + 1);
  };

  const draw = (ctx: CanvasRenderingContext2D) => {
    const th = theme(ctx.canvas);
    const t = s.clock;
    // the paused game underneath
    drawGround(ctx);
    drawActor(ctx, 'hero', 'idle_down', s.open ? 0 : t, 160, 120, false, '#4c86d6');
    drawActor(ctx, 'slime', s.open ? 'idle' : 'hop', s.open ? 0 : t, 210, 126, false, '#4f9e3e');
    if (!s.open) {
      text(ctx, 'game running: Esc / X or F opens the menu', W / 2, 172, '#fbf6e6', 'center');
      return;
    }
    rect(ctx, 0, 0, W, H, 'rgba(26,20,36,0.55)');
    // command panel
    drawNine(ctx, CMD_X, CMD_Y, 72, 12 + COMMANDS.length * 12);
    // grid panel
    const gw = COLS * SLOT + (COLS - 1) * GAP + 16;
    drawNine(ctx, GRID_X - 8, CMD_Y, gw, 3 * (SLOT + GAP) + 18);
    text(ctx, 'Items', GRID_X, CMD_Y + 11, s.submenu ? '#eebb3e' : '#c0bed4');
    // description panel
    drawNine(ctx, 8, 128, 304, 44);
    const fc = BY_ID[s.focus];
    text(ctx, fc.kind === 'slot' ? fc.label : fc.label + (fc.id === 'cmd0' ? ': open the item grid' : ''), 16, 144, '#eebb3e');
    text(ctx, s.message || (fc.kind === 'slot' ? fc.desc ?? '' : fc.id === 'cmd4' ? 'Close the menu and unpause.' : ''), 16, 158, '#fbf6e6');
    // controls
    for (const c of CTLS) {
      const on = c.id === s.focus;
      const usable = focusable(c);
      if (c.kind === 'command') text(ctx, c.label, c.x + 10, c.y + 9, on ? '#eebb3e' : '#fbf6e6');
      else {
        rect(ctx, c.x, c.y, c.w, c.h, usable ? '#2c2840' : 'rgba(44,40,64,0.6)');
        rect(ctx, c.x, c.y, c.w, c.h, on ? '#eebb3e' : '#514c68', true);
        const idx = SHEETS['icons']?.tiles?.[c.icon ?? ''];
        if (idx !== undefined) drawFrame(ctx, 'icons', idx, c.x + 3, c.y + 3, { alpha: usable ? 1 : 0.45 });
        else rect(ctx, c.x + 6, c.y + 6, 10, 10, '#86829e');
      }
    }
    // neighbour arrows from the focused control
    const cx = fc.x + fc.w / 2, cy = fc.y + fc.h / 2;
    for (const d of DIRS) {
      const n = neighbour(fc, d);
      if (!n || n === fc.id) continue;
      const o = BY_ID[n];
      const ox = o.x + o.w / 2, oy = o.y + o.h / 2;
      ctx.save();
      ctx.strokeStyle = focusable(o) ? th.accent : 'rgba(255,255,255,0.3)';
      ctx.setLineDash([2, 2]);
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(ox, oy);
      ctx.stroke();
      ctx.restore();
      rect(ctx, o.x - 1, o.y - 1, o.w + 2, o.h + 2, focusable(o) ? th.accent : 'rgba(255,255,255,0.3)', true);
    }
    // the cursor (menu_cursor.gd) left of the focused control, with a bump nudge
    const [bx, by] = s.bump > 0 ? DV[s.bumpDir] : [0, 0];
    drawCursor(ctx, fc.x + (fc.kind === 'command' ? 8 : -1) + bx * 2, cy + by * 2, t);
  };

  // GDScript for the focused control's neighbours
  const fc = BY_ID[s.focus];
  const code = useMemo(() => {
    const path = (id: string | null) => {
      if (!id) return null;
      const o = BY_ID[id];
      return o.kind === 'slot' ? `^"../Slot${id.slice(4)}"` : `^"../../Commands/${o.label}Button"`;
    };
    const lines = DIRS.map((d) => {
      if (!explicit) return `# ${GODOT_NAME[d]} not set: Godot searches for the nearest focusable control`;
      const n = explicitNeighbour(fc, d, wrap);
      return n ? `${GODOT_NAME[d]} = ${path(n)}` : `${GODOT_NAME[d]} = ^"."  # itself: pressing ${d} does nothing`;
    });
    const name = fc.kind === 'slot' ? `ItemGrid/Slot${fc.id.slice(4)}` : `Commands/${fc.label}Button`;
    return `# ${name} (${fc.label})\n${lines.join('\n')}\nfocus_mode = ${fc.kind === 'slot' && lockGrid && !s.submenu ? 'Control.FOCUS_NONE  # outside the Items submenu' : 'Control.FOCUS_ALL'}`;
  }, [fc, explicit, wrap, lockGrid, s.submenu]);

  const nb = (d: Dir) => {
    const n = neighbour(fc, d);
    return n && focusable(BY_ID[n]) ? BY_ID[n].label : '(stay)';
  };

  return (
    <FigureLayout
      side={
        <>
          <Toggle label="explicit focus neighbours" value={explicit} onChange={setExplicit} />
          <Toggle label="wrap at edges" value={wrap} onChange={setWrap} />
          <Toggle label="grid focusable only inside Items" value={lockGrid} onChange={setLockGrid} />
          <Toggle label="menu sounds" value={sounds} onChange={setSounds} />
          <Readout
            rows={[
              ['\\text{focus}', s.open ? fc.label : '(menu closed)'],
              ['\\leftarrow\\ \\uparrow', s.open ? `${nb('left')}, ${nb('up')}` : '-'],
              ['\\rightarrow\\ \\downarrow', s.open ? `${nb('right')}, ${nb('down')}` : '-'],
              ['\\texttt{\\_return\\_to}', s.returnTo ? BY_ID[s.returnTo].label : 'null'],
              ['\\text{last}', s.lastAction],
            ]}
          />
        </>
      }
      below={<CodeBlock code={code} file="focus neighbours of the focused control" compact />}
    >
      <div
        className="world-stack"
        onKeyDown={(e) => {
          if (e.key === 'Escape' || e.key === 'Backspace') {
            e.preventDefault();
            cancelReq.current = true;
          }
        }}
      >
        <GameCanvas
          width={W}
          height={H}
          update={update}
          draw={draw}
          touchButtons={['up', 'down', 'left', 'right', 'interact', 'dash']}
          keysHint={<Keys items={[['arrows / WASD', 'ui_up/down/left/right'], ['F / Enter', 'ui_accept'], ['X / Esc', 'ui_cancel']]} />}
          label="pause menu: arrows move focus, F accepts, X or Escape goes back"
        />
      </div>
    </FigureLayout>
  );
}
