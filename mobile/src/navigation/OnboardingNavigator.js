import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ActivityIndicator,
  StyleSheet,
  ScrollView,
} from 'react-native';
import { apiRequest, refreshCsrfToken, ApiError } from '../api/client';
import { Colors, Fonts } from '../theme/tokens';
import WelcomeScreen from '../screens/onboarding/WelcomeScreen';
import ProfileConsentScreen from '../screens/onboarding/ProfileConsentScreen';
import CbiAssessmentScreen from '../screens/onboarding/CbiAssessmentScreen';
import LifestyleSettingScreen from '../screens/onboarding/LifestyleSettingScreen';
import ScheduleAnalyzingScreen from '../screens/onboarding/ScheduleAnalyzingScreen';
import ScheduleReportScreen from '../screens/onboarding/ScheduleReportScreen';

const DEV_STEPS = [
  { key: 'WELCOME', label: 'A1 시작' },
  { key: 'PROFILE', label: 'A2 동의' },
  { key: 'CBI', label: 'A3 CBI' },
  { key: 'LIFESTYLE', label: 'A4 생활' },
  { key: 'ANALYZING', label: '분석중' },
  { key: 'SCHEDULE_REPORT', label: 'A5 리포트' },
  { key: 'DONE', label: '메인으로' },
];

export default function OnboardingNavigator({ onCompleteOnboarding, onOpenSafety }) {
  const [loading, setLoading] = useState(true);
  const [me, setMe] = useState(null);
  const [step, setStep] = useState('WELCOME');
  const [authError, setAuthError] = useState(false);

  const bootstrapAuth = useCallback(async () => {
    setLoading(true);
    try {
      await refreshCsrfToken();
      if (typeof window !== 'undefined' && window.location?.search?.includes('authError=true')) {
        setAuthError(true);
      }

      const userData = await apiRequest('/api/me');
      setMe(userData);

      if (userData.onboardingStep === 'DONE') {
        onCompleteOnboarding(userData);
      } else {
        setStep(userData.onboardingStep || 'PROFILE');
      }
    } catch (err) {
      // 401 미인증 또는 로컬 개발 중 백엔드 미연결 시 시작 화면으로 이동
      if (err instanceof ApiError && err.status === 401) {
        setMe(null);
      }
      setStep('WELCOME');
    } finally {
      setLoading(false);
    }
  }, [onCompleteOnboarding]);

  useEffect(() => {
    bootstrapAuth();
  }, [bootstrapAuth]);

  const handleDevStepChange = (targetStep) => {
    if (targetStep === 'DONE') {
      onCompleteOnboarding(me || { nickname: '' });
    } else {
      setStep(targetStep);
    }
  };

  if (loading) {
    return (
      <View style={styles.loader}>
        <ActivityIndicator size="large" color={Colors.primary} />
      </View>
    );
  }

  return (
    <View style={styles.root}>
      {/* 개발 환경 전용 단계 빠른 이동 바 */}
      {__DEV__ && (
        <View style={styles.devBar}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.devBarScroll}>
            {DEV_STEPS.map((item) => {
              const active = step === item.key;
              return (
                <TouchableOpacity
                  key={item.key}
                  style={[styles.devChip, active && styles.devChipActive]}
                  onPress={() => handleDevStepChange(item.key)}
                >
                  <Text style={[styles.devChipText, active && styles.devChipTextActive]}>
                    {item.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>
      )}

      {step === 'WELCOME' && (
        <WelcomeScreen
          authError={authError}
          onAuthSuccess={bootstrapAuth}
          onDevSkip={() => setStep('PROFILE')}
        />
      )}

      {step === 'PROFILE' && (
        <ProfileConsentScreen
          userEmail={me?.email}
          initialNickname={me?.nickname}
          onBack={() => setStep('WELCOME')}
          onCompleted={(nextStep) => {
            if (nextStep === 'DONE') onCompleteOnboarding(me);
            else setStep(nextStep);
          }}
        />
      )}

      {step === 'CBI' && (
        <CbiAssessmentScreen
          round="INITIAL"
          onOpenSafety={onOpenSafety}
          onCompleted={(nextStep) => {
            if (nextStep === 'DONE') onCompleteOnboarding(me);
            else setStep(nextStep);
          }}
        />
      )}

      {step === 'LIFESTYLE' && (
        <LifestyleSettingScreen
          onBack={() => setStep('CBI')}
          onSaved={() => setStep('ANALYZING')}
        />
      )}

      {step === 'ANALYZING' && (
        <ScheduleAnalyzingScreen
          onCancel={() => setStep('LIFESTYLE')}
          onNeedConsentStep={() => setStep('PROFILE')}
          onSuccess={() => setStep('SCHEDULE_REPORT')}
        />
      )}

      {step === 'SCHEDULE_REPORT' && (
        <ScheduleReportScreen
          onBack={() => setStep('LIFESTYLE')}
          onCompleteOnboarding={(completeRes) => {
            onCompleteOnboarding({ ...me, ...completeRes });
          }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  loader: {
    flex: 1,
    backgroundColor: Colors.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  devBar: {
    backgroundColor: '#1E2522',
    paddingVertical: 6,
    paddingHorizontal: 10,
  },
  devBarScroll: {
    gap: 6,
    alignItems: 'center',
  },
  devChip: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
  devChipActive: {
    backgroundColor: Colors.accentBar,
  },
  devChipText: {
    fontSize: 11,
    color: '#D0D7D4',
    fontWeight: '600',
  },
  devChipTextActive: {
    color: '#FFFFFF',
  },
});