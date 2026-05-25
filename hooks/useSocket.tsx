import React, { createContext, useContext, useEffect, useState } from 'react';
import { Alert } from 'react-native';
import { io, Socket } from 'socket.io-client';
import { SOCKET_URL } from '@/services/api';
import AsyncStorage from '@react-native-async-storage/async-storage';

interface SocketContextType {
  socket: Socket | null;
  isConnected: boolean;
  unreadCount: number;
  setUnreadCount: (count: number) => void;
}

const SocketContext = createContext<SocketContextType>({
  socket: null,
  isConnected: false,
  unreadCount: 0,
  setUnreadCount: () => { }
});

export const useSocket = () => useContext(SocketContext);

export const SocketProvider: React.FC<{ children: React.ReactNode, userId: string }> = ({ children, userId }) => {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    if (!userId) return;

    let active = true;
    let newSocket: Socket | null = null;

    const initSocket = async () => {
      try {
        const token = await AsyncStorage.getItem('access_token');
        if (!active) return;

        // Establish connection passing JWT through all supported handshake authentication patterns.
        newSocket = io(SOCKET_URL, {
          query: { 
            userId,
            token: token || '', // Fallback query param for some server variants
            access_token: token || '', // Standard query parameter recognized by Spring Security BearerTokenResolver
          },
          auth: {
            token: token || '', // Standard Socket.IO v4 handshake auth object
          },
          extraHeaders: token ? {
            Authorization: `Bearer ${token}` // HTTP header authentication fallback
          } : undefined,
          transports: ['websocket'],
        });

        newSocket.on('connect', () => {
          if (active) {
            setIsConnected(true);
            console.log('🔌 Socket.IO connected with JWT handshake verification');
          }
        });

        newSocket.on('disconnect', () => {
          if (active) {
            setIsConnected(false);
          }
        });

        newSocket.on('new_notification', (data) => {
          if (active) {
            setUnreadCount(prev => prev + 1);
            Alert.alert(data.title || 'Thông báo', data.message || 'Bạn có cập nhật mới');
          }
        });

        setSocket(newSocket);
      } catch (err) {
        console.error('Failed to initialize Socket.IO client with JWT validation:', err);
      }
    };

    initSocket();

    return () => {
      active = false;
      if (newSocket) {
        newSocket.close();
      }
    };
  }, [userId]);

  return (
    <SocketContext.Provider value={{ socket, isConnected, unreadCount, setUnreadCount }}>
      {children}
    </SocketContext.Provider>
  );
};
