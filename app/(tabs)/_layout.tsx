import { Tabs } from 'expo-router';
import React from 'react';
import { Home, History, MessageSquare, User } from 'lucide-react-native';
import { Colors } from '@/constants/Colors';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useSocket } from '@/hooks/useSocket';

export default function TabLayout() {
  const colorScheme = useColorScheme() ?? 'light';
  const { unreadCount } = useSocket();

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: Colors[colorScheme].primary,
        tabBarInactiveTintColor: Colors[colorScheme].icon,
        headerShown: false,
        tabBarStyle: {
          borderTopWidth: 1,
          borderTopColor: Colors[colorScheme].border,
          height: 60,
          paddingBottom: 10,
        }
      }}>
      <Tabs.Screen
        name="index"
        options={{
          title: 'Trang chủ',
          tabBarIcon: ({ color }) => <Home size={24} color={color} />,
        }}
      />
      <Tabs.Screen
        name="explore"
        options={{
          title: 'Hoạt động',
          tabBarIcon: ({ color }) => <History size={24} color={color} />,
        }}
      />
      <Tabs.Screen
        name="messages"
        options={{
          title: 'Trò chuyện',
          tabBarIcon: ({ color }) => <MessageSquare size={24} color={color} />,
          tabBarBadge: 1,
          tabBarBadgeStyle: {
            backgroundColor: Colors[colorScheme].error,
            fontSize: 10,
          }
        }}
      />
      <Tabs.Screen
        name="account"
        options={{
          title: 'Tài khoản',
          tabBarIcon: ({ color }) => <User size={24} color={color} />,
        }}
      />
    </Tabs>
  );
}
