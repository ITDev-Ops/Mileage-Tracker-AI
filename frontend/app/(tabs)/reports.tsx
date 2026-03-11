import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  RefreshControl, Alert, ActivityIndicator, Platform, Linking
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../../context/AuthContext';
import { API } from '../../services/api';
import { Colors, FontSize, Spacing, Radius } from '../../constants/theme';
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const now = new Date();

export default function ReportsScreen() {
  const [summary, setSummary] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedYear, setSelectedYear] = useState(now.getFullYear());
  const [selectedMonth, setSelectedMonth] = useState<number | null>(null);
  const [exportLoading, setExportLoading] = useState(false);
  const [pdfLoading, setPdfLoading] = useState(false);
  const { token } = useAuth();
  const insets = useSafeAreaInsets();

  const loadSummary = useCallback(async () => {
    if (!token) return;
    try {
      const data = await API.getReportSummary(token, selectedYear, selectedMonth ?? undefined);
      setSummary(data);
    } catch (e: any) { console.error(e); }
  }, [token, selectedYear, selectedMonth]);

  useEffect(() => {
    setLoading(true);
    loadSummary().finally(() => setLoading(false));
  }, [loadSummary]);

  const onRefresh = async () => {
    setRefreshing(true);
    await loadSummary();
    setRefreshing(false);
  };

  const handleExportCSV = async () => {
    console.log('[Reports] handleExportCSV called, token:', token ? 'present' : 'null');
    
    if (!token) {
      Alert.alert('Error', 'Please log in to download reports');
      return;
    }
    
    setExportLoading(true);
    try {
      const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL || '';
      const url = `${BACKEND_URL}/api/reports/export/csv?year=${selectedYear}`;
      console.log('[Reports] Downloading CSV from:', url);
      
      if (Platform.OS === 'web') {
        // For web: Fetch with auth header and trigger download
        console.log('[Reports] Using web fetch method');
        const response = await fetch(url, {
          method: 'GET',
          headers: { 
            'Authorization': `Bearer ${token}`,
            'Accept': 'text/csv'
          }
        });
        
        console.log('[Reports] Response status:', response.status);
        
        if (!response.ok) {
          const errorText = await response.text();
          console.log('[Reports] Error response:', errorText);
          throw new Error(errorText || 'Failed to download report');
        }
        
        const blob = await response.blob();
        console.log('[Reports] Blob size:', blob.size);
        
        const downloadUrl = window.URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = downloadUrl;
        link.download = `mileage_report_${selectedYear}.csv`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        window.URL.revokeObjectURL(downloadUrl);
        
        console.log('[Reports] CSV download complete');
      } else {
        // For mobile: Download to file system and share
        console.log('[Reports] Using mobile FileSystem method');
        const fileUri = FileSystem.documentDirectory + `mileage_report_${selectedYear}.csv`;
        const downloadResult = await FileSystem.downloadAsync(url, fileUri, {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        
        console.log('[Reports] Download result:', downloadResult.status);
        
        if (downloadResult.status !== 200) {
          throw new Error('Failed to download report');
        }
        
        // Share the file
        if (await Sharing.isAvailableAsync()) {
          await Sharing.shareAsync(downloadResult.uri, {
            mimeType: 'text/csv',
            dialogTitle: 'Save CSV Report'
          });
        } else {
          Alert.alert('Success', `Report saved to: ${downloadResult.uri}`);
        }
      }
    } catch (e: any) {
      console.log('[Reports] CSV export error:', e);
      Alert.alert('Export Error', e.message || 'Failed to download CSV report');
    } finally {
      setExportLoading(false);
    }
  };

  const handleExportPDF = async () => {
    console.log('[Reports] handleExportPDF called, token:', token ? 'present' : 'null');
    
    if (!token) {
      Alert.alert('Error', 'Please log in to download reports');
      return;
    }
    
    setPdfLoading(true);
    try {
      const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL || '';
      const url = `${BACKEND_URL}/api/reports/export/pdf?year=${selectedYear}`;
      console.log('[Reports] Downloading PDF from:', url);
      
      if (Platform.OS === 'web') {
        // For web: Fetch with auth header and trigger download
        console.log('[Reports] Using web fetch method');
        const response = await fetch(url, {
          method: 'GET',
          headers: { 
            'Authorization': `Bearer ${token}`,
            'Accept': 'application/pdf'
          }
        });
        
        console.log('[Reports] Response status:', response.status);
        
        if (!response.ok) {
          const errorText = await response.text();
          console.log('[Reports] Error response:', errorText);
          throw new Error(errorText || 'Failed to download report');
        }
        
        const blob = await response.blob();
        console.log('[Reports] Blob size:', blob.size);
        
        const downloadUrl = window.URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = downloadUrl;
        link.download = `mileage_tax_report_${selectedYear}.pdf`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        window.URL.revokeObjectURL(downloadUrl);
        
        console.log('[Reports] PDF download complete');
      } else {
        // For mobile: Download to file system and share
        console.log('[Reports] Using mobile FileSystem method');
        const fileUri = FileSystem.documentDirectory + `mileage_tax_report_${selectedYear}.pdf`;
        const downloadResult = await FileSystem.downloadAsync(url, fileUri, {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        
        console.log('[Reports] Download result:', downloadResult.status);
        
        if (downloadResult.status !== 200) {
          throw new Error('Failed to download report');
        }
        
        // Share the file
        if (await Sharing.isAvailableAsync()) {
          await Sharing.shareAsync(downloadResult.uri, {
            mimeType: 'application/pdf',
            dialogTitle: 'Save PDF Report'
          });
        } else {
          Alert.alert('Success', `Report saved to: ${downloadResult.uri}`);
        }
      }
    } catch (e: any) {
      console.log('[Reports] PDF export error:', e);
      Alert.alert('Export Error', e.message || 'Failed to download PDF report');
    } finally {
      setPdfLoading(false);
    }
  };

  const breakdown = summary?.monthly_breakdown || {};
  const breakdownEntries = Object.entries(breakdown).sort((a, b) => a[0].localeCompare(b[0]));
  const maxMiles = Math.max(...breakdownEntries.map(([, v]: any) => v.miles || 0), 1);

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Text style={styles.title}>Reports</Text>
        <View style={styles.yearSelector}>
          <TouchableOpacity testID="prev-year-btn" onPress={() => setSelectedYear(y => y - 1)} style={styles.yearBtn}>
            <Feather name="chevron-left" size={18} color={Colors.text.secondary} />
          </TouchableOpacity>
          <Text testID="selected-year" style={styles.yearText}>{selectedYear}</Text>
          <TouchableOpacity testID="next-year-btn" onPress={() => setSelectedYear(y => y + 1)} disabled={selectedYear >= now.getFullYear()} style={styles.yearBtn}>
            <Feather name="chevron-right" size={18} color={selectedYear >= now.getFullYear() ? Colors.text.tertiary : Colors.text.secondary} />
          </TouchableOpacity>
        </View>
      </View>

      {/* Month Filter */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.monthScroll} contentContainerStyle={{ paddingHorizontal: Spacing.screen, gap: 6 }}>
        <TouchableOpacity testID="month-all" style={[styles.monthBtn, !selectedMonth && styles.monthBtnActive]} onPress={() => setSelectedMonth(null)}>
          <Text style={[styles.monthBtnText, !selectedMonth && styles.monthBtnTextActive]}>All</Text>
        </TouchableOpacity>
        {MONTHS.map((m, i) => (
          <TouchableOpacity key={i} testID={`month-${i + 1}`} style={[styles.monthBtn, selectedMonth === i + 1 && styles.monthBtnActive]} onPress={() => setSelectedMonth(i + 1)}>
            <Text style={[styles.monthBtnText, selectedMonth === i + 1 && styles.monthBtnTextActive]}>{m}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {loading ? (
        <ActivityIndicator size="large" color={Colors.brand.primary} style={{ marginTop: 40 }} />
      ) : (
        <ScrollView refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.brand.primary} />} contentContainerStyle={{ paddingBottom: 100 }}>
          {/* Summary Cards */}
          <View style={styles.summaryGrid}>
            <View testID="total-miles-card" style={[styles.summaryCard, styles.summaryCardLarge]}>
              <Feather name="navigation" size={20} color={Colors.brand.primary} />
              <Text style={styles.summaryValue}>{summary?.total_miles?.toFixed(1) || '0.0'}</Text>
              <Text style={styles.summaryLabel}>Total Miles</Text>
            </View>
            <View testID="total-deductions-card" style={[styles.summaryCard, styles.summaryCardLarge, { borderColor: Colors.brand.primary + '40' }]}>
              <Feather name="dollar-sign" size={20} color={Colors.brand.primary} />
              <Text style={[styles.summaryValue, { color: Colors.brand.primary }]}>${summary?.total_deductions?.toFixed(2) || '0.00'}</Text>
              <Text style={styles.summaryLabel}>Tax Deductions</Text>
            </View>
          </View>

          <View style={styles.summaryGrid}>
            <View style={styles.summaryCard}>
              <Text style={styles.summaryValue}>{summary?.total_trips || 0}</Text>
              <Text style={styles.summaryLabel}>Total Trips</Text>
            </View>
            <View style={styles.summaryCard}>
              <Text style={[styles.summaryValue, { color: Colors.status.business }]}>{summary?.business_miles?.toFixed(1) || '0.0'}</Text>
              <Text style={styles.summaryLabel}>Business Miles</Text>
            </View>
            <View style={styles.summaryCard}>
              <Text style={[styles.summaryValue, { color: Colors.status.personal }]}>{summary?.personal_miles?.toFixed(1) || '0.0'}</Text>
              <Text style={styles.summaryLabel}>Personal Miles</Text>
            </View>
          </View>

          {/* IRS Rate Note */}
          <View style={styles.irsNote}>
            <Feather name="info" size={13} color={Colors.brand.secondary} />
            <Text style={styles.irsNoteText}>IRS {new Date().getFullYear()} rate: ${summary?.irs_rate || 0.70}/mile business · $0.22/mile medical · $0.14/mile charity</Text>
          </View>

          {/* Monthly Breakdown Chart */}
          {breakdownEntries.length > 0 && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Monthly Breakdown</Text>
              {breakdownEntries.map(([key, val]: any) => {
                const [yr, mo] = key.split('-');
                const monthName = MONTHS[parseInt(mo) - 1];
                return (
                  <View key={key} style={styles.breakdownRow}>
                    <Text style={styles.breakdownMonth}>{monthName} {yr}</Text>
                    <View style={styles.breakdownBar}>
                      <View style={[styles.breakdownFill, { width: `${Math.max((val.miles / maxMiles) * 100, 2)}%` }]} />
                    </View>
                    <View style={styles.breakdownStats}>
                      <Text style={styles.breakdownMiles}>{val.miles?.toFixed(1)} mi</Text>
                      <Text style={styles.breakdownDeduction}>${val.deductions?.toFixed(2)}</Text>
                    </View>
                  </View>
                );
              })}
            </View>
          )}

          {/* Export Section */}
          <View style={styles.exportSection}>
            <Text style={styles.exportTitle}>Export & Share</Text>
            <TouchableOpacity testID="export-csv-btn" style={styles.exportBtn} onPress={handleExportCSV} disabled={exportLoading}>
              {exportLoading ? <ActivityIndicator size="small" color={Colors.brand.primary} /> : (
                <><Feather name="file-text" size={18} color={Colors.brand.primary} /><Text style={styles.exportBtnText}>Download CSV Report ({selectedYear})</Text></>
              )}
            </TouchableOpacity>
            <TouchableOpacity testID="export-pdf-btn" style={[styles.exportBtn, { borderColor: Colors.brand.secondary + '40' }]} onPress={handleExportPDF} disabled={pdfLoading}>
              {pdfLoading ? <ActivityIndicator size="small" color={Colors.brand.secondary} /> : (
                <><Feather name="file" size={18} color={Colors.brand.secondary} /><Text style={[styles.exportBtnText, { color: Colors.brand.secondary }]}>Download PDF Tax Report ({selectedYear})</Text></>
              )}
            </TouchableOpacity>
            <View style={styles.exportNote}>
              <Feather name="lock" size={13} color={Colors.text.tertiary} />
              <Text style={styles.exportNoteText}>IRS-compliant mileage log · Accountant-ready format</Text>
            </View>
          </View>

          {/* Pro Feature Teaser */}
          <View testID="pro-feature-teaser" style={styles.proCard}>
            <View style={styles.proCardLeft}>
              <View style={styles.proBadge}><Text style={styles.proBadgeText}>PRO</Text></View>
              <Text style={styles.proTitle}>Advanced Tax Insights</Text>
              <Text style={styles.proDesc}>AI-powered deduction optimizer, CPA partnership portal, and quarterly tax estimates.</Text>
            </View>
            <Feather name="trending-up" size={24} color={Colors.brand.warning} />
          </View>
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bg.primary },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: Spacing.screen, paddingVertical: Spacing.md },
  title: { color: Colors.text.primary, fontSize: FontSize.xxl, fontWeight: '800' },
  yearSelector: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: Colors.bg.secondary, borderRadius: Radius.md, borderWidth: 1, borderColor: Colors.border, paddingVertical: 4 },
  yearBtn: { paddingHorizontal: 8, paddingVertical: 4 },
  yearText: { color: Colors.text.primary, fontSize: FontSize.base, fontWeight: '700', minWidth: 48, textAlign: 'center' },
  monthScroll: { maxHeight: 52, marginBottom: 12 },
  monthBtn: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: Radius.full, backgroundColor: Colors.bg.secondary, borderWidth: 1, borderColor: Colors.border },
  monthBtnActive: { backgroundColor: Colors.brand.primaryDim, borderColor: Colors.brand.primary },
  monthBtnText: { color: Colors.text.tertiary, fontSize: FontSize.xs, fontWeight: '600' },
  monthBtnTextActive: { color: Colors.brand.primary },
  summaryGrid: { flexDirection: 'row', paddingHorizontal: Spacing.screen, gap: 10, marginBottom: 10 },
  summaryCard: { flex: 1, backgroundColor: Colors.bg.secondary, borderRadius: Radius.lg, padding: 14, alignItems: 'center', borderWidth: 1, borderColor: Colors.border, gap: 4 },
  summaryCardLarge: { borderColor: Colors.brand.primaryDim },
  summaryValue: { color: Colors.text.primary, fontSize: FontSize.xl, fontWeight: '800' },
  summaryLabel: { color: Colors.text.tertiary, fontSize: 10, textAlign: 'center' },
  irsNote: { flexDirection: 'row', alignItems: 'center', gap: 6, marginHorizontal: Spacing.screen, backgroundColor: Colors.brand.secondaryDim, borderRadius: Radius.md, padding: 10, marginBottom: 16 },
  irsNoteText: { flex: 1, color: Colors.brand.secondary, fontSize: 10 },
  section: { paddingHorizontal: Spacing.screen, marginBottom: 16 },
  sectionTitle: { color: Colors.text.primary, fontSize: FontSize.md, fontWeight: '700', marginBottom: 12 },
  breakdownRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 },
  breakdownMonth: { color: Colors.text.secondary, fontSize: FontSize.xs, width: 55 },
  breakdownBar: { flex: 1, height: 8, backgroundColor: Colors.bg.tertiary, borderRadius: 4, overflow: 'hidden' },
  breakdownFill: { height: '100%', backgroundColor: Colors.brand.primary, borderRadius: 4 },
  breakdownStats: { alignItems: 'flex-end', width: 90 },
  breakdownMiles: { color: Colors.text.primary, fontSize: FontSize.xs, fontWeight: '600' },
  breakdownDeduction: { color: Colors.brand.primary, fontSize: 10 },
  exportSection: { marginHorizontal: Spacing.screen, marginBottom: 16 },
  exportTitle: { color: Colors.text.primary, fontSize: FontSize.md, fontWeight: '700', marginBottom: 12 },
  exportBtn: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: Colors.brand.primaryDim, borderRadius: Radius.md, padding: 14, borderWidth: 1, borderColor: Colors.brand.primary + '40', marginBottom: 8 },
  exportBtnText: { flex: 1, color: Colors.brand.primary, fontSize: FontSize.sm, fontWeight: '600' },
  exportNote: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  exportNoteText: { color: Colors.text.tertiary, fontSize: 11 },
  proCard: { flexDirection: 'row', alignItems: 'center', marginHorizontal: Spacing.screen, backgroundColor: Colors.bg.secondary, borderRadius: Radius.xl, padding: 16, borderWidth: 1, borderColor: Colors.brand.warning + '40', gap: 12, marginBottom: 16 },
  proCardLeft: { flex: 1, gap: 4 },
  proBadge: { alignSelf: 'flex-start', backgroundColor: Colors.brand.warningDim, borderRadius: Radius.sm, paddingHorizontal: 8, paddingVertical: 2 },
  proBadgeText: { color: Colors.brand.warning, fontSize: 10, fontWeight: '800', letterSpacing: 1 },
  proTitle: { color: Colors.text.primary, fontSize: FontSize.sm, fontWeight: '700' },
  proDesc: { color: Colors.text.secondary, fontSize: FontSize.xs },
});
