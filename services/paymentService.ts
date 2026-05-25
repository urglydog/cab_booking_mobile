import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import api from './api';

WebBrowser.maybeCompleteAuthSession();

export type PaymentMethod = 'MOMO' | 'ZALOPAY' | 'VNPAY' | 'SEPAY' | 'CASH';

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

export const MOBILE_PAYMENT_RETURN_URL = Linking.createURL('payment', {
  scheme: 'cabbookingmobile',
});

export function getPaymentErrorMessage(errorCode: string, fallback?: string): string {
  return PAYMENT_ERROR_MESSAGES[errorCode] || fallback || 'Đã xảy ra lỗi. Vui lòng thử lại.';
}

export function canRetryPayment(status: PaymentStatus): boolean {
  return ['PENDING', 'FAILED', 'RETRY', 'INIT'].includes(status);
}

export function shouldRetryError(errorCode: string): boolean {
  return ['PAYMENT_002', 'PAYMENT_003', 'NETWORK_ERROR'].includes(errorCode);
}

/**
 * Parse kết quả thanh toán từ URL callback.
 *
 * Hỗ trợ 2 loại URL:
 * 1. VNPay return URL: https://scratch-heaving.../api/v1/payments/vnpay/return?vnp_ResponseCode=00&...
 *    → Phân tích vnp_ResponseCode: "00" = thành công, khác = thất bại
 * 2. Custom deep link: cabbookingmobile://payment?status=success&...
 *    → Phân tích query params trực tiếp
 *
 * Sau khi user hoàn tất thanh toán VNPay trên browser:
 * - Backend nhận returnUrl → processCallback() → redirect đến cabbookingmobile://
 * - App được mở lại qua deep link → parseCallbackUrl() đọc kết quả
 */
export function parsePaymentCallbackUrl(url?: string): {
  status?: string;
  transactionId?: string;
  bookingId?: string;
  reason?: string;
} | null {
  if (!url) return null;

  // Loại 1: VNPay return URL — parse query params trực tiếp
  // Backend redirect đến: https://scratch-heaving.../api/v1/payments/vnpay/return?vnp_ResponseCode=00&...
  // (Trước khi redirect sang cabbookingmobile://)
  if (url.includes('/vnpay/return')) {
    try {
      const urlObj = new URL(url);
      const responseCode = urlObj.searchParams.get('vnp_ResponseCode');
      // VNPay responseCode "00" = thành công, "07" = user cancel, "09" = invalid card...
      const success = responseCode === '00';
      return {
        status: success ? 'success' : 'failed',
        reason: success ? undefined : `VNPay response: ${responseCode}`,
      };
    } catch {
      // fallback
    }
  }

  // Loại 2: Custom URL scheme cabbookingmobile://payment?status=success&...
  const parsed = Linking.parse(url);
  const paymentTarget = parsed.hostname || parsed.path?.split('/')[0];
  if (!parsed.scheme?.startsWith('cabbooking') || paymentTarget !== 'payment') {
    return null;
  }

  const params = parsed.queryParams || {};
  return {
    status: params.status as string | undefined,
    transactionId: params.transactionId as string | undefined,
    bookingId: params.bookingId as string | undefined,
    reason: (params.message || params.reason) as string | undefined,
  };
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

    const response = await api.post('/api/v1/payments/charge', {
      bookingId,
      customerId,
      amount,
      paymentMethod,
      currency: 'VND',
      description: `Thanh toan chuyen xe ${bookingId}`,
      idempotencyKey,
    });

    console.log('[PaymentService] initPayment response:', JSON.stringify(response.data, null, 2));

    if (response.data?.code !== 200) {
      console.error('[PaymentService] initPayment error:', JSON.stringify(response.data, null, 2));
      throw {
        errorCode: response.data?.errorCode || 'PAYMENT_008',
        message: response.data?.errorMessage || 'Khởi tạo thanh toán thất bại',
      };
    }

    return response.data.result as PaymentInitResponse;
  },

  /**
   * Mở cổng thanh toán (deeplink / web / QR)
   *
   * VNPay: Dùng openAuthSessionAsync vì:
   * - Chờ redirect xảy ra trước khi resolve
   * - Khi resolve (user hoàn tất thanh toán + redirect), gọi dismissBrowser()
   * - Trên standalone app: dismissBrowser() đóng Chrome Custom Tab
   * - Trên Expo Go: vẫn nhận callbackUrl để xử lý kết quả
   *
   * MoMo/ZaloPay: Ưu tiên dùng deeplink (deeplink/deeplinkWallet) để mở app ví trực tiếp.
   * Nếu không mở được → dùng payUrl với openBrowserAsync trên iOS.
   */
  async openPaymentGateway(payment: PaymentInitResponse): Promise<{ type: 'DEEPLINK' | 'WEB' | 'QR'; url?: string; callbackUrl?: string }> {
    console.log('[PaymentService] openPaymentGateway payment data:', {
      hasDeeplink: !!payment.deeplink,
      hasDeeplinkWallet: !!payment.deeplinkWallet,
      hasPayUrl: !!payment.payUrl,
      hasQrCodeUrl: !!payment.qrCodeUrl,
      paymentMethod: payment.paymentMethod,
      deeplink: payment.deeplink,
      deeplinkWallet: payment.deeplinkWallet,
    });
    const deepLinks = [payment.deeplink, payment.deeplinkWallet].filter(Boolean);
    for (const deepLink of deepLinks) {
      if (deepLink) {
        console.log('[PaymentService] Trying deep link:', deepLink);
        const canOpen = await Linking.canOpenURL(deepLink);
        if (canOpen) {
          console.log('[PaymentService] Opening app via deeplink:', deepLink);
          await Linking.openURL(deepLink);
          return { type: 'DEEPLINK', url: deepLink };
        }
        console.warn('[PaymentService] Cannot open deeplink (may need app installed or rebuild):', deepLink);
      }
    }

    // Ưu tiên 2: Web URL (VNPay / trình duyệt)
    if (payment.payUrl) {
      try {
        // Trên iOS với ZaloPay/MoMo: dùng openBrowserAsync (SFSafariViewController)
        // để tránh ASWebAuthenticationSession sandbox chặn redirect sang app ví
        const isAppToAppWallet = payment.paymentMethod === 'ZALOPAY' || payment.paymentMethod === 'MOMO';

        if (Platform.OS === 'ios' && isAppToAppWallet) {
          await WebBrowser.openBrowserAsync(payment.payUrl, {
            toolbarColor: '#6366F1',
            controlsColor: '#FFFFFF',
            showInRecents: true,
          });
          return { type: 'WEB', url: payment.payUrl, callbackUrl: undefined };
        }

        // VNPay hoặc Android: dùng openAuthSessionAsync để nhận redirect callback
        const result = await WebBrowser.openAuthSessionAsync(
          payment.payUrl,
          MOBILE_PAYMENT_RETURN_URL,
          {
            toolbarColor: '#6366F1',
            controlsColor: '#FFFFFF',
            readerMode: false,
            showInRecents: true,
          }
        );

        console.log('[PaymentService] openAuthSessionAsync result:', result);

        // result.type: 'success' = redirect captured (user completed and was redirected back)
        // result.type: 'cancel' = user closed browser without completing
        // result.type: 'dismiss' = browser was dismissed programmatically
        const callbackUrl = result.type === 'success' ? result.url : undefined;

        // Thử đóng browser sau khi nhận redirect
        // (Trên standalone app: này sẽ đóng Chrome Custom Tab)
        // (Trên Expo Go: có thể không hoạt động, user cần đóng thủ công)
        if (result.type === 'success' || result.type === 'dismiss') {
          try {
            WebBrowser.dismissBrowser();
            console.log('[PaymentService] Browser dismissed after redirect');
          } catch (err) {
            console.warn('[PaymentService] dismissBrowser failed (may not be supported on Expo Go):', err);
          }
        }

        return { type: 'WEB', url: payment.payUrl, callbackUrl };
      } catch (err) {
        console.error('[PaymentService] openAuthSessionAsync failed:', err);
        // Fallback: thử openBrowserAsync nếu openAuthSessionAsync thất bại
        try {
          await WebBrowser.openBrowserAsync(payment.payUrl, {
            toolbarColor: '#6366F1',
            controlsColor: '#FFFFFF',
            showInRecents: true,
          });
          console.log('[PaymentService] openBrowserAsync fallback completed');
          return { type: 'WEB', url: payment.payUrl, callbackUrl: undefined };
        } catch (fallbackErr) {
          console.error('[PaymentService] openBrowserAsync fallback also failed:', fallbackErr);
          throw {
            errorCode: 'NO_PAYMENT_URL',
            message: 'Không thể mở cổng thanh toán',
          };
        }
      }
    }

    // Ưu tiên 3: QR Code URL — hiển thị QR cho user quét
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
   * Được dùng bởi polling trong payment.tsx
   * Backend: GET /api/v1/payments/txn/{transactionId}
   */
  async getPaymentStatus(transactionId: string): Promise<PaymentInitResponse | null> {
    try {
      const response = await api.get(`/api/v1/payments/txn/${transactionId}`);
      const data = response.data?.result ?? response.data;
      if (data && data.transactionId) {
        return data as PaymentInitResponse;
      }
      return null;
    } catch (err: any) {
      const status = err?.response?.status;
      if (status === 404) return null;
      console.warn(`[PaymentService] getPaymentStatus(${transactionId}) error:`, err?.response?.data);
      return null;
    }
  },

  /**
   * Lấy thông tin thanh toán theo bookingId
   * Được dùng bởi waitForPaymentByBooking trong booking.tsx
   * Backend: GET /api/v1/payments/booking/{bookingId}
   */
  async getPaymentByBooking(bookingId: string): Promise<PaymentInitResponse | null> {
    try {
      const response = await api.get(`/api/v1/payments/booking/${bookingId}`);
      console.log(`[PaymentService] getPaymentByBooking(${bookingId}):`, JSON.stringify(response.data, null, 2));
      const data = response.data?.result ?? response.data;
      if (data && data.transactionId) {
        return data as PaymentInitResponse;
      }
      console.log(`[PaymentService] getPaymentByBooking(${bookingId}): no transactionId in response`);
      return null;
    } catch (err: any) {
      const status = err?.response?.status;
      const errorData = err?.response?.data;
      console.warn(`[PaymentService] getPaymentByBooking(${bookingId}) failed:`, {
        status,
        errorCode: errorData?.errorCode,
        errorMessage: errorData?.errorMessage,
      });
      // 404 = chưa có transaction (bình thường trong lúc chờ Kafka), vẫn trả null để caller tiếp tục polling
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
      { key: 'SEPAY', label: 'SePay (VietQR)', color: '#FF5E00' },
    ];
  },
};
