import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Route, Clock, Info } from 'lucide-react-native';

interface RouteInfoBarProps {
  distanceKm: number;
  durationMin: number;
  estimateError: string | null;
}

export default function RouteInfoBar({ distanceKm, durationMin, estimateError }: RouteInfoBarProps) {
  if (distanceKm <= 0 && durationMin <= 0) return null;

  return (
    <View style={styles.routeInfoBar}>
      <View style={styles.routeInfoItem}>
        <Route size={14} color="#6366F1" />
        <Text style={styles.routeInfoText}>{distanceKm.toFixed(1)} km</Text>
      </View>
      <View style={styles.routeInfoDivider} />
      <View style={styles.routeInfoItem}>
        <Clock size={14} color="#6366F1" />
        <Text style={styles.routeInfoText}>~{durationMin} phút</Text>
      </View>
      {estimateError && (
        <>
          <View style={styles.routeInfoDivider} />
          <View style={styles.routeInfoItem}>
            <Info size={14} color="#F59E0B" />
            <Text style={[styles.routeInfoText, { color: '#F59E0B' }]}>Giá fallback</Text>
          </View>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  routeInfoBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    marginHorizontal: 16,
    marginBottom: 12,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 2,
  },
  routeInfoItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  routeInfoText: { fontSize: 13, fontWeight: '600', color: '#1F2937' },
  routeInfoDivider: { width: 1, height: 14, backgroundColor: '#E5E7EB', marginHorizontal: 12 },
});
