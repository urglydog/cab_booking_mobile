import React, { useState } from 'react';
import { StyleSheet, View, Text, ScrollView, TextInput, TouchableOpacity, ActivityIndicator, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Car, Bike, MapPin, Navigation, CreditCard, ChevronLeft, Gift } from 'lucide-react-native';
import { Colors } from '@/constants/Colors';
import api from '@/services/api';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter } from 'expo-router';
import MapView, { Marker, PROVIDER_GOOGLE } from 'react-native-maps';

const PROMO_CODES = [
  { id: 'promo-1', code: 'CABNEW', title: 'Mừng bạn mới', discount: 30000, description: 'Giảm trực tiếp 30k' },
  { id: 'promo-2', code: 'CABSUMMER', title: 'CAB Ngày nắng', discount: 15000, description: 'Giảm trực tiếp 15k' },
  { id: 'promo-3', code: 'CABVIP', title: 'CAB Tri ân VIP', discount: 50000, description: 'Giảm trực tiếp 50k' }
];

const MOCK_POPULAR_PLACES = [
  {
    text: 'Trường Đại học Công nghiệp TP.HCM (IUH)',
    place_name: '12 Nguyễn Văn Bảo, Phường 4, Gò Vấp, Thành phố Hồ Chí Minh',
    geometry: { coordinates: [106.6871, 10.8222] }
  },
  {
    text: 'Sân bay Quốc tế Tân Sơn Nhất (SGN)',
    place_name: 'Trường Sơn, Phường 2, Tân Bình, Thành phố Hồ Chí Minh',
    geometry: { coordinates: [106.6625, 10.8184] }
  },
  {
    text: 'Chợ Bến Thành',
    place_name: 'Đường Lê Lợi, Phường Bến Thành, Quận 1, Thành phố Hồ Chí Minh',
    geometry: { coordinates: [106.6990, 10.7725] }
  },
  {
    text: 'Dinh Độc Lập',
    place_name: '135 Nam Kỳ Khởi Nghĩa, Phường Bến Thành, Quận 1, Thành phố Hồ Chí Minh',
    geometry: { coordinates: [106.6953, 10.7769] }
  },
  {
    text: 'Nhà thờ Đức Bà Sài Gòn',
    place_name: '01 Công xã Paris, Phường Bến Nghé, Quận 1, Thành phố Hồ Chí Minh',
    geometry: { coordinates: [106.6980, 10.7798] }
  },
  {
    text: 'Landmark 81',
    place_name: '720A Điện Biên Phủ, Phường 22, Bình Thạnh, Thành phố Hồ Chí Minh',
    geometry: { coordinates: [106.7218, 10.7948] }
  }
];

export default function BookingScreen() {
  const router = useRouter();
  const [pickup, setPickup] = useState('12 Nguyen Van Bao, Go Vap');
  const [pickupCoords, setPickupCoords] = useState({ latitude: 10.822, longitude: 106.687 });
  const [dropoff, setDropoff] = useState('');
  const [dropoffCoords, setDropoffCoords] = useState<{ latitude: number, longitude: number } | null>(null);

  const [vehicleType, setVehicleType] = useState('CAR');
  const [paymentMethod, setPaymentMethod] = useState('CASH');
  const [loading, setLoading] = useState(false);
  const [carPrice, setCarPrice] = useState<number | null>(null);
  const [bikePrice, setBikePrice] = useState<number | null>(null);
  const [selectedPromo, setSelectedPromo] = useState<any>(null);

  // Autocomplete states
  const [suggestions, setSuggestions] = useState<any[]>([]);
  const [activeSearch, setActiveSearch] = useState<'pickup' | 'dropoff' | null>(null);
  const [searching, setSearching] = useState(false);

  // Map selected vehicle type to API value
  const getVehicleTypeForApi = (type: string) => {
    switch (type) {
      case 'CAR': return 'CAR4';
      case 'BIKE': return 'BIKE';
      default: return 'CAR4';
    }
  };

  // Fetch address suggestions from Mapbox Geocoding API + Local popular places
  const handleAddressSearch = async (text: string, type: 'pickup' | 'dropoff') => {
    if (type === 'pickup') {
      setPickup(text);
    } else {
      setDropoff(text);
    }

    if (text.trim().length < 2) {
      setSuggestions([]);
      return;
    }

    setSearching(true);
    try {
      // 1. Search local popular places first (handles Vietnamese abbreviations like IUH, SGN...)
      const queryLower = text.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
      const localMatches = MOCK_POPULAR_PLACES.filter(place => {
        const placeTextNorm = place.text.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
        const placeNameNorm = place.place_name.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
        return placeTextNorm.includes(queryLower) || placeNameNorm.includes(queryLower);
      });

      // 2. Fetch from Mapbox API for general addresses
      const MAPBOX_KEY = process.env.EXPO_PUBLIC_MAPBOX_KEY || '';
      const response = await fetch(
        `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(text)}.json?access_token=${MAPBOX_KEY}&country=vn&limit=5&language=vi`
      );
      const data = await response.json();
      const apiFeatures = data.features || [];

      // 3. Combine both lists, keeping local matches on top
      const combined = [...localMatches];
      
      apiFeatures.forEach((feat: any) => {
        const isDuplicate = localMatches.some(local => 
          local.place_name.toLowerCase().includes(feat.text.toLowerCase()) || 
          feat.place_name.toLowerCase().includes(local.place_name.toLowerCase())
        );
        if (!isDuplicate) {
          combined.push(feat);
        }
      });

      setSuggestions(combined);
    } catch (e) {
      console.error('Failed to geocode address via Mapbox:', e);
    } finally {
      setSearching(false);
    }
  };

  const handleSelectSuggestion = (item: any) => {
    // Mapbox geometry.coordinates is [longitude, latitude]
    const coords = {
      latitude: item.geometry.coordinates[1],
      longitude: item.geometry.coordinates[0]
    };
    
    if (activeSearch === 'pickup') {
      setPickup(item.place_name);
      setPickupCoords(coords);
    } else if (activeSearch === 'dropoff') {
      setDropoff(item.place_name);
      setDropoffCoords(coords);
    }
    
    setSuggestions([]);
    setActiveSearch(null);
  };

  React.useEffect(() => {
    const fetchPrices = async () => {
      if (!pickupCoords || !dropoffCoords) return;
      try {
        const [carRes, bikeRes] = await Promise.all([
          api.post('/api/pricing/estimate', {
            pickupLat: pickupCoords.latitude,
            pickupLng: pickupCoords.longitude,
            dropoffLat: dropoffCoords.latitude,
            dropoffLng: dropoffCoords.longitude,
            vehicleType: 'ECONOMY'
          }),
          api.post('/api/pricing/estimate', {
            pickupLat: pickupCoords.latitude,
            pickupLng: pickupCoords.longitude,
            dropoffLat: dropoffCoords.latitude,
            dropoffLng: dropoffCoords.longitude,
            vehicleType: 'ECONOMY'
          })
        ]);
        setCarPrice(carRes.data?.totalFare || 55000);
        setBikePrice(bikeRes.data?.totalFare || 25000);
      } catch (e) {
        console.error('Failed to fetch pricing:', e);
        // Fallback pricing based on dynamic coordinates distance
        const latDiff = Math.abs(pickupCoords.latitude - dropoffCoords.latitude);
        const lngDiff = Math.abs(pickupCoords.longitude - dropoffCoords.longitude);
        const distanceKm = (latDiff + lngDiff) * 111; // Rough km estimate
        const calculatedCar = Math.max(30000, Math.round(20000 + distanceKm * 12000));
        const calculatedBike = Math.max(15000, Math.round(10000 + distanceKm * 5000));
        setCarPrice(calculatedCar);
        setBikePrice(calculatedBike);
      }
    };
    fetchPrices();
  }, [pickupCoords, dropoffCoords]);

  const handleBooking = async () => {
    if (!pickup || !dropoff) {
      Alert.alert('Error', 'Please enter both pickup and destination');
      return;
    }

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
      // Get user info from storage
      const customerId = await AsyncStorage.getItem('user_id') || '';

      // Generate idempotency key per API guide
      const idempotencyKey = `${Date.now()}_${Math.random().toString(36).substring(2, 10)}`;

      const baseFare = vehicleType === 'CAR' ? carPrice : bikePrice;
      const discount = selectedPromo ? selectedPromo.discount : 0;
      const finalFare = Math.max(0, (baseFare || 0) - discount);

      const bookingRequest = {
        customerId,
        pickupLocation: pickup,
        dropoffLocation: dropoff,
        pickupLat: pickupCoords.latitude,
        pickupLng: pickupCoords.longitude,
        dropoffLat: dropoffCoords ? dropoffCoords.latitude : 10.8331,
        dropoffLng: dropoffCoords ? dropoffCoords.longitude : 106.6731,
        vehicleType: getVehicleTypeForApi(vehicleType),
        paymentMethod,
        estimatedFare: finalFare,
        customerNote: selectedPromo ? `Áp dụng mã ${selectedPromo.code}` : 'Please pick me up at the main gate',
        idempotencyKey,
      };

      // Gateway (Config Server): /api/v1/bookings/** → lb://booking-service
      const response = await api.post(`/api/v1/bookings`, bookingRequest);
      
      console.log('✅ Booking Response Status:', response.status);
      console.log('📄 Booking Response Data:', JSON.stringify(response.data, null, 2));

      // Handle response: { code, message, result } OR plain 2xx
      const isSuccess = response.data?.code === 200 || response.data?.code === 201
        || (response.status >= 200 && response.status < 300 && response.data?.result);
      if (isSuccess) {
        const bookingId = response.data?.result?.id || response.data?.id;
        router.replace({
          pathname: '/matching',
          params: { bookingId: bookingId }
        });
      } else {
        const errorMsg = response.data?.errorMessage || response.data?.message || 'Failed to create booking';
        Alert.alert('Booking Error', errorMsg);
      }
    } catch (error: any) {
      console.error('Booking Error:', error);
      
      // Handle different error types
      if (error.response?.status === 409) {
        // Idempotency key conflict - booking might already exist
        const existingBookingId = error.response?.data?.result?.id;
        if (existingBookingId) {
          router.replace({
            pathname: '/matching',
            params: { bookingId: existingBookingId }
          });
          return;
        }
        Alert.alert('Booking Conflict', 'This booking request was already processed. Please try a different route.');
      } else {
        const errorMsg = error.response?.data?.message || error.response?.data?.errorMessage || 'Failed to book ride. Please check booking-service logs.';
        Alert.alert('Booking Failed', errorMsg);
      }
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
            region={{
              latitude: dropoffCoords ? (pickupCoords.latitude + dropoffCoords.latitude) / 2 : pickupCoords.latitude,
              longitude: dropoffCoords ? (pickupCoords.longitude + dropoffCoords.longitude) / 2 : pickupCoords.longitude,
              latitudeDelta: dropoffCoords ? Math.abs(pickupCoords.latitude - dropoffCoords.latitude) * 2 + 0.02 : 0.04,
              longitudeDelta: dropoffCoords ? Math.abs(pickupCoords.longitude - dropoffCoords.longitude) * 2 + 0.02 : 0.04,
            }}
          >
            {/* Pickup point */}
            <Marker
              coordinate={pickupCoords}
              title="Điểm đón khách"
              description={pickup}
              pinColor="#10B981"
            />

            {/* Dynamic Destination Marker */}
            {dropoffCoords && (
              <Marker
                coordinate={dropoffCoords}
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
                  onChangeText={(text) => handleAddressSearch(text, 'pickup')}
                  onFocus={() => setActiveSearch('pickup')}
                />
              </View>
              
              <View style={styles.divider} />
              
              <View style={styles.inputWrapper}>
                <Text style={styles.label}>Destination</Text>
                <TextInput
                  style={styles.input}
                  placeholder="Where to?"
                  value={dropoff}
                  onChangeText={(text) => handleAddressSearch(text, 'dropoff')}
                  onFocus={() => setActiveSearch('dropoff')}
                  autoFocus
                />
              </View>
            </View>
          </View>
        </View>

        {/* Suggestions list drop-down */}
        {suggestions.length > 0 && activeSearch && (
          <View style={styles.suggestionsContainer}>
            {searching && <ActivityIndicator size="small" color="#6366F1" style={{ marginVertical: 8 }} />}
            {suggestions.map((item, index) => (
              <TouchableOpacity
                key={index}
                style={styles.suggestionItem}
                onPress={() => handleSelectSuggestion(item)}
              >
                <MapPin size={18} color="#6366F1" />
                <View style={styles.suggestionTextContainer}>
                  <Text style={styles.suggestionTitle} numberOfLines={1}>
                    {item.text || item.place_name.split(',')[0]}
                  </Text>
                  <Text style={styles.suggestionSubtitle} numberOfLines={1}>
                    {item.place_name}
                  </Text>
                </View>
              </TouchableOpacity>
            ))}
          </View>
        )}

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

          <TouchableOpacity
            style={[styles.paymentItem, paymentMethod === 'VNPAY' && styles.activePayment]}
            onPress={() => setPaymentMethod('VNPAY')}
          >
            <View style={[styles.paymentLogo, { backgroundColor: '#AA2B52' }]}>
              <Text style={[styles.logoText, { fontSize: 10 }]}>V</Text>
            </View>
            <Text style={[styles.paymentLabel, paymentMethod === 'VNPAY' && styles.activePaymentText]}>VNPay</Text>
          </TouchableOpacity>
        </ScrollView>

        {/* Promo Code Selection */}
        <Text style={styles.sectionTitle}>Chọn khuyến mãi 🎁</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.promoList}>
          {PROMO_CODES.map((promo) => {
            const isSelected = selectedPromo?.id === promo.id;
            return (
              <TouchableOpacity
                key={promo.id}
                style={[styles.promoItem, isSelected && styles.activePromo]}
                onPress={() => setSelectedPromo(isSelected ? null : promo)}
              >
                <View style={[styles.promoIconContainer, isSelected && styles.activePromoIcon]}>
                  <Gift size={20} color={isSelected ? '#fff' : '#6366F1'} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.promoCodeText, isSelected && styles.activePromoText]}>{promo.code}</Text>
                  <Text style={styles.promoTitleText} numberOfLines={1}>{promo.title}</Text>
                  <Text style={styles.promoDescText} numberOfLines={1}>{promo.description}</Text>
                </View>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        {/* Fare Summary */}
        <View style={styles.fareSummaryCard}>
          <View style={styles.fareRow}>
            <Text style={styles.fareLabel}>Giá gốc:</Text>
            <Text style={styles.fareValue}>
              {vehicleType === 'CAR' 
                ? (carPrice ? `${carPrice.toLocaleString()}đ` : '...')
                : (bikePrice ? `${bikePrice.toLocaleString()}đ` : '...')
              }
            </Text>
          </View>
          {selectedPromo && (
            <View style={styles.fareRow}>
              <Text style={[styles.fareLabel, { color: '#10B981' }]}>Khuyến mãi ({selectedPromo.code}):</Text>
              <Text style={[styles.fareValue, { color: '#10B981', fontWeight: '600' }]}>
                -{selectedPromo.discount.toLocaleString()}đ
              </Text>
            </View>
          )}
          <View style={styles.fareDivider} />
          <View style={styles.fareRow}>
            <Text style={[styles.fareLabel, { fontWeight: 'bold', fontSize: 15, color: '#1F2937' }]}>Tổng thanh toán:</Text>
            <Text style={[styles.fareValue, { fontWeight: 'bold', fontSize: 17, color: '#6366F1' }]}>
              {(() => {
                const baseFare = vehicleType === 'CAR' ? carPrice : bikePrice;
                const discount = selectedPromo ? selectedPromo.discount : 0;
                return `${Math.max(0, (baseFare || 0) - discount).toLocaleString()}đ`;
              })()}
            </Text>
          </View>
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
              <Text style={styles.bookButtonText}>CONFIRM {vehicleType === 'CAR' ? 'CAR' : 'BIKE'}</Text>
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
  },
  promoList: {
    marginBottom: 20,
    flexDirection: 'row',
    paddingHorizontal: 20,
  },
  promoItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    paddingHorizontal: 15,
    paddingVertical: 12,
    borderRadius: 16,
    marginRight: 12,
    borderWidth: 2,
    borderColor: 'transparent',
    gap: 12,
    width: 210,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 5,
    elevation: 2,
  },
  activePromo: {
    borderColor: '#6366F1',
    backgroundColor: '#EEF2FF',
  },
  promoIconContainer: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#EEF2FF',
    justifyContent: 'center',
    alignItems: 'center',
  },
  activePromoIcon: {
    backgroundColor: '#6366F1',
  },
  promoCodeText: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#6366F1',
  },
  activePromoText: {
    color: '#6366F1',
  },
  promoTitleText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#1F2937',
    marginTop: 2,
  },
  promoDescText: {
    fontSize: 10,
    color: '#9CA3AF',
    marginTop: 1,
  },
  fareSummaryCard: {
    marginHorizontal: 20,
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 16,
    marginBottom: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 5,
    elevation: 2,
  },
  fareRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginVertical: 4,
  },
  fareLabel: {
    fontSize: 14,
    color: '#6B7280',
  },
  fareValue: {
    fontSize: 14,
    fontWeight: '500',
    color: '#1F2937',
  },
  fareDivider: {
    height: 1,
    backgroundColor: '#F3F4F6',
    marginVertical: 8,
  },
  suggestionsContainer: {
    marginHorizontal: 20,
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 8,
    marginTop: -10,
    marginBottom: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 10,
    elevation: 4,
    borderWidth: 1,
    borderColor: '#F3F4F6',
    maxHeight: 250,
  },
  suggestionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#F9FAFB',
    gap: 12,
  },
  suggestionTextContainer: {
    flex: 1,
  },
  suggestionTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1F2937',
  },
  suggestionSubtitle: {
    fontSize: 11,
    color: '#9CA3AF',
    marginTop: 2,
  },
});
