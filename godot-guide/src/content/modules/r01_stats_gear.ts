import { md, gd, type Module } from '../types';

// ------------------------------------------------------------------------------------ listings
const RPG_ENUMS = gd`
class_name Rpg
extends RefCounted
## The stats every combatant has. Never instanced: write Rpg.Stat.ATTACK.
## Elements are g04's Element.Type; equipment slots are EquipmentData.Slot.

enum Stat { MAX_HP, MAX_MP, ATTACK, MAGIC, DEFENCE, MAGIC_DEFENCE, SPEED, CRIT, DAMAGE_TAKEN }
`;

const CHARACTER_STATS = gd`
class_name CharacterStats
extends Resource
## Who a party member is, as numbers: four primary stats at level 1 and how much each grows
## per level. Everything else (max HP, attack, ...) is derived from these four.

@export var display_name := ""
@export var portrait: Texture2D

@export_group("Level 1")
@export var strength := 10
@export var vitality := 10
@export var spirit := 10
@export var agility := 10

@export_group("Growth per level")
@export var strength_growth := 1.0
@export var vitality_growth := 1.0
@export var spirit_growth := 1.0
@export var agility_growth := 1.0


## A primary stat at a level: base + growth * (level - 1), rounded down.
func primary_at(base_value: int, growth: float, level: int) -> int:
    return floori(base_value + growth * (level - 1))


## Writes the derived stats at a level into the StatBlock's base values.
func apply_to(block: StatBlock, level: int) -> void:
    var strength_now := primary_at(strength, strength_growth, level)
    var vitality_now := primary_at(vitality, vitality_growth, level)
    var spirit_now := primary_at(spirit, spirit_growth, level)
    var agility_now := primary_at(agility, agility_growth, level)
    block.set_base(Rpg.Stat.MAX_HP, 40 + vitality_now * 10)
    block.set_base(Rpg.Stat.MAX_MP, 10 + spirit_now * 3)
    block.set_base(Rpg.Stat.ATTACK, strength_now * 2)
    block.set_base(Rpg.Stat.MAGIC, spirit_now * 2)
    block.set_base(Rpg.Stat.DEFENCE, vitality_now)
    block.set_base(Rpg.Stat.MAGIC_DEFENCE, spirit_now)
    block.set_base(Rpg.Stat.SPEED, agility_now)
    block.set_base(Rpg.Stat.CRIT, 5)
    block.set_base(Rpg.Stat.DAMAGE_TAKEN, 100)
`;

const STAT_MODIFIER = gd`
class_name StatModifier
extends Resource
## One change to one stat: "+12 attack" (flat) or "+10% max HP" (percent).

enum Kind { FLAT, PERCENT }

@export var stat: Rpg.Stat = Rpg.Stat.ATTACK
@export var kind: Kind = Kind.FLAT
## Flat: added to the stat. Percent: 10 means +10%.
@export var value := 0.0


static func make(p_stat: Rpg.Stat, p_kind: Kind, p_value: float) -> StatModifier:
    var mod := StatModifier.new()
    mod.stat = p_stat
    mod.kind = p_kind
    mod.value = p_value
    return mod
`;

const STAT_BLOCK = gd`
class_name StatBlock
extends RefCounted
## The live numbers of one combatant.
## Base values come from CharacterStats or EnemyData. Modifiers come from sources (a Loadout,
## a status effect); each source owns one list, which is replaced or removed as a whole.
## final = (base + sum of flat) * (1 + sum of percent / 100), rounded once at the end.

## Emitted at most once per frame, after any change that may move a final value.
signal changed

var _base := PackedFloat64Array()
var _final := PackedInt32Array()
var _base_element := PackedFloat64Array()
var _mods := {}       # source (Object) -> Array[StatModifier]
var _overrides := {}  # source (Object) -> { Element.Type: multiplier }
var _dirty := true
var _signal_queued := false


func _init() -> void:
    _base.resize(Rpg.Stat.size())
    _final.resize(Rpg.Stat.size())
    _base_element.resize(Element.Type.size())
    _base_element.fill(1.0)


func set_base(stat: Rpg.Stat, value: float) -> void:
    _base[stat] = value
    _mark_dirty()


func set_base_element(element: Element.Type, multiplier: float) -> void:
    _base_element[element] = multiplier
    _mark_dirty()


## Adds, or replaces, everything one source contributes.
func set_source(source: Object, mods: Array[StatModifier], overrides: Dictionary = {}) -> void:
    _mods[source] = mods
    _overrides[source] = overrides
    _mark_dirty()


func remove_source(source: Object) -> void:
    if _mods.erase(source):
        _overrides.erase(source)
        _mark_dirty()


func get_stat(stat: Rpg.Stat) -> int:
    if _dirty:
        _recalculate()
    return _final[stat]


## 2 weak, 1 neutral, 0.5 resist, 0 immune, -1 absorb. An override from gear replaces the
## base value; if several sources override one element, the most protective (lowest) wins.
func element_multiplier(element: Element.Type) -> float:
    var result := _base_element[element]
    var overridden := false
    for overrides: Dictionary in _overrides.values():
        if overrides.has(element):
            var value: float = overrides[element]
            result = minf(result, value) if overridden else value
            overridden = true
    return result


func _mark_dirty() -> void:
    _dirty = true
    # Equipping one item changes many values; tell listeners once, at the end of the frame.
    if not _signal_queued:
        _signal_queued = true
        _emit_changed.call_deferred()


func _emit_changed() -> void:
    _signal_queued = false
    changed.emit()


func _recalculate() -> void:
    var flat := PackedFloat64Array()
    var percent := PackedFloat64Array()
    flat.resize(Rpg.Stat.size())
    percent.resize(Rpg.Stat.size())
    for mods: Array in _mods.values():
        for mod: StatModifier in mods:
            if mod.kind == StatModifier.Kind.FLAT:
                flat[mod.stat] += mod.value
            else:
                percent[mod.stat] += mod.value
    for stat in Rpg.Stat.size():
        var value := (_base[stat] + flat[stat]) * (1.0 + percent[stat] / 100.0)
        _final[stat] = maxi(0, roundi(value))
    _dirty = false
`;

const STATS_TEST = gd`
extends Node
## Run this scene with F6 and read the Output panel.

const KAI := preload("res://resources/characters/kai_stats.tres")


func _ready() -> void:
    var stats := StatBlock.new()
    KAI.apply_to(stats, 5)
    print("level 5 attack: ", stats.get_stat(Rpg.Stat.ATTACK))  # 40

    var sword := StatModifier.make(Rpg.Stat.ATTACK, StatModifier.Kind.FLAT, 12.0)
    var ring := StatModifier.make(Rpg.Stat.ATTACK, StatModifier.Kind.PERCENT, 10.0)
    var gear: Array[StatModifier] = [sword, ring]
    stats.set_source(self, gear)
    print("with sword and ring: ", stats.get_stat(Rpg.Stat.ATTACK))  # (40 + 12) * 1.1 = 57.2 -> 57

    stats.remove_source(self)
    print("gear removed: ", stats.get_stat(Rpg.Stat.ATTACK))  # 40
`;

const PARTY_MEMBER_V1 = gd`
class_name PartyMember
extends Resource
## One member of the party: who they are, how far they have grown, and their live stats.

@export var base: CharacterStats
@export var level := 1:
    set(value):
        level = value
        rebuild()

## Rebuilt from base and level, never saved, so it cannot go stale in a save file.
var stats := StatBlock.new()


func rebuild() -> void:
    if base != null:
        base.apply_to(stats, level)
`;

const STATS_LABEL = gd`
extends Label
## Shows a party member's stats and redraws only when they change.

@export var member: PartyMember

var _ring := StatModifier.make(Rpg.Stat.ATTACK, StatModifier.Kind.PERCENT, 10.0)


func _ready() -> void:
    member.rebuild()
    member.stats.changed.connect(_redraw)
    _redraw()


func _unhandled_input(event: InputEvent) -> void:
    if event.is_action_pressed("ui_accept"):
        var mods: Array[StatModifier] = [_ring]
        member.stats.set_source(self, mods)
    elif event.is_action_pressed("ui_cancel"):
        member.stats.remove_source(self)
    elif event.is_action_pressed("ui_up"):
        member.level += 1


func _redraw() -> void:
    var lines := PackedStringArray()
    lines.append("Level %d" % member.level)
    for stat: Rpg.Stat in Rpg.Stat.values():
        lines.append("%s: %d" % [Rpg.Stat.find_key(stat), member.stats.get_stat(stat)])
    text = "\n".join(lines)
`;

const EQUIPMENT_DATA = gd`
class_name EquipmentData
extends ItemData
## A weapon, armour or accessory (g04): an item, so bags and shops hold it, plus what it does
## when worn. r01 replaces g04's fixed bonus fields with a list of modifiers and adds links.
## A shared definition: never store which shards sit in it here, because every character
## using this .tres would see the same shards. Loadout does that.

enum Slot { WEAPON, ARMOR, ACCESSORY }

@export var slot: Slot = Slot.WEAPON
## Empty means anyone can equip it. Weapons name their owner: &"kai", &"lyra" or &"bram".
@export var owner_id: StringName = &""
@export var modifiers: Array[StatModifier] = []
@export_group("Shards")
@export_range(0, 4) var shard_sockets := 1
## Sockets 0+1, 2+3, ... are linked, for this many pairs.
@export_range(0, 2) var linked_pairs := 0
## Abilities this weapon teaches through use (r02).
@export var teaches: Array[AbilityData] = []


## The socket linked to this one, or -1.
func linked_partner(socket: int) -> int:
    if socket >= linked_pairs * 2:
        return -1
    return socket + 1 if socket % 2 == 0 else socket - 1
`;

const SHARD_DATA = gd`
class_name ShardData
extends Resource
## A socketable gem (g04). Shared definition; the AP a particular shard has earned is in
## ShardInstance. r01 replaces g04's single granted_ability and passive_stat with one ability
## per level and a list of modifiers.

enum Kind { ABILITY, SPELL, PASSIVE, SUPPORT }

@export var display_name := ""
@export_multiline var description := ""
@export var kind: Kind = Kind.SPELL
@export var color := Color(0.9, 0.3, 0.3)
## Spell shards: their element. A linked Elemental shard copies it.
@export var element: Element.Type = Element.Type.NONE
## SPELL and ABILITY: what the shard grants at level 1, 2, 3 (index 0 is level 1).
@export var abilities: Array[AbilityData] = []
## PASSIVE: applied once per shard level, so level 3 applies them three times.
@export var modifiers: Array[StatModifier] = []
## Total AP to reach level 2, level 3, ... The maximum level is ap_to_level.size() + 1.
@export var ap_to_level: Array[int] = [200, 600]


func level_for_ap(ap: int) -> int:
    var level := 1
    for threshold in ap_to_level:
        if ap >= threshold:
            level += 1
    return level


func max_level() -> int:
    return ap_to_level.size() + 1
`;

const SHARD_INSTANCE = gd`
class_name ShardInstance
extends Resource
## One shard the party owns: which kind it is and how much AP it has earned.

signal leveled_up(new_level: int)

@export var data: ShardData
@export var ap := 0


func level() -> int:
    return data.level_for_ap(ap)


func add_ap(amount: int) -> void:
    var before := level()
    ap += amount
    if level() > before:
        leveled_up.emit(level())
`;

const LOADOUT = gd`
class_name Loadout
extends Resource
## What one party member wears and which shard sits in which socket. EquipmentData and ShardData
## are shared definitions; this is per-character state, and a Resource so r06 can save it.
## Every change calls emit_changed(), which fires Resource's built-in changed signal.

## Elemental in armour, by Elemental's level: halve, nullify, absorb.
const ELEMENTAL_ARMOUR: Array[float] = [0.5, 0.0, -1.0]

@export var weapon: EquipmentData
@export var armour: EquipmentData
@export var accessory: EquipmentData
## One entry per socket of the weapon and the armour; null is an empty socket.
@export var weapon_shards: Array[ShardInstance] = []
@export var armour_shards: Array[ShardInstance] = []


## Puts an item in its slot. Shards move across socket by socket; the ones that no longer
## fit are returned so the caller can put them back in the party's shard bag.
func equip(item: EquipmentData) -> Array[ShardInstance]:
    var spare: Array[ShardInstance] = []
    match item.slot:
        EquipmentData.Slot.WEAPON:
            weapon = item
            spare = _fit(weapon_shards, item.shard_sockets)
        EquipmentData.Slot.ARMOR:
            armour = item
            spare = _fit(armour_shards, item.shard_sockets)
        EquipmentData.Slot.ACCESSORY:
            accessory = item
    emit_changed()
    return spare


## Places a shard in a socket (null empties it) and returns what was there before.
func socket(slot: EquipmentData.Slot, index: int, shard: ShardInstance) -> ShardInstance:
    var shards := weapon_shards if slot == EquipmentData.Slot.WEAPON else armour_shards
    var previous := shards[index]
    shards[index] = shard
    emit_changed()
    return previous


## Everything gear and shards add, given to the StatBlock as ONE source, so each change
## replaces the old contribution completely and nothing is left behind.
func apply_to(block: StatBlock) -> void:
    var mods: Array[StatModifier] = []
    for item: EquipmentData in [weapon, armour, accessory]:
        if item != null:
            mods.append_array(item.modifiers)
    for shard: ShardInstance in weapon_shards + armour_shards:
        if shard != null and shard.data.kind == ShardData.Kind.PASSIVE:
            for mod in shard.data.modifiers:
                mods.append(StatModifier.make(mod.stat, mod.kind, mod.value * shard.level()))
    var overrides := {}
    for i in armour_shards.size():
        var element := _linked_element(armour, armour_shards, i)
        if element != Element.Type.NONE:
            overrides[element] = ELEMENTAL_ARMOUR[armour_shards[i].level() - 1]
    block.set_source(self, mods, overrides)


## The element basic attacks take on: Elemental linked with an element shard in the weapon.
func weapon_element() -> Element.Type:
    for i in weapon_shards.size():
        var element := _linked_element(weapon, weapon_shards, i)
        if element != Element.Type.NONE:
            return element
    return Element.Type.NONE


## Spells and abilities from socketed shards, lower levels included.
func granted_abilities() -> Array[AbilityData]:
    var out: Array[AbilityData] = []
    for shard: ShardInstance in weapon_shards + armour_shards:
        if shard != null:
            for i in mini(shard.level(), shard.data.abilities.size()):
                out.append(shard.data.abilities[i])
    return out


## If socket i holds a support shard, the element of the shard linked to it.
func _linked_element(item: EquipmentData, shards: Array[ShardInstance], i: int) -> Element.Type:
    if item == null or shards[i] == null or shards[i].data.kind != ShardData.Kind.SUPPORT:
        return Element.Type.NONE
    var partner := item.linked_partner(i)
    if partner < 0 or partner >= shards.size() or shards[partner] == null:
        return Element.Type.NONE
    return shards[partner].data.element


func _fit(shards: Array[ShardInstance], count: int) -> Array[ShardInstance]:
    var spare: Array[ShardInstance] = []
    for i in range(count, shards.size()):
        if shards[i] != null:
            spare.append(shards[i])
    shards.resize(count)
    return spare
`;

const PARTY_MEMBER_V2 = gd`
class_name PartyMember
extends Resource
## One member of the party: who they are, how far they have grown, what they wear.
## GameState keeps three of these. The StatBlock is rebuilt from them and never saved.

@export var base: CharacterStats
@export var level := 1:
    set(value):
        level = value
        rebuild()
@export var loadout: Loadout

var stats := StatBlock.new()


## Call once after creating or loading the member.
func setup() -> void:
    if loadout == null:
        loadout = Loadout.new()
    if not loadout.changed.is_connected(rebuild):
        loadout.changed.connect(rebuild)
    rebuild()


func rebuild() -> void:
    if base == null:
        return
    base.apply_to(stats, level)
    if loadout != null:
        loadout.apply_to(stats)
`;

const LOADOUT_TEST = gd`
extends Node
## Equip and socket from code. Run with F6; Enter swaps Kai's weapon, Escape toggles Elemental.

const KAI := preload("res://resources/characters/kai_stats.tres")
const IRON_SWORD := preload("res://resources/equipment/iron_sword.tres")
const RUNE_BLADE := preload("res://resources/equipment/rune_blade.tres")
const CHAIN_MAIL := preload("res://resources/equipment/chain_mail.tres")
const FIRE := preload("res://resources/shards/fire.tres")
const ELEMENTAL := preload("res://resources/shards/elemental.tres")

var kai := PartyMember.new()
var spare_shards: Array[ShardInstance] = []
var elemental := ShardInstance.new()


func _ready() -> void:
    kai.base = KAI
    kai.level = 5
    kai.setup()
    kai.loadout.equip(IRON_SWORD)
    kai.loadout.equip(CHAIN_MAIL)
    var fire := ShardInstance.new()
    fire.data = FIRE
    elemental.data = ELEMENTAL
    kai.loadout.socket(EquipmentData.Slot.ARMOR, 0, fire)
    kai.stats.changed.connect(_print_stats)


func _unhandled_input(event: InputEvent) -> void:
    if event.is_action_pressed("ui_accept"):
        var next := RUNE_BLADE if kai.loadout.weapon == IRON_SWORD else IRON_SWORD
        spare_shards.append_array(kai.loadout.equip(next))
    elif event.is_action_pressed("ui_cancel"):
        var has_it := kai.loadout.armour_shards[1] != null
        kai.loadout.socket(EquipmentData.Slot.ARMOR, 1, null if has_it else elemental)


func _print_stats() -> void:
    print("%s  attack %d  magic %d  defence %d  speed %d  fire x%.1f  spare %d" % [
        kai.loadout.weapon.display_name,
        kai.stats.get_stat(Rpg.Stat.ATTACK),
        kai.stats.get_stat(Rpg.Stat.MAGIC),
        kai.stats.get_stat(Rpg.Stat.DEFENCE),
        kai.stats.get_stat(Rpg.Stat.SPEED),
        kai.stats.element_multiplier(Element.Type.FIRE),
        spare_shards.size(),
    ])
`;

const DAMAGE_CALC = gd`
class_name DamageCalc
extends RefCounted
## The damage pipeline. A pure function: the same inputs always give the same output and no
## scene is needed, so it can be tested on its own and reused by hitboxes, spells and the log.

## Defence equal to this halves damage.
const DEFENCE_SCALE := 100.0
const CRIT_MULTIPLIER := 1.5


class Result:
    ## Final integer. Negative means the target absorbed the element and heals.
    var amount := 0
    var crit := false
    var element_multiplier := 1.0
    ## The value after each stage, for the battle log and for tests.
    var steps := PackedFloat64Array()


static func calculate(attacker: StatBlock, target: StatBlock, power: float, element: Element.Type,
        is_magic: bool, stagger_multiplier := 1.0, crit_roll := 1.0) -> Result:
    var r := Result.new()

    # 1. Offence: the attacker's scaling stat times the ability's power.
    var offence := attacker.get_stat(Rpg.Stat.MAGIC if is_magic else Rpg.Stat.ATTACK)
    var x := power * offence
    r.steps.append(x)

    # 2. Defence, ratio form: 100 defence halves the damage and no defence reaches zero.
    #    DAMAGE_TAKEN is 100 normally and 50 under Barrier. Note 100.0: int / int truncates.
    var defence := target.get_stat(Rpg.Stat.MAGIC_DEFENCE if is_magic else Rpg.Stat.DEFENCE)
    x *= DEFENCE_SCALE / (DEFENCE_SCALE + defence)
    x *= target.get_stat(Rpg.Stat.DAMAGE_TAKEN) / 100.0
    r.steps.append(x)

    # 3. Element: 2 weak, 1 neutral, 0.5 resist, 0 immune, -1 absorb.
    r.element_multiplier = target.element_multiplier(element)
    x *= r.element_multiplier
    r.steps.append(x)

    # 4. Stagger: 1.0 normally, larger while the target is staggered.
    x *= stagger_multiplier
    r.steps.append(x)

    # 5. Critical hit. crit_roll is randf() in the game and a fixed number in tests.
    r.crit = crit_roll < attacker.get_stat(Rpg.Stat.CRIT) / 100.0
    if r.crit:
        x *= CRIT_MULTIPLIER
    r.steps.append(x)

    # 6. Round once, at the very end. A hit that lands does at least 1 unless the target is immune.
    if r.element_multiplier == 0.0:
        r.amount = 0
    elif x < 0.0:
        r.amount = mini(-1, roundi(x))
    else:
        r.amount = maxi(1, roundi(x))
    r.steps.append(r.amount)
    return r
`;

const ENEMY_DATA = gd`
class_name EnemyData
extends Resource
## One kind of enemy (g04): everything that is the same for every slime or every golem.
## r01 adds magic stats, a full element table and AP; k02 adds the AI fields; r03 replaces
## drop_item with a loot table. Enemies do not level up or wear gear.

@export var display_name := ""

@export_group("Stats")
@export_range(1, 9999) var max_hp := 10
@export_range(0, 999) var attack := 5
@export_range(0, 999) var magic := 0
@export_range(0, 999) var defense := 0
@export_range(0, 999) var magic_defense := 0
## Walking speed in pixels per second (movement, g04). Battle speed for ATB is separate.
@export_range(0.0, 300.0, 5.0) var speed := 40.0
@export_range(0, 99) var battle_speed := 10
## Stagger gauge size; k04 fills it.
@export var stagger_max := 100

@export_group("Elements")
## Takes double damage from this element (g04's field).
@export var weakness: Element.Type = Element.Type.NONE
@export var resists: Array[Element.Type] = []
@export var immune_to: Array[Element.Type] = []
@export var absorbs: Array[Element.Type] = []

@export_group("Rewards")
@export var xp_reward := 0
@export var gold_reward := 0
@export var ap_reward := 0


func apply_to(block: StatBlock) -> void:
    block.set_base(Rpg.Stat.MAX_HP, max_hp)
    block.set_base(Rpg.Stat.MAX_MP, 0)
    block.set_base(Rpg.Stat.ATTACK, attack)
    block.set_base(Rpg.Stat.MAGIC, magic)
    block.set_base(Rpg.Stat.DEFENCE, defense)
    block.set_base(Rpg.Stat.MAGIC_DEFENCE, magic_defense)
    block.set_base(Rpg.Stat.SPEED, battle_speed)
    block.set_base(Rpg.Stat.CRIT, 5)
    block.set_base(Rpg.Stat.DAMAGE_TAKEN, 100)
    for element: Element.Type in Element.Type.values():
        block.set_base_element(element, element_multiplier(element))


func element_multiplier(element: Element.Type) -> float:
    if element == Element.Type.NONE:
        return 1.0
    if element in absorbs:
        return -1.0
    if element in immune_to:
        return 0.0
    if element == weakness:
        return 2.0
    if element in resists:
        return 0.5
    return 1.0
`;

const HIT_DATA_ADD = gd`
# scripts/resources/hit_data.gd: extending the HitData from g04 with two fields.
# The _init(amount, element, source) signature stays as it is.
## How strong the attack is, as a multiple of the attacker's attack or magic.
var power := 1.0
## Magic hits use magic and magic defence instead of attack and defence.
var is_magic := false
`;

const COMBATANT = gd`
class_name Combatant
extends Node
## Gives a Character or an enemy a StatBlock and turns hits into HP changes.
## In the Inspector, point the exports at the sibling HealthComponent and Hurtbox (c05) and
## StatusComponent (this lesson). Name this node "Combatant" so attackers can find it.

signal damaged(result: DamageCalc.Result)
signal pressure_added(amount: float)

@export var health: HealthComponent
@export var hurtbox: Hurtbox
@export var status: StatusComponent
## Enemies set this. Party members get their StatBlock from GameState through use_stats().
@export var enemy_data: EnemyData

var stats := StatBlock.new()
## Written by the stagger gauge (k04): 1.0 normally, 1.6 or more while staggered.
var stagger_multiplier := 1.0


func _ready() -> void:
    if enemy_data != null:
        enemy_data.apply_to(stats)
    stats.changed.connect(_sync_max_hp)
    _sync_max_hp()
    hurtbox.hurt.connect(_on_hurt)


## Party members share the StatBlock their PartyMember rebuilds when gear changes.
func use_stats(block: StatBlock) -> void:
    stats.changed.disconnect(_sync_max_hp)
    stats = block
    stats.changed.connect(_sync_max_hp)
    _sync_max_hp()


## The one entry point for damage from attacks, spells and abilities.
func receive_attack(attacker: Combatant, power: float, element: Element.Type, is_magic: bool) -> DamageCalc.Result:
    var result := DamageCalc.calculate(attacker.stats, stats, power, element, is_magic, stagger_multiplier, randf())
    if result.amount >= 0:
        health.damage(result.amount)
    else:
        health.heal(-result.amount)
    damaged.emit(result)
    return result


func add_pressure(amount: float) -> void:
    pressure_added.emit(amount)


func _on_hurt(hit: HitData) -> void:
    var attacker := hit.source.get_node_or_null("Combatant") as Combatant
    if attacker == null:
        # Spikes and other hazards have no stats: keep c05's fixed amount.
        health.damage(hit.amount)
        return
    receive_attack(attacker, hit.power, hit.element, hit.is_magic)
    add_pressure(hit.stagger)


func _sync_max_hp() -> void:
    health.max_health = stats.get_stat(Rpg.Stat.MAX_HP)
`;

const STATUS_DATA = gd`
class_name StatusEffectData
extends Resource
## A timed effect: poison, slow, haste, barrier. Shared definition; the time left on a
## particular target lives in that target's StatusComponent.

@export var id: StringName = &""
@export var display_name := ""
@export var duration := 10.0
## Seconds between ticks. 0 means it never ticks.
@export var tick_interval := 0.0
## Damage per tick as a fraction of max HP (poison: 0.05).
@export_range(0.0, 1.0, 0.01) var tick_fraction := 0.0
## Stat changes while active (haste: SPEED +50 percent).
@export var modifiers: Array[StatModifier] = []
## Applying this removes these first (haste removes slow, slow removes haste).
@export var removes: Array[StringName] = []
`;

const STATUS_COMPONENT = gd`
class_name StatusComponent
extends Node
## The timed effects on one combatant: applies them, ticks them, removes them when they run out.

signal added(effect: StatusEffectData)
signal removed(effect: StatusEffectData)
signal ticked(effect: StatusEffectData, amount: int)

@export var combatant: Combatant
## Effects this combatant ignores, by id (skeletons: &"poison").
@export var immune: Array[StringName] = []

var _active := {}  # StringName -> Active


## The state of one effect on this combatant.
class Active:
    var data: StatusEffectData
    var time_left := 0.0
    var until_tick := 0.0


func apply(effect: StatusEffectData) -> bool:
    if effect.id in immune:
        return false
    for id in effect.removes:
        remove(id)
    if _active.has(effect.id):
        # Re-applying refreshes the timer. It never stacks.
        var current: Active = _active[effect.id]
        current.time_left = effect.duration
        return true
    var active := Active.new()
    active.data = effect
    active.time_left = effect.duration
    active.until_tick = effect.tick_interval
    _active[effect.id] = active
    # The Active object is the source, so removing it removes exactly its modifiers.
    combatant.stats.set_source(active, effect.modifiers)
    added.emit(effect)
    return true


func remove(id: StringName) -> void:
    if not _active.has(id):
        return
    var active: Active = _active[id]
    _active.erase(id)
    combatant.stats.remove_source(active)
    removed.emit(active.data)


func has_status(id: StringName) -> bool:
    return _active.has(id)


func _physics_process(delta: float) -> void:
    # Subtracting 1/60 a hundred and twenty times leaves about 1e-15, not 0, so "<= 0.0"
    # would fire a frame late and a 12 s poison would lose its last tick. Anything within
    # half a frame counts as due.
    var due := delta * 0.5
    # keys() is a copy, so removing entries inside the loop is safe.
    for id: StringName in _active.keys():
        var active: Active = _active[id]
        if active.data.tick_interval > 0.0:
            active.until_tick -= delta
            if active.until_tick <= due:
                active.until_tick += active.data.tick_interval
                _tick(active)
        active.time_left -= delta
        if active.time_left <= due:
            remove(id)


func _tick(active: Active) -> void:
    var max_hp := combatant.stats.get_stat(Rpg.Stat.MAX_HP)
    var amount := maxi(1, roundi(max_hp * active.data.tick_fraction))
    combatant.health.damage(amount)
    ticked.emit(active.data, amount)
`;

const DAMAGE_TEST = gd`
extends Node
## Run with F6. Every line prints PASS or FAIL. Fix every FAIL before tuning any number.

var _failures := 0


func _ready() -> void:
    var kai := _block(52, 20, 16, 10)          # Kai, level 5, Iron Sword
    var skeleton := _block(28, 0, 20, 6)
    skeleton.set_base_element(Element.Type.FIRE, 2.0)
    skeleton.set_base_element(Element.Type.LIGHTNING, -1.0)
    skeleton.set_base_element(Element.Type.ICE, 0.0)
    var none := Element.Type.NONE

    _check("plain hit", DamageCalc.calculate(kai, skeleton, 2.0, none, false).amount, 87)
    _check("weakness", DamageCalc.calculate(kai, skeleton, 2.0, Element.Type.FIRE, false).amount, 173)
    _check("staggered", DamageCalc.calculate(kai, skeleton, 2.0, none, false, 1.6).amount, 139)
    _check("crit", DamageCalc.calculate(kai, skeleton, 2.0, none, false, 1.0, 0.0).amount, 130)
    _check("absorb", DamageCalc.calculate(kai, skeleton, 2.0, Element.Type.LIGHTNING, false).amount, -87)
    _check("immune", DamageCalc.calculate(kai, skeleton, 2.0, Element.Type.ICE, false).amount, 0)
    _check("at least 1", DamageCalc.calculate(kai, skeleton, 0.01, none, false).amount, 1)
    skeleton.set_base(Rpg.Stat.DAMAGE_TAKEN, 50)  # Barrier
    _check("barrier", DamageCalc.calculate(kai, skeleton, 2.0, none, false).amount, 43)
    print("done: %d failures" % _failures)


func _block(attack: int, magic: int, defence: int, magic_defence: int) -> StatBlock:
    var block := StatBlock.new()
    block.set_base(Rpg.Stat.ATTACK, attack)
    block.set_base(Rpg.Stat.MAGIC, magic)
    block.set_base(Rpg.Stat.DEFENCE, defence)
    block.set_base(Rpg.Stat.MAGIC_DEFENCE, magic_defence)
    block.set_base(Rpg.Stat.CRIT, 5)
    block.set_base(Rpg.Stat.DAMAGE_TAKEN, 100)
    return block


func _check(label: String, got: int, want: int) -> void:
    if got == want:
        print("PASS ", label)
    else:
        _failures += 1
        printerr("FAIL %s: got %d, want %d" % [label, got, want])
`;

const DAMAGE_NUMBERS = gd`
class_name DamageNumbers
extends Node2D
## Floating numbers above a combatant. Listens to its signals; knows nothing about the pipeline.

@export var combatant: Combatant


func _ready() -> void:
    combatant.damaged.connect(_on_damaged)
    combatant.status.ticked.connect(_on_ticked)


func _on_damaged(result: DamageCalc.Result) -> void:
    if result.element_multiplier == 0.0:
        _spawn("Immune", Color.GRAY, 1.0)
    elif result.amount < 0:
        _spawn("+%d" % -result.amount, Color.LIME_GREEN, 1.0)
    elif result.crit:
        _spawn("%d!" % result.amount, Color.GOLD, 1.5)
    else:
        _spawn(str(result.amount), Color.WHITE, 1.0)


func _on_ticked(_effect: StatusEffectData, amount: int) -> void:
    _spawn(str(amount), Color.MEDIUM_PURPLE, 0.75)


func _spawn(value: String, color: Color, size: float) -> void:
    var label := Label.new()
    label.text = value
    label.modulate = color
    label.scale = Vector2(size, size)
    label.position = Vector2(randf_range(-6.0, 6.0), -28.0)
    add_child(label)
    var tween := label.create_tween()
    tween.tween_property(label, "position:y", label.position.y - 14.0, 0.6).set_ease(Tween.EASE_OUT).set_trans(Tween.TRANS_CUBIC)
    tween.parallel().tween_property(label, "modulate:a", 0.0, 0.3).set_delay(0.3)
    tween.tween_callback(label.queue_free)
`;

// --------------------------------------------------------------------------------------- module
export const MODULE: Module = {
  id: 'r01',
  part: 'rpg',
  order: 1,
  title: 'Stats, gear, shards and damage',
  summary: 'Base and derived stats with growth, a modifier system that applies flat then percent bonuses, equipment with linked shard sockets, elements and resistances, status effects as timed objects, and the full damage pipeline as one tested function.',
  relevance: md`Every number the player reads in Shardbound comes out of this module: Kai's attack on the equipment screen, the 139 that pops off a staggered skeleton, the fire resistance Lyra gets from linking Elemental and Fire in her robe, the poison ticks on Bram. The battle system (k04) calls the damage pipeline written here, the menus (r05) display the StatBlock, and the save system (r06) stores the Loadout. Getting the data model right now means new gear, shards and enemies later are \`.tres\` files, not new code.`,
  prereqs: ['g04', 'm05', 'c05'],
  areas: ['systems', 'combat', 'godot'],
  lessons: [
    // ============================================================================ r01-1
    {
      id: 'r01-1',
      title: 'Stats and modifiers',
      minutes: 40,
      objectives: [
        'Separate the few numbers you author per character (primary stats and growth) from the stats derived from them.',
        'Write CharacterStats and StatModifier as Resources and a StatBlock that combines base values and modifiers.',
        'Compute a final stat by hand as $(b + \\sum f)(1 + \\sum p / 100)$, rounded once, and explain why flat comes before percent.',
        'Recompute stats only when something changes, and tell the UI with one signal per frame.',
      ],
      cells: [
        {
          kind: 'text',
          md: md`Open the equipment screen, put the Power Ring on Kai, and his attack goes from 52 to 57. That small moment depends on a whole chain: Kai's level, his strength, how strength becomes attack, the sword's +12, the ring's +10%, and the order in which those are combined. Later the same number feeds the damage on screen, the speed of his ATB gauge and the enemy's stagger.

An RPG has hundreds of such numbers. If each one is a hand-typed field, balancing becomes impossible: changing Kai's strength would mean editing his attack at every level by hand. The usual answer has three layers:

1. **Authored** numbers, a handful per character: primary stats at level 1 and how fast they grow.
2. **Derived** numbers, computed from the authored ones by fixed formulas: max HP, attack, defence and so on.
3. **Modifiers**, temporary or equipment-based changes on top: "+12 attack" from a sword, "+50% speed" from Haste.

This lesson builds the first and third layers as data and code. The question to keep asking is: when the player sees 57, can you explain it in one line?`,
        },
        {
          kind: 'callout',
          tone: 'definition',
          title: 'Primary, derived and final stats',
          md: md`- **Primary stats** are authored per character: *strength*, *vitality*, *spirit* and *agility*, each with a value at level 1 and a growth per level.
- **Derived stats** are what combat reads: *max HP, max MP, attack, magic, defence, magic defence, speed, crit %*. Each is a formula of the primary stats.
- **Final stats** are derived stats after modifiers from gear, shards and status effects. Combat and menus only ever read final stats.

A primary stat at level $L$ is $\lfloor s_1 + g\,(L-1) \rfloor$: the level 1 value $s_1$ plus the growth $g$ per level, rounded down.`,
        },
        {
          kind: 'text',
          md: md`### The derived-stat formulas

Shardbound uses deliberately simple formulas, so a designer can predict what a change does:

| derived stat | formula | Kai, level 1 |
|---|---|---|
| max HP | $40 + 10 \times$ vitality | 140 |
| max MP | $10 + 3 \times$ spirit | 28 |
| attack | $2 \times$ strength | 24 |
| magic | $2 \times$ spirit | 12 |
| defence | vitality | 10 |
| magic defence | spirit | 6 |
| speed | agility | 14 |
| crit % | 5 | 5 |

Each primary stat feeds one or two derived stats, and that is a design decision. Vitality drives both HP and defence, so Bram's high vitality growth makes him tanky in two ways at once; spirit drives magic, MP and magic defence, so Lyra's spirit growth makes her a mage without a separate "mage" switch. Four growth numbers per character describe the whole curve, which matters in r02 when you balance levels against content.

The three party members differ only in these numbers:

| | strength | vitality | spirit | agility |
|---|---|---|---|---|
| Kai | 12, +2.0 | 10, +1.5 | 6, +1.0 | 14, +1.5 |
| Lyra | 6, +0.8 | 8, +1.0 | 15, +2.2 | 10, +1.2 |
| Bram | 10, +1.6 | 15, +2.2 | 7, +1.0 | 7, +0.8 |`,
        },
        {
          kind: 'callout',
          tone: 'godot',
          title: 'Enums in a holder class',
          md: md`GDScript enums live inside a script. g04 put the elements in \`class_name Element\` (\`Element.Type.FIRE\`); the stats get the same treatment in a small \`class_name Rpg\` script, so every other script writes \`Rpg.Stat.ATTACK\`. Enums beat strings like \`"attack"\` for two reasons: an exported \`Rpg.Stat\` shows a drop-down in the Inspector, and a typo such as \`Rpg.Stat.ATACK\` is an error when the script loads instead of a silent zero at runtime. Their values are 0, 1, 2, …, so they double as indices into arrays, which the StatBlock uses.`,
        },
        { kind: 'code', file: 'scripts/rpg/rpg.gd', code: RPG_ENUMS, note: md`\`DAMAGE_TAKEN\` is a percentage (normally 100) that Barrier lowers to 50; it is a stat so that status effects can change it with the same modifier system as everything else. Menus hide it.` },
        { kind: 'code', file: 'scripts/resources/character_stats.gd', code: CHARACTER_STATS, note: md`This replaces the \`CharacterStats\` skeleton from g04: instead of a base and a growth for each derived stat, it stores four primary stats and derives the rest, so the existing \`kai_stats.tres\`, \`lyra_stats.tres\` and \`bram_stats.tres\` get new fields to fill in. \`@export_group\` only groups the Inspector; the variables are ordinary. \`floori\` rounds down and returns an \`int\`. The formulas live in one function, so changing "attack is 2 × strength" is a one-line edit that applies to all three characters.` },
        {
          kind: 'numeric',
          q: md`Bram has vitality 15 at level 1 and grows 2.2 per level. What is his max HP at level 10?`,
          answer: { kind: 'number', value: 380 },
          hints: [md`First the primary stat: $\lfloor 15 + 2.2 \times 9 \rfloor$.`],
          explain: md`Vitality is $\lfloor 15 + 19.8 \rfloor = \lfloor 34.8 \rfloor = 34$, so max HP is $40 + 10 \times 34 = 380$.`,
        },
        {
          kind: 'text',
          md: md`### Modifiers: flat and percent

A **modifier** changes one stat by a **flat** amount ("+12 attack") or by a **percent** ("+10% attack"). Two questions decide how they combine, and both change the numbers the player sees.

**Which comes first?** Kai at level 5 has attack 40. With the Iron Sword (+12) and the Power Ring (+10%):

- flat first: $(40 + 12) \times 1.10 = 57.2$
- percent first: $40 \times 1.10 + 12 = 56$

**How do percents stack?** With two +10% bonuses:

- added: $1 + 0.10 + 0.10 = 1.20$
- multiplied: $1.10 \times 1.10 = 1.21$

The gap looks small here, but it grows with the number of bonuses. Five +20% bonuses multiplied give $1.2^5 \approx 2.49$, while added they give $2.0$. Multiplied percents grow exponentially, and that is how late-game builds break a game's balance.`,
        },
        {
          kind: 'derive',
          title: 'the final-stat formula',
          goal: md`Find a rule for combining a base $b$, flat modifiers $f_i$ and percent modifiers $p_j$ that keeps every bonus worth having and keeps stacking predictable.`,
          steps: [
            {
              md: md`Flat bonuses mostly come from gear, and gear is replaced as you progress. Percent bonuses come from accessories, shards and statuses, and they are meant to scale "your attack", whatever it is.`,
              choose: {
                prompt: md`So should a +10% ring also scale the sword's +12?`,
                options: [md`Yes: percent applies to base plus flat`, md`No: percent applies to the base only`],
                answer: 0,
                explain: md`If percent ignored gear, a new sword would make the ring relatively weaker, and a percent bonus would quietly lose value over the game. Applying percent to $(b + \sum f)$ keeps both kinds of bonus useful when the other one grows.`,
              },
            },
            {
              md: md`Several percent bonuses on one stat need a stacking rule.`,
              choose: {
                prompt: md`Which rule keeps three +20% bonuses at a predictable total?`,
                options: [md`Add them: $1 + 0.2 + 0.2 + 0.2 = 1.6$`, md`Multiply them: $1.2^3 \approx 1.73$`],
                answer: 0,
                explain: md`Added percents grow linearly: each new +20% adds the same 20% of the pre-percent value. Multiplied percents compound. Adding is easier to reason about and to cap; reserve true multipliers for a few rare, deliberate effects (and the damage pipeline's stages, which are designed as multipliers).`,
              },
            },
            {
              md: md`That gives the formula $$\text{final} = \operatorname{round}\Big(\big(b + \textstyle\sum_i f_i\big)\big(1 + \tfrac{1}{100}\textstyle\sum_j p_j\big)\Big),$$ clamped at 0. Round once, at the end: rounding after every modifier lets small bonuses vanish. A +1% bonus on a stat of 40 is 0.4, which rounds to 0 if applied alone, but it still counts when added to the rest first.`,
            },
          ],
          takeaway: md`Flat, then percent, with percents added and one rounding at the end. Write it down in your design notes: every gear tooltip and balance spreadsheet must use the same rule as the code.`,
        },
        {
          kind: 'viz',
          viz: { type: 'rpg.stats' },
          task: md`Pick Kai at level 5 and switch on the Iron Sword and the Power Ring: attack should read 57. Flip the order to **percent → flat** and watch it drop to 56. Then switch on Power Up lv 2 and Haste, and compare **add** and **multiply** for percent stacking on attack.`,
          caption: md`The table shows each stat's base (from level and primary stats), its flat and percent sums and the final value. Click a row to see the arithmetic for that stat. Every modifier chip is labelled with its source, the way the StatBlock groups them.`,
        },
        { kind: 'code', file: 'scripts/resources/stat_modifier.gd', code: STAT_MODIFIER, note: md`A Resource, so you can author modifiers in the Inspector inside a sword's \`.tres\`. \`make()\` is a static helper for creating them from code, as status effects and tests do.` },
        { kind: 'code', file: 'scripts/rpg/stat_block.gd', code: STAT_BLOCK },
        {
          kind: 'text',
          md: md`Three decisions in \`StatBlock\` are worth naming.

**Modifiers are grouped by source.** \`set_source(loadout, mods)\` stores the whole list a source contributes and replaces any previous list from the same source. Removing a ring is then \`remove_source\`, which cannot leave a stray "+10%" behind. The alternative, adding and removing single modifiers, needs bookkeeping in every caller, and a missed removal is a stat that slowly grows every time you re-equip.

**Values are cached and recomputed on change.** \`get_stat\` is called many times per frame (damage, UI, AI), but the inputs change rarely: on equip, level up, or status start and end. A dirty flag recomputes at most once after each change.

**The signal is coalesced.** Equipping a sword changes base values and modifiers, so \`_mark_dirty\` runs several times. \`call_deferred\` queues one \`changed\` emission at the end of the frame, so a stats panel redraws once instead of nine times.`,
        },
        {
          kind: 'callout',
          tone: 'godot',
          title: 'Why StatBlock is RefCounted, not a Resource',
          md: md`Resources are for data you author and save. A StatBlock is derived: it can always be rebuilt from \`CharacterStats\`, the level and the equipment, so it never needs saving, and a saved copy could only go stale. \`RefCounted\` gives it automatic memory management without the Resource machinery. The rule of thumb for this module: **definitions are Resources (\`.tres\`), runtime state is objects you build from them.**`,
        },
        {
          kind: 'check',
          q: md`Two slimes in a room share \`slime.tres\` (an \`EnemyData\`). When one is hit, this runs on that slime:

\`\`\`gdscript
enemy_data.max_hp -= 10
\`\`\`

What happens?`,
          options: [
            md`Every slime using \`slime.tres\` loses 10 max HP, including ones not yet spawned`,
            md`Only the slime that was hit loses 10 max HP`,
            md`Godot raises an error because Resources are read-only`,
            md`The change is lost when the scene reloads, so nothing is visible`,
          ],
          answer: 0,
          explain: md`Loading a \`.tres\` twice returns the same object, so every slime holds a reference to one \`EnemyData\`. Changing it changes the definition for all of them until the game restarts. Runtime numbers belong in a per-instance object (here, the slime's StatBlock and HealthComponent). If you really need a private copy of a Resource, call \`duplicate()\`.`,
        },
        {
          kind: 'steps',
          title: 'Create the stat scripts and Kai',
          steps: [
            md`Create the folders \`scripts/rpg/\` and \`resources/characters/\` if they do not exist (right-click in the **FileSystem** dock → **Create New → Folder**).`,
            md`Create \`scripts/rpg/rpg.gd\`, \`scripts/resources/character_stats.gd\`, \`scripts/resources/stat_modifier.gd\` and \`scripts/rpg/stat_block.gd\` with the listings above (right-click a folder → **Create New → Script…**, Inherits as in the listing). Save each one; the Output panel should stay free of errors.`,
            md`Right-click \`resources/characters/\` → **Create New → Resource…**, search for \`CharacterStats\`, and save it as \`kai_stats.tres\`. In the Inspector, set *Display Name* to Kai and fill the *Level 1* and *Growth per level* groups from the table: 12, 10, 6, 14 and 2.0, 1.5, 1.0, 1.5.`,
            md`Repeat for \`lyra_stats.tres\` and \`bram_stats.tres\`.`,
            md`Create a scene \`scenes/tests/stats_test.tscn\` with a plain \`Node\` root, attach the script below and press **F6** to run it.`,
          ],
          result: md`The Output panel prints \`level 5 attack: 40\`, \`with sword and ring: 57\` and \`gear removed: 40\`.`,
          troubleshoot: [
            { problem: md`\`CharacterStats\` is missing from the **Create New Resource** list.`, fix: md`The script has an error or lacks \`class_name CharacterStats\`. Open it and check the bottom panel for a red error; fix it and save, and the class appears.` },
            { problem: md`The script says \`Could not find type "StatBlock"\` although the file exists.`, fix: md`Godot registers \`class_name\` scripts when they are saved without errors. Save \`stat_block.gd\` (and \`rpg.gd\`, which it uses) first; if one of them has an error, every script that names it fails too.` },
            { problem: md`Attack prints 0.`, fix: md`\`apply_to\` was never called, or \`kai_stats.tres\` still has the default values. Check the Inspector values and that \`KAI.apply_to(stats, 5)\` runs before \`get_stat\`.` },
          ],
        },
        { kind: 'code', file: 'scripts/tests/stats_test.gd', code: STATS_TEST },
        {
          kind: 'build',
          ch: {
            id: 'r01-1-build',
            title: 'A stats panel that only redraws on change',
            goal: md`Make a \`PartyMember\` resource that rebuilds its StatBlock when its level changes, and a \`Label\` that lists the stats and updates through the \`changed\` signal, never in \`_process\`.`,
            requirements: [
              md`A \`Label\` in a test scene shows level and all stats of Kai, read from \`kai_stats.tres\`.`,
              md`**Enter** adds a +10% attack ring and **Escape** removes it; attack switches between 40 and 44 at level 5 (or the right values at your level).`,
              md`**Up** raises the level by one and every derived stat updates.`,
              md`A \`print\` in the redraw function shows that pressing a key redraws once, not once per stat.`,
            ],
            hints: [
              md`Give \`level\` a setter (\`set(value):\`) that calls \`rebuild()\`. When Godot loads a \`.tres\` it sets properties one by one, so \`base\` may still be \`null\` the first time the setter runs: check for it.`,
              md`Assign a typed array before passing it: \`var mods: Array[StatModifier] = [_ring]\`.`,
              md`\`Rpg.Stat.find_key(value)\` returns the enum name for a value, which is enough for a debug label.`,
            ],
            solution: [
              { file: 'scripts/rpg/party_member.gd', code: PARTY_MEMBER_V1 },
              { file: 'scripts/tests/stats_label.gd', code: STATS_LABEL },
            ],
            explain: md`The label never asks "did anything change?" every frame; the StatBlock tells it. In the test scene, create a \`PartyMember\` in the Inspector of the Label (*Member → New PartyMember*), drag \`kai_stats.tres\` into its *Base*, and set *Level* to 5. The label passes itself as the modifier source, so Escape removes exactly the ring it added.`,
          },
        },
        {
          kind: 'paper',
          problem: {
            id: 'r01-1-paper',
            title: "Bram's defence",
            type: 'compute',
            difficulty: 1,
            minutes: 6,
            statement: md`Bram is level 10 (vitality 34). He wears Chain Mail (+14 defence, −2 speed) and the Guard Amulet (+15% defence, +10% max HP). Using flat-then-percent with one rounding, find his final defence and final max HP. Enter $[\text{defence}, \text{max HP}]$.`,
            hints: [md`Base defence is vitality; base max HP is $40 + 10 \times 34$.`],
            solution: [
              md`Defence: $(34 + 14) \times 1.15 = 55.2 \to 55$.`,
              md`Max HP: base $40 + 340 = 380$, no flat bonus, $380 \times 1.10 = 418$.`,
            ],
            answer: { kind: 'vector', value: [55, 418] },
          },
        },
        {
          kind: 'recall',
          prompt: md`Write the final-stat formula and say when rounding happens.`,
          answer: md`$\text{final} = \operatorname{round}((b + \sum f)(1 + \sum p / 100))$, clamped at 0: flat first, percents added together, one rounding at the very end.`,
        },
        {
          kind: 'explain',
          prompt: md`Why author four primary stats with growth per character instead of typing max HP, attack and so on for every level?`,
          model: md`Derived stats keep the data small and consistent. Four level-1 values and four growth rates describe a character at every level, so rebalancing Kai is a change to one or two numbers that propagates to every derived stat at every level. Typed tables drift: one level gets a typo, two stats that should move together stop doing so. The formulas also make the design legible (vitality means "tanky", spirit means "caster"), and they let tools such as r02's progression simulator plot the whole curve.`,
        },
      ],
      cards: [
        { id: 'r01-1-c1', kind: 'concept', front: md`Primary, derived and final stats: what is each?`, back: md`Primary: authored per character with growth (strength, vitality, spirit, agility). Derived: formulas of the primary stats (max HP, attack, …). Final: derived after modifiers from gear, shards and statuses; the only values combat reads.` },
        { id: 'r01-1-c2', kind: 'cloze', text: md`A final stat is (base + sum of {{}}) × (1 + sum of {{}} / 100), rounded once.`, answers: ['flat', 'percent|percents'] },
        { id: 'r01-1-c3', kind: 'compute', front: md`Attack 40, +12 flat, +10% and +15%. Final attack?`, answer: { kind: 'number', value: 65 }, back: md`$(40 + 12)(1 + 0.25) = 65$.` },
        { id: 'r01-1-c4', kind: 'concept', front: md`Why does the StatBlock group modifiers by source?`, back: md`A source (a Loadout, a status) replaces or removes its whole list in one call, so unequipping can never leave a stray modifier behind.` },
        { id: 'r01-1-c5', kind: 'concept', front: md`What goes wrong if runtime values are written into a shared \`.tres\`?`, back: md`Every user of that Resource shares the change, because loading a \`.tres\` returns one shared object. Keep runtime state in per-instance objects, or \`duplicate()\` the Resource.` },
      ],
    },
    // ============================================================================ r01-2
    {
      id: 'r01-2',
      title: 'Equipment and shards',
      minutes: 45,
      objectives: [
        'Define EquipmentData with a slot, stat modifiers and shard sockets, some of them linked in pairs.',
        'Explain why the shards in a socket and the AP a shard has earned live in per-character objects, not in the `.tres` definitions.',
        'Compute a shard\'s level from its AP and apply passive shards once per level.',
        'Apply a whole loadout to a StatBlock as one source, recomputed on every change.',
        'Use the Elemental support shard in linked sockets: an element on attacks in a weapon, resist, nullify or absorb in armour.',
      ],
      cells: [
        {
          kind: 'text',
          md: md`On the equipment screen the player highlights Chain Mail and sees **defence 22 → 30** in green and **speed 20 → 18** in red before committing. They slot a Fire shard into Lyra's staff and a new spell appears in her battle menu. They link Elemental with Fire in Bram's armour and the golem's fire breath stops hurting.

These are Shardbound's version of FF7's materia. In FF7, materia orbs sit in slots on weapons and armour; magic materia gives spells, command materia gives abilities, independent materia gives passive bonuses, and support materia changes the materia in the slot it is **linked** to. Elemental linked with Fire in armour protects against fire; in a weapon it adds fire to attacks. Materia earns AP from battles and levels up, learning stronger spells. Shards follow the same rules, which gives the player two layers of choice: which gear to wear, and how to fill its sockets.`,
        },
        {
          kind: 'callout',
          tone: 'definition',
          title: 'Slots, sockets, links and shards',
          md: md`- An **equipment slot** is one of *weapon*, *armour*, *accessory*. A character wears one item per slot.
- A **socket** is a place on a weapon or armour for one shard. Accessories have none.
- A **linked pair** is two adjacent sockets joined so their shards can affect each other. Shardbound links sockets 0+1, 2+3, …, up to \`linked_pairs\` pairs.
- A **shard** is one of four kinds: *spell* (grants spells, like Fire), *ability* (grants a command), *passive* (stat modifiers, like HP Up), *support* (modifies the shard it is linked to, like Elemental).
- **AP** (ability points) are earned by every socketed shard after a battle. Crossing an AP threshold raises the shard's level.`,
        },
        { kind: 'assets', ids: ['hero', 'mage', 'guard', 'icons', 'ui_panel'], note: md`The equipment screen in r05 uses \`ui_panel\` for windows and the \`icons\` sheet for item and shard icons. This lesson only needs the data; the figure shows the screen you are building toward.` },
        {
          kind: 'callout',
          tone: 'warning',
          title: 'Definitions are shared; state is not',
          md: md`\`iron_sword.tres\` describes the Iron Sword: +12 attack, 2 sockets, linked. It does **not** say which shards are in it, because the same \`.tres\` is loaded by Kai's loadout, by the shop's stock and by a chest. If the sockets lived in the Resource, putting Fire in Kai's sword would put Fire in the shop's swords too. The same goes for a shard's AP: \`fire.tres\` is the definition, but the party might own two Fire shards with different AP. So:

- \`EquipmentData\`, \`ShardData\`: definitions, authored in the Inspector, never modified at runtime.
- \`ShardInstance\`: one owned shard and its AP.
- \`Loadout\`: one character's equipped items and which \`ShardInstance\` sits in which socket.`,
        },
        { kind: 'code', file: 'scripts/resources/equipment_data.gd', code: EQUIPMENT_DATA, note: md`\`linked_partner\` encodes the pairing rule in one place. With \`linked_pairs = 1\`, sockets 0 and 1 are partners and socket 2 has none. Note \`socket >= linked_pairs * 2\` instead of dividing: \`/\` between two ints truncates in GDScript, and the multiplication avoids the question entirely.` },
        { kind: 'code', file: 'scripts/resources/shard_data.gd', code: SHARD_DATA, note: md`\`AbilityData\` comes from g04; r02 fills it in. Thresholds are **cumulative** AP: with \`[200, 600]\` a shard reaches level 2 at 200 AP and level 3 at 600 AP, so the second level costs 400 more.` },
        { kind: 'code', file: 'scripts/resources/shard_instance.gd', code: SHARD_INSTANCE },
        {
          kind: 'numeric',
          q: md`A Fire shard has \`ap_to_level = [200, 600]\` and 450 AP. What is its level, and how much more AP does it need for the next level? Enter both, level first.`,
          answer: { kind: 'vector', value: [2, 150] },
          inputHint: 'e.g. 2, 150',
          explain: md`450 ≥ 200 but < 600, so the loop adds one level: level 2. The next threshold is 600, so it needs $600 - 450 = 150$ AP.`,
        },
        {
          kind: 'text',
          md: md`### The Loadout

A \`Loadout\` holds three \`EquipmentData\` references and two arrays of \`ShardInstance\`, one entry per socket, with \`null\` for an empty socket. Three operations matter:

- **\`equip(item)\`** puts an item in its slot. When a weapon is replaced, its shards move to the new weapon socket by socket, and the ones that do not fit are returned to the caller. (FF7 behaves this way: materia carries over to a new weapon when there are enough slots.) Returning them, instead of deleting them, keeps the "a shard can never disappear" rule in one place.
- **\`socket(slot, index, shard)\`** places a shard and returns the one it replaced.
- **\`apply_to(block)\`** turns the current state into modifiers and element overrides and gives them to the StatBlock **as one source**.

Every change calls \`emit_changed()\`. \`Resource\` already declares a \`changed\` signal and \`emit_changed()\` fires it, so \`Loadout\` must not declare its own \`signal changed\` (Godot reports that as a duplicate). \`PartyMember\` connects that signal to \`rebuild()\`, which reapplies the character's base stats and then the loadout. Rebuilding everything on each change is simpler than patching, and with nine stats it costs nothing measurable.

**Linked sockets.** \`_linked_element(item, shards, i)\` checks whether socket $i$ holds a support shard and, if its partner socket holds a shard with an element, returns that element. In armour this produces an override for the StatBlock's element table, scaled by Elemental's level: 0.5 (resist), 0 (immune), −1 (absorb), the same progression FF7's Elemental materia shows in armour. In a weapon, \`weapon_element()\` gives the element that basic attacks carry.`,
        },
        { kind: 'code', file: 'scripts/rpg/loadout.gd', code: LOADOUT },
        { kind: 'code', file: 'scripts/rpg/party_member.gd', code: PARTY_MEMBER_V2, note: md`This replaces the lesson 1 version. \`setup()\` is separate from \`_init()\` because when a Resource is loaded from disk, \`_init()\` runs **before** the saved properties are assigned, so \`loadout\` would still be \`null\` there.` },
        {
          kind: 'viz',
          viz: { type: 'rpg.gear' },
          task: md`On Kai, swap the Leather Vest for Chain Mail and read the arrows: defence up, speed down. Then select Lyra, put **Elemental** in one socket of the Oak Staff's linked pair and **Fire** in the other, and check her attack element. Finally, move both into Bram's Chain Mail and raise Elemental's level to 3 to see fire go from resist to absorb.`,
          caption: md`Linked sockets are joined by a bar. The stat table lists every modifier with its source, the same grouping the StatBlock uses. Passive shards scale with their level: HP Up at level 2 gives +20%.`,
        },
        {
          kind: 'check',
          q: md`Kai's Rune Blade has 3 sockets and \`linked_pairs = 1\`. Elemental is in socket 1 and Fire in socket 2. What element do his basic attacks have?`,
          options: [md`None: sockets 1 and 2 are not a linked pair`, md`Fire: the two shards are adjacent`, md`Fire, but only at Elemental level 2`, md`Godot errors because socket 2 has no partner`],
          answer: 0,
          explain: md`With one linked pair only sockets 0 and 1 are partners. \`linked_partner(1)\` returns 0, which holds nothing, so \`_linked_element\` returns \`NONE\`. Socket 2 has no partner (\`linked_partner(2)\` is −1). The equipment screen must draw links clearly, or players will make exactly this mistake.`,
        },
        {
          kind: 'numeric',
          q: md`Kai at level 5 has a base max HP of 200. He wears the Leather Vest (+40 max HP), the Guard Amulet (+10% max HP) and has HP Up at level 2 socketed (+10% per level). What is his final max HP?`,
          answer: { kind: 'number', value: 312 },
          explain: md`Flat first: $200 + 40 = 240$. Percents add: $10 + 2 \times 10 = 30$. Final $240 \times 1.30 = 312$.`,
        },
        {
          kind: 'steps',
          title: 'Author gear and shards as resources',
          steps: [
            md`Save \`equipment_data.gd\`, \`shard_data.gd\`, \`shard_instance.gd\`, \`loadout.gd\` and the new \`party_member.gd\`. If \`AbilityData\` from g04 does not exist yet, create \`scripts/resources/ability_data.gd\` with just \`class_name AbilityData\` and \`extends Resource\`.`,
            md`Create \`resources/equipment/iron_sword.tres\` (**Create New → Resource… → EquipmentData**). Set *Slot* to Weapon, *Owner Id* to \`kai\`, *Shard Sockets* 2, *Linked Pairs* 1. In *Modifiers*, click **Add Element**, choose **New StatModifier** in the empty slot, expand it and set *Stat* Attack, *Kind* Flat, *Value* 12.`,
            md`Make \`rune_blade.tres\` (+8 attack, +8 magic, 3 sockets, 1 linked pair) and \`chain_mail.tres\` (armour, +14 defence, −2 speed, 2 sockets, 1 linked pair) the same way.`,
            md`Create \`resources/shards/fire.tres\` (*Kind* Spell, *Element* Fire) and \`elemental.tres\` (*Kind* Support, *Ap To Level* 400 and 1200).`,
            md`Create \`scenes/tests/loadout_test.tscn\` with a \`Node\` root and the script below, and run it with **F6**. Press **Escape** to toggle Elemental next to Fire in the armour and **Enter** to swap weapons.`,
          ],
          result: md`Each key press prints one line. With Elemental in, \`fire x0.5\` appears; swapping to the Rune Blade raises magic by 8 and lowers attack by 4, and \`spare\` stays 0 because both weapons have at least 2 sockets.`,
          troubleshoot: [
            { problem: md`Changing the modifier on one sword also changes another item.`, fix: md`You dragged the same StatModifier sub-resource into two items, so they share it. Right-click the modifier in the Inspector and choose **Make Unique**, or create a new one.` },
            { problem: md`*Modifiers* accepts any Resource, or shows \`Object\`.`, fix: md`The export must be typed: \`@export var modifiers: Array[StatModifier] = []\`. Save the script; the Inspector then offers **New StatModifier**.` },
            { problem: md`Nothing prints when you press keys.`, fix: md`\`changed\` is emitted deferred, at the end of the frame, and only connected after \`_ready\`'s first changes. Press a key; if still nothing, check that \`kai.setup()\` ran so the loadout's \`changed\` is connected to \`rebuild\`.` },
          ],
        },
        { kind: 'code', file: 'scripts/tests/loadout_test.gd', code: LOADOUT_TEST },
        {
          kind: 'build',
          ch: {
            id: 'r01-2-build',
            title: 'A shard bag and an equip preview',
            goal: md`Give the party a bag of unsocketed shards and write a preview function for the equipment screen: what would each final stat be if this item were equipped, without equipping it?`,
            requirements: [
              md`\`PartyBag\` holds an \`Array[ShardInstance]\`; socketing takes a shard out of the bag and puts any replaced shard back. A shard is never in two places and never lost.`,
              md`Swapping a 3-socket weapon for a 1-socket weapon returns the two extra shards to the bag.`,
              md`\`preview(member, item)\` returns a Dictionary from \`Rpg.Stat\` to the final value with that item equipped, and the member's real stats do not change (no \`changed\` signal is emitted on the real StatBlock).`,
              md`A test prints the preview of Chain Mail on Kai: defence and speed differ from his current values by the amounts the figure shows.`,
            ],
            hints: [
              md`For the preview, build a fresh \`StatBlock\`, apply \`member.base\` at \`member.level\`, then apply a **temporary** \`Loadout\` that copies the member's items and swaps one. \`Resource.duplicate()\` makes a shallow copy, which is what you want: the copy may share EquipmentData and ShardInstances, because the preview never changes them.`,
              md`\`equip()\` returns the spare shards. In the real call, append them to the bag; in the preview, ignore them.`,
            ],
            solution: [
              {
                file: 'scripts/rpg/party_bag.gd',
                code: gd`
class_name PartyBag
extends Resource
## Shards the party owns but has not socketed.

@export var shards: Array[ShardInstance] = []


## Moves a shard from the bag into a socket; whatever was there goes back into the bag.
func socket(member: PartyMember, slot: EquipmentData.Slot, index: int, shard: ShardInstance) -> void:
    if shard != null:
        shards.erase(shard)
    var previous := member.loadout.socket(slot, index, shard)
    if previous != null:
        shards.append(previous)
    emit_changed()


## Equips an item; shards that no longer fit come back to the bag.
func equip(member: PartyMember, item: EquipmentData) -> void:
    shards.append_array(member.loadout.equip(item))
    emit_changed()


## Final stats as they would be with item equipped. Touches nothing real.
static func preview(member: PartyMember, item: EquipmentData) -> Dictionary:
    var block := StatBlock.new()
    member.base.apply_to(block, member.level)
    var trial := member.loadout.duplicate() as Loadout
    trial.weapon_shards = member.loadout.weapon_shards.duplicate()
    trial.armour_shards = member.loadout.armour_shards.duplicate()
    trial.equip(item)
    trial.apply_to(block)
    var out := {}
    for stat: Rpg.Stat in Rpg.Stat.values():
        out[stat] = block.get_stat(stat)
    return out
`,
              },
            ],
            explain: md`The preview copies the socket arrays explicitly, because \`equip\` resizes them in place; with its own arrays the trial loadout can never touch the real ones, whatever \`duplicate()\` does with array properties. Everything else (EquipmentData, ShardInstances) can be shared because the preview never modifies it. The equipment screen in r05 calls \`preview\` for the highlighted item and colours each difference green or red.`,
          },
        },
        {
          kind: 'paper',
          problem: {
            id: 'r01-2-paper',
            title: 'Two swords, one real choice',
            type: 'design',
            difficulty: 2,
            minutes: 10,
            statement: md`Kai can buy the Rune Blade (+8 attack, +8 magic, 3 sockets, 1 linked pair) in the ruins. Design a second sword available at the same time so that neither is strictly better. Give its modifiers, sockets and links, and describe the player who would pick each.`,
            solution: [
              md`A strictly better item is one that is at least as good on every axis; to avoid it, each sword must win on at least one axis the player cares about. The axes here: raw attack, magic, socket count, linked pairs.`,
              md`Example: **Breaker** (+18 attack, 1 socket, no links). It hits much harder with basic attacks and Rising Slash but holds one shard and cannot carry an Elemental pair.`,
              md`A player who fights with Kai's sword and leaves magic to Lyra picks Breaker. A player who wants Kai to carry Fire + Elemental for fire-weak skeletons, plus a passive, picks the Rune Blade.`,
              md`Check with numbers: Kai at level 8 has attack 52 before his weapon. Breaker gives 70, Rune Blade 60, about 17% more basic damage for Breaker, against one shard versus three. Both are defensible.`,
            ],
            rubric: [
              md`The new sword wins on at least one axis and loses on at least one`,
              md`Uses the socket/link structure as part of the trade-off, not only stats`,
              md`Describes a play style for each choice`,
              md`Checks the size of the trade-off with a number`,
            ],
          },
        },
        {
          kind: 'recall',
          prompt: md`Where does each of these live: the Iron Sword's +12 attack, the fact that Fire is in Kai's sword, the 450 AP on that Fire shard?`,
          answer: md`+12 attack: in \`iron_sword.tres\` (EquipmentData, shared definition). Fire in Kai's sword: in Kai's \`Loadout.weapon_shards\`. 450 AP: in that \`ShardInstance\`.`,
        },
        {
          kind: 'explain',
          prompt: md`Early gear in Shardbound gives flat bonuses and late accessories give percent bonuses. Why is that a common pattern?`,
          model: md`Flat bonuses matter most when base stats are small: +12 attack on a base of 24 is a 50% increase at level 1 but only 12% at level 20, so flat gear naturally fades and gets replaced. Percent bonuses keep their relative value at every level, so they make sense on items meant to stay useful, and as rewards later when the player has big bases to multiply. Because percents apply after flats, a late percent bonus also scales the gear the player chooses, which keeps both choices interesting.`,
        },
      ],
      cards: [
        { id: 'r01-2-c1', kind: 'concept', front: md`Why do socketed shards live in \`Loadout\` and not in \`EquipmentData\`?`, back: md`The \`.tres\` is a shared definition loaded by everyone who refers to it (shop, chest, other characters). Per-character state must live in a per-character object.` },
        { id: 'r01-2-c2', kind: 'cloze', text: md`A Resource subclass must not declare \`signal changed\`; it calls {{}}() to fire the built-in one.`, answers: ['emit_changed'] },
        { id: 'r01-2-c3', kind: 'compute', front: md`AP thresholds [200, 600]. Level of a shard with 600 AP?`, answer: { kind: 'number', value: 3 }, back: md`Both thresholds are met (≥), so level $1 + 2 = 3$, the maximum.` },
        { id: 'r01-2-c4', kind: 'concept', front: md`Elemental linked with Fire: effect in a weapon, and in armour at levels 1, 2, 3?`, back: md`Weapon: basic attacks deal fire damage. Armour: fire multiplier 0.5, then 0, then −1 (absorb).` },
        { id: 'r01-2-c5', kind: 'concept', front: md`Why apply the whole loadout to the StatBlock as one source?`, back: md`Each change replaces the previous contribution in one call, so nothing from an unequipped item can linger.` },
      ],
    },
    // ============================================================================ r01-3
    {
      id: 'r01-3',
      title: 'Damage, elements and status effects',
      minutes: 45,
      objectives: [
        'Write the damage pipeline as one pure, commented function and compute a hit through every stage by hand.',
        'Use ratio defence $x \\cdot \\frac{100}{100 + d}$ and explain why each point of defence adds the same effective HP.',
        'Apply element multipliers (2, 1, 0.5, 0, −1), stagger and critical hits as multipliers and round once.',
        'Implement poison, slow, haste and barrier as timed objects that add and remove StatBlock modifiers.',
        'Test the pipeline with fixed inputs in a test scene.',
      ],
      cells: [
        {
          kind: 'text',
          md: md`Kai lands Rising Slash on a skeleton and **87** floats up. A few seconds later the skeleton is staggered and the same move shows **139**. A lucky crit shows **208**. Players read these numbers and work out the rules without a manual: staggered enemies take more, weaknesses take double, some enemies shrug off ice. That only works if the rules are consistent, which means one function computes all damage, in a fixed order, and nothing else adds damage on the side.

The order of stages is fixed in the guide's architecture:

**offence → defence → element → stagger → crit → final integer**, then status effects.

m05 compares damage-formula shapes and the probability behind crits and variance. This lesson implements Shardbound's choice in Godot, tests it, and adds status effects.`,
        },
        {
          kind: 'callout',
          tone: 'definition',
          title: 'The damage pipeline',
          md: md`For an attacker with stats $A$, a target with stats $T$ and an ability of power $P$:

1. **Offence**: $x = P \times A_{\text{atk}}$ (or $A_{\text{mag}}$ for magic).
2. **Defence**: $x \leftarrow x \cdot \dfrac{100}{100 + T_{\text{def}}}$ (or magic defence), then $\times\, T_{\text{taken}}/100$ (Barrier halves it).
3. **Element**: $x \leftarrow x \cdot e$ with $e \in \{2, 1, 0.5, 0, -1\}$: weak, neutral, resist, immune, absorb.
4. **Stagger**: $x \leftarrow x \cdot s$, $s = 1$ normally, $1.6$ or more while staggered.
5. **Crit**: with probability $A_{\text{crit}}/100$, $x \leftarrow 1.5\,x$.
6. **Final**: round once; at least 1 if positive, 0 if immune, at most −1 if absorbed (a heal).`,
        },
        {
          kind: 'derive',
          title: 'why ratio defence',
          goal: md`Choose how defence $d$ reduces raw damage $x$, so that defence always matters and never makes a character invincible.`,
          steps: [
            {
              md: md`The obvious rule is subtraction: $x - d$. A level 1 slime hits for 14 against Bram's defence 15.`,
              choose: {
                prompt: md`What does subtraction give, and what does that force on the designer?`,
                options: [md`$-1$: damage needs a floor, and enemies weaker than your defence become harmless`, md`$14$: defence only matters later`, md`$0.93$: a small reduction`],
                answer: 0,
                explain: md`Subtraction makes defence a wall. Below the wall, damage is clamped to a minimum and every enemy is equally harmless; above it, small changes in attack cause huge swings. Tuning becomes fragile.`,
              },
            },
            {
              md: md`The ratio rule $x \cdot \frac{100}{100 + d}$ never reaches zero: $d = 100$ halves damage, $d = 300$ quarters it. To compare defence values, look at **effective HP**, the raw damage a character can absorb before falling: $$\text{EHP} = \text{HP} \cdot \frac{100 + d}{100} = \text{HP}\,\Big(1 + \frac{d}{100}\Big).$$`,
              choose: {
                prompt: md`How does EHP change when $d$ goes up by 1?`,
                options: [md`It rises by HP/100, the same at any $d$`, md`It rises less and less as $d$ grows`, md`It doubles`],
                answer: 0,
                explain: md`EHP is linear in $d$ with slope HP/100. Each point of defence is worth exactly 1% of max HP in survivability, whether it is the 10th point or the 200th. The damage taken shows diminishing returns, but survivability does not, which is why this form is easy to balance.`,
              },
            },
            {
              md: md`The other stages are multipliers, and multiplication commutes: element, stagger and crit can come in any order and give the same unrounded value. Order matters only where something is **not** a multiplication: a clamp, a rounding, a subtraction. That is why the pipeline rounds and clamps once, at the end.`,
            },
          ],
          takeaway: md`Ratio defence with one rounding at the end: defence never makes anyone immune, each point is worth the same survivability, and the stage order only matters for the final clamp. If a stage ever adds instead of multiplies (a flat "+20 fire damage"), its position starts to matter and must be documented.`,
        },
        {
          kind: 'text',
          md: md`### Elements, stagger and crits as multipliers

Elements are g04's \`Element.Type\`: none, fire, ice, lightning and earth; the first areas use fire, ice and lightning. The target's multiplier for the element comes from its StatBlock: enemies set it from \`EnemyData\` (g04's \`weakness\`, plus \`resists\`, \`immune_to\` and \`absorbs\` lists), and party members get overrides from Elemental shards in armour.

| multiplier | meaning | what the player sees |
|---|---|---|
| 2 | weak | big number, often extra pressure (k04) |
| 1 | neutral | normal |
| 0.5 | resist | small number |
| 0 | immune | "Immune", no damage |
| −1 | absorb | a green number: the target heals |

Absorb is why the final stage cannot be a plain \`maxi(1, …)\`: a negative value is a heal, so it is rounded and kept negative. Immune is checked on the multiplier, not on the value, because a very weak hit might round to 0 without being immune.

**Stagger and crit multiply each other.** A staggered crit is $1.6 \times 1.5 = 2.4$ times a normal hit. If they were added (+60% and +50%), it would be 2.1. Multiplying makes "crit a staggered enemy" a real moment worth planning for, which suits the FF7-Remake-style loop of building pressure and then unloading. It also means you must watch the top end: the largest possible hit is the product of all the largest multipliers.`,
        },
        { kind: 'code', file: 'scripts/rpg/damage_calc.gd', code: DAMAGE_CALC, note: md`The function takes StatBlocks and plain values, not nodes. That makes it callable from a hitbox, a spell, a tooltip preview or a test with no scene running. \`crit_roll\` is passed in rather than calling \`randf()\` inside, so tests can force a crit (0.0) or rule it out (1.0). The parameter list is split over two lines; GDScript allows a line break anywhere inside parentheses.` },
        {
          kind: 'viz',
          viz: { type: 'rpg.damage' },
          task: md`Step through Kai's **Rising Slash** on the **skeleton**: you should get 87. Turn on **staggered**, then drag the crit roll below Kai's crit chance and step again: 208. Then switch to Lyra's **Thunder** on the **golem** and see why the last stage needs a special case.`,
          caption: md`Each step highlights the lines of \`DamageCalc.calculate\` that run and shows the value after them. The numbers are the same ones your Godot test prints, because the figure runs the same arithmetic.`,
        },
        {
          kind: 'numeric',
          q: md`Kai has attack 57 (Iron Sword and Power Ring). Rising Slash has power 2.0. The skeleton has defence 20, no relevant element, and is staggered with multiplier 1.6. No crit. What number appears?`,
          answer: { kind: 'number', value: 152 },
          hints: [md`$2.0 \times 57 = 114$, then $\times\, 100/120$.`],
          explain: md`$114 \times \frac{100}{120} = 95$, then $95 \times 1.6 = 152$. No rounding was needed until the end, and the value happened to be whole.`,
        },
        {
          kind: 'check',
          q: md`Lyra casts Thunder (magic, lightning) on the golem, which absorbs lightning. The value after the stagger stage is $-41.3$. What does \`calculate\` return in \`amount\`, and what does \`Combatant.receive_attack\` do with it?`,
          options: [md`$-41$; it calls \`health.heal(41)\``, md`$1$; it calls \`health.damage(1)\``, md`$0$; nothing happens`, md`$-41$; it calls \`health.damage(-41)\``],
          answer: 0,
          explain: md`A negative value means absorb, so the final stage keeps the sign: \`mini(-1, roundi(-41.3))\` is $-41$. \`receive_attack\` sends negative amounts to \`heal\`. c05's \`damage\` ignores amounts of 0 or less, so sending the negative value there would silently do nothing, exactly the kind of hidden rule the pipeline avoids.`,
        },
        {
          kind: 'text',
          md: md`### Wiring the pipeline into combat

c05 gave every fighter a \`Hurtbox\` that emits \`hurt(hit: HitData)\` and a \`HealthComponent\`. One more component connects them to stats: \`Combatant\`. It owns the StatBlock (enemies build it from their \`EnemyData\`; party members share the one their \`PartyMember\` rebuilds), keeps max HP in sync with the stats, and turns each hit into HP loss through \`DamageCalc\`.

The hitbox describes the attack, not its result: extending the \`HitData\` from g04, it gains a \`power\` and an \`is_magic\` flag, both with defaults so g04's \`_init(amount, element, source)\` still works. The basic attack hitbox for Kai sets \`power = 1.0\` and \`element = loadout.weapon_element()\`, so linking Elemental and Fire in his sword turns his combo into fire damage with no other code. Abilities in r02 call \`receive_attack\` directly.`,
        },
        { kind: 'code', file: 'scripts/resources/hit_data.gd', code: HIT_DATA_ADD, fragment: true },
        { kind: 'code', file: 'scripts/resources/enemy_data.gd', code: ENEMY_DATA, note: md`This extends the \`EnemyData\` from g04, keeping its field names (\`defense\`, \`weakness\`, \`xp_reward\`). \`Array[Element.Type]\` exports as a list of drop-downs. \`element in absorbs\` is checked first, so an element listed twice by mistake resolves to the most extreme effect, and a designer who sees "absorbs" in the Inspector gets absorb.` },
        { kind: 'code', file: 'scenes/components/combatant.gd', code: COMBATANT, note: md`It uses c05's \`HealthComponent\` as it is: \`damage(amount)\`, \`heal(amount)\` and the \`max_health\` property. \`hit.source\` is the attacking Character, and \`get_node_or_null("Combatant")\` finds its Combatant child.` },
        {
          kind: 'text',
          md: md`### Status effects as timed objects

Poison, slow, haste and barrier have the same shape: they start, last a while, may do something every few seconds, change some stats while they last, and end. That suggests one data class and one component.

- \`StatusEffectData\` (a Resource): duration, tick interval, damage per tick, stat modifiers, and which effects it removes. \`poison.tres\`, \`haste.tres\` and the rest are just data.
- \`StatusComponent\` (a Node on each fighter): the active effects and their timers.

The modifiers go through the StatBlock with the effect's runtime object as the **source**. Haste adds \`SPEED +50%\` when it starts and \`remove_source\` takes exactly that away when it ends, whatever else changed meanwhile. Barrier uses the same path: \`DAMAGE_TAKEN −50%\` turns 100 into 50, which the pipeline's defence stage reads.

Two rules need deciding for every RPG, and players notice when they are inconsistent:

- **Re-applying**: Shardbound refreshes the timer and never stacks. Poison on a poisoned enemy restarts 12 seconds; it does not double the ticks.
- **Opposites**: Haste removes Slow and Slow removes Haste, through the \`removes\` list.

| effect | duration | ticks | modifiers |
|---|---|---|---|
| poison | 12 s | 5% max HP every 2 s | none |
| slow | 10 s | none | speed −50% |
| haste | 15 s | none | speed +50% |
| barrier | 20 s | none | damage taken −50% |`,
        },
        { kind: 'code', file: 'scripts/resources/status_effect_data.gd', code: STATUS_DATA },
        { kind: 'code', file: 'scenes/components/status_component.gd', code: STATUS_COMPONENT, note: md`\`Active\` is an inner class: a small type that only this script needs. Status timers count in \`_physics_process\`, so they pause with the game and slow down with tactical mode's time scale (k04) like everything else in combat.` },
        {
          kind: 'viz',
          viz: { type: 'rpg.damage.status' },
          task: md`The example run applies Poison at 1 s and again at 7 s, Haste at 14 s and Slow at 18 s. Count the poison ticks in the log: did the second Poison stack or refresh? Why does the speed line drop below 14 at 18 s instead of returning to it? Then press **Reset**, **Play**, and apply effects yourself; try Poison on the skeleton.`,
          caption: md`Bram, level 10, 380 max HP, standing still for 30 seconds. The top graph is HP, the bottom one speed; the log lists the \`added\`, \`ticked\` and \`removed\` signals as StatusComponent emits them.`,
        },
        {
          kind: 'numeric',
          q: md`Bram has 380 max HP and is poisoned (5% of max HP every 2 s, for 12 s). Nothing else happens. How much HP does poison take in total?`,
          answer: { kind: 'number', value: 114 },
          explain: md`One tick is $\operatorname{round}(380 \times 0.05) = 19$. Ticks land at 2, 4, 6, 8, 10 and 12 s: 6 ticks, $6 \times 19 = 114$ HP, 30% of his max HP.`,
        },
        {
          kind: 'steps',
          title: 'Test the pipeline',
          steps: [
            md`Save \`damage_calc.gd\`, \`enemy_data.gd\`, \`status_effect_data.gd\`, \`status_component.gd\` and \`combatant.gd\`, and add the two fields to \`hit_data.gd\`.`,
            md`Create \`scenes/tests/damage_test.tscn\` with a \`Node\` root and the script below. Run it with **F6**.`,
            md`Change \`CRIT_MULTIPLIER\` to 2.0 and run again: only the \`crit\` line should fail. Put it back. A test that fails for the right reason is how you know it tests something.`,
          ],
          result: md`Eight \`PASS\` lines and \`done: 0 failures\` in the Output panel.`,
          troubleshoot: [
            { problem: md`\`barrier\` returns 0, or every value is 0.`, fix: md`Integer division. \`target.get_stat(Rpg.Stat.DAMAGE_TAKEN) / 100\` divides two ints and gives 0 for 50 (and 1 for 100). The listing divides by \`100.0\`.` },
            { problem: md`Values are off by one here and there (86 instead of 87).`, fix: md`Something rounds or truncates before the end: an \`int\` variable for \`x\`, \`floori\` instead of \`roundi\`, or a \`var x: int\`. Keep \`x\` a float until stage 6.` },
            { problem: md`\`Invalid call. Nonexistent function 'element_multiplier'\`.`, fix: md`Your \`StatBlock\` is the lesson 1 version from before element support. Use the full listing from lesson 1, which includes \`set_base_element\` and \`element_multiplier\`.` },
          ],
        },
        { kind: 'code', file: 'scripts/tests/damage_test.gd', code: DAMAGE_TEST },
        {
          kind: 'build',
          ch: {
            id: 'r01-3-build',
            title: 'Damage numbers that teach the rules',
            goal: md`Add floating damage numbers to every Combatant so the player can read the pipeline's results: normal hits, crits, weaknesses, immunity, absorb heals and poison ticks each look different.`,
            requirements: [
              md`A normal hit shows the amount in white above the target, rising and fading over about 0.6 s.`,
              md`A crit shows a larger gold number with a "!".`,
              md`Absorbed damage shows a green "+N"; an immune hit shows "Immune".`,
              md`Poison ticks show smaller purple numbers.`,
              md`The numbers node only listens to signals; it never calls \`DamageCalc\` itself.`,
            ],
            hints: [
              md`\`Combatant.damaged\` passes the whole \`Result\`, so \`result.crit\` and \`result.element_multiplier\` are available.`,
              md`Make each label its own tween with \`label.create_tween()\`, so it is cleaned up with the label; \`tween_callback(label.queue_free)\` removes it at the end.`,
              md`A small random x offset stops numbers from stacking on top of each other during a fast combo.`,
            ],
            solution: [{ file: 'scenes/components/damage_numbers.gd', code: DAMAGE_NUMBERS }],
            explain: md`The display depends only on \`Result\`, so the pipeline can change without touching it, and every hit in the game looks consistent. In r05 you will swap \`Label\` for the pixel font and add a short hitstop on crits (k01).`,
          },
        },
        {
          kind: 'paper',
          problem: {
            id: 'r01-3-paper',
            title: 'A golem slam on Bram',
            type: 'compute',
            difficulty: 2,
            minutes: 6,
            statement: md`The golem (attack 48) slams Bram with a physical attack of power 1.5. Bram's final defence is 55 and he has Barrier (damage taken 50). Neither stagger nor crit applies, and the element is none. What damage does Bram take?`,
            solution: [
              md`Offence: $1.5 \times 48 = 72$.`,
              md`Defence: $72 \times \frac{100}{155} \approx 46.45$; Barrier: $\times\, 0.5 \approx 23.23$.`,
              md`Element, stagger, crit: all $\times 1$. Round once: 23.`,
            ],
            answer: { kind: 'number', value: 23 },
          },
        },
        {
          kind: 'recall',
          prompt: md`List the six stages of the damage pipeline and the multipliers for weak, resist, immune and absorb.`,
          answer: md`Offence ($P \times$ attack or magic), defence ($\times\,100/(100+d)$ and damage taken), element, stagger, crit ($\times 1.5$), round once. Weak 2, resist 0.5, immune 0, absorb −1.`,
        },
        {
          kind: 'explain',
          prompt: md`Why does \`DamageCalc.calculate\` take \`crit_roll\` as a parameter instead of calling \`randf()\` itself?`,
          model: md`It keeps the function pure: the output depends only on the arguments. A test can then force a crit with 0.0 or rule it out with 1.0 and check exact numbers, and a tooltip can show "damage if it crits" without rolling. The game passes \`randf()\` at the one call site that is allowed to be random. The same idea applies to any randomness in game logic: inject the random number (or a seeded RandomNumberGenerator) so the logic can be tested and replayed.`,
        },
      ],
      cards: [
        { id: 'r01-3-c1', kind: 'concept', front: md`Order of the damage pipeline?`, back: md`Offence → defence (and damage taken) → element → stagger → crit → round once; status effects apply afterwards.` },
        { id: 'r01-3-c2', kind: 'compute', front: md`Raw 120 against defence 50 (ratio form). Damage?`, answer: { kind: 'number', value: 80 }, back: md`$120 \times 100/150 = 80$.` },
        { id: 'r01-3-c3', kind: 'concept', front: md`Why is ratio defence easy to balance?`, back: md`Effective HP is $\text{HP}(1 + d/100)$, linear in $d$: every point of defence adds 1% of max HP in survivability, and no amount makes a character immune.` },
        { id: 'r01-3-c4', kind: 'cloze', text: md`Re-applying a status in Shardbound {{}} its timer; it never stacks.`, answers: ['refreshes|resets|restarts'] },
        { id: 'r01-3-c5', kind: 'compute', front: md`Stagger 1.6 and crit 1.5 on the same hit: total multiplier?`, answer: { kind: 'number', value: 2.4 }, back: md`They multiply: $1.6 \times 1.5 = 2.4$ (added bonuses would give 2.1).` },
      ],
    },
  ],
  problems: [
    {
      id: 'r01-p1',
      title: "Lyra's magic",
      type: 'compute',
      difficulty: 1,
      minutes: 4,
      statement: md`Lyra at level 10 has base magic 68. She holds the Star Rod (+18 magic) and has Magic Up at level 3 socketed (+5% magic per level). What is her final magic?`,
      solution: [md`Flat: $68 + 18 = 86$. Percent: $3 \times 5 = 15$.`, md`$86 \times 1.15 = 98.9 \to 99$.`],
      answer: { kind: 'number', value: 99 },
      areas: ['systems'],
    },
    {
      id: 'r01-p2',
      title: 'Effective HP',
      type: 'compute',
      difficulty: 1,
      minutes: 4,
      statement: md`Bram has 418 max HP and defence 55. Using ratio defence, how much raw physical damage can he absorb before falling (his effective HP)? Round to the nearest whole number.`,
      solution: [md`$\text{EHP} = \text{HP}(1 + d/100) = 418 \times 1.55$.`, md`$= 647.9 \approx 648$.`],
      answer: { kind: 'number', value: 648 },
      areas: ['systems', 'math'],
    },
    {
      id: 'r01-p3',
      title: 'Halving damage again',
      type: 'derive',
      difficulty: 2,
      minutes: 8,
      statement: md`With ratio defence $x \cdot 100/(100+d)$, a character has defence 50. How much defence would they need to take half as much damage as they take now?`,
      hints: [md`Halving damage means doubling $100 + d$.`],
      solution: [
        md`Damage is proportional to $1/(100 + d)$. Halving it requires $100 + d' = 2(100 + d)$.`,
        md`So $d' = 100 + 2d = 100 + 100 = 200$.`,
        md`Each halving costs more defence than the last (50 → 200 → 500), even though each point still adds the same effective HP.`,
      ],
      answer: { kind: 'number', value: 200 },
      areas: ['math', 'systems'],
    },
    {
      id: 'r01-p4',
      title: 'Barrier does nothing',
      type: 'debug',
      difficulty: 2,
      minutes: 6,
      statement: md`A teammate rewrote the defence stage. With Barrier (damage taken 50), the target takes no damage at all; without it, damage is normal. Find the bug.

\`\`\`gdscript
var defence := target.get_stat(Rpg.Stat.DEFENCE)
x *= DEFENCE_SCALE / (DEFENCE_SCALE + defence)
x *= target.get_stat(Rpg.Stat.DAMAGE_TAKEN) / 100
\`\`\``,
      solution: [
        md`\`get_stat\` returns an \`int\` and \`100\` is an \`int\`, so the division is integer division: \`100 / 100\` is 1 (looks fine), but \`50 / 100\` is 0, which zeroes the damage.`,
        md`Divide by a float: \`target.get_stat(Rpg.Stat.DAMAGE_TAKEN) / 100.0\`. Godot also shows an *Integer division* warning on the original line; treat that warning as an error in game logic.`,
      ],
      rubric: [md`Identifies integer division`, md`Explains why 100 works and 50 does not`, md`Fixes with a float literal or a cast`],
      areas: ['godot', 'systems'],
    },
    {
      id: 'r01-p5',
      title: 'The sword that kept getting stronger',
      type: 'debug',
      difficulty: 2,
      minutes: 8,
      statement: md`A blacksmith NPC "refines" a weapon by adding +2 attack. After refining Kai's Iron Sword once, the Iron Sword in the shop also shows +14, and after a reload it is back to +12. Explain, and fix the design.

\`\`\`gdscript
func refine(member: PartyMember) -> void:
	var weapon := member.loadout.weapon
	weapon.modifiers.append(StatModifier.make(Rpg.Stat.ATTACK, StatModifier.Kind.FLAT, 2.0))
	member.loadout.emit_changed()
\`\`\``,
      solution: [
        md`\`member.loadout.weapon\` is the shared \`iron_sword.tres\`. Appending to its \`modifiers\` changes the definition for everyone who loaded it, including the shop. The change is never saved to disk, so it vanishes on restart.`,
        md`Refinement is per-character state, so store it in the Loadout: for example \`@export var weapon_refine := 0\` in \`Loadout\`, and in \`apply_to\` add \`StatModifier.make(ATTACK, FLAT, 2.0 * weapon_refine)\`.`,
        md`Alternatively give the character a private copy with \`weapon.duplicate(true)\` when refining, and save that copy; this is heavier, because every refined weapon becomes its own resource.`,
      ],
      rubric: [md`Identifies the shared Resource`, md`Explains both symptoms (shop changes, lost on reload)`, md`Moves the state into the Loadout or a duplicate`],
      areas: ['godot', 'systems'],
    },
    {
      id: 'r01-p6',
      title: 'Crit as an average',
      type: 'compute',
      difficulty: 1,
      minutes: 4,
      statement: md`Kai has crit 15% (Lucky Charm) and crits deal 1.5×. On average, by what factor do crits multiply his damage?`,
      solution: [md`Expected multiplier $= (1 - c) \cdot 1 + c \cdot 1.5 = 1 + 0.5c$.`, md`With $c = 0.15$: $1.075$, a 7.5% average increase.`],
      answer: { kind: 'number', value: 1.075 },
      areas: ['math', 'systems'],
    },
    {
      id: 'r01-p7',
      title: "The golem's elements",
      type: 'design',
      difficulty: 2,
      minutes: 10,
      statement: md`The golem is the dungeon's boss. It resists fire, absorbs lightning and is weak to ice. Explain what each choice teaches the player and how the earlier enemies should prepare them for it.`,
      solution: [
        md`Absorb lightning punishes a habit: bats in the field are weak to lightning, so a player who learned "Thunder is good" gets a visible green heal number and has to look again. It must be readable, so the absorb number must look different (green, "+").`,
        md`Resist fire tells the player that their fire setup (good against slimes and skeletons) is now half as useful without making it useless, so a player who has only Fire can still progress.`,
        md`Weak to ice rewards exploring the shard system: Ice should be available before the boss (a chest in the dungeon), and skeletons resisting ice earlier means the player may have ignored it. A hint in the room before the boss (frost on the floor, an NPC line) makes the discovery fair.`,
      ],
      rubric: [md`Connects each multiplier to something the player learned earlier`, md`Considers readability of absorb and resist`, md`Ensures the counter (ice) is obtainable and hinted`],
      areas: ['systems', 'combat'],
    },
    {
      id: 'r01-p8',
      title: 'Linked partner on paper',
      type: 'code-on-paper',
      difficulty: 1,
      minutes: 6,
      statement: md`Write \`linked_partner(socket: int) -> int\` for \`EquipmentData\`: sockets 0+1, 2+3, … are linked for the first \`linked_pairs\` pairs; return the partner or −1. Then give the results for a 3-socket item with \`linked_pairs = 1\` for sockets 0, 1 and 2.`,
      solution: [
        md`\`\`\`gdscript
func linked_partner(socket: int) -> int:
	if socket >= linked_pairs * 2:
		return -1
	return socket + 1 if socket % 2 == 0 else socket - 1
\`\`\``,
        md`Socket 0 → 1, socket 1 → 0, socket 2 → −1 (it is past the linked range).`,
      ],
      rubric: [md`Handles sockets past the linked range`, md`Even sockets pair upward, odd downward`, md`Avoids integer division surprises`],
      areas: ['godot'],
    },
    {
      id: 'r01-p9',
      title: 'One source or many',
      type: 'concept',
      difficulty: 2,
      minutes: 6,
      statement: md`An alternative StatBlock API has \`add_modifier(mod)\` and \`remove_modifier(mod)\`, and the Loadout calls them for each item on equip and unequip. Describe a concrete bug this design invites and why \`set_source\` avoids it.`,
      solution: [
        md`Each caller must remove exactly what it added. If \`equip\` forgets to remove the old weapon's modifiers before adding the new one (or a passive shard levels up and its old, smaller modifier is not removed), the old modifiers stay and stats creep upward with every swap.`,
        md`\`set_source(loadout, mods)\` replaces the loadout's entire contribution each time. The Loadout recomputes its list from its current state; there is no "previous list" for a caller to forget. The same holds for status effects, whose runtime object is the source.`,
      ],
      rubric: [md`Gives a concrete leak (forgotten removal, level-up)`, md`Explains replacement by source as the fix`],
      areas: ['systems'],
    },
  ],
};
