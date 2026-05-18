import React, { memo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { Colors, FontSize, Radius, Spacing, ClassificationColor } from '../constants/theme';

interface Trip {
  trip_id: string;
  start_address?: string;
  end_address?: string;
  distance: number;
  classification: string;
  deduction_value: number;
  start_time: string;
  end_time?: string;
  purpose?: string;
  client_name?: string;
  ai_confidence?: number;
}

interface Props {
  trip: Trip;
  onPress: () => void;
  onClassify?: (classification: string) => void;
}

const CLASSIFY_OPTIONS = [
  { key: 'business', label: 'Business', icon: 'briefcase' },
  { key: 'personal', label: 'Personal', icon: 'user' },
  { key: 'medical', label: 'Medical', icon: 'activity' },
];

function formatTime(dateStr: string): string {
  try {
    const d = new Date(dateStr);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) + ' ' +
      d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
  } catch { return dateStr; }
}

const TripCard = memo(({ trip, onPress, onClassify }: Props) => {
  const clsColor = ClassificationColor[trip.classification] || Colors.text.tertiary;
  const isUnclassified = trip.classification === 'unclassified';

  return (
    <TouchableOpacity testID={`trip-card-${trip.trip_id}`} style={styles.card} onPress={onPress} activeOpacity={0.75}>
      <View style={styles.header}>
        <View style={[styles.clsBadge, { backgroundColor: clsColor + '22' }]}>
          <View style={[styles.clsDot, { backgroundColor: clsColor }]} />
          <Text style={[styles.clsText, { color: clsColor }]}>{trip.classification.toUpperCase()}</Text>
        </View>
        <Text style={styles.time}>{formatTime(trip.start_time)}</Text>
      </View>

      <View style={styles.route}>
        <View style={styles.routeLeft}>
          <View style={[styles.dot, { backgroundColor: Colors.brand.primary }]} />
          <View style={styles.routeLine} />
          <View style={[styles.dot, { backgroundColor: Colors.brand.accent }]} />
        </View>
        <View style={styles.routeText}>
          <Text style={styles.address} numberOfLines={1}>{trip.start_address || 'Start'}</Text>
          <Text style={styles.addressSub} numberOfLines={1}>{trip.end_address || 'End'}</Text>
        </View>
        <View style={styles.stats}>
          <Text style={styles.distance}>{trip.distance.toFixed(1)} mi</Text>
          {trip.deduction_value > 0 && (
            <Text style={styles.deduction}>${trip.deduction_value.toFixed(2)}</Text>
          )}
        </View>
      </View>

      {trip.purpose && (
        <Text style={styles.purpose} numberOfLines={1}>{trip.purpose}{trip.client_name ? ` • ${trip.client_name}` : ''}</Text>
      )}

      {isUnclassified && onClassify && (
        <View style={styles.quickClassify}>
          <Text style={styles.quickClassifyLabel}>Quick classify:</Text>
          <View style={styles.quickButtons}>
            {CLASSIFY_OPTIONS.map(opt => (
              <TouchableOpacity
                key={opt.key}
                testID={`classify-${opt.key}-${trip.trip_id}`}
                style={[styles.qBtn, { borderColor: ClassificationColor[opt.key] + '60' }]}
                onPress={(e) => { e.stopPropagation?.(); onClassify(opt.key); }}
              >
                <Text style={[styles.qBtnText, { color: ClassificationColor[opt.key] }]}>{opt.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      )}
    </TouchableOpacity>
  );
});

export default TripCard;

const styles = StyleSheet.create({
  card: {
    backgroundColor: Colors.bg.secondary,
    borderRadius: Radius.lg,
    padding: Spacing.lg,
    marginBottom: Spacing.sm,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  clsBadge: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 8, paddingVertical: 4, borderRadius: Radius.full },
  clsDot: { width: 6, height: 6, borderRadius: 3 },
  clsText: { fontSize: FontSize.xs, fontWeight: '700', letterSpacing: 0.8 },
  time: { color: Colors.text.tertiary, fontSize: FontSize.xs },
  route: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 6 },
  routeLeft: { alignItems: 'center', gap: 2 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  routeLine: { width: 2, height: 14, backgroundColor: Colors.border },
  routeText: { flex: 1, gap: 8 },
  address: { color: Colors.text.primary, fontSize: FontSize.base, fontWeight: '500' },
  addressSub: { color: Colors.text.secondary, fontSize: FontSize.sm },
  stats: { alignItems: 'flex-end' },
  distance: { color: Colors.text.primary, fontSize: FontSize.md, fontWeight: '700' },
  deduction: { color: Colors.brand.primary, fontSize: FontSize.sm, fontWeight: '600' },
  purpose: { color: Colors.text.tertiary, fontSize: FontSize.xs, marginTop: 4 },
  quickClassify: { marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: Colors.border },
  quickClassifyLabel: { color: Colors.text.tertiary, fontSize: FontSize.xs, marginBottom: 6 },
  quickButtons: { flexDirection: 'row', gap: 8 },
  qBtn: { paddingHorizontal: 12, paddingVertical: 5, borderRadius: Radius.full, borderWidth: 1 },
  qBtnText: { fontSize: FontSize.xs, fontWeight: '600' },
});
