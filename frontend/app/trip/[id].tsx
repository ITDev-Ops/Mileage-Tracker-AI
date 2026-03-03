import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  Alert, ActivityIndicator, TextInput, Modal, Platform
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../../context/AuthContext';
import { API } from '../../services/api';
import TripMapView from '../../components/TripMapView';
import { Colors, FontSize, Spacing, Radius, ClassificationColor } from '../../constants/theme';

const CLASSIFICATIONS = [
  { key: 'business', label: 'Business', icon: 'briefcase', desc: 'Tax deductible at $0.67/mi' },
  { key: 'personal', label: 'Personal', icon: 'user', desc: 'Not deductible' },
  { key: 'medical', label: 'Medical', icon: 'activity', desc: 'Deductible at $0.21/mi' },
  { key: 'charity', label: 'Charity', icon: 'heart', desc: 'Deductible at $0.14/mi' },
];

function formatDateTime(dateStr: string): string {
  try {
    const d = new Date(dateStr);
    return d.toLocaleString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true });
  } catch { return dateStr; }
}

function formatDuration(start: string, end: string): string {
  try {
    const diff = new Date(end).getTime() - new Date(start).getTime();
    const mins = Math.floor(diff / 60000);
    const hrs = Math.floor(mins / 60);
    if (hrs > 0) return `${hrs}h ${mins % 60}m`;
    return `${mins}m`;
  } catch { return 'N/A'; }
}

export default function TripDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [trip, setTrip] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [classifying, setClassifying] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [form, setForm] = useState({ classification: '', purpose: '', client_name: '', notes: '', start_address: '', end_address: '', distance: '' });
  const { token } = useAuth();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  useEffect(() => {
    if (!id || !token) return;
    API.getTrip(token, id).then(data => {
      setTrip(data);
      setForm({
        classification: data.classification || 'unclassified',
        purpose: data.purpose || '',
        client_name: data.client_name || '',
        notes: data.notes || '',
        start_address: data.start_address || '',
        end_address: data.end_address || '',
        distance: data.distance?.toString() || '0',
      });
    }).catch(() => Alert.alert('Error', 'Trip not found')).finally(() => setLoading(false));
  }, [id, token]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const updated = await API.updateTrip(token!, id!, {
        classification: form.classification,
        purpose: form.purpose || null,
        client_name: form.client_name || null,
        notes: form.notes,
        start_address: form.start_address,
        end_address: form.end_address,
        distance: parseFloat(form.distance) || 0,
      });
      setTrip(updated);
      setEditMode(false);
    } catch (e: any) { Alert.alert('Error', e.message); }
    finally { setSaving(false); }
  };

  const handleAIClassify = async () => {
    setClassifying(true);
    try {
      const result = await API.classifyTrip(token!, id!);
      const updated = await API.getTrip(token!, id!);
      setTrip(updated);
      setForm(f => ({ ...f, classification: updated.classification, purpose: updated.purpose || '' }));
      Alert.alert('AI Classification', `Classified as ${result.classification}\n${Math.round(result.confidence * 100)}% confident\n${result.purpose || ''}`);
    } catch (e: any) { Alert.alert('Error', e.message); }
    finally { setClassifying(false); }
  };

  const handleDelete = () => {
    Alert.alert('Delete Trip', 'This cannot be undone. Delete this trip?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete', style: 'destructive', onPress: async () => {
          try {
            await API.deleteTrip(token!, id!);
            router.back();
          } catch (e: any) { Alert.alert('Error', e.message); }
        }
      }
    ]);
  };

  if (loading) {
    return <View style={[styles.container, { paddingTop: insets.top }]}><ActivityIndicator size="large" color={Colors.brand.primary} style={{ marginTop: 60 }} /></View>;
  }

  if (!trip) {
    return <View style={[styles.container, { paddingTop: insets.top }]}><Text style={{ color: Colors.text.primary, padding: 20 }}>Trip not found</Text></View>;
  }

  const clsColor = ClassificationColor[trip.classification] || Colors.text.tertiary;

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <TouchableOpacity testID="back-btn" onPress={() => router.back()} style={styles.backBtn}>
          <Feather name="arrow-left" size={22} color={Colors.text.primary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Trip Details</Text>
        <View style={styles.headerActions}>
          <TouchableOpacity testID="edit-trip-btn" onPress={() => setEditMode(!editMode)} style={styles.iconBtn}>
            <Feather name={editMode ? 'x' : 'edit-2'} size={18} color={Colors.brand.primary} />
          </TouchableOpacity>
          <TouchableOpacity testID="delete-trip-btn" onPress={handleDelete} style={styles.iconBtn}>
            <Feather name="trash-2" size={18} color={Colors.brand.accent} />
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView contentContainerStyle={{ paddingBottom: 100 }}>
        {/* Classification Header */}
        <View style={[styles.clsHeader, { backgroundColor: clsColor + '15', borderColor: clsColor + '40' }]}>
          <View style={{ flex: 1 }}>
            <View style={styles.clsBadge}>
              <View style={[styles.clsDot, { backgroundColor: clsColor }]} />
              <Text style={[styles.clsLabel, { color: clsColor }]}>{trip.classification?.toUpperCase()}</Text>
              {trip.ai_confidence > 0 && <Text style={styles.aiConf}>AI {Math.round(trip.ai_confidence * 100)}%</Text>}
            </View>
            <Text style={styles.clsDeduction}>
              {trip.deduction_value > 0 ? `$${trip.deduction_value.toFixed(2)} deductible` : 'No deduction'}
            </Text>
          </View>
          <TouchableOpacity testID="ai-classify-detail-btn" style={styles.aiBtn} onPress={handleAIClassify} disabled={classifying}>
            {classifying ? <ActivityIndicator size="small" color={Colors.brand.primary} /> : (
              <><Feather name="zap" size={14} color={Colors.brand.primary} /><Text style={styles.aiBtnText}>AI Classify</Text></>
            )}
          </TouchableOpacity>
        </View>

        {/* Stats Row */}
        <View style={styles.statsRow}>
          <View style={styles.statItem}>
            <Text style={styles.statVal}>{trip.distance?.toFixed(1)} mi</Text>
            <Text style={styles.statLbl}>Distance</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statItem}>
            <Text style={styles.statVal}>{trip.end_time ? formatDuration(trip.start_time, trip.end_time) : 'Active'}</Text>
            <Text style={styles.statLbl}>Duration</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statItem}>
            <Text style={[styles.statVal, { color: Colors.brand.primary }]}>${trip.deduction_value?.toFixed(2)}</Text>
            <Text style={styles.statLbl}>Deduction</Text>
          </View>
        </View>

        {editMode ? (
          /* Edit Form */
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Edit Trip</Text>

            <Text style={styles.label}>Classification</Text>
            <View style={styles.classifyGrid}>
              {CLASSIFICATIONS.map(cls => (
                <TouchableOpacity
                  key={cls.key}
                  testID={`cls-${cls.key}`}
                  style={[styles.clsOption, form.classification === cls.key && { backgroundColor: ClassificationColor[cls.key] + '20', borderColor: ClassificationColor[cls.key] }]}
                  onPress={() => setForm(f => ({ ...f, classification: cls.key }))}
                >
                  <Feather name={cls.icon as any} size={16} color={form.classification === cls.key ? ClassificationColor[cls.key] : Colors.text.tertiary} />
                  <Text style={[styles.clsOptionText, form.classification === cls.key && { color: ClassificationColor[cls.key] }]}>{cls.label}</Text>
                  <Text style={styles.clsOptionDesc}>{cls.desc}</Text>
                </TouchableOpacity>
              ))}
            </View>

            {['start_address', 'end_address', 'distance', 'purpose', 'client_name', 'notes'].map(field => (
              <View key={field} style={styles.formGroup}>
                <Text style={styles.label}>{field.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}</Text>
                <TextInput
                  testID={`edit-${field}`}
                  style={[styles.input, field === 'notes' && { height: 80, textAlignVertical: 'top', paddingTop: 12 }]}
                  value={(form as any)[field]}
                  onChangeText={v => setForm(f => ({ ...f, [field]: v }))}
                  placeholder={field.replace(/_/g, ' ')}
                  placeholderTextColor={Colors.text.tertiary}
                  keyboardType={field === 'distance' ? 'decimal-pad' : 'default'}
                  multiline={field === 'notes'}
                />
              </View>
            ))}

            <TouchableOpacity testID="save-trip-btn" style={styles.saveBtn} onPress={handleSave} disabled={saving}>
              {saving ? <ActivityIndicator color={Colors.text.inverse} /> : <Text style={styles.saveBtnText}>Save Changes</Text>}
            </TouchableOpacity>
          </View>
        ) : (
          /* View Mode */
          <View style={styles.section}>
            {/* Route Map */}
            <TripMapView
              startLat={trip.start_lat}
              startLng={trip.start_lng}
              endLat={trip.end_lat}
              endLng={trip.end_lng}
              startAddress={trip.start_address}
              endAddress={trip.end_address}
              height={200}
            />

            {/* Route */}
            <View style={styles.routeCard}>
              <View style={styles.routeRow}>
                <View style={[styles.routeDot, { backgroundColor: Colors.brand.primary }]} />
                <View style={styles.routeInfo}>
                  <Text style={styles.routeLabel}>START</Text>
                  <Text style={styles.routeAddr}>{trip.start_address || 'Unknown location'}</Text>
                  <Text style={styles.routeTime}>{formatDateTime(trip.start_time)}</Text>
                </View>
              </View>
              <View style={styles.routeConnector} />
              <View style={styles.routeRow}>
                <View style={[styles.routeDot, { backgroundColor: Colors.brand.accent }]} />
                <View style={styles.routeInfo}>
                  <Text style={styles.routeLabel}>END</Text>
                  <Text style={styles.routeAddr}>{trip.end_address || (trip.is_active ? 'In Progress...' : 'Unknown location')}</Text>
                  {trip.end_time && <Text style={styles.routeTime}>{formatDateTime(trip.end_time)}</Text>}
                </View>
              </View>
            </View>

            {/* Details */}
            {[
              { icon: 'briefcase', label: 'Purpose', value: trip.purpose },
              { icon: 'users', label: 'Client', value: trip.client_name },
              { icon: 'file-text', label: 'Notes', value: trip.notes },
              { icon: 'shield', label: 'Risk Score', value: trip.risk_score ? `${trip.risk_score}/100` : null },
            ].filter(r => r.value).map((row, i) => (
              <View key={i} style={styles.detailRow}>
                <Feather name={row.icon as any} size={16} color={Colors.text.tertiary} />
                <Text style={styles.detailLabel}>{row.label}:</Text>
                <Text style={styles.detailValue}>{row.value}</Text>
              </View>
            ))}

            {/* GPS Coordinates */}
            {trip.start_lat && (
              <View style={styles.coordsCard}>
                <Text style={styles.coordsTitle}>GPS Coordinates</Text>
                <Text style={styles.coordsText}>Start: {trip.start_lat.toFixed(6)}, {trip.start_lng.toFixed(6)}</Text>
                {trip.end_lat && <Text style={styles.coordsText}>End: {trip.end_lat.toFixed(6)}, {trip.end_lng.toFixed(6)}</Text>}
              </View>
            )}
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bg.primary },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: Spacing.screen, paddingVertical: 12 },
  backBtn: { padding: 6, marginRight: 8 },
  headerTitle: { flex: 1, color: Colors.text.primary, fontSize: FontSize.lg, fontWeight: '700' },
  headerActions: { flexDirection: 'row', gap: 4 },
  iconBtn: { padding: 8, borderRadius: Radius.sm },
  clsHeader: { flexDirection: 'row', alignItems: 'center', marginHorizontal: Spacing.screen, borderRadius: Radius.xl, padding: 16, borderWidth: 1, marginBottom: 12 },
  clsBadge: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 },
  clsDot: { width: 8, height: 8, borderRadius: 4 },
  clsLabel: { fontSize: FontSize.sm, fontWeight: '800', letterSpacing: 0.8 },
  aiConf: { color: Colors.text.tertiary, fontSize: 10, backgroundColor: Colors.bg.tertiary, paddingHorizontal: 6, paddingVertical: 2, borderRadius: Radius.full },
  clsDeduction: { color: Colors.text.secondary, fontSize: FontSize.sm },
  aiBtn: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: Colors.brand.primaryDim, borderRadius: Radius.full, paddingHorizontal: 12, paddingVertical: 7, borderWidth: 1, borderColor: Colors.brand.primary + '40' },
  aiBtnText: { color: Colors.brand.primary, fontSize: FontSize.xs, fontWeight: '700' },
  statsRow: { flexDirection: 'row', marginHorizontal: Spacing.screen, backgroundColor: Colors.bg.secondary, borderRadius: Radius.xl, padding: 16, borderWidth: 1, borderColor: Colors.border, marginBottom: 16 },
  statItem: { flex: 1, alignItems: 'center' },
  statVal: { color: Colors.text.primary, fontSize: FontSize.xl, fontWeight: '800' },
  statLbl: { color: Colors.text.tertiary, fontSize: 10, marginTop: 2 },
  statDivider: { width: 1, backgroundColor: Colors.border, marginVertical: 4 },
  section: { paddingHorizontal: Spacing.screen },
  sectionTitle: { color: Colors.text.primary, fontSize: FontSize.md, fontWeight: '700', marginBottom: 16 },
  routeCard: { backgroundColor: Colors.bg.secondary, borderRadius: Radius.xl, padding: 16, borderWidth: 1, borderColor: Colors.border, marginBottom: 16 },
  routeRow: { flexDirection: 'row', gap: 12 },
  routeDot: { width: 12, height: 12, borderRadius: 6, marginTop: 4 },
  routeConnector: { width: 2, height: 24, backgroundColor: Colors.border, marginLeft: 5, marginVertical: 4 },
  routeInfo: { flex: 1 },
  routeLabel: { color: Colors.text.tertiary, fontSize: 10, fontWeight: '700', letterSpacing: 0.8, marginBottom: 2 },
  routeAddr: { color: Colors.text.primary, fontSize: FontSize.sm, fontWeight: '600' },
  routeTime: { color: Colors.text.tertiary, fontSize: FontSize.xs, marginTop: 2 },
  detailRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: Colors.border },
  detailLabel: { color: Colors.text.secondary, fontSize: FontSize.sm, fontWeight: '600', minWidth: 60 },
  detailValue: { flex: 1, color: Colors.text.primary, fontSize: FontSize.sm },
  coordsCard: { backgroundColor: Colors.bg.tertiary, borderRadius: Radius.md, padding: 12, marginTop: 12 },
  coordsTitle: { color: Colors.text.secondary, fontSize: FontSize.xs, fontWeight: '700', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.8 },
  coordsText: { color: Colors.text.tertiary, fontSize: 11 },
  classifyGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 },
  clsOption: { width: '47%', backgroundColor: Colors.bg.secondary, borderRadius: Radius.md, padding: 12, borderWidth: 1, borderColor: Colors.border, gap: 4 },
  clsOptionText: { color: Colors.text.secondary, fontSize: FontSize.sm, fontWeight: '700' },
  clsOptionDesc: { color: Colors.text.tertiary, fontSize: FontSize.xs },
  formGroup: { marginBottom: 14 },
  label: { color: Colors.text.secondary, fontSize: FontSize.xs, fontWeight: '600', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5 },
  input: { backgroundColor: Colors.bg.secondary, borderRadius: Radius.md, borderWidth: 1, borderColor: Colors.border, paddingHorizontal: 14, paddingVertical: 10, color: Colors.text.primary, fontSize: FontSize.base },
  saveBtn: { backgroundColor: Colors.brand.primary, borderRadius: Radius.md, paddingVertical: 14, alignItems: 'center', marginTop: 8 },
  saveBtnText: { color: Colors.text.inverse, fontSize: FontSize.base, fontWeight: '700' },
});
