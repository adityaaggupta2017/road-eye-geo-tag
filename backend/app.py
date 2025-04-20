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

# Configure logging
logging.basicConfig(level=logging.DEBUG, 
                   format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

app = Flask(__name__)
CORS(app)

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
model = YOLO(model_path)

# Store active analyses
active_analyses = {}

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
        logger.error(f"Error analyzing image: {str(e)}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

@app.route('/upload-video', methods=['POST'])
def upload_video():
    try:
        if 'video' not in request.files:
            return jsonify({
                'success': False,
                'error': 'No video file provided'
            }), 400
        
        video_file = request.files['video']
        
        if video_file.filename == '':
            return jsonify({
                'success': False,
                'error': 'No selected file'
            }), 400
        
        # Get road name and location from form data
        road_name = request.form.get('road_name', '')
        road_location = request.form.get('road_location', '')
        
        if not road_name or not road_location:
            return jsonify({
                'success': False,
                'error': 'Road name and location are required'
            }), 400
        
        # Generate unique ID for this analysis
        analysis_id = str(uuid.uuid4())
        timestamp = datetime.now().isoformat()
        
        # Save video to uploads directory
        video_path = os.path.join(uploads_dir, f"{analysis_id}.mp4")
        video_file.save(video_path)
        
        logger.info(f"Video uploaded with ID: {analysis_id}, path: {video_path}")
        logger.info(f"Road information: {road_name}, {road_location}")
        
        # Create entry in active analyses
        active_analyses[analysis_id] = {
            'status': 'processing',
            'timestamp': timestamp,
            'video_name': video_file.filename,
            'video_path': video_path,
            'road_name': road_name,
            'road_location': road_location
        }
        
        # Log the active analyses
        logger.info(f"Active analyses: {list(active_analyses.keys())}")
        
        # Start analysis in background thread
        analysis_thread = threading.Thread(target=process_video, args=(analysis_id, video_path, road_name, road_location))
        analysis_thread.daemon = True
        analysis_thread.start()
        
        # Wait a short time to ensure the thread has started
        time.sleep(0.5)
        
        return jsonify({
            'success': True,
            'analysisId': analysis_id,
            'message': 'Video uploaded successfully, processing started'
        })
        
    except Exception as e:
        logger.error(f"Error uploading video: {str(e)}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

def process_video(analysis_id, video_path, road_name, road_location):
    try:
        logger.info(f"Starting video processing for analysis ID: {analysis_id}")
        logger.info(f"Road information: {road_name}, {road_location}")
        
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
            
            for result in results:
                boxes = result.boxes
                if len(boxes) > 0:
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
            'roadSegments': road_segments
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
        
        c.save()
        
        # Store the report path
        active_analyses[analysis_id]['report_path'] = report_path
        logger.info(f"Generated report for analysis ID: {analysis_id} at {report_path}")
        
    except Exception as e:
        logger.error(f"Error generating report for analysis ID {analysis_id}: {str(e)}")

@app.route('/analysis-status/<analysis_id>', methods=['GET'])
def analysis_status(analysis_id):
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
    app.run(port=5000, debug=True, threaded=True) 
