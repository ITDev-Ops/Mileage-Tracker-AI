import { useEffect, useRef, useState } from 'react';
import { View, StyleSheet, Platform } from 'react-native';
import { Redirect, useRouter, useSegments, useRootNavigationState } from 'expo-router';
import { useAuth } from '../context/AuthContext';
import { Colors } from '../constants/theme';
import LoadingSpinner from '../components/LoadingSpinner';

// Version: 3.0 - Use Redirect component to avoid navigation timing issues
export default function AuthCallback() {
  const { loginWithGoogle, user } = useAuth();
  const router = useRouter();
  const rootNavigationState = useRootNavigationState();
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
  const processed = useRef(false);

  // Check if navigation is ready
  const navigationReady = rootNavigationState?.key != null;

  useEffect(() => {
    // Critical: Don't process until navigation is ready
    if (!navigationReady) {
      console.log('[AuthCallback] Waiting for navigation...');
      return;
    }
    
    if (processed.current) return;
    processed.current = true;
    
    console.log('[AuthCallback] Processing auth callback...');

    const processCallback = async () => {
      try {
        let sessionId: string | null = null;

        if (Platform.OS === 'web' && typeof window !== 'undefined') {
          const hash = window.location.hash;
          if (hash) {
            const params = new URLSearchParams(hash.substring(1));
            sessionId = params.get('session_id');
          }
          if (!sessionId) {
            const search = window.location.search;
            const params = new URLSearchParams(search);
            sessionId = params.get('session_id');
          }
        }

        console.log('[AuthCallback] Session ID:', sessionId ? 'found' : 'not found');

        if (sessionId) {
          await loginWithGoogle(sessionId);
          console.log('[AuthCallback] Login successful');
          setStatus('success');
        } else {
          console.log('[AuthCallback] No session, will redirect to login');
          setStatus('error');
        }
      } catch (err) {
        console.error('[AuthCallback] Error:', err);
        setStatus('error');
      }
    };

    // Small delay to ensure everything is stable
    const timer = setTimeout(processCallback, 200);
    return () => clearTimeout(timer);
  }, [navigationReady, loginWithGoogle]);

  // Use Redirect component instead of router.replace to avoid timing issues
  if (status === 'success' && navigationReady) {
    return <Redirect href="/(tabs)/dashboard" />;
  }
  
  if (status === 'error' && navigationReady) {
    return <Redirect href="/(auth)/login" />;
  }

  return (
    <View style={styles.container}>
      <LoadingSpinner text="Completing sign in..." />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bg.primary, alignItems: 'center', justifyContent: 'center' },
});
