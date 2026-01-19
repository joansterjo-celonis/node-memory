// src/main.jsx
// Entry point: boot the React app and surface any runtime errors.
import React from 'react';
import ReactDOM from 'react-dom/client';
import AnalysisApp from './app/AnalysisApp';

const showBootError = (msg) => {
  const el = document.getElementById('boot-error');
  if (!el) return;
  el.style.display = 'block';
  el.textContent = msg;
};

try {
  const root = ReactDOM.createRoot(document.getElementById('root'));
  root.render(<AnalysisApp />);
} catch (err) {
  showBootError(`App failed to start: ${err?.message || err}`);
  console.error(err);
}
