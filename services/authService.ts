/**
 * authService.ts — Centralized auth API calls
 * All calls route through the API Gateway (BASE_URL)
 */
import api, { BASE_URL } from './api';
import AsyncStorage from '@react-native-async-storage/async-storage';

export interface LoginPayload {
  email: string;
  password: string;
  deviceId?: string;
  platform?: string;
}

export interface RegisterPayload {
  fullName: string;
  email: string;
  password: string;
  phoneNumber: string;
  role: 'USER' | 'DRIVER';
  avatarUrl?: string;
  deviceId?: string;
  platform?: string;
}

export const AuthService = {
  async login(payload: LoginPayload) {
    const response = await api.post('/api/auth/login', {
      ...payload,
      deviceId: payload.deviceId ?? 'mobile-android',
      platform: payload.platform ?? 'ANDROID',
    }, { baseURL: BASE_URL });
    return response.data.result;
  },

  async register(payload: RegisterPayload) {
    const response = await api.post('/api/auth/register', {
      ...payload,
      avatarUrl: payload.avatarUrl ?? 'https://example.com/avatar/default.png',
      deviceId: payload.deviceId ?? 'mobile-android',
      platform: payload.platform ?? 'ANDROID',
    }, { baseURL: BASE_URL });
    return response.data.result;
  },

  async refreshToken(refreshToken: string) {
    const response = await api.post('/api/auth/refresh', { refreshToken }, { baseURL: BASE_URL });
    return response.data.result;
  },

  async logout() {
    await AsyncStorage.clear();
  },

  async getStoredUserId(): Promise<string | null> {
    return AsyncStorage.getItem('user_id');
  },

  async getStoredToken(): Promise<string | null> {
    return AsyncStorage.getItem('access_token');
  },
};
