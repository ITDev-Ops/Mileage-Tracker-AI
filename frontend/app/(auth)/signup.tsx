import React, { useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, TextInput,
  KeyboardAvoidingView, Platform, ScrollView, Alert, ActivityIndicator
} from 'react-native';
import { useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../../context/AuthContext';

export default function SignUpScreen() {
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const { register } = useAuth();

  const handleSignUp = async () => {
    setLoading(true);
    console.log('[SignUp] Starting custom backend sign up process...');
    try {
      await register(fullName, email, password);
      console.log('[SignUp] Auth successful, navigating to dashboard...');
      router.replace('/(tabs)/dashboard');
    } catch (e: any) {
      console.log('[SignUp] Failed:', e.message);
      Alert.alert('Sign Up Failed', e.message || 'An error occurred during sign up');
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView style={styles.root} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <View style={[styles.header, { paddingTop: insets.top + 20 }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Feather name="arrow-left" size={24} color="#FFFFFF" />
        </TouchableOpacity>
      </View>
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        
        {/* Logo/Icon Header */}
        <View style={styles.logoWrap}>
          <View style={styles.logoIcon}>
            <Feather name="send" size={28} color="#10B981" />
          </View>
          <Text style={styles.logoText}>Create Account</Text>
          <Text style={styles.tagline}>Start tracking smarter today</Text>
        </View>

        {/* Form Card */}
        <View style={styles.card}>
          {/* Full Name Input */}
          <View style={styles.inputGroup}>
            <Text style={styles.label}>Full Name</Text>
            <View style={styles.inputWrap}>
              <Feather name="user" size={18} color="#71717A" style={styles.inputIcon} />
              <TextInput
                style={styles.input}
                placeholder="John Smith"
                placeholderTextColor="#71717A"
                value={fullName}
                onChangeText={setFullName}
                autoCapitalize="words"
              />
            </View>
          </View>

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
                placeholder="Min. 6 characters"
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

          {/* Pricing Banner */}
          <View style={styles.banner}>
            <Feather name="check-circle" size={16} color="#10B981" style={styles.bannerIcon} />
            <Text style={styles.bannerText}>Free plan · 40 trips/month · No credit card needed</Text>
          </View>

          {/* Sign Up Button */}
          <TouchableOpacity style={[styles.primaryBtn, loading && styles.disabledBtn]} onPress={handleSignUp} disabled={loading} activeOpacity={0.8}>
            {loading ? <ActivityIndicator color="#09090B" /> : <Text style={styles.primaryBtnText}>Create Free Account</Text>}
          </TouchableOpacity>
        </View>

        {/* Footer */}
        <View style={styles.footer}>
          <Text style={styles.footerText}>Already have an account? </Text>
          <TouchableOpacity onPress={() => router.navigate('/(auth)/login' as any)}>
            <Text style={styles.footerLink}>Sign In</Text>
          </TouchableOpacity>
        </View>

        {/* Terms */}
        <Text style={styles.termsText}>
          By signing up, you agree to our Terms of Service and Privacy Policy
        </Text>

      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#09090B' },
  header: { paddingHorizontal: 24, paddingBottom: 10 },
  backBtn: { width: 40, height: 40, justifyContent: 'center' },
  scroll: { flexGrow: 1, paddingHorizontal: 24, paddingBottom: 40, justifyContent: 'flex-start' },
  
  logoWrap: { alignItems: 'center', marginBottom: 24 },
  logoIcon: {
    width: 64, height: 64, borderRadius: 16, backgroundColor: '#0D211C',
    alignItems: 'center', justifyContent: 'center', marginBottom: 16,
    borderWidth: 1, borderColor: '#10B98120',
  },
  logoText: { color: '#FFFFFF', fontSize: 24, fontWeight: '800', letterSpacing: -0.5 },
  tagline: { color: '#A1A1AA', fontSize: 13, marginTop: 4, textAlign: 'center' },
  
  card: { backgroundColor: '#18181B', borderRadius: 20, padding: 24, paddingVertical: 28, borderWidth: 1, borderColor: '#27272A' },
  
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
  
  banner: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#0D211C', borderRadius: 8,
    padding: 12, marginBottom: 20,
    borderWidth: 1, borderColor: '#10B98130',
  },
  bannerIcon: { marginRight: 8 },
  bannerText: { color: '#10B981', fontSize: 12, fontWeight: '500', flex: 1 },

  primaryBtn: {
    backgroundColor: '#10B981', borderRadius: 12,
    height: 52, alignItems: 'center', justifyContent: 'center',
  },
  disabledBtn: { opacity: 0.6 },
  primaryBtnText: { color: '#09090B', fontSize: 16, fontWeight: '700' },
  
  footer: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', marginTop: 24, marginBottom: 16 },
  footerText: { color: '#A1A1AA', fontSize: 14 },
  footerLink: { color: '#10B981', fontSize: 14, fontWeight: '700' },
  
  termsText: { color: '#71717A', fontSize: 12, textAlign: 'center', paddingHorizontal: 20, lineHeight: 18 },
});
