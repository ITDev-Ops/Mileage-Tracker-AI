import { useEffect, useState } from 'react';
import { Redirect, useRootNavigationState } from 'expo-router';
import { useAuth } from '../context/AuthContext';
import LoadingSpinner from '../components/LoadingSpinner';

export default function Index() {
  const { user, loading } = useAuth();
  const rootNavigationState = useRootNavigationState();

  // Check if navigation is ready
  const navigationReady = rootNavigationState?.key != null;

  // Wait for both auth loading AND navigation to be ready
  if (loading || !navigationReady) {
    return <LoadingSpinner fullScreen text="Loading Mileage Tracker AI..." />;
  }

  // Use Redirect component to avoid timing issues
  if (user) {
    return <Redirect href="/(tabs)/dashboard" />;
  }
  
  return <Redirect href="/(auth)/login" />;
}
