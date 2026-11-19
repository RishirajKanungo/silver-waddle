# Authoring guide: Godot Action RPG course

**The learner.** A software engineer who codes daily in Python and TypeScript/React but has never made a game and has barely used Godot. They learn visually and by trial and error, struggle with retention, and want to finish with the skills to make any 2D game and to release **Shardbound** (below) on Steam. Programming basics can move fast; Godot's model (nodes, scenes, signals, the editor), game feel, game math and game architecture are new and need care.

**Tone.** The learner explicitly rejected "vibe-coded" guides: no hype, no filler, no emoji, no "level up your skills". Teach like a senior game developer pairing with a smart colleague: precise, concrete, honest about trade-offs.

`src/content/modules/c02_movement.ts` (lesson c02-1) is the reference lesson. Its figure is `src/viz/core/topdown.tsx`. Read both before writing anything and match their standard.

## 1. Style (strict)

- Plain, precise sentences. Define before use. One idea per paragraph. Concrete numbers (pixels, frames, seconds).
- Banned: "level up", "supercharge", "master", "unlock", "dive in", "journey", "let's", "we'll", "in this lesson we will", "worth noting", "crucial", "powerful", "awesome", exclamation marks, emoji, em-dash asides, "not X, but Y" framings.
- **Accuracy:**
  - Godot APIs must be real Godot 4.4+ APIs with correct names and signatures; when unsure, don't use it.
  - Editor menu paths must match Godot 4.4 (e.g. *Project → Project Settings → Input Map*, *Scene → New Scene*, the *Inspector*, *FileSystem* and *Node → Signals* docks).
  - No invented statistics about games, sales or Steam. Steam facts you may state:
    - the Steam Direct fee is US\$100 per game, recoupable after US\$1,000 of adjusted gross revenue
    - Valve's standard revenue share is 30%, lowering to 25% after US\$10M and 20% after US\$50M per game
    - games must use the Steamworks SDK for achievements/cloud saves
  - Describe reference games by mechanics a player can observe (e.g. "in FF7 Remake, filling an enemy's stagger gauge leaves it helpless and takes increased damage"), and don't claim internal numbers you can't verify.
- **Write money as `\$` in md strings**, because `$` starts math.

## 2. The game being built: Shardbound

Read `src/pages/GamePage.tsx`; it is the design document.
- **Party:** Kai (sword, fast combos; sheet `hero`), Lyra (mage, spells; `mage`), Bram (shield + mace, guard and stagger; `guard`).
- **Enemies:** `slime`, `bat`, `skeleton`, boss `golem`.
- **Battle system:** real-time attacks fill ATB (2 segments per character); tactical mode slows time; abilities/spells/items cost ATB (spells also MP); pressure → stagger with a damage multiplier; party switching; allies act with simple AI but use ATB only when commanded; limit gauge.
- **Gear:** weapon, armour, accessory; **shards** are socketable gems granting abilities/spells/passives (our version of FF7's Materia; call them shards).
- **Exploration:** top-down with real height (jumping between elevation levels, fake Z axis with a shadow), dash, light platforming puzzles.
- **Technical:** Godot 4.4+, 320×180 viewport, integer scaling, 16×16 tiles, characters on 32×32 frames, physics at 60 Hz.

### Shared architecture (use these names everywhere)

**Folders.** `scenes/`, `scripts/`, `scripts/autoload/`, `scripts/resources/`, `scenes/components/`, `resources/` (`.tres` data), `ui/`, `assets/`. These already exist in the starter project, along with the assets.

**Input actions** (made in g01, extended later):
- `move_left`, `move_right`, `move_up`, `move_down`
- `attack`, `dodge`, `jump`, `guard`, `tactical`, `switch_character`, `interact`, `pause`
- plus Godot's built-in `ui_*` actions

**2D physics layers** (named in *Project Settings → Layer Names → 2D Physics*):
1. `world`
2. `player`
3. `party`
4. `enemy`
5. `player_hitbox`
6. `enemy_hitbox`
7. `interactable`
8. `pickup`

**Autoloads:**
- `Events`: a global signal bus, `scripts/autoload/events.gd`
- `GameState`: party roster, inventory, gold, story flags, the current save; `scripts/autoload/game_state.gd`
- `Audio`: SFX and music helpers, `scripts/autoload/audio.gd`
- `Transitions`: fades and scene changes, `scripts/autoload/transitions.gd`

**How the player script evolves (keep continuity):**

| Module | Change |
|---|---|
| c02 | `Player` (class_name) extends `CharacterBody2D`: movement, facing, animation. Lesson c02-2 adds a dash with i-frames and an input buffer. |
| c03 | Height: a `z` (height) value and a shadow sprite for jumping between elevation levels in the top-down world; plus a separate side-view platformer controller. |
| c05 | **Refactor.** `Character` (class_name, extends `CharacterBody2D`) holds movement, animation and states and reads an **intent** (`move: Vector2`, `wants_attack`, `wants_dodge`, …) set by a **controller** child node. `PlayerController` fills intent from `Input`; `AIController` (k02, k05) fills it from AI. Also introduced here: the node-based state machine (`StateMachine` + `State` with `enter()`, `exit()`, `update(delta)`, `physics_update(delta)`), and the components `HealthComponent` (signals `health_changed(current, maximum)`, `died`), `Hitbox` (Area2D carrying a `HitData`) and `Hurtbox` (Area2D emitting `hurt(hit: HitData)`). |
| k01 | Attack strings with startup/active/recovery, hitstop, screen shake, knockback, hit flash. |
| k04 | `AtbGauge`, tactical mode, abilities, the stagger gauge on enemies. |
| k05 | `PartyManager` swaps which `Character` has the `PlayerController`; allies get `AIController`s; commands from tactical mode. |

**Data as Resources** (`scripts/resources/`, introduced in g04, filled in later):
- `CharacterStats` (base stats + growth)
- `AbilityData` (name, atb_cost, mp_cost, power, element, target type, animation)
- `ItemData`
- `EquipmentData` (slot, stat modifiers, shard sockets)
- `ShardData` (granted ability or passive, AP to level)
- `EnemyData`
- `HitData` (a `RefCounted` for one hit: amount, element, knockback, stagger, source)

**Damage pipeline (r01):** attacker stats + ability power → defence/resistance → element multiplier → stagger multiplier → crit → final integer; status effects apply afterwards.

## 3. Module and lesson structure

**Module** (`src/content/modules/<id>_<slug>.ts`, exporting `MODULE`):
- 3 lessons, each 30–45 minutes.
- `relevance`: what this unlocks *in Shardbound*, concretely.
- `problems`: 8–10 university-style problems mixing these types:
  - `compute` (game math)
  - `derive`
  - `design` (a design prompt with a model answer)
  - `debug` (find the bug in a GDScript listing)
  - `concept`
  - `code-on-paper` (write the function on paper, compare with the solution)

  At least 4 have machine-checkable answers. Each solution is a list of steps; design/debug/code problems have a `rubric`.

**Lesson rhythm:**
1. A concrete motivation: what the player sees and feels.
2. A definition or Godot-concept callout (tones `godot`, `definition`, `design`).
3. The **assets** panel when the lesson uses art or sound.
4. A **playable figure** where the idea is behaviour (movement, physics, timing, AI, combat), or a manipulable diagram where it is structure (scene tree, signals, state machine, data).
5. **Steps** to do it in Godot, with exact editor actions, a clear "you should see" result, and troubleshooting for the two or three most common failures.
6. A **code** listing (complete script, typed GDScript) explained in prose.
7. Checkpoints:
   - `check`: multiple choice; GDScript can go in the question as a ```gdscript fence
   - `numeric`: compute on paper
   - `derive`: with `choose` steps, for every formula used in the game (jump physics, easing, damage)
8. A **build** challenge: acceptance criteria the learner checks in their running game, hints, and a reference solution.
9. A `paper` problem.
10. `recall` and/or `explain`.

Requirements per lesson:
- 3–5 objectives (they may contain `$math$`)
- at least 4 gated cells
- at least 1 figure (most lessons 2)
- at least 1 `steps` or `build` (the learner must make something in Godot every lesson)
- exactly 5 review `cards`
- Cloze answers are short and typeable; list alternatives with `|`.

**Drills** (`src/drills/<module>.ts`, exporting `DRILLS`):
- 2–4 generators for computations that should become automatic, e.g. vector length/normalize, dot-product facing test, jump velocity from height, easing value at t, collision-mask bits, damage formula, XP to next level, drop chance over N tries, frame data at 60 fps, conv to ms.
- Ids are lowercase with hyphens.

**Design/concept questions** (`src/interview/<module>.ts`, exporting `QUESTIONS`):
- 5–7 per module, the questions a game developer should answer well, e.g. "why compose with nodes instead of deep inheritance", "how do you make a hit feel heavy", "why fixed timestep physics".
- Areas: `godot`, `math`, `feel`, `combat`, `systems`, `art`, `ship`. Levels 1–3.
- Answers of 80–200 words, plus `pitfalls` and `followups`.

## 4. Cells (see `src/content/types.ts`)

```ts
{ kind: 'text', md }
{ kind: 'callout', tone: 'definition'|'theorem'|'intuition'|'example'|'warning'|'design'|'remember'|'notation'|'godot', title?, md }
{ kind: 'viz', viz: { type: 'core.topdown', ...params }, task?, caption? }
{ kind: 'check', q, options, answer, explain }
{ kind: 'numeric', q, answer: AnswerSpec, hints?, explain, inputHint? }
{ kind: 'derive', title, goal, steps: [{ md, choose? }], takeaway? }
{ kind: 'paper', problem: Problem }
{ kind: 'code', file?, lang?: 'gdscript'|'shader'|'tscn'|'cfg'|'text', code, note?, fragment? }
{ kind: 'steps', title, steps: Md[], result: Md, troubleshoot?: [{ problem, fix }] }
{ kind: 'assets', ids: string[], note? }
{ kind: 'build', ch: { id, title, goal, requirements: Md[], hints: Md[], solution: [{ file, code, lang? }], explain? } }
{ kind: 'recall', prompt, answer }
{ kind: 'explain', prompt, model }
```

**Strings.**
- Author prose with ``md`…` `` (String.raw), so `\frac` survives.
- Author GDScript with ``gd`…` ``: it keeps backslashes and converts 4-space indentation to **tabs** (Godot uses tabs; the validator enforces it). Indent with 4 spaces inside ``gd`` ``; never mix.
- Inside ``md`` ``, inline code is ``\`name\` `` and fences are ```` \`\`\`gdscript ````.

**GDScript rules:**
- Godot 4.4+, statically typed where it helps (`var speed := 90.0`, `func f(x: float) -> void`).
- `@export`, `@onready`, `class_name`, signals as `signal hurt(hit: HitData)` and connections as `area.body_entered.connect(_on_body_entered)`; `await`; `create_tween()`; `TileMapLayer`.
- `code` cells and build solutions must be **complete scripts** that parse with gdtoolkit (`gdparse`).
  - Use `fragment: true` only for a few lines shown in isolation.
  - Fragments and ```gdscript fences are still checked for Godot 3 idioms (`src/content/gdlint.ts`).
- Prefer clarity over cleverness. Comment the *why*. Use `##` doc comments on exported variables.
- Every listing states its file path (`file: 'scripts/player.gd'`), consistent with the architecture above.

**Answers:**
- Default tolerance is relative 1e-4. Rounded answers with 3+ significant figures are accepted.
- Kinds:
  - `{kind:'number'|'vector'|'matrix'|'set'|'text', value}`
  - vectors can be `upToScale`

## 5. Figures

Figures are React components in **your own folder** `src/viz/<folder>/`, registered in its `index.ts`:

```ts
export const VIZ: Record<string, VizDef> = { 'core.platformer': { component, validate, doc } }
```

Ids are prefixed by part: `godot.`, `math.`, `core.`, `combat.`, `rpg.`, `ship.`. Never reuse an id. The validator checks every id used in content exists and that `validate(spec)` passes.

**Two kinds:**
1. **Playable** (`src/viz/game`):
   - `GameCanvas`: a fixed 60 Hz update, 320×180 logical pixels, pixel-perfect, focus-to-play, touch d-pad, pauses off-screen
   - `Input`: Godot-like `vector()`, `isDown`, `justPressed`, `timeSincePress`
   - draw helpers in `draw.ts`
   - art via `drawFrame(ctx, sheetId, frame, x, y, { anchored, flipH, flash, scale })` and `animFrame(sheetId, anim, t)`; sounds via `playSound(id)` (only after the learner presses something)

   Mirror the GDScript from the lesson in TypeScript as closely as possible (same variable names, same order of operations), and show the matching GDScript with the learner's current parameter values in a `CodeBlock` (see `topdown.tsx`).
2. **Diagrams and plots** (`src/viz/kit`): `Plane`, `Space3D`, `LinePlot`, `Bars`, `MatGrid`, controls (`Slider`, `SegControl`, `Toggle`, `usePlayer`, `Readout`, `FigureLayout`). Use them for curves, vectors, state machines, data flow and so on.

**Every figure must:**
- be interactive (play it, drag, slide, or step)
- show the numbers that change
- look complete at rest
- come with a `task` in the lesson that leads to the insight

**Use the real assets:**

| Group | Ids |
|---|---|
| Party | `hero`, `mage`, `guard` |
| NPC | `villager`, `villager2` |
| Enemies | `slime`, `bat`, `skeleton`, `golem` |
| Tiles | `tiles_overworld`, `tiles_dungeon`, `tiles_platform` |
| Objects | `objects` |
| Effects | `fx_slash`, `fx_hit`, `fx_dust`, `fx_fireball`, `fx_ice`, `fx_explosion`, `fx_heal`, `fx_stagger`, `fx_levelup` |
| UI | `ui_panel`, `ui_cursor`, `ui_bars`, `icons`, `font_pixel` |

- **Sounds:** `sfx_swing`, `sfx_hit`, `sfx_crit`, `sfx_hurt`, `sfx_jump`, `sfx_land`, `sfx_dash`, `sfx_coin`, `sfx_chest`, `sfx_menu_move`, `sfx_menu_select`, `sfx_menu_back`, `sfx_cast`, `sfx_fire`, `sfx_ice`, `sfx_heal`, `sfx_explosion`, `sfx_stagger`, `sfx_atb_ready`, `sfx_levelup`, `sfx_footstep`, `music_town`, `music_field`, `music_battle`.
- **Animations** for characters:
  - `idle_down|up|side`, `walk_down|up|side`, `attack_down|up|side`, `dash_down|up|side`, `jump_down|side`, `cast`, `hurt`, `ko`, `guard`
  - side faces right; flip for left
- **Animations** for enemies:
  - slime: `idle`, `hop`, `hurt`, `die`
  - bat: `fly`, `hurt`
  - skeleton: `idle`, `walk`, `windup`, `attack`, `hurt`, `die`
  - golem: `idle`, `walk`, `windup`, `slam`, `hurt`, `stagger`
  - effects use `play`
- **Tile names:** in each sheet's `tiles` map (e.g. `SHEETS.tiles_overworld.tiles.grass`).

The art is being produced in parallel; until it lands, `drawFrame` draws labelled placeholder boxes. Write against the API, and handle a missing tile name gracefully (`tiles?.grass ?? 0`). Once the art exists, re-screenshot your figures.

**Colours:**
- UI chrome in figures uses CSS variables via `theme()`; never hard-code UI colours.
- Inside the game screen, use the art and a few neutral fills (walls, overlays), as `topdown.tsx` does.

**Layout and performance:**
- Drawing ≤ 520 px wide in diagrams.
- Game canvases are 320×180 (or smaller), upscaled.
- The side panel is 240 px.
- Must work at 390 px phone width.
- Keep it fast: no allocations per frame where avoidable, and fewer than ~2000 draw calls per frame.

Put CSS in `src/viz/<folder>/<folder>.css`, classes prefixed `<folder>-`. Don't edit `src/styles.css`.

**Check figures visually.**
- The dev server is at `http://localhost:5176` (start `npx vite --port 5176` in the background if it's down).
- Open `#l-<lessonId>` and use "Skip it" to reveal cells.
- Screenshot with Playwright and look at the images. For playable figures, focus the canvas and send key presses (`page.keyboard.down('ArrowRight')`, wait, screenshot), and check behaviour matches the lesson's claims.
- Check the dark theme once.

## 6. Verify and finish

From `/home/user/silver-waddle/godot-guide`:
- `npx tsc --noEmit`: clean.
- `npx vitest run src/content`: your modules, drills and questions pass. Failures caused only by assets that don't exist yet, or by prerequisite modules owned by others, are acceptable while the work is in progress; report them.

Only create files in your own areas:
- `src/content/modules/<yours>`
- `src/drills/<yours>.ts`
- `src/interview/<yours>.ts`
- `src/viz/<yourfolder>/`

Don't edit shared files (the kit, the game kit, types, pages, styles, art). If you need something shared, build it in your folder and mention it in your report.
