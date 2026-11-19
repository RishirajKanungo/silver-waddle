import { md, type InterviewQ } from '../content/types';

export const QUESTIONS: InterviewQ[] = [
  {
    id: 'ml02-q1',
    module: 'ml02',
    area: 'ml-depth',
    level: 2,
    q: md`Derive the gradient of the logistic-regression loss.`,
    answer: md`Model $p_i = \sigma(z_i)$ with $z_i = \bw\T\bx_i + b$. The loss is the Bernoulli negative log-likelihood, $L = -\frac1n\sum_i[y_i\log p_i + (1 - y_i)\log(1 - p_i)]$. For one example, chain rule through $z$: $\frac{\partial\ell}{\partial p} = \frac{p - y}{p(1 - p)}$ after combining the two fractions, and $\frac{dp}{dz} = \sigma'(z) = p(1 - p)$. They cancel, so $\frac{\partial\ell}{\partial z} = p - y$. Since $\nabla_{\bw}z = \bx$ and $\partial z/\partial b = 1$: $\nabla_{\bw}\ell = (p - y)\bx$ and $\partial\ell/\partial b = p - y$. Vectorized: $\nabla_{\bw}L = \frac1n X\T(\mathbf{p} - \by)$. In words: each example pulls $\bw$ along its own input, weighted by its prediction error, exactly the form of the linear-regression gradient, which is why the same training loop serves both. The Hessian is $\frac1n X\T\operatorname{diag}(p_i(1 - p_i))X$, positive semidefinite, so the loss is convex; it also gives Newton's method (iteratively reweighted least squares).`,
    pitfalls: [md`Forgetting the $\sigma' = \sigma(1 - \sigma)$ identity and getting lost in exponentials.`, md`Sign errors: the gradient is $p - y$, not $y - p$ (that is the gradient of the log-likelihood).`],
    followups: [md`Show the loss is convex.`, md`What is the gradient for softmax regression?`, md`Write one vectorized gradient step in NumPy.`],
  },
  {
    id: 'ml02-q2',
    module: 'ml02',
    area: 'ml-depth',
    level: 2,
    q: md`Why not use MSE as the loss for classification?`,
    answer: md`Three reasons. First, gradients: with $p = \sigma(z)$, $\frac{\partial}{\partial z}(p - y)^2 = 2(p - y)\,p(1 - p)$. When the model is confidently wrong ($p \approx 0$ for $y = 1$), $p(1 - p) \approx 0$ and learning stalls exactly where it is most needed. Cross-entropy cancels that factor: $\frac{\partial\ell}{\partial z} = p - y$. Second, optimization: cross-entropy is convex in the weights of logistic regression, while MSE through a sigmoid is not, with flat plateaus and possible bad local minima. Third, the probabilistic model: cross-entropy is the negative log-likelihood of Bernoulli or categorical labels and a strictly proper scoring rule, so it is minimized by the true probabilities and heavily penalizes confident errors; MSE assumes Gaussian noise. (The squared error on probabilities, the Brier score, is still a proper scoring rule and a fine evaluation metric; the problem is training with it through a sigmoid.)`,
    pitfalls: [md`Saying "MSE is for regression" without a reason.`, md`Claiming MSE cannot be minimized at all for classification.`],
    followups: [md`Is the Brier score a good evaluation metric?`, md`What changes with a softmax output?`],
  },
  {
    id: 'ml02-q3',
    module: 'ml02',
    area: 'ml-breadth',
    level: 2,
    q: md`ROC curve versus precision–recall curve: which would you use under heavy class imbalance, and why?`,
    answer: md`ROC plots TPR against FPR. Both are rates within a class, so the ROC curve and ROC-AUC do not depend on prevalence. PR plots precision against recall, and precision $= \frac{\pi\,\text{TPR}}{\pi\,\text{TPR} + (1 - \pi)\,\text{FPR}}$ depends directly on the prevalence $\pi$. With 1% positives, an FPR of 5% at TPR 90% means precision of only about 15%: most alerts are false, yet the ROC point looks excellent. ROC also compresses the low-FPR region that matters in practice. So under heavy imbalance I would use the PR curve and average precision, plus precision at the recall the application needs; the random baseline is $\pi$, not 0.5. ROC-AUC remains useful for comparing ranking quality across datasets with different prevalences. Either way, the evaluation set should have the deployment prevalence, or precision must be recomputed for it.`,
    pitfalls: [md`Saying ROC-AUC is "wrong" under imbalance; it is prevalence-free, which is the point and the limitation.`, md`Evaluating precision on a rebalanced test set.`],
    followups: [md`Precision at recall 0.9 drops from 0.6 offline to 0.2 online. What happened?`, md`How is average precision computed?`],
  },
  {
    id: 'ml02-q4',
    module: 'ml02',
    area: 'ml-breadth',
    level: 1,
    q: md`What does AUC mean?`,
    answer: md`ROC-AUC is the area under the curve of TPR against FPR as the threshold sweeps over all values. It equals the probability that a randomly chosen positive example receives a higher score than a randomly chosen negative example, with ties counted as one half; this is the Mann–Whitney $U$ statistic divided by $n^+n^-$. So 0.5 is random ranking, 1.0 is perfect ranking, and below 0.5 means the scores are inverted. Consequences: it measures ranking only, so it is unchanged by any monotone transformation of the scores and says nothing about calibration or about which threshold to use; it summarizes all thresholds, including ones you would never operate at; and it is insensitive to class prevalence. It can be computed in $O(n\log n)$ by sorting the scores and summing the ranks of the positives.`,
    pitfalls: [md`Describing it as "accuracy over thresholds".`, md`Claiming a higher AUC means better calibrated probabilities.`],
    followups: [md`Compute AUC for these five scores by hand.`, md`When can a model with higher AUC be worse in production?`],
  },
  {
    id: 'ml02-q5',
    module: 'ml02',
    area: 'ml-depth',
    level: 3,
    q: md`What happens when you train logistic regression on perfectly separable data?`,
    answer: md`The maximum-likelihood estimate does not exist. If $(\bw_0, b_0)$ separates the classes, scaling it by $c \to \infty$ drives every example's loss $\log(1 + e^{-c\,m_i})$ to zero, where $m_i > 0$ are the margins; the loss approaches 0 but is positive for every finite weight vector. Gradient descent therefore keeps growing $\lVert\bw\rVert$, slowly, roughly logarithmically in the number of steps, and the predicted probabilities saturate at 0 and 1. Solvers report convergence warnings, coefficients and their standard errors blow up, and the exact weights depend on when you stop. A known result (Soudry et al., 2018) is that the direction of $\bw$ under gradient descent converges to the hard-margin SVM direction. Fixes: L2 or L1 regularization, which gives a finite minimizer (scikit-learn regularizes by default), early stopping, or in statistics Firth's penalized likelihood. Separability is common when features outnumber examples or with rare one-hot categories.`,
    pitfalls: [md`Saying the model "fails" or "cannot fit"; it fits perfectly, but the weights diverge.`],
    followups: [md`Does the decision boundary converge even though the weights do not?`, md`How does this relate to overconfidence in neural networks?`],
  },
  {
    id: 'ml02-q6',
    module: 'ml02',
    area: 'ml-coding',
    level: 2,
    q: md`Implement a numerically stable softmax cross-entropy for a batch in NumPy, and its gradient.`,
    answer: md`\`\`\`python
def ce_and_grad(Z, y):            # Z: (n, K) logits, y: (n,) ints
    n = Z.shape[0]
    Zs = Z - Z.max(axis=1, keepdims=True)
    lse = np.log(np.exp(Zs).sum(axis=1, keepdims=True))
    logp = Zs - lse                 # log-softmax
    loss = -logp[np.arange(n), y].mean()
    G = np.exp(logp)                # softmax
    G[np.arange(n), y] -= 1
    return loss, G / n
\`\`\`
Subtracting the row maximum leaves the softmax unchanged and makes every exponent $\le 0$, so nothing overflows; computing the loss from log-probabilities avoids $\log 0$ when a probability underflows. Integer-array indexing picks each row's true-class entry without a loop. The gradient of the mean loss is $(P - Y)/n$. I would test it with logits around 1000, with two equal logits (loss $\ln 2$), and against finite differences.`,
    pitfalls: [md`Computing \`np.log(softmax(Z))\`, which returns \`-inf\` when a probability underflows.`, md`Subtracting the global maximum instead of the per-row maximum (fine for overflow, but large spreads between rows can underflow whole rows).`],
    followups: [md`Add label smoothing.`, md`How does PyTorch's \`cross_entropy\` avoid the same problem?`],
  },
  {
    id: 'ml02-q7',
    module: 'ml02',
    area: 'ml-breadth',
    level: 2,
    q: md`What is calibration, how do you measure it, and how do you fix a miscalibrated classifier?`,
    answer: md`A classifier is calibrated if, among cases where it predicts $p$, a fraction $p$ is positive. Measure it with a reliability diagram (bin the predictions, plot observed frequency against mean prediction) and summarize with the expected calibration error, the bin-weighted average gap; log loss and Brier score reward calibration together with sharpness. It matters when the number is used directly: cost-based thresholds, expected revenue $p\times$ bid in ads, combining models, risk shown to users. Logistic regression is usually close to calibrated on in-distribution data; large neural networks are often overconfident; class reweighting or downsampling shifts probabilities deliberately. Fixes are fit on held-out data: temperature scaling (divide logits by one fitted $T$), Platt scaling ($\sigma(az + c)$), or isotonic regression for more flexibility. For downsampled negatives there is a closed-form correction of the odds. None of these monotone maps changes the ranking, so AUC is unchanged.`,
    pitfalls: [md`Confusing calibration with accuracy or AUC.`, md`Fitting the calibrator on the training data.`],
    followups: [md`You downsampled negatives by 10x for training. How do you correct the predicted probabilities?`, md`Why might ECE be misleading with few samples per bin?`],
  },
  {
    id: 'ml02-q8',
    module: 'ml02',
    area: 'ml-breadth',
    level: 1,
    q: md`How would you choose the decision threshold for a classifier in production?`,
    answer: md`The threshold is a product decision separate from training. Options, roughly in order of preference: (1) **Costs.** If a false negative costs $c_{FN}$ and a false positive $c_{FP}$ and probabilities are calibrated, flag when $p > c_{FP}/(c_{FP} + c_{FN})$; for example, a miss costing 9 times a false alarm gives a threshold of 0.1. (2) **Operating constraints.** A minimum recall ("catch 95% of fraud"), a minimum precision ("at most 1 in 5 alerts false"), or capacity ("reviewers can handle 200 cases a day", so take the top 200). (3) Without either, maximize $F_1$ or a weighted $F_\beta$ on validation data. I would choose it on a validation set with the deployment prevalence, check the precision and recall at that point with confidence intervals, and monitor it, since prevalence drift moves precision even when the scores do not change. The default 0.5 is only right for equal costs and calibrated probabilities.`,
    pitfalls: [md`Using 0.5 by default.`, md`Tuning the threshold on the test set.`],
    followups: [md`The fraud rate doubles next month. What happens to precision and recall at a fixed threshold?`, md`How does $F_\beta$ weight recall versus precision?`],
  },
];
