import { md, type Module } from '../types';

export const MODULE: Module = {
  id: 'calc03',
  part: 'calc',
  order: 3,
  title: 'Information theory and optimization',
  summary: 'Entropy, cross-entropy and KL divergence; cross-entropy loss and perplexity; gradient descent, learning rates and conditioning; SGD, momentum, RMSProp, Adam and AdamW; learning-rate schedules.',
  relevance: md`Cross-entropy is the training loss of essentially every classifier and language model, perplexity is how language models are compared, and KL divergence appears in knowledge distillation, variational autoencoders and the KL penalty of RLHF and DPO-style fine-tuning. Every model is trained by a variant of gradient descent, most large ones by AdamW with warmup and cosine decay. Interviews ask why cross-entropy rather than squared error, why a large learning rate diverges, and how Adam differs from SGD.`,
  areas: ['math', 'ml-depth', 'llm'],
  prereqs: ['calc01', 'calc02'],
  lessons: [
    // ------------------------------------------------------------------ 3.1
    {
      id: 'calc03-1',
      title: 'Entropy, cross-entropy and KL divergence',
      minutes: 40,
      objectives: [
        'Compute the entropy of a discrete distribution in bits or nats and interpret it as uncertainty or average code length.',
        'Compute cross-entropy and KL divergence, and explain why KL is non-negative and not symmetric.',
        'Show that cross-entropy loss is the negative log-likelihood of a categorical model, and derive the softmax gradient p − y.',
        'Convert between average cross-entropy loss and perplexity.',
      ],
      cells: [
        {
          kind: 'text',
          md: md`A language model assigns a probability to every possible next token. A good model puts high probability on what actually comes next; it is "surprised" as little as possible. Information theory makes surprise a number: an event of probability $p$ carries $-\log p$ units of information. A fair coin flip is $-\log_2\frac12 = 1$ bit; an event with probability $\frac18$ is 3 bits; a certain event is 0 bits.

With $\log_2$ the unit is the **bit**, with the natural log the **nat**; $1 \text{ nat} = 1/\ln 2 \approx 1.443$ bits. Deep learning frameworks use nats.`,
        },
        {
          kind: 'callout',
          tone: 'definition',
          title: 'Entropy',
          md: md`The entropy of a discrete distribution $p$ is the expected surprise, $$H(p) = -\sum_i p_i\log p_i = \E_{X\sim p}[-\log p(X)],$$ with the convention $0\log 0 = 0$. For $K$ outcomes, $0 \le H(p) \le \log K$: zero for a certain outcome, maximal for the uniform distribution. $H(p)$ in bits is the smallest possible average length, in bits per symbol, of a code for symbols drawn from $p$.`,
        },
        {
          kind: 'callout',
          tone: 'example',
          title: 'Worked example',
          md: md`$p = (\frac12, \frac14, \frac18, \frac18)$ over $a, b, c, d$. Surprises: 1, 2, 3, 3 bits. $H(p) = \frac12\cdot 1 + \frac14\cdot 2 + \frac18\cdot 3 + \frac18\cdot 3 = 1.75$ bits. The prefix code $a = 0$, $b = 10$, $c = 110$, $d = 111$ achieves exactly 1.75 bits per symbol on average, against 2 bits for a fixed-length code.`,
        },
        {
          kind: 'numeric',
          q: md`Compute the entropy, in bits, of $p = (\frac14, \frac14, \frac12)$.`,
          answer: { kind: 'number', value: 1.5 },
          explain: md`$\frac14\cdot 2 + \frac14\cdot 2 + \frac12\cdot 1 = 1.5$ bits.`,
        },
        {
          kind: 'callout',
          tone: 'definition',
          title: 'Cross-entropy and KL divergence',
          md: md`For distributions $p$ (the truth) and $q$ (a model) on the same outcomes: $$H(p, q) = -\sum_i p_i\log q_i, \qquad \KL(p\,\|\,q) = \sum_i p_i\log\frac{p_i}{q_i} = H(p, q) - H(p).$$ $H(p, q)$ is the average code length when symbols come from $p$ but the code was built for $q$. $\KL(p\,\|\,q)$ is the extra cost of using the wrong code. It satisfies $\KL(p\,\|\,q) \ge 0$, with equality only when $p = q$. It is **not symmetric**, and it is infinite if $q_i = 0$ for some outcome with $p_i > 0$.`,
        },
        {
          kind: 'viz',
          viz: { type: 'calc.entropy', p: [0.5, 0.25, 0.125, 0.125], q: [0.25, 0.25, 0.25, 0.25], unit: 'bits' },
          task: md`With $q$ uniform, check that $H(p, q) = H(p) + \KL(p\,\|\,q)$. Then drag $q$'s bar for $d$ down to 0: what happens to $\KL(p\,\|\,q)$, and what happens to $\KL(q\,\|\,p)$? Finally press **q = p**.`,
          caption: md`With uniform $q$, $H(p, q) = 2$ bits (a fixed-length code), $H(p) = 1.75$ and $\KL(p\,\|\,q) = 0.25$. Setting $q_d = 0$ makes $\KL(p\,\|\,q)$ infinite, because $p$ produces $d$ and $q$ calls it impossible, while $\KL(q\,\|\,p)$ stays finite. The table shows the terms $p_i\log(p_i/q_i)$: some are negative, but the sum is not.`,
        },
        {
          kind: 'numeric',
          q: md`Let $p = (\frac12, \frac12)$ and $q = (\frac14, \frac34)$. Compute $\KL(p\,\|\,q)$ and $\KL(q\,\|\,p)$ in bits. Enter both.`,
          answer: { kind: 'vector', value: [0.207519, 0.188722], tol: 1e-3 },
          inputHint: 'two numbers, e.g. 0.21, 0.19',
          hints: [md`$\KL(p\,\|\,q) = \frac12\log_2\frac{1/2}{1/4} + \frac12\log_2\frac{1/2}{3/4}$, and $\log_2\frac23 \approx -0.585$.`],
          explain: md`$\KL(p\,\|\,q) = \frac12(1) + \frac12(-0.585) \approx 0.2075$. $\KL(q\,\|\,p) = \frac14\log_2\frac12 + \frac34\log_2\frac32 = -0.25 + 0.75(0.585) \approx 0.1887$. Different numbers: KL is not a distance.`,
        },
        {
          kind: 'derive',
          title: 'KL divergence is non-negative (Gibbs\' inequality)',
          goal: md`Show $\KL(p\,\|\,q) \ge 0$, with equality only if $p = q$.`,
          steps: [
            { md: md`Work in nats and sum over the outcomes with $p_i > 0$: $-\KL(p\,\|\,q) = \sum_i p_i\ln\frac{q_i}{p_i}$.` },
            {
              md: md`Use $\ln x \le x - 1$ for $x > 0$, with equality only at $x = 1$: $$\sum_i p_i\ln\frac{q_i}{p_i} \le \sum_i p_i\left(\frac{q_i}{p_i} - 1\right) = \sum_i q_i - \sum_i p_i.$$`,
              choose: {
                prompt: md`Which elementary inequality bounds $\ln(q_i/p_i)$ from above by something whose $p$-weighted sum is easy?`,
                options: [md`$\ln x \le x - 1$`, md`$\ln x \ge 1 - 1/x$`, md`$\ln x \le x^2$`],
                answer: 0,
                explain: md`The tangent line of $\ln$ at $x = 1$ lies above the curve (ln is concave). Multiplying $\frac{q_i}{p_i} - 1$ by $p_i$ leaves $q_i - p_i$, which sums to something $\le 0$.`,
              },
            },
            { md: md`$\sum_i p_i = 1$ and $\sum_i q_i \le 1$ (the sum runs only over the support of $p$), so the right side is $\le 0$. Hence $\KL(p\,\|\,q) \ge 0$.` },
            { md: md`Equality needs $q_i/p_i = 1$ for every $i$ with $p_i > 0$, and $\sum q_i = 1$ over those $i$: that is $q = p$.` },
          ],
          takeaway: md`Consequences: $H(p, q) \ge H(p)$, so no model can beat the true distribution's cross-entropy; and $H(p) \le \log K$ (apply Gibbs with $q$ uniform).`,
        },
        {
          kind: 'check',
          q: md`Fitting a model $q_\theta$ to data from $p$ by maximum likelihood minimizes $\KL(p\,\|\,q_\theta)$. What does this "forward" KL penalize most heavily?`,
          options: [md`Giving near-zero probability to outcomes that actually occur under $p$`, md`Giving probability to outcomes that never occur under $p$`, md`Having higher entropy than $p$`, md`Nothing; KL is symmetric so both directions behave the same`],
          answer: 0,
          explain: md`The term $p_i\log(p_i/q_i)$ blows up when $p_i > 0$ and $q_i \to 0$. So maximum likelihood produces mass-covering models that spread probability over everything seen. The reverse direction $\KL(q\,\|\,p)$ instead penalizes $q$ putting mass where $p$ has none, and tends to lock onto one mode; it appears in variational inference.`,
        },
        {
          kind: 'text',
          md: md`**Cross-entropy as a classification loss.** A classifier outputs logits $\bz \in \R^K$ and probabilities $\bq = \softmax(\bz)$, $q_k = e^{z_k}/\sum_j e^{z_j}$. The target is the one-hot vector $\be_y$ of the true class. The cross-entropy between target and prediction is $$H(\be_y, \bq) = -\sum_k [k = y]\log q_k = -\log q_y.$$ Averaged over a dataset this is exactly the negative log-likelihood of a categorical model, so minimizing cross-entropy **is** maximum likelihood. Since $H(\be_y) = 0$, it is also the KL divergence from the empirical labels to the model.`,
        },
        {
          kind: 'viz',
          viz: { type: 'calc.xent', z: [2, 1, 0], y: 1 },
          task: md`The true class is dog. Raise $z_{\text{dog}}$ until the loss is below 0.1. Which logits does a gradient-descent step push up, and which down? Then raise all three logits by the same amount and check that nothing changes.`,
          caption: md`The gradient with respect to the logits is $\bp - \be_y$: positive (push down) for every wrong class, in proportion to its probability, and $p_y - 1$ (push up) for the true class. When the model is confidently wrong, $p_y \approx 0$ and the gradient is close to $-1$: the loss $-\ln p_y$ is steep exactly where the model most needs to move.`,
        },
        {
          kind: 'derive',
          title: 'the gradient of softmax cross-entropy',
          goal: md`For $L = -\log\softmax(\bz)_y$, show $\pd{L}{z_k} = p_k - [k = y]$, where $\bp = \softmax(\bz)$.`,
          steps: [
            { md: md`Write the loss without the fraction: $L = -\log\dfrac{e^{z_y}}{\sum_j e^{z_j}} = -z_y + \log\sum_j e^{z_j}$.` },
            {
              md: md`Differentiate the log-sum-exp term: $\pd{}{z_k}\log\sum_j e^{z_j} = \dfrac{e^{z_k}}{\sum_j e^{z_j}} = p_k$.`,
              choose: {
                prompt: md`What is $\partial/\partial z_k$ of $\log\sum_j e^{z_j}$?`,
                options: [md`$e^{z_k}/\sum_j e^{z_j}$, which is $p_k$`, md`$1/\sum_j e^{z_j}$`, md`$z_k$`],
                answer: 0,
                explain: md`Chain rule: $\frac{1}{\sum_j e^{z_j}}$ times the derivative of the sum, which is $e^{z_k}$. The gradient of log-sum-exp is the softmax.`,
              },
            },
            { md: md`The first term contributes $-1$ when $k = y$ and $0$ otherwise. Together: $\pd{L}{z_k} = p_k - [k = y]$, or $\nabla_\bz L = \bp - \be_y$.` },
          ],
          takeaway: md`The softmax's own Jacobian cancels against the log, leaving prediction minus target, the same form as for logistic regression. Squared error on softmax outputs does not cancel this way, and its gradient vanishes when the model saturates on a wrong answer.`,
        },
        {
          kind: 'numeric',
          q: md`Logits $\bz = (2, 1, 0)$ for classes (cat, dog, bird), and the true class is cat. Compute the cross-entropy loss in nats.`,
          answer: { kind: 'number', value: 0.407606, tol: 1e-3 },
          hints: [md`$L = -z_y + \ln(e^2 + e^1 + e^0)$.`],
          explain: md`$\ln(e^2 + e + 1) = \ln(7.389 + 2.718 + 1) = \ln 11.107 \approx 2.4076$, so $L = -2 + 2.4076 = 0.4076$. Equivalently $p_{\text{cat}} \approx 0.665$ and $-\ln 0.665 \approx 0.408$.`,
        },
        {
          kind: 'text',
          md: md`**Perplexity.** A language model's quality is reported as the average cross-entropy per token, $\bar L$ in nats, or as the **perplexity** $\text{PPL} = e^{\bar L}$ ($= 2^{\bar L}$ if $\bar L$ is in bits). A model that is uniformly unsure among $V$ tokens has loss $\ln V$ and perplexity $V$, so perplexity reads as an effective number of equally likely choices per token. Loss differences are what matter: lowering the loss by $0.1$ nats divides the perplexity by $e^{0.1} \approx 1.105$. Perplexities are only comparable between models with the same tokenizer.`,
        },
        {
          kind: 'numeric',
          q: md`A language model has average cross-entropy 2.5 nats per token on a test set. What is its perplexity?`,
          answer: { kind: 'number', value: Math.exp(2.5), tol: 1e-3 },
          explain: md`$e^{2.5} \approx 12.18$: on average the model is as uncertain as a uniform choice among about 12 tokens.`,
        },
        {
          kind: 'paper',
          problem: {
            id: 'calc03-1-paper',
            title: 'The uniform distribution has maximum entropy',
            type: 'proof',
            difficulty: 2,
            minutes: 8,
            statement: md`Let $p$ be a distribution on $K$ outcomes and $u$ the uniform distribution. Show that $\KL(p\,\|\,u) = \log K - H(p)$, and conclude that $H(p) \le \log K$ with equality only for $p = u$.`,
            hints: [md`Substitute $u_i = 1/K$ into the definition of KL and split the log.`],
            solution: [
              md`$\KL(p\,\|\,u) = \sum_i p_i\log\frac{p_i}{1/K} = \sum_i p_i\log p_i + \sum_i p_i\log K$.`,
              md`The first sum is $-H(p)$ and the second is $\log K\sum_i p_i = \log K$. So $\KL(p\,\|\,u) = \log K - H(p)$.`,
              md`By Gibbs' inequality $\KL(p\,\|\,u) \ge 0$, so $H(p) \le \log K$, with equality exactly when $p = u$.`,
            ],
            rubric: [md`Substitutes $u_i = 1/K$ correctly`, md`Identifies $-H(p)$ and $\log K$`, md`Invokes non-negativity of KL and its equality case`],
            areas: ['math'],
          },
        },
        {
          kind: 'code',
          code: `import numpy as np

p = np.array([0.5, 0.25, 0.125, 0.125])
q = np.full(4, 0.25)
print(round(float(np.sum(p * np.log2(p / q))), 3))`,
          predict: {
            q: md`This is $\KL(p\,\|\,q)$ in bits for the distributions in the figure. What is printed?`,
            options: ['`0.25`', '`1.75`', '`2.0`', '`-0.25`'],
            answer: 0,
            explain: md`$H(p, q) - H(p) = 2 - 1.75 = 0.25$ bits. $1.75$ is $H(p)$ and $2.0$ is $H(p, q)$.`,
          },
        },
        {
          kind: 'exercise',
          ex: {
            id: 'calc03-1-ex',
            title: 'A numerically stable softmax cross-entropy',
            prompt: md`Implement \`softmax_xent(Z, y)\` for logits \`Z\` of shape \`(N, K)\` and integer labels \`y\` of shape \`(N,)\`. Return \`(loss, dZ)\`: the mean cross-entropy in nats and its gradient with respect to \`Z\`, which is $(P - Y)/N$ with $P = \softmax(Z)$ row-wise and $Y$ one-hot. Subtract each row's maximum before exponentiating, so that logits of 1000 do not overflow. No Python loops.`,
            starter: `import numpy as np

def softmax_xent(Z, y):
    N = Z.shape[0]
    E = np.exp(Z)
    P = E / E.sum(axis=1, keepdims=True)
    loss = -np.mean(np.log(P[np.arange(N), y]))
    dZ = np.zeros_like(Z)     # TODO
    return loss, dZ

Z = np.array([[2.0, 1.0, 0.0], [0.0, 3.0, -1.0]])
y = np.array([0, 2])
loss, dZ = softmax_xent(Z, y)
print(round(float(loss), 4))`,
            solution: `import numpy as np

def softmax_xent(Z, y):
    N = Z.shape[0]
    S = Z - Z.max(axis=1, keepdims=True)
    log_P = S - np.log(np.exp(S).sum(axis=1, keepdims=True))
    loss = -np.mean(log_P[np.arange(N), y])
    dZ = np.exp(log_P)
    dZ[np.arange(N), y] -= 1
    return loss, dZ / N

Z = np.array([[2.0, 1.0, 0.0], [0.0, 3.0, -1.0]])
y = np.array([0, 2])
loss, dZ = softmax_xent(Z, y)
print(round(float(loss), 4))`,
            tests: [
              { expr: 'round(float(softmax_xent(Z, y)[0]), 5)', label: 'mean loss' },
              { expr: 'np.round(softmax_xent(Z, y)[1], 5).tolist()', label: 'gradient (P - Y)/N' },
              { expr: 'round(float(softmax_xent(np.array([[1000.0, 0.0, -1000.0]]), np.array([1]))[0]), 4)', label: 'large logits do not overflow' },
            ],
            hints: [md`$\log\softmax(\bz)_k = (z_k - m) - \log\sum_j e^{z_j - m}$ for any constant $m$; take $m = \max_j z_j$.`, md`\`P[np.arange(N), y]\` picks one entry per row. For the gradient, copy $P$ and subtract 1 at those positions, then divide by $N$.`],
            mustExclude: ['for '],
          },
        },
        {
          kind: 'recall',
          prompt: md`Write the definitions of $H(p)$, $H(p, q)$ and $\KL(p\,\|\,q)$, the relation between them, and the gradient of softmax cross-entropy with respect to the logits.`,
          answer: md`$H(p) = -\sum p_i\log p_i$; $H(p, q) = -\sum p_i\log q_i$; $\KL(p\,\|\,q) = \sum p_i\log(p_i/q_i) = H(p, q) - H(p) \ge 0$. Gradient: $\bp - \be_y$.`,
        },
      ],
      cards: [
        { id: 'calc03-1-c1', kind: 'concept', front: md`Define entropy, cross-entropy and KL divergence, and relate them.`, back: md`$H(p) = -\sum p\log p$; $H(p,q) = -\sum p\log q$; $\KL(p\,\|\,q) = H(p,q) - H(p) \ge 0$.` },
        { id: 'calc03-1-c2', kind: 'compute', front: md`Entropy, in bits, of a uniform distribution over 8 outcomes.`, answer: { kind: 'number', value: 3 }, back: md`$\log_2 8 = 3$ bits.` },
        { id: 'calc03-1-c3', kind: 'cloze', text: md`The gradient of softmax cross-entropy with respect to the logits is $\bp$ minus the {{}} vector of the label.`, answers: ['one-hot'] },
        { id: 'calc03-1-c4', kind: 'compute', front: md`Average loss 1.0 nat per token. Perplexity?`, answer: { kind: 'number', value: Math.E }, back: md`$e^{1} \approx 2.718$.` },
        { id: 'calc03-1-c5', kind: 'concept', front: md`When is $\KL(p\,\|\,q)$ infinite, and is KL symmetric?`, back: md`When $q_i = 0$ for some outcome with $p_i > 0$. It is not symmetric: $\KL(p\,\|\,q) \ne \KL(q\,\|\,p)$ in general.` },
      ],
    },
    // ------------------------------------------------------------------ 3.2
    {
      id: 'calc03-2',
      title: 'Gradient descent, learning rates and conditioning',
      minutes: 35,
      objectives: [
        'Write the gradient-descent update and recognize the four learning-rate regimes: too small, good, oscillating and divergent.',
        'Derive the stability condition η < 2/λmax for a quadratic and the per-direction contraction factor 1 − ηλᵢ.',
        'Relate the convergence speed on a quadratic to the condition number κ = λmax/λmin.',
        'Distinguish convex from non-convex objectives and explain why saddle points slow gradient descent.',
      ],
      cells: [
        {
          kind: 'text',
          md: md`Gradient descent repeats one move: step against the gradient. To understand when it converges and how fast, it is enough to study quadratics, because near a minimum every smooth loss is approximately quadratic (the second-order Taylor expansion of lesson 1.3), with the Hessian playing the role of the matrix.`,
        },
        {
          kind: 'callout',
          tone: 'definition',
          title: 'Gradient descent',
          md: md`Starting from $\bw_0$, repeat $$\bw_{k+1} = \bw_k - \eta\,\nabla L(\bw_k).$$ The **learning rate** (step size) $\eta > 0$ is the main hyperparameter. A step is guaranteed to decrease $L$ only when $\eta$ is small compared with the curvature.`,
        },
        {
          kind: 'viz',
          viz: { type: 'calc.gd1d', eta: 0.3, lambda: 1 },
          task: md`With $\lambda = 1$, find values of $\eta$ that give slow convergence, convergence in one step, oscillating convergence, and divergence. Where are the boundaries? Then set $\lambda = 2$ and find them again.`,
          caption: md`On $f(x) = \frac\lambda2 x^2$ every step multiplies $x$ by $1 - \eta\lambda$. Small $\eta$: a factor just below 1, slow. $\eta = 1/\lambda$: factor 0, done in one step. $1/\lambda < \eta < 2/\lambda$: a negative factor, so the iterate jumps across the minimum each step but still shrinks. $\eta > 2/\lambda$: $|1 - \eta\lambda| > 1$ and every step overshoots further. Doubling the curvature halves every boundary.`,
        },
        {
          kind: 'derive',
          title: 'the stability condition on a quadratic',
          goal: md`For $f(\bx) = \frac12\bx\T A\bx$ with $A$ symmetric positive definite, eigenvalues $\lambda_1 \ge \dots \ge \lambda_n > 0$ and orthonormal eigenvectors $\mathbf{q}_i$, find when gradient descent converges and how fast.`,
          steps: [
            { md: md`$\nabla f = A\bx$, so $\bx_{k+1} = \bx_k - \eta A\bx_k = (I - \eta A)\,\bx_k$.` },
            {
              md: md`Expand in the eigenbasis: $\bx_k = \sum_i c_i^{(k)}\mathbf{q}_i$. Since $A\mathbf{q}_i = \lambda_i\mathbf{q}_i$, each coefficient evolves on its own: $$c_i^{(k+1)} = (1 - \eta\lambda_i)\,c_i^{(k)}, \qquad c_i^{(k)} = (1 - \eta\lambda_i)^k c_i^{(0)}.$$`,
              choose: {
                prompt: md`Why does it help to write $\bx_k$ in the eigenvectors of $A$?`,
                options: [md`$I - \eta A$ acts on each eigenvector by a scalar, so the directions decouple into $n$ one-dimensional problems`, md`The eigenvectors are where the minimum is`, md`It makes $A$ the identity`],
                answer: 0,
                explain: md`$(I - \eta A)\mathbf{q}_i = (1 - \eta\lambda_i)\mathbf{q}_i$. In this basis the matrix is diagonal, as in the eigenvalues module.`,
              },
            },
            {
              md: md`All coefficients shrink iff $|1 - \eta\lambda_i| < 1$ for every $i$, i.e. $0 < \eta < 2/\lambda_i$ for all $i$. The binding constraint is the largest eigenvalue: $$\eta < \frac{2}{\lambda_{\max}}.$$`,
              choose: {
                prompt: md`Which eigenvalue limits the learning rate?`,
                options: [md`The largest, $\lambda_{\max}$: the steepest direction overshoots first`, md`The smallest, $\lambda_{\min}$`, md`Their average`],
                answer: 0,
                explain: md`$2/\lambda_i$ is smallest for the largest $\lambda_i$, so the most curved direction sets the limit.`,
              },
            },
            { md: md`With the natural choice $\eta = 1/\lambda_{\max}$, the slowest direction shrinks by $1 - \lambda_{\min}/\lambda_{\max} = 1 - 1/\kappa$ per step, where $\kappa = \lambda_{\max}/\lambda_{\min}$ is the **condition number**. Reducing that component by a factor $e$ takes about $\kappa$ steps. The best fixed step, $\eta = 2/(\lambda_{\max} + \lambda_{\min})$, gives the rate $(\kappa - 1)/(\kappa + 1)$, still about $1 - 2/\kappa$.` },
          ],
          takeaway: md`The steepest direction caps the learning rate; the flattest direction sets the speed. The ratio of the two curvatures, the condition number, decides how many steps gradient descent needs.`,
        },
        {
          kind: 'check',
          q: md`Gradient descent on $f(x) = 2x^2$. Which learning rate diverges?`,
          options: [md`$\eta = 0.55$`, md`$\eta = 0.45$`, md`$\eta = 0.25$`, md`$\eta = 0.1$`],
          answer: 0,
          explain: md`$f'' = \lambda = 4$, so the limit is $2/4 = 0.5$. $\eta = 0.25 = 1/\lambda$ converges in one step, $0.45$ oscillates but converges, $0.55$ gives the factor $1 - 2.2 = -1.2$ and diverges.`,
        },
        {
          kind: 'viz',
          viz: { type: 'calc.gd', fn: 'quad', eta: 1, kappa: 10, start: [-2.5, 1.5], steps: 100 },
          task: md`With $\kappa = 10$ and $\eta = 1$, read how many steps it takes to reach $f < 10^{-6}f_0$. Set $\kappa = 40$ and raise the step count: how many now? Then push $\eta$ above 2.`,
          caption: md`The grey arrows mark the steep and shallow eigendirections. The steep component is gone after one step, but the shallow one shrinks by only $1 - 1/\kappa$ per step: about 59 steps for $\kappa = 10$ and 222 for $\kappa = 40$ from this start, roughly proportional to $\kappa$. Above $\eta = 2$ the path zig-zags outward along the steep direction.`,
        },
        {
          kind: 'numeric',
          q: md`The Hessian of a quadratic loss has eigenvalues 8 and 2. Give the largest stable learning rate, and the factor by which the slow component shrinks per step when $\eta = 1/8$. Enter both.`,
          answer: { kind: 'vector', value: [0.25, 0.75] },
          explain: md`$2/\lambda_{\max} = 2/8 = 0.25$. With $\eta = 1/8$ the slow direction ($\lambda = 2$) shrinks by $1 - 2/8 = 0.75$ per step; $\kappa = 4$.`,
        },
        {
          kind: 'callout',
          tone: 'intuition',
          title: 'Conditioning in practice',
          md: md`Ill-conditioning is why feature scaling matters for gradient-trained models: features on wildly different scales give a Hessian like $X\T X$ with very different eigenvalues, and gradient descent zig-zags across the narrow direction while crawling along the long one. Standardizing inputs, normalization layers (BatchNorm, LayerNorm, RMSNorm), careful initialization and per-parameter adaptive step sizes (Adam, lesson 3.3) all improve the effective conditioning.`,
        },
        {
          kind: 'paper',
          problem: {
            id: 'calc03-2-paper',
            title: 'Two steps by hand',
            type: 'compute',
            difficulty: 1,
            minutes: 8,
            statement: md`Run two steps of gradient descent with $\eta = 0.1$ on $f(x, y) = x^2 + 4y^2$ from $(2, 1)$. Report $f$ after each step and the point after step two. What is the largest stable learning rate for this function? Enter the point after two steps.`,
            solution: [
              md`$\nabla f = (2x, 8y)$. At $(2, 1)$: $(4, 8)$. Step: $(2, 1) - 0.1(4, 8) = (1.6, 0.2)$, with $f = 2.56 + 0.16 = 2.72$ (down from 8).`,
              md`At $(1.6, 0.2)$: $\nabla f = (3.2, 1.6)$. Step: $(1.6 - 0.32, 0.2 - 0.16) = (1.28, 0.04)$, with $f = 1.6384 + 0.0064 = 1.6448$.`,
              md`Per step $x$ is multiplied by $1 - 0.2 = 0.8$ and $y$ by $1 - 0.8 = 0.2$: the steep $y$-direction converges fast, the shallow $x$-direction slowly.`,
              md`The Hessian is $\diag(2, 8)$, so the largest stable learning rate is $2/8 = 0.25$.`,
            ],
            answer: { kind: 'vector', value: [1.28, 0.04] },
          },
        },
        {
          kind: 'text',
          md: md`**Convex versus non-convex.** For a convex loss (PSD Hessian everywhere, lesson 1.3), every local minimum is global, and gradient descent with a suitable learning rate converges to a global minimum. Linear and logistic regression are convex in their weights. Neural network losses are not: they have many minima, flat regions, and many **saddle points**, critical points where the Hessian has both positive and negative eigenvalues. Gradient descent started exactly on a saddle's stable directions converges to the saddle; started nearby, it escapes along the negative-curvature direction, but slowly, because the gradient near a saddle is small. In high dimensions most critical points with high loss are saddles rather than local minima, and the gradient noise of SGD helps to move off them.`,
        },
        {
          kind: 'viz',
          viz: { type: 'calc.gd', fn: 'wells', eta: 0.1, start: [0, 1.8], steps: 100 },
          task: md`Start exactly on the vertical axis, $\bx_0 = (0, 1.8)$: where does gradient descent end up? Move the start a little to the side, to $x = 0.05$, and watch how long the path lingers near the saddle at the origin before it falls into a well.`,
          caption: md`$f(x, y) = \frac12(x^2 - 1)^2 + y^2$ has minima at $(\pm 1, 0)$ and a saddle at the origin with Hessian $\diag(-2, 2)$. On the axis $x = 0$ the $x$-gradient is exactly zero, so the path slides straight into the saddle. Off the axis, the small $x$-component grows by about $1 + 2\eta$ per step, so it takes many steps to get away.`,
        },
        {
          kind: 'check',
          q: md`At a critical point, the Hessian has eigenvalues $3$ and $-0.5$. Gradient descent with $\eta = 0.1$ starts very close to it. What happens?`,
          options: [md`It drifts away along the eigenvector of $-0.5$, growing by a factor $1.05$ per step, slowly at first`, md`It converges to the point, since the gradient there is zero`, md`It diverges immediately, since one eigenvalue is negative`, md`It stays exactly where it is`],
          answer: 0,
          explain: md`Near the point the update is $\bx \leftarrow (I - \eta H)\bx$. Along the $-0.5$ eigenvector the factor is $1 + 0.05$, so that component grows slowly; along the $3$ eigenvector it shrinks by $0.7$. Only a start exactly on the stable direction converges to the saddle.`,
        },
        {
          kind: 'code',
          code: `import numpy as np

def gd_steps(kappa, eta=1.0, tol=1e-6):
    A = np.diag([1.0, 1.0 / kappa])
    x = np.array([1.0, 1.0])
    f0 = 0.5 * x @ A @ x
    for k in range(100000):
        if 0.5 * x @ A @ x < tol * f0:
            return k
        x = x - eta * A @ x
    return None

print(gd_steps(10), gd_steps(100))`,
          predict: {
            q: md`Gradient descent with $\eta = 1/\lambda_{\max}$ on quadratics with condition number 10 and 100. Which pair of step counts is printed?`,
            options: ['`55 458`', '`55 55`', '`55 5500`', '`6 10`'],
            answer: 0,
            explain: md`The slow component shrinks by $1 - 1/\kappa$ per step, so the count grows roughly in proportion to $\kappa$ (the $\log\kappa$ term in the target makes it a little less than $10\times$).`,
          },
        },
        {
          kind: 'explain',
          prompt: md`Explain to an interviewer why a learning rate that is too large makes training diverge, using the quadratic model of the loss.`,
          model: md`Near a minimum the loss is approximately quadratic, $L(\bw^* + \bd) \approx L^* + \frac12\bd\T H\bd$, so a gradient step maps the error $\bd$ to $(I - \eta H)\bd$. Along a Hessian eigenvector with curvature $\lambda$ the error is multiplied by $1 - \eta\lambda$. If $\eta > 2/\lambda$ that factor has magnitude above 1: the step jumps past the minimum to a point farther away on the other side, and the next step overshoots by more. The most curved direction fails first, so the limit is $\eta < 2/\lambda_{\max}$. In practice this shows up as the loss oscillating and then blowing up, often to NaN, and the fixes are a smaller learning rate, warmup, gradient clipping, or better conditioning.`,
        },
      ],
      cards: [
        { id: 'calc03-2-c1', kind: 'concept', front: md`On a quadratic with Hessian eigenvalues $\lambda_i$, what is the stability condition for gradient descent, and what is the per-step factor along eigenvector $i$?`, back: md`$\eta < 2/\lambda_{\max}$. Along eigenvector $i$ the error is multiplied by $1 - \eta\lambda_i$.` },
        { id: 'calc03-2-c2', kind: 'compute', front: md`$f(x) = 5x^2$. Largest stable learning rate?`, answer: { kind: 'number', value: 0.2 }, back: md`$\lambda = f'' = 10$, so $\eta < 2/10 = 0.2$.` },
        { id: 'calc03-2-c3', kind: 'cloze', text: md`The number of gradient-descent steps on a quadratic grows roughly in proportion to the {{}} number $\lambda_{\max}/\lambda_{\min}$.`, answers: ['condition'] },
        { id: 'calc03-2-c4', kind: 'concept', front: md`What is a saddle point and why does it slow gradient descent?`, back: md`A critical point whose Hessian has both positive and negative eigenvalues. The gradient near it is small, so steps are small, and escaping along the negative-curvature direction takes many iterations.` },
        { id: 'calc03-2-c5', kind: 'compute', front: md`$f(x) = \frac12 x^2$, $\eta = 1.5$, $x_0 = 1$. Compute $x_2$.`, answer: { kind: 'number', value: 0.25 }, back: md`Each step multiplies by $1 - 1.5 = -0.5$: $x_1 = -0.5$, $x_2 = 0.25$. Oscillating but converging.` },
      ],
    },
    // ------------------------------------------------------------------ 3.3
    {
      id: 'calc03-3',
      title: 'Stochastic and adaptive optimizers',
      minutes: 40,
      objectives: [
        'Explain why a minibatch gradient is an unbiased but noisy estimate of the full gradient, with variance shrinking like 1/B.',
        'Write the update rules of momentum, RMSProp and Adam, including Adam\'s bias correction.',
        'Explain decoupled weight decay (AdamW) and how it differs from adding an L2 penalty inside Adam.',
        'Describe linear warmup and cosine decay and the reasons for each.',
        'Implement one Adam step in NumPy and run it.',
      ],
      cells: [
        {
          kind: 'text',
          md: md`The loss of a model is an average over the training set, $L(\btheta) = \frac1n\sum_{i=1}^n \ell_i(\btheta)$. Its exact gradient needs a pass over all $n$ examples, which for billions of tokens is far too expensive per step. **Stochastic gradient descent** instead estimates the gradient from a small random **minibatch** and takes many cheap, noisy steps.`,
        },
        {
          kind: 'callout',
          tone: 'definition',
          title: 'Minibatch SGD',
          md: md`Sample a batch $\mathcal B$ of $B$ examples and step with $$\mathbf g = \frac1B\sum_{i\in\mathcal B}\nabla\ell_i(\btheta), \qquad \btheta \leftarrow \btheta - \eta\,\mathbf g.$$ Over the random choice of batch, $\E[\mathbf g] = \nabla L(\btheta)$: the estimate is **unbiased**. Its covariance is about $\Sigma/B$, where $\Sigma$ is the covariance of single-example gradients; the cost of a step is proportional to $B$.`,
        },
        {
          kind: 'viz',
          viz: { type: 'calc.minibatch', theta: [0, 3], logB: 3 },
          task: md`Set $B = 1$ and look at the spread of the minibatch arrows. Then try $B = 4, 16, 64$: by how much does the spread shrink each time? Finally drag $\boldsymbol\theta$ to the minimum near $(2, 1)$: the full gradient vanishes there. Does the noise?`,
          caption: md`The thin arrows average to the thick one, and the measured spread tracks $\sigma^2/B$ (times a finite-population factor). At the minimum the average gradient is zero, but single examples still disagree, so SGD with a fixed learning rate keeps jittering around the minimum instead of settling. That is one reason to decay the learning rate.`,
        },
        {
          kind: 'derive',
          title: 'why the noise falls like 1/B',
          goal: md`Let $\mathbf g_1, \dots, \mathbf g_B$ be per-example gradients drawn independently (with replacement), each with mean $\nabla L$ and $\E\lVert\mathbf g_i - \nabla L\rVert^2 = \sigma^2$. Show that their average $\mathbf g$ has $\E\lVert\mathbf g - \nabla L\rVert^2 = \sigma^2/B$.`,
          steps: [
            { md: md`$\mathbf g - \nabla L = \frac1B\sum_i(\mathbf g_i - \nabla L)$, a sum of independent zero-mean vectors.` },
            {
              md: md`Expand the squared norm: $\E\lVert\mathbf g - \nabla L\rVert^2 = \frac{1}{B^2}\sum_{i,j}\E[(\mathbf g_i - \nabla L)\T(\mathbf g_j - \nabla L)]$. Independence and zero mean kill every $i \ne j$ term.`,
              choose: {
                prompt: md`What happens to the cross terms $i \ne j$?`,
                options: [md`They vanish: independent, zero-mean terms have zero expected inner product`, md`They add another $\sigma^2$ each`, md`They cancel only when $B$ is even`],
                answer: 0,
                explain: md`$\E[\mathbf a\T\mathbf b] = \E[\mathbf a]\T\E[\mathbf b] = 0$ for independent zero-mean $\mathbf a, \mathbf b$. This is the vector version of "variances of independent variables add" from lesson 2.1.`,
              },
            },
            { md: md`The $B$ diagonal terms each contribute $\sigma^2$: the total is $B\sigma^2/B^2 = \sigma^2/B$. Sampling without replacement from $n$ examples multiplies this by $(n - B)/(n - 1)$, which is 0 at $B = n$.` },
          ],
          takeaway: md`Exactly the $\sigma^2/n$ of a sample mean. Doubling the batch halves the gradient variance but doubles the cost per step, which is why very large batches give diminishing returns per example.`,
        },
        {
          kind: 'check',
          q: md`You double the batch size from 256 to 512 and keep everything else fixed. What happens to the standard deviation of the minibatch gradient's noise?`,
          options: [md`It is divided by about $\sqrt2$`, md`It is halved`, md`It is unchanged`, md`It doubles`],
          answer: 0,
          explain: md`The variance is divided by 2, so the standard deviation by $\sqrt2 \approx 1.41$. Batch size and learning rate together set the noise scale of SGD, which is why changing one often means retuning the other.`,
        },
        {
          kind: 'callout',
          tone: 'definition',
          title: 'Momentum, RMSProp and Adam',
          md: md`Operations on vectors are element-wise; $\mathbf g_t$ is the (minibatch) gradient at step $t$.

- **Momentum** (heavy ball): $\bv_t = \beta\bv_{t-1} + \mathbf g_t$, $\ \btheta_t = \btheta_{t-1} - \eta\,\bv_t$, typically $\beta = 0.9$. A running sum of past gradients: components that flip sign cancel, consistent ones build up to $1/(1-\beta) = 10\times$.
- **RMSProp**: $\bs_t = \rho\,\bs_{t-1} + (1-\rho)\,\mathbf g_t^2$, $\ \btheta_t = \btheta_{t-1} - \eta\,\mathbf g_t/(\sqrt{\bs_t} + \epsilon)$. Each coordinate's step is divided by the recent root-mean-square of its gradient.
- **Adam** combines both: $$\mathbf m_t = \beta_1\mathbf m_{t-1} + (1-\beta_1)\mathbf g_t, \quad \bv_t = \beta_2\bv_{t-1} + (1-\beta_2)\mathbf g_t^2,$$ $$\hat{\mathbf m}_t = \frac{\mathbf m_t}{1 - \beta_1^t}, \quad \hat\bv_t = \frac{\bv_t}{1 - \beta_2^t}, \quad \btheta_t = \btheta_{t-1} - \eta\,\frac{\hat{\mathbf m}_t}{\sqrt{\hat\bv_t} + \epsilon},$$ with defaults $\beta_1 = 0.9$, $\beta_2 = 0.999$, $\epsilon = 10^{-8}$, and $\mathbf m_0 = \bv_0 = \bzero$.`,
        },
        {
          kind: 'derive',
          title: 'Adam\'s bias correction',
          goal: md`Show that $\mathbf m_t$ underestimates the average gradient by the factor $1 - \beta_1^t$ early in training, and see what goes wrong without the correction.`,
          steps: [
            { md: md`Unroll the recursion from $\mathbf m_0 = \bzero$: $\mathbf m_t = (1 - \beta_1)\sum_{s=1}^t\beta_1^{t-s}\mathbf g_s$.` },
            {
              md: md`If the gradients are all equal to $\mathbf g$, the geometric sum gives $\mathbf m_t = (1 - \beta_1)\dfrac{1 - \beta_1^t}{1 - \beta_1}\mathbf g = (1 - \beta_1^t)\,\mathbf g$.`,
              choose: {
                prompt: md`What is $\sum_{s=1}^t\beta_1^{t-s}$?`,
                options: [md`$\dfrac{1 - \beta_1^t}{1 - \beta_1}$`, md`$\dfrac{1}{1 - \beta_1}$`, md`$t\,\beta_1$`],
                answer: 0,
                explain: md`It is $1 + \beta_1 + \dots + \beta_1^{t-1}$, a finite geometric series. Only as $t \to \infty$ does it approach $1/(1 - \beta_1)$.`,
              },
            },
            { md: md`So dividing by $1 - \beta_1^t$ removes the bias toward the zero initialization. The same holds for $\bv_t$ with $\beta_2$; since $\beta_2 = 0.999$, its bias lasts for thousands of steps.` },
            { md: md`Without correction, step 1 uses $\mathbf m_1 = 0.1\,\mathbf g_1$ and $\sqrt{\bv_1} = \sqrt{0.001}\,|\mathbf g_1| \approx 0.0316\,|\mathbf g_1|$, so the step is about $3.16\,\eta$ per coordinate, over three times larger than intended. With correction it is $\eta\,\mathbf g_1/|\mathbf g_1|$: exactly $\eta$ per coordinate.` },
          ],
          takeaway: md`Both moment estimates start at zero and are biased toward it; the second moment is biased far longer. The correction makes early steps the intended size. Warmup addresses a related problem: early second-moment estimates are noisy.`,
        },
        {
          kind: 'numeric',
          q: md`Adam with default $\beta_1, \beta_2$ and $\eta = 0.01$ takes its first step with gradient $\mathbf g_1 = (4, -0.02)$. Ignoring $\epsilon$, what is the update $\btheta_1 - \btheta_0$?`,
          answer: { kind: 'vector', value: [-0.01, 0.01] },
          hints: [md`After bias correction, $\hat{\mathbf m}_1 = \mathbf g_1$ and $\hat\bv_1 = \mathbf g_1^2$.`],
          explain: md`$\hat{\mathbf m}_1/\sqrt{\hat\bv_1} = \mathbf g_1/|\mathbf g_1| = (1, -1)$, so the update is $-0.01\,(1, -1) = (-0.01, 0.01)$. Both coordinates move by the same amount although their gradients differ by a factor of 200: Adam's first step has size $\eta$ in every coordinate, independent of the gradient's scale.`,
        },
        {
          kind: 'viz',
          viz: { type: 'calc.optim', problem: 'ravine' },
          task: md`Press **Replay** on the ravine and compare the loss curves. Then set the learning-rate multiplier to ×2: which optimizer diverges, and why that one? Add gradient noise, then switch to **Rosenbrock**.`,
          caption: md`The ravine $f = \frac12(0.1x^2 + 10y^2)$ has $\kappa = 100$. Plain GD needs $\eta < 2/10$ for the steep $y$-direction and then crawls along $x$; doubling its rate to $0.3$ breaks the bound. Momentum accumulates the consistent $x$-gradient, and Adam rescales each coordinate. RMSProp without momentum takes steps of about $\eta$ per coordinate even next to the minimum, so with a fixed learning rate it hovers at a floor instead of converging. Each optimizer uses its own hand-tuned learning rate and the slider scales all of them, so the comparison is between reasonable settings of each method. On Rosenbrock the minimum $(1, 1)$ sits at the end of a curved valley, which per-coordinate scaling cannot straighten.`,
        },
        {
          kind: 'callout',
          tone: 'definition',
          title: 'Weight decay in Adam: AdamW',
          md: md`Adding an L2 penalty $\frac\lambda2\lVert\btheta\rVert^2$ to the loss adds $\lambda\btheta$ to the gradient. In SGD that shrinks every weight by the same factor $(1 - \eta\lambda)$ per step. In Adam the extra $\lambda\btheta$ is divided by $\sqrt{\hat\bv}$, so weights with large or noisy gradients are barely decayed. **AdamW** decouples the decay from the adaptive scaling: $$\btheta_t = \btheta_{t-1} - \eta\left(\frac{\hat{\mathbf m}_t}{\sqrt{\hat\bv_t} + \epsilon} + \lambda\,\btheta_{t-1}\right),$$ where the gradient used for $\mathbf m$ and $\bv$ contains no decay term. AdamW is the standard optimizer for training transformers, typically with weight decay around 0.1 and with biases and normalization gains often excluded from decay.`,
        },
        {
          kind: 'check',
          q: md`What is the practical difference between "Adam with L2 regularization" and AdamW?`,
          options: [md`With L2 in the loss, the decay is divided by $\sqrt{\hat\bv}$, so parameters with large gradients are regularized less; AdamW applies the same relative decay to every parameter`, md`There is none; both add $\lambda\btheta$ to the gradient`, md`AdamW does not use the second moment`, md`AdamW only decays the biases`],
          answer: 0,
          explain: md`For plain SGD the two formulations coincide. For adaptive methods they do not, and decoupled decay was found to regularize more predictably and to make the best weight decay less dependent on the learning rate.`,
        },
        {
          kind: 'text',
          md: md`**Learning-rate schedules.** The learning rate is usually varied over training:

- **Warmup**: increase $\eta$ linearly from near 0 to its peak over the first steps (commonly a few hundred to a few thousand, or a few percent of training). At the start the weights are random and Adam's second-moment estimates rest on few samples, so full-size steps can destabilize training; transformers are particularly sensitive.
- **Decay**: SGD with a fixed $\eta$ ends in a noise ball whose size grows with $\eta$ (the jitter in the minibatch figure). Lowering $\eta$ late in training shrinks it. **Cosine decay** follows $\eta_{\min} + \frac12(\eta_{\max} - \eta_{\min})(1 + \cos\pi u)$, where $u$ runs from 0 to 1 after warmup, commonly ending near 10% of the peak. Step decay (divide by 10 at fixed epochs) is the older convention for CNNs; linear decay is also common.

Linear warmup followed by cosine decay is the typical recipe for pre-training large language models with AdamW.`,
        },
        {
          kind: 'viz',
          viz: { type: 'calc.schedule', kind: 'cosine', warmup: 0.05, minRatio: 0.1 },
          task: md`Read $\eta(t)$ at steps 500, 5000 and 9990. Then compare cosine with linear decay between the same endpoints: which one keeps a high learning rate for longer?`,
          caption: md`With 10,000 steps, 5% warmup and a floor of 10% of the peak $3\times10^{-4}$: the peak is reached at step 500, the rate at step 5000 is about $1.76\times10^{-4}$, and it ends near $3\times10^{-5}$. Cosine stays near the peak longer at the start of the decay and flattens out at the end.`,
        },
        {
          kind: 'paper',
          problem: {
            id: 'calc03-3-paper',
            title: 'Momentum on a constant gradient',
            type: 'derive',
            difficulty: 2,
            minutes: 8,
            statement: md`Momentum uses $\bv_t = \beta\bv_{t-1} + \mathbf g_t$, $\btheta_t = \btheta_{t-1} - \eta\bv_t$, with $\bv_0 = \bzero$. Suppose the gradient is a constant $\mathbf g$ (a long, straight slope). Find $\bv_t$ in closed form and its limit, and compute the effective step multiplier after 3 steps and in the limit for $\beta = 0.9$. Enter the limiting multiplier.`,
            solution: [
              md`Unroll: $\bv_t = \mathbf g(1 + \beta + \dots + \beta^{t-1}) = \dfrac{1 - \beta^t}{1 - \beta}\,\mathbf g$.`,
              md`As $t \to \infty$, $\bv_t \to \mathbf g/(1 - \beta)$: the step becomes $\eta\mathbf g/(1 - \beta)$, an effective learning rate $\eta/(1 - \beta)$.`,
              md`For $\beta = 0.9$: after 3 steps the multiplier is $1 + 0.9 + 0.81 = 2.71$; the limit is $1/(1 - 0.9) = 10$.`,
              md`On an oscillating gradient, $+\mathbf g, -\mathbf g, \dots$, the same sum alternates and stays bounded near $\mathbf g/(1 + \beta) \approx 0.53\,\mathbf g$ in size, so momentum amplifies consistent directions about $19\times$ more than oscillating ones.`,
            ],
            answer: { kind: 'number', value: 10 },
            rubric: [md`Correct geometric-series form of $\bv_t$`, md`Limit $\mathbf g/(1 - \beta)$ and its interpretation as an effective learning rate`, md`Numerical multipliers 2.71 and 10`],
            areas: ['ml-depth'],
          },
        },
        {
          kind: 'exercise',
          ex: {
            id: 'calc03-3-ex',
            title: 'Implement one Adam step',
            prompt: md`Implement \`adam_step(theta, g, m, v, t, lr=0.1, b1=0.9, b2=0.999, eps=1e-8)\` returning the new \`(theta, m, v)\` as in the definition above, with \`t\` counting from 1. The code below then runs 200 Adam steps on the ravine $f(\btheta) = \frac12(0.1\,\theta_1^2 + 10\,\theta_2^2)$ from $(-2.8, 1)$.`,
            starter: `import numpy as np

def adam_step(theta, g, m, v, t, lr=0.1, b1=0.9, b2=0.999, eps=1e-8):
    # TODO: update m and v, bias-correct them, and take the step
    theta = theta - lr * g
    return theta, m, v

a = np.array([0.1, 10.0])
theta = np.array([-2.8, 1.0])
m = np.zeros(2)
v = np.zeros(2)
for t in range(1, 201):
    g = a * theta
    theta, m, v = adam_step(theta, g, m, v, t)
print(np.round(theta, 4))`,
            solution: `import numpy as np

def adam_step(theta, g, m, v, t, lr=0.1, b1=0.9, b2=0.999, eps=1e-8):
    m = b1 * m + (1 - b1) * g
    v = b2 * v + (1 - b2) * g * g
    m_hat = m / (1 - b1 ** t)
    v_hat = v / (1 - b2 ** t)
    theta = theta - lr * m_hat / (np.sqrt(v_hat) + eps)
    return theta, m, v

a = np.array([0.1, 10.0])
theta = np.array([-2.8, 1.0])
m = np.zeros(2)
v = np.zeros(2)
for t in range(1, 201):
    g = a * theta
    theta, m, v = adam_step(theta, g, m, v, t)
print(np.round(theta, 4))`,
            tests: [
              { expr: '[np.round(x, 6).tolist() for x in adam_step(np.array([1.0, -2.0]), np.array([4.0, -0.02]), np.zeros(2), np.zeros(2), 1)]', label: 'first step from zero moments' },
              { expr: '[np.round(x, 6).tolist() for x in adam_step(np.array([0.5, 0.5]), np.array([1.0, 2.0]), np.array([0.2, 0.1]), np.array([0.01, 0.04]), 3, lr=0.01)]', label: 'a later step with existing moments' },
              { expr: 'np.round(theta, 4).tolist()', label: 'after 200 steps on the ravine' },
            ],
            hints: [md`Update the moments first, then form \`m_hat = m / (1 - b1 ** t)\` and \`v_hat = v / (1 - b2 ** t)\`.`, md`The step is \`lr * m_hat / (np.sqrt(v_hat) + eps)\`, element-wise. Return the updated \`m\` and \`v\` (not the corrected ones).`],
          },
        },
        {
          kind: 'explain',
          prompt: md`An interviewer asks: *Adam or SGD with momentum: which would you use, and why?*`,
          model: md`Adam adapts a per-parameter step size from running estimates of the gradient's first and second moments, so it is robust to badly scaled or sparse gradients and needs less learning-rate tuning; with decoupled weight decay (AdamW) and warmup plus cosine decay it is the default for transformers and most large models. Its costs are two extra state tensors per parameter (memory, which matters for large models and motivates 8-bit or factored variants) and, in some vision settings, slightly worse generalization than well-tuned SGD with momentum, which is still common for CNNs trained from scratch. I would start with AdamW for anything transformer-based or with heterogeneous parameter scales, and consider SGD with momentum when memory is tight or when strong, well-understood SGD baselines exist for the task.`,
        },
      ],
      cards: [
        { id: 'calc03-3-c1', kind: 'concept', front: md`Write Adam's update, including bias correction.`, back: md`$\mathbf m \leftarrow \beta_1\mathbf m + (1-\beta_1)\mathbf g$; $\bv \leftarrow \beta_2\bv + (1-\beta_2)\mathbf g^2$; $\hat{\mathbf m} = \mathbf m/(1-\beta_1^t)$, $\hat\bv = \bv/(1-\beta_2^t)$; $\btheta \leftarrow \btheta - \eta\,\hat{\mathbf m}/(\sqrt{\hat\bv} + \epsilon)$.` },
        { id: 'calc03-3-c2', kind: 'concept', front: md`How does AdamW differ from Adam with an L2 penalty?`, back: md`AdamW subtracts $\eta\lambda\btheta$ directly, outside the adaptive scaling. With L2 in the loss, the decay term is divided by $\sqrt{\hat\bv}$, so parameters with large gradients are decayed less.` },
        { id: 'calc03-3-c3', kind: 'compute', front: md`Momentum with $\beta = 0.95$ on a constant gradient: limiting effective learning-rate multiplier?`, answer: { kind: 'number', value: 20 }, back: md`$1/(1 - 0.95) = 20$.` },
        { id: 'calc03-3-c4', kind: 'cloze', text: md`The variance of a minibatch gradient falls like one over the {{}} size.`, answers: ['batch'] },
        { id: 'calc03-3-c5', kind: 'concept', front: md`Why warm up the learning rate, and why decay it?`, back: md`Warmup: early on the weights are random and Adam's moment estimates are noisy, so full-size steps can destabilize training. Decay: with a fixed rate SGD noise keeps the iterate jittering around the minimum; a smaller rate late in training reduces that noise.` },
      ],
    },
  ],
  problems: [
    {
      id: 'calc03-p1',
      title: 'Entropy of a biased coin',
      type: 'compute',
      difficulty: 1,
      minutes: 4,
      statement: md`Compute the entropy in bits of a coin with $\P(\text{heads}) = 0.9$.`,
      solution: [
        md`$H = -0.9\log_2 0.9 - 0.1\log_2 0.1$.`,
        md`$\log_2 0.9 \approx -0.152$ and $\log_2 0.1 \approx -3.322$, so $H \approx 0.137 + 0.332 = 0.469$ bits, well below the 1 bit of a fair coin.`,
      ],
      answer: { kind: 'number', value: -(0.9 * Math.log2(0.9) + 0.1 * Math.log2(0.1)), tol: 1e-3 },
    },
    {
      id: 'calc03-p2',
      title: 'Cross-entropy of a classifier on three examples',
      type: 'compute',
      difficulty: 1,
      minutes: 5,
      statement: md`A classifier assigns probabilities $0.7$, $0.5$ and $0.1$ to the true classes of three examples. Compute the average cross-entropy loss in nats.`,
      solution: [
        md`Per-example losses: $-\ln 0.7 \approx 0.357$, $-\ln 0.5 \approx 0.693$, $-\ln 0.1 \approx 2.303$.`,
        md`Average: $(0.357 + 0.693 + 2.303)/3 \approx 1.118$ nats. The one confident mistake dominates.`,
      ],
      answer: { kind: 'number', value: -(Math.log(0.7) + Math.log(0.5) + Math.log(0.1)) / 3, tol: 1e-3 },
    },
    {
      id: 'calc03-p3',
      title: 'Why not squared error on probabilities?',
      type: 'derive',
      difficulty: 3,
      minutes: 15,
      statement: md`For binary classification with $p = \sigma(z)$ and label $y = 1$, compare the gradients with respect to the logit $z$ of (a) cross-entropy $-\log p$ and (b) squared error $\frac12(p - 1)^2$. Evaluate both at $z = -5$ (a confident wrong prediction). Enter $[\text{(a)}, \text{(b)}]$.`,
      hints: [md`$\sigma'(z) = \sigma(z)(1 - \sigma(z))$ and $\sigma(-5) \approx 0.00669$.`],
      solution: [
        md`(a) $\frac{d}{dz}(-\log\sigma(z)) = -\frac{\sigma'(z)}{\sigma(z)} = -(1 - \sigma(z)) = p - 1$.`,
        md`(b) $\frac{d}{dz}\frac12(\sigma(z) - 1)^2 = (\sigma(z) - 1)\,\sigma(z)(1 - \sigma(z)) = -p(1-p)^2$.`,
        md`At $z = -5$, $p \approx 0.00669$: (a) $\approx -0.9933$, (b) $\approx -0.00669\cdot 0.9867 \approx -0.00660$.`,
        md`The squared-error gradient is about 150 times smaller exactly when the model is most wrong, because the sigmoid's saturation factor $p(1-p)$ does not cancel. Cross-entropy cancels it and keeps a gradient of size about 1, so learning does not stall.`,
      ],
      answer: { kind: 'vector', value: [-(1 - 1 / (1 + Math.exp(5))), -(1 / (1 + Math.exp(5))) * (1 - 1 / (1 + Math.exp(5))) ** 2], tol: 1e-3 },
      rubric: [md`Correct derivative of the cross-entropy, simplified to $p - 1$`, md`Correct chain rule for the squared error, keeping the $p(1-p)$ factor`, md`Numerical values at $z = -5$`, md`Explains the saturation argument`],
      areas: ['ml-depth'],
    },
    {
      id: 'calc03-p4',
      title: 'Cross-entropy decomposes',
      type: 'proof',
      difficulty: 2,
      minutes: 8,
      statement: md`Prove that $H(p, q) = H(p) + \KL(p\,\|\,q)$, and explain why minimizing the average cross-entropy loss over a model $q_\theta$ is equivalent to minimizing $\KL(p_{\text{data}}\,\|\,q_\theta)$.`,
      solution: [
        md`$H(p) + \KL(p\,\|\,q) = -\sum_i p_i\log p_i + \sum_i p_i(\log p_i - \log q_i) = -\sum_i p_i\log q_i = H(p, q)$.`,
        md`In training, $p = p_{\text{data}}$ is fixed by the dataset, so $H(p_{\text{data}})$ is a constant that does not depend on $\theta$.`,
        md`Therefore $\argmin_\theta H(p_{\text{data}}, q_\theta) = \argmin_\theta\KL(p_{\text{data}}\,\|\,q_\theta)$. The lowest achievable cross-entropy is $H(p_{\text{data}})$, reached only when $q_\theta = p_{\text{data}}$.`,
      ],
      rubric: [md`Algebraic identity shown term by term`, md`Notes that $H(p_{\text{data}})$ does not depend on the parameters`, md`States the equivalence of the minimizers and the lower bound`],
      areas: ['math', 'ml-depth'],
    },
    {
      id: 'calc03-p5',
      title: 'Perplexity and loss',
      type: 'compute',
      difficulty: 1,
      minutes: 4,
      statement: md`Model A has perplexity 20 and model B has perplexity 16 on the same test set with the same tokenizer. What is the difference in their average cross-entropy, in nats per token?`,
      solution: [md`$\bar L = \ln\text{PPL}$, so $\bar L_A - \bar L_B = \ln 20 - \ln 16 = \ln 1.25$.`, md`$\ln 1.25 \approx 0.223$ nats per token.`],
      answer: { kind: 'number', value: Math.log(1.25), tol: 1e-3 },
      areas: ['llm'],
    },
    {
      id: 'calc03-p6',
      title: 'Choosing a learning rate for least squares',
      type: 'apply',
      difficulty: 2,
      minutes: 10,
      statement: md`For $L(\bw) = \frac1n\lVert X\bw - \by\rVert^2$, the Hessian is $\frac2n X\T X$. Suppose $\frac1n X\T X$ has eigenvalues $50$ and $0.5$. What is the largest stable learning rate for gradient descent, and roughly how many steps are needed per factor-$e$ reduction of the slowest error component if $\eta = 1/\lambda_{\max}$? Enter the largest stable learning rate.`,
      solution: [
        md`The Hessian eigenvalues are $2\cdot 50 = 100$ and $2\cdot 0.5 = 1$, so $\eta < 2/100 = 0.02$.`,
        md`With $\eta = 0.01$, the slow component shrinks by $1 - 1/100 = 0.99$ per step; reducing it by a factor $e$ takes about $100$ steps ($0.99^{100} \approx e^{-1}$).`,
        md`Standardizing the features would bring the two eigenvalues much closer and cut the step count by roughly the same factor as $\kappa$ falls.`,
      ],
      answer: { kind: 'number', value: 0.02 },
    },
    {
      id: 'calc03-p7',
      title: 'One step of each optimizer',
      type: 'compute',
      difficulty: 2,
      minutes: 10,
      statement: md`One parameter starts at $\theta_0 = 1$ with gradient $g_1 = 2$ at step 1. Compute $\theta_1$ for (a) SGD with $\eta = 0.1$, (b) momentum with $\eta = 0.1$, $\beta = 0.9$, $v_0 = 0$, (c) Adam with $\eta = 0.1$ and default betas, ignoring $\epsilon$. Enter $[\text{(a)}, \text{(b)}, \text{(c)}]$.`,
      solution: [
        md`(a) $1 - 0.1\cdot 2 = 0.8$.`,
        md`(b) $v_1 = 0.9\cdot 0 + 2 = 2$, so $\theta_1 = 1 - 0.1\cdot 2 = 0.8$. Momentum only differs from SGD after the first step.`,
        md`(c) $m_1 = 0.2$, $v_1 = 0.004$; $\hat m_1 = 2$, $\hat v_1 = 4$; step $= 0.1\cdot 2/2 = 0.1$, so $\theta_1 = 0.9$. Adam's first step has size $\eta$ whatever the gradient's magnitude.`,
      ],
      answer: { kind: 'vector', value: [0.8, 0.8, 0.9] },
    },
    {
      id: 'calc03-p8',
      title: 'Escaping a saddle',
      type: 'apply',
      difficulty: 2,
      minutes: 8,
      statement: md`Near a saddle point the loss is $f(x, y) = \frac12(x^2 - y^2)$. Gradient descent with $\eta = 0.1$ starts at $(1, 10^{-6})$. After how many steps does $|y|$ first exceed $1$? Enter the step count.`,
      hints: [md`Each step multiplies $y$ by $1 + \eta = 1.1$ and $x$ by $1 - \eta = 0.9$.`],
      solution: [
        md`$\nabla f = (x, -y)$, so $x_{k+1} = 0.9x_k$ and $y_{k+1} = 1.1y_k$.`,
        md`$|y_k| = 1.1^k\cdot 10^{-6} > 1$ needs $k > \ln(10^6)/\ln 1.1 = 13.8155/0.09531 \approx 144.95$, so $k = 145$ steps.`,
        md`Meanwhile $x$ has decayed to $0.9^{145} \approx 2\times10^{-7}$: for over a hundred steps the iterate sits near the saddle with a tiny gradient, which looks like a plateau in the loss curve. Gradient noise would supply a larger initial $y$ and shorten the escape.`,
      ],
      answer: { kind: 'number', value: 145 },
      areas: ['ml-depth'],
    },
    {
      id: 'calc03-p9',
      title: 'Adam\'s first step without bias correction',
      type: 'derive',
      difficulty: 2,
      minutes: 8,
      statement: md`Show that, without bias correction, Adam's first update (from $\mathbf m_0 = \bv_0 = \bzero$, ignoring $\epsilon$) has magnitude $\eta(1 - \beta_1)/\sqrt{1 - \beta_2}$ per coordinate. Evaluate the factor for $\beta_1 = 0.9$, $\beta_2 = 0.999$.`,
      solution: [
        md`$\mathbf m_1 = (1 - \beta_1)\mathbf g_1$ and $\bv_1 = (1 - \beta_2)\mathbf g_1^2$.`,
        md`Uncorrected step: $\eta\,\mathbf m_1/\sqrt{\bv_1} = \eta\,\dfrac{1 - \beta_1}{\sqrt{1 - \beta_2}}\,\dfrac{\mathbf g_1}{|\mathbf g_1|}$, so each coordinate moves by $\eta(1 - \beta_1)/\sqrt{1 - \beta_2}$.`,
        md`For the defaults: $0.1/\sqrt{0.001} = 0.1/0.03162 \approx 3.162$. The first step would be over three times the intended size; the correction factors $1/(1 - \beta_1)$ and $1/\sqrt{1 - \beta_2}$ cancel this.`,
      ],
      answer: { kind: 'number', value: 0.1 / Math.sqrt(0.001), tol: 1e-3 },
      rubric: [md`Correct first moments from zero initialization`, md`Ratio simplified to the stated factor`, md`Numerical value about 3.16 and interpretation`],
      areas: ['ml-depth'],
    },
  ],
};
