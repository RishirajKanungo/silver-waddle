// Cells specific to building a game in Godot: code listings, editor steps, build challenges.
import { useState } from 'react';
import type { Cell, Challenge, CodeLang } from '../content/types';
import { Md } from './Markup';
import { highlight } from './highlight';

const LANG_LABEL: Record<CodeLang, string> = { gdscript: 'GDScript', shader: 'Shader', tscn: 'Scene file', cfg: 'Config', text: 'Text' };

async function copy(text: string, el: HTMLElement | null) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // fall back to selecting the code so the reader can press Ctrl/⌘+C
    if (el) {
      const r = document.createRange();
      r.selectNodeContents(el);
      const sel = window.getSelection();
      sel?.removeAllRanges();
      sel?.addRange(r);
    }
    return false;
  }
}

export function CodeBlock({ code, file, lang = 'gdscript', note, compact }: { code: string; file?: string; lang?: CodeLang; note?: string; compact?: boolean }) {
  const [copied, setCopied] = useState<'' | 'ok' | 'sel'>('');
  const [pre, setPre] = useState<HTMLElement | null>(null);
  const lines = code.replace(/\n$/, '').split('\n');
  return (
    <div className={'codeblock' + (compact ? ' compact' : '')}>
      <div className="cb-head">
        <span className="cb-file">{file ?? LANG_LABEL[lang]}</span>
        {file && <span className="cb-lang">{LANG_LABEL[lang]}</span>}
        <span className="grow" />
        <button
          className="cb-copy"
          onClick={async () => {
            const ok = await copy(code, pre);
            setCopied(ok ? 'ok' : 'sel');
            setTimeout(() => setCopied(''), 1800);
          }}
        >
          {copied === 'ok' ? 'Copied' : copied === 'sel' ? 'Selected: press Ctrl/⌘+C' : 'Copy'}
        </button>
      </div>
      <div className="cb-body">
        <div className="cb-gutter" aria-hidden="true">
          {lines.map((_, i) => (
            <span key={i}>{i + 1}</span>
          ))}
        </div>
        <pre ref={setPre} className="cb-code">
          <code dangerouslySetInnerHTML={{ __html: highlight(code.replace(/\n$/, ''), lang) }} />
        </pre>
      </div>
      {note && <Md text={note} className="code-note" />}
    </div>
  );
}

export function StepsBox({ cell, onDone, prior }: { cell: Extract<Cell, { kind: 'steps' }>; onDone: () => void; prior?: boolean }) {
  const [checked, setChecked] = useState<boolean[]>(cell.steps.map(() => !!prior));
  const [done, setDone] = useState(!!prior);
  const [trouble, setTrouble] = useState(false);
  const all = checked.every(Boolean);
  return (
    <div className="steps">
      <div className="cell-k">In Godot · {cell.title}</div>
      <ol className="steps-list">
        {cell.steps.map((s, i) => (
          <li key={i} className={checked[i] ? 'on' : ''}>
            <label>
              <input type="checkbox" checked={checked[i]} onChange={() => setChecked(checked.map((c, j) => (j === i ? !c : c)))} aria-label={`step ${i + 1} done`} />
              <Md text={s} />
            </label>
          </li>
        ))}
      </ol>
      <div className="steps-result">
        <span className="steps-result-k">You should see</span>
        <Md text={cell.result} />
      </div>
      {!done ? (
        <div className="row">
          <button
            className="primary"
            disabled={!all}
            onClick={() => {
              setDone(true);
              onDone();
            }}
          >
            It works
          </button>
          {cell.troubleshoot && cell.troubleshoot.length > 0 && <button onClick={() => setTrouble(!trouble)}>{trouble ? 'Hide troubleshooting' : 'It does not work'}</button>}
          {!all && <span className="muted small">Tick each step as you do it.</span>}
        </div>
      ) : (
        <div className="muted small">Done.</div>
      )}
      {trouble && cell.troubleshoot && (
        <div className="troubleshoot">
          {cell.troubleshoot.map((t, i) => (
            <div key={i} className="ts-item">
              <Md text={t.problem} className="ts-p" />
              <Md text={t.fix} className="ts-f" />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function BuildBox({ ch, onDone, prior }: { ch: Challenge; onDone: () => void; prior?: boolean }) {
  const [met, setMet] = useState<boolean[]>(ch.requirements.map(() => !!prior));
  const [hints, setHints] = useState(0);
  const [showSol, setShowSol] = useState(false);
  const [graded, setGraded] = useState<string | null>(prior ? 'works' : null);
  return (
    <div className={'build' + (graded === 'works' ? ' passed' : '')}>
      <div className="cell-k">Build · {ch.title}</div>
      <Md text={ch.goal} className="cp-q" />
      <div className="build-req">
        <div className="build-req-k">Done when your game does this</div>
        {ch.requirements.map((r, i) => (
          <label key={i} className={'req' + (met[i] ? ' on' : '')}>
            <input type="checkbox" checked={met[i]} onChange={() => setMet(met.map((m, j) => (j === i ? !m : m)))} />
            <Md text={r} inlineOnly />
          </label>
        ))}
      </div>
      <div className="row">
        {hints < ch.hints.length && <button onClick={() => setHints(hints + 1)}>Hint {hints + 1} of {ch.hints.length}</button>}
        <button onClick={() => setShowSol(!showSol)}>{showSol ? 'Hide reference solution' : 'Reference solution'}</button>
      </div>
      {ch.hints.slice(0, hints).map((h, i) => (
        <div key={i} className="hint">
          <span className="hint-k">Hint {i + 1}</span>
          <Md text={h} />
        </div>
      ))}
      {showSol && (
        <div className="solution">
          {ch.solution.map((f) => (
            <CodeBlock key={f.file} code={f.code} file={f.file} lang={f.lang ?? 'gdscript'} compact />
          ))}
          {ch.explain && <Md text={ch.explain} className="sol-explain" />}
        </div>
      )}
      <div className="self-grade">
        <span>Result in your project:</span>
        {(['works', 'partly', 'stuck'] as const).map((g) => (
          <button
            key={g}
            className={graded === g ? 'on' : ''}
            disabled={g === 'works' && !met.every(Boolean)}
            onClick={() => {
              setGraded(g);
              onDone();
              if (g !== 'works') setShowSol(true);
            }}
          >
            {g === 'works' ? 'All criteria met' : g === 'partly' ? 'Partly working' : 'Stuck'}
          </button>
        ))}
      </div>
    </div>
  );
}
