import { md, type Module } from '../types';

export const MODULE: Module = {
  id: 'ml03',
  part: 'ml',
  order: 3,
  title: 'Generalization and model evaluation',
  summary: 'The bias–variance decomposition, honest validation (cross-validation, grouped and time-series splits, leakage, hyperparameter search), and the step from offline metrics to A/B tests and monitoring under distribution shift.',
  relevance: md`Every model you ship is judged on data it has not seen, so the questions in this module come up in every ML interview loop: explain the bias–variance tradeoff, diagnose a learning curve, design a validation scheme for time-ordered or grouped data, find the leak in a pipeline that looks too good. ML system design rounds almost always ask how you would evaluate offline, run the A/B test (randomization unit, sample size, guardrails) and monitor the model for drift after launch.`,
  prereqs: ['la01'],
  areas: ['ml-breadth', 'ml-depth', 'system-design'],
  lessons: [
    // ------------------------------------------------------------------ 3.1
    {
      id: 'ml03-1',
      title: 'Bias, variance and the shape of the error curve',
      minutes: 35,
      objectives: [
        'Derive the decomposition of expected squared error into noise, squared bias and variance.',
        'Compute bias² and variance at a point from the predictions of models trained on different samples.',
        'Diagnose underfitting and overfitting from training and validation error, and pick a remedy for each.',
        'Read a learning curve and say whether more data or a more flexible model will help.',
        'State what double descent is, where it appears, and how it fits with the decomposition.',
      ],
      cells: [
        {
          kind: 'text',
          md: md`A model is fitted to one sample of data. Draw a different sample from the same source and the fitted model changes, sometimes a lot. What matters after deployment is the error on new data, averaged over everything that is random: which training sample you happened to get, and the noise in the new label.

The standard setup: labels are generated as
$$y = f(\bx) + \varepsilon, \qquad \E[\varepsilon] = 0,\quad \Var(\varepsilon) = \sigma^2,$$
with the noise independent of everything else. A training set $\mathcal{D}$ of $n$ pairs is drawn at random and the learning algorithm returns a function $\hat f_{\mathcal{D}}$. Fix a test input $\bx$ with a fresh label $y = f(\bx) + \varepsilon$. The quantity to understand is the **expected squared error** $\E_{\mathcal{D},\varepsilon}\big[(y - \hat f_{\mathcal{D}}(\bx))^2\big]$.`,
        },
        {
          kind: 'callout',
          tone: 'definition',
          title: 'Bias and variance of a learning procedure',
          md: md`Let $\bar f(\bx) = \E_{\mathcal{D}}[\hat f_{\mathcal{D}}(\bx)]$ be the average prediction over training sets. Then
$$\text{Bias}(\bx) = \bar f(\bx) - f(\bx), \qquad \Var(\bx) = \E_{\mathcal{D}}\big[(\hat f_{\mathcal{D}}(\bx) - \bar f(\bx))^2\big].$$
Bias measures how far the **average** model is from the truth. Variance measures how much **individual** models scatter around their average. Both belong to the procedure (model class, regularization, sample size), not to one fitted model.`,
        },
        {
          kind: 'callout',
          tone: 'intuition',
          md: md`Bias is a systematic miss that more data of the same kind cannot fix. Variance is sensitivity to the particular sample, which more data, regularization or averaging reduces.`,
        },
        {
          kind: 'viz',
          viz: { type: 'ml.biasvar-poly', degree: 1 },
          task: md`Set the degree to 1, then 3, then 12. For each, compare the spread of the grey curves with the gap between the average fit (toggle it on) and the dashed truth. At which degree is the test MSE lowest, and which term dominates on either side of it?`,
          caption: md`Every grey curve is the same procedure (least-squares polynomial of the chosen degree) applied to a new noisy sample of the sine. Their spread is the variance; the distance from their average to the truth is the bias. The lower plot adds them up with the noise floor $\sigma^2 = 0.09$ and shows the familiar U.`,
        },
        {
          kind: 'callout',
          tone: 'theorem',
          title: 'Bias–variance decomposition',
          md: md`For squared error, at every input $\bx$,
$$\E_{\mathcal{D},\varepsilon}\big[(y - \hat f_{\mathcal{D}}(\bx))^2\big] = \underbrace{\sigma^2}_{\text{noise}} + \underbrace{\big(\bar f(\bx) - f(\bx)\big)^2}_{\text{bias}^2} + \underbrace{\E_{\mathcal{D}}\big[(\hat f_{\mathcal{D}}(\bx) - \bar f(\bx))^2\big]}_{\text{variance}}.$$
Averaging over test inputs $\bx$ gives the same split for the overall test MSE.`,
        },
        {
          kind: 'derive',
          title: 'the decomposition',
          goal: md`Prove the decomposition at a fixed $\bx$. Write $f$, $\bar f$, $\hat f$ for the three values at $\bx$.`,
          steps: [
            {
              md: md`Insert the two reference values: $$y - \hat f = \underbrace{(y - f)}_{\varepsilon} + (f - \bar f) + (\bar f - \hat f).$$`,
              choose: {
                prompt: md`You want separate terms for noise, systematic error and scatter. What do you insert into $y - \hat f$?`,
                options: [md`Add and subtract $f$ and $\bar f$`, md`Multiply and divide by $\hat f$`, md`Replace $y$ by its expectation $f$`],
                answer: 0,
                explain: md`Adding and subtracting changes nothing but splits the error into the three pieces you want to study. Replacing $y$ by $f$ would throw the noise away.`,
              },
            },
            { md: md`Square and take the expectation over $\mathcal{D}$ and $\varepsilon$. You get three squared terms, $\E[\varepsilon^2] = \sigma^2$, $(f - \bar f)^2$ (a constant) and $\E[(\bar f - \hat f)^2]$, plus three cross terms with a factor 2.` },
            {
              md: md`The cross terms vanish:
- $\E[\varepsilon\,(f - \bar f)] = (f - \bar f)\,\E[\varepsilon] = 0$;
- $\E[\varepsilon\,(\bar f - \hat f)] = \E[\varepsilon]\,\E[\bar f - \hat f] = 0$, because the new noise is independent of the training set;
- $\E_{\mathcal{D}}[(f - \bar f)(\bar f - \hat f)] = (f - \bar f)\,(\bar f - \E_{\mathcal{D}}[\hat f]) = 0$.`,
              choose: {
                prompt: md`Why is $\E_{\mathcal{D}}[(f - \bar f)(\bar f - \hat f_{\mathcal{D}})] = 0$?`,
                options: [md`$f - \bar f$ does not depend on $\mathcal{D}$, and $\E_{\mathcal{D}}[\hat f_{\mathcal{D}}] = \bar f$ by definition`, md`$f$ and $\hat f$ are independent`, md`The noise has mean zero`],
                answer: 0,
                explain: md`The first factor is a constant, so it comes out of the expectation, and the second factor has mean zero by the definition of $\bar f$. No independence or noise assumption is needed for this term.`,
              },
            },
            { md: md`What remains is $$\E[(y - \hat f)^2] = \sigma^2 + (f - \bar f)^2 + \E[(\hat f - \bar f)^2] = \text{noise} + \text{bias}^2 + \text{variance}.$$` },
          ],
          takeaway: md`Noise is a floor no model can go below. Bias² and variance belong to the learning procedure and the sample size, and changing the model class (degree, depth, $k$, regularization strength) usually trades one against the other.`,
        },
        {
          kind: 'numeric',
          q: md`Four training sets give the predictions $1.5,\ 2.5,\ 3.0,\ 3.0$ at a point $x_0$ where $f(x_0) = 2$. The noise variance is $\sigma^2 = 0.5$. Treating these four as the whole distribution of $\mathcal{D}$, compute bias², variance and the expected squared error, in that order.`,
          answer: { kind: 'vector', value: [0.25, 0.375, 1.125] },
          inputHint: 'three numbers, e.g. 0.25, 0.375, 1.125',
          hints: [md`The average prediction is $\bar f = 2.5$. Variance is the mean of $(\hat f - \bar f)^2$.`],
          explain: md`$\bar f = 2.5$, so bias² $= (2.5 - 2)^2 = 0.25$. Deviations $-1, 0, 0.5, 0.5$ give variance $(1 + 0 + 0.25 + 0.25)/4 = 0.375$. Expected error $= 0.5 + 0.25 + 0.375 = 1.125$.`,
        },
        {
          kind: 'check',
          q: md`You increase the regularization strength $\lambda$ of a ridge regression. What typically happens?`,
          options: [md`Bias rises and variance falls`, md`Both bias and variance fall`, md`Bias falls and variance rises`, md`Neither changes, only the training error`],
          answer: 0,
          explain: md`A larger $\lambda$ pulls the weights toward zero, so the fitted function depends less on the particular sample (lower variance) but is pulled away from the truth (higher bias). The best $\lambda$ balances the two and is found on validation data.`,
        },
        {
          kind: 'text',
          md: md`### Underfitting and overfitting

Training error and validation error together tell you which side of the U you are on.

| | training error | validation error | what usually helps |
|---|---|---|---|
| **underfitting** (bias dominates) | high | high, close to training | a more flexible model, better features, less regularization, training longer |
| **overfitting** (variance dominates) | low | much higher than training | more data, more regularization, a simpler model, early stopping, averaging many models |

A **learning curve** plots both errors against the training-set size $n$ for a fixed model. Training error rises with $n$ (more points are harder to fit exactly) and validation error falls (less variance). Where they meet, and how high, is the diagnosis.`,
        },
        {
          kind: 'viz',
          viz: { type: 'ml.learning-curve', degree: 1 },
          task: md`With degree 1, move $n$ from 12 to 300. Does the gap close, and at what height? Switch to degree 9 and repeat. For which model would collecting more data be worth the money?`,
          caption: md`Degree 1 (high bias): both curves flatten well above the noise floor $\sigma^2 = 0.09$ (dashed). Degree 9 (high variance at small $n$): a large gap that shrinks steadily with more data.`,
        },
        {
          kind: 'check',
          q: md`A model has 1% training error and 14% validation error, and the gap shrinks steadily as you add data. What is the most promising next step?`,
          options: [md`Collect more data or regularize more`, md`Switch to a larger model`, md`Remove the regularization`, md`Train for more epochs`],
          answer: 0,
          explain: md`A large train–validation gap that closes with more data is the signature of variance. More data, stronger regularization or a simpler model attack variance. A larger model, less regularization or longer training would all increase it.`,
        },
        {
          kind: 'text',
          md: md`### Double descent

The U-shaped curve describes the classical regime, where the number of parameters $p$ is below the number of training points $n$. If the model keeps growing past the **interpolation threshold**, where it can fit every training point exactly ($p \approx n$ for a linear model), the test error can peak at the threshold and then **fall again** as $p$ grows further. Belkin et al. (2019) and Nakkiran et al. (2019) documented this for linear models, random-feature models, trees and deep networks.

The decomposition above still holds. What changes is that variance is not monotone in the parameter count. Just at the threshold exactly one solution interpolates the noisy labels, and it needs enormous coefficients. Far past it, infinitely many solutions interpolate and the algorithm picks the one with the smallest norm (gradient descent on least squares started from zero converges to that one), which is much smoother. A well-tuned ridge penalty removes the peak.`,
        },
        {
          kind: 'viz',
          viz: { type: 'ml.double-descent', lambda: 0 },
          task: md`With $\lambda = 0$, move $p$ through 30 (the number of training points) and watch the coefficient norm in the readout. Then set $\lambda = 1$: what happens to the peak?`,
          caption: md`Linear regression on the first $p$ of 300 Gaussian features with $n = 30$. For $p < n$ this is ordinary least squares; for $p \ge n$ it is the minimum-norm interpolant (or the ridge solution when $\lambda > 0$). The grey horizontal line is the error of predicting 0.`,
        },
        {
          kind: 'paper',
          problem: {
            id: 'ml03-1-paper',
            title: 'Bias and variance of k-nearest-neighbour regression',
            type: 'compute',
            difficulty: 2,
            minutes: 12,
            statement: md`k-NN regression predicts at $x_0$ the average label of the $k$ training inputs nearest to $x_0$. Take the training inputs as fixed: $-0.5,\ 0.6,\ -1.2,\ 1.5,\ 2.5$, with labels $y = x^2 + \varepsilon$ and $\sigma^2 = 1$. Only the noise is random.

(a) Show that at $x_0$ $$\E\big[(y - \hat f_k(x_0))^2\big] = \sigma^2 + \Big(f(x_0) - \tfrac1k\textstyle\sum_{l=1}^k f(x_{(l)})\Big)^2 + \dfrac{\sigma^2}{k},$$ where $x_{(1)}, \dots, x_{(k)}$ are the $k$ nearest inputs.

(b) Evaluate it at $x_0 = 0$ for $k = 1, 3, 5$. Enter the three values.`,
            hints: [md`$\hat f_k(x_0) = \frac1k\sum_l \big(f(x_{(l)}) + \varepsilon_l\big)$. What are its mean and variance?`, md`Sorted by distance from 0: $-0.5, 0.6, -1.2, 1.5, 2.5$.`],
            solution: [
              md`(a) $\hat f_k(x_0) = \frac1k\sum_l f(x_{(l)}) + \frac1k\sum_l \varepsilon_l$. Its mean is $\bar f = \frac1k\sum_l f(x_{(l)})$, so bias² $= (f(x_0) - \bar f)^2$.`,
              md`Its variance is $\Var\big(\frac1k\sum_l \varepsilon_l\big) = \frac{1}{k^2}\cdot k\sigma^2 = \sigma^2/k$, since the noises are independent. Add the noise of the new label, $\sigma^2$, by the decomposition.`,
              md`(b) $f(x_0) = 0$. For $k = 1$: $\bar f = 0.25$, so the error is $1 + 0.0625 + 1 = 2.0625$.`,
              md`$k = 3$: $\bar f = (0.25 + 0.36 + 1.44)/3 = 0.6833$, bias² $= 0.4669$, variance $= 1/3$; total $\approx 1.8003$.`,
              md`$k = 5$: $\bar f = (0.25 + 0.36 + 1.44 + 2.25 + 6.25)/5 = 2.11$, bias² $= 4.4521$, variance $= 0.2$; total $= 5.6521$.`,
              md`$k = 3$ is best: $k = 1$ has the most variance, $k = 5$ reaches far-away points where $x^2$ is large and has the most bias.`,
            ],
            answer: { kind: 'vector', value: [2.0625, 1.80028, 5.6521], tol: 1e-3 },
            rubric: [md`Mean and variance of $\hat f_k$ derived, with independence used for the variance`, md`Neighbours ordered correctly by distance`, md`Three totals computed and the U-shape in $k$ noted`],
          },
        },
        {
          kind: 'code',
          code: `import numpy as np

np.random.seed(0)
f = lambda x: np.sin(2 * np.pi * x)
x = (np.arange(20) + 0.5) / 20            # fixed inputs; each dataset gets new noise
grid = np.linspace(0, 1, 101)

for deg in [1, 3, 9]:
    A = (2 * x[:, None] - 1) ** np.arange(deg + 1)       # polynomial features on [-1, 1]
    G = (2 * grid[:, None] - 1) ** np.arange(deg + 1)
    preds = []
    for r in range(200):
        y = f(x) + 0.3 * np.random.randn(20)
        w = np.linalg.lstsq(A, y, rcond=None)[0]
        preds.append(G @ w)
    P = np.array(preds)                                   # 200 fits x 101 grid points
    bias2 = np.mean((P.mean(axis=0) - f(grid)) ** 2)
    var = np.mean(P.var(axis=0))
    print(deg, round(float(bias2), 4), round(float(var), 4), round(float(bias2 + var + 0.09), 4))`,
          note: md`Each row prints degree, bias², variance and their sum with the noise $\sigma^2 = 0.09$. This is the decomposition estimated by brute force: 200 training sets, one fit each, then the mean and the spread of the predictions. Change the noise level or the number of points and re-run.`,
        },
        {
          kind: 'recall',
          prompt: md`Write the bias–variance decomposition from memory. Name two changes that lower variance and two that lower bias.`,
          answer: md`$\E[(y - \hat f)^2] = \sigma^2 + (\bar f - f)^2 + \E[(\hat f - \bar f)^2]$. Lower variance: more data, stronger regularization, a simpler model, averaging (bagging), early stopping. Lower bias: a more flexible model, better features, weaker regularization, boosting.`,
        },
        {
          kind: 'explain',
          prompt: md`An interviewer asks: *explain the bias–variance tradeoff, with an example from a model you have used.* Answer in a few sentences.`,
          model: md`Expected test error under squared loss splits into irreducible noise, squared bias and variance. Bias is the systematic error of the average model, from assumptions that are too simple; variance is how much the fitted model changes with the training sample, from too much flexibility for the amount of data. Increasing capacity, such as tree depth, polynomial degree or a smaller $k$ in k-NN, typically lowers bias and raises variance, so test error is U-shaped in capacity and you choose the capacity on validation data. For example, a fully grown decision tree has near-zero training error but high variance; limiting depth or averaging many trees in a random forest lowers the variance at little cost in bias.`,
        },
      ],
      cards: [
        { id: 'ml03-1-c1', kind: 'concept', front: md`Define the bias and the variance of a learning procedure at an input $\bx$.`, back: md`With $\bar f(\bx) = \E_{\mathcal{D}}[\hat f_{\mathcal{D}}(\bx)]$: bias $= \bar f(\bx) - f(\bx)$, variance $= \E_{\mathcal{D}}[(\hat f_{\mathcal{D}}(\bx) - \bar f(\bx))^2]$.` },
        { id: 'ml03-1-c2', kind: 'cloze', text: md`Expected squared error = noise + {{}}² + variance.`, answers: ['bias'] },
        { id: 'ml03-1-c3', kind: 'compute', front: md`Models trained on three datasets predict $1, 2, 3$ at a point where the truth is $1$. Compute bias².`, answer: { kind: 'number', value: 1 }, back: md`The average prediction is 2, so bias² $= (2 - 1)^2 = 1$.` },
        { id: 'ml03-1-c4', kind: 'concept', front: md`On a learning curve, what do high bias and high variance look like?`, back: md`High bias: training and validation error converge quickly to a high level; more data does not help. High variance: a large gap between low training error and higher validation error that shrinks as data is added.` },
        { id: 'ml03-1-c5', kind: 'concept', front: md`What is double descent?`, back: md`Test error, plotted against model size, peaks near the interpolation threshold (parameters ≈ training points) and falls again beyond it, because the minimum-norm interpolant chosen there gets smoother as size grows. Good regularization removes the peak.` },
      ],
    },
    // ------------------------------------------------------------------ 3.2
    {
      id: 'ml03-2',
      title: 'Validation done right',
      minutes: 40,
      objectives: [
        'Assign data to training, validation and test roles, and compute fold sizes and the number of fits for k-fold cross-validation.',
        'Choose a stratified, grouped or time-series split that reproduces how the model will be used.',
        'Recognize target leakage, preprocessing leakage, duplicates across splits and future information, and fix each one.',
        'Explain why the best validation score is optimistic, and compare grid, random and Bayesian hyperparameter search.',
      ],
      cells: [
        {
          kind: 'text',
          md: md`A score measured on held-out data estimates future performance only if no decision about the model was made by looking at that data. Every decision made with a dataset (fitting weights, choosing a learning rate, selecting features, deciding when to stop) uses up some of its independence. The standard arrangement gives each job its own data:

- **training set**: fit the parameters;
- **validation set**: compare models and hyperparameters;
- **test set**: estimate the error of the final choice, once.

Common splits are 60/20/20 or 80/10/10. With millions of rows, a few tens of thousands of validation and test examples are usually enough: the standard error of an accuracy $p$ measured on $m$ examples is $\sqrt{p(1-p)/m}$, which for $p = 0.9$ and $m = 10{,}000$ is $0.003$.`,
        },
        {
          kind: 'callout',
          tone: 'definition',
          title: 'k-fold cross-validation',
          md: md`Split the training data into $k$ folds of (nearly) equal size. For $i = 1, \dots, k$, train on the other $k - 1$ folds and evaluate on fold $i$. The **cross-validation estimate** is the average of the $k$ scores. Every example is used for validation exactly once and for training $k - 1$ times. Common choices are $k = 5$ or $k = 10$. After selecting hyperparameters by CV, the final model is usually refitted on all the training data.`,
        },
        {
          kind: 'viz',
          viz: { type: 'ml.cv-splits', mode: 'kfold', k: 5 },
          task: md`Without stratification, read the per-fold lines: which validation fold has no positive example? Turn on **stratify by label** and check every fold again. Then try $k = 10$.`,
          caption: md`Rows are folds, columns are the 20 samples (5 positives, marked with a dot). Without stratification, a fold can miss the rare class entirely, and then its recall is undefined and its accuracy misleading. Stratification deals each class round-robin over the folds.`,
        },
        {
          kind: 'numeric',
          q: md`You run 5-fold cross-validation over a grid of 12 hyperparameter settings, then refit the winning setting on all training data. How many models do you train in total?`,
          answer: { kind: 'number', value: 61 },
          explain: md`$12 \times 5 = 60$ fits for the search plus 1 refit: $61$.`,
        },
        {
          kind: 'code',
          code: `import numpy as np

print(np.array_split(np.arange(10), 3))`,
          predict: {
            q: md`\`np.array_split\` divides 10 indices into 3 folds that differ in size by at most one. What is printed?`,
            options: ['`[array([0, 1, 2, 3]), array([4, 5, 6]), array([7, 8, 9])]`', '`[array([0, 1, 2]), array([3, 4, 5]), array([6, 7, 8, 9])]`', '`[array([0, 1, 2]), array([3, 4, 5]), array([6, 7, 8])]`', '`ValueError: array split does not result in an equal division`'],
            answer: 0,
            explain: md`With $10 = 3 \cdot 3 + 1$, the first $10 \bmod 3 = 1$ fold gets one extra element. \`np.split\` would raise the error in the last option; \`array_split\` allows unequal folds. scikit-learn's \`KFold\` sizes its folds the same way.`,
          },
        },
        {
          kind: 'text',
          md: md`### The split must mirror deployment

A validation score answers the question "how well does the model do on data related to the training data in **this** way?". Choose the split so that this relationship matches production.

- **Stratified** splits keep class proportions equal across folds. Use them for classification, especially with rare classes.
- **Grouped** splits keep all rows of one entity (patient, user, device, store, document) on the same side. Use them whenever the model will be applied to entities it has never seen. Otherwise it can score well by recognizing the entity.
- **Time-series** splits train on the past and validate on the future: an expanding window (forward chaining) or a sliding window. Leave a **gap** when features are computed over trailing windows or labels take time to arrive, so that no training row overlaps the validation period.`,
        },
        {
          kind: 'viz',
          viz: { type: 'ml.cv-splits', mode: 'group', k: 5 },
          task: md`Each letter is a patient with several scans. With plain k-fold, count the patients that appear on both sides of fold 1. Turn on **GroupKFold** and check all folds.`,
          caption: md`GroupKFold assigns whole groups to folds, largest first, to the fold with the fewest samples so far. Fold sizes become less even; that is the price of an honest estimate.`,
        },
        {
          kind: 'viz',
          viz: { type: 'ml.cv-splits', mode: 'time', k: 4 },
          task: md`With shuffled folds, how many training points of fold 1 come from after its first validation point? Switch to forward chaining and set a gap of 2.`,
          caption: md`Forward chaining (scikit-learn's \`TimeSeriesSplit\`) trains on everything before the validation block. Later splits have more training data, as a model retrained over time would.`,
        },
        {
          kind: 'check',
          q: md`A chest X-ray classifier reaches AUC 0.97 with a random 80/20 split of 50,000 images from 8,000 patients, but 0.85 in a hospital pilot. Which validation change is most likely to expose the gap before deployment?`,
          options: [md`Split by patient, so that no patient has images in both training and test`, md`Use 10-fold instead of 5-fold cross-validation`, md`Stratify the split by diagnosis`, md`Use a larger test set`],
          answer: 0,
          explain: md`Images of one patient share anatomy, devices and often the label. A random split puts the same patients on both sides, so the test score partly measures recognition of patients. A grouped split by patient reproduces the deployment situation of new patients. More folds, stratification or a bigger test set do not remove that leak.`,
        },
        {
          kind: 'callout',
          tone: 'warning',
          title: 'Data leakage',
          md: md`**Leakage** is any path by which information that will not be available at prediction time reaches the model or its evaluation. It makes offline scores too good. Four common forms:

1. **Target leakage.** A feature is derived from the label or recorded after the moment of prediction. Predicting churn with "number of retention calls", which the support team only makes after a customer asks to cancel. Predicting at admission whether a patient will need intensive care with a feature filled in during the stay.
2. **Preprocessing fitted on all data.** Scaling, imputation, PCA, feature selection or target encoding computed on the full dataset before splitting. The statistics include the validation rows.
3. **Duplicates across splits.** The same or near-identical rows on both sides: repeated log events, augmented copies of an image, the same product photographed twice, the same user. The model is rewarded for memorization.
4. **Future information.** A random split of time-ordered data, or features aggregated over a window that extends past the prediction time, such as a 7-day average centred on the event.

The fixes follow one rule: build every feature and fit every transformation using only data that would exist at prediction time, inside each training fold (a \`Pipeline\` object in scikit-learn does this), and split by group and by time where the deployment requires it.`,
        },
        {
          kind: 'viz',
          viz: { type: 'ml.leakage-selection', m: 10 },
          task: md`Move the number of candidate features from 10 to 3000 and compare the two curves. Which estimate would you report to your manager, and why does the other one keep improving although the data are pure noise?`,
          caption: md`With many noise features, some correlate with the labels of these particular 40 rows by chance. Selecting them while the validation rows are in view builds that chance correlation into the model, and the validation rows then confirm it. Selecting inside each training fold gives the honest answer: about 50%.`,
        },
        {
          kind: 'derive',
          title: 'why the winner\'s validation score is optimistic',
          goal: md`Two models have the same true accuracy $\mu$. Their validation accuracies $X_1, X_2$ are independent $\mathcal{N}(\mu, \sigma^2)$, and you report the larger. Show $\E[\max(X_1, X_2)] = \mu + \sigma/\sqrt{\pi}$.`,
          steps: [
            {
              md: md`Write the maximum without a case split: $$\max(a, b) = \frac{a + b}{2} + \frac{|a - b|}{2}.$$`,
              choose: {
                prompt: md`Which identity turns $\max(a, b)$ into something whose expectation you can compute?`,
                options: [md`$\max(a, b) = \tfrac{a+b}{2} + \tfrac{|a - b|}{2}$`, md`$\max(a, b) = \sqrt{a^2 + b^2}$`, md`$\max(a, b) = a + b - \min(a, b)^2$`],
                answer: 0,
                explain: md`Check it for $a \ge b$: $\frac{a+b}{2} + \frac{a-b}{2} = a$. The other two are false in general.`,
              },
            },
            { md: md`$\E\big[\tfrac{X_1 + X_2}{2}\big] = \mu$. The difference $X_1 - X_2$ is normal with mean $0$ and variance $\sigma^2 + \sigma^2 = 2\sigma^2$, because the two are independent.` },
            {
              md: md`For $Z \sim \mathcal{N}(0, s^2)$, $\E|Z| = s\sqrt{2/\pi}$. With $s = \sqrt2\,\sigma$: $\E|X_1 - X_2| = \sqrt2\,\sigma\sqrt{2/\pi} = 2\sigma/\sqrt\pi$.`,
              choose: {
                prompt: md`What is $\E|X_1 - X_2|$?`,
                options: [md`$2\sigma/\sqrt\pi$`, md`$\sigma\sqrt{2/\pi}$`, md`$0$, because the two have the same mean`],
                answer: 0,
                explain: md`The standard deviation of the difference is $\sqrt2\sigma$, not $\sigma$. The mean of $X_1 - X_2$ is 0, but the mean of its absolute value is positive.`,
              },
            },
            { md: md`Combine: $\E[\max(X_1, X_2)] = \mu + \tfrac12 \cdot \tfrac{2\sigma}{\sqrt\pi} = \mu + \sigma/\sqrt\pi \approx \mu + 0.56\,\sigma$. With more candidates the optimism grows; for $m$ independent candidates it grows roughly like $\sigma\sqrt{2\ln m}$.` },
          ],
          takeaway: md`Choosing the best of several models on a validation set biases that set's score upward, even when no model is better than another. That is why the test set is used once, after every choice is made, and why **nested cross-validation** (an outer CV loop around the whole tuning procedure) is used when the tuned procedure itself must be evaluated.`,
        },
        {
          kind: 'numeric',
          q: md`Two models both have true accuracy $0.80$. Their validation accuracies are independent with standard deviation $0.02$. What accuracy do you report, on average, if you report the better of the two?`,
          answer: { kind: 'number', value: 0.81128, tol: 1e-3 },
          explain: md`$0.80 + 0.02/\sqrt\pi = 0.80 + 0.0113 = 0.8113$. More than a point of accuracy from selection alone.`,
        },
        {
          kind: 'text',
          md: md`### Hyperparameter search

- **Grid search** tries every combination of a few values per hyperparameter. The cost grows exponentially with the number of hyperparameters.
- **Random search** samples each hyperparameter independently from a range, usually on a log scale for learning rates and regularization strengths. Bergstra and Bengio (2012) showed that it finds good settings faster than a grid when only a few hyperparameters matter, which is the usual case.
- **Bayesian optimization** fits a cheap surrogate model of score as a function of the hyperparameters (a Gaussian process or a tree-structured Parzen estimator) to the trials so far, then picks the next trial by an acquisition function such as expected improvement, which balances exploring uncertain regions against refining good ones. It is sequential and pays off when each trial is expensive.
- **Early-stopping methods** such as successive halving and Hyperband start many configurations with a small budget (few epochs, a data subsample) and give more budget only to the best fraction.

All of them select on validation data, so the selected score is optimistic, as derived above.`,
        },
        {
          kind: 'viz',
          viz: { type: 'ml.hparam-search', budget: 9 },
          task: md`With budget 9, press **new random draw** a few times and compare the best scores of grid and random search. Count how many distinct values of the important hyperparameter $a$ each method tried. Repeat with budget 16.`,
          caption: md`The score depends almost only on $a$. A $3 \times 3$ grid tests only 3 values of $a$, and none lands near the narrow peak. Nine random trials test nine values of $a$.`,
        },
        {
          kind: 'check',
          q: md`Why does random search usually beat grid search with the same number of trials?`,
          options: [
            md`Typically only a few hyperparameters matter, and random search tries a new value of each one in every trial while a grid repeats the same few values`,
            md`Random sampling avoids overfitting the validation set`,
            md`Random search uses information from earlier trials to choose the next one`,
            md`Grids cannot include log-scaled values`,
          ],
          answer: 0,
          explain: md`With $m$ trials a $g \times g$ grid tests only $g = \sqrt{m}$ distinct values of each hyperparameter. Random search tests $m$. Using earlier trials is what Bayesian optimization adds; random search does not. Both search methods select on validation data and are equally exposed to selection optimism.`,
        },
        {
          kind: 'paper',
          problem: {
            id: 'ml03-2-paper',
            title: 'Audit a pipeline for leakage',
            type: 'concept',
            difficulty: 2,
            minutes: 15,
            statement: md`A team predicts, at checkout, whether an online order will be returned. Their pipeline:

1. Fill missing prices with the mean price over the full dataset.
2. Standardize all numeric features with the mean and standard deviation of the full dataset.
3. Add the feature \`refund_amount\`.
4. Add the feature \`customer_return_rate\`: the fraction of all of the customer's orders in the dataset that were returned.
5. Split the orders at random into 80% training and 20% test.
6. Try 200 hyperparameter settings and report the best test-set AUC.

Name every leak, say which type it is, and give the fix.`,
            solution: [
              md`Steps 1 and 2: **preprocessing fitted on all data**. The mean and standard deviation include test rows. The effect is usually small for a mean, but the habit is wrong. Fix: fit the imputer and scaler on training rows only, inside each CV fold (a pipeline).`,
              md`Step 3: **target leakage**. A refund exists only after a return, so \`refund_amount > 0\` almost equals the label and is unknown at checkout. Fix: drop it. In general, keep only features whose value is known at prediction time.`,
              md`Step 4: **target leakage and future information**. The rate uses the label of the current order and of the customer's later orders. Fix: compute it from that customer's orders strictly **before** the current one (a point-in-time feature), and for training rows only from training-period data.`,
              md`Step 5: **duplicates and future information**. The same customer appears on both sides, and later orders train a model tested on earlier ones. Fix: split by time (train on earlier months, test on later), and consider grouping by customer if the model must work for new customers.`,
              md`Step 6: **selection on the test set**. The best of 200 test scores is optimistic. Fix: choose hyperparameters on a validation set or by CV within the training period, then evaluate the single chosen model on the test period once.`,
            ],
            rubric: [md`Finds the target leak in \`refund_amount\``, md`Finds that \`customer_return_rate\` uses the current and future labels, and proposes a point-in-time version`, md`Flags imputation and scaling fitted before the split`, md`Proposes a time-based (and possibly grouped) split`, md`Flags tuning on the test set and proposes a separate validation set or CV`],
          },
        },
        {
          kind: 'exercise',
          ex: {
            id: 'ml03-ex-stratified',
            title: 'Stratified fold assignment without loops',
            prompt: md`Write \`stratified_folds(y, k)\` that returns an integer array \`folds\` with \`folds[i]\` in \`0..k-1\`, so that every class is spread as evenly as possible over the folds. Use this rule: sort the indices by label with a **stable** sort (\`np.argsort(y, kind='stable')\`), then deal them out round-robin, so the $j$-th index in that order goes to fold $j \bmod k$. No Python loops.`,
            starter: `import numpy as np

def stratified_folds(y, k):
    # contiguous folds: ignores the labels
    return np.arange(len(y)) * k // len(y)
`,
            solution: `import numpy as np

def stratified_folds(y, k):
    order = np.argsort(y, kind='stable')
    folds = np.empty(len(y), dtype=int)
    folds[order] = np.arange(len(y)) % k
    return folds
`,
            tests: [
              { expr: 'stratified_folds(np.array([0, 1, 0, 0, 1, 0, 0, 0, 1, 0, 0, 1]), 4).tolist()', label: 'fold of each sample' },
              { expr: 'np.bincount(stratified_folds(np.array([0, 1, 0, 0, 1, 0, 0, 0, 1, 0, 0, 1]), 4)[np.array([0, 1, 0, 0, 1, 0, 0, 0, 1, 0, 0, 1]) == 1], minlength=4).tolist()', label: 'positives per fold' },
              { expr: 'stratified_folds(np.array([2, 0, 1, 1, 0, 2, 0, 1, 0, 0]), 3).tolist()', label: 'three classes' },
            ],
            hints: [md`\`order[j]\` is the index of the $j$-th sample after sorting by label. You want \`folds[order[j]] = j % k\` for every \`j\` at once.`, md`Fancy assignment does that: \`folds[order] = np.arange(len(y)) % k\`.`],
            mustExclude: ['for '],
          },
        },
        {
          kind: 'code',
          code: `import numpy as np

np.random.seed(0)
n, p, m, k = 40, 2000, 10, 5
X = np.random.randn(n, p)                 # pure noise features
y = np.arange(n) % 2                      # labels unrelated to X
folds = np.arange(n) % k

def top_features(X, y, m):
    Xc = X - X.mean(axis=0)
    yc = y - y.mean()
    score = np.abs(Xc.T @ yc) / np.linalg.norm(Xc, axis=0)
    return np.argsort(-score)[:m]

def centroid_accuracy(Xtr, ytr, Xva, yva):
    c0 = Xtr[ytr == 0].mean(axis=0)
    c1 = Xtr[ytr == 1].mean(axis=0)
    pred = ((Xva - c1) ** 2).sum(axis=1) < ((Xva - c0) ** 2).sum(axis=1)
    return np.mean(pred.astype(int) == yva)

leaky, honest = [], []
chosen_on_all = top_features(X, y, m)     # LEAK: uses the validation rows' labels
for f in range(k):
    tr, va = folds != f, folds == f
    leaky.append(centroid_accuracy(X[tr][:, chosen_on_all], y[tr], X[va][:, chosen_on_all], y[va]))
    s = top_features(X[tr], y[tr], m)     # selection sees training rows only
    honest.append(centroid_accuracy(X[tr][:, s], y[tr], X[va][:, s], y[va]))
print("select then CV:", np.mean(leaky))
print("select inside CV:", np.mean(honest))`,
          note: md`The same experiment as the figure, on one dataset. Change \`p\` to 20 and the two numbers become close: with few candidates, there is little chance correlation to exploit.`,
        },
        {
          kind: 'recall',
          prompt: md`List the four kinds of leakage with one example each, and the single rule that prevents most of them.`,
          answer: md`Target leakage (a feature derived from the label or recorded after prediction time, e.g. refund amount for return prediction); preprocessing fitted on all data (scaler, imputer, feature selection, target encoding before the split); duplicates or shared entities across splits (same user or patient on both sides); future information (random split of time series, windows extending past prediction time). Rule: compute every feature and fit every transformation using only information available at prediction time, inside each training fold, with splits by time and group that match deployment.`,
        },
        {
          kind: 'explain',
          prompt: md`An interviewer asks: *how do you detect and prevent data leakage?* Answer in a few sentences.`,
          model: md`Prevention: define the prediction time for every example and build features point-in-time, using only data available then. Split the way the model will be used, by time for forecasting and by entity when it must generalize to new users or patients. Fit all preprocessing, feature selection and target encoding inside the training folds through a pipeline, and keep a test set that is touched once. Detection: be suspicious of scores that are too good or much better than a simple baseline; look at feature importances for a single dominant feature and check when its value becomes known; compare a random split with a time or group split, since a large drop signals leakage; check for duplicate or near-duplicate rows across splits; and compare offline results with a shadow deployment.`,
        },
      ],
      cards: [
        { id: 'ml03-2-c1', kind: 'concept', front: md`What are the jobs of the training, validation and test sets?`, back: md`Training: fit parameters. Validation: compare models and choose hyperparameters. Test: estimate the error of the final choice, used once after all decisions.` },
        { id: 'ml03-2-c2', kind: 'compute', front: md`1,000 training rows, 5-fold CV. How many rows does each fold's model train on?`, answer: { kind: 'number', value: 800 }, back: md`Each model trains on $4$ of the $5$ folds: $4 \times 200 = 800$ rows.` },
        { id: 'ml03-2-c3', kind: 'cloze', text: md`Several rows per patient: use a {{}} split so that no patient is on both sides.`, answers: ['grouped'] },
        { id: 'ml03-2-c4', kind: 'concept', front: md`Name the four common forms of data leakage.`, back: md`Target leakage; preprocessing (scaling, imputation, selection, encoding) fitted on all data; duplicates or shared entities across splits; future information in time-ordered data.` },
        { id: 'ml03-2-c5', kind: 'concept', front: md`Why is the best validation score among many models optimistic, and what fixes the estimate?`, back: md`The maximum of noisy estimates is biased upward ($\E\max \ge \max\E$). Evaluate the single chosen model on an untouched test set, or use nested cross-validation.` },
      ],
    },
    // ------------------------------------------------------------------ 3.3
    {
      id: 'ml03-3',
      title: 'From offline metrics to online experiments',
      minutes: 40,
      objectives: [
        'Explain why offline metric gains may not translate into business metrics.',
        'Design an A/B test: randomization unit, primary and guardrail metrics, duration, and the pitfalls of peeking and novelty effects.',
        'Derive and apply the sample-size formula for comparing two means or proportions.',
        'Distinguish covariate shift, label shift and concept drift, and say which monitoring signal detects each.',
        'Describe a feedback loop in a deployed model and one way to mitigate it.',
      ],
      cells: [
        {
          kind: 'text',
          md: md`A new ranking model raises NDCG@10 on last month's logs by 3%. Whether it ships depends on what it does to users: sessions, purchases, retention, latency. Offline metrics are proxies, and the gap has known causes:

- the logs were collected under the **old** system, so users could only click what the old model showed them;
- some effects appear only in deployment: latency, novelty, users changing their behaviour in response to the model;
- the offline metric rarely measures the business outcome itself.

The controlled way to measure the causal effect of a change on real users is a randomized experiment.`,
        },
        {
          kind: 'callout',
          tone: 'definition',
          title: 'A/B test vocabulary',
          md: md`- **Randomization unit**: what is assigned at random to control (A) or treatment (B): a user, a session, a request, a region.
- **Primary metric**: the metric the decision is based on, fixed before the test starts.
- **Guardrail metrics**: metrics that must not get worse (latency, error rate, unsubscribes, revenue).
- **Minimum detectable effect (MDE)** $\delta$: the smallest true effect the test should detect reliably.
- **Significance level** $\alpha$: the false positive rate under no effect, usually $0.05$. **Power** $1 - \beta$: the probability of detecting an effect of size $\delta$, usually $0.8$.`,
        },
        {
          kind: 'text',
          md: md`**Choosing the randomization unit.** User-level assignment is the default for product changes: each user sees one consistent experience, and user-level outcomes such as retention can be measured. Request- or session-level assignment produces more units but shows the same user both variants, and outcomes of one user are correlated. Analyse at the level you randomized: if you randomize users but report a per-click rate, compute its variance over users (with the delta method or a bootstrap over users), because clicks of one user are not independent. When units interact, as in marketplaces, social networks or shared ad budgets, randomize clusters (regions, graph communities) or alternate whole time periods (switchback designs).`,
        },
        {
          kind: 'viz',
          viz: { type: 'ml.ab-power', p: 0.05, lift: 0.1, n: 20000 },
          task: md`Baseline 5%, relative lift 10%: find the number of users per arm at which the power reaches 80%. Then set the lift to 5%. By roughly what factor does the required sample grow?`,
          caption: md`The grey curve is the distribution of the test statistic when there is no effect; the red tails beyond the cut-offs have total area $\alpha$. The green curve is its distribution when the lift is real, shifted right by $\delta/\text{SE}$. Power is the green area beyond the cut-off. More users shrink the SE and push the curves apart.`,
        },
        {
          kind: 'derive',
          title: 'sample size for a two-sample test',
          goal: md`Each arm has $n$ units with outcome variance $\sigma^2$ (for a conversion rate, $\sigma^2 = p(1-p)$). Find $n$ so that a two-sided test at level $\alpha$ has power $1 - \beta$ against a true difference $\delta > 0$.`,
          steps: [
            { md: md`The estimate $\hat\delta = \bar y_B - \bar y_A$ is approximately normal with mean $\delta$ and standard error $\text{SE} = \sqrt{2\sigma^2/n}$. The test rejects when $|\hat\delta|/\text{SE} > z_{1-\alpha/2}$ ($1.96$ for $\alpha = 0.05$).` },
            {
              md: md`Ignoring the negligible chance of rejecting in the wrong direction, $$\text{power} = P\Big(\tfrac{\hat\delta}{\text{SE}} > z_{1-\alpha/2}\Big) = \Phi\Big(\tfrac{\delta}{\text{SE}} - z_{1-\alpha/2}\Big),$$ because $\hat\delta/\text{SE} - \delta/\text{SE}$ is standard normal.`,
              choose: {
                prompt: md`Under the alternative, what is the distribution of $\hat\delta/\text{SE}$?`,
                options: [md`Normal with mean $\delta/\text{SE}$ and variance 1`, md`Standard normal`, md`Normal with mean $\delta$ and variance $\text{SE}^2$`],
                answer: 0,
                explain: md`Dividing $\hat\delta \sim \mathcal{N}(\delta, \text{SE}^2)$ by SE gives mean $\delta/\text{SE}$ and variance 1: the green curve in the figure.`,
              },
            },
            { md: md`Power equals $1 - \beta$ when $\delta/\text{SE} - z_{1-\alpha/2} = z_{1-\beta}$, that is $$\delta = (z_{1-\alpha/2} + z_{1-\beta})\,\sqrt{2\sigma^2/n}.$$` },
            {
              md: md`Solve for $n$: $$n = \frac{2\sigma^2\,(z_{1-\alpha/2} + z_{1-\beta})^2}{\delta^2}.$$ For $\alpha = 0.05$ and power $0.8$, $(1.96 + 0.84)^2 \approx 7.85$, so $n \approx 15.7\,\sigma^2/\delta^2$, usually rounded to the rule of thumb $$n \approx 16\,\sigma^2/\delta^2 \text{ per arm}.$$`,
              choose: {
                prompt: md`If you want to detect an effect half as large, the sample size per arm`,
                options: [md`grows 4 times`, md`grows 2 times`, md`grows $\sqrt2$ times`],
                answer: 0,
                explain: md`$n \propto 1/\delta^2$. Halving $\delta$ multiplies $n$ by 4. Small effects on rare events are expensive to measure.`,
              },
            },
          ],
          takeaway: md`Sample size grows with the outcome variance and with the inverse square of the effect. Reducing variance, for example with CUPED (regressing out each user's pre-experiment value of the metric), buys as much as more traffic.`,
        },
        {
          kind: 'numeric',
          q: md`Baseline conversion rate $10\%$. You want to detect an absolute increase of 1 percentage point with $\alpha = 0.05$ and 80% power. Using $n \approx 16\,p(1-p)/\delta^2$, how many users do you need per arm?`,
          answer: { kind: 'number', value: 14400 },
          explain: md`$\sigma^2 = 0.1 \times 0.9 = 0.09$ and $\delta = 0.01$: $n = 16 \times 0.09 / 0.0001 = 14{,}400$ users per arm.`,
        },
        {
          kind: 'text',
          md: md`### What goes wrong in practice

- **Peeking.** Checking significance every day and stopping at the first $p < 0.05$ inflates the false positive rate far above 5%. Either fix the sample size in advance, or use a sequential method designed for repeated looks (group-sequential boundaries, always-valid p-values).
- **Novelty and primacy effects.** Users react to change itself, either by exploring the new thing or by resisting it. Run at least one, preferably two, full weekly cycles, plot the effect by day, and compare new with returning users.
- **Guardrails.** A win on the primary metric with a regression in latency, errors or revenue usually does not ship.
- **Sample ratio mismatch (SRM).** If a 50/50 split delivers 50.8% / 49.2% of a million users, assignment or logging is broken (a chi-square test flags it), and the results cannot be trusted.
- **Many metrics and segments.** Testing 20 metrics at $\alpha = 0.05$ finds about one "significant" change by chance. Fix the primary metric in advance and correct for multiple comparisons.
- **Interference.** When treated users affect control users (shared inventory, social feeds), the measured difference is biased; use cluster or switchback designs.`,
        },
        {
          kind: 'code',
          code: `import numpy as np

np.random.seed(1)
n_exp, per_look, looks = 1000, 50, 10
a = np.random.randn(n_exp, per_look * looks)    # control outcomes (A/A: no real effect)
b = np.random.randn(n_exp, per_look * looks)    # treatment outcomes
n = np.arange(1, per_look * looks + 1)
z = (b - a).cumsum(axis=1) / np.sqrt(2 * n)      # z statistic after every pair of users
at_looks = z[:, per_look - 1::per_look]          # the 10 times someone checks the dashboard
print("one look at the end:", np.mean(np.abs(at_looks[:, -1]) > 1.96))
print("stop at the first significant look:", np.mean((np.abs(at_looks) > 1.96).any(axis=1)))`,
          note: md`1,000 simulated A/A tests, where the true effect is zero. Testing once at the end rejects about 5% of the time, as designed. Stopping at the first of 10 looks with $|z| > 1.96$ rejects about four times as often. Change \`looks\` to 20 and re-run.`,
        },
        {
          kind: 'check',
          q: md`A redesigned feed shows +4% clicks per user in week 1 and +1% in week 3 among existing users; among users who joined during the test it is +1% throughout. The most likely explanation is`,
          options: [md`A novelty effect: existing users explore the change at first, and the lasting effect is about +1%`, md`Sample ratio mismatch`, md`The test is underpowered`, md`Concept drift in the click model`],
          answer: 0,
          explain: md`An effect that decays over time only for users who knew the old version is the signature of novelty. New users have no old version to compare with and show the stable effect. Report the long-run estimate.`,
        },
        {
          kind: 'text',
          md: md`### Distribution shift

A model is trained on data from one joint distribution $p(\bx, y)$ and applied to another. Writing the joint distribution two ways, $p(\bx, y) = p(\bx)\,p(y \mid \bx) = p(y)\,p(\bx \mid y)$, separates three kinds of change:

- **Covariate shift**: $p(\bx)$ changes, $p(y \mid \bx)$ does not. A fraud model trained mostly on desktop traffic as mobile traffic grows.
- **Label shift** (prior shift): $p(y)$ changes, $p(\bx \mid y)$ does not. Flu prevalence rises in winter while the symptoms of flu stay the same.
- **Concept drift**: $p(y \mid \bx)$ changes. Spammers adapt, so the same email features now mean something different; user preferences change with prices or seasons.`,
        },
        {
          kind: 'viz',
          viz: { type: 'ml.dist-shift', kind: 'covariate', s: 1 },
          task: md`For each kind of shift, set the size to 1.5 and note the PSI and the best threshold on the target data. Which kind leaves the best threshold at 0? Which kind leaves the PSI at 0?`,
          caption: md`A 1-D classifier trained on the source (dashed) uses the threshold 0. Covariate shift keeps the best threshold but moves where inputs fall; label shift moves the threshold; concept drift moves the threshold without any change in $p(x)$, so input monitoring reports nothing.`,
        },
        {
          kind: 'check',
          q: md`Which kind of shift cannot be detected by monitoring the distribution of the input features alone?`,
          options: [md`Concept drift`, md`Covariate shift`, md`Label shift`, md`None: all three change the input distribution`],
          answer: 0,
          explain: md`Under concept drift $p(\bx)$ can stay exactly the same while $p(y \mid \bx)$ changes. Only labelled outcomes (or proxies such as user complaints) reveal it. Label shift does change $p(\bx)$, because the mixture of classes changes.`,
        },
        {
          kind: 'callout',
          tone: 'definition',
          title: 'Population stability index',
          md: md`Bin a feature (or the model's score) using the training data, and let $e_i$ and $a_i$ be the fractions of training ("expected") and live ("actual") data in bin $i$:
$$\text{PSI} = \sum_i (a_i - e_i)\,\ln\frac{a_i}{e_i}.$$
It is a symmetrized KL divergence between the two binned distributions. A common rule of thumb reads below 0.1 as stable, 0.1 to 0.25 as a moderate shift and above 0.25 as a large one. It is a convention, not a statistical test.`,
        },
        {
          kind: 'numeric',
          q: md`A binary feature was "yes" for 50% of training rows and is "yes" for 70% of this week's traffic. Compute the PSI over the two bins.`,
          answer: { kind: 'number', value: 0.16946, tol: 1e-3 },
          explain: md`$(0.7 - 0.5)\ln\frac{0.7}{0.5} + (0.3 - 0.5)\ln\frac{0.3}{0.5} = 0.2 \times 0.3365 + 0.2 \times 0.5108 = 0.1695$: a moderate shift by the rule of thumb.`,
        },
        {
          kind: 'text',
          md: md`### Monitoring a deployed model

- **Data quality**: schema, missing rates, value ranges, freshness of each input.
- **Input drift**: PSI or a Kolmogorov–Smirnov statistic per important feature, against the training distribution.
- **Prediction drift**: the distribution of scores and the rate of positive decisions.
- **Performance**: accuracy, calibration and business metrics once labels arrive, which can take days (returns, defaults, churn). Track them per segment, since an average can hide a failing slice.
- **Response**: alert thresholds, then a retraining policy (on a schedule, or triggered by drift), deployed through shadow mode or a canary before full rollout.`,
        },
        {
          kind: 'callout',
          tone: 'warning',
          title: 'Feedback loops',
          md: md`A **feedback loop** arises when the model's decisions shape the data it is later trained on.

- A recommender can only collect clicks on items it showed, so popular items gather more data and look better still (exposure bias).
- A credit model never observes whether rejected applicants would have repaid (selective labels).
- More patrols sent to areas a model flags produce more recorded incidents there, which the next model learns from.

Mitigations: keep a small randomized exploration slice of traffic; log the probability (propensity) with which each item was shown and use inverse propensity weighting to evaluate new policies offline; keep a holdout group that the model never acts on; monitor coverage and diversity of what the model shows.`,
        },
        {
          kind: 'paper',
          problem: {
            id: 'ml03-3-paper',
            title: 'Sizing an experiment',
            type: 'apply',
            difficulty: 2,
            minutes: 10,
            statement: md`A search page has a click-through rate of $4\%$ per user. A new ranker should be detected if it raises the rate by 0.4 percentage points (10% relative), with $\alpha = 0.05$ two-sided and 80% power. About 20,000 eligible users arrive per day and are split 50/50.

(a) Use $n \approx 16\,p(1-p)/\delta^2$ to find the users needed per arm. (b) How many days does that take, and how long would you actually run the test? Enter the answer to (a).`,
            solution: [
              md`$\sigma^2 = p(1-p) = 0.04 \times 0.96 = 0.0384$ and $\delta = 0.004$, so $\delta^2 = 1.6 \times 10^{-5}$.`,
              md`$n = 16 \times 0.0384 / (1.6 \times 10^{-5}) = 38{,}400$ users per arm. (The exact formula with $z$ values gives about 37,700.)`,
              md`Each arm receives 10,000 users per day, so the sample is reached in $3.84$ days.`,
              md`Run at least 7 days anyway: a full weekly cycle averages over weekday and weekend behaviour, and it gives time to check for novelty effects. Decide the duration before starting, and do not stop early because the result looks significant.`,
            ],
            answer: { kind: 'number', value: 38400, tol: 0.02 },
            rubric: [md`Correct $\sigma^2$ and $\delta$ (absolute, not relative)`, md`Correct sample size per arm`, md`Duration rounded up to whole weeks, with the reason`],
          },
        },
        {
          kind: 'recall',
          prompt: md`Define covariate shift, label shift and concept drift in terms of $p(\bx)$, $p(y)$, $p(y \mid \bx)$ and $p(\bx \mid y)$. For each, say which monitoring signal reveals it.`,
          answer: md`Covariate shift: $p(\bx)$ changes, $p(y\mid\bx)$ fixed; visible in input drift (PSI/KS on features). Label shift: $p(y)$ changes, $p(\bx\mid y)$ fixed; visible in input drift and in the predicted positive rate. Concept drift: $p(y\mid\bx)$ changes; invisible in inputs, visible only in performance on fresh labels or in outcome proxies.`,
        },
        {
          kind: 'explain',
          prompt: md`An interviewer asks: *design an A/B test for a change to the ranking model of a search engine.* Give a structured answer.`,
          model: md`State the hypothesis and fix metrics before launch: a primary metric such as successful sessions per user (a click with a long dwell, or a purchase), secondary metrics such as clicks at top positions and queries per session, and guardrails such as latency, zero-result rate and revenue. Randomize by user (or logged-in account), so each user sees one ranker and per-user outcomes can be measured; analyse at that level, using the delta method for ratio metrics. Size the test from the baseline variance and the minimum effect worth shipping ($n \approx 16\sigma^2/\delta^2$ per arm), possibly reducing variance with pre-period covariates (CUPED), and run whole weeks to cover weekly cycles and novelty. Before reading results, check for sample ratio mismatch and run an A/A test if the platform is new. Do not stop early on a significant reading unless the design is sequential. Ship if the primary metric improves significantly and no guardrail regresses, and keep a small long-term holdout to measure the lasting effect.`,
        },
      ],
      cards: [
        { id: 'ml03-3-c1', kind: 'concept', front: md`Why can an offline metric improve while the A/B test shows no gain?`, back: md`The offline data were collected under the old system (selection and position bias), the metric is only a proxy for the business outcome, and online effects such as latency, novelty and changed user behaviour are absent offline.` },
        { id: 'ml03-3-c2', kind: 'compute', front: md`Rule of thumb: users per arm for $\sigma^2 = 0.25$ and $\delta = 0.01$ ($\alpha = 0.05$, power 0.8)?`, answer: { kind: 'number', value: 40000 }, back: md`$n \approx 16 \times 0.25 / 0.0001 = 40{,}000$.` },
        { id: 'ml03-3-c3', kind: 'cloze', text: md`Halving the minimum detectable effect multiplies the required sample size by {{}}.`, answers: ['4'] },
        { id: 'ml03-3-c4', kind: 'concept', front: md`Which distribution shift is invisible to input monitoring, and why?`, back: md`Concept drift: $p(y\mid\bx)$ changes while $p(\bx)$ can stay the same, so only fresh labels or outcome proxies reveal it.` },
        { id: 'ml03-3-c5', kind: 'concept', front: md`What is a feedback loop in a deployed model? Give one mitigation.`, back: md`The model's decisions shape its future training data (e.g. a recommender only observes clicks on items it showed). Mitigations: a randomized exploration slice, logging propensities and using inverse propensity weighting, an untouched holdout group.` },
      ],
    },
  ],
  problems: [
    {
      id: 'ml03-p1',
      title: 'Derive the bias–variance decomposition',
      type: 'derive',
      difficulty: 2,
      minutes: 12,
      statement: md`Let $y = f(\bx) + \varepsilon$ with $\E[\varepsilon] = 0$, $\Var(\varepsilon) = \sigma^2$, the noise of the test label independent of the training set $\mathcal{D}$. Prove that $$\E_{\mathcal{D},\varepsilon}\big[(y - \hat f_{\mathcal{D}}(\bx))^2\big] = \sigma^2 + \big(\bar f(\bx) - f(\bx)\big)^2 + \E_{\mathcal{D}}\big[(\hat f_{\mathcal{D}}(\bx) - \bar f(\bx))^2\big],$$ where $\bar f = \E_{\mathcal{D}}[\hat f_{\mathcal{D}}]$. State where each assumption is used.`,
      hints: [md`Write $y - \hat f = \varepsilon + (f - \bar f) + (\bar f - \hat f)$.`],
      solution: [
        md`Write $y - \hat f = \varepsilon + (f - \bar f) + (\bar f - \hat f)$, suppressing $\bx$.`,
        md`Square: $\varepsilon^2 + (f - \bar f)^2 + (\bar f - \hat f)^2 + 2\varepsilon(f - \bar f) + 2\varepsilon(\bar f - \hat f) + 2(f - \bar f)(\bar f - \hat f)$.`,
        md`$\E[\varepsilon^2] = \sigma^2$ uses $\E[\varepsilon] = 0$ and $\Var(\varepsilon) = \sigma^2$. $\E[2\varepsilon(f - \bar f)] = 0$ since $f - \bar f$ is a constant and $\E[\varepsilon] = 0$.`,
        md`$\E[2\varepsilon(\bar f - \hat f)] = 2\E[\varepsilon]\E[\bar f - \hat f] = 0$ uses independence of the test noise and $\mathcal{D}$.`,
        md`$\E_{\mathcal{D}}[2(f - \bar f)(\bar f - \hat f)] = 2(f - \bar f)(\bar f - \E_{\mathcal{D}}\hat f) = 0$ by the definition of $\bar f$.`,
        md`The remaining terms are $\sigma^2 + (f - \bar f)^2 + \E[(\hat f - \bar f)^2]$, which is the claim.`,
      ],
      rubric: [md`Correct add-and-subtract decomposition`, md`All three cross terms shown to vanish, each with its reason`, md`Independence of the test noise and the training set used explicitly`],
      areas: ['ml-depth'],
    },
    {
      id: 'ml03-p2',
      title: 'Bias and variance from five refits',
      type: 'compute',
      difficulty: 1,
      minutes: 5,
      statement: md`A model is retrained on five bootstrap datasets. At $x_0$ the true value is $f(x_0) = 1$ and the five predictions are $0.6,\ 1.4,\ 1.0,\ 1.8,\ 1.2$. The noise variance is $0.3$. Compute bias², variance and the expected squared error at $x_0$. Enter the three numbers.`,
      solution: [md`Average prediction $\bar f = 6.0/5 = 1.2$, so bias² $= 0.2^2 = 0.04$.`, md`Deviations from 1.2: $-0.6, 0.2, -0.2, 0.6, 0$. Variance $= (0.36 + 0.04 + 0.04 + 0.36 + 0)/5 = 0.16$.`, md`Expected squared error $= 0.3 + 0.04 + 0.16 = 0.5$.`],
      answer: { kind: 'vector', value: [0.04, 0.16, 0.5] },
    },
    {
      id: 'ml03-p3',
      title: 'Shrinking an estimate can lower its error',
      type: 'derive',
      difficulty: 2,
      minutes: 12,
      statement: md`You estimate a mean $\mu$ from $n$ independent observations with variance $\sigma^2$ using $\hat\mu_c = c\,\bar x$ for a constant $c$.

(a) Compute the bias, the variance and the mean squared error of $\hat\mu_c$.
(b) Find the $c$ that minimizes the MSE.
(c) For $\mu = 2$, $\sigma^2 = 4$, $n = 4$, compute the optimal $c$ and compare its MSE with that of $\bar x$. Enter the optimal $c$.`,
      hints: [md`$\E[\bar x] = \mu$, $\Var(\bar x) = \sigma^2/n$.`],
      solution: [
        md`(a) $\E[\hat\mu_c] = c\mu$, so bias $= (c - 1)\mu$. $\Var(\hat\mu_c) = c^2\sigma^2/n$. MSE $= (c-1)^2\mu^2 + c^2\sigma^2/n$.`,
        md`(b) Differentiate: $2(c - 1)\mu^2 + 2c\sigma^2/n = 0$, so $c^* = \dfrac{\mu^2}{\mu^2 + \sigma^2/n}$, which is below 1.`,
        md`(c) $\sigma^2/n = 1$, so $c^* = 4/5 = 0.8$. MSE$(0.8) = 0.04 \times 4 + 0.64 \times 1 = 0.8$, while MSE$(1) = \sigma^2/n = 1$.`,
        md`A small bias bought a larger drop in variance. The catch is that $c^*$ depends on the unknown $\mu$; ridge regression makes the same trade with a penalty tuned on validation data.`,
      ],
      answer: { kind: 'number', value: 0.8 },
      rubric: [md`Bias and variance of $c\bar x$ correct`, md`MSE minimized by differentiation, $c^*$ correct`, md`Numerical comparison with the unbiased estimator`],
      areas: ['ml-depth', 'math'],
    },
    {
      id: 'ml03-p4',
      title: 'Counting fits',
      type: 'compute',
      difficulty: 1,
      minutes: 5,
      statement: md`You have 1,200 labelled rows. You hold out 20% as a test set, run 6-fold cross-validation on the rest over a grid of 3 learning rates × 4 tree depths, and refit the best setting on all non-test rows. (a) How many rows does each CV model train on? (b) How many models are trained in total? Enter both numbers.`,
      solution: [md`Non-test rows: $0.8 \times 1200 = 960$. Each fold holds $960/6 = 160$ rows, so each CV model trains on $5 \times 160 = 800$ rows.`, md`The grid has $3 \times 4 = 12$ settings, each fitted 6 times: 72 fits. Plus one refit: 73.`],
      answer: { kind: 'vector', value: [800, 73] },
    },
    {
      id: 'ml03-p5',
      title: 'Target encoding without leakage',
      type: 'concept',
      difficulty: 2,
      minutes: 10,
      statement: md`A categorical feature \`merchant_id\` has 50,000 values. You replace each value by the mean of the binary label over the training rows with that merchant (target encoding), then run 5-fold CV. (a) Explain why the CV score is optimistic, especially for merchants with few rows. (b) Describe an encoding scheme that removes the leak. (c) What additional problem remains for rare merchants, and how is it usually handled?`,
      solution: [
        md`(a) Each row's encoded value includes its own label. A merchant with a single row gets an encoding equal to that row's label, which is a perfect feature in training and in the validation folds if the encoding was computed before splitting. Even with the encoding fitted inside the training folds, a model trained on in-sample encodings learns to trust them more than it should.`,
        md`(b) Out-of-fold encoding: inside each training fold, split it again into $K$ parts and encode each part with statistics from the other parts only; encode the validation fold with statistics from the whole training fold. Equivalently, a leave-one-out mean that excludes the row itself, or an ordered (time-based) scheme that uses only earlier rows, as CatBoost does.`,
        md`(c) Rare merchants have noisy means. Shrink toward the global mean: $\text{enc} = \frac{n_m \bar y_m + a\,\bar y}{n_m + a}$ with a smoothing count $a$, so a merchant with few rows gets nearly the global rate.`,
      ],
      rubric: [md`Identifies that the row's own label enters its encoding`, md`Proposes out-of-fold, leave-one-out or ordered encoding`, md`Proposes smoothing toward the global mean for rare categories`],
      areas: ['ml-breadth'],
    },
    {
      id: 'ml03-p6',
      title: 'Twenty metrics, one false alarm',
      type: 'compute',
      difficulty: 1,
      minutes: 5,
      statement: md`An A/B test with no real effect reports 20 independent metrics, each tested at $\alpha = 0.05$. (a) What is the probability that at least one is "significant"? (b) What per-metric threshold does the Bonferroni correction use to keep that probability at most 0.05? Enter both numbers.`,
      solution: [md`(a) $P(\text{no false positive}) = 0.95^{20} = 0.3585$, so $P(\text{at least one}) = 1 - 0.3585 = 0.6415$.`, md`(b) Bonferroni divides $\alpha$ by the number of tests: $0.05/20 = 0.0025$. By the union bound, the chance of any false positive is then at most $20 \times 0.0025 = 0.05$.`],
      answer: { kind: 'vector', value: [0.64151, 0.0025], tol: 1e-3 },
    },
    {
      id: 'ml03-p7',
      title: 'How long to run the test',
      type: 'apply',
      difficulty: 2,
      minutes: 8,
      statement: md`An ads team wants to detect a 5% relative lift in click-through rate from a baseline of 8%, with $\alpha = 0.05$ and 80% power. 30,000 users per day enter the experiment, split evenly. Using $n \approx 16\,p(1-p)/\delta^2$, find the users needed per arm, then the number of days, and say how long you would run it. Enter the users per arm.`,
      solution: [md`$\delta = 0.05 \times 0.08 = 0.004$ (absolute). $\sigma^2 = 0.08 \times 0.92 = 0.0736$.`, md`$n = 16 \times 0.0736 / 0.000016 = 73{,}600$ per arm.`, md`Each arm gets 15,000 users per day: $73{,}600/15{,}000 \approx 4.9$ days.`, md`Run 7 days (one full week), fixed in advance, to cover weekly patterns and to watch for novelty effects.`],
      answer: { kind: 'number', value: 73600, tol: 0.02 },
      areas: ['system-design'],
    },
    {
      id: 'ml03-p8',
      title: 'Folds without positives',
      type: 'compute',
      difficulty: 2,
      minutes: 8,
      statement: md`A dataset has 20 rows, 2 of them positive. You split it at random (no stratification) into 5 folds of 4. (a) What is the probability that a given fold contains no positive? (b) What is the expected number of folds with no positive? Enter both numbers.`,
      hints: [md`The fold is a random subset of 4 of the 20 rows. Count subsets that avoid both positives.`],
      solution: [md`(a) The fold is equally likely to be any of $\binom{20}{4} = 4845$ subsets; $\binom{18}{4} = 3060$ of them avoid both positives. Probability $3060/4845 = 0.6316$.`, md`(b) By linearity of expectation, the expected count is $5 \times 0.6316 = 3.158$. With only 2 positives, at least 3 folds must be empty anyway; stratification makes it exactly 3 and guarantees the 2 positives are in different folds.`],
      answer: { kind: 'vector', value: [0.63158, 3.1579], tol: 1e-3 },
    },
    {
      id: 'ml03-p9',
      title: 'Population stability index',
      type: 'compute',
      difficulty: 1,
      minutes: 5,
      statement: md`A model score was binned into low/medium/high with training fractions $0.2,\ 0.5,\ 0.3$. This week the fractions are $0.1,\ 0.5,\ 0.4$. Compute the PSI.`,
      solution: [md`Low: $(0.1 - 0.2)\ln(0.1/0.2) = (-0.1)(-0.6931) = 0.0693$. Medium: $0$.`, md`High: $(0.4 - 0.3)\ln(0.4/0.3) = 0.1 \times 0.2877 = 0.0288$.`, md`PSI $= 0.0981$: below 0.1, stable by the usual rule of thumb, though worth watching.`],
      answer: { kind: 'number', value: 0.09808, tol: 1e-3 },
    },
    {
      id: 'ml03-p10',
      title: 'Training error is optimistic by exactly 2σ²p/n',
      type: 'proof',
      difficulty: 3,
      minutes: 20,
      statement: md`Fixed-design linear regression: $\by = X\boldsymbol{\beta} + \boldsymbol{\varepsilon}$ with $X \in \R^{n\times p}$ of rank $p$, $\E[\boldsymbol{\varepsilon}] = \bzero$, $\Cov(\boldsymbol{\varepsilon}) = \sigma^2 I$. Least squares gives $\hat\by = H\by$ with the hat matrix $H = X(X\T X)^{-1}X\T$.

(a) Show $\E\big[\tfrac1n\lVert\by - \hat\by\rVert^2\big] = \sigma^2(1 - p/n)$.
(b) For fresh labels $\by' = X\boldsymbol{\beta} + \boldsymbol{\varepsilon}'$ at the same inputs, show $\E\big[\tfrac1n\lVert\by' - \hat\by\rVert^2\big] = \sigma^2(1 + p/n)$.
(c) Conclude that the expected gap between test and training error is $2\sigma^2 p/n$.`,
      hints: [md`$H$ is symmetric and idempotent, $HX = X$, and $\tr(H) = p$. For a random vector with covariance $\sigma^2 I$, $\E[\boldsymbol{\varepsilon}\T A\boldsymbol{\varepsilon}] = \sigma^2\tr(A)$.`],
      solution: [
        md`$HX = X(X\T X)^{-1}X\T X = X$, so $\by - \hat\by = (I - H)(X\boldsymbol{\beta} + \boldsymbol{\varepsilon}) = (I - H)\boldsymbol{\varepsilon}$.`,
        md`$I - H$ is symmetric and idempotent, so $\lVert(I-H)\boldsymbol{\varepsilon}\rVert^2 = \boldsymbol{\varepsilon}\T(I - H)\boldsymbol{\varepsilon}$, with expectation $\sigma^2\tr(I - H) = \sigma^2(n - \tr H)$.`,
        md`$\tr H = \tr\big((X\T X)^{-1}X\T X\big) = \tr(I_p) = p$, using $\tr(AB) = \tr(BA)$. Dividing by $n$ gives (a): $\sigma^2(1 - p/n)$.`,
        md`(b) $\by' - \hat\by = \boldsymbol{\varepsilon}' - H\boldsymbol{\varepsilon}$. The cross term has zero mean because $\boldsymbol{\varepsilon}'$ is independent of $\boldsymbol{\varepsilon}$. So the expectation is $\E\lVert\boldsymbol{\varepsilon}'\rVert^2 + \E[\boldsymbol{\varepsilon}\T H\boldsymbol{\varepsilon}] = n\sigma^2 + p\sigma^2$; divide by $n$.`,
        md`(c) The difference is $\sigma^2(1 + p/n) - \sigma^2(1 - p/n) = 2\sigma^2 p/n$. Training error understates test error more when the model has more parameters per data point, which is the formal reason training error cannot be used for model selection (and the basis of Mallows' $C_p$ and AIC).`,
      ],
      rubric: [md`Residual written as $(I - H)\boldsymbol{\varepsilon}$ using $HX = X$`, md`Expected quadratic form computed via the trace, with $\tr H = p$ justified`, md`Independence of the fresh noise used for the cross term in (b)`, md`Correct gap $2\sigma^2p/n$ and its interpretation`],
      areas: ['ml-depth', 'math'],
    },
  ],
};
