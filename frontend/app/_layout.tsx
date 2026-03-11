import { useEffect } from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Platform } from 'react-native';
import { AuthProvider } from '../context/AuthContext';
import { Colors } from '../constants/theme';
import { initializeAutoTracking } from '../services/backgroundTracking';
import { initializeOfflineService } from '../services/offlineService';

export default function RootLayout() {
  // Initialize background tracking and offline service on app start
  useEffect(() => {
    const initialize = async () => {
      try {
        // Initialize offline service (network monitoring)
        await initializeOfflineService();
        console.log('[App] Offline service initialized');
        
        // Initialize background tracking on mobile only
        if (Platform.OS !== 'web') {
          await initializeAutoTracking();
          console.log('[App] Background tracking initialized');
        }
      } catch (e) {
        console.log('[App] Initialization error:', e);
      }
    };
    
    initialize();
  }, []);

  return (
    <AuthProvider>
      <StatusBar style="light" />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: Colors.bg.primary } }}>
        <Stack.Screen name="index" />
        <Stack.Screen name="(auth)" />
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="trip/[id]" options={{ presentation: 'modal' }} />
        <Stack.Screen name="ai/assistant" options={{ presentation: 'modal' }} />
        <Stack.Screen name="subscription/index" options={{ presentation: 'modal' }} />
        <Stack.Screen name="auth-callback" />
      </Stack>
    </AuthProvider>
  );
}
