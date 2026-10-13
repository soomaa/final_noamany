import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: process.env.PORT ? Number(process.env.PORT) : 5173,
    proxy: {
      '/Api/members': {
        target: process.env.VITE_API_TARGET || 'http://127.0.0.1:4002',
        changeOrigin: true,
      },
      '/api': {
        target: process.env.VITE_API_TARGET || 'http://127.0.0.1:4002',
        changeOrigin: true,
      },
      '/uploads': {
        target: process.env.VITE_API_TARGET || 'http://127.0.0.1:4002',
        changeOrigin: true,
      },
    },
  },
});
