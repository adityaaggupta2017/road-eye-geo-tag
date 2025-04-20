import React, { useEffect, useState } from 'react';
import {
  MapContainer,
  TileLayer,
  CircleMarker,
  useMap,
  Popup,
} from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Loader2 } from 'lucide-react';

interface RoadQualityData {
  id: string;
  latitude: number;
  longitude: number;
  quality: 'good' | 'fair' | 'poor';
  imageUrl: string;
  timestamp: string;
  userId?: string;
}

const AutoFitBounds: React.FC<{ points: [number, number][] }> = ({ points }) => {
  const map = useMap();
  useEffect(() => {
    if (points.length) {
      map.fitBounds(points as any, { padding: [40, 40] });
    }
  }, [map, points]);
  return null;
};

export const SimpleMapComponent: React.FC = () => {
  const [roadQualityData, setRoadQualityData] = useState<RoadQualityData[]>([]);
  const [loading, setLoading] = useState(true);

  // Load and watch for data changes
  useEffect(() => {
    const loadData = () => {
      try {
        const data = localStorage.getItem('roadQualityData');
        if (data) {
          const parsed = JSON.parse(data);
          console.log("Loaded map data:", parsed);
          setRoadQualityData(parsed);
        }
      } catch (error) {
        console.error("Error loading road quality data:", error);
      } finally {
        setLoading(false);
      }
    };

    loadData();
    window.addEventListener('storage', loadData);
    return () => window.removeEventListener('storage', loadData);
  }, []);

  // Build an array of [lat, lng] for fitting the map
  const allCoords = roadQualityData.map(r => [r.latitude, r.longitude] as [number, number]);

  // Map quality to color
  const getRoadColor = (quality: RoadQualityData['quality']) =>
    quality === 'good' ? '#22c55e' : quality === 'fair' ? '#eab308' : '#ef4444';

  // Default center position (India)
  const centerPosition: [number, number] = [20.5937, 78.9629];

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[600px]">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  return (
    <div className="relative">
      <MapContainer
        center={centerPosition}
        zoom={5}
        style={{ height: '600px', width: '100%' }}
      >
        <TileLayer
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        />

        {roadQualityData.map((data) => (
          <CircleMarker
            key={data.id}
            center={[data.latitude, data.longitude]}
            radius={6}
            pathOptions={{
              color: getRoadColor(data.quality),
              fillColor: getRoadColor(data.quality),
              fillOpacity: 0.8,
            }}
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
                      {data.quality.toUpperCase()}
                    </Badge>
                  </div>
                  {data.imageUrl && (
                    <img
                      src={data.imageUrl}
                      alt="Road condition"
                      className="w-full h-32 object-cover rounded-md"
                    />
                  )}
                  <p className="text-sm text-gray-500">
                    {new Date(data.timestamp).toLocaleString()}
                  </p>
                </div>
              </Card>
            </Popup>
          </CircleMarker>
        ))}

        <AutoFitBounds points={allCoords} />
      </MapContainer>

      {/* Legend */}
      <div className="absolute bottom-4 right-4 bg-white p-2 rounded-lg shadow-lg z-[1000]">
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-[#22c55e]"></div>
            <span>Good</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-[#eab308]"></div>
            <span>Fair</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-[#ef4444]"></div>
            <span>Poor</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SimpleMapComponent;
