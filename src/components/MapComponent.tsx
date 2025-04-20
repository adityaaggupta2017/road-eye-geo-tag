import React, { useEffect, useState } from 'react';
import { MapContainer, TileLayer, CircleMarker, useMap, Popup } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import api, { RoadRating } from '@/lib/api';
import { cn } from '@/lib/utils';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

// Fix Leaflet marker icon issue
import icon from 'leaflet/dist/images/marker-icon.png';
import iconShadow from 'leaflet/dist/images/marker-shadow.png';

let DefaultIcon = L.icon({
  iconUrl: icon,
  shadowUrl: iconShadow,
  iconSize: [25, 41],
  iconAnchor: [12, 41],
});

L.Marker.prototype.options.icon = DefaultIcon;

// Function to calculate a point at a certain distance along a bearing
function calculateDestinationPoint(
  startLat: number,
  startLng: number,
  distance: number,
  bearing: number
) {
  const R = 6371e3; // Earth's radius in meters
  const d = distance;
  const bearingRad = (bearing * Math.PI) / 180; // bearing in radians

  const startLatRad = (startLat * Math.PI) / 180;
  const startLngRad = (startLng * Math.PI) / 180;

  const destLatRad = Math.asin(
    Math.sin(startLatRad) * Math.cos(d / R) +
    Math.cos(startLatRad) * Math.sin(d / R) * Math.cos(bearingRad)
  );

  const destLngRad =
    startLngRad +
    Math.atan2(
      Math.sin(bearingRad) * Math.sin(d / R) * Math.cos(startLatRad),
      Math.cos(d / R) - Math.sin(startLatRad) * Math.sin(destLatRad)
    );

  const destLat = (destLatRad * 180) / Math.PI;
  const destLng = (destLngRad * 180) / Math.PI;

  return { lat: destLat, lng: destLng };
}

// Function to calculate the bearing between two points
function calculateBearing(
  startLat: number,
  startLng: number,
  endLat: number,
  endLng: number
) {
  const startLatRad = (startLat * Math.PI) / 180;
  const startLngRad = (startLng * Math.PI) / 180;
  const endLatRad = (endLat * Math.PI) / 180;
  const endLngRad = (endLng * Math.PI) / 180;

  const y = Math.sin(endLngRad - startLngRad) * Math.cos(endLatRad);
  const x =
    Math.cos(startLatRad) * Math.sin(endLatRad) -
    Math.sin(startLatRad) * Math.cos(endLatRad) * Math.cos(endLngRad - startLngRad);
  
  const bearingRad = Math.atan2(y, x);
  const bearingDeg = (bearingRad * 180) / Math.PI;
  
  return (bearingDeg + 360) % 360;
}

// Component to automatically fit map bounds to all road ratings
const AutoFitBounds = ({ roadRatings }: { roadRatings: RoadRating[] }) => {
  const map = useMap();
  
  useEffect(() => {
    if (roadRatings.length === 0) return;
    
    const bounds = L.latLngBounds(
      roadRatings.map((rating) => [
        rating.coordinates.latitude,
        rating.coordinates.longitude,
      ])
    );
    
    map.fitBounds(bounds, { padding: [50, 50] });
  }, [roadRatings, map]);
  
  return null;
};

const MapComponent = () => {
  const [roadRatings, setRoadRatings] = useState<RoadRating[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchRoadRatings = async () => {
      try {
        const ratings = await api.getRoadRatings();
        setRoadRatings(ratings);
      } catch (error) {
        console.error('Failed to fetch road ratings:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchRoadRatings();
  }, []);

  // Default position (fallback if no data)
  const defaultPosition: [number, number] = [40.7128, -74.0060]; // New York City

  // Get center position from data if available
  const centerPosition = roadRatings.length > 0
    ? [
        roadRatings[0].coordinates.latitude,
        roadRatings[0].coordinates.longitude,
      ] as [number, number]
    : defaultPosition;

  // Map rating to color
  const getRoadColor = (rating: 'good' | 'fair' | 'poor') => {
    switch (rating) {
      case 'good': return '#22c55e'; // green
      case 'fair': return '#eab308'; // yellow
      case 'poor': return '#ef4444'; // red
      default: return '#22c55e';
    }
  };

  return (
    <div className={cn(
      "w-full h-[calc(100vh-64px)]", 
      loading && "flex items-center justify-center"
    )}>
      {loading ? (
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
          <p>Loading road data...</p>
        </div>
      ) : (
        <MapContainer
          center={centerPosition}
          zoom={13}
          style={{ height: '100%', width: '100%' }}
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          
          {roadRatings.map((rating) => (
            <CircleMarker
              key={rating.id}
              center={[rating.coordinates.latitude, rating.coordinates.longitude]}
              radius={6}
              pathOptions={{
                color: getRoadColor(rating.rating),
                fillColor: getRoadColor(rating.rating),
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
                          rating.rating === 'good'
                            ? 'default'
                            : rating.rating === 'fair'
                            ? 'outline'
                            : 'destructive'
                        }
                      >
                        {rating.rating.toUpperCase()}
                      </Badge>
                    </div>
                    {rating.imageUrl && (
                      <img
                        src={rating.imageUrl}
                        alt="Road condition"
                        className="w-full h-32 object-cover rounded-md"
                      />
                    )}
                    <p className="text-sm text-gray-500">
                      {new Date(rating.timestamp).toLocaleString()}
                    </p>
                  </div>
                </Card>
              </Popup>
            </CircleMarker>
          ))}
          
          <AutoFitBounds roadRatings={roadRatings} />
        </MapContainer>
      )}

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

export default MapComponent;
