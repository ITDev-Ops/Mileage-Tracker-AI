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

export default function LoginScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const handleLogin = async () => {
    if (!email.trim() || !password.trim()) {
      Alert.alert('Error', 'Please fill in all fields');
      return;
    }
    setLoading(true);
    try {
      await login(email.trim().toLowerCase(), password);
      router.replace('/(tabs)/dashboard');
    } catch (e: any) {
      Alert.alert('Login Failed', e.message || 'Invalid credentials');
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleLogin = () => {
    // REMINDER: DO NOT HARDCODE THE URL, OR ADD ANY FALLBACKS OR REDIRECT URLS, THIS BREAKS THE AUTH
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      const redirectUrl = window.location.origin + '/auth-callback';
      window.location.href = `https://auth.emergentagent.com/?redirect=${encodeURIComponent(redirectUrl)}`;
    } else {
      Alert.alert('Google Sign In', 'Please use email/password on native app or open the web version for Google sign in.');
    }
  };

  return (
    <KeyboardAvoidingView style={styles.root} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <ScrollView contentContainerStyle={[styles.scroll, { paddingTop: insets.top + 20, paddingBottom: insets.bottom + 20 }]} keyboardShouldPersistTaps="handled">
        {/* Logo */}
        <View style={styles.logoWrap}>
          <View style={styles.logoIcon}>
            <Feather name="navigation" size={32} color={Colors.brand.primary} />
          </View>
          <Text style={styles.logoText}>Multi Mile Tracker</Text>
          <Text style={styles.tagline}>AI-Powered Mileage & Tax Intelligence</Text>
          <Text style={styles.businessName}>Multisystems and Multisystem LLC</Text>
        </View>

        {/* Form Card */}
        <View style={styles.card}>
          <Text style={styles.title}>Welcome Back</Text>
          <Text style={styles.subtitle}>Sign in to continue tracking</Text>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Email</Text>
            <View style={styles.inputWrap}>
              <Feather name="mail" size={18} color={Colors.text.tertiary} style={styles.inputIcon} />
              <TextInput
                testID="login-email-input"
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
                testID="login-password-input"
                style={[styles.input, { flex: 1 }]}
                value={password}
                onChangeText={setPassword}
                placeholder="••••••••"
                placeholderTextColor={Colors.text.tertiary}
                secureTextEntry={!showPass}
              />
              <TouchableOpacity testID="toggle-password" onPress={() => setShowPass(!showPass)} style={styles.eyeBtn}>
                <Feather name={showPass ? 'eye-off' : 'eye'} size={18} color={Colors.text.tertiary} />
              </TouchableOpacity>
            </View>
          </View>

          <TouchableOpacity testID="login-submit-btn" style={[styles.primaryBtn, loading && styles.disabledBtn]} onPress={handleLogin} disabled={loading} activeOpacity={0.8}>
            {loading ? <ActivityIndicator color={Colors.text.inverse} /> : <Text style={styles.primaryBtnText}>Sign In</Text>}
          </TouchableOpacity>

          <View style={styles.divider}>
            <View style={styles.dividerLine} />
            <Text style={styles.dividerText}>or</Text>
            <View style={styles.dividerLine} />
          </View>

          <TouchableOpacity testID="google-login-btn" style={styles.googleBtn} onPress={handleGoogleLogin} activeOpacity={0.8}>
            <Text style={styles.googleIcon}>G</Text>
            <Text style={styles.googleBtnText}>Continue with Google</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.footer}>
          <Text style={styles.footerText}>Don't have an account? </Text>
          <TouchableOpacity testID="go-to-register" onPress={() => router.push('/(auth)/register')}>
            <Text style={styles.footerLink}>Sign Up Free</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.bg.primary },
  scroll: { flexGrow: 1, paddingHorizontal: Spacing.lg, justifyContent: 'center' },
  logoWrap: { alignItems: 'center', marginBottom: 32 },
  logoIcon: {
    width: 72, height: 72, borderRadius: 20, backgroundColor: Colors.brand.primaryDim,
    alignItems: 'center', justifyContent: 'center', marginBottom: 12,
    borderWidth: 1, borderColor: Colors.brand.primary + '40',
  },
  logoText: { color: Colors.text.primary, fontSize: FontSize.xxl, fontWeight: '800', letterSpacing: -0.5 },
  tagline: { color: Colors.text.tertiary, fontSize: FontSize.sm, marginTop: 4, textAlign: 'center' },
  businessName: { color: Colors.text.tertiary, fontSize: FontSize.xs, marginTop: 8, textAlign: 'center', opacity: 0.7 },
  card: { backgroundColor: Colors.bg.secondary, borderRadius: Radius.xl, padding: 24, borderWidth: 1, borderColor: Colors.border },
  title: { color: Colors.text.primary, fontSize: FontSize.xl, fontWeight: '700', marginBottom: 4 },
  subtitle: { color: Colors.text.secondary, fontSize: FontSize.sm, marginBottom: 24 },
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
  primaryBtn: {
    backgroundColor: Colors.brand.primary, borderRadius: Radius.md,
    height: 52, alignItems: 'center', justifyContent: 'center', marginTop: 8,
  },
  disabledBtn: { opacity: 0.6 },
  primaryBtnText: { color: Colors.text.inverse, fontSize: FontSize.base, fontWeight: '700' },
  divider: { flexDirection: 'row', alignItems: 'center', marginVertical: 20, gap: 12 },
  dividerLine: { flex: 1, height: 1, backgroundColor: Colors.border },
  dividerText: { color: Colors.text.tertiary, fontSize: FontSize.sm },
  googleBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10,
    backgroundColor: Colors.bg.tertiary, borderRadius: Radius.md,
    height: 52, borderWidth: 1, borderColor: Colors.border,
  },
  googleIcon: { color: '#4285F4', fontSize: 18, fontWeight: '800' },
  googleBtnText: { color: Colors.text.primary, fontSize: FontSize.base, fontWeight: '600' },
  footer: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', marginTop: 24 },
  footerText: { color: Colors.text.secondary, fontSize: FontSize.sm },
  footerLink: { color: Colors.brand.primary, fontSize: FontSize.sm, fontWeight: '700' },
});
