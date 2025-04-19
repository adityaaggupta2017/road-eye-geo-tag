
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import CameraComponent from '@/components/CameraComponent';
import { Button } from '@/components/ui/button';
import { MapPin } from 'lucide-react';

const GeoTagging = () => {
  const { isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const [dataUpdated, setDataUpdated] = useState(0);

  // Redirect to login if not authenticated
  React.useEffect(() => {
    if (!isAuthenticated) {
      navigate('/login');
    }
  }, [isAuthenticated, navigate]);

  const handleRatingSubmitted = () => {
    // Increment counter to track data updates
    setDataUpdated(prev => prev + 1);
  };

  if (!isAuthenticated) {
    return null; // Don't render anything while redirecting
  }

  return (
    <div className="min-h-[calc(100vh-64px)] p-4">
      <div className="max-w-3xl mx-auto">
        <div className="mb-6">
          <h1 className="text-2xl font-bold mb-2">Road Geotagging</h1>
          <p className="text-muted-foreground">
            Capture road conditions by taking photos. The system will analyze 
            them and add the data to our road quality map.
          </p>
        </div>

        <div className="bg-white rounded-lg shadow-sm border p-4 mb-6">
          <CameraComponent onRatingSubmitted={handleRatingSubmitted} />
        </div>

        <div className="text-center mt-8">
          <p className="text-sm text-muted-foreground mb-2">
            {dataUpdated > 0 
              ? `${dataUpdated} road points have been captured and analyzed` 
              : 'No data captured yet. Start geotagging to begin.'}
          </p>
          
          <Button
            variant="outline"
            onClick={() => navigate('/')}
            className="mt-2 flex items-center gap-2 mx-auto"
          >
            <MapPin className="h-4 w-4" />
            View Map
          </Button>
        </div>
      </div>
    </div>
  );
};

export default GeoTagging;
