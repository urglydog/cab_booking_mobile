import React, { useState } from 'react';
import { StyleSheet, View, Text, ScrollView, TextInput, TouchableOpacity, ActivityIndicator, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Car, Bike, MapPin, Navigation, CreditCard, ChevronLeft } from 'lucide-react-native';
import { Colors } from '@/constants/Colors';
import api, { GATEWAY_URL, BOOKING_SERVICE_URL } from '@/services/api';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter } from 'expo-router';
import MapView, { Marker, PROVIDER_GOOGLE } from 'react-native-maps';

export default function BookingScreen() {
  const router = useRouter();
  const [pickup, setPickup] = useState('12 Nguyen Van Bao, Go Vap');
  const [dropoff, setDropoff] = useState('');
  const [vehicleType, setVehicleType] = useState('CAR');
  const [paymentMethod, setPaymentMethod] = useState('CASH');
  const [loading, setLoading] = useState(false);
  const [carPrice, setCarPrice] = useState<number | null>(null);
  const [bikePrice, setBikePrice] = useState<number | null>(null);

  React.useEffect(() => {
    const fetchPrices = async () => {
      try {
        const [carRes, bikeRes] = await Promise.all([
          api.post('/api/pricing/estimate', {
            pickupLat: 10.8231,
            pickupLng: 106.6631,
            dropoffLat: 10.8331,
            dropoffLng: 106.6731,
            vehicleType: 'CAR'
          }),
          api.post('/api/pricing/estimate', {
            pickupLat: 10.8231,
            pickupLng: 106.6631,
            dropoffLat: 10.8331,
            dropoffLng: 106.6731,
            vehicleType: 'BIKE'
          })
        ]);
        setCarPrice(carRes.data?.totalFare || 55000);
        setBikePrice(bikeRes.data?.totalFare || 25000);
      } catch (e) {
        console.error('Failed to fetch pricing:', e);
        // Fallback for UI if service is down
        setCarPrice(55000);
        setBikePrice(25000);
      }
    };
    fetchPrices();
  }, []);

  const handleBooking = async () => {
    if (!pickup || !dropoff) {
      Alert.alert('Error', 'Please enter both pickup and destination');
      return;
    }

    // Check for authentication before booking
    const token = await AsyncStorage.getItem('access_token');
    if (!token) {
      Alert.alert(
        'Authentication Required',
        'Please login to book a ride.',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Login', onPress: () => router.push('/login') }
        ]
      );
      return;
    }

    setLoading(true);
    try {
      const bookingRequest = {
        pickupLocation: pickup,
        dropoffLocation: dropoff,
        vehicleType: vehicleType,
        paymentMethod: paymentMethod,
        estimatedFare: vehicleType === 'CAR' ? carPrice : bikePrice,
        customerNote: 'Please pick me up at the main gate',
        idempotencyKey: Math.random().toString(36).substring(7)
      };

      console.log('🚀 API POST to:', `${GATEWAY_URL}/api/v1/bookings`);
      console.log('📦 Payload:', JSON.stringify(bookingRequest, null, 2));
      
      const response = await api.post(`/api/v1/bookings`, bookingRequest);
      
      console.log('✅ Response Status:', response.status);
      console.log('📄 Response Data:', JSON.stringify(response.data, null, 2));

      if (response.status === 200 || response.status === 201) {
        const bookingId = response.data?.result?.id || response.data?.id;
        router.replace({
          pathname: '/matching',
          params: { bookingId: bookingId }
        });
      }
    } catch (error: any) {
      console.error('Booking Error:', error);
      const errorMsg = error.response?.data?.message || 'Failed to book ride. Please check booking-service logs.';
      Alert.alert('Booking Failed', errorMsg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <ChevronLeft size={28} color="#111" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Where are you going?</Text>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
        {/* Real Map Preview */}
        <View style={styles.mapContainer}>
          <MapView
            style={styles.map}
            initialRegion={{
              latitude: 10.822,
              longitude: 106.687,
              latitudeDelta: 0.04,
              longitudeDelta: 0.04,
            }}
          >
            {/* Pickup point (IUH) */}
            <Marker
              coordinate={{ latitude: 10.822, longitude: 106.687 }}
              title="Điểm đón khách"
              description={pickup}
              pinColor="#10B981"
            />

            {/* Dynamic Destination Marker when typing */}
            {dropoff.length > 0 && (
              <Marker
                coordinate={{ latitude: 10.779, longitude: 106.699 }}
                title="Điểm đến của bạn"
                description={dropoff}
                pinColor="#EF4444"
              />
            )}
          </MapView>
        </View>

        {/* Booking Form Card */}
        <View style={styles.card}>
          <View style={styles.inputGroup}>
            <View style={styles.iconColumn}>
              <View style={[styles.dot, { backgroundColor: '#00B14F' }]} />
              <View style={styles.line} />
              <MapPin size={20} color="#FF4444" />
            </View>
            
            <View style={styles.inputsColumn}>
              <View style={styles.inputWrapper}>
                <Text style={styles.label}>Pickup Location</Text>
                <TextInput
                  style={styles.input}
                  placeholder="Enter pickup point"
                  value={pickup}
                  onChangeText={setPickup}
                />
              </View>
              
              <View style={styles.divider} />
              
              <View style={styles.inputWrapper}>
                <Text style={styles.label}>Destination</Text>
                <TextInput
                  style={styles.input}
                  placeholder="Where to?"
                  value={dropoff}
                  onChangeText={setDropoff}
                  autoFocus
                />
              </View>
            </View>
          </View>
        </View>

        {/* Vehicle Selection */}
        <Text style={styles.sectionTitle}>Select Vehicle</Text>
        <View style={styles.vehicleGrid}>
          <TouchableOpacity 
            style={[styles.vehicleItem, vehicleType === 'CAR' && styles.activeVehicle]}
            onPress={() => setVehicleType('CAR')}
          >
            <View style={[styles.vehicleIcon, vehicleType === 'CAR' && styles.activeIcon]}>
              <Car size={32} color={vehicleType === 'CAR' ? '#fff' : '#666'} />
            </View>
            <Text style={styles.vehicleLabel}>CAB Car</Text>
            <Text style={styles.vehiclePrice}>{carPrice ? `~${(carPrice / 1000).toFixed(0)}k` : '...'}</Text>
          </TouchableOpacity>

          <TouchableOpacity 
            style={[styles.vehicleItem, vehicleType === 'BIKE' && styles.activeVehicle]}
            onPress={() => setVehicleType('BIKE')}
          >
            <View style={[styles.vehicleIcon, vehicleType === 'BIKE' && styles.activeIcon]}>
              <Bike size={32} color={vehicleType === 'BIKE' ? '#fff' : '#666'} />
            </View>
            <Text style={styles.vehicleLabel}>CAB Bike</Text>
            <Text style={styles.vehiclePrice}>{bikePrice ? `~${(bikePrice / 1000).toFixed(0)}k` : '...'}</Text>
          </TouchableOpacity>
        </View>

        {/* Payment Method */}
        <Text style={styles.sectionTitle}>Payment Method</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.paymentList}>
          <TouchableOpacity 
            style={[styles.paymentItem, paymentMethod === 'CASH' && styles.activePayment]}
            onPress={() => setPaymentMethod('CASH')}
          >
            <CreditCard size={24} color={paymentMethod === 'CASH' ? '#00B14F' : '#666'} />
            <Text style={[styles.paymentLabel, paymentMethod === 'CASH' && styles.activePaymentText]}>Tiền mặt</Text>
          </TouchableOpacity>

          <TouchableOpacity 
            style={[styles.paymentItem, paymentMethod === 'MOMO' && styles.activePayment]}
            onPress={() => setPaymentMethod('MOMO')}
          >
            <View style={[styles.paymentLogo, { backgroundColor: '#A50064' }]}>
              <Text style={styles.logoText}>M</Text>
            </View>
            <Text style={[styles.paymentLabel, paymentMethod === 'MOMO' && styles.activePaymentText]}>MoMo</Text>
          </TouchableOpacity>

          <TouchableOpacity 
            style={[styles.paymentItem, paymentMethod === 'ZALOPAY' && styles.activePayment]}
            onPress={() => setPaymentMethod('ZALOPAY')}
          >
            <View style={[styles.paymentLogo, { backgroundColor: '#0068FF' }]}>
              <Text style={styles.logoText}>Z</Text>
            </View>
            <Text style={[styles.paymentLabel, paymentMethod === 'ZALOPAY' && styles.activePaymentText]}>ZaloPay</Text>
          </TouchableOpacity>
        </ScrollView>

        {/* Book Button */}
        <TouchableOpacity 
          style={[styles.bookButton, (!dropoff || loading) && styles.disabledButton]} 
          onPress={handleBooking}
          disabled={!dropoff || loading}
        >
          {loading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <>
              <Text style={styles.bookButtonText}>CONFIRM {vehicleType}</Text>
              <Navigation size={20} color="#fff" />
            </>
          )}
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8F9FB',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 15,
    paddingVertical: 10,
    backgroundColor: '#fff',
  },
  backButton: {
    padding: 5,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginLeft: 10,
  },
  scrollContent: {
    paddingBottom: 20,
  },
  mapContainer: {
    height: 200,
    width: '100%',
    marginBottom: -20,
  },
  map: {
    flex: 1,
  },
  card: {
    marginHorizontal: 20,
    backgroundColor: '#fff',
    borderRadius: 20,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 10,
    elevation: 5,
    marginBottom: 25,
  },
  inputGroup: {
    flexDirection: 'row',
  },
  iconColumn: {
    alignItems: 'center',
    width: 30,
    paddingVertical: 10,
    justifyContent: 'space-between',
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  line: {
    flex: 1,
    width: 2,
    backgroundColor: '#EEE',
    marginVertical: 4,
  },
  inputsColumn: {
    flex: 1,
    marginLeft: 10,
  },
  inputWrapper: {
    paddingVertical: 5,
  },
  label: {
    fontSize: 12,
    color: '#999',
    marginBottom: 4,
    textTransform: 'uppercase',
  },
  input: {
    fontSize: 16,
    color: '#111',
    fontWeight: '500',
    paddingVertical: 4,
  },
  divider: {
    height: 1,
    backgroundColor: '#F2F2F2',
    marginVertical: 10,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#111',
    marginBottom: 15,
    paddingHorizontal: 20,
  },
  vehicleGrid: {
    flexDirection: 'row',
    gap: 15,
    marginBottom: 25,
    paddingHorizontal: 20,
  },
  vehicleItem: {
    flex: 1,
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 15,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: 'transparent',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 5,
    elevation: 2,
  },
  activeVehicle: {
    borderColor: '#6366F1',
    backgroundColor: '#EEF2FF',
  },
  vehicleIcon: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#F5F5F5',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 10,
  },
  activeIcon: {
    backgroundColor: '#6366F1',
  },
  vehicleLabel: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#111',
  },
  vehiclePrice: {
    fontSize: 12,
    color: '#666',
    marginTop: 2,
  },
  paymentCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#fff',
    padding: 15,
    borderRadius: 12,
    marginBottom: 25,
  },
  paymentInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  paymentText: {
    fontSize: 15,
    fontWeight: '500',
  },
  changeText: {
    color: '#6366F1',
    fontWeight: '800',
  },
  paymentList: {
    marginBottom: 25,
    flexDirection: 'row',
    paddingHorizontal: 20,
  },
  paymentItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    paddingHorizontal: 15,
    paddingVertical: 12,
    borderRadius: 12,
    marginRight: 12,
    borderWidth: 2,
    borderColor: 'transparent',
    gap: 10,
  },
  activePayment: {
    borderColor: '#6366F1',
    backgroundColor: '#EEF2FF',
  },
  paymentLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#666',
  },
  activePaymentText: {
    color: '#6366F1',
  },
  paymentLogo: {
    width: 24,
    height: 24,
    borderRadius: 6,
    justifyContent: 'center',
    alignItems: 'center',
  },
  logoText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: 'bold',
  },
  bookButton: {
    marginHorizontal: 20,
    backgroundColor: '#6366F1',
    height: 58,
    borderRadius: 18,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 12,
    shadowColor: '#6366F1',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.3,
    shadowRadius: 15,
    elevation: 8,
  },
  disabledButton: {
    backgroundColor: '#CCC',
    shadowOpacity: 0,
    elevation: 0,
  },
  bookButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
  }
});
