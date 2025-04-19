
import React from 'react';
import Navbar from '@/components/Navbar';
import MapComponent from '@/components/MapComponent';

const Index = () => {
  return (
    <div className="min-h-screen flex flex-col">
      <Navbar />
      <main className="flex-1">
        <MapComponent />
      </main>
    </div>
  );
};

export default Index;
