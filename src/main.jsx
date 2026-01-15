// src/main.jsx
// Entry point: boot the React app and surface any runtime errors.
const React = window.React;
const ReactDOM = window.ReactDOM;

const showBootError = (msg) => {
  const el = document.getElementById('boot-error');
  if (!el) return;
  el.style.display = 'block';
  el.textContent = msg;
};

if (!React || !ReactDOM) {
  showBootError('React failed to load. Please refresh and ensure CDN access is available.');
} else if (!window.AnalysisApp) {
  showBootError('App failed to load. Check script order or console for errors.');
} else {
  try {
    const root = ReactDOM.createRoot(document.getElementById('root'));
    root.render(<window.AnalysisApp />);
  } catch (err) {
    showBootError(`App failed to start: ${err?.message || err}`);
    console.error(err);
  }
}
