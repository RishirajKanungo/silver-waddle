import { md, type Module } from '../types';

export const MODULE: Module = {
  id: 'ml02',
  part: 'ml',
  order: 2,
  title: 'Classification and logistic regression',
  summary: 'Logistic regression and the cross-entropy loss, softmax regression with numerically stable log-sum-exp, and evaluating classifiers with confusion matrices, ROC and PR curves, calibration and cost-based thresholds.',
  relevance: md`Logistic regression is the standard baseline for binary prediction (click-through, fraud, churn), and its loss, the cross-entropy on logits, is the loss of every classification network and of next-token prediction in language models. A stable softmax plus cross-entropy is a common ML-coding question. Choosing and defending a metric, for example PR-AUC versus ROC-AUC under class imbalance, a threshold from business costs, or calibrated probabilities for ranking and bidding, comes up in almost every applied ML interview and design discussion.`,
  prereqs: ['ml01'],
  areas: ['ml-breadth', 'ml-depth', 'ml-coding'],
  lessons: [
    // ------------------------------------------------------------------ 2.1
    {
      id: 'ml02-1',
      title: 'Logistic regression and the cross-entropy loss',
      minutes: 40,
      objectives: [
        'Compute the sigmoid and its inverse, the logit, and read logistic regression as a linear model of the log-odds.',
        'Find the decision boundary for a given threshold and explain why w is normal to it.',
        'Derive binary cross-entropy as the Bernoulli negative log-likelihood, and its gradient (p − y)x.',
        'Explain why MSE on a sigmoid output trains poorly, and what happens to the weights on linearly separable data.',
      ],
      cells: [
        {
          kind: 'text',
          md: md`Many predictions are yes-or-no: is this transaction fraudulent, will this user click, is this email spam. A useful model outputs a probability $p = P(y = 1\mid\bx)$, so that cases can be ranked and a threshold can be chosen to match the costs of the two kinds of mistake. A linear score $z = \bw\T\bx + b$ takes any real value, so it cannot be a probability by itself. Logistic regression passes the score through a function that maps $\R$ onto $(0, 1)$.`,
        },
        {
          kind: 'callout',
          tone: 'definition',
          title: 'Sigmoid and logit',
          md: md`The **sigmoid** (logistic function) is $$\sigma(z) = \frac{1}{1 + e^{-z}}.$$ It is increasing, $\sigma(0) = \tfrac12$, $\sigma(-z) = 1 - \sigma(z)$, and $\sigma'(z) = \sigma(z)\,(1 - \sigma(z))$. Its inverse is the **logit** or log-odds: $$z = \operatorname{logit}(p) = \log\frac{p}{1 - p}.$$ The score $z$ fed into a sigmoid or softmax is called a **logit**.`,
        },
        {
          kind: 'numeric',
          q: md`Compute $\sigma(\ln 3)$ and $\operatorname{logit}(0.2)$. Enter both, in that order.`,
          answer: { kind: 'vector', value: [0.75, Math.log(0.25)] },
          hints: [md`$e^{-\ln 3} = 1/3$.`, md`$\operatorname{logit}(0.2) = \ln(0.2/0.8)$.`],
          explain: md`$\sigma(\ln 3) = \frac{1}{1 + 1/3} = \frac34$. $\operatorname{logit}(0.2) = \ln\frac{0.2}{0.8} = \ln\frac14 = -\ln 4 \approx -1.386$. In general $\sigma(\ln k) = \frac{k}{k + 1}$: odds of $k$ to $1$.`,
          inputHint: 'e.g. 3/4, ln(1/4)',
        },
        {
          kind: 'callout',
          tone: 'definition',
          title: 'Logistic regression',
          md: md`$$P(y = 1\mid\bx) = \sigma(\bw\T\bx + b), \qquad\text{equivalently}\qquad \log\frac{P(y = 1\mid\bx)}{P(y = 0\mid\bx)} = \bw\T\bx + b.$$ The model is linear in the **log-odds**. Increasing $x_j$ by one unit, with the other features fixed, adds $w_j$ to the log-odds, so it multiplies the odds by $e^{w_j}$.`,
        },
        {
          kind: 'callout',
          tone: 'intuition',
          md: md`Logistic regression is a linear score turned into a probability. The direction of $\bw$ says which way the evidence points; its length says how fast the confidence grows with distance from the boundary.`,
        },
        {
          kind: 'viz',
          viz: { type: 'ml.logreg-2d', data: 'overlap' },
          task: md`Drag the tip of $\mathbf{w}$ and the $b$ slider to make the mean BCE as small as you can. Notice which way the boundary turns when $\mathbf{w}$ turns, and what happens to the band between the dashed lines when $\mathbf{w}$ gets longer. Then press **Train** and compare with your best.`,
          caption: md`The colour is $\sigma(\mathbf{w}\T\mathbf{x} + b)$, from blue ($p \approx 0$) to orange ($p \approx 1$). The solid line is the decision boundary $p = 0.5$ and the dashed lines are $p = 0.25$ and $p = 0.75$. Training is full-batch gradient descent on the mean cross-entropy.`,
        },
        {
          kind: 'check',
          q: md`Multiply both $\bw$ and $b$ by 2. What happens?`,
          options: [
            md`The decision boundary stays the same; predicted probabilities move further from 0.5`,
            md`The decision boundary moves twice as far from the origin`,
            md`Nothing changes: the probabilities are scale-invariant`,
            md`The boundary rotates by 90 degrees`,
          ],
          answer: 0,
          explain: md`The boundary is $\{\bx : \bw\T\bx + b = 0\}$, unchanged when both are scaled. Every score doubles, so $\sigma$ of it is pushed towards 0 or 1: the transition band narrows. The length of $\bw$ controls confidence, its direction controls the boundary.`,
        },
        {
          kind: 'text',
          md: md`**Decision boundary.** Predicting $y = 1$ when $p \ge 0.5$ is the same as $z = \bw\T\bx + b \ge 0$, because $\sigma$ is increasing and $\sigma(0) = \tfrac12$. The boundary $\bw\T\bx + b = 0$ is a hyperplane (a line in 2-D). The vector $\bw$ is normal to it: for two points $\bx_1, \bx_2$ on the boundary, $\bw\T(\bx_1 - \bx_2) = 0$. The signed distance of a point to the boundary is $z/\lVert\bw\rVert$. A different threshold $\tau$ moves the boundary to the parallel hyperplane $\bw\T\bx + b = \operatorname{logit}(\tau)$; logistic regression can only produce linear boundaries in the features it is given.`,
        },
        {
          kind: 'numeric',
          q: md`A model has $\bw = (2, -1)$ and $b = 1$. On the $x_1$-axis ($x_2 = 0$), where is the boundary for threshold $0.5$, and where is it for threshold $0.9$? Enter both $x_1$ values.`,
          answer: { kind: 'vector', value: [-0.5, (Math.log(9) - 1) / 2] },
          hints: [md`Solve $2x_1 + 1 = \operatorname{logit}(\tau)$, with $\operatorname{logit}(0.9) = \ln 9$.`],
          explain: md`Threshold $0.5$: $2x_1 + 1 = 0$, so $x_1 = -0.5$. Threshold $0.9$: $2x_1 + 1 = \ln 9 \approx 2.197$, so $x_1 = (\ln 9 - 1)/2 \approx 0.599$. A stricter threshold shifts the boundary in the direction of $\bw$.`,
          inputHint: 'e.g. -1/2, (ln(9)-1)/2',
        },
        {
          kind: 'derive',
          title: 'binary cross-entropy from maximum likelihood',
          goal: md`Show that maximizing the likelihood of labels $y_i \in \{0, 1\}$ under $P(y_i = 1\mid\bx_i) = p_i = \sigma(\bw\T\bx_i + b)$ is minimizing the **binary cross-entropy** $$L = -\frac1n\sum_{i=1}^n \big[y_i\log p_i + (1 - y_i)\log(1 - p_i)\big].$$`,
          steps: [
            {
              md: md`Each label is a Bernoulli variable. Its probability can be written in one formula: $$P(y_i\mid\bx_i) = p_i^{\,y_i}(1 - p_i)^{1 - y_i},$$ which is $p_i$ when $y_i = 1$ and $1 - p_i$ when $y_i = 0$.`,
              choose: {
                prompt: md`How can $P(y_i \mid \bx_i)$ be written as a single expression valid for both labels?`,
                options: [md`$p_i^{\,y_i}(1 - p_i)^{1 - y_i}$`, md`$y_ip_i + (1 - y_i)p_i$`, md`$p_i^{\,y_i} + (1 - p_i)^{y_i}$`],
                answer: 0,
                explain: md`The exponent that is $0$ turns its factor into $1$. The second option equals $p_i$ for both labels, and the third equals $2$ when $y_i = 0$.`,
              },
            },
            { md: md`For independent examples the likelihood is $\prod_i p_i^{\,y_i}(1 - p_i)^{1 - y_i}$, and its log is $\sum_i \big[y_i\log p_i + (1 - y_i)\log(1 - p_i)\big]$.` },
            { md: md`Maximizing the log-likelihood is minimizing its negative; dividing by $n$ gives the mean binary cross-entropy $L$. Each term is $-\log(\text{probability assigned to the correct label})$: near $0$ for a confident correct prediction, and unbounded for a confident wrong one.` },
            { md: md`In terms of the logit, $-\log\sigma(z) = \log(1 + e^{-z})$ and $-\log(1 - \sigma(z)) = \log(1 + e^{z})$. So the loss of one example is $\log(1 + e^{-z})$ if $y = 1$ and $\log(1 + e^{z})$ if $y = 0$. Libraries compute it from $z$ directly (for example PyTorch's \`BCEWithLogitsLoss\`), which avoids taking $\log 0$ when $\sigma(z)$ rounds to $0$ or $1$.` },
          ],
          takeaway: md`Binary cross-entropy is to Bernoulli labels what MSE is to Gaussian noise: the negative log-likelihood. It is the same cross-entropy $H(\mathbf{q}, \mathbf{p}) = -\sum_k q_k\log p_k$ from the entropy module, with $\mathbf{q}$ the one-hot label.`,
        },
        {
          kind: 'derive',
          title: 'the gradient of the logistic loss',
          goal: md`For one example with $z = \bw\T\bx + b$, $p = \sigma(z)$ and $\ell = -y\log p - (1 - y)\log(1 - p)$, show that $\nabla_{\bw}\ell = (p - y)\,\bx$ and $\partial\ell/\partial b = p - y$.`,
          steps: [
            {
              md: md`Chain rule through $z$: $\nabla_{\bw}\ell = \frac{d\ell}{dp}\cdot\frac{dp}{dz}\cdot\nabla_{\bw}z$, with $\nabla_{\bw}z = \bx$ and $\partial z/\partial b = 1$.`,
              choose: {
                prompt: md`$\ell$ depends on $\bw$ only through $z$. What is the cleanest route?`,
                options: [md`Chain rule: $\ell \to p \to z \to \bw$`, md`Expand $\sigma$ into exponentials and differentiate everything with respect to each $w_j$`, md`Linearize $\sigma$ around $z = 0$ first`],
                answer: 0,
                explain: md`Each link is a one-line derivative. Expanding works but hides the structure; linearizing changes the function.`,
              },
            },
            { md: md`$\dfrac{d\ell}{dp} = -\dfrac{y}{p} + \dfrac{1 - y}{1 - p} = \dfrac{p - y}{p(1 - p)}$, after putting both terms over $p(1 - p)$.` },
            {
              md: md`$\dfrac{dp}{dz} = \sigma'(z) = p(1 - p)$. Multiplying, $\dfrac{d\ell}{dz} = \dfrac{p - y}{p(1 - p)}\cdot p(1 - p) = p - y$.`,
              choose: {
                prompt: md`What is $\sigma'(z)$ in terms of $p = \sigma(z)$?`,
                options: [md`$p(1 - p)$`, md`$p^2$`, md`$1 - p$`],
                answer: 0,
                explain: md`$\sigma'(z) = \frac{e^{-z}}{(1 + e^{-z})^2} = \sigma(z)\cdot\frac{e^{-z}}{1 + e^{-z}} = \sigma(z)(1 - \sigma(z))$. It cancels the denominator from the previous step exactly.`,
              },
            },
            { md: md`So $\nabla_{\bw}\ell = (p - y)\,\bx$ and $\partial\ell/\partial b = p - y$. Averaged over the data: $\nabla_{\bw}L = \frac1n X\T(\mathbf{p} - \by)$, the same "inputs transposed times errors" form as linear regression.` },
          ],
          takeaway: md`The derivative of the loss with respect to the logit is just $p - y$: prediction minus label, bounded in $[-1, 1]$. A confidently wrong prediction gets a gradient of size close to $1$, never close to $0$.`,
        },
        {
          kind: 'numeric',
          q: md`One example with $\bx = (2, 1)$, $y = 1$, and the model $\bw = (1, -2)$, $b = 0$. Compute $[\partial\ell/\partial w_1,\ \partial\ell/\partial w_2,\ \partial\ell/\partial b]$.`,
          answer: { kind: 'vector', value: [-1, -0.5, -0.5] },
          explain: md`$z = 2 - 2 + 0 = 0$, so $p = 0.5$ and $p - y = -0.5$. The gradient is $-0.5\cdot(2, 1) = (-1, -0.5)$ for $\bw$ and $-0.5$ for $b$. A gradient step adds a multiple of $\bx$ to $\bw$, raising the score of this positive example.`,
        },
        {
          kind: 'viz',
          viz: { type: 'ml.logreg-loss', mode: 'loss', z: -4 },
          task: md`For a positive example at $z = -4$ (confidently wrong), compare the two losses and then switch to **gradient**. How much larger is the cross-entropy gradient than the MSE gradient at $z = -4$? At $z = -8$? Then open **loss vs w** and look for flat regions of each curve.`,
          caption: md`With a sigmoid output, MSE $= (1 - \sigma(z))^2$ saturates at 1 for very negative $z$, and its gradient $-2\sigma(z)(1 - \sigma(z))^2$ goes to 0. Cross-entropy grows linearly, with gradient $\sigma(z) - 1 \to -1$.`,
        },
        {
          kind: 'text',
          md: md`**Why not MSE for classification.** Three separate reasons:

1. **Vanishing gradient when confidently wrong.** The MSE gradient with respect to $z$ carries an extra factor $\sigma'(z) = p(1 - p)$, which is tiny exactly when the model is confidently wrong. Training stalls on the examples it most needs to fix.
2. **Non-convexity.** Cross-entropy is convex in $(\bw, b)$ (problem set), so gradient descent finds the global minimum. MSE composed with a sigmoid is not convex in $\bw$, with flat regions and possible poor local minima.
3. **Wrong noise model.** MSE is the likelihood of Gaussian noise; labels in $\{0, 1\}$ are Bernoulli. Cross-entropy is a strictly proper scoring rule: its expected value is minimized by reporting the true probability, and it heavily punishes confident mistakes.`,
        },
        {
          kind: 'paper',
          problem: {
            id: 'ml02-1-paper',
            title: 'One gradient step by hand',
            type: 'compute',
            difficulty: 2,
            minutes: 10,
            statement: md`Two examples: $\bx_1 = (1, 0)$ with $y_1 = 1$ and $\bx_2 = (0, 1)$ with $y_2 = 0$. Start from $\bw = (0, 0)$, $b = 0$. (a) Compute the mean BCE. (b) Compute the gradient of the mean BCE. (c) Take one step with $\eta = 1$ and compute the new mean BCE. Enter the new $\bw$.`,
            hints: [md`At $\bw = \bzero$, $b = 0$ every $p_i$ is $0.5$.`, md`$\nabla_{\bw}L = \frac1n\sum_i (p_i - y_i)\bx_i$.`],
            solution: [
              md`(a) Both $p_i = 0.5$, so each loss is $-\ln 0.5 = \ln 2$, and the mean BCE is $\ln 2 \approx 0.693$.`,
              md`(b) $p_1 - y_1 = -0.5$ and $p_2 - y_2 = 0.5$. $\nabla_{\bw}L = \tfrac12\left[-0.5\,(1, 0) + 0.5\,(0, 1)\right] = (-0.25, 0.25)$ and $\partial L/\partial b = \tfrac12(-0.5 + 0.5) = 0$.`,
              md`(c) $\bw = (0, 0) - 1\cdot(-0.25, 0.25) = (0.25, -0.25)$, $b = 0$.`,
              md`New scores: $z_1 = 0.25$ and $z_2 = -0.25$. Losses: $\log(1 + e^{-0.25})$ for $y_1 = 1$ and $\log(1 + e^{-0.25})$ for $y_2 = 0$, both $\approx 0.576$. The mean BCE fell from $0.693$ to $0.576$.`,
            ],
            answer: { kind: 'vector', value: [0.25, -0.25] },
          },
        },
        {
          kind: 'text',
          md: md`**Separable data.** If some hyperplane separates the two classes perfectly, the logistic loss has no minimizer. Take a separating $(\bw, b)$: every positive example has $z_i > 0$ and every negative $z_i < 0$. Scaling $(\bw, b)$ by $c > 1$ makes every term $\log(1 + e^{-|cz_i|})$ smaller, and as $c \to \infty$ the loss tends to $0$ without reaching it. Gradient descent keeps growing $\lVert\bw\rVert$ (slowly, roughly logarithmically in the number of steps) and the predicted probabilities head towards exactly 0 and 1. On linearly separable data, the direction of $\bw$ under gradient descent is known to converge to the maximum-margin separator (Soudry et al., 2018).`,
        },
        {
          kind: 'viz',
          viz: { type: 'ml.logreg-2d', data: 'separable', w: [0.5, 0.5], b: 0 },
          task: md`Press **Train** and let it run. Watch $\lVert\mathbf{w}\rVert$ in the plot below: does it level off? Reset, switch on the **L2 penalty**, and train again.`,
          caption: md`On separable data the loss keeps falling towards 0 and $\lVert\mathbf{w}\rVert$ keeps growing, so the transition band shrinks to a sharp step. With a small L2 penalty the objective has a finite minimizer and $\lVert\mathbf{w}\rVert$ settles.`,
        },
        {
          kind: 'callout',
          tone: 'warning',
          title: 'Consequences of separability',
          md: md`Unregularized logistic regression on separable data gives weights that depend on when you stop, overconfident probabilities, and solvers that report convergence warnings. It is common with many features relative to examples, for example one-hot features of rare categories. The standard fixes are an L2 (or L1) penalty, which is the default in scikit-learn's \`LogisticRegression\`, or early stopping.`,
        },
        {
          kind: 'code',
          code: `import numpy as np

def sigmoid(z):
    return 1 / (1 + np.exp(-z))

np.random.seed(0)
n = 200
X = np.vstack([np.random.randn(n // 2, 2) + [1.0, 1.0], np.random.randn(n // 2, 2) - [1.0, 1.0]])
y = np.concatenate([np.ones(n // 2), np.zeros(n // 2)])

w, b, lr = np.zeros(2), 0.0, 0.5
for step in range(500):
    p = sigmoid(X @ w + b)
    w -= lr * X.T @ (p - y) / n          # gradient (1/n) X^T (p - y)
    b -= lr * (p - y).mean()
p = sigmoid(X @ w + b)
loss = -np.mean(y * np.log(p) + (1 - y) * np.log(1 - p))
print("w =", np.round(w, 3), " b =", round(float(b), 3))
print("loss =", round(float(loss), 4), " accuracy =", float(((p > 0.5) == y).mean()))`,
          note: md`Full-batch gradient descent with the gradient from the derivation, vectorized. The two Gaussian blobs overlap a little, so the loss stays above 0 and $\bw$ converges. Try moving the blobs apart (\`+ [3.0, 3.0]\` and \`- [3.0, 3.0]\`) and printing $\lVert\bw\rVert$ for more steps.`,
        },
        {
          kind: 'explain',
          prompt: md`An interviewer asks: *why don't we train classifiers with mean squared error on the predicted probability?* Answer in a few sentences.`,
          model: md`With a sigmoid or softmax output, MSE has the wrong gradients and the wrong probabilistic model. The gradient of $(\sigma(z) - y)^2$ with respect to the logit is $2(\sigma(z) - y)\sigma(z)(1 - \sigma(z))$, which vanishes when the model is confidently wrong, so learning stalls exactly where it should be fastest. Cross-entropy cancels the $\sigma'$ factor and gives the gradient $p - y$. MSE composed with a sigmoid is also non-convex in the weights, while cross-entropy is convex for logistic regression. Finally, cross-entropy is the negative log-likelihood of Bernoulli (or categorical) labels and a proper scoring rule, so minimizing it pushes towards calibrated probabilities; MSE corresponds to Gaussian noise, which does not describe 0/1 labels.`,
        },
      ],
      cards: [
        { id: 'ml02-1-c1', kind: 'concept', front: md`Gradient of the binary cross-entropy for one example with respect to $\bw$ and $b$.`, back: md`$\nabla_{\bw}\ell = (p - y)\bx$ and $\partial\ell/\partial b = p - y$, with $p = \sigma(\bw\T\bx + b)$. Over a dataset: $\frac1n X\T(\mathbf{p} - \by)$.` },
        { id: 'ml02-1-c2', kind: 'compute', front: md`$\sigma(\ln 4) = ?$`, answer: { kind: 'number', value: 0.8 }, back: md`$\frac{1}{1 + 1/4} = \frac45 = 0.8$. In general $\sigma(\ln k) = k/(k + 1)$.` },
        { id: 'ml02-1-c3', kind: 'cloze', text: md`Logistic regression models the {{}} as a linear function of the features.`, answers: ['log-odds|log odds|logit'] },
        { id: 'ml02-1-c4', kind: 'concept', front: md`What happens to logistic regression on linearly separable data, and how do you fix it?`, back: md`No finite minimizer: the loss decreases towards 0 as $\lVert\bw\rVert \to \infty$, so weights grow without bound and probabilities become overconfident. Fix with L2/L1 regularization or early stopping.` },
        { id: 'ml02-1-c5', kind: 'concept', front: md`Two reasons not to train a classifier with MSE on sigmoid outputs.`, back: md`Its gradient vanishes when the prediction is confidently wrong (extra factor $p(1 - p)$), and it is non-convex in the weights. Cross-entropy is convex, gives gradient $p - y$, and is the Bernoulli likelihood.` },
      ],
    },
    // ------------------------------------------------------------------ 2.2
    {
      id: 'ml02-2',
      title: 'Softmax regression and stable cross-entropy',
      minutes: 30,
      objectives: [
        'Compute a softmax by hand and explain what temperature does to it.',
        'Derive the gradient of the softmax cross-entropy with respect to the logits, p − y.',
        'Implement a numerically stable softmax and cross-entropy for a batch with log-sum-exp and integer-array indexing.',
        'Show that a two-class softmax is a sigmoid of the difference of the logits.',
      ],
      cells: [
        {
          kind: 'text',
          md: md`With $K$ classes (digits, product categories, or the next token out of a vocabulary of 100k), the model computes one score per class, $z_k = \bw_k\T\bx + b_k$, or $\bz = W\bx + \mathbf{b}$ with $W \in \R^{K\times d}$. The scores must become a probability vector: positive entries summing to 1. The standard map is the softmax, and the model is called **softmax regression** or multinomial logistic regression.`,
        },
        {
          kind: 'callout',
          tone: 'definition',
          title: 'Softmax',
          md: md`$$\softmax(\bz)_k = \frac{e^{z_k}}{\sum_{j=1}^K e^{z_j}}, \qquad k = 1, \dots, K.$$ The outputs are positive and sum to 1, and their order follows the order of the logits. Adding the same constant $c$ to every logit changes nothing: $e^{z_k + c}/\sum_j e^{z_j + c} = e^{z_k}/\sum_j e^{z_j}$. With **temperature** $T > 0$, $\mathbf{p} = \softmax(\bz/T)$: $T \to 0$ approaches a one-hot vector on the largest logit, and $T \to \infty$ approaches the uniform distribution.`,
        },
        {
          kind: 'callout',
          tone: 'intuition',
          md: md`Softmax exponentiates, so differences of logits become ratios of probabilities: a logit one unit higher means $e \approx 2.72$ times as likely, whatever the other logits are. Temperature divides those differences, sharpening or flattening the distribution.`,
        },
        {
          kind: 'viz',
          viz: { type: 'ml.softmax-bars', z: [2, 1, -1], T: 1, y: 0 },
          task: md`Press **Add 1 to every z** a few times: do the probabilities change? Then lower $T$ to $0.1$ and raise it to $5$. Finally make class 2 the true class while its logit is the smallest, and look at the loss and at the sign of each gradient entry.`,
          caption: md`The gradient of the loss with respect to the logits is $(\mathbf{p} - \mathbf{e}_y)/T$: negative only for the true class (raise its logit), positive for the others in proportion to their probability (lower them).`,
        },
        {
          kind: 'numeric',
          q: md`Compute $\softmax(\bz)$ for $\bz = (0, \ln 3, \ln 4)$.`,
          answer: { kind: 'vector', value: [1 / 8, 3 / 8, 1 / 2] },
          hints: [md`$e^{0} = 1$, $e^{\ln 3} = 3$, $e^{\ln 4} = 4$.`],
          explain: md`The exponentials are $1, 3, 4$ with sum $8$, so $\mathbf{p} = (1/8, 3/8, 4/8) = (0.125, 0.375, 0.5)$.`,
        },
        {
          kind: 'check',
          q: md`With $K = 2$ classes and logits $(z_0, z_1)$, the softmax probability of class 1 equals`,
          options: [md`$\sigma(z_1 - z_0)$`, md`$\sigma(z_1)$`, md`$\sigma(z_1) / (\sigma(z_0) + \sigma(z_1))$`, md`$z_1 / (z_0 + z_1)$`],
          answer: 0,
          explain: md`$\frac{e^{z_1}}{e^{z_0} + e^{z_1}} = \frac{1}{1 + e^{-(z_1 - z_0)}} = \sigma(z_1 - z_0)$. Only the difference of the logits matters, which is why binary logistic regression needs one weight vector, not two.`,
        },
        {
          kind: 'callout',
          tone: 'definition',
          title: 'Cross-entropy loss',
          md: md`For an example with true class $y$, the loss is the negative log-probability of that class: $$\ell = -\log p_y = -z_y + \log\sum_{j=1}^K e^{z_j} = -z_y + \operatorname{LSE}(\bz).$$ $\operatorname{LSE}$ is the **log-sum-exp**. With a one-hot label vector $\mathbf{y}$, this is the cross-entropy $-\sum_k y_k\log p_k$. Language models are trained with exactly this loss on every next token.`,
        },
        {
          kind: 'derive',
          title: 'the softmax cross-entropy gradient',
          goal: md`Show that $\dfrac{\partial\ell}{\partial z_j} = p_j - y_j$, where $\mathbf{y}$ is the one-hot label, so $\nabla_{\bz}\ell = \mathbf{p} - \mathbf{y}$.`,
          steps: [
            {
              md: md`Start from the log-sum-exp form, $\ell = -z_y + \log\sum_k e^{z_k}$, rather than from $-\log p_y$ with the quotient.`,
              choose: {
                prompt: md`Which form of the loss is easiest to differentiate with respect to $z_j$?`,
                options: [md`$-z_y + \log\sum_k e^{z_k}$`, md`$-\log\dfrac{e^{z_y}}{\sum_k e^{z_k}}$ with the quotient rule`, md`$-\sum_k y_k\log p_k$ with the derivative of each $p_k$ with respect to each $z_j$ (the full Jacobian)`],
                answer: 0,
                explain: md`All three give the same answer. The first separates into a linear term and the log-sum-exp, whose derivative is one line. The Jacobian route works but needs the softmax Jacobian $\operatorname{diag}(\mathbf{p}) - \mathbf{p}\mathbf{p}\T$.`,
              },
            },
            { md: md`$\dfrac{\partial}{\partial z_j}(-z_y) = -[j = y] = -y_j$.` },
            {
              md: md`$\dfrac{\partial}{\partial z_j}\log\sum_k e^{z_k} = \dfrac{e^{z_j}}{\sum_k e^{z_k}} = p_j$. The gradient of log-sum-exp is the softmax.`,
              choose: {
                prompt: md`What is $\dfrac{\partial}{\partial z_j}\log\sum_k e^{z_k}$?`,
                options: [md`$p_j = \softmax(\bz)_j$`, md`$e^{z_j}$`, md`$1/\sum_k e^{z_k}$`],
                answer: 0,
                explain: md`Chain rule: $\frac{1}{\sum_k e^{z_k}}\cdot e^{z_j}$.`,
              },
            },
            { md: md`So $\partial\ell/\partial z_j = p_j - y_j$. With $\bz = W\bx + \mathbf{b}$: $\nabla_W\ell = (\mathbf{p} - \mathbf{y})\bx\T$ and $\nabla_{\mathbf{b}}\ell = \mathbf{p} - \mathbf{y}$. For a batch with logits $Z \in \R^{n\times K}$ and mean loss, $\nabla_Z L = (P - Y)/n$.` },
          ],
          takeaway: md`Same form as the binary case: prediction minus target. The gradient entries sum to zero, consistent with the invariance of softmax to adding a constant to all logits.`,
        },
        {
          kind: 'numeric',
          q: md`For $\bz = (0, \ln 3, \ln 4)$ and true class $y = 1$ (classes numbered $0, 1, 2$), compute $\nabla_{\bz}\ell$ and the loss $\ell$. Enter the gradient.`,
          answer: { kind: 'vector', value: [0.125, -0.625, 0.5] },
          explain: md`$\mathbf{p} = (0.125, 0.375, 0.5)$ and $\mathbf{y} = (0, 1, 0)$, so $\mathbf{p} - \mathbf{y} = (0.125, -0.625, 0.5)$. The loss is $-\ln 0.375 = \ln(8/3) \approx 0.981$.`,
        },
        {
          kind: 'viz',
          viz: { type: 'ml.softmax-2d' },
          task: md`Drag the three weight vectors to classify as many points as you can, then press **Train 10 steps** a few times. Where do the boundaries between regions lie relative to the vectors? Change $T$ and watch the shading but not the regions.`,
          caption: md`With no biases, the boundary between classes $j$ and $k$ is the line $(\mathbf{w}_j - \mathbf{w}_k)\T\mathbf{x} = 0$. Temperature rescales all logits equally, so the argmax regions do not move; only the confidence does.`,
        },
        {
          kind: 'text',
          md: md`**Numerical stability.** In float64, $e^{z}$ overflows to \`inf\` for $z > 709.8$ and underflows to $0$ for $z < -745$. Logits of a few hundred are uncommon, but in float16 or bfloat16 the limits are far smaller, and a naive softmax produces \`inf / inf = nan\`. Two identities fix it:

- **Shift by the maximum.** With $m = \max_k z_k$, $\softmax(\bz) = \softmax(\bz - m)$. Every exponent is then $\le 0$, so nothing overflows and the largest term is exactly $1$.
- **Log-sum-exp.** $\operatorname{LSE}(\bz) = m + \log\sum_k e^{z_k - m}$, and $\log p_y = z_y - \operatorname{LSE}(\bz)$.

Compute the loss from log-probabilities, never as \`np.log(softmax(z))\`: if a probability underflows to $0$ the log is $-\infty$. Frameworks take logits for this reason (PyTorch's \`cross_entropy\` applies log-softmax internally).`,
        },
        {
          kind: 'code',
          code: `import numpy as np

z = np.array([1000.0, 1001.0, 1002.0])
with np.errstate(over="ignore", invalid="ignore"):
    naive = np.exp(z) / np.exp(z).sum()      # inf / inf
print(naive)
stable = np.exp(z - z.max()) / np.exp(z - z.max()).sum()
print(np.round(stable, 4))`,
          note: md`\`np.errstate\` only silences the overflow warnings so that the output is clean; the naive result is still \`nan\`. The stable version computes $\softmax(z_1 - 1002, z_2 - 1002, z_3 - 1002) = \softmax(-2, -1, 0)$.`,
        },
        {
          kind: 'code',
          code: `import numpy as np

z = np.array([1000.0, 1000.0])
m = z.max()
print(round(float(m + np.log(np.exp(z - m).sum())), 4))`,
          predict: {
            q: md`This computes $\operatorname{LSE}(1000, 1000)$ stably. What is printed?`,
            options: ['`1000.6931`', '`inf`', '`1000.0`', '`2000.0`'],
            answer: 0,
            explain: md`$\log(e^{1000} + e^{1000}) = 1000 + \log 2 \approx 1000.6931$. Computed naively, $e^{1000}$ would overflow and the result would be \`inf\`.`,
          },
        },
        {
          kind: 'exercise',
          ex: {
            id: 'ml02-2-ex1',
            title: 'Stable softmax and cross-entropy for a batch',
            prompt: md`\`Z\` has shape \`(n, K)\` (one row of logits per example) and \`y\` holds integer class labels, shape \`(n,)\`. Write, without Python loops:

- \`softmax(Z)\`: row-wise, stable (subtract each row's max).
- \`cross_entropy(Z, y)\`: the mean of $-\log p_{i, y_i}$, computed from log-probabilities $Z_s - \operatorname{LSE}$ where $Z_s$ is the shifted $Z$. Pick each row's true-class entry with \`log_probs[np.arange(n), y]\`, the same indexing as \`probs[np.arange(n), y]\`.
- \`ce_grad(Z, y)\`: the gradient of the mean loss with respect to \`Z\`, $(P - Y)/n$.

The tests include logits of size 1000, where a naive version returns \`nan\` or \`inf\`.`,
            starter: `import numpy as np

def softmax(Z):
    pass

def cross_entropy(Z, y):
    pass

def ce_grad(Z, y):
    pass

Z = np.array([[1.0, 2.0, 3.0], [1000.0, 1001.0, 1002.0], [-5.0, 0.0, 5.0]])
y = np.array([2, 0, 1])
print(softmax(Z))
print(cross_entropy(Z, y))`,
            solution: `import numpy as np

def softmax(Z):
    Zs = Z - Z.max(axis=1, keepdims=True)
    E = np.exp(Zs)
    return E / E.sum(axis=1, keepdims=True)

def cross_entropy(Z, y):
    n = Z.shape[0]
    Zs = Z - Z.max(axis=1, keepdims=True)
    log_probs = Zs - np.log(np.exp(Zs).sum(axis=1, keepdims=True))
    return -log_probs[np.arange(n), y].mean()

def ce_grad(Z, y):
    n = Z.shape[0]
    G = softmax(Z)
    G[np.arange(n), y] -= 1
    return G / n

Z = np.array([[1.0, 2.0, 3.0], [1000.0, 1001.0, 1002.0], [-5.0, 0.0, 5.0]])
y = np.array([2, 0, 1])
print(softmax(Z))
print(cross_entropy(Z, y))`,
            tests: [
              { expr: 'np.round(softmax(Z), 6).tolist()', label: 'softmax, including a row of logits near 1000' },
              { expr: 'round(float(cross_entropy(Z, y)), 6)', label: 'mean cross-entropy' },
              { expr: 'round(float(cross_entropy(np.array([[0.0, 0.0]]), np.array([1]))), 6)', label: 'two equal logits give ln 2' },
              { expr: 'round(float(cross_entropy(np.array([[0.0, 1000.0]]), np.array([0]))), 6)', label: 'a confidently wrong prediction gives a finite loss of 1000' },
              { expr: 'np.round(ce_grad(Z, y), 6).tolist()', label: 'gradient (P − Y)/n' },
            ],
            hints: [md`\`Z.max(axis=1, keepdims=True)\` has shape \`(n, 1)\` and broadcasts against \`Z\`.`, md`\`log_probs = Zs - np.log(np.exp(Zs).sum(axis=1, keepdims=True))\`.`, md`For the gradient, copy the softmax, subtract 1 at \`[np.arange(n), y]\`, divide by \`n\`.`],
            mustInclude: ['np.arange'],
            mustExclude: ['for '],
          },
        },
        {
          kind: 'paper',
          problem: {
            id: 'ml02-2-paper',
            title: 'Log-sum-exp is a smooth maximum',
            type: 'proof',
            difficulty: 2,
            minutes: 10,
            statement: md`For $\bz \in \R^K$ with $m = \max_k z_k$, prove $$m \le \operatorname{LSE}(\bz) \le m + \log K.$$ Then show that $\operatorname{LSE}(\bz/T)\cdot T \to m$ as $T \to 0^+$, and explain in one sentence why computing $m + \log\sum_k e^{z_k - m}$ never overflows.`,
            hints: [md`Bound $\sum_k e^{z_k}$ below by its largest term and above by $K$ times its largest term.`],
            solution: [
              md`The largest term of $\sum_k e^{z_k}$ is $e^{m}$ and all terms are positive, so $e^{m} \le \sum_k e^{z_k}$.`,
              md`Each term is at most $e^{m}$, so $\sum_k e^{z_k} \le Ke^{m}$.`,
              md`Taking logs (an increasing function): $m \le \operatorname{LSE}(\bz) \le m + \log K$.`,
              md`Apply this to $\bz/T$, whose maximum is $m/T$: $m/T \le \operatorname{LSE}(\bz/T) \le m/T + \log K$. Multiply by $T > 0$: $m \le T\operatorname{LSE}(\bz/T) \le m + T\log K \to m$.`,
              md`In $m + \log\sum_k e^{z_k - m}$ every exponent is $\le 0$, so each term is in $(0, 1]$, and the sum lies in $[1, K]$: no overflow, and the log is of a number at least 1.`,
            ],
            rubric: [md`Lower bound from the largest term`, md`Upper bound with factor $K$`, md`Temperature limit argued with the bounds`, md`Explains why the shifted form is safe`],
            areas: ['math', 'ml-coding'],
          },
        },
        {
          kind: 'recall',
          prompt: md`Without looking back: the softmax cross-entropy for one example in terms of the logits, its gradient, and the two-line recipe for computing it stably.`,
          answer: md`$\ell = -z_y + \log\sum_k e^{z_k}$, gradient $\nabla_{\bz}\ell = \mathbf{p} - \mathbf{y}$ with $\mathbf{p} = \softmax(\bz)$. Stably: subtract $m = \max_k z_k$ from every logit, compute $\log p_y = (z_y - m) - \log\sum_k e^{z_k - m}$, and take the negative.`,
        },
      ],
      cards: [
        { id: 'ml02-2-c1', kind: 'compute', front: md`$\softmax(\ln 1, \ln 2, \ln 5) = ?$`, answer: { kind: 'vector', value: [0.125, 0.25, 0.625] }, back: md`Exponentials $1, 2, 5$, sum $8$: $(1/8, 2/8, 5/8)$.` },
        { id: 'ml02-2-c2', kind: 'concept', front: md`Gradient of $-\log\softmax(\bz)_y$ with respect to $\bz$.`, back: md`$\mathbf{p} - \mathbf{y}$, with $\mathbf{y}$ the one-hot label. For $\bz = W\bx$: $\nabla_W = (\mathbf{p} - \mathbf{y})\bx\T$.` },
        { id: 'ml02-2-c3', kind: 'cloze', text: md`To compute a softmax without overflow, subtract the {{}} logit from every logit first.`, answers: ['largest|maximum|max'] },
        { id: 'ml02-2-c4', kind: 'concept', front: md`What does the temperature $T$ in $\softmax(\bz/T)$ do?`, back: md`Small $T$ sharpens towards one-hot on the largest logit; large $T$ flattens towards uniform. The argmax never changes.` },
        { id: 'ml02-2-c5', kind: 'cloze', text: md`A two-class softmax gives class 1 the probability $\sigma(z_1 - z_0)$, so only the {{}} of the logits matters.`, answers: ['difference'] },
      ],
    },
    // ------------------------------------------------------------------ 2.3
    {
      id: 'ml02-3',
      title: 'Evaluating classifiers: thresholds, ROC, PR and calibration',
      minutes: 40,
      objectives: [
        'Fill in a confusion matrix and compute precision, recall, F1, specificity and accuracy.',
        'Trace an ROC curve by sweeping the threshold, and interpret AUC as the probability that a random positive outranks a random negative.',
        'Explain with the precision formula why PR curves reveal what ROC curves hide under heavy class imbalance.',
        'Read a reliability diagram, and choose the threshold that minimizes expected cost for calibrated probabilities.',
      ],
      cells: [
        {
          kind: 'text',
          md: md`A fraud model is evaluated on 100,000 transactions, of which 500 (0.5%) are fraud. A model that always says "not fraud" has 99.5% accuracy and catches nothing. A useful evaluation separates the two kinds of error, accounts for how rare positives are, and distinguishes the quality of the **scores** (how well they rank cases) from the choice of **threshold** (where to cut).`,
        },
        {
          kind: 'callout',
          tone: 'definition',
          title: 'Confusion matrix and metrics',
          md: md`At a threshold $t$, predict positive when the score is $\ge t$. Count true positives (TP), false negatives (FN), false positives (FP) and true negatives (TN).

| metric | formula | question it answers |
|---|---|---|
| recall, TPR, sensitivity | $\frac{TP}{TP + FN}$ | Of the actual positives, how many are caught? |
| precision | $\frac{TP}{TP + FP}$ | Of the flagged cases, how many are positive? |
| FPR | $\frac{FP}{FP + TN}$ | Of the actual negatives, how many are flagged? |
| specificity | $\frac{TN}{TN + FP} = 1 - \text{FPR}$ | Of the actual negatives, how many are cleared? |
| $F_1$ | $\frac{2PR}{P + R} = \frac{2TP}{2TP + FP + FN}$ | harmonic mean of precision and recall |
| accuracy | $\frac{TP + TN}{\text{all}}$ | fraction of correct predictions |`,
        },
        {
          kind: 'numeric',
          q: md`A model on 1000 cases has $TP = 40$, $FN = 10$, $FP = 20$, $TN = 930$. Compute precision, recall and $F_1$.`,
          answer: { kind: 'vector', value: [2 / 3, 0.8, 8 / 11] },
          explain: md`Precision $= 40/60 = 2/3 \approx 0.667$. Recall $= 40/50 = 0.8$. $F_1 = \frac{2\cdot 40}{80 + 20 + 10} = \frac{80}{110} = 8/11 \approx 0.727$. Accuracy is $970/1000 = 0.97$, which looks far better than either precision or recall because negatives dominate.`,
          inputHint: '[precision, recall, F1]',
        },
        {
          kind: 'check',
          q: md`On the fraud data (0.5% positives), the "always negative" model has accuracy $0.995$. Its recall and precision are`,
          options: [md`recall $0$; precision undefined ($0/0$), usually reported as $0$`, md`recall $0.995$ and precision $0.995$`, md`recall $1$ and precision $0.005$`, md`recall $0.5$ and precision $0.5$`],
          answer: 0,
          explain: md`It flags nothing: $TP = FP = 0$, so recall $= 0/500 = 0$ and precision $= 0/0$. The "always positive" model is the opposite: recall $1$, precision $0.005$.`,
        },
        {
          kind: 'viz',
          viz: { type: 'ml.clf-threshold', dprime: 1.5, prev: 0.3, t: 1 },
          task: md`Drag the threshold from left to right and watch the confusion matrix and the orange point move along both curves. Then set the prevalence to $0.01$: which curve changes, and what happens to precision at the same threshold? Finally set the separation $d' = 0$ and $d' = 3$.`,
          caption: md`Scores of negatives follow $\mathcal N(0, 1)$ and of positives $\mathcal N(d', 1)$; the areas are scaled by prevalence, so with rare positives the orange hump is small. Shaded right of the threshold: FP (blue) and TP (orange). The ROC curve depends only on the two score distributions. The PR curve also depends on how many negatives there are, so it drops when positives become rare. The grey line on the PR plot is the precision of random guessing, the prevalence.`,
        },
        {
          kind: 'callout',
          tone: 'definition',
          title: 'ROC curve and AUC',
          md: md`The **ROC curve** plots TPR against FPR as the threshold sweeps from $+\infty$ (nothing flagged, the point $(0, 0)$) to $-\infty$ (everything flagged, $(1, 1)$). A random scorer lies on the diagonal. The **area under the curve**, ROC-AUC, summarizes it in one number between $0.5$ (random) and $1$ (perfect ranking), and it equals the probability that a randomly chosen positive gets a higher score than a randomly chosen negative.`,
        },
        {
          kind: 'derive',
          title: 'AUC is a ranking probability',
          goal: md`Let $S^+$ and $S^-$ be the scores of a random positive and a random independent negative, with densities $f^+$, $f^-$. Show that $\text{AUC} = P(S^+ > S^-)$ (assume continuous scores, so no ties).`,
          steps: [
            { md: md`For threshold $t$: $\text{TPR}(t) = P(S^+ > t)$ and $\text{FPR}(t) = P(S^- > t)$. As $t$ decreases from $+\infty$ to $-\infty$, FPR increases from $0$ to $1$, and $d\,\text{FPR} = -f^-(t)\,dt$.` },
            {
              md: md`Write the area as an integral over the threshold: $$\text{AUC} = \int_0^1 \text{TPR}\;d\,\text{FPR} = \int_{+\infty}^{-\infty} P(S^+ > t)\,\big(-f^-(t)\big)\,dt = \int_{-\infty}^{\infty} P(S^+ > t)\,f^-(t)\,dt.$$`,
              choose: {
                prompt: md`How do you turn "area under TPR as a function of FPR" into something computable?`,
                options: [md`Parametrize both by the threshold $t$ and change variables`, md`Assume the ROC curve is a straight line`, md`Integrate TPR over $t$ directly`],
                answer: 0,
                explain: md`Both axes are functions of $t$, so substitute $\text{FPR} = \text{FPR}(t)$. Integrating TPR over $t$ alone ignores how fast FPR changes.`,
              },
            },
            {
              md: md`The last integral averages $P(S^+ > t)$ over $t$ drawn from the negative score distribution, which is $P(S^+ > S^-)$ by the law of total probability (condition on $S^- = t$, using independence).`,
              choose: {
                prompt: md`What is $\int P(S^+ > t)\,f^-(t)\,dt$?`,
                options: [md`$P(S^+ > S^-)$`, md`$P(S^+ > 0)$`, md`$\E[S^+] - \E[S^-]$`],
                answer: 0,
                explain: md`It is $\E\big[P(S^+ > S^- \mid S^-)\big] = P(S^+ > S^-)$.`,
              },
            },
            { md: md`For a finite sample this is the fraction of (positive, negative) pairs ranked correctly, counting ties as $\tfrac12$: the Mann–Whitney $U$ statistic divided by $n^+n^-$.` },
          ],
          takeaway: md`AUC measures ranking quality only. It does not change under any increasing transformation of the scores, so it says nothing about calibration or about which threshold to use.`,
        },
        {
          kind: 'numeric',
          q: md`Positives have scores $0.9, 0.6, 0.4$ and negatives $0.7, 0.3, 0.2, 0.1$. Compute the ROC-AUC by counting pairs.`,
          answer: { kind: 'number', value: 5 / 6 },
          hints: [md`There are $3\cdot 4 = 12$ pairs. For each positive, count the negatives with a lower score.`],
          explain: md`$0.9$ beats all 4 negatives, $0.6$ beats 3 ($0.3, 0.2, 0.1$), $0.4$ beats 3. That is $10$ of $12$ pairs: AUC $= 5/6 \approx 0.833$.`,
        },
        {
          kind: 'code',
          code: `import numpy as np

s_pos = np.array([0.9, 0.6, 0.4])
s_neg = np.array([0.7, 0.3, 0.2, 0.1])
auc = (s_pos[:, None] > s_neg[None, :]).mean()    # fraction of (positive, negative) pairs ranked correctly
print(round(float(auc), 4))`,
          predict: {
            q: md`\`s_pos[:, None] > s_neg[None, :]\` is a $3\times 4$ boolean matrix of all pairs. What is printed?`,
            options: ['`0.8333`', '`0.75`', '`0.9167`', '`10`'],
            answer: 0,
            explain: md`Ten of the twelve entries are \`True\`, and the mean of a boolean array is the fraction of \`True\`: $10/12$. This $O(n^+n^-)$ version is fine for small sets; for large ones, sort the scores and use ranks, $O(n\log n)$.`,
          },
        },
        {
          kind: 'text',
          md: md`**Precision depends on prevalence.** With prevalence $\pi = P(y = 1)$, at any threshold $$\text{precision} = \frac{\pi\,\text{TPR}}{\pi\,\text{TPR} + (1 - \pi)\,\text{FPR}}.$$ TPR and FPR are rates within each class, so the ROC curve does not move when positives become rare. Precision does: when negatives outnumber positives 99 to 1, even a small FPR produces more false positives than true ones. The **PR curve** (precision against recall) shows this directly, and its baseline is $\pi$ rather than $0.5$. Its area, often computed as **average precision** (AP), is the usual summary for rare-positive problems such as fraud, defect detection or retrieval. An ROC-AUC of $0.95$ can coexist with a precision of a few percent at any useful recall.`,
        },
        {
          kind: 'callout',
          tone: 'intuition',
          md: md`ROC asks how well the scores rank positives above negatives. PR asks what the queue of flagged cases will look like. The first ignores how rare positives are; the second is dominated by it.`,
        },
        {
          kind: 'numeric',
          q: md`A screening model has TPR $0.9$ and FPR $0.05$ at its threshold. If $1\%$ of the population is positive, what fraction of flagged cases is actually positive?`,
          answer: { kind: 'number', value: 0.009 / (0.009 + 0.0495) },
          explain: md`Precision $= \frac{0.01\cdot 0.9}{0.01\cdot 0.9 + 0.99\cdot 0.05} = \frac{0.009}{0.009 + 0.0495} \approx 0.154$. About 85% of alerts are false, although TPR and specificity both look excellent.`,
        },
        {
          kind: 'check',
          q: md`You compare two fraud models on data with 0.2% positives. Both have ROC-AUC near $0.97$. Which evaluation is most informative?`,
          options: [
            md`The PR curve (or average precision), and precision at the recall the business needs`,
            md`Accuracy at threshold $0.5$`,
            md`ROC-AUC to more decimal places`,
            md`Specificity, since negatives dominate`,
          ],
          answer: 0,
          explain: md`At 0.2% prevalence, a tiny difference in FPR (invisible on the ROC plot, which is dominated by the huge negative class) is a large difference in the number of false alerts, which precision exposes. Accuracy is dominated by negatives, and specificity near 1 hides the same problem.`,
        },
        {
          kind: 'exercise',
          ex: {
            id: 'ml02-3-ex1',
            title: 'Confusion counts, precision, recall and AUC',
            prompt: md`\`y\` holds labels in $\{0, 1\}$ and \`scores\` the model scores. Without Python loops, write:

- \`confusion(y, scores, t)\` returning \`(tp, fp, fn, tn)\` as Python ints, predicting positive when \`scores >= t\`;
- \`prf1(y, scores, t)\` returning \`(precision, recall, f1)\`, with \`0.0\` whenever a denominator is zero;
- \`auc(y, scores)\`: the fraction of (positive, negative) pairs where the positive scores higher, counting ties as $\tfrac12$.`,
            starter: `import numpy as np

def confusion(y, scores, t):
    pass

def prf1(y, scores, t):
    pass

def auc(y, scores):
    pass

y = np.array([1, 0, 1, 1, 0, 0, 1, 0, 0, 0])
s = np.array([0.9, 0.8, 0.7, 0.6, 0.55, 0.5, 0.4, 0.3, 0.2, 0.1])
print(confusion(y, s, 0.5), prf1(y, s, 0.5), auc(y, s))`,
            solution: `import numpy as np

def confusion(y, scores, t):
    pred = scores >= t
    tp = int(np.sum(pred & (y == 1)))
    fp = int(np.sum(pred & (y == 0)))
    fn = int(np.sum(~pred & (y == 1)))
    tn = int(np.sum(~pred & (y == 0)))
    return tp, fp, fn, tn

def prf1(y, scores, t):
    tp, fp, fn, tn = confusion(y, scores, t)
    precision = tp / (tp + fp) if tp + fp else 0.0
    recall = tp / (tp + fn) if tp + fn else 0.0
    f1 = 2 * precision * recall / (precision + recall) if precision + recall else 0.0
    return precision, recall, f1

def auc(y, scores):
    pos, neg = scores[y == 1], scores[y == 0]
    diff = pos[:, None] - neg[None, :]
    return float(np.mean((diff > 0) + 0.5 * (diff == 0)))

y = np.array([1, 0, 1, 1, 0, 0, 1, 0, 0, 0])
s = np.array([0.9, 0.8, 0.7, 0.6, 0.55, 0.5, 0.4, 0.3, 0.2, 0.1])
print(confusion(y, s, 0.5), prf1(y, s, 0.5), auc(y, s))`,
            tests: [
              { expr: 'confusion(y, s, 0.5)', label: 'counts at t = 0.5' },
              { expr: 'tuple(round(v, 6) for v in prf1(y, s, 0.5))', label: 'precision, recall, F1 at t = 0.5' },
              { expr: 'tuple(round(v, 6) for v in prf1(y, s, 0.95))', label: 'nothing flagged: zeros, no division error' },
              { expr: 'round(auc(y, s), 6)', label: 'AUC' },
              { expr: 'round(auc(np.array([1, 1, 1, 0, 0, 0]), np.array([0.8, 0.5, 0.3, 0.6, 0.5, 0.2])), 6)', label: 'AUC with a tie counted as 1/2' },
            ],
            hints: [md`\`pred = scores >= t\` is a boolean array; \`pred & (y == 1)\` marks the true positives and \`np.sum\` counts them.`, md`For AUC, \`pos[:, None] - neg[None, :]\` is the matrix of all pairwise differences.`],
            mustExclude: ['for '],
          },
        },
        {
          kind: 'text',
          md: md`**Choosing the threshold.** The threshold is a business decision made after training. Common rules:

- **Expected cost.** If a false negative costs $c_{FN}$ and a false positive $c_{FP}$, and the model's probability $p$ is calibrated, flag a case when the expected cost of not flagging, $p\,c_{FN}$, exceeds that of flagging, $(1 - p)\,c_{FP}$: $$p > \frac{c_{FP}}{c_{FP} + c_{FN}}.$$
- **A recall or precision target**, for example "catch 95% of fraud" or "at least 80% of alerts must be real".
- **Capacity**, for example "the review team can check 200 cases a day": flag the top 200 scores.

The default $0.5$ is right only when the two errors cost the same and the probabilities are calibrated.`,
        },
        {
          kind: 'numeric',
          q: md`Missing a fraud case costs 9 times as much as a false alarm. With calibrated probabilities, above which probability should a transaction be flagged?`,
          answer: { kind: 'number', value: 0.1 },
          explain: md`$\frac{c_{FP}}{c_{FP} + c_{FN}} = \frac{1}{1 + 9} = 0.1$. Flag when $p > 0.1$: at $p = 0.1$, the expected costs $0.1\cdot 9$ and $0.9\cdot 1$ are equal.`,
        },
        {
          kind: 'viz',
          viz: { type: 'ml.clf-threshold', dprime: 2, prev: 0.1, t: 0, costs: true, ratio: 9 },
          task: md`Press the **Go to min-cost** button, then read $P(y = 1\mid s = t)$ in the panel. Compare it with $1/(1 + 9)$. Change the cost ratio and the prevalence: in which direction does the best threshold move in each case?`,
          caption: md`The dashed black curve is the true probability of a positive given the score, and the dashed green line is the threshold with the lowest expected cost per example, $c_{FN}\,\pi\,(1 - \text{TPR}) + c_{FP}\,(1 - \pi)\,\text{FPR}$ with $c_{FP} = 1$. At that threshold the probability equals $c_{FP}/(c_{FP} + c_{FN})$.`,
        },
        {
          kind: 'callout',
          tone: 'definition',
          title: 'Calibration',
          md: md`A model is **calibrated** if, among all cases where it predicts probability $p$, a fraction $p$ is positive: $P(y = 1 \mid \hat p = p) = p$. A **reliability diagram** bins the predictions and plots the observed positive rate in each bin against the mean prediction; a calibrated model lies on the diagonal. The **expected calibration error** summarizes the gaps: $\text{ECE} = \sum_b \frac{n_b}{n}\,\lvert\text{acc}_b - \text{conf}_b\rvert$.`,
        },
        {
          kind: 'viz',
          viz: { type: 'ml.clf-calibration', k: 2.5 },
          task: md`With sharpness $k = 2.5$ the model is overconfident. Read the ECE and the log loss, then press **Temperature-scale**. Which numbers change, and which stay exactly the same? Try $k = 0.5$ as well.`,
          caption: md`2000 synthetic cases. The true probability of each is $\sigma(\ell)$, and the model reports $\sigma(k\ell)$. Dividing the logit by a fitted temperature $T$ undoes the distortion. It is monotone, so the ranking, the ROC-AUC and the accuracy at $0.5$ never change; only the probabilities do.`,
        },
        {
          kind: 'text',
          md: md`**When calibration matters, and how to fix it.** Calibrated probabilities are needed whenever the number itself is used: thresholds derived from costs, expected values such as $p\cdot\text{bid}$ in ad auctions, combining models, or showing a risk to a person. Logistic regression trained with cross-entropy is usually close to calibrated on data like its training data; large neural networks are often overconfident, and class reweighting or resampling deliberately shifts the probabilities. Post-hoc fixes are fit on held-out data:

- **Temperature scaling**: $\hat p = \sigma(z/T)$ (or $\softmax(\bz/T)$), one parameter fitted by minimizing log loss.
- **Platt scaling**: $\hat p = \sigma(az + c)$, two parameters.
- **Isotonic regression**: a non-decreasing step function from score to probability; flexible, but needs more data.

The Brier score $\frac1n\sum_i (\hat p_i - y_i)^2$ and the log loss both reward calibration and sharpness together.`,
        },
        {
          kind: 'paper',
          problem: {
            id: 'ml02-3-paper',
            title: 'Threshold from costs and its expected cost',
            type: 'apply',
            difficulty: 2,
            minutes: 12,
            statement: md`A calibrated churn model scores customers. Offering a retention discount to a customer costs 10 (a false positive if they would have stayed), and losing a customer who would have accepted the offer costs 90 (a false negative). (a) Derive the threshold on $p$ above which the offer should be made. (b) Four customers have $p = 0.05, 0.08, 0.3, 0.7$. Who gets the offer, and what is the expected cost of that decision summed over the four? Enter the threshold.`,
            hints: [md`Compare the expected cost of offering, $(1 - p)\cdot 10$, with the expected cost of not offering, $p\cdot 90$.`],
            solution: [
              md`(a) Offer when $p\cdot 90 > (1 - p)\cdot 10$, that is $100p > 10$, so $p > 0.1 = \frac{c_{FP}}{c_{FP} + c_{FN}}$.`,
              md`(b) Offers go to the customers with $p = 0.3$ and $p = 0.7$; not to $0.05$ and $0.08$.`,
              md`Expected costs: not offering costs $0.05\cdot 90 = 4.5$ and $0.08\cdot 90 = 7.2$; offering costs $(1 - 0.3)\cdot 10 = 7$ and $(1 - 0.7)\cdot 10 = 3$.`,
              md`Total: $4.5 + 7.2 + 7 + 3 = 21.7$. Offering to everyone would cost $9.5 + 9.2 + 7 + 3 = 28.7$; offering to no one, $4.5 + 7.2 + 27 + 63 = 101.7$.`,
            ],
            answer: { kind: 'number', value: 0.1 },
            rubric: [md`Expected-cost comparison set up for both actions`, md`Threshold $0.1$ derived`, md`Decisions for the four customers`, md`Expected cost $21.7$, ideally compared with the alternatives`],
          },
        },
        {
          kind: 'explain',
          prompt: md`An interviewer asks: *your fraud data have 0.5% positives. Would you report ROC-AUC or PR-AUC, and why?* Answer in a few sentences.`,
          model: md`ROC-AUC measures how well the scores rank positives above negatives, and it uses TPR and FPR, which are rates within each class, so it does not depend on prevalence. With 0.5% positives that is a weakness: an FPR of 1% sounds small but flags twice as many legitimate transactions as there are frauds, and the ROC curve barely shows the difference between FPR 1% and 0.1%. Precision $= \pi\text{TPR}/(\pi\text{TPR} + (1 - \pi)\text{FPR})$ reflects the class ratio directly, so the PR curve and average precision show what the alert queue will look like; the random baseline is the prevalence, 0.005, not 0.5. I would report PR-AUC plus precision at the recall level the business needs, keep ROC-AUC as a secondary, prevalence-free ranking measure, and make sure the evaluation set has the real-world prevalence.`,
        },
      ],
      cards: [
        { id: 'ml02-3-c1', kind: 'compute', front: md`$TP = 30$, $FP = 10$, $FN = 20$. Compute $F_1$.`, answer: { kind: 'number', value: 2 / 3 }, back: md`$F_1 = \frac{2TP}{2TP + FP + FN} = \frac{60}{90} = 2/3$. (Precision $0.75$, recall $0.6$.)` },
        { id: 'ml02-3-c2', kind: 'concept', front: md`What does ROC-AUC mean as a probability?`, back: md`The probability that a randomly chosen positive gets a higher score than a randomly chosen negative (ties count $\frac12$).` },
        { id: 'ml02-3-c3', kind: 'concept', front: md`Why does the PR curve change with class imbalance while the ROC curve does not?`, back: md`TPR and FPR are rates within each class. Precision $= \pi\,\text{TPR}/(\pi\,\text{TPR} + (1 - \pi)\,\text{FPR})$ depends on the prevalence $\pi$.` },
        { id: 'ml02-3-c4', kind: 'cloze', text: md`With calibrated probabilities, false-positive cost 1 and false-negative cost 4, flag a case when $p$ exceeds {{}}.`, answers: ['0.2'] },
        { id: 'ml02-3-c5', kind: 'concept', front: md`Does temperature scaling change ROC-AUC? Why?`, back: md`No. Dividing logits by $T > 0$ is a monotone transformation, so the ranking and AUC are unchanged; only the probabilities, and so calibration, log loss and Brier score, change.` },
      ],
    },
  ],
  problems: [
    {
      id: 'ml02-p1',
      title: 'Sigmoid and logit values',
      type: 'compute',
      difficulty: 1,
      minutes: 5,
      statement: md`Compute $\sigma(-\ln 4)$, $\operatorname{logit}(0.9)$ and $\sigma'(0)$. Enter the three numbers.`,
      solution: [
        md`$\sigma(-\ln 4) = 1 - \sigma(\ln 4) = 1 - \frac45 = 0.2$.`,
        md`$\operatorname{logit}(0.9) = \ln\frac{0.9}{0.1} = \ln 9 \approx 2.197$.`,
        md`$\sigma'(0) = \sigma(0)(1 - \sigma(0)) = 0.25$, the largest slope of the sigmoid.`,
      ],
      answer: { kind: 'vector', value: [0.2, Math.log(9), 0.25] },
    },
    {
      id: 'ml02-p2',
      title: 'Gradient and Hessian of logistic regression',
      type: 'derive',
      difficulty: 2,
      minutes: 15,
      statement: md`For $L(\bw) = -\frac1n\sum_i \big[y_i\log p_i + (1 - y_i)\log(1 - p_i)\big]$ with $p_i = \sigma(\bw\T\bx_i)$ (bias absorbed into $\bx_i$), derive $\nabla L(\bw) = \frac1n X\T(\mathbf{p} - \by)$ and the Hessian $\nabla^2 L(\bw) = \frac1n X\T SX$ with $S = \operatorname{diag}\big(p_i(1 - p_i)\big)$.`,
      hints: [md`Use $\sigma'(z) = \sigma(z)(1 - \sigma(z))$ and do one example first.`, md`For the Hessian, differentiate $(p_i - y_i)\bx_i$ with respect to $\bw$: only $p_i$ depends on $\bw$.`],
      solution: [
        md`One example: $\ell_i = -y_i\log p_i - (1 - y_i)\log(1 - p_i)$ with $p_i = \sigma(z_i)$, $z_i = \bw\T\bx_i$.`,
        md`$\frac{d\ell_i}{dp_i} = \frac{p_i - y_i}{p_i(1 - p_i)}$ and $\frac{dp_i}{dz_i} = p_i(1 - p_i)$, so $\frac{d\ell_i}{dz_i} = p_i - y_i$.`,
        md`$\nabla_{\bw}z_i = \bx_i$, so $\nabla\ell_i = (p_i - y_i)\bx_i$. Averaging and stacking: $\nabla L = \frac1n\sum_i (p_i - y_i)\bx_i = \frac1n X\T(\mathbf{p} - \by)$.`,
        md`Hessian: $\nabla_{\bw}\big[(p_i - y_i)\bx_i\big] = \bx_i\,(\nabla_{\bw}p_i)\T = p_i(1 - p_i)\,\bx_i\bx_i\T$.`,
        md`Averaging: $\nabla^2 L = \frac1n\sum_i p_i(1 - p_i)\bx_i\bx_i\T = \frac1n X\T SX$.`,
      ],
      rubric: [md`Chain rule with $\sigma' = \sigma(1 - \sigma)$ giving $p - y$`, md`Vectorized gradient $\frac1n X\T(\mathbf{p} - \by)$`, md`Hessian as a weighted sum of outer products`, md`Matrix form $\frac1n X\T SX$`],
      areas: ['ml-depth', 'math'],
    },
    {
      id: 'ml02-p3',
      title: 'Cross-entropy is convex for logistic regression',
      type: 'proof',
      difficulty: 2,
      minutes: 10,
      statement: md`Using the Hessian $\frac1n X\T SX$ from the previous problem, prove that the logistic-regression loss is convex in $\bw$. When is it strictly convex? Contrast with $\frac1n\sum_i (\sigma(\bw\T\bx_i) - y_i)^2$, which is not convex in general: give a one-dimensional example of a direction along which its second derivative is negative.`,
      hints: [md`Compute $\bv\T X\T SX\bv$ as a sum of squares with non-negative weights.`, md`For MSE in one dimension with one example $x = 1$, $y = 1$: $f(w) = (1 - \sigma(w))^2$. Look at large negative $w$.`],
      solution: [
        md`For any $\bv$: $\bv\T\left(\frac1n X\T SX\right)\bv = \frac1n\sum_i p_i(1 - p_i)(\bx_i\T\bv)^2 \ge 0$, since $0 < p_i < 1$. The Hessian is positive semidefinite everywhere, so $L$ is convex.`,
        md`Every weight $p_i(1 - p_i)$ is strictly positive, so the form is $0$ only if $\bx_i\T\bv = 0$ for all $i$, that is $X\bv = \bzero$. If $X$ has independent columns the Hessian is positive definite and $L$ is strictly convex. (A minimizer may still fail to exist, on separable data.)`,
        md`MSE example: $f(w) = (1 - \sigma(w))^2$. Then $f'(w) = -2(1 - \sigma)\sigma(1 - \sigma) = -2\sigma(1 - \sigma)^2$.`,
        md`For very negative $w$, $\sigma(w) \approx e^{w}$ and $f'(w) \approx -2e^{w}$, which becomes more negative as $w$ increases, so $f''(w) \approx -2e^{w} < 0$ there: $f$ is concave in that region, hence not convex. This is the flat shoulder seen in the figure.`,
      ],
      rubric: [md`Quadratic form written as a weighted sum of squares`, md`Positivity of $p(1 - p)$ used`, md`Strict convexity condition stated`, md`Concrete non-convexity of MSE shown`],
      areas: ['ml-depth', 'math'],
    },
    {
      id: 'ml02-p4',
      title: 'Loss and gradient for one example',
      type: 'compute',
      difficulty: 1,
      minutes: 6,
      statement: md`A logistic-regression model has $\bw = (1, -1)$ and $b = 0.5$. For the example $\bx = (1, 2)$ with label $y = 0$, compute $p$, the loss, and the gradient. Enter $[\partial\ell/\partial w_1,\ \partial\ell/\partial w_2,\ \partial\ell/\partial b]$.`,
      solution: [
        md`$z = 1 - 2 + 0.5 = -0.5$, so $p = \sigma(-0.5) = 1/(1 + e^{0.5}) \approx 0.3775$.`,
        md`With $y = 0$ the loss is $-\log(1 - p) = \log(1 + e^{z}) = \log(1 + e^{-0.5}) \approx 0.474$.`,
        md`$p - y = 0.3775$, so $\nabla_{\bw}\ell = 0.3775\cdot(1, 2) = (0.3775, 0.7551)$ and $\partial\ell/\partial b = 0.3775$.`,
      ],
      answer: { kind: 'vector', value: [1 / (1 + Math.exp(0.5)), 2 / (1 + Math.exp(0.5)), 1 / (1 + Math.exp(0.5))], tol: 1e-3 },
    },
    {
      id: 'ml02-p5',
      title: 'The softmax cross-entropy gradient',
      type: 'derive',
      difficulty: 2,
      minutes: 12,
      statement: md`(a) Compute the Jacobian of $\mathbf{p} = \softmax(\bz)$: show $\frac{\partial p_k}{\partial z_j} = p_k([k = j] - p_j)$, that is $\operatorname{diag}(\mathbf{p}) - \mathbf{p}\mathbf{p}\T$. (b) Use it to derive $\nabla_{\bz}\big(-\sum_k y_k\log p_k\big) = \mathbf{p} - \mathbf{y}$ for a one-hot $\mathbf{y}$. (c) For $\bz = W\bx$, give $\nabla_W\ell$.`,
      solution: [
        md`(a) $\log p_k = z_k - \log\sum_i e^{z_i}$, so $\frac{\partial\log p_k}{\partial z_j} = [k = j] - p_j$, and $\frac{\partial p_k}{\partial z_j} = p_k\frac{\partial\log p_k}{\partial z_j} = p_k([k = j] - p_j)$.`,
        md`(b) $\frac{\partial\ell}{\partial z_j} = -\sum_k y_k\frac{\partial\log p_k}{\partial z_j} = -\sum_k y_k([k = j] - p_j) = -y_j + p_j\sum_k y_k$.`,
        md`Since $\mathbf{y}$ is one-hot (or any probability vector), $\sum_k y_k = 1$, so $\frac{\partial\ell}{\partial z_j} = p_j - y_j$.`,
        md`(c) $z_k = \bw_k\T\bx$ where $\bw_k$ is row $k$ of $W$, so $\frac{\partial\ell}{\partial W_{kj}} = (p_k - y_k)x_j$: $\nabla_W\ell = (\mathbf{p} - \mathbf{y})\bx\T$, an outer product of shape $K\times d$.`,
      ],
      rubric: [md`Jacobian derived (via $\log p_k$ or the quotient rule)`, md`Uses $\sum_k y_k = 1$`, md`Result $\mathbf{p} - \mathbf{y}$`, md`Outer-product form for $W$`],
      areas: ['ml-depth', 'math'],
    },
    {
      id: 'ml02-p6',
      title: 'Metrics from a confusion matrix',
      type: 'compute',
      difficulty: 1,
      minutes: 6,
      statement: md`A classifier evaluated on 200 cases has $TP = 30$, $FP = 10$, $FN = 20$, $TN = 140$. Compute precision, recall, $F_1$ and specificity. Enter the four numbers in that order.`,
      solution: [
        md`Precision $= 30/40 = 0.75$; recall $= 30/50 = 0.6$.`,
        md`$F_1 = \frac{2\cdot 30}{60 + 10 + 20} = \frac{60}{90} = \frac23 \approx 0.667$ (equivalently $\frac{2\cdot 0.75\cdot 0.6}{1.35}$).`,
        md`Specificity $= 140/150 \approx 0.933$. Accuracy $= 170/200 = 0.85$.`,
      ],
      answer: { kind: 'vector', value: [0.75, 0.6, 2 / 3, 14 / 15] },
    },
    {
      id: 'ml02-p7',
      title: 'AUC with a tie',
      type: 'compute',
      difficulty: 1,
      minutes: 6,
      statement: md`Positives score $0.8, 0.5, 0.3$; negatives score $0.6, 0.5, 0.2$. Compute the ROC-AUC as the fraction of correctly ordered (positive, negative) pairs, counting ties as $\tfrac12$.`,
      solution: [
        md`There are $3\cdot 3 = 9$ pairs.`,
        md`$0.8$ beats $0.6, 0.5, 0.2$: 3. $0.5$ loses to $0.6$, ties $0.5$ ($\tfrac12$), beats $0.2$: $1.5$. $0.3$ beats only $0.2$: 1.`,
        md`AUC $= (3 + 1.5 + 1)/9 = 5.5/9 \approx 0.611$.`,
      ],
      answer: { kind: 'number', value: 5.5 / 9 },
    },
    {
      id: 'ml02-p8',
      title: 'Same model, different prevalence',
      type: 'apply',
      difficulty: 2,
      minutes: 8,
      statement: md`At a fixed threshold a model has TPR $0.8$ and FPR $0.1$. It was validated on a balanced set (50% positives) and is deployed where 2% of cases are positive. Compute the precision in each setting, and say what happens to the ROC point. Enter [precision balanced, precision deployed].`,
      solution: [
        md`Balanced: $\frac{0.5\cdot 0.8}{0.5\cdot 0.8 + 0.5\cdot 0.1} = \frac{0.4}{0.45} \approx 0.889$.`,
        md`Deployed: $\frac{0.02\cdot 0.8}{0.02\cdot 0.8 + 0.98\cdot 0.1} = \frac{0.016}{0.114} \approx 0.140$.`,
        md`The ROC point $(0.1, 0.8)$ is the same in both settings, since TPR and FPR are per-class rates. Precision, and therefore the PR curve, depends on prevalence: evaluate on data with the deployment class balance.`,
      ],
      answer: { kind: 'vector', value: [0.4 / 0.45, 0.016 / 0.114] },
    },
    {
      id: 'ml02-p9',
      title: 'No maximum likelihood estimate on separable data',
      type: 'proof',
      difficulty: 3,
      minutes: 15,
      statement: md`Suppose some $(\bw_0, b_0)$ separates the data strictly: $y_i = 1 \Rightarrow \bw_0\T\bx_i + b_0 > 0$ and $y_i = 0 \Rightarrow \bw_0\T\bx_i + b_0 < 0$. Prove that the logistic loss $L(\bw, b)$ has infimum $0$ but no minimizer. What does gradient descent do, and name two remedies.`,
      hints: [md`Write each example's loss as $\log(1 + e^{-s_iz_i})$ with $s_i = 2y_i - 1 \in \{-1, 1\}$.`, md`Consider $L(c\bw_0, cb_0)$ as $c \to \infty$.`],
      solution: [
        md`With $s_i = 2y_i - 1$ and $z_i = \bw\T\bx_i + b$, each example's loss is $\log(1 + e^{-s_iz_i}) > 0$. So $L > 0$ for every finite $(\bw, b)$.`,
        md`Separability means $m_i = s_i(\bw_0\T\bx_i + b_0) > 0$ for all $i$. At $(c\bw_0, cb_0)$ the loss is $\frac1n\sum_i\log(1 + e^{-cm_i})$, which tends to $0$ as $c \to \infty$. So the infimum is $0$.`,
        md`An infimum of $0$ that is never attained (since $L > 0$ everywhere) means there is no minimizer, and no finite maximum-likelihood estimate.`,
        md`Gradient descent keeps decreasing the loss by growing $\lVert\bw\rVert$ without bound (slowly), pushing probabilities to 0 and 1. Remedies: an L2 or L1 penalty (the regularized objective tends to $+\infty$ as $\lVert\bw\rVert \to \infty$, so a minimizer exists), or early stopping.`,
      ],
      rubric: [md`Loss strictly positive for finite parameters`, md`Scaling argument showing the infimum is 0`, md`Concludes no minimizer exists`, md`Describes GD behaviour and gives remedies`],
      areas: ['ml-depth'],
    },
    {
      id: 'ml02-p10',
      title: 'A cost-sensitive threshold',
      type: 'apply',
      difficulty: 2,
      minutes: 6,
      statement: md`A medical screening model outputs calibrated probabilities. A missed case costs 20 times as much as an unnecessary follow-up test. (a) Give the probability threshold. (b) If the model were overconfident (probabilities pushed towards 0 and 1), would applying this threshold to its raw outputs flag too many or too few cases? Enter the threshold.`,
      solution: [
        md`(a) Flag when $p > \frac{c_{FP}}{c_{FP} + c_{FN}} = \frac{1}{1 + 20} = \frac{1}{21} \approx 0.048$.`,
        md`(b) An overconfident model reports small probabilities as even smaller. Cases whose true probability is just above $1/21$ get raw scores below it, so the rule flags **too few** cases near the threshold.`,
        md`Calibrate first, for example with temperature scaling on held-out data, or pick the threshold directly on validation data by minimizing the empirical cost.`,
      ],
      answer: { kind: 'number', value: 1 / 21 },
    },
  ],
};
