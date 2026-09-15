import assert from 'node:assert/strict'; import { readFile } from 'node:fs/promises'; import test from 'node:test';
test('feedback report locks employee audience and sends it to the API', async()=>{const s=await readFile(new URL('../src/pages/cafe/item-feedback-report.tsx',import.meta.url),'utf8');assert.match(s,/man_women_type === 0 \? 'male'/);assert.match(s,/disabled=\{!!lockedGender\}/);assert.match(s,/gender: effectiveGender/);});

test('feedback report renders an explicit retryable error state', async()=>{const s=await readFile(new URL('../src/pages/cafe/item-feedback-report.tsx',import.meta.url),'utf8');assert.match(s,/isError/);assert.match(s,/<ErrorState/);assert.match(s,/onRetry=\{\(\) => void refetch\(\)\}/);});
