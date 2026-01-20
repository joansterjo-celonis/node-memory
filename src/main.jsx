// src/main.jsx
// Entry point: boot the React app and surface any runtime errors.
import 'antd/dist/reset.css';
import React, { useEffect, useMemo, useState } from 'react';
import ReactDOM from 'react-dom/client';
import { App as AntApp, ConfigProvider, theme as antTheme } from 'antd';
import AnalysisApp from './app/AnalysisApp';

const baseAntTheme = {
  token: {
    colorPrimary: '#2563eb',
    colorInfo: '#2563eb'
  },
  components: {
    Button: { borderRadius: 10 },
    Card: { borderRadiusLG: 16 }
  }
};

const THEME_STORAGE_KEY = 'node-memory-theme';
const THEME_OPTIONS = new Set(['light', 'dark', 'auto']);

const getStoredThemePreference = () => {
  if (typeof window === 'undefined' || !window.localStorage) return 'auto';
  try {
    const raw = window.localStorage.getItem(THEME_STORAGE_KEY);
    if (!raw || !THEME_OPTIONS.has(raw)) return 'auto';
    return raw;
  } catch (err) {
    return 'auto';
  }
};

const getSystemTheme = () => {
  if (typeof window === 'undefined' || !window.matchMedia) return 'light';
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
};

const resolveTheme = (preference) => (preference === 'auto' ? getSystemTheme() : preference);

const Root = () => {
  const initialPreference = getStoredThemePreference();
  const [themePreference, setThemePreference] = useState(initialPreference);
  const [resolvedTheme, setResolvedTheme] = useState(() => resolveTheme(initialPreference));

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

  const resolvedAntTheme = useMemo(() => ({
    ...baseAntTheme,
    algorithm: resolvedTheme === 'dark' ? antTheme.darkAlgorithm : antTheme.defaultAlgorithm
  }), [resolvedTheme]);

  return (
    <ConfigProvider theme={resolvedAntTheme}>
      <AntApp>
        <AnalysisApp
          themePreference={themePreference}
          resolvedTheme={resolvedTheme}
          onThemeChange={setThemePreference}
        />
      </AntApp>
    </ConfigProvider>
  );
};

const showBootError = (msg) => {
  const el = document.getElementById('boot-error');
  if (!el) return;
  el.style.display = 'block';
  el.textContent = msg;
};

try {
  const root = ReactDOM.createRoot(document.getElementById('root'));
  root.render(
    <Root />
  );
} catch (err) {
  showBootError(`App failed to start: ${err?.message || err}`);
  console.error(err);
}
