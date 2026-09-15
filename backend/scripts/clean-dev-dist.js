/* eslint-disable no-console */
const fs = require('fs');
const path = require('path');

const distRoot = path.resolve(__dirname, '..', 'dist');
for (const relative of ['src', 'tsconfig.tsbuildinfo']) {
  fs.rmSync(path.join(distRoot, relative), { recursive: true, force: true });
}
console.log('Cleared stale Nest development output.');