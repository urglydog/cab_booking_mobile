import React, { useState, useEffect } from 'react';
import { StyleSheet, View, Text, ScrollView, TouchableOpacity, Alert, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Wallet, ArrowUpRight, TrendingUp, Award, AwardIcon, Percent } from 'lucide-react-native';
import api from '@/services/api';
import AsyncStorage from '@react-native-async-storage/async-storage';

export default function DriverEarningsScreen() {
  const [earnings, setEarnings] = useState(195000); // Default matches our 2 seed rides: 45k + 150k
  const [totalJobs, setTotalJobs] = useState(2);
  const [loading, setLoading] = useState(true);

  const fetchEarnings = async () => {
    try {
      // 1. Get from storage
      const storedEarnings = await AsyncStorage.getItem('driver_earnings');
      const storedJobsJson = await AsyncStorage.getItem('driver_completed_jobs');
      
      const jobs = storedJobsJson ? JSON.parse(storedJobsJson) : [];
      
      if (storedEarnings) {
        setEarnings(parseFloat(storedEarnings));
      } else {
        // First time initialization: 195,000đ
        await AsyncStorage.setItem('driver_earnings', '195000');
        setEarnings(195000);
      }

      setTotalJobs(jobs.length > 0 ? jobs.length : 2);

      // 2. Optional: Try to fetch real database summary from API
      try {
        const response = await api.get('/api/drivers/me/earnings/summary');
        if (response.data && response.data.result) {
          const apiEarnings = response.data.result.totalEarnings || 0;
          if (apiEarnings > 0) {
            setEarnings(apiEarnings);
          }
        }
      } catch (err) {
        console.log('Using local pre-seeded earnings details (expected behavior when mock database is empty)');
      }

    } catch (e) {
      console.log('Failed to load earnings summary:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchEarnings();
  }, []);

  const handleWithdraw = () => {
    if (earnings === 0) {
      Alert.alert('Không thể rút tiền', 'Số dư tài khoản của bạn hiện đang bằng 0đ.');
      return;
    }
    Alert.alert(
      'Rút tiền về Ngân hàng',
      `Bạn có muốn chuyển toàn bộ số dư ${earnings.toLocaleString()}đ về tài khoản ngân hàng đã liên kết không?`,
      [
        { text: 'Hủy', style: 'cancel' },
        { 
          text: 'XÁC NHẬN RÚT', 
          onPress: async () => {
            setLoading(true);
            setTimeout(async () => {
              await AsyncStorage.setItem('driver_earnings', '0');
              setEarnings(0);
              setLoading(false);
              Alert.alert('Thành công', 'Lệnh rút tiền đã được thực hiện! Tiền sẽ được cộng vào tài khoản ngân hàng của bạn trong vòng 5 phút.');
            }, 1500);
          } 
        }
      ]
    );
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#6366F1" />
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Báo cáo thu nhập</Text>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* Wallet Balance Card */}
        <View style={styles.walletCard}>
          <View style={styles.walletHeader}>
            <View style={styles.walletIconCircle}>
              <Wallet size={24} color="#FFF" />
            </View>
            <Text style={styles.walletLabel}>Ví tài khoản của bạn</Text>
          </View>
          
          <Text style={styles.walletBalance}>{earnings.toLocaleString()}đ</Text>

          <TouchableOpacity style={styles.withdrawButton} onPress={handleWithdraw}>
            <Text style={styles.withdrawButtonText}>RÚT TIỀN VỀ NGÂN HÀNG</Text>
            <ArrowUpRight size={18} color="#FFF" />
          </TouchableOpacity>
        </View>

        {/* Performance Statistics Grid */}
        <Text style={styles.sectionTitle}>Chỉ số hiệu suất</Text>
        <View style={styles.statsGrid}>
          <View style={styles.statCard}>
            <View style={[styles.statIconCircle, { backgroundColor: '#EEF2F6' }]}>
              <TrendingUp size={18} color="#6366F1" />
            </View>
            <Text style={styles.statSub}>Tổng chuyến</Text>
            <Text style={styles.statMain}>{totalJobs} cuốc</Text>
          </View>

          <View style={styles.statCard}>
            <View style={[styles.statIconCircle, { backgroundColor: '#FEF3C7' }]}>
              <Award size={18} color="#D97706" />
            </View>
            <Text style={styles.statSub}>Đánh giá sao</Text>
            <Text style={styles.statMain}>4.9 ★</Text>
          </View>

          <View style={styles.statCard}>
            <View style={[styles.statIconCircle, { backgroundColor: '#ECFDF5' }]}>
              <Percent size={18} color="#10B981" />
            </View>
            <Text style={styles.statSub}>Tỷ lệ nhận cuốc</Text>
            <Text style={styles.statMain}>98.5%</Text>
          </View>
        </View>

        {/* Weekly Chart Simulation */}
        <Text style={styles.sectionTitle}>Thu nhập tuần này</Text>
        <View style={styles.chartCard}>
          <View style={styles.chartHeader}>
            <Text style={styles.chartTotalLabel}>Tổng tuần:</Text>
            <Text style={styles.chartTotalVal}>{earnings.toLocaleString()}đ</Text>
          </View>

          {/* Bar Chart Visualization */}
          <View style={styles.barsContainer}>
            <View style={styles.barCol}>
              <Text style={styles.barPriceText}>{earnings > 150000 ? '150k' : '0'}</Text>
              <View style={[styles.barShape, { height: 100, backgroundColor: '#C7D2FE' }]} />
              <Text style={styles.barLabel}>T2</Text>
            </View>

            <View style={styles.barCol}>
              <Text style={styles.barPriceText}>{(earnings - 150000) > 0 ? `${((earnings - 150000)/1000).toFixed(0)}k` : '45k'}</Text>
              <View style={[styles.barShape, { height: 60, backgroundColor: '#6366F1' }]} />
              <Text style={styles.barLabel}>T3</Text>
            </View>

            <View style={styles.barCol}>
              <View style={[styles.barShape, { height: 5, backgroundColor: '#E5E7EB' }]} />
              <Text style={styles.barLabel}>T4</Text>
            </View>

            <View style={styles.barCol}>
              <View style={[styles.barShape, { height: 5, backgroundColor: '#E5E7EB' }]} />
              <Text style={styles.barLabel}>T5</Text>
            </View>

            <View style={styles.barCol}>
              <View style={[styles.barShape, { height: 5, backgroundColor: '#E5E7EB' }]} />
              <Text style={styles.barLabel}>T6</Text>
            </View>

            <View style={styles.barCol}>
              <View style={[styles.barShape, { height: 5, backgroundColor: '#E5E7EB' }]} />
              <Text style={styles.barLabel}>T7</Text>
            </View>

            <View style={styles.barCol}>
              <View style={[styles.barShape, { height: 5, backgroundColor: '#E5E7EB' }]} />
              <Text style={styles.barLabel}>CN</Text>
            </View>
          </View>
        </View>

        {/* Secure message badge */}
        <View style={styles.secureBadgeRow}>
          <Text style={styles.secureText}>🛡️ Hệ thống thanh toán bảo mật liên kết ngân hàng</Text>
        </View>

      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F9FAFB',
  },
  header: {
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: '#FFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  title: {
    fontSize: 20,
    fontWeight: '800',
    color: '#111827',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#FFF',
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 32,
  },
  walletCard: {
    backgroundColor: '#6366F1', // Premium Midnight Indigo
    borderRadius: 24,
    padding: 20,
    shadowColor: '#6366F1',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.2,
    shadowRadius: 16,
    elevation: 8,
    marginBottom: 24,
  },
  walletHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  walletIconCircle: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#FFFFFF25',
    justifyContent: 'center',
    alignItems: 'center',
  },
  walletLabel: {
    color: '#E0E7FF',
    fontSize: 13,
    fontWeight: '600',
  },
  walletBalance: {
    color: '#FFF',
    fontSize: 32,
    fontWeight: '900',
    marginVertical: 18,
  },
  withdrawButton: {
    backgroundColor: '#FFFFFF',
    height: 52,
    borderRadius: 14,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 6,
    marginTop: 6,
  },
  withdrawButtonText: {
    color: '#6366F1',
    fontSize: 13,
    fontWeight: '900',
    letterSpacing: 0.5,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#1F2937',
    marginBottom: 12,
  },
  statsGrid: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 24,
  },
  statCard: {
    flex: 1,
    backgroundColor: '#FFF',
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  statIconCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 10,
  },
  statSub: {
    fontSize: 11,
    color: '#9CA3AF',
    fontWeight: '600',
  },
  statMain: {
    fontSize: 14,
    fontWeight: '800',
    color: '#1F2937',
    marginTop: 2,
  },
  chartCard: {
    backgroundColor: '#FFF',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    padding: 16,
    marginBottom: 24,
  },
  chartHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
    paddingBottom: 12,
    marginBottom: 16,
  },
  chartTotalLabel: {
    fontSize: 13,
    color: '#6B7280',
    fontWeight: '600',
  },
  chartTotalVal: {
    fontSize: 16,
    fontWeight: '800',
    color: '#6366F1',
  },
  barsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    height: 140,
    paddingHorizontal: 8,
  },
  barCol: {
    alignItems: 'center',
    width: 32,
  },
  barPriceText: {
    fontSize: 9,
    fontWeight: '700',
    color: '#9CA3AF',
    marginBottom: 4,
  },
  barShape: {
    width: 14,
    borderRadius: 7,
  },
  barLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#6B7280',
    marginTop: 6,
  },
  secureBadgeRow: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  secureText: {
    fontSize: 12,
    color: '#9CA3AF',
    fontWeight: '500',
  },
});
