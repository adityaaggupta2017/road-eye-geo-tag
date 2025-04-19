
import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Camera } from 'lucide-react';
import { analyzeRoadImage } from '@/lib/yoloModel';
import { toast } from '@/components/ui/use-toast';

const DemoImageUpload = () => {
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [analysis, setAnalysis] = useState<{
    defectCount: number;
    quality: 'good' | 'fair' | 'poor';
    defects: Array<{type: string, confidence: number}>;
  } | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  const handleImageUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setSelectedImage(reader.result as string);
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
      
      toast({
        title: "Analysis Complete",
        description: `Detected ${result.defectCount} defects. Road quality: ${result.quality}`,
      });
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

  return (
    <div className="space-y-4">
      <Card className="p-4">
        <div className="flex flex-col items-center gap-4">
          <div className="w-full max-w-xl aspect-video bg-muted rounded-lg overflow-hidden">
            {selectedImage ? (
              <img 
                src={selectedImage} 
                alt="Selected road" 
                className="w-full h-full object-cover"
              />
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
            <p>Road quality: <span className={
              analysis.quality === 'good' ? 'text-green-600' :
              analysis.quality === 'fair' ? 'text-yellow-600' :
              'text-red-600'
            }>
              {analysis.quality.toUpperCase()}
            </span></p>
            {analysis.defects.length > 0 && (
              <div>
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

export default DemoImageUpload;
