import React from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet, Image } from 'react-native';
import { CreditCard } from 'lucide-react-native';

interface PaymentMethodSelectorProps {
  paymentMethod: string;
  onSelectPayment: (method: string) => void;
}

const PAYMENT_OPTIONS = [
  { key: 'CASH', label: 'Tiền mặt', color: '#10B981', logo: null },
  { key: 'MOMO', label: 'MoMo', color: '#A50064', logo: 'https://res.cloudinary.com/dh1o42tjk/image/upload/v1779547580/logo-momo_s2zo3e.webp' },
  { key: 'ZALOPAY', label: 'ZaloPay', color: '#0068FF', logo: 'https://res.cloudinary.com/dh1o42tjk/image/upload/v1779547673/zalopay-logo-png_seeklogo-391409_cqprbv.png' },
  { key: 'VNPAY', label: 'VNPay', color: '#AA2B52', logo: 'https://res.cloudinary.com/dh1o42tjk/image/upload/v1779547836/vnpay-logo-inkythuatso-01-13-16-29-51_qw15he.jpg' },
  { key: 'SEPAY', label: 'SePay (VietQR)', color: '#FF5E00', logo: 'https://res.cloudinary.com/dh1o42tjk/image/upload/v1779610887/OIP_oopg4w.webp' },
];

export default function PaymentMethodSelector({
  paymentMethod,
  onSelectPayment,
}: PaymentMethodSelectorProps) {
  return (
    <>
      <Text style={styles.sectionTitle}>Phương thức thanh toán</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.paymentList}>
        {PAYMENT_OPTIONS.map(m => (
          <TouchableOpacity
            key={m.key}
            style={[styles.paymentItem, paymentMethod === m.key && styles.activePayment]}
            onPress={() => onSelectPayment(m.key)}
          >
            {m.logo ? (
              <Image
                source={{ uri: m.logo }}
                style={styles.paymentLogoImage}
                resizeMode="contain"
              />
            ) : (
              <CreditCard size={24} color={paymentMethod === m.key ? '#00B14F' : '#666'} />
            )}
            <Text style={[styles.paymentLabel, paymentMethod === m.key && styles.activePaymentText]}>
              {m.label}
            </Text>
          </TouchableOpacity>
        ))}
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
  paymentList: { marginBottom: 20, paddingHorizontal: 16 },
  paymentItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    paddingHorizontal: 15,
    paddingVertical: 12,
    borderRadius: 12,
    marginRight: 12,
    borderWidth: 2,
    borderColor: 'transparent',
    gap: 10,
  },
  activePayment: { borderColor: '#6366F1', backgroundColor: '#EEF2FF' },
  paymentLabel: { fontSize: 14, fontWeight: '600', color: '#666' },
  activePaymentText: { color: '#6366F1' },
  paymentLogo: {
    width: 24,
    height: 24,
    borderRadius: 6,
    justifyContent: 'center',
    alignItems: 'center',
  },
  logoText: { color: '#fff', fontSize: 12, fontWeight: 'bold' },
  paymentLogoImage: { width: 36, height: 36, borderRadius: 8 },
});
