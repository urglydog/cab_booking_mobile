import React from 'react';
import { Text, TouchableOpacity, ActivityIndicator, StyleSheet } from 'react-native';
import { Navigation } from 'lucide-react-native';
import { FrontendVehicleType } from '@/services/pricingService';

interface BookButtonProps {
  vehicleType: FrontendVehicleType;
  dropoffCoords: { latitude: number; longitude: number } | null;
  loading: boolean;
  countdown: number | null;
  estimateExpired: boolean;
  onPress: () => void;
}

export default function BookButton({
  vehicleType,
  dropoffCoords,
  loading,
  countdown,
  estimateExpired,
  onPress,
}: BookButtonProps) {
  const isDisabled = !dropoffCoords || loading || (countdown !== null && estimateExpired);

  return (
    <>
      <TouchableOpacity
        style={[styles.bookButton, isDisabled && styles.disabledButton]}
        onPress={onPress}
        disabled={isDisabled}
      >
        {loading ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <>
            <Text style={styles.bookButtonText}>
              ĐẶT {vehicleType === 'CAR' ? 'XE HƠI' : 'XE MÁY'}
            </Text>
            <Navigation size={20} color="#fff" />
          </>
        )}
      </TouchableOpacity>
      {countdown !== null && estimateExpired && (
        <Text style={styles.expiredWarning}>
          ⚠️ Giá ước tính đã hết hạn. Giá sẽ được cập nhật tự động khi bạn tiếp tục.
        </Text>
      )}
    </>
  );
}

const styles = StyleSheet.create({
  bookButton: {
    marginHorizontal: 16,
    backgroundColor: '#6366F1',
    height: 58,
    borderRadius: 18,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 12,
    shadowColor: '#6366F1',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.3,
    shadowRadius: 15,
    elevation: 8,
  },
  disabledButton: { backgroundColor: '#CCC', shadowOpacity: 0, elevation: 0 },
  bookButtonText: { color: '#fff', fontSize: 18, fontWeight: 'bold' },
  expiredWarning: {
    textAlign: 'center',
    color: '#EF4444',
    fontSize: 13,
    fontWeight: '600',
    marginTop: 8,
    paddingHorizontal: 16,
  },
});
