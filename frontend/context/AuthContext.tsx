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
      if (storedToken) {
        authLog('loadStoredSession: Found token, verifying...');
        setToken(storedToken);
        // Try validating with the backend
        const userData = await API.getMe(storedToken);
        setUser(userData);
        authLog('loadStoredSession: User verified successfully.');
      } else {
        authLog('loadStoredSession: No token found.');
      }
    } catch (error: any) {
      authLog('loadStoredSession: ERROR restoring session', error.message);
      // Clean up invalid session
      await AsyncStorage.removeItem(TOKEN_KEY);
      setToken(null);
      setUser(null);
    } finally {
      setLoading(false);
    }
  };

  const persistSession = async (jwtToken: string, userData: User) => {
    setToken(jwtToken);
    setUser(userData);
    try {
      await AsyncStorage.setItem(TOKEN_KEY, jwtToken);
    } catch (e) {
      authLog('persistSession: failed to save token', e);
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
    authLog('logout: clearing session...');
    setUser(null);
    setToken(null);
    await AsyncStorage.removeItem(TOKEN_KEY);
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
