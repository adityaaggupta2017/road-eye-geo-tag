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

// Use absolute URL consistently to avoid CORS issues
// Try both localhost and direct IP address to avoid network issues
const API_URLS = ['http://localhost:5000', 'http://0.0.0.0:5000'];
let currentUrlIndex = 0;

// Function to get the current API URL
const getApiUrl = () => API_URLS[currentUrlIndex];

// Function to switch to the next API URL if one fails
const switchApiUrl = () => {
  currentUrlIndex = (currentUrlIndex + 1) % API_URLS.length;
  console.log(`Switching to API URL: ${getApiUrl()}`);
  return getApiUrl();
};

// Default axios config for all requests
const defaultRequestConfig = {
  credentials: 'include' as RequestCredentials
};

const api = {
  // Authentication
  login: async (email: string, password: string) => {
    const response = await fetch(`${getApiUrl()}/login`, {
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
    const response = await fetch(`${getApiUrl()}/signup`, {
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
    const response = await fetch(`${getApiUrl()}/road-ratings`, {
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
    
    const response = await fetch(`${getApiUrl()}/road-ratings`, {
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
