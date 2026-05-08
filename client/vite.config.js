import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, ".", "");

  return {
    plugins: [react()],
    build: {
      // Output to dist/ which Capacitor reads
      outDir: 'dist',
    },
    server: {
      port: 5173,
      proxy: {
        // Proxy API calls in dev so Capacitor + browser both work
        '/api': {
          target: env.VITE_API_URL || 'http://localhost:4000',
          changeOrigin: true,
        },
      },
    },
  };
})

