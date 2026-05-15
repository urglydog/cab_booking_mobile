import React, { createContext, useContext, useEffect, useState } from 'react';
import { Alert } from 'react-native';
import { io, Socket } from 'socket.io-client';
import { IP_ADDRESS } from '@/services/api';

interface SocketContextType {
  socket: Socket | null;
  isConnected: boolean;
}

const SocketContext = createContext<SocketContextType>({ socket: null, isConnected: false });

export const useSocket = () => useContext(SocketContext);

export const SocketProvider: React.FC<{ children: React.ReactNode, userId: string }> = ({ children, userId }) => {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [isConnected, setIsConnected] = useState(false);

  useEffect(() => {
    // Replace with your notification-service URL (and port 9092 as configured)
    const newSocket = io(`http://${IP_ADDRESS}:8092`, {
      query: { userId },
      transports: ['websocket'],
    });

    newSocket.on('connect', () => {
      console.log('Connected to notification socket');
      setIsConnected(true);
    });

    newSocket.on('disconnect', () => {
      console.log('Disconnected from notification socket');
      setIsConnected(false);
    });

    newSocket.on('new_notification', (data) => {
      console.log('New notification received:', data);
      Alert.alert(data.title || 'Notification', data.message || 'You have a new update');
    });

    setSocket(newSocket);

    return () => {
      newSocket.close();
    };
  }, [userId]);

  return (
    <SocketContext.Provider value={{ socket, isConnected }}>
      {children}
    </SocketContext.Provider>
  );
};
