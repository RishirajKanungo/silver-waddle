import katex from 'katex';

// One notation for the whole workbook.
export const MACROS: Record<string, string> = {
  '\\R': '\\mathbb{R}',
  '\\N': '\\mathbb{N}',
  '\\E': '\\mathbb{E}',
  '\\P': '\\mathbb{P}',
  '\\Var': '\\operatorname{Var}',
  '\\Cov': '\\operatorname{Cov}',
  '\\argmin': '\\operatorname*{arg\\,min}',
  '\\argmax': '\\operatorname*{arg\\,max}',
  '\\tr': '\\operatorname{tr}',
  '\\rank': '\\operatorname{rank}',
  '\\Col': '\\operatorname{Col}',
  '\\Row': '\\operatorname{Row}',
  '\\Null': '\\operatorname{Null}',
  '\\Span': '\\operatorname{span}',
  '\\diag': '\\operatorname{diag}',
  '\\sign': '\\operatorname{sign}',
  '\\softmax': '\\operatorname{softmax}',
  '\\sigmoid': '\\sigma',
  '\\relu': '\\operatorname{ReLU}',
  '\\KL': 'D_{\\mathrm{KL}}',
  '\\bx': '\\mathbf{x}',
  '\\by': '\\mathbf{y}',
  '\\bz': '\\mathbf{z}',
  '\\bw': '\\mathbf{w}',
  '\\bb': '\\mathbf{b}',
  '\\bu': '\\mathbf{u}',
  '\\bv': '\\mathbf{v}',
  '\\ba': '\\mathbf{a}',
  '\\be': '\\mathbf{e}',
  '\\bq': '\\mathbf{q}',
  '\\bk': '\\mathbf{k}',
  '\\bh': '\\mathbf{h}',
  '\\bp': '\\mathbf{p}',
  '\\bs': '\\mathbf{s}',
  '\\bzero': '\\mathbf{0}',
  '\\btheta': '\\boldsymbol{\\theta}',
  '\\bmu': '\\boldsymbol{\\mu}',
  '\\bSigma': '\\boldsymbol{\\Sigma}',
  '\\T': '^{\\top}',
  '\\norm': '\\left\\lVert #1 \\right\\rVert',
  '\\abs': '\\left\\lvert #1 \\right\\rvert',
  '\\inner': '\\langle #1, #2 \\rangle',
  '\\pd': '\\frac{\\partial #1}{\\partial #2}',
  '\\ihat': '\\hat{\\imath}',
  '\\jhat': '\\hat{\\jmath}',
};

// \ba … \bz → bold vectors (skipping \bf and \bm, which KaTeX already defines)
for (const c of 'abcdeghijklnopqrstuvwxyz') if (!(`\\b${c}` in MACROS)) MACROS[`\\b${c}`] = `\\mathbf{${c}}`;

const cache = new Map<string, string>();

export function renderTeX(src: string, display = false): string {
  const key = (display ? 'D' : 'I') + src;
  const hit = cache.get(key);
  if (hit !== undefined) return hit;
  let html: string;
  try {
    html = katex.renderToString(src, { displayMode: display, throwOnError: true, macros: { ...MACROS }, strict: 'ignore', trust: false, output: 'html' });
  } catch (e) {
    html = `<span class="tex-error" title="${String((e as Error).message).replace(/"/g, '&quot;')}">${src.replace(/</g, '&lt;')}</span>`;
  }
  cache.set(key, html);
  return html;
}

/** Throws on invalid TeX (used by the content validator). */
export function assertTeX(src: string, display = false) {
  katex.renderToString(src, { displayMode: display, throwOnError: true, macros: { ...MACROS }, strict: 'ignore' });
}

/** Every $…$ and $$…$$ span in a markdown string (for validation). */
export function mathSpans(md: string): { tex: string; display: boolean }[] {
  const out: { tex: string; display: boolean }[] = [];
  const s = md.replace(/```[\s\S]*?```/g, '').replace(/`[^`\n]*`/g, '');
  const re = /\$\$([\s\S]+?)\$\$|(?<![\\$])\$(?!\$)((?:\\\$|[^$\n])+?)\$/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(s))) out.push(m[1] !== undefined ? { tex: m[1], display: true } : { tex: m[2], display: false });
  return out;
}
