import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  TextInput, RefreshControl, Alert, ActivityIndicator
} from 'react-native';
import { useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../../context/AuthContext';
import { API } from '../../services/api';
import TripCard from '../../components/TripCard';
import { Colors, FontSize, Spacing, Radius } from '../../constants/theme';

const FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'business', label: 'Business' },
  { key: 'personal', label: 'Personal' },
  { key: 'medical', label: 'Medical' },
  { key: 'unclassified', label: 'Unclassified' },
];

export default function TripsScreen() {
  const [trips, setTrips] = useState<any[]>([]);
  const [filtered, setFiltered] = useState<any[]>([]);
  const [search, setSearch] = useState('');
  const [activeFilter, setActiveFilter] = useState('all');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [classifying, setClassifying] = useState<string | null>(null);
  const { token } = useAuth();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const loadTrips = useCallback(async () => {
    if (!token) return;
    try {
      const data = await API.getTrips(token, activeFilter);
      setTrips(data);
      applySearch(data, search);
    } catch (e: any) {
      console.error('Load trips error:', e);
    }
  }, [token, activeFilter]);

  useEffect(() => {
    setLoading(true);
    loadTrips().finally(() => setLoading(false));
  }, [loadTrips]);

  const applySearch = (data: any[], q: string) => {
    if (!q.trim()) { setFiltered(data); return; }
    const lower = q.toLowerCase();
    setFiltered(data.filter(t =>
      t.start_address?.toLowerCase().includes(lower) ||
      t.end_address?.toLowerCase().includes(lower) ||
      t.purpose?.toLowerCase().includes(lower) ||
      t.client_name?.toLowerCase().includes(lower)
    ));
  };

  useEffect(() => {
    applySearch(trips, search);
  }, [search, trips]);

  const onRefresh = async () => {
    setRefreshing(true);
    await loadTrips();
    setRefreshing(false);
  };

  const handleClassify = async (tripId: string, classification: string) => {
    if (!token) return;
    try {
      await API.updateTrip(token, tripId, { classification });
      await loadTrips();
    } catch (e: any) {
      Alert.alert('Error', e.message);
    }
  };

  const handleAIClassify = async (tripId: string) => {
    if (!token) return;
    setClassifying(tripId);
    try {
      const result = await API.classifyTrip(token, tripId);
      await loadTrips();
      Alert.alert('AI Classified', `Classified as ${result.classification} (${Math.round(result.confidence * 100)}% confident)\n${result.purpose || ''}`);
    } catch (e: any) {
      Alert.alert('AI Error', e.message);
    } finally {
      setClassifying(null);
    }
  };

  const handleDelete = async (tripId: string) => {
    Alert.alert('Delete Trip', 'Are you sure you want to delete this trip?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete', style: 'destructive', onPress: async () => {
          try {
            await API.deleteTrip(token!, tripId);
            await loadTrips();
          } catch (e: any) { Alert.alert('Error', e.message); }
        }
      }
    ]);
  };

  const totalMiles = filtered.reduce((sum, t) => sum + (t.distance || 0), 0);
  const totalDeductions = filtered.reduce((sum, t) => sum + (t.deduction_value || 0), 0);

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>My Trips</Text>
        <TouchableOpacity testID="ai-classify-all-btn" style={styles.aiBtn} onPress={() => router.push('/ai/assistant')}>
          <Feather name="zap" size={16} color={Colors.brand.primary} />
          <Text style={styles.aiBtnText}>AI Classify</Text>
        </TouchableOpacity>
      </View>

      {/* Search */}
      <View style={styles.searchWrap}>
        <Feather name="search" size={16} color={Colors.text.tertiary} style={styles.searchIcon} />
        <TextInput
          testID="trips-search"
          style={styles.searchInput}
          value={search}
          onChangeText={setSearch}
          placeholder="Search trips, places, clients..."
          placeholderTextColor={Colors.text.tertiary}
        />
        {search.length > 0 && (
          <TouchableOpacity onPress={() => setSearch('')}>
            <Feather name="x" size={16} color={Colors.text.tertiary} />
          </TouchableOpacity>
        )}
      </View>

      {/* Filters */}
      <View testID="trip-filters" style={styles.filtersRow}>
        {FILTERS.map(f => (
          <TouchableOpacity
            key={f.key}
            testID={`filter-${f.key}`}
            style={[styles.filterBtn, activeFilter === f.key && styles.filterBtnActive]}
            onPress={() => setActiveFilter(f.key)}
          >
            <Text style={[styles.filterText, activeFilter === f.key && styles.filterTextActive]}>{f.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Summary Row */}
      {filtered.length > 0 && (
        <View style={styles.summaryRow}>
          <Text style={styles.summaryText}>{filtered.length} trips · {totalMiles.toFixed(1)} mi</Text>
          <Text style={styles.summaryDeduction}>${totalDeductions.toFixed(2)} deductions</Text>
        </View>
      )}

      {/* List */}
      {loading ? (
        <ActivityIndicator size="large" color={Colors.brand.primary} style={{ marginTop: 40 }} />
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(item) => item.trip_id}
          renderItem={({ item }) => (
            <View>
              <TripCard
                trip={item}
                onPress={() => router.push(`/trip/${item.trip_id}`)}
                onClassify={(cls) => handleClassify(item.trip_id, cls)}
              />
              {item.classification === 'unclassified' && (
                <TouchableOpacity
                  testID={`ai-classify-${item.trip_id}`}
                  style={styles.aiClassifyRow}
                  onPress={() => handleAIClassify(item.trip_id)}
                  disabled={classifying === item.trip_id}
                >
                  {classifying === item.trip_id ? (
                    <ActivityIndicator size="small" color={Colors.brand.primary} />
                  ) : (
                    <><Feather name="zap" size={13} color={Colors.brand.primary} /><Text style={styles.aiClassifyText}>Auto-classify with AI</Text></>
                  )}
                </TouchableOpacity>
              )}
            </View>
          )}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.brand.primary} />}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Feather name="map" size={48} color={Colors.text.tertiary} />
              <Text style={styles.emptyTitle}>No trips found</Text>
              <Text style={styles.emptyText}>Start a drive from the Dashboard to begin tracking</Text>
            </View>
          }
          contentContainerStyle={{ paddingHorizontal: Spacing.screen, paddingBottom: 100, paddingTop: 8 }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bg.primary },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: Spacing.screen, paddingVertical: Spacing.md },
  title: { color: Colors.text.primary, fontSize: FontSize.xxl, fontWeight: '800' },
  aiBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: Colors.brand.primaryDim, borderRadius: Radius.full, paddingHorizontal: 12, paddingVertical: 7, borderWidth: 1, borderColor: Colors.brand.primary + '40' },
  aiBtnText: { color: Colors.brand.primary, fontSize: FontSize.xs, fontWeight: '700' },
  searchWrap: { flexDirection: 'row', alignItems: 'center', marginHorizontal: Spacing.screen, backgroundColor: Colors.bg.secondary, borderRadius: Radius.md, paddingHorizontal: 12, height: 44, borderWidth: 1, borderColor: Colors.border, marginBottom: 12 },
  searchIcon: { marginRight: 8 },
  searchInput: { flex: 1, color: Colors.text.primary, fontSize: FontSize.sm },
  filtersRow: { flexDirection: 'row', paddingHorizontal: Spacing.screen, gap: 8, marginBottom: 10 },
  filterBtn: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: Radius.full, backgroundColor: Colors.bg.secondary, borderWidth: 1, borderColor: Colors.border },
  filterBtnActive: { backgroundColor: Colors.brand.primaryDim, borderColor: Colors.brand.primary },
  filterText: { color: Colors.text.tertiary, fontSize: FontSize.xs, fontWeight: '600' },
  filterTextActive: { color: Colors.brand.primary },
  summaryRow: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: Spacing.screen, marginBottom: 8 },
  summaryText: { color: Colors.text.secondary, fontSize: FontSize.xs },
  summaryDeduction: { color: Colors.brand.primary, fontSize: FontSize.xs, fontWeight: '700' },
  aiClassifyRow: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 16, paddingBottom: 8, marginTop: -4 },
  aiClassifyText: { color: Colors.brand.primary, fontSize: FontSize.xs },
  empty: { alignItems: 'center', paddingTop: 80, gap: 12 },
  emptyTitle: { color: Colors.text.primary, fontSize: FontSize.lg, fontWeight: '700' },
  emptyText: { color: Colors.text.tertiary, fontSize: FontSize.sm, textAlign: 'center', paddingHorizontal: 32 },
});
