import React, { useState, useEffect, useCallback } from 'react';
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

export default function DashboardScreen() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [startingTrip, setStartingTrip] = useState(false);
  const [endingTrip, setEndingTrip] = useState(false);
  const [insights, setInsights] = useState<any[]>([]);
  const { user, token } = useAuth();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const loadData = useCallback(async () => {
    if (!token) return;
    try {
      const data = await API.getDashboardStats(token);
      setStats(data);
    } catch (e: any) {
      console.error('Dashboard load error:', e);
    }
  }, [token]);

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
    if (!stats?.active_trip) return;
    setEndingTrip(true);
    try {
      let endLat: number | undefined;
      let endLng: number | undefined;
      let endAddress = 'Destination';
      let distance = 0;

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

        if (stats.active_trip.start_lat && stats.active_trip.start_lng) {
          distance = haversineDistance(stats.active_trip.start_lat, stats.active_trip.start_lng, endLat, endLng);
        }
      }

      await API.endTrip(token!, stats.active_trip.trip_id, { end_lat: endLat, end_lng: endLng, end_address: endAddress, distance });
      await loadData();
      router.push(`/trip/${stats.active_trip.trip_id}`);
    } catch (e: any) {
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

        {/* Active Trip Banner */}
        {stats?.active_trip ? (
          <View testID="active-trip-banner" style={styles.activeTripCard}>
            <View style={styles.activeTripPulse}>
              <View style={styles.pulseOuter}><View style={styles.pulseInner} /></View>
              <Text style={styles.activeTripLabel}>TRIP IN PROGRESS</Text>
            </View>
            <Text style={styles.activeTripRoute} numberOfLines={1}>
              {stats.active_trip.start_address || 'Current Location'}
            </Text>
            <Text style={styles.activeTripTime}>Duration: {formatDuration(stats.active_trip.start_time)}</Text>
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
              <Text style={styles.yearlyTitle}>2025 YTD Summary</Text>
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
  activeTripRoute: { color: Colors.text.primary, fontSize: FontSize.base, fontWeight: '600', marginBottom: 4 },
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
});
