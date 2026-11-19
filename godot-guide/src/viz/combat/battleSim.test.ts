// Unit tests for the battle simulation behind combat.battle (the GDScript-mirroring classes and
// scripted fights in every mode).
import { describe, it, expect } from 'vitest';
import { AtbGauge, StaggerComponent, BattleSim, PartyManager, ABILITIES, type BattleInput, type BattleMode, type Enemy } from './battleSim';
import type { Action } from '../game/input';

class FakeInput implements BattleInput {
  down = new Set<Action>();
  pressed = new Set<Action>();
  press(a: Action) {
    this.pressed.add(a);
  }
  vector(): [number, number] {
    const x = (this.down.has('right') ? 1 : 0) - (this.down.has('left') ? 1 : 0);
    const y = (this.down.has('down') ? 1 : 0) - (this.down.has('up') ? 1 : 0);
    const n = Math.hypot(x, y) || 1;
    return [x / n, y / n];
  }
  isDown(a: Action) {
    return this.down.has(a);
  }
  justPressed(a: Action) {
    return this.pressed.has(a);
  }
}

const DT = 1 / 60;
function step(sim: BattleSim, input: FakeInput, n = 1) {
  for (let i = 0; i < n; i++) {
    sim.update(DT, input);
    input.pressed.clear();
  }
}

describe('AtbGauge', () => {
  it('fills segments, emits segment_filled and spends whole segments', () => {
    const g = new AtbGauge();
    const filled: number[] = [];
    g.segment_filled.connect((n) => filled.push(n));
    g.add(150);
    expect(g.segments()).toBe(1);
    g.add(80);
    expect(g.value).toBe(200);
    expect(filled).toEqual([1, 2]);
    expect(g.spend(1)).toBe(true);
    expect(g.value).toBe(100);
    expect(g.spend(2)).toBe(false);
    g.tick(5); // passive 2/s
    expect(g.value).toBeCloseTo(110);
  });
});

describe('StaggerComponent', () => {
  it('pressure doubles gain, stagger sets 160% and abilities raise it, then it recovers', () => {
    const s = new StaggerComponent();
    s.apply_hit(40, false);
    expect(s.value).toBe(40);
    s.apply_hit(10, true);
    expect(s.state).toBe('pressured');
    expect(s.value).toBe(60);
    s.apply_hit(20, false);
    expect(s.state).toBe('staggered');
    expect(s.damage_multiplier).toBeCloseTo(1.6);
    s.raise_multiplier(0.25);
    expect(s.damage_multiplier).toBeCloseTo(1.85);
    expect(s.apply_hit(50, true)).toBe(0);
    for (let i = 0; i < 6 * 60 + 2; i++) s.tick(DT);
    expect(s.state).toBe('normal');
    expect(s.damage_multiplier).toBe(1);
  });
  it('decays after the delay', () => {
    const s = new StaggerComponent();
    s.apply_hit(50, false);
    for (let i = 0; i < 60 * 2; i++) s.tick(DT);
    expect(s.value).toBe(50);
    for (let i = 0; i < 60 * 2; i++) s.tick(DT);
    expect(s.value).toBeLessThan(50);
  });
});

describe('PartyManager', () => {
  it('moves the PlayerController and refuses KO members', () => {
    const sim = new BattleSim('party');
    const pm = sim.party;
    expect(pm).toBeInstanceOf(PartyManager);
    expect(pm.members.map((m) => m.controller)).toEqual(['player', 'ai', 'ai']);
    expect(pm.switch_to(2)).toBe(true);
    expect(pm.members.map((m) => m.controller)).toEqual(['ai', 'ai', 'player']);
    pm.members[1].health.damage(9999);
    expect(pm.members[1].state).toBe('ko');
    expect(pm.switch_to(1)).toBe(false);
    expect(pm.next_alive_index()).toBe(0);
  });
});

describe('BattleSim, atb mode, scripted keys', () => {
  it('attacking fills ATB, tactical slows time, Braver resolves on the dummy', () => {
    const sim = new BattleSim('atb');
    const inp = new FakeInput();
    const kai = sim.party.members[0];
    const dummy = sim.enemies[0];
    // walk to the dummy
    inp.down.add('right');
    let guard = 0;
    while (Math.hypot(dummy.x - kai.x, dummy.y - kai.y) > 16 && guard++ < 600) step(sim, inp);
    inp.down.clear();
    expect(guard).toBeLessThan(600);
    // mash attack until a segment fills
    let t = 0;
    while (kai.atb.segments() < 1 && t < 20) {
      inp.press('attack');
      step(sim, inp, 6);
      t += 6 * DT;
    }
    expect(kai.atb.segments()).toBe(1);
    expect(t).toBeLessThan(6); // a segment within a few seconds of attacking
    expect(kai.atb_from_hits).toBeGreaterThan(kai.atb_from_passive);
    // open tactical mode
    inp.press('tactical');
    step(sim, inp);
    expect(sim.menu).not.toBeNull();
    expect(sim.time_scale).toBeCloseTo(0.1);
    const clock0 = sim.clock;
    step(sim, inp, 60);
    expect(sim.clock - clock0).toBeCloseTo(0.1, 2); // one real second is 0.1 s of battle time
    // the cursor starts on Braver; confirm, then confirm the target
    expect(sim.menu!.entries[sim.menu!.cursor].ability.id).toBe('braver');
    inp.press('attack');
    step(sim, inp);
    expect(sim.menu!.level).toBe('target');
    inp.press('attack');
    step(sim, inp);
    expect(sim.menu).toBeNull();
    expect(kai.queue.length + (kai.running ? 1 : 0)).toBe(1);
    expect(kai.atb.segments()).toBe(0);
    const before = sim.floaters.length;
    step(sim, inp, 60);
    expect(kai.running).toBeNull();
    const big = sim.floaters.slice(before).find((f) => f.big);
    expect(big).toBeTruthy();
  });
  it('tactical works by tapping and by holding', () => {
    const sim = new BattleSim('atb');
    const inp = new FakeInput();
    inp.press('tactical');
    inp.down.add('tactical');
    step(sim, inp, 40); // held for about 0.67 s
    expect(sim.menu).not.toBeNull();
    inp.down.delete('tactical');
    step(sim, inp);
    expect(sim.menu).toBeNull(); // released after a hold: closes
    inp.press('tactical');
    step(sim, inp, 30); // a tap: stays open
    expect(sim.menu).not.toBeNull();
  });
  it('a disabled entry shows a message instead of queueing', () => {
    const sim = new BattleSim('atb');
    const inp = new FakeInput();
    inp.press('tactical');
    step(sim, inp);
    inp.press('attack');
    step(sim, inp);
    expect(sim.menu?.message).toBe('Not enough ATB');
    inp.press('tactical');
    step(sim, inp);
    expect(sim.menu).toBeNull();
  });
});

/** A simple bot: walk to the nearest enemy, attack, guard on telegraphs, spend ATB on abilities. */
function bot(sim: BattleSim, inp: FakeInput, frame: number) {
  inp.down.clear();
  const c = sim.leader;
  const e = sim.nearestEnemy(c.x, c.y);
  if (!e) return;
  const d = Math.hypot(e.x - c.x, e.y - c.y);
  const threat = (e.state === 'windup' || e.state === 'attack') && d < 40;
  if (threat) {
    inp.down.add('ability');
    return;
  }
  if (d > (c.def.ranged ? 60 : 16)) {
    if (e.x > c.x + 2) inp.down.add('right');
    if (e.x < c.x - 2) inp.down.add('left');
    if (e.y > c.y + 2) inp.down.add('down');
    if (e.y < c.y - 2) inp.down.add('up');
  } else if (frame % 8 === 0) inp.press('attack');
  if (frame % 30 === 0)
    for (const m of sim.party.members) {
      if (m.state === 'ko' || m.queue.length || m.running) continue;
      if (sim.limit_enabled && m.limit >= 100) sim.command(m.index, m.def.limit, null);
      else if (m.atb.segments() >= 1) {
        const id = m.def.id === 'kai' ? (e.stagger?.state === 'staggered' ? 'braver' : 'focus') : m.def.id === 'lyra' ? (m.health.health < 50 ? 'cure' : e.weak === 'ice' ? 'blizzard' : 'fire') : 'bash';
        if (m.mp >= ABILITIES[id].mp_cost) sim.command(m.index, id, id === 'cure' ? m : e);
      }
    }
}

function runBot(mode: BattleMode, seconds: number, seed = 3) {
  const sim = new BattleSim(mode, seed);
  const inp = new FakeInput();
  let staggers = 0;
  const seen = new Set<Enemy>();
  for (let f = 0; f < seconds * 60 && sim.outcome === 'fighting'; f++) {
    bot(sim, inp, f);
    step(sim, inp);
    for (const e of sim.enemies)
      if (e.stagger?.state === 'staggered' && !seen.has(e)) {
        seen.add(e);
        staggers++;
      } else if (e.stagger?.state !== 'staggered') seen.delete(e);
  }
  return { sim, staggers };
}

describe('BattleSim, scripted fights', () => {
  it('stagger mode: the skeleton gets staggered and the fight ends', () => {
    const { sim, staggers } = runBot('stagger', 180);
    expect(staggers).toBeGreaterThanOrEqual(1);
    expect(sim.outcome).not.toBe('fighting');
  });
  it('party mode: the bot wins in a sensible time, allies never spend ATB on their own', () => {
    const sim = new BattleSim('party', 5);
    const inp = new FakeInput();
    const lows = sim.party.members.map((m) => m.atb.value);
    let f = 0;
    for (; f < 240 * 60 && sim.outcome === 'fighting'; f++) {
      // only the leader acts; nobody issues commands
      inp.down.clear();
      const c = sim.leader;
      const e = sim.nearestEnemy(c.x, c.y);
      if (e && Math.hypot(e.x - c.x, e.y - c.y) > 16) {
        if (e.x > c.x + 2) inp.down.add('right');
        if (e.x < c.x - 2) inp.down.add('left');
        if (e.y > c.y + 2) inp.down.add('down');
        if (e.y < c.y - 2) inp.down.add('up');
      } else if (f % 8 === 0) inp.press('attack');
      step(sim, inp);
      sim.party.members.forEach((m, i) => {
        if (i > 0) expect(m.atb.value).toBeGreaterThanOrEqual(lows[i] - 1e-9);
        lows[i] = m.atb.value;
      });
    }
    expect(['victory', 'defeat']).toContain(sim.outcome);
  });
  it('full mode: a bot that uses tactics wins, in 30 to 150 seconds', () => {
    const { sim, staggers } = runBot('full', 240, 11);
    expect(sim.outcome).toBe('victory');
    expect(sim.clock).toBeGreaterThan(30);
    expect(sim.clock).toBeLessThan(150);
    expect(staggers).toBeGreaterThanOrEqual(2);
  });
  it('switching with Q moves control and the menu can command another member', () => {
    const sim = new BattleSim('party');
    const inp = new FakeInput();
    inp.press('switch');
    step(sim, inp);
    expect(sim.party.current_index).toBe(1);
    sim.party.members[2].atb.value = 100;
    inp.press('tactical');
    step(sim, inp);
    expect(sim.menu!.who).toBe(1);
    inp.press('right');
    step(sim, inp);
    expect(sim.menu!.who).toBe(2);
    // Bram: limit (disabled), Shield Bash, Provoke, items
    const bash = sim.menu!.entries.findIndex((x) => x.ability.id === 'bash');
    while (sim.menu!.cursor !== bash) {
      inp.press('down');
      step(sim, inp);
    }
    inp.press('attack');
    step(sim, inp);
    inp.press('attack');
    step(sim, inp);
    expect(sim.party.members[2].queue.length + (sim.party.members[2].running ? 1 : 0)).toBe(1);
  });
  it('defeat when everyone is down, and attack restarts', () => {
    const sim = new BattleSim('party');
    const inp = new FakeInput();
    for (const m of sim.party.members) m.health.damage(9999);
    step(sim, inp);
    expect(sim.outcome).toBe('defeat');
    step(sim, inp, 70);
    inp.press('attack');
    step(sim, inp);
    expect(sim.outcome).toBe('fighting');
    expect(sim.party.members.every((m) => m.health.health === m.def.max_hp)).toBe(true);
  });
});
