import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from 'tailwindcss'
import autoprefixer from 'autoprefixer'
import path from 'node:path'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@ui': path.resolve(__dirname, '../../packages/ui/src/index.ts'),
    },
  },
  server: {
    port: 5173,
    strictPort: true,
    proxy: {
      '/v1': {
        target: 'http://127.0.0.1:3000',
        changeOrigin: true,
      },
    },
  },
  css: {
    postcss: {
      plugins: [tailwindcss(), autoprefixer()],
    },
  },
})
