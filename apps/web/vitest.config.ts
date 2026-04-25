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
  },
})
