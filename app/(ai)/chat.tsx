import React, { useState, useRef, useEffect } from 'react';
import {
  StyleSheet, View, Text, TextInput, TouchableOpacity,
  FlatList, ActivityIndicator, KeyboardAvoidingView, Platform,
  SafeAreaView, Alert
} from 'react-native';
import { useRouter } from 'expo-router';
import { ChevronLeft, Send, Bot, User, AlertTriangle } from 'lucide-react-native';
import api from '@/services/api';

interface Message {
  id: string;
  role: 'user' | 'assistant' | 'error';
  content: string;
  timestamp: Date;
}

const QUICK_PROMPTS = [
  '🚗 Cách đặt xe?',
  '💰 Bảng giá xe',
  '⭐ Cách đánh giá tài xế?',
  '📞 Liên hệ hỗ trợ',
];

export default function AIChatScreen() {
  const router = useRouter();
  const [messages, setMessages] = useState<Message[]>([
    {
      id: '0',
      role: 'assistant',
      content: 'Xin chào! Tôi là trợ lý AI của CAB Booking 🚖\n\nTôi có thể giúp bạn:\n• Đặt xe & tra cứu giá cước\n• Hỗ trợ thanh toán\n• Giải đáp thắc mắc về dịch vụ\n\nBạn cần hỗ trợ gì?',
      timestamp: new Date(),
    }
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [quotaExceeded, setQuotaExceeded] = useState(false);
  const flatListRef = useRef<FlatList>(null);

  useEffect(() => {
    setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100);
  }, [messages]);

  const sendMessage = async (text?: string) => {
    const messageText = (text || input).trim();
    if (!messageText || loading) return;

    const userMsg: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: messageText,
      timestamp: new Date(),
    };

    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setLoading(true);

    try {
      const response = await api.post('/api/v1/ai-agent/chat', { message: messageText });
      const reply = response.data?.reply || 'Xin lỗi, tôi không hiểu câu hỏi này.';

      setMessages(prev => [...prev, {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: reply,
        timestamp: new Date(),
      }]);
      setQuotaExceeded(false);
    } catch (error: any) {
      const detail = error?.response?.data?.detail || '';
      const isQuota = detail.includes('429') || detail.includes('quota') || detail.includes('rate');
      const isRetry = detail.match(/retry in (\d+)/i);
      const retrySeconds = isRetry ? isRetry[1] : null;

      let errContent = '❌ Xin lỗi, có lỗi xảy ra. Vui lòng thử lại.';
      if (isQuota) {
        setQuotaExceeded(true);
        errContent = `⚠️ Đã hết lượt AI trong ngày (Free Tier limit)\n\n${retrySeconds ? `Thử lại sau ${retrySeconds} giây.` : 'Vui lòng thử lại sau ít phút.'}\n\n💡 Đây là môi trường test — quota sẽ tự reset lúc 0h UTC.`;
      }

      setMessages(prev => [...prev, {
        id: (Date.now() + 1).toString(),
        role: 'error',
        content: errContent,
        timestamp: new Date(),
      }]);
    } finally {
      setLoading(false);
    }
  };

  const renderMessage = ({ item }: { item: Message }) => {
    const isUser = item.role === 'user';
    const isError = item.role === 'error';
    return (
      <View style={[styles.messageRow, isUser && styles.messageRowUser]}>
        {!isUser && (
          <View style={[styles.avatar, isError && styles.avatarError]}>
            {isError ? <AlertTriangle size={16} color="#fff" /> : <Bot size={16} color="#fff" />}
          </View>
        )}
        <View style={[
          styles.bubble,
          isUser ? styles.bubbleUser : styles.bubbleBot,
          isError && styles.bubbleError,
        ]}>
          <Text style={[styles.bubbleText, isUser && styles.bubbleTextUser]}>
            {item.content}
          </Text>
          <Text style={[styles.timeText, isUser && { color: 'rgba(255,255,255,0.6)' }]}>
            {item.timestamp.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}
          </Text>
        </View>
        {isUser && (
          <View style={styles.avatarUser}>
            <User size={16} color="#fff" />
          </View>
        )}
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <ChevronLeft size={26} color="#fff" />
        </TouchableOpacity>
        <View style={styles.headerInfo}>
          <View style={styles.headerAvatar}>
            <Bot size={20} color="#fff" />
          </View>
          <View>
            <Text style={styles.headerTitle}>CAB AI Assistant</Text>
            <Text style={styles.headerSub}>
              {quotaExceeded ? '⚠️ Hết quota hôm nay' : '● Đang hoạt động'}
            </Text>
          </View>
        </View>
      </View>

      {/* Quota Warning Banner */}
      {quotaExceeded && (
        <View style={styles.quotaBanner}>
          <AlertTriangle size={16} color="#92400E" />
          <Text style={styles.quotaText}>
            AI Agent đã hết lượt dùng miễn phí hôm nay (Free Tier). Sẽ reset lúc 0h UTC.
          </Text>
        </View>
      )}

      {/* Messages */}
      <FlatList
        ref={flatListRef}
        data={messages}
        keyExtractor={item => item.id}
        renderItem={renderMessage}
        contentContainerStyle={styles.messageList}
        onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: true })}
      />

      {/* Quick Prompts */}
      {messages.length <= 1 && (
        <View style={styles.quickPrompts}>
          {QUICK_PROMPTS.map(prompt => (
            <TouchableOpacity
              key={prompt}
              style={styles.quickPromptBtn}
              onPress={() => sendMessage(prompt.replace(/^[^\s]+\s/, ''))}
            >
              <Text style={styles.quickPromptText}>{prompt}</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      {/* Loading indicator */}
      {loading && (
        <View style={styles.typingIndicator}>
          <Bot size={14} color="#6366F1" />
          <Text style={styles.typingText}>AI đang trả lời...</Text>
          <ActivityIndicator size="small" color="#6366F1" style={{ marginLeft: 6 }} />
        </View>
      )}

      {/* Input */}
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <View style={styles.inputRow}>
          <TextInput
            style={styles.input}
            placeholder="Nhập câu hỏi..."
            placeholderTextColor="#9CA3AF"
            value={input}
            onChangeText={setInput}
            multiline
            maxLength={500}
            onSubmitEditing={() => sendMessage()}
          />
          <TouchableOpacity
            style={[styles.sendBtn, (!input.trim() || loading) && styles.sendBtnDisabled]}
            onPress={() => sendMessage()}
            disabled={!input.trim() || loading}
          >
            <Send size={20} color="#fff" />
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8F9FB' },
  header: {
    backgroundColor: '#6366F1',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    paddingTop: 50,
    gap: 12,
  },
  backBtn: { padding: 4 },
  headerInfo: { flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 },
  headerAvatar: {
    width: 38, height: 38, borderRadius: 19,
    backgroundColor: 'rgba(255,255,255,0.2)',
    justifyContent: 'center', alignItems: 'center',
  },
  headerTitle: { color: '#fff', fontSize: 16, fontWeight: '700' },
  headerSub: { color: 'rgba(255,255,255,0.8)', fontSize: 12, marginTop: 1 },
  quotaBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: '#FEF3C7', paddingHorizontal: 16, paddingVertical: 10,
    borderBottomWidth: 1, borderBottomColor: '#FCD34D',
  },
  quotaText: { flex: 1, fontSize: 12, color: '#92400E', lineHeight: 16 },
  messageList: { paddingHorizontal: 16, paddingVertical: 12, paddingBottom: 8 },
  messageRow: { flexDirection: 'row', marginBottom: 12, alignItems: 'flex-end', gap: 8 },
  messageRowUser: { flexDirection: 'row-reverse' },
  avatar: {
    width: 32, height: 32, borderRadius: 16,
    backgroundColor: '#6366F1', justifyContent: 'center', alignItems: 'center',
  },
  avatarError: { backgroundColor: '#EF4444' },
  avatarUser: {
    width: 32, height: 32, borderRadius: 16,
    backgroundColor: '#10B981', justifyContent: 'center', alignItems: 'center',
  },
  bubble: {
    maxWidth: '75%', padding: 12, borderRadius: 16,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05, shadowRadius: 3, elevation: 1,
  },
  bubbleBot: { backgroundColor: '#fff', borderBottomLeftRadius: 4 },
  bubbleUser: { backgroundColor: '#6366F1', borderBottomRightRadius: 4 },
  bubbleError: { backgroundColor: '#FEF2F2', borderWidth: 1, borderColor: '#FECACA' },
  bubbleText: { fontSize: 14.5, color: '#1F2937', lineHeight: 21 },
  bubbleTextUser: { color: '#fff' },
  timeText: { fontSize: 10, color: '#9CA3AF', marginTop: 4, textAlign: 'right' },
  quickPrompts: {
    flexDirection: 'row', flexWrap: 'wrap', gap: 8,
    paddingHorizontal: 16, paddingBottom: 8,
  },
  quickPromptBtn: {
    backgroundColor: '#EEF2FF', paddingHorizontal: 14, paddingVertical: 8,
    borderRadius: 20, borderWidth: 1, borderColor: '#E0E7FF',
  },
  quickPromptText: { fontSize: 13, color: '#6366F1', fontWeight: '600' },
  typingIndicator: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 20, paddingBottom: 4,
  },
  typingText: { fontSize: 12, color: '#6366F1', fontStyle: 'italic' },
  inputRow: {
    flexDirection: 'row', alignItems: 'flex-end', gap: 10,
    paddingHorizontal: 16, paddingVertical: 12,
    backgroundColor: '#fff',
    borderTopWidth: 1, borderTopColor: '#F0F0F0',
  },
  input: {
    flex: 1, minHeight: 44, maxHeight: 120,
    backgroundColor: '#F8F9FB', borderRadius: 22,
    paddingHorizontal: 16, paddingVertical: 10,
    fontSize: 15, color: '#1F2937',
    borderWidth: 1, borderColor: '#E5E7EB',
  },
  sendBtn: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: '#6366F1', justifyContent: 'center', alignItems: 'center',
  },
  sendBtnDisabled: { backgroundColor: '#D1D5DB' },
});
