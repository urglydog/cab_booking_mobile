import React, { useEffect, useState } from 'react';
import { StyleSheet, View, Text, TouchableOpacity, ActivityIndicator, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ChevronLeft, MapPin, Navigation } from 'lucide-react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useSocket } from '@/hooks/useSocket';
import { usePayment } from '@/hooks/usePayment';
import { Colors } from '@/constants/Colors';
import api from '@/services/api';
import MapView, { Marker, Polyline } from 'react-native-maps';
import { PaymentService } from '@/services/paymentService';

export default function MatchingScreen() {
  const router = useRouter();
  const { bookingId } = useLocalSearchParams();
  const { socket } = useSocket();
  const { initPayment, startPolling, stopPolling } = usePayment();

  // Status flow per API guide: CREATED → MATCHING → ASSIGNED → ACCEPTED → PICKUP → IN_PROGRESS → COMPLETED → PAID
  const [bookingStatus, setBookingStatus] = useState<string>('CREATED');
  const [bookingInfo, setBookingInfo] = useState<any>(null);
  const [paymentLoading, setPaymentLoading] = useState(false);

  // Route coordinates
  const routeCoordinates = [
    { latitude: 10.8220, longitude: 106.6870 },
    { latitude: 10.8210, longitude: 106.6830 },
    { latitude: 10.8140, longitude: 106.6780 },
    { latitude: 10.8030, longitude: 106.6760 },
    { latitude: 10.7930, longitude: 106.6810 },
    { latitude: 10.7900, longitude: 106.6840 },
    { latitude: 10.7850, longitude: 106.6900 },
    { latitude: 10.7790, longitude: 106.6990 }
  ];

  // Poll booking status every 5s
  React.useEffect(() => {
    if (!bookingId) return;

    const fetchBookingInfo = async () => {
      if (!bookingId) return;
      try {
        let response = await api.get(`/booking/api/v1/bookings/${bookingId}`);
        
        if (response.status === 404) {
          response = await api.get(`/api/v1/bookings/${bookingId}`);
        }
        
        if (response.data?.result) {
          const status = response.data.result.status;
          setBookingInfo(response.data.result);
          setBookingStatus(status);

          // Map backend status to UI status
          if (status === 'MATCHING') {
            setBookingStatus('FINDING');
          } else if (status === 'ASSIGNED' || status === 'ACCEPTED' || status === 'PICKUP') {
            setBookingStatus('FOUND');
          } else if (status === 'IN_PROGRESS') {
            setBookingStatus('STARTED');
          } else if (status === 'COMPLETED') {
            handleRideCompleted(response.data.result);
            return;
          } else if (status === 'PAID' || status === 'CANCELLED') {
            router.replace('/(tabs)/explore');
            return;
          }
        }
      } catch (err: any) {
        if (err.response?.status !== 404) {
          console.log('Could not fetch booking info:', err.response?.status, err.message);
        }
      }
    };

    fetchBookingInfo();
    const interval = setInterval(fetchBookingInfo, 5000);
    return () => clearInterval(interval);
  }, [bookingId]);

  // Socket notifications
  useEffect(() => {
    if (socket && bookingId) {
      console.log('Joining booking room:', bookingId);
      socket.emit('join_room', bookingId);
      return () => {
        console.log('Leaving booking room:', bookingId);
        socket.emit('leave_room', bookingId);
      };
    }
  }, [socket, bookingId]);

  useEffect(() => {
    if (!socket) return;

    const handleNotification = (data: any) => {
      console.log('Matching Screen received notification:', data);
      const backendStatus = data.status || '';

      if (backendStatus === 'MATCHING') {
        setBookingStatus('FINDING');
      } else if (backendStatus === 'ASSIGNED') {
        setBookingStatus('FOUND');
      } else if (backendStatus === 'ACCEPTED' || backendStatus === 'PICKUP') {
        setBookingStatus('ARRIVING');
      } else if (backendStatus === 'IN_PROGRESS') {
        setBookingStatus('STARTED');
      } else if (backendStatus === 'COMPLETED') {
        setBookingStatus('COMPLETED');
        if (bookingInfo) {
          handleRideCompleted({ ...bookingInfo, ...data });
        }
      } else if (backendStatus === 'PAID') {
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

  // Payment flow when ride is COMPLETED
  const handleRideCompleted = async (info?: any) => {
    const booking = info || bookingInfo;
    if (!booking || !bookingId) return;

    const paymentMethod = booking.paymentMethod;
    const amount = booking.estimatedFare || booking.finalFare || booking.amount || 0;

    // CASH: skip online payment
    if (paymentMethod === 'CASH') {
      try {
        await api.post(`/booking/api/v1/bookings/${bookingId}/complete`, {
          paymentStatus: 'SUCCESS',
          paymentMethod: 'CASH'
        });
      } catch (e) {
        console.log('Could not confirm cash payment:', e);
      }
      setBookingStatus('PAID');
      router.replace('/(tabs)/explore');
      return;
    }

    setPaymentLoading(true);
    try {
      const payment = await initPayment({
        bookingId: bookingId as string,
        amount,
        paymentMethod,
      });

      const result = await PaymentService.openPaymentGateway(payment);

      if (result.type === 'QR') {
        router.push({
          pathname: '/(payment)/payment',
          params: {
            transactionId: payment.transactionId,
            bookingId: bookingId as string,
            amount: amount.toString(),
            paymentMethod,
          },
        });
      } else {
        startPolling(payment.transactionId, (paymentStatus) => {
          if (paymentStatus === 'SUCCESS') {
            router.replace({
              pathname: '/(payment)/payment-success',
              params: {
                transactionId: payment.transactionId,
                bookingId: bookingId as string,
              },
            });
          } else if (paymentStatus === 'FAILED_FINAL') {
            router.replace({
              pathname: '/(payment)/payment-failed',
              params: {
                transactionId: payment.transactionId,
                bookingId: bookingId as string,
                reason: 'Thanh toán không thành công sau nhiều lần thử',
              },
            });
          }
        });

        router.push({
          pathname: '/(payment)/payment',
          params: {
            transactionId: payment.transactionId,
            bookingId: bookingId as string,
            amount: amount.toString(),
            paymentMethod,
          },
        });
      }
    } catch (err: any) {
      console.error('Payment init error:', err);
      Alert.alert(
        'Thanh toán thất bại',
        err?.message || 'Không thể khởi tạo thanh toán. Bạn vẫn có thể hoàn thành thanh toán sau.',
        [
          { text: 'Đóng', onPress: () => router.replace('/(tabs)/explore') },
        ]
      );
    } finally {
      setPaymentLoading(false);
    }
  };

  const getStatusText = () => {
    switch (bookingStatus) {
      case 'CREATED': return 'Đang khởi tạo...';
      case 'FINDING': return 'Đang tìm tài xế...';
      case 'FOUND': return 'Đã tìm thấy tài xế';
      case 'ARRIVING': return 'Tài xế đang đến';
      case 'STARTED': return 'Chuyến đi đã bắt đầu';
      case 'COMPLETED': return 'Chuyến đi hoàn thành';
      case 'PAID': return 'Đã thanh toán';
      default: return 'Đang cập nhật...';
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
        <TouchableOpacity
          onPress={() => router.replace('/(tabs)')}
          style={styles.homeButton}
        >
          <Text style={styles.homeButtonText}>Home</Text>
        </TouchableOpacity>
      </View>

      {/* Map */}
      <View style={styles.content}>
        <MapView
          style={styles.map}
          initialRegion={{
            latitude: 10.800,
            longitude: 106.690,
            latitudeDelta: 0.08,
            longitudeDelta: 0.08,
          }}
        >
          {/* Pickup Marker */}
          <Marker
            coordinate={{ latitude: 10.822, longitude: 106.687 }}
            title="Điểm đón"
            description="12 Nguyễn Văn Bảo, Gò Vấp"
            pinColor="#10B981"
          />
          {/* Destination Marker */}
          <Marker
            coordinate={{ latitude: 10.779, longitude: 106.699 }}
            title="Điểm đến"
            description="Nhà thờ Đức Bà, Quận 1"
            pinColor="#EF4444"
          />
          {/* Route Polyline */}
          <Polyline
            coordinates={routeCoordinates}
            strokeColor="#6366F1"
            strokeWidth={4}
          />
        </MapView>

        {/* Status Card */}
        <View style={styles.statusCard}>
          {/* Status Badge */}
          <View style={styles.statusBadge}>
            <ActivityIndicator 
              size="small" 
              color={Colors.light.primary} 
              animating={bookingStatus === 'FINDING' || bookingStatus === 'CREATED'} 
            />
            <Text style={styles.statusText}>{getStatusText()}</Text>
          </View>

          {/* Fare Info */}
          {bookingInfo?.estimatedFare && (
            <View style={styles.fareRow}>
              <Text style={styles.fareLabel}>Cước phí ước tính</Text>
              <Text style={styles.fareValue}>{bookingInfo.estimatedFare.toLocaleString()}đ</Text>
            </View>
          )}

          {/* Payment Method */}
          {bookingInfo?.paymentMethod && (
            <View style={styles.paymentRow}>
              <Text style={styles.fareLabel}>Phương thức</Text>
              <Text style={styles.paymentValue}>{bookingInfo.paymentMethod}</Text>
            </View>
          )}

          {/* Payment Loading */}
          {paymentLoading && (
            <View style={styles.paymentLoadingOverlay}>
              <ActivityIndicator size="large" color="#6366F1" />
              <Text style={styles.paymentLoadingText}>Đang khởi tạo thanh toán...</Text>
            </View>
          )}

          {/* Finding / Cancel State */}
          {(bookingStatus === 'FINDING' || bookingStatus === 'CREATED') && (
            <View style={styles.findingContainer}>
              <Text style={styles.findingSubtext}>Hệ thống đang kết nối bạn với tài xế gần nhất</Text>
              <TouchableOpacity 
                style={styles.cancelButton}
                onPress={async () => {
                  try {
                    await api.post(`/booking/api/v1/bookings/${bookingId}/cancel`);
                    router.replace('/(tabs)/explore');
                  } catch (e) {
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

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 15,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#F2F2F2',
  },
  backButton: {
    padding: 5,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginLeft: 10,
    flex: 1,
  },
  homeButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: '#F0F0F0',
    borderRadius: 15,
  },
  homeButtonText: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#666',
  },
  content: {
    flex: 1,
  },
  map: {
    flex: 1,
  },
  statusCard: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    elevation: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.1,
    shadowRadius: 10,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#EEF2FF',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 12,
    gap: 10,
    marginBottom: 20,
  },
  statusText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#6366F1',
  },
  fareRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: '#F0F0F0',
  },
  fareLabel: {
    fontSize: 14,
    color: '#666',
  },
  fareValue: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#111',
  },
  paymentRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: '#F0F0F0',
  },
  paymentValue: {
    fontSize: 14,
    fontWeight: '600',
    color: '#6366F1',
  },
  findingContainer: {
    alignItems: 'center',
    paddingVertical: 20,
  },
  findingSubtext: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
    marginBottom: 20,
  },
  cancelButton: {
    paddingVertical: 10,
    paddingHorizontal: 20,
  },
  cancelText: {
    color: '#FF4444',
    fontWeight: 'bold',
    fontSize: 15,
  },
  paymentLoadingOverlay: {
    marginTop: 16,
    alignItems: 'center',
    padding: 16,
    backgroundColor: '#F9FAFB',
    borderRadius: 12,
    gap: 8,
  },
  paymentLoadingText: {
    fontSize: 14,
    color: '#6366F1',
    fontWeight: '600',
  },
});
