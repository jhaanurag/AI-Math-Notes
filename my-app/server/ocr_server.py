#!/usr/bin/env python3
"""
OCR Backend Server for Spatial Math Notes
Uses Tesseract OCR and/or a trained MNIST model for handwriting recognition
"""

import os
import sys
import json
import base64
import io
import re
from http.server import HTTPServer, BaseHTTPRequestHandler
from urllib.parse import urlparse, parse_qs

# Try importing required libraries
try:
    import numpy as np
    from PIL import Image, ImageOps, ImageFilter
    HAS_PIL = True
except ImportError:
    HAS_PIL = False
    print("PIL not found. Install with: pip3 install pillow")

try:
    import cv2
    HAS_CV2 = True
except ImportError:
    HAS_CV2 = False
    print("OpenCV not found. Install with: pip3 install opencv-python")

try:
    import pytesseract
    HAS_TESSERACT = True
except ImportError:
    HAS_TESSERACT = False
    print("pytesseract not found. Install with: pip3 install pytesseract")

try:
    import tensorflow as tf
    HAS_TF = True
except ImportError:
    HAS_TF = False
    print("TensorFlow not found. Install with: pip3 install tensorflow")


class MathOCR:
    """Handles OCR for mathematical expressions"""
    
    def __init__(self):
        self.model = None
        self.model_path = os.path.join(os.path.dirname(__file__), '..', 'public', 'models', 'mnist')
        
        # Try to load the MNIST model if available
        if HAS_TF and os.path.exists(os.path.join(self.model_path, 'model.json')):
            try:
                self.model = tf.keras.models.load_model(self.model_path)
                print("Loaded MNIST model from", self.model_path)
            except Exception as e:
                print(f"Could not load model: {e}")
    
    def preprocess_image(self, image_data: bytes) -> np.ndarray:
        """Preprocess base64 image data for OCR"""
        # Decode base64 if needed
        if isinstance(image_data, str):
            # Remove data URL prefix if present
            if 'base64,' in image_data:
                image_data = image_data.split('base64,')[1]
            image_data = base64.b64decode(image_data)
        
        # Load image
        image = Image.open(io.BytesIO(image_data))
        
        # Convert to RGB if necessary
        if image.mode == 'RGBA':
            # Create white background
            background = Image.new('RGB', image.size, (255, 255, 255))
            background.paste(image, mask=image.split()[3])
            image = background
        elif image.mode != 'RGB':
            image = image.convert('RGB')
        
        # Convert to numpy array
        img_array = np.array(image)
        
        return img_array
    
    def find_contours(self, img: np.ndarray) -> list:
        """Find character contours in the image"""
        if not HAS_CV2:
            return []
        
        # Convert to grayscale
        gray = cv2.cvtColor(img, cv2.COLOR_RGB2GRAY)
        
        # Invert if light background (assuming white strokes on dark)
        if np.mean(gray) < 128:
            gray = 255 - gray
        
        # Threshold
        _, binary = cv2.threshold(gray, 127, 255, cv2.THRESH_BINARY_INV)
        
        # Find contours
        contours, _ = cv2.findContours(binary, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        
        # Get bounding boxes and sort left to right
        boxes = []
        for contour in contours:
            x, y, w, h = cv2.boundingRect(contour)
            if w > 5 and h > 5:  # Filter tiny contours
                boxes.append({'x': x, 'y': y, 'w': w, 'h': h, 'contour': contour})
        
        # Sort by x position (left to right)
        boxes.sort(key=lambda b: b['x'])
        
        return boxes
    
    def extract_character(self, img: np.ndarray, box: dict, target_size: int = 28) -> np.ndarray:
        """Extract and preprocess a single character for MNIST model"""
        x, y, w, h = box['x'], box['y'], box['w'], box['h']
        
        # Add padding
        pad = max(w, h) // 4
        x1 = max(0, x - pad)
        y1 = max(0, y - pad)
        x2 = min(img.shape[1], x + w + pad)
        y2 = min(img.shape[0], y + h + pad)
        
        # Extract region
        char_img = img[y1:y2, x1:x2]
        
        # Convert to grayscale
        if len(char_img.shape) == 3:
            char_img = cv2.cvtColor(char_img, cv2.COLOR_RGB2GRAY)
        
        # Invert if needed (MNIST expects white on black)
        if np.mean(char_img) > 128:
            char_img = 255 - char_img
        
        # Resize to fit in 20x20 box (MNIST style)
        h, w = char_img.shape
        if h > w:
            new_h = 20
            new_w = int(w * 20 / h)
        else:
            new_w = 20
            new_h = int(h * 20 / w)
        
        if new_w > 0 and new_h > 0:
            char_img = cv2.resize(char_img, (new_w, new_h), interpolation=cv2.INTER_AREA)
        
        # Center in 28x28 image
        result = np.zeros((28, 28), dtype=np.uint8)
        x_offset = (28 - new_w) // 2
        y_offset = (28 - new_h) // 2
        result[y_offset:y_offset+new_h, x_offset:x_offset+new_w] = char_img
        
        return result
    
    def recognize_digit(self, char_img: np.ndarray) -> tuple:
        """Recognize a digit using the MNIST model"""
        if not HAS_TF or self.model is None:
            return '?', 0.0
        
        # Normalize and reshape for model
        img = char_img.astype(np.float32) / 255.0
        img = img.reshape(1, 28, 28, 1)
        
        # Predict
        predictions = self.model.predict(img, verbose=0)
        digit = np.argmax(predictions[0])
        confidence = float(predictions[0][digit])
        
        return str(digit), confidence
    
    def recognize_with_tesseract(self, img: np.ndarray) -> str:
        """Use Tesseract OCR for recognition"""
        if not HAS_TESSERACT:
            return ""
        
        # Convert to PIL Image
        if len(img.shape) == 3:
            pil_img = Image.fromarray(img)
        else:
            pil_img = Image.fromarray(img).convert('RGB')
        
        # Configure Tesseract for math
        custom_config = r'--oem 3 --psm 6 -c tessedit_char_whitelist=0123456789+-×÷=xyz().'
        
        try:
            text = pytesseract.image_to_string(pil_img, config=custom_config)
            return text.strip()
        except Exception as e:
            print(f"Tesseract error: {e}")
            return ""
    
    def recognize_expression(self, image_data) -> dict:
        """Main recognition function - combines multiple methods"""
        try:
            img = self.preprocess_image(image_data)
            
            result = {
                'expression': '',
                'characters': [],
                'method': 'none',
                'confidence': 0.0
            }
            
            # Method 1: Try Tesseract first (best for full expressions)
            if HAS_TESSERACT:
                tesseract_result = self.recognize_with_tesseract(img)
                if tesseract_result:
                    result['expression'] = tesseract_result
                    result['method'] = 'tesseract'
                    result['confidence'] = 0.8
            
            # Method 2: Use contour detection + MNIST for digits
            if HAS_CV2 and (not result['expression'] or HAS_TF):
                boxes = self.find_contours(img)
                characters = []
                
                for box in boxes:
                    char_img = self.extract_character(img, box)
                    
                    # Check aspect ratio to guess if it's a symbol
                    aspect = box['w'] / max(box['h'], 1)
                    
                    if 0.3 < aspect < 3.0:  # Reasonable character aspect ratio
                        if HAS_TF and self.model is not None:
                            char, conf = self.recognize_digit(char_img)
                            characters.append({
                                'char': char,
                                'confidence': conf,
                                'box': {'x': box['x'], 'y': box['y'], 'w': box['w'], 'h': box['h']}
                            })
                        else:
                            characters.append({
                                'char': '?',
                                'confidence': 0,
                                'box': {'x': box['x'], 'y': box['y'], 'w': box['w'], 'h': box['h']}
                            })
                
                if characters:
                    result['characters'] = characters
                    
                    # Build expression from characters if Tesseract didn't work
                    if not result['expression']:
                        result['expression'] = ''.join(c['char'] for c in characters)
                        result['method'] = 'mnist' if HAS_TF else 'contour'
                        result['confidence'] = np.mean([c['confidence'] for c in characters]) if characters else 0
            
            # Post-process expression
            result['expression'] = self.post_process(result['expression'])
            
            return result
            
        except Exception as e:
            return {
                'expression': '',
                'error': str(e),
                'method': 'error',
                'confidence': 0.0
            }
    
    def post_process(self, expr: str) -> str:
        """Clean up recognized expression"""
        if not expr:
            return expr
        
        # Remove whitespace
        expr = expr.replace(' ', '').replace('\n', '')
        
        # Common OCR corrections
        replacements = {
            'x': '×',  # Lowercase x to multiplication (context dependent)
            'X': '×',
            '*': '×',
            '/': '÷',
            'O': '0',
            'o': '0',
            'l': '1',
            'I': '1',
            'S': '5',
            'B': '8',
            '—': '-',
            '–': '-',
        }
        
        for old, new in replacements.items():
            # Only replace in numeric context
            expr = re.sub(rf'(\d){old}(\d)', rf'\1{new}\2', expr)
        
        return expr


class OCRHandler(BaseHTTPRequestHandler):
    """HTTP request handler for OCR API"""
    
    ocr = MathOCR()
    
    def _set_headers(self, status=200, content_type='application/json'):
        self.send_response(status)
        self.send_header('Content-Type', content_type)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.end_headers()
    
    def do_OPTIONS(self):
        self._set_headers(200)
    
    def do_GET(self):
        """Handle GET requests - health check"""
        self._set_headers(200)
        response = {
            'status': 'ok',
            'features': {
                'pil': HAS_PIL,
                'opencv': HAS_CV2,
                'tesseract': HAS_TESSERACT,
                'tensorflow': HAS_TF,
                'model_loaded': self.ocr.model is not None
            }
        }
        self.wfile.write(json.dumps(response).encode())
    
    def do_POST(self):
        """Handle POST requests - OCR recognition"""
        content_length = int(self.headers.get('Content-Length', 0))
        body = self.rfile.read(content_length)
        
        try:
            data = json.loads(body)
            image_data = data.get('image', '')
            
            if not image_data:
                self._set_headers(400)
                self.wfile.write(json.dumps({'error': 'No image data provided'}).encode())
                return
            
            result = self.ocr.recognize_expression(image_data)
            
            self._set_headers(200)
            self.wfile.write(json.dumps(result).encode())
            
        except json.JSONDecodeError:
            self._set_headers(400)
            self.wfile.write(json.dumps({'error': 'Invalid JSON'}).encode())
        except Exception as e:
            self._set_headers(500)
            self.wfile.write(json.dumps({'error': str(e)}).encode())


def run_server(port=5000):
    """Start the OCR server"""
    server = HTTPServer(('0.0.0.0', port), OCRHandler)
    print(f"OCR Server running on http://localhost:{port}")
    print(f"Features: PIL={HAS_PIL}, OpenCV={HAS_CV2}, Tesseract={HAS_TESSERACT}, TensorFlow={HAS_TF}")
    server.serve_forever()


if __name__ == '__main__':
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 5000
    run_server(port)
