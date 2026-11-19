import { md, type Module } from '../types';

export const MODULE: Module = {
  id: 'ml04',
  part: 'ml',
  order: 4,
  title: 'Trees and ensembles',
  summary: 'Decision trees grown greedily by impurity decrease, bagging and random forests as variance reduction, and boosting (AdaBoost, gradient boosting, XGBoost and LightGBM) as stagewise bias reduction.',
  relevance: md`Gradient-boosted trees (XGBoost, LightGBM, CatBoost) are the default model for tabular data: ranking features, fraud and risk scores, click-through prediction, forecasting with engineered features. Interviews ask you to compute Gini and information gain by hand, explain random forests versus gradient boosting, derive why boosting fits residuals, tune the main hyperparameters, and explain why tree ensembles still beat neural networks on most tabular problems.`,
  prereqs: ['ml03'],
  areas: ['ml-breadth', 'ml-depth', 'ml-coding'],
  lessons: [
    // ------------------------------------------------------------------ 4.1
    {
      id: 'ml04-1',
      title: 'Decision trees: impurity and greedy splits',
      minutes: 40,
      objectives: [
        'Compute the Gini impurity and the entropy of a node from its class counts.',
        'Compute the impurity decrease (information gain) of a split by hand.',
        'Describe greedy split search over features and thresholds, and its cost.',
        'Explain how depth controls overfitting, and how regression trees choose splits and leaf values.',
      ],
      cells: [
        {
          kind: 'text',
          md: md`A loan officer's rule "reject if income is below 40k and the debt ratio is above 0.4" is a small decision tree. A **decision tree** asks a sequence of yes/no questions of the form $x_j \le t$. Each question splits the data in two, and the final groups, the **leaves**, make a prediction: the majority class (or the class proportions) for classification, the mean label for regression.

Geometrically, a tree partitions feature space into axis-aligned boxes and predicts a constant in each. Learning a tree means choosing the questions. The standard algorithm (CART) does it greedily, one split at a time, picking the split that makes the two children as **pure** as possible.`,
        },
        {
          kind: 'callout',
          tone: 'definition',
          title: 'Impurity of a node',
          md: md`Let a node contain classes in proportions $p_1, \dots, p_K$.
$$\text{Gini: } G = 1 - \sum_k p_k^2 = \sum_k p_k(1 - p_k), \qquad \text{entropy: } H = -\sum_k p_k \log_2 p_k.$$
Both are 0 for a pure node and largest for an even mix: for two classes at 50/50, $G = 0.5$ and $H = 1$ bit. A third measure, the misclassification rate $1 - \max_k p_k$, is used for pruning but rarely for growing, because it is not sensitive enough to changes in the proportions.`,
        },
        {
          kind: 'callout',
          tone: 'intuition',
          md: md`Gini is the probability that two labels drawn at random (with replacement) from the node disagree. Entropy is the average number of bits needed to write down a label drawn from the node. Both measure how mixed the node is.`,
        },
        {
          kind: 'numeric',
          q: md`A node holds 6 positive and 2 negative examples. Compute its Gini impurity and its entropy (in bits), in that order.`,
          answer: { kind: 'vector', value: [0.375, 0.81128], tol: 1e-3 },
          inputHint: 'two numbers',
          explain: md`$p = (0.75, 0.25)$. Gini $= 1 - 0.5625 - 0.0625 = 0.375$. Entropy $= -0.75\log_2 0.75 - 0.25\log_2 0.25 = 0.3113 + 0.5 = 0.8113$ bits.`,
        },
        {
          kind: 'callout',
          tone: 'definition',
          title: 'Impurity decrease',
          md: md`A split sends $n_L$ of the node's $n$ examples left and $n_R$ right. Its quality is the drop in impurity, weighting each child by its share of the examples:
$$\Delta I = I(\text{parent}) - \frac{n_L}{n}\,I(L) - \frac{n_R}{n}\,I(R).$$
With entropy, $\Delta I$ is called the **information gain**. CART picks, at each node, the feature and threshold with the largest $\Delta I$.`,
        },
        {
          kind: 'viz',
          viz: { type: 'ml.tree-split', crit: 'gini' },
          task: md`Before stepping, turn on **try your own split** and find the best root split by hand with the slider. Then step through the tree. At each step, find the minimum of the candidate curves and check that it matches the chosen split. Finally switch to **entropy**: does the root split change?`,
          caption: md`Each dot in the lower plot is one candidate threshold (a midpoint between two consecutive values of $x_1$ or $x_2$ in the highlighted node). The greedy rule takes the lowest point. The tree diagram shows class counts (class 0 | class 1) in every node.`,
        },
        {
          kind: 'numeric',
          q: md`In the figure, the root (10 of each class) is split by $x_1 \le 6.5$ into a left child with counts $9 \mid 4$ and a right child with counts $1 \mid 6$. Compute the Gini impurity decrease $\Delta I$.`,
          answer: { kind: 'number', value: 0.137363, tol: 1e-3 },
          hints: [md`$G(L) = 1 - (9/13)^2 - (4/13)^2 = 72/169$ and $G(R) = 1 - (1/7)^2 - (6/7)^2 = 12/49$.`],
          explain: md`Weighted child impurity: $\frac{13}{20}\cdot\frac{72}{169} + \frac{7}{20}\cdot\frac{12}{49} = 0.2769 + 0.0857 = 0.3626$. The parent has $G = 0.5$, so $\Delta I = 0.1374$.`,
        },
        {
          kind: 'check',
          q: md`With entropy, the figure's root split becomes $x_2 \le 2.5$ (children $4 \mid 0$ and $6 \mid 10$) instead of $x_1 \le 6.5$. Which statement is correct?`,
          options: [
            md`Entropy rises more steeply than Gini near a pure node, so it rewards the pure $4 \mid 0$ child more; the two criteria usually agree, and disagree only on close calls like this one`,
            md`Entropy and Gini always choose the same split, so the figure must be wrong`,
            md`Entropy prefers splits that produce children of equal size`,
            md`Gini cannot be used with numeric features`,
          ],
          answer: 0,
          explain: md`Both are concave and peak at 50/50, but $-p\log_2 p$ has infinite slope at $p = 0$, so moving a child toward purity lowers entropy faster. In practice the two criteria select the same split in most cases; the choice rarely changes accuracy much. Gini is slightly cheaper (no logarithm), which is why it is a common default.`,
        },
        {
          kind: 'derive',
          title: 'a split never increases weighted Gini impurity',
          goal: md`Show that $\Delta I \ge 0$ for every split under the Gini impurity, with equality only when both children have the same class proportions as the parent.`,
          steps: [
            {
              md: md`Let $\bp, \bp_L, \bp_R$ be the class-proportion vectors and $w = n_L/n$. Counting the examples of each class gives $$\bp = w\,\bp_L + (1 - w)\,\bp_R.$$`,
              choose: {
                prompt: md`How are the parent's proportions related to the children's?`,
                options: [md`A weighted average, with weights $n_L/n$ and $n_R/n$`, md`An unweighted average $(\bp_L + \bp_R)/2$`, md`The elementwise maximum of $\bp_L$ and $\bp_R$`],
                answer: 0,
                explain: md`The number of class-$k$ examples in the parent is $n_L p_{L,k} + n_R p_{R,k}$. Divide by $n$.`,
              },
            },
            { md: md`$G(\bp) = 1 - \lVert\bp\rVert^2$. The squared norm is strictly convex, so $G$ is strictly **concave**.` },
            {
              md: md`By concavity (Jensen's inequality), $$G\big(w\bp_L + (1-w)\bp_R\big) \ge w\,G(\bp_L) + (1 - w)\,G(\bp_R),$$ which is exactly $\Delta I \ge 0$. Strict concavity gives equality only when $\bp_L = \bp_R$.`,
              choose: {
                prompt: md`Which property of $G$ turns "average of the inputs" into "at least the average of the outputs"?`,
                options: [md`Concavity`, md`Convexity`, md`Monotonicity`],
                answer: 0,
                explain: md`For a concave function, the value at a weighted average is at least the weighted average of the values. Entropy is concave too, so the same holds for information gain.`,
              },
            },
          ],
          takeaway: md`Splitting never makes the training impurity worse, so a tree grown without limits keeps splitting until every leaf is pure. Only stopping rules (maximum depth, minimum samples per leaf, minimum decrease) or pruning prevent it from fitting the noise.`,
        },
        {
          kind: 'text',
          md: md`### Greedy split search

At a node with $n$ examples and $d$ features: for each feature, sort the examples by that feature, then sweep the thresholds (midpoints between consecutive distinct values) from left to right, moving one example at a time from the right child to the left and updating the class counts. Each threshold then costs $O(1)$, so a node costs $O(d\,n\log n)$, dominated by sorting. Libraries such as LightGBM and XGBoost's \`hist\` method bin each feature into at most a few hundred values once, which makes the sweep $O(d \times \text{bins})$.

The search is greedy: each split is best given the splits above it, with no look-ahead. Finding the smallest tree consistent with the data is NP-complete (Hyafil and Rivest, 1976), so greedy growth is the practical choice. Note that trees only compare a feature with thresholds: any monotone rescaling of a feature gives the same tree, so trees need no feature standardization.`,
        },
        {
          kind: 'check',
          q: md`Four equally sized groups of points form an XOR pattern: class 1 in the top-left and bottom-right quadrants, class 0 in the other two. What is the Gini decrease of the best single axis-aligned split at the root through the centre?`,
          options: [md`0`, md`0.25`, md`0.5`, md`It depends on the number of points`],
          answer: 0,
          explain: md`Any split through the centre leaves each child 50/50, so the children have impurity 0.5 like the parent. Greedy search sees no gain, although two levels of splits classify XOR perfectly. Off-centre splits gain almost nothing with real data. This is the classic limit of greedy, one-step search.`,
        },
        {
          kind: 'text',
          md: md`### Depth and overfitting

A deep tree has low bias and high variance: it can carve a box around every training point, and a small change in the data can change the top split and everything below it. The usual controls:

- \`max_depth\`, \`max_leaf_nodes\`: cap the size of the tree;
- \`min_samples_leaf\`, \`min_samples_split\`: forbid tiny leaves;
- \`min_impurity_decrease\`: refuse splits that gain too little;
- **cost-complexity pruning**: grow a large tree, then remove subtrees to minimize $R(T) + \alpha\,|\text{leaves}(T)|$, where $R$ is the training error and $\alpha$ is chosen by cross-validation.`,
        },
        {
          kind: 'viz',
          viz: { type: 'ml.tree-depth', depth: 3 },
          task: md`Increase the depth until the training accuracy reaches 1. What happens to the test accuracy, and to the shape of the regions? Then set the depth to 14 and raise **min samples per leaf** to 10.`,
          caption: md`150 training points from a circle with 12% of labels flipped. Training accuracy keeps rising with depth (the derivation above); test accuracy peaks at a moderate depth and then falls as the tree isolates flipped labels.`,
        },
        {
          kind: 'text',
          md: md`### Regression trees

For a numeric target, a node's impurity is its sum of squared errors around the node mean, $\text{SSE} = \sum_{i \in \text{node}} (y_i - \bar y)^2$, and each leaf predicts the mean of its examples. A split is chosen to maximize the drop in SSE. The sweep is just as cheap: keep running sums $\sum y$ and $\sum y^2$ on each side, since $\text{SSE} = \sum y^2 - (\sum y)^2/n$.`,
        },
        {
          kind: 'viz',
          viz: { type: 'ml.regtree-1d', depth: 1 },
          task: md`Start at depth 1: where is the single split, and what are the two leaf values? Increase the depth one step at a time and watch the training SSE and the test MSE. At which depth is the test MSE lowest?`,
          caption: md`The tree's prediction is a step function. Each new level can split every leaf again, so the number of steps can double per level.`,
        },
        {
          kind: 'numeric',
          q: md`A regression node holds the labels $1, 2, 3, 10, 11, 12$ (sorted by the feature). By how much does the SSE drop if you split between 3 and 10?`,
          answer: { kind: 'number', value: 121.5 },
          explain: md`Parent mean 6.5: SSE $= 2(5.5^2 + 4.5^2 + 3.5^2) = 125.5$. Each child has mean 2 or 11 and SSE $1 + 0 + 1 = 2$. The drop is $125.5 - 4 = 121.5$.`,
        },
        {
          kind: 'paper',
          problem: {
            id: 'ml04-1-paper',
            title: 'Best threshold by hand',
            type: 'compute',
            difficulty: 2,
            minutes: 12,
            statement: md`One feature and a binary label:

| $x$ | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 |
|---|---|---|---|---|---|---|---|---|
| $y$ | 0 | 0 | 1 | 0 | 1 | 1 | 1 | 0 |

Compute the weighted Gini impurity of the children for every threshold $t \in \{1.5, 2.5, \dots, 7.5\}$ and give the best threshold. Enter the threshold.`,
            hints: [md`Sweep left to right and keep the counts of each class on the left; the right counts are the totals (4 and 4) minus the left counts.`],
            solution: [
              md`The parent has 4 of each class, so $G = 0.5$. For each $t$ list (left counts 0|1, right counts 0|1):`,
              md`$t = 1.5$: $1|0$, $3|4$: weighted $= \frac18\cdot 0 + \frac78\big(1 - \frac{9}{49} - \frac{16}{49}\big) = \frac78\cdot\frac{24}{49} = 0.4286$.`,
              md`$t = 2.5$: $2|0$, $2|4$: weighted $= \frac68\big(1 - \frac{4}{36} - \frac{16}{36}\big) = \frac68\cdot\frac49 = 0.3333$.`,
              md`$t = 3.5$: $2|1$, $2|3$: $\frac38\cdot\frac49 + \frac58\cdot\frac{12}{25} = 0.1667 + 0.3 = 0.4667$. $t = 4.5$: $3|1$, $1|3$: $2 \cdot \frac48 \cdot \frac38 = 0.375$.`,
              md`$t = 5.5$: $3|2$, $1|2$: $0.4667$. $t = 6.5$: $3|3$, $1|1$: $0.5$. $t = 7.5$: $3|4$, $1|0$: $0.4286$.`,
              md`The minimum is $0.3333$ at $t = 2.5$, a decrease of $0.1667$. The left child is pure.`,
            ],
            answer: { kind: 'number', value: 2.5 },
            rubric: [md`Counts on both sides correct for every threshold`, md`Children weighted by their sizes`, md`Best threshold and its impurity identified`],
          },
        },
        {
          kind: 'exercise',
          ex: {
            id: 'ml04-ex-best-split',
            title: 'Best Gini split of one feature, vectorized',
            prompt: md`Write \`best_split(x, y)\` for a numeric feature \`x\` and binary labels \`y\` (0/1). Return \`(threshold, weighted_gini)\` for the split $x \le t$ with the smallest weighted Gini impurity of the children, where $t$ is the midpoint between consecutive sorted values. Skip positions where consecutive sorted values are equal. Use \`np.cumsum\` to get the left counts for all thresholds at once; no Python loops. On ties, take the leftmost threshold (\`np.argmin\` does).`,
            starter: `import numpy as np

def best_split(x, y):
    # TODO: sort, cumulative counts, Gini of both sides for every threshold
    return float(np.median(x)), 0.5
`,
            solution: `import numpy as np

def best_split(x, y):
    o = np.argsort(x, kind='stable')
    xs, ys = x[o], y[o]
    n = len(y)
    nl = np.arange(1, n)
    nr = n - nl
    pl = np.cumsum(ys)[:-1]
    pr = ys.sum() - pl
    gl = 1 - (pl / nl) ** 2 - ((nl - pl) / nl) ** 2
    gr = 1 - (pr / nr) ** 2 - ((nr - pr) / nr) ** 2
    w = (nl * gl + nr * gr) / n
    w = np.where(xs[1:] != xs[:-1], w, np.inf)
    j = np.argmin(w)
    return (xs[j] + xs[j + 1]) / 2, w[j]
`,
            tests: [
              { expr: 'np.round(np.array(best_split(np.arange(1, 9), np.array([0, 0, 1, 0, 1, 1, 1, 0]))), 6).tolist()', label: 'the paper problem' },
              { expr: 'np.round(np.array(best_split(np.array([5.0, 1.0, 3.0, 3.0, 8.0, 6.0]), np.array([1, 0, 0, 1, 1, 1]))), 6).tolist()', label: 'unsorted, with a tie in x' },
              { expr: 'np.round(np.array(best_split(np.array([2.5, 0.5, 9.0, 4.0, 7.5, 1.0, 6.0]), np.array([0, 0, 1, 1, 1, 0, 0]))), 6).tolist()', label: 'seven points' },
            ],
            hints: [
              md`After sorting, a split after position $j$ puts \`nl = j + 1\` examples on the left. \`np.arange(1, n)\` gives all left sizes; \`np.cumsum(ys)[:-1]\` gives the positives on the left.`,
              md`Gini of a side with \`m\` examples and \`k\` positives is \`1 - (k/m)**2 - ((m-k)/m)**2\`. Set the impurity to \`np.inf\` where \`xs[1:] == xs[:-1]\`, then take \`np.argmin\`.`,
            ],
            mustExclude: ['for '],
          },
        },
        {
          kind: 'recall',
          prompt: md`Write the Gini impurity and the entropy of a node, their values for a 50/50 binary node, and the formula for the impurity decrease of a split.`,
          answer: md`$G = 1 - \sum_k p_k^2$, $H = -\sum_k p_k\log_2 p_k$; at 50/50, $G = 0.5$ and $H = 1$. $\Delta I = I(\text{parent}) - \frac{n_L}{n}I(L) - \frac{n_R}{n}I(R)$.`,
        },
      ],
      cards: [
        { id: 'ml04-1-c1', kind: 'concept', front: md`Define Gini impurity and entropy of a node with class proportions $p_k$.`, back: md`$G = 1 - \sum_k p_k^2$ (probability two random labels differ); $H = -\sum_k p_k\log_2 p_k$ bits.` },
        { id: 'ml04-1-c2', kind: 'compute', front: md`Gini impurity of a node with 3 positives and 1 negative?`, answer: { kind: 'number', value: 0.375 }, back: md`$1 - 0.75^2 - 0.25^2 = 0.375$.` },
        { id: 'ml04-1-c3', kind: 'cloze', text: md`Entropy of a 50/50 binary node is {{}} bit.`, answers: ['1'] },
        { id: 'ml04-1-c4', kind: 'concept', front: md`How does a CART tree find a split, and what does it cost per node?`, back: md`For each feature, sort and sweep all midpoints, updating class counts (or running sums for regression) incrementally; take the largest impurity decrease. $O(d\,n\log n)$ per node, $O(d \times \text{bins})$ with histograms.` },
        { id: 'ml04-1-c5', kind: 'concept', front: md`Why must tree growth be limited, and name three ways to limit it.`, back: md`Splitting never increases training impurity, so an unlimited tree fits the noise (high variance). Limits: max depth, min samples per leaf, min impurity decrease, max leaves, cost-complexity pruning.` },
      ],
    },
    // ------------------------------------------------------------------ 4.2
    {
      id: 'ml04-2',
      title: 'Bagging and random forests',
      minutes: 30,
      objectives: [
        'Derive the variance of an average of B identically distributed predictors with pairwise correlation ρ.',
        'Explain bootstrap sampling and compute the expected fraction of out-of-bag rows.',
        'Explain how feature subsampling decorrelates the trees of a random forest.',
        'Use the out-of-bag error as a validation estimate and read feature importances with their known biases in mind.',
      ],
      cells: [
        {
          kind: 'text',
          md: md`A fully grown tree has low bias and high variance. Its instability is easy to see: remove a few rows and the best root split can change, and with it the whole tree below. Averaging many noisy estimates reduces variance, but there is only one training set. The bootstrap creates many slightly different training sets from the one you have.`,
        },
        {
          kind: 'callout',
          tone: 'definition',
          title: 'Bootstrap aggregating (bagging)',
          md: md`For $b = 1, \dots, B$: draw a **bootstrap sample** of $n$ rows from the $n$ training rows uniformly **with replacement**, and fit a model $T_b$ to it, usually a deep, unpruned tree. Predict with the average $\frac1B\sum_b T_b(\bx)$ for regression, or the majority vote (or the average of class probabilities) for classification. (Breiman, 1996.)`,
        },
        {
          kind: 'viz',
          viz: { type: 'ml.bagging', B: 1 },
          task: md`Start with $B = 1$ and compare the single tree with the dashed truth. Increase $B$ to 5, 20, 100. How much does the test MSE fall, and does it keep falling? Compare the OOB curve with the test curve.`,
          caption: md`Every purple curve interpolates its own bootstrap sample. Their average (blue) is smoother and closer to the truth. The test error drops quickly and then levels off: the remaining error comes from bias, noise and the correlation between the trees.`,
        },
        {
          kind: 'derive',
          title: 'variance of an average of correlated predictors',
          goal: md`Let $T_1, \dots, T_B$ each have variance $\sigma^2$ and pairwise correlation $\rho$. Show $\Var\big(\frac1B\sum_b T_b\big) = \rho\sigma^2 + \frac{1-\rho}{B}\sigma^2$.`,
          steps: [
            { md: md`The variance of a sum is the sum of all covariances: $$\Var\Big(\frac1B\sum_b T_b\Big) = \frac{1}{B^2}\sum_{b=1}^B\sum_{c=1}^B \Cov(T_b, T_c).$$` },
            {
              md: md`There are $B$ diagonal terms equal to $\sigma^2$ and $B(B-1)$ off-diagonal terms equal to $\rho\sigma^2$: $$\frac{1}{B^2}\big(B\sigma^2 + B(B-1)\rho\sigma^2\big).$$`,
              choose: {
                prompt: md`How many off-diagonal pairs $(b, c)$ with $b \ne c$ are there, and what is each covariance?`,
                options: [md`$B(B-1)$ pairs, each $\rho\sigma^2$`, md`$B(B-1)/2$ pairs, each $\rho$`, md`$B^2$ pairs, each $\rho\sigma^2$`],
                answer: 0,
                explain: md`The double sum counts ordered pairs, so $(b, c)$ and $(c, b)$ both appear: $B^2 - B$ of them. Covariance is correlation times the two standard deviations, $\rho\sigma\cdot\sigma$.`,
              },
            },
            { md: md`Simplify: $\frac{\sigma^2}{B} + \frac{B-1}{B}\rho\sigma^2 = \rho\sigma^2 + \frac{1 - \rho}{B}\sigma^2.$` },
            {
              md: md`Read off the limits. $\rho = 0$: $\sigma^2/B$, the familiar rate. $\rho = 1$: $\sigma^2$, no gain at all. $B \to \infty$: the variance falls to $\rho\sigma^2$ and no further.`,
              choose: {
                prompt: md`With very many trees, what limits the variance of the average?`,
                options: [md`The correlation between trees: the floor is $\rho\sigma^2$`, md`Nothing: it goes to 0`, md`The bias of each tree`],
                answer: 0,
                explain: md`The second term vanishes as $B$ grows, the first does not. To go lower, the trees must be made less correlated. Bias is a separate term of the error and is not changed by averaging.`,
              },
            },
          ],
          takeaway: md`Adding trees removes only the $\frac{1-\rho}{B}\sigma^2$ term. Random forests attack the floor $\rho\sigma^2$ by making trees less alike.`,
        },
        {
          kind: 'viz',
          viz: { type: 'ml.corr-average', rho: 0.5, B: 10 },
          task: md`With $\rho = 0.5$, how much variance is left at $B = 200$? Now lower $\rho$ to $0.1$: how many trees do you need to get below the $\rho = 0.5$ floor?`,
          caption: md`The orange dots are a Monte Carlo check: averages of $B$ simulated predictors with correlation $\rho$, 600 repetitions each.`,
        },
        {
          kind: 'numeric',
          q: md`Each tree's prediction at a point has variance $4$, and the pairwise correlation between trees is $0.25$. What is the variance of the average of 100 trees?`,
          answer: { kind: 'number', value: 1.03 },
          explain: md`$\rho\sigma^2 + (1 - \rho)\sigma^2/B = 0.25 \cdot 4 + 0.75 \cdot 4 / 100 = 1 + 0.03 = 1.03$. Going from 100 trees to infinitely many would save only $0.03$.`,
        },
        {
          kind: 'text',
          md: md`### Out-of-bag error

A bootstrap sample misses some rows. A given row is missed by one draw with probability $1 - 1/n$, so by all $n$ draws with probability $(1 - 1/n)^n \to e^{-1} \approx 0.368$. Each tree therefore leaves out about 37% of the rows: its **out-of-bag** (OOB) rows. For each training row, average the predictions of the trees that did not see it, about $B/e$ of them, and score that **OOB prediction** against the row's label. The OOB error estimates the test error at no extra training cost, much like cross-validation.`,
        },
        {
          kind: 'numeric',
          q: md`With $n = 10$ rows, what is the probability that a given row is not in a bootstrap sample?`,
          answer: { kind: 'number', value: 0.348678, tol: 1e-3 },
          explain: md`$(1 - 1/10)^{10} = 0.9^{10} = 0.3487$, already close to $e^{-1} = 0.3679$.`,
        },
        {
          kind: 'callout',
          tone: 'definition',
          title: 'Random forest',
          md: md`A random forest (Breiman, 2001) is bagged trees with one change: at **each split**, only a random subset of $m$ of the $d$ features is considered. Two trees then often split on different features even when one feature is strongly predictive, so their predictions are less correlated (smaller $\rho$). Each tree gets slightly worse, but the average improves.

Classic choices are $m = \sqrt d$ for classification and $m = d/3$ for regression; library defaults differ (scikit-learn's regressor now uses all features by default), so tune $m$ (\`max_features\`). Trees are grown deep; \`min_samples_leaf\` is the main depth control. Trees are independent, so training parallelizes trivially.`,
        },
        {
          kind: 'check',
          q: md`You increase the number of trees in a random forest from 500 to 5,000. What happens to the test error?`,
          options: [md`It stays about the same or improves slightly; adding trees does not cause overfitting`, md`It rises, because the forest overfits`, md`It falls to the Bayes error`, md`It falls by a factor of 10`],
          answer: 0,
          explain: md`More trees only shrink the $\frac{1-\rho}{B}\sigma^2$ term, which is already tiny at $B = 500$. The error converges to a limit as $B$ grows (Breiman, 2001). The cost is training time, memory and prediction latency.`,
        },
        {
          kind: 'text',
          md: md`### Feature importance

- **Impurity-based importance** (mean decrease in impurity, MDI) sums the impurity decreases of all splits on a feature. It is free, but it is computed on training data and is biased toward features with many possible split points: continuous features and high-cardinality IDs.
- **Permutation importance** shuffles one feature in a validation set and measures the drop in score. It is model-agnostic and measured on held-out data, but it is slower.
- **Correlated features** share or split their importance, and permuting one of them creates unrealistic rows. Interpret importances as "how much the model uses this feature". They say nothing about causal effects. SHAP values (TreeSHAP for trees) give per-prediction attributions.`,
        },
        {
          kind: 'check',
          q: md`In a churn model, a random \`user_id\` hash column (unique per user) ranks as the top feature by impurity-based importance. The most likely reason is`,
          options: [md`Impurity importance is computed on training data and favours features with many split points, which can isolate individual training rows`, md`User IDs carry real information about churn`, md`The forest has too few trees`, md`Permutation importance would rank it even higher`],
          answer: 0,
          explain: md`A unique ID lets deep trees isolate single rows, and every such split counts as impurity decrease on the training set. Permutation importance on held-out data would show it is useless, and the column should be dropped.`,
        },
        {
          kind: 'paper',
          problem: {
            id: 'ml04-2-paper',
            title: 'Where the 37% comes from',
            type: 'derive',
            difficulty: 2,
            minutes: 10,
            statement: md`(a) Show that the probability that a given row is absent from a bootstrap sample of size $n$ is $(1 - 1/n)^n$. (b) Show that it tends to $e^{-1}$ as $n \to \infty$. (c) What fraction of the **distinct** rows does a bootstrap sample contain, for large $n$? Enter the limit in (b).`,
            hints: [md`Take logarithms and use $\ln(1 - u) = -u + O(u^2)$.`],
            solution: [
              md`(a) Each of the $n$ independent draws picks the row with probability $1/n$ and misses it with probability $1 - 1/n$. Missing it in all $n$ draws: $(1 - 1/n)^n$.`,
              md`(b) $\ln\big((1 - 1/n)^n\big) = n\ln(1 - 1/n) = n\big(-1/n + O(1/n^2)\big) = -1 + O(1/n) \to -1$. The exponential is continuous, so the probability tends to $e^{-1} \approx 0.3679$.`,
              md`(c) By linearity of expectation, the expected number of distinct rows is $n\big(1 - (1 - 1/n)^n\big)$, a fraction $1 - e^{-1} \approx 0.632$. A bootstrap sample has $n$ rows but only about 63% distinct ones; the rest are repeats.`,
            ],
            answer: { kind: 'number', value: 0.367879, tol: 1e-3 },
            rubric: [md`Independence of the draws used for (a)`, md`Limit computed via the logarithm`, md`Fraction of distinct rows $1 - e^{-1}$ by linearity of expectation`],
          },
        },
        {
          kind: 'code',
          code: `import numpy as np

np.random.seed(0)
n = 1000
fractions = [len(np.unique(np.random.randint(0, n, size=n))) / n for _ in range(200)]
print(round(float(np.mean(fractions)), 2))`,
          predict: {
            q: md`Each line draws a bootstrap sample of 1,000 row indices and measures the fraction of distinct rows; the average over 200 samples is printed. What is printed?`,
            options: ['`0.63`', '`0.37`', '`0.5`', '`1.0`'],
            answer: 0,
            explain: md`About $1 - e^{-1} \approx 0.632$ of the rows are distinct; the other 37% of the draws are repeats, and 37% of the rows are out of bag.`,
          },
        },
        {
          kind: 'recall',
          prompt: md`Write the variance of an average of $B$ predictors with variance $\sigma^2$ and correlation $\rho$, and explain how a random forest uses it.`,
          answer: md`$\rho\sigma^2 + \frac{1-\rho}{B}\sigma^2$. Bagging grows $B$ to kill the second term; feature subsampling at each split lowers $\rho$, which lowers the floor $\rho\sigma^2$ that more trees cannot touch.`,
        },
        {
          kind: 'explain',
          prompt: md`Explain to a colleague why a random forest generalizes better than a single deep decision tree, and what the out-of-bag error is.`,
          model: md`A deep tree has low bias but high variance: it fits its sample closely and changes a lot when the sample changes. A random forest averages many such trees trained on bootstrap samples, which keeps the low bias and reduces variance. The variance of the average is $\rho\sigma^2 + (1-\rho)\sigma^2/B$, so beyond a few hundred trees the remaining variance is set by how correlated the trees are; considering a random subset of features at each split makes the trees less correlated. Each bootstrap sample leaves out about 37% of the rows, so every row can be predicted by the trees that did not train on it; scoring those predictions gives the out-of-bag error, a nearly free estimate of test error.`,
        },
      ],
      cards: [
        { id: 'ml04-2-c1', kind: 'concept', front: md`What is bagging?`, back: md`Fit the same model (usually a deep tree) to $B$ bootstrap samples (size $n$, with replacement) and average the predictions or take a vote. It reduces variance.` },
        { id: 'ml04-2-c2', kind: 'compute', front: md`Variance of the average of infinitely many predictors, each with variance 2 and pairwise correlation 0.3?`, answer: { kind: 'number', value: 0.6 }, back: md`The floor $\rho\sigma^2 = 0.3 \times 2 = 0.6$.` },
        { id: 'ml04-2-c3', kind: 'cloze', text: md`About {{}}% of the rows are out of bag for each bootstrap sample.`, answers: ['37'] },
        { id: 'ml04-2-c4', kind: 'concept', front: md`What does a random forest add to bagging, and why?`, back: md`A random subset of features at each split. It decorrelates the trees, lowering the variance floor $\rho\sigma^2$ of the average.` },
        { id: 'ml04-2-c5', kind: 'concept', front: md`Two biases of impurity-based feature importance?`, back: md`It is measured on training data, and it favours features with many split points (continuous, high-cardinality). Correlated features also share importance. Prefer permutation importance on held-out data.` },
      ],
    },
    // ------------------------------------------------------------------ 4.3
    {
      id: 'ml04-3',
      title: 'Boosting',
      minutes: 40,
      objectives: [
        'Run one round of AdaBoost: weighted error, the weight α of the weak learner, and the reweighting of the examples.',
        'Derive gradient boosting as gradient descent in function space and show that for squared loss the trees fit residuals.',
        'Explain how the learning rate, the number of trees, tree depth and subsampling interact, and name the main XGBoost and LightGBM hyperparameters.',
        'Explain why gradient-boosted trees are strong on tabular data, and compare them with random forests.',
      ],
      cells: [
        {
          kind: 'text',
          md: md`Bagging averages strong, high-variance models that are trained independently. **Boosting** builds a strong model from **weak** ones, such as stumps (depth-1 trees) or shallow trees, trained **in sequence**: each new learner concentrates on what the current ensemble gets wrong. It mainly reduces bias.`,
        },
        {
          kind: 'callout',
          tone: 'definition',
          title: 'AdaBoost (Freund and Schapire, 1997)',
          md: md`Labels $y_i \in \{-1, +1\}$, weights $w_i = 1/n$ to start. For $m = 1, \dots, M$:

1. Fit a weak classifier $h_m$ to minimize the weighted error $\varepsilon_m = \sum_i w_i\,[h_m(\bx_i) \ne y_i]$.
2. Set $\alpha_m = \tfrac12\ln\dfrac{1 - \varepsilon_m}{\varepsilon_m}$.
3. Reweight $w_i \leftarrow w_i\,e^{-\alpha_m y_i h_m(\bx_i)}$ and renormalize so the weights sum to 1. Mistakes are multiplied by $e^{\alpha_m}$, correct points by $e^{-\alpha_m}$.

Predict with $\sign\big(\sum_m \alpha_m h_m(\bx)\big)$.`,
        },
        {
          kind: 'viz',
          viz: { type: 'ml.adaboost', rounds: 10 },
          task: md`Step through the rounds. Watch which points grow and where the next stump goes. At each round, check the readout: what is the total weight on the current stump's mistakes after the update?`,
          caption: md`Dot area shows each point's weight entering the round. Ringed points are the current stump's mistakes. The background shows the sign of the weighted vote $\sum_m \alpha_m h_m$ so far.`,
        },
        {
          kind: 'numeric',
          q: md`A stump has weighted error $\varepsilon = 0.2$. What is its weight $\alpha$ in the vote?`,
          answer: { kind: 'number', value: 0.693147, tol: 1e-3 },
          explain: md`$\alpha = \tfrac12\ln\frac{0.8}{0.2} = \tfrac12\ln 4 = \ln 2 \approx 0.693$. A learner no better than chance ($\varepsilon = 0.5$) gets $\alpha = 0$.`,
        },
        {
          kind: 'check',
          q: md`After an AdaBoost reweighting step, the examples that the latest weak learner misclassified carry what share of the total weight?`,
          options: [md`Exactly one half`, md`$\varepsilon_m$`, md`$1 - \varepsilon_m$`, md`It depends on the data`],
          answer: 0,
          explain: md`Before normalizing, the mistakes carry $\varepsilon e^{\alpha} = \varepsilon\sqrt{(1-\varepsilon)/\varepsilon} = \sqrt{\varepsilon(1-\varepsilon)}$ and the rest carry $(1-\varepsilon)e^{-\alpha} = \sqrt{\varepsilon(1-\varepsilon)}$. They are equal, so after normalizing each half is $1/2$: the last learner is exactly at chance on the new weights, and the next learner must find something new.`,
        },
        {
          kind: 'text',
          md: md`AdaBoost turned out to be a special case of a general recipe. Friedman, Hastie and Tibshirani (2000) showed it is forward stagewise additive modelling with the exponential loss $e^{-yF(\bx)}$. Friedman (2001) generalized it to any differentiable loss: **gradient boosting**.`,
        },
        {
          kind: 'callout',
          tone: 'definition',
          title: 'Gradient boosting',
          md: md`Start with a constant, $F_0 = \argmin_c \sum_i \ell(y_i, c)$ (the mean for squared loss). For $m = 1, \dots, M$:

1. compute the **pseudo-residuals** $r_i = -\dfrac{\partial \ell(y_i, F)}{\partial F}\Big|_{F = F_{m-1}(\bx_i)}$;
2. fit a small regression tree $h_m$ to the pairs $(\bx_i, r_i)$;
3. update $F_m = F_{m-1} + \nu\,h_m$ with a learning rate (shrinkage) $0 < \nu \le 1$.

Implementations usually also re-optimize each leaf's value for the actual loss (a line search per leaf).`,
        },
        {
          kind: 'derive',
          title: 'boosting is gradient descent on the predictions',
          goal: md`Show that gradient boosting performs gradient descent on the training loss, and that for squared loss the trees fit the residuals.`,
          steps: [
            { md: md`Treat the vector of training predictions $\mathbf{F} = (F(\bx_1), \dots, F(\bx_n))$ as the parameters. The training loss is $L(\mathbf{F}) = \sum_i \ell(y_i, F_i)$, and each term depends only on its own coordinate.` },
            {
              md: md`A gradient descent step on $\mathbf{F}$ is $\mathbf{F} \leftarrow \mathbf{F} - \nu\,\nabla L$, with components $\partial L/\partial F_i = \partial\ell(y_i, F_i)/\partial F_i$. So coordinate $i$ moves by $\nu$ times the negative gradient, the pseudo-residual $r_i$.`,
              choose: {
                prompt: md`What is the $i$-th component of $\nabla L(\mathbf{F})$?`,
                options: [md`$\partial\ell(y_i, F_i)/\partial F_i$`, md`$\sum_j \partial\ell(y_j, F_j)/\partial F_i$, which involves every example`, md`$\partial\ell/\partial \bx_i$`],
                answer: 0,
                explain: md`The loss is a sum of terms that each depend on one coordinate, so only the $i$-th term contributes to the $i$-th partial derivative. The gradient is with respect to the predictions, not the inputs.`,
              },
            },
            {
              md: md`For squared loss $\ell = \tfrac12(y - F)^2$: $\partial\ell/\partial F = -(y - F)$, so $r_i = y_i - F_{m-1}(\bx_i)$, the ordinary **residual**.`,
              choose: {
                prompt: md`For $\ell(y, F) = \tfrac12(y - F)^2$, the pseudo-residual $-\partial\ell/\partial F$ is`,
                options: [md`$y - F$`, md`$F - y$`, md`$\tfrac12(y - F)$`],
                answer: 0,
                explain: md`The derivative of $\tfrac12(y - F)^2$ with respect to $F$ is $-(y - F)$. Its negative is the residual: the direction that moves each prediction toward its label.`,
              },
            },
            { md: md`The vector $\mathbf{r}$ is defined only at the training inputs. Fitting a regression tree $h_m$ to $(\bx_i, r_i)$ approximates it with a function that can be evaluated anywhere, and that is constrained (few leaves) so it captures shared structure instead of individual noise. The update $F_m = F_{m-1} + \nu h_m$ is the gradient step, projected onto trees.` },
            { md: md`For log loss with $F$ the log-odds, $\ell = -y\ln p - (1 - y)\ln(1 - p)$ with $p = \sigma(F)$, the same computation gives $r_i = y_i - p_i$: the residual on the probability scale. Problem 4.7 asks you to derive it.` },
          ],
          takeaway: md`Each tree is one step of gradient descent in the space of functions. The learning rate is the step size, and the number of trees is the number of steps, so the two must be tuned together, usually with early stopping on a validation set.`,
        },
        {
          kind: 'viz',
          viz: { type: 'ml.boost-1d', lr: 0.3, depth: 1 },
          task: md`Step through the first five stages with $\nu = 0.3$ and stumps: where does each new stump split, and why there? Then play to the end. Set $\nu = 1$ and depth 3 and compare the stage with the lowest test error and the training error at the end.`,
          caption: md`Top: the model after $m$ trees. Bottom: the residuals of that model and the next tree fitted to them. A large learning rate with deep trees drives the training error toward zero within a few stages and starts fitting noise; a small one approaches the truth slowly and steadily.`,
        },
        {
          kind: 'numeric',
          q: md`Three points: $x = 1, 2, 3$ with $y = 3, 5, 10$. Start from $F_0 = \bar y$. Fit a regression stump to the residuals (choose the split with the smallest SSE), and update with $\nu = 0.5$. Enter $F_1$ at the three points.`,
          answer: { kind: 'vector', value: [5, 5, 8] },
          hints: [md`$F_0 = 6$, residuals $-3, -1, 4$. Compare the SSE of the splits $\{1\}\{2, 3\}$ and $\{1, 2\}\{3\}$.`],
          explain: md`Split $\{1\}\{2,3\}$: leaves $-3$ and $1.5$, SSE $= 2 \times 2.5^2 = 12.5$. Split $\{1,2\}\{3\}$: leaves $-2$ and $4$, SSE $= 1 + 1 = 2$, the better one. $F_1 = 6 + 0.5 \times (-2, -2, 4) = (5, 5, 8)$.`,
        },
        {
          kind: 'text',
          md: md`### The knobs

- **Learning rate $\nu$ and number of trees $M$** trade off: halving $\nu$ needs roughly twice the trees. Small rates (0.01 to 0.1) generalize better (Friedman, 2001) at more compute. Set $M$ by **early stopping** on a validation set.
- **Tree size**: \`max_depth\` (XGBoost grows level by level, default depth 6) or \`num_leaves\` (LightGBM grows the leaf with the largest gain first, default 31 leaves). Depth bounds the order of feature interactions a single tree can express.
- **Leaf size and penalties**: \`min_child_weight\` / \`min_data_in_leaf\`, L2 and L1 penalties on leaf values (\`reg_lambda\`, \`reg_alpha\`), and a minimum gain to split (\`gamma\` / \`min_gain_to_split\`).
- **Subsampling**: rows per tree (\`subsample\` / \`bagging_fraction\`, "stochastic gradient boosting") and features per tree or split (\`colsample_bytree\` / \`feature_fraction\`). Both reduce variance and speed up training.
- **Speed and data handling**: histogram binning of features (\`max_bin\`), native handling of missing values (each split learns which side missing values go to), and native categorical features in LightGBM and CatBoost (CatBoost uses ordered target statistics to avoid target leakage).

A common tuning order: fix a moderate learning rate and use early stopping, tune tree size and leaf constraints, then subsampling, then the penalties; finally lower the learning rate and raise the number of trees.`,
        },
        {
          kind: 'callout',
          tone: 'theorem',
          title: 'XGBoost\'s second-order leaf values',
          md: md`XGBoost (Chen and Guestrin, 2016) approximates the loss around $F_{m-1}$ to second order, using $g_i = \partial\ell/\partial F$ and $h_i = \partial^2\ell/\partial F^2$, and adds $\tfrac12\lambda\sum_j w_j^2 + \gamma\,|\text{leaves}|$. For a leaf with $G = \sum g_i$ and $H = \sum h_i$ over its examples, the best value and the gain of a split are
$$w^* = -\frac{G}{H + \lambda}, \qquad \text{gain} = \frac12\left[\frac{G_L^2}{H_L + \lambda} + \frac{G_R^2}{H_R + \lambda} - \frac{(G_L + G_R)^2}{H_L + H_R + \lambda}\right] - \gamma.$$
For squared loss $g_i = F - y_i$ and $h_i = 1$, so $w^* = \sum_i (y_i - F)/(n_{\text{leaf}} + \lambda)$: the mean residual, shrunk toward 0 by $\lambda$.`,
        },
        {
          kind: 'check',
          q: md`Your gradient-boosted model reaches its best validation loss after 150 trees with $\nu = 0.3$. You lower $\nu$ to $0.03$. What should you expect?`,
          options: [md`The best number of trees grows roughly tenfold, and the best validation loss is usually similar or slightly better`, md`The best number of trees drops to about 15`, md`The model stops overfitting, so you can train without a validation set`, md`The validation loss gets worse, because each tree contributes less`],
          answer: 0,
          explain: md`The learning rate is the step size of the functional gradient descent, so a tenth of the step needs about ten times the steps. Smaller steps usually generalize a little better. Overfitting is still possible with enough trees, so early stopping is still needed.`,
        },
        {
          kind: 'text',
          md: md`### Why gradient-boosted trees are strong on tabular data

A benchmark study by Grinsztajn, Oyallon and Varoquaux (2022) found tree ensembles ahead of deep networks on most medium-sized tabular datasets (around 10,000 rows), even after extensive tuning, and identified reasons that match practical experience:

- **Irregular targets.** Tabular targets often change sharply at thresholds (an age limit, a price point). Trees represent jumps directly; neural networks are biased toward smooth functions.
- **Uninformative features.** Greedy splits ignore features that never reduce impurity; MLPs are hurt more by many useless inputs.
- **Features with meaning.** Columns are heterogeneous (counts, amounts, categories). Trees are invariant to monotone transformations of each column and need no scaling; networks need careful normalization and encodings.
- **Practicalities.** Missing values and categoricals are handled natively, training is fast on CPUs, and the defaults are strong.

Neural networks catch up or win when there are very many rows, when inputs are raw signals (text, images, audio) or embeddings, and when the model must be trained end to end with other components.`,
        },
        {
          kind: 'paper',
          problem: {
            id: 'ml04-3-paper',
            title: 'Two rounds of gradient boosting by hand',
            type: 'compute',
            difficulty: 2,
            minutes: 15,
            statement: md`Data: $x = 1, 2, 3, 4$ with $y = 1, 3, 4, 8$. Squared loss, stumps (one split on $x$, leaf values equal to the mean residual in the leaf), learning rate $\nu = 0.5$, $F_0 = \bar y$. Carry out two boosting rounds and enter $F_2$ at the four points.`,
            hints: [md`For each round, compute the residuals, then the SSE of the three possible splits (after $x = 1$, $2$ or $3$).`],
            solution: [
              md`$F_0 = 4$. Residuals $r = (-3, -1, 0, 4)$.`,
              md`Round 1 splits: after $x=1$: leaves $-3$ and $1$, SSE $= 0 + (4 + 1 + 9) = 14$. After $x=2$: leaves $-2$ and $2$, SSE $= 2 + 8 = 10$. After $x=3$: leaves $-\tfrac43$ and $4$, SSE $= \tfrac{14}{3} \approx 4.67$. Best: after $x = 3$.`,
              md`$F_1 = 4 + 0.5\,(-\tfrac43, -\tfrac43, -\tfrac43, 4) = (3.333, 3.333, 3.333, 6)$. New residuals $(-2.333, -0.333, 0.667, 2)$.`,
              md`Round 2 splits: after $x=1$: leaves $-2.333$ and $0.778$, SSE $\approx 1.926$. After $x=2$: leaves $-1.333$ and $1.333$, SSE $\approx 2.889$. After $x=3$: leaves $-0.667$ and $2$, SSE $\approx 4.667$. Best: after $x = 1$.`,
              md`$F_2 = F_1 + 0.5\,(-2.333, 0.778, 0.778, 0.778) = (2.167, 3.722, 3.722, 6.389)$. The training SSE fell from 26 to about 12.8 to about 5.9.`,
            ],
            answer: { kind: 'vector', value: [2.166667, 3.722222, 3.722222, 6.388889], tol: 1e-3 },
            rubric: [md`Residuals recomputed from the current model each round`, md`All candidate splits compared by SSE`, md`Update uses the learning rate`],
          },
        },
        {
          kind: 'exercise',
          ex: {
            id: 'ml04-ex-boost',
            title: 'Gradient boosting with stumps',
            prompt: md`Implement \`fit_stump(x, r)\` and \`boost(x, y, M, lr)\` for 1-D regression with squared loss.

- \`fit_stump\` returns \`(t, left, right)\`: the threshold $t$ (midpoint between consecutive sorted values, skipping equal values) and the two leaf means, for the split of $x \le t$ that minimizes the SSE of \`r\`. Minimizing SSE is the same as maximizing $S_L^2/n_L + S_R^2/n_R$, where $S$ are the sums of \`r\` on each side. Use \`np.cumsum\`; take the first maximum (\`np.argmax\`).
- \`boost\` starts from the mean of \`y\` and adds \`lr\` times a stump fitted to the current residuals, \`M\` times. It returns the final predictions at the training points. A loop over the \`M\` stages is fine.`,
            starter: `import numpy as np

def fit_stump(x, r):
    # TODO: sort, cumulative sums, best split
    return float(np.median(x)), 0.0, 0.0

def boost(x, y, M, lr):
    F = np.full(len(y), y.mean())
    # TODO: M rounds of fitting the residuals
    return F
`,
            solution: `import numpy as np

def fit_stump(x, r):
    o = np.argsort(x, kind='stable')
    xs, rs = x[o], r[o]
    n = len(r)
    nl = np.arange(1, n)
    sl = np.cumsum(rs)[:-1]
    sr = rs.sum() - sl
    score = sl ** 2 / nl + sr ** 2 / (n - nl)
    score = np.where(xs[1:] != xs[:-1], score, -np.inf)
    j = np.argmax(score)
    return (xs[j] + xs[j + 1]) / 2, sl[j] / nl[j], sr[j] / (n - nl[j])

def boost(x, y, M, lr):
    F = np.full(len(y), y.mean())
    for m in range(M):
        t, left, right = fit_stump(x, y - F)
        F = F + lr * np.where(x <= t, left, right)
    return F
`,
            tests: [
              { expr: 'np.round(boost(np.array([1.0, 2.0, 3.0]), np.array([3.0, 5.0, 10.0]), 1, 0.5), 6).tolist()', label: 'one round (the numeric checkpoint)' },
              { expr: 'np.round(boost(np.array([1.0, 2.0, 3.0, 4.0]), np.array([1.0, 3.0, 4.0, 8.0]), 2, 0.5), 6).tolist()', label: 'two rounds (the paper problem)' },
              { expr: 'np.round(np.array(fit_stump(np.array([4.0, 1.0, 3.0, 2.0, 5.0]), np.array([2.0, -1.0, 1.0, -2.0, 0.0]))), 6).tolist()', label: 'stump on unsorted x' },
            ],
            hints: [md`If the left side has \`nl\` points with residual sum \`sl\`, its mean is \`sl / nl\` and its SSE is $\sum r^2 - S_L^2/n_L$. The total $\sum r^2$ does not depend on the split.`, md`Predict a stump with \`np.where(x <= t, left, right)\`.`],
          },
        },
        {
          kind: 'recall',
          prompt: md`State the gradient boosting update, the pseudo-residual for squared loss and for log loss, and the role of the learning rate.`,
          answer: md`$F_m = F_{m-1} + \nu h_m$, where $h_m$ is a small tree fitted to $r_i = -\partial\ell/\partial F$ at $F_{m-1}(\bx_i)$. Squared loss: $r_i = y_i - F(\bx_i)$. Log loss on log-odds: $r_i = y_i - p_i$. $\nu$ is the step size; smaller steps need more trees and usually generalize better.`,
        },
        {
          kind: 'explain',
          prompt: md`An interviewer asks: *random forest or gradient boosting, what is the difference and when would you use each?*`,
          model: md`Both are ensembles of trees. A random forest trains deep trees independently on bootstrap samples with random feature subsets and averages them: it reduces variance, is hard to overfit by adding trees, needs little tuning, parallelizes, and gives an out-of-bag error. Gradient boosting trains shallow trees sequentially, each fitting the negative gradient of the loss of the current ensemble: it reduces bias, usually reaches higher accuracy on tabular data, supports custom losses (ranking, quantiles, Poisson), but has more interacting hyperparameters (learning rate, number of trees, depth, regularization), can overfit if trained too long, and needs early stopping. I would start with a random forest as a strong, low-effort baseline and use gradient boosting (LightGBM or XGBoost) when accuracy matters and there is a validation set for tuning.`,
        },
      ],
      cards: [
        { id: 'ml04-3-c1', kind: 'concept', front: md`AdaBoost: formula for the learner weight $\alpha_m$ and the reweighting rule.`, back: md`$\alpha_m = \tfrac12\ln\frac{1-\varepsilon_m}{\varepsilon_m}$; $w_i \leftarrow w_i e^{-\alpha_m y_i h_m(\bx_i)}$, then normalize. Mistakes grow by $e^{\alpha_m}$.` },
        { id: 'ml04-3-c2', kind: 'compute', front: md`Gradient boosting, squared loss: $F_0 = 4$, a point has $y = 7$. What is its pseudo-residual?`, answer: { kind: 'number', value: 3 }, back: md`$r = y - F_0 = 3$.` },
        { id: 'ml04-3-c3', kind: 'cloze', text: md`For log loss on the log-odds, the pseudo-residual is the label minus the predicted {{}}.`, answers: ['probability'] },
        { id: 'ml04-3-c4', kind: 'concept', front: md`How do the learning rate and the number of trees interact in gradient boosting?`, back: md`The learning rate is the step size of functional gradient descent: a smaller rate needs proportionally more trees, usually generalizes a little better, and the number of trees is chosen by early stopping.` },
        { id: 'ml04-3-c5', kind: 'concept', front: md`Name three reasons gradient-boosted trees beat neural networks on typical tabular data.`, back: md`Targets with sharp, irregular dependence on features; robustness to uninformative features; invariance to monotone feature transforms and native handling of missing values and categoricals; modest data sizes and fast tuning.` },
      ],
    },
  ],
  problems: [
    {
      id: 'ml04-p1',
      title: 'Impurity of a three-class node',
      type: 'compute',
      difficulty: 1,
      minutes: 4,
      statement: md`A node has class counts $(4, 2, 2)$. Compute its Gini impurity and its entropy in bits. Enter both.`,
      solution: [md`Proportions $(0.5, 0.25, 0.25)$. Gini $= 1 - (0.25 + 0.0625 + 0.0625) = 0.625$.`, md`Entropy $= -0.5\log_2 0.5 - 2 \times 0.25\log_2 0.25 = 0.5 + 1 = 1.5$ bits.`],
      answer: { kind: 'vector', value: [0.625, 1.5] },
    },
    {
      id: 'ml04-p2',
      title: 'Information gain of a categorical split',
      type: 'compute',
      difficulty: 1,
      minutes: 8,
      statement: md`A node has 9 positive and 5 negative examples. A categorical feature with three values splits it into children with counts (positive, negative) $(2, 3)$, $(4, 0)$ and $(3, 2)$. Compute the information gain (entropy, bits).`,
      solution: [
        md`Parent: $H(9/14) = -\tfrac{9}{14}\log_2\tfrac{9}{14} - \tfrac{5}{14}\log_2\tfrac{5}{14} = 0.9403$.`,
        md`Children: $H(2/5) = H(3/5) = 0.9710$, and the pure child has $H = 0$.`,
        md`Weighted: $\tfrac{5}{14}(0.9710) + \tfrac{4}{14}(0) + \tfrac{5}{14}(0.9710) = 0.6935$. Gain $= 0.9403 - 0.6935 = 0.2467$.`,
      ],
      answer: { kind: 'number', value: 0.24675, tol: 1e-3 },
    },
    {
      id: 'ml04-p3',
      title: 'Information gain is mutual information',
      type: 'proof',
      difficulty: 3,
      minutes: 15,
      statement: md`Let $Y$ be the label of a random example in a node and $S \in \{L, R\}$ the side of the split it goes to. Show that the information gain equals $I(Y; S) = \sum_{y,s} p(y, s)\log_2\frac{p(y, s)}{p(y)p(s)}$, and conclude that it is never negative.`,
      hints: [md`Write the weighted child entropy as the conditional entropy $H(Y \mid S)$.`, md`Mutual information is a KL divergence: $I(Y;S) = \KL\big(p(y,s)\,\Vert\,p(y)p(s)\big)$.`],
      solution: [
        md`With $p(s) = n_s/n$ and $p(y \mid s)$ the class proportions in child $s$, the weighted child entropy is $\sum_s p(s)H(Y \mid S = s) = H(Y \mid S)$, so the gain is $H(Y) - H(Y \mid S)$.`,
        md`Expand: $H(Y) - H(Y\mid S) = -\sum_y p(y)\log p(y) + \sum_{y,s} p(y,s)\log p(y\mid s)$. Since $p(y) = \sum_s p(y, s)$, the first term is $-\sum_{y,s}p(y,s)\log p(y)$.`,
        md`Combine: $\sum_{y,s} p(y,s)\log\frac{p(y\mid s)}{p(y)} = \sum_{y,s}p(y,s)\log\frac{p(y,s)}{p(y)p(s)} = I(Y;S)$.`,
        md`This is $\KL\big(p(y,s)\Vert p(y)p(s)\big)$, which is $\ge 0$ by Gibbs' inequality (Jensen applied to $-\log$), with equality iff $Y$ and $S$ are independent, that is, iff both children have the parent's class proportions.`,
      ],
      rubric: [md`Weighted child entropy identified as $H(Y\mid S)$`, md`Algebra to the mutual information form`, md`Non-negativity from KL / Jensen, with the equality case`],
      areas: ['ml-depth', 'math'],
    },
    {
      id: 'ml04-p4',
      title: 'Best regression split',
      type: 'compute',
      difficulty: 2,
      minutes: 10,
      statement: md`One feature $x = 1, \dots, 6$ with labels $y = 2, 4, 3, 9, 11, 10$. Find the threshold that minimizes the total SSE of the two children, and the SSE reduction it achieves. Enter the threshold and the reduction.`,
      solution: [
        md`Parent mean $6.5$, SSE $= 20.25 + 6.25 + 12.25 + 6.25 + 20.25 + 12.25 = 77.5$.`,
        md`Child SSEs by threshold: $1.5$: $0 + 53.2 = 53.2$. $2.5$: $2 + 38.75 = 40.75$. $3.5$: $2 + 2 = 4$. $4.5$: $29.5$. $5.5$: $62.8$.`,
        md`Best $t = 3.5$ (children $\{2,4,3\}$ and $\{9,11,10\}$, each SSE 2). Reduction $77.5 - 4 = 73.5$.`,
      ],
      answer: { kind: 'vector', value: [3.5, 73.5] },
    },
    {
      id: 'ml04-p5',
      title: 'How many trees?',
      type: 'compute',
      difficulty: 1,
      minutes: 5,
      statement: md`Trees have prediction variance $\sigma^2 = 1$ and pairwise correlation $\rho = 0.1$. (a) What is the smallest possible variance of their average? (b) How many trees are needed to get within $0.01$ of it, i.e. to reach variance $0.11$?`,
      solution: [md`(a) The floor is $\rho\sigma^2 = 0.1$.`, md`(b) Need $0.1 + 0.9/B \le 0.11$, so $0.9/B \le 0.01$ and $B \ge 90$.`],
      answer: { kind: 'number', value: 90 },
    },
    {
      id: 'ml04-p6',
      title: 'One AdaBoost round',
      type: 'compute',
      difficulty: 2,
      minutes: 8,
      statement: md`Ten examples with equal weights $0.1$. A stump misclassifies 3 of them. Compute $\alpha$, then the normalized new weight of each misclassified example and of each correctly classified example. Enter the three numbers.`,
      solution: [
        md`$\varepsilon = 0.3$, $\alpha = \tfrac12\ln\frac{0.7}{0.3} = 0.4236$, so $e^{\alpha} = \sqrt{7/3} = 1.5275$ and $e^{-\alpha} = 0.6547$.`,
        md`Unnormalized: mistakes $0.1 \times 1.5275 = 0.15275$, correct $0.1 \times 0.6547 = 0.06547$. Total $Z = 3(0.15275) + 7(0.06547) = 0.9165$.`,
        md`Normalized: mistakes $0.15275/0.9165 = 1/6 = 0.1667$ each (total $1/2$), correct $0.06547/0.9165 = 1/14 = 0.0714$ each (total $1/2$).`,
      ],
      answer: { kind: 'vector', value: [0.423649, 0.166667, 0.071429], tol: 1e-3 },
    },
    {
      id: 'ml04-p7',
      title: 'Pseudo-residuals for log loss',
      type: 'derive',
      difficulty: 2,
      minutes: 10,
      statement: md`For binary classification, gradient boosting models the log-odds $F$, with $p = \sigma(F) = 1/(1 + e^{-F})$ and loss $\ell(y, F) = -y\ln p - (1 - y)\ln(1 - p)$, $y \in \{0, 1\}$. (a) Show that $-\partial\ell/\partial F = y - p$. (b) Show that $\partial^2\ell/\partial F^2 = p(1 - p)$, the hessian XGBoost uses. (c) A positive example has current prediction $F = 0$: what is its pseudo-residual? Enter (c).`,
      hints: [md`$\sigma'(F) = \sigma(F)(1 - \sigma(F))$.`],
      solution: [
        md`Write $\ell = -yF + \ln(1 + e^F)$: indeed $\ln p = F - \ln(1 + e^F)$ and $\ln(1 - p) = -\ln(1 + e^F)$, so $-y\ln p - (1-y)\ln(1-p) = -yF + \ln(1 + e^F)$.`,
        md`(a) $\partial\ell/\partial F = -y + \frac{e^F}{1 + e^F} = p - y$, so the pseudo-residual is $y - p$.`,
        md`(b) $\partial^2\ell/\partial F^2 = \partial p/\partial F = p(1 - p)$.`,
        md`(c) $F = 0$ gives $p = 0.5$, so $r = 1 - 0.5 = 0.5$.`,
      ],
      answer: { kind: 'number', value: 0.5 },
      rubric: [md`Loss rewritten in terms of $F$ (or chain rule through $\sigma$)`, md`Gradient $p - y$ and pseudo-residual $y - p$`, md`Hessian $p(1-p)$`],
      areas: ['ml-depth'],
    },
    {
      id: 'ml04-p8',
      title: 'XGBoost leaf values and split gain',
      type: 'compute',
      difficulty: 3,
      minutes: 12,
      statement: md`Squared loss, current residuals $y_i - F_i = -3, -1, 2, 4$ for four examples sorted by a feature, $\lambda = 1$, $\gamma = 0$. Using $g_i = F_i - y_i$, $h_i = 1$, compute the optimal leaf values $w_L^*, w_R^*$ for the split $\{1, 2\} \mid \{3, 4\}$ and the gain of that split. Enter the three numbers.`,
      solution: [
        md`$g = (3, 1, -2, -4)$. Left: $G_L = 4$, $H_L = 2$. Right: $G_R = -6$, $H_R = 2$. Parent: $G = -2$, $H = 4$.`,
        md`$w_L^* = -4/(2 + 1) = -1.333$ (the mean residual $-2$, shrunk). $w_R^* = 6/3 = 2$ (mean residual 3, shrunk).`,
        md`Gain $= \tfrac12\big[\tfrac{16}{3} + \tfrac{36}{3} - \tfrac{4}{5}\big] = \tfrac12(5.333 + 12 - 0.8) = 8.267$.`,
      ],
      answer: { kind: 'vector', value: [-1.333333, 2, 8.266667], tol: 1e-3 },
    },
    {
      id: 'ml04-p9',
      title: 'XOR defeats greedy search',
      type: 'concept',
      difficulty: 2,
      minutes: 10,
      statement: md`Points on a grid: label 1 where exactly one of $x_1 > 0$, $x_2 > 0$ holds, label 0 otherwise, with equal numbers in each quadrant. (a) Show that every split of the form $x_1 \le t$ or $x_2 \le t$ at the root has zero Gini decrease when $t = 0$, and argue that other thresholds also gain little. (b) Show that a depth-2 tree classifies perfectly. (c) What does this say about greedy tree growth, and how do practical methods cope?`,
      solution: [
        md`(a) $x_1 \le 0$ leaves each child with two quadrants, one of each label, so both children are 50/50: impurity $0.5$, decrease 0. The same holds for $x_2$. A threshold $t \ne 0$ moves a strip of points whose labels are themselves split evenly between the two classes (half the strip lies in each half-plane of the other feature), so the class mix barely changes on either side.`,
        md`(b) Split $x_1 \le 0$ (no gain), then split each child on $x_2 \le 0$: the four leaves are the four pure quadrants.`,
        md`(c) Greedy growth is myopic: it cannot value a split for the splits it enables. In practice the tree is grown deeper than the obvious stopping point and pruned afterwards, ensembles try many slightly different trees, and boosting adds trees in sequence, so an interaction missed by one tree can be picked up through residuals. Feature engineering (adding $x_1x_2$) solves XOR in one split.`,
      ],
      rubric: [md`Zero gain at $t = 0$ shown from the child proportions`, md`Depth-2 perfect tree given`, md`Limitation of one-step greedy search and at least one remedy`],
    },
    {
      id: 'ml04-p10',
      title: 'Taming an overfitting GBDT',
      type: 'apply',
      difficulty: 2,
      minutes: 10,
      statement: md`A LightGBM model trained with \`learning_rate=0.3\`, \`num_leaves=255\`, \`min_data_in_leaf=1\`, 2,000 trees and no validation set has training AUC 0.995 and test AUC 0.80. A logistic regression gets 0.81. List the changes you would make, in order, and what each one targets.`,
      solution: [
        md`Add a validation set (a time-based split if the data are temporal) and **early stopping**: the 2,000 trees were not chosen by any measure of generalization.`,
        md`Shrink the trees: \`num_leaves\` to around 31 (or cap \`max_depth\`), and \`min_data_in_leaf\` to something like 50 to 200. Huge leaves-per-tree with single-row leaves memorize noise (variance).`,
        md`Lower the learning rate to 0.05 or less and let early stopping pick the number of trees.`,
        md`Add row and feature subsampling (\`bagging_fraction\` with \`bagging_freq\`, \`feature_fraction\` around 0.8) and L2 regularization on leaves (\`lambda_l2\`) to reduce variance further.`,
        md`If the gap persists, check for leakage and for a train/test distribution shift: a GBDT losing to logistic regression on tabular data is unusual and often a data problem.`,
      ],
      rubric: [md`Validation set with early stopping first`, md`Tree-size and leaf-size constraints`, md`Lower learning rate with more trees chosen by validation`, md`Subsampling or regularization, and a sanity check for leakage or shift`],
      areas: ['ml-breadth', 'system-design'],
    },
  ],
};
