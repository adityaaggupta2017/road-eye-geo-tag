
import React, { useEffect, useState } from 'react';
import { MapContainer, TileLayer, Polyline, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import api, { RoadRating } from '@/lib/api';
import { cn } from '@/lib/utils';

// Fix Leaflet marker icon issue
import icon from 'leaflet/dist/images/marker-icon.png';
import iconShadow from 'leaflet/dist/images/marker-shadow.png';

// Set default icon for Leaflet markers
const DefaultIcon = L.icon({
  iconUrl: icon,
  shadowUrl: iconShadow,
  iconSize: [25, 41],
  iconAnchor: [12, 41]
});

L.Marker.prototype.options.icon = DefaultIcon;

// Component to automatically fit map bounds to all road ratings
const AutoFitBounds = ({ roadRatings }: { roadRatings: RoadRating[] }) => {
  const map = useMap();
  
  useEffect(() => {
    if (roadRatings.length === 0) return;
    
    const bounds = L.latLngBounds(roadRatings.map(rating => [
      rating.coordinates.latitude,
      rating.coordinates.longitude
    ]));
    
    map.fitBounds(bounds, { padding: [50, 50] });
  }, [roadRatings, map]);
  
  return null;
};

const SimpleMapComponent: React.FC = () => {
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
    ? [roadRatings[0].coordinates.latitude, roadRatings[0].coordinates.longitude] as [number, number]
    : defaultPosition;

  // Map rating to color
  const getRoadColor = (rating: 'good' | 'fair' | 'poor') => {
    switch(rating) {
      case 'good':
        return '#22c55e'; // green
      case 'fair':
        return '#eab308'; // yellow
      case 'poor':
        return '#ef4444'; // red
      default:
        return '#22c55e';
    }
  };

  return (
    <div className={cn("w-full h-[calc(100vh-64px)]", loading && "flex items-center justify-center")}>
      {loading ? (
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4" />
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
            <Polyline
              key={rating.id}
              positions={[
                [rating.coordinates.latitude - 0.001, rating.coordinates.longitude - 0.001],
                [rating.coordinates.latitude + 0.001, rating.coordinates.longitude + 0.001]
              ]}
              pathOptions={{
                color: getRoadColor(rating.rating),
                weight: 8,
                opacity: 0.7
              }}
            />
          ))}
          
          <AutoFitBounds roadRatings={roadRatings} />
        </MapContainer>
      )}
    </div>
  );
};

export default SimpleMapComponent;
