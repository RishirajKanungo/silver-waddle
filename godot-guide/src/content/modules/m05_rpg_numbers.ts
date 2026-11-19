import { md, gd, type Module } from '../types';

const FORMULAS = gd`
class_name DamageFormulas
## Three shapes of damage formula side by side, for comparing and testing.
## r01's DamageCalc uses the divisive one, with k = 100, inside its full pipeline.


## Each point of defence blocks one point of damage. Floored at 1 so a hit is never useless.
static func subtractive(atk: int, defence: int) -> int:
    return maxi(atk - defence, 1)


## Defence k halves the damage, 3k quarters it. Never reaches zero.
static func divisive(atk: int, defence: int, k: float = 100.0) -> int:
    return maxi(roundi(atk * k / (k + defence)), 1)


## Defence measured against the attacker's own attack: equal values halve the damage.
static func relative(atk: int, defence: int) -> int:
    if atk + defence <= 0:
        return 0
    return maxi(roundi(float(atk * atk) / float(atk + defence)), 1)
`;

const DAMAGE_TABLE = gd`
extends Node
## Prints hits to kill for Kai against each enemy under every formula. Run the scene with F6.

const ENEMIES := [
    {"name": "slime", "hp": 40, "defence": 4},
    {"name": "bat", "hp": 28, "defence": 2},
    {"name": "skeleton", "hp": 90, "defence": 14},
    {"name": "golem", "hp": 600, "defence": 30},
]

@export var kai_attack := 20


func _ready() -> void:
    print("enemy      subtractive  divisive  relative   (hits to kill, atk %d)" % kai_attack)
    for e in ENEMIES:
        var hp: int = e.hp
        var defence: int = e.defence
        var sub := DamageFormulas.subtractive(kai_attack, defence)
        var div := DamageFormulas.divisive(kai_attack, defence)
        var rel := DamageFormulas.relative(kai_attack, defence)
        print("%-10s %11d  %8d  %8d" % [e.name, ceili(float(hp) / sub), ceili(float(hp) / div), ceili(float(hp) / rel)])
`;

const XP_CURVE = gd`
class_name XpCurve
extends Resource
## How much XP each level costs. Saved as resources/xp_curve.tres and shared by the party.

enum Shape { LINEAR, POWER, EXPONENTIAL }

@export var shape := Shape.POWER
@export var base := 100.0  ## XP from level 1 to 2
@export var exponent := 1.5  ## POWER only
@export var growth := 1.15  ## EXPONENTIAL only: each level costs this many times the last
@export var max_level := 30


## XP needed to go from level to level + 1.
func xp_to_next(level: int) -> int:
    match shape:
        Shape.LINEAR:
            return roundi(base * level)
        Shape.POWER:
            return roundi(base * pow(level, exponent))
        _:
            return roundi(base * pow(growth, level - 1))


## Total XP needed to reach level, starting from 0 XP at level 1.
func total_xp(level: int) -> int:
    var total := 0
    for k in range(1, level):
        total += xp_to_next(k)
    return total


## The level a character with this much total XP has reached.
func level_for_xp(xp: int) -> int:
    var level := 1
    while level < max_level and xp >= total_xp(level + 1):
        level += 1
    return level
`;

const PROGRESSION = gd`
extends Node
## One character's XP and level, measured against a shared XpCurve.

signal level_gained(new_level: int)

@export var curve: XpCurve

var level := 1
var xp_into_level := 0  ## XP earned since reaching the current level


func add_xp(amount: int) -> void:
    if level >= curve.max_level:
        return
    xp_into_level += amount
    # a big reward can be worth several levels: keep paying out while there is enough
    while level < curve.max_level and xp_into_level >= curve.xp_to_next(level):
        xp_into_level -= curve.xp_to_next(level)
        level += 1
        level_gained.emit(level)
    if level >= curve.max_level:
        xp_into_level = 0


## 0..1 progress through the current level, for an XP bar.
func level_progress() -> float:
    if level >= curve.max_level:
        return 1.0
    return float(xp_into_level) / curve.xp_to_next(level)
`;

const XP_TEST = gd`
extends Node
## Checks the XP curve and the carry-over rule. Attach to a test scene and press F6.

@export var curve: XpCurve

@onready var progression: Node = $Progression


func _ready() -> void:
    for level in [2, 5, 10, 20]:
        print("level %2d: %6d to next, %7d total" % [level, curve.xp_to_next(level), curve.total_xp(level)])
    progression.level_gained.connect(func(l: int) -> void: print("reached level ", l))
    # exactly enough for level 2, then one large reward worth several levels
    progression.add_xp(curve.xp_to_next(1))
    progression.add_xp(curve.total_xp(6) - curve.total_xp(2) + 10)
    print("now level %d with %d XP into it" % [progression.level, progression.xp_into_level])
    print("level for 5000 total XP: ", curve.level_for_xp(5000))
`;

const DROP_TEST = gd`
extends Node
## Rolls a weighted drop table many times and compares counts with the expected shares.

const TABLE := [
    {"item": "nothing", "weight": 50.0},
    {"item": "slime jelly", "weight": 30.0},
    {"item": "potion", "weight": 15.0},
    {"item": "ether", "weight": 4.0},
    {"item": "fire shard", "weight": 1.0},
]

var rng := RandomNumberGenerator.new()


## Index of the chosen entry: roll in [0, total) and walk the cumulative weights.
func pick_index(table: Array) -> int:
    var total := 0.0
    for entry in table:
        total += entry.weight
    var roll := rng.randf() * total
    for i in table.size():
        if roll < table[i].weight:
            return i
        roll -= table[i].weight
    return table.size() - 1  # only reached through floating-point rounding


func _ready() -> void:
    rng.seed = 7  # same results every run, so you can compare
    var counts := []
    counts.resize(TABLE.size())
    counts.fill(0)
    var rolls := 10000
    for n in rolls:
        counts[pick_index(TABLE)] += 1
    for i in TABLE.size():
        var expected: float = TABLE[i].weight
        print("%-12s %5d   (%.1f%% vs %.1f%% expected)" % [TABLE[i].item, counts[i], 100.0 * counts[i] / rolls, expected])
`;

const CRIT_PRD = gd`
extends Node
## Crits with a pseudo-random distribution: the chance starts low and rises after every miss,
## so long droughts and long streaks are both rare, and the average rate stays crit_rate.

@export_range(0.05, 0.5) var crit_rate := 0.2

var rng := RandomNumberGenerator.new()
var _c := 0.0  ## added to the chance after every attack; found from crit_rate
var _chance := 0.0


func _ready() -> void:
    _c = prd_constant(crit_rate)
    _test(10000)


func roll_crit() -> bool:
    _chance += _c
    if rng.randf() < _chance:
        _chance = 0.0
        return true
    return false


## The c whose long-run crit rate is p: binary search on the expected gap between crits.
static func prd_constant(p: float) -> float:
    var lo := 0.0
    var hi := p
    for i in 50:
        var mid := (lo + hi) / 2.0
        if 1.0 / _expected_gap(mid) < p:
            lo = mid
        else:
            hi = mid
    return (lo + hi) / 2.0


static func _expected_gap(c: float) -> float:
    var expected := 0.0
    var no_crit_yet := 1.0
    var n := 1
    while no_crit_yet > 1e-9:
        var chance := minf(1.0, c * n)
        expected += n * no_crit_yet * chance
        no_crit_yet *= 1.0 - chance
        n += 1
    return expected


func _test(attacks: int) -> void:
    var crits := 0
    var drought := 0
    var longest := 0
    for i in attacks:
        if roll_crit():
            crits += 1
            drought = 0
        else:
            drought += 1
            longest = maxi(longest, drought)
    print("c = %.4f, crit rate %.3f, longest drought %d" % [_c, float(crits) / attacks, longest])
`;

const BALANCE = gd`
@tool
extends EditorScript
## A balance sheet as code. Open in the script editor and use File > Run (Ctrl+Shift+X):
## prints seconds to kill for each party member against each enemy.

const PARTY := [
    {"name": "Kai", "attack": 20, "hits_per_second": 2.5},
    {"name": "Lyra", "attack": 26, "hits_per_second": 1.2},
    {"name": "Bram", "attack": 16, "hits_per_second": 1.6},
]
const ENEMIES := [
    {"name": "slime", "hp": 40, "defence": 4},
    {"name": "skeleton", "hp": 90, "defence": 14},
    {"name": "golem", "hp": 600, "defence": 30},
]
const CRIT_CHANCE := 0.1
const CRIT_MULTIPLIER := 1.5


func _run() -> void:
    for m in PARTY:
        var line: String = "%-5s" % m.name
        for e in ENEMIES:
            var per_hit := DamageFormulas.divisive(m.attack, e.defence)
            var expected := per_hit * (1.0 + CRIT_CHANCE * (CRIT_MULTIPLIER - 1.0))
            var dps: float = expected * m.hits_per_second
            line += "  %s %5.1f s" % [e.name, e.hp / dps]
        print(line)
`;

export const MODULE: Module = {
  id: 'm05',
  part: 'math',
  order: 5,
  title: 'The numbers behind RPGs',
  summary: 'Damage formulas and their failure modes, growth curves and XP, probability for crits and loot, streaks and pity, variance, and balancing by time to kill with a balance sheet written as code.',
  relevance: md`Shardbound's numbers decide how the game feels as much as its animations do: whether a new sword is exciting, whether the golem is a wall or a fight, how long a level takes, whether a 5% shard drop feels fair. This module gives you the formulas and the reasoning to choose them. r01 builds the damage pipeline on the divisive formula chosen here, r02 uses the XP curve, r03's loot tables use weighted selection, and k04's crits and stagger multipliers are tuned with the time-to-kill sheet.`,
  prereqs: ['g02'],
  areas: ['math', 'systems', 'combat'],
  lessons: [
    {
      id: 'm05-1',
      title: 'Damage formulas',
      minutes: 40,
      objectives: [
        'Compute damage with subtractive ($a - d$), divisive ($a\\,k/(k + d)$) and relative ($a^2/(a + d)$) formulas.',
        'Explain the zero-damage problem of subtractive defence and why each point of defence matters more as $d$ approaches $a$.',
        'Show that divisive defence adds the same effective HP for every point.',
        'Choose a formula from how a game\'s stats grow, and implement it as static GDScript functions.',
      ],
      cells: [
        {
          kind: 'text',
          md: md`Kai swings at a slime and a number pops up: 18. Later he swings at the golem: 3. Between those two numbers sits a **damage formula**, a function of the attacker's attack and the target's defence, and its shape decides things the player feels directly:

- Does a +4 sword upgrade feel big or invisible?
- Can an under-levelled party still scratch a boss, or is it a wall?
- Does stacking defence make Bram nearly invincible, or barely help?

There is no correct formula; there are a few common shapes with known trade-offs. This lesson compares three, finds where each breaks, and ends with the one r01 builds on.`,
        },
        {
          kind: 'callout',
          tone: 'definition',
          title: 'Attack, defence, damage',
          md: md`**Attack** $a$ is the attacker's offensive stat (Kai's attack, Lyra's magic). **Defence** $d$ is the target's matching resistance. A **damage formula** $D(a, d)$ maps them to the HP removed by one hit, rounded to an integer. In r01 this is one stage of a pipeline (ability power, defence, element, stagger, crit, round), and the stages after it are plain multipliers, so the shape of this stage is what decides how stats trade against each other.`,
        },
        {
          kind: 'text',
          md: md`### Subtractive: $D = a - d$

Each point of defence blocks exactly one point of damage. It is easy to read ("my 20 attack against its 5 defence does 15") and every stat point has a visible effect. Its problems:

- **The zero wall.** When $d \ge a$, damage is 0 or negative. Games patch it with a floor, \`maxi(a - d, 1)\`, but a floor of 1 against 600 HP is still a wall: 600 hits.
- **Knife-edge sensitivity.** Near $a = d$ one point of defence changes damage enormously. With $a = 20$, going from $d = 18$ to $d = 19$ halves damage (2 to 1).
- **Stats must grow in lockstep.** If enemy defence grows faster than player attack across levels, the game slides toward the wall; slower, and defence stops mattering.

Subtractive defence suits games that want hard gates ("you need a better weapon for this area") and small, hand-tuned numbers.`,
        },
        {
          kind: 'derive',
          title: 'how much one point of defence matters',
          goal: md`With the subtractive formula, find the fraction of damage removed by adding one point of defence.`,
          steps: [
            { md: md`Before: $D = a - d$. After: $D' = a - d - 1$. The damage drops by exactly 1.` },
            {
              md: md`As a fraction of the damage, that is $$\frac{D - D'}{D} = \frac{1}{a - d}.$$`,
              choose: {
                prompt: md`With $a = 40$, what fraction does one point of defence remove at $d = 10$ and at $d = 38$?`,
                options: [md`About 3% and 50%`, md`2.5% at both`, md`10% and 38%`, md`50% and 3%`],
                answer: 0,
                explain: md`$1/(40 - 10) = 1/30 \approx 3.3\%$; $1/(40 - 38) = 1/2 = 50\%$. The same item is worth 15 times more against one enemy than another.`,
              },
            },
            { md: md`So the value of a defence point is not a property of the item; it depends on who is attacking. Balancing has to check every pairing, and the extremes are where players find exploits.` },
          ],
          takeaway: md`Subtractive defence is linear in damage but wildly non-linear in **relative** damage as $d$ approaches $a$.`,
        },
        {
          kind: 'text',
          md: md`### Divisive: $D = a \cdot \dfrac{k}{k + d}$

Defence becomes a multiplier between 0 and 1. The constant $k$ sets the scale: at $d = k$ the multiplier is $\tfrac12$, at $d = 3k$ it is $\tfrac14$, and it never reaches 0. Damage removed is the fraction $d/(k + d)$.

Two properties make it popular:
- **No wall.** Any attack does some damage; extra defence always helps, but less and less.
- **Linear effective HP.** The next derivation shows that every point of defence adds the same amount of survivability, which makes items easy to price.

It is also what r01's \`DamageCalc\` uses, with $k = 100$ (\`DEFENCE_SCALE\`).`,
        },
        {
          kind: 'derive',
          title: 'effective HP under divisive defence',
          goal: md`A target has $H$ HP and defence $d$. Find the raw damage (before defence) it can absorb, its *effective HP*, and how that grows with $d$.`,
          steps: [
            { md: md`Each hit of raw damage $a$ removes $a\,k/(k + d)$ HP. The target dies when the removed HP reaches $H$, that is when the total raw damage $R$ satisfies $R\,k/(k + d) = H$.` },
            {
              md: md`Solve for $R$: $$H_{\text{eff}} = R = H\,\frac{k + d}{k} = H + \frac{H}{k}\,d.$$`,
              choose: {
                prompt: md`How does $H_{\text{eff}}$ change when $d$ goes up by 1?`,
                options: [md`It always grows by $H/k$, whatever $d$ is`, md`It grows less and less as $d$ grows`, md`It doubles`],
                answer: 0,
                explain: md`$H_{\text{eff}}$ is a straight line in $d$ with slope $H/k$. The damage multiplier shrinks with diminishing returns, but survivability grows evenly: the 100th point of defence is worth as much as the first.`,
              },
            },
            { md: md`With $H = 200$ and $k = 100$, each defence point is worth 2 effective HP. A +20 defence armour is "+40 HP" for Bram, and the comparison with a +40 HP accessory is direct.` },
          ],
          takeaway: md`Divisive defence has diminishing returns on the damage number but constant returns on survival, which is the property that keeps defence stacking from becoming either useless or unbeatable.`,
        },
        {
          kind: 'viz',
          viz: { type: 'math.rpgDamage', atk: 40, def: 25, k: 100, hp: 120 },
          task: md`Drag **def** toward **atk** and watch the red subtractive curve hit zero at the dashed line while the others keep going. Set **k** to 20, then 200: how does the divisive curve change? Finally set the x axis to **attack** and compare how each formula rewards a weapon upgrade.`,
          caption: md`Each curve is one formula at the current attack, plotted against defence. The table shows the rounded damage and the hits needed for the enemy's HP. The relative formula ($a^2/(a + d)$) is introduced next.`,
        },
        {
          kind: 'numeric',
          q: md`Kai has 40 attack. A skeleton has 25 defence. With the divisive formula and $k = 100$, how much damage does one hit do after rounding with \`roundi\`?`,
          answer: { kind: 'number', value: 32 },
          explain: md`$40 \cdot 100/125 = 32$ exactly. Defence 25 removes $25/125 = 20\%$ of the damage. With the subtractive formula it would be $40 - 25 = 15$, less than half.`,
        },
        {
          kind: 'text',
          md: md`### Relative: $D = \dfrac{a^2}{a + d} = a \cdot \dfrac{a}{a + d}$

The same shape as divisive, but the scale constant is the attacker's own attack: defence equal to the attack halves damage. Defence is measured **relative to the attacker**, so the formula is *scale-invariant*: multiply every attack and defence in the game by 10 and every damage number is multiplied by 10 too, so the hits to kill do not change if HP scales with them.

That suits games whose stats grow by multiplication over a long progression (a few percent per level, compounding), where a fixed $k$ would be tiny at level 50 and huge at level 1. Its cost is that attack counts twice (in the numerator and in the ratio), so attack upgrades grow damage faster than linearly; for weak attackers against strong defenders it behaves like subtractive's soft cousin.`,
        },
        {
          kind: 'check',
          q: md`Every attack, defence and HP value in a game is multiplied by 10 (a "stat inflation" pass). For which formulas do the hits to kill stay the same?`,
          options: [md`Subtractive and relative`, md`Only divisive`, md`All three`, md`Only relative`],
          answer: 0,
          explain: md`$10a - 10d = 10(a - d)$ and $(10a)^2/(10a + 10d) = 10\,a^2/(a + d)$: both scale by 10, like the HP. Divisive with a fixed $k$ does not: $10a \cdot k/(k + 10d)$ gives defence ten times more weight. Divisive needs $k$ scaled too.`,
        },
        {
          kind: 'callout',
          tone: 'design',
          title: 'Choosing a formula',
          md: md`Ask three questions:
1. **How do stats grow?** Additively over a short game (Shardbound's vertical slice and a 10-hour game both qualify): subtractive or divisive with a fixed $k$. Multiplicatively over a long one: relative, or divisive with $k$ growing per level.
2. **Should a weak attacker always do something?** Yes: avoid plain subtractive.
3. **Should defence be a hard gate or a soft slope?** Gates (subtractive) make for puzzles; slopes (divisive) for smooth difficulty.

Shardbound's answer is divisive with $k = 100$: party stats stay roughly between 10 and 150, no enemy should be immune to a weak character, and constant effective-HP returns keep Bram's defence build useful without making him invulnerable.`,
        },
        { kind: 'code', file: 'scripts/damage_formulas.gd', code: FORMULAS, note: md`A script with \`class_name\` and only \`static func\`s works as a namespace: call \`DamageFormulas.divisive(20, 4)\` from anywhere without creating an object. \`roundi\` rounds to the nearest integer and returns an \`int\`; the \`float(...)\` casts in \`relative\` avoid integer division.` },
        {
          kind: 'steps',
          title: 'Print a damage table',
          steps: [
            md`Save the listing above as \`scripts/damage_formulas.gd\`.`,
            md`Create \`scenes/tests/damage_table.tscn\` with a \`Node\` root named \`DamageTable\` and attach a new script \`scripts/tests/damage_table.gd\` with the listing below.`,
            md`Press **F6** to run the scene and read the Output panel. Then select the root and change **Kai Attack** in the Inspector to 12 and run again.`,
          ],
          result: md`A four-row table of hits to kill. At attack 20 the golem (defence 30) takes 600 hits with the subtractive formula, 38 with divisive, and 75 with relative. At attack 12 the skeleton (defence 14) joins the golem as a subtractive wall.`,
          troubleshoot: [
            { problem: md`"Identifier DamageFormulas not declared".`, fix: md`The \`class_name\` registers when the script is saved without errors. Save \`damage_formulas.gd\` first; if it still fails, check for a parse error in that file.` },
            { problem: md`All hits-to-kill numbers are off by one or zero.`, fix: md`\`hp / sub\` with two \`int\`s truncates. The listing converts to \`float\` and uses \`ceili\` to round up: 40 HP at 16 damage is 3 hits, not 2.` },
          ],
        },
        { kind: 'code', file: 'scripts/tests/damage_table.gd', code: DAMAGE_TABLE },
        {
          kind: 'build',
          ch: {
            id: 'm05-1-build',
            title: 'Find the walls',
            goal: md`Extend the damage table so it flags every pairing that a designer should look at.`,
            requirements: [
              md`Each row also prints the damage per hit for each formula, not only the hits to kill.`,
              md`Any pairing that takes more than 20 hits is marked with \`WALL\`.`,
              md`Any pairing where one more point of enemy defence would cut the damage by 25% or more is marked \`EDGE\` (test it by computing the formula again with \`defence + 1\`).`,
              md`At Kai attack 20, the golem is a WALL under subtractive and relative but not divisive.`,
            ],
            hints: [
              md`Write a helper \`func _flags(dmg: int, dmg_next: int, hits: int) -> String\` and call it once per formula.`,
              md`The EDGE test is \`dmg_next <= dmg * 0.75\`.`,
            ],
            solution: [
              {
                file: 'scripts/tests/damage_table.gd',
                code: gd`
extends Node
## Hits to kill per formula, with WALL and EDGE flags for the designer.

const ENEMIES := [
    {"name": "slime", "hp": 40, "defence": 4},
    {"name": "bat", "hp": 28, "defence": 2},
    {"name": "skeleton", "hp": 90, "defence": 14},
    {"name": "golem", "hp": 600, "defence": 30},
]

@export var kai_attack := 20
@export var wall_hits := 20


func _ready() -> void:
    for e in ENEMIES:
        var hp: int = e.hp
        var d: int = e.defence
        var cells: Array[String] = []
        for formula in ["subtractive", "divisive", "relative"]:
            var dmg := _damage(formula, kai_attack, d)
            var dmg_next := _damage(formula, kai_attack, d + 1)
            var hits := ceili(float(hp) / dmg)
            cells.append("%s %d dmg %d hits%s" % [formula, dmg, hits, _flags(dmg, dmg_next, hits)])
        print("%-9s | %s" % [e.name, " | ".join(cells)])


func _damage(formula: String, atk: int, defence: int) -> int:
    match formula:
        "subtractive":
            return DamageFormulas.subtractive(atk, defence)
        "divisive":
            return DamageFormulas.divisive(atk, defence)
        _:
            return DamageFormulas.relative(atk, defence)


func _flags(dmg: int, dmg_next: int, hits: int) -> String:
    var out := ""
    if hits > wall_hits:
        out += " WALL"
    if dmg_next <= dmg * 0.75:
        out += " EDGE"
    return out
`,
              },
            ],
            explain: md`The flags turn the derivations into tooling. WALL catches the zero-damage problem and its soft versions; EDGE catches the knife-edge region where $1/(a - d)$ is large. Running this after every stat change is the "balance sheet as code" idea from lesson 3.`,
          },
        },
        {
          kind: 'paper',
          problem: {
            id: 'm05-1-paper',
            title: 'Defence for a target reduction',
            type: 'compute',
            difficulty: 2,
            minutes: 6,
            statement: md`With divisive defence and $k = 100$: (a) how much defence does Bram need to take 40% less damage? (b) Bram has 300 HP; what is his effective HP with that defence? Enter $[d, H_{\text{eff}}]$.`,
            hints: [md`Taking 40% less means the multiplier $k/(k + d)$ is 0.6.`],
            solution: [
              md`(a) $100/(100 + d) = 0.6 \Rightarrow 100 + d = 166.67 \Rightarrow d \approx 66.67$, so 67 in practice.`,
              md`(b) $H_{\text{eff}} = H(k + d)/k = 300 \cdot 166.67/100 = 500$.`,
              md`Check with the slope: $H/k = 3$ effective HP per defence point, and $300 + 3 \cdot 66.67 = 500$.`,
            ],
            answer: { kind: 'vector', value: [200 / 3, 500] },
          },
        },
        {
          kind: 'recall',
          prompt: md`Write the three formulas and the value of $d$ at which each halves the damage (or reaches zero).`,
          answer: md`Subtractive $a - d$: reaches 0 at $d = a$ (half at $d = a/2$). Divisive $a\,k/(k + d)$: half at $d = k$. Relative $a^2/(a + d)$: half at $d = a$.`,
        },
        {
          kind: 'explain',
          prompt: md`A designer wants defence to be "simple: each point blocks one damage". Explain the problem you expect, with numbers, and propose an alternative.`,
          model: md`It reads well but the value of a point depends on the attacker. Against a 40-attack enemy, going from 10 to 11 defence cuts damage by 1/30, about 3%; from 38 to 39 it halves it. Players stacking defence hit a cliff where enemies do 1 damage (with a floor) and the game becomes trivial, or enemies with slightly more defence than the party's attack become 600-hit walls. Divisive defence, $a\,k/(k + d)$, keeps damage positive, has diminishing returns per point of damage, and adds a constant $H/k$ effective HP per point, so items stay comparable.`,
        },
      ],
      cards: [
        { id: 'm05-1-c1', kind: 'concept', front: md`The zero-damage problem.`, back: md`Subtractive damage $a - d$ is 0 or negative once $d \ge a$; a floor of 1 hides it but turns the fight into hundreds of hits.` },
        { id: 'm05-1-c2', kind: 'compute', front: md`Divisive, $a = 30$, $d = 50$, $k = 100$. Damage?`, answer: { kind: 'number', value: 20 }, back: md`$30 \cdot 100/150 = 20$.` },
        { id: 'm05-1-c3', kind: 'cloze', text: md`Divisive defence: effective HP $= H\,(k + d)/{{}}$, so each defence point adds $H/k$.`, answers: ['k'] },
        { id: 'm05-1-c4', kind: 'concept', front: md`Which formulas are scale-invariant (multiply all stats by $c$, damage scales by $c$)?`, back: md`Subtractive and relative $a^2/(a + d)$. Divisive with a fixed $k$ is not; its $k$ must scale with the stats.` },
        { id: 'm05-1-c5', kind: 'concept', front: md`Which formula does r01's DamageCalc use?`, back: md`Divisive, $a \cdot 100/(100 + d)$ (\`DEFENCE_SCALE = 100\`), then element, stagger and crit multipliers, rounded once at the end with a minimum of 1.` },
      ],
    },
    {
      id: 'm05-2',
      title: 'Growth curves and XP',
      minutes: 40,
      objectives: [
        'Compare linear, power and exponential growth by their differences and ratios from level to level.',
        'Compute XP to the next level and total XP, including the closed forms $b\\,L(L - 1)/2$ and $b\\,(r^{L-1} - 1)/(r - 1)$.',
        'Find the level reached from a total XP, by a loop and by inverting a closed form.',
        'Design an XP curve from the time each level should take at a given XP per minute.',
      ],
      cells: [
        {
          kind: 'text',
          md: md`"How long until Kai reaches level 10?" is a pacing decision, and the XP curve is where it is made. Too steep, and the player grinds the same slimes for an hour; too flat, and levels arrive so often they stop meaning anything. The curve has to be designed together with the XP enemies give, because what the player feels is **time per level**, not XP per level.`,
        },
        {
          kind: 'callout',
          tone: 'definition',
          title: 'XP to next, total XP, level from XP',
          md: md`- $\text{next}(L)$: the XP needed to go from level $L$ to $L + 1$.
- $\text{total}(L) = \sum_{k=1}^{L-1} \text{next}(k)$: the XP needed to reach level $L$ from 0 XP at level 1. $\text{total}(1) = 0$.
- The **level for** a total XP $T$ is the largest $L$ with $\text{total}(L) \le T$. Reaching the threshold exactly counts.`,
        },
        {
          kind: 'text',
          md: md`### Three shapes

With $b$ the cost of the first level:

| | Linear $b\,L$ | Power $b\,L^{1.5}$ | Exponential $b \cdot 1.15^{L-1}$ |
|---|---|---|---|
| next(1) | 100 | 100 | 100 |
| next(5) | 500 | 1118 | 175 |
| next(10) | 1000 | 3162 | 352 |
| next(20) | 2000 | 8944 | 1423 |
| next(30) | 3000 | 16432 | 5758 |
| total(20) | 19000 | 67135 | 8822 |

- **Linear**: each level costs $b$ more than the last (constant *difference*).
- **Power**: the *ratio* between consecutive levels, $((L + 1)/L)^p$, shrinks toward 1; late levels feel similar to each other.
- **Exponential**: each level costs $r$ times the last (constant *ratio*). It starts gentle and ends steeper than any power curve; at $r = 1.15$ the cost doubles every 5 levels.

Exponential curves are where grinding comes from: no polynomial growth in enemy XP can keep up with them forever.`,
        },
        {
          kind: 'derive',
          title: 'total XP and its inverse for a linear curve',
          goal: md`For $\text{next}(L) = b\,L$, find $\text{total}(L)$ in closed form, then solve for the level from a total $T$.`,
          steps: [
            { md: md`$\text{total}(L) = \sum_{k=1}^{L-1} b\,k = b\,(1 + 2 + \dots + (L - 1))$.` },
            {
              md: md`The sum of the first $n$ integers is $n(n + 1)/2$; here $n = L - 1$: $$\text{total}(L) = \frac{b\,L(L - 1)}{2}.$$`,
              choose: {
                prompt: md`With $b = 100$, how much total XP is needed to reach level 10?`,
                options: [md`4500`, md`5500`, md`1000`, md`5000`],
                answer: 0,
                explain: md`$100 \cdot 10 \cdot 9/2 = 4500$. The off-by-one ($L - 1$, not $L$) is because level 1 costs nothing to reach.`,
              },
            },
            { md: md`To invert, solve $b\,L(L - 1)/2 = T$, the quadratic $L^2 - L - 2T/b = 0$, and keep the positive root: $$L = \frac{1 + \sqrt{1 + 8T/b}}{2}.$$` },
            {
              md: md`The level is the largest whole $L$ that does not exceed this, so take the floor: $L = \big\lfloor (1 + \sqrt{1 + 8T/b})/2 \big\rfloor$.`,
              choose: {
                prompt: md`Why the floor and not rounding to nearest?`,
                options: [md`A level is reached only once its whole threshold is paid; 15.9 means level 15 with most of the next level done`, md`Rounding is not available in GDScript`, md`The floor is faster`],
                answer: 0,
                explain: md`$\text{total}(L)$ grows with $L$, so the reached level is the largest $L$ with $\text{total}(L) \le T$, which is the floor of the real solution. Watch for floating-point error at exact thresholds; the loop in the listing avoids it.`,
              },
            },
          ],
          takeaway: md`For an exponential curve the same steps use the geometric series: $\text{total}(L) = b\,(r^{L-1} - 1)/(r - 1)$ and $L = 1 + \lfloor \log(1 + T(r - 1)/b)/\log r \rfloor$. A power curve has no closed form; loop.`,
        },
        {
          kind: 'numeric',
          q: md`A linear curve has $b = 100$. A character has 12 000 total XP. What level are they?`,
          answer: { kind: 'number', value: 16 },
          explain: md`$\sqrt{1 + 8 \cdot 12000/100} = \sqrt{961} = 31$, and $(1 + 31)/2 = 16$ exactly. Check: $\text{total}(16) = 100 \cdot 16 \cdot 15/2 = 12000$, so the threshold is met exactly and the character is level 16.`,
        },
        {
          kind: 'viz',
          viz: { type: 'math.rpgXp', shape: 'power', base: 100, maxLevel: 30, rate: 60 },
          task: md`Switch the view to **minutes per level**. With **enemy XP × level**, find the exponent at which every level takes about the same time. Then switch to **exponential** and watch minutes per level after level 20; finally set enemy XP to **flat** and compare the power curve again.`,
          caption: md`XP per minute at level $L$ is the slider value (flat) or the slider value times $L$ (stronger enemies give more XP). Minutes per level is $\text{next}(L)$ divided by that rate; hours played is the running sum.`,
        },
        {
          kind: 'text',
          md: md`### Designing from time, not XP

Players experience minutes per level:
$$\text{minutes}(L) = \frac{\text{next}(L)}{\text{rate}(L)},$$
where $\text{rate}(L)$ is the XP per minute a player earns at level $L$. If stronger enemies give XP roughly in proportion to level, $\text{rate}(L) = c\,L$, then:
- $\text{next}(L) = b\,L$ gives a **constant** $b/c$ minutes per level;
- $\text{next}(L) = b\,L^{1.5}$ gives minutes growing like $\sqrt{L}$, slowly;
- $\text{next}(L) = b\,r^{L-1}$ gives minutes growing exponentially, a grind at the end.

So decide the pacing first ("each level takes 15 to 25 minutes, rising slowly"), then derive $\text{next}(L) = \text{minutes}(L) \cdot \text{rate}(L)$. For Shardbound's 20 to 30 minute vertical slice, that means about three levels in the slice, the first within ten minutes so the player sees the system early.`,
        },
        { kind: 'code', file: 'scripts/resources/xp_curve.gd', code: XP_CURVE, note: md`\`total_xp\` loops instead of using the closed form, so it works for every shape and is exact with integer XP; at 30 levels the loop costs nothing. \`level_for_xp\` calls it repeatedly (quadratic work), which is still trivial at this size; cache a table if you ever need thousands of levels.` },
        {
          kind: 'steps',
          title: 'Make the curve a resource and test it',
          steps: [
            md`Save the listing as \`scripts/resources/xp_curve.gd\`. In the **FileSystem** dock, right-click \`resources/\` → **Create New → Resource…**, search for \`XpCurve\`, and save it as \`resources/xp_curve.tres\`.`,
            md`Select \`xp_curve.tres\` and set **Shape** to *Power*, **Base** 100, **Exponent** 1.5, **Max Level** 30 in the Inspector.`,
            md`Create \`scenes/tests/xp_test.tscn\`: a \`Node\` root named \`XpTest\` with a child \`Node\` named \`Progression\`. Attach \`scripts/progression.gd\` (the build solution below; type it first or copy it) to \`Progression\` and \`scripts/tests/xp_test.gd\` (listing below) to the root. Drag \`xp_curve.tres\` into the **Curve** slot of both.`,
            md`Press **F6** and read the Output panel.`,
          ],
          result: md`Four table lines (level 2: 283 to next, 100 total; level 20: 8944 to next, 67135 total), then "reached level 2" through "reached level 6", then "now level 6 with 10 XP into it" and "level for 5000 total XP: 5".`,
          troubleshoot: [
            { problem: md`\`XpCurve\` does not appear in the Create New Resource dialog.`, fix: md`The script needs \`class_name XpCurve\` and \`extends Resource\`, and it must be saved without errors. Reopen the dialog after saving.` },
            { problem: md`"Invalid access to property or key 'xp_to_next' on a base object of type 'Nil'".`, fix: md`The \`curve\` export is empty on one of the nodes. Drag \`xp_curve.tres\` into both.` },
          ],
        },
        { kind: 'code', file: 'scripts/tests/xp_test.gd', code: XP_TEST },
        {
          kind: 'build',
          ch: {
            id: 'm05-2-build',
            title: 'XP with carry-over',
            goal: md`Write the \`Progression\` node: it adds XP, pays out as many levels as the XP covers, carries the remainder, and exposes the bar fill.`,
            requirements: [
              md`Adding exactly \`xp_to_next(level)\` gains one level and leaves 0 XP into the next.`,
              md`One reward worth several levels emits \`level_gained\` once per level, in order.`,
              md`The leftover XP after the last level is kept (not lost, not doubled).`,
              md`At \`max_level\`, further XP is ignored and the bar reads full.`,
              md`\`level_progress()\` returns a value from 0 to 1 that an XP bar can use directly.`,
            ],
            hints: [
              md`Store XP *into the current level* rather than total XP: the bar and the carry-over both become simple.`,
              md`A \`while\` loop handles multi-level rewards; an \`if\` would pay out at most one level per reward.`,
              md`Divide with a \`float\` on one side, or the bar will snap between 0 and 1.`,
            ],
            solution: [{ file: 'scripts/progression.gd', code: PROGRESSION }],
            explain: md`Keeping XP relative to the current level means the threshold is always \`xp_to_next(level)\`, and the loop subtracts it each time a level is paid out, which is exactly the carry-over. r02 attaches one of these to each party member and plays \`fx_levelup\` from the signal.`,
          },
        },
        {
          kind: 'paper',
          problem: {
            id: 'm05-2-paper',
            title: 'A curve from a pacing target',
            type: 'design',
            difficulty: 2,
            minutes: 10,
            statement: md`Enemies give XP so that a player at level $L$ earns about $20L$ XP per minute. The designer wants every level to take 15 minutes. (a) What $\text{next}(L)$ achieves that? (b) How many hours does it take to reach level 20? Enter $[b, \text{hours}]$ where $\text{next}(L) = b\,L$.`,
            solution: [
              md`(a) $\text{next}(L) = \text{minutes} \cdot \text{rate}(L) = 15 \cdot 20L = 300L$, a linear curve with $b = 300$.`,
              md`(b) Reaching level 20 takes 19 levels at 15 minutes: $285$ minutes $= 4.75$ hours. Check: $\text{total}(20) = 300 \cdot 20 \cdot 19/2 = 57000$ XP.`,
              md`In practice add a slow rise (for example $15 + 0.5L$ minutes) so late levels feel weightier, and let side content give bonus XP so players who explore move ahead.`,
            ],
            answer: { kind: 'vector', value: [300, 4.75] },
            rubric: [md`Derives next(L) from minutes times rate`, md`Counts 19 level-ups, not 20`, md`Comments on pacing beyond the formula`],
          },
        },
        {
          kind: 'recall',
          prompt: md`Write total XP to reach level $L$ for a linear curve $bL$ and an exponential curve $b\,r^{L-1}$.`,
          answer: md`Linear: $b\,L(L - 1)/2$. Exponential: $b\,(r^{L-1} - 1)/(r - 1)$. Both sum next(k) for $k = 1$ to $L - 1$.`,
        },
        {
          kind: 'explain',
          prompt: md`Why can't you judge an XP curve by its XP numbers alone?`,
          model: md`Players feel time, and time per level is next(L) divided by the XP rate at that level. The same curve feels flat if enemy XP grows as fast as the curve and like a grind if it does not. An exponential curve with enemy XP growing linearly always ends in a grind, while a linear curve with linearly growing enemy XP gives constant minutes per level. So the curve and the reward table have to be designed together, ideally from a target number of minutes per level.`,
        },
      ],
      cards: [
        { id: 'm05-2-c1', kind: 'compute', front: md`Linear curve, $b = 50$. Total XP to reach level 8?`, answer: { kind: 'number', value: 1400 }, back: md`$50 \cdot 8 \cdot 7/2 = 1400$.` },
        { id: 'm05-2-c2', kind: 'cloze', text: md`Exponential curve: total XP to reach $L$ is $b\,(r^{L-1} - 1)/({{}})$.`, answers: ['r - 1|r-1'] },
        { id: 'm05-2-c3', kind: 'concept', front: md`Linear vs power vs exponential XP curves: what stays constant?`, back: md`Linear: the difference between levels. Exponential: the ratio between levels. Power: neither; the ratio shrinks toward 1.` },
        { id: 'm05-2-c4', kind: 'concept', front: md`What do players feel from an XP curve?`, back: md`Minutes per level: next(L) divided by the XP per minute at level L. Design that first, then derive the curve.` },
        { id: 'm05-2-c5', kind: 'concept', front: md`Why loop with \`while\` when adding XP?`, back: md`One reward can be worth several levels; a while loop pays out each, emitting a signal per level and carrying the remainder.` },
      ],
    },
    {
      id: 'm05-3',
      title: 'Probability, loot, streaks and time to kill',
      minutes: 45,
      objectives: [
        'Compute the chance of at least one success in $N$ tries, $1 - (1 - p)^N$, and the $N$ needed for a target chance.',
        'Compute expected values: average damage with crits and average gold from a drop table.',
        'Implement weighted random selection with cumulative weights.',
        'Explain streaks, pity limits and pseudo-random distribution, and why small damage variance feels better than large.',
        'Balance with hits to kill, DPS and a balance sheet written as code.',
      ],
      cells: [
        {
          kind: 'text',
          md: md`A slime drops a fire shard 1% of the time. After 100 slimes, a third of your players still have not seen one, and some of them will write that the drop is broken. Kai has a 20% crit chance and lands three crits in a row, then none for twelve swings. Every number here is working as written; the problem is what probability feels like. This lesson gives you the arithmetic, the tools that change the feel without changing the averages, and a way to balance fights by time.`,
        },
        {
          kind: 'callout',
          tone: 'definition',
          title: 'Independent events and expected value',
          md: md`Rolls are **independent** when one result does not change the chances of the next: \`randf() < 0.2\` has a 20% chance every time, whatever happened before. For independent events the chance that *all* happen is the product of their chances.

The **expected value** of a random quantity is the average over many trials: each outcome times its probability, summed, $\E[X] = \sum_i p_i x_i$. It is the number to balance against, though players experience the individual rolls.`,
        },
        {
          kind: 'derive',
          title: 'at least one success in N tries',
          goal: md`Each kill drops a shard with probability $p$, independently. Find the chance of at least one shard in $N$ kills, and the $N$ that gives a chance $q$.`,
          steps: [
            {
              md: md`"At least one" has many cases (exactly 1, exactly 2, …). Its complement has one: **no** shard in $N$ kills.`,
              choose: {
                prompt: md`What is the chance of no shard in $N$ independent kills?`,
                options: [md`$(1 - p)^N$`, md`$1 - Np$`, md`$N(1 - p)$`, md`$(1 - p)/N$`],
                answer: 0,
                explain: md`Each kill misses with probability $1 - p$; independent misses multiply. $1 - Np$ is a first approximation that fails badly for large $N$ (it goes negative).`,
              },
            },
            { md: md`So $$P(\text{at least one}) = 1 - (1 - p)^N.$$ With $p = 0.01$ and $N = 100$: $1 - 0.99^{100} \approx 0.634$. A third of players have nothing after 100 kills.` },
            {
              md: md`For a target chance $q$, solve $1 - (1 - p)^N \ge q$: $(1 - p)^N \le 1 - q$, take logarithms (both are negative, so the inequality flips when dividing): $$N \ge \frac{\ln(1 - q)}{\ln(1 - p)}.$$`,
              choose: {
                prompt: md`With $p = 0.01$, how many kills give a 90% chance of at least one shard?`,
                options: [md`230`, md`90`, md`100`, md`900`],
                answer: 0,
                explain: md`$\ln 0.1 / \ln 0.99 = -2.303/-0.01005 \approx 229.1$, so 230 kills. "1%" sounds like "about 100 tries", but 100 tries give only 63%.`,
              },
            },
          ],
          takeaway: md`Quote drop rates to yourself as "kills for 90%": $\ln(0.1)/\ln(1 - p) \approx 2.3/p$ for small $p$.`,
        },
        {
          kind: 'numeric',
          q: md`A bat drops an ether 5% of the time. What is the chance of at least one ether in 20 bats?`,
          answer: { kind: 'number', value: 1 - Math.pow(0.95, 20) },
          explain: md`$1 - 0.95^{20} = 1 - 0.3585 \approx 0.6415$, about 64%.`,
        },
        {
          kind: 'text',
          md: md`### Expected values: crits and loot

A hit with base damage $b$, crit chance $p$ and crit multiplier $m$ does on average
$$\E[\text{dmg}] = (1 - p)\,b + p\,m\,b = b\,\big(1 + p(m - 1)\big).$$
With r01's multiplier of 1.5 and a 10% crit chance that is $1.05\,b$: crits add 5% to average damage. They matter more for feel (a bigger number, a sound, a flash) than for balance, until crit chance or multiplier gets large.

A drop table works the same way: the expected gold per kill is $\sum_i p_i\,g_i$ over its entries.

### Weighted random selection

Drop tables are usually written as **weights**, not percentages: nothing 50, slime jelly 30, potion 15, ether 4, fire shard 1. The probability of an entry is its weight divided by the total. Weights let you add an entry without rewriting the others so they sum to 100.

To pick one: roll a number in $[0, \text{total})$, then walk the entries, subtracting each weight until the roll falls inside one. Laid end to end, the weights cover the range $[0, \text{total})$ in segments as long as the weights; the roll lands in each segment with probability proportional to its length. Godot 4.3 and later also has \`RandomNumberGenerator.rand_weighted(weights)\`, which returns an index the same way.`,
        },
        {
          kind: 'viz',
          viz: { type: 'math.probLoot', mode: 'loot' },
          task: md`Roll 1 a few times and watch the needle land in the cumulative bar. Roll 100 and compare the filled bars with the dashed expected shares, then roll 10 000. Set the kills slider to the "N for 90%" value. Finally change the shard's weight to 2 and see what changes and what does not.`,
          caption: md`Top: the weights laid end to end from 0 to the total; the needle is the last roll. Bottom: observed shares (filled) against expected (dashed). After 100 rolls the rare entries are noisy; after 10 000 they settle.`,
        },
        {
          kind: 'check',
          q: md`With the weights 50, 30, 15, 4, 1 (total 100), \`randf()\` returns 0.83. Which entry does the cumulative walk pick?`,
          options: [md`potion`, md`slime jelly`, md`ether`, md`fire shard`],
          answer: 0,
          explain: md`The roll is $0.83 \times 100 = 83$. Subtract 50 (33 left, not below 30), subtract 30 (3 left, below 15): the third entry, potion. The cumulative boundaries are 50, 80, 95, 99, 100, and 83 lies between 80 and 95.`,
        },
        { kind: 'code', file: 'scripts/tests/drop_test.gd', code: DROP_TEST, note: md`Seeding the generator (\`rng.seed = 7\`) makes every run identical, which is what you want in a test. In the game, leave the seed alone; \`RandomNumberGenerator.new()\` starts from a random seed. r03 turns the table into a \`Resource\` so designers edit it in the Inspector.` },
        {
          kind: 'text',
          md: md`### Streaks, pity and pseudo-random distribution

Independent rolls produce streaks. With a 20% crit chance, ten non-crits in a row has probability $0.8^{10} \approx 10.7\%$: across a long fight it will happen, and players read it as the game cheating. Two tools reduce streaks:

- **Pity limit.** Roll normally, but guarantee a success after $n - 1$ misses in a row. The longest drought becomes $n - 1$; the average rate rises slightly.
- **Pseudo-random distribution (PRD).** Start the chance at a small constant $c$ and add $c$ after every miss: $c, 2c, 3c, \dots$, resetting on a success. Choose $c$ so that the long-run rate is still $p$ (for $p = 0.2$, $c \approx 0.0557$). Long droughts become impossible ($c\,n$ reaches 1 within 18 attacks) and back-to-back crits become rare, so crits arrive at a steadier rhythm.

Both change the *distribution of gaps* between successes; PRD keeps the average exactly.`,
        },
        {
          kind: 'viz',
          viz: { type: 'math.probLoot', mode: 'streak' },
          task: md`At 20% crit chance, compare the gap histogram and the longest drought for **independent** and **PRD**. Check that the observed crit rate is about the same. Then try **pity** with a limit of 8 and see what happens to the rate.`,
          caption: md`The strip shows the first 100 attacks; the histogram counts how many attacks each crit took after the previous one. Independent rolls give a long tail of droughts and many back-to-back crits; PRD bunches the gaps around 5.`,
        },
        {
          kind: 'check',
          q: md`What does switching crits from independent rolls to PRD (with $c$ chosen for the same $p$) change?`,
          options: [md`The gaps between crits become more regular; the average crit rate stays the same`, md`The average crit rate goes up`, md`Crits become fully predictable`, md`Nothing that a player can notice`],
          answer: 0,
          explain: md`PRD is designed to keep the long-run rate at $p$ while shrinking the spread of gaps. It is still random (a crit after 2 attacks or after 9 can both happen), only less streaky.`,
        },
        { kind: 'code', file: 'scripts/crit_roller.gd', code: CRIT_PRD, note: md`\`prd_constant\` finds $c$ numerically: for a given $c$ it computes the expected number of attacks per crit, and the bisection adjusts $c$ until one over that equals $p$. Run once in \`_ready\`, so its cost does not matter.` },
        {
          kind: 'text',
          md: md`### Variance and time to kill

A little randomness in damage (each hit rolls ±10%) keeps numbers from looking mechanical and hides exact thresholds. A lot of randomness breaks something players rely on: **plans**. If three hits always kill a slime, the player learns it and fights with intent. With ±50% damage, the same slime takes two hits or five, and success feels like luck.

The planning unit is **hits to kill**, $\lceil H/D \rceil$, and its relatives:
$$\text{DPS} = \E[\text{dmg}] \times \text{hits per second}, \qquad \text{TTK} \approx \frac{H}{\text{DPS}}.$$
Because of the ceiling, hits to kill changes in steps: damage only matters when it crosses a **breakpoint** $H/n$. Against 120 HP, 24 damage kills in 5 hits and so does 29; 30 kills in 4. A ±10% roll around 24 sometimes reaches the 4-hit breakpoint and sometimes falls under the 5-hit one, which is exactly where variance shows.`,
        },
        {
          kind: 'viz',
          viz: { type: 'math.rpgTtk', base: 24, hp: 120, variance: 0.1, crit: 0.1 },
          task: md`Set variance to 0% and crit to 0%: every fight takes exactly 5 hits. Raise variance to 10%, then 50%, and watch the spread of hits to kill. Then set base damage to 30 with no variance (4 hits) and to 29 (5 hits): that is a breakpoint.`,
          caption: md`Each bar is the share of 20 000 simulated fights that needed that many hits; the orange bar is $\lceil HP/\text{base} \rceil$, the no-variance answer.`,
        },
        {
          kind: 'numeric',
          q: md`A slime has 60 HP and Kai hits for 14 with no variance. How many hits does it take, and what is the smallest per-hit damage that saves a hit? Enter both.`,
          answer: { kind: 'vector', value: [5, 15] },
          inputHint: 'hits, damage',
          explain: md`$\lceil 60/14 \rceil = \lceil 4.29 \rceil = 5$ hits. Four hits need $D \ge 60/4 = 15$. So a +1 attack upgrade that takes Kai from 14 to 15 damage is worth a whole hit against slimes, while 15 to 19 changes nothing until 20 (3 hits).`,
        },
        {
          kind: 'callout',
          tone: 'design',
          title: 'Spreadsheets as code',
          md: md`Balance lives in tables: every party member against every enemy, in hits and seconds. Many studios keep those tables in spreadsheets; in Godot you can keep them next to the game as an \`EditorScript\`, a script that runs inside the editor when you choose **File → Run** in the script editor (Ctrl+Shift+X). Its advantages over a separate spreadsheet: it calls the real \`DamageFormulas\`, so the numbers can never drift from the game's, and later (r01, r03) it can load the real \`.tres\` resources instead of literal tables. Check the sheet after every stat change, and look for walls, breakpoints, and party members whose numbers are far from the others'.`,
        },
        { kind: 'code', file: 'scripts/tools/balance_sheet.gd', code: BALANCE, note: md`\`@tool\` with \`extends EditorScript\` and a \`_run()\` function is all an editor script needs. It prints, for example, \`Kai  slime 2.3 s  skeleton 2.6 s  golem 15.4 s\` with the numbers in the listing.` },
        {
          kind: 'build',
          ch: {
            id: 'm05-3-build',
            title: 'A crit roller that never droughts',
            goal: md`Make the PRD crit roller from this lesson and prove with a test that it keeps the average and removes long droughts.`,
            requirements: [
              md`Over 10 000 rolls at \`crit_rate = 0.2\`, the measured rate is between 0.19 and 0.21.`,
              md`The longest run without a crit is at most 17.`,
              md`With independent rolls (\`randf() < crit_rate\`) at the same rate, the same test shows a longest drought above 20 on most runs.`,
              md`\`crit_rate\` is an export, and the constant $c$ is recomputed from it in \`_ready\`.`,
            ],
            hints: [
              md`The chance after $n$ misses is $c\,(n + 1)$; it reaches 1 when $n + 1 \ge 1/c$, which bounds the drought.`,
              md`For the comparison, write a second function \`roll_crit_independent()\` and run \`_test\` with each.`,
            ],
            solution: [{ file: 'scripts/crit_roller.gd', code: CRIT_PRD }],
            explain: md`With $p = 0.2$, $c \approx 0.0557$, so the chance reaches 1 at the 18th attack after a crit: at most 17 misses in a row. The expected gap is still 5 attacks, because $c$ was chosen by solving for exactly that.`,
          },
        },
        {
          kind: 'paper',
          problem: {
            id: 'm05-3-paper',
            title: 'The value of a drop table',
            type: 'compute',
            difficulty: 2,
            minutes: 8,
            statement: md`The slime's table (weights): nothing 50 (0 gold), slime jelly 30 (5 gold), potion 15 (20 gold), ether 4 (60 gold), fire shard 1 (400 gold). (a) Expected gold value per kill? (b) Kills for a 90% chance of at least one fire shard? Enter $[\E, N]$.`,
            solution: [
              md`(a) $\E = 0.5 \cdot 0 + 0.3 \cdot 5 + 0.15 \cdot 20 + 0.04 \cdot 60 + 0.01 \cdot 400 = 0 + 1.5 + 3 + 2.4 + 4 = 10.9$ gold.`,
              md`(b) $N = \ln 0.1/\ln 0.99 \approx 229.1$, so 230 kills.`,
              md`The shard is 37% of the table's value but appears once per 100 kills on average: if it matters to progression, a pity counter (guarantee by kill 150, say) protects unlucky players.`,
            ],
            answer: { kind: 'vector', value: [10.9, 230] },
          },
        },
        {
          kind: 'recall',
          prompt: md`Give the formulas for: at least one success in $N$ tries, expected damage with crits, and DPS.`,
          answer: md`$1 - (1 - p)^N$. $b\,(1 + p(m - 1))$. $\E[\text{dmg}] \times$ hits per second; TTK $\approx H/\text{DPS}$, hits to kill $\lceil H/D \rceil$.`,
        },
        {
          kind: 'explain',
          prompt: md`A playtester says the 20% crit chance "feels like 5%" because they went 14 swings without one. Respond as the designer: is the game wrong, and what would you change?`,
          model: md`Probably not wrong: with independent 20% rolls, 14 misses in a row has probability $0.8^{14} \approx 4.4\%$, so over a few hundred swings it is expected to happen. But the feel is real and worth fixing. Switching to a pseudo-random distribution keeps the average at 20% while capping droughts at 17 misses and making most gaps 3 to 7 swings. A pity limit is simpler but raises the average slightly. Logging crits in a playtest build confirms the measured rate before changing anything.`,
        },
      ],
      cards: [
        { id: 'm05-3-c1', kind: 'compute', front: md`Drop chance 2%. Chance of at least one in 50 kills?`, answer: { kind: 'number', value: 1 - Math.pow(0.98, 50) }, back: md`$1 - 0.98^{50} \approx 0.636$.` },
        { id: 'm05-3-c2', kind: 'cloze', text: md`Kills for a 90% chance at drop rate $p$: $N = \ln(0.1)/\ln({{}})$.`, answers: ['1 - p|1-p'] },
        { id: 'm05-3-c3', kind: 'compute', front: md`Base 40 damage, 15% crit, ×2 multiplier. Expected damage?`, answer: { kind: 'number', value: 46 }, back: md`$40 \cdot (1 + 0.15 \cdot 1) = 46$.` },
        { id: 'm05-3-c4', kind: 'concept', front: md`Pity limit versus PRD.`, back: md`Pity: normal rolls plus a guaranteed success after $n - 1$ misses; caps droughts, raises the average slightly. PRD: chance $c, 2c, 3c, \dots$ reset on success, $c$ chosen for the same average; fewer droughts and fewer streaks.` },
        { id: 'm05-3-c5', kind: 'concept', front: md`Why do small damage ranges (±10%) feel better than large ones?`, back: md`Hits to kill stays mostly fixed, so players can plan ("three hits kill a slime"); large ranges make outcomes feel like luck. Small ranges still keep numbers from looking mechanical.` },
      ],
    },
  ],
  problems: [
    {
      id: 'm05-p1',
      title: 'Same stats, three formulas',
      type: 'compute',
      difficulty: 1,
      minutes: 5,
      statement: md`Attack 30 against defence 20. Compute the damage with subtractive, divisive ($k = 100$) and relative formulas, before rounding. Enter the three values.`,
      solution: [md`Subtractive: $30 - 20 = 10$. Divisive: $30 \cdot 100/120 = 25$. Relative: $900/50 = 18$.`, md`Subtractive is harshest here because $d$ is close to $a$; divisive barely notices 20 defence because $k = 100$ is large compared with it.`],
      answer: { kind: 'vector', value: [10, 25, 18] },
    },
    {
      id: 'm05-p2',
      title: 'Defence for half damage',
      type: 'compute',
      difficulty: 1,
      minutes: 3,
      statement: md`With divisive defence and $k = 80$, what defence takes 75% of incoming damage away?`,
      solution: [md`The multiplier must be 0.25: $80/(80 + d) = 0.25 \Rightarrow 80 + d = 320$.`, md`$d = 240$, which is $3k$, as the "3k quarters it" rule says.`],
      answer: { kind: 'number', value: 240 },
    },
    {
      id: 'm05-p3',
      title: 'Exponential total',
      type: 'compute',
      difficulty: 2,
      minutes: 5,
      statement: md`$\text{next}(L) = 100 \cdot 1.2^{L-1}$. How much total XP is needed to reach level 6?`,
      solution: [md`$\text{total}(6) = \sum_{k=1}^{5} 100 \cdot 1.2^{k-1} = 100\,(1.2^5 - 1)/(1.2 - 1)$.`, md`$1.2^5 = 2.48832$, so $100 \cdot 1.48832/0.2 = 744.16$.`],
      answer: { kind: 'number', value: 744.16 },
    },
    {
      id: 'm05-p4',
      title: 'Inverting the exponential curve',
      type: 'derive',
      difficulty: 3,
      minutes: 10,
      statement: md`Derive the level reached from total XP $T$ for $\text{next}(L) = b\,r^{L-1}$, and evaluate it for $b = 100$, $r = 1.15$, $T = 5000$.`,
      solution: [
        md`$\text{total}(L) = b\,(r^{L-1} - 1)/(r - 1) \le T \iff r^{L-1} \le 1 + T(r - 1)/b$.`,
        md`Take logs ($\log r > 0$): $L - 1 \le \log(1 + T(r - 1)/b)/\log r$, so $L = 1 + \lfloor \log(1 + T(r - 1)/b)/\log r \rfloor$.`,
        md`Numbers: $1 + 5000 \cdot 0.15/100 = 8.5$; $\ln 8.5/\ln 1.15 = 2.140/0.1398 \approx 15.31$; $L = 16$.`,
      ],
      answer: { kind: 'number', value: 16 },
      rubric: [md`Uses the geometric series`, md`Takes logs correctly and floors`, md`Gets 16`],
    },
    {
      id: 'm05-p5',
      title: 'Kills for 95%',
      type: 'compute',
      difficulty: 1,
      minutes: 3,
      statement: md`A golem drops its core 2% of the time. How many golem kills give a 95% chance of at least one core?`,
      solution: [md`$N \ge \ln(0.05)/\ln(0.98) = -2.996/-0.0202 \approx 148.3$.`, md`So 149 kills. For a boss fought once per playthrough, 2% is effectively "never": bosses should drop key items with certainty.`],
      answer: { kind: 'number', value: 149 },
    },
    {
      id: 'm05-p6',
      title: 'Crits on average',
      type: 'compute',
      difficulty: 1,
      minutes: 3,
      statement: md`Lyra's fireball does 40 base damage, crits 15% of the time and crits do double damage. Expected damage per cast?`,
      solution: [md`$\E = 40\,(1 + 0.15 \cdot (2 - 1)) = 40 \cdot 1.15$.`, md`$= 46$.`],
      answer: { kind: 'number', value: 46 },
    },
    {
      id: 'm05-p7',
      title: 'The extra-lucky last entry',
      type: 'debug',
      difficulty: 2,
      minutes: 8,
      statement: md`This weighted pick uses integer weights. Over a million rolls with weights \`[50, 30, 15, 4, 1]\`, the fire shard (last entry) drops about 1.98% of the time instead of 1%. Find the bug.

\`\`\`gdscript
func pick_index(weights: Array[int], rng: RandomNumberGenerator) -> int:
    var total := 0
    for w in weights:
        total += w
    var roll := rng.randi_range(0, total)
    for i in weights.size():
        if roll < weights[i]:
            return i
        roll -= weights[i]
    return weights.size() - 1
\`\`\``,
      hints: [md`How many different values can \`randi_range(0, total)\` return?`],
      solution: [md`\`randi_range\` includes both ends, so it returns one of $\text{total} + 1 = 101$ values, 0 to 100. The value 100 survives every subtraction and falls through to the final \`return\`, giving the last entry 2 of 101 outcomes, about 1.98%.`, md`Fix: \`rng.randi_range(0, total - 1)\`, or \`rng.randi() % total\`, so the roll covers exactly $[0, \text{total})$. The fall-through return should then be unreachable.`],
      rubric: [md`Identifies the inclusive upper bound`, md`Explains why the extra value goes to the last entry`, md`Fixes the range`],
    },
    {
      id: 'm05-p8',
      title: 'A formula for stat inflation',
      type: 'design',
      difficulty: 3,
      minutes: 12,
      statement: md`A long RPG's stats grow about 6% per level, compounding, from level 1 to 60 (roughly 30 times overall). The designer wants a level-matched fight to take about the same number of hits at every level, and an under-levelled player to still do damage. Choose a damage formula and justify it; say what you would do about $k$ if you picked the divisive form.`,
      solution: [
        md`Compounding growth is multiplicative, so the formula should be scale-invariant: multiplying attack, defence and HP by the same factor should keep hits to kill constant. The relative form $a^2/(a + d)$ does this and never reaches zero, so under-levelled players still deal damage.`,
        md`Subtractive is also scale-invariant but has the zero wall for under-levelled players. Divisive with a fixed $k$ is not scale-invariant: at level 60, defence of about $30k_0$ would make enemies nearly immune if $k$ stayed at its level-1 value.`,
        md`If divisive is preferred (for its constant effective-HP property), scale $k$ with the defender's level, $k(L) = k_0 \cdot 1.06^{L-1}$, which restores scale invariance for level-matched fights.`,
      ],
      rubric: [md`Recognises multiplicative growth and the need for scale invariance`, md`Rejects plain subtractive for the zero wall`, md`Explains the fixed-$k$ problem and a fix`],
    },
    {
      id: 'm05-p9',
      title: 'Pity counter on paper',
      type: 'code-on-paper',
      difficulty: 2,
      minutes: 8,
      statement: md`Write \`func roll_drop() -> bool\` for a drop with chance \`drop_chance\` that is guaranteed on the \`pity_limit\`-th kill since the last drop. Then compute the probability that the drop happens on exactly the 3rd kill after a drop, with \`drop_chance = 0.1\` and \`pity_limit = 3\`.`,
      solution: [
        md`\`\`\`gdscript
var _kills_since_drop := 0


func roll_drop() -> bool:
    _kills_since_drop += 1
    if _kills_since_drop >= pity_limit or rng.randf() < drop_chance:
        _kills_since_drop = 0
        return true
    return false
\`\`\``,
        md`The 3rd kill drops whenever the first two did not: the pity guarantees it. $P = 0.9 \cdot 0.9 = 0.81$.`,
        md`So the average gap is $1 \cdot 0.1 + 2 \cdot 0.09 + 3 \cdot 0.81 = 2.71$ kills, an effective rate of about 37%, far above 10%. A pity limit close to $1/p$ changes the rate a lot; set it well above $1/p$ (2 to 3 times) if the rate should stay near $p$.`,
      ],
      answer: { kind: 'number', value: 0.81 },
      rubric: [md`Counts kills since the last drop and resets on a drop`, md`Guarantees on the limit`, md`Computes 0.81 and comments on the effective rate`],
    },
    {
      id: 'm05-p10',
      title: 'When large variance is right',
      type: 'concept',
      difficulty: 2,
      minutes: 5,
      statement: md`Small damage variance helps players plan. Give two situations where a game deliberately uses large randomness, and explain what it buys.`,
      solution: [md`Loot rewards: rare, high-value drops create memorable moments and keep players fighting after they have mastered a fight; the randomness is in the reward, not in whether the player's plan works.`, md`Risk-and-reward choices the player opts into: a gamble attack with a 50% chance of triple damage gives a decision under uncertainty, which is interesting because the player chose it and can weigh the odds.`, md`The common thread: randomness the player chooses or that sits on rewards is welcome; randomness that decides whether skilled play succeeds feels unfair.`],
      rubric: [md`Two distinct, plausible situations`, md`Explains what the randomness adds in each`, md`Distinguishes chosen or reward randomness from randomness in execution`],
    },
  ],
};
