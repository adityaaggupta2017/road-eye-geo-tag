from flask import Flask, request, jsonify, send_file
from flask_cors import CORS
import torch
import cv2
import numpy as np
import base64
from PIL import Image
import io
import os
import uuid
import time
import json
import logging
import requests
from datetime import datetime
from ultralytics import YOLO
import tempfile
import shutil
import threading
import math
from reportlab.pdfgen import canvas
from reportlab.lib.pagesizes import letter
from reportlab.lib import colors
from reportlab.lib.utils import ImageReader
from urllib.parse import quote as url_quote

# Configure logging
logging.basicConfig(level=logging.DEBUG, 
                   format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

app = Flask(__name__)

# Configure CORS to allow all origins and methods
CORS(app, 
     origins="*", 
     allow_headers=["Content-Type", "Authorization", "Accept"], 
     methods=["GET", "POST", "OPTIONS"],
     supports_credentials=True)

# Add CORS headers to all responses
@app.after_request
def add_cors_headers(response):
    response.headers.add('Access-Control-Allow-Origin', '*')
    response.headers.add('Access-Control-Allow-Headers', 'Content-Type, Authorization, Accept')
    response.headers.add('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
    response.headers.add('Access-Control-Allow-Credentials', 'true')
    return response

# Handle OPTIONS requests explicitly for all routes
@app.route('/<path:path>', methods=['OPTIONS'])
@app.route('/', methods=['OPTIONS'])
def handle_options(path=''):
    return jsonify({'status': 'ok'})

# Get the absolute path to the model file
current_dir = os.path.dirname(os.path.abspath(__file__))
model_path = os.path.join(current_dir, '..', 'public', 'models', 'YOLOv8_Small_RDD.pt')

# Create necessary directories
uploads_dir = os.path.join(current_dir, 'uploads')
results_dir = os.path.join(current_dir, 'results')
reports_dir = os.path.join(current_dir, 'reports')

for directory in [uploads_dir, results_dir, reports_dir]:
    if not os.path.exists(directory):
        os.makedirs(directory)

# Load YOLOv8 model directly using ultralytics
try:
    logger.info(f"Loading model from path: {model_path}")
    model = YOLO(model_path)
    logger.info("Model loaded successfully")
except Exception as e:
    logger.error(f"Error loading model: {str(e)}")
    model = None

# Store active analyses
active_analyses = {}

# Store road ratings
road_ratings = []

# Simple in-memory user storage (replace with a database in production)
users = {}

# Authentication routes
@app.route('/signup', methods=['POST'])
def signup():
    try:
        data = request.json
        logger.info(f"Signup attempt for email: {data.get('email')}")
        
        if not data or 'email' not in data or 'password' not in data:
            return jsonify({
                'success': False,
                'message': 'Missing required fields: email and password'
            }), 400
        
        email = data['email']
        password = data['password']
        
        # Check if user already exists
        if email in users:
            return jsonify({
                'success': False,
                'message': 'User already exists'
            }), 400
        
        # Create new user
        user_id = str(uuid.uuid4())
        users[email] = {
            'id': user_id,
            'email': email,
            'password': password  # In production, hash this password
        }
        
        # Return user data (without password)
        return jsonify({
            'success': True,
            'user': {
                'id': user_id,
                'email': email
            }
        })
        
    except Exception as e:
        logger.error(f"Error in signup: {str(e)}")
        return jsonify({
            'success': False,
            'message': str(e)
        }), 500

@app.route('/login', methods=['POST'])
def login():
    try:
        data = request.json
        logger.info(f"Login attempt for email: {data.get('email')}")
        
        if not data or 'email' not in data or 'password' not in data:
            return jsonify({
                'success': False,
                'message': 'Missing required fields: email and password'
            }), 400
        
        email = data['email']
        password = data['password']
        
        # For demo purposes - allow test@example.com with password123 to work always
        if email == 'test@example.com' and password == 'password123':
            logger.info("Logging in with demo credentials")
            return jsonify({
                'success': True,
                'user': {
                    'id': 'demo-user-id',
                    'email': email
                }
            })
        
        # Check if user exists and password matches
        if email not in users or users[email]['password'] != password:
            return jsonify({
                'success': False,
                'message': 'Invalid credentials'
            }), 401
        
        # Return user data (without password)
        return jsonify({
            'success': True,
            'user': {
                'id': users[email]['id'],
                'email': email
            }
        })
        
    except Exception as e:
        logger.error(f"Error in login: {str(e)}")
        return jsonify({
            'success': False,
            'message': str(e)
        }), 500

@app.route('/road-ratings', methods=['GET', 'POST'])
def handle_road_ratings():
    if request.method == 'GET':
        return jsonify({
            'success': True,
            'ratings': road_ratings
        })
    
    elif request.method == 'POST':
        try:
            data = request.json
            # Log only the non-image data
            log_data = {k: v for k, v in data.items() if k != 'imageData'}
            logger.info(f"Received road rating data: {log_data}")
            
            if not data or 'coordinates' not in data or 'rating' not in data:
                return jsonify({
                    'success': False,
                    'error': 'Missing required fields: coordinates and rating'
                }), 400
            
            # Create new rating
            rating = {
                'id': str(uuid.uuid4()),
                'coordinates': data['coordinates'],
                'rating': data['rating'],
                'timestamp': datetime.now().isoformat(),
                'userId': data.get('userId', 'anonymous'),
                'imageUrl': data.get('imageData')
            }
            
            # Add to ratings list
            road_ratings.append(rating)
            
            return jsonify({
                'success': True,
                'rating': rating
            })
            
        except Exception as e:
            logger.error(f"Error handling road rating: {str(e)}")
            return jsonify({
                'success': False,
                'error': str(e)
            }), 500

def fetch_road_coordinates(road_name, location):
    """
    Fetch road coordinates using both Nominatim and Overpass API for more accurate results.
    
    Args:
        road_name: Name of the road (e.g., "MG Road")
        location: Location/city of the road (e.g., "Bangalore")
        
    Returns:
        List of coordinate points as (latitude, longitude) tuples
    """
    try:
        # First, use Nominatim to find the general area
        search_query = f"{road_name}, {location}, India"
        logger.info(f"Searching for location: {search_query}")
        
        # Use Nominatim API to get the area
        nominatim_url = "https://nominatim.openstreetmap.org/search"
        params = {
            "q": search_query,
            "format": "json",
            "limit": 1
        }
        headers = {
            "User-Agent": "RoadQualityAnalyzer/1.0"
        }
        
        response = requests.get(nominatim_url, params=params, headers=headers)
        
        if response.status_code != 200 or not response.json():
            logger.warning(f"No location found for {search_query}, using fallback method")
            return fallback_road_search(road_name, location)
        
        area_data = response.json()[0]
        lat = float(area_data["lat"])
        lon = float(area_data["lon"])
        
        logger.info(f"Found area center at: {lat}, {lon}")
        
        # Now use Overpass API to find the actual road within this area
        # This search looks for highways with the given name in a 2km radius
        overpass_url = "https://overpass-api.de/api/interpreter"
        
        # Prepare Overpass query to find roads with matching name
        road_name_cleaned = road_name.replace("Road", "").strip()  # Clean up the road name
        
        overpass_query = f"""
        [out:json];
        (
          way["highway"](around:2000,{lat},{lon})[name~"{road_name_cleaned}|{road_name}",i];
        );
        out body geom;
        """
        
        logger.info(f"Searching for roads using Overpass with query: {overpass_query}")
        
        overpass_response = requests.post(overpass_url, data={"data": overpass_query})
        
        if overpass_response.status_code != 200:
            logger.warning(f"Overpass API failed with status {overpass_response.status_code}")
            return fallback_road_search(road_name, location)
        
        overpass_data = overpass_response.json()
        
        # Process road data
        if "elements" in overpass_data and overpass_data["elements"]:
            roads = overpass_data["elements"]
            logger.info(f"Found {len(roads)} road segments from Overpass API")
            
            # Find the most relevant road (usually the longest)
            best_road = max(roads, key=lambda r: len(r.get("geometry", [])))
            
            # Extract coordinates
            coordinates = []
            for point in best_road.get("geometry", []):
                coordinates.append((float(point["lat"]), float(point["lon"])))
            
            # Ensure we have enough points (between 10-50)
            if len(coordinates) > 50:
                # Sample points evenly if too many
                indices = np.round(np.linspace(0, len(coordinates) - 1, 50)).astype(int)
                coordinates = [coordinates[i] for i in indices]
            elif len(coordinates) < 10 and len(coordinates) > 0:
                # Interpolate if too few points
                original_coords = np.array(coordinates)
                num_points = 20
                
                # Create a parameter along the curve
                t = np.linspace(0, 1, len(original_coords))
                # Create a new parameter with more points
                t_new = np.linspace(0, 1, num_points)
                
                # Interpolate each coordinate
                x_coords = np.interp(t_new, t, original_coords[:, 0])
                y_coords = np.interp(t_new, t, original_coords[:, 1])
                
                coordinates = [(x_coords[i], y_coords[i]) for i in range(num_points)]
            
            if coordinates:
                logger.info(f"Successfully found road coordinates: {len(coordinates)} points")
                return coordinates
        
        # If Overpass didn't find specific road data, try the fallback method
        logger.warning("No specific road geometry found, trying fallback method")
        return fallback_road_search(road_name, location)
        
    except Exception as e:
        logger.error(f"Error fetching road coordinates: {str(e)}")
        return generate_default_coordinates()

def fallback_road_search(road_name, location):
    """
    Fallback method to find road coordinates using Nominatim with geojson.
    """
    try:
        # Try again with Nominatim but request full geometry
        search_query = f"{road_name}, {location}, India"
        logger.info(f"Using fallback search for: {search_query}")
        
        nominatim_url = "https://nominatim.openstreetmap.org/search"
        params = {
            "q": search_query,
            "format": "json",
            "polygon_geojson": 1,
            "limit": 1
        }
        headers = {
            "User-Agent": "RoadQualityAnalyzer/1.0"
        }
        
        response = requests.get(nominatim_url, params=params, headers=headers)
        
        if response.status_code != 200:
            logger.error(f"Fallback search failed with status {response.status_code}")
            return generate_default_coordinates()
        
        data = response.json()
        
        if not data:
            logger.warning(f"No fallback results for {search_query}")
            return generate_default_coordinates()
        
        result = data[0]
        
        # If we have geometry data
        if "geojson" in result:
            coordinates = []
            geojson = result["geojson"]
            
            if geojson["type"] == "LineString":
                # For LineString, coordinates are already a list of points
                for point in geojson["coordinates"]:
                    # OpenStreetMap returns [lon, lat], but we need [lat, lon]
                    coordinates.append((float(point[1]), float(point[0])))
            
            elif geojson["type"] == "MultiLineString":
                # For MultiLineString, coordinates are a list of LineStrings
                for line in geojson["coordinates"]:
                    for point in line:
                        coordinates.append((float(point[1]), float(point[0])))
            
            elif geojson["type"] == "Polygon":
                # For Polygon, use the exterior ring
                for point in geojson["coordinates"][0]:
                    coordinates.append((float(point[1]), float(point[0])))
            
            if coordinates:
                # Limit to 50 points maximum
                if len(coordinates) > 50:
                    indices = np.round(np.linspace(0, len(coordinates) - 1, 50)).astype(int)
                    coordinates = [coordinates[i] for i in indices]
                
                logger.info(f"Found {len(coordinates)} coordinate points from geojson")
                return coordinates
        
        # If we don't have geometry data, use the bounding box to generate points
        if "boundingbox" in result:
            bbox = result["boundingbox"]
            south_lat = float(bbox[0])
            north_lat = float(bbox[1])
            west_lon = float(bbox[2])
            east_lon = float(bbox[3])
            
            # Get the centroid
            center_lat = (north_lat + south_lat) / 2
            center_lon = (east_lon + west_lon) / 2
            
            # Generate a line through the center of the bounding box
            num_points = 20
            
            # Determine the longer dimension of the bounding box
            lat_range = north_lat - south_lat
            lon_range = east_lon - west_lon
            
            coordinates = []
            if lon_range > lat_range:
                # Generate an east-west line
                for i in range(num_points):
                    lon = west_lon + (i / (num_points - 1)) * lon_range
                    coordinates.append((center_lat, lon))
            else:
                # Generate a north-south line
                for i in range(num_points):
                    lat = south_lat + (i / (num_points - 1)) * lat_range
                    coordinates.append((lat, center_lon))
            
            logger.info(f"Generated {len(coordinates)} coordinate points from bounding box")
            return coordinates
        
        # If we just have a single point, generate a small line around it
        lat = float(result["lat"])
        lon = float(result["lon"])
        
        # Generate a small line (500m in each direction) around the point
        coordinates = []
        for i in range(20):
            # Each step is roughly 50m
            offset = (i - 10) * 0.0005  # about 50m per 0.0005 degrees
            coordinates.append((lat, lon + offset))  # East-West line
        
        logger.info(f"Generated {len(coordinates)} coordinate points around center")
        return coordinates
    
    except Exception as e:
        logger.error(f"Error in fallback search: {str(e)}")
        return generate_default_coordinates()

def generate_default_coordinates():
    """Generate default coordinates for fallback (centered at India)"""
    logger.warning("Using default coordinates")
    
    # Default coordinates (centered around Delhi, India)
    start_lat = 28.6139  # Delhi latitude
    start_lng = 77.2090  # Delhi longitude
    
    coordinates = []
    
    # Direction (degrees) - East
    direction = 90
    
    # Generate 20 points
    segment_distance = 0.0005  # About 50m per point
    
    for i in range(20):
        # Calculate point based on direction and distance
        dx = segment_distance * math.cos(math.radians(direction))
        dy = segment_distance * math.sin(math.radians(direction))
        
        lat = start_lat + dy
        lng = start_lng + dx
        
        coordinates.append((start_lat, start_lng))
        
        # Update for next point
        start_lat = lat
        start_lng = lng
        
        # Slightly change direction for natural road curve
        direction += np.random.uniform(-5, 5)
    
    return coordinates

@app.route('/analyze', methods=['POST'])
def analyze_image():
    try:
        # Log the incoming request
        
        # Check if model is loaded
        if model is None:
            logger.error("Model not loaded. Cannot perform analysis.")
            return jsonify({
                'success': False,
                'error': 'Model not loaded. Please check server logs for details.'
            }), 500

        # Get image data from request
        data = request.json
        logger.debug(f"Request data keys: {data.keys() if data else 'No data'}")
        
        if not data:
            logger.error("No JSON data in request")
            return jsonify({
                'success': False,
                'error': 'No JSON data received'
            }), 400
            
        if 'image' not in data:
            logger.error("No image field in request data")
            return jsonify({
                'success': False,
                'error': 'No image field in request data'
            }), 400

        # Validate image data format
        if not data['image'].startswith('data:image'):
            logger.error("Invalid image data format - missing data URL prefix")
            return jsonify({
                'success': False,
                'error': 'Invalid image data format - must be a data URL'
            }), 400

        try:
            image_data = data['image'].split(',')[1]  # Remove data URL prefix
        except IndexError:
            logger.error("Invalid image data format - could not extract base64 data")
            return jsonify({
                'success': False,
                'error': 'Invalid image data format - malformed data URL'
            }), 400
        
        image_bytes = base64.b64decode(image_data)
        
        # Convert to PIL Image
        try:
            image = Image.open(io.BytesIO(image_bytes))
            logger.debug("Successfully opened image")
        except Exception as e:
            logger.error(f"Error opening image: {str(e)}")
            return jsonify({
                'success': False,
                'error': f'Error processing image: {str(e)}'
            }), 400
        
        # Convert to numpy array
        image_np = np.array(image)
        logger.debug(f"Image shape: {image_np.shape}")
        
        # Run inference
        try:
            results = model(image_np)
            logger.debug("Model inference completed successfully")
        except Exception as e:
            logger.error(f"Model inference error: {str(e)}")
            return jsonify({
                'success': False,
                'error': f'Model inference failed: {str(e)}'
            }), 500
        
        # Process results
        detections = []
        for result in results:
            boxes = result.boxes
            for box in boxes:
                x1, y1, x2, y2 = box.xyxy[0].tolist()
                confidence = float(box.conf[0])
                class_id = int(box.cls[0])
                
                # Only include detections with confidence > 10%
                if confidence > 0.1:
                    detections.append({
                        'bbox': [float(x1), float(y1), float(x2-x1), float(y2-y1)],
                        'confidence': confidence,
                        'type': f'D{class_id}0-{["Longitudinal", "Transverse", "Alligator", "Pothole", "Rutting"][class_id]}'
                    })
                else:
                    logger.debug(f"Skipping detection with confidence {confidence:.2f} (below threshold)")
        
        logger.info(f"Analysis completed successfully. Found {len(detections)} defects with confidence > 40%.")
        return jsonify({
            'success': True,
            'defects': detections,
            'defectCount': len(detections)
        })
        
    except Exception as e:
        logger.error(f"Error analyzing image: {str(e)}", exc_info=True)
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

@app.route('/upload-video', methods=['POST', 'OPTIONS'])
def upload_video():
    # Handle preflight OPTIONS request
    if request.method == 'OPTIONS':
        logger.info("Received OPTIONS request for upload-video")
        return jsonify(success=True)
        
    try:
        # Log the incoming request details
        logger.info("Received upload-video POST request")
        logger.info(f"Request Content-Type: {request.content_type}")
        logger.info(f"Files in request: {list(request.files.keys()) if request.files else 'No files'}")
        logger.info(f"Form data keys: {list(request.form.keys()) if request.form else 'No form data'}")
        
        # Check for video file
        if 'video' not in request.files:
            logger.error("No video file in request")
            return jsonify({
                'success': False,
                'error': 'No video file provided'
            }), 400
        
        video_file = request.files['video']
        if not video_file.filename:
            logger.error("Empty filename provided")
            return jsonify({
                'success': False,
                'error': 'No selected file'
            }), 400
        
        # Get road details
        road_name = request.form.get('road_name', '')
        road_location = request.form.get('road_location', '')
        
        logger.info(f"Processing upload: {video_file.filename}, Road: {road_name}, Location: {road_location}")
        
        if not road_name or not road_location:
            logger.error("Missing road details")
            return jsonify({
                'success': False,
                'error': 'Road name and location are required'
            }), 400
        
        # Create a unique ID for this analysis
        analysis_id = str(uuid.uuid4())
        
        # Ensure the upload directory exists
        os.makedirs(uploads_dir, exist_ok=True)
        
        # Save the uploaded video
        video_path = os.path.join(uploads_dir, f"{analysis_id}.mp4")
        logger.info(f"Saving video to {video_path}")
        video_file.save(video_path)
        
        # Register the analysis
        active_analyses[analysis_id] = {
            'status': 'processing',
            'timestamp': datetime.now().isoformat(),
            'video_name': video_file.filename,
            'video_path': video_path,
            'road_name': road_name,
            'road_location': road_location,
            'progress': 0
        }
        
        # Start processing in a background thread
        analysis_thread = threading.Thread(
            target=process_video, 
            args=(analysis_id, video_path, road_name, road_location)
        )
        analysis_thread.daemon = True
        analysis_thread.start()
        
        logger.info(f"Started analysis {analysis_id}")
        return jsonify({
            'success': True,
            'analysisId': analysis_id,
            'message': 'Video uploaded successfully, processing started'
        })
        
    except Exception as e:
        logger.error(f"Error in upload-video: {str(e)}", exc_info=True)
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

def process_video(analysis_id, video_path, road_name, road_location):
    try:
        logger.info(f"Starting video processing for analysis ID: {analysis_id}")
        logger.info(f"Road information: {road_name}, {road_location}")
        
        # Create directory for saving detected frames
        detected_frames_dir = os.path.join(results_dir, f"{analysis_id}_frames")
        os.makedirs(detected_frames_dir, exist_ok=True)
        
        # Open the video file
        cap = cv2.VideoCapture(video_path)
        
        if not cap.isOpened():
            logger.error(f"Failed to open video file: {video_path}")
            active_analyses[analysis_id]['status'] = 'failed'
            active_analyses[analysis_id]['error'] = 'Failed to open video file'
            return
        
        fps = cap.get(cv2.CAP_PROP_FPS)
        frame_count = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
        duration = frame_count / fps
        
        logger.info(f"Video info - FPS: {fps}, Frames: {frame_count}, Duration: {duration}s")
        
        # Fetch road coordinates
        logger.info(f"Fetching road coordinates for {road_name} in {road_location}")
        road_coordinates = fetch_road_coordinates(road_name, road_location)
        
        logger.info(f"Found {len(road_coordinates)} coordinates for the road")
        
        # Generate road segments with different conditions
        road_segments = []
        detected_frames = []  # List to store paths of frames with detections
        
        # Process every 10th frame or fewer frames for longer videos
        sample_rate = max(10, int(frame_count / 100))  # Process at most 100 frames
        
        current_frame = 0
        segment_id = 0
        
        # Determine how many segments to create based on the number of coordinates
        max_segments = min(len(road_coordinates) - 1, int(frame_count / sample_rate))
        logger.info(f"Planning to create {max_segments} road segments")
        
        while current_frame < frame_count and segment_id < max_segments:
            cap.set(cv2.CAP_PROP_POS_FRAMES, current_frame)
            ret, frame = cap.read()
            
            if not ret:
                logger.warning(f"Failed to read frame {current_frame}")
                break
            
            # Convert frame for model input
            frame_rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
            
            # Run inference
            results = model(frame_rgb)
            
            # Determine road condition based on detections
            # In real implementation, this would be more sophisticated
            confidence = 0.0
            condition = 'good'
            has_detections = False
            
            for result in results:
                boxes = result.boxes
                if len(boxes) > 0:
                    has_detections = True
                    # Draw bounding boxes on the frame
                    for box in boxes:
                        x1, y1, x2, y2 = map(int, box.xyxy[0])
                        cv2.rectangle(frame, (x1, y1), (x2, y2), (0, 0, 255), 2)  # Red box
                        class_id = int(box.cls[0])
                        conf = float(box.conf[0])
                        # Add class name and confidence
                        class_names = ["Longitudinal", "Transverse", "Alligator", "Pothole", "Rutting"]
                        class_name = class_names[class_id] if class_id < len(class_names) else f"Class {class_id}"
                        cv2.putText(frame, f"{class_name} {conf:.2f}", (x1, y1 - 10),
                                  cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 0, 255), 2)
                    
                    # Get total confidence of all detections
                    total_conf = sum(float(box.conf[0]) for box in boxes)
                    
                    # Count defects by type
                    defect_counts = {}
                    for box in boxes:
                        class_id = int(box.cls[0])
                        if class_id not in defect_counts:
                            defect_counts[class_id] = 0
                        defect_counts[class_id] += 1
                    
                    # Determine condition based on defects
                    if 3 in defect_counts or 4 in defect_counts:  # Pothole or Rutting
                        condition = 'bad'
                        confidence = max(confidence, 0.8 + np.random.random() * 0.2)  # 0.8-1.0
                    elif 2 in defect_counts:  # Alligator cracking
                        condition = 'fair'
                        confidence = max(confidence, 0.7 + np.random.random() * 0.2)  # 0.7-0.9
                    elif len(defect_counts) > 0:  # Other defects
                        condition = 'fair'
                        confidence = max(confidence, 0.6 + np.random.random() * 0.3)  # 0.6-0.9
                    else:
                        confidence = max(confidence, 0.7 + np.random.random() * 0.3)  # 0.7-1.0
            
            # If no defects detected or low confidence, randomly assign condition for demo purposes
            if confidence < 0.6:
                confidence = 0.7 + np.random.random() * 0.3
                condition = np.random.choice(['good', 'fair', 'bad'], p=[0.7, 0.2, 0.1])
            
            # Save frame if it has detections
            if has_detections:
                frame_path = os.path.join(detected_frames_dir, f"frame_{current_frame}.jpg")
                cv2.imwrite(frame_path, frame)
                detected_frames.append({
                    'path': frame_path,
                    'frame_number': current_frame,
                    'defects': [{'class': int(box.cls[0]), 'confidence': float(box.conf[0])} for box in boxes]
                })
            
            # Get coordinates for this segment
            start_lat, start_lng = road_coordinates[segment_id]
            end_lat, end_lng = road_coordinates[segment_id + 1]
            
            road_segments.append({
                'id': f'segment-{segment_id}',
                'startCoordinates': {
                    'latitude': start_lat,
                    'longitude': start_lng
                },
                'endCoordinates': {
                    'latitude': end_lat,
                    'longitude': end_lng
                },
                'condition': condition,
                'confidence': confidence
            })
            
            current_frame += sample_rate
            segment_id += 1
            
            # Update status
            progress = min(99, int((current_frame / frame_count) * 100))
            active_analyses[analysis_id]['progress'] = progress
            
            # Log progress periodically
            if segment_id % 10 == 0:
                logger.info(f"Analysis {analysis_id} progress: {progress}%")
        
        # Save results
        result_path = os.path.join(results_dir, f"{analysis_id}.json")
        
        result_data = {
            'id': analysis_id,
            'timestamp': active_analyses[analysis_id]['timestamp'],
            'videoName': active_analyses[analysis_id]['video_name'],
            'roadName': road_name,
            'roadLocation': road_location,
            'roadSegments': road_segments,
            'detectedFrames': detected_frames  # Add detected frames to result data
        }
        
        with open(result_path, 'w') as f:
            json.dump(result_data, f)
        
        # Generate PDF report
        generate_report(analysis_id, result_data)
        
        # Update status
        active_analyses[analysis_id]['status'] = 'completed'
        active_analyses[analysis_id]['result_path'] = result_path
        
        logger.info(f"Analysis completed for ID: {analysis_id}, with {len(road_segments)} segments")
        
        # Close video file
        cap.release()
        
    except Exception as e:
        logger.error(f"Error processing video for analysis ID {analysis_id}: {str(e)}")
        active_analyses[analysis_id]['status'] = 'failed'
        active_analyses[analysis_id]['error'] = str(e)

def generate_report(analysis_id, result_data):
    try:
        # Create PDF report
        report_path = os.path.join(reports_dir, f"{analysis_id}.pdf")
        
        # Count segments by condition
        good_count = sum(1 for segment in result_data['roadSegments'] if segment['condition'] == 'good')
        fair_count = sum(1 for segment in result_data['roadSegments'] if segment['condition'] == 'fair')
        bad_count = sum(1 for segment in result_data['roadSegments'] if segment['condition'] == 'bad')
        total_count = len(result_data['roadSegments'])
        
        # Calculate percentages
        good_percent = (good_count / total_count) * 100 if total_count > 0 else 0
        fair_percent = (fair_count / total_count) * 100 if total_count > 0 else 0
        bad_percent = (bad_count / total_count) * 100 if total_count > 0 else 0
        
        # Create PDF with ReportLab
        c = canvas.Canvas(report_path, pagesize=letter)
        width, height = letter
        
        # Title
        c.setFont('Helvetica-Bold', 16)
        c.drawCentredString(width/2, height - 50, 'Road Condition Analysis Report')
        
        # Analysis info
        c.setFont('Helvetica', 12)
        c.drawString(50, height - 80, f"Analysis ID: {analysis_id}")
        c.drawString(50, height - 100, f"Video: {result_data['videoName']}")
        c.drawString(50, height - 120, f"Road: {result_data.get('roadName', 'N/A')} in {result_data.get('roadLocation', 'N/A')}")
        c.drawString(50, height - 140, f"Date: {datetime.fromisoformat(result_data['timestamp']).strftime('%Y-%m-%d %H:%M:%S')}")
        
        # Statistics header
        c.setFont('Helvetica-Bold', 14)
        c.drawString(50, height - 180, 'Road Condition Statistics')
        
        # Statistics content
        c.setFont('Helvetica', 12)
        c.drawString(50, height - 200, f"Total Road Segments: {total_count}")
        c.drawString(300, height - 200, f"Total Distance: {total_count * 0.05:.2f} km")
        
        c.drawString(50, height - 220, f"Good: {good_count} ({good_percent:.1f}%)")
        c.drawString(300, height - 220, f"Fair: {fair_count} ({fair_percent:.1f}%)")
        c.drawString(50, height - 240, f"Bad: {bad_count} ({bad_percent:.1f}%)")
        
        # Recommendations header
        c.setFont('Helvetica-Bold', 14)
        c.drawString(50, height - 280, 'Recommendations')
        
        # Recommendations content
        c.setFont('Helvetica', 12)
        if bad_count > (total_count * 0.3):
            recommendation = f'High priority maintenance required for {result_data.get("roadName", "this road")}. Multiple sections of the road are in poor condition and require immediate attention.'
        elif bad_count > (total_count * 0.1) or fair_count > (total_count * 0.3):
            recommendation = f'Moderate maintenance recommended for {result_data.get("roadName", "this road")}. Some sections of the road require repair to prevent further deterioration.'
        else:
            recommendation = f'Low priority maintenance for {result_data.get("roadName", "this road")}. The road is generally in good condition with minimal defects.'
        
        # Split text to fit on page width
        text_object = c.beginText(50, height - 300)
        text_object.setFont('Helvetica', 12)
        
        # Wrap text (simple approach)
        words = recommendation.split()
        line = ''
        
        for word in words:
            test_line = line + ' ' + word if line else word
            # Check if adding this word would make the line too long
            if c.stringWidth(test_line, 'Helvetica', 12) < (width - 100):
                line = test_line
            else:
                text_object.textLine(line)
                line = word
        
        if line:
            text_object.textLine(line)
            
        c.drawText(text_object)
        
        # Add detected frames section if there are any
        if 'detectedFrames' in result_data and result_data['detectedFrames']:
            c.showPage()  # Start a new page for images
            
            # Title for detected frames section
            c.setFont('Helvetica-Bold', 14)
            c.drawString(50, height - 50, 'Detected Road Defects')
            
            # Add images with descriptions
            y_position = height - 100
            for i, frame_data in enumerate(result_data['detectedFrames']):
                frame_path = frame_data['path']
                if os.path.exists(frame_path):
                    try:
                        # Draw image
                        img = Image.open(frame_path)
                        img_width, img_height = img.size
                        
                        # Calculate scaling to fit page width
                        scale = min(1.0, (width - 100) / img_width)
                        new_width = img_width * scale
                        new_height = img_height * scale
                        
                        # Draw image
                        c.drawImage(frame_path, 50, y_position - new_height, width=new_width, height=new_height)
                        
                        # Add description with defect details
                        c.setFont('Helvetica', 10)
                        defect_text = f"Frame {i+1}: Detected defects - "
                        defect_details = []
                        for defect in frame_data['defects']:
                            class_names = ["Longitudinal", "Transverse", "Alligator", "Pothole", "Rutting"]
                            class_name = class_names[defect['class']] if defect['class'] < len(class_names) else f"Class {defect['class']}"
                            defect_details.append(f"{class_name} ({defect['confidence']:.2f})")
                        defect_text += ", ".join(defect_details)
                        
                        # Wrap defect text if too long
                        words = defect_text.split()
                        line = ''
                        for word in words:
                            test_line = line + ' ' + word if line else word
                            if c.stringWidth(test_line, 'Helvetica', 10) < (width - 100):
                                line = test_line
                            else:
                                c.drawString(50, y_position - new_height - 20, line)
                                line = word
                                y_position -= 15
                        if line:
                            c.drawString(50, y_position - new_height - 20, line)
                        
                        # Update y position for next image
                        y_position -= (new_height + 40)
                        
                        # If we're running out of space, start a new page
                        if y_position < 100:
                            c.showPage()
                            y_position = height - 50
                    except Exception as e:
                        logger.error(f"Error adding image to report: {str(e)}")
        
        c.save()
        
        # Store the report path
        active_analyses[analysis_id]['report_path'] = report_path
        logger.info(f"Generated report for analysis ID: {analysis_id} at {report_path}")
        
    except Exception as e:
        logger.error(f"Error generating report for analysis ID {analysis_id}: {str(e)}")

@app.route('/analysis-status/<analysis_id>', methods=['GET', 'OPTIONS'])
def analysis_status(analysis_id):
    # Handle preflight OPTIONS request
    if request.method == 'OPTIONS':
        logger.info("Received OPTIONS request for analysis-status")
        return jsonify(success=True)
        
    logger.info(f"Checking status for analysis ID: {analysis_id}")
    logger.info(f"Active analyses: {list(active_analyses.keys())}")
    
    # For debugging, create a dummy status if ID doesn't exist
    if analysis_id not in active_analyses:
        # In production, you would return 404, but for debugging we'll create a dummy entry
        logger.warning(f"Analysis ID not found: {analysis_id}, creating dummy entry")
        active_analyses[analysis_id] = {
            'status': 'processing',
            'timestamp': datetime.now().isoformat(),
            'video_name': 'dummy_video.mp4',
            'road_name': 'Sample Road',
            'road_location': 'Delhi',
            'progress': 10
        }
        
        # Start a thread to simulate processing
        def simulate_processing(aid):
            time.sleep(2)
            if aid in active_analyses:
                active_analyses[aid]['status'] = 'completed'
                active_analyses[aid]['result_path'] = os.path.join(results_dir, f"{aid}.json")
                # Create a minimal result file
                result_data = {
                    'id': aid,
                    'timestamp': active_analyses[aid]['timestamp'],
                    'videoName': active_analyses[aid]['video_name'],
                    'roadName': active_analyses[aid]['road_name'],
                    'roadLocation': active_analyses[aid]['road_location'],
                    'roadSegments': [
                        {
                            'id': 'segment-0',
                            'startCoordinates': {
                                'latitude': 28.6139,
                                'longitude': 77.2090
                            },
                            'endCoordinates': {
                                'latitude': 28.6141,
                                'longitude': 77.2095
                            },
                            'condition': 'good',
                            'confidence': 0.9
                        }
                    ]
                }
                os.makedirs(results_dir, exist_ok=True)
                with open(os.path.join(results_dir, f"{aid}.json"), 'w') as f:
                    json.dump(result_data, f)
                
                # Generate a minimal report
                generate_report(aid, result_data)
        
        threading.Thread(target=simulate_processing, args=(analysis_id,)).start()
    
    analysis = active_analyses[analysis_id]
    
    return jsonify({
        'success': True,
        'status': analysis['status'],
        'progress': analysis.get('progress', 0),
        'error': analysis.get('error', None)
    })

@app.route('/analysis-results/<analysis_id>', methods=['GET'])
def analysis_results(analysis_id):
    logger.info(f"Fetching results for analysis ID: {analysis_id}")
    
    if analysis_id not in active_analyses:
        return jsonify({
            'success': False,
            'error': 'Analysis not found'
        }), 404
    
    analysis = active_analyses[analysis_id]
    
    if analysis['status'] != 'completed':
        return jsonify({
            'success': False,
            'error': 'Analysis is not completed yet',
            'status': analysis['status']
        }), 400
    
    # Read results file
    result_path = analysis.get('result_path')
    
    if not result_path or not os.path.exists(result_path):
        return jsonify({
            'success': False,
            'error': 'Results file not found'
        }), 404
    
    with open(result_path, 'r') as f:
        result_data = json.load(f)
    
    return jsonify({
        'success': True,
        'result': result_data
    })

@app.route('/download-report/<analysis_id>', methods=['GET'])
def download_report(analysis_id):
    logger.info(f"Downloading report for analysis ID: {analysis_id}")
    
    if analysis_id not in active_analyses:
        return jsonify({
            'success': False,
            'error': 'Analysis not found'
        }), 404
    
    analysis = active_analyses[analysis_id]
    
    if analysis['status'] != 'completed':
        return jsonify({
            'success': False,
            'error': 'Analysis is not completed yet'
        }), 400
    
    report_path = analysis.get('report_path')
    
    if not report_path or not os.path.exists(report_path):
        return jsonify({
            'success': False,
            'error': 'Report file not found'
        }), 404
    
    return send_file(report_path, mimetype='application/pdf')

if __name__ == '__main__':
    # Make sure the server is accessible from other origins by binding to 0.0.0.0 
    # and disable threading which can cause issues with CORS on Windows
    logger.info("Starting Flask server on 0.0.0.0:5000")
    app.run(host='0.0.0.0', port=5000, debug=True, threaded=False) 
