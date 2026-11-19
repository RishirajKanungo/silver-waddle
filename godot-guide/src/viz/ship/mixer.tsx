// ship.mixer — the Audio autoload, playable. Three buses (Master, Music, SFX) as linear faders that
// show the dB value Godot stores; a pool of SFX voices with random pitch and round-robin stealing;
// two music players that crossfade with a tween, either in linear amplitude (what audio.gd does) or
// naively in dB, with a plot of both players' volume over time.
import { useMemo, useRef, useState } from 'react';
import type { VizSpec } from '../../content/types';
import { Slider, SegControl, Readout, FigureLayout, LinePlot } from '../kit';
import { CodeBlock } from '../../ui/GameCells';
import { renderSound, SOUNDS } from '../../art';
import { useFrame, linearToDb, dbToLinear } from './common';

interface Voice {
  label: string;
  start: number;
  end: number;
  pitch: number;
  src: AudioBufferSourceNode | null;
  stolen: boolean;
}
interface MusicPlayer {
  id: string | null;
  gain: GainNode | null;
  src: AudioBufferSourceNode | null;
  level: number; // linear 0..1 (what volume_db encodes)
}

const SFX = [
  ['sfx_swing', 'swing'],
  ['sfx_hit', 'hit'],
  ['sfx_coin', 'coin'],
  ['sfx_footstep', 'step'],
] as const;
const MUSIC = [
  ['music_town', 'town'],
  ['music_field', 'field'],
  ['music_battle', 'battle'],
] as const;

export function MixerLab({ spec }: { spec: VizSpec }) {
  const showMusic = spec.music !== false;
  const [vol, setVol] = useState({ Master: 0.8, Music: 0.7, SFX: 1 });
  const [poolSize, setPoolSize] = useState(4);
  const [jitter, setJitter] = useState(0.08);
  const [fade, setFade] = useState(1.5);
  const [curve, setCurve] = useState<'amp' | 'db'>('amp');
  const [, force] = useState(0);
  const audio = useRef<{ ctx: AudioContext; master: GainNode; music: GainNode; sfx: GainNode; bufs: Map<string, AudioBuffer | null> } | null>(null);
  const voices = useRef<Voice[]>([]).current;
  const nextSteal = useRef(0);
  const pitches = useRef<number[]>([]);
  const stolenCount = useRef(0);
  const clock = useRef(0);
  const players = useRef<{ cur: MusicPlayer; prev: MusicPlayer; fade: { t0: number; dur: number; from: number; curve: 'amp' | 'db' } | null }>({
    cur: { id: null, gain: null, src: null, level: 0 },
    prev: { id: null, gain: null, src: null, level: 0 },
    fade: null,
  }).current;
  const missing = useRef(new Set<string>());

  const ensure = () => {
    if (audio.current) return audio.current;
    try {
      const ctx = new AudioContext();
      const master = ctx.createGain(), music = ctx.createGain(), sfx = ctx.createGain();
      music.connect(master);
      sfx.connect(master);
      master.connect(ctx.destination);
      audio.current = { ctx, master, music, sfx, bufs: new Map() };
      applyBuses(vol);
    } catch {
      return null;
    }
    return audio.current;
  };
  const buffer = (id: string) => {
    const a = audio.current;
    if (!a) return null;
    if (a.bufs.has(id)) return a.bufs.get(id) ?? null;
    const data = renderSound(id, a.ctx.sampleRate);
    let b: AudioBuffer | null = null;
    if (data) {
      b = a.ctx.createBuffer(1, data.length, a.ctx.sampleRate);
      b.copyToChannel(data as Float32Array<ArrayBuffer>, 0);
    } else missing.current.add(id);
    a.bufs.set(id, b);
    return b;
  };
  const applyBuses = (v: typeof vol) => {
    const a = audio.current;
    if (!a) return;
    // AudioServer.set_bus_volume_db(index, linear_to_db(linear)): the gain is the linear value
    a.master.gain.value = v.Master;
    a.music.gain.value = v.Music;
    a.sfx.gain.value = v.SFX;
  };
  const setBus = (k: keyof typeof vol, x: number) => {
    const v = { ...vol, [k]: x };
    setVol(v);
    applyBuses(v);
  };

  // ---- play_sfx(stream, pitch_jitter)
  const playSfx = (id: string, label: string) => {
    const a = ensure();
    const now = clock.current;
    while (voices.length < poolSize) voices.push({ label: '', start: 0, end: 0, pitch: 1, src: null, stolen: false });
    if (voices.length > poolSize) voices.length = poolSize;
    // _get_free_player(): first idle voice, else steal in turn
    let v = voices.find((x) => x.end <= now);
    let stolen = false;
    if (!v) {
      v = voices[nextSteal.current % poolSize];
      nextSteal.current = (nextSteal.current + 1) % poolSize;
      stolen = true;
      stolenCount.current++;
      try {
        v.src?.stop();
      } catch {
        /* already stopped */
      }
    }
    const pitch = 1 - jitter + Math.random() * 2 * jitter; // randf_range(1 - j, 1 + j)
    pitches.current = [pitch, ...pitches.current].slice(0, 5);
    const buf = a ? buffer(id) : null;
    const len = (buf ? buf.duration : (SOUNDS[id]?.seconds ?? 0.3)) / pitch;
    v.label = label;
    v.start = now;
    v.end = now + len;
    v.pitch = pitch;
    v.stolen = stolen;
    v.src = null;
    if (a && buf) {
      const src = a.ctx.createBufferSource();
      src.buffer = buf;
      src.playbackRate.value = pitch; // pitch_scale: speeds the sound up, which raises the pitch
      src.connect(a.sfx);
      src.start();
      v.src = src;
    }
  };
  const burst = () => {
    for (let i = 0; i < 8; i++) window.setTimeout(() => playSfx('sfx_hit', 'hit'), i * 40);
  };

  // ---- play_music(stream, fade_time)
  const playMusic = (id: string) => {
    const a = ensure();
    if (players.cur.id === id) return;
    const old = players.cur;
    players.cur = players.prev;
    players.prev = old;
    try {
      players.cur.src?.stop();
    } catch {
      /* not started */
    }
    players.cur.id = id;
    players.cur.level = 0;
    players.cur.src = null;
    if (a) {
      players.cur.gain ??= a.ctx.createGain();
      players.cur.gain.connect(a.music);
      players.cur.gain.gain.value = 0;
      const buf = buffer(id);
      if (buf) {
        const src = a.ctx.createBufferSource();
        src.buffer = buf;
        src.loop = true;
        src.connect(players.cur.gain);
        src.start();
        players.cur.src = src;
      }
    }
    players.fade = { t0: clock.current, dur: fade, from: players.prev.level, curve };
  };
  const stopAll = () => {
    for (const p of [players.cur, players.prev]) {
      try {
        p.src?.stop();
      } catch {
        /* fine */
      }
      p.src = null;
      p.id = null;
      p.level = 0;
    }
    players.fade = null;
  };

  let tick = 0;
  useFrame((dt) => {
    clock.current += dt;
    const f = players.fade;
    if (f) {
      const k = Math.min(1, (clock.current - f.t0) / f.dur);
      if (f.curve === 'amp') {
        // tween_method(_set_player_volume, 0.0, 1.0, fade_time): linear in amplitude
        players.cur.level = k;
        players.prev.level = f.from * (1 - k);
      } else {
        // tween_property(player, "volume_db", ...) from -80 dB to 0 dB: linear in dB
        players.cur.level = dbToLinear(-80 + 80 * k);
        const fromDb = f.from > 0 ? linearToDb(f.from) : -80;
        players.prev.level = f.from > 0 ? dbToLinear(fromDb + (-80 - fromDb) * k) : 0;
      }
      if (k >= 1) {
        players.fade = null;
        try {
          players.prev.src?.stop(); // tween_callback(_music_previous.stop)
        } catch {
          /* fine */
        }
        players.prev.src = null;
        players.prev.level = 0;
        players.prev.id = null;
      }
    }
    if (players.cur.gain) players.cur.gain.gain.value = players.cur.level;
    if (players.prev.gain) players.prev.gain.gain.value = players.prev.level;
    if (++tick % 3 === 0) force((x) => x + 1);
  }, []);

  const now = clock.current;
  const code = useMemo(
    () => `# audio.gd (excerpt): the values in this figure
const POOL_SIZE := ${poolSize}

func play_sfx(stream: AudioStream, pitch_jitter := ${jitter.toFixed(2)}, volume_db := 0.0) -> void:
	var player := _get_free_player()
	player.stream = stream
	player.volume_db = volume_db
	player.pitch_scale = randf_range(1.0 - pitch_jitter, 1.0 + pitch_jitter)
	player.play()

func play_music(stream: AudioStream, fade_time := ${fade.toFixed(2)}) -> void:
	# ...swap the two players, then:
	_music_tween = create_tween().set_parallel(true)
${
  curve === 'amp'
    ? `	_music_tween.tween_method(_set_player_volume.bind(_music_current), 0.0, 1.0, fade_time)
	_music_tween.tween_method(_set_player_volume.bind(_music_previous), db_to_linear(_music_previous.volume_db), 0.0, fade_time)`
    : `	# naive: linear in dB (try it and listen)
	_music_tween.tween_property(_music_current, "volume_db", 0.0, fade_time).from(-80.0)
	_music_tween.tween_property(_music_previous, "volume_db", -80.0, fade_time)`
}
	_music_tween.chain().tween_callback(_music_previous.stop)

# Options menu sliders: Master ${vol.Master.toFixed(2)}, Music ${vol.Music.toFixed(2)}, SFX ${vol.SFX.toFixed(2)}
func set_bus_volume(bus: StringName, linear: float) -> void:
	var index := AudioServer.get_bus_index(bus)
	AudioServer.set_bus_volume_db(index, linear_to_db(linear))
	AudioServer.set_bus_mute(index, linear <= 0.001)
`,
    [poolSize, jitter, fade, curve, vol],
  );

  const dbStr = (x: number) => (x <= 0.001 ? 'muted' : `${linearToDb(x).toFixed(1)} dB`);
  // the crossfade curves for the current settings (previous player starting at full volume)
  const N = 60;
  const curve01 = (k: number): [number, number] => (curve === 'amp' ? [k, 1 - k] : [dbToLinear(-80 + 80 * k), dbToLinear(-80 * k)]);
  const pts = Array.from({ length: N + 1 }, (_, i) => {
    const k = i / N;
    return [k * fade, ...curve01(k)] as [number, number, number];
  });
  const series = [
    { pts: pts.map(([t, a]) => [t, a] as [number, number]), color: 'var(--c-u)', label: 'new track' },
    { pts: pts.map(([t, , b]) => [t, b] as [number, number]), color: 'var(--c-v)', label: 'old track' },
    { pts: pts.map(([t, a, b]) => [t, Math.sqrt(a * a + b * b)] as [number, number]), color: 'var(--muted)', label: 'total power', dashed: true },
  ];
  const fadeNow = players.fade ? Math.min(players.fade.dur, now - players.fade.t0) : null;
  const busy = voices.filter((v) => v.end > now).length;
  const miss = [...missing.current];

  return (
    <FigureLayout
      side={
        <>
          <Slider label="POOL_SIZE" value={poolSize} min={1} max={12} step={1} onChange={setPoolSize} />
          <Slider label="pitch_jitter" value={jitter} min={0} max={0.2} step={0.01} onChange={setJitter} fmt={(v) => '±' + Math.round(v * 100) + '%'} />
          {showMusic && (
            <>
              <Slider label="fade_time" value={fade} min={0.2} max={4} step={0.1} onChange={setFade} fmt={(v) => v.toFixed(1) + ' s'} />
              <SegControl label="tween" value={curve} options={[{ v: 'amp', label: 'amplitude' }, { v: 'db', label: 'volume_db' }]} onChange={setCurve} />
            </>
          )}
          <Readout
            rows={[
              ['\\text{voices busy}', `${busy} / ${poolSize}`],
              ['\\text{voices stolen}', String(stolenCount.current)],
              ['\\text{last pitch\\_scale}', pitches.current.length ? pitches.current.map((p) => p.toFixed(2)).join(' ') : '-'],
              ['\\text{semitones}', pitches.current.length ? (12 * Math.log2(pitches.current[0])).toFixed(2) : '-'],
            ]}
          />
          {miss.length > 0 && <div className="ship-note">Not available yet: {miss.join(', ')}. The figure still shows what would play.</div>}
        </>
      }
      below={<CodeBlock code={code} file="scripts/autoload/audio.gd" compact />}
    >
      <div className="ship-wide" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div className="ship-mixer" role="group" aria-label="audio buses">
          {(['Master', 'Music', 'SFX'] as const).map((b) => (
            <div className="ship-bus" key={b}>
              <b>{b}</b>
              <input type="range" min={0} max={1} step={0.01} value={vol[b]} aria-label={`${b} bus volume`} onChange={(e) => setBus(b, parseFloat(e.target.value))} />
              <span className="db">{vol[b].toFixed(2)}</span>
              <span className="db">{dbStr(vol[b])}</span>
            </div>
          ))}
        </div>
        <div className="ship-btnrow">
          {SFX.map(([id, label]) => (
            <button key={id} onClick={() => playSfx(id, label)}>
              {label}
            </button>
          ))}
          <button className="primary" onClick={burst}>
            8 hits in 0.3 s
          </button>
        </div>
        <div className="ship-voices" aria-label="SFX voice pool">
          {Array.from({ length: poolSize }, (_, i) => {
            const v = voices[i];
            const on = v && v.end > now;
            const frac = on ? (v.end - now) / (v.end - v.start) : 0;
            return (
              <div key={i} className={'ship-voice' + (v && v.stolen && now - v.start < 0.6 ? ' stolen' : '')} title={on ? `${v.label} at pitch ${v.pitch.toFixed(2)}` : 'idle'}>
                <i style={{ width: `${frac * 100}%` }} />
                <span>{on ? v.label : i}</span>
              </div>
            );
          })}
        </div>
        {showMusic && (
          <>
            <div className="ship-btnrow">
              {MUSIC.map(([id, label]) => (
                <button key={id} className={players.cur.id === id ? 'primary' : ''} onClick={() => playMusic(id)}>
                  {label}
                </button>
              ))}
              <button onClick={stopAll}>stop</button>
            </div>
            <LinePlot series={series} x={[0, fade]} y={[0, 1.6]} width={520} height={180} xlabel="seconds into the crossfade" ylabel="linear volume" legend="tr" vlines={fadeNow !== null ? [{ x: fadeNow, color: 'var(--accent)' }] : []} />
          </>
        )}
      </div>
    </FigureLayout>
  );
}
