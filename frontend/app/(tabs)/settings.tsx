import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert,
  TextInput, ActivityIndicator, Platform
} from 'react-native';
import { useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../../context/AuthContext';
import { API } from '../../services/api';
import { Colors, FontSize, Spacing, Radius } from '../../constants/theme';

const OCCUPATIONS = [
  { key: 'self_employed', label: 'Self Employed' },
  { key: 'rideshare', label: 'Rideshare Driver' },
  { key: 'sales_rep', label: 'Sales Representative' },
  { key: 'real_estate', label: 'Real Estate Agent' },
  { key: 'freelancer', label: 'Freelancer' },
  { key: 'other', label: 'Other' },
];

const COUNTRIES = [
  { key: 'US', label: 'United States' },
  { key: 'CA', label: 'Canada' },
  { key: 'GB', label: 'United Kingdom' },
  { key: 'AU', label: 'Australia' },
];

export default function SettingsScreen() {
  const [name, setName] = useState('');
  const [occupation, setOccupation] = useState('self_employed');
  const [country, setCountry] = useState('US');
  const [saving, setSaving] = useState(false);
  const [subscription, setSubscription] = useState<any>(null);
  const { user, token, logout, refreshUser } = useAuth();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  useEffect(() => {
    if (user) {
      setName(user.name || '');
      setOccupation(user.occupation_type || 'self_employed');
      setCountry(user.tax_country || 'US');
    }
    if (token) {
      API.getSubscription(token).then(s => setSubscription(s)).catch(() => {});
    }
  }, [user, token]);

  const handleSaveProfile = async () => {
    setSaving(true);
    try {
      await API.updateProfile(token!, { name, occupation_type: occupation, tax_country: country });
      await refreshUser();
      Alert.alert('Saved', 'Profile updated successfully');
    } catch (e: any) {
      Alert.alert('Error', e.message);
    } finally {
      setSaving(false);
    }
  };

  const handleLogout = () => {
    Alert.alert('Log Out', 'Are you sure you want to log out?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Log Out', style: 'destructive', onPress: async () => {
          await logout();
          router.replace('/(auth)/login');
        }
      }
    ]);
  };

  const tierInfo: Record<string, { label: string; color: string; icon: string }> = {
    free: { label: 'Free Plan', color: Colors.text.tertiary, icon: 'user' },
    pro: { label: 'Pro Plan', color: Colors.brand.primary, icon: 'star' },
    business: { label: 'Business Plan', color: Colors.brand.warning, icon: 'briefcase' },
  };
  const tier = subscription?.tier || user?.subscription_tier || 'free';
  const tierData = tierInfo[tier] || tierInfo.free;

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Text style={styles.title}>Settings</Text>
      </View>

      <ScrollView contentContainerStyle={{ paddingBottom: 100 }}>
        {/* Profile Card */}
        <View testID="profile-card" style={styles.profileCard}>
          <View style={styles.avatarWrap}>
            <Text style={styles.avatarText}>{(user?.name || 'U').charAt(0).toUpperCase()}</Text>
          </View>
          <View style={styles.profileInfo}>
            <Text style={styles.profileName}>{user?.name || 'Driver'}</Text>
            <Text style={styles.profileEmail}>{user?.email}</Text>
            <View style={[styles.tierBadge, { borderColor: tierData.color + '40', backgroundColor: tierData.color + '15' }]}>
              <Feather name={tierData.icon as any} size={11} color={tierData.color} />
              <Text style={[styles.tierBadgeText, { color: tierData.color }]}>{tierData.label}</Text>
            </View>
          </View>
          {tier === 'free' && (
            <TouchableOpacity testID="upgrade-btn-settings" style={styles.upgradeChip} onPress={() => router.push('/subscription')}>
              <Text style={styles.upgradeChipText}>Upgrade</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Profile Edit */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Profile</Text>
          <View style={styles.card}>
            <View style={styles.formGroup}>
              <Text style={styles.formLabel}>Full Name</Text>
              <TextInput
                testID="settings-name-input"
                style={styles.input}
                value={name}
                onChangeText={setName}
                placeholder="Your name"
                placeholderTextColor={Colors.text.tertiary}
              />
            </View>
            <View style={styles.formGroup}>
              <Text style={styles.formLabel}>Occupation</Text>
              <View style={styles.optionGrid}>
                {OCCUPATIONS.map(occ => (
                  <TouchableOpacity
                    key={occ.key}
                    testID={`occ-${occ.key}`}
                    style={[styles.optionBtn, occupation === occ.key && styles.optionBtnActive]}
                    onPress={() => setOccupation(occ.key)}
                  >
                    <Text style={[styles.optionBtnText, occupation === occ.key && styles.optionBtnTextActive]}>{occ.label}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
            <View style={styles.formGroup}>
              <Text style={styles.formLabel}>Tax Country</Text>
              <View style={styles.optionRow}>
                {COUNTRIES.map(c => (
                  <TouchableOpacity
                    key={c.key}
                    testID={`country-${c.key}`}
                    style={[styles.countryBtn, country === c.key && styles.countryBtnActive]}
                    onPress={() => setCountry(c.key)}
                  >
                    <Text style={[styles.countryBtnText, country === c.key && styles.countryBtnTextActive]}>{c.key}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
            <TouchableOpacity testID="save-profile-btn" style={styles.saveBtn} onPress={handleSaveProfile} disabled={saving}>
              {saving ? <ActivityIndicator color={Colors.text.inverse} size="small" /> : <Text style={styles.saveBtnText}>Save Profile</Text>}
            </TouchableOpacity>
          </View>
        </View>

        {/* Subscription */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Subscription</Text>
          <TouchableOpacity testID="subscription-settings-btn" style={styles.settingsRow} onPress={() => router.push('/subscription')}>
            <Feather name="star" size={18} color={Colors.brand.primary} />
            <View style={styles.settingsRowInfo}>
              <Text style={styles.settingsRowTitle}>Plan: {tierData.label}</Text>
              <Text style={styles.settingsRowSub}>{tier === 'free' ? 'Upgrade for unlimited trips + AI features' : 'Active subscription'}</Text>
            </View>
            <Feather name="chevron-right" size={16} color={Colors.text.tertiary} />
          </TouchableOpacity>
        </View>

        {/* App Info */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>App</Text>
          <View style={styles.card}>
            <TouchableOpacity testID="ai-assistant-settings" style={styles.listRow} onPress={() => router.push('/ai/assistant')}>
              <Feather name="zap" size={18} color={Colors.brand.secondary} />
              <Text style={styles.listRowText}>AI Assistant</Text>
              <Feather name="chevron-right" size={16} color={Colors.text.tertiary} />
            </TouchableOpacity>
            <View style={styles.divider} />
            <View style={styles.listRow}>
              <Feather name="shield" size={18} color={Colors.brand.primary} />
              <Text style={styles.listRowText}>IRS Mileage Rate {new Date().getFullYear()}</Text>
              <Text style={styles.listRowValue}>$0.67/mi</Text>
            </View>
            <View style={styles.divider} />
            <View style={styles.listRow}>
              <Feather name="info" size={18} color={Colors.text.tertiary} />
              <Text style={styles.listRowText}>Version</Text>
              <Text style={styles.listRowValue}>1.0.0</Text>
            </View>
          </View>
        </View>

        {/* Logout */}
        <View style={styles.section}>
          <TouchableOpacity testID="logout-btn" style={styles.logoutBtn} onPress={handleLogout}>
            <Feather name="log-out" size={18} color={Colors.brand.accent} />
            <Text style={styles.logoutText}>Log Out</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bg.primary },
  header: { paddingHorizontal: Spacing.screen, paddingVertical: Spacing.md },
  title: { color: Colors.text.primary, fontSize: FontSize.xxl, fontWeight: '800' },
  profileCard: { flexDirection: 'row', alignItems: 'center', marginHorizontal: Spacing.screen, backgroundColor: Colors.bg.secondary, borderRadius: Radius.xl, padding: 16, borderWidth: 1, borderColor: Colors.border, gap: 12, marginBottom: 20 },
  avatarWrap: { width: 56, height: 56, borderRadius: 28, backgroundColor: Colors.brand.primaryDim, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: Colors.brand.primary + '40' },
  avatarText: { color: Colors.brand.primary, fontSize: FontSize.xxl, fontWeight: '800' },
  profileInfo: { flex: 1, gap: 2 },
  profileName: { color: Colors.text.primary, fontSize: FontSize.md, fontWeight: '700' },
  profileEmail: { color: Colors.text.secondary, fontSize: FontSize.xs },
  tierBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start', borderRadius: Radius.full, paddingHorizontal: 8, paddingVertical: 3, borderWidth: 1, marginTop: 4 },
  tierBadgeText: { fontSize: FontSize.xs, fontWeight: '700' },
  upgradeChip: { backgroundColor: Colors.brand.primary, borderRadius: Radius.full, paddingHorizontal: 12, paddingVertical: 6 },
  upgradeChipText: { color: Colors.text.inverse, fontSize: FontSize.xs, fontWeight: '700' },
  section: { paddingHorizontal: Spacing.screen, marginBottom: 20 },
  sectionTitle: { color: Colors.text.secondary, fontSize: FontSize.xs, fontWeight: '700', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 10 },
  card: { backgroundColor: Colors.bg.secondary, borderRadius: Radius.xl, padding: 16, borderWidth: 1, borderColor: Colors.border },
  formGroup: { marginBottom: 16 },
  formLabel: { color: Colors.text.secondary, fontSize: FontSize.xs, fontWeight: '600', marginBottom: 8 },
  input: { backgroundColor: Colors.bg.tertiary, borderRadius: Radius.md, borderWidth: 1, borderColor: Colors.border, paddingHorizontal: 14, paddingVertical: 10, color: Colors.text.primary, fontSize: FontSize.base },
  optionGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  optionBtn: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: Radius.full, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.bg.tertiary },
  optionBtnActive: { backgroundColor: Colors.brand.primaryDim, borderColor: Colors.brand.primary },
  optionBtnText: { color: Colors.text.secondary, fontSize: FontSize.xs, fontWeight: '600' },
  optionBtnTextActive: { color: Colors.brand.primary },
  optionRow: { flexDirection: 'row', gap: 8 },
  countryBtn: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: Radius.md, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.bg.tertiary },
  countryBtnActive: { backgroundColor: Colors.brand.primaryDim, borderColor: Colors.brand.primary },
  countryBtnText: { color: Colors.text.secondary, fontSize: FontSize.sm, fontWeight: '700' },
  countryBtnTextActive: { color: Colors.brand.primary },
  saveBtn: { backgroundColor: Colors.brand.primary, borderRadius: Radius.md, paddingVertical: 12, alignItems: 'center' },
  saveBtnText: { color: Colors.text.inverse, fontSize: FontSize.base, fontWeight: '700' },
  settingsRow: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: Colors.bg.secondary, borderRadius: Radius.xl, padding: 16, borderWidth: 1, borderColor: Colors.border },
  settingsRowInfo: { flex: 1 },
  settingsRowTitle: { color: Colors.text.primary, fontSize: FontSize.sm, fontWeight: '600' },
  settingsRowSub: { color: Colors.text.tertiary, fontSize: FontSize.xs, marginTop: 2 },
  listRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10 },
  listRowText: { flex: 1, color: Colors.text.primary, fontSize: FontSize.sm },
  listRowValue: { color: Colors.text.tertiary, fontSize: FontSize.sm },
  divider: { height: 1, backgroundColor: Colors.border, marginVertical: 2 },
  logoutBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: Colors.brand.accentDim, borderRadius: Radius.xl, padding: 16, borderWidth: 1, borderColor: Colors.brand.accent + '40' },
  logoutText: { color: Colors.brand.accent, fontSize: FontSize.base, fontWeight: '700' },
});
