import { md, type Module } from '../types';

export const MODULE: Module = {
  id: 'dl02',
  part: 'dl',
  order: 2,
  title: 'Training deep networks',
  summary: 'Minibatches, AdamW, learning-rate schedules, gradient clipping and mixed precision; BatchNorm, LayerNorm, RMSNorm and residual connections; weight decay, dropout, label smoothing and a debugging routine.',
  relevance: md`Training recipes for current models are built from the parts in this module: AdamW with linear warmup and cosine decay, gradient clipping, bf16 mixed precision, pre-norm residual blocks with RMSNorm or LayerNorm, and weight decay. Interviews ask why transformers use LayerNorm instead of BatchNorm, why residual connections help, what dropout does at inference, and how you would debug a network whose loss does not go down. In practice, reading a loss curve and knowing which knob to turn is a large part of the job.`,
  areas: ['ml-depth', 'ml-breadth', 'ml-coding'],
  prereqs: ['dl01'],
  lessons: [
    // ------------------------------------------------------------------ 2.1
    {
      id: 'dl02-1',
      title: 'Optimization in practice',
      minutes: 40,
      objectives: [
        'Explain how the noise of a minibatch gradient scales with the batch size, and the linear scaling rule for the learning rate.',
        'Write the AdamW update and explain why decoupled weight decay differs from an L2 penalty under Adam.',
        'Compute a warmup-plus-cosine learning rate at a given step, and clip a set of gradients by their global norm.',
        'Compare fp32, fp16 and bf16 in range and precision, and explain loss scaling.',
        'Diagnose a loss curve as learning rate too high, too low, overfitting, or a data bug.',
      ],
      cells: [
        {
          kind: 'text',
          md: md`The training loss is an average over $N$ examples, $L(\btheta) = \frac1N\sum_i \ell_i(\btheta)$, and $N$ can be billions. Gradient descent on the full sum is too expensive per step, so training uses a **minibatch**: a random subset of $B$ examples, typically 32 to a few thousand for vision models and up to millions of tokens per step for LLMs. One pass over the data is an **epoch**. The minibatch gradient is a noisy but unbiased estimate of the full gradient, and the noise is not purely a cost: it lets SGD take many cheap steps and keeps it from settling into sharp minima.`,
        },
        {
          kind: 'callout',
          tone: 'definition',
          title: 'Minibatch gradient',
          md: md`With examples $i_1, \dots, i_B$ drawn uniformly at random, $$\hat\bg = \frac1B\sum_{k=1}^{B}\nabla\ell_{i_k}(\btheta), \qquad \E[\hat\bg] = \nabla L(\btheta), \qquad \Var(\hat g_j) = \frac{\sigma_j^2}{B},$$ where $\sigma_j^2$ is the variance of coordinate $j$ of a single example's gradient (for draws with replacement; without replacement the variance is slightly smaller). The noise standard deviation falls like $1/\sqrt{B}$.`,
        },
        {
          kind: 'numeric',
          q: md`Training with $B = 64$, you want to halve the standard deviation of the gradient noise. What batch size do you need?`,
          answer: { kind: 'number', value: 256 },
          explain: md`The standard deviation scales like $1/\sqrt B$. Halving it needs $\sqrt{B'} = 2\sqrt{64}$, so $B' = 4 \cdot 64 = 256$. Each step then costs four times as much compute for half the noise, which is why very large batches give diminishing returns.`,
        },
        {
          kind: 'text',
          md: md`**Batch size and learning rate.** With a $k$ times larger batch, one step averages the gradients that $k$ small steps would have used one by one. For SGD, the **linear scaling rule** multiplies the learning rate by $k$ to keep the progress per example roughly the same; Goyal et al. (2017) trained ResNet-50 on ImageNet with batch 8192 this way, together with a gradual warmup. The rule breaks down beyond a problem-dependent *critical batch size*, after which larger batches stop reducing the number of steps. For Adam, a square-root rule ($\eta \propto \sqrt{B}$) is a common starting point. In every case the learning rate is re-tuned when the batch size changes substantially.`,
        },
        {
          kind: 'callout',
          tone: 'definition',
          title: 'AdamW',
          md: md`With gradient $\bg_t$, step $t = 1, 2, \dots$, and element-wise operations:
$$\mathbf{m}_t = \beta_1\mathbf{m}_{t-1} + (1-\beta_1)\bg_t, \qquad \bv_t = \beta_2\bv_{t-1} + (1-\beta_2)\bg_t^2,$$
$$\hat{\mathbf{m}}_t = \frac{\mathbf{m}_t}{1-\beta_1^t}, \quad \hat{\bv}_t = \frac{\bv_t}{1-\beta_2^t}, \qquad \btheta_t = \btheta_{t-1} - \eta\left(\frac{\hat{\mathbf{m}}_t}{\sqrt{\hat{\bv}_t} + \epsilon} + \lambda\btheta_{t-1}\right).$$
$\mathbf{m}$ is a running mean of the gradient (momentum), $\bv$ a running mean of its square, and the hats correct the bias from starting both at zero. The weight-decay term $\lambda\btheta$ is added **outside** the adaptive scaling (Loshchilov and Hutter, "decoupled weight decay"). Common LLM settings are $\beta_1 = 0.9$, $\beta_2 = 0.95$, $\lambda = 0.1$.`,
        },
        {
          kind: 'code',
          code: `import numpy as np

def adamw_step(theta, g, m, v, t, lr=0.1, b1=0.9, b2=0.999, eps=1e-8, wd=0.0):
    m = b1 * m + (1 - b1) * g
    v = b2 * v + (1 - b2) * g * g
    m_hat = m / (1 - b1 ** t)          # bias correction
    v_hat = v / (1 - b2 ** t)
    theta = theta - lr * (m_hat / (np.sqrt(v_hat) + eps) + wd * theta)
    return theta, m, v

theta = np.array([1.0, 1.0])
m, v = np.zeros(2), np.zeros(2)
g = np.array([1000.0, 0.001])          # gradients six orders of magnitude apart
theta, m, v = adamw_step(theta, g, m, v, t=1)
print(np.round(theta, 4))`,
          predict: {
            q: md`One AdamW step with $\eta = 0.1$ and no weight decay, on gradients $1000$ and $0.001$. What is printed?`,
            options: ['`[0.9 0.9]`', '`[-99.  1.]`', '`[0.9 1. ]`', '`[-9.99e+01  9.99e-01]`'],
            answer: 0,
            explain: md`At $t = 1$ the bias corrections give $\hat m = g$ and $\hat v = g^2$, so the step is $\eta\,g/(|g| + \epsilon) \approx \eta\,\sign(g)$. Both coordinates move by $0.1$, whatever the gradient's scale. Plain SGD would have moved the first by 100 and the second by $10^{-4}$.`,
          },
        },
        {
          kind: 'check',
          q: md`Why does AdamW add $\lambda\btheta$ to the update directly instead of adding $\tfrac\lambda2\lVert\btheta\rVert^2$ to the loss?`,
          options: [
            md`With the penalty in the loss, its gradient $\lambda\btheta$ is divided by $\sqrt{\hat{\bv}}$, so weights with large gradients are barely decayed; decoupling decays every weight at the same rate`,
            md`Adding a penalty to the loss is not differentiable`,
            md`The two are identical for Adam; AdamW only saves memory`,
            md`Decoupling makes Adam converge to the same point as SGD`,
          ],
          answer: 0,
          explain: md`For plain SGD the two are the same thing. Under Adam the L2 gradient passes through the per-coordinate scaling, so the effective decay of each weight depends on its gradient history. AdamW applies $\btheta \leftarrow \btheta - \eta\lambda\btheta$ separately, which generalizes better in practice and makes $\lambda$ easier to tune. Biases and normalization gains are commonly excluded from decay.`,
        },
        {
          kind: 'callout',
          tone: 'definition',
          title: 'Linear warmup and cosine decay',
          md: md`With peak rate $\eta_{\max}$, final rate $\eta_{\min}$, $T_w$ warmup steps and $T$ total steps:
$$\eta_t = \begin{cases}\eta_{\max}\,\dfrac{t}{T_w} & t < T_w,\\[2mm] \eta_{\min} + \tfrac12(\eta_{\max} - \eta_{\min})\left(1 + \cos(\pi p)\right), \quad p = \dfrac{t - T_w}{T - T_w} & t \ge T_w.\end{cases}$$
Warmup avoids large updates while Adam's second-moment estimates are still based on few gradients and the network is far from a sensible region; transformers in particular can diverge without it. The decay lets the iterates settle as the noise of each step shrinks. A common alternative in recent LLM training is **warmup-stable-decay** (WSD): constant at the peak, then a short decay at the end, which makes it easy to continue training from a checkpoint taken before the decay.`,
        },
        {
          kind: 'viz',
          viz: { type: 'dl.lrschedule', sched: 'cosine', peak: 3e-4, minLr: 3e-5, warm: 1000, total: 11000, t: 6000 },
          task: md`Read $\eta_t$ at the middle of the decay ($t = 6000$) and check it against the formula. Then compare the four schedules at $t = 9000$, and set $T_w = 0$ to see the schedule start at its peak.`,
          caption: md`The orange dot is the current step. At the midpoint of the cosine phase $\cos(\pi/2) = 0$, so the rate is exactly halfway between $\eta_{\max}$ and $\eta_{\min}$. Cosine decay spends more steps near the peak and near the end than linear decay does.`,
        },
        {
          kind: 'numeric',
          q: md`$\eta_{\max} = 3\times10^{-4}$, $\eta_{\min} = 3\times10^{-5}$, $T_w = 1000$, $T = 11000$. Compute $\eta_t$ at $t = 6000$.`,
          answer: { kind: 'number', value: 1.65e-4, tol: 1e-7 },
          inputHint: 'scientific notation is fine, e.g. 1.2e-4',
          explain: md`$p = (6000 - 1000)/10000 = 0.5$, and $\cos(0.5\pi) = 0$. So $\eta_t = 3\times10^{-5} + \tfrac12(2.7\times10^{-4})(1 + 0) = 3\times10^{-5} + 1.35\times10^{-4} = 1.65\times10^{-4}$.`,
        },
        {
          kind: 'text',
          md: md`**Gradient clipping.** A single bad batch, or a sharp region of the loss surface, can produce a gradient many times larger than usual, and one such step can undo hours of training. Clipping by the **global norm** treats all parameters as one long vector:
$$\bg \leftarrow \bg\cdot\min\left(1, \frac{c}{\lVert\bg\rVert_2}\right).$$
It caps the step length and keeps the direction. A threshold of $c = 1.0$ is common in LLM training (\`torch.nn.utils.clip_grad_norm_\`). Clipping each tensor separately, or each coordinate (clipping by value), changes the direction and is used less.`,
        },
        {
          kind: 'code',
          code: `import numpy as np

grads = [np.array([3.0, 4.0]), np.array([12.0])]     # gradients of two parameter tensors
total = np.sqrt(sum(np.sum(g ** 2) for g in grads))  # global L2 norm
max_norm = 6.5
scale = min(1.0, max_norm / total)
clipped = [g * scale for g in grads]
print(total, clipped[0], clipped[1])`,
          note: md`The global norm is $\sqrt{9 + 16 + 144} = 13$, so every gradient is multiplied by $6.5/13 = 0.5$. Set \`max_norm = 20\` and nothing changes.`,
        },
        {
          kind: 'numeric',
          q: md`Gradients $\bg_1 = (6, 8)$ and $\bg_2 = (0, 0, 0)$, clipped together to a global norm of at most $c = 2$. Give the clipped $\bg_1$.`,
          answer: { kind: 'vector', value: [1.2, 1.6] },
          explain: md`$\lVert\bg\rVert = \sqrt{36 + 64} = 10 > 2$, so the scale is $2/10 = 0.2$ and $\bg_1 \to (1.2, 1.6)$, with norm 2.`,
        },
        {
          kind: 'text',
          md: md`**Mixed precision.** Matrix multiplications run several times faster, and activations take half the memory, in 16-bit formats. The two 16-bit formats split their bits differently:

| format | exponent bits | mantissa bits | largest value | smallest normal | gap above 1 |
|---|---|---|---|---|---|
| fp32 | 8 | 23 | $\approx 3.4\times10^{38}$ | $\approx 1.2\times10^{-38}$ | $2^{-23} \approx 1.2\times10^{-7}$ |
| fp16 | 5 | 10 | $65504$ | $\approx 6.1\times10^{-5}$ | $2^{-10} \approx 9.8\times10^{-4}$ |
| bf16 | 8 | 7 | $\approx 3.4\times10^{38}$ | $\approx 1.2\times10^{-38}$ | $2^{-7} \approx 7.8\times10^{-3}$ |

bf16 keeps fp32's range with less precision; fp16 has more precision but a narrow range. Below the smallest normal number, fp16 has subnormals down to $2^{-24} \approx 6\times10^{-8}$; anything smaller rounds to 0. In a standard mixed-precision setup the matrix multiplications run in 16 bits, while a master copy of the weights and the optimizer states stay in fp32 so that small updates are not lost to rounding.`,
        },
        {
          kind: 'viz',
          viz: { type: 'dl.floats', x: 1e-8, k: 0 },
          task: md`Start at $x = 10^{-8}$, a typical small gradient. Which formats keep it? Raise the loss scale until the fp16 row recovers it. Then try the presets 1.001 and 1e5.`,
          caption: md`The bars show each format's range on a log scale: dark for normal numbers, light for subnormals. fp16 loses $10^{-8}$ to underflow; multiplying the loss by $S = 2^k$ multiplies every gradient by $S$ and moves it into range, and dividing by $S$ in fp32 recovers it. bf16 never underflows here but rounds 1.001 to 1, since its spacing near 1 is $2^{-7}$.`,
        },
        {
          kind: 'numeric',
          q: md`What is the smallest bf16 number greater than 1?`,
          answer: { kind: 'number', value: 1.0078125 },
          explain: md`bf16 has 7 stored mantissa bits, so numbers in $[1, 2)$ are spaced $2^{-7}$ apart. The next number after 1 is $1 + 2^{-7} = 1.0078125$. Adding an update of $10^{-3}$ to a bf16 weight of 1 does nothing, which is one reason master weights are kept in fp32.`,
        },
        {
          kind: 'code',
          code: `import numpy as np

grad = 1e-8                                  # a small but real gradient value
print(np.float16(grad))                      # stored directly in fp16
S = 2.0 ** 16                                # loss scale
scaled = np.float16(grad * S)                # backward pass on the scaled loss
print(scaled, float(scaled) / S)             # unscale in fp32 before the update`,
          note: md`Without scaling the gradient becomes exactly 0.0. With $S = 2^{16}$ it is stored as $6.55\times10^{-4}$, and dividing by $S$ in higher precision gives back about $10^{-8}$ (fp16 keeps about three significant digits). **Dynamic loss scaling** starts with a large $S$, halves it and skips the step whenever an inf or NaN appears in the gradients, and doubles it again after a run of clean steps.`,
        },
        {
          kind: 'check',
          q: md`Which setup normally needs loss scaling?`,
          options: [md`fp16 mixed precision`, md`bf16 mixed precision`, md`fp32 training`, md`Any format, whenever gradient clipping is off`],
          answer: 0,
          explain: md`fp16's smallest subnormal is about $6\times10^{-8}$, and many gradients are smaller. bf16 has the same exponent range as fp32, so gradients do not underflow and loss scaling is generally not needed, which is a major reason bf16 became the default on hardware that supports it.`,
        },
        {
          kind: 'viz',
          viz: { type: 'dl.losscurves', mode: 'diagnose' },
          task: md`Diagnose all five curves. For each, decide from the shape of **both** curves before you click. Then switch to **simulate** and reproduce each failure yourself.`,
          caption: md`These are real runs of a small MLP on the circles data, recorded once. The dashed line is $\ln 2$, the loss of predicting 0.5. Train and validation together, going down slowly: learning rate too low. Erratic, with spikes: too high. Train down, validation turning up: overfitting. Validation never moving: suspect the data.`,
        },
        {
          kind: 'paper',
          problem: {
            id: 'dl02-1-paper',
            title: "Adam's first step ignores the gradient's scale",
            type: 'derive',
            difficulty: 2,
            minutes: 8,
            statement: md`Show that the first Adam update ($t = 1$, $\mathbf{m}_0 = \bv_0 = \bzero$, no weight decay) moves each coordinate by $\eta\,\dfrac{|g_j|}{|g_j| + \epsilon} \approx \eta$, in the direction of $-\sign(g_j)$. What does this imply about multiplying the loss by 1000 under Adam versus under SGD?`,
            hints: [md`Compute $\mathbf{m}_1$ and $\bv_1$, then apply the bias corrections with $t = 1$.`],
            solution: [
              md`$\mathbf{m}_1 = (1 - \beta_1)\bg$ and $\bv_1 = (1-\beta_2)\bg^2$.`,
              md`Bias correction at $t = 1$: $\hat{\mathbf{m}}_1 = \mathbf{m}_1/(1 - \beta_1) = \bg$ and $\hat{\bv}_1 = \bv_1/(1 - \beta_2) = \bg^2$.`,
              md`The step for coordinate $j$ is $-\eta\,g_j/(\sqrt{g_j^2} + \epsilon) = -\eta\,g_j/(|g_j| + \epsilon)$, of size $\eta|g_j|/(|g_j| + \epsilon) \approx \eta$ unless $|g_j|$ is comparable to $\epsilon$.`,
              md`Scaling the loss by 1000 scales $\bg$, $\hat{\mathbf{m}}$ by 1000 and $\sqrt{\hat{\bv}}$ by 1000, so the Adam update is unchanged (up to $\epsilon$). Under SGD the step becomes 1000 times larger. Adam's learning rate is therefore a step size in parameter units, which is why the same $\eta$ (for example $3\times10^{-4}$) transfers across many models.`,
            ],
            rubric: [md`Correct $\mathbf{m}_1, \bv_1$ and bias corrections`, md`Step size $\eta|g_j|/(|g_j| + \epsilon)$`, md`States the invariance to loss scaling and contrasts it with SGD`],
          },
        },
        {
          kind: 'explain',
          prompt: md`During a large training run the loss suddenly spikes and then recovers, several times. What could cause this, and what would you change?`,
          model: md`Loss spikes usually come from steps that are too large for the local curvature: a learning rate near the edge of stability, a batch with unusual data (very long, duplicated or corrupted sequences), or numerical issues such as fp16 overflow or a few huge logits. I would first check the gradient norm around each spike and look at the batches involved. Common fixes are lowering the peak learning rate or lengthening warmup, clipping the global gradient norm (for example at 1.0), using bf16 instead of fp16, adding normalization such as QK-norm or a z-loss on the logits, lowering Adam's $\beta_2$ (0.95 instead of 0.999) so the second-moment estimate adapts faster, and filtering bad data. If a spike does not recover, restarting from an earlier checkpoint and skipping the offending batches is a standard practice.`,
        },
      ],
      cards: [
        { id: 'dl02-1-c1', kind: 'concept', front: md`Write the AdamW update, including bias correction and decoupled weight decay.`, back: md`$\mathbf{m} \leftarrow \beta_1\mathbf{m} + (1-\beta_1)\bg$, $\bv \leftarrow \beta_2\bv + (1-\beta_2)\bg^2$, $\hat{\mathbf{m}} = \mathbf{m}/(1-\beta_1^t)$, $\hat{\bv} = \bv/(1-\beta_2^t)$, $\btheta \leftarrow \btheta - \eta(\hat{\mathbf{m}}/(\sqrt{\hat{\bv}}+\epsilon) + \lambda\btheta)$.` },
        { id: 'dl02-1-c2', kind: 'compute', front: md`Cosine schedule without warmup, $\eta_{\max} = 10^{-3}$, $\eta_{\min} = 0$, $T = 1000$. What is $\eta$ at $t = 500$?`, answer: { kind: 'number', value: 5e-4, tol: 1e-7 }, back: md`$p = 0.5$, $\cos(\pi/2) = 0$, so $\eta = \tfrac12\cdot10^{-3}$.` },
        { id: 'dl02-1-c3', kind: 'cloze', text: md`fp16 has 5 exponent bits and its largest finite value is {{}}.`, answers: ['65504'] },
        { id: 'dl02-1-c4', kind: 'concept', front: md`Why does fp16 training need loss scaling while bf16 usually does not?`, back: md`fp16's range is narrow: values below about $6\times10^{-8}$ underflow to 0, and many gradients are that small. Scaling the loss by $S$ shifts gradients into range. bf16 has fp32's 8 exponent bits, so gradients do not underflow.` },
        { id: 'dl02-1-c5', kind: 'concept', front: md`How do you clip gradients by global norm, and what does it preserve?`, back: md`Concatenate all gradients into one vector $\bg$; if $\lVert\bg\rVert > c$, multiply every gradient by $c/\lVert\bg\rVert$. The direction is preserved; only the length is capped.` },
      ],
    },
    // ------------------------------------------------------------------ 2.2
    {
      id: 'dl02-2',
      title: 'Normalization and residual connections',
      minutes: 35,
      objectives: [
        'State which axes BatchNorm, LayerNorm and RMSNorm normalize over for $(B, D)$ and $(B, T, D)$ tensors.',
        'Compute LayerNorm and RMSNorm of a small vector by hand, and implement both in NumPy.',
        "Explain BatchNorm's different behaviour in training and evaluation, and why transformers use LayerNorm or RMSNorm.",
        "Show that a residual block's Jacobian is $I + \\partial F/\\partial\\bx$ and explain why that helps gradients reach early layers.",
        'Distinguish pre-norm from post-norm transformer blocks.',
      ],
      cells: [
        {
          kind: 'text',
          md: md`The previous module chose the initialization so that activations keep a stable scale at the start of training. Once the weights change, nothing keeps that true. **Normalization layers** re-standardize activations inside the network at every step, so each layer sees inputs with a controlled mean and scale. Empirically this allows larger learning rates and makes training much less sensitive to initialization. BatchNorm was originally motivated by reducing "internal covariate shift"; later work (Santurkar et al. 2018) argued that its main benefit is a smoother loss surface, and the precise mechanism is still debated.`,
        },
        {
          kind: 'callout',
          tone: 'definition',
          title: 'Three normalizations',
          md: md`Each standardizes a group of entries and then applies a learned per-feature scale $\boldsymbol\gamma$ and shift $\boldsymbol\beta$:
$$\hat x = \frac{x - \mu}{\sqrt{\sigma^2 + \epsilon}}, \qquad y = \gamma\,\hat x + \beta.$$
They differ only in **which entries form the group** for $\mu$ and $\sigma^2$:
- **BatchNorm**: for each feature (channel), across the batch, and across spatial positions or tokens if present. Shape of the statistics: one per feature.
- **LayerNorm**: for each example (each token in a sequence), across its features. One mean and variance per token.
- **RMSNorm**: like LayerNorm, but without subtracting the mean and without $\beta$: $y = \gamma\odot\bx/\sqrt{\tfrac1D\sum_i x_i^2 + \epsilon}$.`,
        },
        {
          kind: 'viz',
          viz: { type: 'dl.normaxes', shape: '2d', norm: 'batch' },
          task: md`With BatchNorm, click cells in different rows of the same column: does the group change? Switch to LayerNorm and repeat. Then pick the $(B, T, D)$ tensor and find the group BatchNorm uses for one feature.`,
          caption: md`Highlighted cells are the entries whose mean and variance normalize the clicked cell. BatchNorm groups down a column (and across all tokens in the 3-D case), so an example's output depends on whatever else is in its batch. LayerNorm and RMSNorm group along a row, one example or token at a time.`,
        },
        {
          kind: 'check',
          q: md`For which normalization does the output for one example change if you replace the **other** examples in the batch?`,
          options: [md`BatchNorm in training mode`, md`LayerNorm`, md`RMSNorm`, md`BatchNorm in evaluation mode`],
          answer: 0,
          explain: md`In training mode BatchNorm computes $\mu$ and $\sigma^2$ over the batch. In evaluation mode it uses fixed running averages, and LayerNorm and RMSNorm only look at the example itself.`,
        },
        {
          kind: 'numeric',
          q: md`Apply LayerNorm (with $\gamma = 1$, $\beta = 0$, $\epsilon = 0$) to $\bx = (7, 1, 1, -1)$.`,
          answer: { kind: 'vector', value: [5 / 3, -1 / 3, -1 / 3, -1] },
          hints: [md`Mean $2$. Deviations $(5, -1, -1, -3)$. Use the population variance (divide by 4).`],
          explain: md`$\mu = 8/4 = 2$; deviations $(5, -1, -1, -3)$; $\sigma^2 = (25 + 1 + 1 + 9)/4 = 9$, so $\sigma = 3$ and $\hat\bx = (5/3, -1/3, -1/3, -1)$. The result has mean 0 and variance 1.`,
        },
        {
          kind: 'numeric',
          q: md`Apply RMSNorm (with $\gamma = 1$, $\epsilon = 0$) to $\bx = (4, 0, -4, 2)$.`,
          answer: { kind: 'vector', value: [4 / 3, 0, -4 / 3, 2 / 3] },
          explain: md`$\tfrac14(16 + 0 + 16 + 4) = 9$, so the RMS is 3 and $\by = (4/3, 0, -4/3, 2/3)$. The mean of $\bx$ is $0.5$, and RMSNorm leaves it in (as $1/6$ after scaling); LayerNorm would have removed it.`,
        },
        {
          kind: 'text',
          md: md`**BatchNorm in training and evaluation.** During training, BatchNorm normalizes with the current batch's statistics and updates running averages, for example $\mu_{\text{run}} \leftarrow 0.9\,\mu_{\text{run}} + 0.1\,\mu_{\text{batch}}$ (PyTorch's default momentum is 0.1). At evaluation time it uses the running averages, so each example's output is deterministic and independent of the batch. Forgetting to switch modes (\`model.eval()\` in PyTorch) is a classic bug: predictions then depend on the test batch's composition, and with tiny batches they are badly wrong. BatchNorm also needs reasonably large batches to estimate the statistics, synchronization across devices for small per-device batches, and care with padded sequences, whose padding positions would pollute the statistics.`,
        },
        {
          kind: 'check',
          q: md`A \`BatchNorm1d\` layer is left in training mode and receives a batch of **one** example (shape $1 \times D$, no other dimensions). What would the normalization produce?`,
          options: [md`$\hat x = 0$ for every feature, so the output is $\boldsymbol\beta$ whatever the input`, md`The input unchanged`, md`The same result as in evaluation mode`, md`Values with mean 0 and variance 1 across the features`],
          answer: 0,
          explain: md`Each feature's batch mean is the value itself, so $x - \mu = 0$ and the output is $\beta$ for every input. PyTorch refuses this case with an error ("Expected more than 1 value per channel when training"). With conv layers and spatial positions it runs, but the statistics come from a single image.`,
        },
        {
          kind: 'callout',
          tone: 'intuition',
          title: 'Why transformers use LayerNorm or RMSNorm',
          md: md`A transformer processes sequences of different lengths with padding, often at batch size 1 during generation, and its features are best compared within a token. LayerNorm and RMSNorm normalize each token by itself: no dependence on the batch, no running statistics, identical behaviour in training and inference, and no interaction with padding. Many current LLMs use RMSNorm, which drops the mean subtraction and is slightly cheaper with no measurable loss in quality.`,
        },
        {
          kind: 'code',
          code: `import numpy as np

np.random.seed(0)
x = np.random.randn(8, 5, 16) * 3 + 2      # (batch, tokens, features)

bn_mean = x.mean(axis=(0, 1))              # BatchNorm: one mean per feature
ln_mean = x.mean(axis=-1, keepdims=True)   # LayerNorm: one mean per token
print(bn_mean.shape, ln_mean.shape)`,
          predict: {
            q: md`What are the shapes of the two sets of statistics?`,
            options: ['`(16,) (8, 5, 1)`', '`(8, 5) (16,)`', '`(16,) (8, 5)`', '`(8, 5, 1) (16,)`'],
            answer: 0,
            explain: md`BatchNorm reduces over the batch and token axes, leaving one value per feature. LayerNorm reduces over the feature axis; \`keepdims=True\` keeps a size-1 axis so that \`x - ln_mean\` broadcasts correctly.`,
          },
        },
        {
          kind: 'exercise',
          ex: {
            id: 'dl02-2-ex',
            title: 'LayerNorm and RMSNorm forward',
            prompt: md`Implement \`layer_norm(x, gamma, beta, eps)\` and \`rms_norm(x, g, eps)\` for inputs of any shape, normalizing over the **last** axis. \`gamma\`, \`beta\` and \`g\` have the size of the last axis. Use the population variance (\`x.var\`), put \`eps\` inside the square root, and do not use \`for\` loops.`,
            starter: `import numpy as np

def layer_norm(x, gamma, beta, eps=1e-5):
    return x

def rms_norm(x, g, eps=1e-5):
    return x

np.random.seed(1)
x = np.random.randn(2, 3, 4) * 5 + 3       # (B, T, D)
gamma = np.array([1.0, 2.0, 0.5, 1.0])
beta = np.array([0.0, 1.0, 0.0, -1.0])
y = layer_norm(x, gamma, beta)
print(np.round(y[0, 0], 4))
print(np.round(rms_norm(np.array([4.0, 0.0, -4.0, 2.0]), np.ones(4), eps=0.0), 4))`,
            solution: `import numpy as np

def layer_norm(x, gamma, beta, eps=1e-5):
    mu = x.mean(axis=-1, keepdims=True)
    var = x.var(axis=-1, keepdims=True)
    return gamma * (x - mu) / np.sqrt(var + eps) + beta

def rms_norm(x, g, eps=1e-5):
    rms = np.sqrt(np.mean(x ** 2, axis=-1, keepdims=True) + eps)
    return g * x / rms

np.random.seed(1)
x = np.random.randn(2, 3, 4) * 5 + 3       # (B, T, D)
gamma = np.array([1.0, 2.0, 0.5, 1.0])
beta = np.array([0.0, 1.0, 0.0, -1.0])
y = layer_norm(x, gamma, beta)
print(np.round(y[0, 0], 4))
print(np.round(rms_norm(np.array([4.0, 0.0, -4.0, 2.0]), np.ones(4), eps=0.0), 4))`,
            tests: [
              { expr: 'np.round(layer_norm(x, gamma, beta), 6).tolist()', label: 'layer_norm on a (2, 3, 4) tensor' },
              { expr: 'np.round(layer_norm(x, np.ones(4), np.zeros(4)).mean(axis=-1), 6).tolist()', label: 'each token has mean 0' },
              { expr: 'np.round(rms_norm(x, gamma), 6).tolist()', label: 'rms_norm on a (2, 3, 4) tensor' },
              { expr: 'np.round(rms_norm(np.array([4.0, 0.0, -4.0, 2.0]), np.ones(4), eps=0.0), 6).tolist()', label: 'rms_norm by hand example' },
            ],
            hints: [
              md`Reduce over the last axis with \`axis=-1, keepdims=True\` so that the statistics broadcast back against \`x\`.`,
              md`LayerNorm: \`gamma * (x - mu) / np.sqrt(var + eps) + beta\`.`,
              md`RMSNorm: \`g * x / np.sqrt(np.mean(x ** 2, axis=-1, keepdims=True) + eps)\`.`,
            ],
            mustExclude: ['for '],
          },
        },
        {
          kind: 'text',
          md: md`**Residual connections.** A residual block computes $$\bx_{l+1} = \bx_l + F_l(\bx_l),$$ where $F_l$ is a small sub-network (two convolutions in a ResNet; attention or an MLP in a transformer). The block only has to learn a *correction* to its input, and $F_l = 0$ makes it the identity, so adding blocks cannot make the function class worse. He et al. (2015) used this to train networks with more than 100 layers, which plain stacks of the same depth could not fit. Unrolled, $\bx_L = \bx_0 + \sum_{l<L}F_l(\bx_l)$: the output is the input plus a sum of contributions, often called the **residual stream**.`,
        },
        {
          kind: 'derive',
          title: 'the gradient highway',
          goal: md`Show that in a stack of residual blocks, $\partial\bx_L/\partial\bx_0$ contains an identity term, so gradients reach the first layer without passing through any weight matrix.`,
          steps: [
            {
              md: md`For one block, $\bx_{l+1} = \bx_l + F_l(\bx_l)$, so its Jacobian is $$\pd{\bx_{l+1}}{\bx_l} = I + J_l, \qquad J_l = \pd{F_l}{\bx_l}.$$`,
              choose: {
                prompt: md`What is the derivative of the skip path $\bx_l \mapsto \bx_l$?`,
                options: [md`The identity matrix $I$`, md`Zero`, md`$J_l$`],
                answer: 0,
                explain: md`The skip path copies its input, so its Jacobian is $I$; the derivatives of the two branches add.`,
              },
            },
            { md: md`Chain the blocks: $$\pd{\bx_L}{\bx_0} = (I + J_{L-1})\cdots(I + J_1)(I + J_0).$$` },
            {
              md: md`Expand the product. It is $I + \sum_l J_l + \sum_{l > m}J_lJ_m + \dots$: one term for each subset of blocks the gradient passes through. The term $I$ corresponds to taking the skip path everywhere.`,
              choose: {
                prompt: md`In a plain network $\bx_{l+1} = F_l(\bx_l)$, which terms survive?`,
                options: [md`Only the full product $J_{L-1}\cdots J_0$`, md`Only $I$`, md`All the terms of the expansion`],
                answer: 0,
                explain: md`Without the skip path there is only one route, through every block, and its product of $L$ Jacobians can vanish or explode geometrically.`,
              },
            },
            { md: md`The upstream gradient therefore reaches $\bx_0$ at least through the identity term, and the long products are added to it instead of being the only route. In a scalar picture, ten blocks with local derivative 0.1 give $0.1^{10} = 10^{-10}$ without skips but $1.1^{10} \approx 2.59$ with them.` },
          ],
          takeaway: md`Residual connections give the backward pass a path of length one from the loss to every layer. The same idea appears as the additive cell state of an LSTM.`,
        },
        {
          kind: 'viz',
          viz: { type: 'dl.depthsignal', act: 'sigmoid', init: 'xavier', depth: 30, residual: true },
          task: md`Compare the plain and the residual gradient curves for sigmoid at depth 30. Then switch to tanh and ReLU. Look at the **top** plot too: what happens to the scale of the residual stream as depth grows?`,
          caption: md`With residual blocks the gradient at layer 0 stays near the top layer's value, even for sigmoids, where the plain stack loses more than ten orders of magnitude. The cost shows in the forward plot: every block adds to the stream, so its scale grows with depth. Real architectures control this with a normalization inside each block and small initial weights on each branch's last layer (GPT-2, for example, scales them by $1/\sqrt{N}$ for $N$ residual layers).`,
        },
        {
          kind: 'numeric',
          q: md`Ten scalar residual blocks each have $F_l'(x) = 0.1$ at the current point. What is $\partial x_{10}/\partial x_0$?`,
          answer: { kind: 'number', value: 2.5937424601 },
          explain: md`Each block contributes $1 + 0.1 = 1.1$, so the product is $1.1^{10} \approx 2.594$. Without the skips it would be $0.1^{10} = 10^{-10}$.`,
        },
        {
          kind: 'callout',
          tone: 'definition',
          title: 'Post-norm and pre-norm blocks',
          md: md`The original transformer (2017) normalized **after** adding the residual: $$\text{post-norm:}\quad \bx_{l+1} = \operatorname{LN}(\bx_l + F(\bx_l)).$$ Most current models normalize the branch input instead: $$\text{pre-norm:}\quad \bx_{l+1} = \bx_l + F(\operatorname{LN}(\bx_l)),$$ with one final normalization before the output layer. In pre-norm the residual stream itself is never normalized, so the identity path from the loss to every layer is untouched; such models train stably with less warmup (Xiong et al. 2020). Post-norm puts a normalization on the main path at every layer and needs careful warmup, though it can reach slightly better results when it trains well. A typical 2026 LLM block is pre-norm with RMSNorm.`,
        },
        {
          kind: 'check',
          q: md`In a pre-norm transformer block, what does the attention sub-layer receive as input?`,
          options: [md`$\operatorname{Norm}(\bx_l)$, while the skip path carries the unnormalized $\bx_l$`, md`$\bx_l$, and the sum is normalized afterwards`, md`$\operatorname{Norm}(\bx_l)$ on both the branch and the skip path`, md`The output of the previous block's final normalization`],
          answer: 0,
          explain: md`Pre-norm normalizes only the branch input. The skip connection adds the raw $\bx_l$, so the residual stream accumulates unnormalized contributions, and a final norm is applied before the output head.`,
        },
        {
          kind: 'paper',
          problem: {
            id: 'dl02-2-paper',
            title: 'LayerNorm ignores shifts and scales of its input',
            type: 'proof',
            difficulty: 2,
            minutes: 8,
            statement: md`Let $\operatorname{LN}(\bx) = (\bx - \mu(\bx)\mathbf 1)/\sigma(\bx)$ with $\epsilon = 0$, $\gamma = 1$, $\beta = 0$, and $\sigma(\bx) > 0$. Prove that $\operatorname{LN}(a\bx + c\mathbf 1) = \operatorname{LN}(\bx)$ for every $a > 0$ and real $c$. Which of the two invariances does RMSNorm keep?`,
            hints: [md`Compute $\mu(a\bx + c\mathbf 1)$ and $\sigma(a\bx + c\mathbf 1)$ in terms of $\mu(\bx)$ and $\sigma(\bx)$.`],
            solution: [
              md`The mean is linear: $\mu(a\bx + c\mathbf 1) = a\mu(\bx) + c$.`,
              md`So the deviations are $(a\bx + c\mathbf 1) - (a\mu + c)\mathbf 1 = a(\bx - \mu\mathbf 1)$, and the standard deviation is $\sigma(a\bx + c\mathbf 1) = |a|\sigma(\bx) = a\sigma(\bx)$ for $a > 0$.`,
              md`Dividing: $\dfrac{a(\bx - \mu\mathbf 1)}{a\sigma(\bx)} = \operatorname{LN}(\bx)$.`,
              md`RMSNorm keeps only the scale invariance: $\operatorname{RMS}(a\bx) = a\operatorname{RMS}(\bx)$ for $a > 0$, but adding $c\mathbf 1$ changes the output because the mean is not removed. For $a < 0$, both flip the sign of the output.`,
            ],
            rubric: [md`Mean of the transformed vector`, md`Standard deviation scales by $|a|$, with the sign condition`, md`Correct statement about RMSNorm`],
          },
        },
        {
          kind: 'explain',
          prompt: md`An interviewer asks: *why do residual connections make very deep networks trainable?* Give a short answer with the key equation.`,
          model: md`A residual block computes $\bx_{l+1} = \bx_l + F_l(\bx_l)$, so its Jacobian is $I + \partial F_l/\partial\bx_l$. Through $L$ blocks the gradient is the product $\prod_l(I + J_l)$, which expands into a sum over paths that includes the identity: the gradient reaches every layer directly, instead of only through a product of $L$ Jacobians that tends to vanish or explode. On the forward side, $F_l = 0$ gives the identity, so a block only needs to learn a correction and extra depth cannot hurt the best achievable fit. In practice this is combined with normalization (pre-norm in transformers) and small initialization of each branch so that the residual stream's scale stays controlled.`,
        },
      ],
      cards: [
        { id: 'dl02-2-c1', kind: 'concept', front: md`Over which axes do BatchNorm and LayerNorm compute statistics for a $(B, T, D)$ tensor?`, back: md`BatchNorm: over $B$ and $T$, one mean and variance per feature $d$. LayerNorm: over $D$, one mean and variance per token $(b, t)$.` },
        { id: 'dl02-2-c2', kind: 'cloze', text: md`RMSNorm is LayerNorm without subtracting the {{}}.`, answers: ['mean'] },
        { id: 'dl02-2-c3', kind: 'compute', front: md`LayerNorm ($\gamma = 1$, $\beta = 0$, $\epsilon = 0$) of $(1, 3)$.`, answer: { kind: 'vector', value: [-1, 1] }, back: md`Mean 2, deviations $(-1, 1)$, variance 1: the result is $(-1, 1)$.` },
        { id: 'dl02-2-c4', kind: 'concept', front: md`What does BatchNorm do differently at evaluation time, and what is the classic bug?`, back: md`It uses running averages of the mean and variance collected during training instead of batch statistics. Forgetting \`model.eval()\` makes predictions depend on the test batch.` },
        { id: 'dl02-2-c5', kind: 'concept', front: md`Write a pre-norm and a post-norm residual block.`, back: md`Pre-norm: $\bx + F(\operatorname{Norm}(\bx))$. Post-norm: $\operatorname{Norm}(\bx + F(\bx))$. Pre-norm leaves the residual stream unnormalized and trains more stably.` },
      ],
    },
    // ------------------------------------------------------------------ 2.3
    {
      id: 'dl02-3',
      title: 'Regularization and debugging',
      minutes: 35,
      objectives: [
        'Write the weight-decay update and compute how much a weight shrinks over many steps.',
        'Derive that inverted dropout preserves the expected activation and explain the $1/(1-p)$ scale.',
        'Compute label-smoothed targets and explain why they keep logits finite.',
        'Explain early stopping and data augmentation as regularizers.',
        'Apply a debugging routine: check shapes, check the initial loss against $\\ln C$, and overfit a single batch.',
      ],
      cells: [
        {
          kind: 'text',
          md: md`A network with millions of parameters can fit its training set exactly, including the noise in the labels. **Regularization** is anything that improves the validation loss without being aimed at the training loss: penalizing large weights, injecting noise during training, softening the targets, enlarging the data with label-preserving transformations, or stopping before the fit becomes too tight. Several of these are standard parts of a modern training recipe.`,
        },
        {
          kind: 'callout',
          tone: 'definition',
          title: 'Weight decay',
          md: md`Each step shrinks the weights toward zero before (or alongside) the gradient step: $$\btheta \leftarrow (1 - \eta\lambda)\,\btheta - \eta\,\bg.$$ For plain SGD this is exactly gradient descent on $L(\btheta) + \tfrac\lambda2\lVert\btheta\rVert^2$, the L2 penalty from the regression modules. With Adam it is not, which is why AdamW applies the decay separately. Weight decay is commonly not applied to biases and normalization gains.`,
        },
        {
          kind: 'numeric',
          q: md`With $\eta = 0.01$ and $\lambda = 0.1$, a weight receives no gradient for 1000 steps. By what factor has weight decay multiplied it?`,
          answer: { kind: 'number', value: 0.36769542477, tol: 1e-3 },
          explain: md`Each step multiplies by $1 - \eta\lambda = 0.999$, so after 1000 steps the factor is $0.999^{1000} \approx 0.3677$, close to $e^{-1} \approx 0.3679$ because $(1 - 1/n)^n \to e^{-1}$. Weights that the loss does not support decay away.`,
        },
        {
          kind: 'callout',
          tone: 'definition',
          title: 'Dropout',
          md: md`During training, each activation is kept with probability $1 - p$ and set to zero with probability $p$, independently per unit and per example: $$\tilde h_i = \frac{m_i\,h_i}{1 - p}, \qquad m_i \sim \operatorname{Bernoulli}(1 - p).$$ This is **inverted dropout**, the form used by PyTorch: the $1/(1-p)$ scale is applied during training, so at evaluation time dropout is simply the identity. A network cannot rely on any single unit and in effect trains an ensemble of thinned sub-networks that share weights.`,
        },
        {
          kind: 'derive',
          title: 'why scale by 1/(1−p)',
          goal: md`Show that inverted dropout leaves the expected activation unchanged, and compute the variance it adds.`,
          steps: [
            {
              md: md`$m_i$ is 1 with probability $1 - p$ and 0 otherwise, so $\E[m_i] = 1 - p$. Treat $h_i$ as fixed (we average over the mask only): $$\E[\tilde h_i] = \frac{\E[m_i]\,h_i}{1 - p} = \frac{(1 - p)h_i}{1 - p} = h_i.$$`,
              choose: {
                prompt: md`What is $\E[m_i]$ for $m_i \sim \operatorname{Bernoulli}(1 - p)$?`,
                options: [md`$1 - p$`, md`$p$`, md`$p(1-p)$`],
                answer: 0,
                explain: md`A Bernoulli variable's mean is its probability of being 1, here the keep probability $1 - p$. $p(1-p)$ is its variance.`,
              },
            },
            {
              md: md`Without the scale, $\E[m_ih_i] = (1-p)h_i$: during training the next layer sees inputs that are on average $(1-p)$ times smaller than at evaluation, where nothing is dropped. The original 2014 formulation fixed this by multiplying the weights by $1 - p$ at test time; inverted dropout moves the correction into training.`,
              choose: {
                prompt: md`If you trained **without** the $1/(1-p)$ scale and then evaluated with dropout off, what goes wrong?`,
                options: [md`Pre-activations at evaluation are about $1/(1-p)$ times larger than in training`, md`Nothing; the network adapts`, md`Evaluation outputs become random`],
                answer: 0,
                explain: md`The next layer was trained on inputs of average size $(1-p)h$ and now receives $h$. With $p = 0.5$ that doubles every pre-activation.`,
              },
            },
            { md: md`Variance: $\tilde h_i^2 = m_ih_i^2/(1-p)^2$ (since $m_i^2 = m_i$), so $\E[\tilde h_i^2] = h_i^2/(1-p)$ and $$\Var(\tilde h_i) = \frac{h_i^2}{1 - p} - h_i^2 = h_i^2\,\frac{p}{1 - p}.$$ The noise grows quickly as $p \to 1$: $p = 0.5$ gives variance $h_i^2$, $p = 0.9$ gives $9h_i^2$.` },
          ],
          takeaway: md`Inverted dropout is unbiased in expectation, so evaluation mode only has to switch it off. The scale fixes the mean, not the variance, so the training-time distribution still differs from the evaluation-time one.`,
        },
        {
          kind: 'viz',
          viz: { type: 'dl.dropout', p: 0.5, inverted: true },
          task: md`Sample a few masks and watch which units drop. Press **+100** several times and compare the running mean with the green line. Then turn inverted scaling off, reset, and repeat.`,
          caption: md`With inverted dropout the average output over masks converges to the eval-mode output $y_{\text{eval}}$. Without the scale it converges to $(1-p)\,y_{\text{eval}}$, the red line: training and evaluation would see different scales.`,
        },
        {
          kind: 'numeric',
          q: md`With inverted dropout at $p = 0.2$, a unit whose activation is $3$ is kept in this sample. What value does the next layer see?`,
          answer: { kind: 'number', value: 3.75 },
          explain: md`$3/(1 - 0.2) = 3/0.8 = 3.75$. With probability $0.2$ it would have seen 0 instead; the average is $0.8 \cdot 3.75 = 3$.`,
        },
        {
          kind: 'code',
          code: `import numpy as np

np.random.seed(0)
h = np.array([1.0, 2.0, 3.0, 4.0])
p = 0.5                                       # drop probability

def dropout(h, p):
    mask = np.random.rand(*h.shape) >= p      # keep with probability 1 - p
    return h * mask / (1 - p)                 # inverted dropout

samples = np.array([dropout(h, p) for _ in range(20000)])
print(np.round(samples.mean(axis=0), 2))`,
          note: md`The average over 20,000 masks is close to \`h\` itself. Each individual sample is either 0 or $2h_i$. Remove \`/ (1 - p)\` and the averages halve.`,
        },
        {
          kind: 'check',
          q: md`A model trained with inverted dropout ($p = 0.1$) is deployed. What should happen to dropout at inference?`,
          options: [md`Turn it off (\`model.eval()\`) and do nothing else`, md`Keep it on so that inference matches training`, md`Turn it off and multiply the activations by $0.9$`, md`Turn it off and divide the activations by $0.9$`],
          answer: 0,
          explain: md`The $1/(1-p)$ scale already made the expected training activation equal the no-dropout activation, so inference uses the network as is. Keeping dropout on makes predictions random; deliberately averaging several dropout passes (MC dropout) is a separate technique for estimating uncertainty.`,
        },
        {
          kind: 'text',
          md: md`**Data augmentation** creates new training examples by transformations that preserve the label: random crops, flips, colour jitter and mixing images (mixup, CutMix) for vision; noise, time shifts and masking for audio. It encodes known invariances and is often the most effective regularizer for vision models. The transformation must really preserve the label: flipping a digit 6 vertically gives a 9.

**Early stopping** monitors the validation loss and keeps the checkpoint with the lowest value, stopping after a "patience" of epochs without improvement. Because gradient descent starts near zero weights and moves outward, stopping early limits how far the weights travel; for quadratic losses, early-stopped gradient descent behaves much like L2 regularization.`,
        },
        {
          kind: 'viz',
          viz: { type: 'dl.losscurves', mode: 'simulate', lr: 0.3, trainN: 80, noise: 0.1, wd: 0 },
          task: md`Train with the defaults and note the best validation epoch and the final validation loss. Then try each remedy separately, resetting the others: weight decay $\lambda = 5\times10^{-3}$, 300 training examples, width 8. Predict which one helps most before you train.`,
          caption: md`The green line marks the epoch with the lowest validation loss, the checkpoint early stopping would keep. In this setting weight decay helps most (final validation loss about 0.47 instead of 0.66), more data helps less (about 0.54), and width 8 changes almost nothing: even the narrow network can memorize 80 points. With 10% label noise the validation loss cannot go below the noise entropy, about 0.33.`,
        },
        {
          kind: 'text',
          md: md`**Label smoothing** replaces the one-hot target with $$\bt = (1 - \varepsilon)\,\by + \frac{\varepsilon}{C}\mathbf 1,$$ so the true class gets $1 - \varepsilon + \varepsilon/C$ and every other class $\varepsilon/C$. With one-hot targets the cross-entropy keeps decreasing as the correct logit grows, so the network is rewarded for ever more extreme logits and overconfident probabilities. With smoothed targets the loss has a finite minimum. Label smoothing was introduced for Inception-v3 (Szegedy et al. 2016) and used with $\varepsilon = 0.1$ in the original Transformer.`,
        },
        {
          kind: 'viz',
          viz: { type: 'dl.labelsmooth', C: 5, eps: 0.1, gap: 2 },
          task: md`Drag the logit gap $\Delta$ to minimize the cross-entropy and compare it with $\Delta^*$. Then set $\varepsilon = 0$ and look for a minimum.`,
          caption: md`The logits are $(\Delta, 0, \dots, 0)$. With $\varepsilon > 0$ the loss is smallest when the softmax equals the smoothed target, at $\Delta^* = \ln\frac{1 - \varepsilon + \varepsilon/C}{\varepsilon/C}$. With $\varepsilon = 0$ the curve keeps falling: the optimum is at infinity.`,
        },
        {
          kind: 'numeric',
          q: md`With $C = 5$ classes and $\varepsilon = 0.1$, what target probability does label smoothing give the true class?`,
          answer: { kind: 'number', value: 0.92 },
          explain: md`$1 - 0.1 + 0.1/5 = 0.9 + 0.02 = 0.92$, and each of the four other classes gets $0.02$. The total is $0.92 + 4 \cdot 0.02 = 1$.`,
        },
        {
          kind: 'code',
          code: `import numpy as np

def smoothed_ce(z, y, eps):
    C = z.shape[-1]
    t = (1 - eps) * np.eye(C)[y] + eps / C      # smoothed targets
    logp = z - z.max() - np.log(np.sum(np.exp(z - z.max())))
    return -np.sum(t * logp)

z = np.array([np.log(46.0), 0.0, 0.0, 0.0, 0.0])  # logit gap ln 46
for eps in [0.0, 0.1]:
    print(eps, round(float(smoothed_ce(z, 0, eps)), 4))`,
          note: md`At the gap $\ln 46$ the softmax is $(46, 1, 1, 1, 1)/50 = (0.92, 0.02, \dots)$, exactly the smoothed target, so the smoothed loss equals the target's entropy, $0.3897$, its minimum. The unsmoothed loss $-\ln 0.92 \approx 0.0834$ would keep falling for larger gaps.`,
        },
        {
          kind: 'callout',
          tone: 'warning',
          title: 'A debugging routine for a network that does not learn',
          md: md`1. **Check shapes** at every step with asserts. Watch for silent broadcasting, such as a $(B, 1)$ prediction minus a $(B,)$ target.
2. **Check the initial loss.** With $C$ balanced classes and a small output layer it should be close to $\ln C$. Far above means overconfident initial logits; far below means the labels leak into the inputs or the loss is computed on the wrong tensor.
3. **Overfit one small batch** (say 8 to 32 examples) with regularization off. The loss should go to almost 0. If it cannot, the bug is in the model, the loss or the optimizer step (missing \`zero_grad\`, missing \`optimizer.step()\`, a detached tensor, a learning rate of 0, frozen parameters), not in the data size.
4. **Look at the data after the pipeline**: decode a few inputs with their labels after augmentation and normalization.
5. **Check gradients**: finite and nonzero for every parameter; gradient-check custom layers.
6. **Start simple**: a small model and a known-good optimizer setting (Adam at $3\times10^{-4}$ is a common default), then add one change at a time.
7. **Monitor** train and validation loss, the gradient norm, and the size of updates relative to the weights.`,
        },
        {
          kind: 'numeric',
          q: md`A 1000-class ImageNet classifier is freshly initialized with a small output layer. About what loss should the first batch show?`,
          answer: { kind: 'number', value: 6.907755, tol: 1e-3 },
          explain: md`Near-uniform predictions give $-\ln(1/1000) = \ln 1000 \approx 6.908$. A first loss of, say, 40 means the output logits start far too large; a first loss of 0.01 means something leaks the label.`,
        },
        {
          kind: 'code',
          code: `import numpy as np

pred = np.array([[0.9], [0.2], [0.4], [0.7]])   # model output, shape (4, 1)
y = np.array([1.0, 0.0, 0.0, 1.0])              # targets, shape (4,)
err = pred - y
print(err.shape)`,
          predict: {
            q: md`A regression loss is computed as \`np.mean((pred - y) ** 2)\`. What is the shape of \`pred - y\`?`,
            options: ['`(4, 4)`', '`(4,)`', '`(4, 1)`', 'an error: the shapes do not match'],
            answer: 0,
            explain: md`Broadcasting aligns shapes from the right: $(4, 1)$ against $(4,)$ becomes $(4, 4)$, every prediction minus every target. The mean of that matrix is a valid number, so nothing crashes and the model trains toward the wrong objective. \`pred.squeeze(-1)\` or \`y[:, None]\` fixes it.`,
          },
        },
        {
          kind: 'check',
          q: md`You try to overfit a single batch of 16 examples of a 10-class problem. After 500 steps the loss is still exactly $2.3026$. Which explanation fits best?`,
          options: [
            md`The parameters are not being updated (no optimizer step, learning rate 0, frozen weights, or a detached graph)`,
            md`The model is too small to memorize 16 examples`,
            md`16 examples are not enough data`,
            md`The learning rate is slightly too high`,
          ],
          answer: 0,
          explain: md`$2.3026 = \ln 10$ is the loss of uniform predictions, the value at initialization, and it has not changed at all. Any working model and optimizer can memorize 16 examples. A loss frozen at its initial value means updates are not reaching the parameters.`,
        },
        {
          kind: 'paper',
          problem: {
            id: 'dl02-3-paper',
            title: 'Four failing training runs',
            type: 'apply',
            difficulty: 2,
            minutes: 12,
            statement: md`For each symptom, give the most likely cause and the first thing you would check. The task is classification with 10 balanced classes.

(a) The loss at step 0 is 0.0004.
(b) The training loss goes down, but after a refactor the validation accuracy is 10% while the training accuracy is 99%.
(c) The loss is fine for 2000 steps, then becomes NaN. The run uses fp16.
(d) The training loss falls to 1.2 and stays there; overfitting a batch of 16 examples also stalls at 1.2.`,
            solution: [
              md`(a) Expected initial loss is $\ln 10 \approx 2.30$. A loss near 0 at step 0 means the target is visible to the model (label leakage, e.g. a label column left in the features) or the loss is computed on the wrong tensors. Check the input features and the loss call.`,
              md`(b) The model fits the training data, so the training loop works. 10% is chance level on validation: the validation pipeline differs (different normalization or tokenization, labels in a different order, shuffled labels) or the model is evaluated in the wrong mode. Decode a few validation examples with their labels and check \`model.eval()\` and the preprocessing.`,
              md`(c) Late NaNs in fp16 are typically an overflow (activations or logits above 65504) or a $\log 0$ / division by 0. Check the gradient norm and the largest activations before the NaN; use bf16 or dynamic loss scaling, clip gradients, and compute the loss from logits with a stable log-softmax.`,
              md`(d) A model that cannot overfit 16 examples has a bug or a capacity bottleneck that is not about data: for example a ReLU before the softmax output, a softmax applied twice, an output layer too small, or most units dead. Check the model definition and the output layer.`,
            ],
            rubric: [md`Uses $\ln C$ as the reference for (a)`, md`Separates training-loop bugs from evaluation-pipeline bugs in (b)`, md`Mentions overflow or log of zero and a mixed-precision remedy in (c)`, md`Uses the overfit-one-batch result to rule out the data in (d)`],
          },
        },
        {
          kind: 'explain',
          prompt: md`An interviewer asks: *your network's loss is not going down. Walk me through how you would debug it.*`,
          model: md`I would go from cheapest to most expensive checks. First, the initial loss: for $C$ balanced classes it should be about $\ln C$; very different values point to a bad output initialization or label leakage. Second, shapes and broadcasting, with asserts on every tensor. Third, try to overfit a tiny batch with regularization off; if the loss does not reach near zero, the bug is in the model, loss or optimizer step, such as a missing \`zero_grad\` or \`optimizer.step()\`, a detached tensor, a learning rate of zero, or a wrong loss input (probabilities instead of logits). Fourth, inspect a few examples after the data pipeline to make sure inputs and labels match. Then I would look at gradient norms per layer for vanishing or exploding values, sweep the learning rate over a few orders of magnitude, and only then add model complexity and regularization back one piece at a time.`,
        },
      ],
      cards: [
        { id: 'dl02-3-c1', kind: 'compute', front: md`Inverted dropout with $p = 0.5$: a kept activation of 1.5 becomes?`, answer: { kind: 'number', value: 3 }, back: md`$1.5/(1 - 0.5) = 3$.` },
        { id: 'dl02-3-c2', kind: 'concept', front: md`Why does inverted dropout divide by $1 - p$, and what happens at inference?`, back: md`$\E[m_ih_i] = (1-p)h_i$, so dividing by $1-p$ makes the expected training activation equal to $h_i$. At inference dropout is switched off with no rescaling.` },
        { id: 'dl02-3-c3', kind: 'cloze', text: md`For $C$ balanced classes, a freshly initialized classifier should start with a cross-entropy of about ln {{}}.`, answers: ['C'] },
        { id: 'dl02-3-c4', kind: 'concept', front: md`What does label smoothing do to the targets and to the optimal logits?`, back: md`Targets become $(1-\varepsilon)\by + \varepsilon/C$. The cross-entropy then has a finite minimum, at a logit gap of $\ln\frac{1-\varepsilon+\varepsilon/C}{\varepsilon/C}$, so logits stop growing without bound.` },
        { id: 'dl02-3-c5', kind: 'concept', front: md`Why is "overfit a single batch" a useful first test?`, back: md`Any correct model, loss and optimizer can memorize a few examples. If the loss does not go to near zero, the bug is in the code, not in the amount of data or the regularization.` },
      ],
    },
  ],
  problems: [
    {
      id: 'dl02-p1',
      title: 'Mean and variance under inverted dropout',
      type: 'derive',
      difficulty: 2,
      minutes: 10,
      statement: md`Let $\tilde h = mh/(1-p)$ with $m \sim \operatorname{Bernoulli}(1-p)$ and a fixed activation $h$. (a) Show $\E[\tilde h] = h$. (b) Show $\Var(\tilde h) = h^2p/(1-p)$. (c) For $\tilde y = \sum_{i=1}^{n} w_i\tilde h_i$ with independent masks, give $\E[\tilde y]$ and $\Var(\tilde y)$. Evaluate $\Var(\tilde h)$ for $h = 2$, $p = 0.5$.`,
      solution: [
        md`(a) $\E[m] = 1-p$, so $\E[\tilde h] = (1-p)h/(1-p) = h$.`,
        md`(b) $m^2 = m$, so $\E[\tilde h^2] = (1-p)h^2/(1-p)^2 = h^2/(1-p)$, and $\Var(\tilde h) = h^2/(1-p) - h^2 = h^2p/(1-p)$.`,
        md`(c) By linearity $\E[\tilde y] = \sum_i w_ih_i$. With independent masks the variances add: $\Var(\tilde y) = \frac{p}{1-p}\sum_i w_i^2h_i^2$.`,
        md`For $h = 2$, $p = 0.5$: $4 \cdot 0.5/0.5 = 4$. The sampled value is 0 or 4, each with probability $1/2$: mean 2, variance 4.`,
      ],
      answer: { kind: 'number', value: 4 },
      rubric: [md`Uses $\E[m] = 1-p$ and $m^2 = m$`, md`Correct variance formula`, md`Independence used to add variances in (c)`],
      areas: ['ml-depth'],
    },
    {
      id: 'dl02-p2',
      title: 'Reading a learning-rate schedule',
      type: 'compute',
      difficulty: 1,
      minutes: 6,
      statement: md`A run uses linear warmup over $T_w = 2000$ steps to $\eta_{\max} = 6\times10^{-4}$, then cosine decay to $\eta_{\min} = 6\times10^{-5}$ at $T = 32000$. Compute $\eta$ at $t = 1000$ and at $t = 22000$. Enter the second value.`,
      solution: [
        md`At $t = 1000 < T_w$: $\eta = 6\times10^{-4}\cdot 1000/2000 = 3\times10^{-4}$.`,
        md`At $t = 22000$: $p = (22000 - 2000)/30000 = 2/3$, and $\cos(2\pi/3) = -1/2$.`,
        md`$\eta = 6\times10^{-5} + \tfrac12(5.4\times10^{-4})(1 - \tfrac12) = 6\times10^{-5} + 1.35\times10^{-4} = 1.95\times10^{-4}$.`,
      ],
      answer: { kind: 'number', value: 1.95e-4, tol: 1e-7 },
    },
    {
      id: 'dl02-p3',
      title: 'What bias correction is for',
      type: 'compute',
      difficulty: 2,
      minutes: 8,
      statement: md`Adam with $\beta_1 = 0.9$, $\beta_2 = 0.999$, $\epsilon \approx 0$ and **no** bias correction takes its first step with $\mathbf{m}_1/\sqrt{\bv_1}$. By what factor is that step larger than $\eta$? Explain why the correction matters most in the first few hundred steps.`,
      hints: [md`$\mathbf{m}_1 = 0.1\,\bg$ and $\bv_1 = 0.001\,\bg^2$.`],
      solution: [
        md`$\mathbf{m}_1 = (1 - \beta_1)\bg = 0.1\bg$ and $\bv_1 = (1-\beta_2)\bg^2 = 0.001\bg^2$.`,
        md`$|\mathbf{m}_1|/\sqrt{\bv_1} = 0.1|\bg|/(\sqrt{0.001}|\bg|) = 0.1/0.0316 \approx 3.16$. The first step is about $3.16\eta$ per coordinate.`,
        md`Both averages start at 0 and are biased toward it; $\bv$ forgets slowly ($\beta_2 = 0.999$ averages over about 1000 steps), so it stays too small for hundreds of steps and the uncorrected steps are too large. Dividing by $1 - \beta^t$ removes the bias; its effect fades as $\beta^t \to 0$.`,
      ],
      answer: { kind: 'number', value: 3.16227766, tol: 1e-3 },
    },
    {
      id: 'dl02-p4',
      title: 'LayerNorm with a gain and a bias',
      type: 'compute',
      difficulty: 1,
      minutes: 6,
      statement: md`Compute $\operatorname{LN}(\bx)$ for $\bx = (5, -1, 7, 5)$ with $\gamma = 2$, $\beta = 1$ (the same for every feature) and $\epsilon = 0$.`,
      solution: [
        md`Mean: $(5 - 1 + 7 + 5)/4 = 4$. Deviations: $(1, -5, 3, 1)$.`,
        md`Variance: $(1 + 25 + 9 + 1)/4 = 9$, so $\sigma = 3$ and $\hat\bx = (1/3, -5/3, 1, 1/3)$.`,
        md`$\by = 2\hat\bx + 1 = (5/3, -7/3, 3, 5/3)$.`,
      ],
      answer: { kind: 'vector', value: [5 / 3, -7 / 3, 3, 5 / 3] },
    },
    {
      id: 'dl02-p5',
      title: 'BatchNorm running statistics',
      type: 'compute',
      difficulty: 1,
      minutes: 6,
      statement: md`A BatchNorm feature starts with running mean 0 and momentum 0.1, so $\mu_{\text{run}} \leftarrow 0.9\,\mu_{\text{run}} + 0.1\,\mu_{\text{batch}}$. Two training batches have feature means 2 and 4. What running mean is used if you evaluate now? Why might evaluation accuracy be poor right after a short fine-tuning run on a new domain?`,
      solution: [
        md`After batch 1: $0.9\cdot 0 + 0.1\cdot 2 = 0.2$. After batch 2: $0.9\cdot0.2 + 0.1\cdot 4 = 0.18 + 0.4 = 0.58$.`,
        md`Evaluation normalizes with $0.58$, although the recent batches had means 2 and 4: the running estimate lags behind.`,
        md`After a short run on a new domain the running statistics still mostly reflect the old domain, so evaluation-mode normalization is off. Common fixes are recomputing the statistics with a pass over new-domain data in training mode without updating weights, or freezing BatchNorm statistics during fine-tuning.`,
      ],
      answer: { kind: 'number', value: 0.58 },
    },
    {
      id: 'dl02-p6',
      title: 'Where 65504 comes from',
      type: 'compute',
      difficulty: 2,
      minutes: 8,
      statement: md`IEEE fp16 has 1 sign bit, 5 exponent bits with bias 15 (exponent field 31 reserved for inf/NaN), and 10 mantissa bits with an implicit leading 1. Derive the largest finite value, the smallest positive normal value and the spacing between consecutive numbers in $[1024, 2048)$. Enter the largest finite value.`,
      solution: [
        md`The largest usable exponent field is 30, so the exponent is $30 - 15 = 15$. The largest mantissa is $1.1111111111_2 = 2 - 2^{-10}$.`,
        md`Largest value: $(2 - 2^{-10})\cdot 2^{15} = 65536 - 32 = 65504$.`,
        md`Smallest normal: exponent field 1, exponent $-14$, mantissa 1: $2^{-14} \approx 6.1\times10^{-5}$.`,
        md`In $[1024, 2048) = [2^{10}, 2^{11})$ the spacing is $2^{10 - 10} = 1$: fp16 cannot represent 1024.5. Accumulating many small values in fp16 loses them, which is why sums and optimizer states are kept in fp32.`,
      ],
      answer: { kind: 'number', value: 65504 },
    },
    {
      id: 'dl02-p7',
      title: 'Residual blocks keep a path of length one',
      type: 'proof',
      difficulty: 2,
      minutes: 10,
      statement: md`Scalar residual blocks $x_{l+1} = x_l + f_l(x_l)$ have local derivatives $a_l = f_l'(x_l)$. (a) Prove $\dfrac{\partial x_L}{\partial x_0} = \prod_{l=0}^{L-1}(1 + a_l)$. (b) Show that when all $a_l \ge 0$ this is at least 1, while the plain chain $x_{l+1} = f_l(x_l)$ gives $\prod_l a_l$. (c) Give an example where residual blocks still lead to exploding gradients, and say how architectures prevent it.`,
      solution: [
        md`(a) $\dfrac{dx_{l+1}}{dx_l} = 1 + a_l$, and the chain rule multiplies these factors over $l = 0, \dots, L-1$.`,
        md`(b) Expanding, $\prod(1 + a_l) = 1 + \sum_l a_l + \sum_{l<m}a_la_m + \dots \ge 1$ when all $a_l \ge 0$; the plain chain keeps only the last term $\prod a_l$, which is tiny when the $a_l$ are small.`,
        md`(c) If every $a_l = 0.5$ and $L = 50$, the product is $1.5^{50} \approx 6.4\times10^8$: residual stacks can explode too. Architectures keep each branch small at initialization (zero-initialized or $1/\sqrt{L}$-scaled last layers, normalization inside the branch) so that $a_l \approx 0$ early in training.`,
      ],
      rubric: [md`Chain rule over the blocks`, md`Expansion showing the constant term 1`, md`A correct exploding example and a remedy`],
      areas: ['ml-depth', 'math'],
    },
    {
      id: 'dl02-p8',
      title: 'The optimal logit gap under label smoothing',
      type: 'derive',
      difficulty: 3,
      minutes: 12,
      statement: md`A $C$-class softmax has logits $(\Delta, 0, \dots, 0)$, and the target is $\bt = (1-\varepsilon)\by + \varepsilon/C$ with class 1 true. (a) Show that the cross-entropy is $\ln(e^\Delta + C - 1) - t_1\Delta$ with $t_1 = 1 - \varepsilon + \varepsilon/C$. (b) Find the minimizing $\Delta^*$. (c) Evaluate it for $C = 5$, $\varepsilon = 0.1$, and explain what happens as $\varepsilon \to 0$.`,
      solution: [
        md`(a) With $Z = e^\Delta + C - 1$: $\ln p_1 = \Delta - \ln Z$ and $\ln p_k = -\ln Z$ for $k \ne 1$. So $L = -t_1(\Delta - \ln Z) - (1 - t_1)(-\ln Z) = \ln Z - t_1\Delta$.`,
        md`(b) $\dfrac{dL}{d\Delta} = \dfrac{e^\Delta}{Z} - t_1 = p_1 - t_1$. Setting it to zero: $p_1 = t_1$, so the softmax matches the target. Then $p_k = t_k = \varepsilon/C$ for the others, and $e^{\Delta^*} = p_1/p_k = t_1/(\varepsilon/C)$, giving $\Delta^* = \ln\dfrac{1 - \varepsilon + \varepsilon/C}{\varepsilon/C}$. $L$ is convex in $\Delta$, so this is the minimum.`,
        md`(c) $t_1 = 0.92$, $\varepsilon/C = 0.02$: $\Delta^* = \ln 46 \approx 3.83$. As $\varepsilon \to 0$, $\Delta^* \to \infty$: plain cross-entropy pushes the logit gap without bound.`,
      ],
      answer: { kind: 'number', value: 3.828641396, tol: 1e-3 },
      rubric: [md`Correct loss in terms of $\Delta$`, md`Derivative $p_1 - t_1$ and the condition $\bp = \bt$`, md`Closed form for $\Delta^*$ and the limit $\varepsilon \to 0$`],
      areas: ['ml-depth'],
    },
    {
      id: 'dl02-p9',
      title: 'Choosing a normalization',
      type: 'concept',
      difficulty: 2,
      minutes: 8,
      statement: md`For each setting, choose BatchNorm, LayerNorm or RMSNorm and justify it in one or two sentences: (a) a ResNet for image classification trained with batch size 256 on 8 GPUs; (b) the same ResNet fine-tuned on a single GPU with batch size 4; (c) a decoder-only language model served at batch size 1 with a KV cache; (d) a time-series transformer whose sequences are padded to a common length.`,
      solution: [
        md`(a) BatchNorm: per-device batches of 32 give reliable statistics, convolutional features share statistics across spatial positions, and it is the standard choice for ResNets.`,
        md`(b) BatchNorm statistics from 4 examples are noisy. Freeze the BatchNorm layers (use the running statistics) or switch to a batch-independent norm such as GroupNorm.`,
        md`(c) RMSNorm or LayerNorm: each token is normalized alone, inference at batch size 1 behaves exactly like training, and there is nothing to estimate across a batch. RMSNorm is the common current choice.`,
        md`(d) LayerNorm or RMSNorm: padding positions would contaminate BatchNorm's statistics across the batch and time axes; per-token normalization is unaffected by padding.`,
      ],
      rubric: [md`Batch-size dependence of BatchNorm identified`, md`Inference at batch size 1 handled`, md`Padding argument for (d)`],
    },
  ],
};
