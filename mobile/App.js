import React, { useState, useEffect } from 'react';
import { Platform, Text, TextInput } from 'react-native';
import OnboardingNavigator from './src/navigation/OnboardingNavigator';
import MainTabNavigator from './src/navigation/MainTabNavigator';

function injectWebFonts() {
  if (Platform.OS !== 'web' || typeof document === 'undefined') return;
  if (document.getElementById('custom-cafe24-fonts')) return;

  const style = document.createElement('style');
  style.id = 'custom-cafe24-fonts';
  style.textContent = `
    @font-face {
      font-family: 'Cafe24Decobox';
      src: url('https://cdn.jsdelivr.net/gh/projectnoonnu/2405-3@1.1/Cafe24Decobox.woff2') format('woff2');
      font-weight: normal;
      font-display: swap;
    }
    @font-face {
      font-family: 'Cafe24ProSlim';
      src: url('https://cdn.jsdelivr.net/gh/projectnoonnu/2511-1@1.0/Cafe24PROSlim-Light.woff2') format('woff2');
      font-weight: 300;
      font-display: swap;
    }
    @font-face {
      font-family: 'Cafe24ProSlim';
      src: url('https://cdn.jsdelivr.net/gh/projectnoonnu/2511-1@1.0/Cafe24PROSlim-Regular.woff2') format('woff2');
      font-weight: 400;
      font-display: swap;
    }
    @font-face {
      font-family: 'Cafe24ProSlim';
      src: url('https://cdn.jsdelivr.net/gh/projectnoonnu/2511-1@1.0/Cafe24PROSlim-Bold.woff2') format('woff2');
      font-weight: 700;
      font-display: swap;
    }
    body, input, textarea, button {
      font-family: 'Cafe24ProSlim', -apple-system, BlinkMacSystemFont, sans-serif;
    }
  `;
  document.head.appendChild(style);
}

function applyGlobalTextFont() {
  const defaultFontStyle = { fontFamily: 'Cafe24ProSlim' };

  if (Text.defaultProps == null) Text.defaultProps = {};
  Text.defaultProps.style = [defaultFontStyle, Text.defaultProps.style];

  if (TextInput.defaultProps == null) TextInput.defaultProps = {};
  TextInput.defaultProps.style = [defaultFontStyle, TextInput.defaultProps.style];
}

injectWebFonts();
applyGlobalTextFont();

export default function App() {
  const [isOnboardingDone, setIsOnboardingDone] = useState(false);

  useEffect(() => {
    injectWebFonts();
  }, []);

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