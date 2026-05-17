import React, { useState } from 'react';
import { StyleSheet, View, Text, TextInput, TouchableOpacity, ActivityIndicator, Alert } from 'react-native';
import { Star, ChevronLeft } from 'lucide-react-native';
import { Colors } from '@/constants/Colors';
import api from '@/services/api';
import { useRouter, useLocalSearchParams } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';

export default function ReviewScreen() {
  const router = useRouter();
  const { rideId, driverId } = useLocalSearchParams();
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async () => {
    if (loading) return;
    setLoading(true);

    try {
      const userId = await AsyncStorage.getItem('user_id');
      
      const reviewData = {
        rideId: rideId,
        userId: userId,
        driverId: driverId || 'SYSTEM_DRIVER',
        rating: rating,
        comment: comment,
      };

      // Call review service via Gateway
      await api.post('/api/reviews', reviewData);
      
      Alert.alert('Thành công', 'Cảm ơn bạn đã để lại đánh giá!');
      router.replace('/(tabs)');
    } catch (error) {
      console.error('Failed to submit review:', error);
      Alert.alert('Lỗi', 'Không thể gửi đánh giá lúc này. Vui lòng thử lại sau.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <ChevronLeft size={24} color="#333" />
        </TouchableOpacity>
        <Text style={styles.title}>Đánh giá chuyến đi</Text>
        <View style={{ width: 24 }} />
      </View>

      <View style={styles.content}>
        <Text style={styles.subtitle}>Bạn thấy chuyến đi thế nào?</Text>
        <Text style={styles.description}>Hãy đánh giá để giúp tài xế cải thiện dịch vụ nhé!</Text>

        <View style={styles.starsContainer}>
          {[1, 2, 3, 4, 5].map((s) => (
            <TouchableOpacity key={s} onPress={() => setRating(s)}>
              <Star 
                size={40} 
                color={s <= rating ? '#FFD700' : '#DDD'} 
                fill={s <= rating ? '#FFD700' : 'transparent'} 
              />
            </TouchableOpacity>
          ))}
        </View>

        <TextInput
          style={styles.input}
          placeholder="Viết nhận xét của bạn tại đây..."
          multiline
          numberOfLines={4}
          value={comment}
          onChangeText={setComment}
        />

        <TouchableOpacity 
          style={[styles.button, loading && styles.buttonDisabled]} 
          onPress={handleSubmit}
          disabled={loading}
        >
          {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Gửi đánh giá</Text>}
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 50,
    paddingBottom: 20,
  },
  title: {
    fontSize: 18,
    fontWeight: 'bold',
  },
  content: {
    padding: 20,
    alignItems: 'center',
  },
  subtitle: {
    fontSize: 22,
    fontWeight: 'bold',
    marginTop: 20,
  },
  description: {
    fontSize: 14,
    color: '#666',
    marginTop: 10,
    textAlign: 'center',
  },
  starsContainer: {
    flexDirection: 'row',
    gap: 10,
    marginVertical: 30,
  },
  input: {
    width: '100%',
    height: 120,
    borderColor: '#EEE',
    borderWidth: 1,
    borderRadius: 12,
    padding: 15,
    fontSize: 16,
    textAlignVertical: 'top',
    backgroundColor: '#FAFAFA',
  },
  button: {
    width: '100%',
    backgroundColor: Colors.light.primary,
    paddingVertical: 15,
    borderRadius: 30,
    marginTop: 30,
    alignItems: 'center',
  },
  buttonDisabled: {
    backgroundColor: '#999',
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
});
