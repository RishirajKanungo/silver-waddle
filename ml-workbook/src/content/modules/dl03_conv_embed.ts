import { md, type Module } from '../types';

export const MODULE: Module = {
  id: 'dl03',
  part: 'dl',
  order: 3,
  title: 'Convolutions, embeddings and representation learning',
  summary: 'Convolution as a sliding dot product with shared weights, output sizes and receptive fields; embedding tables, word2vec and analogy arithmetic; contrastive learning, transfer learning, and why attention replaced recurrence.',
  relevance: md`Convolutions remain the backbone of many vision, audio and on-device models, and the output-size and parameter-count arithmetic is a routine interview warm-up. Embedding tables are the first layer of every language model and of most recommender systems; two-tower retrieval, CLIP-style multimodal models and the embedding models behind retrieval-augmented generation are all trained with the contrastive loss covered here. Explaining why transformers replaced RNNs (parallel training and short gradient paths) is a standard question before any discussion of attention.`,
  areas: ['ml-breadth', 'ml-depth', 'llm'],
  prereqs: ['dl02'],
  lessons: [
    // ------------------------------------------------------------------ 3.1
    {
      id: 'dl03-1',
      title: 'Convolution',
      minutes: 40,
      objectives: [
        'Compute one output of a 2-D convolution (cross-correlation) by hand as a dot product between a kernel and an image patch.',
        'Apply $n_{\\text{out}} = \\lfloor (n + 2p - k)/s \\rfloor + 1$ for any padding, stride and kernel size.',
        'Count the parameters of a convolutional layer, $k^2C_{\\text{in}}C_{\\text{out}} + C_{\\text{out}}$, and compare them with a dense layer.',
        'Compute the receptive field of a stack of convolution and pooling layers.',
        'Explain weight sharing, translation equivariance, pooling and $1\\times1$ convolutions.',
      ],
      cells: [
        {
          kind: 'text',
          md: md`A dense layer from a $224\times224\times3$ image to just 1000 hidden units needs $150{,}528 \times 1000 \approx 1.5\times10^8$ weights, and it treats a pixel in the top-left corner as unrelated to the same pattern one pixel to the right. Images have two properties a better layer should use. **Locality**: an edge, a corner or a texture is determined by a small neighbourhood. **Translation**: the same pattern can appear anywhere, so the detector for it should be the same everywhere. A convolutional layer applies one small set of weights, the **kernel**, at every position of the image.`,
        },
        {
          kind: 'callout',
          tone: 'definition',
          title: 'Convolution as used in deep learning',
          md: md`For a single-channel image $X$ and a $k\times k$ kernel $K$, the output (feature map) is
$$Y_{ij} = \sum_{a=0}^{k-1}\sum_{b=0}^{k-1} K_{ab}\,X_{i+a,\,j+b} + b_0.$$
Each output is the **dot product** of the kernel with the patch under it, and the kernel slides across the image. Mathematically this is cross-correlation; a true convolution flips the kernel first, which makes no difference when the kernel is learned. With $C_{\text{in}}$ input channels, the kernel has shape $C_{\text{in}}\times k\times k$ and the sum also runs over channels. A layer with $C_{\text{out}}$ such kernels produces $C_{\text{out}}$ feature maps.`,
        },
        {
          kind: 'viz',
          viz: { type: 'dl.conv2d', image: 'step', kernel: 'vedge', pad: 0, stride: 1 },
          task: md`Step through the vertical-edge kernel on the **step** image. Before each step reveals the value, predict whether the output is 0, positive or negative. Then switch the kernel to horizontal edge and explain why the map becomes all zeros.`,
          caption: md`The kernel $\begin{bmatrix}1&0&-1\end{bmatrix}$ in every row computes "left column minus right column" of each patch. On flat regions both columns agree and the output is 0; where dark changes to bright from left to right, the output is $-3$. The sign tells the direction of the edge, the magnitude its contrast.`,
        },
        {
          kind: 'numeric',
          q: md`Apply the kernel $K = \begin{bmatrix}1&0&-1\\1&0&-1\\1&0&-1\end{bmatrix}$ to the patch $\begin{bmatrix}2&1&0\\3&1&0\\4&2&1\end{bmatrix}$ (no bias).`,
          answer: { kind: 'number', value: 8 },
          explain: md`Multiply entry by entry and add. The middle column is multiplied by 0. Left column: $2 + 3 + 4 = 9$; right column: $0 + 0 + 1 = 1$; result $9 - 1 = 8$. The patch is brighter on the left, so the response is positive.`,
        },
        {
          kind: 'callout',
          tone: 'theorem',
          title: 'Output size',
          md: md`For input size $n$ (along one axis), kernel size $k$, padding $p$ on each side and stride $s$:
$$n_{\text{out}} = \left\lfloor\frac{n + 2p - k}{s}\right\rfloor + 1.$$
With dilation $d$ (gaps of $d - 1$ between kernel taps) replace $k$ by $d(k - 1) + 1$. **"Same" padding** for stride 1 and odd $k$ is $p = (k-1)/2$, which keeps $n_{\text{out}} = n$. The same formula applies to pooling layers.`,
        },
        {
          kind: 'viz',
          viz: { type: 'dl.convshape', n: 9, k: 3, p: 0, s: 1, d: 1, cin: 3, cout: 16 },
          task: md`Find a padding that keeps the output length equal to the input length for $k = 3$, then for $k = 5$. Then set $s = 2$ and click the output cells: which input cells are never the centre of a window? Finally compare the conv and dense parameter counts as you change $n$.`,
          caption: md`Each output cell reads $k$ input cells (orange taps for the selected one). Stride skips positions, dilation spreads the taps apart, padding adds zeros at the borders. The convolution's parameter count does not depend on $n$ at all; a dense layer between the same tensors grows with $n^4$.`,
        },
        {
          kind: 'numeric',
          q: md`A $32\times32$ input goes through a $5\times5$ convolution with padding 2 and stride 2. What is the output height?`,
          answer: { kind: 'number', value: 16 },
          explain: md`$\lfloor(32 + 4 - 5)/2\rfloor + 1 = \lfloor 15.5\rfloor + 1 = 16$. Stride 2 with "same"-style padding halves the resolution.`,
        },
        {
          kind: 'text',
          md: md`**Channels and parameters.** A convolution from $C_{\text{in}}$ to $C_{\text{out}}$ channels has $C_{\text{out}}$ kernels, each of shape $C_{\text{in}}\times k\times k$, plus one bias per output channel:
$$\#\text{params} = k^2\,C_{\text{in}}\,C_{\text{out}} + C_{\text{out}}.$$
This is independent of the image size because the same weights are used at every position (**weight sharing**). A **$1\times1$ convolution** is a dense layer applied to the channel vector at every pixel; it mixes channels without looking at neighbours and is used to change the channel count cheaply.

**Pooling** summarizes each window, usually $2\times2$ with stride 2, by its maximum (max pooling) or mean (average pooling). It halves the height and width, has no parameters, and makes the output less sensitive to small shifts. **Global average pooling** averages each channel over the whole map before the classifier, which makes the network accept any input size.

**Equivariance.** Shifting the input of a stride-1 convolution shifts its output by the same amount (away from the borders). Pooling and striding make the network approximately invariant to small shifts.`,
        },
        {
          kind: 'numeric',
          q: md`How many parameters does a $3\times3$ convolution from 64 to 128 channels have, including biases?`,
          answer: { kind: 'number', value: 73856 },
          explain: md`$3\cdot3\cdot64\cdot128 + 128 = 73{,}728 + 128 = 73{,}856$, whether the feature maps are $8\times8$ or $512\times512$.`,
        },
        {
          kind: 'check',
          q: md`A stride-1 convolutional layer (with "same" padding) receives an image shifted 3 pixels to the right. What happens to its output?`,
          options: [md`It shifts 3 pixels to the right too, apart from effects at the borders`, md`It is unchanged`, md`It changes unpredictably, because every output weight sees a different pixel`, md`It is mirrored`],
          answer: 0,
          explain: md`The same kernel is applied at every position, so moving the input moves where each pattern is detected: convolution is translation **equivariant**. Invariance (output unchanged) comes only approximately, from pooling, striding and global averaging.`,
        },
        {
          kind: 'code',
          code: `def conv_out(n, k, p, s):
    return (n + 2 * p - k) // s + 1

n, c = 32, 3
layers = [("conv 3x3, 16, pad 1", 3, 1, 1, 16), ("maxpool 2x2", 2, 0, 2, None),
          ("conv 3x3, 32, pad 1", 3, 1, 1, 32), ("maxpool 2x2", 2, 0, 2, None)]
for name, k, p, s, c_out in layers:
    n = conv_out(n, k, p, s)
    c = c_out or c
print((n, n, c))`,
          predict: {
            q: md`A $32\times32\times3$ CIFAR image passes through this small CNN. What is the final (height, width, channels)?`,
            options: ['`(8, 8, 32)`', '`(16, 16, 32)`', '`(8, 8, 16)`', '`(30, 30, 32)`'],
            answer: 0,
            explain: md`The padded $3\times3$ convolutions keep the size; each $2\times2$ pool halves it: $32 \to 32 \to 16 \to 16 \to 8$. The channels follow the last convolution: 32. Without padding the first convolution would give 30.`,
          },
        },
        {
          kind: 'viz',
          viz: { type: 'dl.receptive', L: 3, k: 3, s: 1 },
          task: md`Read the receptive field of three $3\times3$ stride-1 layers. Then set the stride to 2 and compare. How many stride-1 layers would you need to match the stride-2 receptive field?`,
          caption: md`Each output unit depends on a window of the input, its **receptive field**. With stride 1 every layer widens it by $k - 1$. With stride 2 every later layer's taps are spaced further apart in input coordinates, so the receptive field grows geometrically: this is how CNNs see the whole image after a moderate number of layers.`,
        },
        {
          kind: 'derive',
          title: 'receptive field of a stack',
          goal: md`Show that $L$ layers with kernel sizes $k_l$ and strides $s_l$ have receptive field $r_L = 1 + \sum_{l=1}^{L}(k_l - 1)\prod_{i<l}s_i$, and compare three $3\times3$ layers with one $7\times7$ layer.`,
          steps: [
            {
              md: md`Let $J_l = \prod_{i\le l}s_i$ be the distance, in input pixels, between neighbouring units of layer $l$ (with $J_0 = 1$). A unit of layer $l$ reads $k_l$ neighbouring units of layer $l-1$, which are $J_{l-1}$ input pixels apart.`,
              choose: {
                prompt: md`How far apart, in input pixels, are neighbouring units of layer $l - 1$?`,
                options: [md`The product of the strides of the layers below, $J_{l-1}$`, md`Always 1`, md`$k_{l-1}$`],
                answer: 0,
                explain: md`Each stride multiplies the spacing. After two stride-2 layers, neighbouring units are 4 input pixels apart.`,
              },
            },
            { md: md`So the window widens by $(k_l - 1)J_{l-1}$: $r_l = r_{l-1} + (k_l - 1)J_{l-1}$ with $r_0 = 1$. Unrolling gives the formula.` },
            {
              md: md`Three $3\times3$ stride-1 layers: $r = 1 + 2 + 2 + 2 = 7$, the same as one $7\times7$ layer. With $C$ channels in and out they have $3\cdot 9C^2 = 27C^2$ weights versus $49C^2$, and two extra nonlinearities.`,
              choose: {
                prompt: md`Which stack has fewer weights for $C$ input and output channels?`,
                options: [md`Three $3\times3$ layers: $27C^2$`, md`One $7\times7$ layer: $49C^2$`, md`They are equal`],
                answer: 0,
                explain: md`$3 \cdot 3^2 = 27 < 49 = 7^2$. This is the argument VGG networks made for using only $3\times3$ kernels.`,
              },
            },
          ],
          takeaway: md`Small kernels stacked deeply see as far as large kernels with fewer parameters, and strides or pooling make the receptive field grow geometrically.`,
        },
        {
          kind: 'paper',
          problem: {
            id: 'dl03-1-paper',
            title: 'Shapes and parameters of a small CNN',
            type: 'compute',
            difficulty: 2,
            minutes: 10,
            statement: md`A CIFAR-10 network: input $32\times32\times3$; conv $3\times3$, 16 channels, padding 1, ReLU; max-pool $2\times2$; conv $3\times3$, 32 channels, padding 1, ReLU; max-pool $2\times2$; flatten; dense layer to 10 classes. Give the shape after each layer and the total number of parameters (with biases).`,
            solution: [
              md`Conv 1: $32\times32\times16$. Parameters $3\cdot3\cdot3\cdot16 + 16 = 448$.`,
              md`Pool: $16\times16\times16$, no parameters.`,
              md`Conv 2: $16\times16\times32$. Parameters $3\cdot3\cdot16\cdot32 + 32 = 4{,}640$.`,
              md`Pool: $8\times8\times32$; flatten to $2048$.`,
              md`Dense: $2048\cdot10 + 10 = 20{,}490$.`,
              md`Total: $448 + 4{,}640 + 20{,}490 = 25{,}578$. As in most small CNNs, the final dense layer holds most of the parameters; global average pooling instead of flattening would cut it to $32\cdot10 + 10 = 330$.`,
            ],
            answer: { kind: 'number', value: 25578 },
          },
        },
        {
          kind: 'exercise',
          ex: {
            id: 'dl03-1-ex',
            title: 'A 2-D convolution in NumPy',
            prompt: md`Implement \`conv2d(X, K, stride)\`: a "valid" (no padding) cross-correlation of a 2-D array \`X\` with a square kernel \`K\`. Use the output-size formula to allocate \`Y\`, then fill each entry with the sum of the element-wise product of \`K\` and the patch under it. Loops over output positions are fine here.`,
            starter: `import numpy as np

def conv2d(X, K, stride=1):
    """Valid cross-correlation of a 2-D array X with a 2-D kernel K."""
    k = K.shape[0]
    Y = np.zeros((1, 1))
    return Y

X = np.zeros((6, 6))
X[:, 3:] = 1.0                                        # dark left half, bright right half
K = np.array([[1.0, 0.0, -1.0]] * 3)                  # vertical-edge kernel
print(conv2d(X, K))`,
            solution: `import numpy as np

def conv2d(X, K, stride=1):
    """Valid cross-correlation of a 2-D array X with a 2-D kernel K."""
    k = K.shape[0]
    n_out = (X.shape[0] - k) // stride + 1
    m_out = (X.shape[1] - k) // stride + 1
    Y = np.zeros((n_out, m_out))
    for i in range(n_out):
        for j in range(m_out):
            patch = X[i * stride:i * stride + k, j * stride:j * stride + k]
            Y[i, j] = np.sum(patch * K)
    return Y

X = np.zeros((6, 6))
X[:, 3:] = 1.0                                        # dark left half, bright right half
K = np.array([[1.0, 0.0, -1.0]] * 3)                  # vertical-edge kernel
print(conv2d(X, K))`,
            tests: [
              { expr: 'conv2d(X, K).tolist()', label: 'edge image, stride 1' },
              { expr: 'conv2d(X, K, stride=2).tolist()', label: 'edge image, stride 2' },
              { expr: 'conv2d(np.arange(35.0).reshape(5, 7), np.array([[0.0, 1.0], [2.0, -1.0]])).tolist()', label: '5×7 input, 2×2 kernel' },
            ],
            hints: [
              md`Output size for valid convolution: \`(X.shape[0] - k) // stride + 1\`, and the same for the second axis.`,
              md`The patch for output \`(i, j)\` starts at row \`i * stride\` and column \`j * stride\`: \`X[i*stride:i*stride+k, j*stride:j*stride+k]\`.`,
              md`\`Y[i, j] = np.sum(patch * K)\`.`,
            ],
          },
        },
        {
          kind: 'recall',
          prompt: md`From memory: the output-size formula, the parameter count of a convolutional layer, and two reasons convolutions need far fewer parameters than dense layers on images.`,
          answer: md`$n_{\text{out}} = \lfloor(n + 2p - k)/s\rfloor + 1$. Parameters $k^2C_{\text{in}}C_{\text{out}} + C_{\text{out}}$. Reasons: **locality** (each output depends on a $k\times k$ patch, not the whole image) and **weight sharing** (the same kernel is used at every position, so the count does not grow with image size).`,
        },
      ],
      cards: [
        { id: 'dl03-1-c1', kind: 'compute', front: md`Output width: input 28, kernel 3, padding 0, stride 1.`, answer: { kind: 'number', value: 26 }, back: md`$(28 - 3)/1 + 1 = 26$.` },
        { id: 'dl03-1-c2', kind: 'compute', front: md`Parameters of a $5\times5$ convolution from 3 to 32 channels, with bias.`, answer: { kind: 'number', value: 2432 }, back: md`$5\cdot5\cdot3\cdot32 + 32 = 2400 + 32 = 2432$.` },
        { id: 'dl03-1-c3', kind: 'cloze', text: md`For stride 1 and an odd kernel size $k$, "same" padding is $p = $ {{}}.`, answers: ['(k-1)/2'] },
        { id: 'dl03-1-c4', kind: 'concept', front: md`What does a $1\times1$ convolution compute?`, back: md`At every pixel, a dense layer on the channel vector: $C_{\text{out}}\times C_{\text{in}}$ weights shared across positions. It mixes channels without looking at neighbours.` },
        { id: 'dl03-1-c5', kind: 'concept', front: md`Receptive field of three stacked $3\times3$ stride-1 convolutions, and why that stack is preferred over one $7\times7$.`, back: md`$1 + 2 + 2 + 2 = 7$. Same field, $27C^2$ instead of $49C^2$ weights, and two more nonlinearities.` },
      ],
    },
    // ------------------------------------------------------------------ 3.2
    {
      id: 'dl03-2',
      title: 'Embeddings',
      minutes: 35,
      objectives: [
        'Explain why one-hot vectors are a poor representation and what an embedding table is.',
        'Show that an embedding lookup equals a one-hot vector times the table, and describe the sparse gradient it receives.',
        'State the skip-gram with negative sampling objective and derive its gradient for the centre vector.',
        'Compute analogy arithmetic and rank words by cosine similarity on a small embedding.',
      ],
      cells: [
        {
          kind: 'text',
          md: md`Many inputs are categories: a token from a vocabulary of 50,000 to 250,000 entries, a user id, a product id. The simplest numeric encoding is **one-hot**: $\be_i \in \R^V$ with a 1 in position $i$. It works as an input to a linear layer, but it is wasteful and it carries no notion of similarity: any two different one-hot vectors are orthogonal and at the same distance $\sqrt2$, so "cat" is as far from "dog" as from "carburettor". An **embedding** assigns each category a learned dense vector, typically 64 to a few thousand dimensions, so that related items can end up close together.`,
        },
        {
          kind: 'callout',
          tone: 'definition',
          title: 'Embedding table and lookup',
          md: md`An embedding table $E \in \R^{V\times d}$ has one row per category. The embedding of category $i$ is row $i$:
$$\text{emb}(i) = E_{i,:} = \be_i\T E.$$
So a lookup is exactly a linear layer without bias applied to the one-hot vector. For a sequence of ids, stacking the one-hot rows into $O \in \R^{T\times V}$ gives $OE = E[\text{ids}] \in \R^{T\times d}$. Frameworks implement it as indexing (\`nn.Embedding\`), never as a matrix product, which would cost $TVd$ multiply-adds, almost all by zero.`,
        },
        {
          kind: 'viz',
          viz: { type: 'dl.embedlookup', mode: 'forward', ids: [0, 1, 3, 0, 5] },
          task: md`Click different tokens and watch which row of $E$ the one-hot vector selects. Then find where "the" appears in the sentence matrix below.`,
          caption: md`The one-hot row has a single 1, so the product with $E$ copies one row and discards the rest. A sentence becomes a $T\times d$ matrix of rows, here $5\times4$; repeated tokens produce identical rows.`,
        },
        {
          kind: 'numeric',
          q: md`$E = \begin{bmatrix} 0.2 & -1 & 0.5 \\ 1 & 0 & 2 \\ -0.3 & 0.7 & 1.1 \\ 4 & 4 & 0 \end{bmatrix}$ and ids are 0-based. Compute $\be_2\T E$.`,
          answer: { kind: 'vector', value: [-0.3, 0.7, 1.1] },
          explain: md`$\be_2 = (0, 0, 1, 0)$ picks row 2 (the third row): $(-0.3, 0.7, 1.1)$.`,
        },
        {
          kind: 'numeric',
          q: md`A language model has a vocabulary of $V = 50{,}000$ tokens and embedding size $d = 768$. How many parameters does its input embedding table have?`,
          answer: { kind: 'number', value: 38400000 },
          explain: md`$50{,}000 \times 768 = 38{,}400{,}000$, about 38 million. GPT-2 small (124M parameters, $V = 50{,}257$) spends about 31% of its parameters here. Many models **tie** the input embedding and the output projection (the same matrix used in both places) to save these parameters.`,
        },
        {
          kind: 'code',
          code: `import numpy as np

np.random.seed(0)
V, d = 6, 4
E = np.round(np.random.randn(V, d), 2)       # embedding table, one row per token
ids = np.array([0, 1, 3, 0, 5])              # a sentence of token ids

one_hot = np.eye(V)[ids]                     # (5, 6)
print(np.allclose(one_hot @ E, E[ids]))`,
          predict: {
            q: md`Is the one-hot product equal to fancy indexing?`,
            options: ['`True`', '`False`', '`[ True  True  True  True  True]`', 'an error: the shapes do not match'],
            answer: 0,
            explain: md`$(5\times6)(6\times4) = 5\times4$, the same as \`E[ids]\`, and each row of the product is the selected row of $E$.`,
          },
        },
        {
          kind: 'derive',
          title: 'the gradient of a lookup is a scatter-add',
          goal: md`For outputs $\bx_t = \be_{\text{id}_t}\T E$, $t = 1, \dots, T$, with upstream gradients $\bg_t = \partial L/\partial\bx_t$, find $\partial L/\partial E$.`,
          steps: [
            {
              md: md`Stack the one-hot rows into $O$ and the gradients into $G \in \R^{T\times d}$. The layer is $X = OE$, a linear map in $E$, so by the rule for $Z = AW$: $$\pd{L}{E} = O\T G.$$`,
              choose: {
                prompt: md`$X = OE$ is linear in $E$. Which rule gives the gradient?`,
                options: [md`$\partial L/\partial E = O\T\,\partial L/\partial X$`, md`$\partial L/\partial E = (\partial L/\partial X)\,O\T$`, md`$\partial L/\partial E = O\,\partial L/\partial X$`],
                answer: 0,
                explain: md`For $X = OE$ the gradient with respect to the right factor is $O\T(\partial L/\partial X)$; check the shapes: $(V\times T)(T\times d) = V\times d$.`,
              },
            },
            { md: md`Row $w$ of $O\T G$ is $\sum_t [\text{id}_t = w]\,\bg_t$: the sum of the gradients of all positions where token $w$ occurred. Rows of tokens that did not occur in the batch get exactly zero.` },
            { md: md`So the backward pass is a **scatter-add** into the rows that were read. Only those rows change in an SGD step, which is why embedding tables of recommenders with billions of ids are trained with sparse updates. (With AdamW's weight decay or momentum, untouched rows can still change unless the optimizer handles sparsity.)` },
          ],
          takeaway: md`A lookup reads a few rows forward and writes into the same rows backward. Tokens that appear twice accumulate both gradients.`,
        },
        {
          kind: 'viz',
          viz: { type: 'dl.embedlookup', mode: 'backward', ids: [0, 1, 3, 0, 5] },
          task: md`Switch to **gradient** and check the row for "the" against the two upstream gradient rows that produced it. Which rows of $\partial L/\partial E$ are zero, and why?`,
          caption: md`Positions 0 and 3 are both "the", so row "the" of $\partial L/\partial E$ is the sum of their gradients. "dog" and "ran" do not occur, so their rows stay zero.`,
        },
        {
          kind: 'code',
          code: `import numpy as np

V, d = 6, 2
ids = np.array([0, 1, 3, 0])                     # token 0 appears twice
G = np.array([[1.0, 0.0], [0.5, 0.5], [0.0, 2.0], [1.0, -1.0]])   # dL/d(output rows), (4, 2)

dE = np.eye(V)[ids].T @ G                        # (6, 4) @ (4, 2) -> (6, 2)
print(dE)`,
          note: md`Row 0 is $(1, 0) + (1, -1) = (2, -1)$; rows 2, 4 and 5 are zero. PyTorch computes the same thing with an index-add instead of the dense product.`,
        },
        {
          kind: 'text',
          md: md`**Where good embeddings come from.** The *distributional hypothesis* says that words occurring in similar contexts have similar meanings. **word2vec** (Mikolov et al. 2013) turned this into a training objective. In the **skip-gram** model, every word $w$ has a centre vector $\bv_w$ and a context vector $\bu_w$. For each word in a corpus and each word $c$ within a small window around it, the model should score the pair $(w, c)$ high and pairs with random words low. The learned $\bv_w$ are the embeddings. No labels are needed: the text supervises itself, an early example of the self-supervised pre-training that language models scaled up.`,
        },
        {
          kind: 'callout',
          tone: 'definition',
          title: 'Skip-gram with negative sampling (SGNS)',
          md: md`For a centre word $w$, an observed context word $c$, and $K$ negative words $n_1, \dots, n_K$ drawn from the unigram distribution raised to the power $3/4$:
$$\ell = -\ln\sigma(\bu_c\T\bv_w) - \sum_{k=1}^{K}\ln\sigma(-\bu_{n_k}\T\bv_w).$$
This is binary logistic regression: "is $c$ a real context of $w$?" with the dot product as the logit. $K$ is typically 5 to 20.`,
        },
        {
          kind: 'derive',
          title: 'what an SGNS step does to the centre vector',
          goal: md`Compute $\partial\ell/\partial\bv_w$ and describe the update.`,
          steps: [
            {
              md: md`Use $\dfrac{d}{dz}\left[-\ln\sigma(z)\right] = -(1 - \sigma(z))$. For the positive term, $z = \bu_c\T\bv_w$ and $\partial z/\partial\bv_w = \bu_c$: $$\pd{}{\bv_w}\left[-\ln\sigma(\bu_c\T\bv_w)\right] = -(1 - \sigma(\bu_c\T\bv_w))\,\bu_c.$$`,
              choose: {
                prompt: md`What is $\dfrac{d}{dz}\ln\sigma(z)$?`,
                options: [md`$1 - \sigma(z)$`, md`$\sigma(z)$`, md`$\sigma(z)(1-\sigma(z))$`],
                answer: 0,
                explain: md`$\dfrac{\sigma'(z)}{\sigma(z)} = \dfrac{\sigma(1-\sigma)}{\sigma} = 1 - \sigma(z)$.`,
              },
            },
            { md: md`For a negative, $z = -\bu_n\T\bv_w$, so $\dfrac{\partial}{\partial\bv_w}[-\ln\sigma(-\bu_n\T\bv_w)] = (1 - \sigma(-\bu_n\T\bv_w))\,\bu_n = \sigma(\bu_n\T\bv_w)\,\bu_n$.` },
            { md: md`Altogether $$\pd{\ell}{\bv_w} = -(1 - \sigma(\bu_c\T\bv_w))\,\bu_c + \sum_k\sigma(\bu_{n_k}\T\bv_w)\,\bu_{n_k}.$$ A gradient step moves $\bv_w$ **toward** the true context vector and **away** from the negatives, each weighted by how wrong the current prediction is. Words that share contexts are pulled toward the same context vectors and so toward each other.` },
          ],
          takeaway: md`The same "prediction minus target" structure as softmax cross-entropy appears here: $\sigma(z) - y$ times the other vector.`,
        },
        {
          kind: 'viz',
          viz: { type: 'dl.analogy', a: 'king', b: 'man', c: 'woman' },
          task: md`Compute king − man + woman and read the nearest word. Then try boy − man + woman. Finally drag "queen" away from the arrow's tip and see how quickly the analogy fails.`,
          caption: md`If the embedding encodes "male to female" as a roughly constant offset, then $\bv_{\text{king}} - \bv_{\text{man}} + \bv_{\text{woman}}$ lands near $\bv_{\text{queen}}$. This toy embedding was built by hand to have that structure. In real embeddings the result is usually not exactly a word vector, and the query words themselves are often the nearest neighbours, which is why they are excluded.`,
        },
        {
          kind: 'numeric',
          q: md`In the toy embedding, king $= (3.5, -1.1)$, man $= (1.5, -1)$, woman $= (1.5, 1)$. Compute king − man + woman.`,
          answer: { kind: 'vector', value: [3.5, 0.9] },
          explain: md`$(3.5 - 1.5 + 1.5,\ -1.1 + 1 + 1) = (3.5, 0.9)$. Queen is at $(3.4, 1.0)$, with cosine similarity about $0.999$.`,
        },
        {
          kind: 'code',
          code: `import numpy as np

words = ["man", "woman", "boy", "girl", "king", "queen", "apple", "pear"]
E = np.array([[1.5, -1.0], [1.5, 1.0], [0.6, -1.2], [0.6, 1.1],
              [3.5, -1.1], [3.4, 1.0], [-2.0, 0.3], [-2.2, -0.4]])
idx = {w: i for i, w in enumerate(words)}

q = E[idx["king"]] - E[idx["man"]] + E[idx["woman"]]
En = E / np.linalg.norm(E, axis=1, keepdims=True)      # unit rows
cos = En @ (q / np.linalg.norm(q))
for w in ["king", "man", "woman"]:
    cos[idx[w]] = -np.inf                               # exclude the query words
print(words[int(np.argmax(cos))])`,
          predict: {
            q: md`Which word is printed?`,
            options: ['`queen`', '`woman`', '`king`', '`girl`'],
            answer: 0,
            explain: md`After excluding the three query words, queen has the highest cosine similarity (about 0.999), followed by girl (about 0.68). Without the exclusion, queen would still win here, but woman (about 0.94) would be close behind.`,
          },
          note: md`Normalizing the rows once and taking one matrix-vector product scores every word at once. Vector databases do the same with approximate nearest-neighbour indexes over millions of rows.`,
        },
        {
          kind: 'callout',
          tone: 'warning',
          title: 'Read analogy results with care',
          md: md`Analogy benchmarks exclude the query words, and with that rule word2vec answers a good share of standard analogy questions; without it, the nearest neighbour is often one of the inputs. The offsets that make analogies work also encode social biases present in the training text: a well-known example (Bolukbasi et al. 2016) found that "man : computer programmer :: woman : homemaker" in embeddings trained on news text. Embeddings inherit the statistics of their data.`,
        },
        {
          kind: 'text',
          md: md`**Embeddings in current systems.** Every language model starts with a token embedding table and often reuses it as the output layer (weight tying). Recommendation and search systems commonly use **two-tower** models: one network embeds the user or query, another the item, and the score is their dot product, so items can be retrieved by nearest-neighbour search. Retrieval-augmented generation uses a text embedding model the same way to find relevant passages. The next lesson covers how such encoders are trained.`,
        },
        {
          kind: 'paper',
          problem: {
            id: 'dl03-2-paper',
            title: 'Gradient of an embedding table with a repeated token',
            type: 'compute',
            difficulty: 1,
            minutes: 6,
            statement: md`An embedding table has $V = 4$ rows of dimension 2. The input sentence has ids $(2, 0, 2)$, and the upstream gradients for the three positions are $\bg_1 = (1, 1)$, $\bg_2 = (0, 3)$, $\bg_3 = (-2, 1)$. Write $\partial L/\partial E$ as a $4\times2$ matrix.`,
            solution: [
              md`Row 2 receives positions 1 and 3: $(1, 1) + (-2, 1) = (-1, 2)$.`,
              md`Row 0 receives position 2: $(0, 3)$.`,
              md`Rows 1 and 3 do not occur: $(0, 0)$. So $\partial L/\partial E = \begin{bmatrix}0 & 3\\0 & 0\\-1 & 2\\0 & 0\end{bmatrix}$.`,
            ],
            answer: { kind: 'matrix', value: [[0, 3], [0, 0], [-1, 2], [0, 0]] },
          },
        },
        {
          kind: 'explain',
          prompt: md`An interviewer asks: *why use learned embeddings instead of one-hot encoding for a categorical feature with a million values?*`,
          model: md`One-hot vectors are $V$-dimensional, sparse and mutually orthogonal, so they carry no similarity between categories and the first layer on top of them needs $V\times d$ weights anyway. An embedding table is exactly that first layer, $\be_i\T E$, implemented as a row lookup: it maps each category to a dense $d$-dimensional vector with $d \ll V$ and is trained end to end, so categories that behave similarly get nearby vectors and can share statistical strength, which helps rare categories. Lookups are cheap, gradients only touch the rows used in the batch, and the vectors can be reused for retrieval by nearest-neighbour search. The cost is memory, $Vd$ parameters, which for very large id spaces is handled with hashing, sharding or mixed-dimension tables.`,
        },
      ],
      cards: [
        { id: 'dl03-2-c1', kind: 'concept', front: md`Write an embedding lookup as a matrix product, and say how it is actually implemented.`, back: md`$\text{emb}(i) = \be_i\T E$, row $i$ of $E \in \R^{V\times d}$. Implemented as indexing \`E[ids]\`, not as a product.` },
        { id: 'dl03-2-c2', kind: 'concept', front: md`What is the gradient of the loss with respect to an embedding table?`, back: md`$O\T G$: each row receives the sum of the upstream gradients of the positions where that token occurred; rows not used in the batch get zero.` },
        { id: 'dl03-2-c3', kind: 'compute', front: md`Parameters of an embedding table with $V = 32{,}000$ and $d = 4096$.`, answer: { kind: 'number', value: 131072000 }, back: md`$32{,}000 \times 4096 = 131{,}072{,}000$, about 131 million.` },
        { id: 'dl03-2-c4', kind: 'cloze', text: md`In word2vec's negative sampling, negatives are drawn from the unigram distribution raised to the power {{}}.`, answers: ['3/4'] },
        { id: 'dl03-2-c5', kind: 'concept', front: md`Why are one-hot vectors a poor representation of words?`, back: md`They are $V$-dimensional and every pair is orthogonal and equidistant, so they encode no similarity; a learned dense embedding can place related words close together.` },
      ],
    },
    // ------------------------------------------------------------------ 3.3
    {
      id: 'dl03-3',
      title: 'Representation learning and sequences',
      minutes: 40,
      objectives: [
        'Write the InfoNCE loss with in-batch negatives and compute it for a small similarity matrix.',
        'Explain the role of the temperature and of the batch size in contrastive learning, and describe a CLIP-style dual encoder.',
        'Choose between feature extraction, full fine-tuning and parameter-efficient fine-tuning for a given data size and domain shift.',
        'Write the RNN recurrence and show why its gradient through time is a product of $T$ Jacobians.',
        'Explain why attention replaced recurrence: sequential computation and long gradient paths.',
      ],
      cells: [
        {
          kind: 'text',
          md: md`Labels are expensive, but pairs of things that belong together are everywhere: an image and its caption, two crops of the same photo, a query and the document a user clicked, a question and its answer. **Contrastive learning** trains encoders so that matching pairs get similar embeddings and non-matching pairs get dissimilar ones. The resulting encoders are used for retrieval, zero-shot classification and as starting points for other tasks.`,
        },
        {
          kind: 'callout',
          tone: 'definition',
          title: 'InfoNCE with in-batch negatives',
          md: md`Take a batch of $N$ matching pairs $(x_i, y_i)$, encode them to unit vectors $\bu_i = f(x_i)$, $\bv_i = g(y_i)$, and form the similarity logits $s_{ij} = \bu_i\T\bv_j/\tau$ with a temperature $\tau > 0$. Then
$$L_i = -\ln\frac{e^{s_{ii}}}{\sum_{j=1}^{N}e^{s_{ij}}}, \qquad L = \frac1N\sum_i L_i.$$
Row $i$ is a softmax classification over the $N$ candidates, with the correct "class" on the diagonal. The other $N - 1$ items in the batch serve as **negatives** for free. A loss of $\ln N$ means chance level.`,
        },
        {
          kind: 'viz',
          viz: { type: 'dl.contrastive', tau: 0.3, img: [10, 100, 190, 280], txt: [35, 80, 215, 300] },
          task: md`Drag caption T1 toward image I2 and watch row 1 and column 2 of the matrix. Then lower $\tau$ to 0.05 and raise it to 1: what happens to the loss when every pair is already correctly matched?`,
          caption: md`Each row of the matrix is a softmax over captions for one image; the dashed green segments join true pairs. Moving a caption toward the wrong image raises two losses at once: its own row and the other image's row. A small $\tau$ sharpens the softmax, so well-separated pairs give a loss near 0 and confusions are punished hard; a large $\tau$ flattens it toward $\ln N$ no matter how good the embedding is.`,
        },
        {
          kind: 'numeric',
          q: md`A batch of two pairs has similarities $\bu_1\T\bv_1 = 1$ and $\bu_1\T\bv_2 = 0$, with $\tau = 1$. Compute $L_1$.`,
          answer: { kind: 'number', value: 0.31326168751822286 },
          hints: [md`$L_1 = -\ln\dfrac{e^{1}}{e^{1} + e^{0}} = \ln(1 + e^{-1})$.`],
          explain: md`$L_1 = \ln(1 + e^{-1}) \approx \ln 1.3679 \approx 0.3133$. With $\tau = 0.1$ the logits become 10 and 0 and the loss drops to $\ln(1 + e^{-10}) \approx 4.5\times10^{-5}$.`,
        },
        {
          kind: 'derive',
          title: 'hard negatives get the largest push',
          goal: md`Find $\partial L_i/\partial s_{ij}$ and interpret it.`,
          steps: [
            {
              md: md`$L_i$ is softmax cross-entropy on the logits $(s_{i1}, \dots, s_{iN})$ with the one-hot target at position $i$. From Module dl01: $$\pd{L_i}{s_{ij}} = p_{ij} - [j = i], \qquad p_{ij} = \frac{e^{s_{ij}}}{\sum_k e^{s_{ik}}}.$$`,
              choose: {
                prompt: md`Which known result applies to each row of InfoNCE?`,
                options: [md`Softmax with cross-entropy: gradient $\bp - \by$`, md`Mean squared error`, md`The sigmoid derivative $\sigma(1-\sigma)$`],
                answer: 0,
                explain: md`Each row is an $N$-way classification, so the logit gradient is prediction minus one-hot target.`,
              },
            },
            { md: md`For the positive, $\partial L_i/\partial s_{ii} = p_{ii} - 1 \le 0$: gradient descent raises its similarity. For a negative, $\partial L_i/\partial s_{ij} = p_{ij} \ge 0$: it is pushed down in proportion to its current probability.` },
            { md: md`So negatives that already look different ($p_{ij} \approx 0$) contribute almost nothing, and **hard negatives**, those the model currently confuses with the positive, get most of the gradient. Since $s_{ij} = \bu_i\T\bv_j/\tau$, all of this is scaled by $1/\tau$ when passed back to the embeddings.` },
          ],
          takeaway: md`More negatives per batch means more chances to include hard ones, which is one reason contrastive models are trained with large batches (CLIP used 32,768) or with mined hard negatives.`,
        },
        {
          kind: 'check',
          q: md`With all pairs already correctly ranked, what does lowering the temperature $\tau$ do to the InfoNCE loss?`,
          options: [md`The loss decreases toward 0, and the gradient concentrates on the hardest negatives`, md`The loss increases toward $\ln N$`, md`Nothing; $\tau$ only rescales the embeddings, which are normalized anyway`, md`The loss becomes negative`],
          answer: 0,
          explain: md`Dividing by a smaller $\tau$ widens the gaps between logits, so the softmax puts more mass on the diagonal. The embeddings are normalized, but the logits are not: $\tau$ sets their scale. CLIP learns $\tau$ (initialized at 0.07).`,
        },
        {
          kind: 'code',
          code: `import numpy as np

def log_softmax(S):
    S = S - S.max(axis=1, keepdims=True)
    return S - np.log(np.exp(S).sum(axis=1, keepdims=True))

np.random.seed(0)
N, d, tau = 4, 8, 0.1
img = np.random.randn(N, d)
txt = img + 0.5 * np.random.randn(N, d)          # captions: noisy copies of the images
img /= np.linalg.norm(img, axis=1, keepdims=True)
txt /= np.linalg.norm(txt, axis=1, keepdims=True)

S = img @ txt.T / tau                             # (N, N) similarity logits
labels = np.arange(N)                             # the match for row i is column i
loss_i2t = -log_softmax(S)[labels, labels].mean()
loss_t2i = -log_softmax(S.T)[labels, labels].mean()
print(round(float((loss_i2t + loss_t2i) / 2), 4), round(float(np.log(N)), 4))`,
          note: md`The symmetric loss is far below $\ln 4 \approx 1.386$ because each caption is a noisy copy of its image. Replace \`txt\` by an independent \`np.random.randn(N, d)\` and the loss rises to around chance level or above. This is the whole training objective of a CLIP-style model; the encoders producing \`img\` and \`txt\` are what gets learned.`,
        },
        {
          kind: 'callout',
          tone: 'definition',
          title: 'Dual encoders (CLIP)',
          md: md`CLIP (Radford et al. 2021) trains an image encoder and a text encoder on a large set of image-caption pairs with the **symmetric** InfoNCE loss: the average of the row-wise loss (image to text) and the column-wise loss (text to image). Because the two encoders never look at each other's input, embeddings can be precomputed and compared with a dot product. **Zero-shot classification**: embed prompts such as "a photo of a {label}" for every class and pick the class whose text embedding has the highest cosine similarity with the image. The same dual-encoder structure, trained on query-document or user-item pairs, powers dense retrieval and two-tower recommenders.`,
        },
        {
          kind: 'text',
          md: md`**Transfer learning.** A network pre-trained on a large dataset has learned features that are useful for other tasks: edges and textures in early CNN layers, object parts later; syntax and semantics in language models. There are three standard ways to reuse it:

| strategy | what is trained | typical use |
|---|---|---|
| feature extraction (linear probe) | only a new head on frozen features | little labelled data, target domain close to pre-training |
| full fine-tuning | all weights, with a small learning rate | more data, or a substantial domain shift |
| parameter-efficient fine-tuning | small added modules, e.g. LoRA's low-rank $W + BA$ | large models, many tasks, limited memory |

Fine-tuning everything on a small dataset risks overfitting and forgetting what pre-training learned; common mitigations are a lower learning rate for the backbone than for the head, freezing early layers, and early stopping. LoRA freezes $W$ and learns $W + BA$ with $B \in \R^{d\times r}$, $A \in \R^{r\times d}$ and small $r$, the low-rank idea from the SVD module.`,
        },
        {
          kind: 'check',
          q: md`You have 300 labelled X-ray images and an ImageNet-pre-trained ResNet. Which plan is most reasonable to start with?`,
          options: [
            md`Freeze the backbone, train a new classifier head (linear probe), then try fine-tuning the last block with a small learning rate if validation allows`,
            md`Train a ResNet from scratch on the 300 images`,
            md`Fine-tune all layers with the original ImageNet learning rate`,
            md`Use the ImageNet classifier as is and map its 1000 classes to the X-ray labels`,
          ],
          answer: 0,
          explain: md`With 300 images, training from scratch or fine-tuning everything aggressively overfits. Frozen features plus a small head is the safe baseline. X-rays differ from ImageNet photos, so partially fine-tuning the later layers with a small learning rate often helps, judged on a validation set.`,
        },
        {
          kind: 'text',
          md: md`**Recurrent networks.** Before transformers, sequences were usually modelled with a **recurrent neural network** (RNN), which reads one element at a time and carries a hidden state:
$$\bh_t = \tanh(W_{hh}\bh_{t-1} + W_{xh}\bx_t + \bb).$$
The same weights are used at every step, so an RNN handles any length with a fixed number of parameters. Training unrolls the recurrence into a deep graph with $T$ copies of the cell and runs backpropagation through it (**backpropagation through time**, BPTT). The gradient from step $T$ back to step $t$ passes through every step in between:
$$\pd{\bh_T}{\bh_t} = \prod_{k=t+1}^{T}\diag(1 - \bh_k^2)\,W_{hh}.$$
This is the sigmoid-chain problem of Module dl01 again, with the same matrix multiplied in at every step: when its largest singular value is below 1 the gradient vanishes geometrically, when it is above 1 it can explode. LSTMs and GRUs add gates and an additive cell state to keep a path open, and gradient clipping handles explosions, but information from far back remains hard to use.`,
        },
        {
          kind: 'viz',
          viz: { type: 'dl.rnn', T: 30, w: 0.9, act: 'linear' },
          task: md`For the linear RNN, set $w = 0.9$ and read how much gradient from step 30 reaches step 0. Then try $w = 1.1$, and the tanh RNN with $w = 1.1$. Finally make the sequence 60 steps long.`,
          caption: md`For the scalar linear RNN $h_t = wh_{t-1} + x_t$, $\partial h_T/\partial h_t = w^{T-t}$: a straight line on this log scale, falling for $|w| < 1$ and rising for $|w| > 1$. tanh multiplies in factors $1 - h^2 \le 1$, so it can only shrink the gradient further. Attention gives every position a direct edge to every later one: path length 1, no product over time.`,
        },
        {
          kind: 'numeric',
          q: md`In a scalar linear RNN with $w = 0.9$, by what factor is the gradient multiplied between step 50 and step 0?`,
          answer: { kind: 'number', value: 0.00515377520732012, tol: 5e-5 },
          explain: md`$0.9^{50} \approx 0.0052$. Information 50 steps back contributes about 0.5% of its original gradient. With $w = 1.1$ the factor is $1.1^{50} \approx 117$.`,
        },
        {
          kind: 'code',
          code: `import numpy as np

np.random.seed(0)
T, d_in, d_h = 5, 3, 4
X = np.random.randn(T, d_in)
W_xh = np.random.randn(d_h, d_in) * 0.5
W_hh = np.random.randn(d_h, d_h) * 0.5
b = np.zeros(d_h)

h = np.zeros(d_h)
H = []
for t in range(T):                     # one step at a time: h_t depends on h_{t-1}
    h = np.tanh(W_hh @ h + W_xh @ X[t] + b)
    H.append(h)
H = np.array(H)
print(H.shape)`,
          predict: {
            q: md`What shape is printed?`,
            options: ['`(5, 4)`', '`(4, 5)`', '`(5, 3)`', '`(4,)`'],
            answer: 0,
            explain: md`One hidden state of size 4 per time step, for 5 steps. Note the Python loop: step $t$ cannot start before step $t - 1$ finishes, so the $T$ steps cannot run in parallel across time.`,
          },
        },
        {
          kind: 'callout',
          tone: 'intuition',
          title: 'Why attention replaced recurrence',
          md: md`1. **Parallel training.** An RNN layer needs $T$ sequential steps per sequence. A self-attention layer computes all positions at once with a few large matrix products, which is what GPUs and TPUs are built for.
2. **Short paths.** In an RNN, information from position 1 reaches position $T$ through $T - 1$ applications of the recurrence, and gradients travel the same long path back. Attention connects every pair of positions directly, a path of length 1 per layer.
3. **The price.** Attention compares all pairs, so a layer costs $O(T^2d)$ compute and, naively, $O(T^2)$ memory, compared with $O(Td^2)$ for an RNN layer. Much of the engineering in the next part (FlashAttention, KV caching, sparse and linear attention) manages this cost. State-space and linear-recurrent models revisit recurrence in a form that can be trained in parallel.`,
        },
        {
          kind: 'paper',
          problem: {
            id: 'dl03-3-paper',
            title: 'Size and gradient of a small RNN',
            type: 'compute',
            difficulty: 2,
            minutes: 10,
            statement: md`An RNN has input size 64 and hidden size 128: $\bh_t = \tanh(W_{hh}\bh_{t-1} + W_{xh}\bx_t + \bb)$. (a) How many parameters does the recurrent layer have? (b) Does the count depend on the sequence length? (c) Show that $\left\lVert\partial\bh_T/\partial\bh_0\right\rVert_2 \le \lVert W_{hh}\rVert_2^{T}$, and evaluate the bound for $\lVert W_{hh}\rVert_2 = 0.9$ and $T = 50$. Enter the parameter count.`,
            hints: [md`$|\tanh'| \le 1$, so $\lVert\diag(1 - \bh_k^2)\rVert_2 \le 1$; the operator norm of a product is at most the product of norms.`],
            solution: [
              md`(a) $W_{hh}$: $128 \times 128 = 16{,}384$; $W_{xh}$: $128 \times 64 = 8{,}192$; $\bb$: 128. Total $24{,}704$.`,
              md`(b) No. The same weights are applied at every step, so a sequence of length 10 or 10,000 uses the same 24,704 parameters (while the activations stored for BPTT grow with $T$).`,
              md`(c) $\partial\bh_T/\partial\bh_0 = \prod_{k=1}^{T}\diag(1 - \bh_k^2)\,W_{hh}$. Each diagonal factor has entries in $[0, 1]$, so its operator norm is at most 1. By submultiplicativity the norm of the product is at most $\lVert W_{hh}\rVert_2^{T}$.`,
              md`For $\lVert W_{hh}\rVert_2 = 0.9$ and $T = 50$: $0.9^{50} \approx 0.0052$. The gradient from step 50 to step 0 is at most half a percent of the upstream gradient.`,
            ],
            answer: { kind: 'number', value: 24704 },
          },
        },
        {
          kind: 'explain',
          prompt: md`An interviewer asks: *why did transformers replace RNNs for language modelling?* Answer in a few sentences.`,
          model: md`Two reasons, one about compute and one about optimization. An RNN computes $\bh_t$ from $\bh_{t-1}$, so a sequence of length $T$ needs $T$ sequential steps even during training; self-attention computes all positions in parallel with large matrix multiplications, so it uses accelerators far better and scales to much more data. Second, in an RNN information and gradients between positions $t$ and $T$ pass through $T - t$ applications of the same recurrence, a product of Jacobians that tends to vanish or explode, so long-range dependencies are hard to learn even with LSTM gating. Attention connects every pair of positions with a path of length one. The cost is quadratic time and memory in sequence length, which motivates FlashAttention, KV caching at inference, and alternatives such as state-space models.`,
        },
      ],
      cards: [
        { id: 'dl03-3-c1', kind: 'concept', front: md`Write the InfoNCE loss for row $i$ with in-batch negatives.`, back: md`$L_i = -\ln\dfrac{e^{\bu_i\T\bv_i/\tau}}{\sum_j e^{\bu_i\T\bv_j/\tau}}$: softmax cross-entropy over the batch with the match on the diagonal. CLIP averages it over rows and columns.` },
        { id: 'dl03-3-c2', kind: 'compute', front: md`InfoNCE loss when the model is at chance level with batch size $N = 256$ (natural log, 3 decimals).`, answer: { kind: 'number', value: 5.545177, tol: 1e-3 }, back: md`$\ln 256 = 8\ln 2 \approx 5.545$.` },
        { id: 'dl03-3-c3', kind: 'concept', front: md`Feature extraction versus fine-tuning: when do you choose each?`, back: md`Frozen features plus a head for little data and a similar domain; fine-tuning (small learning rate, possibly only later layers) for more data or a larger domain shift; LoRA-style PEFT for large models and many tasks.` },
        { id: 'dl03-3-c4', kind: 'cloze', text: md`Training an RNN by unrolling it over time and running backpropagation is called backpropagation through {{}}.`, answers: ['time'] },
        { id: 'dl03-3-c5', kind: 'concept', front: md`Two reasons attention replaced recurrence, and its main cost.`, back: md`Parallel computation over positions (no $T$ sequential steps) and a path of length 1 between any two positions (no long products of Jacobians). Cost: $O(T^2)$ compute and memory per layer.` },
      ],
    },
  ],
  problems: [
    {
      id: 'dl03-p1',
      title: 'Feature-map sizes through a ResNet stem',
      type: 'compute',
      difficulty: 1,
      minutes: 6,
      statement: md`A $224\times224$ image passes through: conv $7\times7$, stride 2, padding 3; max-pool $3\times3$, stride 2, padding 1; conv $3\times3$, stride 1, padding 1; conv $3\times3$, stride 2, padding 1. Give the spatial size after each of the four layers.`,
      solution: [
        md`$\lfloor(224 + 6 - 7)/2\rfloor + 1 = \lfloor 111.5\rfloor + 1 = 112$.`,
        md`$\lfloor(112 + 2 - 3)/2\rfloor + 1 = \lfloor 55.5\rfloor + 1 = 56$.`,
        md`$\lfloor(56 + 2 - 3)/1\rfloor + 1 = 56$.`,
        md`$\lfloor(56 + 2 - 3)/2\rfloor + 1 = \lfloor 27.5\rfloor + 1 = 28$.`,
      ],
      answer: { kind: 'vector', value: [112, 56, 56, 28] },
    },
    {
      id: 'dl03-p2',
      title: 'Convolution versus a dense layer',
      type: 'compute',
      difficulty: 1,
      minutes: 6,
      statement: md`A $3\times3$ convolution with "same" padding maps a $224\times224\times3$ image to $224\times224\times64$. (a) How many parameters does it have? (b) How many would a dense layer between the same input and output tensors have? (c) Which two assumptions account for the difference? Enter (a).`,
      solution: [
        md`(a) $3\cdot3\cdot3\cdot64 + 64 = 1{,}728 + 64 = 1{,}792$.`,
        md`(b) Input size $224\cdot224\cdot3 = 150{,}528$, output size $224\cdot224\cdot64 = 3{,}211{,}264$. Weights $150{,}528 \times 3{,}211{,}264 \approx 4.8\times10^{11}$, plus $3{,}211{,}264$ biases.`,
        md`(c) Locality (each output uses a $3\times3$ neighbourhood) and weight sharing (the same kernel at every position). Together they remove a factor of about $2.7\times10^{8}$.`,
      ],
      answer: { kind: 'number', value: 1792 },
    },
    {
      id: 'dl03-p3',
      title: 'Receptive field with strides',
      type: 'derive',
      difficulty: 2,
      minutes: 10,
      statement: md`Five $3\times3$ convolutions are stacked with strides $1, 2, 1, 2, 1$. (a) Derive the recursion $r_l = r_{l-1} + (k_l - 1)J_{l-1}$, where $J_l$ is the product of the first $l$ strides. (b) Compute the receptive field of the last layer.`,
      solution: [
        md`(a) A unit of layer $l$ reads $k_l$ adjacent units of layer $l-1$. Adjacent units of layer $l-1$ are $J_{l-1}$ input pixels apart, so the union of their receptive fields spans $r_{l-1} + (k_l - 1)J_{l-1}$ input pixels.`,
        md`(b) The strides before each layer give $J_0, \dots, J_4 = 1, 1, 2, 2, 4$.`,
        md`$r = 1 + 2(1 + 1 + 2 + 2 + 4) = 1 + 20 = 21$.`,
        md`With all strides 1 it would be $1 + 2\cdot5 = 11$. Downsampling early makes later layers' kernels cover more of the input.`,
      ],
      answer: { kind: 'number', value: 21 },
      rubric: [md`Explains why neighbouring units are $J_{l-1}$ pixels apart`, md`Correct recursion`, md`Correct jumps and final value`],
      areas: ['ml-depth'],
    },
    {
      id: 'dl03-p4',
      title: 'An embedding layer is a linear layer',
      type: 'proof',
      difficulty: 2,
      minutes: 10,
      statement: md`Let $E \in \R^{V\times d}$. (a) Prove that $\be_i\T E = E_{i,:}$. (b) A model computes $\bx = \be_i\T E$ and then $L(\bx)$. Prove that $\partial L/\partial E = \be_i\,(\partial L/\partial\bx)$, an outer product with a single nonzero row. (c) Conclude what one SGD step does to the table.`,
      solution: [
        md`(a) $(\be_i\T E)_j = \sum_k(\be_i)_kE_{kj} = E_{ij}$, since only $k = i$ contributes.`,
        md`(b) $x_j = \sum_k(\be_i)_kE_{kj}$, so $\partial x_j/\partial E_{kl} = (\be_i)_k[j = l]$. Then $\dfrac{\partial L}{\partial E_{kl}} = \sum_j\dfrac{\partial L}{\partial x_j}(\be_i)_k[j = l] = (\be_i)_k\dfrac{\partial L}{\partial x_l}$, the $(k, l)$ entry of $\be_i\,(\partial L/\partial\bx)$.`,
        md`(c) Only row $i$ is nonzero: an SGD step changes $E_{i,:}$ by $-\eta\,\partial L/\partial\bx$ and leaves every other row unchanged.`,
      ],
      rubric: [md`Index computation for the product`, md`Correct partial derivatives and the outer-product form`, md`States that only the used row changes`],
      areas: ['math', 'ml-depth'],
    },
    {
      id: 'dl03-p5',
      title: 'Nearest neighbour by cosine similarity',
      type: 'compute',
      difficulty: 2,
      minutes: 8,
      statement: md`Embeddings: Paris $(2, 1, 0)$, France $(2, 1, 2)$, Rome $(0, 2, 1)$, Italy $(0, 2, 3)$, Berlin $(1, -1, 1)$. Compute $\bq = $ France $-$ Paris $+$ Rome and find, among Italy and Berlin, the word with the higher cosine similarity to $\bq$. Enter the word.`,
      solution: [
        md`$\bq = (2, 1, 2) - (2, 1, 0) + (0, 2, 1) = (0, 2, 3)$, with $\lVert\bq\rVert = \sqrt{13}$.`,
        md`Italy $= (0, 2, 3)$: cosine $13/13 = 1$.`,
        md`Berlin: $\bq\cdot(1, -1, 1) = 0 - 2 + 3 = 1$, $\lVert(1,-1,1)\rVert = \sqrt3$, cosine $1/\sqrt{39} \approx 0.16$.`,
        md`Italy is the nearest neighbour. The offset France $-$ Paris $= (0, 0, 2)$ plays the role of "capital to country".`,
      ],
      answer: { kind: 'text', value: ['Italy'] },
    },
    {
      id: 'dl03-p6',
      title: 'InfoNCE by hand, and the temperature',
      type: 'compute',
      difficulty: 2,
      minutes: 10,
      statement: md`Two image-caption pairs have cosine similarities $\bu_1\T\bv_1 = 0.9$, $\bu_1\T\bv_2 = 0.1$, $\bu_2\T\bv_1 = 0.3$, $\bu_2\T\bv_2 = 0.8$. (a) With $\tau = 1$, compute the image-to-text loss $\tfrac12(L_1 + L_2)$. (b) Recompute it with $\tau = 0.1$ and explain the difference. Enter (a).`,
      hints: [md`$L_1 = \ln(1 + e^{s_{12} - s_{11}})$ for two candidates.`],
      solution: [
        md`(a) $L_1 = \ln(1 + e^{0.1 - 0.9}) = \ln(1 + e^{-0.8}) \approx 0.3711$. $L_2 = \ln(1 + e^{0.3 - 0.8}) = \ln(1 + e^{-0.5}) \approx 0.4741$. Mean $\approx 0.4226$.`,
        md`(b) With $\tau = 0.1$ the logit gaps become 8 and 5: $L_1 = \ln(1 + e^{-8}) \approx 0.00034$, $L_2 = \ln(1 + e^{-5}) \approx 0.0067$, mean $\approx 0.0035$.`,
        md`The ranking is the same; only the scale of the logits changed. At $\tau = 1$ cosines in $[-1, 1]$ cannot produce confident softmaxes, so even a correct ranking keeps a large loss. A small $\tau$ lets correct rankings reach low loss and makes the gradient focus on the hardest negatives.`,
      ],
      answer: { kind: 'number', value: 0.4225888250639422, tol: 1e-3 },
    },
    {
      id: 'dl03-p7',
      title: 'Gradient of InfoNCE with respect to an embedding',
      type: 'derive',
      difficulty: 3,
      minutes: 12,
      statement: md`With $s_{ij} = \bu_i\T\bv_j/\tau$ and $L_i = -\ln\softmax_j(s_{ij})_i$, derive $\partial L_i/\partial\bu_i$ (treat the $\bv_j$ as fixed and ignore the normalization of $\bu_i$). Interpret the result as a pull and a push.`,
      solution: [
        md`From the softmax cross-entropy gradient, $\partial L_i/\partial s_{ij} = p_{ij} - [j = i]$.`,
        md`$\partial s_{ij}/\partial\bu_i = \bv_j/\tau$, and $\bu_i$ appears in every $s_{ij}$ of row $i$, so the contributions add.`,
        md`$\dfrac{\partial L_i}{\partial\bu_i} = \dfrac1\tau\sum_j(p_{ij} - [j = i])\bv_j = \dfrac1\tau\left(\sum_j p_{ij}\bv_j - \bv_i\right)$.`,
        md`A descent step moves $\bu_i$ toward $\bv_i$ (pull) and away from the probability-weighted average of all captions $\sum_jp_{ij}\bv_j$ (push), where the confusable captions dominate the average. The factor $1/\tau$ scales the whole step.`,
      ],
      rubric: [md`Uses $\bp - \by$ for the row`, md`Sums over $j$ because $\bu_i$ is in every logit of the row`, md`Pull toward $\bv_i$, push from the weighted mean, $1/\tau$ factor`],
      areas: ['ml-depth', 'llm'],
    },
    {
      id: 'dl03-p8',
      title: 'Gradients through time in a linear RNN',
      type: 'compute',
      difficulty: 2,
      minutes: 8,
      statement: md`A scalar linear RNN $h_t = wh_{t-1} + ux_t$ is trained with a loss on $h_T$ only. (a) Show that $\partial h_T/\partial h_t = w^{T-t}$. (b) Evaluate it for $w = 1.1$, $t = 0$, $T = 50$. (c) Explain what gradient clipping does and does not fix here. Enter (b).`,
      solution: [
        md`(a) $\partial h_{k}/\partial h_{k-1} = w$, and the chain rule multiplies $T - t$ such factors.`,
        md`(b) $1.1^{50} \approx 117.4$.`,
        md`(c) Clipping caps the norm of the total gradient, which prevents one huge step from destroying the weights. It does not change the relative weighting: contributions from far-back steps still dominate (for $|w| > 1$) or vanish (for $|w| < 1$). Gated architectures and attention change the paths themselves.`,
      ],
      answer: { kind: 'number', value: 117.39085287969579, tol: 1e-3 },
    },
    {
      id: 'dl03-p9',
      title: 'Depthwise separable convolution',
      type: 'compute',
      difficulty: 2,
      minutes: 8,
      statement: md`A standard $3\times3$ convolution maps 128 channels to 128 channels. A depthwise separable replacement applies one $3\times3$ kernel per input channel (depthwise, 128 kernels with biases), then a $1\times1$ convolution from 128 to 128 channels (with biases). Count the parameters of both and the ratio. Enter the separable count.`,
      solution: [
        md`Standard: $3\cdot3\cdot128\cdot128 + 128 = 147{,}456 + 128 = 147{,}584$.`,
        md`Depthwise: $3\cdot3\cdot128 + 128 = 1{,}152 + 128 = 1{,}280$. Pointwise: $128\cdot128 + 128 = 16{,}512$. Total $17{,}792$.`,
        md`Ratio $147{,}584/17{,}792 \approx 8.3$. The separable version factorizes spatial filtering and channel mixing, the idea behind MobileNet-style architectures for mobile devices.`,
      ],
      answer: { kind: 'number', value: 17792 },
    },
  ],
};
