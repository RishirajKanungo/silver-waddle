// rpg.cutscene — an AnimationPlayer cutscene (r04-3). Mirrors scripts/cutscene.gd:
//   play(): camera = player camera view; make_current(); cutscene_started; anim.play(); await animation_finished;
//           tween back to the player camera (0.5 s, sine in-out); make_current(); cutscene_ended
//   say():  anim.pause(); dialogue_requested; await dialogue_finished; anim.play()
// Tracks: CutsceneCamera:position (smoothstep between keys), Elder:position (linear),
// Elder/AnimatedSprite2D play() method keys, Cutscene say() method key.
import { useMemo, useRef, useState } from 'react';
import type { VizSpec } from '../../content/types';
import { GameCanvas, Keys, theme, rect, text, playSound, type Input } from '../game';
import { Toggle, Readout, FigureLayout, Btn } from '../kit';
import { CodeBlock } from '../../ui/GameCells';
import { W, H, drawNine, drawTyped, drawPortrait, drawActor, drawGround, objectFrame } from './common';
import { drawFrame } from '../game';

const WORLD_W = 480;
const LEN = 5.0;
const SPEED = 70;
const CAM_KEYS: [number, number][] = [
  [0.0, 160],
  [1.0, 160],
  [2.5, 280],
  [5.0, 280],
];
const ELDER_KEYS: [number, number][] = [
  [0.5, 460],
  [2.6, 330],
];
interface MKey {
  t: number;
  track: 'sprite' | 'cutscene';
  call: string;
}
const METHOD_KEYS: MKey[] = [
  { t: 0.5, track: 'sprite', call: 'play("walk_side")' },
  { t: 2.6, track: 'sprite', call: 'play("idle_side")' },
  { t: 2.8, track: 'cutscene', call: 'say("elder_arrives.json", "start")' },
];
const LINES = ['Kai, there you are. I was hoping you would come this way.', 'The well went silent at dawn. Walk with me, and keep your sword close.'];

const smooth = (u: number) => u * u * (3 - 2 * u);
/** value track with smoothstep between keys (the key's easing) */
function evalCam(t: number) {
  if (t <= CAM_KEYS[0][0]) return CAM_KEYS[0][1];
  for (let i = 1; i < CAM_KEYS.length; i++) {
    const [t0, v0] = CAM_KEYS[i - 1], [t1, v1] = CAM_KEYS[i];
    if (t <= t1) return v0 + (v1 - v0) * smooth((t - t0) / (t1 - t0));
  }
  return CAM_KEYS[CAM_KEYS.length - 1][1];
}
function evalElder(t: number) {
  const [[t0, a], [t1, b]] = ELDER_KEYS;
  if (t <= t0) return a;
  if (t >= t1) return b;
  return a + ((b - a) * (t - t0)) / (t1 - t0);
}
const clampCam = (x: number) => Math.max(W / 2, Math.min(WORLD_W - W / 2, x));

type State = 'idle' | 'playing' | 'paused' | 'returning';
interface Sim {
  state: State;
  t: number; // animation position
  returnT: number;
  returnFrom: number;
  camX: number;
  camSpeed: number;
  kx: number;
  ky: number;
  flip: boolean;
  facing: 'down' | 'up' | 'side';
  moving: boolean;
  elderAnim: string;
  dlg: { open: boolean; line: number; progress: number; typing: boolean; visible: number };
  clock: number;
  played: number;
}

export function CutsceneFigure(_: { spec: VizSpec }) {
  const [lock, setLock] = useState(true);
  const [pauseDlg, setPauseDlg] = useState(true);
  const [scrub, setScrub] = useState(0);
  const P = useRef({ lock, pauseDlg, scrub });
  P.current = { lock, pauseDlg, scrub };
  const s = useRef<Sim>({
    state: 'idle',
    t: 0,
    returnT: 0,
    returnFrom: 0,
    camX: 160,
    camSpeed: 0,
    kx: 110,
    ky: 112,
    flip: false,
    facing: 'side',
    moving: false,
    elderAnim: 'idle_side',
    dlg: { open: false, line: 0, progress: 0, typing: false, visible: 0 },
    clock: 0,
    played: 0,
  }).current;
  const [, setTick] = useState(0);
  const frame = useRef(0);
  const startReq = useRef(false);

  const playerCam = () => clampCam(s.kx);
  const active = () => s.state !== 'idle';
  const dialogueOpen = () => s.dlg.open;

  const startCutscene = () => {
    if (active()) return;
    s.state = 'playing';
    s.t = 0;
    s.elderAnim = 'idle_side';
    s.played++;
    playSound('sfx_menu_select', 0.35);
  };
  const say = () => {
    s.dlg = { open: true, line: 0, progress: 0, typing: true, visible: 0 };
    if (P.current.pauseDlg) s.state = 'paused'; // anim.pause()
  };

  const update = (dt: number, input: Input) => {
    s.clock += dt;
    const prevCam = s.camX;
    if (startReq.current) {
      startReq.current = false;
      startCutscene();
    }
    // dialogue box input (DialogueBox._unhandled_input)
    if (s.dlg.open && input.justPressed('interact')) {
      if (s.dlg.typing) {
        s.dlg.typing = false;
        s.dlg.visible = -1;
      } else if (s.dlg.line < LINES.length - 1) {
        s.dlg = { open: true, line: s.dlg.line + 1, progress: 0, typing: true, visible: 0 };
      } else {
        s.dlg.open = false; // dialogue_finished
        if (s.state === 'paused') s.state = 'playing'; // anim.play() resumes
      }
    } else if (!active() && !s.dlg.open && input.justPressed('interact')) startCutscene();
    if (s.dlg.open && s.dlg.typing) {
      s.dlg.progress += 40 * dt;
      const total = LINES[s.dlg.line].length;
      s.dlg.visible = Math.min(total, Math.floor(s.dlg.progress));
      if (s.dlg.visible >= total) {
        s.dlg.typing = false;
        s.dlg.visible = -1;
      }
    }
    // the player controller: locked during cutscene_started..cutscene_ended (and dialogue)
    const locked = (active() && P.current.lock) || (s.dlg.open && P.current.lock);
    let [ix, iy] = input.vector();
    if (locked) ix = iy = 0;
    s.moving = ix !== 0 || iy !== 0;
    if (s.moving) {
      s.kx = Math.max(8, Math.min(WORLD_W - 8, s.kx + ix * SPEED * dt));
      s.ky = Math.max(60, Math.min(160, s.ky + iy * SPEED * dt));
      if (Math.abs(ix) > Math.abs(iy)) {
        s.facing = 'side';
        s.flip = ix < 0;
      } else s.facing = iy < 0 ? 'up' : 'down';
    }
    // AnimationPlayer
    if (s.state === 'playing') {
      const t0 = s.t;
      s.t = Math.min(LEN, s.t + dt);
      for (const k of METHOD_KEYS)
        if (t0 < k.t && s.t >= k.t) {
          if (k.track === 'sprite') s.elderAnim = k.call.includes('walk') ? 'walk_side' : 'idle_side';
          else say();
        }
      s.camX = evalCam(s.t);
      if (s.t >= LEN && s.state === 'playing') {
        // await animation_finished, then glide back
        s.state = 'returning';
        s.returnT = 0;
        s.returnFrom = s.camX;
      }
    } else if (s.state === 'paused') {
      s.camX = evalCam(s.t);
    } else if (s.state === 'returning') {
      s.returnT += dt;
      const u = Math.min(1, s.returnT / 0.5);
      const e = 0.5 - Math.cos(Math.PI * u) / 2; // TRANS_SINE, EASE_IN_OUT
      s.camX = s.returnFrom + (playerCam() - s.returnFrom) * e;
      if (u >= 1) s.state = 'idle'; // make_current(); cutscene_ended
    } else s.camX = playerCam();
    s.camSpeed = Math.abs(s.camX - prevCam) / dt;
    if (++frame.current % 5 === 0) setTick((x) => x + 1);
  };

  const draw = (ctx: CanvasRenderingContext2D) => {
    const th = theme(ctx.canvas);
    // when idle, the scrubber previews the animation at P.scrub (method keys do not fire while scrubbing)
    const preview = s.state === 'idle' && P.current.scrub > 0;
    const camX = preview ? evalCam(P.current.scrub) : s.camX;
    const elderX = s.state === 'idle' ? (preview ? evalElder(P.current.scrub) : s.played ? ELDER_KEYS[1][1] : ELDER_KEYS[0][1]) : evalElder(s.t);
    const ox = Math.round(camX - W / 2);
    drawGround(ctx, ox, 0);
    // the square: a cobbled patch and a well
    rect(ctx, 250 - ox, 70, 150, 80, 'rgba(220,180,122,0.55)');
    const well = objectFrame('well', 'barrel', 'pot');
    if (well !== undefined) drawFrame(ctx, 'objects', well, 372 - ox, 72);
    else {
      rect(ctx, 368 - ox, 74, 24, 18, '#514c68');
      rect(ctx, 370 - ox, 76, 20, 6, '#1e1e50');
    }
    // houses along the top
    for (let hx = 0; hx < WORLD_W; hx += 96) {
      rect(ctx, hx + 8 - ox, 8, 72, 40, '#9c5e3c');
      rect(ctx, hx + 4 - ox, 4, 80, 12, '#4a1530');
      rect(ctx, hx + 36 - ox, 30, 14, 18, '#33202a');
    }
    const tAnim = s.clock;
    const elderWalking = !preview && s.elderAnim === 'walk_side' && (s.state === 'playing' || s.state === 'returning') && s.t < ELDER_KEYS[1][0];
    drawActor(ctx, 'villager', elderWalking ? 'walk_side' : 'idle_side', tAnim, elderX - ox, 104, true);
    drawActor(ctx, 'hero', (s.moving ? 'walk_' : 'idle_') + s.facing, tAnim, s.kx - ox, s.ky, s.flip, '#4c86d6');
    // letterbox bars while the cutscene runs
    if (active()) {
      rect(ctx, 0, 0, W, 10, '#000000');
      rect(ctx, 0, H - 10, W, 10, '#000000');
    }
    if (s.state === 'idle' && !s.dlg.open) text(ctx, preview ? 'scrubbing: method keys do not fire' : 'F: play the cutscene', W / 2, 172, '#fbf6e6', 'center');
    if (s.state === 'paused') {
      rect(ctx, 4, 13, 74, 12, 'rgba(0,0,0,0.7)');
      text(ctx, 'anim paused', 8, 21, '#eebb3e');
    }
    if (s.dlg.open) {
      const line = LINES[s.dlg.line];
      drawNine(ctx, 4, 112, W - 8, 56);
      drawPortrait(ctx, 'villager', 10, 120);
      text(ctx, 'Elder Maren', 48, 124, '#eebb3e');
      drawTyped(ctx, line, s.dlg.visible < 0 ? line.length : s.dlg.visible, 48, 137, 43, '#fbf6e6');
    }
  };

  const tShown = s.state === 'idle' ? scrub : s.t;
  const code = useMemo(
    () =>
      (pauseDlg
        ? `## Called from a method-track key. Pauses the animation until the dialogue closes.
func say(path: String, start_id: String) -> void:
	anim.pause()
	Events.dialogue_requested.emit(path, start_id)
	await Events.dialogue_finished
	anim.play()  # resume where it stopped
`
        : `## Called from a method-track key. The timeline does not wait for the reader.
func say(path: String, start_id: String) -> void:
	Events.dialogue_requested.emit(path, start_id)
`) +
      (lock
        ? `
# player_controller.gd
func _ready() -> void:
	Events.cutscene_started.connect(_set_locked.bind(true))
	Events.cutscene_ended.connect(_set_locked.bind(false))
`
        : `
# player_controller.gd: no lock, the player keeps control during cutscenes
`),
    [pauseDlg, lock],
  );

  return (
    <FigureLayout
      side={
        <>
          <Toggle label="lock player input" value={lock} onChange={setLock} />
          <Toggle label="pause for dialogue (await)" value={pauseDlg} onChange={setPauseDlg} />
          <Btn primary onClick={() => (startReq.current = true)} disabled={active()}>
            Play cutscene
          </Btn>
          <Readout
            rows={[
              ['\\text{state}', s.state === 'paused' ? 'paused (waiting for dialogue)' : s.state],
              ['t', `${tShown.toFixed(2)} / ${LEN.toFixed(1)} s`],
              ['\\text{camera } x', `${(s.state === 'idle' && scrub > 0 ? evalCam(scrub) : s.camX).toFixed(1)} px`],
              ['\\text{camera speed}', `${s.camSpeed.toFixed(0)} px/s`],
              ['\\text{player input}', (active() || s.dlg.open) && lock ? 'locked' : 'free'],
            ]}
          />
        </>
      }
      below={<CodeBlock code={code} file="scripts/cutscene.gd" compact />}
    >
      <div className="world-stack">
        <GameCanvas
          width={W}
          height={H}
          update={update}
          draw={draw}
          touchButtons={['up', 'down', 'left', 'right', 'interact']}
          keysHint={<Keys items={[['WASD / arrows', 'walk'], ['F / Enter', 'play cutscene, advance dialogue']]} />}
          label="cutscene: press F to play; arrows walk Kai; F advances the elder's lines"
        />
        <Timeline t={tShown} scrub={scrub} setScrub={setScrub} idle={s.state === 'idle'} />
      </div>
    </FigureLayout>
  );
}

function Timeline({ t, scrub, setScrub, idle }: { t: number; scrub: number; setScrub: (v: number) => void; idle: boolean }) {
  const L = 112, R = 8, TW = 520;
  const x = (tt: number) => L + (tt / LEN) * (TW - L - R);
  const rows: { label: string; keys: { t: number; label?: string }[]; kind: 'value' | 'method' }[] = [
    { label: 'Camera:position', kind: 'value', keys: CAM_KEYS.map(([tt]) => ({ t: tt })) },
    { label: 'Elder:position', kind: 'value', keys: ELDER_KEYS.map(([tt]) => ({ t: tt })) },
    { label: 'Elder/Sprite (method)', kind: 'method', keys: METHOD_KEYS.filter((k) => k.track === 'sprite').map((k) => ({ t: k.t, label: k.call.replace('play', '') })) },
    { label: 'Cutscene (method)', kind: 'method', keys: METHOD_KEYS.filter((k) => k.track === 'cutscene').map((k) => ({ t: k.t, label: 'say()' })) },
  ];
  const rowH = 22, top = 18;
  const hgt = top + rows.length * rowH + 4;
  return (
    <div className="world-timeline">
      <svg viewBox={`0 0 ${TW} ${hgt}`} role="img" aria-label="animation timeline with tracks, keys and the playhead">
        {[0, 1, 2, 3, 4, 5].map((s) => (
          <g key={s}>
            <line x1={x(s)} x2={x(s)} y1={top - 4} y2={hgt - 2} className="world-tl-grid" />
            <text x={x(s)} y={11} textAnchor={s === 5 ? 'end' : 'middle'} className="world-tl-tick">
              {s} s
            </text>
          </g>
        ))}
        {rows.map((r, i) => {
          const y = top + i * rowH + rowH / 2;
          return (
            <g key={r.label}>
              <text x={4} y={y + 4} className="world-tl-label">
                {r.label}
              </text>
              <line x1={L} x2={TW - R} y1={y} y2={y} className="world-tl-row" />
              {r.kind === 'value' &&
                r.keys.slice(1).map((k, j) => <line key={j} x1={x(r.keys[j].t)} x2={x(k.t)} y1={y} y2={y} className="world-tl-seg" />)}
              {r.keys.map((k, j) => (
                <g key={j} transform={`translate(${x(k.t)}, ${y})`}>
                  <rect x={-4} y={-4} width={8} height={8} transform="rotate(45)" className={'world-tl-key ' + r.kind + (t >= k.t ? ' passed' : '')} />
                  {k.label && (
                    <text x={6} y={-6} className="world-tl-klabel">
                      {k.label}
                    </text>
                  )}
                </g>
              ))}
            </g>
          );
        })}
        <line x1={x(t)} x2={x(t)} y1={top - 6} y2={hgt} className="world-tl-head" />
      </svg>
      <label className="world-tl-scrub">
        <span>scrub</span>
        <input type="range" min={0} max={LEN} step={0.01} value={idle ? scrub : t} disabled={!idle} onChange={(e) => setScrub(parseFloat(e.target.value))} aria-label="timeline position" />
      </label>
    </div>
  );
}
