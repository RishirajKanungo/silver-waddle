// Tiny renderer for lesson text: **bold**, `code`, [[Ctrl+D]] key caps, "- " bullets, blank-line paragraphs.

import type { ReactNode } from 'react';

export function Keys({ k }: { k: string }) {
  // "Ctrl+Shift+↓" -> keycaps; "Alt H V V" -> sequence
  const seq = k.includes(' ') && !k.includes('+') ? k.split(' ') : null;
  if (seq)
    return (
      <span className="keys">
        {seq.map((x, i) => (
          <kbd key={i}>{x}</kbd>
        ))}
      </span>
    );
  const parts = k === '+' ? ['+'] : k.split(/\+(?!$)/);
  return (
    <span className="keys">
      {parts.map((x, i) => (
        <span key={i}>
          {i > 0 && <span className="plus">+</span>}
          <kbd>{x}</kbd>
        </span>
      ))}
    </span>
  );
}

function inline(text: string, keyBase: string): ReactNode[] {
  const out: ReactNode[] = [];
  const re = /(\*\*[^*]+\*\*|`[^`]+`|\[\[[^\]]+\]\])/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const t = m[0];
    const k = `${keyBase}-${i++}`;
    if (t.startsWith('**')) out.push(<b key={k}>{t.slice(2, -2)}</b>);
    else if (t.startsWith('`')) out.push(<code key={k}>{t.slice(1, -1)}</code>);
    else out.push(<Keys key={k} k={t.slice(2, -2)} />);
    last = m.index + t.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

export function Markup({ text }: { text: string }) {
  const blocks = text.trim().split(/\n\s*\n/);
  return (
    <div className="markup">
      {blocks.map((b, bi) => {
        const lines = b.split('\n');
        if (lines.every((l) => /^\s*[-•]\s/.test(l))) {
          return (
            <ul key={bi}>
              {lines.map((l, li) => (
                <li key={li}>{inline(l.replace(/^\s*[-•]\s/, ''), `${bi}-${li}`)}</li>
              ))}
            </ul>
          );
        }
        // mixed: paragraph lines then bullets
        const paras: ReactNode[] = [];
        let bullets: string[] = [];
        const flush = (key: string) => {
          if (bullets.length) {
            paras.push(
              <ul key={key}>
                {bullets.map((l, li) => (
                  <li key={li}>{inline(l, `${key}-${li}`)}</li>
                ))}
              </ul>,
            );
            bullets = [];
          }
        };
        lines.forEach((l, li) => {
          if (/^\s*[-•]\s/.test(l)) bullets.push(l.replace(/^\s*[-•]\s/, ''));
          else {
            flush(`${bi}-u${li}`);
            paras.push(<p key={`${bi}-${li}`}>{inline(l, `${bi}-${li}`)}</p>);
          }
        });
        flush(`${bi}-end`);
        return <div key={bi}>{paras}</div>;
      })}
    </div>
  );
}
