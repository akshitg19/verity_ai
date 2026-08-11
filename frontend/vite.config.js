/* global process */

import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    {
      name: 'verify-vercel-production-api-base',
      config(_, { command }) {
        if (command !== 'build' || process.env.VERCEL_ENV !== 'production') return;
        const value = process.env.VITE_API_BASE_URL;
        if (!value) {
          throw new Error('VITE_API_BASE_URL is required for a production build.');
        }
        const parsed = new URL(value);
        if (parsed.protocol !== 'https:' || parsed.pathname.endsWith('/')) {
          throw new Error('VITE_API_BASE_URL must be an HTTPS URL without a trailing slash.');
        }
      },
    },
  ],
  server: {
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:8000',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ''),
      },
    },
  },
})
