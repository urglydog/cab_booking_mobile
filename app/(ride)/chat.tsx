import React, { useEffect, useState, useRef } from 'react';
import { StyleSheet, View, Text, TextInput, TouchableOpacity, FlatList, KeyboardAvoidingView, Platform, ActivityIndicator } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ChevronLeft, Send, Phone, Shield } from 'lucide-react-native';
import { useSocket } from '@/hooks/useSocket';
import { Colors } from '@/constants/Colors';
import api from '@/services/api';

interface Message {
  id: string;
  sender: 'CUSTOMER' | 'DRIVER';
  message: string;
  timestamp: number;
}

export default function ChatScreen() {
  const router = useRouter();
  const { bookingId, driverName } = useLocalSearchParams();
  const { socket } = useSocket();
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputText, setInputText] = useState('');
  const [loading, setLoading] = useState(true);
  const flatListRef = useRef<FlatList>(null);
  const roomId = String(bookingId ?? '');

  useEffect(() => {
    if (!roomId) return;

    // Load initial mock welcome messages or historical messages if available
    setMessages([
      {
        id: 'welcome-1',
        sender: 'DRIVER',
        message: 'Xin chào, tôi là tài xế của bạn. Tôi đang di chuyển đến điểm đón!',
        timestamp: Date.now() - 60000,
      }
    ]);
    setLoading(false);

    if (socket) {
      socket.emit('join_room', roomId);

      const handleReceiveMessage = (data: any) => {
        if (String(data?.bookingId ?? '') !== roomId) return;
        const sender = String(data?.sender ?? data?.senderRole ?? '').toUpperCase() === 'DRIVER' ? 'DRIVER' : 'CUSTOMER';
        const newMsg: Message = {
          id: `msg-${Date.now()}-${Math.random()}`,
          sender,
          message: String(data?.message ?? ''),
          timestamp: data?.timestamp || Date.now(),
        };
        setMessages((prev) => [...prev, newMsg]);
        setTimeout(() => {
          flatListRef.current?.scrollToEnd({ animated: true });
        }, 100);
      };

      socket.on('receive_message', handleReceiveMessage);
    }

    return () => {
      if (socket && roomId) {
        socket.emit('leave_room', roomId);
        socket.off('receive_message');
      }
    };
  }, [socket, roomId]);

  const handleSendMessage = () => {
    if (!inputText.trim() || !socket || !roomId) return;

    const payload = {
      bookingId: roomId,
      sender: 'CUSTOMER',
      message: inputText.trim(),
      timestamp: Date.now(),
    };

    socket.emit('send_message', payload);
    setInputText('');
  };

  const renderMessageItem = ({ item }: { item: Message }) => {
    const isCustomer = item.sender === 'CUSTOMER';
    return (
      <View style={[styles.messageRow, isCustomer ? styles.customerRow : styles.driverRow]}>
        {!isCustomer && (
          <View style={styles.chatAvatar}>
            <Text style={styles.chatAvatarText}>TX</Text>
          </View>
        )}
        <View style={[styles.bubble, isCustomer ? styles.customerBubble : styles.driverBubble]}>
          <Text style={[styles.messageText, isCustomer ? styles.customerText : styles.driverText]}>
            {item.message}
          </Text>
          <Text style={[styles.timeText, isCustomer ? styles.customerTime : styles.driverTime]}>
            {new Date(item.timestamp).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}
          </Text>
        </View>
      </View>
    );
  };

  if (loading) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" color={Colors.light.primary} />
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <ChevronLeft size={24} color="#333" />
        </TouchableOpacity>
        <View style={styles.headerInfo}>
          <Text style={styles.headerTitle}>{driverName || 'Tài xế Nguyễn Chí Thiện'}</Text>
          <View style={styles.statusIndicator}>
            <View style={styles.onlineDot} />
            <Text style={styles.onlineText}>Đang trực tuyến</Text>
          </View>
        </View>
        <TouchableOpacity style={styles.phoneButton}>
          <Phone size={20} color="#2563EB" />
        </TouchableOpacity>
      </View>

      {/* Alert Banner */}
      <View style={styles.safetyBanner}>
        <Shield size={14} color="#059669" />
        <Text style={styles.safetyText}>Trò chuyện được mã hóa để bảo vệ quyền riêng tư của bạn</Text>
      </View>

      {/* Message List */}
      <FlatList
        ref={flatListRef}
        data={messages}
        keyExtractor={(item) => item.id}
        renderItem={renderMessageItem}
        contentContainerStyle={styles.listContent}
        onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: true })}
      />

      {/* Input Area */}
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
      >
        <View style={styles.inputContainer}>
          <TextInput
            style={styles.textInput}
            placeholder="Nhập tin nhắn..."
            placeholderTextColor="#9CA3AF"
            value={inputText}
            onChangeText={setInputText}
            onSubmitEditing={handleSendMessage}
          />
          <TouchableOpacity
            style={[styles.sendButton, !inputText.trim() && styles.sendButtonDisabled]}
            onPress={handleSendMessage}
            disabled={!inputText.trim()}
          >
            <Send size={18} color="#FFF" />
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F9FAFB',
  },
  loading: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#FFF',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#FFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  backButton: {
    padding: 4,
  },
  headerInfo: {
    flex: 1,
    marginLeft: 12,
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#111827',
  },
  statusIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 2,
  },
  onlineDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#10B981',
    marginRight: 6,
  },
  onlineText: {
    fontSize: 11,
    color: '#6B7280',
  },
  phoneButton: {
    padding: 8,
    backgroundColor: '#EFF6FF',
    borderRadius: 20,
  },
  safetyBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#ECFDF5',
    paddingVertical: 6,
    paddingHorizontal: 16,
    gap: 6,
  },
  safetyText: {
    fontSize: 11,
    color: '#047857',
    fontWeight: '500',
  },
  listContent: {
    padding: 16,
    paddingBottom: 24,
  },
  messageRow: {
    flexDirection: 'row',
    marginBottom: 16,
    maxWidth: '80%',
  },
  customerRow: {
    alignSelf: 'flex-end',
    flexDirection: 'row-reverse',
  },
  driverRow: {
    alignSelf: 'flex-start',
  },
  chatAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#6366F1',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 8,
  },
  chatAvatarText: {
    color: '#FFF',
    fontSize: 11,
    fontWeight: 'bold',
  },
  bubble: {
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.03,
    shadowRadius: 2,
    elevation: 1,
  },
  customerBubble: {
    backgroundColor: '#2563EB',
    borderTopRightRadius: 2,
  },
  driverBubble: {
    backgroundColor: '#FFF',
    borderTopLeftRadius: 2,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  messageText: {
    fontSize: 14,
    lineHeight: 20,
  },
  customerText: {
    color: '#FFF',
  },
  driverText: {
    color: '#111827',
  },
  timeText: {
    fontSize: 9,
    marginTop: 4,
    textAlign: 'right',
  },
  customerTime: {
    color: '#93C5FD',
  },
  driverTime: {
    color: '#9CA3AF',
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: '#FFF',
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
  },
  textInput: {
    flex: 1,
    backgroundColor: '#F3F4F6',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 8,
    fontSize: 14,
    color: '#111827',
    maxHeight: 100,
  },
  sendButton: {
    marginLeft: 12,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#2563EB',
    justifyContent: 'center',
    alignItems: 'center',
  },
  sendButtonDisabled: {
    backgroundColor: '#93C5FD',
  },
});
