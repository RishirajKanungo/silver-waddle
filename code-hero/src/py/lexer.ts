// Python tokenizer: produces INDENT/DEDENT/NEWLINE like CPython's tokenizer,
// joins lines inside brackets, and keeps line numbers for tracing.

export type TokKind = 'name' | 'num' | 'str' | 'op' | 'newline' | 'indent' | 'dedent' | 'eof';

export interface Tok {
  kind: TokKind;
  value: string;
  line: number;
  col: number;
  /** for strings: prefix letters (f, r, b) */
  prefix?: string;
}

export class PySyntaxError extends Error {
  constructor(msg: string, public line: number) {
    super(msg);
  }
}

const OPS = [
  '**=', '//=', '>>=', '<<=', '...', '->', ':=',
  '+=', '-=', '*=', '/=', '%=', '&=', '|=', '^=', '@=', '==', '!=', '<=', '>=', '**', '//', '<<', '>>',
  '+', '-', '*', '/', '%', '&', '|', '^', '~', '<', '>', '(', ')', '[', ']', '{', '}', ',', ':', '.', ';', '@', '=',
];

export function tokenize(src: string): Tok[] {
  const toks: Tok[] = [];
  const lines = src.replace(/\r\n?/g, '\n').split('\n');
  const indents = [0];
  let depth = 0; // bracket depth
  let i = 0; // line index
  let contString: { quote: string; prefix: string; buf: string; line: number; col: number } | null = null;
  let backslashCont = false;

  for (i = 0; i < lines.length; i++) {
    const line = lines[i];
    const ln = i + 1;
    let p = 0;
    if (contString) {
      // inside a triple-quoted string spanning lines
      const end = line.indexOf(contString.quote);
      if (end < 0) {
        contString.buf += line + '\n';
        continue;
      }
      contString.buf += line.slice(0, end);
      toks.push({ kind: 'str', value: contString.buf, line: contString.line, col: contString.col, prefix: contString.prefix });
      p = end + 3;
      contString = null;
    } else if (depth === 0 && !backslashCont) {
      // indentation
      let w = 0;
      while (p < line.length && (line[p] === ' ' || line[p] === '\t')) {
        w += line[p] === '\t' ? 8 - (w % 8) : 1;
        p++;
      }
      const rest = line.slice(p);
      if (rest === '' || rest.startsWith('#')) continue; // blank / comment line
      if (w > indents[indents.length - 1]) {
        indents.push(w);
        toks.push({ kind: 'indent', value: '', line: ln, col: 0 });
      } else {
        while (w < indents[indents.length - 1]) {
          indents.pop();
          toks.push({ kind: 'dedent', value: '', line: ln, col: 0 });
        }
        if (w !== indents[indents.length - 1]) throw new PySyntaxError('unindent does not match any outer indentation level', ln);
      }
    }
    backslashCont = false;
    while (p < line.length) {
      const ch = line[p];
      if (ch === ' ' || ch === '\t') {
        p++;
        continue;
      }
      if (ch === '#') break;
      if (ch === '\\' && p === line.length - 1) {
        backslashCont = true;
        p++;
        break;
      }
      // strings (with optional prefix)
      const sm = /^([rRbBfFuU]{0,2})('''|"""|'|")/.exec(line.slice(p));
      if (sm && (sm[1] === '' || /^[rbfu]{1,2}$/i.test(sm[1]))) {
        const prefix = sm[1].toLowerCase();
        const q = sm[2];
        const start = p;
        p += sm[0].length;
        const raw = prefix.includes('r');
        if (q.length === 3) {
          const end = line.indexOf(q, p);
          if (end < 0) {
            contString = { quote: q, prefix, buf: line.slice(p) + '\n', line: ln, col: start };
            p = line.length;
            break;
          }
          toks.push({ kind: 'str', value: line.slice(p, end), line: ln, col: start, prefix });
          p = end + 3;
        } else {
          let buf = '';
          let closed = false;
          while (p < line.length) {
            const c = line[p];
            if (c === '\\' && p + 1 < line.length) {
              buf += c + line[p + 1];
              p += 2;
              continue;
            }
            if (c === q) {
              closed = true;
              p++;
              break;
            }
            buf += c;
            p++;
          }
          if (!closed) throw new PySyntaxError('unterminated string literal', ln);
          toks.push({ kind: 'str', value: buf, line: ln, col: start, prefix: raw ? prefix : prefix });
        }
        continue;
      }
      const nm = /^[A-Za-z_À-￿][A-Za-z0-9_À-￿]*/.exec(line.slice(p));
      if (nm) {
        toks.push({ kind: 'name', value: nm[0], line: ln, col: p });
        p += nm[0].length;
        continue;
      }
      const num = /^(0[xX][0-9a-fA-F_]+|0[bB][01_]+|0[oO][0-7_]+|(\d[\d_]*\.?[\d_]*|\.\d[\d_]*)([eE][+-]?\d+)?j?)/.exec(line.slice(p));
      if (num && /[\d.]/.test(ch) && !(ch === '.' && !/\d/.test(line[p + 1] ?? ''))) {
        toks.push({ kind: 'num', value: num[0].replace(/_/g, ''), line: ln, col: p });
        p += num[0].length;
        continue;
      }
      const op = OPS.find((o) => line.startsWith(o, p));
      if (op) {
        if ('([{'.includes(op)) depth++;
        if (')]}'.includes(op)) depth = Math.max(0, depth - 1);
        toks.push({ kind: 'op', value: op, line: ln, col: p });
        p += op.length;
        continue;
      }
      throw new PySyntaxError(`invalid character '${ch}'`, ln);
    }
    if (depth === 0 && !backslashCont && !contString) {
      const last = toks[toks.length - 1];
      if (last && last.kind !== 'newline' && last.kind !== 'indent' && last.kind !== 'dedent') toks.push({ kind: 'newline', value: '', line: ln, col: line.length });
    }
  }
  if (contString) throw new PySyntaxError('unterminated triple-quoted string literal', contString.line);
  const lastLine = lines.length;
  const last = toks[toks.length - 1];
  if (last && last.kind !== 'newline' && last.kind !== 'dedent') toks.push({ kind: 'newline', value: '', line: lastLine, col: 0 });
  while (indents.length > 1) {
    indents.pop();
    toks.push({ kind: 'dedent', value: '', line: lastLine, col: 0 });
  }
  toks.push({ kind: 'eof', value: '', line: lastLine, col: 0 });
  return toks;
}

/** Decode escape sequences in a (non-raw) string literal body. */
export function unescape(s: string): string {
  return s.replace(/\\(x[0-9a-fA-F]{2}|u[0-9a-fA-F]{4}|N\{[^}]*\}|[0-7]{1,3}|.|\n)/g, (_, e: string) => {
    switch (e[0]) {
      case 'n': return '\n';
      case 't': return '\t';
      case 'r': return '\r';
      case '\\': return '\\';
      case "'": return "'";
      case '"': return '"';
      case '0': if (e.length === 1) return '\0'; break;
      case 'a': return '\x07';
      case 'b': return '\b';
      case 'f': return '\f';
      case 'v': return '\v';
      case '\n': return '';
      case 'x': return String.fromCharCode(parseInt(e.slice(1), 16));
      case 'u': return String.fromCharCode(parseInt(e.slice(1), 16));
    }
    if (/^[0-7]+$/.test(e)) return String.fromCharCode(parseInt(e, 8));
    return '\\' + e;
  });
}
