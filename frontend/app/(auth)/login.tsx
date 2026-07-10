import React, { useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, TextInput,
  KeyboardAvoidingView, Platform, ScrollView, Alert, ActivityIndicator,
  Image
} from 'react-native';
import { useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { useAuth } from '../../context/AuthContext';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export default function LoginScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const { login, loginWithGoogle } = useAuth();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const handleLogin = async () => {
    setLoading(true);
    console.log('[Login] Starting custom backend login process...');
    try {
      await login(email, password);
      console.log('[Login] Auth successful, navigating to dashboard...');
      router.push('/(tabs)/dashboard');
    } catch (e: any) {
      console.warn('[Login] Login error:', e.message || e);
      if (e.message && e.message.includes('Invalid credentials')) {
        Alert.alert('Login Failed', 'The email or password you entered is incorrect. Please check your spelling and try again.');
      } else {
        Alert.alert('Login Failed', e.message || 'An error occurred during login');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView style={styles.root} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <ScrollView contentContainerStyle={[styles.scroll, { paddingTop: insets.top + 20, paddingBottom: insets.bottom + 20 }]} keyboardShouldPersistTaps="handled">
        {/* Logo */}
        <View style={styles.logoWrap}>
          <Image source={require('../../assets/images/icon.png')} style={styles.logoImage} />
          <Text style={styles.logoText}>Mileage Tracker AI</Text>
          <Text style={styles.tagline}>AI-Powered Mileage & Tax Intelligence</Text>
          <Text style={styles.businessName}>Multisystems and Multisystem LLC</Text>
        </View>

        {/* Form Card */}
        <View style={styles.card}>
          <Text style={styles.title}>Welcome Back</Text>
          <Text style={styles.subtitle}>Sign in to continue tracking</Text>

          {/* Email Input */}
          <View style={styles.inputGroup}>
            <Text style={styles.label}>Email</Text>
            <View style={styles.inputWrap}>
              <Feather name="mail" size={18} color="#71717A" style={styles.inputIcon} />
              <TextInput
                style={styles.input}
                placeholder="your@email.com"
                placeholderTextColor="#71717A"
                value={email}
                onChangeText={setEmail}
                keyboardType="email-address"
                autoCapitalize="none"
              />
            </View>
          </View>

          {/* Password Input */}
          <View style={styles.inputGroup}>
            <Text style={styles.label}>Password</Text>
            <View style={styles.inputWrap}>
              <Feather name="lock" size={18} color="#71717A" style={styles.inputIcon} />
              <TextInput
                style={styles.input}
                placeholder="••••••••"
                placeholderTextColor="#71717A"
                value={password}
                onChangeText={setPassword}
                secureTextEntry={!showPassword}
              />
              <TouchableOpacity style={styles.eyeBtn} onPress={() => setShowPassword(!showPassword)}>
                <Feather name={showPassword ? 'eye-off' : 'eye'} size={18} color="#71717A" />
              </TouchableOpacity>
            </View>
          </View>

          {/* Forgot Password */}
          <TouchableOpacity style={styles.forgotPassBtn} onPress={() => router.push('/(auth)/forgot-password' as any)}>
            <Text style={styles.forgotPassText}>Forgot Password?</Text>
          </TouchableOpacity>

          {/* Sign In Button */}
          <TouchableOpacity style={[styles.primaryBtn, loading && styles.disabledBtn]} onPress={handleLogin} disabled={loading} activeOpacity={0.8}>
            {loading ? <ActivityIndicator color="#09090B" /> : <Text style={styles.primaryBtnText}>Sign In</Text>}
          </TouchableOpacity>

          {/* Divider */}
          <View style={styles.divider}>
            <View style={styles.dividerLine} />
            <Text style={styles.dividerText}>or</Text>
            <View style={styles.dividerLine} />
          </View>

          {/* Google Login */}
          <TouchableOpacity style={styles.googleBtn} onPress={loginWithGoogle} activeOpacity={0.8}>
            <Text style={styles.googleIcon}>G</Text>
            <Text style={styles.googleBtnText}>Continue with Google</Text>
          </TouchableOpacity>
        </View>

        {/* Footer */}
        <View style={styles.footer}>
          <Text style={styles.footerText}>Don't have an account? </Text>
          <TouchableOpacity onPress={() => router.push('/(auth)/signup' as any)}>
            <Text style={styles.footerLink}>Sign Up Free</Text>
          </TouchableOpacity>
        </View>

      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#09090B' },
  scroll: { flexGrow: 1, paddingHorizontal: 24, justifyContent: 'center' },
  
  logoWrap: { alignItems: 'center', marginBottom: 32 },
  logoImage: {
    width: 80,
    height: 80,
    borderRadius: 20,
    marginBottom: 16,
  },
  logoText: { color: '#FFFFFF', fontSize: 24, fontWeight: '800', letterSpacing: -0.5 },
  tagline: { color: '#A1A1AA', fontSize: 13, marginTop: 4, textAlign: 'center' },
  businessName: { color: '#71717A', fontSize: 11, marginTop: 8, textAlign: 'center' },
  
  card: { backgroundColor: '#18181B', borderRadius: 20, padding: 24, paddingVertical: 28, borderWidth: 1, borderColor: '#27272A' },
  title: { color: '#FFFFFF', fontSize: 22, fontWeight: '700', marginBottom: 4 },
  subtitle: { color: '#A1A1AA', fontSize: 14, marginBottom: 28 },
  
  inputGroup: { marginBottom: 16 },
  label: { color: '#D4D4D8', fontSize: 13, fontWeight: '600', marginBottom: 8 },
  inputWrap: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#27272A', borderRadius: 12,
    paddingHorizontal: 16, height: 52,
  },
  inputIcon: { marginRight: 12 },
  input: { flex: 1, color: '#FFFFFF', fontSize: 15 },
  eyeBtn: { padding: 4 },
  
  forgotPassBtn: { alignSelf: 'flex-end', marginTop: 4, marginBottom: 20 },
  forgotPassText: { color: '#10B981', fontSize: 13, fontWeight: '600' },
  
  primaryBtn: {
    backgroundColor: '#10B981', borderRadius: 12,
    height: 52, alignItems: 'center', justifyContent: 'center',
  },
  disabledBtn: { opacity: 0.6 },
  primaryBtnText: { color: '#09090B', fontSize: 16, fontWeight: '700' },
  
  divider: { flexDirection: 'row', alignItems: 'center', marginVertical: 24, gap: 12 },
  dividerLine: { flex: 1, height: 1, backgroundColor: '#3F3F46' },
  dividerText: { color: '#71717A', fontSize: 14 },
  
  googleBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10,
    backgroundColor: '#27272A', borderRadius: 12,
    height: 52,
  },
  googleIcon: { color: '#4285F4', fontSize: 18, fontWeight: '800' },
  googleBtnText: { color: '#FFFFFF', fontSize: 15, fontWeight: '600' },
  
  footer: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', marginTop: 24 },
  footerText: { color: '#71717A', fontSize: 14 },
  footerLink: { color: '#10B981', fontSize: 14, fontWeight: '700' },
});
