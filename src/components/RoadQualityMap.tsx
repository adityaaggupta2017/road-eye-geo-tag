
import React, { useEffect, useState } from 'react';
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

// Fix for default marker icons in Leaflet with React
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

// Custom marker icons for different road qualities
const createCustomIcon = (quality: string) => {
  const colors = {
    good: '#22c55e',
    fair: '#eab308',
    poor: '#ef4444'
  };

  return L.divIcon({
    className: 'custom-marker',
    html: `<div style="
      background-color: ${colors[quality as keyof typeof colors]};
      width: 12px;
      height: 12px;
      border-radius: 50%;
      border: 2px solid white;
      box-shadow: 0 0 0 2px ${colors[quality as keyof typeof colors]};
    "></div>`,
    iconSize: [16, 16],
    iconAnchor: [8, 8]
  });
};

interface RoadQualityData {
  id: string;
  latitude: number;
  longitude: number;
  quality: 'good' | 'fair' | 'poor';
  imageUrl: string;
  timestamp: string;
}

export const RoadQualityMap: React.FC = () => {
  const [roadQualityData, setRoadQualityData] = useState<RoadQualityData[]>([]);

  useEffect(() => {
    const loadData = () => {
      const data = localStorage.getItem('roadQualityData');
      if (data) {
        setRoadQualityData(JSON.parse(data));
      }
    };

    loadData();
    window.addEventListener('storage', loadData);
    return () => window.removeEventListener('storage', loadData);
  }, []);

  return (
    <div className="relative w-full h-[600px] rounded-lg overflow-hidden">
      <MapContainer
        center={[20.5937, 78.9629]} // Center of India
        zoom={5}
        style={{ height: '100%', width: '100%' }}
      >
        <TileLayer
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        />
        {roadQualityData.map((data) => (
          <Marker
            key={data.id}
            position={[data.latitude, data.longitude]}
            icon={createCustomIcon(data.quality)}
          >
            <Popup>
              <Card className="p-2">
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <span>Road Quality:</span>
                    <Badge
                      variant={
                        data.quality === 'good'
                          ? 'default'
                          : data.quality === 'fair'
                          ? 'outline'
                          : 'destructive'
                      }
                    >
                      {data.quality}
                    </Badge>
                  </div>
                  <img
                    src={data.imageUrl}
                    alt="Road condition"
                    className="w-full h-32 object-cover rounded-md"
                  />
                  <p className="text-sm text-gray-500">
                    {new Date(data.timestamp).toLocaleString()}
                  </p>
                </div>
              </Card>
            </Popup>
          </Marker>
        ))}
      </MapContainer>
      <div className="absolute bottom-4 right-4 bg-white p-2 rounded-lg shadow-lg">
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-green-500"></div>
            <span>Good</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-yellow-500"></div>
            <span>Fair</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-red-500"></div>
            <span>Poor</span>
          </div>
        </div>
      </div>
    </div>
  );
};
