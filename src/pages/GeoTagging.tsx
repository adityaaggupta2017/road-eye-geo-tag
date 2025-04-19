
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import Navbar from '@/components/Navbar';
import { Button } from '@/components/ui/button';
import { Camera, MapPin } from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';
import api, { Coordinates } from '@/lib/api';

const GeoTagging = () => {
  const { isAuthenticated } = useAuth();
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
      
      // Get video element and set stream
      const videoElement = document.getElementById('camera-feed') as HTMLVideoElement;
      if (videoElement) {
        videoElement.srcObject = stream;
      }
      
      // Start location tracking
      const watchId = navigator.geolocation.watchPosition(
        position => {
          setCoordinates({
            latitude: position.coords.latitude,
            longitude: position.coords.longitude
          });
        },
        error => {
          console.error("Error watching position:", error);
          toast({
            title: "Location error",
            description: "Failed to track location",
            variant: "destructive",
          });
        },
        { enableHighAccuracy: true }
      );
      
      setLocationWatcher(watchId);
      setIsCapturing(true);
      
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
      toast({
        title: "Start error",
        description: "Failed to start geotagging",
        variant: "destructive",
      });
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
    if (!coordinates) {
      console.error("No location data available");
      return;
    }
    
    const videoElement = document.getElementById('camera-feed') as HTMLVideoElement;
    const canvas = document.createElement('canvas');
    canvas.width = videoElement.videoWidth;
    canvas.height = videoElement.videoHeight;
    
    const context = canvas.getContext('2d');
    if (context) {
      context.drawImage(videoElement, 0, 0, canvas.width, canvas.height);
      
      // Convert to base64
      const imageData = canvas.toDataURL('image/jpeg');
      
      try {
        // Generate a random rating for demonstration (in real app this would be AI-based)
        const ratings = ['good', 'fair', 'poor'] as const;
        const randomRating = ratings[Math.floor(Math.random() * ratings.length)];
        
        // Send to API
        await api.submitRoadRating(coordinates, randomRating, imageData);
        console.log("Road rating submitted:", randomRating, coordinates);
      } catch (error) {
        console.error("Error submitting rating:", error);
      }
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
                className="w-full h-auto rounded-md"
              ></video>
              
              {coordinates && (
                <div className="absolute bottom-2 left-2 bg-black/70 text-white px-2 py-1 rounded text-xs">
                  {coordinates.latitude.toFixed(6)}, {coordinates.longitude.toFixed(6)}
                </div>
              )}
            </div>
          )}
          
          {!isCapturing && (
            <div className="bg-muted h-64 rounded-lg flex items-center justify-center">
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
