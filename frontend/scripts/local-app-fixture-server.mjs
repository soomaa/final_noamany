import { createServer as createHttpServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer as createViteServer } from 'vite';

/** Serve built assets unchanged: Vite's dev transforms distort bundle profiling. */
export async function createFixtureServer(staticRoot) {
  if (!staticRoot) return createViteServer({
    root: fileURLToPath(new URL('..', import.meta.url)),
    server: { host: '127.0.0.1', port: 0 },
  });
  const root = resolve(staticRoot);
  const types = { '.html':'text/html', '.js':'text/javascript', '.css':'text/css', '.json':'application/json',
    '.png':'image/png', '.jpg':'image/jpeg', '.jpeg':'image/jpeg', '.svg':'image/svg+xml',
    '.woff':'font/woff', '.woff2':'font/woff2', '.ico':'image/x-icon' };
  const httpServer = createHttpServer(async (request, response) => {
    try {
      const pathname = decodeURIComponent(new URL(request.url, 'http://127.0.0.1').pathname);
      const path = resolve(root, `.${pathname}`);
      if (path !== root && !path.startsWith(root + sep)) { response.writeHead(403).end(); return; }
      const file = extname(path) ? path : resolve(root, 'index.html');
      response.setHeader('Content-Type', types[extname(file)] || 'application/octet-stream');
      response.setHeader('Cache-Control', 'no-store');
      response.end(await readFile(file));
    } catch { response.writeHead(404).end(); }
  });
  return {
    httpServer,
    listen: () => new Promise(resolve => httpServer.listen(0, '127.0.0.1', resolve)),
    close: () => new Promise((resolve, reject) => httpServer.close(error => error ? reject(error) : resolve())),
  };
}
