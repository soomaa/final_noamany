const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

test('the receipts page uses the member-details receipt form with member lookup', () => {
  const dialog = fs.readFileSync(
    path.resolve(__dirname, '../src/pages/club/subscription-receipt-create-dialog.tsx'),
    'utf8',
  );
  const receiptsPage = fs.readFileSync(
    path.resolve(__dirname, '../src/pages/club/subscriptions.tsx'),
    'utf8',
  );

  assert.match(dialog, /member\?: ClubMemberListItem/);
  assert.match(dialog, /<MemberSearchCombobox/);
  assert.match(receiptsPage, /<SubscriptionReceiptCreateDialog open=\{receiptOpen\}/);
});
