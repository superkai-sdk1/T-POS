import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { registerSW } from 'virtual:pwa-register'
import './index.css'
import './store/theme'
import App from './App'

// Register service worker with auto-update
const updateSW = registerSW({
  immediate: true,
  onNeedRefresh() {
    // New content available — reload immediately
    updateSW(true);
  },
  onOfflineReady() {
    console.log('[SW] App ready for offline use');
  },
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

