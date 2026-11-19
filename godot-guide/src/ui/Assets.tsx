// The assets a lesson uses: animated previews of sprite sheets, the full sheet with its frame grid,
// tile indices, sound playback, and where the file lives in the starter project.
import { useEffect, useRef, useState } from 'react';
import { SHEETS, SOUNDS, animFrame, drawFrame, sheetCanvas, playSound } from '../art';
import { Md } from './Markup';

export const STARTER_PATH = 'godot-guide/godot/starter/';

function AnimPreview({ id, anim, scale = 3 }: { id: string; anim: string; scale?: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const def = SHEETS[id];
  useEffect(() => {
    let raf = 0;
    const t0 = performance.now();
    const loop = () => {
      raf = requestAnimationFrame(loop);
      const c = ref.current;
      if (!c || !def) return;
      const ctx = c.getContext('2d')!;
      ctx.clearRect(0, 0, c.width, c.height);
      ctx.imageSmoothingEnabled = false;
      const f = animFrame(id, anim, (performance.now() - t0) / 1000);
      drawFrame(ctx, id, f, 0, 0, { scale });
    };
    loop();
    return () => cancelAnimationFrame(raf);
  }, [id, anim, scale, def]);
  if (!def) return null;
  return (
    <figure className="anim-prev">
      <canvas ref={ref} width={def.frameW * scale} height={def.frameH * scale} />
      <figcaption>{anim}</figcaption>
    </figure>
  );
}

function SheetView({ id }: { id: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const def = SHEETS[id];
  const scale = def && def.frameW * def.cols > 256 ? 2 : 3;
  useEffect(() => {
    const c = ref.current;
    if (!c || !def) return;
    const src = sheetCanvas(id);
    c.width = src.width * scale;
    c.height = src.height * scale;
    const ctx = c.getContext('2d')!;
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(src, 0, 0, c.width, c.height);
    // frame grid
    ctx.strokeStyle = 'rgba(127,127,127,0.45)';
    ctx.lineWidth = 1;
    for (let x = 0; x <= def.cols; x++) {
      ctx.beginPath();
      ctx.moveTo(x * def.frameW * scale + 0.5, 0);
      ctx.lineTo(x * def.frameW * scale + 0.5, c.height);
      ctx.stroke();
    }
    for (let y = 0; y <= def.rows; y++) {
      ctx.beginPath();
      ctx.moveTo(0, y * def.frameH * scale + 0.5);
      ctx.lineTo(c.width, y * def.frameH * scale + 0.5);
      ctx.stroke();
    }
  }, [id, def, scale]);
  return (
    <div className="sheet-view">
      <canvas ref={ref} />
    </div>
  );
}

function AssetCard({ id }: { id: string }) {
  const [full, setFull] = useState(false);
  const def = SHEETS[id];
  const snd = SOUNDS[id];
  if (snd)
    return (
      <div className="asset-card sound">
        <div className="asset-head">
          <b>{snd.title}</b>
          <span className="asset-kind">{snd.kind === 'music' ? 'music loop' : 'sound effect'} · {snd.seconds.toFixed(snd.seconds < 2 ? 2 : 0)} s</span>
        </div>
        <button onClick={() => playSound(snd.id, snd.kind === 'music' ? 0.35 : 0.6)}>Play</button>
        <code className="asset-path">{STARTER_PATH + snd.file}</code>
        {snd.notes && <div className="small muted">{snd.notes}</div>}
      </div>
    );
  if (!def) return <div className="asset-card missing">Unknown asset {id}</div>;
  const anims = Object.keys(def.anims ?? {});
  return (
    <div className="asset-card">
      <div className="asset-head">
        <b>{def.title}</b>
        <span className="asset-kind">
          {def.kind} · {def.frameW}×{def.frameH} px frames · {def.cols}×{def.rows} grid
        </span>
      </div>
      {anims.length > 0 ? (
        <div className="anim-row">
          {anims.slice(0, full ? anims.length : 6).map((a) => (
            <AnimPreview key={a} id={id} anim={a} scale={def.frameW <= 16 ? 4 : def.frameW <= 32 ? 3 : 2} />
          ))}
        </div>
      ) : (
        <SheetView id={id} />
      )}
      {anims.length > 0 && (
        <button className="link small" onClick={() => setFull(!full)}>
          {full ? 'Hide sheet' : `Show the whole sheet${anims.length > 6 ? ` and all ${anims.length} animations` : ''}`}
        </button>
      )}
      {full && anims.length > 0 && <SheetView id={id} />}
      {def.tiles && Object.keys(def.tiles).length > 0 && def.kind !== 'font' && (
        <details className="tile-index">
          <summary>Named tiles</summary>
          <div className="small">
            {Object.entries(def.tiles)
              .map(([k, v]) => `${k} = ${v} (col ${v % def.cols}, row ${Math.floor(v / def.cols)})`)
              .join(' · ')}
          </div>
        </details>
      )}
      <code className="asset-path">{STARTER_PATH + def.file}</code>
      {def.notes && <div className="small muted">{def.notes}</div>}
    </div>
  );
}

export function AssetsPanel({ ids, note }: { ids: string[]; note?: string }) {
  return (
    <section className="assets">
      <div className="cell-k">Assets for this lesson</div>
      {note && <Md text={note} className="assets-note" />}
      <div className="asset-grid">
        {ids.map((id) => (
          <AssetCard key={id} id={id} />
        ))}
      </div>
      <div className="small muted">
        All assets are original to this guide and free to use in your own games (CC0). They are already in the starter project at <code>{STARTER_PATH}</code> in the repository.
      </div>
    </section>
  );
}
