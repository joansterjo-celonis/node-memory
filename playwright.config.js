import { defineConfig } from '@playwright/test';

if (process.env.NO_COLOR && process.env.FORCE_COLOR) {
  delete process.env.NO_COLOR;
}

const baseURL = process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:5174';
const useWebServer = process.env.PW_NO_WEBSERVER !== '1';

export default defineConfig({
  testDir: './tests/e2e',
  ...(useWebServer
    ? {
        webServer: {
          command: 'npm run dev -- --host',
          url: baseURL,
          reuseExistingServer: true,
          timeout: 60000
        }
      }
    : {}),
  use: {
    baseURL
  }
});
