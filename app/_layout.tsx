import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import 'react-native-reanimated';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { useColorScheme } from '@/hooks/use-color-scheme';

export const unstable_settings = {
  anchor: '(tabs)',
};

import { SocketProvider } from '@/hooks/useSocket';

export default function RootLayout() {
  const colorScheme = useColorScheme();
  const [isReady, setIsReady] = useState(false);
  const [hasToken, setHasToken] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    const checkAuth = async () => {
      try {
        const token = await AsyncStorage.getItem('access_token');
        const userIdFromStorage = await AsyncStorage.getItem('user_id');
        setUserId(userIdFromStorage);
        setHasToken(!!token);
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

    const inTabsGroup = segments[0] === '(tabs)';

    // Removed mandatory redirect for tabs to allow guest access
    if (hasToken && segments[0] === '(auth)') {
      router.replace('/(tabs)');
    }
  }, [hasToken, isReady, segments]);

  if (!isReady) return null;

  const content = (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <Stack>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="(auth)/login" options={{ headerShown: false }} />
        <Stack.Screen name="(auth)/register" options={{ headerShown: true, title: 'Register' }} />
        <Stack.Screen name="(ride)/booking" options={{ headerShown: false }} />
        <Stack.Screen name="(ride)/matching" options={{ headerShown: false }} />
        <Stack.Screen name="(review)/review" options={{ headerShown: false }} />
        <Stack.Screen name="(notification)/modal" options={{ presentation: 'modal', title: 'Notifications' }} />
      </Stack>
      <StatusBar style="auto" />
    </ThemeProvider>
  );

  if (userId) {
    return (
      <SocketProvider userId={userId}>
        {content}
      </SocketProvider>
    );
  }

  return content;
}
