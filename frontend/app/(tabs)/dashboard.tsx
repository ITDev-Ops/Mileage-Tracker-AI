import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  RefreshControl, Alert, Platform, ActivityIndicator, Animated, Easing
} from 'react-native';
import { useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Location from 'expo-location';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuth } from '../../context/AuthContext';
import { API } from '../../services/api';
import { Colors, FontSize, Spacing, Radius, Shadow, ClassificationColor } from '../../constants/theme';
import {
  isNetworkOnline,
  onNetworkChange,
  saveOfflineTrip,
  startTrip as startOfflineTrip,
  endTrip as endOfflineTrip,
  getCurrentTrip as getOfflineActiveTrip,
  clearCurrentTrip as clearOfflineActiveTrip,
  calculateDeduction,
  updateTripLocation,
  getOfflineTrips,
  syncOfflineTrips,
  setForceOfflineTracking,
  getForceOfflineTracking,
} from '../../services/offlineService';
import {
  isAutoTrackingEnabled,
  getTrackingStatus,
  stopBackgroundTracking,
  startBackgroundTracking,
  resetAutoTrackingState,
  setCreateTripFunction,
  setDashboardRefreshFunction,
  syncPendingTrips,
  getPendingTrips,
  processLocationUpdate,
} from '../../services/backgroundTracking';

// Haversine distance formula (with dynamic Earth radius) to prevent ReferenceError crashes when GPS falls back
function haversineDistance(lat1: number, lon1: number, lat2: number, lon2: number, R: number = 3958.8): number {
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
import { getCurrencySymbol, getDistanceUnitAbbr, getDistanceUnitFull } from '../../services/countryService';
import {
  getDailyMessage,
  getAllCategoryMessages,
  shouldShowMagnified,
  resetAppOpenedTime,
} from '../../services/inspirationService';

interface Stats {
  monthly_miles: number;
  monthly_deductions: number;
  monthly_trips: number;
  yearly_miles: number;
  yearly_deductions: number;
  yearly_trips: number;
  active_trip: any;
  recent_trips: any[];
  unclassified_count: number;
  chart_data: Array<{ month: string; miles: number; deductions: number }>;
  irs_rate: number;
}

function BarChart({ data }: { data: Array<{ month: string; miles: number }> }) {
  const max = Math.max(...data.map(d => d.miles), 1);
  return (
    <View testID="savings-chart" style={{ flexDirection: 'row', alignItems: 'flex-end', height: 80, gap: 4, paddingBottom: 20 }}>
      {data.map((item, i) => (
        <View key={i} style={{ flex: 1, alignItems: 'center' }}>
          <View style={{ flex: 1, width: '100%', justifyContent: 'flex-end' }}>
            <View style={{
              backgroundColor: i === data.length - 1 ? Colors.brand.primary : Colors.brand.primaryDim,
              borderRadius: 3,
              height: Math.max((item.miles / max) * 60, 3),
            }} />
          </View>
          <Text style={{ color: Colors.text.tertiary, fontSize: 9, marginTop: 4, textAlign: 'center' }}>{item.month}</Text>
        </View>
      ))}
    </View>
  );
}

function formatDuration(startTime: string): string {
  const diff = Date.now() - new Date(startTime).getTime();
  const mins = Math.floor(diff / 60000);
  const hrs = Math.floor(mins / 60);
  if (hrs > 0) return `${hrs}h ${mins % 60}m`;
  return `${mins}m`;
}

function formatLiveTripInfo(distance: number, startTime: string, unit: string = 'miles'): string {
  const diff = Date.now() - new Date(startTime).getTime();
  const mins = Math.floor(diff / 60000);
  const hrs = Math.floor(mins / 60);
  const durationStr = hrs > 0 ? `${hrs}h ${mins % 60}m` : `${mins}m`;
  return `${distance.toFixed(1)} ${unit} · ${durationStr}`;
}

export default function DashboardScreen() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [startingTrip, setStartingTrip] = useState(false);
  const [endingTrip, setEndingTrip] = useState(false);
  const [insights, setInsights] = useState<any[]>([]);
  const [liveDistance, setLiveDistance] = useState(0);
  const [liveDuration, setLiveDuration] = useState('0m');
  const [isOnline, setIsOnline] = useState(true);
  const [isAutoTrip, setIsAutoTrip] = useState(false);
  const [isOfflineTrackingTrip, setIsOfflineTrackingTrip] = useState(false);
  const [forceOfflineTracking, setLocalForceOfflineTracking] = useState(false);
  const [masterTrackingEnabled, setMasterTrackingEnabled] = useState(true);
  const [autoTripAddress, setAutoTripAddress] = useState('Current Location');
  
  // Inspiration banner states
  const [inspirationMessage, setInspirationMessage] = useState('');
  const [inspirationColor, setInspirationColor] = useState('#FFD700');
  const [allMessages, setAllMessages] = useState<string[]>([]);
  const [currentMessageIndex, setCurrentMessageIndex] = useState(0);
  const [isMagnified, setIsMagnified] = useState(false);
  const scrollAnim = useRef(new Animated.Value(0)).current;
  const magnifyAnim = useRef(new Animated.Value(0)).current;
  
  // Auto trip location tracking
  const [autoStartAddress, setAutoStartAddress] = useState('');
  const [autoEndAddress, setAutoEndAddress] = useState('');
  const [manualStartAddress, setManualStartAddress] = useState('');
  const [manualEndAddress, setManualEndAddress] = useState('');
  
  // Manual trip auto-end tracking
  const [lastManualMovementTime, setLastManualMovementTime] = useState<number | null>(null);
  const [tripStartTime, setTripStartTime] = useState<number | null>(null);
  const manualStopCheckRef = useRef<NodeJS.Timeout | number | null>(null);
  const MANUAL_TRIP_STOP_TIMEOUT = 10 * 60 * 1000; // 10 minutes
  
  const locationWatchRef = useRef<Location.LocationSubscription | null>(null);
  const timerRef = useRef<NodeJS.Timeout | number | null>(null);
  const lastLocationRef = useRef<{ lat: number; lng: number } | null>(null);
  const { user, token } = useAuth();
  const country = user?.tax_country || 'US';
  const currencySymbol = getCurrencySymbol(country);
  const distanceUnit = getDistanceUnitAbbr(country);
  const distanceUnitFull = getDistanceUnitFull(country);
  const router = useRouter();
  const insets = useSafeAreaInsets();

  // Set up API function for background tracking to use
  useEffect(() => {
    if (token) {
      setCreateTripFunction(API.createTripDirect.bind(API));
      // Set up dashboard refresh function so auto-trips can trigger refresh
      setDashboardRefreshFunction(async () => {
        console.log('[Dashboard] Background triggered refresh');
        await loadData();
        loadInsights();
      });
    }
  }, [token]);

  // Load inspiration messages - try AI first, fallback to local
  useEffect(() => {
    const loadInspiration = async () => {
      try {
        // First load local messages as fallback
        const daily = await getDailyMessage();
        const all = await getAllCategoryMessages();
        
        setInspirationMessage(daily.message);
        setInspirationColor(daily.color);
        setAllMessages(all.messages);
        
        // Try to get AI-powered message if online and has token
        if (token && isOnline) {
          try {
            const { getSelectedCategory, getCachedAIMessage, cacheAIMessage } = await import('../../services/inspirationService');
            const category = await getSelectedCategory();
            
            // Check if we have a cached AI message for today
            const cached = await getCachedAIMessage();
            if (cached) {
              setInspirationMessage(cached.message);
              setInspirationColor(cached.color);
              setAllMessages([cached.message, ...all.messages.slice(0, 3)]);
            } else {
              // Fetch fresh AI message
              const aiResponse = await API.getAIInspiration(token, category);
              if (aiResponse && aiResponse.message) {
                setInspirationMessage(aiResponse.message);
                setInspirationColor(aiResponse.color || daily.color);
                setAllMessages([aiResponse.message, ...all.messages.slice(0, 3)]);
                // Cache for today
                await cacheAIMessage(aiResponse.message, aiResponse.color || daily.color);
              }
            }
          } catch (aiErr) {
            console.log('[Dashboard] AI inspiration not available, using local:', aiErr);
          }
        }
        
        const shouldMagnify = await shouldShowMagnified();
        setIsMagnified(shouldMagnify);
        
        // If magnified, animate after 5 minutes
        if (shouldMagnify) {
          Animated.timing(magnifyAnim, {
            toValue: 1,
            duration: 500,
            useNativeDriver: false,
          }).start();
          
          // Reset magnification after 5 minutes
          setTimeout(() => {
            Animated.timing(magnifyAnim, {
              toValue: 0,
              duration: 500,
              useNativeDriver: false,
            }).start(() => setIsMagnified(false));
          }, 5 * 60 * 1000);
        }
      } catch (e) {
        console.log('[Dashboard] Error loading inspiration:', e);
      }
    };
    
    loadInspiration();
    
    // Scroll through messages every 8 seconds
    const scrollInterval = setInterval(() => {
      setCurrentMessageIndex(prev => (prev + 1) % Math.max(allMessages.length, 1));
    }, 8000);
    
    return () => clearInterval(scrollInterval);
  }, [token, isOnline, allMessages.length]);

  // Monitor network status and auto-tracking
  useEffect(() => {
    // Load initial offline tracking and master tracking config
    const loadOfflineTrackingConfig = async () => {
      try {
        const storedOfflineTrip = await AsyncStorage.getItem('is_offline_tracking_trip');
        setIsOfflineTrackingTrip(storedOfflineTrip === 'true');
        setLocalForceOfflineTracking(getForceOfflineTracking());
        
        const storedMasterTracking = await AsyncStorage.getItem('master_tracking_enabled');
        setMasterTrackingEnabled(storedMasterTracking !== 'false');
      } catch (err) {
        console.log('[Dashboard] Error loading config:', err);
      }
    };
    loadOfflineTrackingConfig();

    setIsOnline(isNetworkOnline());
    const unsubscribe = onNetworkChange(async (online) => {
      setIsOnline(online);
      setLocalForceOfflineTracking(getForceOfflineTracking());
      console.log('[Dashboard] Network status changed:', online ? 'online' : 'offline');
      if (online && token) {
        console.log('[Dashboard] Connectivity restored - sweeping offline queues...');
        try {
          await syncOfflineTrips(token, API.createTrip);
          await syncPendingTrips(token, API.createTrip);
          await loadData();
        } catch (e) {
          console.log('[Dashboard] Queue sweep error:', e);
        }
      }
    });
    
    // Check for active manual/auto tracking status
    checkActiveTripStatus();
    
    // Poll for active trip updates every 2 seconds for high responsiveness
    const activeTrackInterval = setInterval(checkActiveTripStatus, 2000);
    
    return () => {
      unsubscribe();
      clearInterval(activeTrackInterval);
    };
  }, [token]);

  const checkActiveTripStatus = async () => {
    try {
      const status = await getTrackingStatus();
      const manualTrip = await getOfflineActiveTrip();
      
      if (manualTrip && manualTrip.is_active) {
        // Manual trip is active (either online or offline tracked)
        setIsAutoTrip(false);
        setLiveDistance(manualTrip.distance || 0);
        
        try {
          const storedOfflineTrip = await AsyncStorage.getItem('is_offline_tracking_trip');
          setIsOfflineTrackingTrip(storedOfflineTrip === 'true');
        } catch {}
        
        if (manualTrip.start_time) {
          const startTime = new Date(manualTrip.start_time).getTime();
          const diff = Date.now() - startTime;
          const totalMins = Math.floor(diff / 60000);
          const hrs = Math.floor(totalMins / 60);
          const mins = totalMins % 60;
          setLiveDuration(hrs > 0 ? `${hrs}h ${mins}m` : `${mins}m`);
        }
        
        // Ensure active_trip is populated in stats state so the UI displays the manual active trip card
        if (!stats?.active_trip) {
          setStats(prev => ({
            ...(prev || { monthly_miles: 0, monthly_deductions: 0, monthly_trips: 0, yearly_miles: 0, yearly_deductions: 0, yearly_trips: 0, recent_trips: [], unclassified_count: 0, chart_data: [], irs_rate: 0.70 }),
            active_trip: {
              trip_id: manualTrip.id,
              start_time: manualTrip.start_time,
              start_lat: manualTrip.start_lat,
              start_lng: manualTrip.start_lng,
              start_address: stats?.active_trip?.start_address || 'Current Location',
              distance: manualTrip.distance || 0
            }
          }));
        }

        // Get manual trip start and current location addresses (Issue #10 fix)
        try {
          if (!manualStartAddress && manualTrip.start_lat && manualTrip.start_lng) {
            const startGeo = await Location.reverseGeocodeAsync({
              latitude: manualTrip.start_lat,
              longitude: manualTrip.start_lng
            });
            if (startGeo.length > 0) {
              const g = startGeo[0];
              const addr = [g.street, g.city, g.region].filter(Boolean).join(', ');
              setManualStartAddress(addr || 'Current Location');
              
              // Also update stats active_trip start_address if it says 'Current Location'
              if (stats?.active_trip && stats.active_trip.start_address === 'Current Location') {
                setStats(prev => prev ? {
                  ...prev,
                  active_trip: {
                    ...prev.active_trip!,
                    start_address: addr || 'Current Location'
                  }
                } : null);
              }
            }
          }
          
          if (manualTrip.current_lat && manualTrip.current_lng) {
            const endGeo = await Location.reverseGeocodeAsync({
              latitude: manualTrip.current_lat,
              longitude: manualTrip.current_lng
            });
            if (endGeo.length > 0) {
              const g = endGeo[0];
              const addr = [g.street, g.city, g.region].filter(Boolean).join(', ');
              setManualEndAddress(addr || 'Current Location');
            }
          }
        } catch (geoError) {
          console.log('[Dashboard] Manual geo error:', geoError);
        }
      } else if (status.currentTrip) {
        // There's an active auto-tracked trip
        setIsAutoTrip(true);
        setLiveDistance(status.currentTrip.distance || 0);
        
        // Calculate duration from start time
        if (status.currentTrip.start_time) {
          const startTime = new Date(status.currentTrip.start_time).getTime();
          const diff = Date.now() - startTime;
          const totalMins = Math.floor(diff / 60000);
          const hrs = Math.floor(totalMins / 60);
          const mins = totalMins % 60;
          setLiveDuration(hrs > 0 ? `${hrs}h ${mins}m` : `${mins}m`);
        }

        // Check for 5-minute inactivity auto-end in the foreground (Issue #11 fix)
        const lastMoveStr = await AsyncStorage.getItem('auto_last_movement_time');
        const lastMovementTime = lastMoveStr ? parseInt(lastMoveStr, 10) : new Date(status.currentTrip.start_time).getTime();
        const stoppedDuration = Date.now() - lastMovementTime;
        if (stoppedDuration >= 5 * 60 * 1000) {
          console.log('[Dashboard] Auto-ending inactive auto-trip due to 5 minutes of no driving detected');
          await stopBackgroundTracking();
          setIsAutoTrip(false);
          setLiveDistance(0);
          setLiveDuration('0m');
          setAutoTripAddress('Current Location');
          setAutoStartAddress('');
          setAutoEndAddress('');
          await loadData();
          
          Alert.alert(
            'Drive Automatically Saved',
            'Your auto-tracked drive was automatically saved after 5 minutes of inactivity.',
            [{ text: 'OK' }]
          );
          return;
        }
        
        // Get start and current location addresses
        try {
          const route = status.currentTrip.route;
          if (route && route.length > 0) {
            // Get start address (first point)
            const startPoint = route[0];
            if (!autoStartAddress) {
              const startGeo = await Location.reverseGeocodeAsync({ 
                latitude: startPoint.latitude, 
                longitude: startPoint.longitude 
              });
              if (startGeo.length > 0) {
                const g = startGeo[0];
                const startAddr = [g.street, g.city, g.region].filter(Boolean).join(', ');
                setAutoStartAddress(startAddr || 'Current Location');
              }
            }
            
            // Get current/end address (last point)
            const lastPoint = route[route.length - 1];
            const endGeo = await Location.reverseGeocodeAsync({ 
              latitude: lastPoint.latitude, 
              longitude: lastPoint.longitude 
            });
            if (endGeo.length > 0) {
              const g = endGeo[0];
              const endAddr = [g.street, g.city, g.region].filter(Boolean).join(', ');
              setAutoEndAddress(endAddr || 'Current Location');
              setAutoTripAddress(endAddr || 'Current Location');
            }
          }
        } catch (geoError) {
          console.log('[Dashboard] Geocode error:', geoError);
        }
      } else {
        // No active trip
        setIsAutoTrip(false);
        setAutoTripAddress('Current Location');
        setAutoStartAddress('');
        setAutoEndAddress('');
        setManualStartAddress('');
        setManualEndAddress('');
        
        // If stats still has an active trip, clear it
        if (stats?.active_trip) {
          setStats(prev => prev ? { ...prev, active_trip: null } : null);
        }
      }
    } catch (e) {
      console.log('[Dashboard] Error checking active tracking:', e);
    }
  };

  // Speed threshold for driving detection (5 mph = 2.2352 m/s)
  const DRIVING_SPEED_THRESHOLD = 2.2352;

  // Monitor manual trip for auto-end after 10 minutes of no movement
  useEffect(() => {
    // Clear any existing interval
    if (manualStopCheckRef.current) {
      clearInterval(manualStopCheckRef.current);
      manualStopCheckRef.current = null;
    }
    
    // Only apply to manual trips (not auto trips)
    const hasActiveManualTrip = stats?.active_trip && !isAutoTrip;
    
    if (hasActiveManualTrip) {
      // Manual trip is active - set up monitoring
      console.log('[Dashboard] ✅ Setting up 10-minute auto-end monitoring for manual trip:', stats?.active_trip?.trip_id);
      
      // Initialize movement time when trip starts if not already set
      if (!lastManualMovementTime) {
        const now = Date.now();
        console.log('[Dashboard] Initializing lastManualMovementTime to:', new Date(now).toISOString());
        setLastManualMovementTime(now);
      }
      
      manualStopCheckRef.current = setInterval(async () => {
        // Only check if we have a valid movement time
        if (!lastManualMovementTime) {
          console.log('[Dashboard] ⏳ Auto-end check skipped - no movement time set yet');
          return;
        }
        
        const now = Date.now();
        const stoppedDuration = now - lastManualMovementTime;
        const stoppedMinutes = Math.floor(stoppedDuration / 60000);
        const stoppedSeconds = Math.floor((stoppedDuration % 60000) / 1000);
        
        console.log(`[Dashboard] ⏱️ Auto-end check - no driving detected for: ${stoppedMinutes}m ${stoppedSeconds}s (threshold: 10m)`);
        
        // Auto-end if no driving detected for 10 minutes
        if (stoppedDuration >= MANUAL_TRIP_STOP_TIMEOUT) {
          console.log('[Dashboard] 🛑 Manual trip auto-ending after 10 minutes of no driving detected');
          
          // Clear interval immediately to prevent duplicate calls
          if (manualStopCheckRef.current) {
            clearInterval(manualStopCheckRef.current);
            manualStopCheckRef.current = null;
          }
          
          try {
            let endLat: number | undefined;
            let endLng: number | undefined;
            let endAddress = 'Trip ended (auto)';
            
            const { status } = await Location.requestForegroundPermissionsAsync();
            if (status === 'granted') {
              const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
              endLat = loc.coords.latitude;
              endLng = loc.coords.longitude;
              try {
                const geo = await Location.reverseGeocodeAsync({ latitude: endLat, longitude: endLng });
                if (geo.length > 0) {
                  const g = geo[0];
                  endAddress = [g.street, g.city, g.region].filter(Boolean).join(', ') || 'Trip ended (auto)';
                }
              } catch {}
            }
            
            const isOfflineTrip = stats?.active_trip?.trip_id?.startsWith('offline_');
            
            if (!isOnline || isOfflineTrip) {
              console.log('[Dashboard] Auto-ending offline manual trip...');
              const offlineTrip = await endOfflineTrip('business');
              
              setLiveDistance(0);
              setLiveDuration('0m');
              setLastManualMovementTime(null);
              setManualStartAddress('');
              setManualEndAddress('');
              setStats(prev => prev ? { ...prev, active_trip: null } : null);
              await resetAutoTrackingState();
              
              if (isOfflineTrackingTrip) {
                await setForceOfflineTracking(false);
                await AsyncStorage.removeItem('is_offline_tracking_trip');
                setIsOfflineTrackingTrip(false);
                setLocalForceOfflineTracking(false);
              }
              
              const autoEnabled = await isAutoTrackingEnabled();
              if (!autoEnabled) {
                console.log('[Dashboard] Stopping background tracking after auto-end offline manual trip because auto-tracking is disabled');
                await stopBackgroundTracking();
              }
              
              await loadData();
              
              Alert.alert(
                'Trip Auto-Ended Offline',
                `Your trip was automatically saved offline after 10 minutes of no driving detected.\n\nDistance: ${liveDistance.toFixed(1)} miles`,
                [{ text: 'OK' }]
              );
              return;
            }
            
            if (stats?.active_trip) {
              await API.endTrip(token!, stats.active_trip.trip_id, { 
                end_lat: endLat, 
                end_lng: endLng, 
                end_address: endAddress, 
                distance: liveDistance,
                classification: 'business'
              });
            }
            
            // Clear current active trip in storage so checkActiveTripStatus knows it's ended
            await clearOfflineActiveTrip();
            
            // Reset state
            setLiveDistance(0);
            setLiveDuration('0m');
            setLastManualMovementTime(null);
            setManualStartAddress('');
            setManualEndAddress('');
            setStats(prev => prev ? { ...prev, active_trip: null } : null);
            await resetAutoTrackingState();
            
            if (isOfflineTrackingTrip) {
              await setForceOfflineTracking(false);
              await AsyncStorage.removeItem('is_offline_tracking_trip');
              setIsOfflineTrackingTrip(false);
              setLocalForceOfflineTracking(false);
            }
            
            const autoEnabled = await isAutoTrackingEnabled();
            if (!autoEnabled) {
              console.log('[Dashboard] Stopping background tracking after auto-end manual trip because auto-tracking is disabled');
              await stopBackgroundTracking();
            }
            
            await loadData();
            
            Alert.alert(
              'Trip Auto-Ended',
              `Your trip was automatically ended after 10 minutes of no driving detected.\n\nDistance: ${liveDistance.toFixed(1)} miles`,
              [{ text: 'OK' }]
            );
          } catch (e: any) {
            console.log('[Dashboard] Error auto-ending trip:', e.message);
            // Fallback: save offline if ending online failed
            try {
              console.log('[Dashboard] Fallback: saving auto-ended trip offline...');
              const offlineTrip = await endOfflineTrip('business');
              setLiveDistance(0);
              setLiveDuration('0m');
              setLastManualMovementTime(null);
              setManualStartAddress('');
              setManualEndAddress('');
              setStats(prev => prev ? { ...prev, active_trip: null } : null);
              await resetAutoTrackingState();
              
              if (isOfflineTrackingTrip) {
                await setForceOfflineTracking(false);
                await AsyncStorage.removeItem('is_offline_tracking_trip');
                setIsOfflineTrackingTrip(false);
                setLocalForceOfflineTracking(false);
              }
              
              const autoEnabled = await isAutoTrackingEnabled();
              if (!autoEnabled) {
                console.log('[Dashboard] Stopping background tracking after auto-end manual trip fallback because auto-tracking is disabled');
                await stopBackgroundTracking();
              }
              
              await loadData();
              
              Alert.alert(
                'Trip Auto-Ended Offline (Fallback)',
                `Connection lost. Your trip was automatically saved offline.\n\nDistance: ${liveDistance.toFixed(1)} miles`,
                [{ text: 'OK' }]
              );
            } catch (fallbackErr: any) {
              console.log('[Dashboard] Fallback offline end failed:', fallbackErr.message);
            }
          }
        }
      }, 30000); // Check every 30 seconds
    } else {
      // No active manual trip - reset tracking
      if (lastManualMovementTime !== null) {
        console.log('[Dashboard] 🔄 Resetting manual movement tracking (no active manual trip)');
        setLastManualMovementTime(null);
      }
    }
    
    return () => {
      if (manualStopCheckRef.current) {
        clearInterval(manualStopCheckRef.current);
        manualStopCheckRef.current = null;
      }
    };
  }, [stats?.active_trip?.trip_id, isAutoTrip, token, lastManualMovementTime]);

  const loadOfflineStats = useCallback(async () => {
    console.log('[Dashboard] Loading and aggregating cached stats');
    try {
      const cachedJson = await AsyncStorage.getItem('cached_dashboard_stats');
      let cachedStats: Stats = cachedJson ? JSON.parse(cachedJson) : {
        monthly_miles: 0,
        monthly_deductions: 0,
        monthly_trips: 0,
        yearly_miles: 0,
        yearly_deductions: 0,
        yearly_trips: 0,
        active_trip: null,
        recent_trips: [],
        unclassified_count: 0,
        chart_data: [],
        irs_rate: 0.70
      };

      // Load all offline trips
      const offlineTrips = await getOfflineTrips();
      const unsyncedTrips = offlineTrips.filter(t => !t.synced);
      
      // Load all pending auto-tracked trips
      const pendingAutoTrips = await getPendingTrips();
      const unsyncedAutoTrips = pendingAutoTrips.filter(t => !t.synced);
      
      let offlineMiles = 0;
      let offlineDeductions = 0;
      let offlineTripsCount = unsyncedTrips.length + unsyncedAutoTrips.length;
      
      const mappedRecentTrips = unsyncedTrips.map(trip => {
        const deduction = trip.deduction_value || calculateDeduction(trip.distance, trip.classification);
        offlineMiles += trip.distance;
        offlineDeductions += deduction;
        
        return {
          trip_id: trip.id,
          start_time: trip.start_time,
          end_time: trip.end_time,
          start_lat: trip.start_lat,
          start_lng: trip.start_lng,
          end_lat: trip.end_lat,
          end_lng: trip.end_lng,
          start_address: trip.start_address || 'Offline tracked',
          end_address: trip.end_address || 'Offline tracked',
          distance: trip.distance,
          classification: trip.classification || 'unclassified',
          notes: trip.notes || 'Tracked offline',
          deduction_value: deduction,
          synced: false
        };
      });

      const mappedAutoTrips = unsyncedAutoTrips.map(trip => {
        const deduction = calculateDeduction(trip.distance, 'business'); // Auto-detected trips are business
        offlineMiles += trip.distance;
        offlineDeductions += deduction;
        
        return {
          trip_id: trip.id,
          start_time: trip.start_time,
          end_time: trip.end_time,
          start_lat: trip.start_lat,
          start_lng: trip.start_lng,
          end_lat: trip.end_lat,
          end_lng: trip.end_lng,
          start_address: trip.start_address || 'Auto-detected start',
          end_address: trip.end_address || 'Auto-detected end',
          distance: trip.distance,
          classification: 'business',
          notes: 'Auto-tracked trip',
          deduction_value: deduction,
          synced: false
        };
      });

      const aggregatedStats: Stats = {
        ...cachedStats,
        monthly_miles: cachedStats.monthly_miles + offlineMiles,
        monthly_deductions: cachedStats.monthly_deductions + offlineDeductions,
        monthly_trips: cachedStats.monthly_trips + offlineTripsCount,
        yearly_miles: cachedStats.yearly_miles + offlineMiles,
        yearly_deductions: cachedStats.yearly_deductions + offlineDeductions,
        yearly_trips: cachedStats.yearly_trips + offlineTripsCount,
        recent_trips: [...mappedRecentTrips, ...mappedAutoTrips, ...cachedStats.recent_trips].slice(0, 10),
        unclassified_count: cachedStats.unclassified_count + unsyncedTrips.filter(t => t.classification === 'unclassified').length
      };

      setStats(aggregatedStats);
    } catch (err) {
      console.warn('[Dashboard] Error aggregating offline stats:', err);
    }
  }, []);

  const loadData = useCallback(async () => {
    if (!token) return;
    
    // If offline, load from cache and dynamically aggregate offline untransmitted trips
    if (!isOnline) {
      await loadOfflineStats();
      return;
    }
    
    // If online, perform a quick sweep to sync any pending or offline trips first
    try {
      console.log('[Dashboard] Online - sweeping pending/offline trips on load...');
      await syncOfflineTrips(token, API.createTrip);
      await syncPendingTrips(token, API.createTrip);
    } catch (syncErr) {
      console.log('[Dashboard] Error sweeping queues on load:', syncErr);
    }
    
    try {
      const data = await API.getDashboardStats(token);
      setStats(data);
      // Cache the successfully retrieved clean server stats
      await AsyncStorage.setItem('cached_dashboard_stats', JSON.stringify(data));
    } catch (e: any) {
      console.warn('Dashboard load server connection error - falling back to offline mode:', e.message || e);
      await loadOfflineStats();
    }
  }, [token, isOnline, loadOfflineStats]);

  const loadInsights = useCallback(async () => {
    if (!token) return;
    try {
      const data = await API.getAIInsights(token);
      setInsights(data.insights || []);
    } catch {}
  }, [token]);

  useEffect(() => {
    const init = async () => {
      setLoading(true);
      await loadData();
      setLoading(false);
      loadInsights();
    };
    init();
  }, [loadData]);

  // Mileage limits check on app open / stats load
  const hasPromptedRef = useRef(false);

  useEffect(() => {
    if (!stats || user?.subscription_tier !== 'free') return;
    
    const checkLimits = async () => {
      const miles = stats.monthly_miles;
      if (miles >= 40.0) {
        // Stop background tracking if running
        const status = await getTrackingStatus();
        if (status.isRunning) {
          await stopBackgroundTracking();
        }
        
        if (!hasPromptedRef.current) {
          hasPromptedRef.current = true;
          Alert.alert(
            'Mileage Limit Reached',
            'Please upgrade your plan to Pro or Business or wait for a new month to continue tracking miles.',
            [
              { text: 'Upgrade Plan', onPress: () => router.push('/subscription') },
              { text: 'Cancel', style: 'cancel' }
            ]
          );
        }
      } else if (miles >= 35.0) {
        if (!hasPromptedRef.current) {
          hasPromptedRef.current = true;
          Alert.alert(
            'Limit Warning',
            ' Please you are nearing your 40 free miles limit, please upgrade to continue tracking your miles. Thanks',
            [
              { text: 'Upgrade Plan', onPress: () => router.push('/subscription') },
              { text: 'OK', style: 'default' }
            ]
          );
        }
      }
    };
    checkLimits();
  }, [stats?.monthly_miles, user?.subscription_tier]);

  // Live trip tracking - updates distance and duration in real-time
  useEffect(() => {
    const hasActiveManualTrip = stats?.active_trip && !isAutoTrip;
    
    if (!hasActiveManualTrip) {
      // Clean up when no active manual trip
      if (locationWatchRef.current) {
        locationWatchRef.current.remove();
        locationWatchRef.current = null;
      }
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
      setLiveDistance(0);
      setLiveDuration('0m');
      return;
    }

    console.log('[Dashboard] Starting manual foreground location tracking to feed background engine...');

    // Start duration timer - updates every second
    const updateDuration = () => {
      if (stats?.active_trip?.start_time) {
        const startTime = new Date(stats.active_trip.start_time).getTime();
        const diff = Date.now() - startTime;
        const totalMins = Math.floor(diff / 60000);
        const hrs = Math.floor(totalMins / 60);
        const mins = totalMins % 60;
        setLiveDuration(hrs > 0 ? `${hrs}h ${mins}m` : `${mins}m`);
      }
    };
    updateDuration();
    timerRef.current = setInterval(updateDuration, 1000);

    // Start location tracking for distance
    const startLocationTracking = async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted') return;

        locationWatchRef.current = await Location.watchPositionAsync(
          { accuracy: Location.Accuracy.High, distanceInterval: 10, timeInterval: 5000 },
          async (location) => {
            const newLat = location.coords.latitude;
            const newLng = location.coords.longitude;
            const speed = location.coords.speed || 0;
            const speedMph = speed * 2.237;
            
            if (speed >= DRIVING_SPEED_THRESHOLD) {
              setLastManualMovementTime(Date.now());
            }
            
            // Atomically update the persistent active trip coordinates
            await updateTripLocation(newLat, newLng, speed);
          }
        );
      } catch (e) {
        console.log('[Dashboard] Location tracking error:', e);
      }
    };

    if (Platform.OS !== 'web') {
      startLocationTracking();
    }

    return () => {
      if (locationWatchRef.current) {
        locationWatchRef.current.remove();
        locationWatchRef.current = null;
      }
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [stats?.active_trip?.trip_id, isAutoTrip]);

  // Foreground auto-tracking loop to ensure real-time UI updates
  useEffect(() => {
    let watchSubscription: Location.LocationSubscription | null = null;
    
    const startWatcher = async () => {
      try {
        const { status } = await Location.getForegroundPermissionsAsync();
        if (status === 'granted') {
          const autoEnabled = await isAutoTrackingEnabled();
          if (autoEnabled) {
            console.log('[Dashboard] Starting auto-tracking foreground watcher for real-time updates...');
            watchSubscription = await Location.watchPositionAsync(
              {
                accuracy: Location.Accuracy.High,
                timeInterval: 5000,
                distanceInterval: 10,
              },
              async (location) => {
                // Feed location updates to background tracking processor in the foreground
                await processLocationUpdate([location]);
              }
            );
          }
        }
      } catch (err) {
        console.log('[Dashboard] Error starting auto-tracking foreground watcher:', err);
      }
    };
    
    const hasActiveManualTrip = stats?.active_trip && !isAutoTrip;
    if (!hasActiveManualTrip && token && Platform.OS !== 'web') {
      startWatcher();
    }
    
    return () => {
      if (watchSubscription) {
        watchSubscription.remove();
        console.log('[Dashboard] Auto-tracking foreground watcher stopped');
      }
    };
  }, [token, stats?.active_trip?.trip_id, isAutoTrip]);

  const onRefresh = async () => {
    setRefreshing(true);
    await loadData();
    loadInsights();
    setRefreshing(false);
  };

  const handleStartTrip = async () => {
    if (user?.subscription_tier === 'free') {
      let currentMiles = stats?.monthly_miles || 0;
      if (!stats) {
        try {
          const cached = await AsyncStorage.getItem('cached_dashboard_stats');
          if (cached) {
            const parsed = JSON.parse(cached);
            currentMiles = parsed.monthly_miles || 0;
          }
        } catch {}
      }

      if (currentMiles >= 40.0) {
        Alert.alert(
          'Mileage Limit Reached',
          'Please upgrade your plan to Pro or Business or wait for a new month to continue tracking miles.',
          [
            { text: 'Upgrade Plan', onPress: () => router.push('/subscription') },
            { text: 'Cancel', style: 'cancel' }
          ]
        );
        return;
      } else if (currentMiles >= 35.0) {
        Alert.alert(
          'Limit Warning',
          ' Please you are nearing your 40 free miles limit, please upgrade to continue tracking your miles. Thanks',
          [
            { text: 'Upgrade Plan', onPress: () => router.push('/subscription') },
            { text: 'OK', onPress: () => runStartTripFlow() }
          ]
        );
        return;
      }
    }
    await runStartTripFlow();
  };

  const runStartTripFlow = async () => {
    setStartingTrip(true);
    try {
      // Reset auto-tracking state so it doesn't interfere with manual trip
      await resetAutoTrackingState();
      
      // Reset the manual movement time and trip start time when starting a new trip
      const now = Date.now();
      setLastManualMovementTime(now);
      setTripStartTime(now);
      
      let startLat: number | undefined;
      let startLng: number | undefined;
      let startAddress = 'Current Location';

      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status === 'granted') {
        const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
        startLat = loc.coords.latitude;
        startLng = loc.coords.longitude;
        try {
          const geo = await Location.reverseGeocodeAsync({ latitude: startLat, longitude: startLng });
          if (geo.length > 0) {
            const g = geo[0];
            startAddress = [g.street, g.city, g.region].filter(Boolean).join(', ');
          }
        } catch {}
      }

      // ALWAYS start a background manual trip instance whether online or offline
      const offlineTrip = await startOfflineTrip(startLat || 0, startLng || 0);
      await startBackgroundTracking();

      // Check if online - if not, start trip offline natively
      if (!isOnline || !token) {
        console.log('[Dashboard] Starting trip in OFFLINE mode');
        
        // Set local state to track the trip
        setLiveDistance(0);
        setLiveDuration('0m');
        
        // Inject a mock active trip into stats so the UI can render the trip banner immediately while offline
        setStats(prev => ({
          ...(prev || { monthly_miles: 0, monthly_deductions: 0, monthly_trips: 0, yearly_miles: 0, yearly_deductions: 0, yearly_trips: 0, recent_trips: [], unclassified_count: 0, chart_data: [], irs_rate: 0.70 }),
          active_trip: {
            trip_id: offlineTrip.id,
            start_time: offlineTrip.start_time,
            start_lat: startLat,
            start_lng: startLng,
            start_address: startAddress,
            distance: 0
          }
        }));
        
        Alert.alert(
          'Trip Started Offline! 🚗📱', 
          `Tracking your drive from ${startAddress}\n\nTrip will sync when you reconnect.`, 
          [{ text: 'OK' }]
        );
        return;
      }

      // Online mode - use API
      try {
        const trip = await API.createTrip(token!, { start_lat: startLat, start_lng: startLng, start_address: startAddress });
        
        // Sync server trip ID to the local current active trip!
        if (trip && trip.trip_id) {
          const currentTripStr = await AsyncStorage.getItem('current_active_trip');
          if (currentTripStr) {
            const currentTripObj = JSON.parse(currentTripStr);
            currentTripObj.id = trip.trip_id;
            await AsyncStorage.setItem('current_active_trip', JSON.stringify(currentTripObj));
            console.log('[Dashboard] Successfully synced server trip ID in storage:', trip.trip_id);
          }
          
          // Inject correct server trip ID immediately to prevent race conditions during polling
          setStats(prev => ({
            ...(prev || { monthly_miles: 0, monthly_deductions: 0, monthly_trips: 0, yearly_miles: 0, yearly_deductions: 0, yearly_trips: 0, recent_trips: [], unclassified_count: 0, chart_data: [], irs_rate: 0.70 }),
            active_trip: {
              trip_id: trip.trip_id,
              start_time: new Date().toISOString(),
              start_lat: startLat || 0,
              start_lng: startLng || 0,
              start_address: startAddress,
              distance: 0
            }
          }));
        }

        await loadData();
        Alert.alert('Trip Started! 🚗', `Tracking your drive from ${startAddress}`, [{ text: 'OK' }]);
      } catch (apiError: any) {
        console.log('[Dashboard] API Start trip error:', apiError.message);
        // Fallback to offline start if network failed
        if (apiError.message?.includes('network') || apiError.message?.includes('Network') || apiError.message?.includes('Timeout') || apiError.message?.includes('timeout')) {
          setLiveDistance(0);
          setLiveDuration('0m');
          
          // Inject a mock active trip into stats so the UI can render the trip banner immediately while offline
          setStats(prev => ({
            ...(prev || { monthly_miles: 0, monthly_deductions: 0, monthly_trips: 0, yearly_miles: 0, yearly_deductions: 0, yearly_trips: 0, recent_trips: [], unclassified_count: 0, chart_data: [], irs_rate: 0.70 }),
            active_trip: {
              trip_id: offlineTrip.id,
              start_time: offlineTrip.start_time,
              start_lat: startLat,
              start_lng: startLng,
              start_address: startAddress,
              distance: 0
            }
          }));
          
          Alert.alert('Trip Started Offline! 🚗📱', `Network unreachable. Tracking your drive from ${startAddress}\n\nTrip will sync when you reconnect.`, [{ text: 'OK' }]);
        } else {
          Alert.alert('Error', apiError.message || 'Could not start trip');
        }
      }
    } catch (e: any) {
      console.log('[Dashboard] Start trip process error:', e.message);
      Alert.alert('Error', e.message || 'Could not start trip');
    } finally {
      setStartingTrip(false);
    }
  };

  const handleEndTrip = async () => {
    // Handle both manual and auto trips (Issue #4 fix)
    const isManualTrip = stats?.active_trip;
    
    if (!isManualTrip && !isAutoTrip) return;
    
    const cleanupOfflineTrackingTrip = async () => {
      try {
        await setForceOfflineTracking(false);
        await AsyncStorage.removeItem('is_offline_tracking_trip');
        setIsOfflineTrackingTrip(false);
        setLocalForceOfflineTracking(false);
      } catch (err) {
        console.log('[Dashboard] Error cleaning up offline tracking trip:', err);
      }
    };
    
    setEndingTrip(true);
    try {
      let endLat: number | undefined;
      let endLng: number | undefined;
      let endAddress = 'Destination';
      
      // Use the accumulated liveDistance instead of straight-line calculation
      // liveDistance is tracked in real-time during the trip via GPS
      let distance = liveDistance;

      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status === 'granted') {
        const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
        endLat = loc.coords.latitude;
        endLng = loc.coords.longitude;
        try {
          const geo = await Location.reverseGeocodeAsync({ latitude: endLat, longitude: endLng });
          if (geo.length > 0) {
            const g = geo[0];
            endAddress = [g.street, g.city, g.region].filter(Boolean).join(', ');
          }
        } catch {}

        // If no liveDistance was recorded (e.g., on web or GPS failed), 
        // fall back to straight-line distance as minimum
        if (distance === 0 && isManualTrip && stats?.active_trip?.start_lat && stats?.active_trip?.start_lng) {
          distance = haversineDistance(stats.active_trip.start_lat, stats.active_trip.start_lng, endLat, endLng);
          console.log('[Dashboard] Using fallback straight-line distance:', distance);
        }
      }

      console.log('[Dashboard] Ending trip with distance:', distance, 'miles, online:', isOnline, 'isAutoTrip:', isAutoTrip);
      
      // Handle Auto Trip End (Issue #4 fix)
      if (isAutoTrip && !isManualTrip) {
        console.log('[Dashboard] Ending AUTO trip manually');
        
        // Save cooldown timestamp in AsyncStorage directly from dashboard too to ensure immediate effect
        await AsyncStorage.setItem('last_auto_trip_ended_time', Date.now().toString());
        
        // Stop background tracking to end the current auto trip
        await stopBackgroundTracking();
        
        // Reset state
        setIsAutoTrip(false);
        setLiveDistance(0);
        setLiveDuration('0m');
        setAutoTripAddress('Current Location');
        setAutoStartAddress('');
        setAutoEndAddress('');
        
        Alert.alert(
          'Auto Trip Ended ✅',
          `Your ${distance.toFixed(1)} mile auto-tracked trip has been saved.`,
          [{ text: 'OK' }]
        );
        
        // Refresh dashboard to show updated stats
        await loadData();
        
        // CRITICAL: Restart background tracking to continue monitoring for new drives
        // This ensures auto-tracking remains "always on" even after manual stop
        console.log('[Dashboard] Restarting background tracking for continuous monitoring...');
        setTimeout(async () => {
          try {
            const masterEnabled = await AsyncStorage.getItem('master_tracking_enabled');
            const autoEnabled = await isAutoTrackingEnabled();
            if (masterEnabled !== 'false' && autoEnabled) {
              await startBackgroundTracking();
              console.log('[Dashboard] Background tracking restarted successfully');
            } else {
              console.log('[Dashboard] Background tracking restart bypassed: master tracking or auto tracking is disabled');
            }
          } catch (e) {
            console.log('[Dashboard] Failed to restart background tracking:', e);
          }
        }, 2000);
        
        await loadData();
        return;
      }
      
      // Handle Manual Trip End
      // Check if online - if not, save locally for later sync
      if (!isOnline || !token) {
        console.log('[Dashboard] Offline - saving trip locally for later sync');
        
        // Save and end the trip offline
        const offlineTrip = await endOfflineTrip('business');
        
        // Reset live tracking state
        setLiveDistance(0);
        setLiveDuration('0m');
        setManualStartAddress('');
        setManualEndAddress('');
        
        if (offlineTrip) {
          console.log('[Dashboard] Saved offline trip:', offlineTrip.id);
          Alert.alert(
            'Trip Saved Offline 📱',
            `Your ${offlineTrip.distance.toFixed(1)} mile trip has been saved. It will sync automatically when you reconnect.`,
            [{ text: 'OK' }]
          );
        }
        
        // Reset active trip from stats explicitly so the banner goes away
        setStats(prev => prev ? { ...prev, active_trip: null } : null);
        
        if (isOfflineTrackingTrip) {
          await cleanupOfflineTrackingTrip();
        }
        
        const autoEnabled = await isAutoTrackingEnabled();
        if (!autoEnabled) {
          console.log('[Dashboard] Stopping background tracking after offline manual trip end because auto-tracking is disabled');
          await stopBackgroundTracking();
        }
        
        await loadData();
        return;
      }
      
      // ==============================================================
      // UNIFIED BACKGROUND ENGINE: PULL TRUE LOCKED-SCREEN DISTANCE
      // ==============================================================
      const backgroundManualTrip = await getOfflineActiveTrip();
      
      let backgroundDistance = 0;
      if (backgroundManualTrip && backgroundManualTrip.distance > 0) {
         backgroundDistance = backgroundManualTrip.distance;
         console.log('[Dashboard] Picked up true background tracked manual distance:', backgroundDistance);
      }
      
      // Override standard liveDistance ONLY if background engine accumulated more miles (which happens reliably when screen is locked)
      if (backgroundDistance > distance) {
         distance = backgroundDistance;
      }
      
      // Clean up the background tracking storage state without duplicating the trip into the offline sync queue!
      await clearOfflineActiveTrip();
      // ==============================================================

      // Online - send to server
      if (stats?.active_trip) {
        await API.endTrip(token!, stats.active_trip.trip_id, { end_lat: endLat, end_lng: endLng, end_address: endAddress, distance, classification: 'business' });
      }
      
      // Reset live tracking state
      setLiveDistance(0);
      setLiveDuration('0m');
      setManualStartAddress('');
      setManualEndAddress('');
      
      // Reset auto-tracking state so next auto trip starts fresh from 0 miles
      await resetAutoTrackingState();
      
      if (isOfflineTrackingTrip) {
        await cleanupOfflineTrackingTrip();
      }
      
      const autoEnabled = await isAutoTrackingEnabled();
      if (!autoEnabled) {
        console.log('[Dashboard] Stopping background tracking after manual trip end because auto-tracking is disabled');
        await stopBackgroundTracking();
      }
      
      await loadData();
      if (stats?.active_trip) {
        router.push(`/trip/${stats.active_trip.trip_id}`);
      } else {
        router.push('/(tabs)/dashboard');
      }
    } catch (e: any) {
      console.log('[Dashboard] End trip error:', e.message);
      
      // If the API call failed (maybe went offline mid-request), save locally
      if (!isOnline || e.message?.includes('network') || e.message?.includes('Network') || e.message?.includes('Timeout') || e.message?.includes('timeout')) {
        try {
          const offlineTrip = await endOfflineTrip('business');
          
          if (offlineTrip) {
            Alert.alert(
              'Trip Saved Offline',
              'Connection lost. Your trip has been saved and will sync when connected.',
              [{ text: 'OK' }]
            );
          }
          
          // Clear active trip from stats explicitly so the banner goes away
          setStats(prev => prev ? { ...prev, active_trip: null } : null);
          setManualStartAddress('');
          setManualEndAddress('');
          
          if (isOfflineTrackingTrip) {
            await cleanupOfflineTrackingTrip();
          }
          
          const autoEnabled = await isAutoTrackingEnabled();
          if (!autoEnabled) {
            console.log('[Dashboard] Stopping background tracking after fallback manual trip end because auto-tracking is disabled');
            await stopBackgroundTracking();
          }
          
          await loadData();
          return;
        } catch (saveError) {
          console.log('[Dashboard] Failed to save offline:', saveError);
        }
      }
      
      Alert.alert('Error', e.message || 'Could not end trip');
    } finally {
      setEndingTrip(false);
    }
  };

  const handleSeedData = async () => {
    if (!token) return;
    try {
      await API.seedTrips(token);
      await loadData();
      Alert.alert('Sample Data Added', '10 sample trips have been added to your account!');
    } catch (e: any) {
      Alert.alert('Error', e.message);
    }
  };

  if (loading) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <ActivityIndicator size="large" color={Colors.brand.primary} style={{ marginTop: 60 }} />
      </View>
    );
  }

  const insightTypeColor: Record<string, string> = { savings: Colors.brand.primary, warning: Colors.brand.accent, tip: Colors.brand.secondary };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.brand.primary} />}
        contentContainerStyle={{ paddingBottom: 150 }}
      >
        {/* Header */}
        <View style={styles.header}>
          <View>
            <Text style={styles.greeting}>Good {getGreeting()}, {user?.name?.split(' ')[0] || 'Driver'} 👋</Text>
            <Text style={styles.headerSub}>Your mileage intelligence hub</Text>
          </View>
          <TouchableOpacity testID="ai-assistant-fab" style={styles.aiBubble} onPress={() => router.push('/ai/assistant')}>
            <Feather name="zap" size={18} color="#FFF" />
          </TouchableOpacity>
        </View>

        {/* Offline Status Banner */}
        {!isOnline && (
          <View style={styles.offlineBanner}>
            <Feather name="wifi-off" size={16} color="#FFF" />
            <Text style={styles.offlineBannerText}>Offline Mode - Trips will sync when connected</Text>
          </View>
        )}

        {/* Inspiration Banner - Daily Motivational Messages with Ticker Scroll */}
        <Animated.View style={[
          styles.inspirationBanner,
          {
            minHeight: isMagnified ? 140 : 70,
            backgroundColor: inspirationColor + '22',
          }
        ]}>
          <View style={styles.inspirationIconContainer}>
            <Feather name="sun" size={isMagnified ? 28 : 20} color={inspirationColor} />
          </View>
          <ScrollView 
            horizontal={!isMagnified}
            showsHorizontalScrollIndicator={false}
            showsVerticalScrollIndicator={false}
            style={styles.inspirationScrollContainer}
            contentContainerStyle={isMagnified ? styles.inspirationScrollContentMagnified : styles.inspirationScrollContent}
          >
            <Text 
              style={[
                styles.inspirationText,
                {
                  color: inspirationColor,
                  fontSize: isMagnified ? 22 : 15,
                  lineHeight: isMagnified ? 32 : 22,
                  fontWeight: isMagnified ? '700' : '600',
                }
              ]}
            >
              {isMagnified 
                ? (allMessages[currentMessageIndex] || inspirationMessage)
                : `✨ ${allMessages[currentMessageIndex] || inspirationMessage} ✨`
              }
            </Text>
          </ScrollView>
        </Animated.View>

        {/* Active Trip Banner - Shows for both manual and auto trips */}
        {(stats?.active_trip || isAutoTrip) ? (
          <View testID="active-trip-banner" style={[
            styles.activeTripCard,
            isAutoTrip && !stats?.active_trip && styles.autoTripCard,
            isOfflineTrackingTrip && styles.offlineTrackingTripCard
          ]}>
            <View style={styles.activeTripPulse}>
              <View style={[
                styles.pulseOuter,
                isAutoTrip && !stats?.active_trip && styles.autoPulseOuter,
                isOfflineTrackingTrip && styles.offlinePulseOuter
              ]}>
                <View style={[
                  styles.pulseInner,
                  isAutoTrip && !stats?.active_trip && styles.autoPulseInner,
                  isOfflineTrackingTrip && styles.offlinePulseInner
                ]} />
              </View>
              <Text style={[
                styles.activeTripLabel,
                isAutoTrip && !stats?.active_trip && styles.autoTripLabel,
                isOfflineTrackingTrip && styles.offlineTripLabel
              ]}>
                {isAutoTrip && !stats?.active_trip 
                  ? 'AUTO TRACKER IN PROGRESS' 
                  : isOfflineTrackingTrip 
                    ? 'OFFLINE TRACKING IN PROGRESS' 
                    : 'TRIP IN PROGRESS'}
              </Text>
            </View>
            
            {/* Location Display - Shows start and current/end location */}
            <View style={styles.tripLocationContainer}>
              <View style={styles.tripLocationRow}>
                <Text style={styles.tripLocationLabel}>
                  {isAutoTrip && !stats?.active_trip ? 'Auto-detect start' : 'Start'}
                </Text>
                <Text style={styles.tripLocationValue} numberOfLines={1}>
                  [{stats?.active_trip?.start_address && stats?.active_trip?.start_address !== 'Current Location' ? stats.active_trip.start_address : (manualStartAddress || autoStartAddress || autoTripAddress || 'Current Location')}]
                </Text>
              </View>
              <View style={styles.tripLocationRow}>
                <Text style={styles.tripLocationLabel}>
                  {isAutoTrip && !stats?.active_trip ? 'Auto-detect end' : 'Current'}
                </Text>
                <Text style={styles.tripLocationValue} numberOfLines={1}>
                  [{manualEndAddress || autoEndAddress || autoTripAddress || 'Tracking...'}]
                </Text>
              </View>
            </View>
            
            <View style={styles.activeTripStats}>
              <View style={styles.activeTripStat}>
                <Feather 
                  name="navigation" 
                  size={14} 
                  color={
                    isOfflineTrackingTrip 
                      ? '#F59E0B' 
                      : (isAutoTrip && !stats?.active_trip ? '#60A5FA' : Colors.brand.primary)
                  } 
                />
                <Text style={[
                  styles.activeTripStatText, 
                  isAutoTrip && !stats?.active_trip && styles.autoTripStatText,
                  isOfflineTrackingTrip && styles.offlineTripStatText
                ]}>
                  {liveDistance.toFixed(1)} {distanceUnitFull}
                </Text>
              </View>
              <View style={styles.activeTripStatDivider} />
              <View style={styles.activeTripStat}>
                <Feather name="clock" size={14} color={isOfflineTrackingTrip ? '#F59E0B' : Colors.brand.secondary} />
                <Text style={[
                  styles.activeTripStatText,
                  isOfflineTrackingTrip && styles.offlineTripStatText
                ]}>{liveDuration}</Text>
              </View>
            </View>
            <TouchableOpacity 
              testID="end-trip-btn" 
              style={[
                styles.endTripBtn,
                isOfflineTrackingTrip && styles.offlineEndTripBtn
              ]} 
              onPress={handleEndTrip} 
              disabled={endingTrip}
            >
              {endingTrip ? <ActivityIndicator color="#FFF" size="small" /> : (
                <><Feather name="square" size={16} color="#FFF" /><Text style={styles.endTripBtnText}>End Trip</Text></>
              )}
            </TouchableOpacity>
          </View>
        ) : (
          <TouchableOpacity 
            testID="start-trip-btn" 
            style={[
              styles.startTripCard,
              !masterTrackingEnabled && { opacity: 0.5 }
            ]} 
            onPress={() => {
              if (!masterTrackingEnabled) {
                Alert.alert('Tracking Stopped', 'All tracking processes are currently stopped. Please press "Start tracking" below to enable tracking.');
                return;
              }
              handleStartTrip();
            }} 
            disabled={startingTrip} 
            activeOpacity={0.85}
          >
            {startingTrip ? (
              <ActivityIndicator color={Colors.bg.primary} size="small" />
            ) : (
              <>
                <View style={styles.startTripIcon}><Feather name="play" size={22} color={Colors.bg.primary} /></View>
                <View style={styles.startTripText}>
                  <Text style={styles.startTripTitle}>Start Drive</Text>
                  <Text style={styles.startTripSub}>GPS will track your route automatically</Text>
                </View>
                <Feather name="chevron-right" size={20} color={Colors.bg.primary + 'AA'} />
              </>
            )}
          </TouchableOpacity>
        )}

        {/* Stats Row */}
        <View testID="stats-row" style={styles.statsRow}>
          <View style={[styles.statCard, { borderColor: Colors.brand.primary + '40' }]}>
            <Text style={styles.statValue}>{stats?.monthly_miles?.toFixed(1) || '0.0'}</Text>
            <Text style={styles.statLabel}>{country === 'CAN' || country === 'AUS' ? 'Kilometres This Month' : 'Miles This Month'}</Text>
          </View>
          <View style={[styles.statCard, { borderColor: Colors.brand.secondary + '40' }]}>
            <Text style={[styles.statValue, { color: Colors.brand.primary }]}>{currencySymbol}{stats?.monthly_deductions?.toFixed(2) || '0.00'}</Text>
            <Text style={styles.statLabel}>Deductions</Text>
          </View>
          <View style={[styles.statCard, { borderColor: Colors.brand.warning + '40' }]}>
            <Text style={styles.statValue}>{stats?.monthly_trips || 0}</Text>
            <Text style={styles.statLabel}>Trips</Text>
          </View>
        </View>

        {/* Yearly Summary */}
        <View style={styles.yearlyCard}>
          <View style={styles.yearlySummary}>
            <View>
              <Text style={styles.yearlyTitle}>{new Date().getFullYear()} YTD Summary</Text>
              <Text style={styles.yearlyMiles}>{stats?.yearly_miles?.toFixed(1) || '0.0'} {distanceUnitFull}</Text>
            </View>
            <View style={styles.yearlyRight}>
              <Text style={styles.yearlyDeduction}>{currencySymbol}{stats?.yearly_deductions?.toFixed(2) || '0.00'}</Text>
              <Text style={styles.yearlyDeductionLabel}>Tax Deduction</Text>
            </View>
          </View>
          {stats?.chart_data && stats.chart_data.length > 0 && (
            <BarChart data={stats.chart_data} />
          )}
        </View>

        {/* Unclassified Alert */}
        {stats && stats.unclassified_count > 0 && (
          <TouchableOpacity testID="unclassified-alert" style={styles.alertCard} onPress={() => router.push('/(tabs)/trips')}>
            <Feather name="alert-circle" size={18} color={Colors.brand.warning} />
            <Text style={styles.alertText}>
              {stats.unclassified_count} trip{stats.unclassified_count !== 1 ? 's' : ''} need classification
            </Text>
            <Feather name="chevron-right" size={16} color={Colors.brand.warning} />
          </TouchableOpacity>
        )}

        {/* AI Insights */}
        {insights.length > 0 && (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Feather name="zap" size={16} color={Colors.brand.primary} />
              <Text style={styles.sectionTitle}>AI Insights</Text>
            </View>
            {insights.map((insight, i) => (
              <View key={i} testID={`insight-${i}`} style={[styles.insightCard, { borderLeftColor: insightTypeColor[insight.type] || Colors.brand.secondary }]}>
                <Text style={styles.insightTitle}>{insight.title}</Text>
                <Text style={styles.insightDesc}>{insight.description}</Text>
              </View>
            ))}
          </View>
        )}

        {/* Recent Trips */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Recent Trips</Text>
            <TouchableOpacity testID="view-all-trips" onPress={() => router.push('/(tabs)/trips')}>
              <Text style={styles.seeAll}>See All</Text>
            </TouchableOpacity>
          </View>
          {stats?.recent_trips && stats.recent_trips.length > 0 ? (
            stats.recent_trips.map((trip: any) => (
              <TouchableOpacity key={trip.trip_id} testID={`recent-trip-${trip.trip_id}`} style={styles.recentTripRow} onPress={() => router.push(`/trip/${trip.trip_id}`)}>
                <View style={[styles.recentDot, { backgroundColor: ClassificationColor[trip.classification] || Colors.text.tertiary }]} />
                <View style={styles.recentInfo}>
                  <Text style={styles.recentRoute} numberOfLines={1}>{trip.start_address || 'Start'} → {trip.end_address || 'End'}</Text>
                  <Text style={styles.recentMeta}>{trip.distance?.toFixed(1)} {distanceUnit} · {formatDate(trip.start_time)}</Text>
                </View>
                <Text style={[styles.recentDeduction, { color: trip.deduction_value > 0 ? Colors.brand.primary : Colors.text.tertiary }]}>
                  {trip.deduction_value > 0 ? `${currencySymbol}${trip.deduction_value?.toFixed(2)}` : trip.classification}
                </Text>
              </TouchableOpacity>
            ))
          ) : (
            <View style={styles.emptyTrips}>
              <Text style={styles.emptyText}>No trips yet.</Text>
              <TouchableOpacity testID="add-sample-data-btn" style={styles.sampleBtn} onPress={handleSeedData}>
                <Text style={styles.sampleBtnText}>Add Sample Data</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>

        {/* Quick Actions */}
        <View style={styles.quickActions}>
          <TouchableOpacity testID="quick-expense-btn" style={styles.quickActionBtn} onPress={() => router.push('/(tabs)/expenses')}>
            <Feather name="credit-card" size={20} color={Colors.brand.secondary} />
            <Text style={styles.quickActionText}>Scan Receipt</Text>
          </TouchableOpacity>
          <TouchableOpacity testID="quick-report-btn" style={styles.quickActionBtn} onPress={() => router.push('/(tabs)/reports')}>
            <Feather name="file-text" size={20} color={Colors.brand.warning} />
            <Text style={styles.quickActionText}>View Reports</Text>
          </TouchableOpacity>
          <TouchableOpacity testID="quick-upgrade-btn" style={styles.quickActionBtn} onPress={() => router.push('/subscription')}>
            <Feather name="star" size={20} color={Colors.brand.accent} />
            <Text style={styles.quickActionText}>Upgrade</Text>
          </TouchableOpacity>
        </View>

        {/* Offline Tracking Action */}
        <TouchableOpacity
          testID="offline-tracking-btn"
          style={[
            styles.offlineActionBtn,
            (stats?.active_trip || isAutoTrip || !masterTrackingEnabled) ? { opacity: 0.5 } : null
          ]}
          disabled={!!(stats?.active_trip || isAutoTrip)}
          onPress={async () => {
            if (!masterTrackingEnabled) {
              Alert.alert('Tracking Stopped', 'All tracking processes are currently stopped. Please press "Start tracking" below to enable tracking.');
              return;
            }
            if (stats?.active_trip || isAutoTrip) {
              Alert.alert('Trip in Progress', 'Please end the current active trip before starting offline tracking.');
              return;
            }
            try {
              // Enable forced offline tracking
              await setForceOfflineTracking(true);
              await AsyncStorage.setItem('is_offline_tracking_trip', 'true');
              setIsOfflineTrackingTrip(true);
              setLocalForceOfflineTracking(true);
              
              // Trigger starting drive
              await handleStartTrip();
            } catch (err: any) {
              console.log('[Dashboard] Error starting offline tracking:', err);
              Alert.alert('Error', err.message || 'Could not start offline tracking');
            }
          }}
        >
          <Feather name="wifi-off" size={20} color="#F59E0B" />
          <View style={{ flex: 1, flexDirection: 'column', gap: 2 }}>
            <Text style={styles.offlineActionText}>Offline tracking</Text>
            <Text style={styles.offlineActionSub}>Bypass cellular data during drive (allows WiFi)</Text>
          </View>
          <Feather name="chevron-right" size={16} color="#F59E0B" />
        </TouchableOpacity>

        {/* Master Tracking Toggle */}
        <TouchableOpacity
          testID="master-tracking-toggle-btn"
          style={[
            styles.masterTrackingBtn,
            { borderColor: masterTrackingEnabled ? 'rgba(239, 68, 68, 0.3)' : 'rgba(16, 185, 129, 0.3)' }
          ]}
          onPress={() => {
            if (masterTrackingEnabled) {
              // Confirm stop all tracking
              Alert.alert(
                'Stop Tracking? 🛑',
                'This will end any active drives and fully disable all background auto-tracking and manual tracking until you re-enable it.',
                [
                  { text: 'Cancel', style: 'cancel' },
                  {
                    text: 'Stop Tracking',
                    style: 'destructive',
                    onPress: async () => {
                      try {
                        // 1. If a manual or auto trip is active, end it
                        if (stats?.active_trip || isAutoTrip) {
                          console.log('[Dashboard] Master stop - terminating active drive before disabling tracking...');
                          await handleEndTrip();
                        }
                        
                        // 2. Disable tracking in AsyncStorage
                        await AsyncStorage.setItem('master_tracking_enabled', 'false');
                        
                        // 3. Stop background tracking engine
                        await stopBackgroundTracking();
                        
                        // 4. Update state
                        setMasterTrackingEnabled(false);
                        
                        Alert.alert('Tracking Stopped ✅', 'All mileage tracking processes have been disabled.');
                      } catch (err: any) {
                        console.log('[Dashboard] Error stopping master tracking:', err);
                      }
                    }
                  }
                ]
              );
            } else {
              // Confirm start tracking
              Alert.alert(
                'Start Tracking? 🟢',
                'This will restore and activate all mileage tracking features (including background auto-tracking if it was enabled).',
                [
                  { text: 'Cancel', style: 'cancel' },
                  {
                    text: 'Start Tracking',
                    onPress: async () => {
                      try {
                        // 1. Enable tracking in AsyncStorage
                        await AsyncStorage.setItem('master_tracking_enabled', 'true');
                        
                        // 2. Set state
                        setMasterTrackingEnabled(true);
                        
                        // 3. Restart background tracking if auto-tracking was enabled
                        const autoEnabled = await isAutoTrackingEnabled();
                        if (autoEnabled) {
                          console.log('[Dashboard] Master start - restoring background auto-tracking...');
                          await startBackgroundTracking();
                        }
                        
                        Alert.alert('Tracking Restored ✅', 'Mileage tracking processes are now active.');
                      } catch (err: any) {
                        console.log('[Dashboard] Error starting master tracking:', err);
                      }
                    }
                  }
                ]
              );
            }
          }}
        >
          <Feather 
            name={masterTrackingEnabled ? "pause-circle" : "play-circle"} 
            size={20} 
            color={masterTrackingEnabled ? "#EF4444" : "#10B981"} 
          />
          <View style={{ flex: 1, flexDirection: 'column', gap: 2 }}>
            <Text style={[
              styles.masterTrackingText,
              { color: masterTrackingEnabled ? "#EF4444" : "#10B981" }
            ]}>
              {masterTrackingEnabled ? "Stop tracking" : "Start tracking"}
            </Text>
            <Text style={styles.masterTrackingSub}>
              {masterTrackingEnabled 
                ? "Turn off all auto & manual mileage tracking" 
                : "Enable all auto & manual mileage tracking"}
            </Text>
          </View>
          <Feather 
            name="chevron-right" 
            size={16} 
            color={masterTrackingEnabled ? "#EF4444" : "#10B981"} 
          />
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

// haversineDistance defined at the top of the file

function getGreeting(): string {
  const h = new Date().getHours();
  if (h < 12) return 'morning';
  if (h < 17) return 'afternoon';
  return 'evening';
}

function formatDate(dateStr: string): string {
  try { return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }); }
  catch { return dateStr; }
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bg.primary },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: Spacing.screen, paddingVertical: Spacing.lg },
  greeting: { color: Colors.text.primary, fontSize: FontSize.lg, fontWeight: '700' },
  headerSub: { color: Colors.text.tertiary, fontSize: FontSize.xs, marginTop: 2 },
  aiBubble: { width: 44, height: 44, borderRadius: 22, backgroundColor: Colors.brand.secondary, alignItems: 'center', justifyContent: 'center', ...Shadow.sm },
  activeTripCard: { marginHorizontal: Spacing.screen, backgroundColor: Colors.brand.accent + '15', borderRadius: Radius.xl, padding: 16, borderWidth: 1, borderColor: Colors.brand.accent + '40', marginBottom: 12 },
  activeTripPulse: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  pulseOuter: { width: 16, height: 16, borderRadius: 8, backgroundColor: Colors.brand.accent + '30', alignItems: 'center', justifyContent: 'center' },
  pulseInner: { width: 8, height: 8, borderRadius: 4, backgroundColor: Colors.brand.accent },
  activeTripLabel: { color: Colors.brand.accent, fontSize: FontSize.xs, fontWeight: '800', letterSpacing: 1 },
  activeTripRoute: { color: Colors.text.primary, fontSize: FontSize.base, fontWeight: '600', marginBottom: 8 },
  activeTripStats: { flexDirection: 'row', alignItems: 'center', marginBottom: 12, backgroundColor: Colors.bg.primary + '30', borderRadius: Radius.md, padding: 10 },
  activeTripStat: { flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1, justifyContent: 'center' },
  activeTripStatText: { color: Colors.text.primary, fontSize: FontSize.md, fontWeight: '700' },
  activeTripStatDivider: { width: 1, height: 20, backgroundColor: Colors.border },
  activeTripTime: { color: Colors.text.secondary, fontSize: FontSize.sm, marginBottom: 12 },
  endTripBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: Colors.brand.accent, borderRadius: Radius.md, paddingVertical: 10 },
  endTripBtnText: { color: '#FFF', fontWeight: '700', fontSize: FontSize.base },
  startTripCard: { marginHorizontal: Spacing.screen, backgroundColor: Colors.brand.primary, borderRadius: Radius.xl, padding: 16, flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 12, ...Shadow.md },
  startTripIcon: { width: 44, height: 44, borderRadius: 22, backgroundColor: Colors.bg.primary + '20', alignItems: 'center', justifyContent: 'center' },
  startTripText: { flex: 1 },
  startTripTitle: { color: Colors.bg.primary, fontSize: FontSize.md, fontWeight: '800' },
  startTripSub: { color: Colors.bg.primary + 'AA', fontSize: FontSize.xs, marginTop: 2 },
  statsRow: { flexDirection: 'row', paddingHorizontal: Spacing.screen, gap: 10, marginBottom: 12 },
  statCard: { flex: 1, backgroundColor: Colors.bg.secondary, borderRadius: Radius.lg, padding: 12, borderWidth: 1, alignItems: 'center' },
  statValue: { color: Colors.text.primary, fontSize: FontSize.lg, fontWeight: '800' },
  statLabel: { color: Colors.text.tertiary, fontSize: 10, marginTop: 2, textAlign: 'center' },
  yearlyCard: { marginHorizontal: Spacing.screen, backgroundColor: Colors.bg.secondary, borderRadius: Radius.xl, padding: 16, borderWidth: 1, borderColor: Colors.border, marginBottom: 12 },
  yearlySummary: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 },
  yearlyTitle: { color: Colors.text.tertiary, fontSize: FontSize.xs, marginBottom: 4 },
  yearlyMiles: { color: Colors.text.primary, fontSize: FontSize.xl, fontWeight: '800' },
  yearlyRight: { alignItems: 'flex-end' },
  yearlyDeduction: { color: Colors.brand.primary, fontSize: FontSize.xl, fontWeight: '800' },
  yearlyDeductionLabel: { color: Colors.text.tertiary, fontSize: FontSize.xs },
  alertCard: { marginHorizontal: Spacing.screen, flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: Colors.brand.warningDim, borderRadius: Radius.md, padding: 12, borderWidth: 1, borderColor: Colors.brand.warning + '40', marginBottom: 12 },
  alertText: { flex: 1, color: Colors.brand.warning, fontSize: FontSize.sm, fontWeight: '600' },
  section: { paddingHorizontal: Spacing.screen, marginBottom: 16 },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  sectionTitle: { color: Colors.text.primary, fontSize: FontSize.md, fontWeight: '700' },
  seeAll: { color: Colors.brand.primary, fontSize: FontSize.sm },
  insightCard: { backgroundColor: Colors.bg.secondary, borderRadius: Radius.md, padding: 12, borderLeftWidth: 3, marginBottom: 8 },
  insightTitle: { color: Colors.text.primary, fontSize: FontSize.sm, fontWeight: '700', marginBottom: 2 },
  insightDesc: { color: Colors.text.secondary, fontSize: FontSize.xs },
  recentTripRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: Colors.border },
  recentDot: { width: 10, height: 10, borderRadius: 5 },
  recentInfo: { flex: 1 },
  recentRoute: { color: Colors.text.primary, fontSize: FontSize.sm, fontWeight: '500' },
  recentMeta: { color: Colors.text.tertiary, fontSize: FontSize.xs, marginTop: 2 },
  recentDeduction: { fontSize: FontSize.sm, fontWeight: '600' },
  emptyTrips: { alignItems: 'center', paddingVertical: 20 },
  emptyText: { color: Colors.text.tertiary, marginBottom: 12 },
  sampleBtn: { backgroundColor: Colors.brand.primaryDim, borderRadius: Radius.md, paddingHorizontal: 16, paddingVertical: 8, borderWidth: 1, borderColor: Colors.brand.primary + '40' },
  sampleBtnText: { color: Colors.brand.primary, fontWeight: '600', fontSize: FontSize.sm },
  quickActions: { flexDirection: 'row', paddingHorizontal: Spacing.screen, gap: 10, marginBottom: 8 },
  quickActionBtn: { flex: 1, backgroundColor: Colors.bg.secondary, borderRadius: Radius.lg, padding: 14, alignItems: 'center', gap: 6, borderWidth: 1, borderColor: Colors.border },
  quickActionText: { color: Colors.text.secondary, fontSize: FontSize.xs, fontWeight: '600', textAlign: 'center' },
  offlineBanner: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    gap: 8, 
    marginHorizontal: Spacing.screen, 
    backgroundColor: Colors.brand.warning, 
    borderRadius: Radius.md, 
    padding: 12, 
    marginBottom: 12 
  },
  offlineBannerText: { color: '#FFF', fontSize: FontSize.sm, fontWeight: '600', flex: 1 },
  syncBanner: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    gap: 8, 
    marginHorizontal: Spacing.screen, 
    backgroundColor: Colors.brand.secondary, 
    borderRadius: Radius.md, 
    padding: 12, 
    marginBottom: 12 
  },
  syncBannerText: { color: '#FFF', fontSize: FontSize.sm, fontWeight: '600', flex: 1 },
  syncNowBtn: { backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: Radius.sm, paddingHorizontal: 12, paddingVertical: 6 },
  syncNowText: { color: '#FFF', fontSize: FontSize.xs, fontWeight: '700' },
  // Auto-trip light blue styles
  autoTripCard: { 
    borderColor: '#60A5FA40',
    backgroundColor: '#1E3A5F',
  },
  autoTripLabel: { 
    color: '#60A5FA',
  },
  autoPulseOuter: { 
    backgroundColor: '#60A5FA30',
  },
  autoPulseInner: { 
    backgroundColor: '#60A5FA',
  },
  autoTripStatText: { 
    color: '#60A5FA',
  },
  // Inspiration banner styles
  inspirationBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginHorizontal: Spacing.screen,
    borderRadius: Radius.lg,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    overflow: 'hidden',
  },
  inspirationIconContainer: {
    padding: 4,
  },
  inspirationScrollContainer: {
    flex: 1,
  },
  inspirationScrollContent: {
    alignItems: 'center',
  },
  inspirationScrollContentMagnified: {
    paddingVertical: 8,
  },
  inspirationText: {
    fontWeight: '600',
    fontStyle: 'italic',
  },
  // Trip location styles
  tripLocationContainer: {
    marginVertical: 8,
    gap: 4,
  },
  tripLocationRow: {
    flexDirection: 'column',
  },
  tripLocationLabel: {
    color: Colors.text.tertiary,
    fontSize: FontSize.xs,
    fontWeight: '500',
  },
  tripLocationValue: {
    color: Colors.text.secondary,
    fontSize: FontSize.sm,
    fontStyle: 'italic',
  },
  // Offline-trip orange styles
  offlineTrackingTripCard: {
    borderColor: 'rgba(245, 158, 11, 0.4)',
    backgroundColor: 'rgba(245, 158, 11, 0.1)',
  },
  offlineTripLabel: {
    color: '#F59E0B',
  },
  offlinePulseOuter: {
    backgroundColor: 'rgba(245, 158, 11, 0.3)',
  },
  offlinePulseInner: {
    backgroundColor: '#F59E0B',
  },
  offlineTripStatText: {
    color: '#F59E0B',
  },
  offlineEndTripBtn: {
    backgroundColor: '#F59E0B',
  },
  offlineActionBtn: {
    marginHorizontal: Spacing.screen,
    backgroundColor: Colors.bg.secondary,
    borderRadius: Radius.lg,
    padding: 14,
    borderWidth: 1,
    borderColor: 'rgba(245, 158, 11, 0.3)',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 20,
    ...Shadow.sm,
  },
  offlineActionText: {
    color: '#F59E0B',
    fontSize: FontSize.sm,
    fontWeight: '700',
  },
  offlineActionSub: {
    color: Colors.text.tertiary,
    fontSize: 10,
  },
  // Master tracking toggle styles
  masterTrackingBtn: {
    marginHorizontal: Spacing.screen,
    backgroundColor: Colors.bg.secondary,
    borderRadius: Radius.lg,
    padding: 14,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 20,
    ...Shadow.sm,
  },
  masterTrackingText: {
    fontSize: FontSize.sm,
    fontWeight: '700',
  },
  masterTrackingSub: {
    color: Colors.text.tertiary,
    fontSize: 10,
  },
});
