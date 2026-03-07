import React, { useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, TextInput,
  KeyboardAvoidingView, Platform, ScrollView, Alert, ActivityIndicator
} from 'react-native';
import { useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { useAuth } from '../../context/AuthContext';
import { Colors, FontSize, Spacing, Radius } from '../../constants/theme';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const OCCUPATIONS = [
  { key: 'self_employed', label: 'Self Employed' },
  { key: 'rideshare', label: 'Rideshare Driver' },
  { key: 'sales_rep', label: 'Sales Rep' },
  { key: 'real_estate', label: 'Real Estate Agent' },
  { key: 'other', label: 'Other' },
];

export default function RegisterScreen() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const { register } = useAuth();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const showError = (message: string) => {
    setErrorMsg(message);
    console.log('[Register] Error:', message);
    if (Platform.OS !== 'web') {
      Alert.alert('Error', message);
    }
  };

  const handleRegister = async () => {
    setErrorMsg(''); // Clear previous errors
    
    if (!name.trim() || !email.trim() || !password.trim()) {
      showError('Please fill in all fields');
      return;
    }
    if (password.length < 6) {
      showError('Password must be at least 6 characters');
      return;
    }
    
    setLoading(true);
    console.log('[Register] Starting registration process...', email.trim().toLowerCase());
    
    try {
      await register(email.trim().toLowerCase(), password, name.trim());
      console.log('[Register] Auth successful, navigating to dashboard...');
      router.push('/(tabs)/dashboard');
    } catch (e: any) {
      const message = e.message || 'Something went wrong. Please try again.';
      console.log('[Register] Failed:', message);
      showError(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView style={styles.root} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <ScrollView contentContainerStyle={[styles.scroll, { paddingTop: insets.top + 20, paddingBottom: insets.bottom + 20 }]} keyboardShouldPersistTaps="handled">
        {/* Header */}
        <TouchableOpacity testID="back-btn" style={styles.backBtn} onPress={() => router.back()}>
          <Feather name="arrow-left" size={22} color={Colors.text.primary} />
        </TouchableOpacity>

        <View style={styles.headerWrap}>
          <View style={styles.logoIcon}>
            <Feather name="navigation" size={28} color={Colors.brand.primary} />
          </View>
          <Text style={styles.title}>Create Account</Text>
          <Text style={styles.subtitle}>Start tracking smarter today</Text>
        </View>

        <View style={styles.card}>
          {/* Error Message Display */}
          {errorMsg ? (
            <View style={styles.errorBox}>
              <Feather name="alert-circle" size={16} color="#ff6b6b" />
              <Text style={styles.errorText}>{errorMsg}</Text>
            </View>
          ) : null}

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Full Name</Text>
            <View style={styles.inputWrap}>
              <Feather name="user" size={18} color={Colors.text.tertiary} style={styles.inputIcon} />
              <TextInput
                testID="register-name-input"
                style={styles.input}
                value={name}
                onChangeText={setName}
                placeholder="John Smith"
                placeholderTextColor={Colors.text.tertiary}
                autoCapitalize="words"
              />
            </View>
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Email</Text>
            <View style={styles.inputWrap}>
              <Feather name="mail" size={18} color={Colors.text.tertiary} style={styles.inputIcon} />
              <TextInput
                testID="register-email-input"
                style={styles.input}
                value={email}
                onChangeText={setEmail}
                placeholder="your@email.com"
                placeholderTextColor={Colors.text.tertiary}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
              />
            </View>
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Password</Text>
            <View style={styles.inputWrap}>
              <Feather name="lock" size={18} color={Colors.text.tertiary} style={styles.inputIcon} />
              <TextInput
                testID="register-password-input"
                style={[styles.input, { flex: 1 }]}
                value={password}
                onChangeText={setPassword}
                placeholder="Min. 6 characters"
                placeholderTextColor={Colors.text.tertiary}
                secureTextEntry={!showPass}
              />
              <TouchableOpacity testID="toggle-pass" onPress={() => setShowPass(!showPass)} style={styles.eyeBtn}>
                <Feather name={showPass ? 'eye-off' : 'eye'} size={18} color={Colors.text.tertiary} />
              </TouchableOpacity>
            </View>
          </View>

          <View style={styles.freeBadge}>
            <Feather name="check-circle" size={14} color={Colors.brand.primary} />
            <Text style={styles.freeBadgeText}>Free plan · 40 trips/month · No credit card needed</Text>
          </View>

          <TouchableOpacity testID="register-submit-btn" style={[styles.primaryBtn, loading && styles.disabledBtn]} onPress={handleRegister} disabled={loading} activeOpacity={0.8}>
            {loading ? <ActivityIndicator color={Colors.text.inverse} /> : <Text style={styles.primaryBtnText}>Create Free Account</Text>}
          </TouchableOpacity>
        </View>

        <View style={styles.footer}>
          <Text style={styles.footerText}>Already have an account? </Text>
          <TouchableOpacity testID="go-to-login" onPress={() => router.back()}>
            <Text style={styles.footerLink}>Sign In</Text>
          </TouchableOpacity>
        </View>

        <Text style={styles.terms}>By signing up, you agree to our Terms of Service and Privacy Policy</Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.bg.primary },
  scroll: { flexGrow: 1, paddingHorizontal: Spacing.lg },
  backBtn: { padding: 8, marginBottom: 8, alignSelf: 'flex-start' },
  headerWrap: { alignItems: 'center', marginBottom: 28 },
  logoIcon: {
    width: 60, height: 60, borderRadius: 16, backgroundColor: Colors.brand.primaryDim,
    alignItems: 'center', justifyContent: 'center', marginBottom: 12,
    borderWidth: 1, borderColor: Colors.brand.primary + '40',
  },
  title: { color: Colors.text.primary, fontSize: FontSize.xxl, fontWeight: '800', marginBottom: 4 },
  subtitle: { color: Colors.text.secondary, fontSize: FontSize.sm },
  card: { backgroundColor: Colors.bg.secondary, borderRadius: Radius.xl, padding: 24, borderWidth: 1, borderColor: Colors.border },
  errorBox: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: '#ff6b6b20', borderRadius: Radius.md,
    padding: 12, marginBottom: 16, borderWidth: 1, borderColor: '#ff6b6b40',
  },
  errorText: { color: '#ff6b6b', fontSize: FontSize.sm, fontWeight: '600', flex: 1 },
  inputGroup: { marginBottom: 16 },
  label: { color: Colors.text.secondary, fontSize: FontSize.sm, fontWeight: '600', marginBottom: 8 },
  inputWrap: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: Colors.bg.tertiary, borderRadius: Radius.md,
    borderWidth: 1, borderColor: Colors.border, paddingHorizontal: 14, height: 52,
  },
  inputIcon: { marginRight: 10 },
  input: { flex: 1, color: Colors.text.primary, fontSize: FontSize.base },
  eyeBtn: { padding: 4 },
  freeBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: Colors.brand.primaryDim, borderRadius: Radius.md,
    padding: 10, marginBottom: 16, borderWidth: 1, borderColor: Colors.brand.primary + '30',
  },
  freeBadgeText: { color: Colors.brand.primary, fontSize: FontSize.xs, fontWeight: '600' },
  primaryBtn: {
    backgroundColor: Colors.brand.primary, borderRadius: Radius.md,
    height: 52, alignItems: 'center', justifyContent: 'center',
  },
  disabledBtn: { opacity: 0.6 },
  primaryBtnText: { color: Colors.text.inverse, fontSize: FontSize.base, fontWeight: '700' },
  footer: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', marginTop: 24 },
  footerText: { color: Colors.text.secondary, fontSize: FontSize.sm },
  footerLink: { color: Colors.brand.primary, fontSize: FontSize.sm, fontWeight: '700' },
  terms: { color: Colors.text.tertiary, fontSize: 11, textAlign: 'center', marginTop: 16, paddingHorizontal: 16 },
});
