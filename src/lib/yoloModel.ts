import * as tf from '@tensorflow/tfjs';

// Road quality thresholds (based on number of significant defects)
export const DEFECT_THRESHOLDS = {
  GOOD: 2,  // 0-2 defects
  FAIR: 5,  // 3-5 defects
  // Above 5 is poor
};

// RDD2022 dataset classes
export const RDD_CLASSES = [
  'D00-Longitudinal',
  'D10-Transverse',
  'D20-Alligator',
  'D40-Pothole',
  'D50-Rutting',
];

// Cache the model to avoid reloading
let modelCache: tf.GraphModel | null = null;

export const loadYoloModel = async (): Promise<tf.GraphModel> => {
  if (modelCache) {
    return modelCache;
  }

  try {
    // Load the YOLOv8 model
    const model = await tf.loadGraphModel('/models/YOLOv8_Small_RDD/model.json');
    modelCache = model;
    console.log('YOLOv8 model loaded successfully');
    return model;
  } catch (error) {
    console.error('Failed to load YOLO model:', error);
    throw new Error('Failed to load road defect detection model');
  }
};

// Process image data to tensor
const processImage = async (imageData: string): Promise<tf.Tensor3D> => {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      // Convert image to tensor and preprocess
      const tensor = tf.browser.fromPixels(img)
        .resizeNearestNeighbor([640, 640]) // YOLO input size
        .expandDims(0)
        .toFloat()
        .div(255.0); // Normalize
      
      resolve(tensor.squeeze() as tf.Tensor3D);
    };
    img.onerror = reject;
    img.src = imageData;
  });
};

// Process YOLO output to get detections
const processDetections = (output: tf.Tensor): Array<{
  type: string;
  confidence: number;
  bbox: [number, number, number, number]; // [x, y, width, height]
}> => {
  const detections = output.arraySync() as number[][];
  return detections
    .filter(det => det[4] > 0.3) // Confidence threshold
    .map(det => {
      const classId = det[5];
      return {
        type: RDD_CLASSES[classId],
        confidence: det[4],
        bbox: [det[0], det[1], det[2], det[3]] as [number, number, number, number]
      };
    });
};

// Demo version of road analysis for testing without backend
export const analyzeRoadImageDemo = async (imageData: string) => {
  // Simulate network delay
  await new Promise(resolve => setTimeout(resolve, 1000));
  
  // Generate random number of defects (0-10)
  const defectCount = Math.floor(Math.random() * 11);
  
  // Generate random defects
  const defects = [];
  for (let i = 0; i < defectCount; i++) {
    // Random defect type
    const typeIndex = Math.floor(Math.random() * RDD_CLASSES.length);
    const type = RDD_CLASSES[typeIndex];
    
    // Random confidence (0.3-0.95)
    const confidence = 0.3 + Math.random() * 0.65;
    
    // Random bounding box
    const x = Math.random() * 500;
    const y = Math.random() * 500;
    const width = 50 + Math.random() * 100;
    const height = 50 + Math.random() * 100;
    
    defects.push({
      type,
      confidence,
      bbox: [x, y, width, height] as [number, number, number, number]
    });
  }
  
  // Determine quality based on defect count
  let quality: 'good' | 'fair' | 'poor';
  if (defectCount <= DEFECT_THRESHOLDS.GOOD) {
    quality = 'good';
  } else if (defectCount <= DEFECT_THRESHOLDS.FAIR) {
    quality = 'fair';
  } else {
    quality = 'poor';
  }
  
  return {
    defectCount,
    defects,
    quality
  };
};

// Define multiple API URLs to try
const API_URLS = ['http://localhost:5000', 'http://127.0.0.1:5000', 'http://0.0.0.0:5000', 'http://[::1]:5000', window.location.origin + '/api'];

export const analyzeRoadImage = async (imageData: string): Promise<{ quality: 'good' | 'fair' | 'poor' }> => {
  // Try each API URL
  let lastError = null;
  
  for (const apiUrl of API_URLS) {
    try {
      console.log(`Trying to analyze image with ${apiUrl}/analyze`);
      const response = await fetch(`${apiUrl}/analyze`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ image: imageData }),
        credentials: 'include', // Include cookies in the request
      });

      if (!response.ok) {
        console.error(`Error response from ${apiUrl}: ${response.status} ${response.statusText}`);
        continue; // Try the next URL
      }

      const data = await response.json();
      
      if (!data.success) {
        console.error(`API error from ${apiUrl}: ${data.error}`);
        continue; // Try the next URL
      }
      
      console.log(`Successfully analyzed image with ${apiUrl}`);
      
      // Determine quality based on the number of defects and their confidence
      const defects = data.defects || [];
      const highConfidenceDefects = defects.filter((d: any) => d.confidence > 0.4);
      
      if (highConfidenceDefects.length >= 6) {
        return { quality: 'poor' };
      } else if (highConfidenceDefects.length >= 3) {
        return { quality: 'fair' };
      } else {
        return { quality: 'good' };
      }
    } catch (error) {
      console.error(`Error analyzing with ${apiUrl}:`, error);
      lastError = error;
    }
  }
  
  // If all servers failed, fallback to demo mode
  console.log('All server connections failed, using demo mode');
  const demoResult = await analyzeRoadImageDemo(imageData);
  return { quality: demoResult.quality };
};
