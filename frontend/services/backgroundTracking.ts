import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import * as OfflineService from './offlineService';

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
// 5 mph = 2.2352 m/s (exact conversion)
const DRIVING_SPEED_THRESHOLD = 2.2352; // 5 mph - start tracking
const STOPPED_SPEED_THRESHOLD = 0.5; // ~1 mph - consider stopped
const MIN_TRIP_DISTANCE = 0.1; // Minimum 0.1 miles to count as trip
const AUTO_STOP_TIMEOUT = 300000; // 5 minutes of being stopped = end auto trip
const MANUAL_STOP_TIMEOUT = 600000; // 10 minutes of being stopped = end manual trip
const AUTO_START_DELAY = 15000; // 15 seconds delay before auto-tracking starts a trip

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

// Haversine distance calculation (with dynamic Earth radius)
function haversineDistance(lat1: number, lon1: number, lat2: number, lon2: number, R: number = 3958.8): number {
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

// Storage key for auth token (to send trips directly to server)
// Must match AuthContext's TOKEN_KEY
const AUTH_TOKEN_KEY = '@multimile_jwt_token';

// Get auth token from storage
async function getAuthToken(): Promise<string | null> {
  try {
    return await AsyncStorage.getItem(AUTH_TOKEN_KEY);
  } catch (e) {
    log('Error getting auth token', e);
    return null;
  }
}

// API function to create trip directly (will be set from dashboard)
let createTripDirectFn: ((token: string, data: any) => Promise<any>) | null = null;
let dashboardRefreshFn: (() => Promise<void>) | null = null;

export function setCreateTripFunction(fn: (token: string, data: any) => Promise<any>): void {
  createTripDirectFn = fn;
  log('Create trip function set');
}

export function setDashboardRefreshFunction(fn: () => Promise<void>): void {
  dashboardRefreshFn = fn;
  log('Dashboard refresh function set');
}

// End current auto trip and send directly to server
async function endAutoTrip(trip: PendingTrip, endLocation: LocationPoint): Promise<void> {
  trip.end_time = new Date().toISOString();
  trip.end_lat = endLocation.latitude;
  trip.end_lng = endLocation.longitude;
  
  // Set the auto trip ended cooldown timestamp in AsyncStorage
  try {
    await AsyncStorage.setItem('last_auto_trip_ended_time', Date.now().toString());
    log('Set last_auto_trip_ended_time for 3-minute cooldown');
  } catch (e) {
    log('Error saving last_auto_trip_ended_time', e);
  }
  
  // Only process trips with meaningful distance
  if (trip.distance >= MIN_TRIP_DISTANCE) {
    log('Auto trip ended', { tripId: trip.id, distance: trip.distance });
    
    // Try to send directly to server
    const token = await getAuthToken();
    if (token && createTripDirectFn) {
      try {
        await createTripDirectFn(token, {
          start_time: trip.start_time,
          end_time: trip.end_time,
          start_lat: trip.start_lat,
          start_lng: trip.start_lng,
          end_lat: trip.end_lat,
          end_lng: trip.end_lng,
          start_address: trip.start_address ? `Auto - detect start, ${trip.start_address}` : 'Auto - detect start, Unknown Location',
          end_address: trip.end_address ? `Auto - detect end, ${trip.end_address}` : 'Auto - detect end, Unknown Location',
          distance: trip.distance,
          classification: 'business',
          notes: 'Auto-tracked trip',
        });
        log('Auto trip sent directly to server - triggering dashboard refresh', { tripId: trip.id });
        
        // Trigger dashboard refresh to update stats
        if (dashboardRefreshFn) {
          setTimeout(async () => {
            try {
              await dashboardRefreshFn!();
              log('Dashboard refreshed after auto-trip');
            } catch (e) {
              log('Dashboard refresh error', e);
            }
          }, 500); // Small delay to ensure server processed the trip
        }
      } catch (e) {
        log('Failed to send to server, saving to pending', { tripId: trip.id, error: e });
        await addPendingTrip(trip);
      }
    } else {
      // No token or function - save to pending for later sync
      await addPendingTrip(trip);
      log('No auth available, saved to pending', { tripId: trip.id });
    }
  } else {
    log('Auto trip too short, discarding', { tripId: trip.id, distance: trip.distance });
  }
  
  await saveCurrentTrip(null);
}

// Process location update from background task
// Process location update from background task
export async function processLocationUpdate(locations: Location.LocationObject[]): Promise<void> {
  if (!locations || locations.length === 0) return;
  
  // Load State from storage ONCE at the start of the batch
  const masterEnabled = await AsyncStorage.getItem('master_tracking_enabled');
  if (masterEnabled === 'false') {
    log('processLocationUpdate blocked: master tracking is disabled');
    return;
  }

  const autoEnabled = await AsyncStorage.getItem(STORAGE_KEYS.AUTO_TRACKING_ENABLED);
  const autoTrackingEnabled = autoEnabled === 'true';
  
  let currentAutoTrip = await getCurrentTrip();
  const manualTripJson = await AsyncStorage.getItem('current_active_trip');
  let currentManualTrip = manualTripJson ? JSON.parse(manualTripJson) : null;
  
  const subscriptionTier = await AsyncStorage.getItem('subscription_tier');
  if (subscriptionTier === 'free') {
    const cachedStatsStr = await AsyncStorage.getItem('cached_dashboard_stats');
    if (cachedStatsStr) {
      try {
        const cachedStats = JSON.parse(cachedStatsStr);
        if (cachedStats && (cachedStats.monthly_trips >= 40 || cachedStats.monthly_miles >= 200.0)) {
          if (!currentAutoTrip && !currentManualTrip) {
            log('processLocationUpdate blocked: free user reached 40 trips or 200 miles limit');
            return;
          }
        }
      } catch (e) {
        log('Error parsing cached stats', e);
      }
    }
  }
  
  let drivingDetectedTime: number | null = null;
  try {
    const drivingTimeStr = await AsyncStorage.getItem('auto_driving_detected_time');
    if (drivingTimeStr) drivingDetectedTime = parseInt(drivingTimeStr, 10);
  } catch {}
  
  let lastMovementTime = Date.now();
  try {
    const lastMoveStr = await AsyncStorage.getItem('auto_last_movement_time');
    if (lastMoveStr) lastMovementTime = parseInt(lastMoveStr, 10);
  } catch {}
  
  let lastLocationPoint: LocationPoint | null = null;
  try {
    const lastLocJson = await AsyncStorage.getItem(STORAGE_KEYS.LAST_LOCATION);
    if (lastLocJson) lastLocationPoint = JSON.parse(lastLocJson);
  } catch {}

  let lastAutoTripEndedTime = 0;
  try {
    const endedTimeStr = await AsyncStorage.getItem('last_auto_trip_ended_time');
    if (endedTimeStr) lastAutoTripEndedTime = parseInt(endedTimeStr, 10);
  } catch {}
  
  // Track if we need to write state back to storage
  let currentAutoTripChanged = false;
  let currentManualTripChanged = false;
  let drivingDetectedTimeChanged = false;
  let lastMovementTimeChanged = false;
  let lastLocationPointChanged = false;

  let country = 'US';
  try {
    const storedCountry = await AsyncStorage.getItem('tax_country');
    if (storedCountry) country = storedCountry;
  } catch {}
  const isKm = country === 'CAN' || country === 'AUS';
  const trackingR = isKm ? 6371.0 : 3958.8;
  const threshold = isKm ? 0.0032 : 0.002; // ~10 feet in miles vs km

  for (const location of locations) {
    // Ignore duplicate or out-of-order locations to prevent double-processing or race condition pings
    if (lastLocationPoint && location.timestamp <= lastLocationPoint.timestamp) {
      continue;
    }

    let speed = location.coords.speed || 0;
    if (speed < 0) speed = 0; // Fix negative speed values from GPS
    
    const point: LocationPoint = {
      latitude: location.coords.latitude,
      longitude: location.coords.longitude,
      speed: speed,
      timestamp: location.timestamp,
    };
    
    // Calculate fallback speed if coords.speed reports 0 or null (common during starting movement)
    if ((speed === 0 || speed === null) && lastLocationPoint) {
      const timeDiffSeconds = (point.timestamp - lastLocationPoint.timestamp) / 1000;
      if (timeDiffSeconds > 0 && timeDiffSeconds < 60) { // Only calculate if updates are reasonably continuous (under 1 min)
        const distMiles = haversineDistance(
          lastLocationPoint.latitude, lastLocationPoint.longitude,
          point.latitude, point.longitude
        );
        const distMeters = distMiles * 1609.34;
        speed = distMeters / timeDiffSeconds; // meters per second
        point.speed = speed;
      }
    }
    
    lastLocationPoint = point;
    lastLocationPointChanged = true;
    
    // Log location update inside the processing loop
    log('Processing batch location point', { lat: point.latitude, lng: point.longitude, speed: speed * 2.237 });
    
    // Check if moving at driving speed
    const isDriving = speed >= DRIVING_SPEED_THRESHOLD;
    const isStopped = speed < STOPPED_SPEED_THRESHOLD;
    
    if (isDriving) {
      lastMovementTime = point.timestamp;
      lastMovementTimeChanged = true;
    }
    
    // Handle Manual Trips entirely first
    if (currentManualTrip && currentManualTrip.is_active) {
      if (isDriving) {
        // Deep safety check for route array
        if (currentManualTrip.route && currentManualTrip.route.length > 0) {
          const lastPoint = currentManualTrip.route[currentManualTrip.route.length - 1];
          const segmentDistance = haversineDistance(
            lastPoint.latitude, lastPoint.longitude,
            point.latitude, point.longitude,
            trackingR
          );
          
          if (segmentDistance > threshold) {
            currentManualTrip.distance += segmentDistance;
            currentManualTrip.route.push(point);
            currentManualTrip.current_lat = point.latitude;
            currentManualTrip.current_lng = point.longitude;
            currentManualTripChanged = true;
          }
        } else {
          // If route was somehow empty/undefined, initialize it safely
          currentManualTrip.route = [point];
          currentManualTrip.current_lat = point.latitude;
          currentManualTrip.current_lng = point.longitude;
          currentManualTripChanged = true;
        }
      } else if (isStopped) {
        const stoppedDuration = point.timestamp - lastMovementTime;
        if (stoppedDuration >= MANUAL_STOP_TIMEOUT) {
          log('Manual trip ending automatically - stopped for 10 minutes');
          await OfflineService.endTrip('business');
          currentManualTrip = null;
          currentManualTripChanged = true;
          if (dashboardRefreshFn) {
            await dashboardRefreshFn();
          }
        }
      }
      continue; // Bypass auto-tracking completely while manual trip is active
    }
    
    // Skip auto-tracking if disabled
    if (!autoTrackingEnabled) {
      continue;
    }
    
    if (isDriving) {
      if (!currentAutoTrip) {
        // Cooldown check: 3 minutes (180000 ms)
        const timeSinceLastEnd = point.timestamp - lastAutoTripEndedTime;
        if (timeSinceLastEnd < 180000) {
          log('Driving detected but auto-trip start blocked due to 3-minute cooldown', { timeSinceLastEndMs: timeSinceLastEnd });
          continue;
        }

        if (drivingDetectedTime === null) {
          drivingDetectedTime = point.timestamp;
          drivingDetectedTimeChanged = true;
          log('Driving detected - waiting 15 seconds before starting auto trip...');
        } else {
          const waitedTime = point.timestamp - drivingDetectedTime;
          if (waitedTime >= AUTO_START_DELAY) {
            currentAutoTrip = await startAutoTrip(point);
            currentAutoTripChanged = true;
            drivingDetectedTime = null; // Reset
            drivingDetectedTimeChanged = true;
            log('Auto trip started after 15 second delay', { tripId: currentAutoTrip.id });
          }
        }
      } else {
        if (currentAutoTrip.route && currentAutoTrip.route.length > 0) {
          const lastPoint = currentAutoTrip.route[currentAutoTrip.route.length - 1];
          const segmentDistance = haversineDistance(
            lastPoint.latitude, lastPoint.longitude,
            point.latitude, point.longitude,
            trackingR
          );
          
          if (segmentDistance > threshold) {
            currentAutoTrip.distance += segmentDistance;
            currentAutoTrip.route.push(point);
            currentAutoTripChanged = true;
            log('Auto trip distance updated', { distance: currentAutoTrip.distance });
          }
        } else {
          currentAutoTrip.route = [point];
          currentAutoTripChanged = true;
        }
      }
    } else {
      // Not driving
      if (!currentAutoTrip) {
        // Don't reset instantly! GPS speeds fluctuate. Only reset if we've stopped moving for 60 seconds
        if (drivingDetectedTime && point.timestamp - lastMovementTime > 60000) {
          drivingDetectedTime = null;
          drivingDetectedTimeChanged = true;
          log('Driving detection reset due to 60s of inactivity');
        }
      }
      
      if (currentAutoTrip && isStopped) {
        const stoppedDuration = point.timestamp - lastMovementTime;
        
        if (stoppedDuration >= AUTO_STOP_TIMEOUT) {
          log('Auto Trip ending - stopped for 5 minutes', { tripId: currentAutoTrip.id });
          await endAutoTrip(currentAutoTrip, point);
          currentAutoTrip = null;
          currentAutoTripChanged = true;
          drivingDetectedTime = null; // Reset for next trip
          drivingDetectedTimeChanged = true;
        }
      }
    }
  }
  
  // Save final state back to storage ONCE at the end of the batch
  try {
    if (lastLocationPointChanged && lastLocationPoint) {
      await AsyncStorage.setItem(STORAGE_KEYS.LAST_LOCATION, JSON.stringify(lastLocationPoint));
    }
    if (currentAutoTripChanged) {
      if (currentAutoTrip === null) {
        await saveCurrentTrip(null);
      } else {
        // Solve race condition: verify if the trip has been ended or changed during processing
        const latestTrip = await getCurrentTrip();
        if (latestTrip && latestTrip.id === currentAutoTrip.id) {
          await saveCurrentTrip(currentAutoTrip);
        } else {
          log('Bypassing saving auto-trip because it was ended or changed in the meantime');
        }
      }
    }
    if (currentManualTripChanged) {
      if (currentManualTrip) {
        // Solve race condition: verify if the manual trip ID has been changed (e.g. synced with server UUID)
        const latestManualTripJson = await AsyncStorage.getItem('current_active_trip');
        const latestManualTrip = latestManualTripJson ? JSON.parse(latestManualTripJson) : null;
        
        if (latestManualTrip && latestManualTrip.is_active) {
          // If the ID in storage was changed (e.g. to a server UUID), we preserve that server UUID!
          if (latestManualTrip.id !== currentManualTrip.id) {
            log('Manual trip ID in storage was updated (e.g. to server UUID). Syncing ID before saving.', { oldId: currentManualTrip.id, newId: latestManualTrip.id });
            currentManualTrip.id = latestManualTrip.id;
          }
          await AsyncStorage.setItem('current_active_trip', JSON.stringify(currentManualTrip));
        } else if (!latestManualTrip) {
          // If it was cleared, do not save it back!
          log('Bypassing saving manual trip because it was ended or cleared in storage');
        }
      } else {
        await AsyncStorage.removeItem('current_active_trip');
      }
    }
    if (drivingDetectedTimeChanged) {
      if (drivingDetectedTime !== null) {
        await AsyncStorage.setItem('auto_driving_detected_time', drivingDetectedTime.toString());
      } else {
        await AsyncStorage.removeItem('auto_driving_detected_time');
      }
    }
    if (lastMovementTimeChanged) {
      await AsyncStorage.setItem('auto_last_movement_time', lastMovementTime.toString());
    }
  } catch (e: any) {
    log('Error saving batch state to AsyncStorage', e.message);
  }
}

// Define the background task
TaskManager.defineTask(BACKGROUND_LOCATION_TASK, async ({ data, error }) => {
  if (error) {
    log('Background task error', error);
    return;
  }
  
  if (data) {
    try {
      const { locations } = data as { locations: Location.LocationObject[] };
      await processLocationUpdate(locations);
    } catch (e: any) {
      log('Fatal error in background task processor - caught to prevent OS crash', e.message);
    }
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
  
  // Check subscription and mileage limits
  try {
    const subscriptionTier = await AsyncStorage.getItem('subscription_tier');
    if (subscriptionTier === 'free') {
      const cachedStatsStr = await AsyncStorage.getItem('cached_dashboard_stats');
      if (cachedStatsStr) {
        const cachedStats = JSON.parse(cachedStatsStr);
        if (cachedStats && ((cachedStats.monthly_trips || 0) >= 40 || (cachedStats.monthly_miles || 0) >= 200.0)) {
          log('Background tracking start blocked: free user reached 40 trips or 200 miles limit');
          return false;
        }
      }
    }
  } catch (err) {
    log('Error checking subscription and mileage limits in startBackgroundTracking', err);
  }

  // Check if master tracking is enabled
  try {
    const masterEnabled = await AsyncStorage.getItem('master_tracking_enabled');
    if (masterEnabled === 'false') {
      log('Background tracking start blocked: master tracking is disabled');
      return false;
    }
  } catch (err) {
    log('Error reading master_tracking_enabled from AsyncStorage', err);
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

// Reset auto-tracking state - call this when manual trip starts or ends
// This ensures auto-tracking starts fresh and doesn't pickup data from manual trips
export async function resetAutoTrackingState(): Promise<void> {
  // Clear any current auto trip
  await saveCurrentTrip(null);
  
  // Reset the delay timer in storage
  try {
    await AsyncStorage.removeItem('auto_driving_detected_time');
    await AsyncStorage.setItem('auto_last_movement_time', Date.now().toString());
  } catch {}
  
  log('Auto-tracking state reset - will start fresh for next trip');
}

// Clear current auto trip (if there's an incomplete one)
export async function clearCurrentAutoTrip(): Promise<void> {
  await saveCurrentTrip(null);
  try {
    await AsyncStorage.removeItem('auto_driving_detected_time');
  } catch {}
  log('Current auto trip cleared');
}

// Initialize auto-tracking on app start
export async function initializeAutoTracking(): Promise<void> {
  if (Platform.OS === 'web') return;
  
  // Check if master tracking is enabled
  try {
    const masterEnabled = await AsyncStorage.getItem('master_tracking_enabled');
    if (masterEnabled === 'false') {
      log('Auto-tracking start blocked on boot: master tracking is disabled');
      return;
    }
  } catch (err) {
    log('Error reading master_tracking_enabled from AsyncStorage on boot', err);
  }
  
  const enabled = await isAutoTrackingEnabled();
  if (enabled) {
    log('Auto-tracking was enabled, restarting...');
    await startBackgroundTracking();
  }
}
