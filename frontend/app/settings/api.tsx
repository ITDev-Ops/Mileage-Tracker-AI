import React, { useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  Alert, Platform, ActivityIndicator
} from 'react-native';
import { useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Clipboard from 'expo-clipboard';
import { Colors, FontSize, Spacing, Radius } from '../../constants/theme';

export default function ApiAccessScreen() {
  const [apiKey, setApiKey] = useState('mm_live_4a82fce08f1b621db7c2718e285a22d9');
  const [generating, setGenerating] = useState(false);
  const [showKey, setShowKey] = useState(false);
  
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const handleGenerateKey = () => {
    setGenerating(true);
    setTimeout(() => {
      const hex = Array.from({ length: 32 }, () => Math.floor(Math.random() * 16).toString(16)).join('');
      setApiKey(`mm_live_${hex}`);
      setShowKey(true);
      setGenerating(false);
      Alert.alert('New API Key Generated! 🔑', 'Please make sure to copy your new token. For security reasons, it cannot be shown again once you leave this screen.');
    }, 1000);
  };

  const handleCopyKey = async () => {
    await Clipboard.setStringAsync(apiKey);
    Alert.alert('Copied to Clipboard 📋', 'API Key has been copied to your clipboard.');
  };

  const sampleCurl = `curl -X POST "https://api.multimile.ai/v1/trips" \\
  -H "Authorization: Bearer ${apiKey}" \\
  -H "Content-Type: application/json" \\
  -d '{
    "start_address": "Office",
    "end_address": "Client Meet",
    "distance": 12.4,
    "classification": "business"
  }'`;

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity testID="api-back-btn" onPress={() => router.back()} style={styles.backBtn}>
          <Feather name="arrow-left" size={22} color={Colors.text.primary} />
        </TouchableOpacity>
        <Text style={styles.title}>Developer API Access</Text>
        <View style={{ width: 34 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Token Management */}
        <Text style={styles.sectionTitle}>API Credentials</Text>
        <View style={styles.card}>
          <Text style={styles.cardLabel}>Active API Token</Text>
          <View style={styles.keyContainer}>
            <Text style={styles.keyValue} numberOfLines={1}>
              {showKey ? apiKey : '••••••••••••••••••••••••••••••••••••••••'}
            </Text>
            <TouchableOpacity onPress={() => setShowKey(!showKey)} style={styles.iconBtn}>
              <Feather name={showKey ? 'eye-off' : 'eye'} size={16} color={Colors.text.secondary} />
            </TouchableOpacity>
            <TouchableOpacity onPress={handleCopyKey} style={styles.iconBtn} disabled={!showKey}>
              <Feather name="copy" size={16} color={showKey ? Colors.brand.primary : Colors.text.tertiary} />
            </TouchableOpacity>
          </View>
          
          <TouchableOpacity style={styles.generateBtn} onPress={handleGenerateKey} disabled={generating}>
            {generating ? (
              <ActivityIndicator color={Colors.brand.primary} size="small" />
            ) : (
              <>
                <Feather name="refresh-cw" size={14} color={Colors.brand.primary} style={{ marginRight: 6 }} />
                <Text style={styles.generateBtnText}>Roll API Key</Text>
              </>
            )}
          </TouchableOpacity>
        </View>

        {/* API Endpoint Documentation */}
        <Text style={styles.sectionTitle}>API Integration Sandbox</Text>
        <View style={styles.card}>
          <Text style={styles.endpointTitle}>POST /v1/trips</Text>
          <Text style={styles.endpointDesc}>Programmatically push external trip logs or driving telemetry directly into your account database.</Text>
          
          <Text style={[styles.cardLabel, { marginTop: 12 }]}>Example Request Snippet (cURL)</Text>
          <View style={styles.codeBlock}>
            <Text style={styles.codeText}>{sampleCurl}</Text>
          </View>
        </View>

        {/* Webhooks config */}
        <Text style={styles.sectionTitle}>Real-time Webhook Triggers</Text>
        <View style={styles.card}>
          <View style={styles.listRow}>
            <Text style={styles.listLabel}>trip.created</Text>
            <Text style={styles.badgeText}>Active</Text>
          </View>
          <View style={styles.divider} />
          <View style={styles.listRow}>
            <Text style={styles.listLabel}>trip.completed</Text>
            <Text style={styles.badgeText}>Active</Text>
          </View>
          <View style={styles.divider} />
          <View style={styles.listRow}>
            <Text style={styles.listLabel}>tax_summary.updated</Text>
            <Text style={styles.badgeText}>Active</Text>
          </View>
          
          <View style={{ marginTop: 16, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Feather name="settings" size={14} color={Colors.text.tertiary} />
            <Text style={styles.webhookUrl}>Webhook URL: https://webhooks.company.com/receiver</Text>
          </View>
        </View>

        {/* API Usage & Limits */}
        <Text style={styles.sectionTitle}>Usage Limits</Text>
        <View style={styles.card}>
          <View style={styles.listRow}>
            <Text style={styles.listLabel}>Rate Limit</Text>
            <Text style={styles.listValue}>100 requests / minute</Text>
          </View>
          <View style={styles.divider} />
          <View style={styles.listRow}>
            <Text style={styles.listLabel}>Daily quota</Text>
            <Text style={styles.listValue}>5,000 requests / day</Text>
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
  card: { backgroundColor: Colors.bg.secondary, borderRadius: Radius.xl, padding: 16, borderWidth: 1, borderColor: Colors.border },
  cardLabel: { color: Colors.text.secondary, fontSize: FontSize.xs, fontWeight: '600', marginBottom: 8 },
  keyContainer: { flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.bg.tertiary, borderRadius: Radius.md, paddingHorizontal: 12, paddingVertical: 10, borderWidth: 1, borderColor: Colors.border, gap: 10 },
  keyValue: { flex: 1, color: Colors.text.primary, fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace', fontSize: FontSize.xs },
  iconBtn: { padding: 4 },
  generateBtn: { alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginTop: 12, paddingVertical: 6, paddingHorizontal: 12, borderRadius: Radius.md, borderWidth: 1, borderColor: Colors.brand.primary + '40', backgroundColor: Colors.brand.primary + '10' },
  generateBtnText: { color: Colors.brand.primary, fontSize: FontSize.xs, fontWeight: '700' },
  endpointTitle: { color: Colors.brand.primary, fontSize: FontSize.sm, fontWeight: '700', fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace' },
  endpointDesc: { color: Colors.text.secondary, fontSize: FontSize.xs, lineHeight: 16, marginTop: 4 },
  codeBlock: { backgroundColor: Colors.bg.tertiary, borderRadius: Radius.md, padding: 12, borderWidth: 1, borderColor: Colors.border },
  codeText: { color: Colors.text.primary, fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace', fontSize: 10, lineHeight: 14 },
  listRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  listLabel: { color: Colors.text.primary, fontSize: FontSize.sm, fontWeight: '600' },
  listValue: { color: Colors.text.secondary, fontSize: FontSize.sm },
  divider: { height: 1, backgroundColor: Colors.border, marginVertical: 12 },
  badgeText: { fontSize: 10, fontWeight: '800', color: Colors.status.success, backgroundColor: Colors.brand.primaryDim, borderRadius: Radius.full, paddingHorizontal: 8, paddingVertical: 2 },
  webhookUrl: { color: Colors.text.tertiary, fontSize: 11 },
});
