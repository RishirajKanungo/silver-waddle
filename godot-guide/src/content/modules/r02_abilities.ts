import { md, gd, type Module } from '../types';

// ------------------------------------------------------------------------------------ listings
const ABILITY_EFFECT = gd`
class_name AbilityEffect
extends Resource
## One thing an ability does to one target. Subclasses override apply() and describe().
## Effects are shared data, like every .tres: never store per-cast state in them.


func apply(_user: Combatant, _target: Combatant) -> void:
    push_warning("%s does not override apply()" % resource_path)


## One line for menus and tooltips.
func describe() -> String:
    return ""
`;

const DAMAGE_EFFECT = gd`
class_name DamageEffect
extends AbilityEffect
## Deals damage through the r01 pipeline.

@export var power := 1.0
@export var element: Rpg.Element = Rpg.Element.NONE
@export var is_magic := false


func apply(user: Combatant, target: Combatant) -> void:
    target.receive_attack(user, power, element, is_magic)


func describe() -> String:
    var kind := "magic" if is_magic else "physical"
    var element_name: String = Rpg.Element.find_key(element)
    return "%s damage x%.1f, %s" % [kind, power, element_name.to_lower()]
`;

const HEAL_EFFECT = gd`
class_name HealEffect
extends AbilityEffect
## Restores HP: a flat amount plus power times the user's magic. Defence does not apply.
## A potion (r03) is flat = 100, power = 0; Lyra's Heal is flat = 0, power = 1.5.

@export var flat := 0
@export var power := 1.0


func apply(user: Combatant, target: Combatant) -> void:
    var amount := flat + roundi(power * user.stats.get_stat(Rpg.Stat.MAGIC))
    target.health.heal(amount)


func describe() -> String:
    if power == 0.0:
        return "heal %d" % flat
    return "heal x%.1f magic" % power
`;

const STATUS_EFFECT = gd`
class_name ApplyStatusEffect
extends AbilityEffect
## Tries to apply a status. Put it after the damage effects, matching the pipeline's
## "status effects apply afterwards".

@export var status: StatusEffectData
@export_range(0.0, 1.0, 0.05) var chance := 1.0


func apply(_user: Combatant, target: Combatant) -> void:
    if randf() < chance:
        target.status.apply(status)


func describe() -> String:
    return "%d%% %s" % [roundi(chance * 100.0), status.display_name]
`;

const PRESSURE_EFFECT = gd`
class_name PressureEffect
extends AbilityEffect
## Adds to the target's stagger gauge. k04's gauge listens to Combatant.pressure_added.

@export var amount := 10.0


func apply(_user: Combatant, target: Combatant) -> void:
    target.add_pressure(amount)


func describe() -> String:
    return "+%d pressure" % roundi(amount)
`;

const ABILITY_DATA = gd`
class_name AbilityData
extends Resource
## Something a character can do in battle: a sword technique, a spell, an item's use.
## What it does is a list of small effects; the rest is targeting, cost and timing.

enum Target { SINGLE_ENEMY, ALL_ENEMIES, SINGLE_ALLY, PARTY, SELF }
enum Area { NONE, CIRCLE, LINE, CONE }

## Half the width of a LINE area, in pixels.
const LINE_HALF_WIDTH := 10.0

@export var id: StringName = &""
@export var display_name := ""
@export_multiline var description := ""
@export var icon: Texture2D

@export_group("Cost")
@export_range(0, 2) var atb_cost := 1
@export var mp_cost := 0

@export_group("Targeting")
@export var target: Target = Target.SINGLE_ENEMY
## For SINGLE_ENEMY and SINGLE_ALLY: also hit others on that side inside this shape.
@export var area: Area = Area.NONE
## Circle radius, or line and cone length, in pixels.
@export var area_size := 32.0
## Cone half-angle in degrees.
@export_range(5.0, 90.0) var cone_degrees := 30.0

@export_group("Timing")
## Seconds from choosing the ability to the effects landing.
@export var cast_time := 0.0
## A hit on the caster during the cast cancels it.
@export var interruptible := true
@export var animation: StringName = &"cast"

@export_group("Effects")
## Applied in order to every target.
@export var effects: Array[AbilityEffect] = []


func can_pay(atb_segments: int, mp: int) -> bool:
    return atb_segments >= atb_cost and mp >= mp_cost


## Everyone the ability hits. candidates: the living combatants on the targeted side.
func collect_targets(caster: Combatant, chosen: Combatant, candidates: Array[Combatant]) -> Array[Combatant]:
    var out: Array[Combatant] = []
    match target:
        Target.SELF:
            out.append(caster)
        Target.ALL_ENEMIES, Target.PARTY:
            out.append_array(candidates)
        _:
            if area == Area.NONE:
                out.append(chosen)
            else:
                var origin := _position(caster)
                var aim := _position(chosen)
                for candidate in candidates:
                    if area_contains(origin, aim, _position(candidate)):
                        out.append(candidate)
    return out


## Is point inside the area, for a caster at origin aiming at aim? (m01: distance, dot, cross.)
func area_contains(origin: Vector2, aim: Vector2, point: Vector2) -> bool:
    match area:
        Area.CIRCLE:
            return point.distance_to(aim) <= area_size
        Area.LINE:
            var dir := origin.direction_to(aim)
            var offset := point - origin
            var along := offset.dot(dir)
            var across := absf(offset.cross(dir))
            return along >= 0.0 and along <= area_size and across <= LINE_HALF_WIDTH
        Area.CONE:
            var offset := point - origin
            if offset.length() > area_size:
                return false
            var dir := origin.direction_to(aim)
            return offset.normalized().dot(dir) >= cos(deg_to_rad(cone_degrees))
    return point == aim


func execute(user: Combatant, targets: Array[Combatant]) -> void:
    for t in targets:
        for effect in effects:
            effect.apply(user, t)


static func _position(c: Combatant) -> Vector2:
    return (c.get_parent() as Node2D).global_position
`;

const ABILITY_CASTER = gd`
class_name AbilityCaster
extends Node
## Runs one ability at a time for a combatant: waits the cast time, then applies the effects.
## The battle system (k04) checks can_pay(), spends ATB and MP, and then calls begin().

signal cast_started(ability: AbilityData, duration: float)
signal cast_finished(ability: AbilityData)
signal cast_interrupted(ability: AbilityData)

@export var combatant: Combatant

var casting: AbilityData = null
var _cast_left := 0.0
var _targets: Array[Combatant] = []


func _ready() -> void:
    combatant.damaged.connect(_on_damaged)


func begin(ability: AbilityData, targets: Array[Combatant]) -> void:
    casting = ability
    _targets = targets
    _cast_left = ability.cast_time
    cast_started.emit(ability, ability.cast_time)
    if _cast_left <= 0.0:
        _finish()


func _physics_process(delta: float) -> void:
    if casting == null:
        return
    _cast_left -= delta
    if _cast_left <= delta * 0.5:
        _finish()


func _finish() -> void:
    var ability := casting
    casting = null
    ability.execute(combatant, _targets)
    cast_finished.emit(ability)


func _on_damaged(_result: DamageCalc.Result) -> void:
    if casting != null and casting.interruptible:
        var ability := casting
        casting = null
        cast_interrupted.emit(ability)
`;

const FIRE_WAVE_TRES = String.raw`[gd_resource type="Resource" script_class="AbilityData" load_steps=7 format=3]

[ext_resource type="Script" path="res://scripts/resources/ability_data.gd" id="1_abil"]
[ext_resource type="Script" path="res://scripts/resources/effects/ability_effect.gd" id="2_eff"]
[ext_resource type="Script" path="res://scripts/resources/effects/damage_effect.gd" id="3_dmg"]
[ext_resource type="Script" path="res://scripts/resources/effects/pressure_effect.gd" id="4_prs"]

[sub_resource type="Resource" id="Resource_dmg"]
script = ExtResource("3_dmg")
power = 1.5
element = 1
is_magic = true

[sub_resource type="Resource" id="Resource_prs"]
script = ExtResource("4_prs")
amount = 6.0

[resource]
script = ExtResource("1_abil")
id = &"fire_wave"
display_name = "Fire Wave"
mp_cost = 8
area = 1
area_size = 32.0
cast_time = 0.6
effects = Array[ExtResource("2_eff")]([SubResource("Resource_dmg"), SubResource("Resource_prs")])
`;

const CAST_TEST = gd`
extends Node2D
## A caster and three dummies. Space casts the ability on the middle dummy.
## Scene: this Node2D with children Lyra, Dummy1, Dummy2, Dummy3, each a Character with a
## Combatant (enemies set Enemy Data to slime.tres) and Lyra with an AbilityCaster.

@export var ability: AbilityData

@onready var caster: AbilityCaster = $Lyra/AbilityCaster
@onready var dummies: Array[Combatant] = [$Dummy1/Combatant, $Dummy2/Combatant, $Dummy3/Combatant]


func _ready() -> void:
    caster.cast_started.connect(func(a: AbilityData, t: float) -> void: print("casting %s for %.1f s" % [a.display_name, t]))
    caster.cast_finished.connect(func(a: AbilityData) -> void: print("%s landed" % a.display_name))
    for dummy in dummies:
        dummy.damaged.connect(func(r: DamageCalc.Result) -> void: print("%s took %d" % [dummy.get_parent().name, r.amount]))


func _unhandled_input(event: InputEvent) -> void:
    if event.is_action_pressed("ui_accept") and caster.casting == null:
        var targets := ability.collect_targets(caster.combatant, dummies[1], dummies)
        caster.begin(ability, targets)
`;

const VENOM_FANG_TRES = String.raw`[gd_resource type="Resource" script_class="AbilityData" load_steps=9 format=3]

[ext_resource type="Script" path="res://scripts/resources/ability_data.gd" id="1_abil"]
[ext_resource type="Script" path="res://scripts/resources/effects/ability_effect.gd" id="2_eff"]
[ext_resource type="Script" path="res://scripts/resources/effects/damage_effect.gd" id="3_dmg"]
[ext_resource type="Script" path="res://scripts/resources/effects/apply_status_effect.gd" id="4_sts"]
[ext_resource type="Script" path="res://scripts/resources/effects/pressure_effect.gd" id="5_prs"]
[ext_resource type="Resource" path="res://resources/statuses/poison.tres" id="6_poison"]

[sub_resource type="Resource" id="Resource_dmg"]
script = ExtResource("3_dmg")
power = 1.2

[sub_resource type="Resource" id="Resource_sts"]
script = ExtResource("4_sts")
status = ExtResource("6_poison")
chance = 0.6

[sub_resource type="Resource" id="Resource_prs"]
script = ExtResource("5_prs")
amount = 8.0

[resource]
script = ExtResource("1_abil")
id = &"venom_fang"
display_name = "Venom Fang"
animation = &"attack_side"
effects = Array[ExtResource("2_eff")]([SubResource("Resource_dmg"), SubResource("Resource_sts"), SubResource("Resource_prs")])
`;

const HEALING_LIGHT_TRES = String.raw`[gd_resource type="Resource" script_class="AbilityData" load_steps=5 format=3]

[ext_resource type="Script" path="res://scripts/resources/ability_data.gd" id="1_abil"]
[ext_resource type="Script" path="res://scripts/resources/effects/ability_effect.gd" id="2_eff"]
[ext_resource type="Script" path="res://scripts/resources/effects/heal_effect.gd" id="3_heal"]

[sub_resource type="Resource" id="Resource_heal"]
script = ExtResource("3_heal")
power = 1.2

[resource]
script = ExtResource("1_abil")
id = &"healing_light"
display_name = "Healing Light"
atb_cost = 2
mp_cost = 18
target = 3
cast_time = 1.0
effects = Array[ExtResource("2_eff")]([SubResource("Resource_heal")])
`;

const EQUIPMENT_ADD = gd`
# Add to scripts/resources/equipment_data.gd (r02).
@export_group("Growth")
## The ability this weapon teaches through use. Empty for armour and accessories.
@export var teaches: AbilityData
## Proficiency points per use of that ability; 100 learns it for good.
@export_range(1, 100) var proficiency_per_use := 20
## AP multiplier for shards in this item's sockets: 0, 1, 2 or 3.
@export_range(0, 3) var ap_multiplier := 1
`;

const ABILITY_BOOK = gd`
class_name AbilityBook
extends Resource
## What one party member has learned for good, and progress toward weapon abilities.
## Saved with the PartyMember, so mastery survives changing weapons and reloading.

signal learned(ability: AbilityData)
signal progressed(ability: AbilityData, points: int)

const MASTERED := 100

@export var known: Array[AbilityData] = []
## Proficiency points by ability id, 0 to MASTERED.
@export var proficiency: Dictionary[StringName, int] = {}


## Call each time the member uses an ability in battle.
func record_use(ability: AbilityData, weapon: EquipmentData) -> void:
    if weapon == null or weapon.teaches != ability or ability in known:
        return
    var points := mini(MASTERED, proficiency.get(ability.id, 0) + weapon.proficiency_per_use)
    proficiency[ability.id] = points
    progressed.emit(ability, points)
    if points >= MASTERED:
        known.append(ability)
        learned.emit(ability)


func points_for(ability: AbilityData) -> int:
    return proficiency.get(ability.id, 0)


## Everything usable now: learned abilities, the weapon's own ability, and shard abilities.
func available(loadout: Loadout) -> Array[AbilityData]:
    var out: Array[AbilityData] = known.duplicate()
    var weapon := loadout.weapon
    if weapon != null and weapon.teaches != null and weapon.teaches not in out:
        out.append(weapon.teaches)
    for ability in loadout.granted_abilities():
        if ability not in out:
            out.append(ability)
    return out
`;

const AWARD_AP = gd`
# Add to scripts/rpg/loadout.gd (r02).
## After a battle: every socketed shard earns the AP, times its item's growth multiplier.
func award_ap(amount: int) -> void:
    for shard in weapon_shards:
        if shard != null:
            shard.add_ap(amount * weapon.ap_multiplier)
    for shard in armour_shards:
        if shard != null:
            shard.add_ap(amount * armour.ap_multiplier)
    emit_changed()  # a passive shard may have levelled, which changes stats
`;

const TOASTS = gd`
class_name UnlockToasts
extends CanvasLayer
## Shows unlock messages one at a time: shard levels and abilities learned.
## Scene: a CanvasLayer with a Label child, hidden at start.

const SHOW_SECONDS := 1.5

@onready var label: Label = $Label

var _queue: Array[String] = []
var _showing := false


func watch_member(member: PartyMember) -> void:
    member.book.learned.connect(
        func(ability: AbilityData) -> void:
            push("%s learned %s" % [member.base.display_name, ability.display_name])
    )
    for shard in member.loadout.weapon_shards + member.loadout.armour_shards:
        if shard != null:
            watch_shard(shard)


## Call once when the party gets a shard.
func watch_shard(shard: ShardInstance) -> void:
    shard.leveled_up.connect(_on_shard_leveled.bind(shard))


func push(message: String) -> void:
    _queue.append(message)
    if not _showing:
        _show_next()


func _on_shard_leveled(new_level: int, shard: ShardInstance) -> void:
    var message := "%s reached level %d" % [shard.data.display_name, new_level]
    if new_level <= shard.data.abilities.size():
        message += ": " + shard.data.abilities[new_level - 1].display_name
    push(message)


func _show_next() -> void:
    if _queue.is_empty():
        _showing = false
        label.visible = false
        return
    _showing = true
    label.text = _queue.pop_front()
    label.visible = true
    await get_tree().create_timer(SHOW_SECONDS).timeout
    _show_next()
`;

const PROGRESSION = gd`
class_name Progression
extends RefCounted
## The XP curve. m05 explains the shape; these two numbers set it.

const XP_BASE := 25.0
const XP_EXPONENT := 1.5
const MAX_LEVEL := 50


## XP needed to go from level to level + 1.
static func xp_to_next(level: int) -> int:
    return roundi(XP_BASE * pow(level, XP_EXPONENT))


## Total XP from level 1 to reach level.
static func total_xp_for(level: int) -> int:
    var total := 0
    for l in range(1, level):
        total += xp_to_next(l)
    return total
`;

const PARTY_MEMBER_V3 = gd`
class_name PartyMember
extends Resource
## One member of the party: who they are, how far they have grown, what they wear and know.

signal leveled_up(new_level: int)

@export var base: CharacterStats
@export var level := 1:
    set(value):
        level = value
        rebuild()
## XP earned toward the next level.
@export var xp := 0
@export var loadout: Loadout
@export var book: AbilityBook

var stats := StatBlock.new()


func setup() -> void:
    if loadout == null:
        loadout = Loadout.new()
    if book == null:
        book = AbilityBook.new()
    if not loadout.changed.is_connected(rebuild):
        loadout.changed.connect(rebuild)
    rebuild()


func rebuild() -> void:
    if base == null:
        return
    base.apply_to(stats, level)
    if loadout != null:
        loadout.apply_to(stats)


## Adds XP and levels up as many times as it pays for. Returns the levels gained.
func add_xp(amount: int) -> int:
    var gained := 0
    xp += amount
    while level < Progression.MAX_LEVEL and xp >= Progression.xp_to_next(level):
        xp -= Progression.xp_to_next(level)
        level += 1  # the setter rebuilds the stats
        gained += 1
        leveled_up.emit(level)
    return gained


func abilities() -> Array[AbilityData]:
    return book.available(loadout)
`;

const BATTLE_REWARDS = gd`
class_name BattleRewards
extends RefCounted
## What winning a fight gives: XP to every party member, AP to every socketed shard, gold.
## Everyone gets the full amount, so swapping party members never costs progress.


static func grant(party: Array[PartyMember], defeated: Array[EnemyData]) -> Dictionary:
    var xp := 0
    var ap := 0
    var gold := 0
    for enemy in defeated:
        xp += enemy.xp
        ap += enemy.ap
        gold += enemy.gold
    for member in party:
        member.add_xp(xp)
        member.loadout.award_ap(ap)
    GameState.gold += gold
    return {"xp": xp, "ap": ap, "gold": gold}
`;

const PROGRESSION_DEBUG = gd`
extends Label
## Debug panel. 1 grants a field fight's XP (22), 2 a ruins fight's (42).
## Prints every level up with the stats that changed.

const FIELD_XP := 22
const RUINS_XP := 42

@export var member: PartyMember


func _ready() -> void:
    member.setup()
    member.leveled_up.connect(func(new_level: int) -> void: print("reached level %d" % new_level))
    _redraw()


func _unhandled_key_input(event: InputEvent) -> void:
    var key := event as InputEventKey
    if key == null or not key.pressed or key.echo:
        return
    if key.keycode == KEY_1:
        _grant(FIELD_XP)
    elif key.keycode == KEY_2:
        _grant(RUINS_XP)


func _grant(amount: int) -> void:
    var before := _snapshot()
    if member.add_xp(amount) > 0:
        var after := _snapshot()
        for stat: Rpg.Stat in Rpg.Stat.values():
            var change: int = after[stat] - before[stat]
            if change != 0:
                print("  %s +%d" % [Rpg.Stat.find_key(stat), change])
    _redraw()


func _snapshot() -> Dictionary:
    var out := {}
    for stat: Rpg.Stat in Rpg.Stat.values():
        out[stat] = member.stats.get_stat(stat)
    return out


func _redraw() -> void:
    text = "Level %d   XP %d / %d" % [member.level, member.xp, Progression.xp_to_next(member.level)]
`;

// --------------------------------------------------------------------------------------- module
export const MODULE: Module = {
  id: 'r02',
  part: 'rpg',
  order: 2,
  title: 'Abilities and progression',
  summary: 'Abilities as data built from small composable effects, with targeting, area shapes and cast times; learning abilities from weapons through use and from shards through AP; the XP curve, stat growth per level, and balancing progression against the content of each area.',
  relevance: md`This module is where Shardbound's characters grow. Lyra's Fire Wave, Kai's Rising Slash and every item's effect become \`.tres\` files built from four effect types, so a new ability is an Inspector session, not new code. Weapons teach their abilities as Kai uses them, shards level up from the AP of each fight, and the XP curve is tuned so the party reaches the golem at about level 11 without grinding. The battle system (k04) calls \`AbilityCaster.begin()\`; the menus (r05) list \`PartyMember.abilities()\`.`,
  prereqs: ['r01', 'm05'],
  areas: ['systems', 'combat', 'math'],
  lessons: [
    // ============================================================================ r02-1
    {
      id: 'r02-1',
      title: 'Abilities as data: targeting and composable effects',
      minutes: 45,
      objectives: [
        'Describe an ability as data: costs, a target type, an area shape, a cast time and a list of effects.',
        'Build damage, heal, status and pressure effects as small Resources with one `apply` method each.',
        'Decide whether a point is inside a circle, line or cone area with distance, dot and cross products.',
        'Run an ability with a cast time that a hit can interrupt.',
        'Read and write the `.tres` file an ability is saved as.',
      ],
      cells: [
        {
          kind: 'text',
          md: md`In tactical mode Lyra picks **Fire Wave** and the player chooses a slime. A ring appears around it showing who will be caught. She raises her staff for 0.6 seconds (a hit now would cancel the spell), then three slimes take fire damage and their stagger gauges jump. The menu showed the cost beforehand: one ATB segment and 8 MP.

Every part of that is a decision a designer wants to tune without touching code: who can be targeted, the shape and size of the area, the cast time, the costs, and what happens to each target. Kai's Venom Fang deals damage and maybe poisons. A potion heals a flat 100. Bram's Shield Bash does little damage and a lot of pressure. Lyra's Healing Light heals the whole party.

r01's damage pipeline knows how to turn *power, element, physical or magic* into a number. This lesson builds the layer above it: an \`AbilityData\` resource whose behaviour is a **list of small effects**.`,
        },
        {
          kind: 'callout',
          tone: 'definition',
          title: 'AbilityData and AbilityEffect',
          md: md`- **Costs**: \`atb_cost\` (0 to 2 segments) and \`mp_cost\`.
- **Target type**: *single enemy, all enemies, single ally, party, self*.
- **Area** for single-target abilities: *none, circle* (around the chosen target), *line* (from the caster towards the target), *cone* (from the caster, opening towards the target), with a size in pixels.
- **Cast time**: seconds between choosing the ability and its effects landing; *interruptible* if a hit cancels it.
- **Effects**: an ordered list of \`AbilityEffect\` resources. Each one does one thing to one target: \`DamageEffect\`, \`HealEffect\`, \`ApplyStatusEffect\`, \`PressureEffect\`.`,
        },
        {
          kind: 'callout',
          tone: 'design',
          title: 'Why a list of effects',
          md: md`The first design most people try is one class with every field: power, element, heal amount, status, chance, pressure. Every ability then carries fields it ignores, and each new idea ("damage and heal the caster") adds more. The second attempt is inheritance (\`FireAbility extends MagicAbility extends Ability\`), which breaks as soon as an ability mixes two kinds.

A list of effects is **composition**: four small classes, each with the fields it needs, combined freely. "Damage, then 60% poison, then 8 pressure" is three entries. A new behaviour is one new effect class, and every existing ability and item can use it. The order is meaningful: effects run in list order for each target, so putting a status after the damage matches r01's rule that status effects apply after the hit.`,
        },
        { kind: 'code', file: 'scripts/resources/effects/ability_effect.gd', code: ABILITY_EFFECT, note: md`The base class is almost empty on purpose. GDScript methods are virtual: when \`AbilityData\` calls \`effect.apply(user, target)\` on an entry that is really a \`DamageEffect\`, the \`DamageEffect\` version runs.` },
        { kind: 'code', file: 'scripts/resources/effects/damage_effect.gd', code: DAMAGE_EFFECT },
        { kind: 'code', file: 'scripts/resources/effects/heal_effect.gd', code: HEAL_EFFECT },
        { kind: 'code', file: 'scripts/resources/effects/apply_status_effect.gd', code: STATUS_EFFECT },
        { kind: 'code', file: 'scripts/resources/effects/pressure_effect.gd', code: PRESSURE_EFFECT },
        {
          kind: 'check',
          q: md`Venom Fang and Viper Strike both use an external \`poison_60.tres\` (an \`ApplyStatusEffect\` with 60% chance) in their effects lists. A designer opens Viper Strike and changes the chance to 80%. What happens, and when is that what you want?`,
          options: [
            md`Both abilities now poison 80% of the time; you want it when the shared file means "the standard poison chance"`,
            md`Only Viper Strike changes, because each ability has its own copy`,
            md`Godot refuses the edit because the resource is used twice`,
            md`Venom Fang keeps 60% until the project is reloaded`,
          ],
          answer: 0,
          explain: md`An external \`.tres\` is one shared object. That is useful for deliberately shared tuning ("all standard poisons"). For a one-off value, use a built-in sub-resource (create it directly in the ability's Inspector with **New ApplyStatusEffect**), or right-click a shared one and choose **Make Unique**.`,
        },
        {
          kind: 'text',
          md: md`### Targets and area shapes

Single-target abilities can also hit others on the same side inside an area. Each shape is a few lines of vector math from m01, with the caster at $\mathbf{o}$, the chosen target at $\mathbf{a}$, a candidate at $\mathbf{p}$, and the aim direction $\hat{\mathbf{d}} = (\mathbf{a} - \mathbf{o}) / |\mathbf{a} - \mathbf{o}|$:

- **Circle** of radius $r$ around the target: $|\mathbf{p} - \mathbf{a}| \le r$.
- **Line** of length $L$ and half-width $w$ from the caster: with $\mathbf{v} = \mathbf{p} - \mathbf{o}$, the distance *along* the aim is $\mathbf{v} \cdot \hat{\mathbf{d}}$ and the distance *across* it is $|\mathbf{v} \times \hat{\mathbf{d}}|$ (the 2D cross product, a number). Inside when $0 \le \mathbf{v}\cdot\hat{\mathbf{d}} \le L$ and $|\mathbf{v} \times \hat{\mathbf{d}}| \le w$.
- **Cone** of length $L$ and half-angle $\alpha$: inside when $|\mathbf{v}| \le L$ and the angle between $\mathbf{v}$ and $\hat{\mathbf{d}}$ is at most $\alpha$.`,
        },
        {
          kind: 'derive',
          title: 'the cone test without angles',
          goal: md`Decide whether $\mathbf{v}$ lies within $\alpha$ of the unit aim direction $\hat{\mathbf{d}}$ without computing an angle.`,
          steps: [
            {
              md: md`For unit vectors, the dot product is the cosine of the angle between them: $\hat{\mathbf{v}} \cdot \hat{\mathbf{d}} = \cos\theta$, with $\theta \in [0°, 180°]$.`,
              choose: {
                prompt: md`$\cos$ is decreasing on $[0°, 180°]$. So $\theta \le \alpha$ is the same as…`,
                options: [md`$\cos\theta \ge \cos\alpha$`, md`$\cos\theta \le \cos\alpha$`, md`$\sin\theta \le \sin\alpha$`],
                answer: 0,
                explain: md`A smaller angle has a larger cosine on this interval, so the inequality flips. Sine is not monotonic on $[0°, 180°]$, so it cannot be used.`,
              },
            },
            {
              md: md`The test becomes \`v.normalized().dot(dir) >= cos(deg_to_rad(cone_degrees))\`: one normalize, one dot product, one cosine of a constant. No \`acos\`, and no special cases for angles that wrap around, which the angle-based version (\`angle_to\` returns signed angles) would need.`,
            },
          ],
          takeaway: md`Compare cosines, not angles. The same trick decides "is the enemy in front of me" for AI (k02) and for backstab bonuses.`,
        },
        { kind: 'code', file: 'scripts/resources/ability_data.gd', code: ABILITY_DATA, note: md`\`collect_targets\` takes \`Combatant\`s, the r01 component on every fighter, and reads positions from their parent \`Character\`. \`ALL_ENEMIES\` and \`PARTY\` ignore the area. If g04 created a simpler \`AbilityData\` with \`power\` and \`element\` fields, this replaces it: those fields now live in \`DamageEffect\`.` },
        {
          kind: 'numeric',
          q: md`A line ability has length 96 px and half-width 10 px. The caster is at $(0, 0)$ and aims at $(100, 0)$. How many of these slimes does it hit: $(60, 8)$, $(100, 0)$, $(30, -12)$, $(90, -9)$?`,
          answer: { kind: 'number', value: 2 },
          hints: [md`Here $\hat{\mathbf{d}} = (1, 0)$, so *along* is $x$ and *across* is $|y|$.`],
          explain: md`$(60, 8)$: along 60, across 8: hit. $(100, 0)$: along 100 > 96: miss (the chosen target itself is out of reach). $(30, -12)$: across 12 > 10: miss. $(90, -9)$: hit. Two slimes.`,
        },
        {
          kind: 'viz',
          viz: { type: 'rpg.skill' },
          task: md`Start from the **Fire Wave** preset and press **J** (or *Cast*) to cast it on the middle slime. Then switch the area to **cone**, aim at different slimes with ← and →, and add an **Apply status: poison** effect. Watch the \`.tres\` text change as you edit: that file is all Godot stores.`,
          caption: md`Lyra (level 5, magic 58 with the Oak Staff) casts at the dummies on the right. Damage goes through the same pipeline as r01; heals target the party on the left. The cast bar shows the cast time; press **K** during a cast to hit Lyra and see an interruptible cast cancel.`,
        },
        {
          kind: 'text',
          md: md`### Casting

A cast is a small state machine: idle, casting (time left), done. \`AbilityCaster\` is a component on each party member that holds that state. The battle system (k04) checks \`can_pay\`, spends the ATB and MP, collects the targets **when the ability is chosen** and calls \`begin\`; the caster counts down in \`_physics_process\` (so tactical mode's slow time scale also slows casts) and then calls \`execute\`. Because \`Combatant.damaged\` fires on every hit, an interruptible cast can listen to it and cancel.

Collecting targets at choice time is a design decision: a slime that wanders into the circle during the cast is not hit, and one that leaves still is. The alternative, collecting when the cast lands, rewards enemies that dodge and makes long casts feel unreliable. Either can be right; decide per game, and show the player which one you chose by drawing the area during the cast.`,
        },
        { kind: 'code', file: 'scenes/components/ability_caster.gd', code: ABILITY_CASTER },
        {
          kind: 'text',
          md: md`### What Godot saves

When you build Fire Wave in the Inspector and save it, Godot writes a text \`.tres\`. You rarely edit it by hand, but reading it helps: it shows that an ability is nothing but data, it explains what "built-in sub-resource" means (the \`[sub_resource]\` sections live inside this file), and it makes ability changes reviewable in git (p02).`,
        },
        { kind: 'code', file: 'resources/abilities/fire_wave.tres', lang: 'tscn', code: FIRE_WAVE_TRES, note: md`Only values that differ from the script defaults are written: \`atb_cost\` (1) and \`target\` (0, single enemy) are missing. Enums are stored as integers (\`element = 1\` is \`FIRE\`, \`area = 1\` is \`CIRCLE\`), which is why reordering an enum after you have saved resources silently changes them: add new values at the end.` },
        {
          kind: 'steps',
          title: 'Build Fire Wave and cast it',
          steps: [
            md`Create the five effect scripts in \`scripts/resources/effects/\` and replace \`scripts/resources/ability_data.gd\`. Save \`ability_effect.gd\` first, since the others extend it.`,
            md`Create \`resources/abilities/fire_wave.tres\` (**Create New → Resource… → AbilityData**). Set *Display Name*, *Mp Cost* 8, *Area* Circle, *Area Size* 32, *Cast Time* 0.6.`,
            md`Expand *Effects*, click **Add Element**, and in the new slot choose **New DamageEffect**. Click it to expand and set *Power* 1.5, *Element* Fire, *Is Magic* on. Add a second element with **New PressureEffect**, *Amount* 6.`,
            md`Make a test scene: a \`Node2D\` root with a \`Lyra\` Character (with \`Combatant\` and an \`AbilityCaster\` child whose *Combatant* export points at it) and three slime Characters named \`Dummy1\`–\`Dummy3\` placed 24 px apart. Attach the script below, drag \`fire_wave.tres\` into its *Ability* export, run with **F6** and press **Enter**.`,
          ],
          result: md`The Output shows \`casting Fire Wave for 0.6 s\`, then \`Fire Wave landed\`, and a damage line for each slime within 32 px of the middle one: with the dummies 24 px apart, all three.`,
          troubleshoot: [
            { problem: md`The *Effects* slot offers every Resource type, or none of the effects.`, fix: md`The array must be typed (\`Array[AbilityEffect]\`) and each effect script must have \`class_name\` and extend \`AbilityEffect\`. Save them, then reopen the ability.` },
            { problem: md`Only the middle slime takes damage.`, fix: md`*Area* is still *None*, or *Area Size* is smaller than the spacing. The circle is centred on the chosen target, so a slime 24 px away needs a size of at least 24.` },
            { problem: md`\`Invalid call. Nonexistent function 'receive_attack' in base 'Nil'\`.`, fix: md`A dummy has no \`Combatant\` child named exactly *Combatant*, so the \`@onready\` array holds \`null\`. Check the node names in the scene tree.` },
          ],
        },
        { kind: 'code', file: 'scripts/tests/cast_test.gd', code: CAST_TEST },
        {
          kind: 'build',
          ch: {
            id: 'r02-1-build',
            title: 'Two new abilities, no new code',
            goal: md`Make **Venom Fang** for Kai and **Healing Light** for Lyra using only the Inspector. If you write a new script for either, the effect system is missing something.`,
            requirements: [
              md`Venom Fang: single enemy, 1 ATB, no MP, physical damage at power 1.2, then a 60% chance of poison (\`poison.tres\` from r01), then 8 pressure.`,
              md`Healing Light: the whole party, 2 ATB, 18 MP, a 1.0 s cast, heals 1.2 × Lyra's magic.`,
              md`Casting Venom Fang on a slime in the test scene poisons it about 6 times in 10 (try it 20 times and count).`,
              md`Healing Light heals every party member, including ones far from Lyra.`,
            ],
            hints: [
              md`Target type *Party* ignores the area, so leave *Area* at *None*.`,
              md`Use the external \`poison.tres\` for the status itself (it is the definition of poison) but a built-in \`ApplyStatusEffect\` for the 60% chance, which belongs to this ability.`,
              md`Open the saved \`.tres\` in a text editor and compare it with the reference: the same structure means the same ability.`,
            ],
            solution: [
              { file: 'resources/abilities/venom_fang.tres', code: VENOM_FANG_TRES, lang: 'tscn' },
              { file: 'resources/abilities/healing_light.tres', code: HEALING_LIGHT_TRES, lang: 'tscn' },
            ],
            explain: md`\`target = 3\` is \`PARTY\` in the \`Target\` enum. Venom Fang lists its effects in pipeline order: the hit first, so the status applies afterwards, then pressure. Notice what is not in either file: no code, no class names other than the effect scripts. This is the payoff of composition: the ability list can grow to dozens without the codebase growing.`,
          },
        },
        {
          kind: 'paper',
          problem: {
            id: 'r02-1-paper',
            title: "Bram's signature ability",
            type: 'design',
            difficulty: 2,
            minutes: 10,
            statement: md`Design an ability for Bram (shield and mace, guard and stagger) using only the four effect types. Give its target type, area, cast time, costs and effects in order, and explain how it supports his role.`,
            solution: [
              md`Example: **Earthbreaker**. Single enemy with a circle of 28 px, 2 ATB, 0 MP, cast time 0.4 s, not interruptible (Bram is the tank and should not lose casts to chip damage).`,
              md`Effects: physical damage ×0.8, then 30 pressure, then 50% slow. Low damage keeps Kai as the damage dealer; high pressure in an area makes Bram the one who sets up staggers; slow helps the party control a crowd.`,
              md`Two ATB is the price of the area pressure: Bram cannot use it every few seconds, so the player decides when to stagger a group.`,
            ],
            rubric: [md`Uses only the four effect types`, md`Effects ordered with damage before status`, md`Costs and cast time justified against the effect`, md`Connects the design to Bram's role in the party`],
          },
        },
        {
          kind: 'recall',
          prompt: md`Write the inside-tests for a circle, a line and a cone area.`,
          answer: md`Circle: $|\mathbf{p} - \mathbf{a}| \le r$. Line: $0 \le \mathbf{v}\cdot\hat{\mathbf{d}} \le L$ and $|\mathbf{v}\times\hat{\mathbf{d}}| \le w$ with $\mathbf{v} = \mathbf{p} - \mathbf{o}$. Cone: $|\mathbf{v}| \le L$ and $\hat{\mathbf{v}}\cdot\hat{\mathbf{d}} \ge \cos\alpha$.`,
        },
        {
          kind: 'explain',
          prompt: md`Why should effects never store per-cast state, such as "the last target I hit"?`,
          model: md`An effect is a Resource referenced by an ability, and the ability is a \`.tres\` shared by everyone who uses it: Kai, an enemy with the same move, a tooltip. Two casts in flight at once would overwrite each other's state, and the state would persist between battles in a way nothing resets. Per-cast state belongs to the code running the cast (the \`AbilityCaster\`) or is passed in as arguments. Keeping effects stateless also makes them safe to reuse across abilities and items.`,
        },
      ],
      cards: [
        { id: 'r02-1-c1', kind: 'concept', front: md`Why build abilities from a list of effects instead of one class with every field?`, back: md`Composition: each effect has only the fields it needs, any combination is a new list, and a new behaviour is one new effect class that every ability and item can use.` },
        { id: 'r02-1-c2', kind: 'cloze', text: md`Cone test: \`v.normalized().dot(dir) >= {{}}(deg_to_rad(cone_degrees))\`.`, answers: ['cos'] },
        { id: 'r02-1-c3', kind: 'compute', front: md`Circle area radius 32 around the target at $(100, 50)$. Is a slime at $(120, 74)$ inside? Distance?`, answer: { kind: 'number', value: Math.hypot(20, 24) }, back: md`$\sqrt{20^2 + 24^2} \approx 31.24 \le 32$: inside.` },
        { id: 'r02-1-c4', kind: 'concept', front: md`Built-in sub-resource vs external \`.tres\` for an effect?`, back: md`Built-in: private to this ability, stored inside its file. External: shared by everything that references it, so one edit changes them all.` },
        { id: 'r02-1-c5', kind: 'concept', front: md`Why must new enum values go at the end?`, back: md`\`.tres\` files store enums as integers. Inserting a value in the middle shifts the numbers and silently changes every saved resource.` },
      ],
    },
    // ============================================================================ r02-2
    {
      id: 'r02-2',
      title: 'Learning abilities: weapons, shards and AP',
      minutes: 40,
      objectives: [
        'Implement weapon proficiency: a weapon\'s ability is usable while equipped and learned for good after enough uses.',
        'Award AP after battles to every socketed shard, with growth multipliers, and compute battles to the next shard level.',
        'Compare skill trees with swappable shards on permanence, build identity, content cost and interface cost.',
        'Design unlock and upgrade feedback: visible progress, a preview of what is next, and a notification at the moment it happens.',
      ],
      cells: [
        {
          kind: 'text',
          md: md`Kai buys the Rune Blade and a new command appears under his abilities: **Triple Slash**, with a small bar next to it at 0%. He uses it in a few fights, the bar fills, and at 100% a message says he has learned it. Later he switches back to the Iron Sword for its higher attack, and Triple Slash is still there.

That is how FF7 Remake teaches weapon abilities: each weapon comes with one, using it in battle raises the character's proficiency, and at 100% the character keeps it permanently and can use it with any weapon. The weapon is the tutorial for its move, and buying a weapon is also buying a new ability to learn.

Shardbound uses two sources of abilities with different rules:

| source | how you get it | permanent? | what it gives |
|---|---|---|---|
| weapon proficiency | use the weapon's ability | yes, once learned | signature moves per character |
| shards | socket a shard; AP after battles levels it | no, it moves with the shard | spells and passives anyone can use |`,
        },
        {
          kind: 'callout',
          tone: 'definition',
          title: 'Proficiency, AP and growth',
          md: md`- **Proficiency** is per character and per ability: points from 0 to 100. Each use of a weapon's ability adds that weapon's \`proficiency_per_use\`. At 100 the ability joins the character's \`known\` list.
- **AP** is earned by every socketed shard after each won battle: the sum of the defeated enemies' AP, multiplied by the item's \`ap_multiplier\` (FF7 had weapons with double and triple growth slots, and some with none).
- A shard's **level** comes from its total AP and its thresholds (r01): Fire reaches level 2 at 200 AP and level 3 at 600.`,
        },
        { kind: 'code', file: 'scripts/resources/equipment_data.gd', code: EQUIPMENT_ADD, fragment: true, note: md`Three fields added to r01's \`EquipmentData\`. \`teaches\` is an \`AbilityData\`; the Iron Sword teaches Rising Slash at 20 points per use (five uses), the Rune Blade teaches Triple Slash at 10 per use (ten uses).` },
        { kind: 'code', file: 'scripts/rpg/ability_book.gd', code: ABILITY_BOOK, note: md`\`proficiency\` is a typed dictionary (Godot 4.4), keyed by the ability's \`id\` rather than by the resource itself, so the save file (r06) stores plain names. The book belongs to the character, not to the weapon: Kai's progress on Rising Slash is his, whichever Iron Sword he holds.` },
        {
          kind: 'numeric',
          q: md`The Iron Sword teaches Rising Slash at 20 proficiency per use. Kai uses it twice per fight. After how many fights has he learned it?`,
          answer: { kind: 'number', value: 3 },
          explain: md`He needs $100 / 20 = 5$ uses. Two per fight gives 2, 4, then 6 uses: the fifth use happens in the third fight.`,
        },
        {
          kind: 'text',
          md: md`### AP and shard levels

After a won battle every socketed shard earns the battle's AP. It is not split between shards: a character with three shards levels all three at once, which rewards filling sockets. The growth multiplier makes sockets differ: a weapon with ×2 growth levels its shards twice as fast, which is a reason to keep a weaker weapon while training a shard.

Thresholds set the pace. With a field battle worth 6 AP (two enemies at 3) and Fire's thresholds at 200 and 600, Fire II arrives after 34 field battles and Fire III after 100; in the ruins, at 16 AP a battle, it is 13 and 38. A useful target is that a shard socketed at the start of an area reaches level 2 within that area and level 3 during the next one, so the player sees progress in every area without the top level coming too early.`,
        },
        { kind: 'code', file: 'scripts/rpg/loadout.gd', code: AWARD_AP, fragment: true },
        {
          kind: 'viz',
          viz: { type: 'rpg.shard' },
          task: md`With the defaults, find the battle where Kai learns Rising Slash and where Fire reaches level 2. Then move to the **ruins** and turn on **×2 growth**: how many battles does Fire III take now? Finally set uses per battle to 0 and see what the player loses by never using the weapon's ability.`,
          caption: md`Each battle awards the area's AP to every socketed shard and adds proficiency for each use of the weapon's ability. The event list is what the unlock notifications would show, in order.`,
        },
        {
          kind: 'numeric',
          q: md`Fire has thresholds [200, 600]. In the ruins a battle gives 16 AP, and Fire sits in a ×2 growth socket. How many battles does a new Fire shard need to reach level 3?`,
          answer: { kind: 'number', value: 19 },
          explain: md`Each battle gives $16 \times 2 = 32$ AP. Level 3 needs 600 AP: $600 / 32 = 18.75$, so the 19th battle.`,
        },
        {
          kind: 'text',
          md: md`### Skill trees or shards

Many action RPGs grow characters with a **skill tree**: points from levels are spent on nodes that unlock abilities and bonuses for good. FF7 Rebirth, for example, adds per-character skill trees next to materia. The two systems trade off differently:

| | skill tree | shards |
|---|---|---|
| permanence | choices stick (respec is a feature to design) | everything can be moved at any time |
| build identity | strong: "my Kai" differs from yours | weaker per character, strong per loadout |
| experimentation | cautious, because mistakes cost | free, so players try more combinations |
| content cost | every node is designed per character | each shard works for anyone |
| interface | a large screen to design and navigate | sockets on the equipment screen |
| save data | the set of unlocked nodes | shard instances and where they sit |

Shardbound uses shards for spells and passives and weapon proficiency for signature moves, and has no tree. That is mostly a scope decision: a tree for three characters is a lot of nodes to design and balance, while shards and weapons are content that also fills shops and chests. If playtests show that characters feel interchangeable, a small tree (five or six nodes each) is the next thing to try.`,
        },
        {
          kind: 'callout',
          tone: 'design',
          title: 'Unlock and upgrade feedback',
          md: md`Progress the player cannot see does not motivate. For every unlock system:

1. **Show progress where the choice is made.** The equipment screen shows "Rising Slash 60%" next to the sword and "Fire: 162 / 200 AP" on the shard.
2. **Preview what is next.** "Fire II at level 2" tells the player why to keep the shard socketed.
3. **Notify at the moment.** After the battle, a short message per unlock: "Fire reached level 2: Fire II". Queue them; never stack them on top of each other.
4. **Mark what is new** until the player has looked at it, so a learned ability is found in the menu.
5. **Never take progress away silently.** Moving a shard keeps its AP because AP lives in the \`ShardInstance\`, and switching weapons keeps proficiency because it lives in the \`AbilityBook\`.`,
        },
        {
          kind: 'check',
          q: md`The player moves a level 2 Fire shard from Lyra's staff to Kai's sword. What happens to its AP and level, given r01's design?`,
          options: [md`They move with it: AP is stored in the ShardInstance, which is what moves`, md`They reset: AP is stored per socket`, md`Lyra keeps the level and Kai starts at level 1`, md`It depends on the sword's growth multiplier`],
          answer: 0,
          explain: md`The socket holds a reference to a \`ShardInstance\`, and the instance holds \`ap\`. Moving the reference moves the progress. The growth multiplier only affects AP earned from now on.`,
        },
        {
          kind: 'steps',
          title: 'Teach Rising Slash through the Iron Sword',
          steps: [
            md`Add the three *Growth* fields to \`equipment_data.gd\`, \`award_ap\` to \`loadout.gd\`, and create \`scripts/rpg/ability_book.gd\`. Add \`@export var book: AbilityBook\` to \`PartyMember\` and create it in \`setup()\` when it is \`null\` (lesson 3 gives the full listing).`,
            md`Create \`resources/abilities/rising_slash.tres\` (id \`rising_slash\`, one \`DamageEffect\` at power 2.0 and a \`PressureEffect\` of 12). Open \`iron_sword.tres\` and drag it into *Teaches*; set *Proficiency Per Use* to 20.`,
            md`In a test script, equip the Iron Sword on Kai and call \`kai.book.record_use(rising_slash, kai.loadout.weapon)\` five times, printing \`kai.book.points_for(rising_slash)\` and \`kai.abilities()\` after each call.`,
            md`Equip the Rune Blade and print \`kai.abilities()\` again.`,
          ],
          result: md`Points go 20, 40, 60, 80, 100; after the fifth call \`learned\` fires and Rising Slash is in \`known\`. With the Rune Blade equipped, \`abilities()\` lists Rising Slash (learned) and Triple Slash (the Rune Blade's, not yet learned).`,
          troubleshoot: [
            { problem: md`Points never rise.`, fix: md`\`weapon.teaches != ability\` is true: the sword references a different \`rising_slash.tres\` than the one you pass, for example a duplicate. Load both from the same path.` },
            { problem: md`An error about assigning to a typed dictionary.`, fix: md`Typed dictionaries need Godot 4.4 or newer. On 4.3, declare \`proficiency\` as a plain \`Dictionary\`.` },
          ],
        },
        {
          kind: 'build',
          ch: {
            id: 'r02-2-build',
            title: 'Unlock notifications',
            goal: md`Show a short message whenever a shard levels up or a weapon ability is learned, one message at a time, so that a battle with three unlocks shows three readable messages.`,
            requirements: [
              md`Messages appear for 1.5 s each, in the order the unlocks happened, and never overlap.`,
              md`A shard level-up names the new ability when the shard grants one ("Fire reached level 2: Fire II").`,
              md`Learning a weapon ability shows "Kai learned Rising Slash".`,
              md`The notifier only listens to signals (\`ShardInstance.leveled_up\`, \`AbilityBook.learned\`); no other script calls it except to register shards.`,
            ],
            hints: [
              md`\`leveled_up\` only passes the new level. \`signal.connect(_on_shard_leveled.bind(shard))\` appends the shard as an extra argument.`,
              md`An \`await get_tree().create_timer(1.5).timeout\` inside a function that calls itself again is a simple queue runner.`,
            ],
            solution: [{ file: 'ui/unlock_toasts.gd', code: TOASTS }],
            explain: md`A queue plus one label is enough because unlocks are rare and sequential. The lambda for \`learned\` captures \`member\` so the message can name the character; the bound callable for shards does the same for the shard. r05 replaces the \`Label\` with a pixel-art panel that slides in.`,
          },
        },
        {
          kind: 'paper',
          problem: {
            id: 'r02-2-paper',
            title: 'A tree for Bram?',
            type: 'design',
            difficulty: 2,
            minutes: 10,
            statement: md`Playtesters say Bram feels like "Kai with a shield". Propose a small skill tree for Bram only (at most six nodes) that strengthens his identity, and say what it costs in content, interface and balance compared with adding two Bram-only shards instead.`,
            solution: [
              md`Example tree, two branches of three: *Guard* (guarding builds ATB faster; guarding a hit adds 10 pressure to the attacker; perfect guards restore 5% HP) and *Breaker* (Shield Bash pressure +50%; staggered enemies take +20% from Bram; Earthbreaker radius +8 px).`,
              md`Every node pushes his role (absorb hits, enable staggers), which no shard can do because shards are character-neutral by design.`,
              md`Costs: six designed and balanced nodes, a tree screen for one character (or a list that looks like one), points to award (one per level from 5 to 10), and save data for unlocked nodes. Two Bram-only shards would be cheaper (they reuse the equipment screen), but "shards anyone can use" is a rule players learn, and breaking it costs clarity.`,
            ],
            rubric: [md`Nodes reinforce a distinct role`, md`Explains why shards cannot do the same`, md`Counts content, interface and save costs`, md`Compares honestly with the shard alternative`],
          },
        },
        {
          kind: 'recall',
          prompt: md`Where is each stored: Kai's progress on Rising Slash, the AP of a Fire shard, the fact that the Iron Sword teaches Rising Slash?`,
          answer: md`Kai's \`AbilityBook.proficiency\` (by ability id); the \`ShardInstance.ap\`; \`iron_sword.tres\` (\`EquipmentData.teaches\`).`,
        },
        {
          kind: 'explain',
          prompt: md`Why give every socketed shard the full AP of a battle instead of splitting it between them?`,
          model: md`Splitting punishes the player for using the system: a third shard would slow down the other two, so the optimal play is to socket as little as possible, which is the opposite of what shards are for. Full AP for each rewards filling sockets and makes linked pairs and passives cheap to try. The pace is then controlled by the thresholds and the growth multipliers, which are per-shard and per-item numbers a designer can tune without changing the rule.`,
        },
      ],
      cards: [
        { id: 'r02-2-c1', kind: 'concept', front: md`Weapon proficiency in one sentence (FF7 Remake style)?`, back: md`Using a weapon's ability raises the character's proficiency with it; at 100% the character keeps the ability with any weapon.` },
        { id: 'r02-2-c2', kind: 'compute', front: md`Battle gives 6 AP, growth ×1, threshold 200. Battles to level 2?`, answer: { kind: 'number', value: 34 }, back: md`$200/6 = 33.3$, so the 34th battle.` },
        { id: 'r02-2-c3', kind: 'cloze', text: md`To pass extra arguments to a signal handler, connect \`handler.{{}}(extra)\`.`, answers: ['bind'] },
        { id: 'r02-2-c4', kind: 'concept', front: md`Skill trees vs shards: two differences.`, back: md`Trees are permanent and give per-character identity but cost designed nodes per character; shards are swappable, encourage experimenting and work for anyone, with weaker identity.` },
        { id: 'r02-2-c5', kind: 'concept', front: md`Five rules for unlock feedback?`, back: md`Show progress where choices are made, preview what is next, notify at the moment (queued), mark new things, never lose progress silently.` },
      ],
    },
    // ============================================================================ r02-3
    {
      id: 'r02-3',
      title: 'XP, levels and balancing progression',
      minutes: 40,
      objectives: [
        'Implement an XP curve $\\text{xp}(L) = \\operatorname{round}(a L^k)$ and level up several times from one reward.',
        'Grant XP, AP and gold after a battle to the whole party.',
        'Compute the expected level at the end of each area from encounter XP and the curve.',
        'Check enemy numbers against the party at the expected level with hits-to-kill.',
      ],
      cells: [
        {
          kind: 'text',
          md: md`The golem is tuned for a party of about level 11. If the player arrives at level 8 the fight is a wall; at level 15 it is a formality. The player does not choose their level directly: they fight what the map puts in front of them, and the XP curve turns those fights into levels. So the curve and the encounter XP are as much part of the boss design as its HP.

m05 derives the shape of XP curves and why most games use a power or exponential form. This lesson implements Shardbound's curve, and then uses it the way a designer does: to predict the level at the end of each area and to check enemies against it.`,
        },
        {
          kind: 'callout',
          tone: 'definition',
          title: 'XP curve and expected level',
          md: md`- **XP to next level**: $\text{xp}(L) = \operatorname{round}(a\,L^{k})$, the XP needed to go from level $L$ to $L + 1$. Shardbound uses $a = 25$, $k = 1.5$.
- **Total XP** to reach level $L$: $\sum_{l=1}^{L-1} \text{xp}(l)$.
- **Expected level** at a point in the game: the level reached with the XP from the fights a typical player has had by then, without grinding.`,
        },
        {
          kind: 'derive',
          title: 'fights per level, and why the curve self-corrects',
          goal: md`In an area where each fight gives $X$ XP, find how many fights a level takes, and what happens to a player who is ahead of or behind the expected level.`,
          steps: [
            { md: md`Fights per level at level $L$: $$f(L) = \frac{\text{xp}(L)}{X} = \frac{a L^k}{X}.$$ In the ruins ($X = 42$), level 6 takes $367/42 \approx 8.7$ fights and level 9 takes $675/42 \approx 16$.` },
            {
              md: md`Compare a player at level 6 with one at level 9, both fighting in the ruins.`,
              choose: {
                prompt: md`Which one levels up faster, in fights?`,
                options: [md`The level 6 player, by a factor $(9/6)^{1.5} \approx 1.84$`, md`Both the same, because $X$ is the same`, md`The level 9 player, because they kill faster`],
                answer: 0,
                explain: md`Fights per level grow as $L^k$, so the player who is behind needs fewer fights per level and catches up, while the one who is ahead slows down. This rubber band is why a power curve tolerates players who skip or repeat fights.`,
              },
            },
            { md: md`Each new area raises $X$ (stronger enemies give more XP), which resets the pace. Choosing $X$ per area and $a, k$ together is how a designer sets the expected levels.` },
          ],
          takeaway: md`A power curve with rising encounter XP keeps players near the expected level: those behind catch up quickly, those ahead slow down. Grinding still works, it just pays less and less.`,
        },
        { kind: 'code', file: 'scripts/rpg/progression.gd', code: PROGRESSION, note: md`\`pow\` takes and returns floats; \`roundi\` turns the result into an int. Keep the curve in one place: the menu's "XP to next level", the reward screen and the balance tools all call \`xp_to_next\`.` },
        {
          kind: 'numeric',
          q: md`With $a = 25$ and $k = 1.5$, how much total XP does a character need to reach level 5 from level 1?`,
          answer: { kind: 'number', value: 426 },
          hints: [md`Add $\text{xp}(1)$ to $\text{xp}(4)$; $2^{1.5} \approx 2.83$, $3^{1.5} \approx 5.20$.`],
          explain: md`$\text{xp}(1) = 25$, $\text{xp}(2) = \operatorname{round}(70.7) = 71$, $\text{xp}(3) = \operatorname{round}(129.9) = 130$, $\text{xp}(4) = 200$. Total $426$.`,
        },
        { kind: 'code', file: 'scripts/rpg/party_member.gd', code: PARTY_MEMBER_V3, note: md`The final version of \`PartyMember\` for this module. \`add_xp\` uses \`while\`, not \`if\`: one boss can pay for two levels. XP carries over, and setting \`level\` runs the setter, which rebuilds the stats with the new level's base values.` },
        {
          kind: 'callout',
          tone: 'design',
          title: 'What happens to HP on a level up?',
          md: md`Max HP rises with the level. Current HP can stay where it was (the gap grows), rise by the same amount (common in JRPGs), or refill (a reward that makes level ups exciting, and a balance risk mid-dungeon). Shardbound raises current HP by the max HP increase: level ups feel good without becoming free heals. Whatever you choose, \`HealthComponent\` needs one line in the handler of \`leveled_up\`, and the rule should be the same for every character.`,
        },
        { kind: 'code', file: 'scripts/rpg/battle_rewards.gd', code: BATTLE_REWARDS, note: md`\`GameState.gold\` is an \`int\` on the autoload; r03 adds a \`gold_changed\` signal for the HUD. Giving the full XP to all three members, including any not currently controlled, removes a reason to avoid switching characters (k05).` },
        {
          kind: 'viz',
          viz: { type: 'rpg.stats.progression' },
          task: md`With the defaults, read the expected level at the end of each area and compare it with the dashed targets (5, 8, 11). Raise the exponent to 2.0 and watch the dungeon fall short; then find a base that brings the boss back to about 11. Finally, switch the stat to **defence** and compare Bram's line with the golem's attack.`,
          caption: md`An area's fights each give the listed XP. The middle plot is the level after each fight, with area boundaries as vertical lines. The bottom plot shows a stat for each character at every level, so you can see what "level 11" means in numbers.`,
        },
        {
          kind: 'check',
          q: md`Holding $a = 25$, you raise $k$ from 1.5 to 2.0. Encounter XP stays the same. What happens?`,
          options: [
            md`Early levels barely change but late levels need far more XP, so expected levels drop most in later areas`,
            md`Every level needs about 30% more XP, so all areas drop by the same amount`,
            md`Nothing, because only the base sets the pace`,
            md`Early levels need far more XP but late levels barely change`,
          ],
          answer: 0,
          explain: md`$\text{xp}(L)$ scales by $L^{0.5}$: ×1 at level 1, ×2 at level 4, ×3.2 at level 10. The dungeon and boss suffer most, which is the usual way a curve change breaks a late fight while the early game still feels fine.`,
        },
        {
          kind: 'text',
          md: md`### Balancing enemies against the expected level

Once you know the expected level, you can check each enemy with simple counts at that level:

- **Hits to kill**: $\lceil \text{enemy HP} / \text{damage per strike} \rceil$ for Kai's basic attack. Shardbound targets 2 for field enemies, 4 to 5 in the ruins, and "needs a stagger" for the boss.
- **Hits to fall**: how many of the enemy's attacks Bram survives. A field slime should need more than 10; a skeleton 6 to 8; a golem slam should take a third of Bram's HP.

At level 8, Kai with the Iron Sword has attack 64. A skeleton (defence 20, 220 HP) takes $\operatorname{round}(64 \times 100/120) = 53$ per strike, so 5 strikes. That matches the target, so the skeleton's numbers are right for an area whose expected end level is 8, and the player who arrives at level 6 feels the difference (attack 56, 47 per strike, still 5 strikes but with less margin).`,
        },
        {
          kind: 'numeric',
          q: md`At level 11 Kai has attack 64 before his weapon, and the Rune Blade adds 8. How many basic strikes (power 1.0, no crit) does a skeleton with defence 20 and 220 HP take?`,
          answer: { kind: 'number', value: 4 },
          explain: md`Attack $64 + 8 = 72$. Per strike $72 \times 100/120 = 60$. $220/60 = 3.67$, so 4 strikes. (Kai's strength at level 11 is $\lfloor 12 + 2 \times 10 \rfloor = 32$, attack 64.)`,
        },
        {
          kind: 'steps',
          title: 'Level up from the keyboard',
          steps: [
            md`Create \`scripts/rpg/progression.gd\` and replace \`party_member.gd\` with the listing above.`,
            md`Create \`scripts/rpg/battle_rewards.gd\`. If your \`GameState\` has no \`gold\` yet, add \`var gold := 0\` to \`scripts/autoload/game_state.gd\`.`,
            md`Make a test scene with a \`Label\` root, attach the script below, and in the Inspector give it a new \`PartyMember\` with \`kai.tres\` as *Base*. Run with **F6**.`,
            md`Press **1** about 20 times and **2** a few times, watching the label and the Output.`,
          ],
          result: md`The label counts XP toward the next level; each level up prints \`reached level N\` followed by the stats that rose (for Kai at level 2: \`MAX_HP +10\`, \`MAX_MP +3\`, \`ATTACK +4\`, \`MAGIC +2\`, \`DEFENCE +1\`, \`MAGIC_DEFENCE +1\`, \`SPEED +1\`). Pressing 1 twenty times (440 XP) reaches level 5.`,
          troubleshoot: [
            { problem: md`Only one level up happens even when the XP covers two.`, fix: md`\`add_xp\` uses \`if\` instead of \`while\`. A single large reward must be able to pay for several levels.` },
            { problem: md`Stats print as unchanged after a level up.`, fix: md`The \`level\` setter must call \`rebuild()\`; check that the property is declared with \`set(value):\` and that \`setup()\` ran so \`base\` is set.` },
          ],
        },
        { kind: 'code', file: 'scripts/tests/progression_debug.gd', code: PROGRESSION_DEBUG },
        {
          kind: 'build',
          ch: {
            id: 'r02-3-build',
            title: 'Win a fight, get rewards',
            goal: md`Connect \`BattleRewards.grant\` to the end of a fight in your test arena: when the last enemy dies, the party gets XP, AP and gold, and a summary is printed.`,
            requirements: [
              md`When the last enemy's \`HealthComponent.died\` fires, \`grant\` is called once with every defeated enemy's \`EnemyData\`.`,
              md`All three party members receive the full XP; level ups print with the new level.`,
              md`Every socketed shard receives the AP (with growth multipliers) and level-ups appear through your notifier from lesson 2.`,
              md`Gold in \`GameState\` increases by the sum of the enemies' gold.`,
            ],
            hints: [
              md`Keep a counter of living enemies in the arena script; decrement it in a handler connected to each enemy's \`died\` signal and store its \`EnemyData\` in an array.`,
              md`\`died\` may fire during the physics step in the middle of a hit. Calling \`grant\` with \`call_deferred\` runs it after the frame's combat has settled.`,
            ],
            solution: [
              {
                file: 'scripts/tests/arena.gd',
                code: gd`
extends Node2D
## A test arena: enemies are children of $Enemies, each with a Combatant and HealthComponent.

var _alive := 0
var _defeated: Array[EnemyData] = []


func _ready() -> void:
    for enemy in $Enemies.get_children():
        var combatant: Combatant = enemy.get_node("Combatant")
        _alive += 1
        combatant.health.died.connect(_on_enemy_died.bind(combatant.enemy_data))


func _on_enemy_died(data: EnemyData) -> void:
    _defeated.append(data)
    _alive -= 1
    if _alive == 0:
        _finish.call_deferred()


func _finish() -> void:
    var party: Array[PartyMember] = GameState.party
    var totals := BattleRewards.grant(party, _defeated)
    print("Victory: %d XP, %d AP, %d gold" % [totals.xp, totals.ap, totals.gold])
`,
              },
            ],
            explain: md`The arena knows when a fight ends; \`BattleRewards\` knows what a fight is worth; \`PartyMember\` and \`Loadout\` know how to grow. Each part can be tested alone. This assumes \`GameState.party\` is an \`Array[PartyMember]\`; k04 replaces the arena with the real battle system's end-of-fight event.`,
          },
        },
        {
          kind: 'paper',
          problem: {
            id: 'r02-3-paper',
            title: 'How much grinding?',
            type: 'compute',
            difficulty: 2,
            minutes: 8,
            statement: md`A player enters the ruins at level 5 with 0 XP toward level 6. Ruins fights give 42 XP each. With $a = 25$, $k = 1.5$, how many fights does it take to reach level 8? (Total XP to reach level 5 is 426 and to reach level 8 is 1536.)`,
            solution: [
              md`XP needed from the start of level 5 to level 8: $1536 - 426 = 1110$.`,
              md`$1110 / 42 = 26.4$, so 27 fights.`,
              md`The ruins have about 30 fights, so a player who arrives at level 5 reaches the expected level 8 near the end without grinding.`,
            ],
            answer: { kind: 'number', value: 27 },
          },
        },
        {
          kind: 'recall',
          prompt: md`Write \`xp_to_next\` and the loop inside \`add_xp\`.`,
          answer: md`\`roundi(25.0 * pow(level, 1.5))\`. \`xp += amount\`, then \`while level < MAX_LEVEL and xp >= xp_to_next(level): xp -= xp_to_next(level); level += 1\`, emitting \`leveled_up\` each time.`,
        },
        {
          kind: 'explain',
          prompt: md`Why is the expected level per area a better design target than "the boss should have 2400 HP"?`,
          model: md`HP alone means nothing; it only matters against the party's damage, and the party's damage depends on level, gear and shards. The expected level ties those together: given the fights in each area and the curve, you know roughly what level the player has, and therefore their stats, and you can set enemy HP, defence and attack so hits-to-kill and hits-to-fall land where you want. When you change the curve or add fights, the expected levels move, and you can see which encounters need retuning instead of discovering it in playtests.`,
        },
      ],
      cards: [
        { id: 'r02-3-c1', kind: 'compute', front: md`$\text{xp}(L) = \operatorname{round}(25 L^{1.5})$. XP from level 9 to 10?`, answer: { kind: 'number', value: 675 }, back: md`$25 \times 27 = 675$.` },
        { id: 'r02-3-c2', kind: 'cloze', text: md`\`add_xp\` uses a {{}} loop so one reward can pay for several levels.`, answers: ['while'] },
        { id: 'r02-3-c3', kind: 'concept', front: md`Why does a power XP curve keep players near the expected level?`, back: md`Fights per level grow as $L^k$: a player behind needs fewer fights per level and catches up; a player ahead slows down.` },
        { id: 'r02-3-c4', kind: 'concept', front: md`Two checks of an enemy against the expected level?`, back: md`Hits to kill (Kai's strikes against its HP and defence) and hits to fall (how many of its attacks the party's tank survives).` },
        { id: 'r02-3-c5', kind: 'compute', front: md`Area fights give 70 XP; level 10 needs 791. Fights for that level?`, answer: { kind: 'number', value: 12 }, back: md`$791/70 = 11.3$, so 12 fights.` },
      ],
    },
  ],
  problems: [
    {
      id: 'r02-p1',
      title: 'XP to level 11',
      type: 'compute',
      difficulty: 1,
      minutes: 3,
      statement: md`With $\text{xp}(L) = \operatorname{round}(25 L^{1.5})$, how much XP takes a character from level 10 to 11?`,
      solution: [md`$10^{1.5} = 31.62$.`, md`$25 \times 31.62 = 790.6 \to 791$.`],
      answer: { kind: 'number', value: 791 },
      areas: ['math'],
    },
    {
      id: 'r02-p2',
      title: 'Choosing the exponent',
      type: 'derive',
      difficulty: 2,
      minutes: 6,
      statement: md`A designer wants doubling the level to triple the XP per level: $\text{xp}(2L) = 3\,\text{xp}(L)$. Find $k$ for $\text{xp}(L) = a L^k$ (ignore rounding).`,
      solution: [md`$a(2L)^k = 3aL^k \Rightarrow 2^k = 3$.`, md`$k = \log_2 3 \approx 1.585$.`],
      answer: { kind: 'number', value: Math.log2(3) },
      areas: ['math'],
    },
    {
      id: 'r02-p3',
      title: 'Fights per level',
      type: 'compute',
      difficulty: 1,
      minutes: 4,
      statement: md`Dungeon fights give 70 XP. With $a = 25$, $k = 1.5$, how many fights does level 11 → 12 take? ($11^{1.5} \approx 36.48$.)`,
      solution: [md`$\text{xp}(11) = \operatorname{round}(25 \times 36.48) = 912$.`, md`$912 / 70 = 13.03$, so 14 fights.`],
      answer: { kind: 'number', value: 14 },
      areas: ['math', 'systems'],
    },
    {
      id: 'r02-p4',
      title: 'The boss that gave one level',
      type: 'debug',
      difficulty: 2,
      minutes: 6,
      statement: md`After the golem (300 XP), a level 10 character with 700 XP toward level 11 ends at level 11 with 209 XP, but the menu says "XP 209 / 912" and playtesters expected level 12 later. Another tester at level 4 with 190 XP who beats a 300 XP boss ends at level 5 with 290 XP, above the 280 needed. Find the bug.

\`\`\`gdscript
func add_xp(amount: int) -> int:
	xp += amount
	if xp >= Progression.xp_to_next(level):
		xp -= Progression.xp_to_next(level)
		level += 1
		leveled_up.emit(level)
		return 1
	return 0
\`\`\``,
      solution: [
        md`\`if\` performs at most one level up per reward. The level 4 tester had $190 + 300 = 490$ XP, paid 200 for level 5, and kept 290, which already covers level 5's 280; they should be level 6 with 10 XP.`,
        md`Replace \`if\` with \`while\` (and count the levels gained). The first tester's case is correct; it only looked wrong.`,
      ],
      rubric: [md`Identifies the single \`if\``, md`Shows the level 4 case should give two levels`, md`Fixes with a loop and correct carry-over`],
      areas: ['godot', 'systems'],
    },
    {
      id: 'r02-p5',
      title: 'The poison that hit the wrong target',
      type: 'debug',
      difficulty: 3,
      minutes: 10,
      statement: md`A programmer adds a "chain" effect that poisons the last enemy the ability damaged. When Kai and an enemy skeleton both use Venom Fang in the same second, poison sometimes lands on Kai's target from the skeleton's attack. Explain.

\`\`\`gdscript
class_name ChainPoisonEffect
extends AbilityEffect

@export var status: StatusEffectData
var last_target: Combatant


func apply(_user: Combatant, target: Combatant) -> void:
	if last_target != null:
		last_target.status.apply(status)
	last_target = target
\`\`\``,
      solution: [
        md`\`last_target\` is state stored in a Resource. The effect lives in \`venom_fang.tres\`, which both Kai and the skeleton reference, so there is one \`last_target\` shared by every user of the ability, and it persists between casts and battles.`,
        md`Per-cast state must live with the cast: pass what the effect needs as arguments (the list of targets, or the previous target from the \`AbilityCaster\`), or have the caster create a context object per cast. The effect itself stays stateless.`,
      ],
      rubric: [md`Identifies shared state in a shared Resource`, md`Explains why two users interfere`, md`Moves the state to the cast or arguments`],
      areas: ['godot', 'systems'],
    },
    {
      id: 'r02-p6',
      title: 'Cone check on paper',
      type: 'compute',
      difficulty: 2,
      minutes: 6,
      statement: md`A cone ability has half-angle 30° and length 64 px. The caster is at the origin aiming along $(1, 0)$. A bat is at $(40, 20)$. Compute $\hat{\mathbf{v}} \cdot \hat{\mathbf{d}}$ and decide whether it is hit ($\cos 30° \approx 0.866$).`,
      solution: [
        md`$|\mathbf{v}| = \sqrt{1600 + 400} \approx 44.72 \le 64$.`,
        md`$\hat{\mathbf{v}} \cdot \hat{\mathbf{d}} = 40 / 44.72 \approx 0.894 \ge 0.866$: inside, so it is hit (the angle is about 26.6°).`,
      ],
      answer: { kind: 'number', value: 40 / Math.hypot(40, 20) },
      areas: ['math'],
    },
    {
      id: 'r02-p7',
      title: 'Proficiency belongs to the character',
      type: 'concept',
      difficulty: 1,
      minutes: 5,
      statement: md`Explain why proficiency points are stored in the character's \`AbilityBook\` keyed by ability id, and not in the weapon.`,
      solution: [
        md`The weapon's \`.tres\` is shared by every copy (shop, chests, other saves), so it cannot hold one character's progress (r01's rule about shared definitions).`,
        md`Learning is something the character does: the reward is that the ability stays after the weapon is gone. Keying by ability id also makes the save file robust: it stores names, not references to particular items.`,
      ],
      rubric: [md`Uses the shared-definition argument`, md`Connects storage to the design (ability kept after unequipping)`],
      areas: ['systems'],
    },
    {
      id: 'r02-p8',
      title: 'Write the circle and cone tests',
      type: 'code-on-paper',
      difficulty: 2,
      minutes: 8,
      statement: md`Write \`area_contains(origin, aim, point) -> bool\` for \`Area.CIRCLE\` (radius \`area_size\` around \`aim\`) and \`Area.CONE\` (length \`area_size\`, half-angle \`cone_degrees\`, from \`origin\` towards \`aim\`), using only \`distance_to\`, \`direction_to\`, \`normalized\`, \`dot\` and \`cos\`.`,
      solution: [
        md`\`\`\`gdscript
match area:
	Area.CIRCLE:
		return point.distance_to(aim) <= area_size
	Area.CONE:
		var offset := point - origin
		if offset.length() > area_size:
			return false
		var dir := origin.direction_to(aim)
		return offset.normalized().dot(dir) >= cos(deg_to_rad(cone_degrees))
\`\`\``,
        md`The circle is centred on the target, the cone on the caster. The cone compares cosines so no \`acos\` is needed.`,
      ],
      rubric: [md`Circle centred on the aim point`, md`Cone checks length and cosine`, md`Converts degrees to radians`],
      areas: ['math', 'godot'],
    },
  ],
};
