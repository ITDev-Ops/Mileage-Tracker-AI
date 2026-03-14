import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  RefreshControl, Alert, Platform, ActivityIndicator
} from 'react-native';
import { useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Location from 'expo-location';
import { useAuth } from '../../context/AuthContext';
import { API } from '../../services/api';
import { Colors, FontSize, Spacing, Radius, Shadow, ClassificationColor } from '../../constants/theme';
import {
  isNetworkOnline,
  onNetworkChange,
  getOfflineStats,
  syncOfflineTrips,
  startTrip as startOfflineTrip,
  updateTripLocation,
  endTrip as endOfflineTrip,
  getCurrentTrip,
  getUnsyncedTrips,
  saveOfflineTrip,
} from '../../services/offlineService';
import {
  isAutoTrackingEnabled,
  getTrackingStatus,
  getPendingTrips as getAutoTrackedTrips,
  stopBackgroundTracking,
} from '../../services/backgroundTracking';

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

function formatLiveTripInfo(distance: number, startTime: string): string {
  const diff = Date.now() - new Date(startTime).getTime();
  const mins = Math.floor(diff / 60000);
  const hrs = Math.floor(mins / 60);
  const durationStr = hrs > 0 ? `${hrs}h ${mins % 60}m` : `${mins}m`;
  return `${distance.toFixed(1)} miles · ${durationStr}`;
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
  const [offlineTripsCount, setOfflineTripsCount] = useState(0);
  const [syncing, setSyncing] = useState(false);
  const [isAutoTrip, setIsAutoTrip] = useState(false);
  const [autoTripAddress, setAutoTripAddress] = useState('Current Location');
  const locationWatchRef = useRef<Location.LocationSubscription | null>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const lastLocationRef = useRef<{ lat: number; lng: number } | null>(null);
  const { user, token } = useAuth();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  // Monitor network status and auto-tracking
  useEffect(() => {
    setIsOnline(isNetworkOnline());
    const unsubscribe = onNetworkChange((online) => {
      setIsOnline(online);
      console.log('[Dashboard] Network status changed:', online ? 'online' : 'offline');
      
      // Auto-sync when coming online
      if (online && token) {
        handleSyncOfflineTrips();
      }
    });
    
    // Check for offline trips on mount
    checkOfflineTrips();
    
    // Check for auto-tracking status
    checkAutoTrackingStatus();
    
    // Poll for auto-tracking trip updates every 5 seconds
    const autoTrackInterval = setInterval(checkAutoTrackingStatus, 5000);
    
    return () => {
      unsubscribe();
      clearInterval(autoTrackInterval);
    };
  }, [token]);

  const checkAutoTrackingStatus = async () => {
    try {
      const status = await getTrackingStatus();
      if (status.currentTrip && status.isRunning) {
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
        
        // Get current location for address (Issue #5 fix)
        try {
          const route = status.currentTrip.route;
          if (route && route.length > 0) {
            const lastPoint = route[route.length - 1];
            const geo = await Location.reverseGeocodeAsync({ 
              latitude: lastPoint.latitude, 
              longitude: lastPoint.longitude 
            });
            if (geo.length > 0) {
              const g = geo[0];
              const address = [g.street, g.city, g.region].filter(Boolean).join(', ');
              setAutoTripAddress(address || 'Current Location');
            }
          }
        } catch (geoError) {
          console.log('[Dashboard] Geocode error:', geoError);
        }
        
        console.log('[Dashboard] Auto trip in progress:', status.currentTrip.distance?.toFixed(2), 'miles');
      } else {
        setIsAutoTrip(false);
        setAutoTripAddress('Current Location');
      }
    } catch (e) {
      console.log('[Dashboard] Error checking auto-tracking:', e);
    }
  };

  const checkOfflineTrips = async () => {
    const trips = await getUnsyncedTrips();
    setOfflineTripsCount(trips.length);
  };

  const handleSyncOfflineTrips = async () => {
    if (!token || !isOnline) return;
    
    setSyncing(true);
    try {
      const result = await syncOfflineTrips(token, API.createTripDirect);
      if (result.synced > 0) {
        Alert.alert('Trips Synced! ✅', `${result.synced} offline trip${result.synced > 1 ? 's' : ''} synced successfully.`);
        
        // Refresh dashboard stats after sync (Issue #1 & #3 fix)
        await loadData();
        loadInsights();
      }
      await checkOfflineTrips();
    } catch (e) {
      console.log('[Dashboard] Sync error:', e);
    } finally {
      setSyncing(false);
    }
  };

  const loadData = useCallback(async () => {
    if (!token) return;
    
    // If offline, load from cache or show offline data
    if (!isOnline) {
      console.log('[Dashboard] Offline mode - using cached data');
      return;
    }
    
    try {
      const data = await API.getDashboardStats(token);
      setStats(data);
    } catch (e: any) {
      console.error('Dashboard load error:', e);
    }
  }, [token, isOnline]);

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

  // Live trip tracking - updates distance and duration in real-time
  useEffect(() => {
    if (!stats?.active_trip) {
      // Clean up when no active trip
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
      lastLocationRef.current = null;
      return;
    }

    // Initialize with current trip data
    console.log('[Dashboard] Active trip detected:', stats.active_trip?.trip_id, 'start_time:', stats.active_trip?.start_time);
    setLiveDistance(stats.active_trip.distance || 0);
    lastLocationRef.current = stats.active_trip.start_lat && stats.active_trip.start_lng
      ? { lat: stats.active_trip.start_lat, lng: stats.active_trip.start_lng }
      : null;

    // Start duration timer - updates every second
    const updateDuration = () => {
      if (stats?.active_trip?.start_time) {
        const startTime = new Date(stats.active_trip.start_time).getTime();
        const diff = Date.now() - startTime;
        const totalMins = Math.floor(diff / 60000);
        const hrs = Math.floor(totalMins / 60);
        const mins = totalMins % 60;
        const newDuration = hrs > 0 ? `${hrs}h ${mins}m` : `${mins}m`;
        console.log('[Dashboard] Duration update - start:', stats.active_trip.start_time, 'diff:', diff, 'duration:', newDuration);
        setLiveDuration(newDuration);
      }
    };
    updateDuration();
    timerRef.current = setInterval(updateDuration, 1000);

    // Start location tracking for distance
    const startLocationTracking = async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted') {
          console.log('[Dashboard] Location permission not granted');
          return;
        }

        console.log('[Dashboard] Starting location tracking...');
        locationWatchRef.current = await Location.watchPositionAsync(
          { accuracy: Location.Accuracy.High, distanceInterval: 10, timeInterval: 5000 },
          (location) => {
            const newLat = location.coords.latitude;
            const newLng = location.coords.longitude;
            const speed = location.coords.speed || 0;
            
            console.log('[Dashboard] Location update:', { lat: newLat.toFixed(6), lng: newLng.toFixed(6), speed: (speed * 2.237).toFixed(1) + ' mph' });
            
            if (lastLocationRef.current) {
              // Calculate distance using Haversine formula
              const R = 3958.8; // Earth's radius in miles
              const dLat = (newLat - lastLocationRef.current.lat) * Math.PI / 180;
              const dLng = (newLng - lastLocationRef.current.lng) * Math.PI / 180;
              const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
                Math.cos(lastLocationRef.current.lat * Math.PI / 180) * Math.cos(newLat * Math.PI / 180) *
                Math.sin(dLng/2) * Math.sin(dLng/2);
              const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
              const dist = R * c;
              
              console.log('[Dashboard] Calculated segment distance:', dist.toFixed(4), 'miles');
              
              if (dist > 0.005) { // Only add if moved > ~26 feet
                setLiveDistance(prev => {
                  const newTotal = prev + dist;
                  console.log('[Dashboard] Updated liveDistance:', newTotal.toFixed(2), 'miles');
                  return newTotal;
                });
              }
            }
            lastLocationRef.current = { lat: newLat, lng: newLng };
          }
        );
        console.log('[Dashboard] Location tracking started successfully');
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
  }, [stats?.active_trip?.trip_id]);

  const onRefresh = async () => {
    setRefreshing(true);
    await loadData();
    loadInsights();
    setRefreshing(false);
  };

  const handleStartTrip = async () => {
    setStartingTrip(true);
    try {
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

      const trip = await API.createTrip(token!, { start_lat: startLat, start_lng: startLng, start_address: startAddress });
      await loadData();
      Alert.alert('Trip Started! 🚗', `Tracking your drive from ${startAddress}`, [{ text: 'OK' }]);
    } catch (e: any) {
      Alert.alert('Error', e.message || 'Could not start trip');
    } finally {
      setStartingTrip(false);
    }
  };

  const handleEndTrip = async () => {
    // Handle both manual and auto trips (Issue #4 fix)
    const isManualTrip = stats?.active_trip;
    
    if (!isManualTrip && !isAutoTrip) return;
    
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
        if (distance === 0 && isManualTrip && stats.active_trip.start_lat && stats.active_trip.start_lng) {
          distance = haversineDistance(stats.active_trip.start_lat, stats.active_trip.start_lng, endLat, endLng);
          console.log('[Dashboard] Using fallback straight-line distance:', distance);
        }
      }

      console.log('[Dashboard] Ending trip with distance:', distance, 'miles, online:', isOnline, 'isAutoTrip:', isAutoTrip);
      
      // Handle Auto Trip End (Issue #4 fix)
      if (isAutoTrip && !isManualTrip) {
        console.log('[Dashboard] Ending AUTO trip manually');
        
        // Stop background tracking to end the current auto trip
        await stopBackgroundTracking();
        
        // The trip will be saved to pending trips by the background service
        // Refresh the pending trips count
        await checkOfflineTrips();
        
        // Reset state
        setIsAutoTrip(false);
        setLiveDistance(0);
        setLiveDuration('0m');
        setAutoTripAddress('Current Location');
        
        Alert.alert(
          'Auto Trip Ended ✅',
          `Your ${distance.toFixed(1)} mile auto-tracked trip has been saved and will sync shortly.`,
          [{ text: 'OK' }]
        );
        
        // Sync if online
        if (isOnline && token) {
          setTimeout(() => handleSyncOfflineTrips(), 1000);
        }
        
        await loadData();
        return;
      }
      
      // Handle Manual Trip End
      // Check if online - if not, save locally for later sync
      if (!isOnline) {
        console.log('[Dashboard] Offline - saving trip locally for later sync');
        
        // Save the trip offline
        const offlineTrip = await saveOfflineTrip({
          start_time: stats.active_trip.start_time,
          end_time: new Date().toISOString(),
          start_lat: stats.active_trip.start_lat || 0,
          start_lng: stats.active_trip.start_lng || 0,
          end_lat: endLat || 0,
          end_lng: endLng || 0,
          start_address: stats.active_trip.start_address || 'Unknown start',
          end_address: endAddress,
          distance: distance,
          classification: 'business',
          notes: 'Tracked offline - pending sync',
        });
        
        console.log('[Dashboard] Saved offline trip:', offlineTrip.id);
        
        // Update offline trips count
        await checkOfflineTrips();
        
        Alert.alert(
          'Trip Saved Offline 📱',
          `Your ${distance.toFixed(1)} mile trip has been saved. It will sync automatically when you reconnect.`,
          [{ text: 'OK' }]
        );
        
        // Reset live tracking state
        setLiveDistance(0);
        setLiveDuration('0m');
        
        return;
      }
      
      // Online - send to server
      await API.endTrip(token!, stats.active_trip.trip_id, { end_lat: endLat, end_lng: endLng, end_address: endAddress, distance });
      
      // Reset live tracking state
      setLiveDistance(0);
      setLiveDuration('0m');
      
      await loadData();
      router.push(`/trip/${stats.active_trip.trip_id}`);
    } catch (e: any) {
      console.log('[Dashboard] End trip error:', e.message);
      
      // If the API call failed (maybe went offline mid-request), save locally
      if (!isOnline || e.message?.includes('network') || e.message?.includes('Network')) {
        try {
          const offlineTrip = await saveOfflineTrip({
            start_time: stats?.active_trip?.start_time || new Date().toISOString(),
            end_time: new Date().toISOString(),
            start_lat: stats?.active_trip?.start_lat || 0,
            start_lng: stats?.active_trip?.start_lng || 0,
            end_lat: 0,
            end_lng: 0,
            start_address: stats?.active_trip?.start_address || 'Unknown',
            end_address: 'Unknown',
            distance: liveDistance,
            classification: 'business',
            notes: 'Saved offline due to connection error',
          });
          
          await checkOfflineTrips();
          
          Alert.alert(
            'Trip Saved Offline',
            'Connection lost. Your trip has been saved and will sync when connected.',
            [{ text: 'OK' }]
          );
          
          setLiveDistance(0);
          setLiveDuration('0m');
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
        contentContainerStyle={{ paddingBottom: 100 }}
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

        {/* Unsynced Trips Banner */}
        {offlineTripsCount > 0 && isOnline && (
          <TouchableOpacity 
            style={styles.syncBanner} 
            onPress={handleSyncOfflineTrips}
            disabled={syncing}
          >
            <Feather name="upload-cloud" size={16} color="#FFF" />
            <Text style={styles.syncBannerText}>
              {syncing ? 'Syncing...' : `${offlineTripsCount} offline trip${offlineTripsCount > 1 ? 's' : ''} ready to sync`}
            </Text>
            {syncing ? (
              <ActivityIndicator size="small" color="#FFF" />
            ) : (
              <View style={styles.syncNowBtn}>
                <Text style={styles.syncNowText}>Sync Now</Text>
              </View>
            )}
          </TouchableOpacity>
        )}

        {/* Active Trip Banner - Shows for both manual and auto trips */}
        {(stats?.active_trip || isAutoTrip) ? (
          <View testID="active-trip-banner" style={[
            styles.activeTripCard,
            isAutoTrip && !stats?.active_trip && styles.autoTripCard
          ]}>
            <View style={styles.activeTripPulse}>
              <View style={[styles.pulseOuter, isAutoTrip && !stats?.active_trip && styles.autoPulseOuter]}>
                <View style={[styles.pulseInner, isAutoTrip && !stats?.active_trip && styles.autoPulseInner]} />
              </View>
              <Text style={[styles.activeTripLabel, isAutoTrip && !stats?.active_trip && styles.autoTripLabel]}>
                {isAutoTrip && !stats?.active_trip ? 'AUTO TRACKING IN PROGRESS' : 'TRIP IN PROGRESS'}
              </Text>
            </View>
            <Text style={styles.activeTripRoute} numberOfLines={1}>
              {stats?.active_trip?.start_address || autoTripAddress || 'Current Location'}
            </Text>
            <View style={styles.activeTripStats}>
              <View style={styles.activeTripStat}>
                <Feather name="navigation" size={14} color={isAutoTrip && !stats?.active_trip ? '#60A5FA' : Colors.brand.primary} />
                <Text style={[styles.activeTripStatText, isAutoTrip && !stats?.active_trip && styles.autoTripStatText]}>
                  {liveDistance.toFixed(1)} miles
                </Text>
              </View>
              <View style={styles.activeTripStatDivider} />
              <View style={styles.activeTripStat}>
                <Feather name="clock" size={14} color={Colors.brand.secondary} />
                <Text style={styles.activeTripStatText}>{liveDuration}</Text>
              </View>
            </View>
            <TouchableOpacity testID="end-trip-btn" style={styles.endTripBtn} onPress={handleEndTrip} disabled={endingTrip}>
              {endingTrip ? <ActivityIndicator color="#FFF" size="small" /> : (
                <><Feather name="square" size={16} color="#FFF" /><Text style={styles.endTripBtnText}>End Trip</Text></>
              )}
            </TouchableOpacity>
          </View>
        ) : (
          <TouchableOpacity testID="start-trip-btn" style={styles.startTripCard} onPress={handleStartTrip} disabled={startingTrip} activeOpacity={0.85}>
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
            <Text style={styles.statLabel}>Miles This Month</Text>
          </View>
          <View style={[styles.statCard, { borderColor: Colors.brand.secondary + '40' }]}>
            <Text style={[styles.statValue, { color: Colors.brand.primary }]}>${stats?.monthly_deductions?.toFixed(2) || '0.00'}</Text>
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
              <Text style={styles.yearlyMiles}>{stats?.yearly_miles?.toFixed(1) || '0.0'} miles</Text>
            </View>
            <View style={styles.yearlyRight}>
              <Text style={styles.yearlyDeduction}>${stats?.yearly_deductions?.toFixed(2) || '0.00'}</Text>
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
                  <Text style={styles.recentMeta}>{trip.distance?.toFixed(1)} mi · {formatDate(trip.start_time)}</Text>
                </View>
                <Text style={[styles.recentDeduction, { color: trip.deduction_value > 0 ? Colors.brand.primary : Colors.text.tertiary }]}>
                  {trip.deduction_value > 0 ? `$${trip.deduction_value?.toFixed(2)}` : trip.classification}
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
      </ScrollView>
    </View>
  );
}

function haversineDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 3959;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

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
});
