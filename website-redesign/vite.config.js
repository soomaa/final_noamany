import { resolve } from 'node:path';
import { defineConfig } from 'vite';

const apiTarget = process.env.VITE_API_TARGET || 'http://127.0.0.1:4000';

export default defineConfig({
  plugins: [{
    name: 'noamany-membership-clean-routes',
    configureServer(server) {
      server.middlewares.use((req, _res, next) => {
        const [pathname, query = ''] = String(req.url || '').split('?');
        if (/^\/memberships\/\d+$/.test(pathname)) req.url = `/membership.html?id=${pathname.split('/').pop()}${query ? `&${query}` : ''}`;
        if (pathname === '/membership-checkout') req.url = `/membership-checkout.html${query ? `?${query}` : ''}`;
        next();
      });
    },
  }],
  server: {
    proxy: {
      '/api': apiTarget,
      '/uploads': apiTarget,
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
        membership: resolve(import.meta.dirname, 'membership.html'),
        membershipCheckout: resolve(import.meta.dirname, 'membership-checkout.html'),
      },
    },
  },
});
