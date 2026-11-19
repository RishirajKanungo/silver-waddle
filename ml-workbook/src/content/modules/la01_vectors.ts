import { md, type Module } from '../types';

export const MODULE: Module = {
  id: 'la01',
  part: 'la',
  order: 1,
  title: 'Vectors, dot products and norms',
  summary: 'Vectors as arrows and as lists of numbers, linear combinations and span, the dot product, projections, norms and distances.',
  relevance: md`Every input to a model is a vector: a row of features, an image flattened into pixels, a token embedding. Similarity search, attention scores and the outputs of a linear layer are dot products. L1 and L2 norms define regularization, the distances used by k-NN and k-means, and gradient clipping. Interviewers expect you to compute these by hand and to explain cosine similarity versus Euclidean distance.`,
  areas: ['math', 'ml-breadth'],
  lessons: [
    // ------------------------------------------------------------------ 1.1
    {
      id: 'la01-1',
      title: 'Vectors and linear combinations',
      minutes: 30,
      objectives: [
        'Read a vector as an arrow, as a point, and as a list of features.',
        'Add vectors and multiply them by scalars, by hand and geometrically.',
        'Find the coefficients that write one vector as a combination of two others.',
        'Say what the span of one or two vectors in the plane is.',
      ],
      cells: [
        {
          kind: 'text',
          md: md`A **vector** in $\R^n$ is an ordered list of $n$ real numbers. We write it as a column:

$$\bv = \begin{bmatrix} v_1 \\ v_2 \\ \vdots \\ v_n \end{bmatrix} \in \R^n.$$

There are three useful ways to read the same object:

- **An arrow** from the origin to the point $(v_1, \dots, v_n)$. It has a direction and a length.
- **A point** in space, when only the position matters.
- **A list of measurements.** A house might be $\bx = (1450, 3, 12)$: square feet, bedrooms, age in years. A word embedding in a language model is a list of 768 or 4096 numbers.

The geometry you can see in two and three dimensions carries over to $n$ dimensions unchanged, because every operation below is defined one component at a time.`,
        },
        {
          kind: 'callout',
          tone: 'notation',
          md: md`Vectors are bold lower case ($\bu, \bv, \bx$), scalars are plain ($a, c, \lambda$). Vectors are columns unless stated otherwise; $\bv\T$ is the same numbers as a row. The $i$-th component of $\bv$ is $v_i$. The zero vector is $\bzero$.`,
        },
        {
          kind: 'text',
          md: md`**Addition** and **scalar multiplication** act on each component:

$$\bu + \bv = \begin{bmatrix} u_1 + v_1 \\ \vdots \\ u_n + v_n \end{bmatrix}, \qquad c\,\bv = \begin{bmatrix} c v_1 \\ \vdots \\ c v_n \end{bmatrix}.$$

Geometrically, $\bu + \bv$ means: walk along $\bu$, then walk along $\bv$ from where you stopped (tip to tail). Doing it in the other order reaches the same point, which is why the two routes form a parallelogram whose diagonal is $\bu + \bv$. Multiplying by $c$ stretches the arrow by $|c|$, and a negative $c$ also reverses its direction.`,
        },
        {
          kind: 'viz',
          viz: { type: 'la.vectors', mode: 'add', u: [3, 1], v: [1, 2] },
          task: md`Drag $\bv$ so that $\bu + \bv$ lands exactly on $(0, 3)$. Which vector did $\bv$ have to be? Then switch to **c·u** and make $c$ negative.`,
          caption: md`The dashed arrows are the two tip-to-tail routes. Both end at $\bu + \bv$. To reach a target $\bw$ you need $\bv = \bw - \bu$; for $\bw = (0, 3)$ that is $(-3, 2)$.`,
        },
        {
          kind: 'check',
          q: md`For nonzero vectors $\bu$ and $\bv$, which statement is **always** true?`,
          options: [
            md`$\bu + \bv$ is the diagonal of the parallelogram with sides $\bu$ and $\bv$.`,
            md`The length of $\bu + \bv$ equals the length of $\bu$ plus the length of $\bv$.`,
            md`$\bu + \bv$ is longer than both $\bu$ and $\bv$.`,
            md`$\bu + \bv$ points between $\bu$ and $\bv$ only when they have the same length.`,
          ],
          answer: 0,
          explain: md`Lengths add only when the vectors point the same way. In general $\lVert\bu+\bv\rVert \le \lVert\bu\rVert + \lVert\bv\rVert$, the triangle inequality of lesson 1.3. If $\bv = -\bu$ the sum is $\bzero$, shorter than both.`,
        },
        {
          kind: 'numeric',
          q: md`Compute $3\begin{bmatrix} 2 \\ -1 \end{bmatrix} - 2\begin{bmatrix} 1 \\ 4 \end{bmatrix}$.`,
          answer: { kind: 'vector', value: [4, -11] },
          explain: md`Scale first, then subtract component by component: $(6, -3) - (2, 8) = (4, -11)$.`,
        },
        {
          kind: 'callout',
          tone: 'definition',
          title: 'Linear combination, span',
          md: md`A **linear combination** of $\bv_1, \dots, \bv_k$ is any vector $c_1\bv_1 + c_2\bv_2 + \dots + c_k\bv_k$ with scalars $c_i$. The **span** $\Span\{\bv_1, \dots, \bv_k\}$ is the set of all such combinations.`,
        },
        {
          kind: 'viz',
          viz: { type: 'la.vectors', mode: 'combo', u: [3, 1], v: [1, 2], a: 1, b: 1 },
          task: md`Set $a$ and $b$ so that $a\bu + b\bv = (5, 5)$. Then drag $\bv$ until it is parallel to $\bu$ and watch the shaded span collapse from the whole plane to a line.`,
          caption: md`Two vectors in $\R^2$ that are not parallel span the whole plane: every point is some $a\bu + b\bv$. Parallel vectors span only the line through them.`,
        },
        {
          kind: 'derive',
          title: 'finding the coefficients',
          goal: md`Write $\bw = (5, 5)$ as $a\bu + b\bv$ with $\bu = (3, 1)$ and $\bv = (1, 2)$.`,
          steps: [
            { md: md`Compare components. $a(3, 1) + b(1, 2) = (5, 5)$ means $$3a + b = 5, \qquad a + 2b = 5.$$` },
            {
              md: md`From the first equation $b = 5 - 3a$. Substitute into the second: $a + 2(5 - 3a) = 5$, so $-5a = -5$ and $a = 1$.`,
              choose: {
                prompt: md`Two equations, two unknowns. What is the most direct next move?`,
                options: [md`Solve one equation for one unknown and substitute it into the other.`, md`Add the two equations.`, md`Divide the first equation by the second.`],
                answer: 0,
                explain: md`Substitution (or elimination) removes one unknown. Adding the equations as they stand does not eliminate anything here, and dividing equations is not a valid operation.`,
              },
            },
            { md: md`Then $b = 5 - 3 \cdot 1 = 2$. Check: $1\cdot(3,1) + 2\cdot(1,2) = (3 + 2, 1 + 4) = (5, 5)$.` },
          ],
          takeaway: md`Finding the coefficients of a linear combination **is** solving a linear system. Module 3 does this systematically for any number of vectors and dimensions.`,
        },
        {
          kind: 'check',
          q: md`What is $\Span\left\{ \begin{bmatrix} 1 \\ 2 \end{bmatrix}, \begin{bmatrix} -2 \\ -4 \end{bmatrix} \right\}$?`,
          options: [md`All of $\R^2$`, md`A line through the origin`, md`Two different lines`, md`Only the origin`],
          answer: 1,
          explain: md`$(-2, -4) = -2\,(1, 2)$, so the second vector adds no new direction. Every combination is a multiple of $(1, 2)$: the line $y = 2x$.`,
        },
        {
          kind: 'paper',
          problem: {
            id: 'la01-1-paper',
            title: 'A second coordinate system',
            type: 'compute',
            difficulty: 2,
            minutes: 8,
            statement: md`Show that every vector $(x, y) \in \R^2$ is a linear combination of $\bu = (1, 1)$ and $\bv = (1, -1)$, by finding the coefficients $a, b$ as formulas in $x$ and $y$. Then write $(4, -2)$ in this form.`,
            hints: [md`Write the two component equations $a + b = x$ and $a - b = y$, then add and subtract them.`],
            solution: [
              md`We need $a(1, 1) + b(1, -1) = (x, y)$, that is $a + b = x$ and $a - b = y$.`,
              md`Adding the equations: $2a = x + y$, so $a = \tfrac{x + y}{2}$. Subtracting: $2b = x - y$, so $b = \tfrac{x - y}{2}$.`,
              md`These formulas give valid $a, b$ for **every** $(x, y)$, so $\Span\{\bu, \bv\} = \R^2$.`,
              md`For $(4, -2)$: $a = \tfrac{4 - 2}{2} = 1$, $b = \tfrac{4 + 2}{2} = 3$. Check: $(1, 1) + 3(1, -1) = (4, -2)$.`,
            ],
            answer: { kind: 'vector', value: [1, 3] },
            rubric: [md`Both component equations written down`, md`General formulas for $a$ and $b$, with the conclusion that they exist for every $(x, y)$`, md`The specific coefficients $a = 1$, $b = 3$, checked`],
          },
        },
        {
          kind: 'callout',
          tone: 'intuition',
          title: 'Where this appears in ML',
          md: md`A linear model predicts $\hat y = w_1x_1 + w_2x_2 + \dots + w_nx_n$, a linear combination of the features with the weights as coefficients. In Module 2 you will see that a layer's output $W\bx$ is a linear combination of the **columns** of $W$, with the input's entries as coefficients.`,
        },
        {
          kind: 'code',
          code: `import numpy as np

u = np.array([3, 1])
v = np.array([1, 2])
print(1 * u + 2 * v)`,
          predict: {
            q: md`NumPy applies \`+\` and \`*\` component by component. What is printed?`,
            options: ['`[5 5]`', '`[5, 5]`', '`[4 3]`', '`[3 4]`'],
            answer: 0,
            explain: md`$1\cdot(3,1) + 2\cdot(1,2) = (5, 5)$. NumPy prints arrays with spaces and no commas; \`[5, 5]\` would be a Python list.`,
          },
          note: md`Change the coefficients and re-run. Try \`2 * u - v\` and \`-u\`.`,
        },
        {
          kind: 'recall',
          prompt: md`Without looking back: what is the span of one nonzero vector in $\R^3$? Of two non-parallel vectors in $\R^3$? Can two vectors ever span all of $\R^3$?`,
          answer: md`One nonzero vector spans a **line** through the origin. Two non-parallel vectors span a **plane** through the origin. Two vectors can never span $\R^3$: you need at least three directions.`,
        },
      ],
      cards: [
        { id: 'la01-1-c1', kind: 'concept', front: md`What is a linear combination of $\bv_1, \dots, \bv_k$, and what is their span?`, back: md`A linear combination is $c_1\bv_1 + \dots + c_k\bv_k$ for scalars $c_i$. The span is the set of **all** such combinations.` },
        { id: 'la01-1-c2', kind: 'cloze', text: md`Two vectors in $\R^2$ span the whole plane exactly when they are not {{}}.`, answers: ['parallel'] },
        { id: 'la01-1-c3', kind: 'compute', front: md`Compute $2\begin{bmatrix}1\\3\end{bmatrix} - \begin{bmatrix}4\\-1\end{bmatrix}$.`, answer: { kind: 'vector', value: [-2, 7] }, back: md`$(2, 6) - (4, -1) = (-2, 7)$.` },
        { id: 'la01-1-c4', kind: 'concept', front: md`Geometrically, what is $\bu + \bv$?`, back: md`Walk along $\bu$, then along $\bv$ (tip to tail). It is the diagonal of the parallelogram with sides $\bu$ and $\bv$.` },
        { id: 'la01-1-c5', kind: 'concept', front: md`How do you find $a, b$ with $a\bu + b\bv = \bw$?`, back: md`Write one equation per component and solve the resulting linear system (substitution or elimination).` },
      ],
    },
    // ------------------------------------------------------------------ 1.2
    {
      id: 'la01-2',
      title: 'The dot product, angles and projections',
      minutes: 35,
      objectives: [
        'Compute a dot product by hand and state its geometric formula.',
        'Decide from the sign of the dot product whether an angle is acute, right or obtuse.',
        'Compute the projection of one vector onto another, and the angle between them.',
        'Explain cosine similarity and when ranking by it differs from ranking by the dot product.',
      ],
      cells: [
        {
          kind: 'text',
          md: md`The **dot product** of $\bu, \bv \in \R^n$ multiplies matching components and adds:

$$\bu \cdot \bv = u_1v_1 + u_2v_2 + \dots + u_nv_n = \bu\T\bv.$$

It takes two vectors and returns a single number. Three properties do most of the work:

- symmetric: $\bu \cdot \bv = \bv \cdot \bu$
- linear in each argument: $(a\bu + b\bw)\cdot\bv = a\,\bu\cdot\bv + b\,\bw\cdot\bv$
- a vector dotted with itself is its squared length: $\bv \cdot \bv = \lVert\bv\rVert^2 = v_1^2 + \dots + v_n^2$`,
        },
        {
          kind: 'numeric',
          q: md`Compute $\begin{bmatrix} 2 \\ -1 \\ 3 \end{bmatrix} \cdot \begin{bmatrix} 4 \\ 0 \\ -2 \end{bmatrix}$.`,
          answer: { kind: 'number', value: 2 },
          explain: md`$2\cdot 4 + (-1)\cdot 0 + 3 \cdot(-2) = 8 + 0 - 6 = 2$.`,
        },
        {
          kind: 'callout',
          tone: 'theorem',
          title: 'Geometric formula',
          md: md`If $\theta$ is the angle between $\bu$ and $\bv$, then $$\bu \cdot \bv = \lVert\bu\rVert\,\lVert\bv\rVert\cos\theta.$$ Equivalently, $\bu\cdot\bv$ is the length of $\bu$ times the **signed length of the shadow** of $\bv$ on the line through $\bu$.`,
        },
        {
          kind: 'viz',
          viz: { type: 'la.dot', u: [4, 1], v: [1.5, 3] },
          task: md`Make the dot product exactly $0$ without shrinking either vector to zero. Then make it negative. Watch what the shadow does.`,
          caption: md`The thick segment is the shadow (projection) of $\bv$ on the line of $\bu$. Green means it points along $\bu$ (positive), red means against (negative), and it vanishes at $90^\circ$.`,
        },
        {
          kind: 'derive',
          title: 'why the geometric formula holds',
          goal: md`Show $\bu\cdot\bv = \lVert\bu\rVert\lVert\bv\rVert\cos\theta$ in $\R^2$ or $\R^3$, using the law of cosines.`,
          steps: [
            { md: md`The vectors $\bu$, $\bv$ and $\bu - \bv$ form a triangle with angle $\theta$ between the first two sides. The law of cosines says $$\lVert\bu - \bv\rVert^2 = \lVert\bu\rVert^2 + \lVert\bv\rVert^2 - 2\lVert\bu\rVert\lVert\bv\rVert\cos\theta.$$` },
            {
              md: md`Expand the left side with the dot product, using linearity and symmetry: $$\lVert\bu - \bv\rVert^2 = (\bu - \bv)\cdot(\bu - \bv) = \bu\cdot\bu - 2\,\bu\cdot\bv + \bv\cdot\bv.$$`,
              choose: {
                prompt: md`How can you rewrite $\lVert\bu-\bv\rVert^2$ so that a dot product $\bu\cdot\bv$ appears?`,
                options: [md`As $(\bu-\bv)\cdot(\bu-\bv)$, then expand`, md`As $\lVert\bu\rVert^2 - \lVert\bv\rVert^2$`, md`As $(\lVert\bu\rVert - \lVert\bv\rVert)^2$`],
                answer: 0,
                explain: md`Any squared length is a vector dotted with itself. The other two options are false in general.`,
              },
            },
            { md: md`Since $\bu\cdot\bu = \lVert\bu\rVert^2$ and $\bv\cdot\bv = \lVert\bv\rVert^2$, those terms cancel on both sides, leaving $-2\,\bu\cdot\bv = -2\lVert\bu\rVert\lVert\bv\rVert\cos\theta$.` },
            { md: md`Divide by $-2$: $\bu\cdot\bv = \lVert\bu\rVert\lVert\bv\rVert\cos\theta$. In $\R^n$ for $n > 3$ we turn this around and **define** the angle by $\cos\theta = \dfrac{\bu\cdot\bv}{\lVert\bu\rVert\lVert\bv\rVert}$.` },
          ],
          takeaway: md`The algebraic definition (multiply and add) and the geometric one (lengths and angle) are the same number. The sign of $\bu\cdot\bv$ is the sign of $\cos\theta$.`,
        },
        {
          kind: 'check',
          q: md`Nonzero vectors $\bu, \bv$ have $\bu\cdot\bv = -3$. The angle between them is`,
          options: [md`acute (below $90^\circ$)`, md`exactly $90^\circ$`, md`obtuse (above $90^\circ$)`, md`impossible to tell without the lengths`],
          answer: 2,
          explain: md`Lengths are positive, so $\cos\theta$ has the sign of $\bu\cdot\bv$. Negative cosine means $90^\circ < \theta \le 180^\circ$.`,
        },
        {
          kind: 'callout',
          tone: 'definition',
          title: 'Projection onto a vector',
          md: md`The projection of $\bv$ onto the line spanned by $\bu \ne \bzero$ is $$\operatorname{proj}_{\bu}\bv = \frac{\bu\cdot\bv}{\bu\cdot\bu}\,\bu.$$ The **residual** $\bv - \operatorname{proj}_{\bu}\bv$ is orthogonal to $\bu$. Two vectors are **orthogonal** when their dot product is $0$.`,
        },
        {
          kind: 'numeric',
          q: md`Project $\bv = (5, 0)$ onto $\bu = (3, 4)$.`,
          answer: { kind: 'vector', value: [1.8, 2.4] },
          hints: [md`$\bu\cdot\bv = 15$ and $\bu\cdot\bu = 25$.`],
          explain: md`$\frac{15}{25}(3, 4) = 0.6\,(3, 4) = (1.8, 2.4)$. Check that the residual is orthogonal to $\bu$: $(5 - 1.8,\ 0 - 2.4)\cdot(3, 4) = 9.6 - 9.6 = 0$.`,
        },
        {
          kind: 'paper',
          problem: {
            id: 'la01-2-paper',
            title: 'The residual is orthogonal',
            type: 'proof',
            difficulty: 2,
            minutes: 6,
            statement: md`Let $\bu \neq \bzero$ and $\bp = \operatorname{proj}_{\bu}\bv$. Prove that $(\bv - \bp)\cdot\bu = 0$.`,
            hints: [md`Substitute the formula for $\bp$ and use linearity: $(\bv - c\,\bu)\cdot\bu = \bv\cdot\bu - c\,\bu\cdot\bu$.`],
            solution: [
              md`Write $\bp = c\,\bu$ with $c = \dfrac{\bu\cdot\bv}{\bu\cdot\bu}$ (defined because $\bu \ne \bzero$).`,
              md`By linearity, $(\bv - c\,\bu)\cdot\bu = \bv\cdot\bu - c\,(\bu\cdot\bu)$.`,
              md`Substituting $c$: $\bv\cdot\bu - \dfrac{\bu\cdot\bv}{\bu\cdot\bu}\,\bu\cdot\bu = \bv\cdot\bu - \bu\cdot\bv = 0$, using symmetry.`,
            ],
            rubric: [md`Uses the projection formula explicitly`, md`Uses linearity of the dot product to split the expression`, md`Cancels correctly and notes why $\bu\cdot\bu \ne 0$`],
          },
        },
        {
          kind: 'callout',
          tone: 'definition',
          title: 'Cosine similarity',
          md: md`$$\cos(\bu, \bv) = \frac{\bu\cdot\bv}{\lVert\bu\rVert\lVert\bv\rVert} \in [-1, 1].$$ It measures direction only: scaling either vector by a positive number does not change it. If both vectors have length 1, the cosine similarity **is** the dot product.`,
        },
        {
          kind: 'code',
          code: `import numpy as np

a = np.array([1.0, 2.0, 2.0])
b = np.array([2.0, 4.0, 4.0])
cos = a @ b / (np.linalg.norm(a) * np.linalg.norm(b))
print(round(float(cos), 4))`,
          predict: {
            q: md`\`@\` between two 1-D arrays is the dot product. What does this print?`,
            options: ['`1.0`', '`2.0`', '`0.5`', '`18.0`'],
            answer: 0,
            explain: md`$\bb = 2\ba$ points the same way, so the cosine is exactly 1, even though $\ba\cdot\bb = 18$.`,
          },
        },
        {
          kind: 'code',
          code: `import numpy as np

query = np.array([1.0, 1.0])
docs = np.array([[2.0, 0.0],    # doc 0: long, 45 degrees off
                 [0.6, 0.8],    # doc 1: short, nearly the same direction
                 [5.0, 4.0]])   # doc 2: long and close in direction

dots = docs @ query
cos = dots / (np.linalg.norm(docs, axis=1) * np.linalg.norm(query))
print("dot:", np.round(dots, 3))
print("cos:", np.round(cos, 3))
print("rank by dot:", np.argsort(-dots))
print("rank by cos:", np.argsort(-cos))`,
          note: md`Ranking by the raw dot product rewards long vectors: doc 0 beats doc 1 although doc 1 points almost exactly at the query. Many retrieval systems L2-normalize embeddings so that the two rankings coincide.`,
        },
        {
          kind: 'check',
          q: md`All embeddings in an index are L2-normalized (length 1). Which statement is true?`,
          options: [
            md`Ranking by dot product, by cosine similarity and by Euclidean distance (smallest first) all give the same order.`,
            md`Dot product and cosine agree, but Euclidean distance gives the reverse order.`,
            md`Only cosine similarity is meaningful after normalizing.`,
            md`The three rankings generally disagree.`,
          ],
          answer: 0,
          explain: md`For unit vectors, $\cos = \bu\cdot\bv$ and $\lVert\bu - \bv\rVert^2 = 2 - 2\,\bu\cdot\bv$. A larger dot product means a smaller distance, so all three orderings match (problem 1.8 asks you to prove it).`,
        },
        {
          kind: 'explain',
          prompt: md`An interviewer asks: *why do attention layers and vector search score items with dot products, and what changes if you normalize the vectors first?* Answer in a few sentences.`,
          model: md`A dot product is a cheap, differentiable measure of how aligned two vectors are: $\bu\cdot\bv = \lVert\bu\rVert\lVert\bv\rVert\cos\theta$. It also batches into a single matrix product, which is why attention computes $QK\T$ for all pairs at once. The raw score mixes direction with magnitude, so long vectors score high regardless of direction. Normalizing to unit length turns the score into cosine similarity, which compares direction only, and makes nearest-by-Euclidean-distance agree with highest-dot-product. Attention keeps magnitudes but divides by $\sqrt{d}$ to control how large the scores get.`,
        },
      ],
      cards: [
        { id: 'la01-2-c1', kind: 'concept', front: md`State the algebraic and the geometric definitions of $\bu\cdot\bv$.`, back: md`$\sum_i u_iv_i$, and $\lVert\bu\rVert\lVert\bv\rVert\cos\theta$, where $\theta$ is the angle between them.` },
        { id: 'la01-2-c2', kind: 'concept', front: md`Formula for the projection of $\bv$ onto $\bu$, and the property of the residual.`, back: md`$\operatorname{proj}_{\bu}\bv = \dfrac{\bu\cdot\bv}{\bu\cdot\bu}\bu$. The residual $\bv - \operatorname{proj}_{\bu}\bv$ is orthogonal to $\bu$.` },
        { id: 'la01-2-c3', kind: 'compute', front: md`Compute $(1, -2, 2)\cdot(3, 1, 4)$.`, answer: { kind: 'number', value: 9 }, back: md`$3 - 2 + 8 = 9$.` },
        { id: 'la01-2-c4', kind: 'cloze', text: md`For unit vectors, $\lVert\bu - \bv\rVert^2 = $ {{}} $- 2\,\bu\cdot\bv$.`, answers: ['2'] },
        { id: 'la01-2-c5', kind: 'concept', front: md`When does ranking by dot product differ from ranking by cosine similarity?`, back: md`When the vectors have different lengths: the dot product also rewards magnitude. After L2-normalizing, the two rankings are identical.` },
      ],
    },
    // ------------------------------------------------------------------ 1.3
    {
      id: 'la01-3',
      title: 'Norms, distances and two inequalities',
      minutes: 30,
      objectives: [
        'Compute the L1, L2 and L-infinity norms and the distances they define.',
        'Sketch the unit ball of each norm and connect the shapes to L1 and L2 regularization.',
        'State and use the Cauchy–Schwarz and triangle inequalities.',
        'Explain why feature scaling changes the result of distance-based methods.',
      ],
      cells: [
        {
          kind: 'text',
          md: md`A **norm** assigns a length $\lVert\bx\rVert$ to every vector, and it must behave like a length:

1. $\lVert\bx\rVert \ge 0$, with equality only for $\bx = \bzero$
2. $\lVert c\,\bx\rVert = |c|\,\lVert\bx\rVert$
3. $\lVert\bx + \by\rVert \le \lVert\bx\rVert + \lVert\by\rVert$ (the **triangle inequality**)

Every norm gives a distance: $d(\bx, \by) = \lVert\bx - \by\rVert$.`,
        },
        {
          kind: 'callout',
          tone: 'definition',
          title: 'The three norms used in ML',
          md: md`$$\lVert\bx\rVert_2 = \sqrt{\textstyle\sum_i x_i^2}, \qquad \lVert\bx\rVert_1 = \textstyle\sum_i |x_i|, \qquad \lVert\bx\rVert_\infty = \max_i |x_i|.$$ $\lVert\cdot\rVert_2$ is the usual Euclidean length; when no subscript is written, it is the default. All three are cases of $\lVert\bx\rVert_p = \left(\sum_i |x_i|^p\right)^{1/p}$.`,
        },
        {
          kind: 'viz',
          viz: { type: 'la.norms', x: [0.8, 0.6] },
          task: md`Drag $\bx$ onto each outline in turn. For $\bx = (1, 1)$, which norm gives the largest value? Which outline has corners on the axes?`,
          caption: md`The diamond (L1), circle (L2) and square (L∞) are the points at distance $r$ under each norm. The diamond's corners on the axes are why L1 regularization pushes weights to exactly zero, as you will see in the regularization lesson of Part III.`,
        },
        {
          kind: 'numeric',
          q: md`For $\bx = (3, -4, 0, 1)$, compute $\lVert\bx\rVert_1$, $\lVert\bx\rVert_2$ and $\lVert\bx\rVert_\infty$, in that order.`,
          answer: { kind: 'vector', value: [8, Math.sqrt(26), 4] },
          inputHint: 'three numbers, e.g. 8, sqrt(26), 4',
          explain: md`$|3| + |{-4}| + 0 + 1 = 8$; $\sqrt{9 + 16 + 0 + 1} = \sqrt{26} \approx 5.10$; the largest absolute entry is $4$. The ordering $4 \le 5.10 \le 8$ is no accident: $\lVert\bx\rVert_\infty \le \lVert\bx\rVert_2 \le \lVert\bx\rVert_1$ always.`,
        },
        {
          kind: 'callout',
          tone: 'theorem',
          title: 'Cauchy–Schwarz and the triangle inequality',
          md: md`For all $\bu, \bv \in \R^n$: $$|\bu\cdot\bv| \le \lVert\bu\rVert\,\lVert\bv\rVert, \qquad \lVert\bu + \bv\rVert \le \lVert\bu\rVert + \lVert\bv\rVert.$$ Equality in Cauchy–Schwarz holds exactly when one vector is a multiple of the other.`,
        },
        {
          kind: 'derive',
          title: 'triangle inequality from Cauchy–Schwarz',
          goal: md`Prove $\lVert\bu + \bv\rVert \le \lVert\bu\rVert + \lVert\bv\rVert$ for the Euclidean norm.`,
          steps: [
            { md: md`Both sides are non-negative, so it is enough to compare their squares. Expand: $$\lVert\bu + \bv\rVert^2 = \lVert\bu\rVert^2 + 2\,\bu\cdot\bv + \lVert\bv\rVert^2.$$` },
            {
              md: md`Bound the middle term with Cauchy–Schwarz: $\bu\cdot\bv \le |\bu\cdot\bv| \le \lVert\bu\rVert\lVert\bv\rVert$, so $$\lVert\bu + \bv\rVert^2 \le \lVert\bu\rVert^2 + 2\lVert\bu\rVert\lVert\bv\rVert + \lVert\bv\rVert^2.$$`,
              choose: {
                prompt: md`Which term on the right needs an upper bound?`,
                options: [md`$2\,\bu\cdot\bv$`, md`$\lVert\bu\rVert^2$`, md`$\lVert\bv\rVert^2$`],
                answer: 0,
                explain: md`The squared lengths already match the target $(\lVert\bu\rVert + \lVert\bv\rVert)^2$. Only the cross term differs.`,
              },
            },
            { md: md`The right side is $(\lVert\bu\rVert + \lVert\bv\rVert)^2$. Taking square roots of non-negative numbers keeps the inequality: $\lVert\bu + \bv\rVert \le \lVert\bu\rVert + \lVert\bv\rVert$.` },
          ],
          takeaway: md`Cauchy–Schwarz is also why $\cos\theta = \dfrac{\bu\cdot\bv}{\lVert\bu\rVert\lVert\bv\rVert}$ always lies in $[-1, 1]$, so the angle between vectors in $\R^n$ is well defined.`,
        },
        {
          kind: 'check',
          q: md`Equality $\lVert\bu + \bv\rVert = \lVert\bu\rVert + \lVert\bv\rVert$ holds (for nonzero vectors) exactly when`,
          options: [md`$\bu$ and $\bv$ point in the same direction`, md`$\bu \perp \bv$`, md`$\lVert\bu\rVert = \lVert\bv\rVert$`, md`$\bu = -\bv$`],
          answer: 0,
          explain: md`Equality needs $\bu\cdot\bv = \lVert\bu\rVert\lVert\bv\rVert$, that is $\cos\theta = 1$. Orthogonal vectors give the Pythagorean case $\lVert\bu+\bv\rVert^2 = \lVert\bu\rVert^2 + \lVert\bv\rVert^2$ instead.`,
        },
        {
          kind: 'text',
          md: md`**Unit vectors.** Dividing a nonzero vector by its length gives a unit vector in the same direction: $\hat{\bx} = \bx / \lVert\bx\rVert$. Embeddings are often stored this way.

**Units matter for distances.** Distance-based methods (k-nearest neighbours, k-means, RBF kernels) add up squared differences across features. A feature measured in dollars, with differences in the thousands, swamps one measured in years. Standardizing each feature to zero mean and unit variance puts them on a comparable scale before any distance is computed.`,
        },
        {
          kind: 'numeric',
          q: md`Normalize $\bx = (3, 4)$ to unit length.`,
          answer: { kind: 'vector', value: [0.6, 0.8] },
          explain: md`$\lVert\bx\rVert = 5$, so $\hat\bx = (3/5, 4/5) = (0.6, 0.8)$.`,
        },
        {
          kind: 'paper',
          problem: {
            id: 'la01-3-paper',
            title: 'Units change the nearest neighbour',
            type: 'apply',
            difficulty: 1,
            minutes: 6,
            statement: md`Customers are described by (age in years, income in dollars): $A = (25, 40000)$, $B = (55, 40500)$, $C = (26, 45000)$.

(a) Using Euclidean distance on the raw numbers, which of $B$ and $C$ is nearer to $A$?

(b) Measure income in thousands of dollars instead and recompute. Which is nearer now? Enter the letter for (b).`,
            solution: [
              md`(a) $d(A, B) = \sqrt{30^2 + 500^2} \approx 500.9$ and $d(A, C) = \sqrt{1^2 + 5000^2} \approx 5000.0$. $B$ is nearer, although $B$ is 30 years older.`,
              md`(b) With income in thousands: $A = (25, 40)$, $B = (55, 40.5)$, $C = (26, 45)$. $d(A, B) = \sqrt{900 + 0.25} \approx 30.0$ and $d(A, C) = \sqrt{1 + 25} \approx 5.1$. Now $C$ is nearer.`,
              md`The answer changed only because of the unit. That is why features are standardized before k-NN or k-means.`,
            ],
            answer: { kind: 'text', value: ['C'] },
          },
        },
        {
          kind: 'code',
          code: `import numpy as np

x = np.array([3.0, -4.0, 0.0, 1.0])
print(np.linalg.norm(x), np.linalg.norm(x, 1), np.linalg.norm(x, np.inf))

X = np.array([[25, 40000], [55, 40500], [26, 45000]], dtype=float)
Z = (X - X.mean(axis=0)) / X.std(axis=0)      # standardize each column
print(np.round(np.linalg.norm(Z - Z[0], axis=1), 3))`,
          note: md`The second print gives the distance from customer A to each customer after standardizing. Try removing the standardization line to see the raw distances.`,
        },
        {
          kind: 'recall',
          prompt: md`State the Cauchy–Schwarz inequality and the triangle inequality, and say when each holds with equality.`,
          answer: md`$|\bu\cdot\bv| \le \lVert\bu\rVert\lVert\bv\rVert$, with equality iff one vector is a multiple of the other. $\lVert\bu + \bv\rVert \le \lVert\bu\rVert + \lVert\bv\rVert$, with equality iff one is a non-negative multiple of the other (same direction).`,
        },
        {
          kind: 'explain',
          prompt: md`Why do you standardize features before k-NN or k-means, but usually not before a decision tree?`,
          model: md`k-NN and k-means compare points by distance, a sum of squared differences across features, so a feature with a large numeric range dominates the distance purely because of its units. Standardizing gives every feature comparable spread. A decision tree splits on one feature at a time with a threshold; rescaling a feature moves the threshold but not the ordering of the points, so the same splits are found and scaling makes no difference.`,
        },
      ],
      cards: [
        { id: 'la01-3-c1', kind: 'concept', front: md`Define $\lVert\bx\rVert_1$, $\lVert\bx\rVert_2$, $\lVert\bx\rVert_\infty$ and draw their unit balls in $\R^2$.`, back: md`$\sum|x_i|$ (diamond), $\sqrt{\sum x_i^2}$ (circle), $\max|x_i|$ (square).` },
        { id: 'la01-3-c2', kind: 'cloze', text: md`Cauchy–Schwarz, $|\bu\cdot\bv| \le \lVert\bu\rVert\lVert\bv\rVert$, holds with equality exactly when one vector is a {{}} of the other.`, answers: ['multiple'] },
        { id: 'la01-3-c3', kind: 'compute', front: md`$\lVert(1, -2, 2)\rVert_2 = ?$`, answer: { kind: 'number', value: 3 }, back: md`$\sqrt{1 + 4 + 4} = 3$.` },
        { id: 'la01-3-c4', kind: 'concept', front: md`Why does L1 regularization produce exactly-zero weights more often than L2?`, back: md`The L1 ball is a diamond with corners on the axes. The loss contours usually first touch it at a corner, where some coordinates are exactly 0. The L2 ball is round, with no corners.` },
        { id: 'la01-3-c5', kind: 'concept', front: md`Which models need standardized features, and why?`, back: md`Distance- or dot-product-based ones (k-NN, k-means, SVMs, gradient-trained linear and neural models): differences in scale distort distances and the optimization. Trees are invariant to monotone rescaling of each feature.` },
      ],
    },
  ],
  problems: [
    {
      id: 'la01-p1',
      title: 'Coefficients of a combination',
      type: 'compute',
      difficulty: 1,
      minutes: 6,
      statement: md`Find scalars $a, b$ with $a\begin{bmatrix}2\\1\end{bmatrix} + b\begin{bmatrix}1\\3\end{bmatrix} = \begin{bmatrix}7\\4\end{bmatrix}$. Enter $[a, b]$.`,
      hints: [md`Equations: $2a + b = 7$ and $a + 3b = 4$.`],
      solution: [
        md`Component equations: $2a + b = 7$ and $a + 3b = 4$.`,
        md`From the second, $a = 4 - 3b$. Substitute: $2(4 - 3b) + b = 7 \Rightarrow 8 - 5b = 7 \Rightarrow b = \tfrac15$.`,
        md`Then $a = 4 - \tfrac35 = \tfrac{17}{5}$. Check: $\tfrac{17}{5}(2,1) + \tfrac15(1,3) = (\tfrac{35}{5}, \tfrac{20}{5}) = (7, 4)$.`,
      ],
      answer: { kind: 'vector', value: [3.4, 0.2] },
    },
    {
      id: 'la01-p2',
      title: 'An angle in three dimensions',
      type: 'compute',
      difficulty: 1,
      minutes: 5,
      statement: md`Find the angle, in degrees, between $\bu = (1, 0, 1)$ and $\bv = (0, 1, 1)$.`,
      solution: [md`$\bu\cdot\bv = 0 + 0 + 1 = 1$ and $\lVert\bu\rVert = \lVert\bv\rVert = \sqrt2$.`, md`$\cos\theta = \dfrac{1}{\sqrt2\cdot\sqrt2} = \tfrac12$, so $\theta = 60^\circ$.`],
      answer: { kind: 'number', value: 60, tol: 1e-3 },
    },
    {
      id: 'la01-p3',
      title: 'Projection and residual',
      type: 'compute',
      difficulty: 1,
      minutes: 6,
      statement: md`Let $\bu = (1, 1, 0)$ and $\bv = (1, 2, 3)$. Compute $\bp = \operatorname{proj}_{\bu}\bv$ and verify that $\bv - \bp$ is orthogonal to $\bu$. Enter $\bp$.`,
      solution: [md`$\bu\cdot\bv = 3$ and $\bu\cdot\bu = 2$, so $\bp = \tfrac32(1, 1, 0) = (1.5, 1.5, 0)$.`, md`Residual: $\bv - \bp = (-0.5, 0.5, 3)$. Check: $(-0.5)(1) + (0.5)(1) + 3 \cdot 0 = 0$.`],
      answer: { kind: 'vector', value: [1.5, 1.5, 0] },
    },
    {
      id: 'la01-p4',
      title: 'The parallelogram law',
      type: 'proof',
      difficulty: 2,
      minutes: 8,
      statement: md`Prove that for all $\bu, \bv \in \R^n$, $$\lVert\bu + \bv\rVert^2 + \lVert\bu - \bv\rVert^2 = 2\lVert\bu\rVert^2 + 2\lVert\bv\rVert^2.$$ Interpret the identity geometrically.`,
      hints: [md`Expand both squared norms as dot products.`],
      solution: [
        md`$\lVert\bu + \bv\rVert^2 = \bu\cdot\bu + 2\,\bu\cdot\bv + \bv\cdot\bv$.`,
        md`$\lVert\bu - \bv\rVert^2 = \bu\cdot\bu - 2\,\bu\cdot\bv + \bv\cdot\bv$.`,
        md`Adding, the cross terms cancel: $2\,\bu\cdot\bu + 2\,\bv\cdot\bv = 2\lVert\bu\rVert^2 + 2\lVert\bv\rVert^2$.`,
        md`Geometrically: in a parallelogram, the sum of the squares of the two diagonals equals the sum of the squares of the four sides.`,
      ],
      rubric: [md`Both expansions written correctly`, md`Cross terms shown to cancel`, md`Geometric interpretation (diagonals versus sides)`],
    },
    {
      id: 'la01-p5',
      title: 'Proof of Cauchy–Schwarz',
      type: 'proof',
      difficulty: 3,
      minutes: 15,
      statement: md`Prove $|\bu\cdot\bv| \le \lVert\bu\rVert\lVert\bv\rVert$. Consider $f(t) = \lVert\bu - t\bv\rVert^2 \ge 0$ for real $t$. Also show that equality forces $\bu$ to be a multiple of $\bv$ (when $\bv \ne \bzero$).`,
      hints: [md`$f(t)$ is a quadratic in $t$ that is never negative. What does that say about its discriminant?`, md`If $\bv = \bzero$ both sides are 0, so assume $\bv \ne \bzero$.`],
      solution: [
        md`If $\bv = \bzero$ both sides are $0$. Assume $\bv \ne \bzero$.`,
        md`Expand: $f(t) = \lVert\bv\rVert^2 t^2 - 2(\bu\cdot\bv)\,t + \lVert\bu\rVert^2$, a quadratic with positive leading coefficient.`,
        md`Since $f(t) \ge 0$ for every real $t$, it has at most one real root, so its discriminant is $\le 0$: $4(\bu\cdot\bv)^2 - 4\lVert\bv\rVert^2\lVert\bu\rVert^2 \le 0$.`,
        md`Rearranging, $(\bu\cdot\bv)^2 \le \lVert\bu\rVert^2\lVert\bv\rVert^2$. Taking square roots gives $|\bu\cdot\bv| \le \lVert\bu\rVert\lVert\bv\rVert$.`,
        md`Equality means the discriminant is $0$, so $f(t_0) = 0$ for some $t_0$. Then $\lVert\bu - t_0\bv\rVert = 0$, which forces $\bu = t_0\bv$.`,
      ],
      rubric: [md`Handles $\bv = \bzero$ separately`, md`Correct expansion of $f(t)$`, md`Non-negativity implies discriminant $\le 0$`, md`Equality case argued through a root of $f$`],
      areas: ['math', 'ml-depth'],
    },
    {
      id: 'la01-p6',
      title: 'When are two vectors parallel?',
      type: 'concept',
      difficulty: 1,
      minutes: 5,
      statement: md`For which real $k$ are $(1, k)$ and $(k, 4)$ parallel? For those $k$, what is their span? Enter all values of $k$.`,
      hints: [md`They are parallel when one is a multiple of the other, equivalently when $1 \cdot 4 - k \cdot k = 0$.`],
      solution: [md`Parallel means $(k, 4) = c\,(1, k)$ for some $c$: then $c = k$ and $4 = k^2$.`, md`So $k = 2$ or $k = -2$. For these values the span is a line through the origin, $y = 2x$ or $y = -2x$. For every other $k$ the two vectors span $\R^2$.`],
      answer: { kind: 'set', value: [-2, 2] },
    },
    {
      id: 'la01-p7',
      title: 'Ranking documents by cosine similarity',
      type: 'apply',
      difficulty: 2,
      minutes: 10,
      statement: md`A query embedding is $\bq = (1, 0, 1)$. Three documents have embeddings $\bd_1 = (1, 1, 1)$, $\bd_2 = (2, 0, 0)$, $\bd_3 = (1, 0, 3)$. Rank the documents by cosine similarity to $\bq$, highest first, and compare with the ranking by raw dot product. Enter the document numbers in cosine order.`,
      solution: [
        md`Dot products: $\bq\cdot\bd_1 = 2$, $\bq\cdot\bd_2 = 2$, $\bq\cdot\bd_3 = 4$. Norms: $\lVert\bq\rVert = \sqrt2$, $\lVert\bd_1\rVert = \sqrt3$, $\lVert\bd_2\rVert = 2$, $\lVert\bd_3\rVert = \sqrt{10}$.`,
        md`Cosines: $\dfrac{2}{\sqrt2\sqrt3} \approx 0.816$, $\dfrac{2}{2\sqrt2} \approx 0.707$, $\dfrac{4}{\sqrt2\sqrt{10}} \approx 0.894$.`,
        md`Cosine order: $\bd_3, \bd_1, \bd_2$. By dot product, $\bd_3$ is first and $\bd_1, \bd_2$ tie. Cosine separates them because $\bd_2$ points further from $\bq$.`,
      ],
      answer: { kind: 'vector', value: [3, 1, 2] },
      areas: ['math', 'llm'],
    },
    {
      id: 'la01-p8',
      title: 'Nearest neighbours of unit vectors',
      type: 'derive',
      difficulty: 2,
      minutes: 8,
      statement: md`Let $\bu, \bv$ be unit vectors. Show that $\lVert\bu - \bv\rVert^2 = 2 - 2\,\bu\cdot\bv$. Conclude that, among unit vectors, the nearest neighbour by Euclidean distance is the one with the highest cosine similarity.`,
      solution: [
        md`$\lVert\bu - \bv\rVert^2 = \bu\cdot\bu - 2\,\bu\cdot\bv + \bv\cdot\bv = 1 - 2\,\bu\cdot\bv + 1 = 2 - 2\,\bu\cdot\bv$.`,
        md`For unit vectors $\bu\cdot\bv = \cos\theta$, so the squared distance is a decreasing function of the cosine.`,
        md`Minimizing distance is therefore the same as maximizing cosine similarity, which here equals the dot product. This is why vector databases can use any of the three metrics on normalized embeddings.`,
      ],
      rubric: [md`Correct expansion using $\lVert\bu\rVert = \lVert\bv\rVert = 1$`, md`States the monotone (decreasing) relationship`, md`Draws the conclusion about nearest neighbours`],
      areas: ['math', 'llm'],
    },
  ],
};
