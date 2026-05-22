import React, { useEffect, useState, useRef } from 'react';
import {
  StyleSheet, View, Text, TouchableOpacity, ActivityIndicator, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ChevronLeft, MapPin, Navigation, Zap, Route, Clock } from 'lucide-react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useSocket } from '@/hooks/useSocket';
import { usePayment } from '@/hooks/usePayment';
import { Colors } from '@/constants/Colors';
import api from '@/services/api';
import MapView, { Marker, Polyline } from 'react-native-maps';
import { PaymentService } from '@/services/paymentService';
import { formatVND, getSurgeLabel, getSurgeColor } from '@/services/pricingService';

// Generates a beautiful, realistic S-curve route between start and end using Perpendicular Vector & Sine wave
const generateRouteCoords = (
  start: { latitude: number; longitude: number },
  end: { latitude: number; longitude: number }
) => {
  const coords = [start];
  const dLat = end.latitude - start.latitude;
  const dLng = end.longitude - start.longitude;

  // Actual perpendicular normal vector of the start-end segment
  const perpLat = -dLng;
  const perpLng = dLat;

  const numSteps = 8;
  for (let i = 1; i < numSteps; i++) {
    const ratio = i / numSteps;
    // Base linear point
    const lat = start.latitude + dLat * ratio;
    const lng = start.longitude + dLng * ratio;

    // Multi-frequency wave using sine to create an elegant curved S-route (sin curve)
    const wave = Math.sin(ratio * Math.PI * 2);
    
    // Perpendicular offset scaled to 24% of the distance to give a beautiful natural curve
    const offsetScale = 0.24;
    const latOffset = perpLat * wave * offsetScale;
    const lngOffset = perpLng * wave * offsetScale;

    coords.push({
      latitude: lat + latOffset,
      longitude: lng + lngOffset,
    });
  }
  coords.push(end);
  return coords;
};

export default function MatchingScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();

  const {
    bookingId,
    estimatedFare,
    surge,
    vehicleType,
    pickup,
    dropoff,
    pickupLat,
    pickupLng,
    dropoffLat,
    dropoffLng,
    paymentMethod,
  } = params as Record<string, string>;

  const { socket } = useSocket();
  const { initPayment, startPolling, stopPolling } = usePayment();

  const [bookingStatus, setBookingStatus] = useState<string>('CREATED');
  const [bookingInfo, setBookingInfo] = useState<any>(null);
  const [paymentLoading, setPaymentLoading] = useState(false);

  // ── Parsed estimate data ────────────────────────────────────
  const parsedFare    = parseFloat(estimatedFare ?? '0');
  const parsedSurge  = parseFloat(surge ?? '1.0');
  const parsedVehicleType = vehicleType ?? 'CAR';

  const pLat = parseFloat(pickupLat ?? '0');
  const pLng = parseFloat(pickupLng ?? '0');
  const dLat = parseFloat(dropoffLat ?? '0');
  const dLng = parseFloat(dropoffLng ?? '0');

  const hasValidCoords = pLat !== 0 && dLat !== 0;

  // Route polyline coordinates (beautiful curved S-route between pickup and dropoff)
  const routeCoordinates = hasValidCoords
    ? generateRouteCoords({ latitude: pLat, longitude: pLng }, { latitude: dLat, longitude: dLng })
    : generateRouteCoords({ latitude: 10.822, longitude: 106.687 }, { latitude: 10.779, longitude: 106.699 });

  const centerLat = hasValidCoords ? (pLat + dLat) / 2 : 10.800;
  const centerLng = hasValidCoords ? (pLng + dLng) / 2 : 106.690;

  // ── Poll booking status ──────────────────────────────────────
  useEffect(() => {
    if (!bookingId) return;

    const fetchBookingInfo = async () => {
      try {
        const response = await api.get(`/api/v1/bookings/${bookingId}`);
        if (response.data?.result) {
          const status = response.data.result.status;
          setBookingInfo(response.data.result);

          if (status === 'MATCHING') {
            setBookingStatus('FINDING');
          } else if (['ASSIGNED', 'ACCEPTED', 'PICKUP'].includes(status)) {
            setBookingStatus('FOUND');
          } else if (status === 'IN_PROGRESS') {
            setBookingStatus('STARTED');
          } else if (status === 'COMPLETED') {
            handleRideCompleted({ ...bookingInfo, ...response.data.result });
            return;
          } else if (['PAID', 'CANCELLED'].includes(status)) {
            router.replace('/(tabs)/explore');
            return;
          } else {
            setBookingStatus(status);
          }
        }
      } catch (err: any) {
        if (err?.response?.status !== 404) {
          console.log('Could not fetch booking info:', err?.message);
        }
      }
    };

    fetchBookingInfo();
    const interval = setInterval(fetchBookingInfo, 5000);
    return () => clearInterval(interval);
  }, [bookingId]);

  // ── Socket listeners ─────────────────────────────────────────
  useEffect(() => {
    if (!socket || !bookingId) return;
    socket.emit('join_room', bookingId);
    return () => { socket.emit('leave_room', bookingId); };
  }, [socket, bookingId]);

  useEffect(() => {
    if (!socket) return;

    const handleNotification = (data: any) => {
      console.log('[Matching] Socket notification:', data);
      const status = data.status ?? '';

      if (status === 'MATCHING')       setBookingStatus('FINDING');
      else if (status === 'ASSIGNED')  setBookingStatus('FOUND');
      else if (['ACCEPTED', 'PICKUP'].includes(status)) setBookingStatus('ARRIVING');
      else if (status === 'IN_PROGRESS') setBookingStatus('STARTED');
      else if (status === 'COMPLETED') {
        setBookingStatus('COMPLETED');
        if (bookingInfo) handleRideCompleted({ ...bookingInfo, ...data });
      } else if (status === 'PAID') {
        setBookingStatus('PAID');
        router.replace('/(tabs)/explore');
      }
    };

    socket.on('new_notification', handleNotification);
    socket.on('booking_status_update', handleNotification);
    return () => {
      socket.off('new_notification', handleNotification);
      socket.off('booking_status_update', handleNotification);
    };
  }, [socket, bookingId, bookingInfo]);

  // ── Payment flow ─────────────────────────────────────────────
  const handleRideCompleted = async (info?: any) => {
    const booking = info ?? bookingInfo;
    if (!booking || !bookingId) return;

    const payMethod  = booking.paymentMethod ?? paymentMethod ?? 'CASH';
    const fareAmount = booking.finalFare ?? booking.estimatedFare ?? parsedFare ?? 0;

    if (payMethod === 'CASH') {
      setBookingStatus('PAID');
      stopPolling?.();
      router.replace({
        pathname: '/(review)/review',
        params: { rideId: bookingId, driverId: booking.driverId ?? 'driver-mock-123' },
      });
      return;
    }

    setPaymentLoading(true);
    try {
      const payment = await initPayment({
        bookingId,
        amount: fareAmount,
        paymentMethod: payMethod as any,
      });

      const result = await PaymentService.openPaymentGateway(payment);

      if (result.type === 'QR') {
        router.push({
          pathname: '/(payment)/payment',
          params: { transactionId: payment.transactionId, bookingId, amount: fareAmount.toString(), paymentMethod: payMethod },
        });
      } else {
        startPolling(payment.transactionId, (paymentStatus) => {
          if (paymentStatus === 'SUCCESS') {
            router.replace({
              pathname: '/(payment)/payment-success',
              params: { transactionId: payment.transactionId, bookingId },
            });
          } else if (paymentStatus === 'FAILED_FINAL') {
            router.replace({
              pathname: '/(payment)/payment-failed',
              params: { transactionId: payment.transactionId, bookingId, reason: 'Thanh toán không thành công sau nhiều lần thử.' },
            });
          }
        });

        router.push({
          pathname: '/(payment)/payment',
          params: { transactionId: payment.transactionId, bookingId, amount: fareAmount.toString(), paymentMethod: payMethod },
        });
      }
    } catch (err: any) {
      console.error('Payment init error:', err);
      Alert.alert('Thanh toán thất bại', err?.message ?? 'Không thể khởi tạo thanh toán. Bạn vẫn có thể thanh toán sau.', [
        { text: 'Đóng', onPress: () => router.replace('/(tabs)/explore') },
      ]);
    } finally {
      setPaymentLoading(false);
    }
  };

  // ── Status helpers ───────────────────────────────────────────
  const getStatusText = () => {
    switch (bookingStatus) {
      case 'CREATED':  return 'Đang khởi tạo...';
      case 'FINDING':  return 'Đang tìm tài xế...';
      case 'FOUND':    return 'Đã tìm thấy tài xế';
      case 'ARRIVING': return 'Tài xế đang đến';
      case 'STARTED':  return 'Chuyến đi đã bắt đầu';
      case 'COMPLETED':return 'Chuyến đi hoàn thành';
      case 'PAID':     return 'Đã thanh toán';
      default:         return 'Đang cập nhật...';
    }
  };

  const getStatusIcon = () => {
    switch (bookingStatus) {
      case 'CREATED':  return <ActivityIndicator size="small" color={Colors.light.primary} />;
      case 'FINDING':  return <ActivityIndicator size="small" color="#F59E0B" />;
      case 'FOUND':    return <Text style={{ fontSize: 16 }}>👨‍✈️</Text>;
      case 'ARRIVING': return <Text style={{ fontSize: 16 }}>🚗</Text>;
      case 'STARTED':  return <Text style={{ fontSize: 16 }}>📍</Text>;
      case 'COMPLETED':return <Text style={{ fontSize: 16 }}>✅</Text>;
      default:         return <ActivityIndicator size="small" color={Colors.light.primary} />;
    }
  };

  const isFinding = bookingStatus === 'FINDING' || bookingStatus === 'CREATED';
  const isSurge   = parsedSurge > 1.0;

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <ChevronLeft size={28} color="#111" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Trạng thái chuyến xe</Text>
        <TouchableOpacity onPress={() => router.replace('/(tabs)')} style={styles.homeButton}>
          <Text style={styles.homeButtonText}>Home</Text>
        </TouchableOpacity>
      </View>

      {/* Map */}
      <View style={styles.content}>
        <MapView
          style={styles.map}
          initialRegion={{
            latitude:    centerLat,
            longitude:   centerLng,
            latitudeDelta:  hasValidCoords ? Math.abs(pLat - dLat) * 2.5 + 0.02 : 0.08,
            longitudeDelta: hasValidCoords ? Math.abs(pLng - dLng) * 2.5 + 0.02 : 0.08,
          }}
        >
          {/* Pickup Marker */}
          <Marker
            coordinate={{ latitude: hasValidCoords ? pLat : 10.822, longitude: hasValidCoords ? pLng : 106.687 }}
            title="Điểm đón"
            description={pickup ?? 'Điểm đón'}
            pinColor="#10B981"
          />
          {/* Dropoff Marker */}
          {hasValidCoords && (
            <Marker
              coordinate={{ latitude: dLat, longitude: dLng }}
              title="Điểm đến"
              description={dropoff ?? 'Điểm đến'}
              pinColor="#EF4444"
            />
          )}
          {/* Route line */}
          <Polyline
            coordinates={routeCoordinates}
            strokeColor={Colors.light.primary}
            strokeWidth={4}
          />
        </MapView>

        {/* Status Card */}
        <View style={styles.statusCard}>
          {/* ── Status badge ───────────────────────────────── */}
          <View style={styles.statusBadge}>
            {getStatusIcon()}
            <Text style={styles.statusText}>{getStatusText()}</Text>
          </View>

          {/* ── Route summary ──────────────────────────────── */}
          {pickup && dropoff && (
            <View style={styles.routeSummary}>
              <View style={styles.routePoint}>
                <View style={[styles.routeDot, { backgroundColor: '#10B981' }]} />
                <Text style={styles.routeAddress} numberOfLines={1}>{pickup}</Text>
              </View>
              <View style={styles.routeLine} />
              <View style={styles.routePoint}>
                <View style={[styles.routeDot, { backgroundColor: '#EF4444' }]} />
                <Text style={styles.routeAddress} numberOfLines={1}>{dropoff}</Text>
              </View>
            </View>
          )}

          {/* ── Pricing info ─────────────────────────────── */}
          {(parsedFare > 0 || bookingInfo?.estimatedFare) && (
            <View style={styles.pricingSection}>
              <View style={styles.pricingRow}>
                <View style={styles.pricingLeft}>
                  <Text style={styles.pricingLabel}>Cước phí ước tính</Text>
                  {isSurge && (
                    <View style={[styles.surgeTag, { backgroundColor: getSurgeColor(parsedSurge) + '18' }]}>
                      <Zap size={11} color={getSurgeColor(parsedSurge)} />
                      <Text style={[styles.surgeTagText, { color: getSurgeColor(parsedSurge) }]}>
                        ×{parsedSurge.toFixed(1)} {getSurgeLabel(parsedSurge)}
                      </Text>
                    </View>
                  )}
                </View>
                <Text style={styles.pricingValue}>
                  {formatVND(bookingInfo?.estimatedFare ?? parsedFare)}
                </Text>
              </View>

              {/* Vehicle type */}
              <View style={styles.pricingRow}>
                <Text style={styles.pricingLabel}>
                  {['CAR', 'CAR4', 'CAR7'].includes(parsedVehicleType.toUpperCase()) ? 'Xe ô tô (CAB Car)' : 'Xe máy (CAB Bike)'}
                </Text>
                <Text style={styles.pricingLabel}>
                  {(paymentMethod ?? bookingInfo?.paymentMethod ?? 'CASH') === 'CASH' ? 'Tiền mặt' : bookingInfo?.paymentMethod ?? paymentMethod ?? '—'}
                </Text>
              </View>
            </View>
          )}

          {/* ── Payment loading ─────────────────────────── */}
          {paymentLoading && (
            <View style={styles.paymentLoadingOverlay}>
              <ActivityIndicator size="large" color={Colors.light.primary} />
              <Text style={styles.paymentLoadingText}>Đang khởi tạo thanh toán...</Text>
            </View>
          )}

          {/* ── Finding / Cancel ─────────────────────────── */}
          {isFinding && (
            <View style={styles.findingContainer}>
              <Text style={styles.findingSubtext}>
                Hệ thống đang kết nối bạn với tài xế gần nhất
              </Text>
              <TouchableOpacity
                style={styles.cancelButton}
                onPress={async () => {
                  try {
                    await api.post(`/api/v1/bookings/${bookingId}/cancel`);
                    router.replace('/(tabs)/explore');
                  } catch {
                    Alert.alert('Lỗi', 'Không thể hủy chuyến. Vui lòng thử lại.');
                  }
                }}
              >
                <Text style={styles.cancelText}>Hủy chuyến</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      </View>
    </SafeAreaView>
  );
}

// ─────────────────────────────────────────────
// Styles
// ─────────────────────────────────────────────
const styles = StyleSheet.create({
  container:     { flex: 1, backgroundColor: '#fff' },
  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 15, paddingVertical: 10,
    borderBottomWidth: 1, borderBottomColor: '#F2F2F2',
    backgroundColor: '#fff',
  },
  backButton:    { padding: 5 },
  headerTitle:   { fontSize: 18, fontWeight: 'bold', marginLeft: 10, flex: 1 },
  homeButton: {
    paddingHorizontal: 12, paddingVertical: 6,
    backgroundColor: '#F0F0F0', borderRadius: 15,
  },
  homeButtonText:{ fontSize: 12, fontWeight: 'bold', color: '#666' },
  content:       { flex: 1 },
  map:          { flex: 1 },
  statusCard: {
    backgroundColor: '#fff', borderTopLeftRadius: 24, borderTopRightRadius: 24,
    padding: 24, elevation: 10, shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 }, shadowOpacity: 0.1, shadowRadius: 10,
  },
  statusBadge: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#EEF2FF', paddingHorizontal: 16, paddingVertical: 10,
    borderRadius: 12, gap: 10, marginBottom: 16,
  },
  statusText:   { fontSize: 16, fontWeight: 'bold', color: Colors.light.primary },
  routeSummary: { marginBottom: 16, paddingHorizontal: 4 },
  routePoint:   { flexDirection: 'row', alignItems: 'center', gap: 10 },
  routeDot:     { width: 10, height: 10, borderRadius: 5 },
  routeAddress: { fontSize: 13, color: '#374151', flex: 1 },
  routeLine:    { width: 2, height: 16, backgroundColor: '#E5E7EB', marginLeft: 4, marginVertical: 4 },
  pricingSection: {
    borderTopWidth: 1, borderTopColor: '#F0F0F0', paddingTop: 12,
  },
  pricingRow:   {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingVertical: 8,
  },
  pricingLeft:  { flexDirection: 'row', alignItems: 'center', gap: 8 },
  pricingLabel: { fontSize: 14, color: '#6B7280' },
  pricingValue: { fontSize: 18, fontWeight: '800', color: '#1F2937' },
  surgeTag: {
    flexDirection: 'row', alignItems: 'center', gap: 3,
    paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8,
  },
  surgeTagText: { fontSize: 11, fontWeight: '700' },
  findingContainer: { alignItems: 'center', paddingVertical: 20 },
  findingSubtext: {
    fontSize: 14, color: '#666', textAlign: 'center', marginBottom: 20,
  },
  cancelButton: { paddingVertical: 10, paddingHorizontal: 20 },
  cancelText:  { color: '#FF4444', fontWeight: 'bold', fontSize: 15 },
  paymentLoadingOverlay: {
    marginTop: 16, alignItems: 'center', padding: 16,
    backgroundColor: '#F9FAFB', borderRadius: 12, gap: 8,
  },
  paymentLoadingText: { fontSize: 14, color: Colors.light.primary, fontWeight: '600' },
});
