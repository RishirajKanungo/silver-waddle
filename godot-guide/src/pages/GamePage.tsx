// "The Game": the design document for the RPG this course builds, and where each feature is taught.
import { Md } from '../ui/Markup';
import { MODULES, moduleNumber, findModule } from '../content';
import { VIZ } from '../viz/registry';
import { VizCell } from '../ui/Cells';
import { SHEETS, animFrame, drawFrame } from '../art';
import { useEffect, useRef } from 'react';
import { md } from '../content/types';

function Lineup({ ids }: { ids: [string, string][] }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    let raf = 0;
    const t0 = performance.now();
    const loop = () => {
      raf = requestAnimationFrame(loop);
      const c = ref.current;
      if (!c) return;
      const ctx = c.getContext('2d')!;
      ctx.clearRect(0, 0, c.width, c.height);
      ctx.imageSmoothingEnabled = false;
      const t = (performance.now() - t0) / 1000;
      ids.forEach(([id, anim], i) => {
        const def = SHEETS[id];
        if (!def) return;
        const s = 3;
        const x = 12 + i * 112 + (96 - def.frameW * s) / 2;
        const y = c.height - 8 - def.frameH * s;
        drawFrame(ctx, id, animFrame(id, anim, t), x, y, { scale: s });
      });
    };
    loop();
    return () => cancelAnimationFrame(raf);
  }, [ids]);
  return <canvas ref={ref} width={12 + ids.length * 112} height={160} className="lineup" aria-label="the party and enemies, animated" />;
}

const FEATURES: { feature: string; what: string; modules: string[] }[] = [
  { feature: 'Fluid top-down movement', what: 'Acceleration and friction tuned by feel, 8 directions, a dash with invincibility frames, input buffering.', modules: ['c02', 'm02', 'm03'] },
  { feature: 'Height and platforming', what: 'Jumping between elevation levels in a top-down world (a separate height axis with a shadow), ledges, gaps and moving platforms; a side-view platformer controller as well.', modules: ['c03', 'm02', 'm04'] },
  { feature: 'Real-time combat that feels heavy', what: 'Attack strings with startup, active and recovery frames, hitboxes and hurtboxes, hitstop, screen shake, knockback, hit flashes.', modules: ['k01', 'm03', 'c05'] },
  { feature: 'Hybrid ATB battle system', what: 'Landing hits fills an ATB gauge; tactical mode slows time so you can spend ATB on abilities, spells and items; enemies build pressure and then stagger, taking extra damage.', modules: ['k03', 'k04', 'm05'] },
  { feature: 'A party of three', what: 'Switch which character you control at any time, command the other two from tactical mode, and let them fight on their own with simple, readable AI.', modules: ['k05', 'k02'] },
  { feature: 'Gear, shards and abilities', what: 'Weapons, armour and accessories modify stats; socketable shards grant spells and passive effects; weapons teach abilities through use.', modules: ['r01', 'r02'] },
  { feature: 'An adventure to explore', what: 'Tile-based towns and dungeons, rooms and transitions, NPCs, dialogue, quests, chests and shops.', modules: ['c04', 'r03', 'r04'] },
  { feature: 'Menus, HUD and saves', what: 'A pixel-art interface that works with a gamepad, party HP/MP/ATB bars, inventory and equipment screens, save slots.', modules: ['r05', 'r06'] },
  { feature: 'GBA-era pixel art with modern polish', what: '16×16 tiles at 320×180, crisp integer scaling, limited palettes; shaders, particles, lighting and sound for feedback.', modules: ['c01', 'p01'] },
  { feature: 'A release on Steam', what: 'Scope a vertical slice, test it, export it, set up Steamworks, build the store page and launch.', modules: ['p02', 'p03', 'p04'] },
];

const DESIGN = md`### The pitch

**Shardbound** is a 2D action RPG drawn like a late Game Boy Advance game and played like a modern action game. You lead a party of three through a hand-built region: a town, an overworld with cliffs and ruins, and a dungeon that ends in a boss. Exploration rewards movement skill (jumping between ledges, dashing across gaps). Battles happen in the world without a screen transition and mix real-time attacks with a tactical layer.

It is the project this course builds, one system per module. By the capstone you have a vertical slice: about 20–30 minutes of finished play that shows every system working together, which is what you need for a Steam page, a demo and playtests.

### Design pillars

1. **Moving feels good.** Responsive, predictable, a little forgiving (input buffering, coyote time). Movement is the thing players touch every second.
2. **Every hit reads.** Clear telegraphs before enemy attacks, clear feedback when you land one: hitstop, flash, knockback, sound.
3. **Real time and tactics in one fight.** You attack and dodge in real time to build resources, then pause the clock to spend them well. Neither half works without the other.
4. **The party matters.** Each character plays differently, and the best results come from combining them.
5. **Small and finished beats big and broken.** Scope is a design constraint, not a failure.

### The battle system

The model is the one popularised by *Final Fantasy VII Remake* and its sequels, adapted to a 2D top-down view:

- **Real-time layer.** Light attack strings, a dodge with invincibility frames, a guard that reduces damage. Basic attacks do modest damage; their main job is to fill the ATB gauge.
- **ATB.** Each character has a gauge with two segments. Hits you land fill it fastest; guarding and time fill it slowly.
- **Tactical mode.** Hold a button and time slows to a crawl (in Godot: a lower time scale for gameplay nodes). A menu lists abilities, spells and items, each costing one or two ATB segments (spells also cost MP). Choose a target and release.
- **Pressure and stagger.** Every enemy has a stagger gauge. Hits fill it slowly; weakness hits and some abilities fill it fast, and certain conditions (hitting an enemy during its attack, for example) put it in a *pressured* state where the gauge fills faster. When the gauge is full the enemy is **staggered**: helpless for a few seconds and taking a damage multiplier that some abilities can raise further.
- **The party.** Three characters on the field. You control one and can switch instantly. The other two follow simple AI and act on their own, but they only use ATB abilities when you command them from tactical mode, so their ATB is yours to spend. Linked abilities that need two characters' ATB come later in the course.
- **Limit gauge.** Filled by taking damage and staggering enemies; spent on a character's strongest move.

The figure below is a small playable version of the loop, built in the combat modules.`;

const REFERENCES = md`### What we take from the reference games

| Game | What to study | Where it shows up |
|---|---|---|
| *Final Fantasy VII Remake / Rebirth* | ATB earned by attacking, tactical slow-down, pressure → stagger with a damage multiplier, party switching, synergy abilities | the battle system, the party |
| *CrossCode* | top-down movement with a real height axis, jumping between levels, fast readable combat in a pixel-art world, puzzle rooms | movement, height, combat feel |
| *Sea of Stars* | modern pixel art and lighting at a GBA-like scale, a party that feels distinct, timing-based interaction | art, polish, party |
| *Mina the Hollower* | tight Game Boy Color-era constraints (small palettes, low resolution) used as a style rather than a limitation; precise action | art direction, scope |
| GBA-era RPGs (*Golden Sun*, *Sword of Mana*, *The Minish Cap*) | 16×16 tiles, character sprites around 16×24, layered tile maps with elevation, small expressive animations | the pixel-art pipeline and the assets |

Study them by playing with a notebook: write down the timing of one attack, how far a dash goes, what the HUD shows. The course points out what to measure.

### Technical baseline

- **Godot 4.4 or newer**, GDScript with static types.
- **Resolution 320×180**, scaled by an integer to the window (×4 = 1280×720, ×6 = 1920×1080); nearest-neighbour filtering. A GBA screen was 240×160 (3:2); 320×180 keeps the pixel density and fits 16:9 monitors and the Steam Deck's 1280×800 with letterboxing.
- **16×16 tiles**, characters on 32×32 frames (about 16×24 of actual character).
- **Physics at 60 Hz** (Godot's default), with movement written for any frame rate.
- **Data in Resources** (\`.tres\`): characters, enemies, abilities, items and shards are data, not code, so content can grow without new scripts.`;

export function GamePage() {
  return (
    <div className="page narrow game-page">
      <h1>The game you are building</h1>
      <p className="lede">A design document for the RPG this course builds, with links to where each part is taught.</p>
      <Lineup
        ids={[
          ['hero', 'walk_down'],
          ['mage', 'idle_down'],
          ['guard', 'walk_side'],
          ['slime', 'idle'],
          ['skeleton', 'walk'],
        ]}
      />
      <Md text={DESIGN} className="prose" />
      {VIZ['combat.battle'] ? (
        <VizCell viz={{ type: 'combat.battle', mode: 'full' }} task={md`Fight with **J**, dodge with **K**, hold **L** for tactical mode and pick an ability, switch characters with **Q**. Watch the stagger gauge.`} />
      ) : null}
      <h2>Features and where they are taught</h2>
      <div className="md-table">
        <table className="feature-table">
          <thead>
            <tr>
              <th>Feature</th>
              <th>What it means here</th>
              <th>Modules</th>
            </tr>
          </thead>
          <tbody>
            {FEATURES.map((f) => (
              <tr key={f.feature}>
                <td>
                  <b>{f.feature}</b>
                </td>
                <td>{f.what}</td>
                <td>
                  {f.modules
                    .filter((m) => findModule(m))
                    .map((m) => (
                      <a key={m} href={'#m-' + m} className="mod-chip" title={findModule(m)?.title}>
                        {moduleNumber(m)}
                      </a>
                    ))}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Md text={REFERENCES} className="prose" />
      <p className="muted small">{MODULES.length} modules are available.</p>
    </div>
  );
}
