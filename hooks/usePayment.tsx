import React, { createContext, useContext, useState, useCallback, useRef } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  PaymentInitResponse,
  PaymentStatus,
  PaymentMethod,
  PaymentService,
  canRetryPayment,
  getPaymentErrorMessage,
} from '@/services/paymentService';

interface PaymentContextType {
  currentPayment: PaymentInitResponse | null;
  isLoading: boolean;
  error: string | null;

  initPayment: (params: {
    bookingId: string;
    amount: number;
    paymentMethod: PaymentMethod;
  }) => Promise<PaymentInitResponse>;

  checkPaymentStatus: (transactionId: string) => Promise<PaymentInitResponse | null>;

  startPolling: (
    transactionId: string,
    onStatusChange: (status: PaymentStatus, payment: PaymentInitResponse) => void
  ) => void;

  stopPolling: () => void;

  clearError: () => void;
  resetPayment: () => void;
}

const PaymentContext = createContext<PaymentContextType | null>(null);

export const usePayment = () => {
  const ctx = useContext(PaymentContext);
  if (!ctx) throw new Error('usePayment must be used within PaymentProvider');
  return ctx;
};

export const PaymentProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [currentPayment, setCurrentPayment] = useState<PaymentInitResponse | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const pollingTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pollingAttemptsRef = useRef(0);
  const maxPollingAttempts = 20; // 20 * 3s = 60s max

  const stopPolling = useCallback(() => {
    if (pollingTimerRef.current) {
      clearInterval(pollingTimerRef.current);
      pollingTimerRef.current = null;
    }
    pollingAttemptsRef.current = 0;
  }, []);

  const startPolling = useCallback(
    (
      transactionId: string,
      onStatusChange: (status: PaymentStatus, payment: PaymentInitResponse) => void
    ) => {
      stopPolling();
      pollingAttemptsRef.current = 0;

      pollingTimerRef.current = setInterval(async () => {
        pollingAttemptsRef.current += 1;

        if (pollingAttemptsRef.current > maxPollingAttempts) {
          stopPolling();
          onStatusChange('FAILED', currentPayment!);
          return;
        }

        const payment = await PaymentService.getPaymentStatus(transactionId);
        if (!payment) return;

        setCurrentPayment(payment);
        onStatusChange(payment.status as PaymentStatus, payment);

        if (payment.status === 'SUCCESS' || payment.status === 'FAILED_FINAL') {
          stopPolling();
        }
      }, 3000);
    },
    [stopPolling, currentPayment]
  );

  const initPayment = useCallback(
    async ({
      bookingId,
      amount,
      paymentMethod,
    }: {
      bookingId: string;
      amount: number;
      paymentMethod: PaymentMethod;
    }): Promise<PaymentInitResponse> => {
      stopPolling();
      setIsLoading(true);
      setError(null);

      try {
        // If CASH, no need to call payment API
        if (paymentMethod === 'CASH') {
          const cashPayment: PaymentInitResponse = {
            transactionId: `CASH-${bookingId}-${Date.now()}`,
            bookingId,
            customerId: (await AsyncStorage.getItem('user_id')) || '',
            driverId: '',
            amount,
            currency: 'VND',
            paymentMethod: 'CASH',
            status: 'SUCCESS',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          };
          setCurrentPayment(cashPayment);
          return cashPayment;
        }

        const payment = await PaymentService.initPayment({
          bookingId,
          amount,
          paymentMethod,
        });
        setCurrentPayment(payment);
        return payment;
      } catch (err: any) {
        const errorCode = err?.errorCode || 'PAYMENT_008';
        const message = getPaymentErrorMessage(errorCode, err?.message);
        setError(message);
        throw { errorCode, message };
      } finally {
        setIsLoading(false);
      }
    },
    [stopPolling]
  );

  const checkPaymentStatus = useCallback(
    async (transactionId: string): Promise<PaymentInitResponse | null> => {
      const payment = await PaymentService.getPaymentStatus(transactionId);
      if (payment) {
        setCurrentPayment(payment);
      }
      return payment;
    },
    []
  );

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  const resetPayment = useCallback(() => {
    stopPolling();
    setCurrentPayment(null);
    setError(null);
    setIsLoading(false);
  }, [stopPolling]);

  return (
    <PaymentContext.Provider
      value={{
        currentPayment,
        isLoading,
        error,
        initPayment,
        checkPaymentStatus,
        startPolling,
        stopPolling,
        clearError,
        resetPayment,
      }}
    >
      {children}
    </PaymentContext.Provider>
  );
};
