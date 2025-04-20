
import React, { useState } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { MapPin } from 'lucide-react';

interface LocationInputProps {
  onLocationChange: (location: { lat: number; lng: number }) => void;
  initialLocation: { lat: number; lng: number } | null;
}

const LocationInput: React.FC<LocationInputProps> = ({ onLocationChange, initialLocation }) => {
  const [latitude, setLatitude] = useState<string>(
    initialLocation ? initialLocation.lat.toString() : '20.5937'
  );
  const [longitude, setLongitude] = useState<string>(
    initialLocation ? initialLocation.lng.toString() : '78.9629'
  );

  const handleSetLocation = () => {
    const lat = parseFloat(latitude);
    const lng = parseFloat(longitude);
    
    if (!isNaN(lat) && !isNaN(lng)) {
      onLocationChange({ lat, lng });
    }
  };

  const generateRandomLocation = () => {
    // Default to a location in India
    const defaultLat = 20.5937;
    const defaultLng = 78.9629;
    
    // Add some random offset (within ~10km)
    const latOffset = (Math.random() - 0.5) * 0.1;
    const lngOffset = (Math.random() - 0.5) * 0.1;
    
    const lat = defaultLat + latOffset;
    const lng = defaultLng + lngOffset;
    
    setLatitude(lat.toFixed(6));
    setLongitude(lng.toFixed(6));
    onLocationChange({ lat, lng });
  };

  return (
    <Card className="p-4">
      <div className="space-y-3">
        <h3 className="text-sm font-medium">Set Location Coordinates</h3>
        
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <label htmlFor="latitude" className="text-xs">Latitude</label>
            <Input
              id="latitude"
              value={latitude}
              onChange={(e) => setLatitude(e.target.value)}
              placeholder="Latitude"
            />
          </div>
          
          <div className="space-y-1">
            <label htmlFor="longitude" className="text-xs">Longitude</label>
            <Input
              id="longitude"
              value={longitude}
              onChange={(e) => setLongitude(e.target.value)}
              placeholder="Longitude"
            />
          </div>
        </div>
        
        <div className="flex gap-2">
          <Button 
            variant="outline" 
            size="sm" 
            className="w-full"
            onClick={handleSetLocation}
          >
            <MapPin className="h-4 w-4 mr-1" />
            Set Location
          </Button>
          
          <Button 
            variant="outline" 
            size="sm" 
            className="w-full"
            onClick={generateRandomLocation}
          >
            <MapPin className="h-4 w-4 mr-1" />
            Random Location
          </Button>
        </div>
      </div>
    </Card>
  );
};

export default LocationInput;
