// ship.steampipe — how a build reaches players. Export from Godot into local folders, upload them
// with steamcmd (one depot per platform) to create a numbered build, then set that build live on a
// branch. Uploading changes nothing for players until a build is set live; the default branch is
// set live from the Steamworks website, not by the upload script.
import { useMemo, useState } from 'react';
import type { VizSpec } from '../../content/types';
import { SegControl, Toggle, Readout, FigureLayout, Btn } from '../kit';
import { CodeBlock } from '../../ui/GameCells';

interface Build {
  id: number;
  version: string;
  linux: boolean;
}
const APP = 1234560; // placeholder app ID

export function SteamPipe({ spec }: { spec: VizSpec }) {
  void spec;
  const [exported, setExported] = useState(1); // local version number, 0.1.x
  const [linux, setLinux] = useState(true);
  const [liveFlag, setLiveFlag] = useState<'' | 'beta'>('beta');
  const [builds, setBuilds] = useState<Build[]>([]);
  const [live, setLive] = useState<{ default: number | null; beta: number | null }>({ default: null, beta: null });
  const [sel, setSel] = useState<number | null>(null);
  const [log, setLog] = useState<string[]>(['Export a build from Godot, then upload it.']);
  const say = (s: string) => setLog((l) => [s, ...l].slice(0, 5));
  const version = `0.1.${exported}`;
  const nextId = 18000000 + builds.length * 137 + 42;

  const upload = () => {
    if (builds.some((b) => b.version === version && b.linux === linux)) {
      say(`Build ${version} is already uploaded; export a new version first.`);
      return;
    }
    const b: Build = { id: nextId, version, linux };
    setBuilds((bs) => [b, ...bs]);
    setSel(b.id);
    if (liveFlag === 'beta') {
      setLive((l) => ({ ...l, beta: b.id }));
      say(`steamcmd uploaded build ${b.id} (${version}) and set it live on "beta".`);
    } else say(`steamcmd uploaded build ${b.id} (${version}). No branch changed.`);
  };
  const goLive = (branch: 'default' | 'beta') => {
    if (sel === null) return;
    setLive((l) => ({ ...l, [branch]: sel }));
    const b = builds.find((x) => x.id === sel)!;
    say(branch === 'default' ? `Steamworks website: build ${b.id} (${b.version}) set live on default and published.` : `Build ${b.id} set live on beta.`);
  };
  const desc = (id: number | null) => {
    if (id === null) return 'nothing yet';
    const b = builds.find((x) => x.id === id)!;
    return `${b.version} (build ${b.id})`;
  };
  const deckGets = (id: number | null) => (id === null ? 'nothing yet' : builds.find((x) => x.id === id)!.linux ? 'the native Linux build' : 'the Windows build through Proton');

  const vdf = useMemo(
    () => `"AppBuild"
{
	"AppID" "${APP}"
	"Desc" "Shardbound ${version}"
	"ContentRoot" "../builds/"
	"BuildOutput" "../steam_output/"
	"SetLive" "${liveFlag}"
	"Depots"
	{
		"${APP + 1}"
		{
			"FileMapping"
			{
				"LocalPath" "windows/*"
				"DepotPath" "."
				"recursive" "1"
			}
		}${
      linux
        ? `
		"${APP + 2}"
		{
			"FileMapping"
			{
				"LocalPath" "linux/*"
				"DepotPath" "."
				"recursive" "1"
			}
		}`
        : ''
    }
	}
}
`,
    [version, liveFlag, linux],
  );

  const box = (x: number, y: number, w: number, h: number, title: string, sub: string, on = true) => (
    <g>
      <rect x={x} y={y} width={w} height={h} rx={6} style={{ fill: on ? 'var(--surface2)' : 'none', stroke: on ? 'var(--accent)' : 'var(--line)', strokeDasharray: on ? undefined : '4 3' }} />
      <text x={x + w / 2} y={y + 17} textAnchor="middle" style={{ fontWeight: 600 }}>
        {title}
      </text>
      <text x={x + w / 2} y={y + 33} textAnchor="middle" className="muted">
        {sub}
      </text>
    </g>
  );
  const arrow = (x1: number, y1: number, x2: number, y2: number) => <line x1={x1} y1={y1} x2={x2} y2={y2} markerEnd="url(#sp-arrow)" style={{ stroke: 'var(--muted)', strokeWidth: 1.5 }} />;

  return (
    <FigureLayout
      side={
        <>
          <div className="ship-btnrow">
            <Btn onClick={() => { setExported((v) => v + 1); say(`Exported ${`0.1.${exported + 1}`} to builds/windows${linux ? ' and builds/linux' : ''}.`); }}>Export from Godot</Btn>
            <Btn primary onClick={upload}>Run steamcmd</Btn>
          </div>
          <Toggle label="Linux depot (native Deck build)" value={linux} onChange={setLinux} />
          <SegControl label="SetLive" value={liveFlag} options={[{ v: '', label: '"" (none)' }, { v: 'beta', label: '"beta"' }]} onChange={setLiveFlag} />
          <div className="ship-note">Builds (click to select):</div>
          <div className="ship-btnrow">
            {builds.length === 0 && <span className="ship-muted">none uploaded</span>}
            {builds.slice(0, 6).map((b) => (
              <button key={b.id} className={sel === b.id ? 'primary' : ''} onClick={() => setSel(b.id)}>
                {b.version}
              </button>
            ))}
          </div>
          <div className="ship-btnrow">
            <Btn disabled={sel === null} onClick={() => goLive('beta')}>
              Set live: beta
            </Btn>
            <Btn disabled={sel === null} onClick={() => goLive('default')}>
              Set live: default
            </Btn>
          </div>
          <Readout
            rows={[
              ['\\text{players (default)}', desc(live.default)],
              ['\\text{testers (beta)}', desc(live.beta)],
              ['\\text{Deck players get}', deckGets(live.default)],
            ]}
          />
        </>
      }
      below={<CodeBlock code={vdf} file={`steam/app_build_${APP}.vdf`} lang="text" compact />}
    >
      <div className="ship-wide">
        <svg viewBox="0 0 520 250" className="ship-svg" role="img" aria-label="SteamPipe: local builds to depots to a build to branches">
          <defs>
            <marker id="sp-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
              <path d="M0,0 L10,5 L0,10 z" style={{ fill: 'var(--muted)' }} />
            </marker>
          </defs>
          {box(8, 20, 120, 44, 'builds/windows', `Shardbound ${version}`)}
          {box(8, 84, 120, 44, 'builds/linux', linux ? `Shardbound ${version}` : 'not exported', linux)}
          {arrow(128, 42, 186, 42)}
          {linux && arrow(128, 106, 186, 106)}
          {box(188, 20, 130, 44, `depot ${APP + 1}`, 'Windows content')}
          {box(188, 84, 130, 44, `depot ${APP + 2}`, 'Linux content', linux)}
          {arrow(318, 42, 376, 72)}
          {linux && arrow(318, 106, 376, 82)}
          {box(378, 52, 134, 44, 'build', builds[0] ? `${builds[0].id}` : 'not uploaded', builds.length > 0)}
          {arrow(445, 96, 445, 150)}
          {box(300, 152, 100, 44, 'beta', desc(live.beta).split(' ')[0], live.beta !== null)}
          {box(412, 152, 100, 44, 'default', desc(live.default).split(' ')[0], live.default !== null)}
          <text x={8} y={176} className="muted">
            steamcmd uploads; the website
          </text>
          <text x={8} y={192} className="muted">
            sets "default" live and publishes.
          </text>
          {log.slice(0, 2).map((l, i) => (
            <text key={i} x={8} y={226 + i * 16} style={{ opacity: i ? 0.55 : 1 }}>
              {l}
            </text>
          ))}
        </svg>
      </div>
    </FigureLayout>
  );
}
