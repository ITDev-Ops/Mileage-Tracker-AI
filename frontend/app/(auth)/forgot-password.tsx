import React, { useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, TextInput,
  KeyboardAvoidingView, Platform, ScrollView, Alert, ActivityIndicator
} from 'react-native';
import { useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { API } from '../../services/api';

export default function ForgotPasswordScreen() {
  const [step, setStep] = useState<1 | 2>(1);
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const handleSendCode = async () => {
    if (!email || !email.includes('@')) {
      Alert.alert('Invalid Email', 'Please enter a valid email address.');
      return;
    }
    setLoading(true);
    console.log(`[ForgotPassword] Requesting reset code for ${email}...`);
    try {
      const res = await API.requestPasswordReset(email.trim());
      setLoading(false);
      Alert.alert(
        'Code Sent',
        res.message || 'If an account exists, a 6-digit reset code has been sent to your email.',
        [{ text: 'OK', onPress: () => setStep(2) }]
      );
    } catch (err: any) {
      setLoading(false);
      Alert.alert('Error', err.message || 'Failed to send reset code. Please try again.');
    }
  };

  const handleResetPassword = async () => {
    if (!code || code.trim().length !== 6) {
      Alert.alert('Invalid Code', 'Please enter the 6-digit reset code sent to your email.');
      return;
    }
    if (!newPassword || newPassword.length < 6) {
      Alert.alert('Weak Password', 'New password must be at least 6 characters long.');
      return;
    }
    if (newPassword !== confirmPassword) {
      Alert.alert('Password Mismatch', 'New password and confirmation do not match.');
      return;
    }

    setLoading(true);
    console.log(`[ForgotPassword] Submitting new password for ${email}...`);
    try {
      const res = await API.resetPassword(email.trim(), code.trim(), newPassword);
      setLoading(false);
      Alert.alert(
        'Success',
        res.message || 'Your password has been reset successfully. You can now log in.',
        [{ text: 'Log In', onPress: () => router.back() }]
      );
    } catch (err: any) {
      setLoading(false);
      Alert.alert('Error', err.message || 'Failed to reset password. Please check your reset code.');
    }
  };

  return (
    <KeyboardAvoidingView style={styles.root} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <View style={[styles.header, { paddingTop: insets.top + 20 }]}>
        <TouchableOpacity onPress={() => step === 2 ? setStep(1) : router.back()} style={styles.backBtn}>
          <Feather name="arrow-left" size={24} color="#FFFFFF" />
        </TouchableOpacity>
      </View>
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        
        {/* Logo/Icon Header */}
        <View style={styles.logoWrap}>
          <View style={styles.logoIcon}>
            <Feather name={step === 1 ? "lock" : "key"} size={32} color="#10B981" />
          </View>
          <Text style={styles.logoText}>{step === 1 ? "Forgot Password?" : "Reset Your Password"}</Text>
          <Text style={styles.tagline}>
            {step === 1 
              ? "Enter your email address and we'll send you a 6-digit code to reset your password" 
              : `Enter the 6-digit code sent to ${email} and choose a new password`}
          </Text>
        </View>

        {/* Form Card */}
        <View style={styles.card}>
          {step === 1 ? (
            <>
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
            </>
          ) : (
            <>
              {/* 6-Digit Code */}
              <View style={styles.inputGroup}>
                <Text style={styles.label}>6-Digit Verification Code</Text>
                <View style={styles.inputWrap}>
                  <Feather name="shield" size={18} color="#71717A" style={styles.inputIcon} />
                  <TextInput
                    style={styles.input}
                    placeholder="123456"
                    placeholderTextColor="#71717A"
                    value={code}
                    onChangeText={setCode}
                    keyboardType="number-pad"
                    maxLength={6}
                  />
                </View>
              </View>

              {/* New Password */}
              <View style={styles.inputGroup}>
                <Text style={styles.label}>New Password</Text>
                <View style={styles.inputWrap}>
                  <Feather name="lock" size={18} color="#71717A" style={styles.inputIcon} />
                  <TextInput
                    style={styles.input}
                    placeholder="At least 6 characters"
                    placeholderTextColor="#71717A"
                    value={newPassword}
                    onChangeText={setNewPassword}
                    secureTextEntry
                  />
                </View>
              </View>

              {/* Confirm Password */}
              <View style={styles.inputGroup}>
                <Text style={styles.label}>Confirm New Password</Text>
                <View style={styles.inputWrap}>
                  <Feather name="check-circle" size={18} color="#71717A" style={styles.inputIcon} />
                  <TextInput
                    style={styles.input}
                    placeholder="Re-enter new password"
                    placeholderTextColor="#71717A"
                    value={confirmPassword}
                    onChangeText={setConfirmPassword}
                    secureTextEntry
                  />
                </View>
              </View>

              {/* Reset Password Button */}
              <TouchableOpacity style={[styles.primaryBtn, loading && styles.disabledBtn]} onPress={handleResetPassword} disabled={loading} activeOpacity={0.8}>
                {loading ? <ActivityIndicator color="#09090B" /> : (
                  <View style={styles.btnContent}>
                    <Feather name="check" size={18} color="#09090B" style={styles.btnIcon} />
                    <Text style={styles.primaryBtnText}>Confirm Reset Password</Text>
                  </View>
                )}
              </TouchableOpacity>

              {/* Resend Code */}
              <TouchableOpacity style={styles.resendBtn} onPress={handleSendCode} disabled={loading}>
                <Text style={styles.resendText}>Didn't receive a code? <Text style={styles.resendHighlight}>Resend Code</Text></Text>
              </TouchableOpacity>
            </>
          )}
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
  
  logoWrap: { alignItems: 'center', marginBottom: 32, marginTop: 20 },
  logoIcon: {
    width: 72, height: 72, borderRadius: 20, backgroundColor: '#0D211C',
    alignItems: 'center', justifyContent: 'center', marginBottom: 20,
    borderWidth: 1, borderColor: '#10B98120',
  },
  logoText: { color: '#FFFFFF', fontSize: 24, fontWeight: '800', letterSpacing: -0.5, marginBottom: 8 },
  tagline: { color: '#A1A1AA', fontSize: 14, textAlign: 'center', lineHeight: 22, paddingHorizontal: 16 },
  
  card: { backgroundColor: '#18181B', borderRadius: 20, padding: 24, paddingVertical: 28, borderWidth: 1, borderColor: '#27272A' },
  
  inputGroup: { marginBottom: 20 },
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
    marginTop: 8,
  },
  btnContent: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
  btnIcon: { marginRight: 8 },
  disabledBtn: { opacity: 0.6 },
  primaryBtnText: { color: '#09090B', fontSize: 16, fontWeight: '700' },
  
  resendBtn: { marginTop: 20, alignItems: 'center' },
  resendText: { color: '#A1A1AA', fontSize: 13 },
  resendHighlight: { color: '#10B981', fontWeight: '600' },
});
