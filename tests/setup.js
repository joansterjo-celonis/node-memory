import React from 'react';
import ReactDOM from 'react-dom/client';
import '@testing-library/jest-dom/vitest';

const root = globalThis.window || globalThis;
root.React = React;
root.ReactDOM = ReactDOM;

const noopIcon = () => null;
root.Icons = {
  Database: noopIcon,
  Settings: noopIcon,
  Play: noopIcon,
  BarChart3: noopIcon,
  TrendingUp: noopIcon,
  Hash: noopIcon,
  Gauge: noopIcon,
  TableIcon: noopIcon,
  CheckSquare: noopIcon
};

const storage = new Map();
root.localStorage = {
  getItem: (key) => (storage.has(key) ? storage.get(key) : null),
  setItem: (key, value) => { storage.set(key, String(value)); },
  removeItem: (key) => { storage.delete(key); },
  clear: () => { storage.clear(); }
};

await import('../src/utils/ingest.js');
await import('../src/utils/nodeUtils.js');
