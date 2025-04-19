
import React from 'react';
import Navbar from '@/components/Navbar';
import SimpleMapComponent from '@/components/SimpleMapComponent';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { MapPin, Camera, AlertTriangle } from 'lucide-react';

const Index = () => {
  return (
    <div className="min-h-screen flex flex-col">
      <Navbar />
      <div className="container mx-auto px-4 py-6">
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <MapPin className="text-primary h-5 w-5" />
              Road Quality Monitoring
            </CardTitle>
            <CardDescription>
              Real-time road quality detection using YOLO computer vision
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
              <div className="flex flex-col items-center p-4 bg-green-100 rounded-lg">
                <div className="w-4 h-4 rounded-full bg-green-500 mb-2"></div>
                <p className="font-medium">Good Quality</p>
                <p className="text-sm text-muted-foreground">0-2 defects</p>
              </div>
              <div className="flex flex-col items-center p-4 bg-yellow-100 rounded-lg">
                <div className="w-4 h-4 rounded-full bg-yellow-500 mb-2"></div>
                <p className="font-medium">Fair Quality</p>
                <p className="text-sm text-muted-foreground">3-5 defects</p>
              </div>
              <div className="flex flex-col items-center p-4 bg-red-100 rounded-lg">
                <div className="w-4 h-4 rounded-full bg-red-500 mb-2"></div>
                <p className="font-medium">Poor Quality</p>
                <p className="text-sm text-muted-foreground">6+ defects</p>
              </div>
            </div>
            <div className="flex items-center gap-2 text-sm bg-muted p-3 rounded-lg">
              <Camera className="h-4 w-4 text-primary" />
              <span>Click "Geotagging" in the navbar to start collecting road quality data</span>
            </div>
          </CardContent>
        </Card>
      </div>
      <main className="flex-1">
        <SimpleMapComponent />
      </main>
    </div>
  );
};

export default Index;
