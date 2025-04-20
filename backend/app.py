from flask import Flask, request, jsonify
from flask_cors import CORS
import torch
import cv2
import numpy as np
import base64
from PIL import Image
import io
import os
from ultralytics import YOLO

app = Flask(__name__)
CORS(app)

# Get the absolute path to the model file
current_dir = os.path.dirname(os.path.abspath(__file__))
model_path = os.path.join(current_dir, '..', 'public', 'models', 'YOLOv8_Small_RDD.pt')

# Load YOLOv8 model directly using ultralytics
model = YOLO(model_path)

@app.route('/analyze', methods=['POST'])
def analyze_image():
    try:
        # Get image data from request
        data = request.json
        image_data = data['image'].split(',')[1]  # Remove data URL prefix
        image_bytes = base64.b64decode(image_data)
        
        # Convert to PIL Image
        image = Image.open(io.BytesIO(image_bytes))
        
        # Convert to numpy array
        image_np = np.array(image)
        
        # Run inference
        results = model(image_np)
        
        # Process results
        detections = []
        for result in results:
            boxes = result.boxes
            for box in boxes:
                x1, y1, x2, y2 = box.xyxy[0].tolist()
                confidence = float(box.conf[0])
                class_id = int(box.cls[0])
                
                detections.append({
                    'bbox': [float(x1), float(y1), float(x2-x1), float(y2-y1)],
                    'confidence': confidence,
                    'type': f'D{class_id}0-{["Longitudinal", "Transverse", "Alligator", "Pothole", "Rutting"][class_id]}'
                })
        
        return jsonify({
            'success': True,
            'defects': detections,
            'defectCount': len(detections)
        })
        
    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

if __name__ == '__main__':
    app.run(port=5000) 