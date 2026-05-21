import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import MapView, { Marker, Polyline } from 'react-native-maps';
import { Zap, Clock } from 'lucide-react-native';
import { getSurgeColor, getSurgeLabel } from '@/services/pricingService';

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

// Generates a beautiful, realistic S-curve route between start and end using Perpendicular Vector & Sine wave
const generateRouteCoords = (
  start: { latitude: number; longitude: number },
  end: { latitude: number; longitude: number }
) => {
  const coords = [start];
  
  const dLat = end.latitude - start.latitude;
  const dLng = end.longitude - start.longitude;

  // Actual perpendicular normal vector of the start-end segment
  const perpLat = -dLng;
  const perpLng = dLat;

  const numSteps = 8;
  for (let i = 1; i < numSteps; i++) {
    const ratio = i / numSteps;
    // Base linear point
    const lat = start.latitude + dLat * ratio;
    const lng = start.longitude + dLng * ratio;

    // Multi-frequency wave using sine to create an elegant curved S-route (sin curve)
    // ratio * PI * 2 creates a full wave cycle
    const wave = Math.sin(ratio * Math.PI * 2);
    
    // Perpendicular offset scaled to 25% of the distance to give a beautiful natural curve
    const offsetScale = 0.24;
    const latOffset = perpLat * wave * offsetScale;
    const lngOffset = perpLng * wave * offsetScale;

    coords.push({
      latitude: lat + latOffset,
      longitude: lng + lngOffset,
    });
  }
  
  coords.push(end);
  return coords;
};

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
        {pickupCoords && dropoffCoords && (
          <Polyline
            coordinates={generateRouteCoords(pickupCoords, dropoffCoords)}
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
