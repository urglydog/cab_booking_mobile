import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { formatVND } from '@/services/pricingService';

interface FareSummaryProps {
  selectedEstimate: {
    totalFare: number;
  } | null;
  selectedPromo: {
    code: string;
    discount: number;
  } | null;
  finalFare: number;
}

export default function FareSummary({ selectedEstimate, selectedPromo, finalFare }: FareSummaryProps) {
  return (
    <View style={styles.fareSummaryCard}>
      <View style={styles.fareRow}>
        <Text style={styles.fareLabel}>Giá gốc:</Text>
        <Text style={styles.fareValue}>
          {selectedEstimate ? formatVND(selectedEstimate.totalFare) : '...'}
        </Text>
      </View>
      {selectedPromo && (
        <View style={styles.fareRow}>
          <Text style={[styles.fareLabel, { color: '#10B981' }]}>
            Khuyến mãi ({selectedPromo.code}):
          </Text>
          <Text style={[styles.fareValue, { color: '#10B981', fontWeight: '600' }]}>
            -{formatVND(selectedPromo.discount)}
          </Text>
        </View>
      )}
      <View style={styles.fareDivider} />
      <View style={styles.fareRow}>
        <Text style={[styles.fareLabel, { fontWeight: 'bold', fontSize: 15, color: '#1F2937' }]}>
          Tổng thanh toán:
        </Text>
        <Text style={[styles.fareValue, { fontWeight: 'bold', fontSize: 17, color: '#6366F1' }]}>
          {formatVND(finalFare)}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  fareSummaryCard: {
    marginHorizontal: 16,
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 16,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#F3F4F6',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 5,
    elevation: 2,
  },
  fareRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginVertical: 4 },
  fareLabel: { fontSize: 14, color: '#6B7280' },
  fareValue: { fontSize: 14, fontWeight: '500', color: '#1F2937' },
  fareDivider: { height: 1, backgroundColor: '#F3F4F6', marginVertical: 8 },
});
