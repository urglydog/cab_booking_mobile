import React, { useEffect, useState } from 'react';
import { StyleSheet, View, Text, FlatList, TouchableOpacity, RefreshControl, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Car, Bike, ChevronRight, History } from 'lucide-react-native';
import { Colors } from '@/constants/Colors';
import api, { BOOKING_SERVICE_URL } from '@/services/api';
import AsyncStorage from '@react-native-async-storage/async-storage';

export default function ActivityScreen() {
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
      
      console.log('🔍 Fetching History from:', `${BOOKING_SERVICE_URL}/api/v1/bookings/customer/${userId}?page=0&size=20`);
      
      const response = await api.get(`${BOOKING_SERVICE_URL}/api/v1/bookings/customer/${userId}?page=0&size=20`);
      
      console.log('📥 History Response:', response.status);
      console.log('📋 History Data Length:', response.data?.result?.content?.length || 0);

      if (response.data && response.data.result) {
        setBookings(response.data.result.content || []);
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

  const renderItem = ({ item }) => (
    <TouchableOpacity style={styles.activityItem} onPress={() => alert('Booking Detail ID: ' + item.id)}>
      <View style={styles.iconContainer}>
        {item.vehicleType === 'BIKE' ? <Bike size={24} color="#666" /> : <Car size={24} color="#666" />}
      </View>
      <View style={styles.activityInfo}>
        <Text style={styles.destination} numberOfLines={1}>{item.dropoffLocation}</Text>
        <Text style={styles.dateTime}>{new Date(item.createdAt).toLocaleString()}</Text>
        <Text style={[styles.status, { color: item.status === 'COMPLETED' ? '#00B14F' : '#666' }]}>
          {item.status}
        </Text>
      </View>
      <View style={styles.priceContainer}>
        <Text style={styles.price}>{item.estimatedFare?.toLocaleString()}đ</Text>
        <ChevronRight size={20} color="#CCC" />
      </View>
    </TouchableOpacity>
  );

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Activity</Text>
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={Colors.light.primary} />
        </View>
      ) : bookings.length === 0 ? (
        <View style={styles.center}>
          <History size={64} color="#CCC" />
          <Text style={styles.emptyText}>No activities yet</Text>
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
  }
});
