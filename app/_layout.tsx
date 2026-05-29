import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState, useRef } from 'react';
import 'react-native-reanimated';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Linking from 'expo-linking';

import { useColorScheme } from '@/hooks/use-color-scheme';

export const unstable_settings = {
  anchor: '(tabs)',
};

import { SocketProvider } from '@/hooks/useSocket';
import { PaymentProvider } from '@/hooks/usePayment';

function DeepLinkHandler() {
  const router = useRouter();
  const lastHandledUrlRef = useRef<string | null>(null);

  useEffect(() => {
    // Handle deep link when app is opened from cold start
    const getInitialURL = async () => {
      const initialURL = await Linking.getInitialURL();
      if (initialURL) {
        handleURL({ url: initialURL });
      }
    };
    getInitialURL();

    // Handle deep link when app is already open
    const subscription = Linking.addEventListener('url', handleURL);
    return () => subscription.remove();
  }, []);

  const handleURL = (event: { url: string }) => {
    const { url } = event;
    if (lastHandledUrlRef.current === url) return;
    const parsed = Linking.parse(url);
    const params = parsed.queryParams || {};
    const paymentTarget = parsed.hostname || parsed.path?.split('/')[0];

    // cabbooking://payment?status=success&transactionId=xxx&bookingId=xxx
    // cabbookingmobile://payment?status=success&transactionId=xxx
    if (parsed.scheme?.startsWith('cabbooking') && paymentTarget === 'payment') {
      lastHandledUrlRef.current = url;
      const status = params.status as string;
      const transactionId = params.transactionId as string;
      const bookingId = params.bookingId as string;

      if (status === 'success') {
        router.replace({
          pathname: '/(ride)/matching',
          params: { bookingId: bookingId || '' },
        });
      } else if (status === 'failed' || status === 'cancelled') {
        router.replace({
          pathname: '/(payment)/payment-failed',
          params: {
            transactionId,
            bookingId: bookingId || '',
            reason: (params.message || params.reason || 'Thanh toán không thành công') as string,
          },
        });
      } else {
        // Generic payment screen for polling
        router.replace({
          pathname: '/(payment)/payment',
          params: { transactionId, bookingId: bookingId || '' },
        });
      }
    }
  };

  return null;
}

export default function RootLayout() {
  const colorScheme = useColorScheme();
  const [isReady, setIsReady] = useState(false);
  const [hasToken, setHasToken] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [userRole, setUserRole] = useState<string | null>(null);
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    const checkAuth = async () => {
      try {
        const token = await AsyncStorage.getItem('access_token');
        const userIdFromStorage = await AsyncStorage.getItem('user_id');
        const roleFromStorage = await AsyncStorage.getItem('user_role');
        setUserId(userIdFromStorage);
        setHasToken(!!token);
        setUserRole(roleFromStorage);
      } catch (e) {
        setHasToken(false);
      } finally {
        setIsReady(true);
      }
    };
    checkAuth();
  }, [segments]);

  useEffect(() => {
    if (!isReady) return;
    if (hasToken && segments[0] === '(auth)') {
      router.replace('/(tabs)');
    } else if (!hasToken && segments[0] !== '(auth)') {
      router.replace('/(auth)/login');
    }
  }, [hasToken, isReady, segments]);

  if (!isReady) return null;

  const content = (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <DeepLinkHandler />
      <Stack>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="(auth)/login" options={{ headerShown: false }} />
        <Stack.Screen name="(auth)/register" options={{ headerShown: false }} />
        <Stack.Screen name="(ride)/booking" options={{ headerShown: false }} />
        <Stack.Screen name="(ride)/matching" options={{ headerShown: false }} />
        <Stack.Screen name="(ride)/detail" options={{ headerShown: false }} />
        <Stack.Screen name="(review)/review" options={{ headerShown: false }} />
        <Stack.Screen name="(payment)/payment" options={{ headerShown: false }} />
        <Stack.Screen name="(payment)/payment-success" options={{ headerShown: false }} />
        <Stack.Screen name="(payment)/payment-failed" options={{ headerShown: false }} />
        <Stack.Screen name="(notification)/modal" options={{ presentation: 'modal', title: 'Notifications' }} />
        <Stack.Screen name="(ride)/chat" options={{ headerShown: false }} />
        <Stack.Screen name="(ai)/chat" options={{ headerShown: false }} />
      </Stack>
      <StatusBar style="auto" />
    </ThemeProvider>
  );

  if (userId) {
    return (
      <SocketProvider userId={userId}>
        <PaymentProvider>
          {content}
        </PaymentProvider>
      </SocketProvider>
    );
  }

  return content;
}
