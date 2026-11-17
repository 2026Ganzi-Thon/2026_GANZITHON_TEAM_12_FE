import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, SafeAreaView } from 'react-native';
import { Colors } from '../theme/tokens';
import HomeScreen from '../screens/home/HomeScreen';
import CalendarScreen from '../screens/calendar/CalendarScreen';
import CategoryEditScreen from '../screens/calendar/CategoryEditScreen';
import HrvMeasurementScreen from '../screens/checkin/HrvMeasurementScreen';

const TABS = [
  { key: 'home', label: '홈', icon: '⌂' },
  { key: 'calendar', label: '캘린더', icon: '📅' },
  { key: 'checkin', label: '측정', icon: '♡' },
  { key: 'reports', label: '리포트', icon: '📊' },
  { key: 'mypage', label: 'MY', icon: '👤' },
];

export default function MainTabNavigator({
  onOpenSafety,
  onBackToOnboarding,
  renderExtraTabs,
}) {
  const [activeTab, setActiveTab] = useState('home');
  const [editingEvent, setEditingEvent] = useState(null);
  const [calendarRefreshKey, setCalendarRefreshKey] = useState(0);
  const [homeBaseline, setHomeBaseline] = useState(null);
  const [latestMeasurement, setLatestMeasurement] = useState(null);

  // B2-1 카테고리 변경 풀스크린
  if (editingEvent) {
    return (
      <CategoryEditScreen
        event={editingEvent}
        onBack={() => setEditingEvent(null)}
        onSaved={() => {
          setEditingEvent(null);
          setCalendarRefreshKey((k) => k + 1);
        }}
      />
    );
  }

  return (
    <View style={styles.root}>
      {__DEV__ && onBackToOnboarding && (
        <View style={styles.devTopBar}>
          <TouchableOpacity onPress={onBackToOnboarding}>
            <Text style={styles.devTopBarText}>← [DEV] 온보딩(A1~A5)으로 돌아가기</Text>
          </TouchableOpacity>
        </View>
      )}

      <View style={styles.screenArea}>
        {activeTab === 'home' && (
          <HomeScreen
            onNavigateTab={(tabKey, extra) => {
              if (extra?.baseline) setHomeBaseline(extra.baseline);
              setActiveTab(tabKey);
            }}
            onOpenSafety={onOpenSafety}
          />
        )}

        {activeTab === 'calendar' && (
          <CalendarScreen
            refreshTrigger={calendarRefreshKey}
            onEditCategory={(ev) => setEditingEvent(ev)}
          />
        )}

        {activeTab === 'checkin' && (
          <HrvMeasurementScreen
            baseline={homeBaseline}
            onMeasurementSuccess={(res) => {
              setLatestMeasurement(res?.measurement || res);
              // B4 컨디션 체크 연결 전까지는 홈으로 복귀
              if (renderExtraTabs) {
                setActiveTab('condition_check');
              } else {
                setActiveTab('home');
              }
            }}
            onSkipToCondition={() => {
              setLatestMeasurement(null);
              if (renderExtraTabs) {
                setActiveTab('condition_check');
              } else {
                setActiveTab('home');
              }
            }}
          />
        )}

        {activeTab !== 'home' &&
          activeTab !== 'calendar' &&
          activeTab !== 'checkin' &&
          renderExtraTabs &&
          renderExtraTabs(activeTab, setActiveTab, { latestMeasurement })}
      </View>

      {/* 하단 탭 바 */}
      <SafeAreaView style={styles.tabBarSafe}>
        <View style={styles.tabBar}>
          {TABS.map((tab) => {
            const focused =
              activeTab === tab.key ||
              (tab.key === 'checkin' &&
                ['condition_check', 'breathing', 'today_result'].includes(activeTab));
            return (
              <TouchableOpacity
                key={tab.key}
                style={styles.tabItem}
                onPress={() => setActiveTab(tab.key)}
              >
                <Text style={[styles.tabIcon, focused && styles.tabIconFocused]}>
                  {tab.icon}
                </Text>
                <Text style={[styles.tabLabel, focused && styles.tabLabelFocused]}>
                  {tab.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.background },
  devTopBar: {
    backgroundColor: '#1E2522',
    paddingVertical: 6,
    paddingHorizontal: 14,
  },
  devTopBarText: {
    fontSize: 11,
    color: '#D0D7D4',
    fontWeight: '600',
  },
  screenArea: { flex: 1 },
  tabBarSafe: {
    backgroundColor: Colors.surface,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  tabBar: {
    flexDirection: 'row',
    height: 58,
    alignItems: 'center',
  },
  tabItem: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabIcon: { fontSize: 17, color: Colors.textMuted, marginBottom: 2 },
  tabIconFocused: { color: Colors.primary },
  tabLabel: { fontSize: 11, color: Colors.textMuted, fontWeight: '500' },
  tabLabelFocused: { color: Colors.primary, fontWeight: '700' },
});