const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

test('reception shows a renewed package once; older ended ones open from «الاشتراكات السابقة»', () => {
  const src = fs.readFileSync(path.resolve(__dirname, '../src/pages/club/reception.tsx'), 'utf8');
  // Same package = same plan id, else private package id, else same name.
  assert.match(src, /sub\.subscriptionTypeId != null \? `t\$\{sub\.subscriptionTypeId\}`/);
  // Only ENDED subscriptions that are not the latest of their package are folded away.
  assert.match(src, /isExpiredLikeSubscription\(sub\) && latest\.get\(keyOf\(sub\)\)\?\.id !== sub\.id/);
  assert.match(src, /visibleSubs = notManuallyHidden\.filter\(\(sub\) => showOlderSubs \|\| !supersededSubIds\.has\(sub\.id\)\)/);
  assert.match(src, /ui\('الاشتراكات السابقة'\)/);
  // The toggle resets for each member.
  assert.match(src, /useEffect\(\(\) => \{ setShowOlderSubs\(false\); \}, \[member\?\.id\]\)/);
});
