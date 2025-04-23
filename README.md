# RoadEye - Road Quality Monitoring and Geotagging

RoadEye is a comprehensive application that allows users to monitor, analyze, and document road quality using geolocation and image analysis. The system captures images of roads while moving, analyzes their quality in real-time, and provides detailed reports with interactive maps.

## Key Features

- **Interactive Map Visualization**: View color-coded road segments based on quality (good, fair, poor)
- **User Authentication**: Secure login system to control access to geotagging features
- **Real-time Geotagging**: Capture images every 2 seconds with automatic location tracking
- **Automatic PDF Reports**: Generate comprehensive reports when you stop geotagging, with detailed statistics and route visualization
- **System Status Monitoring**: Real-time validation of camera, location, and backend services
- **Data Analysis Dashboard**: View quality distribution and statistics
- **Responsive Design**: Works seamlessly on both desktop and mobile devices

## Enhanced Geotagging Features

- **Permission Management**: Easy interface to enable camera and location access
- **System Status Indicators**: Real-time status feedback for camera, location, and backend services
- **Live Map Tracking**: See your route and road quality ratings in real-time while collecting data
- **Quality Distribution Analysis**: Visual breakdown of good, fair, and poor road segments
- **Route Visualization**: Interactive map showing your entire route with color-coded quality ratings
- **Distance Calculation**: Automatic calculation of total distance covered

## PDF Report Generation

Upon stopping a geotagging session, the system automatically generates a comprehensive PDF report including:

- Overall road quality assessment
- Statistical breakdown of quality ratings
- Start and end location coordinates
- Total distance traveled
- Visual route representation with color-coded segments
- Detailed data points table with coordinates, timestamps, and quality ratings

## Technologies Used

### Frontend

- React with TypeScript
- React Router for navigation
- Leaflet.js for interactive maps
- PDF-lib for report generation
- TailwindCSS for styling
- shadcn/ui component library

### Backend

- Node.js simulated backend
- In a production environment, this would be implemented with a robust backend like Express.js, Flask, or Django

## Running the Application

### Prerequisites

- Node.js (v14.0.0 or higher)
- NPM (v6.0.0 or higher)

### Installation

```bash
# Clone the repository
git clone https://github.com/yourusername/road-eye-geo-tag.git
cd road-eye-geo-tag

# Install dependencies
npm install
```

### Running the Application

RoadEye includes both frontend and backend components. You can run them separately or together:

```bash
# Run frontend and backend together (recommended)
npm run start

# Run frontend only
npm run dev

# Run backend only
npm run backend
```

### Building for Production

```bash
# Build for production
npm run build

# Preview production build
npm run preview
```

## How to Use

1. **Launch the Application**: Start the application using the commands above
2. **Login**: Use the credentials provided (test@example.com / password123)
3. **Navigate to Geotagging**: Click on "Geotagging" in the navigation bar
4. **Check System Status**: Ensure all systems (camera, location, backend) are operational
5. **Start Geotagging**: Click "Start Geotagging" and allow permissions when prompted
6. **Collect Data**: Drive or walk along the roads you want to analyze
7. **Stop and Generate Report**: Click "Stop Geotagging" when finished
8. **View and Download Report**: The PDF report will automatically download
9. **Explore the Data**: View your collected data on the interactive map

## Troubleshooting

If you encounter permission issues:

1. Click the "Enable Permissions" button
2. Ensure your browser has permission to access your camera and location
3. Check the system status indicators for real-time feedback
4. Refresh the page if permissions were recently granted

## License

MIT
