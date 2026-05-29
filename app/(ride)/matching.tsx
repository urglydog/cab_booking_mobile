import React, { useEffect, useState, useRef } from 'react';
import {
  StyleSheet, View, Text, TouchableOpacity, ActivityIndicator, Alert, Animated, Easing,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ChevronLeft, MapPin, Navigation, Zap, Route, Clock, MessageSquare } from 'lucide-react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useSocket } from '@/hooks/useSocket';
import { usePayment } from '@/hooks/usePayment';
import { useRideSocket } from '@/hooks/useRideSocket';
import { Colors } from '@/constants/Colors';
import api from '@/services/api';
import MapView, { Marker, Polyline } from 'react-native-maps';
import { PaymentService, parsePaymentCallbackUrl } from '@/services/paymentService';
import { formatVND, getSurgeLabel, getSurgeColor } from '@/services/pricingService';

const isRoomUpdateForBooking = (payload: any, bookingId?: string) => {
  if (!bookingId) return true;
  const roomId = payload?.userId || payload?.bookingId || payload?.rideId || '';
  return roomId === bookingId || roomId === `ROOM_${bookingId}`;
};

/**
 * Valid BookingStatus enum values from backend.
 * Source: booking-service/.../enums/BookingStatus.java
 */
const BOOKING_STATUS_SET = new Set([
  'CREATED', 'PENDING_PAYMENT', 'MATCHING', 'ASSIGNED',
  'ACCEPTED', 'PICKUP', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED',
]);

const inferRideUiStatus = (payload: any) => {
  const rawStatus = String(
    payload?.status ?? payload?.rideStatus ?? payload?.type ?? payload?.eventType ?? ''
  ).toUpperCase();
  const title = String(payload?.title ?? '').toLowerCase();
  const message = String(payload?.message ?? '').toLowerCase();

  if (BOOKING_STATUS_SET.has(rawStatus)) {
    switch (rawStatus) {
      case 'CREATED':
      case 'MATCHING':
        return 'FINDING';
      case 'PENDING_PAYMENT':
        return 'PENDING_PAYMENT';
      case 'ASSIGNED':
        return 'PENDING_DRIVER';
      case 'ACCEPTED':
        return 'FOUND';
      case 'PICKUP':
        return 'ARRIVING';
      case 'IN_PROGRESS':
        return 'STARTED';
      case 'COMPLETED':
        return 'COMPLETED';
      case 'CANCELLED':
        return 'CANCELLED';
      default:
        return undefined;
    }
  }

  if (rawStatus === 'PAID') return 'PAID';
  if (['TIMEOUT', 'BOOKING.TIMEOUT'].includes(rawStatus)) return 'CANCELLED';
  if (title.includes('đã đến') || message.includes('đã đến điểm đón') || message.includes('arrived')) return 'ARRIVING';
  if (title.includes('bắt đầu') || message.includes('bắt đầu') || message.includes('started')) return 'STARTED';
  if (title.includes('hoàn thành') || message.includes('hoàn thành') || message.includes('completed')) return 'COMPLETED';
  if (title.includes('hủy') || message.includes('không tìm thấy tài xế') || title.includes('hết thời gian')) return 'CANCELLED';
  if (
    ['REJECTED', 'RIDE.REJECTED', 'RIDE_REJECTED'].includes(rawStatus) ||
    message.includes('tìm tài xế') ||
    message.includes('từ chối') ||
    message.includes('reject')
  ) {
    return 'FINDING';
  }

  return undefined;
};

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
  const { driverLocation } = useRideSocket(bookingId);

  // If prepaid method, start in PENDING_PAYMENT to avoid fake "finding driver" flash
  const [bookingStatus, setBookingStatus] = useState<string>(
    paymentMethod && paymentMethod !== 'CASH' ? 'PENDING_PAYMENT' : 'CREATED'
  );
  const [bookingInfo, setBookingInfo] = useState<any>(null);
  const [paymentLoading, setPaymentLoading] = useState(false);
  const [matchedDriver, setMatchedDriver] = useState<any>(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [statusSubtext, setStatusSubtext] = useState<string>('Hệ thống đang kết nối bạn với tài xế gần nhất');

  const pulse = useRef(new Animated.Value(0)).current;
  const sweep = useRef(new Animated.Value(0)).current;

  const isFinding = bookingStatus === 'FINDING' || bookingStatus === 'CREATED' || bookingStatus === 'PENDING_DRIVER';

  useEffect(() => {
    if (!isFinding) {
      pulse.stopAnimation();
      sweep.stopAnimation();
      pulse.setValue(0);
      sweep.setValue(0);
      return;
    }

    const pulseLoop = Animated.loop(
      Animated.timing(pulse, {
        toValue: 1,
        duration: 1700,
        easing: Easing.out(Easing.quad),
        useNativeDriver: false,
      })
    );
    const sweepLoop = Animated.loop(
      Animated.timing(sweep, {
        toValue: 1,
        duration: 2200,
        easing: Easing.linear,
        useNativeDriver: false,
      })
    );
    pulseLoop.start();
    sweepLoop.start();

    return () => {
      pulseLoop.stop();
      sweepLoop.stop();
    };
  }, [isFinding, pulse, sweep]);

  const pulseScale = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.4, 2.6] });
  const pulseOpacity = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.35, 0] });
  const sweepRotation = sweep.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });

  useEffect(() => {
    const driverId = bookingInfo?.assignedDriverId ?? bookingInfo?.driverId;
    if (driverId) {
      api.get(`/api/drivers/${driverId}/profile`)
        .then(res => {
          if (res.data?.result) {
            setMatchedDriver(res.data.result);
          }
        })
        .catch(err => console.log('Failed to fetch matched driver profile in matching:', err));
    } else {
      setMatchedDriver(null);
    }
  }, [bookingInfo?.assignedDriverId, bookingInfo?.driverId]);

  const getMethodColor = (method: string) => {
    const colors: Record<string, string> = {
      MOMO: '#A50064',
      ZALOPAY: '#0068FF',
      VNPAY: '#AA2B52',
      SEPAY: '#FF5E00',
      CASH: '#10B981',
    };
    return colors[method] || '#6366F1';
  };

  const getMethodLabel = (method: string) => {
    const labels: Record<string, string> = {
      MOMO: 'MoMo',
      ZALOPAY: 'ZaloPay',
      VNPAY: 'VNPay',
      SEPAY: 'SePay (VietQR)',
      CASH: 'Tiền mặt',
    };
    return labels[method] || method;
  };

  // ── Parsed estimate data ────────────────────────────────────
  const parsedFare = parseFloat(estimatedFare ?? bookingInfo?.estimatedFare?.toString() ?? '0');
  const parsedSurge = parseFloat(surge ?? '1.0');
  const parsedVehicleType = vehicleType ?? bookingInfo?.vehicleType ?? 'CAR';

  const pLat = parseFloat(pickupLat ?? bookingInfo?.pickupCoordinates?.lat?.toString() ?? '0');
  const pLng = parseFloat(pickupLng ?? bookingInfo?.pickupCoordinates?.lng?.toString() ?? '0');
  const dLat = parseFloat(dropoffLat ?? bookingInfo?.dropoffCoordinates?.lat?.toString() ?? '0');
  const dLng = parseFloat(dropoffLng ?? bookingInfo?.dropoffCoordinates?.lng?.toString() ?? '0');

  const hasValidCoords = pLat !== 0 && dLat !== 0;

  const pickupText = pickup ?? bookingInfo?.pickupLocation;
  const dropoffText = dropoff ?? bookingInfo?.dropoffLocation;

  // Route polyline coordinates (beautiful curved S-route between pickup and dropoff)
  const routeCoordinates = hasValidCoords
    ? generateRouteCoords({ latitude: pLat, longitude: pLng }, { latitude: dLat, longitude: dLng })
    : generateRouteCoords({ latitude: 10.822, longitude: 106.687 }, { latitude: 10.779, longitude: 106.699 });

  const centerLat = hasValidCoords ? (pLat + dLat) / 2 : 10.800;
  const centerLng = hasValidCoords ? (pLng + dLng) / 2 : 106.690;

  const fetchBookingInfo = async () => {
    if (!bookingId) return;
    try {
      const response = await api.get(`/api/v1/bookings/${bookingId}`);
      if (response.data?.result) {
        const booking = response.data.result;
        setBookingInfo(booking);

        const inferredStatus = inferRideUiStatus(booking);
        if (inferredStatus === 'COMPLETED') {
          handleRideCompleted(booking);
          return;
        } else if (inferredStatus === 'CANCELLED' || inferredStatus === 'PAID') {
          router.replace('/(tabs)/explore');
          return;
        } else if (inferredStatus) {
          setBookingStatus(inferredStatus);
          if (inferredStatus === 'FINDING') {
            setStatusSubtext(prev => prev.includes('từ chối') || prev.includes('hủy') || prev.includes('chưa kịp') ? prev : 'Hệ thống đang kết nối bạn với tài xế gần nhất');
          } else if (inferredStatus === 'PENDING_DRIVER') {
            setStatusSubtext('Đã tìm thấy tài xế! Đang chờ tài xế xác nhận chuyến...');
          } else if (inferredStatus === 'FOUND') {
            setStatusSubtext('Tài xế đã nhận chuyến. Tài xế đang đến điểm đón của bạn.');
          } else if (inferredStatus === 'ARRIVING') {
            setStatusSubtext('Tài xế đang đến điểm đón của bạn.');
          } else if (inferredStatus === 'STARTED') {
            setStatusSubtext('Chuyến đi đã bắt đầu.');
          }
        } else if (booking.status === 'PENDING_PAYMENT') {
          // VNPay: booking waits for online payment before matching starts
          setBookingStatus('PENDING_PAYMENT');
        } else if (booking.status) {
          setBookingStatus(booking.status);
        }
      }
    } catch (err: any) {
      if (err?.response?.status !== 404) {
        console.log('Could not fetch booking info:', err?.message);
      }
    }
  };

  // ── Derived UI flags (must be declared before useEffects that reference them) ──
  const isActivelySearching = bookingStatus === 'FINDING' || bookingStatus === 'CREATED';
  const isPendingPayment = bookingStatus === 'PENDING_PAYMENT';
  const isCancelled = bookingStatus === 'CANCELLED';
  const isSurge = parsedSurge > 1.0;

  // ── Poll booking status ──────────────────────────────────────
  useEffect(() => {
    if (!bookingId) return;

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

  // ── Elapsed timer for FINDING/CREATED status ──────────────────
  useEffect(() => {
    if (!isActivelySearching) return;
    setElapsedSeconds(0);
    const timer = setInterval(() => setElapsedSeconds(prev => prev + 1), 1000);
    return () => clearInterval(timer);
  }, [isActivelySearching]);

  useEffect(() => {
    if (!socket) return;

    /**
     * When a notification arrives, re-fetch the booking to get the real
     * BookingStatus from the backend (notifications don't carry booking status).
     * This replaces the old Vietnamese text parsing approach.
     */
    const handleNotification = (data: any) => {
      if (!isRoomUpdateForBooking(data, bookingId as string)) return;

      api.get(`/api/v1/bookings/${bookingId}`)
        .then(res => {
          if (!res.data?.result) return;
          const freshBooking = res.data.result;
          setBookingInfo(freshBooking);

          const inferredStatus = inferRideUiStatus(freshBooking) ?? inferRideUiStatus(data);
          if (inferredStatus === 'COMPLETED') {
            setBookingStatus('COMPLETED');
            handleRideCompleted(freshBooking);
          } else if (inferredStatus === 'PAID') {
            setBookingStatus('PAID');
            router.replace('/(tabs)/explore');
          } else if (inferredStatus === 'CANCELLED') {
            setBookingStatus('CANCELLED');
            if (data.message) {
              Alert.alert('Thông báo', data.message);
            }
          } else if (inferredStatus === 'FINDING') {
            setBookingStatus('FINDING');
            const msg = String(data?.message ?? '');
            setStatusSubtext(msg || 'Tài xế chưa kịp nhận chuyến. Đang tìm tài xế khác cho bạn...');
            setMatchedDriver(null);
          } else if (inferredStatus) {
            setBookingStatus(inferredStatus);
            if (inferredStatus === 'PENDING_DRIVER') {
              setStatusSubtext(data.message || 'Đã tìm thấy tài xế! Đang chờ tài xế xác nhận chuyến...');
            } else if (inferredStatus === 'FOUND') {
              setStatusSubtext(data.message || 'Tài xế đã nhận chuyến. Tài xế đang đến điểm đón của bạn.');
            } else if (inferredStatus === 'ARRIVING') {
              setStatusSubtext(data.message || 'Tài xế đang đến điểm đón của bạn.');
            } else if (inferredStatus === 'STARTED') {
              setStatusSubtext(data.message || 'Chuyến đi đã bắt đầu.');
            }
          }
        })
        .catch(() => {});
    };

    socket.on('new_notification', handleNotification);
    socket.on('booking_status_update', handleNotification);
    return () => {
      socket.off('new_notification', handleNotification);
      socket.off('booking_status_update', handleNotification);
    };
  }, [socket, bookingId, router]);

  // ── Payment flow ─────────────────────────────────────────────
  const handleRideCompleted = async (info?: any) => {
    const booking = info ?? bookingInfo;
    if (!booking || !bookingId) return;

    const payMethod = booking.paymentMethod ?? paymentMethod ?? 'CASH';
    const fareAmount = booking.finalFare ?? booking.estimatedFare ?? parsedFare ?? 0;

    if (payMethod === 'CASH' || ['MOMO', 'ZALOPAY', 'VNPAY', 'SEPAY'].includes(payMethod)) {
      setBookingStatus('COMPLETED');
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
      case 'CREATED': return 'Đang khởi tạo...';
      case 'PENDING_PAYMENT':
        const method = bookingInfo?.paymentMethod || paymentMethod || 'ONLINE';
        return `Chờ thanh toán ${method === 'SEPAY' ? 'SePay' : method === 'ZALOPAY' ? 'ZaloPay' : method === 'MOMO' ? 'MoMo' : 'VNPay'}`;
      case 'FINDING': return 'Đang tìm tài xế...';
      case 'PENDING_DRIVER': return 'Đã tìm thấy tài xế';
      case 'FOUND': return 'Tài xế đã nhận chuyến';
      case 'ARRIVING': return 'Tài xế đang đến';
      case 'STARTED': return 'Chuyến đi đã bắt đầu';
      case 'COMPLETED': return 'Chuyến đi hoàn thành';
      case 'PAID': return 'Đã thanh toán';
      default: return 'Đang cập nhật...';
    }
  };

  const getStatusIcon = () => {
    switch (bookingStatus) {
      case 'CREATED': return <ActivityIndicator size="small" color={Colors.light.primary} />;
      case 'PENDING_PAYMENT':
        const method = bookingInfo?.paymentMethod || paymentMethod || 'ONLINE';
        const color = method === 'SEPAY' ? '#FF5E00' : method === 'ZALOPAY' ? '#0068FF' : method === 'MOMO' ? '#A50064' : '#AA2B52';
        return <ActivityIndicator size="small" color={color} />;
      case 'FINDING': return <ActivityIndicator size="small" color="#F59E0B" />;
      case 'PENDING_DRIVER': return <ActivityIndicator size="small" color="#6366F1" />;
      case 'FOUND': return <Text style={{ fontSize: 16 }}>{'👨\u200d✈️'}</Text>;
      case 'ARRIVING': return <Text style={{ fontSize: 16 }}>🚗</Text>;
      case 'STARTED': return <Text style={{ fontSize: 16 }}>📍</Text>;
      case 'COMPLETED': return <Text style={{ fontSize: 16 }}>✅</Text>;
      default: return <ActivityIndicator size="small" color={Colors.light.primary} />;
    }
  };
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
            latitude: centerLat,
            longitude: centerLng,
            latitudeDelta: hasValidCoords ? Math.abs(pLat - dLat) * 2.5 + 0.02 : 0.08,
            longitudeDelta: hasValidCoords ? Math.abs(pLng - dLng) * 2.5 + 0.02 : 0.08,
          }}
        >
          {/* Pickup Marker */}
          <Marker
            coordinate={{ latitude: hasValidCoords ? pLat : 10.822, longitude: hasValidCoords ? pLng : 106.687 }}
            title="Điểm đón"
            description={pickupText ?? 'Điểm đón'}
            tracksViewChanges={true}
          >
            <View style={styles.radarMarkerWrap}>
              {isFinding && (
                <>
                  <Animated.View
                    style={[
                      styles.radarPulse,
                      { opacity: pulseOpacity, transform: [{ scale: pulseScale }] },
                    ]}
                  />
                  <Animated.View style={[styles.radarSweep, { transform: [{ rotate: sweepRotation }] }]}>
                    <View style={styles.radarSweepArm} />
                  </Animated.View>
                </>
              )}
              <View style={styles.pickupDotOuter}>
                <View style={styles.pickupDotInner} />
              </View>
            </View>
          </Marker>
          {/* Dropoff Marker */}
          {hasValidCoords && (
            <Marker
              coordinate={{ latitude: dLat, longitude: dLng }}
              title="Điểm đến"
              description={dropoffText ?? 'Điểm đến'}
              pinColor="#EF4444"
            />
          )}
          {/* Route line */}
          <Polyline
            coordinates={routeCoordinates}
            strokeColor={Colors.light.primary}
            strokeWidth={4}
          />
          {/* Driver location marker (Phase 3: Ride GPS Socket Tracking) */}
          {driverLocation && (
            <Marker
              coordinate={{
                latitude: driverLocation.latitude,
                longitude: driverLocation.longitude,
              }}
              title="Tài xế"
              description="Vị trí hiện tại của tài xế"
              pinColor="#3B82F6"
            />
          )}
        </MapView>

        {/* Status Card */}
        <View style={styles.statusCard}>
          {/* ── Status badge ───────────────────────────────── */}
          <View style={styles.statusBadge}>
            {getStatusIcon()}
            <Text style={styles.statusText}>{getStatusText()}</Text>
          </View>

          {(bookingInfo?.assignedDriverId || bookingInfo?.driverId) && !['COMPLETED', 'PAID'].includes(bookingStatus) && (
            <View style={styles.driverCard}>
              <View style={styles.driverInfoRow}>
                <View style={styles.driverAvatar}>
                  <Text style={styles.driverAvatarText}>TX</Text>
                </View>
                <View style={styles.driverDetails}>
                  <Text style={styles.driverName}>
                    {matchedDriver ? matchedDriver.fullName : 'Đang kết nối tài xế...'}
                  </Text>
                  <Text style={styles.driverVehicle}>
                    {matchedDriver ? `Biển số: ${matchedDriver.vehiclePlate ?? 'N/A'} • ${matchedDriver.vehicleColor ?? 'N/A'} • ${matchedDriver.vehicleModel ?? 'N/A'}` : 'Đang tải xe...'}
                  </Text>
                  <Text style={styles.driverRating}>
                    ⭐ {matchedDriver?.averageRating ? Number(matchedDriver.averageRating).toFixed(1) : '5.0'} ({matchedDriver?.totalCompletedRides ?? 0} chuyến đi)
                  </Text>
                </View>
              </View>

              {/* Chat and Call actions */}
              <View style={styles.driverActions}>
                <TouchableOpacity
                  style={styles.chatActionBtn}
                  onPress={() => router.push({
                    pathname: '/(ride)/chat',
                    params: { bookingId: String(bookingId), driverName: matchedDriver?.fullName ?? 'Tài xế' }
                  })}
                >
                  <MessageSquare size={16} color="#FFF" style={{ marginRight: 6 }} />
                  <Text style={styles.actionBtnText}>Chat</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.callActionBtn}
                  onPress={() => {
                    Alert.alert('Gọi tài xế', `Đang kết nối đến ${matchedDriver?.fullName ?? 'tài xế'} qua số ${matchedDriver?.phoneNumber ?? 'N/A'}...`);
                  }}
                >
                  <Text style={styles.callBtnText}>Gọi điện</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}

          {/* ── Route summary ──────────────────────────────── */}
          {pickupText && dropoffText && (
            <View style={styles.routeSummary}>
              <View style={styles.routePoint}>
                <View style={[styles.routeDot, { backgroundColor: '#10B981' }]} />
                <Text style={styles.routeAddress} numberOfLines={1}>{pickupText}</Text>
              </View>
              <View style={styles.routeLine} />
              <View style={styles.routePoint}>
                <View style={[styles.routeDot, { backgroundColor: '#EF4444' }]} />
                <Text style={styles.routeAddress} numberOfLines={1}>{dropoffText}</Text>
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

          {/* ── Prepaid pending payment ────────────────── */}
          {isPendingPayment && (
            <View style={styles.vnpayContainer}>
              <Text style={styles.vnpaySubtext}>
                Vui lòng thanh toán trước để hệ thống tìm tài xế cho bạn.
              </Text>
              <TouchableOpacity
                style={[styles.vnpayButton, { backgroundColor: getMethodColor(bookingInfo?.paymentMethod || paymentMethod || 'VNPAY') }]}
                onPress={async () => {
                  try {
                    const currentMethod = bookingInfo?.paymentMethod || paymentMethod || 'VNPAY';
                    const paymentInfo = await PaymentService.getPaymentByBooking(bookingId);
                    if (paymentInfo) {
                      const gatewayResult = await PaymentService.openPaymentGateway(paymentInfo);
                      const callback = parsePaymentCallbackUrl(gatewayResult.callbackUrl);
                      if (callback?.status === 'success') {
                        router.replace({
                          pathname: '/(ride)/matching',
                          params: { bookingId },
                        });
                        return;
                      }
                      if (callback?.status === 'failed' || callback?.status === 'cancelled') {
                        router.replace({
                          pathname: '/(payment)/payment-failed',
                          params: {
                            transactionId: callback.transactionId || paymentInfo.transactionId,
                            bookingId,
                            reason: callback.reason || 'Thanh toán không thành công',
                          },
                        });
                        return;
                      }
                    }
                    // Navigate to payment screen to poll status
                    router.push({
                      pathname: '/(payment)/payment',
                      params: {
                        bookingId,
                        amount: (bookingInfo?.estimatedFare ?? parsedFare).toString(),
                        paymentMethod: currentMethod,
                        transactionId: paymentInfo?.transactionId ?? '',
                      },
                    });
                  } catch {
                    Alert.alert('Lỗi', `Không thể mở thanh toán ${getMethodLabel(bookingInfo?.paymentMethod || paymentMethod || 'VNPAY')}. Vui lòng thử lại.`);
                  }
                }}
              >
                <Text style={styles.vnpayButtonText}>Thanh toán ngay</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.vnpayCancelButton}
                onPress={async () => {
                  try {
                    await api.post(`/api/v1/bookings/${bookingId}/cancel`);
                    router.replace('/(tabs)/explore');
                  } catch {
                    Alert.alert('Lỗi', 'Không thể hủy chuyến. Vui lòng thử lại.');
                  }
                }}
              >
                <Text style={styles.vnpayCancelText}>Hủy chuyến</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* ── Finding / Cancel ─────────────────────────── */}
          {['FINDING', 'CREATED', 'FOUND', 'ARRIVING', 'STARTED'].includes(bookingStatus) && (
            <View style={styles.findingContainer}>
              {isFinding ? (
                <Text style={styles.findingSubtext}>
                  {statusSubtext}
                </Text>
              ) : (
                <Text style={[styles.findingSubtext, { color: '#9CA3AF', marginBottom: 12 }]}>
                  Bạn có thể hủy chuyến đi trước khi hoàn tất hoặc thanh toán.
                </Text>
              )}
              {isActivelySearching && elapsedSeconds > 0 && (
                <Text style={styles.elapsedText}>
                  {Math.floor(elapsedSeconds / 60)}:{String(elapsedSeconds % 60).padStart(2, '0')}
                </Text>
              )}
              <TouchableOpacity
                style={[
                  styles.cancelButton,
                  !isFinding && {
                    backgroundColor: '#FEE2E2',
                    borderRadius: 14,
                    paddingVertical: 14,
                    width: '100%',
                    alignItems: 'center',
                    borderWidth: 1,
                    borderColor: '#FECACA',
                  }
                ]}
                onPress={() => {
                  Alert.alert(
                    'Xác nhận hủy',
                    'Bạn có chắc chắn muốn hủy chuyến xe này không?',
                    [
                      { text: 'Quay lại', style: 'cancel' },
                      {
                        text: 'Hủy chuyến',
                        style: 'destructive',
                        onPress: async () => {
                          try {
                            await api.post(`/api/v1/bookings/${bookingId}/cancel`);
                            Alert.alert('Thành công', 'Đã hủy chuyến đi thành công.');
                            router.replace('/(tabs)/explore');
                          } catch (err) {
                            Alert.alert('Lỗi', 'Không thể hủy chuyến. Vui lòng thử lại.');
                          }
                        }
                      }
                    ]
                  );
                }}
              >
                <Text style={[styles.cancelText, !isFinding && { color: '#EF4444', fontWeight: '800' }]}>
                  Hủy chuyến
                </Text>
              </TouchableOpacity>
            </View>
          )}

          {/* ── Cancelled ────────────────────────────────── */}
          {isCancelled && (
            <View style={styles.cancelledContainer}>
              <Text style={{ fontSize: 32, marginBottom: 8 }}>🚫</Text>
              <Text style={styles.cancelledTitle}>Chuyến đi đã bị hủy</Text>
              <Text style={styles.cancelledSubtext}>
                Chuyến đi của bạn đã bị hủy. Bạn có thể đặt lại hoặc quay về trang chủ.
              </Text>
              <TouchableOpacity
                style={[styles.cancelledButton, { backgroundColor: Colors.light.primary }]}
                onPress={() => router.replace('/(ride)/booking')}
              >
                <Text style={styles.cancelledButtonText}>Đặt lại chuyến</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.cancelledHomeButton}
                onPress={() => router.replace('/(tabs)')}
              >
                <Text style={styles.cancelledHomeButtonText}>Về trang chủ</Text>
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
  container: { flex: 1, backgroundColor: '#fff' },
  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 15, paddingVertical: 10,
    borderBottomWidth: 1, borderBottomColor: '#F2F2F2',
    backgroundColor: '#fff',
  },
  backButton: { padding: 5 },
  headerTitle: { fontSize: 18, fontWeight: 'bold', marginLeft: 10, flex: 1 },
  homeButton: {
    paddingHorizontal: 12, paddingVertical: 6,
    backgroundColor: '#F0F0F0', borderRadius: 15,
  },
  homeButtonText: { fontSize: 12, fontWeight: 'bold', color: '#666' },
  content: { flex: 1 },
  map: { flex: 1 },
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
  statusText: { fontSize: 16, fontWeight: 'bold', color: Colors.light.primary },
  routeSummary: { marginBottom: 16, paddingHorizontal: 4 },
  routePoint: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  routeDot: { width: 10, height: 10, borderRadius: 5 },
  routeAddress: { fontSize: 13, color: '#374151', flex: 1 },
  routeLine: { width: 2, height: 16, backgroundColor: '#E5E7EB', marginLeft: 4, marginVertical: 4 },
  pricingSection: {
    borderTopWidth: 1, borderTopColor: '#F0F0F0', paddingTop: 12,
  },
  pricingRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingVertical: 8,
  },
  pricingLeft: { flexDirection: 'row', alignItems: 'center', gap: 8 },
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
  chatButton: {
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 999,
    backgroundColor: '#EFF6FF',
    marginBottom: 10,
  },
  chatButtonText: {
    color: '#2563EB',
    fontWeight: '700',
    fontSize: 13,
  },
  cancelButton: { paddingVertical: 10, paddingHorizontal: 20 },
  cancelText: { color: '#FF4444', fontWeight: 'bold', fontSize: 15 },
  paymentLoadingOverlay: {
    marginTop: 16, alignItems: 'center', padding: 16,
    backgroundColor: '#F9FAFB', borderRadius: 12, gap: 8,
  },
  paymentLoadingText: { fontSize: 14, color: Colors.light.primary, fontWeight: '600' },
  vnpayContainer: { alignItems: 'center', paddingVertical: 16, gap: 12 },
  vnpaySubtext: {
    fontSize: 14, color: '#AA2B52', textAlign: 'center', fontWeight: '600',
  },
  vnpayButton: {
    backgroundColor: '#AA2B52',
    paddingVertical: 14,
    paddingHorizontal: 32,
    borderRadius: 16,
    width: '100%',
    alignItems: 'center',
  },
  vnpayButtonText: { color: '#fff', fontSize: 16, fontWeight: '800' },
  vnpayCancelButton: { paddingVertical: 8 },
  vnpayCancelText: { color: '#EF4444', fontSize: 14, fontWeight: '600' },
  cancelledContainer: {
    position: 'absolute',
    left: 16,
    right: 16,
    bottom: 24,
    backgroundColor: '#FFF',
    borderRadius: 20,
    padding: 20,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#FECACA',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.12,
    shadowRadius: 16,
    elevation: 8,
  },
  cancelledTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#991B1B',
    marginBottom: 8,
    textAlign: 'center',
  },
  cancelledSubtext: {
    fontSize: 14,
    lineHeight: 20,
    color: '#6B7280',
    textAlign: 'center',
    marginBottom: 16,
  },
  cancelledButton: {
    width: '100%',
    alignItems: 'center',
    paddingVertical: 13,
    borderRadius: 12,
    marginBottom: 10,
  },
  cancelledButtonText: {
    color: '#FFF',
    fontSize: 15,
    fontWeight: '800',
  },
  cancelledHomeButton: {
    width: '100%',
    alignItems: 'center',
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: '#F3F4F6',
  },
  cancelledHomeButtonText: {
    color: '#374151',
    fontSize: 14,
    fontWeight: '700',
  },
  driverCard: {
    padding: 16,
    backgroundColor: '#F9FAFB',
    borderRadius: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  driverInfoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  driverAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#6366F1',
    justifyContent: 'center',
    alignItems: 'center',
  },
  driverAvatarText: {
    color: '#FFF',
    fontWeight: 'bold',
    fontSize: 14,
  },
  driverDetails: {
    flex: 1,
    marginLeft: 12,
  },
  driverName: {
    fontSize: 15,
    fontWeight: 'bold',
    color: '#1F2937',
  },
  driverVehicle: {
    fontSize: 12,
    color: '#6B7280',
    marginTop: 2,
  },
  driverRating: {
    fontSize: 12,
    color: '#D97706',
    fontWeight: '600',
    marginTop: 2,
  },
  driverActions: {
    flexDirection: 'row',
    gap: 10,
  },
  chatActionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#6366F1',
    paddingVertical: 10,
    borderRadius: 10,
  },
  callActionBtn: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFF',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    paddingVertical: 10,
    borderRadius: 10,
  },
  actionBtnText: {
    color: '#FFF',
    fontWeight: 'bold',
    fontSize: 13,
  },
  callBtnText: {
    color: '#374151',
    fontWeight: 'bold',
    fontSize: 13,
  },
  elapsedText: {
    fontSize: 22, fontWeight: '800', color: '#F59E0B',
    textAlign: 'center', marginBottom: 12, fontVariant: ['tabular-nums'],
  },
  radarMarkerWrap: {
    width: 160,
    height: 160,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
  },
  radarPulse: {
    position: 'absolute',
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#10B981',
  },
  radarSweep: {
    position: 'absolute',
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
  },
  radarSweepArm: {
    width: 2,
    height: 32,
    backgroundColor: 'rgba(16, 185, 129, 0.55)',
    borderRadius: 1,
  },
  pickupDotOuter: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#FFF',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
    borderColor: '#10B981',
  },
  pickupDotInner: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#10B981',
  },
});
