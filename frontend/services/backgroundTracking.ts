import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

// Task name for background location tracking
export const BACKGROUND_LOCATION_TASK = 'background-location-tracking';

// Storage keys
const STORAGE_KEYS = {
  PENDING_TRIPS: 'pending_trips',
  CURRENT_TRIP: 'current_auto_trip',
  AUTO_TRACKING_ENABLED: 'auto_tracking_enabled',
  LAST_LOCATION: 'last_location',
};

// Speed thresholds (in m/s)
const DRIVING_SPEED_THRESHOLD = 2.2; // ~5 mph - start tracking
const STOPPED_SPEED_THRESHOLD = 0.5; // ~1 mph - consider stopped
const MIN_TRIP_DISTANCE = 0.1; // Minimum 0.1 miles to count as trip
const STOP_TIMEOUT = 120000; // 2 minutes of being stopped = end trip (changed from 5 min)

// Types
interface LocationPoint {
  latitude: number;
  longitude: number;
  speed: number | null;
  timestamp: number;
}

interface PendingTrip {
  id: string;
  start_time: string;
  end_time?: string;
  start_lat: number;
  start_lng: number;
  end_lat?: number;
  end_lng?: number;
  start_address?: string;
  end_address?: string;
  distance: number;
  route: LocationPoint[];
  synced: boolean;
}

// Logging helper
const log = (message: string, data?: any) => {
  const timestamp = new Date().toISOString();
  if (data) {
    console.log(`[BackgroundTracking][${timestamp}]`, message, JSON.stringify(data));
  } else {
    console.log(`[BackgroundTracking][${timestamp}]`, message);
  }
};

// Haversine distance calculation
function haversineDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 3958.8; // Earth's radius in miles
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// Generate unique trip ID
function generateTripId(): string {
  return `auto_trip_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

// Get current auto trip from storage
async function getCurrentTrip(): Promise<PendingTrip | null> {
  try {
    const tripJson = await AsyncStorage.getItem(STORAGE_KEYS.CURRENT_TRIP);
    return tripJson ? JSON.parse(tripJson) : null;
  } catch (e) {
    log('Error getting current trip', e);
    return null;
  }
}

// Save current trip to storage
async function saveCurrentTrip(trip: PendingTrip | null): Promise<void> {
  try {
    if (trip) {
      await AsyncStorage.setItem(STORAGE_KEYS.CURRENT_TRIP, JSON.stringify(trip));
    } else {
      await AsyncStorage.removeItem(STORAGE_KEYS.CURRENT_TRIP);
    }
  } catch (e) {
    log('Error saving current trip', e);
  }
}

// Get all pending (unsynced) trips
export async function getPendingTrips(): Promise<PendingTrip[]> {
  try {
    const tripsJson = await AsyncStorage.getItem(STORAGE_KEYS.PENDING_TRIPS);
    return tripsJson ? JSON.parse(tripsJson) : [];
  } catch (e) {
    log('Error getting pending trips', e);
    return [];
  }
}

// Save pending trips
async function savePendingTrips(trips: PendingTrip[]): Promise<void> {
  try {
    await AsyncStorage.setItem(STORAGE_KEYS.PENDING_TRIPS, JSON.stringify(trips));
  } catch (e) {
    log('Error saving pending trips', e);
  }
}

// Add completed trip to pending list
async function addPendingTrip(trip: PendingTrip): Promise<void> {
  const trips = await getPendingTrips();
  trips.push(trip);
  await savePendingTrips(trips);
  log('Trip added to pending list', { tripId: trip.id, distance: trip.distance });
}

// Start a new auto-detected trip
async function startAutoTrip(location: LocationPoint): Promise<PendingTrip> {
  const trip: PendingTrip = {
    id: generateTripId(),
    start_time: new Date().toISOString(),
    start_lat: location.latitude,
    start_lng: location.longitude,
    distance: 0,
    route: [location],
    synced: false,
  };
  
  await saveCurrentTrip(trip);
  log('Auto trip started', { tripId: trip.id, location });
  return trip;
}

// End current auto trip
async function endAutoTrip(trip: PendingTrip, endLocation: LocationPoint): Promise<void> {
  trip.end_time = new Date().toISOString();
  trip.end_lat = endLocation.latitude;
  trip.end_lng = endLocation.longitude;
  
  // Only save trips with meaningful distance
  if (trip.distance >= MIN_TRIP_DISTANCE) {
    await addPendingTrip(trip);
    log('Auto trip ended and saved', { tripId: trip.id, distance: trip.distance });
  } else {
    log('Auto trip too short, discarding', { tripId: trip.id, distance: trip.distance });
  }
  
  await saveCurrentTrip(null);
}

// Variables for stop detection
let lastMovementTime = Date.now();
let stopCheckTimer: NodeJS.Timeout | null = null;

// Process location update from background task
async function processLocationUpdate(locations: Location.LocationObject[]): Promise<void> {
  if (!locations || locations.length === 0) return;
  
  const location = locations[locations.length - 1]; // Get most recent
  const speed = location.coords.speed || 0;
  const point: LocationPoint = {
    latitude: location.coords.latitude,
    longitude: location.coords.longitude,
    speed: speed,
    timestamp: location.timestamp,
  };
  
  log('Location update', { lat: point.latitude, lng: point.longitude, speed: speed * 2.237 }); // Log speed in mph
  
  let currentTrip = await getCurrentTrip();
  
  // Check if moving at driving speed
  const isDriving = speed >= DRIVING_SPEED_THRESHOLD;
  const isStopped = speed < STOPPED_SPEED_THRESHOLD;
  
  if (isDriving) {
    lastMovementTime = Date.now();
    
    if (!currentTrip) {
      // Start new trip - driving detected!
      currentTrip = await startAutoTrip(point);
    } else {
      // Continue existing trip - add location and update distance
      const lastPoint = currentTrip.route[currentTrip.route.length - 1];
      const segmentDistance = haversineDistance(
        lastPoint.latitude, lastPoint.longitude,
        point.latitude, point.longitude
      );
      
      if (segmentDistance > 0.005) { // Only add if moved > ~26 feet
        currentTrip.distance += segmentDistance;
        currentTrip.route.push(point);
        await saveCurrentTrip(currentTrip);
        log('Trip distance updated', { distance: currentTrip.distance, segment: segmentDistance });
      }
    }
  } else if (currentTrip && isStopped) {
    // Check if stopped for too long
    const stoppedDuration = Date.now() - lastMovementTime;
    
    if (stoppedDuration >= STOP_TIMEOUT) {
      // End trip after being stopped for 5 minutes
      log('Trip ending - stopped for 5 minutes', { tripId: currentTrip.id, distance: currentTrip.distance });
      await endAutoTrip(currentTrip, point);
      log('Auto trip completed and saved - ready for sync');
    } else {
      const remainingTime = Math.round((STOP_TIMEOUT - stoppedDuration) / 1000);
      log('Stopped but waiting...', { stoppedFor: Math.round(stoppedDuration / 1000) + 's', willEndIn: remainingTime + 's' });
    }
  }
}

// Define the background task
TaskManager.defineTask(BACKGROUND_LOCATION_TASK, async ({ data, error }) => {
  if (error) {
    log('Background task error', error);
    return;
  }
  
  if (data) {
    const { locations } = data as { locations: Location.LocationObject[] };
    await processLocationUpdate(locations);
  }
});

// Check if auto-tracking is enabled
export async function isAutoTrackingEnabled(): Promise<boolean> {
  try {
    const enabled = await AsyncStorage.getItem(STORAGE_KEYS.AUTO_TRACKING_ENABLED);
    return enabled === 'true';
  } catch {
    return false;
  }
}

// Enable/disable auto-tracking
export async function setAutoTrackingEnabled(enabled: boolean): Promise<void> {
  try {
    await AsyncStorage.setItem(STORAGE_KEYS.AUTO_TRACKING_ENABLED, enabled.toString());
    
    if (enabled) {
      await startBackgroundTracking();
    } else {
      await stopBackgroundTracking();
    }
  } catch (e) {
    log('Error setting auto-tracking', e);
  }
}

// Request required permissions
export async function requestTrackingPermissions(): Promise<boolean> {
  try {
    // Request foreground permission first
    const { status: foregroundStatus } = await Location.requestForegroundPermissionsAsync();
    if (foregroundStatus !== 'granted') {
      log('Foreground permission denied');
      return false;
    }
    
    // Request background permission (critical for auto-tracking)
    const { status: backgroundStatus } = await Location.requestBackgroundPermissionsAsync();
    if (backgroundStatus !== 'granted') {
      log('Background permission denied');
      return false;
    }
    
    log('All location permissions granted');
    return true;
  } catch (e) {
    log('Permission request error', e);
    return false;
  }
}

// Start background location tracking
export async function startBackgroundTracking(): Promise<boolean> {
  if (Platform.OS === 'web') {
    log('Background tracking not supported on web');
    return false;
  }
  
  try {
    // Check if already running
    const isRunning = await Location.hasStartedLocationUpdatesAsync(BACKGROUND_LOCATION_TASK);
    if (isRunning) {
      log('Background tracking already running');
      return true;
    }
    
    // Ensure permissions
    const hasPermission = await requestTrackingPermissions();
    if (!hasPermission) {
      log('Cannot start - permissions not granted');
      return false;
    }
    
    // Start background location updates
    await Location.startLocationUpdatesAsync(BACKGROUND_LOCATION_TASK, {
      accuracy: Location.Accuracy.High,
      timeInterval: 5000, // Update every 5 seconds
      distanceInterval: 10, // Or every 10 meters
      deferredUpdatesInterval: 5000,
      deferredUpdatesDistance: 10,
      showsBackgroundLocationIndicator: true,
      foregroundService: {
        notificationTitle: 'Mileage Tracker AI',
        notificationBody: 'Auto-tracking your drives in the background',
        notificationColor: '#10B981',
      },
      pausesUpdatesAutomatically: false,
      activityType: Location.ActivityType.AutomotiveNavigation,
    });
    
    await AsyncStorage.setItem(STORAGE_KEYS.AUTO_TRACKING_ENABLED, 'true');
    log('Background tracking started successfully');
    return true;
  } catch (e) {
    log('Failed to start background tracking', e);
    return false;
  }
}

// Stop background location tracking
export async function stopBackgroundTracking(): Promise<void> {
  if (Platform.OS === 'web') return;
  
  try {
    const isRunning = await Location.hasStartedLocationUpdatesAsync(BACKGROUND_LOCATION_TASK);
    if (isRunning) {
      await Location.stopLocationUpdatesAsync(BACKGROUND_LOCATION_TASK);
      log('Background tracking stopped');
    }
    
    // End any active auto trip
    const currentTrip = await getCurrentTrip();
    if (currentTrip) {
      const lastPoint = currentTrip.route[currentTrip.route.length - 1];
      await endAutoTrip(currentTrip, lastPoint);
    }
  } catch (e) {
    log('Error stopping background tracking', e);
  }
}

// Get background tracking status
export async function getTrackingStatus(): Promise<{
  isRunning: boolean;
  currentTrip: PendingTrip | null;
  pendingTripsCount: number;
}> {
  let isRunning = false;
  
  if (Platform.OS !== 'web') {
    try {
      isRunning = await Location.hasStartedLocationUpdatesAsync(BACKGROUND_LOCATION_TASK);
    } catch {
      isRunning = false;
    }
  }
  
  const currentTrip = await getCurrentTrip();
  const pendingTrips = await getPendingTrips();
  
  return {
    isRunning,
    currentTrip,
    pendingTripsCount: pendingTrips.length,
  };
}

// Sync pending trips to server (call this when user logs in)
export async function syncPendingTrips(token: string, createTripFn: (token: string, data: any) => Promise<any>): Promise<number> {
  const pendingTrips = await getPendingTrips();
  
  if (pendingTrips.length === 0) {
    log('No pending trips to sync');
    return 0;
  }
  
  log('Syncing pending trips', { count: pendingTrips.length });
  let syncedCount = 0;
  const remainingTrips: PendingTrip[] = [];
  
  for (const trip of pendingTrips) {
    if (trip.synced) continue;
    
    try {
      // Create trip on server
      await createTripFn(token, {
        start_time: trip.start_time,
        end_time: trip.end_time,
        start_lat: trip.start_lat,
        start_lng: trip.start_lng,
        end_lat: trip.end_lat,
        end_lng: trip.end_lng,
        start_address: trip.start_address || 'Auto-detected start',
        end_address: trip.end_address || 'Auto-detected end',
        distance: trip.distance,
        // Default to 'business' for proper deduction calculation
        classification: 'business',
        notes: 'Auto-tracked trip',
      });
      
      trip.synced = true;
      syncedCount++;
      log('Trip synced successfully', { tripId: trip.id });
    } catch (e) {
      log('Failed to sync trip', { tripId: trip.id, error: e });
      remainingTrips.push(trip);
    }
  }
  
  // Save remaining unsynced trips
  await savePendingTrips(remainingTrips);
  
  log('Sync complete', { synced: syncedCount, remaining: remainingTrips.length });
  return syncedCount;
}

// Clear all pending trips (after successful sync or user request)
export async function clearPendingTrips(): Promise<void> {
  await savePendingTrips([]);
  log('Pending trips cleared');
}

// Initialize auto-tracking on app start
export async function initializeAutoTracking(): Promise<void> {
  if (Platform.OS === 'web') return;
  
  const enabled = await isAutoTrackingEnabled();
  if (enabled) {
    log('Auto-tracking was enabled, restarting...');
    await startBackgroundTracking();
  }
}
