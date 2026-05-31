import AsyncStorage from '@react-native-async-storage/async-storage';

import api, { BASE_URL } from '@/services/api';

export const AUTH_STORAGE_KEYS = ['access_token', 'refresh_token', 'user_id', 'user_name', 'user_role', 'user_phone', 'user_email'];

export const clearAuthStorage = async () => {
  await AsyncStorage.multiRemove(AUTH_STORAGE_KEYS);
};

export const changePassword = async (payload: { currentPassword: string; newPassword: string }) => {
  const response = await api.post('/api/auth/password/change', payload, { baseURL: BASE_URL });
  return response.data.result;
};

export const requestForgotPasswordOtp = async (payload: { email: string }) => {
  const response = await api.post('/api/auth/password/forgot/request-otp', payload, { baseURL: BASE_URL });
  return response.data.result;
};

export const resetForgotPassword = async (payload: { email: string; otpCode: string; newPassword: string }) => {
  const response = await api.post('/api/auth/password/forgot/reset', payload, { baseURL: BASE_URL });
  return response.data.result;
};