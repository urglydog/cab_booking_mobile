import { Tabs } from 'expo-router';
import React from 'react';
import { Compass, ClipboardList, Wallet, User } from 'lucide-react-native';
import { Colors } from '@/constants/Colors';
import { useColorScheme } from '@/hooks/use-color-scheme';

export default function DriverTabLayout() {
  const colorScheme = useColorScheme() ?? 'light';
  const activeColor = '#6366F1'; // Midnight Indigo primary for Driver app

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: activeColor,
        tabBarInactiveTintColor: Colors[colorScheme].icon,
        headerShown: false,
        tabBarStyle: {
          borderTopWidth: 1,
          borderTopColor: Colors[colorScheme].border,
          height: 60,
          paddingBottom: 10,
          backgroundColor: '#FFF',
        }
      }}>
      <Tabs.Screen
        name="index"
        options={{
          title: 'Nhận cuốc',
          tabBarIcon: ({ color }) => <Compass size={24} color={color} />,
        }}
      />
      <Tabs.Screen
        name="jobs"
        options={{
          title: 'Hoạt động',
          tabBarIcon: ({ color }) => <ClipboardList size={24} color={color} />,
        }}
      />
      <Tabs.Screen
        name="earnings"
        options={{
          title: 'Thu nhập',
          tabBarIcon: ({ color }) => <Wallet size={24} color={color} />,
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
