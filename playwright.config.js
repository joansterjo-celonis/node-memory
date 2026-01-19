import { defineConfig } from '@playwright/test';

const baseURL = process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:5174';
const useWebServer = process.env.PW_NO_WEBSERVER !== '1';

export default defineConfig({
  testDir: './tests/e2e',
  ...(useWebServer
    ? {
        webServer: {
          command: 'python3 -m http.server 5174 --directory .',
          url: baseURL,
          reuseExistingServer: true,
          timeout: 30000
        }
      }
    : {}),
  use: {
    baseURL
  }
});
