import React, { useState, useEffect } from 'react';
import { StyleSheet, View, Text, TouchableOpacity, ActivityIndicator, Alert, Switch, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Navigation, MapPin, Play, CheckCircle2, Navigation2, Check, X, Shield, Phone, MessageSquare } from 'lucide-react-native';
import MapView, { Marker, Polyline } from 'react-native-maps';
import api from '@/services/api';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Pre-seeded high-fidelity route coordinates from Gò Vấp (IUH) to District 1 (Notre Dame Cathedral)
const routeCoordinates = [
  { latitude: 10.8220, longitude: 106.6870 }, // 1. 12 Nguyễn Văn Bảo (IUH Entrance)
  { latitude: 10.8210, longitude: 106.6830 }, // 2. Nguyễn Văn Bảo & Nguyễn Kiệm junction
  { latitude: 10.8140, longitude: 106.6780 }, // 3. Nguyễn Kiệm (Gia Định Park)
  { latitude: 10.8030, longitude: 106.6760 }, // 4. Phú Nhuận Intersection (Hoàng Văn Thụ)
  { latitude: 10.7930, longitude: 106.6810 }, // 5. Trần Huy Liệu & Nam Kỳ Khởi Nghĩa
  { latitude: 10.7900, longitude: 106.6840 }, // 6. Nam Kỳ Khởi Nghĩa (Cầu Công Lý bridge)
  { latitude: 10.7850, longitude: 106.6900 }, // 7. Nam Kỳ Khởi Nghĩa & Điện Biên Phủ
  { latitude: 10.7790, longitude: 106.6990 }  // 8. Nhà thờ Đức Bà, Quận 1 (Notre Dame Cathedral)
];

export default function DriverHomeScreen() {
  const [isOnline, setIsOnline] = useState(false);
  const [loading, setLoading] = useState(false);
  const [driverName, setDriverName] = useState('Tài xế');
  
  // Trip Simulation State Machine
  // States: 'IDLE' | 'PROPOSAL' | 'ACCEPTED' | 'ARRIVED' | 'IN_PROGRESS' | 'COMPLETED_SUCCESS'
  const [tripState, setTripState] = useState<'IDLE' | 'PROPOSAL' | 'ACCEPTED' | 'ARRIVED' | 'IN_PROGRESS' | 'COMPLETED_SUCCESS'>('IDLE');
  const [countdown, setCountdown] = useState(15);
  const [currentTrip, setCurrentTrip] = useState<any>(null);

  // Load Driver Name on mount
  useEffect(() => {
    const loadProfile = async () => {
      try {
        const name = await AsyncStorage.getItem('user_name');
        if (name) setDriverName(name);
        
        // Attempt to fetch profile from driver-service to check real profile
        const res = await api.get('/api/drivers/me/profile');
        if (res.data && res.data.result) {
          setDriverName(res.data.result.fullName || name);
        }
      } catch (err) {
        console.log('Driver profile load from API failed (using local fallback name)');
      }
    };
    loadProfile();
  }, []);

  // Simulate Ride Proposal when online
  useEffect(() => {
    let timer: any;
    if (isOnline && tripState === 'IDLE') {
      timer = setTimeout(() => {
        // Pop up a mock ride request
        setCurrentTrip({
          id: 'booking-mock-999',
          customerName: 'Trần Quốc Bảo',
          phone: '0901234567',
          pickupLocation: '12 Nguyễn Văn Bảo, Gò Vấp (Đại học Công nghiệp TP.HCM)',
          dropoffLocation: 'Nhà thờ Đức Bà, Quận 1',
          estimatedFare: 95000,
          paymentMethod: 'CASH',
          distance: '6.4 km',
          time: '15 phút'
        });
        setCountdown(15);
        setTripState('PROPOSAL');
      }, 5000); // 5 seconds of scanning leads to a ride proposal!
    }
    return () => clearTimeout(timer);
  }, [isOnline, tripState]);

  // Proposal countdown timer
  useEffect(() => {
    let timer: any;
    if (tripState === 'PROPOSAL' && countdown > 0) {
      timer = setInterval(() => {
        setCountdown(c => c - 1);
      }, 1000);
    } else if (tripState === 'PROPOSAL' && countdown === 0) {
      // Auto reject when timer hits 0
      setTripState('IDLE');
      Alert.alert('Bỏ lỡ chuyến xe', 'Bạn đã không nhận cuốc xe kịp thời.');
    }
    return () => clearInterval(timer);
  }, [tripState, countdown]);

  const toggleOnline = async (value: boolean) => {
    setLoading(true);
    try {
      // Sync availability with backend driver-service matching Spring DTO
      await api.patch('/api/drivers/me/availability', {
        availabilityStatus: value ? 'ONLINE' : 'OFFLINE',
        currentLatitude: 10.822, // Simulated IUH campus coordinates
        currentLongitude: 106.687
      });
      setIsOnline(value);
      if (!value) {
        setTripState('IDLE');
      }
    } catch (error: any) {
      console.log('Failed to sync availability with server, updating locally:', error.message || error);
      setIsOnline(value);
      if (!value) {
        setTripState('IDLE');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleAcceptTrip = async () => {
    try {
      // Try accepting through API if running real
      await api.post(`/api/drivers/me/rides/${currentTrip.id}/accept`);
    } catch (e) {
      console.log('Simulated Accept (using local state)');
    }
    setTripState('ACCEPTED');
  };

  const handleRejectTrip = () => {
    setTripState('IDLE');
  };

  const handleArriveAtPickup = async () => {
    try {
      await api.post(`/api/drivers/me/rides/${currentTrip.id}/arrive`);
    } catch (e) {
      console.log('Simulated Arrive');
    }
    setTripState('ARRIVED');
  };

  const handleStartTrip = async () => {
    try {
      await api.post(`/api/drivers/me/rides/${currentTrip.id}/start`);
    } catch (e) {
      console.log('Simulated Start');
    }
    setTripState('IN_PROGRESS');
  };

  const handleCompleteTrip = async () => {
    try {
      await api.post(`/api/drivers/me/rides/${currentTrip.id}/complete`, {
        actualFare: currentTrip.estimatedFare
      });
    } catch (e) {
      console.log('Simulated Complete');
    }
    
    // Save to local storage driver-jobs list so it populates jobs.tsx!
    try {
      const existingJobsJson = await AsyncStorage.getItem('driver_completed_jobs');
      const jobs = existingJobsJson ? JSON.parse(existingJobsJson) : [];
      const newJob = {
        id: currentTrip.id,
        dropoffLocation: currentTrip.dropoffLocation,
        pickupLocation: currentTrip.pickupLocation,
        estimatedFare: currentTrip.estimatedFare,
        createdAt: new Date().toISOString(),
        customerName: currentTrip.customerName
      };
      await AsyncStorage.setItem('driver_completed_jobs', JSON.stringify([newJob, ...jobs]));

      // Update local driver earnings
      const existingEarnings = await AsyncStorage.getItem('driver_earnings');
      const currentEarnings = existingEarnings ? parseFloat(existingEarnings) : 0;
      await AsyncStorage.setItem('driver_earnings', (currentEarnings + currentTrip.estimatedFare).toString());
    } catch (storageError) {
      console.log('Failed to save simulated earnings:', storageError);
    }

    setTripState('COMPLETED_SUCCESS');
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerProfile}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>TX</Text>
          </View>
          <View style={styles.driverMeta}>
            <Text style={styles.driverWelcome}>Xin chào,</Text>
            <Text style={styles.driverName}>{driverName}</Text>
          </View>
        </View>
        
        {/* Toggle Switch */}
        <View style={styles.onlineToggleWrapper}>
          <Text style={[styles.toggleText, isOnline ? styles.textOnline : styles.textOffline]}>
            {isOnline ? 'Đang Online' : 'Đang Offline'}
          </Text>
          {loading ? (
            <ActivityIndicator size="small" color="#6366F1" style={{ marginLeft: 8 }} />
          ) : (
            <Switch
              value={isOnline}
              onValueChange={toggleOnline}
              trackColor={{ false: '#D1D5DB', true: '#C7D2FE' }}
              thumbColor={isOnline ? '#6366F1' : '#F3F4F6'}
            />
          )}
        </View>
      </View>

      <View style={styles.content}>
        {isOnline ? (
          <>
            {/* Full-Screen Native Map View */}
            <MapView
              style={styles.map}
              initialRegion={{
                latitude: 10.822,
                longitude: 106.687,
                latitudeDelta: 0.04,
                longitudeDelta: 0.04,
              }}
            >
              {/* Driver Active GPS Marker */}
              <Marker
                coordinate={{ latitude: 10.8225, longitude: 106.6872 }}
                title="Vị trí của bạn"
                description="Bạn đang trực tuyến nhận khách"
                pinColor="#6366F1"
              />

              {/* Render Trip locations if proposed or in progress */}
              {currentTrip && tripState !== 'IDLE' && (
                <>
                  <Marker
                    coordinate={{ latitude: 10.822, longitude: 106.687 }}
                    title="Điểm đón khách"
                    description={currentTrip.pickupLocation}
                    pinColor="#10B981"
                  />
                  <Marker
                    coordinate={{ latitude: 10.779, longitude: 106.699 }}
                    title="Điểm trả khách"
                    description={currentTrip.dropoffLocation}
                    pinColor="#EF4444"
                  />
                  
                  {/* Real-time street route polyline for the driver */}
                  <Polyline
                    coordinates={routeCoordinates}
                    strokeColor="#6366F1"
                    strokeWidth={4}
                  />
                </>
              )}
            </MapView>

            {/* Float Cards Over Map */}
            {tripState === 'IDLE' && (
              <View style={styles.floatingScanningCard}>
                <View style={styles.scanningHeader}>
                  <ActivityIndicator size="small" color="#6366F1" />
                  <Text style={styles.scanningTitle}>Đang quét chuyến xe gần nhất...</Text>
                </View>
                <Text style={styles.scanningDesc}>
                  Radar định vị GPS đang hoạt động trong bán kính 5km. Vui lòng giữ ứng dụng mở để tự động nhận yêu cầu đặt xe.
                </Text>
              </View>
            )}

            {tripState === 'PROPOSAL' && currentTrip && (
              <View style={styles.floatingProposalCard}>
                <View style={styles.proposalHeader}>
                  <Text style={styles.proposalTitle}>CÓ CUỐC XE MỚI GẦN BẠN!</Text>
                  <View style={styles.timerBadge}>
                    <Text style={styles.timerText}>{countdown}s</Text>
                  </View>
                </View>

                <View style={styles.proposalDetails}>
                  <View style={styles.passengerRow}>
                    <Text style={styles.passengerLabel}>Khách hàng:</Text>
                    <Text style={styles.passengerValue}>{currentTrip.customerName}</Text>
                  </View>

                  {/* Route Timeline in Proposal */}
                  <View style={styles.routeContainer}>
                    <View style={styles.iconCol}>
                      <View style={styles.pickupDot} />
                      <View style={styles.lineConnector} />
                      <MapPin size={18} color="#EF4444" />
                    </View>
                    <View style={styles.addressCol}>
                      <Text style={styles.addressTitle}>Điểm đón:</Text>
                      <Text style={styles.addressText} numberOfLines={1}>{currentTrip.pickupLocation}</Text>
                      
                      <Text style={[styles.addressTitle, { marginTop: 10 }]}>Điểm trả:</Text>
                      <Text style={styles.addressText} numberOfLines={1}>{currentTrip.dropoffLocation}</Text>
                    </View>
                  </View>

                  {/* Stats Grid */}
                  <View style={styles.statsGrid}>
                    <View style={styles.statBox}>
                      <Text style={styles.statLabel}>Cự ly</Text>
                      <Text style={styles.statValue}>{currentTrip.distance}</Text>
                    </View>
                    <View style={styles.statBox}>
                      <Text style={styles.statLabel}>Thời gian</Text>
                      <Text style={styles.statValue}>{currentTrip.time}</Text>
                    </View>
                    <View style={styles.statBox}>
                      <Text style={styles.statLabel}>Thanh toán</Text>
                      <Text style={styles.statValue}>Tiền mặt</Text>
                    </View>
                  </View>

                  {/* Price Tag */}
                  <View style={styles.priceTagRow}>
                    <Text style={styles.priceTagLabel}>Bạn sẽ nhận được:</Text>
                    <Text style={styles.priceTagValue}>{currentTrip.estimatedFare?.toLocaleString()}đ</Text>
                  </View>

                  {/* Actions */}
                  <View style={styles.proposalActions}>
                    <TouchableOpacity style={styles.rejectButton} onPress={handleRejectTrip}>
                      <X size={18} color="#EF4444" />
                      <Text style={styles.rejectButtonText}>Từ chối</Text>
                    </TouchableOpacity>

                    <TouchableOpacity style={styles.acceptButton} onPress={handleAcceptTrip}>
                      <Check size={18} color="#FFF" />
                      <Text style={styles.acceptButtonText}>NHẬN CUỐC XE</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              </View>
            )}

            {(tripState === 'ACCEPTED' || tripState === 'ARRIVED' || tripState === 'IN_PROGRESS') && currentTrip && (
              <View style={styles.floatingActiveCard}>
                <View style={[styles.activeStatusBadge, {
                  backgroundColor: tripState === 'ACCEPTED' ? '#F59E0B' : tripState === 'ARRIVED' ? '#6366F1' : '#10B981'
                }]}>
                  <Text style={styles.activeStatusText}>
                    {tripState === 'ACCEPTED' ? 'Đang di chuyển tới điểm đón' : 
                     tripState === 'ARRIVED' ? 'Đã đến điểm đón - Chờ khách lên xe' : 
                     'Đang chở khách đến điểm đến'}
                  </Text>
                </View>

                {/* Passenger contacts */}
                <View style={styles.passengerProfileRow}>
                  <View style={styles.passengerAvatar}>
                    <Text style={styles.passengerAvatarText}>KH</Text>
                  </View>
                  <View style={styles.passengerInfo}>
                    <Text style={styles.passengerNameText}>{currentTrip.customerName}</Text>
                    <Text style={styles.passengerPhoneText}>{currentTrip.phone}</Text>
                  </View>
                  <View style={styles.contactButtons}>
                    <TouchableOpacity style={styles.contactCircle} onPress={() => Alert.alert('Gọi điện', 'Đang kết nối cuộc gọi...')}>
                      <Phone size={16} color="#6366F1" />
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.contactCircle} onPress={() => Alert.alert('Trò chuyện', 'Mở khung chat...')}>
                      <MessageSquare size={16} color="#6366F1" />
                    </TouchableOpacity>
                  </View>
                </View>

                {/* Location target description */}
                <View style={styles.activeRouteBox}>
                  <Text style={styles.activeRouteLabel}>
                    {tripState === 'IN_PROGRESS' ? 'Điểm trả khách:' : 'Điểm đón khách:'}
                  </Text>
                  <Text style={styles.activeRouteText} numberOfLines={1}>
                    {tripState === 'IN_PROGRESS' ? currentTrip.dropoffLocation : currentTrip.pickupLocation}
                  </Text>
                </View>

                {/* Fare Summary and button */}
                <View style={styles.activeFareRow}>
                  <Text style={styles.activeFareLabel}>Tổng cước:</Text>
                  <Text style={styles.activeFareValue}>{currentTrip.estimatedFare?.toLocaleString()}đ</Text>
                </View>

                <View style={styles.stepProgressContainer}>
                  {tripState === 'ACCEPTED' && (
                    <TouchableOpacity style={styles.progressButton} onPress={handleArriveAtPickup}>
                      <CheckCircle2 size={20} color="#FFF" />
                      <Text style={styles.progressButtonText}>XÁC NHẬN ĐÃ ĐẾN ĐIỂM ĐÓN</Text>
                    </TouchableOpacity>
                  )}

                  {tripState === 'ARRIVED' && (
                    <TouchableOpacity style={[styles.progressButton, { backgroundColor: '#10B981' }]} onPress={handleStartTrip}>
                      <Play size={20} color="#FFF" />
                      <Text style={styles.progressButtonText}>BẮT ĐẦU CHUYẾN XE</Text>
                    </TouchableOpacity>
                  )}

                  {tripState === 'IN_PROGRESS' && (
                    <TouchableOpacity style={[styles.progressButton, { backgroundColor: '#6366F1' }]} onPress={handleCompleteTrip}>
                      <CheckCircle2 size={20} color="#FFF" />
                      <Text style={styles.progressButtonText}>HOÀN THÀNH CHUYẾN ĐI</Text>
                    </TouchableOpacity>
                  )}
                </View>
              </View>
            )}

            {tripState === 'COMPLETED_SUCCESS' && currentTrip && (
              <View style={styles.floatingSuccessCard}>
                <View style={styles.successCheckCircle}>
                  <Check size={36} color="#FFF" />
                </View>
                <Text style={styles.successTitle}>CHUYẾN ĐI HOÀN THÀNH!</Text>
                
                <View style={styles.successSummaryBox}>
                  <View style={styles.successSummaryRow}>
                    <Text style={styles.successSummaryLabel}>Cước thu được:</Text>
                    <Text style={styles.successSummaryFare}>+{currentTrip.estimatedFare?.toLocaleString()}đ</Text>
                  </View>
                  <View style={styles.successSummaryRow}>
                    <Text style={styles.successSummaryLabel}>Khách hàng:</Text>
                    <Text style={styles.successSummaryValue}>{currentTrip.customerName}</Text>
                  </View>
                </View>

                <TouchableOpacity style={styles.successReturnButton} onPress={() => setTripState('IDLE')}>
                  <Text style={styles.successReturnButtonText}>TIẾP TỤC NHẬN CUỐC</Text>
                </TouchableOpacity>
              </View>
            )}
          </>
        ) : (
          /* Offline screen layout */
          <View style={styles.offlineBox}>
            <View style={styles.offlineCircle}>
              <Shield size={48} color="#9CA3AF" />
            </View>
            <Text style={styles.offlineTitle}>Bạn đang Ngoại tuyến</Text>
            <Text style={styles.offlineDesc}>
              Bật công tắc Online phía trên góc phải để bắt đầu quét các yêu cầu di chuyển xung quanh và tăng thu nhập ngay!
            </Text>
            <TouchableOpacity style={styles.inlineOnlineButton} onPress={() => toggleOnline(true)}>
              <Text style={styles.inlineOnlineButtonText}>BẬT HOẠT ĐỘNG NGAY</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F9FAFB',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: '#FFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
    zIndex: 10,
  },
  headerProfile: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#6366F1',
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarText: {
    color: '#FFF',
    fontSize: 13,
    fontWeight: '800',
  },
  driverMeta: {
    marginLeft: 10,
  },
  driverWelcome: {
    fontSize: 10,
    color: '#9CA3AF',
    fontWeight: '600',
  },
  driverName: {
    fontSize: 14,
    fontWeight: '700',
    color: '#1F2937',
  },
  onlineToggleWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F3F4F6',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
  },
  toggleText: {
    fontSize: 11,
    fontWeight: '700',
    marginRight: 6,
  },
  textOnline: {
    color: '#10B981',
  },
  textOffline: {
    color: '#6B7280',
  },
  content: {
    flex: 1,
    position: 'relative',
  },
  map: {
    ...StyleSheet.absoluteFillObject,
  },
  offlineBox: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
    backgroundColor: '#FFF',
  },
  offlineCircle: {
    width: 90,
    height: 90,
    borderRadius: 45,
    backgroundColor: '#F3F4F6',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
  },
  offlineTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: '#374151',
    marginBottom: 8,
  },
  offlineDesc: {
    fontSize: 14,
    color: '#6B7280',
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 28,
  },
  inlineOnlineButton: {
    backgroundColor: '#6366F1',
    paddingVertical: 14,
    paddingHorizontal: 28,
    borderRadius: 25,
    shadowColor: '#6366F1',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 4,
  },
  inlineOnlineButtonText: {
    color: '#FFF',
    fontWeight: '800',
    fontSize: 14,
    letterSpacing: 0.5,
  },
  floatingScanningCard: {
    position: 'absolute',
    bottom: 24,
    left: 16,
    right: 16,
    backgroundColor: '#FFF',
    borderRadius: 20,
    padding: 18,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 6,
  },
  scanningHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 10,
  },
  scanningTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: '#6366F1',
  },
  scanningDesc: {
    fontSize: 13,
    color: '#6B7280',
    lineHeight: 18,
  },
  floatingProposalCard: {
    position: 'absolute',
    bottom: 16,
    left: 16,
    right: 16,
    backgroundColor: '#FFF',
    borderRadius: 24,
    borderWidth: 1.5,
    borderColor: '#6366F1',
    shadowColor: '#6366F1',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.2,
    shadowRadius: 16,
    elevation: 8,
    overflow: 'hidden',
  },
  proposalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#6366F1',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  proposalTitle: {
    color: '#FFF',
    fontSize: 13,
    fontWeight: '900',
  },
  timerBadge: {
    backgroundColor: '#FFF',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  timerText: {
    color: '#EF4444',
    fontSize: 12,
    fontWeight: '800',
  },
  proposalDetails: {
    padding: 16,
  },
  passengerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
    backgroundColor: '#F8FAFC',
    padding: 8,
    borderRadius: 8,
  },
  passengerLabel: {
    fontSize: 12,
    color: '#6B7280',
    fontWeight: '600',
  },
  passengerValue: {
    fontSize: 14,
    fontWeight: '800',
    color: '#1F2937',
    marginLeft: 6,
  },
  routeContainer: {
    flexDirection: 'row',
    marginBottom: 14,
  },
  iconCol: {
    width: 20,
    alignItems: 'center',
    marginTop: 4,
  },
  pickupDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#10B981',
  },
  lineConnector: {
    width: 1.5,
    height: 38,
    backgroundColor: '#E5E7EB',
    marginVertical: 3,
  },
  addressCol: {
    flex: 1,
    marginLeft: 8,
  },
  addressTitle: {
    fontSize: 10,
    color: '#9CA3AF',
    fontWeight: '700',
  },
  addressText: {
    fontSize: 13,
    color: '#1F2937',
    fontWeight: '650',
    marginTop: 1,
  },
  statsGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    backgroundColor: '#F3F4F6',
    borderRadius: 10,
    padding: 10,
    marginBottom: 14,
  },
  statBox: {
    flex: 1,
    alignItems: 'center',
  },
  statLabel: {
    fontSize: 10,
    color: '#6B7280',
    fontWeight: '600',
  },
  statValue: {
    fontSize: 13,
    fontWeight: '800',
    color: '#1F2937',
    marginTop: 1,
  },
  priceTagRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: '#F3F4F6',
    paddingTop: 12,
    marginBottom: 14,
  },
  priceTagLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#4B5563',
  },
  priceTagValue: {
    fontSize: 20,
    fontWeight: '900',
    color: '#6366F1',
  },
  proposalActions: {
    flexDirection: 'row',
    gap: 10,
  },
  rejectButton: {
    flex: 1,
    flexDirection: 'row',
    height: 48,
    borderWidth: 1.5,
    borderColor: '#EF4444',
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 4,
  },
  rejectButtonText: {
    color: '#EF4444',
    fontSize: 13,
    fontWeight: '700',
  },
  acceptButton: {
    flex: 2,
    flexDirection: 'row',
    height: 48,
    backgroundColor: '#6366F1',
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 4,
    shadowColor: '#6366F1',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 3,
  },
  acceptButtonText: {
    color: '#FFF',
    fontSize: 13,
    fontWeight: '800',
  },
  floatingActiveCard: {
    position: 'absolute',
    bottom: 16,
    left: 16,
    right: 16,
    backgroundColor: '#FFF',
    borderRadius: 24,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 6,
  },
  activeStatusBadge: {
    alignSelf: 'center',
    paddingHorizontal: 14,
    paddingVertical: 5,
    borderRadius: 15,
    marginBottom: 14,
  },
  activeStatusText: {
    color: '#FFF',
    fontSize: 11,
    fontWeight: '800',
    textAlign: 'center',
  },
  passengerProfileRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    padding: 10,
    borderRadius: 12,
    marginBottom: 14,
  },
  passengerAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#E0E7FF',
    justifyContent: 'center',
    alignItems: 'center',
  },
  passengerAvatarText: {
    color: '#6366F1',
    fontSize: 12,
    fontWeight: '800',
  },
  passengerInfo: {
    marginLeft: 10,
    flex: 1,
  },
  passengerNameText: {
    fontSize: 14,
    fontWeight: '800',
    color: '#1F2937',
  },
  passengerPhoneText: {
    fontSize: 12,
    color: '#6B7280',
    fontWeight: '500',
  },
  contactButtons: {
    flexDirection: 'row',
    gap: 8,
  },
  contactCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#FFF',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    justifyContent: 'center',
    alignItems: 'center',
  },
  activeRouteBox: {
    marginBottom: 14,
  },
  activeRouteLabel: {
    fontSize: 10,
    color: '#9CA3AF',
    fontWeight: '700',
  },
  activeRouteText: {
    fontSize: 13,
    color: '#374151',
    fontWeight: '600',
    marginTop: 2,
  },
  activeFareRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: '#F3F4F6',
    paddingTop: 12,
    marginBottom: 14,
  },
  activeFareLabel: {
    fontSize: 13,
    color: '#4B5563',
    fontWeight: '600',
  },
  activeFareValue: {
    fontSize: 16,
    fontWeight: '850',
    color: '#6366F1',
  },
  stepProgressContainer: {
    width: '100%',
  },
  progressButton: {
    height: 50,
    backgroundColor: '#F59E0B',
    borderRadius: 12,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 6,
  },
  progressButtonText: {
    color: '#FFF',
    fontSize: 13,
    fontWeight: '900',
    letterSpacing: 0.5,
  },
  floatingSuccessCard: {
    position: 'absolute',
    bottom: 24,
    left: 16,
    right: 16,
    backgroundColor: '#FFF',
    borderRadius: 24,
    padding: 20,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.15,
    shadowRadius: 16,
    elevation: 8,
  },
  successCheckCircle: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#10B981',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
    elevation: 3,
  },
  successTitle: {
    fontSize: 18,
    fontWeight: '900',
    color: '#10B981',
    marginBottom: 12,
  },
  successSummaryBox: {
    width: '100%',
    backgroundColor: '#F8FAFC',
    borderRadius: 14,
    padding: 14,
    marginBottom: 18,
  },
  successSummaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 4,
  },
  successSummaryLabel: {
    fontSize: 12,
    color: '#6B7280',
    fontWeight: '600',
  },
  successSummaryFare: {
    fontSize: 16,
    fontWeight: '900',
    color: '#10B981',
  },
  successSummaryValue: {
    fontSize: 13,
    color: '#1F2937',
    fontWeight: '700',
  },
  successReturnButton: {
    width: '100%',
    height: 50,
    backgroundColor: '#10B981',
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  successReturnButtonText: {
    color: '#FFF',
    fontSize: 14,
    fontWeight: '800',
  },
});
