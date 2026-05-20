import React, { useEffect, useState } from 'react';
import { StyleSheet, View, Text, ScrollView, TouchableOpacity, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { User, Settings, CreditCard, Gift, ShieldCheck, HelpCircle, LogOut, ChevronRight } from 'lucide-react-native';
import { Colors } from '@/constants/Colors';
import { useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import api from '@/services/api';

export default function AccountScreen() {
  const router = useRouter();
  const [userName, setUserName] = useState('Guest User');
  const [userEmail, setUserEmail] = useState('');
  const [isAuth, setIsAuth] = useState(false);

  useEffect(() => {
    const loadUser = async () => {
      const name = await AsyncStorage.getItem('user_name');
      const token = await AsyncStorage.getItem('access_token');
      const email = await AsyncStorage.getItem('user_email');
      if (name) setUserName(name);
      if (email) setUserEmail(email);
      if (token) {
        setIsAuth(true);
        // Fetch live profile from backend
        try {
          const res = await api.get('/api/users/me/profile');
          const profile = res.data?.result || res.data;
          if (profile?.fullName) setUserName(profile.fullName);
        } catch (e) {
          // silently fail — use cached name
        }
      }
    };
    loadUser();
  }, []);

  const handleLogout = async () => {
    Alert.alert(
      'Đăng xuất',
      'Bạn có chắc muốn đăng xuất không?',
      [
        { text: 'Huỷ', style: 'cancel' },
        {
          text: 'Đăng xuất',
          style: 'destructive',
          onPress: async () => {
            await AsyncStorage.clear();
            router.replace('/login');
          }
        },
      ]
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView showsVerticalScrollIndicator={false}>
        {/* Profile Header */}
        <View style={styles.profileHeader}>
          <View style={styles.avatarPlaceholder}>
            <User size={40} color="#fff" />
          </View>
          <View style={styles.profileInfo}>
            <Text style={styles.profileName}>{isAuth ? userName : 'Chào mừng đến CAB'}</Text>
            {isAuth ? (
              <Text style={styles.emailText}>{userEmail}</Text>
            ) : (
              <Text style={styles.subtitleText}>Đăng nhập để tiếp tục</Text>
            )}
          </View>
          {isAuth && (
            <TouchableOpacity style={styles.editButton}>
              <Settings size={20} color={Colors.light.icon} />
            </TouchableOpacity>
          )}
        </View>

        {!isAuth ? (
          <View style={{ paddingHorizontal: 20, marginTop: 10 }}>
            <TouchableOpacity
              style={[styles.logoutButton, { backgroundColor: Colors.light.primary, borderColor: Colors.light.primary, marginTop: 0 }]}
              onPress={() => router.push('/(auth)/login')}
            >
              <Text style={[styles.logoutText, { color: '#fff' }]}>Đăng nhập / Đăng ký</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.menuSection}>
            <Text style={styles.menuTitle}>Tài chính</Text>
            <MenuItem icon={<CreditCard size={22} color="#006CFF" />} label="Phương thức thanh toán" />
            <MenuItem icon={<Gift size={22} color="#FF6B00" />} label="Ưu đãi & Khuyến mãi" />
          </View>
        )}

        <View style={styles.menuSection}>
          <Text style={styles.menuTitle}>Hỗ trợ</Text>
          <MenuItem icon={<ShieldCheck size={22} color={Colors.light.primary} />} label="Bảo mật & Quyền riêng tư" />
          <MenuItem icon={<HelpCircle size={22} color="#666" />} label="Trung tâm trợ giúp" />
          <MenuItem icon={<Settings size={22} color="#333" />} label="Cài đặt ứng dụng" />
        </View>

        {/* Logout */}
        {isAuth && (
          <TouchableOpacity style={styles.logoutButton} onPress={handleLogout}>
            <LogOut size={22} color={Colors.light.error} />
            <Text style={styles.logoutText}>Đăng xuất</Text>
          </TouchableOpacity>
        )}

        <View style={styles.versionContainer}>
          <Text style={styles.versionText}>CAB Booking v1.0.0</Text>
        </View>

        <View style={{ height: 50 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

function MenuItem({ icon, label }: { icon: React.ReactNode, label: string }) {
  return (
    <TouchableOpacity style={styles.menuItem} onPress={() => alert('Tính năng đang phát triển')}>
      <View style={styles.menuIconContainer}>
        {icon}
      </View>
      <Text style={styles.menuLabel}>{label}</Text>
      <ChevronRight size={18} color="#C7C7CC" />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  profileHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 25,
  },
  avatarPlaceholder: {
    width: 70,
    height: 70,
    borderRadius: 35,
    backgroundColor: '#6366F1',
    justifyContent: 'center',
    alignItems: 'center',
  },
  profileInfo: {
    flex: 1,
    marginLeft: 20,
  },
  profileName: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#111',
  },
  emailText: {
    fontSize: 13,
    color: '#666',
    marginTop: 4,
  },
  subtitleText: {
    fontSize: 14,
    color: '#666',
    marginTop: 4,
  },
  editButton: {
    padding: 10,
  },
  menuSection: {
    marginTop: 25,
    paddingHorizontal: 20,
  },
  menuTitle: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#999',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 10,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 15,
    borderBottomWidth: 1,
    borderBottomColor: '#F2F2F2',
  },
  menuIconContainer: {
    width: 32,
    alignItems: 'center',
  },
  menuLabel: {
    flex: 1,
    fontSize: 16,
    color: '#111',
    marginLeft: 15,
  },
  logoutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 40,
    paddingVertical: 15,
    marginHorizontal: 20,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#FFE5E5',
    backgroundColor: '#FFF9F9',
    gap: 10,
  },
  logoutText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#E02020',
  },
  versionContainer: {
    alignItems: 'center',
    marginTop: 20,
    marginBottom: 30,
  },
  versionText: {
    fontSize: 12,
    color: '#CCC',
  }
});
