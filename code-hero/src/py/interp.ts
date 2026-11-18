// Tree-walking Python interpreter built on JS generators.
//
// Why generators? Every statement can *pause*: the driver can stop after each
// line, snapshot all frames + heap objects, and resume. That powers the
// step-by-step visualizer (Python-Tutor style) and also lets Python `yield`
// generators suspend naturally.

import type { Arg, Expr, Param, Stmt } from './ast';
import { parse } from './parser';
import { PySyntaxError } from './lexer';
import {
  PyBoundMethod, PyBuiltin, PyClass, PyClassMethod, PyDeque, PyDict, PyFunc, PyGenerator, PyInstance, PyIter, PyList, PyModule,
  PyObj, PyProperty, PyRaise, PyRange, PySet, PyStaticMethod, PySuper, PyTuple, PyVal, STOP, NextResult, Scope,
  floatRepr, isNum, keyOf, strRepr, toBig, toNum, typeNameOf, resetIds,
} from './values';
import { installBuiltins, methodOf } from './builtins';
import { formatSpec, percentFormat } from './format';

export type Ev =
  | { ev: 'line'; line: number }
  | { ev: 'call'; scope: Scope }
  | { ev: 'return'; scope: Scope; value: PyVal }
  | { ev: 'yield'; value: PyVal };
export type G<T> = Generator<Ev, T, any>;

type Sig = undefined | { sig: 'break' } | { sig: 'continue' } | { sig: 'return'; v: PyVal };

// ---------------- snapshot format (consumed by the visualizer) ----------------
export type SVal = { t: 'prim'; type: string; repr: string; raw?: string } | { t: 'ref'; id: number };
export interface SObj {
  id: number;
  kind: 'list' | 'tuple' | 'set' | 'dict' | 'instance' | 'function' | 'class' | 'deque' | 'range' | 'other';
  type: string;
  items?: SVal[];
  entries?: [SVal, SVal][];
  attrs?: [string, SVal][];
  label?: string;
}
export interface SFrame {
  id: number;
  name: string;
  line: number;
  vars: [string, SVal][];
  ret?: SVal;
}
export interface Snapshot {
  line: number;
  event: 'line' | 'call' | 'return' | 'exception' | 'done';
  frames: SFrame[];
  heap: Record<number, SObj>;
  stdout: string;
  error?: string;
}
export interface CallRecord {
  id: number;
  parent: number | null;
  name: string;
  args: string;
  ret?: string;
  startStep: number;
  endStep?: number;
}

export interface RunResult {
  stdout: string;
  error: string | null; // formatted traceback
  errorType?: string;
  errorMessage?: string;
  errorLine?: number;
  trace: Snapshot[];
  calls: CallRecord[];
  steps: number;
  lastValue?: string; // repr of a trailing expression (notebook "Out")
  globals: Map<string, PyVal>;
  truncated: boolean;
}

export interface RunOptions {
  trace?: boolean;
  maxTrace?: number;
  maxSteps?: number;
  input?: string[];
  echoLast?: boolean;
}

export class Interp {
  out: string[] = [];
  stack: Scope[] = [];
  steps = 0;
  maxSteps = 3_000_000;
  tracing = false;
  maxTrace = 1500;
  trace: Snapshot[] = [];
  truncated = false;
  calls: CallRecord[] = [];
  callStack: number[] = [];
  builtins = new Map<string, PyVal>();
  modules = new Map<string, PyModule>();
  moduleFactories = new Map<string, () => PyModule>();
  handling: PyRaise[] = [];
  inputs: string[] = [];
  frameIds = 0;
  recursionLimit = 1000;
  T!: Record<string, PyClass>; // builtin type objects
  globals!: Scope;

  constructor() {
    installBuiltins(this);
  }

  // ---------------- entry point ----------------
  run(src: string, opts: RunOptions = {}): RunResult {
    resetIds();
    this.tracing = !!opts.trace;
    this.maxTrace = opts.maxTrace ?? 1500;
    this.maxSteps = opts.maxSteps ?? 3_000_000;
    this.inputs = [...(opts.input ?? [])];
    this.out = [];
    this.trace = [];
    this.calls = [];
    this.callStack = [];
    this.stack = [];
    this.steps = 0;
    this.truncated = false;
    this.modules.clear();
    const globals: Scope = { kind: 'module', vars: new Map(), parent: null, globals: null as unknown as Scope, name: '<module>', frameId: 0 };
    globals.globals = globals;
    globals.vars.set('__name__', '__main__');
    this.globals = globals;
    this.stack.push(globals);
    let error: string | null = null;
    let errorType: string | undefined, errorMessage: string | undefined, errorLine: number | undefined;
    let lastValue: string | undefined;
    let stmts: Stmt[];
    try {
      stmts = parse(src);
    } catch (e) {
      if (e instanceof PySyntaxError) {
        const lines = src.split('\n');
        const text = lines[e.line - 1] ?? '';
        error = `  File "main.py", line ${e.line}\n    ${text.trim()}\nSyntaxError: ${e.message}`;
        return { stdout: '', error, errorType: 'SyntaxError', errorMessage: e.message, errorLine: e.line, trace: [], calls: [], steps: 0, globals: globals.vars, truncated: false };
      }
      throw e;
    }
    // notebook-style echo of a final bare expression
    let echo: Expr | null = null;
    if (opts.echoLast && stmts.length && stmts[stmts.length - 1].k === 'expr') {
      const last = stmts[stmts.length - 1] as Extract<Stmt, { k: 'expr' }>;
      if (!(last.v.k === 'call' && last.v.fn.k === 'name' && last.v.fn.id === 'print')) {
        echo = last.v;
        stmts = stmts.slice(0, -1);
      }
    }
    const self = this;
    function* main(): G<PyVal> {
      yield* self.execBody(stmts, globals);
      if (echo) {
        globals.line = echo.line;
        return yield* self.evalE(echo, globals);
      }
      return null;
    }
    try {
      const v = this.drive(main());
      if (echo && v !== null) lastValue = this.runSync(this.repr(v));
      if (this.tracing) this.snap('done', this.trace[this.trace.length - 1]?.line ?? 1);
    } catch (e) {
      const r = this.toRaise(e);
      if (r) {
        r.traceback.unshift({ line: globals.line ?? 1, name: '<module>' });
        errorType = r.exc.cls.name;
        errorMessage = this.excMessage(r.exc);
        errorLine = r.traceback[r.traceback.length - 1]?.line;
        error = this.formatTraceback(r, src);
        if (this.tracing) this.snap('exception', errorLine ?? 1, `${errorType}: ${errorMessage}`);
      } else if (e instanceof StepLimit) {
        errorType = 'TimeoutError';
        errorMessage = `Stopped after ${this.maxSteps.toLocaleString()} steps — is there an infinite loop?`;
        error = errorType + ': ' + errorMessage;
        errorLine = globals.line;
      } else throw e;
    }
    return { stdout: this.out.join(''), error, errorType, errorMessage, errorLine, trace: this.trace, calls: this.calls, steps: this.steps, lastValue, globals: globals.vars, truncated: this.truncated };
  }

  /** Run a generator to completion, handling trace events. */
  drive<T>(g: G<T>): T {
    let r = g.next();
    while (!r.done) {
      const ev = r.value;
      if (ev.ev === 'line') this.snap('line', ev.line);
      else if (ev.ev === 'call') this.snap('call', ev.scope.line ?? 0);
      else if (ev.ev === 'return') this.snap('return', ev.scope.line ?? 0, undefined, ev.scope, ev.value);
      else if (ev.ev === 'yield') throw this.makeRaise('SyntaxError', "'yield' outside function");
      r = g.next();
    }
    return r.value;
  }

  /** Run a generator synchronously, ignoring trace events (used for __eq__, __lt__ in sorts, repr...). */
  runSync<T>(g: G<T>): T {
    let r = g.next();
    while (!r.done) r = g.next();
    return r.value;
  }

  tick(line: number) {
    if (++this.steps > this.maxSteps) throw new StepLimit();
    return line;
  }

  // ---------------- snapshots ----------------
  snap(event: Snapshot['event'], line: number, error?: string, retScope?: Scope, retVal?: PyVal) {
    if (!this.tracing) return;
    if (this.trace.length >= this.maxTrace) {
      this.truncated = true;
      this.tracing = false;
      return;
    }
    const heap: Record<number, SObj> = {};
    const queue: PyObj[] = [];
    const sval = (v: PyVal): SVal => {
      if (v === null || typeof v !== 'object') return typeof v === 'string' ? { t: 'prim', type: 'str', repr: this.primRepr(v), raw: v.slice(0, 300) } : { t: 'prim', type: typeNameOf(v), repr: this.primRepr(v) };
      if (v instanceof PyModule || v instanceof PyBuiltin || (v instanceof PyClass && v.builtin)) return { t: 'prim', type: v.typeName, repr: v instanceof PyModule ? `<module '${v.name}'>` : v instanceof PyClass ? `<class '${v.name}'>` : `<built-in ${v.name}>` };
      if (!heap[v.id]) {
        heap[v.id] = { id: v.id, kind: 'other', type: v.typeName };
        queue.push(v);
      }
      return { t: 'ref', id: v.id };
    };
    const frames: SFrame[] = this.stack.map((sc) => {
      const vars: [string, SVal][] = [];
      for (const [k, v] of sc.vars) {
        if (k.startsWith('__') && k.endsWith('__')) continue;
        if (sc.kind === 'module' && (v instanceof PyModule || v instanceof PyBuiltin)) continue;
        vars.push([k, sval(v)]);
      }
      const f: SFrame = { id: sc.frameId, name: sc.kind === 'module' ? 'Global frame' : sc.name, line: sc.line ?? 0, vars };
      if (retScope === sc) f.ret = sval(retVal ?? null);
      return f;
    });
    let guard = 0;
    while (queue.length && guard++ < 4000) {
      const o = queue.shift()!;
      const e = heap[o.id];
      if (o instanceof PyList) {
        e.kind = 'list';
        e.items = o.items.map(sval);
      } else if (o instanceof PyTuple) {
        e.kind = 'tuple';
        e.items = o.items.map(sval);
      } else if (o instanceof PyDeque) {
        e.kind = 'deque';
        e.items = o.items.map(sval);
      } else if (o instanceof PySet) {
        e.kind = 'set';
        e.items = this.setOrder(o).map(sval);
      } else if (o instanceof PyDict) {
        e.kind = 'dict';
        e.entries = o.entries().map(([k, v]) => [sval(k), sval(v)]);
      } else if (o instanceof PyInstance) {
        e.kind = 'instance';
        e.attrs = [...o.attrs].map(([k, v]) => [k, sval(v)]);
      } else if (o instanceof PyFunc) {
        e.kind = 'function';
        e.label = `${o.name}(${o.params.map((p) => (p.kind === 'star' ? '*' : p.kind === 'dstar' ? '**' : '') + p.name).join(', ')})`;
      } else if (o instanceof PyClass) {
        e.kind = 'class';
        e.label = o.name;
        e.attrs = [...o.dict].filter(([k]) => !(k.startsWith('__') && k.endsWith('__'))).map(([k, v]) => [k, sval(v)]);
      } else if (o instanceof PyRange) {
        e.kind = 'range';
        e.label = `range(${o.start}, ${o.stop}${o.step !== 1n ? ', ' + o.step : ''})`;
      } else {
        e.label = `<${o.typeName}>`;
      }
    }
    this.trace.push({ line, event, frames, heap, stdout: this.out.join(''), error });
  }

  primRepr(v: PyVal): string {
    if (v === null) return 'None';
    if (typeof v === 'boolean') return v ? 'True' : 'False';
    if (typeof v === 'bigint') return v.toString();
    if (typeof v === 'number') return floatRepr(v);
    if (typeof v === 'string') return strRepr(v);
    return '?';
  }

  // ---------------- errors ----------------
  makeRaise(cls: string, msg?: string): PyRaise {
    const c = this.T[cls] ?? this.T.Exception;
    const inst = new PyInstance(c);
    inst.attrs.set('args', new PyTuple(msg === undefined ? [] : [msg]));
    return new PyRaise(inst);
  }
  raise(cls: string, msg?: string): never {
    throw this.makeRaise(cls, msg);
  }
  toRaise(e: unknown): PyRaise | null {
    if (e instanceof PyRaise) return e;
    if (e instanceof StepLimit) return null;
    if (e instanceof RangeError) return this.makeRaise('RecursionError', 'maximum recursion depth exceeded'); // JS stack overflow (no regex here: the stack is nearly full)
    if (e instanceof TypeError && e.message.startsWith('unhashable')) return this.makeRaise('TypeError', e.message);
    if (e instanceof PySyntaxError) return this.makeRaise('SyntaxError', e.message);
    return null;
  }
  excMessage(exc: PyInstance): string {
    const args = exc.attrs.get('args');
    if (args instanceof PyTuple) {
      if (args.items.length === 0) return '';
      if (args.items.length === 1) {
        const a = args.items[0];
        if (exc.cls.isSubclassOf(this.T.KeyError)) return this.runSync(this.repr(a));
        return this.runSync(this.str(a));
      }
      return this.runSync(this.repr(args));
    }
    return '';
  }
  formatTraceback(r: PyRaise, src: string): string {
    const lines = src.split('\n');
    let s = 'Traceback (most recent call last):\n';
    for (const f of r.traceback) {
      s += `  File "main.py", line ${f.line}, in ${f.name}\n`;
      const t = lines[f.line - 1];
      if (t !== undefined) s += `    ${t.trim()}\n`;
    }
    const msg = this.excMessage(r.exc);
    return s + r.exc.cls.name + (msg ? ': ' + msg : '');
  }

  // ---------------- scopes ----------------
  lookup(s: Scope, name: string): PyVal {
    let sc: Scope | null = s;
    // comprehension and class scopes fall through to their parent
    while (sc) {
      if (sc.kind === 'comp' || sc.kind === 'class' || sc.kind === 'module') {
        if (sc.vars.has(name)) return sc.vars.get(name)!;
        if (sc.kind === 'module') break;
        sc = sc.parent;
        continue;
      }
      // function scope
      if (sc.globalNames?.has(name)) {
        sc = sc.globals;
        continue;
      }
      if (sc.locals?.has(name) && !sc.nonlocalNames?.has(name)) {
        if (sc.vars.has(name)) return sc.vars.get(name)!;
        this.raise('UnboundLocalError', `cannot access local variable '${name}' where it is not associated with a value`);
      }
      if (sc.vars.has(name)) return sc.vars.get(name)!;
      sc = sc.parent;
      // skip class scopes when resolving free variables of functions
      while (sc && sc.kind === 'class') sc = sc.parent;
    }
    const g = s.globals;
    if (g.vars.has(name)) return g.vars.get(name)!;
    if (this.builtins.has(name)) return this.builtins.get(name)!;
    this.raise('NameError', `name '${name}' is not defined`);
  }
  store(s: Scope, name: string, v: PyVal) {
    if (s.kind === 'function') {
      if (s.globalNames?.has(name)) return void s.globals.vars.set(name, v);
      if (s.nonlocalNames?.has(name)) {
        let p = s.parent;
        while (p) {
          if (p.kind === 'function' && (p.vars.has(name) || p.locals?.has(name))) return void p.vars.set(name, v);
          p = p.parent;
        }
        this.raise('SyntaxError', `no binding for nonlocal '${name}' found`);
      }
    }
    s.vars.set(name, v);
  }
  unbind(s: Scope, name: string) {
    const target = s.kind === 'function' && s.globalNames?.has(name) ? s.globals : s;
    if (!target.vars.delete(name)) this.raise('NameError', `name '${name}' is not defined`);
  }

  // ---------------- statements ----------------
  *execBody(body: Stmt[], s: Scope): G<Sig> {
    for (const st of body) {
      const sig = yield* this.execStmt(st, s);
      if (sig) return sig;
    }
    return undefined;
  }

  *execStmt(st: Stmt, s: Scope): G<Sig> {
    s.line = this.tick(st.line);
    if (this.tracing) yield { ev: 'line', line: st.line };
    switch (st.k) {
      case 'expr':
        yield* this.evalE(st.v, s);
        return;
      case 'assign': {
        const v = yield* this.evalE(st.v, s);
        for (const t of st.targets) yield* this.assign(t, v, s);
        return;
      }
      case 'annassign': {
        if (s.kind === 'class' && st.target.k === 'name') {
          const ann = (s.vars.get('__annotations__') as PyDict | undefined) ?? new PyDict();
          ann.set(st.target.id, yield* this.evalE(st.ann, s));
          s.vars.set('__annotations__', ann);
        }
        if (st.v) yield* this.assign(st.target, yield* this.evalE(st.v, s), s);
        return;
      }
      case 'augassign':
        yield* this.augAssign(st, s);
        return;
      case 'pass':
        return;
      case 'break':
        return { sig: 'break' };
      case 'continue':
        return { sig: 'continue' };
      case 'return':
        return { sig: 'return', v: st.v ? yield* this.evalE(st.v, s) : null };
      case 'if': {
        if (yield* this.truth(yield* this.evalE(st.test, s))) return yield* this.execBody(st.body, s);
        if (st.orelse.length) return yield* this.execBody(st.orelse, s);
        return;
      }
      case 'while': {
        for (;;) {
          s.line = this.tick(st.line);
          if (!(yield* this.truth(yield* this.evalE(st.test, s)))) break;
          const sig = yield* this.execBody(st.body, s);
          if (sig?.sig === 'break') return;
          if (sig?.sig === 'return') return sig;
          if (this.tracing) yield { ev: 'line', line: st.line };
        }
        if (st.orelse.length) return yield* this.execBody(st.orelse, s);
        return;
      }
      case 'for': {
        const it = yield* this.iter(yield* this.evalE(st.iter, s));
        for (;;) {
          const x = yield* this.next(it);
          if (x === STOP) break;
          s.line = this.tick(st.line);
          yield* this.assign(st.target, x, s);
          const sig = yield* this.execBody(st.body, s);
          if (sig?.sig === 'break') return;
          if (sig?.sig === 'return') return sig;
          if (this.tracing) yield { ev: 'line', line: st.line };
        }
        if (st.orelse.length) return yield* this.execBody(st.orelse, s);
        return;
      }
      case 'def': {
        const f = yield* this.makeFunc(st.name, st.params, st.body, s, st.isGen, st.line);
        let v: PyVal = f;
        for (let i = st.decorators.length - 1; i >= 0; i--) v = yield* this.call(yield* this.evalE(st.decorators[i], s), [v]);
        this.store(s, st.name, v);
        return;
      }
      case 'class':
        yield* this.execClass(st, s);
        return;
      case 'try':
        return yield* this.execTry(st, s);
      case 'raise': {
        if (!st.v) {
          const cur = this.handling[this.handling.length - 1];
          if (!cur) this.raise('RuntimeError', 'No active exception to reraise');
          throw cur;
        }
        let v = yield* this.evalE(st.v, s);
        if (v instanceof PyClass) v = yield* this.call(v, []);
        if (!(v instanceof PyInstance) || !v.cls.isSubclassOf(this.T.BaseException)) this.raise('TypeError', 'exceptions must derive from BaseException');
        if (st.cause) {
          let c = yield* this.evalE(st.cause, s);
          if (c instanceof PyClass) c = yield* this.call(c, []);
          v.attrs.set('__cause__', c);
        }
        throw new PyRaise(v);
      }
      case 'global':
      case 'nonlocal':
        return;
      case 'del':
        for (const t of st.targets) yield* this.delTarget(t, s);
        return;
      case 'assert': {
        if (!(yield* this.truth(yield* this.evalE(st.test, s)))) {
          if (st.msg) this.raise('AssertionError', yield* this.str(yield* this.evalE(st.msg, s)));
          this.raise('AssertionError');
        }
        return;
      }
      case 'import':
        for (const n of st.names) {
          const m = this.importModule(n.name);
          this.store(s, n.as ?? n.name.split('.')[0], n.as ? m : this.importModule(n.name.split('.')[0]));
        }
        return;
      case 'from': {
        const m = this.importModule(st.module);
        for (const n of st.names) {
          if (n.name === '*') {
            for (const [k, v] of m.dict) if (!k.startsWith('_')) this.store(s, k, v);
            continue;
          }
          if (!m.dict.has(n.name)) this.raise('ImportError', `cannot import name '${n.name}' from '${st.module}'`);
          this.store(s, n.as ?? n.name, m.dict.get(n.name)!);
        }
        return;
      }
      case 'with':
        return yield* this.execWith(st, s, 0);
    }
  }

  *execTry(st: Extract<Stmt, { k: 'try' }>, s: Scope): G<Sig> {
    let sig: Sig;
    let pending: unknown = null;
    try {
      sig = yield* this.execBody(st.body, s);
      if (!sig && st.orelse.length) sig = yield* this.execBody(st.orelse, s);
    } catch (e) {
      const r = this.toRaise(e);
      if (!r) throw e;
      let handled = false;
      for (const h of st.handlers) {
        let match = !h.type;
        if (h.type) {
          const t = yield* this.evalE(h.type, s);
          const types = t instanceof PyTuple ? t.items : [t];
          match = types.some((x) => x instanceof PyClass && r.exc.cls.isSubclassOf(x));
        }
        if (match) {
          handled = true;
          s.line = h.line;
          if (h.name) this.store(s, h.name, r.exc);
          this.handling.push(r);
          try {
            sig = yield* this.execBody(h.body, s);
          } catch (e2) {
            pending = e2;
          } finally {
            this.handling.pop();
            if (h.name) s.vars.delete(h.name);
          }
          break;
        }
      }
      if (!handled) pending = r;
    }
    if (st.final.length) {
      const fsig = yield* this.execBody(st.final, s);
      if (fsig) return fsig; // return in finally swallows exceptions
    }
    if (pending) throw pending;
    return sig;
  }

  *execWith(st: Extract<Stmt, { k: 'with' }>, s: Scope, i: number): G<Sig> {
    if (i >= st.items.length) return yield* this.execBody(st.body, s);
    const item = st.items[i];
    const mgr = yield* this.evalE(item.ctx, s);
    const enter = yield* this.getAttr(mgr, '__enter__');
    const exit = yield* this.getAttr(mgr, '__exit__');
    const v = yield* this.call(enter, []);
    if (item.as) yield* this.assign(item.as, v, s);
    let sig: Sig;
    try {
      sig = yield* this.execWith(st, s, i + 1);
    } catch (e) {
      const r = this.toRaise(e);
      if (!r) throw e;
      const suppress = yield* this.call(exit, [r.exc.cls, r.exc, null]);
      if (yield* this.truth(suppress)) return undefined;
      throw r;
    }
    yield* this.call(exit, [null, null, null]);
    return sig;
  }

  *execClass(st: Extract<Stmt, { k: 'class' }>, s: Scope): G<void> {
    const bases: PyClass[] = [];
    for (const b of st.bases) {
      const v = yield* this.evalE(b, s);
      if (!(v instanceof PyClass)) this.raise('TypeError', 'bases must be classes');
      bases.push(v);
    }
    if (!bases.length) bases.push(this.T.object);
    const cs: Scope = { kind: 'class', vars: new Map(), parent: s, globals: s.globals, name: st.name, frameId: ++this.frameIds };
    cs.vars.set('__qualname__', st.name);
    yield* this.execBody(st.body, cs);
    const cls = new PyClass(st.name, bases, cs.vars);
    const ann = cs.vars.get('__annotations__');
    if (ann instanceof PyDict) cls.annotations = ann.entries().map(([k, v]) => [k as string, v]);
    for (const v of cs.vars.values()) {
      const f = v instanceof PyStaticMethod || v instanceof PyClassMethod ? v.fn : v instanceof PyProperty ? v.fget : v;
      if (f instanceof PyFunc) f.owner = cls;
      if (v instanceof PyProperty && v.fset instanceof PyFunc) v.fset.owner = cls;
    }
    let out: PyVal = cls;
    for (let i = st.decorators.length - 1; i >= 0; i--) out = yield* this.call(yield* this.evalE(st.decorators[i], s), [out]);
    this.store(s, st.name, out);
  }

  *makeFunc(name: string, params: Param[], body: Stmt[] | Expr, s: Scope, isGen: boolean, line: number): G<PyFunc> {
    const defaults = new Map<string, PyVal>();
    for (const p of params) if (p.default) defaults.set(p.name, yield* this.evalE(p.default, s));
    const { locals, globals, nonlocals } = Array.isArray(body) ? analyzeLocals(body, params) : { locals: new Set(params.map((p) => p.name)), globals: new Set<string>(), nonlocals: new Set<string>() };
    // closures: comprehensions/classes are transparent; keep the real enclosing scope
    return new PyFunc(name, params, body, s, defaults, isGen, locals, globals, nonlocals, line);
  }

  // ---------------- assignment ----------------
  *assign(t: Expr, v: PyVal, s: Scope): G<void> {
    switch (t.k) {
      case 'name':
        this.store(s, t.id, v);
        return;
      case 'attr':
        yield* this.setAttr(yield* this.evalE(t.obj, s), t.name, v);
        return;
      case 'sub':
        yield* this.setItem(yield* this.evalE(t.obj, s), yield* this.evalE(t.index, s), v);
        return;
      case 'tuple':
      case 'list': {
        const items = yield* this.toArray(v);
        const starIdx = t.items.findIndex((x) => x.k === 'star');
        if (starIdx < 0) {
          if (items.length !== t.items.length)
            this.raise('ValueError', items.length > t.items.length ? `too many values to unpack (expected ${t.items.length})` : `not enough values to unpack (expected ${t.items.length}, got ${items.length})`);
          for (let i = 0; i < items.length; i++) yield* this.assign(t.items[i], items[i], s);
        } else {
          const after = t.items.length - starIdx - 1;
          if (items.length < t.items.length - 1) this.raise('ValueError', `not enough values to unpack (expected at least ${t.items.length - 1}, got ${items.length})`);
          for (let i = 0; i < starIdx; i++) yield* this.assign(t.items[i], items[i], s);
          yield* this.assign((t.items[starIdx] as Extract<Expr, { k: 'star' }>).v, new PyList(items.slice(starIdx, items.length - after)), s);
          for (let i = 0; i < after; i++) yield* this.assign(t.items[starIdx + 1 + i], items[items.length - after + i], s);
        }
        return;
      }
      default:
        this.raise('SyntaxError', 'cannot assign to expression');
    }
  }

  *augAssign(st: Extract<Stmt, { k: 'augassign' }>, s: Scope): G<void> {
    const t = st.target;
    if (t.k === 'name') {
      const cur = this.lookup(s, t.id);
      const rhs = yield* this.evalE(st.v, s);
      this.store(s, t.id, yield* this.inplace(st.op, cur, rhs));
    } else if (t.k === 'attr') {
      const obj = yield* this.evalE(t.obj, s);
      const cur = yield* this.getAttr(obj, t.name);
      const rhs = yield* this.evalE(st.v, s);
      yield* this.setAttr(obj, t.name, yield* this.inplace(st.op, cur, rhs));
    } else if (t.k === 'sub') {
      const obj = yield* this.evalE(t.obj, s);
      const idx = yield* this.evalE(t.index, s);
      const cur = yield* this.getItem(obj, idx);
      const rhs = yield* this.evalE(st.v, s);
      yield* this.setItem(obj, idx, yield* this.inplace(st.op, cur, rhs));
    } else this.raise('SyntaxError', "illegal expression for augmented assignment");
  }

  *inplace(op: string, a: PyVal, b: PyVal): G<PyVal> {
    // lists/sets/dicts mutate in place (this is why `a += [1]` affects aliases!)
    if (a instanceof PyList && op === '+') {
      a.items.push(...(yield* this.toArray(b)));
      return a;
    }
    if (a instanceof PyList && op === '*') {
      const n = Number(toBig(b as bigint));
      const copy = [...a.items];
      a.items.length = 0;
      for (let i = 0; i < n; i++) a.items.push(...copy);
      return a;
    }
    if (a instanceof PySet && ['|', '&', '-', '^'].includes(op)) {
      const r = (yield* this.binop(op, a, b)) as PySet;
      a.map = r.map;
      return a;
    }
    if (a instanceof PyDict && op === '|') {
      for (const [k, v] of (b as PyDict).entries()) a.set(k, v);
      return a;
    }
    if (a instanceof PyInstance) {
      const m = a.cls.lookup(`__i${DUNDER[op]}__`);
      if (m) return yield* this.call(m, [a, b]);
    }
    return yield* this.binop(op, a, b);
  }

  *delTarget(t: Expr, s: Scope): G<void> {
    if (t.k === 'name') this.unbind(s, t.id);
    else if (t.k === 'sub') yield* this.delItem(yield* this.evalE(t.obj, s), yield* this.evalE(t.index, s));
    else if (t.k === 'attr') {
      const o = yield* this.evalE(t.obj, s);
      if (o instanceof PyInstance && o.attrs.delete(t.name)) return;
      this.raise('AttributeError', `'${typeNameOf(o)}' object has no attribute '${t.name}'`);
    } else if (t.k === 'tuple' || t.k === 'list') for (const x of t.items) yield* this.delTarget(x, s);
  }

  // ---------------- expressions ----------------
  *evalE(e: Expr, s: Scope): G<PyVal> {
    switch (e.k) {
      case 'num':
        if (e.imag) this.raise('NotImplementedError', 'complex numbers are not supported here');
        return e.v;
      case 'str':
        return e.v;
      case 'const':
        return e.v === 'True' ? true : e.v === 'False' ? false : e.v === 'None' ? null : this.builtins.get('Ellipsis')!;
      case 'name':
        return this.lookup(s, e.id);
      case 'fstr': {
        let out = '';
        for (const p of e.parts) {
          if (typeof p === 'string') out += p;
          else {
            const v = yield* this.evalE(p.e, s);
            const spec = p.spec ? ((yield* this.evalE(p.spec, s)) as string) : '';
            let txt: string;
            if (p.conv === 'r' || (p.debug && !p.conv && !spec)) txt = yield* this.repr(v);
            else if (p.conv === 's') txt = yield* this.str(v);
            else txt = yield* this.format(v, spec);
            if (p.conv && spec) txt = formatSpec(txt, spec, this);
            out += (p.debug ?? '') + txt;
          }
        }
        return out;
      }
      case 'attr':
        return yield* this.getAttr(yield* this.evalE(e.obj, s), e.name);
      case 'sub':
        return yield* this.getItem(yield* this.evalE(e.obj, s), yield* this.evalE(e.index, s));
      case 'slice': {
        const lo = e.lo ? yield* this.evalE(e.lo, s) : null;
        const hi = e.hi ? yield* this.evalE(e.hi, s) : null;
        const st = e.step ? yield* this.evalE(e.step, s) : null;
        return new PySlice(lo, hi, st);
      }
      case 'call': {
        const fn = yield* this.evalE(e.fn, s);
        // zero-arg super()
        if (fn === this.builtins.get('super') && e.args.length === 0) {
          let sc: Scope | null = s;
          while (sc && sc.kind !== 'function') sc = sc.parent;
          const f = sc?.func;
          if (!f || !f.owner) this.raise('RuntimeError', 'super(): no arguments');
          const first = f.params[0]?.name;
          return new PySuper(f.owner, sc!.vars.get(first)!);
        }
        const { args, kw } = yield* this.evalArgs(e.args, s);
        return yield* this.call(fn, args, kw);
      }
      case 'bin': {
        const a = yield* this.evalE(e.a, s);
        const b = yield* this.evalE(e.b, s);
        return yield* this.binop(e.op, a, b);
      }
      case 'unary': {
        const a = yield* this.evalE(e.a, s);
        if (e.op === 'not') return !(yield* this.truth(a));
        if (typeof a === 'number') return e.op === '-' ? -a : e.op === '+' ? a : this.raise('TypeError', "bad operand type for unary ~: 'float'");
        if (typeof a === 'bigint' || typeof a === 'boolean') {
          const n = toBig(a);
          return e.op === '-' ? -n : e.op === '+' ? n : ~n;
        }
        if (a instanceof PyInstance) {
          const m = a.cls.lookup(e.op === '-' ? '__neg__' : e.op === '+' ? '__pos__' : '__invert__');
          if (m) return yield* this.call(m, [a]);
        }
        this.raise('TypeError', `bad operand type for unary ${e.op}: '${typeNameOf(a)}'`);
      }
      case 'bool': {
        let v: PyVal = null;
        for (const x of e.vals) {
          v = yield* this.evalE(x, s);
          const t = yield* this.truth(v);
          if (e.op === 'and' ? !t : t) return v;
        }
        return v;
      }
      case 'cmp': {
        let left = yield* this.evalE(e.first, s);
        for (let i = 0; i < e.ops.length; i++) {
          const right = yield* this.evalE(e.rest[i], s);
          const ok = yield* this.compare(e.ops[i], left, right);
          if (!(yield* this.truth(ok))) return ok;
          if (i === e.ops.length - 1) return ok;
          left = right;
        }
        return true;
      }
      case 'ifexp':
        return (yield* this.truth(yield* this.evalE(e.test, s))) ? yield* this.evalE(e.body, s) : yield* this.evalE(e.orelse, s);
      case 'lambda':
        return yield* this.makeFunc('<lambda>', e.params, e.body, s, false, e.line);
      case 'tuple':
        return new PyTuple(yield* this.evalItems(e.items, s));
      case 'list':
        return new PyList(yield* this.evalItems(e.items, s));
      case 'set': {
        const st = new PySet();
        for (const v of yield* this.evalItems(e.items, s)) st.add(v);
        return st;
      }
      case 'dict': {
        const d = new PyDict();
        for (const it of e.items) {
          if ('spread' in it) {
            const src = yield* this.evalE(it.spread, s);
            if (!(src instanceof PyDict)) this.raise('TypeError', `'${typeNameOf(src)}' object is not a mapping`);
            for (const [k, v] of src.entries()) d.set(k, v);
          } else {
            const k = yield* this.evalE(it.key, s);
            d.set(this.hashable(k), yield* this.evalE(it.value, s));
          }
        }
        return d;
      }
      case 'comp':
        return yield* this.evalComp(e, s);
      case 'star':
        this.raise('SyntaxError', "can't use starred expression here");
      case 'walrus': {
        const v = yield* this.evalE(e.v, s);
        let sc: Scope = s;
        while (sc.kind === 'comp' && sc.parent) sc = sc.parent;
        this.store(sc, e.target, v);
        return v;
      }
      case 'yield': {
        if (e.from) {
          const it = yield* this.iter(yield* this.evalE(e.v!, s));
          for (;;) {
            const x = yield* this.next(it);
            if (x === STOP) return null;
            yield { ev: 'yield', value: x };
          }
        }
        const v = e.v ? yield* this.evalE(e.v, s) : null;
        const sent = yield { ev: 'yield', value: v };
        return sent === undefined ? null : (sent as PyVal);
      }
    }
  }

  *evalItems(items: Expr[], s: Scope): G<PyVal[]> {
    const out: PyVal[] = [];
    for (const it of items) {
      if (it.k === 'star') out.push(...(yield* this.toArray(yield* this.evalE(it.v, s))));
      else out.push(yield* this.evalE(it, s));
    }
    return out;
  }

  *evalArgs(args: Arg[], s: Scope): G<{ args: PyVal[]; kw: Map<string, PyVal> }> {
    const out: PyVal[] = [];
    const kw = new Map<string, PyVal>();
    for (const a of args) {
      if (a.kind === 'pos') out.push(yield* this.evalE(a.v, s));
      else if (a.kind === 'star') out.push(...(yield* this.toArray(yield* this.evalE(a.v, s))));
      else if (a.kind === 'kw') {
        if (kw.has(a.name)) this.raise('SyntaxError', `keyword argument repeated: ${a.name}`);
        kw.set(a.name, yield* this.evalE(a.v, s));
      } else {
        const d = yield* this.evalE(a.v, s);
        if (!(d instanceof PyDict)) this.raise('TypeError', 'argument after ** must be a mapping');
        for (const [k, v] of d.entries()) kw.set(String(k), v);
      }
    }
    return { args: out, kw };
  }

  *evalComp(e: Extract<Expr, { k: 'comp' }>, s: Scope): G<PyVal> {
    const cs: Scope = { kind: 'comp', vars: new Map(), parent: s, globals: s.globals, name: '<comp>', frameId: -1 };
    const self = this;
    if (e.kind === 'gen') {
      // lazy generator expression; the first iterable is evaluated immediately (like Python)
      const firstIter = yield* this.iter(yield* this.evalE(e.gens[0].iter, s));
      function* body(): G<PyVal> {
        yield* self.compLoop(e, cs, 0, function* () {
          yield { ev: 'yield', value: yield* self.evalE(e.elt, cs) };
        }, firstIter);
        return null;
      }
      const g = new PyGenerator('<genexpr>', body() as Generator<unknown, unknown, PyVal>);
      return g;
    }
    const list: PyVal[] = [];
    const dict = new PyDict();
    const set = new PySet();
    yield* this.compLoop(e, cs, 0, function* () {
      if (e.kind === 'dict') {
        const k = yield* self.evalE(e.elt, cs);
        dict.set(self.hashable(k), yield* self.evalE(e.value!, cs));
      } else if (e.kind === 'set') set.add(self.hashable(yield* self.evalE(e.elt, cs)));
      else list.push(yield* self.evalE(e.elt, cs));
    });
    return e.kind === 'dict' ? dict : e.kind === 'set' ? set : new PyList(list);
  }

  *compLoop(e: Extract<Expr, { k: 'comp' }>, cs: Scope, i: number, emit: () => G<void>, firstIter?: PyIter): G<void> {
    if (i >= e.gens.length) return yield* emit();
    const g = e.gens[i];
    const it = i === 0 && firstIter ? firstIter : yield* this.iter(yield* this.evalE(g.iter, i === 0 ? cs.parent! : cs));
    for (;;) {
      const x = yield* this.next(it);
      if (x === STOP) return;
      this.tick(e.line);
      yield* this.assign(g.target, x, cs);
      let ok = true;
      for (const c of g.ifs)
        if (!(yield* this.truth(yield* this.evalE(c, cs)))) {
          ok = false;
          break;
        }
      if (ok) yield* this.compLoop(e, cs, i + 1, emit);
    }
  }

  // ---------------- calls ----------------
  *call(fn: PyVal, args: PyVal[], kw: Map<string, PyVal> = new Map()): G<PyVal> {
    if (fn instanceof PyFunc) return yield* this.callFunc(fn, args, kw);
    if (fn instanceof PyBuiltin) {
      const r = fn.impl(args, kw);
      if (r && typeof r === 'object' && typeof (r as Generator).next === 'function' && !(r instanceof PyObj)) return yield* (r as G<PyVal>);
      return r as PyVal;
    }
    if (fn instanceof PyBoundMethod) return yield* this.call(fn.func, [fn.self, ...args], kw);
    if (fn instanceof PyClass) return yield* this.instantiate(fn, args, kw);
    if (fn instanceof PyInstance) {
      const m = fn.cls.lookup('__call__');
      if (m) return yield* this.call(m, [fn, ...args], kw);
    }
    if (fn instanceof PyStaticMethod) return yield* this.call(fn.fn, args, kw);
    this.raise('TypeError', `'${typeNameOf(fn)}' object is not callable`);
  }

  *instantiate(cls: PyClass, args: PyVal[], kw: Map<string, PyVal>): G<PyVal> {
    // builtin types (int, list, dict...) have constructor functions
    const base = cls.mro.find((c) => c.builtin);
    if (cls.builtin && cls.builtin !== 'object' && cls.builtin !== 'exception') {
      const ctor = cls.dict.get('__new_builtin__') as PyBuiltin;
      return yield* this.call(ctor, args, kw);
    }
    const inst = new PyInstance(cls);
    if (base?.builtin === 'exception') inst.attrs.set('args', new PyTuple([...args]));
    const init = cls.lookup('__init__');
    if (init) {
      const r = yield* this.call(init, [inst, ...args], kw);
      if (r !== null && init instanceof PyFunc) this.raise('TypeError', `__init__() should return None, not '${typeNameOf(r)}'`);
    } else if ((args.length || kw.size) && base?.builtin !== 'exception') this.raise('TypeError', `${cls.name}() takes no arguments`);
    return inst;
  }

  bindArgs(f: PyFunc, args: PyVal[], kw: Map<string, PyVal>): Map<string, PyVal> {
    const vars = new Map<string, PyVal>();
    const fname = f.name;
    const normal = f.params.filter((p) => p.kind === 'normal');
    const star = f.params.find((p) => p.kind === 'star');
    const dstar = f.params.find((p) => p.kind === 'dstar');
    const kwonly = f.params.filter((p) => p.kind === 'kwonly');
    if (args.length > normal.length && !star) {
      const req = normal.filter((p) => !p.default).length;
      const range = req === normal.length ? `${normal.length}` : `from ${req} to ${normal.length}`;
      this.raise('TypeError', `${fname}() takes ${range} positional argument${normal.length === 1 && req === normal.length ? '' : 's'} but ${args.length} ${args.length === 1 ? 'was' : 'were'} given`);
    }
    normal.forEach((p, i) => {
      if (i < args.length) vars.set(p.name, args[i]);
    });
    if (star) vars.set(star.name, new PyTuple(args.slice(normal.length)));
    const extra = new PyDict();
    for (const [k, v] of kw) {
      const p = f.params.find((x) => x.name === k && (x.kind === 'normal' || x.kind === 'kwonly'));
      if (p) {
        if (vars.has(k)) this.raise('TypeError', `${fname}() got multiple values for argument '${k}'`);
        vars.set(k, v);
      } else if (dstar) extra.set(k, v);
      else this.raise('TypeError', `${fname}() got an unexpected keyword argument '${k}'`);
    }
    const missing: string[] = [];
    for (const p of [...normal, ...kwonly]) {
      if (!vars.has(p.name)) {
        if (f.defaults.has(p.name)) vars.set(p.name, f.defaults.get(p.name)!);
        else missing.push(p.name);
      }
    }
    if (missing.length) {
      const kwMissing = missing.filter((m) => kwonly.some((k) => k.name === m));
      const posMissing = missing.filter((m) => !kwMissing.includes(m));
      const list = (xs: string[]) => (xs.length === 1 ? `'${xs[0]}'` : xs.slice(0, -1).map((x) => `'${x}'`).join(', ') + ` and '${xs[xs.length - 1]}'`);
      if (posMissing.length) this.raise('TypeError', `${fname}() missing ${posMissing.length} required positional argument${posMissing.length > 1 ? 's' : ''}: ${list(posMissing)}`);
      this.raise('TypeError', `${fname}() missing ${kwMissing.length} required keyword-only argument${kwMissing.length > 1 ? 's' : ''}: ${list(kwMissing)}`);
    }
    if (dstar) vars.set(dstar.name, extra);
    return vars;
  }

  *callFunc(f: PyFunc, args: PyVal[], kw: Map<string, PyVal>): G<PyVal> {
    const vars = this.bindArgs(f, args, kw);
    const scope: Scope = {
      kind: 'function', vars, parent: f.closure, globals: f.closure.globals, func: f, name: f.name, frameId: ++this.frameIds,
      locals: f.locals, globalNames: f.globalNames, nonlocalNames: f.nonlocalNames, line: f.line,
    };
    if (f.isGen) {
      const self = this;
      const body = function* (): G<PyVal> {
        const sig = yield* self.execBody(f.body as Stmt[], scope);
        return sig?.sig === 'return' ? sig.v : null;
      };
      const g = new PyGenerator(f.name, body() as Generator<unknown, unknown, PyVal>);
      g.scope = scope;
      return g;
    }
    if (this.stack.length > this.recursionLimit) this.raise('RecursionError', 'maximum recursion depth exceeded');
    this.stack.push(scope);
    const callId = this.calls.length;
    const parent = this.callStack.length ? this.callStack[this.callStack.length - 1] : null;
    if (this.calls.length < 5000) {
      this.calls.push({ id: callId, parent, name: f.name, args: args.map((a) => this.shortRepr(a)).join(', '), startStep: this.trace.length });
      this.callStack.push(callId);
    }
    try {
      if (this.tracing) yield { ev: 'call', scope };
      let ret: PyVal = null;
      if (!Array.isArray(f.body)) {
        scope.line = f.line;
        ret = yield* this.evalE(f.body, scope);
      } else {
        const sig = yield* this.execBody(f.body, scope);
        if (sig?.sig === 'return') ret = sig.v;
      }
      if (callId < 5000 && this.calls[callId]) {
        this.calls[callId].ret = this.shortRepr(ret);
        this.calls[callId].endStep = this.trace.length;
      }
      if (this.tracing) yield { ev: 'return', scope, value: ret };
      return ret;
    } catch (e) {
      const r = this.toRaise(e);
      if (r) {
        r.traceback.unshift({ line: scope.line ?? f.line, name: f.name });
        throw r;
      }
      throw e;
    } finally {
      this.stack.pop();
      if (callId < 5000 && this.callStack[this.callStack.length - 1] === callId) this.callStack.pop();
    }
  }

  shortRepr(v: PyVal): string {
    try {
      const s = this.runSync(this.repr(v));
      return s.length > 30 ? s.slice(0, 27) + '...' : s;
    } catch {
      return '?';
    }
  }

  // ---------------- attributes ----------------
  *getAttr(o: PyVal, name: string): G<PyVal> {
    if (o instanceof PyInstance) {
      const cv = o.cls.lookup(name);
      if (cv instanceof PyProperty) return yield* this.call(cv.fget, [o]);
      if (o.attrs.has(name)) return o.attrs.get(name)!;
      if (name === '__class__') return o.cls;
      if (name === '__dict__') {
        const d = new PyDict();
        for (const [k, v] of o.attrs) d.set(k, v);
        return d;
      }
      if (cv !== undefined) return this.bindClassAttr(cv, o, o.cls);
      if (o.cls.builtin === 'exception' || o.cls.isSubclassOf(this.T.BaseException)) {
        if (name === 'args') return o.attrs.get('args') ?? new PyTuple();
        if (name === '__cause__' || name === '__context__') return null;
      }
      const ga = o.cls.lookup('__getattr__');
      if (ga) return yield* this.call(ga, [o, name]);
      this.raise('AttributeError', `'${o.cls.name}' object has no attribute '${name}'`);
    }
    if (o instanceof PyClass) {
      if (name === '__name__') return o.name;
      if (name === '__mro__') return new PyTuple(o.mro);
      if (name === '__bases__') return new PyTuple(o.bases);
      if (name === '__dict__') {
        const d = new PyDict();
        for (const [k, v] of o.dict) d.set(k, v);
        return d;
      }
      const cv = o.lookup(name);
      if (cv === undefined && o.builtin) {
        // unbound methods of built-in types: str.lower, list.append, dict.get ...
        const samples: Record<string, PyVal> = { str: '', list: new PyList(), tuple: new PyTuple(), dict: new PyDict(), set: new PySet(), frozenset: new PySet(true), int: 0n, bool: false, float: 0, deque: new PyDeque(), Counter: new PyDict('Counter'), defaultdict: new PyDict('defaultdict'), OrderedDict: new PyDict('OrderedDict') };
        const sample = samples[o.builtin];
        if (sample !== undefined && methodOf(this, sample, name)) {
          const self = this;
          return new PyBuiltin(name, function* (a, kw) {
            const m = methodOf(self, a[0], name);
            if (!m) self.raise('TypeError', `descriptor '${name}' for '${o.name}' objects doesn't apply to a '${typeNameOf(a[0])}' object`);
            return yield* self.call(m, a.slice(1), kw);
          });
        }
      }
      if (cv !== undefined) {
        if (cv instanceof PyClassMethod) return new PyBoundMethod(o, cv.fn);
        if (cv instanceof PyStaticMethod) return cv.fn;
        if (cv instanceof PyBuiltin && o.builtin && name !== '__new_builtin__') return cv;
        return cv;
      }
      this.raise('AttributeError', `type object '${o.name}' has no attribute '${name}'`);
    }
    if (o instanceof PyModule) {
      if (o.dict.has(name)) return o.dict.get(name)!;
      if (name === '__name__') return o.name;
      this.raise('AttributeError', `module '${o.name}' has no attribute '${name}'`);
    }
    if (o instanceof PySuper) {
      const cls = o.self instanceof PyInstance ? o.self.cls : (o.self as PyClass);
      const mro = cls.mro;
      for (let i = mro.indexOf(o.start) + 1; i < mro.length; i++) {
        if (mro[i].dict.has(name)) return this.bindClassAttr(mro[i].dict.get(name)!, o.self, cls);
      }
      if (name === '__init__') return new PyBuiltin('__init__', () => null);
      this.raise('AttributeError', `'super' object has no attribute '${name}'`);
    }
    if (o instanceof PyProperty) {
      if (name === 'setter') return new PyBuiltin('setter', (a) => new PyProperty(o.fget, a[0]));
      if (name === 'getter') return new PyBuiltin('getter', (a) => new PyProperty(a[0], o.fset));
      if (name === 'deleter') return new PyBuiltin('deleter', () => o);
      if (name === 'fget') return o.fget;
      if (name === 'fset') return o.fset;
    }
    if (o instanceof PyFunc) {
      if (name === '__name__') return o.name;
      if (name === '__doc__') return null;
    }
    if (o instanceof PyBuiltin && name === '__name__') return o.name;
    if (o instanceof PyBuiltin && (o as PyBuiltin & { extra?: Map<string, PyVal> }).extra?.has(name)) return (o as PyBuiltin & { extra?: Map<string, PyVal> }).extra!.get(name)!;
    const m = methodOf(this, o, name);
    if (m) return m;
    this.raise('AttributeError', `'${typeNameOf(o)}' object has no attribute '${name}'`);
  }

  bindClassAttr(cv: PyVal, self: PyVal, cls: PyClass): PyVal {
    if (cv instanceof PyFunc) return new PyBoundMethod(self, cv);
    if (cv instanceof PyClassMethod) return new PyBoundMethod(cls, cv.fn);
    if (cv instanceof PyStaticMethod) return cv.fn;
    if (cv instanceof PyBuiltin && cv.name !== '__new_builtin__') return new PyBoundMethod(self, cv);
    return cv;
  }

  *setAttr(o: PyVal, name: string, v: PyVal): G<void> {
    if (o instanceof PyInstance) {
      const cv = o.cls.lookup(name);
      if (cv instanceof PyProperty) {
        if (!cv.fset) this.raise('AttributeError', `property '${name}' of '${o.cls.name}' object has no setter`);
        yield* this.call(cv.fset, [o, v]);
        return;
      }
      if (o.cls.lookup('__frozen__') === true) this.raise('FrozenInstanceError', `cannot assign to field '${name}'`);
      const sa = o.cls.lookup('__setattr__');
      if (sa instanceof PyFunc) {
        yield* this.call(sa, [o, name, v]);
        return;
      }
      o.attrs.set(name, v);
      return;
    }
    if (o instanceof PyClass && !o.builtin) {
      o.dict.set(name, v);
      return;
    }
    if (o instanceof PyFunc) return;
    this.raise('AttributeError', `'${typeNameOf(o)}' object has no attribute '${name}'`);
  }

  // ---------------- items ----------------
  index(len: number, i: PyVal, what: string): number {
    if (!(typeof i === 'bigint' || typeof i === 'boolean')) {
      if (i instanceof PyInstance) {
        this.raise('TypeError', `${what} indices must be integers or slices, not ${typeNameOf(i)}`);
      }
      this.raise('TypeError', `${what} indices must be integers or slices, not ${typeNameOf(i)}`);
    }
    let n = Number(toBig(i));
    if (n < 0) n += len;
    if (n < 0 || n >= len) this.raise('IndexError', `${what} index out of range`);
    return n;
  }

  sliceIdx(len: number, sl: PySlice): number[] {
    const num = (v: PyVal, name: string) => {
      if (v === null) return null;
      if (typeof v === 'bigint' || typeof v === 'boolean') return Number(toBig(v));
      this.raise('TypeError', `slice indices must be integers or None or have an __index__ method`);
      void name;
    };
    const step = num(sl.step, 'step') ?? 1;
    if (step === 0) this.raise('ValueError', 'slice step cannot be zero');
    let lo = num(sl.lo, 'start');
    let hi = num(sl.hi, 'stop');
    const out: number[] = [];
    if (step > 0) {
      lo = lo === null ? 0 : lo < 0 ? Math.max(0, lo + len) : Math.min(lo, len);
      hi = hi === null ? len : hi < 0 ? Math.max(0, hi + len) : Math.min(hi, len);
      for (let i = lo; i < hi; i += step) out.push(i);
    } else {
      lo = lo === null ? len - 1 : lo < 0 ? Math.max(-1, lo + len) : Math.min(lo, len - 1);
      hi = hi === null ? -1 : hi < 0 ? Math.max(-1, hi + len) : Math.min(hi, len - 1);
      for (let i = lo; i > hi; i += step) out.push(i);
    }
    return out;
  }

  *getItem(o: PyVal, i: PyVal): G<PyVal> {
    if (o instanceof PyList || o instanceof PyTuple || o instanceof PyDeque) {
      if (i instanceof PySlice) {
        const idx = this.sliceIdx(o.items.length, i);
        const items = idx.map((k) => o.items[k]);
        return o instanceof PyTuple ? new PyTuple(items) : new PyList(items);
      }
      return o.items[this.index(o.items.length, i, typeNameOf(o))];
    }
    if (typeof o === 'string') {
      if (i instanceof PySlice) return this.sliceIdx(o.length, i).map((k) => o[k]).join('');
      return o[this.index(o.length, i, 'string')];
    }
    if (o instanceof PyDict) {
      const v = o.get(this.hashable(i));
      if (v !== undefined) return v;
      if (o.flavor === 'Counter') return 0n;
      if (o.flavor === 'defaultdict' && o.defaultFactory !== null) {
        const d = yield* this.call(o.defaultFactory, []);
        o.set(i, d);
        return d;
      }
      throw this.keyError(i);
    }
    if (o instanceof PyRange) {
      if (i instanceof PySlice) {
        const idx = this.sliceIdx(Number(o.length), i);
        return new PyList(idx.map((k) => o.at(BigInt(k))));
      }
      return o.at(BigInt(this.index(Number(o.length), i, 'range object')));
    }
    if (o instanceof PyInstance) {
      const m = o.cls.lookup('__getitem__');
      if (m) return yield* this.call(m, [o, i]);
    }
    if (o instanceof PyClass) return o; // typing generics like List[int]
    this.raise('TypeError', `'${typeNameOf(o)}' object is not subscriptable`);
  }

  keyError(k: PyVal): PyRaise {
    const r = this.makeRaise('KeyError');
    r.exc.attrs.set('args', new PyTuple([k]));
    return r;
  }

  *setItem(o: PyVal, i: PyVal, v: PyVal): G<void> {
    if (o instanceof PyList || o instanceof PyDeque) {
      if (i instanceof PySlice && o instanceof PyList) {
        const vals = yield* this.toArray(v);
        if (i.step === null || i.step === 1n) {
          const idx = this.sliceIdx(o.items.length, new PySlice(i.lo, i.hi, null));
          const start = idx.length ? idx[0] : Math.min(Math.max(0, i.lo === null ? 0 : Number(toBig(i.lo as bigint)) < 0 ? Number(toBig(i.lo as bigint)) + o.items.length : Number(toBig(i.lo as bigint))), o.items.length);
          o.items.splice(start, idx.length, ...vals);
        } else {
          const idx = this.sliceIdx(o.items.length, i);
          if (idx.length !== vals.length) this.raise('ValueError', `attempt to assign sequence of size ${vals.length} to extended slice of size ${idx.length}`);
          idx.forEach((k, j) => (o.items[k] = vals[j]));
        }
        return;
      }
      o.items[this.index(o.items.length, i, typeNameOf(o) === 'deque' ? 'deque' : 'list assignment')] = v;
      return;
    }
    if (o instanceof PyDict) {
      o.set(this.hashable(i), v);
      return;
    }
    if (o instanceof PyInstance) {
      const m = o.cls.lookup('__setitem__');
      if (m) {
        yield* this.call(m, [o, i, v]);
        return;
      }
    }
    if (typeof o === 'string') this.raise('TypeError', "'str' object does not support item assignment");
    if (o instanceof PyTuple) this.raise('TypeError', "'tuple' object does not support item assignment");
    this.raise('TypeError', `'${typeNameOf(o)}' object does not support item assignment`);
  }

  *delItem(o: PyVal, i: PyVal): G<void> {
    if (o instanceof PyList) {
      if (i instanceof PySlice) {
        const idx = new Set(this.sliceIdx(o.items.length, i));
        o.items = o.items.filter((_, k) => !idx.has(k));
        return;
      }
      o.items.splice(this.index(o.items.length, i, 'list assignment'), 1);
      return;
    }
    if (o instanceof PyDict) {
      if (!o.delete(this.hashable(i))) throw this.keyError(i);
      return;
    }
    if (o instanceof PyInstance) {
      const m = o.cls.lookup('__delitem__');
      if (m) {
        yield* this.call(m, [o, i]);
        return;
      }
    }
    this.raise('TypeError', `'${typeNameOf(o)}' object doesn't support item deletion`);
  }

  hashable(k: PyVal): PyVal {
    if (k instanceof PyInstance) {
      const h = k.cls.lookup('__hash__');
      if (h === null) this.raise('TypeError', `unhashable type: '${k.cls.name}'`);
      if (h instanceof PyFunc) {
        const hv = this.runSync(this.call(h, [k]));
        (k as PyInstance & { hashKey?: string }).hashKey = 'h:' + String(hv);
      } else if (k.cls.lookup('__eq__') instanceof PyFunc) this.raise('TypeError', `unhashable type: '${k.cls.name}'`);
    }
    try {
      keyOf(k);
    } catch (e) {
      this.raise('TypeError', (e as Error).message);
    }
    return k;
  }

  // ---------------- iteration ----------------
  *iter(v: PyVal): G<PyIter> {
    if (v instanceof PyIter) return v;
    if (v instanceof PyGenerator) return this.genIter(v);
    if (v instanceof PyList || v instanceof PyDeque) {
      let i = 0;
      return new PyIter(v instanceof PyList ? 'list_iterator' : 'deque_iterator', () => (i < v.items.length ? v.items[i++] : STOP));
    }
    if (v instanceof PyTuple) {
      let i = 0;
      return new PyIter('tuple_iterator', () => (i < v.items.length ? v.items[i++] : STOP));
    }
    if (typeof v === 'string') {
      const chars = [...v];
      let i = 0;
      return new PyIter('str_iterator', () => (i < chars.length ? chars[i++] : STOP));
    }
    if (v instanceof PyDict) {
      const keys = v.keys();
      let i = 0;
      const size = v.map.size;
      return new PyIter('dict_keyiterator', () => {
        if (v.map.size !== size) this.raise('RuntimeError', 'dictionary changed size during iteration');
        return i < keys.length ? keys[i++] : STOP;
      });
    }
    if (v instanceof PySet) {
      const vals = this.setOrder(v);
      let i = 0;
      return new PyIter('set_iterator', () => (i < vals.length ? vals[i++] : STOP));
    }
    if (v instanceof PyRange) {
      let i = 0n;
      const n = v.length;
      return new PyIter('range_iterator', () => (i < n ? v.at(i++) : STOP));
    }
    if (v instanceof PyDictView) return yield* this.iter(new PyList(v.items()));
    if (v instanceof PyInstance) {
      const m = v.cls.lookup('__iter__');
      if (m) {
        const it = yield* this.call(m, [v]);
        if (it instanceof PyIter || it instanceof PyGenerator) return yield* this.iter(it);
        if (it instanceof PyInstance) {
          const nx = it.cls.lookup('__next__');
          if (!nx) this.raise('TypeError', `iter() returned non-iterator of type '${it.cls.name}'`);
          const self = this;
          return new PyIter('iterator', function* () {
            try {
              return yield* self.call(nx, [it]);
            } catch (e) {
              const r = self.toRaise(e);
              if (r && r.exc.cls.isSubclassOf(self.T.StopIteration)) return STOP;
              throw e;
            }
          } as () => Generator<unknown, NextResult, unknown>);
        }
      }
      const gi = v.cls.lookup('__getitem__');
      if (gi) {
        let i = 0n;
        const self = this;
        return new PyIter('iterator', function* () {
          try {
            return yield* self.call(gi, [v, i++]);
          } catch (e) {
            const r = self.toRaise(e);
            if (r && r.exc.cls.isSubclassOf(self.T.IndexError)) return STOP;
            throw e;
          }
        } as () => Generator<unknown, NextResult, unknown>);
      }
    }
    this.raise('TypeError', `'${typeNameOf(v)}' object is not iterable`);
  }

  setOrder(s: PySet): PyVal[] {
    const vals = s.values();
    // CPython iterates small ints in ascending order; mimic that for readability
    if (vals.length && vals.every((x) => typeof x === 'bigint' && x >= 0n && x < 1n << 30n)) return [...vals].sort((a, b) => (a! < b! ? -1 : 1));
    return vals;
  }

  genIter(g: PyGenerator): PyIter {
    const self = this;
    const it = new PyIter('generator', function* () {
      return yield* self.genResume(g, null);
    } as () => Generator<unknown, NextResult, unknown>);
    (it as PyIter & { gen?: PyGenerator }).gen = g;
    return it;
  }

  *genResume(g: PyGenerator, send: PyVal): G<NextResult> {
    if (g.finished) return STOP;
    if (g.scope) this.stack.push(g.scope);
    try {
      let r = g.started ? g.gen.next(send) : g.gen.next();
      g.started = true;
      for (;;) {
        if (r.done) {
          g.finished = true;
          return STOP;
        }
        const ev = r.value as Ev;
        if (ev.ev === 'yield') return ev.value;
        yield ev; // trace event from inside the generator: pass it up
        r = g.gen.next();
      }
    } catch (e) {
      g.finished = true;
      const rz = this.toRaise(e);
      if (rz && g.scope) rz.traceback.unshift({ line: g.scope.line ?? 0, name: g.name });
      throw rz ?? e;
    } finally {
      if (g.scope) this.stack.pop();
    }
  }

  *next(it: PyIter): G<NextResult> {
    const r = it.nextFn();
    if (r && typeof r === 'object' && typeof (r as Generator).next === 'function' && !(r instanceof PyObj)) return yield* (r as G<NextResult>);
    return r as NextResult;
  }

  *toArray(v: PyVal): G<PyVal[]> {
    if (v instanceof PyList || v instanceof PyTuple) return [...v.items];
    if (typeof v === 'string') return [...v];
    const it = yield* this.iter(v);
    const out: PyVal[] = [];
    for (;;) {
      const x = yield* this.next(it);
      if (x === STOP) return out;
      out.push(x);
      if (out.length > 5_000_000) this.raise('MemoryError', 'too many items');
    }
  }

  // ---------------- truth / equality / comparison ----------------
  *truth(v: PyVal): G<boolean> {
    if (v === null) return false;
    if (typeof v === 'boolean') return v;
    if (typeof v === 'bigint') return v !== 0n;
    if (typeof v === 'number') return v !== 0;
    if (typeof v === 'string') return v.length > 0;
    if (v instanceof PyList || v instanceof PyTuple || v instanceof PyDeque) return v.items.length > 0;
    if (v instanceof PyDict) return v.map.size > 0;
    if (v instanceof PySet) return v.map.size > 0;
    if (v instanceof PyRange) return v.length > 0n;
    if (v instanceof PyInstance) {
      const b = v.cls.lookup('__bool__');
      if (b) return !!(yield* this.call(b, [v]));
      const l = v.cls.lookup('__len__');
      if (l) return (yield* this.call(l, [v])) !== 0n;
    }
    return true;
  }
  truthSync(v: PyVal) {
    return this.runSync(this.truth(v));
  }

  eq(a: PyVal, b: PyVal): boolean {
    if (a === b) return true;
    if (isNum(a) && isNum(b)) {
      if (typeof a === 'number' || typeof b === 'number') return toNum(a) === toNum(b);
      return toBig(a) === toBig(b);
    }
    if (typeof a === 'string' || typeof b === 'string') return a === b;
    if (a === null || b === null) return false;
    if ((a instanceof PyList && b instanceof PyList) || (a instanceof PyTuple && b instanceof PyTuple) || (a instanceof PyDeque && b instanceof PyDeque))
      return a.items.length === b.items.length && a.items.every((x, i) => this.eq(x, b.items[i]));
    if (a instanceof PyDict && b instanceof PyDict) {
      if (a.map.size !== b.map.size) return false;
      for (const [k, v] of a.entries()) {
        const bv = b.get(k);
        if (bv === undefined || !this.eq(v, bv)) return false;
      }
      return true;
    }
    if (a instanceof PySet && b instanceof PySet) return a.map.size === b.map.size && [...a.map.keys()].every((k) => b.map.has(k));
    if (a instanceof PyRange && b instanceof PyRange) return a.length === b.length && (a.length === 0n || (a.start === b.start && (a.length === 1n || a.step === b.step)));
    if (a instanceof PyInstance) {
      const m = a.cls.lookup('__eq__');
      if (m) {
        const r = this.runSync(this.call(m, [a, b]));
        if (r !== this.builtins.get('NotImplemented')) return this.truthSync(r);
      }
    }
    if (b instanceof PyInstance) {
      const m = b.cls.lookup('__eq__');
      if (m) {
        const r = this.runSync(this.call(m, [b, a]));
        if (r !== this.builtins.get('NotImplemented')) return this.truthSync(r);
      }
    }
    return false;
  }

  /** Ordering: returns <0, 0, >0. Throws TypeError for unorderable types. */
  cmpOrder(a: PyVal, b: PyVal, op = '<'): number {
    if (isNum(a) && isNum(b)) {
      if (typeof a === 'number' || typeof b === 'number') {
        const x = toNum(a), y = toNum(b);
        return x < y ? -1 : x > y ? 1 : 0;
      }
      const x = toBig(a), y = toBig(b);
      return x < y ? -1 : x > y ? 1 : 0;
    }
    if (typeof a === 'string' && typeof b === 'string') return a < b ? -1 : a > b ? 1 : 0;
    if ((a instanceof PyList && b instanceof PyList) || (a instanceof PyTuple && b instanceof PyTuple)) {
      const n = Math.min(a.items.length, b.items.length);
      for (let i = 0; i < n; i++) {
        if (!this.eq(a.items[i], b.items[i])) return this.cmpOrder(a.items[i], b.items[i], op);
      }
      return a.items.length - b.items.length;
    }
    if (a instanceof PyInstance || b instanceof PyInstance) {
      const lt = a instanceof PyInstance ? a.cls.lookup('__lt__') : null;
      if (lt) {
        if (this.truthSync(this.runSync(this.call(lt, [a, b])))) return -1;
        if (b instanceof PyInstance && this.truthSync(this.runSync(this.call(lt, [b, a])))) return 1;
        return 0;
      }
      const gt = b instanceof PyInstance ? b.cls.lookup('__gt__') ?? b.cls.lookup('__lt__') : null;
      if (gt && b instanceof PyInstance) {
        const r = this.truthSync(this.runSync(this.call(gt, [b, a])));
        return r ? -1 : 1;
      }
    }
    this.raise('TypeError', `'${op}' not supported between instances of '${typeNameOf(a)}' and '${typeNameOf(b)}'`);
  }

  *compare(op: string, a: PyVal, b: PyVal): G<PyVal> {
    switch (op) {
      case '==':
        return this.eq(a, b);
      case '!=':
        if (a instanceof PyInstance && a.cls.lookup('__ne__') instanceof PyFunc) return yield* this.call(a.cls.lookup('__ne__')!, [a, b]);
        return !this.eq(a, b);
      case 'is':
        return a === b || (typeof a === 'bigint' && typeof b === 'bigint' && a === b);
      case 'is not':
        return !(a === b);
      case 'in':
        return yield* this.contains(b, a);
      case 'not in':
        return !(yield* this.contains(b, a));
    }
    if (a instanceof PyInstance) {
      const name = { '<': '__lt__', '>': '__gt__', '<=': '__le__', '>=': '__ge__' }[op]!;
      const m = a.cls.lookup(name);
      if (m) return yield* this.call(m, [a, b]);
      if (op === '>' || op === '>=') {
        const rev = a.cls.lookup(op === '>' ? '__lt__' : '__le__');
        if (rev && b instanceof PyInstance) return yield* this.call(rev, [b, a]);
      }
    }
    if (a instanceof PySet && b instanceof PySet) {
      const sub = [...a.map.keys()].every((k) => b.map.has(k));
      const sup = [...b.map.keys()].every((k) => a.map.has(k));
      return op === '<=' ? sub : op === '>=' ? sup : op === '<' ? sub && a.map.size < b.map.size : sup && a.map.size > b.map.size;
    }
    const c = this.cmpOrder(a, b, op);
    return op === '<' ? c < 0 : op === '>' ? c > 0 : op === '<=' ? c <= 0 : c >= 0;
  }

  *contains(container: PyVal, x: PyVal): G<boolean> {
    if (typeof container === 'string') {
      if (typeof x !== 'string') this.raise('TypeError', `'in <string>' requires string as left operand, not ${typeNameOf(x)}`);
      return container.includes(x);
    }
    if (container instanceof PyDict) return container.has(this.hashable(x));
    if (container instanceof PySet) return container.has(this.hashable(x));
    if (container instanceof PyList || container instanceof PyTuple || container instanceof PyDeque) return container.items.some((y) => this.eq(y, x));
    if (container instanceof PyRange) {
      if (typeof x !== 'bigint') return false;
      const n = container.length;
      if (n === 0n) return false;
      const off = x - container.start;
      if (off % container.step !== 0n) return false;
      const i = off / container.step;
      return i >= 0n && i < n;
    }
    if (container instanceof PyDictView) return container.items().some((y) => this.eq(y, x));
    if (container instanceof PyInstance) {
      const m = container.cls.lookup('__contains__');
      if (m) return yield* this.truth(yield* this.call(m, [container, x]));
    }
    const it = yield* this.iter(container);
    for (;;) {
      const y = yield* this.next(it);
      if (y === STOP) return false;
      if (this.eq(y, x)) return true;
    }
  }

  // ---------------- arithmetic ----------------
  *binop(op: string, a: PyVal, b: PyVal): G<PyVal> {
    if (isNum(a) && isNum(b)) return this.numop(op, a, b);
    if (a instanceof PyInstance) {
      const m = a.cls.lookup(`__${DUNDER[op]}__`);
      if (m) {
        const r = yield* this.call(m, [a, b]);
        if (r !== this.builtins.get('NotImplemented')) return r;
      }
    }
    if (b instanceof PyInstance) {
      const m = b.cls.lookup(`__r${DUNDER[op]}__`);
      if (m) {
        const r = yield* this.call(m, [b, a]);
        if (r !== this.builtins.get('NotImplemented')) return r;
      }
    }
    switch (op) {
      case '+':
        if (typeof a === 'string' && typeof b === 'string') return a + b;
        if (a instanceof PyList && b instanceof PyList) return new PyList([...a.items, ...b.items]);
        if (a instanceof PyTuple && b instanceof PyTuple) return new PyTuple([...a.items, ...b.items]);
        if (a instanceof PyDict && b instanceof PyDict && a.flavor === 'Counter') {
          const r = new PyDict('Counter');
          for (const d of [a, b]) for (const [k, v] of d.entries()) r.set(k, ((r.get(k) as bigint) ?? 0n) + (v as bigint));
          for (const [k, v] of r.entries()) if ((v as bigint) <= 0n) r.delete(k);
          return r;
        }
        if (typeof a === 'string') this.raise('TypeError', `can only concatenate str (not "${typeNameOf(b)}") to str`);
        if (a instanceof PyList) this.raise('TypeError', `can only concatenate list (not "${typeNameOf(b)}") to list`);
        if (a instanceof PyTuple) this.raise('TypeError', `can only concatenate tuple (not "${typeNameOf(b)}") to tuple`);
        break;
      case '*': {
        const seq = typeof a === 'string' || a instanceof PyList || a instanceof PyTuple ? a : typeof b === 'string' || b instanceof PyList || b instanceof PyTuple ? b : null;
        const n = seq === a ? b : a;
        if (seq !== null && (typeof n === 'bigint' || typeof n === 'boolean')) {
          const k = Math.max(0, Number(toBig(n)));
          if (typeof seq === 'string') return seq.repeat(k);
          const items: PyVal[] = [];
          for (let i = 0; i < k; i++) items.push(...(seq as PyList).items);
          return seq instanceof PyTuple ? new PyTuple(items) : new PyList(items);
        }
        if (seq !== null) this.raise('TypeError', `can't multiply sequence by non-int of type '${typeNameOf(n)}'`);
        break;
      }
      case '%':
        if (typeof a === 'string') return yield* percentFormat(this, a, b);
        break;
      case '-':
        if (a instanceof PySet && b instanceof PySet) {
          const r = new PySet();
          for (const v of a.values()) if (!b.has(v)) r.add(v);
          return r;
        }
        if (a instanceof PyDict && b instanceof PyDict && a.flavor === 'Counter') {
          const r = new PyDict('Counter');
          for (const [k, v] of a.entries()) {
            const n = (v as bigint) - ((b.get(k) as bigint) ?? 0n);
            if (n > 0n) r.set(k, n);
          }
          return r;
        }
        break;
      case '|':
        if (a instanceof PySet && b instanceof PySet) {
          const r = new PySet();
          for (const v of [...a.values(), ...b.values()]) r.add(v);
          return r;
        }
        if (a instanceof PyDict && b instanceof PyDict) {
          const r = new PyDict(a.flavor);
          for (const d of [a, b]) for (const [k, v] of d.entries()) r.set(k, v);
          return r;
        }
        break;
      case '&':
        if (a instanceof PySet && b instanceof PySet) {
          const r = new PySet();
          for (const v of a.values()) if (b.has(v)) r.add(v);
          return r;
        }
        break;
      case '^':
        if (a instanceof PySet && b instanceof PySet) {
          const r = new PySet();
          for (const v of a.values()) if (!b.has(v)) r.add(v);
          for (const v of b.values()) if (!a.has(v)) r.add(v);
          return r;
        }
        break;
    }
    this.raise('TypeError', `unsupported operand type(s) for ${op === '**' ? '** or pow()' : op}: '${typeNameOf(a)}' and '${typeNameOf(b)}'`);
  }

  numop(op: string, a: bigint | boolean | number, b: bigint | boolean | number): PyVal {
    const flt = typeof a === 'number' || typeof b === 'number';
    if (flt || op === '/') {
      const x = toNum(a), y = toNum(b);
      switch (op) {
        case '+': return x + y;
        case '-': return x - y;
        case '*': return x * y;
        case '/':
          if (y === 0) this.raise('ZeroDivisionError', flt ? 'float division by zero' : 'division by zero');
          if (!flt) {
            // exact int / int when both are big
            const A = toBig(a), B = toBig(b);
            if (A % B === 0n && (A > 9007199254740991n || A < -9007199254740991n)) return Number(A / B);
          }
          return x / y;
        case '//':
          if (y === 0) this.raise('ZeroDivisionError', 'float floor division by zero');
          return Math.floor(x / y);
        case '%': {
          if (y === 0) this.raise('ZeroDivisionError', 'float modulo');
          const r = x % y;
          return r !== 0 && r < 0 !== y < 0 ? r + y : r;
        }
        case '**': {
          if (x === 0 && y < 0) this.raise('ZeroDivisionError', '0.0 cannot be raised to a negative power');
          const r = Math.pow(x, y);
          if (!isFinite(r) && isFinite(x) && isFinite(y)) this.raise('OverflowError', '(34, \'Numerical result out of range\')');
          return r;
        }
      }
      this.raise('TypeError', `unsupported operand type(s) for ${op}: '${typeNameOf(a)}' and '${typeNameOf(b)}'`);
    }
    const x = toBig(a), y = toBig(b);
    switch (op) {
      case '+': return x + y;
      case '-': return x - y;
      case '*': return x * y;
      case '//': {
        if (y === 0n) this.raise('ZeroDivisionError', 'integer division or modulo by zero');
        const q = x / y;
        return (x % y !== 0n) && ((x < 0n) !== (y < 0n)) ? q - 1n : q;
      }
      case '%': {
        if (y === 0n) this.raise('ZeroDivisionError', 'integer modulo by zero');
        const r = x % y;
        return r !== 0n && (r < 0n) !== (y < 0n) ? r + y : r;
      }
      case '**':
        if (y < 0n) {
          if (x === 0n) this.raise('ZeroDivisionError', '0.0 cannot be raised to a negative power');
          return Math.pow(Number(x), Number(y));
        }
        if (y > 100000n) this.raise('OverflowError', 'exponent too large for this sandbox');
        return x ** y;
      case '<<': return x << y;
      case '>>': return x >> y;
      case '&': return typeof a === 'boolean' && typeof b === 'boolean' ? a && b : x & y;
      case '|': return typeof a === 'boolean' && typeof b === 'boolean' ? a || b : x | y;
      case '^': return typeof a === 'boolean' && typeof b === 'boolean' ? a !== b : x ^ y;
    }
    this.raise('TypeError', `unsupported operand type(s) for ${op}: '${typeNameOf(a)}' and '${typeNameOf(b)}'`);
  }

  // ---------------- repr / str / format ----------------
  private reprDepth = new Set<number>();

  *repr(v: PyVal): G<string> {
    if (v === null || typeof v !== 'object') return this.primRepr(v);
    if (this.reprDepth.has(v.id)) return v instanceof PyList ? '[...]' : v instanceof PyDict ? '{...}' : '...';
    this.reprDepth.add(v.id);
    try {
      return yield* this.reprObj(v);
    } finally {
      this.reprDepth.delete(v.id);
    }
  }

  private *reprObj(v: PyObj): G<string> {
    const items = function* (self: Interp, xs: PyVal[]): G<string> {
      const parts: string[] = [];
      for (const x of xs) parts.push(yield* self.repr(x));
      return parts.join(', ');
    };
    if (v instanceof PyList) return '[' + (yield* items(this, v.items)) + ']';
    if (v instanceof PyTuple) return '(' + (yield* items(this, v.items)) + (v.items.length === 1 ? ',)' : ')');
    if (v instanceof PyDeque) return 'deque([' + (yield* items(this, v.items)) + ']' + (v.maxlen !== null ? `, maxlen=${v.maxlen}` : '') + ')';
    if (v instanceof PySet) {
      if (!v.map.size) return v.frozen ? 'frozenset()' : 'set()';
      const inner = '{' + (yield* items(this, this.setOrder(v))) + '}';
      return v.frozen ? `frozenset(${inner})` : inner;
    }
    if (v instanceof PyDict) {
      let entries = v.entries();
      if (v.flavor === 'Counter') entries = [...entries].sort((x, y) => Number(toBig(y[1] as bigint) - toBig(x[1] as bigint)));
      const parts: string[] = [];
      for (const [k, val] of entries) parts.push((yield* this.repr(k)) + ': ' + (yield* this.repr(val)));
      const body = '{' + parts.join(', ') + '}';
      if (v.flavor === 'Counter') return entries.length ? `Counter(${body})` : 'Counter()';
      if (v.flavor === 'defaultdict') return `defaultdict(${yield* this.repr(v.defaultFactory)}, ${body})`;
      if (v.flavor === 'OrderedDict') return entries.length ? `OrderedDict(${body})` : 'OrderedDict()';
      return body;
    }
    if (v instanceof PyRange) return `range(${v.start}, ${v.stop}${v.step !== 1n ? ', ' + v.step : ''})`;
    if (v instanceof PyFunc) return `<function ${v.owner ? v.owner.name + '.' : ''}${v.name} at 0x${(0x7f0000 + v.id).toString(16)}>`;
    if (v instanceof PyBuiltin) return `<built-in function ${v.name}>`;
    if (v instanceof PyClass) return v.builtin && v.builtin !== 'exception' ? `<class '${v.name}'>` : v.builtin === 'exception' && v.name in this.T ? `<class '${v.name}'>` : `<class '__main__.${v.name}'>`;
    if (v instanceof PyModule) return `<module '${v.name}'>`;
    if (v instanceof PyBoundMethod) return `<bound method ${v.func instanceof PyFunc ? v.func.name : '?'}>`;
    if (v instanceof PyGenerator) return `<generator object ${v.name} at 0x${(0x7f0000 + v.id).toString(16)}>`;
    if (v instanceof PyDictView) return `dict_${v.kind}([${yield* items(this, v.items())}])`;
    if (v instanceof PySlice) return `slice(${yield* this.repr(v.lo)}, ${yield* this.repr(v.hi)}, ${yield* this.repr(v.step)})`;
    if (v instanceof PyInstance) {
      const m = v.cls.lookup('__repr__');
      if (m) return (yield* this.call(m, [v])) as string;
      if (v.cls.isSubclassOf(this.T.BaseException)) {
        const args = v.attrs.get('args') as PyTuple;
        const inner = args && args.items.length === 1 ? yield* this.repr(args.items[0]) : args ? (yield* items(this, args.items)) : '';
        return `${v.cls.name}(${inner})`;
      }
      return `<__main__.${v.cls.name} object at 0x${(0x7f0000 + v.id).toString(16)}>`;
    }
    if (v instanceof PyIter) return `<${v.kind} object at 0x${(0x7f0000 + v.id).toString(16)}>`;
    return `<${v.typeName} object>`;
  }

  *str(v: PyVal): G<string> {
    if (typeof v === 'string') return v;
    if (v instanceof PyInstance) {
      const m = v.cls.lookup('__str__');
      if (m) return (yield* this.call(m, [v])) as string;
      if (v.cls.isSubclassOf(this.T.BaseException)) return this.excMessage(v);
    }
    return yield* this.repr(v);
  }

  *format(v: PyVal, spec: string): G<string> {
    if (v instanceof PyInstance) {
      const m = v.cls.lookup('__format__');
      if (m) return (yield* this.call(m, [v, spec])) as string;
      return formatSpec(yield* this.str(v), spec, this);
    }
    if (!spec) return yield* this.str(v);
    return formatSpec(v, spec, this);
  }

  // ---------------- modules ----------------
  importModule(name: string): PyModule {
    let m = this.modules.get(name);
    if (m) return m;
    const f = this.moduleFactories.get(name);
    if (!f) this.raise('ModuleNotFoundError', `No module named '${name}'`);
    m = f();
    this.modules.set(name, m);
    return m;
  }
}

export class StepLimit extends Error {}

export class PySlice extends PyObj {
  constructor(public lo: PyVal, public hi: PyVal, public step: PyVal) {
    super();
  }
  get typeName() {
    return 'slice';
  }
}

export class PyDictView extends PyObj {
  constructor(public dict: PyDict, public kind: 'keys' | 'values' | 'items') {
    super();
  }
  get typeName() {
    return 'dict_' + this.kind;
  }
  items(): PyVal[] {
    if (this.kind === 'keys') return this.dict.keys();
    if (this.kind === 'values') return this.dict.values();
    return this.dict.entries().map(([k, v]) => new PyTuple([k, v]));
  }
}

export const DUNDER: Record<string, string> = {
  '+': 'add', '-': 'sub', '*': 'mul', '/': 'truediv', '//': 'floordiv', '%': 'mod', '**': 'pow',
  '<<': 'lshift', '>>': 'rshift', '&': 'and', '|': 'or', '^': 'xor', '@': 'matmul',
};

/** Which names does a function body assign (=> local), and which are declared global/nonlocal? */
export function analyzeLocals(body: Stmt[], params: Param[]) {
  const locals = new Set(params.map((p) => p.name));
  const globals = new Set<string>();
  const nonlocals = new Set<string>();
  const target = (e: Expr) => {
    if (e.k === 'name') locals.add(e.id);
    else if (e.k === 'tuple' || e.k === 'list') e.items.forEach(target);
    else if (e.k === 'star') target(e.v);
  };
  const walrus = (node: unknown): void => {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) return node.forEach(walrus);
    const n = node as { k?: string; target?: string };
    if (n.k === 'lambda') return;
    if (n.k === 'walrus' && n.target) locals.add(n.target);
    Object.values(node as object).forEach(walrus);
  };
  const visit = (s: Stmt) => {
    switch (s.k) {
      case 'assign':
        s.targets.forEach(target);
        walrus(s.v);
        break;
      case 'augassign':
      case 'annassign':
        target(s.target);
        break;
      case 'for':
        target(s.target);
        s.body.forEach(visit);
        s.orelse.forEach(visit);
        walrus(s.iter);
        break;
      case 'while':
        walrus(s.test);
        s.body.forEach(visit);
        s.orelse.forEach(visit);
        break;
      case 'if':
        walrus(s.test);
        s.body.forEach(visit);
        s.orelse.forEach(visit);
        break;
      case 'try':
        s.body.forEach(visit);
        s.handlers.forEach((h) => {
          if (h.name) locals.add(h.name);
          h.body.forEach(visit);
        });
        s.orelse.forEach(visit);
        s.final.forEach(visit);
        break;
      case 'with':
        s.items.forEach((i) => i.as && target(i.as));
        s.body.forEach(visit);
        break;
      case 'def':
      case 'class':
        locals.add(s.name);
        break;
      case 'import':
        s.names.forEach((n) => locals.add(n.as ?? n.name.split('.')[0]));
        break;
      case 'from':
        s.names.forEach((n) => n.name !== '*' && locals.add(n.as ?? n.name));
        break;
      case 'del':
        s.targets.forEach(target);
        break;
      case 'global':
        s.names.forEach((n) => globals.add(n));
        break;
      case 'nonlocal':
        s.names.forEach((n) => nonlocals.add(n));
        break;
      case 'expr':
      case 'return':
        walrus(s.v);
        break;
    }
  };
  body.forEach(visit);
  for (const g of globals) locals.delete(g);
  for (const n of nonlocals) locals.delete(n);
  return { locals, globals, nonlocals };
}
