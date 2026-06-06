import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TextInput,
  TouchableOpacity, Alert, ActivityIndicator, Platform
} from 'react-native';
import { useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors, FontSize, Spacing, Radius } from '../../constants/theme';
import { useAuth } from '../../context/AuthContext';
import { API } from '../../services/api';

interface TeamMember {
  id: string;
  name: string;
  email: string;
  role: 'Driver' | 'Admin';
  status: 'Active' | 'Pending';
  joinedDate: string;
  monthlyMiles: number;
}

const INITIAL_MEMBERS: TeamMember[] = [
  { id: '1', name: 'Sarah Jenkins', email: 'sarah.j@company.com', role: 'Driver', status: 'Active', joinedDate: 'Feb 12, 2026', monthlyMiles: 1420.5 },
  { id: '2', name: 'Alex Rivera', email: 'alex.r@company.com', role: 'Driver', status: 'Active', joinedDate: 'Mar 05, 2026', monthlyMiles: 840.2 },
  { id: '3', name: 'Michael Chen', email: 'm.chen@company.com', role: 'Admin', status: 'Active', joinedDate: 'Jan 20, 2026', monthlyMiles: 340.0 },
  { id: '4', name: 'Emma Watson', email: 'e.watson@company.com', role: 'Driver', status: 'Pending', joinedDate: 'Jun 01, 2026', monthlyMiles: 0 },
];

export default function TeamManagementScreen() {
  const [members, setMembers] = useState<any[]>([]);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteName, setInviteName] = useState('');
  const [inviteRole, setInviteRole] = useState<'Driver' | 'Admin'>('Driver');
  const [inviting, setInviting] = useState(false);
  const [loading, setLoading] = useState(true);
  
  const { user, token, refreshUser } = useAuth();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  useEffect(() => {
    let active = true;
    const loadMembers = async () => {
      if (!token) return;
      try {
        setLoading(true);
        const data = await API.getTeamMembers(token);
        if (active) {
          setMembers(data);
        }
      } catch (e: any) {
        console.log('[Team] Fetch error:', e.message);
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    };
    loadMembers();
    return () => {
      active = false;
    };
  }, [token]);

  const handleSendInvite = async () => {
    if (!inviteEmail.trim() || !inviteName.trim()) {
      Alert.alert('Validation Error', 'Please enter both a name and a valid email.');
      return;
    }

    const tier = user?.subscription_tier || 'free';
    if (tier === 'pro' || tier === 'business') {
      const price = tier === 'pro' ? '$9.99' : '$19.99';
      const planName = tier === 'pro' ? 'Pro' : 'Business';

      const proceedWithPayment = async () => {
        setInviting(true);
        try {
          if (token) {
            const newMember = await API.inviteTeamMember(token, {
              name: inviteName.trim(),
              email: inviteEmail.trim(),
              role: inviteRole,
              subscription_tier: tier
            });
            setMembers(prev => [...prev, newMember]);
            setInviteEmail('');
            setInviteName('');
            setInviteRole('Driver');
            router.push('/subscription');
          }
        } catch (err: any) {
          Alert.alert('Error', err.message || 'Failed to send invitation.');
        } finally {
          setInviting(false);
        }
      };

      const handleCancelDowngrade = async () => {
        setInviting(true);
        try {
          if (token) {
            const newMember = await API.inviteTeamMember(token, {
              name: inviteName.trim(),
              email: inviteEmail.trim(),
              role: inviteRole,
              subscription_tier: 'free'
            });
            setMembers(prev => [...prev, newMember]);
            setInviteEmail('');
            setInviteName('');
            setInviteRole('Driver');
            Alert.alert(
              'Invitation Sent',
              `Invitation sent. Since you opted out of paying, the additional user is defaulted to the Free plan.`
            );
          }
        } catch (err: any) {
          Alert.alert('Error', err.message || 'Failed to send invitation.');
        } finally {
          setInviting(false);
        }
      };

      if (Platform.OS === 'web') {
        const ok = window.confirm(
          `Adding an additional user to your ${planName} plan will charge ${price}/user/month. Press OK to proceed to payment page, or Cancel to downgrade the additional user to the Free plan.`
        );
        if (ok) {
          await proceedWithPayment();
        } else {
          await handleCancelDowngrade();
        }
      } else {
        Alert.alert(
          'Additional User Payment Required',
          `Adding an additional user to your ${planName} plan requires a payment of ${price}/user/month.`,
          [
            {
              text: 'Cancel (Downgrade to Free)',
              onPress: handleCancelDowngrade,
              style: 'destructive'
            },
            {
              text: 'OK (Pay Now)',
              onPress: proceedWithPayment,
              style: 'default'
            }
          ]
        );
      }
      return;
    }

    setInviting(true);
    try {
      if (token) {
        const newMember = await API.inviteTeamMember(token, {
          name: inviteName.trim(),
          email: inviteEmail.trim(),
          role: inviteRole
        });
        setMembers(prev => [...prev, newMember]);
        setInviteEmail('');
        setInviteName('');
        setInviteRole('Driver');
        Alert.alert('Invitation Sent! ✉️', `An invitation has been successfully sent to ${newMember.email}.`);
      }
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to send invitation.');
    } finally {
      setInviting(false);
    }
  };

  const handleRemoveMember = (id: string, name: string) => {
    Alert.alert(
      'Remove Member',
      `Are you sure you want to remove ${name} from your team?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            try {
              if (token) {
                await API.removeTeamMember(token, id);
                setMembers(prev => prev.filter(m => (m.member_id || m.id) !== id));
              }
            } catch (err: any) {
              Alert.alert('Error', err.message || 'Failed to remove member.');
            }
          }
        }
      ]
    );
  };

  const totalTeamMiles = members.reduce((acc, m) => acc + (m.monthly_miles || m.monthlyMiles || 0), 0);
  const activeCount = members.filter(m => m.status === 'Active').length;

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity testID="team-back-btn" onPress={() => router.back()} style={styles.backBtn}>
          <Feather name="arrow-left" size={22} color={Colors.text.primary} />
        </TouchableOpacity>
        <Text style={styles.title}>Team Management</Text>
        <View style={{ width: 34 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Team Stats Summary */}
        <View style={styles.statsRow}>
          <View style={styles.statCard}>
            <Text style={styles.statLabel}>Active Members</Text>
            <Text style={styles.statValue}>{activeCount}</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statLabel}>Total Team Miles</Text>
            <Text style={styles.statValue}>{totalTeamMiles.toFixed(0)} mi</Text>
          </View>
        </View>

        {/* Invite Form */}
        <Text style={styles.sectionTitle}>Invite New Member</Text>
        <View style={styles.card}>
          <View style={styles.formRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.inputLabel}>Name</Text>
              <TextInput
                style={styles.input}
                value={inviteName}
                onChangeText={setInviteName}
                placeholder="Full Name"
                placeholderTextColor={Colors.text.tertiary}
              />
            </View>
            <View style={{ width: 120 }}>
              <Text style={styles.inputLabel}>Role</Text>
              <View style={styles.roleToggleRow}>
                <TouchableOpacity
                  style={[styles.roleSelectBtn, inviteRole === 'Driver' && styles.roleSelectBtnActive]}
                  onPress={() => setInviteRole('Driver')}
                >
                  <Text style={[styles.roleSelectBtnText, inviteRole === 'Driver' && styles.roleSelectBtnTextActive]}>Driver</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.roleSelectBtn, inviteRole === 'Admin' && styles.roleSelectBtnActive]}
                  onPress={() => setInviteRole('Admin')}
                >
                  <Text style={[styles.roleSelectBtnText, inviteRole === 'Admin' && styles.roleSelectBtnTextActive]}>Admin</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>

          <View style={{ marginTop: 12 }}>
            <Text style={styles.inputLabel}>Email Address</Text>
            <TextInput
              style={styles.input}
              value={inviteEmail}
              onChangeText={setInviteEmail}
              keyboardType="email-address"
              autoCapitalize="none"
              placeholder="e.g. employee@company.com"
              placeholderTextColor={Colors.text.tertiary}
            />
          </View>

          <TouchableOpacity style={styles.inviteBtn} onPress={handleSendInvite} disabled={inviting}>
            {inviting ? (
              <ActivityIndicator color={Colors.text.inverse} size="small" />
            ) : (
              <>
                <Feather name="plus" size={16} color={Colors.text.inverse} style={{ marginRight: 6 }} />
                <Text style={styles.inviteBtnText}>Send Invitation</Text>
              </>
            )}
          </TouchableOpacity>
        </View>

        {/* Member Roster */}
        <Text style={styles.sectionTitle}>Team Members</Text>
        <View style={styles.card}>
          {loading ? (
            <ActivityIndicator size="small" color={Colors.brand.primary} style={{ padding: 20 }} />
          ) : members.length === 0 ? (
            <Text style={{ color: Colors.text.tertiary, fontSize: FontSize.sm, textAlign: 'center', padding: 20 }}>No team members invited yet.</Text>
          ) : (
            members.map((member, index) => {
              const memberId = member.member_id || member.id;
              const joinedDate = member.joined_date || member.joinedDate || 'N/A';
              const monthlyMiles = member.monthly_miles || member.monthlyMiles || 0;
              return (
                <View key={memberId}>
                  {index > 0 && <View style={styles.divider} />}
                  <View style={styles.memberRow}>
                    <View style={styles.memberAvatar}>
                      <Text style={styles.avatarText}>{member.name.charAt(0).toUpperCase()}</Text>
                    </View>
                    <View style={styles.memberInfo}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        <Text style={styles.memberName}>{member.name}</Text>
                        <View style={[styles.roleBadge, member.role === 'Admin' ? styles.adminBadge : styles.driverBadge]}>
                          <Text style={styles.roleBadgeText}>{member.role}</Text>
                        </View>
                        {member.status === 'Pending' && (
                          <View style={styles.pendingBadge}>
                            <Text style={styles.pendingBadgeText}>Pending</Text>
                          </View>
                        )}
                      </View>
                      <Text style={styles.memberEmail}>{member.email}</Text>
                      <Text style={styles.memberJoined}>Joined {joinedDate}</Text>
                    </View>
                    <View style={styles.memberMetrics}>
                      {member.status === 'Active' ? (
                        <>
                          <Text style={styles.memberMiles}>{monthlyMiles.toFixed(0)} mi</Text>
                          <Text style={styles.memberMilesLabel}>this month</Text>
                        </>
                      ) : (
                        <Text style={styles.invitedText}>Invited</Text>
                      )}
                      {member.role !== 'Admin' && (
                        <TouchableOpacity
                          onPress={() => handleRemoveMember(memberId, member.name)}
                          style={styles.removeBtn}
                        >
                          <Feather name="trash-2" size={14} color={Colors.brand.accent} />
                        </TouchableOpacity>
                      )}
                    </View>
                  </View>
                </View>
              );
            })
          )}
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
  statsRow: { flexDirection: 'row', gap: 12, marginVertical: 16 },
  statCard: { flex: 1, backgroundColor: Colors.bg.secondary, borderRadius: Radius.xl, padding: 16, borderWidth: 1, borderColor: Colors.border },
  statLabel: { color: Colors.text.secondary, fontSize: FontSize.xs, fontWeight: '600', marginBottom: 6 },
  statValue: { color: Colors.text.primary, fontSize: FontSize.xl, fontWeight: '800' },
  sectionTitle: { color: Colors.text.secondary, fontSize: FontSize.xs, fontWeight: '700', letterSpacing: 1, textTransform: 'uppercase', marginTop: 16, marginBottom: 10 },
  card: { backgroundColor: Colors.bg.secondary, borderRadius: Radius.xl, padding: 16, borderWidth: 1, borderColor: Colors.border },
  formRow: { flexDirection: 'row', gap: 12 },
  inputLabel: { color: Colors.text.secondary, fontSize: FontSize.xs, fontWeight: '600', marginBottom: 6 },
  input: { backgroundColor: Colors.bg.tertiary, borderRadius: Radius.md, borderWidth: 1, borderColor: Colors.border, paddingHorizontal: 12, paddingVertical: 8, color: Colors.text.primary, fontSize: FontSize.sm },
  roleToggleRow: { flexDirection: 'row', borderWidth: 1, borderColor: Colors.border, borderRadius: Radius.md, overflow: 'hidden' },
  roleSelectBtn: { flex: 1, backgroundColor: Colors.bg.tertiary, paddingVertical: 8, alignItems: 'center', justifyContent: 'center' },
  roleSelectBtnActive: { backgroundColor: Colors.brand.primaryDim },
  roleSelectBtnText: { color: Colors.text.secondary, fontSize: FontSize.xs, fontWeight: '600' },
  roleSelectBtnTextActive: { color: Colors.brand.primary },
  inviteBtn: { backgroundColor: Colors.brand.primary, borderRadius: Radius.md, paddingVertical: 10, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', marginTop: 16 },
  inviteBtnText: { color: Colors.text.inverse, fontSize: FontSize.sm, fontWeight: '700' },
  divider: { height: 1, backgroundColor: Colors.border, marginVertical: 12 },
  memberRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  memberAvatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: Colors.brand.primaryDim, alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: Colors.brand.primary, fontSize: FontSize.md, fontWeight: '800' },
  memberInfo: { flex: 1, gap: 2 },
  memberName: { color: Colors.text.primary, fontSize: FontSize.sm, fontWeight: '700' },
  memberEmail: { color: Colors.text.tertiary, fontSize: FontSize.xs },
  memberJoined: { color: Colors.text.tertiary, fontSize: 10 },
  roleBadge: { borderRadius: Radius.full, paddingHorizontal: 6, paddingVertical: 1 },
  adminBadge: { backgroundColor: Colors.brand.warningDim },
  driverBadge: { backgroundColor: Colors.brand.primaryDim },
  roleBadgeText: { fontSize: 9, fontWeight: '800', color: Colors.text.primary },
  pendingBadge: { backgroundColor: Colors.bg.tertiary, borderRadius: Radius.full, paddingHorizontal: 6, paddingVertical: 1 },
  pendingBadgeText: { fontSize: 9, fontWeight: '800', color: Colors.text.secondary },
  memberMetrics: { alignItems: 'flex-end', justifyContent: 'center' },
  memberMiles: { color: Colors.text.primary, fontSize: FontSize.sm, fontWeight: '700' },
  memberMilesLabel: { color: Colors.text.tertiary, fontSize: 9 },
  invitedText: { color: Colors.text.tertiary, fontSize: FontSize.xs, fontStyle: 'italic' },
  removeBtn: { padding: 4, marginTop: 4 },
});
