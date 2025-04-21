// API client for interacting with the backend

export interface Coordinates {
  latitude: number;
  longitude: number;
}

export interface RoadRating {
  id: string;
  coordinates: Coordinates;
  rating: 'good' | 'fair' | 'poor';
  timestamp: string;
  userId: string;
  imageUrl?: string;
}

export interface User {
  id: string;
  email: string;
}

// Use relative path in development, absolute path in production
const API_BASE_URL = import.meta.env.DEV ? '/api' : 'http://localhost:5000';

const api = {
  // Authentication
  login: async (email: string, password: string) => {
    const response = await fetch(`${API_BASE_URL}/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ email, password }),
      credentials: 'include', // Include cookies in the request
    });

    if (!response.ok) {
      throw new Error('Invalid credentials');
    }

    const data = await response.json();
    localStorage.setItem('user', JSON.stringify(data.user));
    return data;
  },
  
  signup: async (email: string, password: string) => {
    const response = await fetch(`${API_BASE_URL}/signup`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ email, password }),
      credentials: 'include', // Include cookies in the request
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || 'Failed to sign up');
    }

    const data = await response.json();
    localStorage.setItem('user', JSON.stringify(data.user));
    return data;
  },
  
  logout: async () => {
    localStorage.removeItem('user');
    return { success: true };
  },
  
  getCurrentUser: (): User | null => {
    const userStr = localStorage.getItem('user');
    if (userStr) {
      return JSON.parse(userStr);
    }
    return null;
  },
  
  // Road rating data
  getRoadRatings: async (): Promise<RoadRating[]> => {
    const response = await fetch(`${API_BASE_URL}/road-ratings`, {
      credentials: 'include', // Include cookies in the request
    });
    
    if (!response.ok) {
      throw new Error('Failed to fetch road ratings');
    }
    
    return response.json();
  },
  
  submitRoadRating: async (
    coordinates: Coordinates,
    rating: 'good' | 'fair' | 'poor',
    imageData?: string
  ): Promise<RoadRating> => {
    const user = api.getCurrentUser();
    if (!user) {
      throw new Error('User not authenticated');
    }
    
    const response = await fetch(`${API_BASE_URL}/road-ratings`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        coordinates,
        rating,
        imageData,
        userId: user.id,
      }),
      credentials: 'include', // Include cookies in the request
    });
    
    if (!response.ok) {
      throw new Error('Failed to submit road rating');
    }
    
    return response.json();
  }
};

export default api;
