/**
 * useRideSocket — Phase 3: Ride GPS Socket Tracking
 *
 * Ride socket proxied through API Gateway at /ride/socket.io.
 * Completely independent from the notification socket (port 9093).
 *
 * Contract:
 *   - Auth: { token: "Bearer <accessToken>" }
 *   - Path: /ride/socket.io (rewritten by gateway to ride-service:9095/socket.io)
 *   - Join:  emit("join_ride", { rideId })
 *   - Leave: emit("leave_ride", { rideId })
 *   - Room:  ride:{rideId}
 *   - Receive: "driver.location.updated"
 */
import { useEffect, useRef, useState, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { RIDE_SOCKET_URL, RIDE_SOCKET_PATH } from '@/services/api';

// ── Types ─────────────────────────────────────────────
export interface DriverLocation {
  latitude: number;
  longitude: number;
  heading?: number;
  speed?: number;
  timestamp?: string;
  driverId?: string;
}

interface RideSocketPayload {
  eventId?: string;
  eventType?: string;
  rideId?: string;
  bookingId?: string;
  driverId?: string;
  lat: number;
  lng: number;
  heading?: number;
  speed?: number;
  timestamp?: string;
}

export interface UseRideSocketReturn {
  isConnected: boolean;
  driverLocation: DriverLocation | null;
  joinRide: () => void;
  leaveRide: () => void;
}

// ── Hook ──────────────────────────────────────────────
export function useRideSocket(bookingId?: string): UseRideSocketReturn {
  const socketRef = useRef<Socket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [driverLocation, setDriverLocation] = useState<DriverLocation | null>(null);
  const hasJoinedRef = useRef(false);
  const reconnectAttemptRef = useRef(0);
  const MAX_RECONNECT_ATTEMPTS = 5;

  // ── Join ride room ──────────────────────────────────
  const joinRide = useCallback(() => {
    const socket = socketRef.current;
    if (!socket || !socket.connected || !bookingId) return;

    if (!hasJoinedRef.current) {
      socket.emit('join_ride', { rideId: bookingId });
      hasJoinedRef.current = true;
      console.log('[RideSocket] joined ride', bookingId);
    }
  }, [bookingId]);

  // ── Leave ride room ─────────────────────────────────
  const leaveRide = useCallback(() => {
    const socket = socketRef.current;
    if (!socket || !bookingId) return;

    if (hasJoinedRef.current) {
      socket.emit('leave_ride', { rideId: bookingId });
      hasJoinedRef.current = false;
      console.log('[RideSocket] left ride', bookingId);
    }
  }, [bookingId]);

  // ── Connect / disconnect lifecycle ──────────────────
  useEffect(() => {
    // Guard: no bookingId → nothing to do
    if (!bookingId) {
      setDriverLocation(null);
      return;
    }

    let cancelled = false;

    const connectSocket = async () => {
      try {
        const token = await AsyncStorage.getItem('access_token');
        if (cancelled) return;

        if (!token) {
          console.warn('[RideSocket] No access_token found — skipping connection');
          return;
        }

        console.log('[RideSocket] URL =', RIDE_SOCKET_URL, '| bookingId:', bookingId);
        const socket = io(RIDE_SOCKET_URL, {
          path: RIDE_SOCKET_PATH,
          auth: { token: `Bearer ${token}` },
          transports: ['websocket'],
          reconnection: true,
          reconnectionAttempts: MAX_RECONNECT_ATTEMPTS,
          reconnectionDelay: 2000,
          reconnectionDelayMax: 10000,
          timeout: 10000,
        });

        socketRef.current = socket;

        // ── Connection events ─────────────────────────
        socket.on('connect', () => {
          if (cancelled) { socket.disconnect(); return; }
          console.log('[RideSocket] connected');
          setIsConnected(true);
          reconnectAttemptRef.current = 0;
          // Auto-join on connect
          if (bookingId && !hasJoinedRef.current) {
            socket.emit('join_ride', { rideId: bookingId });
            hasJoinedRef.current = true;
            console.log('[RideSocket] joined ride', bookingId);
          }
        });

        socket.on('disconnect', (reason) => {
          console.log('[RideSocket] disconnected', reason);
          setIsConnected(false);
          hasJoinedRef.current = false;
        });

        socket.on('connect_error', (err) => {
          reconnectAttemptRef.current += 1;
          console.warn('[RideSocket] connect_error:', err.message);

          // Prevent infinite reconnect loops
          if (reconnectAttemptRef.current >= MAX_RECONNECT_ATTEMPTS) {
            console.warn('[RideSocket] Max reconnect attempts reached — giving up');
            socket.disconnect();
          }
        });

        // ── Join/leave confirmation (debug) ────────────
        socket.on('joined_ride', (data: any) => {
          console.log('[RideSocket] joined_ride confirmed:', JSON.stringify(data));
        });

        socket.on('left_ride', (data: any) => {
          console.log('[RideSocket] left_ride confirmed:', JSON.stringify(data));
        });

        socket.on('socket_error', (data: any) => {
          console.warn('[RideSocket] socket_error:', JSON.stringify(data));
        });

        // ── Driver location updates ───────────────────
        socket.on('driver.location.updated', (payload: RideSocketPayload) => {
          if (cancelled) return;
          console.log('[RideSocket] location updated', payload.lat, payload.lng);
          setDriverLocation({
            latitude: payload.lat,
            longitude: payload.lng,
            heading: payload.heading,
            speed: payload.speed,
            timestamp: payload.timestamp,
            driverId: payload.driverId,
          });
        });
      } catch (err) {
        console.warn('[RideSocket] Failed to initialize:', err);
        // Graceful degradation — app continues via polling
      }
    };

    connectSocket();

    // ── Cleanup ───────────────────────────────────────
    return () => {
      cancelled = true;
      const socket = socketRef.current;
      if (socket) {
        if (hasJoinedRef.current) {
          socket.emit('leave_ride', { rideId: bookingId });
        }
        socket.removeAllListeners();
        socket.disconnect();
        socketRef.current = null;
        hasJoinedRef.current = false;
        setIsConnected(false);
      }
    };
  }, [bookingId]);

  return {
    isConnected,
    driverLocation,
    joinRide,
    leaveRide,
  };
}
