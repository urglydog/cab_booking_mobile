import React, { useState } from 'react';
import { StyleSheet, View, Text, TextInput, TouchableOpacity, ActivityIndicator, Alert, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import api, { GATEWAY_URL } from '@/services/api';
import { Colors } from '@/constants/Colors';

export default function RegisterScreen() {
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [role, setRole] = useState<'USER' | 'DRIVER'>('USER');
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleRegister = async () => {
    if (!fullName || !email || !password || !phoneNumber) {
      Alert.alert('Lỗi', 'Vui lòng nhập đầy đủ thông tin');
      return;
    }

    setLoading(true);
    try {
      const response = await api.post('/api/auth/register', {
        fullName,
        email,
        password,
        phoneNumber,
        role: role,
        avatarUrl: 'https://example.com/avatar/default.png',
        deviceId: 'mobile-app',
        platform: 'ANDROID',
      }, { baseURL: GATEWAY_URL }); // Go via API Gateway

      if (response.status === 200 || response.status === 201) {
        Alert.alert('Thành công', 'Đăng ký tài khoản thành công! Vui lòng đăng nhập.', [
          { text: 'OK', onPress: () => router.push('/login') }
        ]);
      }
    } catch (error: any) {
      console.error(error);
      const message = error.response?.data?.message || 'Đăng ký thất bại. Email có thể đã tồn tại.';
      Alert.alert('Lỗi', message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.content}>
          <Text style={styles.logo}>CAB</Text>
          <Text style={styles.title}>Create Account</Text>
          <Text style={styles.subtitle}>Join us today and experience the best service.</Text>

          <View style={styles.inputContainer}>
            <Text style={styles.label}>Full Name</Text>
            <TextInput
              style={styles.input}
              placeholder="Nguyen Van A"
              value={fullName}
              onChangeText={setFullName}
            />
          </View>

          <View style={styles.inputContainer}>
            <Text style={styles.label}>Email Address</Text>
            <TextInput
              style={styles.input}
              placeholder="example@gmail.com"
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              keyboardType="email-address"
            />
          </View>

          <View style={styles.inputContainer}>
            <Text style={styles.label}>Phone Number</Text>
            <TextInput
              style={styles.input}
              placeholder="090 1234 567"
              value={phoneNumber}
              onChangeText={setPhoneNumber}
              keyboardType="phone-pad"
            />
          </View>

          <View style={styles.inputContainer}>
            <Text style={styles.label}>Password</Text>
            <TextInput
              style={styles.input}
              placeholder="Minimum 6 characters"
              value={password}
              onChangeText={setPassword}
              secureTextEntry
            />
          </View>

          <View style={styles.inputContainer}>
            <Text style={styles.label}>Loại tài khoản</Text>
            <View style={styles.roleSelectorRow}>
              <TouchableOpacity
                style={[styles.roleSelectButton, role === 'USER' && styles.roleActiveButton]}
                onPress={() => setRole('USER')}
              >
                <Text style={[styles.roleSelectText, role === 'USER' && styles.roleActiveText]}>Khách hàng</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.roleSelectButton, role === 'DRIVER' && styles.roleActiveButton]}
                onPress={() => setRole('DRIVER')}
              >
                <Text style={[styles.roleSelectText, role === 'DRIVER' && styles.roleActiveText]}>Tài xế đối tác</Text>
              </TouchableOpacity>
            </View>
          </View>

          <TouchableOpacity 
            style={[styles.button, loading && styles.buttonDisabled]} 
            onPress={handleRegister}
            disabled={loading}
          >
            {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Sign Up</Text>}
          </TouchableOpacity>

          <TouchableOpacity style={styles.loginLink} onPress={() => router.push('/login')}>
            <Text style={styles.loginText}>Already have an account? <Text style={styles.loginHighlight}>Login here</Text></Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  scrollContent: {
    flexGrow: 1,
  },
  content: {
    flex: 1,
    paddingHorizontal: 30,
    paddingVertical: 40,
  },
  logo: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#6366F1',
    marginBottom: 20,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 10,
  },
  subtitle: {
    fontSize: 14,
    color: '#666',
    marginBottom: 30,
  },
  inputContainer: {
    marginBottom: 15,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
    marginBottom: 6,
  },
  input: {
    height: 50,
    borderWidth: 1,
    borderColor: '#E2E2E2',
    borderRadius: 12,
    paddingHorizontal: 15,
    fontSize: 16,
    backgroundColor: '#F9F9F9',
  },
  button: {
    height: 55,
    backgroundColor: '#6366F1',
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 25,
  },
  buttonDisabled: {
    opacity: 0.7,
  },
  buttonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
  },
  loginLink: {
    marginTop: 25,
    alignItems: 'center',
  },
  loginText: {
    color: '#666',
    fontSize: 14,
  },
  loginHighlight: {
    color: '#6366F1',
    fontWeight: 'bold',
  },
  roleSelectorRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 4,
  },
  roleSelectButton: {
    flex: 1,
    height: 48,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: '#E2E2E2',
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F9F9F9',
  },
  roleActiveButton: {
    borderColor: '#6366F1',
    backgroundColor: '#EEF2F6',
  },
  roleSelectText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#666',
  },
  roleActiveText: {
    color: '#6366F1',
    fontWeight: '800',
  }
});
