/**
 * Shared types for booking and pricing services
 * Ensures consistency between frontend vehicle types and backend vehicle tiers
 */

import { VehicleTier } from './pricingService';

export type { VehicleTier };

/** Payload for creating a booking — vehicleType uses backend VehicleTier */
export interface CreateBookingPayload {
  pickupLocation: string;
  dropoffLocation: string;
  pickupLat: number;
  pickupLng: number;
  dropoffLat: number;
  dropoffLng: number;
  vehicleType: VehicleTier;
  paymentMethod: 'CASH' | 'MOMO' | 'ZALOPAY' | 'VNPAY';
  estimatedFare?: number;
  customerNote?: string;
  /** From Pricing-Service estimate response */
  estimateId?: string;
  /** From Pricing-Service estimate response */
  quotePayloadHash?: string;
}
