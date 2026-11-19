import { md, type Module } from '../types';

export const MODULE: Module = {
  id: 'dl01',
  part: 'dl',
  order: 1,
  title: 'Neural networks and backpropagation',
  summary: 'From one neuron to multilayer perceptrons, the chain rule on a computational graph, the matrix form of backpropagation, and making a two-layer network train in NumPy.',
  relevance: md`Every feed-forward block in a transformer is a two-layer MLP, and \`loss.backward()\` in PyTorch or JAX's \`grad\` runs exactly the reverse-mode algorithm derived here. ML interviews routinely ask you to derive the gradients of a two-layer network with softmax cross-entropy, to implement the forward and backward pass in NumPy without a framework, and to explain vanishing gradients and why ReLU networks use He initialization. When a model in production stops learning, these are the mechanics you debug.`,
  areas: ['ml-depth', 'ml-coding', 'math'],
  prereqs: ['la01'],
  lessons: [
    // ------------------------------------------------------------------ 1.1
    {
      id: 'dl01-1',
      title: 'From linear models to multilayer perceptrons',
      minutes: 35,
      objectives: [
        'Write a fully connected layer on a batch as $H = \\varphi(XW\\T + \\bb)$ and give the shape of every array.',
        'Evaluate ReLU, GELU, sigmoid and tanh and their derivatives at a point.',
        'Prove that a stack of affine layers without activations is a single affine layer.',
        'Count the parameters of an MLP from its layer sizes.',
        'Explain how a sum of ReLU units approximates a continuous function, and what the universal approximation theorem does not promise.',
      ],
      cells: [
        {
          kind: 'text',
          md: md`Logistic regression computes $p = \sigma(\bw\T\bx + b)$. Its decision boundary $\bw\T\bx + b = 0$ is a straight line (a hyperplane in higher dimensions), so it cannot separate classes arranged as XOR: positive examples in the first and third quadrants, negative ones in the second and fourth. No line puts both positive quadrants on one side and both negative quadrants on the other.

A neural network fixes this by first computing new features from the input and then applying a linear model to those features. Each new feature is a **neuron**: an affine function of the inputs followed by a fixed nonlinear function $\varphi$, $$h = \varphi(\bw\T\bx + b).$$ Logistic regression is the special case of a single neuron with $\varphi = \sigma$. A **multilayer perceptron** (MLP) stacks layers of neurons, each layer reading the previous layer's outputs.`,
        },
        {
          kind: 'callout',
          tone: 'definition',
          title: 'Fully connected layer on a batch',
          md: md`A layer with $n_{\text{in}}$ inputs and $n_{\text{out}}$ outputs has a weight matrix $W \in \R^{n_{\text{out}}\times n_{\text{in}}}$ (row $i$ holds the weights of neuron $i$) and a bias $\bb \in \R^{n_{\text{out}}}$. For one input, $\bh = \varphi(W\bx + \bb)$. For a batch stored as rows, $X \in \R^{B \times n_{\text{in}}}$,
$$H = \varphi(XW\T + \bb) \in \R^{B\times n_{\text{out}}},$$
where $\bb$ is added to every row (broadcasting) and $\varphi$ acts on each entry. Row $k$ of $H$ is the layer's output for example $k$. PyTorch's \`nn.Linear\` stores its weight with this $(n_{\text{out}}, n_{\text{in}})$ shape.`,
        },
        {
          kind: 'callout',
          tone: 'notation',
          md: md`Shapes for one layer: $X$ is $B \times n_{\text{in}}$, $W\T$ is $n_{\text{in}} \times n_{\text{out}}$, so $XW\T$ is $B \times n_{\text{out}}$; $\bb$ has $n_{\text{out}}$ entries. The layer has $n_{\text{in}}n_{\text{out}} + n_{\text{out}}$ parameters. A two-layer network is $H = \varphi(XW_1\T + \bb_1)$, then $Z = HW_2\T + \bb_2$; the output layer usually has no $\varphi$ because the loss applies its own (softmax for classes).`,
        },
        {
          kind: 'numeric',
          q: md`A ReLU layer has $W = \begin{bmatrix} 1 & -1 \\ 0.5 & 2 \end{bmatrix}$ and $\bb = (0.5, -4)$. Compute $\bh = \relu(W\bx + \bb)$ for $\bx = (2, 1)$.`,
          answer: { kind: 'vector', value: [1.5, 0] },
          hints: [md`Row 1: $1\cdot 2 + (-1)\cdot 1 + 0.5$. Row 2: $0.5 \cdot 2 + 2 \cdot 1 - 4$.`],
          explain: md`$W\bx + \bb = (2 - 1 + 0.5,\ 1 + 2 - 4) = (1.5, -1)$. ReLU keeps the positive entry and zeroes the negative one: $\bh = (1.5, 0)$. The second neuron is **inactive** for this input.`,
        },
        {
          kind: 'check',
          q: md`A batch of 32 flattened MNIST images ($28 \times 28 = 784$ pixels) enters a layer with 256 units. Which shapes are right?`,
          options: [md`$W$: $256 \times 784$, output $H$: $32 \times 256$`, md`$W$: $784 \times 256$, output $H$: $256 \times 32$`, md`$W$: $256 \times 784$, output $H$: $256 \times 32$`, md`$W$: $32 \times 256$, output $H$: $32 \times 784$`],
          answer: 0,
          explain: md`$W$ is $n_{\text{out}} \times n_{\text{in}} = 256 \times 784$. Then $XW\T$ is $(32 \times 784)(784 \times 256) = 32 \times 256$: one row of 256 features per image. The batch size never appears in the weight shape.`,
        },
        {
          kind: 'viz',
          viz: { type: 'dl.activations', act: 'sigmoid', z: 1 },
          task: md`For the sigmoid, drag the point to find where the dashed derivative is largest and read its value. Switch to **all φ′** and compare the four derivatives at $z = 0$ and at $z = 3$.`,
          caption: md`Solid: the activation. Dashed: its derivative. Red: the tangent line at the dragged point, whose slope is $\varphi'(z)$. The sigmoid's slope never exceeds $1/4$; tanh reaches 1 at the origin; ReLU and GELU keep a slope near 1 for every large positive input.`,
        },
        {
          kind: 'callout',
          tone: 'definition',
          title: 'Four activations and their derivatives',
          md: md`| name | $\varphi(z)$ | $\varphi'(z)$ | range |
|---|---|---|---|
| ReLU | $\max(0, z)$ | $1$ if $z > 0$, $0$ if $z < 0$ | $[0, \infty)$ |
| sigmoid | $\sigma(z) = \dfrac{1}{1 + e^{-z}}$ | $\sigma(z)(1 - \sigma(z))$ | $(0, 1)$ |
| tanh | $\tanh z$ | $1 - \tanh^2 z$ | $(-1, 1)$ |
| GELU | $z\,\Phi(z)$ | $\Phi(z) + z\,\varphi_{\mathcal N}(z)$ | $\approx[-0.17, \infty)$ |

$\Phi$ and $\varphi_{\mathcal N}$ are the standard normal CDF and density. ReLU is the default in convolutional networks. GELU was used in BERT and GPT-2; many 2026 LLMs use SwiGLU, a gated variant built from the swish function $z\,\sigma(z)$. Sigmoid and tanh now appear mostly inside gates (LSTM, GRU, gated linear units) and output layers.`,
        },
        {
          kind: 'numeric',
          q: md`Compute $\sigma'(\ln 3)$ exactly. Use $\sigma(\ln 3) = \dfrac{1}{1 + e^{-\ln 3}}$.`,
          answer: { kind: 'number', value: 0.1875 },
          inputHint: 'a fraction is fine, e.g. 3/16',
          explain: md`$e^{-\ln 3} = 1/3$, so $\sigma(\ln 3) = \dfrac{1}{1 + 1/3} = \dfrac34$. Then $\sigma' = \sigma(1 - \sigma) = \dfrac34\cdot\dfrac14 = \dfrac{3}{16} = 0.1875$.`,
        },
        {
          kind: 'derive',
          title: 'stacked linear layers collapse to one',
          goal: md`Show that $\by = W_2(W_1\bx + \bb_1) + \bb_2$ is an affine function of $\bx$, so depth without an activation adds no expressive power.`,
          steps: [
            {
              md: md`Expand the product using distributivity of matrix multiplication: $$\by = W_2W_1\bx + W_2\bb_1 + \bb_2.$$`,
              choose: {
                prompt: md`What is the first move?`,
                options: [md`Multiply $W_2$ into the bracket`, md`Invert $W_1$`, md`Take the derivative with respect to $\bx$`],
                answer: 0,
                explain: md`Matrix multiplication distributes over addition: $W_2(\bu + \bv) = W_2\bu + W_2\bv$. No inverse is needed (and $W_1$ need not be square).`,
              },
            },
            { md: md`Name the pieces: $W = W_2W_1$ and $\bb = W_2\bb_1 + \bb_2$. Then $\by = W\bx + \bb$, a single affine layer.` },
            { md: md`By induction the same holds for any number of layers. The decision boundary of the stack is still a hyperplane, so XOR stays out of reach. The rank of $W_2W_1$ is at most the smallest layer width, so a narrow middle layer can only make the collapsed map *less* expressive.` },
          ],
          takeaway: md`The nonlinearity is what makes depth useful. Without it, a 100-layer network is one matrix and one bias vector.`,
        },
        {
          kind: 'code',
          code: `import numpy as np

np.random.seed(1)
W1, b1 = np.random.randn(4, 2), np.random.randn(4)
W2, b2 = np.random.randn(1, 4), np.random.randn(1)
x = np.array([0.5, -1.0])

two_layers = W2 @ (W1 @ x + b1) + b2       # no activation in between
W, b = W2 @ W1, W2 @ b1 + b2               # one equivalent affine layer
print(np.allclose(two_layers, W @ x + b))`,
          predict: {
            q: md`The code builds the collapsed layer from the derivation. What does it print?`,
            options: ['`True`', '`False`', '`[ True]`', 'an error: the shapes do not match'],
            answer: 0,
            explain: md`$W = W_2W_1$ is $1\times 2$ and $\bb = W_2\bb_1 + \bb_2$ has one entry, so $W\bx + \bb$ equals the two-layer output up to rounding. \`np.allclose\` returns a single Python-level boolean.`,
          },
        },
        {
          kind: 'viz',
          viz: { type: 'dl.playground', dataset: 'xor', layers: 0, units: 4, lr: 0.3, act: 'tanh' },
          task: md`On XOR with **0 hidden layers** (logistic regression), press Play for a few hundred epochs and note the loss. Then set one hidden layer with 4 units and press Reset and Play. Finally try the **spiral** with 1 layer of 8 units, then 2 layers of 8.`,
          caption: md`Colour shows the predicted probability of the orange class. With no hidden layer the boundary is a straight line and the loss stays near $0.68$, close to $\ln 2 \approx 0.693$, the loss of answering 0.5 everywhere. Four tanh units bend the boundary and solve XOR. The spiral needs two hidden layers in this setup, and a learning rate near 3 makes the loss jump around instead of falling.`,
        },
        {
          kind: 'callout',
          tone: 'intuition',
          title: 'Why sums of ReLUs can fit any curve',
          md: md`A ReLU unit $\relu(x - c)$ is a hinge: zero to the left of $c$, a line of slope 1 to the right. Adding hinges with weights $w_k$ gives a polyline whose slope changes by $w_k$ at each $c_k$. With enough hinges, a polyline follows any continuous curve as closely as you like.`,
        },
        {
          kind: 'callout',
          tone: 'theorem',
          title: 'Universal approximation (informal)',
          md: md`Let $\varphi$ be continuous and not a polynomial (ReLU, sigmoid, tanh and GELU all qualify). For every continuous $f$ on a closed bounded set $K \subset \R^d$ and every $\varepsilon > 0$, there is a network with **one** hidden layer, $\hat f(\bx) = \sum_{k=1}^{n} a_k\,\varphi(\bw_k\T\bx + b_k)$, with $|\hat f(\bx) - f(\bx)| < \varepsilon$ for all $\bx \in K$ (Cybenko 1989 for sigmoids; Leshno et al. 1993 in this generality).

The theorem says nothing about how large $n$ must be, which can grow exponentially with $d$, nor whether gradient descent will find the weights, nor how the network behaves outside $K$. In practice deeper networks reach the same accuracy with far fewer units.`,
        },
        {
          kind: 'viz',
          viz: { type: 'dl.relufit', target: 'sin', n: 3 },
          task: md`Raise the number of units from 3 to 12 for **sin 3x** and watch the maximum error. Then pick **near-step**: how many units does it take before the error falls below 0.1, and where would you rather place the hinges?`,
          caption: md`The construction puts the hinges at evenly spaced points and sets each output weight to the change of slope there, so the network interpolates the target at the knots. Training would instead move the hinges to where the curve bends most, which is why the near-step needs so many evenly spaced units.`,
        },
        {
          kind: 'paper',
          problem: {
            id: 'dl01-1-paper',
            title: 'Parameters of an MNIST MLP',
            type: 'compute',
            difficulty: 1,
            minutes: 6,
            statement: md`An MLP for MNIST has layer sizes $784 \to 256 \to 128 \to 10$ (two hidden layers with biases, and an output layer with biases). Count its parameters. Then say which layer holds most of them and why.`,
            hints: [md`A layer from $n_{\text{in}}$ to $n_{\text{out}}$ has $n_{\text{in}}n_{\text{out}}$ weights and $n_{\text{out}}$ biases.`],
            solution: [
              md`Layer 1: $784 \cdot 256 + 256 = 200{,}704 + 256 = 200{,}960$.`,
              md`Layer 2: $256 \cdot 128 + 128 = 32{,}768 + 128 = 32{,}896$.`,
              md`Layer 3: $128 \cdot 10 + 10 = 1{,}290$.`,
              md`Total: $200{,}960 + 32{,}896 + 1{,}290 = 235{,}146$. The first layer holds about 85% because the parameter count of a dense layer is the **product** of its widths, and the input is by far the widest.`,
            ],
            answer: { kind: 'number', value: 235146 },
          },
        },
        {
          kind: 'code',
          code: `import numpy as np

np.random.seed(0)
X = np.random.randn(4, 3)            # batch of 4 examples, 3 features each
W1 = np.random.randn(5, 3) * 0.5     # layer 1: 3 -> 5
b1 = np.zeros(5)
W2 = np.random.randn(2, 5) * 0.5     # layer 2: 5 -> 2
b2 = np.zeros(2)

H = np.maximum(0, X @ W1.T + b1)     # (4, 3) @ (3, 5) -> (4, 5)
out = H @ W2.T + b2                  # (4, 5) @ (5, 2) -> (4, 2)
print(out.shape)`,
          predict: {
            q: md`What shape is printed?`,
            options: ['`(4, 2)`', '`(2, 4)`', '`(4, 5)`', '`(5, 2)`'],
            answer: 0,
            explain: md`Each layer maps the feature dimension and keeps the batch dimension: $4 \times 3 \to 4 \times 5 \to 4 \times 2$. \`np.maximum(0, ·)\` is ReLU applied entry by entry.`,
          },
          note: md`Change \`W2\` to shape \`(2, 4)\` and re-run: the error message names the mismatched inner dimensions. Reading such messages quickly is half of debugging a model.`,
        },
        {
          kind: 'recall',
          prompt: md`Without looking back: why does an MLP need a nonlinear activation, and what does the universal approximation theorem guarantee and not guarantee?`,
          answer: md`Without $\varphi$, the composition of affine layers is affine ($W_2W_1\bx + W_2\bb_1 + \bb_2$), so depth adds nothing and the decision boundary stays a hyperplane. The theorem guarantees that one hidden layer with enough units can approximate any continuous function on a bounded set to any accuracy. It does not say how many units are needed, whether training will find the weights, or how well the network generalizes.`,
        },
      ],
      cards: [
        { id: 'dl01-1-c1', kind: 'concept', front: md`Write a fully connected layer on a batch and give the shapes.`, back: md`$H = \varphi(XW\T + \bb)$ with $X: B\times n_{\text{in}}$, $W: n_{\text{out}}\times n_{\text{in}}$, $\bb: n_{\text{out}}$, $H: B\times n_{\text{out}}$.` },
        { id: 'dl01-1-c2', kind: 'cloze', text: md`The derivative of the sigmoid is $\sigma(z)(1-\sigma(z))$, and its maximum value is {{}}.`, answers: ['1/4'] },
        { id: 'dl01-1-c3', kind: 'compute', front: md`Parameters of a dense layer from 512 to 256 units, with bias.`, answer: { kind: 'number', value: 131328 }, back: md`$512 \cdot 256 + 256 = 131{,}072 + 256 = 131{,}328$.` },
        { id: 'dl01-1-c4', kind: 'concept', front: md`Why is a deep network without activations no better than a linear model?`, back: md`$W_2(W_1\bx + \bb_1) + \bb_2 = (W_2W_1)\bx + (W_2\bb_1 + \bb_2)$: the stack collapses to one affine map.` },
        { id: 'dl01-1-c5', kind: 'cloze', text: md`The derivative of ReLU is 1 for positive inputs and {{}} for negative inputs.`, answers: ['0'] },
      ],
    },
    // ------------------------------------------------------------------ 1.2
    {
      id: 'dl01-2',
      title: 'Backpropagation',
      minutes: 40,
      objectives: [
        'Run the forward and backward pass on a computational graph by hand, multiplying upstream gradients by local gradients and summing over paths.',
        'Derive $\\partial L/\\partial \\bz = \\bp - \\by$ for softmax with cross-entropy.',
        'Write the matrix-form gradients of a two-layer network: the $\\boldsymbol\\delta$ terms, $\\partial L/\\partial W = \\boldsymbol\\delta\\,\\bh\\T$, and their batch versions.',
        'Check an analytic gradient with central finite differences and interpret the relative error.',
      ],
      cells: [
        {
          kind: 'text',
          md: md`Training needs $\partial L/\partial\theta$ for every parameter $\theta$, often hundreds of millions of them, at every step. Computing each partial derivative separately would cost one forward pass per parameter. **Backpropagation** gets all of them in one backward sweep whose cost is a small constant multiple of the forward pass. It is the chain rule from the matrix-calculus module, applied in a particular order: from the loss back towards the inputs, reusing every intermediate result. Frameworks call it reverse-mode automatic differentiation.`,
        },
        {
          kind: 'callout',
          tone: 'definition',
          title: 'Computational graph, local and upstream gradients',
          md: md`Write the computation as a graph: each node computes a simple function of its inputs. In the **forward pass** evaluate the nodes in order and store their values. In the **backward pass** start from $\partial L/\partial L = 1$ and visit nodes in reverse. For a node $u = g(a, b)$:
$$\underbrace{\pd{L}{a}}_{\text{downstream}} \mathrel{+}= \underbrace{\pd{L}{u}}_{\text{upstream}}\cdot\underbrace{\pd{u}{a}}_{\text{local}}.$$
The local gradient depends only on the node's own inputs, which the forward pass saved. If a value feeds several nodes, its gradient is the **sum** of the contributions along every outgoing edge (the multivariable chain rule).`,
        },
        {
          kind: 'viz',
          viz: { type: 'dl.chaingraph', graph: 'shared' },
          task: md`Step through the forward pass, then the backward pass. Stop when the gradient reaches $x$ the first time and predict its final value before the second contribution arrives. Then change the inputs and check $\partial f/\partial x = 2xy + z$.`,
          caption: md`A multiplication node passes the upstream gradient to each input times the **other** input; an addition node passes it unchanged. Because $f = (xy + z)\,x$ uses $x$ twice, $\partial f/\partial x$ collects $y\cdot\partial f/\partial a$ through $a$ and $b$ through the final product.`,
        },
        {
          kind: 'check',
          q: md`In the graph above, with $x = 2$, $y = -1$, $z = 3$, the two contributions to $\partial f/\partial x$ are $-2$ (through $a = xy$) and $1$ (through $f = b\cdot x$). What is $\partial f/\partial x$?`,
          options: [md`$-1$, the sum`, md`$-2$, the first path only`, md`$1$, the last path computed`, md`$-2$, the product`],
          answer: 0,
          explain: md`Gradients from different paths add. Directly: $f = x^2y + zx$, so $\partial f/\partial x = 2xy + z = -4 + 3 = -1$. Overwriting instead of accumulating is a classic bug in hand-written backward passes, and the reason PyTorch accumulates into \`.grad\` until you zero it.`,
        },
        {
          kind: 'numeric',
          q: md`Let $u = 3x + y$ and $f = u^2$. Run the backward pass by hand at $x = 1$, $y = -1$ and give $\partial f/\partial x$.`,
          answer: { kind: 'number', value: 12 },
          explain: md`Forward: $u = 2$, $f = 4$. Backward: $\partial f/\partial u = 2u = 4$; the local gradient $\partial u/\partial x = 3$; so $\partial f/\partial x = 4 \cdot 3 = 12$.`,
        },
        {
          kind: 'callout',
          tone: 'theorem',
          title: 'Backpropagation for a two-layer network (one example)',
          md: md`Forward: $\bz_1 = W_1\bx + \bb_1$, $\bh = \varphi(\bz_1)$, $\bz_2 = W_2\bh + \bb_2$, then the loss $L(\bz_2)$. Define the error signals $\boldsymbol\delta_2 = \partial L/\partial\bz_2$ and $\boldsymbol\delta_1 = \partial L/\partial\bz_1$ (column vectors). Then
$$\pd{L}{W_2} = \boldsymbol\delta_2\,\bh\T, \qquad \pd{L}{\bb_2} = \boldsymbol\delta_2, \qquad \boldsymbol\delta_1 = \left(W_2\T\boldsymbol\delta_2\right)\odot\varphi'(\bz_1),$$
$$\pd{L}{W_1} = \boldsymbol\delta_1\,\bx\T, \qquad \pd{L}{\bb_1} = \boldsymbol\delta_1.$$
For softmax with cross-entropy, $\boldsymbol\delta_2 = \bp - \by$; for squared error $\tfrac12(\hat y - y)^2$ with a linear output, $\delta_2 = \hat y - y$. Every gradient has the same shape as the thing it is a gradient of.`,
        },
        {
          kind: 'derive',
          title: 'why ∂L/∂W is an outer product',
          goal: md`For $\bz = W\bh + \bb$ with upstream gradient $\boldsymbol\delta = \partial L/\partial\bz$, show $\partial L/\partial W = \boldsymbol\delta\bh\T$ and $\partial L/\partial\bh = W\T\boldsymbol\delta$.`,
          steps: [
            { md: md`Write one output: $z_i = \sum_j W_{ij}h_j + b_i$. So $\dfrac{\partial z_i}{\partial W_{ij}} = h_j$, and $W_{ij}$ appears in no other $z_{i'}$.` },
            {
              md: md`Chain rule through the single path: $$\pd{L}{W_{ij}} = \pd{L}{z_i}\pd{z_i}{W_{ij}} = \delta_i\,h_j.$$ The matrix with entries $\delta_ih_j$ is the outer product $\boldsymbol\delta\bh\T$.`,
              choose: {
                prompt: md`$W_{ij}$ affects the loss through which outputs?`,
                options: [md`Only $z_i$`, md`Every $z_k$`, md`Only $z_j$`],
                answer: 0,
                explain: md`Row $i$ of $W$ belongs to neuron $i$. Changing $W_{ij}$ changes $z_i$ alone, so the sum over paths has one term.`,
              },
            },
            {
              md: md`Now $h_j$ feeds **every** $z_i$ with coefficient $W_{ij}$, so its gradient sums over $i$: $$\pd{L}{h_j} = \sum_i \delta_i W_{ij} = (W\T\boldsymbol\delta)_j.$$`,
              choose: {
                prompt: md`How many paths connect $h_j$ to the loss?`,
                options: [md`One per output $z_i$, and they add`, md`Exactly one`, md`None; $h_j$ is not a parameter`],
                answer: 0,
                explain: md`A value used by several nodes collects the sum of their contributions, exactly as $x$ did in the graph figure.`,
              },
            },
            { md: md`Finally $\bh = \varphi(\bz_1)$ acts entry by entry, so its Jacobian is diagonal and $\boldsymbol\delta_1 = (W\T\boldsymbol\delta)\odot\varphi'(\bz_1)$.` },
          ],
          takeaway: md`Backprop through a linear layer multiplies by $W\T$; backprop through an activation multiplies entry-wise by $\varphi'$. The weight gradient pairs the error at the output with the activity at the input.`,
        },
        {
          kind: 'viz',
          viz: { type: 'dl.backprop', x: [1, 2], W1: [[1, 1], [1, -1]], b1: [0, 0], W2: [2, -1], b2: -1, y: 4, act: 'relu', loss: 'mse', lr: 0.05 },
          task: md`Step through the 13 stages. When the gradient reaches the hidden layer, predict the $\delta$ of the inactive unit $h_2$ before revealing it. After the SGD step, switch the learning rate to 0.1 and compare the new loss with the old one.`,
          caption: md`Forward values sit inside the nodes, weights on the edges ($w$), gradients in red ($g$ on edges, $\delta$ under nodes). $h_2$ has $z = -1$, so ReLU blocks its gradient and its incoming weights get zero gradient. With $\eta = 0.05$ the loss drops from 0.5 to about 0.186; with $\eta = 0.1$ the step overshoots and the loss rises to about 2.08.`,
        },
        {
          kind: 'numeric',
          q: md`In the network of the figure ($\bx = (1, 2)$, $W_1 = \begin{bmatrix}1 & 1\\1 & -1\end{bmatrix}$, $\boldsymbol\delta_1 = (2, 0)$), compute the gradient with respect to the **input**, $\partial L/\partial\bx = W_1\T\boldsymbol\delta_1$.`,
          answer: { kind: 'vector', value: [2, 2] },
          explain: md`$W_1\T\boldsymbol\delta_1 = \begin{bmatrix}1 & 1\\1 & -1\end{bmatrix}\begin{bmatrix}2\\0\end{bmatrix} = (2, 2)$. Input gradients update no weights; adversarial examples and saliency maps are computed from them.`,
        },
        {
          kind: 'derive',
          title: 'softmax with cross-entropy gives p − y',
          goal: md`With $p_k = e^{z_k}/\sum_j e^{z_j}$ and a one-hot target $\by$, show that $L = -\sum_k y_k\ln p_k$ has gradient $\partial L/\partial z_i = p_i - y_i$.`,
          steps: [
            {
              md: md`Take logs of the softmax first: $\ln p_k = z_k - \ln\sum_j e^{z_j}$. This removes the quotient.`,
              choose: {
                prompt: md`Which form of the loss is easiest to differentiate?`,
                options: [md`Substitute $\ln p_k = z_k - \ln\sum_j e^{z_j}$`, md`Differentiate $p_k$ with the quotient rule and keep $1/p_k$`, md`Replace $\ln$ by its Taylor series`],
                answer: 0,
                explain: md`The quotient rule also works (it gives the softmax Jacobian $\diag(\bp) - \bp\bp\T$), but taking logs first turns the loss into a sum of two simple terms.`,
              },
            },
            { md: md`Substitute and use $\sum_k y_k = 1$: $$L = -\sum_k y_kz_k + \Big(\sum_k y_k\Big)\ln\sum_j e^{z_j} = -\sum_k y_kz_k + \ln\sum_j e^{z_j}.$$` },
            {
              md: md`Differentiate with respect to $z_i$. The first term gives $-y_i$. The second gives $\dfrac{e^{z_i}}{\sum_j e^{z_j}} = p_i$ (the log-sum-exp has the softmax as its gradient). So $$\pd{L}{z_i} = p_i - y_i, \qquad \pd{L}{\bz} = \bp - \by.$$`,
              choose: {
                prompt: md`What is $\dfrac{\partial}{\partial z_i}\ln\sum_j e^{z_j}$?`,
                options: [md`$p_i$`, md`$1/\sum_j e^{z_j}$`, md`$z_i$`, md`$1$`],
                answer: 0,
                explain: md`Chain rule: $\dfrac{1}{\sum_j e^{z_j}}\cdot e^{z_i} = p_i$.`,
              },
            },
            { md: md`For a batch with the mean loss, row $k$ of $\partial L/\partial Z$ is $(\bp_k - \by_k)/B$. The same form, prediction minus target, holds for sigmoid with binary cross-entropy and for a linear output with squared error.` },
          ],
          takeaway: md`The gradient is bounded ($|p_i - y_i| \le 1$), points from the prediction to the target, and costs nothing beyond the forward pass. This is why frameworks fuse softmax and cross-entropy into one operation such as \`F.cross_entropy\` on logits.`,
        },
        {
          kind: 'numeric',
          q: md`A 3-class softmax outputs $\bp = (0.7, 0.2, 0.1)$ and the true class is the second one. Give $\partial L/\partial\bz$.`,
          answer: { kind: 'vector', value: [0.7, -0.8, 0.1] },
          explain: md`$\by = (0, 1, 0)$, so $\bp - \by = (0.7, -0.8, 0.1)$. Gradient descent raises the logit of the true class (negative gradient) and lowers the others in proportion to their probability. The entries sum to 0.`,
        },
        {
          kind: 'callout',
          tone: 'remember',
          title: 'Batch form',
          md: md`With examples as rows ($X: B\times D$, $H: B\times n_h$, $Z_2, P, Y: B\times C$) and the mean loss over the batch:
$$\Delta_2 = \tfrac{1}{B}(P - Y), \quad \pd{L}{W_2} = \Delta_2\T H, \quad \pd{L}{\bb_2} = \textstyle\sum_{\text{rows}}\Delta_2,$$
$$\Delta_1 = (\Delta_2W_2)\odot\varphi'(Z_1), \quad \pd{L}{W_1} = \Delta_1\T X, \quad \pd{L}{\bb_1} = \textstyle\sum_{\text{rows}}\Delta_1.$$
$\Delta_2\T H$ adds the per-example outer products $\boldsymbol\delta_2\bh\T$ over the batch in one matrix product.`,
        },
        {
          kind: 'check',
          q: md`In the batch form, $X$ is $64 \times 784$ and $W_1$ is $128 \times 784$. What is the shape of $\Delta_1$, and of $\Delta_1\T X$?`,
          options: [md`$64\times128$ and $128\times784$`, md`$128\times64$ and $64\times784$`, md`$64\times128$ and $784\times128$`, md`$128\times128$ and $128\times784$`],
          answer: 0,
          explain: md`$\Delta_1$ has one row per example and one column per hidden unit, like $Z_1$: $64 \times 128$. Then $(128\times64)(64\times784) = 128\times784$, the shape of $W_1$, as every gradient must be.`,
        },
        {
          kind: 'text',
          md: md`**Gradient checking.** A backward pass written by hand can be wrong in ways that still let the loss decrease slowly. Compare it with a numerical derivative. The **central difference**
$$\frac{f(\theta + \varepsilon) - f(\theta - \varepsilon)}{2\varepsilon} = f'(\theta) + \frac{f'''(\theta)}{6}\varepsilon^2 + O(\varepsilon^4)$$
has error $O(\varepsilon^2)$, much smaller than the $O(\varepsilon)$ error of the forward difference $(f(\theta+\varepsilon) - f(\theta))/\varepsilon$. Perturb one parameter at a time, compare the whole gradient with the **relative error** $\lVert\bg_a - \bg_n\rVert / (\lVert\bg_a\rVert + \lVert\bg_n\rVert)$, and work in float64. As rules of thumb, values around $10^{-7}$ or below indicate a correct gradient and values above $10^{-3}$ indicate a bug. ReLU kinks can cause isolated mismatches when a pre-activation lies within $\varepsilon$ of 0.`,
        },
        {
          kind: 'viz',
          viz: { type: 'dl.gradcheck', fn: 'exp', logEps: -4 },
          task: md`Find the step size that minimizes the error of each formula. Then move $\varepsilon$ to $10^{-12}$ and explain why the error grows again.`,
          caption: md`Both curves are V-shaped. To the right, truncation error dominates (slope 1 for forward, slope 2 for central on this log–log plot). To the left, $f(\theta+\varepsilon)$ and $f(\theta-\varepsilon)$ agree in almost every digit and subtracting them loses precision, an error of order $u/\varepsilon$ with $u \approx 10^{-16}$. The best central step is near $10^{-5}$ in float64; in float32 it is far larger, which is why gradient checks use float64.`,
        },
        {
          kind: 'numeric',
          q: md`Estimate the derivative of $f(x) = x^3$ at $x = 2$ with the central difference and $\varepsilon = 0.1$.`,
          answer: { kind: 'number', value: 12.01 },
          hints: [md`$2.1^3 = 9.261$ and $1.9^3 = 6.859$.`],
          explain: md`$(9.261 - 6.859)/0.2 = 12.01$. The exact value is $12$; the error $0.01 = f'''\varepsilon^2/6 = 6 \cdot 0.01/6$ matches the formula. The forward difference gives $(9.261 - 8)/0.1 = 12.61$, sixty times worse.`,
        },
        {
          kind: 'code',
          code: `import numpy as np

def loss(z, y):                       # softmax + cross-entropy for one example
    z = z - z.max()
    p = np.exp(z) / np.exp(z).sum()
    return -np.log(p[y])

z = np.array([2.0, 1.0, -1.0])
y = 0
p = np.exp(z) / np.exp(z).sum()
analytic = p - np.eye(3)[y]

eps = 1e-5
numeric = np.zeros(3)
for i in range(3):
    e = np.zeros(3)
    e[i] = eps
    numeric[i] = (loss(z + e, y) - loss(z - e, y)) / (2 * eps)

print(np.round(analytic, 6))
print(np.round(numeric, 6))
rel = np.linalg.norm(analytic - numeric) / (np.linalg.norm(analytic) + np.linalg.norm(numeric))
print(rel < 1e-8)`,
          note: md`The analytic gradient $\bp - \by$ and the central differences agree to six decimals, and the relative error is below $10^{-8}$. Introduce a bug, for example \`analytic = p - 0.9 * np.eye(3)[y]\`, and watch the check fail.`,
        },
        {
          kind: 'paper',
          problem: {
            id: 'dl01-2-paper',
            title: 'Sigmoid with binary cross-entropy',
            type: 'derive',
            difficulty: 2,
            minutes: 8,
            statement: md`A binary classifier outputs $p = \sigma(z)$ and is trained with $L = -y\ln p - (1 - y)\ln(1 - p)$, $y \in \{0, 1\}$. Show that $\partial L/\partial z = p - y$. Then explain why squared error $\tfrac12(p - y)^2$ on the sigmoid output learns slowly when the prediction is confidently wrong.`,
            hints: [md`Use $\sigma'(z) = p(1 - p)$ and the chain rule through $p$.`],
            solution: [
              md`$\dfrac{\partial L}{\partial p} = -\dfrac{y}{p} + \dfrac{1 - y}{1 - p}$.`,
              md`Multiply by $\dfrac{\partial p}{\partial z} = p(1-p)$: $\dfrac{\partial L}{\partial z} = -y(1 - p) + (1 - y)p = p - y$.`,
              md`With squared error, $\dfrac{\partial L}{\partial z} = (p - y)\,p(1 - p)$. If $y = 1$ but $z = -10$, then $p \approx 4.5\times10^{-5}$ and the factor $p(1 - p)$ makes the gradient about $-4.5\times10^{-5}$: the unit is saturated and barely moves.`,
              md`Cross-entropy's $\ln$ cancels the sigmoid's flat tail, so the gradient stays close to $-1$ in that case. This is the reason classification uses cross-entropy on logits.`,
            ],
            rubric: [md`Correct $\partial L/\partial p$`, md`Uses $\sigma' = p(1-p)$ and simplifies to $p - y$`, md`Identifies the extra $p(1-p)$ factor for squared error and evaluates it for a saturated unit`],
          },
        },
        {
          kind: 'explain',
          prompt: md`An interviewer asks: *explain backpropagation, and why it is efficient.* Answer in a few sentences, as you would at a whiteboard.`,
          model: md`Backpropagation computes the gradient of a scalar loss with respect to every parameter by applying the chain rule on the computational graph in reverse order. The forward pass evaluates every node and stores its value. The backward pass starts from $\partial L/\partial L = 1$ and, at each node, multiplies the upstream gradient by the node's local Jacobian; when a value feeds several nodes the contributions add. For a linear layer this gives $\partial L/\partial W = \boldsymbol\delta\bh\T$ and passes $W\T\boldsymbol\delta$ backward; activations multiply entry-wise by $\varphi'$. It is efficient because the loss is a scalar: one backward sweep, reusing all intermediate results, gives every partial derivative at a cost of roughly two to three forward passes, instead of one pass per parameter. The price is memory, because activations must be stored for the backward pass.`,
        },
      ],
      cards: [
        { id: 'dl01-2-c1', kind: 'concept', front: md`State the backprop rule at a node $u = g(a, b)$, and what happens when $a$ feeds several nodes.`, back: md`$\partial L/\partial a \mathrel{+}= (\partial L/\partial u)(\partial u/\partial a)$: upstream times local. Contributions from all outgoing edges are summed.` },
        { id: 'dl01-2-c2', kind: 'cloze', text: md`When a value feeds several nodes of the graph, its gradient is the {{}} of the contributions along each path.`, answers: ['sum'] },
        { id: 'dl01-2-c3', kind: 'concept', front: md`For $\bz = W\bh + \bb$ with $\boldsymbol\delta = \partial L/\partial\bz$, give $\partial L/\partial W$ and $\partial L/\partial\bh$.`, back: md`$\partial L/\partial W = \boldsymbol\delta\bh\T$ (outer product), $\partial L/\partial\bh = W\T\boldsymbol\delta$.` },
        { id: 'dl01-2-c4', kind: 'compute', front: md`Central difference for $f(x) = x^2$ at $x = 3$ with $\varepsilon = 0.5$.`, answer: { kind: 'number', value: 6 }, back: md`$(3.5^2 - 2.5^2)/1 = 12.25 - 6.25 = 6$, exact: the $\varepsilon^2$ error term involves $f'''$, which is 0 for a quadratic.` },
        { id: 'dl01-2-c5', kind: 'concept', front: md`How do you gradient-check a backward pass, and what result indicates a bug?`, back: md`Perturb each parameter by $\pm\varepsilon$ (about $10^{-5}$, float64), use central differences, and compute $\lVert\bg_a - \bg_n\rVert/(\lVert\bg_a\rVert + \lVert\bg_n\rVert)$. Around $10^{-7}$ is fine; above $10^{-3}$ is a bug.` },
      ],
    },
    // ------------------------------------------------------------------ 1.3
    {
      id: 'dl01-3',
      title: 'Making it work in NumPy',
      minutes: 40,
      objectives: [
        'Implement the forward pass, softmax cross-entropy, backward pass and an SGD step of a two-layer MLP in vectorized NumPy, and state the shape of every array.',
        'Predict the initial loss of a classifier with small weights ($\\approx \\ln C$).',
        'Explain why gradients vanish through a stack of sigmoids, using $\\sigma\' \\le 1/4$, and when they explode.',
        'Derive the variance-preserving initializations: $1/n_{\\text{in}}$ (LeCun), $2/(n_{\\text{in}} + n_{\\text{out}})$ (Xavier) and $2/n_{\\text{in}}$ (He).',
      ],
      cells: [
        {
          kind: 'text',
          md: md`Implementing a network by hand once is the fastest way to understand what a framework does, and a standard interview exercise. The whole training step for a two-layer classifier fits in about fifteen lines of NumPy. Keep a shapes table next to the code; almost every bug shows up as a wrong shape or as a silent broadcast.

| array | shape | meaning |
|---|---|---|
| \`X\` | $(B, D)$ | batch of inputs, one row per example |
| \`y\` | $(B,)$ | integer labels in $\{0, \dots, C-1\}$ |
| \`W1\`, \`b1\` | $(H, D)$, $(H,)$ | hidden layer |
| \`Z1\`, \`Hid\` | $(B, H)$ | pre-activations, ReLU outputs |
| \`W2\`, \`b2\` | $(C, H)$, $(C,)$ | output layer |
| \`Z2\`, \`P\`, \`Y\` | $(B, C)$ | logits, softmax probabilities, one-hot targets |
| \`D2\`, \`D1\` | $(B, C)$, $(B, H)$ | $\partial L/\partial Z_2$, $\partial L/\partial Z_1$ |

Subtract each row's maximum logit before \`np.exp\`. Softmax is unchanged by adding a constant to all logits, and the shift prevents overflow.`,
        },
        {
          kind: 'code',
          code: `import numpy as np

np.random.seed(0)
X = np.random.randn(6, 4)
y = np.array([0, 1, 2, 1, 0, 2])
W1 = np.random.randn(5, 4) * 0.01
W2 = np.random.randn(3, 5) * 0.01

H = np.maximum(0, X @ W1.T)
Z = H @ W2.T
P = np.exp(Z) / np.exp(Z).sum(axis=1, keepdims=True)
loss = -np.log(P[np.arange(6), y]).mean()
print(round(float(loss), 3))`,
          predict: {
            q: md`The weights are tiny, so all logits are close to 0. Which loss is printed?`,
            options: ['`1.099`', '`0.693`', '`0.0`', '`2.303`'],
            answer: 0,
            explain: md`Logits near 0 give $\bp \approx (1/3, 1/3, 1/3)$, so the loss is $-\ln(1/3) = \ln 3 \approx 1.099$. Checking that the first loss is about $\ln C$ is the cheapest test of a new training script: a value far above it means the output layer starts overconfident or the labels and logits are misaligned.`,
          },
        },
        {
          kind: 'exercise',
          ex: {
            id: 'dl01-3-ex',
            title: 'A two-layer MLP from scratch',
            prompt: md`Complete \`forward_backward\` for the network $Z_1 = XW_1\T + \bb_1$, $H = \relu(Z_1)$, $Z_2 = HW_2\T + \bb_2$, $P = \softmax(Z_2)$ row by row, and the **mean** cross-entropy loss over the batch. Return the loss and the gradients \`(dW1, db1, dW2, db2)\`, each with the shape of its parameter. Then complete \`sgd_step\`. Use no \`for\` loops: build the one-hot targets with \`np.eye(C)[y]\` and use $\Delta_2 = (P - Y)/B$.`,
            starter: `import numpy as np

np.random.seed(0)
X = np.random.randn(6, 4)              # (B, D): 6 examples, 4 features
y = np.array([0, 1, 2, 1, 0, 2])       # (B,): class labels in {0, 1, 2}
W1 = np.random.randn(5, 4) * 0.5       # (H, D)
b1 = np.zeros(5)                       # (H,)
W2 = np.random.randn(3, 5) * 0.5       # (C, H)
b2 = np.zeros(3)                       # (C,)

def forward_backward(X, y, W1, b1, W2, b2):
    B, C = X.shape[0], W2.shape[0]
    # forward: Z1, H, Z2, P (subtract the row max before exp), loss
    loss = 0.0
    # backward: D2 = (P - Y) / B, then dW2, db2, D1, dW1, db1
    dW1, db1 = np.zeros_like(W1), np.zeros_like(b1)
    dW2, db2 = np.zeros_like(W2), np.zeros_like(b2)
    return loss, (dW1, db1, dW2, db2)

def sgd_step(params, grads, lr):
    return params    # return the updated parameters as a tuple

loss0, grads = forward_backward(X, y, W1, b1, W2, b2)
params = sgd_step((W1, b1, W2, b2), grads, lr=0.5)
loss1, _ = forward_backward(X, y, *params)
print(round(float(loss0), 4), round(float(loss1), 4))`,
            solution: `import numpy as np

np.random.seed(0)
X = np.random.randn(6, 4)              # (B, D): 6 examples, 4 features
y = np.array([0, 1, 2, 1, 0, 2])       # (B,): class labels in {0, 1, 2}
W1 = np.random.randn(5, 4) * 0.5       # (H, D)
b1 = np.zeros(5)                       # (H,)
W2 = np.random.randn(3, 5) * 0.5       # (C, H)
b2 = np.zeros(3)                       # (C,)

def forward_backward(X, y, W1, b1, W2, b2):
    B, C = X.shape[0], W2.shape[0]
    Z1 = X @ W1.T + b1                 # (B, H)
    H = np.maximum(0, Z1)              # (B, H)
    Z2 = H @ W2.T + b2                 # (B, C)
    Z2 = Z2 - Z2.max(axis=1, keepdims=True)
    P = np.exp(Z2) / np.exp(Z2).sum(axis=1, keepdims=True)
    Y = np.eye(C)[y]                   # (B, C) one-hot
    loss = -np.mean(np.sum(Y * np.log(P), axis=1))
    D2 = (P - Y) / B                   # dL/dZ2, (B, C)
    dW2 = D2.T @ H                     # (C, H)
    db2 = D2.sum(axis=0)               # (C,)
    D1 = (D2 @ W2) * (Z1 > 0)          # dL/dZ1, (B, H)
    dW1 = D1.T @ X                     # (H, D)
    db1 = D1.sum(axis=0)               # (H,)
    return loss, (dW1, db1, dW2, db2)

def sgd_step(params, grads, lr):
    W1, b1, W2, b2 = params
    dW1, db1, dW2, db2 = grads
    return (W1 - lr * dW1, b1 - lr * db1, W2 - lr * dW2, b2 - lr * db2)

loss0, grads = forward_backward(X, y, W1, b1, W2, b2)
params = sgd_step((W1, b1, W2, b2), grads, lr=0.5)
loss1, _ = forward_backward(X, y, *params)
print(round(float(loss0), 4), round(float(loss1), 4))`,
            tests: [
              { expr: 'round(float(loss0), 6)', label: 'initial loss' },
              { expr: 'np.round(grads[0], 6).tolist()', label: 'dW1' },
              { expr: 'np.round(grads[2], 6).tolist()', label: 'dW2' },
              { expr: 'np.round(grads[3], 6).tolist()', label: 'db2' },
              { expr: 'tuple(g.shape for g in grads)', label: 'gradient shapes' },
              { expr: 'round(float(loss1), 6)', label: 'loss after one SGD step' },
            ],
            hints: [
              md`Forward: \`Z1 = X @ W1.T + b1\`, \`H = np.maximum(0, Z1)\`, \`Z2 = H @ W2.T + b2\`. Softmax: subtract \`Z2.max(axis=1, keepdims=True)\`, exponentiate, divide by the row sums.`,
              md`Loss: \`-np.mean(np.sum(Y * np.log(P), axis=1))\` with \`Y = np.eye(C)[y]\`.`,
              md`Backward: \`D2 = (P - Y) / B\`, \`dW2 = D2.T @ H\`, \`db2 = D2.sum(axis=0)\`, \`D1 = (D2 @ W2) * (Z1 > 0)\`, \`dW1 = D1.T @ X\`, \`db1 = D1.sum(axis=0)\`.`,
              md`In \`sgd_step\`, unpack \`W1, b1, W2, b2 = params\` and the four gradients the same way, and return a tuple of \`W - lr * dW\` terms.`,
            ],
            mustExclude: ['for '],
          },
        },
        {
          kind: 'check',
          q: md`A colleague's version computes \`D2 = P - Y\` (no division by $B$) but reports the mean loss. What happens?`,
          options: [md`The gradients are $B$ times too large, which acts like a learning rate $B$ times larger`, md`The gradients are $B$ times too small`, md`Nothing changes, because the direction is the same`, md`The loss stops decreasing because the gradient no longer matches any function`],
          answer: 0,
          explain: md`Without $1/B$ the code computes the gradient of the **summed** loss. The direction is right but the scale is $B$ times larger, so the effective learning rate depends on the batch size. A gradient check against the mean loss catches this.`,
        },
        {
          kind: 'text',
          md: md`**Vanishing and exploding gradients.** In a deep network the backward pass multiplies many local factors. For a chain of scalar units $h_l = \sigma(w_lh_{l-1} + b_l)$,
$$\pd{h_L}{h_0} = \prod_{l=1}^{L} w_l\,\sigma'(z_l).$$
If the factors are mostly below 1 in magnitude, the product shrinks geometrically and the early layers barely learn. If they are mostly above 1, it grows geometrically and training diverges. Deep networks in the 1990s and early 2000s were hard to train largely because of the first effect.`,
        },
        {
          kind: 'viz',
          viz: { type: 'dl.sigmoidchain', L: 10, w: 1, b: 0, act: 'sigmoid' },
          task: md`With sigmoid, $w = 1$, $b = 0$, read the gradient reaching layer 0 after 10 layers. Try to make it reach 1 by raising $w$. Then switch to ReLU, set $w = 1.2$ and $w = 0.8$, and compare.`,
          caption: md`The plot is $\log_{10}|\partial h_L/\partial h_l|$: each step to the left multiplies by one more factor $w\,\varphi'(z)$. Raising $w$ for the sigmoid also pushes $z$ into the flat tails, so the factors stay small. For ReLU the factor is exactly $w$ while units are active, so the gradient is $w^L$: it explodes for $w > 1$ and vanishes for $w < 1$.`,
        },
        {
          kind: 'derive',
          title: 'the sigmoid chain shrinks at least like 4⁻ᴸ',
          goal: md`Show $\sigma'(z) \le 1/4$ for all $z$, and conclude $\left|\partial h_L/\partial h_0\right| \le \prod_l |w_l|/4$.`,
          steps: [
            { md: md`Write $s = \sigma(z) \in (0, 1)$. Then $\sigma'(z) = s(1 - s)$.` },
            {
              md: md`The quadratic $s(1 - s) = \tfrac14 - (s - \tfrac12)^2$ is at most $\tfrac14$, with equality at $s = \tfrac12$, that is at $z = 0$.`,
              choose: {
                prompt: md`How do you bound $s(1-s)$ on $(0, 1)$?`,
                options: [md`Complete the square: $\tfrac14 - (s-\tfrac12)^2$`, md`Use $s < 1$ to get $s(1-s) < 1$`, md`Differentiate $\sigma$ twice`],
                answer: 0,
                explain: md`Completing the square gives the exact maximum $\tfrac14$. The bound $s(1 - s) < 1$ is true but too weak to explain vanishing gradients.`,
              },
            },
            { md: md`Take absolute values in the product: $\left|\prod_l w_l\sigma'(z_l)\right| = \prod_l |w_l|\,\sigma'(z_l) \le \prod_l |w_l|/4$. With $|w_l| \le 1$, the gradient after 10 layers is at most $4^{-10} \approx 9.5\times10^{-7}$.` },
          ],
          takeaway: md`Sigmoid layers shrink the gradient by at least a factor of 4 each unless the weights are large, and large weights saturate the units. ReLU's derivative is exactly 1 on active units, which removes this factor.`,
        },
        {
          kind: 'numeric',
          q: md`Ten sigmoid layers all sit at $z = 0$ with weight 1. By what factor is the gradient multiplied between the output and the input?`,
          answer: { kind: 'number', value: 9.5367431640625e-7, tol: 5e-9 },
          inputHint: 'e.g. 0.25^10',
          explain: md`Each layer contributes $1 \cdot \sigma'(0) = 1/4$, so the factor is $4^{-10} = 1/1{,}048{,}576 \approx 9.5\times10^{-7}$. In the figure the units do not stay at $z = 0$ (their inputs are about 0.6 to 0.7), so the factor is even smaller.`,
        },
        {
          kind: 'code',
          code: `import numpy as np

def sigmoid(z):
    return 1 / (1 + np.exp(-z))

h, grad = 0.5, 1.0
for layer in range(10):
    z = 1.0 * h          # weight 1, bias 0
    h = sigmoid(z)
    grad *= h * (1 - h)  # local factor w * sigma'(z)
print(f"{grad:.2e}")`,
          predict: {
            q: md`This is the figure's chain with $L = 10$, $w = 1$, $b = 0$, starting at $h_0 = 0.5$. The bound is $4^{-10} \approx 9.5\times10^{-7}$. What is printed?`,
            options: ['`3.48e-07`', '`9.54e-07`', '`2.50e-01`', '`1.00e+00`'],
            answer: 0,
            explain: md`After the first layer every $h$ is about 0.66, so $z \approx 0.66$ and $\sigma'(z) \approx 0.22 < 0.25$. Ten such factors give about $3.5\times10^{-7}$, below the bound, as it must be.`,
          },
        },
        {
          kind: 'callout',
          tone: 'remember',
          title: 'Standard remedies',
          md: md`- **ReLU-family activations** (ReLU, GELU, SwiGLU) instead of sigmoid and tanh in hidden layers.
- **Variance-preserving initialization** (He for ReLU, Xavier for tanh), derived below.
- **Normalization layers** (BatchNorm, LayerNorm, RMSNorm) and **residual connections**, the subject of the next module.
- **Gradient clipping** against explosions, standard in LLM training.
- In recurrent networks, **gating** (LSTM, GRU), whose additive cell update gives the gradient a path that is not repeatedly multiplied by the same matrix.`,
        },
        {
          kind: 'viz',
          viz: { type: 'dl.depthsignal', act: 'relu', init: 'he', depth: 20 },
          task: md`With ReLU, compare the four initializations at depth 20 in both plots. Then pick tanh and find which initialization keeps the activations from collapsing. Finally set ReLU with He and move the gain to 1.5.`,
          caption: md`Top: the RMS of each layer's activations on a random batch. Bottom: the RMS of $\partial L/\partial\bh_l$, relative to the top layer. With $\sigma_w = 0.01$ both signals die within a few layers. LeCun/Xavier ($\Var(W) = 1/n$ here, since $n_{\text{in}} = n_{\text{out}}$) halves the ReLU signal's energy every layer. He keeps it level. A gain of 1.5 multiplies the variance by 2.25 per layer and the signal explodes.`,
        },
        {
          kind: 'derive',
          title: 'variance-preserving initialization',
          goal: md`For $z_i = \sum_{j=1}^{n} W_{ij}x_j$ with independent zero-mean weights, find $\Var(W_{ij})$ that keeps the scale of the pre-activations constant from layer to layer, for linear/tanh units and for ReLU units.`,
          steps: [
            {
              md: md`Assume the $W_{ij}$ are independent of each other and of the $x_j$, with mean 0 and variance $v$. Each term has mean 0 and $\E[W_{ij}^2x_j^2] = v\,\E[x_j^2]$, and the terms are uncorrelated, so $$\Var(z_i) = n\,v\,\E[x^2].$$`,
              choose: {
                prompt: md`Why can the variances of the $n$ terms simply be added?`,
                options: [md`The terms are uncorrelated because each weight has mean 0 and is independent of everything else`, md`Because the inputs $x_j$ are independent of each other`, md`Because variance is always additive`],
                answer: 0,
                explain: md`$\Cov(W_{ij}x_j, W_{ik}x_k) = \E[W_{ij}]\E[W_{ik}x_jx_k] = 0$ for $j \ne k$. Correlated inputs do not matter here; zero-mean independent weights are enough.`,
              },
            },
            { md: md`**Linear or tanh units** (tanh is close to the identity near 0, with zero-mean outputs): $\E[x^2] \approx \Var(z^{\text{prev}})$. Keeping $\Var(z)$ constant needs $nv = 1$, so $v = 1/n_{\text{in}}$ (LeCun). The backward pass multiplies by $W\T$, which sums over $n_{\text{out}}$ terms and wants $v = 1/n_{\text{out}}$. Xavier/Glorot initialization compromises: $v = 2/(n_{\text{in}} + n_{\text{out}})$.` },
            {
              md: md`**ReLU units:** $x = \relu(z^{\text{prev}})$ with $z^{\text{prev}}$ symmetric about 0. Half of the time $x = 0$; otherwise $x^2 = (z^{\text{prev}})^2$. So $\E[x^2] = \tfrac12\E[(z^{\text{prev}})^2] = \tfrac12\Var(z^{\text{prev}})$.`,
              choose: {
                prompt: md`What is $\E[\relu(z)^2]$ for $z$ symmetric with mean 0?`,
                options: [md`$\tfrac12\Var(z)$`, md`$\Var(z)$`, md`$\tfrac14\Var(z)$`, md`$(\E[\relu(z)])^2$`],
                answer: 0,
                explain: md`By symmetry $z > 0$ with probability $\tfrac12$, and $\E[z^2\mid z > 0] = \E[z^2]$. Note that this is $\E[x^2]$, not $\Var(x)$: ReLU outputs have a positive mean, and the derivation needs the second moment.`,
              },
            },
            { md: md`Then $\Var(z) = n\,v\,\tfrac12\Var(z^{\text{prev}})$, and keeping it constant needs $v = 2/n_{\text{in}}$: **He initialization**, $W_{ij} \sim \mathcal N(0, 2/n_{\text{in}})$.` },
          ],
          takeaway: md`ReLU discards half the signal's energy, so He doubles the weight variance to compensate. With Xavier, a deep ReLU network loses a factor of 2 in energy per layer, $2^{-20} \approx 10^{-6}$ after 20 layers.`,
        },
        {
          kind: 'numeric',
          q: md`A ReLU layer has $n_{\text{in}} = 512$ inputs. What standard deviation does He initialization give the weights?`,
          answer: { kind: 'number', value: 0.0625 },
          explain: md`$\sqrt{2/512} = \sqrt{1/256} = 1/16 = 0.0625$. PyTorch's \`nn.init.kaiming_normal_\` with \`nonlinearity='relu'\` uses this value (\`nn.Linear\`'s default initialization is a different, uniform rule).`,
        },
        {
          kind: 'paper',
          problem: {
            id: 'dl01-3-paper',
            title: 'The second moment of a ReLU',
            type: 'proof',
            difficulty: 2,
            minutes: 8,
            statement: md`Let $z$ have a density that is symmetric about 0, with $\Var(z) = s^2$. Prove that $\E[\relu(z)^2] = s^2/2$. For $z \sim \mathcal N(0, s^2)$, also compute $\E[\relu(z)]$ and $\Var(\relu(z))$, given $\E[|z|] = s\sqrt{2/\pi}$.`,
            hints: [md`Split the expectation into $z > 0$ and $z \le 0$. Symmetry says the two halves of $\E[z^2]$ are equal.`],
            solution: [
              md`$\E[\relu(z)^2] = \E[z^2\,\mathbb 1(z > 0)]$ because $\relu(z)^2 = z^2$ for $z > 0$ and $0$ otherwise.`,
              md`By symmetry, $\E[z^2\,\mathbb 1(z > 0)] = \E[z^2\,\mathbb 1(z < 0)]$, and the two add up to $\E[z^2] = s^2$ (the mean is 0, and $z = 0$ has probability 0). Each is $s^2/2$.`,
              md`Similarly $\E[\relu(z)] = \tfrac12\E[|z|] = s/\sqrt{2\pi}$ for the normal case.`,
              md`$\Var(\relu(z)) = \dfrac{s^2}{2} - \dfrac{s^2}{2\pi} = \dfrac{s^2}{2}\left(1 - \dfrac1\pi\right) \approx 0.34\,s^2$. The He derivation uses the second moment $s^2/2$, not this variance, because the next layer's $\Var(z) = n\,v\,\E[x^2]$.`,
            ],
            rubric: [md`Writes $\relu(z)^2 = z^2\mathbb 1(z > 0)$`, md`Uses symmetry to split $\E[z^2]$ into two equal halves`, md`Distinguishes the second moment from the variance of the ReLU output`],
          },
        },
        {
          kind: 'code',
          code: `import numpy as np

np.random.seed(0)
n, depth = 128, 10
x = np.random.randn(200, n)                  # 200 inputs are enough to measure the signal size

for name, std in [("std 0.01", 0.01), ("Xavier", np.sqrt(1 / n)), ("He", np.sqrt(2 / n))]:
    h = x
    for layer in range(depth):
        W = np.random.randn(n, n) * std
        h = np.maximum(0, h @ W.T)
    rms = np.sqrt(np.mean(h ** 2))       # the quantity He init keeps constant
    print(name, f"{rms:.3g}")`,
          note: md`Ten ReLU layers of width 128. Theory predicts an RMS of about $1$ for He, $2^{-10/2} \approx 0.031$ for Xavier (energy halved per layer), and essentially 0 for $\sigma_w = 0.01$. A single random network fluctuates around these values. Try \`depth = 30\`.`,
        },
        {
          kind: 'check',
          q: md`You are building a 30-layer MLP with tanh hidden units and $n_{\text{in}} = n_{\text{out}} = 1024$. Which initialization fits best?`,
          options: [md`Xavier: $\Var(W) = 2/(n_{\text{in}} + n_{\text{out}}) = 1/1024$`, md`He: $\Var(W) = 2/1024$`, md`$\mathcal N(0, 1)$`, md`All weights zero, so the network starts symmetric`],
          answer: 0,
          explain: md`tanh behaves like the identity near 0 and has zero-mean output, so it needs $nv \approx 1$. He's factor 2 compensates for ReLU's zeroing and would push tanh units toward saturation. $\mathcal N(0, 1)$ makes $\Var(z) = 1024$, deep in saturation. Zero weights give every unit in a layer the same gradient, so they never become different.`,
        },
        {
          kind: 'explain',
          prompt: md`Explain to an interviewer why ReLU networks use He initialization instead of Xavier.`,
          model: md`Initialization is chosen so that the variance of the pre-activations stays constant from layer to layer; otherwise activations and gradients grow or shrink geometrically with depth. For $z_i = \sum_j W_{ij}x_j$ with zero-mean independent weights, $\Var(z) = n_{\text{in}}\Var(W)\,\E[x^2]$. Xavier assumes a roughly linear, zero-centred activation, where $\E[x^2] \approx \Var(z^{\text{prev}})$, giving $\Var(W) \approx 1/n$. ReLU zeroes the negative half of a symmetric input, so $\E[x^2] = \tfrac12\Var(z^{\text{prev}})$. To compensate, He doubles the variance: $\Var(W) = 2/n_{\text{in}}$. With Xavier, a deep ReLU network loses half the signal energy per layer, about $10^{-6}$ after 20 layers, and its gradients shrink the same way.`,
        },
      ],
      cards: [
        { id: 'dl01-3-c1', kind: 'cloze', text: md`He initialization for ReLU layers samples weights with variance {{}} divided by $n_{\text{in}}$.`, answers: ['2'] },
        { id: 'dl01-3-c2', kind: 'compute', front: md`Expected initial cross-entropy of a 10-class classifier whose logits start near 0 (natural log, 3 decimals).`, answer: { kind: 'number', value: 2.302585, tol: 1e-3 }, back: md`$-\ln(1/10) = \ln 10 \approx 2.303$.` },
        { id: 'dl01-3-c3', kind: 'concept', front: md`Why do gradients vanish in a deep stack of sigmoid layers?`, back: md`The backward pass multiplies by $w_l\sigma'(z_l)$ per layer and $\sigma' \le 1/4$, so unless weights are large (which saturates the units), the product shrinks at least like $4^{-L}$.` },
        { id: 'dl01-3-c4', kind: 'concept', front: md`In NumPy, how do you compute a numerically safe row-wise softmax of logits \`Z\`?`, back: md`\`Z = Z - Z.max(axis=1, keepdims=True)\`, then \`P = np.exp(Z) / np.exp(Z).sum(axis=1, keepdims=True)\`. The shift does not change the softmax and prevents overflow.` },
        { id: 'dl01-3-c5', kind: 'cloze', text: md`For a batch of size $B$ with the mean loss, the softmax cross-entropy gradient with respect to the logits is $(P - Y)$ divided by {{}}.`, answers: ['B'] },
      ],
    },
  ],
  problems: [
    {
      id: 'dl01-p1',
      title: 'Backprop by hand and one SGD step',
      type: 'compute',
      difficulty: 2,
      minutes: 15,
      statement: md`A network has input $\bx = (2, -1)$, a ReLU hidden layer with $W_1 = \begin{bmatrix}1 & 2\\-1 & 1\end{bmatrix}$, $\bb_1 = (1, 0)$, a linear output $\hat y = \bw_2\T\bh + b_2$ with $\bw_2 = (1, 3)$, $b_2 = 0.5$, and loss $L = \tfrac12(\hat y - y)^2$ with $y = 2$.

(a) Run the forward pass and compute $L$. (b) Compute $\partial L/\partial W_1$. (c) Take one SGD step with $\eta = 0.1$ on all parameters and recompute $L$. Enter $\partial L/\partial W_1$.`,
      hints: [md`$\bz_1 = (1, -3)$. Only one hidden unit is active.`, md`$\delta_2 = \hat y - y$; $\boldsymbol\delta_1 = (\bw_2\delta_2)\odot\relu'(\bz_1)$; $\partial L/\partial W_1 = \boldsymbol\delta_1\bx\T$.`],
      solution: [
        md`Forward: $\bz_1 = (2 - 2 + 1,\ -2 - 1 + 0) = (1, -3)$, $\bh = (1, 0)$, $\hat y = 1 + 0 + 0.5 = 1.5$, $L = \tfrac12(1.5 - 2)^2 = 0.125$.`,
        md`Output: $\delta_2 = \hat y - y = -0.5$. Then $\partial L/\partial\bw_2 = \delta_2\bh = (-0.5, 0)$ and $\partial L/\partial b_2 = -0.5$.`,
        md`Hidden: $\partial L/\partial\bh = \bw_2\delta_2 = (-0.5, -1.5)$. Multiply by $\relu'(\bz_1) = (1, 0)$: $\boldsymbol\delta_1 = (-0.5, 0)$.`,
        md`$\partial L/\partial W_1 = \boldsymbol\delta_1\bx\T = \begin{bmatrix}-0.5\\0\end{bmatrix}\begin{bmatrix}2 & -1\end{bmatrix} = \begin{bmatrix}-1 & 0.5\\0 & 0\end{bmatrix}$, and $\partial L/\partial\bb_1 = (-0.5, 0)$.`,
        md`SGD: $W_1 \leftarrow \begin{bmatrix}1.1 & 1.95\\-1 & 1\end{bmatrix}$, $\bb_1 \leftarrow (1.05, 0)$, $\bw_2 \leftarrow (1.05, 3)$, $b_2 \leftarrow 0.55$.`,
        md`New forward pass: $z_{1,1} = 2.2 - 1.95 + 1.05 = 1.3$, $h_2$ stays 0, $\hat y = 1.05 \cdot 1.3 + 0.55 = 1.915$, $L = \tfrac12(0.085)^2 \approx 0.0036$. The loss fell from $0.125$.`,
      ],
      answer: { kind: 'matrix', value: [[-1, 0.5], [0, 0]] },
      areas: ['ml-depth'],
    },
    {
      id: 'dl01-p2',
      title: 'The softmax Jacobian route to p − y',
      type: 'derive',
      difficulty: 2,
      minutes: 12,
      statement: md`Let $\bp = \softmax(\bz)$. (a) Show that $\dfrac{\partial p_k}{\partial z_i} = p_k(\delta_{ki} - p_i)$, that is, the Jacobian is $\diag(\bp) - \bp\bp\T$. (b) Use it to show that $L = -\sum_k y_k\ln p_k$ with $\sum_k y_k = 1$ has $\partial L/\partial\bz = \bp - \by$. (The lesson derived the same result via log-sum-exp.)`,
      hints: [md`Differentiate $\ln p_k = z_k - \ln\sum_j e^{z_j}$ and multiply by $p_k$.`],
      solution: [
        md`$\dfrac{\partial\ln p_k}{\partial z_i} = \delta_{ki} - p_i$, so $\dfrac{\partial p_k}{\partial z_i} = p_k\dfrac{\partial\ln p_k}{\partial z_i} = p_k(\delta_{ki} - p_i)$.`,
        md`In matrix form the entry $(k, i)$ is $p_k\delta_{ki} - p_kp_i$: $\diag(\bp) - \bp\bp\T$, a symmetric matrix whose rows sum to 0.`,
        md`Chain rule: $\dfrac{\partial L}{\partial z_i} = \sum_k \dfrac{\partial L}{\partial p_k}\dfrac{\partial p_k}{\partial z_i} = \sum_k\left(-\dfrac{y_k}{p_k}\right)p_k(\delta_{ki} - p_i)$.`,
        md`Simplify: $= -\sum_k y_k(\delta_{ki} - p_i) = -y_i + p_i\sum_k y_k = p_i - y_i$.`,
      ],
      rubric: [md`Correct Jacobian entries, including the diagonal case`, md`Chain rule written with the sum over $k$`, md`Uses $\sum_k y_k = 1$ to finish`],
      areas: ['ml-depth', 'math'],
    },
    {
      id: 'dl01-p3',
      title: 'He initialization from the variance argument',
      type: 'derive',
      difficulty: 2,
      minutes: 12,
      statement: md`In a ReLU network, $z^{(l+1)}_i = \sum_{j=1}^{n} W_{ij}\,\relu(z^{(l)}_j)$ with $W_{ij}$ independent, mean 0, variance $v$, and independent of $z^{(l)}$, whose entries are symmetric about 0. (a) Derive $\Var(z^{(l+1)}_i)$ in terms of $n$, $v$ and $\Var(z^{(l)}_j)$. (b) Find $v$ that keeps it constant. (c) Give the weight standard deviation for $n = 128$.`,
      solution: [
        md`The terms $W_{ij}x_j$ (with $x_j = \relu(z^{(l)}_j)$) have mean $\E[W_{ij}]\E[x_j] = 0$ and are uncorrelated for different $j$, because the weights are independent and zero-mean.`,
        md`So $\Var(z^{(l+1)}_i) = \sum_j \E[W_{ij}^2]\E[x_j^2] = n\,v\,\E[x^2]$.`,
        md`By symmetry, $\E[x^2] = \E[(z^{(l)})^2\mathbb 1(z^{(l)} > 0)] = \tfrac12\Var(z^{(l)})$.`,
        md`Hence $\Var(z^{(l+1)}) = \tfrac12 n v\,\Var(z^{(l)})$. It stays constant when $v = 2/n$.`,
        md`For $n = 128$: $\sqrt{2/128} = \sqrt{1/64} = 0.125$.`,
      ],
      answer: { kind: 'number', value: 0.125 },
      rubric: [md`States why the cross terms vanish (independent zero-mean weights)`, md`Computes $\E[\relu(z)^2] = \tfrac12\Var(z)$`, md`Solves $\tfrac12 nv = 1$`],
      areas: ['ml-depth'],
    },
    {
      id: 'dl01-p4',
      title: 'Parameter count of a CIFAR-10 MLP',
      type: 'compute',
      difficulty: 1,
      minutes: 5,
      statement: md`A CIFAR-10 image is $32\times32\times3$. An MLP flattens it and uses layers $3072 \to 512 \to 512 \to 10$, all with biases. How many parameters does it have? What fraction sits in the first layer?`,
      solution: [
        md`$3072 \cdot 512 + 512 = 1{,}572{,}864 + 512 = 1{,}573{,}376$.`,
        md`$512 \cdot 512 + 512 = 262{,}656$, and $512 \cdot 10 + 10 = 5{,}130$.`,
        md`Total $1{,}841{,}162$, of which the first layer holds about $85\%$. A convolutional layer (Module dl03) needs only a few thousand parameters to read the same image.`,
      ],
      answer: { kind: 'number', value: 1841162 },
    },
    {
      id: 'dl01-p5',
      title: 'Deep sigmoid networks shrink the gradient',
      type: 'proof',
      difficulty: 2,
      minutes: 10,
      statement: md`Consider the scalar chain $h_l = \sigma(w_lh_{l-1} + b_l)$ for $l = 1, \dots, L$. Prove that $\left|\partial h_L/\partial h_0\right| \le \prod_{l=1}^{L}|w_l|/4$. How large would the weights need to be for the bound to allow a gradient of 1, and why does that not help in practice?`,
      solution: [
        md`By the chain rule, $\dfrac{\partial h_L}{\partial h_0} = \prod_{l=1}^{L}\dfrac{\partial h_l}{\partial h_{l-1}} = \prod_{l=1}^{L} w_l\,\sigma'(z_l)$ with $z_l = w_lh_{l-1} + b_l$.`,
        md`$\sigma'(z) = s(1-s)$ with $s = \sigma(z)$, and $s(1-s) = \tfrac14 - (s - \tfrac12)^2 \le \tfrac14$.`,
        md`So $|w_l\sigma'(z_l)| \le |w_l|/4$, and the absolute value of the product is at most $\prod_l|w_l|/4$.`,
        md`The bound reaches 1 only if $|w_l| \ge 4$ on average. But then $|z_l|$ is typically large, $\sigma'(z_l)$ is far below $1/4$ (for $z = 4$ it is about $0.018$), and the actual factors stay small. Equality needs $z_l = 0$ exactly at every layer.`,
      ],
      rubric: [md`Chain rule product written correctly`, md`Proof that $\sigma' \le 1/4$`, md`Explains why large weights saturate the units`],
      areas: ['ml-depth', 'math'],
    },
    {
      id: 'dl01-p6',
      title: 'No linear network solves XOR',
      type: 'proof',
      difficulty: 2,
      minutes: 10,
      statement: md`The XOR data are $(0,0)\mapsto 0$, $(1,1)\mapsto 0$, $(0,1)\mapsto 1$, $(1,0)\mapsto 1$. Prove that no network of affine layers without activations, followed by thresholding the scalar output at 0, classifies all four points correctly. Then give a two-unit ReLU hidden layer that does.`,
      hints: [md`The network computes $s(\bx) = \bw\T\bx + b$ for some $\bw, b$. Add the conditions for the two pairs of points.`, md`Try $h_1 = \relu(x_1 + x_2)$ and $h_2 = \relu(x_1 + x_2 - 1)$.`],
      solution: [
        md`A stack of affine layers is one affine map, so the output is $s(\bx) = w_1x_1 + w_2x_2 + b$.`,
        md`Correct classification needs $s(0,1) > 0$ and $s(1,0) > 0$; adding them gives $w_1 + w_2 + 2b > 0$.`,
        md`It also needs $s(0,0) = b \le 0$ and $s(1,1) = w_1 + w_2 + b \le 0$; adding them gives $w_1 + w_2 + 2b \le 0$. Contradiction.`,
        md`With ReLUs: $h_1 = \relu(x_1 + x_2)$, $h_2 = \relu(x_1 + x_2 - 1)$, output $h_1 - 2h_2 - 0.5$. The four points give $(h_1, h_2) = (0,0), (2,1), (1,0), (1,0)$ and outputs $-0.5, -0.5, 0.5, 0.5$: correct.`,
      ],
      rubric: [md`Reduces the network to one affine map`, md`Derives the two contradictory inequalities`, md`Gives and checks a working ReLU network`],
      areas: ['ml-depth', 'math'],
    },
    {
      id: 'dl01-p7',
      title: 'Write the batch backward pass with shapes',
      type: 'code-on-paper',
      difficulty: 2,
      minutes: 12,
      statement: md`A two-layer network uses tanh: $Z_1 = XW_1\T + \bb_1$, $H = \tanh(Z_1)$, $Z_2 = HW_2\T + \bb_2$, mean softmax cross-entropy. Batch size $B = 32$, input dimension $D = 20$, hidden width $64$, $C = 5$ classes. Write the NumPy lines of the backward pass, starting from \`P\` and \`Y\`, and annotate every array with its shape. Which line changes if tanh is replaced by ReLU?`,
      solution: [
        md`\`D2 = (P - Y) / B\`, shape $(32, 5)$.`,
        md`\`dW2 = D2.T @ H\` is $(5, 32)(32, 64) = (5, 64)$; \`db2 = D2.sum(axis=0)\` is $(5,)$.`,
        md`\`dH = D2 @ W2\` is $(32, 5)(5, 64) = (32, 64)$.`,
        md`\`D1 = dH * (1 - H**2)\`, shape $(32, 64)$, since $\tanh' = 1 - \tanh^2$ and \`H\` already holds $\tanh(Z_1)$.`,
        md`\`dW1 = D1.T @ X\` is $(64, 32)(32, 20) = (64, 20)$; \`db1 = D1.sum(axis=0)\` is $(64,)$.`,
        md`For ReLU only the activation derivative changes: \`D1 = dH * (Z1 > 0)\`.`,
      ],
      rubric: [md`Divides by $B$ once, at the output`, md`All shapes correct and matching the parameters`, md`Uses $1 - H^2$ from the stored forward value`],
      areas: ['ml-coding'],
    },
    {
      id: 'dl01-p8',
      title: 'Error of the central difference',
      type: 'compute',
      difficulty: 2,
      minutes: 8,
      statement: md`For $f(x) = e^x$ at $x = 0$ and $\varepsilon = 0.01$: (a) compute the central difference estimate and its error. (b) Compare it with the forward-difference error. (c) Use Taylor series to explain the ratio. Enter the central-difference error.`,
      hints: [md`$\dfrac{e^{\varepsilon} - e^{-\varepsilon}}{2\varepsilon} = \dfrac{\sinh\varepsilon}{\varepsilon} = 1 + \dfrac{\varepsilon^2}{6} + \dots$`],
      solution: [
        md`Central: $\dfrac{e^{0.01} - e^{-0.01}}{0.02} = \dfrac{\sinh 0.01}{0.01} \approx 1.0000166667$. The exact derivative is 1, so the error is about $1.667\times10^{-5}$.`,
        md`Forward: $\dfrac{e^{0.01} - 1}{0.01} \approx 1.0050167$, error about $5.0\times10^{-3}$, roughly 300 times larger.`,
        md`Taylor: $f(\pm\varepsilon) = f \pm \varepsilon f' + \tfrac{\varepsilon^2}{2}f'' \pm \tfrac{\varepsilon^3}{6}f''' + \dots$. In the central difference the even terms cancel, leaving error $\tfrac{\varepsilon^2}{6}f''' = \tfrac{10^{-4}}{6}$. The forward difference keeps $\tfrac{\varepsilon}{2}f'' = 0.005$.`,
      ],
      answer: { kind: 'number', value: 1.6666750000338126e-5, tol: 1e-7 },
    },
    {
      id: 'dl01-p9',
      title: 'A weight used twice',
      type: 'concept',
      difficulty: 1,
      minutes: 6,
      statement: md`A model uses the same scalar weight twice: $u = wx$, then $y = wu$ (so $y = w^2x$). Draw the graph, run the backward pass, and give $\partial y/\partial w$ at $w = 3$, $x = 2$. Name one real architecture where a parameter is used in several places in the graph.`,
      solution: [
        md`Forward: $u = 6$, $y = 18$.`,
        md`Backward: $\partial y/\partial y = 1$. Through $y = wu$: contribution to $w$ is $u = 6$, and $\partial y/\partial u = w = 3$.`,
        md`Through $u = wx$: contribution to $w$ is $\partial y/\partial u \cdot x = 3 \cdot 2 = 6$.`,
        md`Sum: $\partial y/\partial w = 6 + 6 = 12$, matching $\tfrac{d}{dw}(w^2x) = 2wx = 12$.`,
        md`Shared parameters appear in RNNs (the same $W_{hh}$ at every time step), convolutions (the same kernel at every position), and language models that tie the input embedding to the output projection. In all of them the gradient is the sum over uses.`,
      ],
      answer: { kind: 'number', value: 12 },
    },
  ],
};
