import { Tabs } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { Colors } from '../../constants/theme';
import { Platform, View, StyleSheet } from 'react-native';

import LegalConsentModal from '../../components/LegalConsentModal';

function TabIcon({ name, color, focused }: { name: string; color: string; focused: boolean }) {
  return (
    <View style={[styles.iconWrap, focused && styles.iconWrapFocused]}>
      <Feather name={name as any} size={22} color={color} />
    </View>
  );
}

export default function TabsLayout() {
  return (
    <>
      <LegalConsentModal />
      <Tabs
        screenOptions={{
          headerShown: false,
          tabBarStyle: {
            backgroundColor: Colors.bg.secondary,
            borderTopColor: Colors.border,
            borderTopWidth: 1,
            height: Platform.OS === 'ios' ? 88 : 64,
            paddingBottom: Platform.OS === 'ios' ? 28 : 8,
            paddingTop: 8,
          },
          tabBarActiveTintColor: Colors.brand.primary,
          tabBarInactiveTintColor: Colors.text.tertiary,
          tabBarShowLabel: true,
          tabBarLabelStyle: { fontSize: 10, fontWeight: '600', marginTop: 2 },
        }}
      >
        <Tabs.Screen
          name="dashboard"
          options={{ title: 'Dashboard', tabBarIcon: ({ color, focused }) => <TabIcon name="home" color={color as string} focused={focused} /> }}
        />
        <Tabs.Screen
          name="trips"
          options={{ title: 'Trips', tabBarIcon: ({ color, focused }) => <TabIcon name="map" color={color as string} focused={focused} /> }}
        />
        <Tabs.Screen
          name="expenses"
          options={{ title: 'Expenses', tabBarIcon: ({ color, focused }) => <TabIcon name="credit-card" color={color as string} focused={focused} /> }}
        />
        <Tabs.Screen
          name="reports"
          options={{ title: 'Reports', tabBarIcon: ({ color, focused }) => <TabIcon name="bar-chart-2" color={color as string} focused={focused} /> }}
        />
        <Tabs.Screen
          name="settings"
          options={{ title: 'Settings', tabBarIcon: ({ color, focused }) => <TabIcon name="settings" color={color as string} focused={focused} /> }}
        />
      </Tabs>
    </>
  );
}

const styles = StyleSheet.create({
  iconWrap: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center', borderRadius: 10 },
  iconWrapFocused: { backgroundColor: Colors.brand.primaryDim },
});
