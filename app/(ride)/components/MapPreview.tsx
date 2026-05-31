import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import MapView, { Marker, Polyline } from 'react-native-maps';
import { Zap, Clock } from 'lucide-react-native';
import { getSurgeColor, getSurgeLabel } from '@/services/pricingService';
import { fetchRoute, generateRouteCoords } from '@/services/mapService';

interface MapPreviewProps {
  pickupCoords: { latitude: number; longitude: number } | null;
  dropoffCoords: { latitude: number; longitude: number } | null;
  pickup: string;
  dropoff: string;
  surgeMultiplier: number;
  countdown: number | null;
  estimateExpired: boolean;
  distanceKm: number;
  durationMin: number;
}

export default function MapPreview({
  pickupCoords,
  dropoffCoords,
  pickup,
  dropoff,
  surgeMultiplier,
  countdown,
  estimateExpired,
  distanceKm,
  durationMin,
}: MapPreviewProps) {
  const isSurgeActive = surgeMultiplier > 1.0;
  const fallbackPickup = pickupCoords ?? { latitude: 10.7769, longitude: 106.7009 };

  const [routeCoordinates, setRouteCoordinates] = useState<{ latitude: number; longitude: number }[]>([]);

  useEffect(() => {
    if (!pickupCoords || !dropoffCoords) {
      setRouteCoordinates([]);
      return;
    }

    // Set initial fallback coordinates using generateRouteCoords
    const fallbackCoords = generateRouteCoords(pickupCoords, dropoffCoords);
    setRouteCoordinates(fallbackCoords);

    let isMounted = true;
    fetchRoute(pickupCoords, dropoffCoords).then((coords) => {
      if (isMounted && coords && coords.length > 0) {
        setRouteCoordinates(coords);
      }
    });

    return () => {
      isMounted = false;
    };
  }, [pickupCoords, dropoffCoords]);

  const formatCountdown = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return m > 0 ? `${m}:${sec.toString().padStart(2, '0')}` : `${sec}s`;
  };

  return (
    <View style={styles.mapContainer}>
      <MapView
        style={styles.map}
        region={{
          latitude: dropoffCoords
            ? (fallbackPickup.latitude + dropoffCoords.latitude) / 2
            : fallbackPickup.latitude,
          longitude: dropoffCoords
            ? (fallbackPickup.longitude + dropoffCoords.longitude) / 2
            : fallbackPickup.longitude,
          latitudeDelta: dropoffCoords
            ? Math.abs(fallbackPickup.latitude - dropoffCoords.latitude) * 2 + 0.02
            : 0.04,
          longitudeDelta: dropoffCoords
            ? Math.abs(fallbackPickup.longitude - dropoffCoords.longitude) * 2 + 0.02
            : 0.04,
        }}
      >
        {pickupCoords && (
          <Marker coordinate={pickupCoords} title="Điểm đón" description={pickup} pinColor="#10B981" />
        )}
        {dropoffCoords && (
          <Marker coordinate={dropoffCoords} title="Điểm đến" description={dropoff} pinColor="#EF4444" />
        )}
        {pickupCoords && dropoffCoords && routeCoordinates.length > 0 && (
          <Polyline
            coordinates={routeCoordinates}
            strokeColor="#4F46E5"
            strokeWidth={4.5}
            lineDashPattern={[0]}
          />
        )}
      </MapView>

      {dropoffCoords && (
        <View style={[styles.surgeBadge, { backgroundColor: getSurgeColor(surgeMultiplier) + 'F0' }]}>
          <Zap size={12} color="#fff" />
          <Text style={styles.surgeBadgeText}>
            {isSurgeActive ? `×${surgeMultiplier.toFixed(1)} ${getSurgeLabel(surgeMultiplier)}` : 'Bình thường'}
          </Text>
        </View>
      )}

      {countdown !== null && dropoffCoords && (
        <View style={styles.countdownBadge}>
          <Clock size={11} color={countdown < 60 ? '#EF4444' : '#6366F1'} />
          <Text style={[styles.countdownText, countdown < 60 && { color: '#EF4444' }]}>
            {estimateExpired ? 'Hết hạn' : `Cập nhật: ${formatCountdown(countdown)}`}
          </Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  mapContainer: { height: 200, marginBottom: 0 },
  map: { flex: 1 },
  surgeBadge: {
    position: 'absolute',
    top: 12,
    left: 12,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 16,
    gap: 4,
  },
  surgeBadgeText: { color: '#fff', fontSize: 12, fontWeight: '700' },
  countdownBadge: {
    position: 'absolute',
    top: 12,
    right: 12,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 16,
    gap: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 3,
    elevation: 2,
  },
  countdownText: { fontSize: 11, fontWeight: '600', color: '#6366F1' },
});
