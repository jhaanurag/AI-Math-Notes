/**
 * MNIST Model Training Script
 * Run with: npx ts-node --esm scripts/train-model.ts
 * Or: node scripts/train-model.mjs
 */

const tf = require('@tensorflow/tfjs-node');
const fs = require('fs');
const path = require('path');

// MNIST dataset URLs
const MNIST_URLS = {
  trainImages: 'https://storage.googleapis.com/cvdf-datasets/mnist/train-images-idx3-ubyte.gz',
  trainLabels: 'https://storage.googleapis.com/cvdf-datasets/mnist/train-labels-idx1-ubyte.gz',
  testImages: 'https://storage.googleapis.com/cvdf-datasets/mnist/t10k-images-idx3-ubyte.gz',
  testLabels: 'https://storage.googleapis.com/cvdf-datasets/mnist/t10k-labels-idx1-ubyte.gz',
};

async function loadMnistData() {
  console.log('Loading MNIST data from TensorFlow datasets...');
  
  // Use tfjs-node's built-in MNIST loading
  const mnist = require('mnist');
  const set = mnist.set(8000, 2000);
  
  const trainData = set.training;
  const testData = set.test;
  
  // Convert to tensors
  const trainImages = tf.tensor4d(
    trainData.map(d => d.input),
    [trainData.length, 28, 28, 1]
  );
  const trainLabels = tf.tensor2d(
    trainData.map(d => d.output),
    [trainData.length, 10]
  );
  
  const testImages = tf.tensor4d(
    testData.map(d => d.input),
    [testData.length, 28, 28, 1]
  );
  const testLabels = tf.tensor2d(
    testData.map(d => d.output),
    [testData.length, 10]
  );
  
  return { trainImages, trainLabels, testImages, testLabels };
}

function createModel() {
  const model = tf.sequential();
  
  // Convolutional layers
  model.add(tf.layers.conv2d({
    inputShape: [28, 28, 1],
    kernelSize: 3,
    filters: 32,
    activation: 'relu',
  }));
  model.add(tf.layers.maxPooling2d({ poolSize: 2 }));
  
  model.add(tf.layers.conv2d({
    kernelSize: 3,
    filters: 64,
    activation: 'relu',
  }));
  model.add(tf.layers.maxPooling2d({ poolSize: 2 }));
  
  model.add(tf.layers.flatten());
  model.add(tf.layers.dropout({ rate: 0.25 }));
  model.add(tf.layers.dense({ units: 128, activation: 'relu' }));
  model.add(tf.layers.dropout({ rate: 0.5 }));
  model.add(tf.layers.dense({ units: 10, activation: 'softmax' }));
  
  model.compile({
    optimizer: 'adam',
    loss: 'categoricalCrossentropy',
    metrics: ['accuracy'],
  });
  
  return model;
}

async function trainAndSaveModel() {
  console.log('Creating model...');
  const model = createModel();
  model.summary();
  
  console.log('Loading data...');
  const { trainImages, trainLabels, testImages, testLabels } = await loadMnistData();
  
  console.log('Training model...');
  await model.fit(trainImages, trainLabels, {
    epochs: 10,
    batchSize: 128,
    validationData: [testImages, testLabels],
    callbacks: {
      onEpochEnd: (epoch, logs) => {
        console.log(`Epoch ${epoch + 1}: loss=${logs.loss.toFixed(4)}, accuracy=${logs.acc.toFixed(4)}`);
      },
    },
  });
  
  // Save model
  const modelDir = path.join(__dirname, '..', 'public', 'models', 'mnist');
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
}

trainAndSaveModel().catch(console.error);
