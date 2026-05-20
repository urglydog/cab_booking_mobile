import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import AsyncStorage from '@react-native-async-storage/async-storage';
import api from './api';

export type PaymentMethod = 'MOMO' | 'ZALOPAY' | 'VNPAY' | 'CASH';

export type PaymentStatus = 'INIT' | 'PENDING' | 'SUCCESS' | 'FAILED' | 'RETRY' | 'FAILED_FINAL';

export interface PaymentInitResponse {
  transactionId: string;
  bookingId: string;
  customerId: string;
  driverId: string;
  amount: number;
  currency: string;
  paymentMethod: PaymentMethod;
  status: PaymentStatus;
  payUrl?: string;
  qrCodeUrl?: string;
  deeplink?: string;
  deeplinkWallet?: string;
  createdAt: string;
  updatedAt: string;
}

export interface PaymentError {
  errorCode: string;
  message: string;
}

const PAYMENT_ERROR_MESSAGES: Record<string, string> = {
  PAYMENT_001: 'Không tìm thấy giao dịch',
  PAYMENT_002: 'Đang có sự cố với hệ thống thanh toán. Vui lòng thử lại sau.',
  PAYMENT_003: 'Kết nối đến cổng thanh toán bị gián đoạn. Vui lòng thử lại.',
  PAYMENT_004: 'Yêu cầu bị trùng lặp. Vui lòng thử lại.',
  PAYMENT_005: 'Trạng thái thanh toán không hợp lệ.',
  PAYMENT_006: 'Thanh toán đã hoàn tất trước đó.',
  PAYMENT_007: 'Thanh toán đã thất bại. Vui lòng thử lại.',
  PAYMENT_008: 'Dữ liệu thanh toán không hợp lệ.',
  PAYMENT_009: 'Số tiền không hợp lệ.',
  PAYMENT_010: 'Thanh toán không thành công sau nhiều lần thử. Vui lòng liên hệ hỗ trợ.',
  PAYMENT_011: 'Thanh toán bị từ chối. Vui lòng thử phương thức khác.',
  NETWORK_ERROR: 'Lỗi kết nối mạng. Vui lòng kiểm tra kết nối.',
  NO_PAYMENT_URL: 'Không có URL thanh toán.',
  TIMEOUT: 'Hết thời gian chờ. Vui lòng thử lại.',
};

export function getPaymentErrorMessage(errorCode: string, fallback?: string): string {
  return PAYMENT_ERROR_MESSAGES[errorCode] || fallback || 'Đã xảy ra lỗi. Vui lòng thử lại.';
}

export function canRetryPayment(status: PaymentStatus): boolean {
  return ['PENDING', 'FAILED', 'RETRY', 'INIT'].includes(status);
}

export function shouldRetryError(errorCode: string): boolean {
  return ['PAYMENT_002', 'PAYMENT_003', 'NETWORK_ERROR'].includes(errorCode);
}

function generateIdempotencyKey(bookingId: string): string {
  return `${bookingId}_${Date.now()}_${Math.random().toString(36).substring(2, 10)}`;
}

export const PaymentService = {
  /**
   * Khởi tạo thanh toán - gọi POST /api/payments/charge
   */
  async initPayment({
    bookingId,
    amount,
    paymentMethod,
  }: {
    bookingId: string;
    amount: number;
    paymentMethod: PaymentMethod;
  }): Promise<PaymentInitResponse> {
    const customerId = (await AsyncStorage.getItem('user_id')) || '';
    const idempotencyKey = generateIdempotencyKey(bookingId);

    const response = await api.post('/api/payments/charge', {
      bookingId,
      customerId,
      amount,
      paymentMethod,
      currency: 'VND',
      description: `Thanh toan chuyen xe ${bookingId}`,
      idempotencyKey,
    });

    if (response.data?.code !== 200) {
      throw {
        errorCode: response.data?.errorCode || 'PAYMENT_008',
        message: response.data?.errorMessage || 'Khởi tạo thanh toán thất bại',
      };
    }

    return response.data.result as PaymentInitResponse;
  },

  /**
   * Mở cổng thanh toán (deeplink / web / QR)
   */
  async openPaymentGateway(payment: PaymentInitResponse): Promise<{ type: 'DEEPLINK' | 'WEB' | 'QR'; url?: string }> {
    // Ưu tiên 1: Deep link (MoMo / ZaloPay)
    if (payment.deeplink) {
      const canOpen = await Linking.canOpenURL(payment.deeplink);
      if (canOpen) {
        await Linking.openURL(payment.deeplink);
        return { type: 'DEEPLINK', url: payment.deeplink };
      }
    }

    // Ưu tiên 2: Web URL (VNPay)
    if (payment.payUrl) {
      await WebBrowser.openBrowserAsync(payment.payUrl, {
        toolbarColor: '#6366F1',
        controlsColor: '#FFFFFF',
        readerMode: false,
      });
      return { type: 'WEB', url: payment.payUrl };
    }

    // Ưu tiên 3: QR Code URL
    if (payment.qrCodeUrl) {
      return { type: 'QR', url: payment.qrCodeUrl };
    }

    throw {
      errorCode: 'NO_PAYMENT_URL',
      message: 'Không có phương thức thanh toán khả dụng',
    };
  },

  /**
   * Lấy thông tin giao dịch theo transactionId
   */
  async getPaymentStatus(transactionId: string): Promise<PaymentInitResponse | null> {
    try {
      const response = await api.get(`/api/payments/txn/${transactionId}`);
      if (response.data?.code === 200) {
        return response.data.result as PaymentInitResponse;
      }
      return null;
    } catch {
      return null;
    }
  },

  /**
   * Lấy thông tin thanh toán theo bookingId
   */
  async getPaymentByBooking(bookingId: string): Promise<PaymentInitResponse | null> {
    try {
      const response = await api.get(`/api/payments/booking/${bookingId}`);
      if (response.data?.code === 200) {
        return response.data.result as PaymentInitResponse;
      }
      return null;
    } catch {
      return null;
    }
  },

  /**
   * Poll trạng thái thanh toán (fallback khi không có callback)
   */
  async pollPaymentStatus(
    transactionId: string,
    onStatusChange?: (status: PaymentStatus, payment: PaymentInitResponse) => void,
    maxAttempts = 10,
    intervalMs = 3000
  ): Promise<{ success: boolean; payment?: PaymentInitResponse; error?: string }> {
    for (let i = 0; i < maxAttempts; i++) {
      await new Promise(resolve => setTimeout(resolve, intervalMs));

      const payment = await this.getPaymentStatus(transactionId);
      if (!payment) continue;

      if (onStatusChange) {
        onStatusChange(payment.status as PaymentStatus, payment);
      }

      if (payment.status === 'SUCCESS') {
        return { success: true, payment };
      }
      if (payment.status === 'FAILED_FINAL') {
        return { success: false, payment, error: 'Thanh toán thất bại' };
      }
    }

    return { success: false, error: 'Hết thời gian chờ kết quả thanh toán' };
  },

  /**
   * Lấy danh sách phương thức thanh toán hỗ trợ
   */
  getSupportedMethods(): { key: PaymentMethod; label: string; color: string }[] {
    return [
      { key: 'CASH', label: 'Tiền mặt', color: '#10B981' },
      { key: 'MOMO', label: 'MoMo', color: '#A50064' },
      { key: 'ZALOPAY', label: 'ZaloPay', color: '#0068FF' },
      { key: 'VNPAY', label: 'VNPay', color: '#AA2B52' },
    ];
  },
};
