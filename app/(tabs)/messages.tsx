import React from 'react';
import { StyleSheet, View, Text, FlatList, TouchableOpacity, Image } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Search, User } from 'lucide-react-native';
import { Colors } from '@/constants/Colors';

const MOCK_MESSAGES = [
  {
    id: '1',
    name: 'CAB Support',
    message: 'Your refund for ride #12345 has been processed.',
    time: '09:41',
    unread: true,
  },
  {
    id: '2',
    name: 'Driver Nguyen',
    message: 'I have arrived at the pickup location.',
    time: 'Yesterday',
    unread: false,
  },
];

export default function MessagesScreen() {
  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Messages</Text>
      </View>

      <View style={styles.searchContainer}>
        <Search size={20} color={Colors.light.icon} />
        <Text style={styles.searchPlaceholder}>Search messages...</Text>
      </View>

      <FlatList
        data={MOCK_MESSAGES}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <TouchableOpacity style={styles.messageItem}>
            <View style={styles.avatarPlaceholder}>
              <User size={24} color="#fff" />
            </View>
            <View style={styles.messageContent}>
              <View style={styles.messageHeader}>
                <Text style={styles.name}>{item.name}</Text>
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
  avatarPlaceholder: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: '#CCC',
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
    fontWeight: 'bold',
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
    color: '#000',
    fontWeight: '500',
  },
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#00B14F',
    marginLeft: 10,
  }
});
