
import React from 'react';
import Navbar from '@/components/Navbar';
import SimpleMapComponent from '@/components/SimpleMapComponent';

const Index = () => {
  return (
    <div className="min-h-screen flex flex-col">
      <Navbar />
      <main className="flex-1">
        <SimpleMapComponent />
      </main>
    </div>
  );
};

export default Index;
