import React, { useEffect, useState } from 'react';
import { StyleSheet, View, Text, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { CheckCircle, Navigation, Receipt } from 'lucide-react-native';
import { usePayment } from '@/hooks/usePayment';

export default function PaymentSuccessScreen() {
  const router = useRouter();
  const { transactionId, bookingId } = useLocalSearchParams();
  const { currentPayment } = usePayment();
  const [showConfetti, setShowConfetti] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setShowConfetti(true), 300);
    return () => clearTimeout(timer);
  }, []);

  const handleContinueMatching = () => {
    if (bookingId) {
      router.replace({
        pathname: '/(ride)/matching',
        params: { bookingId: bookingId as string },
      });
      return;
    }
    router.replace('/(tabs)');
  };

  const handleViewReceipt = () => {
    if (bookingId) {
      router.push({
        pathname: '/(ride)/detail',
        params: { bookingId: bookingId as string },
      });
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        <View style={styles.iconContainer}>
          <View style={[styles.iconCircle, showConfetti && styles.iconCircleAnimate]}>
            <CheckCircle size={80} color="#fff" />
          </View>
        </View>

        <Text style={styles.title}>Thanh toán thành công!</Text>
        <Text style={styles.subtitle}>
          Hệ thống sẽ bắt đầu tìm tài xế cho chuyến đi của bạn
        </Text>

        {currentPayment && (
          <View style={styles.amountCard}>
            <Text style={styles.amountLabel}>Số tiền đã thanh toán</Text>
            <Text style={styles.amountValue}>
              {currentPayment.amount.toLocaleString()}đ
            </Text>
            <View style={styles.methodRow}>
              <Text style={styles.methodLabel}>
                Phương thức: {currentPayment.paymentMethod}
              </Text>
            </View>
          </View>
        )}

        {transactionId && (
          <View style={styles.txnCard}>
            <Text style={styles.txnLabel}>Mã giao dịch</Text>
            <Text style={styles.txnValue}>{transactionId}</Text>
          </View>
        )}

        <View style={styles.actionsContainer}>
          {bookingId && (
            <TouchableOpacity style={styles.actionButton} onPress={handleViewReceipt}>
              <Receipt size={22} color="#6366F1" />
              <Text style={styles.actionButtonText}>Xem chi tiết chuyến đi</Text>
            </TouchableOpacity>
          )}

          <TouchableOpacity style={[styles.actionButton, styles.primaryButton]} onPress={handleContinueMatching}>
            <Navigation size={22} color="#fff" />
            <Text style={[styles.actionButtonText, { color: '#fff' }]}>Tiếp tục tìm tài xế</Text>
          </TouchableOpacity>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F0FDF4',
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
    backgroundColor: '#10B981',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#10B981',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.4,
    shadowRadius: 16,
    elevation: 10,
  },
  iconCircleAnimate: {
    transform: [{ scale: 1.05 }],
  },
  title: {
    fontSize: 28,
    fontWeight: '800',
    color: '#065F46',
    marginBottom: 8,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 15,
    color: '#6B7280',
    textAlign: 'center',
    marginBottom: 32,
  },
  amountCard: {
    backgroundColor: '#fff',
    borderRadius: 20,
    padding: 24,
    alignItems: 'center',
    width: '100%',
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 4,
  },
  amountLabel: {
    fontSize: 14,
    color: '#9CA3AF',
    marginBottom: 8,
  },
  amountValue: {
    fontSize: 40,
    fontWeight: '800',
    color: '#10B981',
    marginBottom: 8,
  },
  methodRow: {
    marginTop: 4,
  },
  methodLabel: {
    fontSize: 13,
    color: '#6B7280',
  },
  txnCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    width: '100%',
    alignItems: 'center',
    marginBottom: 32,
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
  actionsContainer: {
    width: '100%',
    gap: 12,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fff',
    paddingVertical: 16,
    borderRadius: 16,
    gap: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  primaryButton: {
    backgroundColor: '#10B981',
  },
  actionButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#374151',
  },
});
