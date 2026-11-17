import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  Platform,
  Alert,
} from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import { Colors } from '../../theme/tokens';
import { AuthUrls, refreshCsrfToken } from '../../api/client';

export default function WelcomeScreen({ onAuthSuccess, authError, onDevSkip }) {
  const handleGoogleLogin = async () => {
    try {
      if (Platform.OS === 'web') {
        window.location.href = AuthUrls.googleLogin;
        return;
      }

      const result = await WebBrowser.openAuthSessionAsync(
        AuthUrls.googleLogin,
        'comedown://oauth-callback'
      );

      if (result.type === 'success' || result.type === 'dismiss') {
        await refreshCsrfToken();
        await onAuthSuccess();
      }
    } catch (e) {
      Alert.alert('로그인 오류', 'Google 로그인을 시작할 수 없습니다. 다시 시도해 주세요.');
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        <View style={styles.logoSection}>
          <View style={styles.logoIconBox}>
            <View style={styles.logoSun} />
            <View style={styles.logoHill} />
          </View>
          <Text style={styles.brandName}>Come & Down</Text>
        </View>

        <View style={styles.copySection}>
          <View style={styles.accentDash} />
          <Text style={styles.headline}>번아웃,{'\n'}오기 전에 막아요</Text>
          <Text style={styles.subheadline}>
            캘린더와 아침 1분 체크로{'\n'}쉬는 시간을 일정에 넣어드려요
          </Text>
        </View>

        {authError && (
          <View style={styles.errorBanner}>
            <Text style={styles.errorText}>
              로그인 또는 권한 연결이 취소되었어요. 다시 시도해 주세요.
            </Text>
          </View>
        )}
      </View>

      <View style={styles.footer}>
        <TouchableOpacity
          style={styles.primaryButton}
          activeOpacity={0.85}
          onPress={handleGoogleLogin}
        >
          <Text style={styles.googleIcon}>G</Text>
          <Text style={styles.primaryButtonText}>Google로 시작하기</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.secondaryButton}
          activeOpacity={0.85}
          onPress={handleGoogleLogin}
        >
          <Text style={styles.secondaryButtonText}>
            이미 계정이 있어요 · <Text style={styles.secondaryButtonBold}>로그인</Text>
          </Text>
        </TouchableOpacity>

        <Text style={styles.disclaimer}>
          의료기기가 아니며 질병 유무를 판단하지 않아요
        </Text>

        {__DEV__ && onDevSkip && (
          <TouchableOpacity style={styles.devSkipBtn} onPress={onDevSkip}>
            <Text style={styles.devSkipText}>[DEV] 로그인 건너뛰기 →</Text>
          </TouchableOpacity>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
    justifyContent: 'space-between',
  },
  content: {
    flex: 1,
    paddingHorizontal: 28,
    paddingTop: 56,
  },
  logoSection: {
    alignItems: 'center',
    marginBottom: 64,
  },
  logoIconBox: {
    width: 64,
    height: 64,
    borderRadius: 18,
    backgroundColor: '#F3DFD3',
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'flex-end',
    marginBottom: 12,
  },
  logoSun: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#E5B299',
    marginBottom: -8,
  },
  logoHill: {
    width: 72,
    height: 26,
    borderTopLeftRadius: 36,
    borderTopRightRadius: 36,
    backgroundColor: Colors.primary,
  },
  brandName: {
    fontSize: 18,
    fontWeight: '700',
    color: Colors.textPrimary,
    letterSpacing: -0.3,
  },
  copySection: {
    marginTop: 12,
  },
  accentDash: {
    width: 20,
    height: 3,
    borderRadius: 2,
    backgroundColor: '#E5B299',
    marginBottom: 16,
  },
  headline: {
    fontSize: 30,
    fontWeight: '700',
    color: Colors.textPrimary,
    lineHeight: 40,
    letterSpacing: -0.6,
    marginBottom: 14,
  },
  subheadline: {
    fontSize: 15,
    color: Colors.textSecondary,
    lineHeight: 23,
  },
  errorBanner: {
    marginTop: 20,
    padding: 12,
    borderRadius: 12,
    backgroundColor: Colors.warningBg,
  },
  errorText: {
    fontSize: 13,
    color: Colors.warningText,
  },
  footer: {
    paddingHorizontal: 24,
    paddingBottom: 24,
  },
  primaryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.primary,
    height: 54,
    borderRadius: 14,
    marginBottom: 10,
  },
  googleIcon: {
    color: Colors.primaryText,
    fontSize: 17,
    fontWeight: '700',
    marginRight: 10,
  },
  primaryButtonText: {
    color: Colors.primaryText,
    fontSize: 16,
    fontWeight: '600',
  },
  secondaryButton: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    height: 52,
    borderRadius: 14,
    marginBottom: 18,
  },
  secondaryButtonText: {
    fontSize: 14,
    color: Colors.textSecondary,
  },
  secondaryButtonBold: {
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  disclaimer: {
    textAlign: 'center',
    fontSize: 12,
    color: Colors.textMuted,
  },
  devSkipBtn: {
    marginTop: 14,
    paddingVertical: 8,
    alignItems: 'center',
  },
  devSkipText: {
    fontSize: 12,
    color: Colors.textSecondary,
    textDecorationLine: 'underline',
  },
});