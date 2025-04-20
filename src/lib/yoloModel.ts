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

export const analyzeRoadImage = async (imageData: string) => {
  try {
    // For demo purposes, use the demo function instead of calling the backend
    return await analyzeRoadImageDemo(imageData);
    
    // Original implementation that calls the backend
    /*
    // Send image to Python backend
    const response = await fetch('http://localhost:5000/analyze', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ image: imageData }),
    });

    if (!response.ok) {
      throw new Error('Failed to analyze image');
    }

    const result = await response.json();
    
    if (!result.success) {
      throw new Error(result.error || 'Analysis failed');
    }

    const defectCount = result.defectCount;
    
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
      defects: result.defects,
      quality
    };
    */
  } catch (error) {
    console.error('Error analyzing road image:', error);
    throw error;
  }
};
