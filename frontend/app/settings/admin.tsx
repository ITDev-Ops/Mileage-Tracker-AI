import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  Platform, Dimensions, ActivityIndicator
} from 'react-native';
import { useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors, FontSize, Spacing, Radius } from '../../constants/theme';
import { useAuth } from '../../context/AuthContext';
import { API } from '../../services/api';

export default function AdminDashboardScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { token } = useAuth();

  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchStats = async () => {
    if (!token) {
      setError('No authentication token found.');
      setLoading(false);
      return;
    }
    try {
      setLoading(true);
      setError(null);
      const data = await API.getTeamStats(token);
      setStats(data);
    } catch (err: any) {
      console.log('[Admin] Fetch stats error:', err.message);
      setError(err.message || 'Failed to fetch company telemetry.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStats();
  }, [token]);

  const recentAlerts = stats?.alerts && stats.alerts.length > 0 ? stats.alerts : [
    { id: '1', type: 'warning', msg: 'Sarah Jenkins reached 90% of her monthly travel limit.', date: '1h ago' },
    { id: '2', type: 'info', msg: 'Alex Rivera exported a CSV Tax Report for May 2026.', date: '4h ago' },
    { id: '3', type: 'success', msg: 'Monthly tax report verification generated.', date: 'Yesterday' }
  ];

  if (loading) {
    return (
      <View style={[styles.container, { paddingTop: insets.top, justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator size="large" color={Colors.brand.primary} />
        <Text style={{ marginTop: 12, color: Colors.text.secondary, fontSize: FontSize.sm }}>Loading company telemetry...</Text>
      </View>
    );
  }

  if (error || !stats) {
    return (
      <View style={[styles.container, { paddingTop: insets.top, justifyContent: 'center', alignItems: 'center', paddingHorizontal: Spacing.screen }]}>
        <Feather name="alert-circle" size={48} color={Colors.brand.accent} style={{ marginBottom: 16 }} />
        <Text style={{ color: Colors.text.primary, fontSize: FontSize.md, fontWeight: '700', textAlign: 'center' }}>
          Failed to Load Telemetry
        </Text>
        <Text style={{ marginTop: 8, color: Colors.text.secondary, fontSize: FontSize.sm, textAlign: 'center', marginBottom: 24 }}>
          {error || 'An unexpected error occurred.'}
        </Text>
        <TouchableOpacity 
          style={{ backgroundColor: Colors.brand.primary, paddingHorizontal: 20, paddingVertical: 10, borderRadius: Radius.md }}
          onPress={fetchStats}
        >
          <Text style={{ color: Colors.text.inverse, fontWeight: '700' }}>Retry</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity testID="admin-back-btn" onPress={() => router.back()} style={styles.backBtn}>
          <Feather name="arrow-left" size={22} color={Colors.text.primary} />
        </TouchableOpacity>
        <Text style={styles.title}>Admin Dashboard</Text>
        <View style={{ width: 34 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Company Summary Cards */}
        <Text style={styles.sectionTitle}>Company Telemetry (June 2026)</Text>
        <View style={styles.statsGrid}>
          <View style={styles.statCard}>
            <Feather name="navigation" size={18} color={Colors.brand.primary} style={{ marginBottom: 8 }} />
            <Text style={styles.statLabel}>Total Distance</Text>
            <Text style={styles.statValue}>{stats.monthlyTotalMiles.toLocaleString()} mi</Text>
          </View>
          <View style={styles.statCard}>
            <Feather name="dollar-sign" size={18} color={Colors.status.success} style={{ marginBottom: 8 }} />
            <Text style={styles.statLabel}>Accrued Deductions</Text>
            <Text style={[styles.statValue, { color: Colors.status.success }]}>${stats.monthlyTotalDeductions.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</Text>
          </View>
        </View>

        <View style={styles.statsGrid}>
          <View style={styles.statCard}>
            <Feather name="users" size={18} color={Colors.brand.warning} style={{ marginBottom: 8 }} />
            <Text style={styles.statLabel}>Active Drivers</Text>
            <Text style={styles.statValue}>{stats.activeDrivers}</Text>
          </View>
          <View style={styles.statCard}>
            <Feather name="truck" size={18} color={Colors.brand.secondary} style={{ marginBottom: 8 }} />
            <Text style={styles.statLabel}>Fleet Vehicles</Text>
            <Text style={styles.statValue}>{stats.fleetSize}</Text>
          </View>
        </View>

        {/* Audit Readiness */}
        <Text style={styles.sectionTitle}>Compliance & Audit Status</Text>
        <View style={styles.card}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <View style={styles.checkCircle}>
              <Feather name="check" size={16} color={Colors.status.success} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.cardTitle}>IRS Form 2106 Compliant</Text>
              <Text style={styles.cardDesc}>Company driving logs and metadata meet standard federal tax compliance rules.</Text>
            </View>
          </View>
          <View style={styles.divider} />
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <Text style={styles.listLabel}>Pending Admin Verification</Text>
            <View style={styles.alertBadge}>
              <Text style={styles.alertBadgeText}>{stats.pendingReportsCount} Reports</Text>
            </View>
          </View>
        </View>

        {/* Activity & System Alerts */}
        <Text style={styles.sectionTitle}>System Alerts & Notifications</Text>
        <View style={styles.card}>
          {recentAlerts.map((alert: any, index: number) => (
            <View key={alert.id}>
              {index > 0 && <View style={styles.divider} />}
              <View style={styles.alertRow}>
                <Feather
                  name={alert.type === 'warning' ? 'alert-triangle' : alert.type === 'success' ? 'check-circle' : 'info'}
                  size={16}
                  color={alert.type === 'warning' ? Colors.brand.warning : alert.type === 'success' ? Colors.status.success : Colors.brand.secondary}
                />
                <Text style={styles.alertMsg}>{alert.msg}</Text>
                <Text style={styles.alertDate}>{alert.date}</Text>
              </View>
            </View>
          ))}
        </View>

        {/* Fleet & Billing Overview */}
        <Text style={styles.sectionTitle}>Subscription & Corporate Billing</Text>
        <View style={styles.card}>
          <View style={styles.listRow}>
            <Text style={styles.listLabel}>Corporate Tier</Text>
            <Text style={styles.listValue}>{stats.corporateTier || 'Pro Enterprise'}</Text>
          </View>
          <View style={styles.divider} />
          <View style={styles.listRow}>
            <Text style={styles.listLabel}>Renewal Date</Text>
            <Text style={styles.listValue}>{stats.renewalDate || 'N/A'}</Text>
          </View>
          <View style={styles.divider} />
          <View style={styles.listRow}>
            <Text style={styles.listLabel}>Payment Method</Text>
            <Text style={styles.listValue}>{stats.paymentMethod || 'N/A'}</Text>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bg.primary },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: Spacing.screen, paddingVertical: 12 },
  backBtn: { padding: 6 },
  title: { flex: 1, color: Colors.text.primary, fontSize: FontSize.lg, fontWeight: '800', textAlign: 'center' },
  scrollContent: { paddingHorizontal: Spacing.screen, paddingBottom: 60 },
  sectionTitle: { color: Colors.text.secondary, fontSize: FontSize.xs, fontWeight: '700', letterSpacing: 1, textTransform: 'uppercase', marginTop: 20, marginBottom: 10 },
  statsGrid: { flexDirection: 'row', gap: 12, marginBottom: 12 },
  statCard: { flex: 1, backgroundColor: Colors.bg.secondary, borderRadius: Radius.xl, padding: 16, borderWidth: 1, borderColor: Colors.border },
  statLabel: { color: Colors.text.secondary, fontSize: FontSize.xs, fontWeight: '600', marginBottom: 6 },
  statValue: { color: Colors.text.primary, fontSize: FontSize.xl, fontWeight: '800' },
  card: { backgroundColor: Colors.bg.secondary, borderRadius: Radius.xl, padding: 16, borderWidth: 1, borderColor: Colors.border },
  cardTitle: { color: Colors.text.primary, fontSize: FontSize.sm, fontWeight: '700', marginBottom: 2 },
  cardDesc: { color: Colors.text.secondary, fontSize: FontSize.xs, lineHeight: 16 },
  checkCircle: { width: 28, height: 28, borderRadius: 14, backgroundColor: Colors.brand.primaryDim, alignItems: 'center', justifyContent: 'center' },
  divider: { height: 1, backgroundColor: Colors.border, marginVertical: 12 },
  listLabel: { color: Colors.text.primary, fontSize: FontSize.sm, fontWeight: '600' },
  listValue: { color: Colors.text.secondary, fontSize: FontSize.sm },
  alertBadge: { backgroundColor: Colors.brand.warningDim, borderRadius: Radius.full, paddingHorizontal: 8, paddingVertical: 2 },
  alertBadgeText: { fontSize: 10, fontWeight: '800', color: Colors.brand.warning },
  alertRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  alertMsg: { flex: 1, color: Colors.text.primary, fontSize: FontSize.xs, lineHeight: 16 },
  alertDate: { color: Colors.text.tertiary, fontSize: 10 },
  listRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
});
