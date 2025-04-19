
# RoadEye - Road Quality Monitoring

RoadEye is a web application that allows users to monitor and map road quality using geolocation and image analysis. The app captures images of roads, analyzes their quality, and displays the results on an interactive map.

## Features

- **Interactive Map Visualization**: View color-coded road segments based on quality (good, fair, poor)
- **User Authentication**: Secure login system to control access to geotagging features
- **Geotagging Mode**: Capture images every 2 seconds with automatic location tracking
- **Real-time Quality Analysis**: Simulated road quality analysis (would be replaced with a YOLO model in production)
- **Responsive Design**: Works on both desktop and mobile devices

## Technologies Used

### Frontend
- React with TypeScript
- React Router for navigation
- Leaflet.js for interactive maps
- TailwindCSS for styling
- shadcn/ui component library

### Backend (Simulated)
- In a production environment, this would be implemented with Golang

## How to Use

1. **View the Map**: The landing page shows all the road quality data
2. **Login**: Use the credentials provided (test@example.com / password123)
3. **Start Geotagging**: After login, click "Start Geotagging" in the navbar
4. **Allow Permissions**: Grant camera and location access when prompted
5. **Capture Data**: The app will automatically capture images every 2 seconds
6. **View Results**: Return to the map to see the newly added road segments

## Project Setup

```bash
# Install dependencies
npm install

# Start development server
npm run dev
```

## Production Deployment

```bash
# Build for production
npm run build

# Serve production build
npm run serve
```

## Notes for Implementation

- In a production environment, you would need to:
  - Implement a real Golang backend with proper API endpoints
  - Set up a database to store road ratings and user information
  - Integrate a YOLO model for actual road quality analysis
  - Configure proper authentication with secure token handling
