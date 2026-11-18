// Python object model.
//   int   -> JS bigint (arbitrary precision, like Python)
//   float -> JS number
//   bool  -> JS boolean
//   str   -> JS string
//   None  -> null
//   everything else -> a PyObj subclass with a stable id (shown in the visualizer)

import type { Param, Stmt, Expr } from './ast';

let nextId = 1;
export const resetIds = () => {
  nextId = 1;
};

export abstract class PyObj {
  id = nextId++;
  abstract get typeName(): string;
}

export type PyVal = null | boolean | bigint | number | string | PyObj;

export class PyList extends PyObj {
  constructor(public items: PyVal[] = []) {
    super();
  }
  get typeName() {
    return 'list';
  }
}
export class PyTuple extends PyObj {
  constructor(public items: PyVal[] = []) {
    super();
  }
  get typeName() {
    return 'tuple';
  }
}
export class PyDict extends PyObj {
  map = new Map<string, [PyVal, PyVal]>();
  constructor(public flavor: 'dict' | 'Counter' | 'defaultdict' | 'OrderedDict' = 'dict', public defaultFactory: PyVal = null) {
    super();
  }
  get typeName() {
    return this.flavor;
  }
  get(k: PyVal): PyVal | undefined {
    return this.map.get(keyOf(k))?.[1];
  }
  set(k: PyVal, v: PyVal) {
    const kk = keyOf(k);
    const cur = this.map.get(kk);
    if (cur) cur[1] = v;
    else this.map.set(kk, [k, v]);
  }
  has(k: PyVal) {
    return this.map.has(keyOf(k));
  }
  delete(k: PyVal) {
    return this.map.delete(keyOf(k));
  }
  keys() {
    return [...this.map.values()].map((e) => e[0]);
  }
  values() {
    return [...this.map.values()].map((e) => e[1]);
  }
  entries() {
    return [...this.map.values()];
  }
}
export class PySet extends PyObj {
  map = new Map<string, PyVal>();
  constructor(public frozen = false) {
    super();
  }
  get typeName() {
    return this.frozen ? 'frozenset' : 'set';
  }
  add(v: PyVal) {
    const k = keyOf(v);
    if (!this.map.has(k)) this.map.set(k, v);
  }
  has(v: PyVal) {
    return this.map.has(keyOf(v));
  }
  values() {
    return [...this.map.values()];
  }
}
export class PyRange extends PyObj {
  constructor(public start: bigint, public stop: bigint, public step: bigint) {
    super();
  }
  get typeName() {
    return 'range';
  }
  get length(): bigint {
    const { start, stop, step } = this;
    if (step > 0n) return stop > start ? (stop - start + step - 1n) / step : 0n;
    return start > stop ? (start - stop - step - 1n) / -step : 0n;
  }
  at(i: bigint) {
    return this.start + i * this.step;
  }
}
export class PyDeque extends PyObj {
  constructor(public items: PyVal[] = [], public maxlen: number | null = null) {
    super();
  }
  get typeName() {
    return 'deque';
  }
}

export interface Scope {
  kind: 'module' | 'function' | 'class' | 'comp';
  vars: Map<string, PyVal>;
  parent: Scope | null;
  globals: Scope;
  func?: PyFunc;
  name: string;
  frameId: number;
  line?: number;
  /** names that are local to this function (static analysis) */
  locals?: Set<string>;
  globalNames?: Set<string>;
  nonlocalNames?: Set<string>;
}

export class PyFunc extends PyObj {
  owner: PyClass | null = null;
  constructor(
    public name: string,
    public params: Param[],
    public body: Stmt[] | Expr,
    public closure: Scope,
    public defaults: Map<string, PyVal>,
    public isGen: boolean,
    public locals: Set<string>,
    public globalNames: Set<string>,
    public nonlocalNames: Set<string>,
    public line: number,
  ) {
    super();
  }
  get typeName() {
    return 'function';
  }
}

export type BuiltinImpl = (args: PyVal[], kw: Map<string, PyVal>) => PyVal | Generator<unknown, PyVal, unknown>;

export class PyBuiltin extends PyObj {
  constructor(public name: string, public impl: BuiltinImpl, public self: PyVal | undefined = undefined) {
    super();
  }
  get typeName() {
    return this.self === undefined ? 'builtin_function_or_method' : 'builtin_function_or_method';
  }
}

export class PyClass extends PyObj {
  mro: PyClass[] = [];
  annotations: [string, PyVal][] = [];
  constructor(public name: string, public bases: PyClass[], public dict: Map<string, PyVal> = new Map(), public builtin: string | null = null) {
    super();
    this.mro = computeMro(this);
  }
  get typeName() {
    return 'type';
  }
  lookup(name: string): PyVal | undefined {
    for (const c of this.mro) if (c.dict.has(name)) return c.dict.get(name);
    return undefined;
  }
  isSubclassOf(other: PyClass) {
    return this.mro.includes(other);
  }
}

function computeMro(c: PyClass): PyClass[] {
  // C3 linearization
  const seqs = [...c.bases.map((b) => [...b.mro]), [...c.bases]];
  const out: PyClass[] = [c];
  for (;;) {
    const nonEmpty = seqs.filter((s) => s.length);
    if (!nonEmpty.length) return out;
    let cand: PyClass | null = null;
    for (const s of nonEmpty) {
      const h = s[0];
      if (!nonEmpty.some((t) => t.indexOf(h) > 0)) {
        cand = h;
        break;
      }
    }
    if (!cand) return out.concat(nonEmpty.flat().filter((x, i, a) => a.indexOf(x) === i && !out.includes(x)));
    out.push(cand);
    for (const s of nonEmpty) if (s[0] === cand) s.shift();
  }
}

export class PyInstance extends PyObj {
  attrs = new Map<string, PyVal>();
  constructor(public cls: PyClass) {
    super();
  }
  get typeName() {
    return this.cls.name;
  }
}

export class PyBoundMethod extends PyObj {
  constructor(public self: PyVal, public func: PyVal) {
    super();
  }
  get typeName() {
    return 'method';
  }
}

export class PyModule extends PyObj {
  constructor(public name: string, public dict: Map<string, PyVal>) {
    super();
  }
  get typeName() {
    return 'module';
  }
}

export class PyProperty extends PyObj {
  constructor(public fget: PyVal, public fset: PyVal = null) {
    super();
  }
  get typeName() {
    return 'property';
  }
}
export class PyStaticMethod extends PyObj {
  constructor(public fn: PyVal) {
    super();
  }
  get typeName() {
    return 'staticmethod';
  }
}
export class PyClassMethod extends PyObj {
  constructor(public fn: PyVal) {
    super();
  }
  get typeName() {
    return 'classmethod';
  }
}
export class PySuper extends PyObj {
  constructor(public start: PyClass, public self: PyVal) {
    super();
  }
  get typeName() {
    return 'super';
  }
}

export const STOP = Symbol('StopIteration');
export type NextResult = PyVal | typeof STOP;

/** Any Python iterator (list_iterator, generator, enumerate, map, ...). */
export class PyIter extends PyObj {
  constructor(public kind: string, public nextFn: () => NextResult | Generator<unknown, NextResult, unknown>) {
    super();
  }
  get typeName() {
    return this.kind;
  }
}

export class PyGenerator extends PyObj {
  started = false;
  finished = false;
  scope: Scope | null = null;
  constructor(public name: string, public gen: Generator<unknown, unknown, PyVal>) {
    super();
  }
  get typeName() {
    return 'generator';
  }
}

/** A raised Python exception travelling through JS. */
export class PyRaise {
  traceback: { line: number; name: string }[] = [];
  constructor(public exc: PyInstance) {}
}

// ---------------- hashing / keys ----------------

export function keyOf(v: PyVal): string {
  if (v === null) return 'N';
  if (typeof v === 'boolean') return v ? 'i:1' : 'i:0';
  if (typeof v === 'bigint') return 'i:' + v.toString();
  if (typeof v === 'number') return Number.isInteger(v) && Math.abs(v) < 1e21 ? 'i:' + BigInt(v).toString() : 'f:' + String(v);
  if (typeof v === 'string') return 's:' + v;
  if (v instanceof PyTuple) return 't:(' + v.items.map(keyOf).join(',') + ')';
  if (v instanceof PySet && v.frozen) return 'fs:{' + [...v.map.keys()].sort().join(',') + '}';
  if (v instanceof PyList || v instanceof PyDict || (v instanceof PySet && !v.frozen)) throw new TypeError(`unhashable type: '${v.typeName}'`);
  if (v instanceof PyInstance && v.cls.lookup('__hash__') === null) throw new TypeError(`unhashable type: '${v.typeName}'`);
  if (v instanceof PyInstance && (v as PyInstance & { hashKey?: string }).hashKey) return (v as PyInstance & { hashKey?: string }).hashKey!;
  return 'o:' + v.id;
}

// ---------------- number formatting ----------------

/** Python's repr() of a float. */
export function floatRepr(x: number): string {
  if (Number.isNaN(x)) return 'nan';
  if (x === Infinity) return 'inf';
  if (x === -Infinity) return '-inf';
  if (x === 0) return Object.is(x, -0) ? '-0.0' : '0.0';
  const e = x.toExponential(); // shortest round-trip digits
  const m = /^(-?)(\d)(?:\.(\d+))?e([+-]\d+)$/.exec(e)!;
  const sign = m[1], digits = m[2] + (m[3] ?? ''), exp = Number(m[4]);
  if (exp >= 16 || exp < -4) {
    const mant = digits.length > 1 ? digits[0] + '.' + digits.slice(1) : digits;
    return `${sign}${mant}e${exp < 0 ? '-' : '+'}${String(Math.abs(exp)).padStart(2, '0')}`;
  }
  let s: string;
  if (exp >= 0) {
    if (digits.length <= exp + 1) s = digits + '0'.repeat(exp + 1 - digits.length) + '.0';
    else s = digits.slice(0, exp + 1) + '.' + digits.slice(exp + 1);
  } else s = '0.' + '0'.repeat(-exp - 1) + digits;
  return sign + s;
}

export function isInt(v: PyVal): v is bigint | boolean {
  return typeof v === 'bigint' || typeof v === 'boolean';
}
export function isNum(v: PyVal): v is bigint | boolean | number {
  return typeof v === 'bigint' || typeof v === 'boolean' || typeof v === 'number';
}
export const toBig = (v: bigint | boolean | number): bigint => (typeof v === 'boolean' ? (v ? 1n : 0n) : typeof v === 'number' ? BigInt(Math.trunc(v)) : v);
export const toNum = (v: bigint | boolean | number): number => (typeof v === 'boolean' ? (v ? 1 : 0) : Number(v));

export function typeNameOf(v: PyVal): string {
  if (v === null) return 'NoneType';
  if (typeof v === 'boolean') return 'bool';
  if (typeof v === 'bigint') return 'int';
  if (typeof v === 'number') return 'float';
  if (typeof v === 'string') return 'str';
  return v.typeName;
}

export function strRepr(s: string): string {
  const q = s.includes("'") && !s.includes('"') ? '"' : "'";
  let out = q;
  for (const ch of s) {
    if (ch === q) out += '\\' + q;
    else if (ch === '\\') out += '\\\\';
    else if (ch === '\n') out += '\\n';
    else if (ch === '\t') out += '\\t';
    else if (ch === '\r') out += '\\r';
    else if (ch.charCodeAt(0) < 32 || ch.charCodeAt(0) === 127) out += '\\x' + ch.charCodeAt(0).toString(16).padStart(2, '0');
    else out += ch;
  }
  return out + q;
}
