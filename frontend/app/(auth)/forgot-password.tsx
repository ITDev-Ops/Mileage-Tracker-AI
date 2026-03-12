import React, { useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, TextInput,
  KeyboardAvoidingView, Platform, ScrollView, Alert, ActivityIndicator
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { Colors, FontSize, Spacing, Radius } from '../../constants/theme';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { API } from '../../services/api';

type Step = 'email' | 'code' | 'success';

export default function ForgotPasswordScreen() {
  const [step, setStep] = useState<Step>('email');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [resetCode, setResetCode] = useState(''); // For demo purposes
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const showError = (message: string) => {
    setErrorMsg(message);
    if (Platform.OS !== 'web') {
      Alert.alert('Error', message);
    }
  };

  const handleRequestReset = async () => {
    setErrorMsg('');
    if (!email.trim()) {
      showError('Please enter your email address');
      return;
    }
    
    setLoading(true);
    try {
      const result = await API.forgotPassword(email.trim().toLowerCase());
      console.log('[ForgotPassword] Reset code sent:', result);
      
      // For demo purposes, we get the code from the response
      if (result.reset_code) {
        setResetCode(result.reset_code);
      }
      
      setStep('code');
      Alert.alert(
        'Code Sent! 📧',
        `A 6-digit reset code has been sent to ${email}.\n\nFor demo: Your code is ${result.reset_code}`,
        [{ text: 'OK' }]
      );
    } catch (e: any) {
      showError(e.message || 'Failed to send reset code');
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyCode = async () => {
    setErrorMsg('');
    
    if (!code.trim() || code.length !== 6) {
      showError('Please enter the 6-digit code');
      return;
    }
    
    if (!newPassword || newPassword.length < 6) {
      showError('Password must be at least 6 characters');
      return;
    }
    
    if (newPassword !== confirmPassword) {
      showError('Passwords do not match');
      return;
    }
    
    setLoading(true);
    try {
      await API.verifyResetCode(email.trim().toLowerCase(), code.trim(), newPassword);
      setStep('success');
    } catch (e: any) {
      showError(e.message || 'Failed to reset password');
    } finally {
      setLoading(false);
    }
  };

  const renderEmailStep = () => (
    <>
      <View style={styles.iconWrap}>
        <Feather name="lock" size={40} color={Colors.brand.primary} />
      </View>
      <Text style={styles.title}>Forgot Password?</Text>
      <Text style={styles.subtitle}>Enter your email and we'll send you a code to reset your password</Text>
      
      {errorMsg ? (
        <View style={styles.errorBox}>
          <Feather name="alert-circle" size={16} color="#ff6b6b" />
          <Text style={styles.errorText}>{errorMsg}</Text>
        </View>
      ) : null}
      
      <View style={styles.inputGroup}>
        <Text style={styles.label}>Email Address</Text>
        <View style={styles.inputWrap}>
          <Feather name="mail" size={18} color={Colors.text.tertiary} />
          <TextInput
            style={styles.input}
            placeholder="your@email.com"
            placeholderTextColor={Colors.text.tertiary}
            keyboardType="email-address"
            autoCapitalize="none"
            value={email}
            onChangeText={setEmail}
          />
        </View>
      </View>
      
      <TouchableOpacity 
        style={[styles.primaryBtn, loading && styles.btnDisabled]} 
        onPress={handleRequestReset}
        disabled={loading}
      >
        {loading ? (
          <ActivityIndicator color="#000" />
        ) : (
          <>
            <Feather name="send" size={18} color="#000" />
            <Text style={styles.primaryBtnText}>Send Reset Code</Text>
          </>
        )}
      </TouchableOpacity>
    </>
  );

  const renderCodeStep = () => (
    <>
      <View style={styles.iconWrap}>
        <Feather name="key" size={40} color={Colors.brand.primary} />
      </View>
      <Text style={styles.title}>Enter Reset Code</Text>
      <Text style={styles.subtitle}>Enter the 6-digit code sent to {email}</Text>
      
      {resetCode ? (
        <View style={styles.demoCodeBox}>
          <Feather name="info" size={14} color={Colors.brand.secondary} />
          <Text style={styles.demoCodeText}>Demo code: <Text style={styles.demoCode}>{resetCode}</Text></Text>
        </View>
      ) : null}
      
      {errorMsg ? (
        <View style={styles.errorBox}>
          <Feather name="alert-circle" size={16} color="#ff6b6b" />
          <Text style={styles.errorText}>{errorMsg}</Text>
        </View>
      ) : null}
      
      <View style={styles.inputGroup}>
        <Text style={styles.label}>6-Digit Code</Text>
        <View style={styles.inputWrap}>
          <Feather name="hash" size={18} color={Colors.text.tertiary} />
          <TextInput
            style={styles.input}
            placeholder="123456"
            placeholderTextColor={Colors.text.tertiary}
            keyboardType="number-pad"
            maxLength={6}
            value={code}
            onChangeText={setCode}
          />
        </View>
      </View>
      
      <View style={styles.inputGroup}>
        <Text style={styles.label}>New Password</Text>
        <View style={styles.inputWrap}>
          <Feather name="lock" size={18} color={Colors.text.tertiary} />
          <TextInput
            style={styles.input}
            placeholder="Min 6 characters"
            placeholderTextColor={Colors.text.tertiary}
            secureTextEntry={!showPass}
            value={newPassword}
            onChangeText={setNewPassword}
          />
          <TouchableOpacity onPress={() => setShowPass(!showPass)}>
            <Feather name={showPass ? 'eye-off' : 'eye'} size={18} color={Colors.text.tertiary} />
          </TouchableOpacity>
        </View>
      </View>
      
      <View style={styles.inputGroup}>
        <Text style={styles.label}>Confirm Password</Text>
        <View style={styles.inputWrap}>
          <Feather name="lock" size={18} color={Colors.text.tertiary} />
          <TextInput
            style={styles.input}
            placeholder="Confirm your password"
            placeholderTextColor={Colors.text.tertiary}
            secureTextEntry={!showPass}
            value={confirmPassword}
            onChangeText={setConfirmPassword}
          />
        </View>
      </View>
      
      <TouchableOpacity 
        style={[styles.primaryBtn, loading && styles.btnDisabled]} 
        onPress={handleVerifyCode}
        disabled={loading}
      >
        {loading ? (
          <ActivityIndicator color="#000" />
        ) : (
          <>
            <Feather name="check-circle" size={18} color="#000" />
            <Text style={styles.primaryBtnText}>Reset Password</Text>
          </>
        )}
      </TouchableOpacity>
      
      <TouchableOpacity style={styles.linkBtn} onPress={() => setStep('email')}>
        <Text style={styles.linkText}>Didn't receive code? <Text style={styles.linkBold}>Resend</Text></Text>
      </TouchableOpacity>
    </>
  );

  const renderSuccessStep = () => (
    <>
      <View style={[styles.iconWrap, { backgroundColor: Colors.brand.primaryDim }]}>
        <Feather name="check-circle" size={40} color={Colors.brand.primary} />
      </View>
      <Text style={styles.title}>Password Reset! 🎉</Text>
      <Text style={styles.subtitle}>Your password has been successfully reset. You can now log in with your new password.</Text>
      
      <TouchableOpacity 
        style={styles.primaryBtn} 
        onPress={() => router.push('/(auth)/login')}
      >
        <Feather name="log-in" size={18} color="#000" />
        <Text style={styles.primaryBtnText}>Back to Login</Text>
      </TouchableOpacity>
    </>
  );

  return (
    <KeyboardAvoidingView style={styles.root} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <ScrollView 
        contentContainerStyle={[styles.scroll, { paddingTop: insets.top + 20, paddingBottom: insets.bottom + 20 }]} 
        keyboardShouldPersistTaps="handled"
      >
        {/* Back Button */}
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <Feather name="arrow-left" size={24} color={Colors.text.primary} />
        </TouchableOpacity>
        
        <View style={styles.content}>
          {step === 'email' && renderEmailStep()}
          {step === 'code' && renderCodeStep()}
          {step === 'success' && renderSuccessStep()}
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.bg.primary },
  scroll: { flexGrow: 1, paddingHorizontal: Spacing.lg },
  backBtn: { padding: 8, alignSelf: 'flex-start', marginBottom: 20 },
  content: { flex: 1, justifyContent: 'center', paddingBottom: 40 },
  iconWrap: { 
    width: 80, height: 80, borderRadius: 20, 
    backgroundColor: Colors.bg.secondary, 
    alignItems: 'center', justifyContent: 'center', 
    alignSelf: 'center', marginBottom: 24,
    borderWidth: 1, borderColor: Colors.brand.primary + '40'
  },
  title: { 
    color: Colors.text.primary, fontSize: FontSize.xxl, fontWeight: '800', 
    textAlign: 'center', marginBottom: 8 
  },
  subtitle: { 
    color: Colors.text.secondary, fontSize: FontSize.sm, 
    textAlign: 'center', marginBottom: 32, lineHeight: 22 
  },
  errorBox: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: '#ff6b6b20', borderRadius: Radius.md,
    padding: 12, marginBottom: 16, borderWidth: 1, borderColor: '#ff6b6b40',
  },
  errorText: { color: '#ff6b6b', fontSize: FontSize.sm, fontWeight: '600', flex: 1 },
  demoCodeBox: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: Colors.brand.secondaryDim, borderRadius: Radius.md,
    padding: 12, marginBottom: 16, borderWidth: 1, borderColor: Colors.brand.secondary + '40',
  },
  demoCodeText: { color: Colors.text.secondary, fontSize: FontSize.sm },
  demoCode: { color: Colors.brand.secondary, fontWeight: '700', fontSize: FontSize.base },
  inputGroup: { marginBottom: 16 },
  label: { color: Colors.text.secondary, fontSize: FontSize.sm, fontWeight: '600', marginBottom: 8 },
  inputWrap: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: Colors.bg.secondary, borderRadius: Radius.lg,
    paddingHorizontal: 16, paddingVertical: 14,
    borderWidth: 1, borderColor: Colors.border
  },
  input: { flex: 1, color: Colors.text.primary, fontSize: FontSize.base },
  primaryBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: Colors.brand.primary, borderRadius: Radius.xl,
    padding: 16, marginTop: 8
  },
  btnDisabled: { opacity: 0.7 },
  primaryBtnText: { color: '#000', fontSize: FontSize.base, fontWeight: '700' },
  linkBtn: { alignItems: 'center', paddingVertical: 16 },
  linkText: { color: Colors.text.secondary, fontSize: FontSize.sm },
  linkBold: { color: Colors.brand.primary, fontWeight: '700' },
});
