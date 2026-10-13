const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const frontendRoot = path.resolve(__dirname, '..');
const readSource = (relativePath) => fs.readFileSync(path.join(frontendRoot, relativePath), 'utf8');

test('member locker action opens a prefilled locker subscription form', () => {
  const memberDetails = readSource('src/pages/club/member-details.tsx');
  const lockersPage = readSource('src/pages/club/lockers.tsx');

  assert.match(
    memberDetails,
    /navigate\('\/club\/lockers', \{ state: \{ openSubOnMount: true, prefillMember: data\.member \} \}\)/,
  );
  assert.match(lockersPage, /const location = useLocation\(\);/);
  assert.match(lockersPage, /const lockerSubscriptionPrefill = location\.state as LockerSubscriptionPrefill \| null;/);
  assert.match(lockersPage, /useState\(!!openSubOnMount \|\| !!lockerSubscriptionPrefill\)/);
  assert.match(lockersPage, /memberCode: lockerSubscriptionPrefill\?\.memberCode \?\? ''/);
  assert.match(lockersPage, /customerName: lockerSubscriptionPrefill\?\.name \?\? ''/);
  assert.match(lockersPage, /gender: lockerSubscriptionPrefill\?\.gender \?\? 'male'/);
  assert.match(lockersPage, /gender: e\.target\.value as LockerSubscriptionPrefill\['gender'\]/);
});

test('locker subscription form uses branch-available lockers and subscription payment fields', () => {
  const lockers = readSource('src/pages/club/lockers.tsx');

  assert.match(lockers, /l\.is_available && l\.main_branch_id === form\.mainBranchId/);
  assert.match(lockers, /const \{ data: employees = \[\] \} = useQuery/);
  assert.match(lockers, /<Label>الموظف<\/Label>/);
  assert.match(lockers, /receiptNumber:/);
  assert.match(lockers, /receiptNumber: form\.receiptNumber\.trim\(\) \|\| undefined/);
});

test('locker subscription form supports member search, calculated dates, and each discount mode', () => {
  const lockers = readSource('src/pages/club/lockers.tsx');

  assert.match(lockers, /import \{ MemberSearchCombobox \} from '@\/components\/club\/member-search-combobox';/);
  assert.match(lockers, /<MemberSearchCombobox/);
  assert.doesNotMatch(lockers, /queryKey: \['club-members', 'locker-member-search', memberSearch\]/);
  assert.doesNotMatch(lockers, /api\.get<ClubMemberListItem\[]>\('\/club-members\/lookup'/);
  const ts = require('typescript');
  const vm = require('node:vm');
  const parsed = ts.createSourceFile('lockers.tsx', lockers, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let selectMember;
  function visit(node) {
    if ((ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) && node.tagName.getText(parsed) === 'MemberSearchCombobox') {
      const prop = node.attributes.properties.find((item) => ts.isJsxAttribute(item) && item.name.text === 'onSelect');
      if (prop?.initializer && ts.isJsxExpression(prop.initializer)) selectMember = prop.initializer.expression;
    }
    ts.forEachChild(node, visit);
  }
  visit(parsed);
  assert.ok(selectMember, 'Locker member selector has a selection handler');
  let selectedForm;
  const choose = vm.runInNewContext(`(${selectMember.getText(parsed)})`, {
    setSelectedMember() {},
    setForm(update) { selectedForm = update({ mainBranchId: 4, subBranchId: 4 }); },
  });
  choose({ branchId: 3, memberCode: 'OLD23', name: 'Existing member', gender: 'female' });
  assert.equal(selectedForm.mainBranchId, 4, 'Preserves the selected operation branch');
  assert.equal(selectedForm.subBranchId, 4);
  assert.equal(selectedForm.memberCode, 'OLD23');
  assert.match(lockers, /<Label>الفرع<\/Label>/);
  assert.match(lockers, /<Label>اسم العميل<\/Label>/);
  assert.match(lockers, /<Label>عدد الأيام<\/Label>/);
  assert.match(lockers, /<Label>تاريخ النهاية<\/Label>/);
  assert.match(lockers, /discountMode: 'none' as SubscriptionDiscountMode/);
  assert.match(lockers, /<option value="none">بدون خصم<\/option>/);
  assert.match(lockers, /<option value="fixed">مبلغ<\/option>/);
  assert.match(lockers, /<option value="percentage">نسبة<\/option>/);
  assert.match(lockers, /<option value="code">كود خصم<\/option>/);
  assert.match(lockers, /<option value="points">خصم نقاط<\/option>/);
  assert.match(lockers, /const discountAmount =/);
  assert.match(lockers, /const subscriptionEndDate =/);
  assert.match(lockers, /<Label>السعر<\/Label>/);
  assert.match(lockers, /disabled=\{!form\.mainBranchId\}/);
  assert.match(lockers, /onClear=\{\(\) => \{/);
  assert.doesNotMatch(lockers, /<Label>الخصم المحسوب<\/Label>/);
  assert.doesNotMatch(lockers, /<Label>\{ct\('lockers\.memberId'\)\}<\/Label>/);
  assert.match(lockers, /const \[paidAmountEdited, setPaidAmountEdited\] = useState\(false\);/);
  assert.match(lockers, /paidAmount: String\(netDue\)/);
});

test('member InBody action opens the measurement modal for the current member', () => {
  const memberDetails = readSource('src/pages/club/member-details.tsx');
  const createDialogPath = path.join(frontendRoot, 'src/pages/club/fitness/inbody-create-dialog.tsx');

  assert.match(memberDetails, /import \{ InbodyCreateDialog \} from '\.\/fitness\/inbody-create-dialog';/);
  assert.match(memberDetails, /const \[inbodyDialogOpen, setInbodyDialogOpen\] = useState\(false\);/);
  assert.match(memberDetails, /onClick=\{\(\) => setInbodyDialogOpen\(true\)\}/);
  assert.match(memberDetails, /<InbodyCreateDialog open=\{inbodyDialogOpen\} onOpenChange=\{setInbodyDialogOpen\} member=\{member\} \/>/);
  assert.ok(fs.existsSync(createDialogPath), 'the reusable InBody create dialog must exist');
  const createDialog = fs.readFileSync(createDialogPath, 'utf8');
  assert.match(createDialog, /member: ClubMemberListItem;/);
  assert.match(createDialog, /<Input readOnly value=\{member\.name\} \/>/);
  assert.match(createDialog, /memberId: member\.id,/);
});

test('member receipt action opens a prefilled receipt modal and saves against the current member', () => {
  const memberDetails = readSource('src/pages/club/member-details.tsx');
  const createDialogPath = path.join(frontendRoot, 'src/pages/club/subscription-receipt-create-dialog.tsx');

  assert.match(memberDetails, /import \{ SubscriptionReceiptCreateDialog \} from '\.\/subscription-receipt-create-dialog';/);
  assert.match(memberDetails, /const \[receiptDialogOpen, setReceiptDialogOpen\] = useState\(false\);/);
  assert.match(memberDetails, /onClick=\{\(\) => setReceiptDialogOpen\(true\)\}/);
  assert.match(memberDetails, /<SubscriptionReceiptCreateDialog open=\{receiptDialogOpen\} onOpenChange=\{setReceiptDialogOpen\} member=\{member\} \/>/);
  assert.ok(fs.existsSync(createDialogPath), 'the reusable receipt create dialog must exist');

  const createDialog = fs.readFileSync(createDialogPath, 'utf8');
  assert.match(createDialog, /<Input readOnly value=\{member\.memberCode\} \/>/);
  assert.match(createDialog, /<Input readOnly value=\{member\.name\} \/>/);
  assert.match(createDialog, /<Input readOnly value=\{member\.phone \?\? '—'\} \/>/);
  assert.match(createDialog, /memberId: member\.id,/);
  assert.match(createDialog, /receiptDate,/);
  assert.match(createDialog, /paymentMethod,/);
  assert.match(createDialog, /await api\.post(?:<ReceiptSaveResponse>)?\('\/club-receipts',/);
  assert.match(createDialog, /branchId: member\.branchId,/);
  assert.match(createDialog, /receiptNumber: string/);
  assert.match(createDialog, /تم حفظ الإيصال برقم \$\{createdReceipt\.receiptNumber\}/);
});

test('receipt modal does not reserve a database receipt number before saving', () => {
  const createDialog = readSource('src/pages/club/subscription-receipt-create-dialog.tsx');
  const receiptsController = readSource('../backend/src/modules/club-subscriptions/club-receipts.controller.ts');

  assert.doesNotMatch(createDialog, /club-receipts\/next-number/);
  assert.match(createDialog, /value="يُنشأ تلقائيًا عند الحفظ"/);
  // Old API consumers may still request a non-reserving preview. The modal
  // itself must never call it; actual numbering happens when the receipt saves.
  assert.match(receiptsController, /@Get\('next-number'\)[\s\S]*?return this\.service\.nextNumber\(\);/);
  const crud = readSource('../backend/src/modules/club-subscriptions/club-receipts-crud.service.ts');
  const preview = crud.slice(crud.indexOf('async nextNumber()'), crud.indexOf('async list('));
  assert.match(preview, /await this\.receipts\.nextReceiptNumber\(\)/);
  assert.doesNotMatch(preview, /\.(?:create|update|delete|upsert|executeRaw)\s*\(/);
});

test('member subscription actions preselect the subscription in their target workspaces', () => {
  const memberDetails = readSource('src/pages/club/member-details.tsx');
  const subscriptions = readSource('src/pages/club/subscriptions.tsx');
  const refunds = readSource('src/pages/club/subscription-refunds.tsx');

  assert.match(memberDetails, /openSubscriptionAction\(subscription, 'unfreeze'\)/);
  assert.match(memberDetails, /refunds\?memberId=\$\{subscription\.memberId \?\? member\.id\}&subscriptionId=\$\{subscription\.id\}/);
  assert.match(subscriptions, /type WorkspaceSubscriptionAction = 'renew' \| 'freeze' \| 'unfreeze' \| 'transfer';/);
  assert.match(subscriptions, /workspaceAction === 'renew'/);
  assert.match(subscriptions, /openRenew\(subscription\);/);
  assert.match(subscriptions, /workspaceAction === 'transfer'/);
  assert.match(subscriptions, /setTransferOpen\(true\);/);
  assert.match(subscriptions, /workspaceAction === 'unfreeze'/);
  assert.match(subscriptions, /void unfreeze\(subscription\.id\);/);
  assert.match(refunds, /const prefilledMemberId = Number\(new URLSearchParams\(location\.search\)\.get\('memberId'\)\);/);
  assert.match(refunds, /setSelectedSubId\(prefilledSubscriptionId\);/);
});
