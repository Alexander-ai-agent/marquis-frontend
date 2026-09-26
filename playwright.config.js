// @ts-check
import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  use: {
    baseURL: process.env.MARQUIS_URL || 'http://localhost:4173',
    // Optional: point at an existing Chromium instead of `playwright install`.
    launchOptions: process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH, args: ['--no-sandbox'] } : {},
  },
  webServer: {
    command: 'python -m http.server 4173',
    url: 'http://localhost:4173',
    reuseExistingServer: true,
  },
});
