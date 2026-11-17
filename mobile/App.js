import React, { useState } from 'react';
import OnboardingNavigator from './src/navigation/OnboardingNavigator';
import MainTabNavigator from './src/navigation/MainTabNavigator';

export default function App() {
  const [isOnboardingDone, setIsOnboardingDone] = useState(false);

  if (isOnboardingDone) {
    return (
      <MainTabNavigator
        onOpenSafety={() => {
          // 추후 C3 안전 안내 화면 연결
        }}
        onBackToOnboarding={() => setIsOnboardingDone(false)}
      />
    );
  }

  return (
    <OnboardingNavigator
      onCompleteOnboarding={() => setIsOnboardingDone(true)}
      onOpenSafety={() => {
        // 추후 C3 안전 안내 화면 연결
      }}
    />
  );
}