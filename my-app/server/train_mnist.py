#!/usr/bin/env python3
"""
Train MNIST model for digit recognition
Also downloads and prepares an extended dataset with math symbols
"""

import os
import sys
import gzip
import struct
import urllib.request
import numpy as np

# Check for TensorFlow
try:
    import tensorflow as tf
    from tensorflow import keras
    print(f"TensorFlow version: {tf.__version__}")
except ImportError:
    print("TensorFlow not found. Installing...")
    os.system("pip3 install tensorflow")
    import tensorflow as tf
    from tensorflow import keras

MNIST_URLS = {
    'train_images': 'http://yann.lecun.com/exdb/mnist/train-images-idx3-ubyte.gz',
    'train_labels': 'http://yann.lecun.com/exdb/mnist/train-labels-idx1-ubyte.gz',
    'test_images': 'http://yann.lecun.com/exdb/mnist/t10k-images-idx3-ubyte.gz',
    'test_labels': 'http://yann.lecun.com/exdb/mnist/t10k-labels-idx1-ubyte.gz',
}

DATA_DIR = os.path.join(os.path.dirname(__file__), 'data')
MODEL_DIR = os.path.join(os.path.dirname(__file__), '..', 'public', 'models', 'mnist')


def download_mnist():
    """Download MNIST dataset"""
    os.makedirs(DATA_DIR, exist_ok=True)
    
    for name, url in MNIST_URLS.items():
        filepath = os.path.join(DATA_DIR, f'{name}.gz')
        if not os.path.exists(filepath):
            print(f"Downloading {name}...")
            urllib.request.urlretrieve(url, filepath)
            print(f"  Saved to {filepath}")
        else:
            print(f"{name} already exists")


def load_mnist_images(filepath):
    """Load MNIST images from gzipped file"""
    with gzip.open(filepath, 'rb') as f:
        magic, num, rows, cols = struct.unpack('>IIII', f.read(16))
        images = np.frombuffer(f.read(), dtype=np.uint8)
        images = images.reshape(num, rows, cols, 1)
    return images


def load_mnist_labels(filepath):
    """Load MNIST labels from gzipped file"""
    with gzip.open(filepath, 'rb') as f:
        magic, num = struct.unpack('>II', f.read(8))
        labels = np.frombuffer(f.read(), dtype=np.uint8)
    return labels


def create_model():
    """Create a CNN model for digit recognition"""
    model = keras.Sequential([
        # First conv block
        keras.layers.Conv2D(32, (3, 3), activation='relu', input_shape=(28, 28, 1)),
        keras.layers.BatchNormalization(),
        keras.layers.Conv2D(32, (3, 3), activation='relu'),
        keras.layers.BatchNormalization(),
        keras.layers.MaxPooling2D((2, 2)),
        keras.layers.Dropout(0.25),
        
        # Second conv block
        keras.layers.Conv2D(64, (3, 3), activation='relu'),
        keras.layers.BatchNormalization(),
        keras.layers.Conv2D(64, (3, 3), activation='relu'),
        keras.layers.BatchNormalization(),
        keras.layers.MaxPooling2D((2, 2)),
        keras.layers.Dropout(0.25),
        
        # Dense layers
        keras.layers.Flatten(),
        keras.layers.Dense(256, activation='relu'),
        keras.layers.BatchNormalization(),
        keras.layers.Dropout(0.5),
        keras.layers.Dense(10, activation='softmax')
    ])
    
    model.compile(
        optimizer='adam',
        loss='sparse_categorical_crossentropy',
        metrics=['accuracy']
    )
    
    return model


def augment_data(images, labels):
    """Apply data augmentation"""
    from tensorflow.keras.preprocessing.image import ImageDataGenerator
    
    datagen = ImageDataGenerator(
        rotation_range=10,
        width_shift_range=0.1,
        height_shift_range=0.1,
        zoom_range=0.1,
        shear_range=0.1
    )
    
    return datagen


def train():
    """Train the MNIST model"""
    print("\n=== MNIST Model Training ===\n")
    
    # Download data
    download_mnist()
    
    # Load data
    print("\nLoading data...")
    train_images = load_mnist_images(os.path.join(DATA_DIR, 'train_images.gz'))
    train_labels = load_mnist_labels(os.path.join(DATA_DIR, 'train_labels.gz'))
    test_images = load_mnist_images(os.path.join(DATA_DIR, 'test_images.gz'))
    test_labels = load_mnist_labels(os.path.join(DATA_DIR, 'test_labels.gz'))
    
    print(f"Train images: {train_images.shape}")
    print(f"Test images: {test_images.shape}")
    
    # Normalize
    train_images = train_images.astype('float32') / 255.0
    test_images = test_images.astype('float32') / 255.0
    
    # Create model
    print("\nCreating model...")
    model = create_model()
    model.summary()
    
    # Data augmentation
    datagen = augment_data(train_images, train_labels)
    
    # Train
    print("\nTraining...")
    history = model.fit(
        datagen.flow(train_images, train_labels, batch_size=128),
        epochs=10,
        validation_data=(test_images, test_labels),
        callbacks=[
            keras.callbacks.EarlyStopping(patience=3, restore_best_weights=True),
            keras.callbacks.ReduceLROnPlateau(factor=0.5, patience=2)
        ]
    )
    
    # Evaluate
    print("\nEvaluating...")
    test_loss, test_acc = model.evaluate(test_images, test_labels)
    print(f"Test accuracy: {test_acc:.4f}")
    
    # Save model
    os.makedirs(MODEL_DIR, exist_ok=True)
    
    # Save as Keras format
    keras_path = os.path.join(MODEL_DIR, 'model.keras')
    model.save(keras_path)
    print(f"\nModel saved to {keras_path}")
    
    # Also save as TensorFlow.js format if tensorflowjs is available
    try:
        import tensorflowjs as tfjs
        tfjs_path = MODEL_DIR
        tfjs.converters.save_keras_model(model, tfjs_path)
        print(f"TensorFlow.js model saved to {tfjs_path}")
    except ImportError:
        print("\nTo export for browser use, install tensorflowjs:")
        print("  pip3 install tensorflowjs")
        print("  tensorflowjs_converter --input_format keras", keras_path, MODEL_DIR)
    
    return model


if __name__ == '__main__':
    train()
