import React, { useEffect, useState } from 'react';
import { StyleSheet, View, Text, FlatList, TouchableOpacity, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Search, UserCircle2, MessageSquare, ChevronRight } from 'lucide-react-native';
import { Colors } from '@/constants/Colors';
import api from '@/services/api';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter, useFocusEffect } from 'expo-router';

export default function MessagesScreen() {
  const router = useRouter();
  const [bookings, setBookings] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [driverNames, setDriverNames] = useState<Record<string, string>>({});

  const fetchBookings = async () => {
    try {
      const userId = await AsyncStorage.getItem('user_id');
      if (!userId) {
        setLoading(false);
        return;
      }
      const response = await api.get(`/api/v1/bookings/customer/${userId}?page=0&size=20`);
      if (response.data && response.data.result) {
        const fetchedBookings = response.data.result.content || [];
        // Filter out bookings that are CANCELLED or still MATCHING (no driver accepted yet)
        const eligibleBookings = fetchedBookings.filter((b: any) => 
          b.status !== 'CANCELLED' && b.status !== 'MATCHING'
        );
        setBookings(eligibleBookings);

        // Fetch driver profiles asynchronously
        eligibleBookings.forEach(async (b: any) => {
          const drvId = b.assignedDriverId || b.driverId;
          if (drvId && !driverNames[drvId]) {
            try {
              const res = await api.get(`/api/drivers/${drvId}/profile`);
              if (res.data?.result?.fullName) {
                setDriverNames(prev => ({
                  ...prev,
                  [drvId]: res.data.result.fullName
                }));
              }
            } catch (err) {
              console.log('Failed to fetch driver profile in messages tab:', err);
            }
          }
        });
      }
    } catch (error) {
      console.log('Failed to fetch bookings in messages tab:', error);
    } finally {
      setLoading(false);
    }
  };

  useFocusEffect(
    React.useCallback(() => {
      fetchBookings();
    }, [driverNames])
  );

  const getChatSubtitle = (item: any) => {
    switch (item.status) {
      case 'COMPLETED':
        return 'Lịch sử trò chuyện (Chuyến đi đã hoàn thành)';
      case 'CANCELLED':
        return 'Cuộc trò chuyện đã đóng (Chuyến xe đã hủy)';
      case 'MATCHING':
        return 'Đang tìm tài xế gần nhất...';
      default:
        return 'Nhấp để trò chuyện trực tiếp với tài xế...';
    }
  };

  const getDriverName = (item: any) => {
    const drvId = item.assignedDriverId || item.driverId;
    if (drvId && driverNames[drvId]) {
      return `Tài xế ${driverNames[drvId]}`;
    }
    if (drvId) {
      return 'Tài xế';
    }
    return `Chuyến xe #${item.id.substring(0, 8).toUpperCase()}`;
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Trò chuyện</Text>
      </View>

      <View style={styles.searchContainer}>
        <Search size={20} color={Colors.light.icon} />
        <Text style={styles.searchPlaceholder}>Tìm kiếm cuộc trò chuyện...</Text>
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={Colors.light.primary} />
        </View>
      ) : bookings.length === 0 ? (
        <View style={styles.center}>
          <MessageSquare size={64} color="#CCC" />
          <Text style={styles.emptyText}>Chưa có cuộc trò chuyện nào</Text>
        </View>
      ) : (
        <FlatList
          data={bookings}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => {
            const isCompleted = item.status === 'COMPLETED' || item.status === 'CANCELLED';
            return (
              <TouchableOpacity 
                style={styles.messageItem} 
                activeOpacity={0.7}
                onPress={() => router.push({
                  pathname: '/(ride)/chat',
                  params: { bookingId: item.id, driverName: getDriverName(item) }
                })}
              >
                <View style={styles.avatarContainer}>
                  <UserCircle2 size={40} color={!isCompleted ? Colors.light.primary : '#999'} />
                </View>
                <View style={styles.messageContent}>
                  <View style={styles.messageHeader}>
                    <Text style={[styles.name, !isCompleted && styles.unreadName]}>
                      {getDriverName(item)}
                    </Text>
                    <Text style={styles.time}>
                      {new Date(item.createdAt).toLocaleDateString('vi-VN')}
                    </Text>
                  </View>

                  {/* Route Information Card */}
                  <View style={styles.routeContainer}>
                    <Text numberOfLines={1} style={styles.routeText}>
                      📍 <Text style={{ fontWeight: '600' }}>Từ: </Text>{item.pickupLocation}
                    </Text>
                    <Text numberOfLines={1} style={styles.routeText}>
                      🏁 <Text style={{ fontWeight: '600' }}>Đến: </Text>{item.dropoffLocation}
                    </Text>
                  </View>

                  <Text numberOfLines={1} style={[styles.message, !isCompleted && styles.unreadMessage]}>
                    {getChatSubtitle(item)}
                  </Text>
                </View>
                <ChevronRight size={18} color="#C7C7CC" />
              </TouchableOpacity>
            );
          }}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  header: {
    paddingHorizontal: 20,
    paddingVertical: 15,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 40,
  },
  emptyText: {
    marginTop: 10,
    fontSize: 16,
    color: '#999',
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F2F2F2',
    marginHorizontal: 20,
    paddingHorizontal: 15,
    height: 40,
    borderRadius: 20,
    marginBottom: 10,
    gap: 10,
  },
  searchPlaceholder: {
    color: '#999',
    fontSize: 14,
  },
  messageItem: {
    flexDirection: 'row',
    padding: 20,
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#F2F2F2',
  },
  avatarContainer: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  messageContent: {
    flex: 1,
    marginLeft: 15,
    marginRight: 10,
  },
  messageHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  name: {
    fontSize: 16,
    color: '#333',
  },
  unreadName: {
    fontWeight: 'bold',
    color: '#000',
  },
  time: {
    fontSize: 12,
    color: '#999',
  },
  message: {
    fontSize: 14,
    color: '#666',
  },
  unreadMessage: {
    color: '#333',
    fontWeight: '600',
  },
  routeContainer: {
    backgroundColor: '#F8FAFC',
    borderRadius: 8,
    padding: 8,
    marginVertical: 6,
    gap: 4,
    borderWidth: 1,
    borderColor: '#F1F5F9',
  },
  routeText: {
    fontSize: 12,
    color: '#475569',
    lineHeight: 16,
  }
});
