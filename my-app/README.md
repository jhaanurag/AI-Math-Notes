# Spatial Math Notes

An iOS 18 Math Notes clone - a web application where you can draw mathematical expressions anywhere on a canvas. The app recognizes handwriting in real-time, solves equations, and displays results next to the equals sign as you draw.

![Spatial Math Notes](https://img.shields.io/badge/Next.js-15-black?style=flat-square&logo=next.js)
![TensorFlow.js](https://img.shields.io/badge/TensorFlow.js-4.21-orange?style=flat-square&logo=tensorflow)
![Math.js](https://img.shields.io/badge/Math.js-13.2-blue?style=flat-square)

## Features

- ✏️ **Natural Drawing** - Write math expressions as you would on paper
- 🧠 **AI Recognition** - TensorFlow.js recognizes handwritten digits and symbols in real-time
- ⚡ **Instant Results** - Results appear magically next to the equals sign
- 📐 **Multi-line Support** - Draw multiple expressions on different lines
- 🎨 **Beautiful UI** - Dark theme with shadcn/ui components

## Supported Symbols

- Digits: `0-9`
- Operators: `+`, `-`, `*`, `/`, `^`
- Special: `=`, `(`, `)`, `.`

## Tech Stack

- **Framework**: Next.js 15 with App Router
- **UI**: shadcn/ui + Tailwind CSS
- **Recognition**: TensorFlow.js (CNN model)
- **Calculation**: Math.js

## How It Works

1. **Stroke Capture**: Canvas captures mouse/touch strokes as point arrays
2. **Stroke Grouping**: Algorithm groups overlapping strokes into characters using spatial proximity and timing
3. **Character Recognition**: TensorFlow.js CNN model classifies each character group
4. **Expression Parsing**: Characters are grouped into lines and parsed as math expressions
5. **Evaluation**: When `=` is detected, Math.js evaluates the expression
6. **Result Rendering**: Result is drawn next to the equals sign on the canvas

## Getting Started

### Prerequisites

- Node.js 18+ 
- npm or yarn

### Installation

```bash
# Clone the repository
git clone https://github.com/jhaanurag/AI-Math-Notes.git
cd AI-Math-Notes/my-app

# Install dependencies
npm install

# Run development server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

### Build for Production

```bash
npm run build
npm start
```

## Project Structure

```
my-app/
├── app/
│   ├── page.tsx          # Main page with canvas
│   └── layout.tsx        # Root layout
├── components/
│   ├── MathCanvas.tsx    # Drawing canvas component
│   └── ui/               # shadcn/ui components
├── lib/
│   ├── types.ts          # TypeScript types
│   ├── geometry.ts       # Bounding box & overlap calculations
│   ├── stroke-grouping.ts # Stroke to character grouping
│   ├── recognizer.ts     # TensorFlow.js character recognition
│   └── expression-parser.ts # Math.js expression evaluation
└── public/
    └── model/            # Pre-trained model (optional)
```

## Algorithm Details

### Stroke Grouping

The key challenge is determining which strokes belong to the same character (e.g., `+` is drawn as two strokes). The algorithm:

1. Calculates bounding boxes for each stroke
2. Computes overlap ratios in X and Y dimensions
3. Uses Union-Find to group strokes with overlap above threshold
4. Considers timing - strokes drawn quickly together are likely the same character

### Character Recognition

- Uses a lightweight CNN architecture optimized for browser
- 28x28 grayscale input (normalized from stroke data)
- Trained on MNIST digits + HASYv2 math symbols + synthetic data
- Rule-based fallback when model is not loaded

## Training the Model

The model needs to be trained separately and deployed. A training script using real datasets is provided:

### Using Google Colab (Recommended)

1. Open [Google Colab](https://colab.research.google.com)
2. Upload `training/train_model.py` or paste its contents
3. Enable GPU: Runtime → Change runtime type → T4 GPU
4. Run all cells
5. Download `math_model_tfjs.zip` when training completes
6. Extract to `public/model/` in your Next.js app

### Datasets Used

- **MNIST/EMNIST** - 70,000+ real handwritten digits (0-9)
- **HASYv2** - Handwritten mathematical symbols (+, -, ×, ÷, =, etc.)
- **Synthetic** - Generated symbols to supplement rare classes

The training produces a ~2MB TensorFlow.js model optimized for browser inference.

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

MIT License - feel free to use this project for learning or commercial purposes.

## Acknowledgments

- Inspired by iOS 18 Math Notes feature
- Built with [Next.js](https://nextjs.org/)
- UI components from [shadcn/ui](https://ui.shadcn.com/)
- Machine learning with [TensorFlow.js](https://www.tensorflow.org/js)
- Math evaluation with [Math.js](https://mathjs.org/)
