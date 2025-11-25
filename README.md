# Spatial Math Notes

An iOS 18 Calculator-inspired web application where users can draw mathematical expressions anywhere on a canvas. The app spatially groups nearby strokes into single expressions, recognizes the handwriting, solves the equation, and renders the result in a handwriting style next to the equation.

## Features

- **Full-screen HTML5 Canvas** - Draw anywhere on the screen
- **Spatial Clustering Algorithm** - Automatically groups nearby strokes into expressions
- **Visual Debug Mode** - See dashed boxes around detected groups
- **Handwriting Recognition** - TensorFlow.js-based character recognition (with mock mode for testing)
- **Math Solver** - Uses math.js to evaluate expressions and handle variable assignments
- **Handwritten Results** - Results displayed in a handwriting-style font (Kalam/Caveat)

## Tech Stack

- **Next.js 15** with App Router
- **shadcn/ui** for UI components
- **HTML5 Canvas API** for drawing input
- **TensorFlow.js** for handwriting recognition
- **math.js** for mathematical calculations
- **Tailwind CSS** for styling

## Getting Started

```bash
# Navigate to the app directory
cd my-app

# Install dependencies (already done)
npm install

# Start the development server
npm run dev
```

Then open [http://localhost:3000](http://localhost:3000) in your browser.

## How to Use

1. ✏️ Draw math expressions anywhere on the canvas
2. 📦 Nearby strokes are automatically grouped together (within 50px threshold)
3. ⏱️ Wait 1 second after drawing for recognition
4. ✨ Results appear in gold next to your equation

### Example Expressions

- `2+2=` → Shows `4`
- `5×3=` → Shows `15`
- `x=5` → Assigns variable x
- `x+3=` → Shows `8` (if x=5 was set)

## Architecture

### Core Files

- `components/MathCanvas.tsx` - Main canvas component with drawing and clustering logic
- `lib/types.ts` - TypeScript interfaces for strokes, groups, and bounding boxes
- `lib/stroke-utils.ts` - Utilities for bounding box calculations and clustering
- `lib/image-processing.ts` - Data pipeline for converting strokes to tensors
- `lib/recognition.ts` - Character recognition (mock implementation)
- `lib/math-solver.ts` - Expression parsing and evaluation
- `lib/model-manager.ts` - TensorFlow.js model loading and inference
- `hooks/useRecognition.ts` - React hook for recognition engine management

### Spatial Clustering Algorithm

The algorithm uses a **Bounding Box Merge** strategy:

1. When a stroke is completed, calculate its bounding box
2. Compare to existing groups' bounding boxes
3. If within 50px threshold, merge into that group
4. Otherwise, create a new group
5. Visual debug: dashed rectangles show group boundaries

### Recognition Pipeline

1. **Debounce** - Wait 1000ms after last stroke
2. **Segmentation** - Split group into individual characters
3. **Preprocessing** - Scale to 28×28, center, normalize
4. **Prediction** - Run through TensorFlow.js model (or mock)
5. **Post-processing** - Fix common OCR errors
6. **Evaluation** - Parse and solve with math.js

## Development

### Toggle Recognition Mode

Click the "Mock/AI Model" button to switch between:
- **Mock Mode** - Returns simulated expressions for testing
- **AI Model Mode** - Uses TensorFlow.js for real recognition (requires model files)

### Adding a Custom Model

Place your TensorFlow.js model files in `public/models/` and update `lib/model-manager.ts`:

```typescript
const url = modelUrl || '/models/your-model/model.json';
```

## License

MIT