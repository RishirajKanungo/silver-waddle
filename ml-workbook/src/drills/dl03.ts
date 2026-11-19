import { md, type Drill } from '../content/types';

const big = (n: number) => n.toLocaleString('en-US').replace(/,/g, '{,}');

export const DRILLS: Drill[] = [
  {
    id: 'dl-conv-out',
    module: 'dl03',
    title: 'Convolution output size',
    skill: 'n_out = ⌊(n + 2p − k)/s⌋ + 1, including the floor.',
    gen: (r) => {
      let n = 0, k = 0, p = 0, s = 1, out = 0;
      do {
        n = r.pick([7, 14, 28, 32, 56, 64, 112, 224, 15, 27]);
        k = r.pick([1, 2, 3, 3, 5, 7]);
        p = r.pick([0, 0, 1, (k - 1) / 2, 3].filter((v) => Number.isInteger(v)));
        s = r.pick([1, 1, 2, 2, 3]);
        out = Math.floor((n + 2 * p - k) / s) + 1;
      } while (out < 1);
      const num = n + 2 * p - k;
      return {
        prompt: md`Input size $n = ${n}$, kernel $k = ${k}$, padding $p = ${p}$, stride $s = ${s}$. What is the output size along this axis?`,
        answer: { kind: 'number', value: out },
        solution: md`$\left\lfloor\frac{${n} + ${2 * p} - ${k}}{${s}}\right\rfloor + 1 = \lfloor ${num}/${s}\rfloor + 1 = ${Math.floor(num / s)} + 1 = ${out}$.`,
      };
    },
  },
  {
    id: 'dl-conv-params',
    module: 'dl03',
    title: 'Convolution parameter counts',
    skill: 'k² · C_in · C_out weights plus C_out biases, independent of the image size.',
    gen: (r) => {
      const k = r.pick([1, 3, 3, 5, 7]);
      const cin = r.pick([1, 3, 16, 32, 64, 128]);
      const cout = r.pick([8, 16, 32, 64, 128, 256]);
      const hw = r.pick([28, 32, 56, 224]);
      const bias = r.next() < 0.75;
      const v = k * k * cin * cout + (bias ? cout : 0);
      return {
        prompt: md`A ${k}×${k} convolution maps a $${hw}\times${hw}\times${cin}$ tensor to $${cout}$ channels ${bias ? 'with' : 'without'} biases. How many parameters does it have?`,
        answer: { kind: 'number', value: v },
        solution: md`$${k}^2\cdot${cin}\cdot${cout}${bias ? ` + ${cout}` : ''} = ${big(v)}$. The spatial size ${hw}×${hw} does not enter: the kernel is shared across positions.`,
      };
    },
  },
  {
    id: 'dl-receptive-field',
    module: 'dl03',
    title: 'Receptive field of a conv stack',
    skill: 'r grows by (k − 1) times the product of the strides of the layers below.',
    gen: (r) => {
      const L = r.pick([2, 3, 3, 4]);
      const layers = Array.from({ length: L }, () => [r.pick([3, 3, 5]), r.pick([1, 1, 2])] as [number, number]);
      let rf = 1, J = 1;
      const terms: string[] = [];
      for (const [k, s] of layers) {
        rf += (k - 1) * J;
        terms.push(`${k - 1}\\cdot${J}`);
        J *= s;
      }
      return {
        prompt: md`A stack of convolutions without dilation has (kernel, stride) = ${layers.map(([k, s]) => `$(${k}, ${s})$`).join(', ')}, from input to output. What is the receptive field of one output unit, in input pixels along one axis?`,
        answer: { kind: 'number', value: rf },
        solution: md`$r = 1 + \sum_l (k_l - 1)J_{l-1}$ with $J$ the product of the earlier strides: $1 + ${terms.join(' + ')} = ${rf}$.`,
      };
    },
  },
];
