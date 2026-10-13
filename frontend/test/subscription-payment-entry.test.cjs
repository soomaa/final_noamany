const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const sourcePath = path.resolve(__dirname, '../src/pages/club/subscriptions.tsx');

test('new subscriptions collect payment and show the server-generated receipt number', () => {
  const source = fs.readFileSync(sourcePath, 'utf8');
  const paymentSection = source.slice(source.indexOf("<DialogFormSection title={ct('subscriptions.sectionPayment')}") );

  assert.match(source, /const \[receiptNumber, setReceiptNumber\] = useState\(''\);/);
  assert.match(source, /value=\{editSubId \? receiptNumber : 'يُحدد تلقائيًا عند الحفظ'\}\s+disabled/);
  assert.doesNotMatch(source, /receiptNumber:\s*receiptNumber\.trim\(\)/);
  assert.match(source, /const automaticPaidAmount = String\(formNetValue\);/);
  assert.match(paymentSection, /className="grid gap-4 md:grid-cols-3"/);
});

test('subscription member search uses the lightweight member lookup and does not allow split payments', () => {
  const search = fs.readFileSync(path.resolve(__dirname, '../src/lib/club-member-search.ts'), 'utf8');
  const subscriptions = fs.readFileSync(sourcePath, 'utf8');

  assert.match(search, /'\/club-members\/lookup'/);
  assert.doesNotMatch(search, /'\/club\/search'/);
  assert.equal(
    (subscriptions.match(/allowMultipleMethods=\{false\}/g) ?? []).length,
    3,
    'new, installment, and renewal payment dialogs must each keep one payment method',
  );
});
