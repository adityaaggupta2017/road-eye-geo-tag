
import React, { useRef, useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Camera } from 'lucide-react';
import { toast } from '@/components/ui/use-toast';
import api, { Coordinates } from '@/lib/api';
import { analyzeRoadImage, DEFECT_THRESHOLDS } from '@/lib/yoloModel';
import { cn } from '@/lib/utils';

interface CameraComponentProps {
  onRatingSubmitted: () => void;
}

const CameraComponent: React.FC<CameraComponentProps> = ({ onRatingSubmitted }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [captureInterval, setCaptureInterval] = useState<NodeJS.Timeout | null>(null);
  const [isCapturing, setIsCapturing] = useState(false);
  const [currentLocation, setCurrentLocation] = useState<Coordinates | null>(null);
  const [watchId, setWatchId] = useState<number | null>(null);
  const [lastAnalysis, setLastAnalysis] = useState<{
    defectCount: number;
    quality: 'good' | 'fair' | 'poor';
  } | null>(null);
  const [isModelLoading, setIsModelLoading] = useState(false);

  // Start camera and location tracking
  const startCapture = async () => {
    try {
      setIsModelLoading(true);
      
      // Request camera access
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' }, // Use back camera on mobile
        audio: false
      });
      
      setStream(mediaStream);
      
      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream;
      }

      // Request location access
      if ('geolocation' in navigator) {
        const id = navigator.geolocation.watchPosition(
          (position) => {
            setCurrentLocation({
              latitude: position.coords.latitude,
              longitude: position.coords.longitude
            });
          },
          (error) => {
            console.error('Location error:', error);
            toast({
              title: 'Location Error',
              description: `Failed to get location: ${error.message}`,
              variant: 'destructive'
            });
          },
          {
            enableHighAccuracy: true,
            maximumAge: 0,
            timeout: 5000
          }
        );
        
        setWatchId(id);
      } else {
        toast({
          title: 'Geolocation Not Available',
          description: 'Your browser does not support geolocation.',
          variant: 'destructive'
        });
      }

      // Set interval to capture image every 2 seconds
      const interval = setInterval(() => {
        captureImage();
      }, 2000);
      
      setCaptureInterval(interval);
      setIsCapturing(true);
      setIsModelLoading(false);
      
      toast({
        title: 'Road Detection Started',
        description: 'Analyzing road quality every 2 seconds with YOLO model.'
      });
      
    } catch (error) {
      console.error('Error starting capture:', error);
      setIsModelLoading(false);
      toast({
        title: 'Camera Error',
        description: 'Could not access camera. Please check permissions.',
        variant: 'destructive'
      });
    }
  };

  // Stop camera and location tracking
  const stopCapture = () => {
    // Stop the media stream
    if (stream) {
      stream.getTracks().forEach(track => track.stop());
      setStream(null);
    }
    
    // Clear the capture interval
    if (captureInterval) {
      clearInterval(captureInterval);
      setCaptureInterval(null);
    }
    
    // Stop location tracking
    if (watchId !== null) {
      navigator.geolocation.clearWatch(watchId);
      setWatchId(null);
    }
    
    setIsCapturing(false);
    setLastAnalysis(null);
    
    toast({
      title: 'Road Detection Stopped',
      description: 'Road quality analysis has been stopped.'
    });
  };

  // Cleanup on component unmount
  useEffect(() => {
    return () => {
      if (stream) {
        stream.getTracks().forEach(track => track.stop());
      }
      
      if (captureInterval) {
        clearInterval(captureInterval);
      }
      
      if (watchId !== null) {
        navigator.geolocation.clearWatch(watchId);
      }
    };
  }, [stream, captureInterval, watchId]);

  // Function to capture image and analyze with YOLO model
  const captureImage = async () => {
    if (!videoRef.current || !canvasRef.current || !currentLocation) {
      return;
    }
    
    const video = videoRef.current;
    const canvas = canvasRef.current;
    
    // Set canvas dimensions to match video
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    
    // Draw current frame to canvas
    const context = canvas.getContext('2d');
    if (context) {
      context.drawImage(video, 0, 0, canvas.width, canvas.height);
      
      // Get image data as base64
      const imageData = canvas.toDataURL('image/jpeg');
      
      try {
        // Analyze image using our YOLO model
        const analysis = await analyzeRoadImage(imageData);
        
        setLastAnalysis({
          defectCount: analysis.defectCount,
          quality: analysis.quality
        });
        
        // Submit the analyzed rating to the backend
        await api.submitRoadRating(
          currentLocation,
          analysis.quality,
          imageData
        );
        
        onRatingSubmitted();
        
      } catch (error) {
        console.error('Error analyzing road quality:', error);
        toast({
          title: 'Analysis Error',
          description: 'Failed to analyze road quality from image.',
          variant: 'destructive'
        });
      }
    }
  };

  // Get color for quality indicator
  const getQualityColor = (quality: 'good' | 'fair' | 'poor' | null) => {
    switch (quality) {
      case 'good': return 'bg-green-500';
      case 'fair': return 'bg-yellow-500';
      case 'poor': return 'bg-red-500';
      default: return 'bg-gray-500';
    }
  };

  // Get description text for quality
  const getQualityDescription = (quality: 'good' | 'fair' | 'poor' | null, defectCount: number | null) => {
    if (quality === null || defectCount === null) return 'No data';
    
    switch (quality) {
      case 'good':
        return `Good road quality (${defectCount} defects)`;
      case 'fair':
        return `Fair road quality (${defectCount} defects)`;
      case 'poor':
        return `Poor road quality (${defectCount} defects)`;
      default:
        return 'Unknown quality';
    }
  };

  return (
    <div className="flex flex-col items-center p-4">
      <div className="relative w-full max-w-md mb-4 rounded-lg overflow-hidden bg-gray-900">
        <video
          ref={videoRef}
          autoPlay
          playsInline
          className={`w-full h-auto ${!stream ? 'hidden' : ''}`}
        />
        
        {!stream && (
          <div className="flex items-center justify-center h-64 bg-gray-800 text-gray-300">
            <Camera className="h-12 w-12 mb-2" />
            <p>Camera preview will appear here</p>
          </div>
        )}
        
        <canvas ref={canvasRef} className="hidden" />
        
        {lastAnalysis && (
          <div className={cn(
            "absolute bottom-0 left-0 right-0 p-3",
            getQualityColor(lastAnalysis.quality)
          )}>
            <p className="text-white font-medium text-sm">
              {getQualityDescription(lastAnalysis.quality, lastAnalysis.defectCount)}
            </p>
          </div>
        )}
      </div>
      
      <div className="flex flex-col gap-4 w-full max-w-md">
        {!isCapturing ? (
          <Button 
            onClick={startCapture} 
            className="flex items-center gap-2"
            disabled={isModelLoading}
          >
            {isModelLoading ? (
              <>
                <div className="h-4 w-4 rounded-full border-2 border-primary border-t-transparent animate-spin" />
                Loading YOLO Model...
              </>
            ) : (
              <>
                <Camera className="h-4 w-4" />
                Start Road Quality Detection
              </>
            )}
          </Button>
        ) : (
          <Button onClick={stopCapture} variant="destructive">
            Stop Detection
          </Button>
        )}
        
        <div className="text-sm text-muted-foreground">
          {currentLocation ? (
            <p>
              Current Location: {currentLocation.latitude.toFixed(6)},{' '}
              {currentLocation.longitude.toFixed(6)}
            </p>
          ) : (
            <p>Waiting for location data...</p>
          )}
        </div>
        
        <div className="p-4 bg-secondary rounded-lg">
          <h3 className="font-medium mb-2">How it works:</h3>
          <ol className="list-decimal list-inside space-y-1 text-sm">
            <li>Click "Start Road Quality Detection" to begin</li>
            <li>Allow camera and location access when prompted</li>
            <li>The app captures images every 2 seconds</li>
            <li>Our YOLO model detects road defects in each image</li>
            <li>Quality rating is assigned based on defect count:
              <ul className="list-disc list-inside ml-5 mt-1">
                <li className="text-green-600">Good: 0-{DEFECT_THRESHOLDS.GOOD} defects</li>
                <li className="text-yellow-600">Fair: {DEFECT_THRESHOLDS.GOOD+1}-{DEFECT_THRESHOLDS.FAIR} defects</li>
                <li className="text-red-600">Poor: {DEFECT_THRESHOLDS.FAIR+1}+ defects</li>
              </ul>
            </li>
            <li>Results are shown on the map with color-coding</li>
          </ol>
        </div>
      </div>
    </div>
  );
};

export default CameraComponent;
