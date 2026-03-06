export function getTelegramWebApp() {
  const tg = (window as unknown as Record<string, unknown>).Telegram as
    | { WebApp?: TelegramWebApp }
    | undefined;
  return tg?.WebApp ?? null;
}

interface SafeAreaInset {
  top: number;
  bottom: number;
  left: number;
  right: number;
}

interface TelegramWebApp {
  initData: string;
  initDataUnsafe: {
    user?: {
      id: number;
      first_name: string;
      last_name?: string;
      username?: string;
    };
  };
  ready: () => void;
  expand: () => void;
  close: () => void;
  requestFullscreen?: () => void;
  disableVerticalSwipes?: () => void;
  enableVerticalSwipes?: () => void;
  isVerticalSwipesEnabled?: boolean;
  isFullscreen?: boolean;
  safeAreaInset?: SafeAreaInset;
  contentSafeAreaInset?: SafeAreaInset;
  HapticFeedback: {
    impactOccurred: (style: 'light' | 'medium' | 'heavy' | 'rigid' | 'soft') => void;
    notificationOccurred: (type: 'error' | 'success' | 'warning') => void;
    selectionChanged: () => void;
  };
  themeParams: Record<string, string>;
  colorScheme: 'light' | 'dark';
  onEvent?: (event: string, callback: () => void) => void;
  offEvent?: (event: string, callback: () => void) => void;
}

export function hapticFeedback(type: 'light' | 'medium' | 'heavy' = 'medium') {
  const tg = getTelegramWebApp();
  try {
    tg?.HapticFeedback?.impactOccurred(type);
  } catch {
    // not in Telegram context
  }
}

export function hapticNotification(type: 'success' | 'error' | 'warning' = 'success') {
  const tg = getTelegramWebApp();
  try {
    tg?.HapticFeedback?.notificationOccurred(type);
  } catch {
    // not in Telegram context
  }
}

export function initTelegramApp() {
  const tg = getTelegramWebApp();
  if (!tg) return;

  tg.ready();
  tg.expand();
  try { tg.requestFullscreen?.(); } catch { /* not supported */ }
  try { tg.disableVerticalSwipes?.(); } catch { /* not supported */ }

  applySafeAreaInsets(tg);

  tg.onEvent?.('fullscreenChanged', () => applySafeAreaInsets(tg));
  tg.onEvent?.('safeAreaChanged', () => applySafeAreaInsets(tg));
  tg.onEvent?.('contentSafeAreaChanged', () => applySafeAreaInsets(tg));
}

function applySafeAreaInsets(tg: TelegramWebApp) {
  const root = document.documentElement;
  const sa = tg.safeAreaInset;
  const csa = tg.contentSafeAreaInset;

  const top = Math.max(sa?.top || 0, csa?.top || 0);
  const bottom = Math.max(sa?.bottom || 0, csa?.bottom || 0);
  const left = Math.max(sa?.left || 0, csa?.left || 0);
  const right = Math.max(sa?.right || 0, csa?.right || 0);

  root.style.setProperty('--tg-safe-top', `${top}px`);
  root.style.setProperty('--tg-safe-bottom', `${bottom}px`);
  root.style.setProperty('--tg-safe-left', `${left}px`);
  root.style.setProperty('--tg-safe-right', `${right}px`);
}

