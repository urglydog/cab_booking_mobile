import React, { useState, useEffect, useRef } from 'react';
import { StyleSheet, View, Text, ScrollView, TouchableOpacity, Animated, Easing, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Search, Car, Bell, MapPin, ChevronRight, History, Sparkles, MessageSquare } from 'lucide-react-native';
import { Colors } from '@/constants/Colors';
import { useRouter, useFocusEffect } from 'expo-router';
import { useSocket } from '@/hooks/useSocket';
import api from '@/services/api';
import AsyncStorage from '@react-native-async-storage/async-storage';

const translateNotificationMessage = (message: string) => {
  if (!message) return '';
  if (message.includes('Your ride has been cancelled') || message.includes('cancelled')) {
    const reason = message.split('Reason: ')[1] || '';
    let viReason = reason;
    if (reason.includes('TIMEOUT_NO_DRIVER_FOUND')) {
      viReason = 'Không tìm thấy tài xế sau 3 phút';
    } else if (reason.includes('Not specified') || !reason) {
      viReason = 'Không xác định';
    }
    return `Chuyến đi của bạn đã bị hủy. Lý do: ${viReason}`;
  }
  if (message.includes('Finding the nearest driver') || message.includes('finding') || message.includes('tìm tài xế')) {
    return 'Đang tìm tài xế gần nhất cho bạn...';
  }
  if (message.includes('Driver has arrived') || message.includes('arrived') || message.includes('đến điểm đón')) {
    return 'Tài xế đã đến điểm đón!';
  }
  if (message.includes('Ride completed') || message.includes('finished') || message.includes('hoàn thành')) {
    return 'Chuyến đi đã hoàn thành. Cảm ơn bạn!';
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
      socket.on('new_notification', (data: any) => {
        setLatestNotification(translateNotificationMessage(data.message || 'Cập nhật mới cho chuyến đi của bạn!'));
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
      if (socket) socket.off('new_notification');
      clearInterval(bannerTimer);
      clearInterval(suggestionTimer);
    };
  }, [socket]);

  const getStatusInVietnamese = (status: string) => {
    switch (status) {
      case 'COMPLETED': return 'đã hoàn thành';
      case 'CANCELLED': return 'đã hủy';
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
                onPress={() => router.push('/(ride)/booking')}
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
                {latestNotification}
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
          {/* Speech Tooltip / Suggestion Bubble */}
          <View style={styles.speechBubble}>
            <Text style={styles.speechText}>{AI_SUGGESTIONS[suggestionIdx]}</Text>
            <View style={styles.speechArrow} />
          </View>
  
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
  }
});
