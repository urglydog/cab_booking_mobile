import React, { useState, useRef, useEffect } from 'react';
import {
  StyleSheet, View, Text, TextInput, TouchableOpacity,
  FlatList, ActivityIndicator, KeyboardAvoidingView, Platform,
  SafeAreaView, Alert, Modal, Image, Dimensions, ScrollView
} from 'react-native';
import { useRouter } from 'expo-router';
import { ChevronLeft, Send, Bot, User, AlertTriangle, Mic, Image as ImageIcon, MapPin, Car, CreditCard, X, Sparkles } from 'lucide-react-native';
import api from '@/services/api';
import AsyncStorage from '@react-native-async-storage/async-storage';
import MapView, { Marker, Polyline } from 'react-native-maps';
import { PricingService, calculateFallbackFare } from '@/services/pricingService';

interface Message {
  id: string;
  role: 'user' | 'assistant' | 'error';
  content: string;
  timestamp: Date;
  image?: string;
}

const QUICK_PROMPTS = [
  '🚗 Đặt xe nhanh',
  '💰 Tra cứu bảng giá',
  '🗺️ Hỏi đường đi',
  '📞 Liên hệ hỗ trợ',
];

const PROMO_LIST = [
  { code: 'CABNEW', title: 'Mừng bạn mới 🎁', discount: 30000, desc: 'Giảm trực tiếp 30.000đ cho chuyến đi đầu tiên' },
  { code: 'CABSUMMER', title: 'CAB Ngày nắng ☀️', discount: 15000, desc: 'Giảm trực tiếp 15.000đ du hí muôn nơi' },
  { code: 'CABVIP', title: 'CAB Tri ân VIP 💎', discount: 50000, desc: 'Mã VIP giảm giá cực khủng 50.000đ' },
];

const FAMOUS_LOCATIONS: Record<string, { lat: number; lng: number; name: string }> = {
  'iuh': { lat: 10.822, lng: 106.687, name: 'Đại học Công nghiệp TP.HCM (IUH)' },
  'đại học công nghiệp': { lat: 10.822, lng: 106.687, name: 'Đại học Công nghiệp TP.HCM (IUH)' },
  'landmark 81': { lat: 10.794, lng: 106.721, name: 'Tòa nhà Landmark 81, Bình Thạnh' },
  'sân bay': { lat: 10.816, lng: 106.663, name: 'Sân bay Quốc tế Tân Sơn Nhất' },
  'tân sơn nhất': { lat: 10.816, lng: 106.663, name: 'Sân bay Quốc tế Tân Sơn Nhất' },
  'dinh độc lập': { lat: 10.776, lng: 106.695, name: 'Dinh Độc Lập, Quận 1' },
  'đại học văn lang': { lat: 10.826, lng: 106.698, name: 'Đại học Văn Lang, Cơ sở 3' },
  'văn lang': { lat: 10.826, lng: 106.698, name: 'Đại học Văn Lang, Cơ sở 3' },
};

const generateRouteCoords = (
  start: { latitude: number; longitude: number },
  end: { latitude: number; longitude: number }
) => {
  const coords = [start];
  const dLat = end.latitude - start.latitude;
  const dLng = end.longitude - start.longitude;
  const perpLat = -dLng;
  const perpLng = dLat;
  const numSteps = 8;
  for (let i = 1; i < numSteps; i++) {
    const ratio = i / numSteps;
    const lat = start.latitude + dLat * ratio;
    const lng = start.longitude + dLng * ratio;
    const wave = Math.sin(ratio * Math.PI * 2);
    const offsetScale = 0.24;
    const latOffset = perpLat * wave * offsetScale;
    const lngOffset = perpLng * wave * offsetScale;
    coords.push({ latitude: lat + latOffset, longitude: lng + lngOffset });
  }
  coords.push(end);
  return coords;
};

export default function AIChatScreen() {
  const router = useRouter();
  const [messages, setMessages] = useState<Message[]>([
    {
      id: '0',
      role: 'assistant',
      content: 'Xin chào! Tôi là trợ lý AI thông minh của CAB Booking 🚖\n\nTôi có thể giúp bạn:\n• Đặt xe nhanh bằng giọng nói / chat 🚗\n• Tra cứu giá cước thời gian thực 💰\n• Phân tích hình ảnh địa danh & lập lộ trình 🗺️\n\nBạn muốn đi đâu hôm nay?',
      timestamp: new Date(),
    }
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [quotaExceeded, setQuotaExceeded] = useState(false);
  const flatListRef = useRef<FlatList>(null);

  // Voice Recording simulation state
  const [isVoiceModalVisible, setIsVoiceModalVisible] = useState(false);
  const [voiceTimer, setVoiceTimer] = useState(3);
  
  // Image attachment simulation state
  const [isImageModalVisible, setIsImageModalVisible] = useState(false);
  const [attachedImage, setAttachedImage] = useState<string | null>(null);

  // Booking Confirmation Popup states
  const [isBookingModalVisible, setIsBookingModalVisible] = useState(false);
  const [bookingDetails, setBookingDetails] = useState<{
    pickup: string;
    dropoff: string;
    pickupCoords: { latitude: number; longitude: number };
    dropoffCoords: { latitude: number; longitude: number };
    fare: number;
    vehicle: 'BIKE' | 'CAR4' | 'CAR7';
    payment: 'CASH' | 'MOMO' | 'ZALOPAY' | 'VNPAY';
    estimateId?: string;
    quotePayloadHash?: string;
    surgeMultiplier?: number;
  } | null>(null);
  const [confirmLoading, setConfirmLoading] = useState(false);

  // Promo Selector states (Alternating modal trigger to prevent overlay block on Android/iOS)
  const [isPromoListVisible, setIsPromoListVisible] = useState(false);
  const [appliedDiscount, setAppliedDiscount] = useState(0);
  const [appliedPromoCode, setAppliedPromoCode] = useState('');

  const handleOpenPromoList = () => {
    setIsBookingModalVisible(false);
    setTimeout(() => {
      setIsPromoListVisible(true);
    }, 350); // wait for booking modal to close smoothly before popping promo list
  };

  const handleClosePromoList = () => {
    setIsPromoListVisible(false);
    setTimeout(() => {
      setIsBookingModalVisible(true);
    }, 350);
  };

  const handleSelectPromo = (promo: typeof PROMO_LIST[0]) => {
    setAppliedDiscount(promo.discount);
    setAppliedPromoCode(promo.code);
    setIsPromoListVisible(false);
    setTimeout(() => {
      setIsBookingModalVisible(true);
      Alert.alert('Áp dụng thành công', `Đã áp dụng mã ${promo.code}, bạn được giảm ${promo.discount.toLocaleString('vi-VN')}đ! 🎉`);
    }, 350);
  };

  useEffect(() => {
    setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100);
  }, [messages]);

  // Voice recording mock process
  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (isVoiceModalVisible) {
      setVoiceTimer(3);
      interval = setInterval(() => {
        setVoiceTimer(prev => {
          if (prev <= 1) {
            clearInterval(interval);
            setIsVoiceModalVisible(false);
            // Auto send voice command
            const voiceCommands = [
              'Đặt cho tôi một xe ô tô đi từ Đại học Công nghiệp TP.HCM đến Landmark 81',
              'Đặt xe máy đi từ Sân bay Tân Sơn Nhất về Dinh Độc Lập',
              'Tôi muốn đặt xe đi từ Đại học Văn Lang đến Landmark 81'
            ];
            const randomCommand = voiceCommands[Math.floor(Math.random() * voiceCommands.length)];
            sendMessage(randomCommand);
            return 3;
          }
          return prev - 1;
        });
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [isVoiceModalVisible]);

  const handleSelectImage = (imgName: string) => {
    setAttachedImage(imgName);
    setIsImageModalVisible(false);
    
    // Auto fill or trigger message
    if (imgName === 'landmark') {
      setInput('Phân tích ảnh này và gợi ý đặt xe đến Landmark 81 cho tôi');
    } else if (imgName === 'airport') {
      setInput('Từ đây đi Sân bay Tân Sơn Nhất hết bao nhiêu tiền?');
    }
  };

  const parseBookingIntent = (text: string) => {
    const lowerText = text.toLowerCase();
    
    // Check if message is related to booking/ordering
    const isBooking = lowerText.includes('đặt xe') || lowerText.includes('đặt chuyến') || lowerText.includes('gọi xe') || lowerText.includes('đi từ');
    if (!isBooking) return null;

    // Detect locations
    let pickupLoc = 'Đại học Công nghiệp TP.HCM (IUH)';
    let dropoffLoc = 'Tòa nhà Landmark 81, Bình Thạnh';
    let pickupCoords = FAMOUS_LOCATIONS['iuh'];
    let dropoffCoords = FAMOUS_LOCATIONS['landmark 81'];

    // Scan for matched locations in text
    Object.entries(FAMOUS_LOCATIONS).forEach(([key, val]) => {
      if (lowerText.includes(key)) {
        if (lowerText.indexOf(key) < lowerText.indexOf('đến') && lowerText.includes('đến')) {
          pickupLoc = val.name;
          pickupCoords = val;
        } else {
          dropoffLoc = val.name;
          dropoffCoords = val;
        }
      }
    });

    // Determine vehicle type (BIKE, CAR4, CAR7)
    let vehicle: 'BIKE' | 'CAR4' | 'CAR7' = 'CAR4';
    if (lowerText.includes('xe máy') || lowerText.includes('bike') || lowerText.includes('xe ôm')) {
      vehicle = 'BIKE';
    } else if (lowerText.includes('7 chỗ') || lowerText.includes('premium') || lowerText.includes('vip') || lowerText.includes('car7')) {
      vehicle = 'CAR7';
    } else {
      vehicle = 'CAR4';
    }

    // Call professional calculateFallbackFare to keep it 100% in sync with manual booking
    const calculatedFare = calculateFallbackFare(
      pickupCoords.lat,
      pickupCoords.lng,
      dropoffCoords.lat,
      dropoffCoords.lng,
      vehicle
    );
    // Round to nearest 1000 VND for visual clarity
    const fare = Math.round(calculatedFare / 1000) * 1000;

    return {
      pickup: pickupLoc,
      dropoff: dropoffLoc,
      pickupCoords: { latitude: pickupCoords.lat, longitude: pickupCoords.lng },
      dropoffCoords: { latitude: dropoffCoords.lat, longitude: dropoffCoords.lng },
      fare,
      vehicle,
      payment: 'CASH' as const
    };
  };

  const sendMessage = async (text?: string) => {
    const messageText = (text || input).trim();
    if (!messageText && !attachedImage) return;
    if (loading) return;

    // Check Auth first
    const token = await AsyncStorage.getItem('access_token');
    const isBookingRequest = messageText.toLowerCase().includes('đặt xe') || messageText.toLowerCase().includes('gọi xe');
    
    if (isBookingRequest && !token) {
      setMessages(prev => [
        ...prev,
        { id: Date.now().toString(), role: 'user', content: messageText, timestamp: new Date() },
        {
          id: (Date.now() + 1).toString(),
          role: 'assistant',
          content: '🔒 Bạn chưa đăng nhập tài khoản. Vui lòng quay lại trang **Tài khoản** để đăng nhập/đăng ký trước khi đặt xe qua AI nhé!',
          timestamp: new Date()
        }
      ]);
      setInput('');
      setAttachedImage(null);
      return;
    }

    const userMsg: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: messageText || 'Đã gửi một hình ảnh phân tích',
      timestamp: new Date(),
      image: attachedImage || undefined
    };

    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setAttachedImage(null);
    setLoading(true);

    // Thêm độ trễ suy nghĩ chân thực (1200ms) để cuộc hội thoại với AI Agent sống động và tự nhiên
    await new Promise(resolve => setTimeout(resolve, 1200));

    // Check if AI can process booking popup locally for smooth UX
    const bookingIntent = parseBookingIntent(messageText);

    try {
      if (bookingIntent) {
        console.log('[AI Chat] Lấy báo giá chính thức từ Pricing Service trước khi hiển thị popup...');
        const idempotencyKey = `${Date.now()}_ai_est_${Math.random().toString(36).substring(2, 10)}`;
        try {
          const officialEstimate = await PricingService.createEstimate(
            {
              pickupLat: bookingIntent.pickupCoords.latitude,
              pickupLng: bookingIntent.pickupCoords.longitude,
              dropoffLat: bookingIntent.dropoffCoords.latitude,
              dropoffLng: bookingIntent.dropoffCoords.longitude,
              vehicleType: bookingIntent.vehicle,
            },
            idempotencyKey
          );
          bookingIntent.fare = officialEstimate.totalFare;
          bookingIntent.estimateId = officialEstimate.estimateId;
          bookingIntent.quotePayloadHash = officialEstimate.quotePayloadHash;
          bookingIntent.surgeMultiplier = officialEstimate.surgeMultiplier;
          console.log('[AI Chat] Báo giá chính xác từ backend:', bookingIntent.fare);
        } catch (estErr) {
          console.log('[AI Chat] Báo giá microservice thất bại, sử dụng giá ước tính nội bộ:', estErr);
        }

        let vehicleLabel = 'Xe máy CAB Bike';
        if (bookingIntent.vehicle === 'CAR4') vehicleLabel = 'Xe ô tô 4 chỗ';
        if (bookingIntent.vehicle === 'CAR7') vehicleLabel = 'Xe ô tô 7 chỗ cao cấp';

        setMessages(prev => [...prev, {
          id: (Date.now() + 1).toString(),
          role: 'assistant',
          content: `🔮 Tôi đã lập lộ trình tối ưu cho bạn!\n\n📍 **Điểm đón:** ${bookingIntent.pickup}\n🏁 **Điểm đến:** ${bookingIntent.dropoff}\n🚗 **Phương tiện:** ${vehicleLabel}\n\n*Tôi đang hiển thị màn hình xác nhận chuyến đi bên dưới để bạn kiểm tra và đặt xe ngay lập tức!*`,
          timestamp: new Date(),
        }]);
        
        setBookingDetails(bookingIntent);
        setAppliedDiscount(0);
        setAppliedPromoCode('');
        setIsBookingModalVisible(true);
        setLoading(false);
        return;
      }

      // Normal Chat fallback to ai-agent microservice
      const response = await api.post('/api/v1/ai-agent/chat', { message: messageText });
      let reply = response.data?.reply || 'Xin lỗi, tôi không hiểu câu hỏi này.';

      if (reply.includes('latitude') || reply.includes('longitude') || reply.includes('token')) {
        reply = 'Tôi có thể hỗ trợ bạn đặt xe ngay bây giờ! Hãy chat theo cú pháp:\n👉 *"Đặt xe đi từ IUH đến Landmark 81"* hoặc *"Đặt xe máy đến Sân bay"* để tôi mở màn hình xác nhận lộ trình thông minh cho bạn!';
      }

      setMessages(prev => [...prev, {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: reply,
        timestamp: new Date(),
      }]);
      setQuotaExceeded(false);
    } catch (error: any) {
      console.log('AI agent error:', error);
      setMessages(prev => [...prev, {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: `Tôi hiểu yêu cầu của bạn! Đối với dịch vụ đặt xe nhanh hoặc tra cứu giá, bạn chỉ cần ra lệnh:\n\n👉 *"Đặt một xe ô tô đi từ IUH đến Sân bay Tân Sơn Nhất"* hoặc *"Tra cứu giá từ Dinh Độc Lập đến Landmark 81"*\n\nTôi sẽ tính toán đường đi uốn lượn và mở Popup Xác nhận đặt xe tức thì cho bạn!`,
        timestamp: new Date(),
      }]);
    } finally {
      setLoading(false);
    }
  };

  const handleSwitchVehicle = async (vehicleType: 'BIKE' | 'CAR4' | 'CAR7') => {
    if (!bookingDetails) return;
    
    // 1. Update vehicle type in UI instantly with local calculated fallback fare so there is zero layout stutter
    const localFare = Math.round(calculateFallbackFare(
      bookingDetails.pickupCoords.latitude,
      bookingDetails.pickupCoords.longitude,
      bookingDetails.dropoffCoords.latitude,
      bookingDetails.dropoffCoords.longitude,
      vehicleType
    ) / 1000) * 1000;

    setBookingDetails(prev => prev ? { 
      ...prev, 
      vehicle: vehicleType, 
      fare: localFare,
      estimateId: undefined, // Clear old quote metadata to force correct verification
      quotePayloadHash: undefined 
    } : null);

    // 2. Fetch official pricing in background for the newly selected vehicle
    try {
      console.log(`[AI Chat] Fetching real pricing for switched vehicle: ${vehicleType}...`);
      const idempotencyKey = `${Date.now()}_ai_switch_${Math.random().toString(36).substring(2, 10)}`;
      const officialEstimate = await PricingService.createEstimate(
        {
          pickupLat: bookingDetails.pickupCoords.latitude,
          pickupLng: bookingDetails.pickupCoords.longitude,
          dropoffLat: bookingDetails.dropoffCoords.latitude,
          dropoffLng: bookingDetails.dropoffCoords.longitude,
          vehicleType: vehicleType,
        },
        idempotencyKey
      );

      setBookingDetails(prev => {
        if (!prev || prev.vehicle !== vehicleType) return prev; // Avoid race condition if user tapped another option
        return {
          ...prev,
          fare: officialEstimate.totalFare,
          estimateId: officialEstimate.estimateId,
          quotePayloadHash: officialEstimate.quotePayloadHash,
          surgeMultiplier: officialEstimate.surgeMultiplier
        };
      });
      console.log('[AI Chat] Switched vehicle real fare:', officialEstimate.totalFare);
    } catch (err) {
      console.log('[AI Chat] Failed to fetch real estimate for switched vehicle, using fallback:', err);
    }
  };

  const handleConfirmBooking = async () => {
    if (!bookingDetails) return;
    setConfirmLoading(true);

    try {
      const userId = await AsyncStorage.getItem('user_id') || '';
      const idempotencyKey = `${Date.now()}_ai_${Math.random().toString(36).substring(2, 10)}`;

      let estimateId = bookingDetails.estimateId;
      let quotePayloadHash = bookingDetails.quotePayloadHash;
      let surgeMultiplier = bookingDetails.surgeMultiplier ?? 1.0;
      let baseFare = bookingDetails.fare;

      // Nếu chưa có báo giá từ bước trước (ví dụ bị lỗi mạng lúc đó), lấy báo giá ngay bây giờ
      if (!estimateId || !quotePayloadHash) {
        console.log('[AI Chat] Chưa có estimateId, tiến hành lấy báo giá từ Pricing Service...');
        const pricingPayload = {
          pickupLat: bookingDetails.pickupCoords.latitude,
          pickupLng: bookingDetails.pickupCoords.longitude,
          dropoffLat: bookingDetails.dropoffCoords.latitude,
          dropoffLng: bookingDetails.dropoffCoords.longitude,
          vehicleType: bookingDetails.vehicle,
        };
        const estimate = await PricingService.createEstimate(pricingPayload, `${idempotencyKey}_pricing`);
        estimateId = estimate.estimateId;
        quotePayloadHash = estimate.quotePayloadHash;
        baseFare = estimate.totalFare;
        surgeMultiplier = estimate.surgeMultiplier ?? 1.0;
      }

      const finalFare = Math.max(2000, baseFare - appliedDiscount);

      // 2. Tạo payload đặt xe chuẩn tương thích 100% với BookingServiceImpl
      const bookingRequest = {
        pickupLocation: bookingDetails.pickup,
        dropoffLocation: bookingDetails.dropoff,
        customerNote: appliedPromoCode
          ? `Đặt qua AI - Áp dụng mã ${appliedPromoCode}`
          : 'Đặt qua AI Agent rảnh tay.',
        pickupCoordinates: {
          lat: bookingDetails.pickupCoords.latitude,
          lng: bookingDetails.pickupCoords.longitude,
        },
        dropoffCoordinates: {
          lat: bookingDetails.dropoffCoords.latitude,
          lng: bookingDetails.dropoffCoords.longitude,
        },
        vehicleType: bookingDetails.vehicle,
        paymentMethod: bookingDetails.payment,
        estimatedFare: finalFare,
        promoCode: appliedPromoCode || '',
        estimateId: estimateId ?? '',
        quotePayloadHash: quotePayloadHash ?? '',
        surgeMultiplier: surgeMultiplier,
        idempotencyKey,
      };

      console.log('[AI Chat] Gửi yêu cầu đặt xe chính thức:', JSON.stringify(bookingRequest, null, 2));
      const res = await api.post('/api/v1/bookings', bookingRequest);
      const createdBooking = res.data?.result || res.data;
      const bookingId = createdBooking.id;

      if (!bookingId) {
        throw new Error(res.data?.message || 'Không nhận được booking ID từ hệ thống.');
      }

      // Lưu thông tin khuyến mãi để hiển thị ở detail.tsx
      const promoInfo = {
        promoCode: appliedPromoCode || null,
        discountAmount: appliedDiscount,
        baseFare: baseFare
      };
      await AsyncStorage.setItem(`booking_promo_${bookingId}`, JSON.stringify(promoInfo));

      setIsBookingModalVisible(false);
      
      // Chuyển sang màn hình matching thật
      router.push({
        pathname: '/matching',
        params: {
          bookingId: bookingId,
          estimatedFare: finalFare.toString(),
          surge: surgeMultiplier.toString(),
          vehicleType: bookingDetails.vehicle,
          pickup: bookingDetails.pickup,
          dropoff: bookingDetails.dropoff,
          pickupLat: bookingDetails.pickupCoords.latitude.toString(),
          pickupLng: bookingDetails.pickupCoords.longitude.toString(),
          dropoffLat: bookingDetails.dropoffCoords.latitude.toString(),
          dropoffLng: bookingDetails.dropoffCoords.longitude.toString(),
          paymentMethod: bookingDetails.payment,
        }
      });
    } catch (err: any) {
      console.log('Failed to create booking through AI:', err?.response?.data ?? err);
      const errMsg = err?.response?.data?.message ?? err?.message ?? 'Đã xảy ra sự cố kết nối.';
      Alert.alert(
        'Đặt xe thất bại',
        `Không thể khởi tạo chuyến đi qua AI: ${errMsg}. Vui lòng đặt xe thủ công hoặc thử lại sau.`
      );
    } finally {
      setConfirmLoading(false);
    }
  };

  const renderMessage = ({ item }: { item: Message }) => {
    const isUser = item.role === 'user';
    const isError = item.role === 'error';
    return (
      <View style={[styles.messageRow, isUser && styles.messageRowUser]}>
        {!isUser && (
          <View style={[styles.avatar, isError && styles.avatarError]}>
            {isError ? <AlertTriangle size={16} color="#fff" /> : <Bot size={16} color="#fff" />}
          </View>
        )}
        <View style={[
          styles.bubble,
          isUser ? styles.bubbleUser : styles.bubbleBot,
          isError && styles.bubbleError,
        ]}>
          {item.image && (
            <View style={styles.messageImageWrapper}>
              <Image 
                source={item.image === 'landmark' ? require('@/assets/images/icon.png') : require('@/assets/images/react-logo.png')} 
                style={styles.messageImage} 
                defaultSource={require('@/assets/images/icon.png')}
              />
              <View style={styles.imageBadge}>
                <Text style={styles.imageBadgeText}>📸 {item.image === 'landmark' ? 'Landmark 81' : 'Sân bay'}</Text>
              </View>
            </View>
          )}
          <Text style={[styles.bubbleText, isUser && styles.bubbleTextUser]}>
            {item.content}
          </Text>
          <Text style={[styles.timeText, isUser && { color: 'rgba(255,255,255,0.6)' }]}>
            {item.timestamp.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}
          </Text>
        </View>
        {isUser && (
          <View style={styles.avatarUser}>
            <User size={16} color="#fff" />
          </View>
        )}
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <ChevronLeft size={26} color="#fff" />
        </TouchableOpacity>
        <View style={styles.headerInfo}>
          <View style={styles.headerAvatar}>
            <Bot size={20} color="#fff" />
          </View>
          <View>
            <Text style={styles.headerTitle}>CAB AI Booking Agent</Text>
            <Text style={styles.headerSub}>
              {quotaExceeded ? '⚠️ Hết quota hôm nay' : '● Trợ lý đặt xe rảnh tay'}
            </Text>
          </View>
        </View>
      </View>

      {/* Messages */}
      <FlatList
        ref={flatListRef}
        data={messages}
        keyExtractor={item => item.id}
        renderItem={renderMessage}
        contentContainerStyle={styles.messageList}
        onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: true })}
      />

      {/* Quick Prompts */}
      {messages.length <= 1 && (
        <View style={styles.quickPrompts}>
          {QUICK_PROMPTS.map(prompt => (
            <TouchableOpacity
              key={prompt}
              style={styles.quickPromptBtn}
              onPress={() => {
                if (prompt.includes('Đặt xe')) {
                  sendMessage('Đặt xe ô tô đi từ IUH đến Landmark 81');
                } else if (prompt.includes('bảng giá')) {
                  sendMessage('Bảng giá xe ôm và xe ô tô tính thế nào?');
                } else {
                  sendMessage(prompt.replace(/^[^\s]+\s/, ''));
                }
              }}
            >
              <Text style={styles.quickPromptText}>{prompt}</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      {/* Typing indicator */}
      {loading && (
        <View style={styles.typingIndicator}>
          <Bot size={14} color="#6366F1" />
          <Text style={styles.typingText}>AI đang phân tích lộ trình...</Text>
          <ActivityIndicator size="small" color="#6366F1" style={{ marginLeft: 6 }} />
        </View>
      )}

      {/* Image attachment indicator if chosen */}
      {attachedImage && (
        <View style={styles.attachmentPreviewContainer}>
          <Text style={styles.attachmentText}>📎 Đã đính kèm ảnh: {attachedImage === 'landmark' ? 'Landmark 81' : 'Sân bay'}</Text>
          <TouchableOpacity onPress={() => setAttachedImage(null)} style={styles.removeAttachment}>
            <X size={16} color="#EF4444" />
          </TouchableOpacity>
        </View>
      )}

      {/* Input row with mic and camera buttons */}
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <View style={styles.inputRow}>
          {/* Voice Mic Button */}
          <TouchableOpacity 
            style={styles.actionBtn}
            onPress={() => setIsVoiceModalVisible(true)}
            activeOpacity={0.7}
          >
            <Mic size={22} color="#4F46E5" />
          </TouchableOpacity>

          {/* Image Upload Button */}
          <TouchableOpacity 
            style={styles.actionBtn}
            onPress={() => setIsImageModalVisible(true)}
            activeOpacity={0.7}
          >
            <ImageIcon size={22} color="#10B981" />
          </TouchableOpacity>

          <TextInput
            style={styles.input}
            placeholder="Nói hoặc chat địa điểm đặt xe..."
            placeholderTextColor="#9CA3AF"
            value={input}
            onChangeText={setInput}
            multiline
            maxLength={500}
            onSubmitEditing={() => sendMessage()}
          />
          <TouchableOpacity
            style={[styles.sendBtn, (!input.trim() && !attachedImage || loading) && styles.sendBtnDisabled]}
            onPress={() => sendMessage()}
            disabled={!input.trim() && !attachedImage || loading}
          >
            <Send size={18} color="#fff" />
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>

      {/* ── 1. VOICE RECORDING SIMULATOR MODAL ── */}
      <Modal
        visible={isVoiceModalVisible}
        transparent={true}
        animationType="fade"
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.voiceCard}>
            <View style={styles.voiceRippleContainer}>
              <View style={styles.voiceWaveOuter}>
                <View style={styles.voiceWaveInner}>
                  <Mic size={38} color="#FFF" />
                </View>
              </View>
            </View>
            <Text style={styles.voiceTitle}>Đang lắng nghe giọng nói...</Text>
            <Text style={styles.voiceSub}>Hãy nói địa điểm của bạn (Ví dụ: "Đặt xe đi Landmark")</Text>
            <Text style={styles.voiceTimerText}>{voiceTimer}s</Text>
            <TouchableOpacity onPress={() => setIsVoiceModalVisible(false)} style={styles.voiceCancelBtn}>
              <Text style={styles.voiceCancelText}>Hủy bỏ</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* ── 2. IMAGE PICKER SIMULATOR MODAL ── */}
      <Modal
        visible={isImageModalVisible}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setIsImageModalVisible(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.imageSelectorCard}>
            <View style={styles.imageCardHeader}>
              <Text style={styles.imageCardTitle}>Chọn hình ảnh phân tích (Demo)</Text>
              <TouchableOpacity onPress={() => setIsImageModalVisible(false)}>
                <X size={20} color="#666" />
              </TouchableOpacity>
            </View>
            <Text style={styles.imageCardSub}>Gửi ảnh địa điểm để AI lập lộ trình tự động</Text>
            
            <View style={styles.imagesPickerGrid}>
              <TouchableOpacity style={styles.imageOption} onPress={() => handleSelectImage('landmark')}>
                <View style={styles.imagePlaceholderBox}>
                  <Text style={{ fontSize: 32 }}>🏢</Text>
                </View>
                <Text style={styles.imageOptionText}>Landmark 81</Text>
              </TouchableOpacity>

              <TouchableOpacity style={styles.imageOption} onPress={() => handleSelectImage('airport')}>
                <View style={styles.imagePlaceholderBox}>
                  <Text style={{ fontSize: 32 }}>✈️</Text>
                </View>
                <Text style={styles.imageOptionText}>Sân bay</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ── 3. BOOKING CONFIRMATION POPUP MODAL (AI DIRECT ORDERING) ── */}
      <Modal
        visible={isBookingModalVisible}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setIsBookingModalVisible(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.bookingCard}>
            {/* Header */}
            <View style={styles.bookingHeader}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Sparkles size={20} color="#4F46E5" />
                <Text style={styles.bookingHeaderTitle}>Xác nhận chuyến đi từ AI</Text>
              </View>
              <TouchableOpacity onPress={() => setIsBookingModalVisible(false)}>
                <X size={20} color="#4B5563" />
              </TouchableOpacity>
            </View>

            {bookingDetails ? (
              <ScrollView showsVerticalScrollIndicator={false} style={styles.bookingScroll} contentContainerStyle={styles.bookingScrollContent}>
                {/* Micro Map Preview */}
                <View style={styles.miniMapWrapper}>
                  <MapView
                    style={styles.miniMap}
                    scrollEnabled={false}
                    zoomEnabled={false}
                    region={{
                      latitude: (bookingDetails.pickupCoords.latitude + bookingDetails.dropoffCoords.latitude) / 2,
                      longitude: (bookingDetails.pickupCoords.longitude + bookingDetails.dropoffCoords.longitude) / 2,
                      latitudeDelta: Math.abs(bookingDetails.pickupCoords.latitude - bookingDetails.dropoffCoords.latitude) * 2.2,
                      longitudeDelta: Math.abs(bookingDetails.pickupCoords.longitude - bookingDetails.dropoffCoords.longitude) * 2.2,
                    }}
                  >
                    <Marker coordinate={bookingDetails.pickupCoords} pinColor="#10B981" title="Điểm đón" />
                    <Marker coordinate={bookingDetails.dropoffCoords} pinColor="#EF4444" title="Điểm đến" />
                    <Polyline
                      coordinates={generateRouteCoords(bookingDetails.pickupCoords, bookingDetails.dropoffCoords)}
                      strokeColor="#4F46E5"
                      strokeWidth={3.5}
                    />
                  </MapView>
                </View>

                {/* Addresses */}
                <View style={styles.addressList}>
                  <View style={styles.addressItem}>
                    <View style={[styles.dotIndicator, { backgroundColor: '#10B981' }]} />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.addressLabel}>Điểm đón</Text>
                      <Text style={styles.addressText} numberOfLines={1}>{bookingDetails.pickup}</Text>
                    </View>
                  </View>
                  <View style={styles.verticalLine} />
                  <View style={styles.addressItem}>
                    <View style={[styles.dotIndicator, { backgroundColor: '#EF4444' }]} />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.addressLabel}>Điểm đến</Text>
                      <Text style={styles.addressText} numberOfLines={1}>{bookingDetails.dropoff}</Text>
                    </View>
                  </View>
                </View>

                {/* Selection Options */}
                <View style={styles.optionsRow}>
                  {/* Vehicle Selector (3 Tiers: BIKE, CAR4, CAR7) */}
                  <View style={styles.optionBox}>
                    <Text style={styles.optionLabel}>Phương tiện</Text>
                    <View style={styles.pillRow}>
                      <TouchableOpacity 
                        style={[styles.pill, bookingDetails.vehicle === 'BIKE' && styles.pillSelected]}
                        onPress={() => handleSwitchVehicle('BIKE')}
                      >
                        <Text style={[styles.pillText, bookingDetails.vehicle === 'BIKE' && styles.pillTextSelected]}>🏍️ Xe máy</Text>
                      </TouchableOpacity>
                      <TouchableOpacity 
                        style={[styles.pill, bookingDetails.vehicle === 'CAR4' && styles.pillSelected]}
                        onPress={() => handleSwitchVehicle('CAR4')}
                      >
                        <Text style={[styles.pillText, bookingDetails.vehicle === 'CAR4' && styles.pillTextSelected]}>🚗 4 Chỗ</Text>
                      </TouchableOpacity>
                      <TouchableOpacity 
                        style={[styles.pill, bookingDetails.vehicle === 'CAR7' && styles.pillSelected]}
                        onPress={() => handleSwitchVehicle('CAR7')}
                      >
                        <Text style={[styles.pillText, bookingDetails.vehicle === 'CAR7' && styles.pillTextSelected]}>🚙 7 Chỗ</Text>
                      </TouchableOpacity>
                    </View>
                  </View>

                  {/* Payment Selector (Horizontal scroll showing full ZaloPay, MoMo, VNPay options) */}
                  <View style={styles.paymentContainer}>
                    <Text style={styles.optionLabel}>Thanh toán</Text>
                    <ScrollView 
                      horizontal 
                      showsHorizontalScrollIndicator={false} 
                      style={styles.paymentScrollRow}
                      contentContainerStyle={{ gap: 8, paddingVertical: 4 }}
                    >
                      <TouchableOpacity 
                        style={[styles.paymentPill, bookingDetails.payment === 'CASH' && styles.paymentPillSelected]}
                        onPress={() => setBookingDetails(prev => prev ? { ...prev, payment: 'CASH' } : null)}
                      >
                        <Text style={[styles.paymentPillText, bookingDetails.payment === 'CASH' && styles.paymentPillTextSelected]}>💵 Tiền mặt</Text>
                      </TouchableOpacity>
                      <TouchableOpacity 
                        style={[styles.paymentPill, bookingDetails.payment === 'MOMO' && styles.paymentPillSelected]}
                        onPress={() => setBookingDetails(prev => prev ? { ...prev, payment: 'MOMO' } : null)}
                      >
                        <Text style={[styles.paymentPillText, bookingDetails.payment === 'MOMO' && styles.paymentPillTextSelected]}>🌸 MoMo</Text>
                      </TouchableOpacity>
                      <TouchableOpacity 
                        style={[styles.paymentPill, bookingDetails.payment === 'ZALOPAY' && styles.paymentPillSelected]}
                        onPress={() => setBookingDetails(prev => prev ? { ...prev, payment: 'ZALOPAY' } : null)}
                      >
                        <Text style={[styles.paymentPillText, bookingDetails.payment === 'ZALOPAY' && styles.paymentPillTextSelected]}>💙 ZaloPay</Text>
                      </TouchableOpacity>
                      <TouchableOpacity 
                        style={[styles.paymentPill, bookingDetails.payment === 'VNPAY' && styles.paymentPillSelected]}
                        onPress={() => setBookingDetails(prev => prev ? { ...prev, payment: 'VNPAY' } : null)}
                      >
                        <Text style={[styles.paymentPillText, bookingDetails.payment === 'VNPAY' && styles.paymentPillTextSelected]}>🔴 VNPay</Text>
                      </TouchableOpacity>
                    </ScrollView>
                  </View>

                  {/* Promo Selector Row (Dropdown style trigger with alternating overlay modal fix) */}
                  <View style={styles.optionBox}>
                    <Text style={styles.optionLabel}>Khuyến mãi</Text>
                    <TouchableOpacity 
                      style={styles.promoSelectorBtn} 
                      onPress={handleOpenPromoList}
                    >
                      <Text style={styles.promoSelectorBtnText}>
                        {appliedPromoCode ? `${appliedPromoCode} (-${appliedDiscount.toLocaleString('vi-VN')}đ)` : 'Chọn khuyến mãi >'}
                      </Text>
                    </TouchableOpacity>
                  </View>
                </View>

                {/* Fare Summary */}
                <View style={styles.fareContainer}>
                  <Text style={styles.fareLabel}>Giá cước</Text>
                  <View style={{ alignItems: 'flex-end' }}>
                    {appliedDiscount > 0 && (
                      <Text style={styles.fareOriginalAmount}>
                        {bookingDetails.fare.toLocaleString('vi-VN')}đ
                      </Text>
                    )}
                    <Text style={styles.fareAmount}>
                      {Math.max(2000, bookingDetails.fare - appliedDiscount).toLocaleString('vi-VN')}đ
                    </Text>
                  </View>
                </View>

                {/* Action Button */}
                <TouchableOpacity
                  style={styles.confirmBtn}
                  onPress={handleConfirmBooking}
                  disabled={confirmLoading}
                  activeOpacity={0.8}
                >
                  {confirmLoading ? (
                    <ActivityIndicator size="small" color="#FFF" />
                  ) : (
                    <Text style={styles.confirmBtnText}>XÁC NHẬN ĐẶT XE NGAY</Text>
                  )}
                </TouchableOpacity>
              </ScrollView>
            ) : (
              <View style={{ paddingVertical: 45, alignItems: 'center', justifyContent: 'center', gap: 12 }}>
                <ActivityIndicator size="large" color="#4F46E5" />
                <Text style={{ fontSize: 13, color: '#6B7280', fontWeight: '600', textAlign: 'center' }}>
                  AI đang lập lộ trình tối ưu cho bạn...
                </Text>
              </View>
            )}
          </View>
        </View>
      </Modal>

      {/* ── 4. PROMO SELECTOR MODAL (STANDALONE TO PREVENT YOGA LAYER CONFLICT) ── */}
      <Modal
        visible={isPromoListVisible}
        transparent={true}
        animationType="slide"
        onRequestClose={handleClosePromoList}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.promoListCard}>
            <View style={styles.promoHeader}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Sparkles size={18} color="#4F46E5" />
                <Text style={styles.promoHeaderTitle}>Chọn mã khuyến mãi</Text>
              </View>
              <TouchableOpacity onPress={handleClosePromoList}>
                <X size={20} color="#4B5563" />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} style={{ maxHeight: 320 }}>
              {PROMO_LIST.map((promo) => (
                <TouchableOpacity
                  key={promo.code}
                  style={[
                    styles.promoItem,
                    appliedPromoCode === promo.code && styles.promoItemSelected
                  ]}
                  onPress={() => handleSelectPromo(promo)}
                >
                  <View style={styles.promoItemLeft}>
                    <View style={styles.promoItemIconContainer}>
                      <Text style={{ fontSize: 20 }}>
                        {promo.code === 'CABNEW' ? '🎁' : promo.code === 'CABSUMMER' ? '☀️' : '💎'}
                      </Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.promoItemTitle}>{promo.title}</Text>
                      <Text style={styles.promoItemDesc} numberOfLines={1}>{promo.desc}</Text>
                    </View>
                  </View>
                  <View style={styles.promoItemRight}>
                    <Text style={styles.promoItemDiscountText}>-{promo.discount.toLocaleString('vi-VN')}đ</Text>
                  </View>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FAF9FC' },
  header: {
    backgroundColor: '#6366F1',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    paddingTop: 50,
    gap: 12,
  },
  backBtn: { padding: 4 },
  headerInfo: { flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 },
  headerAvatar: {
    width: 38, height: 38, borderRadius: 19,
    backgroundColor: 'rgba(255,255,255,0.2)',
    justifyContent: 'center', alignItems: 'center',
  },
  headerTitle: { color: '#fff', fontSize: 16, fontWeight: '800' },
  headerSub: { color: 'rgba(255,255,255,0.9)', fontSize: 11, marginTop: 1, fontWeight: '500' },
  messageList: { paddingHorizontal: 16, paddingVertical: 16, paddingBottom: 8 },
  messageRow: { flexDirection: 'row', marginBottom: 16, alignItems: 'flex-end', gap: 8 },
  messageRowUser: { flexDirection: 'row-reverse' },
  avatar: {
    width: 34, height: 34, borderRadius: 17,
    backgroundColor: '#6366F1', justifyContent: 'center', alignItems: 'center',
  },
  avatarError: { backgroundColor: '#EF4444' },
  avatarUser: {
    width: 34, height: 34, borderRadius: 17,
    backgroundColor: '#10B981', justifyContent: 'center', alignItems: 'center',
  },
  bubble: {
    maxWidth: '75%', padding: 14, borderRadius: 20,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.03, shadowRadius: 4, elevation: 1,
  },
  bubbleBot: { backgroundColor: '#fff', borderBottomLeftRadius: 4 },
  bubbleUser: { backgroundColor: '#6366F1', borderBottomRightRadius: 4 },
  bubbleError: { backgroundColor: '#FEF2F2', borderWidth: 1, borderColor: '#FECACA' },
  bubbleText: { fontSize: 14.5, color: '#1F2937', lineHeight: 22 },
  bubbleTextUser: { color: '#fff' },
  timeText: { fontSize: 10, color: '#9CA3AF', marginTop: 4, textAlign: 'right' },
  quickPrompts: {
    flexDirection: 'row', flexWrap: 'wrap', gap: 8,
    paddingHorizontal: 16, paddingBottom: 16,
  },
  quickPromptBtn: {
    backgroundColor: '#EEF2FF', paddingHorizontal: 14, paddingVertical: 9,
    borderRadius: 20, borderWidth: 1, borderColor: '#E0E7FF',
  },
  quickPromptText: { fontSize: 13, color: '#6366F1', fontWeight: '700' },
  typingIndicator: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 20, paddingBottom: 8,
  },
  typingText: { fontSize: 12, color: '#6366F1', fontStyle: 'italic', fontWeight: '500' },
  attachmentPreviewContainer: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    backgroundColor: '#ECFDF5', paddingHorizontal: 16, paddingVertical: 10,
    borderTopWidth: 1, borderTopColor: '#A7F3D0',
  },
  attachmentText: { fontSize: 13, color: '#047857', fontWeight: '600' },
  removeAttachment: { padding: 4 },
  inputRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingHorizontal: 12, paddingVertical: 12,
    backgroundColor: '#fff',
    borderTopWidth: 1, borderTopColor: '#F0F0F0',
  },
  actionBtn: {
    width: 40, height: 40, borderRadius: 12,
    backgroundColor: '#F3F4F6', justifyContent: 'center', alignItems: 'center',
  },
  input: {
    flex: 1, minHeight: 42, maxHeight: 100,
    backgroundColor: '#F8F9FB', borderRadius: 20,
    paddingHorizontal: 16, paddingVertical: 10,
    fontSize: 15, color: '#1F2937',
    borderWidth: 1, borderColor: '#E5E7EB',
  },
  sendBtn: {
    width: 42, height: 42, borderRadius: 21,
    backgroundColor: '#6366F1', justifyContent: 'center', alignItems: 'center',
  },
  sendBtnDisabled: { backgroundColor: '#D1D5DB' },

  // Message image display
  messageImageWrapper: {
    position: 'relative',
    marginBottom: 8,
    borderRadius: 12,
    overflow: 'hidden',
  },
  messageImage: {
    width: 180,
    height: 120,
    backgroundColor: '#E5E7EB',
  },
  imageBadge: {
    position: 'absolute',
    bottom: 6,
    left: 6,
    backgroundColor: 'rgba(0,0,0,0.6)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  imageBadgeText: {
    color: '#FFF',
    fontSize: 10,
    fontWeight: '700',
  },

  // ── MODAL COMMON STYLES ──
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },

  // ── VOICE RECORDING STYLES ──
  voiceCard: {
    width: 280,
    backgroundColor: '#FFF',
    borderRadius: 24,
    padding: 24,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.15,
    shadowRadius: 16,
    elevation: 10,
  },
  voiceRippleContainer: {
    width: 140,
    height: 140,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  voiceWaveOuter: {
    width: 100, height: 100, borderRadius: 50,
    backgroundColor: '#EEF2FF', justifyContent: 'center', alignItems: 'center',
  },
  voiceWaveInner: {
    width: 74, height: 74, borderRadius: 37,
    backgroundColor: '#4F46E5', justifyContent: 'center', alignItems: 'center',
    shadowColor: '#4F46E5', shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3, shadowRadius: 8, elevation: 4,
  },
  voiceTitle: { fontSize: 16, fontWeight: '800', color: '#1F2937', marginBottom: 6 },
  voiceSub: { fontSize: 12, color: '#6B7280', textAlign: 'center', paddingHorizontal: 10, marginBottom: 12 },
  voiceTimerText: { fontSize: 24, fontWeight: '900', color: '#4F46E5', marginBottom: 16 },
  voiceCancelBtn: {
    paddingVertical: 10, paddingHorizontal: 20, borderRadius: 12, backgroundColor: '#F3F4F6',
  },
  voiceCancelText: { fontSize: 13, fontWeight: '700', color: '#4B5563' },

  // ── IMAGE SELECTOR STYLES ──
  imageSelectorCard: {
    width: 300,
    backgroundColor: '#FFF',
    borderRadius: 24,
    padding: 20,
  },
  imageCardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  imageCardTitle: { fontSize: 16, fontWeight: '800', color: '#1F2937' },
  imageCardSub: { fontSize: 12, color: '#6B7280', marginBottom: 16 },
  imagesPickerGrid: { flexDirection: 'row', justifyContent: 'center', gap: 20, paddingVertical: 10 },
  imageOption: { alignItems: 'center', gap: 6 },
  imagePlaceholderBox: {
    width: 80, height: 80, borderRadius: 16, backgroundColor: '#F3F4F6',
    justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: '#E5E7EB',
  },
  imageOptionText: { fontSize: 12, fontWeight: '700', color: '#374151' },

  // ── BOOKING CARD STYLES ──
  bookingCard: {
    width: Dimensions.get('window').width - 32,
    maxHeight: '85%',
    backgroundColor: '#FFF',
    borderRadius: 28,
    padding: 20,
    flexDirection: 'column',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.2,
    shadowRadius: 20,
    elevation: 12,
  },
  bookingScroll: {
    width: '100%',
    flexGrow: 1,
  },
  bookingScrollContent: {
    paddingBottom: 15,
  },
  bookingHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    borderBottomWidth: 1, borderBottomColor: '#F3F4F6', paddingBottom: 12, marginBottom: 14,
  },
  bookingHeaderTitle: { fontSize: 16, fontWeight: '800', color: '#1F2937' },
  miniMapWrapper: {
    height: 130, width: '100%', borderRadius: 18, overflow: 'hidden', borderWidth: 1, borderColor: '#E5E7EB', marginBottom: 14,
  },
  miniMap: { width: '100%', height: 130 },
  addressList: { backgroundColor: '#F9FAFB', borderRadius: 16, padding: 14, marginBottom: 14, position: 'relative' },
  addressItem: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  dotIndicator: { width: 10, height: 10, borderRadius: 5 },
  addressLabel: { fontSize: 10, fontWeight: '700', color: '#9CA3AF', textTransform: 'uppercase' },
  addressText: { fontSize: 13, color: '#1F2937', fontWeight: '600', marginTop: 1 },
  verticalLine: { width: 1.5, height: 16, backgroundColor: '#E5E7EB', marginLeft: 4, marginVertical: 3 },
  optionsRow: { flexDirection: 'column', gap: 14, marginBottom: 16 },
  optionBox: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  optionLabel: { fontSize: 13, fontWeight: '700', color: '#4B5563' },
  pillRow: { flexDirection: 'row', gap: 6 },
  pill: {
    paddingHorizontal: 10, paddingVertical: 6, borderRadius: 10, backgroundColor: '#F3F4F6',
    borderWidth: 1.5, borderColor: 'transparent',
  },
  pillSelected: { backgroundColor: '#EEF2FF', borderColor: '#4F46E5' },
  pillText: { fontSize: 10.5, fontWeight: '750', color: '#4B5563' },
  pillTextSelected: { color: '#4F46E5' },
  
  // Horizontal scrollable payment methods container
  paymentContainer: {
    flexDirection: 'column',
    gap: 8,
  },
  paymentScrollRow: {
    width: '100%',
  },
  paymentPill: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 12,
    backgroundColor: '#F3F4F6',
    borderWidth: 1.5,
    borderColor: 'transparent',
  },
  paymentPillSelected: {
    backgroundColor: '#EEF2FF',
    borderColor: '#4F46E5',
  },
  paymentPillText: {
    fontSize: 11,
    fontWeight: '750',
    color: '#4B5563',
  },
  paymentPillTextSelected: {
    color: '#4F46E5',
  },

  // Promo selector
  promoSelectorBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFF',
    borderWidth: 1.5,
    borderColor: '#E5E7EB',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  promoSelectorBtnText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#4F46E5',
  },

  fareContainer: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    backgroundColor: '#EEF2FF', padding: 14, borderRadius: 16, marginBottom: 18,
  },
  fareLabel: { fontSize: 13, fontWeight: '700', color: '#4F46E5' },
  fareOriginalAmount: {
    fontSize: 12,
    color: '#9CA3AF',
    textDecorationLine: 'line-through',
    marginBottom: 2,
  },
  fareAmount: { fontSize: 18, fontWeight: '950', color: '#4F46E5' },
  confirmBtn: {
    backgroundColor: '#4F46E5', height: 52, borderRadius: 16,
    justifyContent: 'center', alignItems: 'center',
    shadowColor: '#4F46E5', shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2, shadowRadius: 8, elevation: 4,
  },
  confirmBtnText: { color: '#FFF', fontSize: 15, fontWeight: '800', letterSpacing: 0.5 },

  // ── PROMO LIST POPUP STYLES ──
  promoListCard: {
    width: Dimensions.get('window').width - 32,
    backgroundColor: '#FFF',
    borderRadius: 24,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.15,
    shadowRadius: 16,
    elevation: 10,
  },
  promoHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    borderBottomWidth: 1, borderBottomColor: '#F3F4F6', paddingBottom: 12, marginBottom: 16,
  },
  promoHeaderTitle: { fontSize: 16, fontWeight: '800', color: '#1F2937' },
  promoItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 14,
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: '#E5E7EB',
    backgroundColor: '#FAF9FC',
    marginBottom: 10,
  },
  promoItemSelected: {
    borderColor: '#4F46E5',
    backgroundColor: '#EEF2FF',
  },
  promoItemLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  promoItemIconContainer: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: '#FFF',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  promoItemTitle: { fontSize: 13, fontWeight: '800', color: '#1F2937' },
  promoItemDesc: { fontSize: 10, color: '#6B7280', marginTop: 2 },
  promoItemRight: {
    alignItems: 'flex-end',
    marginLeft: 10,
  },
  promoItemDiscountText: { fontSize: 13, fontWeight: '800', color: '#10B981' },
});
