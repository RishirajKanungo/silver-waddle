// Mini-markup renderer: **bold**, *italic*, `code`, [[Ctrl+Enter]] keys, "- " bullets, "1. " lists,
// "> " quotes, ```fenced code```, blank line = paragraph.

import type { ReactNode } from 'react';

function inline(text: string, kb: string): ReactNode[] {
  const out: ReactNode[] = [];
  const re = /(\*\*[^*]+\*\*|`[^`]+`|\[\[[^\]]+\]\]|\*[^*\s][^*]*\*)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const t = m[0];
    const k = `${kb}-${i++}`;
    if (t.startsWith('**')) out.push(<b key={k}>{inline(t.slice(2, -2), k)}</b>);
    else if (t.startsWith('`')) out.push(<code key={k}>{t.slice(1, -1)}</code>);
    else if (t.startsWith('[[')) out.push(<Keys key={k} k={t.slice(2, -2)} />);
    else out.push(<i key={k}>{t.slice(1, -1)}</i>);
    last = m.index + t.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

export function Keys({ k }: { k: string }) {
  const parts = k.split('+');
  return (
    <span className="keys">
      {parts.map((p, i) => (
        <span key={i}>
          {i > 0 && <span className="plus">+</span>}
          <kbd>{p}</kbd>
        </span>
      ))}
    </span>
  );
}

export function Md({ text, className }: { text: string; className?: string }) {
  const blocks: ReactNode[] = [];
  const lines = text.replace(/\r/g, '').split('\n');
  let i = 0;
  let key = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (line.startsWith('```')) {
      const lang = line.slice(3).trim();
      const buf: string[] = [];
      i++;
      while (i < lines.length && !lines[i].startsWith('```')) buf.push(lines[i++]);
      i++;
      blocks.push(
        <pre key={key++} className={'md-code lang-' + lang}>
          <code>{buf.join('\n')}</code>
        </pre>,
      );
      continue;
    }
    if (/^\s*[-•]\s/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*[-•]\s/.test(lines[i])) items.push(lines[i++].replace(/^\s*[-•]\s/, ''));
      blocks.push(
        <ul key={key++}>
          {items.map((t, j) => (
            <li key={j}>{inline(t, `${key}-${j}`)}</li>
          ))}
        </ul>,
      );
      continue;
    }
    if (/^\s*\d+[.)]\s/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*\d+[.)]\s/.test(lines[i])) items.push(lines[i++].replace(/^\s*\d+[.)]\s/, ''));
      blocks.push(
        <ol key={key++}>
          {items.map((t, j) => (
            <li key={j}>{inline(t, `${key}-${j}`)}</li>
          ))}
        </ol>,
      );
      continue;
    }
    if (line.startsWith('> ')) {
      const buf: string[] = [];
      while (i < lines.length && lines[i].startsWith('> ')) buf.push(lines[i++].slice(2));
      blocks.push(<blockquote key={key++}>{inline(buf.join(' '), String(key))}</blockquote>);
      continue;
    }
    if (line.trim() === '') {
      i++;
      continue;
    }
    const buf: string[] = [];
    while (i < lines.length && lines[i].trim() !== '' && !lines[i].startsWith('```') && !/^\s*[-•]\s/.test(lines[i]) && !/^\s*\d+[.)]\s/.test(lines[i]) && !lines[i].startsWith('> ')) buf.push(lines[i++]);
    blocks.push(<p key={key++}>{inline(buf.join(' '), String(key))}</p>);
  }
  return <div className={'md ' + (className ?? '')}>{blocks}</div>;
}
