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

// Define multiple API URLs to try
const API_URLS = ['http://localhost:5000', 'http://127.0.0.1:5000', 'http://0.0.0.0:5000', 'http://[::1]:5000', window.location.origin + '/api'];

// Simplified mock for demonstration when server can't be reached
const mockAnalysisResponse = () => {
  const analysisId = `mock-${Math.random().toString(36).substring(2, 10)}`;
  
  // Add to localStorage to persist the mock data
  const mockData = {
    status: 'completed',
    timestamp: new Date().toISOString(),
    analysisId: analysisId,
    result: {
      id: analysisId,
      videoName: 'demo_video.mp4',
      roadName: 'Demo Road',
      roadLocation: 'Demo City',
      roadSegments: Array(20).fill(null).map((_, i) => ({
        id: `segment-${i}`,
        startCoordinates: { latitude: 28.6139 + (i * 0.001), longitude: 77.2090 + (i * 0.001) },
        endCoordinates: { latitude: 28.6139 + ((i+1) * 0.001), longitude: 77.2090 + ((i+1) * 0.001) },
        condition: ['good', 'fair', 'bad'][Math.floor(Math.random() * 3)],
        confidence: 0.7 + (Math.random() * 0.3)
      }))
    }
  };
  
  localStorage.setItem(`analysis-${analysisId}`, JSON.stringify(mockData));
  return { success: true, analysisId };
};

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
      
      // Try to get status from each URL
      let statusResponse = null;
      let statusError = null;
      
      for (const apiUrl of API_URLS) {
        try {
          console.log(`Checking status with URL: ${apiUrl}/analysis-status/${analysisId}`);
          statusResponse = await axios.get(`${apiUrl}/analysis-status/${analysisId}`, {
            withCredentials: true,
            validateStatus: (status) => true
          });
          
          if (statusResponse.data) {
            console.log(`Got status from ${apiUrl}:`, statusResponse.data);
            break;
          }
        } catch (err) {
          console.error(`Failed to check status at ${apiUrl}:`, err);
          statusError = err;
        }
      }
      
      // If all URLs failed, handle the error
      if (!statusResponse && statusError) {
        throw statusError;
      }
      
      if (statusResponse && statusResponse.data.success) {
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
        console.error("Error checking status:", statusResponse?.data?.error);
        
        // Check if we should retry
        if (pollAttempts < 3) {
          await new Promise(resolve => setTimeout(resolve, 2000));
          checkAnalysisStatus(analysisId);
        } else {
          setIsAnalyzing(false);
          toast({
            title: "Error checking status",
            description: statusResponse?.data?.error || "Failed to check analysis status",
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
      
      console.log("Starting video upload...");
      console.log("Video file:", videoFile.name, "Size:", videoFile.size, "Type:", videoFile.type);
      
      let response;
      let usedMock = false;
      
      try {
        // Simulate upload progress
        const progressInterval = setInterval(() => {
          setUploadProgress(prev => Math.min(prev + 10, 95));
        }, 300);
        
        // Try with axios first
        response = await axios.post('http://localhost:5000/upload-video', formData, {
          headers: {
            'Content-Type': 'multipart/form-data',
          },
          withCredentials: true,
          onUploadProgress: (progressEvent) => {
            if (progressEvent.total) {
              const progress = Math.round((progressEvent.loaded * 100) / progressEvent.total);
              setUploadProgress(progress);
              console.log(`Upload progress: ${progress}%`);
            }
          },
          // Don't reject on HTTP error status
          validateStatus: (status) => true,
          timeout: 10000 // 10 second timeout
        });
        
        clearInterval(progressInterval);
      } catch (axiosError) {
        console.error("Axios upload failed, trying with fetch:", axiosError);
        
        // Try each URL with fetch until one works
        let fetchError = null;
        for (const apiUrl of API_URLS) {
          try {
            console.log(`Trying upload with URL: ${apiUrl}/upload-video`);
            const fetchResponse = await fetch(`${apiUrl}/upload-video`, {
              method: 'POST',
              body: formData,
              credentials: 'include',
            });
            
            response = {
              data: await fetchResponse.json(),
              status: fetchResponse.status
            };
            
            // If we get here, the request succeeded
            console.log(`Successfully connected to ${apiUrl}`);
            fetchError = null;
            break;
          } catch (err) {
            console.error(`Failed to connect to ${apiUrl}:`, err);
            fetchError = err;
          }
        }
        
        // If all URLs failed, use mock response for demonstration
        if (fetchError) {
          console.log("All connection attempts failed, using mock response for demonstration");
          response = { data: mockAnalysisResponse() };
          usedMock = true;
          
          // Simulate a 100% upload progress
          setUploadProgress(100);
        }
      }
      
      console.log("Upload response:", response?.data);
      setIsUploading(false);
      
      if (response?.data?.success) {
        toast({
          title: usedMock ? "Demo Mode" : "Upload successful",
          description: usedMock 
            ? "Using demo mode due to connection issues. Showing simulated analysis."
            : "Video uploaded successfully, analyzing now...",
        });
        
        // Start analysis
        setIsAnalyzing(true);
        setAnalysisProgress(0);
        
        // Begin polling for analysis status or use mock
        const analysisId = response.data.analysisId;
        if (usedMock) {
          // Simulate analysis progress
          let progress = 0;
          const interval = setInterval(() => {
            progress += 5;
            setAnalysisProgress(progress);
            
            if (progress >= 100) {
              clearInterval(interval);
              setIsAnalyzing(false);
              navigate(`/analysis-results/${analysisId}`);
            }
          }, 300);
        } else {
          checkAnalysisStatus(analysisId);
        }
      } else {
        toast({
          title: "Upload failed",
          description: response?.data?.error || "Failed to upload video",
          variant: "destructive",
        });
      }
    } catch (error: any) {
      console.error("Upload error:", error);
      console.error("Error details:", error.response?.data || error.message);
      setIsUploading(false);
      
      toast({
        title: "Error",
        description: error.response?.data?.error || error.message || "An error occurred during upload",
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