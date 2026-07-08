import React, { createContext, useContext, useState, useEffect } from 'react';
import { Platform, Alert } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { API } from '../services/api';

export interface User {
  user_id: string;
  email: string;
  name: string;
  picture?: string;
  subscription_tier: string;
  occupation_type: string;
  tax_country: string;
  vehicle_type?: string;
  invited_team_plan?: string;
}

interface AuthContextType {
  user: User | null;
  token: string | null;
  loading: boolean;
  login: (email?: string, password?: string) => Promise<void>;
  register: (name?: string, email?: string, password?: string, token?: string) => Promise<void>;
  loginWithGoogle: () => Promise<void>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({} as AuthContextType);

const authLog = (message: string, data?: any) => {
  const prefix = `[Auth][${Platform.OS}]`;
  if (data !== undefined) {
    console.log(prefix, message, typeof data === 'object' ? JSON.stringify(data) : data);
  } else {
    console.log(prefix, message);
  }
};

const TOKEN_KEY = '@multimile_jwt_token';

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  // We should set loading to true initially for all platforms to await stored session checks
  const [loading, setLoading] = useState(true);

  // Load token on startup
  useEffect(() => {
    loadStoredSession();
  }, []);

  // Synchronize tax_country and subscription_tier to AsyncStorage for non-React utility modules
  useEffect(() => {
    const syncUserMetadata = async () => {
      if (user) {
        try {
          await AsyncStorage.setItem('tax_country', user.tax_country || 'US');
          await AsyncStorage.setItem('subscription_tier', user.subscription_tier || 'free');
        } catch (e) {
          console.log('[AuthContext] Failed to save user metadata to AsyncStorage:', e);
        }
      } else {
        try {
          await AsyncStorage.removeItem('tax_country');
          await AsyncStorage.removeItem('subscription_tier');
        } catch {}
      }
    };
    syncUserMetadata();
  }, [user]);

  const loadStoredSession = async () => {
    try {
      const storedToken = await AsyncStorage.getItem(TOKEN_KEY);
      const storedUser = await AsyncStorage.getItem('@multimile_user');
      
      if (storedToken) {
        authLog('loadStoredSession: Found token.');
        setToken(storedToken);
        
        if (storedUser) {
          try {
            const parsedUser = JSON.parse(storedUser);
            setUser(parsedUser);
            authLog('loadStoredSession: Stored user set from cache.', parsedUser.email);
          } catch (parseErr) {
            authLog('loadStoredSession: Failed to parse stored user:', parseErr);
          }
        }
        
        // Try validating with the backend
        try {
          const userData = await API.getMe(storedToken);
          setUser(userData);
          await AsyncStorage.setItem('@multimile_user', JSON.stringify(userData));
          authLog('loadStoredSession: User verified and updated from backend successfully.');
        } catch (apiError: any) {
          authLog('loadStoredSession: API verification failed:', apiError.message);
          // Check if it is a network connectivity error
          const isNetworkError = apiError.message.includes('Unable to connect') || 
                                 apiError.message.includes('Network request failed') || 
                                 apiError.message.includes('fetch') ||
                                 apiError.message.includes('Timeout');
                                 
          if (isNetworkError) {
            authLog('loadStoredSession: Network issue, keeping cached session.');
          } else {
            authLog('loadStoredSession: Invalid/expired token, cleaning up session.');
            await logout();
          }
        }
      } else {
        authLog('loadStoredSession: No token found.');
      }
    } catch (error: any) {
      authLog('loadStoredSession: ERROR restoring session:', error.message);
      await logout();
    } finally {
      setLoading(false);
    }
  };

  const persistSession = async (jwtToken: string, userData: User) => {
    setToken(jwtToken);
    setUser(userData);
    try {
      await AsyncStorage.setItem(TOKEN_KEY, jwtToken);
      await AsyncStorage.setItem('@multimile_user', JSON.stringify(userData));
    } catch (e) {
      authLog('persistSession: failed to save session data', e);
    }
  };

  const login = async (email?: string, password?: string) => {
    setLoading(true);
    authLog('login: Calling custom backend login API...');
    try {
      if (!email || !password) {
        throw new Error('Email and password required');
      }
      const response = await API.authLogin({ email, password });
      await persistSession(response.access_token, response.user);
      authLog('login: Custom login complete');
    } catch (error: any) {
      authLog('login: ERROR', error.message);
      throw error;
    } finally {
      setLoading(false);
    }
  };

  const register = async (name?: string, email?: string, password?: string, token?: string) => {
    setLoading(true);
    authLog('register: Calling custom backend register API...');
    try {
      if (!email || !password || !name) {
        throw new Error('Name, email, and password required');
      }
      const response = await API.authRegister({ name, email, password, token });
      await persistSession(response.access_token, response.user);
      authLog('register: Custom register complete');
    } catch (error: any) {
      authLog('register: ERROR', error.message);
      throw error;
    } finally {
      setLoading(false);
    }
  };

  const loginWithGoogle = async () => {
    Alert.alert('Coming Soon', 'Google Authentication will be implemented in a future update.');
  };

  const logout = async () => {
    authLog('logout: clearing session and all cached data...');
    setUser(null);
    setToken(null);
    try {
      // Clear token and user cache
      await AsyncStorage.removeItem(TOKEN_KEY);
      await AsyncStorage.removeItem('@multimile_user');
      
      // Clear all user-specific stats & settings
      await AsyncStorage.removeItem('cached_dashboard_stats');
      await AsyncStorage.removeItem('tax_country');
      await AsyncStorage.removeItem('subscription_tier');
      
      // Clear offline tracking & trip data
      await AsyncStorage.removeItem('offline_trips');
      await AsyncStorage.removeItem('offline_api_queue');
      await AsyncStorage.removeItem('last_sync_time');
      await AsyncStorage.removeItem('network_status');
      await AsyncStorage.removeItem('pending_trips');
      await AsyncStorage.removeItem('current_auto_trip');
      await AsyncStorage.removeItem('auto_tracking_enabled');
      await AsyncStorage.removeItem('last_location');
      await AsyncStorage.removeItem('current_active_trip');
      await AsyncStorage.removeItem('auto_driving_detected_time');
      await AsyncStorage.removeItem('auto_last_movement_time');
      await AsyncStorage.removeItem('last_auto_trip_ended_time');
      await AsyncStorage.removeItem('bg_waypoints');
      await AsyncStorage.removeItem('auto_detect_enabled');
      await AsyncStorage.removeItem('force_offline_tracking');
      
      // Clear inspiration caches
      await AsyncStorage.removeItem('selected_category');
      await AsyncStorage.removeItem('custom_message');
      await AsyncStorage.removeItem('ai_message_day');
      await AsyncStorage.removeItem('ai_message_cache');
      await AsyncStorage.removeItem('app_opened_time');
    } catch (e) {
      authLog('logout: error clearing AsyncStorage keys', e);
    }
    authLog('logout: complete');
  };

  const refreshUser = async () => {
    if (!token) return;
    try {
      const userData = await API.getMe(token);
      setUser(userData);
    } catch (error: any) {
      authLog('refreshUser: ERROR', error.message);
      if (error.message.includes('401')) {
         await logout();
      }
    }
  };

  return (
    <AuthContext.Provider value={{ user, token, loading, login, register, loginWithGoogle, logout, refreshUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
