import { md, type Module } from '../types';

export const MODULE: Module = {
  id: 'ml01',
  part: 'ml',
  order: 1,
  title: 'Linear regression',
  summary: 'The linear model and the squared loss, the normal equations, gradient descent and feature scaling, basis features, and ridge, lasso and elastic-net regularization.',
  relevance: md`Linear regression is the baseline for every regression problem and the template for the rest of supervised learning: a model, a loss derived from a noise model, an optimizer, and a regularizer. The final layer of most networks is a linear model, and weight decay in AdamW is the ridge penalty applied during optimization. Interviews commonly ask you to derive the closed form and the gradient, implement both in NumPy, explain why feature scaling matters, compare ridge and lasso, and list the assumptions of linear regression.`,
  prereqs: ['la01'],
  areas: ['ml-breadth', 'ml-depth', 'ml-coding', 'math'],
  lessons: [
    // ------------------------------------------------------------------ 1.1
    {
      id: 'ml01-1',
      title: 'The linear model, squared error and the normal equations',
      minutes: 35,
      objectives: [
        'Write the linear model for one example and for a whole dataset, with the bias absorbed into a column of ones.',
        'Compute the residuals and the MSE of a given line by hand.',
        'Derive the MSE as the negative log-likelihood under Gaussian noise.',
        'Solve the normal equations for a small dataset and explain them as the residual being orthogonal to the columns of X.',
      ],
      cells: [
        {
          kind: 'text',
          md: md`A **regression** model predicts a number. The simplest one predicts with a weighted sum of the features. To estimate a flat's monthly rent from its area $x_1$ (m²), its number of rooms $x_2$ and its distance to the centre $x_3$ (km):

$$\hat y = w_1x_1 + w_2x_2 + w_3x_3 + b = \bw\T\bx + b.$$

The **weights** $\bw$ and the **bias** (intercept) $b$ are learned from $n$ examples $(\bx_i, y_i)$. Training means choosing them so that the predictions $\hat y_i$ are close to the targets $y_i$. A **loss function** makes "close" precise.`,
        },
        {
          kind: 'callout',
          tone: 'notation',
          md: md`Stack the examples as the rows of the **design matrix** $X \in \R^{n\times d}$ and the targets in $\by \in \R^n$. All predictions at once are $\hat\by = X\bw + b\mathbf{1}$, where $\mathbf{1}$ is the vector of ones. Appending a constant feature $1$ to every example absorbs the bias: with $\tilde X = [\,\mathbf{1}\ \ X\,]$ and $\tilde\bw = (b, \bw)$, $\hat\by = \tilde X\tilde\bw$. When no bias is written below, assume the column of ones is already part of $X$.`,
        },
        {
          kind: 'callout',
          tone: 'definition',
          title: 'Residuals and mean squared error',
          md: md`The **residual** of example $i$ is $r_i = y_i - \hat y_i$. The **mean squared error** is $$L(\bw, b) = \frac1n\sum_{i=1}^n \left(y_i - \bw\T\bx_i - b\right)^2 = \frac1n\lVert \by - X\bw\rVert^2.$$ **Ordinary least squares** (OLS) chooses the parameters that minimize it. The sum without the $\tfrac1n$, $\sum_i r_i^2$, is the **sum of squared errors** (SSE); both have the same minimizer.`,
        },
        {
          kind: 'viz',
          viz: { type: 'ml.lr-fit', mode: 'squares' },
          task: md`Drag the two green handles on the line to make the total red area as small as you can, then press **Fit** and compare your MSE with the best one. Next drag the right-most data point to the top of the plot and press **Fit** again. Which square dominates the total, and how far does the line move?`,
          caption: md`Each residual is drawn as a square with side $|r_i|$, so the red area is $\sum_i r_i^2 = n\cdot\text{MSE}$. The small panel is the MSE as a function of $(w, b)$: a bowl whose lowest point (hollow green) is the least-squares line. Dragging the blue dot there moves the line here.`,
        },
        {
          kind: 'text',
          md: md`**Worked example.** Take the points $(1, 1), (2, 3), (3, 2)$ and the line $\hat y = x$. The residuals $y_i - \hat y_i$ are $0, 1, -1$, their squares $0, 1, 1$, so the MSE is $2/3 \approx 0.667$. The least-squares line for these points (computed later in this lesson) is $\hat y = 0.5x + 1$. Its residuals are $-0.5, 1, -0.5$ and its MSE is $(0.25 + 1 + 0.25)/3 = 0.5$.`,
        },
        {
          kind: 'numeric',
          q: md`Data: $(1, 2), (2, 2), (3, 5), (4, 7)$. Compute the MSE of the line $\hat y = 2x - 1$.`,
          answer: { kind: 'number', value: 0.5 },
          hints: [md`The predictions are $1, 3, 5, 7$.`],
          explain: md`Residuals $y_i - \hat y_i$: $2 - 1 = 1$, $2 - 3 = -1$, $5 - 5 = 0$, $7 - 7 = 0$. Squares $1, 1, 0, 0$, so MSE $= 2/4 = 0.5$.`,
        },
        {
          kind: 'check',
          q: md`Four targets $y = 1, 2, 3, 10$ and no features. The constant model $\hat y = c$ has the smallest MSE at`,
          options: [md`$c = 4$, the mean`, md`$c = 2.5$, the median`, md`$c = 10$, the largest value`, md`$c = 3$, the most central data point`],
          answer: 0,
          explain: md`$\frac{d}{dc}\frac1n\sum_i (y_i - c)^2 = -\frac2n\sum_i (y_i - c) = 0$ gives $c = \bar y = 16/4 = 4$. The mean absolute error $\frac1n\sum_i |y_i - c|$ is minimized by the median, $2.5$. Squared error lets the outlier $10$ pull the estimate; absolute error does not.`,
        },
        {
          kind: 'callout',
          tone: 'intuition',
          title: 'Why squares',
          md: md`Squared error charges a residual of 2 four times as much as a residual of 1, so the fit prefers many small errors to a few large ones, and one outlier can pull the line. Squaring also makes the loss a smooth bowl with a closed-form minimum. The deeper reason is probabilistic: minimizing MSE is maximum likelihood when the noise is Gaussian.`,
        },
        {
          kind: 'derive',
          title: 'MSE from maximum likelihood',
          goal: md`Assume $y_i = \bw\T\bx_i + b + \varepsilon_i$ with independent noise $\varepsilon_i \sim \mathcal N(0, \sigma^2)$. Show that maximizing the likelihood of the data over $(\bw, b)$ is the same as minimizing the MSE.`,
          steps: [
            { md: md`Under the model, each target is Gaussian around the prediction $\hat y_i = \bw\T\bx_i + b$: $$p(y_i \mid \bx_i) = \frac{1}{\sqrt{2\pi\sigma^2}}\exp\!\left(-\frac{(y_i - \hat y_i)^2}{2\sigma^2}\right).$$ Independence makes the likelihood of the dataset the product $\prod_{i=1}^n p(y_i \mid \bx_i)$.` },
            {
              md: md`Take the logarithm. It is increasing, so it has the same maximizer, and it turns the product into a sum: $$\log \prod_i p(y_i\mid\bx_i) = -\frac n2\log(2\pi\sigma^2) - \frac{1}{2\sigma^2}\sum_{i=1}^n (y_i - \hat y_i)^2.$$`,
              choose: {
                prompt: md`A product of $n$ densities is awkward to maximize. What is the standard next move?`,
                options: [md`Take the logarithm`, md`Differentiate the product directly with the product rule`, md`Replace the product by its largest factor`],
                answer: 0,
                explain: md`The log is monotone, so the maximizer does not change, and $\log$ of a product of exponentials is a sum of their exponents. This is the move behind every MLE in the course.`,
              },
            },
            {
              md: md`Only the second term depends on $(\bw, b)$, and it is $-\frac{1}{2\sigma^2}\cdot\text{SSE}$. Maximizing it means minimizing $\text{SSE} = n\cdot\text{MSE}$.`,
              choose: {
                prompt: md`Which part of the log-likelihood matters for choosing $(\bw, b)$?`,
                options: [md`$-\frac{1}{2\sigma^2}\sum_i (y_i - \hat y_i)^2$`, md`$-\frac n2\log(2\pi\sigma^2)$`, md`Both terms equally`],
                answer: 0,
                explain: md`The first term contains no $\bw$ or $b$. Since $\sigma^2 > 0$, the factor $-\frac{1}{2\sigma^2}$ only flips max into min.`,
              },
            },
            { md: md`For a fixed fit, setting the derivative with respect to $\sigma^2$ to zero, $-\frac{n}{2\sigma^2} + \frac{\text{SSE}}{2\sigma^4} = 0$, gives the noise estimate $\hat\sigma^2 = \text{SSE}/n = \text{MSE}$.` },
          ],
          takeaway: md`MSE is the Gaussian negative log-likelihood up to constants. A different noise model gives a different loss: Laplace noise gives the mean absolute error, and Bernoulli labels give the cross-entropy of the next module.`,
        },
        {
          kind: 'viz',
          viz: { type: 'ml.lr-fit', mode: 'gauss', w: 0.6, b: 1.2 },
          task: md`Press **Fit**, then move the $\sigma$ slider. Does the best line depend on $\sigma$? Find the $\sigma$ that makes $-\log p$ smallest and compare it with $\hat\sigma = \sqrt{\text{MSE}}$. Then drag one point far from the line and watch its red segment shrink.`,
          caption: md`Each orange curve is the noise density $\mathcal N(\hat y_i, \sigma^2)$ at $x_i$, drawn sideways. The red segment is the density at the observed $y_i$, the likelihood of that point. A point far from the line sits in a thin tail and contributes a large $-\log p$.`,
        },
        {
          kind: 'numeric',
          q: md`Under the Gaussian noise model, a fitted line has residuals $1, -1, 2, 0$. What is the maximum-likelihood estimate of the noise variance $\sigma^2$?`,
          answer: { kind: 'number', value: 1.5 },
          explain: md`$\hat\sigma^2 = \text{SSE}/n = (1 + 1 + 4 + 0)/4 = 1.5$. (An unbiased estimate divides by $n - p$ instead, where $p$ is the number of fitted parameters, here 2; that gives $3$.)`,
        },
        {
          kind: 'text',
          md: md`The MSE is a quadratic function of $\bw$, so its minimum can be found exactly. The least-squares module derived it geometrically: as $\bw$ varies, $X\bw$ ranges over the column space of $X$, and the point of that subspace closest to $\by$ is the orthogonal projection of $\by$. At the best fit the residual vector is orthogonal to every column of $X$.`,
        },
        {
          kind: 'callout',
          tone: 'theorem',
          title: 'The normal equations',
          md: md`If the columns of $X$ (including the column of ones) are linearly independent, the MSE has the unique minimizer $$\hat\bw = (X\T X)^{-1}X\T\by,$$ the solution of the **normal equations** $X\T X\,\hat\bw = X\T\by$.`,
        },
        {
          kind: 'derive',
          title: 'the normal equations from orthogonality',
          goal: md`Show that the least-squares $\hat\bw$ satisfies $X\T X\hat\bw = X\T\by$, and that it is unique when $X$ has independent columns.`,
          steps: [
            { md: md`The residual is $\br = \by - X\bw$. The fit is best exactly when $\br$ is orthogonal to the column space of $X$, that is, orthogonal to each column $\mathbf{c}_j$: $\mathbf{c}_j\T(\by - X\bw) = 0$ for every $j$.` },
            {
              md: md`The rows of $X\T$ are the columns $\mathbf{c}_j$, so the $d$ conditions stack into one matrix equation: $$X\T(\by - X\bw) = \bzero \iff X\T X\bw = X\T\by.$$`,
              choose: {
                prompt: md`How do you write "orthogonal to every column of $X$" as one equation?`,
                options: [md`$X\T\br = \bzero$`, md`$X\br = \bzero$`, md`$\br\T\br = 0$`],
                answer: 0,
                explain: md`Entry $j$ of $X\T\br$ is $\mathbf{c}_j\T\br$. $X\br$ does not even have matching shapes ($X$ is $n\times d$, $\br$ has $n$ entries), and $\br\T\br = 0$ would mean a perfect fit.`,
              },
            },
            { md: md`$X\T X$ is invertible when the columns are independent: for $\bv \ne \bzero$, $\bv\T X\T X\bv = \lVert X\bv\rVert^2 > 0$ because $X\bv \ne \bzero$. Multiply by the inverse: $\hat\bw = (X\T X)^{-1}X\T\by$.` },
            { md: md`The column of ones gives one of the equations: $\mathbf{1}\T\br = \sum_i r_i = 0$. With an intercept, the least-squares residuals always average to zero.` },
          ],
          takeaway: md`Lesson 2 reaches the same equations by setting the gradient of the MSE to zero. Geometry and calculus agree because the MSE is a squared distance.`,
        },
        {
          kind: 'numeric',
          q: md`Fit $\hat y = wx + b$ to $(1, 2), (2, 2), (3, 5), (4, 7)$ with the normal equations. Enter $[b, w]$.`,
          answer: { kind: 'vector', value: [-0.5, 1.8] },
          hints: [md`With columns $(1, x)$: $X\T X = \begin{bmatrix} 4 & 10 \\ 10 & 30 \end{bmatrix}$ and $X\T\by = \begin{bmatrix} 16 \\ 49 \end{bmatrix}$.`],
          explain: md`Solve $4b + 10w = 16$ and $10b + 30w = 49$. Multiply the first by $2.5$: $10b + 25w = 40$. Subtract: $5w = 9$, so $w = 1.8$ and $b = (16 - 18)/4 = -0.5$. The MSE of this line is $0.45$, below the $0.5$ of $\hat y = 2x - 1$.`,
          inputHint: '[b, w]',
        },
        {
          kind: 'paper',
          problem: {
            id: 'ml01-1-paper',
            title: 'Simple linear regression in closed form',
            type: 'derive',
            difficulty: 2,
            minutes: 12,
            statement: md`For one feature, $\hat y = wx + b$, show from the normal equations that $$w = \frac{\sum_i (x_i - \bar x)(y_i - \bar y)}{\sum_i (x_i - \bar x)^2}, \qquad b = \bar y - w\bar x.$$ Conclude that the fitted line passes through $(\bar x, \bar y)$. Then use the formulas on $(0, 1), (1, 3), (2, 2), (3, 6)$ and enter $[b, w]$.`,
            hints: [md`The two normal equations are $\sum_i (y_i - b - wx_i) = 0$ and $\sum_i x_i(y_i - b - wx_i) = 0$.`, md`In the second equation, replace $\sum_i x_i(\cdot)$ by $\sum_i (x_i - \bar x)(\cdot)$; this is allowed because the first equation says $\sum_i (\cdot) = 0$.`],
            solution: [
              md`The normal equations for the columns $\mathbf{1}$ and $\bx$ say the residuals $r_i = y_i - b - wx_i$ satisfy $\sum_i r_i = 0$ and $\sum_i x_ir_i = 0$.`,
              md`From the first: $n\bar y - nb - nw\bar x = 0$, so $b = \bar y - w\bar x$. The point $(\bar x, \bar y)$ is on the line because $w\bar x + b = \bar y$.`,
              md`Substitute $b$: $r_i = (y_i - \bar y) - w(x_i - \bar x)$. Since $\sum_i r_i = 0$, the second equation can be written $\sum_i (x_i - \bar x)r_i = 0$.`,
              md`That is $\sum_i (x_i - \bar x)(y_i - \bar y) - w\sum_i (x_i - \bar x)^2 = 0$, which gives the formula for $w$ (defined when not all $x_i$ are equal).`,
              md`Data: $\bar x = 1.5$, $\bar y = 3$. $\sum (x_i - \bar x)^2 = 2.25 + 0.25 + 0.25 + 2.25 = 5$ and $\sum (x_i - \bar x)(y_i - \bar y) = (-1.5)(-2) + (-0.5)(0) + (0.5)(-1) + (1.5)(3) = 7$.`,
              md`So $w = 7/5 = 1.4$ and $b = 3 - 1.4 \cdot 1.5 = 0.9$.`,
            ],
            answer: { kind: 'vector', value: [0.9, 1.4] },
            rubric: [md`Both normal equations written as conditions on the residuals`, md`$b = \bar y - w\bar x$ derived and the point $(\bar x, \bar y)$ identified`, md`Centering step justified by $\sum_i r_i = 0$`, md`Correct numbers $b = 0.9$, $w = 1.4$`],
            areas: ['ml-depth', 'math'],
          },
        },
        {
          kind: 'code',
          code: `import numpy as np

x = np.array([1.0, 2.0, 3.0, 4.0])
y = np.array([2.0, 2.0, 5.0, 7.0])
X = np.column_stack([np.ones_like(x), x])   # first column: the constant feature for b
w = np.linalg.solve(X.T @ X, X.T @ y)
print(np.round(w, 3))`,
          predict: {
            q: md`The design matrix has columns $(1, x)$. What does this print?`,
            options: ['`[-0.5  1.8]`', '`[ 1.8 -0.5]`', '`[-0.5, 1.8]`', '`[0.45]`'],
            answer: 0,
            explain: md`The solution is $(b, w) = (-0.5, 1.8)$, in the order of the columns. NumPy prints arrays without commas and pads the columns, which is why there are two spaces.`,
          },
        },
        {
          kind: 'callout',
          tone: 'warning',
          title: 'Do not invert X^T X in code',
          md: md`Never form $(X\T X)^{-1}$ explicitly. Solve the system with \`np.linalg.solve(X.T @ X, X.T @ y)\`, or better call \`np.linalg.lstsq(X, y, rcond=None)\`, which works on $X$ directly through an orthogonal factorization. Forming $X\T X$ squares the condition number, $\kappa(X\T X) = \kappa(X)^2$, so twice as many digits are lost to rounding. A direct solve costs $O(nd^2 + d^3)$ time and needs the data in memory, which is why large models are trained with gradient methods instead (lesson 2).`,
        },
        {
          kind: 'code',
          code: `import numpy as np

x = np.linspace(0, 1, 50)
for degree in (1, 3, 5, 7):
    X = x[:, None] ** np.arange(degree + 1)     # columns 1, x, x^2, ..., x^degree
    print(degree, f"cond(X) = {np.linalg.cond(X):.1e}", f"cond(X^T X) = {np.linalg.cond(X.T @ X):.1e}")`,
          note: md`Polynomial features on $[0, 1]$ are nearly dependent, and squaring makes it worse: at degree 7, $\kappa(X\T X) \approx 10^{10}$, so the normal equations keep only about 6 of the 16 significant digits of float64. \`lstsq\` works with $\kappa(X) \approx 10^5$.`,
        },
        {
          kind: 'recall',
          prompt: md`Without looking back: write the MSE in matrix form, the normal equations, and the noise assumption under which minimizing MSE is maximum likelihood.`,
          answer: md`$L(\bw) = \frac1n\lVert\by - X\bw\rVert^2$. Normal equations: $X\T X\hat\bw = X\T\by$, so $\hat\bw = (X\T X)^{-1}X\T\by$ when $X$ has independent columns. Minimizing MSE is MLE when $y_i = \bw\T\bx_i + \varepsilon_i$ with independent $\varepsilon_i \sim \mathcal N(0, \sigma^2)$, the same $\sigma$ for every example.`,
        },
      ],
      cards: [
        { id: 'ml01-1-c1', kind: 'concept', front: md`State the normal equations and when they have a unique solution.`, back: md`$X\T X\hat\bw = X\T\by$. Unique when the columns of $X$ (including the column of ones) are linearly independent; then $\hat\bw = (X\T X)^{-1}X\T\by$.` },
        { id: 'ml01-1-c2', kind: 'cloze', text: md`Minimizing the MSE is maximum likelihood when the noise is {{}}.`, answers: ['gaussian'] },
        { id: 'ml01-1-c3', kind: 'compute', front: md`MSE of $\hat y = x$ on the points $(0, 1), (1, 1), (2, 4)$?`, answer: { kind: 'number', value: 5 / 3 }, back: md`Residuals $1, 0, 2$; squares $1, 0, 4$; MSE $= 5/3 \approx 1.667$.` },
        { id: 'ml01-1-c4', kind: 'concept', front: md`Why use \`lstsq\` (or \`solve\`) instead of \`inv(X.T @ X) @ X.T @ y\`?`, back: md`Forming $X\T X$ squares the condition number and inverting adds more rounding error and cost. \`lstsq\` factorizes $X$ itself (QR or SVD) and is the numerically stable choice.` },
        { id: 'ml01-1-c5', kind: 'cloze', text: md`With an intercept in the model, the least-squares residuals sum to {{}}.`, answers: ['0'] },
      ],
    },
    // ------------------------------------------------------------------ 1.2
    {
      id: 'ml01-2',
      title: 'Gradient descent, feature scaling and basis features',
      minutes: 40,
      objectives: [
        'Derive the vectorized gradient (2/n) X^T (Xw − y) and take one gradient-descent step by hand.',
        'Explain with the eigenvalues of the Hessian why unscaled features slow gradient descent, and give the stability limit on the step size.',
        'Implement the closed form and gradient descent for linear regression in vectorized NumPy.',
        'Fit polynomial features with a linear model, interpret a coefficient, and recognize multicollinearity.',
      ],
      cells: [
        {
          kind: 'text',
          md: md`The closed form needs $O(nd^2 + d^3)$ time and the whole dataset in memory. With hundreds of thousands of features, or data that arrives in mini-batches, models are trained by **gradient descent** instead (the gradient-descent module covers it in general). Linear regression is the clearest place to watch it work: the loss is an exact quadratic, so every quantity, including how fast it converges, can be computed.`,
        },
        {
          kind: 'derive',
          title: 'the gradient of the MSE',
          goal: md`Show that $L(\bw) = \frac1n\lVert X\bw - \by\rVert^2$ has gradient $\nabla L(\bw) = \frac2n X\T(X\bw - \by)$.`,
          steps: [
            {
              md: md`Write the squared norm as a dot product and expand: $$L(\bw) = \frac1n (X\bw - \by)\T(X\bw - \by) = \frac1n\left(\bw\T X\T X\bw - 2\by\T X\bw + \by\T\by\right).$$ The two cross terms are equal scalars, $\bw\T X\T\by = \by\T X\bw$.`,
              choose: {
                prompt: md`What is the first move to differentiate $\lVert X\bw - \by\rVert^2$?`,
                options: [md`Write it as $(X\bw - \by)\T(X\bw - \by)$ and expand`, md`Differentiate each entry of $X$`, md`Replace it with $\lVert X\rVert^2\lVert\bw\rVert^2$`],
                answer: 0,
                explain: md`Expanding gives a quadratic form, a linear term and a constant, and each has a standard gradient. The third option is only an upper bound.`,
              },
            },
            {
              md: md`Use the two matrix-calculus rules: $\nabla_{\bw}(\bw\T A\bw) = 2A\bw$ for symmetric $A$ (here $A = X\T X$), and $\nabla_{\bw}(\mathbf{c}\T\bw) = \mathbf{c}$ (here $\mathbf{c} = X\T\by$, since $\by\T X\bw = (X\T\by)\T\bw$).`,
              choose: {
                prompt: md`What is $\nabla_{\bw}\left(\bw\T X\T X\bw\right)$?`,
                options: [md`$2X\T X\bw$`, md`$X\T X\bw$`, md`$2\bw\T X\T X$ as a column, which is the same thing transposed only when $X$ is square`],
                answer: 0,
                explain: md`For symmetric $A$, $\nabla(\bw\T A\bw) = (A + A\T)\bw = 2A\bw$. The factor 2 is the vector analogue of $\frac{d}{dw}aw^2 = 2aw$.`,
              },
            },
            { md: md`Combine: $\nabla L(\bw) = \frac1n\left(2X\T X\bw - 2X\T\by\right) = \frac2n X\T(X\bw - \by)$.` },
            { md: md`Read it per example: $X\T(X\bw - \by) = \sum_i (\hat y_i - y_i)\,\bx_i$. Each example pushes $\bw$ along its own input vector, weighted by its signed error. Setting the gradient to zero gives $X\T X\bw = X\T\by$, the normal equations of lesson 1.` },
          ],
          takeaway: md`The gradient is "inputs transposed times residuals": $\frac2n X\T\br$ with $\br = \hat\by - \by$. The same shape appears in logistic regression and in the last layer of every network trained with these losses.`,
        },
        {
          kind: 'callout',
          tone: 'definition',
          title: 'Gradient descent for linear regression',
          md: md`Start from $\bw_0$ (often $\bzero$) and repeat $$\bw_{t+1} = \bw_t - \eta\,\frac2n X\T(X\bw_t - \by).$$ Shapes: $X$ is $n\times d$, $\bw$ has $d$ entries, the residual $X\bw - \by$ has $n$ entries, and $X\T$ times it has $d$ entries again. With an explicit bias, its gradient is $\frac2n\sum_i (\hat y_i - y_i)$, the derivative for the column of ones.`,
        },
        {
          kind: 'numeric',
          q: md`Points $(1, 1), (2, 3), (3, 2)$, model $\hat y = wx + b$, MSE loss. At $w = b = 0$, compute the gradient. Enter $[\partial L/\partial w,\ \partial L/\partial b]$.`,
          answer: { kind: 'vector', value: [-26 / 3, -4] },
          hints: [md`All predictions are 0, so $\hat y_i - y_i = -1, -3, -2$.`, md`$\partial L/\partial w = \frac2n\sum_i (\hat y_i - y_i)x_i$ and $\partial L/\partial b = \frac2n\sum_i(\hat y_i - y_i)$.`],
          explain: md`$\partial L/\partial w = \frac23(-1\cdot1 - 3\cdot 2 - 2\cdot 3) = \frac23(-13) = -\frac{26}{3} \approx -8.667$ and $\partial L/\partial b = \frac23(-6) = -4$. Both are negative: increasing $w$ and $b$ lowers the loss.`,
          inputHint: 'fractions are fine, e.g. [-26/3, -4]',
        },
        {
          kind: 'numeric',
          q: md`Take one gradient-descent step from $w = b = 0$ with $\eta = 0.15$, using the gradient you just computed. Enter $[w_1, b_1]$.`,
          answer: { kind: 'vector', value: [1.3, 0.6] },
          explain: md`$w_1 = 0 - 0.15\cdot(-26/3) = 1.3$ and $b_1 = 0 - 0.15\cdot(-4) = 0.6$. The MSE drops from $14/3 \approx 4.67$ to $\frac13\left(0.9^2 + 0.2^2 + 2.5^2\right) \approx 2.367$.`,
        },
        {
          kind: 'viz',
          viz: { type: 'ml.lr-gd' },
          task: md`With **raw x**, set $\eta$ just below the stability limit $2/\lambda_{\max}$ shown in the panel and press **Play**. How many steps does it take to reach $10^{-3}$ of the starting error? Push $\eta$ past the limit. Then switch to **standardized x** and try $\eta = 0.3$ and $\eta = 0.5$.`,
          caption: md`MSE contours over the two parameters for $x = 1, 2, \dots, 10$. With the raw feature, slope and intercept are strongly coupled, so the bowl is a narrow valley ($\kappa \approx 187$). Any step size stable for the steep direction crawls along the flat one. After standardizing, the contours are circles and $\kappa = 1$. You can drag the starting point (black).`,
        },
        {
          kind: 'callout',
          tone: 'theorem',
          title: 'Gradient descent on a quadratic',
          md: md`Let $H = \frac2n X\T X$ (the Hessian of the MSE) have eigenvalues $\lambda_{\max} \ge \dots \ge \lambda_{\min} > 0$. Because $\nabla L(\bw) = H(\bw - \hat\bw)$, gradient descent satisfies $$\bw_{t+1} - \hat\bw = (I - \eta H)(\bw_t - \hat\bw).$$ Along the $k$-th eigenvector the error is multiplied by $1 - \eta\lambda_k$ at every step. So GD converges for every start exactly when $0 < \eta < 2/\lambda_{\max}$. The best fixed step, $\eta = 2/(\lambda_{\max} + \lambda_{\min})$, gives the rate $\frac{\kappa - 1}{\kappa + 1}$ per step with $\kappa = \lambda_{\max}/\lambda_{\min}$, so the number of steps grows roughly in proportion to $\kappa$.`,
        },
        {
          kind: 'check',
          q: md`For the raw feature in the figure, $\lambda_{\max} \approx 78.6$ and $\lambda_{\min} \approx 0.42$. With $\eta = 0.02$, by what factor does the error along the **flat** direction shrink per step?`,
          options: [md`$0.9916$`, md`$0.572$`, md`$0.02$`, md`$1.572$`],
          answer: 0,
          explain: md`$1 - \eta\lambda_{\min} = 1 - 0.02\cdot 0.42 = 0.9916$: less than 1% progress per step. Along the steep direction the factor is $|1 - 0.02\cdot78.6| = 0.572$, which is why the path first zigzags quickly into the valley and then crawls along it.`,
        },
        {
          kind: 'text',
          md: md`**Feature scaling.** Standardize each feature with the training-set mean $\mu_j$ and standard deviation $s_j$: $x_j \leftarrow (x_j - \mu_j)/s_j$. Two things improve:

- Centering makes every feature orthogonal to the column of ones, which decouples the intercept from the slopes (the tilted valley in the figure).
- Dividing by $s_j$ equalizes the curvature across features, so one step size suits all of them.

For a single standardized feature with a bias, $\frac1n X\T X = I$ and $H = 2I$. Standardizing does not change the OLS predictions: it is an invertible affine change of the features, and the weights adjust to compensate ($w_j = w'_j/s_j$ and $b = b' - \sum_j w'_j\mu_j/s_j$). It does change ridge and lasso solutions, because the penalty is not scale-invariant (lesson 3).`,
        },
        {
          kind: 'numeric',
          q: md`One standardized feature plus a bias, so $H = 2I$. What is the largest step size $\eta$ for which gradient descent converges? (Enter the boundary value.)`,
          answer: { kind: 'number', value: 1 },
          explain: md`Both eigenvalues are 2, so the condition is $\eta < 2/2 = 1$. At $\eta = 0.5$ the factor $1 - \eta\lambda$ is $0$: GD lands on the optimum in a single step, as the figure shows.`,
        },
        {
          kind: 'exercise',
          ex: {
            id: 'ml01-2-ex1',
            title: 'Linear regression in closed form',
            prompt: md`Write \`fit_closed_form(X, y)\` for a design matrix \`X\` of shape \`(n, d)\` **without** a bias column. Add a column of ones in front, solve the normal equations with \`np.linalg.solve\` (no explicit inverse), and return the vector $[b, w_1, \dots, w_d]$ of shape \`(d + 1,)\`.`,
            starter: `import numpy as np

def fit_closed_form(X, y):
    # 1. prepend a column of ones
    # 2. solve (Xb^T Xb) w = Xb^T y
    pass

np.random.seed(1)
X = np.random.randn(30, 3)
y = X @ np.array([2.0, -1.0, 0.5]) + 4.0 + 0.1 * np.random.randn(30)
print(fit_closed_form(X, y))`,
            solution: `import numpy as np

def fit_closed_form(X, y):
    Xb = np.column_stack([np.ones(len(X)), X])
    return np.linalg.solve(Xb.T @ Xb, Xb.T @ y)

np.random.seed(1)
X = np.random.randn(30, 3)
y = X @ np.array([2.0, -1.0, 0.5]) + 4.0 + 0.1 * np.random.randn(30)
print(fit_closed_form(X, y))`,
            tests: [
              { expr: 'np.round(fit_closed_form(X, y), 6).tolist()', label: 'recovers b = 4 and w = (2, -1, 0.5) up to noise' },
              { expr: 'fit_closed_form(X, y).shape', label: 'shape (d + 1,)' },
              { expr: 'np.round(fit_closed_form(np.array([[1.0], [2.0], [3.0], [4.0]]), np.array([2.0, 2.0, 5.0, 7.0])), 6).tolist()', label: 'the four-point example gives [-0.5, 1.8]' },
            ],
            hints: [md`\`np.column_stack([np.ones(len(X)), X])\` prepends the ones.`, md`\`np.linalg.solve(A, b)\` solves $A\bw = \mathbf{b}$; here $A = X_b\T X_b$ and $\mathbf{b} = X_b\T\by$.`],
            mustExclude: ['inv('],
          },
        },
        {
          kind: 'exercise',
          ex: {
            id: 'ml01-2-ex2',
            title: 'Linear regression by gradient descent',
            prompt: md`Write \`gd_fit(X, y, lr=0.1, steps=300)\` that starts from $\bw = \bzero$, $b = 0$ and runs full-batch gradient descent on the MSE, returning \`(w, b)\`. Inside the loop over steps, compute the gradient with matrix operations (no loop over examples): residual \`r = X @ w + b - y\`, then $\frac2n X\T\br$ and $\frac2n\sum_i r_i$. The features are already standardized, so after 300 steps the result should match the closed form.`,
            starter: `import numpy as np

def gd_fit(X, y, lr=0.1, steps=300):
    n, d = X.shape
    w = np.zeros(d)
    b = 0.0
    for _ in range(steps):
        pass  # one gradient step on w and b
    return w, b

np.random.seed(2)
X = np.random.randn(100, 3)
y = X @ np.array([1.5, -2.0, 0.5]) + 3.0 + 0.2 * np.random.randn(100)
w, b = gd_fit(X, y)
print(np.round(w, 4), round(float(b), 4))`,
            solution: `import numpy as np

def gd_fit(X, y, lr=0.1, steps=300):
    n, d = X.shape
    w = np.zeros(d)
    b = 0.0
    for _ in range(steps):
        r = X @ w + b - y              # residuals, shape (n,)
        w = w - lr * (2 / n) * (X.T @ r)
        b = b - lr * (2 / n) * r.sum()
    return w, b

np.random.seed(2)
X = np.random.randn(100, 3)
y = X @ np.array([1.5, -2.0, 0.5]) + 3.0 + 0.2 * np.random.randn(100)
w, b = gd_fit(X, y)
print(np.round(w, 4), round(float(b), 4))`,
            tests: [
              { expr: 'np.round(gd_fit(X, y)[0], 4).tolist()', label: 'weights after 300 steps (equal to the closed form to 4 decimals)' },
              { expr: 'round(float(gd_fit(X, y)[1]), 4)', label: 'bias after 300 steps' },
              { expr: 'np.round(gd_fit(X, y, lr=0.01, steps=50)[0], 4).tolist()', label: 'a small step size has not converged after 50 steps' },
            ],
            hints: [md`The update for \`w\` is \`w = w - lr * (2 / n) * (X.T @ r)\`.`, md`The bias gradient is the mean residual times 2: \`(2 / n) * r.sum()\`.`],
            mustInclude: ['.T'],
          },
        },
        {
          kind: 'text',
          md: md`**Basis features.** A linear model is linear in its **parameters**, not necessarily in the input. Replace the input $x$ by a feature vector, for example the polynomial basis $\phi(x) = (1, x, x^2, \dots, x^d)$, and fit $\hat y = \bw\T\phi(x)$ with exactly the same machinery: the rows of the design matrix are $\phi(\bx_i)\T$. Other common bases are one-hot indicators for categories, interactions $x_jx_k$, splines, and log transforms of skewed features. Choosing a richer basis lowers the training error; whether it lowers the error on new data is a separate question.`,
        },
        {
          kind: 'viz',
          viz: { type: 'ml.lr-poly', degree: 1 },
          task: md`Raise the degree from 1 to 11 and watch three numbers: the training MSE, the held-out MSE and the largest coefficient. At which degree is the held-out error lowest? What happens at degree 11?`,
          caption: md`Twelve training points (filled) from $\sin(\pi x)$ plus noise, and 20 held-out points (hollow) from the same source. Training error can only go down as the degree grows, because each basis contains the previous one. Held-out error falls until about degree 3 to 5 and then rises sharply, while the coefficients grow into the hundreds and thousands.`,
        },
        {
          kind: 'check',
          q: md`With 12 training points at distinct $x$ values, the degree-11 polynomial has training MSE $0$. Why?`,
          options: [
            md`It has 12 coefficients, so it can interpolate any 12 points with distinct $x$`,
            md`Polynomials of high degree approximate $\sin(\pi x)$ exactly`,
            md`The noise happens to be zero at those points`,
            md`Least squares always reaches zero training error`,
          ],
          answer: 0,
          explain: md`The $12\times 12$ design matrix (a Vandermonde matrix) is invertible for distinct $x_i$, so $X\bw = \by$ has an exact solution. The fit passes through the noise, which is why the held-out error explodes.`,
        },
        {
          kind: 'text',
          md: md`**Interpreting coefficients.** In $\hat y = \bw\T\bx + b$, the coefficient $w_j$ is the change in the prediction when $x_j$ increases by one unit **while all other features are held fixed**. Three cautions:

- **Units.** $w_j$ is measured in units of $y$ per unit of $x_j$. Rescale a feature and its coefficient rescales inversely, so compare magnitudes only after standardizing.
- **"Held fixed" may be impossible.** With features $x$ and $x^2$, one cannot change without the other. With correlated features, the data contain few examples where one moves alone.
- **Association, not causation.** A coefficient absorbs the effect of omitted variables correlated with $x_j$. A positive weight on "number of ice-cream sales" in a drowning model reflects summer.`,
        },
        {
          kind: 'callout',
          tone: 'warning',
          title: 'Multicollinearity',
          md: md`When some feature is nearly a linear combination of the others, $X\T X$ is nearly singular. The data then pin down only some combinations of the weights: the loss has a long, almost flat valley. Individual coefficients become unstable, with huge variance and arbitrary signs, while predictions inside the data range stay fine. Symptoms: coefficients that change sign between resamples, a large condition number of $X$, or a large variance inflation factor $\text{VIF}_j = 1/(1 - R_j^2)$, where $R_j^2$ is the $R^2$ of regressing $x_j$ on the other features. Remedies: drop or combine features, or regularize (lesson 3).`,
        },
        {
          kind: 'code',
          code: `import numpy as np

np.random.seed(0)
n = 50
x1 = np.random.randn(n)
x2 = x1 + 0.01 * np.random.randn(n)    # almost an exact copy of x1
y = 3 * x1 + np.random.randn(n)
X = np.column_stack([x1, x2])

for rows in (slice(0, 25), slice(25, 50)):
    w = np.linalg.lstsq(X[rows], y[rows], rcond=None)[0]
    print(np.round(w, 2), "sum:", round(float(w.sum()), 2))`,
          note: md`The two halves of the same dataset give weights near $(99, -96)$ and $(-12, 15)$. Only the sum $w_1 + w_2$, the effect of the shared direction, is estimated well (about 3, the true value). Try replacing \`0.01\` by \`1.0\` so that the features are no longer near-copies.`,
        },
        {
          kind: 'paper',
          problem: {
            id: 'ml01-2-paper',
            title: 'Reading and rescaling a fitted model',
            type: 'apply',
            difficulty: 1,
            minutes: 6,
            statement: md`A fitted model predicts monthly rent (in euros) from area $a$ (m²) and distance to the centre $s$ (km): $$\hat y = 12a - 40s + 300.$$ (a) Predict the rent of a 50 m² flat 3 km from the centre. (b) Interpret the coefficient $-40$. (c) If area is re-expressed in square feet ($1\text{ m}^2 = 10.764\text{ ft}^2$) and the model is refit by OLS on the same data, what is the new coefficient of area? Enter $[\text{(a)}, \text{(c)}]$.`,
            solution: [
              md`(a) $12\cdot 50 - 40\cdot 3 + 300 = 600 - 120 + 300 = 780$ euros.`,
              md`(b) Among flats of the same area, each extra kilometre from the centre is associated with 40 euros less rent. It is an association in this data, not a causal effect.`,
              md`(c) $a_{\text{m}^2} = a_{\text{ft}^2}/10.764$, so $12\,a_{\text{m}^2} = (12/10.764)\,a_{\text{ft}^2}$. OLS predictions do not change under rescaling a feature, so the new coefficient is $12/10.764 \approx 1.115$ euros per square foot.`,
            ],
            answer: { kind: 'vector', value: [780, 12 / 10.764], tol: 1e-3 },
          },
        },
        {
          kind: 'explain',
          prompt: md`Why do you standardize features before training a linear model with gradient descent? Does standardizing change the OLS predictions?`,
          model: md`Gradient descent converges at a rate set by the condition number of the Hessian $\frac2n X\T X$. Features on very different scales, or uncentred features alongside an intercept, give a narrow, tilted valley: the stable step size is limited by the steepest direction ($\eta < 2/\lambda_{\max}$), and progress along the flattest direction is then tiny, so the number of steps grows roughly with $\kappa$. Standardizing centres each feature (decoupling it from the bias) and gives every feature unit variance, which makes the curvature similar in all directions. OLS predictions do not change, because standardization is an invertible affine change of variables and the weights compensate. Penalized models (ridge, lasso) do change, which is another reason to standardize before regularizing.`,
        },
      ],
      cards: [
        { id: 'ml01-2-c1', kind: 'concept', front: md`Gradient of $L(\bw) = \frac1n\lVert X\bw - \by\rVert^2$, and its per-example reading.`, back: md`$\nabla L = \frac2n X\T(X\bw - \by) = \frac2n\sum_i (\hat y_i - y_i)\bx_i$: each example pushes along its input, weighted by its error.` },
        { id: 'ml01-2-c2', kind: 'cloze', text: md`Gradient descent on a quadratic whose Hessian has largest eigenvalue $L$ converges for step sizes below {{}}$/L$.`, answers: ['2'] },
        { id: 'ml01-2-c3', kind: 'compute', front: md`Model $\hat y = wx$ (no bias), data $x = (1, 2)$, $y = (2, 4)$, MSE loss. From $w = 0$, one GD step with $\eta = 0.05$ gives $w = ?$`, answer: { kind: 'number', value: 0.5 }, back: md`$\nabla = \frac22\sum_i (0 - y_i)x_i = -(2 + 8) = -10$, so $w = 0 + 0.05\cdot 10 = 0.5$.` },
        { id: 'ml01-2-c4', kind: 'concept', front: md`What is multicollinearity and what does it do to a linear regression?`, back: md`Features that are nearly linearly dependent. $X\T X$ is nearly singular, so individual coefficients have huge variance and unstable signs, while predictions stay fine. Fix: drop or combine features, or regularize.` },
        { id: 'ml01-2-c5', kind: 'concept', front: md`Is a model with features $(1, x, x^2, x^3)$ still linear regression? Why?`, back: md`Yes. It is linear in the parameters $\bw$; only the features are nonlinear in $x$. The same normal equations and gradient apply with the polynomial design matrix.` },
      ],
    },
    // ------------------------------------------------------------------ 1.3
    {
      id: 'ml01-3',
      title: 'Regularization: ridge, lasso and elastic net',
      minutes: 40,
      objectives: [
        'Derive the ridge solution (X^T X + λI)^{-1} X^T y and explain shrinkage along the singular directions of X.',
        'Explain with the constraint picture why lasso sets weights exactly to zero and ridge does not, and compute the soft-thresholding solution for an orthonormal design.',
        'Choose λ with a validation set, standardizing first and leaving the intercept unpenalized.',
        'Derive ridge and lasso as MAP estimates under Gaussian and Laplace priors.',
      ],
      cells: [
        {
          kind: 'text',
          md: md`The degree-9 polynomial of lesson 2 had coefficients in the hundreds and a large held-out error. The nearly duplicated features gave weights of $+99$ and $-96$. In both cases the training data allow wild weights because many very different weight vectors fit the training points almost equally well. **Regularization** adds a penalty on the size of the weights to the training loss. It trades a little training error for a model that is far more stable on new data.`,
        },
        {
          kind: 'callout',
          tone: 'definition',
          title: 'Ridge, lasso and elastic net',
          md: md`With $\lambda \ge 0$ a hyperparameter:

| method | objective |
|---|---|
| ridge (L2) | $\lVert\by - X\bw\rVert^2 + \lambda\lVert\bw\rVert_2^2$ |
| lasso (L1) | $\lVert\by - X\bw\rVert^2 + \lambda\lVert\bw\rVert_1$ |
| elastic net | $\lVert\by - X\bw\rVert^2 + \lambda_1\lVert\bw\rVert_1 + \lambda_2\lVert\bw\rVert_2^2$ |

The intercept is not penalized: centre $\by$ and the features, or exclude $b$ from the penalty. Libraries scale the terms differently. scikit-learn's \`Ridge\` uses the objective above; its \`Lasso\` minimizes $\frac{1}{2n}\lVert\by - X\bw\rVert^2 + \alpha\lVert\bw\rVert_1$, so $\alpha = \lambda/(2n)$.`,
        },
        {
          kind: 'derive',
          title: 'the ridge solution',
          goal: md`Minimize $J(\bw) = \lVert\by - X\bw\rVert^2 + \lambda\lVert\bw\rVert^2$ and show the minimizer is unique for every $\lambda > 0$.`,
          steps: [
            {
              md: md`Differentiate term by term, using lesson 2 without the $\frac1n$: $$\nabla J(\bw) = 2X\T(X\bw - \by) + 2\lambda\bw.$$`,
              choose: {
                prompt: md`What is the gradient of the penalty $\lambda\lVert\bw\rVert^2 = \lambda\bw\T\bw$?`,
                options: [md`$2\lambda\bw$`, md`$\lambda\bw$`, md`$2\lambda\lVert\bw\rVert$`],
                answer: 0,
                explain: md`$\nabla(\bw\T\bw) = 2\bw$, the rule $\nabla(\bw\T A\bw) = 2A\bw$ with $A = I$.`,
              },
            },
            { md: md`Set it to zero: $X\T X\bw + \lambda\bw = X\T\by$, that is $(X\T X + \lambda I)\bw = X\T\by$.` },
            {
              md: md`For $\bv \ne \bzero$: $\bv\T(X\T X + \lambda I)\bv = \lVert X\bv\rVert^2 + \lambda\lVert\bv\rVert^2 \ge \lambda\lVert\bv\rVert^2 > 0$. The matrix is positive definite, hence invertible, and $$\hat\bw_{\text{ridge}} = (X\T X + \lambda I)^{-1}X\T\by.$$`,
              choose: {
                prompt: md`Why is $X\T X + \lambda I$ invertible even when $X\T X$ is singular (for example $d > n$)?`,
                options: [md`$\bv\T(X\T X + \lambda I)\bv \ge \lambda\lVert\bv\rVert^2 > 0$ for every $\bv \ne \bzero$`, md`Adding the identity always makes a matrix invertible`, md`Because $\lambda$ is a hyperparameter chosen by validation`],
                answer: 0,
                explain: md`Positive definiteness rules out $(X\T X + \lambda I)\bv = \bzero$ for $\bv \ne \bzero$. Adding $I$ to an arbitrary matrix can make it singular (for example $-I + I = 0$); it works here because $X\T X$ is positive semidefinite.`,
              },
            },
            { md: md`$J$ is strictly convex (its Hessian $2(X\T X + \lambda I)$ is positive definite), so this stationary point is the unique global minimum.` },
          ],
          takeaway: md`Ridge always has a unique solution, even with more features than examples or with exactly duplicated features. That is the original motivation for it: making an ill-posed least-squares problem well-posed.`,
        },
        {
          kind: 'numeric',
          q: md`One feature, no intercept: $x = (1, 2)$, $y = (2, 3)$. Compute the ridge estimate with $\lambda = 3$.`,
          answer: { kind: 'number', value: 1 },
          hints: [md`In one dimension, $(X\T X + \lambda)^{-1}X\T\by = \dfrac{\sum_i x_iy_i}{\sum_i x_i^2 + \lambda}$.`],
          explain: md`$\sum x_iy_i = 2 + 6 = 8$ and $\sum x_i^2 = 5$, so $w = 8/(5 + 3) = 1$. Without the penalty, $w = 8/5 = 1.6$: ridge shrinks it toward zero.`,
        },
        {
          kind: 'text',
          md: md`**Shrinkage through the SVD.** Write $X = U\Sigma V\T$ with singular values $\sigma_1 \ge \dots \ge \sigma_d$ and singular vectors $\bu_i, \bv_i$ (the SVD module). Then $X\T X + \lambda I = V(\Sigma^2 + \lambda I)V\T$, and

$$\hat\bw_{\text{ridge}} = \sum_{i=1}^d \frac{\sigma_i}{\sigma_i^2 + \lambda}\,(\bu_i\T\by)\,\bv_i = \sum_{i=1}^d \underbrace{\frac{\sigma_i^2}{\sigma_i^2 + \lambda}}_{\text{shrink factor}}\cdot\frac{\bu_i\T\by}{\sigma_i}\,\bv_i.$$

The OLS solution is the same sum with every shrink factor equal to 1. Directions in which the data vary a lot ($\sigma_i^2 \gg \lambda$) are kept almost unchanged. Directions with little variation ($\sigma_i^2 \ll \lambda$) are shrunk almost to zero. Those weak directions are exactly where the OLS estimate is unstable, since it divides by a small $\sigma_i$. Ridge also improves conditioning: $\kappa(X\T X + \lambda I) = \dfrac{\sigma_1^2 + \lambda}{\sigma_d^2 + \lambda}$.`,
        },
        {
          kind: 'numeric',
          q: md`With $\lambda = 1$, compute the ridge shrink factor $\sigma^2/(\sigma^2 + \lambda)$ for a strong direction with $\sigma = 3$ and a weak one with $\sigma = 0.5$. Enter both, in that order.`,
          answer: { kind: 'vector', value: [0.9, 0.2] },
          explain: md`$9/10 = 0.9$ and $0.25/1.25 = 0.2$. The strong direction keeps 90% of its OLS coefficient; the weak one keeps 20%.`,
        },
        {
          kind: 'viz',
          viz: { type: 'ml.reg-constraint', penalty: 'l2', t: 1.2 },
          task: md`Slide $t$ from 3 down to 0 and follow $\mathbf{w}^\star$ along the dashed path. Does either coordinate become exactly 0 before $t = 0$? Switch to **lasso** and repeat. Then set $\rho = 0.8$ and drag $\hat{\mathbf{w}}$ around: how often does the lasso solution sit on an axis?`,
          caption: md`The grey ellipses are contours of the training loss around the unregularized solution $\hat{\mathbf{w}}$; their shape comes from the feature correlation $\rho$. The constrained solution is where the lowest contour touches the ball $\{R(\mathbf{w}) \le t\}$: the orange contour touches without crossing. The diamond has corners on the axes, so the touching point is often a corner, where one weight is exactly zero.`,
        },
        {
          kind: 'callout',
          tone: 'theorem',
          title: 'Penalized and constrained forms',
          md: md`For a convex loss $L$ and penalty $R$, each minimizer of $L(\bw) + \lambda R(\bw)$ with $\lambda > 0$ also minimizes $L(\bw)$ subject to $R(\bw) \le t$, with $t = R(\hat\bw_\lambda)$. Conversely, when the constraint is active, there is a Lagrange multiplier $\lambda \ge 0$ that turns the constrained problem into the penalized one. A large $\lambda$ corresponds to a small $t$.`,
        },
        {
          kind: 'check',
          q: md`Why does the lasso produce weights that are exactly zero while ridge (almost) never does?`,
          options: [
            md`The L1 ball has corners on the coordinate axes, and the loss contours typically first touch it at a corner; the L2 ball is smooth`,
            md`The L1 penalty is larger than the L2 penalty for every weight vector`,
            md`Lasso is solved by gradient descent, which rounds small weights to zero`,
            md`Ridge rescales the features, so zeros disappear`,
          ],
          answer: 0,
          explain: md`For $|w| < 1$, $|w| > w^2$, but that is not the reason: the reason is the corner. In penalized form, the subgradient of $\lambda|w_j|$ at $0$ is the interval $[-\lambda, \lambda]$, which can absorb a loss gradient of size up to $\lambda$ and keep $w_j = 0$. The ridge penalty has gradient $2\lambda w_j = 0$ at zero, so any nonzero loss gradient moves $w_j$ off zero.`,
        },
        {
          kind: 'text',
          md: md`**Solving the lasso.** The absolute value is not differentiable at $0$, and there is no closed form in general. Standard solvers are coordinate descent (update one weight at a time, each update in closed form), proximal gradient descent (ISTA), and least-angle regression. The one-coordinate update is **soft thresholding**:

$$S_\tau(z) = \sign(z)\max(|z| - \tau, 0).$$

It moves $z$ toward zero by $\tau$ and sets it to exactly zero if $|z| \le \tau$. When the columns of $X$ are orthonormal ($X\T X = I$), the whole lasso solution is $w_j = S_{\lambda/2}(z_j)$ with $\bz = X\T\by$, while ridge gives $w_j = z_j/(1 + \lambda)$: ridge scales every weight, lasso subtracts a constant and clips.`,
        },
        {
          kind: 'paper',
          problem: {
            id: 'ml01-3-paper',
            title: 'Soft thresholding for an orthonormal design',
            type: 'derive',
            difficulty: 3,
            minutes: 15,
            statement: md`Assume $X\T X = I$ and let $\bz = X\T\by$ (the OLS solution). (a) Show that the lasso objective $\lVert\by - X\bw\rVert^2 + \lambda\lVert\bw\rVert_1$ separates into $d$ one-dimensional problems $w_j^2 - 2z_jw_j + \lambda|w_j|$, up to a constant. (b) Show that each is minimized by $w_j = \sign(z_j)\max(|z_j| - \lambda/2,\ 0)$. (c) For $\bz = (3, -0.5, 1.2)$ and $\lambda = 2$, compute the lasso solution, and compare with ridge at the same $\lambda$. Enter the lasso solution.`,
            hints: [md`Expand $\lVert\by - X\bw\rVert^2 = \by\T\by - 2\bw\T X\T\by + \bw\T X\T X\bw$.`, md`For (b), consider $w_j > 0$, $w_j < 0$ and $w_j = 0$ separately. On $w_j > 0$ the function is a smooth parabola.`],
            solution: [
              md`(a) $\lVert\by - X\bw\rVert^2 = \by\T\by - 2\bw\T\bz + \bw\T\bw = \by\T\by + \sum_j (w_j^2 - 2z_jw_j)$. Adding $\lambda\sum_j|w_j|$, the objective is a constant plus $\sum_j f_j(w_j)$ with $f_j(w) = w^2 - 2z_jw + \lambda|w|$, and each $f_j$ can be minimized separately.`,
              md`(b) On $w > 0$: $f'(w) = 2w - 2z + \lambda = 0$ gives $w = z - \lambda/2$, valid only if it is positive, that is $z > \lambda/2$.`,
              md`On $w < 0$: $f'(w) = 2w - 2z - \lambda = 0$ gives $w = z + \lambda/2$, valid only if $z < -\lambda/2$.`,
              md`If $|z| \le \lambda/2$, $f$ is decreasing on $w < 0$ and increasing on $w > 0$, so the minimum is at $w = 0$. The three cases together are $w = \sign(z)\max(|z| - \lambda/2, 0)$.`,
              md`(c) $\lambda/2 = 1$: $w_1 = 3 - 1 = 2$, $w_2 = 0$ (since $0.5 \le 1$), $w_3 = 1.2 - 1 = 0.2$. Lasso: $(2, 0, 0.2)$.`,
              md`Ridge with $X\T X = I$: $\bw = \bz/(1 + \lambda) = (1, -0.167, 0.4)$. Every weight is shrunk by the same factor and none is zero.`,
            ],
            answer: { kind: 'vector', value: [2, 0, 0.2] },
            rubric: [md`Correct separation using $X\T X = I$`, md`Case analysis on the sign of $w$, including the kink at $0$`, md`Soft-thresholding formula stated with threshold $\lambda/2$`, md`Numbers for lasso and ridge, with the contrast between them`],
            areas: ['ml-depth', 'math'],
          },
        },
        {
          kind: 'viz',
          viz: { type: 'ml.reg-path', kind: 'ridge' },
          task: md`In **ridge** mode, increase $\lambda$ and follow $w_1$ and $w_2$, the correlated pair. Switch to **lasso**: at roughly which $\lambda$ does $w_2$ hit zero, and how many weights are left at $\lambda = 30$? Press **Go to best λ** in each mode and compare the validation MSE with the value at $\lambda = 0.01$.`,
          caption: md`Six standardized features and 20 training rows; $x_1$ and $x_2$ have correlation about $0.9$ and the true weights are $(2, 0, 1, 0, -1.5, 0)$. At the left edge ($\lambda = 0.01$) both methods are close to the OLS fit, which splits one effect between the correlated pair as $w_1 \approx 5.7$, $w_2 \approx -3.5$. Ridge pulls the pair toward each other; lasso drops $w_2$. The validation MSE falls from about 9.5 at $\lambda = 0.01$ to about 4.3 at the best $\lambda$ for either method.`,
        },
        {
          kind: 'code',
          code: `import numpy as np

# the dataset of the coefficient-path figure: 20 training rows, 6 features, x2 = 0.9 x1 + noise
np.random.seed(4)
Z = np.random.randn(60, 6)
Z[:, 1] = 0.9 * Z[:, 0] + np.sqrt(1 - 0.81) * Z[:, 1]
y = Z @ np.array([2.0, 0.0, 1.0, 0.0, -1.5, 0.0]) + 2.0 * np.random.randn(60)
X, y = np.round(Z, 2)[:20], np.round(y, 2)[:20]

X = (X - X.mean(axis=0)) / X.std(axis=0)     # standardize: the penalty treats all weights alike
y = y - y.mean()                               # centre y: the intercept is not penalized

def ridge(X, y, lam):
    return np.linalg.solve(X.T @ X + lam * np.eye(X.shape[1]), X.T @ y)

def lasso(X, y, lam, sweeps=500):
    # coordinate descent for ||y - Xw||^2 + lam * ||w||_1
    w = np.zeros(X.shape[1])
    for _ in range(sweeps):
        for j in range(X.shape[1]):
            rho = X[:, j] @ (y - X @ w + X[:, j] * w[j])
            w[j] = np.sign(rho) * max(abs(rho) - lam / 2, 0.0) / (X[:, j] @ X[:, j])
    return w

print("OLS:  ", np.round(ridge(X, y, 0.0), 2))
print("ridge:", np.round(ridge(X, y, 10.0), 2))
print("lasso:", np.round(lasso(X, y, 10.0), 2))`,
          note: md`Each lasso update is the soft-thresholding rule applied to one coordinate, with all other weights held fixed: $\rho_j = \bx_j\T(\by - X\bw + \bx_j w_j)$ is the correlation of feature $j$ with the residual that excludes its own contribution. Try $\lambda = 30$ and $\lambda = 100$.`,
        },
        {
          kind: 'text',
          md: md`**Elastic net.** Given a group of correlated features, the lasso tends to keep one and drop the rest, and which one it keeps can change with a small change in the data. Elastic net adds a ridge term. The L1 part still produces zeros, while the L2 part spreads weight across correlated features (the grouping effect) and makes the objective strictly convex, so the solution is unique. It is a common default when there are many correlated features, such as text n-grams or genomic measurements.

**Choosing λ.**

1. Split off validation data (or use $k$-fold cross-validation). Fit the standardization on the training part only.
2. Fit the model for a grid of $\lambda$ values on a log scale, for example $10^{-3}$ to $10^{3}$; warm-starting from the neighbouring $\lambda$ makes lasso paths cheap.
3. Pick the $\lambda$ with the lowest validation error. A common, more conservative variant picks the largest $\lambda$ whose error is within one standard error of the minimum.
4. Refit on all non-test data with that $\lambda$, and report the error on a test set that played no part in the choice.`,
        },
        {
          kind: 'callout',
          tone: 'intuition',
          title: 'Regularization as a prior',
          md: md`A penalty encodes a belief held before seeing the data: that the weights are small. Maximum a posteriori (MAP) estimation makes this exact. A Gaussian prior on the weights gives ridge, and a Laplace prior, which puts more mass at zero and in the tails, gives the lasso.`,
        },
        {
          kind: 'derive',
          title: 'ridge and lasso as MAP estimates',
          goal: md`With Gaussian noise $y_i \sim \mathcal N(\bw\T\bx_i, \sigma^2)$ and the prior $w_j \sim \mathcal N(0, \tau^2)$ independently, show that the MAP estimate is ridge with $\lambda = \sigma^2/\tau^2$.`,
          steps: [
            { md: md`Bayes' rule: $p(\bw \mid \by) \propto p(\by \mid \bw)\,p(\bw)$. The MAP estimate maximizes the posterior, equivalently minimizes $-\log p(\by\mid\bw) - \log p(\bw)$.` },
            {
              md: md`Up to constants that do not depend on $\bw$: $$-\log p(\by\mid\bw) = \frac{1}{2\sigma^2}\lVert\by - X\bw\rVert^2, \qquad -\log p(\bw) = \frac{1}{2\tau^2}\lVert\bw\rVert^2.$$`,
              choose: {
                prompt: md`What is $-\log$ of the prior density $\prod_j \frac{1}{\sqrt{2\pi\tau^2}}e^{-w_j^2/(2\tau^2)}$, up to a constant?`,
                options: [md`$\frac{1}{2\tau^2}\lVert\bw\rVert^2$`, md`$\frac{1}{\tau}\lVert\bw\rVert_1$`, md`$\tau^2\lVert\bw\rVert^2$`],
                answer: 0,
                explain: md`The log of each factor is $-\frac{w_j^2}{2\tau^2}$ plus a constant; summing over $j$ gives the squared norm. The L1 norm comes from a Laplace prior.`,
              },
            },
            { md: md`Multiply the sum by $2\sigma^2 > 0$, which does not move the minimizer: minimize $\lVert\by - X\bw\rVert^2 + \frac{\sigma^2}{\tau^2}\lVert\bw\rVert^2$. That is ridge with $\lambda = \sigma^2/\tau^2$.` },
            { md: md`With a Laplace prior $p(w_j) = \frac{1}{2\beta}e^{-|w_j|/\beta}$ instead, $-\log p(\bw) = \frac1\beta\lVert\bw\rVert_1 + \text{const}$, and the same steps give the lasso with $\lambda = 2\sigma^2/\beta$.` },
          ],
          takeaway: md`A strong prior (small $\tau$) or noisy data (large $\sigma$) means a large $\lambda$. The MAP estimate is the mode of the posterior; it does not provide the uncertainty that the full posterior does.`,
        },
        {
          kind: 'numeric',
          q: md`Noise standard deviation $\sigma = 2$ and a Gaussian prior on each weight with standard deviation $\tau = 0.5$. Which ridge $\lambda$ gives the MAP estimate (objective $\lVert\by - X\bw\rVert^2 + \lambda\lVert\bw\rVert^2$)?`,
          answer: { kind: 'number', value: 16 },
          explain: md`$\lambda = \sigma^2/\tau^2 = 4/0.25 = 16$.`,
        },
        {
          kind: 'exercise',
          ex: {
            id: 'ml01-3-ex1',
            title: 'Ridge regression',
            prompt: md`Write \`ridge(X, y, lam)\` that returns $(X\T X + \lambda I)^{-1}X\T\by$ by **solving** the linear system (no explicit inverse). Assume \`X\` and \`y\` are already centred, so there is no intercept. Then check that \`lam=0\` reproduces least squares and that a huge \`lam\` shrinks the weights toward zero.`,
            starter: `import numpy as np

def ridge(X, y, lam):
    pass

X = np.array([[1.0, 0.0], [0.0, 1.0], [1.0, 1.0]])
y = np.array([1.0, 2.0, 2.0])
for lam in (0.0, 1.0, 100.0):
    print(lam, ridge(X, y, lam))`,
            solution: `import numpy as np

def ridge(X, y, lam):
    d = X.shape[1]
    return np.linalg.solve(X.T @ X + lam * np.eye(d), X.T @ y)

X = np.array([[1.0, 0.0], [0.0, 1.0], [1.0, 1.0]])
y = np.array([1.0, 2.0, 2.0])
for lam in (0.0, 1.0, 100.0):
    print(lam, ridge(X, y, lam))`,
            tests: [
              { expr: 'np.round(ridge(X, y, 0.0), 6).tolist()', label: 'λ = 0 is least squares' },
              { expr: 'np.round(ridge(X, y, 1.0), 6).tolist()', label: 'λ = 1' },
              { expr: 'np.round(ridge(X, y, 100.0), 6).tolist()', label: 'λ = 100 shrinks toward 0' },
              { expr: 'np.round(ridge(np.ones((2, 3)), np.array([1.0, 2.0]), 0.5), 6).tolist()', label: 'works with more features than rows (X^T X singular)' },
            ],
            hints: [md`\`np.eye(d)\` is the $d\times d$ identity, with \`d = X.shape[1]\`.`, md`\`np.linalg.solve(X.T @ X + lam * np.eye(d), X.T @ y)\`.`],
            mustExclude: ['inv('],
          },
        },
        {
          kind: 'viz',
          viz: { type: 'ml.lr-poly', degree: 11, ridge: true, lambda: 1e-6 },
          task: md`The degree is 11: twelve coefficients for twelve points. Raise $\lambda$ from $10^{-6}$ and watch the curve, the largest coefficient and the held-out MSE. Find the $\lambda$ with the lowest held-out error. Then lower the degree to 3: does ridge still help?`,
          caption: md`The plot below now shows the errors as a function of $\lambda$ for the chosen degree. Training error rises steadily with $\lambda$; held-out error first falls, then rises once the penalty starts to flatten the true signal. The intercept is not penalized.`,
        },
        {
          kind: 'explain',
          prompt: md`An interviewer asks: *ridge or lasso, and why?* Answer in a few sentences, covering the solutions, the geometry, correlated features and how you would choose.`,
          model: md`Both add a penalty on the weights to the squared error. Ridge uses $\lambda\lVert\bw\rVert_2^2$; it has the closed form $(X\T X + \lambda I)^{-1}X\T\by$, shrinks all weights smoothly (most strongly along low-variance directions), keeps every feature, and handles correlated features by spreading weight across them. Lasso uses $\lambda\lVert\bw\rVert_1$; its constraint region has corners on the axes, so it sets some weights exactly to zero and performs feature selection, but with correlated features it picks one somewhat arbitrarily. I would use lasso when I expect few relevant features or need a sparse, interpretable model, ridge when many features each contribute a little or when features are highly correlated, and elastic net to get sparsity with grouping. In all cases I would standardize features, leave the intercept unpenalized and choose $\lambda$ on a log grid by cross-validation.`,
        },
      ],
      cards: [
        { id: 'ml01-3-c1', kind: 'concept', front: md`The ridge solution, and why it exists for every $\lambda > 0$.`, back: md`$\hat\bw = (X\T X + \lambda I)^{-1}X\T\by$. $X\T X + \lambda I$ is positive definite: $\bv\T(X\T X + \lambda I)\bv = \lVert X\bv\rVert^2 + \lambda\lVert\bv\rVert^2 > 0$ for $\bv \ne \bzero$.` },
        { id: 'ml01-3-c2', kind: 'cloze', text: md`Of the L1 and L2 penalties, the {{}} penalty produces weights that are exactly zero.`, answers: ['L1'] },
        { id: 'ml01-3-c3', kind: 'compute', front: md`One feature, no intercept, $\sum x_iy_i = 10$, $\sum x_i^2 = 4$, $\lambda = 1$. Ridge $w = ?$`, answer: { kind: 'number', value: 2 }, back: md`$w = 10/(4 + 1) = 2$, versus $10/4 = 2.5$ without the penalty.` },
        { id: 'ml01-3-c4', kind: 'concept', front: md`Ridge and lasso as MAP estimates: which priors?`, back: md`Gaussian noise plus a Gaussian prior $\mathcal N(0, \tau^2)$ on each weight gives ridge with $\lambda = \sigma^2/\tau^2$. A Laplace prior gives the lasso.` },
        { id: 'ml01-3-c5', kind: 'concept', front: md`How do you choose $\lambda$, and what preprocessing is needed first?`, back: md`Standardize features (fit on training data only), leave the intercept unpenalized, fit on a log-spaced grid of $\lambda$, pick the lowest validation or cross-validation error, refit, and evaluate once on a held-out test set.` },
      ],
    },
  ],
  problems: [
    {
      id: 'ml01-p1',
      title: 'A least-squares line by hand',
      type: 'compute',
      difficulty: 1,
      minutes: 8,
      statement: md`Fit $\hat y = wx + b$ by least squares to $(0, 1), (1, 3), (2, 2), (3, 6)$ using the normal equations, and compute the MSE of the fitted line. Enter $[b, w, \text{MSE}]$.`,
      hints: [md`$X\T X = \begin{bmatrix} 4 & 6 \\ 6 & 14 \end{bmatrix}$ and $X\T\by = \begin{bmatrix} 12 \\ 25 \end{bmatrix}$ for columns $(1, x)$.`],
      solution: [
        md`With columns $(1, x)$: $X\T X = \begin{bmatrix} 4 & 6 \\ 6 & 14 \end{bmatrix}$, $X\T\by = \begin{bmatrix} 1 + 3 + 2 + 6 \\ 0 + 3 + 4 + 18 \end{bmatrix} = \begin{bmatrix} 12 \\ 25 \end{bmatrix}$.`,
        md`Solve $4b + 6w = 12$ and $6b + 14w = 25$. Multiply the first by $1.5$: $6b + 9w = 18$. Subtract: $5w = 7$, so $w = 1.4$ and $b = (12 - 8.4)/4 = 0.9$.`,
        md`Predictions $0.9, 2.3, 3.7, 5.1$; residuals $0.1, 0.7, -1.7, 0.9$; squares $0.01, 0.49, 2.89, 0.81$, sum $4.2$. MSE $= 4.2/4 = 1.05$.`,
        md`Check: the residuals sum to $0$, as they must with an intercept.`,
      ],
      answer: { kind: 'vector', value: [0.9, 1.4, 1.05] },
    },
    {
      id: 'ml01-p2',
      title: 'Gradient and Hessian of the MSE',
      type: 'derive',
      difficulty: 2,
      minutes: 10,
      statement: md`For $L(\bw) = \frac1n\lVert X\bw - \by\rVert^2$, derive $\nabla L(\bw)$ and the Hessian $\nabla^2 L(\bw)$. Show that $L$ is convex, and that it is strictly convex exactly when $X$ has linearly independent columns.`,
      hints: [md`Expand the square into $\bw\T X\T X\bw - 2\by\T X\bw + \by\T\by$.`, md`A twice-differentiable function is convex when its Hessian is positive semidefinite everywhere.`],
      solution: [
        md`$L(\bw) = \frac1n(\bw\T X\T X\bw - 2\by\T X\bw + \by\T\by)$.`,
        md`Using $\nabla(\bw\T A\bw) = 2A\bw$ for symmetric $A$ and $\nabla(\mathbf{c}\T\bw) = \mathbf{c}$: $\nabla L = \frac2n(X\T X\bw - X\T\by) = \frac2n X\T(X\bw - \by)$.`,
        md`Differentiating again: $\nabla^2 L = \frac2n X\T X$, the same for every $\bw$.`,
        md`For any $\bv$: $\bv\T\left(\frac2n X\T X\right)\bv = \frac2n\lVert X\bv\rVert^2 \ge 0$, so the Hessian is positive semidefinite and $L$ is convex.`,
        md`The form is strictly positive for every $\bv \ne \bzero$ exactly when $X\bv \ne \bzero$ for all $\bv \ne \bzero$, that is when the columns of $X$ are linearly independent. Then $L$ is strictly convex and the minimizer is unique.`,
      ],
      rubric: [md`Correct expansion and gradient $\frac2n X\T(X\bw - \by)$`, md`Hessian $\frac2n X\T X$`, md`Convexity via $\bv\T X\T X\bv = \lVert X\bv\rVert^2 \ge 0$`, md`Strict convexity tied to independent columns`],
      areas: ['ml-depth', 'math'],
    },
    {
      id: 'ml01-p3',
      title: 'The ridge closed form',
      type: 'proof',
      difficulty: 2,
      minutes: 10,
      statement: md`Show that $J(\bw) = \lVert\by - X\bw\rVert^2 + \lambda\lVert\bw\rVert^2$ with $\lambda > 0$ has the unique minimizer $\hat\bw = (X\T X + \lambda I)^{-1}X\T\by$, for any $X$ (including $d > n$). Then show that $\lVert\hat\bw\rVert \to 0$ as $\lambda \to \infty$.`,
      hints: [md`Set the gradient to zero, then argue that the matrix is positive definite.`, md`For the limit, use $\hat\bw = \frac1\lambda\left(\frac1\lambda X\T X + I\right)^{-1}X\T\by$.`],
      solution: [
        md`$\nabla J = 2X\T(X\bw - \by) + 2\lambda\bw$. Setting it to zero gives $(X\T X + \lambda I)\bw = X\T\by$.`,
        md`For $\bv \ne \bzero$: $\bv\T(X\T X + \lambda I)\bv = \lVert X\bv\rVert^2 + \lambda\lVert\bv\rVert^2 > 0$. So $X\T X + \lambda I$ is positive definite and invertible, whatever the rank of $X$.`,
        md`The Hessian $2(X\T X + \lambda I)$ is positive definite, so $J$ is strictly convex and the stationary point $\hat\bw = (X\T X + \lambda I)^{-1}X\T\by$ is its unique global minimum.`,
        md`Write $\hat\bw = \frac1\lambda\left(I + \frac1\lambda X\T X\right)^{-1}X\T\by$. As $\lambda \to \infty$ the bracket tends to $I$, so $\hat\bw \approx \frac1\lambda X\T\by \to \bzero$.`,
      ],
      rubric: [md`Gradient set to zero correctly`, md`Positive definiteness argued for every $X$, including rank-deficient`, md`Uniqueness from strict convexity`, md`Limit $\lambda \to \infty$ argued`],
      areas: ['ml-depth', 'math'],
    },
    {
      id: 'ml01-p4',
      title: 'One gradient-descent step',
      type: 'compute',
      difficulty: 1,
      minutes: 8,
      statement: md`Data $(0, 1), (1, 3), (2, 2), (3, 6)$, model $\hat y = wx + b$, loss MSE. Starting from $w = b = 0$, take one gradient-descent step with $\eta = 0.1$. Enter $[w_1, b_1]$, then check that the MSE went down.`,
      solution: [
        md`At $w = b = 0$ the errors $\hat y_i - y_i$ are $-1, -3, -2, -6$.`,
        md`$\partial L/\partial w = \frac24\sum_i(\hat y_i - y_i)x_i = \frac12(0 - 3 - 4 - 18) = -12.5$ and $\partial L/\partial b = \frac12(-12) = -6$.`,
        md`$w_1 = 0 - 0.1(-12.5) = 1.25$ and $b_1 = 0 - 0.1(-6) = 0.6$.`,
        md`MSE before: $(1 + 9 + 4 + 36)/4 = 12.5$. After: predictions $0.6, 1.85, 3.1, 4.35$, squared errors $0.16, 1.3225, 1.21, 2.7225$, MSE $\approx 1.354$.`,
      ],
      answer: { kind: 'vector', value: [1.25, 0.6] },
    },
    {
      id: 'ml01-p5',
      title: 'Step size with correlated features',
      type: 'apply',
      difficulty: 2,
      minutes: 10,
      statement: md`Two standardized, centred features with correlation $0.8$ and no intercept, so $\frac1n X\T X = \begin{bmatrix} 1 & 0.8 \\ 0.8 & 1 \end{bmatrix}$. Gradient descent runs on the MSE. (a) Find the eigenvalues of the Hessian $H$ and the condition number. (b) What is the largest stable step size? (c) At $\eta = 0.5$, by what factor does the error shrink per step in each eigendirection? Enter $[\eta_{\max}, \text{slowest factor at } \eta = 0.5]$.`,
      hints: [md`The eigenvalues of $\begin{bmatrix} 1 & \rho \\ \rho & 1 \end{bmatrix}$ are $1 \pm \rho$, with eigenvectors $(1, 1)$ and $(1, -1)$.`],
      solution: [
        md`$H = \frac2n X\T X = 2\begin{bmatrix} 1 & 0.8 \\ 0.8 & 1 \end{bmatrix}$ has eigenvalues $2(1 + 0.8) = 3.6$ (direction $(1, 1)$) and $2(1 - 0.8) = 0.4$ (direction $(1, -1)$). $\kappa = 3.6/0.4 = 9$.`,
        md`Stability requires $\eta < 2/\lambda_{\max} = 2/3.6 = 5/9 \approx 0.556$.`,
        md`At $\eta = 0.5$: $|1 - 0.5\cdot 3.6| = 0.8$ and $|1 - 0.5\cdot 0.4| = 0.8$. Both directions shrink by $0.8$ per step.`,
        md`This $\eta$ is the optimal fixed step $2/(\lambda_{\max} + \lambda_{\min}) = 2/4 = 0.5$, and the factor equals $(\kappa - 1)/(\kappa + 1) = 8/10$. The more correlated the features, the larger $\kappa$ and the slower the convergence.`,
      ],
      answer: { kind: 'vector', value: [5 / 9, 0.8] },
    },
    {
      id: 'ml01-p6',
      title: 'Rescaling a feature',
      type: 'concept',
      difficulty: 1,
      minutes: 6,
      statement: md`An OLS model has coefficient $1200$ for area measured in m². The same data are refit with area measured in cm² ($1\text{ m}^2 = 10^4\text{ cm}^2$). (a) What is the new coefficient? (b) Do the predictions change? (c) Would the answer to (b) be the same for ridge regression with a fixed $\lambda$? Enter the coefficient from (a).`,
      solution: [
        md`(a) $a_{\text{m}^2} = a_{\text{cm}^2}/10^4$, so $1200\,a_{\text{m}^2} = 0.12\,a_{\text{cm}^2}$. The new coefficient is $0.12$.`,
        md`(b) No. OLS minimizes over all weights, and rescaling a column of $X$ only rescales the corresponding weight, so the same fitted values are reachable with the same loss.`,
        md`(c) No. Ridge penalizes $w^2$. The cm² model needs a coefficient $10^4$ times smaller, which the penalty barely charges, while other coefficients are unaffected; the balance between features changes and so do the predictions. This is why features are standardized before regularization.`,
      ],
      answer: { kind: 'number', value: 0.12 },
    },
    {
      id: 'ml01-p7',
      title: 'Estimating the noise level',
      type: 'derive',
      difficulty: 2,
      minutes: 8,
      statement: md`Under the model $y_i = \bw\T\bx_i + \varepsilon_i$ with $\varepsilon_i \sim \mathcal N(0, \sigma^2)$, derive the maximum-likelihood estimate of $\sigma^2$ for fixed $\bw$. A fitted model on $n = 5$ examples has residuals $2, -1, 0, -2, 1$. Compute $\hat\sigma^2$.`,
      solution: [
        md`The log-likelihood is $\ell(\sigma^2) = -\frac n2\log(2\pi\sigma^2) - \frac{S}{2\sigma^2}$ with $S = \sum_i r_i^2$.`,
        md`Differentiate in $v = \sigma^2$: $\ell'(v) = -\frac{n}{2v} + \frac{S}{2v^2}$. Setting it to zero gives $v = S/n$.`,
        md`$\ell'(v) > 0$ for $v < S/n$ and $< 0$ for $v > S/n$, so this is the maximum: $\hat\sigma^2 = S/n = \text{MSE}$.`,
        md`Residuals $2, -1, 0, -2, 1$: $S = 4 + 1 + 0 + 4 + 1 = 10$, so $\hat\sigma^2 = 10/5 = 2$.`,
      ],
      answer: { kind: 'number', value: 2 },
      rubric: [md`Log-likelihood written as a function of $\sigma^2$`, md`Derivative set to zero, giving $S/n$`, md`Checks it is a maximum`, md`Correct number $2$`],
    },
    {
      id: 'ml01-p8',
      title: 'Lasso and ridge with an orthonormal design',
      type: 'compute',
      difficulty: 2,
      minutes: 8,
      statement: md`$X$ has orthonormal columns and $\bz = X\T\by = (4, -1.5, 0.6, -3)$. For the objectives $\lVert\by - X\bw\rVert^2 + \lambda\lVert\bw\rVert_1$ and $\lVert\by - X\bw\rVert^2 + \lambda\lVert\bw\rVert^2$ with $\lambda = 2$, compute the lasso and ridge solutions. Enter the lasso solution.`,
      hints: [md`Lasso: $w_j = \sign(z_j)\max(|z_j| - \lambda/2, 0)$. Ridge: $w_j = z_j/(1 + \lambda)$.`],
      solution: [
        md`Lasso with threshold $\lambda/2 = 1$: $4 \to 3$, $-1.5 \to -0.5$, $0.6 \to 0$ (since $0.6 \le 1$), $-3 \to -2$. Lasso: $(3, -0.5, 0, -2)$.`,
        md`Ridge divides by $1 + \lambda = 3$: $(1.333, -0.5, 0.2, -1)$.`,
        md`Lasso keeps the large weights closer to their OLS values (it subtracts a constant) and zeroes the small one; ridge shrinks every weight by the same factor and zeroes none.`,
      ],
      answer: { kind: 'vector', value: [3, -0.5, 0, -2] },
    },
    {
      id: 'ml01-p9',
      title: 'Residuals are orthogonal to the features',
      type: 'proof',
      difficulty: 2,
      minutes: 8,
      statement: md`Let $\hat\bw$ be the least-squares solution for a design matrix $X$ that contains a column of ones, with residual $\br = \by - X\hat\bw$ and fitted values $\hat\by = X\hat\bw$. Prove: (a) $\sum_i r_i = 0$; (b) $\br$ is orthogonal to every feature column and to $\hat\by$; (c) $\lVert\by\rVert^2 = \lVert\hat\by\rVert^2 + \lVert\br\rVert^2$.`,
      solution: [
        md`The normal equations say $X\T(\by - X\hat\bw) = X\T\br = \bzero$: every column of $X$ is orthogonal to $\br$, which proves the first half of (b).`,
        md`(a) The column of ones is one of them: $\mathbf{1}\T\br = \sum_i r_i = 0$.`,
        md`(b) $\hat\by\T\br = \hat\bw\T X\T\br = \hat\bw\T\bzero = 0$.`,
        md`(c) $\by = \hat\by + \br$ with $\hat\by \perp \br$, so $\lVert\by\rVert^2 = \lVert\hat\by\rVert^2 + 2\hat\by\T\br + \lVert\br\rVert^2 = \lVert\hat\by\rVert^2 + \lVert\br\rVert^2$ (Pythagoras).`,
      ],
      rubric: [md`Starts from the normal equations as $X\T\br = \bzero$`, md`Uses the ones column for (a)`, md`Shows $\hat\by\T\br = 0$ via $\hat\by = X\hat\bw$`, md`Pythagoras with the cross term shown to vanish`],
      areas: ['math', 'ml-depth'],
    },
    {
      id: 'ml01-p10',
      title: 'Find the bug in a gradient',
      type: 'code-on-paper',
      difficulty: 2,
      minutes: 8,
      statement: md`\`X\` has shape \`(1000, 20)\`, \`y\` has shape \`(1000,)\` and \`w\` has shape \`(20,)\`. A colleague writes

\`\`\`python
grad = 2 / n * X @ (X.T @ w - y)
\`\`\`

(a) Which operation fails, and why? (b) Write the correct vectorized gradient of the MSE and give the shape of every intermediate result. (c) Write one gradient-descent step and say how you would check the gradient numerically.`,
      solution: [
        md`(a) \`X.T @ w\` multiplies a $(20, 1000)$ matrix by a vector of length 20: the inner dimensions $1000$ and $20$ do not match, so NumPy raises a shape error. The transposes are in the wrong places.`,
        md`(b) \`r = X @ w - y\` has shape \`(1000,)\`; \`X.T @ r\` has shape \`(20,)\`; \`grad = (2 / n) * (X.T @ r)\` has shape \`(20,)\`, matching \`w\`.`,
        md`(c) \`w = w - lr * grad\`. To check the gradient, compare each component with a central difference $\frac{L(\bw + h\mathbf{e}_j) - L(\bw - h\mathbf{e}_j)}{2h}$ for $h \approx 10^{-5}$; the relative difference should be around $10^{-7}$ or smaller.`,
      ],
      rubric: [md`Identifies the dimension mismatch in \`X.T @ w\``, md`Correct formula $\frac2n X\T(X\bw - \by)$ with shapes`, md`Update step and a finite-difference check`],
      areas: ['ml-coding'],
    },
  ],
};
