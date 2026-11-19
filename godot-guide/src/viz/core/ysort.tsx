// core.ysort: walk Kai around a tree, a rock and a villager with Y-sorting on or off. With sorting on,
// objects are drawn in order of their origin's y (like y_sort_enabled on the parent Node2D); off, they
// are drawn in scene-tree order with Kai last. A second control moves the tree's origin from its trunk
// base to its sprite centre, the most common Y-sort bug.
import { useRef, useState } from 'react';
import type { VizSpec } from '../../content/types';
import { GameCanvas, Keys, text, rect, drawFrame, SHEETS, type Input } from '../game';
import { Toggle, Readout, FigureLayout, SegControl } from '../kit';
import { CodeBlock } from '../../ui/GameCells';
import { type Box, moveToward2, feetHit, drawChar, drawGrass, drawShadow } from './motionkit';

const W = 320, H = 180, MAX = 80;
const TREE = { x: 136, y: 96 }; // trunk base
const ROCK = { x: 208, y: 120 };
const NPC = { x: 96, y: 132 };
// feet-level colliders: the trunk, the rock, the villager
const SOLID: Box[] = [
  [TREE.x - 5, TREE.y - 5, 10, 5],
  [ROCK.x - 7, ROCK.y - 6, 14, 6],
  [NPC.x - 5, NPC.y - 5, 10, 5],
  [0, 0, W, 8],
  [0, H - 4, W, 4],
  [0, 0, 4, H],
  [W - 4, 0, 4, H],
];

type Obj = { name: string; key: number; draw: (ctx: CanvasRenderingContext2D) => void };

export function YSortLab({ spec }: { spec: VizSpec }) {
  const [sorted, setSorted] = useState(spec.sorted !== false);
  const [treeOrigin, setTreeOrigin] = useState<'feet' | 'centre'>('feet');
  const [lines, setLines] = useState(true);
  const s = useRef({ x: 136, y: 70, vx: 0, vy: 0, facing: 'down' as 'down' | 'up' | 'side', flip: false, t: 0 }).current;
  const [order, setOrder] = useState<string[]>([]);
  const n = useRef(0);

  const update = (dt: number, input: Input) => {
    const [ix, iy] = input.vector();
    moveToward2(s, ix * MAX, iy * MAX, (ix || iy ? 1200 : 1600) * dt);
    s.x += s.vx * dt;
    if (feetHit(SOLID, s.x, s.y, 8, 4)) {
      s.x -= s.vx * dt;
      s.vx = 0;
    }
    s.y += s.vy * dt;
    if (feetHit(SOLID, s.x, s.y, 8, 4)) {
      s.y -= s.vy * dt;
      s.vy = 0;
    }
    if (ix || iy) {
      if (Math.abs(ix) > Math.abs(iy)) {
        s.facing = 'side';
        s.flip = ix < 0;
      } else s.facing = iy < 0 ? 'up' : 'down';
    }
    s.t += dt;
  };

  const objects = (): Obj[] => [
    {
      name: 'Tree',
      key: treeOrigin === 'feet' ? TREE.y : TREE.y - 16,
      draw: (ctx) => {
        const t = SHEETS['tiles_overworld']?.tiles;
        drawShadow(ctx, TREE.x, TREE.y, 9, 3);
        if (t && t.tree_tl !== undefined) {
          drawFrame(ctx, 'tiles_overworld', t.tree_tl, TREE.x - 16, TREE.y - 30);
          drawFrame(ctx, 'tiles_overworld', t.tree_tr, TREE.x, TREE.y - 30);
          drawFrame(ctx, 'tiles_overworld', t.tree_bl, TREE.x - 16, TREE.y - 14);
          drawFrame(ctx, 'tiles_overworld', t.tree_br, TREE.x, TREE.y - 14);
        } else {
          rect(ctx, TREE.x - 3, TREE.y - 12, 6, 12, '#64392c');
          ctx.fillStyle = '#276838';
          ctx.beginPath();
          ctx.arc(TREE.x, TREE.y - 20, 14, 0, Math.PI * 2);
          ctx.fill();
        }
      },
    },
    {
      name: 'Rock',
      key: ROCK.y,
      draw: (ctx) => {
        const t = SHEETS['tiles_overworld']?.tiles;
        if (t && t.rock_big !== undefined) drawFrame(ctx, 'tiles_overworld', t.rock_big, ROCK.x - 8, ROCK.y - 14);
        else rect(ctx, ROCK.x - 7, ROCK.y - 10, 14, 10, '#86829e');
      },
    },
    {
      name: 'Villager',
      key: NPC.y,
      draw: (ctx) => {
        drawShadow(ctx, NPC.x, NPC.y);
        drawChar(ctx, 'villager', 'idle_down', s.t, NPC.x, NPC.y);
      },
    },
    {
      name: 'Kai',
      key: s.y,
      draw: (ctx) => {
        drawShadow(ctx, s.x, s.y);
        drawChar(ctx, 'hero', (Math.hypot(s.vx, s.vy) > 5 ? 'walk_' : 'idle_') + s.facing, s.t, s.x, s.y, { flip: s.flip });
      },
    },
  ];

  const draw = (ctx: CanvasRenderingContext2D) => {
    drawGrass(ctx, W, H);
    const objs = objects();
    // y_sort_enabled: stable sort by origin y; off: scene-tree order (Kai was added last)
    const list = sorted ? [...objs].sort((a, b) => a.key - b.key) : objs;
    for (const o of list) o.draw(ctx);
    if (lines)
      for (const o of objs) {
        const x = o.name === 'Tree' ? TREE.x : o.name === 'Rock' ? ROCK.x : o.name === 'Villager' ? NPC.x : s.x;
        ctx.fillStyle = o.name === 'Kai' ? 'rgba(255,240,154,0.9)' : 'rgba(255,255,255,0.75)';
        ctx.fillRect(Math.round(x - 14), Math.round(o.key), 28, 1);
        ctx.fillRect(Math.round(x) - 1, Math.round(o.key) - 1, 3, 3);
      }
    const names = list.map((o) => `${o.name} y=${Math.round(o.key)}`);
    rect(ctx, 4, 8, 104, 10, 'rgba(0,0,0,0.5)');
    text(ctx, sorted ? 'y_sort_enabled = true' : 'y_sort_enabled = false', 7, 16, '#ffffff');
    if (++n.current % 10 === 0 && names.join() !== order.join()) setOrder(names);
  };

  const code = `# The room's root (or a "World" Node2D holding everything that moves)
# Inspector: Ordering → Y Sort Enabled = ${sorted ? 'true' : 'false'}
# Each child is drawn in order of its position.y: smaller y (further up) first.
#
# Tree scene: Sprite2D offset so the trunk base sits on the node's origin
#   Tree (StaticBody2D)        position = ${treeOrigin === 'centre' ? 'sprite centre (bug: sorts 16 px early)' : 'trunk base'}
#     Sprite2D                 offset = (0, -14), centered = true
#     CollisionShape2D         10x5 at the trunk
`;

  return (
    <FigureLayout
      side={
        <>
          <Toggle label="y_sort_enabled on the room" value={sorted} onChange={setSorted} />
          <SegControl
            label="tree origin"
            value={treeOrigin}
            onChange={setTreeOrigin}
            options={[
              { v: 'feet', label: 'trunk base' },
              { v: 'centre', label: 'sprite centre' },
            ]}
          />
          <Toggle label="show sort lines (origins)" value={lines} onChange={setLines} />
          <Readout rows={[['\\text{draw order}', '']]} />
          <ol className="core-m-order">
            {order.map((o) => (
              <li key={o}>{o}</li>
            ))}
          </ol>
        </>
      }
      below={<CodeBlock code={code} lang="text" file="scenes/test_room.tscn (structure)" compact />}
    >
      <GameCanvas
        width={W}
        height={H}
        update={update}
        draw={draw}
        touchButtons={['up', 'down', 'left', 'right']}
        keysHint={<Keys items={[['WASD / arrows', 'move Kai around the tree']]} />}
        label="y-sort lab: walk Kai behind and in front of a tree"
      />
    </FigureLayout>
  );
}
