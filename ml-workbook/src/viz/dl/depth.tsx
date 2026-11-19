import { useMemo, useState } from 'react';
import type { VizSpec } from '../../content/types';
import { LinePlot, Slider, Readout, FigureLayout, SegControl, Toggle, TeX } from '../kit';
import { fmt, sigTeX, tv } from './util';
import { DACT, simulate, type DAct } from './deepsim';
import './dl.css';

const L10 = (v: number) => (v > 0 && Number.isFinite(v) ? Math.log10(v) : v === 0 ? -40 : 40);

// ------------------------------------------------------------------ dl.sigmoidchain

/**
 * dl.sigmoidchain — a chain of L scalar units h_l = φ(w h_{l-1} + b). The gradient ∂h_L/∂h_l is the product of
 * the local factors w·φ′(z_k) above layer l. Plotted as log10 |∂h_L/∂h_l| against l.
 * params: L, w, b, act ('sigmoid'|'tanh'|'relu'), x0
 */
function SigmoidChain({ spec }: { spec: VizSpec }) {
  const [L, setL] = useState((spec.L as number) ?? 10);
  const [w, setW] = useState((spec.w as number) ?? 1);
  const [b, setB] = useState((spec.b as number) ?? 0);
  const [act, setAct] = useState<DAct>((spec.act as DAct) ?? 'sigmoid');
  const x0 = (spec.x0 as number) ?? 0.5;
  const F = DACT[act];
  const { factors, grads, zs } = useMemo(() => {
    const zs: number[] = [];
    let h = x0;
    for (let l = 1; l <= L; l++) {
      const z = w * h + b;
      zs.push(z);
      h = F.f(z);
    }
    const factors = zs.map((z) => w * F.d(z));
    const grads = Array(L + 1).fill(1);
    for (let l = L - 1; l >= 0; l--) grads[l] = grads[l + 1] * factors[l];
    return { factors, grads, zs };
  }, [L, w, b, F, x0]);
  const series = grads.map((g, l) => [l, L10(Math.abs(g))] as [number, number]);
  const lo = Math.min(-1, ...series.map((p) => p[1]));
  const hi = Math.max(1, ...series.map((p) => p[1]));
  const bound = act === 'sigmoid' ? (Math.abs(w) / 4) ** L : NaN;
  return (
    <FigureLayout
      side={
        <>
          <SegControl value={act} onChange={setAct} options={[{ v: 'sigmoid', label: 'sigmoid' }, { v: 'tanh', label: 'tanh' }, { v: 'relu', label: 'ReLU' }]} />
          <Slider label="depth L" value={L} min={1} max={30} step={1} onChange={setL} fmt={(v) => String(v)} />
          <Slider tex="w" value={w} min={-6} max={6} step={0.1} onChange={setW} />
          <Slider tex="b" value={b} min={-3} max={3} step={0.1} onChange={setB} />
          <Readout
            rows={[
              ["\\text{factor at top } w\\,\\varphi'(z_L)", fmt(factors[L - 1], 4)],
              ['\\pd{h_L}{h_0} = \\prod_l w\\,\\varphi\'(z_l)', tv(sigTeX(grads[0], 3))],
              ...(act === 'sigmoid' ? ([['\\text{bound } (|w|/4)^L', tv(sigTeX(bound, 3))]] as [string, string][]) : []),
              ['z_1,\\ z_L', `${fmt(zs[0], 2)}, ${fmt(zs[L - 1], 2)}`],
            ]}
          />
          <div className="small">
            {act === 'sigmoid' && <>Since <TeX>{"\\sigma'\\le 1/4"}</TeX>, each layer multiplies the gradient by at most <TeX>{'|w|/4'}</TeX>. With <TeX>{'|w| < 4'}</TeX> the product shrinks geometrically.</>}
            {act === 'tanh' && <><TeX>{"\\tanh'(0) = 1"}</TeX>, so near zero the factor is about <TeX>{'w'}</TeX>; large <TeX>{'|w|'}</TeX> pushes <TeX>{'z'}</TeX> into saturation where the factor collapses.</>}
            {act === 'relu' && <>For an active unit the factor is exactly <TeX>{'w'}</TeX>: the product is <TeX>{'w^{L}'}</TeX>, which explodes for <TeX>{'|w|>1'}</TeX>, vanishes for <TeX>{'|w|<1'}</TeX>, and is 0 once a unit is off.</>}
          </div>
        </>
      }
    >
      <LinePlot
        series={[{ pts: series, color: 'var(--c-err)' }, { pts: series, color: 'var(--c-err)', scatter: true }]}
        x={[0, L]}
        y={[Math.floor(lo), Math.ceil(hi)]}
        height={290}
        xlabel="layer l  (input = 0, output = L)"
        ylabel="log₁₀ |∂h_L / ∂h_l|"
        hlines={[{ y: 0, color: 'var(--muted)' }]}
      />
    </FigureLayout>
  );
}

// ------------------------------------------------------------------ dl.depthsignal

type Init = 'small' | 'lecun' | 'xavier' | 'he';
const WIDTH = 100;
const INITS: Record<Init, { std: (n: number) => number; label: string; tex: string }> = {
  small: { std: () => 0.01, label: 'σ=0.01', tex: '\\sigma_w = 0.01' },
  lecun: { std: (n) => Math.sqrt(1 / n), label: 'LeCun', tex: '\\Var(W) = 1/n_{\\text{in}}' },
  xavier: { std: (n) => Math.sqrt(2 / (n + n)), label: 'Xavier', tex: '\\Var(W) = 2/(n_{\\text{in}}+n_{\\text{out}})' },
  he: { std: (n) => Math.sqrt(2 / n), label: 'He', tex: '\\Var(W) = 2/n_{\\text{in}}' },
};

/**
 * dl.depthsignal — a random deep MLP (width 100, batch 32) at initialization. Top: RMS of the activations per layer.
 * Bottom: RMS of ∂L/∂h_l per layer, relative to the top layer. Both on a log10 scale.
 * params: act ('linear'|'relu'|'tanh'|'sigmoid'), init ('small'|'lecun'|'xavier'|'he'), depth, gain, residual (bool: compare with residual blocks)
 */
function DepthSignal({ spec }: { spec: VizSpec }) {
  const [act, setAct] = useState<DAct>((spec.act as DAct) ?? 'relu');
  const [init, setInit] = useState<Init>((spec.init as Init) ?? 'he');
  const [depth, setDepth] = useState((spec.depth as number) ?? 20);
  const [gain, setGain] = useState((spec.gain as number) ?? 1);
  const compare = !!spec.residual;
  const [res, setRes] = useState(compare);
  const std = INITS[init].std(WIDTH) * gain;
  const plain = useMemo(() => simulate({ depth, width: WIDTH, batch: 32, act, std, seed: 12 }), [depth, act, std]);
  const resid = useMemo(() => (res ? simulate({ depth, width: WIDTH, batch: 32, act, std, seed: 12, residual: true }) : null), [depth, act, std, res]);
  const ser = (a: number[]) => a.map((v, l) => [l, Math.max(-40, Math.min(40, L10(v)))] as [number, number]);
  const range = (arrs: number[][]) => {
    const all = arrs.flat().map((v) => Math.max(-40, Math.min(40, L10(v))));
    const lo = Math.floor(Math.min(-1, ...all)), hi = Math.ceil(Math.max(1, ...all));
    return [lo, hi + (hi - lo) * 0.25] as [number, number];
  };
  const aR = range([plain.act, ...(resid ? [resid.act] : [])]);
  const gR = range([plain.grad, ...(resid ? [resid.grad] : [])]);
  return (
    <FigureLayout
      side={
        <>
          <SegControl value={act} onChange={setAct} options={[{ v: 'linear', label: 'linear' }, { v: 'tanh', label: 'tanh' }, { v: 'sigmoid', label: 'sigmoid' }, { v: 'relu', label: 'ReLU' }]} />
          <SegControl value={init} onChange={setInit} options={(Object.keys(INITS) as Init[]).map((k) => ({ v: k, label: INITS[k].label }))} />
          <Slider label="depth" value={depth} min={2} max={40} step={1} onChange={setDepth} fmt={(v) => String(v)} />
          <Slider label="gain × std" value={gain} min={0.25} max={3} step={0.05} onChange={setGain} />
          {compare && <Toggle label="also show residual blocks" value={res} onChange={setRes} />}
          <Readout
            rows={[
              [INITS[init].tex, ''],
              ['\\sigma_w', fmt(std, 4)],
              ['\\text{RMS}(\\bh_L)', tv(sigTeX(plain.act[depth], 2))],
              ['\\text{grad at layer 0 / top}', tv(sigTeX(plain.grad[0], 2))],
              ...(resid ? ([['\\text{residual: grad 0 / top}', tv(sigTeX(resid.grad[0], 2))]] as [string, string][]) : []),
            ]}
          />
          <div className="muted small">One random network of width {WIDTH}. At finite width the curves wander by a factor of about 2 even when the variance is preserved on average.</div>
        </>
      }
    >
      <div className="dl-stack">
      <LinePlot
        series={[{ pts: ser(plain.act), color: 'var(--c-u)', label: resid ? 'plain' : 'activation RMS' }, ...(resid ? [{ pts: ser(resid.act), color: 'var(--c-w)', label: 'residual h + φ(Wh)' }] : [])]}
        x={[0, depth]}
        y={aR}
        height={190}
        xlabel="layer l (forward)"
        ylabel="log₁₀ activation RMS"
        hlines={[{ y: 0, color: 'var(--muted)' }]}
      />
          <LinePlot
            series={[{ pts: ser(plain.grad), color: 'var(--c-err)', label: resid ? 'plain' : 'gradient RMS, relative to the top layer' }, ...(resid ? [{ pts: ser(resid.grad), color: 'var(--c-w)', label: 'residual h + φ(Wh)' }] : [])]}
            x={[0, depth]}
            y={gR}
            height={190}
            xlabel="layer l (backward: from the top down)"
            ylabel="log₁₀ grad RMS"
            hlines={[{ y: 0, color: 'var(--muted)' }]}
          />
      </div>
    </FigureLayout>
  );
}

export const depthViz = {
  'dl.sigmoidchain': {
    component: SigmoidChain,
    validate: (s: VizSpec) => (s.act === undefined || ['sigmoid', 'tanh', 'relu'].includes(s.act as string) ? null : 'act must be sigmoid|tanh|relu'),
    doc: "Scalar chain h_l = φ(w h_{l-1} + b); log |∂h_L/∂h_l| per layer. params L, w, b, act ('sigmoid'|'tanh'|'relu'), x0",
  },
  'dl.depthsignal': {
    component: DepthSignal,
    validate: (s: VizSpec) => (s.init === undefined || ['small', 'lecun', 'xavier', 'he'].includes(s.init as string) ? null : 'unknown init'),
    doc: "Activation and gradient RMS through a deep random MLP. params act ('linear'|'relu'|'tanh'|'sigmoid'), init ('small'|'lecun'|'xavier'|'he'), depth, gain, residual (bool)",
  },
};
