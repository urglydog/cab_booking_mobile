import React, { useEffect, useState } from 'react';
import { StyleSheet, View, Text, FlatList, ActivityIndicator, TouchableOpacity } from 'react-native';
import { Bell, ChevronLeft, CheckCheck } from 'lucide-react-native';
import { Colors } from '@/constants/Colors';
import api from '@/services/api';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter } from 'expo-router';

const translateNotificationMessage = (message: string) => {
  if (!message) return '';
  if (message.includes('Your ride has been cancelled') || message.includes('cancelled') || message.includes('bị hủy')) {
    const parts = message.split(/Reason:\s*|Lý do:\s*/i);
    let reason = parts[1] || '';
    
    // Clean up reason by removing leading dashes, numbers, dots, spaces
    reason = reason.replace(/^[-\s\d\.\:]+/, '').trim();
    
    let viReason = reason;
    const lowerReason = reason.toLowerCase();
    if (lowerReason.includes('customer requested cancellation') || lowerReason.includes('customer requested') || lowerReason.includes('khách hàng yêu cầu') || lowerReason.includes('customer_cancelled')) {
      viReason = 'Khách hàng yêu cầu hủy';
    } else if (lowerReason.includes('not specified') || !reason) {
      viReason = 'Không xác định';
    } else {
      viReason = 'Tài xế đã hủy chuyến đi';
    }
    return `Chuyến đi của bạn đã bị hủy. Lý do: ${viReason}`;
  }
  if (message.includes('Finding the nearest driver') || message.includes('finding') || message.includes('tìm tài xế')) {
    return 'Đang tìm tài xế gần nhất cho bạn...';
  }
  if (message.includes('Driver has arrived') || message.includes('arrived') || (message.includes('đến điểm đón') && !message.includes('đang đến'))) {
    return 'Tài xế đã đến điểm đón!';
  }
  if (message.includes('Ride completed') || message.includes('finished') || message.includes('hoàn thành')) {
    return 'Chuyến đi đã hoàn thành. Cảm ơn bạn!';
  }
  if (message.includes('Driver accepted') || message.includes('accepted') || message.includes('nhận chuyến')) {
    return 'Tài xế đã nhận chuyến xe của bạn!';
  }
  if (message.includes('Ride started') || message.includes('started') || message.includes('bắt đầu')) {
    return 'Chuyến đi của bạn đã bắt đầu!';
  }
  return message;
};

const translateNotificationTitle = (title: string) => {
  if (!title) return '';
  const lower = title.toLowerCase();
  if (lower.includes('ride update')) return 'Cập nhật chuyến đi';
  if (lower.includes('booking timeout')) return 'Hết thời gian tìm kiếm';
  if (lower.includes('payment successful')) return 'Thanh toán thành công';
  if (lower.includes('ride completed')) return 'Chuyến đi hoàn thành';
  if (lower.includes('ride cancelled')) return 'Chuyến đi đã bị hủy';
  return title;
};

export default function NotificationsModal() {
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  const fetchNotifications = async () => {
    try {
      const userId = await AsyncStorage.getItem('user_id');
      if (!userId) return;
      
      const response = await api.get(`/api/notifications/user/${userId}?page=0&size=50`);
      const content = response.data?.content || response.data?.result?.content || [];
      setNotifications(content);
    } catch (error) {
      console.error('Failed to fetch notifications:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleMarkAsRead = async (id: string) => {
    try {
      await api.patch(`/api/notifications/${id}/read`);
      setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: true } : n));
    } catch (error) {
      console.error('Failed to mark as read:', error);
    }
  };

  const handleMarkAllAsRead = async () => {
    try {
      const userId = await AsyncStorage.getItem('user_id');
      if (!userId) return;
      await api.patch(`/api/notifications/user/${userId}/read-all`);
      setNotifications(prev => prev.map(n => ({ ...n, read: true })));
    } catch (error) {
      console.error('Failed to mark all as read:', error);
    }
  };

  const formatTime = (dateStr: string) => {
    const date = new Date(dateStr.endsWith('Z') ? dateStr : dateStr + 'Z');
    return date.toLocaleString('vi-VN');
  };

  useEffect(() => {
    fetchNotifications();
  }, []);

  const renderItem = ({ item }) => (
    <TouchableOpacity 
      style={[styles.notificationItem, !item.read && styles.unreadItem]}
      onPress={() => !item.read && handleMarkAsRead(item.id)}
      activeOpacity={0.7}
    >
      <View style={styles.iconContainer}>
        <Bell size={20} color={item.read ? '#999' : Colors.light.primary} />
      </View>
      <View style={styles.contentContainer}>
        <Text style={styles.notifTitle}>{translateNotificationTitle(item.title)}</Text>
        <Text style={styles.notifMessage}>{translateNotificationMessage(item.message)}</Text>
        <Text style={styles.notifTime}>{formatTime(item.createdAt)}</Text>
      </View>
    </TouchableOpacity>
  );

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <ChevronLeft size={24} color="#333" />
        </TouchableOpacity>
        <Text style={styles.title}>Thông báo</Text>
        <TouchableOpacity onPress={handleMarkAllAsRead}>
          <CheckCheck size={24} color={Colors.light.primary} />
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={Colors.light.primary} />
        </View>
      ) : notifications.length === 0 ? (
        <View style={styles.center}>
          <Bell size={64} color="#CCC" />
          <Text style={styles.emptyText}>Chưa có thông báo nào</Text>
        </View>
      ) : (
        <FlatList
          data={notifications}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          contentContainerStyle={styles.list}
        />
      )}
    </View>
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
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 15,
    borderBottomWidth: 1,
    borderBottomColor: '#F2F2F2',
  },
  title: {
    fontSize: 20,
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
  list: {
    paddingBottom: 20,
  },
  notificationItem: {
    flexDirection: 'row',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#F2F2F2',
  },
  unreadItem: {
    backgroundColor: '#EEF2FF',
  },
  iconContainer: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#F0F0F0',
    justifyContent: 'center',
    alignItems: 'center',
  },
  contentContainer: {
    flex: 1,
    marginLeft: 15,
  },
  notifTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 4,
    color: '#333',
  },
  notifMessage: {
    fontSize: 14,
    color: '#666',
    lineHeight: 20,
    marginBottom: 6,
  },
  notifTime: {
    fontSize: 12,
    color: '#999',
  },
});
