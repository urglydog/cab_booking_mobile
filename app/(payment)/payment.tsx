import React, { useEffect, useState, useCallback } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  ActivityIndicator,
  Image,
  Alert,
  Share,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { ChevronLeft, CheckCircle, XCircle, QrCode, ExternalLink } from 'lucide-react-native';
import { Colors } from '@/constants/Colors';
import { usePayment } from '@/hooks/usePayment';
import {
  PaymentService,
  PaymentStatus,
  PaymentMethod,
  canRetryPayment,
} from '@/services/paymentService';

export default function PaymentScreen() {
  const router = useRouter();
  const { transactionId, bookingId, amount, paymentMethod } = useLocalSearchParams();
  const { currentPayment, isLoading, startPolling, stopPolling } = usePayment();

  const [status, setStatus] = useState<PaymentStatus>('PENDING');
  const [isPolling, setIsPolling] = useState(false);

  // Start polling when screen loads
  useEffect(() => {
    if (!transactionId) return;

    setIsPolling(true);
    startPolling(transactionId as string, (newStatus, payment) => {
      setStatus(newStatus as PaymentStatus);
      if (newStatus === 'SUCCESS') {
        setIsPolling(false);
        router.replace({
          pathname: '/(payment)/payment-success',
          params: { transactionId: transactionId as string, bookingId: bookingId as string },
        });
      } else if (newStatus === 'FAILED_FINAL') {
        setIsPolling(false);
        router.replace({
          pathname: '/(payment)/payment-failed',
          params: {
            transactionId: transactionId as string,
            bookingId: bookingId as string,
            reason: 'Thanh toán thất bại sau nhiều lần thử',
          },
        });
      }
    });

    return () => {
      stopPolling();
    };
  }, [transactionId]);

  const handleOpenGateway = async () => {
    if (!currentPayment) return;
    try {
      await PaymentService.openPaymentGateway(currentPayment);
    } catch (err: any) {
      Alert.alert('Lỗi', err?.message || 'Không thể mở cổng thanh toán');
    }
  };

  const handleCopyTransactionId = () => {
    // Using Share as fallback for copy
    Share.share({
      message: `Mã giao dịch: ${transactionId}`,
    });
  };

  const handleRetry = async () => {
    router.back();
  };

  const handleCancel = () => {
    stopPolling();
    router.back();
  };

  const getMethodLabel = (method: string) => {
    const labels: Record<string, string> = {
      MOMO: 'MoMo',
      ZALOPAY: 'ZaloPay',
      VNPAY: 'VNPay',
      CASH: 'Tiền mặt',
    };
    return labels[method] || method;
  };

  const getMethodColor = (method: string) => {
    const colors: Record<string, string> = {
      MOMO: '#A50064',
      ZALOPAY: '#0068FF',
      VNPAY: '#AA2B52',
      CASH: '#10B981',
    };
    return colors[method] || '#6366F1';
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={handleCancel} style={styles.backButton}>
          <ChevronLeft size={28} color="#111" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Thanh toán</Text>
        <View style={{ width: 28 }} />
      </View>

      <View style={styles.content}>
        {/* Amount Card */}
        <View style={styles.amountCard}>
          <Text style={styles.amountLabel}>Số tiền thanh toán</Text>
          <Text style={styles.amountValue}>
            {amount ? `${Number(amount).toLocaleString()}đ` : (currentPayment?.amount?.toLocaleString() + 'đ') || '...'}
          </Text>
          <View style={[styles.methodBadge, { backgroundColor: getMethodColor(currentPayment?.paymentMethod || (paymentMethod as string) || 'MOMO') + '15' }]}>
            <Text style={[styles.methodBadgeText, { color: getMethodColor(currentPayment?.paymentMethod || (paymentMethod as string) || 'MOMO') }]}>
              {getMethodLabel(currentPayment?.paymentMethod || (paymentMethod as string) || 'MOMO')}
            </Text>
          </View>
        </View>

        {/* Transaction Info */}
        {transactionId && (
          <TouchableOpacity style={styles.txnCard} onPress={handleCopyTransactionId}>
            <Text style={styles.txnLabel}>Mã giao dịch</Text>
            <View style={styles.txnRow}>
              <Text style={styles.txnValue}>{transactionId}</Text>
              <ExternalLink size={14} color="#999" />
            </View>
          </TouchableOpacity>
        )}

        {/* Status Area */}
        <View style={styles.statusArea}>
          {isLoading || isPolling ? (
            <>
              <ActivityIndicator size="large" color="#6366F1" />
              <Text style={styles.statusTitle}>Đang xử lý thanh toán...</Text>
              <Text style={styles.statusSubtitle}>
                Vui lòng hoàn tất thanh toán trên ứng dụng {getMethodLabel(currentPayment?.paymentMethod || (paymentMethod as string) || '')}.
                Màn hình sẽ tự động cập nhật kết quả.
              </Text>

              {/* QR Code Display */}
              {currentPayment?.qrCodeUrl && (
                <View style={styles.qrContainer}>
                  <Text style={styles.qrTitle}>Quét mã QR để thanh toán</Text>
                  <Image
                    source={{ uri: currentPayment.qrCodeUrl }}
                    style={styles.qrImage}
                    resizeMode="contain"
                  />
                </View>
              )}

              {/* Open App Button */}
              {(currentPayment?.deeplink || currentPayment?.payUrl) && (
                <TouchableOpacity style={styles.openGatewayButton} onPress={handleOpenGateway}>
                  <Text style={styles.openGatewayText}>
                    Mở ứng dụng {getMethodLabel(currentPayment.paymentMethod)}
                  </Text>
                </TouchableOpacity>
              )}
            </>
          ) : status === 'SUCCESS' ? (
            <>
              <CheckCircle size={80} color="#10B981" />
              <Text style={[styles.statusTitle, { color: '#10B981' }]}>Thanh toán thành công!</Text>
            </>
          ) : status === 'FAILED' || status === 'FAILED_FINAL' ? (
            <>
              <XCircle size={80} color="#EF4444" />
              <Text style={[styles.statusTitle, { color: '#EF4444' }]}>Thanh toán thất bại</Text>
              <Text style={styles.statusSubtitle}>
                {canRetryPayment(status) ? 'Bạn có thể thử lại.' : 'Vui lòng liên hệ hỗ trợ.'}
              </Text>
              {canRetryPayment(status) && (
                <TouchableOpacity style={styles.retryButton} onPress={handleRetry}>
                  <Text style={styles.retryButtonText}>Thử lại</Text>
                </TouchableOpacity>
              )}
            </>
          ) : (
            <>
              <QrCode size={80} color="#6366F1" />
              <Text style={styles.statusTitle}>Chờ thanh toán</Text>
            </>
          )}
        </View>

        {/* Instructions */}
        <View style={styles.instructionsCard}>
          <Text style={styles.instructionsTitle}>Hướng dẫn</Text>
          <Text style={styles.instructionsText}>
            1. Mở ứng dụng {getMethodLabel(currentPayment?.paymentMethod || (paymentMethod as string) || 'MoMo/ZaloPay')} trên điện thoại.{'\n'}
            2. Quét mã QR hoặc xác nhận thanh toán.{'\n'}
            3. Hoàn tất và quay lại ứng dụng để xem kết quả.
          </Text>
        </View>
      </View>

      {/* Bottom Actions */}
      <View style={styles.bottomActions}>
        {canRetryPayment(status) && (
          <TouchableOpacity style={styles.cancelButton} onPress={handleCancel}>
            <Text style={styles.cancelButtonText}>Hủy</Text>
          </TouchableOpacity>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8F9FB',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 15,
    paddingVertical: 12,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F0',
  },
  backButton: {
    padding: 4,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: 'bold',
  },
  content: {
    flex: 1,
    padding: 20,
  },
  amountCard: {
    backgroundColor: '#fff',
    borderRadius: 20,
    padding: 24,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 4,
    marginBottom: 16,
  },
  amountLabel: {
    fontSize: 14,
    color: '#999',
    marginBottom: 8,
  },
  amountValue: {
    fontSize: 36,
    fontWeight: '800',
    color: '#111',
    marginBottom: 12,
  },
  methodBadge: {
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderRadius: 20,
  },
  methodBadgeText: {
    fontSize: 14,
    fontWeight: '700',
  },
  txnCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 20,
  },
  txnLabel: {
    fontSize: 12,
    color: '#999',
    marginBottom: 4,
  },
  txnRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  txnValue: {
    fontSize: 13,
    color: '#666',
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  statusArea: {
    alignItems: 'center',
    paddingVertical: 24,
  },
  statusTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#111',
    marginTop: 16,
    marginBottom: 8,
    textAlign: 'center',
  },
  statusSubtitle: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
    paddingHorizontal: 20,
    lineHeight: 20,
  },
  qrContainer: {
    alignItems: 'center',
    marginTop: 24,
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 20,
    width: '100%',
  },
  qrTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#666',
    marginBottom: 16,
  },
  qrImage: {
    width: 200,
    height: 200,
  },
  openGatewayButton: {
    marginTop: 20,
    backgroundColor: '#6366F1',
    paddingHorizontal: 32,
    paddingVertical: 14,
    borderRadius: 16,
  },
  openGatewayText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
  retryButton: {
    marginTop: 20,
    backgroundColor: '#EF4444',
    paddingHorizontal: 40,
    paddingVertical: 14,
    borderRadius: 16,
  },
  retryButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
  instructionsCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginTop: 8,
  },
  instructionsTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#111',
    marginBottom: 8,
  },
  instructionsText: {
    fontSize: 13,
    color: '#666',
    lineHeight: 22,
  },
  bottomActions: {
    padding: 20,
    paddingBottom: 36,
  },
  cancelButton: {
    alignItems: 'center',
    paddingVertical: 14,
  },
  cancelButtonText: {
    color: '#EF4444',
    fontSize: 16,
    fontWeight: '600',
  },
});
