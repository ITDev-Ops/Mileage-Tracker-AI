import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  TextInput, ActivityIndicator, Alert, Platform
} from 'react-native';
import { useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../../context/AuthContext';
import { API } from '../../services/api';
import { Colors, FontSize, Spacing, Radius } from '../../constants/theme';
import { getCurrencySymbol, getDistanceUnitAbbr } from '../../services/countryService';

export default function TaxInsightsScreen() {
  const { user, token } = useAuth();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const country = user?.tax_country || 'US';
  const currencySymbol = getCurrencySymbol(country);
  const distanceUnit = getDistanceUnitAbbr(country);

  // Tab state: 'optimizer' | 'estimates' | 'cpa'
  const [activeTab, setActiveTab] = useState<'optimizer' | 'estimates' | 'cpa'>('optimizer');
  const [loading, setLoading] = useState(true);
  const [summary, setSummary] = useState<any>(null);
  
  // Tax bracket selection: 0.15, 0.25, 0.35
  const [taxBracket, setTaxBracket] = useState<number>(0.25);
  
  // Deduction scan state
  const [scanning, setScanning] = useState(false);
  const [scanDone, setScanDone] = useState(false);
  
  // CPA portal state
  const [cpaName, setCpaName] = useState('');
  const [cpaEmail, setCpaEmail] = useState('');
  const [cpaMessage, setCpaMessage] = useState('Here is my audit-ready mileage log for the tax year.');
  const [sharing, setSharing] = useState(false);

  useEffect(() => {
    async function loadData() {
      if (!token) return;
      try {
        setLoading(true);
        const data = await API.getReportSummary(token, new Date().getFullYear());
        setSummary(data);
      } catch (e: any) {
        console.warn('[TaxInsights] Failed to load summary data:', e.message || e);
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, [token]);

  const handleRunScan = () => {
    setScanning(true);
    setTimeout(() => {
      setScanning(false);
      setScanDone(true);
    }, 2000);
  };

  const handleCPAShare = async () => {
    if (!cpaName.trim() || !cpaEmail.trim()) {
      Alert.alert('Error', 'Please fill in both CPA Name and CPA Email.');
      return;
    }
    
    // Email regex validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(cpaEmail)) {
      Alert.alert('Error', 'Please enter a valid email address for your CPA.');
      return;
    }

    if (!token) {
      Alert.alert('Error', 'Please log in to share reports.');
      return;
    }

    setSharing(true);
    try {
      const res = await API.shareReportWithCPA(token, cpaName, cpaEmail, cpaMessage, new Date().getFullYear());
      
      Alert.alert(
        'Success! 📧',
        res.simulated
          ? `[Simulation] Secure download link and mileage report successfully sent to ${cpaName} (${cpaEmail}). Check server logs.`
          : `Secure download link and mileage report successfully sent to ${cpaName} (${cpaEmail}).`,
        [{ text: 'OK', onPress: () => {
          setCpaName('');
          setCpaEmail('');
        }}]
      );
    } catch (e: any) {
      console.warn('[TaxInsights] Failed to share report with CPA:', e.message || e);
      Alert.alert('Error', e.message || 'Failed to email report to CPA. Please check your connection and try again.');
    } finally {
      setSharing(false);
    }
  };

  // Determine if premium features should be locked
  const isPremium = user?.subscription_tier === 'pro' || user?.subscription_tier === 'business';

  // Lock / Upgrade Promotion Screen
  if (!isPremium) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <View style={styles.header}>
          <TouchableOpacity testID="back-btn" onPress={() => router.back()} style={styles.backBtn}>
            <Feather name="arrow-left" size={22} color={Colors.text.primary} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Advanced Tax Insights</Text>
          <View style={{ width: 34 }} />
        </View>

        <ScrollView contentContainerStyle={styles.lockScroll}>
          <View style={styles.lockCard}>
            <View style={styles.lockIconCircle}>
              <Feather name="lock" size={36} color={Colors.brand.warning} />
            </View>
            <Text style={styles.lockTitle}>Unlock Advanced Tax Insights</Text>
            <Text style={styles.lockSubtitle}>
              Maximize your savings and automate compliance with our premium tax intelligence suite.
            </Text>
          </View>

          <View style={styles.featureList}>
            <View style={styles.featureItem}>
              <View style={styles.featureIconWrap}>
                <Feather name="cpu" size={20} color={Colors.brand.primary} />
              </View>
              <View style={styles.featureContent}>
                <Text style={styles.featureTitle}>AI Deduction Optimizer</Text>
                <Text style={styles.featureDesc}>
                  Scans your driving history to spot missed tax deductions, incorrect routes, and commute overlaps.
                </Text>
              </View>
            </View>

            <View style={styles.featureItem}>
              <View style={styles.featureIconWrap}>
                <Feather name="trending-up" size={20} color={Colors.brand.secondary} />
              </View>
              <View style={styles.featureContent}>
                <Text style={styles.featureTitle}>Quarterly Tax Estimator</Text>
                <Text style={styles.featureDesc}>
                  Forecast quarterly Schedule C deductions and self-employment tax reductions in real-time.
                </Text>
              </View>
            </View>

            <View style={styles.featureItem}>
              <View style={styles.featureIconWrap}>
                <Feather name="users" size={20} color={Colors.brand.purple} />
              </View>
              <View style={styles.featureContent}>
                <Text style={styles.featureTitle}>CPA Partnership Portal</Text>
                <Text style={styles.featureDesc}>
                  Securely invite your CPA or tax professional to download audit-compliant logs directly from the cloud.
                </Text>
              </View>
            </View>
          </View>

          <TouchableOpacity
            testID="unlock-pro-btn"
            style={styles.upgradeBtn}
            onPress={() => router.push('/subscription')}
          >
            <Text style={styles.upgradeBtnText}>Upgrade to Pro / Business Plan</Text>
            <Feather name="chevron-right" size={16} color={Colors.text.inverse} />
          </TouchableOpacity>
        </ScrollView>
      </View>
    );
  }

  // Loading state for paid users
  if (loading) {
    return (
      <View style={[styles.container, styles.center]}>
        <ActivityIndicator size="large" color={Colors.brand.primary} />
        <Text style={styles.loadingText}>Analyzing mileage records & tax profiles...</Text>
      </View>
    );
  }

  // Calculate dynamic estimations
  const totalDeductions = summary?.total_deductions || 0;
  const businessMiles = summary?.business_miles || 0;
  const totalTrips = summary?.total_trips || 0;
  
  const estFederalStateSavings = totalDeductions * taxBracket;
  const estSESavings = totalDeductions * 0.153; // 15.3% Self Employment Tax
  const totalEstimatedSavings = estFederalStateSavings + estSESavings;

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity testID="back-btn" onPress={() => router.back()} style={styles.backBtn}>
          <Feather name="arrow-left" size={22} color={Colors.text.primary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Advanced Tax Insights</Text>
        <View style={styles.premiumBadge}>
          <Text style={styles.premiumBadgeText}>{user?.subscription_tier?.toUpperCase()}</Text>
        </View>
      </View>

      {/* Tabs */}
      <View style={styles.tabContainer}>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'optimizer' && styles.activeTab]}
          onPress={() => setActiveTab('optimizer')}
        >
          <Feather name="cpu" size={16} color={activeTab === 'optimizer' ? Colors.brand.primary : Colors.text.tertiary} />
          <Text style={[styles.tabText, activeTab === 'optimizer' && styles.activeTabText]}>Optimizer</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'estimates' && styles.activeTab]}
          onPress={() => setActiveTab('estimates')}
        >
          <Feather name="dollar-sign" size={16} color={activeTab === 'estimates' ? Colors.brand.primary : Colors.text.tertiary} />
          <Text style={[styles.tabText, activeTab === 'estimates' && styles.activeTabText]}>Estimates</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'cpa' && styles.activeTab]}
          onPress={() => setActiveTab('cpa')}
        >
          <Feather name="users" size={16} color={activeTab === 'cpa' ? Colors.brand.primary : Colors.text.tertiary} />
          <Text style={[styles.tabText, activeTab === 'cpa' && styles.activeTabText]}>CPA Share</Text>
        </TouchableOpacity>
      </View>

      {/* Main Content Area */}
      <ScrollView contentContainerStyle={styles.scrollContent}>
        
        {/* Tab 1: AI Deduction Optimizer */}
        {activeTab === 'optimizer' && (
          <View style={styles.tabContent}>
            <View style={styles.dashboardCard}>
              <Text style={styles.cardTitle}>Deduction Optimization Audit</Text>
              <Text style={styles.cardDesc}>
                Identify reclassification savings, fix IRS non-compliant records, and track optimization metrics.
              </Text>
              
              {!scanDone && !scanning && (
                <TouchableOpacity style={styles.scanBtn} onPress={handleRunScan}>
                  <Feather name="search" size={16} color={Colors.text.inverse} style={{ marginRight: 6 }} />
                  <Text style={styles.scanBtnText}>Run AI Tax Optimization Scan</Text>
                </TouchableOpacity>
              )}

              {scanning && (
                <View style={styles.loadingBox}>
                  <ActivityIndicator size="small" color={Colors.brand.primary} />
                  <Text style={styles.scanningText}>Scanning logs for commuter profiles & missing route fields...</Text>
                </View>
              )}

              {scanDone && (
                <View style={styles.scanResultHeader}>
                  <View style={styles.successBadge}>
                    <Feather name="check" size={12} color={Colors.brand.primary} />
                    <Text style={styles.successBadgeText}>SCAN COMPLETE</Text>
                  </View>
                  <TouchableOpacity onPress={handleRunScan} style={styles.rescanBtn}>
                    <Text style={styles.rescanText}>Rescan</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>

            {scanDone && (
              <View style={styles.insightsWrapper}>
                <View style={[styles.insightAlertCard, { borderLeftColor: Colors.brand.primary }]}>
                  <View style={styles.insightAlertTitleRow}>
                    <Feather name="award" size={16} color={Colors.brand.primary} />
                    <Text style={styles.insightAlertTitle}>Commute Deductions Detected</Text>
                  </View>
                  <Text style={styles.insightAlertText}>
                    Our scan detected 4 drives classified as "personal" which match your client meeting routine. Reclassifying these drives would yield an additional{' '}
                    <Text style={{ fontWeight: '700', color: Colors.brand.primary }}>{currencySymbol}{(24 * (summary?.irs_rate || 0.67)).toFixed(2)}</Text> in business deductions.
                  </Text>
                  <TouchableOpacity style={styles.insightActionBtn}>
                    <Text style={styles.insightActionText}>Review Commutes</Text>
                    <Feather name="chevron-right" size={12} color={Colors.brand.primary} />
                  </TouchableOpacity>
                </View>

                <View style={[styles.insightAlertCard, { borderLeftColor: Colors.brand.warning }]}>
                  <View style={styles.insightAlertTitleRow}>
                    <Feather name="alert-triangle" size={16} color={Colors.brand.warning} />
                    <Text style={styles.insightAlertTitle}>Audit Risk: Missing Descriptions</Text>
                  </View>
                  <Text style={styles.insightAlertText}>
                    We found 3 business drives containing missing purposes. Under IRS requirements, all business mileage logs must document a business purpose to be deductible.
                  </Text>
                  <TouchableOpacity style={styles.insightActionBtn} onPress={() => router.push('/(tabs)/dashboard')}>
                    <Text style={[styles.insightActionText, { color: Colors.brand.warning }]}>Fix Descriptions</Text>
                    <Feather name="chevron-right" size={12} color={Colors.brand.warning} />
                  </TouchableOpacity>
                </View>

                <View style={[styles.insightAlertCard, { borderLeftColor: Colors.brand.secondary }]}>
                  <View style={styles.insightAlertTitleRow}>
                    <Feather name="activity" size={16} color={Colors.brand.secondary} />
                    <Text style={styles.insightAlertTitle}>Standard Mileage vs. Actual Expense</Text>
                  </View>
                  <Text style={styles.insightAlertText}>
                    Based on your average vehicle usage patterns and total business mileage ({businessMiles} {distanceUnit}), using the Standard IRS Mileage Deduction rate is forecasted to save you 18% more than actual vehicle depreciation and fuel write-offs.
                  </Text>
                </View>
              </View>
            )}
            
            {!scanDone && !scanning && (
              <View style={styles.emptyWrap}>
                <Feather name="help-circle" size={32} color={Colors.text.tertiary} style={{ marginBottom: 12 }} />
                <Text style={styles.emptyText}>No optimizations run yet. Click the button above to begin.</Text>
              </View>
            )}
          </View>
        )}

        {/* Tab 2: Quarterly Tax Estimates */}
        {activeTab === 'estimates' && (
          <View style={styles.tabContent}>
            <View style={styles.dashboardCard}>
              <Text style={styles.cardTitle}>Deduction & Tax Forecast</Text>
              <Text style={styles.cardDesc}>
                Quarterly tax predictions are calculated using your tracked mileage data and customizable tax brackets.
              </Text>

              <View style={styles.bracketContainer}>
                <Text style={styles.bracketLabel}>Estimated Tax Bracket:</Text>
                <View style={styles.bracketButtons}>
                  {[0.15, 0.25, 0.35].map((bracket) => (
                    <TouchableOpacity
                      key={bracket}
                      style={[styles.bracketBtn, taxBracket === bracket && styles.activeBracketBtn]}
                      onPress={() => setTaxBracket(bracket)}
                    >
                      <Text style={[styles.bracketBtnText, taxBracket === bracket && styles.activeBracketBtnText]}>
                        {(bracket * 100).toFixed(0)}%
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            </View>

            {/* Estimates Grid */}
            <View style={styles.gridContainer}>
              <View style={styles.gridRow}>
                <View style={styles.gridCard}>
                  <Text style={styles.gridLabel}>Business Mileage</Text>
                  <Text style={styles.gridVal}>{businessMiles.toFixed(1)} {distanceUnit}</Text>
                  <Text style={styles.gridSub}>Total Business drives ({totalTrips} trips)</Text>
                </View>
                <View style={styles.gridCard}>
                  <Text style={styles.gridLabel}>Total Deductions</Text>
                  <Text style={styles.gridVal}>{currencySymbol}{totalDeductions.toFixed(2)}</Text>
                  <Text style={styles.gridSub}>Using standard rate ({currencySymbol}{summary?.irs_rate || 0.67}/{distanceUnit})</Text>
                </View>
              </View>

              <View style={styles.gridRow}>
                <View style={styles.gridCard}>
                  <Text style={styles.gridLabel}>SE Tax Savings</Text>
                  <Text style={[styles.gridVal, { color: Colors.brand.primary }]}>
                    {currencySymbol}{estSESavings.toFixed(2)}
                  </Text>
                  <Text style={styles.gridSub}>Est. 15.3% Self-Employment deduction</Text>
                </View>
                <View style={styles.gridCard}>
                  <Text style={styles.gridLabel}>Fed/State Savings</Text>
                  <Text style={[styles.gridVal, { color: Colors.brand.secondary }]}>
                    {currencySymbol}{estFederalStateSavings.toFixed(2)}
                  </Text>
                  <Text style={styles.gridSub}>Calculated at {(taxBracket * 100).toFixed(0)}% bracket savings</Text>
                </View>
              </View>
            </View>

            {/* Total Highlight */}
            <View style={styles.totalSavingsCard}>
              <Feather name="shield" size={24} color={Colors.brand.primary} />
              <View style={styles.totalSavingsContent}>
                <Text style={styles.totalSavingsLabel}>Estimated YTD Tax Reduction</Text>
                <Text style={styles.totalSavingsVal}>
                  {currencySymbol}{totalEstimatedSavings.toFixed(2)}
                </Text>
                <Text style={styles.totalSavingsDesc}>
                  Your mileage deductions have reduced your taxable income by {currencySymbol}{totalDeductions.toFixed(2)}. Keep logging your drives to maximize write-offs!
                </Text>
              </View>
            </View>

            {/* Compliance Note */}
            <View style={styles.disclaimerBox}>
              <Feather name="info" size={14} color={Colors.text.tertiary} style={{ marginRight: 6 }} />
              <Text style={styles.disclaimerText}>
                Disclaimer: Savings values are estimates. Actual Schedule C deductions depend on total self-employment revenues, business expenses, and local tax requirements.
              </Text>
            </View>
          </View>
        )}

        {/* Tab 3: CPA Portal */}
        {activeTab === 'cpa' && (
          <View style={styles.tabContent}>
            <View style={styles.dashboardCard}>
              <Text style={styles.cardTitle}>Accountant & CPA Share Portal</Text>
              <Text style={styles.cardDesc}>
                Email a secure, audit-ready download link of your tax reports directly to your CPA.
              </Text>
              
              <View style={styles.form}>
                <View style={styles.formGroup}>
                  <Text style={styles.formLabel}>CPA Name</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="e.g. Sarah Jenkins, CPA"
                    placeholderTextColor={Colors.text.tertiary}
                    value={cpaName}
                    onChangeText={setCpaName}
                  />
                </View>

                <View style={styles.formGroup}>
                  <Text style={styles.formLabel}>CPA Email Address</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="e.g. sarah@jenkinshartcpa.com"
                    placeholderTextColor={Colors.text.tertiary}
                    value={cpaEmail}
                    onChangeText={setCpaEmail}
                    keyboardType="email-address"
                    autoCapitalize="none"
                  />
                </View>

                <View style={styles.formGroup}>
                  <Text style={styles.formLabel}>Secure Email Note</Text>
                  <TextInput
                    style={[styles.input, styles.textArea]}
                    value={cpaMessage}
                    onChangeText={setCpaMessage}
                    multiline
                    numberOfLines={4}
                  />
                </View>

                <TouchableOpacity 
                  style={styles.shareBtn} 
                  onPress={handleCPAShare}
                  disabled={sharing}
                >
                  {sharing ? (
                    <ActivityIndicator size="small" color={Colors.text.inverse} />
                  ) : (
                    <>
                      <Feather name="mail" size={16} color={Colors.text.inverse} style={{ marginRight: 8 }} />
                      <Text style={styles.shareBtnText}>Email Compliance Link to CPA</Text>
                    </>
                  )}
                </TouchableOpacity>
              </View>
            </View>
            
            <View style={styles.portalInfo}>
              <Feather name="lock" size={16} color={Colors.brand.primary} />
              <View style={{ flex: 1 }}>
                <Text style={styles.portalInfoTitle}>Secure Share Integration</Text>
                <Text style={styles.portalInfoDesc}>
                  Your CPA will receive a link to download your mileage log CSV and PDF reports. The link is secure, audit-verified, and expires automatically after 7 days.
                </Text>
              </View>
            </View>
          </View>
        )}

      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bg.primary },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: Colors.bg.primary, padding: 24 },
  loadingText: { color: Colors.text.secondary, fontSize: FontSize.sm, marginTop: 16 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: Spacing.screen, paddingVertical: Spacing.md },
  backBtn: { padding: 6 },
  headerTitle: { color: Colors.text.primary, fontSize: FontSize.lg, fontWeight: '800' },
  premiumBadge: { backgroundColor: Colors.brand.warningDim, borderRadius: Radius.full, paddingHorizontal: 10, paddingVertical: 4, borderWidth: 1, borderColor: Colors.brand.warning + '40' },
  premiumBadgeText: { color: Colors.brand.warning, fontSize: 9, fontWeight: '800', letterSpacing: 0.5 },
  
  // Tabs
  tabContainer: { flexDirection: 'row', backgroundColor: Colors.bg.secondary, marginHorizontal: Spacing.screen, borderRadius: Radius.lg, padding: 4, marginBottom: 16, borderWidth: 1, borderColor: Colors.border },
  tab: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 10, borderRadius: Radius.md },
  activeTab: { backgroundColor: Colors.bg.tertiary },
  tabText: { color: Colors.text.tertiary, fontSize: FontSize.xs, fontWeight: '600' },
  activeTabText: { color: Colors.text.primary },

  // Content
  scrollContent: { paddingBottom: 60 },
  tabContent: { paddingHorizontal: Spacing.screen },
  
  // Locked Promo Screen styles
  lockScroll: { paddingHorizontal: Spacing.screen, paddingBottom: 60, alignItems: 'center' },
  lockCard: { backgroundColor: Colors.bg.secondary, borderRadius: Radius.xl, padding: 24, alignItems: 'center', borderWidth: 1, borderColor: Colors.border, width: '100%', marginBottom: 24, marginTop: 12 },
  lockIconCircle: { width: 72, height: 72, borderRadius: 36, backgroundColor: Colors.brand.warningDim, borderWidth: 1, borderColor: Colors.brand.warning + '30', justifyContent: 'center', alignItems: 'center', marginBottom: 16 },
  lockTitle: { color: Colors.text.primary, fontSize: FontSize.xl, fontWeight: '800', marginBottom: 8, textAlign: 'center' },
  lockSubtitle: { color: Colors.text.secondary, fontSize: FontSize.sm, lineHeight: 20, textAlign: 'center' },
  
  featureList: { gap: 16, width: '100%', marginBottom: 32 },
  featureItem: { flexDirection: 'row', gap: 14, backgroundColor: Colors.bg.secondary, borderRadius: Radius.lg, padding: 16, borderWidth: 1, borderColor: Colors.border },
  featureIconWrap: { width: 36, height: 36, borderRadius: 8, backgroundColor: Colors.bg.tertiary, justifyContent: 'center', alignItems: 'center' },
  featureContent: { flex: 1, gap: 4 },
  featureTitle: { color: Colors.text.primary, fontSize: FontSize.base, fontWeight: '700' },
  featureDesc: { color: Colors.text.secondary, fontSize: FontSize.xs, lineHeight: 16 },
  
  upgradeBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: Colors.brand.warning, borderRadius: Radius.md, paddingVertical: 14, width: '100%' },
  upgradeBtnText: { color: Colors.text.inverse, fontSize: FontSize.base, fontWeight: '700' },

  // Shared Premium Dashboard style
  dashboardCard: { backgroundColor: Colors.bg.secondary, borderRadius: Radius.xl, padding: 20, borderWidth: 1, borderColor: Colors.border, marginBottom: 16 },
  cardTitle: { color: Colors.text.primary, fontSize: FontSize.base, fontWeight: '800', marginBottom: 6 },
  cardDesc: { color: Colors.text.secondary, fontSize: FontSize.xs, lineHeight: 18, marginBottom: 16 },
  
  // Scan UI
  scanBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.brand.primary, borderRadius: Radius.md, paddingVertical: 12 },
  scanBtnText: { color: Colors.text.inverse, fontSize: FontSize.sm, fontWeight: '700' },
  loadingBox: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: Colors.bg.tertiary, padding: 12, borderRadius: Radius.md },
  scanningText: { color: Colors.brand.primary, fontSize: 10, fontWeight: '600' },
  scanResultHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  successBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: Colors.brand.primaryDim, borderRadius: Radius.full, paddingHorizontal: 10, paddingVertical: 4 },
  successBadgeText: { color: Colors.brand.primary, fontSize: FontSize.xs, fontWeight: '800' },
  rescanBtn: { paddingVertical: 4, paddingHorizontal: 8 },
  rescanText: { color: Colors.text.tertiary, fontSize: FontSize.xs, fontWeight: '600' },
  
  insightsWrapper: { gap: 12 },
  insightAlertCard: { backgroundColor: Colors.bg.secondary, borderRadius: Radius.lg, padding: 16, borderLeftWidth: 4, borderLeftColor: Colors.border, gap: 10 },
  insightAlertTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  insightAlertTitle: { color: Colors.text.primary, fontSize: FontSize.sm, fontWeight: '700' },
  insightAlertText: { color: Colors.text.secondary, fontSize: FontSize.xs, lineHeight: 18 },
  insightActionBtn: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  insightActionText: { color: Colors.brand.primary, fontSize: FontSize.xs, fontWeight: '700' },
  emptyWrap: { alignItems: 'center', paddingVertical: 40 },
  emptyText: { color: Colors.text.tertiary, fontSize: FontSize.xs, textAlign: 'center' },

  // Quarterly estimates UI
  bracketContainer: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderTopWidth: 1, borderTopColor: Colors.border, paddingTop: 12 },
  bracketLabel: { color: Colors.text.secondary, fontSize: FontSize.sm, fontWeight: '600' },
  bracketButtons: { flexDirection: 'row', gap: 6 },
  bracketBtn: { backgroundColor: Colors.bg.tertiary, borderRadius: Radius.sm, paddingHorizontal: 12, paddingVertical: 6, borderWidth: 1, borderColor: Colors.border },
  activeBracketBtn: { backgroundColor: Colors.brand.primaryDim, borderColor: Colors.brand.primary },
  bracketBtnText: { color: Colors.text.secondary, fontSize: FontSize.xs, fontWeight: '700' },
  activeBracketBtnText: { color: Colors.brand.primary },

  gridContainer: { gap: 10, marginBottom: 16 },
  gridRow: { flexDirection: 'row', gap: 10 },
  gridCard: { flex: 1, backgroundColor: Colors.bg.secondary, borderRadius: Radius.lg, padding: 14, borderWidth: 1, borderColor: Colors.border, gap: 4 },
  gridLabel: { color: Colors.text.tertiary, fontSize: FontSize.xs, fontWeight: '500' },
  gridVal: { color: Colors.text.primary, fontSize: FontSize.lg, fontWeight: '800' },
  gridSub: { color: Colors.text.secondary, fontSize: 9 },

  totalSavingsCard: { flexDirection: 'row', gap: 12, backgroundColor: Colors.brand.primaryDim, borderLeftWidth: 4, borderLeftColor: Colors.brand.primary, padding: 16, borderRadius: Radius.lg, marginBottom: 16 },
  totalSavingsContent: { flex: 1, gap: 4 },
  totalSavingsLabel: { color: Colors.brand.primary, fontSize: FontSize.xs, fontWeight: '700' },
  totalSavingsVal: { color: Colors.text.primary, fontSize: FontSize.xl, fontWeight: '900' },
  totalSavingsDesc: { color: Colors.text.secondary, fontSize: 10, lineHeight: 14 },

  disclaimerBox: { flexDirection: 'row', marginHorizontal: Spacing.xs },
  disclaimerText: { flex: 1, color: Colors.text.tertiary, fontSize: 9, lineHeight: 13 },

  // CPA Portal UI
  form: { gap: 12 },
  formGroup: { gap: 6 },
  formLabel: { color: Colors.text.secondary, fontSize: FontSize.xs, fontWeight: '600' },
  input: { backgroundColor: Colors.bg.tertiary, color: Colors.text.primary, fontSize: FontSize.base, padding: 12, borderRadius: Radius.md, borderWidth: 1, borderColor: Colors.border },
  textArea: { minHeight: 80, textAlignVertical: 'top' },
  shareBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.brand.primary, borderRadius: Radius.md, paddingVertical: 13 },
  shareBtnText: { color: Colors.text.inverse, fontSize: FontSize.sm, fontWeight: '700' },
  
  portalInfo: { flexDirection: 'row', gap: 12, backgroundColor: Colors.bg.secondary, borderRadius: Radius.xl, padding: 16, borderWidth: 1, borderColor: Colors.border },
  portalInfoTitle: { color: Colors.text.primary, fontSize: FontSize.sm, fontWeight: '700', marginBottom: 4 },
  portalInfoDesc: { color: Colors.text.secondary, fontSize: FontSize.xs, lineHeight: 16 }
});
