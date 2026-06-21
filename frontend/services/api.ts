import Constants from 'expo-constants';
import { Platform } from 'react-native';

// Get backend URL from environment, with fallbacks for Expo Go
const getBackendUrl = (): string => {
  // Try EXPO_PUBLIC_ env variable first (required for deployment)
  const envUrl = process.env.EXPO_PUBLIC_BACKEND_URL;
  if (envUrl && envUrl.length > 0) {
    console.log('[API] Using env URL:', envUrl);
    return envUrl;
  }
  
  // Try expo-constants extra
  const extra = Constants.expoConfig?.extra;
  if (extra?.backendUrl) {
    console.log('[API] Using extra URL:', extra.backendUrl);
    return extra.backendUrl;
  }
  
  // For development/preview, construct URL from hostname
  const hostname = process.env.EXPO_PACKAGER_HOSTNAME;
  if (hostname && hostname.length > 0) {
    console.log('[API] Using hostname URL:', hostname);
    return hostname;
  }
  
  // Last resort - throw error in production, use empty string for dev
  console.warn('[API] WARNING: No backend URL configured! Set EXPO_PUBLIC_BACKEND_URL');
  return '';
};

const BACKEND_URL = getBackendUrl();
console.log('[API] Final BACKEND_URL:', BACKEND_URL);

class APIService {
  private getHeaders(token?: string | null): Record<string, string> {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;
    return headers;
  }

  private async request(path: string, options: RequestInit & { timeout?: number } = {}, token?: string | null) {
    const url = `${BACKEND_URL}/api${path}`;
    console.log('[API] Request:', options.method || 'GET', url);
    
    // Create an explicit timeout to prevent fetch from hanging indefinitely
    const timeoutMs = options.timeout || 10000;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
    
    try {
      const res = await fetch(url, {
        ...options,
        signal: controller.signal as any, // Cast to any to bypass TS DOM types issue in React Native
        headers: { ...this.getHeaders(token), ...(options.headers as Record<string, string> || {}) },
      });
      
      clearTimeout(timeoutId);
      console.log('[API] Response status:', res.status);
      
      if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: 'Server error' }));
        console.log('[API] Error response:', err);
        throw new Error(err.detail || `Request failed with status ${res.status}`);
      }
      return res.json();
    } catch (error: any) {
      clearTimeout(timeoutId);
      console.log('[API] Fetch error:', error.message);
      if (error.name === 'AbortError' || error.message.includes('aborted')) {
         throw new Error('Network request failed - Timeout');
      }
      // Better error message for network issues
      if (error.message === 'Network request failed' || error.message.includes('fetch')) {
        throw new Error('Unable to connect to server. Please check your internet connection and try again.');
      }
      throw error;
    }
  }

  // Auth
  async authLogin(data: Record<string, unknown>) {
    return this.request('/auth/login', { method: 'POST', body: JSON.stringify(data) });
  }
  async authRegister(data: Record<string, unknown>) {
    return this.request('/auth/register', { method: 'POST', body: JSON.stringify(data) });
  }
  async validateInvitationToken(token: string) {
    return this.request(`/auth/validate-token?token=${token}`, {});
  }
  async getMe(token: string) {
    return this.request('/auth/me', {}, token);
  }
  async updateProfile(token: string, data: Record<string, string>) {
    return this.request('/auth/profile', { method: 'PUT', body: JSON.stringify(data) }, token);
  }
  // Trips
  async getTrips(token: string, classification?: string) {
    const q = classification && classification !== 'all' ? `?classification=${classification}` : '';
    return this.request(`/trips${q}`, {}, token);
  }
  async createTrip(token: string, data: Record<string, unknown>) {
    return this.request('/trips', { method: 'POST', body: JSON.stringify(data) }, token);
  }
  
  // Create a complete trip with all data at once (for syncing auto-tracked trips)
  async createTripDirect(token: string, data: Record<string, unknown>) {
    return this.request('/trips/direct', { method: 'POST', body: JSON.stringify(data) }, token);
  }
  async getTrip(token: string, tripId: string) {
    return this.request(`/trips/${tripId}`, {}, token);
  }
  async updateTrip(token: string, tripId: string, data: Record<string, unknown>) {
    return this.request(`/trips/${tripId}`, { method: 'PUT', body: JSON.stringify(data) }, token);
  }
  async endTrip(token: string, tripId: string, data: Record<string, unknown>) {
    return this.request(`/trips/${tripId}/end`, { method: 'POST', body: JSON.stringify(data) }, token);
  }
  async deleteTrip(token: string, tripId: string) {
    return this.request(`/trips/${tripId}`, { method: 'DELETE' }, token);
  }
  async getActiveTrip(token: string) {
    return this.request('/trips/active', {}, token);
  }

  // Expenses
  async getExpenses(token: string) {
    return this.request('/expenses', {}, token);
  }
  async getExpense(token: string, expenseId: string) {
    return this.request(`/expenses/${expenseId}`, {}, token);
  }
  async createExpense(token: string, data: Record<string, unknown>) {
    return this.request('/expenses', { method: 'POST', body: JSON.stringify(data) }, token);
  }
  async updateExpense(token: string, expenseId: string, data: Record<string, unknown>) {
    return this.request(`/expenses/${expenseId}`, { method: 'PUT', body: JSON.stringify(data) }, token);
  }
  async deleteExpense(token: string, expenseId: string) {
    return this.request(`/expenses/${expenseId}`, { method: 'DELETE' }, token);
  }
  async scanReceipt(token: string, receipt_base64: string) {
    return this.request('/expenses/scan', { method: 'POST', body: JSON.stringify({ receipt_base64 }), timeout: 35000 } as any, token);
  }

  // AI
  async aiChat(token: string, message: string, session_id?: string) {
    return this.request('/ai/chat', { method: 'POST', body: JSON.stringify({ message, session_id }) }, token);
  }
  async classifyTrip(token: string, trip_id: string) {
    return this.request('/ai/classify-trip', { method: 'POST', body: JSON.stringify({ trip_id }) }, token);
  }
  async getAIInsights(token: string) {
    return this.request('/ai/insights', {}, token);
  }
  async bulkClassifyTrips(token: string) {
    return this.request('/ai/classify-all', { method: 'POST' }, token);
  }

  // Dashboard
  async getDashboardStats(token: string) {
    return this.request('/dashboard/stats', {}, token);
  }

  // Reports
  async getReportSummary(token: string, year?: number, month?: number) {
    const params = new URLSearchParams();
    if (year) params.set('year', year.toString());
    if (month) params.set('month', month.toString());
    return this.request(`/reports/summary?${params}`, {}, token);
  }

  // Payments
  async createCheckout(token: string, plan: string, origin_url: string, invitee_email?: string) {
    return this.request('/payments/create-checkout', { method: 'POST', body: JSON.stringify({ plan, origin_url, invitee_email }) }, token);
  }
  async getPaymentStatus(token: string, sessionId: string) {
    return this.request(`/payments/status/${sessionId}`, {}, token);
  }
  async getSubscription(token: string) {
    return this.request('/payments/subscription', {}, token);
  }
  async downgradeSubscription(token: string) {
    return this.request('/payments/downgrade', { method: 'POST' }, token);
  }
  async getApiKey(token: string) {
    return this.request('/auth/api-key', {}, token);
  }
  async generateApiKey(token: string) {
    return this.request('/auth/api-key', { method: 'POST' }, token);
  }

  // Team Management
  async getTeamMembers(token: string) {
    return this.request('/team/members', {}, token);
  }
  async getTeamStats(token: string) {
    return this.request('/team/stats', {}, token);
  }
  async inviteTeamMember(token: string, data: { name: string, email: string, role: string, subscription_tier?: string }) {
    return this.request('/team/invite', { method: 'POST', body: JSON.stringify(data) }, token);
  }
  async removeTeamMember(token: string, memberId: string) {
    return this.request(`/team/members/${memberId}`, { method: 'DELETE' }, token);
  }
  async resendTeamInvitation(token: string, memberId: string) {
    return this.request(`/team/members/${memberId}/resend`, { method: 'POST' }, token);
  }

  // Seed
  async seedTrips(token: string) {
    return this.request('/seed/trips', { method: 'POST' }, token);
  }

  // AI Inspiration
  async getAIInspiration(token: string, category: string = 'potential') {
    return this.request(`/ai/inspiration?category=${category}`, {}, token);
  }
}

export const API = new APIService();
