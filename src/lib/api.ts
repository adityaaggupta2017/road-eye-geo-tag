
// API client for interacting with the backend

interface Coordinates {
  latitude: number;
  longitude: number;
}

interface RoadRating {
  id: string;
  coordinates: Coordinates;
  rating: 'good' | 'fair' | 'poor';
  timestamp: string;
  userId: string;
}

// Simulated API functions since we don't have a real backend yet
// In production, these would make actual API calls to the Golang backend

// Mock data for development
const mockRoadData: RoadRating[] = [
  {
    id: '1',
    coordinates: { latitude: 40.7128, longitude: -74.0060 },
    rating: 'good',
    timestamp: new Date().toISOString(),
    userId: 'user1',
  },
  {
    id: '2',
    coordinates: { latitude: 40.7138, longitude: -74.0070 },
    rating: 'fair',
    timestamp: new Date().toISOString(),
    userId: 'user1',
  },
  {
    id: '3',
    coordinates: { latitude: 40.7148, longitude: -74.0080 },
    rating: 'poor',
    timestamp: new Date().toISOString(),
    userId: 'user1',
  },
];

// Mock user data
const mockUsers = [
  { id: 'user1', email: 'test@example.com', password: 'password123' },
];

// This will be replaced with real API calls
const api = {
  // Authentication
  login: async (email: string, password: string) => {
    // Simulate API delay
    await new Promise((resolve) => setTimeout(resolve, 500));
    
    const user = mockUsers.find(
      (u) => u.email === email && u.password === password
    );
    
    if (user) {
      localStorage.setItem('user', JSON.stringify({ id: user.id, email: user.email }));
      return { success: true, user: { id: user.id, email: user.email } };
    }
    
    throw new Error('Invalid credentials');
  },
  
  logout: async () => {
    await new Promise((resolve) => setTimeout(resolve, 300));
    localStorage.removeItem('user');
    return { success: true };
  },
  
  getCurrentUser: () => {
    const userStr = localStorage.getItem('user');
    if (userStr) {
      return JSON.parse(userStr);
    }
    return null;
  },
  
  // Road rating data
  getRoadRatings: async (): Promise<RoadRating[]> => {
    // Simulate API delay
    await new Promise((resolve) => setTimeout(resolve, 800));
    return mockRoadData;
  },
  
  submitRoadRating: async (
    coordinates: Coordinates,
    rating: 'good' | 'fair' | 'poor',
    imageData?: string
  ): Promise<RoadRating> => {
    // Simulate API delay
    await new Promise((resolve) => setTimeout(resolve, 600));
    
    const user = api.getCurrentUser();
    if (!user) {
      throw new Error('User not authenticated');
    }
    
    const newRating: RoadRating = {
      id: Math.random().toString(36).substring(2, 9),
      coordinates,
      rating,
      timestamp: new Date().toISOString(),
      userId: user.id,
    };
    
    // In a real application, we would send the imageData to the server for analysis
    // For now, we'll just add the new rating to our mock data
    mockRoadData.push(newRating);
    
    return newRating;
  }
};

export default api;
export type { Coordinates, RoadRating };
