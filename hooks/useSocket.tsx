import React, { createContext, useContext, useEffect, useState } from 'react';
import { Alert } from 'react-native';
import { io, Socket } from 'socket.io-client';
import { IP_ADDRESS, GATEWAY_URL } from '@/services/api';

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
    // Connect through API Gateway on port 8080
    const SOCKET_URL = `http://${IP_ADDRESS}:8080`;
    const newSocket = io(SOCKET_URL, {
      query: { userId },
      transports: ['websocket'],
    });

    newSocket.on('connect', () => {
      setIsConnected(true);
    });

    newSocket.on('new_notification', (data) => {
      setUnreadCount(prev => prev + 1);
      Alert.alert(data.title || 'Notification', data.message || 'You have a new update');
    });

    setSocket(newSocket);

    return () => {
      newSocket.close();
    };
  }, [userId]);

  return (
    <SocketContext.Provider value={{ socket, isConnected, unreadCount, setUnreadCount }}>
      {children}
    </SocketContext.Provider>
  );
};
