import { md, type Module } from '../types';

export const MODULE: Module = {
  id: 'la02',
  part: 'la',
  order: 2,
  title: 'Matrices as linear transformations',
  summary: 'A matrix as a function on vectors: the row and column views of Ax, matrix multiplication as composition, and the special matrices that rotate, reflect, shear, project and permute.',
  relevance: md`A linear layer computes $\by = W\bx + \bb$, and most of the arithmetic in a transformer block is matrix multiplication: the query, key, value and output projections and the two or three matrices of the MLP. Shape errors are among the most common bugs in model code, so interviewers ask you to state the shapes in a forward pass, to explain why $AB \neq BA$ and why $(AB)\T = B\T A\T$, and to count the cost of a product ($mnp$ multiply-adds for an $m\times n$ times $n\times p$ product).`,
  areas: ['math', 'ml-breadth', 'ml-coding'],
  prereqs: ['la01'],
  lessons: [
    // ------------------------------------------------------------------ 2.1
    {
      id: 'la02-1',
      title: 'The matrix–vector product and linear maps',
      minutes: 35,
      objectives: [
        'Compute Ax in two ways: row by row with dot products, and as a combination of the columns of A.',
        'State the shape rule: an m×n matrix maps vectors in R^n to vectors in R^m.',
        'Read off where î and ĵ land from the columns of a 2×2 matrix, and build the matrix of a map from those images.',
        'Test whether a map is linear with T(au + bv) = aT(u) + bT(v).',
      ],
      cells: [
        {
          kind: 'text',
          md: md`A layer with 3 inputs and 2 outputs computes each output as a weighted sum of the inputs. The six weights fit in a table with 2 rows and 3 columns, a **matrix**:

$$W = \begin{bmatrix} w_{11} & w_{12} & w_{13} \\ w_{21} & w_{22} & w_{23} \end{bmatrix}, \qquad \begin{aligned} y_1 &= w_{11}x_1 + w_{12}x_2 + w_{13}x_3 \\ y_2 &= w_{21}x_1 + w_{22}x_2 + w_{23}x_3. \end{aligned}$$

An $m \times n$ matrix has $m$ rows and $n$ columns. The entry in row $i$ and column $j$ is $a_{ij}$. Rows come first, always: "$2\times 3$" means 2 rows, 3 columns.`,
        },
        {
          kind: 'callout',
          tone: 'definition',
          title: 'Matrix–vector product',
          md: md`For an $m\times n$ matrix $A$ and $\bx \in \R^n$, the product $A\bx \in \R^m$ has entries $$(A\bx)_i = a_{i1}x_1 + a_{i2}x_2 + \dots + a_{in}x_n = \sum_{j=1}^n a_{ij}x_j.$$ The number of columns of $A$ must equal the length of $\bx$.`,
        },
        {
          kind: 'text',
          md: md`The same sum can be grouped in two ways, and both are worth having in your head.

- **Row view.** Entry $i$ of $A\bx$ is the dot product of row $i$ of $A$ with $\bx$.
- **Column view.** $A\bx$ is a linear combination of the columns $\ba_1, \dots, \ba_n$ of $A$, with the entries of $\bx$ as coefficients: $$A\bx = x_1\ba_1 + x_2\ba_2 + \dots + x_n\ba_n.$$

Example with $A = \begin{bmatrix} 1 & 2 & 0 \\ 3 & -1 & 4 \end{bmatrix}$ and $\bx = (2, 1, -1)$. Row view: $(1\cdot 2 + 2\cdot 1 + 0\cdot(-1),\ 3\cdot 2 + (-1)\cdot 1 + 4\cdot(-1)) = (4, 1)$. Column view: $2\begin{bmatrix}1\\3\end{bmatrix} + 1\begin{bmatrix}2\\-1\end{bmatrix} - 1\begin{bmatrix}0\\4\end{bmatrix} = \begin{bmatrix}4\\1\end{bmatrix}$.`,
        },
        {
          kind: 'viz',
          viz: { type: 'la.matmul', A: [[1, 2, 0], [3, -1, 4]], B: [[2], [1], [-1]], views: ['entry', 'column'], names: ['A', '\\mathbf{x}', 'A\\mathbf{x}'] },
          task: md`Step through the **entries** view, then switch to **columns** and step again. Before each step, predict the number that appears.`,
          caption: md`Both views do the same six multiplications. The row view is how you compute by hand; the column view tells you what the answer **is**: a point in the span of the columns.`,
        },
        {
          kind: 'numeric',
          q: md`Compute $\begin{bmatrix} 2 & -1 \\ 0 & 3 \\ 1 & 1 \end{bmatrix}\begin{bmatrix} 3 \\ 2 \end{bmatrix}$.`,
          answer: { kind: 'vector', value: [4, 6, 5] },
          hints: [md`Column view: $3$ times the first column plus $2$ times the second.`],
          explain: md`$3(2, 0, 1) + 2(-1, 3, 1) = (6 - 2,\ 0 + 6,\ 3 + 2) = (4, 6, 5)$. A $3\times 2$ matrix takes a 2-vector to a 3-vector.`,
        },
        {
          kind: 'callout',
          tone: 'remember',
          title: 'The shape rule',
          md: md`An $m\times n$ matrix is a function $\R^n \to \R^m$: it eats vectors of length $n$ (the number of columns) and returns vectors of length $m$ (the number of rows). $$\underbrace{A}_{m\times n}\ \underbrace{\bx}_{n} = \underbrace{\by}_{m}.$$`,
        },
        {
          kind: 'text',
          md: md`**Where the basis vectors go.** Let $\be_j$ be the vector with a 1 in position $j$ and zeros elsewhere; in $\R^2$ these are $\ihat = (1, 0)$ and $\jhat = (0, 1)$. By the column view, $A\be_j = \ba_j$: the $j$-th column of $A$ is where $\be_j$ lands.

Every $\bx \in \R^2$ is $x_1\ihat + x_2\jhat$, so $$A\bx = x_1 (A\ihat) + x_2 (A\jhat).$$ Knowing where $\ihat$ and $\jhat$ go determines where **every** vector goes. To read a $2\times 2$ matrix geometrically, look at its two columns.`,
        },
        {
          kind: 'viz',
          viz: { type: 'la.transform2d', matrix: [[1, 1], [0, 1]], x: [1, 2], presets: false },
          task: md`Drag $A\ihat$ to $(2, 1)$ and $A\jhat$ to $(-1, 1)$. Before looking, predict where $\bx = (1, 2)$ lands. Then drag $\bx$ around and watch the dashed path $x_1\ba_1 + x_2\ba_2$.`,
          caption: md`The blue grid is the image of the ordinary grid. $A\bx$ is reached by walking $x_1$ copies of $A\ihat$ (green dashes) and then $x_2$ copies of $A\jhat$ (red dashes). For the target matrix, $A(1, 2) = 1\cdot(2, 1) + 2\cdot(-1, 1) = (0, 3)$.`,
        },
        {
          kind: 'check',
          q: md`A linear map sends $\ihat \mapsto (3, 1)$ and $\jhat \mapsto (-1, 2)$. Its matrix is`,
          options: [md`$\begin{bmatrix} 3 & -1 \\ 1 & 2 \end{bmatrix}$`, md`$\begin{bmatrix} 3 & 1 \\ -1 & 2 \end{bmatrix}$`, md`$\begin{bmatrix} 1 & 3 \\ 2 & -1 \end{bmatrix}$`, md`$\begin{bmatrix} 3 & 0 \\ 0 & 2 \end{bmatrix}$`],
          answer: 0,
          explain: md`The images of the basis vectors are the **columns**: first column $(3, 1)$, second column $(-1, 2)$. Writing them as rows gives the transpose, a different map.`,
        },
        {
          kind: 'callout',
          tone: 'definition',
          title: 'Linear map',
          md: md`A function $T: \R^n \to \R^m$ is **linear** if for all vectors $\bu, \bv$ and scalars $a, b$ $$T(a\bu + b\bv) = a\,T(\bu) + b\,T(\bv).$$ Every map $\bx \mapsto A\bx$ is linear, and every linear map from $\R^n$ to $\R^m$ is $\bx \mapsto A\bx$ for exactly one $m\times n$ matrix $A$: the one whose columns are $T(\be_1), \dots, T(\be_n)$.`,
        },
        {
          kind: 'callout',
          tone: 'intuition',
          md: md`In pictures: a linear map keeps the origin fixed, and grid lines stay straight, parallel and evenly spaced. They may be rotated, stretched, sheared, flipped or squashed flat, but never bent.`,
        },
        {
          kind: 'viz',
          viz: { type: 'la.transform2d', matrix: [[1, 1], [0, 1]], x: [1, 1], presets: true },
          task: md`Click through the presets and use **Animate from I** for each. Which presets squash the unit square to a segment? Which one flips the square over, so that $A\jhat$ ends up clockwise from $A\ihat$?`,
          caption: md`**projection** and **singular** collapse the plane onto a line: the columns are parallel. **reflection** reverses orientation. In every case the grid stays a grid of parallelograms, which is what linear means.`,
        },
        {
          kind: 'derive',
          title: 'every linear map is a matrix',
          goal: md`Let $T: \R^2 \to \R^2$ be linear. Show that $T(\bx) = A\bx$ where $A = [\,T(\ihat)\ \ T(\jhat)\,]$.`,
          steps: [
            { md: md`Write the input in the standard basis: $\bx = x_1\ihat + x_2\jhat$.` },
            {
              md: md`Apply $T$ and use linearity with $a = x_1$, $b = x_2$: $$T(\bx) = T(x_1\ihat + x_2\jhat) = x_1\,T(\ihat) + x_2\,T(\jhat).$$`,
              choose: {
                prompt: md`What lets you move $x_1$ and $x_2$ outside of $T$?`,
                options: [md`Linearity: $T(a\bu + b\bv) = aT(\bu) + bT(\bv)$`, md`$T$ is invertible`, md`$\ihat$ and $\jhat$ are orthogonal`],
                answer: 0,
                explain: md`Only linearity is used. Orthogonality of the basis plays no role, and $T$ need not be invertible.`,
              },
            },
            { md: md`The right side is a combination of the two vectors $T(\ihat)$ and $T(\jhat)$ with coefficients $x_1, x_2$. By the column view this is exactly $A\bx$ for the matrix with columns $T(\ihat)$ and $T(\jhat)$.` },
          ],
          takeaway: md`A linear map is completely determined by what it does to a basis. This is why "the columns are where the basis vectors land" is the fastest way to write down a matrix.`,
        },
        {
          kind: 'check',
          q: md`Which map $\R^2 \to \R^2$ is linear?`,
          options: [md`$(x, y) \mapsto (x + 1,\ y)$`, md`$(x, y) \mapsto (2x - y,\ 3y)$`, md`$(x, y) \mapsto (xy,\ y)$`, md`$(x, y) \mapsto (|x|,\ y)$`],
          answer: 1,
          explain: md`$(2x - y, 3y)$ is $A\bx$ with $A = \begin{bmatrix} 2 & -1 \\ 0 & 3 \end{bmatrix}$. The shift by 1 moves the origin ($T(\bzero) \neq \bzero$), and $xy$ and $|x|$ fail $T(c\bx) = cT(\bx)$, for example with $c = -1$ or $c = 2$.`,
        },
        {
          kind: 'paper',
          problem: {
            id: 'la02-1-paper',
            title: 'A matrix from two images',
            type: 'apply',
            difficulty: 2,
            minutes: 8,
            statement: md`A linear map $T: \R^2 \to \R^2$ satisfies $T(1, 1) = (3, 1)$ and $T(1, -1) = (1, -1)$. Find the matrix $A$ of $T$. The inputs given are **not** $\ihat$ and $\jhat$.`,
            hints: [md`Write $\ihat = \tfrac12(1, 1) + \tfrac12(1, -1)$ and $\jhat = \tfrac12(1, 1) - \tfrac12(1, -1)$, then use linearity.`],
            solution: [
              md`Express the standard basis in terms of the given inputs: $\ihat = \tfrac12\left[(1, 1) + (1, -1)\right]$ and $\jhat = \tfrac12\left[(1, 1) - (1, -1)\right]$.`,
              md`By linearity, $T(\ihat) = \tfrac12\left[(3, 1) + (1, -1)\right] = (2, 0)$.`,
              md`Likewise $T(\jhat) = \tfrac12\left[(3, 1) - (1, -1)\right] = (1, 1)$.`,
              md`The columns are these images: $A = \begin{bmatrix} 2 & 1 \\ 0 & 1 \end{bmatrix}$. Check: $A(1, 1) = (3, 1)$ and $A(1, -1) = (1, -1)$.`,
            ],
            answer: { kind: 'matrix', value: [[2, 1], [0, 1]] },
            rubric: [md`Writes $\ihat$ and $\jhat$ as combinations of the given inputs`, md`Applies linearity to get both columns`, md`Checks the result on the given data`],
          },
        },
        {
          kind: 'code',
          code: `import numpy as np

A = np.array([[1, 2, 0],
              [3, -1, 4]])
x = np.array([2, 1, -1])
print(A @ x)`,
          predict: {
            q: md`\`@\` is the matrix product. What is printed?`,
            options: ['`[4 1]`', '`[4, 1]`', '`[[4] [1]]`', '`[2 2 0]`'],
            answer: 0,
            explain: md`A $2\times 3$ matrix times a length-3 vector gives a length-2 vector, $(4, 1)$, as computed above. A 1-D NumPy array prints without commas.`,
          },
        },
        {
          kind: 'code',
          code: `import numpy as np

A = np.array([[1, 2, 0],
              [3, -1, 4]])
x = np.array([2, 1, -1])

col_view = x[0] * A[:, 0] + x[1] * A[:, 1] + x[2] * A[:, 2]
row_view = np.array([A[0] @ x, A[1] @ x])
print(col_view, row_view)
print(A.shape, x.shape, (A @ x).shape)`,
          note: md`\`A[:, j]\` is column $j$ and \`A[i]\` is row $i$. NumPy treats a 1-D array as a plain vector, neither row nor column, so its shape is \`(3,)\`.`,
        },
        {
          kind: 'recall',
          prompt: md`Without looking back: give the row view and the column view of $A\bx$, and say what the columns of a $2\times 2$ matrix mean geometrically.`,
          answer: md`Row view: $(A\bx)_i$ is row $i$ of $A$ dotted with $\bx$. Column view: $A\bx = x_1\ba_1 + \dots + x_n\ba_n$. The columns are the images $A\ihat$ and $A\jhat$ of the basis vectors.`,
        },
      ],
      cards: [
        { id: 'la02-1-c1', kind: 'concept', front: md`State the column view of $A\bx$.`, back: md`$A\bx = x_1\ba_1 + x_2\ba_2 + \dots + x_n\ba_n$: a combination of the columns of $A$ with the entries of $\bx$ as weights.` },
        { id: 'la02-1-c2', kind: 'cloze', text: md`An $m\times n$ matrix maps vectors of length {{}} to vectors of length $m$.`, answers: ['n'] },
        { id: 'la02-1-c3', kind: 'compute', front: md`Compute $\begin{bmatrix} 1 & 2 \\ 3 & 4 \end{bmatrix}\begin{bmatrix} 1 \\ -1 \end{bmatrix}$.`, answer: { kind: 'vector', value: [-1, -1] }, back: md`$(1 - 2,\ 3 - 4) = (-1, -1)$.` },
        { id: 'la02-1-c4', kind: 'concept', front: md`What are the columns of the matrix of a linear map $T$?`, back: md`The images of the standard basis vectors: column $j$ is $T(\be_j)$.` },
        { id: 'la02-1-c5', kind: 'concept', front: md`Give the defining property of a linear map, and one quick test that rules out linearity.`, back: md`$T(a\bu + b\bv) = aT(\bu) + bT(\bv)$. Quick test: a linear map has $T(\bzero) = \bzero$, so any shift rules it out.` },
      ],
    },
    // ------------------------------------------------------------------ 2.2
    {
      id: 'la02-2',
      title: 'Matrix multiplication as composition',
      minutes: 40,
      objectives: [
        'Decide whether a product AB is defined and state its shape.',
        'Compute AB by entries, by columns, by rows, and as a sum of outer products.',
        'Explain AB as "apply B, then A", and give an example with AB ≠ BA.',
        'Use associativity and (AB)ᵀ = BᵀAᵀ, and choose the cheaper order for a chain of products.',
      ],
      cells: [
        {
          kind: 'text',
          md: md`Two linear layers without an activation between them compute $\bh = W_1\bx$ and then $\by = W_2\bh$. The result $\by = W_2(W_1\bx)$ is again a linear function of $\bx$, so it has a matrix of its own. That matrix is the **product** $W_2W_1$. Matrix multiplication is defined so that multiplying matrices means composing the maps they represent.`,
        },
        {
          kind: 'callout',
          tone: 'definition',
          title: 'Matrix product',
          md: md`If $A$ is $m\times n$ and $B$ is $n\times p$, then $AB$ is the $m\times p$ matrix with entries $$(AB)_{ij} = \sum_{k=1}^n a_{ik}b_{kj}.$$ The inner sizes must agree: $(m\times \underline{n})(\underline{n}\times p) = m\times p$. Computing $AB$ takes $mnp$ multiplications.`,
        },
        {
          kind: 'viz',
          viz: { type: 'la.matmul', A: [[1, 2, 0], [-1, 1, 3]], B: [[2, 1], [0, -1], [1, 4]], view: 'entry' },
          task: md`Step through all four views. In the **entries** view, say each number before you step. In **outer products**, watch the product build up as a sum of three rank-one matrices.`,
          caption: md`Four ways to organise the same $2\cdot 3\cdot 2 = 12$ multiplications. They give the same $C = \begin{bmatrix} 2 & -1 \\ 1 & 10 \end{bmatrix}$.`,
        },
        {
          kind: 'callout',
          tone: 'theorem',
          title: 'Four views of AB',
          md: md`Write $\ba_k$ for the columns of $A$, $\bb_j$ for the columns of $B$, $\boldsymbol{\alpha}_i\T$ for the rows of $A$ and $\boldsymbol{\beta}_k\T$ for the rows of $B$.

1. **Entries:** $(AB)_{ij} = \boldsymbol{\alpha}_i\T\bb_j$, row $i$ of $A$ dotted with column $j$ of $B$.
2. **Columns:** $AB = [\,A\bb_1\ \ A\bb_2\ \cdots\ A\bb_p\,]$. Each column of $AB$ is a combination of the columns of $A$.
3. **Rows:** row $i$ of $AB$ is $\boldsymbol{\alpha}_i\T B$, a combination of the rows of $B$.
4. **Outer products:** $AB = \sum_{k=1}^n \ba_k\boldsymbol{\beta}_k\T$, a sum of $n$ matrices of rank one.`,
        },
        {
          kind: 'numeric',
          q: md`Compute $\begin{bmatrix} 1 & 2 \\ 3 & 4 \end{bmatrix}\begin{bmatrix} 0 & 1 \\ 1 & 0 \end{bmatrix}$. Use the column view.`,
          answer: { kind: 'matrix', value: [[2, 1], [4, 3]] },
          explain: md`Column 1 of the product is $A(0, 1) = $ column 2 of $A$, and column 2 is $A(1, 0) = $ column 1 of $A$. Multiplying by this matrix **on the right** swaps the columns of $A$.`,
        },
        {
          kind: 'check',
          q: md`$A$ is $3\times 4$ and $B$ is $4\times 2$. Which statement is true?`,
          options: [md`$AB$ is $3\times 2$ and $BA$ is undefined`, md`$AB$ is $3\times 2$ and $BA$ is $4\times 4$`, md`$AB$ is $4\times 4$`, md`Both products are undefined`],
          answer: 0,
          explain: md`$(3\times 4)(4\times 2)$: inner sizes 4 and 4 match, result $3\times 2$. $(4\times 2)(3\times 4)$: inner sizes 2 and 3 differ, so $BA$ is not defined.`,
        },
        {
          kind: 'callout',
          tone: 'theorem',
          title: 'Product = composition',
          md: md`For every $\bx$, $A(B\bx) = (AB)\bx$. So $AB$ is the map "apply $B$ first, then $A$". The factor on the **right** acts first, the same as for functions: $(f\circ g)(x) = f(g(x))$.`,
        },
        {
          kind: 'viz',
          viz: { type: 'la.compose', a: 'rot90', b: 'shear' },
          task: md`With $A$ = rotate 90° and $B$ = shear, press **Play both stages** for $AB$, then for $BA$. Where does the F end up each time? Then find two **different** matrices in the menus that commute.`,
          caption: md`Shearing then rotating is not the same as rotating then shearing, so $AB \ne BA$. Two diagonal matrices (stretch, reflect in the x-axis, project onto the x-axis) always commute, because each acts on the two axes separately.`,
        },
        {
          kind: 'derive',
          title: 'the entry formula from composition',
          goal: md`Show that the matrix of $\bx \mapsto A(B\bx)$ has entries $\sum_k a_{ik}b_{kj}$.`,
          steps: [
            { md: md`The matrix of a linear map has the images of the basis vectors as its columns. So column $j$ of the composite is $A(B\be_j)$.` },
            {
              md: md`$B\be_j = \bb_j$, the $j$-th column of $B$. Column $j$ of the composite is therefore $A\bb_j$.`,
              choose: {
                prompt: md`What is $B\be_j$?`,
                options: [md`Column $j$ of $B$`, md`Row $j$ of $B$`, md`The entry $b_{jj}$`],
                answer: 0,
                explain: md`Column view of $B\be_j$: the only nonzero weight is a 1 on column $j$.`,
              },
            },
            { md: md`By the row view, entry $i$ of $A\bb_j$ is row $i$ of $A$ dotted with $\bb_j$: $\sum_k a_{ik}b_{kj}$. This is the definition of $(AB)_{ij}$.` },
          ],
          takeaway: md`The definition of the product is forced: it is the only rule that makes $(AB)\bx = A(B\bx)$ true for every $\bx$.`,
        },
        {
          kind: 'numeric',
          q: md`Let $A = \begin{bmatrix} 1 & 1 \\ 0 & 1 \end{bmatrix}$ and $B = \begin{bmatrix} 1 & 0 \\ 1 & 1 \end{bmatrix}$. Compute $AB$.`,
          answer: { kind: 'matrix', value: [[2, 1], [1, 1]] },
          explain: md`$AB = \begin{bmatrix} 1+1 & 0+1 \\ 0+1 & 0+1 \end{bmatrix} = \begin{bmatrix} 2 & 1 \\ 1 & 1 \end{bmatrix}$, while $BA = \begin{bmatrix} 1 & 1 \\ 1 & 2 \end{bmatrix}$. Different, so these two shears do not commute.`,
        },
        {
          kind: 'callout',
          tone: 'theorem',
          title: 'Rules of matrix algebra',
          md: md`Whenever the shapes allow:

- associative: $(AB)C = A(BC)$
- distributive: $A(B + C) = AB + AC$ and $(A + B)C = AC + BC$
- identity: $I_mA = A = AI_n$
- transpose of a product: $(AB)\T = B\T A\T$
- **not** commutative: in general $AB \neq BA$, even when both are defined`,
        },
        {
          kind: 'derive',
          title: 'transpose of a product',
          goal: md`Prove $(AB)\T = B\T A\T$ for $A$ of size $m\times n$ and $B$ of size $n\times p$.`,
          steps: [
            { md: md`Shapes first: $(AB)\T$ is $p\times m$, and $B\T A\T$ is $(p\times n)(n\times m) = p\times m$. The order $A\T B\T$ would not even be defined unless $p = m$.` },
            {
              md: md`Entry $(i, j)$ of $(AB)\T$ is entry $(j, i)$ of $AB$: $$\left[(AB)\T\right]_{ij} = (AB)_{ji} = \sum_k a_{jk}b_{ki}.$$`,
              choose: {
                prompt: md`What is entry $(i, j)$ of a transpose $M\T$?`,
                options: [md`$m_{ji}$`, md`$m_{ij}$`, md`$1 / m_{ij}$`],
                answer: 0,
                explain: md`Transposing swaps the roles of rows and columns.`,
              },
            },
            { md: md`Entry $(i, j)$ of $B\T A\T$ is $\sum_k (B\T)_{ik}(A\T)_{kj} = \sum_k b_{ki}a_{jk}$.` },
            { md: md`The two sums have the same terms ($b_{ki}a_{jk} = a_{jk}b_{ki}$), so the matrices are equal.` },
          ],
          takeaway: md`Transposing reverses the order, like taking off socks and shoes. The same pattern holds for inverses: $(AB)^{-1} = B^{-1}A^{-1}$ (Module 3).`,
        },
        {
          kind: 'paper',
          problem: {
            id: 'la02-2-paper',
            title: 'Where to put the parentheses',
            type: 'apply',
            difficulty: 2,
            minutes: 8,
            statement: md`$A$ and $B$ are $1000\times 1000$ matrices and $\bx \in \R^{1000}$. Count the scalar multiplications needed to compute $(AB)\bx$ and $A(B\bx)$. How many times more does the first order need? Enter the ratio.`,
            hints: [md`An $m\times n$ times $n\times p$ product needs $mnp$ multiplications. A matrix–vector product is the case $p = 1$.`],
            solution: [
              md`$(AB)\bx$: forming $AB$ costs $1000^3 = 10^9$ multiplications; then $(AB)\bx$ costs $1000^2 = 10^6$. Total $1.001\times 10^9$.`,
              md`$A(B\bx)$: $B\bx$ costs $10^6$ and $A(B\bx)$ another $10^6$. Total $2\times 10^6$.`,
              md`Ratio: $1.001\times 10^9 / (2\times 10^6) = 500.5$. Associativity guarantees the same answer, so always multiply the vector in first.`,
            ],
            answer: { kind: 'number', value: 500.5, tol: 0.01 },
          },
        },
        {
          kind: 'code',
          code: `import numpy as np

A = np.array([[1, 1], [0, 1]])
B = np.array([[1, 0], [1, 1]])
print(A @ B)
print(B @ A)
print(np.array_equal((A @ B).T, B.T @ A.T))`,
          note: md`\`A * B\` would multiply entry by entry (the Hadamard product). Use \`@\` for the matrix product.`,
        },
        {
          kind: 'code',
          code: `import numpy as np

print((np.ones((2, 3)) @ np.ones((3, 4))).shape)`,
          predict: {
            q: md`What does this print?`,
            options: ['`(2, 4)`', '`(3, 3)`', '`(2, 3, 4)`', '`(4, 2)`'],
            answer: 0,
            explain: md`$(2\times 3)(3\times 4) = 2\times 4$. The shared inner size disappears.`,
          },
        },
        {
          kind: 'exercise',
          ex: {
            id: 'la02-2-ex',
            title: 'A product as a sum of outer products',
            prompt: md`Write \`matmul_outer(A, B)\` that returns $AB$ computed as $\sum_k \ba_k\boldsymbol{\beta}_k\T$: column $k$ of \`A\` times row $k$ of \`B\`, using \`np.outer\`. Do not use \`@\`.`,
            starter: `import numpy as np

def matmul_outer(A, B):
    C = np.zeros((A.shape[0], B.shape[1]))
    # add one outer product for each k
    return C
`,
            solution: `import numpy as np

def matmul_outer(A, B):
    C = np.zeros((A.shape[0], B.shape[1]))
    for k in range(A.shape[1]):
        C += np.outer(A[:, k], B[k, :])
    return C
`,
            tests: [
              { expr: 'matmul_outer(np.array([[1, 2, 0], [-1, 1, 3]]), np.array([[2, 1], [0, -1], [1, 4]])).tolist()', label: 'the 2×3 times 3×2 example' },
              { expr: 'matmul_outer(np.array([[1, 2], [3, 4]]), np.array([[0, 1], [1, 0]])).tolist()', label: 'column swap' },
              { expr: 'matmul_outer(np.ones((3, 1)), np.array([[1, 2, 3]])).shape', label: 'a single outer product has shape 3×3' },
            ],
            hints: [md`\`A[:, k]\` is column $k$ of \`A\` and \`B[k, :]\` is row $k$ of \`B\`.`, md`\`np.outer(u, v)\` is the matrix with entries $u_iv_j$. Loop \`for k in range(A.shape[1])\` and add.`],
            mustInclude: ['np.outer'],
            mustExclude: ['@'],
          },
        },
        {
          kind: 'explain',
          prompt: md`Why does stacking two linear layers without an activation between them add no expressive power? What does change?`,
          model: md`The composite map is $\bx \mapsto W_2(W_1\bx + \bb_1) + \bb_2 = (W_2W_1)\bx + (W_2\bb_1 + \bb_2)$, which is again a single affine map with weight $W_2W_1$. Anything the two-layer network computes, one layer can compute. The parameter count and the optimization landscape change, and if the hidden width is smaller than the input and output, $W_2W_1$ is forced to have low rank. A nonlinearity between the layers is what makes depth useful.`,
        },
      ],
      cards: [
        { id: 'la02-2-c1', kind: 'concept', front: md`Shape rule for $AB$, and the cost in multiplications.`, back: md`$(m\times n)(n\times p) = m\times p$; inner sizes must match. It takes $mnp$ multiplications.` },
        { id: 'la02-2-c2', kind: 'cloze', text: md`In the product $AB$, the map {{}} is applied first.`, answers: ['B'] },
        { id: 'la02-2-c3', kind: 'compute', front: md`Compute $\begin{bmatrix} 2 & 0 \\ 1 & 3 \end{bmatrix}\begin{bmatrix} 1 & -1 \\ 2 & 0 \end{bmatrix}$.`, answer: { kind: 'matrix', value: [[2, -2], [7, -1]] }, back: md`Row 1: $(2, -2)$. Row 2: $(1 + 6,\ -1 + 0) = (7, -1)$.` },
        { id: 'la02-2-c4', kind: 'concept', front: md`State the four views of $AB$.`, back: md`Entries: row $i$ of $A$ dot column $j$ of $B$. Columns: $A$ times each column of $B$. Rows: each row of $A$ times $B$. Outer products: $\sum_k (\text{column } k \text{ of } A)(\text{row } k \text{ of } B)$.` },
        { id: 'la02-2-c5', kind: 'cloze', text: md`$(AB)\T$ is the product of the transposes taken in the {{}} order: $B\T A\T$.`, answers: ['reverse'] },
      ],
    },
    // ------------------------------------------------------------------ 2.3
    {
      id: 'la02-3',
      title: 'Special matrices, and the linear layer',
      minutes: 35,
      objectives: [
        'Recognize identity, diagonal, rotation, reflection, shear, projection, permutation and symmetric matrices, and describe what each does to the plane.',
        'Check whether a matrix is orthogonal with QᵀQ = I, and use Q⁻¹ = Qᵀ.',
        'Write down the inverse of a rotation, reflection, shear or diagonal matrix by undoing the map, and explain why a projection has none.',
        'State every shape in a batched linear layer Y = XWᵀ + b and count its parameters.',
      ],
      cells: [
        {
          kind: 'text',
          md: md`A few kinds of matrix appear so often that you should recognize them on sight. In 2-D:

| name | matrix | what it does | inverse |
|---|---|---|---|
| identity | $I = \begin{bmatrix} 1 & 0 \\ 0 & 1 \end{bmatrix}$ | nothing | $I$ |
| diagonal | $\begin{bmatrix} d_1 & 0 \\ 0 & d_2 \end{bmatrix}$ | scales axis $i$ by $d_i$ | $\diag(1/d_1, 1/d_2)$ if no $d_i = 0$ |
| rotation | $\begin{bmatrix} \cos\theta & -\sin\theta \\ \sin\theta & \cos\theta \end{bmatrix}$ | turns by $\theta$ | rotation by $-\theta$ |
| reflection | $\begin{bmatrix} \cos 2\varphi & \sin 2\varphi \\ \sin 2\varphi & -\cos 2\varphi \end{bmatrix}$ | mirrors in the line at angle $\varphi$ | itself |
| shear | $\begin{bmatrix} 1 & k \\ 0 & 1 \end{bmatrix}$ | slides each point sideways by $k$ times its height | shear by $-k$ |
| projection | $\bu\bu\T$, $\lVert\bu\rVert = 1$ | drops each point onto the line of $\bu$ | none |
| permutation | rows of $I$ reordered | reorders the coordinates | its transpose |`,
        },
        {
          kind: 'viz',
          viz: { type: 'la.special', family: 'rotation' },
          task: md`Go through every family in the menu, move its slider, and switch on **then apply A⁻¹**. Which family can never be undone? For which families does the readout say "orthogonal: yes"?`,
          caption: md`Rotations, reflections and the permutation are orthogonal: they keep lengths and angles, so the F keeps its shape. A projection sends a whole perpendicular line of points to one point, so no inverse can recover the input.`,
        },
        {
          kind: 'callout',
          tone: 'definition',
          title: 'Symmetric and orthogonal matrices',
          md: md`A square matrix is **symmetric** if $A\T = A$ (mirror image across the diagonal). A square matrix $Q$ is **orthogonal** if $Q\T Q = I$: its columns are unit vectors, mutually perpendicular. Then $Q^{-1} = Q\T$, and $Q$ preserves lengths and angles: $(Q\bx)\cdot(Q\by) = \bx\T Q\T Q\by = \bx\cdot\by$.`,
        },
        {
          kind: 'callout',
          tone: 'definition',
          title: 'Inverse',
          md: md`A square matrix $A$ is **invertible** if there is a matrix $A^{-1}$ with $A^{-1}A = AA^{-1} = I$. Then $A^{-1}$ undoes $A$: $A^{-1}(A\bx) = \bx$. A matrix that sends two different inputs to the same output cannot be invertible. Module 3 shows how to compute $A^{-1}$ and when it exists.`,
        },
        {
          kind: 'check',
          q: md`What is the inverse of the rotation $R_\theta$?`,
          options: [md`$R_{-\theta}$, which equals $R_\theta\T$`, md`$-R_\theta$`, md`$R_\theta$ itself`, md`It has none when $\theta = 90^\circ$`],
          answer: 0,
          explain: md`Undo a turn by $\theta$ by turning by $-\theta$. Since $\cos(-\theta) = \cos\theta$ and $\sin(-\theta) = -\sin\theta$, $R_{-\theta}$ is $R_\theta$ with the off-diagonal entries swapped, which is $R_\theta\T$. That is what orthogonal means.`,
        },
        {
          kind: 'numeric',
          q: md`Find the inverse of the shear $S = \begin{bmatrix} 1 & 3 \\ 0 & 1 \end{bmatrix}$.`,
          answer: { kind: 'matrix', value: [[1, -3], [0, 1]] },
          explain: md`$S$ moves $(x, y)$ to $(x + 3y, y)$. To undo it, move back by $3y$: $\begin{bmatrix} 1 & -3 \\ 0 & 1 \end{bmatrix}$. Check: $\begin{bmatrix} 1 & -3 \\ 0 & 1 \end{bmatrix}\begin{bmatrix} 1 & 3 \\ 0 & 1 \end{bmatrix} = I$.`,
        },
        {
          kind: 'derive',
          title: 'a projection is idempotent and has no inverse',
          goal: md`Let $\bu \in \R^2$ be a unit vector and $P = \bu\bu\T$. Show that $P\bx$ is the projection of $\bx$ onto the line of $\bu$, that $P^2 = P$, and that $P$ is not invertible.`,
          steps: [
            { md: md`$P\bx = \bu(\bu\T\bx) = (\bu\cdot\bx)\,\bu$. With $\bu\cdot\bu = 1$ this is the projection formula of Module 1: $\frac{\bu\cdot\bx}{\bu\cdot\bu}\bu$.` },
            {
              md: md`$P^2 = \bu(\bu\T\bu)\bu\T = \bu\,(1)\,\bu\T = P$. Projecting twice is the same as projecting once.`,
              choose: {
                prompt: md`How do you simplify $\bu\bu\T\bu\bu\T$?`,
                options: [md`Regroup as $\bu(\bu\T\bu)\bu\T$ using associativity; the middle is the scalar $\lVert\bu\rVert^2 = 1$`, md`Swap the middle factors: $\bu\T\bu = \bu\bu\T$`, md`It equals $\bu\T\bu\,\bu\T\bu$`],
                answer: 0,
                explain: md`Associativity lets you multiply the middle pair first. $\bu\T\bu$ is $1\times 1$, a number; $\bu\bu\T$ is a $2\times 2$ matrix, so they are not interchangeable.`,
              },
            },
            { md: md`Suppose $P^{-1}$ existed. Multiply $P^2 = P$ on the left by $P^{-1}$: $P = I$. But $P\bv = \bzero$ for any $\bv \perp \bu$, while $I\bv = \bv \neq \bzero$. Contradiction, so $P$ has no inverse.` },
          ],
          takeaway: md`$P^2 = P$ characterizes projections. In ML the same algebra appears in least squares, where the fitted values are a projection of the targets, and in PCA.`,
        },
        {
          kind: 'text',
          md: md`**The linear layer.** A linear (fully connected) layer with $d_{in}$ inputs and $d_{out}$ outputs stores a weight matrix $W$ of shape $d_{out}\times d_{in}$ and a bias $\bb \in \R^{d_{out}}$, and computes $\by = W\bx + \bb$. PyTorch's \`nn.Linear\` stores \`weight\` with exactly this shape, \`(out_features, in_features)\`.

In practice you process a **batch** of $B$ inputs at once, stored as the rows of $X$ ($B\times d_{in}$). Transposing $\by_i = W\bx_i + \bb$ gives $\by_i\T = \bx_i\T W\T + \bb\T$, and stacking the $B$ rows gives $$\underbrace{Y}_{B\times d_{out}} = \underbrace{X}_{B\times d_{in}}\ \underbrace{W\T}_{d_{in}\times d_{out}} + \underbrace{\bb\T}_{\text{added to every row}}.$$ Adding a length-$d_{out}$ vector to a $B\times d_{out}$ matrix is **broadcasting**: NumPy and PyTorch add $\bb$ to each row.`,
        },
        {
          kind: 'viz',
          viz: { type: 'la.linearlayer', batch: 3, din: 3, dout: 2 },
          task: md`Click each entry of $Y$ and check the highlighted row and column. Then change the sliders and say the shape of every matrix before you look at the labels.`,
          caption: md`Only $W$ and $\bb$ are parameters; $X$ is data. The batch size changes the number of rows of $X$ and $Y$ and nothing else.`,
        },
        {
          kind: 'numeric',
          q: md`How many parameters does a linear layer with $d_{in} = 768$ and $d_{out} = 3072$ (with bias) have?`,
          answer: { kind: 'number', value: 2362368 },
          explain: md`$768 \cdot 3072 = 2{,}359{,}296$ weights plus $3072$ biases: $2{,}362{,}368$.`,
        },
        {
          kind: 'check',
          q: md`$X$ has shape $32\times 768$ and $W$ has shape $3072\times 768$. What is the shape of $XW\T$, and why not $XW$?`,
          options: [md`$32\times 3072$; $XW$ is undefined because $768 \neq 3072$`, md`$32\times 768$; $XW$ would be $3072\times 3072$`, md`$3072\times 32$; the batch always comes last`, md`$768\times 768$; it is a covariance`],
          answer: 0,
          explain: md`$(32\times 768)(768\times 3072) = 32\times 3072$: one 3072-dimensional output per example. $XW$ would need the 768 columns of $X$ to match the 3072 rows of $W$.`,
        },
        {
          kind: 'code',
          code: `import numpy as np

np.random.seed(0)
X = np.random.randn(4, 3)        # batch of 4 examples, 3 features
W = np.random.randn(2, 3)        # 2 outputs, 3 inputs
b = np.array([0.5, -1.0])
Y = X @ W.T + b                  # b is broadcast to every row
print(Y.shape)`,
          predict: {
            q: md`What is printed?`,
            options: ['`(4, 2)`', '`(2, 4)`', '`(4, 3)`', '`(2, 3)`'],
            answer: 0,
            explain: md`$(4\times 3)(3\times 2) = 4\times 2$, and adding $\bb$ of shape \`(2,)\` broadcasts across the 4 rows.`,
          },
        },
        {
          kind: 'exercise',
          ex: {
            id: 'la02-3-ex',
            title: 'Fix the shapes of a linear layer',
            prompt: md`\`X\` has shape \`(B, d_in)\`, \`W\` has shape \`(d_out, d_in)\` and \`b\` has shape \`(d_out,)\`. Fix \`linear\` so that it returns the \`(B, d_out)\` outputs $XW\T + \bb$, without a loop. Then make \`n_params\` return the number of learnable numbers in \`W\` and \`b\`.`,
            starter: `import numpy as np

def linear(X, W, b):
    return W @ X + b

def n_params(W, b):
    return 0
`,
            solution: `import numpy as np

def linear(X, W, b):
    return X @ W.T + b

def n_params(W, b):
    return W.size + b.size
`,
            tests: [
              { expr: 'linear(np.ones((4, 3)), np.ones((2, 3)), np.zeros(2)).shape', label: 'output shape (B, d_out)' },
              { expr: 'np.round(linear(np.array([[1., 2., 0.], [0., -1., 3.]]), np.array([[1., 0., 2.], [-1., 1., 1.]]), np.array([0.5, -1.0])), 4).tolist()', label: 'values' },
              { expr: 'n_params(np.zeros((3072, 768)), np.zeros(3072))', label: 'parameter count' },
            ],
            hints: [md`Write the shapes under each factor: you need \`(B, d_in) @ (d_in, d_out)\`.`, md`\`W.T\` has shape \`(d_in, d_out)\`. \`W.size\` is the number of entries of \`W\`.`],
            mustExclude: ['for '],
          },
        },
        {
          kind: 'paper',
          problem: {
            id: 'la02-3-paper',
            title: 'Shapes in an MLP block',
            type: 'code-on-paper',
            difficulty: 1,
            minutes: 6,
            statement: md`A transformer MLP block maps $d = 512$ features to a hidden width of $2048$ and back to $512$, with biases: $\bh = \relu(W_1\bx + \bb_1)$, $\by = W_2\bh + \bb_2$.

(a) Give the shapes of $W_1, \bb_1, W_2, \bb_2$ in the $(d_{out}, d_{in})$ convention. (b) For a batch $X$ of shape $64\times 512$, give the shape of the hidden activations. (c) Count the parameters and enter the total.`,
            solution: [
              md`(a) $W_1$: $2048\times 512$, $\bb_1$: $2048$, $W_2$: $512\times 2048$, $\bb_2$: $512$.`,
              md`(b) $H = \relu(XW_1\T + \bb_1)$ has shape $(64\times 512)(512\times 2048) = 64\times 2048$.`,
              md`(c) $512\cdot 2048 + 2048 + 2048\cdot 512 + 512 = 1{,}048{,}576 + 2048 + 1{,}048{,}576 + 512 = 2{,}099{,}712$.`,
            ],
            answer: { kind: 'number', value: 2099712 },
          },
        },
        {
          kind: 'recall',
          prompt: md`From memory: which special $2\times 2$ matrices are orthogonal, which are symmetric, and which have no inverse? What are the shapes in $Y = XW\T + \bb$?`,
          answer: md`Orthogonal: rotations, reflections, permutations ($Q\T Q = I$). Symmetric: identity, diagonal, reflections, projections, the swap permutation. No inverse: projections (and any matrix with parallel columns). $X$: $B\times d_{in}$, $W$: $d_{out}\times d_{in}$, $\bb$: $d_{out}$, $Y$: $B\times d_{out}$.`,
        },
      ],
      cards: [
        { id: 'la02-3-c1', kind: 'concept', front: md`Define an orthogonal matrix and give its inverse.`, back: md`$Q\T Q = I$: orthonormal columns. $Q^{-1} = Q\T$. It preserves lengths and angles.` },
        { id: 'la02-3-c2', kind: 'compute', front: md`Inverse of $\begin{bmatrix} 2 & 0 \\ 0 & -4 \end{bmatrix}$?`, answer: { kind: 'matrix', value: [[0.5, 0], [0, -0.25]] }, back: md`Invert each diagonal entry: $\diag(1/2, -1/4)$.` },
        { id: 'la02-3-c3', kind: 'cloze', text: md`A projection matrix satisfies $P^2 = $ {{}}.`, answers: ['P'] },
        { id: 'la02-3-c4', kind: 'concept', front: md`Shapes in a batched linear layer $Y = XW\T + \bb$.`, back: md`$X$: $B\times d_{in}$, $W$: $d_{out}\times d_{in}$, $\bb$: $d_{out}$ (broadcast to each row), $Y$: $B\times d_{out}$.` },
        { id: 'la02-3-c5', kind: 'compute', front: md`Parameters of a linear layer $256 \to 10$ with bias?`, answer: { kind: 'number', value: 2570 }, back: md`$256\cdot 10 + 10 = 2570$.` },
      ],
    },
  ],
  problems: [
    {
      id: 'la02-p1',
      title: 'A product by columns',
      type: 'compute',
      difficulty: 1,
      minutes: 4,
      statement: md`Compute $\begin{bmatrix} 1 & 0 & 2 \\ -1 & 3 & 1 \\ 2 & 1 & 0 \end{bmatrix}\begin{bmatrix} 1 \\ 2 \\ -1 \end{bmatrix}$ using the column view.`,
      solution: [
        md`$A\bx = 1\cdot(1, -1, 2) + 2\cdot(0, 3, 1) + (-1)\cdot(2, 1, 0)$.`,
        md`$= (1 + 0 - 2,\ -1 + 6 - 1,\ 2 + 2 - 0) = (-1, 4, 4)$.`,
      ],
      answer: { kind: 'vector', value: [-1, 4, 4] },
    },
    {
      id: 'la02-p2',
      title: 'A rectangular product',
      type: 'compute',
      difficulty: 1,
      minutes: 5,
      statement: md`Compute $\begin{bmatrix} 1 & -1 & 2 \\ 0 & 3 & 1 \end{bmatrix}\begin{bmatrix} 2 & 1 \\ 1 & 0 \\ -1 & 4 \end{bmatrix}$ and state its shape.`,
      solution: [
        md`Shape: $(2\times 3)(3\times 2) = 2\times 2$.`,
        md`Row 1: $(2 - 1 - 2,\ 1 + 0 + 8) = (-1, 9)$.`,
        md`Row 2: $(0 + 3 - 1,\ 0 + 0 + 4) = (2, 4)$.`,
      ],
      answer: { kind: 'matrix', value: [[-1, 9], [2, 4]] },
    },
    {
      id: 'la02-p3',
      title: 'Rotate, then reflect',
      type: 'apply',
      difficulty: 2,
      minutes: 8,
      statement: md`Let $R$ rotate the plane by $90^\circ$ counterclockwise and $H$ reflect it in the x-axis. Find the matrix of "rotate, then reflect". Then find the matrix of "reflect, then rotate", and describe both maps in words. Enter the first matrix.`,
      hints: [md`"Rotate, then reflect" applies $R$ first, so its matrix is $HR$.`],
      solution: [
        md`$R = \begin{bmatrix} 0 & -1 \\ 1 & 0 \end{bmatrix}$ (columns: $\ihat \mapsto \jhat$, $\jhat \mapsto -\ihat$) and $H = \begin{bmatrix} 1 & 0 \\ 0 & -1 \end{bmatrix}$.`,
        md`Rotate first, then reflect: $HR = \begin{bmatrix} 0 & -1 \\ -1 & 0 \end{bmatrix}$. It swaps the coordinates and negates both: the reflection in the line $y = -x$.`,
        md`Reflect first, then rotate: $RH = \begin{bmatrix} 0 & 1 \\ 1 & 0 \end{bmatrix}$, the reflection in the line $y = x$.`,
        md`The two orders give different maps, another instance of $AB \neq BA$.`,
      ],
      answer: { kind: 'matrix', value: [[0, -1], [-1, 0]] },
    },
    {
      id: 'la02-p4',
      title: 'Products of orthogonal matrices',
      type: 'proof',
      difficulty: 2,
      minutes: 8,
      statement: md`Prove that if $Q_1$ and $Q_2$ are orthogonal $n\times n$ matrices, then $Q_1Q_2$ is orthogonal and $Q_1\T$ is orthogonal. Give a geometric reason why the first statement should be true.`,
      hints: [md`Use $(AB)\T = B\T A\T$ and associativity.`],
      solution: [
        md`We need $(Q_1Q_2)\T(Q_1Q_2) = I$. By the transpose rule, $(Q_1Q_2)\T = Q_2\T Q_1\T$.`,
        md`By associativity, $Q_2\T Q_1\T Q_1Q_2 = Q_2\T (Q_1\T Q_1) Q_2 = Q_2\T I Q_2 = Q_2\T Q_2 = I$.`,
        md`For $Q_1\T$: $Q_1\T Q_1 = I$ means $Q_1\T = Q_1^{-1}$, so also $Q_1 Q_1\T = I$. Then $(Q_1\T)\T Q_1\T = Q_1Q_1\T = I$.`,
        md`Geometrically, orthogonal matrices are the linear maps that preserve lengths and angles. Doing two such maps in a row also preserves lengths and angles.`,
      ],
      rubric: [md`Applies $(AB)\T = B\T A\T$ correctly`, md`Regroups with associativity and uses $Q\T Q = I$ twice`, md`Handles $Q_1\T$ using $Q_1^{-1} = Q_1\T$`, md`Geometric explanation`],
    },
    {
      id: 'la02-p5',
      title: 'Angle addition from rotation matrices',
      type: 'derive',
      difficulty: 2,
      minutes: 10,
      statement: md`Show that $R_\alpha R_\beta = R_{\alpha + \beta}$ by a geometric argument, then multiply out the matrices to derive the formulas for $\cos(\alpha + \beta)$ and $\sin(\alpha + \beta)$. Conclude that rotations of the plane commute.`,
      solution: [
        md`Geometrically, turning by $\beta$ and then by $\alpha$ is a turn by $\alpha + \beta$, so the two linear maps agree and their matrices are equal.`,
        md`Multiply: $R_\alpha R_\beta = \begin{bmatrix} \cos\alpha\cos\beta - \sin\alpha\sin\beta & -\cos\alpha\sin\beta - \sin\alpha\cos\beta \\ \sin\alpha\cos\beta + \cos\alpha\sin\beta & -\sin\alpha\sin\beta + \cos\alpha\cos\beta \end{bmatrix}$.`,
        md`Compare with $R_{\alpha+\beta} = \begin{bmatrix} \cos(\alpha+\beta) & -\sin(\alpha+\beta) \\ \sin(\alpha+\beta) & \cos(\alpha+\beta) \end{bmatrix}$ entry by entry: $\cos(\alpha+\beta) = \cos\alpha\cos\beta - \sin\alpha\sin\beta$ and $\sin(\alpha+\beta) = \sin\alpha\cos\beta + \cos\alpha\sin\beta$.`,
        md`Since $\alpha + \beta = \beta + \alpha$, $R_\alpha R_\beta = R_{\alpha+\beta} = R_\beta R_\alpha$: 2-D rotations commute. (Rotations in 3-D generally do not.)`,
      ],
      rubric: [md`Geometric justification of $R_\alpha R_\beta = R_{\alpha+\beta}$`, md`Correct product of the two matrices`, md`Both addition formulas read off`, md`Commutativity concluded`],
    },
    {
      id: 'la02-p6',
      title: 'Cheapest order for a chain',
      type: 'apply',
      difficulty: 2,
      minutes: 6,
      statement: md`$A$ is $10\times 100$, $B$ is $100\times 5$ and $C$ is $5\times 50$. Count the multiplications for $(AB)C$ and for $A(BC)$. Enter the smaller count.`,
      hints: [md`$(m\times n)(n\times p)$ costs $mnp$.`],
      solution: [
        md`$(AB)C$: $AB$ costs $10\cdot 100\cdot 5 = 5000$ and gives a $10\times 5$ matrix; times $C$ costs $10\cdot 5\cdot 50 = 2500$. Total $7500$.`,
        md`$A(BC)$: $BC$ costs $100\cdot 5\cdot 50 = 25{,}000$ and gives $100\times 50$; then $A$ times this costs $10\cdot 100\cdot 50 = 50{,}000$. Total $75{,}000$.`,
        md`The results are equal by associativity, but $(AB)C$ is ten times cheaper. Choosing the order is the matrix-chain problem; \`np.linalg.multi_dot\` does it for you.`,
      ],
      answer: { kind: 'number', value: 7500 },
    },
    {
      id: 'la02-p7',
      title: 'Cost of attention scores',
      type: 'apply',
      difficulty: 2,
      minutes: 6,
      statement: md`A sequence of $T = 128$ tokens has queries $Q$ and keys $K$, both of shape $T\times d_k$ with $d_k = 64$. (a) What is the shape of the score matrix $QK\T$? (b) How many multiplications does computing it take? Enter (b). (c) How does the cost grow if $T$ doubles?`,
      solution: [
        md`(a) $(T\times d_k)(d_k\times T) = T\times T = 128\times 128$: one score for each query–key pair.`,
        md`(b) $T\cdot d_k\cdot T = 128\cdot 64\cdot 128 = 1{,}048{,}576$ multiplications.`,
        md`(c) The cost is proportional to $T^2$, so doubling $T$ multiplies it by 4. This quadratic cost in sequence length is the main reason long-context attention is expensive.`,
      ],
      answer: { kind: 'number', value: 1048576 },
      areas: ['math', 'llm'],
    },
    {
      id: 'la02-p8',
      title: 'The projection onto a line',
      type: 'derive',
      difficulty: 2,
      minutes: 8,
      statement: md`For a nonzero $\ba \in \R^n$ let $P = \dfrac{\ba\ba\T}{\ba\T\ba}$. Show that $P\T = P$ and $P^2 = P$, and that $P\bx$ is the projection of $\bx$ onto the line through $\ba$. Then compute $P$ for $\ba = (1, 2)$.`,
      solution: [
        md`$P\T = \dfrac{(\ba\ba\T)\T}{\ba\T\ba} = \dfrac{\ba\ba\T}{\ba\T\ba} = P$, since $(\ba\ba\T)\T = (\ba\T)\T\ba\T = \ba\ba\T$.`,
        md`$P^2 = \dfrac{\ba(\ba\T\ba)\ba\T}{(\ba\T\ba)^2} = \dfrac{\ba\ba\T}{\ba\T\ba} = P$, regrouping with associativity.`,
        md`$P\bx = \ba\dfrac{\ba\T\bx}{\ba\T\ba} = \dfrac{\ba\cdot\bx}{\ba\cdot\ba}\ba$, the projection formula.`,
        md`For $\ba = (1, 2)$: $\ba\T\ba = 5$ and $\ba\ba\T = \begin{bmatrix} 1 & 2 \\ 2 & 4 \end{bmatrix}$, so $P = \begin{bmatrix} 0.2 & 0.4 \\ 0.4 & 0.8 \end{bmatrix}$.`,
      ],
      answer: { kind: 'matrix', value: [[0.2, 0.4], [0.4, 0.8]] },
      rubric: [md`Symmetry shown with the transpose rule`, md`$P^2 = P$ by regrouping`, md`Connects $P\bx$ to the projection formula`, md`Correct numerical $P$`],
    },
    {
      id: 'la02-p9',
      title: 'Linear or not?',
      type: 'concept',
      difficulty: 1,
      minutes: 6,
      statement: md`Which of these maps $\R^2 \to \R^2$ are linear? For each linear one, give its matrix. (a) $(x, y) \mapsto (y, x)$; (b) $(x, y) \mapsto (x + y, 1)$; (c) $(x, y) \mapsto (2x, x - y)$; (d) $(x, y) \mapsto (x^2, y)$. Enter the matrix of (c).`,
      solution: [
        md`(a) Linear, matrix $\begin{bmatrix} 0 & 1 \\ 1 & 0 \end{bmatrix}$ (images of $\ihat$ and $\jhat$ are $(0, 1)$ and $(1, 0)$).`,
        md`(b) Not linear: $T(\bzero) = (0, 1) \neq \bzero$.`,
        md`(c) Linear: $T(\ihat) = (2, 1)$ and $T(\jhat) = (0, -1)$, so the matrix is $\begin{bmatrix} 2 & 0 \\ 1 & -1 \end{bmatrix}$.`,
        md`(d) Not linear: $T(2\ihat) = (4, 0) \neq 2T(\ihat) = (2, 0)$.`,
      ],
      answer: { kind: 'matrix', value: [[2, 0], [1, -1]] },
    },
    {
      id: 'la02-p10',
      title: 'Depth without activations',
      type: 'concept',
      difficulty: 3,
      minutes: 10,
      statement: md`A network computes $\by = W_3W_2W_1\bx$ with $W_1$ of shape $64\times 1000$, $W_2$ of shape $64\times 64$ and $W_3$ of shape $1000\times 64$. (a) What single matrix computes the same function, and what is its shape? (b) Explain why this network cannot represent every linear map $\R^{1000}\to\R^{1000}$. (c) Count its parameters and compare with a single $1000\times 1000$ matrix.`,
      solution: [
        md`(a) $M = W_3W_2W_1$, of shape $(1000\times 64)(64\times 64)(64\times 1000) = 1000\times 1000$.`,
        md`(b) Every output $M\bx = W_3(W_2W_1\bx)$ is $W_3$ times something, so it is a combination of the 64 columns of $W_3$. The outputs fill at most a 64-dimensional subspace of $\R^{1000}$; a general $1000\times 1000$ matrix can reach all of $\R^{1000}$. (Module 4 calls this rank at most 64.)`,
        md`(c) $64{,}000 + 4096 + 64{,}000 = 132{,}096$ parameters, against $1{,}000{,}000$ for a full matrix. A bottleneck trades expressiveness for fewer parameters, the same trade that LoRA makes on purpose.`,
      ],
      rubric: [md`Correct product and shape`, md`Argues that the outputs lie in the span of the columns of $W_3$`, md`Correct parameter counts and comparison`],
      areas: ['math', 'ml-depth'],
    },
  ],
};
