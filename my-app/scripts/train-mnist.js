/**
 * Train MNIST model using TensorFlow.js Node
 * Run: node scripts/train-mnist.js
 */

async function main() {
  // Dynamic import for ES modules
  const tf = await import('@tensorflow/tfjs-node');
  const fs = await import('fs');
  const path = await import('path');
  const https = await import('https');
  const zlib = await import('zlib');
  
  const MNIST_BASE_URL = 'https://storage.googleapis.com/cvdf-datasets/mnist/';
  
  async function fetchBuffer(url) {
    return new Promise((resolve, reject) => {
      https.get(url, (res) => {
        const chunks = [];
        res.on('data', chunk => chunks.push(chunk));
        res.on('end', () => {
          const buffer = Buffer.concat(chunks);
          // Decompress gzip
          zlib.gunzip(buffer, (err, decompressed) => {
            if (err) reject(err);
            else resolve(decompressed);
          });
        });
        res.on('error', reject);
      });
    });
  }
  
  function parseImages(buffer) {
    // Skip 16-byte header
    const pixels = new Float32Array((buffer.length - 16));
    for (let i = 16; i < buffer.length; i++) {
      pixels[i - 16] = buffer[i] / 255.0;
    }
    const numImages = (buffer.length - 16) / (28 * 28);
    return tf.tensor4d(pixels, [numImages, 28, 28, 1]);
  }
  
  function parseLabels(buffer) {
    // Skip 8-byte header
    const labels = new Uint8Array(buffer.length - 8);
    for (let i = 8; i < buffer.length; i++) {
      labels[i - 8] = buffer[i];
    }
    return tf.oneHot(tf.tensor1d(labels, 'int32'), 10);
  }
  
  console.log('Downloading MNIST training images...');
  const trainImagesBuffer = await fetchBuffer(MNIST_BASE_URL + 'train-images-idx3-ubyte.gz');
  console.log('Downloading MNIST training labels...');
  const trainLabelsBuffer = await fetchBuffer(MNIST_BASE_URL + 'train-labels-idx1-ubyte.gz');
  console.log('Downloading MNIST test images...');
  const testImagesBuffer = await fetchBuffer(MNIST_BASE_URL + 't10k-images-idx3-ubyte.gz');
  console.log('Downloading MNIST test labels...');
  const testLabelsBuffer = await fetchBuffer(MNIST_BASE_URL + 't10k-labels-idx1-ubyte.gz');
  
  console.log('Parsing data...');
  const trainImages = parseImages(trainImagesBuffer);
  const trainLabels = parseLabels(trainLabelsBuffer);
  const testImages = parseImages(testImagesBuffer);
  const testLabels = parseLabels(testLabelsBuffer);
  
  console.log('Train images shape:', trainImages.shape);
  console.log('Train labels shape:', trainLabels.shape);
  
  // Create model
  console.log('Creating model...');
  const model = tf.sequential();
  
  model.add(tf.layers.conv2d({
    inputShape: [28, 28, 1],
    kernelSize: 3,
    filters: 32,
    activation: 'relu',
  }));
  model.add(tf.layers.batchNormalization());
  model.add(tf.layers.maxPooling2d({ poolSize: 2 }));
  
  model.add(tf.layers.conv2d({
    kernelSize: 3,
    filters: 64,
    activation: 'relu',
  }));
  model.add(tf.layers.batchNormalization());
  model.add(tf.layers.maxPooling2d({ poolSize: 2 }));
  
  model.add(tf.layers.conv2d({
    kernelSize: 3,
    filters: 64,
    activation: 'relu',
  }));
  model.add(tf.layers.batchNormalization());
  
  model.add(tf.layers.flatten());
  model.add(tf.layers.dropout({ rate: 0.25 }));
  model.add(tf.layers.dense({ units: 128, activation: 'relu' }));
  model.add(tf.layers.dropout({ rate: 0.5 }));
  model.add(tf.layers.dense({ units: 10, activation: 'softmax' }));
  
  model.compile({
    optimizer: tf.train.adam(0.001),
    loss: 'categoricalCrossentropy',
    metrics: ['accuracy'],
  });
  
  model.summary();
  
  // Train
  console.log('Training model (this may take a few minutes)...');
  await model.fit(trainImages, trainLabels, {
    epochs: 5,
    batchSize: 128,
    validationSplit: 0.1,
    callbacks: {
      onEpochEnd: (epoch, logs) => {
        console.log(`Epoch ${epoch + 1}/5: loss=${logs.loss.toFixed(4)}, acc=${logs.acc.toFixed(4)}, val_loss=${logs.val_loss.toFixed(4)}, val_acc=${logs.val_acc.toFixed(4)}`);
      },
    },
  });
  
  // Evaluate
  console.log('Evaluating on test set...');
  const evalResult = model.evaluate(testImages, testLabels);
  console.log(`Test loss: ${evalResult[0].dataSync()[0].toFixed(4)}`);
  console.log(`Test accuracy: ${evalResult[1].dataSync()[0].toFixed(4)}`);
  
  // Save model
  const modelDir = path.join(process.cwd(), 'public', 'models', 'mnist');
  if (!fs.existsSync(modelDir)) {
    fs.mkdirSync(modelDir, { recursive: true });
  }
  
  await model.save(`file://${modelDir}`);
  console.log(`Model saved to ${modelDir}`);
  
  // Cleanup
  trainImages.dispose();
  trainLabels.dispose();
  testImages.dispose();
  testLabels.dispose();
  
  console.log('Done!');
}

main().catch(console.error);
