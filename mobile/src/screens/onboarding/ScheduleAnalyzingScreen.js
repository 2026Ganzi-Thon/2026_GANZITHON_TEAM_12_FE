import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  Platform,
  ActivityIndicator,
} from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import { Colors } from '../../theme/tokens';
import { apiRequest, AuthUrls, refreshCsrfToken, ApiError } from '../../api/client';

export default function ScheduleAnalyzingScreen({
  onCancel,
  onSuccess,
  onNeedConsentStep,
}) {
  // 0: 일정 불러오기 진행, 1: 분류 진행, 2: 회복 시간 찾기 진행, 3: 모두 완료
  const [stage, setStage] = useState(0);
  const [errorState, setErrorState] = useState(null);

  const runCalendarSync = useCallback(async () => {
    setErrorState(null);
    setStage(0);

    const timer1 = setTimeout(() => setStage((s) => Math.max(s, 1)), 900);
    const timer2 = setTimeout(() => setStage((s) => Math.max(s, 2)), 2000);

    try {
      await apiRequest('/api/calendar/sync', { method: 'POST' });
      clearTimeout(timer1);
      clearTimeout(timer2);
      setStage(3);
      setTimeout(() => {
        onSuccess();
      }, 450);
    } catch (err) {
      clearTimeout(timer1);
      clearTimeout(timer2);

      if (err instanceof ApiError) {
        if (err.code === 'ONBOARDING_STEP_INVALID') {
          setErrorState({
            type: 'CONSENT',
            message: err.message || '캘린더 이용 동의를 먼저 완료해 주세요.',
          });
          return;
        }
        if (
          err.code === 'CALENDAR_NOT_CONNECTED' ||
          err.code === 'CALENDAR_SCOPE_MISSING' ||
          err.code === 'CALENDAR_REAUTH_REQUIRED'
        ) {
          setErrorState({
            type: 'CALENDAR_AUTH',
            message: err.message || 'Google 캘린더 권한 연결이 필요해요.',
          });
          return;
        }
      }

      setErrorState({
        type: 'RETRY',
        message: err.message || '일정 분석 중 문제가 발생했어요.',
      });
    }
  }, [onSuccess]);

  useEffect(() => {
    runCalendarSync();
  }, [runCalendarSync]);

  const handleConnectCalendar = async () => {
    if (Platform.OS === 'web') {
      window.location.href = AuthUrls.googleCalendar;
      return;
    }
    await WebBrowser.openAuthSessionAsync(
      AuthUrls.googleCalendar,
      'comedown://oauth-callback'
    );
    await refreshCsrfToken();
    runCalendarSync();
  };

  const steps = [
    { label: '구글 캘린더 일정 불러오기', doneAt: 1, activeAt: 0 },
    { label: '수업·과제 일정 확인하기', doneAt: 2, activeAt: 1 },
    { label: '회복 시간 찾기', doneAt: 3, activeAt: 2 },
  ];

  return (
    <SafeAreaView style={styles.container}>
      {/* 상단 진행 바 */}
      <View style={styles.header}>
        <TouchableOpacity onPress={onCancel} style={styles.backButton}>
          <Text style={styles.backArrow}>←</Text>
        </TouchableOpacity>
        <View style={styles.progressTrack}>
          <View style={[styles.progressFill, { width: '80%' }]} />
        </View>
        <Text style={styles.stepIndicator}>4 / 5</Text>
      </View>

      <View style={styles.centerBody}>
        {/* 원형 캘린더 아이콘 영역 */}
        <View style={styles.pulseCircle}>
          <View style={styles.calendarIconBox}>
            <Text style={styles.calendarIconText}>📅</Text>
          </View>
        </View>

        <Text style={styles.title}>일정을 분석하고 있어요</Text>
        <Text style={styles.subtitle}>
          구글 캘린더 일정과 수업·과제 마감을 함께 살펴보고{'\n'}회복할 틈을 찾는 중이에요
        </Text>

        {/* 3단계 체크 카드 */}
        <View style={styles.stepsCard}>
          {steps.map((item, idx) => {
            const isDone = stage >= item.doneAt;
            const isActive = !errorState && stage === item.activeAt;
            return (
              <View
                key={item.label}
                style={[
                  styles.stepRow,
                  idx < steps.length - 1 && styles.stepRowDivider,
                ]}
              >
                <View style={styles.stepLeft}>
                  <View
                    style={[
                      styles.statusDot,
                      isDone && styles.statusDotDone,
                      isActive && styles.statusDotActive,
                    ]}
                  >
                    {isDone && <Text style={styles.statusCheck}>✓</Text>}
                  </View>
                  <Text
                    style={[
                      styles.stepLabel,
                      (isDone || isActive) && styles.stepLabelHighlight,
                    ]}
                  >
                    {item.label}
                  </Text>
                </View>

                {isDone ? (
                  <Text style={styles.statusTextDone}>완료</Text>
                ) : isActive ? (
                  <View style={styles.activeStatusRow}>
                    <ActivityIndicator size="small" color={Colors.primary} />
                    <Text style={styles.statusTextActive}>진행 중</Text>
                  </View>
                ) : (
                  <Text style={styles.statusTextPending}>대기 중</Text>
                )}
              </View>
            );
          })}
        </View>

        {/* 오류 발생 시 복구 액션 */}
        {errorState && (
          <View style={styles.errorCard}>
            <Text style={styles.errorMessage}>{errorState.message}</Text>
            {errorState.type === 'CONSENT' ? (
              <TouchableOpacity style={styles.retryBtn} onPress={onNeedConsentStep}>
                <Text style={styles.retryBtnText}>동의 단계로 이동</Text>
              </TouchableOpacity>
            ) : errorState.type === 'CALENDAR_AUTH' ? (
              <TouchableOpacity style={styles.retryBtn} onPress={handleConnectCalendar}>
                <Text style={styles.retryBtnText}>Google 캘린더 연결하기</Text>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity style={styles.retryBtn} onPress={runCalendarSync}>
                <Text style={styles.retryBtnText}>다시 분석하기</Text>
              </TouchableOpacity>
            )}
          </View>
        )}
      </View>

      <View style={styles.footer}>
        <Text style={styles.footerNote}>
          보통 10초 안에 끝나요. 분석이 끝나면 바로 결과 화면으로 넘어갈게요
        </Text>
        <TouchableOpacity onPress={onCancel} style={styles.cancelBtn}>
          <Text style={styles.cancelBtnText}>분석 취소</Text>
        </TouchableOpacity>
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
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 14,
  },
  backButton: { padding: 4, marginRight: 12 },
  backArrow: { fontSize: 20, color: Colors.textPrimary },
  progressTrack: {
    flex: 1,
    height: 3,
    backgroundColor: Colors.border,
    borderRadius: 2,
    overflow: 'hidden',
  },
  progressFill: { height: '100%', backgroundColor: Colors.primary },
  stepIndicator: {
    marginLeft: 12,
    fontSize: 12,
    color: Colors.textSecondary,
    fontWeight: '600',
  },
  centerBody: {
    paddingHorizontal: 24,
    alignItems: 'center',
  },
  pulseCircle: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: Colors.surfaceAccent,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 24,
  },
  calendarIconBox: {
    width: 52,
    height: 52,
    borderRadius: 16,
    backgroundColor: Colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  calendarIconText: { fontSize: 24 },
  title: {
    fontSize: 23,
    fontWeight: '700',
    color: Colors.textPrimary,
    marginBottom: 10,
  },
  subtitle: {
    fontSize: 14,
    color: Colors.textSecondary,
    textAlign: 'center',
    lineHeight: 21,
    marginBottom: 28,
  },
  stepsCard: {
    width: '100%',
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 16,
    paddingHorizontal: 18,
  },
  stepRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 16,
  },
  stepRowDivider: {
    borderBottomWidth: 1,
    borderBottomColor: Colors.surfaceMuted,
  },
  stepLeft: { flexDirection: 'row', alignItems: 'center' },
  statusDot: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 1.5,
    borderColor: Colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  statusDotDone: {
    backgroundColor: Colors.accentBar,
    borderColor: Colors.accentBar,
  },
  statusDotActive: {
    borderColor: Colors.primary,
  },
  statusCheck: { color: Colors.primaryText, fontSize: 11, fontWeight: '700' },
  stepLabel: { fontSize: 14, color: Colors.textMuted },
  stepLabelHighlight: { color: Colors.textPrimary, fontWeight: '600' },
  statusTextDone: { fontSize: 12, color: Colors.accentBar, fontWeight: '600' },
  activeStatusRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  statusTextActive: { fontSize: 12, color: Colors.primary, fontWeight: '600' },
  statusTextPending: { fontSize: 12, color: Colors.textMuted },
  errorCard: {
    width: '100%',
    marginTop: 18,
    padding: 16,
    borderRadius: 14,
    backgroundColor: Colors.warningBg,
    alignItems: 'center',
  },
  errorMessage: {
    fontSize: 13,
    color: Colors.warningText,
    textAlign: 'center',
    marginBottom: 12,
  },
  retryBtn: {
    backgroundColor: Colors.primary,
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 10,
  },
  retryBtnText: { color: Colors.primaryText, fontSize: 13, fontWeight: '600' },
  footer: {
    paddingHorizontal: 24,
    paddingBottom: 24,
    alignItems: 'center',
  },
  footerNote: {
    fontSize: 12,
    color: Colors.textMuted,
    textAlign: 'center',
    marginBottom: 12,
  },
  cancelBtn: { paddingVertical: 6, paddingHorizontal: 12 },
  cancelBtnText: { fontSize: 13, color: Colors.textSecondary, fontWeight: '600' },
});