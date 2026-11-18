import { Alert, Platform } from 'react-native';

/**
 * 안내·확인 창.
 *
 * react-native-web 의 Alert.alert 는 빈 함수라 웹에서는 아무것도 뜨지 않는다.
 * 그래서 확인 창이 안 뜨고 요청도 안 나가는 문제가 있었다.
 * 웹에서는 브라우저 기본 창(window.alert / window.confirm)을 쓰고,
 * 네이티브에서는 지금까지처럼 Alert.alert 를 쓴다.
 */

const isWeb = Platform.OS === 'web';

/** 알림 한 줄. 제목은 네이티브에서만 쓰이고 웹에서는 본문 앞에 붙는다. */
export function showAlert(title, message) {
  const body = message ?? title;
  if (isWeb) {
    window.alert(message ? `${title}\n\n${message}` : body);
    return;
  }
  Alert.alert(title, message);
}

/**
 * 확인 창. 사용자가 "확인"을 눌렀을 때만 onConfirm 을 부른다.
 * @param {string} title
 * @param {string} message
 * @param {() => void} onConfirm
 * @param {{confirmText?: string, cancelText?: string, destructive?: boolean}} [opts]
 */
export function showConfirm(title, message, onConfirm, opts = {}) {
  const { confirmText = '확인', cancelText = '취소', destructive = false } = opts;
  if (isWeb) {
    if (window.confirm(message ? `${title}\n\n${message}` : title)) onConfirm?.();
    return;
  }
  Alert.alert(title, message, [
    { text: cancelText, style: 'cancel' },
    { text: confirmText, style: destructive ? 'destructive' : 'default', onPress: onConfirm },
  ]);
}
