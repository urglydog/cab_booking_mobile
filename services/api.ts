import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';

// REPLACE THIS WITH YOUR COMPUTER'S IP ADDRESS
export const IP_ADDRESS = '192.168.1.179'; 
export const GATEWAY_URL = `http://${IP_ADDRESS}:8080`;
export const BOOKING_SERVICE_URL = `http://${IP_ADDRESS}:8084`; 
export const AUTH_SERVICE_URL = `http://${IP_ADDRESS}:8081`;

const api = axios.create({
  baseURL: GATEWAY_URL, // Default to Gateway
  timeout: 15000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Interceptor to add JWT token to every request
api.interceptors.request.use(
  async (config) => {
    const token = await AsyncStorage.getItem('access_token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

export default api;
