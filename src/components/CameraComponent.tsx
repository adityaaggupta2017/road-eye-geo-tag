
import React, { useRef, useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Camera } from 'lucide-react';
import { toast } from '@/components/ui/use-toast';
import api, { Coordinates } from '@/lib/api';

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

  // Start camera and location tracking
  const startCapture = async () => {
    try {
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
      
      toast({
        title: 'Geotagging Started',
        description: 'Taking photos every 2 seconds and collecting location data.'
      });
      
    } catch (error) {
      console.error('Error starting capture:', error);
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
    toast({
      title: 'Geotagging Stopped',
      description: 'Photo and location capture has been stopped.'
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

  // Function to capture image and send to backend
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
        // In a real app, we would send the image to be analyzed by a YOLO model
        // For now, we'll simulate by randomly assigning a road quality
        const qualities = ['good', 'fair', 'poor'] as const;
        const randomQuality = qualities[Math.floor(Math.random() * qualities.length)];
        
        // Submit the "analyzed" rating to the backend
        await api.submitRoadRating(
          currentLocation,
          randomQuality,
          imageData
        );
        
        onRatingSubmitted();
        
      } catch (error) {
        console.error('Error submitting road rating:', error);
        toast({
          title: 'Submission Error',
          description: 'Failed to submit road data.',
          variant: 'destructive'
        });
      }
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
      </div>
      
      <div className="flex flex-col gap-4 w-full max-w-md">
        {!isCapturing ? (
          <Button onClick={startCapture} className="flex items-center gap-2">
            <Camera className="h-4 w-4" />
            Start Geotagging
          </Button>
        ) : (
          <Button onClick={stopCapture} variant="destructive">
            Stop Geotagging
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
            <li>Click "Start Geotagging" to begin</li>
            <li>Allow camera and location access when prompted</li>
            <li>The app will capture images every 2 seconds</li>
            <li>Each image is analyzed for road quality (simulated)</li>
            <li>Results are sent to the database with location data</li>
            <li>Stop anytime by clicking "Stop Geotagging"</li>
          </ol>
        </div>
      </div>
    </div>
  );
};

export default CameraComponent;
