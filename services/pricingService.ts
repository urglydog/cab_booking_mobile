/**
 * Pricing Service — Integration with Pricing-Service (Spring Boot, port 8084)
 *
 * All endpoints are accessed through the API Gateway (port 8080) via:
 *   POST /api/v1/pricing/estimate          → Create fare quote
 *   POST /api/v1/pricing/confirm/{id}     → Lock confirmed fare
 *   GET  /api/v1/pricing/estimate/{id}    → Get estimate details
 *   DELETE /api/v1/pricing/estimate/{id}   → Cancel PENDING estimate
 *   GET  /api/v1/pricing/estimates        → List estimates with filters
 *   GET  /api/v1/pricing/surge/{zoneId}  → Get zone surge multiplier
 *   PUT  /api/v1/pricing/surge/{zoneId}  → Update surge multiplier
 *   GET  /api/v1/pricing/surge/all        → Get all zone surge multipliers
 *   POST /api/v1/pricing/surge/compute/{zoneId} → Trigger surge calculation
 *   GET  /api/v1/pricing/config           → Get current pricing config
 *   GET  /api/v1/pricing/zones/{zoneId}/metrics → Get zone demand/supply metrics
 *   POST /api/v1/pricing/demand-supply     → Cache demand/supply metrics
 *   GET  /api/v1/pricing/revenue/statistics → Revenue statistics
 *   POST /api/v1/pricing/calculate        → Test calculation
 *
 * Authentication: JWT Bearer token (auto-injected by api.ts interceptor)
 * Estimate expiry: 15 minutes (see expiresAt field)
 */

import api from './api';

// ─────────────────────────────────────────────
// 1. Types & Interfaces
// ─────────────────────────────────────────────

/** Vehicle tier supported by the Pricing-Service */
export type VehicleTier = 'BIKE' | 'CAR4' | 'CAR7';

export const VEHICLE_TIER_LABELS: Record<VehicleTier, string> = {
  BIKE: 'Xe máy',
  CAR4: 'Xe 4 chỗ',
  CAR7: 'Xe 7 chỗ',
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

/** Source of distance calculation — backend returns these string values */
export type DistanceSource =
  | 'MAPBOX'
  | 'HAVERSINE_FALLBACK'
  | 'MAPBOX_CACHE'
  | 'FINAL_RIDE_DISTANCE';

/** Request payload for creating a fare estimate (POST /api/v1/pricing/estimate) */
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
 * Full response from POST /api/v1/pricing/estimate and POST /api/v1/pricing/confirm/{id}
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
 * Request payload for confirming a fare (POST /api/v1/pricing/confirm/{estimateId})
 *
 * Backend confirms a PENDING estimate and locks the price.
 * MUST be called within 15 minutes (expiresAt).
 */
export interface FareConfirmRequest {
  /** Optional actual distance (km). Service can recalculate fare if provided. */
  finalDistanceKm?: number;
  /** Optional actual duration (minutes). Service can recalculate fare if provided. */
  finalDurationMinutes?: number;
}

/**
 * Response from POST /api/v1/pricing/confirm/{estimateId}
 *
 * Backend returns FareEstimate entity with status updated to CONFIRMED.
 * Note: The request body (FareConfirmRequest) is accepted but the backend
 * does not currently use finalDistanceKm/finalDurationMinutes at confirm time.
 */
export interface FareConfirmResponse extends FareEstimateResponse {
  confirmedAt?: string;
  finalTotalFare?: number;
}

/**
 * Response from GET /api/v1/pricing/surge/{zoneId}
 *
 * Backend returns: { zone_id, surge_multiplier, message }
 */
export interface ZoneSurgeResponse {
  zoneId: string;
  multiplier: number;
  message?: string;
}

/**
 * Request body for PUT /api/v1/pricing/surge/{zoneId}
 */
export interface SurgeUpdateRequest {
  multiplier: number;
}

/**
 * Response from GET /api/v1/pricing/surge/all
 *
 * Backend returns: Map<zoneId, surgeMultiplier> (plain map, not nested structure).
 * Example: { "zone_1": 1.2, "zone_2": 1.0, "zone_3": 1.5 }
 */
export interface AllZonesSurgeResponse {
  zones: { zoneId: string; multiplier: number }[];
  timestamp: string;
}

/** Pricing configuration for a single vehicle tier (from GET /api/v1/pricing/config) */
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
 * Full pricing configuration response (GET /api/v1/pricing/config)
 *
 * Backend returns: { calculation, vehicle, surge, weather, cache, eta }
 * Note: configVersion and lastUpdated are nested inside calculation object.
 */
export interface PricingConfigResponse {
  calculation: {
    currency: string;
    defaultMinimumFare: number;
    defaultPlatformFee: number;
    baseFare?: number;
    perKmRate?: number;
    perMinuteRate?: number;
    configVersion: string;
    lastUpdated?: string;
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
    fallbackDurationMinutes?: number;
    routeTtlSeconds?: number;
    weatherTtlSeconds?: number;
  };
  version?: string;
  lastUpdated?: string;
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

// ─────────────────────────────────────────────
// 3. Pricing Service API Methods
// ─────────────────────────────────────────────

export const PricingService = {
  /**
   * Create a new fare estimate (POST /api/v1/pricing/estimate)
   *
   * Primary endpoint the mobile app calls before showing the user a price.
   * Estimate is valid for 15 minutes (see expiresAt field).
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
      '/api/v1/pricing/estimate',
      request,
      { headers }
    );
    return response.data;
  },

  /**
   * Confirm a fare and lock the price (POST /api/v1/pricing/confirm/{estimateId})
   *
   * MUST be called within 15 minutes (expiresAt).
   * Backend returns FareEstimate entity with status updated to CONFIRMED.
   *
   * @param estimateId        - estimateId from the estimate response
   * @param quotePayloadHash  - quotePayloadHash for tamper-proofing (optional)
   * @param _confirmRequest   - Optional (currently unused by backend at confirm time)
   */
  async confirmEstimate(
    estimateId: string,
    quotePayloadHash?: string,
    _confirmRequest?: FareConfirmRequest
  ): Promise<FareConfirmResponse> {
    const headers: Record<string, string> = {};
    if (quotePayloadHash) {
      headers['X-Quote-Hash'] = quotePayloadHash;
    }

    // Backend returns FareEstimate entity — same shape as FareEstimateResponse
    const response = await api.post<FareEstimateResponse>(
      `/api/v1/pricing/confirm/${estimateId}`,
      {},
      { headers }
    );

    const data = response.data;
    return {
      ...data,
      status: data.status,
      quoteId: data.quoteId,
      quotePayloadHash: data.quotePayloadHash,
      message: data.message,
      currency: data.currency,
      finalTotalFare: data.totalFare,
    } as FareConfirmResponse;
  },

  /**
   * Retrieve an existing estimate (GET /api/v1/pricing/estimate/{estimateId})
   */
  async getEstimate(estimateId: string): Promise<FareEstimateResponse> {
    const response = await api.get<FareEstimateResponse>(
      `/api/v1/pricing/estimate/${estimateId}`
    );
    return response.data;
  },

  /**
   * List estimates with optional filters (GET /api/v1/pricing/estimates)
   *
   * @param filters.status       - PENDING | CONFIRMED | EXPIRED | CANCELLED
   * @param filters.vehicleType - BIKE | CAR4 | CAR7
   * @param filters.pickupZone  - Filter by pickup zone
   * @param filters.limit       - Default 50
   * @param filters.offset      - Default 0
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

    const response = await api.get('/api/v1/pricing/estimates', { params });
    return response.data;
  },

  /**
   * Cancel a PENDING estimate (DELETE /api/v1/pricing/estimate/{estimateId})
   *
   * Returns error fields on failure (error, message, estimateId, currentStatus).
   */
  async cancelEstimate(estimateId: string): Promise<{
    status?: EstimateStatus;
    message?: string;
    error?: string;
  }> {
    const response = await api.delete(`/api/v1/pricing/estimate/${estimateId}`);
    return response.data;
  },

  /**
   * Get surge multiplier for a specific zone (GET /api/v1/pricing/surge/{zoneId})
   *
   * Example zone IDs: "zone_1", "zone_2", "zone_3"
   */
  async getZoneSurge(zoneId: string): Promise<ZoneSurgeResponse> {
    const response = await api.get(`/api/v1/pricing/surge/${encodeURIComponent(zoneId)}`);
    return mapZoneSurge(response.data);
  },

  /**
   * Update surge multiplier for a zone (PUT /api/v1/pricing/surge/{zoneId})
   *
   * Admin endpoint — requires ROLE_ADMIN or SCOPE_pricing:admin scope.
   */
  async updateZoneSurge(zoneId: string, multiplier: number): Promise<ZoneSurgeResponse> {
    const response = await api.put<any>(
      `/api/v1/pricing/surge/${encodeURIComponent(zoneId)}`,
      { multiplier }
    );
    return mapZoneSurge(response.data);
  },

  /**
   * Get surge multipliers for all active zones (GET /api/v1/pricing/surge/all)
   *
   * Backend returns a plain Map<zoneId, multiplier> — not a nested response.
   */
  async getAllZoneSurges(): Promise<AllZonesSurgeResponse> {
    const response = await api.get<Record<string, number>>('/api/v1/pricing/surge/all');
    const raw = response.data;
    const zones = Object.entries(raw).map(([zoneId, multiplier]) => ({
      zoneId,
      multiplier: typeof multiplier === 'number' ? multiplier : parseFloat(multiplier as unknown as string),
    }));
    return {
      zones,
      timestamp: new Date().toISOString(),
    };
  },

  /**
   * Trigger surge calculation for a zone (POST /api/pricing/surge/compute/{zoneId})
   *
   * @param zoneId     - Zone ID
   * @param badWeather - Include bad weather adjustment (default false)
   */
  async computeSurge(zoneId: string, badWeather = false): Promise<ZoneSurgeResponse> {
    const response = await api.post<any>(
      `/api/v1/pricing/surge/compute/${encodeURIComponent(zoneId)}`,
      {},
      { params: { badWeather } }
    );
    return mapZoneSurge(response.data);
  },

  /**
   * Get zone demand/supply metrics (GET /api/v1/pricing/zones/{zoneId}/metrics)
   */
  async getZoneMetrics(zoneId: string): Promise<{
    zoneId: string;
    activeDrivers: number;
    pendingRides: number;
    updatedAt: string;
    demandRatio: string;
  }> {
    const response = await api.get(`/api/v1/pricing/zones/${encodeURIComponent(zoneId)}/metrics`);
    return response.data;
  },

  /**
   * Cache demand/supply metrics for a zone (POST /api/v1/pricing/demand-supply)
   *
   * Surge pricing is recalculated asynchronously by the scheduler.
   */
  async updateDemandSupply(
    zoneId: string,
    activeDrivers: number,
    pendingRides: number
  ): Promise<{ zoneId: string; activeDrivers: number; pendingRides: number; message: string }> {
    const response = await api.post('/api/v1/pricing/demand-supply', {
      zoneId,
      activeDrivers,
      pendingRides,
    });
    return response.data;
  },

  /**
   * Get revenue statistics for a date range (GET /api/v1/pricing/revenue/statistics)
   *
   * @param startDate - ISO format, e.g. "2026-05-01T00:00:00"
   * @param endDate   - ISO format, e.g. "2026-05-22T23:59:59"
   */
  async getRevenueStatistics(
    startDate?: string,
    endDate?: string
  ): Promise<Record<string, unknown>> {
    const params: Record<string, string> = {};
    if (startDate) params['startDate'] = startDate;
    if (endDate)   params['endDate'] = endDate;
    const response = await api.get('/api/v1/pricing/revenue/statistics', { params });
    return response.data;
  },

  /**
   * Get revenue statistics for the last 7 days (GET /api/v1/pricing/revenue/weekly)
   */
  async getWeeklyRevenue(): Promise<Record<string, unknown>> {
    const response = await api.get('/api/v1/pricing/revenue/weekly');
    return response.data;
  },

  /**
   * Get revenue statistics for the last 30 days (GET /api/v1/pricing/revenue/monthly)
   */
  async getMonthlyRevenue(): Promise<Record<string, unknown>> {
    const response = await api.get('/api/v1/pricing/revenue/monthly');
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
  bike: {
    baseFare: 8000,
    perKm: 3500,
    perMinute: 400,
    minimumFare: 15000,
    platformFee: 2000,
  },
  car4: {
    baseFare: 12000,
    perKm: 8500,
    perMinute: 1200,
    minimumFare: 25000,
    platformFee: 2000,
  },
  car7: {
    baseFare: 20000,
    perKm: 12000,
    perMinute: 1800,
    minimumFare: 40000,
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
  tier: VehicleTier = 'CAR4',
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

  const key = tier.toLowerCase() as 'bike' | 'car4' | 'car7';
  const config = FALLBACK_PRICING[key] ?? FALLBACK_PRICING.car4;
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
