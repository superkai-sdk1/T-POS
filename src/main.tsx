import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { registerSW } from 'virtual:pwa-register'
import './index.css'
import App from './App'
import { ErrorBoundary } from './components/ui/ErrorBoundary'
import { ConfigGuard } from './components/ConfigGuard'

// Block system back/forward swipe gestures in PWA (iOS Safari, Android Chrome)
const EDGE_ZONE_PX = 20;
history.pushState({ tpos: true }, '', location.href);
window.addEventListener('popstate', () => {
  history.pushState({ tpos: true }, '', location.href);
});
document.addEventListener('touchstart', (e: TouchEvent) => {
  const x = e.touches[0]?.pageX ?? 0;
  const w = window.innerWidth;
  if (x <= EDGE_ZONE_PX || x >= w - EDGE_ZONE_PX) e.preventDefault();
}, { passive: false, capture: true });

// Register service worker with auto-update
const updateSW = registerSW({
  immediate: true,
  onNeedRefresh() {
    // New content available — reload immediately
    updateSW(true);
  },
  onOfflineReady() {
    // App ready for offline use
  },
});

// Fix for iOS PWA virtual keyboard shifting the viewport
// When an input loses focus (keyboard dismisses) and another input doesn't grab it,
// we force the window to scroll back up, removing the black void.
window.addEventListener('focusout', (e) => {
  const isFocusingAnotherInput =
    e.relatedTarget &&
    ['INPUT', 'TEXTAREA', 'SELECT'].includes((e.relatedTarget as HTMLElement).tagName);

  if (!isFocusingAnotherInput) {
    setTimeout(() => {
      window.scrollTo({ top: 0, left: 0, behavior: 'smooth' });
    }, 50);
  }
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ConfigGuard>
      <ErrorBoundary>
        <App />
      </ErrorBoundary>
    </ConfigGuard>
  </StrictMode>,
)

