import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from 'tailwindcss'
import autoprefixer from 'autoprefixer'
import tailwindConfig from './tailwind.config.js'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
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
      // Import the config as a Vite config dependency so changes to semantic
      // tokens restart the dev CSS pipeline instead of leaving a stale
      // Tailwind context that rejects newly added utilities used by @apply.
      plugins: [tailwindcss(tailwindConfig), autoprefixer()],
    },
  },
})
