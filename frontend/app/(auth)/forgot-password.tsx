import React, { useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, TextInput,
  KeyboardAvoidingView, Platform, ScrollView, Alert, ActivityIndicator
} from 'react-native';
import { useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export default function ForgotPasswordScreen() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const handleSendCode = async () => {
    if (!email) {
      Alert.alert('Error', 'Please enter your email address');
      return;
    }
    setLoading(true);
    console.log('[ForgotPassword] Sending reset code...');
    // Mock send code for now
    setTimeout(() => {
      setLoading(false);
      Alert.alert('Success', 'If an account exists, a reset code has been sent.');
      router.back();
    }, 1500);
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
            <Feather name="lock" size={32} color="#10B981" />
          </View>
          <Text style={styles.logoText}>Forgot Password?</Text>
          <Text style={styles.tagline}>Enter your email and we'll send you a code to reset your password</Text>
        </View>

        {/* Form Card */}
        <View style={styles.card}>
          {/* Email Input */}
          <View style={styles.inputGroup}>
            <Text style={styles.label}>Email Address</Text>
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

          {/* Send Code Button */}
          <TouchableOpacity style={[styles.primaryBtn, loading && styles.disabledBtn]} onPress={handleSendCode} disabled={loading} activeOpacity={0.8}>
            {loading ? <ActivityIndicator color="#09090B" /> : (
              <View style={styles.btnContent}>
                <Feather name="send" size={18} color="#09090B" style={styles.btnIcon} />
                <Text style={styles.primaryBtnText}>Send Reset Code</Text>
              </View>
            )}
          </TouchableOpacity>
        </View>

      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#09090B' },
  header: { paddingHorizontal: 24, paddingBottom: 10 },
  backBtn: { width: 40, height: 40, justifyContent: 'center' },
  scroll: { flexGrow: 1, paddingHorizontal: 24, paddingBottom: 40 },
  
  logoWrap: { alignItems: 'center', marginBottom: 32, marginTop: 40 },
  logoIcon: {
    width: 72, height: 72, borderRadius: 20, backgroundColor: '#0D211C',
    alignItems: 'center', justifyContent: 'center', marginBottom: 24,
    borderWidth: 1, borderColor: '#10B98120',
  },
  logoText: { color: '#FFFFFF', fontSize: 26, fontWeight: '800', letterSpacing: -0.5, marginBottom: 12 },
  tagline: { color: '#A1A1AA', fontSize: 14, textAlign: 'center', lineHeight: 22, paddingHorizontal: 20 },
  
  card: { backgroundColor: '#18181B', borderRadius: 20, padding: 24, paddingVertical: 28, borderWidth: 1, borderColor: '#27272A' },
  
  inputGroup: { marginBottom: 24 },
  label: { color: '#D4D4D8', fontSize: 13, fontWeight: '600', marginBottom: 8 },
  inputWrap: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#27272A', borderRadius: 12,
    paddingHorizontal: 16, height: 52,
  },
  inputIcon: { marginRight: 12 },
  input: { flex: 1, color: '#FFFFFF', fontSize: 15 },
  
  primaryBtn: {
    backgroundColor: '#10B981', borderRadius: 12,
    height: 52, alignItems: 'center', justifyContent: 'center',
  },
  btnContent: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
  btnIcon: { marginRight: 8 },
  disabledBtn: { opacity: 0.6 },
  primaryBtnText: { color: '#09090B', fontSize: 16, fontWeight: '700' },
});
