// Built-in functions, methods of built-in types, and a practical slice of the
// standard library (collections, heapq, itertools, functools, math, bisect...).

import type { Interp, G } from './interp';
import { PyDictView, PySlice } from './interp';
import {
  PyBoundMethod, PyBuiltin, PyClass, PyClassMethod, PyDeque, PyDict, PyFunc, PyGenerator, PyInstance, PyIter, PyList, PyModule,
  PyProperty, PyRange, PySet, PyStaticMethod, PySuper, PyTuple, PyVal, STOP, BuiltinImpl, NextResult,
  floatRepr, isNum, toBig, toNum, typeNameOf,
} from './values';
import { formatSpec } from './format';
import { NDArray, NPScalar, npAbs, npClassOf, npCopy, npLen, npRound, npToNumber, registerNumpy } from './numpy';

type Kw = Map<string, PyVal>;

export function installBuiltins(I: Interp) {
  const B = I.builtins;
  const fn = (name: string, impl: BuiltinImpl) => {
    const f = new PyBuiltin(name, impl);
    B.set(name, f);
    return f;
  };

  // ---------- type objects ----------
  const T: Record<string, PyClass> = {};
  const object = new PyClass('object', [], new Map(), 'object');
  object.mro = [object];
  T.object = object;
  const mk = (name: string, ctor: BuiltinImpl, bases: PyClass[] = [object]) => {
    const c = new PyClass(name, bases, new Map(), name);
    c.dict.set('__new_builtin__', new PyBuiltin(name, ctor));
    T[name] = c;
    B.set(name, c);
    return c;
  };
  I.T = T;

  mk('int', function* (a) {
    if (!a.length) return 0n;
    const v = a[0];
    if (a.length > 1) {
      const base = Number(toBig(a[1] as bigint));
      const s = String(v).trim().toLowerCase().replace(/_/g, '');
      const body = base === 16 ? s.replace(/^0x/, '') : base === 2 ? s.replace(/^0b/, '') : base === 8 ? s.replace(/^0o/, '') : s;
      const neg = body.startsWith('-');
      let n = 0n;
      for (const ch of neg ? body.slice(1) : body) {
        const d = parseInt(ch, 36);
        if (isNaN(d) || d >= base) I.raise('ValueError', `invalid literal for int() with base ${base}: ${I.primRepr(v)}`);
        n = n * BigInt(base) + BigInt(d);
      }
      return neg ? -n : n;
    }
    if (typeof v === 'bigint') return v;
    if (typeof v === 'boolean') return v ? 1n : 0n;
    if (typeof v === 'number') {
      if (!isFinite(v)) I.raise(isNaN(v) ? 'ValueError' : 'OverflowError', isNaN(v) ? 'cannot convert float NaN to integer' : 'cannot convert float infinity to integer');
      return BigInt(Math.trunc(v));
    }
    if (v instanceof NDArray || v instanceof NPScalar) return npToNumber(I, v, true);
    if (typeof v === 'string') {
      const s = v.trim().replace(/_/g, '');
      if (!/^[+-]?\d+$/.test(s)) I.raise('ValueError', `invalid literal for int() with base 10: ${I.primRepr(v)}`);
      return BigInt(s);
    }
    if (v instanceof PyInstance) {
      const m = v.cls.lookup('__int__');
      if (m) return yield* I.call(m, [v]);
    }
    I.raise('TypeError', `int() argument must be a string, a bytes-like object or a real number, not '${typeNameOf(v)}'`);
  });
  mk('float', (a) => {
    if (!a.length) return 0;
    const v = a[0];
    if (typeof v === 'number') return v;
    if (typeof v === 'bigint' || typeof v === 'boolean') return toNum(v);
    if (v instanceof NDArray || v instanceof NPScalar) return npToNumber(I, v, false);
    if (typeof v === 'string') {
      const s = v.trim().toLowerCase();
      if (s === 'inf' || s === '+inf' || s === 'infinity') return Infinity;
      if (s === '-inf' || s === '-infinity') return -Infinity;
      if (s === 'nan') return NaN;
      if (!/^[+-]?(\d+\.?\d*|\.\d+)(e[+-]?\d+)?$/.test(s.replace(/_/g, ''))) I.raise('ValueError', `could not convert string to float: ${I.primRepr(v)}`);
      return Number(s.replace(/_/g, ''));
    }
    I.raise('TypeError', `float() argument must be a string or a real number, not '${typeNameOf(v)}'`);
  });
  mk('str', function* (a) {
    if (!a.length) return '';
    return yield* I.str(a[0]);
  });
  const boolT = mk('bool', function* (a) {
    return a.length ? yield* I.truth(a[0]) : false;
  }, [T.int]);
  void boolT;
  mk('list', function* (a) {
    return new PyList(a.length ? yield* I.toArray(a[0]) : []);
  });
  mk('tuple', function* (a) {
    return new PyTuple(a.length ? yield* I.toArray(a[0]) : []);
  });
  const dictCtor = function* (a: PyVal[], kw: Kw, d = new PyDict()): G<PyVal> {
    if (a.length) yield* dictUpdate(I, d, a[0]);
    for (const [k, v] of kw) d.set(k, v);
    return d;
  };
  mk('dict', (a, kw) => dictCtor(a, kw));
  T.dict.dict.set('fromkeys', new PyClassMethod(new PyBuiltin('fromkeys', function* (a) {
    const d = new PyDict();
    for (const k of yield* I.toArray(a[1])) d.set(I.hashable(k), a.length > 2 ? a[2] : null);
    return d;
  })));
  mk('set', function* (a) {
    const s = new PySet();
    if (a.length) for (const v of yield* I.toArray(a[0])) s.add(I.hashable(v));
    return s;
  });
  mk('frozenset', function* (a) {
    const s = new PySet(true);
    if (a.length) for (const v of yield* I.toArray(a[0])) s.add(I.hashable(v));
    return s;
  });
  mk('range', (a) => {
    const ints = a.map((x) => {
      if (x instanceof NPScalar && x.dtype === 'int64') return BigInt(x.v);
      if (typeof x !== 'bigint' && typeof x !== 'boolean') I.raise('TypeError', `'${typeNameOf(x)}' object cannot be interpreted as an integer`);
      return toBig(x as bigint);
    });
    if (ints.length === 0) I.raise('TypeError', 'range expected at least 1 argument, got 0');
    if (ints.length === 1) return new PyRange(0n, ints[0], 1n);
    const step = ints[2] ?? 1n;
    if (step === 0n) I.raise('ValueError', 'range() arg 3 must not be zero');
    return new PyRange(ints[0], ints[1], step);
  });
  mk('type', (a) => {
    if (a.length === 1) return classOf(I, a[0]);
    if (a.length === 3) {
      const bases = (a[1] as PyTuple).items as PyClass[];
      const d = new Map<string, PyVal>();
      for (const [k, v] of (a[2] as PyDict).entries()) d.set(k as string, v);
      return new PyClass(a[0] as string, bases.length ? bases : [object], d);
    }
    I.raise('TypeError', 'type() takes 1 or 3 arguments');
  });
  const noneT = new PyClass('NoneType', [object], new Map(), 'NoneType');
  T.NoneType = noneT;
  for (const n of ['function', 'builtin_function_or_method', 'generator', 'module', 'method']) T[n] = new PyClass(n, [object], new Map(), n);

  // ---------- exceptions ----------
  const exc = (name: string, parent?: PyClass) => {
    const c = new PyClass(name, [parent ?? object], new Map(), 'exception');
    T[name] = c;
    B.set(name, c);
    return c;
  };
  const BaseException = exc('BaseException');
  BaseException.dict.set('__init__', new PyBuiltin('__init__', (a) => {
    (a[0] as PyInstance).attrs.set('args', new PyTuple(a.slice(1)));
    return null;
  }));
  BaseException.dict.set('with_traceback', new PyBuiltin('with_traceback', (a) => a[0]));
  BaseException.dict.set('add_note', new PyBuiltin('add_note', () => null));
  exc('SystemExit', BaseException);
  exc('KeyboardInterrupt', BaseException);
  exc('GeneratorExit', BaseException);
  const E = exc('Exception', BaseException);
  exc('StopIteration', E);
  const Arith = exc('ArithmeticError', E);
  exc('ZeroDivisionError', Arith);
  exc('OverflowError', Arith);
  const Lookup = exc('LookupError', E);
  exc('IndexError', Lookup);
  exc('KeyError', Lookup);
  exc('ValueError', E);
  exc('TypeError', E);
  const NameE = exc('NameError', E);
  exc('UnboundLocalError', NameE);
  const AttrE = exc('AttributeError', E);
  T.FrozenInstanceError = new PyClass('FrozenInstanceError', [AttrE], new Map(), 'exception');
  const RT = exc('RuntimeError', E);
  exc('RecursionError', RT);
  exc('NotImplementedError', RT);
  exc('AssertionError', E);
  const ImportE = exc('ImportError', E);
  exc('ModuleNotFoundError', ImportE);
  exc('SyntaxError', E);
  exc('EOFError', E);
  exc('MemoryError', E);
  const OSE = exc('OSError', E);
  exc('FileNotFoundError', OSE);
  exc('TimeoutError', OSE);
  exc('UnicodeError', T.ValueError);

  // ---------- singletons ----------
  B.set('NotImplemented', new PyInstance(new PyClass('NotImplementedType', [object])));
  B.set('Ellipsis', new PyInstance(new PyClass('ellipsis', [object])));
  B.set('object', object);

  // ---------- functions ----------
  fn('print', function* (a, kw) {
    const sep = kw.has('sep') && kw.get('sep') !== null ? (kw.get('sep') as string) : ' ';
    const end = kw.has('end') && kw.get('end') !== null ? (kw.get('end') as string) : '\n';
    const parts: string[] = [];
    for (const x of a) parts.push(yield* I.str(x));
    I.out.push(parts.join(sep) + end);
    if (I.out.length > 20000) I.out.splice(0, 10000, '…(output truncated)…\n');
    return null;
  });
  fn('input', (a) => {
    if (a.length) I.out.push(String(a[0]));
    const v = I.inputs.shift();
    if (v === undefined) I.raise('EOFError', 'EOF when reading a line (this sandbox has no keyboard input — set values directly)');
    I.out.push(v + '\n');
    return v;
  });
  fn('len', function* (a) {
    const v = a[0];
    if (typeof v === 'string') return BigInt([...v].length);
    if (v instanceof PyList || v instanceof PyTuple || v instanceof PyDeque) return BigInt(v.items.length);
    if (v instanceof PyDict || v instanceof PySet) return BigInt(v.map.size);
    if (v instanceof PyRange) return v.length;
    if (v instanceof PyDictView) return BigInt(v.dict.map.size);
    if (v instanceof NDArray) return npLen(I, v);
    if (v instanceof PyInstance) {
      const m = v.cls.lookup('__len__');
      if (m) return yield* I.call(m, [v]);
    }
    I.raise('TypeError', `object of type '${typeNameOf(v)}' has no len()`);
  });
  fn('repr', function* (a) {
    return yield* I.repr(a[0]);
  });
  fn('ascii', function* (a) {
    return yield* I.repr(a[0]);
  });
  fn('format', function* (a) {
    return yield* I.format(a[0], a.length > 1 ? (a[1] as string) : '');
  });
  fn('abs', function* (a) {
    const v = a[0];
    if (typeof v === 'number') return Math.abs(v);
    if (typeof v === 'bigint' || typeof v === 'boolean') {
      const n = toBig(v);
      return n < 0n ? -n : n;
    }
    if (v instanceof PyInstance && v.cls.lookup('__abs__')) return yield* I.call(v.cls.lookup('__abs__')!, [v]);
    if (v instanceof NDArray || v instanceof NPScalar) return npAbs(I, v);
    I.raise('TypeError', `bad operand type for abs(): '${typeNameOf(v)}'`);
  });
  fn('isinstance', (a) => {
    const cls = a[1];
    const types = cls instanceof PyTuple ? cls.items : [cls];
    const c = classOf(I, a[0]);
    return types.some((t) => t instanceof PyClass && (c.isSubclassOf(t) || (t === T.int && typeof a[0] === 'boolean')));
  });
  fn('issubclass', (a) => {
    const types = a[1] instanceof PyTuple ? a[1].items : [a[1]];
    return types.some((t) => t instanceof PyClass && (a[0] as PyClass).isSubclassOf(t));
  });
  fn('callable', (a) => a[0] instanceof PyFunc || a[0] instanceof PyBuiltin || a[0] instanceof PyClass || a[0] instanceof PyBoundMethod || (a[0] instanceof PyInstance && !!a[0].cls.lookup('__call__')));
  fn('id', (a) => BigInt(a[0] !== null && typeof a[0] === 'object' ? 140000000000000 + a[0].id * 16 : Math.abs(hashPrim(a[0]))));
  fn('hash', (a) => {
    const v = I.hashable(a[0]);
    if (typeof v === 'bigint') return v;
    if (typeof v === 'boolean') return v ? 1n : 0n;
    if (typeof v === 'number' && Number.isInteger(v)) return BigInt(v);
    return BigInt(hashPrim(v));
  });
  const minmax = (isMax: boolean) =>
    function* (a: PyVal[], kw: Kw): G<PyVal> {
      const key = kw.get('key') ?? null;
      let items = a.length === 1 ? yield* I.toArray(a[0]) : a;
      if (!items.length) {
        if (kw.has('default')) return kw.get('default')!;
        I.raise('ValueError', `${isMax ? 'max' : 'min'}() iterable argument is empty`);
      }
      let best = items[0];
      let bestK = key ? yield* I.call(key, [best]) : best;
      for (let i = 1; i < items.length; i++) {
        const k = key ? yield* I.call(key, [items[i]]) : items[i];
        const c = I.cmpOrder(k, bestK, isMax ? '>' : '<');
        if (isMax ? c > 0 : c < 0) {
          best = items[i];
          bestK = k;
        }
      }
      items = [];
      return best;
    };
  fn('min', minmax(false));
  fn('max', minmax(true));
  fn('sum', function* (a, kw) {
    let acc: PyVal = a[1] ?? kw.get('start') ?? 0n;
    const it = yield* I.iter(a[0]);
    for (;;) {
      const x = yield* I.next(it);
      if (x === STOP) return acc;
      acc = yield* I.binop('+', acc, x);
    }
  });
  fn('sorted', function* (a, kw) {
    const items = yield* I.toArray(a[0]);
    yield* sortList(I, items, kw.get('key') ?? null, I.truthSync(kw.get('reverse') ?? false));
    return new PyList(items);
  });
  fn('reversed', function* (a) {
    const v = a[0];
    if (v instanceof PyInstance && v.cls.lookup('__reversed__')) return yield* I.call(v.cls.lookup('__reversed__')!, [v]);
    const items = v instanceof PyDict ? v.keys() : yield* I.toArray(v);
    let i = items.length - 1;
    return new PyIter('list_reverseiterator', () => (i >= 0 ? items[i--] : STOP));
  });
  fn('enumerate', function* (a, kw) {
    const it = yield* I.iter(a[0]);
    let i = toBig((a[1] ?? kw.get('start') ?? 0n) as bigint);
    return new PyIter('enumerate', function* () {
      const x = yield* I.next(it);
      if (x === STOP) return STOP;
      return new PyTuple([i++, x]);
    } as () => G<NextResult>);
  });
  fn('zip', function* (a, kw) {
    const its: PyIter[] = [];
    for (const x of a) its.push(yield* I.iter(x));
    const strict = kw.has('strict') && I.truthSync(kw.get('strict')!);
    return new PyIter('zip', function* () {
      if (!its.length) return STOP;
      const row: PyVal[] = [];
      for (const it of its) {
        const x = yield* I.next(it);
        if (x === STOP) {
          if (strict && row.length) I.raise('ValueError', 'zip() argument 2 is shorter than argument 1');
          return STOP;
        }
        row.push(x);
      }
      return new PyTuple(row);
    } as () => G<NextResult>);
  });
  fn('map', function* (a) {
    const f = a[0];
    const its: PyIter[] = [];
    for (const x of a.slice(1)) its.push(yield* I.iter(x));
    return new PyIter('map', function* () {
      const args: PyVal[] = [];
      for (const it of its) {
        const x = yield* I.next(it);
        if (x === STOP) return STOP;
        args.push(x);
      }
      return yield* I.call(f, args);
    } as () => G<NextResult>);
  });
  fn('filter', function* (a) {
    const f = a[0];
    const it = yield* I.iter(a[1]);
    return new PyIter('filter', function* () {
      for (;;) {
        const x = yield* I.next(it);
        if (x === STOP) return STOP;
        const keep = f === null ? yield* I.truth(x) : yield* I.truth(yield* I.call(f, [x]));
        if (keep) return x;
      }
    } as () => G<NextResult>);
  });
  fn('any', function* (a) {
    const it = yield* I.iter(a[0]);
    for (;;) {
      const x = yield* I.next(it);
      if (x === STOP) return false;
      if (yield* I.truth(x)) return true;
    }
  });
  fn('all', function* (a) {
    const it = yield* I.iter(a[0]);
    for (;;) {
      const x = yield* I.next(it);
      if (x === STOP) return true;
      if (!(yield* I.truth(x))) return false;
    }
  });
  fn('iter', function* (a) {
    return yield* I.iter(a[0]);
  });
  fn('next', function* (a) {
    let it = a[0];
    if (it instanceof PyGenerator) it = I.genIter(it);
    if (it instanceof PyInstance && it.cls.lookup('__next__')) return yield* I.call(it.cls.lookup('__next__')!, [it]);
    if (!(it instanceof PyIter)) I.raise('TypeError', `'${typeNameOf(a[0])}' object is not an iterator`);
    const x = yield* I.next(it as PyIter);
    if (x === STOP) {
      if (a.length > 1) return a[1];
      I.raise('StopIteration');
    }
    return x as PyVal;
  });
  fn('round', (a) => {
    const v = a[0];
    if (v instanceof NDArray || v instanceof NPScalar) return npRound(I, v, a[1]);
    const nd = a.length > 1 && a[1] !== null ? Number(toBig(a[1] as bigint)) : null;
    if (typeof v === 'bigint' || typeof v === 'boolean') return toBig(v);
    if (typeof v !== 'number') I.raise('TypeError', `type ${typeNameOf(v)} doesn't define __round__ method`);
    if (nd === null) {
      if (!isFinite(v)) I.raise(isNaN(v) ? 'ValueError' : 'OverflowError', 'cannot convert float to integer');
      return BigInt(bankersRound(v));
    }
    const p = Math.pow(10, nd);
    // use the decimal representation like CPython does
    const r = Number(v.toFixed(Math.max(0, Math.min(100, nd)) + 0));
    const exact = bankersRound(v * p) / p;
    return Math.abs(r - v) <= Math.abs(exact - v) && nd >= 0 ? roundHalfEvenDecimal(v, nd) : exact;
  });
  fn('divmod', function* (a) {
    return new PyTuple([yield* I.binop('//', a[0], a[1]), yield* I.binop('%', a[0], a[1])]);
  });
  fn('pow', function* (a) {
    if (a.length === 3) {
      let b = toBig(a[0] as bigint), e = toBig(a[1] as bigint);
      const m = toBig(a[2] as bigint);
      let r = 1n;
      b %= m;
      while (e > 0n) {
        if (e & 1n) r = (r * b) % m;
        b = (b * b) % m;
        e >>= 1n;
      }
      return r;
    }
    return yield* I.binop('**', a[0], a[1]);
  });
  fn('bin', (a) => fmtBase(toBig(a[0] as bigint), 2, '0b'));
  fn('oct', (a) => fmtBase(toBig(a[0] as bigint), 8, '0o'));
  fn('hex', (a) => fmtBase(toBig(a[0] as bigint), 16, '0x'));
  fn('ord', (a) => {
    const s = a[0];
    if (typeof s !== 'string' || [...s].length !== 1) I.raise('TypeError', `ord() expected a character, but string of length ${typeof s === 'string' ? s.length : 0} found`);
    return BigInt(s.codePointAt(0)!);
  });
  fn('chr', (a) => String.fromCodePoint(Number(toBig(a[0] as bigint))));
  fn('getattr', function* (a) {
    try {
      return yield* I.getAttr(a[0], a[1] as string);
    } catch (e) {
      const r = I.toRaise(e);
      if (r && a.length > 2 && r.exc.cls.isSubclassOf(T.AttributeError)) return a[2];
      throw e;
    }
  });
  fn('setattr', function* (a) {
    yield* I.setAttr(a[0], a[1] as string, a[2]);
    return null;
  });
  fn('hasattr', function* (a) {
    try {
      yield* I.getAttr(a[0], a[1] as string);
      return true;
    } catch (e) {
      const r = I.toRaise(e);
      if (r && r.exc.cls.isSubclassOf(T.AttributeError)) return false;
      throw e;
    }
  });
  fn('delattr', (a) => {
    (a[0] as PyInstance).attrs.delete(a[1] as string);
    return null;
  });
  fn('vars', (a) => {
    const d = new PyDict();
    if (a[0] instanceof PyInstance) for (const [k, v] of a[0].attrs) d.set(k, v);
    return d;
  });
  fn('dir', (a) => {
    const names = new Set<string>();
    if (a[0] instanceof PyInstance) {
      a[0].attrs.forEach((_, k) => names.add(k));
      a[0].cls.mro.forEach((c) => c.dict.forEach((_, k) => names.add(k)));
    }
    return new PyList([...names].sort());
  });
  fn('super', (a) => new PySuper(a[0] as PyClass, a[1]));
  fn('property', (a, kw) => new PyProperty(a[0] ?? kw.get('fget') ?? null, a[1] ?? kw.get('fset') ?? null));
  fn('staticmethod', (a) => new PyStaticMethod(a[0]));
  fn('classmethod', (a) => new PyClassMethod(a[0]));
  fn('open', () => I.raise('OSError', 'files are not available in this browser sandbox'));
  fn('exit', () => I.raise('SystemExit'));
  fn('quit', () => I.raise('SystemExit'));
  fn('globals', () => {
    const d = new PyDict();
    for (const [k, v] of I.globals.vars) d.set(k, v);
    return d;
  });
  fn('slice', (a) => (a.length === 1 ? new PySlice(null, a[0], null) : new PySlice(a[0], a[1] ?? null, a[2] ?? null)));

  // ---------- modules ----------
  registerModules(I);
}

function hashPrim(v: PyVal): number {
  const s = typeof v === 'string' ? v : String(v);
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  return h;
}

function fmtBase(n: bigint, base: number, prefix: string) {
  return (n < 0n ? '-' : '') + prefix + (n < 0n ? -n : n).toString(base);
}

export function bankersRound(x: number): number {
  const f = Math.floor(x);
  const diff = x - f;
  if (diff > 0.5) return f + 1;
  if (diff < 0.5) return f;
  return f % 2 === 0 ? f : f + 1;
}

function roundHalfEvenDecimal(v: number, nd: number): number {
  // CPython rounds using the exact binary value; toFixed does the same for most practical inputs
  const s = v.toFixed(nd);
  return Number(s);
}

export function classOf(I: Interp, v: PyVal): PyClass {
  const T = I.T;
  if (v === null) return T.NoneType;
  if (typeof v === 'boolean') return T.bool;
  if (typeof v === 'bigint') return T.int;
  if (typeof v === 'number') return T.float;
  if (typeof v === 'string') return T.str;
  if (v instanceof PyInstance) return v.cls;
  if (v instanceof PyList) return T.list;
  if (v instanceof PyTuple) return T.tuple;
  if (v instanceof PyDict) return v.flavor === 'dict' ? T.dict : T[v.flavor] ?? T.dict;
  if (v instanceof PySet) return v.frozen ? T.frozenset : T.set;
  if (v instanceof PyRange) return T.range;
  if (v instanceof PyDeque) return T.deque ?? T.object;
  if (v instanceof PyClass) return T.type;
  if (v instanceof PyFunc) return T.function;
  if (v instanceof PyBuiltin) return T.builtin_function_or_method;
  if (v instanceof PyGenerator) return T.generator;
  if (v instanceof PyModule) return T.module;
  if (v instanceof PyBoundMethod) return T.method;
  return npClassOf(I, v) ?? T.object;
}

export function* sortList(I: Interp, items: PyVal[], key: PyVal, reverse: boolean): G<void> {
  const keys: PyVal[] = [];
  for (const x of items) keys.push(key !== null ? yield* I.call(key, [x]) : x);
  const idx = items.map((_, i) => i);
  idx.sort((i, j) => {
    const c = I.cmpOrder(keys[i], keys[j]);
    return reverse ? -c || 0 : c;
  });
  // keep stability under reverse: Python's reverse=True keeps equal items in original order
  const out = idx.map((i) => items[i]);
  for (let i = 0; i < out.length; i++) items[i] = out[i];
}

function* dictUpdate(I: Interp, d: PyDict, src: PyVal): G<void> {
  if (src instanceof PyDict) {
    for (const [k, v] of src.entries()) d.set(k, v);
    return;
  }
  for (const pair of yield* I.toArray(src)) {
    const kv = yield* I.toArray(pair);
    if (kv.length !== 2) I.raise('ValueError', `dictionary update sequence element has length ${kv.length}; 2 is required`);
    d.set(I.hashable(kv[0]), kv[1]);
  }
}

// =====================================================================
//  methods of built-in types
// =====================================================================

type Method = (I: Interp, self: any, a: PyVal[], kw: Kw) => PyVal | G<PyVal>;

const STR: Record<string, Method> = {
  upper: (_, s: string) => s.toUpperCase(),
  lower: (_, s: string) => s.toLowerCase(),
  casefold: (_, s: string) => s.toLowerCase(),
  title: (_, s: string) => s.toLowerCase().replace(/(^|[^a-zA-Z])([a-z])/g, (_m, p, c) => p + c.toUpperCase()),
  capitalize: (_, s: string) => (s ? s[0].toUpperCase() + s.slice(1).toLowerCase() : s),
  swapcase: (_, s: string) => [...s].map((c) => (c === c.toUpperCase() ? c.toLowerCase() : c.toUpperCase())).join(''),
  strip: (_, s: string, a) => stripChars(s, a[0] as string | null | undefined, true, true),
  lstrip: (_, s: string, a) => stripChars(s, a[0] as string | null | undefined, true, false),
  rstrip: (_, s: string, a) => stripChars(s, a[0] as string | null | undefined, false, true),
  removeprefix: (_, s: string, a) => (s.startsWith(a[0] as string) ? s.slice((a[0] as string).length) : s),
  removesuffix: (_, s: string, a) => ((a[0] as string) && s.endsWith(a[0] as string) ? s.slice(0, -(a[0] as string).length) : s),
  split: (I, s: string, a, kw) => new PyList(pySplit(I, s, (a[0] ?? kw.get('sep') ?? null) as string | null, Number(toBig((a[1] ?? kw.get('maxsplit') ?? -1n) as bigint)))),
  rsplit: (I, s: string, a, kw) => {
    const sep = (a[0] ?? kw.get('sep') ?? null) as string | null;
    const max = Number(toBig((a[1] ?? kw.get('maxsplit') ?? -1n) as bigint));
    if (max < 0) return new PyList(pySplit(I, s, sep, -1));
    const parts = pySplit(I, [...s].reverse().join(''), sep === null ? null : [...sep].reverse().join(''), max);
    return new PyList(parts.map((p) => [...(p as string)].reverse().join('')).reverse());
  },
  splitlines: (_, s: string) => new PyList(s.split(/\r\n|\r|\n/).filter((x, i, arr) => !(i === arr.length - 1 && x === ''))),
  join: function* (I, s: string, a) {
    const parts = yield* I.toArray(a[0]);
    parts.forEach((p, i) => {
      if (typeof p !== 'string') I.raise('TypeError', `sequence item ${i}: expected str instance, ${typeNameOf(p)} found`);
    });
    return parts.join(s);
  },
  replace: (_, s: string, a) => {
    const old = a[0] as string, nw = a[1] as string;
    let count = a.length > 2 ? Number(toBig(a[2] as bigint)) : -1;
    if (count < 0) return s.split(old).join(nw);
    let out = '', rest = s;
    while (count-- > 0) {
      const i = rest.indexOf(old);
      if (i < 0) break;
      out += rest.slice(0, i) + nw;
      rest = rest.slice(i + old.length);
    }
    return out + rest;
  },
  find: (_, s: string, a) => BigInt(s.indexOf(a[0] as string, a[1] !== undefined ? Number(toBig(a[1] as bigint)) : 0)),
  rfind: (_, s: string, a) => BigInt(s.lastIndexOf(a[0] as string)),
  index: (I, s: string, a) => {
    const i = s.indexOf(a[0] as string, a[1] !== undefined ? Number(toBig(a[1] as bigint)) : 0);
    if (i < 0) I.raise('ValueError', 'substring not found');
    return BigInt(i);
  },
  rindex: (I, s: string, a) => {
    const i = s.lastIndexOf(a[0] as string);
    if (i < 0) I.raise('ValueError', 'substring not found');
    return BigInt(i);
  },
  count: (_, s: string, a) => {
    const sub = a[0] as string;
    if (!sub) return BigInt(s.length + 1);
    return BigInt(s.split(sub).length - 1);
  },
  startswith: (_, s: string, a) => (a[0] instanceof PyTuple ? a[0].items.some((p) => s.startsWith(p as string)) : s.startsWith(a[0] as string, a[1] !== undefined ? Number(toBig(a[1] as bigint)) : 0)),
  endswith: (_, s: string, a) => (a[0] instanceof PyTuple ? a[0].items.some((p) => s.endsWith(p as string)) : s.endsWith(a[0] as string)),
  isdigit: (_, s: string) => s.length > 0 && /^\d+$/.test(s),
  isdecimal: (_, s: string) => s.length > 0 && /^\d+$/.test(s),
  isnumeric: (_, s: string) => s.length > 0 && /^\d+$/.test(s),
  isalpha: (_, s: string) => s.length > 0 && /^\p{L}+$/u.test(s),
  isalnum: (_, s: string) => s.length > 0 && /^[\p{L}\d]+$/u.test(s),
  isspace: (_, s: string) => s.length > 0 && /^\s+$/.test(s),
  isupper: (_, s: string) => /[A-Z]/.test(s) && s === s.toUpperCase(),
  islower: (_, s: string) => /[a-z]/.test(s) && s === s.toLowerCase(),
  istitle: (_, s: string) => /[A-Za-z]/.test(s) && s === STR.title(null as never, s, [], new Map()),
  isidentifier: (_, s: string) => /^[A-Za-z_]\w*$/.test(s),
  center: (_, s: string, a) => {
    const w = Number(toBig(a[0] as bigint)), f = (a[1] as string) ?? ' ';
    if (w <= s.length) return s;
    const total = w - s.length, left = Math.floor(total / 2) + (total % 2 && s.length % 2 ? 1 : 0);
    return f.repeat(left) + s + f.repeat(total - left);
  },
  ljust: (_, s: string, a) => s.padEnd(Number(toBig(a[0] as bigint)), (a[1] as string) ?? ' '),
  rjust: (_, s: string, a) => s.padStart(Number(toBig(a[0] as bigint)), (a[1] as string) ?? ' '),
  zfill: (_, s: string, a) => {
    const w = Number(toBig(a[0] as bigint));
    const sign = /^[+-]/.test(s) ? s[0] : '';
    return sign + s.slice(sign.length).padStart(w - sign.length, '0');
  },
  partition: (_, s: string, a) => {
    const i = s.indexOf(a[0] as string);
    return i < 0 ? new PyTuple([s, '', '']) : new PyTuple([s.slice(0, i), a[0], s.slice(i + (a[0] as string).length)]);
  },
  rpartition: (_, s: string, a) => {
    const i = s.lastIndexOf(a[0] as string);
    return i < 0 ? new PyTuple(['', '', s]) : new PyTuple([s.slice(0, i), a[0], s.slice(i + (a[0] as string).length)]);
  },
  format: function* (I, s: string, a, kw) {
    let auto = 0;
    let out = '';
    let i = 0;
    while (i < s.length) {
      const c = s[i];
      if (c === '{' && s[i + 1] === '{') {
        out += '{';
        i += 2;
        continue;
      }
      if (c === '}' && s[i + 1] === '}') {
        out += '}';
        i += 2;
        continue;
      }
      if (c === '{') {
        const j = s.indexOf('}', i);
        const field = s.slice(i + 1, j);
        const m = /^([^!:]*)(?:!([rs]))?(?::(.*))?$/.exec(field)!;
        let name = m[1];
        let v: PyVal;
        const path = name.split(/(?=[.[])/);
        name = path[0];
        if (name === '') v = a[auto++];
        else if (/^\d+$/.test(name)) v = a[Number(name)];
        else {
          if (!kw.has(name)) I.raise('KeyError', `'${name}'`);
          v = kw.get(name)!;
        }
        for (const p of path.slice(1)) {
          if (p.startsWith('.')) v = yield* I.getAttr(v, p.slice(1));
          else {
            const k = p.slice(1, -1);
            v = yield* I.getItem(v, /^\d+$/.test(k) ? BigInt(k) : k);
          }
        }
        out += m[2] === 'r' ? yield* I.repr(v) : m[2] === 's' ? yield* I.str(v) : yield* I.format(v, m[3] ?? '');
        i = j + 1;
        continue;
      }
      out += c;
      i++;
    }
    return out;
  },
  encode: (_, s: string) => s,
  expandtabs: (_, s: string) => s.replace(/\t/g, '        '),
  translate: (_, s: string) => s,
};

function stripChars(s: string, chars: string | null | undefined, left: boolean, right: boolean) {
  const set = chars === undefined || chars === null ? null : new Set(chars);
  const isStrip = (c: string) => (set ? set.has(c) : /\s/.test(c));
  let a = 0, b = s.length;
  if (left) while (a < b && isStrip(s[a])) a++;
  if (right) while (b > a && isStrip(s[b - 1])) b--;
  return s.slice(a, b);
}

function pySplit(I: Interp, s: string, sep: string | null, max: number): PyVal[] {
  if (sep === null) {
    const out: string[] = [];
    let rest = s.replace(/^\s+/, '');
    while (rest.length) {
      if (max >= 0 && out.length === max) {
        out.push(rest.replace(/\s+$/, '') === rest ? rest : rest);
        return out.map((x, i) => (i === out.length - 1 ? x : x));
      }
      const m = /\s+/.exec(rest);
      if (!m) {
        out.push(rest);
        break;
      }
      out.push(rest.slice(0, m.index));
      rest = rest.slice(m.index + m[0].length);
    }
    return out;
  }
  if (sep === '') I.raise('ValueError', 'empty separator');
  const parts = s.split(sep);
  if (max >= 0 && parts.length > max + 1) return [...parts.slice(0, max), parts.slice(max).join(sep)];
  return parts;
}

const LIST: Record<string, Method> = {
  append: (_, l: PyList, a) => {
    l.items.push(a[0]);
    return null;
  },
  extend: function* (I, l: PyList, a) {
    l.items.push(...(yield* I.toArray(a[0])));
    return null;
  },
  insert: (_, l: PyList, a) => {
    let i = Number(toBig(a[0] as bigint));
    if (i < 0) i = Math.max(0, l.items.length + i);
    l.items.splice(Math.min(i, l.items.length), 0, a[1]);
    return null;
  },
  remove: (I, l: PyList, a) => {
    const i = l.items.findIndex((x) => I.eq(x, a[0]));
    if (i < 0) I.raise('ValueError', 'list.remove(x): x not in list');
    l.items.splice(i, 1);
    return null;
  },
  pop: (I, l: PyList, a) => {
    if (!l.items.length) I.raise('IndexError', 'pop from empty list');
    const i = a.length ? I.index(l.items.length, a[0], 'pop') : l.items.length - 1;
    return l.items.splice(i, 1)[0];
  },
  clear: (_, l: PyList) => {
    l.items.length = 0;
    return null;
  },
  index: (I, l: PyList, a) => {
    const start = a.length > 1 ? Number(toBig(a[1] as bigint)) : 0;
    const i = l.items.findIndex((x, k) => k >= start && I.eq(x, a[0]));
    if (i < 0) I.raise('ValueError', `${I.runSync(I.repr(a[0]))} is not in list`);
    return BigInt(i);
  },
  count: (I, l: PyList, a) => BigInt(l.items.filter((x) => I.eq(x, a[0])).length),
  sort: function* (I, l: PyList, _a, kw) {
    yield* sortList(I, l.items, kw.get('key') ?? null, I.truthSync(kw.get('reverse') ?? false));
    return null;
  },
  reverse: (_, l: PyList) => {
    l.items.reverse();
    return null;
  },
  copy: (_, l: PyList) => new PyList([...l.items]),
};

const TUPLE: Record<string, Method> = {
  count: (I, t: PyTuple, a) => BigInt(t.items.filter((x) => I.eq(x, a[0])).length),
  index: (I, t: PyTuple, a) => {
    const i = t.items.findIndex((x) => I.eq(x, a[0]));
    if (i < 0) I.raise('ValueError', 'tuple.index(x): x not in tuple');
    return BigInt(i);
  },
};

const DICT: Record<string, Method> = {
  keys: (_, d: PyDict) => new PyDictView(d, 'keys'),
  values: (_, d: PyDict) => new PyDictView(d, 'values'),
  items: (_, d: PyDict) => new PyDictView(d, 'items'),
  get: (I, d: PyDict, a) => d.get(I.hashable(a[0])) ?? (a.length > 1 ? a[1] : null),
  setdefault: (I, d: PyDict, a) => {
    const k = I.hashable(a[0]);
    if (!d.has(k)) d.set(k, a.length > 1 ? a[1] : null);
    return d.get(k)!;
  },
  pop: (I, d: PyDict, a) => {
    const v = d.get(I.hashable(a[0]));
    if (v === undefined) {
      if (a.length > 1) return a[1];
      throw I.keyError(a[0]);
    }
    d.delete(a[0]);
    return v;
  },
  popitem: (I, d: PyDict, a, kw) => {
    const e = d.entries();
    if (!e.length) I.raise('KeyError', "'popitem(): dictionary is empty'");
    const last = a.length ? I.truthSync(a[0]) : kw.has('last') ? I.truthSync(kw.get('last')!) : true;
    const [k, v] = last ? e[e.length - 1] : e[0];
    d.delete(k);
    return new PyTuple([k, v]);
  },
  update: function* (I, d: PyDict, a, kw) {
    if (d.flavor === 'Counter') {
      if (a.length) {
        if (a[0] instanceof PyDict) for (const [k, v] of a[0].entries()) d.set(k, toBig((d.get(k) ?? 0n) as bigint) + toBig(v as bigint));
        else for (const x of yield* I.toArray(a[0])) d.set(I.hashable(x), toBig((d.get(x) ?? 0n) as bigint) + 1n);
      }
      return null;
    }
    if (a.length) yield* dictUpdate(I, d, a[0]);
    for (const [k, v] of kw) d.set(k, v);
    return null;
  },
  clear: (_, d: PyDict) => {
    d.map.clear();
    return null;
  },
  copy: (_, d: PyDict) => {
    const n = new PyDict(d.flavor, d.defaultFactory);
    for (const [k, v] of d.entries()) n.set(k, v);
    return n;
  },
  // Counter extras
  most_common: (_, d: PyDict, a) => {
    const e = [...d.entries()].sort((x, y) => Number(toBig(y[1] as bigint) - toBig(x[1] as bigint)));
    const n = a.length && a[0] !== null ? Number(toBig(a[0] as bigint)) : e.length;
    return new PyList(e.slice(0, n).map(([k, v]) => new PyTuple([k, v])));
  },
  elements: (_, d: PyDict) => {
    const out: PyVal[] = [];
    for (const [k, v] of d.entries()) for (let i = 0n; i < toBig(v as bigint); i++) out.push(k);
    const L = new PyList(out);
    let i = 0;
    return new PyIter('itertools.chain', () => (i < L.items.length ? L.items[i++] : STOP));
  },
  total: (_, d: PyDict) => d.values().reduce<bigint>((s, v) => s + toBig(v as bigint), 0n),
  subtract: function* (I, d: PyDict, a) {
    if (a[0] instanceof PyDict) for (const [k, v] of a[0].entries()) d.set(k, toBig((d.get(k) ?? 0n) as bigint) - toBig(v as bigint));
    else for (const x of yield* I.toArray(a[0])) d.set(x, toBig((d.get(x) ?? 0n) as bigint) - 1n);
    return null;
  },
  move_to_end: (I, d: PyDict, a, kw) => {
    if (!d.has(a[0])) throw I.keyError(a[0]);
    const v = d.get(a[0])!;
    d.delete(a[0]);
    const last = a.length > 1 ? I.truthSync(a[1]) : kw.has('last') ? I.truthSync(kw.get('last')!) : true;
    if (!last) {
      const rest = d.entries();
      d.map.clear();
      d.set(a[0], v);
      for (const [k, x] of rest) d.set(k, x);
    } else d.set(a[0], v);
    return null;
  },
};

const SET: Record<string, Method> = {
  add: (I, s: PySet, a) => {
    s.add(I.hashable(a[0]));
    return null;
  },
  remove: (I, s: PySet, a) => {
    if (!s.map.delete(keyOfSafe(I, a[0]))) throw I.keyError(a[0]);
    return null;
  },
  discard: (I, s: PySet, a) => {
    s.map.delete(keyOfSafe(I, a[0]));
    return null;
  },
  pop: (I, s: PySet) => {
    const vals = I.setOrder(s);
    if (!vals.length) I.raise('KeyError', "'pop from an empty set'");
    s.map.delete(keyOfSafe(I, vals[0]));
    return vals[0];
  },
  clear: (_, s: PySet) => {
    s.map.clear();
    return null;
  },
  copy: (_, s: PySet) => {
    const n = new PySet(s.frozen);
    s.values().forEach((v) => n.add(v));
    return n;
  },
  union: function* (I, s: PySet, a) {
    let r: PyVal = SET.copy(I, s, [], new Map()) as PySet;
    for (const o of a) r = yield* I.binop('|', r, yield* asSet(I, o));
    return r;
  },
  intersection: function* (I, s: PySet, a) {
    let r: PyVal = s;
    for (const o of a) r = yield* I.binop('&', r, yield* asSet(I, o));
    return r === s ? (SET.copy(I, s, [], new Map()) as PyVal) : r;
  },
  difference: function* (I, s: PySet, a) {
    let r: PyVal = s;
    for (const o of a) r = yield* I.binop('-', r, yield* asSet(I, o));
    return r === s ? (SET.copy(I, s, [], new Map()) as PyVal) : r;
  },
  symmetric_difference: function* (I, s: PySet, a) {
    return yield* I.binop('^', s, yield* asSet(I, a[0]));
  },
  update: function* (I, s: PySet, a) {
    for (const o of a) for (const v of yield* I.toArray(o)) s.add(I.hashable(v));
    return null;
  },
  intersection_update: function* (I, s: PySet, a) {
    const r = (yield* I.binop('&', s, yield* asSet(I, a[0]))) as PySet;
    s.map = r.map;
    return null;
  },
  difference_update: function* (I, s: PySet, a) {
    const r = (yield* I.binop('-', s, yield* asSet(I, a[0]))) as PySet;
    s.map = r.map;
    return null;
  },
  issubset: function* (I, s: PySet, a) {
    return yield* I.compare('<=', s, yield* asSet(I, a[0]));
  },
  issuperset: function* (I, s: PySet, a) {
    return yield* I.compare('>=', s, yield* asSet(I, a[0]));
  },
  isdisjoint: function* (I, s: PySet, a) {
    const o = yield* asSet(I, a[0]);
    return !s.values().some((v) => o.has(v));
  },
};

function keyOfSafe(I: Interp, v: PyVal) {
  I.hashable(v);
  // re-use the map's own key function via a temporary set
  const t = new PySet();
  t.add(v);
  return [...t.map.keys()][0];
}

function* asSet(I: Interp, v: PyVal): G<PySet> {
  if (v instanceof PySet) return v;
  const s = new PySet();
  for (const x of yield* I.toArray(v)) s.add(I.hashable(x));
  return s;
}

const DEQUE: Record<string, Method> = {
  append: (_, d: PyDeque, a) => {
    d.items.push(a[0]);
    if (d.maxlen !== null && d.items.length > d.maxlen) d.items.shift();
    return null;
  },
  appendleft: (_, d: PyDeque, a) => {
    d.items.unshift(a[0]);
    if (d.maxlen !== null && d.items.length > d.maxlen) d.items.pop();
    return null;
  },
  pop: (I, d: PyDeque) => {
    if (!d.items.length) I.raise('IndexError', 'pop from an empty deque');
    return d.items.pop()!;
  },
  popleft: (I, d: PyDeque) => {
    if (!d.items.length) I.raise('IndexError', 'pop from an empty deque');
    return d.items.shift()!;
  },
  extend: function* (I, d: PyDeque, a) {
    for (const x of yield* I.toArray(a[0])) DEQUE.append(I, d, [x], new Map());
    return null;
  },
  extendleft: function* (I, d: PyDeque, a) {
    for (const x of yield* I.toArray(a[0])) DEQUE.appendleft(I, d, [x], new Map());
    return null;
  },
  rotate: (_, d: PyDeque, a) => {
    const n = d.items.length;
    if (!n) return null;
    let k = Number(toBig((a[0] ?? 1n) as bigint)) % n;
    if (k < 0) k += n;
    d.items = [...d.items.slice(n - k), ...d.items.slice(0, n - k)];
    return null;
  },
  clear: (_, d: PyDeque) => {
    d.items.length = 0;
    return null;
  },
  count: (I, d: PyDeque, a) => BigInt(d.items.filter((x) => I.eq(x, a[0])).length),
  index: (I, d: PyDeque, a) => {
    const i = d.items.findIndex((x) => I.eq(x, a[0]));
    if (i < 0) I.raise('ValueError', 'deque.index(x): x not in deque');
    return BigInt(i);
  },
  remove: (I, d: PyDeque, a) => {
    const i = d.items.findIndex((x) => I.eq(x, a[0]));
    if (i < 0) I.raise('ValueError', 'deque.remove(x): x not in deque');
    d.items.splice(i, 1);
    return null;
  },
  copy: (_, d: PyDeque) => new PyDeque([...d.items], d.maxlen),
};

const INT: Record<string, Method> = {
  bit_length: (_, n: bigint | boolean) => {
    const v = toBig(n);
    return BigInt((v < 0n ? -v : v).toString(2).replace(/^0$/, '').length);
  },
  bit_count: (_, n: bigint | boolean) => BigInt([...toBig(n).toString(2)].filter((c) => c === '1').length),
  conjugate: (_, n: bigint) => n,
};
const FLOAT: Record<string, Method> = {
  is_integer: (_, x: number) => Number.isInteger(x),
  conjugate: (_, x: number) => x,
};
const GEN: Record<string, Method> = {
  send: function* (I, g: PyGenerator, a) {
    const r = yield* I.genResume(g, a[0]);
    if (r === STOP) I.raise('StopIteration');
    return r as PyVal;
  },
  close: (_, g: PyGenerator) => {
    g.finished = true;
    return null;
  },
};
const VIEW: Record<string, Method> = {
  isdisjoint: (I, v: PyDictView, a) => !v.items().some((x) => (a[0] as PySet).has?.(x)),
};

export function methodOf(I: Interp, o: PyVal, name: string): PyVal | null {
  let table: Record<string, Method> | null = null;
  if (typeof o === 'string') table = STR;
  else if (o instanceof PyList) table = LIST;
  else if (o instanceof PyTuple) table = TUPLE;
  else if (o instanceof PyDict) table = DICT;
  else if (o instanceof PySet) table = SET;
  else if (o instanceof PyDeque) table = DEQUE;
  else if (typeof o === 'bigint' || typeof o === 'boolean') table = INT;
  else if (typeof o === 'number') table = FLOAT;
  else if (o instanceof PyGenerator) table = GEN;
  else if (o instanceof PyDictView) table = VIEW;
  if (o instanceof PyDeque && name === 'maxlen') return o.maxlen === null ? null : BigInt(o.maxlen);
  if (o instanceof PyDict && name === 'default_factory') return o.defaultFactory;
  if ((typeof o === 'bigint' || typeof o === 'boolean') && (name === 'real' || name === 'numerator')) return toBig(o);
  if ((typeof o === 'bigint' || typeof o === 'boolean') && name === 'denominator') return 1n;
  if (typeof o === 'number' && name === 'real') return o;
  if (!table || !Object.prototype.hasOwnProperty.call(table, name)) return null;
  const m = table[name];
  if ((o instanceof PyDict && o.flavor !== 'Counter' && ['most_common', 'elements', 'total', 'subtract'].includes(name)) || (o instanceof PyDict && o.flavor !== 'OrderedDict' && name === 'move_to_end')) return null;
  return new PyBuiltin(name, (a, kw) => m(I, o, a, kw), o);
}

// =====================================================================
//  standard library modules
// =====================================================================

function registerModules(I: Interp) {
  const T = I.T;
  registerNumpy(I);
  const mod = (name: string, build: (d: Map<string, PyVal>) => void) => {
    I.moduleFactories.set(name, () => {
      const d = new Map<string, PyVal>();
      build(d);
      return new PyModule(name, d);
    });
  };
  const f = (d: Map<string, PyVal>, name: string, impl: BuiltinImpl) => d.set(name, new PyBuiltin(name, impl));
  const num = (v: PyVal) => {
    if (v instanceof NDArray || v instanceof NPScalar) return npToNumber(I, v, false) as number;
    if (!isNum(v)) I.raise('TypeError', `must be real number, not ${typeNameOf(v)}`);
    return toNum(v as number);
  };
  const int = (v: PyVal) => {
    if (v instanceof NPScalar && v.dtype !== 'float64') return BigInt(v.v);
    if (typeof v !== 'bigint' && typeof v !== 'boolean') I.raise('TypeError', `'${typeNameOf(v)}' object cannot be interpreted as an integer`);
    return toBig(v as bigint);
  };

  mod('math', (d) => {
    d.set('pi', Math.PI);
    d.set('e', Math.E);
    d.set('tau', 2 * Math.PI);
    d.set('inf', Infinity);
    d.set('nan', NaN);
    f(d, 'sqrt', (a) => {
      const x = num(a[0]);
      if (x < 0) I.raise('ValueError', 'math domain error');
      return Math.sqrt(x);
    });
    f(d, 'isqrt', (a) => {
      const n = int(a[0]);
      if (n < 0n) I.raise('ValueError', 'isqrt() argument must be nonnegative');
      if (n < 2n) return n;
      let x = BigInt(Math.floor(Math.sqrt(Number(n))));
      while (x * x > n) x--;
      while ((x + 1n) * (x + 1n) <= n) x++;
      return x;
    });
    f(d, 'floor', (a) => (typeof a[0] === 'number' ? BigInt(Math.floor(a[0])) : toBig(a[0] as bigint)));
    f(d, 'ceil', (a) => (typeof a[0] === 'number' ? BigInt(Math.ceil(a[0])) : toBig(a[0] as bigint)));
    f(d, 'trunc', (a) => (typeof a[0] === 'number' ? BigInt(Math.trunc(a[0])) : toBig(a[0] as bigint)));
    f(d, 'fabs', (a) => Math.abs(num(a[0])));
    f(d, 'pow', (a) => Math.pow(num(a[0]), num(a[1])));
    f(d, 'exp', (a) => Math.exp(num(a[0])));
    f(d, 'log', (a) => {
      const x = num(a[0]);
      if (x <= 0) I.raise('ValueError', 'math domain error');
      return a.length > 1 ? Math.log(x) / Math.log(num(a[1])) : Math.log(x);
    });
    f(d, 'log2', (a) => Math.log2(num(a[0])));
    f(d, 'log10', (a) => Math.log10(num(a[0])));
    for (const fnName of ['sin', 'cos', 'tan', 'asin', 'acos', 'atan'] as const) f(d, fnName, (a) => Math[fnName](num(a[0])));
    f(d, 'atan2', (a) => Math.atan2(num(a[0]), num(a[1])));
    f(d, 'hypot', (a) => Math.hypot(...a.map(num)));
    f(d, 'radians', (a) => (num(a[0]) * Math.PI) / 180);
    f(d, 'degrees', (a) => (num(a[0]) * 180) / Math.PI);
    f(d, 'isclose', (a, kw) => {
      const x = num(a[0]), y = num(a[1]);
      const rel = kw.has('rel_tol') ? num(kw.get('rel_tol')!) : 1e-9, abs = kw.has('abs_tol') ? num(kw.get('abs_tol')!) : 0;
      return Math.abs(x - y) <= Math.max(rel * Math.max(Math.abs(x), Math.abs(y)), abs);
    });
    f(d, 'isinf', (a) => !isFinite(num(a[0])) && !isNaN(num(a[0])));
    f(d, 'isnan', (a) => isNaN(num(a[0])));
    f(d, 'isfinite', (a) => isFinite(num(a[0])));
    const gcd = (x: bigint, y: bigint): bigint => {
      x = x < 0n ? -x : x;
      y = y < 0n ? -y : y;
      while (y) [x, y] = [y, x % y];
      return x;
    };
    f(d, 'gcd', (a) => a.map(int).reduce(gcd, 0n));
    f(d, 'lcm', (a) => a.map(int).reduce((x, y) => (x === 0n || y === 0n ? 0n : (x * y < 0n ? -(x * y) : x * y) / gcd(x, y)), 1n));
    f(d, 'factorial', (a) => {
      const n = int(a[0]);
      if (n < 0n) I.raise('ValueError', 'factorial() not defined for negative values');
      let r = 1n;
      for (let i = 2n; i <= n; i++) r *= i;
      return r;
    });
    f(d, 'comb', (a) => {
      const n = int(a[0]), k = int(a[1]);
      if (k < 0n || k > n) return 0n;
      let r = 1n;
      for (let i = 1n; i <= k; i++) r = (r * (n - k + i)) / i;
      return r;
    });
    f(d, 'perm', (a) => {
      const n = int(a[0]), k = a.length > 1 && a[1] !== null ? int(a[1]) : n;
      if (k > n) return 0n;
      let r = 1n;
      for (let i = 0n; i < k; i++) r *= n - i;
      return r;
    });
    f(d, 'prod', function* (a, kw) {
      let acc: PyVal = kw.get('start') ?? 1n;
      for (const x of yield* I.toArray(a[0])) acc = yield* I.binop('*', acc, x);
      return acc;
    });
    f(d, 'fsum', function* (a) {
      return (yield* I.toArray(a[0])).reduce<number>((s, x) => s + toNum(x as number), 0);
    });
    f(d, 'dist', function* (a) {
      const p = yield* I.toArray(a[0]), q = yield* I.toArray(a[1]);
      return Math.hypot(...p.map((x, i) => toNum(x as number) - toNum(q[i] as number)));
    });
  });

  // collections
  const counterT = new PyClass('Counter', [T.dict], new Map(), 'Counter');
  counterT.dict.set('__new_builtin__', new PyBuiltin('Counter', function* (a, kw) {
    const c = new PyDict('Counter');
    if (a.length) {
      if (a[0] instanceof PyDict) for (const [k, v] of a[0].entries()) c.set(k, v);
      else for (const x of yield* I.toArray(a[0])) c.set(I.hashable(x), toBig((c.get(x) ?? 0n) as bigint) + 1n);
    }
    for (const [k, v] of kw) c.set(k, v);
    return c;
  }));
  T.Counter = counterT;
  const ddT = new PyClass('defaultdict', [T.dict], new Map(), 'defaultdict');
  ddT.dict.set('__new_builtin__', new PyBuiltin('defaultdict', function* (a, kw) {
    const dd = new PyDict('defaultdict', a[0] ?? null);
    if (a.length > 1) yield* dictUpdate(I, dd, a[1]);
    for (const [k, v] of kw) dd.set(k, v);
    return dd;
  }));
  T.defaultdict = ddT;
  const odT = new PyClass('OrderedDict', [T.dict], new Map(), 'OrderedDict');
  odT.dict.set('__new_builtin__', new PyBuiltin('OrderedDict', function* (a, kw) {
    const od = new PyDict('OrderedDict');
    if (a.length) yield* dictUpdate(I, od, a[0]);
    for (const [k, v] of kw) od.set(k, v);
    return od;
  }));
  T.OrderedDict = odT;
  const dequeT = new PyClass('deque', [T.object], new Map(), 'deque');
  dequeT.dict.set('__new_builtin__', new PyBuiltin('deque', function* (a, kw) {
    const ml = a[1] ?? kw.get('maxlen') ?? null;
    const dq = new PyDeque([], ml === null ? null : Number(toBig(ml as bigint)));
    if (a.length && a[0] !== null) for (const x of yield* I.toArray(a[0])) DEQUE.append(I, dq, [x], new Map());
    return dq;
  }));
  T.deque = dequeT;
  mod('collections', (d) => {
    d.set('Counter', counterT);
    d.set('defaultdict', ddT);
    d.set('OrderedDict', odT);
    d.set('deque', dequeT);
    f(d, 'namedtuple', function* (a, kw) {
      const name = a[0] as string;
      let fields: string[] = [];
      const fv = a[1] ?? kw.get('field_names')!;
      if (typeof fv === 'string') fields = fv.replace(/,/g, ' ').split(/\s+/).filter(Boolean);
      else fields = (yield* I.toArray(fv)) as string[];
      const cls = new PyClass(name, [T.object]);
      cls.dict.set('_fields', new PyTuple(fields));
      cls.dict.set('__init__', new PyBuiltin('__init__', (args, k2) => {
        const self = args[0] as PyInstance;
        fields.forEach((fname, i) => self.attrs.set(fname, i + 1 < args.length ? args[i + 1] : k2.get(fname) ?? null));
        return null;
      }));
      cls.dict.set('__repr__', new PyBuiltin('__repr__', function* (args) {
        const self = args[0] as PyInstance;
        const parts: string[] = [];
        for (const fname of fields) parts.push(`${fname}=${yield* I.repr(self.attrs.get(fname)!)}`);
        return `${name}(${parts.join(', ')})`;
      }));
      cls.dict.set('__eq__', new PyBuiltin('__eq__', (args) => {
        const x = args[0] as PyInstance, y = args[1];
        if (y instanceof PyTuple) return y.items.length === fields.length && fields.every((fn, i) => I.eq(x.attrs.get(fn)!, y.items[i]));
        return y instanceof PyInstance && fields.every((fn) => I.eq(x.attrs.get(fn)!, y.attrs.get(fn)!));
      }));
      cls.dict.set('__lt__', new PyBuiltin('__lt__', (args) => {
        const x = args[0] as PyInstance, y = args[1] as PyInstance;
        return I.cmpOrder(new PyTuple(fields.map((fn) => x.attrs.get(fn)!)), new PyTuple(fields.map((fn) => (y instanceof PyInstance ? y.attrs.get(fn)! : null)))) < 0;
      }));
      cls.dict.set('_replace', new PyBuiltin('_replace', (args, k2) => {
        const x = args[0] as PyInstance;
        const n = new PyInstance(cls);
        fields.forEach((fn) => n.attrs.set(fn, k2.has(fn) ? k2.get(fn)! : x.attrs.get(fn)!));
        return n;
      }));
      cls.dict.set('_make', new PyClassMethod(new PyBuiltin('_make', function* (args) {
        const vals = yield* I.toArray(args[1]);
        const n = new PyInstance(cls);
        fields.forEach((fn, i) => n.attrs.set(fn, vals[i] ?? null));
        return n;
      })));
      cls.dict.set('__iter__', new PyBuiltin('__iter__', (args) => {
        const self = args[0] as PyInstance;
        const vals = fields.map((fn) => self.attrs.get(fn)!);
        let i = 0;
        return new PyIter('tuple_iterator', () => (i < vals.length ? vals[i++] : STOP));
      }));
      cls.dict.set('__getitem__', new PyBuiltin('__getitem__', (args) => (args[0] as PyInstance).attrs.get(fields[Number(toBig(args[1] as bigint))])!));
      cls.dict.set('__len__', new PyBuiltin('__len__', () => BigInt(fields.length)));
      cls.dict.set('__hash__', new PyBuiltin('__hash__', () => 0n));
      cls.dict.set('_asdict', new PyBuiltin('_asdict', (args) => {
        const out = new PyDict();
        fields.forEach((fn) => out.set(fn, (args[0] as PyInstance).attrs.get(fn)!));
        return out;
      }));
      return cls;
    });
  });

  mod('heapq', (d) => {
    const lt = (a: PyVal, b: PyVal) => I.cmpOrder(a, b) < 0;
    const siftDown = (h: PyVal[], start: number, pos: number) => {
      const item = h[pos];
      while (pos > start) {
        const parent = (pos - 1) >> 1;
        if (lt(item, h[parent])) {
          h[pos] = h[parent];
          pos = parent;
        } else break;
      }
      h[pos] = item;
    };
    const siftUp = (h: PyVal[], pos: number) => {
      const end = h.length, start = pos, item = h[pos];
      let child = 2 * pos + 1;
      while (child < end) {
        const right = child + 1;
        if (right < end && !lt(h[child], h[right])) child = right;
        h[pos] = h[child];
        pos = child;
        child = 2 * pos + 1;
      }
      h[pos] = item;
      siftDown(h, start, pos);
    };
    const L = (v: PyVal) => {
      if (!(v instanceof PyList)) I.raise('TypeError', 'heap argument must be a list');
      return (v as PyList).items;
    };
    f(d, 'heappush', (a) => {
      const h = L(a[0]);
      h.push(a[1]);
      siftDown(h, 0, h.length - 1);
      return null;
    });
    f(d, 'heappop', (a) => {
      const h = L(a[0]);
      if (!h.length) I.raise('IndexError', 'index out of range');
      const last = h.pop()!;
      if (h.length) {
        const ret = h[0];
        h[0] = last;
        siftUp(h, 0);
        return ret;
      }
      return last;
    });
    f(d, 'heapify', (a) => {
      const h = L(a[0]);
      for (let i = (h.length >> 1) - 1; i >= 0; i--) siftUp(h, i);
      return null;
    });
    f(d, 'heappushpop', (a) => {
      const h = L(a[0]);
      let item = a[1];
      if (h.length && lt(h[0], item)) {
        [item, h[0]] = [h[0], item];
        siftUp(h, 0);
      }
      return item;
    });
    f(d, 'heapreplace', (a) => {
      const h = L(a[0]);
      if (!h.length) I.raise('IndexError', 'index out of range');
      const ret = h[0];
      h[0] = a[1];
      siftUp(h, 0);
      return ret;
    });
    const nk = (largest: boolean) =>
      function* (a: PyVal[], kw: Kw): G<PyVal> {
        const items = yield* I.toArray(a[1]);
        yield* sortList(I, items, kw.get('key') ?? null, largest);
        return new PyList(items.slice(0, Number(toBig(a[0] as bigint))));
      };
    f(d, 'nlargest', nk(true));
    f(d, 'nsmallest', nk(false));
  });

  mod('bisect', (d) => {
    const bis = (right: boolean) => (a: PyVal[], kw: Kw) => {
      const xs = (a[0] as PyList).items;
      const x = a[1];
      const key = kw.get('key') ?? null;
      let lo = Number(toBig((a[2] ?? kw.get('lo') ?? 0n) as bigint)), hi = a[3] !== undefined ? Number(toBig(a[3] as bigint)) : xs.length;
      while (lo < hi) {
        const mid = (lo + hi) >> 1;
        const mv = key !== null ? I.runSync(I.call(key, [xs[mid]])) : xs[mid];
        const c = I.cmpOrder(x, mv);
        if (right ? c < 0 : c <= 0) hi = mid;
        else lo = mid + 1;
      }
      return BigInt(lo);
    };
    f(d, 'bisect_left', bis(false));
    f(d, 'bisect_right', bis(true));
    f(d, 'bisect', bis(true));
    f(d, 'insort', (a, kw) => {
      (a[0] as PyList).items.splice(Number(bis(true)(a, kw)), 0, a[1]);
      return null;
    });
    f(d, 'insort_left', (a, kw) => {
      (a[0] as PyList).items.splice(Number(bis(false)(a, kw)), 0, a[1]);
      return null;
    });
  });

  mod('functools', (d) => {
    f(d, 'reduce', function* (a) {
      const items = yield* I.toArray(a[1]);
      let acc: PyVal;
      let i = 0;
      if (a.length > 2) acc = a[2];
      else {
        if (!items.length) I.raise('TypeError', 'reduce() of empty iterable with no initial value');
        acc = items[0];
        i = 1;
      }
      for (; i < items.length; i++) acc = yield* I.call(a[0], [acc, items[i]]);
      return acc;
    });
    const memo = (fnv: PyVal) => {
      const cache = new Map<string, PyVal>();
      const wrapped = new PyBuiltin(fnv instanceof PyFunc ? fnv.name : 'cached', function* (args, kw) {
        const key = args.map((x) => {
          I.hashable(x);
          const t = new PySet();
          t.add(x);
          return [...t.map.keys()][0];
        }).join('|') + '|' + [...kw].map(([k, v]) => k + '=' + String(v)).join(',');
        if (cache.has(key)) return cache.get(key)!;
        const r = yield* I.call(fnv, args, kw);
        cache.set(key, r);
        return r;
      });
      (wrapped as PyBuiltin & { wrapped?: PyVal }).wrapped = fnv;
      let hits = 0;
      void hits;
      (wrapped as PyBuiltin & { extra?: Map<string, PyVal> }).extra = new Map<string, PyVal>([
        ['cache_info', new PyBuiltin('cache_info', () => `CacheInfo(currsize=${cache.size})`)],
        ['cache_clear', new PyBuiltin('cache_clear', () => { cache.clear(); return null; })],
        ['__wrapped__', fnv],
      ]);
      return wrapped;
    };
    f(d, 'lru_cache', (a) => {
      if (a.length && (a[0] instanceof PyFunc || a[0] instanceof PyBuiltin)) return memo(a[0]);
      return new PyBuiltin('lru_cache', (b) => memo(b[0]));
    });
    f(d, 'cache', (a) => memo(a[0]));
    f(d, 'cmp_to_key', (a) => {
      const cmpFn = a[0];
      const K = new PyClass('K', [T.object]);
      K.dict.set('__init__', new PyBuiltin('__init__', (b) => {
        (b[0] as PyInstance).attrs.set('obj', b[1]);
        return null;
      }));
      K.dict.set('__lt__', new PyBuiltin('__lt__', function* (b) {
        const r = yield* I.call(cmpFn, [(b[0] as PyInstance).attrs.get('obj')!, (b[1] as PyInstance).attrs.get('obj')!]);
        return toNum(r as bigint) < 0;
      }));
      return K;
    });
    f(d, 'partial', (a, kw) => {
      const target = a[0];
      const bound = a.slice(1);
      return new PyBuiltin('partial', function* (b, k2) {
        return yield* I.call(target, [...bound, ...b], new Map([...kw, ...k2]));
      });
    });
    f(d, 'wraps', () => new PyBuiltin('wraps', (b) => b[0]));
    f(d, 'total_ordering', (a) => a[0]);
  });

  mod('itertools', (d) => {
    const fromArray = (kind: string, items: PyVal[]) => {
      let i = 0;
      return new PyIter(kind, () => (i < items.length ? items[i++] : STOP));
    };
    f(d, 'permutations', function* (a) {
      const items = yield* I.toArray(a[0]);
      const r = a.length > 1 && a[1] !== null ? Number(toBig(a[1] as bigint)) : items.length;
      const out: PyVal[] = [];
      const rec = (cur: number[], used: boolean[]) => {
        if (cur.length === r) return void out.push(new PyTuple(cur.map((i) => items[i])));
        for (let i = 0; i < items.length; i++)
          if (!used[i]) {
            used[i] = true;
            cur.push(i);
            rec(cur, used);
            cur.pop();
            used[i] = false;
          }
      };
      if (r <= items.length) rec([], []);
      return fromArray('itertools.permutations', out);
    });
    const combos = (withRep: boolean) =>
      function* (a: PyVal[]): G<PyVal> {
        const items = yield* I.toArray(a[0]);
        const r = Number(toBig(a[1] as bigint));
        const out: PyVal[] = [];
        const rec = (start: number, cur: PyVal[]) => {
          if (cur.length === r) return void out.push(new PyTuple([...cur]));
          for (let i = start; i < items.length; i++) {
            cur.push(items[i]);
            rec(withRep ? i : i + 1, cur);
            cur.pop();
          }
        };
        rec(0, []);
        return fromArray('itertools.combinations', out);
      };
    f(d, 'combinations', combos(false));
    f(d, 'combinations_with_replacement', combos(true));
    f(d, 'product', function* (a, kw) {
      let pools: PyVal[][] = [];
      for (const x of a) pools.push(yield* I.toArray(x));
      const rep = kw.has('repeat') ? Number(toBig(kw.get('repeat') as bigint)) : 1;
      const base = pools;
      pools = [];
      for (let i = 0; i < rep; i++) pools.push(...base);
      let res: PyVal[][] = [[]];
      for (const p of pools) res = res.flatMap((r) => p.map((x) => [...r, x]));
      return fromArray('itertools.product', res.map((r) => new PyTuple(r)));
    });
    f(d, 'accumulate', function* (a, kw) {
      const items = yield* I.toArray(a[0]);
      const fnv = a[1] ?? kw.get('func') ?? null;
      const out: PyVal[] = [];
      let acc: PyVal | undefined = kw.has('initial') ? kw.get('initial')! : undefined;
      if (acc !== undefined) out.push(acc);
      for (const x of items) {
        acc = acc === undefined ? x : fnv !== null ? yield* I.call(fnv, [acc, x]) : yield* I.binop('+', acc, x);
        out.push(acc);
      }
      return fromArray('itertools.accumulate', out);
    });
    f(d, 'chain', function* (a) {
      const out: PyVal[] = [];
      for (const x of a) out.push(...(yield* I.toArray(x)));
      return fromArray('itertools.chain', out);
    });
    d.get('chain') && ((d.get('chain') as PyBuiltin & { from_iterable?: PyVal }).from_iterable = null);
    f(d, 'count', (a) => {
      let i: PyVal = a[0] ?? 0n;
      const step = a[1] ?? 1n;
      return new PyIter('itertools.count', function* () {
        const v = i;
        i = yield* I.binop('+', i, step);
        return v;
      } as () => G<NextResult>);
    });
    f(d, 'repeat', (a) => {
      let n = a.length > 1 ? Number(toBig(a[1] as bigint)) : Infinity;
      return new PyIter('itertools.repeat', () => (n-- > 0 ? a[0] : STOP));
    });
    f(d, 'cycle', function* (a) {
      const items = yield* I.toArray(a[0]);
      let i = 0;
      return new PyIter('itertools.cycle', () => (items.length ? items[i++ % items.length] : STOP));
    });
    f(d, 'islice', function* (a) {
      const it = yield* I.iter(a[0]);
      const args = a.slice(1).map((x) => (x === null ? null : Number(toBig(x as bigint))));
      const [start, stop, step] = args.length === 1 ? [0, args[0], 1] : [args[0] ?? 0, args[1], args[2] ?? 1];
      let i = 0;
      let nextIdx = start;
      return new PyIter('itertools.islice', function* () {
        for (;;) {
          if (stop !== null && stop !== undefined && nextIdx >= stop) return STOP;
          const x = yield* I.next(it);
          if (x === STOP) return STOP;
          if (i++ === nextIdx) {
            nextIdx += step;
            return x;
          }
        }
      } as () => G<NextResult>);
    });
    f(d, 'groupby', function* (a, kw) {
      const items = yield* I.toArray(a[0]);
      const key = a[1] ?? kw.get('key') ?? null;
      const groups: PyVal[] = [];
      let curK: PyVal | undefined;
      let cur: PyVal[] = [];
      for (const x of items) {
        const k = key !== null ? yield* I.call(key, [x]) : x;
        if (curK !== undefined && I.eq(k, curK)) cur.push(x);
        else {
          if (curK !== undefined) groups.push(new PyTuple([curK, fromArray('itertools._grouper', cur)]));
          curK = k;
          cur = [x];
        }
      }
      if (curK !== undefined) groups.push(new PyTuple([curK, fromArray('itertools._grouper', cur)]));
      return fromArray('itertools.groupby', groups);
    });
    f(d, 'zip_longest', function* (a, kw) {
      const lists: PyVal[][] = [];
      for (const x of a) lists.push(yield* I.toArray(x));
      const fill = kw.get('fillvalue') ?? null;
      const n = Math.max(0, ...lists.map((l) => l.length));
      const out: PyVal[] = [];
      for (let i = 0; i < n; i++) out.push(new PyTuple(lists.map((l) => (i < l.length ? l[i] : fill))));
      return fromArray('itertools.zip_longest', out);
    });
    f(d, 'takewhile', function* (a) {
      const out: PyVal[] = [];
      for (const x of yield* I.toArray(a[1])) {
        if (!(yield* I.truth(yield* I.call(a[0], [x])))) break;
        out.push(x);
      }
      return fromArray('itertools.takewhile', out);
    });
    f(d, 'dropwhile', function* (a) {
      const items = yield* I.toArray(a[1]);
      let i = 0;
      while (i < items.length && (yield* I.truth(yield* I.call(a[0], [items[i]])))) i++;
      return fromArray('itertools.dropwhile', items.slice(i));
    });
    f(d, 'filterfalse', function* (a) {
      const out: PyVal[] = [];
      for (const x of yield* I.toArray(a[1])) if (!(yield* I.truth(a[0] === null ? x : yield* I.call(a[0], [x])))) out.push(x);
      return fromArray('itertools.filterfalse', out);
    });
    f(d, 'pairwise', function* (a) {
      const items = yield* I.toArray(a[0]);
      return fromArray('itertools.pairwise', items.slice(1).map((x, i) => new PyTuple([items[i], x])));
    });
    f(d, 'starmap', function* (a) {
      const out: PyVal[] = [];
      for (const args of yield* I.toArray(a[1])) out.push(yield* I.call(a[0], yield* I.toArray(args)));
      return fromArray('itertools.starmap', out);
    });
  });

  mod('string', (d) => {
    d.set('ascii_lowercase', 'abcdefghijklmnopqrstuvwxyz');
    d.set('ascii_uppercase', 'ABCDEFGHIJKLMNOPQRSTUVWXYZ');
    d.set('ascii_letters', 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ');
    d.set('digits', '0123456789');
    d.set('hexdigits', '0123456789abcdefABCDEF');
    d.set('punctuation', '!"#$%&\'()*+,-./:;<=>?@[\\]^_`{|}~');
    d.set('whitespace', ' \t\n\r\x0b\x0c');
  });

  mod('sys', (d) => {
    d.set('maxsize', 9223372036854775807n);
    f(d, 'setrecursionlimit', (a) => {
      I.recursionLimit = Math.min(3000, Number(toBig(a[0] as bigint)));
      return null;
    });
    f(d, 'getrecursionlimit', () => BigInt(I.recursionLimit));
    f(d, 'getsizeof', (a) => {
      const v = a[0];
      if (v instanceof PyList) return BigInt(56 + 8 * v.items.length);
      if (v instanceof PyTuple) return BigInt(40 + 8 * v.items.length);
      if (typeof v === 'string') return BigInt(41 + v.length);
      if (typeof v === 'bigint') return 28n;
      if (typeof v === 'number') return 24n;
      if (v instanceof PyDict) return BigInt(64 + 40 * v.map.size);
      if (v instanceof PySet) return BigInt(216 + 16 * v.map.size);
      if (v instanceof PyGenerator || v instanceof PyIter) return 200n;
      return 56n;
    });
    d.set('version', '3.12 (Code Hero sandbox)');
    d.set('argv', new PyList(['main.py']));
    const stdout = new PyInstance(new PyClass('TextIO', [T.object]));
    stdout.cls.dict.set('write', new PyBuiltin('write', (a) => {
      I.out.push(String(a[1]));
      return BigInt(String(a[1]).length);
    }));
    d.set('stdout', stdout);
    const stdin = new PyInstance(new PyClass('TextIO', [T.object]));
    stdin.cls.dict.set('readline', new PyBuiltin('readline', () => (I.inputs.shift() ?? '') + '\n'));
    d.set('stdin', stdin);
  });

  mod('random', (d) => {
    let seed = 42;
    const rnd = () => {
      seed = (seed + 0x6d2b79f5) | 0;
      let t = seed;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    f(d, 'seed', (a) => {
      seed = a.length && a[0] !== null ? Number(toBig(a[0] as bigint)) : Date.now();
      return null;
    });
    f(d, 'random', () => rnd());
    f(d, 'randint', (a) => {
      const lo = toBig(a[0] as bigint), hi = toBig(a[1] as bigint);
      return lo + BigInt(Math.floor(rnd() * Number(hi - lo + 1n)));
    });
    f(d, 'randrange', (a) => {
      const [lo, hi] = a.length === 1 ? [0n, toBig(a[0] as bigint)] : [toBig(a[0] as bigint), toBig(a[1] as bigint)];
      return lo + BigInt(Math.floor(rnd() * Number(hi - lo)));
    });
    f(d, 'uniform', (a) => num(a[0]) + rnd() * (num(a[1]) - num(a[0])));
    f(d, 'choice', function* (a) {
      const items = yield* I.toArray(a[0]);
      if (!items.length) I.raise('IndexError', 'Cannot choose from an empty sequence');
      return items[Math.floor(rnd() * items.length)];
    });
    f(d, 'shuffle', (a) => {
      const xs = (a[0] as PyList).items;
      for (let i = xs.length - 1; i > 0; i--) {
        const j = Math.floor(rnd() * (i + 1));
        [xs[i], xs[j]] = [xs[j], xs[i]];
      }
      return null;
    });
    f(d, 'sample', function* (a) {
      const xs = [...(yield* I.toArray(a[0]))];
      const k = Number(toBig(a[1] as bigint));
      for (let i = xs.length - 1; i > 0; i--) {
        const j = Math.floor(rnd() * (i + 1));
        [xs[i], xs[j]] = [xs[j], xs[i]];
      }
      return new PyList(xs.slice(0, k));
    });
  });

  mod('copy', (d) => {
    f(d, 'copy', (a) => {
      const v = a[0];
      if (v instanceof PyList) return new PyList([...v.items]);
      if (v instanceof NDArray) return npCopy(v);
      if (v instanceof PyDict) return DICT.copy(I, v, [], new Map()) as PyVal;
      if (v instanceof PySet) return SET.copy(I, v, [], new Map()) as PyVal;
      if (v instanceof PyInstance) {
        const n = new PyInstance(v.cls);
        v.attrs.forEach((x, k) => n.attrs.set(k, x));
        return n;
      }
      return v;
    });
    const deep = (v: PyVal, memo: Map<number, PyVal>): PyVal => {
      if (v === null || typeof v !== 'object') return v;
      if (memo.has(v.id)) return memo.get(v.id)!;
      if (v instanceof NDArray) return npCopy(v);
      if (v instanceof PyList) {
        const n = new PyList();
        memo.set(v.id, n);
        n.items = v.items.map((x) => deep(x, memo));
        return n;
      }
      if (v instanceof PyTuple) return new PyTuple(v.items.map((x) => deep(x, memo)));
      if (v instanceof PyDict) {
        const n = new PyDict(v.flavor, v.defaultFactory);
        memo.set(v.id, n);
        for (const [k, x] of v.entries()) n.set(k, deep(x, memo));
        return n;
      }
      if (v instanceof PySet) {
        const n = new PySet(v.frozen);
        v.values().forEach((x) => n.add(x));
        return n;
      }
      if (v instanceof PyInstance) {
        const n = new PyInstance(v.cls);
        memo.set(v.id, n);
        v.attrs.forEach((x, k) => n.attrs.set(k, deep(x, memo)));
        return n;
      }
      return v;
    };
    f(d, 'deepcopy', (a) => deep(a[0], new Map()));
  });

  mod('typing', (d) => {
    for (const n of ['List', 'Dict', 'Set', 'Tuple', 'Optional', 'Union', 'Any', 'Callable', 'Iterable', 'Iterator', 'Generator', 'Deque', 'DefaultDict', 'Sequence', 'Mapping', 'FrozenSet', 'Type']) {
      d.set(n, new PyClass(n, [T.object], new Map(), 'typing'));
    }
  });

  mod('time', (d) => {
    f(d, 'time', () => Date.now() / 1000);
    f(d, 'perf_counter', () => performance.now() / 1000);
    f(d, 'sleep', () => null);
  });

  mod('operator', (d) => {
    f(d, 'itemgetter', (a) => new PyBuiltin('itemgetter', function* (b) {
      if (a.length === 1) return yield* I.getItem(b[0], a[0]);
      const out: PyVal[] = [];
      for (const k of a) out.push(yield* I.getItem(b[0], k));
      return new PyTuple(out);
    }));
    f(d, 'attrgetter', (a) => new PyBuiltin('attrgetter', function* (b) {
      return yield* I.getAttr(b[0], a[0] as string);
    }));
    for (const [n, op] of [['add', '+'], ['sub', '-'], ['mul', '*'], ['truediv', '/'], ['floordiv', '//'], ['mod', '%'], ['pow', '**']]) {
      f(d, n, function* (a) {
        return yield* I.binop(op, a[0], a[1]);
      });
    }
    f(d, 'neg', function* (a) {
      return yield* I.binop('-', 0n, a[0]);
    });
  });

  mod('dataclasses', (d) => {
    d.set('FrozenInstanceError', T.FrozenInstanceError);
    const make = (cls: PyClass, opts: Kw) => {
      const fields = cls.annotations.map(([n]) => n);
      const defaults = new Map<string, PyVal>();
      for (const fname of fields) {
        const v = cls.dict.get(fname);
        if (v !== undefined) defaults.set(fname, v);
      }
      if (!cls.dict.has('__init__'))
        cls.dict.set('__init__', new PyBuiltin('__init__', function* (args, kw) {
          const self = args[0] as PyInstance;
          for (let i = 0; i < fields.length; i++) {
            const fname = fields[i];
            let v: PyVal | undefined = i + 1 < args.length ? args[i + 1] : kw.get(fname);
            if (v === undefined) {
              const dv = defaults.get(fname);
              if (dv === undefined) I.raise('TypeError', `${cls.name}.__init__() missing 1 required positional argument: '${fname}'`);
              v = dv instanceof PyInstance && dv.cls.name === 'Field' ? yield* I.call(dv.attrs.get('default_factory')!, []) : dv!;
            }
            self.attrs.set(fname, v);
          }
          const post = cls.lookup('__post_init__');
          if (post) yield* I.call(post, [self]);
          return null;
        }));
      if (!cls.dict.has('__repr__'))
        cls.dict.set('__repr__', new PyBuiltin('__repr__', function* (args) {
          const self = args[0] as PyInstance;
          const parts: string[] = [];
          for (const fname of fields) parts.push(`${fname}=${yield* I.repr(self.attrs.get(fname) ?? null)}`);
          return `${cls.name}(${parts.join(', ')})`;
        }));
      if (!cls.dict.has('__eq__'))
        cls.dict.set('__eq__', new PyBuiltin('__eq__', (args) => {
          const a2 = args[0] as PyInstance, b2 = args[1];
          return b2 instanceof PyInstance && b2.cls === a2.cls && fields.every((fn) => I.eq(a2.attrs.get(fn)!, b2.attrs.get(fn)!));
        }));
      if (opts.has('order') && I.truthSync(opts.get('order')!)) {
        cls.dict.set('__lt__', new PyBuiltin('__lt__', (args) => {
          const a2 = args[0] as PyInstance, b2 = args[1] as PyInstance;
          return I.cmpOrder(new PyTuple(fields.map((fn) => a2.attrs.get(fn)!)), new PyTuple(fields.map((fn) => b2.attrs.get(fn)!))) < 0;
        }));
      }
      if (opts.has('frozen') && I.truthSync(opts.get('frozen')!)) {
        cls.dict.set('__hash__', new PyBuiltin('__hash__', () => 0n));
        cls.dict.set('__frozen__', true);
      }
      else cls.dict.set('__hash__', null);
      return cls;
    };
    f(d, 'dataclass', (a, kw) => {
      if (a.length && a[0] instanceof PyClass) return make(a[0], kw);
      return new PyBuiltin('dataclass', (b) => make(b[0] as PyClass, kw));
    });
    f(d, 'field', (_a, kw) => {
      const fc = new PyInstance(new PyClass('Field', [T.object]));
      if (kw.has('default_factory')) fc.attrs.set('default_factory', kw.get('default_factory')!);
      if (kw.has('default')) return kw.get('default')!;
      return fc;
    });
  });

  mod('re', (d) => {
    const toJs = (p: string, flags: PyVal) => {
      let fl = 'g';
      const n = flags === null || flags === undefined ? 0 : Number(toBig(flags as bigint));
      if (n & 2) fl += 'i';
      if (n & 8) fl += 'm';
      if (n & 16) fl += 's';
      return new RegExp(p.replace(/\(\?P<(\w+)>/g, '(?<$1>').replace(/\(\?P=(\w+)\)/g, '\\k<$1>').replace(/\\Z/g, '$'), fl);
    };
    d.set('IGNORECASE', 2n);
    d.set('I', 2n);
    d.set('MULTILINE', 8n);
    d.set('M', 8n);
    d.set('DOTALL', 16n);
    d.set('S', 16n);
    const matchObj = (m: RegExpExecArray) => {
      const cls = new PyClass('Match', [T.object]);
      const o = new PyInstance(cls);
      const grp = (k: PyVal) => {
        const v = typeof k === 'string' ? m.groups?.[k] : m[Number(toBig((k ?? 0n) as bigint))];
        return v === undefined ? null : v;
      };
      cls.dict.set('group', new PyBuiltin('group', (a) => (a.length <= 2 ? grp(a[1] ?? 0n) : new PyTuple(a.slice(1).map(grp)))));
      cls.dict.set('groups', new PyBuiltin('groups', () => new PyTuple(m.slice(1).map((x) => (x === undefined ? null : x)))));
      cls.dict.set('groupdict', new PyBuiltin('groupdict', () => {
        const dd = new PyDict();
        for (const [k, v] of Object.entries(m.groups ?? {})) dd.set(k, v ?? null);
        return dd;
      }));
      cls.dict.set('start', new PyBuiltin('start', () => BigInt(m.index)));
      cls.dict.set('end', new PyBuiltin('end', () => BigInt(m.index + m[0].length)));
      cls.dict.set('span', new PyBuiltin('span', () => new PyTuple([BigInt(m.index), BigInt(m.index + m[0].length)])));
      cls.dict.set('__getitem__', new PyBuiltin('__getitem__', (a) => grp(a[1])));
      cls.dict.set('__repr__', new PyBuiltin('__repr__', () => `<re.Match object; span=(${m.index}, ${m.index + m[0].length}), match=${I.primRepr(m[0])}>`));
      return o;
    };
    f(d, 'findall', (a) => {
      const re = toJs(a[0] as string, a[2] ?? null);
      const out: PyVal[] = [];
      for (const m of (a[1] as string).matchAll(re)) out.push(m.length === 1 ? m[0] : m.length === 2 ? m[1] ?? '' : new PyTuple(m.slice(1).map((x) => x ?? '')));
      return new PyList(out);
    });
    f(d, 'search', (a) => {
      const re = toJs(a[0] as string, a[2] ?? null);
      const m = re.exec(a[1] as string);
      return m ? matchObj(m) : null;
    });
    f(d, 'match', (a) => {
      const re = toJs(a[0] as string, a[2] ?? null);
      const m = re.exec(a[1] as string);
      return m && m.index === 0 ? matchObj(m) : null;
    });
    f(d, 'fullmatch', (a) => {
      const re = toJs('^(?:' + (a[0] as string) + ')$', a[2] ?? null);
      const m = re.exec(a[1] as string);
      return m ? matchObj(m) : null;
    });
    f(d, 'sub', function* (a, kw) {
      const re = toJs(a[0] as string, kw.get('flags') ?? null);
      const repl = a[1];
      const s = a[2] as string;
      let count = Number(toBig((a[3] ?? kw.get('count') ?? 0n) as bigint));
      if (typeof repl === 'string') {
        const r = repl.replace(/\\(\d)/g, '$$$1').replace(/\\g<(\w+)>/g, '$<$1>');
        if (!count) return s.replace(re, r);
        return s.replace(re, (...m) => (count-- > 0 ? m[0].replace(new RegExp(re.source, re.flags.replace('g', '')), r) : m[0]));
      }
      let out = '';
      let last = 0;
      for (const m of s.matchAll(re)) {
        out += s.slice(last, m.index) + ((yield* I.call(repl, [matchObj(m as RegExpExecArray)])) as string);
        last = m.index! + m[0].length;
      }
      return out + s.slice(last);
    });
    f(d, 'split', (a) => new PyList((a[1] as string).split(toJs(a[0] as string, null)).map((x) => x ?? null)));
    f(d, 'compile', (a) => {
      const pat = a[0] as string;
      const flags = a[1] ?? null;
      const cls = new PyClass('Pattern', [T.object]);
      const o = new PyInstance(cls);
      const m = (I.moduleFactories.get('re')!)().dict;
      for (const name of ['findall', 'search', 'match', 'fullmatch', 'split']) cls.dict.set(name, new PyBuiltin(name, function* (b) {
        return yield* I.call(m.get(name)!, [pat, ...b.slice(1), ...(name !== 'split' ? [flags] : [])]);
      }));
      cls.dict.set('sub', new PyBuiltin('sub', function* (b) {
        return yield* I.call(m.get('sub')!, [pat, ...b.slice(1)]);
      }));
      return o;
    });
  });

  void floatRepr;
  void formatSpec;
}
