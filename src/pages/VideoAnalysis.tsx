import React, { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import Navbar from '@/components/Navbar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import { useToast } from '@/components/ui/use-toast';
import { MapPin, Upload, Video, Map } from 'lucide-react';
import { Label } from '@/components/ui/label';
import axios from 'axios';

const VideoAnalysis = () => {
  const { isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const videoInputRef = useRef<HTMLInputElement>(null);
  
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [videoPreviewUrl, setVideoPreviewUrl] = useState<string | null>(null);
  const [roadName, setRoadName] = useState('');
  const [roadLocation, setRoadLocation] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisProgress, setAnalysisProgress] = useState(0);
  const [pollAttempts, setPollAttempts] = useState(0);
  
  // Check authentication and redirect if not authenticated
  React.useEffect(() => {
    if (!isAuthenticated) {
      toast({
        title: "Authentication required",
        description: "Please login to access the video analysis feature",
        variant: "destructive",
      });
      navigate('/login');
    }
  }, [isAuthenticated, navigate, toast]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    // Check if the file is a video
    if (!file.type.startsWith('video/')) {
      toast({
        title: "Invalid file type",
        description: "Please upload a video file",
        variant: "destructive",
      });
      return;
    }
    
    setVideoFile(file);
    setVideoPreviewUrl(URL.createObjectURL(file));
  };

  const checkAnalysisStatus = async (analysisId: string) => {
    try {
      const MAX_ATTEMPTS = 30; // 1 minute with 2-second intervals
      
      if (pollAttempts >= MAX_ATTEMPTS) {
        setIsAnalyzing(false);
        toast({
          title: "Analysis timeout",
          description: "Analysis is taking too long. It may still be processing. Please check again later.",
          variant: "destructive",
        });
        return;
      }
      
      setPollAttempts(prev => prev + 1);
      
      const statusResponse = await axios.get(`http://localhost:5000/analysis-status/${analysisId}`);
      
      if (statusResponse.data.success) {
        const status = statusResponse.data.status;
        
        // Update progress
        if (statusResponse.data.progress) {
          setAnalysisProgress(statusResponse.data.progress);
        }
        
        if (status === 'completed') {
          setIsAnalyzing(false);
          
          // Redirect to results page
          navigate(`/analysis-results/${analysisId}`);
          return;
        } else if (status === 'failed') {
          setIsAnalyzing(false);
          toast({
            title: "Analysis failed",
            description: statusResponse.data.error || "Failed to analyze video",
            variant: "destructive",
          });
          return;
        }
        
        // Continue polling
        await new Promise(resolve => setTimeout(resolve, 2000));
        checkAnalysisStatus(analysisId);
      } else {
        // Handle API error
        console.error("Error checking status:", statusResponse.data.error);
        
        // Check if we should retry
        if (pollAttempts < 3) {
          await new Promise(resolve => setTimeout(resolve, 2000));
          checkAnalysisStatus(analysisId);
        } else {
          setIsAnalyzing(false);
          toast({
            title: "Error checking status",
            description: statusResponse.data.error || "Failed to check analysis status",
            variant: "destructive",
          });
        }
      }
    } catch (error) {
      console.error("Error checking analysis status:", error);
      
      // Retry a few times
      if (pollAttempts < 3) {
        await new Promise(resolve => setTimeout(resolve, 2000));
        checkAnalysisStatus(analysisId);
      } else {
        setIsAnalyzing(false);
        toast({
          title: "Error",
          description: "Failed to check analysis status",
          variant: "destructive",
        });
      }
    }
  };

  const handleUpload = async () => {
    if (!videoFile) {
      toast({
        title: "No video selected",
        description: "Please select a video file to analyze",
        variant: "destructive",
      });
      return;
    }
    
    if (!roadName.trim()) {
      toast({
        title: "Road name required",
        description: "Please enter the name of the road in the video",
        variant: "destructive",
      });
      return;
    }
    
    if (!roadLocation.trim()) {
      toast({
        title: "Location required",
        description: "Please enter the location or city of the road",
        variant: "destructive",
      });
      return;
    }
    
    setIsUploading(true);
    setUploadProgress(0);
    setPollAttempts(0);
    
    try {
      // Create form data
      const formData = new FormData();
      formData.append('video', videoFile);
      formData.append('road_name', roadName);
      formData.append('road_location', roadLocation);
      
      // Upload video with progress tracking
      const response = await axios.post('http://localhost:5000/upload-video', formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
        onUploadProgress: (progressEvent) => {
          if (progressEvent.total) {
            const progress = Math.round((progressEvent.loaded * 100) / progressEvent.total);
            setUploadProgress(progress);
          }
        },
      });
      
      setIsUploading(false);
      
      if (response.data.success) {
        toast({
          title: "Upload successful",
          description: "Video uploaded successfully, analyzing now...",
        });
        
        // Start analysis
        setIsAnalyzing(true);
        setAnalysisProgress(0);
        
        // Begin polling for analysis status
        const analysisId = response.data.analysisId;
        checkAnalysisStatus(analysisId);
      } else {
        toast({
          title: "Upload failed",
          description: response.data.error || "Failed to upload video",
          variant: "destructive",
        });
      }
    } catch (error) {
      console.error("Upload error:", error);
      setIsUploading(false);
      
      toast({
        title: "Error",
        description: "An error occurred during upload",
        variant: "destructive",
      });
    }
  };

  return (
    <div className="min-h-screen flex flex-col">
      <Navbar />
      <main className="flex-1 p-4">
        <div className="max-w-4xl mx-auto">
          <h1 className="text-2xl font-bold mb-4 flex items-center gap-2">
            <MapPin className="text-primary" />
            Road Video Analysis
          </h1>
          
          <div className="bg-card rounded-lg shadow-md p-4 mb-4">
            <h2 className="text-lg font-semibold mb-2">How it works</h2>
            <p className="text-muted-foreground mb-4">
              Upload a video of a road in India. Our AI will analyze the video, extract geotags, 
              classify road conditions (good, fair, bad), and mark the road on a map.
            </p>
            
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="road-name" className="text-sm font-medium">
                    Road Name
                  </Label>
                  <Input
                    id="road-name"
                    value={roadName}
                    onChange={(e) => setRoadName(e.target.value)}
                    placeholder="Enter road name (e.g., MG Road, NH-8)"
                    className="mt-1"
                    disabled={isUploading || isAnalyzing}
                  />
                </div>
                
                <div>
                  <Label htmlFor="road-location" className="text-sm font-medium">
                    City/Location
                  </Label>
                  <Input
                    id="road-location"
                    value={roadLocation}
                    onChange={(e) => setRoadLocation(e.target.value)}
                    placeholder="Enter city or area (e.g., Delhi, Mumbai)"
                    className="mt-1"
                    disabled={isUploading || isAnalyzing}
                  />
                </div>
              </div>
              
              <div className="flex items-center gap-2">
                <Button
                  onClick={() => videoInputRef.current?.click()}
                  variant="outline"
                  className="flex items-center gap-2"
                  disabled={isUploading || isAnalyzing}
                >
                  <Video className="h-4 w-4" />
                  Select Video
                </Button>
                
                <Input 
                  ref={videoInputRef}
                  type="file"
                  accept="video/*"
                  className="hidden"
                  onChange={handleFileChange}
                />
                
                {videoFile && (
                  <span className="text-sm">
                    {videoFile.name} ({(videoFile.size / (1024 * 1024)).toFixed(2)} MB)
                  </span>
                )}
              </div>
              
              {videoPreviewUrl && (
                <div className="border rounded-md overflow-hidden">
                  <video
                    src={videoPreviewUrl}
                    controls
                    className="w-full h-auto"
                  />
                </div>
              )}
              
              {(isUploading || isAnalyzing) && (
                <div className="space-y-2">
                  <div className="flex justify-between items-center text-sm">
                    <span>
                      {isUploading
                        ? `Uploading: ${uploadProgress}%`
                        : `Analyzing video: ${analysisProgress}%`}
                    </span>
                  </div>
                  <Progress value={isUploading ? uploadProgress : analysisProgress} />
                </div>
              )}
              
              <div className="flex justify-between items-center">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Map className="h-4 w-4" />
                  <span>Geotags will be fetched for the specified road</span>
                </div>
                
                <Button 
                  onClick={handleUpload}
                  disabled={!videoFile || !roadName.trim() || !roadLocation.trim() || isUploading || isAnalyzing}
                  className="flex items-center gap-2"
                >
                  <Upload className="h-4 w-4" />
                  {isUploading
                    ? "Uploading..."
                    : isAnalyzing
                    ? "Analyzing..."
                    : "Upload & Analyze"}
                </Button>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
};

export default VideoAnalysis; 