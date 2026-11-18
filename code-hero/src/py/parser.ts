// Recursive-descent parser for a large, practical subset of Python 3.

import type { Arg, CompFor, Expr, Param, Stmt } from './ast';
import { PySyntaxError, Tok, tokenize, unescape } from './lexer';

export function parse(src: string): Stmt[] {
  const p = new Parser(tokenize(src));
  return p.module();
}

export function parseExpression(src: string, line = 1): Expr {
  const toks = tokenize(src).filter((t) => t.kind !== 'newline' && t.kind !== 'indent' && t.kind !== 'dedent');
  toks.forEach((t) => (t.line = line));
  const p = new Parser(toks);
  const e = p.exprList();
  if (p.peek().kind !== 'eof') throw new PySyntaxError('invalid syntax', line);
  return e;
}

const AUG = ['+=', '-=', '*=', '/=', '//=', '%=', '**=', '&=', '|=', '^=', '>>=', '<<=', '@='];
const COMP_OPS = ['<', '>', '==', '>=', '<=', '!='];

class Parser {
  i = 0;
  constructor(public t: Tok[]) {}

  peek(o = 0): Tok {
    return this.t[Math.min(this.i + o, this.t.length - 1)];
  }
  next(): Tok {
    return this.t[this.i++];
  }
  isOp(v: string, o = 0) {
    const t = this.peek(o);
    return t.kind === 'op' && t.value === v;
  }
  isKw(v: string, o = 0) {
    const t = this.peek(o);
    return t.kind === 'name' && t.value === v;
  }
  eatOp(v: string) {
    if (this.isOp(v)) {
      this.i++;
      return true;
    }
    return false;
  }
  eatKw(v: string) {
    if (this.isKw(v)) {
      this.i++;
      return true;
    }
    return false;
  }
  expectOp(v: string) {
    if (!this.eatOp(v)) this.err(`expected '${v}'`);
  }
  expectKw(v: string) {
    if (!this.eatKw(v)) this.err(`expected '${v}'`);
  }
  err(msg = 'invalid syntax'): never {
    const t = this.peek();
    throw new PySyntaxError(msg === 'invalid syntax' || t.kind === 'eof' ? msg : `${msg} (near '${t.value || t.kind}')`, t.line);
  }
  name(): string {
    const t = this.next();
    if (t.kind !== 'name') {
      this.i--;
      this.err('expected a name');
    }
    return t.value;
  }

  module(): Stmt[] {
    const body: Stmt[] = [];
    while (this.peek().kind !== 'eof') {
      if (this.peek().kind === 'newline') {
        this.i++;
        continue;
      }
      if (this.peek().kind === 'indent') this.err('unexpected indent');
      body.push(...this.statement());
    }
    return body;
  }

  block(): Stmt[] {
    this.expectOp(':');
    if (this.peek().kind !== 'newline') {
      // one-line block: if x: return y
      return this.simpleStmts();
    }
    this.i++;
    if (this.peek().kind !== 'indent') this.err('expected an indented block');
    this.i++;
    const body: Stmt[] = [];
    while (this.peek().kind !== 'dedent' && this.peek().kind !== 'eof') {
      if (this.peek().kind === 'newline') {
        this.i++;
        continue;
      }
      body.push(...this.statement());
    }
    this.i++; // dedent
    return body;
  }

  statement(): Stmt[] {
    const t = this.peek();
    if (t.kind === 'op' && t.value === '@') return [this.decorated()];
    if (t.kind === 'name') {
      switch (t.value) {
        case 'if': return [this.ifStmt()];
        case 'while': return [this.whileStmt()];
        case 'for': return [this.forStmt()];
        case 'def': return [this.defStmt([])];
        case 'class': return [this.classStmt([])];
        case 'try': return [this.tryStmt()];
        case 'with': return [this.withStmt()];
      }
    }
    return this.simpleStmts();
  }

  simpleStmts(): Stmt[] {
    const out: Stmt[] = [this.simpleStmt()];
    while (this.eatOp(';')) {
      if (this.peek().kind === 'newline') break;
      out.push(this.simpleStmt());
    }
    if (this.peek().kind !== 'newline' && this.peek().kind !== 'eof') this.err();
    if (this.peek().kind === 'newline') this.i++;
    return out;
  }

  simpleStmt(): Stmt {
    const t = this.peek();
    const line = t.line;
    if (t.kind === 'name') {
      switch (t.value) {
        case 'pass': this.i++; return { k: 'pass', line };
        case 'break': this.i++; return { k: 'break', line };
        case 'continue': this.i++; return { k: 'continue', line };
        case 'return': {
          this.i++;
          const v = this.atStmtEnd() ? undefined : this.exprList(true);
          return { k: 'return', v, line };
        }
        case 'raise': {
          this.i++;
          if (this.atStmtEnd()) return { k: 'raise', line };
          const v = this.expr();
          const cause = this.eatKw('from') ? this.expr() : undefined;
          return { k: 'raise', v, cause, line };
        }
        case 'global':
        case 'nonlocal': {
          this.i++;
          const names = [this.name()];
          while (this.eatOp(',')) names.push(this.name());
          return { k: t.value as 'global', names, line };
        }
        case 'del': {
          this.i++;
          const targets = [this.expr()];
          while (this.eatOp(',')) targets.push(this.expr());
          return { k: 'del', targets, line };
        }
        case 'assert': {
          this.i++;
          const test = this.expr();
          const msg = this.eatOp(',') ? this.expr() : undefined;
          return { k: 'assert', test, msg, line };
        }
        case 'import': {
          this.i++;
          const names: { name: string; as?: string }[] = [];
          do {
            let n = this.name();
            while (this.eatOp('.')) n += '.' + this.name();
            names.push({ name: n, as: this.eatKw('as') ? this.name() : undefined });
          } while (this.eatOp(','));
          return { k: 'import', names, line };
        }
        case 'from': {
          this.i++;
          let mod = '';
          while (this.isOp('.')) {
            this.i++;
            mod += '.';
          }
          if (!this.isKw('import')) {
            mod += this.name();
            while (this.eatOp('.')) mod += '.' + this.name();
          }
          this.expectKw('import');
          const names: { name: string; as?: string }[] = [];
          const paren = this.eatOp('(');
          if (this.eatOp('*')) names.push({ name: '*' });
          else
            do {
              if (paren && this.isOp(')')) break;
              names.push({ name: this.name(), as: this.eatKw('as') ? this.name() : undefined });
            } while (this.eatOp(','));
          if (paren) this.expectOp(')');
          return { k: 'from', module: mod, names, line };
        }
      }
    }
    // expression / assignment
    const first = this.exprList(true, true);
    if (this.isOp(':') && first.k !== 'tuple') {
      this.i++;
      const ann = this.expr();
      const v = this.eatOp('=') ? this.exprList(true) : undefined;
      return { k: 'annassign', target: first, ann, v, line };
    }
    const op = this.peek();
    if (op.kind === 'op' && AUG.includes(op.value)) {
      this.i++;
      const v = this.isKw('yield') ? this.yieldExpr() : this.exprList(true);
      this.checkTarget(first);
      return { k: 'augassign', target: first, op: op.value.slice(0, -1), v, line };
    }
    if (this.isOp('=')) {
      const targets = [first];
      let v: Expr = first;
      while (this.eatOp('=')) {
        v = this.isKw('yield') ? this.yieldExpr() : this.exprList(true, true);
        targets.push(v);
      }
      targets.pop();
      targets.forEach((x) => this.checkTarget(x));
      return { k: 'assign', targets, v, line };
    }
    return { k: 'expr', v: first, line };
  }

  checkTarget(e: Expr): void {
    if (e.k === 'name' || e.k === 'attr' || e.k === 'sub') return;
    if (e.k === 'tuple' || e.k === 'list') return e.items.forEach((x) => this.checkTarget(x.k === 'star' ? x.v : x));
    if (e.k === 'star') return this.checkTarget(e.v);
    throw new PySyntaxError(e.k === 'call' ? 'cannot assign to function call' : e.k === 'num' || e.k === 'str' ? 'cannot assign to literal' : 'cannot assign to expression', e.line);
  }

  atStmtEnd() {
    const t = this.peek();
    return t.kind === 'newline' || t.kind === 'eof' || (t.kind === 'op' && t.value === ';');
  }

  decorated(): Stmt {
    const decs: Expr[] = [];
    while (this.eatOp('@')) {
      decs.push(this.expr());
      if (this.peek().kind === 'newline') this.i++;
    }
    if (this.isKw('def')) return this.defStmt(decs);
    if (this.isKw('class')) return this.classStmt(decs);
    this.err('expected def or class after decorator');
  }

  ifStmt(): Stmt {
    const line = this.next().line;
    const test = this.namedExpr();
    const body = this.block();
    let orelse: Stmt[] = [];
    if (this.isKw('elif')) {
      orelse = [this.ifStmt()];
    } else if (this.eatKw('else')) orelse = this.block();
    return { k: 'if', test, body, orelse, line };
  }
  whileStmt(): Stmt {
    const line = this.next().line;
    const test = this.namedExpr();
    const body = this.block();
    const orelse = this.eatKw('else') ? this.block() : [];
    return { k: 'while', test, body, orelse, line };
  }
  forStmt(): Stmt {
    const line = this.next().line;
    const target = this.targetList();
    this.expectKw('in');
    const iter = this.exprList(true);
    const body = this.block();
    const orelse = this.eatKw('else') ? this.block() : [];
    return { k: 'for', target, iter, body, orelse, line };
  }
  targetList(): Expr {
    const line = this.peek().line;
    const items: Expr[] = [];
    do {
      if (this.isKw('in')) break;
      if (this.eatOp('*')) items.push({ k: 'star', v: this.bitor(), line });
      else items.push(this.bitor());
    } while (this.eatOp(','));
    const t = items.length === 1 && !this.t[this.i - 1].value.includes(',') ? items[0] : { k: 'tuple' as const, items, line };
    this.checkTarget(t);
    return t;
  }
  defStmt(decorators: Expr[]): Stmt {
    const line = this.next().line;
    const name = this.name();
    this.expectOp('(');
    const params = this.params(')');
    this.expectOp(')');
    if (this.eatOp('->')) this.expr();
    const body = this.block();
    const endLine = this.t[this.i - 1].line;
    return { k: 'def', name, params, body, decorators, line, endLine, isGen: containsYield(body) };
  }
  params(close: string): Param[] {
    const ps: Param[] = [];
    let kwonly = false;
    while (!this.isOp(close)) {
      if (this.eatOp('/')) {
        // positional-only marker: ignore
      } else if (this.eatOp('**')) ps.push({ name: this.name(), kind: 'dstar' });
      else if (this.eatOp('*')) {
        if (this.isOp(',') || this.isOp(close)) kwonly = true;
        else {
          ps.push({ name: this.name(), kind: 'star' });
          kwonly = true;
        }
        if (close === ')' && this.eatOp(':')) this.expr();
      } else {
        const name = this.name();
        if (close === ')' && this.eatOp(':')) this.expr(); // annotation
        const d = this.eatOp('=') ? this.expr() : undefined;
        ps.push({ name, kind: kwonly ? 'kwonly' : 'normal', default: d });
      }
      if (!this.eatOp(',')) break;
    }
    return ps;
  }
  classStmt(decorators: Expr[]): Stmt {
    const line = this.next().line;
    const name = this.name();
    let bases: Expr[] = [];
    let kwargs: Arg[] = [];
    if (this.eatOp('(')) {
      const args = this.args();
      this.expectOp(')');
      bases = args.filter((a) => a.kind === 'pos').map((a) => a.v);
      kwargs = args.filter((a) => a.kind === 'kw');
    }
    const body = this.block();
    return { k: 'class', name, bases, kwargs, body, decorators, line };
  }
  tryStmt(): Stmt {
    const line = this.next().line;
    const body = this.block();
    const handlers: { type?: Expr; name?: string; body: Stmt[]; line: number }[] = [];
    while (this.isKw('except')) {
      const hl = this.next().line;
      let type: Expr | undefined;
      let name: string | undefined;
      if (!this.isOp(':')) {
        type = this.expr();
        if (this.eatOp(',')) {
          const items = [type, this.expr()];
          while (this.eatOp(',')) items.push(this.expr());
          type = { k: 'tuple', items, line: hl };
        }
        if (this.eatKw('as')) name = this.name();
      }
      handlers.push({ type, name, body: this.block(), line: hl });
    }
    const orelse = this.eatKw('else') ? this.block() : [];
    const final = this.eatKw('finally') ? this.block() : [];
    if (!handlers.length && !final.length) this.err("expected 'except' or 'finally' block");
    return { k: 'try', body, handlers, orelse, final, line };
  }
  withStmt(): Stmt {
    const line = this.next().line;
    const items: { ctx: Expr; as?: Expr }[] = [];
    do {
      const ctx = this.expr();
      const as = this.eatKw('as') ? this.bitor() : undefined;
      items.push({ ctx, as });
    } while (this.eatOp(','));
    return { k: 'with', items, body: this.block(), line };
  }

  // ---------------- expressions ----------------
  /** expr (, expr)* — a bare comma makes a tuple. */
  exprList(allowStar = false, allowYield = false): Expr {
    if (allowYield && this.isKw('yield')) return this.yieldExpr();
    const line = this.peek().line;
    const first = allowStar && this.isOp('*') ? this.starExpr() : this.namedExpr();
    if (!this.isOp(',')) return first;
    const items = [first];
    while (this.eatOp(',')) {
      if (this.atExprEnd()) break;
      items.push(allowStar && this.isOp('*') ? this.starExpr() : this.namedExpr());
    }
    return { k: 'tuple', items, line };
  }
  atExprEnd() {
    const t = this.peek();
    return t.kind === 'newline' || t.kind === 'eof' || (t.kind === 'op' && [')', ']', '}', '=', ':', ';'].includes(t.value)) || (t.kind === 'op' && AUG.includes(t.value)) || this.isKw('in');
  }
  starExpr(): Expr {
    const line = this.next().line;
    return { k: 'star', v: this.bitor(), line };
  }
  yieldExpr(): Expr {
    const line = this.next().line;
    if (this.eatKw('from')) return { k: 'yield', v: this.expr(), from: true, line };
    if (this.atExprEnd()) return { k: 'yield', line };
    return { k: 'yield', v: this.exprList(true), line };
  }
  namedExpr(): Expr {
    if (this.peek().kind === 'name' && this.isOp(':=', 1)) {
      const t = this.next();
      this.i++;
      return { k: 'walrus', target: t.value, v: this.expr(), line: t.line };
    }
    return this.expr();
  }
  expr(): Expr {
    if (this.isKw('lambda')) {
      const line = this.next().line;
      const params = this.params(':');
      this.expectOp(':');
      return { k: 'lambda', params, body: this.expr(), line };
    }
    const e = this.orTest();
    if (this.isKw('if') ) {
      // ternary — but not inside comprehension "for x in y if z" (handled by caller using orTest)
      const save = this.i;
      this.i++;
      const test = this.orTest();
      if (!this.eatKw('else')) {
        this.i = save;
        return e;
      }
      const orelse = this.expr();
      return { k: 'ifexp', test, body: e, orelse, line: e.line };
    }
    return e;
  }
  orTest(): Expr {
    let e = this.andTest();
    if (this.isKw('or')) {
      const vals = [e];
      while (this.eatKw('or')) vals.push(this.andTest());
      e = { k: 'bool', op: 'or', vals, line: e.line };
    }
    return e;
  }
  andTest(): Expr {
    let e = this.notTest();
    if (this.isKw('and')) {
      const vals = [e];
      while (this.eatKw('and')) vals.push(this.notTest());
      e = { k: 'bool', op: 'and', vals, line: e.line };
    }
    return e;
  }
  notTest(): Expr {
    if (this.isKw('not')) {
      const line = this.next().line;
      return { k: 'unary', op: 'not', a: this.notTest(), line };
    }
    return this.comparison();
  }
  comparison(): Expr {
    const first = this.bitor();
    const ops: string[] = [];
    const rest: Expr[] = [];
    for (;;) {
      const t = this.peek();
      let op: string | null = null;
      if (t.kind === 'op' && COMP_OPS.includes(t.value)) {
        op = t.value;
        this.i++;
      } else if (this.isKw('in')) {
        op = 'in';
        this.i++;
      } else if (this.isKw('not') && this.isKw('in', 1)) {
        op = 'not in';
        this.i += 2;
      } else if (this.isKw('is')) {
        this.i++;
        op = this.eatKw('not') ? 'is not' : 'is';
      }
      if (!op) break;
      ops.push(op);
      rest.push(this.bitor());
    }
    return ops.length ? { k: 'cmp', first, ops, rest, line: first.line } : first;
  }
  binLevel(ops: string[], next: () => Expr): Expr {
    let e = next();
    for (;;) {
      const t = this.peek();
      if (t.kind === 'op' && ops.includes(t.value)) {
        this.i++;
        e = { k: 'bin', op: t.value, a: e, b: next(), line: e.line };
      } else return e;
    }
  }
  bitor = (): Expr => this.binLevel(['|'], this.bitxor);
  bitxor = (): Expr => this.binLevel(['^'], this.bitand);
  bitand = (): Expr => this.binLevel(['&'], this.shift);
  shift = (): Expr => this.binLevel(['<<', '>>'], this.arith);
  arith = (): Expr => this.binLevel(['+', '-'], this.term);
  term = (): Expr => this.binLevel(['*', '/', '//', '%', '@'], this.factor);
  factor = (): Expr => {
    const t = this.peek();
    if (t.kind === 'op' && (t.value === '-' || t.value === '+' || t.value === '~')) {
      this.i++;
      const a = this.factor();
      if (t.value === '-' && a.k === 'num') return { ...a, v: typeof a.v === 'bigint' ? -a.v : -a.v };
      return { k: 'unary', op: t.value, a, line: t.line };
    }
    return this.power();
  };
  power(): Expr {
    const base = this.primary();
    if (this.eatOp('**')) return { k: 'bin', op: '**', a: base, b: this.factor(), line: base.line };
    return base;
  }
  primary(): Expr {
    let e = this.atom();
    for (;;) {
      if (this.eatOp('.')) e = { k: 'attr', obj: e, name: this.name(), line: e.line };
      else if (this.isOp('(')) {
        this.i++;
        const args = this.args();
        this.expectOp(')');
        e = { k: 'call', fn: e, args, line: e.line };
      } else if (this.isOp('[')) {
        this.i++;
        const index = this.subscript();
        this.expectOp(']');
        e = { k: 'sub', obj: e, index, line: e.line };
      } else return e;
    }
  }
  subscript(): Expr {
    const line = this.peek().line;
    const items: Expr[] = [];
    do {
      if (this.isOp(']')) break;
      items.push(this.sliceItem());
    } while (this.eatOp(','));
    return items.length === 1 && !this.t[this.i - 1].value.includes(',') ? items[0] : { k: 'tuple', items, line };
  }
  sliceItem(): Expr {
    const line = this.peek().line;
    let lo: Expr | undefined;
    if (!this.isOp(':')) {
      lo = this.namedExpr();
      if (!this.isOp(':')) return lo;
    }
    this.expectOp(':');
    const hi = this.isOp(':') || this.isOp(']') || this.isOp(',') ? undefined : this.expr();
    let step: Expr | undefined;
    if (this.eatOp(':')) step = this.isOp(']') || this.isOp(',') ? undefined : this.expr();
    return { k: 'slice', lo, hi, step, line };
  }
  args(): Arg[] {
    const out: Arg[] = [];
    while (!this.isOp(')')) {
      if (this.eatOp('**')) out.push({ kind: 'dstar', v: this.expr() });
      else if (this.eatOp('*')) out.push({ kind: 'star', v: this.expr() });
      else if (this.peek().kind === 'name' && this.isOp('=', 1)) {
        const name = this.next().value;
        this.i++;
        out.push({ kind: 'kw', name, v: this.expr() });
      } else {
        const v = this.namedExpr();
        if (this.isKw('for')) {
          // generator expression as sole argument: f(x for x in y)
          out.push({ kind: 'pos', v: { k: 'comp', kind: 'gen', elt: v, gens: this.compFors(), line: v.line } });
        } else out.push({ kind: 'pos', v });
      }
      if (!this.eatOp(',')) break;
    }
    return out;
  }
  compFors(): CompFor[] {
    const gens: CompFor[] = [];
    while (this.isKw('for') || (this.isKw('async') && this.isKw('for', 1))) {
      this.eatKw('async');
      this.expectKw('for');
      const target = this.targetList();
      this.expectKw('in');
      const iter = this.orTest();
      const ifs: Expr[] = [];
      while (this.eatKw('if')) ifs.push(this.orTestNoCond());
      gens.push({ target, iter, ifs });
    }
    return gens;
  }
  orTestNoCond(): Expr {
    return this.orTest();
  }
  atom(): Expr {
    const t = this.next();
    const line = t.line;
    if (t.kind === 'num') return parseNumber(t.value, line);
    if (t.kind === 'str') {
      // implicit concatenation of adjacent literals
      const pieces: Tok[] = [t];
      while (this.peek().kind === 'str') pieces.push(this.next());
      if (pieces.some((p) => p.prefix?.includes('f'))) {
        const parts: (string | { e: Expr; conv?: string; spec?: Expr; debug?: string })[] = [];
        for (const p of pieces) {
          if (p.prefix?.includes('f')) parts.push(...parseFString(p.value, !!p.prefix?.includes('r'), p.line));
          else parts.push(p.prefix?.includes('r') ? p.value : unescape(p.value));
        }
        return { k: 'fstr', parts, line };
      }
      return { k: 'str', v: pieces.map((p) => (p.prefix?.includes('r') ? p.value : unescape(p.value))).join(''), line };
    }
    if (t.kind === 'name') {
      if (t.value === 'True' || t.value === 'False' || t.value === 'None') return { k: 'const', v: t.value, line };
      if (['if', 'else', 'elif', 'for', 'while', 'def', 'class', 'return', 'in', 'is', 'and', 'or', 'not', 'import', 'from', 'pass', 'break', 'continue', 'try', 'except', 'finally', 'raise', 'with', 'as', 'global', 'nonlocal', 'del', 'assert', 'yield'].includes(t.value)) {
        this.i--;
        this.err();
      }
      return { k: 'name', id: t.value, line };
    }
    if (t.kind === 'op') {
      if (t.value === '...') return { k: 'const', v: 'Ellipsis', line };
      if (t.value === '(') {
        if (this.eatOp(')')) return { k: 'tuple', items: [], line };
        if (this.isKw('yield')) {
          const y = this.yieldExpr();
          this.expectOp(')');
          return y;
        }
        const first = this.isOp('*') ? this.starExpr() : this.namedExpr();
        if (this.isKw('for')) {
          const gens = this.compFors();
          this.expectOp(')');
          return { k: 'comp', kind: 'gen', elt: first, gens, line };
        }
        if (this.eatOp(')')) return first;
        const items = [first];
        while (this.eatOp(',')) {
          if (this.isOp(')')) break;
          items.push(this.isOp('*') ? this.starExpr() : this.namedExpr());
        }
        this.expectOp(')');
        return { k: 'tuple', items, line };
      }
      if (t.value === '[') {
        if (this.eatOp(']')) return { k: 'list', items: [], line };
        const first = this.isOp('*') ? this.starExpr() : this.namedExpr();
        if (this.isKw('for')) {
          const gens = this.compFors();
          this.expectOp(']');
          return { k: 'comp', kind: 'list', elt: first, gens, line };
        }
        const items = [first];
        while (this.eatOp(',')) {
          if (this.isOp(']')) break;
          items.push(this.isOp('*') ? this.starExpr() : this.namedExpr());
        }
        this.expectOp(']');
        return { k: 'list', items, line };
      }
      if (t.value === '{') {
        if (this.eatOp('}')) return { k: 'dict', items: [], line };
        if (this.eatOp('**')) {
          const items: ({ key: Expr; value: Expr } | { spread: Expr })[] = [{ spread: this.bitor() }];
          return this.dictRest(items, line);
        }
        const first = this.isOp('*') ? this.starExpr() : this.expr();
        if (this.eatOp(':')) {
          const value = this.expr();
          if (this.isKw('for')) {
            const gens = this.compFors();
            this.expectOp('}');
            return { k: 'comp', kind: 'dict', elt: first, value, gens, line };
          }
          return this.dictRest([{ key: first, value }], line);
        }
        if (this.isKw('for')) {
          const gens = this.compFors();
          this.expectOp('}');
          return { k: 'comp', kind: 'set', elt: first, gens, line };
        }
        const items = [first];
        while (this.eatOp(',')) {
          if (this.isOp('}')) break;
          items.push(this.isOp('*') ? this.starExpr() : this.expr());
        }
        this.expectOp('}');
        return { k: 'set', items, line };
      }
    }
    this.i--;
    this.err();
  }
  dictRest(items: ({ key: Expr; value: Expr } | { spread: Expr })[], line: number): Expr {
    while (this.eatOp(',')) {
      if (this.isOp('}')) break;
      if (this.eatOp('**')) items.push({ spread: this.bitor() });
      else {
        const key = this.expr();
        this.expectOp(':');
        items.push({ key, value: this.expr() });
      }
    }
    this.expectOp('}');
    return { k: 'dict', items, line };
  }
}

function parseNumber(s: string, line: number): Expr {
  if (/j$/.test(s)) return { k: 'num', v: Number(s.slice(0, -1)), line, imag: true };
  if (/^0[xX]/.test(s)) return { k: 'num', v: BigInt(s), line };
  if (/^0[bB]/.test(s)) return { k: 'num', v: BigInt(s), line };
  if (/^0[oO]/.test(s)) return { k: 'num', v: BigInt(s), line };
  if (/[.eE]/.test(s)) return { k: 'num', v: Number(s), line };
  if (/^0\d/.test(s) && !/^0+$/.test(s)) throw new PySyntaxError('leading zeros in decimal integer literals are not permitted', line);
  return { k: 'num', v: BigInt(s), line };
}

function parseFString(raw: string, isRaw: boolean, line: number) {
  const parts: (string | { e: Expr; conv?: string; spec?: Expr; debug?: string })[] = [];
  let i = 0;
  let lit = '';
  while (i < raw.length) {
    const c = raw[i];
    if (c === '{' && raw[i + 1] === '{') {
      lit += '{';
      i += 2;
      continue;
    }
    if (c === '}' && raw[i + 1] === '}') {
      lit += '}';
      i += 2;
      continue;
    }
    if (c === '{') {
      if (lit) parts.push(isRaw ? lit : unescape(lit));
      lit = '';
      // find matching close, respecting nesting/strings
      let depth = 0, j = i + 1, q: string | null = null;
      let exprEnd = -1, convAt = -1, specAt = -1;
      for (; j < raw.length; j++) {
        const d = raw[j];
        if (q) {
          if (d === q) q = null;
          continue;
        }
        if (d === '"' || d === "'") q = d;
        else if (d === '(' || d === '[' || d === '{') depth++;
        else if ((d === ')' || d === ']' || d === '}') && depth > 0) depth--;
        else if (d === '}' && depth === 0) break;
        else if (depth === 0 && d === '!' && raw[j + 1] !== '=' && convAt < 0 && specAt < 0) convAt = j;
        else if (depth === 0 && d === ':' && specAt < 0) specAt = j;
      }
      if (j >= raw.length) throw new PySyntaxError("f-string: expecting '}'", line);
      exprEnd = convAt >= 0 ? convAt : specAt >= 0 ? specAt : j;
      let exprText = raw.slice(i + 1, exprEnd);
      let debug: string | undefined;
      const dm = /^(.*?)(=\s*)$/s.exec(exprText);
      if (dm && !/[=!<>]=\s*$/.test(exprText)) {
        debug = exprText;
        exprText = dm[1];
      }
      const conv = convAt >= 0 ? raw.slice(convAt + 1, specAt >= 0 ? specAt : j) : undefined;
      const specRaw = specAt >= 0 ? raw.slice(specAt + 1, j) : undefined;
      const e = parseExpression(exprText.trim(), line);
      const spec = specRaw !== undefined ? ({ k: 'fstr', parts: parseFString(specRaw, true, line), line } as Expr) : undefined;
      parts.push({ e, conv: conv?.trim(), spec, debug });
      i = j + 1;
      continue;
    }
    lit += c;
    i++;
  }
  if (lit) parts.push(isRaw ? lit : unescape(lit));
  return parts;
}

/** Does a function body contain `yield` (ignoring nested defs/classes/lambdas)? */
function containsYield(body: Stmt[]): boolean {
  const walk = (node: unknown): boolean => {
    if (!node || typeof node !== 'object') return false;
    if (Array.isArray(node)) return node.some(walk);
    const k = (node as { k?: string }).k;
    if (k === 'yield') return true;
    if (k === 'def' || k === 'class' || k === 'lambda') return false;
    return Object.values(node as object).some(walk);
  };
  return body.some(walk);
}
