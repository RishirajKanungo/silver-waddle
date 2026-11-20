// rpg.loot — loot tables and chests for r03-2. Fight slimes; each death rolls the slime LootTable
// (weighted pick with a "nothing" share, LootTable._pick) and spawns pickups that hop out and go into
// the bag on contact. The chest opens once: its persistent id goes into GameState.opened, which
// survives "leave and re-enter", while the slimes and uncollected pickups do not.
import { useMemo, useRef, useState } from 'react';
import type { VizSpec } from '../../content/types';
import { GameCanvas, Keys, rect, text, drawFrame, animFrame, SHEETS, playSound, type Input } from '../game';
import { Slider, FigureLayout, Btn, Bars } from '../kit';
import { iconFrame } from './common';
import { item } from './items';

const W = 320, H = 180;
const WALL = 16;
interface Slime {
  x: number;
  y: number;
  vx: number;
  vy: number;
  hp: number;
  hopT: number;
  flash: number;
  dead: number; // seconds since death, -1 alive
  hitBy: number; // swing id that last hit it
}
interface Pickup {
  x: number;
  y: number;
  id: string; // item id or 'gold'
  n: number;
  t: number;
}
interface Popup {
  x: number;
  y: number;
  s: string;
  t: number;
}
const SPAWNS: [number, number][] = [[110, 70], [200, 110], [150, 140], [240, 70]];
const CHEST = { x: 280, y: 36 };
const CHEST_ID = 'loot_room/Objects/Chest';

function weightedPick(weights: [string | null, number][], r: number) {
  // LootTable._pick: walk along the weights; past the last entry is "nothing"
  const total = weights.reduce((s, [, w]) => s + w, 0);
  let x = r * total;
  for (const [id, w] of weights) {
    x -= w;
    if (x < 0) return id;
  }
  return null;
}

export function LootSim({ spec }: { spec: VizSpec }) {
  const [wEarth, setEarth] = useState(30);
  const [wPotion, setPotion] = useState(15);
  const [wEther, setEther] = useState(5);
  const [wNothing, setNothing] = useState(50);
  const [bag, setBag] = useState<Record<string, number>>({});
  const [gold, setGold] = useState(0);
  const [opened, setOpened] = useState<Record<string, true>>({});
  const [sim, setSim] = useState<Record<string, number> | null>(null);
  const [kills, setKills] = useState(0);
  const weights: [string | null, number][] = [['earth_crystal', wEarth], ['potion', wPotion], ['ether', wEther], [null, wNothing]];
  const wRef = useRef(weights);
  wRef.current = weights;
  const openedRef = useRef(opened);
  openedRef.current = opened;

  const kai = useRef({ x: 60, y: 100, facing: 'down' as 'down' | 'up' | 'side', flip: false, swing: 0, swingId: 0, t: 0 }).current;
  const slimes = useRef<Slime[]>([]);
  const pickups = useRef<Pickup[]>([]).current;
  const popups = useRef<Popup[]>([]).current;
  const time = useRef(0);
  const spawn = () => {
    slimes.current = SPAWNS.map(([x, y]) => ({ x, y, vx: 0, vy: 0, hp: 2, hopT: Math.random() * 2, flash: 0, dead: -1, hitBy: -1 }));
    pickups.length = 0;
  };
  if (!slimes.current.length) spawn();
  void spec;

  const total = weights.reduce((s, [, w]) => s + w, 0) || 1;
  const pEther = wEther / total;
  const roll = () => weightedPick(wRef.current, Math.random());

  const update = (dt: number, input: Input) => {
    time.current += dt;
    // Kai
    const [ix, iy] = input.vector();
    const speed = kai.swing > 0 ? 20 : 80;
    kai.x = Math.max(WALL + 6, Math.min(W - WALL - 6, kai.x + ix * speed * dt));
    kai.y = Math.max(WALL + 10, Math.min(H - WALL, kai.y + iy * speed * dt));
    if (ix || iy) {
      if (Math.abs(ix) > Math.abs(iy)) {
        kai.facing = 'side';
        kai.flip = ix < 0;
      } else kai.facing = iy < 0 ? 'up' : 'down';
    }
    kai.t += dt;
    if (input.justPressed('attack') && kai.swing <= 0) {
      kai.swing = 0.3;
      kai.swingId++;
      kai.t = 0;
      playSound('sfx_swing', 0.3);
    }
    if (kai.swing > 0) kai.swing -= dt;
    // the swing's hitbox: 18×14 in front of Kai, active for the first 0.15 s
    if (kai.swing > 0.15) {
      const fx = kai.facing === 'side' ? (kai.flip ? -1 : 1) : 0, fy = kai.facing === 'up' ? -1 : kai.facing === 'down' ? 1 : 0;
      const hx = kai.x + fx * 14, hy = kai.y - 6 + fy * 12;
      for (const s of slimes.current)
        if (s.dead < 0 && s.hitBy !== kai.swingId && Math.abs(s.x - hx) < 13 && Math.abs(s.y - 4 - hy) < 11) {
          s.hitBy = kai.swingId;
          s.hp--;
          s.flash = 1;
          s.vx = fx * 120;
          s.vy = fy * 120;
          playSound('sfx_hit', 0.3);
          if (s.hp <= 0) {
            s.dead = 0;
            setKills((k) => k + 1);
            // LootDropper._on_died: roll the table, scatter pickups on a spiral, add gold
            const got = roll();
            let i = 0;
            const drops: [string, number][] = [];
            if (got) drops.push([got, 1]);
            drops.push(['gold', 3 + Math.floor(Math.random() * 5)]);
            for (const [id, n] of drops) {
              const a = i * 2.4, r = 6 + 3 * i;
              pickups.push({ x: s.x + Math.cos(a) * r, y: s.y + Math.sin(a) * r, id, n, t: 0 });
              i++;
            }
          }
        }
    }
    // slimes hop about
    for (const s of slimes.current) {
      s.flash = Math.max(0, s.flash - dt * 4);
      if (s.dead >= 0) {
        s.dead += dt;
        continue;
      }
      s.hopT -= dt;
      if (s.hopT <= 0) {
        const a = Math.random() * Math.PI * 2;
        s.vx = Math.cos(a) * 40;
        s.vy = Math.sin(a) * 40;
        s.hopT = 1 + Math.random() * 1.5;
      }
      s.x = Math.max(WALL + 8, Math.min(W - WALL - 8, s.x + s.vx * dt));
      s.y = Math.max(WALL + 12, Math.min(H - WALL - 2, s.y + s.vy * dt));
      s.vx *= Math.pow(0.05, dt);
      s.vy *= Math.pow(0.05, dt);
    }
    // pickups: collected on contact (Pickup._on_body_entered -> GameState.add_item)
    for (let i = pickups.length - 1; i >= 0; i--) {
      const p = pickups[i];
      p.t += dt;
      if (p.t > 0.4 && Math.abs(p.x - kai.x) < 10 && Math.abs(p.y - kai.y) < 10) {
        pickups.splice(i, 1);
        if (p.id === 'gold') {
          setGold((g) => g + p.n);
          popups.push({ x: p.x, y: p.y - 12, s: `+${p.n} G`, t: 0 });
          playSound('sfx_coin', 0.3);
        } else {
          setBag((b) => ({ ...b, [p.id]: Math.min(99, (b[p.id] ?? 0) + p.n) }));
          popups.push({ x: p.x, y: p.y - 12, s: item(p.id).name, t: 0 });
          playSound('sfx_menu_select', 0.3);
        }
      }
    }
    // the chest: Interactable.interacted -> Chest._on_interacted
    if (input.justPressed('interact') && Math.hypot(kai.x - CHEST.x, kai.y - CHEST.y - 8) < 26) {
      if (openedRef.current[CHEST_ID]) popups.push({ x: CHEST.x, y: CHEST.y - 12, s: 'empty', t: 0 });
      else {
        setOpened((o) => ({ ...o, [CHEST_ID]: true }));
        openedRef.current = { ...openedRef.current, [CHEST_ID]: true };
        setBag((b) => ({ ...b, phoenix_feather: (b.phoenix_feather ?? 0) + 1, ruins_map: 1 }));
        setGold((g) => g + 50);
        popups.push({ x: CHEST.x - 20, y: CHEST.y - 14, s: 'Phoenix Feather, Ruins Map, 50 G', t: 0 });
        playSound('sfx_chest', 0.4);
      }
    }
    for (const p of popups) p.t += dt;
    while (popups.length && popups[0].t > 1.4) popups.shift();
  };

  const draw = (ctx: CanvasRenderingContext2D) => {
    ctx.fillStyle = '#4f8a43';
    ctx.fillRect(0, 0, W, H);
    const tiles = SHEETS['tiles_overworld']?.tiles;
    if (tiles?.grass !== undefined) {
      const g = [tiles.grass, tiles.grass2 ?? tiles.grass, tiles.grass3 ?? tiles.grass];
      for (let y = 0; y < H; y += 16) for (let x = 0; x < W; x += 16) drawFrame(ctx, 'tiles_overworld', g[((x * 7 + y * 13) / 16) % 3 | 0], x, y);
    }
    rect(ctx, 0, 0, W, WALL, '#4b4a5c');
    rect(ctx, 0, H - 6, W, 6, '#4b4a5c');
    rect(ctx, 0, 0, 6, H, '#4b4a5c');
    rect(ctx, W - 6, 0, 6, H, '#4b4a5c');
    rect(ctx, 0, WALL - 3, W, 3, '#6f6d84');
    // chest (objects sheet: chest_closed / chest_open)
    const ot = SHEETS['objects']?.tiles;
    drawFrame(ctx, 'objects', openedRef.current[CHEST_ID] ? ot?.chest_open ?? 1 : ot?.chest_closed ?? 0, CHEST.x - 8, CHEST.y - 8);
    if (!openedRef.current[CHEST_ID] && Math.hypot(kai.x - CHEST.x, kai.y - CHEST.y - 8) < 26) text(ctx, 'F: open', CHEST.x, CHEST.y - 12, '#ffffff', 'center');
    // pickups hop out (Pickup._ready tween), then bob
    for (const p of pickups) {
      const hop = p.t < 0.4 ? -Math.sin((p.t / 0.4) * Math.PI) * 8 : Math.sin(time.current * 4 + p.x) * 0.8;
      if (p.id === 'gold') drawFrame(ctx, 'objects', animFrame('objects', 'coin', time.current), p.x - 8, p.y - 12 + hop);
      else drawFrame(ctx, 'icons', iconFrame(item(p.id).icon), p.x - 8, p.y - 14 + hop);
    }
    const ents: { y: number; d: () => void }[] = [];
    for (const s of slimes.current) {
      if (s.dead > 0.6) continue;
      ents.push({ y: s.y, d: () => drawFrame(ctx, 'slime', animFrame('slime', s.dead >= 0 ? 'die' : Math.hypot(s.vx, s.vy) > 10 ? 'hop' : 'idle', s.dead >= 0 ? s.dead : time.current + s.x), s.x, s.y, { anchored: true, flash: s.flash }) });
    }
    const anim = kai.swing > 0 ? 'attack_' + kai.facing : 'idle_' + kai.facing;
    ents.push({ y: kai.y, d: () => drawFrame(ctx, 'hero', animFrame('hero', anim, kai.swing > 0 ? kai.t : time.current), kai.x, kai.y, { anchored: true, flipH: kai.flip }) });
    ents.sort((a, b) => a.y - b.y).forEach((e) => e.d());
    for (const p of popups) text(ctx, p.s, p.x, p.y - p.t * 10, '#ffffff', 'center');
    // HUD
    rect(ctx, 0, 0, W, 18, 'rgba(0,0,0,0.55)');
    let x = 4;
    for (const id of ['earth_crystal', 'potion', 'ether', 'phoenix_feather']) {
      drawFrame(ctx, 'icons', iconFrame(item(id).icon), x, 1);
      text(ctx, String(bagRef.current[id] ?? 0), x + 18, 13, '#ffffff');
      x += 40;
    }
    text(ctx, `${goldRef.current} G`, W - 6, 13, '#ffd65a', 'right');
  };
  const bagRef = useRef(bag);
  bagRef.current = bag;
  const goldRef = useRef(gold);
  goldRef.current = gold;

  const simulate = () => {
    const out: Record<string, number> = { earth_crystal: 0, potion: 0, ether: 0, nothing: 0 };
    for (let i = 0; i < 1000; i++) out[roll() ?? 'nothing']++;
    setSim(out);
  };
  const bars = useMemo(() => {
    const labels: [string, string, number][] = [['earth_crystal', 'Earth', wEarth], ['potion', 'Potion', wPotion], ['ether', 'Ether', wEther], ['nothing', 'nothing', wNothing]];
    return labels.flatMap(([id, label, w]) => [
      { label: label + ' exp', value: Math.round((1000 * w) / total), highlight: false },
      { label: label + ' sim', value: sim ? sim[id] : 0, highlight: true },
    ]);
  }, [sim, wEarth, wPotion, wEther, wNothing, total]);

  return (
    <FigureLayout
      side={
        <>
          <div className="rpg-k">slime loot table (weights)</div>
          <Slider label="Earth Crystal" value={wEarth} min={0} max={100} step={1} onChange={setEarth} fmt={(v) => `${v} (${((100 * v) / total).toFixed(0)}%)`} />
          <Slider label="Potion" value={wPotion} min={0} max={100} step={1} onChange={setPotion} fmt={(v) => `${v} (${((100 * v) / total).toFixed(0)}%)`} />
          <Slider label="Ether" value={wEther} min={0} max={100} step={1} onChange={setEther} fmt={(v) => `${v} (${((100 * v) / total).toFixed(0)}%)`} />
          <Slider label="nothing" value={wNothing} min={0} max={100} step={1} onChange={setNothing} fmt={(v) => `${v} (${((100 * v) / total).toFixed(0)}%)`} />
          <div className="readout">
            <div className="readout-row">
              <span>Ether per kill</span>
              <span className="rpg-mono">{pEther.toFixed(3)}</span>
            </div>
            <div className="readout-row">
              <span>≥1 Ether in 10 kills</span>
              <span className="rpg-mono">{(1 - Math.pow(1 - pEther, 10)).toFixed(3)}</span>
            </div>
            <div className="readout-row">
              <span>kills for 90%</span>
              <span className="rpg-mono">{pEther > 0 && pEther < 1 ? Math.ceil(Math.log(0.1) / Math.log(1 - pEther)) : pEther >= 1 ? 1 : '∞'}</span>
            </div>
            <div className="readout-row">
              <span>slimes defeated</span>
              <span className="rpg-mono">{kills}</span>
            </div>
          </div>
          <Btn onClick={simulate}>Simulate 1000 kills</Btn>
        </>
      }
      below={
        <div className="rpg-col" style={{ maxWidth: 'none' }}>
          {sim && <Bars data={bars} height={170} fmt={(v) => String(Math.round(v))} />}
          <div className="rpg-code">{`GameState.opened = ${JSON.stringify(opened)}\nGameState.inventory = ${JSON.stringify(bag)}\nGameState.gold = ${gold}`}</div>
        </div>
      }
    >
      <div className="rpg-col">
        <GameCanvas
          width={W}
          height={H}
          update={update}
          draw={draw}
          touchButtons={['up', 'down', 'left', 'right', 'attack', 'interact']}
          keysHint={<Keys items={[['WASD / arrows', 'move'], ['J', 'attack'], ['F', 'open chest']]} />}
          label="loot room: move with WASD, J attacks, F opens the chest"
        />
        <div className="rpg-row">
          <Btn primary onClick={spawn}>Leave and re-enter</Btn>
          <Btn onClick={() => { setOpened({}); openedRef.current = {}; setBag({}); setGold(0); spawn(); }}>New game (clear save)</Btn>
        </div>
      </div>
    </FigureLayout>
  );
}
