// After a run: the variables you created, with their shapes. In ML code most bugs are shape bugs,
// so seeing (n, d) next to every array is the fastest debugger there is.
import { useState } from 'react';
import type { RunResult } from '@py/interp';
import { PyFunc, PyClass, PyModule, PyBuiltin, PyList, PyTuple, PyDict, typeNameOf, type PyVal } from '@py/values';

interface ArrLike {
  shape?: number[];
  dtype?: unknown;
}

export function describe(v: PyVal): { type: string; shape?: string; preview?: string } {
  const a = v as unknown as ArrLike;
  const tn = typeNameOf(v);
  if (v && typeof v === 'object' && Array.isArray(a.shape)) {
    const dt = typeof a.dtype === 'string' ? a.dtype : (a.dtype as { name?: string })?.name;
    return { type: `ndarray${dt ? ' ' + dt : ''}`, shape: '(' + a.shape.join(', ') + (a.shape.length === 1 ? ',' : '') + ')' };
  }
  if (typeof v === 'number') return { type: 'float', preview: String(Math.round(v * 1e6) / 1e6) };
  if (typeof v === 'bigint') return { type: 'int', preview: String(v) };
  if (typeof v === 'boolean') return { type: 'bool', preview: v ? 'True' : 'False' };
  if (typeof v === 'string') return { type: 'str', preview: JSON.stringify(v.length > 40 ? v.slice(0, 40) + '…' : v) };
  if (v instanceof PyList || v instanceof PyTuple) return { type: tn, shape: `len ${v.items.length}` };
  if (v instanceof PyDict) return { type: 'dict', shape: `len ${v.entries().length}` };
  return { type: tn };
}

export function VarExplorer({ r }: { r: RunResult }) {
  const [open, setOpen] = useState(true);
  const rows: [string, ReturnType<typeof describe>][] = [];
  for (const [k, v] of r.globals) {
    if (k.startsWith('_') || v instanceof PyFunc || v instanceof PyClass || v instanceof PyModule || v instanceof PyBuiltin) continue;
    rows.push([k, describe(v)]);
  }
  if (!rows.length) return null;
  return (
    <details className="vars" open={open} onToggle={(e) => setOpen((e.target as HTMLDetailsElement).open)}>
      <summary>Variables</summary>
      <table>
        <tbody>
          {rows.map(([k, d]) => (
            <tr key={k}>
              <td className="v-name">{k}</td>
              <td className="v-type">{d.type}</td>
              <td className="v-shape">{d.shape ?? d.preview ?? ''}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </details>
  );
}
