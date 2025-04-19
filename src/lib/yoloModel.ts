
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
    // Load the RDD2022 YOLO model
    const model = await tf.loadGraphModel('/models/road_defect_model/model.json');
    modelCache = model;
    console.log('RDD2022 YOLO model loaded successfully');
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
      
      // Cast to Tensor3D to ensure correct type
      resolve(tensor.squeeze() as tf.Tensor3D);
    };
    img.onerror = reject;
    img.src = imageData;
  });
};

export const analyzeRoadImage = async (imageData: string) => {
  try {
    const model = await loadYoloModel();
    const tensor = await processImage(imageData);
    
    // For demonstration (since we don't have the actual model)
    // In production, this would use model.predict() and process real outputs
    const simulatedDefects = RDD_CLASSES
      .filter(() => Math.random() > 0.7) // Randomly select some defect types
      .map(type => ({
        type,
        confidence: 0.7 + Math.random() * 0.25, // Random confidence between 0.7-0.95
      }));

    const defectCount = simulatedDefects.length;
    
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
      defects: simulatedDefects,
      quality
    };
  } catch (error) {
    console.error('Error analyzing road image:', error);
    throw error;
  }
};
