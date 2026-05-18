import React, { useState, useEffect } from 'react';
import { StyleSheet, View, Text, TouchableOpacity, ScrollView, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { User, LogOut, Shield, PhoneCall, CreditCard, ChevronRight, Car } from 'lucide-react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter } from 'expo-router';
import api from '@/services/api';

export default function DriverAccountScreen() {
  const router = useRouter();
  const [driverName, setDriverName] = useState('Tài xế');
  const [driverPhone, setDriverPhone] = useState('090 123 4567');
  const [vehicleInfo, setVehicleInfo] = useState('Xe máy • 59X3-12345 (Yamaha Exciter)');

  useEffect(() => {
    const loadProfile = async () => {
      try {
        const name = await AsyncStorage.getItem('user_name');
        if (name) setDriverName(name);

        // Attempt to fetch profile details from driver-service
        const res = await api.get('/api/drivers/me/profile');
        if (res.data && res.data.result) {
          const profile = res.data.result;
          setDriverName(profile.fullName || name);
          if (profile.phoneNumber) setDriverPhone(profile.phoneNumber);
          if (profile.vehiclePlate) {
            setVehicleInfo(`${profile.vehicleType === 'BIKE' ? 'Xe máy' : 'Xe ô tô'} • ${profile.vehiclePlate} (${profile.vehicleModel})`);
          }
        }
      } catch (err) {
        console.log('Driver profile load failed, using fallback.');
      }
    };
    loadProfile();
  }, []);

  const handleLogout = async () => {
    Alert.alert(
      'Đăng xuất',
      'Bạn có chắc chắn muốn đăng xuất khỏi tài khoản Tài xế này không?',
      [
        { text: 'Hủy', style: 'cancel' },
        {
          text: 'ĐĂNG XUẤT',
          onPress: async () => {
            try {
              // Flush storage
              await AsyncStorage.removeItem('access_token');
              await AsyncStorage.removeItem('refresh_token');
              await AsyncStorage.removeItem('user_id');
              await AsyncStorage.removeItem('user_name');
              await AsyncStorage.removeItem('user_role');
              
              // Flush simulated earnings & jobs
              await AsyncStorage.removeItem('driver_completed_jobs');
              await AsyncStorage.removeItem('driver_earnings');

              Alert.alert('Thành công', 'Đăng xuất thành công!');
              router.replace('/(auth)/login');
            } catch (error) {
              console.log('Failed to log out:', error);
            }
          }
        }
      ]
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* Profile Card */}
        <View style={styles.profileCard}>
          <View style={styles.avatarLarge}>
            <Text style={styles.avatarTextLarge}>TX</Text>
          </View>
          <Text style={styles.driverNameText}>{driverName}</Text>
          
          <View style={styles.roleBadge}>
            <Text style={styles.roleBadgeText}>TÀI XẾ ĐỐI TÁC</Text>
          </View>

          <Text style={styles.driverPhoneText}>{driverPhone}</Text>
        </View>

        {/* Vehicle Information */}
        <Text style={styles.sectionTitle}>Phương tiện đăng ký</Text>
        <View style={styles.vehicleCard}>
          <View style={styles.vehicleIconCircle}>
            <Car size={20} color="#6366F1" />
          </View>
          <View style={styles.vehicleMeta}>
            <Text style={styles.vehicleLabel}>Thông tin xe</Text>
            <Text style={styles.vehicleValue} numberOfLines={2}>{vehicleInfo}</Text>
          </View>
        </View>

        {/* Menu Items */}
        <Text style={styles.sectionTitle}>Cài đặt tài khoản</Text>
        <View style={styles.menuContainer}>
          <TouchableOpacity style={styles.menuItem} onPress={() => Alert.alert('Hồ sơ', 'Mở chỉnh sửa hồ sơ tài xế...')}>
            <View style={styles.menuItemLeft}>
              <User size={18} color="#4B5563" />
              <Text style={styles.menuItemText}>Hồ sơ cá nhân</Text>
            </View>
            <ChevronRight size={16} color="#9CA3AF" />
          </TouchableOpacity>

          <TouchableOpacity style={styles.menuItem} onPress={() => Alert.alert('Ngân hàng', 'Cài đặt liên kết ngân hàng nhận tiền...')}>
            <View style={styles.menuItemLeft}>
              <CreditCard size={18} color="#4B5563" />
              <Text style={styles.menuItemText}>Tài khoản ngân hàng</Text>
            </View>
            <ChevronRight size={16} color="#9CA3AF" />
          </TouchableOpacity>

          <TouchableOpacity style={styles.menuItem} onPress={() => Alert.alert('Bảo mật', 'Cài đặt mật khẩu & quyền riêng tư...')}>
            <View style={styles.menuItemLeft}>
              <Shield size={18} color="#4B5563" />
              <Text style={styles.menuItemText}>Quyền riêng tư & Bảo mật</Text>
            </View>
            <ChevronRight size={16} color="#9CA3AF" />
          </TouchableOpacity>

          <TouchableOpacity style={styles.menuItem} onPress={() => Alert.alert('Tổng đài hỗ trợ', 'Đang quay số kết nối tổng đài hỗ trợ Tài xế 24/7 (1900 xxxx)...')}>
            <View style={styles.menuItemLeft}>
              <PhoneCall size={18} color="#4B5563" />
              <Text style={styles.menuItemText}>Tổng đài hỗ trợ đối tác</Text>
            </View>
            <ChevronRight size={16} color="#9CA3AF" />
          </TouchableOpacity>
        </View>

        {/* Log out Button */}
        <TouchableOpacity style={styles.logoutButton} onPress={handleLogout}>
          <LogOut size={20} color="#EF4444" />
          <Text style={styles.logoutButtonText}>Đăng xuất tài khoản</Text>
        </TouchableOpacity>

        {/* App Version Info */}
        <View style={styles.versionContainer}>
          <Text style={styles.versionText}>CAB Partner Version 1.0.0 (Beta)</Text>
        </View>

      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F9FAFB',
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 32,
  },
  profileCard: {
    backgroundColor: '#FFF',
    borderRadius: 24,
    padding: 24,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.02,
    shadowRadius: 5,
    elevation: 2,
    marginBottom: 24,
  },
  avatarLarge: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#6366F1',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
    elevation: 3,
  },
  avatarTextLarge: {
    color: '#FFF',
    fontSize: 24,
    fontWeight: '800',
  },
  driverNameText: {
    fontSize: 20,
    fontWeight: '800',
    color: '#1F2937',
    marginBottom: 6,
  },
  roleBadge: {
    backgroundColor: '#EEF2F6',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
    marginBottom: 10,
  },
  roleBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#6366F1',
    letterSpacing: 0.5,
  },
  driverPhoneText: {
    fontSize: 14,
    color: '#6B7280',
    fontWeight: '500',
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: '#1F2937',
    marginBottom: 12,
    paddingLeft: 4,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  vehicleCard: {
    backgroundColor: '#FFF',
    borderRadius: 16,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    marginBottom: 24,
  },
  vehicleIconCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#EEF2F6',
    justifyContent: 'center',
    alignItems: 'center',
  },
  vehicleMeta: {
    marginLeft: 12,
    flex: 1,
  },
  vehicleLabel: {
    fontSize: 11,
    color: '#9CA3AF',
    fontWeight: '700',
  },
  vehicleValue: {
    fontSize: 14,
    color: '#1F2937',
    fontWeight: '600',
    marginTop: 2,
  },
  menuContainer: {
    backgroundColor: '#FFF',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    overflow: 'hidden',
    marginBottom: 24,
  },
  menuItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  menuItemLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  menuItemText: {
    fontSize: 14,
    color: '#374151',
    fontWeight: '600',
  },
  logoutButton: {
    flexDirection: 'row',
    height: 54,
    borderWidth: 1.5,
    borderColor: '#EF4444',
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#FFF',
    marginBottom: 24,
  },
  logoutButtonText: {
    color: '#EF4444',
    fontSize: 14,
    fontWeight: '700',
  },
  versionContainer: {
    alignItems: 'center',
  },
  versionText: {
    fontSize: 12,
    color: '#9CA3AF',
    fontWeight: '500',
  },
});
