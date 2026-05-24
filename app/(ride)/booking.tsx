import React, { useState, useCallback, useEffect, useRef } from 'react';
import {
  StyleSheet, ScrollView, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import api from '@/services/api';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter } from 'expo-router';
import {
  PricingService,
  FareEstimateResponse,
  VehicleTier,
  calculateFallbackFare,
  getRemainingSeconds,
} from '@/services/pricingService';
import { PaymentInitResponse, PaymentService } from '@/services/paymentService';
import VehicleTierSelection from './components/VehicleTierSelection';
import BookingHeader from './components/BookingHeader';
import MapPreview from './components/MapPreview';
import RouteInfoBar from './components/RouteInfoBar';
import AddressForm from './components/AddressForm';
import AddressSuggestions from './components/AddressSuggestions';
import PaymentMethodSelector from './components/PaymentMethodSelector';
import PromoCodeSelector from './components/PromoCodeSelector';
import FareSummary from './components/FareSummary';
import BookButton from './components/BookButton';

const PROMO_CODES = [
  { id: 'promo-1', code: 'CABNEW', title: 'Mừng bạn mới', discount: 30000, description: 'Giảm trực tiếp 30k' },
  { id: 'promo-2', code: 'CABSUMMER', title: 'CAB Ngày nắng', discount: 15000, description: 'Giảm trực tiếp 15k' },
  { id: 'promo-3', code: 'CABVIP', title: 'CAB Tri ân VIP', discount: 50000, description: 'Giảm trực tiếp 50k' },
];

const ESTIMATE_DEBOUNCE_MS = 1200;
const ONLINE_PAYMENT_METHODS = ['MOMO', 'ZALOPAY', 'VNPAY'];

const waitForPaymentByBooking = async (bookingId: string) => {
  // Attempt with exponential backoff: up to 30 attempts with growing intervals
  // 1+1.2+1.44+1.73+2.07+2.49+2.99+3.59+4.3+5.0+5.0... = ~60s total
  let waitMs = 1000;
  let totalWaitedMs = 0;
  for (let attempt = 0; attempt < 30; attempt += 1) {
    const paymentInfo = await PaymentService.getPaymentByBooking(bookingId);
    if (paymentInfo?.transactionId) {
      console.log(`[Booking] waitForPaymentByBooking: found transaction ${paymentInfo.transactionId} after ${attempt} attempts (${totalWaitedMs}ms)`);
      return paymentInfo;
    }
    console.log(`[Booking] waitForPaymentByBooking attempt ${attempt + 1}/30: no transaction yet, waiting ${waitMs}ms (total: ${totalWaitedMs}ms)`);
    await new Promise(resolve => setTimeout(resolve, waitMs));
    totalWaitedMs += waitMs;
    waitMs = Math.min(waitMs * 1.2, 5000);
  }
  console.warn(`[Booking] waitForPaymentByBooking: timed out after 30 attempts (${totalWaitedMs}ms) for bookingId=${bookingId}`);
  return null;
};

const LOCAL_FAMOUS_PLACES = [
  {
    id: 'famous-iuh',
    text: 'Đại học Công nghiệp TP.HCM (IUH)',
    place_name: 'Trường Đại học Công nghiệp TP.HCM (IUH) - 12 Nguyễn Văn Bảo, Phường 4, Gò Vấp, Hồ Chí Minh',
    geometry: {
      type: 'Point',
      coordinates: [106.6885, 10.8221]
    }
  },
  {
    id: 'famous-landmark81',
    text: 'Landmark 81',
    place_name: 'Tòa nhà Landmark 81 - 720A Điện Biên Phủ, Vinhomes Tân Cảng, Bình Thạnh, Hồ Chí Minh',
    geometry: {
      type: 'Point',
      coordinates: [106.7218, 10.7948]
    }
  },
  {
    id: 'famous-vanlang',
    text: 'Đại học Văn Lang (Cơ sở 3)',
    place_name: 'Trường Đại học Văn Lang (Cơ sở 3) - 69/68 Đặng Thùy Trâm, Phường 13, Bình Thạnh, Hồ Chí Minh',
    geometry: {
      type: 'Point',
      coordinates: [106.7011, 10.8275]
    }
  },
  {
    id: 'famous-tansonnhat',
    text: 'Sân bay Quốc tế Tân Sơn Nhất (SGN)',
    place_name: 'Sân bay Quốc tế Tân Sơn Nhất - Trường Sơn, Phường 2, Tân Bình, Hồ Chí Minh',
    geometry: {
      type: 'Point',
      coordinates: [106.6619, 10.8188]
    }
  },
  {
    id: 'famous-ducba',
    text: 'Nhà thờ Đức Bà Sài Gòn',
    place_name: 'Nhà thờ Đức Bà - 1 Công xã Paris, Bến Nghé, Quận 1, Hồ Chí Minh',
    geometry: {
      type: 'Point',
      coordinates: [106.6990, 10.7798]
    }
  },
  {
    id: 'famous-benthanh',
    text: 'Chợ Bến Thành',
    place_name: 'Chợ Bến Thành - Lê Lợi, Phường Bến Thành, Quận 1, Hồ Chí Minh',
    geometry: {
      type: 'Point',
      coordinates: [106.6983, 10.7719]
    }
  },
  {
    id: 'famous-nguyenhue',
    text: 'Phố đi bộ Nguyễn Huệ',
    place_name: 'Phố đi bộ Nguyễn Huệ - Nguyễn Huệ, Bến Nghé, Quận 1, Hồ Chí Minh',
    geometry: {
      type: 'Point',
      coordinates: [106.7037, 10.7740]
    }
  },
  {
    id: 'famous-aeontanphu',
    text: 'AEON Mall Tân Phú Celadon',
    place_name: 'AEON Mall Tân Phú - 30 Bờ Bao Tân Thắng, Sơn Kỳ, Tân Phú, Hồ Chí Minh',
    geometry: {
      type: 'Point',
      coordinates: [106.6157, 10.8032]
    }
  },
  {
    id: 'famous-bachkhoa',
    text: 'Đại học Bách Khoa TP.HCM (CS1)',
    place_name: 'Trường Đại học Bách Khoa TP.HCM - 268 Lý Thường Kiệt, Phường 14, Quận 10, Hồ Chí Minh',
    geometry: {
      type: 'Point',
      coordinates: [106.6580, 10.7724]
    }
  }
];

// ─────────────────────────────────────────────
// Debounce helper
// ─────────────────────────────────────────────
function useDebouncedCallback<T extends (...args: any[]) => any>(
  callback: T,
  delay: number
): T {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  return useCallback(
    ((...args: any[]) => {
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => callback(...args), delay);
    }) as T,
    [callback, delay]
  );
}

export default function BookingScreen() {
  const router = useRouter();
  const bookingInFlightRef = useRef(false);

  // ── Form state ──────────────────────────────────────────────
  const [pickup, setPickup] = useState('');
  const [pickupCoords, setPickupCoords] = useState<{ latitude: number; longitude: number } | null>(null);
  const [dropoff, setDropoff] = useState('');
  const [dropoffCoords, setDropoffCoords] = useState<{ latitude: number; longitude: number } | null>(null);

  const [vehicleTier, setVehicleTier] = useState<VehicleTier>('CAR4');
  const [paymentMethod, setPaymentMethod] = useState('CASH');
  const [loading, setLoading] = useState(false);
  const [selectedPromo, setSelectedPromo] = useState<typeof PROMO_CODES[0] | null>(null);

  // ── Estimate state ──────────────────────────────────────────
  const [estimates, setEstimates] = useState<Record<VehicleTier, FareEstimateResponse | null>>({
    BIKE: null,
    CAR4: null,
    CAR7: null,
  });

  const [estimateLoading, setEstimateLoading] = useState(false);
  const [estimateError, setEstimateError] = useState<string | null>(null);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [estimateExpired, setEstimateExpired] = useState(false);

  // ── Autocomplete state ───────────────────────────────────────
  const [suggestions, setSuggestions] = useState<any[]>([]);
  const [activeSearch, setActiveSearch] = useState<'pickup' | 'dropoff' | null>(null);
  const [searching, setSearching] = useState(false);
  const latestSearchRef = useRef(0);

  const clearStaleEstimate = () => {
    setEstimates({ BIKE: null, CAR4: null, CAR7: null });
    setCountdown(null);
    setEstimateExpired(false);
    setEstimateError(null);
  };

  // ── Countdown timer ──────────────────────────────────────────
  useEffect(() => {
    if (countdown === null || countdown <= 0) return;
    const timer = setInterval(() => {
      setCountdown(prev => {
        if (prev === null || prev <= 1) {
          clearInterval(timer);
          setEstimateExpired(true);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [countdown]);

  // ── Fetch address suggestions ───────────────────────────────
  const handleAddressSearch = async (text: string, type: 'pickup' | 'dropoff') => {
    if (type === 'pickup') {
      setPickup(text);
      setPickupCoords(null);
    } else {
      setDropoff(text);
      setDropoffCoords(null);
    }
    clearStaleEstimate();

    if (text.trim().length < 2) {
      setSuggestions([]);
      return;
    }

    const queryLower = text.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/đ/g, 'd');
    const localMatches = LOCAL_FAMOUS_PLACES.filter(place => {
      const placeTextNorm = place.text.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/đ/g, 'd');
      const placeNameNorm = place.place_name.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/đ/g, 'd');
      return placeTextNorm.includes(queryLower) || placeNameNorm.includes(queryLower);
    });

    const searchId = ++latestSearchRef.current;
    setSearching(true);
    try {
      const MAPBOX_KEY = process.env.EXPO_PUBLIC_MAPBOX_API_KEY ?? '';
      if (!MAPBOX_KEY) {
        console.warn('MAPBOX_API_KEY not configured');
        if (searchId === latestSearchRef.current) setSuggestions(localMatches);
        return;
      }

      const response = await fetch(
        `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(text)}.json?access_token=${MAPBOX_KEY}&country=vn&limit=8&language=vi`
      );
      const data = await response.json();

      const mapboxFeatures = data.features ?? [];
      const combined = [...localMatches];
      mapboxFeatures.forEach((feat: any) => {
        const isDuplicate = combined.some(
          item => item.id === feat.id || item.text.toLowerCase() === feat.text.toLowerCase()
        );
        if (!isDuplicate) {
          combined.push(feat);
        }
      });

      if (searchId === latestSearchRef.current) setSuggestions(combined);
    } catch (e) {
      console.error('Geocoding error:', e);
      if (searchId === latestSearchRef.current) setSuggestions(localMatches);
    } finally {
      if (searchId === latestSearchRef.current) setSearching(false);
    }
  };

  const handleSelectSuggestion = (item: any) => {
    const coords = {
      latitude: item.geometry.coordinates[1],
      longitude: item.geometry.coordinates[0],
    };
    if (activeSearch === 'pickup') {
      setPickup(item.place_name ?? item.text);
      setPickupCoords(coords);
      console.log('[Booking] Pickup selected:', {
        name: item.place_name ?? item.text,
        lat: coords.latitude,
        lng: coords.longitude,
      });
    } else if (activeSearch === 'dropoff') {
      setDropoff(item.place_name ?? item.text);
      setDropoffCoords(coords);
      console.log('[Booking] Dropoff selected:', {
        name: item.place_name ?? item.text,
        lat: coords.latitude,
        lng: coords.longitude,
      });
    }
    setSuggestions([]);
    setActiveSearch(null);
    clearStaleEstimate();
  };

  // ── Debounced estimate fetcher ───────────────────────────────
  const fetchEstimates = useDebouncedCallback(async (
    pC: { latitude: number; longitude: number },
    dC: { latitude: number; longitude: number }
  ) => {
    if (!pC || !dC) return;

    setEstimateLoading(true);
    setEstimateError(null);
    setEstimateExpired(false);

    const idempotencyKey = `${Date.now()}_${Math.random().toString(36).substring(2, 10)}`;

    try {
      // Fetch estimates for all 3 tiers in parallel
      console.log('[Booking] Fetching estimates with coords:', {
        pickup: { lat: pC.latitude, lng: pC.longitude },
        dropoff: { lat: dC.latitude, lng: dC.longitude },
        idempotencyKey,
      });
      const [bike, car4, car7] = await Promise.all([
        PricingService.createEstimate(
          {
            pickupLat: pC.latitude,
            pickupLng: pC.longitude,
            dropoffLat: dC.latitude,
            dropoffLng: dC.longitude,
            vehicleType: 'BIKE',
          },
          `${idempotencyKey}_bike`
        ),
        PricingService.createEstimate(
          {
            pickupLat: pC.latitude,
            pickupLng: pC.longitude,
            dropoffLat: dC.latitude,
            dropoffLng: dC.longitude,
            vehicleType: 'CAR4',
          },
          `${idempotencyKey}_car4`
        ),
        PricingService.createEstimate(
          {
            pickupLat: pC.latitude,
            pickupLng: pC.longitude,
            dropoffLat: dC.latitude,
            dropoffLng: dC.longitude,
            vehicleType: 'CAR7',
          },
          `${idempotencyKey}_car7`
        ),
      ]);

      setEstimates({ BIKE: bike, CAR4: car4, CAR7: car7 });
      console.log('[Booking] Estimates received:', {
        bike: { estimateId: bike.estimateId, totalFare: bike.totalFare },
        car4: { estimateId: car4.estimateId, totalFare: car4.totalFare },
        car7: { estimateId: car7.estimateId, totalFare: car7.totalFare },
        quoteHashBike: bike.quotePayloadHash,
        quoteHashCar4: car4.quotePayloadHash,
      });

      // Start countdown from the CAR4 estimate expiry
      const remaining = getRemainingSeconds(car4.expiresAt);
      setCountdown(remaining);

    } catch (err: any) {
      console.error('Pricing estimate error:', err?.response?.data ?? err);
      setEstimateError('Không lấy được giá ước tính. Sử dụng giá mặc định.');

      // Fallback: calculate locally for all tiers
      // NOTE: Booking will fail if backend requires non-blank quotePayloadHash.
      // This fallback only works if BookingService is relaxed about quote verification.
      const fallbackEst = (fare: number, tier: VehicleTier): FareEstimateResponse => ({
        estimateId: 'fallback',
        pickupZone: 'unknown',
        dropoffZone: 'unknown',
        vehicleType: tier,
        distanceKm: 0,
        durationMinutes: 0,
        baseFare: 0,
        distanceFare: 0,
        timeFare: 0,
        platformFee: 0,
        zoneFee: 0,
        airportFee: 0,
        tollFee: 0,
        discountAmount: 0,
        surgeMultiplier: 1.0,
        totalFare: fare,
        currency: 'VND',
        pricingConfigVersion: '1',
        distanceSource: 'HAVERSINE_FALLBACK',
        weatherCondition: 'unknown',
        weatherSource: 'fallback',
        fallbackUsed: true,
        expiresAt: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
        status: 'PENDING',
        quoteId: 'FALLBACK',
        quotePayloadHash: '',
        quoteHashAlgorithm: 'none',
        message: 'Giá ước tính (fallback)',
      });

      const bikeFare = calculateFallbackFare(pC.latitude, pC.longitude, dC.latitude, dC.longitude, 'BIKE', 25, surgeMultiplier);
      const car4Fare = calculateFallbackFare(pC.latitude, pC.longitude, dC.latitude, dC.longitude, 'CAR4', 25, surgeMultiplier);
      const car7Fare = calculateFallbackFare(pC.latitude, pC.longitude, dC.latitude, dC.longitude, 'CAR7', 25, surgeMultiplier);

      setEstimates({
        BIKE: fallbackEst(bikeFare, 'BIKE'),
        CAR4: fallbackEst(car4Fare, 'CAR4'),
        CAR7: fallbackEst(car7Fare, 'CAR7'),
      });
    } finally {
      setEstimateLoading(false);
    }
  }, ESTIMATE_DEBOUNCE_MS);

  // Trigger estimate when both coordinates are set
  useEffect(() => {
    if (pickupCoords && dropoffCoords) {
      fetchEstimates(pickupCoords, dropoffCoords);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pickupCoords, dropoffCoords]);

  // ── Selected estimate (based on tier) ──────────────────────────
  const selectedEstimate = estimates[vehicleTier];
  const baseFare = selectedEstimate?.totalFare ?? 0;
  const discount = selectedPromo?.discount ?? 0;
  const finalFare = Math.max(0, baseFare - discount);
  const surgeMultiplier = selectedEstimate?.surgeMultiplier ?? 1.0;
  const distanceKm = selectedEstimate?.distanceKm ?? 0;
  const durationMin = selectedEstimate?.durationMinutes ?? 0;

  // ── Submit booking ────────────────────────────────────────────
  const handleBooking = async () => {
    if (bookingInFlightRef.current) return;

    if (!pickup || !dropoff) {
      Alert.alert('Lỗi', 'Vui lòng nhập điểm đón và điểm đến');
      return;
    }
    if (!pickupCoords || !dropoffCoords) {
      Alert.alert('Thiếu tọa độ', 'Vui lòng chọn địa điểm từ danh sách gợi ý để xác định chính xác điểm đón và điểm đến.');
      return;
    }
    if (estimateExpired && !selectedEstimate) {
      Alert.alert('Giá hết hạn', 'Giá ước tính đã hết hạn. Vui lòng đợi giá mới.');
      return;
    }

    const token = await AsyncStorage.getItem('access_token');
    if (!token) {
      Alert.alert('Yêu cầu đăng nhập', 'Bạn cần đăng nhập để đặt xe.', [
        { text: 'Hủy', style: 'cancel' },
        { text: 'Đăng nhập', onPress: () => router.push('/login') },
      ]);
      return;
    }

    bookingInFlightRef.current = true;
    setLoading(true);
    try {
      const idempotencyKey = `${Date.now()}_${Math.random().toString(36).substring(2, 10)}`;

      const est = selectedEstimate;
      const vehicleTierForApi: VehicleTier = vehicleTier;

      const bookingRequest = {
        pickupLocation: pickup,
        dropoffLocation: dropoff,
        customerNote: selectedPromo
          ? `Áp dụng mã ${selectedPromo.code}`
          : 'Vui lòng đón tôi ở cổng chính.',
        pickupCoordinates: {
          lat: pickupCoords.latitude,
          lng: pickupCoords.longitude,
        },
        dropoffCoordinates: {
          lat: dropoffCoords.latitude,
          lng: dropoffCoords.longitude,
        },
        vehicleType: vehicleTierForApi,
        paymentMethod,
        estimatedFare: finalFare,
        promoCode: selectedPromo ? selectedPromo.code : '',
        // All quote fields required by backend BookingService.confirmQuoteBeforeBooking()
        estimateId: est?.estimateId ?? '',
        quoteId: est?.quoteId ?? '',
        quotePayloadHash: est?.quotePayloadHash ?? '',
        quoteHashAlgorithm: est?.quoteHashAlgorithm ?? 'SHA-256',
        quoteExpiresAt: est?.expiresAt ?? '',
        surgeMultiplier: surgeMultiplier,
        idempotencyKey,
      };

      console.log('[Booking] Request payload:', JSON.stringify(bookingRequest, null, 2));

      const response = await api.post('/api/v1/bookings', bookingRequest);
      console.log('[Booking] Response:', response.status, JSON.stringify(response.data, null, 2));

      const isSuccess =
        response.data?.code === 200 || response.data?.code === 201
        || (response.status >= 200 && response.status < 300 && response.data?.result);

      if (isSuccess) {
        const bookingId = response.data?.result?.id ?? response.data?.id;

        // Online prepaid flow: pay first, then Booking moves to MATCHING.
        // Flow: booking(PENDING_PAYMENT) -> payment.requested(Kafka) -> PaymentService creates txn ->
        // Customer pays on payment.tsx -> payment.completed(Kafka) -> Booking MATCHING -> ride.created
        if (ONLINE_PAYMENT_METHODS.includes(paymentMethod)) {
          let paymentInfo: PaymentInitResponse | null = null;

          // Step 1: Wait for backend to create the transaction via Kafka (2-5s typical)
          paymentInfo = await waitForPaymentByBooking(bookingId);

          // Step 2: If backend hasn't created it yet, create directly here.
          // If initPayment fails (e.g. booking already has a transaction from Kafka),
          // we still navigate to payment.tsx which will fetch the existing transaction.
          if (!paymentInfo) {
            console.warn('[Booking] Payment transaction not found by polling, creating directly');
            try {
              paymentInfo = await PaymentService.initPayment({
                bookingId,
                amount: finalFare,
                paymentMethod: paymentMethod as 'MOMO' | 'ZALOPAY' | 'VNPAY' | 'CASH',
              });
            } catch (initError: any) {
              // initPayment may fail if backend already created the transaction via Kafka.
              // Navigate to payment.tsx anyway — it will fetch the existing transaction.
              console.warn('[Booking] initPayment failed, navigating to payment screen to fetch existing txn:', initError);
              router.replace({
                pathname: '/(payment)/payment',
                params: {
                  bookingId,
                  amount: finalFare.toString(),
                  paymentMethod,
                  transactionId: '',
                },
              });
              return;
            }
          }

          // Step 3: Navigate to payment screen — let payment.tsx handle gateway/polling
          router.replace({
            pathname: '/(payment)/payment',
            params: {
              bookingId,
              amount: finalFare.toString(),
              paymentMethod,
              transactionId: paymentInfo.transactionId,
            },
          });
          return;
        }

        // CASH: matching starts immediately.
        router.replace({
          pathname: '/(ride)/matching',
          params: {
            bookingId,
            estimatedFare: finalFare.toString(),
            surge: surgeMultiplier.toString(),
            vehicleType: vehicleTier,
            pickup,
            dropoff,
            pickupLat: pickupCoords.latitude.toString(),
            pickupLng: pickupCoords.longitude.toString(),
            dropoffLat: dropoffCoords.latitude.toString(),
            dropoffLng: dropoffCoords.longitude.toString(),
            paymentMethod,
          },
        });
      } else {
        const msg = response.data?.errorMessage ?? response.data?.message ?? 'Không thể tạo đơn đặt xe.';
        Alert.alert('Lỗi đặt xe', msg);
      }
    } catch (error: any) {
      console.error('Booking error:', error?.response?.data ?? error);
      if (error?.response?.status === 409) {
        const existingId = error?.response?.data?.result?.id;
        if (existingId) {
          router.replace({ pathname: '/(ride)/matching', params: { bookingId: existingId } });
          return;
        }
        Alert.alert('Trùng lặp', 'Yêu cầu đặt xe này đã được xử lý. Vui lòng thử tuyến khác.');
      } else if (error?.response?.status === 422 && error?.response?.data?.errorMessage === 'INVALID_QUOTE_STATUS') {
        clearStaleEstimate();
        Alert.alert('Giá không còn hợp lệ', 'Báo giá này đã hết hiệu lực hoặc đã được sử dụng cho giao dịch trước. Vui lòng chọn lại lộ trình để lấy báo giá mới.');
      } else {
        const msg = error?.response?.data?.message ?? error?.response?.data?.errorMessage
          ?? 'Không thể đặt xe. Vui lòng thử lại.';
        Alert.alert('Đặt xe thất bại', msg);
      }
    } finally {
      bookingInFlightRef.current = false;
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <BookingHeader />

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        {/* Map Preview */}
        <MapPreview
          pickupCoords={pickupCoords}
          dropoffCoords={dropoffCoords}
          pickup={pickup}
          dropoff={dropoff}
          surgeMultiplier={surgeMultiplier}
          countdown={countdown}
          estimateExpired={estimateExpired}
          distanceKm={distanceKm}
          durationMin={durationMin}
        />

        {/* Route Info */}
        <RouteInfoBar
          distanceKm={distanceKm}
          durationMin={durationMin}
          estimateError={estimateError}
        />

        {/* Address Form */}
        <AddressForm
          pickup={pickup}
          dropoff={dropoff}
          onPickupChange={text => handleAddressSearch(text, 'pickup')}
          onDropoffChange={text => handleAddressSearch(text, 'dropoff')}
          onPickupFocus={() => setActiveSearch('pickup')}
          onDropoffFocus={() => setActiveSearch('dropoff')}
        />

        {/* Suggestions */}
        <AddressSuggestions
          suggestions={suggestions}
          activeSearch={activeSearch}
          searching={searching}
          onSelectSuggestion={handleSelectSuggestion}
        />

        {/* Tier Selection */}
        <VehicleTierSelection
          selectedTier={vehicleTier}
          estimates={estimates}
          estimateLoading={estimateLoading}
          onSelectTier={setVehicleTier}
        />

        {/* Payment Method */}
        <PaymentMethodSelector
          paymentMethod={paymentMethod}
          onSelectPayment={setPaymentMethod}
        />

        {/* Promo Code */}
        <PromoCodeSelector
          promoCodes={PROMO_CODES}
          selectedPromo={selectedPromo}
          onSelectPromo={setSelectedPromo}
        />

        {/* Final Fare Summary */}
        <FareSummary
          selectedEstimate={selectedEstimate}
          selectedPromo={selectedPromo}
          finalFare={finalFare}
        />

        {/* Book Button */}
        <BookButton
          vehicleType={vehicleTier}
          dropoffCoords={dropoffCoords}
          loading={loading}
          countdown={countdown}
          estimateExpired={estimateExpired}
          onPress={handleBooking}
        />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8F9FB' },
  scrollContent: { paddingBottom: 30 },
});
