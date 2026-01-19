// src/main.jsx
// Entry point: boot the React app and surface any runtime errors.
import 'antd/dist/reset.css';
import React from 'react';
import ReactDOM from 'react-dom/client';
import { App as AntApp, ConfigProvider } from 'antd';
import AnalysisApp from './app/AnalysisApp';

const antTheme = {
  token: {
    colorPrimary: '#2563eb',
    colorInfo: '#2563eb'
  },
  components: {
    Button: { borderRadius: 10 },
    Card: { borderRadiusLG: 16 }
  }
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
    <ConfigProvider theme={antTheme}>
      <AntApp>
        <AnalysisApp />
      </AntApp>
    </ConfigProvider>
  );
} catch (err) {
  showBootError(`App failed to start: ${err?.message || err}`);
  console.error(err);
}
