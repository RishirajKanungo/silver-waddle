// rpg.dialogue — the dialogue box and the dialogue graph.
// mode 'box':   the typewriter from ui/dialogue_box.gd (r04-1). Mirrors _process():
//               _progress += chars_per_second * delta; visible_characters = int(_progress); a PAUSE_CHARS
//               character starts _pause_left = punctuation_pause. interact while typing: _finish_typing();
//               interact when done: advanced. A 'substring' toggle shows the naive reflowing version.
// mode 'graph': the elder's conversation from resources/dialogue/elder.json (r04-2) drawn as a graph, with
//               the story flags it reads and writes. The runner mirrors DialogueBox.play(): branch nodes route,
//               lines type, 'set' effects apply after the line, choices filter on GameState.check().
import { useMemo, useRef, useState } from 'react';
import type { VizSpec } from '../../content/types';
import { GameCanvas, Keys, theme, clear, rect, text, playSound, type Input } from '../game';
import { Slider, Toggle, Readout, FigureLayout, SegControl, Btn } from '../kit';
import { CodeBlock } from '../../ui/GameCells';
import { W, H, drawNine, drawTyped, drawCursor, drawActor, drawPortrait, drawGround, wrap } from './common';

const PAUSE_CHARS = '.,!?;:';
const MAX_CHARS = 43;

// ------------------------------------------------------------------------------- data
interface DNode {
  speaker?: string;
  text?: string;
  next?: string;
  set?: string[];
  choices?: { text: string; next: string; if?: string }[];
  branch?: { if: string; next: string }[];
}
/** resources/dialogue/elder.json from lesson r04-2 */
const ELDER: Record<string, DNode> = {
  router: { branch: [{ if: 'herbs_returned', next: 'thanks' }, { if: 'herbs_started', next: 'progress' }], next: 'greet' },
  greet: { speaker: 'Elder Maren', text: 'Kai. The moonherbs by the north road have wilted, and the festival is in three days.', next: 'ask' },
  ask: { speaker: 'Elder Maren', text: 'Bring me three fresh ones from past the bridge?', choices: [{ text: 'I will.', next: 'accept' }, { text: 'Not now.', next: 'decline' }] },
  accept: { speaker: 'Elder Maren', text: 'Thank you. Mind the slimes near the water.', set: ['herbs_started'], next: 'end' },
  decline: { speaker: 'Elder Maren', text: 'Then come back when you can.', next: 'end' },
  progress: { speaker: 'Elder Maren', text: 'Any luck with the moonherbs?', choices: [{ text: 'Here they are.', if: 'herbs>=3', next: 'turn_in' }, { text: 'Still looking.', next: 'end' }] },
  turn_in: { speaker: 'Elder Maren', text: 'Three, and fresh. The lanterns will burn blue this year.', set: ['herbs_returned'], next: 'end' },
  thanks: { speaker: 'Elder Maren', text: 'Go and enjoy the festival. You earned it.', next: 'end' },
};
const BOX_LINES: { speaker: string; text: string; face: string }[] = [
  { speaker: 'Elder Maren', text: 'Kai. You are up early. The lanterns for the festival are still in their crates.', face: 'villager' },
  { speaker: 'Kai', text: "Couldn't sleep. The well hummed again, unbearably low and patient, like a voice under the water.", face: 'hero' },
  { speaker: 'Elder Maren', text: 'Then we should both be careful today. Come, help me carry the lanterns to the square.', face: 'villager' },
];

type Flags = Record<string, number>;
const NEW_FLAGS: Flags = { herbs_started: 0, herbs: 0, herbs_returned: 0 };

/** GameState.check(): "flag", "!flag", "flag>=N", "" */
function check(flags: Flags, cond: string | undefined): boolean {
  const c = (cond ?? '').trim();
  if (!c) return true;
  if (c.startsWith('!')) return !check(flags, c.slice(1));
  if (c.includes('>=')) {
    const [a, b] = c.split('>=');
    return (flags[a.trim()] ?? 0) >= parseInt(b);
  }
  return (flags[c] ?? 0) > 0;
}

// graph layout (SVG units). Edges to "end" are drawn as short stubs below their node.
const GW = 520, GH = 264;
const POS: Record<string, [number, number]> = {
  router: [46, 96],
  greet: [170, 36],
  ask: [290, 36],
  accept: [440, 14],
  decline: [440, 66],
  progress: [200, 140],
  turn_in: [350, 140],
  thanks: [170, 222],
};
interface Edge {
  from: string;
  to: string;
  label?: string;
  cond?: string;
}
const EDGES: Edge[] = (() => {
  const out: Edge[] = [];
  for (const [id, n] of Object.entries(ELDER)) {
    n.branch?.forEach((b) => out.push({ from: id, to: b.next, label: 'if ' + b.if, cond: b.if }));
    n.choices?.forEach((c) => out.push({ from: id, to: c.next, label: '"' + c.text + '"' + (c.if ? ' if ' + c.if : ''), cond: c.if }));
    if (n.next && !n.choices) out.push({ from: id, to: n.next, label: n.branch ? 'else' : undefined });
  }
  return out;
})();

// ------------------------------------------------------------------------------- state
interface Box {
  open: boolean;
  speaker: string;
  face: string;
  full: string;
  typing: boolean;
  progress: number;
  pauseLeft: number;
  visible: number; // visible_characters (-1 = all)
  t: number; // seconds since the line started
  measured: number | null; // seconds to finish typing, null while typing
  skipped: boolean;
}
interface Run {
  node: string;
  choosing: boolean;
  options: { text: string; next: string; locked: boolean }[];
  cursor: number;
  taken: Set<string>; // "from>to" edges taken this conversation
  visited: Set<string>;
  lastEffect: string;
  lastRoute: string;
}

export function DialogueFigure({ spec }: { spec: VizSpec }) {
  const mode = (spec.mode as 'box' | 'graph') ?? 'box';
  const [cps, setCps] = useState(40);
  const [pause, setPause] = useState(0.12);
  const [reveal, setReveal] = useState<'visible' | 'substring'>('visible');
  const [blip, setBlip] = useState(false);
  const [showLocked, setShowLocked] = useState(false);
  const [flags, setFlagsState] = useState<Flags>({ ...NEW_FLAGS });
  const flagsRef = useRef<Flags>({ ...NEW_FLAGS });
  const setFlags = (f: Flags) => {
    flagsRef.current = f;
    setFlagsState(f);
  };
  const box = useRef<Box>({ open: false, speaker: '', face: 'villager', full: '', typing: false, progress: 0, pauseLeft: 0, visible: 0, t: 0, measured: null, skipped: false }).current;
  const run = useRef<Run>({ node: '', choosing: false, options: [], cursor: 0, taken: new Set(), visited: new Set(), lastEffect: '', lastRoute: '' }).current;
  const lineIdx = useRef(-1);
  const clock = useRef(0);
  const [, setTick] = useState(0);
  const frame = useRef(0);
  const P = useRef({ cps, pause, reveal, blip, showLocked });
  P.current = { cps, pause, reveal, blip, showLocked };

  // --- DialogueBox.say()
  const say = (speaker: string, line: string, face: string) => {
    Object.assign(box, { open: true, speaker, face, full: line, typing: true, progress: 0, pauseLeft: 0, visible: 0, t: 0, measured: null, skipped: false });
  };
  const finishTyping = (skipped: boolean) => {
    box.typing = false;
    box.visible = -1;
    box.skipped = skipped;
    if (!skipped) box.measured = box.t;
  };
  const close = () => {
    box.open = false;
    run.choosing = false;
    run.node = '';
  };

  // --- DialogueBox.play() as a resumable state machine (the GDScript version uses await)
  const enter = (id: string, from?: string) => {
    if (from) run.taken.add(from + '>' + id);
    for (let guard = 0; guard < 20; guard++) {
      run.visited.add(id);
      if (!id || id === 'end') {
        close();
        return;
      }
      const n = ELDER[id];
      if (!n) {
        close();
        return;
      }
      if (n.branch) {
        const f = flagsRef.current;
        const hit = n.branch.find((b) => check(f, b.if));
        const next = hit ? hit.next : n.next ?? 'end';
        run.lastRoute = n.branch.map((b) => `${b.if} ${check(f, b.if) ? 'yes' : 'no'}`).join(', ') + ` → ${next}`;
        run.taken.add(id + '>' + next);
        id = next;
        continue;
      }
      run.node = id;
      say(n.speaker ?? '', n.text ?? '', 'villager');
      return;
    }
  };
  const startConversation = () => {
    run.taken = new Set();
    run.visited = new Set();
    run.lastEffect = '';
    enter('router');
  };
  const afterLine = () => {
    const n = ELDER[run.node];
    if (!n) return close();
    if (n.set?.length) {
      const f = { ...flagsRef.current };
      for (const s of n.set) f[s] = 1;
      setFlags(f);
      run.lastEffect = 'set ' + n.set.join(', ') + ' = 1';
    }
    if (n.choices) {
      const f = flagsRef.current;
      run.options = n.choices.map((c) => ({ text: c.text, next: c.next, locked: !check(f, c.if) })).filter((o) => !o.locked || P.current.showLocked);
      run.cursor = Math.max(0, run.options.findIndex((o) => !o.locked));
      run.choosing = true;
      return;
    }
    enter(n.next ?? 'end', run.node);
  };

  const nextBoxLine = () => {
    lineIdx.current++;
    if (lineIdx.current >= BOX_LINES.length) {
      lineIdx.current = -1;
      box.open = false;
      return;
    }
    const l = BOX_LINES[lineIdx.current];
    say(l.speaker, l.text, l.face);
  };

  const update = (dt: number, input: Input) => {
    clock.current += dt;
    const { cps, pause } = P.current;
    // _unhandled_input
    if (input.justPressed('interact')) {
      if (!box.open) {
        if (mode === 'box') nextBoxLine();
        else startConversation();
        playSound('sfx_menu_select', 0.4);
      } else if (run.choosing) {
        const o = run.options[run.cursor];
        if (o && !o.locked) {
          playSound('sfx_menu_select', 0.5);
          run.choosing = false;
          enter(o.next, run.node);
        }
      } else if (box.typing) finishTyping(true);
      else if (mode === 'box') nextBoxLine();
      else afterLine();
    }
    if (run.choosing && (input.justPressed('up') || input.justPressed('down'))) {
      const d = input.justPressed('up') ? -1 : 1;
      const n = run.options.length;
      for (let k = 1; k <= n; k++) {
        const c = (run.cursor + d * k + n * 4) % n;
        if (!run.options[c].locked) {
          if (c !== run.cursor) playSound('sfx_menu_move', 0.4);
          run.cursor = c;
          break;
        }
      }
    }
    // _process
    if (box.open && box.typing) {
      box.t += dt;
      if (box.pauseLeft > 0) box.pauseLeft -= dt;
      else {
        box.progress += cps * dt;
        const total = box.full.length;
        const shown = Math.min(Math.floor(box.progress), total);
        if (shown > box.visible) {
          box.visible = shown;
          if (P.current.blip && shown % 3 === 0 && box.full[shown - 1] !== ' ') playSound('sfx_menu_move', 0.12);
          if (PAUSE_CHARS.includes(box.full[shown - 1])) box.pauseLeft = pause;
        }
        if (shown >= total) finishTyping(false);
      }
    }
    if (++frame.current % 6 === 0) setTick((t) => t + 1);
  };

  const draw = (ctx: CanvasRenderingContext2D) => {
    const th = theme(ctx.canvas);
    const t = clock.current;
    // scene
    if (mode === 'graph') {
      drawGround(ctx);
      rect(ctx, 0, 0, W, 28, '#514c68');
      rect(ctx, 0, 26, W, 2, '#2c2840');
      drawActor(ctx, 'villager', 'idle_side', t, 196, 86, true);
      drawActor(ctx, 'hero', 'idle_side', t, 162, 88, false, '#4c86d6');
      if (!box.open) {
        drawNine(ctx, 168, 46, 40, 16);
        text(ctx, 'Talk', 176, 57, '#fbf6e6');
      }
    } else {
      clear(ctx, '#33202a');
      drawGround(ctx);
      rect(ctx, 0, 0, W, H, 'rgba(26,20,36,0.35)');
      drawActor(ctx, 'villager', 'idle_down', t, 180, 80);
      drawActor(ctx, 'hero', 'idle_up', t, 140, 92, false, '#4c86d6');
      if (!box.open) text(ctx, 'press F to talk', 160, 130, '#fbf6e6', 'center');
    }
    if (!box.open) return;
    // dialogue box: PanelContainer at the bottom, 4 px from the edges
    const bx = 4, by = 116, bw = W - 8, bh = 60;
    drawNine(ctx, bx, by, bw, bh);
    drawPortrait(ctx, box.face, bx + 6, by + 8);
    text(ctx, box.speaker, bx + 44, by + 12, '#eebb3e');
    drawTyped(ctx, box.full, box.visible < 0 ? box.full.length : box.visible, bx + 44, by + 25, MAX_CHARS, '#fbf6e6', P.current.reveal === 'substring' && box.typing);
    if (!box.typing && !run.choosing) {
      // NextIcon: the cursor turned into a "more" marker, bobbing
      const bob = Math.floor(t * 4) % 2;
      rect(ctx, bx + bw - 14, by + bh - 9 + bob, 6, 2, '#fbf6e6');
      rect(ctx, bx + bw - 13, by + bh - 7 + bob, 4, 1, '#fbf6e6');
      rect(ctx, bx + bw - 12, by + bh - 6 + bob, 2, 1, '#fbf6e6');
    }
    if (box.pauseLeft > 0 && box.typing) rect(ctx, bx + bw - 12, by + 6, 4, 4, th.warn);
    // choices: a VBoxContainer of Buttons in its own panel
    if (run.choosing) {
      const n = run.options.length;
      const cw = 132, ch = 10 + n * 12;
      const cx = W - cw - 6, cy = by - ch - 2;
      drawNine(ctx, cx, cy, cw, ch);
      run.options.forEach((o, i) => {
        const y = cy + 13 + i * 12;
        text(ctx, o.text, cx + 16, y, o.locked ? '#86829e' : '#fbf6e6');
        if (o.locked) rect(ctx, cx + 14, y - 3, o.text.length * 6 + 2, 1, '#86829e');
      });
      drawCursor(ctx, cx + 13, cy + 10 + run.cursor * 12, t);
    }
  };

  // ------------------------------------------------------------------ readouts and code
  const total = box.full.length;
  const vis = box.visible < 0 ? total : box.visible;
  const pauseCount = [...box.full.slice(0, Math.max(0, total - 1))].filter((c) => PAUSE_CHARS.includes(c)).length;
  const predicted = total ? total / cps + pauseCount * pause : 0;

  const code = useMemo(
    () => `@export var chars_per_second := ${cps.toFixed(1)}
@export var punctuation_pause := ${pause.toFixed(2)}

func _process(delta: float) -> void:
	if not _typing:
		return
	if _pause_left > 0.0:
		_pause_left -= delta
		return
	_progress += chars_per_second * delta
	var total := text_label.get_total_character_count()
	var shown := mini(int(_progress), total)
	if shown > text_label.visible_characters:
		text_label.visible_characters = shown
		if text_label.text[shown - 1] in PAUSE_CHARS:
			_pause_left = punctuation_pause
	if shown >= total:
		_finish_typing()
`,
    [cps, pause],
  );

  const nodeJson = (id: string) => {
    const n = ELDER[id];
    if (!n) return '"end"';
    return `"${id}": ` + JSON.stringify(n, null, '\t');
  };

  const flagRow = (k: string) => (
    <div key={k} className="world-flagrow">
      <code>{k}</code>
      {k === 'herbs' ? (
        <Slider label="" value={flags.herbs} min={0} max={5} step={1} onChange={(v) => setFlags({ ...flagsRef.current, herbs: v })} fmt={(v) => v.toFixed(0)} />
      ) : (
        <Toggle label={String(flags[k])} value={flags[k] > 0} onChange={(v) => setFlags({ ...flagsRef.current, [k]: v ? 1 : 0 })} />
      )}
    </div>
  );

  const side =
    mode === 'box' ? (
      <>
        <Slider label="chars_per_second" value={cps} min={10} max={80} step={1} onChange={setCps} fmt={(v) => v.toFixed(0)} />
        <Slider label="punctuation_pause" value={pause} min={0} max={0.4} step={0.01} onChange={setPause} fmt={(v) => v.toFixed(2) + ' s'} />
        <SegControl label="reveal by" value={reveal} options={[{ v: 'visible', label: 'visible_characters' }, { v: 'substring', label: 'substring' }]} onChange={setReveal} />
        <Toggle label="text blip sound" value={blip} onChange={setBlip} />
        <Readout
          rows={[
            ['\\texttt{visible\\_characters}', box.open ? `${box.visible} / ${total}` : '-'],
            ['\\texttt{visible\\_ratio}', box.open && total ? (vis / total).toFixed(2) : '-'],
            ['\\text{chars per frame}', (cps / 60).toFixed(2)],
            ['n,\\ k', box.open ? `${total}, ${pauseCount}` : '-'],
            ['T = n/c + kp', box.open ? `${predicted.toFixed(2)} s` : '-'],
            ['\\text{measured}', box.open ? (box.skipped ? 'skipped' : box.measured !== null ? box.measured.toFixed(2) + ' s' : box.t.toFixed(2) + ' s…') : '-'],
          ]}
        />
      </>
    ) : (
      <>
        <div className="world-k">GameState.flags</div>
        {['herbs_started', 'herbs', 'herbs_returned'].map(flagRow)}
        <Toggle label="show locked choices (greyed)" value={showLocked} onChange={setShowLocked} />
        <Btn
          onClick={() => {
            setFlags({ ...NEW_FLAGS });
            close();
            run.taken = new Set();
            run.visited = new Set();
          }}
        >
          New game (clear flags)
        </Btn>
        <Readout
          rows={[
            ['\\text{node}', run.node || (box.open ? '' : 'not talking')],
            ['\\text{router}', run.lastRoute || '-'],
            ['\\text{effect}', run.lastEffect || '-'],
          ]}
        />
      </>
    );

  return (
    <FigureLayout side={side} below={mode === 'box' ? <CodeBlock code={code} file="ui/dialogue_box.gd" compact /> : <CodeBlock code={nodeJson(run.node || 'router')} file="resources/dialogue/elder.json (current node)" lang="text" compact />}>
      <div className="world-stack">
        <GameCanvas
          width={W}
          height={H}
          update={update}
          draw={draw}
          touchButtons={['up', 'down', 'interact']}
          keysHint={<Keys items={mode === 'box' ? [['F / Enter', 'interact: finish line, then advance']] : [['F / Enter', 'talk, advance, choose'], ['↑ ↓', 'move between choices']]} />}
          label={mode === 'box' ? 'dialogue box: press F to type, skip and advance lines' : 'talk to the elder: F advances and chooses, up and down move between choices'}
        />
        {mode === 'graph' && <Graph flags={flags} run={run} />}
      </div>
    </FigureLayout>
  );
}

function Graph({ flags, run }: { flags: Flags; run: Run }) {
  const nodeW = 78, nodeH = 26;
  return (
    <svg viewBox={`0 0 ${GW} ${GH}`} className="world-graph" role="img" aria-label="the elder's conversation as a graph of nodes and edges">
      <defs>
        <marker id="wg-arrow" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="6" markerHeight="6" orient="auto">
          <path d="M0,0 L8,4 L0,8 z" className="world-g-arrow" />
        </marker>
      </defs>
      {EDGES.map((e, i) => {
        const taken = run.taken.has(e.from + '>' + e.to);
        const open = e.cond === undefined || check(flags, e.cond);
        const cls = 'world-g-edge' + (taken ? ' taken' : '') + (open ? '' : ' closed');
        const lcls = 'world-g-elabel' + (open ? '' : ' closed');
        const [x1, y1] = POS[e.from];
        if (e.to === 'end') {
          // a stub straight down to an "end" dot; choice text to its right
          const sx = x1 + (e.label ? 14 : 0), sy = y1 + nodeH / 2;
          return (
            <g key={i}>
              <line x1={sx} y1={sy} x2={sx} y2={sy + 14} className={cls} />
              <circle cx={sx} cy={sy + 18} r={3.5} className={'world-g-end' + (taken ? ' taken' : '')} />
              <text x={sx + 7} y={sy + 21} className={lcls}>
                {e.label ? e.label + ' → end' : 'end'}
              </text>
            </g>
          );
        }
        const [x2, y2] = POS[e.to];
        const ax = x1 + nodeW / 2, bx = x2 - nodeW / 2;
        const mx = (ax + bx) / 2;
        return (
          <g key={i}>
            <path d={`M ${ax} ${y1} C ${mx} ${y1}, ${mx} ${y2}, ${bx - 2} ${y2}`} className={cls} markerEnd="url(#wg-arrow)" />
            {e.label && (
              <text x={bx - 6} y={y2 - (e.from === 'progress' ? 16 : 6)} textAnchor="end" className={lcls}>
                {e.label}
              </text>
            )}
          </g>
        );
      })}
      {Object.entries(POS).map(([id, [x, y]]) => {
        const n = ELDER[id];
        const cur = run.node === id;
        const visited = run.visited.has(id);
        const isBranch = !!n?.branch;
        return (
          <g key={id} transform={`translate(${x - nodeW / 2}, ${y - nodeH / 2})`}>
            <rect width={nodeW} height={nodeH} rx={isBranch ? 13 : 4} className={'world-g-node' + (cur ? ' cur' : visited ? ' visited' : '') + (isBranch ? ' branch' : '')} />
            <text x={nodeW / 2} y={n?.set ? 11 : 16} textAnchor="middle" className="world-g-nlabel">
              {id}
            </text>
            {n?.set && (
              <text x={nodeW / 2} y={21} textAnchor="middle" className="world-g-set">
                set {n.set[0]}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}

export const validateDialogue = (s: VizSpec) => (s.mode === undefined || s.mode === 'box' || s.mode === 'graph' ? null : "mode must be 'box' or 'graph'");
export { wrap };
