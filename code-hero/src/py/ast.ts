// Python AST (subset). Every node carries the source line for tracing.

export type Expr =
  | { k: 'num'; v: bigint | number; line: number; imag?: boolean }
  | { k: 'str'; v: string; line: number }
  | { k: 'fstr'; parts: (string | { e: Expr; conv?: string; spec?: Expr; debug?: string })[]; line: number }
  | { k: 'const'; v: 'True' | 'False' | 'None' | 'Ellipsis'; line: number }
  | { k: 'name'; id: string; line: number }
  | { k: 'attr'; obj: Expr; name: string; line: number }
  | { k: 'sub'; obj: Expr; index: Expr; line: number }
  | { k: 'slice'; lo?: Expr; hi?: Expr; step?: Expr; line: number }
  | { k: 'call'; fn: Expr; args: Arg[]; line: number }
  | { k: 'bin'; op: string; a: Expr; b: Expr; line: number }
  | { k: 'unary'; op: string; a: Expr; line: number }
  | { k: 'bool'; op: 'and' | 'or'; vals: Expr[]; line: number }
  | { k: 'cmp'; first: Expr; ops: string[]; rest: Expr[]; line: number }
  | { k: 'ifexp'; test: Expr; body: Expr; orelse: Expr; line: number }
  | { k: 'lambda'; params: Param[]; body: Expr; line: number }
  | { k: 'tuple'; items: Expr[]; line: number }
  | { k: 'list'; items: Expr[]; line: number }
  | { k: 'set'; items: Expr[]; line: number }
  | { k: 'dict'; items: ({ key: Expr; value: Expr } | { spread: Expr })[]; line: number }
  | { k: 'comp'; kind: 'list' | 'set' | 'gen' | 'dict'; elt: Expr; value?: Expr; gens: CompFor[]; line: number }
  | { k: 'star'; v: Expr; line: number }
  | { k: 'walrus'; target: string; v: Expr; line: number }
  | { k: 'yield'; v?: Expr; from?: boolean; line: number };

export interface CompFor {
  target: Expr;
  iter: Expr;
  ifs: Expr[];
}

export type Arg = { kind: 'pos'; v: Expr } | { kind: 'kw'; name: string; v: Expr } | { kind: 'star'; v: Expr } | { kind: 'dstar'; v: Expr };

export interface Param {
  name: string;
  kind: 'normal' | 'star' | 'dstar' | 'kwonly';
  default?: Expr;
}

export type Stmt =
  | { k: 'expr'; v: Expr; line: number }
  | { k: 'assign'; targets: Expr[]; v: Expr; line: number }
  | { k: 'augassign'; target: Expr; op: string; v: Expr; line: number }
  | { k: 'annassign'; target: Expr; ann: Expr; v?: Expr; line: number }
  | { k: 'pass'; line: number }
  | { k: 'break'; line: number }
  | { k: 'continue'; line: number }
  | { k: 'return'; v?: Expr; line: number }
  | { k: 'raise'; v?: Expr; cause?: Expr; line: number }
  | { k: 'global'; names: string[]; line: number }
  | { k: 'nonlocal'; names: string[]; line: number }
  | { k: 'del'; targets: Expr[]; line: number }
  | { k: 'assert'; test: Expr; msg?: Expr; line: number }
  | { k: 'import'; names: { name: string; as?: string }[]; line: number }
  | { k: 'from'; module: string; names: { name: string; as?: string }[]; line: number }
  | { k: 'if'; test: Expr; body: Stmt[]; orelse: Stmt[]; line: number }
  | { k: 'while'; test: Expr; body: Stmt[]; orelse: Stmt[]; line: number }
  | { k: 'for'; target: Expr; iter: Expr; body: Stmt[]; orelse: Stmt[]; line: number }
  | { k: 'def'; name: string; params: Param[]; body: Stmt[]; decorators: Expr[]; line: number; endLine: number; isGen: boolean }
  | { k: 'class'; name: string; bases: Expr[]; kwargs: Arg[]; body: Stmt[]; decorators: Expr[]; line: number }
  | { k: 'try'; body: Stmt[]; handlers: { type?: Expr; name?: string; body: Stmt[]; line: number }[]; orelse: Stmt[]; final: Stmt[]; line: number }
  | { k: 'with'; items: { ctx: Expr; as?: Expr }[]; body: Stmt[]; line: number };
