/**
 * Driver Service — Phase 4: Real Driver Info Display
 *
 * Backend contract derived from driver-service source:
 *   - DriverProfileController: /api/drivers/me/profile (JWT → current driver only)
 *   - AdminDriverController:   /api/admin/drivers/* (ADMIN role only)
 *   - InternalDriverStatusController: /internal/drivers/* (service-to-service)
 *
 * FINDING: No passenger-accessible endpoint exists to fetch a driver's
 * profile by driverId. The only available endpoint (/api/drivers/me/profile)
 * returns the CURRENT USER's own driver profile, which is not useful for
 * a passenger viewing ride details.
 *
 * Until the backend adds a public GET /api/drivers/{driverId} endpoint,
 * the frontend uses safe fallbacks derived from booking response data
 * (assignedDriverId only — no name, rating, vehicle, or plate).
 *
 * This file documents the backend response shape for future integration.
 */

import api from './api';

/**
 * Matches backend DriverProfileResponse.java exactly.
 * Source: driver-service/.../dto/response/DriverProfileResponse.java
 *
 * Available fields from backend when the endpoint becomes accessible:
 */
export interface DriverProfileResponse {
  /** UUID — primary key */
  id: string;
  /** External user ID (UUID from auth-service) */
  externalUserId: string;
  fullName: string;
  email: string;
  phoneNumber: string;
  avatarUrl: string | null;
  licenseNumber: string | null;
  vehicleType: string | null;
  vehiclePlate: string | null;
  vehicleModel: string | null;
  vehicleColor: string | null;
  serviceArea: string | null;
  availabilityStatus: string;
  verificationStatus: string;
  accountStatus: string;
  currentLatitude: number | null;
  currentLongitude: number | null;
  lastOnlineAt: string | null;
  approvedAt: string | null;
  totalCompletedRides: number;
  averageRating: number;
  totalEarnings: number;
  createdAt: string;
  updatedAt: string;
}

/**
 * Lightweight driver display info derived from whatever data is available.
 * Used by UI components to render driver info with safe fallbacks.
 */
export interface DriverDisplayInfo {
  /** True if a driver is assigned to the ride */
  hasDriver: boolean;
  /** Driver's full name, or null if unavailable */
  fullName: string | null;
  /** Driver's external user ID (from assignedDriverId in booking) */
  driverId: string | null;
  /** Formatted short ID for display: "TX-{first8chars}" */
  shortId: string | null;
  /** Average rating (1-5), or null if unavailable */
  averageRating: number | null;
  /** Total completed rides, or null if unavailable */
  totalCompletedRides: number | null;
  /** Vehicle plate number, or null if unavailable */
  vehiclePlate: string | null;
  /** Vehicle model, or null if unavailable */
  vehicleModel: string | null;
  /** Vehicle color, or null if unavailable */
  vehicleColor: string | null;
  /** Phone number, or null if unavailable */
  phoneNumber: string | null;
  /** Avatar URL, or null if unavailable */
  avatarUrl: string | null;
}

/**
 * Build a DriverDisplayInfo from booking data with safe fallbacks.
 *
 * Since no passenger-accessible driver profile endpoint exists,
 * this function creates display info from only what the booking
 * response provides (assignedDriverId).
 *
 * When the backend adds a public driver profile endpoint, this
 * function should be updated to enrich the display info.
 *
 * @param assignedDriverId - The driver's external user ID from the booking response
 * @param driverProfile - Optional: driver profile data if fetched from a future endpoint
 * @returns DriverDisplayInfo with safe fallbacks
 */
export function buildDriverDisplayInfo(
  assignedDriverId?: string | null,
  driverProfile?: DriverProfileResponse | null,
): DriverDisplayInfo {
  const hasDriver = !!assignedDriverId;

  // If driver profile data is available (future endpoint), use it
  if (driverProfile) {
    return {
      hasDriver: true,
      fullName: driverProfile.fullName || null,
      driverId: driverProfile.externalUserId || assignedDriverId || null,
      shortId: driverProfile.externalUserId
        ? `TX-${driverProfile.externalUserId.substring(0, 8).toUpperCase()}`
        : assignedDriverId
          ? `TX-${assignedDriverId.substring(0, 8).toUpperCase()}`
          : null,
      averageRating: driverProfile.averageRating ?? null,
      totalCompletedRides: driverProfile.totalCompletedRides ?? null,
      vehiclePlate: driverProfile.vehiclePlate || null,
      vehicleModel: driverProfile.vehicleModel || null,
      vehicleColor: driverProfile.vehicleColor || null,
      phoneNumber: driverProfile.phoneNumber || null,
      avatarUrl: driverProfile.avatarUrl || null,
    };
  }

  // Fallback: only have assignedDriverId from booking response
  return {
    hasDriver,
    fullName: null,
    driverId: assignedDriverId || null,
    shortId: assignedDriverId
      ? `TX-${assignedDriverId.substring(0, 8).toUpperCase()}`
      : null,
    averageRating: null,
    totalCompletedRides: null,
    vehiclePlate: null,
    vehicleModel: null,
    vehicleColor: null,
    phoneNumber: null,
    avatarUrl: null,
  };
}

/**
 * Attempt to fetch driver profile by external user ID.
 *
 * CURRENTLY NOT IMPLEMENTED — no passenger-accessible endpoint exists.
 * Returns null. When the backend adds GET /api/drivers/{driverId},
 * uncomment the implementation below.
 *
 * @param driverId - The driver's external user ID
 * @returns DriverProfileResponse or null
 */
export async function fetchDriverProfile(
  driverId: string,
): Promise<DriverProfileResponse | null> {
  try {
    // TODO: Uncomment when backend adds GET /api/drivers/{driverId}
    // const response = await api.get(`/api/drivers/${driverId}`);
    // if (response.data?.result) {
    //   return response.data.result as DriverProfileResponse;
    // }
    return null;
  } catch {
    // Graceful degradation — return null on any error
    return null;
  }
}
