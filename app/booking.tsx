import React, { useState } from 'react';
import { StyleSheet, View, Text, ScrollView, TextInput, TouchableOpacity, ActivityIndicator, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Car, Bike, MapPin, Navigation, CreditCard, ChevronLeft } from 'lucide-react-native';
import { Colors } from '@/constants/Colors';
import api, { GATEWAY_URL, BOOKING_SERVICE_URL } from '@/services/api';
import { useRouter } from 'expo-router';

export default function BookingScreen() {
  const router = useRouter();
  const [pickup, setPickup] = useState('12 Nguyen Van Bao, Go Vap');
  const [dropoff, setDropoff] = useState('');
  const [vehicleType, setVehicleType] = useState('CAR');
  const [loading, setLoading] = useState(false);

  const handleBooking = async () => {
    if (!pickup || !dropoff) {
      Alert.alert('Error', 'Please enter both pickup and destination');
      return;
    }

    setLoading(true);
    try {
      const bookingRequest = {
        pickupLocation: pickup,
        dropoffLocation: dropoff,
        vehicleType: vehicleType,
        paymentMethod: 'CASH',
        estimatedFare: vehicleType === 'CAR' ? 55000 : 25000,
        customerNote: 'Please pick me up at the main gate',
        idempotencyKey: Math.random().toString(36).substring(7)
      };

      console.log('🚀 API POST to:', `${BOOKING_SERVICE_URL}/api/v1/bookings`);
      console.log('📦 Payload:', JSON.stringify(bookingRequest, null, 2));
      
      const response = await api.post(`${BOOKING_SERVICE_URL}/api/v1/bookings`, bookingRequest);
      
      console.log('✅ Response Status:', response.status);
      console.log('📄 Response Data:', JSON.stringify(response.data, null, 2));

      if (response.status === 200 || response.status === 201) {
        Alert.alert('Success', 'Your ride has been booked!', [
          { text: 'OK', onPress: () => router.replace('/(tabs)/explore') }
        ]);
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
            <Text style={styles.vehicleLabel}>GrabCar</Text>
            <Text style={styles.vehiclePrice}>~55k</Text>
          </TouchableOpacity>

          <TouchableOpacity 
            style={[styles.vehicleItem, vehicleType === 'BIKE' && styles.activeVehicle]}
            onPress={() => setVehicleType('BIKE')}
          >
            <View style={[styles.vehicleIcon, vehicleType === 'BIKE' && styles.activeIcon]}>
              <Bike size={32} color={vehicleType === 'BIKE' ? '#fff' : '#666'} />
            </View>
            <Text style={styles.vehicleLabel}>GrabBike</Text>
            <Text style={styles.vehiclePrice}>~25k</Text>
          </TouchableOpacity>
        </View>

        {/* Payment Method */}
        <View style={styles.paymentCard}>
          <View style={styles.paymentInfo}>
            <CreditCard size={20} color="#666" />
            <Text style={styles.paymentText}>Cash Payment</Text>
          </View>
          <TouchableOpacity>
            <Text style={styles.changeText}>Change</Text>
          </TouchableOpacity>
        </View>

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
    padding: 20,
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 20,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 10,
    elevation: 3,
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
  },
  vehicleGrid: {
    flexDirection: 'row',
    gap: 15,
    marginBottom: 25,
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
    borderColor: '#00B14F',
    backgroundColor: '#F0FFF5',
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
    backgroundColor: '#00B14F',
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
    color: '#00B14F',
    fontWeight: 'bold',
  },
  bookButton: {
    backgroundColor: '#00B14F',
    height: 56,
    borderRadius: 16,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 10,
    shadowColor: '#00B14F',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 5,
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
