const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

// Node 22.18+/24 strips TypeScript types, so the dependency-free builder is imported as is.
const load = () => import(path.resolve(__dirname, '../src/lib/whatsapp-message.ts'));

const base = {
  id: 1,
  subscriptionNumber: 'SUB-1',
  subscriptionType: 'شهر',
  registrationDate: '2026-11-01',
  subscriptionStartDate: '2026-11-01',
  subscriptionEndDate: '2026-11-25',
  status: 'active',
  subscriptionValue: 500,
  discountEnabled: false,
  discountValue: 0,
  paidAmount: 500,
  remainingAmount: 0,
  receiptNumber: null,
  assignedStaffName: null,
};
const context = { today: '2026-11-18', gymName: 'النعماني', memberName: 'أحمد', memberCode: '77' };

test('a line whose variable is empty or zero is dropped', async () => {
  const { renderWhatsAppTemplate } = await load();
  const text = renderWhatsAppTemplate('أهلًا {{member_name}}\nالمتبقي: {{remaining_amount}}\nشكرًا', {
    member_name: 'أحمد',
    remaining_amount: '',
  });
  assert.equal(text, 'أهلًا أحمد\nشكرًا');
});

test('zero amounts and counts never reach the message', async () => {
  const { subscriptionMessage, DEFAULT_WHATSAPP_TEMPLATES } = await load();
  const text = subscriptionMessage(DEFAULT_WHATSAPP_TEMPLATES.current_subscription_item, base, {
    ...context,
    extras: { invitationsLeft: 0, inbodyLeft: 0, spaLeft: 0 },
  });
  assert.doesNotMatch(text, /(^|\s)0(\s|$)/);
  assert.doesNotMatch(text, /المتبقي عليك|الخصم|الصافي|الدعوات|InBody|SPA|الحصص|{{/);
  assert.match(text, /الأيام المتبقية: 7/);
  assert.match(text, /المدفوع: 500 ج\.م/);
});

test('remaining amount, invitations, sessions and discount show when non-zero', async () => {
  const { subscriptionMessage, DEFAULT_WHATSAPP_TEMPLATES } = await load();
  const text = subscriptionMessage(
    DEFAULT_WHATSAPP_TEMPLATES.current_subscription_item,
    { ...base, discountEnabled: true, discountValue: 100, paidAmount: 300, remainingAmount: 100, isLinkedToSessions: true, sessionsCount: 12, sessionsUsed: 4 },
    { ...context, extras: { invitationsLeft: 2, inbodyLeft: 1 } },
  );
  assert.match(text, /الخصم: 100 ج\.م/);
  assert.match(text, /الصافي: 400 ج\.م/);
  assert.match(text, /المتبقي عليك: 100 ج\.م/);
  assert.match(text, /الحصص المتبقية: 8/);
  assert.match(text, /الدعوات المتبقية: 2/);
  assert.match(text, /جلسات InBody المتبقية: 1/);
});

test('expired subscriptions say since when, not a negative days-left', async () => {
  const { subscriptionMessage, DEFAULT_WHATSAPP_TEMPLATES } = await load();
  const text = subscriptionMessage(DEFAULT_WHATSAPP_TEMPLATES.current_subscription_item, { ...base, subscriptionEndDate: '2026-11-08' }, context);
  assert.match(text, /الحالة: منتهي/);
  assert.match(text, /انتهى من: 10 يوم/);
  assert.doesNotMatch(text, /الأيام المتبقية/);
});

test('several subscriptions go in one message, in the chosen order', async () => {
  const { memberSubscriptionsMessage, DEFAULT_WHATSAPP_TEMPLATES } = await load();
  const text = memberSubscriptionsMessage(
    DEFAULT_WHATSAPP_TEMPLATES,
    { name: 'أحمد', memberCode: '77' },
    [base, { ...base, id: 2, subscriptionNumber: 'SUB-2', subscriptionType: 'برايفت', remainingAmount: 250 }],
    { today: '2026-11-18', gymName: 'النعماني', extras: { 2: { invitationsLeft: 3 } } },
  );
  assert.match(text, /^أهلًا أحمد/);
  assert.match(text, /كود العضو: 77/);
  assert.ok(text.indexOf('SUB-1') < text.indexOf('SUB-2'));
  assert.equal((text.match(/رقم الاشتراك:/g) ?? []).length, 2);
  assert.match(text, /\*برايفت\*[\s\S]*الدعوات المتبقية: 3/);
  assert.match(text, /المتبقي عليك: 250 ج\.م/);
  assert.equal(memberSubscriptionsMessage(DEFAULT_WHATSAPP_TEMPLATES, { name: 'x', memberCode: '1' }, [], { today: '2026-11-18', gymName: 'g' }), '');
});

test('expiring reminder drops «فاضل 0 يوم» on the last day', async () => {
  const { subscriptionMessage, DEFAULT_WHATSAPP_TEMPLATES } = await load();
  const lastDay = subscriptionMessage(DEFAULT_WHATSAPP_TEMPLATES.expiring, { ...base, subscriptionEndDate: '2026-11-18' }, context);
  assert.doesNotMatch(lastDay, /فاضل/);
  const soon = subscriptionMessage(DEFAULT_WHATSAPP_TEMPLATES.expiring, base, context);
  assert.match(soon, /فاضل 7 يوم/);
});

test('saved templates override defaults; invalid ones fall back', async () => {
  const { mergeWhatsAppTemplates, DEFAULT_WHATSAPP_TEMPLATES, validWhatsAppTemplate } = await load();
  const merged = mergeWhatsAppTemplates({ expiring: 'باقي {{days_left}}', expired: '{{password}}', subscription: 5 });
  assert.equal(merged.expiring, 'باقي {{days_left}}');
  assert.equal(merged.expired, DEFAULT_WHATSAPP_TEMPLATES.expired);
  assert.equal(merged.subscription, DEFAULT_WHATSAPP_TEMPLATES.subscription);
  for (const text of Object.values(DEFAULT_WHATSAPP_TEMPLATES)) assert.ok(validWhatsAppTemplate(text));
});

test('frontend and backend agree on template kinds and variables', async () => {
  const { WHATSAPP_KINDS, WHATSAPP_FIELDS } = await load();
  const backend = fs.readFileSync(
    path.resolve(__dirname, '../../backend/src/modules/club-subscriptions/club-whatsapp-templates.service.ts'),
    'utf8',
  );
  const list = (name) => [...backend.match(new RegExp(`${name} = \\[([\\s\\S]*?)\\] as const`))[1].matchAll(/'([a-z_]+)'/g)].map((m) => m[1]);
  assert.deepEqual(list('WHATSAPP_TEMPLATE_KINDS'), [...WHATSAPP_KINDS]);
  assert.deepEqual(list('WHATSAPP_TEMPLATE_FIELDS'), [...WHATSAPP_FIELDS]);
});

test('operation values: payment shows amount and receipt, transfer drops a zero refund', async () => {
  const { subscriptionMessage, DEFAULT_WHATSAPP_TEMPLATES, messageAmount } = await load();
  const payment = subscriptionMessage(DEFAULT_WHATSAPP_TEMPLATES.payment, { ...base, paidAmount: 300, remainingAmount: 200 }, context, {
    payment_amount: messageAmount(300), receipt_number: 'REC-9',
  });
  assert.match(payment, /المبلغ المسدّد الآن: 300 ج\.م/);
  assert.match(payment, /رقم الإيصال: REC-9/);
  assert.match(payment, /المتبقي عليك: 200 ج\.م/);
  const transfer = subscriptionMessage(DEFAULT_WHATSAPP_TEMPLATES.transfer, base, context, {
    previous_package: 'شهر', payment_amount: messageAmount(150), refund_amount: messageAmount(0),
  });
  assert.match(transfer, /من باقة: شهر/);
  assert.match(transfer, /المبلغ المحصّل الآن: 150 ج\.م/);
  assert.doesNotMatch(transfer, /المسترد/);
});

test('package details: offer and allowances shown, zero allowances left out', async () => {
  const { DEFAULT_WHATSAPP_TEMPLATES, packageMessage } = await load();
  const text = packageMessage(DEFAULT_WHATSAPP_TEMPLATES.package_details, {
    name: '٣ شهور', price: 1500, days: 90, invitationsCount: 3, inbodyCount: 0, includesSpa: true, spaCount: 0,
    isLinkedToFreeze: true, freezeTotalDays: 15, freezeDays: null, walletPoints: 0,
    promoLive: true, promoPrice: 1200, promoLabel: '+15 أيام إضافية', promoEndsOn: '2026-12-31',
  }, { today: '2026-11-19', gymName: 'النعماني', memberName: 'منى' });
  assert.match(text, /أهلًا منى/);
  assert.match(text, /السعر: 1,500 ج\.م/);
  assert.match(text, /العرض الخاص: 1,200 ج\.م · \+15 أيام إضافية · لحد/);
  assert.match(text, /المدة: 90 يوم/);
  assert.match(text, /الدعوات: 3/);
  assert.match(text, /التجميد: 15 يوم/);
  assert.doesNotMatch(text, /InBody|SPA|نقاط/);
});

test('package details: a sessions package without an offer drops the offer line', async () => {
  const { DEFAULT_WHATSAPP_TEMPLATES, packageMessage } = await load();
  const text = packageMessage(DEFAULT_WHATSAPP_TEMPLATES.package_details, {
    name: 'برايفت', price: 1100, days: 30, isLinkedToSessions: true, sessionsCount: 12, promoLive: false,
  }, { today: '2026-11-19', gymName: 'النعماني' });
  assert.match(text, /المدة: 12 حصة خلال 30 يوم/);
  assert.doesNotMatch(text, /العرض الخاص|أهلًا {2}/);
});
