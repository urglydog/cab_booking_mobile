import React from 'react';
import { View, Text, TextInput, StyleSheet } from 'react-native';
import { MapPin } from 'lucide-react-native';

interface AddressFormProps {
  pickup: string;
  dropoff: string;
  onPickupChange: (text: string) => void;
  onDropoffChange: (text: string) => void;
  onPickupFocus: () => void;
  onDropoffFocus: () => void;
}

export default function AddressForm({
  pickup,
  dropoff,
  onPickupChange,
  onDropoffChange,
  onPickupFocus,
  onDropoffFocus,
}: AddressFormProps) {
  return (
    <View style={styles.card}>
      <View style={styles.inputGroup}>
        <View style={styles.iconColumn}>
          <View style={[styles.dot, { backgroundColor: '#00B14F' }]} />
          <View style={styles.line} />
          <MapPin size={20} color="#FF4444" />
        </View>
        <View style={styles.inputsColumn}>
          <View style={styles.inputWrapper}>
            <Text style={styles.label}>Điểm đón</Text>
            <TextInput
              style={[styles.input, styles.inputLeft]}
              placeholder="Nhập điểm đón"
              value={pickup}
              onChangeText={onPickupChange}
              onFocus={onPickupFocus}
            />
          </View>
          <View style={styles.divider} />
          <View style={styles.inputWrapper}>
            <Text style={styles.label}>Điểm đến</Text>
            <TextInput
              style={[styles.input, styles.inputLeft]}
              placeholder="Bạn muốn đến đâu?"
              value={dropoff}
              onChangeText={onDropoffChange}
              onFocus={onDropoffFocus}
            />
          </View>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    marginHorizontal: 16,
    backgroundColor: '#fff',
    borderRadius: 20,
    padding: 20,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 10,
    elevation: 5,
  },
  inputGroup: { flexDirection: 'row' },
  iconColumn: { alignItems: 'center', width: 30, paddingVertical: 10, justifyContent: 'space-between' },
  dot: { width: 10, height: 10, borderRadius: 5 },
  line: { flex: 1, width: 2, backgroundColor: '#EEE', marginVertical: 4 },
  inputsColumn: { flex: 1, marginLeft: 10 },
  inputWrapper: { paddingVertical: 5 },
  label: { fontSize: 12, color: '#999', marginBottom: 4, textTransform: 'uppercase' },
  input: { fontSize: 16, color: '#111', fontWeight: '500', paddingVertical: 4 },
  inputLeft: { textAlign: 'left', paddingRight: 8 },
  divider: { height: 1, backgroundColor: '#F2F2F2', marginVertical: 10 },
});
