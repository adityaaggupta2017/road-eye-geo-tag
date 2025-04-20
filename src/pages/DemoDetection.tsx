
import React, { useState } from 'react';
import Navbar from '@/components/Navbar';
import { CameraComponent } from '@/components';
import MapComponent from '@/components/MapComponent';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { MapPin } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import VideoGeotagging from '@/components/VideoGeotagging';

const DemoDetection = () => {
  const [refreshMap, setRefreshMap] = useState(0);

  // Callback when a new rating is submitted
  const handleRatingSubmitted = () => {
    // Increment to trigger map refresh
    setRefreshMap(prev => prev + 1);
  };

  return (
    <div className="min-h-screen flex flex-col">
      <Navbar />
      <main className="flex-1 p-4">
        <Card className="mb-4">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <MapPin className="text-primary h-5 w-5" />
              Road Quality Detection Demo
            </CardTitle>
            <CardDescription>
              Test the YOLO-based road defect detection system
            </CardDescription>
          </CardHeader>
        </Card>
        
        <Tabs defaultValue="camera">
          <TabsList className="mb-4">
            <TabsTrigger value="camera">Camera</TabsTrigger>
            <TabsTrigger value="map">Map Visualization</TabsTrigger>
            <TabsTrigger value="video">Demo Video Geotagging</TabsTrigger>
          </TabsList>
          
          <TabsContent value="camera">
            <CameraComponent 
              onRatingSubmitted={handleRatingSubmitted} 
              showImmediateResults={true}
            />
          </TabsContent>
          
          <TabsContent value="map">
            <div className="h-[calc(100vh-250px)]">
              <MapComponent key={refreshMap} />
            </div>
          </TabsContent>
          
          <TabsContent value="video">
            <VideoGeotagging onRatingSubmitted={handleRatingSubmitted} />
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
};

export default DemoDetection;
