import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import Navbar from '@/components/Navbar';
import { Button } from '@/components/ui/button';
import { Camera, MapPin } from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';
import api, { Coordinates } from '@/lib/api';
import { analyzeRoadImage } from '@/lib/yoloModel';

interface GeoTaggingProps {
  onRatingSubmitted?: () => void;
}

const GeoTagging: React.FC<GeoTaggingProps> = ({ onRatingSubmitted }) => {
  const { isAuthenticated, user } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  
  const [isCapturing, setIsCapturing] = useState(false);
  const [hasPermissions, setHasPermissions] = useState(false);
  const [videoStream, setVideoStream] = useState<MediaStream | null>(null);
  const [coordinates, setCoordinates] = useState<Coordinates | null>(null);
  const [locationWatcher, setLocationWatcher] = useState<number | null>(null);
  
  // Check authentication and redirect if not authenticated
  useEffect(() => {
    if (!isAuthenticated) {
      toast({
        title: "Authentication required",
        description: "Please login to access the geotagging feature",
        variant: "destructive",
      });
      navigate('/login');
    }
  }, [isAuthenticated, navigate, toast]);

  // Request permissions and cleanup on unmount
  useEffect(() => {
    const requestPermissions = async () => {
      try {
        // Request camera permission
        await navigator.mediaDevices.getUserMedia({ video: true });
        
        // Request location permission
        navigator.geolocation.getCurrentPosition(() => {
          setHasPermissions(true);
          toast({
            title: "Permissions granted",
            description: "Camera and location access granted",
          });
        }, (error) => {
          console.error("Location permission error:", error);
          toast({
            title: "Permission error",
            description: "Location permission is required for geotagging",
            variant: "destructive",
          });
        });
      } catch (error) {
        console.error("Camera permission error:", error);
        toast({
          title: "Permission error",
          description: "Camera permission is required for geotagging",
          variant: "destructive",
        });
      }
    };
    
    requestPermissions();
    
    // Cleanup function
    return () => {
      if (videoStream) {
        videoStream.getTracks().forEach(track => track.stop());
      }
      
      if (locationWatcher) {
        navigator.geolocation.clearWatch(locationWatcher);
      }
    };
  }, [toast]);

  const startCapturing = async () => {
    try {
      // Start camera
      const stream = await navigator.mediaDevices.getUserMedia({ 
        video: { facingMode: "environment" }
      });
      setVideoStream(stream);
      
      // Set capturing state first to ensure video element is rendered
      setIsCapturing(true);
      
      // Small delay to allow React to render the video element
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // Get video element and set stream
      const videoElement = document.getElementById('camera-feed') as HTMLVideoElement;
      if (!videoElement) {
        throw new Error("Video element not found. Please try again.");
      }
      
      videoElement.srcObject = stream;
      
      // Wait for video to be ready
      await new Promise<void>((resolve, reject) => {
        const handleLoadedMetadata = () => {
          videoElement.removeEventListener('loadedmetadata', handleLoadedMetadata);
          videoElement.play()
            .then(() => {
              // Wait a short time to ensure video dimensions are set
              setTimeout(() => {
                if (videoElement.videoWidth === 0 || videoElement.videoHeight === 0) {
                  reject(new Error("Video dimensions are not valid"));
                } else {
                  resolve();
                }
              }, 100);
            })
            .catch(error => {
              reject(error);
            });
        };
        
        videoElement.addEventListener('loadedmetadata', handleLoadedMetadata);
      });
      
      // Start location tracking with better options
      const watchId = navigator.geolocation.watchPosition(
        position => {
          const newCoordinates = {
            latitude: position.coords.latitude,
            longitude: position.coords.longitude
          };
          console.log("Updated coordinates:", newCoordinates);
          setCoordinates(newCoordinates);
          
          // Save coordinates to localStorage for immediate access
          localStorage.setItem('currentCoordinates', JSON.stringify(newCoordinates));
        },
        error => {
          console.error("Error watching position:", error);
          let errorMessage = "Failed to track location";
          
          switch (error.code) {
            case error.PERMISSION_DENIED:
              errorMessage = "Location permission denied. Please enable location access.";
              break;
            case error.POSITION_UNAVAILABLE:
              errorMessage = "Location information unavailable. Please check your GPS.";
              break;
            case error.TIMEOUT:
              errorMessage = "Location request timed out. Please try again.";
              break;
          }
          
          toast({
            title: "Location error",
            description: errorMessage,
            variant: "destructive",
          });
        },
        { 
          enableHighAccuracy: true,
          timeout: 10000, // 10 seconds timeout
          maximumAge: 0
        }
      );
      
      setLocationWatcher(watchId);
      
      // Set up interval for capturing images
      const captureInterval = setInterval(() => {
        captureImage();
      }, 2000); // Every 2 seconds
      
      // Store the interval ID for cleanup
      window.sessionStorage.setItem('captureIntervalId', captureInterval.toString());
      
      toast({
        title: "Geotagging started",
        description: "Capturing an image every 2 seconds",
      });
    } catch (error) {
      console.error("Error starting capture:", error);
      let errorMessage = "Failed to start geotagging";
      
      if (error instanceof Error) {
        if (error.message === "Video dimensions are not valid") {
          errorMessage = "Camera is not ready. Please try again.";
        } else {
          errorMessage = error.message;
        }
      }
      
      toast({
        title: "Start error",
        description: errorMessage,
        variant: "destructive",
      });
      
      // Clean up on error
      if (videoStream) {
        videoStream.getTracks().forEach(track => track.stop());
        setVideoStream(null);
      }
      setIsCapturing(false);
    }
  };

  const stopCapturing = () => {
    // Stop camera
    if (videoStream) {
      videoStream.getTracks().forEach(track => track.stop());
      setVideoStream(null);
    }
    
    // Stop location tracking
    if (locationWatcher) {
      navigator.geolocation.clearWatch(locationWatcher);
      setLocationWatcher(null);
    }
    
    // Clear capture interval
    const intervalId = window.sessionStorage.getItem('captureIntervalId');
    if (intervalId) {
      clearInterval(parseInt(intervalId));
      window.sessionStorage.removeItem('captureIntervalId');
    }
    
    setIsCapturing(false);
    toast({
      title: "Geotagging stopped",
      description: "You can restart geotagging anytime",
    });
  };

  const captureImage = async () => {
    // Try to get coordinates from localStorage first
    const storedCoords = localStorage.getItem('currentCoordinates');
    const currentCoords = storedCoords ? JSON.parse(storedCoords) : coordinates;
    
    if (!currentCoords) {
      console.warn("No coordinates available, skipping capture");
      return;
    }
    
    const videoElement = document.getElementById('camera-feed') as HTMLVideoElement;
    if (!videoElement) {
      console.error("Video element not found");
      return;
    }

    // Check if video is ready and has valid dimensions
    if (videoElement.videoWidth === 0 || videoElement.videoHeight === 0) {
      console.error("Video dimensions are not valid");
      return;
    }

    const canvas = document.createElement('canvas');
    canvas.width = videoElement.videoWidth;
    canvas.height = videoElement.videoHeight;
    
    const context = canvas.getContext('2d');
    if (!context) {
      console.error("Could not get canvas context");
      return;
    }

    try {
      context.drawImage(videoElement, 0, 0, canvas.width, canvas.height);
      
      // Convert to base64 with quality parameter
      const imageData = canvas.toDataURL('image/jpeg', 0.8);
      
      // Validate the image data
      if (!imageData || imageData === 'data:,') {
        console.error("Invalid image data generated");
        return;
      }
      
      // Analyze road quality using YOLO model
      const analysis = await analyzeRoadImage(imageData);
        
      // Submit to API
      await api.submitRoadRating(currentCoords, analysis.quality, imageData);
      
      // Trigger map update
      if (onRatingSubmitted) {
        onRatingSubmitted();
      }
      
      toast({
        title: "Image captured",
        description: `Road quality: ${analysis.quality}`,
      });
    } catch (error) {
      console.error("Error capturing image:", error);
      let errorMessage = "Failed to capture and analyze image";
      
      if (error instanceof Error) {
        if (error.message.includes('Failed to connect to the backend server')) {
          errorMessage = "Backend server is not running. Please start the server on port 5000.";
        } else {
          errorMessage = error.message;
        }
      }
      
      toast({
        title: "Capture error",
        description: errorMessage,
        variant: "destructive",
      });
    }
  };

  if (!isAuthenticated) {
    return null; // Will redirect via useEffect
  }

  return (
    <div className="min-h-screen flex flex-col">
      <Navbar />
      <main className="flex-1 p-4">
        <div className="max-w-4xl mx-auto">
          <h1 className="text-2xl font-bold mb-4 flex items-center gap-2">
            <MapPin className="text-primary" />
            Road Quality Geotagging
          </h1>
          
          <div className="bg-card rounded-lg shadow-md p-4 mb-4">
            <h2 className="text-lg font-semibold mb-2">How it works</h2>
            <p className="text-muted-foreground mb-4">
              This tool captures images every 2 seconds and automatically rates road quality based on the image.
              Each image is geotagged with your current location coordinates.
            </p>
            
            {hasPermissions ? (
              <div className="flex flex-wrap gap-2">
                {!isCapturing ? (
                  <Button 
                    onClick={startCapturing}
                    className="flex items-center gap-2"
                  >
                    <Camera className="h-4 w-4" />
                    Start Geotagging
                  </Button>
                ) : (
                  <Button 
                    onClick={stopCapturing}
                    variant="destructive"
                    className="flex items-center gap-2"
                  >
                    Stop Geotagging
                  </Button>
                )}
              </div>
            ) : (
              <div className="bg-muted p-4 rounded-md">
                <p className="font-medium mb-2">Required Permissions</p>
                <p className="text-sm text-muted-foreground">
                  Please grant camera and location permissions when prompted to use this feature.
                </p>
              </div>
            )}
          </div>
          
          {isCapturing && (
            <div className="relative bg-card rounded-lg shadow-md overflow-hidden">
              <video 
                id="camera-feed" 
                autoPlay 
                playsInline
                muted
                className="w-full h-[500px] object-cover rounded-md"
                style={{ transform: 'scaleX(-1)' }} // Mirror the video for better UX
              ></video>
              
              {coordinates && (
                <div className="absolute bottom-2 left-2 bg-black/70 text-white px-2 py-1 rounded text-xs">
                  {coordinates.latitude.toFixed(6)}, {coordinates.longitude.toFixed(6)}
                </div>
              )}
            </div>
          )}
          
          {!isCapturing && (
            <div className="bg-muted h-[500px] rounded-lg flex items-center justify-center">
              <div className="text-center">
                <Camera className="h-12 w-12 text-muted-foreground mx-auto mb-2" />
                <p className="text-muted-foreground">
                  Camera preview will appear here when you start geotagging
                </p>
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
};

export default GeoTagging;
