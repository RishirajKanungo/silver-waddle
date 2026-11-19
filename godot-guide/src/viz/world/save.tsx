// rpg.save_inspector — a tiny playable world and its save file (r06). Mirrors:
//   GameState.to_dict()/from_dict() (r06-1), Persist ids "room/Objects/Name", chests asking is_opened() on room load,
//   SaveSystem.write_json(): .tmp → old file to .bak → rename; read_json() falls back to .bak (r06-2),
//   SaveMigrations.migrate() with _v1_to_v2 and refusal of newer versions (r06-3).
// JSON is printed like Godot's JSON.stringify(data, "\t") (keys sorted, tabs, ": ").
import { useMemo, useRef, useState } from 'react';
import type { VizSpec } from '../../content/types';
import { GameCanvas, Keys, rect, text, drawFrame, playSound, SHEETS, type Input } from '../game';
import { FigureLayout, SegControl, Btn, Readout } from '../kit';
import { W, H, drawActor, drawGround, objectFrame } from './common';

type Json = null | boolean | number | string | Json[] | { [k: string]: Json };
type Dict = { [k: string]: Json };

// ------------------------------------------------------------------ the world
interface Obj {
  id: string; // persistent id: room/Objects/Name
  kind: 'chest' | 'coin' | 'herb' | 'elder';
  x: number;
  y: number;
  gold?: number;
  item?: string;
}
const ROOMS: Record<string, Obj[]> = {
  village: [
    { id: 'village/Objects/Chest1', kind: 'chest', x: 96, y: 76, gold: 50, item: 'potion' },
    { id: 'village/Objects/Coin1', kind: 'coin', x: 150, y: 132, gold: 5 },
    { id: 'village/Objects/Coin2', kind: 'coin', x: 166, y: 138, gold: 5 },
    { id: 'village/Objects/Coin3', kind: 'coin', x: 182, y: 132, gold: 5 },
    { id: 'village/Elder', kind: 'elder', x: 232, y: 82 },
  ],
  north_road: [
    { id: 'north_road/Objects/Chest1', kind: 'chest', x: 220, y: 70, gold: 30, item: 'ether' },
    { id: 'north_road/Objects/Herb1', kind: 'herb', x: 120, y: 140 },
    { id: 'north_road/Objects/Herb2', kind: 'herb', x: 260, y: 136 },
  ],
};

interface GS {
  gold: number;
  inventory: Record<string, number>;
  flags: Record<string, number>;
  opened: Record<string, boolean>;
  party: Dict[];
  room: string;
  px: number;
  py: number;
  playtime: number;
}
const NEW_PARTY: Dict[] = [
  { id: 'kai', level: 3, hp: 64, mp: 6 },
  { id: 'lyra', level: 3, hp: 41, mp: 30 },
];
const newGame = (): GS => ({ gold: 0, inventory: {}, flags: {}, opened: {}, party: NEW_PARTY.map((m) => ({ ...m })), room: 'village', px: 60, py: 120, playtime: 0 });

/** GameState.to_dict() */
function toDict(g: GS): Dict {
  return {
    gold: g.gold,
    inventory: { ...g.inventory },
    flags: { ...g.flags },
    opened: { ...g.opened },
    party: g.party.map((m) => ({ ...m })),
    room: g.room,
    position: [Math.round(g.px), Math.round(g.py)],
    playtime: Math.round(g.playtime * 10) / 10,
  };
}
/** GameState.from_dict() */
function fromDict(d: Dict): GS {
  const ints = (o: Json | undefined) => Object.fromEntries(Object.entries((o as Dict) ?? {}).map(([k, v]) => [k, Math.trunc(Number(v))]));
  const p = (d.position as number[]) ?? [160, 96];
  return {
    gold: Math.trunc(Number(d.gold ?? 0)),
    inventory: ints(d.inventory),
    flags: ints(d.flags),
    opened: { ...((d.opened as Record<string, boolean>) ?? {}) },
    party: ((d.party as Dict[]) ?? []).map((m) => ({ ...m })),
    room: (d.room as string) ?? 'village',
    px: Number(p[0]),
    py: Number(p[1]),
    playtime: Number(d.playtime ?? 0),
  };
}

// ------------------------------------------------------------------ JSON like Godot's JSON.stringify(data, "\t")
interface Line {
  text: string;
  path: string;
}
function stringifyLines(v: Json, indent = 0, path = '', key: string | null = null, last = true): Line[] {
  const tabs = '\t'.repeat(indent);
  const pre = tabs + (key !== null ? JSON.stringify(key) + ': ' : '');
  const comma = last ? '' : ',';
  if (v !== null && typeof v === 'object') {
    const isArr = Array.isArray(v);
    const entries: [string, Json][] = isArr ? (v as Json[]).map((x, i) => [String(i), x]) : Object.keys(v).sort().map((k) => [k, (v as Dict)[k]]);
    if (!entries.length) return [{ text: pre + (isArr ? '[]' : '{}') + comma, path }];
    const out: Line[] = [{ text: pre + (isArr ? '[' : '{'), path: path + '{' }];
    entries.forEach(([k, x], i) => out.push(...stringifyLines(x, indent + 1, path + '/' + k, isArr ? null : k, i === entries.length - 1)));
    out.push({ text: tabs + (isArr ? ']' : '}') + comma, path: path + '}' });
    return out;
  }
  return [{ text: pre + JSON.stringify(v) + comma, path }];
}
/** ConfigFile text for the same state (var_to_str style values) */
function configText(d: Dict, version: number, savedAt: string): string {
  const val = (v: Json): string => {
    if (v === null) return 'null';
    if (Array.isArray(v)) return '[' + v.map(val).join(', ') + ']';
    if (typeof v === 'object') {
      const ks = Object.keys(v);
      return ks.length ? '{\n' + ks.map((k) => JSON.stringify(k) + ': ' + val(v[k])).join(',\n') + '\n}' : '{}';
    }
    return JSON.stringify(v);
  };
  const pos = d.position as number[];
  const lines = ['[meta]', '', `version=${version}`, `saved_at=${JSON.stringify(savedAt)}`, '', '[state]', ''];
  for (const k of Object.keys(d).sort()) lines.push(k === 'position' ? `position=Vector2(${pos[0]}, ${pos[1]})` : `${k}=${val(d[k])}`);
  return lines.join('\n');
}

// ------------------------------------------------------------------ migration (SaveMigrations)
const V1_SAVE: Dict = {
  version: 1,
  gold: 120,
  room: 'village',
  x: 96,
  y: 96,
  flags: ['met_elder'],
  chests: ['village/Objects/Chest1'],
  items: { potion: 2 },
  party: [
    { id: 'kai', level: 4, hp: 70, mp: 8 },
    { id: 'lyra', level: 4, hp: 50, mp: 31 },
  ],
};
const MIG_STEPS: { label: string; gd: string; run: (d: Dict, old: Dict) => void }[] = [
  {
    label: 'flags: list of names → {name: 1}',
    gd: 'for flag_name in old.get("flags", []): flags[flag_name] = 1',
    run: (d, old) => (d.flags = Object.fromEntries(((old.flags as string[]) ?? []).map((f) => [f, 1]))),
  },
  {
    label: 'chests → opened {id: true}',
    gd: 'for id in old.get("chests", []): opened[id] = true',
    run: (d, old) => (d.opened = Object.fromEntries(((old.chests as string[]) ?? []).map((c) => [c, true]))),
  },
  { label: 'items → inventory', gd: 'data["inventory"] = old.get("items", {})', run: (d, old) => (d.inventory = { ...((old.items as Dict) ?? {}) }) },
  { label: 'x, y → position [x, y]', gd: 'data["position"] = [old.get("x", 160), old.get("y", 96)]', run: (d, old) => (d.position = [(old.x as number) ?? 160, (old.y as number) ?? 96]) },
  {
    label: 'erase chests, items, x, y',
    gd: 'for key in ["chests", "items", "x", "y"]: data.erase(key)',
    run: (d) => {
      for (const k of ['chests', 'items', 'x', 'y']) delete d[k];
    },
  },
  {
    label: 'playtime defaults to 0.0',
    gd: 'if not data.has("playtime"): data["playtime"] = 0.0',
    run: (d) => {
      if (!('playtime' in d)) d.playtime = 0;
    },
  },
  { label: 'version = 2', gd: 'data["version"] = version  # in migrate()', run: (d) => (d.version = 2) },
];

interface SlotFiles {
  main?: string;
  bak?: string;
  tmp?: string;
}
interface Mig {
  active: boolean;
  step: number; // number of steps applied
  data: Dict;
  prev: Dict;
  error: string;
  done: boolean;
}

export function SaveInspector({ spec }: { spec: VizSpec }) {
  const mode = (spec.mode as 'live' | 'slots' | 'migrate') ?? 'live';
  const gs = useRef<GS>(newGame()).current;
  const [slot, setSlot] = useState(1);
  const [fmt, setFmt] = useState<'json' | 'cfg'>('json');
  const files = useRef<Record<number, SlotFiles>>({}).current;
  const [message, setMessage] = useState('');
  const [mig, setMig] = useState<Mig>({ active: false, step: 0, data: {}, prev: {}, error: '', done: false });
  const changed = useRef(new Map<string, number>()).current; // path -> time it changed
  const lastVals = useRef(new Map<string, string>()).current;
  const clock = useRef(0);
  const anim = useRef(0);
  const prompt = useRef('');
  const [, setTick] = useState(0);
  const frame = useRef(0);
  const facing = useRef<{ f: 'down' | 'up' | 'side'; flip: boolean; moving: boolean }>({ f: 'down', flip: false, moving: false }).current;

  const objsHere = () => ROOMS[gs.room] ?? [];
  const isGone = (o: Obj) => o.kind !== 'elder' && !!gs.opened[o.id];

  const interact = (o: Obj) => {
    if (o.kind === 'elder') {
      if (!gs.flags.met_elder) {
        gs.flags.met_elder = 1;
        setMessage('Elder Maren: "Kai, you found your way." (set_flag("met_elder"))');
      } else setMessage('Elder Maren: "Mind the north road." (no change)');
      playSound('sfx_menu_select', 0.35);
      return;
    }
    if (isGone(o)) return;
    gs.opened[o.id] = true; // GameState.mark_opened(persist_id)
    if (o.gold) gs.gold += o.gold;
    if (o.item) gs.inventory[o.item] = (gs.inventory[o.item] ?? 0) + 1;
    if (o.kind === 'herb') gs.flags.herbs = (gs.flags.herbs ?? 0) + 1;
    playSound(o.kind === 'chest' ? 'sfx_chest' : o.kind === 'coin' ? 'sfx_coin' : 'sfx_menu_select', 0.45);
    setMessage(o.kind === 'chest' ? `Opened ${o.id}: +${o.gold} gold, ${o.item}.` : o.kind === 'coin' ? `Picked ${o.id}: +${o.gold} gold.` : `Picked ${o.id}: herbs +1.`);
  };

  const update = (dt: number, input: Input) => {
    clock.current += dt;
    anim.current += dt;
    if (mig.active && !mig.done) return; // the game waits while a migration is shown
    gs.playtime += dt;
    const [ix, iy] = input.vector();
    facing.moving = ix !== 0 || iy !== 0;
    if (facing.moving) {
      if (Math.abs(ix) > Math.abs(iy)) {
        facing.f = 'side';
        facing.flip = ix < 0;
      } else facing.f = iy < 0 ? 'up' : 'down';
    }
    gs.px = Math.max(8, Math.min(W - 8, gs.px + ix * 80 * dt));
    gs.py = Math.max(56, Math.min(H - 8, gs.py + iy * 80 * dt));
    // doors
    if (gs.room === 'village' && gs.px >= W - 9 && gs.py > 84 && gs.py < 124) {
      gs.room = 'north_road';
      gs.px = 20;
      setMessage('Entered north_road: its objects ask GameState.is_opened() in _ready.');
    } else if (gs.room === 'north_road' && gs.px <= 9 && gs.py > 84 && gs.py < 124) {
      gs.room = 'village';
      gs.px = W - 24;
      setMessage('Back in the village: the room is a fresh instance, but opened ids are remembered.');
    }
    // nearest interactable within 20 px
    let best: Obj | null = null, bd = 20 * 20;
    for (const o of objsHere()) {
      if (isGone(o)) continue;
      const d = (o.x - gs.px) ** 2 + (o.y - gs.py) ** 2;
      if (d < bd) {
        bd = d;
        best = o;
      }
    }
    prompt.current = best ? `F: ${best.kind === 'elder' ? 'talk' : best.kind === 'chest' ? 'open' : 'pick up'}  ${best.id}` : '';
    if (best && input.justPressed('interact')) interact(best);
    if (++frame.current % 6 === 0) setTick((x) => x + 1);
  };

  const draw = (ctx: CanvasRenderingContext2D) => {
    const t = anim.current;
    drawGround(ctx);
    if (gs.room === 'village') {
      for (let hx = 0; hx < W; hx += 96) {
        rect(ctx, hx + 8, 10, 72, 34, '#9c5e3c');
        rect(ctx, hx + 4, 6, 80, 10, '#4a1530');
        rect(ctx, hx + 36, 28, 14, 16, '#33202a');
      }
      rect(ctx, W - 6, 84, 6, 40, '#33202a');
    } else {
      rect(ctx, 0, 0, W, 44, '#514c68');
      rect(ctx, 0, 40, W, 4, '#2c2840');
      rect(ctx, 0, 84, 6, 40, '#33202a');
      rect(ctx, 100, 90, 120, 16, 'rgba(220,180,122,0.5)');
    }
    for (const o of objsHere()) {
      const gone = isGone(o);
      if (o.kind === 'elder') drawActor(ctx, 'villager', 'idle_down', t, o.x, o.y + 8);
      else if (o.kind === 'chest') {
        const f = objectFrame(gone ? 'chest_open' : 'chest_closed');
        if (f !== undefined) drawFrame(ctx, 'objects', f, o.x - 8, o.y - 12);
        else rect(ctx, o.x - 7, o.y - 8, 14, 10, gone ? '#64392c' : '#9c5e3c');
      } else if (!gone) {
        if (o.kind === 'coin') {
          const anims = SHEETS['objects']?.anims;
          const f = anims?.coin ? anims.coin.frames[Math.floor(t * anims.coin.fps) % anims.coin.frames.length] : objectFrame('coin');
          if (f !== undefined) drawFrame(ctx, 'objects', f, o.x - 8, o.y - 12);
          else rect(ctx, o.x - 3, o.y - 6, 6, 6, '#eebb3e');
        } else {
          rect(ctx, o.x - 1, o.y - 8, 2, 8, '#276838');
          rect(ctx, o.x - 4, o.y - 10, 3, 3, '#9aeaee');
          rect(ctx, o.x + 1, o.y - 12, 3, 3, '#9aeaee');
        }
      }
    }
    drawActor(ctx, 'hero', (facing.moving ? 'walk_' : 'idle_') + facing.f, t, gs.px, gs.py, facing.flip, '#4c86d6');
    rect(ctx, 0, 0, W, 11, 'rgba(0,0,0,0.55)');
    text(ctx, `${gs.room}   gold ${gs.gold}   ${formatTime(gs.playtime)}`, 4, 8, '#fbf6e6');
    if (prompt.current) {
      rect(ctx, 0, H - 13, W, 13, 'rgba(0,0,0,0.6)');
      text(ctx, prompt.current, 4, H - 4, '#eebb3e');
    }
    if (mig.active && !mig.done) {
      rect(ctx, 0, 0, W, H, 'rgba(26,20,36,0.7)');
      text(ctx, mig.error ? 'load refused' : 'migrating save ' + mig.step + '/' + MIG_STEPS.length, W / 2, 92, mig.error ? '#f8925e' : '#eebb3e', 'center');
    }
  };

  // ------------------------------------------------------------------ SaveSystem
  const saveSlot = (n: number, crash = false) => {
    const data: Dict = { ...toDict(gs), version: 2, meta: { saved_at: wallClock(), room: gs.room, playtime: Math.round(gs.playtime * 10) / 10 } };
    const textOut = JSON.stringify(sortDeep(data), null, '\t');
    const f = (files[n] ??= {});
    f.tmp = textOut; // write the temporary file
    if (f.main) {
      f.bak = f.main; // keep the previous save
      f.main = undefined;
    }
    if (crash) {
      setMessage(`Crash after "rename ${slotName(n)} → .bak": ${slotName(n)} is missing, .bak holds the previous save.`);
      playSound('sfx_hurt', 0.4);
      setTick((x) => x + 1);
      return;
    }
    f.main = f.tmp;
    f.tmp = undefined;
    setMessage(`Saved to ${slotName(n)} (${textOut.length} bytes).`);
    playSound('sfx_menu_select', 0.4);
    setTick((x) => x + 1);
  };
  const readSlot = (n: number): { data: Dict | null; from: string } => {
    const f = files[n] ?? {};
    for (const [name, txt] of [
      [slotName(n), f.main],
      [slotName(n) + '.bak', f.bak],
    ] as [string, string | undefined][]) {
      if (!txt) continue;
      try {
        const d = JSON.parse(txt);
        if (d && typeof d === 'object') return { data: d as Dict, from: name };
      } catch {
        /* damaged: try the backup */
      }
    }
    return { data: null, from: '' };
  };
  const loadSlot = (n: number) => {
    const { data, from } = readSlot(n);
    if (!data) {
      setMessage(`Slot ${n} is empty.`);
      return;
    }
    Object.assign(gs, fromDict(data));
    setMessage(`Loaded ${from}${from.endsWith('.bak') ? ' (the main file was missing or damaged)' : ''}. Objects restore themselves from GameState.opened.`);
    playSound('sfx_menu_select', 0.4);
    setTick((x) => x + 1);
  };

  // ------------------------------------------------------------------ migration
  const startMigration = (version: number) => {
    if (version > 2) {
      setMig({ active: true, step: 0, data: { ...V1_SAVE, version }, prev: {}, error: `Save version ${version} is newer than this game (2). migrate() returns {} and load_slot() returns false.`, done: false });
      playSound('sfx_menu_back', 0.4);
      return;
    }
    const d = JSON.parse(JSON.stringify(V1_SAVE)) as Dict;
    setMig({ active: true, step: 0, data: d, prev: d, error: '', done: false });
  };
  const nextStep = () => {
    if (!mig.active || mig.error) {
      setMig({ ...mig, active: false });
      return;
    }
    if (mig.step < MIG_STEPS.length) {
      const prev = JSON.parse(JSON.stringify(mig.data)) as Dict;
      const d = JSON.parse(JSON.stringify(mig.data)) as Dict;
      MIG_STEPS[mig.step].run(d, V1_SAVE);
      setMig({ ...mig, step: mig.step + 1, data: d, prev });
      playSound('sfx_menu_move', 0.35);
    } else if (!mig.done) {
      Object.assign(gs, fromDict(mig.data));
      setMig({ ...mig, done: true, prev: mig.data });
      setMessage('GameState.from_dict(migrated data): the village chest from the old save is open.');
      playSound('sfx_menu_select', 0.4);
    }
  };

  // ------------------------------------------------------------------ JSON panel
  const showingMig = mig.active && !mig.done;
  const liveDict: Dict = { ...toDict(gs), version: 2 };
  const shown: Dict = showingMig ? mig.data : liveDict;
  const lines = stringifyLines(sortDeep(shown) as Json);
  const now = clock.current;
  // mark leaf paths whose value changed (ignoring the ones that change every frame)
  const prevMig = showingMig ? new Map(stringifyLines(sortDeep(mig.prev) as Json).map((l) => [l.path, l.text])) : null;
  for (const l of lines) {
    if (showingMig) continue;
    if (l.path.startsWith('/position') || l.path === '/playtime') continue;
    const old = lastVals.get(l.path);
    if (old !== undefined && old !== l.text) changed.set(l.path, now);
    if (old === undefined && lastVals.size > 0) changed.set(l.path, now);
    lastVals.set(l.path, l.text);
  }
  const lineClass = (l: Line) => {
    if (prevMig) {
      const was = prevMig.get(l.path);
      if (was === undefined) return 'add';
      return was !== l.text ? 'chg' : '';
    }
    const t = changed.get(l.path);
    return t !== undefined && now - t < 1.5 ? 'chg' : '';
  };
  const cfg = useMemo(() => (fmt === 'cfg' ? configText(toDict(gs), 2, wallClock()) : ''), [fmt, gs.gold, gs.room, Object.keys(gs.opened).length, Object.keys(gs.flags).length, Math.round(gs.px / 8), Math.round(gs.py / 8), Math.floor(gs.playtime)]);

  const slotRow = (n: number) => {
    const { data } = readSlot(n);
    const meta = (data?.meta as Dict) ?? null;
    const f = files[n] ?? {};
    return (
      <button key={n} className={'world-slot' + (slot === n ? ' on' : '')} onClick={() => setSlot(n)} aria-pressed={slot === n}>
        <b>{n}</b>
        <span>{meta ? `${String(meta.room)}  ${formatTime(Number(meta.playtime))}  saved ${String(meta.saved_at).slice(11)}` : 'empty'}</span>
        <span>{['main', 'bak', 'tmp'].filter((k) => f[k as keyof SlotFiles]).map((k) => (k === 'main' ? slotName(n) : slotName(n) + '.' + k)).join('  ') || 'no files'}</span>
      </button>
    );
  };

  const side = (
    <>
      <div className="world-k">Save slots (user://saves)</div>
      <div className="world-slots">{[1, 2, 3].map(slotRow)}</div>
      <div className="world-btnrow">
        <Btn primary onClick={() => saveSlot(slot)}>
          Save
        </Btn>
        <Btn onClick={() => loadSlot(slot)}>Load</Btn>
        <Btn
          onClick={() => {
            Object.assign(gs, newGame());
            setMig({ active: false, step: 0, data: {}, prev: {}, error: '', done: false });
            setMessage('New game: GameState.new_game().');
          }}
        >
          New game
        </Btn>
      </div>
      {mode !== 'live' && (
        <div className="world-btnrow">
          {mode === 'slots' ? (
            <Btn onClick={() => saveSlot(slot, true)}>Simulate a crash mid-save</Btn>
          ) : (
            <>
              <Btn onClick={() => startMigration(1)}>Load a version-1 save</Btn>
              <Btn onClick={() => startMigration(3)}>Load a version-3 save</Btn>
            </>
          )}
        </div>
      )}
      {mode === 'live' && (
        <div className="world-btnrow">
          <Btn onClick={() => startMigration(1)}>Load a version-1 save</Btn>
        </div>
      )}
      <Readout
        rows={[
          ['\\text{room}', gs.room],
          ['\\text{opened ids}', String(Object.keys(gs.opened).length)],
          ['\\text{JSON size}', `${JSON.stringify(sortDeep(liveDict), null, '\t').length} bytes`],
        ]}
      />
    </>
  );

  const migPanel = mig.active && (
    <div className="world-panel">
      <div className="world-k">SaveMigrations.migrate()</div>
      {mig.error ? (
        <div className="world-note">{mig.error}</div>
      ) : (
        <ol className="world-migrate-log">
          {MIG_STEPS.map((s, i) => (
            <li key={i} className={i === mig.step - 1 ? 'on' : ''} style={{ opacity: i < mig.step ? 1 : 0.5 }}>
              {s.label}
              <br />
              <span className="world-note">{s.gd}</span>
            </li>
          ))}
          <li className={mig.done ? 'on' : ''} style={{ opacity: mig.done ? 1 : 0.5 }}>
            GameState.from_dict(data)
          </li>
        </ol>
      )}
      <div className="world-btnrow">
        <Btn primary onClick={nextStep} disabled={mig.done}>
          {mig.error ? 'Close' : mig.step < MIG_STEPS.length ? 'Next step' : 'Load into GameState'}
        </Btn>
      </div>
    </div>
  );

  return (
    <FigureLayout side={side}>
      <div className="world-stack">
        <GameCanvas
          width={W}
          height={H}
          update={update}
          draw={draw}
          touchButtons={['up', 'down', 'left', 'right', 'interact']}
          keysHint={<Keys items={[['WASD / arrows', 'walk'], ['F / Enter', 'open, pick up, talk'], ['door on the right', 'north road']]} />}
          label="save inspector: walk with arrows, F to open chests, pick up coins and talk; the save JSON updates beside the game"
        />
        <div className="world-note" aria-live="polite">
          {message || 'Open the chest, pick up the coins, talk to the elder, then save and load.'}
        </div>
        <div className="world-save-grid">
          <div className="world-panel">
            <div className="world-k code">
              {showingMig ? `migrating: version ${String(mig.data.version)}` : fmt === 'json' ? 'JSON.stringify(GameState.to_dict(), "\\t")' : 'the same state as a ConfigFile'}
            </div>
            {mode === 'slots' && !showingMig && <SegControl label="format" value={fmt} options={[{ v: 'json', label: 'JSON' }, { v: 'cfg', label: 'ConfigFile' }]} onChange={setFmt} />}
            {fmt === 'cfg' && !showingMig ? (
              <pre className="world-json">{cfg}</pre>
            ) : (
              <pre className="world-json">
                {lines.map((l, i) => (
                  <span key={i} className={lineClass(l)}>
                    {l.text + '\n'}
                  </span>
                ))}
              </pre>
            )}
          </div>
          {migPanel || (
            <div className="world-panel">
              <div className="world-k">What is not in the file</div>
              <div className="world-note">
                Enemies, the camera, the HUD, max HP and the quest log are rebuilt on load. Each object in the room checks <code>GameState.is_opened(persist_id)</code> in <code>_ready</code>; walk to the north road and back to see the village rebuilt from scratch with its chest still open.
              </div>
            </div>
          )}
        </div>
      </div>
    </FigureLayout>
  );
}

function sortDeep(v: Json | Dict): Json {
  if (Array.isArray(v)) return v.map((x) => sortDeep(x));
  if (v && typeof v === 'object') return Object.fromEntries(Object.keys(v).sort().map((k) => [k, sortDeep((v as Dict)[k])]));
  return v as Json;
}
const slotName = (n: number) => `slot_${n}.json`;
function formatTime(s: number) {
  const t = Math.floor(s);
  return `${Math.floor(t / 3600)}:${String(Math.floor(t / 60) % 60).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`;
}
function wallClock() {
  const d = new Date();
  const p = (x: number) => String(x).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

export const validateSave = (s: VizSpec) => (s.mode === undefined || ['live', 'slots', 'migrate'].includes(s.mode as string) ? null : "mode must be 'live', 'slots' or 'migrate'");
