import React, { useEffect, useState } from 'react';
import { StyleSheet, View, Text, TouchableOpacity, ActivityIndicator, Image } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ChevronLeft, MapPin, Navigation, Phone, MessageSquare, Star } from 'lucide-react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useSocket } from '@/hooks/useSocket';
import { Colors } from '@/constants/Colors';
import MapView, { Marker, PROVIDER_GOOGLE } from 'react-native-maps';

export default function MatchingScreen() {
  const router = useRouter();
  const { bookingId } = useLocalSearchParams();
  const { socket } = useSocket();
  
  const [status, setStatus] = useState('FINDING'); // FINDING, FOUND, ARRIVING, STARTED, COMPLETED
  const [driverInfo, setDriverInfo] = useState<any>(null);

  useEffect(() => {
    if (socket) {
      const handleNotification = (data: any) => {
        console.log('Matching Screen received notification:', data);
        
        const message = data.message || '';
        
        // Check for specific states first
        if (message.includes('tìm thấy tài xế') || message.includes('assigned')) {
          setStatus('FOUND');
          // Mock driver info for demo if not provided
          setDriverInfo({
            name: 'Nguyễn Văn Tài',
            plate: '59-G1 123.45',
            rating: 4.9,
            vehicle: 'Toyota Vios (Trắng)'
          });
        } else if (message.includes('arrived') || message.includes('đã đến')) {
          setStatus('ARRIVING');
        } else if (message.includes('tìm tài xế') || message.includes('finding')) {
          setStatus('FINDING');
        } else if (message.includes('started') || message.includes('bắt đầu')) {
          setStatus('STARTED');
        } else if (message.includes('completed') || message.includes('hoàn thành')) {
          setStatus('COMPLETED');
          router.replace('/(tabs)/explore');
        }
      };

      socket.on('new_notification', handleNotification);
      return () => {
        socket.off('new_notification', handleNotification);
      };
    }
  }, [socket]);

  const getStatusText = () => {
    switch (status) {
      case 'FINDING': return 'Đang tìm tài xế...';
      case 'FOUND': return 'Đã tìm thấy tài xế';
      case 'ARRIVING': return 'Tài xế đang đến';
      case 'STARTED': return 'Chuyến đi đã bắt đầu';
      default: return 'Đang cập nhật...';
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <ChevronLeft size={28} color="#111" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Trạng thái chuyến xe</Text>
        <TouchableOpacity 
          onPress={() => router.replace('/(tabs)')}
          style={styles.homeButton}
        >
          <Text style={styles.homeButtonText}>Home</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.content}>
        {/* Real Map View */}
        <MapView
          style={styles.map}
          initialRegion={{
            latitude: 10.8231,
            longitude: 106.6631,
            latitudeDelta: 0.05,
            longitudeDelta: 0.05,
          }}
        >
          {/* Pickup Marker */}
          <Marker
            coordinate={{ latitude: 10.8231, longitude: 106.6631 }}
            title="Điểm đón"
            description="12 Nguyễn Văn Bảo, Gò Vấp"
            pinColor="#6366F1"
          />
          {/* Destination Marker */}
          <Marker
            coordinate={{ latitude: 10.8331, longitude: 106.6731 }}
            title="Điểm đến"
            description="12 Nguyễn Thái Sơn"
            pinColor="#FF4444"
          />
        </MapView>

        {/* Status Card */}
        <View style={styles.statusCard}>
          <View style={styles.statusBadge}>
            <ActivityIndicator size="small" color={Colors.light.primary} animating={status === 'FINDING'} />
            <Text style={styles.statusText}>{getStatusText()}</Text>
          </View>

          {status !== 'FINDING' && driverInfo && (
            <View style={styles.driverInfo}>
              <View style={styles.driverHeader}>
                <View style={styles.avatarPlaceholder}>
                  <Image 
                    source={{ uri: 'https://i.pravatar.cc/150?u=driver' }} 
                    style={styles.avatar} 
                  />
                </View>
                <View style={styles.driverDetails}>
                  <Text style={styles.driverName}>{driverInfo.name}</Text>
                  <View style={styles.ratingContainer}>
                    <Star size={14} color="#FFD700" fill="#FFD700" />
                    <Text style={styles.ratingText}>{driverInfo.rating}</Text>
                  </View>
                </View>
                <View style={styles.vehicleDetails}>
                  <Text style={styles.plateNumber}>{driverInfo.plate}</Text>
                  <Text style={styles.vehicleName}>{driverInfo.vehicle}</Text>
                </View>
              </View>

              <View style={styles.actionButtons}>
                <TouchableOpacity style={styles.actionButton}>
                  <Phone size={20} color="#666" />
                  <Text style={styles.actionText}>Gọi điện</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.actionButton, styles.chatButton]}>
                  <MessageSquare size={20} color="#fff" />
                  <Text style={[styles.actionText, { color: '#fff' }]}>Nhắn tin</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}

          {status === 'FINDING' && (
            <View style={styles.findingContainer}>
              <Text style={styles.findingSubtext}>Hệ thống đang kết nối bạn với tài xế gần nhất</Text>
              <TouchableOpacity style={styles.cancelButton} onPress={() => router.back()}>
                <Text style={styles.cancelText}>Hủy chuyến</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 15,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#F2F2F2',
  },
  backButton: {
    padding: 5,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginLeft: 10,
    flex: 1,
  },
  homeButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: '#F0F0F0',
    borderRadius: 15,
  },
  homeButtonText: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#666',
  },
  content: {
    flex: 1,
  },
  map: {
    flex: 1,
  },
  statusCard: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    elevation: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.1,
    shadowRadius: 10,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#EEF2FF',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 12,
    gap: 10,
    marginBottom: 20,
  },
  statusText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#6366F1',
  },
  driverInfo: {
    marginTop: 10,
  },
  driverHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  avatarPlaceholder: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#EEE',
    overflow: 'hidden',
  },
  avatar: {
    width: '100%',
    height: '100%',
  },
  driverDetails: {
    flex: 1,
    marginLeft: 15,
  },
  driverName: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#111',
  },
  ratingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 2,
  },
  ratingText: {
    fontSize: 14,
    color: '#666',
  },
  vehicleDetails: {
    alignItems: 'flex-end',
  },
  plateNumber: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#111',
    backgroundColor: '#F5F5F5',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
  },
  vehicleName: {
    fontSize: 12,
    color: '#666',
    marginTop: 4,
  },
  actionButtons: {
    flexDirection: 'row',
    marginTop: 24,
    gap: 12,
  },
  actionButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: '#F5F5F5',
    gap: 8,
  },
  chatButton: {
    backgroundColor: '#6366F1',
  },
  actionText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#333',
  },
  findingContainer: {
    alignItems: 'center',
    paddingVertical: 20,
  },
  findingSubtext: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
    marginBottom: 20,
  },
  cancelButton: {
    paddingVertical: 10,
    paddingHorizontal: 20,
  },
  cancelText: {
    color: '#FF4444',
    fontWeight: 'bold',
    fontSize: 15,
  }
});
