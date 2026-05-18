import { useEffect } from 'react';
import { useRouter } from 'expo-router';
import { View, ActivityIndicator } from 'react-native';
import { Colors } from '../constants/theme';

export default function AuthCallback() {
  const router = useRouter();
  
  useEffect(() => {
    // AuthSession usually intercepts the URL before React mounts.
    // If the user lands here, safely redirect them forward.
    const timer = setTimeout(() => {
      router.replace('/');
    }, 500);
    return () => clearTimeout(timer);
  }, [router]);

  return (
    <View style={{ flex: 1, backgroundColor: Colors.bg.primary, justifyContent: 'center', alignItems: 'center' }}>
      <ActivityIndicator size="large" color={Colors.brand.primary} />
    </View>
  );
}
