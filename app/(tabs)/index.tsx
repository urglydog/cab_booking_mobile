import React from 'react';
import { StyleSheet, View, Text, ScrollView, TextInput, TouchableOpacity, Image } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Search, Car, Bike, Utensils, ShoppingBag, Bell, Menu, MapPin, ChevronRight, History } from 'lucide-react-native';
import { Colors } from '@/constants/Colors';
import { useRouter, useFocusEffect } from 'expo-router';
import { useSocket } from '@/hooks/useSocket';
import api, { IP_ADDRESS } from '@/services/api';
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

export default function HomeScreen() {
  const router = useRouter();
  const { socket, unreadCount, setUnreadCount } = useSocket();
  const [latestNotification, setLatestNotification] = React.useState('Chào mừng bạn đến với CAB Booking! Hãy đặt chuyến xe đầu tiên.');
  const [recentBookings, setRecentBookings] = React.useState<any[]>([]);

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

  React.useEffect(() => {
    fetchDashboardData();

    if (socket) {
      socket.on('new_notification', (data: any) => {
        setLatestNotification(translateNotificationMessage(data.message || 'Cập nhật mới cho chuyến đi của bạn!'));
      });
    }
    return () => {
      if (socket) socket.off('new_notification');
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

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView showsVerticalScrollIndicator={false}>
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.searchContainer}>
            <Search size={20} color={Colors.light.icon} style={styles.searchIcon} />
            <TextInput
              placeholder="Bạn muốn đi đâu?"
              style={styles.searchInput}
              placeholderTextColor={Colors.light.icon}
              onFocus={() => router.push('/booking')}
            />
          </View>
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
 
        {/* Services Grid */}
        <View style={[styles.servicesGrid, { justifyContent: 'flex-start' }]}>
          <ServiceItem
            icon={<Car size={32} color={Colors.light.primary} />}
            label="Đặt xe"
            onPress={() => router.push('/(ride)/booking')}
          />
        </View>
 
        {/* Promo Banner Mock */}
        <View style={styles.promoBanner}>
          <View style={styles.promoTextContainer}>
            <Text style={styles.promoTitle}>Giảm 50% cho chuyến đầu</Text>
            <Text style={styles.promoSubtitle}>Nhập mã: NEWCAB2024</Text>
            <TouchableOpacity style={styles.promoButton}>
              <Text style={styles.promoButtonText}>Nhận Ngay</Text>
            </TouchableOpacity>
          </View>
          <View style={styles.promoImagePlaceholder} />
        </View>
 
        {/* Recent Destinations */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Điểm đến gần đây</Text>
            <TouchableOpacity>
              <Text style={styles.seeAll}>Xem tất cả</Text>
            </TouchableOpacity>
          </View>
 
          {recentBookings.slice(0, 3).map((booking, index) => (
            <DestinationItem
              key={booking.id || index}
              title={booking.dropoffLocation.split(',')[0]} // Show only first part of address
              subtitle={booking.dropoffLocation}
            />
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

        <View style={{ height: 100 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

function ServiceItem({ icon, label, onPress }: { icon: React.ReactNode, label: string, onPress?: () => void }) {
  return (
    <TouchableOpacity style={styles.serviceItem} onPress={onPress}>
      <View style={styles.iconCircle}>
        {icon}
      </View>
      <Text style={styles.serviceLabel}>{label}</Text>
    </TouchableOpacity>
  );
}

function DestinationItem({ title, subtitle }: { title: string, subtitle: string }) {
  return (
    <TouchableOpacity style={styles.destinationItem}>
      <MapPin size={20} color={Colors.light.icon} />
      <View style={styles.destinationText}>
        <Text style={styles.destinationTitle}>{title}</Text>
        <Text style={styles.destinationSubtitle}>{subtitle}</Text>
      </View>
      <ChevronRight size={18} color={Colors.light.icon} />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
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
    backgroundColor: '#F2F2F2',
    borderRadius: 12,
    paddingHorizontal: 15,
    height: 48,
    alignItems: 'center',
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
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  badge: {
    position: 'absolute',
    top: -2,
    right: -2,
    backgroundColor: '#EF4444',
    width: 12,
    height: 12,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: '#fff',
  },
  servicesGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    marginTop: 20,
  },
  serviceItem: {
    alignItems: 'center',
    gap: 8,
  },
  iconCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#F8F8F8',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#EAEAEA',
  },
  serviceLabel: {
    fontSize: 14,
    fontWeight: '500',
    color: '#333',
  },
  promoBanner: {
    marginHorizontal: 20,
    marginTop: 25,
    backgroundColor: '#6366F1',
    borderRadius: 20,
    padding: 20,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    overflow: 'hidden',
    shadowColor: '#6366F1',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.2,
    shadowRadius: 12,
    elevation: 6,
  },
  promoTextContainer: {
    flex: 1,
  },
  promoTitle: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
  },
  promoSubtitle: {
    color: '#E0FFEB',
    fontSize: 14,
    marginTop: 4,
  },
  promoButton: {
    backgroundColor: '#fff',
    paddingHorizontal: 15,
    paddingVertical: 8,
    borderRadius: 8,
    marginTop: 12,
    alignSelf: 'flex-start',
  },
  promoButtonText: {
    color: '#6366F1',
    fontWeight: '800',
    fontSize: 12,
  },
  promoImagePlaceholder: {
    width: 80,
    height: 80,
    backgroundColor: '#E0FFEB33',
    borderRadius: 40,
  },
  section: {
    marginTop: 30,
    paddingHorizontal: 20,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 15,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#111',
  },
  seeAll: {
    color: '#6366F1',
    fontWeight: '700',
  },
  destinationItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 15,
    borderBottomWidth: 1,
    borderBottomColor: '#F2F2F2',
  },
  destinationText: {
    flex: 1,
    marginLeft: 15,
  },
  destinationTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111',
  },
  destinationSubtitle: {
    fontSize: 14,
    color: '#666',
    marginTop: 2,
  },
  activityCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F9F9F9',
    padding: 15,
    borderRadius: 12,
    marginTop: 10,
  },
  activityInfo: {
    flex: 1,
    marginLeft: 15,
  },
  activityTitle: {
    fontSize: 15,
    fontWeight: '600',
  },
  activityTime: {
    fontSize: 13,
    color: '#666',
    marginTop: 2,
  },
  activityPrice: {
    fontSize: 15,
    fontWeight: 'bold',
    color: '#111',
  },
  notificationCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#EEF2FF',
    padding: 15,
    borderRadius: 16,
    marginTop: 10,
    gap: 12,
    borderWidth: 1,
    borderColor: '#E0E7FF',
  },
  notificationText: {
    fontSize: 14,
    color: '#3730A3',
    flex: 1,
    fontWeight: '500',
  }
});
