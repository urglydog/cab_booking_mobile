/**
 * bookingService.ts — Centralized booking & pricing API calls
 *
 * Gateway routing rules (application.yaml):
 *   /booking/**  → booking-service  (RewritePath removes /booking prefix)
 *   /api/pricing/** → Pricing-Service
 *   /api/reviews/** → review-service
 *   /api/notifications/** → notification-service
 */
import api from './api';
import AsyncStorage from '@react-native-async-storage/async-storage';

export interface CreateBookingPayload {
  pickupLocation: string;
  dropoffLocation: string;
  pickupLat: number;
  pickupLng: number;
  dropoffLat: number;
  dropoffLng: number;
  vehicleType: 'CAR4' | 'CAR7' | 'BIKE';
  paymentMethod: 'CASH' | 'MOMO' | 'ZALOPAY' | 'VNPAY';
  estimatedFare?: number;
  customerNote?: string;
}

export const BookingService = {
  /**
   * POST /api/v1/bookings
   * Gateway rewrites → booking-service: POST /api/v1/bookings
   */
  async createBooking(payload: CreateBookingPayload) {
    const customerId = await AsyncStorage.getItem('user_id') ?? '';
    const idempotencyKey = `${Date.now()}_${Math.random().toString(36).substring(2, 10)}`;
    const response = await api.post('/api/v1/bookings', {
      customerId,
      idempotencyKey,
      ...payload,
    });
    // Response shape: { code, message, result: { id, status, ... } }
    return response.data?.result ?? response.data;
  },

  /**
   * GET /api/v1/bookings/:id
   */
  async getBookingById(bookingId: string) {
    const response = await api.get(`/api/v1/bookings/${bookingId}`);
    return response.data?.result ?? response.data;
  },

  /**
   * GET /api/v1/bookings/customer/:customerId
   */
  async getCustomerHistory(page = 0, size = 20) {
    const customerId = await AsyncStorage.getItem('user_id') ?? '';
    const response = await api.get(
      `/api/v1/bookings/customer/${customerId}?page=${page}&size=${size}`
    );
    return response.data?.result?.content ?? [];
  },

  /**
   * POST /api/v1/bookings/:id/cancel
   */
  async cancelBooking(bookingId: string, reason = 'Khách hàng yêu cầu hủy') {
    const response = await api.post(
      `/api/v1/bookings/${bookingId}/cancel`,
      null,
      { params: { reason } }
    );
    return response.data?.result ?? response.data;
  },

  /**
   * POST /api/pricing/estimate
   * vehicleType must be one of: ECONOMY, COMFORT, PREMIUM
   */
  async getPriceEstimate(params: {
    pickupLat: number; pickupLng: number;
    dropoffLat: number; dropoffLng: number;
    vehicleType?: 'ECONOMY' | 'COMFORT' | 'PREMIUM';
  }) {
    const response = await api.post('/api/pricing/estimate', {
      vehicleType: 'ECONOMY',
      ...params,
    });
    return response.data;
  },

  /**
   * POST /api/reviews
   */
  async submitReview(payload: {
    rideId: string;
    driverId: string;
    rating: number;
    comment: string;
  }) {
    const userId = await AsyncStorage.getItem('user_id') ?? '';
    const response = await api.post('/api/reviews', { userId, ...payload });
    return response.data;
  },

  /**
   * GET /api/notifications/user/:userId
   */
  async getNotifications(page = 0, size = 50) {
    const userId = await AsyncStorage.getItem('user_id') ?? '';
    const response = await api.get(`/api/notifications/user/${userId}?page=${page}&size=${size}`);
    return response.data?.content ?? response.data?.result?.content ?? [];
  },
};
