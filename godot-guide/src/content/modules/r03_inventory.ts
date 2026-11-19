import { md, gd, type Module } from '../types';

// ------------------------------------------------------------------------------------ listings
const ITEM_DATA = gd`
class_name ItemData
extends Resource
## Anything that goes in the bag. The id is also the file name:
## &"potion" lives in res://resources/items/potion.tres.

enum Kind { CONSUMABLE, KEY_ITEM, MATERIAL, EQUIPMENT }
enum Rarity { COMMON, UNCOMMON, RARE }

const FOLDER := "res://resources/items/"

@export var id: StringName = &""
@export var display_name := ""
@export_multiline var description := ""
@export var icon: Texture2D
@export var kind: Kind = Kind.CONSUMABLE
@export var rarity: Rarity = Rarity.COMMON
## How many the bag can hold. 1 means it never stacks (key items).
@export_range(1, 999) var max_stack := 99
## Shop price in gold. Selling pays Shop.SELL_RATE of it; 0 means it cannot be sold.
@export var price := 0

@export_group("Use")
## What using it does. A potion is an AbilityData with one HealEffect (flat 100).
@export var use_ability: AbilityData
@export var usable_in_field := true
@export var usable_in_battle := true

@export_group("Equipment")
## Weapons, armour and accessories: the gear this item puts on when equipped.
@export var equipment: EquipmentData


static func find(item_id: StringName) -> ItemData:
    return load("%s%s.tres" % [FOLDER, item_id]) as ItemData
`;

const POTION_TRES = String.raw`[gd_resource type="Resource" script_class="ItemData" load_steps=7 format=3]

[ext_resource type="Script" path="res://scripts/resources/item_data.gd" id="1_item"]
[ext_resource type="Texture2D" path="res://assets/ui/icons/potion.tres" id="2_icon"]
[ext_resource type="Script" path="res://scripts/resources/ability_data.gd" id="3_abil"]
[ext_resource type="Script" path="res://scripts/resources/effects/ability_effect.gd" id="4_eff"]
[ext_resource type="Script" path="res://scripts/resources/effects/heal_effect.gd" id="5_heal"]

[sub_resource type="Resource" id="Resource_heal"]
script = ExtResource("5_heal")
flat = 100
power = 0.0

[sub_resource type="Resource" id="Resource_use"]
script = ExtResource("3_abil")
id = &"use_potion"
display_name = "Potion"
target = 2
effects = Array[ExtResource("4_eff")]([SubResource("Resource_heal")])

[resource]
script = ExtResource("1_item")
id = &"potion"
display_name = "Potion"
description = "Restores 100 HP."
icon = ExtResource("2_icon")
price = 50
use_ability = SubResource("Resource_use")
`;

const INVENTORY = gd`
class_name Inventory
extends Resource
## The party's bag: a count per item id. GameState owns one; menus listen to the built-in
## changed signal (emit_changed), and pickups and the HUD use the two specific signals.

signal item_added(item: ItemData, amount: int)
signal item_removed(item: ItemData, amount: int)

## id -> count. Ids are dropped when their count reaches 0.
@export var counts: Dictionary[StringName, int] = {}


func count(item: ItemData) -> int:
    return counts.get(item.id, 0)


func has(item: ItemData, amount := 1) -> bool:
    return count(item) >= amount


## Adds up to the item's max_stack and returns how many did NOT fit.
func add(item: ItemData, amount := 1) -> int:
    var added := mini(amount, item.max_stack - count(item))
    if added <= 0:
        return amount
    counts[item.id] = count(item) + added
    item_added.emit(item, added)
    emit_changed()
    return amount - added


func remove(item: ItemData, amount := 1) -> bool:
    if amount <= 0 or not has(item, amount):
        return false
    var left := count(item) - amount
    if left == 0:
        counts.erase(item.id)
    else:
        counts[item.id] = left
    item_removed.emit(item, amount)
    emit_changed()
    return true


## Held items of one kind (-1 for all), sorted for a menu: &"kind", &"name", &"price" or &"count".
func listing(kind := -1, sort_by: StringName = &"kind") -> Array[ItemData]:
    var out: Array[ItemData] = []
    for id: StringName in counts:
        var item := ItemData.find(id)
        if kind == -1 or item.kind == kind:
            out.append(item)
    if sort_by == &"count":
        out.sort_custom(func(a: ItemData, b: ItemData) -> bool: return count(a) > count(b))
    else:
        sort_items(out, sort_by)
    return out


static func sort_items(items: Array[ItemData], sort_by: StringName) -> void:
    match sort_by:
        &"name":
            items.sort_custom(func(a: ItemData, b: ItemData) -> bool: return a.display_name < b.display_name)
        &"price":
            items.sort_custom(func(a: ItemData, b: ItemData) -> bool: return a.price < b.price)
        _:
            # Arrays compare element by element: kind first, then name.
            items.sort_custom(func(a: ItemData, b: ItemData) -> bool: return [a.kind, a.display_name] < [b.kind, b.display_name])
`;

const SLOT_ADD = gd`
# The same add() for a slot-based bag (an Array of ItemStack, fixed capacity), for comparison.
func add(item: ItemData, amount := 1) -> int:
    # 1. Top up existing stacks of this item.
    for stack in slots:
        if stack != null and stack.item == item and amount > 0:
            var put := mini(amount, item.max_stack - stack.count)
            stack.count += put
            amount -= put
    # 2. Start new stacks in empty slots.
    for i in slots.size():
        if slots[i] == null and amount > 0:
            var put := mini(amount, item.max_stack)
            slots[i] = ItemStack.new(item, put)
            amount -= put
    emit_changed()
    return amount  # did not fit: "the bag is full"
`;

const GAME_STATE_ADD = gd`
# scripts/autoload/game_state.gd: add these (r03). r06 saves inventory, gold and flags.
signal gold_changed(gold: int)

var inventory := Inventory.new()
var gold := 0:
    set(value):
        gold = maxi(0, value)
        gold_changed.emit(gold)
## Story and world flags: opened chests, finished quests. Missing means false.
var flags: Dictionary[StringName, bool] = {}


func has_flag(id: StringName) -> bool:
    return flags.get(id, false)


func set_flag(id: StringName, value := true) -> void:
    flags[id] = value
`;

const ITEM_USE = gd`
class_name ItemUse
extends RefCounted
## Using an item, from the field menu or from tactical mode. Battles happen in the world, so the
## party's Combatants always exist and both paths run the same effects. In battle, the battle
## system (k04) also spends one ATB segment before calling use().


static func can_use(item: ItemData, in_battle: bool) -> bool:
    if item.use_ability == null:
        return false
    return item.usable_in_battle if in_battle else item.usable_in_field


static func use(bag: Inventory, item: ItemData, user: Combatant, targets: Array[Combatant], in_battle: bool) -> bool:
    if not can_use(item, in_battle) or not bag.has(item):
        return false
    bag.remove(item)
    item.use_ability.execute(user, targets)
    return true
`;

const BAG_LABEL = gd`
extends Label
## A text bag for testing. 1 adds a potion, 2 adds three crystals, 3 uses a potion on Kai,
## S cycles the sort order. Redraws only on the inventory's changed signal.

const POTION := preload("res://resources/items/potion.tres")
const CRYSTAL := preload("res://resources/items/earth_crystal.tres")
const SORTS: Array[StringName] = [&"kind", &"name", &"count", &"price"]

## Kai's Combatant in the test scene.
@export var kai: Combatant

var _sort := 0


func _ready() -> void:
    GameState.inventory.changed.connect(_redraw)
    GameState.inventory.item_added.connect(func(item: ItemData, n: int) -> void: print("+%d %s" % [n, item.display_name]))
    _redraw()


func _unhandled_key_input(event: InputEvent) -> void:
    var key := event as InputEventKey
    if key == null or not key.pressed or key.echo:
        return
    match key.keycode:
        KEY_1:
            GameState.inventory.add(POTION)
        KEY_2:
            GameState.inventory.add(CRYSTAL, 3)
        KEY_3:
            var targets: Array[Combatant] = [kai]
            if not ItemUse.use(GameState.inventory, POTION, kai, targets, false):
                print("no potion to use")
        KEY_S:
            _sort = (_sort + 1) % SORTS.size()
            _redraw()


func _redraw() -> void:
    var lines := PackedStringArray(["Bag (sorted by %s)" % SORTS[_sort]])
    for item in GameState.inventory.listing(-1, SORTS[_sort]):
        lines.append("%-14s x%d" % [item.display_name, GameState.inventory.count(item)])
    text = "\n".join(lines)
`;

const LOOT_ENTRY = gd`
class_name LootEntry
extends Resource
## One line of a loot table.

@export var item: ItemData
## Relative chance among the table's weighted entries.
@export var weight := 10.0
@export var min_count := 1
@export var max_count := 1
`;

const LOOT_TABLE = gd`
class_name LootTable
extends Resource
## What an enemy or a chest drops. Guaranteed entries always drop. Then the table makes
## rolls weighted picks, where "nothing" is one of the outcomes with its own weight.

@export var guaranteed: Array[LootEntry] = []
@export var weighted: Array[LootEntry] = []
## Weight of "nothing" in each weighted pick.
@export var nothing_weight := 0.0
@export_range(0, 5) var rolls := 1
@export var gold_min := 0
@export var gold_max := 0


## Returns {ItemData: count}. The caller passes the RandomNumberGenerator, so tests and
## replays can use a fixed seed.
func roll(rng: RandomNumberGenerator) -> Dictionary:
    var drops := {}
    for entry in guaranteed:
        _add(drops, entry, rng)
    for i in rolls:
        var entry := _pick(rng)
        if entry != null:
            _add(drops, entry, rng)
    return drops


func roll_gold(rng: RandomNumberGenerator) -> int:
    return rng.randi_range(gold_min, gold_max)


## The chance that one weighted pick gives this entry: its share of the total weight.
func chance_of(entry: LootEntry) -> float:
    var total := _total_weight()
    return entry.weight / total if total > 0.0 else 0.0


func _total_weight() -> float:
    var total := nothing_weight
    for entry in weighted:
        total += entry.weight
    return total


## Walk along the weights: a number in [0, total) lands in exactly one entry's share.
func _pick(rng: RandomNumberGenerator) -> LootEntry:
    var r := rng.randf() * _total_weight()
    for entry in weighted:
        r -= entry.weight
        if r < 0.0:
            return entry
    return null  # it landed in the "nothing" share


func _add(drops: Dictionary, entry: LootEntry, rng: RandomNumberGenerator) -> void:
    var n := rng.randi_range(entry.min_count, entry.max_count)
    drops[entry.item] = drops.get(entry.item, 0) + n
`;

const PICKUP = gd`
class_name Pickup
extends Area2D
## An item lying in the world. Collision layer "pickup" (8), mask "player" (2), so the only
## body that can enter is the controlled character.

@export var item: ItemData
@export var count := 1

@onready var sprite: Sprite2D = $Sprite2D


func _ready() -> void:
    sprite.texture = item.icon
    body_entered.connect(_on_body_entered)
    # A short hop, so a drop reads as a drop and not as scenery.
    var tween := create_tween()
    tween.tween_property(sprite, "position:y", -8.0, 0.15).set_ease(Tween.EASE_OUT).set_trans(Tween.TRANS_QUAD)
    tween.tween_property(sprite, "position:y", 0.0, 0.25).set_trans(Tween.TRANS_BOUNCE).set_ease(Tween.EASE_OUT)


func _on_body_entered(_body: Node2D) -> void:
    var left := GameState.inventory.add(item, count)
    if left == count:
        return  # no room for this item: leave it on the ground
    count = left
    if count == 0:
        queue_free()
`;

const LOOT_DROPPER = gd`
class_name LootDropper
extends Node
## On death, rolls the enemy's loot table and scatters pickups around the body.
## A child of the enemy's Character, next to its Combatant and HealthComponent.

@export var health: HealthComponent
@export var table: LootTable
@export var pickup_scene: PackedScene

var _rng := RandomNumberGenerator.new()


func _ready() -> void:
    _rng.randomize()
    health.died.connect(_on_died)


func _on_died() -> void:
    var origin := (get_parent() as Node2D).global_position
    var drops := table.roll(_rng)
    var i := 0
    for item: ItemData in drops:
        var pickup := pickup_scene.instantiate() as Pickup
        pickup.item = item
        pickup.count = drops[item]
        # Spread drops on a small spiral (2.4 rad apart) so they do not overlap.
        pickup.position = origin + Vector2.from_angle(i * 2.4) * (6.0 + 3.0 * i)
        # Add it to the room, not to the dying enemy, and not in the middle of physics.
        get_parent().get_parent().add_child.call_deferred(pickup)
        i += 1
    GameState.gold += table.roll_gold(_rng)
`;

const CHEST = gd`
class_name Chest
extends Area2D
## A chest that opens once per save. Its flag lives in GameState, so leaving and re-entering the
## room, or loading a save (r06), keeps it open. Collision layer "interactable" (7).
## Sprite2D child uses objects.png (Hframes 8, Vframes 3): frame 0 closed, 1 open.

@export var contents: LootTable
## Unique per chest. Leave empty to derive one from the room's file and this node's path.
@export var flag_id: StringName = &""

@onready var sprite: Sprite2D = $Sprite2D


func _ready() -> void:
    if flag_id == &"":
        flag_id = StringName("%s:%s" % [owner.scene_file_path, owner.get_path_to(self)])
    sprite.frame = 1 if GameState.has_flag(flag_id) else 0


## Called by the player's interaction (r04) when they press interact facing the chest.
func interact(_by: Node) -> void:
    if GameState.has_flag(flag_id):
        return
    # Set the flag first: even if interact() runs twice in one frame, the chest pays once.
    GameState.set_flag(flag_id)
    sprite.frame = 1
    var rng := RandomNumberGenerator.new()
    rng.randomize()
    var drops := contents.roll(rng)
    for item: ItemData in drops:
        GameState.inventory.add(item, drops[item])
    GameState.gold += contents.roll_gold(rng)
`;

const LOOT_TEST = gd`
extends Node
## Rolls the slime table 10 000 times with a fixed seed and prints observed against expected.

const SLIME_LOOT := preload("res://resources/loot/slime.tres")
const ROLLS := 10000


func _ready() -> void:
    var rng := RandomNumberGenerator.new()
    rng.seed = 42
    var seen := {}
    for i in ROLLS:
        var drops := SLIME_LOOT.roll(rng)
        for item: ItemData in drops:
            seen[item] = seen.get(item, 0) + 1
    for entry in SLIME_LOOT.weighted:
        var observed: float = seen.get(entry.item, 0) / float(ROLLS)
        print("%-14s expected %.3f  observed %.3f" % [entry.item.display_name, SLIME_LOOT.chance_of(entry), observed])
`;

const SHOP_DATA = gd`
class_name ShopData
extends Resource
## One shop: what it sells and how its prices compare with the base prices.

@export var display_name := ""
@export var stock: Array[ItemData] = []
## Multiplies buy prices: a remote outpost might charge 1.25.
@export var price_scale := 1.0
`;

const SHOP = gd`
class_name Shop
extends RefCounted
## Buying and selling. Every check happens before any change, so a purchase either completes
## fully or does nothing.

const SELL_RATE := 0.5


static func buy_price(shop: ShopData, item: ItemData) -> int:
    return roundi(item.price * shop.price_scale)


static func sell_price(item: ItemData) -> int:
    return floori(item.price * SELL_RATE)


## How many the party can buy right now: limited by gold and by room in the bag.
static func max_buy(shop: ShopData, item: ItemData) -> int:
    var price := buy_price(shop, item)
    var by_gold := item.max_stack if price == 0 else floori(float(GameState.gold) / price)
    return mini(by_gold, item.max_stack - GameState.inventory.count(item))


static func buy(shop: ShopData, item: ItemData, amount: int) -> bool:
    if amount <= 0 or amount > max_buy(shop, item):
        return false
    GameState.gold -= buy_price(shop, item) * amount
    GameState.inventory.add(item, amount)
    return true


static func sell(item: ItemData, amount: int) -> bool:
    if item.kind == ItemData.Kind.KEY_ITEM or item.price <= 0 or not GameState.inventory.has(item, amount):
        return false
    GameState.inventory.remove(item, amount)
    GameState.gold += sell_price(item) * amount
    return true
`;

const SHOP_MENU = gd`
extends Control
## A minimal shop screen. Children: ItemList "List", Label "Gold", OptionButton "Filter",
## OptionButton "Sort", Button "Mode". Activating a row (Enter, double click) buys or sells one.

@export var shop: ShopData

var selling := false
var _shown: Array[ItemData] = []

@onready var list: ItemList = $List
@onready var gold_label: Label = $Gold
@onready var filter: OptionButton = $Filter
@onready var sort: OptionButton = $Sort
@onready var mode_button: Button = $Mode


func _ready() -> void:
    for label in ["All", "Consumables", "Key items", "Materials", "Equipment"]:
        filter.add_item(label)
    for label in ["Kind", "Name", "Price"]:
        sort.add_item(label)
    filter.item_selected.connect(func(_index: int) -> void: refresh())
    sort.item_selected.connect(func(_index: int) -> void: refresh())
    mode_button.pressed.connect(_toggle_mode)
    list.item_activated.connect(_on_item_activated)
    GameState.gold_changed.connect(func(_gold: int) -> void: refresh())
    GameState.inventory.changed.connect(refresh)
    refresh()
    list.grab_focus()


func refresh() -> void:
    var kind := filter.selected - 1  # entry 0 is "All"; the rest follow ItemData.Kind
    var source: Array[ItemData] = GameState.inventory.listing() if selling else shop.stock
    _shown.clear()
    for item in source:
        var sellable := item.price > 0 and item.kind != ItemData.Kind.KEY_ITEM
        if (kind < 0 or item.kind == kind) and (sellable or not selling):
            _shown.append(item)
    Inventory.sort_items(_shown, [&"kind", &"name", &"price"][sort.selected])
    list.clear()
    for item in _shown:
        var price := Shop.sell_price(item) if selling else Shop.buy_price(shop, item)
        var row := list.add_item("%s  x%d  %d G" % [item.display_name, GameState.inventory.count(item), price], item.icon)
        list.set_item_disabled(row, not selling and Shop.max_buy(shop, item) <= 0)
    gold_label.text = "%d G" % GameState.gold
    mode_button.text = "Buy" if selling else "Sell"


func _toggle_mode() -> void:
    selling = not selling
    refresh()


func _on_item_activated(index: int) -> void:
    var item := _shown[index]
    if selling:
        Shop.sell(item, 1)
    else:
        Shop.buy(shop, item, 1)
`;

// --------------------------------------------------------------------------------------- module
export const MODULE: Module = {
  id: 'r03',
  part: 'rpg',
  order: 3,
  title: 'Items, inventory, loot and shops',
  summary: 'ItemData for consumables, key items, materials and equipment; an inventory as counts per item with signals; using items in and out of battle; weighted loot tables with guaranteed drops; once-only chests tied to save flags; shops, gold and the economy behind prices.',
  relevance: md`Everything the player picks up, carries, uses, buys and sells in Shardbound goes through this module: the potion Lyra drinks in tactical mode, the Earth Crystal a slime drops, the chest in the ruins that stays open after a reload, and the price of the Rune Blade in the outpost shop. Items reuse r02's abilities for their effects and wrap r01's EquipmentData, the save system (r06) stores the inventory, gold and flags, and the menus (r05) present them with the sorting and filtering built here.`,
  prereqs: ['r01', 'g04'],
  areas: ['systems', 'godot', 'math'],
  lessons: [
    // ============================================================================ r03-1
    {
      id: 'r03-1',
      title: 'Items and the inventory',
      minutes: 40,
      objectives: [
        'Define ItemData for consumables, key items, materials and equipment, with a stack limit and a price.',
        'Choose between an inventory of slots and a dictionary of counts, and implement the dictionary version with signals.',
        'Use items in the field and in battle through the same ability effects.',
        'Sort and filter the inventory for a menu without changing how it is stored.',
      ],
      cells: [
        {
          kind: 'text',
          md: md`Three slimes later the bag holds 4 Potions, 7 Earth Crystals and an Old Key. In tactical mode the player opens *Items*, picks a Potion, chooses Bram, and he heals 100 HP; one ATB segment is spent and the count drops to 3. Out of battle, the pause menu lists the same items sorted by kind, and the key cannot be sold or thrown away.

Under that are three questions every RPG answers:

- **What is an item?** A definition: name, icon, kind, stack limit, price, and what using it does.
- **What is the bag?** A data structure holding how many of each item the party has, which tells the UI when it changes.
- **What does using an item do?** In Shardbound, exactly what an ability does: a Potion is an \`AbilityData\` with one \`HealEffect\`. r02's effects already cover healing, statuses and damage, so items need no effect code of their own.`,
        },
        {
          kind: 'callout',
          tone: 'definition',
          title: 'Item kinds',
          md: md`- **Consumable**: used up when used (Potion, Ether, Phoenix Feather). Usable in the field, in battle, or both.
- **Key item**: story progress (Old Key, Ruins Map). Stack of 1, cannot be sold.
- **Material**: dropped by enemies, sold for gold or used for crafting (Earth Crystal, Storm Crystal, Ember Crystal).
- **Equipment**: a weapon, armour or accessory. The item wraps an r01 \`EquipmentData\`: the item is how gear sits in the bag and the shop; the \`EquipmentData\` is what it does when worn.

**Stack limit** (\`max_stack\`): how many of one item the bag holds (99 for consumables and materials, 1 for key items). **Rarity** is a label for players (common, uncommon, rare) shown as a colour; it does not set drop chances, which lesson 2 does with weights.`,
        },
        { kind: 'assets', ids: ['icons', 'ui_panel', 'sfx_menu_move', 'sfx_menu_select'], note: md`Each item's *Icon* is an \`AtlasTexture\` cut from \`icons.png\`: in the Inspector choose **New AtlasTexture**, set *Atlas* to \`icons.png\` and *Region* to the 16×16 cell. Saving each AtlasTexture as its own \`.tres\` (for example \`assets/ui/icons/potion.tres\`) lets many resources share it.` },
        { kind: 'code', file: 'scripts/resources/item_data.gd', code: ITEM_DATA, note: md`\`find()\` turns an id into the resource by a naming convention: the id is the file name. Godot caches loaded resources, so calling it often costs a dictionary lookup, not a disk read. The convention is what lets the inventory and the save file store plain ids.` },
        { kind: 'code', file: 'resources/items/potion.tres', lang: 'tscn', code: POTION_TRES, note: md`The use ability is a built-in sub-resource with \`target = 2\` (\`SINGLE_ALLY\`) and one \`HealEffect\` with \`flat = 100\` and \`power = 0\`, so it heals 100 whoever drinks it. An Ether would use an MP effect next to HP in k04; a Phoenix Feather a revive effect. Each is one more small \`AbilityEffect\`.` },
        {
          kind: 'text',
          md: md`### Slots or counts

There are two common ways to store a bag, and the choice shapes the game.

**An array of slots**, each holding an item and a count (an \`ItemStack\`), with a fixed capacity. Players arrange items themselves, the bag can be full, and a stack that reaches its limit continues in a new slot. Survival games and Diablo-like loot games use this because inventory space is itself a resource to manage, and because each slot can carry per-copy state (durability, random affixes).

**A dictionary from item id to count.** One entry per kind of item, no capacity, no arrangement: the menu decides the order by sorting. Most JRPGs work this way: the player never manages space, only quantities. It is also simpler: \`count\` is one lookup, \`add\` cannot fail because of fragmentation, and a save file is a list of ids and numbers.

Shardbound uses counts. Items have no per-copy state (shards in gear live in the Loadout, r01), the game is not about managing space, and every sort order the menus want can be computed from the counts. The cost: the player cannot hand-arrange the bag, and a per-copy feature added later (a sword with a random bonus) would need its own instance resource, as r01 did for shards.`,
        },
        { kind: 'code', file: 'scripts/rpg/inventory.gd', code: INVENTORY, note: md`\`Inventory\` is a Resource so the save system can write it. It does not declare \`signal changed\` (Resource already has one) but calls \`emit_changed()\`. \`item_added\` carries what was added, for the "+3 Earth Crystal" message; \`changed\` just says "redraw", for menus.` },
        { kind: 'code', file: 'scripts/rpg/slot_inventory.gd', code: SLOT_ADD, fragment: true, note: md`For comparison, \`add\` in a slot bag needs two passes (fill existing stacks, then start new ones) and can fail because the slots are full, which is a game rule the player has to be told about.` },
        {
          kind: 'viz',
          viz: { type: 'rpg.inventory' },
          task: md`Add a few Potions and Crystals, use a Potion, then press **+60 Potions** twice and read the log: how many did not fit? Switch the model to **slots (8)** and repeat: where does the overflow go now, and what happens when you add the Iron Sword to a full bag? Try each sort order and filter.`,
          caption: md`The log shows the signals in the order the Inventory emits them. Under the list is the data as it would sit in memory: a dictionary of counts, or an array of slots.`,
        },
        {
          kind: 'check',
          q: md`The bag holds 95 Potions (\`max_stack\` 99). A chest gives 8. What does \`add(potion, 8)\` return, and what is in the bag afterwards?`,
          options: [md`Returns 4; the bag holds 99`, md`Returns 0; the bag holds 103`, md`Returns 8; the bag still holds 95`, md`Returns 4; the bag holds 95`],
          answer: 0,
          explain: md`\`added = mini(8, 99 - 95) = 4\`, so the count becomes 99 and \`8 - 4 = 4\` is returned as "did not fit". The caller decides what to do with the rest: a pickup stays on the ground, a chest can leave a pickup next to itself.`,
        },
        {
          kind: 'text',
          md: md`### Using items in and out of battle

Because Shardbound's battles happen in the world, the party's Characters and their \`Combatant\`s always exist. Using an item from the pause menu and from tactical mode can therefore run the same code: check that the item is usable here, remove one, and execute its ability on the targets. What differs is around it: in battle the battle system (k04) first spends one ATB segment and the use plays an animation; in the field it is instant.

Remove the item **before** applying the effect. If the effect triggers something that opens a menu or ends the battle, the bag is already correct, and a double activation in one frame cannot use one Potion twice.`,
        },
        { kind: 'code', file: 'scripts/rpg/item_use.gd', code: ITEM_USE },
        { kind: 'code', file: 'scripts/autoload/game_state.gd', code: GAME_STATE_ADD, fragment: true, note: md`The gold setter clamps at 0 and emits \`gold_changed\` for the HUD. \`flags\` is used by chests in lesson 2 and by quests in r04. If your \`GameState\` already has some of these from another module, keep one copy.` },
        {
          kind: 'numeric',
          q: md`An ItemList shows the bag sorted by kind, then name (\`CONSUMABLE\` = 0, \`KEY_ITEM\` = 1, \`MATERIAL\` = 2, \`EQUIPMENT\` = 3). The bag holds Earth Crystal, Potion, Old Key, Iron Sword and Ether. At which position (1 = top) is the Old Key?`,
          answer: { kind: 'number', value: 3 },
          explain: md`Consumables first, by name: Ether, Potion. Then key items: Old Key. Then materials (Earth Crystal), then equipment (Iron Sword). The comparison \`[a.kind, a.display_name] < [b.kind, b.display_name]\` compares kinds and only uses names to break ties.`,
        },
        {
          kind: 'steps',
          title: 'Make items and a bag',
          steps: [
            md`Create \`item_data.gd\`, \`inventory.gd\` and \`item_use.gd\`, and add the lines to \`game_state.gd\`.`,
            md`Create \`resources/items/potion.tres\` (**Create New → Resource… → ItemData**): *Id* \`potion\`, *Price* 50. Under *Use*, set *Use Ability* to **New AbilityData** with *Target* Single Ally and one **New HealEffect** with *Flat* 100 and *Power* 0. For the icon, use **New AtlasTexture** with the icons sheet and the potion's region.`,
            md`Create \`earth_crystal.tres\`: *Id* \`earth_crystal\`, *Kind* Material, *Price* 20, no use ability. Check that each file name matches its id.`,
            md`Make a test scene with a \`Label\` (script below) and Kai's Character with his \`Combatant\`; drag that Combatant into the label's *Kai* export. Run with **F6**, press **1** a few times, **2**, **3**, and **S**.`,
          ],
          result: md`The label lists Potions and Earth Crystals with counts, the Output prints "+1 Potion" and "+3 Earth Crystal", **3** lowers the Potion count and heals Kai, and **S** re-sorts without changing the counts.`,
          troubleshoot: [
            { problem: md`\`ItemData.find\` returns \`null\` and the label errors.`, fix: md`The file name does not match the id (\`Potion.tres\` versus \`potion\`; names are case-sensitive on export), or the file is not in \`resources/items/\`.` },
            { problem: md`Using a Potion removes it but nothing heals.`, fix: md`The use ability has no effects, or its \`HealEffect\` still has *Flat* 0 and *Power* 1 (healing by magic). Open the potion's sub-resources in the Inspector and check.` },
          ],
        },
        { kind: 'code', file: 'scripts/tests/bag_label.gd', code: BAG_LABEL },
        {
          kind: 'build',
          ch: {
            id: 'r03-1-build',
            title: 'An item menu with filters',
            goal: md`Build a pause-menu item list with an \`ItemList\`: icons, names and counts, filter buttons per kind, a sort option, and using a consumable on a chosen party member.`,
            requirements: [
              md`The list shows each held item with its icon and count and updates through \`changed\`, never by polling.`,
              md`Filters for All, Consumables, Key items and Materials; the current filter survives a refresh after using an item.`,
              md`Activating a consumable that is usable in the field uses it on the selected party member; key items and materials cannot be used.`,
              md`When the last Potion is used, its row disappears and the selection moves to a valid row instead of pointing past the end.`,
            ],
            hints: [
              md`Keep an \`Array[ItemData]\` of the rows currently shown, as \`_shown\`, so a row index maps to an item.`,
              md`\`ItemList.select(i)\` sets the selection; clamp \`i\` to \`item_count - 1\` after a refresh.`,
              md`\`Inventory.listing(kind, sort_by)\` already filters and sorts.`,
            ],
            solution: [
              {
                file: 'ui/item_menu.gd',
                code: gd`
extends Control
## Children: ItemList "List", OptionButton "Filter", OptionButton "Target" (party names).

## The party's Combatants, in the same order as the Target option button.
@export var party: Array[Combatant] = []

var _shown: Array[ItemData] = []

@onready var list: ItemList = $List
@onready var filter: OptionButton = $Filter
@onready var target: OptionButton = $Target


func _ready() -> void:
    for label in ["All", "Consumables", "Key items", "Materials"]:
        filter.add_item(label)
    for member in party:
        target.add_item(member.get_parent().name)
    filter.item_selected.connect(func(_index: int) -> void: refresh())
    list.item_activated.connect(_on_item_activated)
    GameState.inventory.changed.connect(refresh)
    refresh()


func refresh() -> void:
    var selected := list.get_selected_items()
    var keep := selected[0] if not selected.is_empty() else 0
    _shown = GameState.inventory.listing(filter.selected - 1)
    list.clear()
    for item in _shown:
        list.add_item("%s  x%d" % [item.display_name, GameState.inventory.count(item)], item.icon)
    if list.item_count > 0:
        list.select(mini(keep, list.item_count - 1))


func _on_item_activated(index: int) -> void:
    var item := _shown[index]
    var member := party[target.selected]
    var targets: Array[Combatant] = [member]
    ItemUse.use(GameState.inventory, item, member, targets, false)
`,
              },
            ],
            explain: md`\`refresh\` rebuilds the whole list each time. With a few dozen items that is instant, and it avoids keeping list rows and inventory entries in sync by hand. The selection is restored by index and clamped, which handles a row that disappears. In r05 this becomes a gamepad-friendly screen with the pixel-art panel.`,
          },
        },
        {
          kind: 'paper',
          problem: {
            id: 'r03-1-paper',
            title: 'Durability',
            type: 'design',
            difficulty: 2,
            minutes: 10,
            statement: md`A designer wants weapons to lose durability with use, so two Iron Swords in the bag can be in different states. What breaks in the dictionary-of-counts inventory, and how would you change the data model with as little disruption as possible?`,
            solution: [
              md`Counts assume every copy of an id is identical. Two swords with durability 12 and 40 cannot be "Iron Sword × 2".`,
              md`Keep the counts for stackable items and add a second store for unique items: an \`Array[ItemInstance]\`, where \`ItemInstance\` is a small Resource with \`data: ItemData\` and \`durability: int\`. Equipment goes there; potions and crystals stay counted.`,
              md`The equipment screen and the save file read the instance list; listing for menus merges both views. Loadout slots then hold \`ItemInstance\`s instead of \`EquipmentData\` directly. This is the same definition/instance split r01 used for shards.`,
            ],
            rubric: [md`Identifies that counts cannot represent per-copy state`, md`Introduces an instance resource referencing the definition`, md`Keeps counts for stackables instead of converting everything`, md`Mentions the effect on saves and the loadout`],
          },
        },
        {
          kind: 'recall',
          prompt: md`What does \`Inventory.add\` return, and why does \`Inventory\` call \`emit_changed()\` instead of declaring a \`changed\` signal?`,
          answer: md`The number that did not fit (0 when everything was added). \`Resource\` already declares \`changed\`; \`emit_changed()\` fires it, and declaring it again is an error.`,
        },
        {
          kind: 'explain',
          prompt: md`Why can a Potion be an \`AbilityData\` with a \`HealEffect\` instead of having its own item-effect code?`,
          model: md`Using an item and using an ability are the same operation with different costs: pick targets, apply effects. Reusing \`AbilityData\` gives items targeting (single ally, whole party), all existing effects (heal, statuses, damage for a bomb) and tooltips for free, and any new effect written for abilities works on items immediately. The item adds only what is item-specific: the count, the price, where it can be used, and that using it consumes one. One effect system also means one place to fix bugs and balance numbers.`,
        },
      ],
      cards: [
        { id: 'r03-1-c1', kind: 'concept', front: md`Slots vs counts for an inventory: one advantage of each.`, back: md`Slots: per-copy state and space management as a game mechanic. Counts: simple, no capacity puzzle, one lookup per item, any sort order computed by the menu.` },
        { id: 'r03-1-c2', kind: 'compute', front: md`Bag has 97 Potions (max 99). \`add(potion, 5)\` returns?`, answer: { kind: 'number', value: 3 }, back: md`Room for 2, so 3 did not fit.` },
        { id: 'r03-1-c3', kind: 'cloze', text: md`Sort by kind then name: \`return [a.kind, a.display_name] {{}} [b.kind, b.display_name]\`.`, answers: ['<'] },
        { id: 'r03-1-c4', kind: 'concept', front: md`Why remove the item before applying its effect?`, back: md`The bag is already correct if the effect triggers anything else, and two activations in one frame cannot use one item twice.` },
        { id: 'r03-1-c5', kind: 'concept', front: md`How does an equipment item relate to EquipmentData?`, back: md`The ItemData wraps it (\`equipment\` field): the item is how gear sits in bags and shops; the EquipmentData is what it does when worn.` },
      ],
    },
    // ============================================================================ r03-2
    {
      id: 'r03-2',
      title: 'Loot tables and chests',
      minutes: 40,
      objectives: [
        'Write a loot table as a Resource with guaranteed drops, weighted picks and a weight for "nothing".',
        'Compute drop chances $w_i / \\sum w$, expected drops, and the chance of at least one drop in $n$ kills.',
        'Spawn pickups from a dying enemy and collect them into the inventory.',
        'Make chests open once per save with a flag in GameState.',
      ],
      cells: [
        {
          kind: 'text',
          md: md`A slime bursts and two icons hop out: an Earth Crystal and, rarely, an Ether. A chest in the ruins always holds a Phoenix Feather and the Ruins Map. Leave the room and come back: the slimes are back, the chest is still open.

Two different rules are at work. **Enemy drops** are random, so a player who fights more gets more, and rare items create small moments of luck. **Chests** are fixed and happen once, so the world feels authored and a guide can say "the map is in the ruins". Both are described by the same data, a loot table; the chest just has only guaranteed entries and a flag that remembers it was opened.

m05 covers the probability behind drop rates in general. Here it becomes a Resource you edit in the Inspector and code that turns it into pickups.`,
        },
        {
          kind: 'callout',
          tone: 'definition',
          title: 'Loot table',
          md: md`- **Guaranteed** entries always drop.
- **Weighted** entries compete in each of \`rolls\` picks. Entry $i$ with weight $w_i$ is picked with probability $p_i = w_i / W$, where $W$ is the sum of all weights **including** the weight of "nothing".
- Each entry drops between \`min_count\` and \`max_count\` copies.
- **Gold** is a uniform random amount between \`gold_min\` and \`gold_max\`.

The slime table: Earth Crystal 30, Potion 15, Ether 5, nothing 50 ($W = 100$), one roll, 3 to 7 gold.`,
        },
        { kind: 'code', file: 'scripts/resources/loot_entry.gd', code: LOOT_ENTRY },
        { kind: 'code', file: 'scripts/resources/loot_table.gd', code: LOOT_TABLE, note: md`\`_pick\` walks along the weights: a random number in $[0, W)$ lands in exactly one entry's share, and if it lands past all the entries it is in the "nothing" share. Godot 4.3+ also has \`RandomNumberGenerator.rand_weighted(weights)\`, which returns an index; the hand-written loop makes the "nothing" share explicit and reads more clearly in a lesson. Weights instead of percentages mean adding an entry never requires re-balancing the others to sum to 100.` },
        {
          kind: 'derive',
          title: 'how many kills until the rare drop',
          goal: md`Ether drops with probability $p = 0.05$ per slime. Find the chance of at least one Ether in $n$ kills, and the number of kills a player needs for a 90% chance.`,
          steps: [
            {
              md: md`Each kill is independent. The chance of **no** Ether in one kill is $1 - p$.`,
              choose: {
                prompt: md`The chance of no Ether in $n$ kills is…`,
                options: [md`$(1 - p)^n$`, md`$1 - np$`, md`$n(1 - p)$`],
                answer: 0,
                explain: md`Independent events multiply. $1 - np$ is a first-order approximation that goes negative for large $n$ ($1 - 25 \times 0.05 < 0$ at 25 kills), which is impossible for a probability.`,
              },
            },
            { md: md`So $P(\text{at least one}) = 1 - (1 - p)^n$. For 10 kills: $1 - 0.95^{10} \approx 0.40$. The *expected* number of kills to the first Ether is $1/p = 20$, but 20 kills give only $1 - 0.95^{20} \approx 64\%$.` },
            {
              md: md`For a 90% chance, solve $(1 - p)^n \le 0.1$: $$n \ge \frac{\ln 0.1}{\ln(1 - p)} = \frac{-2.303}{-0.0513} \approx 44.9,$$ so 45 kills. One player in ten still has no Ether after 45 slimes.`,
            },
          ],
          takeaway: md`Rare drops have long tails. If an item is needed for progress, make it guaranteed somewhere (a chest, a quest) or add bad-luck protection, such as raising its weight a little after each kill without it.`,
        },
        {
          kind: 'viz',
          viz: { type: 'rpg.loot' },
          task: md`Click the game and fight the slimes (**WASD** to move, **J** to attack), walk over the drops, and open the chest with **F**. Press **Leave and re-enter**: what comes back and what does not? Then press **Simulate 1000 kills**, compare observed with expected, and raise the Ether weight until 10 kills give at least a 50% chance of one.`,
          caption: md`The panel shows each entry's chance $w_i/W$ and the chance of at least one in 10 kills. Pickups go into the bag on contact; the chest's flag lives in a pretend \`GameState.flags\`, shown at the bottom.`,
        },
        {
          kind: 'numeric',
          q: md`With the slime table (Earth Crystal 30, Potion 15, Ether 5, nothing 50, one roll), how many Earth Crystals do 40 kills give on average?`,
          answer: { kind: 'number', value: 12 },
          explain: md`$p = 30/100 = 0.3$ per kill, one copy each time: $40 \times 0.3 = 12$.`,
        },
        {
          kind: 'text',
          md: md`### From roll to pickup

When an enemy dies, a \`LootDropper\` component rolls the table and spawns a \`Pickup\` per item, spread on a small spiral so they do not overlap. A pickup is an \`Area2D\` on the *pickup* layer whose mask only sees the *player* layer, so it needs no "is this the player?" check: the physics layers do the filtering (c05).

Two details matter. The pickups are added to the **room**, not to the enemy, because the enemy is about to be freed and would take its children with it. And they are added with \`call_deferred\`, because \`died\` is emitted in the middle of the physics step, and Godot does not allow adding physics bodies to the tree while it is resolving collisions.

Drops can also go straight into the bag without pickups. That is faster and some games prefer it; pickups make the reward visible in the world and give the player a reason to move after a fight.`,
        },
        { kind: 'code', file: 'scenes/components/pickup.gd', code: PICKUP },
        { kind: 'code', file: 'scenes/components/loot_dropper.gd', code: LOOT_DROPPER, note: md`The dropper owns its own \`RandomNumberGenerator\`, seeded randomly. A test or replay can set \`_rng.seed\` to get the same drops every time, which is also how you reproduce a bug report about a drop.` },
        {
          kind: 'text',
          md: md`### Chests that stay open

A chest opens once **per save**, not once per scene load. A variable on the chest node would reset every time the room is loaded, so the state has to live where the rest of the persistent world state lives: \`GameState.flags\`, which r06 writes into the save file.

Each chest needs a unique flag id. Typing them by hand (\`chest_ruins_01\`) is explicit and survives renaming nodes, but two chests copied and pasted can share one id, and then opening one opens both. Deriving it from the room's file path and the node path is automatic and unique, but renaming the node or moving the room file changes the id and makes opened chests closed again in old saves. The listing uses the explicit id when set and derives one otherwise; before release (p03), freeze the ids by filling them in.`,
        },
        { kind: 'code', file: 'scenes/objects/chest.gd', code: CHEST },
        {
          kind: 'check',
          q: md`A playtester opens a chest, saves, loads the save, and the chest is closed again and can be opened a second time. Which is the most likely cause?`,
          options: [
            md`The flag is set in GameState but r06's save does not write \`flags\`, or the chest's derived id changed because the node was renamed`,
            md`The chest sets \`sprite.frame = 1\` after granting the items`,
            md`\`RandomNumberGenerator\` was not seeded`,
            md`The chest is on the wrong collision layer`,
          ],
          answer: 0,
          explain: md`After loading, \`_ready\` reads the flag. If the flag was not saved, or the chest now computes a different id than the one saved, \`has_flag\` is false. The order of frame and items changes nothing across a reload, and the random seed affects only what is inside.`,
        },
        {
          kind: 'steps',
          title: 'Slimes that drop loot, and a chest',
          steps: [
            md`Create \`loot_entry.gd\`, \`loot_table.gd\`, \`pickup.gd\`, \`loot_dropper.gd\` and \`chest.gd\`.`,
            md`Create \`resources/loot/slime.tres\` (a \`LootTable\`): three *Weighted* entries (Earth Crystal 30, Potion 15, Ether 5), *Nothing Weight* 50, *Rolls* 1, gold 3 to 7. Run the test script below with **F6** to check the chances before playing.`,
            md`Make \`scenes/components/pickup.tscn\`: an \`Area2D\` with a \`Sprite2D\` and a small \`CollisionShape2D\`; in the Inspector set *Collision → Layer* to *pickup* only and *Mask* to *player* only. Attach \`pickup.gd\`.`,
            md`Open your slime scene, add a \`Node\` child named \`LootDropper\` with the script, and set *Health*, *Table* (\`slime.tres\`) and *Pickup Scene* (\`pickup.tscn\`).`,
            md`Make \`scenes/objects/chest.tscn\`: an \`Area2D\` on the *interactable* layer with a \`Sprite2D\` (*Texture* \`objects.png\`, *Hframes* 8, *Vframes* 3) and a collision shape. Give it a \`LootTable\` with two *Guaranteed* entries.`,
          ],
          result: md`The test prints expected and observed chances within about 0.01 of each other (0.300 against roughly 0.30). In a room, slimes leave hopping pickups that disappear into the bag when Kai walks over them, and the chest opens once; after reloading the room it is still open.`,
          troubleshoot: [
            { problem: md`Errors like \`Can't change this state while flushing queries\` when a slime dies.`, fix: md`The pickup is added during the physics step. Use \`add_child.call_deferred(pickup)\` as in the listing.` },
            { problem: md`Pickups never get collected.`, fix: md`Check the layers: the pickup's *Mask* must include *player*, and Kai's body must be on the *player* layer. Also check that \`body_entered\` is connected and that the area has a shape.` },
            { problem: md`All pickups vanish when the slime is freed.`, fix: md`They were added as children of the slime. Add them to the room: \`get_parent().get_parent()\` from the dropper (dropper → slime → room), or a dedicated \`Drops\` node.` },
          ],
        },
        { kind: 'code', file: 'scripts/tests/loot_test.gd', code: LOOT_TEST },
        {
          kind: 'build',
          ch: {
            id: 'r03-2-build',
            title: 'Bad-luck protection for a rare drop',
            goal: md`Make the skeleton's rare drop (a Storm Crystal at weight 4 of 100) fairer: each kill without it raises its weight by 4, and getting it resets the bonus. Keep \`LootTable\` itself unchanged.`,
            requirements: [
              md`A \`PityTracker\` resource (saved in GameState, so the bonus survives reloading) holds the bonus weight per item id.`,
              md`The skeleton's dropper uses a temporary copy of the table with the bonus added to the rare entry's weight; the \`.tres\` on disk never changes.`,
              md`A test that rolls 1000 kills with a fixed seed prints the longest streak without the drop: without pity it is often above 60, with pity it stays below about 25.`,
            ],
            hints: [
              md`\`table.duplicate(true)\` copies the table and its entries, so changing the copy's weight cannot touch the shared resource.`,
              md`After rolling, check whether the drops contain the rare item, and reset or raise the bonus.`,
            ],
            solution: [
              {
                file: 'scripts/rpg/pity_tracker.gd',
                code: gd`
class_name PityTracker
extends Resource
## Extra weight for rare drops, per item id, raised on every miss and reset on a hit.

@export var bonus: Dictionary[StringName, float] = {}


## Rolls table with the bonus applied to rare, then updates the bonus.
func roll(table: LootTable, rare: ItemData, step: float, rng: RandomNumberGenerator) -> Dictionary:
    var boosted := table.duplicate(true) as LootTable
    for entry in boosted.weighted:
        if entry.item == rare:
            entry.weight += bonus.get(rare.id, 0.0)
    var drops := boosted.roll(rng)
    if drops.has(rare):
        bonus[rare.id] = 0.0
    else:
        bonus[rare.id] = bonus.get(rare.id, 0.0) + step
    emit_changed()
    return drops
`,
              },
            ],
            explain: md`\`duplicate(true)\` also duplicates the sub-resources, so the boosted entries belong to the copy; the drops dictionary still uses the same \`ItemData\` objects as keys because items are external resources, which is why \`drops.has(rare)\` works. Raising the weight by 4 per miss means that after 10 misses the Storm Crystal is at 44 of 140, about a 31% chance, so long dry streaks become rare without making the drop common.`,
          },
        },
        {
          kind: 'paper',
          problem: {
            id: 'r03-2-paper',
            title: 'Two drops from one kill',
            type: 'compute',
            difficulty: 2,
            minutes: 6,
            statement: md`A bat's table has *Rolls* 2 and weights Storm Crystal 20, Potion 10, nothing 70. What is the probability that one bat drops at least one Storm Crystal?`,
            solution: [
              md`Each roll misses the crystal with probability $1 - 20/100 = 0.8$.`,
              md`Two independent rolls both miss with probability $0.8^2 = 0.64$, so at least one crystal: $1 - 0.64 = 0.36$.`,
            ],
            answer: { kind: 'number', value: 0.36 },
          },
        },
        {
          kind: 'recall',
          prompt: md`Write the chance of at least one drop in $n$ kills and the number of kills for a target chance $c$.`,
          answer: md`$1 - (1 - p)^n$; $n \ge \ln(1 - c)/\ln(1 - p)$, rounded up.`,
        },
        {
          kind: 'explain',
          prompt: md`Why do chests use a flag in GameState instead of a variable on the chest node?`,
          model: md`A node is rebuilt every time its room scene is loaded, so a variable on it resets to its default: the chest would close every time the player re-entered. Persistent world state has to live outside the room, in the autoload that the save system writes. The chest only reads the flag when it enters the tree and writes it once when opened. Keeping all flags in one dictionary also gives r06 one thing to save and r04's quests one place to check what happened.`,
        },
      ],
      cards: [
        { id: 'r03-2-c1', kind: 'compute', front: md`Weights 30, 15, 5 and nothing 50. Chance of the weight-15 entry per roll?`, answer: { kind: 'number', value: 0.15 }, back: md`$15/100 = 0.15$.` },
        { id: 'r03-2-c2', kind: 'compute', front: md`$p = 0.1$ per kill. Chance of at least one drop in 10 kills?`, answer: { kind: 'number', value: 1 - Math.pow(0.9, 10) }, back: md`$1 - 0.9^{10} \approx 0.651$.` },
        { id: 'r03-2-c3', kind: 'concept', front: md`Why add pickups with \`call_deferred\` from a \`died\` handler?`, back: md`\`died\` fires during the physics step, and adding physics bodies while Godot resolves collisions is not allowed; deferring adds them after the step.` },
        { id: 'r03-2-c4', kind: 'concept', front: md`Hand-typed vs derived chest flag ids?`, back: md`Typed: survive renames but copy-paste can duplicate them. Derived from scene path + node path: automatic and unique but change on rename, which re-closes chests in old saves.` },
        { id: 'r03-2-c5', kind: 'cloze', text: md`The expected number of kills to the first drop with chance $p$ is {{}}.`, answers: ['1/p'] },
      ],
    },
    // ============================================================================ r03-3
    {
      id: 'r03-3',
      title: 'Shops and the economy',
      minutes: 35,
      objectives: [
        'Implement buying and selling with all checks before any change, and gold in GameState with a signal.',
        'Set buy and sell prices, and explain why selling pays less than buying.',
        'Estimate gold income per hour of play and compare it with prices to set the pace of upgrades.',
        'Build a shop screen with filtering and sorting on top of the inventory.',
      ],
      cells: [
        {
          kind: 'text',
          md: md`The outpost shop sells the Rune Blade for 1500 gold. The player has 640. Whether that feels like a goal for the next half hour or an impossible wall depends on numbers spread across the game: how much gold slimes and skeletons drop, how many fights an area has, what materials sell for, and how many potions the player buys along the way.

A shop is simple code: check, take gold, give item. The economy around it is a design problem with the same shape as XP in r02: income per hour against prices, tuned so the next upgrade is always in sight.`,
        },
        {
          kind: 'callout',
          tone: 'definition',
          title: 'Prices',
          md: md`- **Buy price**: \`item.price × shop.price_scale\`, rounded. A remote shop can charge 25% more.
- **Sell price**: \`floor(item.price × 0.5)\`. Selling pays half.
- **Gold income per hour**: (fights per hour) × (average gold per fight + average value of materials sold).
- A **sink** is anything that removes gold: consumables, inn stays, repairs. A **faucet** adds it: drops, chests, quest rewards, selling.`,
        },
        {
          kind: 'callout',
          tone: 'design',
          title: 'Why selling pays half',
          md: md`If selling paid the full price, buying and selling would be free, so the player could "store" gold in gear and the shop would be a bank. Half price makes every purchase a commitment, which is what makes choosing between the Rune Blade and Chain Mail interesting. It also stops a loop where an item bought in one shop sells for more in another: with \`price_scale\` up to 1.25 and a sell rate of 0.5, the highest sell price ($0.5\,p$) stays below the lowest buy price ($p$).`,
        },
        { kind: 'code', file: 'scripts/resources/shop_data.gd', code: SHOP_DATA },
        { kind: 'code', file: 'scripts/rpg/shop.gd', code: SHOP, note: md`\`buy\` checks gold **and** bag space before changing either, so it can never take the gold and then fail to give the item. \`floori(float(GameState.gold) / price)\` converts to float first: \`int / int\` truncates too, but Godot warns about integer division, and the explicit version says what it means.` },
        {
          kind: 'numeric',
          q: md`The outpost (\`price_scale\` 1.25) sells Potions with a base price of 50. The party has 640 gold and 92 Potions (\`max_stack\` 99). What does \`max_buy\` return?`,
          answer: { kind: 'number', value: 7 },
          explain: md`Buy price $\operatorname{round}(62.5) = 63$ (\`roundi\` rounds halves away from zero). By gold: $\lfloor 640/63 \rfloor = 10$. By room: $99 - 92 = 7$. The minimum is 7.`,
        },
        {
          kind: 'text',
          md: md`### Income per hour

Estimate it the same way as XP in r02. A field fight (a slime and a bat) drops 9 gold on average; if the player fights about 1.5 times per minute while exploring, that is $9 \times 1.5 \times 60 = 810$ gold per hour from drops alone. Materials add their sell value times their drop chance: Earth Crystals sell for 10 and drop 30% of the time per slime, so about 3 gold per slime. Potions bought and used are subtracted.

With 1500 for the Rune Blade, the field alone would take about 1.8 hours of fighting, which is too long for a weapon meant to arrive with the ruins. In the ruins (a skeleton and a slime, 19 gold a fight plus Ember Crystals) the same rate gives about 1700 gold per hour, under an hour. That is the intent: the Rune Blade is the ruins' reward, bought after the player has proved they can fight there. The figure lets you test these assumptions.`,
        },
        {
          kind: 'viz',
          viz: { type: 'rpg.shop' },
          task: md`In the **field** at 1.5 fights per minute, how long until the Rune Blade? Switch to the **ruins**. Then raise potions used per fight to 0.5 and see how much a habit of drinking potions costs. Find a sell value for Ember Crystals that makes the Rune Blade affordable within 40 minutes in the ruins.`,
          caption: md`The line is cumulative gold after sinks; the dashed lines are shop prices. The table lists the minutes to afford each item from zero gold at the current settings.`,
        },
        {
          kind: 'check',
          q: md`Playtesters finish the ruins with 4000 unspent gold and nothing to buy. Which change fixes the problem most directly without making fights feel less rewarding?`,
          options: [
            md`Add a desirable sink in the ruins' shop (a strong accessory, or upgrades) priced near what players have`,
            md`Halve the gold every enemy drops`,
            md`Raise every price in every shop by 50%`,
            md`Make selling pay 10% instead of 50%`,
          ],
          answer: 0,
          explain: md`The symptom is a lack of things worth buying, not too much gold. Cutting drops or raising every price makes the early game harder too, and lowering the sell rate punishes selling materials. A new sink at the right price turns the surplus into a goal.`,
        },
        { kind: 'code', file: 'ui/shop_menu.gd', code: SHOP_MENU, note: md`The menu stores nothing about prices or counts: it rebuilds from \`GameState\` on every \`changed\` or \`gold_changed\`. Rows the party cannot afford are disabled rather than hidden, so the player sees what to save for. \`[&"kind", &"name", &"price"][sort.selected]\` indexes an array literal to map the option button to a sort key.` },
        {
          kind: 'steps',
          title: 'Open a shop',
          steps: [
            md`Create \`shop_data.gd\` and \`shop.gd\`. Make \`resources/shops/outpost.tres\` with a few items in *Stock* and *Price Scale* 1.25.`,
            md`Create \`ui/shop_menu.tscn\`: a \`Control\` root with children \`List\` (\`ItemList\`), \`Gold\` (\`Label\`), \`Filter\` and \`Sort\` (\`OptionButton\`), \`Mode\` (\`Button\`). Attach the script and set *Shop* to \`outpost.tres\`.`,
            md`Give yourself gold for testing: in a test script's \`_ready\`, \`GameState.gold = 2000\`. Run the menu scene with **F6** and buy with **Enter** or a double click.`,
          ],
          result: md`The list shows the stock with outpost prices; buying lowers the gold label and raises the count; items you cannot afford are greyed out; **Sell** switches to the bag and shows half prices; the Old Key never appears in the sell list.`,
          troubleshoot: [
            { problem: md`The gold label does not change after buying.`, fix: md`\`gold\` needs the setter that emits \`gold_changed\`, and the menu must connect to it. Assigning \`gold\` from inside \`GameState\` itself without \`self.\` still runs the setter in Godot 4; check the signal is declared.` },
            { problem: md`The ItemList does not respond to the keyboard.`, fix: md`It needs focus: \`list.grab_focus()\` in \`_ready\`, and its *Focus Mode* set to *All*.` },
          ],
        },
        {
          kind: 'build',
          ch: {
            id: 'r03-3-build',
            title: 'Buy several, with a confirmation',
            goal: md`Extend the shop so the player chooses a quantity before buying, sees the total, and cannot pick more than \`max_buy\` allows.`,
            requirements: [
              md`Activating an item opens a small panel with a \`SpinBox\` limited to 1…\`max_buy\`, the unit price and the total.`,
              md`Confirming buys exactly that many in one call to \`Shop.buy\`; cancelling changes nothing.`,
              md`If \`max_buy\` is 0 the panel does not open and the menu plays the "back" sound instead.`,
              md`After buying, focus returns to the list on the same item.`,
            ],
            hints: [
              md`\`SpinBox.max_value\` and \`min_value\` clamp the input; \`value_changed\` updates the total.`,
              md`Store the item being bought in a variable while the panel is open.`,
            ],
            solution: [
              {
                file: 'ui/buy_panel.gd',
                code: gd`
extends PanelContainer
## Children: SpinBox "Amount", Label "Total", Button "Confirm", Button "Cancel".

signal closed

var _shop: ShopData
var _item: ItemData

@onready var amount: SpinBox = $VBox/Amount
@onready var total: Label = $VBox/Total


func _ready() -> void:
    hide()
    amount.value_changed.connect(func(_value: float) -> void: _update_total())
    $VBox/Confirm.pressed.connect(_confirm)
    $VBox/Cancel.pressed.connect(_close)


## Returns false (and stays closed) when nothing can be bought.
func open(shop: ShopData, item: ItemData) -> bool:
    var most := Shop.max_buy(shop, item)
    if most <= 0:
        return false
    _shop = shop
    _item = item
    amount.min_value = 1
    amount.max_value = most
    amount.value = 1
    _update_total()
    show()
    amount.get_line_edit().grab_focus()
    return true


func _update_total() -> void:
    var price := Shop.buy_price(_shop, _item)
    total.text = "%d x %d G = %d G" % [int(amount.value), price, int(amount.value) * price]


func _confirm() -> void:
    Shop.buy(_shop, _item, int(amount.value))
    _close()


func _close() -> void:
    hide()
    closed.emit()
`,
              },
            ],
            explain: md`The shop menu calls \`open\`; if it returns false it plays \`sfx_menu_back\`. On \`closed\` it grabs focus on the list again and selects the same row. The panel never decides prices or limits itself: it asks \`Shop\`, so the rules stay in one place.`,
          },
        },
        {
          kind: 'paper',
          problem: {
            id: 'r03-3-paper',
            title: 'Minutes to the Rune Blade',
            type: 'compute',
            difficulty: 2,
            minutes: 6,
            statement: md`In the ruins a fight gives 19 gold on average and an Ember Crystal (sell price 15) 25% of the time; the player sells all crystals and fights 1.5 times per minute. They use 0.2 Potions per fight at 50 gold each. Starting from 0 gold, how many minutes until they can afford the 1500-gold Rune Blade? Round up to a whole minute.`,
            solution: [
              md`Net gold per fight: $19 + 0.25 \times 15 - 0.2 \times 50 = 19 + 3.75 - 10 = 12.75$.`,
              md`Per minute: $12.75 \times 1.5 = 19.125$. Minutes: $1500 / 19.125 = 78.4$, so 79 minutes.`,
              md`Potions eat almost half the income here; a player who guards and dodges well affords the blade in about 53 minutes. Skill turns into gold, which is a good property for an economy to have.`,
            ],
            answer: { kind: 'number', value: 79 },
          },
        },
        {
          kind: 'recall',
          prompt: md`Why does \`Shop.buy\` check everything before changing anything?`,
          answer: md`So a purchase is all or nothing: it can never take the gold and then fail to add the item (or the reverse) when the bag is full or gold is short.`,
        },
        {
          kind: 'explain',
          prompt: md`How would you decide the price of the Rune Blade?`,
          model: md`Start from when the player should have it: the designer wants it as the ruins' reward, so it should become affordable partway through the ruins for a player who did not grind. Estimate gold income per hour there (drops and materials minus typical potion spending) and the time spent in the area, then price it at roughly the gold a typical player has at that point, minus what they need for potions. Check it against nearby items so the choice between them is real, and against the sell rate so it is not a better bank than gold. Then playtest and look at how much gold players hold when they reach the shop.`,
        },
      ],
      cards: [
        { id: 'r03-3-c1', kind: 'compute', front: md`Base price 300, \`price_scale\` 1.25. Buy price? Sell price (rate 0.5)?`, answer: { kind: 'vector', value: [375, 150] }, back: md`Buy $\operatorname{round}(375) = 375$; sell $\lfloor 150 \rfloor = 150$ (sell uses the base price).` },
        { id: 'r03-3-c2', kind: 'concept', front: md`Faucets and sinks in an RPG economy?`, back: md`Faucets add gold (drops, chests, quests, selling); sinks remove it (consumables, gear, services). Balance them so there is always something worth buying.` },
        { id: 'r03-3-c3', kind: 'concept', front: md`Why must the sell price stay below the lowest buy price?`, back: md`Otherwise buying in one shop and selling in another makes gold from nothing.` },
        { id: 'r03-3-c4', kind: 'compute', front: md`9 gold per fight, 1.5 fights per minute. Gold per hour?`, answer: { kind: 'number', value: 810 }, back: md`$9 \times 1.5 \times 60 = 810$.` },
        { id: 'r03-3-c5', kind: 'cloze', text: md`The shop menu disables, instead of hiding, items the party cannot {{}}, so the player sees what to save for.`, answers: ['afford|buy'] },
      ],
    },
  ],
  problems: [
    {
      id: 'r03-p1',
      title: 'Kills for a 95% chance',
      type: 'compute',
      difficulty: 2,
      minutes: 5,
      statement: md`An item drops with probability 0.04 per kill. How many kills give at least a 95% chance of at least one?`,
      solution: [md`$(0.96)^n \le 0.05 \Rightarrow n \ge \ln 0.05 / \ln 0.96 = -2.996 / -0.04082 \approx 73.4$.`, md`So 74 kills.`],
      answer: { kind: 'number', value: 74 },
      areas: ['math'],
    },
    {
      id: 'r03-p2',
      title: 'Expected gold per kill',
      type: 'compute',
      difficulty: 1,
      minutes: 4,
      statement: md`A slime drops 3 to 7 gold (uniform integers) and an Earth Crystal (sell 10) with probability 0.3. What is the expected gold per slime if the player sells every crystal?`,
      solution: [md`Uniform integers 3..7 average to 5.`, md`Crystals add $0.3 \times 10 = 3$, so 8 gold per slime.`],
      answer: { kind: 'number', value: 8 },
      areas: ['math', 'systems'],
    },
    {
      id: 'r03-p3',
      title: 'Weights that sum to anything',
      type: 'derive',
      difficulty: 2,
      minutes: 6,
      statement: md`A table has Earth Crystal 30, Potion 15, Ether 5 and nothing 50. A designer adds a Phoenix Feather with weight 10 without changing the others. What is the Ether's chance now, and by what factor did every old entry's chance change?`,
      solution: [md`The total becomes 110, so Ether is $5/110 \approx 0.0455$.`, md`Every old entry's chance is multiplied by $100/110 \approx 0.909$: adding weight dilutes all others proportionally, including "nothing".`],
      answer: { kind: 'number', value: 5 / 110 },
      areas: ['math'],
    },
    {
      id: 'r03-p4',
      title: 'The free potions',
      type: 'debug',
      difficulty: 2,
      minutes: 6,
      statement: md`With a full stack of 99 Potions, buying one more still takes 50 gold and the count stays 99. Find the bug.

\`\`\`gdscript
static func buy(shop: ShopData, item: ItemData, amount: int) -> bool:
	var cost := buy_price(shop, item) * amount
	if GameState.gold < cost:
		return false
	GameState.gold -= cost
	GameState.inventory.add(item, amount)
	return true
\`\`\``,
      solution: [
        md`The function checks gold but not bag space, and ignores \`add\`'s return value (the amount that did not fit). With a full stack, \`add\` adds nothing and returns 1, but the gold is already gone.`,
        md`Check space before changing anything: compute \`max_buy\` from gold and room and refuse amounts above it, as in the lesson. Then gold and items always change together.`,
      ],
      rubric: [md`Finds the missing space check`, md`Notes the ignored return value of add`, md`Fixes by validating everything before any change`],
      areas: ['godot', 'systems'],
    },
    {
      id: 'r03-p5',
      title: 'The chest that paid twice',
      type: 'debug',
      difficulty: 2,
      minutes: 6,
      statement: md`Players report that mashing the interact button on a chest sometimes gives its contents twice. The interaction code calls \`interact()\` once per press. Explain how this chest allows it and fix it.

\`\`\`gdscript
func interact(_by: Node) -> void:
	if GameState.has_flag(flag_id):
		return
	sprite.play("open")
	await sprite.animation_finished
	for item: ItemData in contents.roll(rng):
		GameState.inventory.add(item)
	GameState.set_flag(flag_id)
\`\`\``,
      solution: [
        md`The \`await\` suspends the function while the open animation plays. A second press during that time calls \`interact\` again, the flag is still unset, and a second coroutine starts. Both finish and both grant the contents.`,
        md`Set the flag **before** anything that can wait (as the lesson's chest does), then play the animation and grant the items. The second call returns at the flag check.`,
      ],
      rubric: [md`Connects the bug to the await window`, md`Moves the flag before the first await`],
      areas: ['godot'],
    },
    {
      id: 'r03-p6',
      title: 'An inventory for a survival game',
      type: 'design',
      difficulty: 2,
      minutes: 8,
      statement: md`You are making a different game: a survival RPG where carrying capacity is a core tension. Would you keep the dictionary-of-counts inventory? Describe the data model and two UI consequences.`,
      solution: [
        md`No: capacity and arrangement are the mechanic, so slots (or a weight budget) are the model. An array of \`ItemStack\` with a fixed size, or a total-weight limit with per-item weight.`,
        md`UI consequences: a grid the player arranges (drag, split, merge stacks), and clear "bag full" feedback with a choice of what to drop. Pickups must handle a refusal and stay in the world.`,
        md`Per-copy state (spoilage, durability) also fits slots naturally, since each stack can carry its own values.`,
      ],
      rubric: [md`Chooses slots or weight with a reason tied to the mechanic`, md`Names concrete UI consequences`, md`Mentions refusal handling or per-copy state`],
      areas: ['systems'],
    },
    {
      id: 'r03-p7',
      title: 'Write the weighted pick',
      type: 'code-on-paper',
      difficulty: 2,
      minutes: 8,
      statement: md`Write \`_pick(rng) -> LootEntry\` for a table with \`weighted: Array[LootEntry]\` and \`nothing_weight\`, returning \`null\` for nothing. Then say which entry is returned for weights [30, 15, 5], nothing 50 when \`rng.randf()\` returns 0.42.`,
      solution: [
        md`\`\`\`gdscript
func _pick(rng: RandomNumberGenerator) -> LootEntry:
	var total := nothing_weight
	for entry in weighted:
		total += entry.weight
	var r := rng.randf() * total
	for entry in weighted:
		r -= entry.weight
		if r < 0.0:
			return entry
	return null
\`\`\``,
        md`$r = 0.42 \times 100 = 42$. Subtract 30: 12, not below 0. Subtract 15: −3, below 0: the second entry (Potion).`,
      ],
      rubric: [md`Includes the nothing weight in the total`, md`Walks the weights with a running remainder`, md`Returns null past the last entry`, md`Traces 0.42 to the second entry`],
      areas: ['math', 'godot'],
    },
    {
      id: 'r03-p8',
      title: 'Selling for profit',
      type: 'concept',
      difficulty: 1,
      minutes: 4,
      statement: md`A designer sets the outpost's \`price_scale\` to 0.4 for a "sale" and keeps the sell rate at 0.5. What goes wrong?`,
      solution: [md`Buying at the outpost costs $0.4p$ and selling anywhere pays $0.5p$: every purchase can be sold at a profit of $0.1p$.`, md`With unlimited stock this is an infinite gold loop. Keep every \`price_scale\` above the sell rate, or base sell prices on what the player paid.`],
      rubric: [md`Compares 0.4p with 0.5p`, md`Identifies the infinite loop and a fix`],
      areas: ['systems'],
    },
  ],
};
