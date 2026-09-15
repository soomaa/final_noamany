import assert from 'node:assert/strict';
import fs from 'node:fs';

const source = fs.readFileSync(new URL('../src/pages/cafe/reports.tsx', import.meta.url), 'utf8');

// JWT contract: 0=male, 1=female, -1/unset=all. These expressions make a
// reversed 1/2 UI mapping fail before it can send an invalid audience request.
assert.match(source, /man_women_type === 0 \? 'male' : user\?\.man_women_type === 1 \? 'female' : null/);
assert.match(source, /const effectiveGender = lockedAudience \?\? gender/);
assert.match(source, /gender: effectiveGender === 'all' \? undefined : effectiveGender/);
assert.doesNotMatch(source, /man_women_type === 1 \? 'male'/);
assert.doesNotMatch(source, /man_women_type === 2/);
