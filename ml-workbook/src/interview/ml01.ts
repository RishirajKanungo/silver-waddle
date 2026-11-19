import { md, type InterviewQ } from '../content/types';

export const QUESTIONS: InterviewQ[] = [
  {
    id: 'ml01-q1',
    module: 'ml01',
    area: 'ml-depth',
    level: 2,
    q: md`Derive the closed-form solution of linear regression. When would you not use it?`,
    answer: md`Minimize $L(\bw) = \lVert X\bw - \by\rVert^2$, with a column of ones in $X$ for the bias. Expanding, $L = \bw\T X\T X\bw - 2\by\T X\bw + \by\T\by$, so $\nabla L = 2X\T(X\bw - \by)$. Setting it to zero gives the normal equations $X\T X\bw = X\T\by$, and if $X$ has independent columns, $\hat\bw = (X\T X)^{-1}X\T\by$. Geometrically, the residual is orthogonal to the column space of $X$. In practice I would solve with QR or SVD (\`lstsq\`) rather than invert $X\T X$, because forming it squares the condition number. I would not use the closed form when $d$ is large (the cost is $O(nd^2 + d^3)$ and $X\T X$ is $d\times d$), when the data do not fit in memory or arrive in a stream, or when the loss or penalty has no closed form, such as the lasso. Then I would use (stochastic) gradient descent or an iterative solver like conjugate gradients.`,
    pitfalls: [md`Writing \`inv(X.T @ X)\` in code without mentioning conditioning.`, md`Forgetting the bias column, or that $X\T X$ is singular with collinear features or $d > n$.`],
    followups: [md`What happens when $X\T X$ is singular? (Infinitely many minimizers; the pseudoinverse gives the minimum-norm one; ridge makes it unique.)`, md`What is the time complexity of each approach?`],
  },
  {
    id: 'ml01-q2',
    module: 'ml01',
    area: 'ml-breadth',
    level: 1,
    q: md`What are the assumptions of linear regression, and which of them matter for what?`,
    answer: md`It helps to separate prediction from inference. (1) **Linearity**: $\E[y\mid\bx]$ is linear in the features (which can be transformed). If it fails, predictions are biased; check residuals against fitted values. (2) **Independent errors**: violated by time series or grouped data, which makes standard errors too small. (3) **Homoscedasticity**: constant noise variance; if it fails, OLS is still unbiased but no longer efficient and the usual confidence intervals are wrong (use robust errors or weighted least squares). (4) **Normal errors**: only needed for exact small-sample tests and intervals; it is also what makes OLS the MLE. (5) **No perfect multicollinearity**: $X$ must have full column rank for a unique solution; near-collinearity inflates coefficient variance. (6) **Exogeneity**: errors uncorrelated with the features; omitted correlated variables bias the coefficients, which matters for interpreting them. Gauss–Markov: under 1–3, 5 and exogeneity, OLS is the best linear unbiased estimator.`,
    pitfalls: [md`Claiming the features or the target must be normally distributed. Only the errors matter, and only for inference.`, md`Listing assumptions without saying what breaks when each fails.`],
    followups: [md`How would you detect heteroscedasticity? (Residual plots, Breusch–Pagan test.)`, md`Your residuals show a curve against the fitted values. What do you do?`],
  },
  {
    id: 'ml01-q3',
    module: 'ml01',
    area: 'ml-breadth',
    level: 2,
    q: md`Ridge versus lasso: what is the difference, and when would you use each?`,
    answer: md`Both add a penalty to the squared error. Ridge adds $\lambda\lVert\bw\rVert_2^2$: closed form $(X\T X + \lambda I)^{-1}X\T\by$, always unique, shrinks weights smoothly and most strongly along low-variance directions of $X$, never to exactly zero. Lasso adds $\lambda\lVert\bw\rVert_1$: no closed form (coordinate descent or proximal methods), and it sets some weights exactly to zero. Geometrically, the L1 ball is a diamond whose corners lie on the axes, and the loss contours usually touch it at a corner. Probabilistically, ridge is MAP with a Gaussian prior and lasso with a Laplace prior. Use lasso when you expect few relevant features or need a sparse, interpretable model; use ridge with many small effects or correlated features, which lasso handles by picking one arbitrarily. Elastic net combines them to get sparsity with grouping. Always standardize first and pick $\lambda$ by cross-validation.`,
    pitfalls: [md`Saying lasso is better because it is sparse, without discussing correlated features.`, md`Forgetting that the penalty is not scale-invariant, so features must be standardized.`],
    followups: [md`Derive the soft-thresholding solution for an orthonormal design.`, md`Is weight decay in AdamW the same as an L2 penalty? (For SGD yes, up to scaling; for Adam, decoupled weight decay differs from adding $\lambda\lVert\bw\rVert^2$ to the loss.)`],
  },
  {
    id: 'ml01-q4',
    module: 'ml01',
    area: 'ml-depth',
    level: 2,
    q: md`Why do we use squared error for regression? When would you use something else?`,
    answer: md`If $y = \bw\T\bx + \varepsilon$ with $\varepsilon \sim \mathcal N(0, \sigma^2)$, the negative log-likelihood is $\frac{1}{2\sigma^2}\sum_i (y_i - \bw\T\bx_i)^2$ plus a constant, so minimizing MSE is maximum likelihood. MSE is also smooth and convex for linear models, with a closed-form minimizer, and its minimizer for a constant model is the conditional mean. The downside is sensitivity to outliers, since errors are squared. Alternatives: mean absolute error (MLE under Laplace noise, estimates the conditional median, robust to outliers but not differentiable at 0); Huber loss (quadratic near zero, linear in the tails); quantile (pinball) loss to predict intervals; Poisson or log-transformed targets for counts or strictly positive skewed targets; and heteroscedastic Gaussian NLL when the noise level varies and you want to predict it.`,
    pitfalls: [md`Saying "because it is differentiable" only, without the probabilistic reason.`],
    followups: [md`What does the minimizer of MAE estimate?`, md`How would you predict a 90% interval for a delivery time?`],
  },
  {
    id: 'ml01-q5',
    module: 'ml01',
    area: 'ml-coding',
    level: 2,
    q: md`Implement linear regression trained with gradient descent in NumPy, vectorized. What would you check?`,
    answer: md`\`\`\`python
def fit(X, y, lr=0.1, steps=1000):
    n, d = X.shape
    w, b = np.zeros(d), 0.0
    for _ in range(steps):
        r = X @ w + b - y           # (n,)
        w -= lr * 2 / n * (X.T @ r)  # (d,)
        b -= lr * 2 / n * r.sum()
    return w, b
\`\`\`
The gradient is $\frac2n X\T(X\bw + b - \by)$; no loop over examples. Checks: standardize features first (or the step size must be tiny and convergence is slow); verify the gradient against central finite differences; plot the loss per step, which must decrease monotonically for full-batch GD with a stable step ($\eta < 2/\lambda_{\max}$ of the Hessian $\frac2n X\T X$); compare the result with \`np.linalg.lstsq\` on a small problem; and confirm shapes, since \`y\` of shape \`(n, 1)\` broadcasts silently against \`(n,)\` into an $(n, n)$ matrix.`,
    pitfalls: [md`Looping over examples in Python.`, md`Shape bugs with \`(n, 1)\` versus \`(n,)\` targets that broadcast into an $(n, n)$ array.`],
    followups: [md`Turn it into mini-batch SGD. What changes?`, md`How do you choose the learning rate?`],
  },
  {
    id: 'ml01-q6',
    module: 'ml01',
    area: 'ml-breadth',
    level: 2,
    q: md`What is multicollinearity? How does it affect a linear model, and what do you do about it?`,
    answer: md`Multicollinearity means some features are (nearly) linear combinations of others, for example area in m² and in ft², or several highly correlated sensor readings. Then $X\T X$ is (nearly) singular: the data constrain only certain combinations of the weights, so individual coefficients have very large variance and can flip sign between resamples, while predictions within the data range are barely affected. It matters for interpretation and for stability under distribution shift, much less for in-distribution accuracy. Detect it with pairwise correlations, the condition number of standardized $X$, or variance inflation factors $\text{VIF}_j = 1/(1 - R_j^2)$, where values above about 5 to 10 are a common warning sign. Remedies: drop or merge redundant features, use PCA or domain-based combinations, or regularize. Ridge stabilizes the estimates by shrinking the poorly determined directions, and elastic net if you also want sparsity.`,
    pitfalls: [md`Saying it hurts prediction accuracy in general; mainly it hurts coefficient interpretation.`],
    followups: [md`Why does ridge fix it? Explain with the SVD.`, md`How does lasso behave with two nearly identical features?`],
  },
  {
    id: 'ml01-q7',
    module: 'ml01',
    area: 'ml-depth',
    level: 2,
    q: md`Why does feature scaling matter for gradient descent? Does it matter for the closed-form solution?`,
    answer: md`For the MSE the Hessian is $H = \frac2n X\T X$. Gradient descent converges only for $\eta < 2/\lambda_{\max}(H)$, and the error along the eigenvector with eigenvalue $\lambda_{\min}$ shrinks by $1 - \eta\lambda_{\min}$ per step, so the number of steps grows roughly with the condition number $\kappa = \lambda_{\max}/\lambda_{\min}$. Features on very different scales, or uncentred features alongside an intercept, give a large $\kappa$: the loss is a narrow tilted valley and GD zigzags across it. Standardizing (subtract the mean, divide by the standard deviation, fitted on training data) brings $\kappa$ close to 1 for uncorrelated features. For the closed-form OLS solution, scaling does not change the predictions, because it is an invertible change of variables. It does change regularized solutions, since the penalty treats all weights alike, and it improves the numerical conditioning of the solve.`,
    pitfalls: [md`Fitting the scaler on the full dataset, which leaks test information.`, md`Saying scaling changes OLS predictions.`],
    followups: [md`What does Adam do that partly compensates for poor scaling?`, md`What is the optimal fixed step size for a quadratic?`],
  },
  {
    id: 'ml01-q8',
    module: 'ml01',
    area: 'ml-depth',
    level: 3,
    q: md`Explain regularization as a prior. What prior gives ridge, what gives lasso, and what does λ correspond to?`,
    answer: md`With Gaussian noise of variance $\sigma^2$, the negative log-likelihood is $\frac{1}{2\sigma^2}\lVert\by - X\bw\rVert^2$. A MAP estimate also adds $-\log p(\bw)$. For independent $w_j \sim \mathcal N(0, \tau^2)$ that is $\frac{1}{2\tau^2}\lVert\bw\rVert^2$; multiplying by $2\sigma^2$ gives ridge with $\lambda = \sigma^2/\tau^2$. For a Laplace prior with scale $\beta$ it is $\frac1\beta\lVert\bw\rVert_1$, giving the lasso with $\lambda = 2\sigma^2/\beta$. So $\lambda$ is the ratio of noise to prior variance: noisy data or a tight prior means strong shrinkage. The Laplace density is peaked at zero, which matches the lasso's exact zeros at the posterior mode, although the posterior mean under a Laplace prior is not sparse. MAP gives a point estimate only; the full Bayesian treatment (for ridge, a Gaussian posterior with covariance $\sigma^2(X\T X + \lambda I)^{-1}$) also gives uncertainty.`,
    pitfalls: [md`Mixing up which prior gives which penalty.`, md`Claiming the Bayesian posterior under a Laplace prior is sparse; only its mode is.`],
    followups: [md`Derive the posterior of $\bw$ under the Gaussian prior.`, md`How is this related to early stopping in gradient descent?`],
  },
];
