import React, { useState, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Camera, Pause, Play } from 'lucide-react';
import LocationInput from './LocationInput';
import { analyzeRoadImage } from '@/lib/yoloModel';
import { toast } from '@/components/ui/use-toast';
import api from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';
import { cn } from '@/lib/utils';

interface CameraComponentProps {
  onRatingSubmitted?: () => void;
  showImmediateResults?: boolean;
}

const CameraComponent: React.FC<CameraComponentProps> = ({ 
  onRatingSubmitted,
  showImmediateResults = false
}) => {
  const { isAuthenticated } = useAuth();
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [isCapturing, setIsCapturing] = useState(false);
  const [captureInterval, setCaptureInterval] = useState<NodeJS.Timeout | null>(null);
  const [currentImage, setCurrentImage] = useState<string | null>(null);
  const [location, setLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [hasLocationPermission, setHasLocationPermission] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [lastAnalysis, setLastAnalysis] = useState<any>(null);
  const [totalRatings, setTotalRatings] = useState(0);
  const [showResults, setShowResults] = useState(false);

  useEffect(() => {
    requestLocationPermission();
    
    return () => {
      // Cleanup
      if (captureInterval) {
        clearInterval(captureInterval);
      }
      if (stream) {
        stream.getTracks().forEach(track => track.stop());
      }
    };
  }, []);

  useEffect(() => {
    if (videoRef.current && stream) {
      videoRef.current.srcObject = stream;
      videoRef.current.onloadedmetadata = () => {
        videoRef.current?.play().catch(error => {
          console.error('Error playing video:', error);
          toast({
            title: "Video Stream Error",
            description: "Failed to start video stream",
            variant: "destructive",
          });
        });
      };
    }
  }, [stream]);

  const requestLocationPermission = () => {
    if ('geolocation' in navigator) {
      navigator.geolocation.getCurrentPosition(
        position => {
          setLocation({
            lat: position.coords.latitude,
            lng: position.coords.longitude
          });
          setHasLocationPermission(true);
        },
        error => {
          console.error('Error getting location:', error);
          setHasLocationPermission(false);
          toast({
            title: "Location Access Denied",
            description: "Please enable location services to use geotagging features",
            variant: "destructive",
          });
        }
      );
    } else {
      setHasLocationPermission(false);
      toast({
        title: "Location Not Available",
        description: "Your browser doesn't support geolocation",
        variant: "destructive",
      });
    }
  };

  const startCamera = async () => {
    try {
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' },
        audio: false
      });
      
      setStream(mediaStream);
      
      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream;
        // Wait for the video to be ready
        await new Promise((resolve) => {
          videoRef.current!.onloadedmetadata = () => {
            videoRef.current!.play();
            resolve(true);
          };
        });
      }
      
      toast({
        title: "Camera Started",
        description: "Press 'Start Capturing' to begin road quality analysis"
      });
    } catch (error) {
      console.error('Error accessing camera:', error);
      toast({
        title: "Camera Access Error",
        description: "Failed to access your camera",
        variant: "destructive",
      });
    }
  };

  const stopCamera = () => {
    if (stream) {
      stream.getTracks().forEach(track => track.stop());
      setStream(null);
    }
    
    if (captureInterval) {
      clearInterval(captureInterval);
      setCaptureInterval(null);
    }
    
    setIsCapturing(false);
  };

  const captureImage = () => {
    if (!videoRef.current || !canvasRef.current) {
      console.error('Video or canvas reference not available');
      return null;
    }
    
    const video = videoRef.current;
    const canvas = canvasRef.current;
    const context = canvas.getContext('2d');
    
    if (!context) {
      console.error('Could not get canvas context');
      return null;
    }
    
    // Check if video is ready and has valid dimensions
    if (video.videoWidth === 0 || video.videoHeight === 0) {
      console.error('Video dimensions are not valid');
      return null;
    }
    
    // Set canvas dimensions to match video
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    
    try {
      // Draw video frame to canvas
      context.drawImage(video, 0, 0, canvas.width, canvas.height);
      
      // Convert canvas to data URL
      const imageDataUrl = canvas.toDataURL('image/jpeg', 0.8); // Add quality parameter
      if (!imageDataUrl || imageDataUrl === 'data:,') {
        console.error('Failed to generate valid image data URL');
        return null;
      }
      
      setCurrentImage(imageDataUrl);
      return imageDataUrl;
    } catch (error) {
      console.error('Error capturing image:', error);
      return null;
    }
  };

  const startCapturing = () => {
    if (!stream) {
      toast({
        title: "Camera Not Started",
        description: "Please start the camera first",
        variant: "destructive",
      });
      return;
    }
    
    if (!location) {
      toast({
        title: "Location Not Available",
        description: "Please enable location services or manually set a location",
        variant: "destructive",
      });
      return;
    }
    
    setIsCapturing(true);
    setShowResults(false);
    
    const interval = setInterval(async () => {
      const imageData = captureImage();
      if (!imageData) return;
      
      try {
        // Update location with latest GPS data if available
        if (hasLocationPermission) {
          navigator.geolocation.getCurrentPosition(
            position => {
              setLocation({
                lat: position.coords.latitude,
                lng: position.coords.longitude
              });
            },
            error => console.error('Error updating location:', error)
          );
        }
        
        const analysis = await analyzeRoadImage(imageData);
        setLastAnalysis(analysis);
        
        if (location) {
          await api.submitRoadRating(
            {
              latitude: location.lat,
              longitude: location.lng
            },
            analysis.quality,
            imageData
          );
          
          setTotalRatings(prev => prev + 1);
          
          if (onRatingSubmitted) {
            onRatingSubmitted();
          }
        }
      } catch (error) {
        console.error('Error analyzing image:', error);
      }
    }, 2000); // Capture every 2 seconds
    
    setCaptureInterval(interval);
  };

  const stopCapturing = () => {
    if (captureInterval) {
      clearInterval(captureInterval);
      setCaptureInterval(null);
    }
    setIsCapturing(false);
    if (showImmediateResults) {
      setShowResults(true);
    }
  };

  return (
    <div className="space-y-4">
      <Card className="p-4">
        <div className="flex flex-col space-y-4">
          <div className="w-full bg-gray-100 rounded-lg overflow-hidden aspect-video relative">
            {stream ? (
              <video 
                ref={videoRef} 
                autoPlay 
                playsInline
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="absolute inset-0 flex items-center justify-center">
                <Camera className="w-12 h-12 text-gray-400" />
              </div>
            )}
            <canvas ref={canvasRef} className="hidden" />
          </div>
          
          <div className="flex flex-wrap gap-2">
            {!stream ? (
              <Button onClick={startCamera}>
                Start Camera
              </Button>
            ) : (
              <Button variant="destructive" onClick={stopCamera}>
                Stop Camera
              </Button>
            )}
            
            {stream && !isCapturing && (
              <Button 
                onClick={startCapturing} 
                disabled={!location}
                className="flex items-center gap-2"
              >
                <Play className="h-4 w-4" />
                Start Capturing
              </Button>
            )}
            
            {isCapturing && (
              <Button 
                variant="outline" 
                onClick={stopCapturing}
                className="flex items-center gap-2"
              >
                <Pause className="h-4 w-4" />
                Stop Capturing
              </Button>
            )}
          </div>
          
          <LocationInput
            initialLocation={location}
            onLocationChange={setLocation}
          />
          
          {!isAuthenticated && (
            <p className="text-amber-600 text-sm">
              ⓘ You're using the demo mode. To save captured data permanently, please login.
            </p>
          )}
        </div>
      </Card>
      
      {totalRatings > 0 && (
        <Card className="p-4">
          <p>Total road segments analyzed: {totalRatings}</p>
        </Card>
      )}
      
      {(showResults && lastAnalysis) && (
        <Card className="p-4">
          <h3 className="text-lg font-semibold mb-2">Latest Analysis Results</h3>
          <div className="flex flex-col md:flex-row gap-4">
            {currentImage && (
              <div className="md:w-1/2">
                <img 
                  src={currentImage} 
                  alt="Captured road" 
                  className="w-full rounded-lg"
                />
              </div>
            )}
            <div className="md:w-1/2 space-y-2">
              <p>Defects found: {lastAnalysis.defectCount}</p>
              <p>Road quality: <span className={cn(
                "font-semibold",
                lastAnalysis.quality === 'good' && "text-green-600",
                lastAnalysis.quality === 'fair' && "text-yellow-600",
                lastAnalysis.quality === 'poor' && "text-red-600"
              )}>
                {lastAnalysis.quality.toUpperCase()}
              </span></p>
              {lastAnalysis.defects.length > 0 && (
                <div>
                  <p className="font-medium">Detected defects:</p>
                  <ul className="list-disc list-inside">
                    {lastAnalysis.defects.map((defect: any, index: number) => (
                      <li key={index}>
                        {defect.type} (confidence: {(defect.confidence * 100).toFixed(1)}%)
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {location && (
                <p className="text-sm text-gray-500">
                  Location: {location.lat.toFixed(6)}, {location.lng.toFixed(6)}
                </p>
              )}
            </div>
          </div>
        </Card>
      )}
    </div>
  );
};

export default CameraComponent;
