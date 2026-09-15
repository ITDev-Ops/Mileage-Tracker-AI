import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  Alert, ActivityIndicator, Platform, Linking
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import * as ExpoLinking from 'expo-linking';
import { Feather } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../../context/AuthContext';
import { API } from '../../services/api';
import { Colors, FontSize, Spacing, Radius } from '../../constants/theme';

const PLANS = [
  {
    key: 'free',
    name: 'Free',
    price: '$0',
    period: '/user/month',
    color: Colors.text.tertiary,
    features: ['40 trips or 200 miles/user/month', 'Manual entry unlimited', 'Basic reports', 'CSV export'],
    notIncluded: ['AI auto-classification', 'Receipt scanning', 'PDF tax reports', 'Unlimited trips'],
    cta: 'Current Plan',
    popular: false,
  },
  {
    key: 'pro',
    name: 'Pro',
    price: '$9.99',
    period: '/user/month',
    color: Colors.brand.primary,
    features: ['Unlimited trips', 'AI auto-classification', 'Receipt OCR scanning', 'PDF + CSV tax reports', 'AI Tax Optimizer', 'Priority support', 'Team management', 'Admin dashboard', 'API access'],
    notIncluded: [],
    cta: 'Upgrade to Pro',
    popular: true,
  },
  {
    key: 'business',
    name: 'Business',
    price: '$19.99',
    period: '/user/month',
    color: Colors.brand.warning,
    features: ['Everything in Pro', 'Team management', 'Admin dashboard', 'Fleet tracking', 'API access', 'Custom reports'],
    notIncluded: [],
    cta: 'Upgrade to Business',
    popular: false,
  },
];

export default function SubscriptionScreen() {
  const { session_id } = useLocalSearchParams<{ session_id?: string }>();
  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const [checkingPayment, setCheckingPayment] = useState(false);
  const [currentTier, setCurrentTier] = useState('free');
  const [errorMsg, setErrorMsg] = useState('');
  const { token, user, refreshUser, loading: authLoading } = useAuth();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [subDetails, setSubDetails] = useState<any>(null);
  const [retryingPayment, setRetryingPayment] = useState(false);

  console.log('[Subscription] Rendering - authLoading:', authLoading, 'user:', user?.email, 'token:', token ? 'present' : 'null');

  const fetchSubscriptionDetails = async () => {
    if (!token) return;
    try {
      const data = await API.getSubscription(token);
      setSubDetails(data);
      if (data?.tier) {
        setCurrentTier(data.tier);
      }
    } catch (err) {
      console.log('Error fetching subscription details:', err);
    }
  };

  useEffect(() => {
    setCurrentTier(user?.subscription_tier || 'free');
    if (token) {
      fetchSubscriptionDetails();
    }
  }, [user, token]);

  const handleManualRetryPayment = async () => {
    if (!token) return;
    setRetryingPayment(true);
    try {
      const res = await API.retryPayment(token);
      if (res.status === 'success') {
        await refreshUser();
        await fetchSubscriptionDetails();
        if (Platform.OS === 'web') {
          alert('🎉 Payment Successful! Your subscription is now fully active.');
        } else {
          Alert.alert('🎉 Payment Successful!', 'Your payment has been processed and your subscription is active.');
        }
      } else {
        const msg = res.reason || 'Payment retry failed';
        if (Platform.OS === 'web') { alert('Payment Failed: ' + msg); }
        else { Alert.alert('Payment Failed', msg); }
      }
    } catch (e: any) {
      const msg = e.message || 'Error processing payment retry';
      if (Platform.OS === 'web') { alert('Error: ' + msg); }
      else { Alert.alert('Error', msg); }
    } finally {
      setRetryingPayment(false);
    }
  };

  // Redirect to login if not authenticated (after auth loading is done)
  useEffect(() => {
    if (!authLoading && !user) {
      console.log('[Subscription] No user, redirecting to login...');
      router.push('/(auth)/login');
    }
  }, [authLoading, user]);

  // Check payment status if returning from Stripe
  useEffect(() => {
    if (session_id && token) {
      setCheckingPayment(true);
      const poll = async (attempt = 0) => {
        if (attempt >= 5) { setCheckingPayment(false); return; }
        try {
          const status = await API.getPaymentStatus(token, session_id);
          if (status.payment_status === 'paid') {
            await refreshUser();
            await fetchSubscriptionDetails();
            setCheckingPayment(false);
            const planName = status.plan ? (status.plan.charAt(0).toUpperCase() + status.plan.slice(1)) : 'Pro';
            if (Platform.OS === 'web') {
              alert(`🎉 Subscription Activated! Welcome to the ${planName} Plan!`);
              router.push('/(tabs)/dashboard');
            } else {
              Alert.alert(
                '🎉 Subscription Activated!',
                `Welcome to the ${planName} Plan! You now have access to all premium features.`,
                [
                  {
                    text: 'OK',
                    onPress: () => {
                      setTimeout(() => {
                        router.push('/(tabs)/dashboard');
                      }, 100);
                    }
                  }
                ]
              );
            }
          } else if (status.status === 'expired') {
            setCheckingPayment(false);
          } else {
            setTimeout(() => poll(attempt + 1), 2000);
          }
        } catch {
          setCheckingPayment(false);
        }
      };
      poll();
    }
  }, [session_id, token]);

  const handleSubscribe = async (planKey: string) => {
    if (planKey === 'free') return;
    if (user?.invited_team_plan) {
      const plansOrder = ['free', 'pro', 'business'];
      const planIndex = plansOrder.indexOf(planKey);
      const reqIndex = plansOrder.indexOf(user.invited_team_plan);
      if (planIndex < reqIndex) {
        Alert.alert(
          'Higher Plan Required',
          `Your team is on the ${user.invited_team_plan.toUpperCase()} plan. You must upgrade to the ${user.invited_team_plan.toUpperCase()} plan or higher to gain access.`,
          [{ text: 'OK' }]
        );
        return;
      }
    }
    if (planKey === currentTier) {
      if (Platform.OS === 'web') {
        alert(`You are already on the ${planKey} plan!`);
      } else {
        Alert.alert('Current Plan', `You are already on the ${planKey} plan!`);
      }
      return;
    }
    setCheckoutLoading(true);
    try {
      let originUrl = '';
      if (Platform.OS === 'web' && typeof window !== 'undefined') {
        originUrl = window.location.origin;
      } else {
        // Must use the Expo deep linking origin to route backward into the app after session creation!
        originUrl = ExpoLinking.createURL('');
        // Clean up trailing slashes so deep link parses gracefully
        if (originUrl.endsWith('/')) {
            originUrl = originUrl.slice(0, -1);
        }
      }
      const result = await API.createCheckout(token!, planKey, originUrl);
      if (Platform.OS === 'web' && typeof window !== 'undefined') {
        window.location.href = result.url;
      } else {
        // Prevent hard reloading Expo during mocked mock integrations when URL is actually a local app deep link.
        if (result.url.includes('/subscription?')) {
            const qs = result.url.split('/subscription?')[1];
            router.push(`/subscription?${qs}`);
        } else {
            // Live Stripe URL
            await Linking.openURL(result.url);
        }
      }
    } catch (e: any) {
      const errMsg = e.message || 'Could not initiate checkout';
      setErrorMsg(errMsg);
      if (Platform.OS === 'web') {
        alert('Error: ' + errMsg);
      } else {
        Alert.alert('Error', errMsg);
      }
    } finally {
      setCheckoutLoading(false);
    }
  };

  // Show loading while auth is being determined - with dark background
  if (authLoading || !user) {
    return (
      <View style={[styles.container, styles.loadingContainer]}>
        <ActivityIndicator size="large" color={Colors.brand.primary} />
        <Text style={styles.loadingText}>Loading subscription plans...</Text>
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <TouchableOpacity testID="sub-back-btn" onPress={() => router.back()} style={styles.backBtn}>
          <Feather name="arrow-left" size={22} color={Colors.text.primary} />
        </TouchableOpacity>
        <Text style={styles.title}>Choose Your Plan</Text>
        <View style={{ width: 34 }} />
      </View>

      {checkingPayment && (
        <View testID="payment-checking-banner" style={styles.paymentCheckBanner}>
          <ActivityIndicator size="small" color={Colors.brand.primary} />
          <Text style={styles.paymentCheckText}>Verifying payment...</Text>
        </View>
      )}

      <ScrollView contentContainerStyle={{ paddingBottom: 100, paddingHorizontal: Spacing.screen }}>
        {user?.invited_team_plan && (
          <View style={styles.teamNotice} testID="team-notice-banner">
            <Feather name="info" size={14} color={Colors.brand.warning} />
            <Text style={styles.teamNoticeText}>
              You have been invited to a team on the {user.invited_team_plan.toUpperCase()} plan. To join this team, please subscribe to the {user.invited_team_plan.toUpperCase()} plan below.
            </Text>
          </View>
        )}

        {subDetails?.subscription_status === 'past_due_retry' && (
          <View style={styles.pastDueBanner} testID="past-due-retry-banner">
            <View style={styles.bannerHeader}>
              <Feather name="alert-triangle" size={20} color={Colors.brand.warning} />
              <Text style={styles.pastDueTitle}>Payment Failed: Insufficient Funds</Text>
            </View>
            <Text style={styles.pastDueText}>
              Your recent monthly payment attempt returned as no funds available. A second payment attempt will be made in 1 week's time{subDetails?.retry_at ? ` on ${new Date(subDetails.retry_at).toLocaleDateString()}` : ''}. You can also initiate payment now to keep your subscription active without interruption.
            </Text>
            <TouchableOpacity
              testID="initiate-payment-past-due-btn"
              style={styles.retryPaymentBtn}
              onPress={handleManualRetryPayment}
              disabled={retryingPayment}
            >
              {retryingPayment ? (
                <ActivityIndicator color={Colors.text.inverse} size="small" />
              ) : (
                <Text style={styles.retryPaymentBtnText}>Initiate Payment Now</Text>
              )}
            </TouchableOpacity>
          </View>
        )}

        {subDetails?.subscription_status === 'grace_period' && (
          <View style={styles.gracePeriodBanner} testID="grace-period-banner">
            <View style={styles.bannerHeader}>
              <Feather name="alert-circle" size={22} color={Colors.brand.danger} />
              <Text style={styles.gracePeriodTitle}>Grace Period Active (2 Days Remaining)</Text>
            </View>
            <Text style={styles.gracePeriodText}>
              Your second payment attempt also returned as no funds available. You will be moved to the Free plan if payment is not received{subDetails?.grace_period_ends_at ? ` by ${new Date(subDetails.grace_period_ends_at).toLocaleString()}` : ''}. Please initiate payment to continue using your subscription, or download and secure your data now.
            </Text>
            <View style={styles.graceActionRow}>
              <TouchableOpacity
                testID="initiate-payment-grace-btn"
                style={styles.gracePayBtn}
                onPress={handleManualRetryPayment}
                disabled={retryingPayment}
              >
                {retryingPayment ? (
                  <ActivityIndicator color={Colors.text.inverse} size="small" />
                ) : (
                  <Text style={styles.gracePayBtnText}>Initiate Payment to Continue</Text>
                )}
              </TouchableOpacity>
              <TouchableOpacity
                testID="download-data-grace-btn"
                style={styles.graceDownloadBtn}
                onPress={() => router.push('/(tabs)/reports')}
              >
                <Feather name="download" size={14} color={Colors.brand.primary} />
                <Text style={styles.graceDownloadBtnText}>Secure Data</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
        <Text style={styles.subtitle}>Unlock AI-powered mileage tracking & maximize your tax deductions</Text>

        {PLANS.map(plan => {
          const isCurrentPlan = currentTier === plan.key;
          const borderColor = isCurrentPlan ? plan.color : plan.popular ? plan.color + '40' : Colors.border;

          return (
            <View
              key={plan.key}
              testID={`plan-${plan.key}`}
              style={[styles.planCard, { borderColor }, plan.popular && styles.popularCard]}
            >
              {plan.popular && (
                <View style={styles.popularBadge}>
                  <Text style={styles.popularBadgeText}>⭐ MOST POPULAR</Text>
                </View>
              )}
              <View style={styles.planHeader}>
                <View>
                  <Text style={[styles.planName, { color: plan.color === Colors.text.tertiary ? Colors.text.primary : plan.color }]}>{plan.name}</Text>
                  {isCurrentPlan && (
                    <View style={styles.currentBadge}>
                      <Text style={styles.currentBadgeText}>CURRENT PLAN</Text>
                    </View>
                  )}
                </View>
                <View style={styles.priceWrap}>
                  <Text style={[styles.planPrice, { color: plan.color === Colors.text.tertiary ? Colors.text.primary : plan.color }]}>{plan.price}</Text>
                  <Text style={styles.planPeriod}>{plan.period}</Text>
                </View>
              </View>

              <View style={styles.featuresWrap}>
                {plan.features.map((f, i) => (
                  <View key={i} style={styles.featureRow}>
                    <Feather name="check" size={14} color={plan.color === Colors.text.tertiary ? Colors.brand.primary : plan.color} />
                    <Text style={styles.featureText}>{f}</Text>
                  </View>
                ))}
                {plan.notIncluded.map((f, i) => (
                  <View key={`no-${i}`} style={styles.featureRow}>
                    <Feather name="x" size={14} color={Colors.text.tertiary} />
                    <Text style={[styles.featureText, { color: Colors.text.tertiary, textDecorationLine: 'line-through' }]}>{f}</Text>
                  </View>
                ))}
              </View>

              {plan.key !== 'free' && (
                <TouchableOpacity
                  testID={`subscribe-${plan.key}`}
                  style={[
                    styles.ctaBtn,
                    { backgroundColor: isCurrentPlan ? plan.color + '20' : plan.color },
                    isCurrentPlan && { borderWidth: 1, borderColor: plan.color }
                  ]}
                  onPress={() => handleSubscribe(plan.key)}
                  disabled={checkoutLoading || isCurrentPlan}
                >
                  {checkoutLoading ? <ActivityIndicator color={isCurrentPlan ? plan.color : Colors.text.inverse} size="small" /> : (
                    <Text style={[styles.ctaBtnText, { color: isCurrentPlan ? plan.color : (plan.color === Colors.text.tertiary ? Colors.text.primary : Colors.text.inverse) }]}>
                      {isCurrentPlan ? '✓ Active' : plan.cta}
                    </Text>
                  )}
                </TouchableOpacity>
              )}
            </View>
          );
        })}

        {/* Security Note */}
        <View style={styles.secureNote}>
          <Feather name="lock" size={13} color={Colors.text.tertiary} />
          <Text style={styles.secureNoteText}>Powered by Stripe · Cancel anytime · Secure payments</Text>
        </View>

        {/* IRS Guarantee */}
        <View style={styles.irsCard}>
          <Feather name="shield" size={18} color={Colors.brand.primary} />
          <View style={styles.irsInfo}>
            <Text style={styles.irsTitle}>IRS Compliance Guaranteed</Text>
            <Text style={styles.irsDesc}>All mileage records meet IRS Form 2106 requirements. Export audit-ready reports at any time.</Text>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bg.primary },
  teamNotice: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: Colors.brand.warningDim, borderRadius: Radius.md, padding: 12, marginBottom: 16, borderWidth: 1, borderColor: Colors.brand.warning + '40' },
  teamNoticeText: { flex: 1, color: Colors.brand.warning, fontSize: FontSize.xs, lineHeight: 16 },
  pastDueBanner: { backgroundColor: Colors.brand.warningDim, borderRadius: Radius.xl, padding: 16, marginBottom: 20, borderWidth: 1, borderColor: Colors.brand.warning + '50' },
  pastDueTitle: { color: Colors.brand.warning, fontSize: FontSize.md, fontWeight: '700' },
  pastDueText: { color: Colors.text.primary, fontSize: FontSize.xs, lineHeight: 18, marginVertical: 8 },
  retryPaymentBtn: { backgroundColor: Colors.brand.warning, borderRadius: Radius.md, paddingVertical: 10, alignItems: 'center', marginTop: 4 },
  retryPaymentBtnText: { color: Colors.text.inverse, fontSize: FontSize.sm, fontWeight: '700' },
  gracePeriodBanner: { backgroundColor: Colors.brand.dangerDim || '#FF3D0020', borderRadius: Radius.xl, padding: 16, marginBottom: 20, borderWidth: 1, borderColor: Colors.brand.danger + '60' },
  gracePeriodTitle: { color: Colors.brand.danger, fontSize: FontSize.md, fontWeight: '800' },
  gracePeriodText: { color: Colors.text.primary, fontSize: FontSize.xs, lineHeight: 18, marginVertical: 8 },
  graceActionRow: { flexDirection: 'row', gap: 10, marginTop: 8 },
  gracePayBtn: { flex: 2, backgroundColor: Colors.brand.danger, borderRadius: Radius.md, paddingVertical: 10, alignItems: 'center' },
  gracePayBtnText: { color: Colors.text.inverse, fontSize: FontSize.sm, fontWeight: '700' },
  graceDownloadBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: Colors.bg.secondary, borderWidth: 1, borderColor: Colors.brand.primary, borderRadius: Radius.md, paddingVertical: 10 },
  graceDownloadBtnText: { color: Colors.brand.primary, fontSize: FontSize.xs, fontWeight: '700' },
  bannerHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  loadingContainer: { alignItems: 'center', justifyContent: 'center' },
  loadingText: { color: Colors.text.secondary, fontSize: FontSize.sm, marginTop: 12 },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: Spacing.screen, paddingVertical: 12 },
  backBtn: { padding: 6 },
  title: { flex: 1, color: Colors.text.primary, fontSize: FontSize.lg, fontWeight: '800', textAlign: 'center' },
  subtitle: { color: Colors.text.secondary, fontSize: FontSize.sm, textAlign: 'center', marginBottom: 24, lineHeight: 20 },
  paymentCheckBanner: { flexDirection: 'row', alignItems: 'center', gap: 10, marginHorizontal: Spacing.screen, backgroundColor: Colors.brand.primaryDim, borderRadius: Radius.md, padding: 12, marginBottom: 12 },
  paymentCheckText: { color: Colors.brand.primary, fontSize: FontSize.sm, fontWeight: '600' },
  planCard: { backgroundColor: Colors.bg.secondary, borderRadius: Radius.xl, padding: 20, borderWidth: 1, marginBottom: 16 },
  popularCard: { backgroundColor: Colors.bg.secondary },
  popularBadge: { backgroundColor: Colors.brand.primaryDim, borderRadius: Radius.full, paddingHorizontal: 10, paddingVertical: 4, alignSelf: 'flex-start', marginBottom: 10, borderWidth: 1, borderColor: Colors.brand.primary + '40' },
  popularBadgeText: { color: Colors.brand.primary, fontSize: 10, fontWeight: '800', letterSpacing: 0.5 },
  planHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 },
  planName: { fontSize: FontSize.xl, fontWeight: '800' },
  currentBadge: { backgroundColor: Colors.bg.tertiary, borderRadius: Radius.full, paddingHorizontal: 8, paddingVertical: 2, marginTop: 4 },
  currentBadgeText: { color: Colors.text.tertiary, fontSize: 9, fontWeight: '800', letterSpacing: 0.8 },
  priceWrap: { alignItems: 'flex-end' },
  planPrice: { fontSize: FontSize.xxxl, fontWeight: '900' },
  planPeriod: { color: Colors.text.tertiary, fontSize: FontSize.xs },
  featuresWrap: { gap: 8, marginBottom: 16 },
  featureRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  featureText: { color: Colors.text.primary, fontSize: FontSize.sm },
  ctaBtn: { borderRadius: Radius.md, paddingVertical: 13, alignItems: 'center' },
  ctaBtnText: { fontSize: FontSize.base, fontWeight: '700' },
  secureNote: { flexDirection: 'row', alignItems: 'center', gap: 6, justifyContent: 'center', marginBottom: 16 },
  secureNoteText: { color: Colors.text.tertiary, fontSize: FontSize.xs },
  irsCard: { flexDirection: 'row', gap: 12, backgroundColor: Colors.bg.secondary, borderRadius: Radius.xl, padding: 16, borderWidth: 1, borderColor: Colors.brand.primary + '30', marginBottom: 8 },
  irsInfo: { flex: 1 },
  irsTitle: { color: Colors.text.primary, fontSize: FontSize.sm, fontWeight: '700', marginBottom: 4 },
  irsDesc: { color: Colors.text.secondary, fontSize: FontSize.xs, lineHeight: 18 },
});
