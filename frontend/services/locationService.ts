import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

export const LOCATION_TASK = 'MULTI_MILE_BG_LOCATION';
const DRIVE_SPEED_MPH = 8;
const STOP_TIME_MS = 5 * 60 * 1000; // 5 min

// Must be defined at module level for background tasks
if (Platform.OS !== 'web') {
  try {
    TaskManager.defineTask(LOCATION_TASK, async ({ data, error }: any) => {
      if (error) { console.error('BG Location error:', error.message); return; }
      if (data?.locations) {
        try {
          const stored = JSON.parse(await AsyncStorage.getItem('bg_waypoints') || '[]');
          const newPoints = (data.locations as Location.LocationObject[]).map(l => ({
            lat: l.coords.latitude,
            lng: l.coords.longitude,
            speed: l.coords.speed || 0,
            ts: l.timestamp,
          }));
          // Keep last 300 waypoints
          await AsyncStorage.setItem('bg_waypoints', JSON.stringify([...stored, ...newPoints].slice(-300)));
        } catch {}
      }
    });
  } catch {}
}

export async function requestForegroundPermission(): Promise<boolean> {
  try {
    const { status } = await Location.requestForegroundPermissionsAsync();
    return status === 'granted';
  } catch { return false; }
}

export async function requestBackgroundPermission(): Promise<boolean> {
  if (Platform.OS === 'web') return false;
  try {
    const { status } = await Location.requestBackgroundPermissionsAsync();
    return status === 'granted';
  } catch { return false; }
}

export async function startBackgroundTracking(): Promise<boolean> {
  if (Platform.OS === 'web') return false;
  try {
    const hasPermission = await requestBackgroundPermission();
    if (!hasPermission) return false;
    const isRunning = await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK).catch(() => false);
    if (!isRunning) {
      await Location.startLocationUpdatesAsync(LOCATION_TASK, {
        accuracy: Location.Accuracy.Balanced,
        distanceInterval: 30,
        timeInterval: 20000,
        foregroundService: {
          notificationTitle: 'Multi Mile Tracker',
          notificationBody: 'Monitoring for drives automatically...',
          notificationColor: '#10B981',
        },
        showsBackgroundLocationIndicator: true,
        activityType: Location.ActivityType.AutomotiveNavigation,
      });
    }
    await AsyncStorage.setItem('auto_detect_enabled', 'true');
    return true;
  } catch (e) {
    console.error('Start BG tracking error:', e);
    return false;
  }
}

export async function stopBackgroundTracking(): Promise<void> {
  if (Platform.OS === 'web') return;
  try {
    const isRunning = await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK).catch(() => false);
    if (isRunning) await Location.stopLocationUpdatesAsync(LOCATION_TASK);
  } catch {}
  await AsyncStorage.setItem('auto_detect_enabled', 'false');
}

export async function isBackgroundTrackingActive(): Promise<boolean> {
  if (Platform.OS === 'web') return false;
  return Location.hasStartedLocationUpdatesAsync(LOCATION_TASK).catch(() => false);
}

export function mpsToMph(mps: number): number {
  return mps * 2.237;
}

export async function getCurrentLocation(): Promise<{ latitude: number; longitude: number; speed: number } | null> {
  try {
    const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
    return { latitude: loc.coords.latitude, longitude: loc.coords.longitude, speed: loc.coords.speed || 0 };
  } catch { return null; }
}

export async function getAddressFromCoords(lat: number, lng: number): Promise<string> {
  try {
    const geo = await Location.reverseGeocodeAsync({ latitude: lat, longitude: lng });
    if (geo.length > 0) {
      const g = geo[0];
      return [g.street, g.city, g.region].filter(Boolean).join(', ');
    }
    return 'Current Location';
  } catch { return 'Current Location'; }
}

export async function getPendingWaypoints(): Promise<any[]> {
  try {
    return JSON.parse(await AsyncStorage.getItem('bg_waypoints') || '[]');
  } catch { return []; }
}

export async function clearPendingWaypoints(): Promise<void> {
  await AsyncStorage.removeItem('bg_waypoints');
}
