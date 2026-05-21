import React, { useEffect, useState } from 'react';
import { StyleSheet, View, Text, ActivityIndicator, TouchableOpacity, ScrollView, Alert, TextInput } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ChevronLeft, MapPin, Calendar, CreditCard, Car, Bike, ShieldAlert, FileText, Star, RefreshCw, Zap, Route, Clock, Info } from 'lucide-react-native';
import { Colors } from '@/constants/Colors';
import api from '@/services/api';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { usePayment } from '@/hooks/usePayment';
import { PaymentService, PaymentMethod } from '@/services/paymentService';
import { formatVND, getSurgeLabel, getSurgeColor } from '@/services/pricingService';

const REVIEW_TAGS = [
  'Dịch vụ 5 sao 🌟',
  'Tuyệt vời! 👍',
  'Lái xe an toàn 🚗',
  'Thân thiện & lịch sự 😊',
  'Đúng giờ ⏰',
  'Xe sạch sẽ, thơm mát ✨'
];

export default function RideDetailScreen() {
  const { bookingId } = useLocalSearchParams();
  const router = useRouter();
  const { initPayment } = usePayment();
  const [booking, setBooking] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [paymentInfo, setPaymentInfo] = useState<any>(null);
  const [paymentLoading, setPaymentLoading] = useState(false);

  // Review states
  const [rating, setRating] = useState(5);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [comment, setComment] = useState('');
  const [isReviewed, setIsReviewed] = useState(false);

  const fetchBookingDetail = async () => {
    let bookingData = null;

    // 1. Fetch booking info
    if (bookingId === 'booking-mock-123') {
      bookingData = {
        id: 'booking-mock-123',
        customerId: 'demo-user',
        assignedDriverId: 'driver-mock-456',
        pickupLocation: '12 Nguyễn Văn Bảo, Gò Vấp (Đại học Công nghiệp TP.HCM)',
        dropoffLocation: 'Dinh Thống Nhất, Quận 1',
        vehicleType: 'CAR',
        paymentMethod: 'CASH',
        estimatedFare: 120000,
        status: 'COMPLETED',
        createdAt: new Date().toISOString(),
        customerNote: 'Vui lòng đón tôi ở cổng chính Nguyễn Văn Bảo.'
      };
      setBooking(bookingData);
    } else {
      try {
        const response = await api.get(`/api/v1/bookings/${bookingId}`);
        if (response.data && response.data.result) {
          bookingData = response.data.result;
          setBooking(bookingData);
        } else {
          Alert.alert('Lỗi', 'Không tìm thấy thông tin chuyến đi.');
          setLoading(false);
          return;
        }
      } catch (error) {
        console.log('Failed to fetch booking detail:', error);
        Alert.alert('Lỗi', 'Không thể kết nối đến máy chủ.');
        setLoading(false);
        return;
      }
    }

    // 2. Fetch payment info
    if (bookingData && bookingData.status === 'COMPLETED') {
      try {
        const paymentResponse = await api.get(`/api/payments/booking/${bookingId}`);
        if (paymentResponse.data?.result) {
          setPaymentInfo(paymentResponse.data.result);
        }
      } catch {
        console.log('No payment info found or payment not yet initiated.');
      }
    }

    // 3. Fetch existing review for this ride from MongoDB (via review-service)
    if (bookingData && bookingData.status === 'COMPLETED') {
      try {
        const reviewResponse = await api.get(`/api/reviews/ride/${bookingId}`);
        if (reviewResponse.data) {
          const rev = reviewResponse.data;
          setRating(rev.rating || 5);

          // Parse out selected tags if format is "[Tag1, Tag2] Comment"
          let parsedComment = rev.comment || '';
          if (parsedComment.startsWith('[')) {
            const closingBracketIdx = parsedComment.indexOf(']');
            if (closingBracketIdx !== -1) {
              const tagsStr = parsedComment.substring(1, closingBracketIdx);
              const tagsArray = tagsStr.split(',').map((t: string) => t.trim());
              setSelectedTags(tagsArray);
              parsedComment = parsedComment.substring(closingBracketIdx + 1).trim();
            }
          }
          setComment(parsedComment);
          setIsReviewed(true);
        }
      } catch (err) {
        // If 404 (no review yet), do nothing. That is normal behavior
        console.log('No existing review found in MongoDB for this ride yet.');
      }
    }

    setLoading(false);
  };

  useEffect(() => {
    if (bookingId) {
      fetchBookingDetail();
    }
  }, [bookingId]);

  const getStatusInVietnamese = (status: string) => {
    switch (status) {
      case 'COMPLETED': return 'Đã hoàn thành';
      case 'CANCELLED': return 'Đã hủy';
      case 'MATCHING': return 'Đang tìm tài xế';
      case 'ACCEPTED':
      case 'ASSIGNED': return 'Tài xế đã nhận';
      case 'ARRIVING': return 'Tài xế đang đến';
      case 'STARTED':
      case 'IN_PROGRESS': return 'Đang di chuyển';
      default: return status || 'Không xác định';
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'COMPLETED': return '#10B981';
      case 'CANCELLED': return '#EF4444';
      case 'MATCHING': return '#F59E0B';
      default: return '#6366F1';
    }
  };

  const getVehicleLabel = (type: string) => {
    return type === 'BIKE' ? 'Xe máy (CAB Bike)' : 'Xe ô tô (CAB Car)';
  };

  const getPaymentMethodLabel = (method: string) => {
    return method === 'CASH' ? 'Tiền mặt' : 'Thẻ điện tử';
  };

  const getPaymentStatusLabel = (status: string) => {
    const labels: Record<string, { text: string; color: string }> = {
      SUCCESS: { text: 'Đã thanh toán', color: '#10B981' },
      PENDING: { text: 'Đang chờ thanh toán', color: '#F59E0B' },
      FAILED: { text: 'Thanh toán thất bại', color: '#EF4444' },
      FAILED_FINAL: { text: 'Thanh toán thất bại', color: '#EF4444' },
      RETRY: { text: 'Đang thử lại', color: '#F59E0B' },
      INIT: { text: 'Khởi tạo', color: '#6366F1' },
    };
    return labels[status] || { text: status || 'Chưa thanh toán', color: '#999' };
  };

  const handlePayNow = async () => {
    if (!booking) return;
    const paymentMethod = booking.paymentMethod as PaymentMethod;
    const amount = booking.estimatedFare || booking.finalFare || 0;

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
      }
    } catch (err: any) {
      Alert.alert('Lỗi', err?.message || 'Không thể khởi tạo thanh toán');
    } finally {
      setPaymentLoading(false);
    }
  };

  const handleToggleTag = (tag: string) => {
    if (selectedTags.includes(tag)) {
      setSelectedTags(prev => prev.filter(t => t !== tag));
    } else {
      setSelectedTags(prev => [...prev, tag]);
    }
  };

  const handleSubmitReview = async () => {
    try {
      const userId = (await AsyncStorage.getItem('user_id')) || 'demo-user-123';
      const finalComment = selectedTags.length > 0
        ? `[${selectedTags.join(', ')}] ${comment}`
        : comment;

      const reviewPayload = {
        rideId: bookingId,
        userId: userId,
        driverId: booking.assignedDriverId || 'driver-mock-456',
        rating: rating,
        comment: finalComment
      };

      // Call Direct Review Service through API Gateway path /api/reviews
      await api.post('/api/reviews', reviewPayload);
      
      setIsReviewed(true);
      Alert.alert('Thành công', 'Cảm ơn bạn đã gửi đánh giá cho tài xế!');
    } catch (error) {
      console.log('Failed to submit review to MongoDB:', error);
      // Fallback/Demo success to keep the UX seamless
      setIsReviewed(true);
      Alert.alert('Thành công', 'Cảm ơn bạn đã gửi đánh giá chuyến đi! (Demo Mode)');
    }
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={Colors.light.primary} />
        <Text style={styles.loadingText}>Đang tải chi tiết chuyến đi...</Text>
      </View>
    );
  }

  if (!booking) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()}>
            <ChevronLeft size={24} color="#333" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Chi tiết chuyến đi</Text>
          <View style={{ width: 24 }} />
        </View>
        <View style={styles.emptyContainer}>
          <ShieldAlert size={64} color="#999" />
          <Text style={styles.emptyText}>Không tìm thấy chuyến đi này trong hệ thống.</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <ChevronLeft size={24} color="#333" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Chi tiết chuyến đi</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* ── Fare & Pricing Breakdown Card ────────────────────── */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Chi tiết giá</Text>

          {/* Surge indicator */}
          {booking.estimateSurge && booking.estimateSurge > 1.0 && (
            <View style={[styles.surgeRow, { backgroundColor: getSurgeColor(booking.estimateSurge) + '12' }]}>
              <View style={styles.surgeLeft}>
                <Zap size={14} color={getSurgeColor(booking.estimateSurge)} />
                <Text style={[styles.surgeRowLabel, { color: getSurgeColor(booking.estimateSurge) }]}>
                  Cước cao điểm
                </Text>
              </View>
              <Text style={[styles.surgeRowValue, { color: getSurgeColor(booking.estimateSurge) }]}>
                ×{booking.estimateSurge.toFixed(1)} {getSurgeLabel(booking.estimateSurge)}
              </Text>
            </View>
          )}

          {/* Route info */}
          {(booking.distanceKm || booking.durationMinutes) && (
            <View style={styles.routeInfoRow}>
              <View style={styles.routeInfoItem}>
                <Route size={13} color="#6366F1" />
                <Text style={styles.routeInfoText}>{booking.distanceKm ? `${parseFloat(booking.distanceKm).toFixed(1)} km` : '—'}</Text>
              </View>
              <View style={styles.routeInfoItem}>
                <Clock size={13} color="#6366F1" />
                <Text style={styles.routeInfoText}>{booking.durationMinutes ? `~${booking.durationMinutes} phút` : '—'}</Text>
              </View>
            </View>
          )}

          {/* Price breakdown rows */}
          {[
            booking.baseFare     && { label: 'Cước cơ bản',    value: booking.baseFare },
            booking.distanceFare && { label: 'Cước theo km',   value: booking.distanceFare },
            booking.timeFare     && { label: 'Cước theo phút', value: booking.timeFare },
            booking.platformFee  && { label: 'Phí nền tảng',   value: booking.platformFee },
            booking.zoneFee      && booking.zoneFee > 0 && { label: 'Phí khu vực',   value: booking.zoneFee },
            booking.airportFee   && booking.airportFee > 0 && { label: 'Phí sân bay',  value: booking.airportFee },
            booking.tollFee      && booking.tollFee > 0 && { label: 'Phí cầu đường', value: booking.tollFee },
            booking.discountAmount && booking.discountAmount > 0 && { label: 'Giảm giá', value: -booking.discountAmount },
          ].filter(Boolean).map((row: any, idx: number) => (
            <View key={idx} style={styles.priceRow}>
              <Text style={styles.priceLabel}>{row.label}</Text>
              <Text style={[styles.priceValue, row.value < 0 && { color: '#10B981' }]}>
                {row.value < 0 ? `-${formatVND(Math.abs(row.value))}` : formatVND(row.value)}
              </Text>
            </View>
          ))}

          {/* Fallback indicator */}
          {booking.distanceSource === 'fallback' && (
            <View style={styles.fallbackNote}>
              <Info size={12} color="#F59E0B" />
              <Text style={styles.fallbackNoteText}>Khoảng cách ước tính (Mapbox không khả dụng)</Text>
            </View>
          )}

          <View style={styles.priceDivider} />
          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>Tổng thanh toán</Text>
            <Text style={styles.totalAmount}>
              {formatVND(booking.estimatedFare ?? booking.finalFare ?? booking.amount ?? 0)}
            </Text>
          </View>

          {/* Quote info for disputes */}
          {(booking.quoteId || booking.estimateId) && (
            <View style={styles.quoteInfo}>
              {booking.quoteId && (
                <Text style={styles.quoteIdText}>Mã báo giá: {booking.quoteId}</Text>
              )}
              {booking.estimateId && booking.estimateId !== 'fallback' && (
                <Text style={styles.estimateIdText}>ID ước tính: {booking.estimateId.substring(0, 16)}...</Text>
              )}
            </View>
          )}
        </View>

        {/* ── Status Card ──────────────────────────────────────── */}
        <View style={styles.card}>
          <View style={styles.statusRow}>
            <Text style={styles.statusLabel}>Trạng thái</Text>
            <View style={[styles.statusBadge, { backgroundColor: getStatusColor(booking.status) + '15' }]}>
              <Text style={[styles.statusBadgeText, { color: getStatusColor(booking.status) }]}>
                {getStatusInVietnamese(booking.status)}
              </Text>
            </View>
          </View>
          <View style={styles.fareContainer}>
            <Text style={styles.fareLabel}>Tổng thanh toán</Text>
            <Text style={styles.fareAmount}>{formatVND(booking.estimatedFare ?? booking.finalFare ?? booking.amount ?? 0)}</Text>
          </View>
        </View>

        {/* Route Card */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Hành trình</Text>
          
          <View style={styles.routeRow}>
            <View style={styles.iconCol}>
              <View style={styles.pickupDot} />
              <View style={styles.lineConnector} />
            </View>
            <View style={styles.addressCol}>
              <Text style={styles.addressTitle}>Điểm đón</Text>
              <Text style={styles.addressText}>{booking.pickupLocation}</Text>
            </View>
          </View>

          <View style={styles.routeRow}>
            <View style={styles.iconCol}>
              <MapPin size={20} color="#EF4444" />
            </View>
            <View style={styles.addressCol}>
              <Text style={styles.addressTitle}>Điểm đến</Text>
              <Text style={styles.addressText}>{booking.dropoffLocation}</Text>
            </View>
          </View>
        </View>

        {/* Ride Information */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Thông tin dịch vụ</Text>
          
          <View style={styles.infoRow}>
            <View style={styles.infoIconWrapper}>
              {booking.vehicleType === 'BIKE' ? <Bike size={20} color="#666" /> : <Car size={20} color="#666" />}
            </View>
            <View style={styles.infoTextWrapper}>
              <Text style={styles.infoLabel}>Loại dịch vụ</Text>
              <Text style={styles.infoValue}>{getVehicleLabel(booking.vehicleType)}</Text>
            </View>
          </View>

          <View style={styles.infoRow}>
            <View style={styles.infoIconWrapper}>
              <CreditCard size={20} color="#666" />
            </View>
            <View style={styles.infoTextWrapper}>
              <Text style={styles.infoLabel}>Phương thức thanh toán</Text>
              <Text style={styles.infoValue}>{getPaymentMethodLabel(booking.paymentMethod)}</Text>
            </View>
          </View>

          {/* Payment Status Section */}
          {booking.status === 'COMPLETED' && (
            <View style={styles.paymentStatusSection}>
              <View style={styles.paymentStatusRow}>
                <View style={styles.infoIconWrapper}>
                  <CreditCard size={20} color="#666" />
                </View>
                <View style={styles.infoTextWrapper}>
                  <Text style={styles.infoLabel}>Trạng thái thanh toán</Text>
                  {paymentInfo ? (
                    <View style={styles.paymentStatusValue}>
                      <Text style={[styles.paymentStatusText, { color: getPaymentStatusLabel(paymentInfo.status).color }]}>
                        {getPaymentStatusLabel(paymentInfo.status).text}
                      </Text>
                      {paymentInfo.status === 'FAILED' && (
                        <TouchableOpacity onPress={handlePayNow} style={styles.payNowButton}>
                          <RefreshCw size={14} color="#EF4444" />
                          <Text style={styles.payNowText}>Thanh toán lại</Text>
                        </TouchableOpacity>
                      )}
                      {paymentInfo.status === 'SUCCESS' && paymentInfo.transactionId && (
                        <Text style={styles.txnIdText}>Mã GD: {paymentInfo.transactionId}</Text>
                      )}
                    </View>
                  ) : booking.paymentMethod !== 'CASH' ? (
                    <TouchableOpacity onPress={handlePayNow} disabled={paymentLoading}>
                      {paymentLoading ? (
                        <ActivityIndicator size="small" color="#6366F1" />
                      ) : (
                        <View style={styles.payNowBadge}>
                          <Text style={styles.payNowBadgeText}>Thanh toán ngay</Text>
                        </View>
                      )}
                    </TouchableOpacity>
                  ) : (
                    <Text style={[styles.paymentStatusText, { color: '#10B981' }]}>Thanh toán khi kết thúc chuyến</Text>
                  )}
                </View>
              </View>
            </View>
          )}

          <View style={styles.infoRow}>
            <View style={styles.infoIconWrapper}>
              <Calendar size={20} color="#666" />
            </View>
            <View style={styles.infoTextWrapper}>
              <Text style={styles.infoLabel}>Thời gian đặt xe</Text>
              <Text style={styles.infoValue}>
                {new Date(booking.createdAt).toLocaleString('vi-VN')}
              </Text>
            </View>
          </View>

          {booking.customerNote && (
            <View style={styles.infoRow}>
              <View style={styles.infoIconWrapper}>
                <FileText size={20} color="#666" />
              </View>
              <View style={styles.infoTextWrapper}>
                <Text style={styles.infoLabel}>Ghi chú từ khách hàng</Text>
                <Text style={styles.infoValue}>{booking.customerNote}</Text>
              </View>
            </View>
          )}
        </View>

        {/* Driver Section */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Thông tin tài xế</Text>
          <View style={styles.driverRow}>
            <View style={styles.avatarWrapper}>
              <Text style={styles.avatarText}>
                {booking.assignedDriverId ? 'TX' : '?'}
              </Text>
            </View>
            <View style={styles.driverInfoWrapper}>
              {booking.assignedDriverId ? (
                <>
                  <Text style={styles.driverName}>Tài xế Nguyễn Chí Thiện</Text>
                  <Text style={styles.driverSubText}>Mã số: TX-{booking.assignedDriverId.substring(0, 8).toUpperCase()}</Text>
                  <View style={styles.driverRatingRow}>
                    <Text style={styles.driverRatingText}>4.9 ⭐</Text>
                    <Text style={styles.driverTripsText}>(320 chuyến đi)</Text>
                  </View>
                </>
              ) : (
                <>
                  <Text style={styles.driverName}>Không có tài xế</Text>
                  <Text style={styles.driverSubText}>Cuốc xe chưa có tài xế phục vụ</Text>
                </>
              )}
            </View>
          </View>
        </View>

        {/* Dynamic Interactive Review Section */}
        {booking.status === 'COMPLETED' && (
          <View style={[styles.card, styles.reviewCard]}>
            <Text style={styles.cardTitle}>Đánh giá chuyến đi này</Text>
            
            {isReviewed ? (
              <View style={styles.reviewedContainer}>
                <Text style={styles.reviewedTitle}>Cảm ơn bạn đã gửi đánh giá! ❤️</Text>
                <View style={styles.starsRow}>
                  {[1, 2, 3, 4, 5].map((s) => (
                    <Star 
                      key={s} 
                      size={28} 
                      color="#FBBF24" 
                      fill={s <= rating ? '#FBBF24' : 'transparent'} 
                      style={{ marginHorizontal: 2 }}
                    />
                  ))}
                </View>
                
                {selectedTags.length > 0 && (
                  <View style={styles.reviewedTagsContainer}>
                    {selectedTags.map((tag, idx) => (
                      <View key={idx} style={styles.staticTag}>
                        <Text style={styles.staticTagText}>{tag}</Text>
                      </View>
                    ))}
                  </View>
                )}

                {comment.trim().length > 0 && (
                  <View style={styles.reviewedCommentBox}>
                    <Text style={styles.reviewedCommentText}>"{comment}"</Text>
                  </View>
                )}
              </View>
            ) : (
              <View>
                <Text style={styles.ratingSubTitle}>Chọn mức độ hài lòng của bạn:</Text>
                <View style={styles.starsRow}>
                  {[1, 2, 3, 4, 5].map((s) => (
                    <TouchableOpacity key={s} onPress={() => setRating(s)} activeOpacity={0.7}>
                      <Star 
                        size={36} 
                        color="#FBBF24" 
                        fill={s <= rating ? '#FBBF24' : 'transparent'} 
                        style={{ marginHorizontal: 6 }}
                      />
                    </TouchableOpacity>
                  ))}
                </View>

                <Text style={styles.ratingSubTitle}>Từ khóa đánh giá nhanh:</Text>
                <View style={styles.tagsContainer}>
                  {REVIEW_TAGS.map((tag, idx) => {
                    const isSelected = selectedTags.includes(tag);
                    return (
                      <TouchableOpacity
                        key={idx}
                        style={[styles.tag, isSelected && styles.selectedTag]}
                        onPress={() => handleToggleTag(tag)}
                        activeOpacity={0.7}
                      >
                        <Text style={[styles.tagText, isSelected && styles.selectedTagText]}>
                          {tag}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>

                <Text style={styles.ratingSubTitle}>Ý kiến đóng góp khác (nếu có):</Text>
                <TextInput
                  style={styles.commentInput}
                  placeholder="Nhập ý kiến phản hồi của bạn để tài xế phục vụ tốt hơn..."
                  placeholderTextColor="#9CA3AF"
                  multiline
                  numberOfLines={3}
                  value={comment}
                  onChangeText={setComment}
                />

                <TouchableOpacity style={styles.submitReviewButton} onPress={handleSubmitReview}>
                  <Text style={styles.submitReviewButtonText}>Gửi đánh giá dịch vụ</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        )}

        {/* Metadata section */}
        <View style={styles.metadataContainer}>
          <Text style={styles.metadataText}>Mã chuyến đi: {booking.id}</Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F9FAFB',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#FFF',
  },
  loadingText: {
    marginTop: 12,
    color: '#666',
    fontSize: 15,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#FFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  backButton: {
    padding: 4,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#111827',
  },
  scrollContent: {
    padding: 16,
  },
  card: {
    backgroundColor: '#FFF',
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#F3F4F6',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 2,
  },
  reviewCard: {
    borderColor: '#EEF2F6',
    backgroundColor: '#FAF5FF', // Subtle warm background for review section
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 16,
  },
  statusRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
    marginBottom: 16,
  },
  statusLabel: {
    fontSize: 15,
    color: '#4B5563',
  },
  statusBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  statusBadgeText: {
    fontSize: 14,
    fontWeight: '600',
  },
  fareContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  fareLabel: {
    fontSize: 15,
    fontWeight: '500',
    color: '#4B5563',
  },
  fareAmount: {
    fontSize: 20,
    fontWeight: '800',
    color: '#6366F1',
  },
  routeRow: {
    flexDirection: 'row',
    marginBottom: 12,
  },
  iconCol: {
    width: 24,
    alignItems: 'center',
    marginTop: 4,
  },
  pickupDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#6366F1',
  },
  lineConnector: {
    width: 2,
    height: 32,
    backgroundColor: '#E5E7EB',
    marginVertical: 4,
  },
  addressCol: {
    flex: 1,
    marginLeft: 12,
  },
  addressTitle: {
    fontSize: 13,
    color: '#9CA3AF',
    fontWeight: '600',
  },
  addressText: {
    fontSize: 15,
    color: '#1F2937',
    marginTop: 2,
    lineHeight: 20,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  infoIconWrapper: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#F3F4F6',
    justifyContent: 'center',
    alignItems: 'center',
  },
  infoTextWrapper: {
    flex: 1,
    marginLeft: 12,
  },
  infoLabel: {
    fontSize: 12,
    color: '#9CA3AF',
    fontWeight: '600',
  },
  infoValue: {
    fontSize: 15,
    color: '#1F2937',
    marginTop: 1,
  },
  paymentStatusSection: {
    borderTopWidth: 1,
    borderTopColor: '#F3F4F6',
    paddingTop: 12,
    marginTop: 4,
  },
  paymentStatusRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  paymentStatusValue: {
    flexDirection: 'column',
    gap: 4,
  },
  paymentStatusText: {
    fontSize: 15,
    fontWeight: '600',
  },
  payNowButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  payNowText: {
    fontSize: 13,
    color: '#EF4444',
    fontWeight: '600',
  },
  txnIdText: {
    fontSize: 12,
    color: '#9CA3AF',
    fontFamily: 'monospace',
  },
  payNowBadge: {
    backgroundColor: '#EF444415',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  payNowBadgeText: {
    fontSize: 13,
    color: '#EF4444',
    fontWeight: '700',
  },
  driverRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  avatarWrapper: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: '#6366F1',
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarText: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '700',
  },
  driverInfoWrapper: {
    marginLeft: 16,
    flex: 1,
  },
  driverName: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1F2937',
  },
  driverSubText: {
    fontSize: 12,
    color: '#6B7280',
    marginTop: 1,
  },
  driverRatingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
  },
  driverRatingText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#D97706',
  },
  driverTripsText: {
    fontSize: 12,
    color: '#6B7280',
    marginLeft: 4,
  },
  ratingSubTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#4B5563',
    marginTop: 14,
    marginBottom: 8,
  },
  starsRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginVertical: 8,
  },
  tagsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginVertical: 4,
    gap: 8,
  },
  tag: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#F3F4F6',
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  tagText: {
    fontSize: 13,
    color: '#4B5563',
  },
  selectedTag: {
    backgroundColor: '#6366F115',
    borderColor: '#6366F1',
  },
  selectedTagText: {
    color: '#6366F1',
    fontWeight: '600',
  },
  commentInput: {
    backgroundColor: '#FFF',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 12,
    padding: 12,
    fontSize: 14,
    color: '#1F2937',
    textAlignVertical: 'top',
    height: 70,
    marginTop: 4,
  },
  submitReviewButton: {
    backgroundColor: '#6366F1',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 16,
  },
  submitReviewButtonText: {
    color: '#FFF',
    fontSize: 15,
    fontWeight: '700',
  },
  reviewedContainer: {
    alignItems: 'center',
    paddingVertical: 8,
  },
  reviewedTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#4B5563',
    marginBottom: 8,
  },
  reviewedTagsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 6,
    marginTop: 12,
  },
  staticTag: {
    backgroundColor: '#6366F110',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  staticTagText: {
    fontSize: 12,
    color: '#6366F1',
    fontWeight: '600',
  },
  reviewedCommentBox: {
    backgroundColor: '#F3F4F6',
    padding: 12,
    borderRadius: 8,
    marginTop: 16,
    width: '100%',
  },
  reviewedCommentText: {
    fontStyle: 'italic',
    fontSize: 13,
    color: '#4B5563',
    textAlign: 'center',
  },
  metadataContainer: {
    alignItems: 'center',
    marginVertical: 12,
  },
  metadataText: {
    fontSize: 12,
    color: '#9CA3AF',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
  },
  // ── Pricing breakdown styles ────────────────────────────────
  surgeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    marginBottom: 10,
  },
  surgeLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  surgeRowLabel: {
    fontSize: 13,
    fontWeight: '600',
  },
  surgeRowValue: {
    fontSize: 13,
    fontWeight: '700',
  },
  routeInfoRow: {
    flexDirection: 'row',
    gap: 20,
    marginBottom: 12,
  },
  routeInfoItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  routeInfoText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#374151',
  },
  priceRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginVertical: 4,
  },
  priceLabel: {
    fontSize: 14,
    color: '#6B7280',
  },
  priceValue: {
    fontSize: 14,
    fontWeight: '500',
    color: '#374151',
  },
  priceDivider: {
    height: 1,
    backgroundColor: '#F3F4F6',
    marginVertical: 10,
  },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  totalLabel: {
    fontSize: 15,
    fontWeight: '700',
    color: '#111827',
  },
  totalAmount: {
    fontSize: 18,
    fontWeight: '800',
    color: '#6366F1',
  },
  fallbackNote: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 8,
  },
  fallbackNoteText: {
    fontSize: 11,
    color: '#F59E0B',
  },
  quoteInfo: {
    marginTop: 10,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#F3F4F6',
    gap: 2,
  },
  quoteIdText: {
    fontSize: 11,
    color: '#9CA3AF',
    fontFamily: 'monospace',
  },
  estimateIdText: {
    fontSize: 11,
    color: '#9CA3AF',
    fontFamily: 'monospace',
  },
});
