
import React from 'react';
import Navbar from '@/components/Navbar';
import DemoImageUpload from '@/components/DemoImageUpload';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';

const DemoDetection = () => {
  return (
    <div className="min-h-screen flex flex-col">
      <Navbar />
      <main className="flex-1 container mx-auto px-4 py-6">
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Road Quality Demo Detection</CardTitle>
            <CardDescription>
              Upload a road image to test our YOLO-based defect detection model
            </CardDescription>
          </CardHeader>
          <CardContent>
            <DemoImageUpload />
          </CardContent>
        </Card>
      </main>
    </div>
  );
};

export default DemoDetection;
