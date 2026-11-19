import { it } from 'vitest';
import { BattleSim, ABILITIES, type BattleInput } from './battleSim';
import type { Action } from '../game/input';
class FI implements BattleInput { down=new Set<Action>(); pressed=new Set<Action>(); vector():[number,number]{const x=(this.down.has('right')?1:0)-(this.down.has('left')?1:0);const y=(this.down.has('down')?1:0)-(this.down.has('up')?1:0);const n=Math.hypot(x,y)||1;return [x/n,y/n];} isDown(a:Action){return this.down.has(a)} justPressed(a:Action){return this.pressed.has(a)} }
for (const mode of ['stagger','party','full'] as const) for (const tactics of [true,false]) it(mode+tactics, () => {
  for (const seed of [1,2,3]) {
  const sim = new BattleSim(mode, seed); const inp = new FI(); let wave1=0; let staggers=0; let prev=new Map();
  for (let f=0; f<300*60 && sim.outcome==='fighting'; f++) {
    inp.down.clear(); const c=sim.leader; const e=sim.nearestEnemy(c.x,c.y);
    if (e) { const d=Math.hypot(e.x-c.x,e.y-c.y);
      if (d>(c.def.ranged?60:16)) { if(e.x>c.x+2)inp.down.add('right'); if(e.x<c.x-2)inp.down.add('left'); if(e.y>c.y+2)inp.down.add('down'); if(e.y<c.y-2)inp.down.add('up'); }
      else if (f%10===0) inp.pressed.add('attack');
      if (tactics && f%60===0) for (const m of sim.party.members) { if (m.state==='ko'||m.queue.length||m.running) continue;
        if (sim.limit_enabled && m.limit>=100) sim.command(m.index,m.def.limit,null);
        else if (m.atb.segments()>=1){ const id=m.def.id==='kai'?(e.stagger?.state==='staggered'?'braver':'focus'):m.def.id==='lyra'?(e.weak==='ice'?'blizzard':'fire'):'bash'; if(m.mp>=ABILITIES[id].mp_cost) sim.command(m.index,id,e);} }
    }
    sim.update(1/60, inp); inp.pressed.clear();
    if (sim.wave===2 && !wave1) wave1=sim.clock;
    for (const en of sim.enemies) { const s=en.stagger?.state==='staggered'; if (s && !prev.get(en)) staggers++; prev.set(en,s); }
  }
  console.log(mode, 'tactics', tactics, 'seed', seed, sim.outcome, 'time', sim.clock.toFixed(1), 'wave1', wave1.toFixed(1), 'staggers', staggers, 'hp', sim.party.members.map(m=>m.health.health).join('/'));
  }
});
