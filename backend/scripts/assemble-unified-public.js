const { cpSync, existsSync, mkdirSync, renameSync, rmSync, writeFileSync } = require('fs');
const { join, resolve } = require('path');

const backendRoot = resolve(__dirname, '..');
const workspaceRoot = resolve(backendRoot, '..');
const adminDist = join(workspaceRoot, 'frontend', 'dist');
const websiteDist = join(workspaceRoot, 'website-redesign', 'dist');
const publicDir = join(backendRoot, 'public');

if (!existsSync(adminDist) || !existsSync(websiteDist)) {
  throw new Error('Build both frontend and website-redesign before assembling the unified public folder.');
}

rmSync(publicDir, { recursive: true, force: true });
mkdirSync(publicDir, { recursive: true });

// Admin assets first; its shell is renamed so the public website can own `/`.
cpSync(adminDist, publicDir, { recursive: true });
renameSync(join(publicDir, 'index.html'), join(publicDir, 'system.html'));

// Website files own index.html, shop.html, account.html, and the other public pages.
cpSync(websiteDist, publicDir, { recursive: true, force: true });

writeFileSync(
  join(publicDir, '.noamany-unified-build'),
  `${new Date().toISOString()}\nwebsite=/\nmanagement=/login\n`,
);

console.log('Unified public build ready: / -> website, /login -> management system.');
