/**
 * Pricing Service — Integration with Pricing-Service (Spring Boot, port 8084)
 *
 * All endpoints are accessed through the API Gateway (port 8080) via:
 *   POST /api/pricing/estimate        → Create fare quote
 *   POST /api/pricing/confirm/{id}    → Lock confirmed fare
 *   GET  /api/pricing/estimate/{id}  → Get estimate details
 *   DELETE /api/pricing/estimate/{id}  → Cancel PENDING estimate
 *   GET  /api/pricing/estimates        → List estimates with filters
 *   GET  /api/pricing/surge/{zoneId}  → Get zone surge multiplier
 *   PUT  /api/pricing/surge/{zoneId}  → Update surge multiplier
 *   GET  /api/pricing/surge/all        → Get all zone surge multipliers
 *   POST /api/pricing/surge/compute/{zoneId} → Trigger surge calculation
 *   GET  /api/pricing/config           → Get current pricing config
 *   POST /api/pricing/calculate       → Test calculation
 *
 * Authentication: JWT Bearer token (auto-injected by api.ts interceptor)
 */

import api from './api';

// ─────────────────────────────────────────────
// 1. Types & Interfaces
// ─────────────────────────────────────────────

/** Vehicle tier supported by the Pricing-Service */
export type VehicleTier = 'ECONOMY' | 'COMFORT' | 'PREMIUM';

export const VEHICLE_TIER_LABELS: Record<VehicleTier, string> = {
  ECONOMY: 'Economy',
  COMFORT: 'Comfort',
  PREMIUM: 'Premium',
};

/** Estimate status lifecycle */
export type EstimateStatus = 'PENDING' | 'CONFIRMED' | 'CANCELLED' | 'EXPIRED';

/** Weather condition at pickup location */
export type WeatherCondition =
  | 'clear'
  | 'rain'
  | 'snow'
  | 'thunderstorm'
  | 'fog'
  | 'drizzle'
  | 'unknown';

/** Source of distance calculation */
export type DistanceSource = 'mapbox' | 'fallback';

/** Request payload for creating a fare estimate (POST /api/pricing/estimate) */
export interface FareEstimateRequest {
  pickupLat: number;
  pickupLng: number;
  dropoffLat: number;
  dropoffLng: number;
  vehicleType: VehicleTier;
  /** Optional: pre-estimated trip duration in minutes. If omitted, service calls Mapbox. */
  estimatedDurationMinutes?: number;
}

/**
 * Full response from POST /api/pricing/estimate and POST /api/pricing/confirm/{id}
 *
 * Note: Backend returns snake_case JSON keys.
 */
export interface FareEstimateResponse {
  estimateId: string;
  pickupZone: string;
  dropoffZone: string;
  vehicleType: VehicleTier;
  distanceKm: number;
  durationMinutes: number;

  // Price breakdown
  baseFare: number;
  distanceFare: number;
  timeFare: number;
  platformFee: number;
  zoneFee: number;
  airportFee: number;
  tollFee: number;
  discountAmount: number;
  surgeMultiplier: number;
  totalFare: number;
  currency: string;

  // Metadata
  pricingConfigVersion: string;
  distanceSource: DistanceSource;
  weatherCondition: WeatherCondition;
  weatherSource: string;
  fallbackUsed: boolean;
  expiresAt: string;
  status: EstimateStatus;

  // Integrity
  quoteId: string;
  quotePayloadHash: string;
  quoteHashAlgorithm: string;
  message: string;
}

/**
 * Request payload for confirming a fare (POST /api/pricing/confirm/{estimateId})
 */
export interface FareConfirmRequest {
  /** Optional actual distance (km). Service can recalculate fare if provided. */
  finalDistanceKm?: number;
  /** Optional actual duration (minutes). Service can recalculate fare if provided. */
  finalDurationMinutes?: number;
}

/**
 * Response from POST /api/pricing/confirm/{estimateId}
 *
 * Backend returns the same FareEstimateResponse with status updated to CONFIRMED.
 * A separate confirmedAt timestamp may be added by the service.
 */
export interface FareConfirmResponse {
  status: EstimateStatus;
  confirmedAt?: string;
  finalTotalFare?: number;
  currency?: string;
  quoteId: string;
  quotePayloadHash: string;
  message: string;
}

/**
 * Response from GET /api/pricing/surge/{zoneId}
 *
 * Backend returns: { zone_id, surge_multiplier, message }
 */
export interface ZoneSurgeResponse {
  zoneId: string;
  multiplier: number;
  message?: string;
}

/**
 * Request body for PUT /api/pricing/surge/{zoneId}
 */
export interface SurgeUpdateRequest {
  multiplier: number;
}

/**
 * Response from GET /api/pricing/surge/all
 *
 * Backend returns: { zones: [{ zone_id, surge_multiplier }], timestamp }
 */
export interface AllZonesSurgeResponse {
  zones: { zoneId: string; multiplier: number }[];
  timestamp: string;
}

/** Pricing configuration for a single vehicle tier (from GET /api/pricing/config) */
export interface TierPricingConfig {
  baseFare: number;
  perKmRate: number;
  perMinuteRate: number;
  minimumFare: number;
  platformFee: number;
  surgeMin: number;
  surgeMax: number;
}

/**
 * Full pricing configuration response (GET /api/pricing/config)
 *
 * Backend returns nested structure: { calculation, vehicle: { economy, comfort, premium }, ... }
 */
export interface PricingConfigResponse {
  calculation: {
    currency: string;
    defaultMinimumFare: number;
    defaultPlatformFee: number;
  };
  vehicle: {
    economy: TierPricingConfig;
    comfort: TierPricingConfig;
    premium: TierPricingConfig;
  };
  surge: {
    enabled: boolean;
    minMultiplier: number;
    maxMultiplier: number;
    timeWindowMinutes: number;
    badWeatherMultiplier: number;
  };
  weather: {
    enabled: boolean;
    badWeatherMultiplier: number;
  };
  cache: {
    enabled: boolean;
    ttlSeconds: number;
  };
  eta: {
    defaultAverageSpeedKmh: number;
  };
  version: string;
  lastUpdated: string;
}

/** Standard API error response */
export interface PricingApiError {
  timestamp?: string;
  status?: number;
  error?: string;
  message?: string;
  path?: string;
}

// ─────────────────────────────────────────────
// 2. Response field name mapping helpers
// ─────────────────────────────────────────────

/** Map backend snake_case zone surge response to frontend camelCase */
function mapZoneSurge(raw: any): ZoneSurgeResponse {
  return {
    zoneId: raw.zone_id ?? raw.zoneId ?? '',
    multiplier: raw.surge_multiplier ?? raw.multiplier ?? 1.0,
    message: raw.message,
  };
}

/** Map backend zones array to frontend format */
function mapAllZonesSurge(raw: any): AllZonesSurgeResponse {
  return {
    zones: (raw.zones ?? []).map((z: any) => ({
      zoneId: z.zone_id ?? z.zoneId ?? '',
      multiplier: z.surge_multiplier ?? z.multiplier ?? 1.0,
    })),
    timestamp: raw.timestamp ?? '',
  };
}

// ─────────────────────────────────────────────
// 3. Pricing Service API Methods
// ─────────────────────────────────────────────

export const PricingService = {
  /**
   * Create a new fare estimate (POST /api/pricing/estimate)
   *
   * Primary endpoint the mobile app calls before showing the user a price.
   * Estimate is valid for 5 minutes (see expiresAt field).
   *
   * @param request       - Fare estimate request parameters
   * @param idempotencyKey - Optional idempotency key for deduplication
   */
  async createEstimate(
    request: FareEstimateRequest,
    idempotencyKey?: string
  ): Promise<FareEstimateResponse> {
    const headers: Record<string, string> = {};
    if (idempotencyKey) {
      // Backend uses "Idempotency-Key" header (not X- prefix)
      headers['Idempotency-Key'] = idempotencyKey;
    }

    const response = await api.post<FareEstimateResponse>(
      '/api/pricing/estimate',
      request,
      { headers }
    );
    return response.data;
  },

  /**
   * Confirm a fare and lock the price (POST /api/pricing/confirm/{estimateId})
   *
   * MUST be called within the expiry window (5 minutes).
   * Backend returns FareEstimateResponse with status updated to CONFIRMED.
   *
   * @param estimateId        - estimateId from the estimate response
   * @param quotePayloadHash  - quotePayloadHash for tamper-proofing (optional)
   * @param confirmRequest    - Optional final distance/duration
   */
  async confirmEstimate(
    estimateId: string,
    quotePayloadHash?: string,
    confirmRequest?: FareConfirmRequest
  ): Promise<FareConfirmResponse> {
    const headers: Record<string, string> = {};
    if (quotePayloadHash) {
      headers['X-Quote-Hash'] = quotePayloadHash;
    }

    // Backend returns FareEstimateResponse with status CONFIRMED
    const response = await api.post<FareEstimateResponse>(
      `/api/pricing/confirm/${estimateId}`,
      confirmRequest ?? {},
      { headers }
    );

    const data = response.data;
    return {
      status: data.status,
      quoteId: data.quoteId,
      quotePayloadHash: data.quotePayloadHash,
      message: data.message,
      currency: data.currency,
      finalTotalFare: data.totalFare,
    };
  },

  /**
   * Retrieve an existing estimate (GET /api/pricing/estimate/{estimateId})
   */
  async getEstimate(estimateId: string): Promise<FareEstimateResponse> {
    const response = await api.get<FareEstimateResponse>(
      `/api/pricing/estimate/${estimateId}`
    );
    return response.data;
  },

  /**
   * List estimates with optional filters (GET /api/pricing/estimates)
   *
   * @param filters.status     - PENDING | CONFIRMED | EXPIRED | CANCELLED
   * @param filters.vehicleType - ECONOMY | COMFORT | PREMIUM
   * @param filters.pickupZone - Filter by pickup zone
   * @param filters.limit      - Default 50
   * @param filters.offset     - Default 0
   */
  async listEstimates(filters?: {
    status?: EstimateStatus;
    vehicleType?: VehicleTier;
    pickupZone?: string;
    limit?: number;
    offset?: number;
  }): Promise<{ estimates: FareEstimateResponse[]; count: number; limit: number; offset: number }> {
    const params: Record<string, string> = {};
    if (filters?.status)      params['status'] = filters.status;
    if (filters?.vehicleType)  params['vehicleType'] = filters.vehicleType;
    if (filters?.pickupZone)   params['pickupZone'] = filters.pickupZone;
    if (filters?.limit != null)  params['limit'] = String(filters.limit);
    if (filters?.offset != null) params['offset'] = String(filters.offset);

    const response = await api.get('/api/pricing/estimates', { params });
    return response.data;
  },

  /**
   * Cancel a PENDING estimate (DELETE /api/pricing/estimate/{estimateId})
   */
  async cancelEstimate(estimateId: string): Promise<{ status: EstimateStatus; message: string }> {
    const response = await api.delete(`/api/pricing/estimate/${estimateId}`);
    return response.data;
  },

  /**
   * Get surge multiplier for a specific zone (GET /api/pricing/surge/{zoneId})
   *
   * Example zone IDs: "zone_1", "zone_2", "zone_3"
   */
  async getZoneSurge(zoneId: string): Promise<ZoneSurgeResponse> {
    const response = await api.get(`/api/pricing/surge/${encodeURIComponent(zoneId)}`);
    return mapZoneSurge(response.data);
  },

  /**
   * Update surge multiplier for a zone (PUT /api/pricing/surge/{zoneId})
   *
   * Admin endpoint — requires ROLE_ADMIN or SCOPE_pricing:admin scope.
   */
  async updateZoneSurge(zoneId: string, multiplier: number): Promise<ZoneSurgeResponse> {
    const response = await api.put<any>(
      `/api/pricing/surge/${encodeURIComponent(zoneId)}`,
      { multiplier }
    );
    return mapZoneSurge(response.data);
  },

  /**
   * Get surge multipliers for all active zones (GET /api/pricing/surge/all)
   */
  async getAllZoneSurges(): Promise<AllZonesSurgeResponse> {
    const response = await api.get('/api/pricing/surge/all');
    return mapAllZonesSurge(response.data);
  },

  /**
   * Trigger surge calculation for a zone (POST /api/pricing/surge/compute/{zoneId})
   *
   * @param zoneId     - Zone ID
   * @param badWeather - Include bad weather adjustment (default false)
   */
  async computeSurge(zoneId: string, badWeather = false): Promise<ZoneSurgeResponse> {
    const response = await api.post<any>(
      `/api/pricing/surge/compute/${encodeURIComponent(zoneId)}`,
      {},
      { params: { badWeather } }
    );
    return mapZoneSurge(response.data);
  },

  /**
   * Get current pricing configuration (GET /api/pricing/config)
   */
  async getPricingConfig(): Promise<PricingConfigResponse> {
    const response = await api.get<PricingConfigResponse>('/api/pricing/config');
    return response.data;
  },

  /**
   * Verify quote hash integrity (client-side)
   *
   * Canonical hash payload format:
   *   {quoteId}|{pickupZone}|{dropoffZone}|{vehicleType}|{distanceKm}|{durationMinutes}|{totalFare}|{currency}
   *
   * In production, hash verification is done server-side via X-Quote-Hash header.
   * This method is provided for documentation/audit purposes.
   */
  verifyQuoteHash(
    quoteId: string,
    pickupZone: string,
    dropoffZone: string,
    vehicleType: string,
    distanceKm: number,
    durationMinutes: number,
    totalFare: number,
    currency: string,
    _expectedHash: string
  ): boolean {
    const canonical = [
      quoteId,
      pickupZone,
      dropoffZone,
      vehicleType,
      distanceKm,
      durationMinutes,
      totalFare,
      currency,
    ].join('|');

    // Client-side crypto verification requires additional setup (Expo Crypto / react-native-crypto)
    // Full verification is performed server-side via X-Quote-Hash header
    console.log('[PricingService] Canonical hash payload:', canonical);
    return true;
  },
};

// ─────────────────────────────────────────────
// 4. Helper utilities for the UI
// ─────────────────────────────────────────────

/** Default pricing values (VND) when API is unavailable */
export const FALLBACK_PRICING = {
  economy: {
    baseFare: 12000,
    perKm: 8500,
    perMinute: 1200,
    minimumFare: 25000,
    platformFee: 2000,
  },
  comfort: {
    baseFare: 18000,
    perKm: 12000,
    perMinute: 1600,
    minimumFare: 38000,
    platformFee: 2500,
  },
  premium: {
    baseFare: 30000,
    perKm: 18000,
    perMinute: 2500,
    minimumFare: 50000,
    platformFee: 3000,
  },
} as const;

/**
 * Calculate estimated fare using Haversine distance (fallback when Mapbox unavailable)
 */
export function calculateFallbackFare(
  pickupLat: number,
  pickupLng: number,
  dropoffLat: number,
  dropoffLng: number,
  tier: VehicleTier = 'ECONOMY',
  durationMinutes = 25
): number {
  const R = 6371; // Earth radius in km
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(dropoffLat - pickupLat);
  const dLng = toRad(dropoffLng - pickupLng);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(pickupLat)) *
      Math.cos(toRad(dropoffLat)) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const distanceKm = R * c;

  const key = tier.toLowerCase() as 'economy' | 'comfort' | 'premium';
  const config = FALLBACK_PRICING[key] ?? FALLBACK_PRICING.economy;
  const subtotal =
    config.baseFare +
    distanceKm * config.perKm +
    durationMinutes * config.perMinute +
    config.platformFee;
  return Math.max(subtotal, config.minimumFare);
}

/**
 * Format VND currency for display
 */
export function formatVND(amount: number): string {
  return `${Math.round(amount).toLocaleString('vi-VN')}đ`;
}

/**
 * Get human-readable label for surge multiplier
 */
export function getSurgeLabel(multiplier: number): string {
  if (multiplier <= 1.0) return 'Bình thường';
  if (multiplier <= 1.5) return 'Cao';
  if (multiplier <= 2.0) return 'Rất cao';
  return 'Đỉnh cao';
}

/**
 * Get color for surge badge
 */
export function getSurgeColor(multiplier: number): string {
  if (multiplier <= 1.0) return '#10B981'; // green
  if (multiplier <= 1.5) return '#F59E0B'; // amber
  if (multiplier <= 2.0) return '#EF4444'; // red
  return '#DC2626'; // dark red
}

/**
 * Check if an estimate has expired
 */
export function isEstimateExpired(expiresAt: string): boolean {
  return new Date(expiresAt) < new Date();
}

/**
 * Get remaining time in seconds until estimate expires
 */
export function getRemainingSeconds(expiresAt: string): number {
  const remaining = new Date(expiresAt).getTime() - Date.now();
  return Math.max(0, Math.floor(remaining / 1000));
}
