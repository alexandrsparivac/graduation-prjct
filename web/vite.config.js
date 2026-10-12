import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    fs: { allow: ['..'] },
    proxy: {
      // Generations under a saturated free tier run for minutes; the default
      // 120s proxy timeout would sever them mid-flight.
      '/api': { target: 'http://localhost:3000', changeOrigin: true, timeout: 300000 },
    },
  },
});
