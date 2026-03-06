import { create } from 'zustand';

type ThemeId = 'titan-dark' | 'neon' | 'material-you';

interface ThemeState {
  theme: ThemeId;
  setTheme: (t: ThemeId) => void;
}

const STORAGE_KEY = 'tpos-theme';

function applyTheme(t: ThemeId) {
  document.documentElement.setAttribute('data-theme', t);
}

const saved = (typeof localStorage !== 'undefined'
  ? localStorage.getItem(STORAGE_KEY) as ThemeId | null
  : null) || 'titan-dark';
applyTheme(saved);

export const useThemeStore = create<ThemeState>((set) => ({
  theme: saved,
  setTheme: (t) => {
    applyTheme(t);
    localStorage.setItem(STORAGE_KEY, t);
    set({ theme: t });
  },
}));

export const THEMES: { id: ThemeId; name: string; accent: string; bg: string; text: string }[] = [
  { id: 'titan-dark', name: 'Titan Dark', accent: '#6c5ce7', bg: '#0f0f23', text: '#e0e0e0' },
  { id: 'neon', name: 'Neon', accent: '#00f0ff', bg: '#050510', text: '#e8f0ff' },
  { id: 'material-you', name: 'Material You', accent: '#6750a4', bg: '#fffbfe', text: '#1c1b1f' },
];
