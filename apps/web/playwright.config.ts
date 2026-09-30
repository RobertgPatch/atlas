import { defineConfig, devices } from '@playwright/test'

const apiPort = 3100
const webPort = 5174
const apiBaseUrl = `http://127.0.0.1:${apiPort}`
const webBaseUrl = `http://127.0.0.1:${webPort}`
const databaseUrl = process.env.ATLAS_E2E_DATABASE_URL
  ?? 'postgres://postgres:postgres@127.0.0.1:15432/atlas_statement_e2e'

const database = new URL(databaseUrl)
const databaseHost = database.hostname.toLowerCase().replace(/^\[|\]$/g, '')
if (
  !['postgres:', 'postgresql:'].includes(database.protocol)
  || !['localhost', '::1'].includes(databaseHost) && !/^127(?:\.\d{1,3}){3}$/.test(databaseHost)
) {
  throw new Error('ATLAS_E2E_DATABASE_URL must identify a dedicated loopback PostgreSQL database')
}

export default defineConfig({
  testDir: './e2e',
  outputDir: './test-results/liquidity-statements',
  fullyParallel: false,
  workers: 1,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: [['list'], ['html', { outputFolder: './playwright-report', open: 'never' }]],
  use: {
    baseURL: webBaseUrl,
    trace: 'off',
    screenshot: 'only-on-failure',
    video: 'off',
    ...devices['Desktop Chrome'],
  },
  webServer: [
    {
      command: 'npm run --workspace=api dev',
      cwd: '../..',
      url: `${apiBaseUrl}/internal/readiness`,
      reuseExistingServer: false,
      timeout: 120_000,
      env: {
        ...process.env,
        NODE_ENV: 'test',
        ATLAS_RUNTIME: 'local',
        DATABASE_URL: databaseUrl,
        ATLAS_TEST_DATABASE_URL: databaseUrl,
        PORT: String(apiPort),
        WEB_ORIGIN: webBaseUrl,
        K1_EXTRACTOR: 'stub',
        K1_OBJECT_STORE: 'local',
        K1_QUEUE: 'local',
        K1_AWS_INGESTION_ENABLED: 'false',
        MARKET_DATA_PROVIDER: 'none',
        STORAGE_ROOT: '.storage/e2e-statement',
        ADMIN_EMAIL: process.env.ATLAS_E2E_ADMIN_EMAIL ?? 'tpatch@jspllc.com',
        ADMIN_PASSWORD: process.env.ATLAS_E2E_ADMIN_PASSWORD ?? 'Synthetic statement e2e password 2026!',
        LIQUIDITY_XLSX_ENABLED: 'true',
        LIQUIDITY_CSV_FILES_PER_30_DAYS: '1000',
        LIQUIDITY_CSV_CAPABILITIES_PER_HOUR: '100',
        LIQUIDITY_CSV_MAX_OUTSTANDING_CAPABILITIES: '100',
        ABUSE_HEAVY_READ_USER_REQUESTS: '1000',
        ABUSE_HEAVY_READ_SESSION_REQUESTS: '1000',
        ABUSE_HEAVY_READ_TENANT_REQUESTS: '1000',
        ABUSE_HEAVY_READ_GLOBAL_REQUESTS: '1000',
        ABUSE_ADMIN_WRITE_USER_REQUESTS: '1000',
        ABUSE_ADMIN_WRITE_SESSION_REQUESTS: '1000',
        ABUSE_ADMIN_WRITE_TENANT_REQUESTS: '1000',
        ABUSE_ADMIN_WRITE_GLOBAL_REQUESTS: '1000',
        ABUSE_AUTH_ACCOUNT_REQUESTS: '100',
        ABUSE_AUTH_SOURCE_REQUESTS: '100',
        ABUSE_AUTH_DURABLE_SOURCE_REQUESTS: '100',
        ABUSE_AUTH_GLOBAL_REQUESTS: '100',
        ABUSE_AUTH_GLOBAL_DAILY_REQUESTS: '1000',
      },
    },
    {
      command: `npm run --workspace=web dev -- --host 127.0.0.1 --port ${webPort}`,
      cwd: '../..',
      url: webBaseUrl,
      reuseExistingServer: false,
      timeout: 120_000,
      env: {
        ...process.env,
        VITE_API_PROXY_TARGET: apiBaseUrl,
      },
    },
  ],
})
