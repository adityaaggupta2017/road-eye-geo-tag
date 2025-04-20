
import React, { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import GeoTagDemoUpload from '@/components/GeoTagDemoUpload';
import { RoadQualityMap } from '@/components/RoadQualityMap';
import { MapPin, Camera, Map } from 'lucide-react';

const GeoTagDemo = () => {
  return (
    <div className="container mx-auto py-6">
      <Card>
        <CardHeader>
          <CardTitle>Road Quality Geo-Tag Demo</CardTitle>
          <CardDescription>
            Upload a road image and see the quality assessment with geolocation on the map
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="upload" className="w-full">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="upload">
                <Camera className="mr-2 h-4 w-4" />
                Upload Image
              </TabsTrigger>
              <TabsTrigger value="map">
                <Map className="mr-2 h-4 w-4" />
                View Map
              </TabsTrigger>
            </TabsList>
            <TabsContent value="upload">
              <GeoTagDemoUpload />
            </TabsContent>
            <TabsContent value="map">
              <Card>
                <CardHeader>
                  <CardTitle>Road Quality Map</CardTitle>
                  <CardDescription>
                    View road quality assessments on the map
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <RoadQualityMap />
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
};

export default GeoTagDemo;
