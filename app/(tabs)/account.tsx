import React, { useEffect, useState } from 'react';
import { StyleSheet, View, Text, ScrollView, TouchableOpacity, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { User, Settings, CreditCard, Gift, ShieldCheck, HelpCircle, LogOut, ChevronRight, Star } from 'lucide-react-native';
import { Colors } from '@/constants/Colors';
import { useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';

export default function AccountScreen() {
  const router = useRouter();
  const [userName, setUserName] = useState('User');

  useEffect(() => {
    const loadUser = async () => {
      const name = await AsyncStorage.getItem('user_name');
      if (name) setUserName(name);
    };
    loadUser();
  }, []);

  const handleLogout = async () => {
    Alert.alert(
      'Logout',
      'Are you sure you want to logout?',
      [
        { text: 'Cancel', style: 'cancel' },
        { 
          text: 'Logout', 
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
            <Text style={styles.profileName}>{userName}</Text>
            <View style={styles.ratingContainer}>
              <Star size={16} color={Colors.light.warning} fill={Colors.light.warning} />
              <Text style={styles.ratingText}>4.9 • Gold Member</Text>
            </View>
          </View>
          <TouchableOpacity style={styles.editButton}>
            <Settings size={20} color={Colors.light.icon} />
          </TouchableOpacity>
        </View>

        {/* Stats Row */}
        <View style={styles.statsRow}>
          <StatItem label="Points" value="1,240" />
          <StatItem label="Rewards" value="3" />
          <StatItem label="Saved" value="150k" />
        </View>

        {/* Menu Sections */}
        <View style={styles.menuSection}>
          <Text style={styles.menuTitle}>Financial</Text>
          <MenuItem icon={<CreditCard size={22} color="#006CFF" />} label="Payment Methods" />
          <MenuItem icon={<Gift size={22} color="#FF6B00" />} label="Rewards & Offers" />
        </View>

        <View style={styles.menuSection}>
          <Text style={styles.menuTitle}>General</Text>
          <MenuItem icon={<ShieldCheck size={22} color={Colors.light.primary} />} label="Safety & Privacy" />
          <MenuItem icon={<HelpCircle size={22} color="#666" />} label="Support Center" />
          <MenuItem icon={<Settings size={22} color="#333" />} label="App Settings" />
        </View>

        {/* Logout */}
        <TouchableOpacity style={styles.logoutButton} onPress={handleLogout}>
          <LogOut size={22} color={Colors.light.error} />
          <Text style={styles.logoutText}>Log Out</Text>
        </TouchableOpacity>

        <View style={styles.versionContainer}>
          <Text style={styles.versionText}>Version 1.0.24 (2024)</Text>
        </View>

        <View style={{ height: 50 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

function StatItem({ label, value }: { label: string, value: string }) {
  return (
    <View style={styles.statItem}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function MenuItem({ icon, label }: { icon: React.ReactNode, label: string }) {
  return (
    <TouchableOpacity style={styles.menuItem} onPress={() => alert('This feature is under development')}>
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
    backgroundColor: '#00B14F',
    justifyContent: 'center',
    alignItems: 'center',
  },
  profileInfo: {
    flex: 1,
    marginLeft: 20,
  },
  profileName: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#111',
  },
  ratingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 5,
    gap: 5,
  },
  ratingText: {
    fontSize: 14,
    color: '#666',
  },
  editButton: {
    padding: 10,
  },
  statsRow: {
    flexDirection: 'row',
    backgroundColor: '#F9F9F9',
    marginHorizontal: 20,
    borderRadius: 16,
    paddingVertical: 20,
    justifyContent: 'space-around',
  },
  statItem: {
    alignItems: 'center',
  },
  statValue: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#111',
  },
  statLabel: {
    fontSize: 12,
    color: '#666',
    marginTop: 4,
  },
  menuSection: {
    marginTop: 30,
    paddingHorizontal: 20,
  },
  menuTitle: {
    fontSize: 14,
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
