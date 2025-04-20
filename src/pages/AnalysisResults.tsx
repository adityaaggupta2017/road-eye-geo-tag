import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import Navbar from '@/components/Navbar';
import { Button } from '@/components/ui/button';
import { MapPin, Download, ChevronLeft } from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';
import axios from 'axios';
import { MapContainer, TileLayer, Polyline, Popup, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';

// Fix Leaflet marker icon issue
import icon from 'leaflet/dist/images/marker-icon.png';
import iconShadow from 'leaflet/dist/images/marker-shadow.png';

let DefaultIcon = L.icon({
  iconUrl: icon,
  shadowUrl: iconShadow,
  iconSize: [25, 41],
  iconAnchor: [12, 41],
});

L.Marker.prototype.options.icon = DefaultIcon;

interface AnalysisResult {
  id: string;
  videoName: string;
  roadName: string;
  roadLocation: string;
  timestamp: string;
  roadSegments: RoadSegment[];
}

interface RoadSegment {
  id: string;
  startCoordinates: {
    latitude: number;
    longitude: number;
  };
  endCoordinates: {
    latitude: number;
    longitude: number;
  };
  condition: 'good' | 'fair' | 'bad';
  confidence: number;
}

const AutoFitBounds = ({ roadSegments }: { roadSegments: RoadSegment[] }) => {
  const map = useMap();
  
  useEffect(() => {
    if (roadSegments.length === 0) return;
    
    const latLngs = roadSegments.flatMap(segment => [
      [segment.startCoordinates.latitude, segment.startCoordinates.longitude],
      [segment.endCoordinates.latitude, segment.endCoordinates.longitude]
    ]);
    
    const bounds = L.latLngBounds(latLngs);
    map.fitBounds(bounds, { padding: [50, 50] });
  }, [roadSegments, map]);
  
  return null;
};

const AnalysisResults: React.FC = () => {
  const { analysisId } = useParams<{ analysisId: string }>();
  const { isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  
  const [analysisResult, setAnalysisResult] = useState<AnalysisResult | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  
  // Check authentication and redirect if not authenticated
  useEffect(() => {
    if (!isAuthenticated) {
      toast({
        title: "Authentication required",
        description: "Please login to access the analysis results",
        variant: "destructive",
      });
      navigate('/login');
    }
  }, [isAuthenticated, navigate, toast]);
  
  // Fetch analysis results
  useEffect(() => {
    const fetchResults = async () => {
      if (!analysisId) return;
      
      try {
        setIsLoading(true);
        const response = await axios.get(`http://localhost:5000/analysis-results/${analysisId}`);
        
        if (response.data.success) {
          setAnalysisResult(response.data.result);
        } else {
          toast({
            title: "Error",
            description: response.data.error || "Failed to load analysis results",
            variant: "destructive",
          });
        }
      } catch (error) {
        toast({
          title: "Error",
          description: "An error occurred while loading analysis results",
          variant: "destructive",
        });
        console.error("Error fetching analysis results:", error);
      } finally {
        setIsLoading(false);
      }
    };
    
    fetchResults();
  }, [analysisId, toast]);
  
  const handleDownloadReport = async () => {
    if (!analysisId) return;
    
    try {
      const response = await axios.get(`http://localhost:5000/download-report/${analysisId}`, {
        responseType: 'blob'
      });
      
      // Create a download link and trigger download
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `road-analysis-report-${analysisId}.pdf`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      
      toast({
        title: "Report downloaded",
        description: "Analysis report has been downloaded successfully",
      });
    } catch (error) {
      toast({
        title: "Download failed",
        description: "Failed to download analysis report",
        variant: "destructive",
      });
      console.error("Error downloading report:", error);
    }
  };
  
  // Map condition to color
  const getConditionColor = (condition: 'good' | 'fair' | 'bad') => {
    switch (condition) {
      case 'good': return '#22c55e'; // green
      case 'fair': return '#eab308'; // yellow
      case 'bad': return '#ef4444'; // red
      default: return '#22c55e';
    }
  };
  
  // Default map center (India)
  const defaultCenter: [number, number] = [20.5937, 78.9629];
  
  if (!isAuthenticated) {
    return null; // Will redirect via useEffect
  }
  
  return (
    <div className="min-h-screen flex flex-col">
      <Navbar />
      <main className="flex-1 p-4">
        <div className="max-w-6xl mx-auto">
          <div className="flex items-center justify-between mb-4">
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <MapPin className="text-primary" />
              Road Analysis Results
            </h1>
            
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                className="flex items-center gap-1"
                onClick={() => navigate('/video-analysis')}
              >
                <ChevronLeft className="h-4 w-4" />
                Back
              </Button>
              
              <Button
                size="sm"
                className="flex items-center gap-1"
                onClick={handleDownloadReport}
                disabled={isLoading || !analysisResult}
              >
                <Download className="h-4 w-4" />
                Download Report
              </Button>
            </div>
          </div>
          
          {isLoading ? (
            <div className="flex items-center justify-center h-64">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
            </div>
          ) : analysisResult ? (
            <div className="space-y-4">
              <div className="bg-card rounded-lg shadow-md p-4">
                <h2 className="text-lg font-semibold mb-2">Analysis Summary</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                  <div className="bg-muted rounded-md p-3">
                    <p className="text-sm text-muted-foreground">Video Name</p>
                    <p className="font-medium">{analysisResult.videoName}</p>
                  </div>
                  
                  <div className="bg-muted rounded-md p-3">
                    <p className="text-sm text-muted-foreground">Road Name</p>
                    <p className="font-medium">{analysisResult.roadName || 'N/A'}</p>
                  </div>
                  
                  <div className="bg-muted rounded-md p-3">
                    <p className="text-sm text-muted-foreground">Location</p>
                    <p className="font-medium">{analysisResult.roadLocation || 'N/A'}</p>
                  </div>
                  
                  <div className="bg-muted rounded-md p-3">
                    <p className="text-sm text-muted-foreground">Analysis Date</p>
                    <p className="font-medium">
                      {new Date(analysisResult.timestamp).toLocaleString()}
                    </p>
                  </div>
                  
                  <div className="bg-muted rounded-md p-3">
                    <p className="text-sm text-muted-foreground">Road Segments</p>
                    <p className="font-medium">{analysisResult.roadSegments.length}</p>
                  </div>
                </div>
              </div>
              
              <div className="bg-card rounded-lg shadow-md p-4">
                <h2 className="text-lg font-semibold mb-2">Road Condition Map</h2>
                <p className="text-sm text-muted-foreground mb-2">
                  Analysis of {analysisResult.roadName} in {analysisResult.roadLocation}
                </p>
                <div className="h-[500px] rounded-md overflow-hidden">
                  <MapContainer
                    center={defaultCenter}
                    zoom={5}
                    style={{ height: '100%', width: '100%' }}
                  >
                    <TileLayer
                      url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                      attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                    />
                    
                    {analysisResult.roadSegments.map((segment) => (
                      <Polyline
                        key={segment.id}
                        positions={[
                          [segment.startCoordinates.latitude, segment.startCoordinates.longitude],
                          [segment.endCoordinates.latitude, segment.endCoordinates.longitude]
                        ]}
                        pathOptions={{
                          color: getConditionColor(segment.condition),
                          weight: 5,
                          opacity: 0.7
                        }}
                      >
                        <Popup>
                          <div className="p-1">
                            <p className="font-medium mb-1">
                              Road Condition: {segment.condition.charAt(0).toUpperCase() + segment.condition.slice(1)}
                            </p>
                            <p className="text-sm text-muted-foreground">
                              Confidence: {(segment.confidence * 100).toFixed(2)}%
                            </p>
                          </div>
                        </Popup>
                      </Polyline>
                    ))}
                    
                    <AutoFitBounds roadSegments={analysisResult.roadSegments} />
                  </MapContainer>
                </div>
                
                <div className="flex items-center justify-center gap-6 mt-4">
                  <div className="flex items-center gap-2">
                    <div className="w-4 h-4 rounded-full" style={{ backgroundColor: getConditionColor('good') }}></div>
                    <span>Good</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-4 h-4 rounded-full" style={{ backgroundColor: getConditionColor('fair') }}></div>
                    <span>Fair</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-4 h-4 rounded-full" style={{ backgroundColor: getConditionColor('bad') }}></div>
                    <span>Bad</span>
                  </div>
                </div>
              </div>
              
              <div className="bg-card rounded-lg shadow-md p-4">
                <h2 className="text-lg font-semibold mb-2">Road Quality Statistics</h2>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {['good', 'fair', 'bad'].map(condition => {
                    const count = analysisResult.roadSegments.filter(
                      segment => segment.condition === condition
                    ).length;
                    
                    const percentage = analysisResult.roadSegments.length > 0
                      ? (count / analysisResult.roadSegments.length * 100).toFixed(1)
                      : '0';
                      
                    return (
                      <div 
                        key={condition} 
                        className="rounded-md p-3"
                        style={{ 
                          backgroundColor: `${getConditionColor(condition as 'good' | 'fair' | 'bad')}20`
                        }}
                      >
                        <p className="text-sm text-muted-foreground capitalize">{condition} Road Segments</p>
                        <div className="flex items-baseline justify-between">
                          <p className="text-2xl font-bold">{count}</p>
                          <p className="text-sm">{percentage}%</p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          ) : (
            <div className="bg-card rounded-lg shadow-md p-8 text-center">
              <p className="text-muted-foreground">No analysis results found</p>
              <Button 
                className="mt-4"
                onClick={() => navigate('/video-analysis')}
              >
                Upload a New Video
              </Button>
            </div>
          )}
        </div>
      </main>
    </div>
  );
};

export default AnalysisResults; 