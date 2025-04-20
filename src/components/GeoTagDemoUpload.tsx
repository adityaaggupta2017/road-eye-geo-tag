import React, { useState, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Camera, MapPin } from 'lucide-react';
import { analyzeRoadImage } from '@/lib/yoloModel';
import { toast } from '@/components/ui/use-toast';
import { Badge } from '@/components/ui/badge';

interface RoadQualityData {
  id: string;
  latitude: number;
  longitude: number;
  quality: 'good' | 'fair' | 'poor';
  imageUrl: string;
  timestamp: string;
}

const GeoTagDemoUpload = () => {
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [analysis, setAnalysis] = useState<{
    defectCount: number;
    quality: 'good' | 'fair' | 'poor';
    defects: Array<{type: string, confidence: number, bbox: [number, number, number, number]}>;
  } | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [location, setLocation] = useState<{ lat: number; lng: number } | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Generate a random location near the user's current location
  const generateRandomLocation = () => {
    // Default to a location in India if geolocation is not available
    const defaultLat = 20.5937;
    const defaultLng = 78.9629;
    
    // Add some random offset (within ~10km)
    const latOffset = (Math.random() - 0.5) * 0.1;
    const lngOffset = (Math.random() - 0.5) * 0.1;
    
    return {
      lat: defaultLat + latOffset,
      lng: defaultLng + lngOffset
    };
  };

  const handleImageUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setSelectedImage(reader.result as string);
        // Generate a random location when an image is uploaded
        setLocation(generateRandomLocation());
      };
      reader.readAsDataURL(file);
    }
  };

  const analyzeImage = async () => {
    if (!selectedImage) {
      toast({
        title: "No image selected",
        description: "Please select an image first",
        variant: "destructive",
      });
      return;
    }

    setIsAnalyzing(true);
    try {
      const result = await analyzeRoadImage(selectedImage);
      setAnalysis(result);
      
      // Store the analysis result with geolocation
      if (location) {
        const id = Date.now().toString();
        const roadQualityData: RoadQualityData = {
          id,
          latitude: location.lat,
          longitude: location.lng,
          quality: result.quality,
          imageUrl: selectedImage,
          timestamp: new Date().toISOString()
        };
        
        // Get existing data from localStorage
        const existingData = localStorage.getItem('roadQualityData');
        const roadQualityStore: RoadQualityData[] = existingData ? JSON.parse(existingData) : [];
        
        // Add new data
        roadQualityStore.push(roadQualityData);
        
        // Store in localStorage
        localStorage.setItem('roadQualityData', JSON.stringify(roadQualityStore));
        
        toast({
          title: "Analysis Complete",
          description: `Detected ${result.defectCount} defects. Road quality: ${result.quality}`,
        });
      }
    } catch (error) {
      console.error('Analysis error:', error);
      toast({
        title: "Analysis Failed",
        description: "Failed to analyze the image",
        variant: "destructive",
      });
    } finally {
      setIsAnalyzing(false);
    }
  };

  useEffect(() => {
    if (selectedImage && analysis && canvasRef.current) {
      const canvas = canvasRef.current;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const img = new Image();
      img.onload = () => {
        // Set canvas size to match image
        canvas.width = img.width;
        canvas.height = img.height;

        // Clear previous drawings
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        // Draw bounding boxes for each defect
        analysis.defects.forEach((defect) => {
          const [x, y, width, height] = defect.bbox;
          
          // Scale coordinates to match image size
          const scaleX = canvas.width / 640;
          const scaleY = canvas.height / 640;
          
          const scaledX = x * scaleX;
          const scaledY = y * scaleY;
          const scaledWidth = width * scaleX;
          const scaledHeight = height * scaleY;

          // Draw rectangle
          ctx.strokeStyle = 'red';
          ctx.lineWidth = 2;
          ctx.strokeRect(scaledX, scaledY, scaledWidth, scaledHeight);

          // Draw label with background
          const label = `${defect.type} (${(defect.confidence * 100).toFixed(1)}%)`;
          ctx.font = '14px Arial';
          const textWidth = ctx.measureText(label).width;
          
          // Draw label background
          ctx.fillStyle = 'rgba(255, 0, 0, 0.7)';
          ctx.fillRect(scaledX, scaledY - 20, textWidth + 10, 20);
          
          // Draw label text
          ctx.fillStyle = 'white';
          ctx.fillText(label, scaledX + 5, scaledY - 5);
        });
      };
      img.src = selectedImage;
    }
  }, [selectedImage, analysis]);

  return (
    <div className="space-y-4">
      <Card className="p-4">
        <div className="flex flex-col items-center gap-4">
          <div className="w-full max-w-xl aspect-video bg-muted rounded-lg overflow-hidden relative">
            {selectedImage ? (
              <>
                <img 
                  src={selectedImage} 
                  alt="Selected road" 
                  className="w-full h-full object-cover"
                />
                <canvas
                  ref={canvasRef}
                  className="absolute top-0 left-0 w-full h-full"
                  style={{ pointerEvents: 'none' }}
                />
              </>
            ) : (
              <div className="w-full h-full flex items-center justify-center">
                <Camera className="h-12 w-12 text-muted-foreground" />
              </div>
            )}
          </div>
          
          <div className="flex gap-4">
            <Button variant="outline" className="relative">
              Upload Image
              <input
                type="file"
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                accept="image/*"
                onChange={handleImageUpload}
              />
            </Button>
            
            <Button 
              onClick={analyzeImage} 
              disabled={!selectedImage || isAnalyzing}
            >
              {isAnalyzing ? 'Analyzing...' : 'Analyze Road Quality'}
            </Button>
          </div>
        </div>
      </Card>

      {analysis && (
        <Card className="p-4">
          <h3 className="text-lg font-semibold mb-2">Analysis Results</h3>
          <div className="space-y-2">
            <p>Defects found: {analysis.defectCount}</p>
            <p>Road quality: <Badge variant={
              analysis.quality === 'good' ? 'success' :
              analysis.quality === 'fair' ? 'warning' :
              'destructive'
            }>
              {analysis.quality.toUpperCase()}
            </Badge></p>
            
            {location && (
              <div className="mt-4 p-3 bg-muted rounded-md">
                <div className="flex items-center">
                  <MapPin className="h-4 w-4 mr-2" />
                  <span>Location: {location.lat.toFixed(6)}, {location.lng.toFixed(6)}</span>
                </div>
                <p className="text-sm text-muted-foreground mt-1">
                  This location has been saved and will appear on the map.
                </p>
              </div>
            )}
            
            {analysis.defects.length > 0 && (
              <div className="mt-4">
                <p className="font-medium">Detected defects:</p>
                <ul className="list-disc list-inside">
                  {analysis.defects.map((defect, index) => (
                    <li key={index}>
                      {defect.type} (confidence: {(defect.confidence * 100).toFixed(1)}%)
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </Card>
      )}
    </div>
  );
};

export default GeoTagDemoUpload; 