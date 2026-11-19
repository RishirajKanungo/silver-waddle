// Minimal markdown + KaTeX renderer.
// Block: paragraphs, ### headings, - / 1. lists, > quotes, ``` code, | tables |, $$ display math $$.
// Inline: **bold**, *italic*, `code`, [link](https://…), $math$.
import { Fragment, memo, type ReactNode } from 'react';
import { renderTeX } from './tex';

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function inline(src: string): string {
  // protect code and math first
  const slots: string[] = [];
  const hold = (html: string) => `\u0000${slots.push(html) - 1}\u0000`;
  let s = src.replace(/\\`/g, '`');
  s = s.replace(/`([^`]+)`/g, (_, c) => hold(`<code>${esc(c)}</code>`));
  s = s.replace(/(?<![\\$])\$(?!\$)((?:\\\$|[^$\n])+?)\$/g, (_, t) => hold(renderTeX(t)));
  s = s.replace(/\\\$/g, '$');
  s = esc(s);
  s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  s = s.replace(/(^|[^*\w])\*([^*\n]+)\*(?!\*)/g, '$1<em>$2</em>');
  s = s.replace(/\[([^\]]+)\]\((https?:[^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noreferrer">$1</a>');
  // eslint-disable-next-line no-control-regex
  return s.replace(/\u0000(\d+)\u0000/g, (_, i) => slots[Number(i)]);
}

type Block =
  | { k: 'p'; text: string }
  | { k: 'h'; level: number; text: string }
  | { k: 'ul' | 'ol'; items: string[] }
  | { k: 'quote'; text: string }
  | { k: 'code'; lang: string; text: string }
  | { k: 'math'; tex: string }
  | { k: 'table'; head: string[]; rows: string[][]; align: string[] };

function blocks(src: string): Block[] {
  // in md`` (String.raw) content a backtick is written \` — treat it as a plain backtick everywhere
  const lines = src.replace(/\r/g, '').replace(/\\`/g, '`').split('\n');
  const out: Block[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    const t = line.trim();
    if (!t) {
      i++;
      continue;
    }
    if (t.startsWith('```')) {
      const lang = t.slice(3).trim();
      const body: string[] = [];
      i++;
      while (i < lines.length && !lines[i].trim().startsWith('```')) body.push(lines[i++]);
      i++;
      out.push({ k: 'code', lang, text: body.join('\n') });
      continue;
    }
    if (t.startsWith('$$')) {
      let body = t.slice(2);
      const close = body.indexOf('$$');
      if (close >= 0) {
        // $$ … $$ on one line, possibly followed by text that continues as a paragraph
        out.push({ k: 'math', tex: body.slice(0, close).trim() });
        const rest = body.slice(close + 2).trim();
        if (rest) lines[i] = rest;
        else i++;
        continue;
      }
      i++;
      while (i < lines.length && !lines[i].includes('$$')) body += '\n' + lines[i++];
      if (i < lines.length) body += '\n' + lines[i].slice(0, lines[i].indexOf('$$'));
      i++;
      out.push({ k: 'math', tex: body.trim() });
      continue;
    }
    const h = /^(#{2,4})\s+(.*)$/.exec(t);
    if (h) {
      out.push({ k: 'h', level: h[1].length, text: h[2] });
      i++;
      continue;
    }
    if (t.startsWith('|')) {
      const rows: string[][] = [];
      while (i < lines.length && lines[i].trim().startsWith('|')) {
        rows.push(lines[i].trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim()));
        i++;
      }
      const sep = rows[1]?.every((c) => /^:?-{2,}:?$/.test(c));
      const align = sep ? rows[1].map((c) => (c.endsWith(':') && c.startsWith(':') ? 'center' : c.endsWith(':') ? 'right' : 'left')) : rows[0].map(() => 'left');
      out.push({ k: 'table', head: rows[0], rows: rows.slice(sep ? 2 : 1), align });
      continue;
    }
    if (/^[-*]\s/.test(t) || /^\d+\.\s/.test(t)) {
      const ordered = /^\d+\.\s/.test(t);
      const items: string[] = [];
      while (i < lines.length) {
        const l = lines[i];
        const lt = l.trim();
        if (ordered ? /^\d+\.\s/.test(lt) : /^[-*]\s/.test(lt)) items.push(lt.replace(/^([-*]|\d+\.)\s+/, ''));
        else if (lt && /^\s{2,}/.test(l) && items.length) items[items.length - 1] += ' ' + lt;
        else break;
        i++;
      }
      out.push({ k: ordered ? 'ol' : 'ul', items });
      continue;
    }
    if (t.startsWith('>')) {
      const body: string[] = [];
      while (i < lines.length && lines[i].trim().startsWith('>')) body.push(lines[i++].trim().replace(/^>\s?/, ''));
      out.push({ k: 'quote', text: body.join(' ') });
      continue;
    }
    const para: string[] = [];
    while (i < lines.length && lines[i].trim() && !/^(```|\$\$|#{2,4}\s|\||[-*]\s|\d+\.\s|>)/.test(lines[i].trim())) para.push(lines[i++].trim());
    out.push({ k: 'p', text: para.join(' ') });
  }
  return out;
}

function Html({ tag, html, className }: { tag: string; html: string; className?: string }) {
  const T = tag as 'p';
  return <T className={className} dangerouslySetInnerHTML={{ __html: html }} />;
}

export const Md = memo(function Md({ text, className, inlineOnly }: { text: string; className?: string; inlineOnly?: boolean }) {
  if (inlineOnly) return <span className={'md-inline ' + (className ?? '')} dangerouslySetInnerHTML={{ __html: inline(text) }} />;
  const bs = blocks(text);
  const nodes: ReactNode[] = bs.map((b, i) => {
    switch (b.k) {
      case 'p':
        return <Html key={i} tag="p" html={inline(b.text)} />;
      case 'h':
        return <Html key={i} tag={'h' + b.level} html={inline(b.text)} />;
      case 'ul':
      case 'ol': {
        const L = b.k as 'ul';
        return (
          <L key={i}>
            {b.items.map((it, j) => (
              <li key={j} dangerouslySetInnerHTML={{ __html: inline(it) }} />
            ))}
          </L>
        );
      }
      case 'quote':
        return <Html key={i} tag="blockquote" html={inline(b.text)} />;
      case 'code':
        return (
          <pre key={i} className="md-code">
            <code>{b.text}</code>
          </pre>
        );
      case 'math':
        return <div key={i} className="math-display" dangerouslySetInnerHTML={{ __html: renderTeX(b.tex, true) }} />;
      case 'table':
        return (
          <div key={i} className="md-table">
            <table>
              <thead>
                <tr>
                  {b.head.map((c, j) => (
                    <th key={j} style={{ textAlign: b.align[j] as 'left' }} dangerouslySetInnerHTML={{ __html: inline(c) }} />
                  ))}
                </tr>
              </thead>
              <tbody>
                {b.rows.map((r, ri) => (
                  <tr key={ri}>
                    {r.map((c, j) => (
                      <td key={j} style={{ textAlign: b.align[j] as 'left' }} dangerouslySetInnerHTML={{ __html: inline(c) }} />
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
    }
  });
  return <div className={'md ' + (className ?? '')}>{nodes.map((n, i) => <Fragment key={i}>{n}</Fragment>)}</div>;
});

/** Inline or display TeX */
export function TeX({ children, display, className }: { children: string; display?: boolean; className?: string }) {
  return <span className={(display ? 'math-display ' : '') + (className ?? '')} dangerouslySetInnerHTML={{ __html: renderTeX(children, display) }} />;
}
