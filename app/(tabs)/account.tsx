import React, { useEffect, useState } from 'react';
import { StyleSheet, View, Text, ScrollView, TouchableOpacity, Alert, Modal, TextInput, KeyboardAvoidingView, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { User, Settings, CreditCard, Gift, ShieldCheck, HelpCircle, LogOut, ChevronRight, Check, X, Camera } from 'lucide-react-native';
import { Colors } from '@/constants/Colors';
import { useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import api from '@/services/api';
import { changePassword } from '@/features/auth/services/authApi';

const AVATAR_EMOJIS = ['🦊', '🐼', '🦁', '🦄', '🐱', '🦖', '🐻', '🐨', '🤖', '🐙'];

export default function AccountScreen() {
  const router = useRouter();
  const [userName, setUserName] = useState('Guest User');
  const [userEmail, setUserEmail] = useState('');
  const [userPhone, setUserPhone] = useState('');
  const [userAvatar, setUserAvatar] = useState('🦊');
  const [isAuth, setIsAuth] = useState(false);

  // Edit Modal States
  const [isEditModalVisible, setIsEditModalVisible] = useState(false);
  const [editName, setEditName] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [selectedAvatar, setSelectedAvatar] = useState('🦊');
  const [saveLoading, setSaveLoading] = useState(false);
  const [isPasswordModalVisible, setIsPasswordModalVisible] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordLoading, setPasswordLoading] = useState(false);

  const loadUser = async () => {
    const name = await AsyncStorage.getItem('user_name');
    const token = await AsyncStorage.getItem('access_token');
    const email = await AsyncStorage.getItem('user_email');
    const phone = await AsyncStorage.getItem('user_phone') || '';
    const avatar = await AsyncStorage.getItem('user_avatar') || '🦊';

    if (name) setUserName(name);
    if (email) setUserEmail(email);
    setUserPhone(phone);
    setUserAvatar(avatar);

    if (token) {
      setIsAuth(true);
      // Fetch live profile from backend
      try {
        const res = await api.get('/api/users/me/profile');
        const profile = res.data?.result || res.data;
        if (profile) {
          if (profile.fullName) {
            setUserName(profile.fullName);
            await AsyncStorage.setItem('user_name', profile.fullName);
          }
          if (profile.phoneNumber) {
            setUserPhone(profile.phoneNumber);
            await AsyncStorage.setItem('user_phone', profile.phoneNumber);
          }
        }
      } catch (e) {
        // silently fail — use cached info
        console.log('Profile fetch err:', e);
      }
    }
  };

  useEffect(() => {
    loadUser();
  }, []);

  const handleOpenEdit = () => {
    setEditName(userName);
    setEditPhone(userPhone);
    setSelectedAvatar(userAvatar);
    setIsEditModalVisible(true);
  };

  const handleSaveProfile = async () => {
    if (!editName.trim()) {
      Alert.alert('Lỗi', 'Họ tên không được để trống.');
      return;
    }
    setSaveLoading(true);
    try {
      // 1. Save locally to AsyncStorage for instant responsiveness
      await AsyncStorage.setItem('user_name', editName.trim());
      await AsyncStorage.setItem('user_phone', editPhone.trim());
      await AsyncStorage.setItem('user_avatar', selectedAvatar);

      // 2. Update state for immediate UI update
      setUserName(editName.trim());
      setUserPhone(editPhone.trim());
      setUserAvatar(selectedAvatar);

      // 3. Try to sync to Backend profile (non-blocking)
      try {
        await api.put('/api/users/me/profile', {
          fullName: editName.trim(),
          phoneNumber: editPhone.trim(),
        });
      } catch (err) {
        console.log('Failed to sync changes with backend. Saved locally.', err);
      }

      setIsEditModalVisible(false);
      Alert.alert('Thành công', 'Đã cập nhật thông tin tài khoản của bạn!');
    } catch (error) {
      console.error('Failed to save profile:', error);
      Alert.alert('Lỗi', 'Có lỗi xảy ra khi lưu thông tin.');
    } finally {
      setSaveLoading(false);
    }
  };

  const handleSavePassword = async () => {
    if (!currentPassword || !newPassword || !confirmPassword) {
      Alert.alert('Lỗi', 'Vui lòng nhập đầy đủ thông tin mật khẩu.');
      return;
    }
    if (newPassword !== confirmPassword) {
      Alert.alert('Lỗi', 'Mật khẩu nhập lại không khớp.');
      return;
    }

    setPasswordLoading(true);
    try {
      await changePassword({ currentPassword, newPassword });
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setIsPasswordModalVisible(false);
      Alert.alert('Thành công', 'Đã đổi mật khẩu thành công.');
    } catch (error: any) {
      Alert.alert('Lỗi', error.response?.data?.message || 'Không thể đổi mật khẩu.');
    } finally {
      setPasswordLoading(false);
    }
  };

  const handleLogout = async () => {
    Alert.alert(
      'Đăng xuất',
      'Bạn có chắc muốn đăng xuất không?',
      [
        { text: 'Huỷ', style: 'cancel' },
        {
          text: 'Đăng xuất',
          style: 'destructive',
          onPress: async () => {
            await AsyncStorage.clear();
            router.replace('/login');
          }
        },
      ]
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView showsVerticalScrollIndicator={false}>
        {/* Profile Header */}
        <View style={styles.profileHeader}>
          <TouchableOpacity 
            style={styles.avatarContainer}
            onPress={isAuth ? handleOpenEdit : undefined}
            activeOpacity={0.8}
          >
            <View style={styles.avatarEmojiWrapper}>
              <Text style={styles.avatarEmojiText}>{isAuth ? userAvatar : '👤'}</Text>
            </View>
            {isAuth && (
              <View style={styles.cameraIconBadge}>
                <Camera size={12} color="#FFF" />
              </View>
            )}
          </TouchableOpacity>

          <View style={styles.profileInfo}>
            <Text style={styles.profileName}>{isAuth ? userName : 'Chào mừng đến CAB'}</Text>
            {isAuth ? (
              <View>
                <Text style={styles.emailText}>{userEmail}</Text>
                {userPhone ? <Text style={styles.phoneText}>{userPhone}</Text> : null}
              </View>
            ) : (
              <Text style={styles.subtitleText}>Đăng nhập để tiếp tục</Text>
            )}
          </View>
          {isAuth && (
            <TouchableOpacity style={styles.editButton} onPress={handleOpenEdit}>
              <Settings size={22} color={Colors.light.primary} />
            </TouchableOpacity>
          )}
        </View>

        {!isAuth ? (
          <View style={{ paddingHorizontal: 20, marginTop: 10 }}>
            <TouchableOpacity
              style={[styles.logoutButton, { backgroundColor: Colors.light.primary, borderColor: Colors.light.primary, marginTop: 0 }]}
              onPress={() => router.push('/(auth)/login')}
            >
              <Text style={[styles.logoutText, { color: '#fff' }]}>Đăng nhập / Đăng ký</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.menuSection}>
            <Text style={styles.menuTitle}>Tài chính</Text>
            <MenuItem icon={<CreditCard size={20} color="#3B82F6" />} label="Phương thức thanh toán" />
            <MenuItem icon={<ShieldCheck size={20} color="#10B981" />} label="Đổi mật khẩu" onPress={() => setIsPasswordModalVisible(true)} />
          </View>
        )}

        <View style={styles.menuSection}>
          <Text style={styles.menuTitle}>Hỗ trợ</Text>
          <MenuItem icon={<ShieldCheck size={20} color="#10B981" />} label="Bảo mật & Quyền riêng tư" />
          <MenuItem icon={<HelpCircle size={20} color="#6B7280" />} label="Trung tâm trợ giúp" />
          <MenuItem icon={<Settings size={20} color="#4B5563" />} label="Cài đặt ứng dụng" />
        </View>

        {/* Logout */}
        {isAuth && (
          <TouchableOpacity style={styles.logoutButton} onPress={handleLogout}>
            <LogOut size={20} color={Colors.light.error} />
            <Text style={styles.logoutText}>Đăng xuất</Text>
          </TouchableOpacity>
        )}

        <View style={styles.versionContainer}>
          <Text style={styles.versionText}>CAB Booking v1.0.0</Text>
        </View>

        <View style={{ height: 50 }} />
      </ScrollView>

      {/* ── EDIT PROFILE & SELECT AVATAR MODAL ── */}
      <Modal
        visible={isEditModalVisible}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setIsEditModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            style={styles.modalContainer}
          >
            {/* Modal Header */}
            <View style={styles.modalHeader}>
              <TouchableOpacity onPress={() => setIsEditModalVisible(false)} style={styles.closeBtn}>
                <X size={24} color="#374151" />
              </TouchableOpacity>
              <Text style={styles.modalTitle}>Chỉnh sửa tài khoản</Text>
              <TouchableOpacity onPress={handleSaveProfile} style={styles.saveBtn}>
                <Check size={24} color={Colors.light.primary} />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.modalScroll}>
              {/* Avatar Selector Section */}
              <Text style={styles.fieldLabel}>Chọn Avatar hoạt hình dễ thương</Text>
              <View style={styles.avatarMainShowcase}>
                <Text style={styles.avatarMainShowcaseText}>{selectedAvatar}</Text>
              </View>

              <View style={styles.emojisGrid}>
                {AVATAR_EMOJIS.map((emoji) => {
                  const isSelected = selectedAvatar === emoji;
                  return (
                    <TouchableOpacity
                      key={emoji}
                      style={[styles.emojiItem, isSelected && styles.selectedEmojiItem]}
                      onPress={() => setSelectedAvatar(emoji)}
                      activeOpacity={0.7}
                    >
                      <Text style={styles.emojiText}>{emoji}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              {/* Form Inputs */}
              <View style={styles.inputGroup}>
                <Text style={styles.fieldLabel}>Họ và tên</Text>
                <TextInput
                  style={styles.textInput}
                  placeholder="Nhập họ và tên đầy đủ..."
                  placeholderTextColor="#9CA3AF"
                  value={editName}
                  onChangeText={setEditName}
                />
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.fieldLabel}>Số điện thoại</Text>
                <TextInput
                  style={styles.textInput}
                  placeholder="Nhập số điện thoại liên hệ..."
                  placeholderTextColor="#9CA3AF"
                  keyboardType="phone-pad"
                  value={editPhone}
                  onChangeText={setEditPhone}
                />
              </View>

              <TouchableOpacity 
                style={styles.saveActionButton}
                onPress={handleSaveProfile}
                activeOpacity={0.8}
              >
                <Text style={styles.saveActionButtonText}>Lưu Thay Đổi</Text>
              </TouchableOpacity>
            </ScrollView>
          </KeyboardAvoidingView>
        </View>
      </Modal>

      <Modal
        visible={isPasswordModalVisible}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setIsPasswordModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            style={styles.modalContainer}
          >
            <View style={styles.modalHeader}>
              <TouchableOpacity onPress={() => setIsPasswordModalVisible(false)} style={styles.closeBtn}>
                <X size={24} color="#374151" />
              </TouchableOpacity>
              <Text style={styles.modalTitle}>Đổi mật khẩu</Text>
              <TouchableOpacity onPress={handleSavePassword} style={styles.saveBtn} disabled={passwordLoading}>
                <Check size={24} color={Colors.light.primary} />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.modalScroll}>
              <View style={styles.inputGroup}>
                <Text style={styles.fieldLabel}>Mật khẩu hiện tại</Text>
                <TextInput
                  style={styles.textInput}
                  placeholder="Nhập mật khẩu hiện tại"
                  placeholderTextColor="#9CA3AF"
                  secureTextEntry
                  value={currentPassword}
                  onChangeText={setCurrentPassword}
                />
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.fieldLabel}>Mật khẩu mới</Text>
                <TextInput
                  style={styles.textInput}
                  placeholder="Nhập mật khẩu mới"
                  placeholderTextColor="#9CA3AF"
                  secureTextEntry
                  value={newPassword}
                  onChangeText={setNewPassword}
                />
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.fieldLabel}>Nhập lại mật khẩu mới</Text>
                <TextInput
                  style={styles.textInput}
                  placeholder="Nhập lại mật khẩu mới"
                  placeholderTextColor="#9CA3AF"
                  secureTextEntry
                  value={confirmPassword}
                  onChangeText={setConfirmPassword}
                />
              </View>

              <TouchableOpacity
                style={styles.saveActionButton}
                onPress={handleSavePassword}
                disabled={passwordLoading}
                activeOpacity={0.8}
              >
                <Text style={styles.saveActionButtonText}>{passwordLoading ? 'Đang lưu...' : 'Đổi mật khẩu'}</Text>
              </TouchableOpacity>
            </ScrollView>
          </KeyboardAvoidingView>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

function MenuItem({ icon, label, onPress }: { icon: React.ReactNode, label: string, onPress?: () => void }) {
  return (
    <TouchableOpacity style={styles.menuItem} onPress={onPress || (() => alert('Tính năng đang được phát triển'))}>
      <View style={styles.menuIconContainer}>
        {icon}
      </View>
      <Text style={styles.menuLabel}>{label}</Text>
      <ChevronRight size={18} color="#C7C7CC" />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FAF9FC', // Smooth premium background
  },
  profileHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 25,
    backgroundColor: '#FFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  avatarContainer: {
    position: 'relative',
  },
  avatarEmojiWrapper: {
    width: 74,
    height: 74,
    borderRadius: 37,
    backgroundColor: '#EEF2FF',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#6366F1',
  },
  avatarEmojiText: {
    fontSize: 40,
  },
  cameraIconBadge: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#6366F1',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: '#FFF',
  },
  profileInfo: {
    flex: 1,
    marginLeft: 20,
  },
  profileName: {
    fontSize: 20,
    fontWeight: '800',
    color: '#111827',
  },
  emailText: {
    fontSize: 13,
    color: '#6B7280',
    marginTop: 4,
    fontWeight: '500',
  },
  phoneText: {
    fontSize: 13,
    color: '#4B5563',
    marginTop: 2,
    fontWeight: '600',
  },
  subtitleText: {
    fontSize: 14,
    color: '#6B7280',
    marginTop: 4,
  },
  editButton: {
    width: 40,
    height: 40,
    backgroundColor: '#F3F4F6',
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  menuSection: {
    marginTop: 24,
    paddingHorizontal: 20,
  },
  menuTitle: {
    fontSize: 11,
    fontWeight: '700',
    color: '#9CA3AF',
    textTransform: 'uppercase',
    letterSpacing: 1.2,
    marginBottom: 8,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
    backgroundColor: '#FFF',
    paddingHorizontal: 16,
    borderRadius: 16,
    marginBottom: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.02,
    shadowRadius: 3,
  },
  menuIconContainer: {
    width: 24,
    alignItems: 'center',
  },
  menuLabel: {
    flex: 1,
    fontSize: 15,
    color: '#1F2937',
    marginLeft: 12,
    fontWeight: '600',
  },
  logoutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 32,
    paddingVertical: 16,
    marginHorizontal: 20,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#FCA5A5',
    backgroundColor: '#FEF2F2',
    gap: 8,
  },
  logoutText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#EF4444',
  },
  versionContainer: {
    alignItems: 'center',
    marginTop: 32,
    marginBottom: 16,
  },
  versionText: {
    fontSize: 12,
    color: '#9CA3AF',
    fontWeight: '500',
  },

  // ── MODAL STYLING ──
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modalContainer: {
    backgroundColor: '#FFF',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    maxHeight: '85%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 18,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  closeBtn: {
    padding: 4,
  },
  saveBtn: {
    padding: 4,
  },
  modalTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: '#1F2937',
  },
  modalScroll: {
    padding: 24,
  },
  fieldLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: '#4B5563',
    marginBottom: 8,
  },
  avatarMainShowcase: {
    width: 90,
    height: 90,
    borderRadius: 45,
    backgroundColor: '#F3F4F6',
    justifyContent: 'center',
    alignItems: 'center',
    alignSelf: 'center',
    borderWidth: 2,
    borderColor: '#6366F1',
    marginBottom: 16,
  },
  avatarMainShowcaseText: {
    fontSize: 48,
  },
  emojisGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 12,
    marginBottom: 24,
  },
  emojiItem: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: '#F3F4F6',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: 'transparent',
  },
  selectedEmojiItem: {
    backgroundColor: '#EEF2FF',
    borderColor: '#6366F1',
    transform: [{ scale: 1.1 }],
  },
  emojiText: {
    fontSize: 26,
  },
  inputGroup: {
    marginBottom: 20,
  },
  textInput: {
    backgroundColor: '#F9FAFB',
    borderColor: '#E5E7EB',
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 16,
    height: 50,
    fontSize: 15,
    color: '#1F2937',
  },
  saveActionButton: {
    backgroundColor: '#6366F1',
    height: 54,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 10,
    shadowColor: '#6366F1',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 3,
  },
  saveActionButtonText: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '700',
  }
});
