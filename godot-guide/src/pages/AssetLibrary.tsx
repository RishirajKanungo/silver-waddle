import { useState } from 'react';
import { SHEETS, SOUNDS } from '../art';
import { AssetsPanel, STARTER_PATH } from '../ui/Assets';

const GROUPS: [string, string[]][] = [
  ['Party', ['character']],
  ['Enemies', ['enemy']],
  ['People', ['npc']],
  ['Tilesets', ['tileset']],
  ['Objects', ['object']],
  ['Effects', ['fx']],
  ['Interface', ['ui', 'icon', 'font']],
];

export function AssetLibrary() {
  const [tab, setTab] = useState('Party');
  const sheets = Object.values(SHEETS);
  const sounds = Object.values(SOUNDS);
  return (
    <div className="page">
      <h1>Asset library</h1>
      <p className="lede">
        Every sprite, tile, effect and sound used in the lessons. All of it is original to this guide and released as CC0, so you can ship it in a commercial game. The files are in the starter
        project at <code>{STARTER_PATH}</code>.
      </p>
      <div className="ctl-seg lib-tabs" role="tablist">
        {[...GROUPS.map(([g]) => g), 'Sound', 'Music'].map((g) => (
          <button key={g} role="tab" aria-selected={tab === g} className={tab === g ? 'on' : ''} onClick={() => setTab(g)}>
            {g}
          </button>
        ))}
      </div>
      {GROUPS.filter(([g]) => g === tab).map(([g, kinds]) => {
        const ids = sheets.filter((s) => kinds.includes(s.kind)).map((s) => s.id);
        return ids.length ? <AssetsPanel key={g} ids={ids} /> : <p key={g} className="muted">No assets in this group yet.</p>;
      })}
      {tab === 'Sound' && <AssetsPanel ids={sounds.filter((s) => s.kind === 'sfx').map((s) => s.id)} />}
      {tab === 'Music' && <AssetsPanel ids={sounds.filter((s) => s.kind === 'music').map((s) => s.id)} />}
    </div>
  );
}
