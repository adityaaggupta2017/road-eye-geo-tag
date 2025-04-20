
import React, { useState, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Upload, Play, Pause } from 'lucide-react';
import { toast } from '@/components/ui/use-toast';
import { analyzeRoadImage } from '@/lib/yoloModel';
import { cn } from '@/lib/utils';
import api from '@/lib/api';

// Function to generate coordinates path from start point
const generateCoordinatesPath = (startLat: number, startLng: number, numPoints: number = 9) => {
  const path = [];
  // Generate points roughly moving northeast (you can adjust these offsets)
  const latOffset = 0.02; // About 2km per point
  const lngOffset = 0.02;

  for (let i = 0; i < numPoints; i++) {
    path.push({
      lat: startLat + (i * latOffset),
      lng: startLng + (i * lngOffset)
    });
  }
  return path;
};

interface VideoGeotaggingProps {
  onRatingSubmitted?: () => void;
}

const VideoGeotagging: React.FC<VideoGeotaggingProps> = ({ onRatingSubmitted }) => {
  const [selectedVideo, setSelectedVideo] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [currentFrame, setCurrentFrame] = useState<string | null>(null);
  const [currentAnalysis, setCurrentAnalysis] = useState<any>(null);
  const [coordinates, setCoordinates] = useState<Array<{lat: number, lng: number}>>([]);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const processingIntervalRef = useRef<number | null>(null);
  const locationIndexRef = useRef(0);

  useEffect(() => {
    // Get user's current location when component mounts
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const path = generateCoordinatesPath(
            position.coords.latitude,
            position.coords.longitude
          );
          setCoordinates(path);
          toast({
            title: "Location found",
            description: "Generated path from your current location",
          });
        },
        (error) => {
          console.error('Error getting location:', error);
          // Fallback to default coordinates (e.g., Delhi)
          const defaultPath = generateCoordinatesPath(28.7041, 77.1025);
          setCoordinates(defaultPath);
          toast({
            title: "Using default location",
            description: "Couldn't get your location, using default path",
            variant: "destructive",
          });
        }
      );
    } else {
      const defaultPath = generateCoordinatesPath(28.7041, 77.1025);
      setCoordinates(defaultPath);
      toast({
        title: "Location not supported",
        description: "Your browser doesn't support geolocation",
        variant: "destructive",
      });
    }
  }, []);

  const handleVideoUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      const videoURL = URL.createObjectURL(file);
      setSelectedVideo(videoURL);
      setIsPlaying(false);
      setProgress(0);
      setCurrentFrame(null);
      setCurrentAnalysis(null);
      locationIndexRef.current = 0;
      toast({
        title: "Video uploaded",
        description: "Click 'Start Geotagging' to begin processing.",
      });
    }
  };

  const captureVideoFrame = () => {
    if (!videoRef.current || !canvasRef.current) return null;

    const video = videoRef.current;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    
    if (!ctx) return null;

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    
    return canvas.toDataURL('image/jpeg');
  };

  const processVideoFrame = async () => {
    if (!videoRef.current || videoRef.current.paused || coordinates.length === 0) return;

    try {
      // Capture current frame
      const frameDataUrl = captureVideoFrame();
      if (!frameDataUrl) return;
      
      setCurrentFrame(frameDataUrl);
      
      // Analyze the frame
      const analysis = await analyzeRoadImage(frameDataUrl);
      setCurrentAnalysis(analysis);
      
      // Calculate position along the path
      const progress = videoRef.current.currentTime / (videoRef.current.duration || 1);
      const pointIndex = Math.min(Math.floor(progress * (coordinates.length - 1)), coordinates.length - 2);
      locationIndexRef.current = pointIndex;
      
      // Interpolate between two points
      const startPoint = coordinates[pointIndex];
      const endPoint = coordinates[pointIndex + 1];
      const t = (progress * (coordinates.length - 1)) % 1;
      
      const currentLat = startPoint.lat + (endPoint.lat - startPoint.lat) * t;
      const currentLng = startPoint.lng + (endPoint.lng - startPoint.lng) * t;
      
      // Add a small random offset for realistic variation
      const latOffset = (Math.random() - 0.5) * 0.01;
      const lngOffset = (Math.random() - 0.5) * 0.01;
      
      // Save the road rating
      await api.submitRoadRating(
        {
          latitude: currentLat + latOffset,
          longitude: currentLng + lngOffset
        },
        analysis.quality,
        frameDataUrl
      );
      
      if (onRatingSubmitted) {
        onRatingSubmitted();
      }
      
      // Update progress
      setProgress(progress * 100);

    } catch (error) {
      console.error('Error processing video frame:', error);
    }
  };

  const startProcessing = () => {
    if (!videoRef.current || !selectedVideo) {
      toast({
        title: "No video selected",
        description: "Please upload a video first",
        variant: "destructive",
      });
      return;
    }

    setIsProcessing(true);
    setIsPlaying(true);
    videoRef.current.play();
    
    // Process frames every 2 seconds
    if (processingIntervalRef.current) {
      clearInterval(processingIntervalRef.current);
    }
    
    processingIntervalRef.current = window.setInterval(processVideoFrame, 2000);
  };

  const stopProcessing = () => {
    setIsProcessing(false);
    setIsPlaying(false);
    if (videoRef.current) {
      videoRef.current.pause();
    }
    if (processingIntervalRef.current) {
      clearInterval(processingIntervalRef.current);
      processingIntervalRef.current = null;
    }
  };

  useEffect(() => {
    return () => {
      if (processingIntervalRef.current) {
        clearInterval(processingIntervalRef.current);
      }
      if (selectedVideo) {
        URL.revokeObjectURL(selectedVideo);
      }
    };
  }, [selectedVideo]);

  return (
    <div className="space-y-4">
      <Card className="p-4">
        <div className="flex flex-col items-center gap-4">
          <div className="w-full max-w-xl aspect-video bg-muted rounded-lg overflow-hidden relative">
            {selectedVideo ? (
              <video 
                ref={videoRef}
                src={selectedVideo} 
                className="w-full h-full object-contain"
                muted
                onEnded={() => stopProcessing()}
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center">
                <Upload className="h-12 w-12 text-muted-foreground" />
              </div>
            )}
          </div>
          
          <div className="w-full bg-gray-200 rounded-full h-2.5 dark:bg-gray-700">
            <div 
              className="bg-primary h-2.5 rounded-full" 
              style={{ width: `${progress}%` }}
            ></div>
          </div>
          
          <div className="flex gap-4">
            <Button variant="outline" className="relative">
              Upload Video
              <input
                type="file"
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                accept="video/*"
                onChange={handleVideoUpload}
              />
            </Button>
            
            {isProcessing ? (
              <Button 
                variant="destructive"
                onClick={stopProcessing}
                className="flex items-center gap-2"
              >
                <Pause className="h-4 w-4" />
                Stop Geotagging
              </Button>
            ) : (
              <Button 
                onClick={startProcessing} 
                disabled={!selectedVideo}
                className="flex items-center gap-2"
              >
                <Play className="h-4 w-4" />
                Start Geotagging
              </Button>
            )}
          </div>
        </div>
      </Card>

      {currentFrame && currentAnalysis && (
        <div className="grid md:grid-cols-2 gap-4">
          <Card className="p-4">
            <h3 className="text-lg font-semibold mb-2">Current Frame</h3>
            <div className="relative">
              <img 
                src={currentFrame} 
                alt="Current video frame" 
                className="w-full rounded-lg"
              />
              <canvas
                ref={canvasRef}
                className="hidden"
              />
            </div>
          </Card>
          
          <Card className="p-4">
            <h3 className="text-lg font-semibold mb-2">Analysis Results</h3>
            <div className="space-y-2">
              <p>Location: {coordinates[locationIndexRef.current] ? 
                `Lat: ${coordinates[locationIndexRef.current].lat.toFixed(4)}, Lng: ${coordinates[locationIndexRef.current].lng.toFixed(4)}` : 
                'Processing...'}</p>
              <p>Defects found: {currentAnalysis.defectCount}</p>
              <p>Road quality: <span className={cn(
                "font-semibold",
                currentAnalysis.quality === 'good' && "text-green-600",
                currentAnalysis.quality === 'fair' && "text-yellow-600",
                currentAnalysis.quality === 'poor' && "text-red-600"
              )}>
                {currentAnalysis.quality.toUpperCase()}
              </span></p>
              {currentAnalysis.defects.length > 0 && (
                <div>
                  <p className="font-medium">Detected defects:</p>
                  <ul className="list-disc list-inside">
                    {currentAnalysis.defects.map((defect: any, index: number) => (
                      <li key={index}>
                        {defect.type} (confidence: {(defect.confidence * 100).toFixed(1)}%)
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </Card>
        </div>
      )}
    </div>
  );
};

export default VideoGeotagging;
