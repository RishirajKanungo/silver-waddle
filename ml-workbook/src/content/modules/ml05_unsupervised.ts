import { md, type Module } from '../types';

export const MODULE: Module = {
  id: 'ml05',
  part: 'ml',
  order: 5,
  title: 'Neighbours, clustering and unsupervised learning',
  summary: 'k-nearest neighbours and the curse of dimensionality, k-means and Gaussian mixtures, and the practical use of PCA, t-SNE/UMAP and anomaly detectors.',
  relevance: md`Nearest-neighbour search over embeddings is the core of retrieval, recommendation candidate generation and RAG, and k-means trains the coarse quantizers and codebooks inside vector indexes. Clustering, PCA, t-SNE/UMAP plots and anomaly detectors are everyday tools for exploring data, segmenting users and catching fraud or failures. Interviews ask how to choose k, why distances break down in high dimensions, how to implement k-means in NumPy, and how to read (and not over-read) a t-SNE plot.`,
  prereqs: ['ml03'],
  areas: ['ml-breadth', 'ml-coding', 'math'],
  lessons: [
    // ------------------------------------------------------------------ 5.1
    {
      id: 'ml05-1',
      title: 'k-nearest neighbours and the curse of dimensionality',
      minutes: 35,
      objectives: [
        'Classify a query point by hand with k-NN and explain how k trades bias against variance.',
        'Explain why the choice of distance and the scaling of features change k-NN predictions.',
        'Compute how the relative spread of distances shrinks with dimension and explain what that does to nearest-neighbour methods.',
        'Implement a vectorized k-NN classifier in NumPy.',
      ],
      cells: [
        {
          kind: 'text',
          md: md`"Customers similar to you bought…", "images similar to this one", "documents closest to the query embedding": all are nearest-neighbour questions. The **k-nearest-neighbour** (k-NN) method turns them into a predictor. It has no training step beyond storing the data; all the work happens at query time, when the distances from the query to the stored points are computed.`,
        },
        {
          kind: 'callout',
          tone: 'definition',
          title: 'k-nearest neighbours',
          md: md`Given training pairs $(\bx_i, y_i)$, a distance $d$ and an integer $k$, let $N_k(\bx)$ be the $k$ training points closest to the query $\bx$.

- **Classification**: predict the majority label in $N_k(\bx)$; the fraction of each class is a probability estimate.
- **Regression**: predict the mean $\frac1k\sum_{i \in N_k(\bx)} y_i$.

A common variant weights each neighbour by $1/d(\bx, \bx_i)$, so closer neighbours count more. For binary labels an odd $k$ avoids ties.`,
        },
        {
          kind: 'viz',
          viz: { type: 'ml.knn', k: 15 },
          task: md`Set $k = 1$: what is the training error, and what do the regions look like? Set $k = 41$. Use the plot below to find the $k$ with the lowest test error. Then drag the query onto the boundary and read the vote.`,
          caption: md`The background shows the fraction of class-1 votes among the $k$ neighbours at every location. The lines connect the query to its $k$ neighbours.`,
        },
        {
          kind: 'numeric',
          q: md`Query $(0, 0)$. Training points: $(1, 0)$ class 1, $(0, 2)$ class 0, $(-1, -1)$ class 1, $(2, 2)$ class 0, $(0, -3)$ class 0. Using Euclidean distance, what does k-NN predict for $k = 3$ and for $k = 5$? Enter the two labels.`,
          answer: { kind: 'vector', value: [1, 0] },
          inputHint: 'two labels, e.g. 1, 0',
          explain: md`Distances: $1$, $2$, $\sqrt2 \approx 1.41$, $\sqrt8 \approx 2.83$, $3$. The three nearest are $(1,0)$, $(-1,-1)$, $(0,2)$ with labels 1, 1, 0: predict 1. With all five, the labels are two 1s and three 0s: predict 0.`,
        },
        {
          kind: 'check',
          q: md`For $k = 1$, what is the training error of k-NN (when no two training points share the same input)?`,
          options: [md`0`, md`The Bayes error`, md`About 50%`, md`It cannot be computed`],
          answer: 0,
          explain: md`Each training point is its own nearest neighbour at distance 0, so it is always predicted correctly. Zero training error says nothing about test error here: 1-NN has the highest variance of all choices of $k$.`,
        },
        {
          kind: 'text',
          md: md`### Bias and variance in $k$

Small $k$ follows individual points: low bias, high variance. Large $k$ averages over a wide neighbourhood: low variance, but the neighbourhood reaches regions where the label differs, so bias grows; at $k = n$ every query gets the overall majority class. For k-NN regression with fixed inputs, the variance term is exactly $\sigma^2/k$ (the paper problem of the bias–variance lesson). Roughly, k-NN behaves like a model with $n/k$ parameters. Choose $k$ by cross-validation.

As $n \to \infty$, the error of 1-NN is at most twice the Bayes error (Cover and Hart, 1967), and k-NN with $k \to \infty$, $k/n \to 0$ reaches the Bayes error: given enough data, the method is consistent.

### Distances and scaling

- **Euclidean** is the default. **Manhattan** (L1) is less dominated by a single large coordinate difference. **Cosine** compares directions and is the usual choice for text and embedding vectors.
- A feature measured in large units dominates the distance. **Standardize** features first, or learn a metric or an embedding in which distances are meaningful.
- **Cost**: brute force is $O(nd)$ per query. KD-trees and ball trees help in low dimensions. In high dimensions, vector databases use approximate nearest-neighbour indexes such as HNSW graphs or inverted files with product quantization.`,
        },
        {
          kind: 'viz',
          viz: { type: 'ml.knn', k: 5, metric: 'l2', scale: 1 },
          task: md`Move the **scale of x2** slider to $\times 0.1$, as if $x_2$ had been recorded in units ten times larger. How do the regions change, and what happens to the test error? Then compare L1 and L2 at scale 1.`,
          caption: md`Shrinking a feature's scale makes differences along it nearly free, so neighbours are chosen almost by $x_1$ alone and the regions become vertical bands.`,
        },
        {
          kind: 'paper',
          problem: {
            id: 'ml05-1-paper',
            title: 'The metric decides the neighbour',
            type: 'compute',
            difficulty: 1,
            minutes: 8,
            statement: md`Query $\bq = (0, 0)$. Point $A = (3, 0)$ has class "A", point $B = (2, 2)$ has class "B".

(a) Which is the nearest neighbour under the Euclidean distance? (b) Under the Manhattan (L1) distance? (c) Under Euclidean distance after the second feature is divided by 2 (a change of units)? Enter the class predicted by 1-NN in (b).`,
            solution: [
              md`(a) $d_2(\bq, A) = 3$ and $d_2(\bq, B) = \sqrt{8} \approx 2.83$: $B$ is nearer, predict "B".`,
              md`(b) $d_1(\bq, A) = 3$ and $d_1(\bq, B) = 2 + 2 = 4$: $A$ is nearer, predict "A".`,
              md`(c) $B$ becomes $(2, 1)$ with $d_2 = \sqrt5 \approx 2.24 < 3$: "B".`,
              md`The metric and the units are modelling choices that can flip predictions. L1 penalizes a point that differs a little in many coordinates more than L2 does, relative to a point that differs a lot in one coordinate.`,
            ],
            answer: { kind: 'text', value: ['A'] },
          },
        },
        {
          kind: 'text',
          md: md`### The curse of dimensionality

Neighbourhood methods assume that a neighbourhood containing a few training points is small. In high dimensions that fails.

- **Volume.** To capture a fraction $r$ of data spread uniformly in the unit cube $[0,1]^d$, a sub-cube needs edge length $r^{1/d}$. For $r = 1\%$ and $d = 10$ that is $0.63$: the "local" neighbourhood spans 63% of the range of every feature.
- **Concentration of distances.** For random points, the squared distance $\sum_j (x_j - y_j)^2$ is a sum of $d$ independent terms. Its mean grows like $d$ and its standard deviation like $\sqrt d$, so the **relative** spread shrinks like $1/\sqrt d$: the nearest and the farthest point end up almost equally far away.

Real data are usually far from uniform. They tend to lie near a lower-dimensional structure, which is why k-NN on learned embeddings works well while k-NN on thousands of raw features often does not.`,
        },
        {
          kind: 'numeric',
          q: md`Data are uniform in $[0, 1]^{10}$. What edge length must a sub-cube have to contain 10% of the data on average?`,
          answer: { kind: 'number', value: 0.794328, tol: 1e-3 },
          explain: md`$0.1^{1/10} = e^{\ln(0.1)/10} = e^{-0.2303} = 0.794$. To hold a tenth of the data, the neighbourhood must cover almost 80% of each feature's range.`,
        },
        {
          kind: 'viz',
          viz: { type: 'ml.dist-concentration', dist: 'uniform', d: 2 },
          task: md`Move the dimension from 2 to 1000 and watch the histogram and the ratio of the farthest to the nearest neighbour of point 0. Switch to Gaussian data: does the shape of the trend change?`,
          caption: md`Distances are divided by their mean, so all histograms share one axis. In 2-D they range from almost 0 to twice the mean; in 1,000-D all 1,770 pairwise distances lie within a few percent of the mean.`,
        },
        {
          kind: 'derive',
          title: 'distances concentrate like 1/√d',
          goal: md`Let $\bx, \by$ be independent and uniform in $[0, 1]^d$, and $S = \lVert\bx - \by\rVert^2$. Show that $\text{sd}(S)/\E[S] = \sqrt{1.4/d}$.`,
          steps: [
            { md: md`$S = \sum_{j=1}^d t_j^2$ with $t_j = x_j - y_j$, and the $t_j$ are independent and identically distributed. So $\E[S] = d\,\E[t^2]$ and $\Var(S) = d\,\Var(t^2)$.` },
            {
              md: md`The difference of two independent uniforms has the triangular density $1 - |t|$ on $[-1, 1]$. Then $$\E[t^2] = 2\int_0^1 t^2(1 - t)\,dt = 2\Big(\tfrac13 - \tfrac14\Big) = \tfrac16, \qquad \E[t^4] = 2\Big(\tfrac15 - \tfrac16\Big) = \tfrac1{15}.$$`,
              choose: {
                prompt: md`Which moments of $t = x - y$ do you need for the mean and the variance of $t^2$?`,
                options: [md`$\E[t^2]$ and $\E[t^4]$`, md`$\E[t]$ and $\E[t^2]$`, md`Only $\E[t^2]$`],
                answer: 0,
                explain: md`$\Var(t^2) = \E[t^4] - (\E[t^2])^2$, so the second and fourth moments are needed.`,
              },
            },
            { md: md`$\Var(t^2) = \tfrac1{15} - \tfrac1{36} = \tfrac{12 - 5}{180} = \tfrac{7}{180}$. Hence $\E[S] = d/6$ and $\Var(S) = 7d/180$.` },
            {
              md: md`$$\frac{\text{sd}(S)}{\E[S]} = \frac{\sqrt{7d/180}}{d/6} = \sqrt{\frac{36 \cdot 7}{180\,d}} = \sqrt{\frac{1.4}{d}} \approx \frac{1.18}{\sqrt d}.$$`,
              choose: {
                prompt: md`How does the relative spread scale with the dimension?`,
                options: [md`Like $1/\sqrt d$`, md`Like $1/d$`, md`It does not depend on $d$`],
                answer: 0,
                explain: md`The mean grows like $d$ and the standard deviation like $\sqrt d$ (independent terms add variances), so their ratio falls like $1/\sqrt d$.`,
              },
            },
            { md: md`For the distance $\sqrt S$ itself, the relative spread is about half that (delta method): $\approx 0.59/\sqrt d$, the dashed line in the figure.` },
          ],
          takeaway: md`Any sum of many independent, comparable coordinate contributions concentrates. Nearest-neighbour rankings then depend on small differences that noise can easily flip, unless the data have low intrinsic dimension.`,
        },
        {
          kind: 'numeric',
          q: md`Using the result above, what is $\text{sd}(S)/\E[S]$ for the squared distance between two uniform points in $d = 100$ dimensions?`,
          answer: { kind: 'number', value: 0.118322, tol: 1e-3 },
          explain: md`$\sqrt{1.4/100} = \sqrt{0.014} = 0.1183$. The middle 95% of squared distances lies within roughly $\pm 24\%$ of the mean.`,
        },
        {
          kind: 'check',
          q: md`k-NN on 2,000 raw pixel-like features performs poorly. Which change is most likely to help?`,
          options: [
            md`Compute neighbours in a learned low-dimensional embedding (or after PCA) where distances reflect similarity`,
            md`Use $k = 1$ to make the predictions more local`,
            md`Switch from Euclidean to Manhattan distance and keep the raw features`,
            md`Add more raw features`,
          ],
          answer: 0,
          explain: md`The problem is that raw distances in 2,000 dimensions are dominated by many irrelevant, noisy coordinates and concentrate. An embedding or projection that keeps the directions that matter restores meaningful neighbourhoods. A smaller $k$ raises variance; changing the norm or adding features does not address concentration.`,
        },
        {
          kind: 'exercise',
          ex: {
            id: 'ml05-ex-knn',
            title: 'Vectorized k-NN classifier',
            prompt: md`Write \`knn_predict(Xtr, ytr, Xq, k)\` for binary labels \`ytr\` in $\{0, 1\}$. For every query row, find the \`k\` training rows with the smallest squared Euclidean distance and predict 1 when more than half of their labels are 1 (use an odd \`k\`). Compute all query-to-training distances at once with broadcasting (shape \`(m, n)\`), then use \`np.argsort(..., axis=1, kind='stable')\`. No Python loops. Return an integer array.`,
            starter: `import numpy as np

def knn_predict(Xtr, ytr, Xq, k):
    # TODO: distances (m, n), indices of the k nearest, majority vote
    return np.zeros(len(Xq), dtype=int)
`,
            solution: `import numpy as np

def knn_predict(Xtr, ytr, Xq, k):
    D = ((Xq[:, None, :] - Xtr[None, :, :]) ** 2).sum(axis=2)
    idx = np.argsort(D, axis=1, kind='stable')[:, :k]
    return (ytr[idx].mean(axis=1) > 0.5).astype(int)
`,
            tests: [
              { expr: 'knn_predict(np.array([[1.0, 0.0], [0.0, 2.0], [-1.0, -1.0], [2.0, 2.0], [0.0, -3.0]]), np.array([1, 0, 1, 0, 0]), np.array([[0.0, 0.0], [2.0, 1.5], [-1.0, 0.5]]), 3).tolist()', label: 'the hand example, three queries' },
              { expr: 'knn_predict(np.array([[1.0, 0.0], [0.0, 2.0], [-1.0, -1.0], [2.0, 2.0], [0.0, -3.0]]), np.array([1, 0, 1, 0, 0]), np.array([[0.0, 0.0]]), 5).tolist()', label: 'k = 5' },
              { expr: 'knn_predict(np.arange(12.0).reshape(6, 2), np.array([0, 0, 1, 1, 1, 0]), np.array([[4.0, 5.0], [0.5, 0.5], [9.0, 9.0]]), 3).tolist()', label: 'another dataset' },
            ],
            hints: [md`\`Xq[:, None, :] - Xtr[None, :, :]\` has shape \`(m, n, d)\`; sum the squares over the last axis.`, md`\`ytr[idx]\` has shape \`(m, k)\`; its row means are the fractions of class 1.`],
            mustExclude: ['for '],
          },
        },
        {
          kind: 'code',
          code: `import numpy as np

np.random.seed(0)
for d in [2, 10, 100, 1000]:
    X = np.random.rand(200, d)                          # 200 points in the unit cube
    sq = (X ** 2).sum(axis=1)
    D2 = sq[:, None] + sq[None, :] - 2 * X @ X.T         # all squared distances at once
    upper = np.triu(np.ones((200, 200)), k=1) > 0       # each pair once
    D = np.sqrt(np.maximum(D2[upper], 0))
    r = np.sqrt(((X[1:] - X[0]) ** 2).sum(axis=1))       # distances from point 0
    print(d, round(float(D.std() / D.mean()), 3), round(float(r.max() / r.min()), 1))`,
          note: md`Each row: dimension, the relative spread of all pairwise distances, and the farthest-to-nearest ratio for one point. The identity $\lVert\bx - \by\rVert^2 = \lVert\bx\rVert^2 + \lVert\by\rVert^2 - 2\bx\cdot\by$ computes all distances with one matrix product, the standard trick in vectorized nearest-neighbour code. Compare the second column with $0.59/\sqrt d$.`,
        },
        {
          kind: 'recall',
          prompt: md`How does $k$ affect the bias and variance of k-NN? Give two reasons why k-NN degrades in high dimensions.`,
          answer: md`Small $k$: low bias, high variance (1-NN has zero training error). Large $k$: smoother, lower variance, higher bias; $k = n$ predicts the majority class. High dimensions: neighbourhoods holding a fixed fraction of the data must span most of each feature's range, and distances concentrate (relative spread $\propto 1/\sqrt d$), so the nearest neighbour is barely nearer than the farthest.`,
        },
      ],
      cards: [
        { id: 'ml05-1-c1', kind: 'concept', front: md`How does k-NN classify a query, and what does it cost?`, back: md`Find the $k$ training points nearest to the query and take a majority vote. No training; $O(nd)$ per query by brute force, less with KD-trees (low $d$) or approximate indexes (high $d$).` },
        { id: 'ml05-1-c2', kind: 'cloze', text: md`Increasing $k$ in k-NN lowers the variance and raises the {{}}.`, answers: ['bias'] },
        { id: 'ml05-1-c3', kind: 'compute', front: md`Edge length of a sub-cube holding 1% of uniform data in $[0,1]^2$?`, answer: { kind: 'number', value: 0.1 }, back: md`$0.01^{1/2} = 0.1$. In 10 dimensions it would be $0.01^{1/10} \approx 0.63$.` },
        { id: 'ml05-1-c4', kind: 'concept', front: md`What is distance concentration?`, back: md`For many independent coordinates, the mean squared distance grows like $d$ and its standard deviation like $\sqrt d$, so all pairwise distances become nearly equal (relative spread $\propto 1/\sqrt d$).` },
        { id: 'ml05-1-c5', kind: 'concept', front: md`Why standardize features before k-NN?`, back: md`Distances add squared differences across features, so a feature with large units dominates. Standardizing gives each feature comparable influence.` },
      ],
    },
    // ------------------------------------------------------------------ 5.2
    {
      id: 'ml05-2',
      title: 'k-means and Gaussian mixtures',
      minutes: 40,
      objectives: [
        "State the k-means objective and run one iteration of Lloyd's algorithm by hand.",
        'Prove that neither step of Lloyd\'s algorithm increases the objective, and explain why it can stop at a poor local minimum.',
        'Explain k-means++ initialization and choose k with the elbow method and the silhouette score.',
        'Recognize when k-means fails and describe a Gaussian mixture fitted by EM as a soft version of k-means.',
        'Implement vectorized k-means iterations in NumPy.',
      ],
      cells: [
        {
          kind: 'text',
          md: md`Clustering groups unlabelled points so that points in a group are similar. Uses include customer segmentation, grouping documents or images, compressing colours of an image, and vector quantization: the inverted-file indexes of vector databases assign every embedding to the nearest of a few thousand k-means centroids and search only a few of those groups at query time.`,
        },
        {
          kind: 'callout',
          tone: 'definition',
          title: 'k-means',
          md: md`Choose $k$ centres $\bmu_1, \dots, \bmu_k$ and an assignment $c(i) \in \{1, \dots, k\}$ of each point to minimize the within-cluster sum of squares
$$J = \sum_{i=1}^n \lVert\bx_i - \bmu_{c(i)}\rVert^2.$$
**Lloyd's algorithm** alternates two steps until the assignments stop changing:
1. **assign**: $c(i) \leftarrow \argmin_j \lVert\bx_i - \bmu_j\rVert^2$;
2. **update**: $\bmu_j \leftarrow$ the mean of the points assigned to cluster $j$.`,
        },
        {
          kind: 'viz',
          viz: { type: 'ml.kmeans', data: 'blobs', k: 3, init: 'random', seed: 4 },
          task: md`Step through the algorithm and watch $J$ in the plot below: does it ever go up? Press **new initialization** several times with random initialization until you find a run that ends with a higher $J$ than the others. What went wrong in that run? Then switch to k-means++.`,
          caption: md`Each half-step is one assign or one update. Dashed segments show how the centres move in an update step. With random initialization two centres can start in the same blob and the algorithm settles with one blob split in two and two blobs merged.`,
        },
        {
          kind: 'derive',
          title: "Lloyd's algorithm never increases J",
          goal: md`Show that each step of Lloyd's algorithm leaves $J$ unchanged or lowers it, and conclude that the algorithm stops after finitely many steps.`,
          steps: [
            { md: md`**Assign step.** The centres are fixed. Each term $\lVert\bx_i - \bmu_{c(i)}\rVert^2$ depends only on $c(i)$, and choosing the nearest centre makes each term as small as possible, so it cannot increase.` },
            {
              md: md`**Update step.** The assignment is fixed and $J$ splits into one sum per cluster: $\sum_{i \in C_j}\lVert\bx_i - \bmu_j\rVert^2$. Its gradient in $\bmu_j$ is $-2\sum_{i\in C_j}(\bx_i - \bmu_j)$, which is zero exactly at the mean of the cluster. The function is a convex quadratic, so the mean is its minimizer.`,
              choose: {
                prompt: md`For a fixed set of points, which centre minimizes the sum of **squared** Euclidean distances to them?`,
                options: [md`The mean`, md`The coordinate-wise median`, md`The point of the set nearest to all the others`],
                answer: 0,
                explain: md`Setting the gradient $-2\sum(\bx_i - \bmu)$ to zero gives the mean. The median minimizes the sum of absolute (L1) distances instead, which is the k-medians variant.`,
              },
            },
            {
              md: md`$J \ge 0$ never increases. There are finitely many assignments (at most $k^n$), and an assignment can only repeat if $J$ stays the same, at which point the algorithm stops. So it terminates.`,
              choose: {
                prompt: md`Why must Lloyd's algorithm terminate?`,
                options: [md`$J$ never increases and there are only finitely many possible assignments`, md`$J$ is convex in the centres and the assignments`, md`The centres move by less each step`],
                answer: 0,
                explain: md`$J$ is not jointly convex (the assignment is discrete), which is why only a local minimum is guaranteed. Finiteness of the assignments plus monotonicity gives termination.`,
              },
            },
          ],
          takeaway: md`Lloyd's algorithm is coordinate descent on $J$: exact minimization over the assignments, then over the centres. It finds a local minimum, which depends on the initialization, so implementations run several initializations and keep the lowest $J$ (\`n_init\` in scikit-learn).`,
        },
        {
          kind: 'numeric',
          q: md`Points $A(1,1)$, $B(1,3)$, $C(5,1)$, $D(6,3)$, $E(4,4)$; initial centres $\bmu_1 = (0, 2)$, $\bmu_2 = (3, 3)$. Do one assign step and one update step. Enter the new centres as a matrix with one row per centre.`,
          answer: { kind: 'matrix', value: [[1, 2], [5, 2.666667]], tol: 1e-3 },
          inputHint: 'e.g. [[1, 2], [5, 2.667]]',
          hints: [md`Squared distances to $\bmu_1$ and $\bmu_2$: $A$: 2 and 8; $B$: 2 and 4; $C$: 26 and 8; $D$: 37 and 9; $E$: 20 and 2.`],
          explain: md`$A, B \to$ cluster 1; $C, D, E \to$ cluster 2. New centres: $\bmu_1 = (1, 2)$ and $\bmu_2 = \big(\tfrac{5+6+4}{3}, \tfrac{1+3+4}{3}\big) = (5, 2.667)$. $J$ fell from 23 (after the assign step) to 8.67.`,
        },
        {
          kind: 'callout',
          tone: 'definition',
          title: 'k-means++ initialization (Arthur and Vassilvitskii, 2007)',
          md: md`Pick the first centre uniformly at random from the data. Then repeat until there are $k$ centres: let $D(\bx)$ be the distance from $\bx$ to the nearest centre chosen so far, and pick the next centre at random with probability proportional to $D(\bx)^2$. Far-away points are likely to be chosen, so the centres start spread out. The expected $J$ of the initialization alone is within a factor $O(\log k)$ of the optimum, and Lloyd's iterations only improve it. It is the default in scikit-learn.`,
        },
        {
          kind: 'numeric',
          q: md`k-means++ has chosen its first centre. The remaining three points are at distances 1, 2 and 3 from it. What is the probability that the farthest point becomes the second centre?`,
          answer: { kind: 'number', value: 0.642857, tol: 1e-3 },
          explain: md`Weights $D^2$: $1, 4, 9$, total $14$. The farthest point is chosen with probability $9/14 = 0.643$.`,
        },
        {
          kind: 'code',
          code: `import numpy as np

def kmeans(X, k, seed, iters=50):
    np.random.seed(seed)
    C = X[np.random.choice(len(X), k, replace=False)]     # k random points as initial centres
    for _ in range(iters):
        labels = ((X[:, None] - C[None]) ** 2).sum(axis=2).argmin(axis=1)
        C = np.array([X[labels == j].mean(axis=0) for j in range(k)])
    return ((X - C[labels]) ** 2).sum()

np.random.seed(0)
centres = np.array([[0, 0], [6, 0], [0, 6], [6, 6]])
X = np.vstack([c + np.random.randn(50, 2) for c in centres])
print([round(float(kmeans(X, 4, s)), 1) for s in range(8)])`,
          note: md`Eight random initializations on four well-separated blobs. Most runs reach the same $J$; one gets stuck with about three times the error: two centres share one blob while a single centre covers two. Keeping the best of several runs fixes it.`,
        },
        {
          kind: 'text',
          md: md`### Choosing $k$

The optimal $J$ always decreases as $k$ grows (with $k = n$ it is 0), so $J$ cannot be minimized over $k$.

- **Elbow method.** Plot $J$ against $k$ and look for the point after which adding clusters gives little improvement. Often there is no clear elbow.
- **Silhouette.** For point $i$, let $a(i)$ be its mean distance to the other points of its cluster and $b(i)$ the mean distance to the points of the nearest other cluster. Then $s(i) = \dfrac{b(i) - a(i)}{\max(a(i), b(i))} \in [-1, 1]$. Values near 1 mean well inside its cluster, near 0 on a border, negative probably in the wrong cluster. Choose the $k$ with the highest mean silhouette.
- **Other criteria**: the gap statistic, BIC for Gaussian mixtures, stability of the clusters under resampling, and, often the most important, what the clusters are for: a marketing team may only be able to act on 5 segments.`,
        },
        {
          kind: 'viz',
          viz: { type: 'ml.choose-k', data: 'clear', k: 2 },
          task: md`For the separated data, where is the elbow and which $k$ has the highest silhouette? Switch to the overlapping data: are the two methods still clear and do they agree?`,
          caption: md`Both curves come from the best of six k-means++ runs for each $k$.`,
        },
        {
          kind: 'numeric',
          q: md`A point has mean distance $a = 2$ to the other members of its cluster and mean distance $b = 5$ to the members of the nearest other cluster. What is its silhouette value?`,
          answer: { kind: 'number', value: 0.6 },
          explain: md`$s = (5 - 2)/\max(2, 5) = 3/5 = 0.6$.`,
        },
        {
          kind: 'text',
          md: md`### When k-means fails

$J$ uses squared Euclidean distance to a single centre, so k-means prefers convex, roughly spherical clusters of similar spread. It struggles with:

- **elongated or correlated clusters**: the boundary between two centres is the perpendicular bisector, which may cut a stretched cluster in two;
- **very different sizes or densities**: a large, wide cluster tends to be split while small tight ones get merged;
- **non-convex shapes** such as rings or moons: no placement of centres separates them;
- **unscaled features and outliers**: units dominate distances, and a far outlier can capture a centre for itself.

Alternatives: Gaussian mixtures with full covariances for elongated clusters, DBSCAN or HDBSCAN for arbitrary shapes and noise, spectral clustering for graph-like structure.`,
        },
        {
          kind: 'viz',
          viz: { type: 'ml.kmeans', data: 'aniso', k: 3, init: 'pp', seed: 1 },
          task: md`Run k-means++ on the stretched clusters. Does the converged result match the three diagonal clusters you see? Try a few initializations. Then try the **rings** data with $k = 2$.`,
          caption: md`The stretched clusters are three parallel ellipses. k-means cuts across them because it can only draw straight boundaries halfway between centres.`,
        },
        {
          kind: 'check',
          q: md`Which data set will k-means with the right $k$ cluster correctly most reliably?`,
          options: [md`Three round, well-separated blobs of similar size`, md`Two concentric rings`, md`One large diffuse cluster next to two small tight ones`, md`Three long parallel bands`],
          answer: 0,
          explain: md`The objective rewards compact, spherical clusters of similar spread. The other three violate those assumptions and are classic failure cases.`,
        },
        {
          kind: 'callout',
          tone: 'definition',
          title: 'Gaussian mixture model and EM',
          md: md`A **Gaussian mixture** models the density as $p(\bx) = \sum_{j=1}^k \pi_j\,\mathcal{N}(\bx;\bmu_j, \Sigma_j)$, with mixing weights $\pi_j \ge 0$ summing to 1. It is fitted by maximum likelihood with **expectation–maximization (EM)**:

- **E-step**: responsibilities $r_{ij} = \dfrac{\pi_j\,\mathcal{N}(\bx_i; \bmu_j, \Sigma_j)}{\sum_l \pi_l\,\mathcal{N}(\bx_i; \bmu_l, \Sigma_l)}$, the posterior probability that point $i$ came from component $j$;
- **M-step**: with $N_j = \sum_i r_{ij}$, set $\pi_j = N_j/n$, $\bmu_j = \frac{1}{N_j}\sum_i r_{ij}\bx_i$, $\Sigma_j = \frac{1}{N_j}\sum_i r_{ij}(\bx_i - \bmu_j)(\bx_i - \bmu_j)\T$.

Each iteration never decreases the log-likelihood. **k-means is the limit** of EM with $\Sigma_j = \sigma^2 I$, equal weights and $\sigma \to 0$: the responsibilities become 0 or 1 (nearest centre) and the M-step becomes the cluster mean.`,
        },
        {
          kind: 'viz',
          viz: { type: 'ml.gmm-em', iters: 30, seed: 3 },
          task: md`Play the EM iterations. Watch the ellipses take the shape of the clusters and the log-likelihood rise. Drag the probe between two clusters and read its responsibilities.`,
          caption: md`Point colours mix the component colours by responsibility. Unlike k-means, a GMM keeps the uncertainty of points between clusters, and its full covariances fit the elongated cluster.`,
        },
        {
          kind: 'paper',
          problem: {
            id: 'ml05-2-paper',
            title: 'Lloyd\'s algorithm stuck in a local minimum',
            type: 'compute',
            difficulty: 2,
            minutes: 12,
            statement: md`One-dimensional data $1, 2, 3, 8, 9, 10, 25$ and $k = 2$, with initial centres $\mu_1 = 1$, $\mu_2 = 2$.

(a) Run Lloyd's algorithm to convergence. (b) Compute $J$ at convergence. (c) Compute $J$ for the partition $\{1, 2, 3, 8, 9, 10\}$, $\{25\}$ and comment. Enter the final centres and the final $J$ from (b).`,
            solution: [
              md`Iteration 1. Assign: $1 \to \mu_1$; every other point is nearer to $2$. Update: $\mu_1 = 1$, $\mu_2 = (2+3+8+9+10+25)/6 = 9.5$.`,
              md`Iteration 2. Assign: $2$ and $3$ are nearer to 1 than to 9.5; $8, 9, 10, 25$ go to $\mu_2$. Update: $\mu_1 = 2$, $\mu_2 = (8+9+10+25)/4 = 13$.`,
              md`Iteration 3. Assign: $8$ is at distance 6 from 2 and 5 from 13, so nothing changes. Converged at $\mu = (2, 13)$.`,
              md`(b) $J = (1 + 0 + 1) + (25 + 16 + 9 + 144) = 196$.`,
              md`(c) $\{1,\dots,10\}$ has mean 5.5 and sum of squares $77.5$; $\{25\}$ contributes 0. $J = 77.5 < 196$. Lloyd's algorithm stopped at a local minimum; a different initialization (or k-means++, which would likely pick 25 as a centre) finds the better solution. The outlier 25 is also why the "natural" clusters $\{1,2,3\}$, $\{8,9,10\}$ cannot both be found with $k = 2$.`,
            ],
            answer: { kind: 'vector', value: [2, 13, 196] },
            rubric: [md`Assignments recomputed from the current centres each iteration`, md`Correct convergence point and $J$`, md`Better partition found and the local minimum explained`],
          },
        },
        {
          kind: 'exercise',
          ex: {
            id: 'ml05-ex-kmeans',
            title: 'Vectorized k-means steps',
            prompt: md`Write the two steps of Lloyd's algorithm without Python loops.

- \`assign(X, C)\`: for data \`X\` of shape \`(n, d)\` and centres \`C\` of shape \`(k, d)\`, return the index of the nearest centre for every row (shape \`(n,)\`). Use broadcasting to get all squared distances, shape \`(n, k)\`.
- \`update(X, labels, k)\`: return the \`(k, d)\` array of cluster means. Build the one-hot matrix \`M = (labels[:, None] == np.arange(k))\` of shape \`(n, k)\`; then \`M.T @ X\` holds the per-cluster sums. Assume no cluster is empty.`,
            starter: `import numpy as np

def assign(X, C):
    # TODO
    return np.zeros(len(X), dtype=int)

def update(X, labels, k):
    # TODO
    return np.zeros((k, X.shape[1]))
`,
            solution: `import numpy as np

def assign(X, C):
    D = ((X[:, None, :] - C[None, :, :]) ** 2).sum(axis=2)
    return D.argmin(axis=1)

def update(X, labels, k):
    M = (labels[:, None] == np.arange(k)).astype(float)
    return (M.T @ X) / M.sum(axis=0)[:, None]
`,
            tests: [
              { expr: 'assign(np.array([[1.0, 1.0], [1.0, 3.0], [5.0, 1.0], [6.0, 3.0], [4.0, 4.0]]), np.array([[0.0, 2.0], [3.0, 3.0]])).tolist()', label: 'assign (the hand example)' },
              { expr: 'np.round(update(np.array([[1.0, 1.0], [1.0, 3.0], [5.0, 1.0], [6.0, 3.0], [4.0, 4.0]]), np.array([0, 0, 1, 1, 1]), 2), 6).tolist()', label: 'update (the hand example)' },
              { expr: 'np.round(update(np.arange(16.0).reshape(8, 2), assign(np.arange(16.0).reshape(8, 2), np.array([[0.0, 0.0], [7.0, 7.0], [15.0, 15.0]])), 3), 6).tolist()', label: 'assign then update, three clusters' },
            ],
            hints: [md`\`X[:, None, :] - C[None, :, :]\` has shape \`(n, k, d)\`.`, md`\`M.sum(axis=0)\` counts the points in each cluster; divide the sums by it with \`[:, None]\` so the shapes broadcast.`],
            mustExclude: ['for '],
          },
        },
        {
          kind: 'explain',
          prompt: md`An interviewer asks: *how do you choose k in k-means?*`,
          model: md`First, what the clusters are for often fixes or bounds $k$. Then, since $J$ always falls as $k$ grows, I compare $k$ values with criteria that penalize extra clusters: the elbow of the $J$ curve, the mean silhouette (pick the maximum), the gap statistic, or BIC if I fit a Gaussian mixture instead. I run k-means++ with several restarts for each $k$, so a bad local minimum does not distort the curve, and I check stability: clusters that reappear when I resample the data are more trustworthy. Finally I look at the clusters themselves, their sizes and their centroids in original units, and check that they are useful downstream. If the elbow and silhouette are flat, the data may not have clear cluster structure, and the choice of $k$ is then a product decision rather than a statistical one.`,
        },
      ],
      cards: [
        { id: 'ml05-2-c1', kind: 'concept', front: md`State the k-means objective and the two steps of Lloyd's algorithm.`, back: md`$J = \sum_i \lVert\bx_i - \bmu_{c(i)}\rVert^2$. Assign each point to its nearest centre; move each centre to the mean of its points. Repeat until assignments stop changing.` },
        { id: 'ml05-2-c2', kind: 'compute', front: md`1-D points $0, 2, 10$ with centres $1$ and $9$: what is the new second centre after one Lloyd iteration?`, answer: { kind: 'number', value: 10 }, back: md`$0$ and $2$ go to centre 1, $10$ goes to centre 2, whose mean is $10$.` },
        { id: 'ml05-2-c3', kind: 'cloze', text: md`k-means++ picks each new centre with probability proportional to the {{}} distance to the nearest chosen centre.`, answers: ['squared'] },
        { id: 'ml05-2-c4', kind: 'concept', front: md`Define the silhouette of a point.`, back: md`$s = (b - a)/\max(a, b)$, with $a$ the mean distance to its own cluster and $b$ the mean distance to the nearest other cluster. Near 1: well clustered; near 0: on a border; negative: likely misassigned.` },
        { id: 'ml05-2-c5', kind: 'concept', front: md`How is k-means related to a Gaussian mixture fitted by EM?`, back: md`It is the limit of EM with equal weights, shared spherical covariance $\sigma^2 I$ and $\sigma \to 0$: responsibilities become hard nearest-centre assignments and the M-step becomes the mean.` },
      ],
    },
    // ------------------------------------------------------------------ 5.3
    {
      id: 'ml05-3',
      title: 'Dimensionality reduction, visualization and anomaly detection',
      minutes: 35,
      objectives: [
        'Use PCA as a practical tool: choose the number of components from explained variance and fit it on training data only.',
        'State what t-SNE and UMAP preserve and what they distort, and read their plots without over-interpreting cluster sizes and distances.',
        'Compute a Mahalanobis distance and explain why it catches anomalies that per-feature z-scores miss.',
        'Choose a threshold for an anomaly detector from a contamination rate or a distributional assumption, and name the main families of detectors.',
      ],
      cells: [
        {
          kind: 'text',
          md: md`The linear algebra part derived PCA: the principal directions are the eigenvectors of the covariance matrix (the right singular vectors of the centred data), and projecting onto the top $m$ of them keeps the most variance any $m$-dimensional linear projection can keep. In practice PCA is used to:

- **compress** features (fewer inputs, faster k-NN, smaller embeddings);
- **decorrelate and denoise**, by dropping low-variance directions that are mostly noise;
- **visualize** data in 2-D or 3-D with distances and directions that are faithful along the kept axes;
- **diagnose**: the explained-variance spectrum shows how many directions carry the data.

The **explained variance ratio** of component $j$ is $\lambda_j/\sum_l \lambda_l$, where the $\lambda$ are the eigenvalues of the covariance matrix.`,
        },
        {
          kind: 'callout',
          tone: 'warning',
          title: 'Using PCA correctly',
          md: md`- Fit the mean and the components on the **training data only**, then apply the same transform to validation and test data. Fitting on everything is preprocessing leakage.
- **Standardize** first when features have different units; otherwise the component with the largest units dominates.
- High variance is not the same as usefulness for the label. A low-variance direction can be the one that separates the classes, and PCA would drop it.
- PCA is linear. Curved structure needs nonlinear methods, or a learned embedding.`,
        },
        {
          kind: 'numeric',
          q: md`The covariance matrix of 5 standardized features has eigenvalues $5, 3, 1, 0.5, 0.5$. What is the smallest number of components that explains at least 90% of the variance?`,
          answer: { kind: 'number', value: 3 },
          explain: md`The total is 10. Cumulative ratios: $0.5$, $0.8$, $0.9$. Three components reach 90%.`,
        },
        {
          kind: 'code',
          code: `import numpy as np

np.random.seed(1)
Z = np.random.randn(500, 2)                                  # 2 hidden factors
W = np.array([[3.0, 1.0, 0.5, 2.0, 0.0],
              [0.0, 1.0, 2.0, -1.0, 1.5]])
X = Z @ W + 0.3 * np.random.randn(500, 5)                    # 5 observed features
Xc = X - X.mean(axis=0)
U, s, Vt = np.linalg.svd(Xc, full_matrices=False)
ratio = s ** 2 / (s ** 2).sum()
print(np.round(ratio, 3))
print(np.round(np.cumsum(ratio), 3))
X2 = Xc @ Vt[:2].T                                           # coordinates on the top 2 components
print(X2.shape)`,
          note: md`Five features generated from two hidden factors plus noise: the first two components explain about 99% of the variance and the rest is noise. The squared singular values of the centred data are $n$ times the covariance eigenvalues, so their ratios are the explained-variance ratios.`,
        },
        {
          kind: 'text',
          md: md`### t-SNE and UMAP for visualization

**t-SNE** (van der Maaten and Hinton, 2008) turns distances into neighbour probabilities. In the original space, point $j$ is a neighbour of $i$ with probability proportional to a Gaussian kernel $e^{-\lVert\bx_i - \bx_j\rVert^2/2\sigma_i^2}$, where each bandwidth $\sigma_i$ is chosen so that the **perplexity** (roughly, the effective number of neighbours) is the same for every point. In the 2-D map it uses a heavy-tailed Student-t kernel $(1 + \lVert\by_i - \by_j\rVert^2)^{-1}$, and it moves the map points to minimize $\KL(P\Vert Q)$ between the two sets of probabilities. The KL divergence heavily penalizes placing true neighbours far apart, and barely penalizes placing non-neighbours too close or too far.

**UMAP** (McInnes, Healy and Melville, 2018) builds a weighted k-nearest-neighbour graph and optimizes a cross-entropy between graph edges and map distances. It is faster, scales to millions of points and keeps somewhat more global structure, but it shares the same caveats.

Both preserve **local neighbourhoods**. Because each point gets its own bandwidth, dense and sparse regions are equalized, so cluster **sizes** and **densities** are not meaningful; and since only neighbours are matched, **distances between clusters** are not meaningful either.`,
        },
        {
          kind: 'viz',
          viz: { type: 'ml.tsne', perplexity: 30, view: 'tsne' },
          task: md`Compare the two columns of the table: in the 10-D data, cluster B is about 5 times wider than A, and C is about 3 times farther from A than B is. What does the t-SNE plot show? Re-run with new seeds and other perplexities, then switch to PCA.`,
          caption: md`t-SNE separates the three groups cleanly, but it gives A and B almost the same size and changes the ratio of the distances from run to run. PCA keeps sizes and distances along its two axes because it is a linear projection.`,
        },
        {
          kind: 'callout',
          tone: 'warning',
          title: 'Reading a t-SNE or UMAP plot',
          md: md`- Points that are close in the plot were usually close in the original space. Separate groups in the plot usually reflect real separation, provided they persist across seeds and perplexities.
- Do **not** read cluster sizes, densities or the distances between clusters from the plot.
- Random noise can show apparent structure at small perplexity; check against several settings.
- Do not use t-SNE coordinates as features for a model or cluster on them; cluster in the original or PCA space and use the plot only to look. (Standard t-SNE also has no way to embed new points.)`,
        },
        {
          kind: 'check',
          q: md`A t-SNE plot of user embeddings shows a large, spread-out cluster of casual users and a small tight cluster of power users far from it. What can you conclude?`,
          options: [
            md`The two groups are probably distinct in the embedding space; nothing about their relative spread or how far apart they are`,
            md`Casual users are more diverse than power users`,
            md`Power users are the most different from everyone else`,
            md`The embedding has two dimensions that matter`,
          ],
          answer: 0,
          explain: md`t-SNE equalizes densities through per-point bandwidths and only matches neighbour relations, so sizes and between-cluster distances in the plot carry little information. Check spread and separation in the original space, for example with distances to centroids.`,
        },
        {
          kind: 'text',
          md: md`### Anomaly detection

An **anomaly** (outlier) is a point that is unlikely under the distribution of normal data: a fraudulent transaction, a failing machine, a corrupted record. Labels are usually missing or very rare, so detectors score points by how unusual they are, and a threshold turns scores into alerts.

- **Per-feature z-scores**: flag $|x_j - \mu_j|/\sigma_j > t$ on any feature. Simple, but blind to unusual **combinations** of normal values.
- **Mahalanobis distance**: $d_M(\bx) = \sqrt{(\bx - \bmu)\T\Sigma^{-1}(\bx - \bmu)}$, distance in units of the data's own spread and correlation. Under a Gaussian model it is the natural score.
- **k-NN distance** and **local outlier factor**: far from its neighbours, or much sparser than its neighbours' neighbourhoods. No shape assumption; costs a neighbour search.
- **Isolation forest** (Liu, Ting and Zhou, 2008): random trees with random splits; anomalies are isolated after few splits, so a short average path length means anomalous. Fast and a strong default for tabular data.
- **Reconstruction error** of an autoencoder or of PCA: normal points are reconstructed well, unusual ones are not.`,
        },
        {
          kind: 'viz',
          viz: { type: 'ml.anomaly', method: 'z', q: 4 },
          task: md`With z-scores at 4%, which planted anomalies are missed? Switch to Mahalanobis: how many planted anomalies are caught now, and how many normal points are flagged? Then try the k-NN distance.`,
          caption: md`The data are strongly correlated ($\rho = 0.85$). Three planted points lie against the correlation without being extreme on any single feature: z-scores miss them, Mahalanobis distance does not.`,
        },
        {
          kind: 'derive',
          title: 'Mahalanobis distance is Euclidean distance after whitening',
          goal: md`Let $\Sigma = LL\T$ (a Cholesky factorization, $L$ invertible). Show that $d_M(\bx)^2 = \lVert\bz\rVert^2$ for $\bz = L^{-1}(\bx - \bmu)$, and that $\bz$ has identity covariance.`,
          steps: [
            {
              md: md`$\Sigma^{-1} = (LL\T)^{-1} = L^{-\top}L^{-1}$, so $$(\bx - \bmu)\T\Sigma^{-1}(\bx - \bmu) = (L^{-1}(\bx - \bmu))\T(L^{-1}(\bx - \bmu)) = \bz\T\bz.$$`,
              choose: {
                prompt: md`What is $(LL\T)^{-1}$?`,
                options: [md`$L^{-\top}L^{-1}$`, md`$L^{-1}L^{-\top}$`, md`$L\T L$`],
                answer: 0,
                explain: md`The inverse of a product reverses the order: $(AB)^{-1} = B^{-1}A^{-1}$, with $A = L$ and $B = L\T$.`,
              },
            },
            {
              md: md`$\Cov(\bz) = L^{-1}\Cov(\bx)L^{-\top} = L^{-1}LL\T L^{-\top} = I$.`,
              choose: {
                prompt: md`How does a covariance matrix transform under $\bz = A\bx$?`,
                options: [md`$\Cov(\bz) = A\,\Cov(\bx)\,A\T$`, md`$\Cov(\bz) = A\T\Cov(\bx)A$`, md`$\Cov(\bz) = A^2\Cov(\bx)$`],
                answer: 0,
                explain: md`$\E[(A\bx)(A\bx)\T] = A\,\E[\bx\bx\T]A\T$ for centred $\bx$.`,
              },
            },
            { md: md`So $\bz$ has uncorrelated coordinates with unit variance ("whitened"), and the Mahalanobis distance of $\bx$ is the ordinary Euclidean length of $\bz$. Its contours $d_M = t$ are ellipses aligned with the eigenvectors of $\Sigma$, the shape of the dashed boundary in the figure.` },
          ],
          takeaway: md`If $\bx \sim \mathcal{N}(\bmu, \Sigma)$ in $d$ dimensions, then $\bz \sim \mathcal{N}(\bzero, I)$ and $d_M^2 = \sum_j z_j^2$ follows a $\chi^2_d$ distribution. That gives principled thresholds, as long as the Gaussian model is reasonable and $\bmu, \Sigma$ are estimated robustly (outliers inflate the sample covariance).`,
        },
        {
          kind: 'numeric',
          q: md`$\Sigma = \begin{bmatrix} 1 & 0.8 \\ 0.8 & 1 \end{bmatrix}$ and $\bx - \bmu = (1, -1)$. Compute the squared Mahalanobis distance. (The squared Euclidean distance is 2.)`,
          answer: { kind: 'number', value: 10, tol: 1e-4 },
          hints: [md`$\Sigma^{-1} = \dfrac{1}{0.36}\begin{bmatrix} 1 & -0.8 \\ -0.8 & 1 \end{bmatrix}$.`],
          explain: md`$\bv\T\Sigma^{-1}\bv = \frac{1}{0.36}(1 + 1.6 + 1) = \frac{3.6}{0.36} = 10$. Against the correlation, one unit on each feature is a very unusual step: $d_M = 3.16$, while $(1, 1)$ would give $d_M^2 = 0.4/0.36 = 1.11$.`,
        },
        {
          kind: 'paper',
          problem: {
            id: 'ml05-3-paper',
            title: 'A threshold from the Gaussian model',
            type: 'derive',
            difficulty: 2,
            minutes: 12,
            statement: md`Normal data are modelled as $\bx \sim \mathcal{N}(\bmu, \Sigma)$ in two dimensions.

(a) Show that $P(d_M^2 > t) = e^{-t/2}$. (b) Choose the threshold $t$ on $d_M^2$ so that 1% of normal points are flagged. (c) Give two reasons why the observed false-alarm rate in production may differ from 1%. Enter $t$.`,
            hints: [md`Whiten to $\bz \sim \mathcal{N}(\bzero, I)$ and use polar coordinates: the radius $r$ has density $r\,e^{-r^2/2}$.`],
            solution: [
              md`(a) By the whitening result, $d_M^2 = z_1^2 + z_2^2$ with independent standard normals. In polar coordinates the density of $\bz$ is $\frac{1}{2\pi}e^{-r^2/2}$; integrating out the angle gives the radius density $r\,e^{-r^2/2}$.`,
              md`$P(r^2 > t) = \int_{\sqrt t}^\infty r\,e^{-r^2/2}\,dr = \big[-e^{-r^2/2}\big]_{\sqrt t}^\infty = e^{-t/2}$. ($\chi^2_2$ is an exponential distribution with mean 2.)`,
              md`(b) $e^{-t/2} = 0.01 \Rightarrow t = 2\ln 100 = 9.21$, i.e. flag $d_M > 3.03$.`,
              md`(c) The data are not exactly Gaussian (heavy tails give more alarms), $\bmu$ and $\Sigma$ are estimated (and inflated by any anomalies in the fitting data), and the normal distribution drifts over time. In practice, set the threshold from a target alert budget on recent data, or from labelled examples.`,
            ],
            answer: { kind: 'number', value: 9.21034, tol: 1e-3 },
            rubric: [md`Reduction to two independent standard normals`, md`Tail probability computed by integrating the radius density`, md`Threshold $2\ln 100$`, md`At least two realistic reasons for a different alarm rate`],
          },
        },
        {
          kind: 'exercise',
          ex: {
            id: 'ml05-ex-maha',
            title: 'Mahalanobis scores for many points',
            prompt: md`Write \`mahalanobis_sq(X, mu, S)\` that returns the squared Mahalanobis distance of every row of \`X\` (shape \`(n, d)\`) from \`mu\` under covariance \`S\`, as a 1-D array of length \`n\`. Avoid loops: with \`D = X - mu\`, the $i$-th quadratic form $\bd_i\T S^{-1}\bd_i$ is the $i$-th row sum of \`(D @ Sinv) * D\`.`,
            starter: `import numpy as np

def mahalanobis_sq(X, mu, S):
    D = X - mu
    return (D ** 2).sum(axis=1)      # Euclidean, ignores S
`,
            solution: `import numpy as np

def mahalanobis_sq(X, mu, S):
    D = X - mu
    return ((D @ np.linalg.inv(S)) * D).sum(axis=1)
`,
            tests: [
              { expr: 'np.round(mahalanobis_sq(np.array([[1.0, -1.0], [1.0, 1.0], [2.0, 0.0]]), np.zeros(2), np.array([[1.0, 0.8], [0.8, 1.0]])), 6).tolist()', label: 'the 2-D example' },
              { expr: 'np.round(mahalanobis_sq(np.array([[1.0, 0.0, 0.0], [0.0, 2.0, 0.0], [1.0, 1.0, 1.0]]), np.array([0.0, 0.0, 1.0]), np.diag([1.0, 4.0, 9.0])), 6).tolist()', label: 'diagonal covariance' },
            ],
            hints: [md`\`D @ Sinv\` has shape \`(n, d)\`; its $i$-th row is $\bd_i\T S^{-1}$. Multiply elementwise by \`D\` and sum each row.`],
            mustExclude: ['for '],
          },
        },
        {
          kind: 'explain',
          prompt: md`A colleague shows a UMAP plot of customer embeddings and says: "segment 3 is twice as diverse as segment 1, and segments 1 and 2 are nearly identical because they touch". How do you respond?`,
          model: md`UMAP and t-SNE are built to keep local neighbourhoods: points that are near each other in the embedding space should stay near in the plot. They do not keep densities or global distances: each point's neighbourhood is normalized to a similar size, so the area a cluster occupies says little about its spread, and the gap between clusters is not proportional to their distance. To compare diversity, I would compute the spread of each segment in the original space (for example the mean distance to its centroid); to compare segments, the distance between centroids or a classifier's ability to separate them. I would also check that the picture is stable across random seeds and the neighbours/perplexity parameter before drawing conclusions.`,
        },
        {
          kind: 'recall',
          prompt: md`Name four anomaly detectors, the assumption or idea behind each, and one way to set the threshold.`,
          answer: md`z-scores per feature (each feature roughly normal; misses unusual combinations); Mahalanobis distance (Gaussian with correlations; $d_M^2 \sim \chi^2_d$); k-NN distance or LOF (anomalies lie in sparse regions); isolation forest (anomalies are isolated by few random splits); also reconstruction error. Thresholds: a contamination rate or alert budget (flag the top $q\%$), a distributional quantile ($\chi^2$), or precision/recall on a labelled validation sample.`,
        },
      ],
      cards: [
        { id: 'ml05-3-c1', kind: 'concept', front: md`Three rules for using PCA in a pipeline.`, back: md`Fit it on training data only; standardize first when units differ; remember that high variance does not mean useful for the label (and that PCA is linear).` },
        { id: 'ml05-3-c2', kind: 'compute', front: md`Eigenvalues $6, 2, 1, 1$. Fraction of variance explained by the first two components?`, answer: { kind: 'number', value: 0.8 }, back: md`$(6 + 2)/10 = 0.8$.` },
        { id: 'ml05-3-c3', kind: 'concept', front: md`What do t-SNE and UMAP preserve, and what should you not read from their plots?`, back: md`They preserve local neighbourhoods. Do not read cluster sizes, densities or distances between clusters.` },
        { id: 'ml05-3-c4', kind: 'cloze', text: md`Mahalanobis distance is the Euclidean distance after {{}} the data.`, answers: ['whitening'] },
        { id: 'ml05-3-c5', kind: 'concept', front: md`How does an isolation forest score anomalies?`, back: md`It builds random trees with random features and split points; anomalies are isolated after few splits, so a short average path length from the root means a high anomaly score.` },
      ],
    },
  ],
  problems: [
    {
      id: 'ml05-p1',
      title: 'Distance-weighted vote',
      type: 'compute',
      difficulty: 1,
      minutes: 5,
      statement: md`The three nearest neighbours of a query are at distances $0.5$ (class A), $1.5$ (class B) and $2$ (class B). (a) What does the unweighted 3-NN vote predict? (b) With weights $1/d$, compute the total weight of A and of B. Enter the two totals from (b).`,
      solution: [md`(a) Two votes for B, one for A: predict B.`, md`(b) A: $1/0.5 = 2$. B: $1/1.5 + 1/2 = 0.667 + 0.5 = 1.167$. The weighted vote predicts A: one very close neighbour outweighs two distant ones.`],
      answer: { kind: 'vector', value: [2, 1.166667], tol: 1e-3 },
    },
    {
      id: 'ml05-p2',
      title: 'Concentration for Gaussian data',
      type: 'derive',
      difficulty: 2,
      minutes: 12,
      statement: md`Let $\bx, \by \sim \mathcal{N}(\bzero, I_d)$ be independent and $S = \lVert\bx - \by\rVert^2$. (a) Show $\E[S] = 2d$ and $\Var(S) = 8d$. (b) Find $\text{sd}(S)/\E[S]$. (c) Evaluate it for $d = 200$. Enter (c).`,
      hints: [md`Each coordinate of $\bx - \by$ is $\mathcal{N}(0, 2)$. For $w \sim \mathcal{N}(0, s^2)$: $\E[w^2] = s^2$ and $\E[w^4] = 3s^4$.`],
      solution: [
        md`$t_j = x_j - y_j \sim \mathcal{N}(0, 2)$ independently. $\E[t_j^2] = 2$ and $\Var(t_j^2) = \E[t_j^4] - 4 = 3 \cdot 4 - 4 = 8$.`,
        md`(a) Summing $d$ independent terms: $\E[S] = 2d$, $\Var(S) = 8d$.`,
        md`(b) $\sqrt{8d}/(2d) = \sqrt{2/d}$.`,
        md`(c) $\sqrt{2/200} = 0.1$. Same $1/\sqrt d$ law as for the uniform cube, with a different constant.`,
      ],
      answer: { kind: 'number', value: 0.1 },
      rubric: [md`Distribution of a coordinate difference identified`, md`Fourth moment of a Gaussian used correctly`, md`Ratio $\sqrt{2/d}$ and its $1/\sqrt d$ scaling`],
      areas: ['math', 'ml-depth'],
    },
    {
      id: 'ml05-p3',
      title: 'Where the volume of a cube lives',
      type: 'compute',
      difficulty: 1,
      minutes: 6,
      statement: md`Data are uniform in $[0, 1]^d$. (a) In $d = 100$, what edge length must a sub-cube have to contain 1% of the data? (b) In $d = 50$, what fraction of the volume lies within $0.05$ of the boundary (outside the inner cube $[0.05, 0.95]^{50}$)? Enter both.`,
      solution: [md`(a) $0.01^{1/100} = e^{\ln(0.01)/100} = e^{-0.0461} = 0.955$.`, md`(b) The inner cube has volume $0.9^{50} = 0.00515$, so $1 - 0.00515 = 0.9949$ of the volume is within $0.05$ of the boundary. In high dimensions almost every point is near the edge in some coordinate.`],
      answer: { kind: 'vector', value: [0.954993, 0.994846], tol: 1e-3 },
    },
    {
      id: 'ml05-p4',
      title: 'k-means to convergence by hand',
      type: 'compute',
      difficulty: 2,
      minutes: 12,
      statement: md`Points $(0,0), (2,0), (0,2), (6,6), (8,6), (6,8)$, $k = 2$, initial centres $(0,0)$ and $(2,0)$. Run Lloyd's algorithm until the assignments stop changing. Enter the final centres as a matrix (one row per centre) and report the final $J$ in your solution.`,
      solution: [
        md`Iteration 1. Assign: $(0,0) \to 1$; $(2,0) \to 2$; $(0,2)$: squared distances 4 and 8, $\to 1$; the three far points are nearer to $(2,0)$, $\to 2$. Update: $\bmu_1 = (0, 1)$, $\bmu_2 = \big(\tfrac{2+6+8+6}{4}, \tfrac{0+6+6+8}{4}\big) = (5.5, 5)$.`,
        md`Iteration 2. $(2, 0)$: squared distance 5 to $(0,1)$ and $37.25$ to $(5.5, 5)$, so it moves to cluster 1. The rest stay. Update: $\bmu_1 = (\tfrac23, \tfrac23)$, $\bmu_2 = (\tfrac{20}{3}, \tfrac{20}{3})$.`,
        md`Iteration 3. No assignment changes: converged.`,
        md`$J$: each point of the first group is at squared distance $\tfrac89, \tfrac{20}{9}, \tfrac{20}{9}$ from its centre, total $\tfrac{48}{9} = 5.33$; the second group is symmetric. $J = 10.67$.`,
      ],
      answer: { kind: 'matrix', value: [[0.666667, 0.666667], [6.666667, 6.666667]], tol: 1e-3 },
    },
    {
      id: 'ml05-p5',
      title: 'Mean for squares, median for absolute values',
      type: 'proof',
      difficulty: 2,
      minutes: 12,
      statement: md`For real numbers $x_1, \dots, x_n$: (a) prove that $g(c) = \sum_i (x_i - c)^2$ is minimized by the mean; (b) prove that $h(c) = \sum_i |x_i - c|$ is minimized by any median; (c) explain what this means for k-means versus k-medians with an outlier in a cluster.`,
      hints: [md`For (b), look at how $h$ changes when $c$ moves right by a small amount: each point to the right of $c$ decreases $h$, each point to the left increases it.`],
      solution: [
        md`(a) $g'(c) = -2\sum_i (x_i - c) = 0 \iff c = \bar x$, and $g'' = 2n > 0$, so the mean is the unique minimizer. Equivalently $g(c) = g(\bar x) + n(c - \bar x)^2$.`,
        md`(b) $h$ is convex and piecewise linear. Away from data points, its slope is $(\#\{x_i < c\}) - (\#\{x_i > c\})$. The slope is negative while fewer than half the points are left of $c$ and positive once more than half are, so $h$ is minimized where the counts balance: at a median (any point between the two middle values when $n$ is even).`,
        md`(c) The mean moves in proportion to an outlier's value, so a single far point drags a k-means centre (and its squared distance dominates $J$). The median does not move however far the outlier goes, so k-medians (L1) is more robust.`,
      ],
      rubric: [md`Derivative or completing the square for the mean`, md`Slope argument (or subgradient) for the median`, md`Robustness consequence stated`],
      areas: ['math'],
    },
    {
      id: 'ml05-p6',
      title: 'A k-means++ draw',
      type: 'compute',
      difficulty: 1,
      minutes: 4,
      statement: md`The first k-means++ centre is $(0, 0)$. The other points are $(1, 0)$, $(0, 2)$ and $(3, 4)$. What is the probability that $(3, 4)$ is chosen as the second centre?`,
      solution: [md`Squared distances to the chosen centre: $1$, $4$, $25$. Total $30$.`, md`$P = 25/30 = 0.833$.`],
      answer: { kind: 'number', value: 0.833333, tol: 1e-3 },
    },
    {
      id: 'ml05-p7',
      title: 'Silhouette of one point',
      type: 'compute',
      difficulty: 1,
      minutes: 5,
      statement: md`Point $i$ is in cluster A. Its distances to the other members of A are $1, 2, 3$. Its distances to the members of cluster B are $4, 6$, and to the members of cluster C are $3, 5$. Compute its silhouette value.`,
      solution: [md`$a = (1 + 2 + 3)/3 = 2$. Mean distance to B: 5; to C: 4. The nearest other cluster is C, so $b = 4$.`, md`$s = (4 - 2)/\max(2, 4) = 0.5$.`],
      answer: { kind: 'number', value: 0.5 },
    },
    {
      id: 'ml05-p8',
      title: 'An E-step by hand',
      type: 'compute',
      difficulty: 2,
      minutes: 8,
      statement: md`A 1-D Gaussian mixture has components $\mathcal{N}(0, 1)$ with weight $0.3$ and $\mathcal{N}(2, 1)$ with weight $0.7$. Compute the responsibility of the first component for the point $x = 0$.`,
      hints: [md`The common factor $1/\sqrt{2\pi}$ cancels.`],
      solution: [md`Unnormalized: $0.3\,e^{0} = 0.3$ and $0.7\,e^{-(0-2)^2/2} = 0.7e^{-2} = 0.0947$.`, md`$r_1 = 0.3/(0.3 + 0.0947) = 0.760$. The point sits on the mean of component 1, but component 2's larger weight still claims a quarter of it.`],
      answer: { kind: 'number', value: 0.760004, tol: 1e-3 },
    },
    {
      id: 'ml05-p9',
      title: 'A 5% Mahalanobis threshold',
      type: 'compute',
      difficulty: 1,
      minutes: 5,
      statement: md`Normal data are Gaussian in two dimensions. Find the threshold on $d_M^2$ that flags 5% of normal points, and the corresponding threshold on $d_M$. Use $P(d_M^2 > t) = e^{-t/2}$. Enter both.`,
      solution: [md`$e^{-t/2} = 0.05 \Rightarrow t = 2\ln 20 = 5.99$.`, md`$d_M > \sqrt{5.99} = 2.45$. In one dimension the 5% two-sided threshold would be $1.96$; in two dimensions the same rate needs a larger radius.`],
      answer: { kind: 'vector', value: [5.991465, 2.447747], tol: 1e-3 },
    },
    {
      id: 'ml05-p10',
      title: 'Reading a t-SNE plot',
      type: 'concept',
      difficulty: 2,
      minutes: 10,
      statement: md`A team embeds 50,000 support tickets and shows a t-SNE plot (perplexity 30) with 12 visible islands. They claim: (1) there are exactly 12 kinds of tickets; (2) island 7 is the most heterogeneous because it is the largest; (3) islands 2 and 9 are unrelated because they are far apart; (4) they will train a classifier on the 2-D t-SNE coordinates. Evaluate each claim and say what you would do instead.`,
      solution: [
        md`(1) The number of islands depends on perplexity, seed and the number of iterations; t-SNE can also split continuous structure. Check the number of clusters in the original (or PCA-reduced) space with a clustering method and stability across settings.`,
        md`(2) Island area is not a measure of spread: per-point bandwidths equalize densities. Compute spread in the embedding space, such as the mean distance to the centroid.`,
        md`(3) Distances between islands are not preserved. Compare centroids in the original space, or check nearest neighbours across groups.`,
        md`(4) t-SNE coordinates are a non-parametric visualization with no transform for new tickets, and they distort global structure. Train on the original embeddings (or PCA components fitted on training data).`,
      ],
      rubric: [md`Island count depends on settings and needs validation in the original space`, md`Sizes and inter-cluster distances not interpretable`, md`No t-SNE features for modelling; proposes original or PCA features`],
      areas: ['ml-breadth'],
    },
  ],
};
