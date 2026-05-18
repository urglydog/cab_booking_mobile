import React, { useState, useEffect } from 'react';
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
  const [existingReviewId, setExistingReviewId] = useState<string | null>(null);

  // Check if a review already exists for this ride on mount
  useEffect(() => {
    const fetchExistingReview = async () => {
      try {
        const response = await api.get(`/api/reviews/ride/${rideId}`);
        if (response.data) {
          const rev = response.data;
          setExistingReviewId(rev.id);
          setRating(rev.rating || 5);
          
          // Parse out selected tags if comment starts with "[Tag1, Tag2] Comment"
          let parsedComment = rev.comment || '';
          if (parsedComment.startsWith('[')) {
            const closingBracketIdx = parsedComment.indexOf(']');
            if (closingBracketIdx !== -1) {
              parsedComment = parsedComment.substring(closingBracketIdx + 1).trim();
            }
          }
          setComment(parsedComment);
        }
      } catch (error) {
        // No existing review found (normal behavior for first-time reviews)
        console.log('No existing review in MongoDB for this ride yet.');
      }
    };

    if (rideId) {
      fetchExistingReview();
    }
  }, [rideId]);

  const handleSubmit = async () => {
    if (loading) return;
    setLoading(true);

    try {
      const userId = (await AsyncStorage.getItem('user_id')) || 'demo-user-123';
      
      const reviewPayload = {
        rideId: rideId,
        userId: userId,
        driverId: driverId || 'driver-mock-456',
        rating: rating,
        comment: comment,
      };

      if (existingReviewId) {
        // Safe Update Flow (PUT /api/reviews/{id}) to prevent 500 errors
        await api.put(`/api/reviews/${existingReviewId}`, {
          rating: rating,
          comment: comment
        });
        Alert.alert('Thành công', 'Đã cập nhật đánh giá của bạn thành công!');
      } else {
        // Create Flow (POST /api/reviews)
        await api.post('/api/reviews', reviewPayload);
        Alert.alert('Thành công', 'Cảm ơn bạn đã gửi đánh giá!');
      }
      
      router.replace('/(tabs)/explore');
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
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <ChevronLeft size={24} color="#111827" />
        </TouchableOpacity>
        <Text style={styles.title}>
          {existingReviewId ? 'Cập nhật đánh giá' : 'Đánh giá chuyến đi'}
        </Text>
        <View style={{ width: 24 }} />
      </View>

      <View style={styles.content}>
        <Text style={styles.subtitle}>Bạn thấy chuyến đi thế nào?</Text>
        <Text style={styles.description}>
          Hãy đánh giá để giúp tài xế cải thiện dịch vụ tốt hơn nhé!
        </Text>

        <View style={styles.starsContainer}>
          {[1, 2, 3, 4, 5].map((s) => (
            <TouchableOpacity key={s} onPress={() => setRating(s)} activeOpacity={0.7}>
              <Star 
                size={42} 
                color={s <= rating ? '#FBBF24' : '#E5E7EB'} 
                fill={s <= rating ? '#FBBF24' : 'transparent'} 
                style={{ marginHorizontal: 4 }}
              />
            </TouchableOpacity>
          ))}
        </View>

        <TextInput
          style={styles.input}
          placeholder="Viết nhận xét của bạn tại đây..."
          placeholderTextColor="#9CA3AF"
          multiline
          numberOfLines={4}
          value={comment}
          onChangeText={setComment}
        />

        <TouchableOpacity 
          style={[styles.button, loading && styles.buttonDisabled]} 
          onPress={handleSubmit}
          disabled={loading}
          activeOpacity={0.8}
        >
          {loading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.buttonText}>
              {existingReviewId ? 'Lưu cập nhật đánh giá' : 'Gửi đánh giá dịch vụ'}
            </Text>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F9FAFB',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 50,
    paddingBottom: 16,
    backgroundColor: '#FFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  backButton: {
    padding: 4,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    color: '#111827',
  },
  content: {
    padding: 24,
    alignItems: 'center',
  },
  subtitle: {
    fontSize: 22,
    fontWeight: '800',
    color: '#1F2937',
    marginTop: 20,
    textAlign: 'center',
  },
  description: {
    fontSize: 14,
    color: '#6B7280',
    marginTop: 8,
    textAlign: 'center',
    lineHeight: 20,
  },
  starsContainer: {
    flexDirection: 'row',
    marginVertical: 32,
  },
  input: {
    width: '100%',
    height: 120,
    borderColor: '#E5E7EB',
    borderWidth: 1,
    borderRadius: 16,
    padding: 16,
    fontSize: 15,
    color: '#1F2937',
    textAlignVertical: 'top',
    backgroundColor: '#FFF',
  },
  button: {
    width: '100%',
    backgroundColor: '#6366F1', // Midnight Indigo Accent
    paddingVertical: 16,
    borderRadius: 12,
    marginTop: 32,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#6366F1',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  buttonDisabled: {
    backgroundColor: '#9CA3AF',
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
});
