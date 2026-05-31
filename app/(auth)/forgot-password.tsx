import React, { useState } from 'react';
import { Alert, ActivityIndicator, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { requestForgotPasswordOtp, resetForgotPassword } from '@/features/auth/services/authApi';

export default function ForgotPasswordScreen() {
  const router = useRouter();
  const { prefillEmail } = useLocalSearchParams<{ prefillEmail?: string }>();
  const [email, setEmail] = useState(prefillEmail ?? '');
  const [otpCode, setOtpCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [otpSent, setOtpSent] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSendOtp = async () => {
    if (!email.trim()) {
      Alert.alert('Lỗi', 'Vui lòng nhập email.');
      return;
    }

    setLoading(true);
    try {
      await requestForgotPasswordOtp({ email: email.trim() });
      setOtpSent(true);
      Alert.alert('Thành công', 'OTP đã được gửi tới email của bạn.');
    } catch (error: any) {
      Alert.alert('Lỗi', error.response?.data?.message || 'Không thể gửi OTP.');
    } finally {
      setLoading(false);
    }
  };

  const handleReset = async () => {
    if (!email.trim() || !otpCode.trim() || !newPassword || !confirmPassword) {
      Alert.alert('Lỗi', 'Vui lòng nhập đầy đủ thông tin.');
      return;
    }
    if (newPassword !== confirmPassword) {
      Alert.alert('Lỗi', 'Mật khẩu nhập lại không khớp.');
      return;
    }

    setLoading(true);
    try {
      await resetForgotPassword({
        email: email.trim(),
        otpCode: otpCode.trim(),
        newPassword,
      });
      Alert.alert('Thành công', 'Đặt lại mật khẩu thành công.', [
        { text: 'OK', onPress: () => router.replace({ pathname: '/login', params: { prefillEmail: email.trim() } }) },
      ]);
    } catch (error: any) {
      Alert.alert('Lỗi', error.response?.data?.message || 'Không thể đặt lại mật khẩu.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text style={styles.logo}>CAB</Text>
        <Text style={styles.title}>Quên mật khẩu</Text>
        <Text style={styles.subtitle}>Nhập email để nhận OTP và đặt lại mật khẩu mới.</Text>

        <View style={styles.inputGroup}>
          <Text style={styles.label}>Email</Text>
          <TextInput
            style={styles.input}
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            keyboardType="email-address"
            placeholder="example@gmail.com"
          />
        </View>

        <TouchableOpacity style={[styles.primaryButton, loading && styles.buttonDisabled]} onPress={handleSendOtp} disabled={loading}>
          {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryButtonText}>Gửi OTP</Text>}
        </TouchableOpacity>

        {otpSent && (
          <>
            <View style={styles.inputGroup}>
              <Text style={styles.label}>OTP</Text>
              <TextInput
                style={styles.input}
                value={otpCode}
                onChangeText={setOtpCode}
                keyboardType="number-pad"
                placeholder="Nhập OTP 6 số"
              />
            </View>
            <View style={styles.inputGroup}>
              <Text style={styles.label}>Mật khẩu mới</Text>
              <TextInput
                style={styles.input}
                value={newPassword}
                onChangeText={setNewPassword}
                secureTextEntry
                placeholder="Mật khẩu mới"
              />
            </View>
            <View style={styles.inputGroup}>
              <Text style={styles.label}>Nhập lại mật khẩu mới</Text>
              <TextInput
                style={styles.input}
                value={confirmPassword}
                onChangeText={setConfirmPassword}
                secureTextEntry
                placeholder="Nhập lại mật khẩu mới"
              />
            </View>
            <TouchableOpacity style={[styles.secondaryButton, loading && styles.buttonDisabled]} onPress={handleReset} disabled={loading}>
              {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.secondaryButtonText}>Đặt lại mật khẩu</Text>}
            </TouchableOpacity>
          </>
        )}

        <TouchableOpacity style={styles.backLink} onPress={() => router.back()}>
          <Text style={styles.backLinkText}>Quay lại đăng nhập</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  content: { flexGrow: 1, padding: 24, justifyContent: 'center' },
  logo: { fontSize: 42, fontWeight: '900', color: '#6366F1', textAlign: 'center', marginBottom: 12 },
  title: { fontSize: 28, fontWeight: '800', color: '#111827', textAlign: 'center' },
  subtitle: { fontSize: 14, color: '#6B7280', textAlign: 'center', marginTop: 8, marginBottom: 24, lineHeight: 20 },
  inputGroup: { marginBottom: 16 },
  label: { fontSize: 13, fontWeight: '700', color: '#374151', marginBottom: 8 },
  input: { height: 52, borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 14, paddingHorizontal: 16, backgroundColor: '#F9FAFB' },
  primaryButton: { height: 52, borderRadius: 14, backgroundColor: '#6366F1', justifyContent: 'center', alignItems: 'center', marginTop: 4 },
  secondaryButton: { height: 52, borderRadius: 14, backgroundColor: '#111827', justifyContent: 'center', alignItems: 'center', marginTop: 8 },
  primaryButtonText: { color: '#fff', fontWeight: '800', fontSize: 15 },
  secondaryButtonText: { color: '#fff', fontWeight: '800', fontSize: 15 },
  buttonDisabled: { opacity: 0.7 },
  backLink: { alignItems: 'center', marginTop: 18 },
  backLinkText: { color: '#6366F1', fontWeight: '700' },
});
