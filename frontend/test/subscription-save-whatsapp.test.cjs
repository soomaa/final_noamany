const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const read = (file) => fs.readFileSync(path.resolve(__dirname, '../src', file), 'utf8');

test('every subscription operation has «حفظ وإرسال واتساب» with its own template (like Meta Fit)', () => {
  const page = read('pages/club/subscriptions.tsx');
  for (const [kind, save] of [['payment', 'pay'], ['transfer', 'saveTransfer'], ['freeze', 'submitFreeze'], ['renewal', 'submitRenew']]) {
    assert.match(page, new RegExp(`saveAndWhatsApp\\.run\\('${kind}', ${save}\\)`), kind);
  }
  assert.match(page, /saveAndWhatsApp\.run\('subscription', saveSub/);
  assert.match(page, /saveAndWhatsApp\.sendNow\('unfreeze', id\)/);
  // Each save records what to send only after it succeeded.
  assert.match(page, /saveAndWhatsApp\.target\(selectedId, \{ payment_amount: messageAmount\(result\.paymentAmount \?\? amount\), receipt_number: result\.receiptNumber \?\? '' \}\)/);
  assert.match(page, /saveAndWhatsApp\.target\(transferred\.destination_subscription_id/);
  assert.match(page, /previous_package: transferPreview\.sourceType/);
  assert.equal((page.match(/حفظ وإرسال واتساب/g) ?? []).length >= 5, true);
});

test('reception renewal has «حفظ وإرسال واتساب» too', () => {
  const reception = read('pages/club/reception.tsx');
  assert.match(reception, /saveAndWhatsApp\.run\('renewal', submitRenew, member\?\.phone \?\? null\)/);
  assert.match(reception, /saveAndWhatsApp\.target\(renewed\?\.subscription\?\.id \?\? renewSubId/);
});

test('the shared hook reserves the tab inside the click and opens nothing when the save fails', () => {
  const hook = read('hooks/use-whatsapp-templates.ts');
  const run = hook.slice(hook.indexOf('run: async'), hook.indexOf('sendNow:'));
  assert.ok(run.indexOf("window.open('about:blank'") < run.indexOf('await save()'));
  assert.match(run, /if \(!target\) \{\s+tab\?\.close\(\);\s+return;/);
});
