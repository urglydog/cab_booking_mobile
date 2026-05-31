import React, { useState, useEffect, useRef } from 'react';
import { StyleSheet, View, Text, ScrollView, TouchableOpacity, Animated, Easing, Platform, Modal, Alert, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Search, Car, Bell, MapPin, ChevronRight, History, Sparkles, MessageSquare, X, Phone } from 'lucide-react-native';
import { Colors } from '@/constants/Colors';
import { useRouter, useFocusEffect } from 'expo-router';
import { useSocket } from '@/hooks/useSocket';
import api from '@/services/api';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { buildDriverDisplayInfo, DriverDisplayInfo } from '@/services/driverService';

/**
 * Valid BookingStatus enum values from backend.
 * Source: booking-service/.../enums/BookingStatus.java
 */
const BOOKING_STATUS_SET = new Set([
  'CREATED', 'PENDING_PAYMENT', 'MATCHING', 'ASSIGNED',
  'ACCEPTED', 'PICKUP', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED',
]);

/**
 * Check if a booking status is a valid BookingStatus enum value.
 * Only accepts valid BookingStatus values — no Vietnamese text parsing.
 */
const isValidBookingStatus = (status: string) => BOOKING_STATUS_SET.has(status);

const formatVND = (num: number) => {
  return (num || 0).toLocaleString('vi-VN') + 'đ';
};

const translateNotificationMessage = (message: string) => {
  if (!message) return '';
  if (message.includes('Your ride has been cancelled') || message.includes('cancelled') || message.includes('bị hủy')) {
    const parts = message.split(/Reason:\s*|Lý do:\s*/i);
    let reason = parts[1] || '';
    
    // Clean up reason by removing leading dashes, numbers, dots, spaces
    reason = reason.replace(/^[-\s\d\.\:]+/, '').trim();
    
    let viReason = reason;
    const lowerReason = reason.toLowerCase();
    if (lowerReason.includes('customer requested cancellation') || lowerReason.includes('customer requested') || lowerReason.includes('khách hàng yêu cầu') || lowerReason.includes('customer_cancelled')) {
      viReason = 'Khách hàng yêu cầu hủy';
    } else if (lowerReason.includes('not specified') || !reason) {
      viReason = 'Không xác định';
    } else {
      viReason = 'Tài xế đã hủy chuyến đi';
    }
    return `Chuyến đi của bạn đã bị hủy. Lý do: ${viReason}`;
  }
  if (message.includes('Finding the nearest driver') || message.includes('finding') || message.includes('tìm tài xế')) {
    return 'Đang tìm tài xế gần nhất cho bạn...';
  }
  if (message.includes('Driver has arrived') || message.includes('arrived') || (message.includes('đến điểm đón') && !message.includes('đang đến'))) {
    return 'Tài xế đã đến điểm đón!';
  }
  if (message.includes('Ride completed') || message.includes('finished') || message.includes('hoàn thành')) {
    return 'Chuyến đi đã hoàn thành. Cảm ơn bạn!';
  }
  if (message.includes('Driver accepted') || message.includes('accepted') || message.includes('nhận chuyến')) {
    return 'Tài xế đã nhận chuyến xe của bạn!';
  }
  if (message.includes('Ride started') || message.includes('started') || message.includes('bắt đầu')) {
    return 'Chuyến đi của bạn đã bắt đầu!';
  }
  return message;
};

const BANNER_PROMOS = [
  { id: '1', title: 'Ưu đãi CABNEW 🎉', desc: 'Giảm ngay 30k cho bạn mới!', code: 'CABNEW', bg: '#4F46E5' },
  { id: '2', title: 'Ngày Nắng Rạng Rỡ ☀️', desc: 'CAB Ngày nắng giảm 15k mọi chuyến!', code: 'CABSUMMER', bg: '#DB2777' },
  { id: '3', title: 'Đẳng Cấp Thượng Lưu 👑', desc: 'CAB VIP tri ân giảm tới 50k!', code: 'CABVIP', bg: '#7C3AED' }
];

const AI_SUGGESTIONS = [
  '🗣️ Đặt xe bằng giọng nói rảnh tay?',
  '📍 Tìm đường ngắn nhất đến Landmark 81?',
  '☕ Gợi ý quán cafe đẹp tại Gò Vấp?',
  '⛈️ Đi tránh kẹt xe giờ cao điểm thế nào?'
];

export default function HomeScreen() {
  const router = useRouter();
  const { socket, unreadCount, setUnreadCount } = useSocket();
  const [latestNotification, setLatestNotification] = useState('Chào mừng bạn đến với CAB Booking! Hãy đặt chuyến xe đầu tiên.');
  const [recentBookings, setRecentBookings] = useState<any[]>([]);
  const [showTrackingModal, setShowTrackingModal] = useState(false);

  // Promo Carousel State & Animation
  const [currentPromoIdx, setCurrentPromoIdx] = useState(0);
  const fadeAnim = useRef(new Animated.Value(1)).current;

  // AI Suggestion State & Floating Animations
  const [suggestionIdx, setSuggestionIdx] = useState(0);
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const bubbleYAnim = useRef(new Animated.Value(0)).current;

  // Automatically refresh when Home tab comes into focus
  useFocusEffect(
    React.useCallback(() => {
      fetchDashboardData();
    }, [])
  );

  const fetchDashboardData = async () => {
    try {
      const userId = await AsyncStorage.getItem('user_id');
      if (!userId) return;

      // Fetch Notifications
      api.get(`/api/notifications/user/${userId}?page=0&size=1`).then(response => {
        const content = response.data?.content || response.data?.result?.content;
        if (content && content.length > 0) {
          setLatestNotification(translateNotificationMessage(content[0].message));
          const unread = content.filter((n: any) => n.status !== 'READ' && !n.isRead).length;
          if (unread > 0) setUnreadCount(unread);
        }
      }).catch(err => console.log('Failed to fetch notifications:', err));

      // Fetch Recent Bookings
      api.get(`/api/v1/bookings/customer/${userId}?page=0&size=5`).then(response => {
        if (response.data && response.data.result) {
          setRecentBookings(response.data.result.content || []);
        }
      }).catch(err => console.log('Failed to fetch recent bookings:', err));
      
    } catch (error) {
      console.log('Dashboard fetch error:', error);
    }
  };

  useEffect(() => {
    fetchDashboardData();

    if (socket) {
      const handleUpdate = (data: any) => {
        setLatestNotification(translateNotificationMessage(data?.message || data?.title || 'Cập nhật mới cho chuyến đi của bạn!'));
        fetchDashboardData();
      };

      socket.on('new_notification', handleUpdate);
      socket.on('receive_message', (data: any) => {
        if (data?.bookingId) {
          fetchDashboardData();
        }
      });
    }

    // Auto Play Promos Banner (Fade in/out)
    const bannerTimer = setInterval(() => {
      Animated.timing(fadeAnim, {
        toValue: 0,
        duration: 400,
        useNativeDriver: true,
      }).start(() => {
        setCurrentPromoIdx((prev) => (prev + 1) % BANNER_PROMOS.length);
        Animated.timing(fadeAnim, {
          toValue: 1,
          duration: 400,
          useNativeDriver: true,
        }).start();
      });
    }, 4500);

    // Auto Switch AI Suggestion Tooltip
    const suggestionTimer = setInterval(() => {
      setSuggestionIdx((prev) => (prev + 1) % AI_SUGGESTIONS.length);
    }, 5000);

    // Floating AI Bubble Idle Animation (Looping Pulsing & Bobbing)
    Animated.loop(
      Animated.parallel([
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue: 1.1,
            duration: 1500,
            easing: Easing.easeInOut,
            useNativeDriver: true,
          }),
          Animated.timing(pulseAnim, {
            toValue: 1.0,
            duration: 1500,
            easing: Easing.easeInOut,
            useNativeDriver: true,
          }),
        ]),
        Animated.sequence([
          Animated.timing(bubbleYAnim, {
            toValue: -8,
            duration: 1500,
            easing: Easing.easeInOut,
            useNativeDriver: true,
          }),
          Animated.timing(bubbleYAnim, {
            toValue: 0,
            duration: 1500,
            easing: Easing.easeInOut,
            useNativeDriver: true,
          }),
        ]),
      ])
    ).start();

    return () => {
      if (socket) {
        socket.off('new_notification');
        socket.off('receive_message');
      }
      clearInterval(bannerTimer);
      clearInterval(suggestionTimer);
    };
  }, [socket]);

  const getStatusInVietnamese = (status: string) => {
    switch (status) {
      case 'COMPLETED': return 'đã hoàn thành';
      case 'CANCELLED': return 'đã hủy';
      case 'CREATED': return 'đang khởi tạo';
      case 'PENDING_PAYMENT': return 'chờ thanh toán';
      case 'MATCHING': return 'đang tìm tài xế';
      case 'ACCEPTED':
      case 'ASSIGNED': return 'đã nhận chuyến';
      case 'ARRIVING': return 'tài xế đang đến';
      case 'STARTED':
      case 'IN_PROGRESS': return 'đang di chuyển';
      default: return status.toLowerCase();
    }
  };

  const currentPromo = BANNER_PROMOS[currentPromoIdx];

  // Detect if the user has an active (in-progress) booking
  const ACTIVE_STATUSES = ['CREATED', 'PENDING_PAYMENT', 'MATCHING', 'ACCEPTED', 'ASSIGNED', 'ARRIVING', 'STARTED', 'IN_PROGRESS', 'PICKUP'];
  const latestBooking = recentBookings.find((b: any) => ACTIVE_STATUSES.includes(b.status));
  const isActive = !!latestBooking;

  // Build driver display info from active booking (safe fallback — no backend endpoint for passenger)
  const driverDisplayInfo: DriverDisplayInfo | null = latestBooking
    ? buildDriverDisplayInfo(latestBooking.assignedDriverId)
    : null;

  // ── Poll active booking while visible ──────────────────────
  useEffect(() => {
    if (!isActive) return;

    const interval = setInterval(() => {
      fetchDashboardData();
    }, 5000);

    return () => clearInterval(interval);
  }, [isActive]);

  return (
    <SafeAreaView style={styles.container}>
      <View style={{ flex: 1 }}>
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
          {/* Header */}
          <View style={styles.header}>
            <TouchableOpacity 
              style={styles.searchContainer}
              onPress={() => router.push('/(ride)/booking')}
              activeOpacity={0.8}
            >
              <Search size={20} color={Colors.light.icon} style={styles.searchIcon} />
              <Text style={[styles.searchInput, { color: Colors.light.icon }]}>
                Bạn muốn đi đâu?
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.iconButton}
              onPress={() => {
                setUnreadCount(0);
                router.push('/modal');
              }}
            >
              <View>
                <Bell size={24} color={Colors.light.text} />
                {unreadCount > 0 && <View style={styles.badge} />}
              </View>
            </TouchableOpacity>
          </View>
    
          {/* ── NÚT ĐẶT XE KHỔNG LỒ (HERO ORDER BUTTON) ── */}
          <View style={styles.heroSection}>
            <TouchableOpacity
              style={styles.heroOrderCard}
              onPress={() => router.push('/(ride)/booking')}
              activeOpacity={0.9}
            >
              <View style={styles.heroCardContent}>
                <View style={styles.heroIconCircle}>
                  <Car size={48} color="#FFF" />
                </View>
                <View style={styles.heroTextContainer}>
                  <Text style={styles.heroTitle}>ĐẶT XE NGAY BÂY GIỜ</Text>
                  <Text style={styles.heroSubtitle}>Trải nghiệm hành trình 5 sao cùng CAB</Text>
                </View>
                <View style={styles.heroActionBadge}>
                  <Text style={styles.heroActionText}>Bấm để đi ➔</Text>
                </View>
              </View>
            </TouchableOpacity>
          </View>
    
          {/* ── ANIMATED PROMO CAROUSEL BANNER ── */}
          <Animated.View style={[styles.promoBanner, { backgroundColor: currentPromo.bg, opacity: fadeAnim }]}>
            <View style={styles.promoTextContainer}>
              <Text style={styles.promoTitle}>{currentPromo.title}</Text>
              <Text style={styles.promoDesc}>{currentPromo.desc}</Text>
              <Text style={styles.promoCode}>Mã: {currentPromo.code}</Text>
            </View>
            <TouchableOpacity 
              style={styles.promoButton}
              onPress={() => router.push('/(ride)/booking')}
            >
              <Text style={[styles.promoButtonText, { color: currentPromo.bg }]}>Đặt Ngay</Text>
            </TouchableOpacity>
          </Animated.View>
    
          {/* Recent Destinations */}
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Điểm đến gần đây</Text>
              <TouchableOpacity onPress={() => router.push('/explore')}>
                <Text style={styles.seeAll}>Xem tất cả</Text>
              </TouchableOpacity>
            </View>
    
            {recentBookings.slice(0, 3).map((booking, index) => (
              <TouchableOpacity 
                key={booking.id || index} 
                style={styles.destinationItem}
                onPress={() => {
                  router.push({
                    pathname: '/(ride)/booking',
                    params: {
                      pickup: booking.pickupLocation || '',
                      pickupLat: booking.pickupCoordinates?.lat?.toString() || '',
                      pickupLng: booking.pickupCoordinates?.lng?.toString() || '',
                      dropoff: booking.dropoffLocation || '',
                      dropoffLat: booking.dropoffCoordinates?.lat?.toString() || '',
                      dropoffLng: booking.dropoffCoordinates?.lng?.toString() || '',
                    }
                  });
                }}
              >
                <MapPin size={20} color={Colors.light.icon} />
                <View style={styles.destinationText}>
                  <Text style={styles.destinationTitle} numberOfLines={1}>
                    {booking.dropoffLocation.split(',')[0]}
                  </Text>
                  <Text style={styles.destinationSubtitle} numberOfLines={1}>
                    {booking.dropoffLocation}
                  </Text>
                </View>
                <ChevronRight size={18} color={Colors.light.icon} />
              </TouchableOpacity>
            ))}
            {recentBookings.length === 0 && (
              <Text style={{ color: '#999', marginTop: 10 }}>Chưa có điểm đến gần đây.</Text>
            )}
          </View>
    
          {/* Notifications Section */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Thông báo gần đây</Text>
            <View style={styles.notificationCard}>
              <Bell size={20} color={Colors.light.primary} />
              <Text style={styles.notificationText}>
                {isActive ? (
                  latestBooking.status === 'MATCHING' ? 'Đang tìm tài xế gần nhất cho bạn...' :
                  latestBooking.status === 'ASSIGNED' || latestBooking.status === 'ACCEPTED' ? `Tài xế ${driverDisplayInfo?.fullName ?? 'đã nhận chuyến'} đang chuẩn bị đón bạn.` :
                  latestBooking.status === 'ARRIVING' ? `Tài xế ${driverDisplayInfo?.fullName ?? ''} đã đến điểm đón.` :
                  latestBooking.status === 'STARTED' || latestBooking.status === 'IN_PROGRESS' ? 'Chuyến đi của bạn đang diễn ra.' :
                  'Đang cập nhật trạng thái chuyến đi...'
                ) : (
                  latestNotification
                )}
              </Text>
            </View>
          </View>
    
          {/* Activity Feed */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Hoạt động của bạn</Text>
            {recentBookings.length > 0 ? (
              <TouchableOpacity onPress={() => router.push('/explore')} style={styles.activityCard}>
                <History size={24} color={Colors.light.primary} />
                <View style={styles.activityInfo}>
                  <Text style={styles.activityTitle}>Chuyến đi {getStatusInVietnamese(recentBookings[0].status)}</Text>
                  <Text style={styles.activityTime}>{new Date(recentBookings[0].createdAt).toLocaleString('vi-VN')}</Text>
                </View>
                <Text style={styles.activityPrice}>{recentBookings[0].estimatedFare?.toLocaleString()}đ</Text>
              </TouchableOpacity>
            ) : (
              <View style={[styles.activityCard, { justifyContent: 'center' }]}>
                <Text style={{ color: '#999' }}>Chưa có hoạt động nào gần đây</Text>
              </View>
            )}
          </View>
  
          <View style={{ height: 120 }} />
        </ScrollView>
  
        {/* ── FLOATING AI AGENT BUBBLE WITH SPEECH TOOLTIP ── */}
        <Animated.View style={[
          styles.floatingContainer,
          { transform: [{ translateY: bubbleYAnim }] }
        ]}>
          {/* Speech Tooltip / Suggestion Bubble (hidden when tracking an active ride to prevent overlapping) */}
          {!isActive && (
            <View style={styles.speechBubble}>
              <Text style={styles.speechText}>{AI_SUGGESTIONS[suggestionIdx]}</Text>
              <View style={styles.speechArrow} />
            </View>
          )}
  
          {/* Pulse Ripple Background */}
          <Animated.View style={[
            styles.ripple,
            { transform: [{ scale: pulseAnim }], opacity: pulseAnim.interpolate({
              inputRange: [1, 1.1],
              outputRange: [0.6, 0]
            }) }
          ]} />
  
          {/* Floating Bubble Button */}
          <TouchableOpacity
            style={styles.floatingBubble}
            onPress={() => router.push('/(ai)/chat')}
            activeOpacity={0.8}
          >
            <Sparkles size={24} color="#FFF" />
          </TouchableOpacity>
        </Animated.View>

        {/* ── FLOATING TRIP TRACKER CARD ── */}
        {isActive && (
          <TouchableOpacity
            style={styles.floatingTrackerCard}
            onPress={() => {
              router.push({
                pathname: '/(ride)/matching',
                params: { bookingId: latestBooking.id },
              });
            }}
            activeOpacity={0.9}
          >
            <View style={styles.trackerHeader}>
              <View style={styles.trackerStatusRow}>
                <ActivityIndicator size="small" color="#FFF" style={{ marginRight: 6 }} />
                <Text style={styles.trackerStatusText}>
                  {latestBooking.status === 'MATCHING' ? 'Đang tìm tài xế...' :
                   latestBooking.status === 'ARRIVING' ? 'Tài xế đang đến...' :
                   latestBooking.status === 'STARTED' || latestBooking.status === 'IN_PROGRESS' ? 'Chuyến đi đã bắt đầu' :
                   'Tài xế đã nhận chuyến'}
                </Text>
              </View>
              <Text style={styles.trackerPriceText}>{formatVND(latestBooking.estimatedFare)}</Text>
            </View>
            
            <View style={styles.trackerBody}>
              <MapPin size={16} color="#FFF" />
              <Text style={styles.trackerAddressText} numberOfLines={1}>
                Đến: {latestBooking.dropoffLocation}
              </Text>
              <Text style={styles.trackerActionText}>Xem Chi Tiết ➔</Text>
            </View>
          </TouchableOpacity>
        )}

        {/* ── DETAILED TRIP TRACKING MODAL ── */}
        <Modal
          visible={showTrackingModal}
          animationType="slide"
          transparent={false}
          onRequestClose={() => setShowTrackingModal(false)}
        >
          <View style={[styles.modalContainer, { paddingTop: Platform.OS === 'ios' ? 50 : 25 }]}>
            {/* Header */}
            <View style={styles.modalHeader}>
              <TouchableOpacity onPress={() => setShowTrackingModal(false)} style={styles.modalCloseButton}>
                <X size={24} color="#333" />
              </TouchableOpacity>
              <Text style={styles.modalHeaderTitle}>Thông tin chuyến xe</Text>
              <View style={{ width: 40 }} />
            </View>

            {latestBooking && (
              <ScrollView contentContainerStyle={styles.modalContent} showsVerticalScrollIndicator={false}>
                {/* Status Section */}
                <View style={styles.modalStatusCard}>
                  <View style={styles.modalStatusBadge}>
                    <ActivityIndicator size="small" color="#6366F1" style={{ marginRight: 6 }} />
                    <Text style={styles.modalStatusText}>
                      {latestBooking.status === 'MATCHING' ? 'Đang tìm tài xế gần nhất...' :
                       latestBooking.status === 'ASSIGNED' || latestBooking.status === 'ACCEPTED' ? 'Tài xế đã nhận chuyến' :
                       latestBooking.status === 'ARRIVING' ? 'Tài xế đang đến điểm đón' :
                       latestBooking.status === 'STARTED' || latestBooking.status === 'IN_PROGRESS' ? 'Bạn đang trong hành trình' :
                       'Đang di chuyển'}
                    </Text>
                  </View>
                  <Text style={styles.modalFareText}>{formatVND(latestBooking.estimatedFare)}</Text>
                  <Text style={styles.modalVehicleText}>
                    Dịch vụ: {latestBooking.vehicleType === 'BIKE' ? 'Xe máy (CAB Bike)' : 'Xe ô tô (CAB Car)'}
                  </Text>
                </View>

                {/* Journey Route Details */}
                <View style={styles.modalSectionCard}>
                  <Text style={styles.modalSectionTitle}>Hành trình</Text>
                  <View style={styles.modalRouteRow}>
                    <View style={styles.modalRouteDotContainer}>
                      <View style={[styles.modalRouteDot, { backgroundColor: '#10B981' }]} />
                      <View style={styles.modalRouteLine} />
                    </View>
                    <View style={{ flex: 1, marginLeft: 12 }}>
                      <Text style={styles.modalAddressLabel}>Điểm đón</Text>
                      <Text style={styles.modalAddressText}>{latestBooking.pickupLocation}</Text>
                    </View>
                  </View>

                  <View style={styles.modalRouteRow}>
                    <View style={styles.modalRouteDotContainer}>
                      <MapPin size={16} color="#EF4444" />
                    </View>
                    <View style={{ flex: 1, marginLeft: 12 }}>
                      <Text style={styles.modalAddressLabel}>Điểm đến</Text>
                      <Text style={styles.modalAddressText}>{latestBooking.dropoffLocation}</Text>
                    </View>
                  </View>
                </View>

                {/* Driver Details (If matched) */}
                <View style={styles.modalSectionCard}>
                  <Text style={styles.modalSectionTitle}>Tài xế phục vụ</Text>
                  {driverDisplayInfo?.hasDriver ? (
                    <>
                      <View style={styles.modalDriverRow}>
                        <View style={styles.modalDriverAvatar}>
                          <Text style={styles.modalDriverAvatarText}>TX</Text>
                        </View>
                        <View style={{ flex: 1, marginLeft: 12 }}>
                          <Text style={styles.modalDriverName}>
                            {driverDisplayInfo.fullName || 'Tài xế đã nhận chuyến'}
                          </Text>
                          {driverDisplayInfo.shortId && (
                            <Text style={styles.modalDriverSubtext}>Mã tài xế: {driverDisplayInfo.shortId}</Text>
                          )}
                          {/* Only show rating if backend provides it */}
                          {driverDisplayInfo.averageRating != null && driverDisplayInfo.totalCompletedRides != null && (
                            <Text style={styles.modalDriverRating}>
                              ⭐ {driverDisplayInfo.averageRating.toFixed(1)} ({driverDisplayInfo.totalCompletedRides} chuyến đi)
                            </Text>
                          )}
                          {/* Only show vehicle plate if backend provides it */}
                          {driverDisplayInfo.vehiclePlate && (
                            <Text style={styles.modalDriverSubtext}>
                              Biển số: {driverDisplayInfo.vehiclePlate}
                              {driverDisplayInfo.vehicleColor ? ` • ${driverDisplayInfo.vehicleColor}` : ''}
                              {driverDisplayInfo.vehicleModel ? ` • ${driverDisplayInfo.vehicleModel}` : ''}
                            </Text>
                          )}
                        </View>
                      </View>

                      {/* Chat and Call Buttons inside Driver Card */}
                      <View style={styles.modalActionsRow}>
                        <TouchableOpacity
                          style={styles.modalChatButton}
                          onPress={() => {
                            setShowTrackingModal(false);
                            router.push({
                              pathname: '/(ride)/chat',
                              params: { bookingId: latestBooking.id, driverName: driverDisplayInfo.fullName || 'Tài xế' }
                            });
                          }}
                        >
                          <MessageSquare size={18} color="#FFF" style={{ marginRight: 6 }} />
                          <Text style={styles.modalChatButtonText}>Trò chuyện</Text>
                        </TouchableOpacity>

                        <TouchableOpacity
                          style={styles.modalCallButton}
                          onPress={() => {
                            Alert.alert('Gọi tài xế', driverDisplayInfo.phoneNumber
                              ? `Đang kết nối cuộc gọi đến tài xế qua số ${driverDisplayInfo.phoneNumber}...`
                              : 'Không có số điện thoại tài xế. Vui lòng sử dụng chat.');
                          }}
                        >
                          <Phone size={18} color="#2563EB" style={{ marginRight: 6 }} />
                          <Text style={styles.modalCallButtonText}>Gọi điện</Text>
                        </TouchableOpacity>
                      </View>
                    </>
                  ) : (
                    <View style={{ paddingVertical: 15, alignItems: 'center', backgroundColor: '#FFFBEB', borderRadius: 12, paddingHorizontal: 12, borderWidth: 1, borderColor: '#FEF3C7' }}>
                      <ActivityIndicator size="small" color="#D97706" style={{ marginBottom: 8 }} />
                      <Text style={{ color: '#D97706', fontWeight: 'bold', fontSize: 14 }}>Đang kết nối tìm tài xế...</Text>
                      <Text style={{ color: '#78350F', fontSize: 12, marginTop: 4, textAlign: 'center', lineHeight: 16 }}>Hệ thống đang kết nối chuyến đi của bạn với các đối tác tài xế CAB gần nhất ở xung quanh.</Text>
                    </View>
                  )}
                </View>

                {/* View on Map Button */}
                <TouchableOpacity
                  style={{
                    backgroundColor: Colors.light.primary,
                    borderRadius: 14,
                    paddingVertical: 14,
                    alignItems: 'center',
                    justifyContent: 'center',
                    marginTop: 20,
                    shadowColor: Colors.light.primary,
                    shadowOffset: { width: 0, height: 4 },
                    shadowOpacity: 0.2,
                    shadowRadius: 6,
                  }}
                  onPress={() => {
                    setShowTrackingModal(false);
                    router.push({
                      pathname: '/(ride)/matching',
                      params: { bookingId: latestBooking.id },
                    });
                  }}
                >
                  <Text style={{ color: '#FFF', fontSize: 15, fontWeight: '800' }}>
                    Theo dõi trên bản đồ
                  </Text>
                </TouchableOpacity>

                {/* Cancel Button (Visible if MATCHING/FINDING) */}
                {latestBooking.status === 'MATCHING' && (
                  <TouchableOpacity
                    style={styles.modalCancelButton}
                    onPress={async () => {
                      try {
                        await api.post(`/api/v1/bookings/${latestBooking.id}/cancel`);
                        setShowTrackingModal(false);
                        fetchDashboardData();
                        Alert.alert('Thành công', 'Đã hủy chuyến đi.');
                      } catch {
                        Alert.alert('Lỗi', 'Không thể hủy chuyến đi. Vui lòng thử lại.');
                      }
                    }}
                  >
                    <Text style={styles.modalCancelButtonText}>Hủy chuyến đi</Text>
                  </TouchableOpacity>
                )}
              </ScrollView>
            )}
          </View>
        </Modal>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FAF9FC', // Soft, warm background
  },
  scrollContent: {
    paddingBottom: 20,
  },
  header: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    paddingVertical: 10,
    alignItems: 'center',
    gap: 15,
  },
  searchContainer: {
    flex: 1,
    flexDirection: 'row',
    backgroundColor: '#FFF',
    borderRadius: 16,
    paddingHorizontal: 15,
    height: 52,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 2,
  },
  searchIcon: {
    marginRight: 10,
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
    color: '#000',
  },
  iconButton: {
    width: 44,
    height: 44,
    backgroundColor: '#FFF',
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  badge: {
    position: 'absolute',
    top: -2,
    right: -2,
    backgroundColor: '#EF4444',
    width: 10,
    height: 10,
    borderRadius: 5,
    borderWidth: 1.5,
    borderColor: '#fff',
  },
  
  // ── HERO ORDER BUTTON STYLE ──
  heroSection: {
    paddingHorizontal: 20,
    marginTop: 20,
  },
  heroOrderCard: {
    backgroundColor: '#4F46E5', // Deep Indigo Royal Accent
    borderRadius: 24,
    padding: 24,
    shadowColor: '#4F46E5',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.3,
    shadowRadius: 16,
    elevation: 8,
  },
  heroCardContent: {
    flexDirection: 'column',
    alignItems: 'center',
    gap: 15,
  },
  heroIconCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#FFFFFF22',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: '#FFFFFF44',
  },
  heroTextContainer: {
    alignItems: 'center',
  },
  heroTitle: {
    color: '#FFF',
    fontSize: 22,
    fontWeight: '900',
    letterSpacing: 0.5,
    textAlign: 'center',
  },
  heroSubtitle: {
    color: '#E0E7FF',
    fontSize: 13,
    marginTop: 4,
    fontWeight: '500',
    textAlign: 'center',
  },
  heroActionBadge: {
    backgroundColor: '#FFD700', // Sparkling yellow CTA
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 20,
    marginTop: 4,
    shadowColor: '#FFD700',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 6,
  },
  heroActionText: {
    color: '#1E1B4B',
    fontSize: 14,
    fontWeight: '800',
  },

  // ── ANIMATED PROMO BANNER STYLE ──
  promoBanner: {
    marginHorizontal: 20,
    marginTop: 24,
    borderRadius: 20,
    padding: 20,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 4,
  },
  promoTextContainer: {
    flex: 1,
  },
  promoTitle: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
  },
  promoDesc: {
    color: '#F3F4F6',
    fontSize: 13,
    marginTop: 4,
    fontWeight: '500',
  },
  promoCode: {
    color: '#FFD700',
    fontSize: 12,
    fontWeight: '700',
    marginTop: 4,
  },
  promoButton: {
    backgroundColor: '#fff',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 12,
  },
  promoButtonText: {
    fontWeight: '800',
    fontSize: 12,
  },

  section: {
    marginTop: 28,
    paddingHorizontal: 20,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#1F2937',
  },
  seeAll: {
    color: '#4F46E5',
    fontWeight: '700',
    fontSize: 14,
  },
  destinationItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  destinationText: {
    flex: 1,
    marginLeft: 15,
  },
  destinationTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#111827',
  },
  destinationSubtitle: {
    fontSize: 13,
    color: '#6B7280',
    marginTop: 2,
  },
  activityCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFF',
    padding: 16,
    borderRadius: 16,
    marginTop: 8,
    borderWidth: 1,
    borderColor: '#F3F4F6',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.02,
    shadowRadius: 4,
  },
  activityInfo: {
    flex: 1,
    marginLeft: 15,
  },
  activityTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1F2937',
  },
  activityTime: {
    fontSize: 12,
    color: '#6B7280',
    marginTop: 2,
  },
  activityPrice: {
    fontSize: 14,
    fontWeight: '700',
    color: '#111827',
  },
  notificationCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#EEF2FF',
    padding: 16,
    borderRadius: 16,
    marginTop: 8,
    gap: 12,
    borderWidth: 1,
    borderColor: '#E0E7FF',
  },
  notificationText: {
    fontSize: 14,
    color: '#3730A3',
    flex: 1,
    fontWeight: '500',
    lineHeight: 20,
  },

  // ── FLOATING AI AGENT BUBBLE STYLE ──
  floatingContainer: {
    position: 'absolute',
    bottom: 30,
    right: 20,
    alignItems: 'flex-end',
    zIndex: 999,
  },
  speechBubble: {
    backgroundColor: '#1E1B4B', // Velvet dark deep space blue
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 8,
    marginBottom: 8,
    maxWidth: 200,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 6,
    elevation: 3,
  },
  speechText: {
    color: '#FFF',
    fontSize: 11,
    fontWeight: '700',
    textAlign: 'center',
  },
  speechArrow: {
    position: 'absolute',
    bottom: -6,
    right: 20,
    width: 0,
    height: 0,
    borderLeftWidth: 6,
    borderLeftColor: 'transparent',
    borderRightWidth: 6,
    borderRightColor: 'transparent',
    borderTopWidth: 6,
    borderTopColor: '#1E1B4B',
  },
  floatingBubble: {
    width: 58,
    height: 58,
    borderRadius: 29,
    backgroundColor: '#7C3AED', // Electric violet sparkle
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#7C3AED',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.4,
    shadowRadius: 10,
    elevation: 6,
  },
  ripple: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 58,
    height: 58,
    borderRadius: 29,
    backgroundColor: '#7C3AED',
  },

  // ── PREMIUM FLOATING ACTIVE TRIP TRACKER STYLES ──
  floatingTrackerCard: {
    position: 'absolute',
    bottom: 110,
    left: 20,
    right: 20,
    backgroundColor: '#1E293B', // Rich dark slate blue
    borderRadius: 16,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 8,
    zIndex: 998,
    borderWidth: 1,
    borderColor: '#334155',
  },
  trackerHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#334155',
    paddingBottom: 10,
    marginBottom: 10,
  },
  trackerStatusRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  trackerStatusText: {
    color: '#FFF',
    fontSize: 14,
    fontWeight: '700',
  },
  trackerPriceText: {
    color: '#38BDF8', // Cyan sky price text
    fontSize: 15,
    fontWeight: '800',
  },
  trackerBody: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  trackerAddressText: {
    flex: 1,
    color: '#E2E8F0',
    fontSize: 13,
  },
  trackerActionText: {
    color: '#38BDF8',
    fontSize: 12,
    fontWeight: '700',
  },

  // ── DETAILED TRACKING MODAL STYLES ──
  modalContainer: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: '#FFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  modalCloseButton: {
    padding: 12,
    marginLeft: -8,
  },
  modalHeaderTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#0F172A',
  },
  modalContent: {
    padding: 16,
    paddingBottom: 32,
  },
  modalStatusCard: {
    backgroundColor: '#FFF',
    borderRadius: 16,
    padding: 20,
    alignItems: 'center',
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 2,
  },
  modalStatusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#EEF2FF',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 12,
    marginBottom: 12,
  },
  modalStatusText: {
    color: '#4F46E5',
    fontWeight: '700',
    fontSize: 13,
  },
  modalFareText: {
    fontSize: 28,
    fontWeight: '900',
    color: '#0F172A',
    marginBottom: 6,
  },
  modalVehicleText: {
    fontSize: 13,
    color: '#64748B',
    fontWeight: '500',
  },
  modalSectionCard: {
    backgroundColor: '#FFF',
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  modalSectionTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#64748B',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 14,
  },
  modalRouteRow: {
    flexDirection: 'row',
    marginBottom: 14,
  },
  modalRouteDotContainer: {
    width: 20,
    alignItems: 'center',
    marginTop: 4,
  },
  modalRouteDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  modalRouteLine: {
    width: 2,
    height: 36,
    backgroundColor: '#E2E8F0',
    marginVertical: 4,
  },
  modalAddressLabel: {
    fontSize: 11,
    color: '#94A3B8',
    fontWeight: '600',
  },
  modalAddressText: {
    fontSize: 14,
    color: '#334155',
    marginTop: 2,
    lineHeight: 18,
  },
  modalDriverRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
    paddingBottom: 14,
    marginBottom: 14,
  },
  modalDriverAvatar: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: '#6366F1',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalDriverAvatarText: {
    color: '#FFF',
    fontSize: 14,
    fontWeight: 'bold',
  },
  modalDriverName: {
    fontSize: 15,
    fontWeight: '700',
    color: '#0F172A',
  },
  modalDriverSubtext: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 1,
  },
  modalDriverRating: {
    fontSize: 12,
    fontWeight: '600',
    color: '#D97706',
    marginTop: 4,
  },
  modalActionsRow: {
    flexDirection: 'row',
    gap: 12,
  },
  modalChatButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#2563EB',
    paddingVertical: 12,
    borderRadius: 12,
  },
  modalChatButtonText: {
    color: '#FFF',
    fontSize: 14,
    fontWeight: '700',
  },
  modalCallButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#EFF6FF',
    borderWidth: 1,
    borderColor: '#BFDBFE',
    paddingVertical: 12,
    borderRadius: 12,
  },
  modalCallButtonText: {
    color: '#2563EB',
    fontSize: 14,
    fontWeight: '700',
  },
  modalCancelButton: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    marginTop: 8,
  },
  modalCancelButtonText: {
    color: '#EF4444',
    fontSize: 14,
    fontWeight: '700',
  }
});
