import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    env: {
      // API tests must never inherit deployment storage/queue/provider settings
      // from a developer's local .env file.
      K1_OBJECT_STORE: 'local',
      K1_QUEUE: 'local',
      K1_EXTRACTOR: 'stub',
    },
    include: ['tests/**/*.test.ts'],
    testTimeout: 10_000,
  },
})
