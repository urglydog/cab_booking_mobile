import React from 'react';
import { StyleSheet, View, Text, TouchableOpacity, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { XCircle, Home, RefreshCw, Phone } from 'lucide-react-native';
import { usePayment } from '@/hooks/usePayment';
import { PaymentService, PaymentMethod } from '@/services/paymentService';

export default function PaymentFailedScreen() {
  const router = useRouter();
  const { transactionId, bookingId, reason } = useLocalSearchParams();
  const { resetPayment } = usePayment();

  const handleGoHome = () => {
    resetPayment();
    router.replace('/(tabs)');
  };

  const handleRetry = async () => {
    if (!bookingId) {
      Alert.alert('Lỗi', 'Không tìm thấy thông tin đơn hàng');
      return;
    }

    // Navigate back to payment screen
    router.replace({
      pathname: '/(payment)/payment',
      params: { bookingId: bookingId as string },
    });
  };

  const handleSupport = () => {
    Alert.alert(
      'Liên hệ hỗ trợ',
      'Hotline: 1900 xxxx\nEmail: support@cabbooking.com',
      [{ text: 'OK' }]
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        {/* Error Icon */}
        <View style={styles.iconContainer}>
          <View style={styles.iconCircle}>
            <XCircle size={80} color="#fff" />
          </View>
        </View>

        {/* Title */}
        <Text style={styles.title}>Thanh toán thất bại</Text>
        <Text style={styles.subtitle}>
          {reason || 'Đã xảy ra lỗi trong quá trình thanh toán. Vui lòng thử lại.'}
        </Text>

        {/* Transaction Info */}
        {transactionId && (
          <View style={styles.txnCard}>
            <Text style={styles.txnLabel}>Mã giao dịch</Text>
            <Text style={styles.txnValue}>{transactionId}</Text>
          </View>
        )}

        {/* Error reason */}
        <View style={styles.errorCard}>
          <Text style={styles.errorCardTitle}>Nguyên nhân có thể:</Text>
          <Text style={styles.errorItem}>• Số dư ví không đủ</Text>
          <Text style={styles.errorItem}>• Giao dịch bị từ chối bởi ngân hàng</Text>
          <Text style={styles.errorItem}>• Hết thời gian chờ thanh toán</Text>
          <Text style={styles.errorItem}>• Lỗi kết nối mạng</Text>
        </View>

        {/* Actions */}
        <View style={styles.actionsContainer}>
          <TouchableOpacity style={styles.retryButton} onPress={handleRetry}>
            <RefreshCw size={20} color="#fff" />
            <Text style={styles.retryButtonText}>Thử lại</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.supportButton} onPress={handleSupport}>
            <Phone size={20} color="#6366F1" />
            <Text style={styles.supportButtonText}>Liên hệ hỗ trợ</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.homeButton} onPress={handleGoHome}>
            <Home size={20} color="#666" />
            <Text style={styles.homeButtonText}>Về trang chủ</Text>
          </TouchableOpacity>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FEF2F2',
  },
  content: {
    flex: 1,
    padding: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconContainer: {
    marginBottom: 24,
  },
  iconCircle: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: '#EF4444',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#EF4444',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.4,
    shadowRadius: 16,
    elevation: 10,
  },
  title: {
    fontSize: 28,
    fontWeight: '800',
    color: '#991B1B',
    marginBottom: 8,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 15,
    color: '#6B7280',
    textAlign: 'center',
    marginBottom: 24,
    paddingHorizontal: 16,
    lineHeight: 22,
  },
  txnCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    width: '100%',
    alignItems: 'center',
    marginBottom: 20,
  },
  txnLabel: {
    fontSize: 12,
    color: '#9CA3AF',
    marginBottom: 4,
  },
  txnValue: {
    fontSize: 13,
    color: '#374151',
    fontFamily: 'monospace',
  },
  errorCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 20,
    width: '100%',
    marginBottom: 32,
  },
  errorCardTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#374151',
    marginBottom: 12,
  },
  errorItem: {
    fontSize: 13,
    color: '#6B7280',
    marginBottom: 6,
    lineHeight: 20,
  },
  actionsContainer: {
    width: '100%',
    gap: 12,
  },
  retryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#EF4444',
    paddingVertical: 16,
    borderRadius: 16,
    gap: 10,
    shadowColor: '#EF4444',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  retryButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
  supportButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fff',
    paddingVertical: 16,
    borderRadius: 16,
    gap: 10,
    borderWidth: 2,
    borderColor: '#6366F1',
  },
  supportButtonText: {
    color: '#6366F1',
    fontSize: 16,
    fontWeight: '600',
  },
  homeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fff',
    paddingVertical: 16,
    borderRadius: 16,
    gap: 10,
  },
  homeButtonText: {
    color: '#666',
    fontSize: 16,
    fontWeight: '600',
  },
});
