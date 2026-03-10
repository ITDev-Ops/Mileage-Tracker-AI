import { useEffect } from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Platform } from 'react-native';
import { AuthProvider } from '../context/AuthContext';
import { Colors } from '../constants/theme';
import { initializeAutoTracking } from '../services/backgroundTracking';

export default function RootLayout() {
  // Initialize background tracking on app start
  useEffect(() => {
    if (Platform.OS !== 'web') {
      initializeAutoTracking().then(() => {
        console.log('[App] Background tracking initialized');
      }).catch((e) => {
        console.log('[App] Failed to initialize background tracking:', e);
      });
    }
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
