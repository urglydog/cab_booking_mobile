import React, { useEffect, useState } from 'react';
import { StyleSheet, View, Text, FlatList, TouchableOpacity, RefreshControl, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Car, Bike, ChevronRight, History } from 'lucide-react-native';
import { Colors } from '@/constants/Colors';
import api from '@/services/api';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter } from 'expo-router';

export default function ActivityScreen() {
  const router = useRouter();
  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchBookings = async () => {
    try {
      const userId = await AsyncStorage.getItem('user_id');
      
      if (!userId) {
        setLoading(false);
        return;
      }
      
      const response = await api.get(`/api/v1/bookings/customer/${userId}?page=0&size=20`);
      
      console.log('📥 History Response:', response.status);
      console.log('📋 History Data Length:', response.data?.result?.content?.length || 0);

      if (response.data && response.data.result) {
        const fetchedBookings = response.data.result.content || [];
        
        const mockCompleted = {
          id: 'booking-mock-123',
          assignedDriverId: 'driver-mock-456',
          pickupLocation: 'Trường ĐH Công nghiệp TP.HCM, Gò Vấp',
          dropoffLocation: 'Sân bay Tân Sơn Nhất',
          vehicleType: 'CAR4',
          paymentMethod: 'CASH',
          estimatedFare: 85000,
          status: 'COMPLETED',
          createdAt: new Date().toISOString(),
        };
        setBookings([mockCompleted, ...fetchedBookings]);
      }
    } catch (error) {
      console.error('Failed to fetch bookings:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchBookings();
  }, []);

  const onRefresh = () => {
    setRefreshing(true);
    fetchBookings();
  };

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
      default: return status;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'COMPLETED': return '#00B14F';
      case 'CANCELLED': return '#EF4444';
      default: return '#6366F1';
    }
  };

  const renderItem = ({ item }) => (
    <View style={styles.activityItem}>
      {/* Chi tiết chuyến đi */}
      <TouchableOpacity 
        style={{ flex: 1, flexDirection: 'row', alignItems: 'center' }} 
        onPress={() => router.push({
          pathname: '/(ride)/detail',
          params: { bookingId: item.id }
        })}
      >
        <View style={styles.iconContainer}>
          {item.vehicleType === 'BIKE' ? <Bike size={24} color="#666" /> : <Car size={24} color="#666" />}
        </View>
        <View style={styles.activityInfo}>
          <Text style={styles.destination} numberOfLines={1}>{item.dropoffLocation}</Text>
          <Text style={styles.dateTime}>{new Date(item.createdAt).toLocaleString('vi-VN')}</Text>
          <Text style={[styles.status, { color: getStatusColor(item.status) }]}>
            {getStatusInVietnamese(item.status)}
          </Text>
        </View>
        <View style={{ marginRight: 10, alignItems: 'flex-end' }}>
          <Text style={styles.price}>{item.estimatedFare?.toLocaleString()}đ</Text>
        </View>
      </TouchableOpacity>

      {/* Nút Đánh giá (Độc lập Sibling) */}
      <View style={styles.priceContainer}>
        {item.status === 'COMPLETED' ? (
          <TouchableOpacity 
            style={styles.rateButton}
            onPress={() => router.push({
              pathname: '/(review)/review',
              params: { rideId: item.id, driverId: item.assignedDriverId || 'driver-mock-456' }
            })}
          >
            <Text style={styles.rateButtonText}>Đánh giá</Text>
          </TouchableOpacity>
        ) : (
          <ChevronRight size={20} color="#CCC" />
        )}
      </View>
    </View>
  );

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Hoạt động</Text>
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={Colors.light.primary} />
        </View>
      ) : bookings.length === 0 ? (
        <View style={styles.center}>
          <History size={64} color="#CCC" />
          <Text style={styles.emptyText}>Chưa có hoạt động nào</Text>
        </View>
      ) : (
        <FlatList
          data={bookings}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
          }
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
    borderBottomWidth: 1,
    borderBottomColor: '#F2F2F2',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyText: {
    marginTop: 10,
    fontSize: 16,
    color: '#999',
  },
  listContent: {
    paddingBottom: 20,
  },
  activityItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#F2F2F2',
  },
  iconContainer: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#F9F9F9',
    justifyContent: 'center',
    alignItems: 'center',
  },
  activityInfo: {
    flex: 1,
    marginLeft: 15,
  },
  destination: {
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 4,
  },
  dateTime: {
    fontSize: 12,
    color: '#999',
    marginBottom: 4,
  },
  status: {
    fontSize: 12,
    fontWeight: '600',
  },
  priceContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  price: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#333',
  },
  rateButton: {
    backgroundColor: '#FFD700',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
    marginTop: 5,
  },
  rateButtonText: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#333',
  }
});
