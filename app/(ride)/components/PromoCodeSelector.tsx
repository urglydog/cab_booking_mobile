import React from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet } from 'react-native';
import { Gift } from 'lucide-react-native';

interface PromoCode {
  id: string;
  code: string;
  title: string;
  description: string;
  discount: number;
}

interface PromoCodeSelectorProps {
  promoCodes: PromoCode[];
  selectedPromo: PromoCode | null;
  onSelectPromo: (promo: PromoCode | null) => void;
}

export default function PromoCodeSelector({
  promoCodes,
  selectedPromo,
  onSelectPromo,
}: PromoCodeSelectorProps) {
  return (
    <>
      <Text style={styles.sectionTitle}>Khuyến mãi</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.promoList}>
        {promoCodes.map(promo => {
          const isSelected = selectedPromo?.id === promo.id;
          return (
            <TouchableOpacity
              key={promo.id}
              style={[styles.promoItem, isSelected && styles.activePromo]}
              onPress={() => onSelectPromo(isSelected ? null : promo)}
            >
              <View style={[styles.promoIconContainer, isSelected && styles.activePromoIcon]}>
                <Gift size={20} color={isSelected ? '#fff' : '#6366F1'} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.promoCodeText, isSelected && styles.activePromoText]}>
                  {promo.code}
                </Text>
                <Text style={styles.promoTitleText} numberOfLines={1}>{promo.title}</Text>
                <Text style={styles.promoDescText} numberOfLines={1}>{promo.description}</Text>
              </View>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
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
  promoList: { marginBottom: 20, paddingHorizontal: 16 },
  promoItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    paddingHorizontal: 15,
    paddingVertical: 12,
    borderRadius: 16,
    marginRight: 12,
    borderWidth: 2,
    borderColor: 'transparent',
    gap: 12,
    width: 210,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 5,
    elevation: 2,
  },
  activePromo: { borderColor: '#6366F1', backgroundColor: '#EEF2FF' },
  promoIconContainer: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#EEF2FF',
    justifyContent: 'center',
    alignItems: 'center',
  },
  activePromoIcon: { backgroundColor: '#6366F1' },
  promoCodeText: { fontSize: 14, fontWeight: 'bold', color: '#6366F1' },
  activePromoText: { color: '#6366F1' },
  promoTitleText: { fontSize: 12, fontWeight: '600', color: '#1F2937', marginTop: 2 },
  promoDescText: { fontSize: 10, color: '#9CA3AF', marginTop: 1 },
});
