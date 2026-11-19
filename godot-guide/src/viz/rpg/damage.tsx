// rpg.damage — step through DamageCalc.calculate for a chosen attacker, ability and target. Each step
// highlights the GDScript lines that run and shows the value after them. Mirrors damage_calc.gd.
import { useEffect, useMemo, useRef, useState } from 'react';
import type { VizSpec } from '../../content/types';
import { Slider, SegControl, Toggle, FigureLayout, usePlayer } from '../kit';
import { drawFrame, animFrame, SHEETS, text, rect } from '../game';
import { LiveListing } from './common';
import { ATTACKS, CHARS, CHAR_IDS, ENEMIES, ENEMY_IDS, ELEMENT_LABEL, StatBlock, applyCharacter, applyEnemy, applyLoadout, calculate, weaponElement, pct, type CharId, type EnemyId, type LoadoutState } from './model';

const LISTING = `static func calculate(attacker: StatBlock, target: StatBlock, power: float, element: Rpg.Element,
		is_magic: bool, stagger_multiplier := 1.0, crit_roll := 1.0) -> Result:
	var r := Result.new()
	# 1. Offence: the attacker's scaling stat times the ability's power.
	var offence := attacker.get_stat(Rpg.Stat.MAGIC if is_magic else Rpg.Stat.ATTACK)
	var x := power * offence
	r.steps.append(x)
	# 2. Defence, ratio form. DAMAGE_TAKEN is 50 under Barrier.
	var defence := target.get_stat(Rpg.Stat.MAGIC_DEFENCE if is_magic else Rpg.Stat.DEFENCE)
	x *= DEFENCE_SCALE / (DEFENCE_SCALE + defence)
	x *= target.get_stat(Rpg.Stat.DAMAGE_TAKEN) / 100.0
	r.steps.append(x)
	# 3. Element: 2 weak, 1 neutral, 0.5 resist, 0 immune, -1 absorb.
	r.element_multiplier = target.element_multiplier(element)
	x *= r.element_multiplier
	r.steps.append(x)
	# 4. Stagger.
	x *= stagger_multiplier
	r.steps.append(x)
	# 5. Critical hit.
	r.crit = crit_roll < attacker.get_stat(Rpg.Stat.CRIT) / 100.0
	if r.crit:
		x *= CRIT_MULTIPLIER
	r.steps.append(x)
	# 6. Round once, at the very end.
	if r.element_multiplier == 0.0:
		r.amount = 0
	elif x < 0.0:
		r.amount = mini(-1, roundi(x))
	else:
		r.amount = maxi(1, roundi(x))
	r.steps.append(r.amount)
	return r`.split('\n');
// listing lines (0-based) for each step; step 0 = the call itself
const STEP_LINES: number[][] = [[0, 1, 2], [3, 4, 5, 6], [7, 8, 9, 10, 11], [12, 13, 14, 15], [16, 17, 18], [19, 20, 21, 22, 23], [24, 25, 26, 27, 28, 29, 30, 31, 32]];
const STAGES = ['offence', 'defence', 'element', 'stagger', 'crit', 'final'];

const LOADOUTS: Record<CharId, LoadoutState> = {
  kai: { weapon: 'iron_sword', armour: 'leather_vest', accessory: null, weaponShards: [null, null], armourShards: [null] },
  lyra: { weapon: 'oak_staff', armour: 'mage_robe', accessory: null, weaponShards: [{ shard: 'fire', level: 1 }, null], armourShards: [null, null] },
  bram: { weapon: 'iron_mace', armour: 'chain_mail', accessory: 'guard_amulet', weaponShards: [null], armourShards: [null, null] },
};
const W = 320, H = 84;
const f2 = (x: number) => (Number.isInteger(x) ? String(x) : x.toFixed(2));

export function DamagePipeline({ spec }: { spec: VizSpec }) {
  const [char, setChar] = useState<CharId>((spec.attacker as CharId) ?? 'kai');
  const [ring, setRing] = useState(false);
  const [abilityName, setAbility] = useState<string>((spec.ability as string) ?? 'Rising Slash');
  const [enemy, setEnemy] = useState<EnemyId>((spec.target as EnemyId) ?? 'skeleton');
  const [staggered, setStaggered] = useState(false);
  const [staggerMult, setStaggerMult] = useState(1.6);
  const [barrier, setBarrier] = useState(false);
  const [critRoll, setCritRoll] = useState(0.5);
  const { i, setI, controls } = usePlayer(7, { interval: 900 });
  const abilities = ATTACKS.filter((a) => a.user.includes(char));
  const ability = abilities.find((a) => a.name === abilityName) ?? abilities[0];

  const { attacker, target, res, element } = useMemo(() => {
    const lo: LoadoutState = { ...LOADOUTS[char], accessory: char === 'kai' && ring ? 'power_ring' : LOADOUTS[char].accessory };
    const a = new StatBlock();
    applyCharacter(a, CHARS[char], 5);
    applyLoadout(a, lo);
    const t = new StatBlock();
    applyEnemy(t, ENEMIES[enemy]);
    if (barrier) t.setSource('status:barrier', [pct('DAMAGE_TAKEN', -50)]);
    const el = ability.weaponElement && weaponElement(lo) !== 'NONE' ? weaponElement(lo) : ability.element;
    return { attacker: a, target: t, element: el, res: calculate(a, t, ability.power, el, ability.isMagic, staggered ? staggerMult : 1, critRoll) };
  }, [char, ring, ability, enemy, barrier, staggered, staggerMult, critRoll]);

  // restart the walk-through when an input changes
  const key = `${char}${ring}${ability.name}${enemy}${barrier}${staggered}${staggerMult}${critRoll}`;
  const lastKey = useRef(key);
  useEffect(() => {
    if (lastKey.current !== key) {
      lastKey.current = key;
      setI(0);
    }
  }, [key, setI]);

  const atkStat = ability.isMagic ? 'magic' : 'attack';
  const defStat = ability.isMagic ? 'magic def.' : 'defence';
  const crit = attacker.get('CRIT');
  const explain = [
    `${CHARS[char].name} uses ${ability.name}: power ${ability.power}, ${ability.isMagic ? 'magic' : 'physical'}, element ${ELEMENT_LABEL[element]}.`,
    `offence = power × ${atkStat} = ${ability.power} × ${res.offence} = ${f2(res.steps[0])}`,
    `× 100 / (100 + ${res.defence}) × ${res.damageTaken}/100 = ${f2(res.steps[1])}   (${ENEMIES[enemy].name} ${defStat} ${res.defence}${barrier ? ', Barrier' : ''})`,
    `× element ${res.elementMult} = ${f2(res.steps[2])}   (${ELEMENT_LABEL[element]}: ${res.elementMult === 2 ? 'weak' : res.elementMult === 0.5 ? 'resist' : res.elementMult === 0 ? 'immune' : res.elementMult === -1 ? 'absorb' : 'neutral'})`,
    `× stagger ${staggered ? staggerMult : 1} = ${f2(res.steps[3])}`,
    `crit if ${critRoll.toFixed(2)} < ${crit}/100: ${res.crit ? 'yes, × 1.5' : 'no'} → ${f2(res.steps[4])}`,
    `round once: ${res.amount}${res.amount < 0 ? ' (absorbed: the target heals)' : res.elementMult === 0 ? ' (immune)' : ''}`,
  ];

  const draw = (ctx: CanvasRenderingContext2D, t: number) => {
    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = '#2c2840';
    ctx.fillRect(0, 0, W, H);
    rect(ctx, 0, H - 14, W, 14, '#3a3550');
    const hero = CHARS[char].sheet;
    const anim = ability.isMagic ? 'cast' : i >= 1 && i <= 2 ? 'attack_side' : 'idle_side';
    drawFrame(ctx, hero, animFrame(hero, anim, t), 70, H - 12, { anchored: true, scale: 1 });
    const ed = ENEMIES[enemy];
    const big = enemy === 'golem';
    const hurt = i >= 6 && res.amount > 0;
    const eanim = hurt && SHEETS[enemy]?.anims?.hurt ? 'hurt' : ed.anim;
    drawFrame(ctx, enemy, animFrame(enemy, eanim, t), big ? 238 : 246, H - 12, { anchored: true, flipH: enemy !== 'golem', flash: hurt ? Math.max(0, 1 - (t % 1) * 3) : 0 });
    if (i >= 6) {
      const colour = res.amount < 0 ? '#7be07b' : res.crit ? '#ffd65a' : res.elementMult === 0 ? '#c0bed4' : '#ffffff';
      const label = res.elementMult === 0 ? 'Immune' : res.amount < 0 ? `+${-res.amount}` : res.crit ? `${res.amount}!` : String(res.amount);
      text(ctx, label, 246, 20 - Math.min(8, (t % 2) * 10), colour, 'center');
    }
    if (staggered) text(ctx, 'STAGGERED', 246, H - 3, '#f8925e', 'center');
    if (barrier) text(ctx, 'BARRIER', 246, 10, '#9aeaee', 'center');
  };

  return (
    <FigureLayout
      side={
        <>
          <SegControl label="attacker" value={char} options={CHAR_IDS.map((id) => ({ v: id, label: CHARS[id].name }))} onChange={setChar} />
          {char === 'kai' && <Toggle label="Power Ring (+10% attack)" value={ring} onChange={setRing} />}
          <label className="rpg-row rpg-small">
            <span className="ctl-label">ability</span>
            <select className="rpg-select" value={ability.name} onChange={(e) => setAbility(e.target.value)}>
              {abilities.map((a) => (
                <option key={a.name} value={a.name}>
                  {a.name} ({a.power}, {a.isMagic ? 'magic' : 'phys.'}{a.element !== 'NONE' ? ', ' + ELEMENT_LABEL[a.element] : ''})
                </option>
              ))}
            </select>
          </label>
          <SegControl label="target" value={enemy} options={ENEMY_IDS.map((id) => ({ v: id, label: ENEMIES[id].name }))} onChange={setEnemy} />
          <Toggle label="target staggered" value={staggered} onChange={setStaggered} />
          {staggered && <Slider label="stagger ×" value={staggerMult} min={1} max={3} step={0.1} onChange={setStaggerMult} fmt={(v) => v.toFixed(1)} />}
          <Toggle label="Barrier on target (damage taken 50)" value={barrier} onChange={setBarrier} />
          <Slider label="crit_roll" value={critRoll} min={0} max={1} step={0.01} onChange={setCritRoll} fmt={(v) => v.toFixed(2)} />
          <div className="rpg-muted">
            crit chance {crit}%: a roll below {(crit / 100).toFixed(2)} crits.
          </div>
        </>
      }
      below={<LiveListing lines={LISTING} active={new Set(STEP_LINES[i])} file="scripts/rpg/damage_calc.gd" />}
    >
      <div className="rpg-col">
        <MiniScreen draw={draw} />
        {controls}
        <div className="rpg-stages">
          {STAGES.map((s, k) => (
            <div key={s} className={'rpg-stage' + (k + 1 === i ? ' on' : k + 1 > i ? ' later' : '')} onClick={() => setI(k + 1)}>
              {s}
              <b>{f2(Math.round(res.steps[k] * 100) / 100)}</b>
            </div>
          ))}
        </div>
        <div className="rpg-formula">{explain[i]}</div>
      </div>
    </FigureLayout>
  );
}

/** A tiny always-animating canvas for the attacker/target strip. */
function MiniScreen({ draw }: { draw: (ctx: CanvasRenderingContext2D, t: number) => void }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const cb = useRef(draw);
  cb.current = draw;
  useEffect(() => {
    let raf = 0;
    const t0 = performance.now();
    const loop = () => {
      raf = requestAnimationFrame(loop);
      const c = ref.current;
      if (c) cb.current(c.getContext('2d')!, (performance.now() - t0) / 1000);
    };
    loop();
    return () => cancelAnimationFrame(raf);
  }, []);
  return <canvas ref={ref} width={W} height={H} className="rpg-sprite" style={{ width: '100%', maxWidth: 520, aspectRatio: `${W} / ${H}` }} aria-label="attacker and target" />;
}
