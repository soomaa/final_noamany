import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined;
          if (id.includes('exceljs')) return 'export-excel';
          if (id.includes('recharts') || id.includes('d3-')) return 'charts';
          if (id.includes('@dnd-kit')) return 'drag-drop';
          if (id.includes('@radix-ui')) return 'radix-ui';
          if (id.includes('@tanstack')) return 'tanstack';
          if (id.includes('lucide-react')) return 'icons';
          if (id.includes('/motion/') || id.includes('framer-motion')) return 'motion';
          return undefined;
        },
      },
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: process.env.PORT ? Number(process.env.PORT) : 5173,
    proxy: {
      '/api': {
        target: process.env.VITE_API_TARGET || 'http://localhost:4000',
        changeOrigin: true,
      },
      '/uploads': {
        target: process.env.VITE_API_TARGET || 'http://localhost:4000',
        changeOrigin: true,
      },
    },
  },
});
