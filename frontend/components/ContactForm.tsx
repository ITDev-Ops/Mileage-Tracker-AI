import React, { useState } from 'react';
import {
  StyleSheet, Text, TextInput, TouchableOpacity,
  View, ActivityIndicator, Alert, Platform, ScrollView
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { Colors, FontSize, Spacing, Radius } from '../constants/theme';
import { useAuth } from '../context/AuthContext';

interface ContactFormProps {
  onSuccess?: () => void;
  mailerUrl?: string;
}

export default function ContactForm({ onSuccess, mailerUrl }: ContactFormProps) {
  const { user } = useAuth();
  const [email, setEmail] = useState(user?.email || '');
  const [subject, setSubject] = useState('Support Request');
  const [message, setMessage] = useState('');
  const [honeypot, setHoneypot] = useState(''); // Off-screen trap field for automated bots
  const [loading, setLoading] = useState(false);

  // Target URL defaults to standard mobile backend mailing endpoint or prop override
  const targetEndpoint = mailerUrl || (process.env.EXPO_PUBLIC_BACKEND_URL 
    ? `${process.env.EXPO_PUBLIC_BACKEND_URL.replace(/\/api\/?$/, '')}/php_mailer/process.php`
    : 'http://localhost:8088/process.php');

  const handleSubmit = async () => {
    const trimmedEmail = email.trim();
    const trimmedMessage = message.trim();

    if (!trimmedEmail || !trimmedMessage) {
      if (Platform.OS === 'web') {
        alert('Please fill out all required fields.');
      } else {
        Alert.alert('Missing Fields', 'Please enter your email address and message.');
      }
      return;
    }

    setLoading(true);

    try {
      // 1. Format payload as application/x-www-form-urlencoded
      const payload: Record<string, string> = {
        email: trimmedEmail,
        subject: subject,
        message: trimmedMessage,
        type: 'general',
        subscribe_newsletter: honeypot // Honeypot trap field
      };

      const formBody = Object.keys(payload)
        .map(key => encodeURIComponent(key) + '=' + encodeURIComponent(payload[key]))
        .join('&');

      // 2. Perform non-blocking asynchronous transmission
      const response = await fetch(targetEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
          'Accept': 'application/json'
        },
        body: formBody,
      });

      const result = await response.json();

      if (result.status === 'success') {
        if (Platform.OS === 'web') {
          alert('🎉 ' + result.message);
        } else {
          Alert.alert('Success', result.message);
        }
        setMessage('');
        if (onSuccess) onSuccess();
      } else {
        const errorMsg = result.message || 'Could not process message.';
        if (Platform.OS === 'web') {
          alert('Error: ' + errorMsg);
        } else {
          Alert.alert('Submission Error', errorMsg);
        }
      }
    } catch (error: any) {
      console.log('ContactForm error:', error);
      const networkErr = 'Could not establish connection to the mail server.';
      if (Platform.OS === 'web') {
        alert('Network Error: ' + networkErr);
      } else {
        Alert.alert('Network Error', networkErr);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
      <Text style={styles.title}>Contact Support</Text>
      <Text style={styles.subtitle}>Have a question or feedback? Send our team a secure message.</Text>

      {/* Email Address */}
      <Text style={styles.label}>Your Email Address</Text>
      <View style={styles.inputWrap}>
        <Feather name="mail" size={16} color={Colors.text.tertiary} style={styles.inputIcon} />
        <TextInput
          testID="contact-email-input"
          style={styles.input}
          value={email}
          onChangeText={setEmail}
          placeholder="email@example.com"
          placeholderTextColor={Colors.text.tertiary}
          keyboardType="email-address"
          autoCapitalize="none"
        />
      </View>

      {/* Subject */}
      <Text style={styles.label}>Subject</Text>
      <View style={styles.inputWrap}>
        <Feather name="help-circle" size={16} color={Colors.text.tertiary} style={styles.inputIcon} />
        <TextInput
          testID="contact-subject-input"
          style={styles.input}
          value={subject}
          onChangeText={setSubject}
          placeholder="Brief description..."
          placeholderTextColor={Colors.text.tertiary}
        />
      </View>

      {/* Message */}
      <Text style={styles.label}>Message</Text>
      <TextInput
        testID="contact-message-input"
        style={[styles.input, styles.textArea]}
        value={message}
        onChangeText={setMessage}
        placeholder="Type your message here..."
        placeholderTextColor={Colors.text.tertiary}
        multiline
        numberOfLines={5}
      />

      {/* HONEYPOT TRAP: Completely invisible off-screen input to trap scrapers */}
      <TextInput
        testID="contact-honeypot-input"
        style={styles.hiddenTrap}
        value={honeypot}
        onChangeText={setHoneypot}
        tabIndex={-1}
        aria-hidden="true"
        autoCapitalize="none"
        autoComplete="off"
      />

      {/* Submit Button */}
      <TouchableOpacity
        testID="contact-submit-btn"
        style={[styles.button, loading && styles.buttonDisabled]}
        onPress={handleSubmit}
        disabled={loading}
      >
        {loading ? (
          <ActivityIndicator color={Colors.text.inverse} size="small" />
        ) : (
          <View style={styles.btnRow}>
            <Feather name="send" size={16} color={Colors.text.inverse} />
            <Text style={styles.buttonText}>Send Message</Text>
          </View>
        )}
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: Spacing.screen },
  title: { fontSize: FontSize.xl, fontWeight: '800', color: Colors.text.primary, marginBottom: 4 },
  subtitle: { fontSize: FontSize.xs, color: Colors.text.secondary, marginBottom: 20, lineHeight: 18 },
  label: { fontSize: FontSize.xs, fontWeight: '700', color: Colors.text.primary, marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.5 },
  inputWrap: { flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.bg.secondary, borderWidth: 1, borderColor: Colors.border, borderRadius: Radius.md, paddingHorizontal: 12, marginBottom: 16 },
  inputIcon: { marginRight: 8 },
  input: { flex: 1, color: Colors.text.primary, fontSize: FontSize.sm, paddingVertical: 12 },
  textArea: { backgroundColor: Colors.bg.secondary, borderWidth: 1, borderColor: Colors.border, borderRadius: Radius.md, padding: 12, marginBottom: 20, height: 110, textAlignVertical: 'top' },
  button: { backgroundColor: Colors.brand.primary, paddingVertical: 14, borderRadius: Radius.md, alignItems: 'center', justifyContent: 'center' },
  buttonDisabled: { opacity: 0.6 },
  btnRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  buttonText: { color: Colors.text.inverse, fontSize: FontSize.base, fontWeight: '700' },
  // Absolutely position it far off-screen so human users never see it, but scrapers fill it out
  hiddenTrap: { position: 'absolute', width: 0, height: 0, left: -9999, top: -9999 }
});
