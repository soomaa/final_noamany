import { resolve } from 'node:path';
import { defineConfig } from 'vite';

export default defineConfig({
  server: {
    proxy: {
      '/api': 'http://127.0.0.1:4002',
      '/uploads': 'http://127.0.0.1:4002',
    },
  },
  build: {
    rollupOptions: {
      input: {
        main: resolve(import.meta.dirname, 'index.html'),
        shop: resolve(import.meta.dirname, 'shop.html'),
        product: resolve(import.meta.dirname, 'product.html'),
        checkout: resolve(import.meta.dirname, 'checkout.html'),
        account: resolve(import.meta.dirname, 'account.html'),
        careers: resolve(import.meta.dirname, 'careers.html'),
        subscribe: resolve(import.meta.dirname, 'subscribe.html'),
      },
    },
  },
});
