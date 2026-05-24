import React, { useEffect, useState, useRef } from 'react';
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
import { usePayment } from '@/hooks/usePayment';
import {
  PaymentService,
  PaymentStatus,
  canRetryPayment,
  parsePaymentCallbackUrl,
} from '@/services/paymentService';

export default function PaymentScreen() {
  const router = useRouter();
  const { transactionId, bookingId, amount, paymentMethod } = useLocalSearchParams();
  const { isLoading, startPolling, stopPolling } = usePayment();

  const [status, setStatus] = useState<PaymentStatus>('PENDING');
  const [isPolling, setIsPolling] = useState(false);
  const [isFetchingPayment, setIsFetchingPayment] = useState(false);
  const [paymentData, setPaymentData] = useState<PaymentInitResponse | null>(null);
  const pollingIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ────────────────────────────────────────────────────────────────────────────
  // Step 1: Ensure we have a transactionId. If not, init directly.
  // ────────────────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!transactionId && bookingId && !isFetchingPayment) {
      setIsFetchingPayment(true);
      (async () => {
        try {
          const paymentInfo = await PaymentService.initPayment({
            bookingId: bookingId as string,
            amount: Number(amount) || 0,
            paymentMethod: (paymentMethod as 'MOMO' | 'ZALOPAY' | 'VNPAY' | 'CASH') || 'VNPAY',
          });
          router.replace({
            pathname: '/(payment)/payment',
            params: {
              bookingId: bookingId as string,
              amount: amount as string,
              paymentMethod: paymentMethod as string,
              transactionId: paymentInfo.transactionId,
            },
          });
        } catch {
          Alert.alert('Lỗi', 'Không thể khởi tạo thanh toán. Vui lòng thử lại.');
          router.back();
        }
      })();
    }
  }, [transactionId, bookingId, amount, paymentMethod, isFetchingPayment]);

  // ────────────────────────────────────────────────────────────────────────────
  // Step 2: Fetch current payment state and start polling.
  // Flow: booking(PENDING_PAYMENT) -> payment.requested(Kafka) ->
  //       PaymentService creates txn -> Customer pays -> payment.completed ->
  //       Booking MATCHING -> matching.tsx
  // ────────────────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!transactionId) return;

    let cancelled = false;

    (async () => {
      // Fetch current payment state directly (not via context — avoids stale closure issues)
      const payment = await PaymentService.getPaymentStatus(transactionId as string);
      if (cancelled) return;

      if (payment) {
        setPaymentData(payment);
        setStatus(payment.status as PaymentStatus);
      }

      // Start polling for status updates
      setIsPolling(true);

      const pollInterval = setInterval(async () => {
        const updated = await PaymentService.getPaymentStatus(transactionId as string);
        if (!updated || cancelled) return;

        setPaymentData(updated);
        setStatus(updated.status as PaymentStatus);

        if (updated.status === 'SUCCESS') {
          clearInterval(pollInterval);
          setIsPolling(false);
          router.replace({
            pathname: '/(ride)/matching',
            params: { bookingId: bookingId as string },
          });
        } else if (updated.status === 'FAILED_FINAL') {
          clearInterval(pollInterval);
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
      }, 3000);

      // Store interval cleanup ref
      pollingIntervalRef.current = pollInterval;
    })();

    return () => {
      cancelled = true;
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
        pollingIntervalRef.current = null;
      }
    };
  }, [transactionId, bookingId]);

  // ────────────────────────────────────────────────────────────────────────────
  // Step 3: Auto-open payment gateway when payUrl/deeplink is available
  // VNPay: openAuthSessionAsync chờ redirect trước khi resolve
  // MoMo/ZaloPay: deeplink mở app riêng
  // ────────────────────────────────────────────────────────────────────────────
  const handleOpenGateway = async () => {
    if (!paymentData) return;
    try {
      const gatewayResult = await PaymentService.openPaymentGateway(paymentData);

      // openAuthSessionAsync đã resolve -> xử lý callbackUrl nếu có
      if (gatewayResult.callbackUrl) {
        const callback = parsePaymentCallbackUrl(gatewayResult.callbackUrl);
        if (callback?.status === 'success') {
          router.replace({
            pathname: '/(ride)/matching',
            params: { bookingId: (callback.bookingId || bookingId) as string },
          });
          return;
        } else if (callback?.status === 'failed' || callback?.status === 'cancelled') {
          router.replace({
            pathname: '/(payment)/payment-failed',
            params: {
              transactionId: callback.transactionId || (transactionId as string),
              bookingId: (callback.bookingId || bookingId) as string,
              reason: callback.reason || 'Thanh toán không thành công',
            },
          });
          return;
        }
      }

      // Không có callbackUrl -> browser đã mở, chờ redirect và app quay lại
      // (Polling sẽ tự động phát hiện thanh toán thành công)
      console.log('[PaymentScreen] Browser opened, waiting for payment redirect...');
    } catch (err: any) {
      Alert.alert('Lỗi', err?.message || 'Không thể mở cổng thanh toán');
    }
  };

  // Auto-open gateway when payment info is loaded with a payUrl/deeplink
  useEffect(() => {
    if (paymentData?.payUrl || paymentData?.deeplink) {
      const timer = setTimeout(handleOpenGateway, 800);
      return () => clearTimeout(timer);
    }
  }, [paymentData?.payUrl, paymentData?.deeplink]);

  const handleCopyTransactionId = () => {
    Share.share({ message: `Mã giao dịch: ${transactionId}` });
  };

  const handleRetry = () => {
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

  const effectiveMethod = paymentData?.paymentMethod || (paymentMethod as string) || 'VNPAY';
  const isPending = isPolling || isLoading;
  const isSuccess = status === 'SUCCESS';
  const isFailed = status === 'FAILED' || status === 'FAILED_FINAL';
  const showQr = paymentData?.qrCodeUrl;
  const showGatewayButton = paymentData?.deeplink || paymentData?.payUrl;

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
            {amount
              ? `${Number(amount).toLocaleString()}đ`
              : paymentData?.amount
                ? `${paymentData.amount.toLocaleString()}đ`
                : '...'}
          </Text>
          <View style={[styles.methodBadge, { backgroundColor: getMethodColor(effectiveMethod) + '15' }]}>
            <Text style={[styles.methodBadgeText, { color: getMethodColor(effectiveMethod) }]}>
              {getMethodLabel(effectiveMethod)}
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
          {isPending ? (
            <>
              <ActivityIndicator size="large" color="#6366F1" />
              <Text style={styles.statusTitle}>Đang xử lý thanh toán...</Text>
              <Text style={styles.statusSubtitle}>
                Vui lòng hoàn tất thanh toán trên ứng dụng {getMethodLabel(effectiveMethod)}.
                Màn hình sẽ tự động cập nhật kết quả.
              </Text>

              {/* QR Code Display */}
              {showQr && (
                <View style={styles.qrContainer}>
                  <Text style={styles.qrTitle}>Quét mã QR để thanh toán</Text>
                  <Image
                    source={{ uri: paymentData.qrCodeUrl }}
                    style={styles.qrImage}
                    resizeMode="contain"
                  />
                </View>
              )}

              {/* Open App Button */}
              {showGatewayButton && (
                <TouchableOpacity style={styles.openGatewayButton} onPress={handleOpenGateway}>
                  <Text style={styles.openGatewayText}>
                    Mở ứng dụng {getMethodLabel(effectiveMethod)}
                  </Text>
                </TouchableOpacity>
              )}
            </>
          ) : isSuccess ? (
            <>
              <CheckCircle size={80} color="#10B981" />
              <Text style={[styles.statusTitle, { color: '#10B981' }]}>Thanh toán thành công!</Text>
            </>
          ) : isFailed ? (
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
            1. Mở ứng dụng {getMethodLabel(effectiveMethod)} trên điện thoại.{'\n'}
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
