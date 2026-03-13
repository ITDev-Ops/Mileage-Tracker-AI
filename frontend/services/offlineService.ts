import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo, { NetInfoState } from '@react-native-community/netinfo';
import { Platform } from 'react-native';

// Storage keys for offline data
const STORAGE_KEYS = {
  OFFLINE_TRIPS: 'offline_trips',
  OFFLINE_QUEUE: 'offline_api_queue',
  LAST_SYNC_TIME: 'last_sync_time',
  NETWORK_STATUS: 'network_status',
};

// Types
export interface OfflineTrip {
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
  classification: string;
  notes?: string;
  route?: Array<{ latitude: number; longitude: number; timestamp: number }>;
  synced: boolean;
  created_offline: boolean;
  sync_attempts: number;
  last_sync_attempt?: string;
}

export interface QueuedApiCall {
  id: string;
  endpoint: string;
  method: 'POST' | 'PUT' | 'DELETE';
  body: any;
  created_at: string;
  attempts: number;
  last_attempt?: string;
}

// Logging helper
const log = (message: string, data?: any) => {
  const prefix = `[OfflineService]`;
  if (data !== undefined) {
    console.log(prefix, message, typeof data === 'object' ? JSON.stringify(data) : data);
  } else {
    console.log(prefix, message);
  }
};

// Network status tracking
let isOnline = true;
let networkListeners: Array<(online: boolean) => void> = [];

// Initialize network monitoring
export async function initializeOfflineService(): Promise<void> {
  log('Initializing offline service...');
  
  // Get initial network state
  const state = await NetInfo.fetch();
  isOnline = state.isConnected ?? true;
  log('Initial network state:', isOnline ? 'online' : 'offline');
  
  // Subscribe to network changes
  NetInfo.addEventListener((state: NetInfoState) => {
    const wasOnline = isOnline;
    isOnline = state.isConnected ?? true;
    
    log('Network state changed:', isOnline ? 'online' : 'offline');
    
    // Notify listeners
    networkListeners.forEach(listener => listener(isOnline));
    
    // If we just came online, trigger sync
    if (!wasOnline && isOnline) {
      log('Connection restored, triggering sync...');
      // Sync will be triggered by components listening to network changes
    }
  });
  
  log('Offline service initialized');
}

// Check if online
export function isNetworkOnline(): boolean {
  return isOnline;
}

// Subscribe to network changes
export function onNetworkChange(callback: (online: boolean) => void): () => void {
  networkListeners.push(callback);
  return () => {
    networkListeners = networkListeners.filter(l => l !== callback);
  };
}

// ==================== OFFLINE TRIPS ====================

// Save a trip offline
export async function saveOfflineTrip(trip: Omit<OfflineTrip, 'id' | 'synced' | 'created_offline' | 'sync_attempts'>): Promise<OfflineTrip> {
  const offlineTrip: OfflineTrip = {
    ...trip,
    id: `offline_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    synced: false,
    created_offline: true,
    sync_attempts: 0,
  };
  
  const trips = await getOfflineTrips();
  trips.push(offlineTrip);
  await AsyncStorage.setItem(STORAGE_KEYS.OFFLINE_TRIPS, JSON.stringify(trips));
  
  log('Saved offline trip:', { id: offlineTrip.id, distance: offlineTrip.distance });
  return offlineTrip;
}

// Get all offline trips
export async function getOfflineTrips(): Promise<OfflineTrip[]> {
  try {
    const data = await AsyncStorage.getItem(STORAGE_KEYS.OFFLINE_TRIPS);
    return data ? JSON.parse(data) : [];
  } catch (e) {
    log('Error getting offline trips:', e);
    return [];
  }
}

// Get unsynced trips
export async function getUnsyncedTrips(): Promise<OfflineTrip[]> {
  const trips = await getOfflineTrips();
  return trips.filter(t => !t.synced);
}

// Mark trip as synced
export async function markTripSynced(tripId: string): Promise<void> {
  const trips = await getOfflineTrips();
  const index = trips.findIndex(t => t.id === tripId);
  if (index !== -1) {
    trips[index].synced = true;
    await AsyncStorage.setItem(STORAGE_KEYS.OFFLINE_TRIPS, JSON.stringify(trips));
    log('Marked trip as synced:', tripId);
  }
}

// Update trip sync attempt
export async function updateTripSyncAttempt(tripId: string): Promise<void> {
  const trips = await getOfflineTrips();
  const index = trips.findIndex(t => t.id === tripId);
  if (index !== -1) {
    trips[index].sync_attempts += 1;
    trips[index].last_sync_attempt = new Date().toISOString();
    await AsyncStorage.setItem(STORAGE_KEYS.OFFLINE_TRIPS, JSON.stringify(trips));
  }
}

// Clear synced trips (cleanup)
export async function clearSyncedTrips(): Promise<number> {
  const trips = await getOfflineTrips();
  const unsyncedTrips = trips.filter(t => !t.synced);
  const clearedCount = trips.length - unsyncedTrips.length;
  await AsyncStorage.setItem(STORAGE_KEYS.OFFLINE_TRIPS, JSON.stringify(unsyncedTrips));
  log('Cleared synced trips:', clearedCount);
  return clearedCount;
}

// ==================== API QUEUE ====================

// Queue an API call for later
export async function queueApiCall(endpoint: string, method: 'POST' | 'PUT' | 'DELETE', body: any): Promise<void> {
  const queuedCall: QueuedApiCall = {
    id: `queue_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    endpoint,
    method,
    body,
    created_at: new Date().toISOString(),
    attempts: 0,
  };
  
  const queue = await getApiQueue();
  queue.push(queuedCall);
  await AsyncStorage.setItem(STORAGE_KEYS.OFFLINE_QUEUE, JSON.stringify(queue));
  
  log('Queued API call:', { endpoint, method });
}

// Get API queue
export async function getApiQueue(): Promise<QueuedApiCall[]> {
  try {
    const data = await AsyncStorage.getItem(STORAGE_KEYS.OFFLINE_QUEUE);
    return data ? JSON.parse(data) : [];
  } catch (e) {
    log('Error getting API queue:', e);
    return [];
  }
}

// Remove from queue
export async function removeFromQueue(callId: string): Promise<void> {
  const queue = await getApiQueue();
  const filtered = queue.filter(c => c.id !== callId);
  await AsyncStorage.setItem(STORAGE_KEYS.OFFLINE_QUEUE, JSON.stringify(filtered));
  log('Removed from queue:', callId);
}

// Update queue item attempt
export async function updateQueueAttempt(callId: string): Promise<void> {
  const queue = await getApiQueue();
  const index = queue.findIndex(c => c.id === callId);
  if (index !== -1) {
    queue[index].attempts += 1;
    queue[index].last_attempt = new Date().toISOString();
    await AsyncStorage.setItem(STORAGE_KEYS.OFFLINE_QUEUE, JSON.stringify(queue));
  }
}

// ==================== SYNC OPERATIONS ====================

// Sync all offline trips to server
export async function syncOfflineTrips(
  token: string,
  createTripFn: (token: string, data: any) => Promise<any>
): Promise<{ synced: number; failed: number }> {
  if (!isOnline) {
    log('Cannot sync - offline');
    return { synced: 0, failed: 0 };
  }
  
  const unsyncedTrips = await getUnsyncedTrips();
  if (unsyncedTrips.length === 0) {
    log('No trips to sync');
    return { synced: 0, failed: 0 };
  }
  
  log('Syncing offline trips:', unsyncedTrips.length);
  let synced = 0;
  let failed = 0;
  
  for (const trip of unsyncedTrips) {
    // Skip trips with too many failed attempts
    if (trip.sync_attempts >= 5) {
      log('Skipping trip with too many attempts:', trip.id);
      failed++;
      continue;
    }
    
    try {
      await updateTripSyncAttempt(trip.id);
      
      await createTripFn(token, {
        start_time: trip.start_time,
        end_time: trip.end_time,
        start_lat: trip.start_lat,
        start_lng: trip.start_lng,
        end_lat: trip.end_lat,
        end_lng: trip.end_lng,
        start_address: trip.start_address || 'Offline tracked',
        end_address: trip.end_address || 'Offline tracked',
        distance: trip.distance,
        // Default to 'business' for deduction calculation (Issue #2 fix)
        classification: trip.classification || 'business',
        notes: trip.notes || 'Tracked offline',
      });
      
      await markTripSynced(trip.id);
      synced++;
      log('Synced trip:', trip.id);
    } catch (e: any) {
      log('Failed to sync trip:', { id: trip.id, error: e.message });
      failed++;
    }
  }
  
  // Update last sync time
  await AsyncStorage.setItem(STORAGE_KEYS.LAST_SYNC_TIME, new Date().toISOString());
  
  log('Sync complete:', { synced, failed });
  return { synced, failed };
}

// Process queued API calls
export async function processApiQueue(
  token: string,
  apiFn: (endpoint: string, method: string, body: any, token: string) => Promise<any>
): Promise<{ processed: number; failed: number }> {
  if (!isOnline) {
    log('Cannot process queue - offline');
    return { processed: 0, failed: 0 };
  }
  
  const queue = await getApiQueue();
  if (queue.length === 0) {
    log('No queued API calls');
    return { processed: 0, failed: 0 };
  }
  
  log('Processing API queue:', queue.length);
  let processed = 0;
  let failed = 0;
  
  for (const call of queue) {
    // Skip calls with too many failed attempts
    if (call.attempts >= 5) {
      log('Skipping call with too many attempts:', call.id);
      failed++;
      continue;
    }
    
    try {
      await updateQueueAttempt(call.id);
      await apiFn(call.endpoint, call.method, call.body, token);
      await removeFromQueue(call.id);
      processed++;
      log('Processed queued call:', call.endpoint);
    } catch (e: any) {
      log('Failed to process queued call:', { endpoint: call.endpoint, error: e.message });
      failed++;
    }
  }
  
  log('Queue processing complete:', { processed, failed });
  return { processed, failed };
}

// ==================== STATISTICS ====================

// Get offline statistics
export async function getOfflineStats(): Promise<{
  unsyncedTrips: number;
  queuedCalls: number;
  totalOfflineDistance: number;
  lastSyncTime: string | null;
}> {
  const unsyncedTrips = await getUnsyncedTrips();
  const queue = await getApiQueue();
  const lastSyncTime = await AsyncStorage.getItem(STORAGE_KEYS.LAST_SYNC_TIME);
  
  const totalOfflineDistance = unsyncedTrips.reduce((sum, t) => sum + t.distance, 0);
  
  return {
    unsyncedTrips: unsyncedTrips.length,
    queuedCalls: queue.length,
    totalOfflineDistance,
    lastSyncTime,
  };
}

// ==================== CURRENT TRIP (for active tracking) ====================

const CURRENT_TRIP_KEY = 'current_active_trip';

export interface ActiveTrip {
  id: string;
  start_time: string;
  start_lat: number;
  start_lng: number;
  current_lat: number;
  current_lng: number;
  distance: number;
  route: Array<{ latitude: number; longitude: number; timestamp: number; speed?: number }>;
  is_active: boolean;
}

// Start a new trip (works offline)
export async function startTrip(lat: number, lng: number): Promise<ActiveTrip> {
  const trip: ActiveTrip = {
    id: `trip_${Date.now()}`,
    start_time: new Date().toISOString(),
    start_lat: lat,
    start_lng: lng,
    current_lat: lat,
    current_lng: lng,
    distance: 0,
    route: [{ latitude: lat, longitude: lng, timestamp: Date.now() }],
    is_active: true,
  };
  
  await AsyncStorage.setItem(CURRENT_TRIP_KEY, JSON.stringify(trip));
  log('Started trip:', trip.id);
  return trip;
}

// Update current trip with new location
export async function updateTripLocation(lat: number, lng: number, speed?: number): Promise<ActiveTrip | null> {
  try {
    const tripData = await AsyncStorage.getItem(CURRENT_TRIP_KEY);
    if (!tripData) return null;
    
    const trip: ActiveTrip = JSON.parse(tripData);
    if (!trip.is_active) return null;
    
    // Calculate distance from last point
    const lastPoint = trip.route[trip.route.length - 1];
    const segmentDistance = haversineDistance(
      lastPoint.latitude, lastPoint.longitude,
      lat, lng
    );
    
    // Only add point if moved meaningfully (> 20 meters)
    if (segmentDistance > 0.012) { // ~20 meters in miles
      trip.route.push({ latitude: lat, longitude: lng, timestamp: Date.now(), speed });
      trip.distance += segmentDistance;
      trip.current_lat = lat;
      trip.current_lng = lng;
      
      await AsyncStorage.setItem(CURRENT_TRIP_KEY, JSON.stringify(trip));
    }
    
    return trip;
  } catch (e) {
    log('Error updating trip location:', e);
    return null;
  }
}

// End current trip and save for sync
export async function endTrip(classification?: string): Promise<OfflineTrip | null> {
  try {
    const tripData = await AsyncStorage.getItem(CURRENT_TRIP_KEY);
    if (!tripData) return null;
    
    const trip: ActiveTrip = JSON.parse(tripData);
    
    // Save as offline trip for syncing
    const offlineTrip = await saveOfflineTrip({
      start_time: trip.start_time,
      end_time: new Date().toISOString(),
      start_lat: trip.start_lat,
      start_lng: trip.start_lng,
      end_lat: trip.current_lat,
      end_lng: trip.current_lng,
      distance: trip.distance,
      classification: classification || 'unclassified',
      route: trip.route,
    });
    
    // Clear current trip
    await AsyncStorage.removeItem(CURRENT_TRIP_KEY);
    log('Ended trip:', { id: trip.id, distance: trip.distance });
    
    return offlineTrip;
  } catch (e) {
    log('Error ending trip:', e);
    return null;
  }
}

// Get current active trip
export async function getCurrentTrip(): Promise<ActiveTrip | null> {
  try {
    const tripData = await AsyncStorage.getItem(CURRENT_TRIP_KEY);
    return tripData ? JSON.parse(tripData) : null;
  } catch (e) {
    log('Error getting current trip:', e);
    return null;
  }
}

// Haversine distance calculation (in miles)
function haversineDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 3958.8; // Earth's radius in miles
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
