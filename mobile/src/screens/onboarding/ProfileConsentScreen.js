import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  SafeAreaView,
  Platform,
  Alert,
  ActivityIndicator,
} from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import { Colors, Fonts } from '../../theme/tokens';
import { apiRequest, AuthUrls, refreshCsrfToken } from '../../api/client';

const CONSENT_ITEMS = [
  {
    key: 'TERMS',
    title: '이용약관 동의',
    subtitle: '필수 · 서비스 이용 규칙과 회원 의무',
  },
  {
    key: 'PRIVACY',
    title: '개인정보 처리방침 동의',
    subtitle: '필수 · 이메일, 닉네임, 측정 시간·수면 시간대',
  },
  {
    key: 'AGE_14',
    title: '만 14세 이상입니다',
    subtitle: '필수 · 만 14세 미만은 가입할 수 없어요',
  },
  {
    key: 'SENSITIVE_HRV',
    title: '건강정보 처리 동의',
    subtitle: '필수 · · 심박 측정값(HRV), 아침 체크 응답, 번아웃 체크 · 영상은 저장하지 않음',
  },
  {
    key: 'CALENDAR',
    title: 'Google 캘린더 연동 동의',
    subtitle: '필수 · 일정 읽기 + 내가 승인한 일정 추가',
  },
  {
    key: 'AI_NOTICE',
    title: 'AI 활용 안내 동의',
    subtitle: '필수 · 일정 요약과 휴식 제안 생성',
  },
];

const CONSENT_VERSION = '2026-11-01';

export default function ProfileConsentScreen({ userEmail, initialNickname, onCompleted, onBack }) {
  const [nickname, setNickname] = useState(initialNickname || '');
  const [consents, setConsents] = useState({
    TERMS: false,
    PRIVACY: false,
    AGE_14: false,
    SENSITIVE_HRV: false,
    CALENDAR: false,
    AI_NOTICE: false,
  });
  const [fieldErrors, setFieldErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);

  const agreedCount = Object.values(consents).filter(Boolean).length;
  const allAgreed = agreedCount === CONSENT_ITEMS.length;
  const trimmedNickname = nickname.trim();
  const isFormValid = trimmedNickname.length >= 1 && trimmedNickname.length <= 20 && allAgreed;

  const toggleAll = () => {
    const nextValue = !allAgreed;
    const updated = {};
    CONSENT_ITEMS.forEach((item) => {
      updated[item.key] = nextValue;
    });
    setConsents(updated);
    setFieldErrors({});
  };

  const toggleSingle = (key) => {
    setConsents((prev) => ({ ...prev, [key]: !prev[key] }));
    setFieldErrors((prev) => ({ ...prev, [`consents.${key}`]: null }));
  };

  const handleSubmit = async () => {
    if (!isFormValid || submitting) return;
    setSubmitting(true);
    setFieldErrors({});

    try {
      const res = await apiRequest('/api/onboarding/profile', {
        method: 'PUT',
        body: {
          nickname: trimmedNickname,
          consents,
          consentVersion: CONSENT_VERSION,
        },
      });

      // 캘린더 권한이 아직 없으면 Google 캘린더 권한 동의 흐름으로 이동
      if (res?.calendarAuthUrl) {
        const targetUrl = res.calendarAuthUrl.startsWith('http')
          ? res.calendarAuthUrl
          : AuthUrls.googleCalendar;

        if (Platform.OS === 'web') {
          window.location.href = targetUrl;
          return;
        }

        await WebBrowser.openAuthSessionAsync(targetUrl, 'comedown://oauth-callback');
        await refreshCsrfToken();
      }

      onCompleted(res?.onboardingStep || 'CBI');
    } catch (err) {
      if (err.fieldErrors && err.fieldErrors.length > 0) {
        const errMap = {};
        err.fieldErrors.forEach((fe) => {
          errMap[fe.field] = fe.message;
        });
        setFieldErrors(errMap);
      } else {
        Alert.alert('저장 실패', err.message);
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* 상단 네비게이션 및 진행 바 */}
      <View style={styles.header}>
        <TouchableOpacity onPress={onBack} style={styles.backButton}>
          <Text style={styles.backArrow}>←</Text>
        </TouchableOpacity>
        <View style={styles.progressTrack}>
          <View style={[styles.progressFill, { width: '100%' }]} />
        </View>
        <Text style={styles.stepIndicator}>2 / 2</Text>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <Text style={styles.title}>거의 다 됐어요</Text>
        <Text style={styles.subtitle}>닉네임을 정하고 동의 항목을 확인해 주세요</Text>

        {/* 연결된 구글 계정 표시 */}
        <View style={styles.emailBox}>
          <View style={styles.emailLeft}>
            <Text style={styles.googleBadge}>G</Text>
            <Text style={styles.emailText} numberOfLines={1}>
              {userEmail || '연결된 계정'}
            </Text>
          </View>
          <View style={styles.connectedPill}>
            <Text style={styles.connectedPillText}>연결됨</Text>
          </View>
        </View>

        {/* 닉네임 입력 */}
        <View style={styles.inputSection}>
          <View style={styles.labelRow}>
            <Text style={styles.inputLabel}>닉네임</Text>
            <Text style={styles.requiredTag}>필수</Text>
          </View>
          <View
            style={[
              styles.inputWrapper,
              fieldErrors.nickname ? styles.inputWrapperError : null,
            ]}
          >
            <TextInput
              style={styles.textInput}
              value={nickname}
              onChangeText={(text) => {
                setNickname(text);
                if (fieldErrors.nickname) {
                  setFieldErrors((prev) => ({ ...prev, nickname: null }));
                }
              }}
              placeholder="닉네임을 입력해 주세요"
              placeholderTextColor={Colors.textMuted}
              maxLength={10}
            />
            <Text style={styles.charCounter}>{nickname.length}/10</Text>
          </View>
          {fieldErrors.nickname ? (
            <Text style={styles.fieldErrorText}>{fieldErrors.nickname}</Text>
          ) : (
            <Text style={styles.helperText}>
              아침 체크와 주간 리포트에 표시되는 이름이에요
            </Text>
          )}
        </View>

        {/* 전체 동의 카드 */}
        <TouchableOpacity
          style={[styles.agreeAllCard, allAgreed && styles.agreeAllCardActive]}
          onPress={toggleAll}
          activeOpacity={0.85}
        >
          <View style={styles.agreeAllLeft}>
            <View style={[styles.checkbox, allAgreed && styles.checkboxChecked]}>
              {allAgreed && <Text style={styles.checkmark}>✓</Text>}
            </View>
            <View style={styles.agreeAllTexts}>
              <Text style={styles.agreeAllTitle}>전체 동의</Text>
              <Text style={styles.agreeAllSubtitle}>
                아래 필수 항목 {CONSENT_ITEMS.length}개에 모두 동의합니다
              </Text>
            </View>
          </View>
          <Text style={styles.agreeCountText}>
            {agreedCount} / {CONSENT_ITEMS.length}
          </Text>
        </TouchableOpacity>

        {/* 개별 동의 리스트 (6종) */}
        <View style={styles.consentList}>
          {CONSENT_ITEMS.map((item) => {
            const checked = consents[item.key];
            const errorMsg = fieldErrors[`consents.${item.key}`];
            return (
              <View key={item.key}>
                <TouchableOpacity
                  style={[
                    styles.consentRow,
                    errorMsg ? styles.consentRowError : null,
                  ]}
                  onPress={() => toggleSingle(item.key)}
                  activeOpacity={0.8}
                >
                  <View style={[styles.checkbox, checked && styles.checkboxChecked]}>
                    {checked && <Text style={styles.checkmark}>✓</Text>}
                  </View>
                  <View style={styles.consentInfo}>
                    <Text style={styles.consentTitle}>{item.title}</Text>
                    <Text style={styles.consentSubtitle}>{item.subtitle}</Text>
                  </View>
                  {item.key !== 'AGE_14' && (
                    <Text style={styles.viewDetailText}>보기</Text>
                  )}
                </TouchableOpacity>
                {errorMsg && <Text style={styles.fieldErrorText}>{errorMsg}</Text>}
              </View>
            );
          })}
        </View>
      </ScrollView>

      {/* 하단 버튼 */}
      <View style={styles.footer}>
        <TouchableOpacity
          style={[styles.submitButton, (!isFormValid || submitting) && styles.submitButtonDisabled]}
          disabled={!isFormValid || submitting}
          onPress={handleSubmit}
          activeOpacity={0.85}
        >
          {submitting ? (
            <ActivityIndicator color={Colors.primaryText} />
          ) : (
            <Text style={styles.submitButtonText}>동의하고 시작하기</Text>
          )}
        </TouchableOpacity>
        <Text style={styles.footerNote}>동의는 언제든 설정에서 철회할 수 있어요</Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 14,
  },
  backButton: {
    padding: 4,
    marginRight: 12,
  },
  backArrow: {
    fontSize: 20,
    color: Colors.textPrimary,
  },
  progressTrack: {
    flex: 1,
    height: 3,
    backgroundColor: Colors.border,
    borderRadius: 2,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: Colors.primary,
  },
  stepIndicator: {
    marginLeft: 12,
    fontSize: 12,
    color: Colors.textSecondary,
    fontWeight: '600',
  },
  scrollContent: {
    paddingHorizontal: 24,
    paddingTop: 12,
    paddingBottom: 32,
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: Colors.textPrimary,
    letterSpacing: -0.6,
    marginBottom: 6,
  },
  subtitle: {
    fontSize: 14,
    fontWeight: '400',
    color: Colors.textSecondary,
    marginBottom: 22,
  },
  emailBox: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 12,
    paddingHorizontal: 17,
    height: 52,
    marginBottom: 22,
  },
  emailLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    marginRight: 8,
  },
  googleBadge: {
    fontSize: 15,
    fontWeight: '700',
    color: Colors.textPrimary,
    marginRight: 10,
  },
  emailText: {
    fontSize: 13,
    color: Colors.textPrimary,
    fontWeight: '500',
  },
  connectedPillText: {
    fontSize: 12,
    color: '#57735C',
    fontWeight: '600',
  },
  inputSection: {
    marginBottom: 22,
  },
  labelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  inputLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.textPrimary,
    marginRight: 6,
  },
  requiredTag: {
    fontSize: 12,
    fontWeight: '500',
    color: Colors.textSecondary,
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 12,
    paddingHorizontal: 16,
    height: 52,
  },
  inputWrapperError: {
    borderColor: Colors.warningText,
  },
  textInput: {
    flex: 1,
    fontSize: 15,
    fontWeight: '500',
    color: Colors.textPrimary,
  },
  charCounter: {
    fontSize: 12,
    color: Colors.textMuted,
    marginLeft: 8,
  },
  helperText: {
    fontSize: 12,
    fontWeight: '400',
    color: Colors.textMuted,
    marginTop: 10,
    letterSpacing: -0.3,
  },
  fieldErrorText: {
    fontSize: 12,
    color: Colors.warningText,
    marginTop: 4,
    marginBottom: 4,
  },
  agreeAllCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
  },
  agreeAllCardActive: {
    backgroundColor: Colors.surfaceAccent,
    borderColor: Colors.primary,
  },
  agreeAllLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  agreeAllTexts: {
    marginLeft: 12,
  },
  agreeAllTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  agreeAllSubtitle: {
    fontSize: 12,
    foweight: '400',
    color: Colors.textSecondary,
    marginTop: 2,
  },
  agreeCountText: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.primary,
  },
  consentList: {
    gap: 8,
  },
  consentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  consentRowError: {
    borderColor: Colors.warningText,
  },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxChecked: {
    backgroundColor: '#5F7D64',
    borderColor: '#5F7D64',
  },
  checkmark: {
    color: Colors.primaryText,
    fontSize: 13,
    fontWeight: '700',
  },
  consentInfo: {
    flex: 1,
    marginLeft: 12,
  },
  consentTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.textPrimary,
  },
  consentSubtitle: {
    fontSize: 12,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  viewDetailText: {
    fontSize: 12,
    color: Colors.textMuted,
    marginLeft: 8,
  },
  footer: {
    paddingHorizontal: 24,
    paddingTop: 12,
    paddingBottom: 20,
    backgroundColor: Colors.background,
  },
  submitButton: {
    backgroundColor: Colors.primary,
    height: 56,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },
  submitButtonDisabled: {
    opacity: 0.45,
  },
  submitButtonText: {
    color: Colors.primaryText,
    fontSize: 16,
    fontWeight: '600',
  },
  footerNote: {
    textAlign: 'center',
    fontSize: 12,
    color: Colors.textMuted,
    marginTop: 6,
    marginBottom: 18,
  },
});