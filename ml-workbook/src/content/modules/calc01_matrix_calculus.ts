import { md, type Module } from '../types';

export const MODULE: Module = {
  id: 'calc01',
  part: 'calc',
  order: 1,
  title: 'Multivariable and matrix calculus',
  summary: 'Partial derivatives and the gradient, Jacobians and the chain rule on computational graphs, matrix-calculus identities, the Hessian and convexity.',
  relevance: md`Training a model means following the gradient of a loss with respect to millions or billions of parameters, and backpropagation is the multivariable chain rule run in reverse over a computational graph. The identities $\nabla(\bx\T A\bx) = (A + A\T)\bx$ and $\nabla_\bw\lVert X\bw - \by\rVert^2 = 2X\T(X\bw - \by)$ come up constantly in derivations and whiteboard interviews. The Hessian explains convexity, why some losses are easy to optimize and others are not, and why the learning rate is limited by curvature.`,
  areas: ['math', 'ml-depth'],
  prereqs: ['la01'],
  lessons: [
    // ------------------------------------------------------------------ 1.1
    {
      id: 'calc01-1',
      title: 'Partial derivatives, the gradient and directional derivatives',
      minutes: 35,
      objectives: [
        'Compute partial derivatives of a function of several variables by holding the other variables fixed.',
        'Assemble the gradient and explain why it points in the direction of steepest ascent and is orthogonal to level sets.',
        'Compute a directional derivative as the dot product of the gradient with a unit vector.',
        'Estimate a function value with the linear approximation f(p + Δ) ≈ f(p) + ∇f(p)·Δ.',
      ],
      cells: [
        {
          kind: 'text',
          md: md`A model's loss $L(\bw)$ depends on every weight in $\bw$. Training needs one piece of information at each step: if each weight is nudged a little, how does the loss respond? For one variable the answer is the derivative $f'(x)$, the slope of the graph. For many variables it is a list of slopes, one per variable, and that list is the **gradient**.

Take a function of two variables, $f(x, y)$. Freeze $y$ at some value $y_0$. What remains, $x \mapsto f(x, y_0)$, is an ordinary function of one variable: a slice through the surface. Its slope at $x_0$ is the **partial derivative** of $f$ with respect to $x$.`,
        },
        {
          kind: 'callout',
          tone: 'definition',
          title: 'Partial derivative',
          md: md`For $f: \R^n \to \R$ and a point $\bp$, the partial derivative with respect to $x_i$ is $$\pd{f}{x_i}(\bp) = \lim_{h \to 0} \frac{f(\bp + h\,\be_i) - f(\bp)}{h},$$ where $\be_i$ is the $i$-th standard basis vector. In practice: differentiate with respect to $x_i$ and treat every other variable as a constant.`,
        },
        {
          kind: 'viz',
          viz: { type: 'calc.partials', fn: 'poly', p: [1, 0.5] },
          task: md`For $f = x^2y + 3y$, drag $\bp$ to $(1, 2)$ and read both slopes. Then slide $\bp$ along the vertical line $x = 0$: what happens to $\partial f/\partial x$, and why?`,
          caption: md`The blue line through $\bp$ is the slice with $y$ held fixed; its graph is below on the left. The orange line holds $x$ fixed. Each partial derivative is the slope of the tangent to one slice. On $x = 0$ the blue slice $f(x, y_0) = y_0x^2 + 3y_0$ is a parabola with its vertex at $x = 0$, so $\partial f/\partial x = 2xy = 0$ there.`,
        },
        {
          kind: 'callout',
          tone: 'example',
          title: 'Worked example',
          md: md`$f(x, y) = x^2y + 3y$. Treating $y$ as a constant, $\pd{f}{x} = 2xy$. Treating $x$ as a constant, $\pd{f}{y} = x^2 + 3$. At $(1, 2)$: $\pd{f}{x} = 4$ and $\pd{f}{y} = 4$.`,
        },
        {
          kind: 'numeric',
          q: md`Let $f(x, y) = x^3 + 2xy^2 - y$. Compute $\left(\pd{f}{x}, \pd{f}{y}\right)$ at $(1, -1)$.`,
          answer: { kind: 'vector', value: [5, -5] },
          hints: [md`$\pd{f}{x} = 3x^2 + 2y^2$ and $\pd{f}{y} = 4xy - 1$.`],
          explain: md`$\pd{f}{x} = 3x^2 + 2y^2 = 3 + 2 = 5$. $\pd{f}{y} = 4xy - 1 = -4 - 1 = -5$.`,
        },
        {
          kind: 'callout',
          tone: 'definition',
          title: 'Gradient',
          md: md`The gradient of $f: \R^n \to \R$ at $\bp$ is the vector of all partial derivatives, $$\nabla f(\bp) = \begin{bmatrix} \partial f/\partial x_1 \\ \vdots \\ \partial f/\partial x_n \end{bmatrix}(\bp) \in \R^n.$$ It has the same shape as the input $\bx$. If $f$ is differentiable at $\bp$, it has the **linear approximation** $$f(\bp + \Delta) \approx f(\bp) + \nabla f(\bp)\cdot\Delta$$ for small $\Delta$. For two variables the right side is the tangent plane to the surface $z = f(x, y)$.`,
        },
        {
          kind: 'text',
          md: md`The **directional derivative** asks for the rate of change along an arbitrary direction, given by a unit vector $\bu$: $$D_\bu f(\bp) = \lim_{h \to 0} \frac{f(\bp + h\bu) - f(\bp)}{h}.$$ Put $\Delta = h\bu$ into the linear approximation: $f(\bp + h\bu) - f(\bp) \approx h\,\nabla f(\bp)\cdot\bu$. Divide by $h$ and let $h \to 0$:
$$D_\bu f(\bp) = \nabla f(\bp)\cdot\bu.$$
The partial derivatives are the special cases $\bu = \be_i$. The vector $\bu$ must have length 1; otherwise the result is scaled by $\lVert\bu\rVert$.`,
        },
        {
          kind: 'callout',
          tone: 'theorem',
          title: 'Steepest ascent and level sets',
          md: md`Let $\nabla f(\bp) \ne \bzero$ and let $\theta$ be the angle between $\bu$ and $\nabla f(\bp)$. Then $D_\bu f(\bp) = \lVert\nabla f(\bp)\rVert\cos\theta$, so

- the largest rate of increase is $\lVert\nabla f(\bp)\rVert$, in the direction $\bu = \nabla f / \lVert\nabla f\rVert$
- the fastest decrease is in the direction $-\nabla f$
- the rate is $0$ in the directions perpendicular to $\nabla f$, which are the directions tangent to the **level set** $\{\bx : f(\bx) = f(\bp)\}$. The gradient is orthogonal to level sets.`,
        },
        {
          kind: 'viz',
          viz: { type: 'calc.gradient', fn: 'quad', p: [1.5, 1], theta: 120, h: 0.5 },
          task: md`Turn $\theta$ until $D_\bu f$ is as large as possible and compare it with $\lVert\nabla f\rVert$. Then find the two directions where $D_\bu f = 0$ and look at the level set through $\bp$. Finally set $h = 1.5$ and compare the linear prediction with the true value.`,
          caption: md`The bottom plot is $D_\bu f = \lVert\nabla f\rVert\cos\theta$ as $\bu$ turns: a cosine with its peak at the gradient's direction (blue line). The dashed accent line is tangent to the level set and perpendicular to the gradient. The linear prediction $f(\bp) + h D_\bu f$ is exact only in the limit; its error grows like $h^2$.`,
        },
        {
          kind: 'derive',
          title: 'why the gradient is the steepest direction',
          goal: md`Show that among unit vectors $\bu$, $D_\bu f(\bp)$ is largest for $\bu = \nabla f(\bp)/\lVert\nabla f(\bp)\rVert$, and that $\nabla f(\bp)$ is orthogonal to the level set through $\bp$.`,
          steps: [
            { md: md`From the linear approximation, $D_\bu f(\bp) = \nabla f(\bp)\cdot\bu$ for every unit vector $\bu$.` },
            {
              md: md`By Cauchy–Schwarz, $\nabla f\cdot\bu \le \lVert\nabla f\rVert\,\lVert\bu\rVert = \lVert\nabla f\rVert$, with equality exactly when $\bu$ is a positive multiple of $\nabla f$. So the maximum is $\lVert\nabla f\rVert$, reached at $\bu = \nabla f/\lVert\nabla f\rVert$.`,
              choose: {
                prompt: md`Which inequality bounds $\nabla f\cdot\bu$ over all unit vectors?`,
                options: [md`Cauchy–Schwarz: $|\ba\cdot\bb| \le \lVert\ba\rVert\lVert\bb\rVert$`, md`The triangle inequality`, md`$\nabla f\cdot\bu \le \nabla f\cdot\nabla f$`],
                answer: 0,
                explain: md`Cauchy–Schwarz bounds a dot product by the product of the lengths, and $\lVert\bu\rVert = 1$. It also tells you when equality holds: when the vectors are parallel.`,
              },
            },
            {
              md: md`Let $\bt$ be a unit vector tangent to the level set at $\bp$. Moving along $\bt$ keeps $f$ constant to first order, so $D_\bt f(\bp) = 0$.`,
              choose: {
                prompt: md`What is the rate of change of $f$ along a direction tangent to the level set?`,
                options: [md`$0$, because $f$ is constant on the level set`, md`$\lVert\nabla f\rVert$`, md`It depends on the length of $\bt$`],
                answer: 0,
                explain: md`A level set is where $f$ takes one value. A curve inside it has $f$ constant, so its rate of change is zero.`,
              },
            },
            { md: md`Combine with step 1: $\nabla f(\bp)\cdot\bt = 0$. The gradient is orthogonal to every tangent direction of the level set.` },
          ],
          takeaway: md`On a contour plot, the gradient always crosses the contours at right angles, pointing toward higher values. Steepest descent therefore moves straight across the contours.`,
        },
        {
          kind: 'check',
          q: md`At a point $\bp$, $\nabla f(\bp) = (3, -4)$. Along which unit vector does $f$ **decrease** fastest, and at what rate?`,
          options: [md`$(-0.6, 0.8)$, at rate $-5$`, md`$(0.6, -0.8)$, at rate $-5$`, md`$(-3, 4)$, at rate $-25$`, md`$(0.8, 0.6)$, at rate $0$`],
          answer: 0,
          explain: md`Fastest decrease is along $-\nabla f/\lVert\nabla f\rVert = -(3, -4)/5 = (-0.6, 0.8)$, with $D_\bu f = -\lVert\nabla f\rVert = -5$. $(0.6, -0.8)$ is the steepest **ascent**. $(-3, 4)$ is not a unit vector. $(0.8, 0.6)$ is perpendicular to the gradient: a level-set direction.`,
        },
        {
          kind: 'numeric',
          q: md`Let $f(x, y) = x^2 + 2y^2$. Compute the directional derivative at $(1, 1)$ in the direction of the vector $\bv = (3, 4)$.`,
          answer: { kind: 'number', value: 4.4 },
          hints: [md`Normalize first: $\bu = \bv/\lVert\bv\rVert = (0.6, 0.8)$.`],
          explain: md`$\nabla f = (2x, 4y) = (2, 4)$ and $\bu = (0.6, 0.8)$, so $D_\bu f = 1.2 + 3.2 = 4.4$. Using $\bv$ without normalizing gives $22$, five times too large.`,
        },
        {
          kind: 'paper',
          problem: {
            id: 'calc01-1-paper',
            title: 'Predicting a value with the tangent plane',
            type: 'compute',
            difficulty: 1,
            minutes: 7,
            statement: md`Let $f(x, y) = x^2y + 3y$. Use the linear approximation at $\bp = (1, 2)$ to estimate $f(1.2, 2.1)$, then compute the true value. Enter [estimate, true value].`,
            hints: [md`$f(1, 2) = 8$ and $\nabla f(1, 2) = (4, 4)$. The step is $\Delta = (0.2, 0.1)$.`],
            solution: [
              md`$f(\bp) = 1\cdot 2 + 6 = 8$. $\nabla f = (2xy,\ x^2 + 3)$, so $\nabla f(\bp) = (4, 4)$.`,
              md`$\Delta = (1.2, 2.1) - (1, 2) = (0.2, 0.1)$, so $\nabla f(\bp)\cdot\Delta = 0.8 + 0.4 = 1.2$ and the estimate is $8 + 1.2 = 9.2$.`,
              md`True value: $f(1.2, 2.1) = 1.44\cdot 2.1 + 6.3 = 3.024 + 6.3 = 9.324$.`,
              md`The error $0.124$ comes from the second-order terms that the linear approximation ignores (lesson 1.3). Halving $\Delta$ would cut it roughly by four.`,
            ],
            answer: { kind: 'vector', value: [9.2, 9.324] },
          },
        },
        {
          kind: 'callout',
          tone: 'intuition',
          title: 'Where this appears in ML',
          md: md`Gradient descent updates $\bw \leftarrow \bw - \eta\nabla L(\bw)$. The linear approximation explains why this works for small $\eta$: $L(\bw - \eta\nabla L) \approx L(\bw) - \eta\lVert\nabla L\rVert^2$, which is below $L(\bw)$ whenever the gradient is nonzero. It also explains why it fails for large $\eta$: the approximation stops being accurate. Module 3 makes this precise.`,
        },
        {
          kind: 'code',
          code: `import numpy as np

def f(p):
    x, y = p
    return x**2 * y + 3 * y

p = np.array([1.0, 2.0])
h = 1e-5
grad = np.array([(f(p + h * e) - f(p - h * e)) / (2 * h) for e in np.eye(2)])
print(np.round(grad, 4))`,
          predict: {
            q: md`Each entry is a central difference along one basis vector $\be_i$. What is printed?`,
            options: ['`[4. 4.]`', '`[2. 4.]`', '`[4. 7.]`', '`[8. 8.]`'],
            answer: 0,
            explain: md`The central differences approximate $\partial f/\partial x = 2xy = 4$ and $\partial f/\partial y = x^2 + 3 = 4$ at $(1, 2)$. NumPy prints floats as \`4.\`.`,
          },
          note: md`Change \`p\` and compare with the formulas $2xy$ and $x^2 + 3$. Lesson 1.3 turns this into a gradient checker.`,
        },
        {
          kind: 'recall',
          prompt: md`Without looking back: write the directional derivative in terms of the gradient, say in which direction it is largest and what its largest value is, and state how the gradient relates to level sets.`,
          answer: md`$D_\bu f = \nabla f\cdot\bu$ for a unit vector $\bu$. It is largest along $\nabla f/\lVert\nabla f\rVert$, where it equals $\lVert\nabla f\rVert$. The gradient is orthogonal to the level set through the point and points toward increasing $f$.`,
        },
      ],
      cards: [
        { id: 'calc01-1-c1', kind: 'concept', front: md`What is $\partial f/\partial x_i$, in one sentence?`, back: md`The derivative of $f$ with respect to $x_i$ with every other variable held fixed: the slope of the slice through the point along $\be_i$.` },
        { id: 'calc01-1-c2', kind: 'cloze', text: md`The gradient of $f$ is {{}} to the level sets of $f$.`, answers: ['orthogonal'] },
        { id: 'calc01-1-c3', kind: 'compute', front: md`$f(x, y) = x^2y$. Compute $\nabla f(3, 1)$.`, answer: { kind: 'vector', value: [6, 9] }, back: md`$\nabla f = (2xy, x^2) = (6, 9)$.` },
        { id: 'calc01-1-c4', kind: 'concept', front: md`Formula for the directional derivative, and the condition on $\bu$.`, back: md`$D_\bu f(\bp) = \nabla f(\bp)\cdot\bu$, where $\bu$ must be a unit vector.` },
        { id: 'calc01-1-c5', kind: 'compute', front: md`$\nabla f(\bp) = (1, 2)$ and $f(\bp) = 5$. Estimate $f(\bp + (0.1, -0.2))$ with the linear approximation.`, answer: { kind: 'number', value: 4.7 }, back: md`$5 + (1)(0.1) + (2)(-0.2) = 5 + 0.1 - 0.4 = 4.7$.` },
      ],
    },
    // ------------------------------------------------------------------ 1.2
    {
      id: 'calc01-2',
      title: 'Jacobians, the chain rule and computational graphs',
      minutes: 40,
      objectives: [
        'Compute the Jacobian matrix of a map from ℝⁿ to ℝᵐ and state its shape.',
        'Apply the multivariable chain rule as a product of Jacobians and as a sum over paths.',
        'Evaluate a computational graph forward and propagate adjoints backward by hand.',
        'Explain why reverse mode gives a full gradient in one backward pass while forward mode needs one pass per input.',
      ],
      cells: [
        {
          kind: 'text',
          md: md`A neural network is a composition of simple maps: a linear layer, then an activation, then another linear layer, then a loss. Each piece takes a vector and returns a vector. To train it you need the derivative of the composition, and that needs two things: the derivative of a vector-valued map, and a rule for composing derivatives.

For $F: \R^n \to \R^m$, each output $F_i$ is an ordinary scalar function of $n$ inputs with its own gradient. Stacking those gradients as rows gives the **Jacobian**.`,
        },
        {
          kind: 'callout',
          tone: 'definition',
          title: 'Jacobian',
          md: md`The Jacobian of $F: \R^n \to \R^m$ at $\bx$ is the $m \times n$ matrix $$J_F(\bx) = \begin{bmatrix} \partial F_1/\partial x_1 & \cdots & \partial F_1/\partial x_n \\ \vdots & & \vdots \\ \partial F_m/\partial x_1 & \cdots & \partial F_m/\partial x_n \end{bmatrix}, \qquad (J_F)_{ij} = \pd{F_i}{x_j}.$$ Row $i$ is $\nabla F_i\T$. It gives the linear approximation $F(\bx + \Delta) \approx F(\bx) + J_F(\bx)\,\Delta$: near $\bx$, $F$ acts like the matrix $J_F(\bx)$. For a scalar function ($m = 1$) the Jacobian is the row $\nabla f\T$.`,
        },
        {
          kind: 'viz',
          viz: { type: 'calc.jacobian', map: 'warp', p: [1, 0.5], eps: 0.6 },
          task: md`Shrink the square to $\varepsilon = 0.1$ and compare the area ratio with $|\det J_F|$. Then switch to **polar** and check that $\det J_F = r$: drag the point toward $r = 0$ and watch the image square collapse.`,
          caption: md`A nonlinear map bends the grid, but a small enough square is mapped almost exactly to the parallelogram $J_F\cdot$(square). This is the sense in which the Jacobian is the best linear approximation, and why $|\det J_F|$ is the local area-scaling factor, as for any matrix in the determinants module.`,
        },
        {
          kind: 'numeric',
          q: md`Compute the Jacobian of $F(x, y) = (x^2y,\ x + \sin y)$ at $(2, 0)$. Enter it as a matrix, rows first.`,
          answer: { kind: 'matrix', value: [[0, 4], [1, 1]] },
          inputHint: 'e.g. [[a, b], [c, d]]',
          explain: md`Row 1 is $\nabla(x^2y) = (2xy, x^2) = (0, 4)$. Row 2 is $\nabla(x + \sin y) = (1, \cos y) = (1, 1)$.`,
        },
        {
          kind: 'callout',
          tone: 'theorem',
          title: 'Chain rule',
          md: md`If $F: \R^n \to \R^m$ and $G: \R^m \to \R^k$ are differentiable, then $$J_{G\circ F}(\bx) = J_G(F(\bx))\; J_F(\bx),$$ a $(k \times m)(m \times n) = k \times n$ product. Written out for one entry, with $\bu = F(\bx)$: $$\pd{G_i}{x_j} = \sum_{r=1}^{m} \pd{G_i}{u_r}\,\pd{u_r}{x_j}.$$ Each term is one **path** from $x_j$ through an intermediate variable $u_r$ to $G_i$; the derivative is the sum over all paths of the product of local derivatives along the path.`,
        },
        {
          kind: 'check',
          q: md`$F: \R^3 \to \R^2$ and $g: \R^2 \to \R$. What is the shape of $J_{g\circ F}$, and what does it represent?`,
          options: [md`$1 \times 3$: the gradient of $g\circ F$, written as a row`, md`$3 \times 1$: a column, because the input has 3 entries`, md`$2 \times 3$: the Jacobian of $F$`, md`$1 \times 2$: the gradient of $g$`],
          answer: 0,
          explain: md`$J_g$ is $1 \times 2$ and $J_F$ is $2 \times 3$, so the product is $1 \times 3$. A scalar function's Jacobian is the transposed gradient. The gradient itself, $\nabla(g\circ F) = J_F\T\nabla g$, is a column in $\R^3$.`,
        },
        {
          kind: 'derive',
          title: 'the chain rule from linear approximations',
          goal: md`Let $u(t)$ and $v(t)$ be differentiable and $z = f(u, v)$. Show that $\dfrac{dz}{dt} = \pd{f}{u}\dfrac{du}{dt} + \pd{f}{v}\dfrac{dv}{dt}$.`,
          steps: [
            { md: md`Change $t$ by a small $\Delta t$. Each inner function responds linearly: $\Delta u \approx u'(t)\,\Delta t$ and $\Delta v \approx v'(t)\,\Delta t$.` },
            {
              md: md`The linear approximation of $f$ turns changes in $(u, v)$ into a change in $z$: $$\Delta z \approx \pd{f}{u}\Delta u + \pd{f}{v}\Delta v.$$`,
              choose: {
                prompt: md`How does $z$ respond to a small change $(\Delta u, \Delta v)$?`,
                options: [md`$\Delta z \approx \nabla f\cdot(\Delta u, \Delta v)$, the linear approximation of $f$`, md`$\Delta z \approx \pd{f}{u}\Delta u\cdot\pd{f}{v}\Delta v$`, md`$\Delta z \approx \Delta u + \Delta v$`],
                answer: 0,
                explain: md`The linear approximation of a function of two variables adds the two partial effects. Products of the effects are second-order small.`,
              },
            },
            { md: md`Substitute step 1 into step 2: $\Delta z \approx \left(\pd{f}{u}u'(t) + \pd{f}{v}v'(t)\right)\Delta t$. Divide by $\Delta t$ and let $\Delta t \to 0$.` },
            { md: md`In matrix form this is $J_z = \begin{bmatrix}\partial f/\partial u & \partial f/\partial v\end{bmatrix}\begin{bmatrix}u'(t) \\ v'(t)\end{bmatrix}$, a $1\times 2$ times $2 \times 1$ product.` },
          ],
          takeaway: md`Composing maps composes their linear approximations, and composing linear maps multiplies their matrices. That is all the chain rule says.`,
        },
        {
          kind: 'text',
          md: md`A **computational graph** writes a function as a sequence of elementary operations, each a node. For $f(x, y) = (xy + \sin x)^2$:

| node | operation | local derivatives |
|---|---|---|
| $a$ | $xy$ | $\partial a/\partial x = y$, $\partial a/\partial y = x$ |
| $b$ | $\sin x$ | $\partial b/\partial x = \cos x$ |
| $c$ | $a + b$ | $\partial c/\partial a = 1$, $\partial c/\partial b = 1$ |
| $f$ | $c^2$ | $\partial f/\partial c = 2c$ |

The **forward pass** evaluates the nodes in order and stores their values. The **backward pass** computes, for every node $v$, its **adjoint** $\bar v = \partial f/\partial v$, starting from $\bar f = 1$ and moving toward the inputs.`,
        },
        {
          kind: 'callout',
          tone: 'definition',
          title: 'Reverse-mode accumulation (backpropagation)',
          md: md`Visit nodes in reverse order. For each node $v$, $$\bar v = \sum_{w \,\in\, \text{children}(v)} \bar w\,\pd{w}{v}.$$ Every child $w$ already has its adjoint, and $\partial w/\partial v$ is a local derivative evaluated at the stored forward values. When a variable feeds several nodes, its adjoint is the **sum** of the contributions, one per path.`,
        },
        {
          kind: 'viz',
          viz: { type: 'calc.compgraph', mode: 'reverse', x: 1, y: 2 },
          task: md`Step through the backward pass with the › button. At which step does $\bar x$ receive its second contribution, and why does it need two? Then switch to **fwd, seed x** and **fwd, seed y**: how many passes does forward mode need to get both partials?`,
          caption: md`$x$ feeds both $a = xy$ and $b = \sin x$, so two paths lead from $x$ to $f$ and $\bar x = \bar a\,y + \bar b\cos x$. Reverse mode gets $\partial f/\partial x$ and $\partial f/\partial y$ from one backward pass. Forward mode carries the derivative with respect to one input alongside the values, so it needs one pass per input.`,
        },
        {
          kind: 'numeric',
          q: md`Let $f(x, y, z) = (x + y)\,z$ with intermediate $q = x + y$. At $x = -2$, $y = 5$, $z = -4$, run the backward pass by hand and enter $(\partial f/\partial x, \partial f/\partial y, \partial f/\partial z)$.`,
          answer: { kind: 'vector', value: [-4, -4, 3] },
          hints: [md`Forward: $q = 3$, $f = -12$. Backward: $\bar f = 1$, $\bar z = \bar f\, q$, $\bar q = \bar f\, z$, and an addition node passes its adjoint unchanged to both inputs.`],
          explain: md`$\bar z = q = 3$ and $\bar q = z = -4$. Since $q = x + y$ has local derivatives $1$ and $1$, $\bar x = \bar y = -4$.`,
        },
        {
          kind: 'text',
          md: md`**Forward versus reverse mode.** For $F: \R^n \to \R^m$:

- **Forward mode** seeds one input direction $\bv$ and carries derivatives forward with the values. One pass gives the Jacobian–vector product $J\bv$, one column of $J$ when $\bv = \be_j$. The full Jacobian takes $n$ passes.
- **Reverse mode** runs the forward pass, then seeds one output and carries adjoints backward. One pass gives the vector–Jacobian product $\bu\T J$, one row of $J$. The full Jacobian takes $m$ passes.

A training loss has $m = 1$ output and $n$ in the millions or billions of parameters, so reverse mode wins by a factor of $n$: the whole gradient costs a small constant multiple of one forward evaluation. The price is memory: the backward pass needs the values stored during the forward pass, which is why activation memory dominates training and why techniques such as gradient checkpointing trade recomputation for memory.`,
        },
        {
          kind: 'check',
          q: md`You need the full Jacobian of a map $F: \R^{3} \to \R^{1000}$, for example how 1000 outputs of a simulation depend on 3 physical parameters. Which mode needs fewer passes?`,
          options: [md`Forward mode: 3 passes, one per input`, md`Reverse mode: 1 pass, as for any gradient`, md`Reverse mode: 3 passes`, md`They always cost the same`],
          answer: 0,
          explain: md`Forward mode gives one column per pass, and there are only 3 columns. Reverse mode gives one row per pass and would need 1000. Reverse mode wins when there are few outputs, as with a scalar loss.`,
        },
        {
          kind: 'paper',
          problem: {
            id: 'calc01-2-paper',
            title: 'Backpropagation through one sigmoid neuron',
            type: 'derive',
            difficulty: 2,
            minutes: 12,
            statement: md`A neuron computes $z = wx + b$, $a = \sigma(z)$ with $\sigma(z) = 1/(1 + e^{-z})$, and the loss is $L = \tfrac12(a - y)^2$.

(a) Draw the computational graph and derive $\partial L/\partial w$ and $\partial L/\partial b$ using $\sigma'(z) = \sigma(z)(1 - \sigma(z))$.

(b) Evaluate both at $w = 0$, $b = 0$, $x = 2$, $y = 1$. Enter $[\partial L/\partial w, \partial L/\partial b]$.`,
            hints: [md`Work backward: $\bar a = a - y$, then $\bar z = \bar a\,\sigma'(z)$, then $\bar w = \bar z\,x$ and $\bar b = \bar z$.`],
            solution: [
              md`Graph: $w, x \to$ (multiply) $\to$ (add $b$) $\to z \to \sigma \to a \to L$. Forward at the given point: $z = 0$, $a = \sigma(0) = 0.5$, $L = \tfrac12(0.5 - 1)^2 = 0.125$.`,
              md`$\bar L = 1$, and $\bar a = \partial L/\partial a = a - y$.`,
              md`$\bar z = \bar a\,\sigma'(z) = (a - y)\,a(1 - a)$, using $\sigma' = \sigma(1 - \sigma)$.`,
              md`$z = wx + b$ has $\partial z/\partial w = x$ and $\partial z/\partial b = 1$, so $\partial L/\partial w = (a - y)\,a(1 - a)\,x$ and $\partial L/\partial b = (a - y)\,a(1 - a)$.`,
              md`Numbers: $\bar a = -0.5$, $a(1-a) = 0.25$, $\bar z = -0.125$, so $\partial L/\partial w = -0.125\cdot 2 = -0.25$ and $\partial L/\partial b = -0.125$.`,
            ],
            answer: { kind: 'vector', value: [-0.25, -0.125] },
            rubric: [md`Graph with the intermediate variables $z$ and $a$`, md`Adjoints computed in reverse order, each as (upstream adjoint) × (local derivative)`, md`Correct use of $\sigma' = \sigma(1-\sigma)$`, md`Both numerical values correct`],
            areas: ['math', 'ml-depth'],
          },
        },
        {
          kind: 'code',
          code: `import numpy as np

x, y = 1.0, 2.0
# forward pass: store every intermediate value
a = x * y
b = np.sin(x)
c = a + b
f = c ** 2
# backward pass: adjoints in reverse order
f_bar = 1.0
c_bar = f_bar * 2 * c
a_bar = c_bar * 1.0
b_bar = c_bar * 1.0
x_bar = b_bar * np.cos(x) + a_bar * y   # two paths into x
y_bar = a_bar * x
print("backprop:", np.round([x_bar, y_bar], 4))

h = 1e-6
F = lambda x, y: (x * y + np.sin(x)) ** 2
print("finite differences:", np.round([(F(x + h, y) - F(x - h, y)) / (2 * h), (F(x, y + h) - F(x, y - h)) / (2 * h)], 4))`,
          note: md`The two lines agree to four decimals. Delete the \`b_bar * np.cos(x)\` term (forgetting one path) and see the check fail.`,
        },
        {
          kind: 'explain',
          prompt: md`An interviewer asks: *what is backpropagation, and why do frameworks use reverse mode instead of forward mode?* Answer in a few sentences.`,
          model: md`Backpropagation is reverse-mode automatic differentiation applied to the computational graph of the loss. The forward pass evaluates every node and stores its value. The backward pass starts from $\partial L/\partial L = 1$ and visits nodes in reverse order, computing each adjoint $\bar v = \sum_w \bar w\,\partial w/\partial v$ from its children's adjoints and the local derivatives. One backward pass gives the derivative of the scalar loss with respect to every parameter, at a small constant multiple of the cost of the forward pass. Forward mode would need one pass per parameter. The cost of reverse mode is memory: intermediate activations must be kept until the backward pass uses them.`,
        },
      ],
      cards: [
        { id: 'calc01-2-c1', kind: 'concept', front: md`What is the shape of the Jacobian of $F: \R^n \to \R^m$, and what is entry $(i, j)$?`, back: md`$m \times n$. Entry $(i, j)$ is $\partial F_i/\partial x_j$; row $i$ is $\nabla F_i\T$.` },
        { id: 'calc01-2-c2', kind: 'cloze', text: md`In the backward pass, when a variable feeds several nodes, the contributions to its adjoint are {{}}.`, answers: ['added'] },
        { id: 'calc01-2-c3', kind: 'concept', front: md`State the chain rule for $G \circ F$ in Jacobian form.`, back: md`$J_{G\circ F}(\bx) = J_G(F(\bx))\,J_F(\bx)$: a product of Jacobians, evaluated at the right points.` },
        { id: 'calc01-2-c4', kind: 'concept', front: md`Forward mode versus reverse mode: what does one pass compute, and which suits a scalar loss?`, back: md`Forward: a Jacobian–vector product $J\bv$ (one column). Reverse: a vector–Jacobian product $\bu\T J$ (one row). A scalar loss has one row, so reverse mode gets the whole gradient in one pass.` },
        { id: 'calc01-2-c5', kind: 'compute', front: md`$f = q z$ with $q = x + y$. At $x = 1$, $y = 2$, $z = 5$, what is $\partial f/\partial x$?`, answer: { kind: 'number', value: 5 }, back: md`$\bar q = z = 5$, and the addition node passes it to $x$ unchanged: $\partial f/\partial x = 5$.` },
      ],
    },
    // ------------------------------------------------------------------ 1.3
    {
      id: 'calc01-3',
      title: 'Matrix calculus, the Hessian and convexity',
      minutes: 40,
      objectives: [
        'Derive ∇(aᵀx) = a, ∇(xᵀAx) = (A + Aᵀ)x and the gradient of the least-squares loss.',
        'Use the shape rule to check a matrix-calculus result.',
        'Compute a Hessian, classify a critical point from its eigenvalues, and relate a PSD Hessian to convexity.',
        'Write the second-order Taylor expansion and use it to predict a function value.',
        'Check an analytic gradient against central finite differences in NumPy.',
      ],
      cells: [
        {
          kind: 'text',
          md: md`Linear regression minimizes $L(\bw) = \lVert X\bw - \by\rVert^2$ over $\bw \in \R^d$. Computing $d$ partial derivatives one at a time works, but a derivation in whole vectors and matrices is shorter and yields a formula that NumPy evaluates in one line. Matrix calculus is a small set of identities, each proved once by writing the expression in index notation and differentiating one coordinate.`,
        },
        {
          kind: 'callout',
          tone: 'remember',
          title: 'The shape rule',
          md: md`For a scalar $f$, the gradient with respect to a variable has **the shape of that variable**: $\nabla_\bx f \in \R^n$ for $\bx \in \R^n$, and $\nabla_W f \in \R^{m\times n}$ with entries $\partial f/\partial W_{ij}$ for $W \in \R^{m \times n}$. Checking shapes catches most transposition mistakes before any algebra.`,
        },
        {
          kind: 'derive',
          title: 'gradients of linear and quadratic forms',
          goal: md`Show that $\nabla_\bx(\ba\T\bx) = \ba$ and $\nabla_\bx(\bx\T A\bx) = (A + A\T)\bx$ for $A \in \R^{n\times n}$.`,
          steps: [
            { md: md`Linear form: $\ba\T\bx = \sum_i a_ix_i$. Only the term with $i = k$ depends on $x_k$, so $\partial(\ba\T\bx)/\partial x_k = a_k$. Stacking over $k$: $\nabla(\ba\T\bx) = \ba$.` },
            { md: md`Quadratic form in indices: $\bx\T A\bx = \sum_i\sum_j x_i A_{ij} x_j$.` },
            {
              md: md`Differentiate with respect to $x_k$ with the product rule. $x_k$ appears as $x_i$ (when $i = k$) and as $x_j$ (when $j = k$): $$\pd{}{x_k}\sum_{i,j} x_iA_{ij}x_j = \sum_j A_{kj}x_j + \sum_i x_iA_{ik}.$$`,
              choose: {
                prompt: md`In $\sum_{i,j} x_iA_{ij}x_j$, where does $x_k$ appear?`,
                options: [md`In the terms with $i = k$ and in the terms with $j = k$, so two sums appear`, md`Only in the term $x_kA_{kk}x_k$`, md`Only in the terms with $i = k$`],
                answer: 0,
                explain: md`Each term is a product of two coordinates. $x_k$ is the first factor when $i = k$ and the second when $j = k$. The diagonal term $x_kA_{kk}x_k$ belongs to both sums, which is exactly how the product rule counts it twice.`,
              },
            },
            {
              md: md`The first sum is $(A\bx)_k$. The second is $\sum_i A_{ik}x_i = (A\T\bx)_k$. So $\nabla(\bx\T A\bx) = A\bx + A\T\bx = (A + A\T)\bx$.`,
              choose: {
                prompt: md`What is $\sum_i A_{ik}x_i$ in matrix form?`,
                options: [md`$(A\T\bx)_k$`, md`$(A\bx)_k$`, md`$(\bx\T A\bx)_k$`],
                answer: 0,
                explain: md`$(A\T)_{ki} = A_{ik}$, so $\sum_i A_{ik}x_i = \sum_i (A\T)_{ki}x_i = (A\T\bx)_k$.`,
              },
            },
            { md: md`If $A$ is symmetric, this is $2A\bx$, the matrix version of $\frac{d}{dx}ax^2 = 2ax$.` },
          ],
          takeaway: md`$\nabla(\ba\T\bx) = \ba$, $\nabla(\bx\T A\bx) = (A + A\T)\bx$, and $2A\bx$ for symmetric $A$. A quadratic form only sees the symmetric part $\tfrac12(A + A\T)$ of $A$.`,
        },
        {
          kind: 'numeric',
          q: md`Let $A = \begin{bmatrix} 1 & 2 \\ 0 & 3 \end{bmatrix}$ and $\bx = (1, -1)$. Compute $\nabla(\bx\T A\bx)$ at $\bx$.`,
          answer: { kind: 'vector', value: [0, -4] },
          hints: [md`$A + A\T = \begin{bmatrix} 2 & 2 \\ 2 & 6 \end{bmatrix}$.`],
          explain: md`$(A + A\T)\bx = (2 - 2,\ 2 - 6) = (0, -4)$. Using $2A\bx = 2(-1, -3) = (-2, -6)$ is wrong here because $A$ is not symmetric.`,
        },
        {
          kind: 'derive',
          title: 'the gradient of least squares',
          goal: md`For $X \in \R^{n\times d}$, $\by \in \R^n$, show $\nabla_\bw\lVert X\bw - \by\rVert^2 = 2X\T(X\bw - \by)$, and find the minimizer.`,
          steps: [
            { md: md`Expand the squared norm as a dot product: $$\lVert X\bw - \by\rVert^2 = (X\bw - \by)\T(X\bw - \by) = \bw\T X\T X\bw - 2\by\T X\bw + \by\T\by.$$ The two cross terms $\bw\T X\T\by$ and $\by\T X\bw$ are equal scalars.` },
            {
              md: md`Differentiate term by term. $X\T X$ is symmetric, so $\nabla(\bw\T X\T X\bw) = 2X\T X\bw$. The middle term is linear, $\ba\T\bw$ with $\ba = X\T\by$, so its gradient is $-2X\T\by$. The constant $\by\T\by$ contributes $\bzero$.`,
              choose: {
                prompt: md`Which identity gives the gradient of $\bw\T X\T X\bw$?`,
                options: [md`$\nabla(\bw\T A\bw) = 2A\bw$ with the symmetric $A = X\T X$`, md`$\nabla(\ba\T\bw) = \ba$ with $\ba = X\T X$`, md`It has no closed form`],
                answer: 0,
                explain: md`It is a quadratic form in $\bw$ with matrix $X\T X$, and $(X\T X)\T = X\T X$.`,
              },
            },
            { md: md`Collect: $\nabla_\bw L = 2X\T X\bw - 2X\T\by = 2X\T(X\bw - \by)$. Shape check: $X\bw - \by \in \R^n$ and $X\T$ is $d \times n$, so the result is in $\R^d$, the shape of $\bw$.` },
            { md: md`Setting the gradient to zero gives the **normal equations** $X\T X\bw = X\T\by$ of the least-squares module: the residual $X\bw - \by$ is orthogonal to every column of $X$.` },
          ],
          takeaway: md`$\nabla_\bw\lVert X\bw - \by\rVert^2 = 2X\T(X\bw - \by)$: the transposed data matrix times the residual. The same shape (inputs transposed times an error signal) appears in the gradient of every linear layer.`,
        },
        {
          kind: 'check',
          q: md`$X \in \R^{n\times d}$, $\bw \in \R^d$, $\by \in \R^n$. Which expression has the right shape to be $\nabla_\bw\lVert X\bw - \by\rVert^2$?`,
          options: [md`$2X\T(X\bw - \by)$`, md`$2(X\bw - \by)\T X$`, md`$2X(X\bw - \by)$`, md`$2(X\bw - \by)$`],
          answer: 0,
          explain: md`The gradient must be in $\R^d$, a column like $\bw$. $(X\bw - \by)\T X$ is a $1\times d$ row: the Jacobian, the transpose of the gradient. $X(X\bw - \by)$ does not conform, and $2(X\bw - \by)$ lives in $\R^n$.`,
        },
        {
          kind: 'callout',
          tone: 'definition',
          title: 'Hessian',
          md: md`The Hessian of $f: \R^n \to \R$ is the $n\times n$ matrix of second partial derivatives, $$H_{ij} = \frac{\partial^2 f}{\partial x_i\,\partial x_j}.$$ When the second partials are continuous it is symmetric. It is the Jacobian of the gradient. Two examples: the Hessian of $\bx\T A\bx$ is $A + A\T$, and the Hessian of $\lVert X\bw - \by\rVert^2$ is $2X\T X$.`,
        },
        {
          kind: 'callout',
          tone: 'theorem',
          title: 'Second-order Taylor expansion and convexity',
          md: md`For twice-differentiable $f$ and small $\Delta$: $$f(\bx + \Delta) \approx f(\bx) + \nabla f(\bx)\T\Delta + \tfrac12\Delta\T H(\bx)\,\Delta.$$ At a **critical point** ($\nabla f = \bzero$) the quadratic term decides:

- $H$ positive definite (all eigenvalues $> 0$): a strict local minimum
- $H$ negative definite (all $< 0$): a strict local maximum
- $H$ indefinite (both signs): a saddle point
- some eigenvalue $= 0$: the test is inconclusive

A twice-differentiable $f$ is **convex** if and only if $H(\bx)$ is positive semidefinite at every $\bx$. For a convex function every local minimum is a global minimum.`,
        },
        {
          kind: 'viz',
          viz: { type: 'calc.hessian', A: [[1, 0.5], [0.5, 2]], p: [1.5, 1] },
          task: md`Make the Hessian indefinite (for example $A_{11} = 1$, $A_{22} = -1$) and look at the heat map: up along one eigenvector, down along the other. Then set $A_{12} = 2$, $A_{21} = 0$ and compare the picture with $A_{12} = A_{21} = 1$.`,
          caption: md`The eigenvectors $\mathbf{q}_1, \mathbf{q}_2$ of $H = A + A\T$ are the axes of the contour ellipses or hyperbolas, green for positive and red for negative curvature. $f(\bx) = \bx\T A\bx$ is unchanged when $A_{12}$ and $A_{21}$ trade off with a fixed sum, because only $A + A\T$ enters.`,
        },
        {
          kind: 'check',
          q: md`$f(x, y) = x^3 - 3x + y^2$ has critical points $(1, 0)$ and $(-1, 0)$, and $H = \begin{bmatrix} 6x & 0 \\ 0 & 2\end{bmatrix}$. What is $(-1, 0)$?`,
          options: [md`A saddle point`, md`A local minimum`, md`A local maximum`, md`The test is inconclusive`],
          answer: 0,
          explain: md`At $(-1, 0)$, $H = \diag(-6, 2)$ has one negative and one positive eigenvalue, so $f$ curves down along $x$ and up along $y$. At $(1, 0)$, $H = \diag(6, 2)$ is positive definite: a local minimum.`,
        },
        {
          kind: 'viz',
          viz: { type: 'calc.taylor', fn: 'quartic', x0: 0.5, h: 0.4 },
          task: md`Set $x_0 = 0$: $f'(0) = 0$ and $f''(0) = -2$, so the parabola opens downward and $0$ is a local maximum. Move $x_0$ until the parabola flips, and note where. Then set $h = 0.4$, then $h = 0.2$, and compare how much each error shrinks.`,
          caption: md`For $f = \tfrac14x^4 - x^2$, $f''(x) = 3x^2 - 2$ changes sign at $x = \pm\sqrt{2/3} \approx \pm 0.82$, so the function is convex only on the outer parts. The first-order error behaves like $h^2$ and the second-order error like $h^3$.`,
        },
        {
          kind: 'paper',
          problem: {
            id: 'calc01-3-paper',
            title: 'Least squares is convex',
            type: 'proof',
            difficulty: 2,
            minutes: 10,
            statement: md`Let $L(\bw) = \lVert X\bw - \by\rVert^2$ with $X \in \R^{n\times d}$. Prove that $L$ is convex by showing its Hessian is positive semidefinite. Then show that $L$ is strictly convex (Hessian positive definite) exactly when the columns of $X$ are linearly independent.`,
            hints: [md`The Hessian is $2X\T X$. For any $\bv$, write $\bv\T X\T X\bv$ as a squared norm.`],
            solution: [
              md`From $\nabla L = 2X\T X\bw - 2X\T\by$, differentiate once more: $H = 2X\T X$, the same at every $\bw$.`,
              md`For any $\bv \in \R^d$: $\bv\T(2X\T X)\bv = 2(X\bv)\T(X\bv) = 2\lVert X\bv\rVert^2 \ge 0$. So $H$ is positive semidefinite everywhere and $L$ is convex.`,
              md`$\bv\T H\bv = 0$ exactly when $X\bv = \bzero$. If the columns of $X$ are independent, $X\bv = \bzero$ only for $\bv = \bzero$, so $\bv\T H\bv > 0$ for all $\bv \ne \bzero$: $H$ is positive definite.`,
              md`Conversely, if the columns are dependent, some $\bv \ne \bzero$ has $X\bv = \bzero$, so $H$ is singular and $L$ is constant along the line $\bw + t\bv$: the minimizer is not unique.`,
            ],
            rubric: [md`Correct Hessian $2X\T X$`, md`Rewrites $\bv\T X\T X\bv$ as $\lVert X\bv\rVert^2$`, md`Connects positive definiteness to $X\bv = \bzero \Rightarrow \bv = \bzero$`, md`Mentions the consequence for uniqueness of the minimizer`],
            areas: ['math', 'ml-depth'],
          },
        },
        {
          kind: 'callout',
          tone: 'intuition',
          title: 'Curvature and optimization',
          md: md`The Hessian measures curvature. Newton's method jumps to the minimum of the quadratic model, $\Delta = -H^{-1}\nabla f$. For a network with $d$ parameters $H$ has $d^2$ entries, so for large models it is never formed. First-order methods are used instead, and their safe step size is limited by the largest Hessian eigenvalue, as module 3 shows. Hessian–vector products $H\bv$ can still be computed at the cost of about two gradient evaluations, by differentiating $\nabla f\cdot\bv$.`,
        },
        {
          kind: 'code',
          code: `import numpy as np

np.random.seed(0)
X = np.random.randn(50, 3)
y = np.random.randn(50)
w = np.zeros(3)
grad = 2 * X.T @ (X @ w - y)
print(grad.shape)`,
          predict: {
            q: md`Use the shape rule before running it. What is printed?`,
            options: ['`(3,)`', '`(50,)`', '`(50, 3)`', '`(1, 3)`'],
            answer: 0,
            explain: md`\`X @ w - y\` is the residual in $\R^{50}$, and \`X.T\` is $3\times 50$, so the gradient has shape \`(3,)\`, the shape of \`w\`.`,
          },
        },
        {
          kind: 'exercise',
          ex: {
            id: 'calc01-3-ex',
            title: 'Gradient checking with central differences',
            prompt: md`Implement \`num_grad(f, x, h=1e-5)\`, which returns the gradient of the scalar function \`f\` at the 1-D array \`x\` by central differences: entry $i$ is $\dfrac{f(\bx + h\be_i) - f(\bx - h\be_i)}{2h}$. Then use it to check the analytic least-squares gradient \`grad_ls\`. The tests compare your numerical gradient (rounded) and the relative error $\lVert g_{\text{num}} - g\rVert / \lVert g_{\text{num}} + g\rVert$.`,
            starter: `import numpy as np

def num_grad(f, x, h=1e-5):
    g = np.zeros_like(x)
    # TODO: fill g[i] with a central difference along coordinate i
    return g

np.random.seed(1)
X = np.random.randn(20, 3)
y = np.random.randn(20)
w0 = np.array([0.5, -1.0, 2.0])

def loss(w):
    r = X @ w - y
    return r @ r

def grad_ls(w):
    return 2 * X.T @ (X @ w - y)

g_num = num_grad(loss, w0)
g = grad_ls(w0)
rel_err = np.linalg.norm(g_num - g) / np.linalg.norm(g_num + g)
print(rel_err < 1e-6)`,
            solution: `import numpy as np

def num_grad(f, x, h=1e-5):
    g = np.zeros_like(x)
    for i in range(x.size):
        e = np.zeros_like(x)
        e[i] = h
        g[i] = (f(x + e) - f(x - e)) / (2 * h)
    return g

np.random.seed(1)
X = np.random.randn(20, 3)
y = np.random.randn(20)
w0 = np.array([0.5, -1.0, 2.0])

def loss(w):
    r = X @ w - y
    return r @ r

def grad_ls(w):
    return 2 * X.T @ (X @ w - y)

g_num = num_grad(loss, w0)
g = grad_ls(w0)
rel_err = np.linalg.norm(g_num - g) / np.linalg.norm(g_num + g)
print(rel_err < 1e-6)`,
            tests: [
              { expr: 'np.round(num_grad(loss, w0), 3).tolist()', label: 'numerical gradient of the least-squares loss' },
              { expr: 'bool(rel_err < 1e-6)', label: 'relative error below 1e-6' },
              { expr: 'np.round(num_grad(lambda v: np.sum(np.sin(v)), np.array([0.0, 1.0, 2.0])), 5).tolist()', label: 'gradient of sum(sin(x)) is cos(x)' },
            ],
            hints: [md`Loop over \`i in range(x.size)\`. Build a vector \`e\` that is zero except \`e[i] = h\`.`, md`Use \`(f(x + e) - f(x - e)) / (2 * h)\`. The one-sided difference \`(f(x + e) - f(x)) / h\` has error of order $h$ instead of $h^2$.`],
          },
        },
        {
          kind: 'recall',
          prompt: md`From memory: the gradients of $\ba\T\bx$, $\bx\T A\bx$ and $\lVert X\bw - \by\rVert^2$; the Hessian of the last two; and the eigenvalue test for a critical point.`,
          answer: md`$\ba$; $(A + A\T)\bx$ (so $2A\bx$ for symmetric $A$); $2X\T(X\bw - \by)$. Hessians: $A + A\T$ and $2X\T X$. At a critical point: all Hessian eigenvalues positive means a local minimum, all negative a maximum, mixed signs a saddle, a zero eigenvalue is inconclusive.`,
        },
      ],
      cards: [
        { id: 'calc01-3-c1', kind: 'concept', front: md`$\nabla_\bx(\bx\T A\bx) = ?$ And for symmetric $A$?`, back: md`$(A + A\T)\bx$; for symmetric $A$, $2A\bx$.` },
        { id: 'calc01-3-c2', kind: 'concept', front: md`$\nabla_\bw\lVert X\bw - \by\rVert^2 = ?$`, back: md`$2X\T(X\bw - \by)$, a vector of the shape of $\bw$.` },
        { id: 'calc01-3-c3', kind: 'cloze', text: md`A twice-differentiable function is convex exactly when its Hessian is positive {{}} everywhere.`, answers: ['semidefinite'] },
        { id: 'calc01-3-c4', kind: 'compute', front: md`At a critical point the Hessian has eigenvalues $3$ and $-1$. Enter the number of directions (eigenvectors) along which $f$ curves downward.`, answer: { kind: 'number', value: 1 }, back: md`One negative eigenvalue: one downward direction, so the point is a saddle.` },
        { id: 'calc01-3-c5', kind: 'concept', front: md`Why use the central difference $\frac{f(x+h) - f(x-h)}{2h}$ for gradient checking?`, back: md`Its error is $O(h^2)$, versus $O(h)$ for the one-sided difference, so it agrees with a correct analytic gradient to many more digits.` },
      ],
    },
  ],
  problems: [
    {
      id: 'calc01-p1',
      title: 'A gradient in three variables',
      type: 'compute',
      difficulty: 1,
      minutes: 5,
      statement: md`Compute $\nabla f(1, 2, 0)$ for $f(x, y, z) = xy^2 + x e^{z}$.`,
      solution: [
        md`$\pd{f}{x} = y^2 + e^z$, $\pd{f}{y} = 2xy$, $\pd{f}{z} = x e^z$.`,
        md`At $(1, 2, 0)$: $(4 + 1,\ 4,\ 1) = (5, 4, 1)$.`,
      ],
      answer: { kind: 'vector', value: [5, 4, 1] },
    },
    {
      id: 'calc01-p2',
      title: 'Rate of change toward a point',
      type: 'compute',
      difficulty: 1,
      minutes: 6,
      statement: md`Let $f(x, y) = x^2 - xy + 3y$. At $\bp = (2, 1)$, find the rate of change of $f$ when moving straight toward the point $(5, 5)$.`,
      hints: [md`The direction is $(5, 5) - (2, 1) = (3, 4)$; normalize it.`],
      solution: [
        md`$\nabla f = (2x - y,\ -x + 3)$, so $\nabla f(2, 1) = (3, 1)$.`,
        md`Direction: $(3, 4)/5 = (0.6, 0.8)$.`,
        md`$D_\bu f = 3(0.6) + 1(0.8) = 1.8 + 0.8 = 2.6$.`,
      ],
      answer: { kind: 'number', value: 2.6 },
    },
    {
      id: 'calc01-p3',
      title: 'A Jacobian with more outputs than inputs',
      type: 'compute',
      difficulty: 1,
      minutes: 6,
      statement: md`Let $F(x, y) = (xy,\ x^2 + y^2,\ x - y)$. State the shape of $J_F$ and compute $J_F(1, 2)$.`,
      solution: [
        md`Three outputs and two inputs, so $J_F$ is $3 \times 2$.`,
        md`Rows are the gradients of the outputs: $(y, x)$, $(2x, 2y)$, $(1, -1)$.`,
        md`At $(1, 2)$: $J_F = \begin{bmatrix} 2 & 1 \\ 2 & 4 \\ 1 & -1 \end{bmatrix}$.`,
      ],
      answer: { kind: 'matrix', value: [[2, 1], [2, 4], [1, -1]] },
    },
    {
      id: 'calc01-p4',
      title: 'The gradient of the logistic loss',
      type: 'derive',
      difficulty: 2,
      minutes: 15,
      statement: md`For one example $(\bx, y)$ with $y \in \{0, 1\}$, logistic regression predicts $p = \sigma(\bw\T\bx)$ and uses the loss $$\ell(\bw) = -\big[y\log p + (1 - y)\log(1 - p)\big].$$ Show that $\nabla_\bw\ell = (p - y)\,\bx$.`,
      hints: [md`Let $z = \bw\T\bx$. First show $\partial\ell/\partial z = p - y$ using $\sigma'(z) = \sigma(z)(1 - \sigma(z))$, then use $\nabla_\bw z = \bx$.`],
      solution: [
        md`Write $z = \bw\T\bx$ and $p = \sigma(z)$. By the chain rule, $\nabla_\bw\ell = \dfrac{d\ell}{dp}\,\dfrac{dp}{dz}\,\nabla_\bw z$.`,
        md`$\dfrac{d\ell}{dp} = -\dfrac{y}{p} + \dfrac{1 - y}{1 - p}$.`,
        md`$\dfrac{dp}{dz} = p(1 - p)$. Multiply: $\dfrac{d\ell}{dz} = -y(1 - p) + (1 - y)p = p - y$.`,
        md`$\nabla_\bw z = \bx$ (gradient of a linear form), so $\nabla_\bw\ell = (p - y)\,\bx$.`,
        md`Interpretation: the gradient is the prediction error times the input. The $p(1-p)$ factor from the sigmoid cancels, so the gradient does not vanish when the model is confidently wrong. Lesson 3.1 shows the same cancellation for softmax.`,
      ],
      rubric: [md`Introduces $z$ and applies the chain rule in the right order`, md`Correct $d\ell/dp$`, md`Uses $\sigma' = \sigma(1 - \sigma)$ and simplifies to $p - y$`, md`Uses $\nabla_\bw(\bw\T\bx) = \bx$`],
      areas: ['math', 'ml-depth'],
    },
    {
      id: 'calc01-p5',
      title: 'Ridge regression is strictly convex',
      type: 'proof',
      difficulty: 2,
      minutes: 12,
      statement: md`Let $L(\bw) = \lVert X\bw - \by\rVert^2 + \lambda\lVert\bw\rVert^2$ with $\lambda > 0$. Compute $\nabla L$ and the Hessian, prove the Hessian is positive definite for **every** $X$, and give the unique minimizer.`,
      hints: [md`$\lambda\lVert\bw\rVert^2 = \lambda\,\bw\T I\bw$.`],
      solution: [
        md`$\nabla L = 2X\T(X\bw - \by) + 2\lambda\bw$, using $\nabla(\bw\T\bw) = 2\bw$.`,
        md`$H = 2X\T X + 2\lambda I$.`,
        md`For $\bv \ne \bzero$: $\bv\T H\bv = 2\lVert X\bv\rVert^2 + 2\lambda\lVert\bv\rVert^2 \ge 2\lambda\lVert\bv\rVert^2 > 0$. So $H$ is positive definite even when $X$ has dependent columns.`,
        md`A strictly convex function has at most one minimizer. Setting $\nabla L = \bzero$: $(X\T X + \lambda I)\bw = X\T\by$, and $X\T X + \lambda I$ is invertible because it is positive definite, so $\bw^* = (X\T X + \lambda I)^{-1}X\T\by$.`,
      ],
      rubric: [md`Correct gradient and Hessian including the $2\lambda$ terms`, md`Lower bound $\bv\T H\bv \ge 2\lambda\lVert\bv\rVert^2$`, md`Concludes invertibility and uniqueness`, md`Closed-form minimizer`],
      areas: ['math', 'ml-depth'],
    },
    {
      id: 'calc01-p6',
      title: 'Classifying critical points',
      type: 'compute',
      difficulty: 2,
      minutes: 12,
      statement: md`Find and classify all critical points of $f(x, y) = x^3 + y^3 - 3xy$. Enter the coordinates of the local minimum.`,
      hints: [md`$\nabla f = (3x^2 - 3y,\ 3y^2 - 3x)$. Setting both to zero gives $y = x^2$ and $x = y^2$.`],
      solution: [
        md`$\nabla f = \bzero$ gives $y = x^2$ and $x = y^2$, so $x = x^4$, i.e. $x(x^3 - 1) = 0$: $x = 0$ or $x = 1$. Critical points $(0, 0)$ and $(1, 1)$.`,
        md`$H = \begin{bmatrix} 6x & -3 \\ -3 & 6y \end{bmatrix}$.`,
        md`At $(0, 0)$: $H = \begin{bmatrix} 0 & -3 \\ -3 & 0\end{bmatrix}$ with eigenvalues $\pm 3$: a saddle.`,
        md`At $(1, 1)$: $H = \begin{bmatrix} 6 & -3 \\ -3 & 6\end{bmatrix}$ with eigenvalues $3$ and $9$: a local minimum, with $f(1, 1) = -1$. It is not global: $f(x, 0) = x^3 \to -\infty$.`,
      ],
      answer: { kind: 'vector', value: [1, 1] },
    },
    {
      id: 'calc01-p7',
      title: 'A second-order estimate',
      type: 'compute',
      difficulty: 2,
      minutes: 8,
      statement: md`Use the second-order Taylor expansion of $f(x, y) = e^x\cos y$ at $(0, 0)$ to estimate $f(0.1, 0.2)$.`,
      solution: [
        md`$f(0, 0) = 1$. $\nabla f = (e^x\cos y,\ -e^x\sin y)$, so $\nabla f(0, 0) = (1, 0)$.`,
        md`$H = \begin{bmatrix} e^x\cos y & -e^x\sin y \\ -e^x\sin y & -e^x\cos y \end{bmatrix}$, so $H(0,0) = \diag(1, -1)$.`,
        md`With $\Delta = (0.1, 0.2)$: $1 + 0.1 + \tfrac12(0.01 - 0.04) = 1.085$.`,
        md`The true value is $e^{0.1}\cos 0.2 \approx 1.0831$. The first-order estimate $1.1$ is off by about $0.017$, the second-order one by about $0.002$.`,
      ],
      answer: { kind: 'number', value: 1.085 },
    },
    {
      id: 'calc01-p8',
      title: 'Backpropagation through a tiny network',
      type: 'apply',
      difficulty: 2,
      minutes: 10,
      statement: md`A one-hidden-unit network computes $h = \relu(w_1x)$, $\hat y = w_2h$, with loss $L = \tfrac12(\hat y - y)^2$. At $x = 2$, $w_1 = 1.5$, $w_2 = -1$, $y = 1$, run the forward and backward passes. Enter $[\partial L/\partial w_1, \partial L/\partial w_2]$.`,
      solution: [
        md`Forward: $w_1x = 3$, $h = \relu(3) = 3$, $\hat y = -3$, $L = \tfrac12(-4)^2 = 8$.`,
        md`$\bar{\hat y} = \hat y - y = -4$. Then $\partial L/\partial w_2 = \bar{\hat y}\,h = -12$ and $\bar h = \bar{\hat y}\,w_2 = 4$.`,
        md`$\relu'(3) = 1$, so the adjoint of $w_1x$ is $4$, and $\partial L/\partial w_1 = 4x = 8$.`,
        md`If $w_1x$ had been negative, $\relu' = 0$ would have blocked the gradient to $w_1$ completely: the "dead ReLU" effect.`,
      ],
      answer: { kind: 'vector', value: [8, -12] },
      areas: ['math', 'ml-depth'],
    },
    {
      id: 'calc01-p9',
      title: 'Choosing an autodiff mode',
      type: 'concept',
      difficulty: 1,
      minutes: 5,
      statement: md`You need the full Jacobian of $F: \R^{4} \to \R^{500}$. How many passes does forward mode need, and how many does reverse mode need? Which mode do you choose? Enter the mode.`,
      solution: [
        md`Forward mode produces one column $J\be_j$ per pass: 4 passes.`,
        md`Reverse mode produces one row $\be_i\T J$ per pass: 500 passes.`,
        md`Choose forward mode. Reverse mode is the right choice for the opposite shape, many inputs and few outputs, such as a scalar loss.`,
      ],
      answer: { kind: 'text', value: ['forward', 'forward mode'] },
    },
    {
      id: 'calc01-p10',
      title: 'Vectorized gradient of mean squared error',
      type: 'code-on-paper',
      difficulty: 2,
      minutes: 10,
      statement: md`Write, on paper, NumPy code for the loss $L(\bw, b) = \frac1n\lVert X\bw + b\mathbf{1} - \by\rVert^2$ and its gradients $\nabla_\bw L$ and $\partial L/\partial b$, with no Python loops. $X$ has shape \`(n, d)\`. State the shape of every intermediate array, and describe how you would test the gradients.`,
      solution: [
        md`Residual: \`r = X @ w + b - y\`, shape \`(n,)\`. Loss: \`L = r @ r / n\`, a scalar.`,
        md`$\nabla_\bw L = \frac2n X\T\br$: \`gw = 2 * X.T @ r / n\`, shape \`(d,)\`, the shape of \`w\`.`,
        md`$\partial L/\partial b = \frac2n\sum_i r_i$: \`gb = 2 * r.sum() / n\`, a scalar, the shape of \`b\`. Broadcasting $b$ to every row is why its gradient is a sum over rows.`,
        md`Test: compare with central differences on a small random problem in float64, using the relative error $\lVert g_{num} - g\rVert/\lVert g_{num} + g\rVert$ (below about $10^{-7}$ is a pass).`,
      ],
      rubric: [md`Residual and loss vectorized correctly, including the $1/n$`, md`Gradient with respect to $\bw$ uses $X\T$ times the residual`, md`Gradient with respect to $b$ is a sum over examples, explained by broadcasting`, md`A concrete gradient-check plan`],
      areas: ['ml-coding'],
    },
  ],
};
