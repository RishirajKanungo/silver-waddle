import { md, gd, type Module } from '../types';

const TOUR = gd`
extends Node
## A tour of GDScript for Python and TypeScript programmers.
## Attach to any node and run the scene; read the Output panel.

enum Element { NONE, FIRE, ICE, LIGHTNING }

const TILE_SIZE := 16

## Inferred type: := makes this an int, forever.
var gold := 120
## Explicit type, useful when there is no initial value.
var target_name: String
## A typed array: only ints allowed.
var damage_log: Array[int] = []
## A dictionary: keys and values of any type, in insertion order.
var resist := {"fire": 0.5, "ice": 1.5}


func _ready() -> void:
    print(describe(Element.FIRE))                   # Fireball (weak: ice)
    print(tile_of(Vector2(-5.0, 20.0)))             # (-1, 1)
    print(total_damage([12, 7, 30]))                # 49
    print(resist.get("lightning", 1.0))             # 1.0, the default
    print(Element.keys()[Element.ICE])              # ICE
    print(is_equal_approx(0.1 + 0.2, 0.3))          # true
    damage_log.append(12)
    assert(damage_log.size() == 1, "append should add one entry")
    if gold < 200:
        push_warning("Not enough gold for the sword (%d / 200)" % gold)


## Typed parameters and return value; match on an enum.
func describe(element: Element) -> String:
    match element:
        Element.FIRE:
            return "Fireball (weak: ice)"
        Element.ICE, Element.LIGHTNING:
            return "Bolt"
        _:
            return "Strike"


## A static function needs no instance: call it as ClassName.tile_of(...).
static func tile_of(pos: Vector2) -> Vector2i:
    return Vector2i(floori(pos.x / TILE_SIZE), floori(pos.y / TILE_SIZE))


func total_damage(hits: Array[int]) -> int:
    var total := 0
    for amount in hits:
        total += amount
    return total
`;

const BAG = gd`
extends Node
## A small inventory to practise typed GDScript: counts, rarity and prices.

enum Rarity { COMMON, RARE, LEGENDARY }

## Base price of each item, in gold.
const PRICES := {&"potion": 20, &"ether": 50, &"phoenix_down": 300}

## item id -> how many we hold
var counts: Dictionary = {}


func _ready() -> void:
    add(&"potion", 3)
    add(&"ether")
    print(count(&"potion"))                          # 3
    print(remove(&"potion", 5))                      # false, and a warning
    print(remove(&"potion", 2))                      # true
    print(count(&"potion"))                          # 1
    print(sell_price(&"ether", Rarity.RARE))         # 37
    print(sell_price(&"phoenix_down", Rarity.COMMON)) # 150


func add(item: StringName, amount: int = 1) -> void:
    assert(amount > 0, "add() needs a positive amount")
    counts[item] = count(item) + amount


func count(item: StringName) -> int:
    return counts.get(item, 0)


## Returns false and changes nothing if we do not hold enough.
func remove(item: StringName, amount: int = 1) -> bool:
    if count(item) < amount:
        push_warning("Cannot remove %d %s, only %d held" % [amount, item, count(item)])
        return false
    counts[item] = count(item) - amount
    if counts[item] == 0:
        counts.erase(item)
    return true


## Shops buy at half price; rarer copies are worth more.
func sell_price(item: StringName, rarity: Rarity) -> int:
    var multiplier := 1.0
    match rarity:
        Rarity.RARE:
            multiplier = 1.5
        Rarity.LEGENDARY:
            multiplier = 3.0
    var base: int = PRICES.get(item, 0)
    return floori(base * 0.5 * multiplier)
`;

const DUMMY = gd`
class_name TrainingDummy
extends Node2D
## A target that takes hits and shows its HP. Practice for exports,
## @onready, unique names and setters.

signal hp_changed(current: int, maximum: int)

enum Stuffing { STRAW, WOOD, IRON }

@export_group("Stats")
## Hit points when full.
@export_range(1, 999) var max_hp := 30
## Damage is reduced by this much per hit, but never below 1.
@export_range(0, 20) var armor := 0
@export_group("Look")
@export var stuffing: Stuffing = Stuffing.STRAW
@export_enum("Left", "Right") var faces := 1

## Current HP. The setter keeps it in range and tells listeners.
var hp := 0:
    set(value):
        hp = clampi(value, 0, max_hp)
        hp_changed.emit(hp, max_hp)
        if is_node_ready():
            _refresh()

@onready var sprite: Sprite2D = $Sprite2D
@onready var hp_label: Label = %HpLabel


func _ready() -> void:
    sprite.flip_h = faces == 0
    hp = max_hp


func _unhandled_input(event: InputEvent) -> void:
    if event.is_action_pressed("attack"):
        take_hit(HitRecord.new(12, "Kai"))


func take_hit(hit: HitRecord) -> void:
    hp -= maxi(1, hit.amount - armor)
    print("%s hit for %d, %d left" % [hit.source, hit.amount, hp])


func _refresh() -> void:
    hp_label.text = "HP %d/%d" % [hp, max_hp]
    sprite.modulate = Color(1.0, 0.4, 0.4) if hp == 0 else Color.WHITE


## An inner class: a small type that only this script uses.
class HitRecord:
    var amount: int
    var source: String

    func _init(p_amount: int, p_source: String) -> void:
        amount = p_amount
        source = p_source
`;

const COUNTDOWN = gd`
class_name Countdown
extends Node
## Counts down once per second, then emits finished.

signal tick(seconds_left: int)
signal finished

@export_range(1, 60) var seconds := 3


func start() -> void:
    for left in range(seconds, 0, -1):
        tick.emit(left)
        await get_tree().create_timer(1.0).timeout
    finished.emit()
`;

const COUNTDOWN_LABEL = gd`
extends Label
## Shows a Countdown child. Connects with a method and with a lambda.

@onready var countdown: Countdown = $Countdown


func _ready() -> void:
    countdown.tick.connect(_on_countdown_tick)
    countdown.finished.connect(func() -> void: text = "Go")
    countdown.start()
    print("start() returned; the countdown keeps running on its own")


func _on_countdown_tick(seconds_left: int) -> void:
    text = str(seconds_left)
`;

const TELEGRAPH = gd`
class_name Telegraph
extends Sprite2D
## Winds up (turns red) for windup_time seconds, then strikes.
## Press attack to trigger. Ignores presses while busy.

signal struck

## How long the warning lasts. Readable windups are 0.3 to 0.8 s.
@export_range(0.1, 2.0, 0.05) var windup_time := 0.5

var _busy := false


func _unhandled_input(event: InputEvent) -> void:
    if event.is_action_pressed("attack"):
        strike()


func strike() -> void:
    if _busy:
        return
    _busy = true
    modulate = Color(1.0, 0.35, 0.35)
    await get_tree().create_timer(windup_time).timeout
    modulate = Color.WHITE
    position.x += 6.0
    struck.emit()
    await get_tree().create_timer(0.15).timeout
    position.x -= 6.0
    _busy = false
`;

const STRIKE_COUNTER = gd`
extends Label
## Counts how many times the Telegraph sibling has struck.

@export var telegraph: Telegraph

var _strikes := 0


func _ready() -> void:
    telegraph.struck.connect(_on_struck)


func _on_struck() -> void:
    _strikes += 1
    text = "Strikes: %d" % _strikes
`;

export const MODULE: Module = {
  id: 'g02',
  part: 'godot',
  order: 2,
  title: 'GDScript for programmers',
  summary: 'GDScript mapped from Python and TypeScript: static typing, collections, enums and match, the number traps games hit first, classes and exports, node access and the lifecycle, setters, signals, await and Callables.',
  relevance: md`Every system in Shardbound is GDScript: the player controller, the ATB gauge, the damage formula, the save system. This module covers the language features those systems use, so later modules can talk about design instead of syntax: typed code that catches mistakes in the editor, exported values you tune in the Inspector, setters that keep HP valid and notify the HUD, signals for "something happened", and \`await\` for an enemy that winds up for half a second before it swings.`,
  prereqs: ['g01'],
  areas: ['godot'],
  lessons: [
    {
      id: 'g02-1',
      title: 'From Python and TypeScript to GDScript',
      minutes: 40,
      objectives: [
        'Declare typed variables with `:=` and explicit types, and explain what static typing buys in GDScript.',
        'Use functions, arrays, typed arrays, dictionaries, enums and `match`.',
        'Convert pixel positions to tiles correctly for negative positions: $\\text{tile} = \\lfloor x / 16 \\rfloor$.',
        'Compare floats with `is_equal_approx` and explain why `==` fails.',
        'Use `assert`, `print` and `push_warning` while developing.',
      ],
      cells: [
        {
          kind: 'text',
          md: md`GDScript looks like Python (indentation, \`for x in\`, \`and\`/\`or\`/\`not\`) and is typed like TypeScript (\`var hp: int\`, \`-> void\`). It is made for one engine, so engine types (\`Vector2\`, \`Color\`, \`Node\`) are built in, and every script *is* a class that extends an engine class.

The difference that matters most in a game: a type error found by the editor costs you ten seconds; the same error found at run time costs you a crash twenty minutes into a playtest, in the one room where an enemy drops a rare item. GDScript lets you choose how much typing you want. This course types almost everything.`,
        },
        {
          kind: 'callout',
          tone: 'notation',
          title: 'GDScript at a glance',
          md: md`| Python / TypeScript | GDScript |
|---|---|
| \`def f(x: int) -> str:\` / \`function f(x: number): string\` | \`func f(x: int) -> String:\` |
| \`let n = 5\` (inferred) | \`var n := 5\` |
| \`const MAX = 3\` | \`const MAX := 3\` |
| \`None\` / \`null\` | \`null\` |
| \`True\`, \`&&\`, \`!x\` | \`true\`, \`and\` (or \`&&\`), \`not x\` |
| \`list\`, \`list[int]\` / \`number[]\` | \`Array\`, \`Array[int]\` |
| \`dict\` / object literal | \`Dictionary\`, \`{"hp": 10}\` |
| \`class Foo(Bar):\` / \`class Foo extends Bar\` | one class per file: \`class_name Foo\` + \`extends Bar\` |
| \`self.x\` / \`this.x\` | \`x\` (\`self.x\` also works) |
| f-strings / template literals | \`"%d / %d" % [hp, max_hp]\` or \`str(a, b)\` |
| \`# comment\` | \`# comment\`, and \`## doc comment\` shown in the editor |

Indentation is with **tabs**. \`int\` is 64-bit, \`float\` is a 64-bit double, \`String\` is immutable text, and \`Vector2\`, \`Color\`, \`Rect2\` are value types (copied when assigned).`,
        },
        { kind: 'code', file: 'scripts/sandbox/gdscript_tour.gd', code: TOUR, note: md`Run it on any node and compare the Output with the comments. \`floori\` is \`floor\` returning an \`int\`. \`Element.keys()\` returns the names of the enum's values. \`push_warning\` prints in yellow and appears in the Debugger's *Errors* tab with the line it came from.` },
        {
          kind: 'text',
          md: md`### Typing

- \`var gold := 120\`: the type is inferred from the value and fixed. Assigning \`"lots"\` later is an error in the editor.
- \`var target_name: String\`: an explicit type, needed when there is no initial value.
- \`var anything = 120\`: no type (a *Variant*). Anything can be assigned, and mistakes show up only when the line runs.

Typed code has three benefits. The editor underlines mistakes as you type (calling a method that does not exist, passing a \`String\` where an \`int\` is expected). Autocompletion knows what an object is, so it lists its real methods. And the compiled code is faster, because Godot can use instructions specialised for \`int\` or \`Vector2\` instead of checking types at run time.

To make untyped declarations impossible to miss, open **Project Settings → Debug → GDScript** (with Advanced Settings on) and set **Untyped Declaration** to *Warn* or *Error*.`,
        },
        {
          kind: 'check',
          q: md`What do these lines print?

\`\`\`gdscript
var a := 7 / 2
var b := 7 / 2.0
print(a, " ", b)
\`\`\``,
          options: [md`\`3 3.5\``, md`\`3.5 3.5\``, md`\`3 3\``, md`\`4 3.5\``],
          answer: 0,
          explain: md`Two \`int\`s divide as integers, truncating, and \`a\` is inferred as \`int\`. With one \`float\` operand the result is a \`float\`. The editor also shows an *Integer division* warning for the first line, as a hint that you might have meant 3.5.`,
        },
        {
          kind: 'text',
          md: md`### The first number trap: integer division of negative numbers

Integer division in GDScript truncates **toward zero**: \`7 / 2\` is 3 and \`-7 / 2\` is \`-3\`, not \`-4\`. The remainder \`%\` takes the sign of the left operand: \`-7 % 2\` is \`-1\`.

This bites the first time you convert a position to a tile. With 16-px tiles, x = 20 is in tile 1 and x = 5 is in tile 0. But x = \`-5\` is in tile \`-1\` (the tile covering \`-16\` to \`-1\`), and \`-5 / 16\` gives 0. Rooms in Shardbound are placed around the origin, so negative coordinates are normal. Use \`floori(x / 16.0)\` for the tile and \`posmod(x, 16)\` for the position inside it.`,
        },
        {
          kind: 'viz',
          viz: { type: 'godot.numbers', tab: 'int' },
          task: md`Move x from 20 down to \`-20\` with tile_size 16 and watch where \`x / tile_size\` and \`floori\` disagree. Then set tile_size to 2: which values of x does \`x % 2 == 1\` (a common "is odd" test) get wrong?`,
          caption: md`The red band is every x that truncation sends to tile 0: from $-(b-1)$ to $b-1$, which is $2b-1$ pixels wide. Floor division gives every tile exactly $b$ pixels.`,
        },
        {
          kind: 'numeric',
          q: md`An enemy stands at x = \`-20\` in a room with 16-px tiles. What does \`-20 / 16\` give in GDScript, and which tile is the enemy actually in? Enter both.`,
          answer: { kind: 'vector', value: [-1, -2] },
          explain: md`$-20/16 = -1.25$. Truncation toward zero gives $-1$; the floor is $-2$. Tile $-2$ covers x from $-32$ to $-17$, which contains $-20$.`,
        },
        {
          kind: 'derive',
          title: 'Which tile contains x?',
          goal: md`Derive the tile index for a pixel coordinate $x$ (any sign) with tiles of size $b$, and the offset inside the tile.`,
          steps: [
            { md: md`Tile $t$ covers $tb \le x < (t+1)b$. Dividing by $b > 0$: $t \le x/b < t+1$.` },
            {
              md: md`The integer $t$ with $t \le y < t+1$ is the floor: $t = \lfloor x/b \rfloor$.`,
              choose: {
                prompt: md`For $x = -5$, $b = 16$: is $\lfloor -0.3125 \rfloor$ equal to 0 or $-1$?`,
                options: [md`$-1$: the floor is the largest integer not greater than the value`, md`$0$: the floor drops the fraction`, md`It depends on the language`],
                answer: 0,
                explain: md`The floor of a negative non-integer is further from zero. "Dropping the fraction" is truncation, which equals the floor only for non-negative numbers.`,
              },
            },
            { md: md`The offset inside the tile is $x - tb$, which lies in $[0, b)$. That is \`posmod(x, b)\` (or \`fposmod\` for floats); \`x % b\` gives a negative offset for negative $x$.` },
          ],
          takeaway: md`Write the conversion once, as a function, and use it everywhere: \`Vector2i(floori(pos.x / TILE_SIZE), floori(pos.y / TILE_SIZE))\`. Godot's \`TileMapLayer.local_to_map()\` does the same for tile maps.`,
        },
        {
          kind: 'text',
          md: md`### The second number trap: comparing floats

\`0.1\` has no exact binary representation, so \`0.1 + 0.2\` is stored as 0.30000000000000004 and \`0.1 + 0.2 == 0.3\` is \`false\`. In games this appears as "the timer never reaches exactly 1.0" or "the gauge is full but \`== max\` is false". Compare with a tolerance: \`is_equal_approx(a, b)\` (relative tolerance of about $10^{-5}$), \`is_zero_approx(x)\`, or \`>=\` for thresholds (\`if atb >= ATB_MAX\`). \`Vector2\` has its own \`is_equal_approx\`.

\`==\` is fine for \`int\`s, for enum values, and for floats you assigned directly and never computed (\`velocity == Vector2.ZERO\` after \`move_toward\` reached exactly zero).`,
        },
        {
          kind: 'viz',
          viz: { type: 'godot.numbers', tab: 'float' },
          task: md`Add 0.1 ten times and compare with 1.0. Then try 1/60 sixty times (one second of physics deltas), and 0.25, which is exact in binary. Which comparisons can you trust?`,
        },
        {
          kind: 'text',
          md: md`### Collections, enums and \`match\`

- **Arrays** (\`[1, 2, 3]\`) keep order and allow mixed types; \`Array[int]\` allows only ints and is checked. Methods: \`append\`, \`size\`, \`has\`, \`erase\`, \`find\`, \`filter\`, \`map\`, \`sort_custom\`.
- **Dictionaries** (\`{"hp": 10}\`) map keys to values and keep insertion order. \`d["hp"]\` errors if the key is missing; \`d.get("mp", 0)\` returns a default. Godot 4.4 adds typed dictionaries, \`Dictionary[StringName, int]\`.
- Both are **reference types**: assigning or passing one shares it. \`var b := a\` then \`b.append(4)\` changes \`a\` too. Use \`a.duplicate()\` for a copy. (\`Vector2\`, \`Color\` and other math types are copied instead.)
- **Enums** are named integers: \`enum Element { NONE, FIRE, ICE }\` makes \`Element.FIRE == 1\`. Use the enum as a type (\`var e: Element\`) so the editor checks assignments, and the Inspector shows a drop-down when exported.
- **\`match\`** compares a value against patterns, top to bottom, and runs the first that fits. Several values share a branch with commas; \`_\` matches anything. There is no fall-through.`,
        },
        {
          kind: 'check',
          q: md`What does this print?

\`\`\`gdscript
func add_bonus(hits: Array[int]) -> void:
	hits.append(99)


func _ready() -> void:
	var log: Array[int] = [5, 7]
	add_bonus(log)
	print(log.size())
\`\`\``,
          options: [md`\`3\``, md`\`2\``, md`An error: arrays cannot be passed to functions`, md`\`99\``],
          answer: 0,
          explain: md`Arrays are passed by reference, so \`add_bonus\` appends to the caller's array. Pass \`log.duplicate()\` if the function must not change the original.`,
        },
        {
          kind: 'text',
          md: md`### Checking assumptions

- \`print(a, b, c)\` writes to Output; \`print_debug\` adds the file and line.
- \`push_warning("…")\` and \`push_error("…")\` go to Output in colour and to the Debugger's *Errors* tab with a stack trace. Use them for "this should not happen, but the game can continue".
- \`assert(condition, "message")\` stops the game in the debugger when the condition is false, and does nothing in exported release builds. Use it for "if this is false, my code is wrong": a missing resource, an index out of range.
- A **breakpoint** (click left of a line number, or F9) pauses the game on that line; the Debugger then shows every variable.

The most common run-time error is calling something on \`null\`: *Invalid access to property or key 'text' on a base object of type 'null instance'*. The first question is always "why is this variable null here?", and the lifecycle in the next lesson answers it most of the time.`,
        },
        {
          kind: 'build',
          ch: {
            id: 'g02-1-build',
            title: 'A typed inventory',
            goal: md`Write a small inventory script that counts items, refuses to remove more than you hold, and computes sell prices by rarity, with no untyped declarations.`,
            requirements: [
              md`Running the scene prints \`3\`, \`false\`, \`true\`, \`1\`, \`37\` and \`150\` in that order (the expected values in the solution's comments).`,
              md`Removing too many prints a yellow warning that says how many you hold, and changes nothing.`,
              md`An item whose count reaches 0 is removed from the dictionary.`,
              md`With **Untyped Declaration** set to *Warn*, the script shows no warnings.`,
              md`Calling \`add(&"potion", 0)\` stops the game with your assert message.`,
            ],
            hints: [
              md`\`counts.get(item, 0)\` returns 0 for items you have never added, so \`count\` never needs an \`if\`.`,
              md`\`floori(20 * 0.5 * 1.5)\` is \`floori(15.0)\`; check each price by hand before running.`,
              md`\`var base: int = PRICES.get(item, 0)\` needs an explicit type: \`get\` returns a Variant, so \`:=\` cannot infer one.`,
            ],
            solution: [{ file: 'scripts/sandbox/bag.gd', code: BAG }],
            explain: md`The dictionary maps \`StringName\` ids to counts; \`StringName\` (\`&"potion"\`) compares fast and is what Godot uses for ids. Every function states its types, so a call like \`remove("potion", "2")\` is underlined before you run anything. The \`assert\` guards a programming mistake; the \`push_warning\` reports a situation the game can recover from.`,
          },
        },
        {
          kind: 'paper',
          problem: {
            id: 'g02-1-paper',
            title: 'Tile coordinates on paper',
            type: 'code-on-paper',
            difficulty: 1,
            minutes: 6,
            statement: md`Write \`func tile_and_offset(x: int, size: int) -> Vector2i\` that returns the tile index in \`.x\` and the offset inside the tile in \`.y\`, correct for negative \`x\`. Then evaluate it by hand for \`x = -37, size = 16\`.`,
            solution: [
              md`\`\`\`gdscript
func tile_and_offset(x: int, size: int) -> Vector2i:
	return Vector2i(floori(float(x) / size), posmod(x, size))
\`\`\``,
              md`For $-37$: $-37/16 = -2.3125$, floor $-3$. Offset: $-37 - (-3)(16) = -37 + 48 = 11$. Result \`(-3, 11)\`. Check: tile $-3$ covers $-48$ to $-33$, and $-48 + 11 = -37$.`,
            ],
            rubric: [md`Uses floor division, not \`/\` on ints`, md`Uses \`posmod\` (or an equivalent) for a non-negative offset`, md`Hand evaluation gives (-3, 11)`],
          },
        },
        {
          kind: 'recall',
          prompt: md`Name three benefits of static typing in GDScript, and how to declare a typed variable without writing the type.`,
          answer: md`Errors underlined in the editor before running; accurate autocompletion; faster typed instructions at run time. \`var x := value\` infers the type from the value and fixes it.`,
        },
      ],
      cards: [
        { id: 'g02-1-c1', kind: 'compute', front: md`GDScript: \`-7 / 2\` (both ints)?`, answer: { kind: 'number', value: -3 }, back: md`Integer division truncates toward zero: $-3.5 \to -3$.` },
        { id: 'g02-1-c2', kind: 'cloze', text: md`The tile containing pixel x with 16-px tiles: \`{{}}(x / 16.0)\`.`, answers: ['floori'] },
        { id: 'g02-1-c3', kind: 'concept', front: md`Why is \`0.1 + 0.2 == 0.3\` false, and what do you use instead?`, back: md`0.1, 0.2 and 0.3 have no exact binary form, so the sum is off in the last bits. Use \`is_equal_approx(a, b)\`, or \`>=\` for thresholds.` },
        { id: 'g02-1-c4', kind: 'concept', front: md`Are GDScript arrays and dictionaries copied when passed to a function?`, back: md`No, they are references: the function can change the caller's array. Use \`.duplicate()\` for a copy. Vector2, Color and other math types are copied.` },
        { id: 'g02-1-c5', kind: 'concept', front: md`\`assert\` versus \`push_warning\`?`, back: md`\`assert(cond, msg)\` stops in the debugger when your code is wrong and is removed from release builds. \`push_warning\` reports a recoverable situation and keeps running.` },
      ],
    },
    {
      id: 'g02-2',
      title: 'Classes, exports and talking to nodes',
      minutes: 40,
      objectives: [
        'Give a script a global type with `class_name`, extend an engine class, and write an inner class.',
        'Expose values in the Inspector with `@export`, `@export_range`, `@export_enum` and `@export_group`.',
        'Reach child nodes with `@onready`, `$Path` and `%UniqueName`, and say when they are valid.',
        'Write a setter that keeps a value in range and notifies listeners.',
        'Predict the order of `_init`, `_enter_tree`, `_ready`, `_process` and `_exit_tree` in a tree.',
      ],
      cells: [
        {
          kind: 'text',
          md: md`A slime has 30 HP. Is that right? You will only know after playing, and you will change it a dozen times. If the number is in the middle of a function you open the script each time; if it is an exported variable you change it in the Inspector, even while the game runs, and every slime in every room picks it up.

This lesson covers how a script becomes a class with properties the editor understands, how it finds the nodes it works with, and the order in which Godot calls its methods, which explains most "null instance" errors beginners hit.`,
        },
        {
          kind: 'callout',
          tone: 'definition',
          title: 'A script is a class',
          md: md`Each \`.gd\` file defines one class. \`extends Node2D\` names its base class; the node the script is attached to *is* an instance of the script, so \`position\`, \`add_child()\` and every other \`Node2D\` member are available directly. \`class_name TrainingDummy\` registers the class globally: other scripts can write \`var d: TrainingDummy\`, \`if body is TrainingDummy\`, \`TrainingDummy.new()\`, and *Add Child Node* lists it. Inside a file, \`class Name:\` declares an **inner class**, a helper type used only there. \`super()\` and \`super.method()\` call the base class's version of a method you override.`,
        },
        { kind: 'code', file: 'scripts/sandbox/training_dummy.gd', code: DUMMY, note: md`\`is_node_ready()\` is false until \`_ready\` has run. The setter checks it because \`hp\` may be set before the node is ready, when \`hp_label\` is still \`null\`.` },
        {
          kind: 'steps',
          title: 'Build the training dummy',
          steps: [
            md`New scene with a \`Node2D\` root named \`TrainingDummy\`. Add a \`Sprite2D\` child (keep the name \`Sprite2D\`) using the skeleton or slime sheet with Hframes and Vframes set, and a \`Label\` child named \`HpLabel\` placed above the sprite (position about (-20, -30)).`,
            md`Right-click \`HpLabel\` in the Scene dock and choose **Access as Unique Name**. A **%** appears next to it: the script can now write \`%HpLabel\` wherever the label sits in this scene.`,
            md`Attach the script above as \`scripts/sandbox/training_dummy.gd\` and save the scene as \`scenes/sandbox/training_dummy.tscn\`.`,
            md`Select the root and look at the Inspector: *Stats* and *Look* groups, a slider for *Max Hp* limited to 1–999, a drop-down for *Stuffing*, and *Faces* as Left/Right.`,
            md`Press **F6** and press the attack key (J) a few times. Then set *Armor* to 10 in the Inspector and run again.`,
          ],
          result: md`The label shows \`HP 30/30\`, then \`HP 18/30\`, \`HP 6/30\`, \`HP 0/30\` with the sprite tinted red; it never goes negative. With armour 10 each hit does 2. The Output prints one line per hit.`,
          troubleshoot: [
            { problem: md`Error on start: *Invalid assignment of property or key 'text' with value of type 'String' on a base object of type 'null instance'*.`, fix: md`\`%HpLabel\` was not found: the label is not marked **Access as Unique Name**, or is named differently. \`$Sprite2D\` has the same failure if the sprite was renamed.` },
            { problem: md`The exported variables do not appear in the Inspector.`, fix: md`Save the script, then click the root node again. Exported variables appear only when the script parses without errors; check the Script editor's bottom bar.` },
          ],
        },
        {
          kind: 'text',
          md: md`### Exports

\`@export\` makes a member variable a property: shown in the Inspector, saved in the scene file, editable per instance. Variants control the editor widget:

- \`@export_range(0, 100)\`, \`@export_range(0.0, 2.0, 0.05)\`: a slider with limits and a step; add \`"or_greater"\` to allow typing beyond the maximum.
- \`@export_enum("Left", "Right") var faces := 1\`: an \`int\` shown as named choices. For your own enums, \`@export var stuffing: Stuffing\` gives a drop-down directly.
- \`@export_group("Stats")\` puts the following exports under a collapsible heading, until the next group; \`@export_subgroup\` nests.
- \`@export_multiline\` for long text, \`@export_file("*.tscn")\` for a path, \`@export_color_no_alpha\`, and \`@export_flags_2d_physics\`, which shows the named physics layers from lesson g01-2 as checkboxes.
- \`@export var target: Node2D\` holds a reference to another node in the scene, picked in the Inspector. That is often better than a path written in code.

A \`##\` comment on the line before an export becomes its tooltip.`,
        },
        {
          kind: 'check',
          q: md`Why does the dummy use \`@onready var sprite: Sprite2D = $Sprite2D\` instead of \`var sprite: Sprite2D = $Sprite2D\`?`,
          options: [
            md`Member variables are initialised when the object is constructed, before the node has children in the tree; \`@onready\` delays the assignment until just before \`_ready\``,
            md`\`$\` only works inside functions`,
            md`\`@onready\` makes the lookup faster on every access`,
            md`Without \`@onready\` the variable cannot be typed`,
          ],
          answer: 0,
          explain: md`Plain initialisers run in \`_init\` time. When a scene is instanced, the root is constructed first and its children are added afterwards, so \`$Sprite2D\` finds nothing and the variable stays \`null\`. \`@onready\` runs the initialiser right before \`_ready\`, when all children exist.`,
        },
        {
          kind: 'text',
          md: md`### Finding nodes

- \`$Sprite2D\` is short for \`get_node("Sprite2D")\`: a path relative to this node. \`$Body/Sprite2D\` goes down two levels; \`$"../HUD"\` goes up to the parent and down (quotes are needed for \`..\` and special characters).
- \`%HpLabel\` finds a node marked **Access as Unique Name** anywhere in the same scene, so moving it under a different parent does not break the script.
- \`get_node_or_null("Path")\` returns \`null\` instead of raising an error.
- Cache the result in an \`@onready\` variable instead of calling \`$\` every frame; give it a type so the editor checks what you do with it.

Reaching *down* into your own scene's children is normal. Reaching *up* or *sideways* (\`$"../../HUD/CoinLabel"\`) ties the script to one exact tree, and breaks when that tree changes; module g03 replaces it with signals.`,
        },
        {
          kind: 'text',
          md: md`### The lifecycle

When a scene is instanced and added to the tree, Godot calls each node's methods in a fixed order:

1. \`_init()\` when each node object is constructed, parents before children. Exported values from the scene and the node's name are assigned *after* it, and the node is not in the tree yet.
2. \`_enter_tree()\` when the node enters the scene tree, **parents first**.
3. \`_ready()\` once, **children first**: a node is ready only after all its children are. \`@onready\` variables are assigned right before it.
4. Every frame: \`_physics_process(delta)\` on each physics tick, then \`_process(delta)\`, each in tree order (top to bottom of the Scene dock).
5. \`_exit_tree()\` when it leaves the tree (freed or removed), children first.

So in \`_ready\` you may use your children; in a parent's \`_ready\` every descendant is ready; and in \`_init\` you should only set up plain data.`,
        },
        {
          kind: 'viz',
          viz: { type: 'godot.lifecycle', scenario: 'startup' },
          task: md`Step through **start the game** and write down the order of the five \`_ready\` calls before you reach them. Then switch to **add_child** and find when the new slime's \`_ready\` runs relative to the rest of \`Main._process\`. Last, **queue_free**: does Kai still get his \`_process\` call on the frame he is freed?`,
          caption: md`Only nodes with scripts are listed with calls; engine nodes such as the \`AnimatedSprite2D\` get the same notifications internally. Attach the probe script below to a few nodes in any scene to see the same order in your Output panel.`,
        },
        {
          kind: 'check',
          q: md`In the figure's tree, \`Player\` has children \`Sprite\` and \`Hitbox\`. In which order do these three run \`_ready\` and \`_enter_tree\`?`,
          options: [
            md`\`_enter_tree\`: Player, Sprite, Hitbox. \`_ready\`: Sprite, Hitbox, Player`,
            md`Both: Player, Sprite, Hitbox`,
            md`Both: Sprite, Hitbox, Player`,
            md`\`_enter_tree\`: Sprite, Hitbox, Player. \`_ready\`: Player, Sprite, Hitbox`,
          ],
          answer: 0,
          explain: md`Entering the tree goes top-down, so a child can rely on its parent being in the tree. Ready goes bottom-up, so a parent's \`_ready\` can rely on its children being ready, which is when the player's script connects to its hitbox's signals.`,
        },
        {
          kind: 'text',
          md: md`### Setters and getters

A property can run code when it is assigned or read:

\`\`\`gdscript
var hp := 0:
	set(value):
		hp = clampi(value, 0, max_hp)
		hp_changed.emit(hp, max_hp)
	get:
		return hp
\`\`\`

Inside its own setter, assigning \`hp\` stores the value directly (it does not call the setter again). Every other assignment, \`hp -= 12\` included, goes through the setter, so HP can never leave the range and every change is announced. That is the reason to use a setter: a rule that must hold for *every* change belongs in one place. The getter is optional; omit it when it only returns the value.`,
        },
        {
          kind: 'check',
          q: md`With the dummy's setter and \`max_hp = 30\`, what is \`hp\` after \`hp = 25\` and then \`hp -= 40\`, and how many times is \`hp_changed\` emitted?`,
          options: [md`0, emitted twice`, md`\`-15\`, emitted twice`, md`0, emitted once`, md`25: the subtraction is rejected`],
          answer: 0,
          explain: md`\`hp -= 40\` is \`hp = hp - 40\`, which calls the setter with $-15$; \`clampi\` stores 0. Each assignment emits once.`,
        },
        {
          kind: 'build',
          ch: {
            id: 'g02-2-build',
            title: 'A dummy that reports its HP',
            goal: md`Finish the training dummy so that it is tuned entirely from the Inspector and its HP is always valid and visible.`,
            requirements: [
              md`*Max Hp* and *Armor* appear under a *Stats* group with sliders limited as in the script.`,
              md`The label always shows the current HP, including the first frame.`,
              md`HP never goes below 0 and each hit does at least 1 damage, even with armour 20.`,
              md`At 0 HP the sprite is tinted red.`,
              md`A second dummy in the same scene with different exported values behaves independently.`,
            ],
            hints: [
              md`Assign \`hp = max_hp\` in \`_ready\`, not at the declaration: the declaration runs before the Inspector's \`max_hp\` value is applied.`,
              md`If the label is empty on the first frame, check that the setter calls \`_refresh()\` once the node is ready.`,
            ],
            solution: [{ file: 'scripts/sandbox/training_dummy.gd', code: DUMMY }],
            explain: md`The setter owns the rule "HP is between 0 and max" and the side effects (signal, label). The \`is_node_ready()\` guard covers assignments made before \`_ready\`. \`HitRecord\` is an inner class because only this script needs it; module g04 introduces the course-wide \`HitData\`.`,
          },
        },
        {
          kind: 'paper',
          problem: {
            id: 'g02-2-paper',
            title: 'The label that is never there',
            type: 'debug',
            difficulty: 2,
            minutes: 6,
            statement: md`This script crashes on start with *Invalid access to property or key 'text' on a base object of type 'null instance'*. The scene is a \`Node2D\` with a child \`Label\` named \`Label\`. Explain why and fix it.

\`\`\`gdscript
extends Node2D

@export var max_hp := 30
var label: Label = get_node("Label")
var hp := max_hp


func _ready() -> void:
	label.text = "HP %d" % hp
\`\`\``,
            hints: [md`When does a member initialiser run, relative to the node's children being added?`],
            solution: [
              md`\`var label: Label = get_node("Label")\` runs when the object is constructed, before its child \`Label\` has been added, so \`get_node\` fails and \`label\` is \`null\`. The crash happens in \`_ready\` when the code uses it.`,
              md`Fix: \`@onready var label: Label = $Label\` (\`$Label\` is short for the same \`get_node\` call). There is a second, quieter bug: \`var hp := max_hp\` also runs before the Inspector's value is applied, so an instance with *Max Hp* 50 starts with 30. Assign \`hp = max_hp\` in \`_ready\`.`,
            ],
            rubric: [md`Explains construction-time initialisation`, md`Fixes with \`@onready\``, md`Spots the \`hp := max_hp\` problem (bonus)`],
          },
        },
        {
          kind: 'recall',
          prompt: md`Give the order of the lifecycle callbacks for a node and its children, and say which direction each one goes in the tree.`,
          answer: md`\`_init\` (construction, parent first), \`_enter_tree\` (parents first, top-down), \`_ready\` (children first, bottom-up, once), then every frame \`_physics_process\` and \`_process\` in tree order, and \`_exit_tree\` (children first) on removal.`,
        },
      ],
      cards: [
        { id: 'g02-2-c1', kind: 'concept', front: md`What does \`class_name\` add to a script?`, back: md`A global type name: usable in type hints, \`is\` checks, \`.new()\`, and listed in *Add Child Node* and resource dialogs.` },
        { id: 'g02-2-c2', kind: 'cloze', text: md`\`@{{}} var sprite: Sprite2D = $Sprite2D\` assigns the variable just before \`_ready\`.`, answers: ['onready'] },
        { id: 'g02-2-c3', kind: 'concept', front: md`In which order do a parent and its children get \`_ready\`?`, back: md`Children first. A parent is ready only after all its descendants are.` },
        { id: 'g02-2-c4', kind: 'cloze', text: md`Right-click a node and choose *Access as Unique Name* to reach it as \`{{}}HpLabel\` from anywhere in the scene.`, answers: ['%'] },
        { id: 'g02-2-c5', kind: 'concept', front: md`Why put HP clamping in a setter rather than in \`take_hit\`?`, back: md`Every assignment goes through the setter (healing, cheats, loading a save), so the rule and the change signal live in one place and cannot be bypassed.` },
      ],
    },
    {
      id: 'g02-3',
      title: 'Signals, await and Callables',
      minutes: 40,
      objectives: [
        'Declare, emit and connect signals with typed parameters.',
        'Pause a function with `await` on a signal or a timer, and predict when it resumes.',
        'Pass behaviour around as Callables and lambdas, including `bind`, and know what a lambda captures.',
        'Guard references to nodes that may have been freed with `is_instance_valid`.',
      ],
      cells: [
        {
          kind: 'text',
          md: md`A skeleton raises its sword, glows red for half a second, then swings. The half second is what makes the attack fair: the player sees it coming. Written as plain per-frame code, this needs a state variable, a countdown in \`_process\` and an \`if\` for each phase. Written with \`await\`, it reads like the description: turn red, wait 0.5 s, swing.

The other half of this lesson is **signals**, Godot's built-in observer pattern. A timer runs out, an area is entered, an animation finishes, a button is pressed: each is a signal, and \`await\` works by waiting for one.`,
        },
        {
          kind: 'callout',
          tone: 'definition',
          title: 'Signals',
          md: md`A signal is an event an object can announce. Declare it with \`signal hp_changed(current: int, maximum: int)\`, announce it with \`hp_changed.emit(hp, max_hp)\`, and let others subscribe with \`dummy.hp_changed.connect(_on_dummy_hp_changed)\`. \`emit\` calls every connected function immediately, in the order they were connected, and returns when they are done. The emitter does not know who listens; zero listeners is fine. Engine nodes come with signals: \`Timer.timeout\`, \`Area2D.body_entered\`, \`AnimatedSprite2D.animation_finished\`, \`Button.pressed\`.`,
        },
        { kind: 'code', file: 'scripts/sandbox/countdown.gd', code: COUNTDOWN, note: md`\`range(seconds, 0, -1)\` counts 3, 2, 1. Each pass emits \`tick\`, then suspends the function until a one-second timer fires. \`start()\` returns to its caller at the first \`await\`.` },
        { kind: 'code', file: 'scripts/sandbox/countdown_label.gd', code: COUNTDOWN_LABEL, note: md`Two ways to connect: a named method, and a lambda (\`func() -> void: …\`) for a one-line reaction. The print after \`start()\` appears immediately, before "2": calling a function that awaits does not block the caller.` },
        {
          kind: 'steps',
          title: 'Build the countdown',
          steps: [
            md`New scene: a \`Label\` root named \`CountdownLabel\`, position (150, 80). Add a plain \`Node\` child named \`Countdown\`.`,
            md`Attach \`countdown.gd\` to \`Countdown\` and \`countdown_label.gd\` to the label. Save as \`scenes/sandbox/countdown.tscn\`.`,
            md`Press **F6**.`,
          ],
          result: md`The label shows 3, 2, 1 one second apart, then "Go". The Output shows the "start() returned" line at once, at the beginning.`,
          troubleshoot: [{ problem: md`Error: *Identifier "Countdown" not declared in the current scope*.`, fix: md`\`countdown.gd\` must be saved with its \`class_name Countdown\` line before other scripts can use the type. Save it, then the label script.` }],
        },
        {
          kind: 'text',
          md: md`### How \`await\` works

\`await some_signal\` suspends the current function and returns control to whoever called it. Godot keeps the function's local variables and position; when the signal is emitted, the function continues from that line, inside the same frame as the emit. A function that contains \`await\` is a **coroutine**.

- \`await get_tree().create_timer(0.5).timeout\`: wait 0.5 s. The timer is checked once per frame, so the wait ends on the first frame at or after 0.5 s: about 30 frames at 60 fps.
- \`await $AnimatedSprite2D.animation_finished\`: wait until a non-looping animation ends.
- \`await get_tree().process_frame\`: wait exactly one frame.
- \`await attack()\`: wait until the coroutine \`attack\` finishes. Without \`await\`, the caller carries on immediately while \`attack\` continues on its own.

\`await\` never freezes the game. Other nodes keep processing; only this function is parked.`,
        },
        {
          kind: 'viz',
          viz: { type: 'godot.await', seconds: 0.5 },
          task: md`Play the timeline with the caller **not** awaiting and read the Output: when does "turn: end" print? Turn on **caller uses await attack()** and play again. Then shorten the timer to 0.1 s and count the frames attack() is suspended.`,
          caption: md`Dots on the \`_process()\` row are frames the game kept running while \`attack()\` was suspended. The suspended function costs nothing per frame; Godot resumes it from the timer's \`timeout\` signal.`,
        },
        {
          kind: 'check',
          q: md`What does this print, in order?

\`\`\`gdscript
func _ready() -> void:
	print("A")
	blink()
	print("B")


func blink() -> void:
	print("C")
	await get_tree().create_timer(0.2).timeout
	print("D")
\`\`\``,
          options: [md`A C B D`, md`A C D B`, md`A B C D`, md`A C B, and D never prints`],
          answer: 0,
          explain: md`\`blink\` runs until its \`await\` (printing C), then returns to \`_ready\`, which prints B. About 0.2 s later the timer fires and \`blink\` resumes to print D. With \`await blink()\` the order would be A C D B.`,
        },
        {
          kind: 'numeric',
          q: md`At 60 fps, about how many frames does \`await get_tree().create_timer(0.25).timeout\` wait?`,
          answer: { kind: 'number', value: 15 },
          explain: md`$0.25 \times 60 = 15$ frames. The timer is checked once per frame, so the real wait is rounded to a whole frame.`,
        },
        {
          kind: 'callout',
          tone: 'warning',
          title: 'The world changes while you wait',
          md: md`When a coroutine resumes, half a second of game has happened. The skeleton may have been staggered, the target may have dodged, or the target may have been freed. After every \`await\`, re-check what you depend on: \`if is_staggered: return\`, and for references to other nodes, \`if not is_instance_valid(target): return\`. Module c05 moves long sequences like this into a state machine, where interrupting is explicit; short ones stay as \`await\`.`,
        },
        {
          kind: 'text',
          md: md`### Callables and lambdas

A **Callable** is a reference to a function: \`_on_countdown_tick\` without parentheses is one, and \`connect\` takes one. Call it with \`.call(args)\`.

- **Lambdas**: \`var double := func(x: int) -> int: return x * 2\`, then \`double.call(4)\`. Useful for short connections and for array helpers: \`enemies.filter(func(e: Node2D) -> bool: return e.global_position.distance_to(pos) < 48.0)\`.
- **\`bind\`** adds arguments: \`button.pressed.connect(_on_slot_pressed.bind(3))\` calls \`_on_slot_pressed(3)\` when pressed, so one handler serves many buttons.
- **One-shot**: \`timer.timeout.connect(_on_done, CONNECT_ONE_SHOT)\` disconnects after the first call.
- **Captures**: a lambda copies the *values* of the local variables it uses at the moment it is created. Changing a captured \`int\` inside the lambda does not change the outer variable. Arrays, dictionaries and objects are references, so changes to their contents are shared. To keep a counter, store it in a member variable or an array.

Connections to a node are removed automatically when the node is freed, so a freed listener is never called.`,
        },
        {
          kind: 'check',
          q: md`What does this print?

\`\`\`gdscript
func _ready() -> void:
	var count := 0
	var add_one := func() -> void: count += 1
	add_one.call()
	add_one.call()
	print(count)
\`\`\``,
          options: [md`\`0\``, md`\`2\``, md`\`1\``, md`An error: lambdas cannot see local variables`],
          answer: 0,
          explain: md`The lambda captured the value 0. Its \`count += 1\` changes its own copy; the outer \`count\` stays 0. (Recent Godot versions warn about assigning to a captured variable for this reason.) Use a member variable, or capture an array and change its element.`,
        },
        {
          kind: 'text',
          md: md`### Freed nodes

\`queue_free()\` deletes a node at the end of the current frame, after processing. Any variable that still points at it then holds a reference to a freed object; using it raises *Attempt to call function … in base 'previously freed'*. \`is_instance_valid(node)\` returns \`false\` for \`null\` and for freed objects, so it is the check to use for references to things that can die: an enemy's target, the slime the camera is following, the ally a heal was aimed at. \`node.is_queued_for_deletion()\` tells you a node is about to go this frame.`,
        },
        {
          kind: 'build',
          ch: {
            id: 'g02-3-build',
            title: 'A telegraphed strike',
            goal: md`Make a sprite that winds up for an exported time, strikes, and announces each strike with a signal that a label counts.`,
            requirements: [
              md`Pressing attack turns the sprite red for \`windup_time\` seconds (0.5 by default), then it lunges 6 px and returns.`,
              md`Pressing attack again during the windup or the lunge does nothing.`,
              md`A \`Label\` that is a sibling of the sprite shows "Strikes: n", updated through the \`struck\` signal; the sprite's script never mentions the label.`,
              md`Changing *Windup Time* in the Inspector to 0.8 makes the warning visibly longer.`,
            ],
            hints: [
              md`A \`_busy\` flag set at the start of \`strike()\` and cleared at the end makes extra presses harmless.`,
              md`Give the label an \`@export var telegraph: Telegraph\` and pick the sprite in the Inspector; it then connects in its \`_ready\`.`,
              md`If the label shows nothing until the first strike, set its text in the editor to "Strikes: 0".`,
            ],
            solution: [
              { file: 'scripts/sandbox/telegraph.gd', code: TELEGRAPH },
              { file: 'scripts/sandbox/strike_counter.gd', code: STRIKE_COUNTER },
            ],
            explain: md`The sequence is written in the order it happens, with two \`await\`s as the pauses. The busy flag is the minimum "state" this needs; when there are more interruptions (stagger, death), module c05's state machine takes over. The label depends on the telegraph, not the other way round: the telegraph only emits, so it can be reused anywhere.`,
          },
        },
        {
          kind: 'paper',
          problem: {
            id: 'g02-3-paper',
            title: 'Blink on paper',
            type: 'code-on-paper',
            difficulty: 2,
            minutes: 8,
            statement: md`Write a method \`blink(times: int, period: float) -> void\` for a \`Sprite2D\` that hides and shows the sprite \`times\` times, each hidden and each shown phase lasting \`period / 2\` seconds, and ends visible. Then say how long \`blink(3, 0.2)\` takes and how a caller waits for it to finish.`,
            solution: [
              md`\`\`\`gdscript
func blink(times: int, period: float) -> void:
	for i in times:
		visible = false
		await get_tree().create_timer(period / 2.0).timeout
		visible = true
		await get_tree().create_timer(period / 2.0).timeout
\`\`\``,
              md`Each blink is two half-periods, one period: $3 \times 0.2 = 0.6$ s. A caller writes \`await blink(3, 0.2)\` to continue after it ends; without \`await\` the caller continues immediately while the sprite blinks.`,
            ],
            rubric: [md`Two awaits per iteration with half the period each`, md`Ends visible`, md`States 0.6 s and \`await blink(...)\``],
          },
        },
        {
          kind: 'recall',
          prompt: md`What happens, step by step, when a function reaches \`await get_tree().create_timer(0.5).timeout\`?`,
          answer: md`The timer is created; the function is suspended with its local state saved and control returns to its caller; the game keeps running frames; on the first frame at or after 0.5 s the timer emits \`timeout\` and the function continues from the next line.`,
        },
        {
          kind: 'explain',
          prompt: md`When would you connect a signal instead of calling a method directly?`,
          model: md`Call a method when the caller owns the callee and needs it done now: a player telling its own sword to swing. Use a signal when the emitter should not know who reacts, or when any number of things might: HP changed (HUD, sound, an achievement), an enemy died (quest log, spawner, loot). The emitter stays reusable because it has no references to its listeners, listeners can come and go, and a scene still works when one of them is missing. Signals also give \`await\` something to wait for.`,
        },
      ],
      cards: [
        { id: 'g02-3-c1', kind: 'cloze', text: md`Declare \`signal died\`, announce it with \`died.{{}}()\`, subscribe with \`enemy.died.connect(_on_enemy_died)\`.`, answers: ['emit'] },
        { id: 'g02-3-c2', kind: 'concept', front: md`Does \`await\` block the game?`, back: md`No. It suspends only the current function and returns to its caller; the game keeps running and the function resumes when the signal fires.` },
        { id: 'g02-3-c3', kind: 'compute', front: md`Frames waited by \`create_timer(0.75)\` at 60 fps?`, answer: { kind: 'number', value: 45 }, back: md`$0.75 \times 60 = 45$.` },
        { id: 'g02-3-c4', kind: 'concept', front: md`A lambda changes a captured local \`int\`. Does the outer variable change?`, back: md`No: lambdas capture local values by copy. Contents of captured arrays, dictionaries and objects are shared.` },
        { id: 'g02-3-c5', kind: 'cloze', text: md`Before using a stored reference to an enemy that may have died, check \`{{}}(enemy)\`.`, answers: ['is_instance_valid'] },
      ],
    },
  ],
  problems: [
    {
      id: 'g02-p1',
      title: 'Four divisions',
      type: 'compute',
      difficulty: 1,
      minutes: 4,
      statement: md`In GDScript, with \`x = -33\`, evaluate \`x / 16\`, \`x % 16\`, \`posmod(x, 16)\` and \`floori(x / 16.0)\`. Enter the four results in order.`,
      solution: [md`$-33/16 = -2.0625$: truncation gives $-2$; floor gives $-3$.`, md`\`%\` follows the dividend's sign: $-33 - 16(-2) = -1$. \`posmod\` gives the offset inside the floor tile: $-33 - 16(-3) = 15$.`],
      answer: { kind: 'vector', value: [-2, -1, 15, -3] },
      areas: ['godot', 'math'],
    },
    {
      id: 'g02-p2',
      title: 'Approximately equal',
      type: 'compute',
      difficulty: 2,
      minutes: 5,
      statement: md`\`is_equal_approx(a, b)\` treats two floats as equal when $|a - b| < \varepsilon$, where $\varepsilon = 10^{-5}\,|a|$ but at least $10^{-5}$. Is \`is_equal_approx(1000.0, 1000.009)\` true or false? Is \`is_equal_approx(0.001, 0.0011)\`? Enter 1 for true and 0 for false, both answers.`,
      solution: [md`For $a = 1000$: $\varepsilon = 0.01$, and $|a-b| = 0.009 < 0.01$: true.`, md`For $a = 0.001$: $10^{-5} \times 0.001 = 10^{-8}$ is below the floor, so $\varepsilon = 10^{-5}$; $|a-b| = 0.0001 > 10^{-5}$: false. The tolerance is relative for large numbers and absolute near zero.`],
      answer: { kind: 'vector', value: [1, 0] },
      areas: ['godot', 'math'],
    },
    {
      id: 'g02-p3',
      title: 'An HP bar that is always empty',
      type: 'debug',
      difficulty: 1,
      minutes: 5,
      statement: md`The HP bar shows 0% until HP is full, then 100%. Find the bug.

\`\`\`gdscript
func _on_hp_changed(current: int, maximum: int) -> void:
	var percent := current / maximum * 100
	bar.value = percent
\`\`\``,
      solution: [md`\`current / maximum\` divides two ints, so for any \`current < maximum\` it truncates to 0, and \`0 * 100\` is 0.`, md`Convert first: \`var percent := float(current) / maximum * 100.0\`, or multiply first: \`current * 100 / maximum\` (still an int, but correct to the percent).`],
      rubric: [md`Identifies integer division`, md`Fixes by converting to float or reordering`],
      areas: ['godot'],
    },
    {
      id: 'g02-p4',
      title: 'Timer frames',
      type: 'compute',
      difficulty: 1,
      minutes: 3,
      statement: md`An enemy's windup is \`await get_tree().create_timer(0.4).timeout\`. How many frames is that at 60 fps, and how many at 144 fps?`,
      solution: [md`$0.4 \times 60 = 24$ frames.`, md`$0.4 \times 144 = 57.6$, so the timer fires on the 58th frame. The time is the same; only the number of frames differs, because the timer counts seconds.`],
      answer: { kind: 'vector', value: [24, 58] },
      areas: ['godot', 'feel'],
    },
    {
      id: 'g02-p5',
      title: 'Ready order',
      type: 'compute',
      difficulty: 2,
      minutes: 4,
      statement: md`A scene tree is \`Main\` with children \`World\` and \`HUD\`; \`World\` has children \`Player\` and \`Enemies\`; \`Enemies\` has children \`Slime\` and \`Bat\`. Counting from 1, in which position does \`World\` run \`_ready\`, and in which position does \`HUD\`?`,
      hints: [md`Children first, and siblings in tree order.`],
      solution: [md`\`_ready\` is a post-order walk: Player (1), Slime (2), Bat (3), Enemies (4), World (5), HUD (6), Main (7).`, md`World is 5th, HUD is 6th.`],
      answer: { kind: 'vector', value: [5, 6] },
      areas: ['godot'],
    },
    {
      id: 'g02-p6',
      title: 'Why type it',
      type: 'concept',
      difficulty: 1,
      minutes: 5,
      statement: md`A teammate prefers untyped GDScript "because it is faster to write, like Python". Give three concrete reasons the course types its code, with an example of a bug typing would catch.`,
      solution: [md`Errors appear in the editor instead of at run time: \`player.take_damge(10)\` (typo) is underlined when \`player\` is typed as \`Player\`; untyped, it crashes only when that line runs.`, md`Autocompletion lists the real members of typed variables. Typed code runs faster because Godot uses type-specific instructions. Types document intent: \`func heal(amount: int) -> void\` says what it takes.`],
      rubric: [md`Editor-time errors with a concrete example`, md`At least two of: autocompletion, speed, documentation`],
      areas: ['godot'],
    },
    {
      id: 'g02-p7',
      title: 'A mana setter',
      type: 'code-on-paper',
      difficulty: 2,
      minutes: 6,
      statement: md`Write a property \`mp\` with a setter that keeps it between 0 and \`max_mp\`, emits \`mp_changed(current, maximum)\` only when the stored value actually changes, and a method \`spend(cost: int) -> bool\` that returns false without changing anything when there is not enough MP.`,
      solution: [
        md`\`\`\`gdscript
signal mp_changed(current: int, maximum: int)

@export var max_mp := 40

var mp := 0:
	set(value):
		var clamped := clampi(value, 0, max_mp)
		if clamped == mp:
			return
		mp = clamped
		mp_changed.emit(mp, max_mp)


func spend(cost: int) -> bool:
	if mp < cost:
		return false
	mp -= cost
	return true
\`\`\``,
        md`Comparing before storing avoids emitting when nothing changed (healing at full MP), which keeps listeners such as a "gained MP" sound from firing for nothing.`,
      ],
      rubric: [md`Clamps in the setter`, md`Emits only on change`, md`\`spend\` checks before subtracting and reports success`],
      areas: ['godot', 'systems'],
    },
    {
      id: 'g02-p8',
      title: 'The target that died',
      type: 'debug',
      difficulty: 2,
      minutes: 6,
      statement: md`A bat dives at its target after a short windup. Sometimes the game stops with *Invalid access to property or key 'global_position' on a base object of type 'previously freed'*. Explain and fix.

\`\`\`gdscript
var target: Node2D


func dive() -> void:
	modulate = Color.RED
	await get_tree().create_timer(0.4).timeout
	modulate = Color.WHITE
	velocity = global_position.direction_to(target.global_position) * 160.0
\`\`\``,
      solution: [md`During the 0.4 s wait the target can be freed (another party member defeated it, or it left the scene). The coroutine then resumes and reads a property of a freed object.`, md`After the \`await\`, check \`if not is_instance_valid(target): return\` (and reset the colour first). Re-check any state the function relied on before the wait.`],
      rubric: [md`Connects the crash to the await window`, md`Uses \`is_instance_valid\` after the await`],
      areas: ['godot', 'combat'],
    },
    {
      id: 'g02-p9',
      title: 'await or a state machine?',
      type: 'design',
      difficulty: 3,
      minutes: 10,
      statement: md`For each, say whether you would write it with \`await\` in one function or with explicit state updated every frame, and why: (a) a chest's opening animation followed by an item popup; (b) a skeleton's windup and swing that a player's hit can interrupt (stagger); (c) a dialogue line typed out letter by letter that the player can skip.`,
      solution: [
        md`(a) \`await\`: a fixed sequence nobody interrupts. \`await anim.animation_finished\` then show the popup.`,
        md`(b) Explicit state (a state machine, module c05): the sequence must be cancelled at any point, and the stagger must win. With \`await\`, every resume point needs a check, and a forgotten one makes a staggered skeleton swing anyway.`,
        md`(c) Either works; a per-frame update with a "characters shown" counter makes skipping a single assignment, while an \`await\` loop needs a skip flag checked each iteration. Many games use the per-frame version for this reason.`,
      ],
      rubric: [md`(a) await, uninterrupted sequence`, md`(b) state machine because of interruption`, md`(c) a reasoned choice mentioning skipping`],
      areas: ['godot', 'combat'],
    },
  ],
};
