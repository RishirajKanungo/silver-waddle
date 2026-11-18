// Python's format-spec mini-language: [[fill]align][sign][#][0][width][,|_][.precision][type]

import type { Interp, G } from './interp';
import { PyDict, PyTuple, PyVal, floatRepr, isNum, toBig, toNum, typeNameOf } from './values';

export function formatSpec(v: PyVal, spec: string, I: Interp): string {
  const m = /^(?:(.)?([<>=^]))?([+\- ])?(#)?(0)?(\d+)?([,_])?(?:\.(\d+))?([bcdeEfFgGnosxX%])?$/s.exec(spec);
  if (!m) I.raise('ValueError', `Invalid format specifier '${spec}' for object of type '${typeNameOf(v)}'`);
  let [, fill, align, sign, alt, zero, widthS, group, precS, type] = m;
  const width = widthS ? Number(widthS) : 0;
  const prec = precS !== undefined ? Number(precS) : undefined;
  if (zero && !align) {
    fill = '0';
    align = '=';
  }
  fill = fill ?? ' ';
  let body: string;
  let neg = false;
  if (typeof v === 'string') {
    if (type && type !== 's') I.raise('ValueError', `Unknown format code '${type}' for object of type 'str'`);
    body = prec !== undefined ? v.slice(0, prec) : v;
    align = align ?? '<';
  } else if (isNum(v)) {
    const isIntVal = typeof v === 'bigint' || typeof v === 'boolean';
    if (!type) type = isIntVal ? 'd' : prec !== undefined ? 'g' : '';
    if (isIntVal && 'eEfFgG%'.includes(type)) v = toNum(v);
    if (typeof v === 'number' && 'dbcoxX'.includes(type)) I.raise('ValueError', `Unknown format code '${type}' for object of type 'float'`);
    align = align ?? '>';
    if (typeof v === 'bigint' || typeof v === 'boolean') {
      let n = toBig(v);
      neg = n < 0n;
      if (neg) n = -n;
      switch (type) {
        case 'b': body = n.toString(2); if (alt) body = '0b' + body; break;
        case 'o': body = n.toString(8); if (alt) body = '0o' + body; break;
        case 'x': body = n.toString(16); if (alt) body = '0x' + body; break;
        case 'X': body = n.toString(16).toUpperCase(); if (alt) body = '0X' + body; break;
        case 'c': body = String.fromCodePoint(Number(n)); break;
        default: body = n.toString();
      }
      if (group && 'dn'.includes(type)) body = body.replace(/\B(?=(\d{3})+(?!\d))/g, group);
    } else {
      let x = v as number;
      neg = x < 0 || Object.is(x, -0);
      x = Math.abs(x);
      const p = prec ?? 6;
      if (!isFinite(x)) body = isNaN(x) ? 'nan' : 'inf';
      else if (type === 'f' || type === 'F') body = toFixedExact(x, p);
      else if (type === '%') body = toFixedExact(x * 100, p) + '%';
      else if (type === 'e' || type === 'E') {
        body = x.toExponential(p).replace(/e([+-])(\d)$/, 'e$10$2');
        if (type === 'E') body = body.toUpperCase();
      } else if (type === 'g' || type === 'G') {
        const P = p === 0 ? 1 : p;
        const exp = x === 0 ? 0 : Math.floor(Math.log10(x));
        if (exp >= -4 && exp < P) {
          body = Number(x.toPrecision(P)).toString();
          if (body.includes('e')) body = x.toFixed(Math.max(0, P - 1 - exp));
          if (alt) body = x.toPrecision(P);
        } else body = x.toExponential(P - 1).replace(/\.?0+e/, 'e').replace(/e([+-])(\d)$/, 'e$10$2');
        if (type === 'G') body = body.toUpperCase();
      } else body = floatRepr(x);
      if (group) {
        const [ip, dp] = body.split('.');
        body = ip.replace(/\B(?=(\d{3})+(?!\d))/g, group) + (dp !== undefined ? '.' + dp : '');
      }
    }
  } else {
    body = I.runSync(I.str(v));
    align = align ?? '<';
  }
  const signStr = neg ? '-' : sign === '+' ? '+' : sign === ' ' ? ' ' : '';
  let s = signStr + body;
  if (s.length < width) {
    const pad = width - s.length;
    if (align === '<') s = s + fill.repeat(pad);
    else if (align === '>') s = fill.repeat(pad) + s;
    else if (align === '^') s = fill.repeat(Math.floor(pad / 2)) + s + fill.repeat(Math.ceil(pad / 2));
    else if (align === '=') s = signStr + fill.repeat(pad) + body;
  }
  return s;
}

/** toFixed that rounds half-to-even on the exact binary value like CPython. */
function toFixedExact(x: number, p: number): string {
  return x.toFixed(Math.min(100, p));
}

export function* percentFormat(I: Interp, fmt: string, arg: PyVal): G<string> {
  const args = arg instanceof PyTuple ? [...arg.items] : [arg];
  const isMap = arg instanceof PyDict;
  let i = 0;
  let out = '';
  const re = /%(\(([^)]*)\))?([-+ 0#]*)(\d+|\*)?(?:\.(\d+))?([sdifrxXoeEgGc%])/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(fmt))) {
    out += fmt.slice(last, m.index);
    last = m.index + m[0].length;
    const [, , key, flags, width, prec, conv] = m;
    if (conv === '%') {
      out += '%';
      continue;
    }
    let v: PyVal;
    if (key !== undefined && isMap) v = (arg as PyDict).get(key) ?? null;
    else {
      if (i >= args.length) I.raise('TypeError', 'not enough arguments for format string');
      v = args[i++];
    }
    let s: string;
    if (conv === 's') s = yield* I.str(v);
    else if (conv === 'r') s = yield* I.repr(v);
    else if ('di'.includes(conv)) {
      if (!isNum(v)) I.raise('TypeError', `%${conv} format: a real number is required, not ${typeNameOf(v)}`);
      s = (typeof v === 'number' ? BigInt(Math.trunc(v)) : toBig(v as bigint)).toString();
    } else if (conv === 'c') s = typeof v === 'string' ? v : String.fromCodePoint(Number(toBig(v as bigint)));
    else s = formatSpec(v, `${prec !== undefined ? '.' + prec : ''}${conv}`, I);
    if (flags.includes('+') && isNum(v) && !s.startsWith('-')) s = '+' + s;
    const w = width ? Number(width) : 0;
    if (s.length < w) s = flags.includes('-') ? s.padEnd(w) : flags.includes('0') && isNum(v) ? (s.startsWith('-') ? '-' + s.slice(1).padStart(w - 1, '0') : s.padStart(w, '0')) : s.padStart(w);
    out += s;
  }
  if (!isMap && i < args.length && !(arg instanceof PyTuple && args.length === 0)) I.raise('TypeError', 'not all arguments converted during string formatting');
  return out + fmt.slice(last);
}
