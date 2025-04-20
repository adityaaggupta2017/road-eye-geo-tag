import React, { useEffect, useState } from 'react';
import { MapContainer, TileLayer, CircleMarker, Popup, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

interface RoadQualityData {
  id: string;
  latitude: number;
  longitude: number;
  quality: 'good' | 'fair' | 'poor';
  imageUrl: string;
  timestamp: string;
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

export const RoadQualityMap: React.FC = () => {
  const [roadQualityData, setRoadQualityData] = useState<RoadQualityData[]>([]);

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
      }
    };

    loadData();
    window.addEventListener('storage', loadData);
    return () => window.removeEventListener('storage', loadData);
  }, []);

  const centerPosition: [number, number] = [20.5937, 78.9629];

  // Map quality -> hex colour
  const qualityColor = {
    good: '#22c55e',
    fair: '#eab308',
    poor: '#ef4444',
  } as const;

  // Build an array of [lat, lng] for fitting the map
  const allCoords = roadQualityData.map(r => [r.latitude, r.longitude] as [number, number]);

  return (
    <div className="relative">
      <MapContainer center={centerPosition} zoom={5} style={{ height: '600px', width: '100%' }}>
        <TileLayer
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        />

        {roadQualityData.map((point) => (
          <CircleMarker
            key={point.id}
            center={[point.latitude, point.longitude]}
            radius={8}
            pathOptions={{
              color: qualityColor[point.quality],
              fillColor: qualityColor[point.quality],
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
                        point.quality === 'good'
                          ? 'default'
                          : point.quality === 'fair'
                          ? 'outline'
                          : 'destructive'
                      }
                    >
                      {point.quality.toUpperCase()}
                    </Badge>
                  </div>
                  {point.imageUrl && (
                    <img
                      src={point.imageUrl}
                      alt="Road condition"
                      className="w-full h-32 object-cover rounded-md"
                    />
                  )}
                  <p className="text-sm text-gray-500">
                    {new Date(point.timestamp).toLocaleString()}
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
