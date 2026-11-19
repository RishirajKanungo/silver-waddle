// A faithful subset of NumPy for the browser interpreter.
//
// Arrays store their elements in a Float64Array (for every dtype: float64,
// int64 and bool) together with shape / strides / offset, so slices,
// transposes and reshapes are views that share memory exactly like NumPy.
// Printing follows numpy/_core/arrayprint.py (FloatingFormat + _formatArray)
// and Dragon4 rounding; the legacy RandomState is a bit-exact MT19937 port.

import type { Interp, G } from './interp';
import { PySlice } from './interp';
import {
  PyBuiltin, PyClass, PyDict, PyInstance, PyIter, PyList, PyModule, PyObj, PyRaise, PyTuple, PyVal, STOP, BuiltinImpl,
  floatRepr, typeNameOf, setNpKeyHook,
} from './values';

// =====================================================================
//  core types
// =====================================================================

// complex128 exists only with a zero imaginary part (np.linalg.eig returns it); it computes like float64
export type DType = 'float64' | 'int64' | 'bool' | 'complex128';
const KIND: Record<DType, number> = { bool: 0, int64: 1, float64: 2, complex128: 3 };
const BY_KIND: DType[] = ['bool', 'int64', 'float64', 'complex128'];
const isFl = (dt: DType) => dt === 'float64' || dt === 'complex128';
const isIntLike = (dt: DType) => dt === 'int64' || dt === 'bool';
const maxDt = (a: DType, b: DType): DType => (KIND[a] >= KIND[b] ? a : b);

export class NDArray extends PyObj {
  constructor(public data: Float64Array, public shape: number[], public strides: number[], public offset: number, public dtype: DType) {
    super();
  }
  get typeName() {
    return 'numpy.ndarray';
  }
  get size() {
    return prod(this.shape);
  }
  get ndim() {
    return this.shape.length;
  }
}

export class NPScalar extends PyObj {
  /** a numpy.float16 scalar: the value is stored exactly (as a double) and printed with half precision */
  half = false;
  constructor(public v: number, public dtype: DType) {
    super();
  }
  get typeName() {
    return 'numpy.' + (this.half ? 'float16' : this.dtype);
  }
}

/** round a double to the nearest IEEE half-precision value (ties to even) */
export function toHalf(x: number): number {
  if (!Number.isFinite(x) || x === 0) return x;
  const a = Math.abs(x);
  if (a >= 65520) return x > 0 ? Infinity : -Infinity;
  let e = Math.floor(Math.log2(a));
  if (2 ** e > a) e--;
  if (2 ** (e + 1) <= a) e++;
  const q = e < -14 ? 2 ** -24 : 2 ** (e - 10); // spacing of half values near a
  const n = a / q;
  let r = Math.round(n);
  if (Math.abs(n - Math.trunc(n) - 0.5) < 1e-12 && r % 2 === 1) r -= 1; // ties to even
  return Math.sign(x) * r * q;
}

/** numpy's str() of a float16 scalar: shortest unique digits; positional for 1e-4 <= |x| < 1e3 */
function halfStr(v: number): string {
  if (Number.isNaN(v)) return 'nan';
  if (!Number.isFinite(v)) return v > 0 ? 'inf' : '-inf';
  if (v === 0) return Object.is(v, -0) ? '-0.0' : '0.0';
  let p = 1;
  while (p < 6 && toHalf(Number(v.toPrecision(p))) !== v) p++;
  const d = Number(v.toPrecision(p));
  const a = Math.abs(v);
  if (a >= 1e-4 && a < 1e3) {
    const t = String(d);
    return /[.e]/.test(t) ? t : t + '.0';
  }
  const [m, ex] = d.toExponential(p - 1).split('e');
  const mant = m.includes('.') ? m.replace(/0+$/, '').replace(/\.$/, '') : m;
  const sign = ex[0] === '-' ? '-' : '+';
  const digits = ex.replace(/^[+-]/, '').padStart(2, '0');
  return `${mant}e${sign}${digits}`;
}

export class NPDtype extends PyObj {
  constructor(public name: DType) {
    super();
  }
  get typeName() {
    return 'numpy.dtype';
  }
}

/** numpy's flat iterator / generic helper objects that only need a repr */
class NPMisc extends PyObj {
  constructor(public kind: string, public payload: unknown) {
    super();
  }
  get typeName() {
    return this.kind;
  }
}

export const isNp = (v: PyVal): v is NDArray | NPScalar => v instanceof NDArray || v instanceof NPScalar;

function prod(xs: number[]): number {
  let p = 1;
  for (const x of xs) p *= x;
  return p;
}
function cStrides(shape: number[]): number[] {
  const st = new Array(shape.length);
  let s = 1;
  for (let i = shape.length - 1; i >= 0; i--) {
    st[i] = s;
    s *= shape[i];
  }
  return st;
}
const mk = (data: Float64Array, shape: number[], dtype: DType) => new NDArray(data, shape, cStrides(shape), 0, dtype);
const zerosArr = (shape: number[], dtype: DType) => mk(new Float64Array(prod(shape)), shape, dtype);

function isC(a: NDArray): boolean {
  let s = 1;
  for (let i = a.shape.length - 1; i >= 0; i--) {
    if (a.shape[i] !== 1 && a.strides[i] !== s) return false;
    s *= a.shape[i];
  }
  return true;
}

/** elements of a (any view) in C order; shares memory when already dense. */
function flat(a: NDArray): Float64Array {
  const n = a.size;
  if (isC(a) && a.offset === 0 && a.data.length === n) return a.data;
  if (isC(a)) return a.data.subarray(a.offset, a.offset + n);
  const out = new Float64Array(n);
  if (n === 0) return out;
  const nd = a.shape.length;
  const inner = a.shape[nd - 1], st = a.strides[nd - 1], D = a.data;
  const idx = new Array(nd).fill(0);
  let base = a.offset, o = 0;
  const outer = n / inner;
  for (let k = 0; k < outer; k++) {
    let p = base;
    for (let i = 0; i < inner; i++) {
      out[o++] = D[p];
      p += st;
    }
    for (let d = nd - 2; d >= 0; d--) {
      idx[d]++;
      base += a.strides[d];
      if (idx[d] < a.shape[d]) break;
      base -= a.strides[d] * a.shape[d];
      idx[d] = 0;
    }
  }
  return out;
}
/** a fresh contiguous copy */
function copyArr(a: NDArray, dtype: DType = a.dtype): NDArray {
  const f = flat(a);
  const d = new Float64Array(f);
  if (dtype !== a.dtype) castInPlace(d, dtype);
  return mk(d, [...a.shape], dtype);
}
function castInPlace(d: Float64Array, dtype: DType) {
  if (dtype === 'int64') for (let i = 0; i < d.length; i++) d[i] = castInt(d[i]);
  else if (dtype === 'bool') for (let i = 0; i < d.length; i++) d[i] = d[i] !== 0 ? 1 : 0;
}
function castInt(x: number): number {
  if (x !== x) return -9223372036854775808;
  if (x === Infinity || x === -Infinity) return -9223372036854775808;
  const t = Math.trunc(x);
  return t === 0 ? 0 : t;
}
const castVal = (x: number, dt: DType) => (isFl(dt) ? x : dt === 'int64' ? castInt(x) : x !== 0 ? 1 : 0);

/** offsets (into a.data) of every element of a view, C order */
function offsetsOf(a: NDArray): Float64Array {
  const n = a.size;
  const out = new Float64Array(n);
  if (n === 0) return out;
  const nd = a.shape.length;
  if (nd === 0) {
    out[0] = a.offset;
    return out;
  }
  const inner = a.shape[nd - 1], st = a.strides[nd - 1];
  const idx = new Array(nd).fill(0);
  let base = a.offset, o = 0;
  for (let k = 0; k < n / inner; k++) {
    let p = base;
    for (let i = 0; i < inner; i++) {
      out[o++] = p;
      p += st;
    }
    for (let d = nd - 2; d >= 0; d--) {
      idx[d]++;
      base += a.strides[d];
      if (idx[d] < a.shape[d]) break;
      base -= a.strides[d] * a.shape[d];
      idx[d] = 0;
    }
  }
  return out;
}

/** write values (C order, already the view's size) into a view */
function writeFlat(a: NDArray, vals: Float64Array) {
  const n = a.size;
  if (isC(a)) {
    for (let i = 0; i < n; i++) a.data[a.offset + i] = vals[i];
    return;
  }
  const offs = offsetsOf(a);
  for (let i = 0; i < n; i++) a.data[offs[i]] = vals[i];
}

export const shapeStr = (s: number[]) => '(' + s.join(', ') + (s.length === 1 ? ',)' : ')');
const shapeStrTight = (s: number[]) => '(' + s.join(',') + (s.length === 1 ? ',)' : ')');

// =====================================================================
//  per-interpreter state
// =====================================================================

interface PrintOpts {
  precision: number;
  suppress: boolean;
  linewidth: number;
  threshold: number;
  edgeitems: number;
  floatmode: 'maxprec' | 'fixed' | 'unique' | 'maxprec_equal';
  sign: '-' | '+' | ' ';
  legacy: false | string;
}
const defaultOpts = (): PrintOpts => ({ precision: 8, suppress: false, linewidth: 75, threshold: 1000, edgeitems: 3, floatmode: 'maxprec', sign: '-', legacy: false });

interface NpState {
  opts: PrintOpts;
  mt: MT19937;
  cls: Record<string, PyClass>;
  mod: PyModule;
}

const npStates = new WeakMap<Interp, NpState>();
function S(I: Interp): NpState {
  const s = npStates.get(I);
  if (!s) throw new Error('numpy not initialised');
  return s;
}

function npRaise(I: Interp, cls: PyClass, msg: string): never {
  const inst = new PyInstance(cls);
  inst.attrs.set('args', new PyTuple([msg]));
  throw new PyRaise(inst);
}
const linAlgError = (I: Interp, msg: string): never => npRaise(I, S(I).cls.LinAlgError, msg);
const axisError = (I: Interp, ax: number, nd: number): never => npRaise(I, S(I).cls.AxisError, `axis ${ax} is out of bounds for array of dimension ${nd}`);
const unsupported = (I: Interp, what: string): never => I.raise('NotImplementedError', `${what} is not supported by this numpy subset`);

// =====================================================================
//  conversion between Python values and arrays
// =====================================================================

const ELLIPSIS_NAME = 'ellipsis';
const isEllipsis = (v: PyVal) => v instanceof PyInstance && v.cls.name === ELLIPSIS_NAME;

function pyNumKind(v: PyVal): DType | null {
  if (typeof v === 'boolean') return 'bool';
  if (typeof v === 'bigint') return 'int64';
  if (typeof v === 'number') return 'float64';
  if (v instanceof NPScalar) return v.dtype;
  return null;
}
function pyNum(v: PyVal): number {
  if (typeof v === 'boolean') return v ? 1 : 0;
  if (typeof v === 'bigint') return Number(v);
  if (typeof v === 'number') return v;
  if (v instanceof NPScalar) return v.v;
  return NaN;
}

/** Turn an array-like (nested lists, scalars, arrays) into an NDArray. Never copies NDArrays. */
export function toArr(I: Interp, v: PyVal, dtype?: DType): NDArray {
  if (v instanceof NDArray) return dtype && dtype !== v.dtype ? copyArr(v, dtype) : v;
  if (v instanceof NPScalar) return mk(new Float64Array([castVal(v.v, dtype ?? v.dtype)]), [], dtype ?? v.dtype);
  const k = pyNumKind(v);
  if (k) return mk(new Float64Array([castVal(pyNum(v), dtype ?? k)]), [], dtype ?? k);
  if (v instanceof PyList || v instanceof PyTuple) return fromNested(I, v, dtype);
  if (typeof v === 'string') unsupported(I, 'arrays of strings');
  if (v === null) unsupported(I, 'arrays containing None (object arrays)');
  if (v instanceof PyIter || (v instanceof PyObj && v.typeName === 'range')) {
    const items = I.runSync(I.toArray(v));
    return fromNested(I, new PyList(items), dtype);
  }
  I.raise('TypeError', `cannot convert '${typeNameOf(v)}' object to a numpy array`);
}

function fromNested(I: Interp, v: PyList | PyTuple, dtype?: DType): NDArray {
  // discover shape from the first elements
  const shape: number[] = [];
  let cur: PyVal = v;
  for (;;) {
    if (cur instanceof PyList || cur instanceof PyTuple) {
      shape.push(cur.items.length);
      if (!cur.items.length) break;
      cur = cur.items[0];
    } else if (cur instanceof NDArray) {
      shape.push(...cur.shape);
      break;
    } else break;
  }
  const n = prod(shape);
  const data = new Float64Array(n);
  let kind = -1;
  let pos = 0;
  const bad = (depth: number): never =>
    I.raise('ValueError', `setting an array element with a sequence. The requested array has an inhomogeneous shape after ${depth} dimensions. The detected shape was ${shapeStr(shape.slice(0, depth))} + inhomogeneous part.`);
  const fill = (x: PyVal, depth: number) => {
    if (x instanceof PyList || x instanceof PyTuple) {
      if (depth >= shape.length || x.items.length !== shape[depth]) bad(depth);
      for (const y of x.items) fill(y, depth + 1);
      return;
    }
    if (x instanceof NDArray) {
      const rest = shape.slice(depth);
      if (rest.length !== x.shape.length || rest.some((s, i) => s !== x.shape[i])) bad(depth);
      const f = flat(x);
      for (let i = 0; i < f.length; i++) data[pos++] = f[i];
      kind = Math.max(kind, KIND[x.dtype]);
      return;
    }
    if (depth !== shape.length) bad(depth);
    const k = pyNumKind(x);
    if (k === null) {
      if (typeof x === 'string') unsupported(I, 'arrays of strings');
      if (x === null) unsupported(I, 'arrays containing None (object arrays)');
      I.raise('TypeError', `float() argument must be a string or a real number, not '${typeNameOf(x)}'`);
    }
    kind = Math.max(kind, KIND[k]);
    data[pos++] = pyNum(x);
  };
  fill(v, 0);
  const dt: DType = dtype ?? (kind < 0 ? 'float64' : BY_KIND[kind]);
  if (dtype && dtype !== 'float64') castInPlace(data, dtype);
  return mk(data, shape, dt);
}

/** scalar result for 0-d values (NumPy ufuncs return scalars, not 0-d arrays) */
function wrap(a: NDArray): NDArray | NPScalar {
  if (a.shape.length === 0) return new NPScalar(a.data[a.offset], a.dtype);
  return a;
}
function scalarOut(x: number, dt: DType): NPScalar {
  return new NPScalar(dt === 'int64' ? (x === 0 ? 0 : x) : x, dt);
}

/** Python value of one element */
function pyOf(x: number, dt: DType): PyVal {
  if (dt === 'bool') return x !== 0;
  if (dt === 'complex128') return x;
  if (dt === 'int64') return BigInt(x);
  return x;
}

export function npToPy(v: NPScalar): PyVal {
  return pyOf(v.v, v.dtype);
}

function toInt(I: Interp, v: PyVal, what = 'integer'): number {
  if (typeof v === 'bigint') return Number(v);
  if (typeof v === 'boolean') return v ? 1 : 0;
  if (v instanceof NPScalar && isIntLike(v.dtype)) return v.v;
  if (v instanceof NDArray && v.shape.length === 0 && isIntLike(v.dtype)) return v.data[v.offset];
  I.raise('TypeError', `'${typeNameOf(v)}' object cannot be interpreted as an ${what}`);
}
function toFloat(I: Interp, v: PyVal): number {
  const k = pyNumKind(v);
  if (k) return pyNum(v);
  if (v instanceof NDArray && v.size === 1) return flat(v)[0];
  I.raise('TypeError', `must be real number, not ${typeNameOf(v)}`);
}
function toBool(I: Interp, v: PyVal | undefined, dflt = false): boolean {
  if (v === undefined) return dflt;
  return I.truthSync(v);
}

function shapeArg(I: Interp, v: PyVal): number[] {
  let s: number[];
  if (v instanceof PyTuple || v instanceof PyList) s = v.items.map((x) => toInt(I, x));
  else if (v instanceof NDArray) s = Array.from(flat(v));
  else s = [toInt(I, v)];
  if (s.some((x) => x < 0)) I.raise('ValueError', 'negative dimensions are not allowed');
  return s;
}

function dtypeArg(I: Interp, v: PyVal | undefined): DType | undefined {
  if (v === undefined || v === null) return undefined;
  if (v instanceof NPDtype) return v.name;
  const T = I.T;
  if (v === T.float) return 'float64';
  if (v === T.int) return 'int64';
  if (v === T.bool) return 'bool';
  if (v instanceof PyClass) {
    const st = S(I);
    if (v === st.cls.float64) return 'float64';
    if (v === st.cls.int64) return 'int64';
    if (v === st.cls.bool) return 'bool';
    if (v === st.cls.complex128) return 'complex128';
    unsupported(I, `dtype ${v.name} (only float64, int64 and bool are available)`);
  }
  if (typeof v === 'string') {
    const m: Record<string, DType> = { float64: 'float64', float: 'float64', f8: 'float64', d: 'float64', double: 'float64', int64: 'int64', int: 'int64', i8: 'int64', int_: 'int64', bool: 'bool', bool_: 'bool', '?': 'bool', b1: 'bool', complex128: 'complex128', complex: 'complex128', c16: 'complex128', D: 'complex128' };
    if (m[v]) return m[v];
    unsupported(I, `dtype '${v}' (only float64, int64 and bool are available)`);
  }
  I.raise('TypeError', `Cannot interpret '${I.runSync(I.repr(v))}' as a data type`);
}

function normAxis(I: Interp, ax: number, nd: number): number {
  if (ax < -nd || ax >= nd) axisError(I, ax, nd);
  return ax < 0 ? ax + nd : ax;
}
/** axis argument -> sorted list of axes (null = all) */
function axesArg(I: Interp, v: PyVal | undefined, nd: number): number[] | null {
  if (v === undefined || v === null) return null;
  if (v instanceof PyTuple || v instanceof PyList) {
    const axes = v.items.map((x) => normAxis(I, toInt(I, x), nd));
    if (new Set(axes).size !== axes.length) I.raise('ValueError', "duplicate value in 'axis'");
    return axes.sort((x, y) => x - y);
  }
  return [normAxis(I, toInt(I, v), nd)];
}

// =====================================================================
//  broadcasting + element-wise engine
// =====================================================================

function broadcastShapes(I: Interp, shapes: number[][]): number[] {
  const nd = Math.max(0, ...shapes.map((s) => s.length));
  const out = new Array(nd).fill(1);
  for (const s of shapes) {
    for (let i = 0; i < s.length; i++) {
      const j = nd - s.length + i;
      if (s[i] === out[j] || s[i] === 1) continue;
      if (out[j] === 1) out[j] = s[i];
      else I.raise('ValueError', `operands could not be broadcast together with shapes ${shapes.map(shapeStrTight).join(' ')} `);
    }
  }
  return out;
}
function bStrides(a: NDArray, shape: number[]): number[] {
  const nd = shape.length;
  const st = new Array(nd).fill(0);
  for (let i = 0; i < a.shape.length; i++) {
    const j = nd - a.shape.length + i;
    st[j] = a.shape[i] === 1 ? 0 : a.strides[i];
  }
  return st;
}
function broadcastTo(I: Interp, a: NDArray, shape: number[]): NDArray {
  if (a.shape.length > shape.length) I.raise('ValueError', `could not broadcast input array from shape ${shapeStrTight(a.shape)} into shape ${shapeStrTight(shape)}`);
  for (let i = 0; i < a.shape.length; i++) {
    const j = shape.length - a.shape.length + i;
    if (a.shape[i] !== 1 && a.shape[i] !== shape[j]) I.raise('ValueError', `could not broadcast input array from shape ${shapeStrTight(a.shape)} into shape ${shapeStrTight(shape)}`);
  }
  return new NDArray(a.data, [...shape], bStrides(a, shape), a.offset, a.dtype);
}

type BinF = (x: number, y: number) => number;

/** out = f(a, b) with broadcasting; returns a contiguous array */
function zip2(I: Interp, a: NDArray, b: NDArray, f: BinF, dt: DType): NDArray {
  // fast paths
  if (a.shape.length === b.shape.length && a.shape.every((s, i) => s === b.shape[i]) && isC(a) && isC(b)) {
    const n = a.size, A = a.data, B = b.data, oa = a.offset, ob = b.offset;
    const out = new Float64Array(n);
    for (let i = 0; i < n; i++) out[i] = f(A[oa + i], B[ob + i]);
    return mk(out, [...a.shape], dt);
  }
  const shape = broadcastShapes(I, [a.shape, b.shape]);
  const n = prod(shape);
  const out = new Float64Array(n);
  if (b.size === 1 && isC(a) && a.shape.length === shape.length) {
    const y = b.data[b.offset], A = a.data, oa = a.offset;
    for (let i = 0; i < n; i++) out[i] = f(A[oa + i], y);
    return mk(out, shape, dt);
  }
  if (a.size === 1 && isC(b) && b.shape.length === shape.length) {
    const x = a.data[a.offset], B = b.data, ob = b.offset;
    for (let i = 0; i < n; i++) out[i] = f(x, B[ob + i]);
    return mk(out, shape, dt);
  }
  if (n === 0) return mk(out, shape, dt);
  const nd = shape.length;
  if (nd === 0) {
    out[0] = f(a.data[a.offset], b.data[b.offset]);
    return mk(out, shape, dt);
  }
  const sa = bStrides(a, shape), sb = bStrides(b, shape);
  const A = a.data, B = b.data;
  const inner = shape[nd - 1], ia = sa[nd - 1], ib = sb[nd - 1];
  const idx = new Array(nd).fill(0);
  let pa0 = a.offset, pb0 = b.offset, o = 0;
  for (let k = 0; k < n / inner; k++) {
    let pa = pa0, pb = pb0;
    for (let i = 0; i < inner; i++) {
      out[o++] = f(A[pa], B[pb]);
      pa += ia;
      pb += ib;
    }
    for (let d = nd - 2; d >= 0; d--) {
      idx[d]++;
      pa0 += sa[d];
      pb0 += sb[d];
      if (idx[d] < shape[d]) break;
      pa0 -= sa[d] * shape[d];
      pb0 -= sb[d] * shape[d];
      idx[d] = 0;
    }
  }
  return mk(out, shape, dt);
}

function map1(a: NDArray, f: (x: number) => number, dt: DType): NDArray {
  const src = flat(a);
  const out = new Float64Array(src.length);
  for (let i = 0; i < src.length; i++) out[i] = f(src[i]);
  return mk(out, [...a.shape], dt);
}

// --- float helpers matching C / NumPy semantics ---
export function rint(y: number): number {
  if (!isFinite(y)) return y;
  const f = Math.floor(y);
  const d = y - f;
  let r = d < 0.5 ? f : d > 0.5 ? f + 1 : f % 2 === 0 ? f : f + 1;
  if (r === 0 && (y < 0 || Object.is(y, -0))) r = -0;
  return r;
}
function fmod(x: number, y: number) {
  return x % y;
}
/** npy_divmod: Python-style floor division / modulo for doubles */
function pyFloorDiv(a: number, b: number): number {
  if (b === 0) return a / b;
  const mod = fmod(a, b);
  let div = (a - mod) / b;
  if (mod) {
    if (b < 0 !== mod < 0) div -= 1.0;
  }
  let fd: number;
  if (div) {
    fd = Math.floor(div);
    if (div - fd > 0.5) fd += 1.0;
  } else fd = (a / b < 0 || Object.is(a / b, -0)) ? -0 : 0;
  return fd;
}
function pyMod(a: number, b: number): number {
  if (b === 0) return NaN;
  let mod = fmod(a, b);
  if (mod) {
    if (b < 0 !== mod < 0) mod += b;
  } else mod = b < 0 ? -0 : 0;
  return mod;
}
function intPow(x: number, y: number): number {
  let r = 1, b = x, e = y;
  while (e > 0) {
    if (e & 1) r *= b;
    b *= b;
    e = Math.floor(e / 2);
  }
  return r;
}
const i32 = (x: number) => x >= -2147483648 && x <= 2147483647;
function bitop(x: number, y: number, op: '&' | '|' | '^' | '<<' | '>>'): number {
  if (i32(x) && i32(y) && op !== '<<' && op !== '>>') return op === '&' ? x & y : op === '|' ? x | y : x ^ y;
  const X = BigInt(x), Y = BigInt(y);
  const r = op === '&' ? X & Y : op === '|' ? X | Y : op === '^' ? X ^ Y : op === '<<' ? X << Y : X >> Y;
  return Number(BigInt.asIntN(64, r));
}

const UFUNC_ERR = (name: string) => `ufunc '${name}' not supported for the input types, and the inputs could not be safely coerced to any supported types according to the casting rule ''safe''`;

/** binary ufunc on arrays (dtype resolution + loop) */
export function binUfunc(I: Interp, name: string, a: NDArray, b: NDArray): NDArray {
  const dt = maxDt(a.dtype, b.dtype);
  const isF = isFl(dt), isB = dt === 'bool';
  switch (name) {
    case 'add':
      return isB ? zip2(I, a, b, (x, y) => (x || y ? 1 : 0), dt) : zip2(I, a, b, (x, y) => x + y, dt);
    case 'subtract':
      if (isB) I.raise('TypeError', 'numpy boolean subtract, the `-` operator, is not supported, use the bitwise_xor, the `^` operator, or the logical_xor function instead.');
      return zip2(I, a, b, (x, y) => x - y, dt);
    case 'multiply':
      return isB ? zip2(I, a, b, (x, y) => (x && y ? 1 : 0), dt) : zip2(I, a, b, (x, y) => x * y, dt);
    case 'true_divide':
    case 'divide':
      return zip2(I, a, b, (x, y) => x / y, dt === 'complex128' ? dt : 'float64');
    case 'floor_divide':
      if (isF) return zip2(I, a, b, pyFloorDiv, dt);
      return zip2(I, a, b, (x, y) => (y === 0 ? 0 : Math.floor(x / y) || 0), isB ? 'int64' : dt);
    case 'remainder':
    case 'mod':
      if (isF) return zip2(I, a, b, pyMod, dt);
      return zip2(I, a, b, (x, y) => (y === 0 ? 0 : x - Math.floor(x / y) * y || 0), isB ? 'int64' : dt);
    case 'power':
      if (isF) return zip2(I, a, b, (x, y) => powCR(x, y), dt);
      return zip2(I, a, b, (x, y) => {
        if (y < 0) I.raise('ValueError', 'Integers to negative integer powers are not allowed.');
        return intPow(x, y);
      }, isB ? 'int64' : dt);
    case 'maximum':
      return zip2(I, a, b, (x, y) => (x !== x || y !== y ? NaN : x >= y ? x : y), dt);
    case 'minimum':
      return zip2(I, a, b, (x, y) => (x !== x || y !== y ? NaN : x <= y ? x : y), dt);
    case 'fmax':
      return zip2(I, a, b, (x, y) => (x !== x ? y : y !== y ? x : x >= y ? x : y), dt);
    case 'fmin':
      return zip2(I, a, b, (x, y) => (x !== x ? y : y !== y ? x : x <= y ? x : y), dt);
    case 'arctan2':
      return zip2(I, a, b, Math.atan2, 'float64');
    case 'hypot':
      return zip2(I, a, b, Math.hypot, 'float64');
    case 'logaddexp':
      // numpy's npy_logaddexp: log(exp(x) + exp(y)) without overflow
      return zip2(I, a, b, (x, y) => {
        if (x === y) return x + Math.LN2;
        const t = x - y;
        if (t > 0) return x + log1pCR(expCR(-t));
        if (t <= 0) return y + log1pCR(expCR(t));
        return t;
      }, 'float64');
    case 'logaddexp2':
      return zip2(I, a, b, (x, y) => {
        if (x === y) return x + 1;
        const t = x - y;
        if (t > 0) return x + log1pCR(powCR(2, -t)) / Math.LN2;
        if (t <= 0) return y + log1pCR(powCR(2, t)) / Math.LN2;
        return t;
      }, 'float64');
    case 'equal':
      return zip2(I, a, b, (x, y) => (x === y ? 1 : 0), 'bool');
    case 'not_equal':
      return zip2(I, a, b, (x, y) => (x !== y ? 1 : 0), 'bool');
    case 'less':
      return zip2(I, a, b, (x, y) => (x < y ? 1 : 0), 'bool');
    case 'less_equal':
      return zip2(I, a, b, (x, y) => (x <= y ? 1 : 0), 'bool');
    case 'greater':
      return zip2(I, a, b, (x, y) => (x > y ? 1 : 0), 'bool');
    case 'greater_equal':
      return zip2(I, a, b, (x, y) => (x >= y ? 1 : 0), 'bool');
    case 'logical_and':
      return zip2(I, a, b, (x, y) => (x && y ? 1 : 0), 'bool');
    case 'logical_or':
      return zip2(I, a, b, (x, y) => (x || y ? 1 : 0), 'bool');
    case 'logical_xor':
      return zip2(I, a, b, (x, y) => (!x !== !y ? 1 : 0), 'bool');
    case 'bitwise_and':
    case 'bitwise_or':
    case 'bitwise_xor':
    case 'left_shift':
    case 'right_shift': {
      if (isF) I.raise('TypeError', UFUNC_ERR(name));
      const op = ({ bitwise_and: '&', bitwise_or: '|', bitwise_xor: '^', left_shift: '<<', right_shift: '>>' } as const)[name];
      if (isB && (op === '<<' || op === '>>')) return zip2(I, a, b, (x, y) => bitop(x, y, op), 'int64');
      return zip2(I, a, b, (x, y) => bitop(x, y, op), dt);
    }
  }
  I.raise('AttributeError', `module 'numpy' has no attribute '${name}'`);
}

const UNARY_FLOAT: Record<string, (x: number) => number> = {
  exp: (x) => expCR(x), exp2: (x) => powCR(2, x), expm1: (x) => expm1CR(x), log: (x) => logCR(x), log2: (x) => log2CR(x), log10: (x) => log10CR(x), log1p: (x) => log1pCR(x),
  sqrt: Math.sqrt, cbrt: Math.cbrt, sin: (x) => sinCR(x), cos: (x) => cosCR(x), tan: Math.tan, arcsin: Math.asin, arccos: Math.acos, arctan: Math.atan,
  sinh: (x) => sinhCR(x), cosh: (x) => coshCR(x), tanh: (x) => tanhCR(x), arcsinh: Math.asinh, arccosh: Math.acosh, arctanh: Math.atanh,
  deg2rad: (x) => (x * Math.PI) / 180, rad2deg: (x) => (x * 180) / Math.PI, radians: (x) => (x * Math.PI) / 180, degrees: (x) => (x * 180) / Math.PI,
};

export function unaryUfunc(I: Interp, name: string, a: NDArray): NDArray {
  const dt = a.dtype;
  const f = UNARY_FLOAT[name];
  if (f && dt === 'complex128')
    return map1(a, (x) => {
      const y = f(x);
      if (y !== y && x === x) unsupported(I, `numpy.${name} with a complex result`);
      return y;
    }, dt);
  if (f) return map1(a, f, 'float64');
  switch (name) {
    case 'negative':
      if (dt === 'bool') I.raise('TypeError', 'The numpy boolean negative, the `-` operator, is not supported, use the `~` operator or the logical_not function instead.');
      return map1(a, (x) => (dt === 'int64' ? -x || 0 : -x), dt);
    case 'positive':
      return map1(a, (x) => x, dt);
    case 'absolute':
    case 'abs':
    case 'fabs':
      return map1(a, Math.abs, name === 'fabs' || dt === 'complex128' ? 'float64' : dt);
    case 'invert':
    case 'bitwise_not':
      if (isFl(dt)) I.raise('TypeError', UFUNC_ERR('invert'));
      return map1(a, (x) => (dt === 'bool' ? (x ? 0 : 1) : i32(x) ? ~x : Number(BigInt.asIntN(64, ~BigInt(x)))), dt);
    case 'logical_not':
      return map1(a, (x) => (x ? 0 : 1), 'bool');
    case 'sign':
      if (dt === 'bool') I.raise('TypeError', UFUNC_ERR('sign'));
      return map1(a, (x) => (x > 0 ? 1 : x < 0 ? -1 : x === 0 ? 0 : NaN), dt);
    case 'square':
      return map1(a, (x) => x * x, dt === 'bool' ? 'bool' : dt);
    case 'reciprocal':
      return map1(a, (x) => (isFl(dt) ? 1 / x : x === 0 ? 0 : Math.trunc(1 / x) || 0), dt);
    case 'floor':
      return map1(a, Math.floor, dt === 'bool' ? 'bool' : dt);
    case 'ceil':
      return map1(a, Math.ceil, dt === 'bool' ? 'bool' : dt);
    case 'trunc':
    case 'fix':
      return map1(a, Math.trunc, dt === 'bool' ? 'bool' : dt);
    case 'rint':
      return map1(a, rint, isFl(dt) ? dt : 'float64');
    case 'isnan':
      return map1(a, (x) => (x !== x ? 1 : 0), 'bool');
    case 'isinf':
      return map1(a, (x) => (x === Infinity || x === -Infinity ? 1 : 0), 'bool');
    case 'isfinite':
      return map1(a, (x) => (isFinite(x) ? 1 : 0), 'bool');
    case 'signbit':
      return map1(a, (x) => (x < 0 || Object.is(x, -0) ? 1 : 0), 'bool');
  }
  I.raise('AttributeError', `module 'numpy' has no attribute '${name}'`);
}

const OP_UFUNC: Record<string, string> = {
  '+': 'add', '-': 'subtract', '*': 'multiply', '/': 'true_divide', '//': 'floor_divide', '%': 'remainder', '**': 'power',
  '&': 'bitwise_and', '|': 'bitwise_or', '^': 'bitwise_xor', '<<': 'left_shift', '>>': 'right_shift',
  '<': 'less', '<=': 'less_equal', '>': 'greater', '>=': 'greater_equal', '==': 'equal', '!=': 'not_equal',
};

/** can this value take part in array arithmetic? */
function arrayLike(v: PyVal): boolean {
  return v instanceof NDArray || v instanceof NPScalar || typeof v === 'number' || typeof v === 'bigint' || typeof v === 'boolean' || v instanceof PyList || v instanceof PyTuple;
}

// ---------------- interpreter hooks: operators ----------------

/** a op b where at least one side is a numpy value. Returns undefined when numpy declines. */
export function npBinop(I: Interp, op: string, a: PyVal, b: PyVal): PyVal | undefined {
  // sequence repetition with a numpy integer: [0] * np.int64(3)
  if (op === '*' && ((a instanceof NPScalar && isIntLike(a.dtype) && (b instanceof PyList || b instanceof PyTuple || typeof b === 'string')) || (b instanceof NPScalar && isIntLike(b.dtype) && (a instanceof PyList || a instanceof PyTuple || typeof a === 'string'))))
    return undefined;
  if (op === '%' && typeof a === 'string') return undefined;
  if (!arrayLike(a) || !arrayLike(b)) {
    if (op === '==' ) return equalityFallback(a, b, true);
    if (op === '!=') return equalityFallback(a, b, false);
    return undefined;
  }
  const A = toArr(I, a), B = toArr(I, b);
  if (op === '@') return wrap(matmul(I, A, B));
  const name = OP_UFUNC[op];
  if (!name) return undefined;
  return wrap(binUfunc(I, name, A, B));
}
function equalityFallback(a: PyVal, b: PyVal, eq: boolean): PyVal {
  const arr = a instanceof NDArray ? a : b instanceof NDArray ? b : null;
  if (!arr) return eq ? a === b : a !== b;
  const out = zerosArr([...arr.shape], 'bool');
  if (!eq) out.data.fill(1);
  return wrap(out);
}

/** a op= b for arrays: writes into a (and therefore into any view a aliases) */
export function npInplace(I: Interp, op: string, a: NDArray, b: PyVal): PyVal | undefined {
  if (!arrayLike(b)) return undefined;
  const B = toArr(I, b);
  const r = op === '@' ? matmul(I, a, B) : binUfunc(I, OP_UFUNC[op], a, B);
  if (KIND[r.dtype] > KIND[a.dtype]) {
    const uf = op === '@' ? 'matmul' : OP_UFUNC[op];
    npRaise(I, S(I).cls.UFuncTypeError, `Cannot cast ufunc '${uf}' output from dtype('${r.dtype}') to dtype('${a.dtype}') with casting rule 'same_kind'`);
  }
  if (r.shape.length !== a.shape.length || r.shape.some((s, i) => s !== a.shape[i])) {
    if (r.shape.length > a.shape.length || prod(r.shape) !== a.size)
      I.raise('ValueError', `non-broadcastable output operand with shape ${shapeStrTight(a.shape)} doesn't match the broadcast shape ${shapeStrTight(r.shape)}`);
  }
  const vals = flat(r);
  if (r.dtype !== a.dtype) {
    const c = new Float64Array(vals);
    castInPlace(c, a.dtype);
    writeFlat(a, c);
  } else writeFlat(a, vals);
  return a;
}

export function npUnary(I: Interp, op: string, a: NDArray | NPScalar): PyVal {
  const A = toArr(I, a);
  const name = op === '-' ? 'negative' : op === '+' ? 'positive' : op === '~' ? 'invert' : 'absolute';
  return wrap(unaryUfunc(I, name, A));
}

export function npTruth(I: Interp, v: NDArray | NPScalar): boolean {
  if (v instanceof NPScalar) return v.v !== 0;
  const n = v.size;
  if (n === 0) I.raise('ValueError', 'The truth value of an empty array is ambiguous. Use `array.size > 0` to check that an array is not empty.');
  if (n > 1) I.raise('ValueError', 'The truth value of an array with more than one element is ambiguous. Use a.any() or a.all()');
  return v.data[v.offset] !== 0;
}

export function npContains(I: Interp, a: NDArray, x: PyVal): boolean {
  const r = npBinop(I, '==', a, x);
  if (r instanceof NDArray) return flat(r).some((v) => v !== 0);
  if (r instanceof NPScalar) return r.v !== 0;
  return !!r;
}

/** numeric value of a numpy scalar / size-1 array for float() and int() */
export function npToNumber(I: Interp, v: NDArray | NPScalar, forInt: boolean): PyVal {
  let x: number, dt: DType;
  if (v instanceof NPScalar) {
    x = v.v;
    dt = v.dtype;
  } else {
    if (v.shape.length > 0 && v.size !== 1) I.raise('TypeError', 'only 0-dimensional arrays can be converted to Python scalars');
    if (v.size !== 1) I.raise('TypeError', 'only 0-dimensional arrays can be converted to Python scalars');
    x = v.data[v.offset];
    dt = v.dtype;
  }
  if (!forInt) return x;
  if (!isFinite(x)) I.raise(x !== x ? 'ValueError' : 'OverflowError', x !== x ? 'cannot convert float NaN to integer' : 'cannot convert float infinity to integer');
  void dt;
  return BigInt(Math.trunc(x));
}

// =====================================================================
//  matmul / dot
// =====================================================================

const MATMUL_SIG = '(n?,k),(k,m?)->(n?,m?)';

function batchMatmul(I: Interp, a: NDArray, b: NDArray): NDArray {
  // a: [...batchA, n, k], b: [...batchB, k, m]
  const n = a.shape[a.ndim - 2], k = a.shape[a.ndim - 1], m = b.shape[b.ndim - 1];
  const batch = broadcastShapes(I, [a.shape.slice(0, -2), b.shape.slice(0, -2)]);
  const A = flat(broadcastTo(I, a, [...batch, n, k]));
  const B = flat(broadcastTo(I, b, [...batch, k, m]));
  const nb = prod(batch);
  const out = new Float64Array(nb * n * m);
  const dt = maxDt(a.dtype, b.dtype);
  if (isFl(dt) && nb * n * m * k <= 1 << 18) {
    // small products: sequential fused multiply-add per element, like OpenBLAS kernels
    for (let t = 0; t < nb; t++) {
      const ao = t * n * k, bo = t * k * m, oo = t * n * m;
      for (let i = 0; i < n; i++)
        for (let j = 0; j < m; j++) {
          let acc = 0;
          for (let p = 0; p < k; p++) acc = fma(A[ao + i * k + p], B[bo + p * m + j], acc);
          out[oo + i * m + j] = acc;
        }
    }
    return mk(out, [...batch, n, m], dt);
  }
  for (let t = 0; t < nb; t++) {
    const ao = t * n * k, bo = t * k * m, oo = t * n * m;
    for (let i = 0; i < n; i++) {
      const ci = oo + i * m;
      for (let p = 0; p < k; p++) {
        const x = A[ao + i * k + p];
        if (x === 0 && !isFl(dt)) continue;
        const bp = bo + p * m;
        for (let j = 0; j < m; j++) out[ci + j] += x * B[bp + j];
      }
    }
  }
  if (dt === 'bool') for (let i = 0; i < out.length; i++) out[i] = out[i] ? 1 : 0;
  return mk(out, [...batch, n, m], dt);
}

export function matmul(I: Interp, a: NDArray, b: NDArray): NDArray {
  if (a.ndim === 0 || b.ndim === 0) I.raise('ValueError', `matmul: Input operand ${a.ndim === 0 ? 0 : 1} does not have enough dimensions (has 0, gufunc core with signature ${MATMUL_SIG} requires 1)`);
  const a2 = a.ndim === 1 ? reshapeView(a, [1, a.shape[0]]) : a;
  const b2 = b.ndim === 1 ? reshapeView(b, [b.shape[0], 1]) : b;
  const k = a2.shape[a2.ndim - 1], kb = b2.shape[b2.ndim - 2];
  if (k !== kb) I.raise('ValueError', `matmul: Input operand 1 has a mismatch in its core dimension 0, with gufunc signature ${MATMUL_SIG} (size ${kb} is different from ${k})`);
  if (a.ndim === 2 && b.ndim === 1 && isFl(a.dtype) && isFl(b.dtype) && isC(a) && a.size <= 1 << 18) {
    // OpenBLAS dgemv_t: 4 FMA lanes per row, combined (l0+l2)+(l1+l3), then the tail
    const n = a.shape[0];
    const A = a.data, x = flat(b), out = new Float64Array(n);
    const n1 = k - (k % 4);
    for (let i = 0; i < n; i++) {
      const o = a.offset + i * k;
      let l0 = 0, l1 = 0, l2 = 0, l3 = 0;
      for (let p = 0; p < n1; p += 4) {
        l0 = fma(A[o + p], x[p], l0);
        l1 = fma(A[o + p + 1], x[p + 1], l1);
        l2 = fma(A[o + p + 2], x[p + 2], l2);
        l3 = fma(A[o + p + 3], x[p + 3], l3);
      }
      let sacc = n1 ? l0 + l2 + (l1 + l3) : 0;
      const t = k - n1;
      if (t === 1) sacc = fma(A[o + n1], x[n1], sacc);
      else if (t === 2) sacc = sacc + (A[o + n1] * x[n1] + A[o + n1 + 1] * x[n1 + 1]);
      else if (t === 3) sacc = sacc + fma(A[o + n1 + 2], x[n1 + 2], A[o + n1] * x[n1] + A[o + n1 + 1] * x[n1 + 1]);
      out[i] = sacc;
    }
    return mk(out, [n], maxDt(a.dtype, b.dtype));
  }
  const r = batchMatmul(I, a2, b2);
  let shape = r.shape;
  if (a.ndim === 1) shape = [...shape.slice(0, -2), shape[shape.length - 1]];
  if (b.ndim === 1) shape = shape.slice(0, -1);
  return mk(r.data, shape, r.dtype);
}

function dot(I: Interp, a: NDArray, b: NDArray): NDArray {
  if (a.ndim === 0 || b.ndim === 0) return binUfunc(I, 'multiply', a, b);
  const ka = a.shape[a.ndim - 1];
  const kb = b.ndim === 1 ? b.shape[0] : b.shape[b.ndim - 2];
  if (ka !== kb) I.raise('ValueError', `shapes ${shapeStrTight(a.shape)} and ${shapeStrTight(b.shape)} not aligned: ${ka} (dim ${a.ndim - 1}) != ${kb} (dim ${Math.max(0, b.ndim - 2)})`);
  if (b.ndim <= 2) return matmul(I, a, b);
  // general N-D: sum over last axis of a and second-to-last of b
  const bm = copyArr(transposeView(b, [b.ndim - 2, ...b.shape.map((_, i) => i).filter((i) => i !== b.ndim - 2)]));
  const B2 = reshapeView(bm, [kb, bm.size / kb]);
  const A2 = reshapeView(copyArr(a), [a.size / ka, ka]);
  const r = matmul(I, A2, B2);
  return mk(r.data, [...a.shape.slice(0, -1), ...b.shape.slice(0, -2), b.shape[b.ndim - 1]], r.dtype);
}

// =====================================================================
//  views: reshape / transpose
// =====================================================================

function reshapeView(a: NDArray, shape: number[]): NDArray {
  if (isC(a)) return new NDArray(a.data, shape, cStrides(shape), a.offset, a.dtype);
  return mk(new Float64Array(flat(a)), shape, a.dtype);
}
function resolveShape(I: Interp, size: number, shape: number[]): number[] {
  const unknown = shape.filter((s) => s === -1).length;
  if (unknown > 1) I.raise('ValueError', 'can only specify one unknown dimension');
  if (shape.some((s) => s < -1)) I.raise('ValueError', 'negative dimensions not allowed');
  const known = prod(shape.filter((s) => s !== -1));
  const out = [...shape];
  const bad = () => I.raise('ValueError', `cannot reshape array of size ${size} into shape (${shape.map((s) => (s === -1 ? 'newaxis' : String(s))).join(',')}${shape.length === 1 ? ',' : ''})`);
  if (unknown) {
    if (known === 0 || size % known !== 0) bad();
    out[out.indexOf(-1)] = size / known;
  } else if (known !== size) bad();
  return out;
}
function transposeView(a: NDArray, axes: number[]): NDArray {
  return new NDArray(a.data, axes.map((i) => a.shape[i]), axes.map((i) => a.strides[i]), a.offset, a.dtype);
}

// =====================================================================
//  indexing
// =====================================================================

type Idx =
  | { k: 'int'; v: number }
  | { k: 'slice'; s: PySlice }
  | { k: 'new' }
  | { k: 'ell' }
  | { k: 'arr'; a: NDArray }
  | { k: 'bool'; a: NDArray };

const IDX_ERR = 'only integers, slices (`:`), ellipsis (`...`), numpy.newaxis (`None`) and integer or boolean arrays are valid indices';

function toIdx(I: Interp, v: PyVal): Idx {
  if (typeof v === 'bigint') return { k: 'int', v: Number(v) };
  if (v instanceof NPScalar && v.dtype === 'int64') return { k: 'int', v: v.v };
  if (v instanceof PySlice) return { k: 'slice', s: v };
  if (v === null) return { k: 'new' };
  if (isEllipsis(v)) return { k: 'ell' };
  if (typeof v === 'boolean' || (v instanceof NPScalar && v.dtype === 'bool')) unsupported(I, 'indexing with a scalar boolean');
  if (v instanceof PyList || v instanceof PyTuple || v instanceof NDArray || (v instanceof PyObj && v.typeName === 'range')) {
    // a Python range indexes like the list of its integers (a[range(3)] == a[[0, 1, 2]])
    let a = toArr(I, v, v instanceof PyObj && v.typeName === 'range' ? 'int64' : undefined);
    if (a.size === 0 && a.dtype === 'float64' && !(v instanceof NDArray)) a = copyArr(a, 'int64');
    if (isFl(a.dtype)) I.raise('IndexError', 'arrays used as indices must be of integer (or boolean) type');
    if (a.dtype === 'bool') return { k: 'bool', a };
    if (a.ndim === 0 && v instanceof NDArray) return { k: 'int', v: a.data[a.offset] };
    return { k: 'arr', a };
  }
  I.raise('IndexError', IDX_ERR);
}

function sliceInfo(I: Interp, s: PySlice, n: number): [number, number, number] {
  const num = (v: PyVal) => {
    if (v === null) return null;
    if (typeof v === 'bigint' || typeof v === 'boolean' || (v instanceof NPScalar && isIntLike(v.dtype))) return toInt(I, v);
    I.raise('TypeError', 'slice indices must be integers or None or have an __index__ method');
  };
  const step = num(s.step) ?? 1;
  if (step === 0) I.raise('ValueError', 'slice step cannot be zero');
  let lo = num(s.lo), hi = num(s.hi);
  if (step > 0) {
    lo = lo === null ? 0 : lo < 0 ? Math.max(0, lo + n) : Math.min(lo, n);
    hi = hi === null ? n : hi < 0 ? Math.max(0, hi + n) : Math.min(hi, n);
    return [lo, step, Math.max(0, Math.ceil((hi - lo) / step))];
  }
  lo = lo === null ? n - 1 : lo < 0 ? Math.max(-1, lo + n) : Math.min(lo, n - 1);
  hi = hi === null ? -1 : hi < 0 ? Math.max(-1, hi + n) : Math.min(hi, n - 1);
  return [lo, step, Math.max(0, Math.ceil((lo - hi) / -step))];
}

function oob(I: Interp, i: number, ax: number, n: number): never {
  I.raise('IndexError', `index ${i} is out of bounds for axis ${ax} with size ${n}`);
}

interface Parsed {
  items: Idx[];
  adv: boolean;
}
function parseIndex(I: Interp, a: NDArray, key: PyVal): Parsed {
  const raw = key instanceof PyTuple ? key.items : [key];
  const items = raw.map((v) => toIdx(I, v));
  let consumed = 0, ell = 0, adv = false;
  for (const it of items) {
    if (it.k === 'int' || it.k === 'slice' || it.k === 'arr') consumed++;
    else if (it.k === 'bool') consumed += it.a.ndim;
    else if (it.k === 'ell') ell++;
    if (it.k === 'arr' || it.k === 'bool') adv = true;
  }
  if (ell > 1) I.raise('IndexError', "an index can only have a single ellipsis ('...')");
  const nd = a.ndim;
  if (consumed > nd) I.raise('IndexError', `too many indices for array: array is ${nd}-dimensional, but ${consumed} were indexed`);
  const fill: Idx[] = [];
  for (let i = 0; i < nd - consumed; i++) fill.push({ k: 'slice', s: new PySlice(null, null, null) });
  const ei = items.findIndex((x) => x.k === 'ell');
  const out = ei >= 0 ? [...items.slice(0, ei), ...fill, ...items.slice(ei + 1)] : [...items, ...fill];
  return { items: out, adv };
}

function basicView(I: Interp, a: NDArray, items: Idx[]): NDArray {
  const shape: number[] = [], strides: number[] = [];
  let off = a.offset, ax = 0;
  for (const it of items) {
    if (it.k === 'int') {
      const n = a.shape[ax];
      let i = it.v;
      if (i < -n || i >= n) oob(I, i, ax, n);
      if (i < 0) i += n;
      off += i * a.strides[ax];
      ax++;
    } else if (it.k === 'slice') {
      const [start, step, len] = sliceInfo(I, it.s, a.shape[ax]);
      if (len > 0) off += start * a.strides[ax];
      shape.push(len);
      strides.push(a.strides[ax] * step);
      ax++;
    } else if (it.k === 'new') {
      shape.push(1);
      strides.push(0);
    }
  }
  return new NDArray(a.data, shape, strides, off, a.dtype);
}

function nonzeroIdx(a: NDArray): NDArray[] {
  const f = flat(a);
  const nd = a.ndim;
  let cnt = 0;
  for (let i = 0; i < f.length; i++) if (f[i] !== 0) cnt++;
  const outs = Array.from({ length: Math.max(nd, 1) }, () => new Float64Array(cnt));
  const st = cStrides(a.shape);
  let j = 0;
  for (let i = 0; i < f.length; i++) {
    if (f[i] === 0) continue;
    let r = i;
    for (let d = 0; d < nd; d++) {
      outs[d][j] = Math.floor(r / st[d]);
      r -= outs[d][j] * st[d];
    }
    j++;
  }
  if (nd === 0) return [mk(outs[0], [cnt], 'int64')];
  return outs.map((o) => mk(o, [cnt], 'int64'));
}

/** advanced (fancy) indexing: element offsets + result shape */
function advancedOffsets(I: Interp, a: NDArray, items0: Idx[]): { offs: Float64Array; shape: number[] } {
  // expand boolean masks into integer arrays; ints become 0-d index arrays
  const items: (Idx & { ax?: number; fromInt?: boolean })[] = [];
  let ax = 0;
  for (const it of items0) {
    if (it.k === 'bool') {
      for (let i = 0; i < it.a.ndim; i++)
        if (it.a.shape[i] !== a.shape[ax + i])
          I.raise('IndexError', `boolean index did not match indexed array along axis ${ax + i}; size of axis is ${a.shape[ax + i]} but size of corresponding boolean axis is ${it.a.shape[i]}`);
      for (const z of nonzeroIdx(it.a)) items.push({ k: 'arr', a: z, ax: ax++ });
    } else if (it.k === 'int') items.push({ k: 'arr', a: mk(new Float64Array([it.v]), [], 'int64'), ax: ax++, fromInt: true });
    else if (it.k === 'arr' || it.k === 'slice') items.push({ ...it, ax: ax++ });
    else items.push(it);
  }
  const advPos = items.map((it, i) => (it.k === 'arr' ? i : -1)).filter((i) => i >= 0);
  const advArrs = advPos.map((i) => (items[i] as { a: NDArray }).a);
  let B: number[];
  try {
    B = broadcastShapes(I, advArrs.map((x) => x.shape));
  } catch {
    const shown = advPos.filter((p) => !items[p].fromInt).map((p) => shapeStrTight((items[p] as { a: NDArray }).a.shape));
    I.raise('IndexError', `shape mismatch: indexing arrays could not be broadcast together with shapes ${shown.join(' ')} `);
  }
  const adjacent = advPos.every((p, i) => i === 0 || p === advPos[i - 1] + 1);
  const nB = prod(B);
  const table = new Float64Array(nB);
  for (const p of advPos) {
    const it = items[p] as { a: NDArray; ax: number };
    const n = a.shape[it.ax], st = a.strides[it.ax];
    const vals = flat(broadcastTo(I, it.a, B));
    for (let j = 0; j < nB; j++) {
      let i = vals[j];
      if (i < -n || i >= n) oob(I, i, it.ax, n);
      if (i < 0) i += n;
      table[j] += i * st;
    }
  }
  type Loop = { n: number; st: number; table?: Float64Array };
  const loops: Loop[] = [];
  const shape: number[] = [];
  let off = a.offset;
  const group: Loop = { n: nB, st: 0, table };
  if (!adjacent) {
    loops.push(group);
    shape.push(...B);
  }
  let groupDone = !adjacent;
  for (const it of items) {
    if (it.k === 'slice') {
      const [start, step, len] = sliceInfo(I, it.s, a.shape[it.ax!]);
      if (len > 0) off += start * a.strides[it.ax!];
      loops.push({ n: len, st: a.strides[it.ax!] * step });
      shape.push(len);
    } else if (it.k === 'new') {
      loops.push({ n: 1, st: 0 });
      shape.push(1);
    } else if (it.k === 'arr' && !groupDone) {
      loops.push(group);
      shape.push(...B);
      groupDone = true;
    }
  }
  const total = prod(loops.map((l) => l.n));
  const offs = new Float64Array(total);
  let o = 0;
  const rec = (d: number, base: number) => {
    if (d === loops.length) {
      offs[o++] = base;
      return;
    }
    const l = loops[d];
    if (l.table) for (let i = 0; i < l.n; i++) rec(d + 1, base + l.table[i]);
    else for (let i = 0; i < l.n; i++) rec(d + 1, base + i * l.st);
  };
  if (total > 0) rec(0, off);
  return { offs, shape };
}

export function npGetItem(I: Interp, a: NDArray, key: PyVal): PyVal {
  // fast path: a[i] / a[i, j] with plain ints
  if (typeof key === 'bigint' && a.ndim === 1) {
    const n = a.shape[0];
    let i = Number(key);
    if (i < -n || i >= n) oob(I, i, 0, n);
    if (i < 0) i += n;
    return scalarOut(a.data[a.offset + i * a.strides[0]], a.dtype);
  }
  if (key instanceof PyTuple && key.items.length === a.ndim && key.items.every((x) => typeof x === 'bigint')) {
    let off = a.offset;
    for (let d = 0; d < a.ndim; d++) {
      const n = a.shape[d];
      let i = Number(key.items[d] as bigint);
      if (i < -n || i >= n) oob(I, i, d, n);
      if (i < 0) i += n;
      off += i * a.strides[d];
    }
    return scalarOut(a.data[off], a.dtype);
  }
  const p = parseIndex(I, a, key);
  if (!p.adv) {
    const v = basicView(I, a, p.items);
    return v.ndim === 0 ? scalarOut(v.data[v.offset], v.dtype) : v;
  }
  const { offs, shape } = advancedOffsets(I, a, p.items);
  const out = new Float64Array(offs.length);
  for (let i = 0; i < offs.length; i++) out[i] = a.data[offs[i]];
  return mk(out, shape, a.dtype);
}

function assignInto(I: Interp, view: NDArray, v: PyVal) {
  const src = toArr(I, v);
  if (src.size === 1 && view.size > 0) {
    const x = castVal(src.data[src.offset], view.dtype);
    if (isC(view)) view.data.fill(x, view.offset, view.offset + view.size);
    else {
      const offs = offsetsOf(view);
      for (let i = 0; i < offs.length; i++) view.data[offs[i]] = x;
    }
    return;
  }
  // numpy allows leading 1-dims on the source to be dropped
  let s = src;
  while (s.ndim > view.ndim && s.shape[0] === 1) s = reshapeView(s, s.shape.slice(1));
  const b = broadcastTo(I, s, view.shape);
  const vals = new Float64Array(flat(b));
  if (src.dtype !== view.dtype) castInPlace(vals, view.dtype);
  writeFlat(view, vals);
}

export function npSetItem(I: Interp, a: NDArray, key: PyVal, v: PyVal) {
  if (typeof key === 'bigint' && a.ndim === 1 && (typeof v === 'number' || typeof v === 'bigint' || typeof v === 'boolean' || v instanceof NPScalar)) {
    const n = a.shape[0];
    let i = Number(key);
    if (i < -n || i >= n) oob(I, i, 0, n);
    if (i < 0) i += n;
    a.data[a.offset + i * a.strides[0]] = castVal(pyNum(v), a.dtype);
    return;
  }
  const p = parseIndex(I, a, key);
  if (!p.adv) return assignInto(I, basicView(I, a, p.items), v);
  const { offs, shape } = advancedOffsets(I, a, p.items);
  const src = toArr(I, v);
  let vals: Float64Array;
  if (src.size === 1) vals = new Float64Array(offs.length).fill(src.data[src.offset]);
  else {
    let s = src;
    while (s.ndim > shape.length && s.shape[0] === 1) s = reshapeView(s, s.shape.slice(1));
    let b: NDArray;
    try {
      b = broadcastTo(I, s, shape);
    } catch {
      I.raise('ValueError', `shape mismatch: value array of shape ${shapeStrTight(src.shape)} could not be broadcast to indexing result of shape ${shapeStrTight(shape)}`);
    }
    vals = new Float64Array(flat(b));
  }
  for (let i = 0; i < offs.length; i++) a.data[offs[i]] = castVal(vals[i], a.dtype);
}

function axis0(a: NDArray, i: number): NDArray | NPScalar {
  if (a.ndim === 1) return scalarOut(a.data[a.offset + i * a.strides[0]], a.dtype);
  return new NDArray(a.data, a.shape.slice(1), a.strides.slice(1), a.offset + i * a.strides[0], a.dtype);
}

export function npIter(I: Interp, a: NDArray): PyIter {
  if (a.ndim === 0) I.raise('TypeError', 'iteration over a 0-d array');
  let i = 0;
  const n = a.shape[0];
  return new PyIter('iterator', () => (i < n ? axis0(a, i++) : STOP));
}

export function npLen(I: Interp, a: NDArray): bigint {
  if (a.ndim === 0) I.raise('TypeError', 'len() of unsized object');
  return BigInt(a.shape[0]);
}

// =====================================================================
//  printing: Dragon4 (numpy/_core/src/multiarray/dragon4.c) + arrayprint.py
// =====================================================================

const dv = new DataView(new ArrayBuffer(8));
/** round-half-even(x * 10^p) computed exactly; x >= 0 finite */
function roundScaled(x: number, p: number): bigint {
  dv.setFloat64(0, x);
  const hi = dv.getUint32(0), lo = dv.getUint32(4);
  const eb = (hi >>> 20) & 0x7ff;
  let mant = (BigInt(hi & 0xfffff) << 32n) | BigInt(lo);
  let e2: number;
  if (eb === 0) e2 = -1074;
  else {
    mant |= 1n << 52n;
    e2 = eb - 1075;
  }
  let num = mant, den = 1n;
  if (e2 > 0) num <<= BigInt(e2);
  else den <<= BigInt(-e2);
  if (p >= 0) num *= 10n ** BigInt(p);
  else den *= 10n ** BigInt(-p);
  let q = num / den;
  const c = 2n * (num - q * den) - den;
  if (c > 0n || (c === 0n && (q & 1n) === 1n)) q += 1n;
  return q;
}
/** shortest round-trip digits: value = 0.d1d2.. * 10^(exp+1) (d1 at 10^exp) */
function shortest(x: number): { digits: string; exp: number } {
  const s = x.toExponential();
  const i = s.indexOf('e');
  const digits = s.slice(0, i).replace('.', '').replace(/0+$/, '') || '0';
  return { digits, exp: Number(s.slice(i + 1)) };
}

type Trim = 'k' | '.' | '0' | '-';
interface D4 {
  precision: number | null;
  unique: boolean;
  trim: Trim;
  minDigits?: number;
  padLeft?: number;
  padRight?: number;
  sign?: boolean;
  expDigits?: number;
}

function applyTrim(frac: string, o: D4): { frac: string; dot: boolean } {
  let f = frac;
  if (o.unique && o.minDigits !== undefined && o.minDigits > f.length) f = f.padEnd(o.minDigits, '0');
  if (o.trim === '0' && f === '') f = '0';
  else if (o.trim === 'k' && o.precision !== null && o.precision > f.length) f = f.padEnd(o.precision, '0');
  if (o.precision !== null && o.trim !== 'k' && f.length > 0) {
    f = f.replace(/0+$/, '');
    if (f === '' && o.trim === '0') f = '0';
  }
  return { frac: f, dot: !(o.trim === '-' && f === '') };
}

export function dragon4Positional(x: number, o: D4): string {
  const neg = x < 0 || Object.is(x, -0);
  const ax = Math.abs(x);
  let int: string, frac: string;
  if (ax === 0) {
    int = '0';
    frac = '';
  } else {
    let done = false;
    int = frac = '';
    if (o.unique) {
      const { digits, exp } = shortest(ax);
      const nfrac = Math.max(0, digits.length - 1 - exp);
      if (o.precision === null || nfrac <= o.precision) {
        if (exp >= 0) {
          int = digits.slice(0, exp + 1).padEnd(exp + 1, '0');
          frac = digits.slice(exp + 1);
        } else {
          int = '0';
          frac = '0'.repeat(-exp - 1) + digits;
        }
        done = true;
      }
    }
    if (!done) {
      const p = o.precision!;
      const s = roundScaled(ax, p).toString().padStart(p + 1, '0');
      int = s.slice(0, s.length - p);
      frac = s.slice(s.length - p).replace(/0+$/, '');
    }
  }
  const sgn = neg ? '-' : o.sign ? '+' : '';
  const t = applyTrim(frac, o);
  let out = sgn + int + (t.dot ? '.' : '') + t.frac;
  const pr = o.padRight ?? -1;
  if (pr >= t.frac.length) {
    if (o.trim === '-' && t.frac === '') out += ' ';
    out += ' '.repeat(pr - t.frac.length);
  }
  const pl = o.padLeft ?? 0;
  const whole = int.length + sgn.length;
  if (pl > whole) out = ' '.repeat(pl - whole) + out;
  return out;
}

export function dragon4Scientific(x: number, o: D4): string {
  const neg = x < 0 || Object.is(x, -0);
  const ax = Math.abs(x);
  let digits: string, exp: number;
  if (ax === 0) {
    digits = '0';
    exp = 0;
  } else {
    ({ digits, exp } = shortest(ax));
    if (!o.unique || (o.precision !== null && digits.length - 1 > o.precision)) {
      const P = o.precision! + 1;
      let q = roundScaled(ax, P - 1 - exp).toString();
      if (q.length > P) {
        exp += 1;
        q = roundScaled(ax, P - 1 - exp).toString();
      }
      digits = q.replace(/0+$/, '') || '0';
    }
  }
  const sgn = neg ? '-' : o.sign ? '+' : '';
  const t = applyTrim(digits.slice(1), o);
  const ed = o.expDigits === undefined || o.expDigits < 0 ? 2 : o.expDigits;
  let out = sgn + digits[0] + (t.dot ? '.' : '') + t.frac + 'e' + (exp < 0 ? '-' : '+') + String(Math.abs(exp)).padStart(ed, '0');
  const pl = o.padLeft ?? 0;
  if (pl > 1 + sgn.length) out = ' '.repeat(pl - 1 - sgn.length) + out;
  return out;
}

type FmtFn = (x: number) => string;

/** port of arrayprint.FloatingFormat */
function floatFormatter(data: Float64Array, opts: PrintOpts, is0d: boolean): FmtFn {
  const floatmode = opts.floatmode;
  let precision: number | null = floatmode === 'unique' ? null : opts.precision;
  const sign = opts.sign;
  void is0d;
  const finite: number[] = [];
  for (let i = 0; i < data.length; i++) if (isFinite(data[i])) finite.push(data[i]);
  let expFormat = false;
  let maxV = -Infinity, minV = Infinity, anyNZ = false;
  for (const v of finite) {
    if (v === 0) continue;
    anyNZ = true;
    const a = Math.abs(v);
    if (a > maxV) maxV = a;
    if (a < minV) minV = a;
  }
  if (anyNZ && (maxV >= 1e8 || (!opts.suppress && (minV < 0.0001 || maxV / minV > 1000)))) expFormat = true;
  let padLeft = 0, padRight = 0, expSize = -1, unique = true, minDigits: number | undefined = undefined;
  let trim: Trim = '.';
  if (finite.length === 0) {
    padLeft = 0;
    padRight = 0;
    trim = '.';
    expSize = -1;
    unique = true;
  } else if (expFormat) {
    let tr: Trim = '.', un = true;
    if (floatmode === 'fixed') {
      tr = 'k';
      un = false;
    }
    const strs = finite.map((x) => dragon4Scientific(x, { precision, unique: un, trim: tr, sign: sign === '+' }));
    let maxFrac = 0, maxInt = 0, maxExp = 0;
    for (const s of strs) {
      const [m, e] = s.split('e');
      const [ip, fp] = m.split('.');
      maxFrac = Math.max(maxFrac, (fp ?? '').length);
      maxInt = Math.max(maxInt, ip.length);
      maxExp = Math.max(maxExp, e.length);
    }
    expSize = maxExp - 1;
    trim = 'k';
    precision = maxFrac;
    minDigits = maxFrac;
    unique = un;
    padLeft = maxInt;
    padRight = expSize + 2 + precision;
  } else {
    let tr: Trim = '.', un = true;
    if (floatmode === 'fixed') {
      tr = 'k';
      un = false;
    }
    const strs = finite.map((x) => dragon4Positional(x, { precision, unique: un, trim: tr, sign: sign === '+' }));
    let maxInt = 0, maxFrac = 0;
    for (const s of strs) {
      const [ip, fp] = s.split('.');
      maxInt = Math.max(maxInt, ip.length);
      maxFrac = Math.max(maxFrac, (fp ?? '').length);
    }
    padLeft = maxInt;
    padRight = maxFrac;
    expSize = -1;
    unique = un;
    if (floatmode === 'fixed' || floatmode === 'maxprec_equal') {
      precision = minDigits = padRight;
      trim = 'k';
    } else {
      trim = '.';
      minDigits = 0;
    }
  }
  if (sign === ' ' && !finite.some((v) => v < 0 || Object.is(v, -0))) padLeft += 1;
  if (data.length !== finite.length) {
    let neginf = sign !== '-';
    for (let i = 0; i < data.length; i++) if (data[i] === -Infinity) neginf = true;
    const offset = padRight + 1;
    padLeft = Math.max(padLeft, 3 - offset, 3 + (neginf ? 1 : 0) - offset);
  }
  const P = precision, U = unique, TR = trim, MD = minDigits, PL = padLeft, PR = padRight, ES = expSize;
  return (x: number) => {
    if (!isFinite(x)) {
      let ret: string;
      if (x !== x) ret = (sign === '+' ? '+' : '') + 'nan';
      else ret = (x < 0 ? '-' : sign === '+' ? '+' : '') + 'inf';
      return ' '.repeat(Math.max(0, PL + PR + 1 - ret.length)) + ret;
    }
    if (expFormat) return dragon4Scientific(x, { precision: P, minDigits: MD, unique: U, trim: TR, sign: sign === '+', padLeft: PL, expDigits: ES });
    return dragon4Positional(x, { precision: P, minDigits: MD, unique: U, trim: TR, sign: sign === '+', padLeft: PL, padRight: PR });
  };
}

function intFormatter(data: Float64Array, opts: PrintOpts): FmtFn {
  let width = 0;
  if (data.length > 0) {
    let mx = -Infinity, mn = Infinity;
    for (let i = 0; i < data.length; i++) {
      if (data[i] > mx) mx = data[i];
      if (data[i] < mn) mn = data[i];
    }
    let sign = opts.sign;
    let maxLen = intStr(mx).length;
    if (sign === ' ' && mn < 0) sign = '-';
    if (mx >= 0 && (sign === '+' || sign === ' ')) maxLen += 1;
    width = Math.max(maxLen, intStr(mn).length);
    const sg = sign;
    return (x: number) => {
      const s = (x >= 0 && sg === '+' ? '+' : x >= 0 && sg === ' ' ? ' ' : '') + intStr(x);
      return s.padStart(width);
    };
  }
  return (x: number) => intStr(x);
}
const intStr = (x: number) => (Number.isSafeInteger(x) ? String(x) : BigInt(x).toString());

function formatterFor(a: NDArray, data: Float64Array, opts: PrintOpts): FmtFn {
  if (a.dtype === 'bool') {
    const t = a.ndim === 0 ? 'True' : ' True';
    return (x) => (x ? t : 'False');
  }
  if (a.dtype === 'int64') return intFormatter(data, opts);
  if (a.dtype === 'complex128') {
    const re = floatFormatter(data, opts, a.ndim === 0);
    const im = floatFormatter(new Float64Array(data.length), { ...opts, sign: '+' }, a.ndim === 0);
    return (x) => {
      const i = im(0);
      const sp = i.replace(/\s+$/, '').length;
      return re(x) + i.slice(0, sp) + 'j' + i.slice(sp);
    };
  }
  return floatFormatter(data, opts, a.ndim === 0);
}

function extendLine(s: string, line: string, word: string, width: number, prefix: string): [string, string] {
  let needsWrap = line.length + word.length > width;
  if (line.length <= prefix.length) needsWrap = false;
  if (needsWrap) {
    s += line.replace(/\s+$/, '') + '\n';
    line = prefix;
  }
  return [s, line + word];
}
function extendLinePretty(s: string, line: string, word: string, width: number, prefix: string): [string, string] {
  const words = word.split('\n');
  if (words.length === 1) return extendLine(s, line, word, width, prefix);
  const maxLen = Math.max(...words.map((w) => w.length));
  let indent: string;
  if (line.length + maxLen > width && line.length > prefix.length) {
    s += line.replace(/\s+$/, '') + '\n';
    line = prefix + words[0];
    indent = prefix;
  } else {
    indent = ' '.repeat(line.length);
    line += words[0];
  }
  for (const w of words.slice(1)) {
    s += line.replace(/\s+$/, '') + '\n';
    line = indent + w;
  }
  line += ' '.repeat(maxLen - words[words.length - 1].length);
  return [s, line];
}

/** port of arrayprint._formatArray */
function formatArray(a: NDArray, fmt: FmtFn, lineWidth: number, nextLinePrefix: string, separator: string, edgeItems: number, summaryInsert: string): string {
  const vals = flat(a);
  const st = cStrides(a.shape);
  const sepR = separator.replace(/\s+$/, '');
  const rec = (axis: number, off: number, hanging: string, currWidth: number): string => {
    const axesLeft = a.ndim - axis;
    if (axesLeft === 0) return fmt(vals[off]);
    const nextHanging = hanging + ' ';
    const nextWidth = currWidth - 1;
    const len = a.shape[axis];
    const showSummary = !!summaryInsert && 2 * edgeItems < len;
    const leading = showSummary ? edgeItems : 0;
    const trailing = showSummary ? edgeItems : len;
    let s = '';
    if (axesLeft === 1) {
      const elemWidth = currWidth - Math.max(sepR.length, 1);
      let line = hanging;
      for (let i = 0; i < leading; i++) {
        const w = rec(axis + 1, off + i * st[axis], nextHanging, nextWidth);
        [s, line] = extendLinePretty(s, line, w, elemWidth, hanging);
        line += separator;
      }
      if (showSummary) {
        [s, line] = extendLine(s, line, summaryInsert, elemWidth, hanging);
        line += separator;
      }
      for (let i = trailing; i > 1; i--) {
        const w = rec(axis + 1, off + (len - i) * st[axis], nextHanging, nextWidth);
        [s, line] = extendLinePretty(s, line, w, elemWidth, hanging);
        line += separator;
      }
      const w = rec(axis + 1, off + (len - 1) * st[axis], nextHanging, nextWidth);
      [s, line] = extendLinePretty(s, line, w, elemWidth, hanging);
      s += line;
    } else {
      const lineSep = sepR + '\n'.repeat(axesLeft - 1);
      for (let i = 0; i < leading; i++) s += hanging + rec(axis + 1, off + i * st[axis], nextHanging, nextWidth) + lineSep;
      if (showSummary) s += hanging + summaryInsert + lineSep;
      for (let i = trailing; i > 1; i--) s += hanging + rec(axis + 1, off + (len - i) * st[axis], nextHanging, nextWidth) + lineSep;
      s += hanging + rec(axis + 1, off + (len - 1) * st[axis], nextHanging, nextWidth);
    }
    return '[' + s.slice(hanging.length) + ']';
  };
  return rec(0, 0, nextLinePrefix, lineWidth);
}

/** elements used to build the format function (summarized arrays only use their edges) */
function leadingTrailing(a: NDArray, edge: number): Float64Array {
  const parts: number[] = [];
  const st = cStrides(a.shape);
  const vals = flat(a);
  const rec = (axis: number, off: number) => {
    if (axis === a.ndim) {
      parts.push(vals[off]);
      return;
    }
    const n = a.shape[axis];
    const idx: number[] = [];
    if (2 * edge < n) {
      for (let i = 0; i < edge; i++) idx.push(i);
      for (let i = n - edge; i < n; i++) idx.push(i);
    } else for (let i = 0; i < n; i++) idx.push(i);
    for (const i of idx) rec(axis + 1, off + i * st[axis]);
  };
  rec(0, 0);
  return Float64Array.from(parts);
}

function array2string(a: NDArray, opts: PrintOpts, separator: string, prefix: string, suffix: string): string {
  const width = opts.linewidth - suffix.length;
  if (a.size === 0) return '[]';
  let summary = '';
  let data: Float64Array;
  if (a.size > opts.threshold) {
    summary = '...';
    data = leadingTrailing(a, opts.edgeitems);
  } else data = flat(a);
  const fmt = formatterFor(a, data, opts);
  return formatArray(a, fmt, width, ' ' + ' '.repeat(prefix.length), separator, opts.edgeitems, summary);
}

export function arrayRepr(I: Interp, a: NDArray): string {
  const opts = S(I).opts;
  const prefix = 'array(';
  const lst = array2string(a, opts, ', ', prefix, ')');
  const extras: string[] = [];
  if ((a.size === 0 && !(a.ndim === 1 && a.shape[0] === 0)) || a.size > opts.threshold) extras.push(`shape=${shapeStr(a.shape)}`);
  if (a.size === 0) extras.push(`dtype=${a.dtype}`);
  if (!extras.length) return prefix + lst + ')';
  const arrStr = prefix + lst + ',';
  const extra = extras.join(', ') + ')';
  const lastLine = arrStr.length - (arrStr.lastIndexOf('\n') + 1);
  const spacer = lastLine + extra.length + 1 > opts.linewidth ? '\n' + ' '.repeat(prefix.length) : ' ';
  return arrStr + spacer + extra;
}

export function arrayStr(I: Interp, a: NDArray): string {
  if (a.ndim === 0) return scalarStr(new NPScalar(a.data[a.offset], a.dtype));
  return array2string(a, S(I).opts, ' ', '', '');
}

export function scalarStr(s: NPScalar): string {
  if (s.half) return halfStr(s.v);
  if (s.dtype === 'bool') return s.v ? 'True' : 'False';
  if (s.dtype === 'int64') return intStr(s.v);
  if (s.dtype === 'complex128') return s.v === 0 && !Object.is(s.v, -0) ? '0j' : '(' + floatRepr(s.v).replace(/\.0$/, '') + '+0j)';
  return floatRepr(s.v);
}
export function scalarRepr(I: Interp, s: NPScalar): string {
  const legacy = S(I).opts.legacy;
  if (legacy) return scalarStr(s);
  if (s.dtype === 'bool') return s.v ? 'np.True_' : 'np.False_';
  const str = scalarStr(s);
  return `np.${s.half ? 'float16' : s.dtype}(${s.dtype === 'complex128' ? str.replace(/^\((.*)\)$/, '$1') : str})`;
}

/** element strings for the trace visualizer (numpy str() formatting of each element) */
export function npElementStrings(I: Interp, a: NDArray, cap = 400): { values: string[]; truncated: boolean } {
  const vals = flat(a);
  const n = Math.min(vals.length, cap);
  const fmt = formatterFor(a, vals.subarray(0, Math.max(n, 0)), npStates.get(I)?.opts ?? defaultOpts());
  const out: string[] = [];
  for (let i = 0; i < n; i++) out.push(fmt(vals[i]).trim());
  return { values: out, truncated: vals.length > cap };
}

// =====================================================================
//  reductions (summation order mirrors NumPy: pairwise along the
//  innermost-in-memory reduced axis, sequential elsewhere)
// =====================================================================

function pairwiseSum(d: Float64Array, s: number, n: number): number {
  if (n < 8) {
    let res = 0;
    for (let i = 0; i < n; i++) res += d[s + i];
    return res;
  }
  if (n <= 128) {
    let r0 = d[s], r1 = d[s + 1], r2 = d[s + 2], r3 = d[s + 3], r4 = d[s + 4], r5 = d[s + 5], r6 = d[s + 6], r7 = d[s + 7];
    let i: number;
    const lim = n - (n % 8);
    for (i = 8; i < lim; i += 8) {
      r0 += d[s + i];
      r1 += d[s + i + 1];
      r2 += d[s + i + 2];
      r3 += d[s + i + 3];
      r4 += d[s + i + 4];
      r5 += d[s + i + 5];
      r6 += d[s + i + 6];
      r7 += d[s + i + 7];
    }
    let res = r0 + r1 + (r2 + r3) + (r4 + r5 + (r6 + r7));
    for (; i < n; i++) res += d[s + i];
    return res;
  }
  let n2 = Math.floor(n / 2);
  n2 -= n2 % 8;
  return pairwiseSum(d, s, n2) + pairwiseSum(d, s + n2, n - n2);
}

interface RedPlan {
  chunks: Float64Array; // reduced elements per output, consecutive
  m: number; // elements per output
  block: number; // contiguous block length that numpy sums pairwise
  outShape: number[]; // without keepdims
  keepShape: number[]; // with keepdims
}
function planReduce(a: NDArray, axes: number[] | null): RedPlan {
  const nd = a.ndim;
  const R = axes ?? a.shape.map((_, i) => i);
  const isRed = (i: number) => R.includes(i);
  // memory order: largest |stride| first (stable)
  const order = a.shape.map((_, i) => i).sort((x, y) => Math.abs(a.strides[y]) - Math.abs(a.strides[x]) || x - y);
  const big = order.filter((i) => a.shape[i] > 1);
  const K = a.shape.map((_, i) => i).filter((i) => !isRed(i));
  const Rm = order.filter((i) => isRed(i));
  const t = transposeView(a, [...K, ...Rm]);
  const chunks = flat(t);
  const m = prod(R.map((i) => a.shape[i]));
  let block = 1;
  if (K.length === 0 || K.every((i) => a.shape[i] === 1)) block = m;
  else if (big.length && isRed(big[big.length - 1])) {
    let j = big.length - 1;
    block = a.shape[big[j]];
    while (j > 0 && isRed(big[j - 1]) && Math.abs(a.strides[big[j - 1]]) === Math.abs(a.strides[big[j]]) * a.shape[big[j]]) {
      j--;
      block *= a.shape[big[j]];
    }
  }
  void nd;
  return { chunks, m, block, outShape: K.map((i) => a.shape[i]), keepShape: a.shape.map((s, i) => (isRed(i) ? 1 : s)) };
}

function sumChunks(p: RedPlan, src: Float64Array = p.chunks): Float64Array {
  const nOut = p.m === 0 ? prod(p.outShape) : src.length / p.m;
  const out = new Float64Array(nOut);
  for (let o = 0; o < nOut; o++) {
    const s = o * p.m;
    let acc = 0;
    if (p.block > 1) for (let b = 0; b < p.m; b += p.block) acc += pairwiseSum(src, s + b, Math.min(p.block, p.m - b));
    else for (let i = 0; i < p.m; i++) acc += src[s + i];
    out[o] = acc;
  }
  return out;
}

function finishRed(I: Interp, data: Float64Array, p: RedPlan, keepdims: boolean, dt: DType): PyVal {
  const shape = keepdims ? p.keepShape : p.outShape;
  return wrap(mk(data, [...shape], dt));
}

function redArgs(I: Interp, fname: string, args: PyVal[], kw: Map<string, PyVal>, extra: string[] = []) {
  const A = parseArgs(I, fname, args, kw, ['a', 'axis=', 'dtype=', 'out=', 'keepdims=', 'initial=', 'where=', ...extra]);
  const a = toArr(I, A.a!);
  if (A.out !== undefined && A.out !== null) unsupported(I, `${fname}(out=...)`);
  if (A.where !== undefined) unsupported(I, `${fname}(where=...)`);
  return { A, a, axes: axesArg(I, A.axis, a.ndim), keep: toBool(I, A.keepdims) };
}

function rSum(I: Interp, args: PyVal[], kw: Map<string, PyVal>, fname = 'sum'): PyVal {
  const { A, a, axes, keep } = redArgs(I, fname, args, kw);
  let dt: DType = isFl(a.dtype) ? a.dtype : 'int64';
  const want = dtypeArg(I, A.dtype);
  if (want) dt = want;
  const p = planReduce(a, axes);
  const out = sumChunks(p);
  if (A.initial !== undefined && A.initial !== null) {
    const init = toFloat(I, A.initial);
    for (let i = 0; i < out.length; i++) out[i] += init;
  }
  if (!isFl(dt)) castInPlace(out, dt);
  return finishRed(I, out, p, keep, dt);
}
function rProd(I: Interp, args: PyVal[], kw: Map<string, PyVal>): PyVal {
  const { A, a, axes, keep } = redArgs(I, 'prod', args, kw);
  const dt: DType = dtypeArg(I, A.dtype) ?? (isFl(a.dtype) ? a.dtype : 'int64');
  const p = planReduce(a, axes);
  const nOut = prod(p.outShape);
  const out = new Float64Array(nOut);
  for (let o = 0; o < nOut; o++) {
    let acc = 1;
    for (let i = 0; i < p.m; i++) acc *= p.chunks[o * p.m + i];
    out[o] = acc;
  }
  return finishRed(I, out, p, keep, dt);
}
function rMean(I: Interp, args: PyVal[], kw: Map<string, PyVal>): PyVal {
  const { A, a, axes, keep } = redArgs(I, 'mean', args, kw);
  const p = planReduce(a, axes);
  const out = sumChunks(p);
  for (let i = 0; i < out.length; i++) out[i] = out[i] / p.m;
  const dt = dtypeArg(I, A.dtype) ?? (a.dtype === 'complex128' ? a.dtype : 'float64');
  if (!isFl(dt)) castInPlace(out, dt);
  return finishRed(I, out, p, keep, dt);
}
function varCore(I: Interp, a: NDArray, axes: number[] | null, ddof: number, keep: boolean): { out: Float64Array; p: RedPlan } {
  const p = planReduce(a, axes);
  const means = sumChunks(p);
  for (let i = 0; i < means.length; i++) means[i] = means[i] / p.m;
  // x = arr - arrmean (broadcast, in the original layout), then x*x, then sum with the same plan
  const meanArr = mk(means, [...p.keepShape], 'float64');
  const x = binUfunc(I, 'subtract', a.dtype === 'float64' ? a : copyArr(a, 'float64'), meanArr);
  x.dtype = 'float64';
  const xd = x.data;
  for (let i = 0; i < xd.length; i++) xd[i] = xd[i] * xd[i];
  // x is C-contiguous with a's logical shape: plan again on it but keep a's memory order for the pairwise decision
  const px = planReduce(likeLayout(x, a), axes);
  const sq = sumChunks(px);
  const cnt = Math.max(p.m - ddof, 0);
  for (let i = 0; i < sq.length; i++) sq[i] = sq[i] / cnt;
  return { out: sq, p };
}
/** x (C-contiguous) re-laid out in a's memory order, as numpy's K-order ufunc output would be */
function likeLayout(x: NDArray, a: NDArray): NDArray {
  if (isC(a)) return x;
  const perm = a.shape.map((_, i) => i).sort((i, j) => Math.abs(a.strides[j]) - Math.abs(a.strides[i]) || i - j);
  const t = copyArr(transposeView(x, perm));
  const inv = new Array(perm.length);
  perm.forEach((p, i) => (inv[p] = i));
  return transposeView(t, inv);
}
function rVar(I: Interp, args: PyVal[], kw: Map<string, PyVal>, sqrt: boolean): PyVal {
  const { A, a, axes, keep } = redArgs(I, sqrt ? 'std' : 'var', args, kw, ['ddof=', 'correction=']);
  const ddof = A.ddof !== undefined ? toFloat(I, A.ddof) : A.correction !== undefined ? toFloat(I, A.correction) : 0;
  const { out, p } = varCore(I, a, axes, ddof, keep);
  if (sqrt) for (let i = 0; i < out.length; i++) out[i] = Math.sqrt(out[i]);
  return finishRed(I, out, p, keep, 'float64');
}
function rMinMax(I: Interp, args: PyVal[], kw: Map<string, PyVal>, isMax: boolean, fname: string): PyVal {
  const { A, a, axes, keep } = redArgs(I, fname, args, kw);
  const p = planReduce(a, axes);
  const nOut = prod(p.outShape);
  const hasInit = A.initial !== undefined && A.initial !== null;
  if (p.m === 0 && !hasInit) I.raise('ValueError', `zero-size array to reduction operation ${isMax ? 'maximum' : 'minimum'} which has no identity`);
  const out = new Float64Array(nOut);
  for (let o = 0; o < nOut; o++) {
    let best = hasInit ? toFloat(I, A.initial!) : p.chunks[o * p.m];
    for (let i = 0; i < p.m; i++) {
      const x = p.chunks[o * p.m + i];
      if (x !== x) {
        best = NaN;
        break;
      }
      if (isMax ? x > best : x < best) best = x;
    }
    out[o] = best;
  }
  return finishRed(I, out, p, keep, a.dtype);
}
function rArg(I: Interp, args: PyVal[], kw: Map<string, PyVal>, isMax: boolean): PyVal {
  const fname = isMax ? 'argmax' : 'argmin';
  const A = parseArgs(I, fname, args, kw, ['a', 'axis=', 'out=', 'keepdims=']);
  let a = toArr(I, A.a!);
  const keep = toBool(I, A.keepdims);
  let axes: number[] | null = null;
  if (A.axis !== undefined && A.axis !== null) axes = [normAxis(I, toInt(I, A.axis), a.ndim)];
  if (axes === null) a = reshapeView(a, [a.size]);
  const ax = axes ? axes[0] : 0;
  if (a.shape[ax] === 0) I.raise('ValueError', `attempt to get ${fname} of an empty sequence`);
  const t = transposeView(a, [...a.shape.map((_, i) => i).filter((i) => i !== ax), ax]);
  const d = flat(t);
  const m = a.shape[ax];
  const nOut = d.length / m;
  const out = new Float64Array(nOut);
  for (let o = 0; o < nOut; o++) {
    let bi = 0, best = d[o * m];
    if (best === best)
      for (let i = 1; i < m; i++) {
        const x = d[o * m + i];
        if (x !== x) {
          bi = i;
          break;
        }
        if (isMax ? x > best : x < best) {
          best = x;
          bi = i;
        }
      }
    out[o] = bi;
  }
  let shape = a.shape.filter((_, i) => i !== ax);
  if (keep) shape = axes ? a.shape.map((s, i) => (i === ax ? 1 : s)) : (toArr(I, A.a!).shape.map(() => 1));
  return wrap(mk(out, shape, 'int64'));
}
function rAllAny(I: Interp, args: PyVal[], kw: Map<string, PyVal>, isAll: boolean): PyVal {
  const { a, axes, keep } = redArgs(I, isAll ? 'all' : 'any', args, kw);
  const p = planReduce(a, axes);
  const nOut = prod(p.outShape);
  const out = new Float64Array(nOut);
  for (let o = 0; o < nOut; o++) {
    let r = isAll;
    for (let i = 0; i < p.m; i++) {
      const x = p.chunks[o * p.m + i] !== 0;
      if (isAll ? !x : x) {
        r = !isAll;
        break;
      }
    }
    out[o] = r ? 1 : 0;
  }
  return finishRed(I, out, p, keep, 'bool');
}
function cumulative(I: Interp, args: PyVal[], kw: Map<string, PyVal>, isProd: boolean): PyVal {
  const A = parseArgs(I, isProd ? 'cumprod' : 'cumsum', args, kw, ['a', 'axis=', 'dtype=', 'out=']);
  let a = toArr(I, A.a!);
  if (A.axis === undefined || A.axis === null) a = reshapeView(a, [a.size]);
  const ax = A.axis === undefined || A.axis === null ? 0 : normAxis(I, toInt(I, A.axis), a.ndim);
  const dt: DType = dtypeArg(I, A.dtype) ?? (a.dtype === 'bool' ? 'int64' : a.dtype);
  const out = copyArr(a, dt === 'bool' ? 'int64' : dt);
  const st = out.strides[ax], n = out.shape[ax];
  const others = transposeView(new NDArray(out.data, out.shape, out.strides, 0, dt), [...a.shape.map((_, i) => i).filter((i) => i !== ax), ax]);
  const offs = offsetsOf(new NDArray(others.data, others.shape.slice(0, -1), others.strides.slice(0, -1), 0, dt));
  for (const o of offs) {
    let acc = isProd ? 1 : 0;
    for (let i = 0; i < n; i++) {
      acc = isProd ? acc * out.data[o + i * st] : acc + out.data[o + i * st];
      out.data[o + i * st] = acc;
    }
  }
  out.dtype = dt;
  return out;
}

// =====================================================================
//  argument parsing
// =====================================================================

type Args = Record<string, PyVal | undefined>;
function parseArgs(I: Interp, fname: string, args: PyVal[], kw: Map<string, PyVal>, spec: string[]): Args {
  const out: Args = {};
  const names = spec.map((s) => s.replace(/=$/, ''));
  if (args.length > names.length) I.raise('TypeError', `${fname}() takes at most ${names.length} arguments (${args.length} given)`);
  args.forEach((v, i) => (out[names[i]] = v));
  for (const [k, v] of kw) {
    if (!names.includes(k)) I.raise('TypeError', `${fname}() got an unexpected keyword argument '${k}'`);
    if (out[k] !== undefined) I.raise('TypeError', `argument for ${fname}() given by name ('${k}') and position`);
    out[k] = v;
  }
  spec.forEach((s, i) => {
    if (!s.endsWith('=') && out[names[i]] === undefined) I.raise('TypeError', `${fname}() missing required argument '${names[i]}' (pos ${i + 1})`);
  });
  return out;
}

// =====================================================================
//  shape manipulation
// =====================================================================

function shapeFromArgs(I: Interp, a: PyVal[]): number[] {
  if (a.length === 1 && (a[0] instanceof PyTuple || a[0] instanceof PyList)) return (a[0] as PyTuple).items.map((x) => toInt(I, x));
  return a.map((x) => toInt(I, x));
}
function reshape(I: Interp, a: NDArray, shape: number[]): NDArray {
  return reshapeView(a, resolveShape(I, a.size, shape));
}
function transpose(I: Interp, a: NDArray, axes: number[] | null): NDArray {
  if (axes === null) return transposeView(a, a.shape.map((_, i) => a.ndim - 1 - i));
  if (axes.length !== a.ndim) I.raise('ValueError', "axes don't match array");
  const ax = axes.map((x) => normAxis(I, x, a.ndim));
  if (new Set(ax).size !== ax.length) I.raise('ValueError', 'repeated axis in transpose');
  return transposeView(a, ax);
}
function swapaxes(I: Interp, a: NDArray, i: number, j: number): NDArray {
  const ax = a.shape.map((_, k) => k);
  const x = normAxis(I, i, a.ndim), y = normAxis(I, j, a.ndim);
  [ax[x], ax[y]] = [ax[y], ax[x]];
  return transposeView(a, ax);
}
function squeeze(I: Interp, a: NDArray, axis: PyVal | undefined): NDArray {
  const axes = axesArg(I, axis, a.ndim);
  const keep: number[] = [];
  a.shape.forEach((s, i) => {
    if (axes ? !axes.includes(i) : s !== 1) keep.push(i);
    else if (axes && s !== 1) I.raise('ValueError', 'cannot select an axis to squeeze out which has size not equal to one');
  });
  return new NDArray(a.data, keep.map((i) => a.shape[i]), keep.map((i) => a.strides[i]), a.offset, a.dtype);
}
function expandDims(I: Interp, a: NDArray, axis: PyVal): NDArray {
  const list = axis instanceof PyTuple || axis instanceof PyList ? axis.items.map((x) => toInt(I, x)) : [toInt(I, axis)];
  const nd = a.ndim + list.length;
  const axes = list.map((x) => normAxis(I, x, nd)).sort((x, y) => x - y);
  const shape = [...a.shape], strides = [...a.strides];
  for (const ax of axes) {
    shape.splice(ax, 0, 1);
    strides.splice(ax, 0, 0);
  }
  return new NDArray(a.data, shape, strides, a.offset, a.dtype);
}
function atleast(a: NDArray, n: number): NDArray {
  if (a.ndim >= n) return a;
  if (n === 1) return reshapeView(a, [a.size]);
  if (n === 2) return a.ndim === 0 ? reshapeView(a, [1, 1]) : reshapeView(a, [1, a.shape[0]]);
  if (a.ndim === 0) return reshapeView(a, [1, 1, 1]);
  if (a.ndim === 1) return reshapeView(a, [1, a.shape[0], 1]);
  return reshapeView(a, [...a.shape, 1]);
}

function seqArrays(I: Interp, v: PyVal): NDArray[] {
  if (v instanceof NDArray) return Array.from({ length: v.shape[0] }, (_, i) => axis0(v, i)).map((x) => toArr(I, x));
  return I.runSync(I.toArray(v)).map((x) => toArr(I, x));
}

function concatenate(I: Interp, arrs: NDArray[], axisV: PyVal | undefined): NDArray {
  if (!arrs.length) I.raise('ValueError', 'need at least one array to concatenate');
  if (axisV === null) arrs = arrs.map((a) => reshapeView(a, [a.size]));
  if (arrs.some((a) => a.ndim === 0)) I.raise('ValueError', 'zero-dimensional arrays cannot be concatenated');
  const nd = arrs[0].ndim;
  const ax = axisV === null || axisV === undefined ? 0 : normAxis(I, toInt(I, axisV), nd);
  arrs.forEach((a, i) => {
    if (a.ndim !== nd)
      I.raise('ValueError', `all the input arrays must have same number of dimensions, but the array at index 0 has ${nd} dimension(s) and the array at index ${i} has ${a.ndim} dimension(s)`);
    for (let d = 0; d < nd; d++)
      if (d !== ax && a.shape[d] !== arrs[0].shape[d])
        I.raise('ValueError', `all the input array dimensions except for the concatenation axis must match exactly, but along dimension ${d}, the array at index 0 has size ${arrs[0].shape[d]} and the array at index ${i} has size ${a.shape[d]}`);
  });
  const shape = [...arrs[0].shape];
  shape[ax] = arrs.reduce((s, a) => s + a.shape[ax], 0);
  const dt = arrs.reduce<DType>((d, a) => maxDt(d, a.dtype), 'bool');
  const out = zerosArr(shape, dt);
  let pos = 0;
  for (const a of arrs) {
    const items: Idx[] = shape.map((_, d) => (d === ax ? { k: 'slice', s: new PySlice(BigInt(pos), BigInt(pos + a.shape[ax]), null) } : { k: 'slice', s: new PySlice(null, null, null) }));
    const view = basicView(I, out, items);
    const vals = new Float64Array(flat(a));
    if (a.dtype !== dt) castInPlace(vals, dt);
    writeFlat(view, vals);
    pos += a.shape[ax];
  }
  return out;
}
function stack(I: Interp, arrs: NDArray[], axisV: PyVal | undefined): NDArray {
  if (!arrs.length) I.raise('ValueError', 'need at least one array to stack');
  const s0 = arrs[0].shape;
  if (arrs.some((a) => a.ndim !== s0.length || a.shape.some((s, i) => s !== s0[i]))) I.raise('ValueError', 'all input arrays must have the same shape');
  const ax = axisV === undefined ? 0 : normAxis(I, toInt(I, axisV), s0.length + 1);
  return concatenate(I, arrs.map((a) => expandDims(I, a, BigInt(ax))), BigInt(ax));
}

function sortedCopy(a: NDArray, ax: number): NDArray {
  const out = copyArr(a);
  const st = out.strides[ax], n = out.shape[ax];
  const rest = new NDArray(out.data, out.shape.filter((_, i) => i !== ax), out.strides.filter((_, i) => i !== ax), 0, out.dtype);
  const buf = new Float64Array(n);
  for (const o of offsetsOf(rest)) {
    for (let i = 0; i < n; i++) buf[i] = out.data[o + i * st];
    buf.sort(); // typed-array sort is numeric and puts NaN last, like numpy
    for (let i = 0; i < n; i++) out.data[o + i * st] = buf[i];
  }
  return out;
}
function argsortArr(a: NDArray, ax: number): NDArray {
  const src = copyArr(a);
  const out = zerosArr([...a.shape], 'int64');
  const st = src.strides[ax], n = src.shape[ax];
  const rest = new NDArray(src.data, src.shape.filter((_, i) => i !== ax), src.strides.filter((_, i) => i !== ax), 0, src.dtype);
  const idx = new Array<number>(n);
  for (const o of offsetsOf(rest)) {
    for (let i = 0; i < n; i++) idx[i] = i;
    idx.sort((i, j) => {
      const x = src.data[o + i * st], y = src.data[o + j * st];
      if (x !== x) return y !== y ? i - j : 1;
      if (y !== y) return -1;
      return x < y ? -1 : x > y ? 1 : i - j;
    });
    for (let i = 0; i < n; i++) out.data[o + i * st] = idx[i];
  }
  return out;
}

// =====================================================================
//  module-level functions
// =====================================================================

type NpFn = (I: Interp, a: PyVal[], kw: Map<string, PyVal>) => PyVal;

function roundArr(a: NDArray, d: number): NDArray {
  if (!isFl(a.dtype)) {
    if (d >= 0) return copyArr(a);
    const f = Math.pow(10, -d);
    return map1(a, (x) => rint(x / f) * f || 0, a.dtype === 'bool' ? 'int64' : a.dtype);
  }
  if (d === 0) return map1(a, rint, a.dtype);
  if (d > 0) {
    const f = Math.pow(10, d);
    return map1(a, (x) => rint(x * f) / f, a.dtype);
  }
  const f = Math.pow(10, -d);
  return map1(a, (x) => rint(x / f) * f, a.dtype);
}

function clipArr(I: Interp, a: NDArray, lo: PyVal | undefined, hi: PyVal | undefined): NDArray {
  let r = a;
  const none = (v: PyVal | undefined) => v === undefined || v === null;
  if (none(lo) && none(hi)) I.raise('ValueError', 'One of max or min must be given');
  if (!none(lo)) r = binUfunc(I, 'maximum', r, toArr(I, lo!));
  if (!none(hi)) r = binUfunc(I, 'minimum', r, toArr(I, hi!));
  if (r === a) r = copyArr(a);
  return r;
}

function whereFn(I: Interp, c: NDArray, x: NDArray, y: NDArray): NDArray {
  const shape = broadcastShapes(I, [c.shape, x.shape, y.shape]);
  const C = flat(broadcastTo(I, c, shape)), X = flat(broadcastTo(I, x, shape)), Y = flat(broadcastTo(I, y, shape));
  const dt = maxDt(x.dtype, y.dtype);
  const out = new Float64Array(C.length);
  for (let i = 0; i < out.length; i++) out[i] = C[i] ? X[i] : Y[i];
  return mk(out, shape, dt);
}

function isclose(I: Interp, a: NDArray, b: NDArray, rtol: number, atol: number, equalNan: boolean): NDArray {
  return zip2(I, a, b, (x, y) => {
    if (x === y) return 1;
    if (x !== x || y !== y) return equalNan && x !== x && y !== y ? 1 : 0;
    if (!isFinite(x) || !isFinite(y)) return 0;
    return Math.abs(x - y) <= atol + rtol * Math.abs(y) ? 1 : 0;
  }, 'bool');
}

function triMask(I: Interp, m: NDArray, k: number, upper: boolean): NDArray {
  if (m.ndim < 2) {
    if (m.ndim === 1) m = reshapeView(m, [1, m.shape[0]]);
    const out = zerosArr([m.shape[1], m.shape[1]], m.dtype);
    const v = flat(m);
    const n = m.shape[1];
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) out.data[i * n + j] = (upper ? j - i >= k : j - i <= k) ? v[j] : 0;
    return out;
  }
  const out = copyArr(m);
  const r = m.shape[m.ndim - 2], c = m.shape[m.ndim - 1];
  const nb = out.size / (r * c);
  for (let b = 0; b < nb; b++)
    for (let i = 0; i < r; i++)
      for (let j = 0; j < c; j++) if (!(upper ? j - i >= k : j - i <= k)) out.data[b * r * c + i * c + j] = 0;
  return out;
}

function diagFn(I: Interp, v: NDArray, k: number): NDArray {
  if (v.ndim === 1) {
    const n = v.shape[0] + Math.abs(k);
    const out = zerosArr([n, n], v.dtype);
    const f = flat(v);
    for (let i = 0; i < f.length; i++) out.data[(k >= 0 ? i : i - k) * n + (k >= 0 ? i + k : i)] = f[i];
    return out;
  }
  if (v.ndim !== 2) I.raise('ValueError', 'Input must be 1- or 2-d.');
  return copyArr(diagonalView(v, k, 0, 1));
}
function diagonalView(a: NDArray, k: number, ax1: number, ax2: number): NDArray {
  const n1 = a.shape[ax1], n2 = a.shape[ax2];
  const len = Math.max(0, k >= 0 ? Math.min(n1, n2 - k) : Math.min(n1 + k, n2));
  const off = a.offset + (len > 0 ? (k >= 0 ? k * a.strides[ax2] : -k * a.strides[ax1]) : 0);
  const rest = a.shape.map((_, i) => i).filter((i) => i !== ax1 && i !== ax2);
  return new NDArray(a.data, [...rest.map((i) => a.shape[i]), len], [...rest.map((i) => a.strides[i]), a.strides[ax1] + a.strides[ax2]], off, a.dtype);
}

function uniqueFn(I: Interp, a: NDArray, kw: Args): PyVal {
  const vals = flat(a);
  const idx = Array.from(vals.keys());
  idx.sort((i, j) => {
    const x = vals[i], y = vals[j];
    if (x !== x) return y !== y ? i - j : 1;
    if (y !== y) return -1;
    return x < y ? -1 : x > y ? 1 : i - j;
  });
  const uniq: number[] = [], first: number[] = [], counts: number[] = [];
  const inverse = new Float64Array(vals.length);
  for (const i of idx) {
    const x = vals[i];
    const last = uniq.length - 1;
    if (last >= 0 && (uniq[last] === x || (x !== x && uniq[last] !== uniq[last]))) {
      counts[last]++;
    } else {
      uniq.push(x);
      first.push(i);
      counts.push(1);
    }
    inverse[i] = uniq.length - 1;
  }
  const u = mk(Float64Array.from(uniq), [uniq.length], a.dtype);
  const extras: PyVal[] = [];
  if (toBool(I, kw.return_index)) extras.push(mk(Float64Array.from(first), [first.length], 'int64'));
  if (toBool(I, kw.return_inverse)) extras.push(mk(inverse, a.ndim > 1 ? [...a.shape] : [vals.length], 'int64'));
  if (toBool(I, kw.return_counts)) extras.push(mk(Float64Array.from(counts), [counts.length], 'int64'));
  return extras.length ? new PyTuple([u, ...extras]) : u;
}

function arangeFn(I: Interp, args: PyVal[], kw: Map<string, PyVal>): NDArray {
  const A = parseArgs(I, 'arange', args, kw, ['start=', 'stop=', 'step=', 'dtype=']);
  let start = A.start, stop = A.stop;
  const step = A.step;
  if (stop === undefined || stop === null) {
    stop = start;
    start = 0n;
  }
  if (start === undefined) I.raise('TypeError', "arange() missing required argument 'start' (pos 1)");
  const vals = [start!, stop!, step ?? 1n];
  let dt: DType = 'int64';
  for (const v of vals) {
    const k = pyNumKind(v);
    if (k === null) I.raise('TypeError', `unsupported operand type(s) for -: '${typeNameOf(v)}' and 'int'`);
    if (k === 'float64') dt = 'float64';
  }
  const s0 = pyNum(start!), s1 = pyNum(stop!), st = pyNum(step ?? 1n);
  if (st === 0) I.raise('ZeroDivisionError', 'division by zero');
  const want = dtypeArg(I, A.dtype);
  const len = Math.max(0, Math.ceil((s1 - s0) / st));
  const out = new Float64Array(len);
  if (len > 0) out[0] = s0;
  if (len > 1) {
    const second = s0 + st;
    const delta = second - s0;
    out[1] = second;
    for (let i = 2; i < len; i++) out[i] = s0 + i * delta;
  }
  const r = mk(out, [len], dt);
  return want && want !== dt ? copyArr(r, want) : r;
}

function linspaceFn(I: Interp, args: PyVal[], kw: Map<string, PyVal>): PyVal {
  const A = parseArgs(I, 'linspace', args, kw, ['start', 'stop', 'num=', 'endpoint=', 'retstep=', 'dtype=', 'axis=']);
  const num = A.num === undefined ? 50 : toInt(I, A.num);
  if (num < 0) I.raise('ValueError', `Number of samples, ${num}, must be non-negative.`);
  const endpoint = toBool(I, A.endpoint, true);
  const a0 = toArr(I, A.start!), b0 = toArr(I, A.stop!);
  if (a0.ndim || b0.ndim) unsupported(I, 'linspace with array start/stop');
  const start = a0.data[a0.offset], stop = b0.data[b0.offset];
  const div = endpoint ? num - 1 : num;
  const delta = stop - start;
  const out = new Float64Array(num);
  for (let i = 0; i < num; i++) out[i] = i;
  let step = NaN;
  if (div > 0) {
    step = delta / div;
    if (step === 0) for (let i = 0; i < num; i++) out[i] = (out[i] / div) * delta;
    else for (let i = 0; i < num; i++) out[i] = out[i] * step;
  } else for (let i = 0; i < num; i++) out[i] = out[i] * delta;
  for (let i = 0; i < num; i++) out[i] += start;
  if (endpoint && num > 1) out[num - 1] = stop;
  let r = mk(out, [num], 'float64');
  const want = dtypeArg(I, A.dtype);
  if (want === 'int64') r = copyArr(map1(r, Math.floor, 'float64'), 'int64');
  else if (want) r = copyArr(r, want);
  if (toBool(I, A.retstep)) return new PyTuple([r, new NPScalar(step, 'float64')]);
  return r;
}

function fullLike(I: Interp, args: PyVal[], kw: Map<string, PyVal>, fname: string, fill: number | null): NDArray {
  const A = parseArgs(I, fname, args, kw, fill === null ? ['a', 'fill_value', 'dtype=', 'order=', 'subok=', 'shape='] : ['a', 'dtype=', 'order=', 'subok=', 'shape=']);
  const a = toArr(I, A.a!);
  const dt = dtypeArg(I, A.dtype) ?? a.dtype;
  const shape = A.shape !== undefined && A.shape !== null ? shapeArg(I, A.shape) : [...a.shape];
  const out = zerosArr(shape, dt);
  const v = fill === null ? toFloat(I, A.fill_value!) : fill;
  if (v !== 0) out.data.fill(castVal(v, dt));
  return out;
}

function percentileCore(I: Interp, a: NDArray, qv: PyVal, axisV: PyVal | undefined, keep: boolean, scale: number, fname: string): PyVal {
  const q = toArr(I, qv, 'float64');
  const qs = flat(q).map((x) => x / scale);
  for (const x of qs) if (!(x >= 0 && x <= 1)) I.raise('ValueError', scale === 100 ? 'Percentiles must be in the range [0, 100]' : 'Quantiles must be in the range [0, 1]');
  let arr = a;
  let ax: number;
  if (axisV === undefined || axisV === null) {
    arr = reshapeView(a, [a.size]);
    ax = 0;
  } else ax = normAxis(I, toInt(I, axisV), a.ndim);
  const moved = copyArr(transposeView(arr, [...arr.shape.map((_, i) => i).filter((i) => i !== ax), ax]));
  const n = arr.shape[ax];
  const rows = moved.size / Math.max(n, 1);
  const res = new Float64Array(qs.length * rows);
  const buf = new Float64Array(n);
  for (let r = 0; r < rows; r++) {
    for (let i = 0; i < n; i++) buf[i] = moved.data[r * n + i];
    buf.sort();
    const hasNan = n > 0 && buf[n - 1] !== buf[n - 1];
    qs.forEach((qq, qi) => {
      const vi = (n - 1) * qq;
      let prev = Math.floor(vi), next = prev + 1;
      if (vi >= n - 1) prev = next = n - 1;
      if (vi < 0) prev = next = 0;
      const g = vi - Math.floor(vi);
      const lo = buf[prev], hi = buf[next];
      const diff = hi - lo;
      let v = lo + diff * g;
      if (g >= 0.5) v = hi - diff * (1 - g);
      if (hasNan) v = NaN;
      res[qi * rows + r] = v;
    });
  }
  void fname;
  let rest = arr.shape.filter((_, i) => i !== ax);
  if (keep) rest = axisV === undefined || axisV === null ? a.shape.map(() => 1) : a.shape.map((s, i) => (i === ax ? 1 : s));
  return wrap(mk(res, [...q.shape, ...rest], 'float64'));
}

function einsum(I: Interp, spec: string, ops: NDArray[]): PyVal {
  spec = spec.replace(/\s+/g, '');
  if (spec.includes('.')) unsupported(I, "einsum with '...'");
  let [lhs, rhs] = spec.split('->');
  const ins = lhs.split(',');
  if (ins.length !== ops.length) I.raise('ValueError', 'more operands provided to einstein sum function than specified in the subscripts string');
  if (rhs === undefined) {
    const cnt: Record<string, number> = {};
    for (const c of ins.join('')) cnt[c] = (cnt[c] ?? 0) + 1;
    rhs = Object.keys(cnt).filter((c) => cnt[c] === 1).sort().join('');
  }
  const dims: Record<string, number> = {};
  ins.forEach((s, k) => {
    if (s.length !== ops[k].ndim) I.raise('ValueError', `einstein sum subscripts string contains too many subscripts for operand ${k}`);
    [...s].forEach((c, i) => {
      const n = ops[k].shape[i];
      if (dims[c] !== undefined && dims[c] !== n && n !== 1 && dims[c] !== 1)
        I.raise('ValueError', `operands could not be broadcast together with remapped shapes [original->remapped]: ${ops.map((o) => shapeStrTight(o.shape)).join(' ')}`);
      dims[c] = Math.max(dims[c] ?? 1, n);
    });
  });
  const outL = [...rhs], sumL = Object.keys(dims).filter((c) => !rhs.includes(c));
  const all = [...outL, ...sumL];
  const pos: Record<string, number> = {};
  all.forEach((c, i) => (pos[c] = i));
  const opStr = ops.map((o, k) => {
    const st = new Array(all.length).fill(0);
    [...ins[k]].forEach((c, i) => {
      if (o.shape[i] !== 1) st[pos[c]] += o.strides[i];
    });
    return st;
  });
  const outShape = outL.map((c) => dims[c]);
  const nOut = prod(outShape), nSum = prod(sumL.map((c) => dims[c]));
  const out = new Float64Array(nOut);
  const sizes = all.map((c) => dims[c]);
  const idx = new Array(all.length).fill(0);
  const dt = ops.reduce<DType>((d, o) => maxDt(d, o.dtype), 'bool');
  for (let o = 0; o < nOut; o++) {
    let acc = 0;
    for (let s = 0; s < nSum; s++) {
      let p = 1;
      for (let k = 0; k < ops.length; k++) {
        let off = ops[k].offset;
        for (let d = 0; d < all.length; d++) off += idx[d] * opStr[k][d];
        p *= ops[k].data[off];
      }
      acc += p;
      for (let d = all.length - 1; d >= outL.length; d--) {
        if (++idx[d] < sizes[d]) break;
        idx[d] = 0;
      }
    }
    out[o] = acc;
    for (let d = outL.length - 1; d >= 0; d--) {
      if (++idx[d] < sizes[d]) break;
      idx[d] = 0;
    }
  }
  if (dt === 'bool') for (let i = 0; i < out.length; i++) out[i] = out[i] ? 1 : 0;
  return wrap(mk(out, outShape, dt));
}

function flipView(I: Interp, a: NDArray, axes: number[] | null): NDArray {
  const ax = axes ?? a.shape.map((_, i) => i);
  let off = a.offset;
  const st = [...a.strides];
  for (const i of ax) {
    if (a.shape[i] > 0) off += (a.shape[i] - 1) * a.strides[i];
    st[i] = -a.strides[i];
  }
  return new NDArray(a.data, [...a.shape], st, off, a.dtype);
}

function repeatFn(I: Interp, a: NDArray, reps: PyVal, axisV: PyVal | undefined): NDArray {
  let arr = a;
  let ax: number;
  if (axisV === undefined || axisV === null) {
    arr = reshapeView(a, [a.size]);
    ax = 0;
  } else ax = normAxis(I, toInt(I, axisV), a.ndim);
  const n = arr.shape[ax];
  const r = toArr(I, reps, 'int64');
  const counts = r.size === 1 ? new Array(n).fill(r.data[r.offset]) : Array.from(flat(r));
  if (counts.length !== n) I.raise('ValueError', `operands could not be broadcast together with shape (${n},) (${counts.length},)`);
  const idx: number[] = [];
  counts.forEach((c, i) => {
    for (let k = 0; k < c; k++) idx.push(i);
  });
  const items: PyVal[] = arr.shape.map((_, d) => (d === ax ? mk(Float64Array.from(idx), [idx.length], 'int64') : new PySlice(null, null, null)));
  return npGetItem(I, arr, new PyTuple(items)) as NDArray;
}

function tileFn(I: Interp, a: NDArray, repsV: PyVal): NDArray {
  const reps = repsV instanceof PyTuple || repsV instanceof PyList ? repsV.items.map((x) => toInt(I, x)) : [toInt(I, repsV)];
  const d = Math.max(reps.length, a.ndim);
  let arr = reshapeView(a, [...new Array(d - a.ndim).fill(1), ...a.shape]);
  const r = [...new Array(d - reps.length).fill(1), ...reps];
  for (let ax = 0; ax < d; ax++) if (r[ax] !== 1) arr = concatenate(I, new Array(r[ax]).fill(arr), BigInt(ax));
  return arr === a ? copyArr(a) : arr;
}

function searchsorted(a: NDArray, v: NDArray, right: boolean): NDArray {
  const A = flat(a);
  return map1(v, (x) => {
    let lo = 0, hi = A.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      const y = A[mid];
      const less = right ? !(x < y || (y !== y && x === x)) : y < x || (x !== x && y === y);
      if (less) lo = mid + 1;
      else hi = mid;
    }
    return lo;
  }, 'int64');
}

function covFn(I: Interp, m: NDArray, y: PyVal | undefined, rowvar: boolean, ddof: number | null, bias: boolean): PyVal {
  let X = atleast(m.dtype === 'float64' ? m : copyArr(m, 'float64'), 2);
  if (!rowvar && X.shape[0] !== 1) X = transposeView(X, [1, 0]);
  if (y !== undefined && y !== null) {
    let Y = atleast(toArr(I, y, 'float64'), 2);
    if (!rowvar && Y.shape[0] !== 1) Y = transposeView(Y, [1, 0]);
    X = concatenate(I, [X, Y], 0n);
  }
  const dd = ddof ?? (bias ? 0 : 1);
  const n = X.shape[1];
  const avg = rMean(I, [X], new Map([['axis', 1n]])) as NDArray;
  const Xc = binUfunc(I, 'subtract', X, reshapeView(avg, [avg.size, 1]));
  const fact = n - dd;
  const c = matmul(I, Xc, transposeView(Xc, [1, 0]));
  for (let i = 0; i < c.data.length; i++) c.data[i] = c.data[i] / fact;
  return c.size === 1 && m.ndim === 1 && (y === undefined || y === null) ? new NPScalar(c.data[0], 'float64') : c;
}

const UNARY_NAMES = [
  ...Object.keys(UNARY_FLOAT), 'negative', 'positive', 'absolute', 'fabs', 'invert', 'bitwise_not', 'logical_not', 'sign', 'square', 'reciprocal', 'floor', 'ceil', 'trunc', 'fix', 'rint',
  'isnan', 'isinf', 'isfinite', 'signbit',
];
const BINARY_NAMES = [
  'add', 'subtract', 'multiply', 'divide', 'true_divide', 'floor_divide', 'remainder', 'mod', 'power', 'maximum', 'minimum', 'fmax', 'fmin', 'arctan2', 'hypot', 'logaddexp', 'logaddexp2',
  'equal', 'not_equal', 'less', 'less_equal', 'greater', 'greater_equal', 'logical_and', 'logical_or', 'logical_xor', 'bitwise_and', 'bitwise_or', 'bitwise_xor', 'left_shift', 'right_shift',
];

/** np.triu_indices(n, k=0, m=None) / np.tril_indices: row-major (row, col) index arrays */
function triIndices(I: Interp, a: PyVal[], kw: Map<string, PyVal>, upper: boolean): PyVal {
  const n = toInt(I, a[0] ?? kw.get('n')!);
  const kv = a[1] ?? kw.get('k');
  const k = kv === undefined || kv === null ? 0 : toInt(I, kv);
  const mv = a[2] ?? kw.get('m');
  const m = mv === undefined || mv === null ? n : toInt(I, mv);
  const rows: number[] = [], cols: number[] = [];
  for (let i = 0; i < n; i++)
    for (let j = 0; j < m; j++)
      if (upper ? j - i >= k : j - i <= k) {
        rows.push(i);
        cols.push(j);
      }
  return new PyTuple([mk(new Float64Array(rows), [rows.length], 'int64'), mk(new Float64Array(cols), [cols.length], 'int64')]);
}

const F: Record<string, NpFn> = {
  array: (I, a, kw) => {
    const A = parseArgs(I, 'array', a, kw, ['object', 'dtype=', 'copy=', 'order=', 'subok=', 'ndmin=', 'like=']);
    const dt = dtypeArg(I, A.dtype);
    let r = toArr(I, A.object!, dt);
    if (r === A.object && A.copy !== false) r = copyArr(r);
    const ndmin = A.ndmin === undefined ? 0 : toInt(I, A.ndmin);
    if (r.ndim < ndmin) r = reshapeView(r, [...new Array(ndmin - r.ndim).fill(1), ...r.shape]);
    return r;
  },
  asarray: (I, a, kw) => {
    const A = parseArgs(I, 'asarray', a, kw, ['a', 'dtype=', 'order=', 'copy=', 'like=']);
    return toArr(I, A.a!, dtypeArg(I, A.dtype));
  },
  asanyarray: (I, a, kw) => F.asarray(I, a, kw),
  ascontiguousarray: (I, a, kw) => copyArr(toArr(I, a[0], dtypeArg(I, kw.get('dtype')))),
  copy: (I, a) => copyArr(toArr(I, a[0])),
  zeros: (I, a, kw) => {
    const A = parseArgs(I, 'zeros', a, kw, ['shape', 'dtype=', 'order=', 'like=']);
    return zerosArr(shapeArg(I, A.shape!), dtypeArg(I, A.dtype) ?? 'float64');
  },
  ones: (I, a, kw) => {
    const A = parseArgs(I, 'ones', a, kw, ['shape', 'dtype=', 'order=', 'like=']);
    const r = zerosArr(shapeArg(I, A.shape!), dtypeArg(I, A.dtype) ?? 'float64');
    r.data.fill(1);
    return r;
  },
  empty: (I, a, kw) => F.zeros(I, a, kw),
  full: (I, a, kw) => {
    const A = parseArgs(I, 'full', a, kw, ['shape', 'fill_value', 'dtype=', 'order=', 'like=']);
    const fv = toArr(I, A.fill_value!);
    const dt = dtypeArg(I, A.dtype) ?? fv.dtype;
    const shape = shapeArg(I, A.shape!);
    if (fv.size === 1) {
      const r = zerosArr(shape, dt);
      r.data.fill(castVal(fv.data[fv.offset], dt));
      return r;
    }
    return copyArr(broadcastTo(I, fv, shape), dt);
  },
  zeros_like: (I, a, kw) => fullLike(I, a, kw, 'zeros_like', 0),
  ones_like: (I, a, kw) => fullLike(I, a, kw, 'ones_like', 1),
  empty_like: (I, a, kw) => fullLike(I, a, kw, 'empty_like', 0),
  full_like: (I, a, kw) => fullLike(I, a, kw, 'full_like', null),
  eye: (I, a, kw) => {
    const A = parseArgs(I, 'eye', a, kw, ['N', 'M=', 'k=', 'dtype=', 'order=', 'like=']);
    const n = toInt(I, A.N!), m = A.M === undefined || A.M === null ? n : toInt(I, A.M), k = A.k === undefined ? 0 : toInt(I, A.k);
    const r = zerosArr([n, m], dtypeArg(I, A.dtype) ?? 'float64');
    for (let i = 0; i < n; i++) if (i + k >= 0 && i + k < m) r.data[i * m + i + k] = 1;
    return r;
  },
  identity: (I, a, kw) => {
    const A = parseArgs(I, 'identity', a, kw, ['n', 'dtype=', 'like=']);
    return F.eye(I, [A.n!], new Map(A.dtype !== undefined ? [['dtype', A.dtype]] : []));
  },
  arange: arangeFn,
  linspace: linspaceFn,
  logspace: (I, a, kw) => {
    const base = kw.has('base') ? toFloat(I, kw.get('base')!) : 10;
    const k2 = new Map(kw);
    k2.delete('base');
    const ls = linspaceFn(I, a, k2) as NDArray;
    return map1(ls, (x) => powCR(base, x), 'float64');
  },
  reshape: (I, a, kw) => {
    const A = parseArgs(I, 'reshape', a, kw, ['a', 'shape=', 'order=', 'newshape=', 'copy=']);
    return reshape(I, toArr(I, A.a!), shapeFromArgs(I, [A.shape ?? A.newshape!]));
  },
  ravel: (I, a) => reshapeView(toArr(I, a[0]), [toArr(I, a[0]).size]),
  transpose: (I, a, kw) => {
    const A = parseArgs(I, 'transpose', a, kw, ['a', 'axes=']);
    const arr = toArr(I, A.a!);
    return transpose(I, arr, A.axes === undefined || A.axes === null ? null : shapeFromArgs(I, [A.axes]));
  },
  swapaxes: (I, a) => swapaxes(I, toArr(I, a[0]), toInt(I, a[1]), toInt(I, a[2])),
  moveaxis: (I, a) => {
    const arr = toArr(I, a[0]);
    const src = normAxis(I, toInt(I, a[1]), arr.ndim), dst = normAxis(I, toInt(I, a[2]), arr.ndim);
    const order = arr.shape.map((_, i) => i).filter((i) => i !== src);
    order.splice(dst, 0, src);
    return transposeView(arr, order);
  },
  squeeze: (I, a, kw) => squeeze(I, toArr(I, a[0]), a[1] ?? kw.get('axis')),
  expand_dims: (I, a, kw) => expandDims(I, toArr(I, a[0]), a[1] ?? kw.get('axis')!),
  atleast_1d: (I, a) => atleast(toArr(I, a[0]), 1),
  atleast_2d: (I, a) => atleast(toArr(I, a[0]), 2),
  atleast_3d: (I, a) => atleast(toArr(I, a[0]), 3),
  concatenate: (I, a, kw) => {
    const A = parseArgs(I, 'concatenate', a, kw, ['arrays', 'axis=', 'out=', 'dtype=', 'casting=']);
    return concatenate(I, seqArrays(I, A.arrays!), A.axis === undefined ? 0n : A.axis);
  },
  stack: (I, a, kw) => {
    const A = parseArgs(I, 'stack', a, kw, ['arrays', 'axis=', 'out=', 'dtype=', 'casting=']);
    return stack(I, seqArrays(I, A.arrays!), A.axis);
  },
  vstack: (I, a) => concatenate(I, seqArrays(I, a[0]).map((x) => atleast(x, 2)), 0n),
  row_stack: (I, a) => F.vstack(I, a, new Map()),
  hstack: (I, a) => {
    const arrs = seqArrays(I, a[0]).map((x) => atleast(x, 1));
    return concatenate(I, arrs, arrs.length && arrs[0].ndim === 1 ? 0n : 1n);
  },
  column_stack: (I, a) => concatenate(I, seqArrays(I, a[0]).map((x) => (x.ndim < 2 ? reshapeView(atleast(x, 1), [x.size, 1]) : x)), 1n),
  dstack: (I, a) => concatenate(I, seqArrays(I, a[0]).map((x) => atleast(x, 3)), 2n),
  split: (I, a, kw) => splitFn(I, a, kw, false),
  array_split: (I, a, kw) => splitFn(I, a, kw, true),
  where: (I, a) => {
    if (a.length === 1) return F.nonzero(I, a, new Map());
    if (a.length !== 3) I.raise('ValueError', 'either both or neither of x and y should be given');
    return wrap(whereFn(I, toArr(I, a[0]), toArr(I, a[1]), toArr(I, a[2])));
  },
  nonzero: (I, a) => new PyTuple(nonzeroIdx(toArr(I, a[0]))),
  argwhere: (I, a) => {
    const arr = toArr(I, a[0]);
    const nz = nonzeroIdx(arr);
    const n = nz[0].size, d = arr.ndim;
    const out = zerosArr([n, d], 'int64');
    for (let i = 0; i < n; i++) for (let j = 0; j < d; j++) out.data[i * d + j] = nz[j].data[i];
    return out;
  },
  flatnonzero: (I, a) => nonzeroIdx(reshapeView(toArr(I, a[0]), [toArr(I, a[0]).size]))[0],
  count_nonzero: (I, a, kw) => {
    const A = parseArgs(I, 'count_nonzero', a, kw, ['a', 'axis=', 'keepdims=']);
    const arr = toArr(I, A.a!);
    if (A.axis === undefined || A.axis === null) return BigInt(flat(arr).reduce((s, x) => s + (x !== 0 ? 1 : 0), 0));
    return rSum(I, [map1(arr, (x) => (x !== 0 ? 1 : 0), 'int64')], new Map([['axis', A.axis], ['keepdims', A.keepdims ?? false]]));
  },
  clip: (I, a, kw) => {
    const A = parseArgs(I, 'clip', a, kw, ['a', 'a_min=', 'a_max=', 'out=', 'min=', 'max=']);
    return wrap(clipArr(I, toArr(I, A.a!), A.a_min ?? A.min, A.a_max ?? A.max));
  },
  round: (I, a, kw) => {
    const A = parseArgs(I, 'round', a, kw, ['a', 'decimals=', 'out=']);
    return wrap(roundArr(toArr(I, A.a!), A.decimals === undefined ? 0 : toInt(I, A.decimals)));
  },
  around: (I, a, kw) => F.round(I, a, kw),
  sum: (I, a, kw) => rSum(I, a, kw),
  prod: (I, a, kw) => rProd(I, a, kw),
  mean: (I, a, kw) => rMean(I, a, kw),
  std: (I, a, kw) => rVar(I, a, kw, true),
  var: (I, a, kw) => rVar(I, a, kw, false),
  max: (I, a, kw) => rMinMax(I, a, kw, true, 'max'),
  min: (I, a, kw) => rMinMax(I, a, kw, false, 'min'),
  amax: (I, a, kw) => rMinMax(I, a, kw, true, 'amax'),
  amin: (I, a, kw) => rMinMax(I, a, kw, false, 'amin'),
  ptp: (I, a, kw) => F.subtract(I, [F.max(I, a, kw), F.min(I, a, kw)], new Map()),
  argmax: (I, a, kw) => rArg(I, a, kw, true),
  argmin: (I, a, kw) => rArg(I, a, kw, false),
  all: (I, a, kw) => rAllAny(I, a, kw, true),
  any: (I, a, kw) => rAllAny(I, a, kw, false),
  cumsum: (I, a, kw) => cumulative(I, a, kw, false),
  cumprod: (I, a, kw) => cumulative(I, a, kw, true),
  diff: (I, a, kw) => {
    const A = parseArgs(I, 'diff', a, kw, ['a', 'n=', 'axis=']);
    let arr = toArr(I, A.a!);
    const n = A.n === undefined ? 1 : toInt(I, A.n);
    const ax = A.axis === undefined ? arr.ndim - 1 : normAxis(I, toInt(I, A.axis), arr.ndim);
    for (let k = 0; k < n; k++) {
      const hi: PyVal[] = arr.shape.map((_, d) => (d === ax ? new PySlice(1n, null, null) : new PySlice(null, null, null)));
      const lo: PyVal[] = arr.shape.map((_, d) => (d === ax ? new PySlice(null, -1n, null) : new PySlice(null, null, null)));
      const x = npGetItem(I, arr, new PyTuple(hi)) as NDArray, y = npGetItem(I, arr, new PyTuple(lo)) as NDArray;
      arr = binUfunc(I, arr.dtype === 'bool' ? 'not_equal' : 'subtract', x, y);
    }
    return arr;
  },
  median: (I, a, kw) => {
    const A = parseArgs(I, 'median', a, kw, ['a', 'axis=', 'out=', 'overwrite_input=', 'keepdims=']);
    return percentileCore(I, toArr(I, A.a!), 0.5, A.axis, toBool(I, A.keepdims), 1, 'median');
  },
  percentile: (I, a, kw) => {
    const A = parseArgs(I, 'percentile', a, kw, ['a', 'q', 'axis=', 'out=', 'overwrite_input=', 'method=', 'keepdims=']);
    if (A.method !== undefined && A.method !== 'linear') unsupported(I, `percentile(method=${A.method})`);
    return percentileCore(I, toArr(I, A.a!), A.q!, A.axis, toBool(I, A.keepdims), 100, 'percentile');
  },
  quantile: (I, a, kw) => {
    const A = parseArgs(I, 'quantile', a, kw, ['a', 'q', 'axis=', 'out=', 'overwrite_input=', 'method=', 'keepdims=']);
    if (A.method !== undefined && A.method !== 'linear') unsupported(I, `quantile(method=${A.method})`);
    return percentileCore(I, toArr(I, A.a!), A.q!, A.axis, toBool(I, A.keepdims), 1, 'quantile');
  },
  average: (I, a, kw) => {
    const A = parseArgs(I, 'average', a, kw, ['a', 'axis=', 'weights=', 'returned=', 'keepdims=']);
    const arr = toArr(I, A.a!);
    if (A.weights === undefined || A.weights === null) return rMean(I, [arr], new Map(A.axis !== undefined ? [['axis', A.axis]] : []));
    let w = toArr(I, A.weights, 'float64');
    if (w.ndim === 1 && arr.ndim > 1 && A.axis !== undefined && A.axis !== null) {
      const ax = normAxis(I, toInt(I, A.axis), arr.ndim);
      w = reshapeView(w, arr.shape.map((s, i) => (i === ax ? s : 1)));
    }
    const kwA = new Map<string, PyVal>(A.axis !== undefined ? [['axis', A.axis]] : []);
    const num = rSum(I, [binUfunc(I, 'multiply', arr, w)], kwA);
    const den = rSum(I, [broadcastTo(I, w, arr.shape)], kwA);
    return wrap(binUfunc(I, 'true_divide', toArr(I, num), toArr(I, den)));
  },
  cov: (I, a, kw) => {
    const A = parseArgs(I, 'cov', a, kw, ['m', 'y=', 'rowvar=', 'bias=', 'ddof=']);
    return covFn(I, toArr(I, A.m!), A.y, toBool(I, A.rowvar, true), A.ddof === undefined || A.ddof === null ? null : toInt(I, A.ddof), toBool(I, A.bias));
  },
  corrcoef: (I, a, kw) => {
    const A = parseArgs(I, 'corrcoef', a, kw, ['x', 'y=', 'rowvar=']);
    const c = toArr(I, covFn(I, toArr(I, A.x!), A.y, toBool(I, A.rowvar, true), null, false));
    if (c.ndim === 0) return new NPScalar(1, 'float64');
    const n = c.shape[0];
    const d = new Float64Array(n);
    for (let i = 0; i < n; i++) d[i] = Math.sqrt(c.data[i * n + i]);
    const out = copyArr(c);
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) out.data[i * n + j] = Math.min(1, Math.max(-1, c.data[i * n + j] / d[i] / d[j]));
    return out;
  },
  sort: (I, a, kw) => {
    const A = parseArgs(I, 'sort', a, kw, ['a', 'axis=', 'kind=', 'order=', 'stable=']);
    let arr = toArr(I, A.a!);
    if (A.axis === null) arr = reshapeView(arr, [arr.size]);
    if (arr.ndim === 0) I.raise('ValueError', 'Cannot sort a 0-d array');
    return sortedCopy(arr, A.axis === undefined || A.axis === null ? arr.ndim - 1 : normAxis(I, toInt(I, A.axis), arr.ndim));
  },
  argsort: (I, a, kw) => {
    const A = parseArgs(I, 'argsort', a, kw, ['a', 'axis=', 'kind=', 'order=', 'stable=']);
    let arr = toArr(I, A.a!);
    if (A.axis === null) arr = reshapeView(arr, [arr.size]);
    return argsortArr(arr, A.axis === undefined || A.axis === null ? arr.ndim - 1 : normAxis(I, toInt(I, A.axis), arr.ndim));
  },
  unique: (I, a, kw) => {
    const A = parseArgs(I, 'unique', a, kw, ['ar', 'return_index=', 'return_inverse=', 'return_counts=', 'axis=', 'equal_nan=']);
    if (A.axis !== undefined && A.axis !== null) unsupported(I, 'unique(axis=...)');
    return uniqueFn(I, toArr(I, A.ar!), A);
  },
  searchsorted: (I, a, kw) => {
    const A = parseArgs(I, 'searchsorted', a, kw, ['a', 'v', 'side=', 'sorter=']);
    return wrap(searchsorted(toArr(I, A.a!), toArr(I, A.v!), A.side === 'right'));
  },
  allclose: (I, a, kw) => {
    const A = parseArgs(I, 'allclose', a, kw, ['a', 'b', 'rtol=', 'atol=', 'equal_nan=']);
    const r = isclose(I, toArr(I, A.a!), toArr(I, A.b!), A.rtol === undefined ? 1e-5 : toFloat(I, A.rtol), A.atol === undefined ? 1e-8 : toFloat(I, A.atol), toBool(I, A.equal_nan));
    return flat(r).every((x) => x !== 0);
  },
  isclose: (I, a, kw) => {
    const A = parseArgs(I, 'isclose', a, kw, ['a', 'b', 'rtol=', 'atol=', 'equal_nan=']);
    return wrap(isclose(I, toArr(I, A.a!), toArr(I, A.b!), A.rtol === undefined ? 1e-5 : toFloat(I, A.rtol), A.atol === undefined ? 1e-8 : toFloat(I, A.atol), toBool(I, A.equal_nan)));
  },
  array_equal: (I, a, kw) => {
    const A = parseArgs(I, 'array_equal', a, kw, ['a1', 'a2', 'equal_nan=']);
    const x = toArr(I, A.a1!), y = toArr(I, A.a2!);
    if (x.ndim !== y.ndim || x.shape.some((s, i) => s !== y.shape[i])) return false;
    const en = toBool(I, A.equal_nan);
    const fx = flat(x), fy = flat(y);
    for (let i = 0; i < fx.length; i++) if (!(fx[i] === fy[i] || (en && fx[i] !== fx[i] && fy[i] !== fy[i]))) return false;
    return true;
  },
  array_equiv: (I, a) => {
    const x = toArr(I, a[0]), y = toArr(I, a[1]);
    try {
      broadcastShapes(I, [x.shape, y.shape]);
    } catch {
      return false;
    }
    return flat(binUfunc(I, 'equal', x, y)).every((v) => v !== 0);
  },
  triu: (I, a, kw) => triMask(I, toArr(I, a[0]), a[1] !== undefined || kw.has('k') ? toInt(I, a[1] ?? kw.get('k')!) : 0, true),
  triu_indices: (I, a, kw) => triIndices(I, a, kw, true),
  tril_indices: (I, a, kw) => triIndices(I, a, kw, false),
  tril: (I, a, kw) => triMask(I, toArr(I, a[0]), a[1] !== undefined || kw.has('k') ? toInt(I, a[1] ?? kw.get('k')!) : 0, false),
  diag: (I, a, kw) => diagFn(I, toArr(I, a[0]), a[1] !== undefined || kw.has('k') ? toInt(I, a[1] ?? kw.get('k')!) : 0),
  diagonal: (I, a, kw) => {
    const A = parseArgs(I, 'diagonal', a, kw, ['a', 'offset=', 'axis1=', 'axis2=']);
    const arr = toArr(I, A.a!);
    return diagonalView(arr, A.offset === undefined ? 0 : toInt(I, A.offset), A.axis1 === undefined ? 0 : normAxis(I, toInt(I, A.axis1), arr.ndim), A.axis2 === undefined ? 1 : normAxis(I, toInt(I, A.axis2), arr.ndim));
  },
  trace: (I, a, kw) => {
    const A = parseArgs(I, 'trace', a, kw, ['a', 'offset=', 'axis1=', 'axis2=', 'dtype=', 'out=']);
    const d = F.diagonal(I, [A.a!, A.offset ?? 0n, A.axis1 ?? 0n, A.axis2 ?? 1n], new Map()) as NDArray;
    return rSum(I, [d], new Map([['axis', -1n]]));
  },
  outer: (I, a) => {
    const x = toArr(I, a[0]), y = toArr(I, a[1]);
    return binUfunc(I, 'multiply', reshapeView(x, [x.size, 1]), reshapeView(y, [1, y.size]));
  },
  inner: (I, a) => {
    const x = toArr(I, a[0]), y = toArr(I, a[1]);
    if (x.ndim === 0 || y.ndim === 0) return wrap(binUfunc(I, 'multiply', x, y));
    const k = x.shape[x.ndim - 1];
    if (y.shape[y.ndim - 1] !== k) I.raise('ValueError', `shapes ${shapeStrTight(x.shape)} and ${shapeStrTight(y.shape)} not aligned: ${k} (dim ${x.ndim - 1}) != ${y.shape[y.ndim - 1]} (dim ${y.ndim - 1})`);
    const r = matmul(I, reshapeView(x, [x.size / k, k]), transposeView(reshapeView(y, [y.size / k, k]), [1, 0]));
    return wrap(mk(r.data, [...x.shape.slice(0, -1), ...y.shape.slice(0, -1)], r.dtype));
  },
  dot: (I, a) => wrap(dot(I, toArr(I, a[0]), toArr(I, a[1]))),
  vdot: (I, a) => {
    const x = toArr(I, a[0]), y = toArr(I, a[1]);
    return wrap(dot(I, reshapeView(x, [x.size]), reshapeView(y, [y.size])));
  },
  matmul: (I, a) => wrap(matmul(I, toArr(I, a[0]), toArr(I, a[1]))),
  tensordot: (I, a, kw) => {
    const x = toArr(I, a[0]), y = toArr(I, a[1]);
    const axes = a[2] ?? kw.get('axes') ?? 2n;
    if (typeof axes !== 'bigint') unsupported(I, 'tensordot with explicit axis lists');
    const n = Number(axes);
    const k = prod(x.shape.slice(x.ndim - n));
    const r = matmul(I, reshapeView(x, [x.size / Math.max(k, 1), k]), reshapeView(y, [k, y.size / Math.max(k, 1)]));
    return wrap(mk(r.data, [...x.shape.slice(0, x.ndim - n), ...y.shape.slice(n)], r.dtype));
  },
  einsum: (I, a) => {
    if (typeof a[0] !== 'string') unsupported(I, 'einsum in interleaved (sublist) format');
    return einsum(I, a[0] as string, a.slice(1).map((x) => toArr(I, x)));
  },
  flip: (I, a, kw) => {
    const arr = toArr(I, a[0]);
    return flipView(I, arr, axesArg(I, a[1] ?? kw.get('axis'), arr.ndim));
  },
  fliplr: (I, a) => flipView(I, toArr(I, a[0]), [1]),
  flipud: (I, a) => flipView(I, toArr(I, a[0]), [0]),
  roll: (I, a, kw) => {
    const A = parseArgs(I, 'roll', a, kw, ['a', 'shift', 'axis=']);
    let arr = toArr(I, A.a!);
    const orig = arr.shape;
    let ax = 0;
    if (A.axis === undefined || A.axis === null) arr = reshapeView(arr, [arr.size]);
    else ax = normAxis(I, toInt(I, A.axis), arr.ndim);
    const n = arr.shape[ax];
    const sh = ((toInt(I, A.shift!) % n) + n) % n;
    const idx = Float64Array.from({ length: n }, (_, i) => (i - sh + n) % n);
    const items: PyVal[] = arr.shape.map((_, d) => (d === ax ? mk(idx, [n], 'int64') : new PySlice(null, null, null)));
    const r = npGetItem(I, arr, new PyTuple(items)) as NDArray;
    return A.axis === undefined || A.axis === null ? reshapeView(r, [...orig]) : r;
  },
  repeat: (I, a, kw) => {
    const A = parseArgs(I, 'repeat', a, kw, ['a', 'repeats', 'axis=']);
    return repeatFn(I, toArr(I, A.a!), A.repeats!, A.axis);
  },
  tile: (I, a) => tileFn(I, toArr(I, a[0]), a[1]),
  append: (I, a, kw) => {
    const A = parseArgs(I, 'append', a, kw, ['arr', 'values', 'axis=']);
    const x = toArr(I, A.arr!), y = toArr(I, A.values!);
    if (A.axis === undefined || A.axis === null) return concatenate(I, [reshapeView(x, [x.size]), reshapeView(y, [y.size])], 0n);
    return concatenate(I, [x, y], A.axis);
  },
  take: (I, a, kw) => {
    const A = parseArgs(I, 'take', a, kw, ['a', 'indices', 'axis=', 'out=', 'mode=']);
    let arr = toArr(I, A.a!);
    if (A.axis === undefined || A.axis === null) return npGetItem(I, reshapeView(arr, [arr.size]), A.indices!);
    const ax = normAxis(I, toInt(I, A.axis), arr.ndim);
    arr = toArr(I, arr);
    const items: PyVal[] = arr.shape.map((_, d) => (d === ax ? A.indices! : new PySlice(null, null, null)));
    return npGetItem(I, arr, new PyTuple(items));
  },
  meshgrid: (I, a, kw) => {
    const xs = a.map((x) => toArr(I, x));
    const ij = kw.get('indexing') === 'ij';
    const sizes = xs.map((x) => x.size);
    const shape = [...sizes];
    if (!ij && shape.length >= 2) [shape[0], shape[1]] = [shape[1], shape[0]];
    return new PyTuple(xs.map((x, i) => {
      const s = new Array(shape.length).fill(1);
      let pos = i;
      if (!ij && xs.length >= 2 && i < 2) pos = 1 - i;
      s[pos] = x.size;
      return copyArr(broadcastTo(I, reshapeView(x, s), shape));
    }));
  },
  bincount: (I, a, kw) => {
    const A = parseArgs(I, 'bincount', a, kw, ['x', 'weights=', 'minlength=']);
    const x = flat(toArr(I, A.x!));
    if (x.some((v) => v < 0)) I.raise('ValueError', "'list' argument must have no negative elements");
    const n = Math.max(x.length ? Math.max(...x) + 1 : 0, A.minlength === undefined ? 0 : toInt(I, A.minlength));
    const w = A.weights !== undefined && A.weights !== null ? flat(toArr(I, A.weights, 'float64')) : null;
    const out = new Float64Array(n);
    for (let i = 0; i < x.length; i++) out[x[i]] += w ? w[i] : 1;
    return mk(out, [n], w ? 'float64' : 'int64');
  },
  ndim: (I, a) => BigInt(toArr(I, a[0]).ndim),
  shape: (I, a) => new PyTuple(toArr(I, a[0]).shape.map((s) => BigInt(s))),
  size: (I, a) => BigInt(toArr(I, a[0]).size),
  isscalar: (I, a) => a[0] instanceof NPScalar || typeof a[0] === 'number' || typeof a[0] === 'bigint' || typeof a[0] === 'boolean' || typeof a[0] === 'string',
  nan_to_num: (I, a, kw) => {
    const A = parseArgs(I, 'nan_to_num', a, kw, ['x', 'copy=', 'nan=', 'posinf=', 'neginf=']);
    const nan = A.nan === undefined ? 0 : toFloat(I, A.nan);
    const pinf = A.posinf === undefined || A.posinf === null ? Number.MAX_VALUE : toFloat(I, A.posinf);
    const ninf = A.neginf === undefined || A.neginf === null ? -Number.MAX_VALUE : toFloat(I, A.neginf);
    return wrap(map1(toArr(I, A.x!), (x) => (x !== x ? nan : x === Infinity ? pinf : x === -Infinity ? ninf : x), toArr(I, A.x!).dtype));
  },
  real: (I, a) => npGetAttr(I, toArr(I, a[0]), 'real'),
  imag: (I, a) => npGetAttr(I, toArr(I, a[0]), 'imag'),
  iscomplexobj: (I, a) => toArr(I, a[0]).dtype === 'complex128',
  isrealobj: (I, a) => toArr(I, a[0]).dtype !== 'complex128',
  interp: (I, a, kw) => {
    const A = parseArgs(I, 'interp', a, kw, ['x', 'xp', 'fp', 'left=', 'right=', 'period=']);
    const xp = flat(toArr(I, A.xp!, 'float64')), fp = flat(toArr(I, A.fp!, 'float64'));
    const left = A.left === undefined || A.left === null ? fp[0] : toFloat(I, A.left);
    const right = A.right === undefined || A.right === null ? fp[fp.length - 1] : toFloat(I, A.right);
    return wrap(map1(toArr(I, A.x!), (x) => {
      if (x < xp[0]) return left;
      if (x > xp[xp.length - 1]) return right;
      if (x === xp[xp.length - 1]) return fp[fp.length - 1];
      let j = 0;
      while (j < xp.length - 2 && xp[j + 1] <= x) j++;
      const slope = (fp[j + 1] - fp[j]) / (xp[j + 1] - xp[j]);
      return slope * (x - xp[j]) + fp[j];
    }, 'float64'));
  },
};

function splitFn(I: Interp, a: PyVal[], kw: Map<string, PyVal>, loose: boolean): PyVal {
  const A = parseArgs(I, loose ? 'array_split' : 'split', a, kw, ['ary', 'indices_or_sections', 'axis=']);
  const arr = toArr(I, A.ary!);
  const ax = A.axis === undefined ? 0 : normAxis(I, toInt(I, A.axis), arr.ndim);
  const n = arr.shape[ax];
  let bounds: number[];
  const ios = A.indices_or_sections!;
  if (ios instanceof PyList || ios instanceof PyTuple || ios instanceof NDArray) {
    const idx = Array.from(flat(toArr(I, ios)));
    bounds = [0, ...idx, n];
  } else {
    const k = toInt(I, ios);
    if (!loose && n % k !== 0) I.raise('ValueError', 'array split does not result in an equal division');
    const each = Math.floor(n / k), extra = n % k;
    bounds = [0];
    for (let i = 0; i < k; i++) bounds.push(bounds[i] + each + (i < extra ? 1 : 0));
  }
  const parts: PyVal[] = [];
  for (let i = 0; i + 1 < bounds.length; i++) {
    const items: PyVal[] = arr.shape.map((_, d) => (d === ax ? new PySlice(BigInt(Math.min(bounds[i], n)), BigInt(Math.min(Math.max(bounds[i + 1], bounds[i]), n)), null) : new PySlice(null, null, null)));
    parts.push(npGetItem(I, arr, new PyTuple(items)));
  }
  return new PyList(parts);
}

for (const n of UNARY_NAMES) F[n] = (I, a) => wrap(unaryUfunc(I, n, toArr(I, a[0])));
F.abs = F.absolute;
for (const n of BINARY_NAMES) F[n] = (I, a) => {
  if (a.length < 2) I.raise('TypeError', `${n}() takes from 2 to 3 positional arguments but ${a.length} were given`);
  return wrap(binUfunc(I, n, toArr(I, a[0]), toArr(I, a[1])));
};

// =====================================================================
//  correctly rounded fused multiply-add (OpenBLAS kernels accumulate
//  with FMA, so small products match NumPy bit-for-bit)
// =====================================================================

const fdv = new DataView(new ArrayBuffer(8));
const SPLIT = 134217729; // 2^27 + 1
/** round-to-odd of x + y */
function addRO(x: number, y: number): number {
  const z = x + y;
  const bb = z - x;
  const err = x - (z - bb) + (y - bb);
  if (err === 0 || !isFinite(z)) return z;
  fdv.setFloat64(0, z);
  const lo = fdv.getUint32(4);
  if (lo & 1) return z;
  // move one ulp toward the exact value
  const up = err > 0 === z > 0; // magnitude grows
  let hi = fdv.getUint32(0);
  let l2 = lo;
  if (up) {
    l2 = (l2 + 1) >>> 0;
    if (l2 === 0) hi = (hi + 1) >>> 0;
  } else {
    if (l2 === 0) hi = (hi - 1) >>> 0;
    l2 = (l2 - 1) >>> 0;
  }
  fdv.setUint32(0, hi);
  fdv.setUint32(4, l2);
  return fdv.getFloat64(0);
}
export function fma(a: number, b: number, c: number): number {
  const p = a * b;
  if (!isFinite(p) || !isFinite(c) || p === 0 || Math.abs(a) > 1e290 || Math.abs(b) > 1e290 || Math.abs(p) < 1e-290) return p + c;
  // exact product a*b = p + e (Veltkamp / Dekker)
  let t = SPLIT * a;
  const ah = t - (t - a), al = a - ah;
  t = SPLIT * b;
  const bh = t - (t - b), bl = b - bh;
  const e = ah * bh - p + ah * bl + al * bh + al * bl;
  // c + p = th + tl exactly
  const th = c + p;
  const bv = th - c;
  const tl = c - (th - bv) + (p - bv);
  return th + addRO(tl, e);
}

// =====================================================================
//  correctly rounded elementary functions (double-double arithmetic).
//  glibc's libm (used by NumPy scalars / random / linalg) is correctly
//  rounded in practice; V8's Math.* is not, so we compute these exactly.
// =====================================================================

type DD = [number, number];
function twoSum(a: number, b: number): DD {
  const s = a + b;
  const v = s - a;
  return [s, a - (s - v) + (b - v)];
}
function quickTwoSum(a: number, b: number): DD {
  const s = a + b;
  return [s, b - (s - a)];
}
function twoProd(a: number, b: number): DD {
  const p = a * b;
  let t = SPLIT * a;
  const ah = t - (t - a), al = a - ah;
  t = SPLIT * b;
  const bh = t - (t - b), bl = b - bh;
  return [p, ah * bh - p + ah * bl + al * bh + al * bl];
}
function ddAdd(a: DD, b: DD): DD {
  let [s, e] = twoSum(a[0], b[0]);
  const [t, f] = twoSum(a[1], b[1]);
  e += t;
  [s, e] = quickTwoSum(s, e);
  e += f;
  return quickTwoSum(s, e);
}
function ddMul(a: DD, b: DD): DD {
  const [p, e] = twoProd(a[0], b[0]);
  return quickTwoSum(p, e + (a[0] * b[1] + a[1] * b[0]));
}
function ddMulD(a: DD, b: number): DD {
  const [p, e] = twoProd(a[0], b);
  return quickTwoSum(p, e + a[1] * b);
}
function ddDiv(a: DD, b: DD): DD {
  const q1 = a[0] / b[0];
  let r = ddAdd(a, ddMulD(b, -q1));
  const q2 = r[0] / b[0];
  r = ddAdd(r, ddMulD(b, -q2));
  const q3 = r[0] / b[0];
  return ddAdd(quickTwoSum(q1, q2), [q3, 0]);
}
const ddNeg = (a: DD): DD => [-a[0], -a[1]];
const LN2: DD = [0.6931471805599453, 2.3190468138462996e-17];
const LN10: DD = [2.302585092994046, -2.1707562233822494e-16];
const PIO2: DD = [1.5707963267948966, 6.123233995736766e-17];
const PIO2_3 = -1.4973849048591698e-33;
const LOG_C: DD[] = Array.from({ length: 26 }, (_, k) => ddDiv([1, 0], [2 * k + 1, 0]));
const INV_FACT: DD[] = (() => {
  const f: DD[] = [[1, 0]];
  for (let n = 1; n < 30; n++) f.push(ddDiv(f[n - 1], [n, 0]));
  return f;
})();

/** ln(x) as double-double, x > 0 finite */
function ddLog(x: number): DD {
  let e = 0;
  if (x < 2.2250738585072014e-308) {
    x *= 18014398509481984; // 2^54
    e -= 54;
  }
  fdv.setFloat64(0, x);
  const hi = fdv.getUint32(0);
  e += ((hi >>> 20) & 0x7ff) - 1023;
  fdv.setUint32(0, (hi & 0x800fffff) | 0x3ff00000);
  let m = fdv.getFloat64(0);
  if (m > Math.SQRT2) {
    m /= 2;
    e += 1;
  }
  let r: DD;
  if (m === 1) r = [0, 0];
  else {
    const s = ddDiv([m - 1, 0], twoSum(m, 1));
    const s2 = ddMul(s, s);
    let p = LOG_C[LOG_C.length - 1];
    for (let k = LOG_C.length - 2; k >= 0; k--) p = ddAdd(ddMul(p, s2), LOG_C[k]);
    r = ddMul([2 * s[0], 2 * s[1]], p);
  }
  return e ? ddAdd(ddMulD(LN2, e), r) : r;
}
/** expm1 of a small double-double t (|t| < ~0.36) */
function ddExpm1Small(t: DD): DD {
  const u: DD = [t[0] / 256, t[1] / 256];
  let q = INV_FACT[12];
  for (let n = 11; n >= 1; n--) q = ddAdd(ddMul(q, u), INV_FACT[n]);
  let em1 = ddMul(q, u);
  for (let i = 0; i < 8; i++) em1 = ddMul(em1, ddAdd(em1, [2, 0]));
  return em1;
}
/** exp(x) = 2^k * (1 + em1) for double-double x */
function ddExpParts(x: DD): { k: number; em1: DD } {
  const k = Math.round(x[0] / LN2[0]);
  const r = k ? ddAdd(x, ddMulD(LN2, -k)) : x;
  return { k, em1: ddExpm1Small(r) };
}
function scale2(v: number, k: number): number {
  if (k > 1000) return v * Math.pow(2, 1000) * Math.pow(2, k - 1000);
  if (k < -1000) return v * Math.pow(2, -1000) * Math.pow(2, k + 1000);
  return v * Math.pow(2, k);
}
function ddExpRound(x: DD): number {
  if (x[0] > 709.782712893384) return Infinity;
  if (x[0] < -745.1332191019412) return 0;
  const { k, em1 } = ddExpParts(x);
  const v = ddAdd([1, 0], em1);
  return scale2(v[0] + v[1], k);
}

export function logCR(x: number): number {
  if (x !== x || x < 0) return NaN;
  if (x === 0) return -Infinity;
  if (x === Infinity) return x;
  const r = ddLog(x);
  return r[0] + r[1];
}
export function log2CR(x: number): number {
  if (x !== x || x < 0) return NaN;
  if (x === 0) return -Infinity;
  if (x === Infinity) return x;
  const r = ddDiv(ddLog(x), LN2);
  return r[0] + r[1];
}
export function log10CR(x: number): number {
  if (x !== x || x < 0) return NaN;
  if (x === 0) return -Infinity;
  if (x === Infinity) return x;
  const r = ddDiv(ddLog(x), LN10);
  return r[0] + r[1];
}
export function log1pCR(x: number): number {
  if (x !== x || x < -1) return NaN;
  if (x === -1) return -Infinity;
  if (x === Infinity) return x;
  if (Math.abs(x) < 5.551115123125783e-17) return x;
  const [h, l] = twoSum(1, x);
  const r = ddAdd(ddLog(h), [l / h, 0]);
  return r[0] + r[1];
}
export function expCR(x: number): number {
  if (x !== x) return x;
  if (Math.abs(x) < 5.551115123125783e-17) return 1 + x;
  return ddExpRound([x, 0]);
}
function ddExpm1(x: number): DD {
  if (Math.abs(x) < 0.35) return ddExpm1Small([x, 0]);
  const { k, em1 } = ddExpParts([x, 0]);
  const p = Math.pow(2, k);
  const v = ddAdd([1, 0], em1);
  return ddAdd([v[0] * p, v[1] * p], [-1, 0]);
}
export function expm1CR(x: number): number {
  if (x !== x) return x;
  if (x > 709.782712893384) return Infinity;
  if (x < -40) return -1;
  if (Math.abs(x) < 5.551115123125783e-17) return x;
  const r = ddExpm1(x);
  return r[0] + r[1];
}
export function powCR(b: number, e: number): number {
  if (e === 0 || b === 1) return 1;
  if (b !== b || e !== e) return NaN;
  if (!isFinite(b) || !isFinite(e) || b === 0) return Math.pow(b, e);
  let neg = false;
  if (b < 0) {
    if (!Number.isInteger(e)) return NaN;
    neg = Math.abs(e) % 2 === 1;
    b = -b;
  }
  if (e === 2) return neg ? -(b * b) : b * b;
  if (e === 1) return neg ? -b : b;
  if (e === 0.5) return Math.sqrt(b);
  const y = ddMulD(ddLog(b), e);
  const r = y[0] > 709.79 ? Infinity : y[0] < -745.2 ? 0 : ddExpRound(y);
  return neg ? -r : r;
}
function sinCosDD(x: number): { s: DD; c: DD; q: number } {
  const k = Math.round(x / PIO2[0]);
  let r: DD = [x, 0];
  if (k) {
    r = ddAdd(r, ddNeg(twoProd(k, PIO2[0])));
    r = ddAdd(r, ddNeg(twoProd(k, PIO2[1])));
    r = ddAdd(r, [-k * PIO2_3, 0]);
  }
  const r2 = ddMul(r, r);
  let sp = INV_FACT[27];
  for (let n = 25; n >= 1; n -= 2) sp = ddAdd(ddMul(sp, ddNeg(r2)), INV_FACT[n]);
  // sp = 1 - r2/3! + ... ; sin = r * sp
  let cp = INV_FACT[28];
  for (let n = 26; n >= 0; n -= 2) cp = ddAdd(ddMul(cp, ddNeg(r2)), INV_FACT[n]);
  return { s: ddMul(r, sp), c: cp, q: ((k % 4) + 4) % 4 };
}
export function sinCR(x: number): number {
  if (!isFinite(x)) return NaN;
  if (Math.abs(x) < 1.4901161193847656e-8 || Math.abs(x) > 1e6) return Math.abs(x) > 1e6 ? Math.sin(x) : x;
  const { s, c, q } = sinCosDD(x);
  const v = q === 0 ? s : q === 1 ? c : q === 2 ? ddNeg(s) : ddNeg(c);
  return v[0] + v[1];
}
export function cosCR(x: number): number {
  if (!isFinite(x)) return NaN;
  if (Math.abs(x) > 1e6) return Math.cos(x);
  if (Math.abs(x) < 1.4901161193847656e-8) return 1;
  const { s, c, q } = sinCosDD(x);
  const v = q === 0 ? c : q === 1 ? ddNeg(s) : q === 2 ? ddNeg(c) : s;
  return v[0] + v[1];
}
export function tanhCR(x: number): number {
  if (x !== x) return x;
  const a = Math.abs(x);
  if (a > 22) return x > 0 ? 1 : -1;
  if (a < 7.450580596923828e-9) return x;
  const em1 = ddExpm1(2 * a);
  const t = ddDiv(em1, ddAdd(em1, [2, 0]));
  const v = t[0] + t[1];
  return x < 0 ? -v : v;
}
export function sinhCR(x: number): number {
  if (x !== x) return x;
  const a = Math.abs(x);
  if (a > 710.4758600739439) return x > 0 ? Infinity : -Infinity;
  if (a < 7.450580596923828e-9) return x;
  const em1 = ddExpm1(a);
  // sinh = (em1 + em1/(em1+1)) / 2
  const t = ddAdd(em1, ddDiv(em1, ddAdd(em1, [1, 0])));
  const v = (t[0] + t[1]) / 2;
  return x < 0 ? -v : v;
}
export function coshCR(x: number): number {
  if (x !== x) return x;
  const a = Math.abs(x);
  if (a > 710.4758600739439) return Infinity;
  if (a < 7.450580596923828e-9) return 1;
  const em1 = ddExpm1(a);
  // cosh = 1 + em1^2 / (2 (em1 + 1))
  const t = ddAdd([1, 0], ddDiv(ddMul(em1, em1), ddMulD(ddAdd(em1, [1, 0]), 2)));
  return t[0] + t[1];
}

// =====================================================================
//  numpy.linalg
// =====================================================================

function sqMats(I: Interp, a: NDArray): { n: number; batch: number[]; mats: Float64Array[] } {
  if (a.ndim < 2) linAlgError(I, `${a.ndim}-dimensional array given. Array must be at least two-dimensional`);
  const n = a.shape[a.ndim - 1];
  if (a.shape[a.ndim - 2] !== n) linAlgError(I, 'Last 2 dimensions of the array must be square');
  const f = flat(a);
  const batch = a.shape.slice(0, -2);
  const mats: Float64Array[] = [];
  for (let b = 0; b < prod(batch); b++) mats.push(Float64Array.from(f.subarray(b * n * n, (b + 1) * n * n)));
  return { n, batch, mats };
}

/** in-place LU with partial pivoting (LAPACK dgetf2). Returns pivots and whether a zero pivot occurred. */
function luFactor(A: Float64Array, n: number): { piv: number[]; singular: boolean } {
  const piv: number[] = [];
  let singular = false;
  for (let k = 0; k < n; k++) {
    let p = k, best = Math.abs(A[k * n + k]);
    for (let i = k + 1; i < n; i++) {
      const v = Math.abs(A[i * n + k]);
      if (v > best) {
        best = v;
        p = i;
      }
    }
    piv.push(p);
    if (A[p * n + k] !== 0) {
      if (p !== k)
        for (let j = 0; j < n; j++) {
          const t = A[k * n + j];
          A[k * n + j] = A[p * n + j];
          A[p * n + j] = t;
        }
      const pv = A[k * n + k];
      if (Math.abs(pv) >= 2.2250738585072014e-308) {
        const r = 1 / pv;
        for (let i = k + 1; i < n; i++) A[i * n + k] *= r;
      } else for (let i = k + 1; i < n; i++) A[i * n + k] /= pv;
    } else singular = true;
    for (let i = k + 1; i < n; i++) {
      const l = A[i * n + k];
      if (l === 0) continue;
      for (let j = k + 1; j < n; j++) A[i * n + j] -= l * A[k * n + j];
    }
  }
  return { piv, singular };
}
function luSolve(LU: Float64Array, piv: number[], n: number, B: Float64Array, k: number) {
  // B is n x k row-major; apply pivots then forward / back substitution
  for (let i = 0; i < n; i++) {
    const p = piv[i];
    if (p !== i)
      for (let j = 0; j < k; j++) {
        const t = B[i * k + j];
        B[i * k + j] = B[p * k + j];
        B[p * k + j] = t;
      }
  }
  for (let i = 0; i < n; i++)
    for (let r = 0; r < i; r++) {
      const l = LU[i * n + r];
      if (l !== 0) for (let j = 0; j < k; j++) B[i * k + j] -= l * B[r * k + j];
    }
  for (let i = n - 1; i >= 0; i--) {
    for (let r = i + 1; r < n; r++) {
      const u = LU[i * n + r];
      if (u !== 0) for (let j = 0; j < k; j++) B[i * k + j] -= u * B[r * k + j];
    }
    const d = LU[i * n + i];
    for (let j = 0; j < k; j++) B[i * k + j] /= d;
  }
}

function linv(I: Interp, a: NDArray): NDArray {
  const { n, batch, mats } = sqMats(I, a);
  const out = new Float64Array(mats.length * n * n);
  mats.forEach((A, b) => {
    const { piv, singular } = luFactor(A, n);
    if (singular) linAlgError(I, 'Singular matrix');
    const B = new Float64Array(n * n);
    for (let i = 0; i < n; i++) B[i * n + i] = 1;
    luSolve(A, piv, n, B, n);
    out.set(B, b * n * n);
  });
  return mk(out, [...batch, n, n], 'float64');
}
function slogdetCore(A: Float64Array, n: number): [number, number] {
  const { piv, singular } = luFactor(A, n);
  if (singular) return [0, -Infinity];
  let sign = 1, logdet = 0;
  for (let i = 0; i < n; i++) if (piv[i] !== i) sign = -sign;
  for (let i = 0; i < n; i++) {
    let d = A[i * n + i];
    if (d < 0) {
      sign = -sign;
      d = -d;
    }
    logdet += logCR(d);
  }
  return [sign, logdet];
}
function ldet(I: Interp, a: NDArray): PyVal {
  const { n, batch, mats } = sqMats(I, a);
  const out = new Float64Array(mats.length);
  mats.forEach((A, b) => {
    const [s, l] = slogdetCore(A, n);
    out[b] = s * expCR(l);
  });
  return wrap(mk(out, batch, 'float64'));
}
function lsolve(I: Interp, a: NDArray, b: NDArray): NDArray {
  if (a.ndim !== 2) unsupported(I, 'batched linalg.solve');
  const { n, mats } = sqMats(I, a);
  const A = mats[0];
  const bv = b.ndim === 1;
  if (b.shape[0] !== n) I.raise('ValueError', `solve: Input operand 1 has a mismatch in its core dimension 0, with gufunc signature (m,m),(m,n)->(m,n) (size ${b.shape[0]} is different from ${n})`);
  const k = bv ? 1 : b.shape[1];
  const B = new Float64Array(flat(b));
  const { piv, singular } = luFactor(A, n);
  if (singular) linAlgError(I, 'Singular matrix');
  luSolve(A, piv, n, B, k);
  return mk(B, bv ? [n] : [n, k], 'float64');
}

/** symmetric eigen-decomposition by cyclic Jacobi; ascending eigenvalues */
function jacobiEig(S: Float64Array, n: number): { w: Float64Array; V: Float64Array } {
  const A = Float64Array.from(S);
  const V = new Float64Array(n * n);
  for (let i = 0; i < n; i++) V[i * n + i] = 1;
  for (let sweep = 0; sweep < 100; sweep++) {
    let off = 0;
    for (let p = 0; p < n; p++) for (let q = p + 1; q < n; q++) off += A[p * n + q] * A[p * n + q];
    if (off < 1e-300) break;
    for (let p = 0; p < n; p++)
      for (let q = p + 1; q < n; q++) {
        const apq = A[p * n + q];
        if (apq === 0) continue;
        const app = A[p * n + p], aqq = A[q * n + q];
        const theta = (aqq - app) / (2 * apq);
        const t = (theta >= 0 ? 1 : -1) / (Math.abs(theta) + Math.sqrt(theta * theta + 1));
        const c = 1 / Math.sqrt(t * t + 1), s = t * c;
        for (let k = 0; k < n; k++) {
          const akp = A[k * n + p], akq = A[k * n + q];
          A[k * n + p] = c * akp - s * akq;
          A[k * n + q] = s * akp + c * akq;
        }
        for (let k = 0; k < n; k++) {
          const apk = A[p * n + k], aqk = A[q * n + k];
          A[p * n + k] = c * apk - s * aqk;
          A[q * n + k] = s * apk + c * aqk;
        }
        for (let k = 0; k < n; k++) {
          const vkp = V[k * n + p], vkq = V[k * n + q];
          V[k * n + p] = c * vkp - s * vkq;
          V[k * n + q] = s * vkp + c * vkq;
        }
      }
  }
  const order = Array.from({ length: n }, (_, i) => i).sort((i, j) => A[i * n + i] - A[j * n + j]);
  const w = Float64Array.from(order, (i) => A[i * n + i]);
  const Vs = new Float64Array(n * n);
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) Vs[r * n + c] = V[r * n + order[c]];
  return { w, V: Vs };
}

function leigh(I: Interp, a: NDArray, upper: boolean, vecs: boolean): PyVal {
  if (a.ndim !== 2) unsupported(I, 'batched linalg.eigh');
  const { n, mats } = sqMats(I, a);
  const A = mats[0];
  for (let i = 0; i < n; i++)
    for (let j = 0; j < n; j++) {
      if (upper ? j < i : j > i) A[i * n + j] = A[j * n + i];
    }
  const { w, V } = jacobiEig(A, n);
  const W = mk(w, [n], 'float64');
  return vecs ? new PyTuple([W, mk(V, [n, n], 'float64')]) : W;
}

/** general real eigenproblem: Hessenberg reduction + shifted QR (EISPACK orthes/hqr2, as in JAMA) */
function generalEig(I: Interp, Ain: Float64Array, n: number): { wr: Float64Array; V: Float64Array } {
  const H = Array.from({ length: n }, (_, i) => Array.from(Ain.subarray(i * n, (i + 1) * n)));
  const V: number[][] = Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => (i === j ? 1 : 0)));
  const ort = new Array(n).fill(0);
  const low = 0, high = n - 1;
  for (let m = low + 1; m <= high - 1; m++) {
    let scale = 0;
    for (let i = m; i <= high; i++) scale += Math.abs(H[i][m - 1]);
    if (scale !== 0) {
      let h = 0;
      for (let i = high; i >= m; i--) {
        ort[i] = H[i][m - 1] / scale;
        h += ort[i] * ort[i];
      }
      let g = Math.sqrt(h);
      if (ort[m] > 0) g = -g;
      h = h - ort[m] * g;
      ort[m] = ort[m] - g;
      for (let j = m; j < n; j++) {
        let f = 0;
        for (let i = high; i >= m; i--) f += ort[i] * H[i][j];
        f = f / h;
        for (let i = m; i <= high; i++) H[i][j] -= f * ort[i];
      }
      for (let i = 0; i <= high; i++) {
        let f = 0;
        for (let j = high; j >= m; j--) f += ort[j] * H[i][j];
        f = f / h;
        for (let j = m; j <= high; j++) H[i][j] -= f * ort[j];
      }
      ort[m] = scale * ort[m];
      H[m][m - 1] = scale * g;
    }
  }
  for (let m = high - 1; m >= low + 1; m--) {
    if (H[m][m - 1] !== 0) {
      for (let i = m + 1; i <= high; i++) ort[i] = H[i][m - 1];
      for (let j = m; j <= high; j++) {
        let g = 0;
        for (let i = m; i <= high; i++) g += ort[i] * V[i][j];
        g = g / ort[m] / H[m][m - 1];
        for (let i = m; i <= high; i++) V[i][j] += g * ort[i];
      }
    }
  }
  // hqr2
  const d = new Array(n).fill(0), e = new Array(n).fill(0);
  let nn = n;
  let k = nn - 1;
  const eps = Math.pow(2, -52);
  let exshift = 0, p = 0, q = 0, r = 0, s = 0, z = 0, t: number, w: number, x: number, y: number;
  let norm = 0;
  for (let i = 0; i < nn; i++) for (let j = Math.max(i - 1, 0); j < nn; j++) norm += Math.abs(H[i][j]);
  let iter = 0;
  k = nn - 1;
  while (k >= low) {
    let l = k;
    while (l > low) {
      s = Math.abs(H[l - 1][l - 1]) + Math.abs(H[l][l]);
      if (s === 0) s = norm;
      if (Math.abs(H[l][l - 1]) < eps * s) break;
      l--;
    }
    if (l === k) {
      H[k][k] = H[k][k] + exshift;
      d[k] = H[k][k];
      e[k] = 0;
      k--;
      iter = 0;
    } else if (l === k - 1) {
      w = H[k][k - 1] * H[k - 1][k];
      p = (H[k - 1][k - 1] - H[k][k]) / 2;
      q = p * p + w;
      z = Math.sqrt(Math.abs(q));
      H[k][k] = H[k][k] + exshift;
      H[k - 1][k - 1] = H[k - 1][k - 1] + exshift;
      x = H[k][k];
      if (q >= 0) {
        z = p >= 0 ? p + z : p - z;
        d[k - 1] = x + z;
        d[k] = d[k - 1];
        if (z !== 0) d[k] = x - w / z;
        e[k - 1] = 0;
        e[k] = 0;
        x = H[k][k - 1];
        s = Math.abs(x) + Math.abs(z);
        p = x / s;
        q = z / s;
        r = Math.sqrt(p * p + q * q);
        p = p / r;
        q = q / r;
        for (let j = k - 1; j < nn; j++) {
          z = H[k - 1][j];
          H[k - 1][j] = q * z + p * H[k][j];
          H[k][j] = q * H[k][j] - p * z;
        }
        for (let i = 0; i <= k; i++) {
          z = H[i][k - 1];
          H[i][k - 1] = q * z + p * H[i][k];
          H[i][k] = q * H[i][k] - p * z;
        }
        for (let i = low; i <= high; i++) {
          z = V[i][k - 1];
          V[i][k - 1] = q * z + p * V[i][k];
          V[i][k] = q * V[i][k] - p * z;
        }
      } else {
        I.raise('NotImplementedError', 'numpy.linalg.eig: this matrix has complex eigenvalues, and complex numbers are not supported here');
      }
      k = k - 2;
      iter = 0;
    } else {
      x = H[k][k];
      y = 0;
      w = 0;
      if (l < k) {
        y = H[k - 1][k - 1];
        w = H[k][k - 1] * H[k - 1][k];
      }
      if (iter === 10) {
        exshift += x;
        for (let i = low; i <= k; i++) H[i][i] -= x;
        s = Math.abs(H[k][k - 1]) + Math.abs(H[k - 1][k - 2]);
        x = y = 0.75 * s;
        w = -0.4375 * s * s;
      }
      if (iter === 30) {
        s = (y - x) / 2;
        s = s * s + w;
        if (s > 0) {
          s = Math.sqrt(s);
          if (y < x) s = -s;
          s = x - w / ((y - x) / 2 + s);
          for (let i = low; i <= k; i++) H[i][i] -= s;
          exshift += s;
          x = y = w = 0.964;
        }
      }
      iter++;
      if (iter > 1000) linAlgError(I, 'Eigenvalues did not converge');
      let m = k - 2;
      while (m >= l) {
        z = H[m][m];
        r = x - z;
        s = y - z;
        p = (r * s - w) / H[m + 1][m] + H[m][m + 1];
        q = H[m + 1][m + 1] - z - r - s;
        r = H[m + 2][m + 1];
        s = Math.abs(p) + Math.abs(q) + Math.abs(r);
        p = p / s;
        q = q / s;
        r = r / s;
        if (m === l) break;
        if (Math.abs(H[m][m - 1]) * (Math.abs(q) + Math.abs(r)) < eps * (Math.abs(p) * (Math.abs(H[m - 1][m - 1]) + Math.abs(z) + Math.abs(H[m + 1][m + 1])))) break;
        m--;
      }
      for (let i = m + 2; i <= k; i++) {
        H[i][i - 2] = 0;
        if (i > m + 2) H[i][i - 3] = 0;
      }
      for (let kk = m; kk <= k - 1; kk++) {
        const notlast = kk !== k - 1;
        if (kk !== m) {
          p = H[kk][kk - 1];
          q = H[kk + 1][kk - 1];
          r = notlast ? H[kk + 2][kk - 1] : 0;
          x = Math.abs(p) + Math.abs(q) + Math.abs(r);
          if (x === 0) continue;
          p = p / x;
          q = q / x;
          r = r / x;
        }
        s = Math.sqrt(p * p + q * q + r * r);
        if (p < 0) s = -s;
        if (s !== 0) {
          if (kk !== m) H[kk][kk - 1] = -s * x;
          else if (l !== m) H[kk][kk - 1] = -H[kk][kk - 1];
          p = p + s;
          x = p / s;
          y = q / s;
          z = r / s;
          q = q / p;
          r = r / p;
          for (let j = kk; j < nn; j++) {
            p = H[kk][j] + q * H[kk + 1][j];
            if (notlast) {
              p = p + r * H[kk + 2][j];
              H[kk + 2][j] = H[kk + 2][j] - p * z;
            }
            H[kk][j] = H[kk][j] - p * x;
            H[kk + 1][j] = H[kk + 1][j] - p * y;
          }
          for (let i = 0; i <= Math.min(k, kk + 3); i++) {
            p = x * H[i][kk] + y * H[i][kk + 1];
            if (notlast) {
              p = p + z * H[i][kk + 2];
              H[i][kk + 2] = H[i][kk + 2] - p * r;
            }
            H[i][kk] = H[i][kk] - p;
            H[i][kk + 1] = H[i][kk + 1] - p * q;
          }
          for (let i = low; i <= high; i++) {
            p = x * V[i][kk] + y * V[i][kk + 1];
            if (notlast) {
              p = p + z * V[i][kk + 2];
              V[i][kk + 2] = V[i][kk + 2] - p * r;
            }
            V[i][kk] = V[i][kk] - p;
            V[i][kk + 1] = V[i][kk + 1] - p * q;
          }
        }
      }
    }
  }
  // back-substitute to find vectors of upper triangular form (real eigenvalues only)
  if (norm !== 0) {
    for (nn = n - 1; nn >= 0; nn--) {
      p = d[nn];
      let l = nn;
      H[nn][nn] = 1;
      for (let i = nn - 1; i >= 0; i--) {
        w = H[i][i] - p;
        r = 0;
        for (let j = l; j <= nn; j++) r = r + H[i][j] * H[j][nn];
        if (e[i] < 0) {
          z = w;
          s = r;
        } else {
          l = i;
          if (e[i] === 0) H[i][nn] = w !== 0 ? -r / w : -r / (eps * norm);
          else {
            x = H[i][i + 1];
            y = H[i + 1][i];
            q = (d[i] - p) * (d[i] - p) + e[i] * e[i];
            t = (x * s - z * r) / q;
            H[i][nn] = t;
            H[i + 1][nn] = Math.abs(x) > Math.abs(z) ? (-r - w * t) / x : (-s - y * t) / z;
          }
          t = Math.abs(H[i][nn]);
          if (eps * t * t > 1) for (let j = i; j <= nn; j++) H[j][nn] = H[j][nn] / t;
        }
      }
    }
    for (let j = n - 1; j >= low; j--)
      for (let i = low; i <= high; i++) {
        z = 0;
        for (let kk = low; kk <= Math.min(j, high); kk++) z = z + V[i][kk] * H[kk][j];
        V[i][j] = z;
      }
  }
  const Vout = new Float64Array(n * n);
  for (let j = 0; j < n; j++) {
    let nrm = 0;
    for (let i = 0; i < n; i++) nrm += V[i][j] * V[i][j];
    nrm = Math.sqrt(nrm) || 1;
    for (let i = 0; i < n; i++) Vout[i * n + j] = V[i][j] / nrm;
  }
  return { wr: Float64Array.from(d), V: Vout };
}

/** one-sided Jacobi SVD for m >= n: A = U diag(s) V^T, s descending */
function jacobiSVD(A0: Float64Array, m: number, n: number): { U: Float64Array; s: Float64Array; V: Float64Array } {
  const U = Float64Array.from(A0);
  const V = new Float64Array(n * n);
  for (let i = 0; i < n; i++) V[i * n + i] = 1;
  const eps = 2.220446049250313e-16;
  for (let sweep = 0; sweep < 75; sweep++) {
    let rotated = false;
    for (let p = 0; p < n - 1; p++)
      for (let q = p + 1; q < n; q++) {
        let alpha = 0, beta = 0, gamma = 0;
        for (let i = 0; i < m; i++) {
          const up = U[i * n + p], uq = U[i * n + q];
          alpha += up * up;
          beta += uq * uq;
          gamma += up * uq;
        }
        if (gamma === 0 || Math.abs(gamma) <= eps * Math.sqrt(alpha * beta)) continue;
        rotated = true;
        const zeta = (beta - alpha) / (2 * gamma);
        const t = (zeta >= 0 ? 1 : -1) / (Math.abs(zeta) + Math.sqrt(1 + zeta * zeta));
        const c = 1 / Math.sqrt(1 + t * t), s = c * t;
        for (let i = 0; i < m; i++) {
          const up = U[i * n + p], uq = U[i * n + q];
          U[i * n + p] = c * up - s * uq;
          U[i * n + q] = s * up + c * uq;
        }
        for (let i = 0; i < n; i++) {
          const vp = V[i * n + p], vq = V[i * n + q];
          V[i * n + p] = c * vp - s * vq;
          V[i * n + q] = s * vp + c * vq;
        }
      }
    if (!rotated) break;
  }
  const sv = new Float64Array(n);
  for (let j = 0; j < n; j++) {
    let nrm = 0;
    for (let i = 0; i < m; i++) nrm += U[i * n + j] * U[i * n + j];
    sv[j] = Math.sqrt(nrm);
  }
  const order = Array.from({ length: n }, (_, i) => i).sort((i, j) => sv[j] - sv[i] || i - j);
  const Us = new Float64Array(m * n), Vs = new Float64Array(n * n), ss = new Float64Array(n);
  order.forEach((src, dst) => {
    ss[dst] = sv[src];
    for (let i = 0; i < m; i++) Us[i * n + dst] = sv[src] > 0 ? U[i * n + src] / sv[src] : 0;
    for (let i = 0; i < n; i++) Vs[i * n + dst] = V[i * n + src];
  });
  return { U: Us, s: ss, V: Vs };
}

/** complete the first k columns (orthonormal or zero) of an m x c matrix (row-major, c >= k) to an orthonormal set of c columns */
function completeBasis(Q: Float64Array, m: number, c: number, have: boolean[]): void {
  let cand = 0;
  for (let j = 0; j < c; j++) {
    if (have[j]) continue;
    for (;;) {
      const v = new Float64Array(m);
      v[cand % m] = 1;
      cand++;
      for (let pass = 0; pass < 2; pass++)
        for (let k = 0; k < c; k++) {
          if (!have[k]) continue;
          let d = 0;
          for (let i = 0; i < m; i++) d += Q[i * c + k] * v[i];
          for (let i = 0; i < m; i++) v[i] -= d * Q[i * c + k];
        }
      let nrm = 0;
      for (let i = 0; i < m; i++) nrm += v[i] * v[i];
      nrm = Math.sqrt(nrm);
      if (nrm > 1e-8 || cand > 4 * m) {
        for (let i = 0; i < m; i++) Q[i * c + j] = v[i] / nrm;
        have[j] = true;
        break;
      }
    }
  }
}

function svdCore(a: Float64Array, m: number, n: number, full: boolean): { U: NDArray; s: NDArray; Vt: NDArray } {
  const tr = m < n;
  const M = tr ? n : m, N = tr ? m : n;
  let A = a;
  if (tr) {
    A = new Float64Array(m * n);
    for (let i = 0; i < m; i++) for (let j = 0; j < n; j++) A[j * m + i] = a[i * n + j];
  }
  const { U, s, V } = jacobiSVD(A, M, N);
  const k = N;
  const cols = full ? M : k;
  const Uf = new Float64Array(M * cols);
  const have = new Array(cols).fill(false);
  for (let j = 0; j < k; j++) {
    if (s[j] > 0) {
      have[j] = true;
      for (let i = 0; i < M; i++) Uf[i * cols + j] = U[i * k + j];
    }
  }
  completeBasis(Uf, M, cols, have);
  // A = Uf diag(s) V^T.  If transposed: a = V diag(s) Uf^T
  const Uarr = mk(Uf, [M, cols], 'float64');
  const Varr = mk(V, [N, N], 'float64');
  const sArr = mk(s, [k], 'float64');
  if (!tr) return { U: Uarr, s: sArr, Vt: copyArr(transposeView(Varr, [1, 0])) };
  return { U: Varr, s: sArr, Vt: copyArr(transposeView(Uarr, [1, 0])) };
}

function lsvd(I: Interp, a: NDArray, full: boolean, uv: boolean): PyVal {
  if (a.ndim !== 2) {
    if (a.ndim < 2) linAlgError(I, `${a.ndim}-dimensional array given. Array must be at least two-dimensional`);
    unsupported(I, 'batched linalg.svd');
  }
  const [m, n] = a.shape;
  const r = svdCore(new Float64Array(flat(a)), m, n, full);
  if (!uv) return r.s;
  return new PyTuple([r.U, r.s, r.Vt]);
}

function lqr(I: Interp, a: NDArray, mode: string): PyVal {
  if (a.ndim !== 2) linAlgError(I, `${a.ndim}-dimensional array given. Array must be at least two-dimensional`);
  const [m, n] = a.shape;
  const A = new Float64Array(flat(a));
  const k = Math.min(m, n);
  const taus: number[] = [];
  const vs: Float64Array[] = [];
  for (let j = 0; j < k; j++) {
    const alpha = A[j * n + j];
    let xnorm = 0;
    for (let i = j + 1; i < m; i++) xnorm = Math.hypot(xnorm, A[i * n + j]);
    const v = new Float64Array(m);
    v[j] = 1;
    if (xnorm === 0) {
      taus.push(0);
      vs.push(v);
      continue;
    }
    const beta = -Math.sign(alpha || 1) * Math.hypot(alpha, xnorm);
    const tau = (beta - alpha) / beta;
    const scal = 1 / (alpha - beta);
    for (let i = j + 1; i < m; i++) v[i] = A[i * n + j] * scal;
    A[j * n + j] = beta;
    for (let i = j + 1; i < m; i++) A[i * n + j] = 0;
    for (let c = j + 1; c < n; c++) {
      let dsum = 0;
      for (let i = j; i < m; i++) dsum += v[i] * A[i * n + c];
      dsum *= tau;
      for (let i = j; i < m; i++) A[i * n + c] -= dsum * v[i];
    }
    taus.push(tau);
    vs.push(v);
  }
  const complete = mode === 'complete';
  const rRows = complete ? m : k;
  const R = new Float64Array(rRows * n);
  for (let i = 0; i < Math.min(rRows, m); i++) for (let j = i; j < n; j++) R[i * n + j] = A[i * n + j];
  const Rarr = mk(R, [rRows, n], 'float64');
  if (mode === 'r') return Rarr;
  const qc = complete ? m : k;
  const Q = new Float64Array(m * qc);
  for (let i = 0; i < Math.min(m, qc); i++) Q[i * qc + i] = 1;
  for (let j = k - 1; j >= 0; j--) {
    const v = vs[j], tau = taus[j];
    if (tau === 0) continue;
    for (let c = 0; c < qc; c++) {
      let dsum = 0;
      for (let i = j; i < m; i++) dsum += v[i] * Q[i * qc + c];
      dsum *= tau;
      for (let i = j; i < m; i++) Q[i * qc + c] -= dsum * v[i];
    }
  }
  return new PyTuple([mk(Q, [m, qc], 'float64'), Rarr]);
}

function lnorm(I: Interp, args: PyVal[], kw: Map<string, PyVal>): PyVal {
  const A = parseArgs(I, 'norm', args, kw, ['x', 'ord=', 'axis=', 'keepdims=']);
  let x = toArr(I, A.x!);
  if (x.dtype !== 'float64') x = copyArr(x, 'float64');
  const keep = toBool(I, A.keepdims);
  const ord = A.ord === undefined ? null : A.ord;
  const ordNum = ord === null ? null : typeof ord === 'string' ? ord : toFloat(I, ord);
  let axes = axesArg(I, A.axis, x.ndim);
  if (axes === null && (ordNum === null || (x.ndim === 2 && ordNum === 'fro') || (x.ndim === 1 && ordNum === 2))) {
    const f = flat(x);
    let acc = 0;
    for (let i = 0; i < f.length; i++) acc = fma(f[i], f[i], acc);
    const r = Math.sqrt(acc);
    if (keep) return mk(new Float64Array([r]), x.shape.map(() => 1), 'float64');
    return new NPScalar(r, 'float64');
  }
  if (axes === null) axes = x.ndim === 1 ? [0] : x.ndim === 2 ? [0, 1] : I.raise('ValueError', 'Improper number of dimensions to norm.');
  const kwRed = new Map<string, PyVal>([['axis', axes.length === 1 ? BigInt(axes[0]) : new PyTuple(axes.map((v) => BigInt(v)))], ['keepdims', keep]]);
  const absx = unaryUfunc(I, 'absolute', x);
  if (axes.length === 1) {
    if (ordNum === Infinity) return rMinMax(I, [absx], kwRed, true, 'max');
    if (ordNum === -Infinity) return rMinMax(I, [absx], kwRed, false, 'min');
    if (ordNum === 0) return rSum(I, [map1(x, (v) => (v !== 0 ? 1 : 0), 'float64')], kwRed);
    if (ordNum === 1) return rSum(I, [absx], kwRed);
    if (ordNum === null || ordNum === 2) return wrap(map1(toArr(I, rSum(I, [map1(x, (v) => v * v, 'float64')], kwRed)), Math.sqrt, 'float64'));
    if (typeof ordNum === 'string') I.raise('ValueError', `Invalid norm order '${ordNum}' for vectors`);
    const p = ordNum as number;
    const s = toArr(I, rSum(I, [map1(absx, (v) => Math.pow(v, p), 'float64')], kwRed));
    return wrap(map1(s, (v) => Math.pow(v, 1 / p), 'float64'));
  }
  if (axes.length !== 2) I.raise('ValueError', 'Improper number of dimensions to norm.');
  if (x.ndim !== 2) unsupported(I, 'matrix norms of stacked matrices');
  const [r0, c0] = axes;
  const xm = r0 === 0 ? x : copyArr(transposeView(x, [1, 0]));
  const wrapK = (v: number): PyVal => (keep ? mk(new Float64Array([v]), [1, 1], 'float64') : new NPScalar(v, 'float64'));
  void c0;
  if (ordNum === null || ordNum === 'fro') {
    const f = flat(xm);
    let acc = 0;
    for (let i = 0; i < f.length; i++) acc += f[i] * f[i];
    return wrapK(Math.sqrt(acc));
  }
  if (ordNum === 'nuc' || ordNum === 2 || ordNum === -2) {
    const s = flat(svdCore(new Float64Array(flat(xm)), xm.shape[0], xm.shape[1], false).s);
    if (ordNum === 'nuc') return wrapK(s.reduce((p, v) => p + v, 0));
    return wrapK(ordNum === 2 ? s[0] : s[s.length - 1]);
  }
  const absm = unaryUfunc(I, 'absolute', xm);
  if (ordNum === 1 || ordNum === -1) {
    const cs = flat(toArr(I, rSum(I, [absm], new Map([['axis', 0n]]))));
    return wrapK(ordNum === 1 ? Math.max(...cs) : Math.min(...cs));
  }
  if (ordNum === Infinity || ordNum === -Infinity) {
    const rs = flat(toArr(I, rSum(I, [absm], new Map([['axis', 1n]]))));
    return wrapK(ordNum === Infinity ? Math.max(...rs) : Math.min(...rs));
  }
  I.raise('ValueError', 'Invalid norm order for matrices.');
}

function buildLinalg(I: Interp, d: Map<string, PyVal>) {
  const f = (name: string, impl: NpFn) => d.set(name, new PyBuiltin(name, (a, kw) => impl(I, a, kw)));
  const st = S(I);
  d.set('LinAlgError', st.cls.LinAlgError);
  f('inv', (I, a) => linv(I, toArr(I, a[0])));
  f('det', (I, a) => ldet(I, toArr(I, a[0])));
  f('cholesky', (I, a) => {
    // lower-triangular L with A = L L^T (LAPACK dpotrf, unblocked)
    const { n, batch, mats } = sqMats(I, toArr(I, a[0]));
    const out = new Float64Array(mats.length * n * n);
    mats.forEach((A, b) => {
      const L = out.subarray(b * n * n, (b + 1) * n * n);
      for (let j = 0; j < n; j++) {
        let d = A[j * n + j];
        for (let k = 0; k < j; k++) d -= L[j * n + k] * L[j * n + k];
        if (!(d > 0)) linAlgError(I, 'Matrix is not positive definite');
        const ljj = Math.sqrt(d);
        L[j * n + j] = ljj;
        for (let i = j + 1; i < n; i++) {
          let v = A[i * n + j];
          for (let k = 0; k < j; k++) v -= L[i * n + k] * L[j * n + k];
          L[i * n + j] = v / ljj;
        }
      }
    });
    return mk(out, [...batch, n, n], 'float64');
  });
  f('slogdet', (I, a) => {
    const { n, mats } = sqMats(I, toArr(I, a[0]));
    const [s, l] = slogdetCore(mats[0], n);
    return new PyTuple([new NPScalar(s, 'float64'), new NPScalar(l, 'float64')]);
  });
  f('solve', (I, a) => lsolve(I, toArr(I, a[0]), toArr(I, a[1])));
  f('eigh', (I, a, kw) => leigh(I, toArr(I, a[0]), (a[1] ?? kw.get('UPLO')) === 'U', true));
  f('eigvalsh', (I, a, kw) => leigh(I, toArr(I, a[0]), (a[1] ?? kw.get('UPLO')) === 'U', false));
  const eig = (I: Interp, a: NDArray) => {
    const { n, mats } = sqMats(I, a);
    if (mats.length !== 1) unsupported(I, 'batched linalg.eig');
    if (!flat(a).every(isFinite)) linAlgError(I, 'Array must not contain infs or NaNs');
    return generalEig(I, mats[0], n);
  };
  f('eig', (I, a) => {
    const arr = toArr(I, a[0]);
    const { wr, V } = eig(I, arr);
    return new PyTuple([mk(wr, [wr.length], 'complex128'), mk(V, [wr.length, wr.length], 'complex128')]);
  });
  f('eigvals', (I, a) => {
    const { wr } = eig(I, toArr(I, a[0]));
    return mk(wr, [wr.length], 'complex128');
  });
  f('svd', (I, a, kw) => {
    const A = parseArgs(I, 'svd', a, kw, ['a', 'full_matrices=', 'compute_uv=', 'hermitian=']);
    return lsvd(I, toArr(I, A.a!), toBool(I, A.full_matrices, true), toBool(I, A.compute_uv, true));
  });
  f('svdvals', (I, a) => lsvd(I, toArr(I, a[0]), false, false));
  f('qr', (I, a, kw) => {
    const A = parseArgs(I, 'qr', a, kw, ['a', 'mode=']);
    const mode = (A.mode as string | undefined) ?? 'reduced';
    if (!['reduced', 'complete', 'r'].includes(mode)) unsupported(I, `qr(mode='${mode}')`);
    return lqr(I, toArr(I, A.a!), mode);
  });
  f('norm', lnorm);
  f('matrix_rank', (I, a, kw) => {
    const A = parseArgs(I, 'matrix_rank', a, kw, ['A', 'tol=', 'hermitian=', 'rtol=']);
    const x = toArr(I, A.A!);
    if (x.ndim < 2) return BigInt(flat(x).some((v) => v !== 0) ? 1 : 0);
    const s = flat(svdCore(new Float64Array(flat(x)), x.shape[0], x.shape[1], false).s);
    const tol = A.tol !== undefined && A.tol !== null ? toFloat(I, A.tol) : (s[0] ?? 0) * Math.max(x.shape[0], x.shape[1]) * 2.220446049250313e-16;
    return new NPScalar(s.filter((v) => v > tol).length, 'int64');
  });
  f('pinv', (I, a, kw) => {
    const A = parseArgs(I, 'pinv', a, kw, ['a', 'rcond=', 'hermitian=', 'rtol=']);
    const x = toArr(I, A.a!);
    if (x.ndim !== 2) unsupported(I, 'pinv of non-2-D arrays');
    const rcond = A.rcond !== undefined && A.rcond !== null ? toFloat(I, A.rcond) : A.rtol !== undefined && A.rtol !== null ? toFloat(I, A.rtol) : A.rtol === null ? Math.max(...x.shape) * 2.220446049250313e-16 : 1e-15;
    const { U, s, Vt } = svdCore(new Float64Array(flat(x)), x.shape[0], x.shape[1], false);
    const sv = flat(s);
    const cutoff = rcond * Math.max(...sv);
    const sinv = mk(Float64Array.from(sv, (v) => (v > cutoff ? 1 / v : 0)), [sv.length, 1], 'float64');
    return matmul(I, transposeView(Vt, [1, 0]), binUfunc(I, 'multiply', sinv, transposeView(U, [1, 0])));
  });
  f('lstsq', (I, a, kw) => {
    const A = parseArgs(I, 'lstsq', a, kw, ['a', 'b', 'rcond=']);
    const x = toArr(I, A.a!, 'float64');
    const b = toArr(I, A.b!, 'float64');
    const [m, n] = x.shape;
    const b2 = b.ndim === 1 ? reshapeView(b, [b.shape[0], 1]) : b;
    if (b2.shape[0] !== m) linAlgError(I, 'Incompatible dimensions');
    const { U, s, Vt } = svdCore(new Float64Array(flat(x)), m, n, false);
    const sv = flat(s);
    const rcond = A.rcond !== undefined && A.rcond !== null ? toFloat(I, A.rcond) : 2.220446049250313e-16 * Math.max(m, n);
    const cutoff = rcond * (sv[0] ?? 0);
    const rank = sv.filter((v) => v > cutoff).length;
    const sinv = mk(Float64Array.from(sv, (v) => (v > cutoff ? 1 / v : 0)), [sv.length, 1], 'float64');
    const UtB = matmul(I, transposeView(U, [1, 0]), b2);
    const sol = matmul(I, transposeView(Vt, [1, 0]), binUfunc(I, 'multiply', sinv, UtB));
    let resid: NDArray = mk(new Float64Array(0), [0], 'float64');
    if (rank === n && m > n) {
      const r = binUfunc(I, 'subtract', matmul(I, x, sol), b2);
      resid = toArr(I, rSum(I, [map1(r, (v) => v * v, 'float64')], new Map([['axis', 0n]])));
    }
    return new PyTuple([b.ndim === 1 ? reshapeView(sol, [n]) : sol, resid, new NPScalar(rank, 'int64'), s]);
  });
  f('matrix_power', (I, a) => {
    const x = toArr(I, a[0]);
    let p = toInt(I, a[1]);
    const n = x.shape[0];
    let base = p < 0 ? linv(I, x) : x;
    p = Math.abs(p);
    let r: NDArray = F.eye(I, [BigInt(n)], new Map([['dtype', new NPDtype(x.dtype)]])) as NDArray;
    while (p > 0) {
      if (p & 1) r = matmul(I, r, base);
      base = matmul(I, base, base);
      p >>= 1;
    }
    return r;
  });
  f('cond', (I, a) => {
    const x = toArr(I, a[0]);
    const s = flat(svdCore(new Float64Array(flat(x)), x.shape[0], x.shape[1], false).s);
    return new NPScalar(s[0] / s[s.length - 1], 'float64');
  });
  f('multi_dot', (I, a) => {
    const arrs = seqArrays(I, a[0]);
    return wrap(arrs.slice(1).reduce((acc, x) => dot(I, acc, x), arrs[0]));
  });
  f('outer', (I, a) => F.outer(I, a, new Map()));
  f('matmul', (I, a) => F.matmul(I, a, new Map()));
  f('trace', (I, a) => F.trace(I, a, new Map()));
  f('cross', (I, a) => {
    const x = flat(toArr(I, a[0])), y = flat(toArr(I, a[1]));
    return mk(Float64Array.from([x[1] * y[2] - x[2] * y[1], x[2] * y[0] - x[0] * y[2], x[0] * y[1] - x[1] * y[0]]), [3], 'float64');
  });
}

// =====================================================================
//  numpy.random — legacy RandomState (MT19937), bit-exact with NumPy
// =====================================================================

export class MT19937 {
  key = new Uint32Array(624);
  pos = 624;
  hasGauss = false;
  gauss = 0;
  constructor(seed = 5489) {
    this.seed(seed);
  }
  seed(s: number) {
    let seed = s >>> 0;
    for (let pos = 0; pos < 624; pos++) {
      this.key[pos] = seed;
      seed = (Math.imul(1812433253, (seed ^ (seed >>> 30)) >>> 0) + pos + 1) >>> 0;
    }
    this.pos = 624;
    this.hasGauss = false;
    this.gauss = 0;
  }
  seedArray(init: number[]) {
    this.seed(19650218);
    const mt = this.key;
    let i = 1, j = 0;
    const len = init.length;
    for (let k = Math.max(624, len); k; k--) {
      const prev = (mt[i - 1] ^ (mt[i - 1] >>> 30)) >>> 0;
      mt[i] = ((mt[i] ^ Math.imul(prev, 1664525)) + init[j] + j) >>> 0;
      i++;
      j++;
      if (i >= 624) {
        mt[0] = mt[623];
        i = 1;
      }
      if (j >= len) j = 0;
    }
    for (let k = 623; k; k--) {
      const prev = (mt[i - 1] ^ (mt[i - 1] >>> 30)) >>> 0;
      mt[i] = ((mt[i] ^ Math.imul(prev, 1566083941)) - i) >>> 0;
      i++;
      if (i >= 624) {
        mt[0] = mt[623];
        i = 1;
      }
    }
    mt[0] = 0x80000000;
    this.pos = 624;
    this.hasGauss = false;
    this.gauss = 0;
  }
  private gen() {
    const k = this.key;
    let y: number, i: number;
    for (i = 0; i < 227; i++) {
      y = (k[i] & 0x80000000) | (k[i + 1] & 0x7fffffff);
      k[i] = k[i + 397] ^ (y >>> 1) ^ (y & 1 ? 0x9908b0df : 0);
    }
    for (; i < 623; i++) {
      y = (k[i] & 0x80000000) | (k[i + 1] & 0x7fffffff);
      k[i] = k[i - 227] ^ (y >>> 1) ^ (y & 1 ? 0x9908b0df : 0);
    }
    y = (k[623] & 0x80000000) | (k[0] & 0x7fffffff);
    k[623] = k[396] ^ (y >>> 1) ^ (y & 1 ? 0x9908b0df : 0);
    this.pos = 0;
  }
  next32(): number {
    if (this.pos === 624) this.gen();
    let y = this.key[this.pos++];
    y ^= y >>> 11;
    y ^= (y << 7) & 0x9d2c5680;
    y ^= (y << 15) & 0xefc60000;
    y ^= y >>> 18;
    return y >>> 0;
  }
  next64(): bigint {
    const hi = this.next32();
    const lo = this.next32();
    return (BigInt(hi) << 32n) | BigInt(lo);
  }
  double(): number {
    const a = this.next32() >>> 5, b = this.next32() >>> 6;
    return (a * 67108864.0 + b) / 9007199254740992.0;
  }
  gaussian(): number {
    if (this.hasGauss) {
      const t = this.gauss;
      this.hasGauss = false;
      this.gauss = 0;
      return t;
    }
    let x1: number, x2: number, r2: number;
    do {
      x1 = 2.0 * this.double() - 1.0;
      x2 = 2.0 * this.double() - 1.0;
      r2 = x1 * x1 + x2 * x2;
    } while (r2 >= 1.0 || r2 === 0.0);
    const f = Math.sqrt((-2.0 * logCR(r2)) / r2);
    this.gauss = f * x1;
    this.hasGauss = true;
    return f * x2;
  }
  /** uniform integer in [0, max] by masked rejection (random_interval / bounded masked) */
  interval(max: number): number {
    if (max === 0) return 0;
    if (max <= 0xffffffff) {
      let mask = max;
      mask |= mask >>> 1;
      mask |= mask >>> 2;
      mask |= mask >>> 4;
      mask |= mask >>> 8;
      mask |= mask >>> 16;
      mask >>>= 0;
      let v: number;
      while ((v = (this.next32() & mask) >>> 0) > max);
      return v;
    }
    const M = BigInt(max);
    let mask = M;
    for (const s of [1n, 2n, 4n, 8n, 16n, 32n]) mask |= mask >> s;
    let v: bigint;
    while ((v = this.next64() & mask) > M);
    return Number(v);
  }
}

function sizeArg(I: Interp, v: PyVal | undefined): number[] | null {
  if (v === undefined || v === null) return null;
  return shapeArg(I, v);
}

function buildRandom(I: Interp, d: Map<string, PyVal>, getMt: () => MT19937, isModule: boolean) {
  const f = (name: string, impl: NpFn) => d.set(name, new PyBuiltin(name, (a, kw) => impl(I, a, kw)));
  const fillN = (shape: number[] | null, gen: () => number, dt: DType = 'float64'): PyVal => {
    if (shape === null) return dt === 'int64' ? BigInt(gen()) : gen();
    const n = prod(shape);
    const out = new Float64Array(n);
    for (let i = 0; i < n; i++) out[i] = gen();
    return mk(out, shape, dt);
  };
  /** distribution with (possibly array) parameters, numpy `cont` semantics */
  const cont = (args: PyVal[], size: PyVal | undefined, gen: (...p: number[]) => number): PyVal => {
    const arrs = args.map((x) => toArr(I, x, 'float64'));
    const shapeS = sizeArg(I, size);
    if (arrs.every((x) => x.ndim === 0)) {
      const ps = arrs.map((x) => x.data[x.offset]);
      return fillN(shapeS, () => gen(...ps));
    }
    const shape = shapeS ?? broadcastShapes(I, arrs.map((x) => x.shape));
    const fl = arrs.map((x) => flat(broadcastTo(I, x, shape)));
    const n = prod(shape);
    const out = new Float64Array(n);
    for (let i = 0; i < n; i++) out[i] = gen(...fl.map((x) => x[i]));
    return mk(out, shape, 'float64');
  };
  if (isModule) {
    f('seed', (I, a) => {
      const s = a[0];
      const mt = getMt();
      if (s === undefined || s === null) {
        mt.seed((Date.now() ^ (Math.random() * 0x100000000)) >>> 0);
        return null;
      }
      if (s instanceof PyList || s instanceof PyTuple || (s instanceof NDArray && s.ndim > 0)) {
        const vals = Array.from(flat(toArr(I, s)));
        if (!vals.length) I.raise('ValueError', 'Seed must be non-empty');
        if (vals.some((v) => v < 0 || v > 0xffffffff)) I.raise('ValueError', 'Seed must be between 0 and 2**32 - 1');
        mt.seedArray(vals);
        return null;
      }
      if (typeof s === 'number' || (s instanceof NPScalar && s.dtype === 'float64')) I.raise('TypeError', 'Cannot cast scalar from dtype(\'float64\') to dtype(\'int64\') according to the rule \'safe\'');
      const v = toInt(I, s);
      if (v < 0 || v > 0xffffffff) I.raise('ValueError', 'Seed must be between 0 and 2**32 - 1');
      mt.seed(v);
      return null;
    });
  }
  const rsample = (I: Interp, a: PyVal[], kw: Map<string, PyVal>) => {
    const A = parseArgs(I, 'random_sample', a, kw, ['size=']);
    const mt = getMt();
    return fillN(sizeArg(I, A.size), () => mt.double());
  };
  f('random_sample', rsample);
  f('random', rsample);
  f('ranf', rsample);
  f('sample', rsample);
  f('rand', (I, a) => {
    const mt = getMt();
    return fillN(a.length ? a.map((x) => toInt(I, x)) : null, () => mt.double());
  });
  f('randn', (I, a) => {
    const mt = getMt();
    return fillN(a.length ? a.map((x) => toInt(I, x)) : null, () => mt.gaussian());
  });
  f('standard_normal', (I, a, kw) => {
    const A = parseArgs(I, 'standard_normal', a, kw, ['size=']);
    const mt = getMt();
    return fillN(sizeArg(I, A.size), () => mt.gaussian());
  });
  f('normal', (I, a, kw) => {
    const A = parseArgs(I, 'normal', a, kw, ['loc=', 'scale=', 'size=']);
    const mt = getMt();
    const scale = A.scale ?? 1.0;
    if (flat(toArr(I, scale, 'float64')).some((v) => v < 0)) I.raise('ValueError', 'scale < 0');
    return cont([A.loc ?? 0.0, scale], A.size, (loc, sc) => loc + sc * mt.gaussian());
  });
  f('uniform', (I, a, kw) => {
    const A = parseArgs(I, 'uniform', a, kw, ['low=', 'high=', 'size=']);
    const mt = getMt();
    const lo = toArr(I, A.low ?? 0.0, 'float64'), hi = toArr(I, A.high ?? 1.0, 'float64');
    const range = binUfunc(I, 'subtract', hi, lo);
    if (!flat(range).every(isFinite)) I.raise('OverflowError', 'Range exceeds valid bounds');
    return cont([lo, range], A.size, (l, r) => l + r * mt.double());
  });
  f('standard_exponential', (I, a, kw) => {
    const A = parseArgs(I, 'standard_exponential', a, kw, ['size=']);
    const mt = getMt();
    return fillN(sizeArg(I, A.size), () => -logCR(1.0 - mt.double()));
  });
  f('exponential', (I, a, kw) => {
    const A = parseArgs(I, 'exponential', a, kw, ['scale=', 'size=']);
    const mt = getMt();
    return cont([A.scale ?? 1.0], A.size, (sc) => sc * -logCR(1.0 - mt.double()));
  });
  const randint = (I: Interp, a: PyVal[], kw: Map<string, PyVal>): PyVal => {
    const A = parseArgs(I, 'randint', a, kw, ['low', 'high=', 'size=', 'dtype=']);
    let low: number, high: number;
    if (A.high === undefined || A.high === null) {
      low = 0;
      high = toInt(I, A.low!);
      if (high <= 0) I.raise('ValueError', 'high <= 0');
    } else {
      low = toInt(I, A.low!);
      high = toInt(I, A.high);
      if (low >= high) I.raise('ValueError', 'low >= high');
    }
    const dt = dtypeArg(I, A.dtype) ?? 'int64';
    const mt = getMt();
    const rng = high - 1 - low;
    const gen = () => low + mt.interval(rng);
    const shape = sizeArg(I, A.size);
    if (shape === null) {
      const v = gen();
      return dt === 'bool' ? v !== 0 : BigInt(v);
    }
    return fillN(shape, gen, dt);
  };
  f('randint', randint);
  f('random_integers', (I, a, kw) => {
    const hi = a.length > 1 ? a[1] : a[0];
    const lo = a.length > 1 ? a[0] : 1n;
    return randint(I, [lo, BigInt(toInt(I, hi) + 1), a[2] ?? kw.get('size') ?? null], new Map());
  });
  const shuffleImpl = (x: PyVal) => {
    const mt = getMt();
    if (x instanceof NDArray) {
      if (x.ndim === 0) I.raise('TypeError', 'object of type \'numpy.ndarray\' has no len()');
      const n = x.shape[0];
      if (x.ndim === 1) {
        const st = x.strides[0], D = x.data, o = x.offset;
        for (let i = n - 1; i > 0; i--) {
          const j = mt.interval(i);
          const t = D[o + j * st];
          D[o + j * st] = D[o + i * st];
          D[o + i * st] = t;
        }
        return;
      }
      for (let i = n - 1; i > 0; i--) {
        const j = mt.interval(i);
        if (i === j) continue;
        const ri = axis0(x, i) as NDArray, rj = axis0(x, j) as NDArray;
        const buf = new Float64Array(flat(rj));
        writeFlat(rj, new Float64Array(flat(ri)));
        writeFlat(ri, buf);
      }
      return;
    }
    if (x instanceof PyList) {
      for (let i = x.items.length - 1; i > 0; i--) {
        const j = mt.interval(i);
        [x.items[i], x.items[j]] = [x.items[j], x.items[i]];
      }
      return;
    }
    I.raise('TypeError', `object of type '${typeNameOf(x)}' has no len()`);
  };
  f('shuffle', (I, a) => {
    shuffleImpl(a[0]);
    return null;
  });
  const permutation = (I: Interp, x: PyVal): NDArray => {
    if (typeof x === 'bigint' || (x instanceof NPScalar && x.dtype === 'int64')) {
      const n = toInt(I, x);
      const arr = mk(Float64Array.from({ length: n }, (_, i) => i), [n], 'int64');
      shuffleImpl(arr);
      return arr;
    }
    const arr = toArr(I, x);
    if (arr.ndim < 1) I.raise('IndexError', 'x must be an integer or at least 1-dimensional');
    if (arr.ndim === 1) {
      const c = copyArr(arr);
      shuffleImpl(c);
      return c;
    }
    const idx = mk(Float64Array.from({ length: arr.shape[0] }, (_, i) => i), [arr.shape[0]], 'int64');
    shuffleImpl(idx);
    return npGetItem(I, arr, idx) as NDArray;
  };
  f('permutation', (I, a) => permutation(I, a[0]));
  f('choice', (I, a, kw) => {
    const A = parseArgs(I, 'choice', a, kw, ['a', 'size=', 'replace=', 'p=']);
    const mt = getMt();
    const src = toArr(I, A.a!);
    let pop = 0;
    if (src.ndim === 0) {
      if (src.dtype === 'float64') I.raise('ValueError', 'a must be 1-dimensional or an integer');
      pop = src.data[src.offset];
      if (pop <= 0) I.raise('ValueError', 'a must be greater than 0 unless no samples are taken');
    } else if (src.ndim !== 1) I.raise('ValueError', 'a must be 1-dimensional');
    else {
      pop = src.shape[0];
      if (pop === 0) I.raise('ValueError', "'a' cannot be empty unless no samples are taken");
    }
    let p: Float64Array | null = null;
    if (A.p !== undefined && A.p !== null) {
      p = new Float64Array(flat(toArr(I, A.p, 'float64')));
      if (p.length !== pop) I.raise('ValueError', "'a' and 'p' must have same size");
      // kahan sum
      let s = 0, c = 0;
      for (const v of p) {
        const y = v - c;
        const t = s + y;
        c = t - s - y;
        s = t;
      }
      if (s !== s) I.raise('ValueError', 'probabilities contain NaN');
      if (p.some((v) => v < 0)) I.raise('ValueError', 'probabilities are not non-negative');
      if (Math.abs(s - 1) > Math.sqrt(2.220446049250313e-16)) I.raise('ValueError', 'probabilities do not sum to 1');
    }
    const shape = sizeArg(I, A.size);
    const size = shape === null ? 1 : prod(shape);
    const replace = toBool(I, A.replace, true);
    let idx: Float64Array;
    const cdfOf = (pp: Float64Array) => {
      const cdf = new Float64Array(pp.length);
      let acc = 0;
      for (let i = 0; i < pp.length; i++) cdf[i] = acc += pp[i];
      const last = cdf[cdf.length - 1];
      for (let i = 0; i < cdf.length; i++) cdf[i] /= last;
      return mk(cdf, [cdf.length], 'float64');
    };
    if (replace) {
      if (p) {
        const cdf = cdfOf(p);
        const u = mk(Float64Array.from({ length: size }, () => mt.double()), [size], 'float64');
        idx = searchsorted(cdf, u, true).data;
      } else idx = Float64Array.from({ length: size }, () => mt.interval(pop - 1));
    } else {
      if (size > pop) I.raise('ValueError', "Cannot take a larger sample than population when 'replace=False'");
      if (p) {
        if (p.filter((v) => v > 0).length < size) I.raise('ValueError', 'Fewer non-zero entries in p than size');
        const pp = new Float64Array(p);
        const found: number[] = [];
        while (found.length < size) {
          const x = Float64Array.from({ length: size - found.length }, () => mt.double());
          for (const fidx of found) pp[fidx] = 0;
          const cdf = cdfOf(pp);
          const nw = flat(searchsorted(cdf, mk(x, [x.length], 'float64'), true));
          const seen = new Map<number, number>();
          nw.forEach((v, i) => {
            if (!seen.has(v)) seen.set(v, i);
          });
          const firsts = [...seen.entries()].sort((u, v) => u[0] - v[0]).map((e) => e[1]).sort((u, v) => u - v);
          for (const i of firsts) found.push(nw[i]);
        }
        idx = Float64Array.from(found);
      } else idx = permutation(I, BigInt(pop)).data.slice(0, size);
    }
    const idxArr = mk(idx, shape ?? [], 'int64');
    if (src.ndim === 0) return shape === null ? BigInt(idx[0]) : idxArr;
    if (shape === null) return npGetItem(I, src, BigInt(idx[0]));
    return npGetItem(I, src, idxArr);
  });
  f('binomial', (I) => unsupported(I, 'numpy.random.binomial'));
  f('poisson', (I) => unsupported(I, 'numpy.random.poisson'));
  f('beta', (I) => unsupported(I, 'numpy.random.beta'));
  f('gamma', (I) => unsupported(I, 'numpy.random.gamma'));
  f('multivariate_normal', (I) => unsupported(I, 'numpy.random.multivariate_normal'));
  f('get_state', (I) => unsupported(I, 'numpy.random.get_state'));
  f('set_state', (I) => unsupported(I, 'numpy.random.set_state'));
}

// =====================================================================
//  numpy.random.default_rng — PCG64 + SeedSequence + ziggurat normals
//  (tables are NumPy's ki_double / wi_double / fi_double)
// =====================================================================

// prettier-ignore
const ZIG_KI = [
  4208095142473578, 0, 3387314423973544, 3838760076542274, 4030768804392682, 4136731738896254,
  4203757248105145, 4249917568205994, 4283617341590296, 4309289223136604, 4329489775174550, 4345795907393188,
  4359232558744730, 4370494503737299, 4380069246215646, 4388308869042394, 4395473957549321, 4401761481783924,
  4407323076021240, 4412277362218204, 4416718463613199, 4420722014516422, 4424349484777079, 4427651345409294,
  4430669422005229, 4433438668975191, 4435988524278344, 4438343955930065, 4440526279077425, 4442553800234660,
  4444442329865861, 4446205593658138, 4447855565093316, 4449402736340121, 4450856340408624, 4452224534496486,
  4453514552210512, 4454732830656798, 4455885117109368, 4456976558985043, 4458011780094444, 4458994945550386,
  4459929817254120, 4460819801517196, 4461667990089170, 4462477195632268, 4463249982500384, 4463988693531856,
  4464695473445501, 4465372289331869, 4466020948651920, 4466643115089764, 4467240322552142, 4467813987562542,
  4468365420260672, 4468895834186994, 4469406355006040, 4469898028300364, 4470371826548633, 4470828655385770,
  4471269359229841, 4471694726349190, 4472105493433674, 4472502349725738, 4472885940759935, 4473256871753524,
  4473615710685532, 4473962991097124, 4474299214642296, 4474624853414418, 4474940352071305, 4475246129778808,
  4475542581990776, 4475830082081194, 4476108982842610, 4476379617863426, 4476642302795321, 4476897336520866,
  4477145002230339, 4477385568415884, 4477619289790266, 4477846408136804, 4478067153096380, 4478281742896886,
  4478490385029917, 4478693276879082, 4478890606303906, 4479082552182886, 4479269284918997, 4479450966910588,
  4479627752990372, 4479799790834988, 4479967221347354, 4480130179013872, 4480288792238368, 4480443183654460,
  4480593470417939, 4480739764480586, 4480882172846772, 4481020797814010, 4481155737198612, 4481287084547452,
  4481414929336784, 4481539357158974, 4481660449897960, 4481778285894165, 4481892940099539, 4482004484223382,
  4482112986869492, 4482218513665204, 4482321127382802, 4482420888053758, 4482517853076245, 4482612077316275,
  4482703613202871, 4482792510817576, 4482878817978627, 4482962580320076, 4483043841366126, 4483122642600925,
  4483199023534056, 4483273021761922, 4483344673025224, 4483414011262724, 4483481068661428, 4483545875703378,
  4483608461209170, 4483668852378323, 4483727074826624, 4483783152620564, 4483837108308932, 4483888962951686,
  4483938736146144, 4483986446050596, 4484032109405372, 4484075741551420, 4484117356446452, 4484156966678662,
  4484194583478081, 4484230216725550, 4484263874959345, 4484295565379450, 4484325293849474, 4484353064896186,
  4484378881706674, 4484402746123075, 4484424658634833, 4484444618368474, 4484462623074794, 4484478669113436,
  4484492751434740, 4484504863558830, 4484514997551788, 4484523143998833, 4484529291974394, 4484533429008906,
  4484535541052219, 4484535612433424, 4484533625816926, 4484529562154580, 4484523400633636, 4484515118620291,
  4484504691598554, 4484492093104164, 4484477294653230, 4484460265665252, 4484440973380154, 4484419382768918,
  4484395456437370, 4484369154522621, 4484340434581640, 4484309251471359, 4484275557219678, 4484239300886654,
  4484200428415112, 4484158882469814, 4484114602264271, 4484067523374160, 4484017577536216, 4483964692431365,
  4483908791450714, 4483849793442887, 4483787612441036, 4483722157367660, 4483653331715198, 4483581033200083,
  4483505153387764, 4483425577285833, 4483342182902157, 4483254840764470, 4483163413397547, 4483067754753536,
  4482967709590562, 4482863112794072, 4482753788634692, 4482639549955636, 4482520197281720, 4482395517841076,
  4482265284489409, 4482129254525304, 4481987168383486, 4481838748191074, 4481683696169781, 4481521692864464,
  4481352395175570, 4481175434169564, 4480990412637506, 4480796902367134, 4480594441088331, 4480382529045225,
  4480160625140311, 4479928142586662, 4479684443993061, 4479428835793398, 4479160561915451, 4478878796564388,
  4478582635972392, 4478271088936406, 4477943065929958, 4477597366530538, 4477232664848704, 4476847492576192,
  4476440219183781, 4476009028690434, 4475551892286424, 4475066535915646, 4474550401693506, 4474000601739904,
  4473413862618200, 4472786458058295, 4472114126959004, 4471391972746494, 4470614338917719, 4469774653883156,
  4468865235838896, 4467877045039530, 4466799366045354, 4465619395558397, 4464321701199635, 4462887501169282,
  4461293691124341, 4459511507635972, 4457504658253067, 4455226650325010, 4452616884242348, 4449594783440798,
  4446050695647666, 4441831266659618, 4436714892174061, 4430368316897338, 4422264825074740, 4411517007702132,
  4396496531309976, 4373832704204284, 4335125104963628, 4251099761679434,
];
// prettier-ignore
const ZIG_WI = [
  8.683627060801306e-16, 4.779330175727737e-17, 6.354352417405262e-17, 7.454870481247696e-17,
  8.3293668157931e-17, 9.068060405059482e-17, 9.714860076567762e-17, 1.0294750314241019e-16,
  1.0823430288447684e-16, 1.131147019610903e-16, 1.176635945702292e-16, 1.2193617278714363e-16,
  1.2597439914637093e-16, 1.2981099886264032e-16, 1.3347203736824123e-16, 1.3697864842571203e-16,
  1.4034823001242382e-16, 1.4359529452056943e-16, 1.4673208742364422e-16, 1.4976904668391037e-16,
  1.5271515003596198e-16, 1.5557818169460764e-16, 1.5836494009290885e-16, 1.6108140175274928e-16,
  1.6373285203969853e-16, 1.6632399058420835e-16, 1.6885901708676596e-16, 1.713417017655966e-16,
  1.737754436586486e-16, 1.7616331923000996e-16, 1.7850812316976727e-16, 1.8081240285799152e-16,
  1.830784876482675e-16, 1.853085138861802e-16, 1.8750444639373882e-16, 1.896680970077476e-16,
  1.918011406483862e-16, 1.9390512930625104e-16, 1.9598150426628824e-16, 1.9803160683128174e-16,
  2.000566877627333e-16, 2.0205791562071654e-16, 2.0403638415480212e-16, 2.0599311887403706e-16,
  2.079290829041402e-16, 2.0984518222370352e-16, 2.1174227035760342e-16, 2.1362115259449868e-16,
  2.1548258978581458e-16, 2.1732730177564367e-16, 2.191559705042727e-16, 2.2096924282235318e-16,
  2.2276773304789553e-16, 2.2455202529414355e-16, 2.263226755928568e-16, 2.280802138345017e-16,
  2.2982514554424684e-16, 2.3155795351040804e-16, 2.3327909928004356e-16, 2.3498902453470955e-16,
  2.3668815235791604e-16, 2.3837688840454243e-16, 2.4005562198135063e-16, 2.4172472704675025e-16,
  2.433845631371103e-16, 2.4503547622614954e-16, 2.466777995232705e-16, 2.4831185421610877e-16,
  2.4993795016204524e-16, 2.515563865329658e-16, 2.5316745241713583e-16, 2.547714273816944e-16,
  2.563685819989397e-16, 2.579591783392867e-16, 2.5954347043351707e-16, 2.6112170470670194e-16,
  2.6269412038597256e-16, 2.6426094988411895e-16, 2.658224191608307e-16, 2.6737874806323633e-16,
  2.689301506472616e-16, 2.704768354811995e-16, 2.720190059327732e-16, 2.735568604408679e-16,
  2.7509059277301666e-16, 2.7662039226963903e-16, 2.781464440759544e-16, 2.79668929362423e-16,
  2.8118802553450207e-16, 2.827039064324479e-16, 2.842167425218406e-16, 2.8572670107546015e-16,
  2.87233946347098e-16, 2.887386397378482e-16, 2.9024093995538423e-16, 2.9174100316669455e-16,
  2.9323898314471816e-16, 2.947350314092935e-16, 2.9622929736280665e-16, 2.977219284209029e-16,
  2.992130701386013e-16, 3.007028663321331e-16, 3.0219145919680615e-16, 3.036789894211802e-16,
  3.051655962978219e-16, 3.0665141783089545e-16, 3.081365908408297e-16, 3.0962125106629225e-16,
  3.111055332636893e-16, 3.125895713043999e-16, 3.140734982699446e-16, 3.1555744654528006e-16,
  3.1704154791040285e-16, 3.1852593363044065e-16, 3.2001073454440114e-16, 3.214960811527447e-16,
  3.2298210370394156e-16, 3.244689322801698e-16, 3.2595669688230784e-16, 3.2744552751437067e-16,
  3.2893555426753697e-16, 3.3042690740391284e-16, 3.3191971744017523e-16, 3.3341411523123725e-16,
  3.3491023205407785e-16, 3.364081996918765e-16, 3.37908150518595e-16, 3.394102175841489e-16,
  3.409145347003126e-16, 3.424212365275018e-16, 3.4393045866258313e-16, 3.454423377278584e-16,
  3.4695701146137835e-16, 3.4847461880874137e-16, 3.499953000165381e-16, 3.5151919672760744e-16,
  3.53046452078274e-16, 3.5457721079774357e-16, 3.5611161930983884e-16, 3.5764982583726505e-16,
  3.59191980508603e-16, 3.6073823546823514e-16, 3.6228874498941915e-16, 3.6384366559073444e-16,
  3.65403156156137e-16, 3.669673780588701e-16, 3.685364952894914e-16, 3.7011067458828983e-16,
  3.716900855823823e-16, 3.7327490092779435e-16, 3.7486529645684887e-16, 3.7646145133120287e-16,
  3.7806354820089604e-16, 3.7967177336979443e-16, 3.8128631696783774e-16, 3.829073731305243e-16,
  3.8453514018609596e-16, 3.8616982085091493e-16, 3.878116224335587e-16, 3.894607570481926e-16,
  3.9111744183782054e-16, 3.9278189920805415e-16, 3.944543570720877e-16, 3.9613504910761354e-16,
  3.9782421502646826e-16, 3.995221008578565e-16, 4.012289592460629e-16, 4.029450497636328e-16,
  4.04670639241075e-16, 4.0640600211422504e-16, 4.0815142079049387e-16, 4.0990718603532664e-16,
  4.1167359738030257e-16, 4.134509635544236e-16, 4.1523960294026883e-16, 4.170398440568316e-16,
  4.1885202607101123e-16, 4.206764993399015e-16, 4.2251362598620494e-16, 4.243637805093078e-16,
  4.262273504347798e-16, 4.2810473700531167e-16, 4.2999635591638323e-16, 4.3190263810026294e-16,
  4.338240305622791e-16, 4.357609972736849e-16, 4.3771402012585875e-16, 4.3968359995105214e-16,
  4.4167025761542035e-16, 4.4367453519065673e-16, 4.456969972112043e-16, 4.477382320247534e-16,
  4.49798853244555e-16, 4.518795013130059e-16, 4.539808451870034e-16, 4.561035841567422e-16,
  4.582484498109567e-16, 4.604162081631153e-16, 4.626076619547846e-16, 4.648236531543207e-16,
  4.670650656712631e-16, 4.693328283093329e-16, 4.716279179838351e-16, 4.739513632325867e-16,
  4.763042480533137e-16, 4.786877161048723e-16, 4.811029753147417e-16, 4.835513029411525e-16,
  4.860340511450812e-16, 4.885526531353603e-16, 4.91108629959527e-16, 4.937035980240335e-16,
  4.963392774403987e-16, 4.990175013091822e-16, 5.017402260718089e-16, 5.045095430818727e-16,
  5.073276915733542e-16, 5.101970732341562e-16, 5.131202686306784e-16, 5.161000557743228e-16,
  5.191394311757699e-16, 5.222416338000234e-16, 5.254101724177597e-16, 5.286488569504945e-16,
  5.3196183453384e-16, 5.353536311816497e-16, 5.388292001334053e-16, 5.423939782201712e-16,
  5.46053951907478e-16, 5.498157350892814e-16, 5.536866612467876e-16, 5.576748932926576e-16,
  5.617895553555417e-16, 5.660408920082422e-16, 5.704404621291389e-16, 5.750013768919895e-16,
  5.797385945724594e-16, 5.846692893455479e-16, 5.898133176477899e-16, 5.951938149641444e-16,
  6.008379696271908e-16, 6.067780409333449e-16, 6.130527208725282e-16, 6.197089894581626e-16,
  6.268046963301284e-16, 6.344122407127506e-16, 6.426239659548055e-16, 6.515603317344994e-16,
  6.613827885097664e-16, 6.723150462505587e-16, 6.846803417564259e-16, 6.98971833638762e-16,
  7.159994934830664e-16, 7.372424301798799e-16, 7.658936370805573e-16, 8.113849337656484e-16,
];
// prettier-ignore
const ZIG_FI = [
  1.0, 0.9771017012676716, 0.9598790918001067, 0.9451989534422996,
  0.9320600759592305, 0.919991505039347, 0.9087264400521309, 0.8980959218983434,
  0.8879846607558334, 0.8783096558089174, 0.869008688036857, 0.8600336211963315,
  0.851346258458678, 0.8429156531122042, 0.8347162929868834, 0.8267268339462214,
  0.8189291916037024, 0.8113078743126563, 0.8038494831709643, 0.796542330422959,
  0.7893761435660246, 0.7823418326548025, 0.7754313049811872, 0.7686373157984863,
  0.7619533468367954, 0.7553735065070961, 0.7488924472191568, 0.742505296340151,
  0.7362075981268627, 0.7299952645614762, 0.7238645334686302, 0.717811932630722,
  0.7118342488782484, 0.7059285013327543, 0.7000919181365116, 0.6943219161261167,
  0.6886160830046718, 0.6829721616449949, 0.6773880362187735, 0.6718617198970821,
  0.6663913439087501, 0.6609751477766631, 0.6556114705796973, 0.6502987431108167,
  0.6450354808208223, 0.6398202774530566, 0.6346517992876236, 0.6295287799248367,
  0.6244500155470265, 0.6194143606058343, 0.6144207238889139, 0.6094680649257734,
  0.6045553906974678, 0.5996817526191253, 0.5948462437679874, 0.590047996332826,
  0.5852861792633715, 0.5805599961007909, 0.5758686829723537, 0.5712115067352532,
  0.5665877632561644, 0.5619967758145243, 0.557437893618766, 0.5529104904258323,
  0.5484139632552658, 0.5439477311900263, 0.5395112342569521, 0.5351039323804576,
  0.5307253044036621, 0.5263748471716845, 0.5220520746723218, 0.5177565172297564,
  0.513487720747327, 0.5092452459957479, 0.5050286679434681, 0.5008375751261487,
  0.4966715690524897, 0.49253026364386854, 0.48841328470545803, 0.4843202694266833,
  0.48025086590904675, 0.47620473271950586, 0.4721815384677302, 0.4681809614056936,
  0.46420268904817436, 0.46024641781284287, 0.45631185267871643, 0.4523987068618485,
  0.44850670150720306, 0.4446355653957394, 0.440785034665804, 0.43695485254798555,
  0.43314476911265226, 0.4293545410294414, 0.42558393133802197, 0.4218327092294959,
  0.4181006498378482, 0.4143875340408911, 0.41069314827018816, 0.40701728432947337,
  0.4033597392211145, 0.3997203149801972, 0.39609881851583245, 0.3924950614593156,
  0.3889088600187887, 0.3853400348400773, 0.38178841087339366, 0.3782538172456192,
  0.37473608713789114, 0.3712350576682395, 0.3677505697790326, 0.36428246812900406,
  0.36083060098964803, 0.3573948201457805, 0.3539749808000768, 0.3505709414814061,
  0.34718256395679364, 0.3438097131468507, 0.34045225704452187, 0.33711006663700605,
  0.33378301583071845, 0.3304709813791636, 0.3271738428136014, 0.3238914823763911,
  0.32062378495690536, 0.3173706380299136, 0.3141319315963372, 0.3109075581262865,
  0.30769741250429206, 0.30450139197665, 0.30131939610080305, 0.2981513266966855,
  0.2949970877999618, 0.2918565856170952, 0.2887297284821829, 0.28561642681550176,
  0.2825165930837076, 0.27943014176163794, 0.2763569892956683, 0.27329705406857707,
  0.27025025636587546, 0.26721651834356147, 0.2641957639972612, 0.2611879191327212,
  0.25819291133761924, 0.25521066995466196, 0.2522411260559422, 0.24928421241852852,
  0.24633986350126383, 0.2434080154227503, 0.2404886059405006, 0.2375815744312381,
  0.23468686187233, 0.23180441082433872, 0.22893416541468034, 0.22607607132238028,
  0.22323007576391748, 0.220396127480152, 0.21757417672433113, 0.21476417525117358,
  0.21196607630703018, 0.20917983462112508, 0.2064054063978808, 0.2036427493103349,
  0.2008918224946566, 0.19815258654577514, 0.1954250035141343, 0.19270903690358918,
  0.19000465167046499, 0.1873118142238003, 0.18463049242679927, 0.18196065559952251,
  0.17930227452284758, 0.17665532144373486, 0.17401977008183855, 0.17139559563750575,
  0.1687827748012113, 0.1661812857644819, 0.16359110823236558, 0.161012223437511,
  0.15844461415592428, 0.1558882647244792, 0.15334316106026286, 0.15080929068184568,
  0.14828664273257455, 0.14577520800599403, 0.14327497897351346, 0.1407859498144447,
  0.13830811644855073, 0.13584147657125376, 0.13338602969166916, 0.13094177717364436,
  0.12850872227999957, 0.1260868702201859, 0.12367622820159657, 0.1212768054847903,
  0.11888861344291006, 0.11651166562561087, 0.11414597782783849, 0.11179156816383809,
  0.1094484571468118, 0.1071166677746838, 0.10479622562248707, 0.10248715894193525,
  0.10018949876881002, 0.09790327903886246, 0.095628536713009, 0.09336531191269101,
  0.09111364806637376, 0.08887359206827589, 0.08664519445055807, 0.08442850957035347,
  0.0822235958132029, 0.08003051581466307, 0.07784933670209612, 0.07568013035892718,
  0.07352297371398132, 0.0713779490588904, 0.06924514439700676, 0.0671246538277885,
  0.0650165779712429, 0.06292102443775814, 0.06083810834953988, 0.05876795292093374,
  0.0567106901062029, 0.05466646132488892, 0.05263541827679219, 0.05061772386094778,
  0.04861355321586854, 0.04662309490193038, 0.044646552251294463, 0.04268414491647446,
  0.04073611065594094, 0.03880270740452615, 0.036884215688567305, 0.034980941461716125,
  0.03309321945857858, 0.0312214171919203, 0.02936593975813336, 0.027527235669603113,
  0.02570580400854891, 0.02390220330579588, 0.02211706270730885, 0.02035109623004451,
  0.018605121275724622, 0.016880083152543142, 0.01517708830793531, 0.013497450601739867,
  0.011842757857907879, 0.010214971439701459, 0.008616582769398726, 0.007050875471373222,
  0.0055224032992509916, 0.0040379725933630236, 0.0026090727461021593, 0.001260285930498598,
];

const M128 = (1n << 128n) - 1n;
const M64 = (1n << 64n) - 1n;
const PCG_MULT = 0x2360ed051fc65da44385df649fccf645n;

/** numpy.random.SeedSequence(entropy).generate_state(4, uint64) */
function seedSequenceState(entropy: bigint[]): bigint[] {
  const ent: number[] = [];
  for (const e0 of entropy) {
    let e = e0;
    do {
      ent.push(Number(e & 0xffffffffn));
      e >>= 32n;
    } while (e > 0n);
  }
  let hc = 0x43b0d7e5;
  const hashmix = (v: number) => {
    v = (v ^ hc) >>> 0;
    hc = Math.imul(hc, 0x931e8875) >>> 0;
    v = Math.imul(v, hc) >>> 0;
    return (v ^ (v >>> 16)) >>> 0;
  };
  const mix = (x: number, y: number) => {
    const r = (Math.imul(0xca01f9dd, x) - Math.imul(0x4973f715, y)) >>> 0;
    return (r ^ (r >>> 16)) >>> 0;
  };
  const pool = [0, 0, 0, 0];
  for (let i = 0; i < 4; i++) pool[i] = hashmix(i < ent.length ? ent[i] : 0);
  for (let s = 0; s < 4; s++) for (let d = 0; d < 4; d++) if (s !== d) pool[d] = mix(pool[d], hashmix(pool[s]));
  for (let s = 4; s < ent.length; s++) for (let d = 0; d < 4; d++) pool[d] = mix(pool[d], hashmix(ent[s]));
  let h = 0x8b51f9dd;
  const words: number[] = [];
  for (let i = 0; i < 8; i++) {
    let v = (pool[i % 4] ^ h) >>> 0;
    h = Math.imul(h, 0x58f38ded) >>> 0;
    v = Math.imul(v, h) >>> 0;
    words.push((v ^ (v >>> 16)) >>> 0);
  }
  return [0, 1, 2, 3].map((i) => BigInt(words[2 * i]) | (BigInt(words[2 * i + 1]) << 32n));
}

export class PCG64 {
  state = 0n;
  inc = 0n;
  hasU32 = false;
  u32 = 0;
  constructor(entropy: bigint[]) {
    const v = seedSequenceState(entropy);
    const s = (v[0] << 64n) | v[1], i = (v[2] << 64n) | v[3];
    this.inc = ((i << 1n) | 1n) & M128;
    this.state = 0n;
    this.step();
    this.state = (this.state + s) & M128;
    this.step();
  }
  private step() {
    this.state = (this.state * PCG_MULT + this.inc) & M128;
  }
  next64(): bigint {
    this.step();
    const st = this.state;
    const x = ((st >> 64n) ^ st) & M64;
    const rot = st >> 122n;
    return ((x >> rot) | (x << ((64n - rot) & 63n))) & M64;
  }
  next32(): number {
    if (this.hasU32) {
      this.hasU32 = false;
      return this.u32;
    }
    const n = this.next64();
    this.hasU32 = true;
    this.u32 = Number(n >> 32n);
    return Number(n & 0xffffffffn);
  }
  double(): number {
    return Number(this.next64() >> 11n) * (1.0 / 9007199254740992.0);
  }
  /** random_interval: masked rejection in [0, max] */
  interval(max: number): number {
    if (max === 0) return 0;
    if (max <= 0xffffffff) {
      let mask = max;
      mask |= mask >>> 1;
      mask |= mask >>> 2;
      mask |= mask >>> 4;
      mask |= mask >>> 8;
      mask |= mask >>> 16;
      mask >>>= 0;
      let v: number;
      while ((v = (this.next32() & mask) >>> 0) > max);
      return v;
    }
    const M = BigInt(max);
    let mask = M;
    for (const s of [1n, 2n, 4n, 8n, 16n, 32n]) mask |= mask >> s;
    let v: bigint;
    while ((v = this.next64() & mask) > M);
    return Number(v);
  }
  /** Lemire bounded integer in [0, rng] (numpy Generator.integers) */
  lemire(rng: number): number {
    if (rng === 0) return 0;
    if (rng < 0xffffffff) {
      const excl = rng + 1;
      let m = BigInt(this.next32()) * BigInt(excl);
      let left = Number(m & 0xffffffffn);
      if (left < excl) {
        const threshold = (0xffffffff - rng) % excl;
        while (left < threshold) {
          m = BigInt(this.next32()) * BigInt(excl);
          left = Number(m & 0xffffffffn);
        }
      }
      return Number(m >> 32n);
    }
    if (rng === 0xffffffff) return this.next32();
    const excl = BigInt(rng) + 1n;
    let m = this.next64() * excl;
    let left = m & M64;
    if (left < excl) {
      const threshold = (M64 - BigInt(rng)) % excl;
      while (left < threshold) {
        m = this.next64() * excl;
        left = m & M64;
      }
    }
    return Number(m >> 64n);
  }
  normal(): number {
    for (;;) {
      let r = this.next64();
      const idx = Number(r & 0xffn);
      r >>= 8n;
      const sign = Number(r & 1n);
      const rabs = Number((r >> 1n) & 0x000fffffffffffffn);
      let x = rabs * ZIG_WI[idx];
      if (sign) x = -x;
      if (rabs < ZIG_KI[idx]) return x;
      if (idx === 0) {
        for (;;) {
          const xx = -0.27366123732975827 * log1pCR(-this.double());
          const yy = -log1pCR(-this.double());
          if (yy + yy > xx * xx) return Math.floor(rabs / 256) % 2 ? -(3.654152885361009 + xx) : 3.654152885361009 + xx;
        }
      }
      if ((ZIG_FI[idx - 1] - ZIG_FI[idx]) * this.double() + ZIG_FI[idx] < expCR(-0.5 * x * x)) return x;
    }
  }
}

function makeGenerator(I: Interp, cls: PyClass, g: PCG64): PyInstance {
  const inst = new PyInstance(cls);
  const f = (name: string, impl: NpFn) => inst.attrs.set(name, new PyBuiltin(name, (a, kw) => impl(I, a, kw)));
  const fillN = (shape: number[] | null, gen: () => number, dt: DType = 'float64'): PyVal => {
    if (shape === null) return dt === 'int64' ? new NPScalar(gen(), 'int64') : gen();
    const n = prod(shape);
    const out = new Float64Array(n);
    for (let i = 0; i < n; i++) out[i] = gen();
    return mk(out, shape, dt);
  };
  const cont = (args: PyVal[], size: PyVal | undefined, gen: (...p: number[]) => number): PyVal => {
    const arrs = args.map((x) => toArr(I, x, 'float64'));
    const shapeS = sizeArg(I, size);
    if (arrs.every((x) => x.ndim === 0)) {
      const ps = arrs.map((x) => x.data[x.offset]);
      return fillN(shapeS, () => gen(...ps));
    }
    const shape = shapeS ?? broadcastShapes(I, arrs.map((x) => x.shape));
    const fl = arrs.map((x) => flat(broadcastTo(I, x, shape)));
    const out = new Float64Array(prod(shape));
    for (let i = 0; i < out.length; i++) out[i] = gen(...fl.map((x) => x[i]));
    return mk(out, shape, 'float64');
  };
  f('random', (I, a, kw) => {
    const A = parseArgs(I, 'random', a, kw, ['size=', 'dtype=', 'out=']);
    return fillN(sizeArg(I, A.size), () => g.double());
  });
  f('standard_normal', (I, a, kw) => {
    const A = parseArgs(I, 'standard_normal', a, kw, ['size=', 'dtype=', 'out=']);
    return fillN(sizeArg(I, A.size), () => g.normal());
  });
  f('normal', (I, a, kw) => {
    const A = parseArgs(I, 'normal', a, kw, ['loc=', 'scale=', 'size=']);
    const scale = A.scale ?? 1.0;
    if (flat(toArr(I, scale, 'float64')).some((v) => v < 0)) I.raise('ValueError', 'scale < 0');
    return cont([A.loc ?? 0.0, scale], A.size, (loc, sc) => loc + sc * g.normal());
  });
  f('uniform', (I, a, kw) => {
    const A = parseArgs(I, 'uniform', a, kw, ['low=', 'high=', 'size=']);
    const lo = toArr(I, A.low ?? 0.0, 'float64'), hi = toArr(I, A.high ?? 1.0, 'float64');
    const range = binUfunc(I, 'subtract', hi, lo);
    return cont([lo, range], A.size, (l, r) => l + r * g.double());
  });
  const integers = (I: Interp, a: PyVal[], kw: Map<string, PyVal>): PyVal => {
    const A = parseArgs(I, 'integers', a, kw, ['low', 'high=', 'size=', 'dtype=', 'endpoint=']);
    let low: number, high: number;
    const endpoint = toBool(I, A.endpoint);
    if (A.high === undefined || A.high === null) {
      low = 0;
      high = toInt(I, A.low!);
    } else {
      low = toInt(I, A.low!);
      high = toInt(I, A.high);
    }
    if (!endpoint) high -= 1;
    if (high < low) I.raise('ValueError', endpoint ? 'low > high' : 'low >= high');
    const dt = dtypeArg(I, A.dtype) ?? 'int64';
    const rng = high - low;
    return fillN(sizeArg(I, A.size), () => low + g.lemire(rng), dt);
  };
  f('integers', integers);
  const shuffleArr = (x: PyVal) => {
    if (x instanceof NDArray) {
      const n = x.shape[0];
      if (x.ndim === 1) {
        const st = x.strides[0], D = x.data, o = x.offset;
        for (let i = n - 1; i > 0; i--) {
          const j = g.interval(i);
          const t = D[o + j * st];
          D[o + j * st] = D[o + i * st];
          D[o + i * st] = t;
        }
        return;
      }
      for (let i = n - 1; i > 0; i--) {
        const j = g.interval(i);
        if (i === j) continue;
        const ri = axis0(x, i) as NDArray, rj = axis0(x, j) as NDArray;
        const buf = new Float64Array(flat(rj));
        writeFlat(rj, new Float64Array(flat(ri)));
        writeFlat(ri, buf);
      }
      return;
    }
    if (x instanceof PyList) {
      for (let i = x.items.length - 1; i > 0; i--) {
        const j = g.interval(i);
        [x.items[i], x.items[j]] = [x.items[j], x.items[i]];
      }
      return;
    }
    I.raise('TypeError', `object of type '${typeNameOf(x)}' has no len()`);
  };
  f('shuffle', (I, a) => {
    shuffleArr(a[0]);
    return null;
  });
  const permutation = (I: Interp, x: PyVal): NDArray => {
    if (typeof x === 'bigint' || (x instanceof NPScalar && x.dtype === 'int64')) {
      const n = toInt(I, x);
      const arr = mk(Float64Array.from({ length: n }, (_, i) => i), [n], 'int64');
      shuffleArr(arr);
      return arr;
    }
    const arr = copyArr(toArr(I, x));
    if (arr.ndim < 1) I.raise('IndexError', 'x must be an integer or at least 1-dimensional');
    if (arr.ndim === 1) {
      shuffleArr(arr);
      return arr;
    }
    const idx = mk(Float64Array.from({ length: arr.shape[0] }, (_, i) => i), [arr.shape[0]], 'int64');
    shuffleArr(idx);
    return npGetItem(I, arr, idx) as NDArray;
  };
  f('permutation', (I, a) => permutation(I, a[0]));
  f('choice', (I, a, kw) => {
    const A = parseArgs(I, 'choice', a, kw, ['a', 'size=', 'replace=', 'p=', 'axis=', 'shuffle=']);
    const src = toArr(I, A.a!);
    let pop = 0;
    if (src.ndim === 0) {
      if (!isIntLike(src.dtype)) I.raise('ValueError', 'a must be a sequence or an integer, not <class \'float\'>');
      pop = src.data[src.offset];
      if (pop <= 0) I.raise('ValueError', 'a must be a positive integer unless no samples are taken');
    } else {
      if (A.axis !== undefined && A.axis !== null && toInt(I, A.axis) !== 0) unsupported(I, 'Generator.choice(axis=...)');
      pop = src.shape[0];
      if (pop === 0) I.raise('ValueError', "a cannot be empty unless no samples are taken");
    }
    let p: Float64Array | null = null;
    if (A.p !== undefined && A.p !== null) {
      p = new Float64Array(flat(toArr(I, A.p, 'float64')));
      if (p.length !== pop) I.raise('ValueError', "a and p must have same size");
      if (p.some((v) => v < 0)) I.raise('ValueError', 'probabilities are not non-negative');
      let s = 0, c = 0;
      for (const v of p) {
        const y = v - c;
        const t = s + y;
        c = t - s - y;
        s = t;
      }
      if (Math.abs(s - 1) > Math.sqrt(2.220446049250313e-16)) I.raise('ValueError', 'probabilities do not sum to 1');
    }
    const shape = sizeArg(I, A.size);
    const size = shape === null ? 1 : prod(shape);
    const replace = toBool(I, A.replace, true);
    const doShuffle = toBool(I, A.shuffle, true);
    let idx: Float64Array;
    const cdfOf = (pp: Float64Array) => {
      const cdf = new Float64Array(pp.length);
      let acc = 0;
      for (let i = 0; i < pp.length; i++) cdf[i] = acc += pp[i];
      const last = cdf[cdf.length - 1];
      for (let i = 0; i < cdf.length; i++) cdf[i] /= last;
      return mk(cdf, [cdf.length], 'float64');
    };
    if (replace) {
      if (p) {
        const u = mk(Float64Array.from({ length: size }, () => g.double()), [size], 'float64');
        idx = searchsorted(cdfOf(p), u, true).data;
      } else idx = Float64Array.from({ length: size }, () => g.lemire(pop - 1));
    } else {
      if (size > pop) I.raise('ValueError', "Cannot take a larger sample than population when replace is False");
      if (p) {
        if (p.filter((v) => v > 0).length < size) I.raise('ValueError', 'Fewer non-zero entries in p than size');
        const pp = new Float64Array(p);
        const found: number[] = [];
        while (found.length < size) {
          const x = Float64Array.from({ length: size - found.length }, () => g.double());
          for (const fi of found) pp[fi] = 0;
          const nw = flat(searchsorted(cdfOf(pp), mk(x, [x.length], 'float64'), true));
          const seen = new Map<number, number>();
          nw.forEach((v, i) => {
            if (!seen.has(v)) seen.set(v, i);
          });
          const firsts = [...seen.values()].sort((u, v) => u - v);
          for (const i of firsts) found.push(nw[i]);
        }
        idx = Float64Array.from(found);
      } else if (pop > 10000 && size > Math.floor(pop / (doShuffle ? 50 : 20))) {
        const all = Float64Array.from({ length: pop }, (_, i) => i);
        const first = Math.max(pop - size, 1);
        for (let i = pop - 1; i >= first; i--) {
          const j = g.lemire(i);
          const t = all[j];
          all[j] = all[i];
          all[i] = t;
        }
        idx = all.slice(pop - size);
      } else {
        let setSize = Math.floor(1.2 * size);
        let mask = setSize;
        for (const sh of [1, 2, 4, 8, 16]) mask |= mask >>> sh;
        setSize = mask + 1;
        const hash = new Float64Array(setSize).fill(-1);
        idx = new Float64Array(size);
        for (let j = pop - size; j < pop; j++) {
          const val = g.lemire(j);
          let loc = val & mask;
          while (hash[loc] !== -1 && hash[loc] !== val) loc = (loc + 1) & mask;
          if (hash[loc] === -1) {
            hash[loc] = val;
            idx[j - pop + size] = val;
          } else {
            loc = j & mask;
            while (hash[loc] !== -1) loc = (loc + 1) & mask;
            hash[loc] = j;
            idx[j - pop + size] = j;
          }
        }
        if (doShuffle)
          for (let i = size - 1; i >= 1; i--) {
            const j = g.lemire(i);
            const t = idx[j];
            idx[j] = idx[i];
            idx[i] = t;
          }
      }
    }
    const idxArr = mk(idx, shape ?? [], 'int64');
    if (src.ndim === 0) return shape === null ? BigInt(idx[0]) : idxArr;
    if (shape === null) return npGetItem(I, src, BigInt(idx[0]));
    return npGetItem(I, src, idxArr);
  });
  for (const n of ['exponential', 'binomial', 'poisson', 'beta', 'gamma', 'multivariate_normal', 'standard_exponential', 'bytes', 'spawn'])
    f(n, (I) => unsupported(I, `Generator.${n}`));
  return inst;
}

// =====================================================================
//  ndarray attributes and methods
// =====================================================================

type Method = (I: Interp, self: NDArray, a: PyVal[], kw: Map<string, PyVal>) => PyVal;

function toList(a: NDArray): PyVal {
  const vals = flat(a);
  const st = cStrides(a.shape);
  const rec = (d: number, off: number): PyVal => {
    if (d === a.ndim) return pyOf(vals[off], a.dtype);
    const items: PyVal[] = [];
    for (let i = 0; i < a.shape[d]; i++) items.push(rec(d + 1, off + i * st[d]));
    return new PyList(items);
  };
  return rec(0, 0);
}

const withSelf = (fn: NpFn): Method => (I, s, a, kw) => fn(I, [s, ...a], kw);

const METHODS: Record<string, Method> = {
  reshape: (I, s, a, kw) => {
    if (!a.length && kw.has('shape')) return reshape(I, s, shapeFromArgs(I, [kw.get('shape')!]));
    return reshape(I, s, shapeFromArgs(I, a));
  },
  flatten: (I, s) => mk(new Float64Array(flat(s)), [s.size], s.dtype),
  ravel: (I, s) => reshapeView(s, [s.size]),
  transpose: (I, s, a) => transpose(I, s, a.length === 0 || (a.length === 1 && a[0] === null) ? null : shapeFromArgs(I, a)),
  swapaxes: (I, s, a) => swapaxes(I, s, toInt(I, a[0]), toInt(I, a[1])),
  squeeze: (I, s, a, kw) => squeeze(I, s, a[0] ?? kw.get('axis')),
  copy: (I, s) => copyArr(s),
  view: (I, s) => new NDArray(s.data, [...s.shape], [...s.strides], s.offset, s.dtype),
  astype: (I, s, a, kw) => {
    const dt = dtypeArg(I, a[0] ?? kw.get('dtype'));
    if (!dt) I.raise('TypeError', "astype() missing required argument 'dtype' (pos 1)");
    return copyArr(s, dt);
  },
  tolist: (I, s) => toList(s),
  item: (I, s, a) => {
    if (a.length) {
      const f = flat(s);
      if (a.length === 1) {
        let i = toInt(I, a[0]);
        if (i < 0) i += f.length;
        if (i < 0 || i >= f.length) I.raise('IndexError', `index ${toInt(I, a[0])} is out of bounds for size ${f.length}`);
        return pyOf(f[i], s.dtype);
      }
      const v = npGetItem(I, s, new PyTuple(a));
      return v instanceof NPScalar ? npToPy(v) : v;
    }
    if (s.size !== 1) I.raise('ValueError', 'can only convert an array of size 1 to a Python scalar');
    return pyOf(flat(s)[0], s.dtype);
  },
  fill: (I, s, a) => {
    assignInto(I, s, a[0]);
    return null;
  },
  sum: withSelf((I, a, kw) => rSum(I, a, kw)),
  mean: withSelf(F.mean),
  std: withSelf(F.std),
  var: withSelf(F.var),
  prod: withSelf(F.prod),
  max: withSelf(F.max),
  min: withSelf(F.min),
  argmax: withSelf(F.argmax),
  argmin: withSelf(F.argmin),
  all: withSelf(F.all),
  any: withSelf(F.any),
  cumsum: withSelf(F.cumsum),
  cumprod: withSelf(F.cumprod),
  round: (I, s, a, kw) => wrap(roundArr(s, a.length || kw.has('decimals') ? toInt(I, a[0] ?? kw.get('decimals')!) : 0)),
  clip: (I, s, a, kw) => wrap(clipArr(I, s, a[0] ?? kw.get('min') ?? kw.get('a_min'), a[1] ?? kw.get('max') ?? kw.get('a_max'))),
  dot: (I, s, a) => wrap(dot(I, s, toArr(I, a[0]))),
  nonzero: withSelf(F.nonzero),
  diagonal: withSelf(F.diagonal),
  trace: withSelf(F.trace),
  take: withSelf(F.take),
  repeat: withSelf(F.repeat),
  argsort: withSelf(F.argsort),
  searchsorted: withSelf(F.searchsorted),
  conj: (I, s) => copyArr(s),
  conjugate: (I, s) => copyArr(s),
  sort: (I, s, a, kw) => {
    const ax = a[0] ?? kw.get('axis');
    if (s.ndim === 0) I.raise('ValueError', 'Cannot sort a 0-d array');
    const axis = ax === undefined ? s.ndim - 1 : normAxis(I, toInt(I, ax), s.ndim);
    writeFlat(s, flat(sortedCopy(s, axis)));
    return null;
  },
  __len__: (I, s) => npLen(I, s),
};

const scalarClassName = (dt: DType) => (dt === 'bool' ? 'bool' : dt);

export function npGetAttr(I: Interp, o: NDArray | NPScalar | NPDtype, name: string): PyVal {
  if (o instanceof NPDtype) {
    switch (name) {
      case 'name':
        return o.name;
      case 'kind':
        return { float64: 'f', int64: 'i', bool: 'b', complex128: 'c' }[o.name];
      case 'char':
        return { float64: 'd', int64: 'l', bool: '?', complex128: 'D' }[o.name];
      case 'itemsize':
        return o.name === 'bool' ? 1n : o.name === 'complex128' ? 16n : 8n;
      case 'type':
        return S(I).cls[scalarClassName(o.name)];
      case 'str':
        return { float64: '<f8', int64: '<i8', bool: '|b1', complex128: '<c16' }[o.name];
    }
    I.raise('AttributeError', `'numpy.dtypes.${o.name === 'bool' ? 'Bool' : o.name === 'int64' ? 'Int64' : 'Float64'}DType' object has no attribute '${name}'`);
  }
  if (o instanceof NPScalar) {
    switch (name) {
      case 'item':
        return new PyBuiltin('item', () => npToPy(o));
      case 'tolist':
        return new PyBuiltin('tolist', () => npToPy(o));
      case 'is_integer':
        if (o.dtype === 'float64') return new PyBuiltin('is_integer', () => Number.isInteger(o.v));
        break;
      case 'real':
        return o.dtype === 'complex128' ? new NPScalar(o.v, 'float64') : o;
      case 'imag':
        return new NPScalar(0, o.dtype === 'complex128' ? 'float64' : o.dtype);
      case 'dtype':
        return new NPDtype(o.dtype);
    }
    const arr = mk(new Float64Array([o.v]), [], o.dtype);
    if (name in METHODS || ['shape', 'ndim', 'size', 'T', 'itemsize', 'nbytes', 'strides'].includes(name)) {
      const r = npGetAttr(I, arr, name);
      if (r instanceof PyBuiltin) return new PyBuiltin(name, function* (a, kw) {
        const v = yield* I.call(r, a, kw);
        return v instanceof NDArray ? wrap(v) : v;
      });
      return r instanceof NDArray ? wrap(r) : r;
    }
    I.raise('AttributeError', `'numpy.${o.dtype}' object has no attribute '${name}'`);
  }
  const a = o;
  switch (name) {
    case 'shape':
      return new PyTuple(a.shape.map((s) => BigInt(s)));
    case 'ndim':
      return BigInt(a.ndim);
    case 'size':
      return BigInt(a.size);
    case 'dtype':
      return new NPDtype(a.dtype);
    case 'T':
      return transpose(I, a, null);
    case 'mT':
      return swapaxes(I, a, -1, -2);
    case 'itemsize':
      return a.dtype === 'bool' ? 1n : 8n;
    case 'nbytes':
      return BigInt(a.size * (a.dtype === 'bool' ? 1 : 8));
    case 'strides':
      return new PyTuple(a.strides.map((s) => BigInt(s * (a.dtype === 'bool' ? 1 : 8))));
    case 'real':
      return a.dtype === 'complex128' ? copyArr(a, 'float64') : a;
    case 'imag':
      return zerosArr([...a.shape], a.dtype === 'complex128' ? 'float64' : a.dtype);
    case 'flat': {
      const vals = flat(a);
      let i = 0;
      return new PyIter('numpy.flatiter', () => (i < vals.length ? scalarOut(vals[i++], a.dtype) : STOP));
    }
    case 'base':
      return null;
  }
  const m = METHODS[name];
  if (m) return new PyBuiltin(name, (args, kw) => m(I, a, args, kw), a);
  I.raise('AttributeError', `'numpy.ndarray' object has no attribute '${name}'`);
}

export function npSetAttr(I: Interp, a: NDArray, name: string, v: PyVal): void {
  if (name === 'shape') {
    const s = resolveShape(I, a.size, shapeArg(I, v));
    if (!isC(a)) I.raise('AttributeError', 'Incompatible shape for in-place modification. Use `.reshape()` to make a copy with the desired shape.');
    a.shape = s;
    a.strides = cStrides(s);
    return;
  }
  if (['ndim', 'size', 'dtype', 'T', 'itemsize', 'nbytes', 'strides', 'flat'].includes(name) || name in METHODS)
    I.raise('AttributeError', `attribute '${name}' of 'numpy.ndarray' objects is not writable`);
  I.raise('AttributeError', `'numpy.ndarray' object has no attribute '${name}' and no __dict__ for setting new attributes`);
}

// ---------------- other interpreter hooks ----------------

export function npRepr(I: Interp, v: NDArray | NPScalar | NPDtype): string {
  if (v instanceof NPDtype) return `dtype('${v.name}')`;
  if (v instanceof NPScalar) return scalarRepr(I, v);
  return arrayRepr(I, v);
}
export function npStr(I: Interp, v: NDArray | NPScalar | NPDtype): string {
  if (v instanceof NPDtype) return v.name;
  if (v instanceof NPScalar) return scalarStr(v);
  return arrayStr(I, v);
}
export function npFormat(I: Interp, v: NDArray | NPScalar | NPDtype, spec: string): string | PyVal {
  if (v instanceof NPScalar) return npToPy(v); // let the caller format the Python value
  if (!spec) return npStr(I, v);
  I.raise('TypeError', `unsupported format string passed to ${v instanceof NDArray ? 'numpy.ndarray' : 'numpy.dtype'}.__format__`);
}
export function npClassOf(I: Interp, v: PyObj): PyClass | null {
  const st = npStates.get(I);
  if (!st) return null;
  if (v instanceof NDArray) return st.cls.ndarray;
  if (v instanceof NPScalar) return st.cls[v.half ? 'float16' : scalarClassName(v.dtype)];
  if (v instanceof NPDtype) return st.cls['dt_' + v.name];
  return null;
}
export function npEq(I: Interp, a: PyVal, b: PyVal): boolean | undefined {
  if (a instanceof NPDtype || b instanceof NPDtype) {
    const r = (x: PyVal) => {
      try {
        return dtypeArg(I, x);
      } catch {
        return undefined;
      }
    };
    const x = r(a), y = r(b);
    return x !== undefined && x === y;
  }
  if (a instanceof NPScalar || b instanceof NPScalar) {
    const x = a instanceof NPScalar ? a.v : pyNumKind(a) ? pyNum(a) : undefined;
    const y = b instanceof NPScalar ? b.v : pyNumKind(b) ? pyNum(b) : undefined;
    if (x === undefined || y === undefined) return false;
    return x === y;
  }
  return undefined;
}
export function npHashKey(v: NPScalar | NDArray | NPDtype): string {
  if (v instanceof NDArray) throw new TypeError("unhashable type: 'numpy.ndarray'");
  if (v instanceof NPDtype) return 'dt:' + v.name;
  const x = v.v;
  return Number.isInteger(x) && Math.abs(x) < 1e21 ? 'i:' + BigInt(x).toString() : 'f:' + String(x);
}
export function npRound(I: Interp, v: NDArray | NPScalar, nd: PyVal | undefined): PyVal {
  if (v instanceof NPScalar && (nd === undefined || nd === null)) {
    if (isIntLike(v.dtype)) return BigInt(v.v);
    if (!isFinite(v.v)) I.raise(v.v !== v.v ? 'ValueError' : 'OverflowError', v.v !== v.v ? 'cannot convert float NaN to integer' : 'cannot convert float infinity to integer');
    return BigInt(rint(v.v));
  }
  return wrap(roundArr(toArr(I, v), nd === undefined || nd === null ? 0 : toInt(I, nd)));
}
export function npAbs(I: Interp, v: NDArray | NPScalar): PyVal {
  return wrap(unaryUfunc(I, 'absolute', toArr(I, v)));
}
export function npCopy(v: NDArray): NDArray {
  return copyArr(v);
}

// =====================================================================
//  module construction
// =====================================================================

function makeClass(I: Interp, name: string, bases: PyClass[], module: string, ctor?: BuiltinImpl, builtin: string | null = name): PyClass {
  const c = new PyClass(name, bases, new Map(), builtin);
  (c as PyClass & { module?: string }).module = module;
  if (ctor) c.dict.set('__new_builtin__', new PyBuiltin(name, ctor));
  else if (builtin && builtin !== 'exception') c.dict.set('__new_builtin__', new PyBuiltin(name, () => I.raise('TypeError', `cannot create '${module}.${name}' instances`)));
  return c;
}

function scalarCtor(I: Interp, dt: DType): BuiltinImpl {
  return (a) => {
    if (!a.length) return new NPScalar(0, dt);
    const v = a[0];
    if (typeof v === 'string') {
      const x = dt === 'bool' ? (v.length ? 1 : 0) : Number(v.trim());
      if (x !== x && v.trim().toLowerCase() !== 'nan') I.raise('ValueError', `could not convert string to float: '${v}'`);
      return new NPScalar(dt === 'int64' ? Math.trunc(x) : x, dt);
    }
    if (v instanceof NDArray || v instanceof PyList || v instanceof PyTuple) {
      const r = toArr(I, v, dt);
      return r.ndim === 0 ? wrap(r) : copyArr(r, dt);
    }
    if (dt === 'bool') return new NPScalar(I.truthSync(v) ? 1 : 0, 'bool');
    if (dt === 'complex128' && v instanceof NPScalar) return new NPScalar(v.v, dt);
    const k = pyNumKind(v);
    if (!k) I.raise('TypeError', `${isFl(dt) ? 'float' : 'int'}() argument must be a string or a real number, not '${typeNameOf(v)}'`);
    return new NPScalar(castVal(pyNum(v), dt), dt);
  };
}

export function registerNumpy(I: Interp) {
  const build = (): PyModule => {
    const T = I.T;
    const cls: Record<string, PyClass> = {};
    const st: NpState = { opts: defaultOpts(), mt: new MT19937(), cls, mod: null as unknown as PyModule };
    npStates.set(I, st);
    cls.ndarray = makeClass(I, 'ndarray', [T.object], 'numpy', (a) => {
      const shape = shapeArg(I, a[0]);
      return zerosArr(shape, 'float64');
    });
    cls.generic = makeClass(I, 'generic', [T.object], 'numpy');
    cls.number = makeClass(I, 'number', [cls.generic], 'numpy');
    cls.integer = makeClass(I, 'integer', [cls.number], 'numpy');
    cls.signedinteger = makeClass(I, 'signedinteger', [cls.integer], 'numpy');
    cls.inexact = makeClass(I, 'inexact', [cls.number], 'numpy');
    cls.floating = makeClass(I, 'floating', [cls.inexact], 'numpy');
    cls.float64 = makeClass(I, 'float64', [cls.floating, T.float], 'numpy', scalarCtor(I, 'float64'));
    cls.int64 = makeClass(I, 'int64', [cls.signedinteger], 'numpy', scalarCtor(I, 'int64'));
    cls.bool = makeClass(I, 'bool', [cls.generic], 'numpy', scalarCtor(I, 'bool'));
    cls.complexfloating = makeClass(I, 'complexfloating', [cls.inexact], 'numpy');
    cls.complex128 = makeClass(I, 'complex128', [cls.complexfloating], 'numpy', scalarCtor(I, 'complex128'));
    for (const [n, dn] of [['float64', 'Float64DType'], ['int64', 'Int64DType'], ['bool', 'BoolDType'], ['complex128', 'Complex128DType']])
      cls['dt_' + n] = makeClass(I, dn, [T.object], 'numpy.dtypes', () => new NPDtype(n as DType));
    cls.dtype = makeClass(I, 'dtype', [T.object], 'numpy', (a) => new NPDtype(dtypeArg(I, a[0]) ?? 'float64'));
    for (const n of ['float32', 'int32', 'int16', 'int8', 'uint8', 'uint16', 'uint32', 'uint64', 'complex64', 'str_', 'object_'])
      cls[n] = makeClass(I, n, [cls.generic], 'numpy', () => unsupported(I, `numpy.${n}`));
    // float16: scalars only (construct, print, convert back); enough to show half-precision rounding and underflow
    cls.float16 = makeClass(I, 'float16', [cls.floating], 'numpy', (a) => {
      if (a[0] instanceof NDArray && a[0].ndim > 0) unsupported(I, 'float16 arrays');
      const sc = new NPScalar(toHalf(toFloat(I, a[0] ?? 0)), 'float64');
      sc.half = true;
      return sc;
    });
    cls.LinAlgError = makeClass(I, 'LinAlgError', [T.ValueError], 'numpy.linalg', undefined, 'exception');
    cls.AxisError = makeClass(I, 'AxisError', [T.ValueError, T.IndexError], 'numpy.exceptions', undefined, 'exception');
    cls.UFuncTypeError = makeClass(I, 'UFuncTypeError', [T.TypeError], 'numpy._core._exceptions', undefined, 'exception');
    (cls.UFuncTypeError as PyClass & { qualname?: string }).qualname = 'numpy._core._exceptions._UFuncOutputCastingError';

    const d = new Map<string, PyVal>();
    const fn = (name: string, impl: NpFn) => d.set(name, new PyBuiltin(name, (a, kw) => impl(I, a, kw)));
    for (const [k, v] of Object.entries(F)) fn(k, v);
    d.set('ndarray', cls.ndarray);
    d.set('dtype', cls.dtype);
    for (const n of ['generic', 'number', 'integer', 'signedinteger', 'inexact', 'floating', 'float64', 'int64'])
      d.set(n, cls[n]);
    d.set('bool', cls.bool);
    d.set('bool_', cls.bool);
    d.set('double', cls.float64);
    d.set('int_', cls.int64);
    d.set('intp', cls.int64);
    for (const n of ['float32', 'float16', 'int32', 'int16', 'int8', 'uint8', 'uint16', 'uint32', 'uint64', 'complex64', 'str_', 'object_']) d.set(n, cls[n]);
    d.set('complex128', cls.complex128);
    d.set('complexfloating', cls.complexfloating);
    d.set('cdouble', cls.complex128);
    d.set('True_', new NPScalar(1, 'bool'));
    d.set('False_', new NPScalar(0, 'bool'));
    d.set('pi', Math.PI);
    d.set('e', Math.E);
    d.set('euler_gamma', 0.5772156649015329);
    d.set('inf', Infinity);
    d.set('nan', NaN);
    d.set('newaxis', null);
    d.set('__version__', '2.5.3');
    fn('set_printoptions', (I, a, kw) => {
      const o = st.opts;
      const names = ['precision', 'threshold', 'edgeitems', 'linewidth', 'suppress', 'nanstr', 'infstr', 'formatter', 'sign', 'floatmode', 'legacy'];
      a.forEach((v, i) => kw.set(names[i], v));
      for (const [k, v] of kw) {
        if (v === null) continue;
        if (k === 'precision') o.precision = toInt(I, v);
        else if (k === 'threshold') o.threshold = typeof v === 'number' ? (v === Infinity ? Number.MAX_SAFE_INTEGER : v) : toInt(I, v);
        else if (k === 'edgeitems') o.edgeitems = toInt(I, v);
        else if (k === 'linewidth') o.linewidth = toInt(I, v);
        else if (k === 'suppress') o.suppress = I.truthSync(v);
        else if (k === 'sign') o.sign = v as '-' | '+' | ' ';
        else if (k === 'floatmode') o.floatmode = v as PrintOpts['floatmode'];
        else if (k === 'legacy') o.legacy = v === false ? false : String(v);
        else unsupported(I, `set_printoptions(${k}=...)`);
      }
      return null;
    });
    fn('get_printoptions', () => {
      const o = st.opts;
      const r = new PyDict();
      r.set('edgeitems', BigInt(o.edgeitems));
      r.set('threshold', BigInt(o.threshold));
      r.set('floatmode', o.floatmode);
      r.set('precision', BigInt(o.precision));
      r.set('suppress', o.suppress);
      r.set('linewidth', BigInt(o.linewidth));
      r.set('nanstr', 'nan');
      r.set('infstr', 'inf');
      r.set('sign', o.sign);
      r.set('formatter', null);
      r.set('legacy', o.legacy === false ? false : o.legacy);
      r.set('override_repr', null);
      return r;
    });
    // context managers: printoptions / errstate
    const ctx = (name: string, enter: () => void, exit: () => void) => {
      const c = new PyClass(name, [T.object]);
      c.dict.set('__enter__', new PyBuiltin('__enter__', (a) => {
        enter();
        return a[0];
      }));
      c.dict.set('__exit__', new PyBuiltin('__exit__', () => {
        exit();
        return false;
      }));
      return new PyInstance(c);
    };
    fn('printoptions', (I, a, kw) => {
      let saved: PrintOpts;
      return ctx('printoptions', () => {
        saved = { ...st.opts };
        I.runSync((function* () {
          return yield* I.call(d.get('set_printoptions')!, a, kw);
        })());
      }, () => (st.opts = saved));
    });
    fn('errstate', () => ctx('errstate', () => undefined, () => undefined));
    fn('seterr', () => {
      const r = new PyDict();
      for (const k of ['divide', 'over', 'under', 'invalid']) r.set(k, k === 'under' ? 'ignore' : 'warn');
      return r;
    });
    fn('array_str', (I, a) => arrayStr(I, toArr(I, a[0])));
    fn('array_repr', (I, a) => arrayRepr(I, toArr(I, a[0])));
    fn('array2string', (I, a, kw) => {
      const A = parseArgs(I, 'array2string', a, kw, ['a', 'max_line_width=', 'precision=', 'suppress_small=', 'separator=', 'prefix=']);
      const o = { ...st.opts };
      if (A.max_line_width !== undefined && A.max_line_width !== null) o.linewidth = toInt(I, A.max_line_width);
      if (A.precision !== undefined && A.precision !== null) o.precision = toInt(I, A.precision);
      if (A.suppress_small !== undefined && A.suppress_small !== null) o.suppress = I.truthSync(A.suppress_small);
      return array2string(toArr(I, A.a!), o, (A.separator as string) ?? ' ', (A.prefix as string) ?? '', '');
    });
    fn('format_float_positional', (I, a, kw) => {
      const A = parseArgs(I, 'format_float_positional', a, kw, ['x', 'precision=', 'unique=', 'fractional=', 'trim=', 'sign=', 'pad_left=', 'pad_right=', 'min_digits=']);
      return dragon4Positional(toFloat(I, A.x!), {
        precision: A.precision === undefined || A.precision === null ? null : toInt(I, A.precision), unique: toBool(I, A.unique, true), trim: ((A.trim as string) ?? 'k') as Trim,
        sign: toBool(I, A.sign), padLeft: A.pad_left ? toInt(I, A.pad_left) : undefined, padRight: A.pad_right ? toInt(I, A.pad_right) : undefined, minDigits: A.min_digits ? toInt(I, A.min_digits) : undefined,
      });
    });
    fn('format_float_scientific', (I, a, kw) => {
      const A = parseArgs(I, 'format_float_scientific', a, kw, ['x', 'precision=', 'unique=', 'trim=', 'sign=', 'pad_left=', 'exp_digits=', 'min_digits=']);
      return dragon4Scientific(toFloat(I, A.x!), {
        precision: A.precision === undefined || A.precision === null ? null : toInt(I, A.precision), unique: toBool(I, A.unique, true), trim: ((A.trim as string) ?? 'k') as Trim,
        sign: toBool(I, A.sign), padLeft: A.pad_left ? toInt(I, A.pad_left) : undefined, expDigits: A.exp_digits ? toInt(I, A.exp_digits) : undefined, minDigits: A.min_digits ? toInt(I, A.min_digits) : undefined,
      });
    });
    // index tricks: np.r_[...] / np.c_[...]
    const concatTrick = (name: string, columns: boolean) => {
      const c = new PyClass(name === 'r_' ? 'RClass' : 'CClass', [T.object]);
      (c as PyClass & { module?: string }).module = 'numpy.lib._index_tricks_impl';
      c.dict.set('__getitem__', new PyBuiltin('__getitem__', (a) => {
        const key = a[1];
        const items = key instanceof PyTuple ? key.items : [key];
        const parts = items.map((it) => {
          if (it instanceof PySlice) {
            const nums = [it.lo ?? 0n, it.hi, it.step ?? 1n];
            if (nums.some((v) => v !== null && pyNumKind(v) === null)) unsupported(I, `numpy.${name} with this slice`);
            return arangeFn(I, [nums[0]!, nums[1]!, nums[2]!], new Map());
          }
          if (typeof it === 'string') unsupported(I, `numpy.${name} string directives`);
          return atleast(toArr(I, it), 1);
        });
        if (!columns) return concatenate(I, parts, 0n);
        const cols = parts.map((p) => (p.ndim === 1 ? reshapeView(p, [p.size, 1]) : p));
        return concatenate(I, cols, -1n);
      }));
      return new PyInstance(c);
    };
    d.set('r_', concatTrick('r_', false));
    d.set('c_', concatTrick('c_', true));
    // submodules
    const la = new Map<string, PyVal>();
    buildLinalg(I, la);
    d.set('linalg', new PyModule('numpy.linalg', la));
    const rnd = new Map<string, PyVal>();
    buildRandom(I, rnd, () => st.mt, true);
    const rsCls = makeClass(I, 'RandomState', [T.object], 'numpy.random', (a) => {
      const mt = new MT19937();
      const inst = new PyInstance(rsCls);
      const m = new Map<string, PyVal>();
      buildRandom(I, m, () => mt, true);
      m.forEach((v, k) => inst.attrs.set(k, v));
      if (a.length && a[0] !== null) I.runSync((function* () {
        return yield* I.call(m.get('seed')!, [a[0]]);
      })());
      return inst;
    });
    rnd.set('RandomState', rsCls);
    const genCls = makeClass(I, 'Generator', [T.object], 'numpy.random', () => unsupported(I, 'numpy.random.Generator(...) construction; use np.random.default_rng(seed)'));
    genCls.dict.set('__repr__', new PyBuiltin('__repr__', () => 'Generator(PCG64)'));
    rnd.set('Generator', genCls);
    rnd.set('default_rng', new PyBuiltin('default_rng', (a, kw) => {
      const seed = a[0] ?? kw.get('seed') ?? null;
      let ent: bigint[] = [];
      if (seed === null) ent = [BigInt(Math.floor(Math.random() * 2 ** 32)), BigInt(Math.floor(Math.random() * 2 ** 32)), BigInt(Date.now())];
      else if (seed instanceof PyList || seed instanceof PyTuple) ent = seed.items.map((x) => BigInt(toInt(I, x)));
      else if (typeof seed === 'bigint') {
        if (seed < 0n) I.raise('ValueError', 'expected non-negative integer');
        ent = [seed];
      } else if (seed instanceof NPScalar && seed.dtype === 'int64') ent = [BigInt(seed.v)];
      else if (seed instanceof PyInstance && seed.cls === genCls) return seed;
      else unsupported(I, `default_rng(${typeNameOf(seed)})`);
      return makeGenerator(I, genCls, new PCG64(ent));
    }));
    d.set('random', new PyModule('numpy.random', rnd));
    // common-but-unsupported names fail loudly instead of with a confusing AttributeError
    for (const n of ['histogram', 'histogram2d', 'polyfit', 'polyval', 'poly1d', 'fft', 'convolve', 'correlate', 'gradient', 'cross', 'kron', 'lexsort', 'partition', 'argpartition', 'pad', 'nanmean', 'nanstd', 'nanmax', 'nanmin', 'nansum', 'nanargmax', 'nanargmin', 'digitize', 'vectorize', 'frompyfunc', 'loadtxt', 'savetxt', 'genfromtxt', 'load', 'save', 'fromfunction', 'complex', 'angle', 'block', 'put', 'place', 'select', 'piecewise', 'packbits', 'ma', 'char', 'rec'])
      if (!d.has(n)) d.set(n, new PyBuiltin(n, () => unsupported(I, `numpy.${n}`)));
    const m = new PyModule('numpy', d);
    st.mod = m;
    return m;
  };
  I.moduleFactories.set('numpy', build);
  I.moduleFactories.set('numpy.linalg', () => I.importModule('numpy').dict.get('linalg') as PyModule);
  I.moduleFactories.set('numpy.random', () => I.importModule('numpy').dict.get('random') as PyModule);
}

setNpKeyHook((v) => (v instanceof NPScalar || v instanceof NPDtype || v instanceof NDArray ? npHashKey(v) : undefined));
