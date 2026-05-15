import React from 'react';
import { StyleSheet, View, Text, ScrollView, TextInput, TouchableOpacity, Image } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Search, Car, Bike, Utensils, ShoppingBag, Bell, Menu, MapPin, ChevronRight, History } from 'lucide-react-native';
import { Colors } from '@/constants/Colors';
import { useRouter } from 'expo-router';
import { useSocket } from '@/hooks/useSocket';
import api, { IP_ADDRESS } from '@/services/api';
import AsyncStorage from '@react-native-async-storage/async-storage';

export default function HomeScreen() {
  const router = useRouter();
  const { socket } = useSocket();
  const [notificationCount, setNotificationCount] = React.useState(0);
  const [latestNotification, setLatestNotification] = React.useState('Welcome to Grab! Book your first ride now.');

  const fetchLatestNotification = async () => {
    try {
      const userId = await AsyncStorage.getItem('user_id');
      if (!userId) return;
      
      // Call via Gateway (port 8080) - matches /api/notifications/** predicate
      const response = await api.get(`/api/notifications/user/${userId}?page=0&size=1`);
      
      const content = response.data?.content || response.data?.result?.content;
      
      if (content && content.length > 0) {
        const notif = content[0];
        setLatestNotification(notif.message);
        if (!notif.read) {
          setNotificationCount(1);
        }
      }
    } catch (error) {
      console.log('Failed to fetch notifications:', error);
    }
  };

  React.useEffect(() => {
    fetchLatestNotification();
    
    if (socket) {
      socket.on('new_notification', (data: any) => {
        setNotificationCount(prev => prev + 1);
        setLatestNotification(data.message || 'New update for your ride!');
      });
    }
    return () => {
      if (socket) socket.off('new_notification');
    };
  }, [socket]);

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView showsVerticalScrollIndicator={false}>
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.searchContainer}>
            <Search size={20} color={Colors.light.icon} style={styles.searchIcon} />
            <TextInput 
              placeholder="Where to?" 
              style={styles.searchInput}
              placeholderTextColor={Colors.light.icon}
              onFocus={() => router.push('/booking')}
            />
          </View>
          <TouchableOpacity 
            style={styles.iconButton} 
            onPress={() => {
              setNotificationCount(0);
              router.push('/modal');
            }}
          >
            <View>
              <Bell size={24} color={Colors.light.text} />
              {notificationCount > 0 && (
                <View style={styles.badge}>
                  <Text style={styles.badgeText}>{notificationCount}</Text>
                </View>
              )}
            </View>
          </TouchableOpacity>
        </View>

        {/* Services Grid */}
        <View style={styles.servicesGrid}>
          <ServiceItem 
            icon={<Car size={32} color={Colors.light.primary} />} 
            label="Ride" 
            onPress={() => router.push('/booking')}
          />
          <ServiceItem 
            icon={<Bike size={32} color={Colors.light.primary} />} 
            label="Bike" 
            onPress={() => router.push('/booking')}
          />
          <ServiceItem icon={<Utensils size={32} color="#FF6B00" />} label="Food" />
          <ServiceItem icon={<ShoppingBag size={32} color="#006CFF" />} label="Mart" />
        </View>

        {/* Promo Banner Mock */}
        <View style={styles.promoBanner}>
          <View style={styles.promoTextContainer}>
            <Text style={styles.promoTitle}>50% OFF your first ride</Text>
            <Text style={styles.promoSubtitle}>Use code: NEWCAB2024</Text>
            <TouchableOpacity style={styles.promoButton}>
              <Text style={styles.promoButtonText}>Claim Now</Text>
            </TouchableOpacity>
          </View>
          <View style={styles.promoImagePlaceholder} />
        </View>

        {/* Recent Destinations */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Recent destinations</Text>
            <TouchableOpacity>
              <Text style={styles.seeAll}>See all</Text>
            </TouchableOpacity>
          </View>
          
          <DestinationItem 
            title="University of Industrial" 
            subtitle="12 Nguyen Van Bao, Go Vap" 
          />
          <DestinationItem 
            title="Emart Go Vap" 
            subtitle="366 Phan Van Tri, Ward 5" 
          />
        </View>

        {/* Notifications Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Recent Notifications</Text>
          <View style={styles.notificationCard}>
            <Bell size={20} color={Colors.light.primary} />
            <Text style={styles.notificationText}>
              {latestNotification}
            </Text>
          </View>
        </View>

        {/* Activity Feed Mock */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Your activity</Text>
          <View style={styles.activityCard}>
            <History size={24} color={Colors.light.primary} />
            <View style={styles.activityInfo}>
              <Text style={styles.activityTitle}>Ride completed</Text>
              <Text style={styles.activityTime}>Yesterday, 18:30</Text>
            </View>
            <Text style={styles.activityPrice}>65.000đ</Text>
          </View>
        </View>

        <View style={{ height: 100 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

function ServiceItem({ icon, label, onPress }: { icon: React.ReactNode, label: string, onPress?: () => void }) {
  return (
    <TouchableOpacity style={styles.serviceItem} onPress={onPress}>
      <View style={styles.iconCircle}>
        {icon}
      </View>
      <Text style={styles.serviceLabel}>{label}</Text>
    </TouchableOpacity>
  );
}

function DestinationItem({ title, subtitle }: { title: string, subtitle: string }) {
  return (
    <TouchableOpacity style={styles.destinationItem}>
      <MapPin size={20} color={Colors.light.icon} />
      <View style={styles.destinationText}>
        <Text style={styles.destinationTitle}>{title}</Text>
        <Text style={styles.destinationSubtitle}>{subtitle}</Text>
      </View>
      <ChevronRight size={18} color={Colors.light.icon} />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  header: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    paddingVertical: 10,
    alignItems: 'center',
    gap: 15,
  },
  searchContainer: {
    flex: 1,
    flexDirection: 'row',
    backgroundColor: '#F2F2F2',
    borderRadius: 12,
    paddingHorizontal: 15,
    height: 48,
    alignItems: 'center',
  },
  searchIcon: {
    marginRight: 10,
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
    color: '#000',
  },
  iconButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  servicesGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    marginTop: 20,
  },
  serviceItem: {
    alignItems: 'center',
    gap: 8,
  },
  iconCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#F8F8F8',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#EAEAEA',
  },
  serviceLabel: {
    fontSize: 14,
    fontWeight: '500',
    color: '#333',
  },
  promoBanner: {
    marginHorizontal: 20,
    marginTop: 25,
    backgroundColor: '#00B14F',
    borderRadius: 16,
    padding: 20,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    overflow: 'hidden',
  },
  promoTextContainer: {
    flex: 1,
  },
  promoTitle: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
  },
  promoSubtitle: {
    color: '#E0FFEB',
    fontSize: 14,
    marginTop: 4,
  },
  promoButton: {
    backgroundColor: '#fff',
    paddingHorizontal: 15,
    paddingVertical: 8,
    borderRadius: 8,
    marginTop: 12,
    alignSelf: 'flex-start',
  },
  promoButtonText: {
    color: '#00B14F',
    fontWeight: 'bold',
    fontSize: 12,
  },
  promoImagePlaceholder: {
    width: 80,
    height: 80,
    backgroundColor: '#E0FFEB33',
    borderRadius: 40,
  },
  section: {
    marginTop: 30,
    paddingHorizontal: 20,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 15,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#111',
  },
  seeAll: {
    color: '#00B14F',
    fontWeight: '600',
  },
  destinationItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 15,
    borderBottomWidth: 1,
    borderBottomColor: '#F2F2F2',
  },
  destinationText: {
    flex: 1,
    marginLeft: 15,
  },
  destinationTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111',
  },
  destinationSubtitle: {
    fontSize: 14,
    color: '#666',
    marginTop: 2,
  },
  activityCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F9F9F9',
    padding: 15,
    borderRadius: 12,
    marginTop: 10,
  },
  activityInfo: {
    flex: 1,
    marginLeft: 15,
  },
  activityTitle: {
    fontSize: 15,
    fontWeight: '600',
  },
  activityTime: {
    fontSize: 13,
    color: '#666',
    marginTop: 2,
  },
  activityPrice: {
    fontSize: 15,
    fontWeight: 'bold',
    color: '#111',
  },
  notificationCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#E8F5E9',
    padding: 15,
    borderRadius: 12,
    marginTop: 10,
    gap: 12,
  },
  notificationText: {
    fontSize: 14,
    color: '#2E7D32',
    flex: 1,
  },
  badge: {
    position: 'absolute',
    right: -6,
    top: -6,
    backgroundColor: '#FF4444',
    borderRadius: 10,
    width: 20,
    height: 20,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#fff',
  },
  badgeText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: 'bold',
  }
});
