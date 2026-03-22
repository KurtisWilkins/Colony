import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Vite configuration for IoT Platform frontend
export default defineConfig({
  plugins: [react()],

  // Proxy API requests to the backend server during development
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:5000',
        changeOrigin: true,
      },
    },
  },

  // Build output directory
  build: {
    outDir: 'dist',
  },
});
