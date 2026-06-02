import { useEffect } from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Platform, Alert } from 'react-native';
import { AuthProvider } from '../context/AuthContext';
import { Colors } from '../constants/theme';
import { initializeAutoTracking, startBackgroundTracking, requestTrackingPermissions, setAutoTrackingEnabled } from '../services/backgroundTracking';
import { initializeOfflineService } from '../services/offlineService';

export default function RootLayout() {
  // Initialize background tracking and offline service on app start
  useEffect(() => {
    const initialize = async () => {
      try {
        // Initialize offline service (network monitoring)
        await initializeOfflineService();
        console.log('[App] Offline service initialized');
        
        // Auto-enable background tracking on mobile by default
        if (Platform.OS !== 'web') {
          console.log('[App] Initializing auto-tracking...');
          
          // Request permissions
          const hasPermission = await requestTrackingPermissions();
          
          if (hasPermission) {
            // Start background tracking automatically
            const started = await startBackgroundTracking();
            console.log('[App] Background tracking started:', started);
            
            if (started) {
              console.log('[App] Auto-tracking is now ACTIVE - will detect driving automatically');
            }
          } else {
            console.log('[App] Location permission not granted - auto-tracking disabled');
            // Show a one-time alert about enabling tracking
            Alert.alert(
              'Enable Auto-Tracking?',
              'For accurate mileage tracking, please allow location access. The app will automatically detect and track your drives.',
              [
                { text: 'Maybe Later', style: 'cancel' },
                { 
                  text: 'Enable', 
                  onPress: async () => {
                    const granted = await requestTrackingPermissions();
                    if (granted) {
                      await setAutoTrackingEnabled(true);
                      console.log('[App] Auto-tracking enabled and started after user permission grant');
                    }
                  } 
                }
              ]
            );
          }
          
          // Also initialize any existing tracking state
          await initializeAutoTracking();
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
