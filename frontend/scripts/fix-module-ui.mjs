#!/usr/bin/env node
/** Fix module-scope ui() calls by replacing with uiStatic() and adding import. */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');

function walk(d, out = []) {
  for (const f of fs.readdirSync(d)) {
    const p = path.join(d, f);
    if (fs.statSync(p).isDirectory()) walk(p, out);
    else if (p.endsWith('.tsx') || p.endsWith('.ts')) out.push(p);
  }
  return out;
}

const files = [...walk(path.join(root, 'src/pages')), ...walk(path.join(root, 'src/components'))];

for (const file of files) {
  let content = fs.readFileSync(file, 'utf8');
  const fnIdx = content.search(/export function /);
  if (fnIdx === -1) continue;

  const head = content.slice(0, fnIdx);
  const tail = content.slice(fnIdx);
  if (!head.includes("ui('")) continue;

  let newHead = head.replace(/\bui\(/g, 'uiStatic(');
  if (newHead === head) continue;

  if (!newHead.includes("from '@/lib/ui-static'")) {
    const lastImport = newHead.lastIndexOf('\nimport ');
    const importLine = "import { uiStatic } from '@/lib/ui-static';\n";
    if (lastImport !== -1) {
      const end = newHead.indexOf('\n', lastImport + 1);
      newHead = newHead.slice(0, end + 1) + importLine + newHead.slice(end + 1);
    } else {
      newHead = importLine + newHead;
    }
  }

  fs.writeFileSync(file, newHead + tail, 'utf8');
  console.log('fixed module scope:', path.relative(root, file));
}
