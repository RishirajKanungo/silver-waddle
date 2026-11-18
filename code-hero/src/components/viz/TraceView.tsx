// Step-through visualizer for Python traces.
// Views: heap (frames + objects + arrows, linked lists as chains, trees as trees),
// array (cells + pointer arrows), bars (sorting), grid (DP tables), graph, calltree.

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { CallRecord, SFrame, SObj, SVal, Snapshot } from '../../py/interp';
import type { TraceHint } from '../../course/types';

export interface TraceData {
  trace: Snapshot[];
  calls: CallRecord[];
  truncated: boolean;
}

interface Props {
  data: TraceData;
  hint?: TraceHint;
  step: number;
  setStep: (n: number) => void;
  onEnd?: () => void;
}

const VIEW_LABEL: Record<string, string> = { heap: 'Memory', array: 'Array', bars: 'Bars', calltree: 'Call tree', grid: 'Grid', graph: 'Graph' };

export function TraceControls({ n, step, setStep, playing, setPlaying, speed, setSpeed, event }: { n: number; step: number; setStep: (n: number) => void; playing: boolean; setPlaying: (b: boolean) => void; speed: number; setSpeed: (n: number) => void; event?: string }) {
  return (
    <div className="tc">
      <button className="tc-b" onClick={() => setStep(0)} disabled={step === 0} title="First step">⏮</button>
      <button className="tc-b" onClick={() => setStep(Math.max(0, step - 1))} disabled={step === 0} title="Step back (←)">◀</button>
      <button className="tc-b play" onClick={() => setPlaying(!playing)} title="Play / pause (space)">{playing ? '❚❚' : '▶▶'}</button>
      <button className="tc-b primary" onClick={() => setStep(Math.min(n - 1, step + 1))} disabled={step >= n - 1} title="Step forward (→)">Step ▶</button>
      <button className="tc-b" onClick={() => setStep(n - 1)} disabled={step >= n - 1} title="Last step">⏭</button>
      <input className="tc-slider" type="range" min={0} max={Math.max(0, n - 1)} value={step} onChange={(e) => setStep(+e.target.value)} aria-label="Timeline" />
      <span className="tc-count">
        {step + 1}/{n}
      </span>
      {event && <span className={'tc-ev ' + event}>{event === 'call' ? '→ call' : event === 'return' ? '← return' : event === 'exception' ? '⚠ error' : event === 'done' ? '✓ done' : ''}</span>}
      <select className="tc-speed" value={speed} onChange={(e) => setSpeed(+e.target.value)} aria-label="Speed">
        <option value={1200}>0.5×</option>
        <option value={700}>1×</option>
        <option value={350}>2×</option>
        <option value={120}>5×</option>
      </select>
    </div>
  );
}

export function TraceView({ data, hint, step, setStep, onEnd }: Props) {
  const views = useMemo(() => {
    const v = new Set<string>();
    if (hint?.view && hint.view !== 'heap') v.add(hint.view);
    v.add('heap');
    return [...v];
  }, [hint]);
  const [view, setView] = useState(views[0]);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(hint?.speed ?? 700);
  const n = data.trace.length;
  const snap = data.trace[Math.min(step, n - 1)];
  const prev = step > 0 ? data.trace[step - 1] : undefined;

  useEffect(() => {
    if (!playing) return;
    if (step >= n - 1) {
      setPlaying(false);
      return;
    }
    const t = setTimeout(() => setStep(step + 1), speed);
    return () => clearTimeout(t);
  }, [playing, step, n, speed, setStep]);
  const ended = useRef(false);
  useEffect(() => {
    if (step >= n - 1 && n > 1 && !ended.current) {
      ended.current = true;
      onEnd?.();
    }
  }, [step, n, onEnd]);

  if (!snap) return <div className="viz-empty">Nothing to show yet — run the code.</div>;
  return (
    <div
      className="trace"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'ArrowRight') {
          e.preventDefault();
          setStep(Math.min(n - 1, step + 1));
        } else if (e.key === 'ArrowLeft') {
          e.preventDefault();
          setStep(Math.max(0, step - 1));
        } else if (e.key === ' ') {
          e.preventDefault();
          setPlaying(!playing);
        }
      }}
    >
      <TraceControls n={n} step={step} setStep={(k) => { setPlaying(false); setStep(k); }} playing={playing} setPlaying={setPlaying} speed={speed} setSpeed={setSpeed} event={snap.event} />
      {views.length > 1 && (
        <div className="tv-tabs">
          {views.map((v) => (
            <button key={v} className={v === view ? 'on' : ''} onClick={() => setView(v)}>
              {VIEW_LABEL[v]}
            </button>
          ))}
        </div>
      )}
      <div className="tv-body">
        {view === 'heap' && <HeapView snap={snap} prev={prev} />}
        {view === 'array' && <ArrayView snap={snap} prev={prev} hint={hint!} />}
        {view === 'bars' && <BarsView snap={snap} hint={hint!} />}
        {view === 'grid' && <GridView snap={snap} prev={prev} hint={hint!} />}
        {view === 'graph' && <GraphView snap={snap} hint={hint!} />}
        {view === 'calltree' && <CallTreeView calls={data.calls} step={step} fn={hint?.fn} />}
      </div>
      {snap.error && <div className="tv-error">⚠ {snap.error}</div>}
      {data.truncated && step === n - 1 && <div className="tv-note">Trace stopped after {n} steps (the program kept running). Keep traced examples small.</div>}
    </div>
  );
}

// ---------------- helpers ----------------

function findVar(snap: Snapshot, name: string | undefined): SVal | undefined {
  if (!name) return undefined;
  for (let i = snap.frames.length - 1; i >= 0; i--) {
    const v = snap.frames[i].vars.find(([k]) => k === name);
    if (v) return v[1];
  }
  return undefined;
}
function intOf(v: SVal | undefined): number | null {
  if (v && v.t === 'prim' && (v.type === 'int' || v.type === 'bool')) return Number(v.repr === 'True' ? 1 : v.repr === 'False' ? 0 : v.repr);
  return null;
}
function label(v: SVal, heap: Record<number, SObj>): string {
  if (v.t === 'prim') return v.repr;
  const o = heap[v.id];
  return o ? `${o.type}` : '?';
}
function changed(a: SVal | undefined, b: SVal | undefined) {
  if (!a || !b) return !!a !== !!b;
  if (a.t !== b.t) return true;
  return a.t === 'prim' ? a.repr !== (b as typeof a).repr : a.id !== (b as typeof a).id;
}
function listItems(snap: Snapshot, v: SVal | undefined): { items: SVal[]; isStr: boolean } | null {
  if (!v) return null;
  if (v.t === 'prim' && v.type === 'str') {
    return { items: [...(v.raw ?? '')].map((ch) => ({ t: 'prim', type: 'str', repr: ch })), isStr: true };
  }
  if (v.t === 'ref') {
    const o = snap.heap[v.id];
    if (o?.items) return { items: o.items, isStr: false };
  }
  return null;
}

// ---------------- heap view ----------------

interface Edge {
  from: string;
  to: number;
}

function HeapView({ snap, prev }: { snap: Snapshot; prev?: Snapshot }) {
  const box = useRef<HTMLDivElement>(null);
  const [paths, setPaths] = useState<{ d: string; key: string; code?: boolean }[]>([]);
  const heap = snap.heap;

  // order objects by first reference; detect linked chains and trees
  const layout = useMemo(() => {
    const order: number[] = [];
    const seen = new Set<number>();
    const visit = (v: SVal) => {
      if (v.t !== 'ref' || seen.has(v.id) || !heap[v.id]) return;
      seen.add(v.id);
      order.push(v.id);
      const o = heap[v.id];
      o.items?.forEach(visit);
      o.entries?.forEach(([k, x]) => {
        visit(k);
        visit(x);
      });
      o.attrs?.forEach(([, x]) => visit(x));
    };
    snap.frames.forEach((f) => {
      f.vars.forEach(([, v]) => visit(v));
      if (f.ret) visit(f.ret);
    });
    const attr = (o: SObj, name: string) => o.attrs?.find(([k]) => k === name)?.[1];
    const isNode = (id: number) => heap[id]?.kind === 'instance';
    // trees: instances with left/right
    const treeKids = (id: number) => ['left', 'right'].map((k) => attr(heap[id], k)).map((x) => (x && x.t === 'ref' && isNode(x.id) ? x.id : null));
    const treeNodes = order.filter((id) => isNode(id) && heap[id].attrs?.some(([k]) => k === 'left' || k === 'right'));
    const childOf = new Set<number>();
    treeNodes.forEach((id) => treeKids(id).forEach((c) => c !== null && childOf.add(c)));
    const roots = treeNodes.filter((id) => !childOf.has(id));
    const trees: { id: number; x: number; y: number }[][] = [];
    const used = new Set<number>();
    for (const r of roots) {
      const pos: { id: number; x: number; y: number }[] = [];
      let xi = 0;
      const place = (id: number | null, depth: number) => {
        if (id === null || used.has(id) || depth > 12) return;
        used.add(id);
        const [l, rr] = treeKids(id);
        place(l, depth + 1);
        pos.push({ id, x: xi++, y: depth });
        place(rr, depth + 1);
      };
      place(r, 0);
      if (pos.length) trees.push(pos);
    }
    // chains: instances with `next`
    const nextOf = (id: number) => {
      const nx = attr(heap[id], 'next') ?? attr(heap[id], 'nxt');
      return nx && nx.t === 'ref' && isNode(nx.id) ? nx.id : null;
    };
    const chainNodes = order.filter((id) => !used.has(id) && isNode(id) && heap[id].attrs?.some(([k]) => k === 'next' || k === 'nxt'));
    const pointed = new Set<number>();
    chainNodes.forEach((id) => {
      const n = nextOf(id);
      if (n !== null) pointed.add(n);
    });
    const chains: number[][] = [];
    const starts = [...chainNodes.filter((id) => !pointed.has(id)), ...chainNodes];
    for (const s of starts) {
      if (used.has(s)) continue;
      const ch: number[] = [];
      let cur: number | null = s;
      while (cur !== null && !used.has(cur) && ch.length < 40) {
        used.add(cur);
        ch.push(cur);
        cur = nextOf(cur);
      }
      if (ch.length) chains.push(ch);
    }
    const rest = order.filter((id) => !used.has(id));
    return { chains, trees, rest };
  }, [snap, heap]);

  // arrows
  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    const base = el.getBoundingClientRect();
    const edges: Edge[] = [];
    el.querySelectorAll<HTMLElement>('[data-ref]').forEach((s) => edges.push({ from: s.dataset.key!, to: Number(s.dataset.ref) }));
    const out: { d: string; key: string; code?: boolean }[] = [];
    for (const e of edges) {
      const s = el.querySelector<HTMLElement>(`[data-key="${e.from}"]`);
      const t = el.querySelector<HTMLElement>(`[data-obj="${e.to}"]`);
      if (!s || !t) continue;
      const a = s.getBoundingClientRect(), b = t.getBoundingClientRect();
      const x1 = a.left + a.width / 2 - base.left + el.scrollLeft, y1 = a.top + a.height / 2 - base.top + el.scrollTop;
      let x2 = b.left - base.left + el.scrollLeft, y2 = b.top + 12 - base.top + el.scrollTop;
      if (b.left + b.width / 2 < a.left) x2 = b.right - base.left + el.scrollLeft; // target is to the left
      if (Math.abs(b.top - a.bottom) < 40 && b.top > a.bottom - 4 && Math.abs(b.left + b.width / 2 - (a.left + a.width / 2)) < b.width) {
        x2 = b.left + b.width / 2 - base.left + el.scrollLeft;
        y2 = b.top - base.top + el.scrollTop; // target below
      }
      const dx = Math.max(30, Math.abs(x2 - x1) / 2);
      const k = snap.heap[e.to]?.kind;
      out.push({ key: e.from + '>' + e.to, d: `M${x1},${y1} C${x1 + dx},${y1} ${x2 - dx},${y2} ${x2},${y2}`, code: k === 'function' || k === 'class' });
    }
    setPaths(out);
  }, [snap, layout]);

  const prevVar = (frameId: number, name: string) => prev?.frames.find((f) => f.id === frameId)?.vars.find(([k]) => k === name)?.[1];
  const prevObj = (id: number) => prev?.heap[id];

  return (
    <div className="heap" ref={box}>
      <svg className="heap-svg">
        <defs>
          <marker id="arr" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
            <path d="M0,0 L10,5 L0,10 z" className="arrow-head" />
          </marker>
        </defs>
        {paths.map((p) => (
          <path key={p.key} d={p.d} className={'arrow' + (p.code ? ' code' : '')} markerEnd={p.code ? undefined : 'url(#arr)'} />
        ))}
      </svg>
      <div className="frames">
        <div className="col-title">Frames</div>
        {snap.frames.map((f, i) => (
          <FrameBox key={f.id} f={f} heap={heap} active={i === snap.frames.length - 1} prevVar={(n) => prevVar(f.id, n)} />
        ))}
      </div>
      <div className="objects">
        <div className="col-title">Objects</div>
        {layout.trees.map((t, i) => (
          <div key={'t' + i} className="tree-wrap" style={{ width: (Math.max(...t.map((p) => p.x)) + 1) * 96, height: (Math.max(...t.map((p) => p.y)) + 1) * 86 }}>
            {t.map((p) => (
              <div key={p.id} className="tree-pos" style={{ left: p.x * 96, top: p.y * 86 }}>
                <ObjBox id={p.id} heap={heap} prevObj={prevObj(p.id)} compact />
              </div>
            ))}
          </div>
        ))}
        {layout.chains.map((ch, i) => (
          <div key={'c' + i} className="chain">
            {ch.map((id) => (
              <ObjBox key={id} id={id} heap={heap} prevObj={prevObj(id)} compact />
            ))}
            <span className="chain-none">None</span>
          </div>
        ))}
        <div className="obj-flow">
          {layout.rest.map((id) => (
            <ObjBox key={id} id={id} heap={heap} prevObj={prevObj(id)} />
          ))}
        </div>
      </div>
    </div>
  );
}

function ValCell({ v, k, heap, flash }: { v: SVal; k: string; heap: Record<number, SObj>; flash?: boolean }) {
  if (v.t === 'prim') return <span className={'val prim t-' + v.type + (flash ? ' flash' : '')}>{v.repr}</span>;
  return <span className={'val ptr' + (flash ? ' flash' : '')} data-key={k} data-ref={v.id} title={label(v, heap)} />;
}

function FrameBox({ f, heap, active, prevVar }: { f: SFrame; heap: Record<number, SObj>; active: boolean; prevVar: (n: string) => SVal | undefined }) {
  return (
    <div className={'frame' + (active ? ' active' : '')}>
      <div className="frame-name">{f.name}</div>
      {f.vars.length === 0 && <div className="frame-empty">no variables yet</div>}
      {f.vars.map(([k, v]) => (
        <div key={k} className="frame-row">
          <span className="vname">{k}</span>
          <ValCell v={v} k={`f${f.id}.${k}`} heap={heap} flash={changed(prevVar(k), v)} />
        </div>
      ))}
      {f.ret && (
        <div className="frame-row ret">
          <span className="vname">return</span>
          <ValCell v={f.ret} k={`f${f.id}.__ret`} heap={heap} flash />
        </div>
      )}
    </div>
  );
}

function ObjBox({ id, heap, prevObj, compact }: { id: number; heap: Record<number, SObj>; prevObj?: SObj; compact?: boolean }) {
  const o = heap[id];
  if (!o) return null;
  const isNew = !prevObj;
  const cls = 'obj k-' + o.kind + (isNew ? ' new' : '') + (compact ? ' compact' : '');
  if (o.kind === 'list' || o.kind === 'tuple' || o.kind === 'set' || o.kind === 'deque') {
    return (
      <div className={cls} data-obj={id}>
        <div className="obj-type">{o.type}</div>
        <div className="cells">
          {o.items!.length === 0 && <span className="cell empty">empty</span>}
          {o.items!.slice(0, 40).map((v, i) => (
            <span key={i} className="cell">
              {o.kind !== 'set' && <span className="idx">{i}</span>}
              <ValCell v={v} k={`o${id}.${i}`} heap={heap} flash={!!prevObj && changed(prevObj.items?.[i], v)} />
            </span>
          ))}
          {o.items!.length > 40 && <span className="cell more">… {o.items!.length - 40} more</span>}
        </div>
      </div>
    );
  }
  if (o.kind === 'dict') {
    return (
      <div className={cls} data-obj={id}>
        <div className="obj-type">{o.type}</div>
        <div className="dict">
          {o.entries!.length === 0 && <span className="cell empty">empty</span>}
          {o.entries!.slice(0, 30).map(([k, v], i) => (
            <div key={i} className="kv">
              <ValCell v={k} k={`o${id}.k${i}`} heap={heap} />
              <span className="colon">:</span>
              <ValCell v={v} k={`o${id}.v${i}`} heap={heap} flash={!!prevObj && changed(prevObj.entries?.find(([pk]) => pk.t === 'prim' && k.t === 'prim' && pk.repr === k.repr)?.[1], v)} />
            </div>
          ))}
        </div>
      </div>
    );
  }
  if (o.kind === 'instance') {
    return (
      <div className={cls} data-obj={id}>
        <div className="obj-type">{o.type}</div>
        <div className="attrs">
          {o.attrs!.map(([k, v]) => (
            <div key={k} className="attr">
              <span className="aname">{k}</span>
              <ValCell v={v} k={`o${id}.${k}`} heap={heap} flash={!!prevObj && changed(prevObj.attrs?.find(([pk]) => pk === k)?.[1], v)} />
            </div>
          ))}
          {o.attrs!.length === 0 && <span className="cell empty">no attributes</span>}
        </div>
      </div>
    );
  }
  if (o.kind === 'function')
    return (
      <div className={cls} data-obj={id}>
        <span className="fn-label">ƒ {o.label}</span>
      </div>
    );
  if (o.kind === 'class')
    return (
      <div className={cls} data-obj={id}>
        <div className="obj-type">class {o.label}</div>
        <div className="attrs">
          {o.attrs!.filter(([, v]) => v.t !== 'ref' || heap[v.id]?.kind !== 'function').map(([k, v]) => (
            <div key={k} className="attr">
              <span className="aname">{k}</span>
              <ValCell v={v} k={`o${id}.${k}`} heap={heap} />
            </div>
          ))}
          <span className="methods">{o.attrs!.filter(([, v]) => v.t === 'ref' && heap[v.id]?.kind === 'function').map(([k]) => k + '()').join('  ')}</span>
        </div>
      </div>
    );
  return (
    <div className={cls} data-obj={id}>
      <span className="fn-label">{o.label ?? o.type}</span>
    </div>
  );
}

// ---------------- array / bars ----------------

function ArrayView({ snap, prev, hint }: { snap: Snapshot; prev?: Snapshot; hint: TraceHint }) {
  const arr = listItems(snap, findVar(snap, hint.var));
  const before = prev ? listItems(prev, findVar(prev, hint.var)) : null;
  if (!arr) return <div className="viz-empty">`{hint.var}` is not defined yet — step forward.</div>;
  const ptrs = (hint.pointers ?? []).map((p) => ({ name: p, at: intOf(findVar(snap, p)) })).filter((p) => p.at !== null) as { name: string; at: number }[];
  const n = arr.items.length;
  return (
    <div className="arrview">
      <div className="arr-name">{hint.var}</div>
      <div className="arr-cells" style={{ gridTemplateColumns: `repeat(${n + 1}, minmax(42px, 1fr))` }}>
        {arr.items.map((v, i) => {
          const hit = ptrs.filter((p) => p.at === i || p.at - n === i);
          const flash = before ? changed(before.items[i], v) : false;
          return (
            <div key={i} className={'arr-cell' + (hit.length ? ' hit' : '') + (flash ? ' flash' : '')}>
              <span className="arr-v">{v.t === 'prim' ? (arr.isStr ? v.repr : v.repr) : '•'}</span>
              <span className="arr-i">{i}</span>
            </div>
          );
        })}
        <div className="arr-cell ghost">
          <span className="arr-v">·</span>
          <span className="arr-i">{n}</span>
        </div>
      </div>
      <div className="arr-ptrs" style={{ gridTemplateColumns: `repeat(${n + 1}, minmax(42px, 1fr))` }}>
        {Array.from({ length: n + 1 }, (_, i) => (
          <div key={i} className="arr-ptr-slot">
            {ptrs
              .filter((p) => (p.at < 0 ? p.at + n : p.at) === i || (i === n && p.at >= n))
              .map((p, k) => (
                <span key={p.name} className={'ptr-tag c' + ((hint.pointers ?? []).indexOf(p.name) % 5)} style={{ marginTop: k * 2 }}>
                  ▲ {p.name}
                </span>
              ))}
          </div>
        ))}
      </div>
      <OtherVars snap={snap} skip={[hint.var!, ...(hint.pointers ?? [])]} />
    </div>
  );
}

function BarsView({ snap, hint }: { snap: Snapshot; hint: TraceHint }) {
  const arr = listItems(snap, findVar(snap, hint.var));
  if (!arr) return <div className="viz-empty">`{hint.var}` is not defined yet — step forward.</div>;
  const nums = arr.items.map((v) => (v.t === 'prim' ? Number(v.repr) : 0));
  const max = Math.max(1, ...nums.map(Math.abs));
  const ptrs = (hint.pointers ?? []).map((p) => ({ name: p, at: intOf(findVar(snap, p)) })).filter((p) => p.at !== null) as { name: string; at: number }[];
  return (
    <div className="bars">
      {nums.map((x, i) => {
        const hit = ptrs.filter((p) => p.at === i);
        return (
          <div key={i} className="bar-col">
            <div className={'bar' + (hit.length ? ' hit c' + ((hint.pointers ?? []).indexOf(hit[0].name) % 5) : '')} style={{ height: `${(Math.abs(x) / max) * 100}%` }}>
              <span>{x}</span>
            </div>
            <span className="bar-ptr">{hit.map((p) => p.name).join(',')}</span>
          </div>
        );
      })}
    </div>
  );
}

function OtherVars({ snap, skip }: { snap: Snapshot; skip: string[] }) {
  const top = snap.frames[snap.frames.length - 1];
  const vars = top.vars.filter(([k, v]) => !skip.includes(k) && v.t === 'prim');
  if (!vars.length) return null;
  return (
    <div className="other-vars">
      {vars.map(([k, v]) => (
        <span key={k} className="ov">
          {k} = <b>{v.t === 'prim' ? v.repr : ''}</b>
        </span>
      ))}
    </div>
  );
}

// ---------------- grid ----------------

function GridView({ snap, prev, hint }: { snap: Snapshot; prev?: Snapshot; hint: TraceHint }) {
  const v = findVar(snap, hint.var);
  if (!v || v.t !== 'ref') return <div className="viz-empty">`{hint.var}` is not defined yet — step forward.</div>;
  const rows = snap.heap[v.id]?.items?.map((r) => (r.t === 'ref' ? snap.heap[r.id]?.items ?? [] : [r])) ?? [];
  const pv = prev ? findVar(prev, hint.var) : undefined;
  const prow = pv && pv.t === 'ref' ? prev!.heap[pv.id]?.items?.map((r) => (r.t === 'ref' ? prev!.heap[r.id]?.items ?? [] : [r])) : undefined;
  const ptrs = (hint.pointers ?? []).map((p) => intOf(findVar(snap, p)));
  return (
    <div className="gridview">
      <table>
        <thead>
          <tr>
            <th />
            {(rows[0] ?? []).map((_, j) => (
              <th key={j} className={ptrs[1] === j ? 'ph' : ''}>
                {j}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i}>
              <th className={ptrs[0] === i ? 'ph' : ''}>{i}</th>
              {r.map((c, j) => (
                <td key={j} className={(prow && changed(prow[i]?.[j], c) ? 'flash ' : '') + (ptrs[0] === i && ptrs[1] === j ? 'cur' : '')}>
                  {c.t === 'prim' ? c.repr : '•'}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      <OtherVars snap={snap} skip={[hint.var!]} />
    </div>
  );
}

// ---------------- graph ----------------

function GraphView({ snap, hint }: { snap: Snapshot; hint: TraceHint }) {
  const v = findVar(snap, hint.var);
  if (!v || v.t !== 'ref' || snap.heap[v.id]?.kind !== 'dict') return <div className="viz-empty">`{hint.var}` (an adjacency dict) is not defined yet.</div>;
  const d = snap.heap[v.id];
  const name = (x: SVal) => (x.t === 'prim' ? x.repr.replace(/^'|'$/g, '') : '?');
  const nodes = new Set<string>();
  const edges: [string, string][] = [];
  for (const [k, val] of d.entries!) {
    nodes.add(name(k));
    const nb = val.t === 'ref' ? snap.heap[val.id]?.items ?? [] : [];
    for (const x of nb) {
      nodes.add(name(x));
      edges.push([name(k), name(x)]);
    }
  }
  const list = [...nodes];
  const W = 340, H = 240, R = Math.min(W, H) / 2 - 30;
  const pos = new Map(list.map((n, i) => [n, { x: W / 2 + R * Math.cos((2 * Math.PI * i) / list.length - Math.PI / 2), y: H / 2 + R * Math.sin((2 * Math.PI * i) / list.length - Math.PI / 2) }]));
  const marked = new Map<string, number>();
  (hint.pointers ?? []).forEach((p, pi) => {
    const pvv = findVar(snap, p);
    if (!pvv) return;
    if (pvv.t === 'prim') marked.set(name(pvv), 10 + pi);
    else {
      const o = snap.heap[pvv.id];
      (o?.items ?? o?.entries?.map((e) => e[0]) ?? []).forEach((x) => !marked.has(name(x)) && marked.set(name(x), pi));
    }
  });
  const undirected = edges.every(([a, b]) => edges.some(([c, e]) => c === b && e === a));
  return (
    <div className="graphview">
      <svg viewBox={`0 0 ${W} ${H}`} className="graph-svg">
        <defs>
          <marker id="garr" viewBox="0 0 10 10" refX="22" refY="5" markerWidth="6" markerHeight="6" orient="auto">
            <path d="M0,0 L10,5 L0,10 z" className="arrow-head" />
          </marker>
        </defs>
        {edges.map(([a, b], i) => {
          const p = pos.get(a)!, q = pos.get(b)!;
          if (undirected && a > b) return null;
          return <line key={i} x1={p.x} y1={p.y} x2={q.x} y2={q.y} className="g-edge" markerEnd={undirected ? undefined : 'url(#garr)'} />;
        })}
        {list.map((n) => {
          const p = pos.get(n)!;
          const m = marked.get(n);
          return (
            <g key={n}>
              <circle cx={p.x} cy={p.y} r={16} className={'g-node' + (m === undefined ? '' : m >= 10 ? ' cur' : ' m' + (m % 3))} />
              <text x={p.x} y={p.y + 4} textAnchor="middle" className="g-label">
                {n}
              </text>
            </g>
          );
        })}
      </svg>
      <div className="g-legend">
        {(hint.pointers ?? []).map((p, i) => (
          <span key={p} className={'lg m' + (i % 3)}>
            ● {p}
          </span>
        ))}
      </div>
      <OtherVars snap={snap} skip={[hint.var!, ...(hint.pointers ?? [])]} />
    </div>
  );
}

// ---------------- call tree ----------------

function CallTreeView({ calls, step, fn }: { calls: CallRecord[]; step: number; fn?: string }) {
  const visible = calls.filter((c) => (!fn || c.name === fn) && c.startStep <= step);
  if (!visible.length) return <div className="viz-empty">No calls{fn ? ` to ${fn}()` : ''} yet — step forward.</div>;
  const ids = new Set(visible.map((c) => c.id));
  const kids = new Map<number | null, CallRecord[]>();
  const parentOf = (c: CallRecord): number | null => {
    let p = c.parent;
    while (p !== null && !ids.has(p)) p = calls[p]?.parent ?? null;
    return p;
  };
  for (const c of visible) {
    const p = parentOf(c);
    if (!kids.has(p)) kids.set(p, []);
    kids.get(p)!.push(c);
  }
  const pos = new Map<number, { x: number; y: number }>();
  let leaf = 0;
  let maxDepth = 0;
  const place = (c: CallRecord, d: number): number => {
    maxDepth = Math.max(maxDepth, d);
    const ch = kids.get(c.id) ?? [];
    let x: number;
    if (!ch.length) x = leaf++;
    else {
      const xs = ch.map((k) => place(k, d + 1));
      x = (xs[0] + xs[xs.length - 1]) / 2;
    }
    pos.set(c.id, { x, y: d });
    return x;
  };
  (kids.get(null) ?? []).forEach((r) => place(r, 0));
  // size nodes to the longest label (up to 18 chars) so names like merge_sort stay readable
  const label = (c: { name: string; args: string }) => {
    const full = `${c.name}(${c.args})`;
    return full.length > 18 ? full.slice(0, 17) + '…' : full;
  };
  const longest = Math.max(4, ...visible.map((c) => label(c).length));
  const NW = Math.min(150, Math.max(78, Math.round(longest * 6.6 + 18))), NH = 58;
  const W = Math.max(1, leaf) * NW + 20, H = (maxDepth + 1) * NH + 20;
  const current = visible.filter((c) => c.endStep === undefined || c.endStep > step).pop();
  return (
    <div className="calltree">
      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`}>
        {visible.map((c) => {
          const p = parentOf(c);
          if (p === null) return null;
          const a = pos.get(p)!, b = pos.get(c.id)!;
          return <line key={'e' + c.id} x1={a.x * NW + NW / 2 + 10} y1={a.y * NH + 34} x2={b.x * NW + NW / 2 + 10} y2={b.y * NH + 12} className="ct-edge" />;
        })}
        {visible.map((c) => {
          const p = pos.get(c.id)!;
          const done = c.endStep !== undefined && c.endStep <= step;
          return (
            <g key={c.id} transform={`translate(${p.x * NW + 10}, ${p.y * NH + 10})`}>
              <rect width={NW - 8} height={26} rx={6} className={'ct-node' + (done ? ' done' : '') + (c === current ? ' cur' : '')} />
              <text x={(NW - 8) / 2} y={17} textAnchor="middle" className="ct-text">
                {label(c)}
              </text>
              {done && (
                <text x={(NW - 8) / 2} y={40} textAnchor="middle" className="ct-ret">
                  ↩ {c.ret}
                </text>
              )}
            </g>
          );
        })}
      </svg>
      <div className="ct-legend">
        {visible.length} call{visible.length > 1 ? 's' : ''} so far · <span className="lg cur">■ running</span> <span className="lg done">■ returned</span>
      </div>
    </div>
  );
}
