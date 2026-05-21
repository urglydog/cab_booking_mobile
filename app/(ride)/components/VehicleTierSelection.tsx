import React from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator, StyleSheet } from 'react-native';
import { Bike, Car } from 'lucide-react-native';
import { VehicleTier, VEHICLE_TIER_LABELS } from '@/services/pricingService';

interface VehicleTierSelectionProps {
  selectedTier: VehicleTier;
  estimates: Record<VehicleTier, { totalFare: number; surgeMultiplier?: number } | null>;
  estimateLoading: boolean;
  onSelectTier: (tier: VehicleTier) => void;
}

const TIER_DESCRIPTIONS: Record<VehicleTier, string> = {
  BIKE: 'Di chuyển nhanh, giá tiết kiệm',
  CAR4: 'Xe 4 chỗ, thoải mái cho gia đình nhỏ',
  CAR7: 'Xe 7 chỗ, phù hợp nhóm đông người',
};

const TIER_COLORS: Record<VehicleTier, string> = {
  BIKE: '#F59E0B',
  CAR4: '#10B981',
  CAR7: '#6366F1',
};

const TIER_ICONS: Record<VehicleTier, React.ReactNode> = {
  BIKE: <Bike size={20} color="#fff" />,
  CAR4: <Car size={20} color="#fff" />,
  CAR7: <Car size={20} color="#fff" />,
};

const TIERS: VehicleTier[] = ['BIKE', 'CAR4', 'CAR7'];

export default function VehicleTierSelection({
  selectedTier,
  estimates,
  estimateLoading,
  onSelectTier,
}: VehicleTierSelectionProps) {
  return (
    <>
      <Text style={styles.sectionTitle}>Chọn hạng xe</Text>
      <View style={styles.tierList}>
        {TIERS.map(tier => {
          const est = estimates[tier];
          const price = est?.totalFare ?? null;
          const isActive = selectedTier === tier;

          return (
            <TouchableOpacity
              key={tier}
              style={[styles.tierItem, isActive && styles.activeTier]}
              onPress={() => onSelectTier(tier)}
              activeOpacity={0.7}
            >
              <View style={styles.tierLeft}>
                <View style={[styles.tierIcon, isActive && styles.activeTierIcon]}>
                  {TIER_ICONS[tier]}
                </View>
                <View style={{ flex: 1 }}>
                  <View style={styles.tierNameRow}>
                    <View style={[styles.tierDot, { backgroundColor: TIER_COLORS[tier] }]} />
                    <Text style={[styles.tierLabel, isActive && styles.activeTierLabel]}>
                      {VEHICLE_TIER_LABELS[tier]}
                    </Text>
                  </View>
                  <Text style={styles.tierDescription}>{TIER_DESCRIPTIONS[tier]}</Text>
                </View>
              </View>

              <View style={styles.tierRight}>
                {estimateLoading ? (
                  <ActivityIndicator size="small" color={isActive ? '#6366F1' : '#9CA3AF'} />
                ) : (
                  <Text style={[styles.tierPrice, isActive && styles.activeTierPrice]}>
                    {price !== null ? `~${(price / 1000).toFixed(0)}k` : '...'}
                  </Text>
                )}
              </View>
            </TouchableOpacity>
          );
        })}
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#111',
    marginBottom: 12,
    marginTop: 8,
    paddingHorizontal: 16,
  },
  tierList: { gap: 8, marginBottom: 20, paddingHorizontal: 16 },
  tierItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#fff',
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderWidth: 2,
    borderColor: 'transparent',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 5,
    elevation: 2,
  },
  activeTier: {
    borderColor: '#6366F1',
    backgroundColor: '#EEF2FF',
  },
  tierLeft: { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 },
  tierIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#F3F4F6',
    justifyContent: 'center',
    alignItems: 'center',
    flexShrink: 0,
  },
  activeTierIcon: { backgroundColor: '#6366F1' },
  tierNameRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  tierDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    flexShrink: 0,
  },
  tierLabel: { fontSize: 14, fontWeight: '600', color: '#111' },
  activeTierLabel: { color: '#4338CA' },
  tierDescription: { fontSize: 11, color: '#6B7280', marginTop: 1, paddingLeft: 14 },
  tierRight: { flexDirection: 'row', alignItems: 'center' },
  tierPrice: { fontSize: 15, fontWeight: '700', color: '#374151' },
  activeTierPrice: { color: '#6366F1' },
});
