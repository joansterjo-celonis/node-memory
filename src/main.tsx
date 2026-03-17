import './index.css';
import React, { useEffect, useState } from 'react';
import ReactDOM from 'react-dom/client';
import AnalysisApp from './app/AnalysisApp';

const THEME_STORAGE_KEY = 'node-memory-theme';
const THEME_OPTIONS = new Set(['light', 'dark', 'auto']);

type ThemePreference = 'light' | 'dark' | 'auto';

const getStoredThemePreference = (): ThemePreference => {
  if (typeof window === 'undefined' || !window.localStorage) return 'auto';
  try {
    const raw = window.localStorage.getItem(THEME_STORAGE_KEY);
    if (!raw || !THEME_OPTIONS.has(raw)) return 'auto';
    return raw as ThemePreference;
  } catch {
    return 'auto';
  }
};

const getSystemTheme = (): 'light' | 'dark' => {
  if (typeof window === 'undefined' || !window.matchMedia) return 'light';
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
};

const resolveTheme = (preference: ThemePreference): 'light' | 'dark' =>
  preference === 'auto' ? getSystemTheme() : preference;

const Root = () => {
  const initialPreference = getStoredThemePreference();
  const [themePreference, setThemePreference] = useState<ThemePreference>(initialPreference);
  const [resolvedTheme, setResolvedTheme] = useState<'light' | 'dark'>(() => resolveTheme(initialPreference));

  useEffect(() => {
    if (typeof window === 'undefined' || !window.localStorage) return;
    window.localStorage.setItem(THEME_STORAGE_KEY, themePreference);
  }, [themePreference]);

  useEffect(() => {
    const updateTheme = () => setResolvedTheme(resolveTheme(themePreference));
    updateTheme();

    if (typeof window === 'undefined' || !window.matchMedia) return undefined;
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    if (media.addEventListener) {
      media.addEventListener('change', updateTheme);
      return () => media.removeEventListener('change', updateTheme);
    }
    media.addListener(updateTheme);
    return () => media.removeListener(updateTheme);
  }, [themePreference]);

  useEffect(() => {
    if (typeof document === 'undefined') return;
    const root = document.documentElement;
    root.classList.toggle('dark', resolvedTheme === 'dark');
    root.style.colorScheme = resolvedTheme;
  }, [resolvedTheme]);

  return (
    <AnalysisApp
      themePreference={themePreference}
      resolvedTheme={resolvedTheme}
      onThemeChange={setThemePreference}
    />
  );
};

const showBootError = (msg: string) => {
  const el = document.getElementById('boot-error');
  if (!el) return;
  el.style.display = 'block';
  el.textContent = msg;
};

try {
  const root = ReactDOM.createRoot(document.getElementById('root')!);
  root.render(
    <Root />
  );
} catch (err: any) {
  showBootError(`App failed to start: ${err?.message || err}`);
  console.error(err);
}
