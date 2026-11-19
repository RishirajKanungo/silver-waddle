import { md, type Module } from '../types';

export const MODULE: Module = {
  id: 'calc02',
  part: 'calc',
  order: 2,
  title: 'Probability and statistics',
  summary: 'Random variables, expectation and variance, the limit theorems, Bayes\' rule, the standard distributions including the multivariate Gaussian, maximum likelihood, MAP, and hypothesis tests for A/B experiments.',
  relevance: md`Loss functions are probability models in disguise: mean squared error is a Gaussian likelihood, cross-entropy is a categorical one, and L2 regularization is a Gaussian prior. Evaluation is statistics: a test-set accuracy has a standard error, and comparing two models or two product variants is a hypothesis test. Interviews for ML roles routinely include Bayes' rule with base rates, deriving an MLE, explaining a p-value correctly, and sizing an A/B test.`,
  areas: ['math', 'ml-breadth', 'ml-depth'],
  prereqs: ['calc01'],
  lessons: [
    // ------------------------------------------------------------------ 2.1
    {
      id: 'calc02-1',
      title: 'Random variables, the limit theorems and Bayes\' rule',
      minutes: 40,
      objectives: [
        'Compute the mean, variance and covariance of a small discrete random variable.',
        'Use linearity of expectation and the variance rule for sums of independent variables.',
        'State the law of large numbers and the central limit theorem, including the σ/√n scaling of the standard error.',
        'Apply Bayes\' theorem with base rates to a diagnostic-test or spam-filter problem.',
      ],
      cells: [
        {
          kind: 'text',
          md: md`A classifier scores 90% accuracy on 400 test examples. On a different 400 examples it would score something slightly different, so the measured accuracy is itself a random quantity. How much it varies decides whether a 1-point improvement means anything. The tools for that question are random variables, their means and variances, and the limit theorems.

A **random variable** $X$ is a numerical outcome of a random experiment. A discrete one is described by its **probability mass function** $p(x) = \P(X = x)$, with $\sum_x p(x) = 1$. A continuous one has a **density** $f(x) \ge 0$ with $\P(a \le X \le b) = \int_a^b f(x)\,dx$.`,
        },
        {
          kind: 'callout',
          tone: 'definition',
          title: 'Expectation, variance, covariance, independence',
          md: md`- **Expectation** (mean): $\E[X] = \sum_x x\,p(x)$, or $\int x f(x)\,dx$. More generally $\E[g(X)] = \sum_x g(x)\,p(x)$.
- **Variance**: $\Var(X) = \E[(X - \mu)^2] = \E[X^2] - \mu^2$, where $\mu = \E[X]$. The **standard deviation** is $\sigma = \sqrt{\Var(X)}$.
- **Covariance**: $\Cov(X, Y) = \E[(X - \mu_X)(Y - \mu_Y)] = \E[XY] - \E[X]\E[Y]$. **Correlation**: $\rho = \Cov(X, Y)/(\sigma_X\sigma_Y) \in [-1, 1]$.
- $X$ and $Y$ are **independent** if $\P(X = x, Y = y) = \P(X = x)\,\P(Y = y)$ for all $x, y$.`,
        },
        {
          kind: 'callout',
          tone: 'example',
          title: 'Worked example',
          md: md`$X$ takes the values $0, 1, 2$ with probabilities $0.5, 0.3, 0.2$. Then $\E[X] = 0 + 0.3 + 0.4 = 0.7$, $\E[X^2] = 0 + 0.3 + 0.8 = 1.1$ and $\Var(X) = 1.1 - 0.7^2 = 0.61$.`,
        },
        {
          kind: 'numeric',
          q: md`$X$ takes the values $1, 2, 3$ with probabilities $0.2, 0.5, 0.3$. Compute $[\E[X], \Var(X)]$.`,
          answer: { kind: 'vector', value: [2.1, 0.49] },
          hints: [md`$\E[X^2] = 0.2\cdot 1 + 0.5\cdot 4 + 0.3\cdot 9$.`],
          explain: md`$\E[X] = 0.2 + 1.0 + 0.9 = 2.1$. $\E[X^2] = 0.2 + 2.0 + 2.7 = 4.9$. $\Var(X) = 4.9 - 2.1^2 = 4.9 - 4.41 = 0.49$.`,
        },
        {
          kind: 'callout',
          tone: 'theorem',
          title: 'Rules for sums',
          md: md`For any random variables and constants:

- $\E[aX + bY + c] = a\,\E[X] + b\,\E[Y] + c$ (**linearity**, true even when $X$ and $Y$ are dependent)
- $\Var(aX + b) = a^2\Var(X)$
- $\Var(X + Y) = \Var(X) + \Var(Y) + 2\Cov(X, Y)$

If $X$ and $Y$ are independent, $\Cov(X, Y) = 0$ and variances add. The converse fails: zero covariance does not imply independence.`,
        },
        {
          kind: 'check',
          q: md`$X$ is uniform on $\{-1, 0, 1\}$ and $Y = X^2$. Which statement is true?`,
          options: [md`$\Cov(X, Y) = 0$, yet $X$ and $Y$ are dependent.`, md`$\Cov(X, Y) = 0$, so $X$ and $Y$ are independent.`, md`$\Cov(X, Y) > 0$ because $Y$ grows with $|X|$.`, md`$\Cov(X, Y)$ is undefined because $Y$ is a function of $X$.`],
          answer: 0,
          explain: md`$\E[X] = 0$ and $\E[XY] = \E[X^3] = 0$, so $\Cov(X, Y) = 0$. But $Y$ is completely determined by $X$: $\P(Y = 0 \mid X = 0) = 1 \ne \P(Y = 0) = 1/3$. Covariance only detects **linear** association.`,
        },
        {
          kind: 'derive',
          title: 'the standard error of a mean',
          goal: md`Let $X_1, \dots, X_n$ be independent with mean $\mu$ and variance $\sigma^2$, and $\bar X = \frac1n\sum_i X_i$. Show $\E[\bar X] = \mu$ and $\Var(\bar X) = \sigma^2/n$.`,
          steps: [
            { md: md`Linearity: $\E[\bar X] = \frac1n\sum_i\E[X_i] = \frac1n\cdot n\mu = \mu$.` },
            {
              md: md`Pull out the constant: $\Var(\bar X) = \frac{1}{n^2}\Var\!\left(\sum_i X_i\right)$.`,
              choose: {
                prompt: md`What happens to the factor $\frac1n$ when it leaves the variance?`,
                options: [md`It is squared: $\frac{1}{n^2}$`, md`It stays $\frac1n$`, md`It disappears because variance ignores constants`],
                answer: 0,
                explain: md`$\Var(aZ) = a^2\Var(Z)$. Variance is measured in squared units.`,
              },
            },
            {
              md: md`The $X_i$ are independent, so all covariances vanish and $\Var\!\left(\sum_i X_i\right) = \sum_i\Var(X_i) = n\sigma^2$.`,
              choose: {
                prompt: md`Which fact lets the variance of the sum split into a sum of variances?`,
                options: [md`Independence, so every $\Cov(X_i, X_j) = 0$ for $i \ne j$`, md`Linearity of expectation`, md`The central limit theorem`],
                answer: 0,
                explain: md`Linearity holds for means without any assumption. Variances add only when the covariance terms are zero.`,
              },
            },
            { md: md`So $\Var(\bar X) = \frac{n\sigma^2}{n^2} = \frac{\sigma^2}{n}$, and the standard deviation of $\bar X$, the **standard error**, is $\sigma/\sqrt n$.` },
          ],
          takeaway: md`The error of an average shrinks like $1/\sqrt n$: four times the data halves it. This scaling governs test-set evaluation, minibatch gradient noise and A/B test sizing.`,
        },
        {
          kind: 'callout',
          tone: 'theorem',
          title: 'Law of large numbers and central limit theorem',
          md: md`Let $X_1, X_2, \dots$ be independent and identically distributed (i.i.d.) with mean $\mu$ and finite variance $\sigma^2$.

- **LLN**: $\bar X_n \to \mu$ as $n \to \infty$. Averages settle at the mean.
- **CLT**: for large $n$, $\dfrac{\bar X_n - \mu}{\sigma/\sqrt n}$ is approximately $N(0, 1)$, **whatever the shape** of the distribution of $X_i$. Equivalently $\bar X_n \approx N(\mu, \sigma^2/n)$.`,
        },
        {
          kind: 'viz',
          viz: { type: 'calc.clt', source: 'exp', n: 2 },
          task: md`Set $n = 1$: the histogram is the skewed exponential itself. Increase $n$ to 5, 15 and 50, and compare the measured skewness of the means with $2/\sqrt n$. Then switch to **standardized** and to the **Bernoulli** source, which is even more skewed.`,
          caption: md`Each bar counts sample means of $n$ draws. With the raw scale the histogram narrows around $\mu$ (the LLN, width $\sigma/\sqrt n$). On the standardized scale it approaches the fixed $N(0, 1)$ curve (the CLT). Skewness fades like $1/\sqrt n$, so a very skewed source such as a rare binary event needs a larger $n$ before the normal approximation is good.`,
        },
        {
          kind: 'numeric',
          q: md`A model is correct on each test example independently with probability about $0.9$. On $n = 400$ examples, what is the standard error of the measured accuracy?`,
          answer: { kind: 'number', value: 0.015 },
          hints: [md`Each example is a Bernoulli variable with variance $p(1 - p)$. The accuracy is their average.`],
          explain: md`$\sigma = \sqrt{0.9\cdot 0.1} = 0.3$, so the standard error is $0.3/\sqrt{400} = 0.015$. By the CLT a 95% range is about $\pm 1.96\cdot 0.015 \approx \pm 3$ points, so a 1-point difference between two models on this test set is well within noise.`,
        },
        {
          kind: 'code',
          code: `import numpy as np

np.random.seed(0)
for n in [1, 4, 16, 64]:
    means = np.random.exponential(1.0, size=(5000, n)).mean(axis=1)
    print(n, np.round(means.mean(), 3), np.round(means.std(), 3))`,
          note: md`Each row averages $n$ exponential draws, 5000 times. The mean stays near $\mu = 1$ and the spread falls near $1/\sqrt n$: $1, 0.5, 0.25, 0.125$.`,
        },
        {
          kind: 'text',
          md: md`**Bayes' theorem** turns $\P(B \mid A)$ into $\P(A \mid B)$. A medical test is described by its **sensitivity** $\P(+ \mid D)$ and **specificity** $\P(- \mid \text{no } D)$, but a patient with a positive result wants $\P(D \mid +)$. These are different numbers, and the **base rate** (prevalence) $\P(D)$ connects them.`,
        },
        {
          kind: 'callout',
          tone: 'theorem',
          title: 'Bayes\' theorem',
          md: md`$$\P(A \mid B) = \frac{\P(B \mid A)\,\P(A)}{\P(B)}, \qquad \P(B) = \sum_i \P(B \mid A_i)\,\P(A_i)$$ for events $A_i$ that partition the outcomes. In words: posterior $\propto$ likelihood $\times$ prior, normalized by the total probability of the evidence.`,
        },
        {
          kind: 'viz',
          viz: { type: 'calc.bayes', prev: 0.01, sens: 0.9, spec: 0.95 },
          task: md`With 1% prevalence, 90% sensitivity and 95% specificity, read $\P(D \mid +)$. Which helps more: raising sensitivity to 100% or raising specificity to 99.5%? Then set the prevalence to 20%.`,
          caption: md`Out of 10,000 people, 100 are sick and 90 of them test positive, but 5% of the 9,900 healthy people, 495, also test positive. Only $90/585 \approx 15.4\%$ of positives are sick. Raising specificity to 99.5% cuts false positives to about 50 and lifts the posterior to about 64.5%; perfect sensitivity only gets to about 16.8%. When the condition is rare, false positives dominate.`,
        },
        {
          kind: 'derive',
          title: 'Bayes in odds form',
          goal: md`Show that posterior odds = likelihood ratio × prior odds, where odds$(D) = \P(D)/\P(\text{no } D)$ and $\text{LR}_+ = \P(+ \mid D)/\P(+ \mid \text{no } D)$.`,
          steps: [
            { md: md`Write Bayes for both hypotheses: $\P(D \mid +) = \dfrac{\P(+\mid D)\P(D)}{\P(+)}$ and $\P(\text{no } D \mid +) = \dfrac{\P(+\mid\text{no } D)\P(\text{no } D)}{\P(+)}$.` },
            {
              md: md`Divide the first by the second. The awkward normalizer $\P(+)$ cancels: $$\frac{\P(D \mid +)}{\P(\text{no } D \mid +)} = \frac{\P(+\mid D)}{\P(+\mid\text{no } D)}\cdot\frac{\P(D)}{\P(\text{no } D)}.$$`,
              choose: {
                prompt: md`Why is the ratio of the two posteriors easier to compute than either posterior?`,
                options: [md`The denominator $\P(+)$ is the same in both and cancels`, md`Ratios of probabilities are always 1`, md`Because the likelihoods cancel`],
                answer: 0,
                explain: md`Both posteriors are divided by the same total probability of the evidence, so it drops out of the ratio.`,
              },
            },
            { md: md`Example: prior odds $0.01/0.99 = 1/99$ and $\text{LR}_+ = 0.9/0.05 = 18$, so posterior odds $= 18/99$ and $\P(D \mid +) = \dfrac{18}{18 + 99} \approx 0.154$.` },
          ],
          takeaway: md`Each independent piece of evidence multiplies the odds by its likelihood ratio. Naive Bayes classifiers do exactly this, summing log-likelihood ratios over features.`,
        },
        {
          kind: 'numeric',
          q: md`20% of emails are spam. The word "free" appears in 40% of spam emails and in 5% of legitimate ones. An email contains "free". What is the probability it is spam?`,
          answer: { kind: 'number', value: 2 / 3 },
          explain: md`$\P(\text{spam} \mid \text{free}) = \dfrac{0.4\cdot 0.2}{0.4\cdot 0.2 + 0.05\cdot 0.8} = \dfrac{0.08}{0.12} = \dfrac23$. In odds: prior odds $1/4$, likelihood ratio $8$, posterior odds $2$.`,
        },
        {
          kind: 'paper',
          problem: {
            id: 'calc02-1-paper',
            title: 'Two positive tests',
            type: 'apply',
            difficulty: 2,
            minutes: 8,
            statement: md`A condition has prevalence 1%. A test has sensitivity 90% and specificity 95%. A patient tests positive twice, and the two results are independent given the patient's true status. What is the probability that the patient has the condition?`,
            hints: [md`Use the odds form: each positive multiplies the odds by $\text{LR}_+ = 0.9/0.05$.`],
            solution: [
              md`Prior odds: $0.01/0.99 = 1/99$.`,
              md`Likelihood ratio of one positive: $\text{LR}_+ = 0.9/0.05 = 18$. Independence given status means the likelihood of two positives is the product, so the odds are multiplied by $18^2 = 324$.`,
              md`Posterior odds $= 324/99$, so $\P(D \mid ++) = \dfrac{324}{324 + 99} = \dfrac{324}{423} \approx 0.766$.`,
              md`One positive gave 15.4%; the second raises it to 76.6%. The independence assumption matters: if both tests fail for the same reason, the second result carries less information.`,
            ],
            answer: { kind: 'number', value: 324 / 423, tol: 1e-3 },
          },
        },
        {
          kind: 'code',
          code: `import numpy as np

np.random.seed(1)
N = 200_000
sick = np.random.rand(N) < 0.01
positive = np.where(sick, np.random.rand(N) < 0.90, np.random.rand(N) < 0.05)
print(round(float(sick[positive].mean()), 3))`,
          predict: {
            q: md`This simulates 200,000 people with the numbers above and prints the fraction of positives who are sick. Which value is printed (to three decimals)?`,
            options: ['`0.153`', '`0.9`', '`0.01`', '`0.5`'],
            answer: 0,
            explain: md`Close to the exact $0.154$, with sampling noise. $0.9$ is the sensitivity $\P(+ \mid D)$, the classic confusion with $\P(D \mid +)$.`,
          },
        },
        {
          kind: 'recall',
          prompt: md`State linearity of expectation, the variance of a sum of independent variables, the standard error of a mean, and Bayes' theorem.`,
          answer: md`$\E[aX + bY] = a\E[X] + b\E[Y]$ always. For independent $X, Y$: $\Var(X + Y) = \Var(X) + \Var(Y)$. The mean of $n$ i.i.d. draws has standard error $\sigma/\sqrt n$. $\P(A \mid B) = \P(B \mid A)\P(A)/\P(B)$.`,
        },
      ],
      cards: [
        { id: 'calc02-1-c1', kind: 'concept', front: md`Two formulas for $\Var(X)$.`, back: md`$\E[(X - \mu)^2]$ and $\E[X^2] - (\E[X])^2$.` },
        { id: 'calc02-1-c2', kind: 'cloze', text: md`The standard error of the mean of $n$ i.i.d. draws with standard deviation $\sigma$ is $\sigma$ divided by {{}}.`, answers: ['sqrt(n)'] },
        { id: 'calc02-1-c3', kind: 'compute', front: md`Prevalence 2%, sensitivity 100%, specificity 98%. Compute $\P(D \mid +)$.`, answer: { kind: 'number', value: 0.02 / (0.02 + 0.02 * 0.98) }, back: md`$\dfrac{0.02}{0.02 + 0.02\cdot 0.98} = \dfrac{1}{1.98} \approx 0.505$.` },
        { id: 'calc02-1-c4', kind: 'concept', front: md`Does zero covariance imply independence?`, back: md`No. Covariance measures only linear association. Example: $X$ uniform on $\{-1, 0, 1\}$ and $Y = X^2$.` },
        { id: 'calc02-1-c5', kind: 'concept', front: md`State the central limit theorem in one line.`, back: md`For i.i.d. draws with finite variance, $(\bar X_n - \mu)/(\sigma/\sqrt n)$ is approximately $N(0, 1)$ for large $n$, whatever the original distribution.` },
      ],
    },
    // ------------------------------------------------------------------ 2.2
    {
      id: 'calc02-2',
      title: 'Distributions and the multivariate Gaussian',
      minutes: 35,
      objectives: [
        'State the pmf or pdf, mean and variance of the Bernoulli, binomial, Poisson, uniform and Gaussian distributions, and describe the categorical distribution.',
        'Choose a distribution to model a given quantity: a click, a count, a class label, a measurement.',
        'Write the multivariate Gaussian density and read variances and correlations from a covariance matrix.',
        'Explain why the axes of a Gaussian\'s density ellipses are the eigenvectors of Σ, with lengths √λ.',
      ],
      cells: [
        {
          kind: 'text',
          md: md`Choosing a loss function is choosing a distribution for the target. Regression with squared error assumes Gaussian noise; binary classification with log loss assumes a Bernoulli label; next-token prediction uses a categorical distribution over the vocabulary; count models such as requests per minute use the Poisson. Knowing the handful of standard distributions, with their means and variances, makes these choices explicit.`,
        },
        {
          kind: 'callout',
          tone: 'definition',
          title: 'The standard distributions',
          md: md`| name | values | pmf / pdf | mean | variance | typical use |
|---|---|---|---|---|---|
| Bernoulli$(p)$ | $\{0, 1\}$ | $p^x(1-p)^{1-x}$ | $p$ | $p(1-p)$ | a click, a binary label |
| Binomial$(n, p)$ | $0, \dots, n$ | $\binom nk p^k(1-p)^{n-k}$ | $np$ | $np(1-p)$ | successes in $n$ trials |
| Categorical$(\bp)$ | $1, \dots, K$ | $p_k$ | none | none | class labels, next token |
| Poisson$(\lambda)$ | $0, 1, 2, \dots$ | $e^{-\lambda}\lambda^k/k!$ | $\lambda$ | $\lambda$ | counts per time window |
| Uniform$(a, b)$ | $[a, b]$ | $\frac{1}{b-a}$ | $\frac{a+b}{2}$ | $\frac{(b-a)^2}{12}$ | initialization, random search |
| Gaussian $N(\mu, \sigma^2)$ | $\R$ | $\frac{1}{\sqrt{2\pi}\sigma}e^{-\frac{(x-\mu)^2}{2\sigma^2}}$ | $\mu$ | $\sigma^2$ | noise, measurements |

A categorical outcome is a label, so it has no mean; written as a one-hot vector $\be_k$, its mean is the probability vector $\bp$.`,
        },
        {
          kind: 'viz',
          viz: { type: 'calc.dists', dist: 'binom' },
          task: md`Set $n = 40$, $p = 0.5$ and turn on the normal approximation. Then lower $p$ to $0.03$: where does the approximation fail? Finally switch to **categorical** and move the temperature $T$ from 0.1 to 5.`,
          caption: md`The binomial is a sum of $n$ Bernoullis, so by the CLT it looks normal when $np(1-p)$ is large. With $p = 0.03$ and $n = 40$ the mass piles up at 0 and 1 and the normal curve puts weight on negative counts. The categorical panel is temperature sampling: dividing the scores by $T$ before the softmax sharpens or flattens the distribution.`,
        },
        {
          kind: 'numeric',
          q: md`A classifier is correct on each example independently with probability $0.8$. On 5 examples, what is the probability that exactly 4 are correct?`,
          answer: { kind: 'number', value: 0.4096 },
          hints: [md`Binomial: $\binom54(0.8)^4(0.2)^1$.`],
          explain: md`$\binom54 = 5$, so $5\cdot 0.8^4\cdot 0.2 = 5\cdot 0.4096\cdot 0.2 = 0.4096$. The most likely single outcome, but still well under one half.`,
        },
        {
          kind: 'check',
          q: md`A service receives on average 3 requests per second, arriving independently. Which model fits the number of requests in one second, and what is its variance?`,
          options: [md`Poisson with $\lambda = 3$; variance $3$`, md`Binomial with $n = 3$; variance $0.75$`, md`Gaussian with $\mu = 3$, $\sigma = 1$; variance $1$`, md`Uniform on $\{0, \dots, 6\}$; variance $4$`],
          answer: 0,
          explain: md`Counts of independent events at a constant average rate follow a Poisson distribution, whose mean and variance are both $\lambda$. Data where the variance is much larger than the mean ("overdispersed") call for other count models.`,
        },
        {
          kind: 'derive',
          title: 'mean and variance of the binomial',
          goal: md`Show that $X \sim \text{Binomial}(n, p)$ has $\E[X] = np$ and $\Var(X) = np(1 - p)$.`,
          steps: [
            { md: md`Write $X = B_1 + \dots + B_n$, where $B_i \in \{0, 1\}$ indicates success on trial $i$. The $B_i$ are independent Bernoulli$(p)$.` },
            { md: md`For one Bernoulli: $\E[B] = p$, and since $B^2 = B$, $\E[B^2] = p$, so $\Var(B) = p - p^2 = p(1 - p)$.` },
            {
              md: md`Linearity gives $\E[X] = np$. Independence gives $\Var(X) = \sum_i\Var(B_i) = np(1 - p)$.`,
              choose: {
                prompt: md`Which properties finish the proof?`,
                options: [md`Linearity of expectation for the mean, independence for the variance`, md`Independence for both`, md`The CLT`],
                answer: 0,
                explain: md`The mean of a sum needs no assumption. The variance of a sum is the sum of variances only when the covariances are zero, which independence guarantees.`,
              },
            },
          ],
          takeaway: md`Writing a count as a sum of indicators is the standard trick for means and variances of counts.`,
        },
        {
          kind: 'callout',
          tone: 'definition',
          title: 'Multivariate Gaussian',
          md: md`$\bx \in \R^d$ is Gaussian with mean $\bmu$ and covariance $\bSigma$ (symmetric positive definite), written $\bx \sim N(\bmu, \bSigma)$, if its density is $$p(\bx) = \frac{1}{(2\pi)^{d/2}\det(\bSigma)^{1/2}}\exp\!\left(-\tfrac12(\bx - \bmu)\T\bSigma^{-1}(\bx - \bmu)\right).$$ $\Sigma_{ii} = \Var(x_i)$ and $\Sigma_{ij} = \Cov(x_i, x_j)$. The density is constant on the ellipsoids $(\bx - \bmu)\T\bSigma^{-1}(\bx - \bmu) = c^2$; the square root of the left side is the **Mahalanobis distance** from $\bmu$.`,
        },
        {
          kind: 'viz',
          viz: { type: 'calc.gauss2d', s1: 1.5, s2: 1, rho: 0.6 },
          task: md`Set $\rho = 0$: the ellipse's axes line up with the coordinate axes. Then set $\sigma_1 = \sigma_2 = 1$ with $\rho = 0.9$ and read $\lambda_1, \lambda_2$. Finally drive $\rho$ to $-0.9$.`,
          caption: md`With $\sigma_1 = \sigma_2 = 1$ and correlation $\rho$, $\Sigma = \begin{bmatrix}1 & \rho\\ \rho & 1\end{bmatrix}$ has eigenvalues $1 \pm \rho$ along the diagonals $(1, 1)$ and $(1, -1)$. Strong correlation means one long axis and one short one: the data are nearly one-dimensional, which is what PCA in the SVD module detects.`,
        },
        {
          kind: 'derive',
          title: 'why the ellipse axes are eigenvectors',
          goal: md`Show that the level set $(\bx - \bmu)\T\bSigma^{-1}(\bx - \bmu) = 1$ is an ellipse whose axes point along the eigenvectors $\mathbf{q}_i$ of $\bSigma$, with semi-axis lengths $\sqrt{\lambda_i}$.`,
          steps: [
            { md: md`$\bSigma$ is symmetric, so by the spectral theorem $\bSigma = Q\Lambda Q\T$ with orthogonal $Q = [\mathbf{q}_1\ \mathbf{q}_2]$ and $\Lambda = \diag(\lambda_1, \lambda_2)$, all $\lambda_i > 0$.` },
            {
              md: md`Then $\bSigma^{-1} = Q\Lambda^{-1}Q\T$. Set $\bz = Q\T(\bx - \bmu)$, the coordinates of $\bx - \bmu$ in the eigenbasis: $$(\bx - \bmu)\T\bSigma^{-1}(\bx - \bmu) = \bz\T\Lambda^{-1}\bz = \frac{z_1^2}{\lambda_1} + \frac{z_2^2}{\lambda_2}.$$`,
              choose: {
                prompt: md`What is the inverse of $Q\Lambda Q\T$ when $Q$ is orthogonal?`,
                options: [md`$Q\Lambda^{-1}Q\T$`, md`$Q\T\Lambda^{-1}Q$`, md`$\Lambda^{-1}$`],
                answer: 0,
                explain: md`$(Q\Lambda Q\T)(Q\Lambda^{-1}Q\T) = Q\Lambda\Lambda^{-1}Q\T = QQ\T = I$, using $Q\T Q = I$.`,
              },
            },
            { md: md`$\frac{z_1^2}{\lambda_1} + \frac{z_2^2}{\lambda_2} = 1$ is an axis-aligned ellipse in $\bz$-coordinates with semi-axes $\sqrt{\lambda_1}$ and $\sqrt{\lambda_2}$.` },
            { md: md`$\bx - \bmu = Q\bz$ rotates the $z$-axes onto $\mathbf{q}_1, \mathbf{q}_2$. So the ellipse in $\bx$ has its axes along the eigenvectors, with lengths $\sqrt{\lambda_i}$. In the $\bz$ coordinates the components are uncorrelated with variances $\lambda_i$.` },
          ],
          takeaway: md`Eigenvectors of a covariance matrix are the directions of independent variation, and eigenvalues are the variances along them. This is PCA.`,
        },
        {
          kind: 'numeric',
          q: md`$\bx = (x_1, x_2)$ has covariance $\bSigma = \begin{bmatrix} 4 & 3 \\ 3 & 9\end{bmatrix}$. Compute the correlation of $x_1$ and $x_2$ and $\Var(x_1 + x_2)$. Enter $[\rho, \Var(x_1 + x_2)]$.`,
          answer: { kind: 'vector', value: [0.5, 19] },
          explain: md`$\rho = 3/(\sqrt4\sqrt9) = 3/6 = 0.5$. $\Var(x_1 + x_2) = 4 + 9 + 2\cdot 3 = 19$.`,
        },
        {
          kind: 'numeric',
          q: md`For $\bSigma = \begin{bmatrix} 2 & 1 \\ 1 & 2\end{bmatrix}$, give the semi-axis lengths of the ellipse $\bx\T\bSigma^{-1}\bx = 1$.`,
          answer: { kind: 'set', value: [Math.sqrt(3), 1] },
          inputHint: 'two numbers, e.g. sqrt(3), 1',
          explain: md`The eigenvalues are $3$ (along $(1, 1)$) and $1$ (along $(1, -1)$), so the semi-axes are $\sqrt3 \approx 1.73$ and $1$.`,
        },
        {
          kind: 'paper',
          problem: {
            id: 'calc02-2-paper',
            title: 'Linear maps of random vectors',
            type: 'proof',
            difficulty: 2,
            minutes: 10,
            statement: md`Let $\bx$ have mean $\bmu$ and covariance $\bSigma$, and let $\by = A\bx + \bb$. (a) Prove $\E[\by] = A\bmu + \bb$ and $\Cov(\by) = A\bSigma A\T$. (b) For $\bSigma = \begin{bmatrix} 2 & 1 \\ 1 & 2\end{bmatrix}$, compute $\Var(x_1 - x_2)$. Enter the number for (b).`,
            hints: [md`$\Cov(\by) = \E[(\by - \E\by)(\by - \E\by)\T]$. For (b), $x_1 - x_2 = \ba\T\bx$ with $\ba = (1, -1)$.`],
            solution: [
              md`Linearity of expectation, applied entrywise: $\E[A\bx + \bb] = A\E[\bx] + \bb = A\bmu + \bb$.`,
              md`$\by - \E\by = A(\bx - \bmu)$, so $\Cov(\by) = \E[A(\bx - \bmu)(\bx - \bmu)\T A\T] = A\,\E[(\bx - \bmu)(\bx - \bmu)\T]\,A\T = A\bSigma A\T$.`,
              md`(b) $\Var(\ba\T\bx) = \ba\T\bSigma\ba = (1, -1)\begin{bmatrix} 2 & 1 \\ 1 & 2\end{bmatrix}\begin{bmatrix}1\\-1\end{bmatrix} = (1, -1)\cdot(1, -1) = 2$.`,
              md`Check with the scalar rule: $\Var(x_1) + \Var(x_2) - 2\Cov(x_1, x_2) = 2 + 2 - 2 = 2$. If $\bx$ is Gaussian, $\by$ is Gaussian too; that part needs the density or characteristic function and is not asked here.`,
            ],
            answer: { kind: 'number', value: 2 },
            rubric: [md`Mean by linearity`, md`Covariance computed with constants pulled out of the expectation`, md`Correct quadratic form for (b)`],
            areas: ['math'],
          },
        },
        {
          kind: 'code',
          code: `import numpy as np

np.random.seed(0)
L = np.array([[2.0, 0.0],
              [1.0, 1.0]])
Z = np.random.randn(100000, 2)      # rows are independent N(0, I) samples
X = Z @ L.T                         # each row is L z
print(L @ L.T)
print(np.round(np.cov(X, rowvar=False), 2))`,
          note: md`If $\bz \sim N(\bzero, I)$ then $L\bz$ has covariance $LL\T$, by the rule in the problem above. Factoring $\bSigma = LL\T$ (the Cholesky factorization) is how libraries sample from $N(\bmu, \bSigma)$. The sample covariance matches $LL\T$ to about two decimals.`,
        },
        {
          kind: 'explain',
          prompt: md`Why do Gaussian assumptions appear so often in ML (noise models, initialization, latent variables), and when are they a bad fit?`,
          model: md`Three reasons. The CLT makes sums of many small independent effects approximately Gaussian, which suits measurement noise. The Gaussian is closed under linear maps, conditioning and marginalization, so computations stay in closed form (Kalman filters, Gaussian processes, linear regression). And its log-density is quadratic, which turns maximum likelihood into least squares. It is a bad fit for heavy-tailed data (outliers make squared error dominated by a few points, where an L1 or Huber loss is more robust), for skewed or bounded quantities such as counts, prices or probabilities, and for multimodal data.`,
        },
      ],
      cards: [
        { id: 'calc02-2-c1', kind: 'concept', front: md`Mean and variance of Bernoulli$(p)$, Binomial$(n, p)$ and Poisson$(\lambda)$.`, back: md`$p,\ p(1-p)$; $np,\ np(1-p)$; $\lambda,\ \lambda$.` },
        { id: 'calc02-2-c2', kind: 'cloze', text: md`The axes of the density ellipses of $N(\bmu, \bSigma)$ point along the {{}} of $\bSigma$.`, answers: ['eigenvectors'] },
        { id: 'calc02-2-c3', kind: 'compute', front: md`$\Var(x_1) = 1$, $\Var(x_2) = 4$, $\Cov(x_1, x_2) = -1$. Compute $\Var(x_1 + x_2)$.`, answer: { kind: 'number', value: 3 }, back: md`$1 + 4 + 2(-1) = 3$.` },
        { id: 'calc02-2-c4', kind: 'concept', front: md`If $\bx$ has covariance $\bSigma$, what is the covariance of $A\bx + \bb$?`, back: md`$A\bSigma A\T$. The shift $\bb$ does not change it.` },
        { id: 'calc02-2-c5', kind: 'compute', front: md`Uniform on $[0, 6]$: compute the variance.`, answer: { kind: 'number', value: 3 }, back: md`$(b - a)^2/12 = 36/12 = 3$.` },
      ],
    },
    // ------------------------------------------------------------------ 2.3
    {
      id: 'calc02-3',
      title: 'Estimation and inference: MLE, MAP and A/B tests',
      minutes: 45,
      objectives: [
        'Write a likelihood and derive the MLE for a Bernoulli parameter and for a Gaussian mean and variance.',
        'Show that a Gaussian noise model gives mean squared error and that a Gaussian prior gives L2 regularization.',
        'Explain estimator bias with the n versus n − 1 variance estimators, and build a confidence interval for a mean or a proportion.',
        'Say what a p-value is and is not, run a two-proportion z-test, and reason about power, sample size and multiple testing.',
      ],
      cells: [
        {
          kind: 'text',
          md: md`A statistical model is a family of distributions $p(x \mid \theta)$ indexed by parameters $\theta$: a coin's bias, a Gaussian's mean, a network's weights. Fitting the model means choosing $\theta$ from observed data. The default principle in ML is maximum likelihood: pick the $\theta$ under which the observed data would have been most probable.`,
        },
        {
          kind: 'callout',
          tone: 'definition',
          title: 'Likelihood and maximum likelihood',
          md: md`For i.i.d. data $x_1, \dots, x_n$, the **likelihood** is $L(\theta) = \prod_i p(x_i \mid \theta)$ and the **log-likelihood** is $\ell(\theta) = \sum_i \log p(x_i \mid \theta)$. The **maximum likelihood estimate** is $\hat\theta = \argmax_\theta \ell(\theta)$. The likelihood is a function of $\theta$ with the data held fixed; it is not a probability distribution over $\theta$. Logs turn the product into a sum, which is easier to differentiate and does not underflow.`,
        },
        {
          kind: 'derive',
          title: 'the MLE of a coin',
          goal: md`A coin shows $k$ heads in $n$ independent flips. Find the MLE of $p = \P(\text{heads})$.`,
          steps: [
            { md: md`Each flip has probability $p$ (heads) or $1 - p$ (tails), so $L(p) = p^k(1 - p)^{n-k}$ and $\ell(p) = k\log p + (n - k)\log(1 - p)$.` },
            {
              md: md`Differentiate and set to zero: $$\ell'(p) = \frac{k}{p} - \frac{n - k}{1 - p} = 0 \;\Longrightarrow\; k(1 - p) = (n - k)p \;\Longrightarrow\; \hat p = \frac{k}{n}.$$`,
              choose: {
                prompt: md`What is the next move after writing $\ell(p)$?`,
                options: [md`Differentiate with respect to $p$ and set the derivative to zero`, md`Differentiate with respect to $k$`, md`Maximize $L(p)$ by setting $p = 1$`],
                answer: 0,
                explain: md`$k$ and $n$ are data, fixed. The unknown is $p$, and an interior maximum of a smooth function has zero derivative.`,
              },
            },
            { md: md`Check it is a maximum: $\ell''(p) = -\frac{k}{p^2} - \frac{n-k}{(1-p)^2} < 0$, so $\ell$ is concave.` },
          ],
          takeaway: md`The MLE is the observed frequency. With $k = 0$ it gives $\hat p = 0$: a never-seen event is declared impossible, which is why smoothing or a prior (MAP, below) is used for rare events.`,
        },
        {
          kind: 'viz',
          viz: { type: 'calc.likelihood', mu: 1, sigma: 1 },
          task: md`Move $\mu$ to make $\ell$ as large as possible, and compare the best $\mu$ with $\bar x$. Then change $\sigma$: does the location of the peak move? Notice how a point far from $\mu$ contributes a tiny height.`,
          caption: md`The green segments are the densities $p(x_i \mid \mu, \sigma)$; the likelihood is their product. The log-likelihood in $\mu$ is a downward parabola, $-\sum_i(x_i - \mu)^2/2\sigma^2$ plus a constant, so for every $\sigma$ its peak is at the sample mean $\bar x = 2.25$.`,
        },
        {
          kind: 'derive',
          title: 'the Gaussian MLE',
          goal: md`For i.i.d. $x_i \sim N(\mu, \sigma^2)$, find the MLEs of $\mu$ and $\sigma^2$.`,
          steps: [
            { md: md`$\ell(\mu, \sigma^2) = \sum_i\left[-\tfrac12\log(2\pi\sigma^2) - \frac{(x_i - \mu)^2}{2\sigma^2}\right] = -\frac n2\log(2\pi\sigma^2) - \frac{1}{2\sigma^2}\sum_i(x_i - \mu)^2.$` },
            {
              md: md`$\pd{\ell}{\mu} = \frac{1}{\sigma^2}\sum_i(x_i - \mu) = 0$ gives $\hat\mu = \bar x$, whatever $\sigma$ is.`,
              choose: {
                prompt: md`Which term of $\ell$ depends on $\mu$?`,
                options: [md`Only $-\frac{1}{2\sigma^2}\sum_i(x_i - \mu)^2$`, md`Only $-\frac n2\log(2\pi\sigma^2)$`, md`Both terms`],
                answer: 0,
                explain: md`The normalizing term depends on $\sigma$ only. Maximizing over $\mu$ is minimizing the sum of squares.`,
              },
            },
            { md: md`Treat $v = \sigma^2$ as the variable: $\pd{\ell}{v} = -\frac{n}{2v} + \frac{1}{2v^2}\sum_i(x_i - \mu)^2 = 0$ gives $\hat\sigma^2 = \frac1n\sum_i(x_i - \bar x)^2$.` },
          ],
          takeaway: md`The MLEs are the sample mean and the sample variance with divisor $n$. The second one is biased, as the next part shows.`,
        },
        {
          kind: 'callout',
          tone: 'theorem',
          title: 'Gaussian noise gives squared error',
          md: md`Model a regression target as $y_i = f_\theta(\bx_i) + \varepsilon_i$ with $\varepsilon_i \sim N(0, \sigma^2)$ i.i.d. Then $$-\ell(\theta) = \frac{1}{2\sigma^2}\sum_i\big(y_i - f_\theta(\bx_i)\big)^2 + \frac n2\log(2\pi\sigma^2).$$ The second term does not depend on $\theta$, so maximizing the likelihood is exactly minimizing the sum of squared errors. In the same way a Bernoulli model gives binary cross-entropy and a Laplace noise model gives absolute error.`,
        },
        {
          kind: 'derive',
          title: 'MAP with a Gaussian prior is L2 regularization',
          goal: md`With the Gaussian noise model above and the prior $\bw \sim N(\bzero, \tau^2 I)$, show that the maximum a posteriori (MAP) estimate minimizes squared error plus $\lambda\lVert\bw\rVert^2$, and find $\lambda$.`,
          steps: [
            { md: md`Bayes: $p(\bw \mid \text{data}) \propto p(\text{data} \mid \bw)\,p(\bw)$. MAP maximizes the log posterior, $\ell(\bw) + \log p(\bw)$; the normalizer does not depend on $\bw$.` },
            {
              md: md`$\log p(\bw) = -\frac{\lVert\bw\rVert^2}{2\tau^2} + \text{const}$, from the Gaussian density with covariance $\tau^2 I$.`,
              choose: {
                prompt: md`What is $\log p(\bw)$ for $\bw \sim N(\bzero, \tau^2 I)$, up to a constant?`,
                options: [md`$-\lVert\bw\rVert^2/(2\tau^2)$`, md`$-\lVert\bw\rVert_1/\tau$`, md`$-\tau^2\lVert\bw\rVert^2$`],
                answer: 0,
                explain: md`With $\bSigma = \tau^2 I$, the quadratic form $\bw\T\bSigma^{-1}\bw$ is $\lVert\bw\rVert^2/\tau^2$. The L1 version comes from a Laplace prior.`,
              },
            },
            { md: md`Negate and multiply by $2\sigma^2$: MAP minimizes $$\sum_i(y_i - f_\bw(\bx_i))^2 + \frac{\sigma^2}{\tau^2}\lVert\bw\rVert^2,$$ so $\lambda = \sigma^2/\tau^2$.` },
          ],
          takeaway: md`Weight decay is a Gaussian prior on the weights. A tighter prior (small $\tau$) means stronger regularization. A Laplace prior gives L1 and sparsity.`,
        },
        {
          kind: 'text',
          md: md`**Bias.** An estimator $\hat\theta$ is **unbiased** if $\E[\hat\theta] = \theta$ over repeated samples. The sample mean is unbiased. The MLE of the variance is not: $$\E\!\left[\frac1n\sum_i(x_i - \bar x)^2\right] = \frac{n - 1}{n}\sigma^2.$$ The deviations are measured from $\bar x$, which was fitted to the same data and sits closer to the points than the true $\mu$ does. Dividing by $n - 1$ instead (Bessel's correction) gives the unbiased $s^2$. The bias vanishes as $n$ grows. NumPy's \`np.var\` and \`np.std\` divide by $n$ by default (\`ddof=0\`); pandas divides by $n - 1$.`,
        },
        {
          kind: 'code',
          code: `import numpy as np

x = np.array([2.0, 4, 4, 4, 5, 5, 7, 9])
print(round(float(np.var(x, ddof=1)), 3))`,
          predict: {
            q: md`The mean is 5 and $\sum_i(x_i - \bar x)^2 = 32$. What is printed?`,
            options: ['`4.571`', '`4.0`', '`2.138`', '`32.0`'],
            answer: 0,
            explain: md`\`ddof=1\` divides by $n - 1 = 7$: $32/7 \approx 4.571$. The default \`np.var(x)\` gives $32/8 = 4.0$.`,
          },
        },
        {
          kind: 'text',
          md: md`**Confidence intervals.** By the CLT, an estimate $\hat\theta$ is approximately normal around $\theta$ with standard error $\text{SE}$, so $\hat\theta \pm 1.96\,\text{SE}$ is an approximate 95% confidence interval. For a mean, $\text{SE} = s/\sqrt n$; for a proportion, $\text{SE} = \sqrt{\hat p(1 - \hat p)/n}$. The 95% describes the procedure: over many repeated experiments, about 95% of the intervals built this way contain the true value. It is not a 95% probability statement about one particular computed interval.`,
        },
        {
          kind: 'numeric',
          q: md`A model scores 85% accuracy on 500 test examples. Compute the half-width $1.96\,\text{SE}$ of the approximate 95% confidence interval for its accuracy.`,
          answer: { kind: 'number', value: 0.0313, tol: 0.01 },
          inputHint: 'a decimal, e.g. 0.05',
          explain: md`$\text{SE} = \sqrt{0.85\cdot 0.15/500} = \sqrt{0.000255} \approx 0.01597$, so the half-width is $1.96\cdot 0.01597 \approx 0.0313$ and the interval is about $[0.819, 0.881]$.`,
        },
        {
          kind: 'callout',
          tone: 'definition',
          title: 'Hypothesis tests and p-values',
          md: md`A test compares a **null hypothesis** $H_0$ (no effect) with an alternative $H_1$. Choose a test statistic, for example a $z$-score. The **p-value** is the probability, computed assuming $H_0$ is true, of a statistic at least as extreme as the one observed. Reject $H_0$ when $p < \alpha$, the significance level, commonly $0.05$.

A p-value is **not** the probability that $H_0$ is true, not the probability that the result is "due to chance", and not a measure of effect size. A **type I error** (false positive) has probability $\alpha$ under $H_0$. A **type II error** (missing a real effect) has probability $\beta$, and the **power** is $1 - \beta$.`,
        },
        {
          kind: 'text',
          md: md`**The two-proportion z-test.** An A/B test shows variant A to $n_A$ users with $\hat p_A$ converting, and B to $n_B$ users with $\hat p_B$. Under $H_0$ both share one rate, estimated by the pooled $\hat p = (\text{conversions}_A + \text{conversions}_B)/(n_A + n_B)$. Then $$\text{SE} = \sqrt{\hat p(1 - \hat p)\left(\tfrac{1}{n_A} + \tfrac{1}{n_B}\right)}, \qquad z = \frac{\hat p_B - \hat p_A}{\text{SE}},$$ and the two-sided p-value is $2(1 - \Phi(|z|))$, where $\Phi$ is the standard normal CDF. $|z| > 1.96$ corresponds to $p < 0.05$.`,
        },
        {
          kind: 'viz',
          viz: { type: 'calc.abtest', mode: 'pvalue', n: 2000, pa: 0.1, pb: 0.115 },
          task: md`With 2,000 users per arm, is 10% versus 11.5% significant? Increase $n$ until it is. Then switch to **power**: with a 10% baseline and a 10% relative lift, how many users per arm give 80% power?`,
          caption: md`At $n = 2000$, $z \approx 1.53$ and $p \approx 0.13$: not significant, although the observed lift is 15% relative. The same rates reach $|z| > 1.96$ at about $n = 3300$. Detecting a lift from 10% to 11% with 80% power at $\alpha = 0.05$ takes about 14,750 users per arm: sample size grows like $1/\Delta^2$.`,
        },
        {
          kind: 'numeric',
          q: md`A: 100 conversions out of 1,000 users. B: 130 out of 1,000. Compute the pooled two-proportion $z$ statistic.`,
          answer: { kind: 'number', value: 2.1027, tol: 0.005 },
          hints: [md`Pooled $\hat p = 230/2000 = 0.115$, so $\text{SE} = \sqrt{0.115\cdot 0.885\cdot(2/1000)}$.`],
          explain: md`$\text{SE} = \sqrt{0.115\cdot 0.885\cdot 0.002} = \sqrt{0.00020355} \approx 0.01427$ and $z = 0.03/0.01427 \approx 2.10$. The two-sided p-value is about $0.035$, significant at the 5% level.`,
        },
        {
          kind: 'text',
          md: md`**Multiple testing and peeking.** Each test at $\alpha = 0.05$ has a 5% false-positive rate under $H_0$. Run 20 independent tests of true nulls and the chance of at least one false positive is $1 - 0.95^{20} \approx 64\%$. Testing many metrics or segments therefore needs a correction, such as Bonferroni (test each at $\alpha/m$) or controlling the false discovery rate (Benjamini–Hochberg). Checking a running experiment every day and stopping at the first $p < 0.05$ ("peeking") inflates the false-positive rate in the same way; fix the sample size in advance from a power calculation, or use a sequential test designed for repeated looks. Finally, statistical significance is not practical significance: with millions of users a negligible lift can have a tiny p-value.`,
        },
        {
          kind: 'check',
          q: md`An A/B test reports $p = 0.03$ for "B has a higher conversion rate than A". Which statement is correct?`,
          options: [md`If A and B truly had the same rate, a difference at least this large would occur in about 3% of such experiments.`, md`There is a 97% probability that B is better than A.`, md`There is a 3% probability that the null hypothesis is true.`, md`B's conversion rate is 3% higher than A's.`],
          answer: 0,
          explain: md`A p-value is computed assuming $H_0$. Turning it into a probability that a hypothesis is true would need a prior and Bayes' rule. It also says nothing about the size of the effect, which you read from the estimate and its confidence interval.`,
        },
        {
          kind: 'exercise',
          ex: {
            id: 'calc02-3-ex',
            title: 'A two-proportion z-test',
            prompt: md`Implement \`ab_test(conv_a, n_a, conv_b, n_b)\` returning a tuple \`(z, half_width)\`: the pooled two-proportion $z$ statistic for B minus A, and the half-width $1.96\sqrt{\hat p_A(1-\hat p_A)/n_A + \hat p_B(1-\hat p_B)/n_B}$ of the unpooled 95% confidence interval for $p_B - p_A$. Use plain arithmetic or NumPy.`,
            starter: `import numpy as np

def ab_test(conv_a, n_a, conv_b, n_b):
    pa = conv_a / n_a
    pb = conv_b / n_b
    # TODO: pooled rate, pooled SE, z; unpooled SE and the CI half-width
    z = 0.0
    half_width = 0.0
    return z, half_width

z, hw = ab_test(100, 1000, 130, 1000)
print(round(z, 3), round(hw, 4))`,
            solution: `import numpy as np

def ab_test(conv_a, n_a, conv_b, n_b):
    pa = conv_a / n_a
    pb = conv_b / n_b
    p = (conv_a + conv_b) / (n_a + n_b)
    se_pooled = np.sqrt(p * (1 - p) * (1 / n_a + 1 / n_b))
    z = (pb - pa) / se_pooled
    se = np.sqrt(pa * (1 - pa) / n_a + pb * (1 - pb) / n_b)
    half_width = 1.96 * se
    return float(z), float(half_width)

z, hw = ab_test(100, 1000, 130, 1000)
print(round(z, 3), round(hw, 4))`,
            tests: [
              { expr: '[round(v, 4) for v in ab_test(100, 1000, 130, 1000)]', label: 'the example from the lesson' },
              { expr: '[round(v, 4) for v in ab_test(200, 2000, 230, 2000)]', label: 'same rates, n = 2000' },
              { expr: '[round(v, 4) for v in ab_test(50, 400, 40, 600)]', label: 'unequal arms, B worse' },
            ],
            hints: [md`Pooled rate: total conversions over total users. The pooled SE uses $\hat p(1 - \hat p)(1/n_A + 1/n_B)$ under the square root.`, md`The confidence interval does not assume $H_0$, so it uses each arm's own rate.`],
          },
        },
        {
          kind: 'paper',
          problem: {
            id: 'calc02-3-paper',
            title: 'Why n − 1',
            type: 'proof',
            difficulty: 3,
            minutes: 15,
            statement: md`Let $x_1, \dots, x_n$ be i.i.d. with mean $\mu$ and variance $\sigma^2$. Prove that $\E\left[\sum_i(x_i - \bar x)^2\right] = (n - 1)\sigma^2$, and conclude which divisor makes the sample variance unbiased.`,
            hints: [md`Write $x_i - \bar x = (x_i - \mu) - (\bar x - \mu)$ and expand the square.`, md`$\sum_i(x_i - \mu) = n(\bar x - \mu)$ and $\E[(\bar x - \mu)^2] = \sigma^2/n$.`],
            solution: [
              md`Write $x_i - \bar x = (x_i - \mu) - (\bar x - \mu)$. Then $$\sum_i(x_i - \bar x)^2 = \sum_i(x_i - \mu)^2 - 2(\bar x - \mu)\sum_i(x_i - \mu) + n(\bar x - \mu)^2.$$`,
              md`$\sum_i(x_i - \mu) = n(\bar x - \mu)$, so the middle term is $-2n(\bar x - \mu)^2$ and the total is $\sum_i(x_i - \mu)^2 - n(\bar x - \mu)^2$.`,
              md`Take expectations: $\E\sum_i(x_i - \mu)^2 = n\sigma^2$ and $\E[n(\bar x - \mu)^2] = n\cdot\sigma^2/n = \sigma^2$ (standard error of the mean).`,
              md`So $\E\sum_i(x_i - \bar x)^2 = n\sigma^2 - \sigma^2 = (n - 1)\sigma^2$. Dividing by $n - 1$ gives an unbiased estimator; the MLE divides by $n$ and underestimates by the factor $(n - 1)/n$.`,
            ],
            rubric: [md`Centers at $\mu$ and expands correctly`, md`Simplifies the cross term using $\sum(x_i - \mu) = n(\bar x - \mu)$`, md`Uses $\Var(\bar x) = \sigma^2/n$`, md`States the conclusion about the divisor`],
            areas: ['math', 'ml-depth'],
          },
        },
        {
          kind: 'explain',
          prompt: md`A product manager says: "The test came back with p = 0.04, so there is a 96% chance the new version is better, let's ship it." How do you respond?`,
          model: md`The p-value means that if the two versions were truly identical, a difference at least this large would show up about 4% of the time. It is not the probability that B is better; that would require a prior and Bayes' rule. Before shipping I would check the effect size and its confidence interval (is the lift large enough to matter, and does the interval include values that are not worth the cost?), whether the sample size was fixed in advance or the test was stopped at the first significant look, how many metrics and segments were tested, and whether guardrail metrics moved. If the result is borderline, a replication or a longer run is cheap insurance.`,
        },
      ],
      cards: [
        { id: 'calc02-3-c1', kind: 'concept', front: md`The MLE for a coin with $k$ heads in $n$ flips, and for a Gaussian's mean and variance.`, back: md`$\hat p = k/n$; $\hat\mu = \bar x$; $\hat\sigma^2 = \frac1n\sum(x_i - \bar x)^2$ (biased, divisor $n$).` },
        { id: 'calc02-3-c2', kind: 'concept', front: md`Which probabilistic assumptions give MSE and L2 regularization?`, back: md`Gaussian noise on the target gives MSE (maximum likelihood). A Gaussian prior on the weights gives L2 (MAP), with $\lambda = \sigma^2/\tau^2$.` },
        { id: 'calc02-3-c3', kind: 'cloze', text: md`The p-value is the probability of data at least as extreme as observed, assuming the {{}} hypothesis is true.`, answers: ['null'] },
        { id: 'calc02-3-c4', kind: 'compute', front: md`20 independent tests of true null hypotheses at $\alpha = 0.05$. Probability of at least one false positive?`, answer: { kind: 'number', value: 1 - 0.95 ** 20, tol: 1e-3 }, back: md`$1 - 0.95^{20} \approx 0.64$.` },
        { id: 'calc02-3-c5', kind: 'concept', front: md`How does the sample size needed for an A/B test scale with the effect size $\Delta$?`, back: md`Like $1/\Delta^2$: halving the detectable effect needs about four times as many users.` },
      ],
    },
  ],
  problems: [
    {
      id: 'calc02-p1',
      title: 'Mean and variance of a discrete variable',
      type: 'compute',
      difficulty: 1,
      minutes: 5,
      statement: md`$X$ takes the values $-1, 0, 2$ with probabilities $0.25, 0.25, 0.5$. Compute $\E[X]$ and $\Var(X)$. Enter $[\E[X], \Var(X)]$.`,
      solution: [
        md`$\E[X] = -0.25 + 0 + 1 = 0.75$.`,
        md`$\E[X^2] = 0.25 + 0 + 2 = 2.25$, so $\Var(X) = 2.25 - 0.5625 = 1.6875$.`,
      ],
      answer: { kind: 'vector', value: [0.75, 1.6875] },
    },
    {
      id: 'calc02-p2',
      title: 'Base rates in fraud detection',
      type: 'apply',
      difficulty: 2,
      minutes: 8,
      statement: md`0.1% of transactions are fraudulent. A fraud model flags 95% of fraudulent transactions and 1% of legitimate ones. What fraction of flagged transactions are fraudulent (the precision)?`,
      solution: [
        md`Per 100,000 transactions: 100 fraudulent, of which 95 are flagged. 99,900 legitimate, of which 999 are flagged.`,
        md`Precision $= \P(\text{fraud} \mid \text{flag}) = \dfrac{95}{95 + 999} = \dfrac{95}{1094} \approx 0.0868$.`,
        md`Fewer than 9% of alerts are real, although the model looks accurate. This is why precision, not accuracy, is reported for rare-event detection, and why the operating threshold is chosen with the base rate in mind.`,
      ],
      answer: { kind: 'number', value: 95 / 1094, tol: 1e-3 },
      areas: ['math', 'ml-breadth'],
    },
    {
      id: 'calc02-p3',
      title: 'Covariance of a sum and a difference',
      type: 'compute',
      difficulty: 2,
      minutes: 6,
      statement: md`$X$ and $Y$ are independent with $\Var(X) = 1$ and $\Var(Y) = 4$. Let $U = X + Y$ and $V = X - Y$. Compute $\Cov(U, V)$ and the correlation of $U$ and $V$. Enter $[\Cov, \rho]$.`,
      solution: [
        md`Bilinearity: $\Cov(X + Y, X - Y) = \Var(X) - \Cov(X, Y) + \Cov(Y, X) - \Var(Y) = 1 - 4 = -3$.`,
        md`$\Var(U) = \Var(V) = 1 + 4 = 5$ (independence), so $\rho = -3/5 = -0.6$.`,
      ],
      answer: { kind: 'vector', value: [-3, -0.6] },
    },
    {
      id: 'calc02-p4',
      title: 'The MLE of a Poisson rate',
      type: 'derive',
      difficulty: 2,
      minutes: 10,
      statement: md`Request counts per minute $k_1, \dots, k_n$ are modelled as i.i.d. Poisson$(\lambda)$. Derive the MLE of $\lambda$ and evaluate it for the counts $3, 5, 2, 6, 4$.`,
      solution: [
        md`$\ell(\lambda) = \sum_i\left(k_i\log\lambda - \lambda - \log k_i!\right) = \left(\sum_i k_i\right)\log\lambda - n\lambda + \text{const}$.`,
        md`$\ell'(\lambda) = \frac{\sum_i k_i}{\lambda} - n = 0$, so $\hat\lambda = \frac1n\sum_i k_i = \bar k$.`,
        md`$\ell''(\lambda) = -\sum k_i/\lambda^2 < 0$, a maximum.`,
        md`For the data: $\hat\lambda = 20/5 = 4$.`,
      ],
      answer: { kind: 'number', value: 4 },
      rubric: [md`Correct log-likelihood with the $\log k_i!$ term recognized as constant`, md`Derivative set to zero and solved`, md`Second-derivative or concavity check`],
      areas: ['math', 'ml-depth'],
    },
    {
      id: 'calc02-p5',
      title: 'Bernoulli likelihood is cross-entropy',
      type: 'derive',
      difficulty: 2,
      minutes: 10,
      statement: md`A binary classifier outputs $\hat p_i = \P(y_i = 1 \mid \bx_i)$. Assuming the labels $y_i \in \{0, 1\}$ are independent Bernoulli$(\hat p_i)$, show that the negative log-likelihood is the binary cross-entropy $-\sum_i[y_i\log\hat p_i + (1 - y_i)\log(1 - \hat p_i)]$. Then compute it for two examples with $(y, \hat p) = (1, 0.8)$ and $(0, 0.4)$, in nats.`,
      solution: [
        md`The Bernoulli pmf can be written $\hat p^{\,y}(1 - \hat p)^{1-y}$: it equals $\hat p$ when $y = 1$ and $1 - \hat p$ when $y = 0$.`,
        md`By independence the likelihood is $\prod_i\hat p_i^{\,y_i}(1 - \hat p_i)^{1 - y_i}$, and its negative log is $-\sum_i[y_i\log\hat p_i + (1 - y_i)\log(1 - \hat p_i)]$.`,
        md`Numbers: $-\log 0.8 - \log 0.6 \approx 0.2231 + 0.5108 = 0.7340$ nats.`,
      ],
      answer: { kind: 'number', value: -Math.log(0.8) - Math.log(0.6), tol: 1e-3 },
      rubric: [md`Compact form of the Bernoulli pmf`, md`Product over independent examples, then the log`, md`Correct numerical value with natural logs`],
      areas: ['math', 'ml-depth'],
    },
    {
      id: 'calc02-p6',
      title: 'MAP for a coin with a Beta prior',
      type: 'derive',
      difficulty: 3,
      minutes: 12,
      statement: md`A coin's bias has prior density $p(\theta) \propto \theta^{a-1}(1 - \theta)^{b-1}$ (a Beta$(a, b)$ prior, $a, b > 1$). After $k$ heads in $n$ flips, find the MAP estimate. Evaluate it for $a = b = 2$, $k = 0$, $n = 5$, and compare with the MLE.`,
      hints: [md`The log posterior is $(k + a - 1)\log\theta + (n - k + b - 1)\log(1 - \theta)$ plus a constant.`],
      solution: [
        md`Posterior $\propto \theta^k(1-\theta)^{n-k}\cdot\theta^{a-1}(1-\theta)^{b-1} = \theta^{k+a-1}(1-\theta)^{n-k+b-1}$.`,
        md`This has the same form as a coin likelihood with $k + a - 1$ heads and $n - k + b - 1$ tails, so its maximizer is $\hat\theta_{\text{MAP}} = \dfrac{k + a - 1}{n + a + b - 2}$.`,
        md`With $a = b = 2$, $k = 0$, $n = 5$: $\hat\theta_{\text{MAP}} = 1/7 \approx 0.143$, while the MLE is $0/5 = 0$.`,
        md`The prior acts like one extra head and one extra tail (Laplace smoothing). It keeps the estimate away from the extremes when data are scarce, the same role L2 regularization plays for weights.`,
      ],
      answer: { kind: 'number', value: 1 / 7 },
      rubric: [md`Posterior as likelihood times prior`, md`Recognizes the pseudo-count form and maximizes`, md`Numerical value and comparison with the MLE`],
      areas: ['math', 'ml-depth'],
    },
    {
      id: 'calc02-p7',
      title: 'Sizing an experiment',
      type: 'apply',
      difficulty: 2,
      minutes: 8,
      statement: md`A test with a 5% baseline conversion rate needs 31,000 users per arm to detect an absolute lift of 0.5 percentage points with 80% power. Roughly how many users per arm are needed to detect an absolute lift of 1 percentage point with the same power and $\alpha$? Enter a number.`,
      hints: [md`The required $n$ scales like $1/\Delta^2$ when the variance term changes little.`],
      solution: [
        md`For a two-sided test, $n \approx \dfrac{(z_{1-\alpha/2}\,\sigma_0 + z_{1-\beta}\,\sigma_1)^2}{\Delta^2}$, where $\sigma_0^2$ and $\sigma_1^2$ are sums of Bernoulli variances that change only slightly between the two scenarios.`,
        md`Doubling $\Delta$ divides $n$ by about $2^2 = 4$: roughly $31{,}000/4 \approx 7{,}750$ users per arm. The exact formula gives about 8,160, a little more, because the Bernoulli variance at 6% is larger than at 5.5%.`,
      ],
      answer: { kind: 'number', value: 7750, tol: 0.1 },
      areas: ['ml-breadth'],
    },
    {
      id: 'calc02-p8',
      title: 'A confidence interval for a mean',
      type: 'compute',
      difficulty: 1,
      minutes: 5,
      statement: md`Latency measurements on 100 requests have sample mean 120 ms and sample standard deviation 30 ms. Give an approximate 95% confidence interval for the mean latency. Enter [lower, upper].`,
      solution: [
        md`$\text{SE} = s/\sqrt n = 30/10 = 3$ ms.`,
        md`$120 \pm 1.96\cdot 3 = 120 \pm 5.88$, so about $[114.12, 125.88]$ ms. With $n = 100$ the normal approximation is reasonable even if individual latencies are skewed; percentiles such as p99 need different methods.`,
      ],
      answer: { kind: 'vector', value: [114.12, 125.88], tol: 1e-3 },
    },
    {
      id: 'calc02-p9',
      title: 'What a significant result means',
      type: 'concept',
      difficulty: 2,
      minutes: 6,
      statement: md`A team runs 40 A/B tests a quarter, each at $\alpha = 0.05$. Suppose that in truth only 4 of the changes have a real effect and the tests have 80% power. Of the tests that come out significant, about what fraction are real effects?`,
      hints: [md`Count expected true positives among the 4 real effects and false positives among the 36 nulls.`],
      solution: [
        md`Real effects: $4\cdot 0.8 = 3.2$ significant on average.`,
        md`Null changes: $36\cdot 0.05 = 1.8$ significant on average.`,
        md`Fraction real: $3.2/(3.2 + 1.8) = 0.64$. Over a third of "wins" are false positives, even though every test was run correctly. Low prior rates of true effects make individual significant results much less reliable than $1 - \alpha$ suggests: the same base-rate effect as in the diagnostic test.`,
      ],
      answer: { kind: 'number', value: 0.64 },
      areas: ['ml-breadth'],
    },
  ],
};
