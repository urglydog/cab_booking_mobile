import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Expo SDK 54+: chỉ cần prefix EXPO_PUBLIC_ trong .env là tự động available qua process.env
const IP_ADDRESS = process.env.EXPO_PUBLIC_IP_ADDRESS ?? 'localhost';
const GATEWAY_PORT = process.env.EXPO_PUBLIC_GATEWAY_PORT ?? '8080';
const SOCKET_PORT = process.env.EXPO_PUBLIC_SOCKET_PORT ?? '9093';

// Kiểm tra xem IP_ADDRESS có phải là domain tunnel công khai hay không (ví dụ: ngrok, localtunnel, cloudflare)
const isTunnel = IP_ADDRESS.startsWith('http') || (IP_ADDRESS.includes('.') && !/^\d+(\.\d+){3}$/.test(IP_ADDRESS));

export const BASE_URL = isTunnel
  ? (IP_ADDRESS.startsWith('http') ? IP_ADDRESS : `https://${IP_ADDRESS}`)
  : `http://${IP_ADDRESS}:${GATEWAY_PORT}`;

export const SOCKET_URL = isTunnel
  ? (IP_ADDRESS.startsWith('https')
      ? IP_ADDRESS.replace('https', 'wss')
      : IP_ADDRESS.startsWith('http')
        ? IP_ADDRESS.replace('http', 'ws')
        : `wss://${IP_ADDRESS}`)
  : `http://${IP_ADDRESS}:${SOCKET_PORT}`;

const rideSocketOverride = process.env.EXPO_PUBLIC_RIDE_SOCKET_URL?.trim();
const normalizedRideSocketOverride = rideSocketOverride
  ? (
      rideSocketOverride.startsWith('http://')
      || rideSocketOverride.startsWith('https://')
      || rideSocketOverride.startsWith('ws://')
      || rideSocketOverride.startsWith('wss://')
    )
      ? rideSocketOverride
      : `https://${rideSocketOverride}`
  : '';

export const RIDE_SOCKET_URL = normalizedRideSocketOverride
  ? normalizedRideSocketOverride.replace(/^ws:/, 'http:').replace(/^wss:/, 'https:')
  : BASE_URL;
export const RIDE_SOCKET_PATH = normalizedRideSocketOverride ? '/socket.io' : '/ride/socket.io';

const api = axios.create({
  baseURL: BASE_URL,
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Interceptor to add JWT token to every request
api.interceptors.request.use(
  async (config) => {
    const token = await AsyncStorage.getItem('access_token');
    const isPublicEndpoint = config.url?.includes('/auth/');

    if (token && !isPublicEndpoint) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

export default api;
