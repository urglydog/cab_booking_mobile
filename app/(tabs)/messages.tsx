import React from 'react';
import { StyleSheet, View, Text, FlatList, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Search, UserCircle2 } from 'lucide-react-native';
import { Colors } from '@/constants/Colors';

const MOCK_MESSAGES = [
  {
    id: '1',
    name: 'Tài xế Nguyễn Chí Thiện',
    message: 'Tôi đang đến điểm đón, bạn vui lòng đợi chút nhé!',
    time: '10:45',
    unread: true,
  },
  {
    id: '2',
    name: 'Tài xế Trần Quốc Bảo',
    message: 'Tôi đang đứng ở cổng trường IUH, bạn mặc áo gì thế?',
    time: 'Hôm qua',
    unread: false,
  },
  {
    id: '3',
    name: 'Hỗ trợ CAB Support',
    message: 'Yêu cầu hỗ trợ của bạn đã được giải quyết.',
    time: '15/05',
    unread: false,
  },
];

export default function MessagesScreen() {
  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Trò chuyện</Text>
      </View>

      <View style={styles.searchContainer}>
        <Search size={20} color={Colors.light.icon} />
        <Text style={styles.searchPlaceholder}>Tìm kiếm cuộc trò chuyện...</Text>
      </View>

      <FlatList
        data={MOCK_MESSAGES}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <TouchableOpacity style={styles.messageItem} activeOpacity={0.7}>
            <View style={styles.avatarContainer}>
              <UserCircle2 size={40} color={item.unread ? Colors.light.primary : '#999'} />
            </View>
            <View style={styles.messageContent}>
              <View style={styles.messageHeader}>
                <Text style={[styles.name, item.unread && styles.unreadName]}>{item.name}</Text>
                <Text style={styles.time}>{item.time}</Text>
              </View>
              <Text numberOfLines={1} style={[styles.message, item.unread && styles.unreadMessage]}>
                {item.message}
              </Text>
            </View>
            {item.unread && <View style={styles.unreadDot} />}
          </TouchableOpacity>
        )}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  header: {
    paddingHorizontal: 20,
    paddingVertical: 15,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F2F2F2',
    marginHorizontal: 20,
    paddingHorizontal: 15,
    height: 40,
    borderRadius: 20,
    marginBottom: 10,
    gap: 10,
  },
  searchPlaceholder: {
    color: '#999',
    fontSize: 14,
  },
  messageItem: {
    flexDirection: 'row',
    padding: 20,
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#F2F2F2',
  },
  avatarContainer: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  messageContent: {
    flex: 1,
    marginLeft: 15,
  },
  messageHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  name: {
    fontSize: 16,
    color: '#333',
  },
  unreadName: {
    fontWeight: 'bold',
    color: '#000',
  },
  time: {
    fontSize: 12,
    color: '#999',
  },
  message: {
    fontSize: 14,
    color: '#666',
  },
  unreadMessage: {
    color: '#333',
    fontWeight: '600',
  },
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: Colors.light.primary,
    marginLeft: 10,
  }
});
