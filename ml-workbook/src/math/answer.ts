// Parse and check answers typed after working on paper.
// Accepts numbers and expressions (3/4, -2.5, sqrt(2)/2, 2^10, pi/4, e^-1, ln(2), 1e-3),
// vectors ([1, 2, 3] or (1, 2, 3) or "1, 2, 3"), and matrices ([[1,2],[3,4]] or "1 2; 3 4").

export type AnswerSpec =
  | { kind: 'number'; value: number; tol?: number }
  | { kind: 'vector'; value: number[]; tol?: number; upToScale?: boolean }
  | { kind: 'matrix'; value: number[][]; tol?: number }
  | { kind: 'set'; value: number[]; tol?: number } // unordered list, e.g. eigenvalues
  | { kind: 'text'; value: string[] }; // accepted spellings (case/space-insensitive)

type Tok = { t: 'num'; v: number } | { t: 'id'; v: string } | { t: 'op'; v: string };

function lex(s: string): Tok[] {
  const out: Tok[] = [];
  let i = 0;
  while (i < s.length) {
    const c = s[i];
    if (/\s/.test(c)) {
      i++;
      continue;
    }
    const m = /^(\d+\.?\d*|\.\d+)(e[+-]?\d+)?/i.exec(s.slice(i));
    if (m) {
      out.push({ t: 'num', v: parseFloat(m[0]) });
      i += m[0].length;
      continue;
    }
    const id = /^[a-zA-Zπ√]+/.exec(s.slice(i));
    if (id) {
      out.push({ t: 'id', v: id[0].toLowerCase() });
      i += id[0].length;
      continue;
    }
    if ('+-*/^()−×·'.includes(c)) {
      out.push({ t: 'op', v: c === '−' ? '-' : c === '×' || c === '·' ? '*' : c });
      i++;
      continue;
    }
    throw new Error(`unexpected "${c}"`);
  }
  return out;
}

const FUNCS: Record<string, (x: number) => number> = {
  sqrt: Math.sqrt,
  '√': Math.sqrt,
  ln: Math.log,
  log: Math.log,
  exp: Math.exp,
  sin: Math.sin,
  cos: Math.cos,
  tan: Math.tan,
  abs: Math.abs,
};
const CONSTS: Record<string, number> = { pi: Math.PI, π: Math.PI, e: Math.E, inf: Infinity };

/** Evaluate a scalar expression. Implicit multiplication like 2pi or 3sqrt(2) is allowed. */
export function evalExpr(src: string): number {
  const toks = lex(src);
  let p = 0;
  const peek = () => toks[p];
  const isOp = (v: string) => peek()?.t === 'op' && peek()!.v === v;
  const expr = (): number => {
    let x = term();
    while (isOp('+') || isOp('-')) {
      const o = toks[p++].v;
      const y = term();
      x = o === '+' ? x + y : x - y;
    }
    return x;
  };
  const term = (): number => {
    let x = unary();
    for (;;) {
      if (isOp('*') || isOp('/')) {
        const o = toks[p++].v;
        const y = unary();
        x = o === '*' ? x * y : x / y;
      } else if (peek() && (peek()!.t === 'num' || peek()!.t === 'id' || isOp('('))) x *= unary();
      else return x;
    }
  };
  const unary = (): number => {
    if (isOp('-')) {
      p++;
      return -unary();
    }
    if (isOp('+')) {
      p++;
      return unary();
    }
    return power();
  };
  const power = (): number => {
    const b = atom();
    if (isOp('^')) {
      p++;
      return b ** unary();
    }
    return b;
  };
  const atom = (): number => {
    const t = toks[p++];
    if (!t) throw new Error('incomplete expression');
    if (t.t === 'num') return t.v;
    if (t.t === 'op' && t.v === '(') {
      const x = expr();
      if (!isOp(')')) throw new Error('missing )');
      p++;
      return x;
    }
    if (t.t === 'id') {
      if (t.v in FUNCS) {
        const f = FUNCS[t.v];
        if (isOp('(')) return f(atom());
        return f(power());
      }
      if (t.v in CONSTS) return CONSTS[t.v];
    }
    throw new Error(`unexpected "${t.v}"`);
  };
  const v = expr();
  if (p < toks.length) throw new Error(`unexpected "${toks[p].v}"`);
  return v;
}

/** Split on commas/semicolons/whitespace at bracket depth 0 */
function splitTop(s: string, seps: string): string[] {
  const out: string[] = [];
  let depth = 0, cur = '';
  for (const c of s) {
    if (c === '(' || c === '[') depth++;
    if (c === ')' || c === ']') depth--;
    if (depth === 0 && seps.includes(c)) {
      if (cur.trim()) out.push(cur.trim());
      cur = '';
    } else cur += c;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}
const stripOuter = (s: string) => {
  s = s.trim();
  while ((s.startsWith('[') && s.endsWith(']')) || (s.startsWith('(') && s.endsWith(')') && splitTop(s.slice(1, -1), ',').length > 1)) {
    const inner = s.slice(1, -1);
    // only strip if the brackets are matching outer brackets
    let d = 0, ok = true;
    for (let i = 0; i < inner.length; i++) {
      if (inner[i] === '[' || inner[i] === '(') d++;
      if (inner[i] === ']' || inner[i] === ')') d--;
      if (d < 0) ok = false;
    }
    if (!ok) break;
    s = inner.trim();
  }
  return s;
};

export function parseVector(src: string): number[] {
  const s = stripOuter(src);
  const parts = s.includes(',') ? splitTop(s, ',') : splitTop(s, ' ');
  return parts.map(evalExpr);
}

export function parseMatrix(src: string): number[][] {
  const s = src.trim();
  if (/^\[\s*\[/.test(s)) {
    const inner = s.slice(1, -1);
    return splitTop(inner, ',').map(parseVector);
  }
  return splitTop(s, ';\n').map((row) => (row.includes(',') ? splitTop(row, ',') : splitTop(row, ' \t')).map(evalExpr));
}

const close = (a: number, b: number, tol: number) => Math.abs(a - b) <= tol * Math.max(1, Math.abs(b));

export interface CheckResult {
  ok: boolean;
  parsed?: string;
  error?: string;
}

export function checkAnswer(spec: AnswerSpec, input: string): CheckResult {
  const tol = 'tol' in spec && spec.tol !== undefined ? spec.tol : 1e-4;
  try {
    if (spec.kind === 'text') {
      const norm = (x: string) => x.toLowerCase().replace(/\s+/g, '');
      return { ok: spec.value.some((v) => norm(v) === norm(input)) };
    }
    if (spec.kind === 'number') {
      const v = evalExpr(input);
      return { ok: close(v, spec.value, tol), parsed: fmtNum(v) };
    }
    if (spec.kind === 'vector' || spec.kind === 'set') {
      const v = parseVector(input);
      if (v.length !== spec.value.length) return { ok: false, parsed: `[${v.map(fmtNum).join(', ')}]`, error: `expected ${spec.value.length} entries, got ${v.length}` };
      if (spec.kind === 'set') {
        const a = [...v].sort((x, y) => x - y), b = [...spec.value].sort((x, y) => x - y);
        return { ok: a.every((x, i) => close(x, b[i], tol)), parsed: `{${v.map(fmtNum).join(', ')}}` };
      }
      let ok = v.every((x, i) => close(x, spec.value[i], tol));
      if (!ok && spec.upToScale) {
        // any nonzero multiple counts (eigenvectors, normal vectors, null-space directions)
        const i = spec.value.findIndex((x) => Math.abs(x) > 1e-12);
        if (i >= 0 && Math.abs(v[i]) > 1e-12) {
          const k = v[i] / spec.value[i];
          ok = v.every((x, j) => close(x, k * spec.value[j], tol));
        }
      }
      return { ok, parsed: `[${v.map(fmtNum).join(', ')}]` };
    }
    const m = parseMatrix(input);
    if (m.length !== spec.value.length || m.some((r, i) => r.length !== spec.value[i].length))
      return { ok: false, parsed: m.map((r) => r.map(fmtNum).join(' ')).join('; '), error: `expected a ${spec.value.length}×${spec.value[0].length} matrix, got ${m.length}×${m[0]?.length ?? 0}` };
    return { ok: m.every((r, i) => r.every((x, j) => close(x, spec.value[i][j], tol))), parsed: m.map((r) => r.map(fmtNum).join(' ')).join('; ') };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

export const fmtNum = (x: number) => {
  if (!Number.isFinite(x)) return String(x);
  const r = Math.round(x * 1e6) / 1e6;
  return Object.is(r, -0) ? '0' : String(r);
};

export function answerTeX(spec: AnswerSpec): string {
  const f = (x: number) => fmtNum(x);
  if (spec.kind === 'number') return f(spec.value);
  if (spec.kind === 'text') return `\\text{${spec.value[0]}}`;
  if (spec.kind === 'vector') return `\\begin{bmatrix} ${spec.value.map(f).join(' \\\\ ')} \\end{bmatrix}`;
  if (spec.kind === 'set') return `\\{${spec.value.map(f).join(', ')}\\}`;
  return `\\begin{bmatrix} ${spec.value.map((r) => r.map(f).join(' & ')).join(' \\\\ ')} \\end{bmatrix}`;
}
