import { useEffect, useState } from 'react';
import { View, StyleSheet, Platform } from 'react-native';
import { useRouter, useRootNavigationState } from 'expo-router';
import { useAuth } from '../context/AuthContext';
import { Colors } from '../constants/theme';
import LoadingSpinner from '../components/LoadingSpinner';

export default function AuthCallback() {
  const { loginWithGoogle } = useAuth();
  const router = useRouter();
  const rootNavigationState = useRootNavigationState();
  const [status, setStatus] = useState<'init' | 'processing' | 'done' | 'error'>('init');
  const [message, setMessage] = useState('Completing sign in...');

  // Check if navigation is ready
  const navigationReady = rootNavigationState?.key != null;

  useEffect(() => {
    // Only process once when navigation is ready and we haven't started processing
    if (!navigationReady || status !== 'init') {
      return;
    }
    
    setStatus('processing');
    console.log('[AuthCallback] Starting auth callback processing...');

    const processCallback = async () => {
      try {
        let sessionId: string | null = null;

        if (Platform.OS === 'web' && typeof window !== 'undefined') {
          // Check hash first
          const hash = window.location.hash;
          console.log('[AuthCallback] Hash:', hash);
          if (hash) {
            const params = new URLSearchParams(hash.substring(1));
            sessionId = params.get('session_id');
          }
          // Then check query string
          if (!sessionId) {
            const search = window.location.search;
            console.log('[AuthCallback] Search:', search);
            const params = new URLSearchParams(search);
            sessionId = params.get('session_id');
          }
        }

        console.log('[AuthCallback] Session ID:', sessionId ? 'FOUND' : 'NOT FOUND');

        if (sessionId) {
          setMessage('Logging in...');
          await loginWithGoogle(sessionId);
          console.log('[AuthCallback] Login successful!');
          setStatus('done');
          setMessage('Success! Redirecting...');
          // Navigate after a short delay
          setTimeout(() => {
            router.replace('/(tabs)/dashboard');
          }, 500);
        } else {
          console.log('[AuthCallback] No session ID, redirecting to login');
          setStatus('error');
          setMessage('No session found, redirecting...');
          setTimeout(() => {
            router.replace('/(auth)/login');
          }, 1000);
        }
      } catch (err: any) {
        console.error('[AuthCallback] Error:', err);
        setStatus('error');
        setMessage('Login failed: ' + (err?.message || 'Unknown error'));
        setTimeout(() => {
          router.replace('/(auth)/login');
        }, 2000);
      }
    };

    // Start processing with a small delay
    setTimeout(processCallback, 100);
  }, [navigationReady, status, loginWithGoogle, router]);

  return (
    <View style={styles.container}>
      <LoadingSpinner text={message} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bg.primary, alignItems: 'center', justifyContent: 'center' },
});
