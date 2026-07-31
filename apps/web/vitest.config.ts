import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: ['tests/setup.ts'],
    include: [
      'tests/**/*.spec.tsx',
      'tests/**/*.spec.ts',
      'src/**/*.test.tsx',
      'src/**/*.test.ts',
    ],
    globals: true,
    // Several UI performance and navigation assertions are intentionally
    // tight. Keep them isolated from cross-file CPU contention on shared CI.
    maxWorkers: 1,
  },
})
