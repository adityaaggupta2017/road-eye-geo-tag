import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import Navbar from '@/components/Navbar';
import { Button } from '@/components/ui/button';
import { Camera, MapPin, Download, RefreshCw, CheckCircle, AlertCircle } from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';
import api, { Coordinates, RoadRating } from '@/lib/api';
import { analyzeRoadImage } from '@/lib/yoloModel';
import { MapContainer, TileLayer, Marker, Popup, Polyline } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import { PDFDocument, rgb, StandardFonts, PDFPage } from 'pdf-lib';

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

interface GeoTaggingProps {
  onRatingSubmitted?: () => void;
}

interface SystemStatus {
  camera: boolean;
  location: boolean;
  backend: boolean;
}

const GeoTagging: React.FC<GeoTaggingProps> = ({ onRatingSubmitted }) => {
  const { isAuthenticated, user } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  
  const [isCapturing, setIsCapturing] = useState(false);
  const [hasPermissions, setHasPermissions] = useState(false);
  const [videoStream, setVideoStream] = useState<MediaStream | null>(null);
  const [coordinates, setCoordinates] = useState<Coordinates | null>(null);
  const [locationWatcher, setLocationWatcher] = useState<number | null>(null);
  const [capturedPoints, setCapturedPoints] = useState<RoadRating[]>([]);
  const [isGeneratingReport, setIsGeneratingReport] = useState(false);
  const [isCheckingStatus, setIsCheckingStatus] = useState(false);
  const [systemStatus, setSystemStatus] = useState<SystemStatus>({
    camera: false,
    location: false,
    backend: false
  });
  
  // Store captured coordinates for the report
  const capturedCoordinatesRef = useRef<RoadRating[]>([]);
  
  // Check authentication and redirect if not authenticated
  useEffect(() => {
    if (!isAuthenticated) {
      toast({
        title: "Authentication required",
        description: "Please login to access the geotagging feature",
        variant: "destructive",
      });
      navigate('/login');
    }
  }, [isAuthenticated, navigate, toast]);

  // Check system status
  const checkSystemStatus = useCallback(async () => {
    // Set checking status to show loading indicator
    setIsCheckingStatus(true);
    
    const status: SystemStatus = {
      camera: false,
      location: false,
      backend: false
    };
    
    try {
      // Check camera
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true });
        status.camera = true;
        stream.getTracks().forEach(track => track.stop());
      } catch (error) {
        console.error("Camera check failed:", error);
      }
      
      // Check location with a timeout
      try {
        await new Promise<void>((resolve, reject) => {
          const timeoutId = setTimeout(() => {
            reject(new Error("Location check timed out"));
          }, 8000);
          
          navigator.geolocation.getCurrentPosition(
            () => {
              clearTimeout(timeoutId);
              status.location = true;
              resolve();
            },
            (error) => {
              clearTimeout(timeoutId);
              console.error("Location check failed:", error);
              reject(error);
            },
            { timeout: 5000, maximumAge: 0 }
          );
        });
      } catch (error) {
        console.error("Location check failed:", error);
      }
      
      // Check backend
      try {
        // Use the getRoadRatings method to test backend connectivity
        await api.getRoadRatings();
        status.backend = true;
      } catch (error) {
        console.error("Backend check failed:", error);
      }
      
      setSystemStatus(status);
      
      // Update hasPermissions state if both camera and location are available
      if (status.camera && status.location) {
        setHasPermissions(true);
        toast({
          title: "Permissions verified",
          description: "Camera and location access are available",
        });
      } else {
        setHasPermissions(false);
        toast({
          title: "Permission check failed",
          description: "Camera or location access is not available",
          variant: "destructive",
        });
      }
    } catch (error) {
      console.error("System status check failed:", error);
    } finally {
      // End checking status
      setIsCheckingStatus(false);
    }
    
    return status;
  }, [toast]);

  // Request permissions manually
  const requestPermissionsManually = async () => {
    setIsCheckingStatus(true);
    try {
      // Request camera permission
      try {
        await navigator.mediaDevices.getUserMedia({ video: true });
      } catch (cameraError) {
        console.error("Camera permission error:", cameraError);
        throw new Error("Camera access denied");
      }
      
      // Request location permission
      try {
        await new Promise<void>((resolve, reject) => {
          const timeoutId = setTimeout(() => {
            reject(new Error("Location permission timed out"));
          }, 8000);
          
          navigator.geolocation.getCurrentPosition(
            () => {
              clearTimeout(timeoutId);
              resolve();
            },
            (error) => {
              clearTimeout(timeoutId);
              console.error("Location permission error:", error);
              reject(error);
            },
            { maximumAge: 0, timeout: 5000 }
          );
        });
      } catch (locationError) {
        console.error("Location permission error:", locationError);
        throw new Error("Location access denied");
      }
      
      // If we reach here, both permissions are granted
      setHasPermissions(true);
      toast({
        title: "Permissions granted",
        description: "Camera and location access successfully enabled",
      });
      
      // Check system status
      await checkSystemStatus();
    } catch (error) {
      console.error("Permission error:", error);
      setHasPermissions(false);
      toast({
        title: "Permission error",
        description: error instanceof Error ? error.message : "Failed to get permissions",
        variant: "destructive",
      });
    } finally {
      setIsCheckingStatus(false);
    }
  };

  // Request permissions and cleanup on unmount
  useEffect(() => {
    const requestPermissions = async () => {
      try {
        // Just check if permissions are already granted
        const statusCheck = await checkSystemStatus();
        setHasPermissions(statusCheck.camera && statusCheck.location);
      } catch (error) {
        console.error("Initial permission check failed:", error);
      }
    };
    
    requestPermissions();
    
    // Cleanup function
    return () => {
      if (videoStream) {
        videoStream.getTracks().forEach(track => track.stop());
      }
      
      if (locationWatcher) {
        navigator.geolocation.clearWatch(locationWatcher);
      }
    };
  }, [checkSystemStatus]);

  const startCapturing = async () => {
    try {
      // Check system status first
      const status = await checkSystemStatus();
      if (!status.camera || !status.location) {
        throw new Error("Camera or location services are not available");
      }
      
      // Reset captured points
      capturedCoordinatesRef.current = [];
      setCapturedPoints([]);
      
      // Start camera
      const stream = await navigator.mediaDevices.getUserMedia({ 
        video: { facingMode: "environment" }
      });
      setVideoStream(stream);
      
      // Set capturing state first to ensure video element is rendered
      setIsCapturing(true);
      
      // Small delay to allow React to render the video element
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // Get video element and set stream
      const videoElement = document.getElementById('camera-feed') as HTMLVideoElement;
      if (!videoElement) {
        throw new Error("Video element not found. Please try again.");
      }
      
      videoElement.srcObject = stream;
      
      // Wait for video to be ready
      await new Promise<void>((resolve, reject) => {
        const handleLoadedMetadata = () => {
          videoElement.removeEventListener('loadedmetadata', handleLoadedMetadata);
          videoElement.play()
            .then(() => {
              // Wait a short time to ensure video dimensions are set
              setTimeout(() => {
                if (videoElement.videoWidth === 0 || videoElement.videoHeight === 0) {
                  reject(new Error("Video dimensions are not valid"));
                } else {
                  resolve();
                }
              }, 100);
            })
            .catch(error => {
              reject(error);
            });
        };
        
        videoElement.addEventListener('loadedmetadata', handleLoadedMetadata);
      });
      
      // Start location tracking with better options
      const watchId = navigator.geolocation.watchPosition(
        position => {
          const newCoordinates = {
            latitude: position.coords.latitude,
            longitude: position.coords.longitude
          };
          console.log("Updated coordinates:", newCoordinates);
          setCoordinates(newCoordinates);
          
          // Save coordinates to localStorage for immediate access
          localStorage.setItem('currentCoordinates', JSON.stringify(newCoordinates));
        },
        error => {
          console.error("Error watching position:", error);
          let errorMessage = "Failed to track location";
          
          switch (error.code) {
            case error.PERMISSION_DENIED:
              errorMessage = "Location permission denied. Please enable location access.";
              break;
            case error.POSITION_UNAVAILABLE:
              errorMessage = "Location information unavailable. Please check your GPS.";
              break;
            case error.TIMEOUT:
              errorMessage = "Location request timed out. Please try again.";
              break;
          }
          
          toast({
            title: "Location error",
            description: errorMessage,
            variant: "destructive",
          });
        },
        { 
          enableHighAccuracy: true,
          timeout: 10000, // 10 seconds timeout
          maximumAge: 0
        }
      );
      
      setLocationWatcher(watchId);
      
      // Set up interval for capturing images
      const captureInterval = setInterval(() => {
        captureImage();
      }, 2000); // Every 2 seconds
      
      // Store the interval ID for cleanup
      window.sessionStorage.setItem('captureIntervalId', captureInterval.toString());
      
      toast({
        title: "Geotagging started",
        description: "Capturing an image every 2 seconds",
      });
    } catch (error) {
      console.error("Error starting capture:", error);
      let errorMessage = "Failed to start geotagging";
      
      if (error instanceof Error) {
        if (error.message === "Video dimensions are not valid") {
          errorMessage = "Camera is not ready. Please try again.";
        } else {
          errorMessage = error.message;
        }
      }
      
      toast({
        title: "Start error",
        description: errorMessage,
        variant: "destructive",
      });
      
      // Clean up on error
      if (videoStream) {
        videoStream.getTracks().forEach(track => track.stop());
        setVideoStream(null);
      }
      setIsCapturing(false);
    }
  };

  const stopCapturing = async () => {
    // Stop camera
    if (videoStream) {
      videoStream.getTracks().forEach(track => track.stop());
      setVideoStream(null);
    }
    
    // Stop location tracking
    if (locationWatcher) {
      navigator.geolocation.clearWatch(locationWatcher);
      setLocationWatcher(null);
    }
    
    // Clear capture interval
    const intervalId = window.sessionStorage.getItem('captureIntervalId');
    if (intervalId) {
      clearInterval(parseInt(intervalId));
      window.sessionStorage.removeItem('captureIntervalId');
    }
    
    setIsCapturing(false);
    toast({
      title: "Geotagging stopped",
      description: "Generating your road quality report...",
    });
    
    // Generate report from the collected data
    setIsGeneratingReport(true);
    try {
      // Save the report data for future reference
      const reportId = `road-report-${Date.now()}`;
      const reportData = {
        id: reportId,
        timestamp: new Date().toISOString(),
        username: user?.email || 'anonymous',
        points: capturedCoordinatesRef.current
      };
      
      // Store in localStorage for demo purposes
      localStorage.setItem(`report-${reportId}`, JSON.stringify(reportData));
      
      // Generate the report after a short delay to allow state updates
      setTimeout(async () => {
        setIsGeneratingReport(false);
        toast({
          title: "Report generated",
          description: "Your road quality report is now available",
        });
        
        // Automatically download the PDF report
        if (capturedCoordinatesRef.current.length > 0) {
          await downloadPdfReport();
        } else {
          toast({
            title: "No data collected",
            description: "No road quality data was collected during the session",
            variant: "destructive"
          });
        }
      }, 1500);
    } catch (error) {
      console.error("Error generating report:", error);
      setIsGeneratingReport(false);
      toast({
        title: "Report generation failed",
        description: "Failed to generate road quality report",
        variant: "destructive",
      });
    }
  };

  const captureImage = async () => {
    // Try to get coordinates from localStorage first
    const storedCoords = localStorage.getItem('currentCoordinates');
    const currentCoords = storedCoords ? JSON.parse(storedCoords) : coordinates;
    
    if (!currentCoords) {
      console.warn("No coordinates available, skipping capture");
      return;
    }
    
    const videoElement = document.getElementById('camera-feed') as HTMLVideoElement;
    if (!videoElement) {
      console.error("Video element not found");
      return;
    }

    // Check if video is ready and has valid dimensions
    if (videoElement.videoWidth === 0 || videoElement.videoHeight === 0) {
      console.error("Video dimensions are not valid");
      return;
    }

    const canvas = document.createElement('canvas');
    canvas.width = videoElement.videoWidth;
    canvas.height = videoElement.videoHeight;
    
    const context = canvas.getContext('2d');
    if (!context) {
      console.error("Could not get canvas context");
      return;
    }

    try {
      context.drawImage(videoElement, 0, 0, canvas.width, canvas.height);
      
      // Convert to base64 with quality parameter
      const imageData = canvas.toDataURL('image/jpeg', 0.8);
      
      // Validate the image data
      if (!imageData || imageData === 'data:,') {
        console.error("Invalid image data generated");
        return;
      }
      
      // Analyze road quality using YOLO model
      const analysis = await analyzeRoadImage(imageData);
        
      // Submit to API
      const roadRating = await api.submitRoadRating(currentCoords, analysis.quality, imageData);
      
      // Add to captured points
      capturedCoordinatesRef.current.push(roadRating);
      setCapturedPoints(prev => [...prev, roadRating]);
      
      // Trigger map update
      if (onRatingSubmitted) {
        onRatingSubmitted();
      }
      
      toast({
        title: "Image captured",
        description: `Road quality: ${analysis.quality}`,
      });
    } catch (error) {
      console.error("Error capturing image:", error);
      let errorMessage = "Failed to capture and analyze image";
      
      if (error instanceof Error) {
        if (error.message.includes('Failed to connect to the backend server')) {
          errorMessage = "Backend server is not running. Please start the server on port 5000.";
        } else {
          errorMessage = error.message;
        }
      }
      
      toast({
        title: "Capture error",
        description: errorMessage,
        variant: "destructive",
      });
    }
  };

  // Generate and download PDF report
  const downloadPdfReport = async () => {
    try {
      toast({
        title: "Creating PDF",
        description: "Generating your road quality PDF report...",
      });
      
      // Create a new PDF document
      const pdfDoc = await PDFDocument.create();
      const timesRomanFont = await pdfDoc.embedFont(StandardFonts.TimesRoman);
      const helveticaFont = await pdfDoc.embedFont(StandardFonts.Helvetica);
      const helveticaBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
      
      // Add a page to the document
      const page = pdfDoc.addPage([595.28, 841.89]); // A4 size
      const { width, height } = page.getSize();
      
      // Title
      page.drawText('Road Quality Geotagging Report', {
        x: 50,
        y: height - 50,
        size: 24,
        font: helveticaBold,
        color: rgb(0.1, 0.1, 0.1),
      });
      
      // Date & User
      const dateString = new Date().toLocaleString();
      page.drawText(`Generated on: ${dateString}`, {
        x: 50,
        y: height - 80,
        size: 12,
        font: timesRomanFont,
      });
      
      page.drawText(`User: ${user?.email || 'Anonymous'}`, {
        x: 50,
        y: height - 100,
        size: 12,
        font: timesRomanFont,
      });
      
      // Summary
      page.drawText('Summary:', {
        x: 50,
        y: height - 140,
        size: 18,
        font: helveticaBold,
      });
      
      const totalPoints = capturedPoints.length;
      const goodPoints = capturedPoints.filter(point => point.rating === 'good').length;
      const fairPoints = capturedPoints.filter(point => point.rating === 'fair').length;
      const poorPoints = capturedPoints.filter(point => point.rating === 'poor').length;
      
      page.drawText(`Total samples collected: ${totalPoints}`, {
        x: 50,
        y: height - 170,
        size: 12,
        font: helveticaFont,
      });
      
      if (totalPoints > 0) {
        const goodPercentage = Math.round((goodPoints / totalPoints) * 100);
        const fairPercentage = Math.round((fairPoints / totalPoints) * 100);
        const poorPercentage = Math.round((poorPoints / totalPoints) * 100);
        
        page.drawText(`Road quality distribution:`, {
          x: 50,
          y: height - 190,
          size: 12,
          font: helveticaFont,
        });
        
        page.drawText(`- Good: ${goodPoints} samples (${goodPercentage}%)`, {
          x: 70,
          y: height - 210,
          size: 12,
          font: helveticaFont,
          color: rgb(0.1, 0.6, 0.1),
        });
        
        page.drawText(`- Fair: ${fairPoints} samples (${fairPercentage}%)`, {
          x: 70,
          y: height - 230,
          size: 12,
          font: helveticaFont,
          color: rgb(0.8, 0.6, 0.1),
        });
        
        page.drawText(`- Poor: ${poorPoints} samples (${poorPercentage}%)`, {
          x: 70,
          y: height - 250,
          size: 12,
          font: helveticaFont,
          color: rgb(0.8, 0.1, 0.1),
        });
      }
      
      // Overall assessment
      let overallQuality = 'Unknown';
      let qualityColor = rgb(0.5, 0.5, 0.5);
      
      if (totalPoints > 0) {
        const goodWeight = goodPoints * 3;
        const fairWeight = fairPoints * 2;
        const poorWeight = poorPoints * 1;
        const totalWeight = goodWeight + fairWeight + poorWeight;
        const averageScore = totalWeight / (totalPoints * 3);
        
        if (averageScore > 0.8) {
          overallQuality = 'Good';
          qualityColor = rgb(0.1, 0.6, 0.1);
        } else if (averageScore > 0.5) {
          overallQuality = 'Fair';
          qualityColor = rgb(0.8, 0.6, 0.1);
        } else {
          overallQuality = 'Poor';
          qualityColor = rgb(0.8, 0.1, 0.1);
        }
      }
      
      page.drawText('Overall Road Quality Assessment:', {
        x: 50,
        y: height - 290,
        size: 16,
        font: helveticaBold,
      });
      
      page.drawText(overallQuality, {
        x: 50,
        y: height - 320,
        size: 24,
        font: helveticaBold,
        color: qualityColor,
      });
      
      // Location summary
      let startLocation = 'N/A';
      let endLocation = 'N/A';
      let distance = 'N/A';
      
      if (capturedPoints.length > 0) {
        const first = capturedPoints[0];
        const last = capturedPoints[capturedPoints.length - 1];
        
        startLocation = `${first.coordinates.latitude.toFixed(6)}, ${first.coordinates.longitude.toFixed(6)}`;
        endLocation = `${last.coordinates.latitude.toFixed(6)}, ${last.coordinates.longitude.toFixed(6)}`;
        
        // Calculate approximate distance in meters (using Haversine formula)
        if (capturedPoints.length > 1) {
          let totalDistance = 0;
          for (let i = 1; i < capturedPoints.length; i++) {
            const prev = capturedPoints[i-1];
            const curr = capturedPoints[i];
            
            // Haversine formula
            const R = 6371e3; // Earth radius in meters
            const φ1 = prev.coordinates.latitude * Math.PI/180;
            const φ2 = curr.coordinates.latitude * Math.PI/180;
            const Δφ = (curr.coordinates.latitude - prev.coordinates.latitude) * Math.PI/180;
            const Δλ = (curr.coordinates.longitude - prev.coordinates.longitude) * Math.PI/180;
            
            const a = Math.sin(Δφ/2) * Math.sin(Δφ/2) +
                     Math.cos(φ1) * Math.cos(φ2) *
                     Math.sin(Δλ/2) * Math.sin(Δλ/2);
            const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
            const d = R * c;
            
            totalDistance += d;
          }
          
          // Convert to km if distance is large
          if (totalDistance > 1000) {
            distance = `${(totalDistance / 1000).toFixed(2)} km`;
          } else {
            distance = `${totalDistance.toFixed(0)} m`;
          }
        }
      }
      
      // Data points info
      page.drawText('Location Data:', {
        x: 50,
        y: height - 370,
        size: 16,
        font: helveticaBold,
      });
      
      page.drawText(`Start Location: ${startLocation}`, {
        x: 50,
        y: height - 400,
        size: 12,
        font: helveticaFont,
      });
      
      page.drawText(`End Location: ${endLocation}`, {
        x: 50,
        y: height - 420,
        size: 12,
        font: helveticaFont,
      });
      
      page.drawText(`Approximate Distance: ${distance}`, {
        x: 50,
        y: height - 440,
        size: 12,
        font: helveticaFont,
      });
      
      // Generate a route path visualization in the PDF
      if (capturedPoints.length > 1) {
        drawRoutePath(page, width, height, capturedPoints, height - 470);
      }
      
      // Draw a header for the coordinates table
      if (capturedPoints.length > 0) {
        const tablePage = pdfDoc.addPage([595.28, 841.89]); // A4 size
        
        tablePage.drawText('Detailed Road Quality Data Points:', {
          x: 50,
          y: height - 50,
          size: 16,
          font: helveticaBold,
        });
        
        // Table headers
        tablePage.drawText('No.', {
          x: 50,
          y: height - 80,
          size: 12,
          font: helveticaBold,
        });
        
        tablePage.drawText('Latitude', {
          x: 100,
          y: height - 80,
          size: 12,
          font: helveticaBold,
        });
        
        tablePage.drawText('Longitude', {
          x: 220,
          y: height - 80,
          size: 12,
          font: helveticaBold,
        });
        
        tablePage.drawText('Quality', {
          x: 340,
          y: height - 80,
          size: 12,
          font: helveticaBold,
        });
        
        tablePage.drawText('Timestamp', {
          x: 420,
          y: height - 80,
          size: 12,
          font: helveticaBold,
        });
        
        // Maximum points per page
        const pointsPerPage = 30;
        let currentY = height - 100;
        let currentPage = tablePage;
        
        // Add horizontal separator line
        currentPage.drawLine({
          start: { x: 50, y: height - 85 },
          end: { x: 545, y: height - 85 },
          thickness: 1,
          color: rgb(0.7, 0.7, 0.7),
        });
        
        // Draw table rows
        capturedPoints.forEach((point, index) => {
          if (index > 0 && index % pointsPerPage === 0) {
            // Create a new page for additional points
            currentPage = pdfDoc.addPage([595.28, 841.89]);
            currentY = height - 50;
            
            // Add headers to new page
            currentPage.drawText('Detailed Road Quality Data Points (continued):', {
              x: 50,
              y: currentY,
              size: 16,
              font: helveticaBold,
            });
            
            currentY -= 30;
            
            // Table headers
            currentPage.drawText('No.', {
              x: 50,
              y: currentY,
              size: 12,
              font: helveticaBold,
            });
            
            currentPage.drawText('Latitude', {
              x: 100,
              y: currentY,
              size: 12,
              font: helveticaBold,
            });
            
            currentPage.drawText('Longitude', {
              x: 220,
              y: currentY,
              size: 12,
              font: helveticaBold,
            });
            
            currentPage.drawText('Quality', {
              x: 340,
              y: currentY,
              size: 12,
              font: helveticaBold,
            });
            
            currentPage.drawText('Timestamp', {
              x: 420,
              y: currentY,
              size: 12,
              font: helveticaBold,
            });
            
            // Add horizontal separator line
            currentPage.drawLine({
              start: { x: 50, y: currentY - 5 },
              end: { x: 545, y: currentY - 5 },
              thickness: 1,
              color: rgb(0.7, 0.7, 0.7),
            });
            
            currentY -= 20;
          }
          
          // Draw row
          // Number
          currentPage.drawText(`${index + 1}`, {
            x: 50,
            y: currentY,
            size: 10,
            font: timesRomanFont,
          });
          
          // Latitude
          currentPage.drawText(`${point.coordinates.latitude.toFixed(6)}`, {
            x: 100,
            y: currentY,
            size: 10,
            font: timesRomanFont,
          });
          
          // Longitude
          currentPage.drawText(`${point.coordinates.longitude.toFixed(6)}`, {
            x: 220,
            y: currentY,
            size: 10,
            font: timesRomanFont,
          });
          
          // Quality
          const pointColor = point.rating === 'good' 
            ? rgb(0.1, 0.6, 0.1) 
            : (point.rating === 'fair' ? rgb(0.8, 0.6, 0.1) : rgb(0.8, 0.1, 0.1));
          
          currentPage.drawText(point.rating.charAt(0).toUpperCase() + point.rating.slice(1), {
            x: 340,
            y: currentY,
            size: 10,
            font: timesRomanFont,
            color: pointColor,
          });
          
          // Timestamp
          const date = new Date(point.timestamp);
          const timeString = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
          
          currentPage.drawText(timeString, {
            x: 420,
            y: currentY,
            size: 10,
            font: timesRomanFont,
          });
          
          // Update Y position for next row
          currentY -= 20;
        });
      }
      
      // Save the modified document
      const pdfBytes = await pdfDoc.save();
      
      // Create a Blob and download
      const blob = new Blob([pdfBytes], { type: 'application/pdf' });
      const link = document.createElement('a');
      link.href = window.URL.createObjectURL(blob);
      link.download = `road-quality-report-${Date.now()}.pdf`;
      link.click();
      
      toast({
        title: "PDF downloaded",
        description: "Your road quality report has been downloaded",
      });
    } catch (error) {
      console.error("Error generating PDF:", error);
      toast({
        title: "PDF generation failed",
        description: "Failed to create PDF report",
        variant: "destructive",
      });
    }
  };

  // Generate a route path visualization for the PDF
  const drawRoutePath = (page: PDFPage, width: number, height: number, points: RoadRating[], yPosition: number) => {
    if (points.length < 2) return;
    
    try {
      // Define the drawing area bounds
      const margin = 50;
      const drawingWidth = width - (margin * 2);
      const drawingHeight = 200;
      
      // Draw the border and title
      page.drawRectangle({
        x: margin,
        y: yPosition - drawingHeight,
        width: drawingWidth,
        height: drawingHeight,
        borderColor: rgb(0.7, 0.7, 0.7),
        borderWidth: 1,
      });
      
      page.drawText('Route Visualization:', {
        x: margin + 10,
        y: yPosition + 20,
        size: 14,
        font: helveticaBold,
      });
      
      // Calculate bounds of all points
      let minLat = points[0].coordinates.latitude;
      let maxLat = points[0].coordinates.latitude;
      let minLng = points[0].coordinates.longitude;
      let maxLng = points[0].coordinates.longitude;
      
      points.forEach(point => {
        minLat = Math.min(minLat, point.coordinates.latitude);
        maxLat = Math.max(maxLat, point.coordinates.latitude);
        minLng = Math.min(minLng, point.coordinates.longitude);
        maxLng = Math.max(maxLng, point.coordinates.longitude);
      });
      
      // Add some padding to bounds
      const latPadding = (maxLat - minLat) * 0.1;
      const lngPadding = (maxLng - minLng) * 0.1;
      
      minLat -= latPadding;
      maxLat += latPadding;
      minLng -= lngPadding;
      maxLng += lngPadding;
      
      // Map coordinates to drawing area
      const mapToX = (lng: number) => {
        return margin + ((lng - minLng) / (maxLng - minLng)) * drawingWidth;
      };
      
      const mapToY = (lat: number) => {
        return yPosition - drawingHeight + ((lat - minLat) / (maxLat - minLat)) * (drawingHeight - 40);
      };
      
      // Draw legend
      page.drawText('Good:', {
        x: margin + 10,
        y: yPosition - drawingHeight + 15,
        size: 10,
        font: helveticaFont,
      });
      
      page.drawLine({
        start: { x: margin + 50, y: yPosition - drawingHeight + 20 },
        end: { x: margin + 80, y: yPosition - drawingHeight + 20 },
        thickness: 2,
        color: rgb(0.1, 0.6, 0.1),
      });
      
      page.drawText('Fair:', {
        x: margin + 100,
        y: yPosition - drawingHeight + 15,
        size: 10,
        font: helveticaFont,
      });
      
      page.drawLine({
        start: { x: margin + 140, y: yPosition - drawingHeight + 20 },
        end: { x: margin + 170, y: yPosition - drawingHeight + 20 },
        thickness: 2,
        color: rgb(0.8, 0.6, 0.1),
      });
      
      page.drawText('Poor:', {
        x: margin + 190,
        y: yPosition - drawingHeight + 15,
        size: 10,
        font: helveticaFont,
      });
      
      page.drawLine({
        start: { x: margin + 230, y: yPosition - drawingHeight + 20 },
        end: { x: margin + 260, y: yPosition - drawingHeight + 20 },
        thickness: 2,
        color: rgb(0.8, 0.1, 0.1),
      });
      
      // Draw each segment
      for (let i = 1; i < points.length; i++) {
        const prev = points[i-1];
        const curr = points[i];
        
        const x1 = mapToX(prev.coordinates.longitude);
        const y1 = mapToY(prev.coordinates.latitude);
        const x2 = mapToX(curr.coordinates.longitude);
        const y2 = mapToY(curr.coordinates.latitude);
        
        // Get line color based on road quality
        let lineColor;
        if (curr.rating === 'good') {
          lineColor = rgb(0.1, 0.6, 0.1); // green
        } else if (curr.rating === 'fair') {
          lineColor = rgb(0.8, 0.6, 0.1); // yellow/orange
        } else {
          lineColor = rgb(0.8, 0.1, 0.1); // red
        }
        
        // Draw line segment
        page.drawLine({
          start: { x: x1, y: y1 },
          end: { x: x2, y: y2 },
          thickness: 2,
          color: lineColor,
        });
        
        // Mark the last point with a circle
        if (i === points.length - 1) {
          page.drawCircle({
            x: x2,
            y: y2,
            size: 5,
            color: rgb(0.1, 0.1, 0.8),
          });
        }
      }
      
      // Mark the first point with a circle
      page.drawCircle({
        x: mapToX(points[0].coordinates.longitude),
        y: mapToY(points[0].coordinates.latitude),
        size: 5,
        color: rgb(0.1, 0.8, 0.1),
      });
      
      // Add start and end labels
      page.drawText('Start', {
        x: mapToX(points[0].coordinates.longitude) + 5,
        y: mapToY(points[0].coordinates.latitude) + 5,
        size: 8,
        font: helveticaFont,
      });
      
      page.drawText('End', {
        x: mapToX(points[points.length-1].coordinates.longitude) + 5,
        y: mapToY(points[points.length-1].coordinates.latitude) + 5,
        size: 8,
        font: helveticaFont,
      });
      
    } catch (error) {
      console.error('Error drawing route path:', error);
    }
  };

  // Calculate the quality distribution for the map legend
  const getQualityDistribution = () => {
    const totalPoints = capturedPoints.length;
    if (totalPoints === 0) return { good: 0, fair: 0, poor: 0 };
    
    const goodPoints = capturedPoints.filter(point => point.rating === 'good').length;
    const fairPoints = capturedPoints.filter(point => point.rating === 'fair').length;
    const poorPoints = capturedPoints.filter(point => point.rating === 'poor').length;
    
    return {
      good: Math.round((goodPoints / totalPoints) * 100),
      fair: Math.round((fairPoints / totalPoints) * 100),
      poor: Math.round((poorPoints / totalPoints) * 100)
    };
  };

  // Get color for road quality
  const getQualityColor = (quality: 'good' | 'fair' | 'poor') => {
    switch (quality) {
      case 'good': return '#22c55e'; // green
      case 'fair': return '#eab308'; // yellow
      case 'poor': return '#ef4444'; // red
      default: return '#22c55e';
    }
  };

  if (!isAuthenticated) {
    return null; // Will redirect via useEffect
  }

  return (
    <div className="min-h-screen flex flex-col">
      <Navbar />
      <main className="flex-1 p-4">
        <div className="max-w-4xl mx-auto">
          <h1 className="text-2xl font-bold mb-4 flex items-center gap-2">
            <MapPin className="text-primary" />
            Road Quality Geotagging
          </h1>
          
          <div className="bg-card rounded-lg shadow-md p-4 mb-4">
            <div className="flex justify-between items-center mb-2">
              <h2 className="text-lg font-semibold">System Status</h2>
              <Button 
                variant="ghost" 
                size="sm" 
                className="h-8 w-8 p-0" 
                onClick={checkSystemStatus}
                disabled={isCheckingStatus}
              >
                {isCheckingStatus ? (
                  <RefreshCw className="h-4 w-4 animate-spin" />
                ) : (
                  <RefreshCw className="h-4 w-4" />
                )}
              </Button>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-2 mb-4">
              <div className="flex items-center gap-2 bg-muted p-2 rounded-md">
                <span>{systemStatus.camera ? 
                  <CheckCircle className="h-5 w-5 text-green-500" /> : 
                  <AlertCircle className="h-5 w-5 text-red-500" />
                }</span>
                <span>Camera</span>
              </div>
              <div className="flex items-center gap-2 bg-muted p-2 rounded-md">
                <span>{systemStatus.location ? 
                  <CheckCircle className="h-5 w-5 text-green-500" /> : 
                  <AlertCircle className="h-5 w-5 text-red-500" />
                }</span>
                <span>Location</span>
              </div>
              <div className="flex items-center gap-2 bg-muted p-2 rounded-md">
                <span>{systemStatus.backend ? 
                  <CheckCircle className="h-5 w-5 text-green-500" /> : 
                  <AlertCircle className="h-5 w-5 text-red-500" />
                }</span>
                <span>Backend</span>
              </div>
            </div>
            
            <h2 className="text-lg font-semibold mb-2">How it works</h2>
            <p className="text-muted-foreground mb-4">
              This tool captures images every 2 seconds and automatically rates road quality based on the image.
              Each image is geotagged with your current location coordinates.
            </p>
            
            {hasPermissions ? (
              <div className="flex flex-wrap gap-2">
                {!isCapturing ? (
                  <Button 
                    onClick={startCapturing}
                    className="flex items-center gap-2"
                    disabled={!systemStatus.camera || !systemStatus.location}
                  >
                    <Camera className="h-4 w-4" />
                    Start Geotagging
                  </Button>
                ) : (
                  <Button 
                    onClick={stopCapturing}
                    variant="destructive"
                    className="flex items-center gap-2"
                  >
                    Stop Geotagging
                  </Button>
                )}
                
                {capturedPoints.length > 0 && !isCapturing && (
                  <Button
                    variant="outline"
                    className="flex items-center gap-2"
                    onClick={downloadPdfReport}
                  >
                    <Download className="h-4 w-4" />
                    Download Report
                  </Button>
                )}
              </div>
            ) : (
              <div className="bg-muted p-4 rounded-md">
                <p className="font-medium mb-2">Required Permissions</p>
                <p className="text-sm text-muted-foreground mb-3">
                  Please grant camera and location permissions when prompted to use this feature.
                </p>
                <Button 
                  onClick={requestPermissionsManually}
                  className="w-full"
                  disabled={isCheckingStatus}
                >
                  {isCheckingStatus ? (
                    <>
                      <div className="mr-2 h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent"></div>
                      Checking Permissions...
                    </>
                  ) : (
                    'Enable Permissions'
                  )}
                </Button>
              </div>
            )}
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="relative bg-card rounded-lg shadow-md overflow-hidden">
              {isCapturing ? (
                <video 
                  id="camera-feed" 
                  autoPlay 
                  playsInline
                  muted
                  className="w-full h-[350px] object-cover rounded-md"
                  style={{ transform: 'scaleX(-1)' }} // Mirror the video for better UX
                ></video>
              ) : (
                <div className="bg-muted h-[350px] rounded-lg flex items-center justify-center">
                  <div className="text-center">
                    <Camera className="h-12 w-12 text-muted-foreground mx-auto mb-2" />
                    <p className="text-muted-foreground">
                      Camera preview will appear here when you start geotagging
                    </p>
                  </div>
                </div>
              )}
              
              {coordinates && (
                <div className="absolute bottom-2 left-2 bg-black/70 text-white px-2 py-1 rounded text-xs">
                  {coordinates.latitude.toFixed(6)}, {coordinates.longitude.toFixed(6)}
                </div>
              )}
            </div>
            
            <div className="bg-card rounded-lg shadow-md overflow-hidden">
              {capturedPoints.length > 0 ? (
                <div className="h-[350px] relative">
                  <MapContainer
                    center={[coordinates?.latitude || 20.5937, coordinates?.longitude || 78.9629]}
                    zoom={13}
                    style={{ height: '100%', width: '100%' }}
                  >
                    <TileLayer
                      url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                      attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                    />
                    
                    {capturedPoints.map((point, index) => {
                      const nextPoint = capturedPoints[index + 1];
                      return (
                        <React.Fragment key={point.id}>
                          <Marker 
                            position={[point.coordinates.latitude, point.coordinates.longitude]}
                          >
                            <Popup>
                              <div>
                                <p className="font-semibold">Road Quality: {point.rating}</p>
                                <p className="text-xs">{new Date(point.timestamp).toLocaleString()}</p>
                              </div>
                            </Popup>
                          </Marker>
                          
                          {nextPoint && (
                            <Polyline
                              positions={[
                                [point.coordinates.latitude, point.coordinates.longitude],
                                [nextPoint.coordinates.latitude, nextPoint.coordinates.longitude]
                              ]}
                              pathOptions={{
                                color: getQualityColor(point.rating),
                                weight: 5,
                                opacity: 0.7
                              }}
                            />
                          )}
                        </React.Fragment>
                      );
                    })}
                  </MapContainer>
                  
                  <div className="absolute bottom-2 right-2 bg-white p-2 rounded-md shadow-md z-[1000]">
                    <div className="text-xs font-semibold mb-1">Road Quality</div>
                    <div className="flex items-center gap-1">
                      <div className="w-3 h-3 rounded-full" style={{ backgroundColor: getQualityColor('good') }}></div>
                      <span className="text-xs">Good</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <div className="w-3 h-3 rounded-full" style={{ backgroundColor: getQualityColor('fair') }}></div>
                      <span className="text-xs">Fair</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <div className="w-3 h-3 rounded-full" style={{ backgroundColor: getQualityColor('poor') }}></div>
                      <span className="text-xs">Poor</span>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="h-[350px] bg-muted flex items-center justify-center">
                  <div className="text-center">
                    <MapPin className="h-12 w-12 text-muted-foreground mx-auto mb-2" />
                    <p className="text-muted-foreground">
                      Map will appear here with captured road quality data
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>
          
          {capturedPoints.length > 0 && !isCapturing && (
            <div className="mt-4 bg-card rounded-lg shadow-md p-4">
              <h2 className="text-lg font-semibold mb-2">Road Quality Report</h2>
              
              {isGeneratingReport ? (
                <div className="flex items-center justify-center p-8">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
                </div>
              ) : (
                <>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                    <div className="bg-muted p-3 rounded-md">
                      <p className="text-sm text-muted-foreground">Total Samples</p>
                      <p className="text-2xl font-bold">{capturedPoints.length}</p>
                    </div>
                    
                    {['good', 'fair', 'poor'].map(quality => {
                      const count = capturedPoints.filter(point => point.rating === quality).length;
                      const distribution = getQualityDistribution();
                      const percentage = distribution[quality as keyof typeof distribution];
                      
                      return (
                        <div 
                          key={quality} 
                          className="p-3 rounded-md" 
                          style={{ backgroundColor: `${getQualityColor(quality as 'good' | 'fair' | 'poor')}20` }}
                        >
                          <p className="text-sm text-muted-foreground capitalize">{quality} Quality</p>
                          <div className="flex items-baseline justify-between">
                            <p className="text-2xl font-bold">{count}</p>
                            <p className="text-sm">{percentage}%</p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  
                  <Button
                    className="flex items-center gap-2 w-full"
                    onClick={downloadPdfReport}
                  >
                    <Download className="h-4 w-4" />
                    Download Full Report (PDF)
                  </Button>
                </>
              )}
            </div>
          )}
        </div>
      </main>
    </div>
  );
};

export default GeoTagging;
