import { defineConfig, devices } from '@playwright/test'

// Synthetic API responses exercise the real browser renderer without a DB.
export default defineConfig({
  testDir: './e2e',
  testMatch: 'investment-tracker-pdf.spec.ts',
  outputDir: './test-results/investment-tracker-pdf',
  workers: 1,
  use: { baseURL: 'http://127.0.0.1:5175', ...devices['Desktop Chrome'] },
  webServer: {
    command: 'npm run dev -- --host 127.0.0.1 --port 5175',
    url: 'http://127.0.0.1:5175',
    reuseExistingServer: !process.env.CI,
  },
})
