import React, { useState } from 'react';
import ConditionScreen from '../screens/checkin/ConditionScreen';
import BreathingScreen from '../screens/checkin/BreathingScreen';
import ResultScreen from '../screens/checkin/ResultScreen';
import ReportScreen from '../screens/reports/ReportScreen';
import MyPageScreen from '../screens/mypage/MyPageScreen';
import GlossaryScreen from '../screens/glossary/GlossaryScreen';
import TermPopup from '../components/TermPopup';

/**
 * MainTabNavigator 가 home·calendar·checkin 말고 다른 탭을 만났을 때 그리는 화면들.
 * MainTabNavigator 는 이미 condition_check / breathing / today_result 키를 알고 있다.
 *
 * 아침 체크 흐름: 측정(checkin) → 컨디션 → 호흡 → 결과
 * 결과 값(TodayResult)은 컨디션 저장 응답으로 받아 결과 화면까지 들고 간다.
 * 호흡은 건너뛸 수 있어서 결과 계산은 컨디션 저장 시점이다(API 명세 6절).
 */
export default function ExtraTabs({
  activeTab,
  setActiveTab,
  homeBaseline,
  todayResult: todayResultFromTab,
  onOpenSafety,
  onLoggedOut,
}) {
  const [todayResult, setTodayResult] = useState(null);
  const [reportTermKey, setReportTermKey] = useState(null);

  switch (activeTab) {
    case 'condition_check':
      return (
        <ConditionScreen
          baseline={homeBaseline}
          onBack={() => setActiveTab('checkin')}
          onNext={(result) => {
            setTodayResult(result);
            setActiveTab('breathing');
          }}
        />
      );

    case 'breathing':
      return (
        <BreathingScreen
          baseline={homeBaseline}
          onDone={() => setActiveTab('today_result')}
        />
      );

    case 'today_result':
      return (
        <ResultScreen
          result={todayResult ?? todayResultFromTab}
          onHome={() => {
            setTodayResult(null);
            setActiveTab('home');
          }}
          onOpenGlossary={() => setActiveTab('glossary')}
        />
      );

    case 'reports':
      return (
        <>
          <ReportScreen onOpenTerm={(key) => setReportTermKey(key)} onOpenSafety={onOpenSafety} />
          <TermPopup
            termKey={reportTermKey}
            onClose={() => setReportTermKey(null)}
            onOpenGlossary={() => setActiveTab('glossary')}
          />
        </>
      );

    case 'mypage':
      return (
        <MyPageScreen
          onOpenSafety={onOpenSafety}
          onOpenGlossary={() => setActiveTab('glossary')}
          onLoggedOut={onLoggedOut}
        />
      );

    case 'glossary':
      return <GlossaryScreen onBack={() => setActiveTab('mypage')} />;

    default:
      return null;
  }
}