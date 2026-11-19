import { md, type Module } from '../types';

export const MODULE: Module = {
  id: 'la04',
  part: 'la',
  order: 4,
  title: 'Subspaces, independence, basis and rank',
  summary: 'Linear independence, bases and dimension; the column space, null space and rank; the rank–nullity theorem; the four fundamental subspaces; and low-rank structure in ML.',
  relevance: md`Rank counts how many independent directions a matrix really uses. When features are linearly dependent (multicollinearity), the design matrix loses rank, $X\T X$ becomes singular and least-squares weights stop being unique. Weight updates during fine-tuning are often well approximated by low-rank matrices, which is the premise of LoRA: train a rank-$r$ product $BA$ instead of a full $d\times d$ update. Interviewers ask you to define rank, state rank–nullity, explain what multicollinearity does to a regression, and count LoRA's parameters.`,
  areas: ['math', 'ml-breadth', 'ml-depth', 'llm'],
  prereqs: ['la03'],
  lessons: [
    // ------------------------------------------------------------------ 4.1
    {
      id: 'la04-1',
      title: 'Linear independence, basis and dimension',
      minutes: 35,
      objectives: [
        'Decide whether a set of vectors is linearly independent, and find a dependence relation when it is not.',
        'Define a subspace, a basis and the dimension of a subspace.',
        'Compute the coordinates of a vector in a given basis by solving a linear system.',
        'Explain why n + 1 vectors in R^n are always linearly dependent.',
      ],
      cells: [
        {
          kind: 'text',
          md: md`A dataset records the price of each item in dollars and, in a second column, in euros at a fixed exchange rate. The second column carries no information the first does not: it is a multiple of it. A third column "total = price + shipping" is redundant in the same way if price and shipping are also columns. Redundancy of this kind is **linear dependence**, and it has concrete consequences: the regression weights for such features are not determined by the data.`,
        },
        {
          kind: 'callout',
          tone: 'definition',
          title: 'Linear independence',
          md: md`Vectors $\bv_1, \dots, \bv_k$ are **linearly independent** if $$c_1\bv_1 + c_2\bv_2 + \dots + c_k\bv_k = \bzero$$ holds only for $c_1 = \dots = c_k = 0$. Otherwise they are **dependent**, and a solution with some $c_i \ne 0$ is a **dependence relation**. Equivalently, the vectors are dependent exactly when one of them is a linear combination of the others.`,
        },
        {
          kind: 'callout',
          tone: 'intuition',
          md: md`Independent means every vector adds a new direction. A dependent vector lies in the span of the others, so including it does not make the span any bigger.`,
        },
        {
          kind: 'viz',
          viz: { type: 'la.span3d', u: [2, 0, 1], v: [0, 2, 1], a: 0.5, b: 0.75, t: 1.5 },
          task: md`Slide $t$ to $0$. What happens to the box and to the rank? Write down the dependence relation shown, then change $a$ and $b$ and watch it update.`,
          caption: md`The box spanned by $\bu, \bv, \bw$ has positive volume exactly when the three are independent. At $t = 0$, $\bw = a\bu + b\bv$ lies in the green plane, the box is flat, and the span shrinks from $\R^3$ to that plane.`,
        },
        {
          kind: 'check',
          q: md`Which set of vectors is linearly **dependent**?`,
          options: [md`$(1, 2, 3),\ (4, 5, 6),\ (5, 7, 9)$`, md`$(1, 0, 0),\ (0, 1, 0),\ (0, 0, 1)$`, md`$(1, 2),\ (3, 4)$`, md`$(1, 1)$`],
          answer: 0,
          explain: md`$(5, 7, 9) = (1, 2, 3) + (4, 5, 6)$, so $\bv_1 + \bv_2 - \bv_3 = \bzero$. The standard basis is independent; $(1, 2)$ and $(3, 4)$ are not parallel; a single nonzero vector is independent.`,
        },
        {
          kind: 'text',
          md: md`**Testing independence with elimination.** Put the vectors in the columns of a matrix $A$. A combination $c_1\bv_1 + \dots + c_k\bv_k$ is $A\bc$, so the vectors are independent exactly when $A\bc = \bzero$ has only the solution $\bc = \bzero$: **every column has a pivot**. A free column gives a dependence relation.

For $\bv_1 = (1, 2, 3)$, $\bv_2 = (4, 5, 6)$, $\bv_3 = (7, 8, 9)$ the RREF of $A$ is $\begin{bmatrix} 1 & 0 & -1 \\ 0 & 1 & 2 \\ 0 & 0 & 0 \end{bmatrix}$. Column 3 has no pivot; setting $c_3 = 1$ gives $c_1 = 1$, $c_2 = -2$.`,
        },
        {
          kind: 'numeric',
          q: md`Find a dependence relation $c_1\bv_1 + c_2\bv_2 + c_3\bv_3 = \bzero$ for $\bv_1 = (1, 2, 3)$, $\bv_2 = (4, 5, 6)$, $\bv_3 = (7, 8, 9)$. Enter $[c_1, c_2, c_3]$.`,
          answer: { kind: 'vector', value: [1, -2, 1], upToScale: true },
          explain: md`$(1, 2, 3) - 2(4, 5, 6) + (7, 8, 9) = (1 - 8 + 7,\ 2 - 10 + 8,\ 3 - 12 + 9) = \bzero$. Any nonzero multiple of $(1, -2, 1)$ is also a dependence relation.`,
        },
        {
          kind: 'callout',
          tone: 'definition',
          title: 'Subspace, basis, dimension',
          md: md`A **subspace** of $\R^n$ is a set $V$ that contains $\bzero$ and is closed under addition and scalar multiplication. Every span is a subspace.

A **basis** of $V$ is a set of vectors that is linearly independent and spans $V$. All bases of $V$ have the same number of vectors, the **dimension** $\dim V$. The standard basis $\be_1, \dots, \be_n$ shows $\dim\R^n = n$.`,
        },
        {
          kind: 'check',
          q: md`Which subset of $\R^2$ is a subspace?`,
          options: [md`The line $y = 2x$`, md`The line $y = 2x + 1$`, md`The quadrant $x \ge 0,\ y \ge 0$`, md`The unit circle`],
          answer: 0,
          explain: md`$y = 2x$ is the span of $(1, 2)$. The shifted line misses $\bzero$. The quadrant is not closed under multiplication by $-1$. The circle is not closed under addition or scaling.`,
        },
        {
          kind: 'derive',
          title: 'too many vectors are dependent',
          goal: md`Show that any $n + 1$ vectors in $\R^n$ are linearly dependent.`,
          steps: [
            { md: md`Put the vectors in the columns of $A$, an $n\times(n + 1)$ matrix. They are dependent exactly when $A\bc = \bzero$ has a nonzero solution.` },
            {
              md: md`Each pivot uses up a different row, so $A$ has at most $n$ pivots. With $n + 1$ columns, at least one column has no pivot.`,
              choose: {
                prompt: md`What limits the number of pivots of $A$?`,
                options: [md`Each row contains at most one pivot, and there are $n$ rows`, md`Each column contains at most one pivot`, md`The entries of $A$ are bounded`],
                answer: 0,
                explain: md`Pivots are the leading entries of rows, so there are at most as many as rows. Columns also hold at most one pivot each, but that only bounds the count by $n + 1$.`,
              },
            },
            { md: md`A column without a pivot gives a free variable. Setting it to 1 and solving for the pivot variables gives a nonzero $\bc$ with $A\bc = \bzero$: a dependence relation.` },
          ],
          takeaway: md`In $\R^n$ an independent set has at most $n$ vectors and a spanning set at least $n$. A basis of $\R^n$ has exactly $n$.`,
        },
        {
          kind: 'text',
          md: md`**Coordinates in a basis.** If $\bb_1, \dots, \bb_n$ is a basis of $\R^n$, every $\bx$ can be written in exactly one way as $\bx = c_1\bb_1 + \dots + c_n\bb_n$. The numbers $c_i$ are the **coordinates** of $\bx$ in that basis, written $[\bx]_B$. With $B = [\,\bb_1 \cdots \bb_n\,]$ this says $B\bc = \bx$, so $$[\bx]_B = B^{-1}\bx.$$ Example: in the basis $\bb_1 = (2, 1)$, $\bb_2 = (-1, 1)$, the point $\bx = (1, 2)$ has coordinates $(1, 1)$, since $(2, 1) + (-1, 1) = (1, 2)$.`,
        },
        {
          kind: 'viz',
          viz: { type: 'la.coords', b1: [2, 1], b2: [-1, 1], x: [1, 2] },
          task: md`Predict the coordinates of $(4, -1)$ in this basis, then drag $\bx$ there to check. Finally drag $\bb_2$ until it is parallel to $\bb_1$.`,
          caption: md`$(4, -1) = 1\cdot(2, 1) - 2\cdot(-1, 1)$, so its coordinates are $(1, -2)$. When $\bb_1 \parallel \bb_2$ the two vectors span only a line: they are not a basis, and $B$ has no inverse.`,
        },
        {
          kind: 'numeric',
          q: md`Find the coordinates of $(5, 1)$ in the basis $\bb_1 = (1, 1)$, $\bb_2 = (1, -1)$.`,
          answer: { kind: 'vector', value: [3, 2] },
          explain: md`Solve $c_1 + c_2 = 5$, $c_1 - c_2 = 1$: $c_1 = 3$, $c_2 = 2$. Check: $3(1, 1) + 2(1, -1) = (5, 1)$.`,
        },
        {
          kind: 'paper',
          problem: {
            id: 'la04-1-paper',
            title: 'Coordinates are unique',
            type: 'proof',
            difficulty: 2,
            minutes: 6,
            statement: md`Let $\bb_1, \dots, \bb_k$ be linearly independent. Prove that if $\bx = \sum_i c_i\bb_i = \sum_i d_i\bb_i$, then $c_i = d_i$ for every $i$. Why does this fail for dependent vectors?`,
            hints: [md`Subtract the two expressions.`],
            solution: [
              md`Subtracting, $\sum_i (c_i - d_i)\bb_i = \bx - \bx = \bzero$.`,
              md`This is a linear combination of independent vectors that equals $\bzero$, so every coefficient is zero: $c_i - d_i = 0$ for all $i$.`,
              md`For dependent vectors there is a relation $\sum_i a_i\bb_i = \bzero$ with some $a_i \ne 0$. Adding it to any representation gives a different one: $\bx = \sum_i (c_i + a_i)\bb_i$.`,
            ],
            rubric: [md`Subtracts the two representations`, md`Applies the definition of independence`, md`Explains non-uniqueness with a dependence relation`],
          },
        },
        {
          kind: 'code',
          code: `import numpy as np

V = np.array([[1, 4, 7],
              [2, 5, 8],
              [3, 6, 9]])    # the columns are v1, v2, v3
print(np.linalg.matrix_rank(V))`,
          predict: {
            q: md`\`matrix_rank\` counts independent columns. What is printed?`,
            options: ['`2`', '`3`', '`1`', '`0`'],
            answer: 0,
            explain: md`$\bv_3 = 2\bv_2 - \bv_1$, and $\bv_1, \bv_2$ are not parallel, so exactly two columns are independent.`,
          },
        },
        {
          kind: 'code',
          code: `import numpy as np

B = np.array([[2., -1.],
              [1., 1.]])                 # basis vectors as columns
x = np.array([4., -1.])
print(np.linalg.solve(B, x))           # coordinates of x in the basis`,
          note: md`Coordinates in a basis are the solution of $B\bc = \bx$. Change \`x\` and predict the output before running.`,
        },
        {
          kind: 'recall',
          prompt: md`From memory: define linear independence, basis and dimension, and give the elimination test for independence.`,
          answer: md`Independent: $\sum c_i\bv_i = \bzero$ only for all $c_i = 0$. Basis: an independent set that spans the subspace. Dimension: the number of vectors in any basis. Test: put the vectors in the columns of a matrix; they are independent iff every column has a pivot.`,
        },
      ],
      cards: [
        { id: 'la04-1-c1', kind: 'concept', front: md`Define linear independence of $\bv_1, \dots, \bv_k$.`, back: md`$c_1\bv_1 + \dots + c_k\bv_k = \bzero$ only when every $c_i = 0$. Equivalently, no vector is a combination of the others.` },
        { id: 'la04-1-c2', kind: 'cloze', text: md`Any $n + 1$ vectors in $\R^n$ are linearly {{}}.`, answers: ['dependent'] },
        { id: 'la04-1-c3', kind: 'compute', front: md`Coordinates of $(3, 1)$ in the basis $(1, 1), (1, -1)$?`, answer: { kind: 'vector', value: [2, 1] }, back: md`$c_1 + c_2 = 3$, $c_1 - c_2 = 1$: $(2, 1)$.` },
        { id: 'la04-1-c4', kind: 'concept', front: md`Three conditions for a subset $V \subseteq \R^n$ to be a subspace.`, back: md`It contains $\bzero$; it is closed under addition; it is closed under multiplication by scalars.` },
        { id: 'la04-1-c5', kind: 'concept', front: md`How do you test whether some vectors are independent by elimination?`, back: md`Make them the columns of $A$ and reduce. Independent iff every column has a pivot; a free column gives a dependence relation.` },
      ],
    },
    // ------------------------------------------------------------------ 4.2
    {
      id: 'la04-2',
      title: 'Column space, null space and rank',
      minutes: 40,
      objectives: [
        'Find bases for the column space and the null space of a matrix from its reduced row echelon form.',
        'Define rank and use the rank–nullity theorem: rank + nullity = number of columns.',
        'Describe the solution set of Ax = b as one particular solution plus the null space.',
        'Decide whether Ax = b is solvable by comparing the ranks of A and [A | b].',
      ],
      cells: [
        {
          kind: 'text',
          md: md`A linear layer $W: \R^n \to \R^m$ raises two questions. Which outputs can it produce at all? And which changes to the input does it not see, because they produce no change in the output? The first answer is the **column space**, the second the **null space**. Their dimensions are tied together by a single equation.`,
        },
        {
          kind: 'callout',
          tone: 'definition',
          title: 'Column space, null space, rank',
          md: md`For an $m\times n$ matrix $A$:

- the **column space** $\Col(A) = \{A\bx : \bx \in \R^n\}$ is the span of the columns, a subspace of $\R^m$;
- the **null space** $\Null(A) = \{\bx : A\bx = \bzero\}$ is a subspace of $\R^n$;
- the **rank** of $A$ is $\dim\Col(A)$, the number of pivots. The **nullity** is $\dim\Null(A)$.`,
        },
        {
          kind: 'viz',
          viz: { type: 'la.nullcol3d', matrix: [[1, 0, 1], [1, 1, 2], [0, 1, 1]], mode: 'any' },
          task: md`Move the three sliders. Can you make $A\bx$ leave the green plane? Then find a nonzero $\bx$ on the red line and check that $A\bx = \bzero$.`,
          caption: md`Column 3 equals column 1 plus column 2, so the columns span only a plane: $\rank A = 2$. The null space is the line through $(-1, -1, 1)$, since $-\ba_1 - \ba_2 + \ba_3 = \bzero$. Rank 2 plus nullity 1 equals 3 columns.`,
        },
        {
          kind: 'callout',
          tone: 'theorem',
          title: 'Bases from the RREF',
          md: md`Reduce $A$ to its RREF $R$.

- The **pivot columns of $A$** (the original matrix, in the positions where $R$ has pivots) form a basis of $\Col(A)$.
- For each free variable, set it to 1 and the other free variables to 0, and solve for the pivot variables. These **special solutions** form a basis of $\Null(A)$.`,
        },
        {
          kind: 'callout',
          tone: 'warning',
          md: md`Take the column-space basis from $A$, not from $R$. Row operations change the column space: if $R$ has a zero last row, every column of $R$ ends in 0, while the columns of $A$ usually do not. What row operations preserve is every dependence relation among the columns, which is why the pivot **positions** carry over.`,
        },
        {
          kind: 'text',
          md: md`**Example.** $A = \begin{bmatrix} 1 & 2 & 0 & 1 \\ 2 & 4 & 1 & 4 \\ 1 & 2 & 1 & 3 \end{bmatrix}$ has RREF $\begin{bmatrix} 1 & 2 & 0 & 1 \\ 0 & 0 & 1 & 2 \\ 0 & 0 & 0 & 0 \end{bmatrix}$. Pivots in columns 1 and 3, so $\Col(A)$ has basis $(1, 2, 1), (0, 1, 1)$ and $\rank A = 2$. The free variables are $x_2$ and $x_4$:

- $x_2 = 1, x_4 = 0$ gives $(-2, 1, 0, 0)$
- $x_2 = 0, x_4 = 1$ gives $(-1, 0, -2, 1)$

These two vectors are a basis of $\Null(A)$, so the nullity is 2.`,
        },
        {
          kind: 'viz',
          viz: { type: 'la.rowreduce', matrix: [[1, 2, 0, 1], [2, 4, 1, 4], [1, 2, 1, 3]] },
          task: md`Reduce to RREF and compare the null-space basis in the final box with the example. Multiply $A$ by each basis vector in your head to confirm you get $\bzero$.`,
          caption: md`Without a right-hand side, the stepper reports the rank and one null-space vector per free column.`,
        },
        {
          kind: 'callout',
          tone: 'theorem',
          title: 'Rank–nullity',
          md: md`For any $m\times n$ matrix $A$, $$\rank A + \dim\Null(A) = n.$$ Every column is either a pivot column (counted by the rank) or a free column (one special solution each).`,
        },
        {
          kind: 'check',
          q: md`$A$ is $5\times 8$ with rank 3. What is the dimension of $\Null(A)$?`,
          options: [md`5`, md`3`, md`2`, md`8`],
          answer: 0,
          explain: md`Rank–nullity uses the number of **columns**: $8 - 3 = 5$. The number of rows plays no role here.`,
        },
        {
          kind: 'numeric',
          q: md`What is the rank of $\begin{bmatrix} 1 & 2 & 3 \\ 2 & 4 & 6 \\ 1 & 0 & 1 \end{bmatrix}$?`,
          answer: { kind: 'number', value: 2 },
          explain: md`Row 2 is twice row 1, and row 3 is not a multiple of row 1. Elimination leaves two nonzero rows: rank 2, nullity 1.`,
        },
        {
          kind: 'callout',
          tone: 'theorem',
          title: 'Structure of the solution set',
          md: md`$A\bx = \bb$ is solvable exactly when $\bb \in \Col(A)$, equivalently $\rank\,[A \mid \bb] = \rank A$. If $\bx_p$ is any one solution, the set of all solutions is $$\{\bx_p + \bn : \bn \in \Null(A)\}.$$ So the solution is unique exactly when $\Null(A) = \{\bzero\}$.`,
        },
        {
          kind: 'derive',
          title: 'particular plus null space',
          goal: md`Let $A\bx_p = \bb$. Show that $\bx$ solves $A\bx = \bb$ if and only if $\bx - \bx_p \in \Null(A)$.`,
          steps: [
            {
              md: md`If $A\bx = \bb$, then $A(\bx - \bx_p) = A\bx - A\bx_p = \bb - \bb = \bzero$, so $\bx - \bx_p \in \Null(A)$.`,
              choose: {
                prompt: md`Which property of $A$ makes $A(\bx - \bx_p) = A\bx - A\bx_p$?`,
                options: [md`Linearity`, md`Invertibility`, md`Symmetry`],
                answer: 0,
                explain: md`Every matrix map is linear; no other property is needed.`,
              },
            },
            { md: md`Conversely, if $\bn = \bx - \bx_p \in \Null(A)$, then $A\bx = A(\bx_p + \bn) = \bb + \bzero = \bb$.` },
          ],
          takeaway: md`The solution set is the null space shifted to pass through $\bx_p$: a point, line or plane parallel to $\Null(A)$, as the three-pictures lesson suggested.`,
        },
        {
          kind: 'viz',
          viz: { type: 'la.nullcol3d', matrix: [[1, 0, 1], [1, 1, 2], [0, 1, 1]], mode: 'solve' },
          task: md`Choose a target $\bb$ with $s_1, s_2$. Then move $t$: $\bx$ slides along the green line while $A\bx$ stays fixed at $\bb$.`,
          caption: md`$\bx_p$ uses only the pivot columns ($x_3 = 0$). Every solution is $\bx_p + t(-1, -1, 1)$: the green solution line is parallel to the red null-space line.`,
        },
        {
          kind: 'check',
          q: md`$A\bx = \bb$ has at least one solution and $\Null(A) = \{\bzero\}$. Then`,
          options: [md`the solution is unique`, md`there are infinitely many solutions`, md`$A$ must be square`, md`$\bb = \bzero$`],
          answer: 0,
          explain: md`All solutions are $\bx_p + \bn$ with $\bn \in \Null(A) = \{\bzero\}$. $A$ can be tall: a $3\times 2$ matrix with independent columns has trivial null space, and $A\bx = \bb$ is then solvable only for $\bb$ in its column space.`,
        },
        {
          kind: 'paper',
          problem: {
            id: 'la04-2-paper',
            title: 'Column space and null space by hand',
            type: 'compute',
            difficulty: 2,
            minutes: 10,
            statement: md`For $A = \begin{bmatrix} 1 & -1 & 2 \\ 2 & -2 & 4 \\ 1 & 0 & 1 \end{bmatrix}$, find the rank, a basis of $\Col(A)$ and a basis of $\Null(A)$. Check rank–nullity. Enter the null-space basis vector.`,
            solution: [
              md`$R_2 \leftarrow R_2 - 2R_1$ gives a zero row; $R_3 \leftarrow R_3 - R_1$ gives $(0, 1, -1)$. Swap rows 2 and 3.`,
              md`$R_1 \leftarrow R_1 + R_2$: RREF $\begin{bmatrix} 1 & 0 & 1 \\ 0 & 1 & -1 \\ 0 & 0 & 0 \end{bmatrix}$. Pivots in columns 1 and 2: rank 2.`,
              md`Column-space basis: columns 1 and 2 of $A$, $(1, 2, 1)$ and $(-1, -2, 0)$.`,
              md`$x_3$ is free: $x_1 = -x_3$, $x_2 = x_3$. With $x_3 = 1$: $(-1, 1, 1)$. Check: $A(-1, 1, 1) = (-1 - 1 + 2,\ -2 - 2 + 4,\ -1 + 0 + 1) = \bzero$.`,
              md`Rank–nullity: $2 + 1 = 3$ columns.`,
            ],
            answer: { kind: 'vector', value: [-1, 1, 1], upToScale: true },
          },
        },
        {
          kind: 'code',
          code: `import numpy as np

A = np.array([[1, 2, 0, 1], [2, 4, 1, 4], [1, 2, 1, 3]])
v2 = np.array([-2, 1, 0, 0])
v4 = np.array([-1, 0, -2, 1])
print(np.linalg.matrix_rank(A), A @ v2, A @ v4)`,
          predict: {
            q: md`What is printed?`,
            options: ['`2 [0 0 0] [0 0 0]`', '`3 [0 0 0] [0 0 0]`', '`2 [0 0 0 0] [0 0 0 0]`', '`4 [0 0 0] [0 0 0]`'],
            answer: 0,
            explain: md`Rank 2, and both special solutions are sent to the zero vector of $\R^3$ (three entries, one per row of $A$).`,
          },
        },
        {
          kind: 'exercise',
          ex: {
            id: 'la04-2-ex',
            title: 'Solvability and nullity from ranks',
            prompt: md`Write \`is_solvable(A, b)\`, which returns whether $A\bx = \bb$ has a solution, by comparing the rank of $A$ with the rank of $[A \mid \bb]$. Then write \`nullity(A)\` using rank–nullity. Use \`np.linalg.matrix_rank\`; build $[A \mid \bb]$ with \`np.column_stack((A, b))\`.`,
            starter: `import numpy as np

def is_solvable(A, b):
    return True

def nullity(A):
    return 0
`,
            solution: `import numpy as np

def is_solvable(A, b):
    Ab = np.column_stack((A, b))
    return np.linalg.matrix_rank(Ab) == np.linalg.matrix_rank(A)

def nullity(A):
    return A.shape[1] - np.linalg.matrix_rank(A)
`,
            tests: [
              { expr: 'bool(is_solvable(np.array([[1, 2], [2, 4]]), np.array([3, 6])))', label: 'b in the column space' },
              { expr: 'bool(is_solvable(np.array([[1, 2], [2, 4]]), np.array([3, 7])))', label: 'b outside the column space' },
              { expr: 'int(nullity(np.array([[1, 2, 0, 1], [2, 4, 1, 4], [1, 2, 1, 3]])))', label: 'nullity of the lesson example' },
              { expr: 'int(nullity(np.eye(3)))', label: 'nullity of the identity' },
            ],
            hints: [md`Solvable iff $\rank\,[A \mid \bb] = \rank A$: adding $\bb$ as a column does not create a new independent direction.`, md`Nullity is the number of columns, \`A.shape[1]\`, minus the rank.`],
            mustInclude: ['matrix_rank'],
          },
        },
        {
          kind: 'recall',
          prompt: md`From memory: how do you get bases of $\Col(A)$ and $\Null(A)$ from the RREF, what does rank–nullity say, and what does the full solution set of $A\bx = \bb$ look like?`,
          answer: md`Pivot columns of the original $A$ form a basis of $\Col(A)$; one special solution per free variable forms a basis of $\Null(A)$. $\rank A + \dim\Null(A) = n$, the number of columns. All solutions are $\bx_p + \bn$ with $\bn \in \Null(A)$.`,
        },
      ],
      cards: [
        { id: 'la04-2-c1', kind: 'concept', front: md`Define $\Col(A)$ and $\Null(A)$ for an $m\times n$ matrix, and say where each lives.`, back: md`$\Col(A) = \{A\bx\}$, the span of the columns, in $\R^m$. $\Null(A) = \{\bx : A\bx = \bzero\}$, in $\R^n$.` },
        { id: 'la04-2-c2', kind: 'cloze', text: md`Rank–nullity: $\rank A + \dim\Null(A)$ equals the number of {{}} of $A$.`, answers: ['columns'] },
        { id: 'la04-2-c3', kind: 'compute', front: md`A $4\times 6$ matrix has rank 4. What is its nullity?`, answer: { kind: 'number', value: 2 }, back: md`$6 - 4 = 2$.` },
        { id: 'la04-2-c4', kind: 'concept', front: md`Which columns form a basis of $\Col(A)$?`, back: md`The columns of the **original** $A$ in the pivot positions of its RREF.` },
        { id: 'la04-2-c5', kind: 'concept', front: md`When is $A\bx = \bb$ solvable, and what is the full solution set?`, back: md`When $\bb \in \Col(A)$, i.e. $\rank\,[A \mid \bb] = \rank A$. Then all solutions are $\bx_p + \Null(A)$.` },
      ],
    },
    // ------------------------------------------------------------------ 4.3
    {
      id: 'la04-3',
      title: 'The four fundamental subspaces, and rank in ML',
      minutes: 35,
      objectives: [
        'Name the four fundamental subspaces of an m×n matrix, the space each lives in, and its dimension.',
        'Show that the null space is orthogonal to the row space, and the left null space to the column space.',
        'Explain multicollinearity as a rank deficiency of the design matrix and describe its effect on least squares.',
        'Count the parameters of a rank-r update BA and explain how LoRA uses low rank.',
      ],
      cells: [
        {
          kind: 'text',
          md: md`Every $m\times n$ matrix $A$ of rank $r$ comes with four subspaces, two in the input space $\R^n$ and two in the output space $\R^m$:

| subspace | definition | lives in | dimension |
|---|---|---|---|
| column space $\Col(A)$ | span of the columns | $\R^m$ | $r$ |
| row space $\Row(A) = \Col(A\T)$ | span of the rows | $\R^n$ | $r$ |
| null space $\Null(A)$ | $A\bx = \bzero$ | $\R^n$ | $n - r$ |
| left null space $\Null(A\T)$ | $A\T\by = \bzero$ | $\R^m$ | $m - r$ |

The row space and the column space have the same dimension: row rank equals column rank. Both equal the number of pivots, because the nonzero rows of the echelon form are a basis of the row space.`,
        },
        {
          kind: 'callout',
          tone: 'theorem',
          title: 'Orthogonality of the four subspaces',
          md: md`$\Null(A)$ is orthogonal to $\Row(A)$, and $\Null(A\T)$ is orthogonal to $\Col(A)$. Moreover the dimensions add up: $r + (n - r) = n$ and $r + (m - r) = m$. Each pair splits its space: every $\bx \in \R^n$ is uniquely $\bx_r + \bx_n$ with $\bx_r$ in the row space and $\bx_n$ in the null space, and $A\bx = A\bx_r$.`,
        },
        {
          kind: 'derive',
          title: 'the null space is orthogonal to the row space',
          goal: md`Show that if $A\bx = \bzero$, then $\bx$ is orthogonal to every vector in $\Row(A)$.`,
          steps: [
            {
              md: md`Entry $i$ of $A\bx$ is (row $i$ of $A$)$\cdot\bx$. So $A\bx = \bzero$ says $\bx$ is orthogonal to every row of $A$.`,
              choose: {
                prompt: md`Which view of $A\bx$ makes the orthogonality visible?`,
                options: [md`The row view: each entry is a row dotted with $\bx$`, md`The column view: a combination of the columns`, md`The outer-product view`],
                answer: 0,
                explain: md`The row view writes $A\bx = \bzero$ as $m$ dot products that are all zero.`,
              },
            },
            { md: md`A vector in the row space is $\sum_i c_i\boldsymbol{\alpha}_i$, a combination of the rows. By linearity of the dot product, $\left(\sum_i c_i\boldsymbol{\alpha}_i\right)\cdot\bx = \sum_i c_i(\boldsymbol{\alpha}_i\cdot\bx) = 0$.` },
            { md: md`Apply the same argument to $A\T$: its rows are the columns of $A$, so $\Null(A\T)$ is orthogonal to $\Col(A)$.` },
          ],
          takeaway: md`A matrix can only "see" the row-space part of its input. The null-space part is invisible: it is sent to $\bzero$.`,
        },
        {
          kind: 'viz',
          viz: { type: 'la.fourspaces', matrix: [[1, 1], [2, 2]], x: [2, 0] },
          task: md`Drag $\bx$ along a line parallel to the dashed red null space. Does $A\bx$ move? Now drag it parallel to the blue row space. Which output points can you reach at all?`,
          caption: md`For $A = \begin{bmatrix} 1 & 1 \\ 2 & 2 \end{bmatrix}$ the row space is the line of $(1, 1)$, the null space the perpendicular line of $(1, -1)$, the column space the line of $(1, 2)$, and the left null space the line of $(2, -1)$. Every output lies on the column-space line.`,
        },
        {
          kind: 'numeric',
          q: md`Give a basis vector of the left null space $\Null(A\T)$ of $A = \begin{bmatrix} 1 & 1 \\ 2 & 2 \end{bmatrix}$.`,
          answer: { kind: 'vector', value: [2, -1], upToScale: true },
          explain: md`$A\T\by = \bzero$ means $y_1 + 2y_2 = 0$ (both rows of $A\T$ are $(1, 2)$). So $\by = (2, -1)$, which is orthogonal to the column $(1, 2)$.`,
        },
        {
          kind: 'check',
          q: md`$A$ is $3\times 5$ with rank 2. The dimensions of $\Col(A)$, $\Row(A)$, $\Null(A)$, $\Null(A\T)$ are`,
          options: [md`2, 2, 3, 1`, md`2, 2, 1, 3`, md`3, 5, 2, 2`, md`2, 3, 3, 2`],
          answer: 0,
          explain: md`$r = 2$ for both column and row space; $n - r = 5 - 2 = 3$; $m - r = 3 - 2 = 1$.`,
        },
        {
          kind: 'text',
          md: md`**Multicollinearity.** In linear regression the design matrix $X$ is $N\times d$, one row per example, one column per feature. If some feature is a linear combination of others (for example an intercept column, $x_1$, and $x_2 = 2x_1 + 1$), the columns are dependent and $\rank X < d$. Then:

- $\Null(X)$ contains a nonzero $\bn$, and $\bw$ and $\bw + t\bn$ give **identical predictions** $X\bw$ for every $t$. The weights are not determined by the data.
- $X\T X$ is singular, so the normal equations $X\T X\bw = X\T\by$ do not have a unique solution.
- If the dependence is only approximate, $X\T X$ is nearly singular and the fitted weights have very high variance.

Remedies: drop or combine redundant features, or add a ridge penalty, which replaces $X\T X$ by $X\T X + \lambda I$, invertible for every $\lambda > 0$.`,
        },
        {
          kind: 'check',
          q: md`A model is trained with the same feature included twice. Compared with including it once, ordinary least squares gives`,
          options: [md`the same predictions, but the two weights are not unique: only their sum is determined`, md`better predictions, since the feature counts double`, md`a unique solution in which both weights are equal`, md`no solution at all`],
          answer: 0,
          explain: md`The two columns are equal, so $(1, -1)$ (in those two positions) is in the null space. Any split $w_a + w_b = c$ gives the same $X\bw$. A solver may return the minimum-norm split, but the data cannot distinguish them.`,
        },
        {
          kind: 'text',
          md: md`**Low rank.** A matrix of rank $r$ can be written as a sum of $r$ outer products, $W = \sum_{k=1}^r \bb_k\ba_k\T = BA$ with $B$ of shape $m\times r$ and $A$ of shape $r\times n$. Storing $B$ and $A$ takes $r(m + n)$ numbers instead of $mn$.

**LoRA** (low-rank adaptation) fine-tunes a pretrained layer by freezing $W$ and learning only an update of this form: $$W' = W + \Delta W = W + BA, \qquad r \ll \min(m, n).$$ It rests on the observation that useful fine-tuning updates tend to have low effective rank. In the original method $B$ starts at zero, so training starts exactly at the pretrained model, and $r$ is typically between 4 and 64. QLoRA applies the same update on top of a 4-bit quantized frozen $W$.`,
        },
        {
          kind: 'viz',
          viz: { type: 'la.lowrank', r: 1 },
          task: md`Raise the number of outer products from 1 to 3 and watch the rank of $\Delta W$. Then, for $d = 4096$ and $r = 8$, read off what fraction of a full update LoRA trains.`,
          caption: md`$BA$ is a sum of $r$ rank-one matrices, so its rank is at most $r$. For $d = 4096$, $r = 8$: $2dr = 65{,}536$ trainable numbers against $d^2 = 16{,}777{,}216$, about $0.39\%$.`,
        },
        {
          kind: 'numeric',
          q: md`How many trainable parameters does a rank-16 LoRA update of a $4096\times 4096$ weight matrix have?`,
          answer: { kind: 'number', value: 131072 },
          explain: md`$B$ is $4096\times 16$ and $A$ is $16\times 4096$: $2\cdot 4096\cdot 16 = 131{,}072$, about $0.78\%$ of $4096^2$.`,
        },
        {
          kind: 'paper',
          problem: {
            id: 'la04-3-paper',
            title: 'The rank of a product',
            type: 'proof',
            difficulty: 3,
            minutes: 12,
            statement: md`Prove that $\rank(AB) \le \rank A$ and $\rank(AB) \le \rank B$. Conclude that for $B$ of shape $m\times r$ and $A$ of shape $r\times n$, the LoRA update $BA$ has rank at most $r$.`,
            hints: [md`For the first inequality compare $\Col(AB)$ with $\Col(A)$.`, md`For the second, compare $\Null(B)$ with $\Null(AB)$ and use rank–nullity.`],
            solution: [
              md`Every column of $AB$ is $A\bb_j$, a combination of the columns of $A$. So $\Col(AB) \subseteq \Col(A)$ and $\rank(AB) \le \rank A$.`,
              md`If $B\bx = \bzero$ then $AB\bx = \bzero$, so $\Null(B) \subseteq \Null(AB)$ and $\dim\Null(B) \le \dim\Null(AB)$.`,
              md`Both $B$ and $AB$ have the same number of columns $p$. Rank–nullity gives $\rank(AB) = p - \dim\Null(AB) \le p - \dim\Null(B) = \rank B$.`,
              md`For the LoRA update, $\rank(BA) \le \rank B \le r$, since $B$ has only $r$ columns.`,
            ],
            rubric: [md`Column-space inclusion for the first inequality`, md`Null-space inclusion for the second`, md`Correct use of rank–nullity with the column count`, md`Applies the result to $BA$`],
            areas: ['math', 'llm'],
          },
        },
        {
          kind: 'code',
          code: `import numpy as np

np.random.seed(0)
x1 = np.random.randn(100)
X = np.column_stack([np.ones(100), x1, 2 * x1 + 1])   # third feature = 2*x1 + 1
print(np.linalg.matrix_rank(X))`,
          predict: {
            q: md`$X$ has 100 rows and 3 columns. What is its rank?`,
            options: ['`2`', '`3`', '`100`', '`1`'],
            answer: 0,
            explain: md`Column 3 = column 1 + 2·column 2, so only two columns are independent. A null vector is $(1, 2, -1)$.`,
          },
        },
        {
          kind: 'code',
          code: `import numpy as np

np.random.seed(1)
B = np.random.randn(6, 2)
A = np.random.randn(2, 6)
print(np.linalg.matrix_rank(B @ A))`,
          predict: {
            q: md`$BA$ is a $6\times 6$ matrix. What is its rank?`,
            options: ['`2`', '`6`', '`4`', '`1`'],
            answer: 0,
            explain: md`$\rank(BA) \le 2$ because $B$ has only two columns, and random factors achieve the bound.`,
          },
        },
        {
          kind: 'explain',
          prompt: md`An interviewer asks: *how does LoRA reduce the cost of fine-tuning, and what does it assume?* Answer in a few sentences, with the parameter count for one $d\times d$ matrix.`,
          model: md`LoRA freezes the pretrained weight $W$ and learns an additive update $\Delta W = BA$ with $B \in \R^{d\times r}$, $A \in \R^{r\times d}$ and small $r$, so each adapted matrix has $2dr$ trainable parameters instead of $d^2$ (for $d = 4096$, $r = 8$: 65,536 instead of about 16.8 million). Optimizer state and gradients are needed only for those parameters, which cuts training memory, and the adapters are small to store and swap. The assumption is that the change needed for the new task has low effective rank, which works well in practice for many fine-tuning tasks. After training, $BA$ can be merged into $W$, so inference costs nothing extra.`,
        },
        {
          kind: 'recall',
          prompt: md`From memory: list the four fundamental subspaces of an $m\times n$ matrix of rank $r$ with their dimensions, and the two orthogonality relations.`,
          answer: md`$\Col(A) \subseteq \R^m$, dim $r$; $\Row(A) \subseteq \R^n$, dim $r$; $\Null(A) \subseteq \R^n$, dim $n - r$; $\Null(A\T) \subseteq \R^m$, dim $m - r$. $\Null(A) \perp \Row(A)$ and $\Null(A\T) \perp \Col(A)$.`,
        },
      ],
      cards: [
        { id: 'la04-3-c1', kind: 'concept', front: md`The four fundamental subspaces of $A$ ($m\times n$, rank $r$) and their dimensions.`, back: md`$\Col(A)$: $r$, in $\R^m$. $\Row(A)$: $r$, in $\R^n$. $\Null(A)$: $n - r$, in $\R^n$. $\Null(A\T)$: $m - r$, in $\R^m$.` },
        { id: 'la04-3-c2', kind: 'cloze', text: md`The null space of $A$ is orthogonal to the {{}} space of $A$.`, answers: ['row'] },
        { id: 'la04-3-c3', kind: 'compute', front: md`Trainable parameters of a rank-8 LoRA update on a $1024\times 1024$ matrix?`, answer: { kind: 'number', value: 16384 }, back: md`$2\cdot 1024\cdot 8 = 16{,}384$.` },
        { id: 'la04-3-c4', kind: 'concept', front: md`What does perfect multicollinearity do to least squares?`, back: md`$X$ loses rank, $X\T X$ is singular, and the weights are not unique: adding any null-space vector of $X$ leaves the predictions unchanged.` },
        { id: 'la04-3-c5', kind: 'concept', front: md`Why is the rank of $BA$ at most $r$ when $B$ is $m\times r$?`, back: md`Every column of $BA$ is a combination of the $r$ columns of $B$, so $\Col(BA) \subseteq \Col(B)$, which has dimension at most $r$.` },
      ],
    },
  ],
  problems: [
    {
      id: 'la04-p1',
      title: 'A dependence relation',
      type: 'compute',
      difficulty: 1,
      minutes: 6,
      statement: md`Are $\bv_1 = (1, 0, 2)$, $\bv_2 = (2, 1, 0)$, $\bv_3 = (0, 1, -4)$ linearly independent? If not, find a dependence relation and enter $[c_1, c_2, c_3]$.`,
      solution: [
        md`Columns of $A = \begin{bmatrix} 1 & 2 & 0 \\ 0 & 1 & 1 \\ 2 & 0 & -4 \end{bmatrix}$. $R_3 \leftarrow R_3 - 2R_1$: $(0, -4, -4)$. $R_3 \leftarrow R_3 + 4R_2$: zero row.`,
        md`Column 3 has no pivot, so the vectors are dependent. RREF: $c_1 - 2c_3 = 0$, $c_2 + c_3 = 0$.`,
        md`With $c_3 = 1$: $c_1 = 2$, $c_2 = -1$. Check: $2(1, 0, 2) - (2, 1, 0) + (0, 1, -4) = \bzero$.`,
      ],
      answer: { kind: 'vector', value: [2, -1, 1], upToScale: true },
    },
    {
      id: 'la04-p2',
      title: 'Rank of a 3×4 matrix',
      type: 'compute',
      difficulty: 1,
      minutes: 5,
      statement: md`Find the rank of $\begin{bmatrix} 1 & 2 & 1 & 0 \\ 2 & 4 & 0 & 2 \\ 3 & 6 & 1 & 2 \end{bmatrix}$ and the dimension of its null space.`,
      solution: [
        md`$R_2 \leftarrow R_2 - 2R_1$: $(0, 0, -2, 2)$. $R_3 \leftarrow R_3 - 3R_1$: $(0, 0, -2, 2)$.`,
        md`$R_3 \leftarrow R_3 - R_2$: zero row. Two pivots (columns 1 and 3): rank 2.`,
        md`Nullity $= 4 - 2 = 2$.`,
      ],
      answer: { kind: 'number', value: 2 },
    },
    {
      id: 'la04-p3',
      title: 'A null-space basis',
      type: 'compute',
      difficulty: 2,
      minutes: 6,
      statement: md`Find a basis of $\Null(A)$ for $A = \begin{bmatrix} 1 & 2 & 0 & -1 \\ 0 & 0 & 1 & 3 \end{bmatrix}$ (already in RREF). Enter the basis vector with $x_2 = 0$, $x_4 = 1$.`,
      solution: [
        md`Pivots in columns 1 and 3; $x_2$ and $x_4$ are free. The rows say $x_1 = -2x_2 + x_4$ and $x_3 = -3x_4$.`,
        md`$x_2 = 1, x_4 = 0$: $(-2, 1, 0, 0)$. $x_2 = 0, x_4 = 1$: $(1, 0, -3, 1)$.`,
        md`These two special solutions are independent (each has a 1 where the other has a 0), so they form a basis; nullity $= 4 - 2 = 2$.`,
      ],
      answer: { kind: 'vector', value: [1, 0, -3, 1] },
    },
    {
      id: 'la04-p4',
      title: 'The null space is a subspace',
      type: 'proof',
      difficulty: 1,
      minutes: 5,
      statement: md`Prove that $\Null(A) = \{\bx : A\bx = \bzero\}$ is a subspace of $\R^n$. Then show that the solution set of $A\bx = \bb$ with $\bb \ne \bzero$ is **not** a subspace.`,
      solution: [
        md`$A\bzero = \bzero$, so $\bzero \in \Null(A)$.`,
        md`If $A\bx = A\by = \bzero$ then $A(\bx + \by) = A\bx + A\by = \bzero$: closed under addition.`,
        md`If $A\bx = \bzero$ then $A(c\bx) = cA\bx = \bzero$: closed under scalar multiplication.`,
        md`For $\bb \ne \bzero$, $A\bzero = \bzero \ne \bb$, so $\bzero$ is not a solution and the solution set is not a subspace (it is a shifted copy of $\Null(A)$).`,
      ],
      rubric: [md`Contains $\bzero$`, md`Closure under addition, using linearity`, md`Closure under scaling`, md`Counter-argument for $\bb \ne \bzero$`],
    },
    {
      id: 'la04-p5',
      title: 'Independent columns make AᵀA invertible',
      type: 'proof',
      difficulty: 3,
      minutes: 12,
      statement: md`Let $A$ be $m\times n$ with linearly independent columns. Prove that the $n\times n$ matrix $A\T A$ is invertible. Explain why this is the condition under which least squares has a unique solution.`,
      hints: [md`Show $\Null(A\T A) = \{\bzero\}$. If $A\T A\bx = \bzero$, multiply on the left by $\bx\T$.`],
      solution: [
        md`$A\T A$ is square, so it is enough to show its null space is $\{\bzero\}$.`,
        md`Suppose $A\T A\bx = \bzero$. Then $0 = \bx\T A\T A\bx = (A\bx)\T(A\bx) = \lVert A\bx\rVert^2$.`,
        md`A vector with zero length is $\bzero$, so $A\bx = \bzero$. Independent columns mean $\Null(A) = \{\bzero\}$, so $\bx = \bzero$.`,
        md`Hence $A\T A$ is invertible. In least squares, $A = X$ is the design matrix and the normal equations $X\T X\bw = X\T\by$ then have the unique solution $\bw = (X\T X)^{-1}X\T\by$. With dependent features (multicollinearity) this fails.`,
      ],
      rubric: [md`Reduces invertibility to a trivial null space`, md`Uses $\bx\T A\T A\bx = \lVert A\bx\rVert^2$`, md`Uses independence of the columns to conclude $\bx = \bzero$`, md`Connects to the normal equations`],
      areas: ['math', 'ml-depth'],
    },
    {
      id: 'la04-p6',
      title: 'Dimensions of the four subspaces',
      type: 'concept',
      difficulty: 1,
      minutes: 4,
      statement: md`$A$ is a $4\times 6$ matrix of rank 3. Give the dimensions of $\Col(A)$, $\Row(A)$, $\Null(A)$ and $\Null(A\T)$, in that order. Can $A\bx = \bb$ be solved for every $\bb \in \R^4$?`,
      solution: [
        md`$\dim\Col(A) = \dim\Row(A) = 3$.`,
        md`$\dim\Null(A) = 6 - 3 = 3$ and $\dim\Null(A\T) = 4 - 3 = 1$.`,
        md`No: $\Col(A)$ is a 3-dimensional subspace of $\R^4$, so some $\bb$ lie outside it.`,
      ],
      answer: { kind: 'vector', value: [3, 3, 3, 1] },
    },
    {
      id: 'la04-p7',
      title: 'An intercept and a derived feature',
      type: 'apply',
      difficulty: 2,
      minutes: 8,
      statement: md`A regression has design matrix columns $\mathbf{1}$ (intercept), $\bx_1$, and $\bx_2 = 3\bx_1 - 2\cdot\mathbf{1}$. Find a nonzero vector $\bn$ in the null space of $X = [\,\mathbf{1}\ \bx_1\ \bx_2\,]$, and explain what it means for the fitted weights. Enter $\bn$.`,
      solution: [
        md`The relation $\bx_2 = 3\bx_1 - 2\cdot\mathbf{1}$ rearranges to $2\cdot\mathbf{1} - 3\bx_1 + \bx_2 = \bzero$, so $X(2, -3, 1) = \bzero$.`,
        md`So $\bn = (2, -3, 1)$, and every multiple of it, is in $\Null(X)$.`,
        md`For any weights $\bw$, $X(\bw + t\bn) = X\bw$: the predictions do not change along this direction, so least squares cannot pick a unique $\bw$. The intercept, the weight on $x_1$ and the weight on $x_2$ trade off against each other.`,
      ],
      answer: { kind: 'vector', value: [2, -3, 1], upToScale: true },
      areas: ['math', 'ml-breadth'],
    },
    {
      id: 'la04-p8',
      title: 'Coordinates in a triangular basis',
      type: 'compute',
      difficulty: 1,
      minutes: 5,
      statement: md`Find the coordinates of $\bx = (3, 2, 1)$ in the basis $\bb_1 = (1, 0, 0)$, $\bb_2 = (1, 1, 0)$, $\bb_3 = (1, 1, 1)$.`,
      solution: [
        md`Solve $c_1\bb_1 + c_2\bb_2 + c_3\bb_3 = \bx$: $c_1 + c_2 + c_3 = 3$, $c_2 + c_3 = 2$, $c_3 = 1$.`,
        md`Back-substitute: $c_3 = 1$, $c_2 = 1$, $c_1 = 1$. Check: $(1,0,0) + (1,1,0) + (1,1,1) = (3, 2, 1)$.`,
      ],
      answer: { kind: 'vector', value: [1, 1, 1] },
    },
    {
      id: 'la04-p9',
      title: 'Counting LoRA parameters in a model',
      type: 'apply',
      difficulty: 2,
      minutes: 6,
      statement: md`A transformer has 32 layers with model width $d = 4096$. LoRA with rank $r = 8$ is applied to the query and value projections ($d\times d$ each) in every layer. How many trainable parameters does LoRA add? How does that compare with the $2\cdot 32\cdot d^2$ weights of the matrices being adapted?`,
      solution: [
        md`One adapted $d\times d$ matrix: $B$ is $4096\times 8$ and $A$ is $8\times 4096$, so $2\cdot 4096\cdot 8 = 65{,}536$ parameters.`,
        md`Two matrices per layer, 32 layers: $64\cdot 65{,}536 = 4{,}194{,}304$, about 4.2 million.`,
        md`The adapted matrices hold $64\cdot 4096^2 \approx 1.07\times 10^9$ weights, so LoRA trains about $0.39\%$ of them.`,
      ],
      answer: { kind: 'number', value: 4194304 },
      areas: ['math', 'llm'],
    },
    {
      id: 'la04-p10',
      title: 'Rank from the null space',
      type: 'concept',
      difficulty: 2,
      minutes: 5,
      statement: md`A $10\times 7$ matrix $A$ has a null space of dimension 2. What is its rank? Is $A\bx = \bb$ solvable for every $\bb \in \R^{10}$? When it is solvable, how many solutions are there?`,
      solution: [
        md`Rank–nullity with $n = 7$ columns: $\rank A = 7 - 2 = 5$.`,
        md`$\Col(A)$ is 5-dimensional inside $\R^{10}$, so most $\bb$ are outside it: not always solvable.`,
        md`When $\bb \in \Col(A)$, the solutions are $\bx_p + \Null(A)$, a 2-dimensional plane of solutions: infinitely many.`,
      ],
      answer: { kind: 'number', value: 5 },
    },
  ],
};
