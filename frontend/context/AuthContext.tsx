import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
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
}

interface AuthContextType {
  user: User | null;
  token: string | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, name: string) => Promise<void>;
  loginWithGoogle: (sessionId: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({} as AuthContextType);

// Helper to log with platform info
const authLog = (message: string, data?: any) => {
  const prefix = `[Auth][${Platform.OS}]`;
  if (data !== undefined) {
    console.log(prefix, message, typeof data === 'object' ? JSON.stringify(data) : data);
  } else {
    console.log(prefix, message);
  }
};

// Safe AsyncStorage wrapper with detailed error logging
const safeStorage = {
  async getItem(key: string): Promise<string | null> {
    try {
      const value = await AsyncStorage.getItem(key);
      authLog(`Storage GET '${key}':`, value ? 'found' : 'null');
      return value;
    } catch (error: any) {
      authLog(`Storage GET ERROR '${key}':`, error.message);
      return null;
    }
  },
  async setItem(key: string, value: string): Promise<boolean> {
    try {
      await AsyncStorage.setItem(key, value);
      authLog(`Storage SET '${key}': success`);
      return true;
    } catch (error: any) {
      authLog(`Storage SET ERROR '${key}':`, error.message);
      return false;
    }
  },
  async removeItem(key: string): Promise<boolean> {
    try {
      await AsyncStorage.removeItem(key);
      authLog(`Storage REMOVE '${key}': success`);
      return true;
    } catch (error: any) {
      authLog(`Storage REMOVE ERROR '${key}':`, error.message);
      return false;
    }
  }
};

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const checkAuth = useCallback(async () => {
    authLog('checkAuth: starting...');
    try {
      const storedToken = await safeStorage.getItem('auth_token');
      if (storedToken) {
        authLog('checkAuth: token found, fetching user...');
        const userData = await API.getMe(storedToken);
        authLog('checkAuth: user fetched', userData?.email);
        setToken(storedToken);
        setUser(userData);
      } else {
        authLog('checkAuth: no stored token');
      }
    } catch (error: any) {
      authLog('checkAuth: ERROR', error.message);
      await safeStorage.removeItem('auth_token');
    } finally {
      authLog('checkAuth: complete, setting loading=false');
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    checkAuth();
  }, [checkAuth]);

  const login = async (email: string, password: string) => {
    authLog('login: starting...', email);
    try {
      const res = await API.login(email, password);
      authLog('login: API success, saving token...');
      
      const saved = await safeStorage.setItem('auth_token', res.token);
      if (!saved) {
        throw new Error('Failed to save authentication token');
      }
      
      setToken(res.token);
      setUser(res.user);
      authLog('login: complete, user set', res.user?.email);
    } catch (error: any) {
      authLog('login: ERROR', error.message);
      throw error; // Re-throw to show user the error
    }
  };

  const register = async (email: string, password: string, name: string) => {
    authLog('register: starting...', email);
    try {
      const res = await API.register(email, password, name);
      authLog('register: API success, saving token...');
      
      const saved = await safeStorage.setItem('auth_token', res.token);
      if (!saved) {
        throw new Error('Failed to save authentication token');
      }
      
      setToken(res.token);
      setUser(res.user);
      authLog('register: complete, user set', res.user?.email);
    } catch (error: any) {
      authLog('register: ERROR', error.message);
      throw error; // Re-throw to show user the error
    }
  };

  const loginWithGoogle = async (sessionId: string) => {
    authLog('loginWithGoogle: starting...');
    try {
      const res = await API.googleAuth(sessionId);
      authLog('loginWithGoogle: API success, saving token...');
      
      const saved = await safeStorage.setItem('auth_token', res.token);
      if (!saved) {
        throw new Error('Failed to save authentication token');
      }
      
      setToken(res.token);
      setUser(res.user);
      authLog('loginWithGoogle: complete');
    } catch (error: any) {
      authLog('loginWithGoogle: ERROR', error.message);
      throw error;
    }
  };

  const logout = async () => {
    authLog('logout: starting...');
    try {
      await safeStorage.removeItem('auth_token');
      setToken(null);
      setUser(null);
      authLog('logout: complete');
    } catch (error: any) {
      authLog('logout: ERROR', error.message);
      // Still clear state even if storage fails
      setToken(null);
      setUser(null);
    }
  };

  const refreshUser = async () => {
    if (!token) {
      authLog('refreshUser: no token, skipping');
      return;
    }
    authLog('refreshUser: starting...');
    try {
      const userData = await API.getMe(token);
      setUser(userData);
      authLog('refreshUser: complete', userData?.email);
    } catch (error: any) {
      authLog('refreshUser: ERROR', error.message);
    }
  };

  return (
    <AuthContext.Provider value={{ user, token, loading, login, register, loginWithGoogle, logout, refreshUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
