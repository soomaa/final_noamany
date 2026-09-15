import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const stylesheetUrl = new URL('../src/nav-unified.css', import.meta.url);

test('commerce header gives the logo a large dark, cropped brand surface', async () => {
  const css = await readFile(stylesheetUrl, 'utf8');

  assert.match(css, /\.commerce-header \.commerce-logo\s*\{[^}]*width:\s*172px/);
  assert.match(css, /\.commerce-header \.commerce-logo\s*\{[^}]*background:[^;}]*(?:rgba|linear-gradient)/);
  assert.match(css, /\.commerce-header \.commerce-logo\s*\{[^}]*overflow:\s*hidden/);
  assert.match(css, /\.commerce-header \.commerce-logo img\s*\{[^}]*width:\s*200px/);
  assert.match(css, /\.commerce-header \.commerce-logo img\s*\{[^}]*position:\s*absolute/);
  assert.match(css, /\.commerce-header \.commerce-logo img\s*\{[^}]*transform:\s*translate\(-50\.8%,-47\.5%\)/);
});

test('commerce logo remains prominent without crowding the mobile cart', async () => {
  const css = await readFile(stylesheetUrl, 'utf8');

  assert.match(css, /@media\(max-width:560px\)[\s\S]*?\.commerce-header \.commerce-logo\s*\{[^}]*width:\s*138px/);
  assert.match(css, /@media\(max-width:560px\)[\s\S]*?\.commerce-header \.commerce-logo img\s*\{[^}]*width:\s*160px/);
});
