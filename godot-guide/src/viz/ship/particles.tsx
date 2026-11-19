// ship.particles — two emitters modelled on GPUParticles2D + ParticleProcessMaterial: dust at Kai's
// feet while he moves (continuous) and a spark burst when he attacks (one_shot, explosiveness 1).
// Emission follows Godot's model: `amount` slots, each re-emitted once per `lifetime`, spread over
// (1 - explosiveness) × lifetime. Velocity gets gravity, then linear damping, every step.
import { useMemo, useRef, useState } from 'react';
import type { VizSpec } from '../../content/types';
import { GameCanvas, Keys, clear, rect, text, drawFrame, animFrame, SHEETS, playSound, type Input } from '../game';
import { Slider, SegControl, Toggle, Readout, FigureLayout } from '../kit';
import { CodeBlock } from '../../ui/GameCells';

const W = 320, H = 180;

interface EmitterCfg {
  amount: number;
  lifetime: number;
  explosiveness: number;
  oneShot: boolean;
  localCoords: boolean;
  dirDeg: number; // direction, degrees (0 = right, -90 = up)
  spread: number; // degrees either side
  vMin: number;
  vMax: number;
  gravityY: number;
  damping: number;
}
interface P {
  alive: boolean;
  x: number;
  y: number;
  vx: number;
  vy: number;
  age: number;
  s: number;
}
class Emitter {
  slots: P[] = [];
  cycle = 0;
  emitting = false;
  ox = 0;
  oy = 0;
  constructor(public cfg: EmitterCfg) {}
  ensure() {
    const n = Math.round(this.cfg.amount);
    while (this.slots.length < n) this.slots.push({ alive: false, x: 0, y: 0, vx: 0, vy: 0, age: 0, s: 1 });
    if (this.slots.length > n) this.slots.length = n;
  }
  restart() {
    this.cycle = 0;
    this.emitting = true;
    this.emitSlotsBetween(-1e-9, 0);
  }
  private spawn(p: P) {
    const c = this.cfg;
    const a = ((c.dirDeg + (Math.random() * 2 - 1) * c.spread) * Math.PI) / 180;
    const v = c.vMin + Math.random() * (c.vMax - c.vMin);
    p.alive = true;
    p.age = 0;
    p.vx = Math.cos(a) * v;
    p.vy = Math.sin(a) * v;
    p.s = 0.6 + Math.random() * 0.4;
    // local_coords: store relative to the emitter; otherwise in world space
    p.x = c.localCoords ? 0 : this.ox;
    p.y = c.localCoords ? 0 : this.oy;
  }
  private emitSlotsBetween(t0: number, t1: number) {
    const c = this.cfg, n = this.slots.length;
    const window = c.lifetime * (1 - c.explosiveness);
    for (let i = 0; i < n; i++) {
      const te = (i / n) * window;
      if (te > t0 && te <= t1) this.spawn(this.slots[i]);
    }
  }
  step(dt: number) {
    const c = this.cfg;
    this.ensure();
    if (this.emitting) {
      const t0 = this.cycle;
      this.cycle += dt;
      if (this.cycle >= c.lifetime) {
        this.emitSlotsBetween(t0, c.lifetime);
        if (c.oneShot) this.emitting = false;
        else {
          this.cycle -= c.lifetime;
          this.emitSlotsBetween(-1e-9, this.cycle);
        }
      } else this.emitSlotsBetween(t0, this.cycle);
    }
    for (const p of this.slots) {
      if (!p.alive) continue;
      p.age += dt;
      if (p.age >= c.lifetime) {
        p.alive = false;
        continue;
      }
      p.vy += c.gravityY * dt; // gravity
      const sp = Math.hypot(p.vx, p.vy); // damping: lose `damping` px/s of speed per second
      if (sp > 0) {
        const ns = Math.max(0, sp - c.damping * dt);
        p.vx *= ns / sp;
        p.vy *= ns / sp;
      }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
    }
  }
  count() {
    let n = 0;
    for (const p of this.slots) if (p.alive) n++;
    return n;
  }
}

const DUST: EmitterCfg = { amount: 8, lifetime: 0.5, explosiveness: 0, oneShot: false, localCoords: false, dirDeg: -90, spread: 60, vMin: 8, vMax: 16, gravityY: -10, damping: 20 };
const SPARKS: EmitterCfg = { amount: 14, lifetime: 0.35, explosiveness: 1, oneShot: true, localCoords: false, dirDeg: -90, spread: 180, vMin: 60, vMax: 130, gravityY: 300, damping: 120 };

export function ParticleLab({ spec }: { spec: VizSpec }) {
  const [which, setWhich] = useState<'dust' | 'sparks'>((spec.emitter as 'dust' | 'sparks') ?? 'dust');
  const [dust, setDust] = useState<EmitterCfg>(DUST);
  const [sparks, setSparks] = useState<EmitterCfg>(SPARKS);
  const cfg = which === 'dust' ? dust : sparks;
  const setCfg = (k: keyof EmitterCfg) => (v: number | boolean) => (which === 'dust' ? setDust : setSparks)((o) => ({ ...o, [k]: v }));
  const em = useRef({ dust: new Emitter(DUST), sparks: new Emitter(SPARKS) }).current;
  em.dust.cfg = dust;
  em.sparks.cfg = sparks;
  const hero = useRef({ x: 90, y: 110, vx: 0, vy: 0, facing: 'side' as 'down' | 'up' | 'side', flip: false, t: 0, attackT: -1, dashT: -1 }).current;
  const [stats, setStats] = useState({ dust: 0, sparks: 0, speed: 0 });
  const n = useRef(0);

  const update = (dt: number, input: Input) => {
    const [ix, iy] = input.vector();
    const maxSpeed = hero.dashT >= 0 ? 220 : 90;
    if (input.justPressed('dash') && hero.dashT < 0 && (ix || iy)) hero.dashT = 0;
    if (hero.dashT >= 0) {
      hero.dashT += dt;
      if (hero.dashT > 0.15) hero.dashT = -1;
    }
    const tx = ix * maxSpeed, ty = iy * maxSpeed;
    const rate = (ix || iy ? (hero.dashT >= 0 ? 4000 : 900) : 1200) * dt;
    const dx = tx - hero.vx, dy = ty - hero.vy, d = Math.hypot(dx, dy);
    if (d <= rate) {
      hero.vx = tx;
      hero.vy = ty;
    } else {
      hero.vx += (dx / d) * rate;
      hero.vy += (dy / d) * rate;
    }
    hero.x = Math.max(24, Math.min(W - 24, hero.x + hero.vx * dt));
    hero.y = Math.max(40, Math.min(H - 12, hero.y + hero.vy * dt));
    if (ix || iy) {
      if (Math.abs(ix) > Math.abs(iy)) {
        hero.facing = 'side';
        hero.flip = ix < 0;
      } else hero.facing = iy < 0 ? 'up' : 'down';
    }
    hero.t += dt;
    const speed = Math.hypot(hero.vx, hero.vy);
    // dust.emitting = velocity.length() > 30.0
    em.dust.ox = hero.x;
    em.dust.oy = hero.y;
    em.dust.emitting = speed > 30;
    em.dust.step(dt);
    if (input.justPressed('attack')) {
      hero.attackT = 0;
      const fx = hero.facing === 'side' ? (hero.flip ? -16 : 16) : 0;
      const fy = hero.facing === 'up' ? -22 : hero.facing === 'down' ? 6 : -8;
      em.sparks.ox = hero.x + fx;
      em.sparks.oy = hero.y + fy;
      em.sparks.restart(); // one_shot: restart() fires one burst
      playSound('sfx_hit', 0.4);
    }
    if (hero.attackT >= 0) {
      hero.attackT += dt;
      if (hero.attackT > 0.3) hero.attackT = -1;
    }
    em.sparks.step(dt);
    if (++n.current % 6 === 0) setStats({ dust: em.dust.count(), sparks: em.sparks.count(), speed });
  };

  const draw = (ctx: CanvasRenderingContext2D) => {
    clear(ctx, '#7a6a4f');
    const ts = SHEETS['tiles_overworld'];
    if (ts) {
      const dirt = ts.tiles?.dirt ?? ts.tiles?.path ?? ts.tiles?.grass ?? 0;
      for (let y = 0; y < H; y += 16) for (let x = 0; x < W; x += 16) drawFrame(ctx, 'tiles_overworld', dirt, x, y);
    }
    const drawDust = (p: P, ox: number, oy: number, life: number) => {
      const k = p.age / life;
      const x = p.x + ox, y = p.y + oy;
      if (SHEETS['fx_dust']) {
        const a = SHEETS['fx_dust'].anims?.play;
        const fr = a ? a.frames[Math.min(a.frames.length - 1, Math.floor(k * a.frames.length))] : 0;
        drawFrame(ctx, 'fx_dust', fr, x, y, { anchored: true, alpha: 1 - k * 0.6 });
      } else {
        const r = 1.5 + 2.5 * k * p.s;
        ctx.fillStyle = `rgba(235,225,205,${(1 - k) * 0.8})`;
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fill();
      }
    };
    // dust behind the hero
    for (const p of em.dust.slots) if (p.alive) drawDust(p, dust.localCoords ? em.dust.ox : 0, dust.localCoords ? em.dust.oy : 0, dust.lifetime);
    const sp = Math.hypot(hero.vx, hero.vy);
    const anim = hero.attackT >= 0 ? 'attack_' + hero.facing : (sp > 5 ? 'walk_' : 'idle_') + hero.facing;
    const at = hero.attackT >= 0 ? hero.attackT : hero.t;
    if (SHEETS['hero']) drawFrame(ctx, 'hero', animFrame('hero', anim, at), hero.x, hero.y, { anchored: true, flipH: hero.flip });
    else rect(ctx, hero.x - 6, hero.y - 18, 12, 18, '#3b6fd1');
    // sparks on top
    for (const p of em.sparks.slots) {
      if (!p.alive) continue;
      const k = p.age / sparks.lifetime;
      const ox = sparks.localCoords ? em.sparks.ox : 0, oy = sparks.localCoords ? em.sparks.oy : 0;
      const x = p.x + ox, y = p.y + oy;
      const len = Math.max(1, Math.hypot(p.vx, p.vy) * 0.03);
      const v = Math.hypot(p.vx, p.vy) || 1;
      ctx.strokeStyle = k < 0.4 ? '#fffbe0' : k < 0.75 ? '#ffd65a' : '#ff8a3a';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(Math.round(x) + 0.5, Math.round(y) + 0.5);
      ctx.lineTo(Math.round(x - (p.vx / v) * len) + 0.5, Math.round(y - (p.vy / v) * len) + 0.5);
      ctx.stroke();
    }
    // emitter markers
    rect(ctx, em.dust.ox - 1, em.dust.oy - 1, 3, 3, 'rgba(255,255,255,0.5)', true);
    text(ctx, `dust ${stats.dust}/${Math.round(dust.amount)}  sparks ${stats.sparks}/${Math.round(sparks.amount)}`, 6, 10, '#ffffff');
  };

  const code = useMemo(() => {
    const c = cfg;
    const rad = (c.dirDeg * Math.PI) / 180;
    const dx = Math.cos(rad), dy = Math.sin(rad);
    const name = which === 'dust' ? 'Dust' : 'Sparks';
    return `extends Node2D
## Builds the ${which} emitter in code. Every line matches a property in the Inspector.

func make_${which}() -> GPUParticles2D:
	var mat := ParticleProcessMaterial.new()
	mat.direction = Vector3(${dx.toFixed(2)}, ${dy.toFixed(2)}, 0.0)
	mat.spread = ${c.spread.toFixed(1)}
	mat.initial_velocity_min = ${c.vMin.toFixed(1)}
	mat.initial_velocity_max = ${c.vMax.toFixed(1)}
	mat.gravity = Vector3(0.0, ${c.gravityY.toFixed(1)}, 0.0)
	mat.damping_min = ${c.damping.toFixed(1)}
	mat.damping_max = ${c.damping.toFixed(1)}

	var p := GPUParticles2D.new()
	p.name = "${name}"
	p.process_material = mat
	p.amount = ${Math.round(c.amount)}
	p.lifetime = ${c.lifetime.toFixed(2)}
	p.explosiveness = ${c.explosiveness.toFixed(2)}
	p.one_shot = ${c.oneShot}
	p.local_coords = ${c.localCoords}
	return p
`;
  }, [cfg, which]);

  const rateS = cfg.amount / cfg.lifetime;
  return (
    <FigureLayout
      side={
        <>
          <SegControl label="edit" value={which} options={[{ v: 'dust', label: 'dust' }, { v: 'sparks', label: 'sparks' }]} onChange={setWhich} />
          <Slider label="amount" value={cfg.amount} min={1} max={64} step={1} onChange={setCfg('amount')} />
          <Slider label="lifetime" value={cfg.lifetime} min={0.1} max={2} step={0.05} onChange={setCfg('lifetime')} fmt={(v) => v.toFixed(2) + ' s'} />
          <Slider label="explosiveness" value={cfg.explosiveness} min={0} max={1} step={0.05} onChange={setCfg('explosiveness')} />
          <Slider label="spread" value={cfg.spread} min={0} max={180} step={1} onChange={setCfg('spread')} fmt={(v) => v + '°'} />
          <Slider label="velocity min" value={cfg.vMin} min={0} max={200} step={1} onChange={(v) => setCfg('vMin')(Math.min(v, cfg.vMax))} />
          <Slider label="velocity max" value={cfg.vMax} min={0} max={200} step={1} onChange={(v) => setCfg('vMax')(Math.max(v, cfg.vMin))} />
          <Slider label="gravity y" value={cfg.gravityY} min={-200} max={600} step={5} onChange={setCfg('gravityY')} />
          <Slider label="damping" value={cfg.damping} min={0} max={400} step={5} onChange={setCfg('damping')} />
          <Toggle label="local_coords" value={cfg.localCoords} onChange={setCfg('localCoords')} />
          {which === 'sparks' && <Toggle label="one_shot" value={cfg.oneShot} onChange={setCfg('oneShot')} />}
          <Readout
            rows={[
              ['\\text{rate} = \\text{amount}/\\text{lifetime}', `${rateS.toFixed(1)} /s`],
              ['\\text{alive}', `${which === 'dust' ? stats.dust : stats.sparks} of ${Math.round(cfg.amount)}`],
              ['|\\mathbf{v}_{\\text{Kai}}|', `${stats.speed.toFixed(0)} px/s`],
            ]}
          />
        </>
      }
      below={<CodeBlock code={code} file={`scripts/fx_${which}.gd`} compact />}
    >
      <GameCanvas
        width={W}
        height={H}
        update={update}
        draw={draw}
        touchButtons={['up', 'down', 'left', 'right', 'attack', 'dash']}
        keysHint={<Keys items={[['WASD / arrows', 'move (dust)'], ['K', 'dash'], ['J', 'attack (sparks)']]} />}
        label="particles lab: move to raise dust, attack to burst sparks"
      />
    </FigureLayout>
  );
}
